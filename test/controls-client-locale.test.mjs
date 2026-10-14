import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { readDetectionModels } from '../src/model-detection.js'

const settle = () => new Promise(resolve => setImmediate(resolve))
const interpolate = (text, params) => text.replace(/\{(\w+)\}/g, (match, key) => params && key in params ? String(params[key]) : match)

/**
 * Use the shipped bundle for control, detection and localization checks.
 */
const bundle = (() => {
  const directory = mkdtempSync(join(tmpdir(), 'dshus-locale-bundle-'))
  try {
    mkdirSync(join(directory, 'scripts'))
    cpSync(new URL('../src', import.meta.url), join(directory, 'src'), { recursive: true })
    cpSync(new URL('../scripts/build.mjs', import.meta.url), join(directory, 'scripts/build.mjs'))
    cpSync(new URL('../package.json', import.meta.url), join(directory, 'package.json'))
    execFileSync(process.execPath, [join(directory, 'scripts/build.mjs')], { stdio: 'pipe' })
    return readFileSync(join(directory, 'lib/client.js'), 'utf8')
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  }
})()

function find(node, predicate) {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean)
  if (!node || typeof node !== 'object') return null
  return predicate(node) ? node : find(node.props?.children, predicate)
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return node?.props ? textOf(node.props.children) : ''
}

function harness({ language = 'en', fetch: customFetch, code = bundle, services = {}, slotProps = {} } = {}) {
  let plugin, section, meta, activeStore, index = 0, invalidations = 0
  const stores = new Map(), dictionaries = new Map(), listeners = new Set(), intervals = new Map()
  let snapshot = { active: language, revision: 0 }
  const locale = {
    register(ns, entries) { dictionaries.set(ns, entries); return () => dictionaries.delete(ns) },
    bind(ns) { return (key, params) => interpolate(dictionaries.get(ns)?.[snapshot.active]?.[key] ?? dictionaries.get(ns)?.en?.[key] ?? key, params) },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    switch(language) { snapshot = { active: language, revision: snapshot.revision + 1 }; for (const listener of listeners) listener() },
  }
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } } },
    useState(initial) {
      const store = activeStore, slot = index++
      if (!store.hooks[slot]) store.hooks[slot] = { value: typeof initial === 'function' ? initial() : initial }
      return [store.hooks[slot].value, value => { store.hooks[slot].value = typeof value === 'function' ? value(store.hooks[slot].value) : value }]
    },
    useRef(initial) {
      const slot = index++
      if (!activeStore.hooks[slot]) activeStore.hooks[slot] = { current: initial }
      return activeStore.hooks[slot]
    },
    useEffect(callback, deps) {
      const store = activeStore, slot = index++, previous = store.hooks[slot]
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
        store.pending.push(() => { previous?.cleanup?.(); store.hooks[slot] = { deps, cleanup: callback() } })
      }
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      const slot = index++
      if (!activeStore.hooks[slot]) activeStore.hooks[slot] = { cleanup: subscribe(() => invalidations++) }
      return getSnapshot()
    },
  }
  const fetch = customFetch || (async url => ({ ok: true, json: async () => url.includes('/controls')
    ? { ok: true, settings: { autoQuota: false, intervalMinutes: 60, showModelDetails: true, customQueries: [] } }
    : url.includes('/quota-providers') ? { ok: true, providers: [{ provider: 'deepseek', name: 'DeepSeek', hasBuiltinQuery: true, template: null }] }
    : { ok: true, totals: null, byDay: [], byModel: [], byHour: [] } }))
  vm.runInNewContext(code, {
    window: { dshDesktop: { deviceInfo() {} }, localStorage: { getItem: () => null }, __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } } },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } },
    console, URLSearchParams, fetch: async (url, options) => url.includes("/stats") ? ({ ok: true, json: async () => ({ ok: true, totals: {}, byDay: [], byHour: [], byModel: [] }) }) : fetch(url, options),
    setInterval(callback) { const id = intervals.size + 1; intervals.set(id, callback); return id },
    clearInterval: id => intervals.delete(id),
    setTimeout, clearTimeout,
  })
  plugin.apply({
    get: name => services[name] || (name === 'locale' ? locale : name === 'slots' ? {
      inject: (_name, callback) => callback(),
      register(options, render) { meta = options; section = render(slotProps); return () => {} },
    } : undefined),
    effect: callback => callback(),
  })
  function render(type, props, key = type.name) {
    const store = stores.get(key) || { hooks: [], pending: [] }
    stores.set(key, store); activeStore = store; index = 0
    const tree = type(props)
    return { tree, flush: () => { for (const callback of store.pending.splice(0)) callback() } }
  }
  return { render, section, meta, locale, plugin, intervals, invalidations: () => invalidations,
    page: () => render(section.type, section.props),
    controlsPage: () => render(section.type, { ...section.props, embedded: true }),
    component: (tree, name, predicate = () => true) => find(tree, node => node.type?.name === name && predicate(node)),
  }
}

