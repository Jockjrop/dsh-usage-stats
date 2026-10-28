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
 * The seat reports its mount decisions to its own diagnostics route, which is
 * fire-and-forget traffic: stubs that assert on control-route requests must not
 * record it, or the newest POST stops being the one under test.
 */
const isSeatDiag = (url) => typeof url === 'string' && url.endsWith('/seat-diag')

/**
 * Exercise controls and the advanced model selector in the shipped renderer.
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

test('control page confirms automatic billing, persists visibility and validates templates before activation', async () => {
  let plugin, section, hookIndex = 0, hooks, effects = []
  const stores = new Map(), requests = []
  let settings = { autoQuota: false, intervalMinutes: 60, modelReasoning: true, customQueries: [] }
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
    console, URLSearchParams, setInterval: () => 0, clearInterval() {},
    fetch: async (url, options) => {
      if (isSeatDiag(url)) return { ok: true, json: async () => ({ ok: true }) }
      requests.push({ url, options })
      let body
      if (url.endsWith('/controls')) {
        if (options.method === 'POST') {
          const patch = JSON.parse(options.body)
          if (patch.action === 'save-query') settings.customQueries = settings.customQueries.filter((query) => query.provider !== patch.provider).concat({ provider: patch.provider, template: patch.template })
          else if (patch.action === 'remove-query') settings.customQueries = settings.customQueries.filter((query) => query.provider !== patch.provider)
          else for (const key of ['autoQuota', 'intervalMinutes', 'modelReasoning']) if (key in patch) settings[key] = patch[key]
        }
        body = { ok: true, settings: structuredClone(settings) }
      } else if (url.endsWith('/quota-providers')) body = { ok: true, providers: [
        { provider: 'deepseek', name: 'DeepSeek', template, hasBuiltinQuery: true },
        { provider: 'gateway', name: '本地网关', template: gatewayTemplate, hasBuiltinQuery: false },
        { provider: 'workbuddy', name: 'WorkBuddy', queryType: 'adapter', source: 'workbuddy', template: null, hasBuiltinQuery: true, description: '使用已启用的 WorkBuddy Connect 插件读取积分。' },
      ] }
      else if (url.endsWith('/quota-test')) body = { ok: true, testId: 'success', quota: { name: 'DeepSeek', metrics: [{ label: '余额', kind: 'amount', remaining: 3.5, currency: 'CNY' }] } }
      else if (url.endsWith('/workbuddy?fresh=1')) body = { ok: true, available: true, status: 'signed-in', credits: { total: 8 } }
      else body = { ok: true, totals: null, byDay: [], byHour: [], byModel: [] }
      return { ok: true, json: async () => body }
    },
  }
  vm.runInNewContext(bundle, context)
  plugin.apply({ get: () => ({ inject: (_name, callback) => callback(), register: (meta, render) => { if (meta.name === 'settings.section') section = render({}); return () => {} } }), effect: (callback) => callback() })
  const render = (type, props) => { hooks = stores.get(type) || []; stores.set(type, hooks); hookIndex = 0; effects = []; return type(props) }
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  let page = render(section.type, section.props)
  assert.match(textOf(page), /用量统计/)
  effects.forEach(effect => effect()) // Load controls without querying any account.
  await settle()
  page = render(section.type, section.props)
  const controlElement = () => walk(render(section.type, { ...section.props, embedded: true }), (node) => node.type?.name === 'ControlsPanel')
  const renderControl = () => { const element = controlElement(); return render(element.type, element.props) }
  let panel = renderControl()
  effects[0]()
  await settle()
  panel = renderControl()
  const auto = walk(panel, (node) => node.props?.role === 'switch' && node.props['aria-label'] === '自动获取剩余余额')
  assert.equal(auto.props['aria-checked'], false)
  assert.equal(walk(panel, node => node.props?.id === 'dshus-auto-interval'), null, 'the interval is hidden while automatic balance refresh is off')
  assert.doesNotMatch(textOf(panel), /当前设置：|下次获取：/)
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
  assert.deepEqual(Array.from(interval.props.options, (option) => option.name), ['10 分钟', '1 小时', '5 小时', '每天'])
  interval.props.onChange(300)
  await settle()
  assert.equal(settings.intervalMinutes, 300)
  panel = renderControl()
  // The explanatory小字 are gone from the 控制 tab, so the dropdown itself has to
  // carry the state: the chosen value is the one the user reads back.
  const settledInterval = walk(panel, (node) => node.props?.id === 'dshus-auto-interval')
  assert.equal(settledInterval.props.value, 300, 'the dropdown reflects the saved interval')
  assert.equal(
    settledInterval.props.options.find((option) => option.value === 300).name,
    '5 小时',
    'the selected option spells the interval out in words',
  )
  walk(panel, node => node.props?.['aria-label'] === '自动获取剩余余额').props.onClick()
  await settle()
  assert.equal(walk(renderControl(), node => node.props?.id === 'dshus-auto-interval'), null)
  assert.equal(settings.intervalMinutes, 300, 'hiding the interval preserves the saved selection')
  walk(panel, (node) => node.props?.role === 'switch' && node.props['aria-label'] === '模型推理强度').props.onClick()
  await settle()
  page = render(section.type, section.props)
  assert.doesNotMatch(textOf(render(section.type, section.props)), /模型推理强度/)
  panel = renderControl()
  const renderPicker = () => { const element = walk(renderControl(), (node) => node.type?.name === 'ProviderPicker'); return render(element.type, element.props) }
  const providerOptionsOf = () => {
    let picker = renderPicker()
    const trigger = walk(picker, (node) => node.props?.role === 'combobox')
    if (!trigger.props['aria-expanded']) { trigger.props.onClick(); picker = renderPicker() }
    return walkAll(picker, (node) => node.props?.role === 'option')
  }
  const optionFor = (id) => providerOptionsOf().find((option) => option.props['data-value'] === id)
  const choose = (id) => optionFor(id).props.onClick({ stopPropagation() {} })
  const hasDot = (option) => !!walk(option, (node) => node.props?.className === 'dshus-provider-dot')
  choose('deepseek')
  panel = renderControl()
  // Each provider has one label, including when its display name equals its ID.
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
  assert.equal(selectedLabel.props['data-dshus-tip'], '内置供应商查询')
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
  const queryModule = walk(panel, (node) => node.props?.['aria-labelledby'] === 'dshus-control-query-heading')
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
  assert.equal(walk(renderControl(), node => node.props?.id === 'dshus-saved-queries-dialog'), null, 'enabled queries start collapsed')
  const editor = () => walk(renderControl(), (node) => node.type === 'textarea')
  assert.equal(optionFor('deepseek').props['data-dshus-tip'], '已保存自定义查询')
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
  walk(renderControl(), node => node.props?.id === 'dshus-query-dialog').props.onClose()
  assert.equal(editor(), null, 'closing the editor removes it from the control grid')
  walk(renderControl(), node => node.props?.id === 'dshus-saved-queries-toggle').props.onClick()
  const remove = (id) => walk(walk(renderControl(), (node) => node.props?.className === 'dshus-saved-query' && node.props.key === id), (node) => node.type === 'button' && textOf(node) === '移除').props.onClick()
  remove('gateway')
  await settle()
  assert.equal(hasDot(optionFor('gateway')), false, 'removing the only existing query clears the marker')
  remove('deepseek')
  await settle()
  assert.equal(hasDot(optionFor('deepseek')), true, 'the built-in query stays marked after removing an override')
  assert.equal(optionFor('deepseek').props['data-dshus-tip'], '内置供应商查询')
  choose('deepseek')
  assert.deepEqual(JSON.parse(editor().props.value), template)
  choose('workbuddy')
  assert.equal(hasDot(optionFor('workbuddy')), true)
  assert.equal(optionFor('workbuddy').props['data-dshus-tip'], '内置扩展查询')
  panel = renderControl()
  // The adapter row is identified by its query action and picker status dot.
  assert.doesNotMatch(textOf(panel), /WorkBuddy Connect.*读取积分/, 'provider prose is not repeated under the picker')
  assert.equal(editor(), null, 'local adapters have a direct query action, with no pretend HTTP template')
  const before = requests.filter((request) => request.url.endsWith('/workbuddy?fresh=1')).length
  walk(panel, (node) => node.type === 'button' && textOf(node) === '查询配额').props.onClick()
  await settle()
  assert.equal(requests.filter((request) => request.url.endsWith('/workbuddy?fresh=1')).length, before + 1)
  assert.match(textOf(renderControl()), /查询已更新/)
  assert.equal(settings.customQueries.length, 0, 'querying an adapter must not save a custom HTTP query')
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

test('control panel fields and switches follow the theme background', () => {
  const source = renderClient()
  // Inputs and textareas must resolve a themed surface, not a hard white one.
  assert.match(source, /\.dshus-field \{[^}]*background: var\(--dsw-alias-bg-layer-2/)
  assert.match(source, /\.dshus-dropdown-menu \{[^}]*background: var\(--dsw-alias-bg-layer-2/)
  // The native popup must be allowed to follow the active scheme.
  assert.match(source, /\.dshus-field \{[^}]*color-scheme: inherit/)
})

test('control rows use concise labels and theme the interval selector', () => {
  const source = renderClient()
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = source.match(new RegExp(escaped + '[^{}]*\\{([^}]*)\\}'))
    assert.ok(m, 'missing rule for ' + selector)
    return m[1]
  }

  // Setting rows render labels without a second help paragraph.
  const settingsModule = source.slice(source.indexOf('自动获取剩余余额'), source.indexOf('配额查询'))
  assert.doesNotMatch(settingsModule, /dshus-setting-help/, 'the 控制 rows carry no explanatory小字')
  for (const gone of ['默认关闭。配额页读取缓存', '每天为每 24 小时', '在用量页显示模型分布图', '用宽轨道滑条替换输入框']) {
    assert.ok(!source.includes(gone), 'removed help text must not come back: ' + gone)
  }

  // The interval control is a custom dropdown, not a restyled UA widget.
  const trigger = rule('.dshus-dropdown-trigger')
  assert.match(trigger, /display:\s*flex/)
  assert.match(trigger, /min-height:\s*34px/)
  assert.match(rule('.dshus-dropdown-inline'), /width:\s*auto/)
  // The list floats above the page with rounded corners and a soft shadow.
  assert.match(rule('.dshus-dropdown-menu'), /position:\s*absolute/)
  assert.match(rule('.dshus-dropdown-menu'), /border-radius:\s*12px/)
  assert.match(rule('.dshus-dropdown-option[aria-selected="true"]'), /font-weight:\s*600/)
  // Disabled swaps to a normal cursor rather than dimming a button.
  assert.match(rule('.dshus-dropdown-trigger:disabled'), /cursor:\s*default/)
  // The chevron flips while the list is open.
  assert.match(rule('.dshus-dropdown-trigger[aria-expanded="true"] .dshus-dropdown-chevron'), /rotate\(180deg\)/)
  // No native select is left in the renderer.
  assert.ok(!source.includes('.dshus-select'), 'native select styling must be gone')
  assert.match(rule('.dshus-query-select'), /min-height:\s*34px/)
})

test('the template editor offers a copyable AI prompt and keeps the cost warning last', async () => {
  const source = renderClient()
  const start = source.indexOf('function buildTemplatePrompt(')
  const end = source.indexOf('function ControlDialog(', start)
  assert.ok(start >= 0 && end > start, 'the prompt builder must exist')
  const buildTemplatePrompt = new Function('t', source.slice(start, end) + '; return buildTemplatePrompt')(fallbackTranslation)

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
  const templateStart = source.indexOf('dshus-query-template')
  const block = source.slice(templateStart, source.indexOf('已启用的自定义查询', templateStart))
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
    vm.runInNewContext(bundle, {
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
    const ctx = {
      get: (name) => name === 'slots' ? slots : name === 'modelDirectories' ? (modelsReady ? { directoryFor: () => ({}) } : undefined) : name === 'sessions' ? { subagentAddress: () => undefined } : undefined,
      effect: (callback) => callback(),
      timeout: (callback) => { scheduled.push(callback); return () => {} },
      // Stand in for the seat's scoped fiber: its callback sees the same
      // services, so registration can be observed synchronously.
      inject: (_deps, callback) => { callback(ctx); return { dispose() {} } },
    }
    plugin.apply(ctx)
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

test('the 高级模型选择器 switch preserves saved preferences and releases the slot when disabled', async () => {
  let plugin, hooks, hookIndex = 0, effects = []
  const stores = new Map(), requests = [], styles = new Map()
  let settings = { autoQuota: false, intervalMinutes: 60, showModelDetails: true, advancedModelSelect: false, modelSeatColor: 'blue', customQueries: [] }
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
  const pageDataset = {}
  vm.runInNewContext(bundle, { setInterval: () => 0, clearInterval() {},
    window: { dshDesktop: desktopBridge, localStorage: { getItem: () => null, setItem() {} }, __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } } },
    document: {
      documentElement: { dataset: pageDataset },
      getElementById: (id) => styles.get(id) || null,
      createElement: () => ({ dataset: {}, remove() { styles.delete(this.id) } }),
      head: { appendChild(style) { styles.set(style.id, style) } },
    },
    console, URLSearchParams,
    fetch: async (url, options = {}) => {
      if (isSeatDiag(url)) return { ok: true, json: async () => ({ ok: true }) }
      requests.push({ url, options })
      if (url.endsWith('/controls')) {
        if (options.method === 'POST') {
          const patch = JSON.parse(options.body)
          for (const key of ['autoQuota', 'intervalMinutes', 'showModelDetails', 'advancedModelSelect', 'modelSeatColor']) if (key in patch) settings[key] = patch[key]
        }
        return { ok: true, json: async () => ({ ok: true, settings: structuredClone(settings) }) }
      }
      return { ok: true, json: async () => ({ ok: true, totals: null, byDay: [], byHour: [], byModel: [] }) }
    },
  })
  const ctx = {
    get: (name) => (name === 'slots' ? slots : name === 'modelDirectories' ? { directoryFor: () => directory } : name === 'sessions' ? { subagentAddress: (sessionId) => (sessionId === parentSession ? 'session-root' : undefined) } : undefined),
    effect: (callback) => { const cleanup = callback(); effects.push(cleanup); return cleanup },
    timeout: (fn, ms) => setTimeout(fn, ms),
  }
  ctx.inject = (_deps, callback) => { callback(ctx); return { dispose() {} } }
  plugin.apply(ctx)
  const seatOf = () => seatEntries.filter((entry) => entry.meta.name === 'conversation.input.model')
  assert.equal(seatOf().length, 0, 'the seat must wait for the saved host preference')

  const render = (type, props) => { hooks = stores.get(type) || []; stores.set(type, hooks); hookIndex = 0; effects = []; return type(props) }
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  const section = seatEntries.find((entry) => entry.meta.name === 'settings.section')
  assert.ok(section, 'the settings section must still register through the same slot host')
  const sectionProps = section.render({})
  let page = render(sectionProps.type, { ...sectionProps.props, embedded: true })
  effects[1]() // The controls effect loads saved settings for the embedded panel.
  await settle()
  page = render(sectionProps.type, { ...sectionProps.props, embedded: true })
  assert.equal(seatOf().length, 0, 'loading controls with the switch off must not register the seat')
  const switchOf = (node) => walk(node, (child) => child.props?.role === 'switch' && child.props['aria-label'] === '高级模型选择器')
  const controlElement = () => walk(render(sectionProps.type, { ...sectionProps.props, embedded: true }), (node) => node.type?.name === 'ControlsPanel')
  const renderControl = () => { const element = controlElement(); return render(element.type, element.props) }
  let panel = renderControl()
  const swatchesOf = (node) => walkAll(node, (child) => child.type === 'button' && child.props?.className === 'dshus-seat-color')
  assert.match(textOf(panel), /高级模型选择器/, 'the switch must be reachable from the 控制 tab')
  assert.equal(switchOf(panel).props['aria-checked'], false, 'the switch reads the host value and starts off')
  assert.equal(swatchesOf(panel).length, 0, 'the palette stays hidden while the advanced selector is off')
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
  assert.equal((await live.select({ provider: 'p', model: 'm' })).ok, true,
    'a switch without a host result still reports success')
  live.load()
  // The row exposes the five palettes once the selector is on and paints the
  // saved choice on the page so every mounted seat picks it up.
  panel = renderControl()
  const swatches = swatchesOf(panel)
  assert.equal(swatches.length, 5, 'the advanced selector row offers five theme colors')
  assert.deepEqual(swatches.map((button) => button.props['aria-label']), ['红色', '绿色', '黄色', '蓝色', '紫色'])
  assert.deepEqual(swatches.map((button) => button.props['aria-pressed']), [false, false, false, true, false], 'blue is the saved default')
  assert.equal(pageDataset.dshusSeatColor, 'blue')
  const seatCss = styles.get('dsh-usage-stats-seat-styles')?.textContent || ''
  for (const name of ['red', 'green', 'yellow', 'blue', 'purple']) {
    assert.match(seatCss, new RegExp(':root\\[data-dshus-seat-color="' + name + '"\\] \\.rs2-root\\{--rs2-accent:'),
      name + ' must theme the mounted seat')
  }
  swatches[0].props.onClick()
  await settle()
  assert.deepEqual(JSON.parse(requests.filter((request) => request.options?.method === 'POST').pop().options.body), { modelSeatColor: 'red' })
  assert.equal(settings.modelSeatColor, 'red')
  panel = renderControl()
  assert.deepEqual(swatchesOf(panel).map((button) => button.props['aria-pressed']), [true, false, false, false, false])
  assert.equal(pageDataset.dshusSeatColor, 'red', 'the chosen palette retints the mounted seat without remounting it')
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
  assert.equal(swatchesOf(renderControl()).length, 0, 'the palette hides with the selector it themes')
  assert.equal(pageDataset.dshusSeatColor, undefined, 'disabling clears the page theme')
})

/**
 * Mount the seat through the real bundle and hand back a painter.
 *
 * The official host renders `conversation.input.model` as a *single* slot of
 * scope `session`, passing the session id into the registration's `inject`.
 * The seat's own component then renders from the model directory store, so a
 * faithful test needs both halves: the injection result and a store snapshot
 * the test can move forward between paints.
 */
