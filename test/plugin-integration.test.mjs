import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { apply as applyStats } from '../src/index.js'
import { createUsagePreferences } from '../src/usage-preferences.js'

const hubRoot = process.env.DSH_MODELS_HUB_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '../../dsh-models-hub')
const hub = await import(pathToFileURL(join(hubRoot, 'src/index.js')).href).catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  return null
})

async function fixture(t, order, legacy = {}) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-plugin-integration-')), oldHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const storage = join(home, 'storages'); await mkdir(storage)
  for (const [name, value] of Object.entries(legacy)) await writeFile(join(storage, name), JSON.stringify(value))
  const routes = new Map(), services = new Map(), disposers = new Map(), listeners = new Map()
  services.set('profileContext', { name: 'desktop' }); services.set('sessionQuery', { listSessions: async () => [] })
  services.set('llm', { listProviders: () => [], listModels: async () => [], listConfigurableProviders: () => [], stream() { assert.fail('Catalog reads must not start inference') } })
  services.set('webServer', { register(route) { assert.ok(!routes.has(route.path), 'Duplicate route: ' + route.path); routes.set(route.path, route.handler); return () => routes.delete(route.path) } })
  function context(owner) {
    const cleanup = []; disposers.set(owner, cleanup)
    return { get: name => services.get(name),
      provide(name, value) { assert.ok(!services.has(name), 'Duplicate service: ' + name); services.set(name, value); cleanup.push(() => services.delete(name)) },
      effect(callback) { const dispose = callback(); if (typeof dispose === 'function') cleanup.push(dispose) },
      on(name, callback) { const rows = listeners.get(name) || new Set(); listeners.set(name, rows); rows.add(callback); const dispose = () => rows.delete(callback); cleanup.push(dispose); return dispose },
      interval: () => () => {}, emit(name, payload) { for (const listener of listeners.get(name) || []) listener(payload) } }
  }
  const start = owner => (owner === 'stats' ? applyStats : hub.apply)(context(owner))
  const stop = async owner => { for (const dispose of [...disposers.get(owner) || []].reverse()) await dispose(); await new Promise(resolve => setImmediate(resolve)) }
  for (const owner of order) start(owner)
  const server = createServer((req, res) => {
    const handler = routes.get(new URL(req.url, 'http://local').pathname)
    if (handler) void handler(req, res)
    else { res.writeHead(404); res.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  services.get('webServer').port = server.address().port
  const base = 'http://127.0.0.1:' + server.address().port
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    for (const owner of [...disposers.keys()].reverse()) await stop(owner)
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome
    assert.equal(dirname(home), tmpdir()); assert.ok(home.includes('dsh-plugin-integration-'))
    await rm(home, { recursive: true, force: true })
  })
  const get = async path => { const response = await fetch(base + path); return { status: response.status, body: await response.json() } }
  const post = async (path, body) => { const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() } }
  return { base, home, storage, routes, services, get, post, start, stop, emit: (name, payload) => { for (const listener of listeners.get(name) || []) listener(payload) } }
}

test('statistics runs without model services and reports the missing optional connection', async t => {
  const f = await fixture(t, ['stats'])
  assert.equal((await f.get('/api/dsh-usage-stats/stats')).status, 200)
  assert.deepEqual((await f.get('/api/dsh-usage-stats/display-settings')).body.settings, { showModelDetails: false, showTokenSpeed: true })
  assert.equal((await f.get('/api/dsh-usage-stats/provider-quotas')).status, 200)
  assert.equal((await f.get('/api/dsh-usage-stats/account-quotas')).body.connected, false)
  assert.equal((await f.get('/api/dsh-usage-stats/model-detection')).status, 200)
  assert.equal((await f.post('/api/dsh-usage-stats/controls', { showModelDetection: true, advancedModelSelect: true })).status, 200)
  assert.equal((await f.get('/api/dsh-usage-stats/controls')).body.settings.showModelDetection, true)
  assert.equal((await f.get('/api/dsh-usage-stats/integration')).body.modelsHub, false)
  assert.ok(!f.routes.has('/api/dsh-usage-stats/model-access/models'))
})

