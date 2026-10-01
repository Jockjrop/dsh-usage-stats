/**
 * dsh-usage-stats — host half. Aggregates token usage from every session's
 * durable log (the `assistant/message` events carry `usage` accounting plus
 * provider/model provenance) and serves statistics, quota and control routes
 * under /api/dsh-usage-stats for the desktop settings page (用量统计). The renderer half
 * (./client) registers the settings section with the heatmap, the 24-hour
 * token chart, and the per-model breakdown.
 *
 * Provider quotas use the credentials configured in DSH. Optional local
 * plugins are registered as quota adapters, with display-only cache data.
 *
 * Performance model (fixed for slow page loads):
 *   - The corpus is aggregated into per-session contributions that are kept
 *     in memory AND persisted to <DSH_HOME>/storages/usage-stats-corpus.json,
 *     so a server restart does not force a cold full scan.
 *   - Refresh uses the SQLite session `f_head_sequence` or legacy JSONL file
 *     metadata as a fingerprint when available. Sessions without either
 *     fingerprint are re-read on every background refresh.
 *   - A background interval keeps the corpus warm in the last requested timezone.
 *   - A request waits at most MAX_WAIT_MS for a scan. An unfinished scan or
 *     failed session read marks the current snapshot `stale:true`.
 *
 * The desktop renderer sends its system UTC offset. Sessions with source events are
 * re-bucketed exactly; old retained sessions use their stored hourly buckets.
 * `?fresh=1` forces a rescan. No dsh source changes.
 */
