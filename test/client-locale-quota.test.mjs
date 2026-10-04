import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
const settle = () => new Promise(resolve => setImmediate(resolve))
const interpolate = (text, params) => text.replace(/\{(\w+)\}/g, (match, key) => params && key in params ? String(params[key]) : match)

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

function harness({ language = 'en', fetch: customFetch, code = source, services = {}, slotProps = {} } = {}) {
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
    console, URLSearchParams, fetch,
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
    component: (tree, name, predicate = () => true) => find(tree, node => node.type?.name === name && predicate(node)),
  }
}

test('visibility controls default match off and speed on, persist, and keep keyboard tabs valid', async () => {
  // Start with the pre-feature payload to exercise missing-key defaults.
  const settings = { autoQuota: false, intervalMinutes: 60, showModelDetails: false, customQueries: [] }
  const requests = []
  const h = harness({ language: 'zh', fetch: async (url, opts = {}) => {
    requests.push(url)
    if (url.endsWith('/controls')) {
      if (opts.method === 'POST') Object.assign(settings, JSON.parse(opts.body))
      return { ok: true, json: async () => ({ ok: true, settings: structuredClone(settings) }) }
    }
    return { ok: true, json: async () => ({ ok: true, providers: [], byDay: [], byModel: [], byHour: [], tokenSpeeds: [] }) }
  } })
  let page = h.page(); page.flush(); await settle()
  assert.ok(!find(h.page().tree, n => n.props?.id === 'dshus-tab-match'))
  assert.ok(h.component(h.page().tree, 'TokenSpeedRanking'), 'speed is independent of model-details visibility')
  const selectTab = id => find(h.page().tree, n => n.props?.id === 'dshus-tab-' + id).props.onClick()
  const keyFrom = (id, key) => {
    selectTab(id)
    const tree = h.page().tree, tabs = []
    for (const name of ['usage', 'quota', 'match', 'control']) {
      const button = find(tree, n => n.props?.id === 'dshus-tab-' + name)
      if (button) tabs.push({ focus: () => tabs.focused = name })
    }
    find(tree, n => n.props?.id === 'dshus-tab-' + id).props.onKeyDown({ key, preventDefault() {}, currentTarget: { parentElement: { querySelectorAll: () => tabs } } })
    return tabs.focused
  }
  assert.equal(keyFrom('quota', 'ArrowRight'), 'control')
  const controlsElement = () => h.component(h.page().tree, 'ControlsPanel')
  const controls = () => { const el = controlsElement(); return h.render(el.type, el.props).tree }
  let panel = controls()
  assert.equal(find(panel, n => n.props?.role === 'switch' && n.props['aria-label'] === '检测模型匹配').props['aria-checked'], false)
  assert.equal(find(panel, n => n.props?.role === 'switch' && n.props['aria-label'] === 'token输出速度').props['aria-checked'], true)
  find(panel, n => n.props?.role === 'switch' && n.props['aria-label'] === '检测模型匹配').props.onClick()
  await settle()
  assert.equal(settings.showModelMatch, true)
  assert.ok(find(h.page().tree, n => n.props?.id === 'dshus-tab-match'))
  assert.equal(keyFrom('quota', 'ArrowRight'), 'match')
  assert.ok(h.component(h.page().tree, 'MatchPanel'))
  selectTab('control')
  find(controls(), n => n.props?.role === 'switch' && n.props['aria-label'] === 'token输出速度').props.onClick()
  await settle()
  selectTab('usage')
  assert.ok(!h.component(h.page().tree, 'TokenSpeedRanking'))
  selectTab('control')
  find(controls(), n => n.props?.role === 'switch' && n.props['aria-label'] === 'token输出速度').props.onClick()
  await settle()
  selectTab('usage')
  assert.ok(h.component(h.page().tree, 'TokenSpeedRanking'))
  selectTab('control')
  const reload = controlsElement().props.onReload
  selectTab('match')
  settings.showModelMatch = false
  reload(); await settle()
  page = h.page()
  assert.ok(!find(page.tree, n => n.props?.id === 'dshus-tab-match'))
  assert.ok(!h.component(page.tree, 'MatchPanel'))
  assert.equal(find(page.tree, n => n.props?.id === 'dshus-tab-usage').props['aria-selected'], true)
  assert.ok(requests.every(url => !url.includes('/model-match')), 'display toggles never start model analysis or independent tests')
})

