import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createReasoningSettings } from '../src/reasoning-settings.js'

const feature = createReasoningSettings({}, text => text)
const provider = { provider: 'gateway', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'gateway'] }
const settle = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('the new panel only uses published DSH theme aliases', () => {
  const aliases = new Set(JSON.parse(readFileSync(new URL('./fixtures/theme-aliases.json', import.meta.url), 'utf8')).aliases)
  const used = [...new Set(feature.css.match(/--dsw-alias-[a-zA-Z0-9-]+/g))]
  assert.deepEqual(used.filter(alias => !aliases.has(alias)), [])
})

test('the visibility switch releases and restores public slots without changing any model settings', () => {
  const previousDocument = globalThis.document
  const elements = new Map(), registrations = new Set()
  let registered = 0, mutations = 0, removed = 0
  globalThis.document = {
    getElementById: id => elements.get(id),
    createElement: () => ({ remove() { elements.delete(this.id); removed++ } }),
    head: { appendChild(style) { elements.set(style.id, style) } },
  }
  const ctx = { get(name) {
    if (name === 'remote') return { settings: { describe: async () => ({}), mutate() { mutations++ } } }
    if (name === 'slots') return {
      inject(name, callback) { return { dispose: callback() } },
      register(options) {
        assert.equal(registrations.has(options.name), false, 'each public slot has only one registration')
        registrations.add(options.name); registered++
        return () => registrations.delete(options.name)
      },
    }
  } }
  try {
    const visibility = feature.createVisibility(ctx)
    assert.equal(visibility.sync({ modelReasoning: false }), false)
    assert.equal(registered, 0)
    assert.equal(visibility.sync({}), true)
    assert.equal(registered, 2)
    visibility.sync({ modelReasoning: true })
    assert.equal(registered, 2, 'unchanged settings never duplicate entries')
    visibility.sync({ modelReasoning: false })
    assert.equal(registrations.size, 0)
    assert.equal(elements.size, 0)
    assert.equal(removed, 1)
    visibility.sync({ modelReasoning: true })
    assert.equal(registrations.size, 2)
    visibility.dispose()
    assert.equal(registrations.size, 0)
    assert.equal(visibility.sync({ modelReasoning: true }), false, 'disposed instances cannot remount')
    assert.equal(mutations, 0, 'hiding the editor never rewrites model capabilities')
  } finally { globalThis.document = previousDocument }
})

test('cold startup waits for remote settings and mounts without another control-page sync', () => {
  const previousDocument = globalThis.document
  const registrations = new Set(), elements = new Map()
  let remote, readyCallback, releaseReady, active = false, disposed = false
  const slots = {
    inject(_name, callback) { return callback() },
    register(options) { registrations.add(options.name); return () => registrations.delete(options.name) },
  }
  globalThis.document = {
    getElementById: id => elements.get(id),
    createElement: () => ({ remove() { elements.delete(this.id) } }),
    head: { appendChild(style) { elements.set(style.id, style) } },
  }
  const ctx = {
    get: name => ({ slots, remote, 'remote.settings': remote?.settings })[name],
    inject(_dependencies, callback) {
      readyCallback = callback
      return { dispose() { disposed = true; releaseReady?.() } }
    },
  }
  const provide = value => {
    releaseReady?.(); releaseReady = undefined; active = false
    remote = value
    if (remote?.settings && readyCallback && !disposed) { releaseReady = readyCallback(ctx); active = true }
  }
  try {
    const visibility = feature.createVisibility(ctx)
    visibility.sync()
    assert.equal(registrations.size, 0)
    provide({ settings: { describe: async () => ({}), mutate() { throw Error('visibility must not write model settings') } } })
    assert.equal(registrations.size, 2, 'the Models entry appears as soon as settings becomes ready, without visiting Controls')
    assert.equal(active, true)
    provide(undefined)
    assert.equal(registrations.size, 0, 'service loss removes the old contribution')
    provide({ settings: { describe: async () => ({}), mutate() {} } })
    assert.equal(registrations.size, 2, 'service recovery restores the entry automatically')
    visibility.dispose()
    assert.equal(registrations.size, 0)
    assert.equal(elements.size, 0)
    provide({ settings: { describe() {}, mutate() {} } })
    assert.equal(registrations.size, 0, 'unloaded plugins cannot register late entries')
  } finally { globalThis.document = previousDocument }
})