test('model detection visibility persists independently and never starts inference', async () => {
 const settings={autoQuota:false,intervalMinutes:60,customQueries:[]},requests=[];
 const h=harness({language:'zh',fetch:async(url,opts={})=>{requests.push(url);if(url.endsWith('/controls')){if(opts.method==='POST')Object.assign(settings,JSON.parse(opts.body));return {ok:true,json:async()=>({ok:true,settings:structuredClone(settings)})}}return {ok:true,json:async()=>({ok:true,providers:[]})}}});
 h.page().flush();await settle();
 const panel=()=>{const el=h.component(h.controlsPage().tree,'ControlsPanel');return h.render(el.type,el.props).tree};
 const enabled=()=>Boolean(find(h.page().tree,node=>node.props?.id==='dshus-tab-detection'));
 assert.equal(enabled(),false);
 const toggle=()=>find(panel(),n=>n.props?.role==='switch'&&n.props['aria-label']==='模型检测');
 assert.equal(toggle().props['aria-checked'],false);toggle().props.onClick();await settle();assert.equal(settings.showModelDetection,true);assert.equal(enabled(),true);
 assert.ok(find(panel(),n=>n.props?.['aria-label']==='token输出速度'));
 toggle().props.onClick();await settle();assert.equal(enabled(),false);
 assert.ok(requests.every(url=>!url.includes('/model-detection')));
})