test('late control reads and failures cannot undo saved switches or hide the match tab', async () => {
  const settings = { autoQuota: false, intervalMinutes: 60, showModelDetails: true, showModelMatch: false, showTokenSpeed: true, advancedModelSelect: false, customQueries: [] }
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
  find(h.page().tree, n => n.props?.id === 'dshus-tab-control').props.onClick()
  const controlProps = () => h.component(h.page().tree, 'ControlsPanel').props
  holdReads = true
  controlProps().onReload()
  assert.equal(delayed.length, 1)
  await controlProps().onSave({ showModelMatch: true, showTokenSpeed: false })
  delayed.shift().resolve(); await settle()
  assert.equal(controlProps().control.settings.showModelMatch, true)
  assert.equal(controlProps().control.settings.showTokenSpeed, false)
  assert.ok(find(h.page().tree, n => n.props?.id === 'dshus-tab-match'))
  controlProps().onReload()
  await controlProps().onSave({ showTokenSpeed: true })
  delayed.shift().reject(new Error('obsolete read failed')); await settle()
  assert.equal(controlProps().ready, true)
  assert.equal(controlProps().error, '')
  assert.equal(controlProps().control.settings.showTokenSpeed, true)
})

test('token output speed sorts TPS, shows TTFT with provider-only subtext, expands, and translates empty states', () => {
  const h = harness(), type = h.plugin.__components.TokenSpeedRanking
  let props = { speeds: Array.from({ length: 10 }, (_, i) => ({ key: 'p/model-' + i, model: 'model-' + i, provider: 'p', samples: 2,
    outputTokens: (i + 1) * 100, outputMs: 2000, tokensPerSecond: (i + 1) * 50, averageTtftMs: (i + 1) * 1000 })).concat({ key: 'invalid', samples: 1, tokensPerSecond: Infinity }) }
  let panel = h.render(type, props)
  const rows = tree => {
    const list = find(tree, n => n.type === 'ol')
    return list?.props.children.flat().filter(n => n?.type === 'li') || []
  }
  assert.equal(rows(panel.tree).length, 8)
  assert.equal(rows(panel.tree)[0].props['data-model-key'], 'p/model-9')
  assert.match(textOf(panel.tree), /Token output speed.*TPS \(tok\/s\).*TTFT \(s\)/)
  assert.ok(find(rows(panel.tree)[0], n => n.props?.['aria-label'] === 'TPS: 500 tok/s'))
  assert.ok(find(rows(panel.tree)[0], n => n.props?.['aria-label'] === 'TTFT: 10.0 s'))
  assert.equal(textOf(find(rows(panel.tree)[0], n => n.props?.className === 'dshus-speed-meta')), 'p')
  assert.doesNotMatch(textOf(panel.tree), /valid samples|Grouped by|Uses DSH|ranking$/)
  assert.doesNotMatch(textOf(panel.tree), /Infinity|NaN|[\u4e00-\u9fff]/)
  find(panel.tree, n => n.type === 'button').props.onClick()
  panel = h.render(type, props)
  assert.equal(rows(panel.tree).length, 10)
  assert.equal(find(panel.tree, n => n.type === 'button').props['aria-expanded'], true)
  const zeroWait = h.render(type, { speeds: [{ ...props.speeds[0], tokensPerSecond: 8.76, averageTtftMs: 0 }] }).tree
  assert.ok(find(zeroWait, n => n.props?.['aria-label'] === 'TPS: 8.8 tok/s'))
  assert.ok(find(zeroWait, n => n.props?.['aria-label'] === 'TTFT: 0.0 s'))
  const missingWait = h.render(type, { speeds: [{ ...props.speeds[0], averageTtftMs: null }] }).tree
  assert.ok(find(missingWait, n => n.props?.['aria-label'] === 'TTFT: —'))
  props = { speeds: [] }
  assert.match(textOf(h.render(type, props).tree), /No speed data yet/)
  assert.match(textOf(h.render(type, { ...props, loading: true }).tree), /Loading/)
  h.locale.switch('ja')
  assert.match(textOf(h.render(type, props).tree), /速度データはまだありません/)
  h.locale.switch('zh')
  assert.match(textOf(h.render(type, props).tree), /token输出速度.*暂无速度数据/)
})

