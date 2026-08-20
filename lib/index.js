/**
 * dsh-usage-stats — host half. Aggregates token usage from every session's
 * durable log (the `assistant/message` events carry `usage` accounting plus
 * provider/model provenance) and serves read-only /api/dsh-usage-stats/*
 * routes for the browser settings page (用量统计). The browser half
 * (./client) registers the settings section with the heatmap, the 24-hour
 * token chart, and the per-model breakdown.
 *
 * Besides the DSH session log, the plugin also reports the local opencode
 * (Go CLI / desktop) usage: /api/dsh-usage-stats/opencode reads the opencode
 * SQLite database (<data>/opencode.db) read-only and folds the `session`
 * table (tokens_* columns + cost + model + time_created) into the same day /
 * model buckets the settings page renders, so the 用量统计 page's bottom
 * panel shows opencode subscription usage alongside the DSH usage. The
 * official quota (/api/dsh-usage-stats/opencode-go) covers both logins the
 * CLI supports: `opencode-go` (OpenCode Go subscription) and `opencode`
 * (OpenCode Zen, pay-as-you-go). Both keys are sent to the one official
 * usage endpoint opencode.ai serves; Zen falls back to the local database
 * only when the endpoint rejects the key.
 *
 * Performance model (fixed for slow page loads):
 *   - The corpus is aggregated into per-session contributions that are kept
 *     in memory AND persisted to <DSH_HOME>/storages/usage-stats-corpus.json,
 *     so a server restart does not force a cold full scan.
 *   - Refresh is INCREMENTAL: a cheap fingerprint (file size + mtime) of each
 *     session's persisted log tells us which sessions actually changed; only
 *     changed/new sessions are re-read via sessionQuery.readSession(). Totals
 *     are then folded in memory (milliseconds), never by re-reading the whole
 *     corpus.
 *   - A background interval keeps the corpus warm, and the server-local
 *     timezone seeds the buckets, so the first request after open is served
 *     from warm memory instead of blocking on a multi-second scan.
 *   - A request never blocks longer than MAX_WAIT_MS on a refresh: if a cold
 *     scan is still running it is served the current snapshot with `stale:true`
 *     and the UI can refresh once more shortly after.
 *
 * Day/week keys follow the browser's UTC offset so the heatmap days match the
 * user's calendar (`tz` query param, minutes as UTC - local). `?fresh=1`
 * forces an incremental rescan. No dsh source changes.
 */
