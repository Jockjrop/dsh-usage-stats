import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const desktopBridge = { protocolVersion: 1, deviceInfo() {} }

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

test('control page confirms automatic billing, persists visibility and validates templates before activation', async () => {
  let plugin, section, hookIndex = 0, hooks, effects = []
  const stores = new Map(), requests = []
  let settings = { autoQuota: false, intervalMinutes: 60, showModelDetails: true, customQueries: [] }
  const template = { url: 'https://api.deepseek.com/user/balance', method: 'GET', auth: 'provider', response: { rows: 'balance_infos', metrics: [{ label: '余额', kind: 'amount', remaining: 'total_balance', currency: 'CNY' }] } }
  const gatewayTemplate = { url: 'http://127.0.0.1:9000/balance', method: 'GET', auth: 'provider', response: { metrics: [{ label: '余额', kind: 'amount', remaining: 'data.balance' }] } }
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } } },
    useState(initial) { const index = hookIndex++, current = hooks; if (!(index in current)) current[index] = initial; return [current[index], (value) => { current[index] = typeof value === 'function' ? value(current[index]) : value }] },
    useRef(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index] },
    useEffect(callback) { effects.push(callback) },
  }
  const context = {
    window: { dshDesktop: desktopBridge, localStorage: { getItem: () => null }, __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } } },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } },
    console, URLSearchParams,
    fetch: async (url, options) => {
      requests.push({ url, options })
      let body
      if (url.endsWith('/controls')) {
        if (options.method === 'POST') {
          const patch = JSON.parse(options.body)
          if (patch.action === 'save-query') settings.customQueries = settings.customQueries.filter((query) => query.provider !== patch.provider).concat({ provider: patch.provider, template: patch.template })
          else if (patch.action === 'remove-query') settings.customQueries = settings.customQueries.filter((query) => query.provider !== patch.provider)
          else for (const key of ['autoQuota', 'intervalMinutes', 'showModelDetails']) if (key in patch) settings[key] = patch[key]
        }
        body = { ok: true, settings: structuredClone(settings) }
      } else if (url.endsWith('/quota-providers')) body = { ok: true, providers: [
        { provider: 'deepseek', name: 'DeepSeek', template, hasBuiltinQuery: true },
        { provider: 'gateway', name: '本地网关', template: gatewayTemplate, hasBuiltinQuery: false },
        { provider: 'workbuddy', name: 'WorkBuddy', queryType: 'adapter', source: 'workbuddy', template: null, hasBuiltinQuery: true, description: '使用已启用的 WorkBuddy Connect 插件读取积分。' },
      ] }
      else if (url.endsWith('/quota-test')) body = { ok: true, testId: 'success', quota: { name: 'DeepSeek', metrics: [{ label: '余额', kind: 'amount', remaining: 3.5, currency: 'CNY' }] } }
      else if (url.endsWith('/workbuddy?fresh=1')) body = { ok: true, available: true, status: 'signed-in', credits: { total: 8 } }
      else body = { ok: true, totals: null, byDay: [], byModel: [] }
      return { ok: true, json: async () => body }
    },
  }
  vm.runInNewContext(readFileSync(new URL('../src/client.js', import.meta.url), 'utf8'), context)
  plugin.apply({ get: () => ({ inject: (_name, callback) => callback(), register: (_meta, render) => { section = render({}); return () => {} } }), effect: (callback) => callback() })
  const render = (type, props) => { hooks = stores.get(type) || []; stores.set(type, hooks); hookIndex = 0; effects = []; return type(props) }
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  let page = render(section.type, section.props)
  assert.match(textOf(page), /模型明细与分布/)
  effects[1]() // Load controls without querying any account.
  await settle()
  page = render(section.type, section.props)
  walk(page, (node) => node.props?.id === 'dshus-tab-control').props.onClick()
  const controlElement = () => walk(render(section.type, section.props), (node) => node.type?.name === 'ControlsPanel')
  const renderControl = () => { const element = controlElement(); return render(element.type, element.props) }
  let panel = renderControl()
  effects[0]()
  await settle()
  panel = renderControl()
  const auto = walk(panel, (node) => node.props?.role === 'switch' && node.props['aria-label'] === '自动获取剩余余额')
  assert.equal(auto.props['aria-checked'], false)
  auto.props.onClick()
  panel = renderControl()
  assert.match(textOf(panel), /可能会消耗少量余额/)
  assert.equal(requests.filter((request) => request.options.method === 'POST').length, 0)
  walk(panel, (node) => node.type === 'button' && textOf(node) === '取消').props.onClick()
  assert.equal(walk(renderControl(), (node) => node.props?.['aria-label'] === '自动查询费用提醒'), null)
  walk(renderControl(), (node) => node.props?.['aria-label'] === '自动获取剩余余额').props.onClick()
  walk(renderControl(), (node) => node.type === 'button' && textOf(node) === '确认开启').props.onClick()
  await settle()
  assert.equal(settings.autoQuota, true)
  assert.equal(JSON.parse(requests.find((request) => request.options.method === 'POST').options.body).acknowledgeCost, true)
  panel = renderControl()
  const interval = walk(panel, (node) => node.props?.id === 'dshus-auto-interval')
  assert.deepEqual(walkAll(interval, (node) => node.type === 'option').map(textOf), ['10 分钟', '1 小时', '5 小时', '每天'])
  interval.props.onChange({ target: { value: '300' } })
  await settle()
  assert.equal(settings.intervalMinutes, 300)
  panel = renderControl()
  // The explanatory小字 are gone from the 控制 tab, so the select itself has to
  // carry the state: the chosen value is the one the user reads back.
  const settledInterval = walk(panel, (node) => node.props?.id === 'dshus-auto-interval')
  assert.equal(settledInterval.props.value, 300, 'the select reflects the saved interval')
  assert.equal(
    textOf(walkAll(settledInterval, (node) => node.type === 'option').find((option) => option.props.value === 300)),
    '5 小时',
    'the selected option spells the interval out in words',
  )
  walk(panel, (node) => node.props?.role === 'switch' && node.props['aria-label'] === '模型明细与分布').props.onClick()
  await settle()
  page = render(section.type, section.props)
  walk(page, (node) => node.props?.id === 'dshus-tab-usage').props.onClick()
  assert.doesNotMatch(textOf(render(section.type, section.props)), /模型明细与分布/)
  walk(render(section.type, section.props), (node) => node.props?.id === 'dshus-tab-control').props.onClick()
  panel = renderControl()
  const renderPicker = () => { const element = walk(renderControl(), (node) => node.type?.name === 'ProviderPicker'); return render(element.type, element.props) }
  const providerOptionsOf = () => {
    let picker = renderPicker()
    const trigger = walk(picker, (node) => node.props?.role === 'combobox')
    if (!trigger.props['aria-expanded']) { trigger.props.onClick(); picker = renderPicker() }
    return walkAll(picker, (node) => node.props?.role === 'option')
  }
  const optionFor = (id) => providerOptionsOf().find((option) => option.props['data-value'] === id)
  const choose = (id) => optionFor(id).props.onClick()
  const hasDot = (option) => !!walk(option, (node) => node.props?.className === 'dshus-provider-dot')
  choose('deepseek')
  panel = renderControl()
  // One label per provider. The select used to append the id, so a provider whose
  // display name equals its id rendered twice ("google · google").
  const providerOptions = providerOptionsOf()
  assert.ok(providerOptions.length > 1, 'the provider select must list providers')
  for (const option of providerOptions) {
    const label = textOf(option)
    if (!label) continue // the "choose a provider" placeholder is intentionally blank-valued
    if (label === '选择已有供应商' || label === '正在加载供应商…') continue
    assert.doesNotMatch(label, /·/, 'the provider option must not repeat name and id: ' + label)
  }
  const selectedLabel = providerOptions.find((option) => option.props['data-value'] === 'deepseek')
  assert.ok(selectedLabel, 'the configured provider must be offered')
  assert.equal(textOf(selectedLabel).trim(), 'DeepSeek', 'the provider label has no emoji or repeated id')
  assert.equal(hasDot(selectedLabel), true, 'the built-in query has a separate status dot')
  assert.equal(selectedLabel.props.children[1].props.className, 'dshus-provider-dot', 'the dot follows the name at the end of the row')
  assert.equal(selectedLabel.props.title, '内置供应商查询')
  assert.equal(hasDot(providerOptions.find((option) => option.props['data-value'] === 'gateway')), false, 'a generic template is not marked as an existing query')
  assert.match(walk(panel, (node) => node.type === 'textarea').props.value, /api.deepseek.com/)
  assert.equal(walk(panel, (node) => node.type === 'button' && textOf(node) === '确认并显示').props.disabled, true)
  walk(panel, (node) => node.type === 'button' && textOf(node) === '测试查询').props.onClick()
  await settle()
  panel = renderControl()
  assert.match(textOf(panel), /测试成功.*DeepSeek.*¥3.5/s)
  assert.equal(walk(panel, (node) => node.type === 'button' && textOf(node) === '确认并显示').props.disabled, false)
  walk(panel, (node) => node.type === 'textarea').props.onChange({ target: { value: '{broken' } })
  panel = renderControl()
  assert.equal(walk(panel, (node) => node.type === 'button' && textOf(node) === '确认并显示').props.disabled, true)
  walk(panel, (node) => node.type === 'button' && textOf(node) === '测试查询').props.onClick()
  panel = renderControl()
  assert.match(textOf(panel), /模板不是有效 JSON/)
  // The failure must be reported inside the query module, not at the top of the
  // page, so it stays next to the controls that produced it while scrolling.
  const queryModule = walkAll(panel, (node) => node.props && node.props.className === 'dshus-module')
    .find((node) => /配额查询/.test(textOf(node)))
  assert.ok(queryModule, 'the query module must be rendered')
  const alertInside = walkAll(queryModule, (node) => node.props && node.props.className === 'dshus-error')
  assert.equal(alertInside.length, 1, 'the query error belongs inside the query module')
  assert.match(textOf(alertInside[0]), /模板不是有效 JSON/)
  // And nowhere else: a query failure must not also appear above the modules.
  const allAlerts = walkAll(panel, (node) => node.props && node.props.className === 'dshus-error')
  assert.equal(allAlerts.length, 1, 'the query error must be rendered once, inside the module')
  assert.equal(textOf(allAlerts[0]), textOf(alertInside[0]))
  panel = renderControl()
  walk(panel, (node) => node.type === 'button' && textOf(node) === '重置模板').props.onClick()
  const customTemplate = structuredClone(template)
  customTemplate.response.metrics[0].label = '我的余额'
  walk(renderControl(), (node) => node.type === 'textarea').props.onChange({ target: { value: JSON.stringify(customTemplate, null, 2) } })
  walk(renderControl(), (node) => node.type === 'button' && textOf(node) === '测试查询').props.onClick()
  await settle()
  walk(renderControl(), (node) => node.type === 'button' && textOf(node) === '确认并显示').props.onClick()
  await settle()
  assert.equal(settings.customQueries[0].provider, 'deepseek')
  assert.match(textOf(renderControl()), /已启用的自定义查询/)
  const editor = () => walk(renderControl(), (node) => node.type === 'textarea')
  assert.equal(optionFor('deepseek').props.title, '已保存自定义查询')
  choose('gateway')
  assert.deepEqual(JSON.parse(editor().props.value), gatewayTemplate)
  choose('deepseek')
  assert.deepEqual(JSON.parse(editor().props.value), customTemplate, 'saved code takes priority over the built-in query')
  choose('gateway')
  const customGateway = { ...gatewayTemplate, url: 'http://127.0.0.1:9000/quota' }
  editor().props.onChange({ target: { value: JSON.stringify(customGateway, null, 2) } })
  assert.equal(hasDot(optionFor('gateway')), false, 'an unsaved draft has no marker')
  walk(renderControl(), (node) => node.type === 'button' && textOf(node) === '测试查询').props.onClick()
  await settle()
  walk(renderControl(), (node) => node.type === 'button' && textOf(node) === '确认并显示').props.onClick()
  await settle()
  assert.equal(hasDot(optionFor('gateway')), true, 'saving adds the marker immediately')
  choose('deepseek')
  choose('gateway')
  assert.deepEqual(JSON.parse(editor().props.value), customGateway)
  const remove = (id) => walk(walk(renderControl(), (node) => node.props?.className === 'dshus-saved-query' && node.props.key === id), (node) => node.type === 'button' && textOf(node) === '移除').props.onClick()
  remove('gateway')
  await settle()
  assert.equal(hasDot(optionFor('gateway')), false, 'removing the only existing query clears the marker')
  remove('deepseek')
  await settle()
  assert.equal(hasDot(optionFor('deepseek')), true, 'the built-in query stays marked after removing an override')
  assert.equal(optionFor('deepseek').props.title, '内置供应商查询')
  choose('deepseek')
  assert.deepEqual(JSON.parse(editor().props.value), template)
  choose('workbuddy')
  assert.equal(hasDot(optionFor('workbuddy')), true)
  assert.equal(optionFor('workbuddy').props.title, '内置扩展查询')
  panel = renderControl()
  // The provider's descriptive line was part of the removed explanatory小字; the
  // adapter row is identified by its own action plus the picker's status dot.
  assert.doesNotMatch(textOf(panel), /WorkBuddy Connect.*读取积分/, 'provider prose is not repeated under the picker')
  assert.equal(editor(), null, 'local adapters have a direct query action, with no pretend HTTP template')
  const before = requests.filter((request) => request.url.endsWith('/workbuddy?fresh=1')).length
  walk(panel, (node) => node.type === 'button' && textOf(node) === '查询配额').props.onClick()
  await settle()
  assert.equal(requests.filter((request) => request.url.endsWith('/workbuddy?fresh=1')).length, before + 1)
  assert.match(textOf(renderControl()), /查询已更新/)
  assert.equal(settings.customQueries.length, 0, 'querying an adapter must not save a custom HTTP query')
})