test('display migration is idempotent and leaves model configuration untouched', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'dsh-display-migration-')); t.after(() => rm(folder, { recursive: true, force: true }))
  const legacy = join(folder, 'legacy.json'), current = join(folder, 'display.json')
  const original = { settings: { showModelDetails: false, showTokenSpeed: false, modelReasoning: false, advancedModelSelect: true } }
  await writeFile(legacy, JSON.stringify(original))
  const settings = createUsagePreferences(current, legacy)
  assert.deepEqual((await settings.get()).settings, { showModelDetails: false, showTokenSpeed: false })
  await settings.update({ showTokenSpeed: true })
  await assert.rejects(settings.update({ showModelDetails: true, showTokenSpeed: 'false' }))
  assert.equal((await settings.get()).settings.showModelDetails, false)
  assert.deepEqual(JSON.parse(await readFile(legacy, 'utf8')), original)
  assert.deepEqual((await createUsagePreferences(current, legacy).get()).settings, { showModelDetails: false, showTokenSpeed: true })
})

test('background notifications retain new spend before the statistics page is opened', async t => {
  const f = await fixture(t, ['stats'])
  const row = { id: 'new-sample:0', time: Date.now(), selection: { provider: 'gateway', model: 'sample' },
    usageReported: true, usage: { inputTokens: 8, outputTokens: 2 }, stop: 'stop', decodeMs: 1000, ttftMs: 10 }
  f.services.set('dshModelsHub', { protocolVersion: 1, readSupplementalUsage: () => ({ protocolVersion: 1, records: [row] }) })
  for (let pass = 0; pass < 12; pass++) {
    f.emit('dsh-models-hub/updated', { kind: 'usage' })
    await new Promise(resolve => setTimeout(resolve, 5))
    try { if (JSON.parse(await readFile(join(f.storage, 'usage-stats-supplemental.json'), 'utf8')).records.some(r => r.id === row.id)) break } catch {}
  }
  f.services.delete('dshModelsHub')
  const result = await f.get('/api/dsh-usage-stats/stats')
  assert.equal(result.body.totals.billed, 10)
  assert.equal(result.body.totals.calls, 1)
})

test('the default-model route carries the model a not-yet-created session starts with', async t => {
  const f = await fixture(t, ['stats'])
  // The composer seat of a brand-new session has no session directory to read,
  // so it drives the deployment default instead; the route has to exist even
  // before a host mounts the service, and it must say so rather than 500.
  assert.equal((await f.get('/api/dsh-usage-stats/default-model')).status, 503)
  const writes = []
  let current = { provider: 'p', model: 'm1' }
  const llm = f.services.get('llm')
  // Mirrors the host resolver: it materializes the model's default effort.
  llm.resolveCallConfig = async (config) => ({ provider: config.provider, model: config.model, reasoningEffort: config.reasoningEffort === undefined ? 'medium' : config.reasoningEffort })
  f.services.set('agentDefaultModel', { currentSelection: () => ({ ...current }), saveSelection: async (next) => { writes.push(next); current = next } })

  assert.deepEqual((await f.get('/api/dsh-usage-stats/default-model')).body, { ok: true, selection: { provider: 'p', model: 'm1' }, persisted: false })
  const accepted = await f.post('/api/dsh-usage-stats/default-model', { provider: 'p', model: 'm2' })
  assert.equal(accepted.status, 200)
  assert.deepEqual(writes, [{ provider: 'p', model: 'm2' }], 'an "auto" effort is not pinned to the materialized default')
  assert.deepEqual(accepted.body.selection, { provider: 'p', model: 'm2' })

  await f.post('/api/dsh-usage-stats/default-model', { provider: 'p', model: 'm2', reasoningEffort: 'high' })
  assert.deepEqual(writes[1], { provider: 'p', model: 'm2', reasoningEffort: 'high' })
  assert.equal((await f.post('/api/dsh-usage-stats/default-model', { provider: 'p' })).status, 400, 'an incomplete selection is refused')
  assert.equal((await f.post('/api/dsh-usage-stats/default-model', { provider: '  ', model: 'm2' })).status, 400)
})