import { mkdir, readFile, rename, stat, writeFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** Stable cordis plugin name (row id `usage-stats`). */
export const name = 'usage-stats'

/** Services required before the surfaces can mount (timer for the warm loop). */
export const inject = ['sessionQuery', 'webServer', 'timer']

/** Serving a snapshot older than this counts as stale (ms). */
const CACHE_TTL_MS = 60 * 1000
/** Background keep-fresh cadence (ms). */
const SYNC_INTERVAL_MS = 30 * 1000
/** Upper bound a request waits on a refresh before serving current data (ms). */
const MAX_WAIT_MS = 1500
/** Concurrency for reading sessions during a refresh. */
const SCAN_CONCURRENCY = 6
/** Persisted corpus file name under <DSH_HOME>/storages. */
const STORE_FILE = 'usage-stats-corpus.json'

/* ------------------------------------------------------------------ */
/* opencode-go usage (opencode CLI / desktop SQLite database)          */
/* ------------------------------------------------------------------ */

/** Cache TTL for the opencode route (the DB changes while opencode runs). */
const OC_TTL_MS = 30 * 1000

/* ------------------------------------------------------------------ */
/* opencode subscription quota (opencode.ai/zen — Go / Zen)            */
/* ------------------------------------------------------------------ */

/** Official OpenCode usage endpoint (mirrors the website quota UI). It is the
 *  only public usage API opencode.ai serves — the `zen/` path segment is just
 *  URL namespacing (upstream route packages/console/app/src/routes/zen/go/
 *  v1/usage.ts). Both the Go and the Zen subscription keys are sent here. */
const GO_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'
/** Cache TTL for the official quota route (server-side data, 60s is fine). */
const GO_TTL_MS = 60 * 1000
/** Official USD limits per quota window for the Go subscription (used to
 *  derive $ from percent). Zen is pay-as-you-go and has no fixed limits. */
const GO_LIMITS = { rolling: 12, weekly: 30, monthly: 60 }

/** Cache for the official quota route (module-level, survives applies). */
let goCache = { at: 0, body: null }

/**
 * Read the opencode subscription API key from the local opencode auth file
 * (same login the opencode CLI/desktop uses), so the page needs no manual
 * key entry. Detects both subscriptions the CLI can log into:
 *   - `opencode-go` — OpenCode Go subscription (official quota API exists)
 *   - `opencode`    — OpenCode Zen (pay-as-you-go; provider id is `opencode`,
 *                     older files may use `zen` as the entry name)
 * Returns { kind: 'go' | 'zen', key }, or null when not logged in.
 */
async function readOpencodeSubscription() {
  const candidates = []
  if (typeof process.env.OPENCODE_AUTH === 'string' && process.env.OPENCODE_AUTH.trim()) {
    candidates.push(process.env.OPENCODE_AUTH.trim())
  }
  candidates.push(join(homedir(), '.local', 'share', 'opencode', 'auth.json'))
  if (typeof process.env.LOCALAPPDATA === 'string' && process.env.LOCALAPPDATA.trim()) {
    candidates.push(join(process.env.LOCALAPPDATA.trim(), 'opencode', 'auth.json'))
  }
  const entryNames = [['go', 'opencode-go'], ['zen', 'opencode'], ['zen', 'zen']]
  for (const p of candidates) {
    try {
      const raw = await readFile(p, 'utf8')
      const json = JSON.parse(raw)
      for (const [kind, entryName] of entryNames) {
        const entry = json && json[entryName]
        if (entry && typeof entry.key === 'string' && entry.key.length > 0) return { kind, key: entry.key }
      }
    } catch {
      // try the next candidate
    }
  }
  return null
}

/**
 * Query one official usage endpoint and normalize its three rolling
 * windows. Never exposes the API key to the browser.
 */
async function fetchOfficialQuota(key, url, subscription, limits, now) {
  try {
    const resp = await fetch(url, {
      headers: {
        authorization: 'Bearer ' + key,
        'x-api-key': key,
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    })
    const text = await resp.text()
    if (!resp.ok) {
      return { ok: false, available: false, subscription, reason: 'http-' + resp.status, error: 'opencode.ai returned HTTP ' + resp.status, syncedAt: now }
    }
    const json = JSON.parse(text)
    const usage = (json && json.usage) || {}
    const windows = {}
    for (const [k, meta] of [['rolling', '5小时用量'], ['weekly', '周用量'], ['monthly', '月用量']]) {
      const w = usage[k] || {}
      windows[k] = {
        title: meta,
        percent: typeof w.percent === 'number' ? w.percent : null,
        resetsAt: typeof w.resetsAt === 'string' ? w.resetsAt : null,
        status: w.status || null,
        limit: limits ? (limits[k] || null) : null,
      }
    }
    return { ok: true, available: true, official: true, subscription, source: url, windows, syncedAt: now }
  } catch (error) {
    return { ok: false, available: false, subscription, reason: 'network', error: String(error && error.message || error), syncedAt: now }
  }
}

/** Proxy the official usage endpoint; never exposes the API key to the browser. */
async function fetchSubscriptionQuota(fresh) {
  const now = Date.now()
  if (!fresh && goCache.body !== null && now - goCache.at < GO_TTL_MS) {
    return goCache.body
  }
  const sub = await readOpencodeSubscription()
  let body
  if (sub === null) {
    body = { ok: true, available: false, reason: 'no-key', syncedAt: now }
  } else if (sub.kind === 'go') {
    body = await fetchOfficialQuota(sub.key, GO_USAGE_URL, 'go', GO_LIMITS, now)
  } else {
    // Zen is pay-as-you-go (no fixed dollar caps), but opencode.ai's one
    // official usage endpoint answers subscription keys — the `zen/` path
    // segment is URL namespacing only. Try it first so Zen renders the same
    // official progress-bar cards as Go; when the endpoint rejects the key
    // (401/403/404) fall back to local-only mode so the panel still renders
    // from the local opencode database.
    const zen = await fetchOfficialQuota(sub.key, GO_USAGE_URL, 'zen', null, now)
    if (zen.official) body = zen
    else if (zen.reason === 'http-401' || zen.reason === 'http-403' || zen.reason === 'http-404') body = { ok: true, available: true, official: false, subscription: 'zen', reason: 'no-official-usage-api', syncedAt: now }
    else body = zen
  }
  if (body && (body.ok || body.available)) goCache = { at: now, body }
  return body
}

/** Rolling quota windows (ms) — the periods subscription quotas are measured over. */
const H5_MS = 5 * 3600000
const WEEK_MS = 7 * 86400000
const MONTH_MS = 30 * 86400000

/** Empty rolling-window bucket (sessions + cost + token columns). */
function emptyWindow() {
  return { sessions: 0, cost: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, billed: 0 }
}

/** Fold one session's usage values into a rolling-window bucket. */
function addWin(win, vals) {
  win.sessions += 1
  win.cost += vals.cost
  win.inputTokens += vals.input
  win.outputTokens += vals.output
  win.reasoningTokens += vals.reasoning
  win.cacheReadTokens += vals.cacheRead
  win.cacheWriteTokens += vals.cacheWrite
  win.billed += vals.billed
}

/** Round a USD cost to 4 decimals for JSON output. */
function roundCost(v) {
  return Math.round(v * 10000) / 10000
}

let sqlitePromise = null

/** Lazy `node:sqlite` loader — null when the runtime lacks the builtin. */
function loadSqlite() {
  if (sqlitePromise === null) {
    sqlitePromise = import('node:sqlite').catch(() => null)
  }
  return sqlitePromise
}

/**
 * Candidate paths for the opencode data dir, most specific first. The Go CLI
 * follows XDG-style paths even on Windows (`~/.local/share/opencode`), so the
 * user-home XDG location is checked before the Windows-native app-data dirs.
 */
function opencodeDbCandidates() {
  const home = homedir()
  const list = []
  const push = (dir) => {
    if (typeof dir === 'string' && dir.trim().length > 0) list.push(join(dir.trim(), 'opencode.db'))
  }
  if (process.env.OPENCODE_DATA) push(process.env.OPENCODE_DATA)
  if (process.env.XDG_DATA_HOME) push(join(process.env.XDG_DATA_HOME, 'opencode'))
  push(join(home, '.local', 'share', 'opencode'))
  if (process.env.LOCALAPPDATA) push(join(process.env.LOCALAPPDATA, 'opencode'))
  if (process.env.APPDATA) push(join(process.env.APPDATA, 'opencode'))
  return list
}

/** First existing, non-empty opencode database, or null. */
export async function findOpencodeDb() {
  for (const p of opencodeDbCandidates()) {
    try {
      const st = await stat(p)
      if (st.isFile() && st.size > 0) return p
    } catch {
      // try the next candidate
    }
  }
  return null
}

/** Parse the opencode `model` column: `{"id","providerID","variant"}` JSON. */
function ocModelMeta(raw) {
  let parsed = null
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw
  }
  return {
    id: parsed && parsed.id ? String(parsed.id) : (typeof raw === 'string' && raw ? raw : 'unknown'),
    provider: parsed && parsed.providerID ? String(parsed.providerID) : 'unknown',
    variant: parsed && parsed.variant ? String(parsed.variant) : '',
  }
}

/**
 * Read + fold the opencode session table (read-only) into day/model buckets
 * under the viewer timezone. Pure and self-contained so the host test can
 * exercise it against a scratch database. `billed` follows the DSH convention:
 * input + output + cache-read + cache-write; reasoning and cost are reported
 * separately.
 */
export async function collectOpencodeStats(dbPath, tz, now) {
  const sqlite = await loadSqlite()
  if (!sqlite || typeof sqlite.DatabaseSync !== 'function') {
    return { ok: false, available: false, error: 'node:sqlite is not available in this Node runtime' }
  }
  let db
  try {
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true, timeout: 5000 })
  } catch (error) {
    return { ok: false, available: false, error: 'cannot open opencode database: ' + String(error && error.message || error) }
  }
  try {
    const rows = db.prepare(`
      SELECT time_created, model, cost,
             tokens_input, tokens_output, tokens_reasoning,
             tokens_cache_read, tokens_cache_write,
             summary_additions, summary_deletions, summary_files
      FROM session
    `).all()
    const msgRow = db.prepare('SELECT COUNT(*) AS n FROM message').get()

    const totals = {
      sessions: 0,
      messages: Number(msgRow && msgRow.n) || 0,
      cost: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      billed: 0,
      additions: 0,
      deletions: 0,
      files: 0,
    }
    const byDay = new Map()
    const byModel = new Map()
    let firstTime = null
    let lastTime = null

    // Rolling quota windows: the last 5 hours / 7 days / 30 days, folded
    // exactly from session timestamps — the periods subscription quotas are
    // usually measured over. `h5Hours` breaks the 5-hour window into
    // per-hour buckets (viewer tz) so the panel can draw one bar per hour.
    const h5 = emptyWindow()
    const week = emptyWindow()
    const month = emptyWindow()
    const h5Hours = new Map()

    for (const s of rows) {
      const t = Number(s.time_created)
      if (!(t > 0)) continue
      const input = Number(s.tokens_input) || 0
      const output = Number(s.tokens_output) || 0
      const reasoning = Number(s.tokens_reasoning) || 0
      const cacheRead = Number(s.tokens_cache_read) || 0
      const cacheWrite = Number(s.tokens_cache_write) || 0
      const cost = Number(s.cost) || 0
      const billed = input + output + cacheRead + cacheWrite
      const vals = { input, output, reasoning, cacheRead, cacheWrite, cost, billed }

      totals.sessions += 1
      totals.cost += cost
      totals.inputTokens += input
      totals.outputTokens += output
      totals.reasoningTokens += reasoning
      totals.cacheReadTokens += cacheRead
      totals.cacheWriteTokens += cacheWrite
      totals.billed += billed
      totals.additions += Number(s.summary_additions) || 0
      totals.deletions += Number(s.summary_deletions) || 0
      totals.files += Number(s.summary_files) || 0
      if (firstTime === null || t < firstTime) firstTime = t
      if (lastTime === null || t > lastTime) lastTime = t

      const dk = localDayKey(t, tz)
      let d = byDay.get(dk)
      if (d === undefined) {
        d = { sessions: 0, cost: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, billed: 0 }
        byDay.set(dk, d)
      }
      d.sessions += 1
      d.cost += cost
      d.inputTokens += input
      d.outputTokens += output
      d.reasoningTokens += reasoning
      d.cacheReadTokens += cacheRead
      d.cacheWriteTokens += cacheWrite
      d.billed += billed

      const meta = ocModelMeta(s.model)
      const mk = meta.provider + '/' + meta.id
      let m = byModel.get(mk)
      if (m === undefined) {
        m = { key: mk, id: meta.id, provider: meta.provider, variant: meta.variant, sessions: 0, cost: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, billed: 0, lastTime: 0 }
        byModel.set(mk, m)
      }
      m.sessions += 1
      m.cost += cost
      m.inputTokens += input
      m.outputTokens += output
      m.reasoningTokens += reasoning
      m.cacheReadTokens += cacheRead
      m.cacheWriteTokens += cacheWrite
      m.billed += billed
      if (t > m.lastTime) m.lastTime = t

      // Rolling quota windows (exact, from session timestamps): the last
      // 5 hours, 7 days and 30 days — the periods subscription quotas are
      // usually measured over.
      if (t >= now - H5_MS) addWin(h5, vals)
      if (t >= now - WEEK_MS) addWin(week, vals)
      if (t >= now - MONTH_MS) addWin(month, vals)
      if (t >= now - H5_MS) {
        // Per-hour buckets inside the 5-hour window (viewer tz), keyed by the
        // local hour-start so the client can draw one bar per hour.
        const hour = localHourKey(t, tz)
        const hourStart = keyMidnight(localDayKey(t, tz), tz) + hour * 3600000
        let hb = h5Hours.get(hourStart)
        if (hb === undefined) {
          hb = emptyWindow()
          hb.hourStart = hourStart
          hb.hour = hour
          h5Hours.set(hourStart, hb)
        }
        addWin(hb, vals)
      }
    }

    const byDayOut = [...byDay.entries()]
      .map(([date, b]) => ({ date, ...b }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    const byModelOut = [...byModel.values()].sort((a, b) => b.billed - a.billed)

    const h5HoursOut = [...h5Hours.values()].sort((a, b) => a.hourStart - b.hourStart)

    const recRows = db.prepare(`
      SELECT id, title, model, time_created, cost,
             tokens_input, tokens_output, tokens_reasoning,
             tokens_cache_read, tokens_cache_write
      FROM session
      ORDER BY time_created DESC
      LIMIT 40
    `).all()
    const recent = []
    for (const r of recRows) {
      const t = Number(r.time_created)
      if (!(t > 0)) continue
      const input = Number(r.tokens_input) || 0
      const output = Number(r.tokens_output) || 0
      const cacheRead = Number(r.tokens_cache_read) || 0
      const cacheWrite = Number(r.tokens_cache_write) || 0
      const billed = input + output + cacheRead + cacheWrite
      if (!(billed > 0)) continue
      const meta = ocModelMeta(r.model)
      recent.push({
        id: String(r.id || ''),
        title: String(r.title || '').slice(0, 120),
        model: meta.id,
        provider: meta.provider,
        variant: meta.variant,
        billed,
        cost: Number(r.cost) || 0,
        timeCreated: t,
      })
      if (recent.length >= 10) break
    }

    return {
      ok: true,
      available: true,
      dbPath,
      syncedAt: now,
      totals: { ...totals, cost: roundCost(totals.cost) },
      firstTime,
      lastTime,
      byDay: byDayOut.map((d) => ({ ...d, cost: roundCost(d.cost) })),
      byModel: byModelOut.map((m) => ({ ...m, cost: roundCost(m.cost) })),
      windows: {
        h5: { ...h5, cost: roundCost(h5.cost) },
        week: { ...week, cost: roundCost(week.cost) },
        month: { ...month, cost: roundCost(month.cost) },
      },
      h5Hours: h5HoursOut.map((hb) => ({ ...hb, cost: roundCost(hb.cost) })),
      recent,
    }
  } finally {
    try {
      db.close()
    } catch {
      // already closed / never opened
    }
  }
}

/* ------------------------------------------------------------------ */
/* Loopback trust fence for /api/dsh-usage-stats (family shared helper) */
/* ------------------------------------------------------------------ */
function isLoopbackRequest(req) {
  const addr = req.socket && req.socket.remoteAddress
  if (typeof addr !== 'string') return false
  const normalized = addr.toLowerCase()
  const isLoopback = normalized === '::1' || normalized.startsWith('::ffff:127.') || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)
  if (!isLoopback) return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let hostname
  try {
    hostname = new URL('http://' + host).hostname
  } catch {
    return false
  }
  const hostOk = hostname === 'localhost' || hostname === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  if (!hostOk) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrlHost(req)
  } catch {
    return false
  }
}
function hostUrlHost(req) {
  try {
    return new URL('http://' + req.headers.host).host
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ */
/* Buckets                                                             */
/* ------------------------------------------------------------------ */

function emptyBucket() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, billed: 0, calls: 0 }
}