test('provider picker keeps keyboard focus and scrolling local, and tabs restore the host scrollport', () => {
  let plugin, section, hooks, hookIndex = 0, effects = []
  const stores = new Map(), documentEvents = new Map(), windowEvents = new Map()
  const port = { parentElement: null, style: { scrollbarGutter: 'auto' }, scrollTop: 275, getBoundingClientRect: () => ({ top: 0, bottom: 420 }) }
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } } },
    useState(initial) { const index = hookIndex++, current = hooks; if (!(index in current)) current[index] = initial; return [current[index], value => { current[index] = typeof value === 'function' ? value(current[index]) : value }] },
    useRef(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index] },
    useEffect(callback) { effects.push(callback) },
  }
  vm.runInNewContext(readFileSync(new URL('../src/client.js', import.meta.url), 'utf8'), {
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
  walk(page, node => node.props?.id === 'dshus-tab-control').props.onClick()
  assert.equal(port.scrollTop, 0, 'switching away from a long tab resets its old scroll offset')
  page = render(section.type, section.props)
  const panel = walk(page, node => node.type?.name === 'ControlsPanel')
  const pickerElement = walk(render(panel.type, panel.props), node => node.type?.name === 'ProviderPicker')
  const options = [
    { value: '', name: '选择已有供应商' }, { value: 'google', name: 'Google' }, { value: 'gorouter', name: 'Gorouter' },
    { value: 'tokenbom', name: 'Tokenbom', source: '已保存自定义查询' }, { value: 'tokenbom2', name: 'Tokenbom2' },
    ...Array.from({ length: 15 }, (_, i) => ({ value: 'other-' + i, name: 'Other ' + i })),
  ]
  const chosen = []
  const props = { id: 'picker', labelId: 'label', value: '', disabled: false, options, onChange(value) { chosen.push(value); props.value = value } }
  const renderPicker = () => render(pickerElement.type, props)
  let tree = renderPicker()
  tree.props.ref.current = { parentElement: port, getBoundingClientRect: () => ({ top: 280, bottom: 314 }), closest: () => null, contains: target => target === 'inside' }
  const trigger = () => walk(tree, node => node.props?.role === 'combobox')
  const key = value => {
    const event = { key: value, prevented: false, stopped: false, preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true } }
    trigger().props.onKeyDown(event); tree = renderPicker(); return event
  }
  trigger().props.onClick(); tree = renderPicker()
  const list = walk(tree, node => node.props?.role === 'listbox')
  assert.match(list.props.className, /above/, 'the menu flips above near the scrollport bottom')
  const menu = { scrollTop: 0, clientHeight: 70, children: options.map((_, i) => ({ offsetTop: 4 + i * 34, offsetHeight: 34 })), contains: target => target === menu }
  list.props.ref.current = menu
  port.scrollTop = 135
  assert.equal(key('End').prevented, true)
  assert.equal(trigger().props['aria-activedescendant'], 'picker-list-19')
  effects[1]()
  assert.ok(menu.scrollTop > 0, 'keyboard navigation reveals the last row within the menu')
  assert.equal(port.scrollTop, 135, 'keyboard navigation must not scroll the settings pane')
  assert.equal(key('Escape').stopped, true, 'Escape closes the menu without closing the host modal')
  assert.equal(trigger().props['aria-expanded'], false)
  assert.deepEqual(chosen, [], 'navigation and Escape do not change the provider')
  key('t'); assert.equal(trigger().props['aria-activedescendant'], 'picker-list-3')
  key('o'); assert.equal(trigger().props['aria-activedescendant'], 'picker-list-3', 'continuing a prefix keeps its current match')
  key('Enter'); assert.deepEqual(chosen, ['tokenbom'])
  key('g'); assert.equal(trigger().props['aria-activedescendant'], 'picker-list-1', 'a new selection starts a fresh typeahead search')
  key('g'); assert.equal(trigger().props['aria-activedescendant'], 'picker-list-2', 'repeated initials cycle through matching providers')
  key('Tab'); assert.equal(trigger().props['aria-expanded'], false)
  key('ArrowDown')
  const removeListeners = effects[0]()
  documentEvents.get('scroll')({ target: menu }); tree = renderPicker()
  assert.equal(trigger().props['aria-expanded'], true, 'scrolling the menu leaves it open')
  documentEvents.get('pointerdown')({ target: 'outside' }); tree = renderPicker()
  assert.equal(trigger().props['aria-expanded'], false, 'clicking outside dismisses the menu')
  removeListeners()
  assert.equal(documentEvents.size + windowEvents.size, 0, 'dismissal listeners are cleaned up')
  key('ArrowDown'); props.disabled = true; tree = renderPicker()
  walk(tree, node => node.props?.role === 'option' && node.props['data-value'] === 'google').props.onClick()
  assert.deepEqual(chosen, ['tokenbom'], 'disabled rows cannot select while their menu is closing')
  effects[2](); tree = renderPicker(); key('ArrowDown')
  assert.equal(trigger().props['aria-expanded'], false)
  restoreScrollport()
  assert.equal(port.style.scrollbarGutter, 'auto', 'unmounting restores the host scrollbar setting')
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
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
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

test('control panel fields and switches follow the theme background', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  // Inputs, textareas and selects must resolve a themed surface, not a hard white one.
  assert.match(source, /\.dshus-field \{[^}]*background: var\(--dsw-alias-bg-layer-2/)
  assert.match(source, /\.dshus-field option \{[^}]*background: var\(--dsw-alias-bg-layer-2/)
  // The native popup must be allowed to follow the active scheme.
  assert.match(source, /\.dshus-field \{[^}]*color-scheme: inherit/)
})

test('the 控制 tab drops its explanatory小字 and styles the interval select itself', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = source.match(new RegExp(escaped + '[^{}]*\\{([^}]*)\\}'))
    assert.ok(m, 'missing rule for ' + selector)
    return m[1]
  }

  // The four rows used to carry a second grey line each; the settings module must
  // render labels only, so a re-added <p className="dshus-setting-help"> fails here.
  const settingsModule = source.slice(source.indexOf('自动获取剩余余额'), source.indexOf('配额查询'))
  assert.doesNotMatch(settingsModule, /dshus-setting-help/, 'the 控制 rows carry no explanatory小字')
  for (const gone of ['默认关闭。配额页读取缓存', '每天为每 24 小时', '在用量页显示模型分布图', '用宽轨道滑条替换输入框']) {
    assert.ok(!source.includes(gone), 'removed help text must not come back: ' + gone)
  }

  // The interval control owns its own look instead of inheriting the UA widget.
  const select = rule('.dshus-select')
  assert.match(select, /appearance:\s*none/, 'the native arrow must be suppressed before restyling')
  assert.match(select, /background-image:\s*url\("' \+ selectChevronMask \+ '"\)/, 'a hand-placed chevron replaces the platform arrow')
  assert.match(select, /background-position:\s*right 11px center/)
  // The chevron itself must be a real SVG data URI, painted in currentColor so it
  // follows the field colour in either theme.
  assert.match(source, /var selectChevronMask = 'data:image\/svg\+xml,'/, 'the chevron is a data URI, not an external asset')
  assert.match(source, /selectChevronMask = [^\n]*stroke="currentColor"/, 'the chevron inherits the field colour')
  // Sized to the same 34px rhythm as the provider picker trigger.
  assert.match(select, /min-height:\s*34px/)
  assert.match(rule('.dshus-query-select'), /min-height:\s*34px/)
  // Disabled swaps to a normal cursor and drops the chevron rather than dimming a button.
  assert.match(rule('.dshus-select:disabled'), /cursor:\s*default/)
  assert.match(rule('.dshus-select:disabled'), /background-image:\s*none/)
})

