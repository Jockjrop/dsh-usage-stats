/** DSH Desktop usage statistics renderer. */
window.__ModuleLoader__.load({ id: '__DSH_USAGE_STATS_PACKAGE__', factory: (require) => {
'use strict'
var module = { exports: {} }, exports = module.exports
var React = require('react')

var SECTION_ID = 'usage-stats'

var STYLE_ID = 'dsh-usage-stats-styles'

var PLUGIN_VERSION = '__DSH_USAGE_STATS_VERSION__'

var localeService = null

var translate = null

// __DSH_USAGE_STATS_MESSAGES__
var messages = createClientMessages()

function t(text, params) {
      if (translate) return translate(text, params)
      return String(text || '').replace(/\{(\w+)\}/g, function (match, key) { return params && key in params ? String(params[key]) : match })
    }

function currentLanguage() {
      return localeService ? String(localeService.getSnapshot().active).toLowerCase().split('-')[0] : 'zh'
    }

function useLocaleRevision() {
      if (localeService && React.useSyncExternalStore) React.useSyncExternalStore(function (listener) { return localeService.subscribe(listener) }, function () { return localeService.getSnapshot() })
    }

function quotaLabel(label, custom) {
      if (custom) return label
      // Provider parsers build labels such as `MiniMax · 5 小时剩余` or
      // `席位 积分剩余`; translate the descriptive prefix too so a Chinese
      // model/seat name does not leak into the English or Japanese UI.
      var localizePrefix = function (value) {
        var parts = String(value).split(' · ')
        return parts.map(function (part, index) {
          var lead = /^\s*/.exec(part)[0], trail = /\s*$/.exec(part)[0]
          var core = part.trim()
          return (index === 0 ? lead : '') + t(core) + (index === parts.length - 1 ? trail : '')
        }).join(' · ')
      }
      var hours = /^(.*?)(\d+(?:\.\d+)?) 小时剩余$/.exec(label)
      if (hours) return localizePrefix(hours[1]) + t('{hours} 小时剩余', { hours: hours[2] })
      var period = /^(.*?)(周剩余|月剩余|窗口剩余)$/.exec(label)
      if (period) return localizePrefix(period[1]) + t(period[2])
      var credits = /^(.*?) 积分剩余$/.exec(label)
      if (credits) return localizePrefix(credits[1]) + ' ' + t('积分剩余')
      var window = /^配额窗口 (\d+)$/.exec(label)
      return window ? t('配额窗口 {index}', { index: window[1] }) : t(label)
    }

function uiError(error) {
      var http = /^查询返回 HTTP (\d+)，请检查地址和供应商凭据。$/.exec(error)
      return http ? t('查询返回 HTTP {status}，请检查地址和供应商凭据。', { status: http[1] }) : t(error)
    }

// __DSH_USAGE_STATS_FORMAT__
var LOCAL_TZ = (function () {
      try { return new Date().getTimezoneOffset() } catch (e) { return 0 }
    })()
var clientFormat = createClientFormat()
var fmt = clientFormat.fmt
var fmtExact = clientFormat.fmtExact
var fmtReset = clientFormat.fmtReset
var fmtInTz = clientFormat.fmtInTz
var fmtFetched = clientFormat.fmtFetched
var formatPct = clientFormat.formatPct
var monthShort = clientFormat.monthShort
var readJson = clientFormat.readJson

var UsageApi = (function () {
      function UsageApi() {}
      UsageApi.prototype.stats = function (opts) {
        var search = new URLSearchParams()
        if (opts.days > 0) search.set('days', String(opts.days))
        if (opts.model) search.set('model', opts.model)
        search.set('tz', String(LOCAL_TZ))
        if (opts.fresh) search.set('fresh', '1')
        var q = search.toString()
        return fetch('/api/dsh-usage-stats/stats' + (q ? '?' + q : ''), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.providerQuotas = function (opts) {
        var search = new URLSearchParams()
        if (opts && opts.fresh) search.set('fresh', '1')
        if (opts && opts.provider) search.set('provider', opts.provider)
        var q = search.toString()
        return fetch('/api/dsh-usage-stats/provider-quotas' + (q ? '?' + q : ''), { headers: { accept: 'application/json' } }).then(readJson)
      }
      /** Read stored account quotas; upstream queries are explicit and limited to enabled accounts. */
      UsageApi.prototype.accountQuotas = async function (opts) {
        var previous = this.accountQuotaCache
        var read = function () {
          return fetch('/api/dsh-usage-stats/account-quotas', { headers: { accept: 'application/json' }, credentials: 'same-origin' }).then(readJson)
        }
        var view = await read()
        var failures = []
        if (opts && opts.fresh) {
          var channels = (view.channels || []).filter(function (channel) {
            return channel.kind === 'account' && channel.enabled === true && channel.supportsQuota === true && (!opts.channelId || channel.id === opts.channelId)
          })
          var targets = (view.accounts || []).filter(function (account) {
            return account.enabled !== false && channels.some(function (channel) { return channel.id === account.channelId }) && (!opts.accountId || account.id === opts.accountId)
          })
          var results = await Promise.allSettled(targets.map(function (account) {
            return fetch('/api/dsh-usage-stats/account-quotas/refresh', {
              method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ channelId: account.channelId, accountId: account.id }),
            }).then(readJson)
          }))
          results.forEach(function (result, index) {
            var account = targets[index]
            var row = result.status === 'fulfilled' && (result.value.results || []).find(function (quota) { return quota.channelId === account.channelId && quota.accountId === account.id })
            if (result.status === 'rejected' || !row || row.error) failures.push({
              channelId: account.channelId, accountId: account.id, version: account.version,
              error: row && row.error || { message: result.status === 'rejected' ? String(result.reason.message || result.reason) : t('额度读取失败') },
            })
          })
          // Re-read account selection and versions after slow queries; removed or changed accounts cannot reappear.
          if (targets.length) view = await read()
          failures = failures.filter(function (failure) { return (view.accounts || []).some(function (account) {
            return account.id === failure.accountId && account.channelId === failure.channelId && account.version === failure.version && account.enabled !== false
          }) })
        }
        var quotas = Array.isArray(view.quotas) ? view.quotas.slice() : []
        failures.forEach(function (failure) {
          var index = quotas.findIndex(function (quota) { return quota.channelId === failure.channelId && quota.accountId === failure.accountId })
          var row = Object.assign({}, index < 0 ? {} : quotas[index], { channelId: failure.channelId, accountId: failure.accountId, error: failure.error })
          if (index < 0) quotas.push(row); else quotas[index] = row
        })
        view.quotas = quotas.map(function (quota) {
          if (!quota.error || !previous) return quota
          var account = (view.accounts || []).find(function (row) { return row.id === quota.accountId && row.channelId === quota.channelId })
          var oldAccount = (previous.accounts || []).find(function (row) { return row.id === quota.accountId && row.channelId === quota.channelId })
          var oldQuota = (previous.quotas || []).find(function (row) { return row.accountId === quota.accountId && row.channelId === quota.channelId })
          return account && oldAccount && account.version === oldAccount.version && account.credentialVersion === oldAccount.credentialVersion && oldQuota
            ? Object.assign({}, oldQuota, { error: quota.error, stale: true }) : quota
        })
        view.refreshErrors = failures
        this.accountQuotaCache = view
        return view
      }
      /**
       * WorkBuddy's display-only document through our host cache. Only an
       * explicit refresh or the enabled host timer calls the plugin upstream.
       * Shape:
       * { status: 'signed-in'|'signed-out', nickname?, expiresAt?, models?,
       *   credits?: { total, accounts: [{ packageName, remain, size }] },
       *   creditsError? }.
       */
      UsageApi.prototype.controls = function (patch) {
        return fetch('/api/dsh-usage-stats/controls', patch === undefined ? { headers: { accept: 'application/json' } } : {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(patch),
        }).then(readJson)
      }
      UsageApi.prototype.quotaSource = function (source, opts) {
        return fetch('/api/dsh-usage-stats/' + encodeURIComponent(source) + (opts && opts.fresh ? '?fresh=1' : ''), {
          headers: { accept: 'application/json' }, credentials: 'same-origin',
        }).then(readJson)
      }
      UsageApi.prototype.quotaProviders = function () {
        return fetch('/api/dsh-usage-stats/quota-providers', { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.testQuota = function (provider, template) {
        return fetch('/api/dsh-usage-stats/quota-test', {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ provider: provider, template: template }),
        }).then(readJson)
      }
      UsageApi.prototype.modelDetectionStatus = function (opts) {
        var search = new URLSearchParams()
        Object.keys(opts || {}).forEach(function (key) { if (opts[key]) search.set(key, opts[key]) })
        return fetch('/api/dsh-usage-stats/model-detection?' + search.toString(), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.modelDetection = function (body) {
        return fetch('/api/dsh-usage-stats/model-detection', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) }).then(readJson)
      }
      UsageApi.prototype.modelDetectionModels = function (provider) {
        return fetch('/api/dsh-usage-stats/model-detection-models?' + new URLSearchParams(provider ? { provider: provider } : {}).toString(), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.modelFingerprintEngine = function (body) {
        return fetch('/api/dsh-usage-stats/model-fingerprint-engine', body === undefined ? { headers: { accept: 'application/json' } } : {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
        }).then(readJson)
      }
      return UsageApi
    })()

// __DSH_USAGE_STATS_STYLES__
var clientStyles = createClientStyles()
var styles = clientStyles.styles
var SEAT_CSS = clientStyles.seatCss

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
      // Attribution is written to the element, not into the CSS text: another
      // plugin that claims an unattributed injected <style> and deletes it on
      // unload would otherwise take this stylesheet with it.
      if (style.dataset) {
        style.dataset.plugin = 'dsh-usage-stats'
        style.dataset.pluginCss = 'dsh-usage-stats/client'
        style.dataset.dshPlugin = 'usage-stats'
      }
      style.textContent = styles + (accountQuotasClient ? '\n' + accountQuotasClient.css : '')
    }

function markUsageNavIcon() {
      var buttons = document.querySelectorAll('[data-shortcut-modal="settings"] nav button')
      for (var i = 0; i < buttons.length; i++) {
        var label = buttons[i].querySelector('span')
        if (label && label.textContent.trim() === t('用量统计')) {
          buttons[i].setAttribute('data-dshus-nav-icon', '')
        }
      }
    }

function watchUsageNavIcon() {
      if (typeof MutationObserver === 'undefined' || !document.body) return function () {}
      markUsageNavIcon()
      var observer = new MutationObserver(markUsageNavIcon)
      observer.observe(document.body, { childList: true, subtree: true })
      return function () { observer.disconnect() }
    }

function buildHeatmap(dayMap, days, tzMin, pageWeeks) {
      var todayKey = new Date(Date.now() - tzMin * 60000).toISOString().slice(0, 10)
      var todayOrdinal = Date.parse(todayKey + 'T00:00:00Z') / 86400000
      var firstOrdinal = days > 0 ? todayOrdinal - days + 1 : todayOrdinal - 364
      if (!(days > 0)) {
        dayMap.forEach(function (_bucket, date) {
          var ordinal = Date.parse(date + 'T00:00:00Z') / 86400000
          if (Number.isFinite(ordinal) && ordinal < firstOrdinal) firstOrdinal = ordinal
        })
      }
      // Monday is always the first cell in a column. This keeps every
      // calendar week's seven days together, including the incomplete week
      // at either end of the available history.
      var todayWeekStart = Date.parse(weekStart(todayKey) + 'T00:00:00Z') / 86400000
      var firstWeekStart = Date.parse(weekStart(new Date(firstOrdinal * 86400000).toISOString().slice(0, 10)) + 'T00:00:00Z') / 86400000
      var colCount = Math.max(pageWeeks, Math.round((todayWeekStart - firstWeekStart) / 7) + 1)
      var firstColOrdinal = todayWeekStart - (colCount - 1) * 7
      function key(ordinal) { return new Date(ordinal * 86400000).toISOString().slice(0, 10) }
      var weeks = []
      var max = 0
      for (var col = 0; col < colCount; col++) {
        var colStart = firstColOrdinal + col * 7
        var cells = []
        for (var i = 0; i < 7; i++) {
          var ordinal = colStart + i
          var k = key(ordinal)
          var inWindow = ordinal >= firstOrdinal && ordinal <= todayOrdinal
          var bucket = dayMap.get(k) || null
          var v = bucket ? bucket.billed : 0
          if (v > max && inWindow) max = v
          cells.push({ date: k, value: v, bucket: bucket, inWindow: inWindow })
        }
        weeks.push({ start: key(colStart), cells: cells })
      }
      return { weeks: weeks, max: max, today: todayKey }
    }

function weekStart(date) {
      var ordinal = Date.parse(date + 'T00:00:00Z') / 86400000
      var day = (new Date(ordinal * 86400000).getUTCDay() + 6) % 7
      return new Date((ordinal - day) * 86400000).toISOString().slice(0, 10)
    }

function weeklyBuckets(dayMap, dayModelMap) {
      var buckets = new Map()
      var models = new Map()
      dayMap.forEach(function (day, date) {
        var key = weekStart(date)
        var bucket = buckets.get(key)
        if (!bucket) { bucket = { date: key, billed: 0, calls: 0 }; buckets.set(key, bucket) }
        bucket.billed += day.billed || 0
        bucket.calls += day.calls || 0
        var dailyModels = dayModelMap.get(date) || []
        var modelBuckets = models.get(key)
        if (!modelBuckets) { modelBuckets = new Map(); models.set(key, modelBuckets) }
        dailyModels.forEach(function (model) {
          var current = modelBuckets.get(model.key)
          if (!current) {
            current = { key: model.key, provider: model.provider, model: model.model, billed: 0, calls: 0 }
            modelBuckets.set(model.key, current)
          }
          current.billed += model.billed || 0
          current.calls += model.calls || 0
        })
      })
      var modelLists = new Map()
      models.forEach(function (items, key) {
        modelLists.set(key, Array.from(items.values()).sort(function (a, b) { return b.billed - a.billed }))
      })
      return { buckets: buckets, models: modelLists }
    }

function heatLevel(value, max) {
      if (!(value > 0) || !(max > 0)) return 0
      var r = value / max
      if (r > 0.75) return 4
      if (r > 0.5) return 3
      if (r > 0.25) return 2
      return 1
    }

function cellColor(level) {
      switch (level) {
        case 1: return 'color-mix(in srgb, var(--dshus-heat, #22c55e) 22%, transparent)'
        case 2: return 'color-mix(in srgb, var(--dshus-heat, #22c55e) 45%, transparent)'
        case 3: return 'color-mix(in srgb, var(--dshus-heat, #22c55e) 72%, transparent)'
        case 4: return 'var(--dshus-heat, #22c55e)'
        default: return ''
      }
    }

function Heatmap(props) {
      var weekly = props.mode === 'weekly'
      var weeklyData = weekly ? weeklyBuckets(props.dayMap, props.dayModelMap) : null
      var weeklyMax = 0
      if (weekly) weeklyData.buckets.forEach(function (bucket) { weeklyMax = Math.max(weeklyMax, bucket.billed || 0) })
      var dayMap = props.dayMap
      var dayModelMap = props.dayModelMap
      var days = props.days
      var MIN_CELL = 15
      var GAP = 5
      // Reserve space at both edges so the grid fits the pane and clears its pager.
      var EDGE_GUTTER = 4
      var viewportRef = React.useRef(null)
      var widthState = React.useState(0)
      var width = widthState[0]
      var setWidth = widthState[1]
      // Paging is owned by the usage page, which renders the arrows in the card
      // header. The index arrives as props.pageIndex and the geometry this
      // component computes goes back out through props.onPageInfo, so pageCount
      // and the visible window stay in one place.
      var reportPageInfo = props.onPageInfo
      var tipState = React.useState(null)
      var tip = tipState[0]
      var setTip = tipState[1]
      var selectedWeekState = React.useState(null)
      var selectedWeek = selectedWeekState[0]
      var setSelectedWeek = selectedWeekState[1]
      var hideTimerRef = React.useRef(null)
      var modelCacheRef = React.useRef(new Map())
      var modelVersionState = React.useState(0)
      var modelVersion = modelVersionState[0]
      var setModelVersion = modelVersionState[1]
      var tipRef = React.useRef(null)

      var modelCacheKey = function (date) { return String(props.syncedAt || 0) + '|' + (props.modelKey || '') + '|' + date }
      var modelResult = function (date) {
        var result
        if (weekly) result = { status: 'ready', models: weeklyData.models.get(weekStart(date)) || [] }
        else if (dayModelMap.has(date)) result = { status: 'ready', models: dayModelMap.get(date) || [] }
        else result = modelCacheRef.current.get(modelCacheKey(date)) || { status: props.loadDayModels ? 'idle' : 'unavailable', models: [] }
        return { status: result.status, models: groupModelRows(result.models) }
      }
      var requestModels = function (cell) {
        if (weekly || !cell.inWindow || !cell.bucket || !props.loadDayModels || dayModelMap.has(cell.date)) return
        var key = modelCacheKey(cell.date)
        if (modelCacheRef.current.has(key)) return
        modelCacheRef.current.set(key, { status: 'loading', models: [] })
        Promise.resolve().then(function () { return props.loadDayModels(cell.date) }).then(function (models) {
          modelCacheRef.current.set(key, { status: 'ready', models: models })
          setModelVersion(function (v) { return v + 1 })
        }).catch(function () {
          modelCacheRef.current.set(key, { status: 'error', models: [] })
          setModelVersion(function (v) { return v + 1 })
        })
      }

      // useLayoutEffect measures before the first renderer paint, so changing
      // range or resizing the pane does not briefly show a one-week strip.
      var useMeasureEffect = React.useLayoutEffect || React.useEffect
      useMeasureEffect(function () {
        var node = viewportRef.current
        if (!node) return
        var measure = function () {
          var nextWidth = Math.max(0, node.clientWidth)
          setWidth(nextWidth)
        }
        measure()
        var observer = window.ResizeObserver ? new window.ResizeObserver(measure) : null
        if (observer) observer.observe(node)
        else if (window.addEventListener) window.addEventListener('resize', measure)
        return function () {
          if (observer) observer.disconnect()
          else if (window.removeEventListener) window.removeEventListener('resize', measure)
        }
      }, [])

      // Fit complete weeks inside the viewport padding, then let their cells use
      // the remaining width. MAX_CELL keeps the calendar from turning into a
      // sparse wall of squares when the settings pane is dragged wide.
      var heatAreaWidth = Math.max(0, width - EDGE_GUTTER * 2)
      var visibleCount = Math.min(53, Math.max(1, Math.floor((heatAreaWidth + GAP) / (MIN_CELL + GAP))))
      var CELL = heatAreaWidth > 0 ? Math.min(25, Math.max(MIN_CELL, (heatAreaWidth - (visibleCount - 1) * GAP) / visibleCount)) : MIN_CELL
      var STEP = CELL + GAP
      var heat = buildHeatmap(dayMap, days, props.tz, visibleCount)
      var pageCount = Math.max(1, Math.ceil(heat.weeks.length / visibleCount))
      var page = props.pageIndex == null ? 0 : Math.min(Math.max(0, props.pageIndex), pageCount - 1)
      var end = heat.weeks.length - page * visibleCount
      var weeks = heat.weeks.slice(Math.max(0, end - visibleCount), end)

      // Publish the paging geometry to the card header. Report the column start
      // (Monday, the same key the grid renders as data-week-start) so the label
      // and the pager state always describe the window actually on screen.
      React.useEffect(function () {
        if (!reportPageInfo) return
        var first = weeks.length > 0 ? weeks[0].start : null
        var lastKey = weeks.length > 0 ? weeks[weeks.length - 1].start : null
        var last = lastKey !== null && lastKey > heat.today ? heat.today : lastKey
        reportPageInfo({
          page: page,
          pageCount: pageCount,
          first: first,
          last: last,
          firstMonth: first === null ? '' : monthShort(first),
          lastMonth: last === null ? '' : monthShort(last),
        })
      }, [reportPageInfo, page, pageCount, visibleCount, props.mode, days, dayMap, heat.today])

      var clearHideTimer = function () {
        if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      var hideTip = function () { clearHideTimer(); setTip(null) }
      var hideTipSoon = function () {
        clearHideTimer()
        hideTimerRef.current = setTimeout(function () { setTip(null) }, 120)
      }
      React.useEffect(function () {
        if (window.addEventListener) window.addEventListener('resize', hideTip)
        return function () {
          clearHideTimer()
          if (window.removeEventListener) window.removeEventListener('resize', hideTip)
        }
      }, [])
      var TIP_GAP = 8
      var TIP_MARGIN = 10
      /**
       * Anchor the tooltip to the BOTTOM-RIGHT of the hovered cell so it never
       * covers the cell or the days around it. Only when that would leave the
       * window do we fall back: align to the right edge, then flip above.
       * Kept as a pure function of the anchor + size so the post-render measure
       * pass can re-run it once the real tooltip height is known.
       */
      var placeTip = function (anchor, tipWidth, tipHeight) {
        var x = anchor.right + TIP_GAP
        if (x + tipWidth > window.innerWidth - TIP_MARGIN) {
          // Not enough room on the right: hang it off the left of the cell
          // instead of letting it run past the window edge.
          x = anchor.left - TIP_GAP - tipWidth
        }
        if (x < TIP_MARGIN) x = Math.max(TIP_MARGIN, Math.min(anchor.right + TIP_GAP, window.innerWidth - tipWidth - TIP_MARGIN))

        var y = anchor.bottom + TIP_GAP
        if (y + tipHeight > window.innerHeight - TIP_MARGIN) {
          // No room below: flip above the cell.
          y = anchor.top - TIP_GAP - tipHeight
        }

        return {
          x: Math.max(TIP_MARGIN, Math.min(window.innerWidth - tipWidth - TIP_MARGIN, x)),
          y: Math.max(TIP_MARGIN, Math.min(window.innerHeight - tipHeight - TIP_MARGIN, y)),
        }
      }
      // Must mirror .dshus-heat-tip's own width/max-width so the first, pre-measure
      // placement already picks the right side; the measure effect then corrects
      // both axes from the real box.
      var tipWidthFor = function () { return Math.min(320, window.innerWidth - 20) }
      var showTip = function (e, cell) {
        clearHideTimer()
        requestModels(cell)
        var models = modelResult(cell.date).models
        var bounds = e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget.getBoundingClientRect() : null
        var anchor = bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom } : { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }
        var position = placeTip(anchor, tipWidthFor(), Math.min(window.innerHeight - 20, 80 + models.length * 25))
        setTip(function (previous) {
          if (previous && previous.anchor && previous.cell.date === cell.date && previous.cell.bucket === cell.bucket && previous.cell.inWindow === cell.inWindow && previous.days === days && previous.mode === props.mode && previous.anchor.left === anchor.left && previous.anchor.top === anchor.top && previous.anchor.right === anchor.right && previous.anchor.bottom === anchor.bottom) return previous
          return { x: position.x, y: position.y, anchor: anchor, cell: cell, days: days, mode: props.mode }
        })
      }
      var tipEl = null
      if (tip !== null && tip.days === days && tip.mode === props.mode) {
        var weekDate = weekly ? weekStart(tip.cell.date) : tip.cell.date
        var bucket = weekly ? weeklyData.buckets.get(weekDate) : tip.cell.bucket
        var tipInWindow = weekly || tip.cell.inWindow
        var tipValue = bucket ? bucket.billed || 0 : 0
        var detail = modelResult(tip.cell.date)
        var modelRows = detail.models.map(function (m) {
          return React.createElement('div', { className: 'dshus-tip-row', key: m.key },
            React.createElement('span', { className: 'dshus-tip-swatch', style: { background: sharedModelColor(m.model) } }),
            React.createElement('span', { title: m.model }, m.model),
            React.createElement('strong', { title: fmtExact(m.billed) + ' tokens' }, fmt(m.billed)),
          )
        })
        tipEl = React.createElement('div', {
          className: 'dshus-tip dshus-heat-tip',
          ref: tipRef,
          style: { left: tip.x, top: tip.y },
          onMouseEnter: clearHideTimer,
          onMouseLeave: hideTip,
        },
          React.createElement('div', { className: 'dshus-tip-name', title: bucket ? fmtExact(tipValue) + ' tokens' : undefined }, weekly ? weekDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, function (_match, year, month, day) { return t('{year}年{month}月{day}日起的一周', { year: year, month: month, day: day }) }) : tip.cell.date),
          tipInWindow && React.createElement('div', { className: 'dshus-tip-val', title: bucket ? fmtExact(tipValue) + ' tokens' : undefined }, bucket ? fmt(tipValue) + ' tokens' : t('无记录')),
          !tipInWindow && React.createElement('div', { className: 'dshus-tip-val' }, t('不在所选时间范围内')),
          tipInWindow && modelRows,
          tipInWindow && bucket && detail.models.length === 0 && !weekly && React.createElement('div', { className: 'dshus-tip-val' },
            detail.status === 'loading' || detail.status === 'idle' ? t('正在读取模型明细…') : t('模型明细暂不可用'),
          ),
          tipInWindow && React.createElement('div', { className: 'dshus-tip-row', style: { color: '#60a5fa' } },
            React.createElement('span', null, t('总调用次数')),
            React.createElement('strong', null, t('{count} 次', { count: fmtExact(bucket && bucket.calls) })),
          ),
        )
      }
      useMeasureEffect(function () {
        if (!tip || !tipRef.current) return
        var bounds = tipRef.current.getBoundingClientRect()
        var position = placeTip(tip.anchor, bounds.width, bounds.height)
        if (Math.abs(position.x - tip.x) > .5 || Math.abs(position.y - tip.y) > .5) {
          setTip(function (current) { return current === tip ? Object.assign({}, tip, position) : current })
        }
      }, [tip, modelVersion, width, props.mode, days])

      var segs = []
      var prevMonth = ''
      for (var wi = 0; wi < weeks.length; wi++) {
        var monthDate = weeks[wi].cells[6].date
        var m = monthShort(monthDate > heat.today ? heat.today : monthDate)
        if (m !== prevMonth) {
          if (prevMonth !== '') segs[segs.length - 1].end = wi - 1
          segs.push({ label: m, start: wi, end: wi })
          prevMonth = m
        }
      }
      if (segs.length > 0) segs[segs.length - 1].end = weeks.length - 1
      var heatWidth = weeks.length * STEP - GAP
      var labelWidth = Math.max(36, heatWidth)
      var monthLabels = segs.map(function (seg, i) {
        var cx = ((seg.start + seg.end) / 2) * STEP + CELL / 2 + (labelWidth - heatWidth) / 2
        // Keep the label fully inside the strip even for a 1-week edge month
        // (wider labels like 12月 need extra room on both sides).
        cx = Math.min(Math.max(cx, 16), labelWidth - 16)
        return React.createElement('span', {
          key: 'ml' + i,
          style: { position: 'absolute', left: cx, transform: 'translateX(-50%)', whiteSpace: 'nowrap' },
        }, seg.label)
      })
      var monthRow = React.createElement('div', {
        className: 'dshus-heat-label-month',
        style: { position: 'relative', width: labelWidth, height: 16 },
      }, monthLabels)

      var activeWeek = weekly && tip && tip.mode === props.mode ? weekStart(tip.cell.date) : selectedWeek
      var weekCols = weeks.map(function (week, w) {
        var weekBucket = weekly && weeklyData.buckets.get(week.start)
        var weekValue = weekBucket ? weekBucket.billed || 0 : 0
        var filledCells = weekly && weekValue > 0 && weeklyMax > 0 ? Math.max(1, Math.round(weekValue / weeklyMax * 7)) : 0
        return React.createElement('div', { className: 'dshus-heat-col' + (weekly && activeWeek === week.start ? ' weekly-active' : ''), key: week.start, 'data-week-start': week.start },
          week.cells.map(function (cell, c) {
            if (!cell.inWindow && !weekly) {
              return React.createElement('div', {
                className: 'dshus-cell',
                key: w + '-' + c,
                role: 'gridcell',
                'aria-label': cell.date + t('，不在所选时间范围内'),
                onMouseMove: function (e) { showTip(e, cell) },
                onClick: function (e) { if (weekly) setSelectedWeek(week.start); if (e) showTip(e, cell) },
                onMouseLeave: hideTipSoon,
              })
            }
            var level = heatLevel(cell.value, heat.max)
            var models = modelResult(cell.date).models
            var filled = weekly && c >= 7 - filledCells
            var ariaLabel = t('{time}: {tokens} tokens，{count} 次调用', { time: weekly ? t('{date} 当周', { date: cell.date }) : cell.date, count: fmtExact(weekly ? weekBucket && weekBucket.calls : cell.bucket && cell.bucket.calls), tokens: fmtExact(weekly ? weekBucket && weekBucket.billed : cell.value) })
            if (models.length > 0) ariaLabel += '；' + models.map(function (m) { return m.model + ' ' + fmtExact(m.billed) }).join('；')
            return React.createElement('div', {
              className: 'dshus-cell' + (filled ? ' weekly-filled' : ''),
              key: w + '-' + c,
              tabIndex: 0,
              role: 'gridcell',
              'aria-label': ariaLabel,
              onMouseMove: function (e) { showTip(e, cell) },
              onClick: function (e) { if (weekly) setSelectedWeek(week.start); if (e) showTip(e, cell) },
              onMouseLeave: hideTipSoon,
              onFocus: function (e) {
                var rect = e.currentTarget.getBoundingClientRect()
                showTip({ currentTarget: e.currentTarget, clientX: rect.left, clientY: rect.bottom }, cell)
              },
              onBlur: hideTip,
              style: weekly ? (filled ? { background: 'var(--dshus-week-fill, #0089ff)' } : undefined) : (level > 0 ? { background: cellColor(level) } : undefined),
            })
          }),
        )
      })

      return React.createElement('div', { className: weekly ? 'dshus-heat-weekly' : undefined, style: { '--dshus-heat': '#0089ff' } },
        React.createElement('div', { className: 'dshus-heat-wrap' },
          React.createElement('div', {
            className: 'dshus-heat-viewport',
            ref: viewportRef,
            'data-page': page,
            'data-page-count': pageCount,
            style: { '--dshus-cell-size': CELL + 'px' },
          },
            React.createElement('div', { className: 'dshus-heat', key: props.mode + '-' + page + '-' + visibleCount, role: 'grid', 'aria-label': t('使用量热力图') }, weekCols),
            monthRow,
          ),
        ),
        // The legend maps colour intensity to usage volume.
        React.createElement('div', { className: 'dshus-heat-legend', 'aria-hidden': 'true' },
          React.createElement('span', null, t('少')),
          [1, 2, 3, 4].map(function (level) {
            return React.createElement('span', { className: 'dshus-heat-legend-cell', key: 'lg' + level, style: { background: cellColor(level) } })
          }),
          React.createElement('span', null, t('多')),
        ),
        tipEl,
      )
    }

function heatArrow(left) {
      return React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true },
        React.createElement('path', { d: left ? 'M11 3 4 8l7 5Z' : 'M5 3l7 5-7 5Z', fill: 'currentColor' }),
      )
    }

function HeatPager(props) {
      var info = props.info
      var range = ''
      if (info && info.firstMonth) range = info.firstMonth === info.lastMonth ? info.firstMonth : info.firstMonth + ' – ' + info.lastMonth
      var canOlder = Boolean(info) && info.page < info.pageCount - 1
      var canNewer = Boolean(info) && info.page > 0
      return React.createElement('div', {
        className: 'dshus-heat-nav-group' + (info && info.pageCount > 1 ? '' : ' dshus-heat-nav-static'),
        role: 'group',
        'aria-label': t('热力图翻页'),
      },
        React.createElement('span', { className: 'dshus-heat-nav-label', title: t('当前显示的日期范围') }, range),
        React.createElement('button', {
          type: 'button',
          className: 'dshus-heat-nav',
          'aria-label': t('查看更早日期'),
          disabled: !canOlder,
          onClick: function () { props.onStep(1) },
        }, heatArrow(true)),
        React.createElement('button', {
          type: 'button',
          className: 'dshus-heat-nav',
          'aria-label': t('查看较新日期'),
          disabled: !canNewer,
          onClick: function () { props.onStep(-1) },
        }, heatArrow(false)),
      )
    }

function useGrowIn(active) {
      var grownState = React.useState(false)
      var grown = grownState[0]
      var ref = React.useRef(null)
      React.useEffect(function () {
        if (grown) return
        var el = ref.current
        if (!el || !active) return
        var started = false
        var io = null
        function start() {
          if (started) return
          started = true
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () { grownState[1](true) })
          })
        }
        if (typeof IntersectionObserver === 'undefined') { start(); return undefined }
        io = new IntersectionObserver(function (entries) {
          for (var ei = 0; ei < entries.length; ei++) {
            if (entries[ei].isIntersecting) {
              start()
              io.disconnect()
              break
            }
          }
        }, { threshold: 0.15 })
        io.observe(el)
        return function () {
          if (io !== null) io.disconnect()
        }
      }, [active])
      return [grown, ref]
    }