test('controls group related switches, default reasoning on, and keep failed saves unchanged', async () => {
  const settings = { autoQuota: false, intervalMinutes: 300, showModelDetails: true, customQueries: [] }
  let failSave = false
  const h = harness({ language: 'zh', fetch: async (url, opts = {}) => {
    if (url.endsWith('/controls')) {
      if (opts.method === 'POST') {
        if (failSave) throw new Error('offline')
        Object.assign(settings, JSON.parse(opts.body))
      }
      return { ok: true, json: async () => ({ ok: true, settings: structuredClone(settings) }) }
    }
    return { ok: true, json: async () => ({ ok: true, providers: [], byDay: [], byModel: [], byHour: [], tokenSpeeds: [] }) }
  } })
  const page = h.page(); page.flush(); await settle()
  const controls = () => {
    const el = h.component(h.controlsPage().tree, 'ControlsPanel')
    return h.render(el.type, el.props).tree
  }
  const reasoningSwitch = () => find(controls(), node => node.props?.['aria-label'] === '模型推理强度')
  assert.equal(reasoningSwitch().props['aria-checked'], true, 'missing saved keys use the default-on value')
  // 模型功能 and 用量展示 are two of the four control cards. They carry no
  // visible heading: each is named by aria-label on the card itself, so a screen
  // reader still announces the group while the UI shows no section titles.
  for (const [label, switches] of [
    ['模型功能', ['模型推理强度', '高级模型选择器', '自动获取剩余余额']],
    ['用量展示', ['模型明细与分布', 'token输出速度', '模型检测']],
  ]) {
    const card = find(controls(), node => node.type === 'section' && node.props?.['aria-label'] === label)
    assert.ok(card, label + ' card exists')
    assert.equal(card.type, 'section')
    for (const name of switches) assert.ok(find(card, node => node.props?.role === 'switch' && node.props['aria-label'] === name))
  }
  assert.ok(!find(controls(), node => node.props?.['aria-labelledby'] === 'dshus-control-model-heading'), 'the model heading is gone')
  assert.ok(!find(controls(), node => node.props?.['aria-labelledby'] === 'dshus-control-display-heading'), 'the display heading is gone')
  assert.ok(!find(controls(), node => node.props?.['aria-labelledby'] === 'dshus-control-balance-heading'), 'the balance section no longer exists')
  // The query card keeps its visible heading — its first field no longer repeats it.
  const querySection = find(controls(), node => node.props?.['aria-labelledby'] === 'dshus-control-query-heading')
  assert.equal(querySection.type, 'section')
  assert.ok(find(querySection, node => node.props?.id === 'dshus-control-query-heading'), 'the query source lives in the query card')
  assert.ok(!find(querySection, node => node.props?.id === 'dshus-query-provider-label'), 'the field does not repeat the card heading')
  assert.ok(!find(controls(), node => node.props?.id === 'dshus-auto-interval'))
  reasoningSwitch().props.onClick(); await settle()
  assert.equal(settings.modelReasoning, false)
  assert.equal(reasoningSwitch().props['aria-checked'], false)
  failSave = true
  reasoningSwitch().props.onClick(); await settle()
  assert.equal(settings.modelReasoning, false)
  assert.equal(reasoningSwitch().props['aria-checked'], false, 'failed saves do not change feature visibility')
  failSave = false
  reasoningSwitch().props.onClick(); await settle()
  assert.equal(reasoningSwitch().props['aria-checked'], true)
  h.locale.switch('en')
  // The two feature cards carry no visible title, so the English copy starts at
  // the first switch and the query card keeps its visible heading.
  const englishText = textOf(controls())
  assert.match(englishText, /Model reasoning settings.*Advanced model selector.*Fetch remaining balance automatically/)
  assert.match(englishText, /Model detection/)
  assert.match(englishText, /Query source/)
  // The card names still reach assistive tech even though they are not painted.
  for (const name of ['Model features', 'Usage display']) {
    assert.ok(find(controls(), node => node.type === 'section' && node.props?.['aria-label'] === name), name + ' names its card')
  }
})

test('late control reads and failures cannot undo saved switches or hide the detection tab', async () => {
  const settings = { autoQuota: false, intervalMinutes: 60, showModelDetails: true, showModelDetection: false, showTokenSpeed: true, advancedModelSelect: false, customQueries: [] }
  const delayed = []
  let holdReads = false
  const h = harness({ language: 'zh', fetch: async (url, opts = {}) => {
    if (url.endsWith('/controls')) {
      if (opts.method === 'POST') Object.assign(settings, JSON.parse(opts.body))
      const body = { ok: true, settings: structuredClone(settings) }
      if (holdReads && opts.method !== 'POST') return new Promise((resolve, reject) => delayed.push({ resolve: () => resolve({ ok: true, json: async () => body }), reject }))
      return { ok: true, json: async () => body }
    }
    return { ok: true, json: async () => ({ ok: true, providers: [], byDay: [], byModel: [], byHour: [], tokenSpeeds: [] }) }
  } })
  let page = h.page(); page.flush(); await settle()
  const controlProps = () => h.component(h.controlsPage().tree, 'ControlsPanel').props
  holdReads = true
  controlProps().onReload()
  assert.equal(delayed.length, 1)
  await controlProps().onSave({ showModelDetection: true, showTokenSpeed: false })
  delayed.shift().resolve(); await settle()
  assert.equal(controlProps().control.settings.showModelDetection, true)
  assert.equal(controlProps().control.settings.showTokenSpeed, false)
  assert.ok(find(h.page().tree, node => node.props?.id === 'dshus-tab-detection'))
  controlProps().onReload()
  await controlProps().onSave({ showTokenSpeed: true })
  delayed.shift().reject(new Error('obsolete read failed')); await settle()
  assert.equal(controlProps().ready, true)
  assert.equal(controlProps().error, '')
  assert.equal(controlProps().control.settings.showTokenSpeed, true)
})