test('settings copy, accessibility labels and notices follow the application locale live', async () => {
  const h = harness()
  assert.ok(h.plugin.inject.includes('locale'))
  assert.equal(h.meta.label(), 'Usage statistics')
  let page = h.page()
  assert.match(textOf(page.tree), /Usage statistics.*Usage.*Quota.*Controls/)
  page.flush(); await settle()
  find(page.tree, node => node.props?.id === 'dshus-tab-control').props.onClick()
  const element = h.component(h.page().tree, 'ControlsPanel')
  let controls = h.render(element.type, { ...element.props, ready: true })
  controls.flush(); await settle()
  controls = h.render(element.type, { ...element.props, ready: true })
  find(controls.tree, node => node.props?.role === 'switch' && node.props['aria-label'] === 'Fetch remaining balance automatically').props.onClick()
  controls = h.render(element.type, { ...element.props, ready: true })
  assert.match(textOf(controls.tree), /may incur a small charge/)
  assert.match(textOf(controls.tree), /10 minutes.*1 hour.*5 hours.*Daily/)
  assert.doesNotMatch(textOf(controls.tree), /[\u4e00-\u9fff]/)
  h.locale.switch('ja')
  assert.ok(h.invalidations() > 0, 'a locale change schedules the mounted page to render')
  assert.equal(h.meta.label(), '利用状況')
  assert.match(textOf(h.page().tree), /利用状況.*使用量.*利用枠.*設定/)
  controls = h.render(element.type, { ...element.props, ready: true })
  assert.match(textOf(controls.tree), /少額の残高が消費/)
  assert.match(textOf(controls.tree), /10分.*1時間.*5時間.*毎日/)
  h.locale.switch('zh')
  assert.equal(h.meta.label(), '用量统计')
  assert.match(textOf(h.render(element.type, { ...element.props, ready: true }).tree), /自动获取剩余余额/)
})

test('quota labels and countdowns translate while custom metric labels stay verbatim', async () => {
  const h = harness()
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const element = h.component(h.page().tree, 'ProviderQuotasPanel')
  const props = { api: { providerQuotas: async () => ({ ok: true, quotas: [
    { provider: 'anthropic', name: 'Claude 订阅', metrics: [{ label: 'Sonnet 周剩余', kind: 'window', remainingPercent: 42, resetAt: new Date(Date.now() + 3_600_000).toISOString() }] },
    { provider: 'custom', name: 'My provider', custom: true, metrics: [{ label: '我的余额', kind: 'amount', remaining: 8, currency: 'USD', total: 10 }] },
  ] }) } }
  let panel = h.render(element.type, props)
  panel.flush(); await settle()
  panel = h.render(element.type, props)
  assert.match(textOf(panel.tree), /Claude subscription.*Sonnet Weekly remaining.*Resets in/s)
  assert.match(textOf(panel.tree), /我的余额/)
  h.locale.switch('ja')
  panel = h.render(element.type, props)
  assert.match(textOf(panel.tree), /週間枠の残り.*リセット/s)
  assert.match(textOf(panel.tree), /我的余额/)
})