function mountSeat({ snapshot, directoryFor, select, catalogValue, defaultSelection, defaultModelReply } = {}) {
  let plugin
  let hooks = [], hookIndex = 0, effects = []
  const stores = new Map(), entries = [], styles = new Map(), selections = [], warnings = [], defaultWrites = []
  let state = snapshot || { current: null, routable: null, groups: [], failures: [], status: 'ready', pending: null, error: null }
  let result = { ok: true }
  const directory = {
    store: { getSnapshot: () => state, subscribe: () => () => {} },
    load: async () => {},
    select: async (selection) => {
      selections.push(selection)
      return typeof select === 'function' ? select(selection) : result
    },
  }
  // `modelDirectories.directoryFor` is the per-session entry point; the shared
  // catalog lives on `remote.session.modelCatalog`, which a session that does
  // not exist yet can still reach.
  const remote = {
    session: {
      modelCatalog: async () => {
        if (catalogValue === undefined) return { ok: false, error: { code: 'gateway/internal', message: 'no catalog' } }
        if (typeof catalogValue === 'function') return catalogValue()
        return { ok: true, value: catalogValue }
      },
    },
  }
  const slots = {
    inject: (_name, callback) => { callback(); return () => {} },
    register: (meta, render) => {
      entries.push({ meta, render })
      return () => { const index = entries.findIndex((entry) => entry.meta === meta); if (index >= 0) entries.splice(index, 1) }
    },
  }
  const React = {
    Fragment: 'Fragment',
    createElement(type, props, ...children) { return { type, props: { ...(props || {}), children } } },
    useState(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value }] },
    useRef(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index] },
    useEffect(callback) { effects.push(callback) },
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() },
  }
  const settings = { autoQuota: false, intervalMinutes: 60, showModelDetails: true, advancedModelSelect: true, customQueries: [] }
  vm.runInNewContext(bundle, {
    setInterval: () => 0, clearInterval() {}, URLSearchParams,
    // Move console.warn into the test so the seat's stand-down path can be
    // asserted without spraying expected stack traces into the test log.
    console: {
      log: (...args) => console.log(...args),
      info: (...args) => console.info(...args),
      error: (...args) => console.error(...args),
      warn: (...args) => warnings.push(args),
    },
    window: { dshDesktop: desktopBridge, localStorage: { getItem: () => null, setItem() {} }, __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } } },
    document: {
      getElementById: (id) => styles.get(id) || null,
      createElement: () => ({ dataset: {}, remove() { styles.delete(this.id) } }),
      head: { appendChild(style) { styles.set(style.id, style) } },
      addEventListener() {}, removeEventListener() {},
    },
    fetch: async (url, options = {}) => {
      if (url.endsWith('/controls')) {
        if (options.method === 'POST') Object.assign(settings, JSON.parse(options.body))
        return { ok: true, json: async () => ({ ok: true, settings: structuredClone(settings) }) }
      }
      if (url.endsWith('/default-model')) {
        if (options.method === 'POST') {
          const selection = JSON.parse(options.body)
          defaultWrites.push(selection)
          if (typeof defaultModelReply === 'function') {
            const reply = defaultModelReply(selection)
            if (reply !== undefined) return { ok: true, json: async () => reply }
          }
          return { ok: true, json: async () => ({ ok: true, selection, persisted: true }) }
        }
        return { ok: true, json: async () => ({ ok: true, selection: defaultSelection || null, persisted: true }) }
      }
      return { ok: true, json: async () => ({ ok: true, totals: null, byDay: [], byHour: [], byModel: [] }) }
    },
  })
  const ctx = {
    get: (name) => (name === 'slots' ? slots
      : name === 'modelDirectories' ? { directoryFor: directoryFor || (() => directory) }
        : name === 'sessions' ? { subagentAddress: () => undefined }
          : name === 'remote' ? remote : undefined),
    effect: (callback) => { const cleanup = callback(); effects.push(cleanup); return cleanup },
    timeout: (fn, ms) => setTimeout(fn, ms),
  }
  ctx.inject = (_deps, callback) => { callback(ctx); return { dispose() {} } }
  plugin.apply(ctx)
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  const seatEntry = () => entries.filter((entry) => entry.meta.name === 'conversation.input.model')[0]
  return {
    entries, selections, warnings, defaultWrites, settle,
    setResult(next) { result = next },
    setSnapshot(next) { state = next },
    inject(sessionId) { return seatEntry().meta.inject(sessionId) },
    /** Paint the seat for `sessionId`; call again after a click to re-render. */
    paint(sessionId, extra = {}) {
      const element = seatEntry().render({ ...this.inject(sessionId), t: fallbackTranslation, scheduleClear: () => () => {}, locked: false, ...extra })
      hooks = stores.get(element.type) || []
      stores.set(element.type, hooks)
      hookIndex = 0
      effects = []
      return element.type(element.props)
    },
  }
}

