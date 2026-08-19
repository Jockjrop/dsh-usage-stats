/**
 * dsh-usage-stats — host half. Aggregates token usage from every session's
 * durable log (the `assistant/message` events carry `usage` accounting plus
 * provider/model provenance) and serves read-only /api/dsh-usage-stats/*
 * routes for the browser settings page (用量统计). The browser half
 * (./client) registers the settings section with the heatmap, the 24-hour
 * token chart, and the per-model breakdown.
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