test('the template editor offers a copyable AI prompt and keeps the cost warning last', async () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('function buildTemplatePrompt(')
  const end = source.indexOf('\n    }', start)
  assert.ok(start >= 0 && end > start, 'the prompt builder must exist')
  const buildTemplatePrompt = new Function(source.slice(start, end + 6) + '; return buildTemplatePrompt')()

  // The prompt has to describe the schema the host actually validates, or the
  // assistant produces a template that the 测试查询 button then rejects.
  const prompt = buildTemplatePrompt({ provider: 'sapi', name: 'SAPI', template: { url: 'https://sapi.nyro.lol/v1/balance', method: 'GET', auth: 'provider' } })
  for (const field of ['url', 'method', 'auth', 'headers', 'body', 'response.rows', 'response.metrics', 'label', 'kind', 'remaining', 'usedPercent', 'remainingPercent', 'currency']) {
    assert.match(prompt, new RegExp(field.replace('.', '\\.')), 'the prompt must document ' + field)
  }
  assert.match(prompt, /SAPI/, 'the prompt names the provider in view')
  assert.match(prompt, /sapi\.nyro\.lol/, 'an existing template is carried into the prompt so the assistant can correct it')
  assert.match(prompt, /只输出一个 JSON 对象/, 'the prompt constrains the reply to a paste-ready object')
  // Search first: the user must not be treated as the default source of the API
  // details. Asking is allowed only as the fallback.
  assert.match(prompt, /请先自己联网搜索「SAPI」/, 'the assistant is told to look the provider up itself')
  assert.match(prompt, /不要一上来就找我要资料/, 'the prompt rules out defaulting to a question')
  assert.match(prompt, /只有在确实查不到/, 'asking is kept as an explicit fallback')
  assert.ok(!/如需接口文档，可参考我提供/.test(prompt), 'the old passive "give me the docs" line must be gone')
  // Method guidance precedes the current-state block, so the assistant reads the
  // search instruction before it sees the provider details.
  assert.ok(prompt.indexOf('请先自己联网搜索') < prompt.indexOf('【当前情况】'), 'search guidance comes before the provider block')
  // With no template loaded the prompt still stands on its own.
  const bare = buildTemplatePrompt({ provider: 'x', name: 'X', template: null })
  assert.match(bare, /从零编写/)
  assert.doesNotMatch(bare, /现有模板/)
  assert.match(bare, /请先自己联网搜索「X」/, 'the search-first rule survives the no-template case')

  // The warning must sit after the buttons, since those are what spend balance.
  // Scope to the template block: both labels appear elsewhere in the file first.
  const block = source.slice(source.indexOf('dshus-query-template'), source.indexOf('已启用的自定义查询'))
  const testButton = block.indexOf("'测试查询'")
  const confirmButton = block.indexOf("'确认并显示'")
  const costNote = block.indexOf('dshus-cost-note')
  assert.ok(testButton >= 0 && confirmButton >= 0, 'both action buttons live in the template block')
  assert.ok(costNote > testButton && costNote > confirmButton, 'the cost warning follows both action buttons')
  assert.match(block, /测试会发起一次请求，可能消耗少量余额/)
  // The old prose block is gone for good: the schema is documented in the prompt.
  assert.ok(!source.includes('dshus-query-help'), 'the inline schema paragraph is replaced by the prompt')
  assert.ok(!source.includes('url 为查询地址'))

  // The prompt body must be selectable and must not be clipped, so it can be
  // copied by hand whenever the clipboard API is unavailable.
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = source.match(new RegExp(escaped + '[^{}]*\\{([^}]*)\\}'))
    assert.ok(m, 'missing rule for ' + selector)
    return m[1]
  }
  assert.match(rule('.dshus-prompt-body'), /user-select:\s*text/)
  assert.match(rule('.dshus-prompt-body'), /overflow:\s*auto/)
  assert.match(rule('.dshus-prompt-body'), /white-space:\s*pre-wrap/)
})