/**
 * Regression guard for the "新会话模型选择器失效" report.
 *
 * A brand-new session has no projected model, so `state.current` is null, no
 * effort levels can be derived, and the seat used to force the *effort* pane:
 * an empty slider plus a jump button, with the model list never shown. The
 * official selector opens the model list itself in exactly this state.
 */
test('the 高级模型选择器 opens on the model list for a session without a projected model', async () => {
  const groups = [{ id: 'p', name: 'Provider', models: [{ id: 'm1', name: 'Model One', reasoning: { efforts: [{ id: 'low' }, { id: 'high' }], defaultEffort: 'low' } }] }]
  const harness = mountSeat({ snapshot: { current: null, routable: null, groups, failures: [], status: 'ready', pending: null, error: null } })
  await harness.settle()

  let tree = harness.paint('session-new')
  const trigger = walk(tree, (node) => node.props?.className === 'rs2-trigger')
  assert.ok(trigger, 'the seat renders its trigger for a normal session')
  assert.equal(trigger.props.disabled, false)
  assert.match(textOf(tree), /选择模型/, 'a session without a model invites a choice')

  trigger.props.onClick()
  tree = harness.paint('session-new')
  assert.equal(walk(tree, (node) => node.props?.className === 'rs2-track'), null,
    'without a current model the effort rail must not be the first thing shown')
  assert.equal(walk(tree, (node) => node.props?.className === 'rs2-back'), null,
    'with no effort pane there is nothing to go back from')
  const options = walkAll(tree, (node) => node.props?.className === 'rs2-option')
  assert.equal(options.length, 1, 'the model list is visible immediately')
  assert.match(textOf(tree), /Model One/)

  options[0].props.onClick()
  await harness.settle()
  // Objects handed back from the vm realm have foreign prototypes, so compare
  // the fields instead of deep-equal on the objects themselves.
  assert.equal(harness.selections.length, 1)
  assert.deepEqual(Object.keys(harness.selections[0]).sort(), ['model', 'provider', 'reasoningEffort'])
  assert.equal(harness.selections[0].provider, 'p')
  assert.equal(harness.selections[0].model, 'm1')
  assert.equal(harness.selections[0].reasoningEffort, 'low', 'the catalog default effort travels with the pick')
  tree = harness.paint('session-new')
  assert.equal(walk(tree, (node) => node.props?.className === 'rs2-error'), null, 'a successful switch shows no error')
})

