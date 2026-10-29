import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  defaultState,
  scanSessionEvents,
  foldResponse,
  foldDashboard,
  foldCosts,
  modelDetectionContribution,
  foldSessionRows,
  syncCorpus,
  collectFileFps,
  persistState,
  loadState,
  apply,
} from '../src/index.js'

function usageEvent(iso, model, billed) {
  return {
    type: 'assistant/message',
    time: Date.parse(iso),
    data: {
      usage: { inputTokens: billed },
      message: { source: { provider: 'test', model } },
    },
  }
}

function speedEvents(iso, provider, model, tokens, decodeMs, step = 1, ttftMs = 2000) {
  const time = Date.parse(iso)
  return [
    { type: 'step/start', time: time - decodeMs - ttftMs, data: { turn: 1, step } },
    { type: 'assistant/message', time, data: { turn: 1, step,
      message: { source: { provider, model } }, usage: { outputTokens: tokens },
      stream: [{ type: 'text-chunks', time0: time - decodeMs, dt: [decodeMs - 50], texts: ['PRIVATE_FIRST', 'PRIVATE_LAST'] },
        { type: 'chunk', time: time - 10, chunk: { type: 'finish' } }],
    } },
  ]
}

test('forked sessions count only their own spend and timing, and migrate cached inherited usage once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-fork-usage-'))
  const priorHome = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  try {
    const { mkdir, rm } = await import('node:fs/promises')
    const { DatabaseSync } = await import('node:sqlite')
    await mkdir(join(dir, 'sessions'))
    const db = new DatabaseSync(join(dir, 'sessions', 'sessions.sqlite'))
    db.exec("CREATE TABLE t_sessions (f_session_id TEXT, f_head_sequence INTEGER); INSERT INTO t_sessions VALUES ('parent', 10), ('fork', 20)")
    db.close()
    const parentStart = Date.parse('2026-10-01T11:00:00Z')
    const parent = [{ type: 'turn/start', time: parentStart, data: { turn: 1 } },
      ...speedEvents('2026-10-01T12:00:00Z', 'p', 'm', 200, 2000),
      { type: 'turn/end', time: parentStart + 3600000, data: { turn: 1 } }]
    const ownStart = Date.parse('2026-10-02T12:00:00Z') - 5000
    const own = [{ type: 'session/end-seed', time: parentStart + 3600000, data: { inherited: true } },
      { type: 'turn/start', time: ownStart, data: { turn: 2 } },
      ...speedEvents('2026-10-02T12:00:00Z', 'p', 'm', 100, 4000, 2, 1000).map(e => ({ ...e, data: { ...e.data, turn: 2 } })),
      { type: 'turn/end', time: ownStart + 5000, data: { turn: 2 } }]
    const state = defaultState(); state.tz = 0
    state.sessions.parent = { ...scanSessionEvents(parent, 0), fp: { size: 10, mtimeMs: 10 } }
    state.sessions.fork = { ...scanSessionEvents([...parent, ...own], 0), fp: { size: 20, mtimeMs: 20 } }
    delete state.sessions.parent.ownUsageVersion
    delete state.sessions.fork.ownUsageVersion
    const reads = []
    const query = { listSessions: async () => [{ header: { id: 'parent' } }, { header: { id: 'fork', isSeeded: true } }],
      readSession: async id => { reads.push(id); return id === 'parent' ? { events: parent, inheritedEventCount: 0 } : { events: [...parent, ...own], inheritedEventCount: parent.length } } }
    const ctx = { get: () => query }
    await syncCorpus(ctx, 0, state)
    let stats = foldResponse(state, 0, null, 0, Date.parse('2026-10-04T12:00:00Z'))
    assert.equal(stats.totals.billed, 300, 'the parent charge is billed once, independently of fork history')
    assert.equal(stats.totals.calls, 2)
    assert.equal(state.sessions.fork.totals.billed, 100)
    assert.equal(state.sessions.fork.longestTaskMs, 5000)
    assert.equal(stats.tokenSpeeds[0].tokensPerSecond, 50)
    assert.equal(stats.tokenSpeeds[0].samples, 2)
    assert.equal(stats.tokenSpeeds[0].averageTtftMs, 1500)
    await persistState(state, join(dir, 'corpus.json'))
    const restored = await loadState(join(dir, 'corpus.json'))
    await syncCorpus(ctx, 0, restored)
    assert.deepEqual(reads.sort(), ['fork', 'parent'], 'migration persists and does not reread unchanged logs')
    await syncCorpus({ get: () => ({ listSessions: async () => [] }) }, -345, restored)
    stats = foldResponse(restored, 0, null, -345, Date.parse('2026-10-04T12:00:00Z'))
    assert.equal(stats.totals.billed, 300, 'deleted sessions keep their measured own usage across timezone changes')
    assert.equal(restored.sessions.fork.longestTaskMs, 5000)
    await rm(join(dir, 'sessions'), { recursive: true, force: true })
  } finally {
    if (priorHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = priorHome
    const { rm } = await import('node:fs/promises'); await rm(dir, { recursive: true, force: true })
  }
})