function sharedNormModelKey(name) {
      var s = String(name || '').trim()
      var low = s.toLowerCase()
      var slash = low.lastIndexOf('/')
      if (slash !== -1) low = low.slice(slash + 1)
      var colon = low.indexOf(':')
      if (colon !== -1) low = low.slice(0, colon)
      if (low.endsWith('-free')) low = low.slice(0, -5)
      if (low === 'x-preview-f' || low === 'x-preview' || low === 'x-privew' || low === 'x-privew-f' || low === 'ox' || low === 'ox-alpha') low = 'glm-5.3-flash'
      return low
    }

function sharedModelDisplayName(name) {
      var s = String(name || '').trim()
      var slash = s.lastIndexOf('/')
      return slash !== -1 ? s.slice(slash + 1) : s
    }

function groupModelRows(rows) {
      var merged = []
      var index = Object.create(null)
      for (var i = 0; i < rows.length; i++) {
        var entry = rows[i]
        if (entry.key === '__all__') { merged.push(entry); continue }
        var modelId = sharedNormModelKey(entry.model || entry.key)
        var existing = index[modelId]
        if (existing === undefined) {
          index[modelId] = merged.length
          merged.push({ key: 'by-model:' + modelId, provider: '', model: sharedModelDisplayName(entry.model), billed: entry.billed || 0 })
        } else {
          merged[existing].billed += entry.billed || 0
        }
      }
      return merged.sort(function (a, b) { return (b.billed || 0) - (a.billed || 0) })
    }

var sharedModelColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6']

function sharedModelColor(name) {
      var key = sharedNormModelKey(name)
      var hash = 0
      for (var i = 0; i < key.length; i++) hash = ((hash * 31) + key.charCodeAt(i)) >>> 0
      return sharedModelColors[hash % sharedModelColors.length]
    }

function Bars(props) {
      var hourModels = props.hourModels // [{hour, models:[{key,provider,model,billed}]}]
      var byHour = props.byHour || []
      var colorOf = props.colorOf
      var daily = props.variant === 'daily'

      // ALL hooks run unconditionally, before any early return, so the hook
      // count stays identical whether the window has records or not.
      // Grow-in: bars stay at 0% height until the chart scrolls into view,
      // then transition up to their real height once (visibility-triggered,
      // see useGrowIn).
      var grow = useGrowIn(!!(hourModels && hourModels.length > 0))
      var grown = grow[0]
      var barsRef = grow[1]
      // One hover region per hour, including the empty space above the bar.
      var tipState = React.useState(null)
      var tip = tipState[0]
      var setTip = tipState[1]

      if (!hourModels || hourModels.length === 0) return React.createElement('div', { className: 'dshus-muted' }, t('窗口内没有记录'))

      var showTip = function (e, index) {
        var x = e.clientX + 14
        var y = e.clientY + 14
        if (x + 270 > window.innerWidth) x = Math.max(8, e.clientX - 270)
        var estimatedHeight = 70 + ((hourModels[index].models || []).length + 1) * 23
        if (y + estimatedHeight > window.innerHeight) y = Math.max(8, window.innerHeight - estimatedHeight - 8)
        setTip({ x: x, y: y, index: index })
      }
      var hideTip = function () { setTip(null) }
      var tipEl = null
      if (tip !== null && hourModels[tip.index]) {
        var tipItem = hourModels[tip.index]
        var tipHour = tipItem.hour
        var tipBucket = byHour[tipHour] || {}
        var tipCalls = Number(tipBucket.calls) || 0
        var tipTokens = Number(tipBucket.billed) || 0
        var tipModels = tipItem.models || []
        var tipDate = daily ? new Date(tipItem.date + 'T00:00:00Z') : new Date(Date.now() - LOCAL_TZ * 60000)
        var tipDayLabel = t('{year}年{month}月{day}日', { year: tipDate.getUTCFullYear(), month: tipDate.getUTCMonth() + 1, day: tipDate.getUTCDate() })
        tipEl = React.createElement('div', { className: 'dshus-tip dshus-chart-tip', style: { left: tip.x, top: tip.y } },
          React.createElement('div', { className: 'dshus-tip-name' }, t('{count} 次调用', { count: fmtExact(tipCalls) })),
          React.createElement('div', { className: 'dshus-tip-time' }, tipDayLabel + (daily ? t(' · 全天') : ' · ' + String(tipHour).padStart(2, '0') + ':00–' + String(tipHour).padStart(2, '0') + ':59')),
          React.createElement('div', { className: 'dshus-tip-row' },
            React.createElement('span', { className: 'dshus-tip-swatch', style: { background: '#94a3b8' } }),
            React.createElement('span', null, t('Token 用量')),
            React.createElement('strong', null, fmt(tipTokens)),
          ),
          tipModels.filter(function (mm) { return !daily || mm.key !== '__all__' }).map(function (mm) {
            // The daily trend lists models only: repeating the provider on every
            // row made the breakdown harder to scan than the model names.
            var label = daily ? mm.model : (mm.provider ? mm.provider + ' · ' + mm.model : mm.model)
            return React.createElement('div', { className: 'dshus-tip-row', key: mm.key },
              React.createElement('span', { className: 'dshus-tip-swatch', style: { background: colorOf ? colorOf(mm.key) : '#94a3b8' } }),
              React.createElement('span', null, label),
              React.createElement('strong', null, fmt(mm.billed || 0)),
            )
          }),
        )
      }

      var max = 0
      for (var i = 0; i < hourModels.length; i++) {
        var tot = 0
        var ms = hourModels[i].models || []
        for (var j = 0; j < ms.length; j++) tot += ms[j].billed
        if (tot > max) max = tot
      }
      // ---- Y轴可变刻度 + 虚线网格（nice 数算法：1/2/5 * 10^n，目标4段）----
      function getYScale(m) {
        if (!(m > 0)) return { yMax: 1, ticks: [0, 1], step: 1 }
        var target = 4
        var rough = m / target
        var mag = Math.pow(10, Math.floor(Math.log10(rough)))
        if (!isFinite(mag) || mag === 0) mag = 1
        var residual = rough / mag
        var nice
        if (residual <= 1) nice = 1 * mag
        else if (residual <= 2) nice = 2 * mag
        else if (residual <= 5) nice = 5 * mag
        else nice = 10 * mag
        var step = nice
        if (step < 1) step = 1
        var yMax = Math.ceil(m / step) * step
        var ticks = []
        for (var v = 0; v <= yMax + 1e-9; v += step) {
          var vv = Math.round(v / step) * step
          if (Math.abs(vv) < 1e-9) vv = 0
          ticks.push(vv)
        }
        if (ticks.length < 2) ticks = [0, yMax]
        if (ticks.length > 6) {
          step *= 2
          yMax = Math.ceil(m / step) * step
          ticks = []
          for (var v2 = 0; v2 <= yMax + 1e-9; v2 += step) {
            var vv2 = Math.round(v2 / step) * step
            if (Math.abs(vv2) < 1e-9) vv2 = 0
            ticks.push(vv2)
          }
        }
        return { yMax: yMax, ticks: ticks, step: step }
      }
      var scale = getYScale(max)
      var yMax = scale.yMax
      var ticks = scale.ticks
      var maxCalls = 0
      for (var ci = 0; ci < hourModels.length; ci++) {
        var hourCallCount = byHour[hourModels[ci].hour] ? Number(byHour[hourModels[ci].hour].calls) || 0 : 0
        if (hourCallCount > maxCalls) maxCalls = hourCallCount
      }
      var callYMax = getYScale(maxCalls).yMax
      var callY = function (calls) { return 6 + (1 - calls / callYMax) * 138 }
      var callBaseline = callY(0)
      var callPoints = hourModels.map(function (item, i) {
        var calls = byHour[item.hour] ? Number(byHour[item.hour].calls) || 0 : 0
        return ((i + 0.5) * 10) + ',' + callY(calls)
      }).join(' ')
      var yAxis = React.createElement('div', { className: 'dshus-yaxis' },
        ticks.map(function (v) {
          var top = yMax > 0 ? (1 - v / yMax) * 100 : 100
          return React.createElement('div', { className: 'dshus-yaxis-tick', key: 'y' + v, style: { top: top + '%' } }, v === 0 ? '0' : fmt(v))
        })
      )
      var grid = React.createElement('div', { className: 'dshus-grid' },
        ticks.map(function (v) {
          if (v === 0) return null
          var top = yMax > 0 ? (1 - v / yMax) * 100 : 100
          return React.createElement('div', { className: 'dshus-grid-line', key: 'g' + v, style: { top: top + '%' } })
        })
      )
      // Keep each hourly bar and its label in the same flex column.
      var columns = hourModels.map(function (item, index) {
        var ms = item.models || []
        var tot = 0
        for (var j = 0; j < ms.length; j++) tot += ms[j].billed
        var empty = !(tot > 0)
        var h = yMax > 0 ? Math.round((tot / yMax) * 100) : 0
        var segs = ms.map(function (mm) {
          var sh = tot > 0 ? Math.round((mm.billed / tot) * 100) : 0
          return React.createElement('div', {
            className: 'dshus-bar-seg',
            key: mm.key,
            style: { height: sh + '%', background: colorOf ? colorOf(mm.key) : undefined },
          })
        })
        var bar = React.createElement('div', {
          className: 'dshus-bar',
          // Zero-usage hours keep the grid slot but render no visible bar.
          style: empty
            ? { height: 0, minHeight: 0, background: 'transparent' }
            : { height: grown ? Math.max(4, h) + '%' : '0%' },
        }, segs)
        return React.createElement('div', { className: 'dshus-hour', key: item.hour },
          React.createElement('div', { className: 'dshus-hour-bar' }, bar),
          React.createElement('div', { className: 'dshus-bar-label' }, daily
            ? ((hourModels.length <= 7 || index % 5 === 0 || index === hourModels.length - 1) ? item.date.slice(5).replace('-', '/') : '')
            : (item.hour % 3 === 0 || item.hour === 23 ? item.hour : '')),
        )
      })
      var callDots = hourModels.map(function (item, i) {
        var calls = byHour[item.hour] ? Number(byHour[item.hour].calls) || 0 : 0
        if (calls === 0) return null
        return React.createElement('div', {
          key: 'call-' + item.hour,
          className: 'dshus-call-dot',
          style: { left: ((i + 0.5) / hourModels.length * 100) + '%', top: callY(calls) + 'px', transform: 'translate(-50%, -50%) translateY(' + (grown ? 0 : callBaseline - callY(calls)) + 'px)' },
        })
      })
      var hitAreas = hourModels.map(function (item, i) {
        var bucket = byHour[item.hour] || {}
        return React.createElement('div', {
          key: 'hit-' + item.hour,
          className: 'dshus-hour-hit',
          role: 'gridcell',
          tabIndex: 0,
          'aria-label': t('{time}，{count} 次调用，{tokens} tokens', { time: daily ? item.date : t('{hour}时', { hour: item.hour }), count: bucket.calls || 0, tokens: fmt(bucket.billed || 0) }),
          onMouseMove: function (e) { showTip(e, i) },
          onFocus: function (e) {
            var rect = e.currentTarget.getBoundingClientRect()
            showTip({ clientX: rect.left, clientY: rect.bottom }, i)
          },
          onBlur: hideTip,
        })
      })
      return React.createElement('div', null,
        React.createElement('div', { className: 'dshus-bars-wrap' },
          yAxis,
          React.createElement('div', { className: 'dshus-chart-area' },
            grid,
            React.createElement('div', { className: 'dshus-bars' },
              React.createElement('div', { className: 'dshus-bars-content', ref: barsRef },
                columns,
                React.createElement('svg', { className: 'dshus-call-line', viewBox: '0 0 ' + hourModels.length * 10 + ' 150', preserveAspectRatio: 'none', 'aria-hidden': true },
                  React.createElement('g', { className: 'dshus-call-path', style: { transformOrigin: '0 ' + callBaseline + 'px', transform: grown ? 'scaleY(1)' : 'scaleY(0)' } },
                    React.createElement('polyline', { points: callPoints, fill: 'none', stroke: '#3b82f6', strokeWidth: 2, vectorEffect: 'non-scaling-stroke' }),
                  ),
                ),
                callDots,
                tip !== null && React.createElement('div', { className: 'dshus-hover-line', style: { left: ((tip.index + 0.5) / hourModels.length * 100) + '%' } }),
                React.createElement('div', { className: 'dshus-hour-hit-area', role: 'grid', 'aria-label': daily ? t('每日Token用量与调用次数') : t('今日每小时用量与调用次数'), onMouseLeave: hideTip }, hitAreas),
              ),
            ),
          ),
          React.createElement('div', { className: 'dshus-call-axis', 'aria-label': t('调用次数') },
            React.createElement('span', { style: { top: '0%' } }, callYMax),
            React.createElement('span', { style: { top: '100%' } }, '0'),
          ),
        ),
        React.createElement('div', { className: 'dshus-call-axis-label' }, t('调用次数')),
        tipEl,
      )
    }

function DailyTrend(props) {
      var count = props.period === 'month' ? 30 : 7
      var today = Date.parse(new Date(Date.now() - props.tz * 60000).toISOString().slice(0, 10) + 'T00:00:00Z') / 86400000
      var dayModels = []
      var dayTotals = []
      for (var i = 0; i < count; i++) {
        var date = new Date((today - count + 1 + i) * 86400000).toISOString().slice(0, 10)
        var bucket = props.dayMap.get(date)
        var value = bucket ? bucket.billed || 0 : 0
        var models = props.dayModelMap.get(date) || []
        if (!models.length && value > 0) models = [{ key: '__all__', provider: '', model: t('全部'), billed: value }]
        // The daily breakdown is keyed by model alone, so the same model served by
        // two providers folds into one row instead of repeating under each provider.
        var merged = groupModelRows(models)
        dayModels.push({ hour: i, date: date, models: merged.length ? merged : models })
        dayTotals.push({ hour: i, date: date, billed: value, calls: bucket ? bucket.calls || 0 : 0 })
      }
      // Merged rows are keyed "by-model:<name>", which the provider-keyed colour
      // lookup does not know, so resolve those from the shared model palette.
      // The key never varies across days, so a model keeps one colour chart-wide.
      var trendColorOf = function (key) {
        if (key.indexOf('by-model:') !== 0) return props.colorOf(key)
        return sharedModelColor(key.slice('by-model:'.length))
      }
      // A fresh chart instance restarts the grow-in animation for every day
      // when switching between seven and thirty days.
      return React.createElement(Bars, { key: props.period, hourModels: dayModels, byHour: dayTotals, colorOf: trendColorOf, variant: 'daily' })
    }

var DONUT_COLORS = sharedModelColors