test('a rejected model switch keeps the menu open and shows the host error', async () => {
  const groups = [{ id: 'p', name: 'Provider', models: [{ id: 'm1', name: 'Model One' }] }]
  const harness = mountSeat({
    snapshot: { current: null, routable: null, groups, failures: [], status: 'ready', pending: null, error: null },
    select: async () => ({ ok: false, error: { code: 'model/unavailable', message: 'provider offline' } }),
  })
  await harness.settle()

  let tree = harness.paint('session-new')
  walk(tree, (node) => node.props?.className === 'rs2-trigger').props.onClick()
  tree = harness.paint('session-new')
  walkAll(tree, (node) => node.props?.className === 'rs2-option')[0].props.onClick()
  await harness.settle()
  tree = harness.paint('session-new')

  const error = walk(tree, (node) => node.props?.className === 'rs2-error')
  assert.ok(error, 'a failed switch must not look like a dead selector')
  assert.match(textOf(error), /model\/unavailable: provider offline/, 'the host error text is surfaced verbatim')
  assert.ok(walk(tree, (node) => node.props?.className === 'rs2-option'), 'the menu stays open so the user can retry')
  const retry = walk(tree, (node) => node.props?.className === 'rs2-retry')
  assert.equal(typeof retry.props.onClick, 'function', 'the error row offers a retry')
  retry.props.onClick()
  await harness.settle()
  assert.equal(harness.selections.length, 2, 'retrying re-attempts the rejected selection')
  tree = harness.paint('session-new')
  assert.equal(textOf(walk(tree, (node) => node.props?.className === 'rs2-menu').props.children).includes('provider offline'), true,
    'the retry that fails again keeps reporting the host error')
})

