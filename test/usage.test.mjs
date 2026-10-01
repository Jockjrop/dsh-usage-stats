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
  syncCorpus,
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
    assert.equal(response.totals.billed, 5)
    assert.deepEqual(response.byDay.filter((d) => d.billed > 0).map((d) => d.date), ['2026-09-22'])
    assert.deepEqual(response.byDayModels.find((d) => d.date === '2026-09-22').models.map((m) => [m.model, m.billed, m.calls]), [['m', 5, 1]])
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
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