function addUsage(bucket, usage) {
  const u = usage || {}
  const input = Number(u.inputTokens) || 0
  const output = Number(u.outputTokens) || 0
  const cacheRead = Number(u.cacheReadTokens) || 0
  const cacheWrite = Number(u.cacheWriteTokens) || 0
  const reasoning = Number(u.reasoningTokens) || 0
  bucket.inputTokens += input
  bucket.outputTokens += output
  bucket.cacheReadTokens += cacheRead
  bucket.cacheWriteTokens += cacheWrite
  bucket.reasoningTokens += reasoning
  bucket.billed += input + output + cacheRead + cacheWrite
  bucket.calls += 1
}

function mergeBucket(into, b) {
  into.inputTokens += b.inputTokens || 0
  into.outputTokens += b.outputTokens || 0
  into.cacheReadTokens += b.cacheReadTokens || 0
  into.cacheWriteTokens += b.cacheWriteTokens || 0
  into.reasoningTokens += b.reasoningTokens || 0
  into.billed += b.billed || 0
  into.calls += b.calls || 0
}

/** Independent copy of a bucket (so folding never mutates the stored corpus). */
function copyBucket(b) {
  return {
    inputTokens: b.inputTokens || 0,
    outputTokens: b.outputTokens || 0,
    cacheReadTokens: b.cacheReadTokens || 0,
    cacheWriteTokens: b.cacheWriteTokens || 0,
    reasoningTokens: b.reasoningTokens || 0,
    billed: b.billed || 0,
    calls: b.calls || 0,
  }
}