test('a session with a projected model still opens on the effort slider', async () => {
  const groups = [{ id: 'p', name: 'Provider', models: [{ id: 'm1', name: 'Model One', reasoning: { efforts: [{ id: 'low' }, { id: 'high' }], defaultEffort: 'low' } }] }]
  const harness = mountSeat({
    snapshot: { current: { provider: 'p', model: 'm1', reasoningEffort: 'high' }, routable: null, groups, failures: [], status: 'ready', pending: null, error: null },
  })
  await harness.settle()

  let tree = harness.paint('session-existing')
  assert.match(textOf(tree), /Model One/, 'the trigger names the current model')
  walk(tree, (node) => node.props?.className === 'rs2-trigger').props.onClick()
  tree = harness.paint('session-existing')
  // SeatSlider is itself a component here, so look for its host box rather than
  // the rail element it renders.
  assert.ok(walk(tree, (node) => node.props?.className === 'rs2-sliderbox'), 'a projected model keeps the effort slider as the first pane')
  assert.equal(walk(tree, (node) => node.props?.className === 'rs2-back'), null, 'the advanced pane is not reached through the back button')
  const jump = walk(tree, (node) => node.props?.className === 'rs2-modeljump')
  assert.ok(jump, 'the advanced pane offers the way to the model list')
  jump.props.onClick()
  tree = harness.paint('session-existing')
  assert.ok(walkAll(tree, (node) => node.props?.className === 'rs2-option').length >= 1, 'the model list is one click away')
  assert.ok(walk(tree, (node) => node.props?.className === 'rs2-back'), 'the back button returns to the slider')
})

/**
 * Regression guard for the "模型选择器直接看不到了" follow-up.
 *
 * A brand-new session paints the composer before its scope is retained, so
 * `directoryFor` throws `resolved no scope`. The host caches every inject result
 * per session binding and permanently abdicates an entry that throws, so the
 * seat must never let that error escape — and answering "unavailable" there is
 * just as fatal, because the seat wins the slot (priority -1) and would render
 * nothing for the rest of the session. It stays mounted on a pending store and
 * adopts the real directory once the session has a scope.
 */