test('quota refresh retains data on pending requests and failures, and rejects late older responses', async () => {
  const h = harness()
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const element = h.component(h.page().tree, 'ProviderQuotasPanel')
  const body = remaining => ({ ok: true, quotas: [{ provider: 'deepseek', name: 'DeepSeek', metrics: [{ label: '账户可用余额', kind: 'amount', remaining, currency: 'CNY' }] }] })
  let rejectRefresh, resolveOld, calls = 0
  const props = { api: { providerQuotas: opts => {
    calls++
    if (opts.fresh) return new Promise((_resolve, reject) => { rejectRefresh = reject })
    if (calls > 1) return new Promise(resolve => { resolveOld = resolve })
    return Promise.resolve(body(10))
  } } }
  let panel = h.render(element.type, props)
  panel.flush(); await settle()
  panel = h.render(element.type, props)
  find(panel.tree, node => node.type === 'button').props.onClick()
  panel = h.render(element.type, props)
  assert.match(textOf(panel.tree), /¥10.00/)
  assert.equal(find(panel.tree, node => node.type === 'button').props.disabled, true)
  rejectRefresh(new Error('查询返回 HTTP 503，请检查地址和供应商凭据。'))
  await settle()
  panel = h.render(element.type, props)
  assert.match(textOf(panel.tree), /HTTP 503/)
  assert.doesNotMatch(textOf(panel.tree), /请检查/)
  assert.match(textOf(panel.tree), /¥10.00/)
  panel = h.render(element.type, { ...props, revision: 1 })
  panel.flush()
  panel = h.render(element.type, { ...props, revision: 1, snapshot: body(20) })
  panel.flush()
  resolveOld(body(1)); await settle()
  assert.match(textOf(h.render(element.type, { ...props, revision: 1, snapshot: body(20) }).tree), /¥20.00/)
})

test('quota tabs retain component identity and refresh-all feeds snapshots without duplicate reads', async () => {
  const requests = [], deferred = []
  const quota = remaining => ({ ok: true, quotas: [{ provider: 'deepseek', name: 'DeepSeek', metrics: [{ kind: 'amount', label: '账户可用余额', remaining, currency: 'CNY' }] }] })
  const wb = credits => ({ ok: true, available: true, status: 'signed-in', credits: { total: credits, accounts: [] } })
  const h = harness({ fetch: async url => {
    requests.push(url)
    if (url.includes('fresh=1')) return new Promise((resolve, reject) => deferred.push({ url, resolve: body => resolve({ ok: true, json: async () => body }), reject }))
    return { ok: true, json: async () => url.includes('/provider-quotas') ? quota(10) : url.includes('/workbuddy') ? wb(100) : url.includes('/controls')
      ? { ok: true, settings: { autoQuota: false, intervalMinutes: 60, showModelDetails: true, customQueries: [] } }
      : { ok: true, totals: null, byDay: [], byModel: [], byHour: [] } }
  } })
  assert.equal(h.component(h.page().tree, 'ProviderQuotasPanel'), undefined, 'quota polling starts only when the tab is first opened')
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  let page = h.page().tree
  const provider = h.component(page, 'ProviderQuotasPanel'), buddy = h.component(page, 'WorkBuddyPanel', node => !node.props.source)
  h.render(provider.type, provider.props).flush()
  h.render(buddy.type, buddy.props).flush()
  await settle()
  find(page, node => node.props?.id === 'dshus-tab-usage').props.onClick()
  page = h.page().tree
  assert.equal(find(page, node => node.props?.id === 'dshus-quota-panel').props.hidden, true)
  assert.equal(h.component(page, 'ProviderQuotasPanel').props.key, provider.props.key)
  find(page, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  page = h.page().tree
  assert.equal(find(page, node => node.props?.id === 'dshus-quota-panel').props.hidden, false)
  assert.match(textOf(h.render(provider.type, h.component(page, 'ProviderQuotasPanel').props).tree), /¥10.00/)
  find(page, node => node.props?.['aria-label'] === 'Refresh all quotas').props.onClick()
  assert.equal(deferred.length, 3)
  page = h.page().tree
  assert.match(textOf(h.render(provider.type, h.component(page, 'ProviderQuotasPanel').props).tree), /¥10.00/)
  for (const request of deferred) {
    if (request.url.includes('/provider-quotas')) request.resolve(quota(20))
    else if (request.url.includes('/workbuddy-ai')) request.reject(new Error('offline'))
    else request.resolve(wb(200))
  }
  await settle()
  page = h.page().tree
  assert.match(textOf(page), /Some quotas could not be updated/)
  const updatedProvider = h.component(page, 'ProviderQuotasPanel')
  h.render(updatedProvider.type, updatedProvider.props).flush()
  assert.match(textOf(h.render(updatedProvider.type, updatedProvider.props).tree), /¥20.00/)
  assert.equal(requests.filter(url => url.includes('fresh=1')).length, 3)
  assert.equal(requests.filter(url => url.includes('/provider-quotas') && !url.includes('fresh=1')).length, 1)
})

test('build uses the scoped package identity and version in both installed client copies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-version-test-'))
  try {
    mkdirSync(join(directory, 'scripts'))
    cpSync(new URL('../src', import.meta.url), join(directory, 'src'), { recursive: true })
    cpSync(new URL('../scripts/build.mjs', import.meta.url), join(directory, 'scripts/build.mjs'))
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: '@fixture/usage-stats', version: '9.8.7-test', type: 'module' }))
    execFileSync(process.execPath, [join(directory, 'scripts/build.mjs')], { stdio: 'pipe' })
    const built = readFileSync(join(directory, 'lib/client.js'), 'utf8')
    assert.equal(built, readFileSync(join(directory, 'client.js'), 'utf8'))
    let definition
    vm.runInNewContext(built, { window: { __ModuleLoader__: { load(value) { definition = value } } } })
    assert.equal(definition.id, '@fixture/usage-stats')
    assert.match(textOf(harness({ code: built }).page().tree), /v9\.8\.7-test/)
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.split(/[\\/]/).pop().startsWith('dsh-version-test-'))
    rmSync(directory, { recursive: true, force: true })
  }
})