function Donut(props) {
      var byModel = props.byModel || []
      var onSelect = props.onSelect
      var colorOf = props.colorOf

      // ALL hooks run unconditionally, before any early return, so the hook
      // count stays identical across empty/non-empty renders.
      // The hover tooltip follows the cursor and shows model, tokens and share.
      var tipState = React.useState(null)
      var tip = tipState[0]
      var setTip = tipState[1]
      var tipKeyState = React.useState('')
      var tipKey = tipKeyState[0]
      var setTipKey = tipKeyState[1]

      if (byModel.length === 0) return React.createElement('div', { className: 'dshus-muted' }, t('没有按模型聚合的数据'))
      var total = 0
      for (var i = 0; i < byModel.length; i++) total += byModel[i].billed
      if (!(total > 0)) return React.createElement('div', { className: 'dshus-muted' }, t('没有按模型聚合的数据'))

      // Keep the chart readable: top 8 models + "其他" for the rest.
      var show = byModel.slice(0, 8)
      var restBilled = 0
      for (var r = 8; r < byModel.length; r++) restBilled += byModel[r].billed
      if (restBilled > 0) show.push({ key: '__rest__', provider: '', model: t('其他'), billed: restBilled })

      var showTip = function (e, key) {
        setTipKey(key)
        var x = e.clientX + 14
        var y = e.clientY + 14
        if (x + 220 > window.innerWidth) x = e.clientX - 220
        setTip({ x: x, y: y })
        window.addEventListener('scroll', hideTip, { passive: true, once: true })
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
            fmt(tipData.billed) + ' tokens · ' + formatPct(tipPct)),
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
        return React.createElement(m.key !== '__rest__' && onSelect ? 'button' : 'div', {
          className: 'dshus-donut-row',
          key: m.key,
          type: m.key !== '__rest__' && onSelect ? 'button' : undefined,
          title: fmtExact(m.billed) + ' tokens',
          style: m.key !== '__rest__' && onSelect ? { border: 0, padding: 0, width: '100%', background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' } : undefined,
          onMouseMove: function (e) { showTip(e, m.key) },
          onMouseLeave: hideTip,
          onClick: m.key !== '__rest__' && onSelect ? function () { onSelect(m.key) } : undefined,
        },
          React.createElement('span', { className: 'dshus-donut-dot', style: { background: colorOf ? colorOf(m.key) : DONUT_COLORS[idx % DONUT_COLORS.length] } }),
          React.createElement('span', { className: 'dshus-donut-name' }, label),
          React.createElement('span', { className: 'dshus-donut-pct' }, formatPct(pct)),
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

function refreshIconButton(onClick, loading, label, alignEnd, disabled) {
      return React.createElement('button', {
        type: 'button',
        className: 'dshus-btn dshus-icon-btn' + (alignEnd ? ' dshus-heading-refresh' : ''),
        onClick: onClick,
        disabled: loading || !!disabled,
        'aria-busy': !!loading,
        title: label,
        'aria-label': label,
      }, loading
        ? React.createElement('span', { className: 'dshus-spin', 'aria-hidden': 'true' })
        : React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
          React.createElement('path', { d: 'M20 7v5h-5M4 17v-5h5M5.5 9A7 7 0 0 1 18 7M18.5 15A7 7 0 0 1 6 17' }),
        ))
    }

function quotaFailed(body) { return !body || body.ok === false || body.status === 'error' }

function quotaNotice(body) {
      if (!body || !body.refreshError) return null
      var reasons = {
        authentication: '凭据无效或已过期，请在模型设置中重新登录。',
        forbidden: '账户没有配额查询权限。',
        'rate-limit': '查询受到限流，请稍后重试。',
        timeout: '查询超时，请检查网络后重试。',
        service: '供应商服务暂时不可用。',
        parse: '响应无法解析，请检查查询字段映射。',
        invalid: '响应无法解析，请检查查询字段映射。',
      }
      return React.createElement('div', { className: 'dshus-error', role: 'status' },
        body.stale ? t('保留上次成功数据') + ' · ' : '',
        t(reasons[body.refreshError.code] || '查询失败，请检查地址和网络。'),
        Number.isInteger(body.refreshError.httpStatus) ? ' (HTTP ' + body.refreshError.httpStatus + ')' : '')
    }

function useQuotaData(loader, props, mergeTarget) {
      var state = React.useState(null)
      var data = state[0]
      var setData = state[1]
      var pendingState = React.useState(new Set())
      var pending = pendingState[0], setPending = pendingState[1]
      var errorState = React.useState(new Map())
      var errors = errorState[0], setErrors = errorState[1]
      var requestRef = React.useRef(0)
      var pendingRef = React.useRef(new Map())
      var dataRef = React.useRef(null)
      var loaderRef = React.useRef(loader)
      var pausedRef = React.useRef(false)
      loaderRef.current = loader
      pausedRef.current = props.active === false || props.refreshing === true
      function invalidate() {
        requestRef.current++
        pendingRef.current.clear()
        setPending(new Set())
      }
      function load(fresh, provider) {
        var targeted = fresh === true && typeof provider === 'string' && typeof mergeTarget === 'function'
        var key = targeted ? provider : ''
        if (pausedRef.current || pendingRef.current.has(key) || pendingRef.current.has('') || !targeted && pendingRef.current.size) return
        var request = requestRef.current, token = {}
        pendingRef.current.set(key, token)
        setPending(new Set(pendingRef.current.keys()))
        setErrors(function (previous) { var next = new Map(previous); next.delete(key); next.delete(''); return next })
        function current() { return request === requestRef.current && pendingRef.current.get(key) === token }
        var operation
        try { operation = loaderRef.current(fresh, provider) } catch (err) { operation = Promise.reject(err) }
        return Promise.resolve(operation).then(function (body) {
          if (!current()) return
          if (quotaFailed(body)) throw new Error(body && body.error || '操作失败，请稍后重试。')
          if (targeted) body = mergeTarget(dataRef.current, body, provider)
          dataRef.current = body
          setData(body)
        }).catch(function (err) {
          if (current()) setErrors(function (previous) { var next = new Map(previous); next.set(key, String(err && err.message || err)); return next })
        }).finally(function () {
          if (!current()) return
          pendingRef.current.delete(key)
          setPending(new Set(pendingRef.current.keys()))
        })
      }
      React.useEffect(function () {
        if (props.active === false) return
        load(false)
        var timer = typeof setInterval === 'function' ? setInterval(function () { load(false) }, 30000) : null
        return function () {
          invalidate()
          if (timer !== null) clearInterval(timer)
        }
      }, [props.active, props.revision])
      React.useEffect(function () {
        if (props.refreshing === true) invalidate()
      }, [props.refreshing])
      React.useEffect(function () {
        if (props.snapshot === undefined) return
        invalidate()
        if (quotaFailed(props.snapshot)) {
          setErrors(new Map([['', String(props.snapshot && props.snapshot.error || '操作失败，请稍后重试。')]]))
          return
        }
        dataRef.current = props.snapshot
        setData(props.snapshot)
        setErrors(new Map())
      }, [props.snapshot])
      return { data: data, loading: pending.size > 0 || props.refreshing === true, error: errors.get('') || '', load: load,
        isLoading: function (provider) { return props.refreshing === true || pending.has('') || pending.has(provider) },
        errorFor: function (provider) { return errors.get(provider) || '' } }
    }

function mergeProviderQuota(previous, body, provider) {
      if (!previous || !Array.isArray(previous.quotas)) return body
      // A single-provider response includes cached rows for other providers.
      // Merge only its target so parallel refreshes cannot undo each other.
      var incoming = Array.isArray(body.quotas) ? body.quotas : []
      var present = new Set(incoming.map(function (quota) { return quota.provider }))
      var quotas = previous.quotas.filter(function (quota) { return present.has(quota.provider) })
      var update = incoming.find(function (quota) { return quota.provider === provider })
      var index = quotas.findIndex(function (quota) { return quota.provider === provider })
      // A target removed by a newer list must not return from a late response.
      if (index >= 0 && update) quotas[index] = update
      return Object.assign({}, previous, body, { quotas: quotas })
    }

function ProviderQuotasPanel(props) {
      var resource = useQuotaData(function (fresh, provider) { return props.api.providerQuotas({ fresh: fresh, provider: provider }) }, props, mergeProviderQuota)
      var data = resource.data, load = resource.load
      var quotas = data && data.ok === true && Array.isArray(data.quotas) ? data.quotas : []
      if (!quotas.length && !props.children) return resource.error ? React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)) : null

      function isBalanceOnly(quota) {
        var metrics = Array.isArray(quota.metrics) ? quota.metrics : []
        return metrics.length ? metrics.every(function (metric) { return metric.kind === 'amount' }) : quota.kind === 'balance'
      }
      function isDeepSeek(quota) { return quota.provider === 'deepseek' || quota.provider === 'deepseek-official' }
      // DeepSeek leads, then enabled account channels, then the remaining providers in their original groups.
      var others = quotas.filter(function (quota) { return !isDeepSeek(quota) })
      others = others.filter(isBalanceOnly).concat(others.filter(function (quota) { return !isBalanceOnly(quota) }))
      function renderQuota(quota) {
        var metrics = Array.isArray(quota.metrics) ? quota.metrics : []
        var loading = resource.isLoading(quota.provider)
        var error = resource.errorFor(quota.provider)
        // 上次获取时间：同一张配额卡片内，所有指标共享同一个获取时刻。
        var fetchedLine = React.createElement(React.Fragment, null,
          error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
          quotaNotice(quota),
          React.createElement('div', { className: 'dshus-fetched' }, t('上次获取时间：{time}', { time: fmtFetched(quota.syncedAt) })))
        if (!metrics.length) {
          if (quota.status !== 'unqueried' && quota.status !== 'unavailable') return null
          var statusLabel = quota.status === 'unqueried' ? t('未查询') : t('未获取')
          return React.createElement('div', { key: quota.provider, className: 'dshus-module dshus-balance-module' },
            React.createElement('div', { className: 'dshus-balance-title' },
              React.createElement('h3', null, t(quota.name)),
              refreshIconButton(function () { load(true, quota.provider) }, loading, t('刷新 {name} 配额', { name: t(quota.name) }), false),
            ),
            React.createElement('div', { className: 'dshus-balance-side' },
              React.createElement('div', {
                className: 'dshus-balance-value dshus-balance-status',
                'aria-label': t('{name} 配额{status}', { name: t(quota.name), status: statusLabel }),
                title: quota.status === 'unqueried' ? t('已在模型设置中配置，尚未查询配额。') : t('尚未获取到有效配额，可刷新重试。'),
              }, statusLabel),
              fetchedLine,
            ),
          )
        }
        var cards = []
        var windowRows = []
        metrics.forEach(function (metric, index) {
          var isWindow = metric.kind === 'window'
          var pct = isWindow ? Math.max(0, Math.min(100, Number(metric.remainingPercent))) : null
          var total = Number(metric.total)
          var remaining = Number(metric.remaining)
          var hasRatio = isWindow || (Number.isFinite(total) && total > 0 && Number.isFinite(remaining))
          if (!isWindow && hasRatio) pct = Math.max(0, Math.min(100, remaining / total * 100))
          var color = pct === null || pct >= 30 ? '#22c55e' : pct >= 10 ? '#f59e0b' : '#ef4444'
          var symbol = metric.currency === 'CNY' ? '¥' : metric.currency === 'USD' ? '$' : ''
          var value = isWindow ? Math.round(pct) + '%' : symbol + remaining.toFixed(2)
          var detail = isWindow && Number.isFinite(total) && total > 0 && Number.isFinite(remaining)
            ? fmtExact(remaining) + ' / ' + fmtExact(total)
            : !isWindow && Number.isFinite(total) && total > 0 ? t('上限 {amount}', { amount: symbol + total.toFixed(2) }) : ''
          if (isWindow) {
            var reset = metric.resetAt ? fmtReset(metric.resetAt) : ''
            windowRows.push(React.createElement('div', { key: metric.label + '-' + index, className: 'dshus-quota-row' },
              React.createElement('div', { className: 'dshus-quota-name' },
                React.createElement('span', { className: 'dshus-quota-label' }, quotaLabel(metric.label, quota.custom)),
                detail && React.createElement('span', { className: 'dshus-quota-detail' }, detail),
              ),
              React.createElement('div', {
                className: 'dshus-go-track',
                role: 'progressbar',
                'aria-label': quotaLabel(metric.label, quota.custom),
                'aria-valuemin': 0,
                'aria-valuemax': 100,
                'aria-valuenow': pct,
                'aria-valuetext': t('剩余 {value}', { value: value }) + (detail ? '，' + detail : '') + (reset ? '，' + reset : ''),
              }, React.createElement('div', { className: 'dshus-go-fill', style: { width: pct + '%', background: color } })),
              React.createElement('span', { className: 'dshus-quota-pct', style: { color: color }, title: t('剩余 {value}', { value: formatPct(pct) }) }, value),
              React.createElement('span', { className: 'dshus-quota-reset', title: metric.resetAt ? t('重置时间：{time}', { time: fmtFetched(metric.resetAt) }) : undefined }, reset),
            ))
            return
          }
          // 余额的多值分栏保留数值、上限和比例。
          cards.push(React.createElement('div', { key: metric.label + '-' + index, className: 'dshus-stat' },
            React.createElement('div', { className: 'v', style: { color: isWindow ? color : undefined } }, value),
            React.createElement('div', { className: 'k' }, quotaLabel(metric.label, quota.custom)),
            hasRatio && React.createElement('div', { className: 'dshus-go-track' },
              React.createElement('div', { className: 'dshus-go-fill', style: { width: pct + '%', background: color } }),
            ),
            (detail || metric.resetAt) && React.createElement('div', { className: 'dshus-go-foot' },
              React.createElement('span', null, detail),
              React.createElement('span', { className: 'dshus-go-reset' }, metric.resetAt ? fmtReset(metric.resetAt) : ''),
            ),
          ))
        })
        var balance = metrics.length === 1 && metrics[0].kind === 'amount' && metrics[0].total == null
          ? metrics[0] : null
        if (balance) {
          var refreshBtn = refreshIconButton(function () { load(true, quota.provider) }, loading, t('刷新 {name} 配额', { name: t(quota.name) }), false)
          var balanceSymbol = balance.currency === 'CNY' ? '¥' : balance.currency === 'USD' ? '$' : ''
          return React.createElement('div', { key: quota.provider, className: 'dshus-module dshus-balance-module' },
            React.createElement('div', { className: 'dshus-balance-title' },
              React.createElement('h3', null, t(quota.name)),
              refreshBtn,
            ),
            React.createElement('div', { className: 'dshus-balance-side' },
              React.createElement('div', { className: 'dshus-balance-value', 'aria-label': quotaLabel(balance.label, quota.custom) + ' ' + balanceSymbol + Number(balance.remaining).toFixed(2) },
                balanceSymbol + Number(balance.remaining).toFixed(2)),
              fetchedLine,
            ),
          )
        }
        return React.createElement('div', { key: quota.provider, className: 'dshus-module' },
          React.createElement('div', { className: 'dshus-quota-heading' },
            React.createElement('h3', null, t(quota.name)),
            fetchedLine,
            refreshIconButton(function () { load(true, quota.provider) }, loading, t('刷新 {name} 配额', { name: t(quota.name) }), false),
          ),
          cards.length > 0 && React.createElement('div', { className: 'dshus-statbar dshus-quota-bar' }, cards),
          windowRows.length > 0 && React.createElement('div', { className: 'dshus-quota-rows' }, windowRows),
        )
      }
      return React.createElement('div', { className: 'dshus-provider-panels', 'data-empty-label': t('已配置供应商的可读取配额会显示在这里') },
        resource.error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)),
        quotas.filter(isDeepSeek).map(renderQuota), props.children, others.map(renderQuota))
    }

function AccountQuotasPanel(props) {
      var resource = useQuotaData(function (fresh, target) {
        return props.api.accountQuotas(Object.assign({ fresh: fresh === true }, target))
      }, props)
      return React.createElement(React.Fragment, null,
        resource.error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(resource.error)),
        accountQuotasClient && resource.data && React.createElement(accountQuotasClient.QuotaPanel, {
          data: resource.data, loading: resource.loading, onRefresh: function (target) { return resource.load(true, target) },
          refreshButton: refreshIconButton, formatTime: fmtFetched, formatReset: fmtReset,
        }))
    }



