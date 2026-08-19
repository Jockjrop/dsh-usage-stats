/**
 * dsh-usage-stats — browser half. Runs inside the dsh web GUI (served at
 * /plugins/dsh-usage-stats/client.js by the client-modules bundle route).
 *
 * Registers a settings page (用量统计) under settings.section: a usage
 * heatmap (GitHub-contribution-style calendar, one cell per day, colour =
 * billed tokens; rendered as one row of fixed-size cells covering the last
 * six months, so it fits the pane width without horizontal scrolling), a
 * 24-hour token bar chart (usage by hour of the current day), a per-model
 * stacked bar chart, and whole-window totals. Time-range (7/30/90/365/all)
 * and model filters are selectable; data comes from the host route
 * /api/dsh-usage-stats/stats.
 *
 * Styling uses the DSH theme alias tokens (--dsw-alias-*), so the page stays
 * legible in light AND dark themes. DOM failure policy: mounting problems are
 * logged, never thrown — an external plugin must not take the GUI down.
 */
window.__ModuleLoader__.load({
  id: 'dsh-usage-stats',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')

    /** Stable data attribute identifying this settings section. */
    var SECTION_ID = 'usage-stats'
    var STYLE_ID = 'dsh-usage-stats-styles'

    /* ------------------------------------------------------------------ */
    /* Formatting helpers                                                  */
    /* ------------------------------------------------------------------ */

    function fmt(n) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return '0'
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M'
      if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + '万'
      return String(Math.round(n))
    }

    function monthShort(dateKey) {
      var parts = String(dateKey).split('-')
      if (parts.length !== 3) return ''
      var months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
      return months[Number(parts[1]) - 1] || ''
    }

    function readJson(response) {
      return response.json().then(function (body) {
        if (!response.ok) throw new Error((body && body.error) || ('HTTP ' + response.status))
        return body
      })
    }

    /** Browser-side API client for /api/dsh-usage-stats (same origin). */
    var UsageApi = (function () {
      function UsageApi() {}
      UsageApi.prototype.stats = function (opts) {
        var search = new URLSearchParams()
        if (opts.days > 0) search.set('days', String(opts.days))
        if (opts.model) search.set('model', opts.model)
        search.set('tz', String(opts.tz !== undefined ? opts.tz : 0))
        if (opts.fresh) search.set('fresh', '1')
        var q = search.toString()
        return fetch('/api/dsh-usage-stats/stats' + (q ? '?' + q : ''), { headers: { accept: 'application/json' } }).then(readJson)
      }
      return UsageApi
    })()

    /* ------------------------------------------------------------------ */
    /* Styles — DSH alias tokens (legible in light and dark themes)        */
    /* ------------------------------------------------------------------ */

    var styles = [
      '.dshus-page { font-family: var(--dsw-font-family, ui-sans-serif, system-ui, sans-serif); color: var(--dsw-alias-label-primary, #1f2430); box-sizing: border-box; }',
      '.dshus-page * { box-sizing: border-box; }',
      '.dshus-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }',
      '.dshus-title { font-size: 15px; font-weight: 600; letter-spacing: 0.01em; line-height: 22px; margin: 0; }',
      '.dshus-sub { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12px; line-height: 18px; margin-top: 2px; }',

      '.dshus-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
      '.dshus-range { display: flex; align-items: center; gap: 2px; background: var(--dsw-alias-bg-layer-2, #f2f3f6); border-radius: 10px; padding: 3px; }',
      '.dshus-range-btn { height: 24px; padding: 0 11px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #4b5563); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }',
      '.dshus-range-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1)); }',
      '.dshus-range-btn.on { background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-brand-primary, #3b82f6); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.12); }',
      '.dshus-select { height: 30px; padding: 0 10px 0 8px; border: 1px solid var(--dsw-alias-border-l2, #d0d5dd); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 12.5px; cursor: pointer; max-width: 220px; }',
      '.dshus-btn { height: 30px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2, #d0d5dd); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2430); font: inherit; font-size: 12.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }',
      '.dshus-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1)); }',
      '.dshus-btn:disabled { opacity: 0.55; cursor: default; }',
      '.dshus-spin { width: 13px; height: 13px; border: 2px solid var(--dsw-alias-border-l2, #d0d5dd); border-top-color: var(--dsw-alias-brand-primary, #3b82f6); border-radius: 50%; animation: dshus-spin 0.7s linear infinite; display: inline-block; }',
      '@keyframes dshus-spin { to { transform: rotate(360deg); } }',

      /* metric cards */
      '.dshus-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }',
      '.dshus-card { background: var(--dsw-alias-bg-layer-1, #ffffff); border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 14px; padding: 14px 14px 12px; min-width: 0; }',
      '.dshus-card .v { font-size: 20px; font-weight: 650; letter-spacing: -0.01em; line-height: 24px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, #1f2430); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.dshus-card .k { font-size: 11.5px; color: var(--dsw-alias-label-tertiary, #6b7280); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',

      /* sections */
      '.dshus-section { margin-bottom: 22px; }',
      '.dshus-section h3 { margin: 0 0 12px; font-size: 13px; font-weight: 600; letter-spacing: 0.02em; color: var(--dsw-alias-label-secondary, #4b5563); display: flex; align-items: center; gap: 8px; }',
      '.dshus-section h3 .dshus-count { font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-caption, #9ca3af); }',

      /* heatmap — original GitHub-style calendar as ONE row of fixed-size
         cells (17px); the window is the last six months, which fits the pane
         width without horizontal scrolling */
      '.dshus-heat-wrap { width: 100%; overflow-x: auto; padding-bottom: 4px; }',
      '.dshus-heat-label-month { font-size: 10px; color: var(--dsw-alias-label-caption, #9ca3af); margin: 0 0 4px; height: 14px; }',
      '.dshus-heat { display: inline-flex; gap: 3px; }',
      '.dshus-heat-col { display: flex; flex-direction: column; gap: 3px; }',
      '.dshus-cell { width: 17px; height: 17px; border-radius: 3px; background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 12%, transparent); }',
      '.dshus-cell:hover { outline: 1px solid var(--dsw-alias-label-secondary, #4b5563); outline-offset: 1px; }',
      '.dshus-legend { display: flex; align-items: center; gap: 5px; margin-top: 10px; font-size: 11px; color: var(--dsw-alias-label-secondary, #4b5563); }',
      '.dshus-legend .dshus-cell { width: 10px; height: 10px; }',

      /* bars */
      '.dshus-bars { display: flex; align-items: flex-end; gap: 3px; height: 120px; overflow-x: auto; padding-bottom: 2px; }',
      '.dshus-bar { flex: 1 1 auto; min-width: 6px; border-radius: 3px 3px 0 0; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; min-height: 2px; }',
      '.dshus-bar-seg { width: 100%; }',
      '.dshus-bar-labels { display: flex; gap: 3px; margin-top: 4px; }',
      '.dshus-bar-label { flex: 1 1 auto; min-width: 6px; font-size: 9px; line-height: 12px; text-align: center; color: var(--dsw-alias-label-caption, #9ca3af); font-variant-numeric: tabular-nums; }',

      /* donut (per-model token share) */
      '.dshus-donut { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }',
      '.dshus-donut-wrap { position: relative; flex: 0 0 auto; }',
      '.dshus-donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }',
      '.dshus-donut-center .v { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; line-height: 22px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, #1f2430); }',
      '.dshus-donut-center .k { font-size: 10.5px; color: var(--dsw-alias-label-caption, #9ca3af); margin-top: 2px; }',
      '.dshus-donut-legend { flex: 1 1 260px; min-width: 230px; display: flex; flex-direction: column; gap: 7px; }',
      '.dshus-donut-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-primary, #1f2430); cursor: pointer; }',
      '.dshus-tip { position: fixed; z-index: 9999; pointer-events: none; background: var(--dsw-alias-bg-layer-3, #1f2430); color: var(--dsw-alias-label-inverse, #ffffff); border-radius: 8px; padding: 6px 10px; font-size: 12px; line-height: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.28); max-width: 280px; white-space: normal; }',
      '.dshus-tip-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.dshus-tip-val { opacity: 0.88; margin-top: 2px; font-variant-numeric: tabular-nums; white-space: pre-line; }',
      '.dshus-donut-dot { width: 10px; height: 10px; border-radius: 3px; flex: 0 0 auto; }',
      '.dshus-donut-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }',
      '.dshus-donut-pct { flex: 0 0 46px; text-align: right; color: var(--dsw-alias-label-secondary, #4b5563); font-variant-numeric: tabular-nums; }',
      '.dshus-donut-val { flex: 0 0 70px; text-align: right; color: var(--dsw-alias-label-secondary, #4b5563); font-variant-numeric: tabular-nums; }',
      '.dshus-card-model .v { font-size: 15px; line-height: 20px; }',
      '.dshus-card-model .sub { font-size: 11px; color: var(--dsw-alias-label-caption, #9ca3af); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',

      '.dshus-muted { color: var(--dsw-alias-label-tertiary, #6b7280); font-size: 12.5px; }',
      '.dshus-error { color: var(--dsw-alias-state-error-primary, #dc2626); font-size: 13px; margin: 8px 0; white-space: pre-wrap; }',
      '.dshus-foot { color: var(--dsw-alias-label-caption, #9ca3af); font-size: 11px; line-height: 16px; margin-top: 4px; }',
    ].join('\n')

    function injectStyles() {
      // Always refresh the stylesheet content, even when the element already
      // exists: a previous in-page load may have injected an older version
      // (e.g. stretched cells) whose rules would otherwise keep applying.
      var style = document.getElementById(STYLE_ID)
      if (!style) {
        style = document.createElement('style')
        style.id = STYLE_ID
        document.head.appendChild(style)
      }
      style.textContent = styles
    }

    /* ------------------------------------------------------------------ */
    /* Heatmap (GitHub-style calendar)                                     */
    /* ------------------------------------------------------------------ */

    /**
     * Build {weeks: [{monday, cells: [...]}], max} from a day map within a
     * window. Weeks run Monday-first in chronological order; the renderer
     * shows them as ONE row of fixed-size cells (original GitHub-calendar
     * look) — the six-month window fits the pane width without scrolling.
     */
    function buildHeatmap(dayMap, days) {
      var now = new Date()
      var end = now
      // Selected window start (colouring only): days>0 = now-(days-1)d; 0 = all
      // (but the calendar shape itself is always six months, so "all" still
      // renders the same fixed-width strip).
      var winStartMs = end.getTime()
      if (days > 0) {
        winStartMs = end.getTime() - (days - 1) * 86400000
      } else {
        winStartMs = end.getTime() - (HEATMAP_DAYS - 1) * 86400000
      }
      // Fixed shape: always render the last six months (HEATMAP_DAYS) from the
      // Monday before the window start to today, so switching the time filter
      // never changes the calendar's width — only the coloured range changes.
      var allStartMs = end.getTime() - (HEATMAP_DAYS - 1) * 86400000
      var start = new Date(allStartMs)
      var startDow = (start.getDay() + 6) % 7 // 0 = Monday
      var monday = new Date(start.getTime() - startDow * 86400000)
      function key(d) {
        var y = d.getFullYear()
        var m = String(d.getMonth() + 1).padStart(2, '0')
        var dd = String(d.getDate()).padStart(2, '0')
        return y + '-' + m + '-' + dd
      }
      var winStartKey = key(new Date(winStartMs))
      var weeks = []
      var max = 0
      var cursor = new Date(monday.getTime())
      var guard = 0
      while (cursor.getTime() <= end.getTime() && guard < 240) {
        var cells = []
        for (var i = 0; i < 7; i++) {
          var d = new Date(cursor.getTime() + i * 86400000)
          var k = key(d)
          var inWindow = k >= winStartKey && d.getTime() <= end.getTime()
          var bucket = dayMap.get(k) || null
          var v = bucket ? bucket.billed : 0
          if (v > max && inWindow) max = v
          cells.push({ date: k, value: v, bucket: bucket, inFuture: d.getTime() > end.getTime(), inWindow: inWindow })
        }
        weeks.push({ monday: key(cursor), cells: cells })
        cursor = new Date(cursor.getTime() + 7 * 86400000)
        guard++
      }
      return { weeks: weeks, max: max }
    }

    function heatLevel(value, max) {
      if (!(value > 0) || !(max > 0)) return 0
      var r = value / max
      if (r > 0.75) return 4
      if (r > 0.5) return 3
      if (r > 0.25) return 2
      return 1
    }

    /** Colour for a heat level — brand blue blended to transparent via color-mix. */
    function cellColor(level) {
      switch (level) {
        case 1: return 'color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 22%, transparent)'
        case 2: return 'color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 45%, transparent)'
        case 3: return 'color-mix(in srgb, var(--dsw-alias-brand-primary, #3b82f6) 72%, transparent)'
        case 4: return 'var(--dsw-alias-brand-primary, #3b82f6)'
        default: return ''
      }
    }

    function Heatmap(props) {
      var dayMap = props.dayMap
      var days = props.days
      var intl = props.intl
      var heat = buildHeatmap(dayMap, days)
      if (heat.weeks.length === 0) return React.createElement('div', { className: 'dshus-muted' }, '窗口内没有记录')

      // Custom hover tooltip (same style as the donut one).
      var tipState = React.useState(null)
      var tip = tipState[0]
      var setTip = tipState[1]
      var showTip = function (e, name, val) {
        var x = e.clientX + 14
        var y = e.clientY + 14
        if (x + 280 > window.innerWidth) x = e.clientX - 280
        if (y + 140 > window.innerHeight) y = e.clientY - 140
        setTip({ x: x, y: y, name: name, val: val })
      }
      var hideTip = function () { setTip(null) }
      var tipEl = tip === null ? null : React.createElement('div', { className: 'dshus-tip', style: { left: tip.x, top: tip.y } },
        React.createElement('div', { className: 'dshus-tip-name' }, tip.name),
        React.createElement('div', { className: 'dshus-tip-val' }, tip.val),
      )

      // Single row, original look: one strip of large fixed-size week
      // columns. Month labels are evenly distributed: each label is centred
      // over the horizontal midpoint of its month's week columns, so the
      // spacing between labels is uniform regardless of month length.
      var CELL = 17
      var GAP = 3
      var STEP = CELL + GAP
      var segs = []
      var prevMonth = ''
      for (var wi = 0; wi < heat.weeks.length; wi++) {
        var m = monthShort(heat.weeks[wi].monday)
        if (m !== prevMonth) {
          if (prevMonth !== '') segs[segs.length - 1].end = wi - 1
          segs.push({ label: m, start: wi, end: wi })
          prevMonth = m
        }
      }
      if (segs.length > 0) segs[segs.length - 1].end = heat.weeks.length - 1
      var heatWidth = heat.weeks.length * STEP - GAP
      var monthLabels = segs.map(function (seg, i) {
        var cx = ((seg.start + seg.end) / 2) * STEP + CELL / 2
        // Keep the label fully inside the strip even for a 1-week edge month
        // (wider labels like 12月 need extra room on both sides).
        cx = Math.min(Math.max(cx, 16), heatWidth - 16)
        return React.createElement('span', {
          key: 'ml' + i,
          style: { position: 'absolute', left: cx, transform: 'translateX(-50%)', whiteSpace: 'nowrap' },
        }, seg.label)
      })
      var monthRow = React.createElement('div', {
        className: 'dshus-heat-label-month',
        style: { position: 'relative', width: heatWidth, height: 14 },
      }, monthLabels)

      var weekCols = heat.weeks.map(function (week, w) {
        return React.createElement('div', { className: 'dshus-heat-col', key: week.monday },
          week.cells.map(function (cell, c) {
            // Cells outside the selected time window (or in the future) keep
            // the default empty-cell blue so the six-month strip stays one
            // solid rectangle — only the coloured range changes with filter.
            if (cell.inFuture || !cell.inWindow) {
              return React.createElement('div', {
                className: 'dshus-cell',
                key: w + '-' + c,
                onMouseMove: function (e) { showTip(e, cell.date, cell.inWindow ? '' : '不在所选时间范围内') },
                onMouseLeave: hideTip,
              })
            }
            var level = heatLevel(cell.value, heat.max)
            var tipName
            var tipVal
            if (cell.bucket) {
              tipName = cell.date + '  ' + fmt(cell.value) + ' tokens'
              var lines = []
              if (intl) {
                lines.push('输入 ' + fmt(cell.bucket.inputTokens))
                lines.push('输出 ' + fmt(cell.bucket.outputTokens))
              }
              if (cell.bucket.cacheReadTokens) lines.push('缓存读 ' + fmt(cell.bucket.cacheReadTokens))
              if (cell.bucket.cacheWriteTokens) lines.push('缓存写 ' + fmt(cell.bucket.cacheWriteTokens))
              if (cell.bucket.reasoningTokens) lines.push('推理 ' + fmt(cell.bucket.reasoningTokens))
              lines.push(cell.bucket.calls + ' 次调用')
              tipVal = lines.join('\n')
            } else {
              tipName = cell.date
              tipVal = '无记录'
            }
            return React.createElement('div', {
              className: 'dshus-cell',
              key: w + '-' + c,
              onMouseMove: function (e) { showTip(e, tipName, tipVal) },
              onMouseLeave: hideTip,
              style: level > 0 ? { background: cellColor(level) } : undefined,
            })
          }),
        )
      })

      var legend = React.createElement('div', { className: 'dshus-legend' },
        React.createElement('span', null, '少'),
        React.createElement('div', { className: 'dshus-cell' }),
        React.createElement('div', { className: 'dshus-cell', style: { background: cellColor(1) } }),
        React.createElement('div', { className: 'dshus-cell', style: { background: cellColor(2) } }),
        React.createElement('div', { className: 'dshus-cell', style: { background: cellColor(3) } }),
        React.createElement('div', { className: 'dshus-cell', style: { background: cellColor(4) } }),
        React.createElement('span', null, '多'),
      )
      return React.createElement('div', null,
        React.createElement('div', { className: 'dshus-heat-wrap' },
          monthRow,
          React.createElement('div', { className: 'dshus-heat' }, weekCols),
        ),
        legend,
        tipEl,
      )
    }

    /* ------------------------------------------------------------------ */
    /* 24-hour token bar chart (usage by hour of day over the window)      */
    /* ------------------------------------------------------------------ */

    function Bars(props) {
      var hourModels = props.hourModels // [{hour, models:[{key,provider,model,billed}]}]
      var colorOf = props.colorOf
      if (!hourModels || hourModels.length === 0) return React.createElement('div', { className: 'dshus-muted' }, '窗口内没有记录')

      // Custom hover tooltip (same style as the donut / heatmap ones).
      var tipState = React.useState(null)
      var tip = tipState[0]
      var setTip = tipState[1]
      var showTip = function (e, name, val) {
        var x = e.clientX + 14
        var y = e.clientY + 14
        if (x + 260 > window.innerWidth) x = e.clientX - 260
        setTip({ x: x, y: y, name: name, val: val })
      }
      var hideTip = function () { setTip(null) }
      var tipEl = tip === null ? null : React.createElement('div', { className: 'dshus-tip', style: { left: tip.x, top: tip.y } },
        React.createElement('div', { className: 'dshus-tip-name' }, tip.name),
        React.createElement('div', { className: 'dshus-tip-val' }, tip.val),
      )

      var max = 0
      for (var i = 0; i < hourModels.length; i++) {
        var tot = 0
        var ms = hourModels[i].models || []
        for (var j = 0; j < ms.length; j++) tot += ms[j].billed
        if (tot > max) max = tot
      }
      var bars = hourModels.map(function (item) {
        var ms = item.models || []
        var tot = 0
        for (var j = 0; j < ms.length; j++) tot += ms[j].billed
        var empty = !(tot > 0)
        var h = max > 0 ? Math.round((tot / max) * 100) : 0
        var segs = ms.map(function (mm) {
          var sh = tot > 0 ? Math.round((mm.billed / tot) * 100) : 0
          var segName = item.hour + '时  ' + (mm.provider ? mm.provider + ' · ' : '') + mm.model
          var segVal = fmt(mm.billed) + ' tokens'
          return React.createElement('div', {
            className: 'dshus-bar-seg',
            key: mm.key,
            onMouseMove: function (e) { showTip(e, segName, segVal) },
            onMouseLeave: hideTip,
            style: { height: sh + '%', background: colorOf ? colorOf(mm.key) : undefined },
          })
        })
        return React.createElement('div', {
          className: 'dshus-bar',
          key: item.hour,
          onMouseMove: function (e) { showTip(e, item.hour + '时', fmt(tot) + ' tokens') },
          onMouseLeave: hideTip,
          // Zero-usage hours keep the grid slot but render no visible bar.
          style: empty
            ? { height: 0, minHeight: 0, background: 'transparent' }
            : { height: Math.max(4, h) + '%' },
        }, segs)
      })
      var labels = hourModels.map(function (item) {
        return React.createElement('div', { className: 'dshus-bar-label', key: item.hour }, item.hour)
      })
      return React.createElement('div', null,
        React.createElement('div', { className: 'dshus-bars' }, bars),
        React.createElement('div', { className: 'dshus-bar-labels' }, labels),
        React.createElement('div', { className: 'dshus-foot' }, '今天各小时（0–23 时）的 token 用量（含输入 / 输出 / 缓存读 / 缓存写）。'),
        tipEl,
      )
    }

    /* ------------------------------------------------------------------ */
    /* Per-model donut chart                                               */
    /* ------------------------------------------------------------------ */

    /** Distinct, theme-agnostic hues for the model segments. */
    var DONUT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6']

    function Donut(props) {
      var byModel = props.byModel || []
      var onSelect = props.onSelect
      var colorOf = props.colorOf
      if (byModel.length === 0) return React.createElement('div', { className: 'dshus-muted' }, '没有按模型聚合的数据')
      var total = 0
      for (var i = 0; i < byModel.length; i++) total += byModel[i].billed
      if (!(total > 0)) return React.createElement('div', { className: 'dshus-muted' }, '没有按模型聚合的数据')

      // Keep the chart readable: top 8 models + "其他" for the rest.
      var show = byModel.slice(0, 8)
      var restBilled = 0
      for (var r = 8; r < byModel.length; r++) restBilled += byModel[r].billed
      if (restBilled > 0) show.push({ key: '__rest__', provider: '', model: '其他', billed: restBilled })

      // Custom hover tooltip (replaces the ugly native one). Position follows
      // the cursor; content = model + tokens + share.
      var tipState = React.useState(null)
      var tip = tipState[0]
      var setTip = tipState[1]
      var tipKeyState = React.useState('')
      var tipKey = tipKeyState[0]
      var setTipKey = tipKeyState[1]
      var showTip = function (e, key) {
        setTipKey(key)
        var x = e.clientX + 14
        var y = e.clientY + 14
        if (x + 220 > window.innerWidth) x = e.clientX - 220
        setTip({ x: x, y: y })
      }
      var hideTip = function () {
        setTip(null)
        setTipKey('')
      }
      var tipData = null
      for (var ti = 0; ti < show.length; ti++) {
        if (show[ti].key === tipKey) {
          tipData = show[ti]
          break
        }
      }
      var tipEl = null
      if (tip !== null && tipData) {
        var tipLabel = tipData.provider ? tipData.provider + ' · ' + tipData.model : tipData.model
        var tipPct = (tipData.billed / total) * 100
        tipEl = React.createElement('div', {
          className: 'dshus-tip',
          style: { left: tip.x, top: tip.y },
        },
          React.createElement('div', { className: 'dshus-tip-name' }, tipLabel),
          React.createElement('div', { className: 'dshus-tip-val' },
            fmt(tipData.billed) + ' tokens · ' + tipPct.toFixed(1) + '%'),
        )
      }

      var SIZE = 168
      var R = 62
      var STROKE = 26
      var C = 2 * Math.PI * R
      var cumAngle = -90 // start at 12 o'clock
      var arcs = show.map(function (m, idx) {
        var frac = m.billed / total
        var arcLen = Math.max(frac * C - 2, 0.5)
        var el = React.createElement('circle', {
          key: m.key,
          cx: SIZE / 2,
          cy: SIZE / 2,
          r: R,
          fill: 'none',
          stroke: colorOf ? colorOf(m.key) : DONUT_COLORS[idx % DONUT_COLORS.length],
          strokeWidth: STROKE,
          strokeDasharray: arcLen + ' ' + (C - arcLen),
          transform: 'rotate(' + cumAngle + ' ' + (SIZE / 2) + ' ' + (SIZE / 2) + ')',
          style: { cursor: m.key === '__rest__' ? 'default' : 'pointer' },
          onMouseMove: function (e) { showTip(e, m.key) },
          onMouseLeave: hideTip,
        })
        cumAngle += frac * 360
        return el
      })

      var legend = show.map(function (m, idx) {
        var pct = (m.billed / total) * 100
        var label = m.provider ? m.provider + ' · ' + m.model : m.model
        return React.createElement('div', {
          className: 'dshus-donut-row',
          key: m.key,
          onMouseMove: function (e) { showTip(e, m.key) },
          onMouseLeave: hideTip,
          onClick: m.key !== '__rest__' && onSelect ? function () { onSelect(m.key) } : undefined,
        },
          React.createElement('span', { className: 'dshus-donut-dot', style: { background: colorOf ? colorOf(m.key) : DONUT_COLORS[idx % DONUT_COLORS.length] } }),
          React.createElement('span', { className: 'dshus-donut-name' }, label),
          React.createElement('span', { className: 'dshus-donut-pct' }, pct.toFixed(1) + '%'),
          React.createElement('span', { className: 'dshus-donut-val' }, fmt(m.billed)),
        )
      })

      return React.createElement('div', { className: 'dshus-donut' },
        React.createElement('div', { className: 'dshus-donut-wrap', style: { width: SIZE, height: SIZE } },
          React.createElement('svg', { width: SIZE, height: SIZE, viewBox: '0 0 ' + SIZE + ' ' + SIZE }, arcs),
          React.createElement('div', { className: 'dshus-donut-center' },
            React.createElement('div', { className: 'v' }, fmt(total)),
            React.createElement('div', { className: 'k' }, 'tokens'),
          ),
        ),
        React.createElement('div', { className: 'dshus-donut-legend' }, legend),
        tipEl,
      )
    }

    /* ------------------------------------------------------------------ */
    /* Settings section page                                               */
    /* ------------------------------------------------------------------ */

    /** Fixed heatmap window: the last six months. */
    var HEATMAP_DAYS = 182

    function UsageStatsSection(props) {
      var api = props.api
      var intl = props.intl
      var daysState = React.useState(HEATMAP_DAYS)
      var days = daysState[0]
      var setDays = daysState[1]

      var modelState = React.useState('')
      var model = modelState[0]
      var setModel = modelState[1]

      var dataState = React.useState(null)
      var data = dataState[0]
      var setData = dataState[1]

      var loadingState = React.useState(false)
      var loading = loadingState[0]
      var setLoading = loadingState[1]

      var errorState = React.useState(null)
      var error = errorState[0]
      var setError = errorState[1]

      var staleState = React.useState(false)
      var stale = staleState[0]
      var setStale = staleState[1]

      var tzOffset = (function () {
        try { return new Date().getTimezoneOffset() } catch (e) { return 0 }
      })()

      function load(opts) {
        var optDays = opts && opts.days !== undefined ? opts.days : days
        var optModel = opts && opts.model !== undefined ? opts.model : model
        var fresh = opts && opts.fresh === true
        setLoading(true)
        setError(null)
        api.stats({ days: optDays, model: optModel, tz: tzOffset, fresh: fresh })
          .then(function (body) {
            setData(body)
            setLoading(false)
            setStale(!!body.stale)
          })
          .catch(function (err) {
            setError(String(err && err.message || err))
            setLoading(false)
          })
      }

      React.useEffect(function () {
        var cancelled = false
        var timer = null
        var attempt = 0
        // Load immediately; if the host is still finishing a cold scan it
        // answers `stale:true` with the current snapshot, so keep re-pulling
        // briefly (non-fresh, cheap) until the corpus is ready.
        function start() {
          attempt++
          setLoading(true)
          setError(null)
          api.stats({ days: days, model: '', tz: tzOffset, fresh: false })
            .then(function (body) {
              if (cancelled) return
              setData(body)
              setLoading(false)
              var isStale = !!body.stale
              setStale(isStale)
              if (isStale && attempt < 40) {
                timer = setTimeout(start, 2500)
              }
            })
            .catch(function (err) {
              if (cancelled) return
              setError(String(err && err.message || err))
              setLoading(false)
            })
        }
        start()
        return function () {
          cancelled = true
          if (timer !== null) clearTimeout(timer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      var RANGE_OPTIONS = [
        { days: 7, label: '7天' },
        { days: 30, label: '30天' },
        { days: 182, label: '半年' },
        { days: 0, label: '全部' },
      ]

      var changeDays = function (d) {
        setDays(d)
        load({ days: d, model: model })
      }
      var changeModel = function (m) {
        setModel(m)
        load({ days: days, model: m })
      }
      var refresh = function () {
        load({ days: days, model: model, fresh: true })
      }

      var totals = data && data.totals
      var byModel = data ? data.byModel : []
      var dayMap = new Map()
      if (data) {
        for (var i = 0; i < data.byDay.length; i++) dayMap.set(data.byDay[i].date, data.byDay[i])
      }
      // One stable colour per model (ranked by total billed, same order as the
      // donut) so the 24-hour bars and the donut agree on colours.
      var modelColor = {}
      for (var ci = 0; ci < byModel.length; ci++) modelColor[byModel[ci].key] = DONUT_COLORS[ci % DONUT_COLORS.length]
      modelColor['__rest__'] = '#94a3b8'
      modelColor['__all__'] = 'var(--dsw-alias-brand-primary, #3b82f6)'
      var colorOf = function (key) { return modelColor[key] || '#94a3b8' }
      // Per-model hour breakdown for the stacked 24h bars. Older hosts (before
      // this feature) do not serve byHourModels: fall back to the aggregated
      // byHour series as a single "全部" segment so the chart still renders.
      var hourModels = []
      if (data) {
        if (data.byHourModels && data.byHourModels.length > 0) {
          hourModels = data.byHourModels
        } else {
          hourModels = data.byHour.map(function (h) {
            return { hour: h.hour, models: [{ key: '__all__', provider: '', model: '全部', billed: h.billed }] }
          })
        }
      }
      var modelName = ''
      if (data && model) {
        for (var m = 0; m < byModel.length; m++) if (byModel[m].key === model) modelName = byModel[m].model
      }

      var tools = React.createElement('div', { className: 'dshus-tools' },
        React.createElement('div', { className: 'dshus-range' },
          RANGE_OPTIONS.map(function (o) {
            return React.createElement('button', {
              key: o.label,
              type: 'button',
              className: 'dshus-range-btn' + (days === o.days ? ' on' : ''),
              onClick: function () { changeDays(o.days) },
              title: '查看最近 ' + (o.days > 0 ? o.days + ' 天' : '全部历史'),
            }, o.label)
          }),
        ),
        React.createElement('button', { className: 'dshus-btn', onClick: refresh, disabled: loading },
          loading ? React.createElement('span', { className: 'dshus-spin' }) : React.createElement('span', null, '刷新'),
        ),
      )

      var cards
      if (totals) {
        // Active days + current streak are computed from the windowed day
        // series (same 182-day window as the heatmap), keyed in the viewer's
        // local timezone like the host buckets.
        var activeSet = new Set()
        var activeDays = 0
        for (var ad = 0; ad < data.byDay.length; ad++) {
          if (data.byDay[ad].billed > 0) {
            activeDays++
            activeSet.add(data.byDay[ad].date)
          }
        }
        var dayKey = function (d) {
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
        }
        var streak = 0
        var cursor = new Date()
        // A day without usage yet doesn't break the streak (count from
        // yesterday when today is still empty).
        if (!activeSet.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - 86400000)
        while (activeSet.has(dayKey(cursor))) {
          streak++
          cursor = new Date(cursor.getTime() - 86400000)
        }
        var topModel = byModel.length > 0 ? byModel[0] : null
        var card = function (v, k, opts) {
          opts = opts || {}
          var display = typeof v === 'number' ? fmt(v) : v
          return React.createElement('div', { className: 'dshus-card' + (opts.cls ? ' ' + opts.cls : '') },
            React.createElement('div', { className: 'v' }, display),
            React.createElement('div', { className: 'k' }, k),
          )
        }
        cards = React.createElement('div', { className: 'dshus-cards' },
          card(totals.billed, 'tokens 用量'),
          card(data.sessionsWithUsage, '会话数量'),
          card(data.messages, '消息数量'),
          card(activeDays, '活跃天数'),
          card(streak, '当前连续天数'),
          topModel
            ? React.createElement('div', { className: 'dshus-card dshus-card-model' },
                React.createElement('div', { className: 'v' }, topModel.model),
                React.createElement('div', { className: 'sub' }, topModel.provider + ' · ' + (totals.billed > 0 ? ((topModel.billed / totals.billed) * 100).toFixed(1) + '%' : '')),
                React.createElement('div', { className: 'k' }, '最常用模型'),
              )
            : card('—', '最常用模型'),
        )
      } else {
        cards = React.createElement('div', { className: 'dshus-muted' }, '暂无数据')
      }

      var windowLabel = days > 0 ? '最近' + days + '天' : '全部'
      return React.createElement('div', { className: 'dshus-page' },
        React.createElement('div', { className: 'dshus-head' },
          React.createElement('div', null,
            React.createElement('h2', { className: 'dshus-title' }, '用量统计'),
            React.createElement('div', { className: 'dshus-sub' }, '基于本地会话日志的模型 token 用量（输入 / 输出 / 缓存 / 推理）'),
          ),
          tools,
        ),
        error !== null && React.createElement('div', { className: 'dshus-error' }, error),
        stale && React.createElement('div', { className: 'dshus-muted', style: { marginBottom: 10, fontSize: 12 } },
          '本地缓存数据正在后台重新计算，页面会自动刷新…',
        ),
        cards,
        React.createElement('div', { className: 'dshus-section' },
          React.createElement('h3', null, '使用量热力图',
          React.createElement('span', { className: 'dshus-count' }, '（' + windowLabel + (modelName ? '・' + modelName : '') + '）'),
        ),
          React.createElement(Heatmap, { dayMap: dayMap, days: days, intl: intl }),
        ),
        React.createElement('div', { className: 'dshus-section' },
          React.createElement('h3', null, '24小时用量',
          React.createElement('span', { className: 'dshus-count' }, '（今天' + (modelName ? '・' + modelName : '') + '）'),
        ),
          React.createElement(Bars, { hourModels: hourModels, colorOf: colorOf }),
        ),
        React.createElement('div', { className: 'dshus-section' },
          React.createElement('h3', null, '模型用量'),
          React.createElement(Donut, { byModel: byModel, colorOf: colorOf, onSelect: function (key) { changeModel(key === model ? '' : key) } }),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Plugin entry                                                        */
    /* ------------------------------------------------------------------ */

    /** Required services: slots (to register the settings section). */
    var inject = ['slots']

    /**
     * Mount the 用量统计 settings section.
     * @param ctx - client root context (slots service).
     */
    function apply(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) {
        console.warn('[dsh-usage-stats] slots service unavailable')
        return
      }
      var api = new UsageApi()
      try {
        injectStyles()
        ctx.effect(function () {
          return slots.inject('settings.section', function () {
            return slots.register(
              {
                name: 'settings.section',
                id: SECTION_ID,
                order: 32,
                label: function () { return '用量统计' },
              },
              function (slotProps) {
                return React.createElement(UsageStatsSection, { api: api, intl: (slotProps && slotProps.intl !== undefined) ? slotProps.intl : true })
              },
            )
          })
        }, 'dsh-usage-stats: settings section')
      } catch (error) {
        console.warn('[dsh-usage-stats] mount failed:', error)
      }
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})