test('a session whose model directory is not ready yet keeps its seat and adopts the directory later', async () => {
  const groups = [{ id: 'p', name: 'Provider', models: [{ id: 'm1', name: 'Model One' }] }]
  let failing = true
  const harness = mountSeat({
    snapshot: { current: null, routable: null, groups, failures: [], status: 'ready', pending: null, error: null },
    directoryFor: () => {
      if (failing) throw new Error('ui-model-selection: session "blank" resolved no scope')
      return { store: { getSnapshot: () => ({ current: null, routable: null, groups, failures: [], status: 'ready', pending: null, error: null }), subscribe: () => () => {} }, load: async () => {}, select: async () => ({ ok: true }) }
    },
  })
  await harness.settle()

  // inject() runs inside the host's slot machinery: throwing there abdicates
  // the registration for every session, not just the unprojected one.
  const live = harness.inject('session-blank')
  assert.equal(live.available, true, 'the seat never stands down, so the official selector is not shadowed by an empty cell')
  assert.deepEqual(Object.keys(live).sort(), ['available', 'load', 'select', 'store'])
  assert.equal(live.store.getSnapshot().status, 'loading', 'an unresolved directory paints the pending state')

  let tree = harness.paint('session-blank')
  const trigger = walk(tree, (node) => node.props?.className === 'rs2-trigger')
  assert.ok(trigger, 'the trigger is painted even while the directory is missing')
  assert.equal(trigger.props.disabled, false)
  trigger.props.onClick()
  tree = harness.paint('session-blank')
  assert.match(textOf(tree), /加载中/, 'the open menu explains that the catalog is still loading')
  assert.equal(walk(tree, (node) => node.props?.className === 'rs2-error'), null, 'a missing directory is not an error state')
  assert.equal(harness.warnings.length, 0, 'the retry loop stays quiet while it waits for the scope')

  // The session gets its scope on a later frame; the fibre-owned retry picks the
  // directory up without any user action.
  failing = false
  await new Promise((resolve) => setTimeout(resolve, 220))
  assert.equal(live.store.getSnapshot().status, 'ready', 'the store adopts the real snapshot once the scope exists')
  // The menu was left open by the click above; the adopted catalog fills it in.
  tree = harness.paint('session-blank')
  assert.ok(walkAll(tree, (node) => node.props?.className === 'rs2-option').length >= 1, 'the model list is reachable after the directory arrives')
})

test('a switch attempted before the directory resolves writes the deployment default instead of failing', async () => {
  let failing = true
  const harness = mountSeat({
    directoryFor: () => {
      if (failing) throw new Error('ui-model-selection: session "blank" resolved no binding')
      return { store: { getSnapshot: () => ({ current: null, routable: null, groups: [], failures: [], status: 'ready', pending: null, error: null }), subscribe: () => () => {} }, load: async () => {}, select: async () => ({ ok: true }) }
    },
  })
  await harness.settle()

  const live = harness.inject('session-blank')
  const result = await live.select({ provider: 'p', model: 'm1' })
  // A composer without a session cannot reach `session.selectModel`, so the pick
  // lands on the deployment default that the new session will inherit.
  assert.equal(result.ok, true, 'a not-yet-created session still accepts a pick')
  assert.equal(harness.selections.length, 0, 'nothing reached the host directory')
  assert.equal(harness.defaultWrites.length, 1, 'the pick was written as the default model')
  assert.deepEqual(Object.keys(harness.defaultWrites[0]).sort(), ['model', 'provider'])
  failing = false
  await new Promise((resolve) => setTimeout(resolve, 220))
})

/**
 * Regression guard for "现在变成加载中了，不能显示出来，不能调节强度".
 *
 * A brand-new session owns no model directory, so the seat used to sit on its
 * pending snapshot forever. The shared catalog needs no session scope, so the
 * seat lists it and drives the deployment default instead of loading until the
 * user gives up.
 */
test('a session that does not exist yet lists the shared catalog and writes the deployment default', async () => {
  const groups = [{
    id: 'p',
    name: 'Provider',
    models: [
      { id: 'm1', name: 'Model One', reasoning: { efforts: [{ id: 'low' }, { id: 'high' }], defaultEffort: 'low' } },
      { id: 'm2', name: 'Model Two' },
    ],
  }]
  const catalogValue = { default: { provider: 'p', model: 'm1', reasoningEffort: 'low' }, routableProviders: ['p'], groups, failures: [] }
  const harness = mountSeat({
    directoryFor: () => { throw new Error('ui-model-selection: session "draft" resolved no scope') },
    catalogValue,
  })
  await harness.settle()

  let tree = harness.paint('session-draft')
  await harness.settle()
  tree = harness.paint('session-draft')
  const trigger = walk(tree, (node) => node.props?.className === 'rs2-trigger')
  assert.ok(trigger, 'the trigger is painted for a session that does not exist yet')
  assert.match(textOf(tree), /Model One/, 'the trigger names the model the new session will start with')

  trigger.props.onClick()
  tree = harness.paint('session-draft')
  assert.equal(walk(tree, (node) => node.props?.className === 'rs2-error'), null, 'a missing directory is not an error')
  assert.ok(walk(tree, (node) => node.props?.className === 'rs2-hint'), 'the menu explains that the pick applies to the new session')
  assert.equal(textOf(tree).includes('加载中'), false, 'the catalog is listed instead of loading forever')

  walk(tree, (node) => node.props?.className === 'rs2-modeljump').props.onClick()
  tree = harness.paint('session-draft')
  const options = walkAll(tree, (node) => node.props?.className === 'rs2-option')
  assert.equal(options.length, 2, 'the shared catalog fills the list without a session directory')
  options[1].props.onClick()
  await harness.settle()
  tree = harness.paint('session-draft')

  assert.equal(walk(tree, (node) => node.props?.className === 'rs2-error'), null, 'the default-model write reports success')
  assert.equal(harness.selections.length, 0, 'the session directory is never touched for a session that has none')
  assert.equal(harness.defaultWrites.length, 1)
  assert.deepEqual(Object.keys(harness.defaultWrites[0]).sort(), ['model', 'provider'])
  assert.equal(harness.defaultWrites[0].model, 'm2')
  assert.match(textOf(tree), /Model Two/, 'the trigger follows the accepted default')
})

test('a rejected default-model write keeps the menu open and shows the reason', async () => {
  const groups = [{ id: 'p', name: 'Provider', models: [{ id: 'm1', name: 'Model One' }] }]
  const harness = mountSeat({
    directoryFor: () => { throw new Error('ui-model-selection: session "draft" resolved no scope') },
    catalogValue: { default: null, routableProviders: ['p'], groups, failures: [] },
    defaultModelReply: () => ({ ok: false, error: '当前部署未挂载默认模型服务。' }),
  })
  await harness.settle()

  let tree = harness.paint('session-draft')
  await harness.settle()
  tree = harness.paint('session-draft')
  walk(tree, (node) => node.props?.className === 'rs2-trigger').props.onClick()
  tree = harness.paint('session-draft')
  walkAll(tree, (node) => node.props?.className === 'rs2-option')[0].props.onClick()
  await harness.settle()
  tree = harness.paint('session-draft')

  const error = walk(tree, (node) => node.props?.className === 'rs2-error')
  assert.ok(error, 'a refused write must not look like a dead selector')
  assert.match(textOf(error), /未挂载默认模型服务/, 'the control route error is surfaced verbatim')
  assert.ok(walk(tree, (node) => node.props?.className === 'rs2-option'), 'the menu stays open so the user can retry')
})