test('overview metrics aggregate days across sessions, rank recent models by calls and ignore chart filters', () => {
  const state = defaultState(); state.tz = -480
  const event = (date, provider, model, usage) => ({ type: 'assistant/message', time: Date.parse(date + 'T12:00:00Z'), data: { usage, message: { source: { provider, model } } } })
  state.sessions.one = scanSessionEvents([
    event('2026-08-10', 'old', 'old-model', { inputTokens: 800, cacheReadTokens: 100, cacheWriteTokens: 100 }),
    ...Array.from({ length: 6 }, (_, i) => event('2026-08-' + (11 + i), 'old', 'old-model', { inputTokens: 10 })),
    event('2026-09-30', 'one', 'vendor/Model-A', { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, reasoningTokens: 15 }),
    event('2026-10-01', 'two', 'MODEL-A', { outputTokens: 5 }),
    event('2026-10-02', 'one', 'expensive', { outputTokens: 600 }),
    event('2026-10-03', 'one', 'Model-A', { inputTokens: 5 }),
  ], -480)
  const turnTime = Date.parse('2026-10-02T02:00:00Z')
  state.sessions.two = scanSessionEvents([
    event('2026-10-02', 'one', 'expensive', { outputTokens: 900 }),
    { type: 'turn/start', time: turnTime, data: { turn: 1 } },
    { type: 'turn/end', time: turnTime + 50000, data: { turn: 1 } },
  ], -480)
  const detection = modelDetectionContribution({ usage: () => [{ time: Date.parse('2026-10-04T01:00:00Z'), selection: { provider: 'detection', model: 'model-a' }, usage: { outputTokens: 7 }, usageReported: true, ttftMs: null, decodeMs: null }] }, -480)
  const now = Date.parse('2026-10-04T12:00:00Z')
  const all = foldResponse(state, 0, null, -480, now, [detection]).overview
  assert.equal(all.cacheHitRate, 130 / 1105) // reasoning/output are excluded
  assert.equal(all.peakDailyBilled, 1500); assert.equal(all.peakDay, '2026-10-02') // 2 sessions, same day
  assert.equal(all.longestTaskMs, 50000)
  assert.equal(all.currentStreak, 5); assert.equal(all.longestStreak, 7)
  assert.deepEqual(all.recentModel, { model: 'Model-A', calls: 4, providers: ['detection', 'one', 'two'], days: 7 })
  assert.deepEqual(foldResponse(state, 1, 'one/expensive', -480, now, [detection]).overview, all)
  assert.equal(foldResponse(state, 0, null, -480, now + 86400000, [detection]).overview.currentStreak, 5) // today not used yet
  assert.equal(foldResponse(state, 0, null, -480, now + 2 * 86400000, [detection]).overview.currentStreak, 0)
  const empty = foldResponse(defaultState(), 0, null, 0, now).overview
  assert.deepEqual([empty.cacheHitRate, empty.peakDay, empty.longestTaskMs, empty.currentStreak, empty.longestStreak, empty.recentModel], [null, null, null, 0, 0, null])
})

test('single-round task timing excludes inter-round idle gaps and survives retained-session timezone rebucketing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-task-timing-'))
  const t = Date.parse('2024-02-28T16:00:00Z'), start = (turn, time) => ({ type: 'turn/start', time, data: { turn } }), end = (turn, time) => ({ type: 'turn/end', time, data: { turn } })
  const events = [start(1, t), end(1, t + 65000), start(2, t + 10 * 86400000), end(2, t + 10 * 86400000 + 30000),
    end(99, t + 12 * 86400000), start(3, t + 15 * 86400000), end(4, t + 25 * 86400000), start(5, t + 30 * 86400000), end(5, t)]
  try {
    const state = defaultState(); state.tz = -480; state.sessions.one = scanSessionEvents(events, -480)
    assert.equal(state.sessions.one.longestTaskMs, 65000)
    assert.equal(scanSessionEvents([start(1, t)], 0).longestTaskMs, null)
    const path = join(dir, 'corpus.json'); await persistState(state, path)
    const restored = await loadState(path)
    await syncCorpus({ get: () => ({ listSessions: async () => [] }) }, 345, restored)
    assert.equal(restored.sessions.one.taskVersion, 1)
    assert.equal(foldResponse(restored, 1, null, 345, t).overview.longestTaskMs, 65000)
    assert.doesNotMatch(JSON.stringify(restored), /turn\/start|turn\/end|content/)
  } finally { const { rm } = await import('node:fs/promises'); await rm(dir, { recursive: true, force: true }) }
})

test('usage streaks follow local calendar days across leap years and fractional timezones', () => {
  const state = defaultState(); state.tz = -345
  state.sessions.one = scanSessionEvents([
    usageEvent('2024-02-28T18:14:00Z', 'm', 1), // Feb 28, 23:59
    usageEvent('2024-02-28T18:16:00Z', 'm', 1), // Feb 29, 00:01
    usageEvent('2024-02-29T18:16:00Z', 'm', 1), // Mar 1, 00:01
  ], -345)
  const result = foldResponse(state, 1, null, -345, Date.parse('2024-03-01T12:00:00Z')).overview
  assert.equal(result.currentStreak, 3); assert.equal(result.longestStreak, 3)
})