function serializeBucket(b) {
  return {
    inputTokens: b.inputTokens,
    outputTokens: b.outputTokens,
    cacheReadTokens: b.cacheReadTokens,
    cacheWriteTokens: b.cacheWriteTokens,
    reasoningTokens: b.reasoningTokens,
    billed: b.billed,
    calls: b.calls,
  }
}

/** Simple concurrency-limited async map (failures become undefined). */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      try {
        results[i] = await fn(items[i])
      } catch {
        results[i] = undefined
      }
    }
  }
  const workers = []
  for (let w = 0; w < Math.min(limit, items.length); w++) workers.push(worker())
  await Promise.all(workers)
  return results
}

/* ------------------------------------------------------------------ */
/* Date keys under a browser UTC offset (minutes: UTC - local)         */
/* ------------------------------------------------------------------ */

function clampTz(tz) {
  const n = Number(tz)
  if (!Number.isFinite(n)) return 0
  return Math.max(-840, Math.min(840, Math.round(n)))
}

export function localDayKey(timeMs, tzOffsetMin) {
  return new Date(timeMs - tzOffsetMin * 60000).toISOString().slice(0, 10)
}
export function localMondayKey(timeMs, tzOffsetMin) {
  const shifted = timeMs - tzOffsetMin * 60000
  const day = (new Date(shifted).getUTCDay() + 6) % 7 // 0 = Monday
  return new Date(shifted - day * 86400000).toISOString().slice(0, 10)
}
/** Local hour (0..23) of a timestamp under a browser UTC offset. */
export function localHourKey(timeMs, tzOffsetMin) {
  return new Date(timeMs - tzOffsetMin * 60000).getUTCHours()
}
/** Milliseconds of a local date key's midnight. */
function keyMidnight(dateKey, tzOffsetMin) {
  return Date.parse(dateKey + 'T00:00:00Z') + tzOffsetMin * 60000
}

function byDate(a, b) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
}

/* ------------------------------------------------------------------ */
/* Per-session aggregation                                             */
/* ------------------------------------------------------------------ */

function putBucket(map, key, usage) {
  let b = map[key]
  if (b === undefined) {
    b = emptyBucket()
    map[key] = b
  }
  addUsage(b, usage)
}

/**
 * Fold one session's events into a per-session contribution keyed by local
 * date (day/week), date|modelKey, and modelKey. Uses plain object maps so the
 * result JSON-serializes cleanly for persistence.
 * @param events - the session's raw event log.
 * @param tz - UTC offset (minutes) used for day/week keys.
 */
