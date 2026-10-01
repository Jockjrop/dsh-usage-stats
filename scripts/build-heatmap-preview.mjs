/**
 * Build a static HTML snapshot of the redesigned heatmap card, using the REAL
 * CSS rules extracted from src/client.js, so the layout can be screenshotted
 * and eyeballed without booting the host.
 *
 * Usage: node scripts/build-heatmap-preview.mjs
 * Writes: preview-heatmap.html (next to this package) — dev artifact only.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src', 'client.js'), 'utf8')

// --- pull the styles array out of the bundle -------------------------------
const start = source.indexOf('var styles = [')
const end = source.indexOf('].join', start)
const block = source.slice(start, end)
const rules = [...block.matchAll(/^\s*'((?:[^'\\]|\\.)*)',\s*$/gm)].map((m) => m[1].replace(/\\'/g, "'"))
if (rules.length < 50) throw new Error('failed to extract the stylesheet, got ' + rules.length + ' rules')

// --- reproduce the calendar markup the component now emits -----------------
const WEEK_LEVELS = [
  [0, 0, 0, 1, 2, 0, 0], [0, 1, 1, 2, 3, 1, 0], [0, 0, 2, 3, 4, 2, 1],
  [1, 2, 3, 4, 4, 3, 2], [0, 1, 2, 3, 3, 2, 1], [2, 3, 4, 4, 3, 2, 1],
  [0, 0, 1, 2, 3, 1, 0], [1, 1, 2, 3, 4, 3, 2], [0, 2, 3, 4, 4, 2, 1],
  [0, 0, 0, 1, 2, 1, 0], [1, 2, 2, 3, 4, 3, 1], [0, 0, 1, 1, 2, 2, 1],
]
const MONTHS = ['3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月']
const CELL = 21.36

function colorFor(level) {
  switch (level) {
    case 1: return 'color-mix(in srgb, var(--dshus-heat, #0089ff) 22%, transparent)'
    case 2: return 'color-mix(in srgb, var(--dshus-heat, #0089ff) 45%, transparent)'
    case 3: return 'color-mix(in srgb, var(--dshus-heat, #0089ff) 72%, transparent)'
    case 4: return 'var(--dshus-heat, #0089ff)'
    default: return ''
  }
}

// 12 columns ≈ the 12 weeks above; laid out left-to-right like the component.
const columns = WEEK_LEVELS.map((levels) => {
  const cells = levels.map((level) => {
    const style = level > 0 ? ` style="background:${colorFor(level)}"` : ''
    return `<div class="dshus-cell" role="gridcell"${style}></div>`
  }).join('')
  return `<div class="dshus-heat-col">${cells}</div>`
}).join('')

const monthLabels = MONTHS.map((label, i) => {
  const cx = 40 + i * 118
  return `<span style="position:absolute;left:${cx}px;transform:translateX(-50%);white-space:nowrap">${label}</span>`
}).join('')

const legend = `<div class="dshus-heat-legend" aria-hidden="true">
      <span>少</span>
      ${[1, 2, 3, 4].map((l) => `<span class="dshus-heat-legend-cell" style="background:${colorFor(l)}"></span>`).join('')}
      <span>多</span>
    </div>`

const pager = `<div class="dshus-heat-nav-group" role="group" aria-label="热力图翻页">
        <span class="dshus-heat-nav-label" title="当前显示的日期范围">8月 – 10月</span>
        <button type="button" class="dshus-heat-nav" aria-label="查看更早日期"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M11 3 4 8l7 5Z" fill="currentColor"></path></svg></button>
        <button type="button" class="dshus-heat-nav" aria-label="查看较新日期" disabled><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l7 5-7 5Z" fill="currentColor"></path></svg></button>
      </div>`

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>热力图布局预览</title>
<style>
:root{
  --dsw-alias-bg-layer-1:#1c1c1e; --dsw-alias-bg-layer-2:#2c2c2e;
  --dsw-alias-border-l2:#414144; --dsw-alias-label-primary:#f2f2f7;
  --dsw-alias-label-secondary:#b9b9c0; --dsw-alias-label-caption:#8e8e93;
  --dsw-alias-interactive-bg-hover:rgba(128,128,128,.16);
  --dsw-alias-brand-primary:#3b82f6;
}
body{background:#121214;margin:0;padding:24px;font-family:ui-sans-serif,system-ui,"Microsoft YaHei",sans-serif}
.wrap{max-width:860px;margin:0 auto}
${rules.join('\n')}
/* preview-only: the component sets --dshus-heat:#0089ff inline on its root, so
   mirror that here (otherwise the page-level green fallback wins) and pin the
   calendar to a representative cell size. */
.dshus-page{--dshus-heat:#0089ff}
.dshus-heat-viewport{--dshus-cell-size:${CELL}px}
</style></head>
<body><div class="wrap">
<div class="dshus-page"><div class="dshus-panels"><div class="dshus-module">
  <h3>使用量热力图<div class="dshus-head-tools">${pager}
      <div class="dshus-range dshus-heat-modes" aria-label="热力图时长">
        <button type="button" class="dshus-range-btn on">每日</button>
        <button type="button" class="dshus-range-btn">每周</button>
      </div></div></h3>
  <div style="--dshus-heat:#0089ff">
    <div class="dshus-heat-wrap"><div class="dshus-heat-viewport">
      <div class="dshus-heat" role="grid" aria-label="使用量热力图">${columns}</div>
      <div class="dshus-heat-label-month" style="position:relative;height:16px">${monthLabels}</div>
    </div></div>
    ${legend}
  </div>
</div></div></div>
</div></body></html>`

const outPath = path.join(root, 'preview-heatmap.html')
fs.writeFileSync(outPath, html)
console.log('wrote ' + outPath + ' (' + rules.length + ' CSS rules, ' + WEEK_LEVELS.length + ' week columns)')