test('provider drafts survive provider changes while usage settings exclude the controls panel', async () => {
  const h = harness({ language: 'zh' })
  // The embedded controls page hands the query module to the model-access
  // control view, so the picker is reached through the rendered page rather
  // than through the ControlsPanel element alone.
  const element = h.component(h.controlsPage().tree, 'ControlsPanel')
  const providers = [{ provider: 'one', name: 'One', template: { url: 'https://one.example' } }, { provider: 'two', name: 'Two', template: { url: 'https://two.example' } }]
  const props = { ...element.props, ready: true, api: { quotaProviders: async () => ({ ok: true, providers }) } }
  let panel = h.render(element.type, props); panel.flush(); await settle()
  panel = h.render(element.type, props)
  find(panel.tree, node => node.type?.name === 'ProviderPicker').props.onChange('one')
  panel = h.render(element.type, props)
  find(panel.tree, node => node.props?.id === 'dshus-query-template').props.onChange({ target: { value: '{"draft":1}' } })
  panel = h.render(element.type, props)
  find(panel.tree, node => node.type?.name === 'ProviderPicker').props.onChange('two')
  panel = h.render(element.type, props)
  find(panel.tree, node => node.props?.id === 'dshus-query-template').props.onChange({ target: { value: '{"draft":2}' } })
  panel = h.render(element.type, props)
  find(panel.tree, node => node.type?.name === 'ProviderPicker').props.onChange('one')
  assert.equal(find(h.render(element.type, props).tree, node => node.props?.id === 'dshus-query-template').props.value, '{"draft":1}')
  assert.ok(find(h.page().tree, node => node.props?.id === 'dshus-tab-usage'))
  assert.ok(!find(h.page().tree, node => node.props?.id === 'dshus-control-panel'))
  assert.equal(h.component(h.controlsPage().tree, 'ControlsPanel').type, element.type)
  assert.equal(find(h.render(element.type, props).tree, node => node.props?.id === 'dshus-query-template').props.value, '{"draft":1}')
})