function ProviderPicker(props) {
  var openState = React.useState(false)
  var open = openState[0], setOpen = openState[1]
  var activeState = React.useState(0)
  var active = activeState[0], setActive = activeState[1]
  var placementState = React.useState({ above: false, height: 260 })
  var placement = placementState[0], setPlacement = placementState[1]
  var rootRef = React.useRef(null)
  var listRef = React.useRef(null)
  var searchRef = React.useRef({ text: '', at: 0 })
  var options = props.options
  var selected = options.find(function (item) { return item.value === props.value }) || options[0]
  var activeIndex = Math.max(0, Math.min(active, options.length - 1))
  var listId = props.id + '-list'

  function show(index) {
    if (props.disabled) return
    var root = rootRef.current
    if (root) {
      var rect = root.getBoundingClientRect()
      var top = 0, bottom = window.innerHeight
      for (var parent = root.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(window.getComputedStyle(parent).overflowY)) {
          var bounds = parent.getBoundingClientRect()
          top = Math.max(top, bounds.top)
          bottom = Math.min(bottom, bounds.bottom)
        }
      }
      var page = root.closest('.dshus-page')
      var toolbar = page && page.querySelector('.dshus-toolbar')
      if (toolbar) top = Math.max(top, toolbar.getBoundingClientRect().bottom)
      var below = bottom - rect.bottom - 8
      var above = rect.top - top - 8
      var flip = below < 200 && above > below
      setPlacement({ above: flip, height: Math.max(34, Math.min(260, flip ? above : below)) })
    }
    setActive(index == null ? Math.max(0, options.indexOf(selected)) : index)
    searchRef.current = { text: '', at: 0 }
    setOpen(true)
  }
  function choose(index) {
    if (props.disabled) return
    setOpen(false)
    props.onChange(options[index].value)
  }
  function onKeyDown(event) {
    if (props.disabled) return
    var key = event.key
    if (key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    } else if (key === 'Tab') setOpen(false)
    else if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      if (open) choose(activeIndex)
      else show()
    } else if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      event.preventDefault()
      var index = key === 'Home' ? 0 : key === 'End' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, activeIndex + (key === 'ArrowDown' ? 1 : -1)))
      if (open) setActive(index)
      else show(key === 'Home' || key === 'End' ? index : null)
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      var now = Date.now()
      var search = open && now - searchRef.current.at < 700 ? searchRef.current.text + key.toLowerCase() : key.toLowerCase()
      if (search.split('').every(function (char) { return char === search[0] })) search = search[0]
      searchRef.current = { text: search, at: now }
      var start = search.length > 1 ? activeIndex : activeIndex + 1
      for (var offset = 0; offset < options.length; offset++) {
        var match = (start + offset) % options.length
        if (options[match].name.toLowerCase().startsWith(search)) {
          if (open) setActive(match)
          else { show(match); searchRef.current = { text: search, at: now } }
          break
        }
      }
    }
  }
  React.useEffect(function () {
    if (!open) return
    function outside(event) { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false) }
    function scroll(event) { if (listRef.current && !listRef.current.contains(event.target)) setOpen(false) }
    function close() { setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', close)
    return function () {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])
  React.useEffect(function () {
    // Scroll only the menu. scrollIntoView() can also move the settings pane.
    var list = listRef.current
    var item = list && list.children[activeIndex]
    if (!open || !item) return
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight
  }, [open, activeIndex])
  React.useEffect(function () { if (props.disabled) setOpen(false) }, [props.disabled])

  function dot(source) { return source ? React.createElement('span', { className: 'dshus-provider-dot', 'aria-hidden': 'true' }) : null }
  return React.createElement('div', { className: 'dshus-provider-picker', ref: rootRef },
    React.createElement('button', { id: props.id, type: 'button', role: 'combobox', className: 'dshus-field dshus-query-select', disabled: props.disabled, 'aria-labelledby': props.labelId + ' ' + props.id + '-value', 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': open ? listId : undefined, 'aria-activedescendant': open ? listId + '-' + activeIndex : undefined, onClick: function () { if (open) setOpen(false); else show() }, onKeyDown: onKeyDown },
      React.createElement('span', { id: props.id + '-value', className: 'dshus-provider-name' }, selected.name),
      dot(selected.source),
      React.createElement('svg', { className: 'dshus-provider-chevron', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': 'true' }, React.createElement('path', { d: 'm4 6 4 4 4-4' }))),
    open && React.createElement('div', { id: listId, role: 'listbox', 'aria-labelledby': props.labelId, className: 'dshus-provider-list' + (placement.above ? ' above' : ''), style: { maxHeight: placement.height }, ref: listRef },
      options.map(function (item, index) {
        // A stationary cursor must not override keyboard navigation as rows scroll past it.
        return React.createElement('div', { key: item.value, id: listId + '-' + index, role: 'option', 'data-value': item.value, 'aria-selected': item.value === props.value, 'aria-label': item.name + (item.source ? '，' + item.source : ''), title: item.source || undefined, className: 'dshus-provider-option' + (index === activeIndex ? ' active' : ''), onMouseMove: function () { setActive(index) }, onMouseDown: function (event) { event.preventDefault() }, onClick: function () { choose(index) } },
          React.createElement('span', { className: 'dshus-provider-name' }, item.name), dot(item.source))
      })),
  )
}

/**
 * The template schema, written as an instruction an assistant can act on.
 * Kept as a plain string so the whole thing can go to the clipboard verbatim:
 * pasting it into any chat assistant should produce a paste-ready template
 * without the user having to explain the schema themselves.
 */
function buildTemplatePrompt(context) {
  var name = (context && context.name) || t('该供应商')
  var key = (context && context.provider) || ''
  var existing = (context && context.template) || null
  return [
    t('请帮我为「{name}」写一份 DSH 用量统计插件的余额查询模板（JSON）。', { name: name }),
    '',
    t('【输出要求】'),
    t('只输出一个 JSON 对象，不要解释、不要 markdown 代码块围栏。'),
    '',
    t('【获取接口信息的方式】'),
    t('请先自己联网搜索「{name}」的余额 / 用量查询接口文档，不要一上来就找我要资料。', { name: name }),
    t('优先按下面的顺序查：官方 API 文档 → 余额或 billing / usage 接口说明 → 社区示例或 SDK 源码。'),
    t('如果能查到明确的接口地址与返回字段，直接据此写出模板。'),
    t('只有在确实查不到、或查到多个互相冲突的结果时，才向我提问；提问要具体，一次只问最关键的一点。'),
    t('如果你搜索到的是猜测而非确定的字段路径，请在回答里简要注明依据，方便我核对。'),
    '',
    t('【字段说明】'),
    t('url：查询地址，必须与下面 auth 所用凭据同源。'),
    t('method：GET 或 POST。'),
    t('auth："provider" 表示复用该供应商已保存的凭据；"none" 表示不需要认证。'),
    t('headers：可选，附加请求头对象。'),
    t('body：可选，POST 时发送的请求体对象。'),
    t('response.rows：可选。当余额在数组里时填写该数组的字段路径，例如 "data.list"。'),
    t('response.metrics：指标数组，每项包含：'),
    t('  label：界面显示的名称，例如 "账户可用余额"。'),
    t('  kind："amount" 表示金额，"window" 表示带重置时间的额度窗口。'),
    t('  remaining：金额型指标在响应中的字段路径，例如 "data.balance"。'),
    t('  usedPercent / remainingPercent：额度窗口型指标使用，取值为百分比字段路径。'),
    t('  currency：可选，金额单位，如 "CNY" 或 "USD"。'),
    '',
    t('【取值规则】'),
    t('字段路径用点号表示层级，例如 data.balance_infos.0.total_balance。'),
    t('数字字符串也要能直接使用，不要额外包装。'),
    '',
    t('【参考格式】'),
    '{',
    '  "url": "https://api.example.com/user/balance",',
    '  "method": "GET",',
    '  "auth": "provider",',
    '  "response": {',
    '    "metrics": [',
    '      { "label": ' + JSON.stringify(t('账户可用余额')) + ', "kind": "amount", "remaining": "data.balance", "currency": "CNY" }',
    '    ]',
    '  }',
    '}',
    '',
    t('【当前情况】'),
    t('供应商 ID：{provider}', { provider: key || t('（未指定）') }),
    existing
      ? t('现有模板（可在此基础上修正）：\n') + JSON.stringify(existing, null, 2)
      : t('该供应商目前没有模板，请从零编写。'),
  ].join('\n')
}

/** Native top-layer dialogs keep editors out of the control grid's layout. */
function ControlDialog(props) {
  var dialogRef = React.useRef(null)
  React.useEffect(function () {
    var dialog = dialogRef.current
    if (!dialog) return
    var active = document.activeElement
    if (!dialog.open) dialog.showModal()
    return function () {
      if (dialog.open) dialog.close()
      var target = active && active.isConnected ? active : document.getElementById(props.returnFocusId)
      if (target && typeof target.focus === 'function') target.focus({ preventScroll: true })
    }
  }, [])
  return React.createElement('dialog', { id: props.id, className: 'dshus-control-dialog', ref: dialogRef, 'aria-labelledby': props.id + '-title',
    onCancel: function (event) { event.preventDefault(); props.onClose() },
    onClick: function (event) {
      if (event.target !== dialogRef.current) return
      var rect = event.target.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) props.onClose()
    } },
    React.createElement('div', { className: 'dshus-control-dialog-head' },
      React.createElement('h3', { id: props.id + '-title' }, props.title),
      React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: props.onClose }, t('关闭窗口'))),
    React.createElement('div', { className: 'dshus-control-dialog-body' }, props.children))
}

/** Settings use the host store so timers also work while this page is closed. */
function ControlsPanel(props) {
  var control = props.control
  // The controls body may lack its settings block (a degraded endpoint or a
  // proxy error page): the switches degrade, the page never crashes.
  var settings = Object.assign({ customQueries: [] }, (control && control.settings) || {})
  if (!Array.isArray(settings.customQueries)) settings.customQueries = []
  // Read the host setting before enabling the selector.
  var advancedModelSelect = settings.advancedModelSelect === true
  var modelReasoning = settings.modelReasoning !== false
  var providersState = React.useState([])
  var providers = providersState[0], setProviders = providersState[1]
  var providerState = React.useState('')
  var provider = providerState[0], setProvider = providerState[1]
  var templateState = React.useState('')
  var templateText = templateState[0], setTemplateText = templateState[1]
  var confirmState = React.useState(false)
  var confirmAuto = confirmState[0], setConfirmAuto = confirmState[1]
  var savingState = React.useState(false)
  var saving = savingState[0], setSaving = savingState[1]
  var testingState = React.useState(false)
  var testing = testingState[0], setTesting = testingState[1]
  var previewState = React.useState(null)
  var preview = previewState[0], setPreview = previewState[1]
  var errorState = React.useState('')
  var error = errorState[0], setError = errorState[1]
  var statusState = React.useState('')
  var status = statusState[0], setStatus = statusState[1]
  var providerLoadingState = React.useState(true)
  var providerLoading = providerLoadingState[0], setProviderLoading = providerLoadingState[1]
  var copiedState = React.useState('')
  var copied = copiedState[0], setCopied = copiedState[1]
  var editorOpenState = React.useState(false)
  var editorOpen = editorOpenState[0], setEditorOpen = editorOpenState[1]
  var savedOpenState = React.useState(false)
  var savedOpen = savedOpenState[0], setSavedOpen = savedOpenState[1]
  var testRef = React.useRef(0)
  var drafts = React.useRef(Object.create(null))

  function loadProviders() {
    setProviderLoading(true)
    props.api.quotaProviders().then(function (body) {
      setProviders(body.providers || [])
      setProviderLoading(false)
    }).catch(function (err) { setError(String(err.message || err)); setProviderLoading(false) })
  }
  React.useEffect(function () { loadProviders(); return function () { testRef.current++ } }, [])

  function save(patch, message) {
    setSaving(true)
    setError('')
    setStatus('')
    return props.onSave(patch).then(function () {
      if (patch.action === 'remove-query') {
        delete drafts.current[patch.provider]
        if (provider === patch.provider) {
          var entry = providers.find(function (item) { return item.provider === provider })
          editTemplate(entry && entry.template ? JSON.stringify(entry.template, null, 2) : '')
        }
      }
      setSaving(false)
      setStatus(message || '设置已保存')
      if (patch.autoQuota !== undefined) setConfirmAuto(false)
    }).catch(function (err) { setSaving(false); setError(String(err.message || err)) })
  }
  function editTemplate(text, draftProvider) {
    testRef.current++
    var id = draftProvider === undefined ? provider : draftProvider
    if (id) drafts.current[id] = text
    setTemplateText(text)
    setPreview(null)
    setTesting(false)
    setStatus('')
    setError('')
  }
  function selectProvider(id) {
    if (provider) drafts.current[provider] = templateText
    setProvider(id)
    setSavedOpen(false)
    setEditorOpen(!!id)
    var saved = settings.customQueries.find(function (query) { return query.provider === id })
    var item = providers.find(function (entry) { return entry.provider === id })
    var text = item && item.queryType === 'adapter' ? '' : saved || item ? JSON.stringify(saved ? saved.template : item.template, null, 2) : ''
    editTemplate(Object.prototype.hasOwnProperty.call(drafts.current, id) ? drafts.current[id] : text, id)
  }
  /**
   * Copy the ready-made prompt. The clipboard API needs a secure context and
   * permission, so a rejection falls back to a hidden textarea + execCommand
   * and, if that also fails, tells the user to select the text by hand rather
   * than silently doing nothing.
   */
  function copyPrompt() {
    var text = buildTemplatePrompt({ provider: provider, name: promptProviderName, template: promptTemplate })
    function done() { setCopied('已复制，粘贴到任意 AI 对话即可'); setTimeout(function () { setCopied('') }, 4000) }
    function failed() { setCopied('复制失败，请手动选中下方提示词'); setTimeout(function () { setCopied('') }, 4000) }
    function fallback() {
      try {
        var area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.top = '-1000px'
        document.body.appendChild(area)
        area.select()
        var ok = document.execCommand('copy')
        document.body.removeChild(area)
        if (ok) done(); else failed()
      } catch (e) { failed() }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback)
    } else fallback()
  }
  function refreshAdapter() {
    var item = providers.find(function (entry) { return entry.provider === provider })
    if (!item || item.queryType !== 'adapter') return
    var current = ++testRef.current
    setTesting(true)
    setError('')
    setStatus('')
    props.api.quotaSource(item.source, { fresh: true }).then(function (body) {
      if (current !== testRef.current) return
      setTesting(false)
      setStatus(body.status === 'signed-in' ? '查询已更新，可在配额页查看。' : body.status === 'signed-out' ? '请先在 WorkBuddy 中登录。' : '尚未获取到配额，请检查扩展是否启用后重试。')
    }).catch(function (err) {
      if (current !== testRef.current) return
      setTesting(false)
      setError(String(err.message || err))
    })
  }
  function testTemplate() {
    var template
    try { template = JSON.parse(templateText) } catch (e) { setError('模板不是有效 JSON，请检查引号、逗号和括号。'); return }
    var current = ++testRef.current
    setTesting(true)
    setPreview(null)
    setError('')
    setStatus('')
    props.api.testQuota(provider, template).then(function (body) {
      if (current !== testRef.current) return
      setTesting(false)
      setPreview({ result: body, text: templateText, provider: provider })
    }).catch(function (err) {
      if (current !== testRef.current) return
      setTesting(false)
      setError(String(err.message || err))
    })
  }
  function switchButton(label, checked, callback) {
    return React.createElement('button', { type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': checked, className: 'dshus-switch' + (checked ? ' on' : ''), disabled: saving || !props.ready, onClick: callback })
  }
  var validPreview = preview && preview.text === templateText && preview.provider === provider
  var selected = providers.find(function (entry) { return entry.provider === provider })
  // The prompt describes the provider the user is looking at, so it borrows
  // the live template when one is loaded and stays generic otherwise.
  var promptProviderName = selected ? selected.name : provider
  var promptTemplate = null
  if (templateText.trim()) {
    try { promptTemplate = JSON.parse(templateText) } catch (e) { promptTemplate = null }
  }
  // The query module is its own card so the model-access control view can
  // place it in the four-card grid; on its own page it still reads as a
  // normal section of the controls column. The card heading names the group,
  // so the field below it carries no second "查询来源" label.
  var querySection = React.createElement('section', { className: 'dshus-control-section dshus-control-query-section', 'aria-labelledby': 'dshus-control-query-heading' },
    React.createElement('div', { className: 'dshus-control-query-head' },
      React.createElement('h3', { className: 'dshus-control-heading', id: 'dshus-control-query-heading' }, t('查询来源')),
      refreshIconButton(loadProviders, providerLoading, t('刷新供应商列表'), true)),
    React.createElement('div', { className: 'dshus-control-query' },
      React.createElement(ProviderPicker, { id: 'dshus-query-provider', labelId: 'dshus-control-query-heading', value: provider, disabled: saving || providerLoading || !props.ready, onChange: selectProvider, options: [{ value: '', name: providerLoading ? t('正在加载供应商…') : t('选择已有供应商') }].concat(providers.map(function (item) {
        var custom = settings.customQueries.some(function (query) { return query.provider === item.provider })
        var source = custom ? t('已保存自定义查询') : item.hasBuiltinQuery === true ? item.queryType === 'adapter' ? t('内置扩展查询') : t('内置供应商查询') : ''
        return { value: item.provider, name: t(item.name), source: source }
      })) }),
      !providerLoading && !providers.length && React.createElement('p', { className: 'dshus-setting-help' }, t('尚无可用查询来源，请先添加模型供应商。')),
      // With no provider chosen there is still a failure worth showing here,
      // e.g. loading the provider list itself.
      !provider && error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
      React.createElement('div', { className: 'dshus-control-actions' },
        React.createElement('button', { id: 'dshus-query-edit', type: 'button', className: 'dshus-btn', disabled: !provider || saving || providerLoading || !props.ready, 'aria-haspopup': 'dialog', 'aria-expanded': editorOpen, 'aria-controls': editorOpen ? 'dshus-query-dialog' : undefined, onClick: function () { setEditorOpen(true) } }, t('编辑查询'))),
      provider && editorOpen && React.createElement(ControlDialog, { id: 'dshus-query-dialog', title: t(promptProviderName), returnFocusId: 'dshus-query-edit', onClose: function () { setEditorOpen(false) } },
      selected && selected.queryType === 'adapter' && React.createElement('div', { className: 'dshus-control-actions' },
        React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving || testing, onClick: refreshAdapter }, testing ? t('正在查询…') : t('查询配额')),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error))),
      provider && (!selected || selected.queryType !== 'adapter') && React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'dshus-control-actions' },
          React.createElement('label', { className: 'dshus-setting-label', htmlFor: 'dshus-query-template' }, t('查询模板（JSON）')),
          selected && React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { editTemplate(JSON.stringify(selected.template, null, 2)) } }, t('重置模板'))),
        React.createElement('textarea', { id: 'dshus-query-template', className: 'dshus-field dshus-query-editor', value: templateText, spellCheck: false, disabled: saving, onChange: function (event) { editTemplate(event.target.value) } }),
        React.createElement('div', { className: 'dshus-control-actions' },
          React.createElement('span', { className: 'dshus-setting-help', role: 'status' }, t('草稿已保留，测试并确认后生效。')),
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () {
            var saved = settings.customQueries.find(function (query) { return query.provider === provider })
            editTemplate(JSON.stringify(saved ? saved.template : selected && selected.template, null, 2) || '')
          } }, t('恢复已保存模板'))),
        // Include the provider and current template in a copyable AI prompt.
        // Selectable text supports hosts without clipboard access.
        React.createElement('div', { className: 'dshus-prompt' },
          React.createElement('div', { className: 'dshus-prompt-head' },
            React.createElement('span', { className: 'dshus-prompt-title' }, t('用 AI 生成模板')),
            React.createElement('button', { type: 'button', className: 'dshus-btn dshus-prompt-copy', onClick: copyPrompt }, t('复制提示词'))),
          React.createElement('pre', { className: 'dshus-prompt-body', tabIndex: 0, 'aria-label': t('可复制的模板生成提示词') }, buildTemplatePrompt({ provider: provider, name: promptProviderName, template: promptTemplate })),
          copied && React.createElement('p', { className: 'dshus-prompt-note', role: 'status' }, t(copied))),
        React.createElement('div', { className: 'dshus-control-actions' },
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving || testing || !templateText.trim(), onClick: testTemplate }, testing ? t('正在测试…') : t('测试查询')),
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving || testing || !validPreview, onClick: function () { save({ action: 'save-query', provider: provider, template: JSON.parse(templateText), testId: preview.result.testId }, '已保存，可在配额页查看此供应商。') } }, saving ? t('正在保存…') : t('确认并显示'))),
        // The cost warning stays last, directly under the buttons that can
        // spend balance, so it is read right before the user acts.
        React.createElement('p', { className: 'dshus-cost-note' }, t('测试会发起一次请求，可能消耗少量余额。')),
        // A failed query belongs with the controls that produced it, so the
        // message sits inside this module rather than at the top of the page.
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        validPreview && React.createElement('div', { className: 'dshus-query-preview', role: 'status' },
          React.createElement('strong', null, t('测试成功 · {name}', { name: t(preview.result.quota.name) })),
          preview.result.quota.metrics.map(function (metric, index) { return React.createElement('div', { key: index }, metric.label + '：' + (metric.kind === 'window' ? Math.round(metric.remainingPercent * 100) / 100 + '%' : (metric.currency === 'CNY' ? '¥' : metric.currency === 'USD' ? '$' : '') + fmtExact(metric.remaining))) })),
      )),
      (settings.customQueries || []).length > 0 && React.createElement('button', { id: 'dshus-saved-queries-toggle', type: 'button', className: 'dshus-saved-queries-toggle', 'aria-haspopup': 'dialog', 'aria-expanded': savedOpen, 'aria-controls': savedOpen ? 'dshus-saved-queries-dialog' : undefined, onClick: function () { setEditorOpen(false); setSavedOpen(true) } },
        React.createElement('span', null, t('已启用的自定义查询')),
        React.createElement('span', { className: 'dshus-setting-help' }, String(settings.customQueries.length)),
        React.createElement('svg', { className: 'dshus-provider-chevron', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': 'true' }, React.createElement('path', { d: 'm4 6 4 4 4-4' }))),
      savedOpen && (settings.customQueries || []).length > 0 && React.createElement(ControlDialog, { id: 'dshus-saved-queries-dialog', title: t('已启用的自定义查询'), returnFocusId: 'dshus-saved-queries-toggle', onClose: function () { setSavedOpen(false) } },
        (settings.customQueries || []).map(function (query) {
          var item = providers.find(function (entry) { return entry.provider === query.provider })
          return React.createElement('div', { key: query.provider, className: 'dshus-saved-query' },
            React.createElement('span', null, item ? item.name : query.provider),
            React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { selectProvider(query.provider) } }, t('编辑')),
            React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { save({ action: 'remove-query', provider: query.provider }, '已移除自定义查询，恢复内置配额查询。') } }, t('移除')))
        })),
    ))
  // Keep the feature cards mounted with their state and event handlers.
  // Their accessible names identify the groups without visible headings.
  var modelCard = React.createElement('section', { className: 'dshus-control-section', 'aria-label': t('模型功能') },
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('模型推理强度')),
          switchButton(t('模型推理强度'), modelReasoning, function () { save({ modelReasoning: !modelReasoning }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('高级模型选择器')),
          switchButton(t('高级模型选择器'), advancedModelSelect, function () {
            save({ advancedModelSelect: !advancedModelSelect }, advancedModelSelect ? '已关闭，已恢复官方模型选择器' : '已开启高级模型选择器')
          })),
        // Show the refresh interval beside the automatic-balance switch.
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('自动获取剩余余额')),
          React.createElement('div', { className: 'dshus-setting-tail' },
            settings.autoQuota && React.createElement('select', { id: 'dshus-auto-interval', className: 'dshus-field dshus-select dshus-select-inline', value: settings.intervalMinutes, disabled: saving || !props.ready, 'aria-label': t('自动获取间隔'), onChange: function (event) { save({ intervalMinutes: Number(event.target.value) }) } },
              [[10, t('10 分钟')], [60, t('1 小时')], [300, t('5 小时')], [1440, t('每天')]].map(function (option) { return React.createElement('option', { key: option[0], value: option[0] }, option[1]) })),
            switchButton(t('自动获取剩余余额'), settings.autoQuota, function () { if (settings.autoQuota) save({ autoQuota: false }); else setConfirmAuto(true) }))),
        // The cost warning stays directly under the switch that spends money.
        confirmAuto && React.createElement('div', { className: 'dshus-confirm', role: 'alert', 'aria-label': t('自动查询费用提醒') },
          React.createElement('p', null, t('自动查询可能会消耗少量余额，具体取决于供应商的计费规则。确认开启后，将立即获取一次，之后按所选间隔更新。')),
          React.createElement('div', { className: 'dshus-control-actions' },
            React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { save({ autoQuota: true, acknowledgeCost: true }) } }, t('确认开启')),
            React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving, onClick: function () { setConfirmAuto(false) } }, t('取消')))),
  )
  var displayCard = React.createElement('section', { className: 'dshus-control-section', 'aria-label': t('用量展示') },
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('模型明细与分布')),
          switchButton(t('模型明细与分布'), settings.showModelDetails, function () { save({ showModelDetails: !settings.showModelDetails }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('token输出速度')),
          switchButton(t('token输出速度'), settings.showTokenSpeed !== false, function () { save({ showTokenSpeed: settings.showTokenSpeed === false }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('模型检测')),
          switchButton(t('模型检测'), settings.showModelDetection === true, function () { save({ showModelDetection: settings.showModelDetection !== true }) })),
  )
  // The model-access view supplies its gateway cell as a slot. Rendering
  // every card here avoids an effect-based handoff that requires this panel
  // to mount before its parent can display it.
  var hostCards = [modelCard, displayCard, querySection]
  var cardCells = hostCards.map(function (card, index) {
    return React.createElement('div', { key: 'grid-cell-' + index, className: 'dshus-ma-control-cell', 'data-part': 'host-cell' }, card)
  })
  if (props.gatewayCard) cardCells.splice(2, 0, props.gatewayCard)
  return React.createElement('div', { className: 'dshus-controls' },
    // Settings-load failures apply to all sections; query failures stay
    // beside the provider or template that produced them.
    props.error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(props.error),
      React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: props.onReload }, t('重试'))),
    React.createElement('div', { className: 'dshus-ma-control-grid', 'data-part': 'control-grid' }, cardCells),
    (!props.ready && !props.error || status) && React.createElement('div', { className: 'dshus-control-status', role: 'status' }, !props.ready && !props.error ? t('正在读取设置…') : t(status)),
  )
}

/* ------------------------------------------------------------------ */
/* Settings section page                                               */
/* ------------------------------------------------------------------ */

var NO_SESSION = Object.freeze({})