test('WorkBuddy preserves credits and expanded plans when an adapter reports a failed update', async () => {
  const h = harness()
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const element = h.component(h.page().tree, 'WorkBuddyPanel')
  const connected = { ok: true, available: true, status: 'signed-in', credits: { total: 800, accounts: [
    { packageName: 'Plan A', size: 300, remain: 200 },
    { packageName: 'Plan B', size: 300, remain: 300 },
    { packageName: 'Plan C', size: 300, remain: 300 },
  ] } }
  const props = { api: { workbuddyStatus: async ({ fresh }) => fresh ? { ok: true, available: true, status: 'error', error: '操作失败，请稍后重试。' } : connected } }
  let panel = h.render(element.type, props)
  panel.flush(); await settle()
  panel = h.render(element.type, props)
  find(panel.tree, node => node.type === 'button' && textOf(node) === 'Show 1 more plans').props.onClick()
  panel = h.render(element.type, props)
  assert.match(textOf(panel.tree), /Plan C/)
  find(panel.tree, node => node.props?.['aria-label'] === 'Refresh WorkBuddy account and credits').props.onClick()
  await settle()
  panel = h.render(element.type, props)
  assert.match(textOf(panel.tree), /800.*Plan C/s)
  assert.match(textOf(panel.tree), /The operation failed/)
  assert.match(textOf(panel.tree), /Collapse other plans/)
})

