// Offline/host-hermetic verification of the dsh-usage-stats host logic.
// Part 1: foldResponse() cross-checked against an independent brute-force
// aggregation. Part 2: syncCorpus() incremental behavior under an isolated
// DSH_HOME with real fingerprint files on disk.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync, utimesSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanSessionEvents, foldResponse, localDayKey, localMondayKey, syncCorpus, collectFileFps, defaultState, persistState, loadState } from './lib/index.js'

const TZ = -480 // UTC+8, China
const now = Date.now()
const day = 86400000

function usage(ev, time, modelKey) {
  ev.time = time
  const split = modelKey.indexOf('/')
  ev.data = { usage: { inputTokens: 10, outputTokens: 5 }, message: { source: { provider: modelKey.slice(0, split), model: modelKey.slice(split + 1) } } }
}

function makeSessions() {
  const events = []
  const models = ['deepseek/deepseek-chat', 'deepseek/deepseek-reasoner', 'glm/glm-4v']
  const sessions = []
  for (let s = 0; s < 3; s++) {
    const log = []
    for (let d = -2; d <= 0; d++) {
      for (let m = 0; m < models.length; m++) {
        const ev = { type: 'assistant/message' }
        usage(ev, now + d * day + m * 3600000 + s * 1000, models[m])
        log.push(ev)
      }
    }
    log.push({ type: 'assistant/message', data: { message: { content: [] } }, time: now })
    log.push({ type: 'user/message', data: { content: [] }, time: now })
    sessions.push(log)
    events.push(...log)
  }
  return { sessions, events }
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL: ' + msg)
    process.exitCode = 1
  } else {
    console.log('ok: ' + msg)
  }
}

const parts = makeSessions()

/* ------------------- Part 1: fold correctness ------------------- */
const refTotals = 0
const refByDay = new Map()
const refByDayModel = new Map()
for (const ev of parts.events) {
  if (!ev || ev.type !== 'assistant/message') continue
  const u = ev.data && ev.data.usage
  if (!u || !(ev.time > 0)) continue
  const src = ev.data.message && ev.data.message.source
  const mk = (src ? String(src.provider) : 'unknown') + '/' + (src ? String(src.model) : 'unknown')
  const billed = u.inputTokens + u.outputTokens + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0)
  refTotals + billed
  const dk = localDayKey(ev.time, TZ)
  refByDay.set(dk, (refByDay.get(dk) || 0) + billed)
  refByDayModel.set(dk + '|' + mk, (refByDayModel.get(dk + '|' + mk) || 0) + billed)
}
let refTotalBilled = 0
for (const v of refByDay.values()) refTotalBilled += v

// byHour now reports the CURRENT local day only (one bar per hour of today).
const todayKey = localDayKey(now, TZ)
let refTodayBilled = 0
let refTodayFiltered = 0
for (const ev of parts.events) {
  if (!ev || ev.type !== 'assistant/message') continue
  const u = ev.data && ev.data.usage
  if (!u || !(ev.time > 0)) continue
  if (localDayKey(ev.time, TZ) !== todayKey) continue
  const src = ev.data.message && ev.data.message.source
  const mk = (src ? String(src.provider) : 'unknown') + '/' + (src ? String(src.model) : 'unknown')
  const billed = u.inputTokens + u.outputTokens + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0)
  refTodayBilled += billed
  if (mk === 'deepseek/deepseek-chat') refTodayFiltered += billed
}

const state0 = defaultState()
state0.tz = TZ
state0.syncedAt = now
let sidx = 0
for (const log of parts.sessions) {
  const contribution = scanSessionEvents(log, TZ)
  contribution.fp = null
  state0.sessions['session-' + sidx++] = contribution
}

