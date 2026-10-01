/**
 * Geometry check for the heatmap tooltip anchor.
 *
 * Drives the REAL `placeTip` out of src/client.js by rendering the Heatmap,
 * hovering a cell whose bounding box we control, and reading back the computed
 * tip position. Verifies the tooltip lands at the cell's BOTTOM-RIGHT and only
 * flips when it would leave the window.
 *
 * Usage: node scripts/check-heat-tip-placement.mjs
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
let effects = []

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
  useSyncExternalStore(_s, getSnapshot) { return getSnapshot() },
}

const VIEWPORT = { width: 1280, height: 800 }
const window = {
  innerWidth: VIEWPORT.width,
  innerHeight: VIEWPORT.height,
  localStorage: { getItem: () => null, setItem() {} },
  addEventListener() {}, removeEventListener() {},
  __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } },
}

const context = {
  window,
  document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} } },
  console, URLSearchParams,
  fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
  setTimeout, clearTimeout, Promise, Map, Set, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat,
}
context.globalThis = context
vm.createContext(context)
vm.runInContext(source, context)

const { Heatmap } = plugin.__components
const tz = new Date().getTimezoneOffset()
const today = new Date(Date.now() - tz * 60000).toISOString().slice(0, 10)
const todayOrdinal = Date.parse(today + 'T00:00:00Z') / 86400000
const dayMap = new Map()
for (let back = 0; back < 400; back++) {
  const date = new Date((todayOrdinal - back) * 86400000).toISOString().slice(0, 10)
  dayMap.set(date, { billed: 1000 + back * 10, calls: 3 })
}
const dayModelMap = new Map()

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

let failures = 0
function check(name, condition, detail) {
  const ok = Boolean(condition)
  if (!ok) failures++
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail === undefined ? '' : '  → ' + detail))
}

/**
 * Hover the first coloured cell and return the resulting tooltip position.
 * `rect` is the fake bounding box of the hovered cell.
 */
function hover(rect, tipSize = { width: 320, height: 200 }) {
  hookIndex = 0
  hooks = []
  effects = []
  const props = { dayMap, dayModelMap, days: 0, mode: 'daily', tz, colorOf: () => '#0089ff', modelKey: '', syncedAt: 1, loadDayModels: null, pageIndex: 0 }
  let out = Heatmap(props)
  walk(out, (n) => n.props && n.props.className === 'dshus-heat-viewport').props.ref.current = { clientWidth: 760 }
  const measure = effects[0]
  hookIndex = 0
  effects = []
  measure()
  out = Heatmap(props)

  const cell = walkAll(out, (n) => n.props && n.props.role === 'gridcell')[10]
  cell.props.onMouseMove({ currentTarget: { getBoundingClientRect: () => rect }, clientX: 0, clientY: 0 })

  // Re-render so the tip element exists, then run the measure pass with the
  // real tooltip box to let placeTip settle on its final position.
  let tip = null
  for (let i = 0; i < 3; i++) {
    hookIndex = 0
    effects = []
    out = Heatmap(props)
    tip = walk(out, (n) => n.props && n.props.className === 'dshus-tip dshus-heat-tip')
    if (!tip) break
    tip.props.ref.current = { getBoundingClientRect: () => ({ width: tipSize.width, height: tipSize.height }) }
    const settle = effects.find((fn) => { const before = effects.length; void before; return fn.length === 0 })
    // run every effect; the measure one re-places the tip
    for (const fn of effects) fn()
    void settle
  }
  hookIndex = 0
  effects = []
  out = Heatmap(props)
  tip = walk(out, (n) => n.props && n.props.className === 'dshus-tip dshus-heat-tip')
  return tip ? { x: tip.props.style.left, y: tip.props.style.top } : null
}

console.log('heatmap tooltip placement\n')

const GAP = 8
{
  // A cell in the middle of the grid: plenty of room below-right.
  const rect = { left: 400, right: 416, top: 300, bottom: 316 }
  const p = hover(rect)
  check('tip appears to the right of the cell', p && p.x >= rect.right, p && `x=${p.x} vs cell.right=${rect.right}`)
  check('tip appears below the cell', p && p.y >= rect.bottom, p && `y=${p.y} vs cell.bottom=${rect.bottom}`)
  check('tip is offset by the gap on both axes',
    p && Math.abs(p.x - (rect.right + GAP)) < 1.5 && Math.abs(p.y - (rect.bottom + GAP)) < 1.5,
    p && `x=${p.x}, y=${p.y}`)
  check('tip does not cover the hovered cell',
    p && (p.x >= rect.right || p.y >= rect.bottom),
    p && `x=${p.x}, y=${p.y}`)
}
{
  // Near the right edge: cannot fit on the right, must mirror to the left.
  const rect = { left: 1180, right: 1196, top: 300, bottom: 316 }
  const p = hover(rect)
  check('near the right edge the tip flips to the cell\'s left',
    p && p.x + 320 <= window.innerWidth, p && `x=${p.x}, tipRight=${p && p.x + 320}, vw=${window.innerWidth}`)
  check('near the right edge the tip stays below-right of the cell centre',
    p && p.y >= rect.bottom, p && `y=${p.y}`)
}
{
  // Near the bottom: cannot fit below, must flip above.
  const rect = { left: 400, right: 416, top: 760, bottom: 776 }
  const p = hover(rect)
  check('near the bottom the tip flips above the cell',
    p && p.y + 200 <= window.innerHeight, p && `y=${p.y}, tipBottom=${p && p.y + 200}, vh=${window.innerHeight}`)
  check('flipped tip sits above the cell top',
    p && p.y < rect.top, p && `y=${p.y} vs cell.top=${rect.top}`)
}
{
  // Bottom-right corner: both flips at once, still inside the window.
  const rect = { left: 1200, right: 1216, top: 770, bottom: 786 }
  const p = hover(rect)
  check('bottom-right corner keeps the tip inside the window',
    p && p.x >= 0 && p.y >= 0 && p.x + 320 <= window.innerWidth && p.y + 200 <= window.innerHeight,
    p && `x=${p.x}, y=${p.y}`)
}
{
  // Very tall tooltip (many models) must still be clamped into view.
  const rect = { left: 400, right: 416, top: 600, bottom: 616 }
  const p = hover(rect, { width: 320, height: 700 })
  check('a tall tooltip is clamped into the window',
    p && p.y >= 0 && p.y + 700 <= window.innerHeight,
    p && `y=${p.y}, bottom=${p && p.y + 700}, vh=${window.innerHeight}`)
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'))
process.exit(failures === 0 ? 0 : 1)