test('a saved disabled flag received before remote settings is ready stays disabled', () => {
  const previousDocument = globalThis.document
  const registrations = new Set(), elements = new Map()
  let readyCallback, remote
  const slots = {
    inject(_name, callback) { return callback() },
    register(options) { registrations.add(options.name); return () => registrations.delete(options.name) },
  }
  globalThis.document = {
    getElementById: id => elements.get(id),
    createElement: () => ({ remove() { elements.delete(this.id) } }),
    head: { appendChild(style) { elements.set(style.id, style) } },
  }
  let cleanup
  const ctx = {
    get: name => ({ slots, remote, 'remote.settings': remote?.settings })[name],
    inject(_dependencies, callback) { readyCallback = callback; return { dispose() { cleanup?.() } } },
  }
  try {
    const visibility = feature.createVisibility(ctx)
    visibility.sync()
    visibility.sync({ modelReasoning: false })
    remote = { settings: { describe() {}, mutate() {} } }
    if (readyCallback) cleanup = readyCallback(ctx)
    assert.equal(registrations.size, 0)
    visibility.sync({ modelReasoning: true })
    assert.equal(registrations.size, 2, 'enabling after delayed startup still mounts exactly once')
    visibility.sync({ modelReasoning: true })
    assert.equal(registrations.size, 2)
    visibility.dispose()
    assert.equal(registrations.size, 0)
  } finally { globalThis.document = previousDocument }
})

function fixture(entries = [{ id: 'sample-model', input: ['text', 'image'], contextWindow: 128000 }]) {
  const base = { models: structuredClone(entries), baseUrl: 'https://example.invalid/v1', apiKeyEnv: 'EXAMPLE_KEY' }
  let namespace = { ns: 'llm-pi-ai', revision: 4, user: { providers: { gateway: base } }, value: { providers: { gateway: base } } }
  const writes = []
  const settings = {
    describe: async () => ({ ok: true, value: { writable: true, namespaces: [structuredClone(namespace)] } }),
    mutate: async (ns, ops, revision) => {
      writes.push({ ns, ops: structuredClone(ops), revision })
      if (revision !== namespace.revision) return { ok: false, error: { code: 'settings/conflict' } }
      namespace = structuredClone(namespace)
      namespace.revision++
      namespace.user.providers.gateway.models = structuredClone(ops[0].value)
      namespace.value.providers.gateway.models = structuredClone(ops[0].value)
      return { ok: true, value: structuredClone(namespace) }
    },
  }
  const controller = feature.createController(settings, provider)
  return { controller, settings, writes, namespace: () => namespace,
    update(change) { namespace = structuredClone(namespace); namespace.revision++; change(namespace) },
  }
}