let out = foldResponse(state0, 0, null, TZ, now)
assert(out.messages === 27, 'messages = 27, got ' + out.messages)
assert(out.totals.billed === refTotalBilled, 'totals.billed matches reference (' + out.totals.billed + ' vs ' + refTotalBilled + ')')
assert(out.sessionsWithUsage === 3, 'sessionsWithUsage = 3')
assert(out.byDay.length === 3, 'byDay = 3 distinct days, got ' + out.byDay.length)
let dayBilled = 0
for (const d of out.byDay) dayBilled += d.bucket.billed
assert(dayBilled === refTotalBilled, 'byDay sum matches reference (' + dayBilled + ')')
assert(out.byHour.length === 24, 'byHour = 24 hours, got ' + out.byHour.length)
let hourBilled = 0
for (const h of out.byHour) {
  assert(h.hour >= 0 && h.hour <= 23, 'hour in range 0..23, got ' + h.hour)
  hourBilled += h.bucket.billed
}
assert(hourBilled === refTodayBilled, 'byHour = today only (' + hourBilled + ' vs today ' + refTodayBilled + ')')
assert(out.byModel.length === 3, 'byModel = 3 models, got ' + out.byModel.length)

out = foldResponse(state0, 2, null, TZ, now)
assert(out.byDay.length === 2, 'days=2 -> byDay=2 (' + out.byDay.map((d) => d.date).join(',') + ')')

out = foldResponse(state0, 0, 'deepseek/deepseek-chat', TZ, now)
assert(out.byModel.length === 1 && out.byModel[0].key === 'deepseek/deepseek-chat', 'model filter -> single model list')
let filteredRef = 0
for (const k of refByDayModel.keys()) if (k.endsWith('|deepseek/deepseek-chat')) filteredRef += refByDayModel.get(k)
assert(out.totals.billed === filteredRef, 'model-filtered totals match reference (' + out.totals.billed + ' vs ' + filteredRef + ')')
let filteredHourBilled = 0
for (const h of out.byHour) filteredHourBilled += h.bucket.billed
assert(filteredHourBilled === refTodayFiltered, 'model-filtered byHour = today only (' + filteredHourBilled + ' vs ' + refTodayFiltered + ')')