import { mkdir, readFile, rename, stat, writeFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { createProviderQuotaReader } from './provider-quotas.js'
import { createQuotaControls, workBuddyQuotaSource, QuotaControlError } from './quota-controls.js'

/** Stable cordis plugin name (row id `usage-stats`). */
export const name = 'usage-stats'

/** Services required before the surfaces can mount (timer for the warm loop). */
export const inject = ['profileContext', 'sessionQuery', 'webServer', 'timer']

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

/** Fallback for requests without a desktop timezone. */
const SYSTEM_TZ = new Date().getTimezoneOffset()

let sqlitePromise = null

/** Lazy `node:sqlite` loader — null when the runtime lacks the builtin. */
function loadSqlite() {
  if (sqlitePromise === null) {
    sqlitePromise = import('node:sqlite').catch(() => null)
  }
  return sqlitePromise
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
/* Date keys under a system UTC offset (minutes: UTC - local)          */
/* ------------------------------------------------------------------ */

function clampTz(tz) {
  const n = Number(tz)
  if (!Number.isFinite(n)) return SYSTEM_TZ
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
/** Local hour (0..23) of a timestamp under a system UTC offset. */
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
    usageEvents: [],
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

    // Persist only the fields needed to re-bucket retained sessions exactly.
    s.usageEvents.push([time, provider, model,
      Number(usage.inputTokens) || 0, Number(usage.outputTokens) || 0,
      Number(usage.cacheReadTokens) || 0, Number(usage.cacheWriteTokens) || 0,
      Number(usage.reasoningTokens) || 0])

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
  return { version: 3, tz: SYSTEM_TZ, lastSessionsCount: 0, syncedAt: 0, partial: false, sessions: {} }
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
    syncedAt: Number.isFinite(s.syncedAt) ? s.syncedAt : 0,
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
    usageEvents: Array.isArray(s.usageEvents) ? s.usageEvents.filter((e) => Array.isArray(e) && e.length === 8 && Number.isFinite(e[0])) : null,
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
      state.syncedAt = Number.isFinite(j.syncedAt) ? j.syncedAt : (Number.isFinite(j.savedAt) ? j.savedAt : 0)
      state.partial = !!j.partial
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

/**
 * SQLite-persistence fingerprint source.
 *
 * DSH switched its durable session store from per-session
 * `session.jsonl.zstd` files (dsh-session-persistence-jsonl) to a single
 * `sessions/sessions.sqlite` database (dsh-session-persistence). New sessions
 * therefore have NO jsonl file at all, so `collectFileFps` returns nothing for
 * them and the incremental scan would read each fresh session exactly once —
 * while it is still empty — and never again (its file fingerprint stays null
 * forever). That is why recent usage stopped being recorded.
 *
 * The SQLite store keeps an authoritative, monotonically increasing
 * `f_head_sequence` per session (it equals MAX(f_sequence) of that session's
 * events and is flushed live, even for the running session). We fold it into
 * the same {size, mtimeMs} fingerprint shape the incremental scan already
 * understands, so a session is re-read exactly when its log grows.
 *
 * Returns an empty Map when the DB is missing/unreadable (older jsonl-only
 * deployments, or a transient lock) so the caller can fall back to files.
 */
export async function collectSqliteFps(sessionsDir) {
  const out = new Map()
  if (!sessionsDir) sessionsDir = join(resolveHome(), 'sessions')
  const dbPath = join(sessionsDir, 'sessions.sqlite')
  const sqlite = await loadSqlite()
  if (!sqlite || typeof sqlite.DatabaseSync !== 'function') return out
  let db
  try {
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true, timeout: 5000 })
  } catch {
    return out
  }
  try {
    const rows = db.prepare('SELECT f_session_id AS id, f_head_sequence AS seq FROM t_sessions').all()
    for (const r of rows) {
      const seq = Number(r.seq)
      if (!r.id || !Number.isFinite(seq)) continue
      // size + mtimeMs both carry head_sequence so fpKey changes whenever the
      // session's event log grows.
      out.set(r.id, { size: seq, mtimeMs: seq })
    }
  } catch {
    // Schema mismatch / query failure — leave whatever we collected.
  } finally {
    try {
      db.close()
    } catch {
      // already closed
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Incremental sync + in-memory fold for the response                  */
/* ------------------------------------------------------------------ */

/** Move an old aggregate to another offset when its source log is gone. */
function rekeyLegacySession(s, fromTz, toTz) {
  if (Array.isArray(s.usageEvents)) {
    const events = s.usageEvents.map((e) => ({
      type: 'assistant/message', time: e[0],
      data: { message: { source: { provider: e[1], model: e[2] } },
        usage: { inputTokens: e[3], outputTokens: e[4], cacheReadTokens: e[5], cacheWriteTokens: e[6], reasoningTokens: e[7] } },
    }))
    return { ...scanSessionEvents(events, toTz), fp: s.fp, retained: s.retained, syncedAt: s.syncedAt }
  }

  const next = {
    ...s,
    byDay: Object.create(null), byWeek: Object.create(null), byHour: Object.create(null),
    byDayModel: Object.create(null), byWeekModel: Object.create(null), byHourModel: Object.create(null),
  }
  const move = (source, withModel, hourly) => {
    for (const key of Object.keys(source || {})) {
      const parts = key.split('|')
      const date = parts[0]
      const hour = hourly ? Number(parts[1]) : 12
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(hour) || hour < 0 || hour > 23) continue
      // At whole-hour offset differences this is exact. Old hourly aggregates
      // cannot resolve which side of a fractional-hour boundary each event fell.
      const time = Date.parse(date + 'T00:00:00Z') + (hour + (hourly ? 0.5 : 0)) * 3600000 + fromTz * 60000
      const newDay = localDayKey(time, toTz)
      const newWeek = localMondayKey(time, toTz)
      const newHour = localHourKey(time, toTz)
      const model = withModel ? parts.slice(hourly ? 2 : 1).join('|') : ''
      const suffix = withModel ? '|' + model : ''
      const b = source[key]
      putMergedBucket(withModel ? next.byDayModel : next.byDay, newDay + suffix, b)
      putMergedBucket(withModel ? next.byWeekModel : next.byWeek, newWeek + suffix, b)
      if (hourly) putMergedBucket(withModel ? next.byHourModel : next.byHour, newDay + '|' + newHour + suffix, b)
    }
  }
  move(Object.keys(s.byHour || {}).length ? s.byHour : s.byDay, false, Object.keys(s.byHour || {}).length > 0)
  move(Object.keys(s.byHourModel || {}).length ? s.byHourModel : s.byDayModel, true, Object.keys(s.byHourModel || {}).length > 0)
  return next
}

function putMergedBucket(map, key, bucket) {
  if (!map[key]) map[key] = emptyBucket()
  mergeBucket(map[key], bucket)
}

/**
 * One incremental refresh pass. Only changed/new sessions are re-read; the
 * rest keep their previously measured contribution. Deleted sessions are
 * dropped. The per-session contributions then fold into the response in
 * memory.
 */
export async function syncCorpus(ctx, reqTz, state) {
  const query = ctx.get('sessionQuery')
  if (query === undefined) throw new Error('sessionQuery service is unavailable — cannot aggregate usage statistics')
  const tz = clampTz(reqTz)
  const tzChanged = state.tz !== tz

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
  const nextSessions = { ...state.sessions }
  for (const id of Object.keys(nextSessions)) {
    if (!ids.has(id)) {
      nextSessions[id] = { ...nextSessions[id], retained: true }
    }
  }
  if (tzChanged) {
    for (const id of Object.keys(nextSessions)) nextSessions[id] = rekeyLegacySession(nextSessions[id], state.tz, tz)
  }

  // Fingerprint source: SQLite persistence is authoritative now (every current
  // session has a row whose head_sequence grows live); the jsonl scan is kept as
  // a fallback for older deployments and for any id SQLite does not cover. The
  // SQLite map is overlaid last so it wins wherever both exist.
  const fps = await collectFileFps()
  const sqlFps = await collectSqliteFps()
  for (const [id, fp] of sqlFps) fps.set(id, fp)
  const toRead = []
  for (const rec of records || []) {
    const id = rec && rec.header && rec.header.id
    if (!id) continue
    const fp = fps.get(id) || null
    const prev = state.sessions[id]
    if (prev !== undefined && prev.retained) nextSessions[id] = { ...nextSessions[id], retained: false }
    if (tzChanged) {
      toRead.push(id)
      continue
    }
    if (prev === undefined) {
      toRead.push(id)
      continue
    }
    // A listed session without a supported persistence fingerprint may still
    // change. Re-read it on each refresh; absent sessions are not in records.
    if (fp === null || fpKey(fp) !== fpKey(prev.fp || null)) toRead.push(id)
  }

  const readStart = Date.now()
  let changed = 0
  let failed = 0
  if (toRead.length > 0) {
    await mapLimit(toRead, SCAN_CONCURRENCY, async (id) => {
      try {
        const snap = await query.readSession(id)
        const contribution = scanSessionEvents(snap && snap.events ? snap.events : [], tz)
        contribution.fp = fps.get(id) || null
        contribution.syncedAt = Date.now()
        nextSessions[id] = contribution
        changed += 1
      } catch {
        // Keep the previous contribution (or absence) so one bad read never
        // wipes a session from the stats.
        failed += 1
      }
    })
  }
  state.sessions = nextSessions
  state.lastSessionsCount = ids.size
  state.tz = tz
  state.partial = failed > 0
  if (!state.partial) state.syncedAt = Date.now()
  return { tz, tzChanged, changed, failed, readMs: Date.now() - readStart, sessionCount: ids.size }
}

/**
 * Fold the in-memory per-session contributions into the API response body
 * (windowed by `days`, optionally filtered to one `modelKey`). Pure and cheap:
 * O(number of distinct usage dates / models), no I/O.
 */
export function foldResponse(state, days, modelKey, tz, now) {
  // syncCorpus has already re-keyed all contributions to the requested offset.
  const bucketTz = state.tz
  void tz
  const filterModel = modelKey
  const fromKey = (() => {
    if (!(days > 0)) return null
    const fromMidnight = now - (days - 1) * 86400000
    return localDayKey(fromMidnight, bucketTz)
  })()
  const todayKey = localDayKey(now, bucketTz)
  // Keep enough day buckets for the heatmap even when the selected range is short.
  const heatmapCutoff = localDayKey(now - 364 * 86400000, bucketTz)
  const byDayCutoff = fromKey === null ? null : (fromKey > heatmapCutoff ? heatmapCutoff : fromKey)

  const daySum = new Map()
  const dayModelSum = new Map()
  const weekSum = new Map()
  const hourSum = new Map()
  const modelSum = new Map()
  const totals = emptyBucket()
  const overviewTotals = emptyBucket()
  const overviewDays = new Set()
  const overviewModels = new Map()
  let overviewTodayBilled = 0
  let messages = 0
  let sessionsWithUsage = 0
  let firstTime = null
  let lastTime = null

  const bucketInto = (map, date, b) => {
    const cur = map.get(date)
    if (cur === undefined) map.set(date, copyBucket(b))
    else mergeBucket(cur, b)
  }

  const addModelBucket = (mk, bucket, meta) => {
    const acc = modelSum.get(mk)
    if (acc === undefined) {
      const slash = mk.indexOf('/')
      modelSum.set(mk, {
        provider: meta && meta.provider || (slash >= 0 ? mk.slice(0, slash) : 'unknown'),
        model: meta && meta.model || (slash >= 0 ? mk.slice(slash + 1) : mk),
        lastTime: meta && meta.lastTime || 0,
        bucket: copyBucket(bucket),
      })
    } else {
      mergeBucket(acc.bucket, bucket)
      if (meta && meta.lastTime > acc.lastTime) acc.lastTime = meta.lastTime
    }
  }

  for (const sid of Object.keys(state.sessions)) {
    const s = state.sessions[sid]
    if (!s) continue
    mergeBucket(overviewTotals, s.totals || emptyBucket())
    for (const date of Object.keys(s.byDay || {})) {
      const bucket = s.byDay[date]
      if ((bucket.calls || 0) > 0) overviewDays.add(date)
      if (date === todayKey) overviewTodayBilled += bucket.billed || 0
    }
    for (const mk of Object.keys(s.byModel || {})) {
      const model = s.byModel[mk]
      const current = overviewModels.get(mk)
      if (current) current.billed += model.bucket && model.bucket.billed || 0
      else overviewModels.set(mk, { key: mk, provider: model.provider, model: model.model, billed: model.bucket && model.bucket.billed || 0 })
    }
    let sessionMessages = 0
    const daySource = filterModel ? (s.byDayModel || {}) : (s.byDay || {})
    for (const key of Object.keys(daySource)) {
      let date = key
      if (filterModel) {
        const sep = key.indexOf('|')
        if (sep < 0 || key.slice(sep + 1) !== filterModel) continue
        date = key.slice(0, sep)
      }
      const bucket = daySource[key]
      if (byDayCutoff === null || date >= byDayCutoff) bucketInto(daySum, date, bucket)
      if (fromKey !== null && date < fromKey) continue
      mergeBucket(totals, bucket)
      sessionMessages += bucket.calls || 0
      const mid = keyMidnight(date, bucketTz) + 43200000
      bucketInto(weekSum, localMondayKey(mid, bucketTz), bucket)
      if (firstTime === null || mid < firstTime) firstTime = mid
      if (lastTime === null || mid > lastTime) lastTime = mid
    }
    for (const key of Object.keys(s.byDayModel || {})) {
      const sep = key.indexOf('|')
      if (sep < 0) continue
      const date = key.slice(0, sep)
      const mk = key.slice(sep + 1)
      if (filterModel && mk !== filterModel) continue
      if (byDayCutoff !== null && date < byDayCutoff) continue
      let perDay = dayModelSum.get(date)
      if (perDay === undefined) {
        perDay = new Map()
        dayModelSum.set(date, perDay)
      }
      bucketInto(perDay, mk, s.byDayModel[key])
    }
    messages += sessionMessages
    if (sessionMessages > 0) sessionsWithUsage += 1

    if (fromKey === null) {
      for (const mk of Object.keys(s.byModel || {})) {
        if (filterModel && mk !== filterModel) continue
        const mb = s.byModel[mk]
        addModelBucket(mk, mb.bucket || emptyBucket(), mb)
      }
    } else {
      for (const key of Object.keys(s.byDayModel || {})) {
        const sep = key.indexOf('|')
        if (sep < 0 || key.slice(0, sep) < fromKey) continue
        const mk = key.slice(sep + 1)
        if (filterModel && mk !== filterModel) continue
        addModelBucket(mk, s.byDayModel[key], s.byModel && s.byModel[mk])
      }
    }

    // Hour-of-day sums for the current local day (keys: `date|hour`, or
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
  for (const [date, bucket] of daySum) if (byDayCutoff === null || date >= byDayCutoff) byDay.push({ date, bucket })
  byDay.sort(byDate)
  const byDayModels = [...dayModelSum].map(([date, perDay]) => ({
    date,
    models: [...perDay].map(([key, bucket]) => {
      const meta = overviewModels.get(key)
      const slash = key.indexOf('/')
      return {
        key,
        provider: meta && meta.provider || (slash >= 0 ? key.slice(0, slash) : 'unknown'),
        model: meta && meta.model || (slash >= 0 ? key.slice(slash + 1) : key),
        billed: bucket.billed,
        calls: bucket.calls,
      }
    }).sort((a, b) => b.billed - a.billed),
  })).sort(byDate)
  const byWeek = []
  for (const [date, bucket] of weekSum) byWeek.push({ date, bucket })
  byWeek.sort(byDate)

  // Always 24 bars (0..23) so the chart shows a full day even for empty hours.
  const byHour = []
  for (let h = 0; h < 24; h++) {
    const bucket = hourSum.get(String(h))
    byHour.push({ hour: h, bucket: bucket === undefined ? emptyBucket() : bucket })
  }

  // Per-model hour sums for the current local day, for the stacked
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

  const byModel = []
  for (const [key, m] of modelSum) byModel.push({ key, provider: m.provider, model: m.model, lastTime: m.lastTime, bucket: m.bucket })
  byModel.sort((a, b) => b.bucket.billed - a.bucket.billed)

  const overview = {
    todayBilled: overviewTodayBilled,
    usedDays: overviewDays.size,
    totalBilled: overviewTotals.billed,
    models: [...overviewModels.values()].sort((a, b) => b.billed - a.billed),
  }
  return { totals, messages, sessionsWithUsage, byDay, byDayModels, byWeek, byHour, byHourModels, byModel, overview, firstTime, lastTime }
}

/* ------------------------------------------------------------------ */
/* Cordis plugin `apply`                                               */
/* ------------------------------------------------------------------ */

export function apply(ctx) {
  if (ctx.get('profileContext')?.name !== 'desktop') return

  const readProviderQuotas = createProviderQuotaReader(ctx)
  const quotaControls = createQuotaControls(ctx, {
    path: join(resolveHome(), 'storages', 'usage-stats-controls.json'),
    sources: {
      providers: (excluded) => readProviderQuotas(true, excluded),
      workbuddy: workBuddyQuotaSource(ctx),
      'workbuddy-ai': workBuddyQuotaSource(ctx, undefined, 'workbuddy-ai'),
    },
  })
  const storePath = resolveStorePath()
  let state = defaultState()
  let syncPromise = null
  let syncTz = null

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

  /** Single-flight refresh; a different offset waits for the active pass. */
  const sync = (tz = state.tz) => {
    if (syncPromise !== null) {
      if (syncTz === tz) return syncPromise
      return syncPromise.then(() => sync(tz))
    }
    syncTz = tz
    syncPromise = syncCorpus(ctx, tz, state)
      .then(async (result) => {
        if (result.changed > 0 || result.tzChanged) await persistState(state, storePath)
        return result
      })
      .catch((error) => {
        state.partial = true
        console.warn('[dsh-usage-stats] sync failed:', String(error && error.message || error))
        return { tz: state.tz, changed: 0, failed: 1, readMs: 0, sessionCount: state.lastSessionsCount, error: String(error && error.message || error) }
      })
      .finally(() => {
        syncPromise = null
        syncTz = null
      })
    return syncPromise
  }

  /** Start a refresh and wait at most MAX_WAIT_MS before serving current data. */
  const syncWithBudget = (tz) => {
    const p = sync(tz)
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
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
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
        const modelKey = (params.get('model') || '').trim() || null
        const tzParam = params.get('tz')
        const requestedTz = tzParam === null || tzParam === '' ? SYSTEM_TZ : clampTz(tzParam)
        const fresh = params.get('fresh') === '1'
        try {
          await ensureLoaded()
          const staleByTtl = Date.now() - (state.syncedAt || 0) > CACHE_TTL_MS
          if (state.tz !== requestedTz) {
            // A timezone switch must finish before the snapshot is served.
            await sync(requestedTz)
          } else if (fresh || staleByTtl || state.partial) {
            await syncWithBudget(requestedTz)
          }
          if (state.tz !== requestedTz) throw new Error('requested timezone is not ready')
          const now = Date.now()
          const data = foldResponse(state, days, modelKey, state.tz, now)
          const stale = syncPromise !== null || state.partial || now - (state.syncedAt || 0) > CACHE_TTL_MS
          writeJson(res, 200, {
            ok: true,
            days,
            model: modelKey,
            tz: state.tz,
            totals: serializeBucket(data.totals),
            overview: data.overview,
            messages: data.messages,
            sessions: state.lastSessionsCount,
            sessionsWithUsage: data.sessionsWithUsage,
            firstTime: data.firstTime,
            lastTime: data.lastTime,
            byDay: data.byDay.map((d) => ({ date: d.date, ...serializeBucket(d.bucket) })),
            byDayModels: data.byDayModels,
            byWeek: data.byWeek.map((w) => ({ date: w.date, ...serializeBucket(w.bucket) })),
            byHour: data.byHour.map((h) => ({ hour: h.hour, ...serializeBucket(h.bucket) })),
            byHourModels: data.byHourModels,
            byModel: data.byModel.map((m) => ({ key: m.key, provider: m.provider, model: m.model, lastTime: m.lastTime, ...serializeBucket(m.bucket) })),
            syncedAt: state.syncedAt || 0,
            stale,
            partial: state.partial,
            scanMs: Date.now() - t0,
          })
        } catch {
          writeJson(res, 500, { ok: false, error: '用量统计暂时不可用，请稍后重试。' })
        }
      },
    }),
    'dsh-usage-stats: routes',
  )

  ctx.effect(
    () => webServer.register({
      kind: 'exact',
      path: '/api/dsh-usage-stats/provider-quotas',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const fresh = readQuery(req).get('fresh') === '1'
        try {
          writeJson(res, 200, await quotaControls.read('providers', fresh))
        } catch {
          // This route never sends credential or upstream error text to the renderer.
          writeJson(res, 200, { ok: true, quotas: [] })
        }
      },
    }),
    'dsh-usage-stats: official provider quota route',
  )

  const trustedControlRequest = (req, res) => {
    if (!isLoopbackRequest(req)) { writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' }); return false }
    try {
      const host = new URL('http://' + req.headers.host).hostname
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) throw new Error()
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new Error()
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new Error()
    } catch { writeJson(res, 403, { ok: false, error: '请求来源不受信任。' }); return false }
    return true
  }
  const readControlBody = async (req) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new QuotaControlError('请使用 JSON 请求。')
    let bytes = 0
    const chunks = []
    for await (const chunk of req) {
      bytes += Buffer.byteLength(chunk)
      if (bytes > 32_768) throw new QuotaControlError('请求内容超过 32 KB。')
      chunks.push(Buffer.from(chunk))
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new QuotaControlError('请求内容不是有效 JSON。') }
  }
  const registerControl = (path, handler) => ctx.effect(() => webServer.register({
    kind: 'exact', path: '/api/dsh-usage-stats/' + path,
    handler: async (req, res) => {
      if (!trustedControlRequest(req, res)) return
      try { await handler(req, res) } catch (error) { writeJson(res, error instanceof QuotaControlError ? 400 : 500, { ok: false, error: error instanceof QuotaControlError ? error.message : '操作失败，请稍后重试。' }) }
    },
  }), 'dsh-usage-stats: ' + path)
  registerControl('controls', async (req, res) => {
    if (req.method === 'GET') writeJson(res, 200, await quotaControls.get())
    else if (guard(req, res, 'POST')) writeJson(res, 200, await quotaControls.update(await readControlBody(req)))
  })
  registerControl('quota-providers', async (req, res) => {
    if (guard(req, res, 'GET')) writeJson(res, 200, await quotaControls.providers())
  })
  registerControl('quota-test', async (req, res) => {
    if (!guard(req, res, 'POST')) return
    const body = await readControlBody(req)
    writeJson(res, 200, await quotaControls.test(body.provider, body.template))
  })
  for (const source of ['workbuddy', 'workbuddy-ai']) {
    registerControl(source, async (req, res) => {
      if (guard(req, res, 'GET')) writeJson(res, 200, await quotaControls.read(source, readQuery(req).get('fresh') === '1'))
    })
  }

  void quotaControls.tick().catch(() => {})
  ctx.effect(() => ctx.interval(() => { void quotaControls.tick().catch(() => {}) }, 30_000), 'dsh-usage-stats: automatic quota refresh')
  ctx.effect(() => () => quotaControls.dispose(), 'dsh-usage-stats: quota controls cleanup')

  // Background keep-fresh: build + persist corpus shortly after boot so the
  // first page open is served from warm memory, and keep it warm thereafter.
  void ensureLoaded().then(() => {
    return sync().catch(() => {})
  })

  ctx.effect(
    () => ctx.interval(() => {
      void sync().catch(() => {})
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
