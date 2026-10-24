import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import vm from 'node:vm'
import { renderClient } from '../scripts/build.mjs'

const desktopBridge = { protocolVersion: 1, deviceInfo() {} }
const fallbackTranslation = (text, params) => text.replace(/\{(\w+)\}/g, (match, key) => params && key in params ? String(params[key]) : match)

/**
 * Exercise the shipped renderer with the production build script.
 */
const bundle = (() => {
  const fixture = mkdtempSync(join(tmpdir(), 'dshus-client-bundle-'))
  try {
    cpSync(new URL('../src', import.meta.url), join(fixture, 'src'), { recursive: true })
    cpSync(new URL('../package.json', import.meta.url), join(fixture, 'package.json'))
    mkdirSync(join(fixture, 'scripts'))
    cpSync(new URL('../scripts/build.mjs', import.meta.url), join(fixture, 'scripts', 'build.mjs'))
    execFileSync(process.execPath, [join(fixture, 'scripts', 'build.mjs')], { cwd: fixture, stdio: 'pipe' })
    return readFileSync(join(fixture, 'lib', 'client.js'), 'utf8')
  } finally {
    const resolvedFixture = resolve(fixture)
    assert.equal(dirname(resolvedFixture), resolve(tmpdir()))
    assert.ok(basename(resolvedFixture).startsWith('dshus-client-bundle-'))
    rmSync(resolvedFixture, { recursive: true, force: true })
  }
})()

function walk(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = walk(child, predicate)
      if (found) return found
    }
    return null
  }
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  return walk(node.props && node.props.children, predicate)
}

function walkAll(node, predicate, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) walkAll(child, predicate, found)
  } else if (node && typeof node === 'object') {
    if (predicate(node)) found.push(node)
    walkAll(node.props && node.props.children, predicate, found)
  }
  return found
}

function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return node && node.props ? textOf(node.props.children) : ''
}

test('statistics tabs restore the host scrollport without changing content width', () => {
  let plugin, section, hooks, hookIndex = 0, effects = []
  const stores = new Map(), documentEvents = new Map(), windowEvents = new Map()
  const port = { parentElement: null, style: { scrollbarGutter: 'auto' }, scrollTop: 275, getBoundingClientRect: () => ({ top: 0, bottom: 420 }) }
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } } },
    useState(initial) { const index = hookIndex++, current = hooks; if (!(index in current)) current[index] = initial; return [current[index], value => { current[index] = typeof value === 'function' ? value(current[index]) : value }] },
    useRef(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index] },
    useEffect(callback) { effects.push(callback) },
  }
  vm.runInNewContext(bundle, {
    window: {
      dshDesktop: desktopBridge,
      innerHeight: 420, localStorage: { getItem: () => null },
      getComputedStyle: node => ({ overflowY: node === port ? 'auto' : 'visible' }),
      __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } },
      addEventListener: (name, callback) => windowEvents.set(name, callback),
      removeEventListener: name => windowEvents.delete(name),
    },
    document: {
      getElementById: () => null, createElement: () => ({}), head: { appendChild() {} },
      addEventListener: (name, callback) => documentEvents.set(name, callback),
      removeEventListener: name => documentEvents.delete(name),
    }, console, URLSearchParams,
  })
  plugin.apply({ get: () => ({ inject: (_name, callback) => callback(), register: (_meta, render) => { section = render({}); return () => {} } }), effect: callback => callback() })
  const render = (type, props) => { hooks = stores.get(type) || []; stores.set(type, hooks); hookIndex = 0; effects = []; return type(props) }
  let page = render(section.type, section.props)
  page.props.ref.current = { parentElement: { parentElement: port } }
  const restoreScrollport = effects[2]()
  assert.equal(port.style.scrollbarGutter, 'stable', 'short tabs keep the same content width as long tabs')
  walk(page, node => node.props?.id === 'dshus-tab-quota').props.onClick()
  assert.equal(port.scrollTop, 0, 'switching away from a long tab resets its old scroll offset')
  restoreScrollport()
})

/**
 * Remove comments while preserving string-literal contents, so the token scan
 * below sees real style declarations only. Documentation legitimately names
 * tokens the client must NOT reference (e.g. the host-only
 * `--dsw-alias-menu-group-header-fill`, which the installed theme does not
 * declare); scanning raw prose would flag those warnings as usage.
 */
function stripJsComments(text) {
  let out = ''
  let i = 0
  let quote = null
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    if (quote) {
      out += ch
      if (ch === '\\') { out += next === undefined ? '' : next; i += 2; continue }
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i++; continue }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
      out += ' '
      continue
    }
    if (ch === '/' && next === '/') {
      const end = text.indexOf('\n', i)
      i = end < 0 ? text.length : end
      out += ' '
      continue
    }
    out += ch
    i++
  }
  return out
}

test('every theme alias used by the client exists in the DSH theme', () => {
  const source = renderClient()
  const code = stripJsComments(source)
  const used = [...new Set(code.match(/--dsw-alias-[a-zA-Z0-9-]+/g) || [])]
  assert.ok(used.length > 0, 'client must style through theme aliases')

  const contract = JSON.parse(readFileSync(new URL('./fixtures/theme-aliases.json', import.meta.url), 'utf8'))
  // The checked-in contract makes this assertion run on every machine. An
  // explicit override can also verify a different installed DSH theme.
  const declared = new Set(process.env.DSH_THEME_CLIENT
    ? readFileSync(process.env.DSH_THEME_CLIENT, 'utf8').match(/--dsw-alias-[a-zA-Z0-9-]+/g) || []
    : contract.aliases)
  const unknown = used.filter((token) => !declared.has(token))
  assert.deepEqual(unknown, [], 'theme aliases missing from the DSH theme: ' + unknown.join(', '))

  // These two names were the actual defect: a shorthand that the theme never defines.
  for (const token of used) {
    assert.doesNotMatch(token, /^--dsw-alias-bg-l\d+$/, 'use --dsw-alias-bg-layer-N, not ' + token)
  }
})