function DetectionPanel(props) {
      var currentStore = props.uiSession && props.uiSession.current || props.uiWorkspace && props.uiWorkspace.selection
      var current = React.useSyncExternalStore(function (listener) { return currentStore ? currentStore.subscribe(listener) : function () {} }, function () { return currentStore ? currentStore.getSnapshot() : NO_SESSION })
      var sessionId = current.key || current.sessionId || ''
      var directoryRef = React.useRef({ id: null, value: null })
      if (directoryRef.current.id !== sessionId) {
        var directory = null
        try { if (sessionId && props.modelDirectories) directory = props.modelDirectories.directoryFor(sessionId) } catch (err) {}
        directoryRef.current = { id: sessionId, value: directory }
      }
      var activeDirectory = directoryRef.current.value, directoryStore = activeDirectory && activeDirectory.store
      var modelState = React.useSyncExternalStore(function (listener) { return directoryStore ? directoryStore.subscribe(listener) : function () {} }, function () { return directoryStore ? directoryStore.getSnapshot() : NO_SESSION })
      React.useEffect(function () { if (activeDirectory) Promise.resolve(activeDirectory.load()).catch(function () {}) }, [activeDirectory])
      var suggested = modelState.current || null
      var selectedState = React.useState(suggested || { provider: '', model: '' }), selection = selectedState[0], setSelection = selectedState[1]
      var manualSelection = React.useRef(false)
      var provider = selection && selection.provider || '', model = selection && selection.model || '', effort = selection && selection.reasoningEffort || ''
      var providersState = React.useState([]), providers = providersState[0], setProviders = providersState[1]
      var modelsState = React.useState([]), models = modelsState[0], setModels = modelsState[1]
      var providersLoadingState = React.useState(true), providersLoading = providersLoadingState[0], setProvidersLoading = providersLoadingState[1]
      var modelsLoadingState = React.useState(false), modelsLoading = modelsLoadingState[0], setModelsLoading = modelsLoadingState[1]
      var modelsProviderState = React.useState(''), modelsProvider = modelsProviderState[0], setModelsProvider = modelsProviderState[1]
      var resultKey = [sessionId, provider, model, effort].join('|')
      var jobState = React.useState(null), job = jobState[0], setJob = jobState[1]
      var errorState = React.useState(''), error = errorState[0], setError = errorState[1]
      var busyState = React.useState(false), busy = busyState[0], setBusy = busyState[1]
      var cancellingState = React.useState(false), cancelling = cancellingState[0], setCancelling = cancellingState[1]
      var catalogState = React.useState(null), catalog = catalogState[0], setCatalog = catalogState[1]
      var updatingState = React.useState(false), updating = updatingState[0], setUpdating = updatingState[1]
      var countState = React.useState(3), count = countState[0], setCount = countState[1]
      var budgetState = React.useState(12000), budget = budgetState[0], setBudget = budgetState[1]
      var maxTokensState = React.useState(4096), maxTokens = maxTokensState[0], setMaxTokens = maxTokensState[1]
      var quoteState = React.useState(null), quoted = quoteState[0], setQuoted = quoteState[1]
      var sequence = React.useRef(0), planSequence = React.useRef(0), mounted = React.useRef(true)
      var resultRef = React.useRef(null), notifiedJob = React.useRef('')
      var quoteKey = [resultKey, count, budget, maxTokens].join('|')
      var quote = quoted && quoted.key === quoteKey && quoted.body
      var running = job && job.status === 'running'
      var selectedReady = providers.some(function (item) { return item.provider === provider }) && modelsProvider === provider && models.some(function (item) { return item.id === model }) && !modelsLoading
      var jobIsCurrent = job && job.sessionId === sessionId && job.selection.provider === provider && job.selection.model === model && (job.selection.reasoningEffort || '') === effort
      var savedPlan = job && job.plan || {}, savedOutputLimit = savedPlan.maxTokens || savedPlan.maxOutputTokens && savedPlan.requests && savedPlan.maxOutputTokens / savedPlan.requests
      var resultMatchesSetup = jobIsCurrent && (!savedPlan.requests || savedPlan.requests === count) && (!savedPlan.budgetTokens || savedPlan.budgetTokens === budget) && (!savedOutputLimit || savedOutputLimit === maxTokens)
      var currentStep = running || resultMatchesSetup && !quote ? 2 : selectedReady ? 1 : 0
      React.useEffect(function () {
        if (manualSelection.current || busy || running || !suggested || !suggested.provider || !suggested.model) return
        setSelection(function (previous) { return previous.provider === suggested.provider && previous.model === suggested.model && (previous.reasoningEffort || '') === (suggested.reasoningEffort || '') ? previous : suggested })
      }, [suggested && suggested.provider, suggested && suggested.model, suggested && suggested.reasoningEffort, busy, running])
      React.useEffect(function () {
        if (!props.active) return
        var alive = true
        setProvidersLoading(true)
        props.api.modelDetectionModels().then(function (body) {
          if (!alive) return
          var list = body.providers || []
          setProviders(list); setProvidersLoading(false)
          setSelection(function (previous) { return previous.provider || !list.length ? previous : { provider: list[0].provider, model: '' } })
        }).catch(function (err) { if (alive) { setProvidersLoading(false); setError(String(err.message || err)) } })
        return function () { alive = false }
      }, [props.active])
      React.useEffect(function () {
        if (!props.active || !provider) return
        var alive = true
        setModels([]); setModelsProvider(''); setModelsLoading(true)
        props.api.modelDetectionModels(provider).then(function (body) {
          if (!alive || body.provider !== provider) return
          var list = body.models || []
          setModels(list); setModelsProvider(provider); setModelsLoading(false)
          setSelection(function (previous) {
            if (previous.provider !== provider) return previous
            if (previous.model && list.some(function (item) { return item.id === previous.model })) return previous
            return { provider: provider, model: previous.model ? '' : list.length ? list[0].id : '' }
          })
        }).catch(function (err) { if (alive) { setModelsLoading(false); setError(String(err.message || err)) } })
        return function () { alive = false }
      }, [props.active, provider])
      React.useEffect(function () {
        if (!job || job.status === 'running' || notifiedJob.current === job.id) return
        notifiedJob.current = job.id
        if (resultRef.current && resultRef.current.scrollIntoView) resultRef.current.scrollIntoView({ block: 'start', behavior: 'auto' })
        if (props.onUsageUpdated) props.onUsageUpdated()
      }, [job && job.id, job && job.status])
      React.useEffect(function () { mounted.current = true; return function () { mounted.current = false; planSequence.current++ } }, [])
      function readCatalog() {
        return props.api.modelFingerprintEngine().then(function (body) { if (mounted.current) setCatalog(body) })
      }
      function refresh() {
        var request = ++sequence.current
        props.api.modelDetectionStatus(sessionId ? { session: sessionId } : {}).then(function (body) {
          if (request === sequence.current && mounted.current) setJob(body.job || null)
        }).catch(function (err) { if (request === sequence.current && mounted.current) setError(String(err.message || err)) })
      }
      React.useEffect(function () {
        if (props.active) { refresh(); readCatalog().catch(function (err) { if (mounted.current) setError(String(err.message || err)) }) }
        return function () { sequence.current++ }
      }, [props.active, sessionId])
      React.useEffect(function () { planSequence.current++; setQuoted(null) }, [quoteKey])
      React.useEffect(function () {
        if (!props.active || !catalog || !catalog.updating) return
        var timer = setTimeout(function () { readCatalog().catch(function () {}) }, 2000)
        return function () { clearTimeout(timer) }
      }, [props.active, catalog])
      React.useEffect(function () {
        if (!running) return
        var alive = true, timer
        function poll() {
          props.api.modelDetectionStatus({ job: job.id }).then(function (body) {
            if (!alive) return
            setJob(body.job)
            if (body.job && body.job.status === 'running') timer = setTimeout(poll, 1500)
            else setCancelling(false)
          }).catch(function (err) { if (alive) { setError(String(err.message || err)); timer = setTimeout(poll, 3000) } })
        }
        timer = setTimeout(poll, 500)
        return function () { alive = false; clearTimeout(timer) }
      }, [running, job && job.id])
      function preview() {
        if (busy || running || !selectedReady) return
        var request = ++planSequence.current
        setBusy(true); setError(''); setQuoted(null)
        props.api.modelDetection({ action: 'plan', sessionId: sessionId, selection: { provider: provider, model: model, ...(effort ? { reasoningEffort: effort } : {}) }, sampleCount: count, budgetTokens: budget, maxTokens: maxTokens }).then(function (body) {
          if (!mounted.current) return
          setBusy(false)
          if (request === planSequence.current) setQuoted({ key: quoteKey, body: body.quote })
        }).catch(function (err) { if (mounted.current) { setBusy(false); if (request === planSequence.current) setError(String(err.message || err)) } })
      }
      function start() {
        if (busy || running || !quote) return
        sequence.current++; setBusy(true); setError(''); setCancelling(false)
        props.api.modelDetection({ action: 'start', sessionId: sessionId, planId: quote.id, ackCost: true }).then(function (body) {
          if (mounted.current) { setJob(body.job); setQuoted(null); setBusy(false) }
        }).catch(function (err) { if (mounted.current) { setError(String(err.message || err)); setBusy(false); setQuoted(null) } })
      }
      function cancel() {
        if (!job || cancelling) return
        setCancelling(true); setError('')
        props.api.modelDetection({ action: 'cancel', id: job.id }).then(function (body) { if (mounted.current) { setJob(body.job); if (body.job.status !== 'running') setCancelling(false) } })
          .catch(function (err) { if (mounted.current) { setError(String(err.message || err)); setCancelling(false) } })
      }
      function updateEngine() {
        setUpdating(true); setError('')
        props.api.modelFingerprintEngine({ action: 'update' }).then(function (body) { if (mounted.current) setCatalog(body) })
          .catch(function (err) { if (mounted.current) setError(String(err.message || err)) })
          .finally(function () { if (mounted.current) setUpdating(false) })
      }
      function fields(config) {
        return React.createElement('dl', { className: 'dshus-detection-fields' }, [['供应商', config.provider], ['请求模型', config.model], ['推理强度', config.reasoningEffort || t('供应商默认')]].map(function (entry) {
          return React.createElement('div', { key: entry[0] }, React.createElement('dt', null, t(entry[0])), React.createElement('dd', null, entry[1]))
        }))
      }
      function selectProvider(event) {
        manualSelection.current = true; planSequence.current++; setQuoted(null); setError('')
        setSelection({ provider: event.target.value, model: '' })
      }
      function selectModel(event) {
        manualSelection.current = true; planSequence.current++; setQuoted(null); setError('')
        setSelection({ provider: provider, model: event.target.value })
      }
      function field(label, element) { return React.createElement('label', { className: 'dshus-detection-field' }, React.createElement('span', { className: 'dshus-setting-label' }, t(label)), element) }
      function probability(value) { return Number.isFinite(value) ? (value * 100).toFixed(1) + '%' : '—' }
      function stepsView() {
        var steps = [
          { title: '选择检测模型', detail: model || t('尚未选择模型') },
          { title: '确认预算', detail: t('{count} 次 · 单次 {tokens} Token', { count: count, tokens: fmt(maxTokens) }) },
          { title: '检测结果', detail: t(running ? '检测进行中' : resultMatchesSetup ? job.status === 'cancelled' ? '已取消' : '检测已结束' : '等待检测结果') },
        ]
        return React.createElement('ol', { className: 'dshus-steps', 'aria-label': t('检测步骤') }, steps.map(function (step, index) {
          var state = index === currentStep ? 'current' : index < currentStep ? 'done' : 'upcoming'
          return React.createElement('li', { key: step.title, className: 'dshus-step', 'data-state': state, 'aria-current': state === 'current' ? 'step' : undefined },
            React.createElement('span', { className: 'dshus-step-mark', 'aria-hidden': true }, index + 1),
            React.createElement('div', { className: 'dshus-step-body' },
              React.createElement('span', { className: 'dshus-step-title' }, t(step.title)),
              React.createElement('span', { className: 'dshus-step-detail' }, step.detail)))
        }))
      }
      function samplesView(results, plan, validSamples) {
        var labels = { scored: '有效', incomplete: '输出截断', unparseable: '格式无效', unavailable: '请求失败', timeout: '超时', cancelled: '已取消', sampling: '采样中', pending: '未采样' }
        var total = plan.requests || 3
        return React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dshus-detection-list-title' }, React.createElement('h4', null, t('采样状态')), React.createElement('span', null, t('有效样本 {valid} / {total}', { valid: validSamples, total: total }))),
          React.createElement('ol', { className: 'dshus-detection-samples', 'aria-label': t('采样状态'), 'data-count': total }, Array.from({ length: total }, function (_, index) {
            var item = results[index], outcome = item ? item.outcome : running && index === results.length && job.phase !== 'scoring' ? 'sampling' : 'pending'
            var expected = item ? item.expected : plan.numbers && plan.numbers[index]
            return React.createElement('li', { key: index, className: 'dshus-detection-sample', 'data-outcome': outcome },
              React.createElement('strong', null, t('采样 {number}', { number: index + 1 }), ' · ', t(labels[outcome] || '未采样')),
              React.createElement('span', { title: t('有效数字 / 要求数量') }, item ? fmtExact(item.valid || 0) : '—', ' / ', expected ? fmtExact(expected) : '—'),
              item && item.stop === 'max-tokens' && React.createElement('span', { className: 'dshus-detection-sample-limit' }, t('已达单次输出上限')))
          })))
      }
      function jobView() {
        var historical = !running && !resultMatchesSetup
        var identity = job.identity, candidates = identity && identity.candidates || []
        var summary = job.conclusion || { verdict: running ? 'running' : 'inconclusive', reason: job.status === 'cancelled' ? 'cancelled' : 'unfinished' }
        var titles = { running: '检测运行中', 'candidate-consistent': '首选候选与请求模型一致', 'candidate-different': '首选候选与请求模型不同', 'ranking-only': '候选排序', inconclusive: '无法判定' }
        var explanations = { 'model-not-enrolled': '请求模型不在参考库中，候选仅供比较。', 'merged-class': '参考库将这些型号合并为同一类，无法区分具体型号。', 'low-confidence': '置信度不足，候选仅供比较。', cancelled: '检测已取消，已发生的用量仍会统计。', interrupted: '宿主重启时检测尚未完成，请重新检测。', budget: '已达到 Token 预算，检测未完成。', timeout: '请求超时，检测未完成。', 'request-failed': '通道请求失败，检测未完成。', truncated: '随机数输出被截断；请提高单次输出上限，重新查看预算后检测。', format: '有效随机数不足，已停止后续请求。', distribution: '随机数分布异常，本次结果无法判定。', unfinished: '尚未取得足够指纹数据，无法判定。' }
        var calibrated = !!(identity && identity.usedSamples === 3 && !identity.unusualDistribution && Number.isFinite(identity.probability))
        var results = job.results || [], plan = job.plan || {}, validSamples = results.filter(function (item) { return item.outcome === 'scored' }).length
        var totalRequests = plan.requests || 3, progress = Math.max(0, Math.min(totalRequests, job.progress || 0))
        var perRequestLimit = plan.maxTokens || plan.maxOutputTokens && plan.requests && plan.maxOutputTokens / plan.requests
        var providerName = providers.find(function (item) { return item.provider === job.selection.provider })
        var usage = job.usage || {}, jobTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0)
        return React.createElement('div', { className: 'dshus-module dshus-detection-summary', role: 'region', 'aria-label': t('检测结果'), ref: resultRef },
          React.createElement('h3', { title: historical ? t('历史结果，仅对应下方列出的模型和参数。') : undefined }, t(historical ? '上次检测结果' : '检测结果')),
          historical && React.createElement('p', { className: 'dshus-setting-help' }, t('历史结果，仅对应下方列出的模型和参数。')),
          React.createElement('p', { className: 'dshus-detection-model' }, job.selection.model, ' · ', providerName ? providerName.name : job.selection.provider),
          candidates.length > 0 && React.createElement('div', { className: 'dshus-detection-headline' },
            React.createElement('h4', { 'aria-label': t('首选候选') }, candidates[0].name),
            React.createElement('div', { className: 'dshus-detection-confidence' }, React.createElement('span', null, t(calibrated ? '库内置信度' : '仅排序')), calibrated && React.createElement('strong', null, probability(identity.probability)))),
          React.createElement('p', { className: 'dshus-detection-verdict', 'data-verdict': summary.verdict, role: 'status' }, t(titles[summary.verdict] || '无法判定')),
          explanations[summary.reason] && !(running && summary.reason === 'unfinished') && React.createElement('p', { className: 'dshus-setting-help' }, t(explanations[summary.reason])),
          candidates.length > 0 && identity.usedSamples < 3 && React.createElement('p', { className: 'dshus-setting-help' }, t('仅基于 {count} 个有效样本展示排名；3 个有效样本才显示库内置信度。', { count: identity.usedSamples })),
          calibrated && identity.probability < .75 && summary.reason !== 'low-confidence' && React.createElement('p', { className: 'dshus-setting-help dshus-detection-warning' }, t('置信度不足（低于 75%）')),
          running && React.createElement('div', { className: 'dshus-detection-progress' },
            React.createElement('div', { className: 'dshus-detection-progress-head' },
              React.createElement('p', { role: 'status' }, job.phase === 'scoring' ? t('正在分析指纹…') : t('已完成 {progress} 次请求，上限 {requests} 次', { progress: progress, requests: totalRequests })),
              React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: cancelling, onClick: cancel }, t(cancelling ? '正在取消…' : '取消检测'))),
            React.createElement('progress', { max: totalRequests, value: progress, 'aria-label': t('检测进度') })),
          candidates.length > 0 && React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'dshus-detection-list-title' }, React.createElement('h4', null, t('候选排名')), React.createElement('span', null, t(calibrated ? '库内置信度' : '指纹得分'))),
            React.createElement('ol', { className: 'dshus-detection-rankings', 'aria-label': t('候选排名') }, candidates.map(function (candidate, index) {
              return React.createElement('li', { key: candidate.id, className: 'dshus-detection-rank', 'data-unscored': calibrated ? undefined : true },
                React.createElement('span', { 'aria-hidden': true }, index + 1),
                React.createElement('span', { className: 'dshus-detection-rank-name' }, candidate.name, candidate.family && React.createElement('small', null, candidate.family)),
                calibrated && React.createElement('div', { className: 'dshus-detection-bar', 'aria-hidden': true }, React.createElement('span', { style: { width: (Number.isFinite(candidate.probability) ? Math.max(0, Math.min(1, candidate.probability)) * 100 : 0) + '%' } })),
                React.createElement('span', { className: 'dshus-detection-rank-value', 'aria-label': t(calibrated ? '库内置信度' : '指纹得分') }, calibrated ? probability(candidate.probability) : Number(candidate.score).toFixed(3)))
            }))),
          samplesView(results, plan, validSamples),
          job.usageReported && React.createElement('p', { className: 'dshus-detection-cost', title: fmtExact(jobTokens) }, t(job.usageSaved ? '本次消耗 {tokens} Token · 已计入统计' : '本次已上报消耗 {tokens} Token', { tokens: fmt(jobTokens) })),
          job.usageIncomplete && React.createElement('p', { className: 'dshus-setting-help' }, t('部分检测用量尚未上报，可能已产生费用。')),
          job.message && React.createElement('p', { className: 'dshus-setting-help' }, uiError(job.message)),
          candidates.length > 0 && React.createElement('p', { className: 'dshus-setting-help' }, t('仅为参考库内排名，不证明模型身份，也不衡量能力降级。')),
          React.createElement('details', { className: 'dshus-disclosure', key: job.id },
            React.createElement('summary', null, t('检测详情')),
            fields(job.testSelection || job.selection),
            React.createElement('p', null, t('已完成 {progress} 次请求，上限 {requests} 次', { progress: job.progress, requests: job.plan.requests })),
            perRequestLimit && React.createElement('p', null, t('每次最多 {maxTokens} Token · 所有请求输出最多 {maxOutputTokens} Token', { maxTokens: fmtExact(perRequestLimit), maxOutputTokens: fmtExact(plan.maxOutputTokens) })),
            plan.budgetTokens && React.createElement('p', null, t('已上报 Token 预算'), ' · ', fmtExact(plan.budgetTokens)),
            job.engine && React.createElement('p', { className: 'dshus-setting-help' }, 'lmfpd ', job.engine.version, ' · ', String(job.engine.builtAt || '').slice(0, 10)),
            candidates.length > 0 && React.createElement('div', { className: 'dshus-table-wrap' }, React.createElement('table', { className: 'dshus-table' },
              React.createElement('thead', null, React.createElement('tr', null, ['候选模型', '指纹得分', '库内置信度'].map(function (label) { return React.createElement('th', { key: label, scope: 'col' }, t(label)) }))),
              React.createElement('tbody', null, candidates.map(function (candidate) { return React.createElement('tr', { key: candidate.id }, React.createElement('td', null, candidate.name), React.createElement('td', null, Number(candidate.score).toFixed(3)), React.createElement('td', null, probability(calibrated ? candidate.probability : null))) })))),
            job.channel && React.createElement('p', null, t('本次通道表现'), ' · TPS ', Number.isFinite(job.channel.tps) ? job.channel.tps.toFixed(1) : '—', ' tok/s · TTFT ', Number.isFinite(job.channel.ttftMs) ? (job.channel.ttftMs / 1000).toFixed(2) + ' s' : '—')))
      }
      return React.createElement('div', { className: 'dshus-detection-panel' },
        React.createElement('div', { className: 'dshus-module' }, React.createElement('h3', null, t('模型检测')),
          React.createElement('p', { className: 'dshus-detection-intro' }, t('检测会在参考库中排序候选模型；结果为参考排名，不证明模型身份。')),
          stepsView(),
          React.createElement('div', { className: 'dshus-detection-form' },
            field('检测供应商', React.createElement('select', { id: 'dshus-detection-provider', 'aria-label': t('检测供应商'), className: 'dshus-field', value: provider, disabled: busy || running || providersLoading, onChange: selectProvider },
              React.createElement('option', { value: '' }, t(providersLoading ? '正在加载供应商…' : providers.length ? '选择已有供应商' : '没有已配置的供应商')),
              providers.map(function (item) { return React.createElement('option', { key: item.provider, value: item.provider }, item.name) }))),
            field('检测模型', React.createElement('select', { id: 'dshus-detection-model', 'aria-label': t('检测模型'), className: 'dshus-field', value: model, disabled: busy || running || modelsLoading || !provider, onChange: selectModel },
              React.createElement('option', { value: '' }, t(modelsLoading ? '正在加载模型…' : models.length ? '选择检测模型' : '没有可用模型')),
              models.map(function (item) { return React.createElement('option', { key: item.id, value: item.id }, item.name) })))),
          React.createElement('p', { className: 'dshus-setting-help' }, t('可选择任意已配置模型；检测选择不会更改会话模型。'))),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        job && jobView(),
        React.createElement('div', { className: 'dshus-module' }, React.createElement('h3', null, t('随机数指纹检测')),
          React.createElement('p', { className: 'dshus-detection-intro' }, t('使用 LM Fingerprint 官方随机数指纹，默认 3 次请求；不发送会话内容。')),
          React.createElement('div', { className: 'dshus-detection-form dshus-detection-limits' },
            field('采样次数', React.createElement('select', { id: 'dshus-detection-samples', className: 'dshus-field', value: count, disabled: busy || running, onChange: function (event) { setCount(Number(event.target.value)) } },
              React.createElement('option', { value: 3 }, t('标准检测（3 次）')), React.createElement('option', { value: 1 }, t('低耗初筛（1 次，仅排序）')))),
            field('单次输出上限', React.createElement('input', { id: 'dshus-detection-output-limit', type: 'number', className: 'dshus-field', min: 1024, max: 16384, step: 1, value: maxTokens, disabled: busy || running, onChange: function (event) { setMaxTokens(Number(event.target.value)) } })),
            field('已上报 Token 预算', React.createElement('input', { id: 'dshus-detection-budget', type: 'number', className: 'dshus-field', min: 1024, max: 50000, step: 1, value: budget, disabled: busy || running, onChange: function (event) { setBudget(Number(event.target.value)) } }))),
          React.createElement('p', { className: 'dshus-setting-help' }, t('输出上限限制每次响应；总预算在每次请求结束后检查，达到后停止后续请求。')),
          quote && React.createElement('div', { className: 'dshus-detection-reference', role: 'status' },
            React.createElement('p', { className: 'dshus-detection-ready' }, t('已确认预算，可开始检测。')),
            React.createElement('p', { className: 'dshus-cost-note' }, t('请求最多 {requests} 次 · 输入约 {estimatedInputTokens} Token · 输出上限 {maxOutputTokens} Token', Object.fromEntries(Object.entries(quote.plan).map(function (entry) { return [entry[0], typeof entry[1] === 'number' ? fmtExact(entry[1]) : entry[1]] })))),
            React.createElement('p', { className: 'dshus-setting-help' }, t('预算按已上报用量检查；推理、未上报用量及供应商重试按通道规则计费。')),
            React.createElement('details', { className: 'dshus-detection-quote-details', key: quote.id },
              React.createElement('summary', null, t('本次检测参数')),
              fields(quote.testSelection),
              React.createElement('p', { className: 'dshus-setting-help' }, t('每次最多 {maxTokens} Token · 所有请求输出最多 {maxOutputTokens} Token', { maxTokens: fmtExact(quote.plan.maxTokens), maxOutputTokens: fmtExact(quote.plan.maxOutputTokens) })))),
          React.createElement('div', { className: 'dshus-detection-actions' },
            React.createElement('button', { type: 'button', className: 'dshus-btn' + (!quote ? ' dshus-btn-primary' : ''), onClick: preview, disabled: busy || running || !selectedReady || !catalog }, t(busy ? '正在处理…' : '查看检测预算')),
            React.createElement('button', { type: 'button', className: 'dshus-btn' + (quote ? ' dshus-btn-primary' : ''), onClick: start, disabled: busy || running || !quote }, t('开始检测（会消耗 Token）'))),
          !running && React.createElement('p', { className: 'dshus-setting-help' }, t(quote ? '更改模型或参数后，需要重新查看检测预算。' : '先查看检测预算，确认后再开始。'))),
        !job && React.createElement('div', { className: 'dshus-module dshus-detection-empty', role: 'region', 'aria-label': t('检测结果') },
          React.createElement('h3', null, t('检测结果')),
          React.createElement('p', { className: 'dshus-detection-empty-title' }, t('尚未检测本模型')),
          React.createElement('p', { className: 'dshus-setting-help' }, t('确认预算并开始后，这里会显示采样进度与候选排名。'))),
        React.createElement('details', { className: 'dshus-module dshus-detection-engine' },
          React.createElement('summary', null, t('指纹引擎与参考库'),
            catalog && React.createElement('span', { className: 'dshus-detection-engine-meta' }, 'lmfpd ', catalog.version || '—', catalog.builtAt && ' · ' + String(catalog.builtAt).slice(0, 10), Number.isFinite(catalog.modelCount) && ' · ' + t('{count} 个参考模型', { count: catalog.modelCount })),
            catalog && catalog.warning && React.createElement('span', { className: 'dshus-detection-engine-notice', role: 'status' }, uiError(catalog.warning)),
            (updating || catalog && catalog.updating) && React.createElement('span', { className: 'dshus-detection-engine-notice', role: 'status' }, t('正在检查更新…'))),
          React.createElement('p', { className: 'dshus-setting-help' }, t('每日检查上游更新，校验成功后启用；更新失败继续使用本地版本。')),
          React.createElement('div', { className: 'dshus-control-actions' },
            React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: updating || running || busy || !!(catalog && catalog.updating), onClick: updateEngine }, t(updating || catalog && catalog.updating ? '正在检查更新…' : '检查上游更新')),
            React.createElement('a', { className: 'dshus-btn', href: 'https://lm.ikale.io/docs/', target: '_blank', rel: 'noreferrer' }, t('官方文档')))))
    }

