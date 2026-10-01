/**
 * Read-only structural check for the redesigned heatmap.
 *
 * Renders the real `Heatmap` and `HeatPager` components from src/client.js
 * through a minimal React shim (same shape the test suite uses) and prints the
 * resulting element tree + computed layout math, so the header markup, the
 * colour legend and the cell sizing can be inspected without a browser.
 *
 * Usage: node scripts/render-heatmap-check.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src', 'client.js'), 'utf8')

let plugin = null
let hookIndex = 0
let hooks = []
const effects = []

const React = {
  createElement(type, props, ...children) { return { type, props: { ...props, children } } },
  Fragment: 'Fragment',
  useState(initial) {
    const index = hookIndex++
    if (!(index in hooks)) hooks[index] = initial
    return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value }]
  },
  useRef(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index] },
  useEffect(callback) { effects.push(callback) },
  useLayoutEffect(callback) { effects.push(callback) },
  useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot() },
}

const window = {
  localStorage: { getItem: () => null, setItem() {} },
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: (fn) => fn(),
  innerWidth: 1200,
  innerHeight: 900,
  __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
}

const context = {
  window,
  document: { getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, querySelector: () => null, documentElement: { style: {} } },
  console,
  URLSearchParams,
  fetch: async () => ({ ok: true, json: async () => ({ ok: true, totals: null, byDay: [], byModel: [] }) }),
  setTimeout, clearTimeout, setInterval, clearInterval, Promise, Map, Set, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat,
}
context.globalThis = context
vm.createContext(context)
vm.runInContext(source, context)

if (!plugin) throw new Error('the client bundle did not register itself')
const { Heatmap, HeatPager } = plugin.__components || {}
if (typeof Heatmap !== 'function') throw new Error('Heatmap export not found')
if (typeof HeatPager !== 'function') throw new Error('HeatPager export not found')

function walk(node, predicate) {
  if (Array.isArray(node)) { for (const c of node) { const f = walk(c, predicate); if (f) return f } return null }
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  return walk(node.props && node.props.children, predicate)
}
function walkAll(node, predicate, found = []) {
  if (Array.isArray(node)) { for (const c of node) walkAll(c, predicate, found) }
  else if (node && typeof node === 'object') { if (predicate(node)) found.push(node); walkAll(node.props && node.props.children, predicate, found) }
  return found
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return node && node.props ? textOf(node.props.children) : ''
}
function labelOf(node) {
  const cls = typeof node.props.className === 'string' ? node.props.className.trim().split(/\s+/)[0] : null
  return cls || (typeof node.type === 'function' ? node.type.name : String(node.type))
}

// --- build a small dayMap so some cells carry colour -----------------------
const tz = new Date().getTimezoneOffset()
const today = new Date(Date.now() - tz * 60000).toISOString().slice(0, 10)
const todayOrdinal = Date.parse(today + 'T00:00:00Z') / 86400000
const dayMap = new Map()
for (let back = 0; back < 380; back++) {
  const ordinal = todayOrdinal - back
  const date = new Date(ordinal * 86400000).toISOString().slice(0, 10)
  const billed = back % 7 === 3 ? 0 : Math.round(40000 * Math.pow(0.94, back) * (0.6 + (back % 5) * 0.1))
  if (billed > 0) dayMap.set(date, { billed, calls: 1 + (back % 6) })
}

function render(mode, pageIndex, width) {
  hookIndex = 0
  hooks = []
  effects.length = 0
  const props = { dayMap, dayModelMap: new Map(), days: 0, mode, tz, colorOf: () => '#0089ff', modelKey: '', syncedAt: 1, loadDayModels: null, pageIndex }

  // Pass 1 — mount: hookIndex starts at 0 so the refs are allocated.
  hookIndex = 0
  effects.length = 0
  let out = Heatmap(props)
  const measureEffect = effects[0]
  if (typeof measureEffect !== 'function') throw new Error('the heatmap did not register its measure effect')
  const viewportRef = walk(out, (n) => n.props && n.props.className === 'dshus-heat-viewport').props.ref
  viewportRef.current = { clientWidth: width, clientHeight: 200 }

  // Pass 2 — pump the measure effect, then re-render from the same hook state
  // (hookIndex must restart at 0, exactly like the test harness does).
  hookIndex = 0
  effects.length = 0
  measureEffect()
  out = Heatmap(props)
  return { out, viewport: walk(out, (n) => n.props && n.props.className === 'dshus-heat-viewport') }
}

let failures = 0
function check(name, condition, detail) {
  const ok = Boolean(condition)
  if (!ok) failures++
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail === undefined ? '' : '  → ' + detail))
}

console.log('heatmap structural check\n')

for (const [mode, pageIndex, width] of [['daily', undefined, 800], ['daily', 1, 800], ['weekly', undefined, 800], ['daily', undefined, 240], ['daily', undefined, 1400]]) {
  const { out, viewport } = render(mode, pageIndex, width)
  const cols = walkAll(out, (n) => n.props && n.props.className === 'dshus-heat-col')
  const cell = viewport.props.style['--dshus-cell-size']
  const legend = walk(out, (n) => n.props && n.props.className === 'dshus-heat-legend')
  const legendCells = walkAll(out, (n) => n.props && n.props.className === 'dshus-heat-legend-cell')
  const strays = walkAll(out, (n) => n.props && typeof n.props.className === 'string' && /dshus-heat-nav|dshus-heat-foot|dshus-heat-total-label/.test(n.props.className))

  console.log(`[${mode}] pageIndex=${pageIndex} width=${width}px → ${cols.length} columns, cell ${cell}`)
  check('grid uses the cell-size variable', /px$/.test(cell || ''), cell)
  check('no pager/foot/total-label markup leaks into the calendar', strays.length === 0, strays.map(labelOf).join(', ') || 'none')
  check('colour legend present with 4 swatches', legend !== null && legendCells.length === 4, (legend ? 'legend ok' : 'legend missing') + ', swatches=' + legendCells.length)
  check('month labels present', walkAll(out, (n) => n.props && n.props.className === 'dshus-heat-label-month').length === 1)
  check('cell count = columns × 7', walkAll(out, (n) => n.props && n.props.role === 'gridcell').length === cols.length * 7, `${cols.length * 7}`)
}

console.log('\npager rendering\n')
{
  hookIndex = 0; hooks = []; effects.length = 0
  const none = HeatPager({ info: null, onStep() {} })
  const older = walk(none, (n) => n.props && n.props['aria-label'] === '查看更早日期')
  const newer = walk(none, (n) => n.props && n.props['aria-label'] === '查看较新日期')
  check('no info → arrows hidden via nav-static class', /dshus-heat-nav-static/.test(none.props.className), none.props.className)
  check('no info → both arrows disabled', older.props.disabled === true && newer.props.disabled === true)
  check('no info → empty range label', textOf(walk(none, (n) => n.props && n.props.className === 'dshus-heat-nav-label')).trim() === '')
}
{
  const info = { page: 0, pageCount: 3, first: '2026-08-03', last: '2026-10-01', firstMonth: '8月', lastMonth: '10月' }
  let stepped = 0
  const mid = HeatPager({ info, onStep: (d) => { stepped = d } })
  const older = walk(mid, (n) => n.props && n.props['aria-label'] === '查看更早日期')
  const newer = walk(mid, (n) => n.props && n.props['aria-label'] === '查看较新日期')
  check('newest page → 更早 enabled', older.props.disabled === false)
  check('newest page → 较新 disabled', newer.props.disabled === true)
  check('range label shows month span', textOf(walk(mid, (n) => n.props && n.props.className === 'dshus-heat-nav-label')).trim() === '8月 – 10月', textOf(walk(mid, (n) => n.props && n.props.className === 'dshus-heat-nav-label')).trim())
  older.props.onClick()
  check('clicking 更早 steps +1 (older)', stepped === 1, String(stepped))
}
{
  const info = { page: 2, pageCount: 3, first: '2024-01-01', last: '2024-03-31', firstMonth: '1月', lastMonth: '3月' }
  const oldest = HeatPager({ info, onStep() {} })
  check('oldest page → 更早 disabled', walk(oldest, (n) => n.props && n.props['aria-label'] === '查看更早日期').props.disabled === true)
  check('oldest page → 较新 enabled', walk(oldest, (n) => n.props && n.props['aria-label'] === '查看较新日期').props.disabled === false)
}
{
  const info = { page: 0, pageCount: 1, first: '2026-10-01', last: '2026-10-01', firstMonth: '10月', lastMonth: '10月' }
  const single = HeatPager({ info, onStep() {} })
  check('single page → static class, no arrows', /dshus-heat-nav-static/.test(single.props.className))
  check('single page → label collapses to one month', textOf(walk(single, (n) => n.props && n.props.className === 'dshus-heat-nav-label')).trim() === '10月')
}

console.log('\npaging swaps the visible window\n')
{
  const firstDates = (out) => walkAll(out, (n) => n.props && n.props['data-week-start']).map((n) => n.props['data-week-start'])
  const p0 = render('daily', 0, 800)
  const p1 = render('daily', 1, 800)
  const a = firstDates(p0.out)
  const b = firstDates(p1.out)
  check('page 0 and page 1 show different weeks', a.length > 0 && b.length > 0 && a[0] !== b[0], `${a[0]} vs ${b[0]}`)
  check('page 1 is strictly earlier than page 0', b[b.length - 1] < a[0], `page1 ends ${b[b.length - 1]}, page0 starts ${a[0]}`)
  check('no week overlaps between the two pages', !a.some((d) => b.includes(d)))
  const clamped = render('daily', 999, 800)
  // The oldest page is the remainder of the history, so it may hold fewer than
  // visibleCount columns; what matters is that it is bounded and is the oldest.
  check('an out-of-range page index is clamped to a bounded grid',
    firstDates(clamped.out).length > 0 && firstDates(clamped.out).length <= a.length,
    `${firstDates(clamped.out).length} columns`)
  check('an out-of-range page index lands on the oldest window, not page 0',
    firstDates(clamped.out)[0] < a[0],
    `${firstDates(clamped.out)[0]} vs page0 ${a[0]}`)

  // onPageInfo must report the range the grid is actually showing. The report
  // effect is registered AFTER the measure effect, so pump the measure effect
  // first (pass 2), then run the remaining effect to collect the report.
  const reported = []
  const props = { dayMap, dayModelMap: new Map(), days: 0, mode: 'daily', tz, colorOf: () => '#0089ff', modelKey: '', syncedAt: 1, loadDayModels: null, pageIndex: 0, onPageInfo: (info) => reported.push(info) }
  hookIndex = 0
  effects.length = 0
  let tree = Heatmap(props)
  walk(tree, (n) => n.props && n.props.className === 'dshus-heat-viewport').props.ref.current = { clientWidth: 800 }
  const measure = effects[0]
  hookIndex = 0
  effects.length = 0
  measure()
  tree = Heatmap(props)
  for (const effect of effects) effect()
  check('onPageInfo reports the current page', reported.length > 0, JSON.stringify(reported[0] || null))
  if (reported.length > 0) {
    const info = reported[reported.length - 1]
    check('reported range matches the rendered weeks',
      firstDates(tree)[0] === info.first,
      `${firstDates(tree)[0]} vs ${info.first}`)
    check('reported pageCount enables paging', info.pageCount > 1, String(info.pageCount))
    check('reported month labels are populated', Boolean(info.firstMonth) && Boolean(info.lastMonth), `${info.firstMonth} – ${info.lastMonth}`)
    check('reported page is 0 on the newest window', info.page === 0, String(info.page))
  }
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'))
process.exit(failures === 0 ? 0 : 1)