/* ------------------- Part 2: incremental sync ------------------- */
const tmp = mkdtempSync(join(tmpdir(), 'dsh-usage-test-'))
const sessionsRoot = join(tmp, 'sessions')
try {
  process.env.DSH_HOME = tmp
  const ids = ['session-a', 'session-b', 'session-c']
  const currentIds = [...ids]
  const eventsById = {}
  const models = ['deepseek/deepseek-chat', 'deepseek/deepseek-reasoner']
  ids.forEach((id, si) => {
    const log = []
    for (let m = 0; m < models.length; m++) {
      const ev = { type: 'assistant/message' }
      usage(ev, now - day + m * 777 + si, models[m])
      log.push(ev)
    }
    eventsById[id] = log
    const dir = join(sessionsRoot, '--ws--', id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'session.jsonl.zstd'), Buffer.from('log-' + id))
    utimesSync(join(dir, 'session.jsonl.zstd'), new Date(1700000000000 + si), new Date(1700000000000 + si))
  })

  const query = {
    listSessions: async () => currentIds.map((id) => ({ header: { id }, live: false, persisted: true })),
    readSession: async (id) => {
      readLog.calls++
      return { events: eventsById[id] || [] }
    },
  }
  const readLog = { calls: 0 }
  const ctx = { get: () => query }

  const fps0 = await collectFileFps()
  assert(fps0.size === 3, 'collectFileFps finds 3 files, got ' + fps0.size)

  const st = defaultState()
  const r1 = await syncCorpus(ctx, TZ, st)
  assert(r1.changed === 3, 'first sync re-reads all 3 sessions, changed=' + r1.changed)
  assert(readLog.calls === 3, 'reads=3 after first sync, got ' + readLog.calls)
  assert(Object.keys(st.sessions).length === 3, 'state has 3 sessions')
  assert(st.tz === TZ, 'state.tz set to ' + st.tz)
  const stBilled = foldResponse(st, 0, null, TZ, now).totals.billed
  assert(stBilled === 3 * 2 * 15, 'corpus billed = 3*2*15 = 90, got ' + stBilled)

  // unchanged → no reads
  const readBefore2 = readLog.calls
  const r2 = await syncCorpus(ctx, TZ, st)
  assert(r2.changed === 0, 'unchanged files -> rereads 0, changed=' + r2.changed)
  assert(readLog.calls === readBefore2, 'no extra reads on unchanged sync')

  // append to one file → changed=1
  const appendTarget = join(sessionsRoot, '--ws--', 'session-b', 'session.jsonl.zstd')
  appendFileSync(appendTarget, Buffer.from('X'))
  utimesSync(appendTarget, new Date(Date.now() / 1000 * 1000), new Date(Date.now() / 1000 * 1000))
  const readBefore3 = readLog.calls
  const r3 = await syncCorpus(ctx, TZ, st)
  assert(r3.changed === 1, 'one appended file -> changed=1, got ' + r3.changed)
  assert(readLog.calls === readBefore3 + 1, 'exactly one extra read on partial change')

  // delete a session → its measured contribution is RETAINED forever
  // (deleting/archiving a conversation must not erase the real token spend)
  rmSync(join(sessionsRoot, '--ws--', 'session-c'), { recursive: true, force: true })
  currentIds.splice(currentIds.indexOf('session-c'), 1)
  const r4 = await syncCorpus(ctx, TZ, st)
  assert(st.sessions['session-c'] && st.sessions['session-c'].retained === true, 'deleted session retained with flag')
  assert(Object.keys(st.sessions).length === 3, 'retained session stays in state (3 total)')
  assert(r4.changed === 0, 'deletion: changed=0 (removal handled by list diff)')

  // tz change → re-buckets everything
  const r5 = await syncCorpus(ctx, TZ + 60, st)
  assert(st.tz === TZ + 60, 'tz updated to ' + st.tz)
  assert(r5.changed === 2, 'tz change re-reads remaining 2 sessions')

  // persist + reload round trip (with lockstep tz back)
  await syncCorpus(ctx, TZ, st)
  const storePath = join(tmp, 'storages', 'usage-stats-corpus.json')
  await persistState(st, storePath)
  assert(existsSync(storePath), 'corpus persisted to disk')
  const st2 = await loadState(storePath)
  assert(Object.keys(st2.sessions).length === 3, 'reload keeps retained session (3 total)')
  const reloadedBilled = foldResponse(st2, 0, null, TZ, now).totals.billed
  assert(reloadedBilled === stBilled, 'retained totals preserved across reload (' + reloadedBilled + ')')
  const readBefore6 = readLog.calls
  const r6 = await syncCorpus(ctx, TZ, st2)
  assert(r6.changed === 0, 'reloaded + unchanged files -> no rereads')
  assert(readLog.calls === readBefore6, 'no reads after reload on unchanged corpus')
} finally {
  rmSync(tmp, { recursive: true, force: true })
  delete process.env.DSH_HOME
}

/* ------------------- Part 3: opencode-go stats ------------------- */
// Hermetic: scratch SQLite database created with node:sqlite (skipped when
// the runtime lacks the builtin). Verifies the fold of the `session` table
// into totals / byDay / byModel / recent, plus findOpencodeDb() honoring
// OPENCODE_DATA.
import { collectOpencodeStats, findOpencodeDb, localHourKey } from './lib/index.js'

