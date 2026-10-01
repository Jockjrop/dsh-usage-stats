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

function harness({ language = 'en', fetch: customFetch, code = source } = {}) {
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
    get: name => name === 'locale' ? locale : name === 'slots' ? {
      inject: (_name, callback) => callback(),
      register(options, render) { meta = options; section = render({}); return () => {} },
    } : undefined,
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