test('TPS ranks providers/models by cumulative decode time, not usage or averaged request rates', () => {
  const state = defaultState(); state.tz = 0
  state.sessions.one = scanSessionEvents([
    ...speedEvents('2026-10-01T12:00:00Z', 'relay', 'same', 1000, 1000, 1, 10000),
    ...speedEvents('2026-10-03T12:00:00Z', 'relay', 'same', 1000, 9000, 2),
    ...speedEvents('2026-10-03T12:00:00Z', 'direct', 'same', 200, 1000, 3),
    ...speedEvents('2026-10-03T12:00:00Z', 'relay', 'missing', 9999, 1000, 4).map(e => e.type === 'assistant/message' ? { ...e, data: { ...e.data, stream: [] } } : e),
    ...speedEvents('2026-10-03T12:00:00Z', 'relay', 'zero', 50, 1000, 5).map(e => e.type === 'assistant/message' ? { ...e, data: { ...e.data, stream: [{ type: 'text-chunks', time0: e.time, dt: [], texts: ['x'] }] } } : e),
    ...speedEvents('2026-10-03T12:00:00Z', 'relay', 'same', 0, 2000, 6),
  ], 0)
  state.sessions.two = scanSessionEvents(speedEvents('2026-10-03T13:00:00Z', 'relay', 'same', 1000, 8000), 0)
  const now = Date.parse('2026-10-03T18:00:00Z')
  const result = foldResponse(state, 0, null, 0, now)
  assert.deepEqual(result.tokenSpeeds.map(s => [s.key, s.samples, s.outputTokens, s.outputMs, s.tokensPerSecond]), [
    ['direct/same', 1, 200, 1000, 200], ['relay/same', 4, 3000, 20000, 150],
  ])
  assert.deepEqual(result.tokenSpeeds.map(s => [s.key, s.ttftMs, s.ttftSamples, s.averageTtftMs]), [
    ['direct/same', 2000, 1, 2000], ['relay/same', 16000, 4, 4000],
  ])
  assert.deepEqual(foldResponse(state, 1, null, 0, now).tokenSpeeds.map(s => [s.key, s.outputMs]), [['direct/same', 1000], ['relay/same', 19000]])
  assert.equal(foldResponse(state, 1, 'relay/same', 0, now).tokenSpeeds[0].averageTtftMs, 2000)
  assert.equal(foldResponse(state, 0, 'relay/same', 0, now).tokenSpeeds[0].tokensPerSecond, 150)
  assert.deepEqual(foldResponse(state, 0, 'relay/missing', 0, now).tokenSpeeds, [])
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE/)
})

test('TPS and TTFT mirror DSH first non-empty deltas, tool names, retry attempts and step boundaries', () => {
  const time = Date.parse('2026-10-03T12:00:00Z')
  const start = step => ({ type: 'step/start', time: time - 10000, data: { turn: 1, step } })
  const message = (step, stream, outputTokens = 800) => ({ type: 'assistant/message', time, data: {
    turn: 1, step, usage: { outputTokens }, message: { source: { provider: 'p', model: 'm' } }, stream,
  } })
  const events = [
    start(1), message(1, [{ type: 'text-chunks', time0: time - 9000, dt: [1000, 1000], texts: ['', 'a', 'b'] }]),
    start(2), message(2, [{ type: 'chunk', time: time - 9000, chunk: { type: 'text-delta', text: '' } },
      { type: 'chunk', time: time - 4000, chunk: { type: 'reasoning-delta', text: 'a' } }]),
    start(3), message(3, [{ type: 'tool-call-chunks', time0: time - 2000, dt: [], args: [''], name: 'tool' }]),
    start(4), { type: 'assistant/attempt', time: time - 5000, data: { turn: 1, step: 4,
      stream: [{ type: 'chunk', time: time - 6000, chunk: { type: 'tool-call-delta', name: 'tool', argumentsDelta: '' } }] } },
    { type: 'llm/retry', time: time - 4000, data: { turn: 1, step: 4 } },
    message(4, [{ type: 'text-chunks', time0: time - 1000, dt: [], texts: ['a'] }]),
    message(4, [{ type: 'text-chunks', time0: time - 1000, dt: [], texts: ['duplicate'] }]),
    start(5), { type: 'step/end', time: time - 1000, data: { turn: 1, step: 5 } },
    message(5, [{ type: 'text-chunks', time0: time - 1000, dt: [], texts: ['orphan'] }]),
    start(6), message(7, [{ type: 'text-chunks', time0: time - 1000, dt: [], texts: ['wrong-step'] }]),
    start(8), message(8, [{ type: 'text-chunks', time0: time - 1000, dt: [], texts: ['bad-usage'] }], '800'),
  ]
  const session = scanSessionEvents(events, 0)
  assert.deepEqual(session.usageEvents.map(e => e[8]), [8000, 4000, 2000, 6000, 0, 0, 0, 0])
  assert.deepEqual(session.ttftEvents.map(e => e[3]), [2000, 6000, 8000, 4000, 9000])
  const state = defaultState(); state.tz = 0; state.sessions.one = session
  const speed = foldResponse(state, 0, null, 0, time).tokenSpeeds[0]
  assert.equal(speed.samples, 4)
  assert.equal(speed.ttftSamples, 5)
  assert.equal(speed.averageTtftMs, 5800)
})