test('the control layout folds balance into model features, inlines the interval, and grids all four cards', () => {
  // The layout lives in the injected stylesheet, so the shipped bundle text is
  // the artifact under test here.
  const css = bundle
  assert.match(css, /\.dshus-setting-tail\s*\{[^}]*display:\s*flex/, 'the switch and interval share one line')
  assert.match(css, /\.dshus-select-inline\s*\{[^}]*width:\s*auto/, 'the interval select is compact, not a full-width field')
  // All four cards share one two-column grid, so the two rows line up.
  assert.match(css, /\.dshus-ma-control-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/, 'the four cards sit in two columns')
  assert.match(css, /\.dshus-ma-control-grid\s*\{[^}]*align-items:\s*stretch/, 'both cards of a row share the taller height')
  // Both layouts collapse before the columns become unreadable.
  assert.match(css, /@container\s*\(max-width:\s*720px\)\s*\{\s*\.dshus-ma-control-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
})

test('the embedded controls mount their regions directly and accept a gateway grid slot', async () => {
  const h = harness({ language: 'zh' })
  const page = h.controlsPage(); page.flush(); await settle()
  const embedded = h.controlsPage()
  const element = h.component(embedded.tree, 'ControlsPanel')
  const standalone = h.render(element.type, element.props).tree
  const grid = find(standalone, node => node.props?.['data-part'] === 'control-grid')
  const cards = grid.props.children.flat(Infinity).filter(Boolean)
  assert.equal(cards.length, 3, 'all three host regions render without an effect-based handoff')
  const cardsWith = predicate => cards.filter(cell => find(cell, predicate))
  assert.equal(cardsWith(node => node.type === 'section' && node.props?.['aria-label'] === '模型功能').length, 1)
  assert.equal(cardsWith(node => node.type === 'section' && node.props?.['aria-label'] === '用量展示').length, 1)
  assert.equal(cardsWith(node => node.type === 'section' && node.props?.['aria-labelledby'] === 'dshus-control-query-heading').length, 1)
  assert.ok(cards.every(cell => cell.props?.className?.includes('dshus-ma-control-cell')))
  const gatewayCard = { type: 'div', props: { 'data-part': 'gateway-cell' } }
  const embeddedWithGateway = h.render(element.type, { ...element.props, gatewayCard }).tree
  const fullGrid = find(embeddedWithGateway, node => node.props?.['data-part'] === 'control-grid')
  const fullCards = fullGrid.props.children.flat(Infinity).filter(Boolean)
  assert.equal(fullCards.length, 4)
  assert.equal(fullCards[2], gatewayCard, 'the gateway precedes the query source in the second row')
})

// Exercise the backend's native DSH ProviderInfo conversion in the UI tests.
const detectionModels = provider => readDetectionModels({ get: () => ({
  listProviders: () => [{ id: 'gateway', name: 'Gateway' }, { id: 'other', name: 'Other' }],
  listModels: async route => (route === 'other' ? [{ id: 'model-b', name: 'Model B' }, { id: 'model-c', name: 'Model C' }] : [{ id: 'model-a', name: 'Model A' }]).map(model => ({ ...model, provider: route })),
  stream() { assert.fail('reading detection selectors must not start inference') },
}) }, provider)
async function detectionPage(h, props) {
  for (let i = 0; i < 3; i++) { h.render(h.plugin.__components.DetectionPanel, props).flush(); await settle() }
  return h.render(h.plugin.__components.DetectionPanel, props)
}

test('detection chooses providers and models independently and only starts confirmed requests', async () => {
  const h = harness(), requests = [], tests = []
  let current = { key: 'one' }, model = { status: 'ready', current: { provider: 'gateway', model: 'model-a', reasoningEffort: 'high' } }, prepared
  const store = get => ({ getSnapshot: get, subscribe: () => () => {} })
  const plan = { requests: 3, samples: 3, maxTokens: 4096, estimatedInputTokens: 500, maxOutputTokens: 12288, budgetTokens: 12000 }
  const props = { active: true, uiSession: { current: store(() => current) }, modelDirectories: { directoryFor: () => ({ store: store(() => model), load: async () => {}, select() { assert.fail('detection must not change the conversation model') } }) },
    api: { modelDetectionModels: detectionModels, modelFingerprintEngine: async () => ({ version: 'fixture', modelCount: 57 }), modelDetectionStatus: async opts => { requests.push(opts); return { ok: true, job: null } }, modelDetection: async body => {
      tests.push(body)
      if (body.action === 'plan') { prepared = body; return { quote: { id: 'quote', selection: body.selection, testSelection: { ...body.selection, reasoningEffort: 'off' }, plan } } }
      return { job: { id: 'job', sessionId: prepared.sessionId, status: body.action === 'cancel' ? 'cancelled' : 'running', selection: prepared.selection, testSelection: prepared.selection, plan, results: [], usage: {}, progress: 0 } }
    } } }
  let panel = await detectionPage(h, props)
  const button = text => find(panel.tree, node => node.type === 'button' && textOf(node) === text)
  const choose = (id, value) => find(panel.tree, node => node.props?.id === id).props.onChange({ target: { value } })
  assert.equal(tests.length, 0)
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), { session: 'one' })
  assert.equal(find(panel.tree, node => node.props?.id === 'dshus-detection-model').props.value, 'model-a')
  assert.match(textOf(panel.tree), /Random-number fingerprint/)
  assert.doesNotMatch(textOf(panel.tree), /KBF|Capability test|Create trusted reference|[\u4e00-\u9fff]/)
  assert.equal(button('Start detection (uses tokens)').props.disabled, true)
  button('Preview detection budget').props.onClick(); await settle()
  assert.equal(tests[0].action, 'plan'); assert.equal(tests[0].sampleCount, 3)
  assert.deepEqual(JSON.parse(JSON.stringify(tests[0].selection)), model.current)
  assert.equal(tests[0].budgetTokens, 12000); assert.equal(tests[0].ackCost, undefined)
  assert.equal(tests[0].maxTokens, 4096)
  panel = await detectionPage(h, props)
  assert.match(textOf(panel.tree), /Output limit 12,288 tokens/)
  assert.match(textOf(panel.tree), /4,096 tokens per request/)
  button('Start detection (uses tokens)').props.onClick(); await settle()
  assert.equal(tests[1].action, 'start'); assert.equal(tests[1].ackCost, true); assert.equal(tests[1].planId, 'quote')
  panel = await detectionPage(h, props)
  assert.equal(find(panel.tree, node => node.props?.id === 'dshus-detection-provider').props.disabled, true)
  button('Cancel detection').props.onClick(); await settle()
  panel = await detectionPage(h, props)
  assert.equal(tests[2].action, 'cancel'); assert.match(textOf(panel.tree), /Inconclusive/)
  assert.match(textOf(panel.tree), /Detection cancelled; incurred usage is still counted/)
  choose('dshus-detection-provider', 'other')
  panel = await detectionPage(h, props)
  choose('dshus-detection-model', 'model-c')
  panel = await detectionPage(h, props)
  assert.equal(button('Start detection (uses tokens)').props.disabled, true)
  button('Preview detection budget').props.onClick(); await settle()
  assert.deepEqual(JSON.parse(JSON.stringify(tests[3].selection)), { provider: 'other', model: 'model-c' })
  assert.equal(tests[3].sessionId, 'one')
  assert.equal(model.current.model, 'model-a')
  panel = await detectionPage(h, props)
  choose('dshus-detection-samples', '1')
  panel = await detectionPage(h, props)
  assert.equal(button('Start detection (uses tokens)').props.disabled, true, 'sampling changes invalidate the quote')
  current = { key: 'two' }; model = { status: 'ready', current: { provider: 'gateway', model: 'model-a' } }
  panel = await detectionPage(h, props)
  assert.equal(requests.at(-1).session, 'two')
  assert.equal(find(panel.tree, node => node.props?.id === 'dshus-detection-model').props.value, 'model-c', 'conversation changes preserve manual detection selection')
  current = {}
  panel = await detectionPage(h, props)
  assert.equal(button('Preview detection budget').props.disabled, false, 'no conversation is required')
  button('Preview detection budget').props.onClick(); await settle()
  assert.equal(tests[4].sessionId, ''); assert.equal(tests[4].sampleCount, 1)
  assert.equal(tests[4].selection.model, 'model-c'); assert.equal(tests[4].selection.provider, 'other')
  panel = await detectionPage(h, props)
  choose('dshus-detection-output-limit', '8192')
  panel = await detectionPage(h, props)
  assert.equal(button('Start detection (uses tokens)').props.disabled, true, 'output-limit changes invalidate the quote')
  button('Preview detection budget').props.onClick(); await settle()
  assert.equal(tests[5].maxTokens, 8192)
  panel = await detectionPage(h, props)
  choose('dshus-detection-budget', '20000')
  panel = await detectionPage(h, props)
  assert.equal(button('Start detection (uses tokens)').props.disabled, true, 'total-budget changes invalidate the quote')
})