test('switch on and off states stay distinguishable in either theme', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
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
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
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
  vm.runInNewContext(readFileSync(new URL('../src/client.js', import.meta.url), 'utf8'), context)
  plugin.apply({
    get: () => ({ inject: () => () => {} }),
    effect(callback) { cleanups.push(callback()) },
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
  const tz = new Date().getTimezoneOffset()
  const today = new Date(Date.now() - tz * 60000).toISOString().slice(0, 10)
  const olderDay = new Date(Date.now() - tz * 60000 - 200 * 86400000).toISOString().slice(0, 10)
  const olderOrdinal = Date.parse(olderDay + 'T00:00:00Z') / 86400000
  const olderWeekMate = new Date((olderOrdinal + (new Date(olderOrdinal * 86400000).getUTCDay() === 1 ? 1 : -1)) * 86400000).toISOString().slice(0, 10)
  const statsBody = {
    ok: true, stale: false, tz, days: 0,
    totals: { billed: 140 },
    overview: { todayBilled: 30, usedDays: 12, totalBilled: 427684351, models: [
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
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  vm.runInNewContext(source, context, { filename: 'client.js' })
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
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  const firstStatsRequest = requests.find((url) => url.includes('/stats'))
  assert.equal(new URL(firstStatsRequest, 'http://localhost').searchParams.get('tz'), String(new Date().getTimezoneOffset()))
  assert.equal(new URL(firstStatsRequest, 'http://localhost').searchParams.get('days'), null) // API default is all history
  page = render(section.type, section.props)
  const topHeader = walk(page, (node) => node.props && node.props.className === 'dshus-head')
  assert.equal(walkAll(topHeader, (node) => node.type === 'button' && ['7天', '30天', '1年', '全部'].includes(textOf(node))).length, 0)
  const usageRefresh = walk(topHeader, (node) => node.type === 'button' && node.props?.['aria-label'] === '刷新用量统计')
  assert.ok(usageRefresh)
  assert.equal(walk(usageRefresh, (node) => node.type === 'svg')?.type, 'svg')
  const initialTabs = walkAll(page, (node) => node.props && node.props.role === 'tab')
  assert.deepEqual(initialTabs.map(textOf), ['用量', '配额', '控制'])
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
  assert.match(textOf(overviewCards), /30 今日tokens数.*12 使用天数.*4\.28亿 累计tokens数/s)
  assert.doesNotMatch(textOf(overviewCards), /最常使用模型/)
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
  // The calendar itself is now a bare grid: paging was lifted into the header,
  // so no arrow may be rendered inside the Heatmap subtree.
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
  // The colour scale replaced the old 累计总量 caption and is part of the heatmap.
  const heatLegend = walk(heat, (node) => node.props && node.props.className === 'dshus-heat-legend')
  assert.ok(heatLegend, 'the heatmap must render its colour legend')
  assert.equal(walkAll(heatLegend, (node) => node.props && node.props.className === 'dshus-heat-legend-cell').length, 4)
  assert.match(textOf(heatLegend), /少.*多/s)
  hookValues = sectionHooks

  // The 累计总量 caption is gone from the card header, and the header pager took
  // its place next to the 每日/每周 switch.
  const heatModule = walkAll(page, (node) => node.props && node.props.className === 'dshus-module')[2]
  const heatHeading = walk(heatModule, (node) => node.type === 'h3')
  assert.doesNotMatch(textOf(heatHeading), /累计总量/)
  assert.equal(walk(heatHeading, (node) => node.props && node.props.className === 'dshus-heat-total-label'), null)
  // The rendered calendar is where a resurrected 累计总量 caption would appear
  // (the page tree only holds the Heatmap element, not its output).
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
    // Paging is controlled from the header now; step the page index by hand.
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

  const wbElement = walk(page, (node) => node.type && node.type.name === 'WorkBuddyPanel' && node.props.source !== 'workbuddy-ai')
  const wbAiElement = walk(page, (node) => node.type && node.type.name === 'WorkBuddyPanel' && node.props.source === 'workbuddy-ai')
  assert.ok(wbAiElement, 'the quota page includes a separate WorkBuddy AI card')
  for (const [status, label] of [['unqueried', '未查询'], ['signed-out', '未登录'], ['unavailable', '未获取']]) {
    hookValues = []
    const statusApi = { workbuddyStatus: async () => ({ ok: true, available: true, status }) }
    render(wbElement.type, { api: statusApi })
    effects[0]()
    await new Promise((resolve) => setImmediate(resolve))
    const placeholder = render(wbElement.type, { api: statusApi })
    assert.match(textOf(placeholder), new RegExp('WorkBuddy.*' + label, 's'))
    assert.doesNotMatch(textOf(placeholder), /0\.00|剩余积分合计|NaN/)
  }
  hookValues = []
  assert.equal(render(wbElement.type, { api: { workbuddyStatus: async () => ({ status: 'signed-out' }) } }), null)
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(render(wbElement.type, { api: {} }), null)

  hookValues = []
  assert.equal(render(wbElement.type, { api: { workbuddyStatus: async () => ({
    status: 'signed-in',
    syncedAt: Date.UTC(2026, 4, 6, 7, 8),
    credits: { total: 12, accounts: [] },
    models: [
      { id: 'free', name: '免费模型', free: true, credits: 0 },
      { id: 'discount', name: '夜间优惠模型', badges: ['夜间折扣'], credits: 0.79 },
      { id: 'standard', name: '普通模型', badges: [], credits: 0.05 },
    ],
  }) } }), null)
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  const workbuddyPanel = render(wbElement.type, { api: {} })
  const workbuddyContent = textOf(workbuddyPanel)
  assert.match(workbuddyContent, /剩余积分合计/)
  assert.match(workbuddyContent, /模型优惠.*免费模型.*夜间优惠模型/s)
  assert.doesNotMatch(workbuddyContent, /普通模型/)
  // The WorkBuddy board carries the last-fetch line too.
  assert.match(textOf(walk(workbuddyPanel, (node) => node.props?.className === 'dshus-fetched')), /^上次获取时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)

  hookValues = []
  const aiRequests = []
  const aiApi = { workbuddyStatus: async (opts) => {
    aiRequests.push({ ...opts })
    return { ok: true, available: true, status: 'signed-in', credits: { total: 130, accounts: [
      { packageName: 'AI 体验套餐', remain: 10, size: 20 },
      { packageName: 'AI 月套餐', remain: 120, size: 150 },
    ] }, models: [] }
  } }
  assert.equal(render(wbAiElement.type, { ...wbAiElement.props, api: aiApi }), null)
  effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  const aiPanel = render(wbAiElement.type, { ...wbAiElement.props, api: aiApi })
  assert.equal(textOf(walk(aiPanel, (node) => node.type === 'h3')), 'WorkBuddy AI')
  assert.match(textOf(aiPanel), /剩余积分合计.*130.*AI 体验套餐.*50%.*AI 月套餐.*80%/s)
  assert.deepEqual(aiRequests, [{ fresh: false, source: 'workbuddy-ai' }])
  walk(aiPanel, (node) => node.props?.['aria-label'] === '刷新 WorkBuddy AI 账号与积分').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(aiRequests[1], { fresh: true, source: 'workbuddy-ai' })
  await wbAiElement.props.api.workbuddyStatus({ fresh: true, source: 'workbuddy-ai' })
  assert.ok(requests.includes('/api/dsh-usage-stats/workbuddy-ai?fresh=1'), 'the international card uses its own host cache endpoint')

  hookValues = sectionHooksOnQuota
  walk(page, (node) => node.props && node.props.id === 'dshus-tab-usage').props.onClick()
  page = render(section.type, section.props)
  assert.equal(walk(page, (node) => node.props && node.props.id === 'dshus-tab-usage').props['aria-selected'], true)
  assert.equal(walk(page, (node) => node.type && node.type.name === 'OpencodePanel'), null)
  assert.equal(walk(page, (node) => node.type && node.type.name === 'ProviderQuotasPanel'), null)
  assert.equal(walk(page, (node) => node.type && node.type.name === 'WorkBuddyPanel'), null)
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

test('the saved model seat switch takes effect at startup without opening settings', async () => {
  for (const scenario of [
    { cached: null, host: true, immediate: false, settled: true },
    { cached: '1', host: false, immediate: true, settled: false },
    { cached: null, host: true, immediate: false, settled: false, retry: true },
  ]) {
    let plugin, resolveControls
    let modelsReady = !scenario.retry
    const scheduled = []
    const cache = new Map()
    if (scenario.cached !== null) cache.set('dsh-usage-stats-advanced-model-select', scenario.cached)
    const localStorage = { getItem: (key) => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) }
    const styles = new Map(), entries = []
    const slots = {
      inject: (_name, callback) => { callback(); return () => {} },
      register: (meta) => {
        entries.push(meta)
        return () => { const at = entries.indexOf(meta); if (at >= 0) entries.splice(at, 1) }
      },
    }
    const controls = new Promise((resolve) => { resolveControls = resolve })
    vm.runInNewContext(readFileSync(new URL('../src/client.js', import.meta.url), 'utf8'), {
      window: { dshDesktop: desktopBridge, localStorage, __ModuleLoader__: { load(definition) { plugin = definition.factory(() => ({ createElement() {} })) } } },
      localStorage,
      document: {
        getElementById: (id) => styles.get(id) || null,
        createElement: () => ({ dataset: {}, remove() { styles.delete(this.id) } }),
        head: { appendChild(style) { styles.set(style.id, style) } },
      },
      console: { warn() {} }, URLSearchParams,
      fetch: () => controls,
    })
    plugin.apply({
      get: (name) => name === 'slots' ? slots : name === 'modelDirectories' ? (modelsReady ? { directoryFor: () => ({}) } : undefined) : name === 'sessions' ? { subagentAddress: () => undefined } : undefined,
      effect: (callback) => callback(),
      timeout: (callback) => { scheduled.push(callback); return () => {} },
    })
    const seatCount = () => entries.filter((entry) => entry.name === 'conversation.input.model').length
    assert.equal(seatCount(), Number(scenario.immediate), 'cached true mounts before the controls request settles')
    resolveControls({ ok: true, json: async () => ({ ok: true, settings: { advancedModelSelect: scenario.host } }) })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(seatCount(), Number(scenario.settled), 'the host setting corrects the startup hint without visiting settings')
    if (scenario.retry) {
      modelsReady = true
      assert.equal(scheduled.length, 1, 'the seat retries while the official model service is starting')
      scheduled.shift()()
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(seatCount(), 1, 'the seat mounts when the model service becomes available')
    }
    assert.equal(cache.get('dsh-usage-stats-advanced-model-select'), scenario.host ? '1' : '0')
  }
})

test('the 高级模型选择器 switch is opt-in: the seat only shadows the official selector when it is on', async () => {
  let plugin, hooks, hookIndex = 0, effects = []
  const stores = new Map(), requests = [], styles = new Map()
  let settings = { autoQuota: false, intervalMinutes: 60, showModelDetails: true, advancedModelSelect: false, customQueries: [] }
  // A slot host honest enough to prove shadowing: entries are stored per slot
  // name and the returned disposer really removes them, so the test can observe
  // the seat appearing and disappearing as the switch flips.
  const seatEntries = []
  const slots = {
    inject: (_name, callback) => { callback(); return () => {} },
    register: (meta, render) => {
      seatEntries.push({ meta, render })
      return () => { const index = seatEntries.findIndex((entry) => entry.meta === meta); if (index >= 0) seatEntries.splice(index, 1) }
    },
  }
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } } },
    useState(initial) { const index = hookIndex++, current = hooks; if (!(index in current)) current[index] = initial; return [current[index], (value) => { current[index] = typeof value === 'function' ? value(current[index]) : value }] },
    useRef(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index] },
    useEffect(callback) { effects.push(callback) },
  }
  const directory = { store: {}, load: async () => {}, select: async () => {} }
  // A real session resolves to undefined; a subagent session resolves to its
  // parent address, which is what makes the official selector hide the seat.
  const parentSession = 'subagent-session'
  vm.runInNewContext(readFileSync(new URL('../src/client.js', import.meta.url), 'utf8'), {
    window: { dshDesktop: desktopBridge, localStorage: { getItem: () => null, setItem() {} }, __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } } },
    document: {
      getElementById: (id) => styles.get(id) || null,
      createElement: () => ({ dataset: {}, remove() { styles.delete(this.id) } }),
      head: { appendChild(style) { styles.set(style.id, style) } },
    },
    console, URLSearchParams,
    fetch: async (url, options = {}) => {
      requests.push({ url, options })
      if (url.endsWith('/controls')) {
        if (options.method === 'POST') {
          const patch = JSON.parse(options.body)
          for (const key of ['autoQuota', 'intervalMinutes', 'showModelDetails', 'advancedModelSelect']) if (key in patch) settings[key] = patch[key]
        }
        return { ok: true, json: async () => ({ ok: true, settings: structuredClone(settings) }) }
      }
      return { ok: true, json: async () => ({ ok: true, totals: null, byDay: [], byModel: [] }) }
    },
  })
  const ctx = {
    get: (name) => (name === 'slots' ? slots : name === 'modelDirectories' ? { directoryFor: () => directory } : name === 'sessions' ? { subagentAddress: (sessionId) => (sessionId === parentSession ? 'session-root' : undefined) } : undefined),
    effect: (callback) => { const cleanup = callback(); effects.push(cleanup); return cleanup },
    timeout: (fn, ms) => setTimeout(fn, ms),
  }
  plugin.apply(ctx)
  const seatOf = () => seatEntries.filter((entry) => entry.meta.name === 'conversation.input.model')
  // Opt-in: turning the plugin on must not touch the official selector's slot.
  assert.equal(seatOf().length, 0, 'the seat must stay off until the switch is on')

  const render = (type, props) => { hooks = stores.get(type) || []; stores.set(type, hooks); hookIndex = 0; effects = []; return type(props) }
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  const section = seatEntries.find((entry) => entry.meta.name === 'settings.section')
  assert.ok(section, 'the settings section must still register through the same slot host')
  const sectionProps = section.render({})
  let page = render(sectionProps.type, sectionProps.props)
  effects[1]() // loadControls(): reads the host settings
  await settle()
  page = render(sectionProps.type, sectionProps.props)
  assert.equal(seatOf().length, 0, 'loading controls with the switch off must not register the seat')
  const switchOf = (node) => walk(node, (child) => child.props?.role === 'switch' && child.props['aria-label'] === '高级模型选择器')
  walk(page, (node) => node.props?.id === 'dshus-tab-control').props.onClick()
  const controlElement = () => walk(render(sectionProps.type, sectionProps.props), (node) => node.type?.name === 'ControlsPanel')
  const renderControl = () => { const element = controlElement(); return render(element.type, element.props) }
  let panel = renderControl()
  assert.match(textOf(panel), /高级模型选择器/, 'the switch must be reachable from the 控制 tab')
  assert.equal(switchOf(panel).props['aria-checked'], false, 'the switch reads the host value and starts off')
  switchOf(panel).props.onClick()
  await settle()
  const post = requests.filter((request) => request.options?.method === 'POST').pop()
  assert.deepEqual(JSON.parse(post.options.body), { advancedModelSelect: true })
  assert.equal(settings.advancedModelSelect, true)
  // Now, and only now, exactly one shadowing registration exists.
  assert.equal(seatOf().length, 1, 'enabling the switch registers exactly one seat')
  assert.match(styles.get('dsh-usage-stats-seat-styles')?.textContent || '', /\.rs2-max \.rs2-fill/, 'enabling the seat injects its slider stylesheet')
  assert.equal(seatOf()[0].meta.priority, -1, 'the seat must outrank the official selector')
  assert.equal(seatOf()[0].meta.locale, 'model', 'the seat reuses the official model locale')
  const live = seatOf()[0].meta.inject('session-1')
  assert.equal(live.available, true)
  assert.deepEqual(Object.keys(live).sort(), ['available', 'load', 'select', 'store'])
  assert.equal(await live.select({ provider: 'p', model: 'm' }), true)
  live.load()
  // A subagent session must not render the seat at all. (assert.deepEqual would
  // compare prototypes across the vm realm, so assert the shape here.)
  const subagent = seatOf()[0].meta.inject(parentSession)
  assert.equal(subagent.available, false)
  assert.deepEqual(Object.keys(subagent), ['available'])
  // Turning it back off disposes the registration so the official seat returns.
  panel = renderControl()
  assert.equal(switchOf(panel).props['aria-checked'], true)
  switchOf(panel).props.onClick()
  await settle()
  assert.equal(JSON.parse(requests.filter((request) => request.options?.method === 'POST').pop().options.body).advancedModelSelect, false)
  assert.equal(settings.advancedModelSelect, false)
  assert.equal(seatOf().length, 0, 'disabling the switch must release the slot back to the official selector')
  assert.equal(styles.has('dsh-usage-stats-seat-styles'), false, 'disabling the seat removes its slider stylesheet')
})