test('a card refresh targets its provider and displays retained-data diagnostics', async () => {
  const h = harness()
  const calls = []
  const quota = { provider: 'one', name: 'Provider one', metrics: [{ label: 'Balance', kind: 'amount', remaining: 8, currency: 'USD' }], syncedAt: 100 }
  const props = { api: { providerQuotas: async opts => {
    calls.push(opts)
    return { ok: true, quotas: [{ ...quota, ...(opts.fresh ? { stale: true, refreshError: { code: 'service', httpStatus: 503 } } : {}) }] }
  } } }
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const element = h.component(h.page().tree, 'ProviderQuotasPanel')
  let panel = h.render(element.type, props); panel.flush(); await settle()
  panel = h.render(element.type, props)
  find(panel.tree, node => node.type === 'button').props.onClick(); await settle()
  assert.equal(calls[1].provider, 'one'); assert.equal(calls[1].fresh, true)
  assert.match(textOf(h.render(element.type, props).tree), /8\.00.*HTTP 503/s)
  assert.match(textOf(h.render(element.type, props).tree), /last successful data/i)
})

test('provider drafts survive provider changes and the controls panel remains mounted across tabs', async () => {
  const h = harness({ language: 'zh' })
  find(h.page().tree, node => node.props?.id === 'dshus-tab-control').props.onClick()
  const element = h.component(h.page().tree, 'ControlsPanel')
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
  find(h.page().tree, node => node.props?.id === 'dshus-tab-usage').props.onClick()
  const hidden = find(h.page().tree, node => node.props?.id === 'dshus-control-panel')
  assert.equal(hidden.props.hidden, true)
  assert.equal(h.component(hidden, 'ControlsPanel').type, element.type)
  find(h.page().tree, node => node.props?.id === 'dshus-tab-control').props.onClick()
  assert.equal(find(h.render(element.type, props).tree, node => node.props?.id === 'dshus-query-template').props.value, '{"draft":1}')
})

test('merged models remain searchable by any contributing provider', async () => {
  const h = harness({ language: 'zh', fetch: async url => ({ ok: true, json: async () => url.includes('/controls')
    ? { ok: true, settings: { showModelDetails: true, customQueries: [] } }
    : { ok: true, totals: {}, byDay: [], byHour: [], byModel: [
      { key: 'provider-one/model-a', provider: 'provider-one', model: 'model-a', billed: 8 },
      { key: 'provider-two/model-a', provider: 'provider-two', model: 'model-a', billed: 9 },
      { key: 'provider-one/model-b', provider: 'provider-one', model: 'model-b', billed: 1 },
    ] } }) })
  let page = h.page(); page.flush(); await settle()
  page = h.page()
  find(page.tree, node => node.props?.placeholder === '搜索模型或供应商名称…').props.onChange({ target: { value: 'provider-two' } })
  const table = find(h.page().tree, node => node.type === 'tbody')
  assert.match(textOf(table), /model-a/); assert.doesNotMatch(textOf(table), /model-b/)
  assert.match(textOf(table), /17/)
})