test('late provider catalogs cannot replace the selected detection model and failures block previews', async () => {
  const h = harness(), pending = [], tests = []
  const props = { active: true, api: {
    modelFingerprintEngine: async () => ({ version: 'fixture' }), modelDetectionStatus: async () => ({ job: null }),
    modelDetectionModels: provider => provider ? new Promise((resolve, reject) => pending.push({ provider, resolve, reject })) : detectionModels(),
    modelDetection: async body => { tests.push(body); return { quote: { id: 'quote', testSelection: body.selection, plan: {} } } },
  } }
  let panel = await detectionPage(h, props)
  assert.equal(pending[0].provider, 'gateway')
  find(panel.tree, node => node.props?.id === 'dshus-detection-provider').props.onChange({ target: { value: 'other' } })
  panel = await detectionPage(h, props)
  pending[1].resolve(await detectionModels('other')); await settle()
  panel = await detectionPage(h, props)
  pending[0].resolve(await detectionModels('gateway')); await settle()
  panel = await detectionPage(h, props)
  assert.equal(find(panel.tree, node => node.props?.id === 'dshus-detection-model').props.value, 'model-b')
  assert.doesNotMatch(textOf(find(panel.tree, node => node.props?.id === 'dshus-detection-model')), /Model A/)
  const preview = () => find(panel.tree, node => node.type === 'button' && textOf(node) === 'Preview detection budget')
  preview().props.onClick(); await settle(); panel = await detectionPage(h, props)
  assert.equal(tests[0].selection.provider, 'other'); assert.equal(tests[0].selection.model, 'model-b')
  find(panel.tree, node => node.props?.id === 'dshus-detection-provider').props.onChange({ target: { value: 'gateway' } })
  panel = await detectionPage(h, props)
  pending[2].reject(new Error('Catalog unavailable')); await settle(); panel = await detectionPage(h, props)
  assert.equal(preview().props.disabled, true)
  assert.equal(find(panel.tree, node => node.type === 'button' && textOf(node) === 'Start detection (uses tokens)').props.disabled, true)
  assert.match(textOf(panel.tree), /Catalog unavailable/); assert.equal(tests.length, 1)
})