test('the slider keeps auto as the lowest stop when a model has no default effort', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  const at = source.indexOf('function seatEffortStops(')
  const end = source.indexOf('\n    }', at)
  assert.ok(at >= 0 && end > at)
  const stopsFor = new Function('seatEffortZh', source.slice(at, end + 6) + '; return seatEffortStops')((id) => id)
  const reasoning = { efforts: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }] }

  assert.deepEqual(stopsFor(reasoning).map((stop) => stop.id), [undefined, 'low', 'medium', 'high'])
  assert.equal(stopsFor(reasoning)[0].label, '自动')
  assert.deepEqual(stopsFor({ ...reasoning, defaultEffort: 'high' }).map((stop) => stop.id), ['low', 'medium', 'high'])
})

test('ordinary efforts keep their dots while the highest effort releases them and streams particles', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('function SeatSlider(props)')
  const end = source.indexOf('function ModelSeat(props)', start)
  assert.ok(start >= 0 && end > start)
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } } },
    useRef(value) { return { current: value } },
  }
  const SeatSlider = new Function('React', 'seatPrand', source.slice(start, end) + '; return SeatSlider')(React, (i, salt) => ((i * 37 + salt * 13) % 97) / 97)
  const render = (value) => SeatSlider({ count: 5, value, onPreview() {}, onCommit() {} })
  const marks = (tree) => walkAll(tree, (node) => node.props?.className?.split(' ').includes('rs2-tick'))
  const shells = (tree) => walkAll(tree, (node) => node.props?.className === 'rs2-tick-shell')
  const particles = (tree) => walkAll(tree, (node) => node.props?.className === 'rs2-stream-dot')

  const ordinary = render(2)
  assert.equal(ordinary.props.className, 'rs2-track')
  assert.equal(marks(ordinary).length, 5)
  assert.equal(shells(ordinary).length, 5)
  assert.equal(particles(ordinary).length, 0, 'ordinary efforts have only stationary stop marks')
  assert.equal(walkAll(ordinary, (node) => node.props?.className === 'rs2-rail').length, 1)

  const highest = render(4)
  assert.equal(highest.props.className, 'rs2-track rs2-max')
  assert.equal(marks(highest).length, 5)
  assert.equal(shells(highest).length, 5, 'the original stop marks themselves become moving particles')
  assert.equal(particles(highest).length, 18, 'full strength receives an additional stream from the right')

  const previews = [], commits = []
  const pointerTrack = SeatSlider({ count: 5, value: 2, onPreview: (value) => previews.push(value), onCommit: (value) => commits.push(value) })
  let measurements = 0
  pointerTrack.props.ref.current = { getBoundingClientRect: () => { measurements++; return { left: 100, width: 380 } } }
  const currentTarget = { setPointerCapture() {}, releasePointerCapture() {} }
  for (const clientX of [114, 466]) {
    const event = { clientX, pointerId: 1, currentTarget, preventDefault() {} }
    pointerTrack.props.onPointerDown(event)
    pointerTrack.props.onPointerMove(event)
    pointerTrack.props.onPointerMove(event)
    pointerTrack.props.onPointerUp(event)
  }
  assert.deepEqual(previews, [0, 4], 'the thumb centers align with the two end stops')
  assert.deepEqual(commits, [0, 4])
  assert.equal(measurements, 2, 'each drag measures the track once and skips duplicate previews')
})

