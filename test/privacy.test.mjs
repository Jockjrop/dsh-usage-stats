import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/index.js'

function requestStatus(url, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers }, (response) => {
      response.resume()
      resolve(response.statusCode)
    })
    request.on('error', reject)
    request.end()
  })
}

async function withHost(services, check, corpus) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-usage-privacy-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const routes = new Map()
  const server = createServer((req, res) => {
    const handler = routes.get(new URL(req.url, 'http://local').pathname)
    if (handler) void handler(req, res)
    else { res.writeHead(404); res.end() }
  })
  try {
    if (corpus) {
      await mkdir(join(home, 'storages'))
      await writeFile(join(home, 'storages', 'usage-stats-corpus.json'), JSON.stringify(corpus))
    }
    const webServer = { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } }
    apply({
      get(name) { return ({ profileContext: { name: 'desktop' }, sessionQuery: { listSessions: async () => [] }, webServer, ...services })[name] },
      // This fixture mounts the routes without starting background timers or a
      // host lifecycle; there is no shutdown save into the temporary home.
      effect(callback) { callback() },
      interval() { return () => {} },
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    await check('http://127.0.0.1:' + server.address().port + '/api/dsh-usage-stats/')
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  }
}

test('unexpected control errors never return host paths or credential details', async () => {
  const detail = join(tmpdir(), 'private-profile', 'credentials.json') + ' credential-fixture-value'
  await withHost({
    llm: { listConfigurableProviders: () => [{ provider: 'gateway', settingsNs: 'models' }] },
    settings: { describe() { throw new Error(detail) } },
  }, async (root) => {
    for (const [route, options] of [
      ['quota-providers', undefined],
      ['quota-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'gateway', template: {} }) }],
    ]) {
      const response = await fetch(root + route, options)
      assert.equal(response.status, 500)
      assert.deepEqual(await response.json(), { ok: false, error: '操作失败，请稍后重试。' })
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
    const response = await fetch(root + 'controls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intervalMinutes: 1 }) })
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /仅支持 10 分钟/)
  })
})

test('failed statistics serialization returns an opaque error instead of exception text', async () => {
  await withHost({}, async (root) => {
    const response = await fetch(root + 'stats')
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { ok: false, error: '用量统计暂时不可用，请稍后重试。' })
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }, { version: 3, tz: new Date().getTimezoneOffset(), syncedAt: Date.now(), sessions: { damaged: { totals: { billed: 0 }, byModel: { damaged: null } } } })
})

test('all usage and quota routes reject external origins and disable HTTP caching', async () => {
  await withHost({}, async (root) => {
    for (const route of ['stats', 'provider-quotas', 'controls', 'quota-providers', 'quota-test', 'workbuddy', 'workbuddy-ai']) {
      const denied = await fetch(root + route, { headers: { origin: 'https://outside.example' } })
      assert.equal(denied.status, 403, route)
      assert.equal(denied.headers.get('cache-control'), 'no-store', route)
    }
    const response = await fetch(root + 'controls')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(await requestStatus(root + 'controls', { host: 'outside.example' }), 403)
    assert.equal(await requestStatus(root + 'controls', { 'sec-fetch-site': 'cross-site' }), 403)
  })
})