test('switch on and off states stay distinguishable in either theme', () => {
  const source = renderClient()
  // Match a rule whose selector list contains the given selector, then return its body.
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = source.match(new RegExp(escaped + '[^{}]*\\{([^}]*)\\}'))
    assert.ok(m, 'missing rule for ' + selector)
    return m[1]
  }
  const value = (text, property) => {
    const m = text.match(new RegExp('(?:^|;)\\s*' + property + '\\s*:\\s*([^;]+)'))
    return m ? m[1].trim() : ''
  }

  // Neither track state may depend on a token that is near-white in the dark theme:
  // brand-primary resolved to #f9fafb there and made "on" look like "off".
  const onTrack = value(rule('.dshus-switch.on'), 'background')
  assert.doesNotMatch(onTrack, /--dsw-alias-brand-primary/)
  assert.match(onTrack, /var\(--dshus-switch-on,\s*#[0-9a-f]{3,8}\)/i)

  // Both states need their own literal so they cannot collapse into each other.
  const offTrack = value(rule('.dshus-switch'), 'background')
  assert.match(offTrack, /var\(--dshus-switch-off,\s*#[0-9a-f]{3,8}\)/i)

  // The knob must be an explicit near-white, not label-primary-inverted, which is a
  // dark value in the dark theme and would vanish against the off track.
  const knob = value(rule('.dshus-switch::after'), 'background')
  assert.doesNotMatch(knob, /--dsw-alias-label-primary-inverted/)
  assert.match(knob, /var\(--dshus-switch-knob,\s*#[0-9a-f]{3,8}\)/i)

  // The knob must translate exactly to the free space inside the track, never overflow.
  const geometry = rule('.dshus-switch')
  const width = Number(value(geometry, 'width').replace('px', ''))
  const border = Number((geometry.match(/border:\s*(\d+)px/) || [])[1] || 0)
  const knobSize = Number(value(rule('.dshus-switch::after'), 'width').replace('px', ''))
  const travel = Number(value(rule('.dshus-switch.on::after'), 'transform').match(/translateX\((\d+)px\)/)[1])
  assert.equal(travel, width - 2 * border - knobSize - 2 * 2, 'knob travel must match the track')
})

test('the page title and tabs stay pinned while the panels scroll', () => {
  const source = renderClient()
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = source.match(new RegExp(escaped + '[^{}]*\\{([^}]*)\\}'))
    assert.ok(m, 'missing rule for ' + selector)
    return m[1]
  }
  const toolbar = rule('.dshus-toolbar')
  assert.match(toolbar, /position:\s*sticky/, 'title and tabs pin as one toolbar')
  assert.match(toolbar, /top:\s*0/, 'the toolbar pins to the scrollport top')
  assert.match(toolbar, /background:\s*var\(--dsw-alias-bg-layer-2/, 'the toolbar must be opaque')
  assert.doesNotMatch(rule('.dshus-head'), /position:\s*sticky/, 'the title must not pin independently')
  assert.doesNotMatch(rule('.dshus-tabs'), /top:|position:\s*sticky/, 'tabs must not use a guessed title height')
  // `container-type` creates a containment context that can defeat sticky, so the
  // size container must wrap the panels, never the sticky header above them.
  assert.doesNotMatch(rule('.dshus-page'), /container-type/, 'the page root must not be a size container')
  assert.match(rule('.dshus-panels'), /container-type:\s*inline-size/, 'the panels wrapper carries the size container')
  // Container queries must survive: the responsive rules key off the panels
  // wrapper, so at least one query must exist and the original card rules
  // must still be inside one.
  const containerQueries = source.match(/@container[^{]*\{[^}]*\}/g) || []
  assert.ok(containerQueries.length >= 4, 'responsive container queries must survive')
  assert.ok(containerQueries.some((q) => q.includes('.dshus-card')), 'the card query must survive')
})

test('usage settings row uses a chart glyph when the host sidebar mounts', () => {
  let plugin
  let style
  let notifyMutation
  let observed = false
  let disconnected = false
  const cleanups = []
  const row = (label) => ({
    label,
    attributes: {},
    querySelector: () => ({ textContent: label }),
    setAttribute(name, value) { this.attributes[name] = value },
  })
  const usageRow = row('用量统计')
  const otherRow = row('通用设置')
  let visibleRows = []
  const context = {
    window: { dshDesktop: desktopBridge, __ModuleLoader__: { load(definition) { plugin = definition.factory(() => ({})) } } },
    document: {
      getElementById: () => null,
      createElement: () => (style = {}),
      head: { appendChild() {} },
      body: {},
      querySelectorAll: (selector) => {
        assert.equal(selector, '[data-shortcut-modal="settings"] nav button')
        return visibleRows
      },
    },
    MutationObserver: class {
      constructor(callback) { notifyMutation = callback }
      observe(_root, options) { observed = options.childList && options.subtree }
      disconnect() { disconnected = true }
    },
    console,
  }
  vm.runInNewContext(bundle, context)
  plugin.apply({
    get: () => ({ inject: () => () => {} }),
    // Only the sidebar-icon effect is under test here; with the bundled
    // factory the reasoning-visibility and seat effects run before it.
    effect(callback, label) { if (label === 'dsh-usage-stats: sidebar icon') cleanups.push(callback()) },
  })
  assert.equal(observed, true)
  assert.match(style.textContent, /\[data-dshus-nav-icon\]::before/)
  assert.match(style.textContent, /M2\.5%2013\.5h11/)
  visibleRows = [otherRow, usageRow]
  notifyMutation()
  assert.equal(usageRow.attributes['data-dshus-nav-icon'], '')
  assert.equal(otherRow.attributes['data-dshus-nav-icon'], undefined)
  cleanups[0]()
  assert.equal(disconnected, true)
})

test('usage page keeps chart controls independent and shows only connected panels', async () => {
  let plugin
  let section
  let hookValues = []
  let hookIndex = 0
  let effects = []
  const requests = []
  // Keep calendar and pager assertions stable across week/month boundaries.
  const now = Date.parse('2026-10-03T12:00:00Z')
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])) }
    static now() { return now }
  }
  const tz = new FixtureDate().getTimezoneOffset()
  const today = new Date(now - tz * 60000).toISOString().slice(0, 10)
  const olderDay = new Date(now - tz * 60000 - 200 * 86400000).toISOString().slice(0, 10)
  const olderOrdinal = Date.parse(olderDay + 'T00:00:00Z') / 86400000
  const olderWeekMate = new Date((olderOrdinal + (new Date(olderOrdinal * 86400000).getUTCDay() === 1 ? 1 : -1)) * 86400000).toISOString().slice(0, 10)
  const statsBody = {
    ok: true, stale: false, tz, days: 0,
    totals: { billed: 140 },
    overview: { todayBilled: 30, usedDays: 12, totalBilled: 427684351,
      totals: { inputTokens: 427684321, outputTokens: 30, calls: 3 }, models: [
      { key: 'a/model-one', provider: 'a', model: 'model-one', billed: 800 },
      { key: 'b/model-one', provider: 'b', model: 'model-one', billed: 500 },
      { key: 'c/model-two', provider: 'c', model: 'model-two', billed: 300 },
    ] },
    byDay: [
      { date: olderDay, billed: 19134, calls: 5 },
      { date: olderWeekMate, billed: 100, calls: 2 },
      { date: today, billed: 30, calls: 3 },
    ],
    byDayModels: [
      { date: olderDay, models: [
        { key: 'a/model-one', provider: 'a', model: 'model-one', billed: 12345, calls: 3 },
        { key: 'c/model-two', provider: 'c', model: 'model-two', billed: 6789, calls: 2 },
      ] },
      { date: olderWeekMate, models: [{ key: 'a/model-one', provider: 'a', model: 'model-one', billed: 100, calls: 2 }] },
      { date: today, models: [
        { key: 'a/model-one', provider: 'a', model: 'model-one', billed: 20, calls: 2 },
        { key: 'b/model-one', provider: 'b', model: 'model-one', billed: 10, calls: 1 },
      ] },
    ],
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, calls: hour === 9 ? 3 : 0, billed: hour === 9 ? 30 : 0 })),
    byHourModels: Array.from({ length: 24 }, (_, hour) => ({ hour, models: hour === 9 ? [
      { key: 'a/model-one', provider: 'a', model: 'model-one', billed: 20 },
      { key: 'b/model-one', provider: 'b', model: 'model-one', billed: 10 },
    ] : [] })),
    byModel: [
      { key: 'a/model-one', provider: 'a', model: 'model-one', billed: 80, lastTime: 1 },
      { key: 'b/model-one', provider: 'b', model: 'model-one', billed: 40, lastTime: 2 },
      { key: 'c/model-two', provider: 'c', model: 'model-two', billed: 20, lastTime: 3 },
    ],
  }
  let injectedStyle
  let delayNext = false
  let failNext = false
  let releaseRequest
  let legacyDayResponses = null
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } } },
    useState(initial) {
      const index = hookIndex++
      if (!(index in hookValues)) hookValues[index] = initial
      return [hookValues[index], (value) => { hookValues[index] = typeof value === 'function' ? value(hookValues[index]) : value }]
    },
    useRef(initial) {
      const index = hookIndex++
      if (!(index in hookValues)) hookValues[index] = { current: initial }
      return hookValues[index]
    },
    useEffect(callback) { effects.push(callback) },
  }
  const context = {
    Date: FixtureDate,
    window: {
      dshDesktop: desktopBridge,
      innerWidth: 1200,
      innerHeight: 800,
      localStorage: { getItem: () => null, setItem() {} },
      __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } },
    },
    document: {
      getElementById: () => null,
      createElement: () => { injectedStyle = {}; return injectedStyle },
      head: { appendChild() {} },
    },
    console,
    URLSearchParams,
    fetch: (url) => {
      requests.push(url)
      if (url.endsWith('/controls')) return Promise.resolve({ ok: true, json: async () => ({ ok: true, settings: { showModelDetails: true, showTokenSpeed: true, showModelDetection: true, advancedModelSelect: false, modelReasoning: false, customQueries: [] } }) })
      if (failNext) {
        failNext = false
        return Promise.reject(new Error('network unavailable'))
      }
      if (delayNext) {
        delayNext = false
        return new Promise((resolve) => { releaseRequest = () => resolve({ ok: true, json: async () => ({ ...statsBody, days: 7 }) }) })
      }
      const requestedDays = Number(new URL(url, 'http://localhost').searchParams.get('days'))
      if (legacyDayResponses && legacyDayResponses.has(requestedDays)) {
        return Promise.resolve({ ok: true, json: async () => legacyDayResponses.get(requestedDays) })
      }
      return Promise.resolve({ ok: true, json: async () => statsBody })
    },
  }
  vm.runInNewContext(bundle, context, { filename: 'client.js' })
  plugin.apply({
    get: (name) => name === 'slots' ? {
      inject: (_name, callback) => callback(),
      register: (_meta, render) => { section = render({ intl: true }); return () => {} },
    } : undefined,
    effect: (callback) => callback(),
  })

  function render(component, props) {
    hookIndex = 0
    effects = []
    return component(props)
  }
  let page = render(section.type, section.props)
  assert.match(textOf(page), /今日Token用量/)
  assert.doesNotMatch(textOf(page), /最后同步|统计范围|北京时间|一、|二、|三、|四、/)
  assert.equal(walk(page, (node) => node.type === 'h3' && textOf(node).includes('模型明细与分布')), null, 'model details start hidden until saved preferences load')
  effects[0]()
  effects[1]()
  await new Promise((resolve) => setImmediate(resolve))
  const firstStatsRequest = requests.find((url) => url.includes('/stats'))
  assert.equal(new URL(firstStatsRequest, 'http://localhost').searchParams.get('tz'), String(tz))
  assert.equal(new URL(firstStatsRequest, 'http://localhost').searchParams.get('days'), null) // API default is all history
  page = render(section.type, section.props)
  const topHeader = walk(page, (node) => node.props && node.props.className === 'dshus-head')
  assert.equal(walkAll(topHeader, (node) => node.type === 'button' && ['7天', '30天', '1年', '全部'].includes(textOf(node))).length, 0)
  const usageRefresh = walk(topHeader, (node) => node.type === 'button' && node.props?.['aria-label'] === '刷新用量统计')
  assert.ok(usageRefresh)
  assert.equal(walk(usageRefresh, (node) => node.type === 'svg')?.type, 'svg')
  const initialTabs = walkAll(page, (node) => node.props && node.props.role === 'tab')
  assert.deepEqual(initialTabs.map(textOf), ['用量', '配额', '检测', '控制'])
  assert.equal(initialTabs[0].props['aria-selected'], true)
  assert.equal(initialTabs[1].props['aria-selected'], false)
  assert.equal(walk(page, (node) => node.props && node.props.id === 'dshus-quota-panel'), null)
  assert.match(textOf(page), /使用量热力图/)
  const overviewCards = walk(page, (node) => node.props && node.props.className === 'dshus-statbar dshus-overview-bar')
  // Each metric is its own inline column, so the divider rule can sit between
  // neighbours without wrapping any of them in a separate card.
  const overviewStats = walkAll(overviewCards, (node) => node.props?.className === 'dshus-stat')
  assert.equal(overviewStats.length, 3)
  assert.deepEqual(overviewStats.map((node) => textOf(walk(node, (c) => c.props?.className === 'k'))),
    ['今日tokens数', '使用天数', '累计tokens数'])
  assert.match(textOf(overviewCards), /30 今日tokens数.*12 使用天数.*427\.68M 累计tokens数/s)
  assert.doesNotMatch(textOf(overviewCards), /最常使用模型/)
  const overviewDetails = walk(page, (node) => node.props?.id === 'dshus-overview-details')
  assert.equal(overviewDetails.props.hidden, true)
  const toggleOverview = () => walk(page, (node) => node.props?.['aria-controls'] === 'dshus-overview-details')
  assert.equal(toggleOverview().props['aria-expanded'], false)
  toggleOverview().props.onClick()
  page = render(section.type, section.props)
  assert.equal(walk(page, (node) => node.props?.id === 'dshus-overview-details').props.hidden, false)
  assert.equal(toggleOverview().props['aria-expanded'], true)
  assert.equal(walk(page, node => node.props?.id === 'dshus-token-details'), null)
  assert.doesNotMatch(textOf(page), /Token 分项/)
  assert.ok(walk(page, node => node.type?.name === 'OverviewDetails'))
  toggleOverview().props.onClick()
  page = render(section.type, section.props)
  assert.equal(walk(page, (node) => node.props?.id === 'dshus-overview-details').props.hidden, true)
  assert.ok(walk(page, (node) => node.props?.className === 'dshus-statbar dshus-overview-bar'))
  assert.equal(walk(page, (node) => node.type?.name === 'SessionDetailsPanel'), null)
  // The overview is no longer a grid of small cards.
  assert.equal(walk(page, (node) => node.props && node.props.className === 'dshus-cards'), null)
  const modules = walkAll(page, (node) => node.props && node.props.className === 'dshus-module')
  // The heatmap header carries the pager (range label + arrows) and the mode
  // switch; the old 累计总量 caption is gone. An empty range label collapses to
  // nothing, hence the collapsed double space before 每日.
  assert.deepEqual(modules.slice(0, 4).map((node) => textOf(walk(node, (child) => child.type === 'h3')).replace(/\s+/g, ' ').trim()), ['概览指标', '今日Token用量 供应商·模型 按模型', '使用量热力图 每日 每周', '每日Token趋势图 7天 30天'])
  assert.doesNotMatch(textOf(walk(modules[2], (node) => node.type === 'h3')), /累计总量/)
  // The heading check alone cannot see the heatmap body: Heatmap is a component
  // element here, so its output is asserted on the rendered subtree below.
  assert.match(injectedStyle.textContent, /\.dshus-bars \{ width: 100%;/)
  assert.match(injectedStyle.textContent, /\.dshus-hour \{ flex: 1 1 0; min-width: 0;/)
  assert.doesNotMatch(injectedStyle.textContent, /\.dshus-bars \{[^}]*overflow-x: auto/)
  const chartMode = walk(page, (node) => node.props && node.props['aria-label'] === '今日Token用量统计模式')
  const detailTitle = walk(page, (node) => node.type === 'h3' && textOf(node).includes('模型明细与分布'))
  const detailButtons = walkAll(detailTitle, (node) => node.type === 'button')
  assert.equal(detailButtons.length, 2)
  detailButtons[0].props.onClick() // supplier/model detail mode
  page = render(section.type, section.props)
  let chartProps = walk(page, (node) => node.type && node.type.name === 'Bars').props
  assert.equal(chartProps.hourModels[9].models.length, 1) // chart remains grouped
  const chartButtons = walkAll(chartMode, (node) => node.type === 'button')
  chartButtons[0].props.onClick() // supplier/model chart mode
  page = render(section.type, section.props)
  chartProps = walk(page, (node) => node.type && node.type.name === 'Bars').props
  assert.equal(chartProps.hourModels[9].models.length, 2)
  const detailTitleAgain = walk(page, (node) => node.type === 'h3' && textOf(node).includes('模型明细与分布'))
  walkAll(detailTitleAgain, (node) => node.type === 'button')[1].props.onClick()
  page = render(section.type, section.props)
  chartProps = walk(page, (node) => node.type && node.type.name === 'Bars').props
  assert.equal(chartProps.hourModels[9].models.length, 2) // detail toggle cannot change chart
  const table = walk(page, (node) => node.type === 'tbody')
  assert.match(textOf(table), /model-one/)
  assert.doesNotMatch(textOf(table), /model-two/)
  const expand = walk(page, (node) => node.type === 'button' && textOf(node).includes('展开其余'))
  assert.match(textOf(expand), /1 个模型/)
  expand.props.onClick()
  page = render(section.type, section.props)
  assert.match(textOf(walk(page, (node) => node.type === 'tbody')), /model-two/)

  const sectionHooks = hookValues
  const heatElement = walk(page, (node) => node.type && node.type.name === 'Heatmap')
  // The arrows no longer live inside the calendar: the card header owns a
  // HeatPager and Heatmap consumes a controlled `pageIndex`. Re-rendering the
  // heatmap with an explicit pageIndex is how the test walks to older pages.
  const renderHeatPage = (pageIndex) => render(heatElement.type,
    pageIndex === undefined ? heatElement.props : { ...heatElement.props, pageIndex })
  hookValues = []
  let heat = renderHeatPage(0)
  const viewport = walk(heat, (node) => node.props && node.props.className === 'dshus-heat-viewport')
  viewport.props.ref.current = { clientWidth: 800 }
  effects[0]()
  heat = renderHeatPage(0)
  const dailyColumns = walkAll(heat, (node) => node.props && node.props.className === 'dshus-heat-col')
  // MIN_CELL 15 / GAP 5 / MAX_CELL 25: an 800px track fits 39 weeks at
  // (800-8-38*5)/39 ≈ 15.44px, a 240px track fits 11 at (240-8-10*5)/11 ≈ 16.55px.
  assert.equal(dailyColumns.length, 39)
  for (const column of dailyColumns) {
    assert.equal(new Date(column.props['data-week-start'] + 'T00:00:00Z').getUTCDay(), 1)
    assert.equal(column.props.children[0].length, 7)
    assert.equal(column.props.children[0][0].props['aria-label'].slice(0, 10), column.props['data-week-start'])
  }
  assert.ok(Math.abs(parseFloat(walk(heat, (node) => node.props && node.props.className === 'dshus-heat-viewport').props.style['--dshus-cell-size']) - (800 - 8 - 38 * 5) / 39) < 0.01)
  // Paging controls belong to the header, outside the Heatmap subtree.
  assert.equal(walk(heat, (node) => node.props && node.props['aria-label'] === '查看更早日期'), null)
  assert.equal(walk(heat, (node) => node.props && node.props['aria-label'] === '查看较新日期'), null)
  // Heatmap publishes its paging geometry through onPageInfo (a React effect),
  // which is what feeds the header pager.
  let reportedInfo = null
  heat = render(heatElement.type, { ...heatElement.props, pageIndex: 0, onPageInfo: (info) => { reportedInfo = info } })
  effects[1]()
  assert.deepEqual(Object.keys(reportedInfo).sort(), ['first', 'firstMonth', 'last', 'lastMonth', 'page', 'pageCount'])
  assert.equal(reportedInfo.page, 0)
  assert.equal(reportedInfo.pageCount, 2)
  // `first`/`last` are the first and last rendered column starts (Mondays, the
  // same key the grid renders as data-week-start); `last` never runs past today.
  assert.equal(reportedInfo.first, dailyColumns[0].props['data-week-start'])
  assert.equal(reportedInfo.first, dailyColumns[0].props.children[0][0].props['aria-label'].slice(0, 10))
  assert.equal(reportedInfo.last, dailyColumns.at(-1).props['data-week-start'])
  assert.ok(reportedInfo.last <= today, 'the reported window must not run past today')
  assert.deepEqual([reportedInfo.firstMonth, reportedInfo.lastMonth], ['1月', '9月'])
  viewport.props.ref.current.clientWidth = 240
  effects[0]()
  heat = renderHeatPage(0)
  assert.equal(walkAll(heat, (node) => node.props && node.props.className === 'dshus-heat-col').length, 11)
  const pageZeroFirstWeek = walkAll(heat, (node) => node.props && node.props.className === 'dshus-heat-col')[0].props['data-week-start']
  assert.ok(Math.abs(parseFloat(walk(heat, (node) => node.props && node.props.className === 'dshus-heat-viewport').props.style['--dshus-cell-size']) - (240 - 8 - 10 * 5) / 11) < 0.01)
  // 53 weeks of history over 11 visible columns = 5 pages; the arrows that step
  // through them are asserted on the header pager below.
  let olderCell = null
  let olderPage = -1
  for (let index = 0; index < 6 && !olderCell; index++) {
    heat = renderHeatPage(index)
    olderCell = walk(heat, (node) => node.props && node.props.role === 'gridcell' && node.props['aria-label'].startsWith(olderDay))
    if (olderCell) olderPage = index
  }
  assert.equal(olderPage, 2, 'the 200-day-old day must sit two pages back at 240px')
  assert.equal(walk(heat, (node) => node.props && node.props.className === 'dshus-heat-viewport').props['data-page'], 2)
  assert.equal(walk(heat, (node) => node.props && node.props.className === 'dshus-heat-viewport').props['data-page-count'], 5)
  olderCell.props.onMouseMove({ clientX: 100, clientY: 100 })
  heat = renderHeatPage(olderPage)
  const heatTip = walk(heat, (node) => node.props && node.props.className === 'dshus-tip dshus-heat-tip')
  assert.match(textOf(heatTip), /12\.35k.*6\.79k.*5 次/s)
  assert.ok(walk(heatTip, (node) => node.type === 'strong' && node.props.title === '12,345 tokens'))
  // The tooltip anchors to the hovered cell's bottom-right rather than floating
  // above and centred on it. The cell hovered above used a synthetic event with
  // only clientX/clientY, which falls back to a point anchor, so hover a fresh
  // cell that reports a real bounding box.
  const hoverWithBox = (box) => {
    let tree = renderHeatPage(olderPage)
    const cell = walk(tree, (node) => node.props && node.props.role === 'gridcell')
    cell.props.onMouseMove({ currentTarget: { getBoundingClientRect: () => box }, clientX: 0, clientY: 0 })
    return renderHeatPage(olderPage)
  }
  const CELL_BOX = { left: 400, right: 416, top: 300, bottom: 316 }
  let placedHeat = hoverWithBox(CELL_BOX)
  let placedTip = walk(placedHeat, (node) => node.props && node.props.className === 'dshus-tip dshus-heat-tip')
  assert.ok(placedTip, 'hovering a cell must render the heatmap tooltip')
  assert.ok(placedTip.props.style.left >= CELL_BOX.right, 'the tooltip must start to the right of the hovered cell')
  assert.ok(placedTip.props.style.top >= CELL_BOX.bottom, 'the tooltip must start below the hovered cell')
  // Re-hover after the real box is known so the measure pass settles it.
  placedHeat = hoverWithBox(CELL_BOX)
  placedTip = walk(placedHeat, (node) => node.props && node.props.className === 'dshus-tip dshus-heat-tip')
  if (placedTip) {
    placedTip.props.ref.current = { getBoundingClientRect: () => ({ width: 320, height: 200 }) }
  }
  placedHeat = hoverWithBox(CELL_BOX)
  placedTip = walk(placedHeat, (node) => node.props && node.props.className === 'dshus-tip dshus-heat-tip')
  assert.ok(placedTip, 'the measured tooltip must still be rendered')
  assert.ok(placedTip.props.style.left >= CELL_BOX.right, 'the settled tooltip must clear the cell horizontally')
  assert.ok(placedTip.props.style.top >= CELL_BOX.bottom, 'the settled tooltip must clear the cell vertically')
  assert.ok(placedTip.props.style.left < 1200, 'the tooltip must stay inside the viewport')
  // A cell jammed against the right edge must mirror to the cell's LEFT, offset
  // by the gap: 1180 - 8 - 320 = 852. Asserting the exact x (not merely "fits
  // inside the window") is what pins the mirror branch — a right-edge clamp
  // would also fit while placing the tip somewhere else entirely.
  const EDGE_BOX = { left: 1180, right: 1196, top: 300, bottom: 316 }
  const edgeHeat = hoverWithBox(EDGE_BOX)
  const edgeTip = walk(edgeHeat, (node) => node.props && node.props.className === 'dshus-tip dshus-heat-tip')
  assert.ok(edgeTip, 'a right-edge cell must still render the tooltip')
  assert.equal(edgeTip.props.style.left, EDGE_BOX.left - 8 - 320, 'a right-edge cell must mirror the tooltip to the LEFT of the cell, offset by the gap')
  assert.ok(edgeTip.props.style.left < EDGE_BOX.left, 'the mirrored tooltip must clear the hovered cell')
  assert.ok(edgeTip.props.style.left + 320 <= 1200, 'a right-edge cell must not overflow the window')
  // A cell near the bottom must flip ABOVE the cell. The flip uses the estimated
  // height (80 + models*25) on the first pass, so the tip lands at
  // 760 - 8 - 80 = 672 and grows downward from there — always above the cell,
  // never below it. "Above the cell top" is the invariant that pins the flip
  // branch; the exact y follows from the estimate.
  const BOTTOM_BOX = { left: 400, right: 416, top: 760, bottom: 776 }
  const bottomHeat = hoverWithBox(BOTTOM_BOX)
  const bottomTip = walk(bottomHeat, (node) => node.props && node.props.className === 'dshus-tip dshus-heat-tip')
  assert.ok(bottomTip, 'a bottom-edge cell must still render the tooltip')
  assert.ok(bottomTip.props.style.top < BOTTOM_BOX.top, 'a bottom-edge cell must flip the tooltip above the cell, not below it')
  assert.equal(bottomTip.props.style.top, BOTTOM_BOX.top - 8 - 80, 'the flipped tooltip sits a gap plus its estimated height above the cell')
  hookValues = sectionHooks
  // The heatmap includes a colour scale for usage intensity.
  const heatLegend = walk(heat, (node) => node.props && node.props.className === 'dshus-heat-legend')
  assert.ok(heatLegend, 'the heatmap must render its colour legend')
  assert.equal(walkAll(heatLegend, (node) => node.props && node.props.className === 'dshus-heat-legend-cell').length, 4)
  assert.match(textOf(heatLegend), /少.*多/s)
  hookValues = sectionHooks

  // The header contains the pager and mode switch without a duplicate total caption.
  const heatModule = walkAll(page, (node) => node.props && node.props.className === 'dshus-module')[2]
  const heatHeading = walk(heatModule, (node) => node.type === 'h3')
  assert.doesNotMatch(textOf(heatHeading), /累计总量/)
  assert.equal(walk(heatHeading, (node) => node.props && node.props.className === 'dshus-heat-total-label'), null)
  // Check the rendered calendar as well as the page's Heatmap element.
  assert.doesNotMatch(textOf(heat), /累计总量/)
  assert.equal(walk(heat, (node) => node.props && node.props.className === 'dshus-heat-total-label'), null)
  const pagerElement = walk(heatHeading, (node) => node.type && node.type.name === 'HeatPager')
  assert.ok(pagerElement, 'the heatmap header must render the pager next to the mode switch')
  assert.equal(pagerElement.props.info, null) // nothing has measured the pane in this render yet
  // Feed the page the real geometry Heatmap publishes at 240px: 5 pages, so the
  // header pager has something to page through.
  let pageZeroInfo = null
  const reportHeatAt = (index) => {
    let next = null
    hookValues = []
    const base = { ...heatElement.props, pageIndex: index }
    let node = render(heatElement.type, base)
    walk(node, (child) => child.props && child.props.className === 'dshus-heat-viewport').props.ref.current = { clientWidth: 240 }
    effects[0]()
    node = render(heatElement.type, base)
    node = render(heatElement.type, { ...base, onPageInfo: (info) => { next = info; heatElement.props.onPageInfo(info) } })
    hookValues = sectionHooks // the page's own setHeatInfo writes into its hooks
    effects[1]()
    return next
  }
  pageZeroInfo = reportHeatAt(0)
  assert.equal(pageZeroInfo.pageCount, 5)
  page = render(section.type, section.props)
  const renderPager = (info) => {
    const element = walk(page, (node) => node.type && node.type.name === 'HeatPager')
    return render(element.type, { ...element.props, info })
  }
  // Both arrows are disabled before any measurement has been published, so the
  // page-0 assertions below must run against populated info — otherwise
  // "disabled" would be true for the wrong reason.
  const emptyPagerGroup = renderPager(null)
  assert.equal(walk(emptyPagerGroup, (node) => node.props && node.props['aria-label'] === '查看更早日期').props.disabled, true)
  assert.equal(walk(emptyPagerGroup, (node) => node.props && node.props['aria-label'] === '查看较新日期').props.disabled, true)
  assert.equal(textOf(walk(emptyPagerGroup, (node) => node.props && node.props.className === 'dshus-heat-nav-label')), '')
  const pagerGroup = renderPager(pageZeroInfo)
  assert.ok(pageZeroInfo.pageCount > 1, 'the page-0 assertions need a multi-page range to be meaningful')
  assert.equal(pagerGroup.props.className, 'dshus-heat-nav-group')
  assert.equal(pagerGroup.props.role, 'group')
  assert.equal(pagerGroup.props['aria-label'], '热力图翻页')
  const pagerLabel = walk(pagerGroup, (node) => node.props && node.props.className === 'dshus-heat-nav-label')
  assert.equal(textOf(pagerLabel), '7月 – 9月')
  const pagerOlder = walk(pagerGroup, (node) => node.props && node.props['aria-label'] === '查看更早日期')
  const pagerNewer = walk(pagerGroup, (node) => node.props && node.props['aria-label'] === '查看较新日期')
  assert.equal(pagerNewer.props.disabled, true, 'page 0 is the newest page, so 查看较新日期 is disabled')
  assert.equal(pagerOlder.props.disabled, false, 'pageCount > 1 keeps 查看更早日期 enabled')
  // A single-page range keeps the pager inert but still labelled.
  const singlePagePager = renderPager({ ...pageZeroInfo, page: 0, pageCount: 1 })
  assert.match(singlePagePager.props.className, / dshus-heat-nav-static$/)
  assert.equal(walk(singlePagePager, (node) => node.props && node.props['aria-label'] === '查看更早日期').props.disabled, true)
  assert.equal(walk(singlePagePager, (node) => node.props && node.props['aria-label'] === '查看较新日期').props.disabled, true)
  // The oldest page flips the arrows: 查看更早日期 is spent, 查看较新日期 is live.
  const oldestPageInfo = reportHeatAt(4)
  assert.equal(oldestPageInfo.page, 4)
  assert.equal(textOf(walk(renderPager(oldestPageInfo), (node) => node.props && node.props.className === 'dshus-heat-nav-label')), '9月 – 11月')
  const oldestPager = renderPager(oldestPageInfo)
  assert.equal(walk(oldestPager, (node) => node.props && node.props['aria-label'] === '查看更早日期').props.disabled, true)
  assert.equal(walk(oldestPager, (node) => node.props && node.props['aria-label'] === '查看较新日期').props.disabled, false)
  // Clicking the header arrow hands the next page back down to the heatmap,
  // whose window is strictly older than page 0's.
  const pageOneInfo = reportHeatAt(1)
  assert.ok(pageOneInfo.first < pageZeroInfo.first, 'page 1 must start before page 0')
  assert.equal(pageOneInfo.firstMonth + ' – ' + pageOneInfo.lastMonth, '5月 – 7月')
  reportHeatAt(0) // page state and published info agree on page 0 again
  page = render(section.type, section.props)
  const livePagerElement = () => walk(page, (node) => node.type && node.type.name === 'HeatPager')
  const heatInfoOnPage = livePagerElement().props.info
  assert.equal(heatInfoOnPage.page, 0)
  const headerOlder = walk(render(livePagerElement().type, { ...livePagerElement().props, info: heatInfoOnPage }), (node) => node.props && node.props['aria-label'] === '查看更早日期')
  assert.equal(headerOlder.props.disabled, false)
  headerOlder.props.onClick()
  page = render(section.type, section.props)
  const heatAfterStep = walk(page, (node) => node.type && node.type.name === 'Heatmap')
  assert.equal(heatAfterStep.props.pageIndex, 1, 'the header arrow must push the next page index into Heatmap')
  // Render the paged heatmap against its own hook slots, measured at 240px so
  // the 5-page geometry (and therefore page 1) is real.
  hookValues = []
  const steppedHeat = render(heatAfterStep.type, heatAfterStep.props)
  walk(steppedHeat, (node) => node.props && node.props.className === 'dshus-heat-viewport').props.ref.current = { clientWidth: 240 }
  effects[0]()
  const steppedViewport = walk(render(heatAfterStep.type, heatAfterStep.props), (node) => node.props && node.props.className === 'dshus-heat-viewport')
  assert.equal(steppedViewport.props['data-page'], 1)
  assert.equal(steppedViewport.props['data-page-count'], 5)
  // Page 1 shows a window strictly older than the newest page's.
  const steppedWeeks = walkAll(render(heatAfterStep.type, heatAfterStep.props), (node) => node.props && node.props.className === 'dshus-heat-col')
  assert.equal(steppedWeeks.length, 11)
  assert.ok(steppedWeeks[0].props['data-week-start'] < pageZeroFirstWeek, 'page 1 must start before page 0')
  hookValues = sectionHooks
  // The heatmap is on page 1 here, so switching mode must reset the page index to
  // 0 and drop the stale info (the new mode has its own geometry).
  assert.equal(walk(page, (node) => node.type && node.type.name === 'Heatmap').props.pageIndex, 1)
  const heatModes = walk(page, (node) => node.props && node.props['aria-label'] === '热力图时长')
  walkAll(heatModes, (node) => node.type === 'button')[1].props.onClick()
  page = render(section.type, section.props)
  const weeklyHeatElement = walk(page, (node) => node.type && node.type.name === 'Heatmap')
  assert.equal(weeklyHeatElement.props.mode, 'weekly')
  assert.equal(weeklyHeatElement.props.pageIndex, 0, 'switching mode resets the page index')
  assert.equal(walk(page, (node) => node.type && node.type.name === 'HeatPager').props.info, null, 'switching mode drops the stale pager info')
  assert.match(walkAll(page, (node) => node.props && node.props['aria-label'] === '热力图时长').at(0).props.children[1].props.className, / on$/)
  hookValues = []
  heat = render(weeklyHeatElement.type, weeklyHeatElement.props)
  walk(heat, (node) => node.props && node.props.className === 'dshus-heat-viewport').props.ref.current = { clientWidth: 800 }
  effects[0]()
  heat = render(weeklyHeatElement.type, weeklyHeatElement.props)
  // Same 39 fit as the daily strip: MIN_CELL 15 / GAP 5 fills an 800px track.
  assert.equal(walkAll(heat, (node) => node.props && node.props.className === 'dshus-heat-col').length, 39)
  assert.ok(walk(heat, (node) => node.props && node.props.role === 'gridcell' && node.props['aria-label'].includes('当周')))
  const currentWeek = walkAll(heat, (node) => node.props && node.props.className === 'dshus-heat-col').at(-1)
  assert.equal(currentWeek.props.children[0].length, 7)
  assert.ok(currentWeek.props.children[0].every((cell) => cell.props.tabIndex === 0 && /当周: 30 tokens，3 次调用/.test(cell.props['aria-label'])))
  let weeklyOlder = walk(heat, (node) => node.props && node.props.role === 'gridcell' && node.props['aria-label'].startsWith(olderDay))
  if (!weeklyOlder) {
    // Step the page index supplied by the header.
    heat = render(weeklyHeatElement.type, { ...weeklyHeatElement.props, pageIndex: 1 })
    weeklyOlder = walk(heat, (node) => node.props && node.props.role === 'gridcell' && node.props['aria-label'].startsWith(olderDay))
  }
  assert.ok(weeklyOlder)
  assert.match(weeklyOlder.props['aria-label'], /19,234 tokens，7 次调用/)
  weeklyOlder.props.onMouseMove({ clientX: 100, clientY: 100 })
  heat = render(weeklyHeatElement.type, weeklyHeatElement.props)
  const selectedColumn = walk(heat, (node) => node.props && node.props.className === 'dshus-heat-col weekly-active')
  assert.ok(selectedColumn)
  assert.equal(selectedColumn.props['data-week-start'], new Date((olderOrdinal - (new Date(olderOrdinal * 86400000).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10))
  assert.ok(selectedColumn.props.children[0].some((cell) => cell.props['aria-label'].startsWith(olderDay)))
  assert.ok(selectedColumn.props.children[0].some((cell) => cell.props['aria-label'].startsWith(olderWeekMate)))
  weeklyOlder.props.onClick()
  heat = render(weeklyHeatElement.type, weeklyHeatElement.props)
  assert.ok(walk(heat, (node) => node.props && node.props.className === 'dshus-heat-col weekly-active'))
  hookValues = sectionHooks

  const trendModes = walk(page, (node) => node.props && node.props['aria-label'] === '每日Token趋势时长')
  const weekTrend = walk(page, (node) => node.type && node.type.name === 'DailyTrend')
  assert.equal(render(weekTrend.type, weekTrend.props).props.key, 'week')
  walkAll(trendModes, (node) => node.type === 'button')[1].props.onClick()
  page = render(section.type, section.props)
  const trendElement = walk(page, (node) => node.type && node.type.name === 'DailyTrend')
  assert.equal(trendElement.props.period, 'month')
  const trendBarsElement = render(trendElement.type, trendElement.props)
  assert.equal(trendBarsElement.type.name, 'Bars')
  assert.equal(trendBarsElement.props.key, 'month')
  assert.equal(trendBarsElement.props.hourModels.length, 30)
  assert.equal(trendBarsElement.props.hourModels[29].models.length, 1)
  // The same model served by two providers folds into one row, and the merged
  // row keeps only the model name — the daily breakdown never names a provider.
  assert.equal(trendBarsElement.props.hourModels[29].models[0].model, 'model-one')
  assert.equal(trendBarsElement.props.hourModels[29].models[0].provider, '')
  assert.equal(trendBarsElement.props.hourModels[29].models[0].billed, 30)
  // Merged rows are keyed "by-model:<name>", which the provider-keyed colour
  // lookup cannot resolve. The trend must supply its own resolver, otherwise
  // every legend swatch and bar falls back to the same grey.
  const trendColorOf = trendBarsElement.props.colorOf
  assert.equal(typeof trendColorOf, 'function')
  const mergedKey = trendBarsElement.props.hourModels[29].models[0].key
  assert.match(mergedKey, /^by-model:/)
  const mergedColor = trendColorOf(mergedKey)
  assert.ok(mergedColor && mergedColor !== '#94a3b8', 'merged model must not fall back to grey')
  assert.match(mergedColor, /^#[0-9a-f]{6}$/i)
  // A second, different model must not reuse the same colour.
  const otherColor = trendColorOf('by-model:some-other-model')
  assert.notEqual(otherColor, mergedColor)
  // Colour is a pure function of the model name, so it is stable across days.
  assert.equal(trendColorOf('by-model:model-one'), trendColorOf('by-model:model-one'))
  // The two branches must actually differ: a merged key resolves from the model
  // palette, while a raw provider/model key still goes to the section resolver.
  // Stubbing the raw resolver with a sentinel proves the prefix test is live.
  const sentinelColor = '#00ff00'
  const seen = []
  const hooksBeforeProbe = hookValues
  hookValues = []
  const probeElement = render(trendElement.type, { ...trendElement.props, colorOf: (key) => { seen.push(key); return sentinelColor } })
  // DailyTrend returns the Bars element; its props carry the resolver under test.
  const probeColorOf = probeElement.props.colorOf
  assert.equal(typeof probeColorOf, 'function', 'the trend must supply a colour resolver')
  const mergedProbe = probeColorOf('by-model:probe-model')
  const rawProbe = probeColorOf('provider/probe-model')
  assert.notEqual(mergedProbe, sentinelColor, 'merged key must not reach the section resolver')
  assert.equal(rawProbe, sentinelColor, 'raw key must reach the section resolver')
  assert.ok(seen.includes('provider/probe-model'), 'raw keys are forwarded')
  assert.ok(!seen.includes('by-model:probe-model'), 'merged keys are resolved internally')
  hookValues = hooksBeforeProbe
  const sectionHooksAfterTrend = hookValues
  hookValues = []
  const denseDays = new Map(Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.parse(today + 'T00:00:00Z') - (29 - index) * 86400000).toISOString().slice(0, 10)
    return [date, { date, billed: index + 1, calls: 1 }]
  }))
  const denseElement = render(trendElement.type, { ...trendElement.props, dayMap: denseDays, dayModelMap: new Map() })
  let denseChart = render(denseElement.type, denseElement.props)
  const allMonthBars = walkAll(denseChart, (node) => node.props && node.props.className === 'dshus-bar')
  assert.equal(allMonthBars.length, 30)
  assert.ok(allMonthBars.every((bar) => bar.props.style.height === '0%'))
  hookValues = []
  let trendChart = render(trendBarsElement.type, trendBarsElement.props)
  const trendHits = walkAll(trendChart, (node) => node.props && node.props.className === 'dshus-hour-hit')
  assert.equal(trendHits.length, 30)
  assert.ok(walk(trendChart, (node) => node.type === 'polyline'))
  assert.match(trendHits[29].props['aria-label'], new RegExp(today + '.*3 次调用'))
  trendHits[29].props.onMouseMove({ clientX: 100, clientY: 50 })
  trendChart = render(trendBarsElement.type, trendBarsElement.props)
  // The two providers' "model-one" rows fold into a single model-only row,
  // and the tooltip carries no provider prefix.
  const trendTipText = textOf(walk(trendChart, (node) => node.props && node.props.className === 'dshus-tip dshus-chart-tip'))
  assert.match(trendTipText, /3 次调用.*全天.*Token 用量.*30.*model-one 30/s)
  assert.doesNotMatch(trendTipText, /\ba\s*·\s*model-one|\bb\s*·\s*model-one/)
  hookValues = sectionHooksAfterTrend

  failNext = true
  walk(page, (node) => node.type === 'button' && node.props?.['aria-label'] === '刷新用量统计').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  page = render(section.type, section.props)
  assert.match(textOf(page), /network unavailable/)
  assert.equal(walk(page, (node) => node.type && node.type.name === 'Heatmap').props.mode, 'weekly')

  // The already-running host may still omit byDayModels after the client is
  // updated. A hovered day is derived from two adjacent cumulative ranges.
  delete statsBody.byDayModels
  statsBody.days = 0
  legacyDayResponses = new Map([
    [201, { byModel: [
      { key: 'a/model-one', provider: 'a', model: 'model-one', billed: 20000, calls: 4 },
      { key: 'c/model-two', provider: 'c', model: 'model-two', billed: 8000, calls: 3 },
    ] }],
    [200, { byModel: [
      { key: 'a/model-one', provider: 'a', model: 'model-one', billed: 7655, calls: 1 },
      { key: 'c/model-two', provider: 'c', model: 'model-two', billed: 1211, calls: 1 },
    ] }],
  ])
  walk(page, (node) => node.type === 'button' && node.props?.['aria-label'] === '刷新用量统计').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  page = render(section.type, section.props)
  walkAll(walk(page, (node) => node.props && node.props['aria-label'] === '热力图时长'), (node) => node.type === 'button')[0].props.onClick()
  page = render(section.type, section.props)
  const legacyHeatElement = walk(page, (node) => node.type && node.type.name === 'Heatmap')
  const sectionHooksWithLegacyHost = hookValues
  hookValues = []
  heat = render(legacyHeatElement.type, legacyHeatElement.props)
  walk(heat, (node) => node.props && node.props.className === 'dshus-heat-viewport').props.ref.current = { clientWidth: 800 }
  effects[0]()
  heat = render(legacyHeatElement.type, legacyHeatElement.props)
  let legacyCell = walk(heat, (node) => node.props && node.props.role === 'gridcell' && node.props['aria-label'].startsWith(olderDay))
  if (!legacyCell) {
    // The header pager owns the arrows: step pageIndex directly instead.
    heat = render(legacyHeatElement.type, { ...legacyHeatElement.props, pageIndex: 1 })
    legacyCell = walk(heat, (node) => node.props?.role === 'gridcell' && node.props['aria-label'].startsWith(olderDay))
  }
  assert.ok(legacyCell)
  legacyCell.props.onMouseMove({ clientX: 100, clientY: 100 })
  heat = render(legacyHeatElement.type, legacyHeatElement.props)
  assert.match(textOf(walk(heat, (node) => node.props && node.props.className === 'dshus-tip dshus-heat-tip')), /正在读取模型明细/)
  await new Promise((resolve) => setImmediate(resolve))
  heat = render(legacyHeatElement.type, legacyHeatElement.props)
  assert.match(textOf(walk(heat, (node) => node.props && node.props.className === 'dshus-tip dshus-heat-tip')), /model-one.*12\.35k.*model-two.*6\.79k.*5 次/s)
  assert.equal(requests.filter((url) => /days=20[01]/.test(url)).length, 2)
  hookValues = sectionHooksWithLegacyHost

  const quotaTab = walk(page, (node) => node.props && node.props.id === 'dshus-tab-quota')
  quotaTab.props.onClick()
  page = render(section.type, section.props)
  assert.equal(walk(page, (node) => node.type && node.type.name === 'Bars'), null)
  assert.equal(walk(page, (node) => node.props && node.props.id === 'dshus-usage-panel'), null)
  assert.equal(walk(page, (node) => node.props && node.props.id === 'dshus-tab-quota').props['aria-selected'], true)
  assert.ok(walk(page, (node) => node.props && node.props.id === 'dshus-quota-panel'))
  const sectionHooksOnQuota = hookValues
  const providerElement = walk(page, (node) => node.type && node.type.name === 'ProviderQuotasPanel')
  assert.ok(providerElement)
  hookValues = []
  let quotaRefreshes = 0
  const providerApi = { providerQuotas: async (opts) => {
    if (opts.fresh) quotaRefreshes++
    return { ok: true, quotas: [{ provider: 'openrouter', name: 'OpenRouter', syncedAt: Date.UTC(2026, 0, 2, 3, 4), metrics: [
      { label: '本月密钥额度', kind: 'amount', remaining: 2.5, total: 10, currency: 'USD' },
      { label: '周剩余', kind: 'window', remainingPercent: 40, resetAt: '2099-01-01T00:00:00.000Z', remaining: 4, total: 10 },
    ] }] }
  } }
  assert.equal(render(providerElement.type, { api: providerApi }), null)
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  let providerPanel = render(providerElement.type, { api: providerApi })
  assert.match(textOf(providerPanel), /OpenRouter.*\$2\.50.*本月密钥额度.*周剩余.*40%/s)
  // Mixed providers keep their amount limits and render each time window as
  // a separate label / progress / percentage / reset row.
  const quotaBar = walk(providerPanel, (node) => node.props?.className === 'dshus-statbar dshus-quota-bar')
  assert.ok(quotaBar)
  const quotaStats = walkAll(quotaBar, (node) => node.props?.className === 'dshus-stat')
  assert.equal(quotaStats.length, 1, 'only the amount uses an inline value column')
  for (const stat of quotaStats) {
    const kids = stat.props.children.filter(Boolean)
    assert.equal(kids[0].props.className, 'v', 'the value leads each column')
    assert.equal(kids[1].props.className, 'k', 'the meaning sits under the value')
  }
  assert.equal(textOf(walk(quotaStats[0], (n) => n.props?.className === 'v')), '$2.50')
  assert.equal(textOf(walk(quotaStats[0], (n) => n.props?.className === 'k')), '本月密钥额度')
  const windowRow = walk(providerPanel, (node) => node.props?.className === 'dshus-quota-row')
  assert.ok(windowRow)
  assert.equal(textOf(walk(windowRow, (n) => n.props?.className === 'dshus-quota-label')), '周剩余')
  assert.equal(textOf(walk(windowRow, (n) => n.props?.className === 'dshus-quota-pct')), '40%')
  assert.match(textOf(walk(windowRow, (n) => n.props?.className === 'dshus-quota-reset')), /重置$/)
  assert.equal(walk(windowRow, (n) => n.props?.role === 'progressbar').props['aria-valuenow'], 40)
  assert.match(walk(windowRow, (n) => n.props?.role === 'progressbar').props['aria-valuetext'], /剩余 40%.*4 \/ 10/)
  assert.equal(walk(providerPanel, (node) => node.props?.className === 'dshus-go-cards'), null)
  // The multi-metric card carries the last-fetch line.
  const fetched = walk(providerPanel, (node) => node.props?.className === 'dshus-fetched')
  assert.ok(fetched)
  assert.match(textOf(fetched), /上次获取时间：/)
  assert.match(textOf(fetched), /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  const refresh = walk(providerPanel, (node) => node.type === 'button' && node.props?.['aria-label'] === '刷新 OpenRouter 配额')
  refresh.props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(quotaRefreshes, 1)

  hookValues = []
  const balanceApi = { providerQuotas: async () => ({ ok: true, quotas: [{
    provider: 'deepseek', name: 'DeepSeek', metrics: [{ label: '账户可用余额', kind: 'amount', remaining: 10.88, currency: 'CNY' }],
  }] }) }
  assert.equal(render(providerElement.type, { api: balanceApi }), null)
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  const balancePanel = render(providerElement.type, { api: balanceApi })
  const balanceRow = walk(balancePanel, (node) => node.props?.className === 'dshus-module dshus-balance-module')
  assert.ok(balanceRow)
  assert.match(textOf(balanceRow), /DeepSeek.*¥10\.88/s)
  assert.equal(walk(balanceRow, (node) => node.props?.className === 'dshus-go-cards'), null)
  assert.ok(walk(balanceRow, (node) => node.props?.['aria-label'] === '刷新 DeepSeek 配额'))
  // A single-value balance card keeps its own layout (no inline stat row), and
  // carries the last-fetch line under the right-aligned amount.
  assert.equal(walk(balanceRow, (node) => node.props?.className === 'dshus-statbar dshus-quota-bar'), null)
  const balanceSide = walk(balanceRow, (node) => node.props?.className === 'dshus-balance-side')
  assert.ok(balanceSide, 'the amount and fetch time share one right-aligned column')
  assert.match(textOf(walk(balanceSide, (node) => node.props?.className === 'dshus-fetched')), /上次获取时间：—/)

  hookValues = []
  let stepfunQueries = 0
  const stepfunApi = { providerQuotas: async (opts) => {
    if (opts.fresh) stepfunQueries++
    return { ok: true, quotas: [{ provider: 'setpfun', name: 'StepFun', ...(opts.fresh
      ? { metrics: [{ label: '账户可用余额', kind: 'amount', remaining: 0, currency: 'CNY' }] }
      : { status: 'unqueried', metrics: [] }) }] }
  } }
  render(providerElement.type, { api: stepfunApi })
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  const unqueried = render(providerElement.type, { api: stepfunApi })
  assert.match(textOf(unqueried), /StepFun.*未查询/s)
  assert.doesNotMatch(textOf(unqueried), /¥|NaN|0\.00/)
  assert.equal(stepfunQueries, 0, 'mounting a configured balance placeholder must only read the cache')
  walk(unqueried, (node) => node.props?.['aria-label'] === '刷新 StepFun 配额').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  const stepfunBalance = render(providerElement.type, { api: stepfunApi })
  assert.match(textOf(stepfunBalance), /StepFun.*¥0\.00/s)
  assert.doesNotMatch(textOf(stepfunBalance), /未查询/)
  assert.equal(stepfunQueries, 1)

  hookValues = []
  assert.equal(render(providerElement.type, { api: { providerQuotas: async () => ({ ok: true, quotas: [] }) } }), null)
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(render(providerElement.type, { api: {} }), null)

  assert.equal(walk(page, (node) => node.type && node.type.name === 'OpencodePanel'), null)

  // The last-fetch line must degrade to an em dash instead of rendering
  // "Invalid Date" or "NaN" for missing / malformed timestamps.
  hookValues = []
  // Multi-value quota cards are the ones that carry the last-fetch line, so the
  // degradation cases are exercised through them.
  const pair = (label) => [
    { label, kind: 'window', remainingPercent: 40, remaining: 4, total: 10 },
    { label: label + '2', kind: 'window', remainingPercent: 60, remaining: 6, total: 10 },
  ]
  const fetchedApi = { providerQuotas: async () => ({ ok: true, quotas: [
    { provider: 'a', name: 'A', syncedAt: null, metrics: pair('甲') },
    { provider: 'b', name: 'B', syncedAt: 'not-a-date', metrics: pair('乙') },
    { provider: 'c', name: 'C', syncedAt: 0, metrics: pair('丙') },
    { provider: 'd', name: 'D', syncedAt: Date.UTC(2026, 4, 6, 7, 8), metrics: pair('丁') },
  ] }) }
  assert.equal(render(providerElement.type, { api: fetchedApi }), null)
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  const fetchedPanel = render(providerElement.type, { api: fetchedApi })
  const fetchedLines = walkAll(fetchedPanel, (node) => node.props?.className === 'dshus-fetched').map(textOf)
  assert.equal(fetchedLines.length, 4)
  assert.deepEqual(fetchedLines.slice(0, 3), ['上次获取时间：—', '上次获取时间：—', '上次获取时间：—'])
  assert.match(fetchedLines[3], /^上次获取时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  assert.doesNotMatch(textOf(fetchedPanel), /Invalid Date|NaN/)

  hookValues = []
  const goApi = { providerQuotas: async () => ({ ok: true, quotas: [{
    provider: 'opencode-go', name: 'OpenCode Go', metrics: [
      { label: '5 小时剩余', kind: 'window', remainingPercent: 95 },
      { label: '周剩余', kind: 'window', remainingPercent: 54 },
    ],
  }] }) }
  render(providerElement.type, { api: goApi })
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  const goPanel = render(providerElement.type, { api: goApi })
  assert.match(textOf(goPanel), /OpenCode Go.*5 小时剩余.*95%.*周剩余.*54%/s)
  assert.doesNotMatch(textOf(goPanel), /本机|sessions|近 5 小时/)

  hookValues = []
  const orderedQuotas = [
    { provider: 'claude', name: 'Claude', metrics: [
      { label: '5 小时剩余', kind: 'window', remainingPercent: 38 },
      { label: '周剩余', kind: 'window', remainingPercent: 20 },
      { label: '月剩余', kind: 'window', remainingPercent: 0 },
      { label: 'Sonnet 周剩余', kind: 'window', remainingPercent: 99 },
    ] },
    { provider: 'deepseek', name: 'DeepSeek', metrics: [{ label: '余额', kind: 'amount', remaining: 0, currency: 'CNY' }] },
    { provider: 'opencode-go', name: 'OpenCode Go', kind: 'subscription', status: 'unqueried', metrics: [] },
    { provider: 'stepfun', name: 'StepFun', metrics: [
      { label: '充值余额', kind: 'amount', remaining: 10, currency: 'CNY' },
      { label: '赠送余额', kind: 'amount', remaining: 20, currency: 'CNY' },
    ] },
    { provider: 'gateway', name: '自定义余额', kind: 'balance', status: 'unqueried', metrics: [] },
    { provider: 'openrouter', name: 'OpenRouter', metrics: [{ label: '密钥额度', kind: 'amount', remaining: 5, total: 10, currency: 'USD' }] },
    { provider: 'mixed', name: '混合配额', metrics: [
      { label: '余额', kind: 'amount', remaining: 10 },
      { label: '周剩余', kind: 'window', remainingPercent: 50 },
    ] },
  ]
  const orderedApi = { providerQuotas: async () => ({ ok: true, quotas: orderedQuotas }) }
  render(providerElement.type, { api: orderedApi })
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  const orderedPanel = render(providerElement.type, { api: orderedApi })
  const orderedModules = walkAll(orderedPanel, (n) => /^dshus-module(?: |$)/.test(n.props?.className || ''))
  assert.deepEqual(orderedModules.map((n) => textOf(walk(n, (child) => child.type === 'h3'))), [
    'DeepSeek', 'StepFun', '自定义余额', 'OpenRouter', 'Claude', 'OpenCode Go', '混合配额',
  ])
  assert.equal(orderedQuotas[0].provider, 'claude', 'display sorting must not mutate the cached provider order')
  const claudeRows = walkAll(orderedModules[4], (n) => n.props?.className === 'dshus-quota-row')
  assert.deepEqual(claudeRows.map((n) => textOf(walk(n, (child) => child.props?.className === 'dshus-quota-label'))), [
    '5 小时剩余', '周剩余', '月剩余', 'Sonnet 周剩余',
  ])
  assert.equal(walk(claudeRows[2], (n) => n.props?.role === 'progressbar').props['aria-valuenow'], 0, 'an exhausted window stays visible')
  assert.equal(walk(claudeRows[3], (n) => n.props?.className === 'dshus-go-fill').props.style.width, '99%', 'model windows retain their remaining percentage')

  const accountElement = walk(page, (node) => node.type?.name === 'AccountQuotasPanel')
  assert.ok(accountElement, 'account quotas share the ordered provider list')
  assert.equal(walk(page, (node) => node.type?.name === 'WorkBuddyPanel'), null, 'duplicate WorkBuddy boards are removed')
  hookValues = sectionHooksOnQuota
  walk(page, (node) => node.props && node.props.id === 'dshus-tab-usage').props.onClick()
  page = render(section.type, section.props)
  assert.equal(walk(page, (node) => node.props && node.props.id === 'dshus-tab-usage').props['aria-selected'], true)
  assert.equal(walk(page, (node) => node.type && node.type.name === 'OpencodePanel'), null)
  assert.equal(walk(page, (node) => node.props?.id === 'dshus-quota-panel').props.hidden, true)
  assert.equal(walk(page, (node) => node.type && node.type.name === 'ProviderQuotasPanel').props.active, false)
  assert.equal(walk(page, (node) => node.type && node.type.name === 'AccountQuotasPanel').props.active, false)
  assert.equal(walk(page, (node) => node.type && node.type.name === 'Heatmap').props.mode, 'daily')
  const barsElement = walk(page, (node) => node.type && node.type.name === 'Bars')
  hookValues = []
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, models: hour === 9 ? [{ key: 'a', model: 'a', billed: 10 }] : [] }))
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, calls: hour === 9 ? 3 : 0, billed: hour === 9 ? 10 : 0 }))
  const chart = render(barsElement.type, { hourModels: hours, byHour, colorOf: () => '#000' })
  const line = walk(chart, (node) => node.type === 'polyline')
  const hitAreas = walkAll(chart, (node) => node.props && node.props.className === 'dshus-hour-hit')
  assert.ok(line)
  assert.match(line.props.points, /95,/) // 09:00 point
  assert.equal(line.props.stroke, '#3b82f6')
  assert.equal(hitAreas.length, 24)
  assert.match(hitAreas[9].props['aria-label'], /9时，3 次调用/)
  assert.match(textOf(chart), /调用次数/)
  hitAreas[9].props.onMouseMove({ clientX: 100, clientY: 50 })
  const hovered = render(barsElement.type, { hourModels: hours, byHour, colorOf: () => '#000' })
  assert.match(textOf(walk(hovered, (node) => node.props && node.props.className === 'dshus-tip dshus-chart-tip')), /3 次调用.*09:00.*Token 用量.*10/s)
  assert.ok(walk(hovered, (node) => node.props && node.props.className === 'dshus-hover-line'))

  /* ---- daily trend tooltip: models only, no provider ---- */
  // Hover the last day of the already-built 30-day trend. The merged rows carry
  // "by-model:" keys, so the tooltip swatches prove the colour resolver copes.
  hookValues = []
  const dailyHits = walkAll(render(trendBarsElement.type, trendBarsElement.props), (node) => node.props && node.props.className === 'dshus-hour-hit')
  assert.equal(dailyHits.length, 30)
  dailyHits[29].props.onMouseMove({ clientX: 100, clientY: 50 })
  const dailyChart = render(trendBarsElement.type, trendBarsElement.props)
  const dailyTip = walk(dailyChart, (node) => node.props && node.props.className === 'dshus-tip dshus-chart-tip')
  assert.ok(dailyTip, 'daily trend must show a hover tooltip')
  const dailyTipText = textOf(dailyTip)
  assert.match(dailyTipText, /model-one/)
  assert.match(dailyTipText, /3 次调用/)
  // Even when the row carries a provider, the daily breakdown must not print it.
  assert.doesNotMatch(dailyTipText, /a\s*·\s*model-one/)
  assert.doesNotMatch(dailyTipText, /b\s*·\s*model-one/)
  // The model swatch must be a real palette colour, never the grey fallback that
  // an unresolved "by-model:" key would produce. Row 0 is the grey total row.
  const dailySwatches = walkAll(dailyTip, (node) => node.props && node.props.className === 'dshus-tip-swatch')
  const modelSwatches = dailySwatches.slice(1).map((node) => node.props.style.background)
  assert.equal(modelSwatches.length, 1)
  assert.ok(modelSwatches[0] && modelSwatches[0] !== '#94a3b8', 'model swatch must not fall back to grey')
  assert.match(modelSwatches[0], /^#[0-9a-f]{6}$/i)

  /* ---- the hourly chart keeps its provider-qualified label ---- */
  const hourModelList = [{ hour: 9, models: [{ key: 'openrouter/glm-5.3-flash', provider: 'openrouter', model: 'glm-5.3-flash', billed: 10 }] }]
  const hourTotalsList = [{ hour: 9, calls: 1, billed: 10 }]
  hookValues = []
  let hourlyChart = render(barsElement.type, { hourModels: hourModelList, byHour: hourTotalsList, colorOf: () => '#000' })
  const hourlyHits = walkAll(hourlyChart, (node) => node.props && node.props.className === 'dshus-hour-hit')
  hourlyHits[0].props.onMouseMove({ clientX: 100, clientY: 50 })
  hourlyChart = render(barsElement.type, { hourModels: hourModelList, byHour: hourTotalsList, colorOf: () => '#000' })
  const hourlyTip = walk(hourlyChart, (node) => node.props && node.props.className === 'dshus-tip dshus-chart-tip')
  assert.match(textOf(hourlyTip), /openrouter · glm-5\.3-flash/)
})