export function scanSessionEvents(events, tz) {
  const s = {
    messages: 0,
    withUsage: false,
    totals: emptyBucket(),
    byDay: Object.create(null),
    byWeek: Object.create(null),
    byHour: Object.create(null),
    byDayModel: Object.create(null),
    byWeekModel: Object.create(null),
    byHourModel: Object.create(null),
    byModel: Object.create(null),
  }
  for (const ev of events || []) {
    if (!ev || ev.type !== 'assistant/message') continue
    const usage = ev.data && ev.data.usage
    if (!usage) continue
    const time = ev.time
    if (!(time > 0)) continue
    s.withUsage = true
    s.messages += 1

    const source = ev.data.message && ev.data.message.source
    const provider = source && source.provider ? String(source.provider) : 'unknown'
    const model = source && source.model ? String(source.model) : 'unknown'
    const modelKey = provider + '/' + model

    const dayKey = localDayKey(time, tz)
    const hour = localHourKey(time, tz)
    const hourKey = dayKey + '|' + hour

    addUsage(s.totals, usage)
    putBucket(s.byDay, dayKey, usage)
    putBucket(s.byWeek, localMondayKey(time, tz), usage)
    putBucket(s.byHour, hourKey, usage)
    putBucket(s.byDayModel, dayKey + '|' + modelKey, usage)
    putBucket(s.byWeekModel, localMondayKey(time, tz) + '|' + modelKey, usage)
    putBucket(s.byHourModel, hourKey + '|' + modelKey, usage)

    let mb = s.byModel[modelKey]
    if (mb === undefined) {
      mb = { provider, model, lastTime: 0, bucket: emptyBucket() }
      s.byModel[modelKey] = mb
    }
    addUsage(mb.bucket, usage)
    if (time > mb.lastTime) mb.lastTime = time
  }
  return s
}

/** Fingerprint of an unchanged session log: size + mtimeMs. */
export function fpKey(fp) {
  if (!fp) return null
  return String(fp.size) + ':' + Math.round(fp.mtimeMs)
}

/* ------------------------------------------------------------------ */
/* Corpus state + persistence                                          */
/* ------------------------------------------------------------------ */

export function defaultState() {
  return { version: 3, tz: 0, lastSessionsCount: 0, syncedAt: 0, sessions: {} }
}

function resolveHome() {
  return (process.env.DSH_HOME && process.env.DSH_HOME.trim().length > 0) ? process.env.DSH_HOME : join(homedir(), '.dsh')
}

function resolveStorePath() {
  return join(resolveHome(), 'storages', STORE_FILE)
}

export async function persistState(state, storePath) {
  try {
    await mkdir(dirname(storePath), { recursive: true })
    const tmp = storePath + '.tmp'
    await writeFile(tmp, JSON.stringify(state), 'utf8')
    await rename(tmp, storePath)
  } catch (error) {
    // Persistence is best-effort: aggregation still works, it just costs a
    // cold scan after the next restart.
    console.warn('[dsh-usage-stats] persist corpus failed:', String(error && error.message || error))
  }
}

/** Validate + normalize a stored contribution so a corrupt file cannot crash. */
function normalizeSession(s) {
  if (!s || typeof s !== 'object') return null
  const base = emptyBucket()
  const totals = {
    inputTokens: s.totals && s.totals.inputTokens || 0,
    outputTokens: s.totals && s.totals.outputTokens || 0,
    cacheReadTokens: s.totals && s.totals.cacheReadTokens || 0,
    cacheWriteTokens: s.totals && s.totals.cacheWriteTokens || 0,
    reasoningTokens: s.totals && s.totals.reasoningTokens || 0,
    billed: s.totals && s.totals.billed || 0,
    calls: s.totals && s.totals.calls || 0,
  }
  void base
  const norm = {
    fp: (s.fp && Number.isFinite(s.fp.size) && Number.isFinite(s.fp.mtimeMs)) ? { size: s.fp.size, mtimeMs: s.fp.mtimeMs } : null,
    retained: !!s.retained,
    messages: Number.isFinite(s.messages) ? Math.max(0, Math.round(s.messages)) : 0,
    withUsage: !!s.withUsage,
    totals,
    byDay: s.byDay && typeof s.byDay === 'object' ? s.byDay : {},
    byWeek: s.byWeek && typeof s.byWeek === 'object' ? s.byWeek : {},
    byHour: s.byHour && typeof s.byHour === 'object' ? s.byHour : {},
    byDayModel: s.byDayModel && typeof s.byDayModel === 'object' ? s.byDayModel : {},
    byWeekModel: s.byWeekModel && typeof s.byWeekModel === 'object' ? s.byWeekModel : {},
    byHourModel: s.byHourModel && typeof s.byHourModel === 'object' ? s.byHourModel : {},
    byModel: s.byModel && typeof s.byModel === 'object' ? s.byModel : {},
  }
  // Recompute per-session totals from day buckets if they are missing (older snapshots).
  if (!(s.totals && typeof s.totals === 'object' && 'billed' in s.totals)) {
    const recomputed = emptyBucket()
    for (const k of Object.keys(norm.byDay)) mergeBucket(recomputed, norm.byDay[k])
    norm.totals = recomputed
  }
  return norm
}

export async function loadState(storePath) {
  const state = defaultState()
  try {
    const raw = await readFile(storePath, 'utf8')
    const j = JSON.parse(raw)
    if (j && j.version === 3 && j.sessions && typeof j.sessions === 'object') {
      state.tz = clampTz(j.tz)
      state.lastSessionsCount = Number.isFinite(j.lastSessionsCount) ? Math.max(0, Math.round(j.lastSessionsCount)) : 0
      state.syncedAt = Number.isFinite(j.savedAt) ? j.savedAt : 0
      for (const id of Object.keys(j.sessions)) {
        const norm = normalizeSession(j.sessions[id])
        if (norm) state.sessions[id] = norm
      }
    }
  } catch {
    // No snapshot yet (first run) or unreadable — start empty; a background
    // sync will rebuild it.
  }
  return state
}

/* ------------------------------------------------------------------ */
/* Filesystem fingerprinting of persisted session logs                  */
/* ------------------------------------------------------------------ */

/**
 * Cheap staleness detector. The persisted logs live at
 * <DSH_HOME>/sessions/<encoded-cwd>/<sessionId>/session.jsonl.zstd
 * (dsh-session-persistence-jsonl). We enumerate those files and key them by
 * the owning session id (the immediate parent directory name). Any id not
 * found here is either live-only or behind an unexpected layout — the caller
 * treats it as needing a re-read, which stays correct.
 */