const ocTmp = mkdtempSync(join(tmpdir(), 'dsh-usage-oc-'))
const ocDbPath = join(ocTmp, 'opencode.db')
const ocBefore = process.env.OPENCODE_DATA
process.env.OPENCODE_DATA = ocTmp
try {
  let DatabaseSync = null
  try {
    const sqlite = await import('node:sqlite')
    DatabaseSync = sqlite.DatabaseSync
  } catch {
    DatabaseSync = null
  }
  if (DatabaseSync === null) {
    console.log('skip: node:sqlite unavailable, opencode part skipped')
  } else {
    const ocDb = new DatabaseSync(ocDbPath)
    ocDb.exec('CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT, model TEXT, cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER, summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER, time_created INTEGER)')
    ocDb.exec('CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT)')
    const ins = ocDb.prepare('INSERT INTO session (id, title, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, summary_additions, summary_deletions, summary_files, time_created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    // Two sessions on day A (same model), one on day B (different model), one
    // inside the 5-hour window (1 h ago), one far outside the 30-day window.
    const dayA = now - 86400000
    const dayB = now - 2 * 86400000
    const hourAgo = now - 3600000
    const old40d = now - 40 * 86400000
    ins.run('s1', '第一会话', JSON.stringify({ id: 'm1', providerID: 'opencode', variant: 'max' }), 0.001234, 100, 50, 10, 1000, 0, 5, 2, 1, dayA)
    ins.run('s2', '第二会话', JSON.stringify({ id: 'm1', providerID: 'opencode', variant: 'max' }), 0, 200, 100, 20, 2000, 0, 0, 0, 0, dayA)
    ins.run('s3', '第三会话', 'm2', 0.5, 10, 20, 0, 0, 30, 1, 0, 1, dayB)
    ins.run('s4', '第四会话', JSON.stringify({ id: 'm4', providerID: 'opencode', variant: '' }), 0.01, 30, 10, 5, 500, 0, 0, 0, 0, hourAgo)
    ins.run('s5', '第五会话', JSON.stringify({ id: 'm5', providerID: 'opencode', variant: 'old' }), 0, 9999, 1, 0, 0, 0, 0, 0, 0, old40d)
    ocDb.prepare('INSERT INTO message (id, session_id, time_created, data) VALUES (?,?,?,?)').run('msg1', 's1', dayA, '{}')
    ocDb.prepare('INSERT INTO message (id, session_id, time_created, data) VALUES (?,?,?,?)').run('msg2', 's2', dayA, '{}')
    ocDb.close()

    const found = await findOpencodeDb()
    assert(found === ocDbPath, 'findOpencodeDb honours OPENCODE_DATA (' + found + ')')

    const oc = await collectOpencodeStats(ocDbPath, TZ, now)
    assert(oc.ok === true && oc.available === true, 'collectOpencodeStats ok+available')
    assert(oc.totals.sessions === 5, 'oc totals.sessions = 5, got ' + oc.totals.sessions)
    assert(oc.totals.messages === 2, 'oc totals.messages = 2, got ' + oc.totals.messages)
    assert(oc.totals.inputTokens === 10339, 'oc input = 10339, got ' + oc.totals.inputTokens)
    assert(oc.totals.outputTokens === 181, 'oc output = 181, got ' + oc.totals.outputTokens)
    assert(oc.totals.reasoningTokens === 35, 'oc reasoning = 35, got ' + oc.totals.reasoningTokens)
    assert(oc.totals.cacheReadTokens === 3500, 'oc cacheRead = 3500, got ' + oc.totals.cacheReadTokens)
    assert(oc.totals.cacheWriteTokens === 30, 'oc cacheWrite = 30, got ' + oc.totals.cacheWriteTokens)
    assert(oc.totals.billed === 14050, 'oc billed = input+output+cache, got ' + oc.totals.billed)
    assert(Math.abs(oc.totals.cost - 0.5112) < 1e-9, 'oc cost rounded to 4dp, got ' + oc.totals.cost)
    assert(oc.totals.additions === 6 && oc.totals.deletions === 2 && oc.totals.files === 2, 'oc diff stats folded')
    assert(oc.byDay.length === 4, 'oc byDay = 4 distinct days, got ' + oc.byDay.length)
    const dayABucket = oc.byDay.find((d) => d.date === localDayKey(dayA, TZ))
    assert(dayABucket && dayABucket.billed === 100 + 50 + 1000 + 200 + 100 + 2000, 'oc byDay dayA billed matches, got ' + (dayABucket && dayABucket.billed))
    assert(dayABucket && dayABucket.sessions === 2, 'oc byDay dayA sessions = 2')
    assert(oc.byModel.length === 4, 'oc byModel = 4, got ' + oc.byModel.length)
    const m1 = oc.byModel.find((m) => m.id === 'm1')
    assert(m1 && m1.sessions === 2 && m1.billed === 100 + 50 + 1000 + 200 + 100 + 2000, 'oc m1 aggregated across sessions')
    assert(m1 && m1.variant === 'max', 'oc m1 variant parsed from JSON')
    const m2 = oc.byModel.find((m) => m.id === 'm2')
    assert(m2 && m2.provider === 'unknown', 'oc plain-string model -> provider unknown')
    assert(oc.byModel[0].key === 'opencode/m5', 'oc byModel sorted by billed desc (' + oc.byModel[0].key + ')')
    assert(oc.recent.length === 5, 'oc recent = 5 sessions, got ' + oc.recent.length)
    assert(oc.recent[0].title === '第四会话', 'oc recent newest first, got ' + oc.recent[0].title)

    // Rolling quota windows: 5 hours / 7 days / 30 days (exact from
    // timestamps). s4 is inside the 5-hour window; s1..s4 inside week/month;
    // s5 (40 days old) must be excluded from month.
    assert(oc.windows, 'oc response carries windows')
    assert(oc.windows.h5.sessions === 1 && oc.windows.h5.billed === 540, 'oc h5 window = 1 session / 540 billed, got ' + JSON.stringify(oc.windows.h5))
    assert(oc.windows.h5.inputTokens === 30 && oc.windows.h5.outputTokens === 10 && oc.windows.h5.reasoningTokens === 5 && oc.windows.h5.cacheReadTokens === 500, 'oc h5 window token split')
    assert(Math.abs(oc.windows.h5.cost - 0.01) < 1e-9, 'oc h5 window cost = 0.01, got ' + oc.windows.h5.cost)
    assert(oc.windows.week.sessions === 4 && oc.windows.week.billed === 4050, 'oc week window = 4 sessions / 4050 billed, got ' + JSON.stringify(oc.windows.week))
    assert(oc.windows.week.inputTokens === 340 && oc.windows.week.outputTokens === 180 && oc.windows.week.reasoningTokens === 35 && oc.windows.week.cacheReadTokens === 3500 && oc.windows.week.cacheWriteTokens === 30, 'oc week window token split')
    assert(Math.abs(oc.windows.week.cost - 0.5112) < 1e-9, 'oc week window cost = 0.5112, got ' + oc.windows.week.cost)
    assert(oc.windows.month.sessions === 4 && oc.windows.month.billed === 4050, 'oc month window excludes 40-day-old session (4 / 4050), got ' + JSON.stringify(oc.windows.month))

    // Per-hour buckets inside the 5-hour window (viewer tz).
    assert(Array.isArray(oc.h5Hours) && oc.h5Hours.length === 1, 'oc h5Hours = 1 hour bucket, got ' + (oc.h5Hours && oc.h5Hours.length))
    const hb = oc.h5Hours[0]
    const h5ExpHour = localHourKey(hourAgo, TZ)
    assert(hb.hour === h5ExpHour, 'oc h5Hours hour = ' + h5ExpHour + ', got ' + hb.hour)
    const h5ExpStart = Date.parse(localDayKey(hourAgo, TZ) + 'T00:00:00Z') + TZ * 60000 + h5ExpHour * 3600000
    assert(hb.hourStart === h5ExpStart, 'oc h5Hours hourStart matches (' + hb.hourStart + ')')
    assert(hb.sessions === 1 && hb.billed === 540 && hb.inputTokens === 30, 'oc h5Hours bucket contents, got ' + JSON.stringify(hb))
    let h5Sum = 0
    for (const h of oc.h5Hours) h5Sum += h.billed
    assert(h5Sum === oc.windows.h5.billed, 'oc h5Hours sum equals h5 window (' + h5Sum + ')')
  }
} finally {
  rmSync(ocTmp, { recursive: true, force: true })
  if (ocBefore === undefined) delete process.env.OPENCODE_DATA
  else process.env.OPENCODE_DATA = ocBefore
}

console.log('DONE')