test('match page follows the current session model, only analyzes by default, and starts and cancels explicitly', async () => {
  const h = harness(), requests = [], tests = []
  let current = { key: 'one' }, model = { status: 'ready', current: { provider: 'gateway', model: 'model-a', reasoningEffort: 'high' } }
  const store = get => ({ getSnapshot: get, subscribe: () => () => {} })
  const analysis = { verdict: 'insufficient-evidence', strength: 'weak', counts: { samples: 0, missing: 0, exact: 0, different: 0, compatible: 0 }, records: [] }
  const reference = { id: 'local/a', model: 'model-a', provider: 'trusted', origin: 'imported', date: '2026-10-04', count: 128, selfTotal: 128, selfMismatches: 0, effort: 'off', hasCapabilities: false, subsetAvailable: true }
  const plan = { requests: 13, estimatedInputTokens: 3000, maxOutputTokens: 10240, budgetTokens: 120000 }
  const props = { active: true, uiSession: { current: store(() => current) }, modelDirectories: { directoryFor: () => ({ store: store(() => model), load: async () => {} }) },
    api: { modelBaselines: async () => ({ references: [reference] }), modelMatch: async opts => { requests.push(opts); return { ok: true, analysis, job: null } }, modelTest: async body => {
      tests.push(body)
      if (body.action === 'plan') return { quote: { id: 'quote', selection: model.current, testSelection: { ...model.current, reasoningEffort: 'off' }, plan } }
      return { job: { id: 'job', status: body.action === 'cancel' ? 'cancelled' : 'running', selection: model.current, testSelection: model.current, plan, results: [], usage: {}, progress: 0 } }
    } } }
  const type = h.plugin.__components.MatchPanel
  let panel = h.render(type, props); panel.flush(); await settle()
  assert.equal(tests.length, 0)
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0])), { session: 'one', provider: 'gateway', model: 'model-a', reasoningEffort: 'high' })
  panel = h.render(type, props)
  assert.match(textOf(panel.tree), /Behavioral fingerprint/)
  assert.doesNotMatch(textOf(panel.tree), /[\u4e00-\u9fff]/)
  assert.equal(find(panel.tree, node => node.type === 'button' && textOf(node) === 'Start audit (uses tokens)').props.disabled, true)
  find(panel.tree, node => node.type === 'button' && textOf(node) === 'Preview test budget').props.onClick(); await settle()
  assert.equal(tests[0].action, 'plan'); assert.equal(tests[0].selection.reasoningEffort, 'high'); assert.equal(tests[0].ackCost, undefined)
  panel = h.render(type, props); panel.flush()
  assert.match(textOf(panel.tree), /Output limit 10,240 tokens/)
  assert.equal(find(panel.tree, node => node.type === 'button' && textOf(node) === 'Start audit (uses tokens)').props.disabled, false)
  find(panel.tree, node => node.type === 'button' && textOf(node) === 'Start audit (uses tokens)').props.onClick(); await settle()
  assert.equal(tests[1].ackCost, true); assert.equal(tests[1].planId, 'quote')
  panel = h.render(type, props); panel.flush()
  find(panel.tree, node => node.type === 'button' && textOf(node) === 'Cancel test').props.onClick(); await settle()
  panel = h.render(type, props); panel.flush()
  assert.equal(tests[2].action, 'cancel')
  assert.match(textOf(panel.tree), /Inconclusive/)
  assert.match(textOf(panel.tree), /Audit cancelled; incurred usage is still counted/)
  current = { key: 'two' }; model = { status: 'ready', current: { provider: 'other', model: 'model-b' } }
  panel = h.render(type, props); panel.flush(); await settle()
  assert.equal(requests.at(-1).session, 'two'); assert.equal(requests.at(-1).model, 'model-b')
  assert.equal(tests.length, 3)
  panel = h.render(type, props)
  assert.match(textOf(panel.tree), /No reference for this model/)
  assert.equal(find(panel.tree, node => node.type === 'button' && textOf(node) === 'Start audit (uses tokens)').props.disabled, true)
})