test('an accepted default-model write that never reached the config is reported', async () => {
  const groups = [{ id: 'p', name: 'Provider', models: [{ id: 'm1', name: 'Model One' }] }]
  const harness = mountSeat({
    directoryFor: () => { throw new Error('ui-model-selection: session "draft" resolved no scope') },
    catalogValue: { default: null, routableProviders: ['p'], groups, failures: [] },
    defaultModelReply: (selection) => ({ ok: true, selection, persisted: false }),
  })
  await harness.settle()

  harness.paint('session-draft')
  await harness.settle()
  let tree = harness.paint('session-draft')
  walk(tree, (node) => node.props?.className === 'rs2-trigger').props.onClick()
  tree = harness.paint('session-draft')
  walkAll(tree, (node) => node.props?.className === 'rs2-option')[0].props.onClick()
  await harness.settle()
  tree = harness.paint('session-draft')

  const error = walk(tree, (node) => node.props?.className === 'rs2-error')
  assert.ok(error, 'a write the deployment dropped must not look like a switch')
  assert.match(textOf(error), /未能写入配置/)
  assert.equal(harness.defaultWrites.length, 1)
})

test('the slider keeps auto as the lowest stop when a model has no default effort', () => {
  const source = renderClient()
  const at = source.indexOf('function seatEffortStops(')
  const end = source.indexOf('\n    }', at)
  assert.ok(at >= 0 && end > at)
  const stopsFor = new Function('seatEffortZh', 't', source.slice(at, end + 6) + '; return seatEffortStops')((id) => id, fallbackTranslation)
  const reasoning = { efforts: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }] }

  assert.deepEqual(stopsFor(reasoning).map((stop) => stop.id), [undefined, 'low', 'medium', 'high'])
  assert.equal(stopsFor(reasoning)[0].label, '自动')
  assert.deepEqual(stopsFor({ ...reasoning, defaultEffort: 'high' }).map((stop) => stop.id), ['low', 'medium', 'high'])
})

test('ordinary efforts keep their dots while the highest effort releases them and streams particles', () => {
  const source = renderClient()
  const start = source.indexOf('function SeatSlider(props)')
  const end = source.indexOf('function ModelSeat(props)', start)
  assert.ok(start >= 0 && end > start)
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } } },
    useRef(value) { return { current: value } },
  }
  const SeatSlider = new Function('React', 'seatPrand', 't', source.slice(start, end) + '; return SeatSlider')(React, (i, salt) => ((i * 37 + salt * 13) % 97) / 97, fallbackTranslation)
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
  const source = renderClient()

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
 * The popover uses the host's translucent menu surface and backdrop blur.
 * SEAT_SURFACE provides an opaque fallback when backdrop filters are unsupported.
 */