/**
 * Regression guard for the "slider has no color" bug and the max-level palette.
 *
 * The seat's stylesheet used `--dsw-alias-brand-primary` as the slider accent.
 * In this host that alias is a MONOCHROME FOREGROUND token, defined in both
 * themes as a near-neutral:
 *   light -> --dsw-static-neutral-bluish-1000 (#0f1115)
 *   dark  -> --dsw-static-neutral-bluish-50   (#f9fafb)
 * Because it always resolves, the blue fallback beside it is dead code and the
 * fill painted near-white over #6e7174 against a #61666b rest track — an 8/255
 * difference that renders as a flat grey bar. The real accent is
 * `--dsw-alias-brand-primary-new-colorprimary-new-color`.
 */
test('the seat slider paints its fill with the real accent token, never the monochrome brand-primary alias', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

  // The accent must be the -new-color token, and must carry a literal blue
  // fallback: an undefined var() would void the whole gradient.
  const accent = source.match(/var SEAT_ACCENT = '([^']+)'/)
  assert.ok(accent, 'SEAT_ACCENT must be defined as a single-quoted constant')
  assert.match(accent[1], /--dsw-alias-brand-primary-new-colorprimary-new-color/,
    'the accent must use the real brand token')
  assert.match(accent[1], /#4176e6/, 'the accent must keep a literal fallback for hosts without the token')
  assert.match(source, /var SEAT_BLUE = 'color-mix\(in srgb, ' \+ SEAT_ACCENT \+ ' 20%, #0068c8\)'/,
    'the reference blue is mixed with the real host accent')

  // `brand-primary` must not appear with a closing paren (i.e. used as a value)
  // anywhere in the stylesheet. `-brand-primary-new-color...` is a different
  // token and is the only permitted mention.
  const cssStart = source.indexOf('var SEAT_CSS = [')
  const cssEnd = source.indexOf("].join('\\n')", cssStart)
  assert.ok(cssStart > 0 && cssEnd > cssStart, 'SEAT_CSS array literal must be locatable')
  const cssLiteral = source.slice(cssStart, cssEnd)

  const monochromeUses = [...cssLiteral.matchAll(/var\(--dsw-alias-brand-primary\)/g)]
  assert.equal(monochromeUses.length, 0,
    'SEAT_CSS must not use --dsw-alias-brand-primary as a color value: it resolves to a near-neutral in both themes')

  assert.match(cssLiteral, /\.rs2-rail\{[^\n]*border-radius:999px[^\n]*SEAT_TRACK_REST/,
    'the rail keeps rounded ends and a theme-aware neutral rest')
  assert.match(cssLiteral, /\.rs2-fill\{[^\n]*SEAT_BLUE/,
    'the ordinary fill uses the reference blue')
  assert.match(cssLiteral, /\.rs2-fill\{[^\n]*width:calc\(14px \+ \(100% - 28px\) \* var\(--rs2-p,0\)\)/,
    'the lowest fill ends beneath the thumb without a visible blue overflow')
  assert.match(cssLiteral, /\.rs2-max \.rs2-fill\{[^\n]*SEAT_BLUE[^\n]*SEAT_MAX_ACCENT/,
    'the full-strength fill transitions from blue to purple')
  assert.match(cssLiteral, /\.rs2-dot\{[^\n]*width:28px;height:28px;border-radius:50%/,
    'the white thumb is circular and slightly taller than the 24px rail')
  assert.match(cssLiteral, /\.rs2-max \.rs2-tick-shell\{animation:rs2-tick-flight[^\n]*forwards/,
    'all stop marks leave their positions and stay away until full strength ends')
  assert.match(cssLiteral, /\.rs2-stream\{[^\n]*animation:rs2-stream-flight[^\n]*linear infinite/,
    'incoming particles fly continuously across the track')
})

/**
 * Regression guard for the popover surface.
 *
 * Two defects are covered here. First: the seat once painted its popover with
 * `--dsw-alias-bg-overlay`, which reads like the obvious "popover background"
 * but is not — in this theme dark resolves it to --dsw-static-neutral-bluish-700
 * = #61666b, a MID-GREY, and the host stylesheet spends that alias on a single
 * 20x20 badge and never on a menu (the screenshot measured #61666b across the
 * whole panel).
 *
 * Second: the fix for that was an OPAQUE panel. The requested design is the
 * host's own translucent material, so the surface is now a 45%-alpha fill plus a
 * 40px backdrop blur, matching the official popovers (`._material_` inside
 * `MenuSurface`):
 *   background: var(--dsw-menu-surface-fill)        -> #43454a73 dark
 *   backdrop-filter: var(--dsw-menu-backdrop-filter) -> blur(40px) saturate(150%)
 * Because the fill is translucent it must never be paired with an opaque
 * SEAT_SURFACE; that token survives only as the no-backdrop-filter fallback.
 */
test('the seat popover paints the theme material, never the mid-grey bg-overlay alias', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

  const material = source.match(/var SEAT_MATERIAL = '([^']+)'/)
  assert.ok(material, 'SEAT_MATERIAL must be defined as a single-quoted constant')
  assert.match(material[1], /--dsw-menu-surface-fill/,
    'the pane must use the host menu-surface fill token')
  assert.match(material[1], /rgba\(67,69,74,\.45\)/,
    'the pane must keep the measured dark literal as a fallback')

  const blur = source.match(/var SEAT_MATERIAL_BLUR = '([^']+)'/)
  assert.ok(blur, 'SEAT_MATERIAL_BLUR must be defined')
  assert.match(blur[1], /--dsw-menu-backdrop-filter/,
    'the pane must use the host backdrop-filter token')

  const cssStart = source.indexOf('var SEAT_CSS = [')
  const cssEnd = source.indexOf("].join('\\n')", cssStart)
  assert.ok(cssStart > 0 && cssEnd > cssStart, 'SEAT_CSS array literal must be locatable')
  const cssLiteral = source.slice(cssStart, cssEnd)

  // The original defect: --dsw-alias-bg-overlay used as a surface.
  const overlayUses = [...cssLiteral.matchAll(/var\(--dsw-alias-bg-overlay/g)]
  assert.equal(overlayUses.length, 0,
    'SEAT_CSS must not paint with --dsw-alias-bg-overlay: it is #61666b in the dark theme')

  // Both custom properties must be live: the fallback-only case means the pane
  // is not actually translucent in this host.
  assert.ok(/#2c2c2e/.test(source.match(/var SEAT_SURFACE = '([^']+)'/)[1]),
    'SEAT_SURFACE must keep the dark literal for hosts without the layer token')

  // The menu itself must be transparent (the ::before pane paints) and must
  // carry the frosted layer.
  const menuAt = cssLiteral.indexOf('.rs2-menu{')
  assert.ok(menuAt >= 0, 'the .rs2-menu rule must exist')
  const menuRule = cssLiteral.slice(menuAt, cssLiteral.indexOf('\n', menuAt))
  assert.doesNotMatch(menuRule, /background:/,
    'the .rs2-menu box must stay transparent; the ::before layer paints the pane')

  const paneAt = cssLiteral.indexOf('.rs2-menu::before')
  assert.ok(paneAt >= 0, 'the .rs2-menu::before pane rule must exist')
  const paneRule = cssLiteral.slice(paneAt, cssLiteral.indexOf('\n', paneAt))
  assert.match(paneRule, /background:\s*' \+ SEAT_MATERIAL/,
    'the pane must take its fill from SEAT_MATERIAL')
  assert.match(paneRule, /backdrop-filter:\s*' \+ SEAT_MATERIAL_BLUR/,
    'the pane must apply the host backdrop blur')
  // z-index:-1 only stays behind the content if the menu builds a stacking
  // context; without it the pane would cover the rows.
  assert.match(menuRule, /position:absolute/, 'the menu must be positioned')
  assert.match(menuRule, /z-index:\d+/, 'the menu must create a stacking context for the pane')

  // A 45%-alpha pane over nothing is milky, so an opaque fallback is mandatory.
  assert.match(cssLiteral, /@supports not \([\s\S]{0,120}backdrop-filter[\s\S]{0,200}SEAT_SURFACE/,
    'a @supports fallback must restore the opaque surface where blur is unavailable')
})

/**
 * Narrow-screen layout guard.
 *
 * The host composer row measures its children and, when they cannot share a
 * line, sets `data-model-compact`, which flips two inherited custom properties.
 * The official seat collapses to an icon by reading exactly those two variables,
 * so the seat does the same instead of guessing with a viewport breakpoint —
 * a media query cannot know the row also shrinks when the sidebar is open.
 *
 * The popover centers on the complete trigger and is clamped at viewport edges.
 */
test('the seat collapses with the host compact mode and clamps its popover on narrow screens', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

  // The two variables the official model seat consumes.
  assert.match(source, /var SEAT_ICON_DISPLAY = 'var\(--dsh-composer-model-icon-display/,
    'the compact icon must follow the host display variable')
  assert.match(source, /var SEAT_TEXT_DISPLAY = 'var\(--dsh-composer-model-text-display/,
    'the trigger text must follow the host display variable')

  const cssStart = source.indexOf('var SEAT_CSS = [')
  const cssEnd = source.indexOf("].join('\\n')", cssStart)
  const cssLiteral = source.slice(cssStart, cssEnd)
  const rule = (selector) => {
    const at = cssLiteral.indexOf(selector)
    assert.ok(at >= 0, `the ${selector} rule must exist`)
    return cssLiteral.slice(at, cssLiteral.indexOf('\n', at))
  }

  // Compact mode: icon hidden by default, text shown by default.
  assert.match(rule('.rs2-trigger-icon{'), /display:\s*' \+ SEAT_ICON_DISPLAY/,
    'the icon must be driven by the compact variable')
  assert.match(rule('.rs2-trigger-name{'), /display:\s*' \+ SEAT_TEXT_DISPLAY/,
    'the label must be driven by the compact variable')
  assert.match(rule('.rs2-trigger-effort{'), /display:\s*' \+ SEAT_TEXT_DISPLAY/,
    'the effort label must hide with the label, not linger alone')
  assert.match(rule('.rs2-trigger{'), /width:max-content/, 'the trigger must fit the full model name')
  assert.doesNotMatch(rule('.rs2-trigger-name{'), /text-overflow:ellipsis|overflow:hidden/,
    'the model name must never be truncated')
  assert.doesNotMatch(rule('.rs2-modeljump-name{') + rule('.rs2-optname{'), /text-overflow:ellipsis|overflow:hidden/,
    'model names in the menu must wrap instead of showing an ellipsis')
  assert.doesNotMatch(rule('.rs2-trigger-effort{'), /min-width:36px/,
    'the effort label must not reserve a wide gap before the arrow')

  // The trigger must still be reachable when it collapses to a bare icon.
  assert.match(rule('.rs2-trigger{'), /min-width/, 'the collapsed trigger needs a hit target')

  // Width follows the official `width:max-content` + viewport clamp pattern so
  // the popover never exceeds the window it is clamped to.
  const menu = rule('.rs2-menu{')
  assert.match(menu, /max-width:min\(420px,100vw - 32px\)/,
    'the menu must clamp to the viewport like the official popover')
  assert.match(menu, /box-sizing:border-box/,
    'the viewport width limit must include menu padding')
  assert.match(menu, /left:50%;transform:translateX\(-50%\)/,
    'the menu must open around the trigger center')
  assert.doesNotMatch(menu, /right:0/, 'the menu must not anchor to the trigger right edge')

  // The inline clamp must exist and be wired to the open state.
  assert.match(source, /querySelector\('\.rs2-menu'\)/, 'the popover must be measured for clamping')
  assert.match(source, /translateX\(calc\(-50% \+ /, 'edge clamping must preserve centering around the trigger')
  assert.match(source, /addEventListener\('resize', apply\)/, 'clamping must re-run on resize')
  assert.match(source, /removeEventListener\('resize', apply\)/, 'the resize listener must be cleaned up')
})

/**
 * Behavioural test for the viewport-clamp math. `seatClamp` is pure and lives at
 * module scope, so it is extracted and evaluated directly rather than driven
 * through the frozen React mock.
 */
test('the popover clamp keeps the panel inside the viewport at every width', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  const at = source.indexOf('function seatClamp')
  assert.ok(at >= 0, 'seatClamp must be defined')
  // The function ends at the first line that is exactly two spaces + }.
  const end = source.indexOf('\n    }', at)
  assert.ok(end > at, 'seatClamp body must be locatable')
  const seatClamp = new Function(source.slice(at, end + 6) + '; return seatClamp')()

  const box = (left, right, top, height) => ({ left, right, width: right - left, top, height })
  const M = 12

  // Fits: no correction at all, so the caller leaves both styles unset.
  assert.deepEqual(seatClamp(box(100, 340, 100, 300), 1000, 800, M), { shift: 0, maxHeight: null })

  // Overflows the LEFT edge (the reported narrow-screen case): slide right.
  {
    const fix = seatClamp(box(-40, 200, 100, 300), 400, 800, M)
    assert.equal(fix.shift, 52, 'a panel past the left margin must slide right by the overflow')
    assert.equal(200 + fix.shift <= 400 - M, true, 'the corrected panel must clear the right margin')
  }

  // Overflows the RIGHT edge: slide left.
  {
    const fix = seatClamp(box(300, 380, 100, 300), 360, 800, M)
    assert.equal(fix.shift, (360 - M) - 380, 'a panel past the right margin must slide left')
    assert.equal(300 + fix.shift >= M, true, 'the corrected panel must clear the left margin')
  }

  // Wider than the usable width: pin the left edge (no oscillation).
  {
    const fix = seatClamp(box(50, 500, 100, 300), 320, 800, M)
    assert.equal(fix.shift, M - 50, 'an oversized panel must pin to the left margin')
  }

  // Grows upward past the top edge: cap the height by exactly the overflow.
  {
    const fix = seatClamp(box(100, 340, -30, 300), 1000, 800, M)
    assert.equal(fix.shift, 0, 'a vertical overflow must not move the panel sideways')
    assert.equal(fix.maxHeight, 300 - (M - (-30)), 'the height cap must cancel the top overflow')
  }

  // A hostile measurement must not throw or emit NaN/Infinity.
  for (const bad of [[null, 800, 600], [box(0, 0, 0, 0), 800, 600], [box(10, 200, 10, 100), 0, 0], [box(10, 200, 10, 100), NaN, 600]]) {
    const fix = seatClamp(bad[0], bad[1], bad[2], M)
    assert.equal(Number.isFinite(fix.shift), true, 'shift must stay finite for ' + JSON.stringify(bad.slice(1)))
    assert.equal(fix.maxHeight === null || Number.isFinite(fix.maxHeight), true, 'maxHeight must stay finite')
  }

  // A tiny viewport must still leave a usable (non-negative) panel.
  {
    const fix = seatClamp(box(0, 90, 5, 40), 100, 120, M)
    assert.equal(fix.shift, M, 'a tiny viewport still pins to the margin')
    assert.equal(fix.maxHeight === null || fix.maxHeight >= 120, true, 'a tiny viewport keeps a usable height')
  }
})