test('TTFT includes zero wait and completed messages without usage, excluding unfinished steps', () => {
  const iso = '2026-10-03T12:00:00Z'
  const withoutUsage = events => events.map(e => {
    if (e.type !== 'assistant/message') return e
    const { usage, ...data } = e.data
    return { ...e, data }
  })
  const session = scanSessionEvents([
    ...speedEvents(iso, 'p', 'm', 200, 2000, 1, 0),
    ...withoutUsage(speedEvents(iso, 'p', 'm', 200, 1000, 2, 6000)),
    ...withoutUsage(speedEvents(iso, 'p', 'ttft-only', 200, 1000, 3, 9000)),
    ...speedEvents(iso, 'p', 'm', 200, 1000, 4, 12000).map(e => e.type === 'assistant/message' ? { ...e, type: 'assistant/attempt' } : e),
  ], 0)
  assert.equal(session.messages, 1)
  assert.deepEqual(session.ttftEvents.map(e => e[3]), [0, 6000, 9000])
  const state = defaultState(); state.tz = 0; state.sessions.one = session
  const speeds = foldResponse(state, 0, null, 0, Date.parse(iso)).tokenSpeeds
  assert.equal(speeds.length, 1)
  assert.equal(speeds[0].key, 'p/m')
  assert.equal(speeds[0].samples, 1)
  assert.equal(speeds[0].ttftSamples, 2)
  assert.equal(speeds[0].averageTtftMs, 3000)
  assert.doesNotMatch(JSON.stringify(session), /PRIVATE/)
})

test('speed samples survive restarts and exact retained-session timezone changes; old rows remain usable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-speed-state-'))
  const oldHome = process.env.DSH_HOME; process.env.DSH_HOME = dir
  const file = join(dir, 'corpus.json')
  try {
    const state = defaultState(); state.tz = -480
    state.sessions.one = scanSessionEvents(speedEvents('2026-10-02T23:30:00Z', 'p', 'm', 200, 2000), -480)
    state.sessions.legacy = { ...scanSessionEvents(speedEvents('2026-10-02T23:30:00Z', 'legacy', 'm', 50, 2000), -480), speedVersion: 1 }
    delete state.sessions.legacy.ttftEvents
    state.sessions.old = scanSessionEvents([usageEvent('2026-10-02T10:00:00Z', 'old', 5)], -480)
    delete state.sessions.old.speedVersion
    state.sessions.old.usageEvents = state.sessions.old.usageEvents.map(e => e.slice(0, 8))
    await persistState(state, file)
    const loaded = await loadState(file)
    const now = Date.parse('2026-10-03T12:00:00Z')
    assert.equal(foldResponse(loaded, 1, null, -480, now).tokenSpeeds[0].tokensPerSecond, 100)
    assert.equal(foldResponse(loaded, 1, null, -480, now).tokenSpeeds[0].averageTtftMs, 2000)
    assert.equal(foldResponse(loaded, 1, 'legacy/m', -480, now).tokenSpeeds[0].averageTtftMs, null)
    await syncCorpus({ get: () => ({ listSessions: async () => [] }) }, 0, loaded)
    assert.equal(loaded.sessions.one.usageEvents[0][8], 2000)
    assert.equal(loaded.sessions.one.ttftEvents[0][3], 2000)
    assert.deepEqual(foldResponse(loaded, 1, null, 0, now).tokenSpeeds, [])
    assert.equal(foldResponse(loaded, 0, null, 0, now).tokenSpeeds[0].tokensPerSecond, 100)
    assert.equal(foldResponse(loaded, 0, null, 0, now).tokenSpeeds[0].averageTtftMs, 2000)
    assert.equal(foldResponse(loaded, 0, 'legacy/m', 0, now).tokenSpeeds[0].averageTtftMs, null)
    assert.equal(loaded.sessions.old.totals.billed, 5)
    assert.doesNotMatch(JSON.stringify(loaded), /PRIVATE/)
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome
    const { rm } = await import('node:fs/promises'); await rm(dir, { recursive: true, force: true })
  }
})