test('completed fingerprint shows candidates and limited confidence before the form and refreshes usage once', async () => {
  const h = harness(), store = get => ({ getSnapshot: get, subscribe: () => () => {} })
  let current = { key: 'one' }
  const selection = { provider: 'gateway', model: 'model-a' }, model = { status: 'ready', current: selection }
  let notified = 0
  const job = { id: 'saved', sessionId: 'one', status: 'complete', selection, plan: { requests: 3 }, progress: 3,
    results: Array.from({ length: 3 }, () => ({ outcome: 'scored', valid: 310, expected: 310, stop: 'stop' })),
    conclusion: { verdict: 'candidate-consistent', reason: 'closed-set-ranking' }, usage: { inputTokens: 1000, outputTokens: 250 }, usageReported: true, usageSaved: true,
    identity: { usedSamples: 3, probability: .875, candidates: [{ id: 'a', name: 'model-a', score: -1.5, probability: .875 }, { id: 'b', name: 'model-b', score: -2, probability: .125 }] }, channel: { tps: 100, ttftMs: 1000 } }
  const requests = []
  const props = { active: true, onUsageUpdated: () => notified++, uiSession: { current: store(() => current) }, modelDirectories: { directoryFor: () => ({ store: store(() => model), load: async () => {} }) },
    api: { modelDetectionModels: detectionModels, modelFingerprintEngine: async () => ({ version: 'fixture', modelCount: 57 }), modelDetectionStatus: async options => { requests.push(options); return { job } } } }
  const type = h.plugin.__components.DetectionPanel
  let panel = h.render(type, props); panel.flush(); await settle()
  panel = h.render(type, props); panel.flush()
  const text = textOf(panel.tree)
  assert.ok(text.indexOf('Detection result') < text.indexOf('Random-number fingerprint'))
  assert.match(text, /Top candidate matches the requested model/)
  assert.match(text, /Reference-set confidence.*87.5%/)
  const rankings = find(panel.tree, node => node.props?.className === 'dshus-detection-rankings')
  assert.match(textOf(rankings), /model-a.*87.5%.*model-b.*12.5%/)
  assert.equal(find(rankings, node => node.props?.style?.width === '87.5%').type, 'span')
  assert.match(text, /Valid samples 3 \/ 3/)
  assert.match(text, /does not prove model identity or measure capability downgrades/)
  assert.match(text, /1.25k tokens used · Included in statistics/)
  assert.equal(find(panel.tree, node => node.props?.title === '1,250').type, 'p')
  const summary = find(panel.tree, node => node.props?.className === 'dshus-module dshus-detection-summary')
  const details = find(summary, node => node.type === 'details')
  assert.equal(details.props.open, undefined); assert.equal(textOf(find(details, node => node.type === 'summary')), 'Detection details')
  assert.match(textOf(details), /Candidate model.*Fingerprint score.*model-b.*-2.000/s)
  assert.doesNotMatch(text, /\/100|p-value|undefined|NaN|[\u4e00-\u9fff]/)
  h.render(type, props).flush(); assert.equal(notified, 1)
  current = { key: 'another' }
  panel = h.render(type, props); panel.flush(); await settle(); panel = h.render(type, props)
  assert.match(textOf(panel.tree), /Previous detection result/)
  assert.match(find(panel.tree, node => node.type === 'h3' && textOf(node) === 'Previous detection result').props.title, /This saved result applies to the model and settings listed below/)
  current = {}
  panel = h.render(type, props); panel.flush(); await settle(); panel = h.render(type, props)
  assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1))), {}); assert.match(textOf(panel.tree), /Previous detection result/)
  assert.equal(find(panel.tree, node => node.type === 'button' && textOf(node) === 'Preview detection budget').props.disabled, false)
  assert.equal(notified, 1)
})

