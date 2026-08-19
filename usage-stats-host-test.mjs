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

console.log('DONE')