test('the advanced selector exposes five page-level themes while blue keeps the brand accent', () => {
  const source = renderClient()
  const palettes = source.match(/var SEAT_PALETTES = \{([\s\S]*?)\n\}/)
  assert.ok(palettes, 'SEAT_PALETTES must be defined as an object literal')
  for (const name of ['red', 'green', 'yellow', 'blue', 'purple']) {
    assert.match(palettes[1], new RegExp(name + ': \\{ swatch: \'#[0-9a-f]{6}\'', 'i'), name + ' needs a swatch color')
  }
  assert.match(source, /var SEAT_COLOR_NAMES = \['red', 'green', 'yellow', 'blue', 'purple'\]/)
  assert.match(source, /var SEAT_THEME_CSS = SEAT_COLOR_NAMES\.map\(function \(name\) \{[\s\S]*?:root\[data-dshus-seat-color="' \+ name \+ '"\] \.rs2-root\{--rs2-accent:/,
    'every palette must generate a page-level theme rule')
  assert.match(palettes[1], /blue: \{ swatch: '#4176e6', accent: SEAT_ACCENT, fill: SEAT_BLUE, mid: '#6569ef', max: SEAT_MAX_ACCENT \}/,
    'the blue theme is the untouched host-brand palette')
  // The themed slots read from the page variables, with the original tokens as
  // fallbacks so a selector mounted before its settings arrive stays branded.
  assert.match(source, /\.rs2-trigger-icon\{[^\n]*var\(--rs2-accent,[^\n]*SEAT_ACCENT/)
  assert.match(source, /\.rs2-curlevel\{[^\n]*var\(--rs2-accent,[^\n]*SEAT_ACCENT/)
  assert.match(source, /\.rs2-check\{[^\n]*var\(--rs2-accent,[^\n]*SEAT_ACCENT/)
  assert.match(source, /\.rs2-fill\{[^\n]*var\(--rs2-fill,[^\n]*SEAT_BLUE/)
  assert.match(source, /\.rs2-max \.rs2-fill\{[^\n]*var\(--rs2-fill,[^\n]*SEAT_BLUE[^\n]*var\(--rs2-max,[^\n]*SEAT_MAX_ACCENT/)
  assert.match(source, /seatColors: SEAT_COLOR_NAMES\.map/)
  assert.match(source, /\.dshus-seat-color \{[^\n]*background: var\(--dshus-seat-swatch\)/)
  assert.match(source, /\.dshus-seat-color\[aria-pressed="true"\]/)
})

test('the seat popover paints the theme material, never the mid-grey bg-overlay alias', () => {
  const source = renderClient()

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

  // The overlay alias is a badge colour and must not paint a menu surface.
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
  const source = renderClient()

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
  const source = renderClient()
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

  // A left-edge overflow shifts the panel right.
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


test('model provider picker keeps keyboard focus and scrolling local', () => {
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
  plugin.apply({ get: () => ({ inject: (_name, callback) => callback(), register: (meta, render) => { if (meta.name === 'settings.section') section = render({}); return () => {} } }), effect: callback => callback() })
  const render = (type, props) => { hooks = stores.get(type) || []; stores.set(type, hooks); hookIndex = 0; effects = []; return type(props) }
  const pickerElement = { type: plugin.__components.ProviderPicker }
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
  walk(tree, node => node.props?.role === 'option' && node.props['data-value'] === 'google').props.onClick({ stopPropagation() {} })
  assert.deepEqual(chosen, ['tokenbom'], 'disabled rows cannot select while their menu is closing')
  effects[2](); tree = renderPicker(); key('ArrowDown')
  assert.equal(trigger().props['aria-expanded'], false)

  assert.equal(port.style.scrollbarGutter, 'auto', 'unmounting restores the host scrollbar setting')
})

/**
 * `dsh.client.inject` in package.json is what makes the host wait for the slot
 * service, but a host that activates this plugin early (no inject gate, or a
 * slot service created a frame later) must not leave the user with no seat and
 * no settings section: mounting is retried instead of abandoned.
 */
test('the client half mounts once the slot service appears instead of giving up on an early activation', () => {
  let plugin
  const timers = [], metas = [], styles = new Map()
  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
    useState: (value) => [value, () => {}], useRef: (value) => ({ current: value }), useEffect() {},
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  vm.runInNewContext(bundle, {
    setInterval: () => 0, clearInterval() {}, URLSearchParams, console,
    window: { dshDesktop: desktopBridge, localStorage: { getItem: () => null, setItem() {} }, __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } } },
    document: {
      getElementById: (id) => styles.get(id) || null,
      createElement: () => ({ dataset: {}, remove() { styles.delete(this.id) } }),
      head: { appendChild(style) { styles.set(style.id, style) } },
      addEventListener() {}, removeEventListener() {},
    },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  })
  const slots = {
    inject: (_name, callback) => { callback(); return () => {} },
    register: (meta) => { metas.push(meta); return () => {} },
  }
  let available = false
  plugin.apply({
    get: (name) => (name === 'slots' ? available ? slots : undefined : undefined),
    effect: (callback) => callback(),
    timeout: (fn) => { timers.push(fn); return () => {} },
  })
  assert.equal(metas.length, 0, 'nothing mounts while the slot service is still missing')
  assert.ok(timers.length > 0, 'the mount is retried on a timer rather than abandoned')
  available = true
  for (const fire of timers.splice(0)) fire()
  assert.deepEqual(metas.map((meta) => meta.name), ['settings.section', 'sidebar.footer.action', 'shell.overlay'], 'the UI mounts as soon as the service appears')
})

/**
 * The official `modelDirectories.directoryFor()` runs on its caller's context
 * and reads `ctx.sessions` / `ctx.remote.session` there. The cordis guard
 * denies undeclared services, and a throw inside the slot's `inject` callback
 * retires the seat from its cell — the official selector then keeps the
 * composer with no visible error. The seat therefore registers on a child
 * fiber that declares those services. `modelDirectories` itself stays scoped:
 * hard-injecting it would keep the settings section from mounting on hosts
 * without the official selector.
 */
test('the composer seat declares every service directoryFor reads without hard-injecting modelDirectories', () => {
  let plugin
  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
    useState: (value) => [value, () => {}], useRef: (value) => ({ current: value }), useEffect() {},
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const cache = new Map([['dsh-usage-stats-advanced-model-select', '1']])
  const localStorage = { getItem: (key) => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) }
  vm.runInNewContext(bundle, {
    setInterval: () => 0, clearInterval() {}, URLSearchParams, console,
    window: { dshDesktop: desktopBridge, localStorage, __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } } },
    localStorage,
    document: { getElementById: () => null, createElement: () => ({ dataset: {} }), head: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
    fetch: (url) => isSeatDiag(url) ? Promise.resolve({ ok: true, json: async () => ({ ok: true }) }) : new Promise(() => {}),
  })
  const entries = []
  const slots = {
    inject: (_name, callback) => { callback(); return () => {} },
    register: (meta) => { entries.push(meta); return () => {} },
  }
  const models = { directoryFor: () => ({ store: {}, load() {}, select() {} }) }
  const sessions = { subagentAddress: () => undefined }
  const remote = { session: {} }
  const scopedCalls = []
  const ctx = {
    get: (name) => (name === 'slots' ? slots
      : name === 'modelDirectories' ? models
        : name === 'sessions' ? sessions
          : name === 'remote' ? remote : undefined),
    remote,
    effect: (callback) => callback(),
    timeout: () => () => {},
    inject: (deps, callback) => { scopedCalls.push(deps); callback(ctx); return { dispose() {} } },
  }
  plugin.apply(ctx)
  const scopedDeps = scopedCalls.find((deps) => deps.includes('modelDirectories'))
  assert.ok(scopedDeps, 'the seat registers on a scoped fiber once its services exist')
  for (const service of ['modelDirectories', 'sessions', 'remote', 'remote.session']) {
    assert.ok(scopedDeps.includes(service), `the seat's fiber must declare "${service}" or directoryFor abdicates to the official selector`)
  }
  assert.ok(entries.some((entry) => entry.name === 'conversation.input.model'), 'the seat takes the composer cell')
  for (const service of ['slots', 'sessions', 'remote', 'remote.session', 'locale', 'timer']) {
    assert.ok(plugin.inject.includes(service), `the client must inject "${service}" for directoryFor callers on its own fiber`)
  }
  assert.ok(!plugin.inject.includes('modelDirectories'),
    'modelDirectories must stay optional so the settings section mounts without the official selector')
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  for (const dependency of ['@deepseek-ai/dsh-api-remotes', '@deepseek-ai/dsh-client-ui-model-selection', '@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-session']) {
    assert.ok(pkg.dsh.client.inject.includes(dependency), `dsh.client.inject must load ${dependency} before this bundle`)
  }
})