export async function collectFileFps(sessionsDir) {
  const out = new Map()
  if (!sessionsDir) sessionsDir = join(resolveHome(), 'sessions')
  let workspaces
  try {
    workspaces = await readdir(sessionsDir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ws of workspaces) {
    if (!ws.isDirectory()) continue
    let entries
    try {
      entries = await readdir(join(sessionsDir, ws.name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const file = join(sessionsDir, ws.name, entry.name, 'session.jsonl.zstd')
      try {
        const st = await stat(file)
        if (st.isFile()) out.set(entry.name, { size: st.size, mtimeMs: st.mtimeMs })
      } catch {
        // not a persisted session dir
      }
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Incremental sync + in-memory fold for the response                  */
/* ------------------------------------------------------------------ */

/**
 * One incremental refresh pass. Only changed/new sessions are re-read; the
 * rest keep their previously measured contribution. Deleted sessions are
 * dropped. The per-session contributions then fold into the response in
 * memory.
 */
export async function syncCorpus(ctx, reqTz, state) {
  const query = ctx.get('sessionQuery')
  if (query === undefined) throw new Error('sessionQuery service is unavailable — cannot aggregate usage statistics')
  const tzRequested = Number.isFinite(reqTz) ? clampTz(reqTz) : null
  const tzChanged = tzRequested !== null && tzRequested !== state.tz
  const tz = tzChanged ? tzRequested : state.tz

  const records = await query.listSessions()
  const ids = new Set()
  for (const rec of records || []) {
    const id = rec && rec.header && rec.header.id
    if (id) ids.add(id)
  }
  // Sessions that no longer exist on disk or in the live corpus KEEP their
  // measured contribution forever — deleting or archiving a conversation must
  // not erase the usage it already generated (real token spend stays real).
  // The session stays in state.sessions with a `retained` flag so it is still
  // folded into every response.
  for (const id of Object.keys(state.sessions)) {
    if (!ids.has(id)) {
      state.sessions[id].retained = true
    }
  }
  state.lastSessionsCount = ids.size

  const fps = await collectFileFps()
  const toRead = []
  for (const rec of records || []) {
    const id = rec && rec.header && rec.header.id
    if (!id) continue
    const fp = fps.get(id) || null
    const prev = state.sessions[id]
    if (tzChanged) {
      toRead.push(id)
      continue
    }
    if (prev === undefined) {
      toRead.push(id)
      continue
    }
    // A retained session whose log file is gone was deleted by the user; keep
    // its measured contribution forever and never try to re-read it.
    if (prev.retained && fp === null) continue
    if (fpKey(fp) !== fpKey(prev.fp || null)) toRead.push(id)
  }

  const readStart = Date.now()
  if (toRead.length > 0) {
    await mapLimit(toRead, SCAN_CONCURRENCY, async (id) => {
      try {
        const snap = await query.readSession(id)
        const contribution = scanSessionEvents(snap && snap.events ? snap.events : [], tz)
        contribution.fp = fps.get(id) || null
        contribution.syncedAt = Date.now()
        state.sessions[id] = contribution
      } catch {
        // Keep the previous contribution (or absence) so one bad read never
        // wipes a session from the stats.
      }
    })
  }
  if (tzChanged) state.tz = tz
  state.syncedAt = Date.now()
  return { tz, changed: toRead.length, readMs: Date.now() - readStart, sessionCount: ids.size }
}

/**
 * Fold the in-memory per-session contributions into the API response body
 * (windowed by `days`, optionally filtered to one `modelKey`). Pure and cheap:
 * O(number of distinct usage dates / models), no I/O.
 */
export function foldResponse(state, days, modelKey, tz, now) {
  const filterModel = modelKey
  const fromKey = (() => {
    if (!(days > 0)) return null
    const fromMidnight = now - (days - 1) * 86400000
    return localDayKey(fromMidnight, tz)
  })()
  // The 24-hour chart shows the CURRENT local day (viewer timezone) only.
  const todayKey = localDayKey(now, tz)

  const daySum = new Map()
  const weekSum = new Map()
  const hourSum = new Map()
  const modelSum = new Map()
  const totals = emptyBucket()
  let messages = 0
  let sessionsWithUsage = 0

  const bucketInto = (map, date, b) => {
    const cur = map.get(date)
    if (cur === undefined) map.set(date, copyBucket(b))
    else mergeBucket(cur, b)
  }

  for (const sid of Object.keys(state.sessions)) {
    const s = state.sessions[sid]
    if (!s) continue
    if (s.withUsage) sessionsWithUsage += 1
    messages += s.messages || 0

    // Lifetime per-model sums (all-time; matches the charts' "click to
    // filter" model list regardless of the selected window).
    for (const mk of Object.keys(s.byModel || {})) {
      if (filterModel && mk !== filterModel) continue
      const mb = s.byModel[mk]
      const acc = modelSum.get(mk)
      if (acc === undefined) {
        modelSum.set(mk, { provider: mb.provider, model: mb.model, lastTime: mb.lastTime || 0, bucket: copyBucket(mb.bucket || emptyBucket()) })
      } else {
        mergeBucket(acc.bucket, mb.bucket)
        if ((mb.lastTime || 0) > acc.lastTime) acc.lastTime = mb.lastTime
      }
    }

    // Windowed day/week sums (all-model, or per-model when filtered).
    const daySource = filterModel ? (s.byDayModel || {}) : (s.byDay || {})
    const weekSource = filterModel ? (s.byWeekModel || {}) : (s.byWeek || {})
    for (const key of Object.keys(daySource)) {
      if (filterModel) {
        const sep = key.indexOf('|')
        if (sep < 0 || key.slice(sep + 1) !== filterModel) continue
        bucketInto(daySum, key.slice(0, sep), daySource[key])
      } else {
        bucketInto(daySum, key, daySource[key])
      }
    }
    for (const key of Object.keys(weekSource)) {
      if (filterModel) {
        const sep = key.indexOf('|')
        if (sep < 0 || key.slice(sep + 1) !== filterModel) continue
        bucketInto(weekSum, key.slice(0, sep), weekSource[key])
      } else {
        bucketInto(weekSum, key, weekSource[key])
      }
    }

    // Hour-of-day sums for the CURRENT local day only (keys: `date|hour`, or
    // `date|hour|modelKey` when filtered). Each of the 24 bars is one hour of
    // today; hours not yet elapsed (or without usage) stay zero.
    const hourSource = filterModel ? (s.byHourModel || {}) : (s.byHour || {})
    for (const key of Object.keys(hourSource)) {
      let date
      let hour
      if (filterModel) {
        const lastSep = key.lastIndexOf('|')
        if (lastSep < 0 || key.slice(lastSep + 1) !== filterModel) continue
        const midSep = key.lastIndexOf('|', lastSep - 1)
        if (midSep < 0) continue
        date = key.slice(0, midSep)
        hour = key.slice(midSep + 1, lastSep)
      } else {
        const sep = key.lastIndexOf('|')
        if (sep < 0) continue
        date = key.slice(0, sep)
        hour = key.slice(sep + 1)
      }
      if (date !== todayKey) continue
      bucketInto(hourSum, hour, hourSource[key])
    }
  }

  const byDay = []
  for (const [date, bucket] of daySum) if (fromKey === null || date >= fromKey) byDay.push({ date, bucket })
  byDay.sort(byDate)
  const byWeek = []
  for (const [date, bucket] of weekSum) if (fromKey === null || date >= fromKey) byWeek.push({ date, bucket })
  byWeek.sort(byDate)

  // Always 24 bars (0..23) so the chart shows a full day even for empty hours.
  const byHour = []
  for (let h = 0; h < 24; h++) {
    const bucket = hourSum.get(String(h))
    byHour.push({ hour: h, bucket: bucket === undefined ? emptyBucket() : bucket })
  }

  // Per-model hour sums for the CURRENT local day only, for the stacked
  // 24-hour chart (keys in the corpus: `date|hour|modelKey`). Colours are
  // assigned client-side per model and persisted (localStorage), so a model
  // keeps one fixed colour across the donut and the bars regardless of rank.
  const hourModelSum = new Map() // hour -> Map(modelKey -> bucket)
  for (const sid of Object.keys(state.sessions)) {
    const s = state.sessions[sid]
    if (!s) continue
    const hm = s.byHourModel || {}
    for (const key of Object.keys(hm)) {
      const lastSep = key.lastIndexOf('|')
      if (lastSep < 0) continue
      const midSep = key.lastIndexOf('|', lastSep - 1)
      if (midSep < 0) continue
      const date = key.slice(0, midSep)
      const hour = key.slice(midSep + 1, lastSep)
      const mk = key.slice(lastSep + 1)
      if (date !== todayKey) continue
      if (filterModel && mk !== filterModel) continue
      let per = hourModelSum.get(hour)
      if (per === undefined) {
        per = new Map()
        hourModelSum.set(hour, per)
      }
      const cur = per.get(mk)
      if (cur === undefined) per.set(mk, copyBucket(hm[key]))
      else mergeBucket(cur, hm[key])
    }
  }
  const byHourModels = []
  for (let h = 0; h < 24; h++) {
    const per = hourModelSum.get(String(h))
    const models = []
    if (per !== undefined) {
      for (const [mk, b] of per) {
        const ref = modelSum.get(mk)
        models.push({ key: mk, provider: ref ? ref.provider : 'unknown', model: ref ? ref.model : mk, billed: b.billed })
      }
      models.sort((a, b) => b.billed - a.billed)
      // Same visual cap as the donut: top 8 + "其他".
      if (models.length > 8) {
        let restBilled = 0
        for (let k = 8; k < models.length; k++) restBilled += models[k].billed
        models.length = 8
        models.push({ key: '__rest__', provider: '', model: '其他', billed: restBilled })
      }
    }
    byHourModels.push({ hour: h, models })
  }

  // Totals fold from the windowed day series (week fallback) so usage is
  // never double-counted; week buckets are the same usage regrouped by week.
  const primary = byDay.length > 0 ? byDay : byWeek
  let firstTime = null
  let lastTime = null
  for (const item of primary) {
    mergeBucket(totals, item.bucket)
    const mid = keyMidnight(item.date, tz) + 43200000
    if (firstTime === null || mid < firstTime) firstTime = mid
    if (lastTime === null || mid > lastTime) lastTime = mid
  }

  const byModel = []
  for (const [key, m] of modelSum) byModel.push({ key, provider: m.provider, model: m.model, lastTime: m.lastTime, bucket: m.bucket })
  byModel.sort((a, b) => b.bucket.billed - a.bucket.billed)

  return { totals, messages, sessionsWithUsage, byDay, byWeek, byHour, byHourModels, byModel, firstTime, lastTime }
}

/* ------------------------------------------------------------------ */
/* Cordis plugin `apply`                                               */
/* ------------------------------------------------------------------ */

export function apply(ctx) {
  const storePath = resolveStorePath()
  let state = defaultState()
  let syncPromise = null
  let bootedTz = -9999

  let loadPromise = null
  const ensureLoaded = () => {
    if (loadPromise === null) {
      loadPromise = loadState(storePath).then((loaded) => {
        state = loaded
        return loaded
      })
    }
    return loadPromise
  }

  /** Single-flight refresh; tz ignored when null (keep warm bucket tz). */
  const sync = (reqTz, force) => {
    if (syncPromise !== null) return syncPromise
    syncPromise = syncCorpus(ctx, reqTz, state)
      .catch((error) => {
        // Keep whatever we have; request handlers report freshness themselves.
        console.warn('[dsh-usage-stats] sync failed:', String(error && error.message || error))
        return { tz: state.tz, changed: 0, readMs: 0, sessionCount: state.lastSessionsCount, error: String(error && error.message || error) }
      })
      .finally(() => {
        syncPromise = null
      })
    return syncPromise
  }

  /** Start a refresh and wait at most MAX_WAIT_MS before serving current data. */
  const syncWithBudget = (tz, force) => {
    const p = sync(tz, force)
    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(finish, MAX_WAIT_MS)
      timer.unref?.()
      p.then(finish, finish)
    })
  }

  const writeJson = (res, status, body) => {
    const payload = JSON.stringify(body)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
    res.end(payload)
  }

  const guard = (req, res, method) => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return false
    }
    if ((req.method || 'GET') !== method) {
      writeJson(res, 405, { error: 'method not allowed: ' + req.method })
      return false
    }
    return true
  }

  const readQuery = (req) => {
    try {
      return new URL(req.url, 'http://x').searchParams
    } catch {
      return new URLSearchParams('')
    }
  }

  const webServer = ctx.get('webServer')
  if (webServer === undefined) return

  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/api/dsh-usage-stats/stats',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const t0 = Date.now()
        const params = readQuery(req)
        const daysParam = Number(params.get('days'))
        const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(Math.round(daysParam), 3650) : 0
        const tz = clampTz(Number(params.get('tz')))
        const modelKey = (params.get('model') || '').trim() || null
        const fresh = params.get('fresh') === '1'
        try {
          await ensureLoaded()
          const staleByTtl = Date.now() - (state.syncedAt || 0) > CACHE_TTL_MS
          if (fresh || staleByTtl || state.tz !== tz) {
            await syncWithBudget(tz, fresh || state.tz !== tz)
          }
          const now = Date.now()
          const data = foldResponse(state, days, modelKey, tz, now)
          const stale = now - (state.syncedAt || 0) > CACHE_TTL_MS
          writeJson(res, 200, {
            ok: true,
            days,
            model: modelKey,
            tz,
            totals: serializeBucket(data.totals),
            messages: data.messages,
            sessions: state.lastSessionsCount,
            sessionsWithUsage: data.sessionsWithUsage,
            firstTime: data.firstTime,
            lastTime: data.lastTime,
            byDay: data.byDay.map((d) => ({ date: d.date, ...serializeBucket(d.bucket) })),
            byWeek: data.byWeek.map((w) => ({ date: w.date, ...serializeBucket(w.bucket) })),
            byHour: data.byHour.map((h) => ({ hour: h.hour, ...serializeBucket(h.bucket) })),
            byHourModels: data.byHourModels,
            byModel: data.byModel.map((m) => ({ key: m.key, provider: m.provider, model: m.model, lastTime: m.lastTime, ...serializeBucket(m.bucket) })),
            syncedAt: state.syncedAt || 0,
            stale,
            scanMs: Date.now() - t0,
          })
        } catch (error) {
          writeJson(res, 200, { ok: false, error: String(error && error.message || error) })
        }
      },
    }),
    'dsh-usage-stats: routes',
  )

  // opencode-go usage route: folds the opencode SQLite session table into the
  // same day/model buckets (viewer tz) with a short TTL cache — the DB keeps
  // changing while opencode runs, so `?fresh=1` bypasses the cache.
  let ocCache = { at: 0, tz: null, body: null }
  const readOpencode = async (tz, fresh) => {
    const now = Date.now()
    if (!fresh && ocCache.body !== null && ocCache.tz === tz && now - ocCache.at < OC_TTL_MS) {
      return ocCache.body
    }
    const dbPath = await findOpencodeDb()
    let body
    if (dbPath === null) {
      body = { ok: true, available: false, reason: 'not-found', syncedAt: now }
    } else {
      body = await collectOpencodeStats(dbPath, tz, now)
    }
    if (body && body.ok) ocCache = { at: now, tz, body }
    return body
  }

  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/api/dsh-usage-stats/opencode',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const t0 = Date.now()
        const params = readQuery(req)
        const tz = clampTz(Number(params.get('tz')))
        const fresh = params.get('fresh') === '1'
        try {
          const body = await readOpencode(tz, fresh)
          body.scanMs = Date.now() - t0
          writeJson(res, 200, body)
        } catch (error) {
          writeJson(res, 200, { ok: false, available: false, error: String(error && error.message || error) })
        }
      },
    }),
    'dsh-usage-stats: opencode route',
  )

  // opencode subscription quota: proxies the official opencode.ai usage
  // endpoint (three rolling windows: 5h / week / month, each with percent
  // used + reset time) using the API key from the local opencode auth file.
  // Detects the subscription kind from the auth entry (`opencode-go` = Go
  // subscription, `opencode` = Zen); both kinds use the same official
  // endpoint, and Zen falls back to local-only mode only when the endpoint
  // rejects the key. The key never leaves the host.
  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/api/dsh-usage-stats/opencode-go',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const t0 = Date.now()
        const params = readQuery(req)
        const fresh = params.get('fresh') === '1'
        try {
          const body = await fetchSubscriptionQuota(fresh)
          body.scanMs = Date.now() - t0
          writeJson(res, 200, body)
        } catch (error) {
          writeJson(res, 200, { ok: false, available: false, error: String(error && error.message || error) })
        }
      },
    }),
    'dsh-usage-stats: opencode quota route',
  )

  // Background keep-fresh: build + persist corpus shortly after boot so the
  // first page open is served from warm memory, and keep it warm thereafter.
  // Seed with the server's local timezone unless a valid one was persisted:
  // a stored tz of 0 means "never recorded" (UTC default), not necessarily the
  // browser's real offset — seeding with the server's own offset keeps the
  // first browser request on the same machine from re-bucketing every session
  // (which costs seconds on every page open).
  void ensureLoaded().then(() => {
    bootedTz = state.tz !== 0 ? state.tz : clampTz(new Date().getTimezoneOffset())
    return sync(bootedTz, false).catch(() => {})
  })

  ctx.effect(
    () => ctx.interval(() => {
      void sync(null, false).catch(() => {})
    }, SYNC_INTERVAL_MS),
    'dsh-usage-stats: keep-fresh',
  )

  // Persist once at shutdown so the freshest snapshot survives restarts.
  ctx.effect(() => {
    return () => {
      if (Object.keys(state.sessions).length > 0) void persistState(state, storePath)
    }
  }, 'dsh-usage-stats: shutdown persist')
}

export default { name, inject, apply }