test('completed audit shows its verdict before the form, states the downgrade limitation and refreshes usage', async () => {
  const h = harness(), store = get => ({ getSnapshot: get, subscribe: () => () => {} })
  let current = { key: 'one' }
  const selection = { provider: 'gateway', model: 'model-a' }, model = { status: 'ready', current: selection }
  let notified = 0
  const job = { id: 'saved', sessionId: 'one', status: 'complete', mode: 'audit', selection, plan: { requests: 10 }, progress: 10,
    score: { value: 87.5, matched: 105, valid: 120, count: 128 },
    conclusion: { verdict: 'no-anomaly', reason: 'behavior-consistent' }, usage: { inputTokens: 1000, outputTokens: 250 }, usageReported: true, usageSaved: true,
    identity: { verdict: 'no-significant-difference', count: 128, valid: 120, mismatches: 15, coverage: 120 / 128, pValue: 0.25 },
    capability: { verdict: 'current-sample', count: 16, passed: 8, valid: 16, paired: 0 }, channel: { tps: 100, ttftMs: 1000 } }
  const requests = []
  const props = { active: true, onUsageUpdated: () => notified++, uiSession: { current: store(() => current) }, modelDirectories: { directoryFor: () => ({ store: store(() => model), load: async () => {} }) },
    api: { modelBaselines: async () => ({ references: [] }), modelMatch: async options => { requests.push(options); return { analysis: null, job } } } }
  const type = h.plugin.__components.MatchPanel
  let panel = h.render(type, props); panel.flush(); await settle()
  panel = h.render(type, props); panel.flush()
  const text = textOf(panel.tree)
  assert.ok(text.indexOf('Audit result') < text.indexOf('Independent audit'))
  assert.match(text, /No obvious anomaly/); assert.match(text, /No capability baseline exists.*8 \/ 16/)
  assert.match(text, /87.5.*\/100/)
  assert.match(text, /1.25k tokens used · Included in statistics/)
  assert.equal(find(panel.tree, node => node.props?.title === '1,250').type, 'p')
  const summary = find(panel.tree, node => node.props?.className === 'dshus-module dshus-audit-summary')
  const details = find(summary, node => node.type === 'details')
  assert.equal(details.props.open, undefined)
  assert.equal(textOf(find(details, node => node.type === 'summary')), 'Audit details')
  const visible = textOf(summary.props.children.filter(node => node?.type !== 'details'))
  assert.doesNotMatch(visible, /Statistical p-value|Finished 10|Valid answers|Channel performance/)
  assert.match(textOf(details), /Valid answers 120 \/ 128.*2.50e-1/s)
  assert.doesNotMatch(text, /undefined|NaN|[\u4e00-\u9fff]/)
  h.render(type, props).flush(); assert.equal(notified, 1)
  current = { key: 'another' }
  panel = h.render(type, props); panel.flush(); await settle()
  panel = h.render(type, props)
  assert.match(textOf(panel.tree), /Previous audit result/)
  assert.match(find(panel.tree, node => node.type === 'h3' && textOf(node) === 'Previous audit result').props.title, /This saved result applies to the model and settings listed below/)
  current = {}
  panel = h.render(type, props); panel.flush(); await settle()
  panel = h.render(type, props)
  assert.equal(requests.at(-1).jobOnly, '1')
  assert.match(textOf(panel.tree), /Previous audit result/)
  assert.equal(find(panel.tree, node => node.type === 'button' && textOf(node) === 'Preview test budget').props.disabled, true)
  assert.equal(notified, 1)
})

test('overview expansion shows six metrics with localized values and empty states', () => {
  const h = harness()
  const overview = { cacheHitRate: 0.75, peakDailyBilled: 1_250_000, peakDay: '2026-10-01', longestTaskMs: 3_725_000, currentStreak: 3, longestStreak: 12,
    recentModel: { model: 'example-model', calls: 42, providers: ['first', 'second'] } }
  const panel = h.render(h.plugin.__components.OverviewDetails, { overview })
  const labels = panel.tree.props.children[0].map(node => textOf(find(node, child => child.type === 'dt')))
  assert.deepEqual(Array.from(labels), ['Cache hit rate', 'Peak daily tokens', 'Longest task', 'Current streak', 'Longest streak', 'Recent favorite model'])
  assert.match(textOf(panel.tree), /75.0%.*1.25M.*1h 2m.*3 days.*12 days.*example-model/s)
  assert.equal(find(panel.tree, node => node.type === 'dd' && /1,250,000/.test(node.props.title)).props.title, '2026-10-01 · 1,250,000 Token')
  assert.match(find(panel.tree, node => node.props?.className === 'dshus-favorite-model').props.title, /42 calls in the last 7 days/)
  assert.doesNotMatch(textOf(panel.tree), /NaN|undefined|[\u4e00-\u9fff]/)
  h.locale.switch('ja')
  assert.match(textOf(h.render(h.plugin.__components.OverviewDetails, { overview }).tree), /キャッシュヒット率/)
  h.locale.switch('zh')
  const empty = h.render(h.plugin.__components.OverviewDetails, { overview: { cacheHitRate: null, longestTaskMs: null, recentModel: null } })
  assert.match(textOf(empty.tree), /当前连续天数 0 天/)
  assert.match(textOf(empty.tree), /最长任务时长 —/)
})
