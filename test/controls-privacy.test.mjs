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

test('control errors never return host paths or credential details', async () => {
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

test('detection HTTP catalogs show native DSH providers and models without exposing credentials or inference', async () => {
  const listed = []
  await withHost({ llm: {
    listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }, { id: 'account-route', name: 'Account models', apiKey: 'PRIVATE' }],
    listModels: async provider => { listed.push(provider); return [{ provider, id: 'selectable-model', name: 'Selectable model', headers: { authorization: 'PRIVATE' } }] },
    stream() { assert.fail('model-list reads must never start inference') },
  } }, async root => {
    const providersResponse = await fetch(root + 'model-detection-models')
    assert.equal(providersResponse.status, 200)
    const providers = await providersResponse.json()
    assert.deepEqual(providers.providers, [{ provider: 'deepseek-official', name: 'DeepSeek' }, { provider: 'account-route', name: 'Account models' }])
    assert.deepEqual(listed, [])
    const modelsResponse = await fetch(root + 'model-detection-models?provider=account-route')
    assert.equal(modelsResponse.status, 200)
    const models = await modelsResponse.json()
    assert.equal(models.provider, 'account-route')
    assert.deepEqual(models.models, [{ id: 'selectable-model', name: 'Selectable model' }])
    assert.deepEqual(listed, ['account-route'])
    assert.doesNotMatch(JSON.stringify([providers, models]), /PRIVATE|apiKey|headers/)
    assert.equal((await fetch(root + 'model-detection-models?provider=unconfigured')).status, 400)
  })
})