test('unchanged session fingerprints rescan once to add speed, TTFT or task timing fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-speed-migration-'))
  const oldHome = process.env.DSH_HOME; process.env.DSH_HOME = dir
  try {
    const { mkdir, rm } = await import('node:fs/promises')
    const { DatabaseSync } = await import('node:sqlite')
    await mkdir(join(dir, 'sessions'))
    const db = new DatabaseSync(join(dir, 'sessions', 'sessions.sqlite'))
    db.exec("CREATE TABLE t_sessions (f_session_id TEXT, f_head_sequence INTEGER); INSERT INTO t_sessions VALUES ('one', 10)")
    db.close()
    const time = Date.parse('2026-10-03T12:00:00Z')
    const events = [{ type: 'turn/start', time: time - 6000, data: { turn: 1 } },
      ...speedEvents('2026-10-03T12:00:00Z', 'p', 'm', 200, 2000),
      { type: 'turn/end', time, data: { turn: 1 } }]
    for (const speedVersion of [0, 1, 2]) {
      const state = defaultState(); state.tz = 0
      state.sessions.one = { ...scanSessionEvents(events, 0), speedVersion, fp: { size: 10, mtimeMs: 10 } }
      delete state.sessions.one.ttftEvents
      if (speedVersion === 0) state.sessions.one.usageEvents = state.sessions.one.usageEvents.map(e => e.slice(0, 8))
      if (speedVersion === 2) { state.sessions.one.taskVersion = 0; state.sessions.one.longestTaskMs = null }
      let reads = 0
      const ctx = { get: () => ({ listSessions: async () => [{ header: { id: 'one' } }], readSession: async () => { reads++; return { events } } }) }
      await syncCorpus(ctx, 0, state)
      await syncCorpus(ctx, 0, state)
      assert.equal(reads, 1)
      assert.equal(state.sessions.one.usageEvents[0][8], 2000)
      assert.equal(state.sessions.one.ttftEvents[0][3], 2000)
      assert.equal(state.sessions.one.speedVersion, 2)
      assert.equal(state.sessions.one.taskVersion, 1)
      assert.equal(state.sessions.one.longestTaskMs, 6000)
      assert.equal(state.sessions.one.totals.calls, 1)
    }
    await rm(join(dir, 'sessions'), { recursive: true, force: true })
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome
    const { rm } = await import('node:fs/promises'); await rm(dir, { recursive: true, force: true })
  }
})

test('session details filter dates, models and projects, sort totals and clamp pagination', () => {
  const state = defaultState(); state.tz = -480
  state.sessions.one = { ...scanSessionEvents([
    usageEvent('2026-09-01T10:00:00Z', 'old', 100),
    usageEvent('2026-09-29T10:00:00Z', 'recent', 5),
  ], -480), title: '统计优化', cwd: 'D:\\project-one' }
  state.sessions.two = { ...scanSessionEvents([usageEvent('2026-09-28T10:00:00Z', 'recent', 9)], -480), title: 'Other', cwd: 'D:\\project-two', retained: true }
  const now = Date.parse('2026-09-29T12:00:00Z')
  const all = foldSessionRows(state, { sort: 'tokens', pageSize: 1, page: 90 }, now)
  assert.equal(all.page, 2); assert.equal(all.pages, 2); assert.equal(all.total, 2)
  assert.equal(all.rows[0].id, 'two'); assert.equal(all.rows[0].retained, true)
  assert.deepEqual(all.projects, ['D:\\project-one', 'D:\\project-two'])
  const selected = foldSessionRows(state, { q: '优化', project: 'D:\\project-one', model: 'test/recent', days: 7 }, now)
  assert.equal(selected.total, 1); assert.equal(selected.rows[0].billed, 5)
  assert.equal(selected.rows[0].models.length, 1)
  assert.equal(selected.rows[0].lastTime, Date.parse('2026-09-29T10:00:00Z'))
  const day = foldSessionRows(state, { day: '2026-09-01' }, now)
  assert.equal(day.rows[0].billed, 100)
  assert.equal(day.rows[0].lastTime, Date.parse('2026-09-01T10:00:00Z'))
  assert.equal(foldSessionRows(state, { q: 'missing' }, now).total, 0)
})

test('session metadata survives persistence and timezone changes without response model evidence', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-usage-details-'))
  const oldHome = process.env.DSH_HOME; process.env.DSH_HOME = home
  try {
    const state = defaultState()
    await syncCorpus({ get: () => ({
      listSessions: async () => [{ header: { id: 'one', cwd: 'D:\\project' } }],
      readSession: async () => ({ header: { id: 'one', cwd: 'D:\\project', createdAt: 10 }, events: [
        { type: 'user/message', data: { message: { content: 'PRIVATE_BODY' } } },
        { type: 'session/title', data: { title: '明确标题' } },
        { type: 'request/header', data: { header: { config: { provider: 'test', model: 'model' }, tools: 'PRIVATE_TOOL' } } },
        { ...usageEvent('2026-09-22T23:30:00Z', 'model', 5), data: {
          usage: { inputTokens: 5 }, message: { source: { provider: 'test', model: 'model', replayState: { response: { responseModel: 'raw-model', model: 'model' }, blocks: 'PRIVATE_REPLAY' } } },
        } },
      ] }),
    }) }, -480, state)
    const store = join(home, 'corpus.json')
    await persistState(state, store)
    const loaded = await loadState(store)
    assert.equal(loaded.sessions.one.title, '明确标题'); assert.equal(loaded.sessions.one.cwd, 'D:\\project')
    assert.equal(loaded.sessions.one.evidence, undefined)
    assert.doesNotMatch(JSON.stringify(loaded), /PRIVATE|raw-model|responseModel/)
    await syncCorpus({ get: () => ({ listSessions: async () => [] }) }, 0, loaded)
    assert.equal(loaded.sessions.one.title, '明确标题')
    assert.equal(loaded.sessions.one.evidence, undefined)
    assert.equal(foldSessionRows(loaded).rows[0].retained, true)
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome
    const { rm } = await import('node:fs/promises')
    await rm(home, { recursive: true, force: true })
  }
})