function TokenSpeedRanking(props) {
      var expandedState = React.useState(false)
      var expanded = expandedState[0], setExpanded = expandedState[1]
      var speeds = (props.speeds || []).filter(function (item) { return Number.isFinite(item.tokensPerSecond) && item.tokensPerSecond >= 0 && item.samples > 0 })
        .slice().sort(function (a, b) { return b.tokensPerSecond - a.tokensPerSecond || b.samples - a.samples || String(a.key).localeCompare(String(b.key)) })
      var visible = expanded ? speeds : speeds.slice(0, 8)
      return React.createElement('section', { className: 'dshus-module dshus-speed-module', 'aria-labelledby': 'dshus-speed-heading' },
        React.createElement('h3', { id: 'dshus-speed-heading' }, t('token输出速度')),
        speeds.length > 0 && React.createElement('div', { className: 'dshus-speed-head' },
          React.createElement('span', { style: { gridColumn: 'span 2' }, 'aria-hidden': true }),
          React.createElement('span', null, 'TPS (tok/s)'),
          React.createElement('span', { title: t('平均首 Token 耗时') }, 'TTFT (s)')),
        speeds.length ? React.createElement('ol', { className: 'dshus-speed-list' }, visible.map(function (item, index) {
          var tps = item.tokensPerSecond >= 10 ? String(Math.round(item.tokensPerSecond)) : String(Math.round(item.tokensPerSecond * 10) / 10)
          var ttft = Number.isFinite(item.averageTtftMs) && item.averageTtftMs >= 0 ? (item.averageTtftMs / 1000).toFixed(1) : '—'
          return React.createElement('li', { key: item.key, className: 'dshus-speed-row', 'data-model-key': item.key },
            React.createElement('span', { className: 'dshus-speed-rank', 'aria-hidden': true }, index + 1),
            React.createElement('div', { className: 'dshus-speed-model' }, item.model,
              React.createElement('div', { className: 'dshus-speed-meta' }, item.provider)),
            React.createElement('div', { className: 'dshus-speed-value', 'aria-label': 'TPS: ' + tps + ' tok/s', title: t('{tokens} 个输出 Token · {seconds} 秒', { tokens: fmtExact(item.outputTokens), seconds: (item.outputMs / 1000).toFixed(3) }) }, tps),
            React.createElement('div', { className: 'dshus-speed-value', 'aria-label': 'TTFT: ' + ttft + (ttft === '—' ? '' : ' s'), title: t(ttft === '—' ? '暂无 TTFT 数据' : '平均首 Token 耗时') }, ttft))
        })) : React.createElement('p', { className: 'dshus-muted', role: 'status' }, t(props.loading ? '加载中…' : '暂无速度数据')),
        speeds.length > 8 && React.createElement('button', { type: 'button', className: 'dshus-btn', 'aria-expanded': expanded, onClick: function () { setExpanded(!expanded) } }, t(expanded ? '收起速度排名' : '展开全部速度排名（{count}）', { count: speeds.length })))
    }

function fmtTaskDuration(ms) {
      if (!Number.isFinite(ms) || ms < 0) return '—'
      var seconds = Math.round(ms / 1000)
      if (seconds >= 86400) return t('{days}天 {hours}小时', { days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600) })
      if (seconds >= 3600) return t('{hours}小时 {minutes}分', { hours: Math.floor(seconds / 3600), minutes: Math.floor(seconds % 3600 / 60) })
      if (seconds >= 60) return t('{minutes}分 {seconds}秒', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 })
      return t('{seconds}秒', { seconds: seconds })
    }

function OverviewDetails(props) {
      var overview = props.overview
      if (!overview) return React.createElement('p', { className: 'dshus-setting-help' }, t('暂无数据'))
      var favorite = overview.recentModel
      var entries = [
        ['缓存命中率', Number.isFinite(overview.cacheHitRate) ? (overview.cacheHitRate * 100).toFixed(1) + '%' : '—', t('缓存读取占全部输入的比例')],
        ['Token 使用峰值', overview.peakDay ? fmt(overview.peakDailyBilled) : '—', overview.peakDay ? overview.peakDay + ' · ' + fmtExact(overview.peakDailyBilled) + ' Token' : t('暂无数据')],
        ['最长任务时长', fmtTaskDuration(overview.longestTaskMs), t('有完整起止记录的已结束单轮任务，包含工具调用和等待。')],
        ['当前连续天数', t('{days} 天', { days: overview.currentStreak || 0 }), t('今日尚未使用时，延续至昨日的连续记录。')],
        ['最长使用天数', t('{days} 天', { days: overview.longestStreak || 0 }), t('历史最长连续使用天数')],
        ['最近常使用模型', favorite ? favorite.model : '—', favorite ? t('近 7 天调用 {calls} 次 · {providers}', { calls: fmtExact(favorite.calls), providers: (favorite.providers || []).join(' · ') }) : t('暂无数据')],
      ]
      return React.createElement('dl', { className: 'dshus-overview-grid' }, entries.map(function (entry, index) {
        return React.createElement('div', { key: entry[0] }, React.createElement('dt', null, t(entry[0])),
          React.createElement('dd', { title: entry[2], className: index === 5 ? 'dshus-favorite-model' : undefined }, entry[1]))
      }))
    }

function UsageStatsSection(props) {
      useLocaleRevision()
      var api = props.api
      var intl = props.intl
      var overviewExpandedState = React.useState(false)
      var overviewExpanded = overviewExpandedState[0]
      var setOverviewExpanded = overviewExpandedState[1]
      var modelState = React.useState('')
      var model = modelState[0]
      var setModel = modelState[1]

      var heatModeState = React.useState('daily')
      var heatMode = heatModeState[0]
      var setHeatMode = heatModeState[1]

      // Heatmap paging is owned here rather than inside Heatmap: the arrows sit
      // in the card header, so the header needs the page count and the current
      // range that only the heatmap layout math can compute. Heatmap publishes
      // them through onPageInfo and consumes the resulting index back.
      var heatNavState = React.useState({ mode: null, index: 0 })
      var heatNav = heatNavState[0]
      var setHeatNav = heatNavState[1]
      var heatInfoState = React.useState(null)
      var heatInfo = heatInfoState[0]
      var setHeatInfo = heatInfoState[1]
      // Stable identity (ref-backed) so the heatmap's reporting effect does not
      // re-fire on every render; the setter itself is already stable.
      var reportHeatInfoRef = React.useRef(null)
      if (reportHeatInfoRef.current === null) {
        reportHeatInfoRef.current = function (next) {
          setHeatInfo(function (previous) {
            if (previous && previous.page === next.page && previous.pageCount === next.pageCount &&
              previous.first === next.first && previous.last === next.last) return previous
            return next
          })
        }
      }
      var reportHeatInfo = reportHeatInfoRef.current
      // Paging resets whenever the mode changes, so a weekly page index can
      // never leak into the daily grid (their week counts differ).
      var stepHeatPage = function (delta) {
        setHeatNav(function (previous) {
          var base = previous.mode === heatMode ? previous.index : 0
          var next = base + delta
          if (heatInfo && (next < 0 || next > heatInfo.pageCount - 1)) return previous
          return { mode: heatMode, index: next }
        })
      }
      var heatPageIndex = heatNav.mode === heatMode ? heatNav.index : 0

      var trendPeriodState = React.useState('week')
      var trendPeriod = trendPeriodState[0]
      var setTrendPeriod = trendPeriodState[1]

      var tableExpandedState = React.useState(false)
      var tableExpanded = tableExpandedState[0]
      var setTableExpanded = tableExpandedState[1]

      // "按模型" view: merge the same model name across providers.
      var groupModelState = React.useState(true)
      var groupByModel = groupModelState[0]
      var setGroupByModel = groupModelState[1]

      var chartGroupState = React.useState(true)
      var chartGroupByModel = chartGroupState[0]
      var setChartGroupByModel = chartGroupState[1]

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

      var searchState = React.useState('')
      var searchQuery = searchState[0]
      var setSearchQuery = searchState[1]

      var tabState = React.useState(props.initialTab || 'usage')
      var tab = tabState[0]
      var setTab = tabState[1]

      var controlState = React.useState({ settings: { autoQuota: false, intervalMinutes: 10, showModelDetails: false, showTokenSpeed: true, showModelDetection: true, advancedModelSelect: true, modelReasoning: true, customQueries: [] } })
      var control = controlState[0], setControl = controlState[1]
      // The controls body comes from the host and may lack its settings block:
      // a degraded endpoint or a proxy error page must degrade the page's
      // switches, not crash the whole settings section during render.
      var controlSettings = (control && control.settings) || {}
      var showModelDetection = controlSettings.showModelDetection === true
      if (tab === 'detection' && !showModelDetection) tab = 'usage'
      var configActive = !props.cardViews || Object.keys(props.cardViews).some(function (view) { return props.cardViews[view] })
      var controlReadyState = React.useState(false)
      var controlReady = controlReadyState[0], setControlReady = controlReadyState[1]
      var controlErrorState = React.useState('')
      var controlError = controlErrorState[0], setControlError = controlErrorState[1]
      var quotaRevisionState = React.useState(0)
      var quotaRevision = quotaRevisionState[0], setQuotaRevision = quotaRevisionState[1]
      var detectionVisitedState = React.useState(props.initialTab === 'detection')
      var detectionVisited = detectionVisitedState[0], setDetectionVisited = detectionVisitedState[1]
      var quotaVisitedState = React.useState(props.initialTab === 'quota')
      var quotaVisited = quotaVisitedState[0], setQuotaVisited = quotaVisitedState[1]
      var quotaSnapshotsState = React.useState({})
      var quotaSnapshots = quotaSnapshotsState[0], setQuotaSnapshots = quotaSnapshotsState[1]
      var quotaLoadingState = React.useState(false)
      var quotaLoading = quotaLoadingState[0], setQuotaLoading = quotaLoadingState[1]
      var quotaErrorState = React.useState('')
      var quotaError = quotaErrorState[0], setQuotaError = quotaErrorState[1]

      function changeTab(next) {
        if (next === 'detection' && !showModelDetection) return
        if (next === tab) return
        // A short tab must not inherit the long usage page's scroll position.
        if (scrollPortRef.current) scrollPortRef.current.scrollTop = 0
        if (next === 'quota') setQuotaVisited(true)
        if (next === 'detection') setDetectionVisited(true)
        if (next === 'usage') load()
        setTab(next)
      }
      function onTabKeyDown(event) {
        var names = showModelDetection ? ['usage', 'quota', 'detection', 'control'] : ['usage', 'quota', 'control']
        var index = names.indexOf(tab)
        var next = event.key === 'ArrowRight' ? names[(index + 1) % names.length] : event.key === 'ArrowLeft' ? names[(index + names.length - 1) % names.length] : event.key === 'Home' ? 'usage' : event.key === 'End' ? names[names.length - 1] : null
        if (next === null) return
        event.preventDefault()
        changeTab(next)
        var tabs = event.currentTarget.parentElement.querySelectorAll('[role="tab"]')
        tabs[names.indexOf(next)].focus({ preventScroll: true })
      }

      var tz = LOCAL_TZ
      var requestRef = React.useRef(0)
      var retryTimerRef = React.useRef(null)
      var successfulQueryRef = React.useRef({ model: '' })
      var controlRequestRef = React.useRef(0)
      var controlWritesRef = React.useRef(0)
      var pageRef = React.useRef(null)
      var scrollPortRef = React.useRef(null)

      function load(opts) {
        var optModel = opts && opts.model !== undefined ? opts.model : model
        var fresh = opts && opts.fresh === true
        var request = ++requestRef.current
        var attempt = 0
        if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
        function pull(isFresh) {
          attempt++
          setLoading(true)
          setError(null)
          api.stats({ days: 0, model: optModel, fresh: isFresh })
            .then(function (body) {
              if (request !== requestRef.current) return
              setData(body)
              successfulQueryRef.current = { model: optModel }
              setLoading(false)
              setStale(!!body.stale)
              if (body.stale && attempt < 40) retryTimerRef.current = setTimeout(function () { pull(false) }, 2500)
            })
            .catch(function (err) {
              if (request !== requestRef.current) return
              setError(String(err && err.message || err))
              setLoading(false)
              setStale(true)
              setModel(successfulQueryRef.current.model)
            })
        }
        pull(fresh)
      }

      React.useEffect(function () {
        if (props.embedded) return
        load({ model: model })
        return function () {
          requestRef.current++
          if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      function loadControls() {
        if (controlWritesRef.current > 0) return
        var request = ++controlRequestRef.current
        setControlError('')
        api.controls().then(function (body) {
          if (request === controlRequestRef.current) acceptControls(body)
        }).catch(function (err) {
          if (request === controlRequestRef.current) { setControlError(String(err.message || err)); setControlReady(false) }
        })
      }
      React.useEffect(function () {
        if (!configActive) return
        loadControls()
        return function () { controlRequestRef.current++ }
      }, [configActive])
      React.useEffect(function () {
        var page = pageRef.current
        if (!page) return
        var port = page.parentElement
        while (port && !/(auto|scroll)/.test(window.getComputedStyle(port).overflowY)) port = port.parentElement
        if (!port) return
        scrollPortRef.current = port
        var previous = port.style.scrollbarGutter
        port.style.scrollbarGutter = 'stable'
        return function () {
          if (port.style.scrollbarGutter === 'stable') port.style.scrollbarGutter = previous
          scrollPortRef.current = null
        }
      }, [])
      React.useEffect(function () {
        if (!configActive || tab === 'usage' || typeof setInterval !== 'function') return
        var timer = setInterval(loadControls, 30000)
        return function () { clearInterval(timer) }
      }, [tab, configActive])
      function acceptControls(body) {
        setControl(body); syncModelFeaturesFromControls(body); setControlReady(true)
        if (body.settings?.showModelDetection !== true) { setTab(function (previous) { return previous === 'detection' ? 'usage' : previous }); setDetectionVisited(false) }
      }
      function saveControls(patch) {
        var request = ++controlRequestRef.current
        controlWritesRef.current++
        setControlError('')
        return api.controls(patch).then(function (body) {
          if (request === controlRequestRef.current) acceptControls(body)
          if (patch.action === 'save-query' || patch.action === 'remove-query') setQuotaRevision(function (value) { return value + 1 })
          return body
        }).finally(function () { controlWritesRef.current-- })
      }
      function refreshQuotas() {
        setQuotaLoading(true)
        setQuotaError('')
        Promise.allSettled([api.providerQuotas({ fresh: true }), api.accountQuotas({ fresh: true })]).then(function (results) {
          if (results.some(function (result) { return result.status === 'rejected' || quotaFailed(result.value) || result.value.refreshErrors && result.value.refreshErrors.length })) setQuotaError('部分配额未能更新，请稍后刷新重试。')
          setQuotaSnapshots(function (previous) {
            var next = Object.assign({}, previous)
            ;['providers', 'accounts'].forEach(function (key, index) { if (results[index].status === 'fulfilled' && !quotaFailed(results[index].value)) next[key] = results[index].value })
            return next
          })
          setQuotaLoading(false)
        }).catch(function (err) { setQuotaLoading(false); setQuotaError(String(err.message || err)) })
      }

      var changeModel = function (m) {
        setModel(m)
        load({ model: m })
      }
      var refresh = function () {
        load({ model: model, fresh: true })
      }

      var controlsBody = React.createElement(ControlsPanel, { api: api, control: control, ready: controlReady, error: controlError, onReload: loadControls, onSave: saveControls })
      if (props.embedded) return controlsBody

      var totals = data && data.totals
      var byModel = data ? data.byModel : []
      var displayedModel = data && Object.prototype.hasOwnProperty.call(data, 'model') ? (data.model || '') : model
      var dayMap = new Map()
      var dayModelMap = new Map()
      if (data) {
        for (var i = 0; i < data.byDay.length; i++) dayMap.set(data.byDay[i].date, data.byDay[i])
        for (var j = 0; j < (data.byDayModels || []).length; j++) dayModelMap.set(data.byDayModels[j].date, data.byDayModels[j].models)
      }
      // A running host can still serve the previous response shape until it
      // reloads. For that version, subtract adjacent cumulative model ranges
      // on hover to recover the exact per-day breakdown without a full rescan.
      var loadDayModels = data && !Array.isArray(data.byDayModels) ? function (date) {
        var today = new Date(Date.now() - tz * 60000).toISOString().slice(0, 10)
        var span = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000) + 1
        if (!(span >= 1 && span <= 3650)) return Promise.resolve([])
        return Promise.all([
          api.stats({ days: span, model: displayedModel }),
          span > 1 ? api.stats({ days: span - 1, model: displayedModel }) : Promise.resolve({ byModel: [] }),
        ]).then(function (results) {
          var later = new Map()
          var models = []
          for (var li = 0; li < (results[1].byModel || []).length; li++) later.set(results[1].byModel[li].key, results[1].byModel[li])
          for (var mi = 0; mi < (results[0].byModel || []).length; mi++) {
            var current = results[0].byModel[mi]
            var following = later.get(current.key)
            var billed = Math.max(0, (current.billed || 0) - (following && following.billed || 0))
            var calls = Math.max(0, (current.calls || 0) - (following && following.calls || 0))
            if (billed > 0 || calls > 0) models.push({ key: current.key, provider: current.provider, model: current.model, billed: billed, calls: calls })
          }
          models.sort(function (a, b) { return b.billed - a.billed })
          return models
        })
      } : null
      // Fixed colour per model, persisted in localStorage: the first time a
      // model is seen it is assigned the next unused colour from a
      // golden-angle palette and keeps it forever — never tied to the usage
      // ranking, so the most-used model is not always the same colour. The
      // donut and the 24-hour bars agree because they share this map.
      var STORAGE_KEY = 'dshus.modelColors.v1'
      var modelColor = {}
      try {
        var storedColors = window.localStorage.getItem(STORAGE_KEY)
        if (storedColors) {
          var parsedColors = JSON.parse(storedColors)
          if (parsedColors && typeof parsedColors === 'object') {
            for (var pk in parsedColors) modelColor[pk] = parsedColors[pk]
          }
        }
      } catch (e) { /* storage unavailable — fall back to ephemeral colours */ }
      var usedColors = {}
      for (var uk in modelColor) usedColors[modelColor[uk]] = true
      for (var ci = 0; ci < byModel.length; ci++) {
        var key = byModel[ci].key
        if (modelColor[key]) continue
        var hue = 0
        for (var hc = 0; hc < 360; hc++) {
          hue = Math.round((hc * 137.508) % 360)
          if (!usedColors['hsl(' + hue + ', 70%, 55%)']) break
        }
        modelColor[key] = 'hsl(' + hue + ', 70%, 55%)'
        usedColors[modelColor[key]] = true
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(modelColor))
      } catch (e) { /* ignore quota / private-mode errors */ }
      modelColor['__rest__'] = '#94a3b8'
      modelColor['__all__'] = 'var(--dsw-alias-brand-primary, #3b82f6)'
      var colorOf = function (key) { return modelColor[key] || '#94a3b8' }
      // "按模型" view: fold the provider/model entries into one entry per
      // model name (provider ignored), sorted by usage. The merge key is the
      // model display name's basename (after last '/') lowercased, so
      // "GLM-4.7" vs "glm-4.7" and "stealth/ox-alpha" vs "OX-ALPHA" land in
      // one bucket; the displayed name keeps the casing of the variant that
      // carries the most usage (ties keep the first-seen spelling).
      var normModelKey = sharedNormModelKey
      // Display name for a merged group: the basename of the winning
      // variant (text after the last '/', original casing). Model ids on
      // OpenRouter-style gateways carry a namespace prefix ("z-ai/glm-
      // 5.3-flash" on cline-gw); showing the full id in the merged view
      // makes the group look like a provider leaked in ("z-ai/…"), so the
      // merged label always drops the prefix — the same rule the merge key
      // (normModelKey) already uses, only case-preserving.
      var modelDisplayName = sharedModelDisplayName
      var donutModels = byModel
      if (groupByModel && byModel.length > 0) {
        var mergedMap = {}
        var mergedOrder = []
        for (var gmI = 0; gmI < byModel.length; gmI++) {
          var gmItem = byModel[gmI]
          var gmName = gmItem.model || gmItem.key
          var gmKey = normModelKey(gmName)
          var gmCur = mergedMap[gmKey]
          var canonical = gmKey === 'glm-5.3-flash' ? 'glm-5.3-flash' : null
          if (gmCur === undefined) {
            gmCur = { key: 'by-model:' + gmKey, provider: '', providers: [gmItem.provider || ''], model: canonical || modelDisplayName(gmName), lastTime: gmItem.lastTime || 0, billed: gmItem.billed || 0, _topBilled: gmItem.billed || 0 }
            mergedMap[gmKey] = gmCur
            mergedOrder.push(gmCur)
          } else {
            gmCur.billed += gmItem.billed || 0
            if (gmCur.providers.indexOf(gmItem.provider || '') === -1) gmCur.providers.push(gmItem.provider || '')
            if ((gmItem.lastTime || 0) > gmCur.lastTime) gmCur.lastTime = gmItem.lastTime || 0
            if (canonical === null && (gmItem.billed || 0) > (gmCur._topBilled || 0)) {
              gmCur.model = modelDisplayName(gmName)
              gmCur._topBilled = gmItem.billed || 0
            } else if ((gmItem.billed || 0) > (gmCur._topBilled || 0)) {
              gmCur._topBilled = gmItem.billed || 0
            }
          }
        }
        mergedOrder.sort(function (a, b) { return b.billed - a.billed })
        donutModels = mergedOrder
      }
      // Merged "by-model:*" keys have no persisted colour — give them a stable
      // palette colour by current rank; everything else keeps its own colour.
      var donutColorFor = function (key) {
        if (groupByModel && key.indexOf('by-model:') === 0) {
          return sharedModelColor(key.slice('by-model:'.length))
        }
        return colorOf(key)
      }
      // Per-model hour breakdown for the stacked 24h bars. Older hosts (before
      // this feature) do not serve byHourModels: fall back to the aggregated
      // byHour series as a single "全部" segment so the chart still renders.
      var hourModels = []
      if (data) {
        if (data.byHourModels && data.byHourModels.length > 0) {
          hourModels = data.byHourModels
        } else {
          hourModels = data.byHour.map(function (h) {
            return { hour: h.hour, models: [{ key: '__all__', provider: '', model: t('全部'), billed: h.billed }] }
          })
        }
        // The chart has its own grouping control, independent of the donut.
        // When "按模型" is on, fold hourModels by the same basename
        // lowercased key so case variants like "stealth/ox-alpha" vs
        // "STEALTH/OX-ALPHA" share one stack segment per hour, consistent
        // with the donut.
        if (chartGroupByModel && hourModels.length > 0) {
          var mergedHourModels = []
          for (var hi = 0; hi < hourModels.length; hi++) {
            var hm = hourModels[hi]
            var ms = hm.models || []
            // Do not reuse a single raw provider/model segment here. Even a
            // one-segment hour must pass through the merged-model projection
            // so its provider is cleared and namespaced model ids are reduced
            // to the same display name used by the donut.
            if (ms.length === 0) { mergedHourModels.push(hm); continue }
            var hMap = {}
            var hOrder = []
            for (var mi = 0; mi < ms.length; mi++) {
              var mm = ms[mi]
              var mmName = mm.model || mm.key
              var mmKey = normModelKey(mmName)
              var canonicalH = mmKey === 'glm-5.3-flash' ? 'glm-5.3-flash' : null
              var cur = hMap[mmKey]
              if (cur === undefined) {
                cur = { key: 'by-model:' + mmKey, provider: '', model: canonicalH || modelDisplayName(mm.model), billed: mm.billed || 0, _topBilled: mm.billed || 0 }
                hMap[mmKey] = cur
                hOrder.push(cur)
              } else {
                cur.billed += mm.billed || 0
                if (canonicalH === null && (mm.billed || 0) > (cur._topBilled || 0)) { cur.model = modelDisplayName(mmName); cur._topBilled = mm.billed || 0 }
                else if ((mm.billed || 0) > (cur._topBilled || 0)) cur._topBilled = mm.billed || 0
              }
            }
            mergedHourModels.push({ hour: hm.hour, models: hOrder })
          }
          hourModels = mergedHourModels
        }
      }
      var chartColorFor = function (key) {
        if (!chartGroupByModel || key.indexOf('by-model:') !== 0) return colorOf(key)
        return sharedModelColor(key.slice('by-model:'.length))
      }

      var tools = React.createElement('div', { className: 'dshus-tools' },
        tab === 'usage' && refreshIconButton(refresh, loading, t('刷新用量统计'), false),
        tab === 'quota' && refreshIconButton(refreshQuotas, quotaLoading, t('刷新全部配额'), false),
      )

      var cards
      if (totals) {
        var overview = data.overview || {
          todayBilled: (data.byHour || []).reduce(function (sum, h) { return sum + (h.billed || 0) }, 0),
          usedDays: (data.byDay || []).filter(function (d) { return d.calls > 0 }).length,
          totalBilled: totals.billed,
        }
        // 概览指标在同一行内展示，相邻两项之间以竖线分割。
        var stat = function (v, k, opts) {
          opts = opts || {}
          var display = typeof v === 'number' ? (opts.exact ? fmtExact(v) : fmt(v)) : v
          return React.createElement('div', { className: 'dshus-stat' + (opts.cls ? ' ' + opts.cls : '') },
            React.createElement('div', { className: 'v', title: typeof v === 'number' ? fmtExact(v) : undefined }, display),
            React.createElement('div', { className: 'k' }, k),
          )
        }
        cards = React.createElement('div', { className: 'dshus-statbar dshus-overview-bar', role: 'group', 'aria-label': t('概览指标') },
          stat(overview.todayBilled, t('今日tokens数')),
          stat(overview.usedDays, t('使用天数'), { exact: true }),
          stat(overview.totalBilled, t('累计tokens数')),
        )
      } else {
        cards = React.createElement('div', { className: 'dshus-muted' }, t('暂无数据'))
      }

      // Filter models for the breakdown table
      var filterText = searchQuery.trim().toLowerCase()
      var tableModels = donutModels.filter(function (m) {
        if (!filterText) return true
        var name = (m.model || m.key || '').toLowerCase()
        var prov = ((m.provider || '') + ' ' + (m.providers || []).join(' ')).toLowerCase()
        return name.indexOf(filterText) !== -1 || prov.indexOf(filterText) !== -1
      })

      // Show only the top model until the list is expanded or searched.
      var tableVisibleModels = (!filterText && !tableExpanded) ? tableModels.slice(0, 1) : tableModels

      // Breakdown table element
      var totalDonutBilled = 0
      for (var tdi = 0; tdi < donutModels.length; tdi++) totalDonutBilled += donutModels[tdi].billed || 0

      var tableRows = tableVisibleModels.map(function (m, idx) {
        var pct = totalDonutBilled > 0 ? ((m.billed || 0) / totalDonutBilled) * 100 : 0
        var mColor = donutColorFor(m.key)
        var label = m.provider ? m.provider + ' · ' + m.model : m.model
        var isRest = m.key === '__rest__'
        return React.createElement('tr', { key: m.key || idx },
          React.createElement('td', null,
            React.createElement('div', { className: 'dshus-table-model-cell' },
              React.createElement('span', { className: 'dshus-donut-dot', style: { background: mColor } }),
              React.createElement('span', null, label),
            ),
          ),
          React.createElement('td', { title: fmtExact(m.billed || 0), style: { textAlign: 'right', fontWeight: 600 } }, fmt(m.billed || 0)),
          React.createElement('td', { style: { textAlign: 'right' } }, formatPct(pct)),
          React.createElement('td', { className: 'dshus-table-bar-cell' },
            React.createElement('div', { className: 'dshus-table-bar-bg' },
              React.createElement('div', { className: 'dshus-table-bar-fill', style: { width: Math.min(100, Math.max(1, pct)) + '%', background: mColor } }),
            ),
          ),
          React.createElement('td', { style: { textAlign: 'right', color: 'var(--dsw-alias-label-caption, #9ca3af)', fontSize: 11.5 } },
            m.lastTime ? fmtInTz(m.lastTime, tz) : (isRest ? '—' : t('近期调用')),
          ),
        )
      })

      return React.createElement('div', { className: 'dshus-page' + (props.embedded ? ' dshus-plugin-controls' : ''), ref: pageRef, 'data-plugin-controls': props.embedded ? 'usage-stats' : undefined },
        React.createElement('div', { className: 'dshus-toolbar' },
        !props.embedded && React.createElement('div', { className: 'dshus-head' },
          React.createElement('div', { className: 'dshus-brand' },
            React.createElement('span', { className: 'dshus-brand-icon', 'aria-hidden': 'true' }),
            React.createElement('h2', { className: 'dshus-title' }, t('用量统计')),
            React.createElement('a', { className: 'dshus-brand-meta dshus-brand-link', href: 'https://github.com/Jockjrop/dsh-usage-stats', target: '_blank', rel: 'noopener noreferrer', title: t('在 GitHub 查看 dsh-usage-stats') }, 'dsh-usage-stats'),
            PLUGIN_VERSION !== '__DSH_USAGE_STATS_VERSION__' && React.createElement('span', { className: 'dshus-brand-meta' }, 'v' + PLUGIN_VERSION),
          ),
          tools,
        ),
        React.createElement('div', { className: 'dshus-tabs', role: 'tablist', 'aria-label': t('用量统计页面') },
          React.createElement('button', { id: 'dshus-tab-usage', type: 'button', role: 'tab', 'aria-selected': tab === 'usage', 'aria-controls': 'dshus-usage-panel', tabIndex: tab === 'usage' ? 0 : -1, className: 'dshus-tab' + (tab === 'usage' ? ' on' : ''), onClick: function () { changeTab('usage') }, onKeyDown: onTabKeyDown }, t('用量')),
          React.createElement('button', { id: 'dshus-tab-quota', type: 'button', role: 'tab', 'aria-selected': tab === 'quota', 'aria-controls': 'dshus-quota-panel', tabIndex: tab === 'quota' ? 0 : -1, className: 'dshus-tab' + (tab === 'quota' ? ' on' : ''), onClick: function () { changeTab('quota') }, onKeyDown: onTabKeyDown }, t('配额')),
          showModelDetection && React.createElement('button', { id: 'dshus-tab-detection', type: 'button', role: 'tab', 'aria-selected': tab === 'detection', 'aria-controls': 'dshus-detection-panel', tabIndex: tab === 'detection' ? 0 : -1, className: 'dshus-tab' + (tab === 'detection' ? ' on' : ''), onClick: function () { changeTab('detection') }, onKeyDown: onTabKeyDown }, t('检测')),
          React.createElement('button', { id: 'dshus-tab-control', type: 'button', role: 'tab', 'aria-selected': tab === 'control', 'aria-controls': 'dshus-control-panel', tabIndex: tab === 'control' ? 0 : -1, className: 'dshus-tab' + (tab === 'control' ? ' on' : ''), onClick: function () { changeTab('control') }, onKeyDown: onTabKeyDown }, t('控制')),
        ),
        ),
        // The size container wraps only the panels, so the sticky header above it
        // is not inside a containment context.
        React.createElement('div', { className: 'dshus-panels' },
        tab === 'usage' && React.createElement('div', { id: 'dshus-usage-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-usage', tabIndex: 0 },
          error !== null && React.createElement('div', { className: 'dshus-error' }, uiError(error)),
          data && data.detectionUsageWarning && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(data.detectionUsageWarning)),
          stale && data && data.partial && React.createElement('div', { className: 'dshus-error' }, t('部分会话读取失败')),
          stale && data && !data.partial && React.createElement('div', { className: 'dshus-muted', role: 'status' }, t('后台同步中，当前显示上次数据。')),
          displayedModel && React.createElement('div', { className: 'dshus-control-actions', role: 'status' },
            React.createElement('span', null, t('当前模型筛选：{model}', { model: displayedModel })),
            React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: function () { changeModel('') } }, t('清除筛选'))),

        /* Area 1: 概览指标 */
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            React.createElement('button', { type: 'button', className: 'dshus-overview-toggle', 'aria-expanded': overviewExpanded, 'aria-controls': 'dshus-overview-details', onClick: function () { setOverviewExpanded(!overviewExpanded) } },
              t('概览指标'),
              React.createElement('svg', { className: 'dshus-overview-chevron', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
                React.createElement('path', { d: 'M4 6.5 8 10.5 12 6.5' })))),
          cards,
          React.createElement('div', { id: 'dshus-overview-details', className: 'dshus-overview-details', hidden: !overviewExpanded },
            React.createElement(OverviewDetails, { overview: data && data.overview })),
          React.createElement('div', { className: 'dshus-setting-help', role: 'status' }, t('本地会话统计'), ' · ', t('上次同步：{time}', { time: fmtFetched(data && data.syncedAt) })),
          displayedModel && React.createElement('p', { className: 'dshus-setting-help' }, t('概览为全部历史；图表按当前模型筛选。')),
        ),

        /* Area 2: 今日Token用量 */
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('今日Token用量'),
            React.createElement('div', { className: 'dshus-range', style: { marginLeft: 'auto' }, 'aria-label': t('今日Token用量统计模式') },
              React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (!chartGroupByModel ? ' on' : ''), onClick: function () { setChartGroupByModel(false) } }, t('供应商·模型')),
              React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (chartGroupByModel ? ' on' : ''), onClick: function () { setChartGroupByModel(true) } }, t('按模型')),
            ),
          ),
          React.createElement(Bars, { hourModels: hourModels, byHour: data ? data.byHour : [], colorOf: chartColorFor }),
        ),

        /* Area 3: 使用量热力图 */
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('使用量热力图'),
            React.createElement('div', { className: 'dshus-head-tools' },
              React.createElement(HeatPager, {
                info: heatInfo,
                onStep: stepHeatPage,
              }),
              React.createElement('div', { className: 'dshus-range dshus-heat-modes', 'aria-label': t('热力图时长') },
                React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (heatMode === 'daily' ? ' on' : ''), onClick: function () { setHeatNav({ mode: 'daily', index: 0 }); setHeatInfo(null); setHeatMode('daily') } }, t('每日')),
                React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (heatMode === 'weekly' ? ' on' : ''), onClick: function () { setHeatNav({ mode: 'weekly', index: 0 }); setHeatInfo(null); setHeatMode('weekly') } }, t('每周')),
              ),
            ),
          ),
          React.createElement(Heatmap, { dayMap: dayMap, dayModelMap: dayModelMap, days: 0, mode: heatMode, tz: tz, colorOf: colorOf, modelKey: displayedModel, syncedAt: data && data.syncedAt, loadDayModels: loadDayModels, pageIndex: heatPageIndex, onPageInfo: reportHeatInfo }),
        ),

        /* Area 4: 每日Token趋势图 */
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('每日Token趋势图'),
            React.createElement('div', { className: 'dshus-range', style: { marginLeft: 'auto' }, 'aria-label': t('每日Token趋势时长') },
              React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (trendPeriod === 'week' ? ' on' : ''), onClick: function () { setTrendPeriod('week') } }, t('7天')),
              React.createElement('button', { type: 'button', className: 'dshus-range-btn' + (trendPeriod === 'month' ? ' on' : ''), onClick: function () { setTrendPeriod('month') } }, t('30天')),
            ),
          ),
          React.createElement(DailyTrend, { dayMap: dayMap, dayModelMap: dayModelMap, colorOf: colorOf, tz: tz, period: trendPeriod }),
        ),

        controlSettings.showTokenSpeed !== false && React.createElement(TokenSpeedRanking, { speeds: data && data.tokenSpeeds, loading: loading && !data }),

        /* Area 5: 模型明细 */
        controlSettings.showModelDetails && React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('模型明细与分布'),
            React.createElement('div', { className: 'dshus-range', style: { marginLeft: 'auto' } },
              React.createElement('button', {
                type: 'button',
                className: 'dshus-range-btn' + (!groupByModel ? ' on' : ''),
                onClick: function () { setGroupByModel(false); setTableExpanded(false) },
                title: t('每个供应商 · 模型组合单独统计'),
              }, t('供应商·模型')),
              React.createElement('button', {
                type: 'button',
                className: 'dshus-range-btn' + (groupByModel ? ' on' : ''),
                onClick: function () { setGroupByModel(true); setTableExpanded(false) },
                title: t('合并同名模型，不区分供应商'),
              }, t('按模型')),
            ),
          ),
          React.createElement(Donut, {
            byModel: donutModels,
            colorOf: donutColorFor,
            onSelect: groupByModel ? undefined : function (key) { changeModel(key === model ? '' : key) },
          }),
          React.createElement('div', { className: 'dshus-model-toolbar' },
            React.createElement('span', { style: { fontSize: 13, fontWeight: 400, color: 'var(--dsw-alias-label-secondary, #4b5563)' } },
              t('模型用量清单 ({count})', { count: tableModels.length }),
            ),
            React.createElement('input', {
              type: 'text',
              className: 'dshus-search-input',
              placeholder: t('搜索模型或供应商名称…'),
              value: searchQuery,
              onChange: function (e) { setSearchQuery(e.target.value) },
            }),
          ),
          React.createElement('div', { className: 'dshus-table-wrap' },
            React.createElement('table', { className: 'dshus-table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, t('模型名称')),
                  React.createElement('th', { style: { textAlign: 'right' } }, t('用量 Tokens')),
                  React.createElement('th', { style: { textAlign: 'right' } }, t('占比')),
                  React.createElement('th', { className: 'dshus-table-bar-cell' }, t('分布条')),
                  React.createElement('th', { style: { textAlign: 'right' } }, t('最后活跃时间')),
                ),
              ),
              React.createElement('tbody', null,
                tableRows.length > 0 ? tableRows : React.createElement('tr', null,
                  React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', padding: '16px 0' } }, t('没有找到匹配的模型')),
                ),
              ),
            ),
          ),
          (!filterText && tableModels.length > 1) && React.createElement('div', { style: { textAlign: 'center', marginTop: 10 } },
            React.createElement('button', {
              type: 'button',
              className: 'dshus-btn',
              onClick: function () { setTableExpanded(!tableExpanded) },
              style: { fontSize: 12, height: 28, padding: '0 16px', margin: '0 auto' }
            }, tableExpanded ? t('收起清单') : t('展开其余 {count} 个模型', { count: tableModels.length - 1 }))
          ),
        ),

        ),
        quotaVisited && React.createElement('div', { id: 'dshus-quota-panel', className: 'dshus-quota-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-quota', tabIndex: 0, hidden: tab !== 'quota', 'data-empty-label': t('连接模型服务后，可读取的配额会显示在这里') },
          quotaError && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(quotaError)),
          React.createElement(ProviderQuotasPanel, { api: api, key: 'providers', active: tab === 'quota', revision: quotaRevision, refreshing: quotaLoading, snapshot: quotaSnapshots.providers },
            React.createElement(AccountQuotasPanel, { api: api, key: 'accounts', active: tab === 'quota', revision: quotaRevision, refreshing: quotaLoading, snapshot: quotaSnapshots.accounts })),
        ),
        showModelDetection && detectionVisited && React.createElement('div', { id: 'dshus-detection-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-detection', hidden: tab !== 'detection' }, React.createElement(DetectionPanel, { api: api, active: tab === 'detection', onUsageUpdated: load, uiSession: props.uiSession, uiWorkspace: props.uiWorkspace, modelDirectories: props.modelDirectories })),
        tab === 'control' && React.createElement('div', { id: 'dshus-control-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-control' }, controlsBody),
        ),
      )
    }

