import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'

const settle = () => new Promise(resolve => setImmediate(resolve))
const interpolate = (text, params) => text.replace(/\{(\w+)\}/g, (match, key) => params && key in params ? String(params[key]) : match)

/**
 * Use the shipped bundle so inline renderer modules and localization are included.
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
    controlsPage: () => render(section.type, { ...section.props, embedded: true }),
    component: (tree, name, predicate = () => true) => find(tree, node => node.type?.name === name && predicate(node)),
  }
}

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

test('statistics labels, switches and notices follow the live application locale', async () => {
 const h=harness();assert.ok(h.plugin.inject.includes('locale'));assert.equal(h.meta.label(),'Usage statistics');
 const page=h.page();page.flush();await settle();assert.match(textOf(page.tree),/Usage statistics.*Usage.*Quota/);
 const element=h.component(h.controlsPage().tree,'ControlsPanel');
 const render=()=>h.render(element.type,element.props);
 render().flush();await settle();assert.match(textOf(render().tree),/Model details and distribution.*Token output speed/);
 assert.ok(find(render().tree,node=>node.props?.['aria-label']==='Model detection'));
 h.locale.switch('ja');assert.ok(h.invalidations()>0);assert.equal(h.meta.label(),'利用状況');assert.match(textOf(render().tree),/モデル別の詳細と分布/);
 h.locale.switch('zh');assert.equal(h.meta.label(),'用量统计');assert.match(textOf(render().tree),/模型明细与分布.*token输出速度/);
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

test('provider refresh isolates all card layouts and keeps concurrent results when responses arrive out of order', async () => {
  const h = harness({ language: 'zh' })
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const { type } = h.component(h.page().tree, 'ProviderQuotasPanel')
  const body = (balance = 10, percent = 40) => ({ ok: true, quotas: [
    { provider: 'deepseek', name: 'DeepSeek', metrics: [{ label: '账户可用余额', kind: 'amount', remaining: balance, currency: 'CNY' }] },
    { provider: 'balance-b', name: 'Balance B', metrics: [{ label: '账户可用余额', kind: 'amount', remaining: 20, total: 30, currency: 'USD' }] },
    { provider: 'window-c', name: 'Window C', metrics: [{ label: '周剩余', kind: 'window', remainingPercent: percent }] },
    { provider: 'empty-d', name: 'Empty D', status: 'unqueried', kind: 'balance', metrics: [] },
  ] })
  const requests = [], pending = new Map()
  const props = { api: { providerQuotas: options => {
    requests.push(options)
    if (!options.fresh) return Promise.resolve(body())
    return new Promise(resolve => pending.set(options.provider, resolve))
  } } }
  const render = () => h.render(type, props)
  const button = (tree, name) => find(tree, node => node.type === 'button' && node.props['aria-label'] === `刷新 ${name} 配额`)
  render().flush(); await settle()
  const deepseek = button(render().tree, 'DeepSeek')
  deepseek.props.onClick()
  deepseek.props.onClick()
  let panel = render()
  assert.equal(button(panel.tree, 'DeepSeek').props.disabled, true)
  for (const name of ['Balance B', 'Window C', 'Empty D']) {
    assert.equal(button(panel.tree, name).props.disabled, false, `${name} remains available during a DeepSeek refresh`)
    assert.ok(!find(button(panel.tree, name), node => node.props?.className === 'dshus-spin'))
  }
  button(panel.tree, 'Window C').props.onClick()
  assert.deepEqual(requests.filter(options => options.fresh).map(options => options.provider), ['deepseek', 'window-c'])
  for (const poll of h.intervals.values()) poll()
  assert.equal(requests.length, 3, 'cached polling waits for manual provider refreshes')
  pending.get('window-c')(body(10, 75)); await settle()
  panel = render()
  assert.equal(button(panel.tree, 'Window C').props.disabled, false)
  assert.equal(button(panel.tree, 'DeepSeek').props.disabled, true)
  pending.get('deepseek')(body(15, 40)); await settle()
  panel = render()
  assert.match(textOf(panel.tree), /¥15\.00/)
  assert.equal(find(panel.tree, node => node.props?.role === 'progressbar').props['aria-valuenow'], 75)
  assert.equal(button(panel.tree, 'DeepSeek').props.disabled, false)
  assert.equal(button(panel.tree, 'Window C').props.disabled, false)
})

test('a failed provider refresh keeps its data and error local while another provider can finish', async () => {
  const h = harness({ language: 'zh' })
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const { type } = h.component(h.page().tree, 'ProviderQuotasPanel')
  const body = remaining => ({ ok: true, quotas: [
    { provider: 'deepseek', name: 'DeepSeek', metrics: [{ label: '账户可用余额', kind: 'amount', remaining: 10, currency: 'CNY' }] },
    { provider: 'balance-b', name: 'Balance B', metrics: [{ label: '账户可用余额', kind: 'amount', remaining, currency: 'USD' }] },
  ] })
  const pending = new Map()
  const props = { api: { providerQuotas: options => !options.fresh ? Promise.resolve(body(20))
    : new Promise((resolve, reject) => pending.set(options.provider, { resolve, reject })) } }
  const render = () => h.render(type, props)
  const button = (tree, name) => find(tree, node => node.type === 'button' && node.props['aria-label'] === `刷新 ${name} 配额`)
  const card = (tree, name) => find(tree, node => node.type === 'div' && node.props?.className === 'dshus-module dshus-balance-module'
    && find(node, child => child.type === 'h3' && textOf(child) === name))
  render().flush(); await settle()
  button(render().tree, 'DeepSeek').props.onClick()
  button(render().tree, 'Balance B').props.onClick()
  pending.get('deepseek').reject(new Error('查询返回 HTTP 503，请检查地址和供应商凭据。')); await settle()
  let panel = render()
  assert.match(textOf(card(panel.tree, 'DeepSeek')), /HTTP 503/)
  assert.match(textOf(card(panel.tree, 'DeepSeek')), /¥10\.00/)
  assert.doesNotMatch(textOf(card(panel.tree, 'Balance B')), /HTTP 503/)
  assert.equal(button(panel.tree, 'DeepSeek').props.disabled, false)
  assert.equal(button(panel.tree, 'Balance B').props.disabled, true)
  pending.get('balance-b').resolve(body(25)); await settle()
  panel = render()
  assert.match(textOf(card(panel.tree, 'Balance B')), /\$25\.00/)
  assert.match(textOf(card(panel.tree, 'DeepSeek')), /HTTP 503/)
  button(panel.tree, 'DeepSeek').props.onClick()
  assert.doesNotMatch(textOf(card(render().tree, 'DeepSeek')), /HTTP 503/)
  pending.get('deepseek').resolve(body(20)); await settle()
  assert.match(textOf(card(render().tree, 'Balance B')), /\$25\.00/)
})

test('a single-card refresh removes providers absent from the current response despite their old cached balances', async () => {
  const h = harness({ language: 'zh' })
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const { type } = h.component(h.page().tree, 'ProviderQuotasPanel')
  const quota = (provider, remaining) => ({ provider, name: provider, metrics: [{ kind: 'amount', label: '余额', remaining, currency: 'CNY' }] })
  const calls = []
  const props = { api: { providerQuotas: async options => {
    calls.push(options)
    return { ok: true, quotas: options.fresh ? [quota('gateway', 25), quota('other', 1)] : [quota('deepseek', 10), quota('gateway', 20), quota('other', 30)] }
  } } }
  const render = () => h.render(type, props)
  render().flush(); await settle()
  const before = render()
  find(before.tree, node => node.type === 'button' && node.props['aria-label'] === '刷新 gateway 配额').props.onClick()
  await settle()
  const after = render()
  assert.ok(!find(after.tree, node => node.type === 'button' && node.props['aria-label'] === '刷新 deepseek 配额'))
  assert.doesNotMatch(textOf(after.tree), /¥10\.00|不存在/)
  assert.match(textOf(after.tree), /¥25\.00/)
  assert.match(textOf(after.tree), /¥30\.00/, 'an unrelated provider retains its newer displayed snapshot')
  assert.equal(calls[1].provider, 'gateway')
})

test('a delayed provider response cannot recreate a card removed by a newer provider list', async () => {
  const h = harness({ language: 'zh' })
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const { type } = h.component(h.page().tree, 'ProviderQuotasPanel')
  const quota = (provider, remaining) => ({ provider, name: provider, metrics: [{ kind: 'amount', label: '余额', remaining, currency: 'CNY' }] })
  const pending = new Map()
  const props = { api: { providerQuotas: options => options.fresh ? new Promise(resolve => pending.set(options.provider, resolve))
    : Promise.resolve({ ok: true, quotas: [quota('deepseek', 10), quota('gateway', 20)] }) } }
  const render = () => h.render(type, props)
  const button = (tree, name) => find(tree, node => node.type === 'button' && node.props['aria-label'] === `刷新 ${name} 配额`)
  render().flush(); await settle()
  button(render().tree, 'deepseek').props.onClick()
  button(render().tree, 'gateway').props.onClick()
  pending.get('gateway')({ ok: true, quotas: [quota('gateway', 25)] }); await settle()
  assert.ok(!button(render().tree, 'deepseek'))
  pending.get('deepseek')({ ok: true, quotas: [quota('deepseek', 999), quota('gateway', 20)] }); await settle()
  assert.ok(!button(render().tree, 'deepseek'))
  assert.match(textOf(render().tree), /¥25\.00/)
  assert.doesNotMatch(textOf(render().tree), /¥999\.00/)
})

test('refresh-all and inactive quota pages discard pending single-provider responses and reset their buttons', async () => {
  const h = harness({ language: 'zh' })
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const { type } = h.component(h.page().tree, 'ProviderQuotasPanel')
  const body = balance => ({ ok: true, quotas: ['deepseek', 'balance-b'].map(provider => ({ provider, name: provider,
    metrics: [{ label: '账户可用余额', kind: 'amount', remaining: balance, currency: 'CNY' }] })) })
  const pending = []
  const props = { active: true, api: { providerQuotas: options => options.fresh ? new Promise(resolve => pending.push(resolve)) : Promise.resolve(body(10)) } }
  let current = props
  const render = () => h.render(type, current)
  const button = (tree, name) => find(tree, node => node.type === 'button' && node.props['aria-label'] === `刷新 ${name} 配额`)
  render().flush(); await settle()
  button(render().tree, 'deepseek').props.onClick()
  current = { ...props, refreshing: true }
  render().flush()
  let panel = render()
  assert.equal(button(panel.tree, 'deepseek').props.disabled, true)
  assert.equal(button(panel.tree, 'balance-b').props.disabled, true)
  const snapshot = body(30)
  current = { ...props, snapshot, refreshing: false }
  render().flush()
  pending[0](body(1)); await settle()
  panel = render()
  assert.doesNotMatch(textOf(panel.tree), /¥1\.00/)
  assert.match(textOf(panel.tree), /¥30\.00/)
  assert.equal(button(panel.tree, 'deepseek').props.disabled, false)
  button(panel.tree, 'deepseek').props.onClick()
  current = { ...current, active: false }
  render().flush()
  pending[1](body(2)); await settle()
  assert.doesNotMatch(textOf(render().tree), /¥2\.00/)
  assert.equal(button(render().tree, 'deepseek').props.disabled, false)
  current = { ...current, active: true }
  render().flush(); await settle()
  assert.equal(button(render().tree, 'deepseek').props.disabled, false)
})

test('quota tabs retain component identity and refresh-all feeds snapshots without duplicate reads', async () => {
  const requests = [], deferred = []
  const quota = remaining => ({ ok: true, quotas: [{ provider: 'deepseek', name: 'DeepSeek', metrics: [{ kind: 'amount', label: '账户可用余额', remaining, currency: 'CNY' }] }] })
  let credits = 100
  const accountView = () => ({ ok: true, channels: [{ id: 'buddy', kind: 'account', enabled: true, supportsQuota: true }, { id: 'workbuddy', kind: 'account', enabled: true, supportsQuota: true }],
    accounts: [{ id: 'cn', channelId: 'buddy', enabled: true, version: 1 }, { id: 'intl', channelId: 'workbuddy', enabled: true, version: 1 }],
    quotas: [{ channelId: 'buddy', accountId: 'cn', remaining: credits }, { channelId: 'workbuddy', accountId: 'intl', remaining: 150 }] })
  const h = harness({ fetch: async (url, options) => {
    requests.push(url)
    if (url.includes('fresh=1') || options?.method === 'POST') return new Promise((resolve, reject) => deferred.push({ url, accountId: options?.body && JSON.parse(options.body).accountId, resolve: body => resolve({ ok: true, json: async () => body }), reject }))
    return { ok: true, json: async () => url.includes('/provider-quotas') ? quota(10) : url.includes('/account-quotas') ? accountView() : url.includes('/controls')
      ? { ok: true, settings: { autoQuota: false, intervalMinutes: 60, showModelDetails: true, customQueries: [] } }
      : { ok: true, totals: null, byDay: [], byModel: [], byHour: [] } }
  } })
  assert.equal(h.component(h.page().tree, 'ProviderQuotasPanel'), undefined, 'quota polling starts only when the tab is first opened')
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  let page = h.page().tree
  const provider = h.component(page, 'ProviderQuotasPanel'), accounts = h.component(page, 'AccountQuotasPanel')
  h.render(provider.type, provider.props).flush()
  h.render(accounts.type, accounts.props).flush()
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
  await settle()
  assert.equal(deferred.length, 3)
  page = h.page().tree
  assert.match(textOf(h.render(provider.type, h.component(page, 'ProviderQuotasPanel').props).tree), /¥10.00/)
  for (const request of deferred) {
    if (request.url.includes('/provider-quotas')) request.resolve(quota(20))
    else if (request.accountId === 'intl') request.reject(new Error('offline'))
    else { credits = 200; request.resolve({ ok: true, results: [{ channelId: 'buddy', accountId: 'cn', remaining: credits }] }) }
  }
  await settle()
  page = h.page().tree
  assert.match(textOf(page), /Some quotas could not be updated/)
  const updatedProvider = h.component(page, 'ProviderQuotasPanel')
  h.render(updatedProvider.type, updatedProvider.props).flush()
  assert.match(textOf(h.render(updatedProvider.type, updatedProvider.props).tree), /¥20.00/)
  const updatedAccounts = h.component(page, 'AccountQuotasPanel')
  h.render(updatedAccounts.type, updatedAccounts.props).flush()
  const list = h.component(h.render(updatedAccounts.type, updatedAccounts.props).tree, 'AccountQuotaList')
  assert.equal(list.props.data.quotas.find(row => row.accountId === 'cn').remaining, 200)
  assert.equal(list.props.data.quotas.find(row => row.accountId === 'intl').remaining, 150)
  assert.equal(list.props.data.quotas.find(row => row.accountId === 'intl').stale, true)
  assert.equal(requests.filter(url => url.includes('/account-quotas/refresh')).length, 2)
  assert.equal(requests.filter(url => url.includes('/provider-quotas') && !url.includes('fresh=1')).length, 1)
})

test('DeepSeek precedes enabled account channels while disabled accounts and duplicate windows stay hidden', async () => {
  const h = harness()
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const providers = h.component(h.page().tree, 'ProviderQuotasPanel')
  const props = { ...providers.props, api: { providerQuotas: async () => ({ ok: true, quotas: [
    { provider: 'other', name: 'Other balance', metrics: [{ label: 'Balance', kind: 'amount', remaining: 10 }] },
    { provider: 'deepseek', name: 'DeepSeek', metrics: [{ label: '周剩余', kind: 'window', remainingPercent: 80 }] },
  ] }) } }
  h.render(providers.type, props).flush(); await settle()
  const providerTree = h.render(providers.type, props).tree
  assert.equal(textOf(find(providerTree.props.children[1], node => node.type === 'h3')), 'DeepSeek')
  assert.equal(h.component(providerTree.props.children[2], 'AccountQuotasPanel').props.key, 'accounts')
  assert.equal(textOf(find(providerTree.props.children[3], node => node.type === 'h3')), 'Other balance')
  const accounts = h.component(providerTree, 'AccountQuotasPanel')
  const data = { ok: true, channels: [
    { id: 'loomy', kind: 'account', enabled: true }, { id: 'buddy', kind: 'account', enabled: true, supportsQuota: true },
    { id: 'codearts', kind: 'account', enabled: true, supportsQuota: true }, { id: 'workbuddy', kind: 'account', enabled: false },
  ], accounts: [
    { id: 'zero', channelId: 'buddy' }, { id: 'disabled', channelId: 'buddy', enabled: false },
    { id: 'unknown', channelId: 'codearts' }, { id: 'hidden-channel', channelId: 'workbuddy' },
  ], quotas: [
    { channelId: 'buddy', accountId: 'zero', remaining: 0, unit: 'credits' },
    { channelId: 'codearts', accountId: 'unknown', remaining: null, kinds: [{ id: 'copy', bucketId: 'shared', remaining: 20 }], windows: [{ id: 'window', bucketId: 'shared', remainingPercent: 42 }] },
  ] }
  const accountProps = { ...accounts.props, api: { accountQuotas: async () => data } }
  h.render(accounts.type, accountProps).flush(); await settle()
  const list = h.component(h.render(accounts.type, accountProps).tree, 'AccountQuotaList')
  const sections = h.render(list.type, list.props).tree.props.children[0]
  assert.deepEqual(Array.from(sections, section => section.props['data-quota-channel']), ['codearts', 'buddy', 'loomy'])
  const unknown = h.component(sections[0], 'QuotaAccount'), zero = h.component(sections[1], 'QuotaAccount')
  assert.match(textOf(h.render(unknown.type, unknown.props, 'unknown').tree), /Unknown.*42% remaining/s)
  assert.doesNotMatch(textOf(h.render(unknown.type, unknown.props, 'unknown').tree), /20/)
  assert.match(textOf(h.render(zero.type, zero.props, 'zero').tree), /0 credits/)
  assert.match(textOf(sections[2]), /Signed out/)
  assert.doesNotMatch(textOf(sections), /disabled|hidden-channel/)
})

test('quota refresh queries only enabled accounts and discards failures from a changed account version', async () => {
  const posts = []
  let version = 1, fail = false, changeVersion = false
  const view = () => ({ ok: true, channels: [
    { id: 'buddy', kind: 'account', enabled: true, supportsQuota: true },
    { id: 'workbuddy', kind: 'account', enabled: false, supportsQuota: true },
    { id: 'gemini', kind: 'account', enabled: true, supportsQuota: false },
  ], accounts: [
    { id: 'main', channelId: 'buddy', version, credentialVersion: version }, { id: 'off', channelId: 'buddy', enabled: false },
    { id: 'hidden', channelId: 'workbuddy' }, { id: 'no-api', channelId: 'gemini' },
  ], quotas: [{ channelId: 'buddy', accountId: 'main', remaining: fail ? null : 700, error: fail ? { message: 'offline' } : null }] })
  const h = harness({ fetch: async (url, opts) => {
    if (opts?.method === 'POST') {
      posts.push(JSON.parse(opts.body))
      if (changeVersion) version++
      return { ok: true, json: async () => ({ ok: true, results: [{ channelId: 'buddy', accountId: 'main', error: { message: 'offline' } }] }) }
    }
    return { ok: true, json: async () => url.includes('/account-quotas') ? view() : {} }
  } })
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const api = h.component(h.page().tree, 'AccountQuotasPanel').props.api
  await api.accountQuotas({ fresh: false })
  assert.equal(posts.length, 0, 'opening the quota page reads the host cache only')
  fail = true
  let snapshot = await api.accountQuotas({ fresh: true })
  assert.deepEqual(posts, [{ channelId: 'buddy', accountId: 'main' }])
  assert.equal(snapshot.quotas[0].remaining, 700)
  assert.equal(snapshot.quotas[0].stale, true)
  snapshot = await api.accountQuotas({ fresh: false })
  assert.equal(snapshot.quotas[0].remaining, 700, 'passive polling retains the diagnosed last successful reading')
  changeVersion = true
  snapshot = await api.accountQuotas({ fresh: true })
  assert.equal(snapshot.refreshErrors.length, 0, 'a failure from the old account generation cannot attach to the replacement')
  assert.equal(snapshot.quotas[0].remaining, null, 'the previous account generation balance cannot be retained')
  assert.equal(snapshot.quotas[0].stale, undefined)
})

test('build uses the scoped package identity and version in the installed client', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-version-test-'))
  try {
    mkdirSync(join(directory, 'scripts'))
    cpSync(new URL('../src', import.meta.url), join(directory, 'src'), { recursive: true })
    cpSync(new URL('../scripts/build.mjs', import.meta.url), join(directory, 'scripts/build.mjs'))
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: '@fixture/usage-stats', version: '9.8.7-test', type: 'module' }))
    execFileSync(process.execPath, [join(directory, 'scripts/build.mjs')], { stdio: 'pipe' })
    const built = readFileSync(join(directory, 'lib/client.js'), 'utf8')
    assert.equal(existsSync(join(directory, 'client.js')), false, 'only lib/ contains build output')
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

test('account quotas retain credits and expanded details when a query fails', async () => {
  const h = harness()
  find(h.page().tree, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  const element = h.component(h.page().tree, 'AccountQuotasPanel')
  const connected = { ok: true, channels: [{ id: 'buddy', kind: 'account', enabled: true, supportsQuota: true }],
    accounts: [{ id: 'cn', displayName: 'Main account', channelId: 'buddy' }],
    quotas: [{ channelId: 'buddy', accountId: 'cn', remaining: 800, unit: 'credit', kinds: [
      { id: 'a', label: 'Plan A', total: 300, remaining: 200 },
      { id: 'b', label: 'Plan B', total: 300, remaining: 300 },
      { id: 'c', label: 'Plan C', total: 300, remaining: 300 },
      { id: 'd', label: 'Plan D', remaining: 0 },
    ] }] }
  const props = { api: { accountQuotas: async ({ fresh }) => fresh ? { ok: false, error: '操作失败，请稍后重试。' } : connected } }
  let panel = h.render(element.type, props)
  panel.flush(); await settle()
  panel = h.render(element.type, props)
  const list = h.component(panel.tree, 'AccountQuotaList')
  const account = h.component(h.render(list.type, list.props).tree, 'QuotaAccount')
  let row = h.render(account.type, account.props)
  find(row.tree, node => node.type === 'button' && textOf(node) === 'Show 1 more quota details').props.onClick()
  row = h.render(account.type, account.props)
  assert.match(textOf(row.tree), /Plan D/)
  find(row.tree, node => node.props?.['aria-label'] === 'Refresh Main account quota').props.onClick()
  await settle()
  panel = h.render(element.type, props)
  assert.match(textOf(panel.tree), /The operation failed/)
  const nextList = h.component(panel.tree, 'AccountQuotaList')
  const nextAccount = h.component(h.render(nextList.type, nextList.props).tree, 'QuotaAccount')
  row = h.render(nextAccount.type, nextAccount.props)
  assert.match(textOf(row.tree), /800 credits.*Plan D.*0.*Collapse quota details/s)
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

test('usage numbers use k, M and B units in every language', () => {
  const h = harness()
  const render = billed => textOf(h.render(h.plugin.__components.OverviewDetails, { overview: { peakDailyBilled: billed, peakDay: '2026-10-01' } }).tree)
  for (const language of ['en', 'zh', 'ja']) {
    h.locale.switch(language)
    assert.match(render(1_250_000_000), /1\.25B/, language)
    assert.match(render(427_680_000), /427\.68M/, language)
    assert.match(render(12_500), /12\.5k/, language)
    assert.doesNotMatch(render(427_680_000), /[亿万]|億/, language)
  }
})