test('selected range and model filter agree across totals, models, messages and weeks', () => {
  const state = defaultState()
  state.tz = -480
  state.sessions.one = scanSessionEvents([
    usageEvent('2026-09-01T10:00:00Z', 'old', 100),
    usageEvent('2026-09-24T10:00:00Z', 'recent', 7),
    usageEvent('2026-09-29T10:00:00Z', 'recent', 5),
  ], -480)
  const now = Date.parse('2026-09-29T12:00:00Z')
  const recent = foldResponse(state, 7, null, -480, now)
  assert.equal(recent.totals.billed, 12)
  assert.equal(recent.messages, 2)
  assert.equal(recent.sessionsWithUsage, 1)
  assert.deepEqual(recent.byModel.map((m) => [m.model, m.bucket.billed]), [['recent', 12]])
  assert.equal(recent.byWeek.reduce((sum, w) => sum + w.bucket.billed, 0), 12)
  assert.equal(recent.byDay.some((d) => d.date === '2026-09-01'), true) // heatmap history
  assert.deepEqual([recent.overview.todayBilled, recent.overview.usedDays, recent.overview.totalBilled], [5, 3, 112])
  assert.equal(recent.overview.totals.inputTokens, 112)
  assert.equal(recent.overview.totals.calls, 3)
  assert.deepEqual(recent.overview.models.map((m) => [m.model, m.billed]), [['old', 100], ['recent', 12]])

  const filtered = foldResponse(state, 7, 'test/old', -480, now)
  assert.equal(filtered.totals.billed, 0)
  assert.equal(filtered.messages, 0)
  assert.equal(filtered.sessionsWithUsage, 0)
  assert.equal(filtered.byModel.length, 0)
  assert.deepEqual(filtered.overview, recent.overview) // overview ignores chart range and model filter

  const all = foldResponse(state, 0, null, -480, now)
  assert.equal(all.totals.billed, 112)
  assert.equal(all.messages, 3)
})

test('heatmap day-model buckets include exact token totals and call counts', () => {
  const state = defaultState()
  state.tz = -480
  state.sessions.one = scanSessionEvents([
    usageEvent('2026-08-20T02:00:00Z', 'alpha', 12345),
    usageEvent('2026-08-20T03:00:00Z', 'beta', 6789),
  ], -480)
  state.sessions.two = scanSessionEvents([
    usageEvent('2026-08-20T04:00:00Z', 'alpha', 10),
  ], -480)
  const now = Date.parse('2026-09-29T12:00:00Z')
  const all = foldResponse(state, 0, null, -480, now)
  const day = all.byDayModels.find((d) => d.date === '2026-08-20')
  assert.deepEqual(day.models.map((m) => [m.key, m.billed, m.calls]), [
    ['test/alpha', 12355, 2], ['test/beta', 6789, 1],
  ])
  assert.equal(day.models.reduce((sum, m) => sum + m.billed, 0), all.byDay.find((d) => d.date === day.date).bucket.billed)
  assert.equal(day.models.reduce((sum, m) => sum + m.calls, 0), 3)
  const filtered = foldResponse(state, 7, 'test/alpha', -480, now)
  assert.deepEqual(filtered.byDayModels.find((d) => d.date === day.date).models.map((m) => [m.key, m.billed, m.calls]), [
    ['test/alpha', 12355, 2],
  ])
})

test('dashboard folds legacy aggregate-only sessions into totals, series and heatmap', () => {
  const state = defaultState()
  state.tz = -480
  state.sessions.live = scanSessionEvents([
    usageEvent('2026-08-20T02:00:00Z', 'deepseek-v4-flash', 1000),
  ], -480)
  state.sessions.legacy = scanSessionEvents([{
    type: 'assistant/message', time: Date.parse('2026-08-19T02:00:00Z'),
    data: { usage: { inputTokens: 500 }, message: { source: { provider: 'old', model: 'deepseek-v4-flash' } } },
  }], -480)
  delete state.sessions.legacy.usageEvents
  const now = Date.parse('2026-09-29T12:00:00Z')
  const all = foldDashboard(state, { all: '1' }, now)
  const costs = foldCosts(state, { from: '0000-01-01', to: '9999-12-31' }, now)
  assert.equal(all.totals.calls, 2)
  assert.equal(all.totals.billed, 1500)
  assert.ok(Math.abs(all.totals.cost - costs.totalCost) < 1e-12)
  assert.equal(all.total, 1) // the request log stays event-only
  assert.ok(all.providers.includes('old'))
  assert.deepEqual(all.heatmap.days.filter((day) => day.calls > 0).map((day) => [day.date, day.calls, day.billed]), [
    ['2026-08-19', 1, 500], ['2026-08-20', 1, 1000],
  ])
  const legacyOnly = foldDashboard(state, { all: '1', provider: 'old' }, now)
  assert.equal(legacyOnly.totals.calls, 1)
  assert.equal(legacyOnly.totals.billed, 500)
  assert.equal(legacyOnly.total, 0)
  const hourly = foldDashboard(state, {
    from: Date.parse('2026-08-19T00:00:00+08:00'), to: Date.parse('2026-08-19T23:59:59+08:00'),
  }, now)
  assert.equal(hourly.granularity, 'hour')
  assert.equal(hourly.totals.calls, 1)
  assert.equal(hourly.totals.billed, 500)
  assert.equal(hourly.series.reduce((sum, point) => sum + point.calls, 0), 1)
  // Every point carries a per-model split the chart can stack and the hover
  // card can list, and it must sum back to that point — including the retained
  // session that only has day aggregates.
  const daily = foldDashboard(state, {
    from: Date.parse('2026-08-19T00:00:00+08:00'), to: Date.parse('2026-08-20T23:59:59+08:00'),
  }, now)
  assert.equal(daily.granularity, 'day')
  for (const point of [...daily.series, ...hourly.series]) {
    assert.ok(Array.isArray(point.models))
    assert.equal(point.models.reduce((sum, model) => sum + model.billed, 0), point.billed)
    assert.equal(point.models.reduce((sum, model) => sum + model.calls, 0), point.calls)
  }
  assert.deepEqual(daily.series.map((point) => [point.key, point.models.map((model) => [model.provider, model.model, model.billed])]), [
    ['2026-08-19', [['old', 'deepseek-v4-flash', 500]]],
    ['2026-08-20', [['test', 'deepseek-v4-flash', 1000]]],
  ])
})