// __DSH_ACCOUNT_QUOTAS_CLIENT__
var accountQuotasClient = typeof createAccountQuotasClient === 'function' ? createAccountQuotasClient(React, t, useLocaleRevision) : null

function UsageDisplayControls(props) {
  useLocaleRevision()
  var state = React.useState({ settings: { showModelDetails: false, showTokenSpeed: true } }), control = state[0], setControl = state[1]
  var errorState = React.useState(''), error = errorState[0], setError = errorState[1]
  var readyState = React.useState(false), ready = readyState[0], setReady = readyState[1]
  var savingState = React.useState(false), saving = savingState[0], setSaving = savingState[1]
  var request = React.useRef(0)
  React.useEffect(function () {
    var id = ++request.current
    props.api.controls().then(function (body) { if (id === request.current) { setControl(body); setReady(true) } }).catch(function (err) { if (id === request.current) setError(String(err.message || err)) })
    return function () { request.current++ }
  }, [props.api])
  function save(key, value) {
    var id = ++request.current, patch = {}; patch[key] = value; setSaving(true); setError('')
    props.api.controls(patch).then(function (body) { if (id === request.current) setControl(body) }).catch(function (err) { if (id === request.current) setError(String(err.message || err)) }).finally(function () { if (id === request.current) setSaving(false) })
  }
  return React.createElement('div', { className: 'dshus-page dshus-controls', 'data-plugin-controls': 'usage-stats' },
    error && React.createElement('p', { className: 'dshus-error', role: 'alert' }, uiError(error)),
    [['showModelDetails', '模型明细与分布'], ['showTokenSpeed', 'token输出速度']].map(function (entry) {
      var enabled = control.settings && (entry[0] === 'showModelDetails' ? control.settings.showModelDetails === true : control.settings.showTokenSpeed !== false)
      return React.createElement('div', { className: 'dshus-setting-row', key: entry[0] },
        React.createElement('span', { className: 'dshus-setting-label' }, t(entry[1])),
        React.createElement('button', { type: 'button', role: 'switch', className: 'dshus-switch' + (enabled ? ' on' : ''), 'aria-label': t(entry[1]), 'aria-checked': enabled, disabled: !ready || saving, onClick: function () { save(entry[0], !enabled) } }))
    }))
}

// __DSH_USAGE_STATS_REASONING_SETTINGS__
var reasoningSettings = typeof createReasoningSettings === 'function' ? createReasoningSettings(React, t, useLocaleRevision) : null

var SEAT_STYLE_ID = 'dsh-usage-stats-seat-styles'

var SEAT_ENABLED_KEY = 'dsh-usage-stats-advanced-model-select'


function seatFindEntry(groups, provider, model) {
      if (!groups) return undefined
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i]
        if (group.id !== provider) continue
        for (var j = 0; j < group.models.length; j++) {
          if (group.models[j].id === model) return group.models[j]
        }
      }
      return undefined
    }

function seatClamp(rect, vw, vh, margin) {
      var gap = typeof margin === 'number' ? margin : 12
      if (!rect || !(vw > 0) || !(vh > 0) || !(rect.width > 0)) return { shift: 0, maxHeight: null }
      // Horizontal. When the box is wider than the usable width no shift can
      // satisfy both edges, so pin the left edge and let CSS clamp the width.
      var shift = 0
      var usable = vw - gap * 2
      if (rect.width > usable) shift = gap - rect.left
      else if (rect.left < gap) shift = gap - rect.left
      else if (rect.right > vw - gap) shift = (vw - gap) - rect.right
      // Vertical. The box grows upward, so only its TOP can escape the window;
      // cap the height by exactly the overflow so nothing is lost.
      var maxHeight = null
      if (rect.top < gap) maxHeight = Math.max(120, Math.round(rect.height - (gap - rect.top)))
      return { shift: Math.round(shift), maxHeight: maxHeight }
    }

function SeatDataIcon() {
      return React.createElement('svg', {
        viewBox: '0 0 16 16', width: '16', height: '16', fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true, strokeWidth: 1,
      },
        React.createElement('path', {
          d: 'M7.8667 0.349609C8.96906 0.349634 10.0601 0.481272 11.0317 0.735352C11.9973 0.987845 12.8453 1.362 13.4644 1.84766C14.0744 2.32629 14.507 2.95539 14.5161 3.69336H14.5171V8.53516C14.0843 8.32076 13.6108 8.17679 13.1108 8.11816C13.1831 7.96848 13.2162 7.82856 13.2163 7.70312V5.76758C12.6269 6.16618 11.8739 6.47995 11.0317 6.7002C10.0602 6.95423 8.96896 7.08494 7.8667 7.08496C6.76461 7.08493 5.67411 6.95415 4.70264 6.7002C3.85994 6.48006 3.10694 6.1662 2.51709 5.76758V7.70312L2.521 7.78418C2.56374 8.19554 2.93361 8.74414 3.91357 9.23145C4.9281 9.73585 6.35004 10.0371 7.8667 10.0371C8.26373 10.0371 8.6543 10.0141 9.03271 9.97461C8.75596 10.3799 8.54664 10.8349 8.42041 11.3232C8.23666 11.3313 8.0518 11.3369 7.8667 11.3369C6.20108 11.3369 4.57025 11.01 3.33447 10.3955C3.04163 10.2499 2.76658 10.0836 2.51709 9.90039V11.6738C2.51728 12.1379 2.88589 12.7556 3.92236 13.292C4.93457 13.8157 6.35342 14.1289 7.8667 14.1289C8.12318 14.1289 8.37694 14.1161 8.62646 14.0986C8.82021 14.5535 9.08999 14.9682 9.41943 15.3271C8.91285 15.3934 8.39149 15.4287 7.8667 15.4287C6.19761 15.4287 4.56379 15.0869 3.32568 14.4463C2.11244 13.8185 1.21649 12.8562 1.21631 11.6738V3.76367C1.21595 3.74853 1.21438 3.733 1.21436 3.71777C1.21436 2.96917 1.65103 2.33053 2.26807 1.84668C2.88747 1.36112 3.73675 0.987685 4.70264 0.735352C5.67413 0.481376 6.76457 0.349636 7.8667 0.349609ZM7.8667 1.65039C6.86269 1.65042 5.88326 1.77028 5.03076 1.99316C4.17183 2.2176 3.50421 2.52956 3.06982 2.87012C2.65043 3.19909 2.52622 3.48898 2.51709 3.69336V3.74414C2.52719 3.94845 2.65185 4.23772 3.06982 4.56543C3.50425 4.90601 4.17172 5.21795 5.03076 5.44238C5.88326 5.66527 6.8627 5.78513 7.8667 5.78516C8.8707 5.78513 9.85015 5.66525 10.7026 5.44238C11.5611 5.21787 12.2286 4.9049 12.6626 4.56445C13.0982 4.22252 13.2163 3.9231 13.2163 3.71777L13.2104 3.63574C13.1818 3.43623 13.044 3.16941 12.6626 2.87012C12.2286 2.52957 11.5614 2.21773 10.7026 1.99316C9.85009 1.77025 8.8708 1.65041 7.8667 1.65039Z',
          fill: 'currentColor',
        }),
        React.createElement('path', {
          d: 'M12.8936 10.0361L13.2061 10.5566C13.2296 10.5959 13.2651 10.6562 13.3027 10.707C13.3469 10.7666 13.4148 10.8431 13.5195 10.9023C13.6244 10.9617 13.725 10.9801 13.7988 10.9873C13.8619 10.9934 13.9318 10.9932 13.9775 10.9932H14.6162L14.8896 11.4502L14.5947 11.9443C14.5698 11.9859 14.5312 12.0483 14.5029 12.1084C14.4781 12.1611 14.4514 12.2312 14.4395 12.3164L14.4326 12.4072L14.4395 12.4971C14.4514 12.5825 14.4781 12.6532 14.5029 12.7061C14.5312 12.7661 14.5689 12.8287 14.5938 12.8701L14.8896 13.3633L14.6162 13.8213H13.9775C13.9318 13.8213 13.8619 13.821 13.7988 13.8271C13.7433 13.8326 13.6728 13.8442 13.5967 13.875L13.5195 13.9121C13.4148 13.9714 13.3469 14.0478 13.3027 14.1074C13.265 14.1583 13.2296 14.2186 13.2061 14.2578L12.8936 14.7783H12.3115L11.999 14.2578C11.9755 14.2186 11.9401 14.1583 11.9023 14.1074C11.8693 14.0628 11.823 14.0083 11.7578 13.959L11.6855 13.9121L11.6074 13.875C11.5316 13.8445 11.4615 13.8325 11.4062 13.8271C11.3432 13.821 11.2733 13.8213 11.2275 13.8213H10.5889L10.3135 13.3633L10.6104 12.8701C10.6352 12.8287 10.6739 12.7661 10.7021 12.7061C10.7352 12.6357 10.7724 12.534 10.7725 12.4072C10.7724 12.2804 10.7352 12.1788 10.7021 12.1084C10.6739 12.0483 10.6353 11.9859 10.6104 11.9443L10.3135 11.4502L10.5889 10.9932H11.2275C11.2733 10.9932 11.3432 10.9934 11.4062 10.9873C11.4801 10.9801 11.5808 10.9616 11.6855 10.9023C11.7903 10.843 11.8582 10.7666 11.9023 10.707C11.94 10.6562 11.9755 10.5959 11.999 10.5566L12.3115 10.0361H12.8936Z',
          stroke: 'currentColor',
          strokeMiterlimit: '10',
        }))
    }