test('model hub starts alone without session scanning and keeps the legacy model routes', { skip: !hub && 'Set DSH_MODELS_HUB_DIR to run the paired-plugin checks' }, async t => {
  const f = await fixture(t, ['hub'])
  assert.equal((await f.get('/api/dsh-models-hub/integration')).body.usageStats, false)
  assert.equal((await f.get('/api/dsh-models-hub/usage')).status, 503)
  for (const path of ['/api/dsh-models-hub/model-access/status', '/api/dsh-usage-stats/model-access/status']) assert.equal((await f.get(path)).status, 200)
  assert.ok(!f.routes.has('/api/dsh-usage-stats/stats'))
  assert.equal((await f.get('/api/dsh-models-hub/controls')).body.settings.showTokenSpeed, undefined)
})

for (const order of [['stats', 'hub'], ['hub', 'stats']]) test('both plugins connect in startup order ' + order.join(' → '), { skip: !hub }, async t => {
  const now = Date.now()
  const legacy = { settings: { showModelDetails: false, showTokenSpeed: false, modelReasoning: false, advancedModelSelect: true, showModelDetection: true } }
  const history = { version: 1, jobs: [], usage: [{ id: 'retained-job', selection: { provider: 'gateway', model: 'sample' }, startedAt: now,
    results: [{ time: now, usageReported: true, usage: { inputTokens: 12, outputTokens: 3 }, stop: 'stop', ttftMs: 0, decodeMs: 1000 }] }] }
  const f = await fixture(t, order, { 'usage-stats-controls.json': legacy, 'usage-stats-detections.json': history })
  assert.equal((await f.get('/api/dsh-usage-stats/integration')).body.modelsHub, true)
  assert.equal((await f.get('/api/dsh-models-hub/integration')).body.usageStats, true)
  const hubControls = (await f.get('/api/dsh-models-hub/controls')).body
  assert.equal(hubControls.usageStats, true)
  const controls = hubControls.settings
  assert.equal(controls.modelReasoning, false); assert.equal(controls.advancedModelSelect, true)
  assert.equal(controls.showModelDetails, undefined)
  await f.post('/api/dsh-models-hub/controls', { modelReasoning: true })
  assert.equal((await f.get('/api/dsh-usage-stats/controls')).body.settings.modelReasoning, true)
  assert.equal((await f.get('/api/dsh-models-hub/model-detection-models')).status, 200)
  await f.post('/api/dsh-usage-stats/display-settings', { showTokenSpeed: true })
  assert.equal((await f.get('/api/dsh-usage-stats/display-settings')).body.settings.showModelDetails, false)
  assert.deepEqual(JSON.parse(await readFile(join(f.storage, 'usage-stats-controls.json'), 'utf8')), legacy)
  for (const tz of [-480, 330]) {
    for (let repeat = 0; repeat < 2; repeat++) {
      const result = await f.get('/api/dsh-usage-stats/stats?tz=' + tz)
      assert.equal(result.status, 200); assert.equal(result.body.totals.billed, 15); assert.equal(result.body.totals.calls, 1)
      assert.equal(result.body.byDay.reduce((sum, day) => sum + day.billed, 0), 15)
      assert.equal(result.body.sessions, 0)
    }
  }
  assert.equal((await f.get('/api/dsh-models-hub/usage?days=30&tz=-480')).body.totals.billed, 15)
  await f.stop('hub')
  assert.equal((await f.get('/api/dsh-usage-stats/stats')).body.totals.billed, 15)
  assert.equal((await f.get('/api/dsh-usage-stats/provider-quotas')).status, 200)
  assert.equal((await f.get('/api/dsh-usage-stats/model-detection')).status, 200)
  await f.stop('stats'); f.start('stats')
  assert.equal((await f.get('/api/dsh-usage-stats/stats')).body.totals.billed, 15)
  f.start('hub')
  assert.equal((await f.get('/api/dsh-usage-stats/stats')).body.totals.calls, 1)
  const denied = await fetch(f.base + '/api/dsh-models-hub/model-access/accounts', { headers: { origin: 'https://outside.invalid' } })
  assert.equal(denied.status, 403)
})