test('cost range buckets merge once when rules fold several raw models into one row', () => {
  const state = defaultState()
  state.tz = -480
  state.sessions.one = scanSessionEvents([
    usageEvent('2026-08-19T02:00:00Z', 'raw-a', 100),
    usageEvent('2026-08-20T02:00:00Z', 'raw-b', 200),
  ], -480)
  const rules = [{ original: 'raw-a', canonical: 'deepseek-v4-flash' }, { original: 'raw-b', canonical: 'deepseek-v4-flash' }]
  const costs = foldCosts(state, { from: '2026-08-19', to: '2026-08-20' }, Date.parse('2026-09-29T12:00:00Z'), [], null, rules)
  assert.equal(costs.rows.length, 1)
  assert.equal(costs.rows[0].range.calls, 2)
  assert.equal(costs.rows[0].range.billed, 300)
})

test('retained hourly buckets follow the requested system offset', async () => {
  const oldHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(tmpdir(), 'dsh-usage-rekey-' + randomUUID())
  try {
  const state = defaultState()
  state.tz = -480
  state.sessions.one = scanSessionEvents([usageEvent('2026-09-22T23:30:00Z', 'm', 5)], -480)
  delete state.sessions.one.usageEvents // legacy retained corpus
  await syncCorpus({ get: () => ({ listSessions: async () => [], readSession: async () => { throw new Error('gone') } }) }, 0, state)
  const now = Date.parse('2026-09-29T12:00:00Z')
  const response = foldResponse(state, 8, null, 0, now)
  assert.equal(response.totals.billed, 5)
  assert.deepEqual(response.byDay.filter((d) => d.bucket.billed > 0).map((d) => d.date), ['2026-09-22'])
  assert.equal(state.sessions.one.retained, true)
  assert.equal(response.byHour.reduce((sum, h) => sum + h.bucket.calls, 0), 0)
  const sameDay = foldResponse(state, 8, null, 0, Date.parse('2026-09-22T23:45:00Z'))
  assert.equal(sameDay.byHour[23].bucket.calls, 1)
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
  }
})

test('retained event summaries re-bucket exactly across a fractional offset', async () => {
  const oldHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(tmpdir(), 'dsh-usage-exact-' + randomUUID())
  try {
    const state = defaultState()
    state.tz = -480
    state.sessions.one = scanSessionEvents([
      usageEvent('2026-09-22T18:15:00Z', 'm', 5),
      usageEvent('2026-09-22T18:45:00Z', 'm', 7),
    ], -480)
    await syncCorpus({ get: () => ({ listSessions: async () => [] }) }, -330, state)
    const response = foldResponse(state, 0, null, -330, Date.parse('2026-09-29T12:00:00Z'))
    assert.deepEqual(response.byDay.filter((d) => d.bucket.billed > 0).map((d) => [d.date, d.bucket.billed]), [
      ['2026-09-22', 5], ['2026-09-23', 7],
    ])
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
  }
})