function SeatChevron(props) {
      return React.createElement('span', { className: 'rs2-chev' + (props.open ? ' rs2-chev-open' : ''), 'aria-hidden': true },
        React.createElement('svg', { viewBox: '0 0 16 16', width: '12', height: '12' },
          React.createElement('path', { d: 'M4 6l4 4 4-4', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' })))
    }

function SeatCheckIcon() {
      return React.createElement('svg', { viewBox: '0 0 16 16', width: '14', height: '14', 'aria-hidden': true },
        React.createElement('path', { d: 'M3.5 8.5l3 3 6-7', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }))
    }

function seatReadEnabledPref() {
      try { return localStorage.getItem(SEAT_ENABLED_KEY) === '1' } catch (error) { return false }
    }

function seatWriteEnabledPref(value) {
      try { localStorage.setItem(SEAT_ENABLED_KEY, value ? '1' : '0') } catch (error) { /* startup hint is best-effort */ }
    }

var SEAT_EFFORT_ZH = { auto: '自动', default: '默认', none: '关', off: '关闭', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最大' }

function seatEffortZh(id, name) {
      if (id !== undefined) {
        var key = String(id).toLowerCase()
        if (SEAT_EFFORT_ZH[key]) return t(SEAT_EFFORT_ZH[key])
      }
      if (name) {
        var key2 = String(name).toLowerCase()
        if (SEAT_EFFORT_ZH[key2]) return t(SEAT_EFFORT_ZH[key2])
      }
      return name ? String(name) : (id === undefined ? t('自动') : String(id))
    }

function seatEffortStops(reasoning) {
      var stops = []
      // Keep the selectable unspecified effort even when an adapter reports
      // the current selection as a concrete effort.
      if (reasoning.defaultEffort === undefined) {
        stops.push({ id: undefined, label: t('自动') })
      }
      for (var i = 0; i < reasoning.efforts.length; i++) {
        stops.push({ id: reasoning.efforts[i].id, label: seatEffortZh(reasoning.efforts[i].id, reasoning.efforts[i].name) })
      }
      return stops
    }

function seatPrand(i, salt) {
      var x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
      return x - Math.floor(x)
    }

function SeatSlider(props) {
      var count = props.count
      var value = props.value
      var trackRef = React.useRef(null)
      var dragRectRef = React.useRef(null)
      var draggingRef = React.useRef(false)
      var valueRef = React.useRef(value)
      valueRef.current = value
      var max = Math.max(count - 1, 1)
      var isMax = count > 1 && value === count - 1
      function posToIndex(clientX) {
        var el = trackRef.current
        if (!el) return valueRef.current
        var rect = dragRectRef.current || el.getBoundingClientRect()
        var ratio = Math.min(1, Math.max(0, (clientX - rect.left - 14) / Math.max(rect.width - 28, 1)))
        return Math.round(ratio * max)
      }
      function previewIndex(index) {
        if (index === valueRef.current) return
        valueRef.current = index
        props.onPreview(index)
      }
      var tickEls = []
      for (var i = 0; i < count; i++) {
        tickEls.push(React.createElement('span', {
          key: 't' + i,
          className: 'rs2-tick-shell',
          style: { '--rs2-p': String(i / max), '--rs2-delay': (i * 0.07).toFixed(2) + 's' },
        }, React.createElement('span', {
          className: 'rs2-tick' + (i <= value ? ' rs2-tick-on' : ''),
        })))
      }
      var streamEls = []
      if (isMax) {
        for (var s = 0; s < 18; s++) {
          var duration = 3.6 + seatPrand(s, 6) * 1.8
          streamEls.push(React.createElement('span', {
            key: 's' + s,
            className: 'rs2-stream',
            style: {
              '--rs2-y': (15 + seatPrand(s, 2) * 70).toFixed(1) + '%',
              '--rs2-size': (seatPrand(s, 3) < 0.7 ? 1.5 : 2) + 'px',
              '--rs2-duration': duration.toFixed(2) + 's',
              '--rs2-delay': (-seatPrand(s, 7) * duration).toFixed(2) + 's',
            },
          }, React.createElement('span', { className: 'rs2-stream-dot' })))
        }
      }
      var p = String(max === 0 ? 0 : value / max)
      var kids = [React.createElement('div', { key: 'rail', className: 'rs2-rail' },
        React.createElement('div', { className: 'rs2-fill' }),
        tickEls,
        streamEls)]
      kids.push(React.createElement('div', { key: 'thumb', className: 'rs2-dot' }))
      return React.createElement('div', {
        ref: trackRef,
        className: 'rs2-track' + (isMax ? ' rs2-max' : ''),
        role: 'slider',
        'aria-label': t('推理强度'),
        'aria-valuemin': 0,
        'aria-valuemax': max,
        'aria-valuenow': value,
        style: { '--rs2-p': p },
        onPointerDown: function (event) {
          event.preventDefault()
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch (error) { /* capture is best-effort */ }
          dragRectRef.current = trackRef.current ? trackRef.current.getBoundingClientRect() : null
          draggingRef.current = true
          previewIndex(posToIndex(event.clientX))
        },
        onPointerMove: function (event) {
          if (!draggingRef.current) return
          previewIndex(posToIndex(event.clientX))
        },
        onPointerUp: function (event) {
          if (!draggingRef.current) return
          draggingRef.current = false
          try { event.currentTarget.releasePointerCapture(event.pointerId) } catch (error) { /* capture is best-effort */ }
          var index = posToIndex(event.clientX)
          dragRectRef.current = null
          props.onCommit(index)
        },
        onLostPointerCapture: function () { draggingRef.current = false; dragRectRef.current = null },
      }, kids)
    }

function ModelSeat(props) {
      useLocaleRevision()
      var store = props.store
      var state = React.useSyncExternalStore(
        function (onChange) { return store ? store.subscribe(onChange) : function () {} },
        function () { return store ? store.getSnapshot() : null },
      )
      React.useEffect(function () {
        if (props.available && store) props.load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [props.available, !!store])
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var modeState = React.useState('advanced')
      var mode = modeState[0]
      var setMode = modeState[1]
      var optState = React.useState(null)
      var opt = optState[0]
      var setOpt = optState[1]
      var rootRef = React.useRef(null)
      var selectingRef = React.useRef(false)
      var listRef = React.useRef(null)
      React.useEffect(function () {
        if (!open || mode !== 'models') return
        var list = listRef.current
        if (!list || typeof list.querySelector !== 'function') return
        var selected = list.querySelector('[data-selected="1"]')
        if (!selected) return
        try {
          var listRect = list.getBoundingClientRect()
          var selectedRect = selected.getBoundingClientRect()
          list.scrollTop = list.scrollTop + (selectedRect.top - listRect.top) - list.clientHeight / 2 + selected.clientHeight / 2
        } catch (error) { /* scrolling is cosmetic */ }
      }, [open, mode])
      /**
       * Keep the popover inside the viewport on narrow screens.
       *
       * The menu's CSS anchor follows the trigger center. Re-measure when it
       * opens or the model directory changes, then shift only if that centered
       * box crosses a viewport edge. Height is capped on short windows.
       */
      React.useEffect(function () {
        if (!open) return undefined
        var root = rootRef.current
        if (!root || typeof root.querySelector !== 'function') return undefined
        var win = (typeof window !== 'undefined' ? window : undefined)
        if (!win || typeof win.addEventListener !== 'function') return undefined
        var apply = function () {
          var menu = root.querySelector('.rs2-menu')
          if (!menu || typeof menu.getBoundingClientRect !== 'function' || !menu.style) return
          // Reset first so the measurement reflects the centered CSS anchor,
          // not a previous clamp (the effect re-runs on resize).
          menu.style.transform = ''
          menu.style.maxHeight = ''
          try {
            var rect = menu.getBoundingClientRect()
            var fix = seatClamp(rect, win.innerWidth, win.innerHeight)
            if (fix.shift) menu.style.transform = 'translateX(calc(-50% + ' + fix.shift + 'px))'
            if (fix.maxHeight) menu.style.maxHeight = fix.maxHeight + 'px'
          } catch (error) { /* clamping is cosmetic */ }
        }
        apply()
        win.addEventListener('resize', apply)
        return function () { win.removeEventListener('resize', apply) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [open, mode, state])
      React.useEffect(function () {
        if (!open) return undefined
        var onDown = function (event) {
          if (rootRef.current && !rootRef.current.contains(event.target)) {
            setOpen(false)
            setMode('advanced')
          }
        }
        if (typeof document === 'undefined') return undefined
        document.addEventListener('mousedown', onDown)
        return function () { document.removeEventListener('mousedown', onDown) }
      }, [open])
      React.useEffect(function () {
        if (!opt) return undefined
        return props.scheduleClear(function () {
          setOpt(function (current) { return current === opt ? null : current })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [opt])
      if (!props.available || !store || !state) return null
      var current = state.current || null
      var groups = state.groups || []
      var model = current ? seatFindEntry(groups, current.provider, current.model) : undefined
      var displayName = current ? ((model && model.name) || current.model) : ''
      var reasoning = (current && model) ? model.reasoning : undefined
      var effLabel
      if (reasoning) {
        var eff = current.reasoningEffort !== undefined ? current.reasoningEffort : reasoning.defaultEffort
        effLabel = eff === undefined ? t('自动') : seatEffortZh(eff, (reasoning.efforts.find(function (x) { return x.id === eff }) || {}).name || eff)
      }
      function commitSelection(selection) {
        selectingRef.current = true
        return Promise.resolve(props.select(selection)).finally(function () {
          selectingRef.current = false
          setOpt(null)
        })
      }
      var stops = []
      var value = 0
      var committedIdx = 0
      if (mode === 'advanced' && current && reasoning && reasoning.efforts.length > 0) {
        stops = seatEffortStops(reasoning)
        var idx = -1
        for (var si = 0; si < stops.length; si++) { if (stops[si].id === current.reasoningEffort) { idx = si; break } }
        if (idx === -1) for (var sj = 0; sj < stops.length; sj++) { if (stops[sj].id === undefined) { idx = sj; break } }
        if (idx === -1) idx = 0
        committedIdx = idx
        value = opt && opt.provider === current.provider && opt.model === current.model && opt.value !== idx ? opt.value : idx
      }
      function commitStop(i) {
        if (!current || selectingRef.current) { setOpt(null); return }
        var stop = stops[i]
        if (!stop || i === committedIdx) { setOpt(null); return }
        var selection = { provider: current.provider, model: current.model }
        if (stop.id !== undefined) selection.reasoningEffort = stop.id
        commitSelection(selection)
      }
      function pickModel(group, entry) {
        setOpt(null)
        var selection = { provider: group.id, model: entry.id }
        if (entry.reasoning && entry.reasoning.defaultEffort !== undefined) selection.reasoningEffort = entry.reasoning.defaultEffort
        commitSelection(selection)
        setMode('advanced')
      }
      function pickEffort(id) {
        if (!current) return
        setOpt(null)
        var selection = { provider: current.provider, model: current.model }
        if (id !== undefined) selection.reasoningEffort = id
        commitSelection(selection)
        setOpen(false)
        setMode('advanced')
      }
      var body
      if (mode === 'models') {
        body = React.createElement(React.Fragment, null,
          React.createElement('button', { type: 'button', className: 'rs2-back', onClick: function () { setMode('advanced') } }, t('‹ 模型')),
          React.createElement('div', { className: 'rs2-list', ref: listRef },
            groups.length === 0 ? React.createElement('div', { className: 'rs2-grouptitle' }, state.status === 'error' ? t('模型目录加载失败') : t('加载中…')) : null,
            groups.map(function (group) {
              return React.createElement('div', { key: group.id },
                React.createElement('div', { className: 'rs2-grouptitle' }, group.name || group.id),
                group.models.map(function (entry) {
                  var isSelected = !!current && current.provider === group.id && current.model === entry.id
                  return React.createElement('button', {
                    key: entry.id,
                    type: 'button',
                    className: 'rs2-option',
                    'data-selected': isSelected ? '1' : '0',
                    onClick: function () { pickModel(group, entry) },
                  },
                    React.createElement('span', { className: 'rs2-optname' }, entry.name || entry.id),
                    React.createElement('span', { style: { flex: 1 } }),
                    isSelected ? React.createElement('span', { className: 'rs2-check' }, React.createElement(SeatCheckIcon, null)) : null)
                })
              )
            })
          )
        )
      } else {
        body = React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'rs2-advhead' },
            React.createElement('button', { type: 'button', className: 'rs2-modeljump', onClick: function () { setMode('models') } },
              React.createElement('span', { className: 'rs2-modeljump-name' }, current ? displayName : t('选择模型')),
              React.createElement(SeatChevron, { open: false })),
            React.createElement('div', { className: 'rs2-curlevel' + (stops.length > 1 && value === stops.length - 1 ? ' rs2-curlevel-max' : '') }, (stops[value] || {}).label || effLabel)),
          React.createElement('div', { className: 'rs2-sliderbox' },
            React.createElement(SeatSlider, {
              count: stops.length,
              value: value,
              onPreview: function (i) { if (current) setOpt({ provider: current.provider, model: current.model, value: i }) },
              onCommit: function (i) { commitStop(i) },
            })))
      }
      return React.createElement('div', { className: 'rs2-root', ref: rootRef },
        React.createElement('button', {
          type: 'button',
          className: 'rs2-trigger',
          'aria-expanded': open,
          disabled: props.locked === true,
          onClick: function () {
            setOpt(null)
            if (props.available) props.load()
            setOpen(function (v) {
              var next = !v
              if (next) setMode('advanced')
              return next
            })
          },
        },
          // Compact-mode glyph first, exactly like the official seat: the host
          // row toggles the two display variables defined above, so this icon
          // appears only when the composer cannot fit the text.
          React.createElement('span', { className: 'rs2-trigger-icon', 'aria-hidden': true }, React.createElement(SeatDataIcon, null)),
          React.createElement('span', { className: 'rs2-trigger-name' }, current ? displayName : t('选择模型')),
          reasoning ? React.createElement('span', { className: 'rs2-trigger-effort' }, effLabel) : null,
          React.createElement(SeatChevron, { open: open })),
        open && React.createElement('div', { className: 'rs2-menu' }, body))
    }

function seatDisposer() {
      var state = { disposed: false, disposer: undefined, scope: undefined }
      function dispose() {
        if (state.disposed) return
        state.disposed = true
        if (typeof state.disposer === 'function') state.disposer()
        if (state.scope && typeof state.scope.dispose === 'function') state.scope.dispose()
      }
      return {
        state: state,
        dispose: dispose,
      }
    }

function registerModelSeat(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) {
        console.warn('[dsh-usage-stats] 高级模型选择器: slots service unavailable')
        return null
      }
      var models = ctx.get('modelDirectories')
      var sessions = ctx.get('sessions')
      if (models === undefined || typeof models.directoryFor !== 'function' || sessions === undefined || typeof sessions.subagentAddress !== 'function') {
        console.warn('[dsh-usage-stats] 高级模型选择器: modelDirectories/sessions service unavailable')
        return null
      }
      var handle = seatDisposer()
      // The effort-preview clear cancels its 2s timer when the component
      // unmounts, so every timer created inside the seat is owned by it.
      var timers = new Set()
      function scheduleClear(fn) {
        var fire = function () {
          timers.delete(fire)
          fn()
        }
        var stop = ctx.timeout(fire, 2000)
        timers.add(fire)
        return function () {
          if (!timers.has(fire)) return
          timers.delete(fire)
          if (typeof stop === 'function') stop()
        }
      }
      handle.state.scope = slots.inject('conversation.input.model', function () {
        if (handle.state.disposed) return undefined
        var disposer = slots.register({
          name: 'conversation.input.model',
          // A negative priority places this enabled seat ahead of the official selector.
          priority: -1,
          locale: 'model',
          inject: function (sessionId) {
            // The official modelDirectories service reaches into other
            // services here, on THIS plugin's fiber — see the inject list.
            var directory = models.directoryFor(sessionId)
            var available = sessions.subagentAddress(sessionId) === undefined
            if (!available) return { available: false }
            return {
              available: true,
              store: directory.store,
              load: function () { directory.load().catch(function () {}) },
              select: function (selection) { return directory.select(selection).then(function () { return true }, function () { return false }) },
            }
          },
        }, function (slotProps) {
          return React.createElement(ModelSeat, Object.assign({}, slotProps, { scheduleClear: scheduleClear }))
        })
        if (handle.state.disposed) {
          if (typeof disposer === 'function') disposer()
          return undefined
        }
        handle.state.disposer = disposer
        return disposer
      })
      return handle
    }

var seatRegistration = null

var reasoningVisibility = null

var modelSeatSync = null

var modelSeatSyncRevision = 0

function setModelSeatSync(fn) {
      modelSeatSync = fn
    }

function syncModelSeatFromControls(control) {
      if (typeof modelSeatSync !== 'function') return false
      try {
        // Wait for an explicit host value before mounting the selector.
        var enabled = !!(control && control.settings && control.settings.advancedModelSelect)
        modelSeatSyncRevision++
        seatWriteEnabledPref(enabled)
        return modelSeatSync(enabled)
      } catch (error) {
        console.warn('[dsh-usage-stats] 高级模型选择器 sync failed:', error)
        return false
      }
    }

function syncModelFeaturesFromControls(control) {
      if (reasoningVisibility) reasoningVisibility.sync(control && control.settings)
      return syncModelSeatFromControls(control)
    }

function bootModelSeat(ctx, api) {
      var disposed = false
      var stopRetry = null
      var retries = 0
      function retry() {
        if (disposed || retries >= 10 || typeof ctx.timeout !== 'function') return
        var delay = Math.min(400 * Math.pow(2, retries++), 4000)
        stopRetry = ctx.timeout(load, delay)
      }
      function load() {
        stopRetry = null
        var revision = modelSeatSyncRevision
        var request
        try { request = api.controls() } catch (error) { retry(); return }
        request.then(function (body) {
          // A settings-page read/save made after this request takes precedence.
          if (disposed || revision !== modelSeatSyncRevision) return
          var enabled = !!(body && body.settings && body.settings.advancedModelSelect)
          if (!syncModelFeaturesFromControls(body) && enabled) retry()
        }).catch(function () {
          if (!disposed && revision === modelSeatSyncRevision) retry()
        })
      }
      load()
      return function () {
        disposed = true
        if (typeof stopRetry === 'function') stopRetry()
      }
    }

function syncModelSeat(ctx, enabled) {
      if (enabled !== true) {
        if (seatRegistration) {
          var stale = seatRegistration
          seatRegistration = null
          try { stale.dispose() } catch (error) {
            console.warn('[dsh-usage-stats] 高级模型选择器 unmount failed:', error)
          }
          var seatStyle = document.getElementById(SEAT_STYLE_ID)
          if (seatStyle && typeof seatStyle.remove === 'function') seatStyle.remove()
        }
        return false
      }
      if (seatRegistration) return true
      var handle
      try {
        handle = registerModelSeat(ctx)
      } catch (error) {
        console.warn('[dsh-usage-stats] 高级模型选择器 mount failed:', error)
        return false
      }
      if (handle === null) return false
      seatRegistration = handle
      try {
        injectSeatStyles(ctx)
      } catch (error) {
        console.warn('[dsh-usage-stats] 高级模型选择器 styles failed:', error)
      }
      return true
    }

function injectSeatStyles(ctx) {
      var dispose = function () {
        var style = document.getElementById(SEAT_STYLE_ID)
        if (style && typeof style.remove === 'function') style.remove()
      }
      return ctx.effect(function () {
        // Always refresh the content, mirroring injectStyles(): an older
        // in-page load may have injected a stale revision of these rules.
        var style = document.getElementById(SEAT_STYLE_ID)
        if (!style) {
          style = document.createElement('style')
          style.id = SEAT_STYLE_ID
          style.dataset.plugin = 'dsh-model-selection-seat'
          style.dataset.pluginCss = 'dsh-model-selection-seat/seat'
          document.head.appendChild(style)
        }
        style.textContent = SEAT_CSS
        return dispose
      }, 'dsh-usage-stats: model seat stylesheet')
    }

function registerLocale(ctx) {
  var locale = ctx.get('locale')
  if (!locale || typeof locale.register !== 'function' || typeof locale.bind !== 'function') return
  var dictionaries = { zh: {}, en: {}, ja: {} }
  Object.keys(messages).forEach(function (key) { dictionaries.zh[key] = key; dictionaries.en[key] = messages[key][0]; dictionaries.ja[key] = messages[key][1] })
  ctx.effect(function () { return locale.register(SECTION_ID, dictionaries) }, SECTION_ID + ': translations')
  localeService = locale; translate = locale.bind(SECTION_ID)
}

function apply(ctx) {
  // DSH Desktop marks its renderer through the preload bridge dshDesktop.
  // 0.2.0-rc.2 exposes only { protocolVersion: 1 }; older builds carried a
  // deviceInfo() function. Accept either marker so the settings section
  // registers on both, while plain browser tabs (no bridge) still bail out.
  if (typeof window === 'undefined' || !window.dshDesktop) return
  var hasDeviceInfo = typeof window.dshDesktop.deviceInfo === 'function'
  var hasProtocolVersion = typeof window.dshDesktop.protocolVersion === 'number'
  if (!hasDeviceInfo && !hasProtocolVersion) return
  var slots = ctx.get('slots'); if (!slots) return
  registerLocale(ctx)
  var api = new UsageApi()
  injectStyles()
  if (typeof window.dispatchEvent === 'function' && typeof window.Event === 'function') window.dispatchEvent(new window.Event('dsh-usage-stats/features-owner'))
  setModelSeatSync(function (enabled) { return syncModelSeat(ctx, enabled) })
  if (seatReadEnabledPref()) syncModelSeat(ctx, true)
  if (reasoningSettings) ctx.effect(function () { var visibility = reasoningSettings.createVisibility(ctx); reasoningVisibility = visibility; visibility.sync(); return function () { visibility.dispose(); if (reasoningVisibility === visibility) reasoningVisibility = null } }, 'dsh-usage-stats: reasoning')
  ctx.effect(function () { return bootModelSeat(ctx, api) }, 'dsh-usage-stats: model seat')
  ctx.effect(function () { return function () { syncModelSeat(ctx, false); setModelSeatSync(null) } }, 'dsh-usage-stats: model seat cleanup')
  var common = { api: api, uiWorkspace: ctx.get('uiWorkspace'), uiSession: ctx.get('uiSession'), modelDirectories: ctx.get('modelDirectories') }
  ctx.effect(watchUsageNavIcon, 'dsh-usage-stats: sidebar icon')
  ctx.effect(function () { return slots.inject('settings.section', function () {
    return slots.register({ name: 'settings.section', id: SECTION_ID, order: 32, locale: SECTION_ID, label: function () { return t('用量统计') } }, function (props) {
      return React.createElement(UsageStatsSection, Object.assign({}, common, { intl: !props || props.intl !== false }))
    })
  }) }, 'dsh-usage-stats: settings section')
}

// Only services the settings section itself cannot start without are hard
// dependencies. The model seat and reasoning panel resolve their own optional
// services (sessions, modelDirectories, remote.settings) through ctx.get or a
// scoped ctx.inject, so a host missing one of them still mounts this section.
exports.inject = ['slots', 'locale', 'timer']; exports.apply = apply; exports.__components = { Heatmap, HeatPager, buildHeatmap, OverviewDetails, TokenSpeedRanking, UsageDisplayControls, ControlsPanel, DetectionPanel, ProviderPicker };
return module.exports
} })