test('truncated sampling keeps partial rankings visible and explains which limit to change', async () => {
  const h = harness(), selection = { provider: 'gateway', model: 'model-a' }
  const job = { id: 'partial', status: 'failed', sessionId: '', selection, progress: 3,
    plan: { requests: 3, maxOutputTokens: 6144, budgetTokens: 12000, numbers: [323, 308, 319] },
    conclusion: { verdict: 'ranking-only', reason: 'truncated' }, usage: { inputTokens: 777, outputTokens: 6144 }, usageReported: true, usageSaved: true,
    identity: { usedSamples: 2, probability: null, candidates: [{ id: 'a', name: 'Closest model', family: 'Example', score: -1.25, probability: null }] },
    results: [323, 308, 140].map((valid, index) => ({ valid, expected: [323, 308, 319][index], outcome: index < 2 ? 'scored' : 'incomplete', stop: 'max-tokens' })) }
  const props = { active: true, api: { modelDetectionModels: detectionModels, modelFingerprintEngine: async () => ({ version: 'fixture', modelCount: 57 }), modelDetectionStatus: async () => ({ job }) } }
  let panel = await detectionPage(h, props), text = textOf(panel.tree)
  assert.match(text, /Closest model.*Ranking only.*Increase the output limit per request/)
  assert.match(text, /Rankings use 2 valid samples/)
  assert.match(text, /Sample 1\s+·\s+Valid.*323\s+\/\s+323.*Sample 2\s+·\s+Valid.*308\s+\/\s+308.*Sample 3\s+·\s+Output truncated.*140\s+\/\s+319/)
  assert.match(text, /6.92k tokens used/); assert.match(text, /2,048 tokens per request/)
  assert.equal(find(panel.tree, node => node.props?.className === 'dshus-detection-bar'), undefined)
  assert.doesNotMatch(textOf(find(panel.tree, node => node.props?.className === 'dshus-detection-rankings')), /%/)
  assert.doesNotMatch(text, /undefined|NaN|[\u4e00-\u9fff]/)
  h.locale.switch('zh')
  panel = await detectionPage(h, props); assert.match(textOf(panel.tree), /单次输出上限.*有效样本 2 \/ 3|有效样本 2 \/ 3.*单次输出上限/)
  h.locale.switch('ja')
  panel = await detectionPage(h, props); assert.match(textOf(panel.tree), /1回の出力上限/)
})

test('low confidence remains visible with a caution and uses the same ranked rows', async () => {
  const h = harness(), selection = { provider: 'gateway', model: 'model-a' }
  const job = { id: 'low', status: 'complete', sessionId: '', selection, plan: { requests: 3 },
    conclusion: { verdict: 'ranking-only', reason: 'low-confidence' },
    identity: { usedSamples: 3, probability: .6, candidates: [{ id: 'a', name: 'Model A', score: -1, probability: .6 }] } }
  const panel = await detectionPage(h, { active: true, api: { modelDetectionModels: detectionModels, modelFingerprintEngine: async () => ({}), modelDetectionStatus: async () => ({ job }) } })
  assert.match(textOf(panel.tree), /60.0%.*Low confidence/)
  assert.doesNotMatch(textOf(panel.tree), /Top candidate matches the requested model|Top candidate differs from/)
})