test('desktop stats route uses the requested timezone', async () => {
  const oldHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(tmpdir(), 'dsh-usage-route-' + randomUUID())
  try {
    const routes = new Map()
    const query = {
      listSessions: async () => [{ header: { id: 'one' } }],
      readSession: async () => ({ events: [usageEvent('2026-09-22T23:30:00Z', 'm', 5)] }),
    }
    const webServer = { register({ path, handler }) { routes.set(path, handler); return () => {} } }
    apply({
      get(name) { return name === 'profileContext' ? { name: 'desktop' } : name === 'sessionQuery' ? query : name === 'webServer' ? webServer : undefined },
      effect(callback) { return callback() },
      interval() { return () => {} },
    })
    const handler = routes.get('/api/dsh-usage-stats/stats')
    assert.equal(typeof handler, 'function')
    const req = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: 'localhost:3080' },
      method: 'GET',
      url: '/api/dsh-usage-stats/stats?days=0&tz=0',
    }
    let status
    let response
    await handler(req, {
      writeHead(code) { status = code },
      end(json) { response = JSON.parse(json) },
    })
    assert.equal(status, 200)
    assert.equal(response.tz, 0)
    assert.deepEqual(response.tokenSpeeds, [])
    assert.equal(response.totals.billed, 5)
    assert.deepEqual(response.byDay.filter((d) => d.billed > 0).map((d) => d.date), ['2026-09-22'])
    assert.deepEqual(response.byDayModels.find((d) => d.date === '2026-09-22').models.map((m) => [m.model, m.billed, m.calls]), [['m', 5, 1]])
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
  }
})

test('session log fingerprints recognise the v4 file name as well as the legacy one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-us-session-files-'))
  try {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const put = async (workspace, id, filename, bytes) => {
      const path = join(dir, workspace, id)
      await mkdir(path, { recursive: true })
      await writeFile(join(path, filename), bytes)
    }
    await put('ws-v4', 'live-v4', 'session.v4.jsonl.zstd', 'aaaa')
    await put('ws-legacy', 'legacy-log', 'session.jsonl.zstd', 'bbb')
    await put('ws-both', 'prefers-v4', 'session.v4.jsonl.zstd', 'cc')
    await put('ws-both', 'prefers-v4', 'session.jsonl.zstd', 'dddddddd')
    await mkdir(join(dir, 'ws-empty', 'not-a-session'), { recursive: true })
    const fps = await collectFileFps(dir)
    // Missing here means an empty Map for the whole corpus, which makes every
    // refresh re-read every session instead of only the changed ones.
    assert.deepEqual([...fps.keys()].sort(), ['legacy-log', 'live-v4', 'prefers-v4'])
    assert.equal(fps.get('live-v4').size, 4)
    assert.equal(fps.get('legacy-log').size, 3)
    assert.equal(fps.get('prefers-v4').size, 2, 'the v4 log must win when both layouts exist')
    assert.ok(Number.isFinite(fps.get('live-v4').mtimeMs))
  } finally {
    const { rm } = await import('node:fs/promises')
    await rm(dir, { recursive: true, force: true })
  }
})

test('sessions without a fingerprint refresh, and a failed read leaves the snapshot stale', async () => {
  const oldHome = process.env.DSH_HOME
  process.env.DSH_HOME = join(tmpdir(), 'dsh-usage-test-' + randomUUID())
  try {
    const state = defaultState()
    let billed = 1
    let reads = 0
    let fail = false
    const ctx = {
      get(name) {
        if (name !== 'sessionQuery') return undefined
        return {
          listSessions: async () => [{ header: { id: 'no-fingerprint' } }],
          readSession: async () => {
            reads++
            if (fail) throw new Error('temporary read failure')
            return { events: [usageEvent('2026-09-29T10:00:00Z', 'm', billed)] }
          },
        }
      },
    }
    await syncCorpus(ctx, -480, state)
    const firstSync = state.syncedAt
    billed = 9
    fail = true
    const failed = await syncCorpus(ctx, -480, state)
    assert.equal(failed.failed, 1)
    assert.equal(state.partial, true)
    assert.equal(state.syncedAt, firstSync)
    assert.equal(foldResponse(state, 0, null, -480, Date.now()).totals.billed, 1)

    fail = false
    await syncCorpus(ctx, -480, state)
    assert.equal(reads, 3)
    assert.equal(state.partial, false)
    assert.equal(foldResponse(state, 0, null, -480, Date.now()).totals.billed, 9)
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
  }
})

test('persisted sync time survives a restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-usage-state-'))
  const file = join(dir, 'corpus.json')
  try {
    const state = defaultState()
    state.syncedAt = 123456789
    await persistState(state, file)
    const loaded = await loadState(file)
    assert.equal(loaded.syncedAt, state.syncedAt)
  } finally {
    await unlink(file)
    await rmdir(dir)
  }
})

test('the corpus document with session titles and cwd is written owner-only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-usage-mode-'))
  const file = join(dir, 'corpus.json')
  try {
    const state = defaultState()
    state.sessions.private = { ...scanSessionEvents([usageEvent('2026-10-01T10:00:00Z', 'm', 5)], 0), title: 'private chat', cwd: '/workspace/secret-project' }
    await persistState(state, file)
    const { stat } = await import('node:fs/promises')
    const { mode } = await stat(file)
    // Windows does not enforce POSIX mode bits; the release CI (Linux) does.
    if (process.platform !== 'win32') assert.equal(mode & 0o077, 0, 'other users must not be able to read the usage corpus')
    const text = await (await import('node:fs/promises')).readFile(file, 'utf8')
    assert.ok(text.includes('private chat') && text.includes('/workspace/secret-project'), 'precondition: the corpus really stores title and cwd')
  } finally {
    await unlink(file).catch(() => {})
    await rmdir(dir).catch(() => {})
  }
})