test('seven declared levels use the common three-level preset and leave other model settings intact', async () => {
  const entry = { id: 'sample-model', name: 'Sample', input: ['text', 'image'], contextWindow: 128000, maxTokens: 16000, compat: { supportsStore: false }, future: { nested: [1, 2] } }
  const h = fixture([entry, { id: 'second', reasoningEfforts: false }])
  await h.controller.load()
  assert.deepEqual(feature.levels, ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  h.controller.toggle(0, true)
  assert.deepEqual(h.controller.getSnapshot().draft[0].reasoningEfforts, { low: 'low', medium: 'medium', high: 'high' })
  assert.equal(h.writes.length, 0, 'editing is local until Save')
  for (const level of ['off', 'minimal', 'xhigh', 'max']) h.controller.toggleTier(0, level, true)
  h.controller.setWire(0, 'high', 'vendor-deep')
  await h.controller.save()
  assert.equal(h.writes.length, 1)
  assert.equal(h.writes[0].ns, 'llm-pi-ai')
  assert.equal(h.writes[0].revision, 4)
  assert.deepEqual(h.writes[0].ops[0].path, ['providers', 'gateway', 'models'])
  const saved = h.writes[0].ops[0].value
  const { reasoningEfforts, ...other } = saved[0]
  assert.deepEqual(other, entry)
  assert.deepEqual(saved[1], { id: 'second', reasoningEfforts: false })
  assert.equal(reasoningEfforts.off, null)
  assert.equal(reasoningEfforts.high, 'vendor-deep')
  assert.deepEqual(Object.keys(reasoningEfforts).sort(), [...feature.levels].sort())
  assert.equal(h.controller.getSnapshot().draft, null)
  assert.equal(h.namespace().user.providers.gateway.baseUrl, 'https://example.invalid/v1')
})

test('tier and capability toggles restore selected tiers and their existing custom wire values', async () => {
  const h = fixture([{ id: 'sample', reasoningEfforts: { low: 'lite', high: 'deep', off: 'none' } }])
  await h.controller.load()
  h.controller.toggleTier(0, 'high', false)
  h.controller.toggleTier(0, 'high', true)
  assert.equal(h.controller.getSnapshot().draft, null, 'undoing the tier change clears the draft')
  h.controller.toggleTier(0, 'high', false)
  h.controller.toggle(0, false)
  h.controller.toggle(0, true)
  assert.deepEqual(h.controller.getSnapshot().draft[0].reasoningEfforts, { low: 'lite', off: 'none' }, 're-enabling does not restore deleted tiers')
  h.controller.toggleTier(0, 'high', true)
  assert.equal(h.controller.getSnapshot().draft, null, 'custom wire spelling survives disable and re-enable')
})

test('off-only and missing non-off wire values cannot be saved; empty off values omit the parameter', async () => {
  const h = fixture()
  await h.controller.load()
  h.controller.toggle(0, true)
  for (const level of ['low', 'medium', 'high']) h.controller.toggleTier(0, level, false)
  h.controller.toggleTier(0, 'off', true)
  assert.match(h.controller.issue().message, /非关闭/)
  await h.controller.save()
  assert.equal(h.writes.length, 0)
  h.controller.toggleTier(0, 'max', true)
  h.controller.setWire(0, 'max', '')
  assert.equal(h.controller.issue().level, 'max')
  await h.controller.save()
  assert.equal(h.writes.length, 0)
  h.controller.setWire(0, 'max', 'deepest')
  h.controller.setWire(0, 'off', '')
  await h.controller.save()
  assert.deepEqual(h.writes[0].ops[0].value[0].reasoningEfforts, { off: null, max: 'deepest' })
  const legacy = { id: 'legacy', reasoningEfforts: { off: '', high: 'custom-high' } }
  assert.equal(feature.buildOp(provider.settingsPath, [legacy]).value[0].reasoningEfforts.off, null)
  assert.equal(legacy.reasoningEfforts.off, '', 'normalization never mutates the source snapshot')
})

test('restoring the catalog default removes only the override and cancel never writes settings', async () => {
  const h = fixture([{ id: 'sample', reasoningEfforts: { xhigh: 'extra' }, unknown: ['keep'] }])
  await h.controller.load()
  h.controller.restore(0)
  assert.equal('reasoningEfforts' in h.controller.getSnapshot().draft[0], false)
  h.controller.cancel()
  await settle()
  assert.equal(h.controller.getSnapshot().draft, null)
  assert.equal(h.writes.length, 0)
  h.controller.restore(0)
  await h.controller.save()
  assert.deepEqual(h.writes[0].ops[0].value, [{ id: 'sample', unknown: ['keep'] }])
})

test('a background revision change preserves the draft and refuses to overwrite newer model settings', async () => {
  const h = fixture()
  await h.controller.load()
  h.controller.toggle(0, true)
  const draft = structuredClone(h.controller.getSnapshot().draft)
  h.update(ns => { ns.user.providers.gateway.models[0].contextWindow = 256000 })
  await h.controller.load()
  assert.deepEqual(h.controller.getSnapshot().draft, draft)
  assert.equal(h.controller.getSnapshot().stale, true)
  await h.controller.save()
  assert.equal(h.writes.length, 0)
  h.controller.cancel()
  await settle()
  h.controller.toggle(0, true)
  await h.controller.save()
  assert.equal(h.writes[0].revision, 5)
  assert.equal(h.writes[0].ops[0].value[0].contextWindow, 256000)
})

test('an optimistic save conflict also keeps unsaved edits; transient failures can be retried', async () => {
  const h = fixture()
  await h.controller.load()
  h.controller.toggle(0, true)
  h.update(ns => { ns.user.providers.gateway.models[0].input = ['text'] })
  await h.controller.save()
  assert.equal(h.controller.getSnapshot().stale, true)
  assert.ok(h.controller.getSnapshot().draft)
  assert.equal(h.namespace().user.providers.gateway.models[0].reasoningEfforts, undefined)
  h.controller.cancel()
  await settle()
  h.controller.toggle(0, true)
  const mutate = h.settings.mutate
  h.settings.mutate = async () => ({ ok: false, error: { code: 'unavailable', message: 'private-credential-fixture' } })
  await h.controller.save()
  assert.match(h.controller.getSnapshot().error, /请重试/)
  assert.doesNotMatch(h.controller.getSnapshot().error, /private-credential/)
  assert.ok(h.controller.getSnapshot().draft)
  h.settings.mutate = mutate
  await h.controller.save()
  assert.equal(h.controller.getSnapshot().draft, null)
})

test('a slow pre-save read cannot roll back a successful save and refreshes during save are deferred', async () => {
  const h = fixture()
  await h.controller.load()
  h.controller.toggle(0, true)
  const previous = structuredClone(h.namespace())
  const slowRead = deferred()
  const originalDescribe = h.settings.describe
  h.settings.describe = () => slowRead.promise
  const loading = h.controller.load()
  h.settings.describe = originalDescribe
  await h.controller.save()
  slowRead.resolve({ ok: true, value: { writable: true, namespaces: [previous] } })
  await loading
  assert.equal(h.controller.getSnapshot().revision, 5)
  assert.ok(h.controller.getSnapshot().stored[0].reasoningEfforts)
  h.controller.toggleTier(0, 'max', true)
  const slowWrite = deferred()
  const originalMutate = h.settings.mutate
  h.settings.mutate = async (...args) => { await slowWrite.promise; return originalMutate(...args) }
  const saving = h.controller.save()
  let reads = 0
  h.settings.describe = async () => { reads++; return originalDescribe() }
  await h.controller.load()
  assert.equal(reads, 0)
  slowWrite.resolve()
  await saving
  await settle()
  assert.equal(reads, 1)
  assert.equal(h.controller.getSnapshot().stored[0].reasoningEfforts.max, 'max')
})

test('read-only, missing and invalid catalogs never write; inherited catalog entries remain intact', async () => {
  const h = fixture()
  const response = await h.settings.describe()
  response.value.writable = false
  h.settings.describe = async () => response
  await h.controller.load()
  h.controller.toggle(0, true)
  await h.controller.save()
  assert.equal(h.writes.length, 0)
  assert.equal(h.controller.getSnapshot().draft, null)
  assert.deepEqual(feature.modelsFrom({ user: {}, value: { providers: { gateway: { models: [{ id: 'inherited', future: true }] } } } }, ['providers', 'gateway', 'models']), [{ id: 'inherited', future: true }])
  assert.deepEqual(feature.modelsFrom({ user: {}, value: {} }, ['providers', 'gateway', 'models']), [])
  assert.throws(() => feature.modelsFrom({ user: { models: [null] } }, ['models']))
  assert.throws(() => feature.modelsFrom({ user: { models: [{ id: '' }] } }, ['models']))
})

test('stopped controllers ignore late reads and read errors never expose remote diagnostics', async () => {
  const h = fixture()
  const pending = deferred()
  h.settings.describe = () => pending.promise
  const loading = h.controller.load()
  h.controller.stop()
  pending.resolve({ ok: true, value: { writable: true, namespaces: [h.namespace()] } })
  await loading
  assert.equal(h.controller.getSnapshot().phase, 'loading')
  h.settings.describe = async () => { throw new Error('private-key-fixture') }
  h.controller.start()
  await settle()
  assert.equal(h.controller.getSnapshot().phase, 'error')
  assert.doesNotMatch(h.controller.getSnapshot().error, /private-key/)
})

test('public slot collisions do not steal the seat, recover after release, and dispose every resource', async () => {
  const previousDocument = globalThis.document
  let removed = 0, competing = true, slotListener, eventListener, eventDisposed = false
  const entries = [], scopes = []
  globalThis.document = { getElementById: () => null, createElement: () => ({ remove() { removed++ } }), head: { appendChild() {} } }
  const remote = { settings: fixture().settings, $on(name, listener) { assert.equal(name, 'settings/document-updated'); eventListener = listener; return () => { eventDisposed = true } } }
  const slots = {
    register(options, component) {
      if (options.name === 'settings.models.provider-card' && competing) throw new Error('occupied')
      const entry = { options, component }; entries.push(entry)
      return () => { entries.splice(entries.indexOf(entry), 1) }
    },
    inject(name, callback) { const dispose = callback(); const scope = { dispose }; scopes.push(scope); return scope },
    subscribe(name, listener) { slotListener = listener; return () => { slotListener = null } },
  }
  try {
    const dispose = feature.mount({ get: name => ({ slots, remote })[name] })
    assert.equal(entries.some(entry => entry.options.name === 'settings.models.provider-card'), false)
    assert.equal(entries.some(entry => entry.options.name === 'settings.models.footer'), true)
    competing = false
    slotListener()
    const card = entries.find(entry => entry.options.name === 'settings.models.provider-card')
    assert.equal(card.options.key, 'llm-pi-ai')
    assert.equal('priority' in card.options, false)
    const face = card.options.inject().settings
    const left = face.describe(), right = face.describe()
    assert.equal(left, right, 'provider cards coalesce concurrent document reads')
    await left
    eventListener('llm-pi-ai')
    dispose()
    assert.deepEqual(entries, [])
    assert.equal(eventDisposed, true)
    assert.equal(slotListener, null)
    assert.equal(removed, 1)
  } finally { globalThis.document = previousDocument }
})
