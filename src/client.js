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

/* One modern popup replaces every native title bubble. Elements opt in with
   data-dshus-tip; the node lives inside the open dialog (top layer) so it is
   visible above modal chrome. */
var hoverTipNode = null
var hoverTipTarget = null
var hoverTipSequence = 0
var hoverTipPoint = null
var hoverTipFramePending = false

function hoverTipRoot() {
      if (typeof document === 'undefined') return null
      var dialogs = typeof document.querySelectorAll === 'function' ? document.querySelectorAll('dialog[open]') : null
      return dialogs && dialogs.length ? dialogs[dialogs.length - 1] : document.body || null
    }

function hideHoverTip() {
      hoverTipTarget = null
      hoverTipPoint = null
      hoverTipSequence++
      if (hoverTipNode) hoverTipNode.classList.remove('on')
    }

// Reading the tooltip box right after writing it would force a synchronous
// layout of the whole dialog on every hover target. Position it after paint
// instead, so moving across dense charts stays responsive.
function placeHoverTip(target, sequence) {
      if (sequence !== hoverTipSequence || hoverTipTarget !== target || !hoverTipNode) return
      var x, y
      if (hoverTipPoint) {
        x = hoverTipPoint.x
        y = hoverTipPoint.y
      } else {
        var rect = target.getBoundingClientRect()
        x = rect.left + rect.width / 2
        y = rect.top
      }
      var width = hoverTipNode.offsetWidth || 0
      var height = hoverTipNode.offsetHeight || 0
      var viewportWidth = window.innerWidth || 0
      var viewportHeight = window.innerHeight || 0
      var margin = 8
      var left = x + 14
      if (left + width > viewportWidth - margin) left = x - width - 14
      left = Math.max(margin, left)
      var top = y + 16
      if (top + height > viewportHeight - margin) top = y - height - 12
      top = Math.max(margin, top)
      hoverTipNode.style.left = Math.round(left) + 'px'
      hoverTipNode.style.top = Math.round(top) + 'px'
      hoverTipNode.classList.add('on')
    }

function scheduleHoverTipPlacement() {
      if (hoverTipFramePending || !hoverTipTarget) return
      var schedule = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame
        : function (callback) { return setTimeout(callback, 16) }
      hoverTipFramePending = true
      schedule(function () {
        hoverTipFramePending = false
        placeHoverTip(hoverTipTarget, hoverTipSequence)
      })
    }

function showHoverTip(target, point) {
      if (typeof document === 'undefined' || typeof window === 'undefined' || !target || typeof target.getBoundingClientRect !== 'function') return
      var text = target.getAttribute('data-dshus-tip')
      if (!text) { hideHoverTip(); return }
      var root = hoverTipRoot()
      if (!root) return
      if (!hoverTipNode) {
        hoverTipNode = document.createElement('div')
        hoverTipNode.className = 'dshus-tip dshus-hover-tip'
        hoverTipNode.setAttribute('role', 'tooltip')
      }
      if (hoverTipNode.parentNode !== root) root.appendChild(hoverTipNode)
      hoverTipTarget = target
      hoverTipPoint = point ? { x: point.x, y: point.y } : null
      hoverTipNode.classList.remove('on')
      hoverTipNode.textContent = text
      hoverTipSequence++
      scheduleHoverTipPlacement()
    }

function bindHoverTips() {
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function' || !document.body) return undefined
      var nearest = function (node) { return node && typeof node.closest === 'function' ? node.closest('[data-dshus-tip]') : null }
      var over = function (event) {
        var target = nearest(event.target)
        if (target && target !== hoverTipTarget) showHoverTip(target, { x: event.clientX, y: event.clientY })
      }
      var move = function (event) {
        if (!hoverTipTarget || nearest(event.target) !== hoverTipTarget) return
        hoverTipPoint = { x: event.clientX, y: event.clientY }
        scheduleHoverTipPlacement()
      }
      var out = function (event) {
        var target = nearest(event.target)
        if (!target || target !== hoverTipTarget) return
        if (event.relatedTarget && target.contains && target.contains(event.relatedTarget)) return
        hideHoverTip()
      }
      var focusIn = function (event) { var target = nearest(event.target); if (target) showHoverTip(target, null) }
      var focusOut = function (event) { var target = nearest(event.target); if (target && target === hoverTipTarget) hideHoverTip() }
      var dismiss = function () { hideHoverTip() }
      document.addEventListener('pointerover', over, true)
      document.addEventListener('pointermove', move, { capture: true, passive: true })
      document.addEventListener('pointerout', out, true)
      document.addEventListener('focusin', focusIn, true)
      document.addEventListener('focusout', focusOut, true)
      document.addEventListener('pointerdown', dismiss, true)
      document.addEventListener('scroll', dismiss, true)
      return function () {
        document.removeEventListener('pointerover', over, true)
        document.removeEventListener('pointermove', move, { capture: true, passive: true })
        document.removeEventListener('pointerout', out, true)
        document.removeEventListener('focusin', focusIn, true)
        document.removeEventListener('focusout', focusOut, true)
        document.removeEventListener('pointerdown', dismiss, true)
        document.removeEventListener('scroll', dismiss, true)
        hideHoverTip()
        if (hoverTipNode && hoverTipNode.parentNode) hoverTipNode.parentNode.removeChild(hoverTipNode)
        hoverTipNode = null
      }
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
var fmtCost = clientFormat.fmtCost
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
      UsageApi.prototype.logs = function (opts) {
        var search = new URLSearchParams()
        if (opts.provider) search.set('provider', opts.provider)
        if (opts.model) search.set('model', opts.model)
        if (opts.page > 1) search.set('page', String(opts.page))
        if (opts.pageSize) search.set('pageSize', String(opts.pageSize))
        search.set('tz', String(LOCAL_TZ))
        if (opts.fresh) search.set('fresh', '1')
        return fetch('/api/dsh-usage-stats/logs?' + search.toString(), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.costs = function (opts) {
        var search = new URLSearchParams()
        if (opts.from) search.set('from', opts.from)
        if (opts.to) search.set('to', opts.to)
        if (opts.provider) search.set('provider', opts.provider)
        search.set('tz', String(LOCAL_TZ))
        if (opts.fresh) search.set('fresh', '1')
        return fetch('/api/dsh-usage-stats/costs?' + search.toString(), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.dashboard = function (opts) {
        var search = new URLSearchParams()
        if (opts.all) search.set('all', '1')
        else if (opts.from && opts.to) { search.set('from', opts.from); search.set('to', opts.to) }
        if (opts.provider) search.set('provider', opts.provider)
        if (opts.model) search.set('model', opts.model)
        if (opts.page > 1) search.set('page', String(opts.page))
        if (opts.pageSize) search.set('pageSize', String(opts.pageSize))
        search.set('tz', String(LOCAL_TZ))
        if (opts.fresh) search.set('fresh', '1')
        return fetch('/api/dsh-usage-stats/dashboard?' + search.toString(), { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.savePrice = function (body) {
        return fetch('/api/dsh-usage-stats/prices', {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
        }).then(readJson)
      }
      UsageApi.prototype.rules = function () {
        return fetch('/api/dsh-usage-stats/rules', { headers: { accept: 'application/json' } }).then(readJson)
      }
      UsageApi.prototype.saveRules = function (body) {
        return fetch('/api/dsh-usage-stats/rules', {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
        }).then(readJson)
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
var SEAT_COLOR_CHOICES = clientStyles.seatColors || []

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
            React.createElement('span', { 'data-dshus-tip': m.model }, m.model),
            React.createElement('strong', { 'data-dshus-tip': fmtExact(m.billed) + ' tokens' }, fmt(m.billed)),
          )
        })
        tipEl = React.createElement('div', {
          className: 'dshus-tip dshus-heat-tip',
          ref: tipRef,
          style: { left: tip.x, top: tip.y },
          onMouseEnter: clearHideTimer,
          onMouseLeave: hideTip,
        },
          React.createElement('div', { className: 'dshus-tip-name', 'data-dshus-tip': bucket ? fmtExact(tipValue) + ' tokens' : undefined }, weekly ? weekDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, function (_match, year, month, day) { return t('{year}年{month}月{day}日起的一周', { year: year, month: month, day: day }) }) : tip.cell.date),
          tipInWindow && React.createElement('div', { className: 'dshus-tip-val', 'data-dshus-tip': bucket ? fmtExact(tipValue) + ' tokens' : undefined }, bucket ? fmt(tipValue) + ' tokens' : t('无记录')),
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
        React.createElement('span', { className: 'dshus-heat-nav-label', 'data-dshus-tip': t('当前显示的日期范围') }, range),
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
          'data-dshus-tip': fmtExact(m.billed) + ' tokens',
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
        'data-dshus-tip': label,
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
                'data-dshus-tip': quota.status === 'unqueried' ? t('已在模型设置中配置，尚未查询配额。') : t('尚未获取到有效配额，可刷新重试。'),
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
              React.createElement('span', { className: 'dshus-quota-pct', style: { color: color }, 'data-dshus-tip': t('剩余 {value}', { value: formatPct(pct) }) }, value),
              React.createElement('span', { className: 'dshus-quota-reset', 'data-dshus-tip': metric.resetAt ? t('重置时间：{time}', { time: fmtFetched(metric.resetAt) }) : undefined }, reset),
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



function SelectField(props) {
  var openState = React.useState(false)
  var open = openState[0], setOpen = openState[1]
  var activeState = React.useState(0)
  var active = activeState[0], setActive = activeState[1]
  var placementState = React.useState({ above: false, height: 260 })
  var placement = placementState[0], setPlacement = placementState[1]
  var rootRef = React.useRef(null)
  var listRef = React.useRef(null)
  var searchRef = React.useRef({ text: '', at: 0 })
  var options = props.options || []
  var selected = options.find(function (item) { return item.value === props.value }) || options[0] || { value: '', name: '' }
  var activeIndex = Math.max(0, Math.min(active, options.length - 1))
  var listId = props.id + '-list'
  var field = props.variant === 'field'
  var rootClass = field
    ? 'dshus-dropdown' + (props.block ? ' dshus-dropdown-block' : props.inline ? ' dshus-dropdown-inline' : '')
    : 'dshus-provider-picker'
  var triggerClass = field ? 'dshus-field dshus-dropdown-trigger' : 'dshus-field dshus-query-select'
  var menuClass = field ? 'dshus-dropdown-menu' : 'dshus-provider-list'
  var optionClass = field ? 'dshus-dropdown-option' : 'dshus-provider-option'
  var nameClass = field ? 'dshus-dropdown-label' : 'dshus-provider-name'
  var chevronClass = field ? 'dshus-dropdown-chevron' : 'dshus-provider-chevron'

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
        if (String(options[match].name).toLowerCase().startsWith(search)) {
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
  function check(item) {
    return item.value === props.value
      ? React.createElement('svg', { className: 'dshus-dropdown-check', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, React.createElement('path', { d: 'm3.5 8.5 3 3 6-7' }))
      : null
  }
  var labelProps = props.labelId
    ? { 'aria-labelledby': props.labelId + ' ' + props.id + '-value' }
    : { 'aria-label': props['aria-label'] }
  return React.createElement('div', { className: rootClass, ref: rootRef },
    React.createElement('button', { id: props.id, type: 'button', role: 'combobox', className: triggerClass, disabled: props.disabled, ...labelProps, 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': open ? listId : undefined, 'aria-activedescendant': open ? listId + '-' + activeIndex : undefined, onClick: function () { if (open) setOpen(false); else show() }, onKeyDown: onKeyDown },
      React.createElement('span', { id: props.id + '-value', className: nameClass }, selected.name),
      dot(selected.source),
      React.createElement('svg', { className: chevronClass, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': 'true' }, React.createElement('path', { d: 'm4 6 4 4 4-4' }))),
    open && React.createElement('div', { id: listId, role: 'listbox', 'aria-labelledby': props.labelId, 'aria-label': props.labelId ? undefined : props['aria-label'], className: menuClass + (placement.above ? ' above' : ''), style: { maxHeight: placement.height }, ref: listRef },
      options.map(function (item, index) {
        // A stationary cursor must not override keyboard navigation as rows scroll past it.
        return React.createElement('div', { key: item.value, id: listId + '-' + index, role: 'option', 'data-value': item.value, 'aria-selected': item.value === props.value, 'aria-label': item.name + (item.source ? '，' + item.source : ''), 'data-dshus-tip': item.source || undefined, className: optionClass + (index === activeIndex ? ' active' : ''), onMouseMove: function () { setActive(index) }, onMouseDown: function (event) { event.preventDefault() }, onClick: function (event) { event.stopPropagation(); choose(index) } },
          React.createElement('span', { className: nameClass }, item.name), dot(item.source), check(item))
      })),
  )
}

function ProviderPicker(props) {
  // Called as a function, not an element, so the picker's own hooks stay in one
  // component while the settings tests still resolve its field markup directly.
  return SelectField(props)
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
  return React.createElement('dialog', { id: props.id, className: 'dshus-control-dialog' + (props.className ? ' ' + props.className : ''), ref: dialogRef, 'aria-labelledby': props.id + '-title',
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

/** Plain-language tour of every visible section, opened from the header. */
function QuickStartDialog(props) {
  var entries = [
    [t('刷新数据'), t('右上角的圆形箭头按钮用来重新读取数据：停在「用量」页时它是刷新用量统计，停在「配额」页时它会变成刷新全部配额。')],
    [t('用量'), t('顶部三个数字分别是今日 Tokens、使用天数和累计 Tokens，点旁边的小箭头可以展开缓存命中率、使用峰值、最长任务和连续使用天数等细节。今天的用量按小时画成柱状图，鼠标移到柱子上能看到该小时每个模型的用量，右侧可以在「供应商·模型」和「按模型」两种口径之间切换。')],
    [t('热力图与趋势图'), t('热力图一天一格，颜色越深表示当天用量越大；可以切换「每日 / 每周」，并用左右箭头翻看更早的时段。趋势图展示最近 7 天或 30 天的每日总量，右侧同样可以按「供应商·模型」或「按模型」查看，用来观察用量的起伏。')],
  ]
  if (props.showModelDetails) entries.push([t('模型明细与分布'), t('环形图显示各模型的用量占比，下面的表格列出用量、占比和最后活跃时间。可以按模型名搜索或用供应商名筛选，点表格下方的按钮可以展开完整清单。')])
  if (props.showTokenSpeed) entries.push([t('token输出速度'), t('按输出速度给模型排名：TPS 是每秒输出的 Token 数，TTFT 是发出请求到出现第一个 Token 的等待时间。TPS 越大、TTFT 越小，用起来越流畅。')])
  if (props.showLogs) entries.push([t('日志'), t('按时间倒序列出每一次请求，包含时间、应用、供应商、模型、成本、输入和输出 Token、缓存命中、速度与首字耗时。顶部可以按供应商、模型筛选，并调整每页行数，适合核对某一次调用具体用了多少。')])
  if (props.showCosts) entries.push([t('成本'), t('点日期范围按钮可以选择当天、近 7/14/30 天或本月，也可以直接在日历上选择起止日期；再选供应商，页面就会按价格表把 Tokens 折算成金额。顶部是总成本、区间成本和区间 Tokens，下方按模型列出花费与占比；如果模型显示未定价，点「价格表」补上单价即可。')])
  if (props.showRules) entries.push([t('规则'), t('把同一个模型的不同原始名称（例如不同供应商给出的别名）归并成一个名称。新增时填一个归一名称，再把相关的原始模型都选进去；保存后用量、日志和成本都会按新名称统计。已有规则可以随时编辑或移除。')])
  entries.push([t('配额'), t('这里显示各供应商和账号的剩余额度、已用比例与重置时间，数据直接向供应商查询。想让它在后台定时更新，可以在「控制」页打开「自动获取剩余余额」并设置间隔；也可以随时点右上角的刷新按钮。')])
  if (props.showModelDetection) entries.push([t('检测'), t('先选供应商和模型，再决定采样次数（标准 3 次，或只做排序的 1 次低耗初筛）和 Token 预算上限，点「查看检测预算」确认大约会消耗多少 Token，再点「开始检测」。完成后会给出首选候选、候选排名和每次采样的结果；结果只是参考排名，不构成模型身份认证。')])
  entries.push([t('控制'), t('这里是总开关：可以关掉不需要的标签页和模块，开启「高级模型选择器」并挑选主题色，设置「自动获取剩余余额」的刷新间隔，还能为供应商自定义配额查询。改动会立即保存，无需额外确认。')])
  entries.push([t('问题反馈'), t('右上角的发送图标会打开 GitHub Issues 页面，可以提交问题、使用疑问或功能建议。附上截图和复现步骤，会更容易定位问题。')])
  var activeState = React.useState(0)
  var active = Math.min(activeState[0], entries.length - 1)
  var setActive = activeState[1]
  function onNavKeyDown(event) {
    var delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    var next = (active + delta + entries.length) % entries.length
    setActive(next)
    var tabs = event.currentTarget.querySelectorAll('[role="tab"]')
    if (tabs[next] && typeof tabs[next].focus === 'function') tabs[next].focus()
  }
  return React.createElement(ControlDialog, { id: 'dshus-quickstart-dialog', className: 'dshus-quickstart-dialog', title: t('快速上手'), returnFocusId: 'dshus-quickstart-button', onClose: props.onClose },
    React.createElement('div', { className: 'dshus-quickstart' },
      React.createElement('nav', { className: 'dshus-quickstart-nav', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': t('快速上手'), onKeyDown: onNavKeyDown }, entries.map(function (entry, index) {
        return React.createElement('button', {
          key: entry[0], id: 'dshus-quickstart-tab-' + index, type: 'button', role: 'tab',
          'aria-selected': index === active, 'aria-controls': 'dshus-quickstart-panel',
          tabIndex: index === active ? 0 : -1, className: 'dshus-quickstart-tab',
          onClick: function () { setActive(index) },
        }, entry[0])
      })),
      React.createElement('div', { className: 'dshus-quickstart-panel', id: 'dshus-quickstart-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-quickstart-tab-' + active },
        React.createElement('h4', null, entries[active][0]),
        React.createElement('p', null, entries[active][1]))))
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
  var seatColor = seatNormalizeColor(settings.modelSeatColor)
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
          React.createElement('div', { className: 'dshus-setting-tail' },
            // The palette only matters while the advanced selector is enabled,
            // mirroring how the automatic-balance interval follows its switch.
            advancedModelSelect && React.createElement('div', { className: 'dshus-seat-colors', role: 'group', 'aria-label': t('主题色') },
              SEAT_COLOR_CHOICES.map(function (choice) {
                return React.createElement('button', {
                  key: choice.name,
                  type: 'button',
                  className: 'dshus-seat-color',
                  style: { '--dshus-seat-swatch': choice.swatch },
                  'aria-label': t(SEAT_COLOR_LABELS[choice.name]),
                  'aria-pressed': seatColor === choice.name,
                  'data-dshus-tip': t(SEAT_COLOR_LABELS[choice.name]),
                  disabled: !props.ready || saving,
                  onClick: function () { save({ modelSeatColor: choice.name }, '已更新主题色') },
                })
              })),
            switchButton(t('高级模型选择器'), advancedModelSelect, function () {
              save({ advancedModelSelect: !advancedModelSelect }, advancedModelSelect ? '已关闭，已恢复官方模型选择器' : '已开启高级模型选择器')
            }))),
        // Show the refresh interval beside the automatic-balance switch.
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('自动获取剩余余额')),
          React.createElement('div', { className: 'dshus-setting-tail' },
            settings.autoQuota && React.createElement(SelectField, {
              id: 'dshus-auto-interval', variant: 'field', inline: true,
              'aria-label': t('自动获取间隔'),
              value: settings.intervalMinutes,
              disabled: saving || !props.ready,
              options: [[10, t('10 分钟')], [60, t('1 小时')], [300, t('5 小时')], [1440, t('每天')]].map(function (option) { return { value: option[0], name: option[1] } }),
              onChange: function (value) { save({ intervalMinutes: Number(value) }) },
            }),
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
          React.createElement('span', { className: 'dshus-setting-label' }, t('日志')),
          switchButton(t('日志'), settings.showLogs !== false, function () { save({ showLogs: settings.showLogs === false }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('成本')),
          switchButton(t('成本'), settings.showCosts !== false, function () { save({ showCosts: settings.showCosts === false }) })),
        React.createElement('div', { className: 'dshus-setting-row' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('规则')),
          switchButton(t('规则'), settings.showRules !== false, function () { save({ showRules: settings.showRules === false }) })),
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
      function selectProvider(value) {
        manualSelection.current = true; planSequence.current++; setQuoted(null); setError('')
        setSelection({ provider: value, model: '' })
      }
      function selectModel(value) {
        manualSelection.current = true; planSequence.current++; setQuoted(null); setError('')
        setSelection({ provider: provider, model: value })
      }
      function field(label, element) { return React.createElement('label', { className: 'dshus-detection-field' }, React.createElement('span', { className: 'dshus-setting-label' }, t(label)), element) }
      function probability(value) { return Number.isFinite(value) ? (value * 100).toFixed(1) + '%' : '—' }
      function stateBadge() {
        var state = running ? { key: 'running', label: '检测运行中' }
          : job && resultMatchesSetup ? job.status === 'cancelled' ? { key: 'cancelled', label: '已取消' } : job.status === 'failed' ? { key: 'failed', label: '未完成' } : { key: 'complete', label: '检测已结束' }
          : quote ? { key: 'ready', label: '待开始' }
          : selectedReady ? { key: 'confirm', label: '确认预算' }
          : { key: 'setup', label: '待配置' }
        return React.createElement('span', { className: 'dshus-detection-state', 'data-state': state.key, role: 'status' }, t(state.label))
      }
      function engineView() {
        var checking = updating || !!(catalog && catalog.updating)
        return React.createElement('div', { className: 'dshus-detection-engine' },
          React.createElement('div', { className: 'dshus-detection-engine-info' },
            React.createElement('span', { className: 'dshus-detection-engine-label' }, t('参考库')),
            React.createElement('span', { className: 'dshus-detection-engine-version' },
              catalog ? 'lmfpd ' + (catalog.version || '—') + (Number.isFinite(catalog.modelCount) ? ' · ' + t('{count} 个模型', { count: catalog.modelCount }) : '') : '—')),
          React.createElement('button', {
            type: 'button', className: 'dshus-btn dshus-icon-btn dshus-detection-engine-update',
            disabled: checking || running || busy, onClick: updateEngine,
            'aria-label': t(checking ? '正在检查更新…' : '检查更新'), 'data-dshus-tip': t(checking ? '正在检查更新…' : '检查更新'),
          }, checking ? React.createElement('span', { className: 'dshus-spin', 'aria-hidden': true })
            : React.createElement('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
              React.createElement('path', { d: 'M13 8a5 5 0 1 1-1.46-3.54M13 2.5V5H10.5' }))),
          // Update failures are transient and the verified local engine remains
          // usable, so only a fatal engine problem is surfaced in the panel.
          catalog && catalog.warning && catalog.warningKind !== 'update' && React.createElement('p', { className: 'dshus-detection-engine-error', role: 'alert' }, uiError(catalog.warning)))
      }
      function samplesView(results, plan, validSamples) {
        var labels = { scored: '有效', incomplete: '输出截断', unparseable: '格式无效', unavailable: '请求失败', timeout: '超时', cancelled: '已取消', sampling: '采样中', pending: '未采样' }
        var total = plan.requests || 3
        return React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dshus-detection-list-title' },
            React.createElement('h4', null, t('采样状态')),
            React.createElement('span', null, t('有效样本 {valid} / {total}', { valid: validSamples, total: total }))),
          React.createElement('ol', { className: 'dshus-detection-samples', 'aria-label': t('有效样本 {valid} / {total}', { valid: validSamples, total: total }), 'data-count': total }, Array.from({ length: total }, function (_, index) {
            var item = results[index], outcome = item ? item.outcome : running && index === results.length && job.phase !== 'scoring' ? 'sampling' : 'pending'
            var expected = item ? item.expected : plan.numbers && plan.numbers[index]
            var count = (item ? fmtExact(item.valid || 0) : '—') + ' / ' + (expected ? fmtExact(expected) : '—')
            var label = t(labels[outcome] || '未采样')
            return React.createElement('li', {
              key: index, className: 'dshus-detection-sample', 'data-outcome': outcome,
              'data-dshus-tip': t('采样 {number}', { number: index + 1 }) + ' · ' + label + ' · ' + count,
            },
              React.createElement('span', { className: 'dshus-detection-sample-index', 'aria-hidden': true }, index + 1),
              React.createElement('strong', null, label),
              React.createElement('span', { className: 'dshus-detection-sample-count' }, count))
          })))
      }
      function jobView() {
        var historical = !running && !resultMatchesSetup
        var identity = job.identity, candidates = identity && identity.candidates || []
        var summary = job.conclusion || { verdict: running ? 'running' : 'inconclusive', reason: job.status === 'cancelled' ? 'cancelled' : 'unfinished' }
        var titles = { running: '检测运行中', 'candidate-consistent': '首选候选与请求模型一致', 'candidate-different': '首选候选与请求模型不同', 'ranking-only': '候选排序', inconclusive: '无法判定' }
        var explanations = { 'model-not-enrolled': '请求模型不在参考库中，候选仅供比较。', 'merged-class': '参考库将这些型号合并为同一类，无法区分具体型号。', 'low-confidence': '置信度不足，候选仅供比较。', cancelled: '检测已取消，已发生的用量仍会统计。', interrupted: '宿主重启时检测尚未完成，请重新检测。', budget: '已达到 Token 预算，检测未完成。', timeout: '请求超时，检测未完成。', 'request-failed': '通道请求失败，检测未完成。', truncated: '随机数输出被截断；请提高单次输出上限，重新查看预算后检测。', format: '有效随机数不足，已停止后续请求。', distribution: '随机数分布异常，本次结果无法判定。', unfinished: '尚未取得足够指纹数据，无法判定。' }
        // Only reasons that describe what happened to the run get a visible
        // line. Ranking disclaimers stay in the tooltip and details disclosure.
        var actionable = { cancelled: true, interrupted: true, budget: true, timeout: true, 'request-failed': true, truncated: true, format: true, distribution: true, unfinished: true }
        var calibrated = !!(identity && identity.usedSamples === 3 && !identity.unusualDistribution && Number.isFinite(identity.probability))
        var results = job.results || [], plan = job.plan || {}, validSamples = results.filter(function (item) { return item.outcome === 'scored' }).length
        var totalRequests = plan.requests || 3, progress = Math.max(0, Math.min(totalRequests, job.progress || 0))
        var perRequestLimit = plan.maxTokens || plan.maxOutputTokens && plan.requests && plan.maxOutputTokens / plan.requests
        var providerName = providers.find(function (item) { return item.provider === job.selection.provider })
        var usage = job.usage || {}, jobTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0)
        var reason = explanations[summary.reason]
        var lowConfidence = calibrated && identity.probability < .75
        var showReason = reason && actionable[summary.reason] && !(running && summary.reason === 'unfinished')
        return React.createElement('section', { className: 'dshus-module dshus-detection-result', role: 'region', 'aria-label': t('检测结果'), ref: resultRef },
          React.createElement('div', { className: 'dshus-detection-result-head' },
            React.createElement('h3', { 'data-dshus-tip': historical ? t('历史结果，仅对应下方列出的模型和参数。') : undefined }, t(historical ? '上次检测结果' : '检测结果')),
            React.createElement('span', { className: 'dshus-detection-verdict', 'data-verdict': summary.verdict, role: 'status', 'data-dshus-tip': reason ? t(reason) : undefined }, t(titles[summary.verdict] || '无法判定'))),
          React.createElement('p', { className: 'dshus-detection-subject' }, job.selection.model, ' · ', providerName ? providerName.name : job.selection.provider),
          showReason && React.createElement('p', { className: 'dshus-detection-reason', 'data-tone': summary.reason === 'cancelled' ? 'muted' : 'warn' }, t(reason)),
          candidates.length > 0 && React.createElement('div', { className: 'dshus-detection-headline' },
            React.createElement('div', { className: 'dshus-detection-candidate' },
              React.createElement('span', { className: 'dshus-detection-kicker' }, t('首选候选')),
              React.createElement('h4', { 'aria-label': t('首选候选') }, candidates[0].name),
              candidates[0].family && React.createElement('span', { className: 'dshus-detection-family' }, candidates[0].family)),
            calibrated && React.createElement('div', { className: 'dshus-detection-confidence', 'data-low': lowConfidence || undefined },
              React.createElement('span', null, t('库内置信度')),
              React.createElement('strong', null, probability(identity.probability)),
              lowConfidence && React.createElement('span', { className: 'dshus-detection-confidence-tag' }, t('低置信度')))),
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
          job.usageReported && React.createElement('p', { className: 'dshus-detection-cost', 'data-dshus-tip': fmtExact(jobTokens) }, t(job.usageSaved ? '本次消耗 {tokens} Token · 已计入统计' : '本次已上报消耗 {tokens} Token', { tokens: fmt(jobTokens) })),
          job.usageIncomplete && React.createElement('p', { className: 'dshus-detection-cost-alert', role: 'status' }, t('部分检测用量尚未上报，可能已产生费用。')),
          job.message && React.createElement('p', { className: 'dshus-detection-message', role: 'alert' }, uiError(job.message)),
          React.createElement('details', { className: 'dshus-disclosure', key: job.id },
            React.createElement('summary', null, t('检测详情')),
            reason && !running && React.createElement('p', null, t(reason)),
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
        React.createElement('div', { className: 'dshus-detection-layout' },
          React.createElement('section', { className: 'dshus-module dshus-detection-setup', 'aria-labelledby': 'dshus-detection-setup-heading' },
            React.createElement('div', { className: 'dshus-detection-card-head' },
              React.createElement('h3', { id: 'dshus-detection-setup-heading' }, t('模型检测')),
              stateBadge()),
            React.createElement('div', { className: 'dshus-detection-form' },
              field('检测供应商', React.createElement(SelectField, {
                id: 'dshus-detection-provider', variant: 'field', block: true,
                'aria-label': t('检测供应商'),
                value: provider,
                disabled: busy || running || providersLoading,
                options: [{ value: '', name: t(providersLoading ? '正在加载供应商…' : providers.length ? '选择已有供应商' : '没有已配置的供应商') }]
                  .concat(providers.map(function (item) { return { value: item.provider, name: item.name } })),
                onChange: selectProvider,
              })),
              field('检测模型', React.createElement(SelectField, {
                id: 'dshus-detection-model', variant: 'field', block: true,
                'aria-label': t('检测模型'),
                value: model,
                disabled: busy || running || modelsLoading || !provider,
                options: [{ value: '', name: t(modelsLoading ? '正在加载模型…' : models.length ? '选择检测模型' : '没有可用模型') }]
                  .concat(models.map(function (item) { return { value: item.id, name: item.name } })),
                onChange: selectModel,
              }))),
            React.createElement('div', { className: 'dshus-detection-form dshus-detection-limits' },
              field('采样次数', React.createElement(SelectField, {
                id: 'dshus-detection-samples', variant: 'field', block: true,
                'aria-label': t('采样次数'),
                value: count,
                disabled: busy || running,
                options: [{ value: 3, name: t('标准检测（3 次）') }, { value: 1, name: t('低耗初筛（1 次，仅排序）') }],
                onChange: function (value) { setCount(Number(value)) },
              })),
              field('单次输出上限', React.createElement('input', { id: 'dshus-detection-output-limit', type: 'number', className: 'dshus-field', min: 1024, max: 16384, step: 1, value: maxTokens, disabled: busy || running, onChange: function (event) { setMaxTokens(Number(event.target.value)) } })),
              field('Token 预算', React.createElement('input', { id: 'dshus-detection-budget', type: 'number', className: 'dshus-field', min: 1024, max: 50000, step: 1, value: budget, disabled: busy || running, onChange: function (event) { setBudget(Number(event.target.value)) } }))),
            error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
            !quote && !running && React.createElement('div', { className: 'dshus-detection-actions' },
              React.createElement('button', { type: 'button', className: 'dshus-btn dshus-btn-primary dshus-detection-primary', onClick: preview, disabled: busy || running || !selectedReady || !catalog }, t(busy ? '正在处理…' : '查看检测预算'))),
            quote && !running && React.createElement('div', { className: 'dshus-detection-quote', role: 'status' },
              React.createElement('span', { className: 'dshus-detection-quote-title' }, t('检测预算')),
              React.createElement('dl', { className: 'dshus-detection-quote-metrics' },
                [['请求次数', quote.plan.requests], ['Token 预算', quote.plan.budgetTokens], ['输入预估', quote.plan.estimatedInputTokens], ['输出上限', quote.plan.maxOutputTokens]].map(function (entry) {
                  return React.createElement('div', { key: entry[0] },
                    React.createElement('dt', null, t(entry[0])),
                    React.createElement('dd', null, Number.isFinite(Number(entry[1])) ? fmtExact(Number(entry[1])) : '—'))
                })),
              React.createElement('button', { type: 'button', className: 'dshus-btn dshus-btn-primary dshus-detection-primary', onClick: start, disabled: busy || !quote }, t('开始检测（会消耗 Token）')),
              React.createElement('details', { className: 'dshus-detection-quote-details', key: quote.id },
                React.createElement('summary', null, t('本次检测参数')),
                fields(quote.testSelection),
                React.createElement('p', null, t('每次最多 {maxTokens} Token · 所有请求输出最多 {maxOutputTokens} Token', { maxTokens: fmtExact(quote.plan.maxTokens), maxOutputTokens: fmtExact(quote.plan.maxOutputTokens) })))),
            engineView()),
          job ? jobView() : React.createElement('section', { className: 'dshus-module dshus-detection-result dshus-detection-empty', role: 'region', 'aria-label': t('检测结果') },
            React.createElement('div', { className: 'dshus-detection-result-head' }, React.createElement('h3', null, t('检测结果'))),
            React.createElement('div', { className: 'dshus-detection-empty-body' },
              React.createElement('div', { className: 'dshus-detection-empty-mark', 'aria-hidden': true },
                React.createElement('svg', { viewBox: '0 0 48 48', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' },
                  React.createElement('path', { d: 'M8 24h6M34 24h6M24 8v6M24 34v6' }),
                  React.createElement('circle', { cx: 24, cy: 24, r: 10 }),
                  React.createElement('circle', { cx: 24, cy: 24, r: 2, fill: 'currentColor', stroke: 'none' }))),
              React.createElement('p', { className: 'dshus-detection-empty-title' }, t('尚未检测本模型'))))))
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
          React.createElement('span', { 'data-dshus-tip': t('平均首 Token 耗时') }, 'TTFT (s)')),
        speeds.length ? React.createElement('ol', { className: 'dshus-speed-list' }, visible.map(function (item, index) {
          var tps = item.tokensPerSecond >= 10 ? String(Math.round(item.tokensPerSecond)) : String(Math.round(item.tokensPerSecond * 10) / 10)
          var ttft = Number.isFinite(item.averageTtftMs) && item.averageTtftMs >= 0 ? (item.averageTtftMs / 1000).toFixed(1) : '—'
          return React.createElement('li', { key: item.key, className: 'dshus-speed-row', 'data-model-key': item.key },
            React.createElement('span', { className: 'dshus-speed-rank', 'aria-hidden': true }, index + 1),
            React.createElement('div', { className: 'dshus-speed-model' }, item.model,
              React.createElement('div', { className: 'dshus-speed-meta' }, item.provider)),
            React.createElement('div', { className: 'dshus-speed-value', 'aria-label': 'TPS: ' + tps + ' tok/s', 'data-dshus-tip': t('{tokens} 个输出 Token · {seconds} 秒', { tokens: fmtExact(item.outputTokens), seconds: (item.outputMs / 1000).toFixed(3) }) }, tps),
            React.createElement('div', { className: 'dshus-speed-value', 'aria-label': 'TTFT: ' + ttft + (ttft === '—' ? '' : ' s'), 'data-dshus-tip': t(ttft === '—' ? '暂无 TTFT 数据' : '平均首 Token 耗时') }, ttft))
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
          React.createElement('dd', { 'data-dshus-tip': entry[2], className: index === 5 ? 'dshus-favorite-model' : undefined }, entry[1]))
      }))
    }

function logTableHead() {
      return React.createElement('thead', null,
        React.createElement('tr', null,
          ['时间', '应用', '供应商', '模型', '成本', '新增输入', '输出', '缓存命中', '速度', '首字'].map(function (label) {
            return React.createElement('th', { key: label }, t(label))
          }),
        ),
      )
    }

function logRowElement(row, index) {
      var title = row.detection ? t('模型检测') : (row.title || '—')
      var speed = typeof row.tokensPerSecond === 'number' && row.tokensPerSecond > 0 ? '≈' + row.tokensPerSecond.toFixed(1) + ' tok/s' : '—'
      var ttft = typeof row.ttftMs === 'number' ? '≈' + (row.ttftMs / 1000).toFixed(1) + 's' : '—'
      var numCell = function (value, key) {
        return React.createElement('td', { key: key, className: 'dshus-log-num', 'data-dshus-tip': fmtExact(value) }, fmt(value))
      }
      return React.createElement('tr', { key: String(row.time) + '-' + index },
        React.createElement('td', { className: 'dshus-log-time' }, fmtInTz(row.time, LOCAL_TZ)),
        React.createElement('td', { className: 'dshus-log-app', 'data-dshus-tip': title }, title),
        React.createElement('td', null, row.provider),
        React.createElement('td', { className: 'dshus-log-model', 'data-dshus-tip': row.rawModel || row.model }, row.model),
        React.createElement('td', { className: 'dshus-log-num dshus-log-cost' }, fmtCost(row.cost)),
        numCell(row.inputTokens, 'in'),
        numCell(row.outputTokens, 'out'),
        numCell(row.cacheReadTokens, 'cache'),
        React.createElement('td', { className: 'dshus-log-num' }, speed),
        React.createElement('td', { className: 'dshus-log-num' }, ttft),
      )
    }

function LogsPanel(props) {
      useLocaleRevision()
      var api = props.api
      var active = props.active === true
      var providerState = React.useState('')
      var provider = providerState[0], setProvider = providerState[1]
      var modelState = React.useState('')
      var model = modelState[0], setModel = modelState[1]
      var pageState = React.useState(1)
      var page = pageState[0], setPage = pageState[1]
      var pageSizeState = React.useState(10)
      var pageSize = pageSizeState[0], setPageSize = pageSizeState[1]
      var dataState = React.useState(null)
      var data = dataState[0], setData = dataState[1]
      var loadingState = React.useState(false)
      var loading = loadingState[0], setLoading = loadingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      var requestRef = React.useRef(0)

      function load(fresh, nextPage, nextProvider, nextModel, nextPageSize) {
        var request = ++requestRef.current
        setLoading(true)
        setError('')
        api.logs({ provider: nextProvider, model: nextModel, page: nextPage, pageSize: nextPageSize, fresh: fresh })
          .then(function (body) {
            if (request !== requestRef.current) return
            setData(body)
            setLoading(false)
          })
          .catch(function (err) {
            if (request !== requestRef.current) return
            setError(String(err && err.message || err))
            setLoading(false)
          })
      }
      React.useEffect(function () {
        if (!active) return
        load(false, page, provider, model, pageSize)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [active, page, provider, model, pageSize])

      var providers = (data && data.providers) || []
      var models = (data && data.models) || []
      var rows = (data && data.rows) || []
      var pages = (data && data.pages) || 1
      var currentPage = (data && data.page) || page
      var rowEls = rows.map(logRowElement)

      return React.createElement('div', { className: 'dshus-module dshus-logs-module' },
        React.createElement('div', { className: 'dshus-logs-toolbar' },
          React.createElement(SelectField, {
            id: 'dshus-logs-provider', variant: 'field',
            'aria-label': t('供应商'),
            value: provider,
            options: [{ value: '', name: t('全部供应商') }].concat(providers.map(function (name) { return { value: name, name: name } })),
            onChange: function (value) { setPage(1); setProvider(value) },
          }),
          React.createElement(SelectField, {
            id: 'dshus-logs-model', variant: 'field',
            'aria-label': t('模型'),
            value: model,
            options: [{ value: '', name: t('全部模型') }].concat(models.map(function (name) { return { value: name, name: name } })),
            onChange: function (value) { setPage(1); setModel(value) },
          }),
          React.createElement(SelectField, {
            id: 'dshus-logs-page-size', variant: 'field',
            'aria-label': t('每页行数'),
            value: pageSize,
            options: [10, 20, 50, 100].map(function (size) { return { value: size, name: t('{count} 条/页', { count: size }) } }),
            onChange: function (value) { setPage(1); setPageSize(Number(value)) },
          }),
          React.createElement('span', { className: 'dshus-muted' }, t('共 {count} 条', { count: data ? data.total : 0 })),
          refreshIconButton(function () { load(true, page, provider, model, pageSize) }, loading, t('刷新请求日志'), true),
        ),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        React.createElement('div', { className: 'dshus-table-wrap' },
          React.createElement('table', { className: 'dshus-table dshus-logs-table' },
            logTableHead(),
            React.createElement('tbody', null,
              rowEls.length > 0 ? rowEls : data && React.createElement('tr', null,
                React.createElement('td', { colSpan: 10, style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', padding: '16px 0' } }, t('暂无请求记录')),
              ),
            ),
          ),
        ),
        pages > 1 && React.createElement('div', { className: 'dshus-pager' },
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: currentPage <= 1 || loading, onClick: function () { setPage(currentPage - 1) } }, t('上一页')),
          React.createElement('span', { className: 'dshus-muted' }, t('第 {page} / {pages} 页', { page: currentPage, pages: pages })),
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: currentPage >= pages || loading, onClick: function () { setPage(currentPage + 1) } }, t('下一页')),
        ),
      )
    }

/* ------------------------------------------------------------------ */
/* Sidebar dashboard                                                   */
/* ------------------------------------------------------------------ */

var dashboardOpen = false
var dashboardListeners = new Set()

function setDashboardOpen(open) {
      if (dashboardOpen === open) return
      dashboardOpen = open
      dashboardListeners.forEach(function (listener) { listener(open) })
    }

function useDashboardOpen() {
      var state = React.useState(dashboardOpen)
      React.useEffect(function () {
        var listener = function (value) { state[1](value) }
        dashboardListeners.add(listener)
        return function () { dashboardListeners.delete(listener) }
      }, [])
      return state[0]
    }

function usageChartIcon(size) {
      return React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        React.createElement('path', { d: 'M4 20h16M7 20v-8M12 20V5M17 20v-5' }))
    }

function UsageDashboardTrigger(props) {
      useLocaleRevision()
      var open = useDashboardOpen()
      var wide = props.wide !== false
      return React.createElement('button', {
        type: 'button',
        className: 'dshus-footer-action' + (wide ? '' : ' dshus-footer-action-rail'),
        onClick: function () { setDashboardOpen(true) },
        'data-dshus-tip': t('用量统计'),
        'aria-label': t('用量统计'),
        'aria-haspopup': 'dialog',
        'aria-expanded': open ? 'true' : undefined,
      },
        usageChartIcon(wide ? 16 : 18),
        wide && React.createElement('span', { className: 'dshus-footer-action-label' }, t('用量统计')),
      )
    }

function dashboardSyncLabel(syncedAt) {
      if (!syncedAt) return ''
      var age = Date.now() - Number(syncedAt)
      return age >= 0 && age < 60000 ? t('刚刚同步') : t('同步于 {time}', { time: fmtFetched(syncedAt) })
    }

var DASHBOARD_RANGES = [
      ['today', '当天'],
      ['24h', '近 24 小时'],
      ['7d', '近 7 天'],
      ['14d', '近 14 天'],
      ['30d', '近 30 天'],
      ['all', '全部'],
    ]

var DASHBOARD_WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function dashboardPad(value) {
      return String(value).padStart(2, '0')
    }

function dashboardStartOfDay(time) {
      var date = new Date(time)
      date.setHours(0, 0, 0, 0)
      return date.getTime()
    }

function dashboardRange(preset, now) {
      var end = typeof now === 'number' ? now : Date.now()
      if (preset === 'all') return { preset: 'all', from: 0, to: 0 }
      if (preset === '24h') return { preset: preset, from: end - 86400000, to: end }
      var days = preset === '7d' ? 7 : preset === '14d' ? 14 : preset === '30d' ? 30 : 1
      var start = new Date(dashboardStartOfDay(end))
      start.setDate(start.getDate() - (days - 1))
      return { preset: preset, from: start.getTime(), to: end }
    }

/**
 * The window actually queried. A preset means "up to now", so it is re-derived
 * on every request — otherwise a refresh keeps the end frozen at the moment the
 * preset was picked and hides every request made since. Only a custom range has
 * a user-pinned end, and even that follows the clock when asked to.
 */
function dashboardLiveRange(range) {
      if (range.preset === 'all' || range.preset === 'custom') {
        return range.preset === 'custom' && range.follow ? Object.assign({}, range, { to: Date.now() }) : range
      }
      return dashboardRange(range.preset)
    }

function dashboardDateValue(ms) {
      var date = new Date(ms)
      return date.getFullYear() + '-' + dashboardPad(date.getMonth() + 1) + '-' + dashboardPad(date.getDate())
    }

function dashboardTimeValue(ms) {
      var date = new Date(ms)
      return dashboardPad(date.getHours()) + ':' + dashboardPad(date.getMinutes())
    }

function dashboardRangeShort(ms) {
      var date = new Date(ms)
      return dashboardPad(date.getMonth() + 1) + '/' + dashboardPad(date.getDate()) + ' ' + dashboardTimeValue(ms)
    }

function dashboardRangeLabel(range) {
      if (range.preset !== 'custom') {
        for (var i = 0; i < DASHBOARD_RANGES.length; i++) {
          if (DASHBOARD_RANGES[i][0] === range.preset) return t(DASHBOARD_RANGES[i][1])
        }
      }
      return dashboardRangeShort(range.from) + ' — ' + dashboardRangeShort(range.to)
    }

function dashboardCombine(dateValue, timeValue) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))) return NaN
      var date = String(dateValue).split('-'), time = String(timeValue || '00:00').split(':')
      var combined = new Date(Number(date[0]), Number(date[1]) - 1, Number(date[2]), Number(time[0]) || 0, Number(time[1]) || 0, 0, 0)
      return combined.getTime()
    }

function dashboardDaySpan(from, to) {
      return Math.max(1, Math.round((dashboardStartOfDay(to) - dashboardStartOfDay(from)) / 86400000) + 1)
    }

function dashboardCalendarCells(year, month) {
      var first = new Date(year, month, 1)
      var start = new Date(year, month, 1 - first.getDay())
      var cells = []
      for (var index = 0; index < 42; index++) {
        var date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
        cells.push({ key: dashboardDateValue(date.getTime()), date: dashboardDateValue(date.getTime()), day: date.getDate(), current: date.getMonth() === month })
      }
      return cells
    }

function calendarIcon(size) {
      return React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        React.createElement('rect', { x: 3, y: 5, width: 18, height: 16, rx: 3 }),
        React.createElement('path', { d: 'M8 3v4M16 3v4M3 10h18' }))
    }

function chevronDownIcon(size) {
      return React.createElement('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        React.createElement('path', { d: 'M6 9l6 6 6-6' }))
    }

var COST_RANGES = [
      ['today', '当天'],
      ['7d', '近 7 天'],
      ['14d', '近 14 天'],
      ['30d', '近 30 天'],
      ['month', '本月'],
    ]

function costPresetRange(preset) {
      var now = new Date()
      var to = dashboardDateValue(now.getTime())
      if (preset === 'month') {
        return { preset: 'month', from: dashboardDateValue(new Date(now.getFullYear(), now.getMonth(), 1).getTime()), to: to }
      }
      var days = preset === '7d' ? 7 : preset === '14d' ? 14 : preset === '30d' ? 30 : 1
      var start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
      return { preset: preset, from: dashboardDateValue(start.getTime()), to: to }
    }

/**
 * The window actually queried. A cost preset means "up to today", but the range
 * state is only rebuilt when the picker changes — so a panel first opened
 * before midnight, or before the 1st of a new month, keeps excluding every
 * later day. Only a custom range has a user-pinned end.
 */
function costLiveRange(range) {
      return range.preset === 'custom' ? range : costPresetRange(range.preset)
    }

function dayRangeShort(day) {
      return String(day).slice(5, 7) + '/' + String(day).slice(8, 10)
    }

function costRangeLabel(range) {
      for (var i = 0; i < COST_RANGES.length; i++) {
        if (COST_RANGES[i][0] === range.preset) return t(COST_RANGES[i][1])
      }
      return dayRangeShort(range.from) + ' — ' + dayRangeShort(range.to)
    }

function dayRangeSummary(from, to) {
      var span = dashboardDaySpan(dashboardCombine(from, '00:00'), dashboardCombine(to, '00:00'))
      return dayRangeShort(from) + ' — ' + dayRangeShort(to) + ' · ' + t('{days} 天', { days: span })
    }

/** Day-granularity range picker, matching the sidebar dashboard's picker. */
function DayRangePicker(props) {
      var value = props.value
      var idPrefix = props.idPrefix || 'dshus-day-range'
      var openState = React.useState(false)
      var open = openState[0], setOpen = openState[1]
      var draftState = React.useState(null)
      var draft = draftState[0], setDraft = draftState[1]
      var rootRef = React.useRef(null)

      function startDraft(preset, from, to) {
        var startDate = new Date(dashboardCombine(from, '00:00'))
        return { preset: preset, dateFrom: from, dateTo: to, active: 'from', year: startDate.getFullYear(), month: startDate.getMonth() }
      }
      function openPicker() {
        setDraft(startDraft(value.preset, value.from, value.to))
        setOpen(true)
      }
      function choosePreset(preset) {
        var next = costPresetRange(preset)
        setDraft(startDraft(preset, next.from, next.to))
      }
      function editDate(field, next) {
        setDraft(function (previous) {
          if (!previous) return previous
          var updated = Object.assign({}, previous, { preset: 'custom', active: field })
          if (field === 'from') updated.dateFrom = next
          else updated.dateTo = next
          var parts = String(next).split('-')
          if (parts.length === 3) { updated.year = Number(parts[0]); updated.month = Number(parts[1]) - 1 }
          return updated
        })
      }
      function pickDay(day) {
        setDraft(function (previous) {
          if (!previous) return previous
          var updated = Object.assign({}, previous, { preset: 'custom' })
          if (previous.active === 'to') updated.dateTo = day
          else updated.dateFrom = day
          var parts = day.split('-')
          updated.year = Number(parts[0]); updated.month = Number(parts[1]) - 1
          return updated
        })
      }
      function activateField(field) {
        setDraft(function (previous) {
          if (!previous) return previous
          return Object.assign({}, previous, { active: field })
        })
      }
      function shiftMonth(delta) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = new Date(previous.year, previous.month + delta, 1)
          return Object.assign({}, previous, { year: next.getFullYear(), month: next.getMonth() })
        })
      }
      function confirm() {
        if (!draft) return
        var from = String(draft.dateFrom || ''), to = String(draft.dateTo || '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return
        if (from > to) { var swap = from; from = to; to = swap }
        setOpen(false)
        props.onChange({ preset: draft.preset === 'custom' ? 'custom' : draft.preset, from: from, to: to })
      }
      React.useEffect(function () {
        if (!open) return
        function onPointerDown(event) {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
        }
        function onKeyDown(event) {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return function () {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      var cells = draft ? dashboardCalendarCells(draft.year, draft.month) : []
      var selectedDay = draft ? (draft.active === 'to' ? draft.dateTo : draft.dateFrom) : ''
      var validDraft = draft && /^\d{4}-\d{2}-\d{2}$/.test(String(draft.dateFrom)) && /^\d{4}-\d{2}-\d{2}$/.test(String(draft.dateTo))
      var summary = validDraft ? dayRangeSummary(draft.dateFrom, draft.dateTo) : ''

      return React.createElement('div', { className: 'dshus-range-wrap', ref: rootRef },
        React.createElement('button', {
          type: 'button', className: 'dshus-range-trigger', id: props.id,
          onClick: function () { if (open) setOpen(false); else openPicker() },
          'aria-haspopup': 'dialog', 'aria-expanded': open ? 'true' : undefined,
        }, calendarIcon(15), React.createElement('span', null, costRangeLabel(value)), chevronDownIcon(14)),
        open && draft && React.createElement('div', { className: 'dshus-range-popover', role: 'dialog', 'aria-label': t('时间范围') },
          React.createElement('div', { className: 'dshus-range-presets' }, COST_RANGES.map(function (option) {
            return React.createElement('button', {
              type: 'button', key: option[0], className: 'dshus-range-preset',
              'data-active': draft.preset === option[0] ? '' : undefined,
              onClick: function () { choosePreset(option[0]) },
            }, t(option[1]))
          })),
          React.createElement('div', { className: 'dshus-range-body' },
            React.createElement('div', { className: 'dshus-range-fields' },
              React.createElement('p', { className: 'dshus-range-hint' }, t('选择起止日期，包含当天')),
              React.createElement('div', {
                className: 'dshus-range-field', 'data-active': draft.active === 'from' ? '' : undefined,
                onClick: function () { activateField('from') },
              },
                React.createElement('span', { className: 'dshus-range-label' }, t('开始日期')),
                React.createElement('div', { className: 'dshus-range-inputs' },
                  React.createElement('input', {
                    id: idPrefix + '-from', type: 'date', className: 'dshus-field dshus-range-date', value: draft.dateFrom, 'aria-label': t('开始日期'),
                    onChange: function (event) { editDate('from', event.target.value) },
                  }))),
              React.createElement('div', {
                className: 'dshus-range-field', 'data-active': draft.active === 'to' ? '' : undefined,
                onClick: function () { activateField('to') },
              },
                React.createElement('span', { className: 'dshus-range-label' }, t('结束日期')),
                React.createElement('div', { className: 'dshus-range-inputs' },
                  React.createElement('input', {
                    id: idPrefix + '-to', type: 'date', className: 'dshus-field dshus-range-date', value: draft.dateTo, 'aria-label': t('结束日期'),
                    onChange: function (event) { editDate('to', event.target.value) },
                  })))),
            React.createElement('div', { className: 'dshus-range-calendar' },
              React.createElement('div', { className: 'dshus-range-cal-head' },
                React.createElement('button', { type: 'button', className: 'dshus-range-cal-nav', onClick: function () { shiftMonth(-1) }, 'aria-label': t('上一页') }, '‹'),
                React.createElement('span', { className: 'dshus-range-cal-title' }, t('{year}年{month}月', { year: draft.year, month: draft.month + 1 })),
                React.createElement('button', { type: 'button', className: 'dshus-range-cal-nav', onClick: function () { shiftMonth(1) }, 'aria-label': t('下一页') }, '›')),
              React.createElement('div', { className: 'dshus-range-cal-week' }, ['日', '一', '二', '三', '四', '五', '六'].map(function (label) {
                return React.createElement('span', { key: label }, t(label))
              })),
              React.createElement('div', { className: 'dshus-range-cal-grid' }, cells.map(function (cell) {
                return React.createElement('button', {
                  type: 'button', key: cell.key, className: 'dshus-range-cal-day',
                  'data-muted': cell.current ? undefined : '', 'data-selected': selectedDay === cell.date ? '' : undefined,
                  onClick: function () { pickDay(cell.date) },
                }, cell.day)
              })))),
          React.createElement('div', { className: 'dshus-range-foot' },
            React.createElement('span', { className: 'dshus-range-summary' }, summary),
            React.createElement('div', { className: 'dshus-range-actions' },
              React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: function () { setOpen(false) } }, t('取消')),
              React.createElement('button', { type: 'button', className: 'dshus-btn dshus-btn-primary', onClick: confirm }, t('确定'))))))
    }

function dashboardMetricValue(point, metric) {
      if (metric === 'calls') return Number(point.calls) || 0
      if (metric === 'billed') return Number(point.billed) || 0
      if (metric === 'cache') return typeof point.cacheHitRate === 'number' ? point.cacheHitRate * 100 : null
      return Number(point.cost) || 0
    }

function dashboardMetricText(point, metric) {
      var value = dashboardMetricValue(point, metric)
      if (value === null) return '—'
      if (metric === 'calls') return fmtExact(value)
      if (metric === 'billed') return fmt(value) + ' Token'
      if (metric === 'cache') return value.toFixed(1) + '%'
      return fmtCost(value)
    }

function dashboardNiceMax(value) {
      if (!(value > 0)) return 0
      var base = Math.pow(10, Math.floor(Math.log10(value))), fraction = value / base
      var steps = [1, 2, 2.5, 3, 4, 5, 6, 8, 10]
      for (var index = 0; index < steps.length; index++) if (fraction <= steps[index]) return steps[index] * base
      return 10 * base
    }

function dashboardSeriesLabel(point, granularity) {
      if (granularity === 'hour') return dashboardPad(new Date(Number(point.key)).getHours()) + ':00'
      if (granularity === 'month') return point.key
      return point.key.slice(5)
    }

/** Full bucket label for the hover card; the axis keeps the short one. */
function dashboardTipName(point, granularity) {
      var date = granularity === 'hour' ? new Date(Number(point.key))
        : granularity === 'month' ? new Date(point.key + '-01T00:00:00')
          : new Date(point.key + 'T00:00:00')
      var label = granularity === 'month'
        ? t('{year}年{month}月', { year: date.getFullYear(), month: date.getMonth() + 1 })
        : t('{year}年{month}月{day}日', { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
      if (granularity !== 'hour') return label
      var hour = dashboardPad(date.getHours())
      return label + ' · ' + hour + ':00–' + hour + ':59'
    }

/**
 * A point's models, folded to one row per model and ordered by the metric the
 * chart is drawing. Folding matches the usage page's default "by model" view:
 * the same model served by two providers would otherwise produce two rows of
 * the same colour, since colour keys off the model name.
 */
function dashboardPointModels(point, metric) {
      var source = (point && point.models) || []
      var merged = []
      var index = Object.create(null)
      for (var i = 0; i < source.length; i++) {
        var entry = source[i]
        var id = sharedNormModelKey(entry.model || entry.key)
        if (index[id] === undefined) {
          index[id] = merged.length
          merged.push({ key: 'by-model:' + id, provider: '', model: sharedModelDisplayName(entry.model || entry.key),
            cost: 0, billed: 0, calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
        }
        var row = merged[index[id]]
        row.cost += entry.cost || 0
        row.billed += entry.billed || 0
        row.calls += entry.calls || 0
        row.inputTokens += entry.inputTokens || 0
        row.cacheReadTokens += entry.cacheReadTokens || 0
        row.cacheWriteTokens += entry.cacheWriteTokens || 0
      }
      for (var m = 0; m < merged.length; m++) {
        var base = merged[m].inputTokens + merged[m].cacheReadTokens + merged[m].cacheWriteTokens
        merged[m].cacheHitRate = base > 0 ? merged[m].cacheReadTokens / base : null
      }
      return merged.sort(function (a, b) {
        return (dashboardMetricValue(b, metric) || 0) - (dashboardMetricValue(a, metric) || 0)
      })
    }

function dashboardCacheFloor(series) {
      var min = null
      for (var index = 0; index < series.length; index++) {
        var rate = series[index].cacheHitRate
        if (typeof rate !== 'number') continue
        if (min === null || rate < min) min = rate
      }
      if (min === null) return 0
      var pct = min * 100
      if (pct >= 90) return 90
      if (pct >= 75) return 75
      if (pct >= 50) return 50
      return 0
    }

function UsageDashboard(props) {
      useLocaleRevision()
      var api = props.api
      var open = useDashboardOpen()
      var dialogRef = React.useRef(null)
      var rangeAnchorRef = React.useRef(null)
      var rangeState = React.useState(function () { return dashboardRange('today') })
      var range = rangeState[0], setRange = rangeState[1]
      var rangeOpenState = React.useState(false)
      var rangeOpen = rangeOpenState[0], setRangeOpen = rangeOpenState[1]
      var draftState = React.useState(null)
      var draft = draftState[0], setDraft = draftState[1]
      var metricState = React.useState('cost')
      var metric = metricState[0], setMetric = metricState[1]
      var providerState = React.useState('')
      var provider = providerState[0], setProvider = providerState[1]
      var modelState = React.useState('')
      var model = modelState[0], setModel = modelState[1]
      var pageState = React.useState(1)
      var page = pageState[0], setPage = pageState[1]
      var pageSizeState = React.useState(10)
      var pageSize = pageSizeState[0], setPageSize = pageSizeState[1]
      var dataState = React.useState(null)
      var data = dataState[0], setData = dataState[1]
      var loadingState = React.useState(false)
      var loading = loadingState[0], setLoading = loadingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      var dashTipState = React.useState(null)
      var dashTip = dashTipState[0], setDashTip = dashTipState[1]
      var requestRef = React.useRef(0)

      function load(fresh) {
        var request = ++requestRef.current
        var live = dashboardLiveRange(range)
        setLoading(true)
        setError('')
        api.dashboard({
          all: live.preset === 'all',
          from: live.preset === 'all' ? 0 : live.from,
          to: live.preset === 'all' ? 0 : live.to,
          provider: provider, model: model, page: page, pageSize: pageSize, fresh: fresh,
        })
          .then(function (body) {
            if (request !== requestRef.current) return
            setData(body)
            setLoading(false)
          })
          .catch(function (err) {
            if (request !== requestRef.current) return
            setError(String(err && err.message || err))
            setLoading(false)
          })
      }

      React.useEffect(function () {
        if (!open) return
        load(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [open, range.preset, range.from, range.to, provider, model, page, pageSize])

      React.useEffect(function () {
        var dialog = dialogRef.current
        if (!dialog) return
        if (open && !dialog.open) {
          if (typeof dialog.showModal === 'function') dialog.showModal()
          else dialog.setAttribute('open', '')
        } else if (!open && dialog.open) dialog.close()
      }, [open])

      if (!open) return null

      function openPicker() {
        var now = Date.now()
        var base = range.preset === 'all'
          ? { preset: 'all', from: (data && data.earliest) || dashboardStartOfDay(now), to: now }
          : range.preset === 'custom' ? range : dashboardRange(range.preset, now)
        var start = base.from || dashboardStartOfDay(now), end = base.to || now
        var startDate = new Date(start)
        setDraft({
          preset: base.preset,
          dateFrom: dashboardDateValue(start), timeFrom: dashboardTimeValue(start),
          dateTo: dashboardDateValue(end), timeTo: dashboardTimeValue(end),
          follow: false, active: 'from', year: startDate.getFullYear(), month: startDate.getMonth(),
        })
        setRangeOpen(true)
      }

      function choosePreset(preset) {
        var now = Date.now()
        var next = preset === 'all'
          ? { from: (data && data.earliest) || dashboardStartOfDay(now), to: now }
          : dashboardRange(preset, now)
        var startDate = new Date(next.from)
        setDraft({
          preset: preset,
          dateFrom: dashboardDateValue(next.from), timeFrom: dashboardTimeValue(next.from),
          dateTo: dashboardDateValue(next.to), timeTo: dashboardTimeValue(next.to),
          follow: false, active: 'from', year: startDate.getFullYear(), month: startDate.getMonth(),
        })
      }

      function activateField(field) {
        setDraft(function (previous) {
          if (!previous) return previous
          var parts = String(field === 'from' ? previous.dateFrom : previous.dateTo).split('-')
          return Object.assign({}, previous, {
            active: field,
            year: parts.length === 3 ? Number(parts[0]) : previous.year,
            month: parts.length === 3 ? Number(parts[1]) - 1 : previous.month,
          })
        })
      }

      function editDate(field, value) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = Object.assign({}, previous, { preset: 'custom', active: field })
          if (field === 'from') next.dateFrom = value
          else next.dateTo = value
          var parts = value.split('-')
          if (parts.length === 3) { next.year = Number(parts[0]); next.month = Number(parts[1]) - 1 }
          return next
        })
      }

      function editTime(field, value) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = Object.assign({}, previous, { preset: 'custom', active: field })
          if (field === 'from') next.timeFrom = value
          else next.timeTo = value
          return next
        })
      }

      function toggleFollow(checked) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = Object.assign({}, previous, { follow: checked })
          if (checked) {
            var now = Date.now()
            next.dateTo = dashboardDateValue(now)
            next.timeTo = dashboardTimeValue(now)
            next.active = 'from'
          }
          return next
        })
      }

      function pickDay(value) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = Object.assign({}, previous, { preset: 'custom' })
          if (previous.active === 'to') next.dateTo = value
          else next.dateFrom = value
          var parts = value.split('-')
          next.year = Number(parts[0]); next.month = Number(parts[1]) - 1
          return next
        })
      }

      function shiftMonth(delta) {
        setDraft(function (previous) {
          if (!previous) return previous
          var next = new Date(previous.year, previous.month + delta, 1)
          return Object.assign({}, previous, { year: next.getFullYear(), month: next.getMonth() })
        })
      }

      function confirmRange() {
        if (!draft) return
        if (draft.preset === 'all') {
          setRange({ preset: 'all', from: 0, to: 0 })
          setRangeOpen(false)
          setPage(1)
          return
        }
        var from = dashboardCombine(draft.dateFrom, draft.timeFrom)
        var to = draft.follow ? Date.now() : dashboardCombine(draft.dateTo, draft.timeTo)
        if (!Number.isFinite(from) || !Number.isFinite(to)) { setError(t('时间范围无效。')); return }
        if (from > to) { var swap = from; from = to; to = swap }
        setRange({ preset: draft.preset === 'custom' ? 'custom' : draft.preset, from: from, to: to, follow: !!draft.follow })
        setRangeOpen(false)
        setPage(1)
      }

      var totals = (data && data.totals) || null
      var series = (data && data.series) || []
      var heatmap = (data && data.heatmap) || null
      var granularity = data ? data.granularity : 'day'
      var rows = (data && data.rows) || []
      var providers = (data && data.providers) || []
      var models = (data && data.models) || []
      var currentPage = (data && data.page) || page
      var pages = (data && data.pages) || 1
      var total = data ? data.total : 0
      var cacheText = totals && typeof totals.cacheHitRate === 'number' ? (totals.cacheHitRate * 100).toFixed(1) + '%' : '—'
      var stats = [
        { key: 'cost', label: t('总成本'), value: totals ? fmtCost(totals.cost) : '—', exact: totals ? '$' + Number(totals.cost).toFixed(6) : '' },
        { key: 'calls', label: t('总请求数'), value: totals ? fmtExact(totals.calls) : '—', exact: totals ? fmtExact(totals.calls) : '' },
        { key: 'billed', label: t('真实消耗 Tokens'), value: totals ? fmt(totals.billed) : '—', exact: totals ? fmtExact(totals.billed) + ' Token' : '' },
        { key: 'cache', label: t('缓存命中率'), value: cacheText, exact: totals && typeof totals.cacheHitRate === 'number' ? (totals.cacheHitRate * 100).toFixed(2) + '%' : t('缓存读取占全部输入的比例') },
      ]

      var metricValues = []
      var metricMax = 0
      for (var valueIndex = 0; valueIndex < series.length; valueIndex++) {
        var metricValue = dashboardMetricValue(series[valueIndex], metric)
        metricValues.push(metricValue)
        if (metricValue !== null && metricValue > metricMax) metricMax = metricValue
      }
      var cacheFloor = metric === 'cache' ? dashboardCacheFloor(series) : 0
      var axisMax = metric === 'cache' ? 100 : dashboardNiceMax(metricMax)
      var axisTicks = metric === 'cache'
        ? [100, Math.round((cacheFloor + 100) / 2), cacheFloor]
        : [axisMax, axisMax / 2, 0]
      var axisText = function (tick) {
        if (metric === 'cache') return Math.round(tick) + '%'
        if (metric === 'calls') return fmtExact(tick)
        if (metric === 'billed') return fmt(tick)
        return fmtCost(tick)
      }
      var labelStep = Math.max(1, Math.ceil(series.length / 31))
      var metricLabel = metric === 'calls' ? t('请求数') : metric === 'billed' ? t('Tokens') : metric === 'cache' ? t('缓存命中率') : t('成本')
      var granularityLabel = granularity === 'hour' ? t('按小时') : granularity === 'month' ? t('按月') : t('按天')

      // One hover card per bucket: the bucket total on the selected metric, then
      // every model that contributed to it. Mirrors the usage page's 24h chart so
      // both charts read the same way.
      function showDashTip(event, point) {
        var models = dashboardPointModels(point, metric)
        var x = event.clientX + 14
        var y = event.clientY + 14
        if (x + 270 > window.innerWidth) x = Math.max(8, event.clientX - 270)
        var estimatedHeight = 70 + (models.length + 1) * 23
        if (y + estimatedHeight > window.innerHeight) y = Math.max(8, window.innerHeight - estimatedHeight - 8)
        // Re-anchoring on every mousemove would re-render the whole dialog —
        // chart, stats and log table — while the cursor travels across one bar.
        setDashTip(function (previous) {
          return previous && previous.key === point.key ? previous : { x: x, y: y, key: point.key }
        })
      }
      function hideDashTip() { setDashTip(null) }
      var dashTipEl = null
      // Tracked by bucket key rather than index: a reload can change how many
      // buckets there are, and an index would then describe a different hour.
      var dashTipPoint = dashTip ? series[series.findIndex(function (point) { return point.key === dashTip.key })] : null
      if (dashTipPoint) {
        var tipModels = dashboardPointModels(dashTipPoint, metric)
        dashTipEl = React.createElement('div', { className: 'dshus-tip dshus-chart-tip', style: { left: dashTip.x, top: dashTip.y } },
          React.createElement('div', { className: 'dshus-tip-name' }, dashboardTipName(dashTipPoint, granularity)),
          React.createElement('div', { className: 'dshus-tip-row' },
            React.createElement('span', { className: 'dshus-tip-swatch', style: { background: '#94a3b8' } }),
            React.createElement('span', null, metricLabel),
            React.createElement('strong', null, dashboardMetricText(dashTipPoint, metric)),
          ),
          tipModels.map(function (entry) {
            return React.createElement('div', { className: 'dshus-tip-row', key: entry.key },
              React.createElement('span', { className: 'dshus-tip-swatch', style: { background: sharedModelColor(entry.model) } }),
              React.createElement('span', null, entry.model),
              React.createElement('strong', null, dashboardMetricText(entry, metric)),
            )
          }),
        )
      }

      var draftSummary = ''
      if (draft) {
        if (draft.preset === 'all') draftSummary = t('全部')
        else {
          var draftFrom = dashboardCombine(draft.dateFrom, draft.timeFrom)
          var draftTo = draft.follow ? Date.now() : dashboardCombine(draft.dateTo, draft.timeTo)
          if (Number.isFinite(draftFrom) && Number.isFinite(draftTo)) {
            var draftMin = Math.min(draftFrom, draftTo), draftMax = Math.max(draftFrom, draftTo)
            draftSummary = dashboardRangeShort(draftMin) + ' — ' + dashboardRangeShort(draftMax) + ' · ' + t('{days} 天', { days: dashboardDaySpan(draftMin, draftMax) })
          }
        }
      }
      var calendarCells = draft ? dashboardCalendarCells(draft.year, draft.month) : []

      var rangePopover = rangeOpen && draft && React.createElement('div', { className: 'dshus-range-popover', role: 'dialog', 'aria-label': t('时间范围') },
        React.createElement('div', { className: 'dshus-range-presets' }, DASHBOARD_RANGES.map(function (option) {
          return React.createElement('button', {
            type: 'button', key: option[0], className: 'dshus-range-preset',
            'data-active': draft.preset === option[0] ? '' : undefined,
            onClick: function () { choosePreset(option[0]) },
          }, t(option[1]))
        })),
        React.createElement('div', { className: 'dshus-range-body' },
          React.createElement('div', { className: 'dshus-range-fields' },
            React.createElement('p', { className: 'dshus-range-hint' }, t('支持日期与时间')),
            React.createElement('div', {
              className: 'dshus-range-field', 'data-active': draft.active === 'from' ? '' : undefined,
              onClick: function () { activateField('from') },
            },
              React.createElement('span', { className: 'dshus-range-label' }, t('开始时间')),
              React.createElement('div', { className: 'dshus-range-inputs' },
                React.createElement('input', {
                  type: 'date', className: 'dshus-field dshus-range-date', value: draft.dateFrom, 'aria-label': t('开始时间'),
                  onChange: function (event) { editDate('from', event.target.value) },
                }),
                React.createElement('input', {
                  type: 'time', className: 'dshus-field dshus-range-time', value: draft.timeFrom, 'aria-label': t('开始时间'),
                  onChange: function (event) { editTime('from', event.target.value) },
                }),
              ),
            ),
            React.createElement('div', {
              className: 'dshus-range-field', 'data-active': draft.active === 'to' ? '' : undefined,
              'data-disabled': draft.follow ? '' : undefined,
              onClick: function () { if (!draft.follow) activateField('to') },
            },
              React.createElement('span', { className: 'dshus-range-label' }, t('结束时间')),
              React.createElement('div', { className: 'dshus-range-inputs' },
                React.createElement('input', {
                  type: 'date', className: 'dshus-field dshus-range-date', value: draft.dateTo, disabled: draft.follow, 'aria-label': t('结束时间'),
                  onChange: function (event) { editDate('to', event.target.value) },
                }),
                React.createElement('input', {
                  type: 'time', className: 'dshus-field dshus-range-time', value: draft.timeTo, disabled: draft.follow, 'aria-label': t('结束时间'),
                  onChange: function (event) { editTime('to', event.target.value) },
                }),
              ),
            ),
            React.createElement('label', { className: 'dshus-range-follow' },
              React.createElement('input', { type: 'checkbox', checked: draft.follow, onChange: function (event) { toggleFollow(event.target.checked) } }),
              React.createElement('span', null, t('结束时间跟随当前时刻')),
            ),
          ),
          React.createElement('div', { className: 'dshus-range-calendar' },
            React.createElement('div', { className: 'dshus-range-cal-head' },
              React.createElement('button', { type: 'button', className: 'dshus-range-cal-nav', onClick: function () { shiftMonth(-1) }, 'aria-label': t('上一页') }, '‹'),
              React.createElement('span', { className: 'dshus-range-cal-title' }, t('{year}年{month}月', { year: draft.year, month: draft.month + 1 })),
              React.createElement('button', { type: 'button', className: 'dshus-range-cal-nav', onClick: function () { shiftMonth(1) }, 'aria-label': t('下一页') }, '›'),
            ),
            React.createElement('div', { className: 'dshus-range-cal-week' }, ['日', '一', '二', '三', '四', '五', '六'].map(function (label) {
              return React.createElement('span', { key: label }, t(label))
            })),
            React.createElement('div', { className: 'dshus-range-cal-grid' }, calendarCells.map(function (cell) {
              var selected = (draft.active === 'to' ? draft.dateTo : draft.dateFrom) === cell.date
              return React.createElement('button', {
                type: 'button', key: cell.key, className: 'dshus-range-cal-day',
                'data-muted': cell.current ? undefined : '', 'data-selected': selected ? '' : undefined,
                onClick: function () { pickDay(cell.date) },
              }, cell.day)
            })),
          ),
        ),
        React.createElement('div', { className: 'dshus-range-foot' },
          React.createElement('span', { className: 'dshus-range-summary' }, draftSummary),
          React.createElement('div', { className: 'dshus-range-actions' },
            React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: function () { setRangeOpen(false) } }, t('取消')),
            React.createElement('button', { type: 'button', className: 'dshus-btn dshus-btn-primary', onClick: confirmRange }, t('确定')),
          ),
        ),
      )

      return React.createElement('dialog', {
        className: 'dshus-dash-dialog',
        ref: dialogRef,
        'aria-label': t('用量统计'),
        onCancel: function (event) {
          event.preventDefault()
          if (rangeOpen) setRangeOpen(false)
          else setDashboardOpen(false)
        },
        onClose: function () { setDashboardOpen(false) },
        onClick: function (event) {
          if (rangeOpen && rangeAnchorRef.current && !rangeAnchorRef.current.contains(event.target)) setRangeOpen(false)
          if (event.target !== dialogRef.current) return
          var rect = dialogRef.current.getBoundingClientRect()
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setDashboardOpen(false)
        },
      },
        React.createElement('header', { className: 'dshus-dash-head' },
          React.createElement('div', { className: 'dshus-dash-title' }, usageChartIcon(18), React.createElement('h2', null, t('用量统计'))),
          React.createElement('div', { className: 'dshus-dash-head-actions' },
            data && React.createElement('span', { className: 'dshus-dash-sync' }, dashboardSyncLabel(data.syncedAt)),
            refreshIconButton(function () { load(true) }, loading, t('刷新用量统计')),
            React.createElement('button', {
              type: 'button', className: 'dshus-dash-close', onClick: function () { setDashboardOpen(false) },
              'data-dshus-tip': t('关闭用量统计'), 'aria-label': t('关闭用量统计'),
            }, React.createElement('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': 'true' },
              React.createElement('path', { d: 'M6 6l12 12M18 6L6 18' }))),
          ),
        ),
        React.createElement('div', { className: 'dshus-dash-body' },
          React.createElement('div', { className: 'dshus-dash-toolbar' },
            React.createElement('div', { className: 'dshus-range-wrap', ref: rangeAnchorRef },
              React.createElement('button', {
                type: 'button', className: 'dshus-range-trigger',
                onClick: function () { if (rangeOpen) setRangeOpen(false); else openPicker() },
                'aria-haspopup': 'dialog', 'aria-expanded': rangeOpen ? 'true' : undefined,
              }, calendarIcon(15), React.createElement('span', null, dashboardRangeLabel(dashboardLiveRange(range))), chevronDownIcon(14)),
              rangePopover,
            ),
            React.createElement(SelectField, {
              id: 'dshus-dash-provider', variant: 'field',
              'aria-label': t('供应商'),
              value: provider,
              options: [{ value: '', name: t('全部供应商') }].concat(providers.map(function (name) { return { value: name, name: name } })),
              onChange: function (value) { setPage(1); setModel(''); setProvider(value) },
            }),
            React.createElement(SelectField, {
              id: 'dshus-dash-model', variant: 'field',
              'aria-label': t('模型'),
              value: model,
              options: [{ value: '', name: t('全部模型') }].concat(models.map(function (name) { return { value: name, name: name } })),
              onChange: function (value) { setPage(1); setModel(value) },
            }),
          ),
          error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
          React.createElement('div', { className: 'dshus-dash-stats' }, stats.map(function (entry) {
            return React.createElement('button', {
              type: 'button', key: entry.key, className: 'dshus-dash-stat',
              'data-active': metric === entry.key ? '' : undefined, 'aria-pressed': metric === entry.key,
              'data-dshus-tip': entry.exact || undefined, onClick: function () { setMetric(entry.key) },
            },
              React.createElement('span', { className: 'dshus-dash-stat-label' }, entry.label),
              React.createElement('span', { className: 'dshus-dash-stat-value' }, entry.value),
            )
          })),
          granularity === 'heatmap' && heatmap
            ? dashboardHeatmapElement(heatmap, metric)
            : React.createElement('section', { className: 'dshus-dash-chart' },
              React.createElement('div', { className: 'dshus-dash-chart-head' },
                React.createElement('h3', null, metricLabel + ' · ' + granularityLabel),
              ),
              React.createElement('div', { className: 'dshus-dash-plot' },
                (metric === 'cache' || axisMax > 0) && React.createElement('div', { className: 'dshus-dash-yaxis' }, axisTicks.map(function (tick, tickIndex) {
                  return React.createElement('span', { key: tickIndex }, axisText(tick))
                })),
                React.createElement('div', { className: 'dshus-dash-plot-main' },
                  React.createElement('div', { className: 'dshus-dash-chart-bars', role: 'grid', 'aria-label': metricLabel + ' · ' + granularityLabel }, series.map(function (point, pointIndex) {
                    var pointValue = metricValues[pointIndex]
                    var height = '2px'
                    if (metric === 'cache') {
                      if (pointValue !== null) height = Math.max(3, (pointValue - cacheFloor) / Math.max(1, 100 - cacheFloor) * 100) + '%'
                    } else if (pointValue > 0 && axisMax > 0) height = Math.max(3, pointValue / axisMax * 100) + '%'
                    var models = dashboardPointModels(point, metric)
                    // A hit rate is a ratio rather than a sum, so that bar stays
                    // solid; the hover card still splits it per model.
                    var segments = metric === 'cache' ? [] : models
                    var ariaLabel = dashboardTipName(point, granularity) + ': ' + dashboardMetricText(point, metric)
                    if (models.length > 1) ariaLabel += '；' + models.map(function (entry) {
                      return entry.model + ' ' + dashboardMetricText(entry, metric)
                    }).join('；')
                    return React.createElement('div', {
                      key: point.key, className: 'dshus-dash-bar', 'data-empty': pointValue === null || pointValue <= 0 ? '' : undefined,
                      role: 'gridcell', tabIndex: 0, 'aria-label': ariaLabel,
                      onMouseMove: function (event) { showDashTip(event, point) },
                      onMouseLeave: hideDashTip,
                      onClick: function (event) { showDashTip(event, point) },
                      onFocus: function (event) {
                        var rect = event.currentTarget.getBoundingClientRect()
                        showDashTip({ clientX: rect.left, clientY: rect.bottom }, point)
                      },
                      onBlur: hideDashTip,
                    }, React.createElement('div', { className: 'dshus-dash-bar-fill', style: { height: height } },
                      segments.map(function (entry) {
                        return React.createElement('div', {
                          key: entry.key, className: 'dshus-dash-bar-seg',
                          style: { flexGrow: Math.max(0, dashboardMetricValue(entry, metric) || 0), flexBasis: 0, background: sharedModelColor(entry.model) },
                        })
                      })))
                  })),
                  React.createElement('div', { className: 'dshus-dash-axis' }, series.map(function (point, pointIndex) {
                    return React.createElement('span', { key: point.key }, pointIndex % labelStep === 0 ? dashboardSeriesLabel(point, granularity) : '')
                  })),
                  dashTipEl,
                ),
              ),
            ),
          React.createElement('section', { className: 'dshus-dash-logs' },
            React.createElement('div', { className: 'dshus-dash-logs-head' },
              React.createElement('h3', null, t('请求日志')),
              React.createElement('span', { className: 'dshus-muted' }, t('共 {count} 条', { count: total })),
              React.createElement('label', { className: 'dshus-dash-page-size' },
                React.createElement('span', { className: 'dshus-muted' }, t('每页行数')),
                React.createElement(SelectField, {
                  id: 'dshus-dash-page-size', variant: 'field', inline: true,
                  'aria-label': t('每页行数'),
                  value: pageSize,
                  options: [10, 20, 50, 100].map(function (size) { return { value: size, name: t('{count} 条/页', { count: size }) } }),
                  onChange: function (value) { setPage(1); setPageSize(Number(value)) },
                }),
              ),
            ),
            React.createElement('div', { className: 'dshus-dash-logs-body' },
              React.createElement('div', { className: 'dshus-table-wrap' },
                React.createElement('table', { className: 'dshus-table dshus-logs-table' },
                  logTableHead(),
                  React.createElement('tbody', null,
                    rows.length > 0 ? rows.map(logRowElement) : data && React.createElement('tr', null,
                      React.createElement('td', { colSpan: 10, style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', padding: '16px 0' } }, t('暂无请求记录')),
                    ),
                  ),
                ),
              ),
            ),
            pages > 1 && React.createElement('div', { className: 'dshus-dash-pager' },
              React.createElement('span', { className: 'dshus-muted' }, t('第 {page} / {pages} 页', { page: currentPage, pages: pages })),
              React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: currentPage <= 1 || loading, onClick: function () { setPage(currentPage - 1) } }, t('上一页')),
              React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: currentPage >= pages || loading, onClick: function () { setPage(currentPage + 1) } }, t('下一页')),
            ),
          ),
        ),
      )
    }

function dashboardHeatmapElement(heatmap, metric) {
      var dayMap = {}
      var days = heatmap.days || []
      for (var index = 0; index < days.length; index++) dayMap[days[index].date] = days[index]
      var startMs = Date.parse(heatmap.start + 'T00:00:00Z')
      var endMs = Date.parse(heatmap.end + 'T00:00:00Z')
      var max = 0
      for (index = 0; index < days.length; index++) {
        var metricValue = dashboardMetricValue(days[index], metric)
        if (metricValue !== null && metricValue > max) max = metricValue
      }
      var weeks = []
      var labels = []
      var previousMonth = ''
      for (var week = 0; week < 53; week++) {
        var cells = []
        for (var day = 0; day < 7; day++) {
          var ms = startMs + (week * 7 + day) * 86400000
          var key = new Date(ms).toISOString().slice(0, 10)
          var entry = dayMap[key] || null
          var future = ms > endMs
          var value = entry ? dashboardMetricValue(entry, metric) : null
          var level = 0
          if (!future && value !== null && value > 0 && max > 0) level = Math.min(4, Math.max(1, Math.ceil(value / max * 4)))
          cells.push({ key: key, entry: entry, future: future, level: level, weekday: DASHBOARD_WEEKDAYS[(new Date(ms).getUTCDay() + 6) % 7] })
        }
        weeks.push(cells)
        var monthKey = cells[0].key.slice(0, 7)
        labels.push(week === 0 || monthKey !== previousMonth ? monthKey : '')
        previousMonth = monthKey
      }
      return React.createElement('section', { className: 'dshus-dash-chart dshus-dash-heatmap' },
        React.createElement('div', { className: 'dshus-dash-chart-head' },
          React.createElement('h3', null, t('用量热力图')),
        ),
        React.createElement('p', { className: 'dshus-dash-heatmap-summary' },
          React.createElement('span', { className: 'dshus-dash-heatmap-range' }, heatmap.start + ' — ' + heatmap.end),
          React.createElement('span', { className: 'dshus-muted' }, t('{tokens} Token · {calls} 次请求 · {cost}', {
            tokens: fmt(heatmap.totals.billed), calls: fmtExact(heatmap.totals.calls), cost: fmtCost(heatmap.totals.cost),
          })),
        ),
        React.createElement('div', { className: 'dshus-heatmap-wrap' },
          React.createElement('div', { className: 'dshus-heatmap-months' }, labels.map(function (label, labelIndex) {
            return React.createElement('span', { key: labelIndex }, label ? t('{month}月', { month: Number(label.slice(5)) }) : '')
          })),
          React.createElement('div', { className: 'dshus-heatmap-body' },
            React.createElement('div', { className: 'dshus-heatmap-weekdays' }, DASHBOARD_WEEKDAYS.map(function (label, weekdayIndex) {
              return React.createElement('span', { key: label }, weekdayIndex % 2 === 0 ? t(label) : '')
            })),
            React.createElement('div', { className: 'dshus-heatmap-weeks' }, weeks.map(function (cells, weekIndex) {
              return React.createElement('div', { key: weekIndex, className: 'dshus-heatmap-week' }, cells.map(function (cell) {
                var title = ''
                if (!cell.future && cell.entry) {
                  title = cell.key + ' ' + t(cell.weekday) + '\n' + t('Tokens') + ' ' + fmtExact(cell.entry.billed)
                    + '\n' + t('请求数') + ' ' + fmtExact(cell.entry.calls)
                    + '\n' + t('成本') + ' ' + fmtCost(cell.entry.cost)
                }
                return React.createElement('span', {
                  key: cell.key, className: 'dshus-heatmap-cell', 'data-level': cell.level,
                  'data-future': cell.future ? '' : undefined, 'data-dshus-tip': title || undefined,
                })
              }))
            })),
          ),
        ),
      )
    }

function localDayString(date) {
      var d = date instanceof Date ? date : new Date(date)
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }

function PriceTableDialog(props) {
      useLocaleRevision()
      var api = props.api
      var models = props.models || []
      var fields = [['input', t('输入')], ['output', t('输出')], ['cacheRead', t('缓存读取')], ['cacheWrite', t('缓存写入')]]
      var draftState = React.useState(function () {
        var drafts = {}
        for (var i = 0; i < models.length; i++) {
          var row = models[i]
          drafts[row.model] = row.price
            ? { input: String(row.price.input), output: String(row.price.output), cacheRead: String(row.price.cacheRead), cacheWrite: String(row.price.cacheWrite) }
            : { input: '', output: '', cacheRead: '', cacheWrite: '' }
        }
        return drafts
      })
      var drafts = draftState[0], setDrafts = draftState[1]
      var savingState = React.useState('')
      var saving = savingState[0], setSaving = savingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]

      function edit(model, field, value) {
        setDrafts(function (previous) {
          var next = Object.assign({}, previous)
          next[model] = Object.assign({}, previous[model])
          next[model][field] = value
          return next
        })
      }
      function save(row) {
        var draft = drafts[row.model] || {}, values = {}
        for (var i = 0; i < fields.length; i++) {
          var field = fields[i][0], raw = String(draft[field] == null ? '' : draft[field]).trim(), value = Number(raw)
          if (raw === '' || !Number.isFinite(value) || value < 0) { setError(t('请输入有效价格。')); return }
          values[field] = value
        }
        setSaving(row.model)
        setError('')
        api.savePrice(Object.assign({ model: row.model }, values)).then(function () {
          setSaving('')
          props.onSaved()
        }).catch(function (err) {
          setSaving('')
          setError(String(err && err.message || err))
        })
      }

      return React.createElement(ControlDialog, { id: 'dshus-price-dialog', title: t('价格表'), onClose: props.onClose, returnFocusId: 'dshus-price-button' },
        React.createElement('p', { className: 'dshus-setting-help' }, t('美元 / 百万 Tokens')),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        models.length === 0
          ? React.createElement('p', { className: 'dshus-setting-help' }, t('暂无数据'))
          : React.createElement('div', { className: 'dshus-table-wrap dshus-price-table-wrap' },
            React.createElement('table', { className: 'dshus-table dshus-price-table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, t('模型')),
                  fields.map(function (field) { return React.createElement('th', { key: field[0] }, field[1]) }),
                  React.createElement('th', { 'aria-label': t('保存') }),
                ),
              ),
              React.createElement('tbody', null,
                models.map(function (row) {
                  var draft = drafts[row.model] || {}
                  return React.createElement('tr', { key: row.model },
                    React.createElement('td', { 'data-dshus-tip': (row.providers || []).join(' · ') },
                      React.createElement('div', { className: 'dshus-table-model-cell' }, React.createElement('span', null, row.model)),
                    ),
                    fields.map(function (field) {
                      return React.createElement('td', { key: field[0], style: { textAlign: 'right' } },
                        React.createElement('input', {
                          type: 'number', min: 0, step: 'any', className: 'dshus-field dshus-price-input',
                          'aria-label': row.model + ' ' + field[1],
                          value: draft[field[0]] == null ? '' : draft[field[0]],
                          onChange: function (event) { edit(row.model, field[0], event.target.value) },
                        }))
                    }),
                    React.createElement('td', { style: { textAlign: 'right' } },
                      React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: saving !== '', onClick: function () { save(row) } },
                        saving === row.model ? t('保存中…') : t('保存'))),
                  )
                }),
              ),
            ),
          ),
      )
    }

/* ------------------------------------------------------------------ */
/* Model name rules                                                    */
/* ------------------------------------------------------------------ */

var RULE_SPLIT = /[,，、;；\n\r]+/

function splitRuleNames(text) {
      var parts = String(text || '').split(RULE_SPLIT), out = [], seen = {}
      for (var i = 0; i < parts.length; i++) {
        var name = parts[i].trim()
        if (!name) continue
        var key = name.toLowerCase()
        if (seen[key]) continue
        seen[key] = true
        out.push(name)
      }
      return out
    }

/** Shared add/edit form: one canonical name and the raw models folded into it. */
function RuleEditor(props) {
      useLocaleRevision()
      var models = props.models || []
      var blocked = props.blocked || {}
      var initial = props.initial || { canonical: '', originals: [] }
      var canonicalState = React.useState(initial.canonical || '')
      var canonical = canonicalState[0], setCanonical = canonicalState[1]
      var suggestState = React.useState(false)
      var suggestOpen = suggestState[0], setSuggestOpen = suggestState[1]
      var suggestRootRef = React.useRef(null)
      var originalState = React.useState(initial.originals || [])
      var originals = originalState[0], setOriginals = originalState[1]
      var draftState = React.useState('')
      var draft = draftState[0], setDraft = draftState[1]
      var pickerState = React.useState(false)
      var pickerOpen = pickerState[0], setPickerOpen = pickerState[1]
      var searchState = React.useState('')
      var search = searchState[0], setSearch = searchState[1]
      var searchRef = React.useRef(null)
      var busyState = React.useState(false)
      var busy = busyState[0], setBusy = busyState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]

      React.useEffect(function () {
        if (!suggestOpen) return
        function outside(event) { if (suggestRootRef.current && !suggestRootRef.current.contains(event.target)) setSuggestOpen(false) }
        document.addEventListener('pointerdown', outside)
        return function () { document.removeEventListener('pointerdown', outside) }
      }, [suggestOpen])

      function addNames(names) {
        setOriginals(function (previous) {
          var next = previous.slice()
          for (var i = 0; i < names.length; i++) {
            var name = String(names[i] || '').trim()
            if (!name) continue
            var key = name.toLowerCase(), exists = false
            for (var j = 0; j < next.length; j++) if (next[j].toLowerCase() === key) { exists = true; break }
            if (!exists) next.push(name)
          }
          return next
        })
      }
      function removeName(name) {
        setOriginals(function (previous) {
          return previous.filter(function (item) { return item.toLowerCase() !== name.toLowerCase() })
        })
      }
      function commitDraft() {
        if (!draft.trim()) return
        addNames(splitRuleNames(draft))
        setDraft('')
      }
      function submit() {
        var name = canonical.trim()
        if (!name || originals.length === 0) { setError('请填写归一名称和至少一个原始模型。'); return }
        setBusy(true)
        setError('')
        var result
        try { result = props.onSubmit(name, originals.slice()) } catch (err) { result = Promise.reject(err) }
        Promise.resolve(result).then(function () {
          setBusy(false)
          props.onDone()
        }).catch(function (err) {
          setBusy(false)
          setError(String(err && err.message || err))
        })
      }

      var suggestions = [], seenNames = {}
      ;(props.suggestions || []).concat(models).forEach(function (name) {
        var key = String(name || '').toLowerCase()
        if (!key || seenNames[key]) return
        seenNames[key] = true
        suggestions.push(name)
      })
      var suggestNeedle = canonical.trim().toLowerCase()
      var suggestMatches = suggestions.filter(function (name) {
        return !suggestNeedle || name.toLowerCase().indexOf(suggestNeedle) !== -1
      })
      var needle = search.trim().toLowerCase()
      var available = []
      for (var mi = 0; mi < models.length; mi++) {
        var modelName = models[mi], modelKey = modelName.toLowerCase()
        if (blocked[modelKey]) continue
        if (originals.some(function (item) { return item.toLowerCase() === modelKey })) continue
        if (needle && modelKey.indexOf(needle) === -1) continue
        available.push(modelName)
      }

      return React.createElement('div', { className: 'dshus-rule-editor' },
        React.createElement('div', { className: 'dshus-rule-field', ref: suggestRootRef },
          React.createElement('span', { className: 'dshus-setting-label' }, t('归一名称')),
          React.createElement('input', {
            type: 'text', className: 'dshus-field', value: canonical,
            placeholder: t('例如 Claude Sonnet 4.5'), autoComplete: 'off', 'aria-label': t('归一名称'),
            onChange: function (event) { setCanonical(event.target.value); setSuggestOpen(true) },
            onFocus: function () { setSuggestOpen(true) },
            onClick: function () { setSuggestOpen(true) },
            onKeyDown: function (event) {
              if (event.key === 'Escape' && suggestOpen) { event.preventDefault(); event.stopPropagation(); setSuggestOpen(false) }
            },
          }),
          suggestOpen && suggestMatches.length > 0 && React.createElement('div', { className: 'dshus-rule-suggest' },
            React.createElement('ul', { className: 'dshus-rule-options' }, suggestMatches.slice(0, 100).map(function (name) {
              return React.createElement('li', { key: name },
                React.createElement('button', {
                  type: 'button', className: 'dshus-rule-option',
                  onMouseDown: function (event) { event.preventDefault() },
                  onClick: function () { setCanonical(name); setSuggestOpen(false) },
                }, name))
            })))),
        React.createElement('div', { className: 'dshus-rule-field' },
          React.createElement('span', { className: 'dshus-setting-label' }, t('原始模型')),
          originals.length > 0 && React.createElement('div', { className: 'dshus-rule-chips' },
            originals.map(function (name) {
              return React.createElement('span', { key: name, className: 'dshus-rule-chip' },
                React.createElement('span', null, name),
                React.createElement('button', {
                  type: 'button', className: 'dshus-rule-chip-remove', 'aria-label': t('移除 {name}', { name: name }),
                  onClick: function () { removeName(name) },
                }, '×'))
            })),
          React.createElement('div', { className: 'dshus-rule-add' },
            React.createElement('input', {
              type: 'text', className: 'dshus-field', value: draft,
              placeholder: t('输入模型名称，回车添加'),
              onChange: function (event) { setDraft(event.target.value) },
              onKeyDown: function (event) {
                if (event.key === 'Enter' || event.key === ',' || event.key === '，') { event.preventDefault(); commitDraft() }
                else if (event.key === 'Backspace' && draft === '' && originals.length > 0) removeName(originals[originals.length - 1])
              },
            }),
            React.createElement('button', {
              type: 'button', className: 'dshus-btn',
              'aria-expanded': pickerOpen, 'aria-controls': pickerOpen ? props.idPrefix + '-picker' : undefined,
              onClick: function () { setPickerOpen(!pickerOpen) },
            }, t('选择模型'))),
          pickerOpen && React.createElement('div', { id: props.idPrefix + '-picker', className: 'dshus-rule-picker' },
            React.createElement('input', {
              type: 'search', className: 'dshus-field', value: search, ref: searchRef,
              placeholder: t('搜索模型名称'), 'aria-label': t('搜索模型名称'),
              onChange: function (event) { setSearch(event.target.value) },
            }),
            available.length > 0
              ? React.createElement('ul', { className: 'dshus-rule-options' }, available.slice(0, 100).map(function (name) {
                return React.createElement('li', { key: name },
                  React.createElement('button', {
                    type: 'button', className: 'dshus-rule-option',
                    onClick: function () {
                      addNames([name])
                      // The search text stays so several matches can be picked
                      // in a row; only the user clears it.
                      if (searchRef.current) searchRef.current.focus()
                    },
                  }, name))
              }))
              : React.createElement('p', { className: 'dshus-setting-help' }, models.length === 0 ? t('还没有模型使用记录') : needle ? t('没有匹配的模型') : t('没有可添加的模型'))),
        ),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        React.createElement('div', { className: 'dshus-rule-editor-actions' },
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: busy, onClick: submit }, busy ? t('保存中…') : props.submitLabel),
          props.onCancel && React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: busy, onClick: props.onCancel }, t('取消'))),
      )
    }

function RuleRemoveDialog(props) {
      useLocaleRevision()
      var busyState = React.useState(false)
      var busy = busyState[0], setBusy = busyState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      function confirm() {
        setBusy(true)
        setError('')
        Promise.resolve(props.onConfirm()).then(function () {
          setBusy(false)
          props.onClose()
        }).catch(function (err) {
          setBusy(false)
          setError(String(err && err.message || err))
        })
      }
      return React.createElement(ControlDialog, { id: 'dshus-rule-remove-dialog', title: t('移除规则'), onClose: props.onClose, returnFocusId: props.returnFocusId },
        React.createElement('p', null, t('移除“{name}”规则？这些原始模型会恢复各自独立的名称。', { name: props.canonical })),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        React.createElement('div', { className: 'dshus-control-actions' },
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: busy, onClick: confirm }, busy ? t('移除中…') : t('移除')),
          React.createElement('button', { type: 'button', className: 'dshus-btn', disabled: busy, onClick: props.onClose }, t('取消'))),
      )
    }

function RulesPanel(props) {
      useLocaleRevision()
      var api = props.api
      var active = props.active === true
      var dataState = React.useState(null)
      var data = dataState[0], setData = dataState[1]
      var loadingState = React.useState(false)
      var loading = loadingState[0], setLoading = loadingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      var editingState = React.useState('')
      var editing = editingState[0], setEditing = editingState[1]
      var removingState = React.useState(null)
      var removing = removingState[0], setRemoving = removingState[1]
      var addRevisionState = React.useState(0)
      var addRevision = addRevisionState[0], setAddRevision = addRevisionState[1]
      var requestRef = React.useRef(0)

      function load() {
        var request = ++requestRef.current
        setLoading(true)
        setError('')
        api.rules().then(function (body) {
          if (request !== requestRef.current) return
          setData(body)
          setLoading(false)
        }).catch(function (err) {
          if (request !== requestRef.current) return
          setError(String(err && err.message || err))
          setLoading(false)
        })
      }
      React.useEffect(function () {
        if (active) load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [active])

      function submit(body) {
        var request = ++requestRef.current
        return api.saveRules(body).then(function (result) {
          if (request === requestRef.current) {
            setData(function (previous) {
              return { rules: result.rules || [], models: result.models || (previous && previous.models) || [] }
            })
          }
          return result
        })
      }

      var groups = (data && data.rules) || []
      var models = (data && data.models) || []
      var canonicalNames = groups.map(function (group) { return group.canonical })
      var blockedFor = function (group) {
        var blocked = {}
        groups.forEach(function (item) {
          if (group && item.canonical.toLowerCase() === group.canonical.toLowerCase()) return
          item.originals.forEach(function (name) { blocked[name.toLowerCase()] = true })
        })
        return blocked
      }
      var allBlocked = blockedFor(null)

      var rows = groups.map(function (group) {
        var key = group.canonical.toLowerCase()
        if (editing === key) {
          return React.createElement('div', { key: key, className: 'dshus-rule-card dshus-rule-card-editing' },
            React.createElement(RuleEditor, {
              idPrefix: 'dshus-rule-edit-' + key, initial: group, models: models, suggestions: canonicalNames, blocked: blockedFor(group),
              submitLabel: t('保存'),
              onSubmit: function (canonical, originals) { return submit({ action: 'update', removed: group.originals, canonical: canonical, originals: originals }) },
              onDone: function () { setEditing('') },
              onCancel: function () { setEditing('') },
            }))
        }
        return React.createElement('div', { key: key, className: 'dshus-rule-card' },
          React.createElement('div', { className: 'dshus-rule-main' },
            React.createElement('strong', { className: 'dshus-rule-name' }, group.canonical),
            React.createElement('div', { className: 'dshus-rule-originals', 'data-dshus-tip': group.originals.join(' · ') }, group.originals.join(' · '))),
          React.createElement('span', { className: 'dshus-rule-count' }, t('{count} 个原始模型', { count: group.originals.length })),
          React.createElement('div', { className: 'dshus-rule-actions' },
            React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: function () { setEditing(key) } }, t('编辑')),
            React.createElement('button', { type: 'button', className: 'dshus-btn', onClick: function () { setRemoving(group) } }, t('移除'))))
      })

      return React.createElement('div', { className: 'dshus-rules' },
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null, t('新增规则')),
          React.createElement(RuleEditor, {
            key: 'dshus-rule-add-' + addRevision,
            idPrefix: 'dshus-rule-add', models: models, suggestions: canonicalNames, blocked: allBlocked,
            submitLabel: t('添加'),
            onSubmit: function (canonical, originals) { return submit({ action: 'add', canonical: canonical, originals: originals }) },
            onDone: function () { setError(''); setAddRevision(function (value) { return value + 1 }) },
            onCancel: function () { setAddRevision(function (value) { return value + 1 }) },
          }),
        ),
        React.createElement('div', { className: 'dshus-module' },
          React.createElement('h3', null,
            t('已有规则'),
            React.createElement('span', { className: 'dshus-muted' }, String(groups.length)),
            refreshIconButton(load, loading, t('刷新规则'), true)),
          error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
          rows.length > 0 ? React.createElement('div', { className: 'dshus-rule-list' }, rows) : React.createElement('p', { className: 'dshus-setting-help' }, t('还没有模型规则。')),
        ),
        removing && React.createElement(RuleRemoveDialog, {
          canonical: removing.canonical, returnFocusId: 'dshus-tab-rules',
          onConfirm: function () { return submit({ action: 'remove', canonical: removing.canonical }) },
          onClose: function () { setRemoving(null) },
        }),
      )
    }

function CostsPanel(props) {
      useLocaleRevision()
      var api = props.api
      var active = props.active === true
      var rangeState = React.useState(function () { return costPresetRange('month') })
      var range = rangeState[0], setRange = rangeState[1]
      var providerState = React.useState('')
      var provider = providerState[0], setProvider = providerState[1]
      var priceOpenState = React.useState(false)
      var priceOpen = priceOpenState[0], setPriceOpen = priceOpenState[1]
      var dataState = React.useState(null)
      var data = dataState[0], setData = dataState[1]
      var loadingState = React.useState(false)
      var loading = loadingState[0], setLoading = loadingState[1]
      var errorState = React.useState('')
      var error = errorState[0], setError = errorState[1]
      var requestRef = React.useRef(0)

      function load(fresh, nextRange, nextProvider) {
        var request = ++requestRef.current
        var live = costLiveRange(nextRange || range)
        setLoading(true)
        setError('')
        api.costs({ from: live.from, to: live.to, provider: nextProvider, fresh: fresh })
          .then(function (body) {
            if (request !== requestRef.current) return
            setData(body)
            setLoading(false)
          })
          .catch(function (err) {
            if (request !== requestRef.current) return
            setError(String(err && err.message || err))
            setLoading(false)
          })
      }
      React.useEffect(function () {
        if (!active) return
        load(false, range, provider)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [active, range, provider])

      var merged = [], index = Object.create(null)
      var sourceRows = (data && data.rows) || []
      for (var i = 0; i < sourceRows.length; i++) {
        var row = sourceRows[i]
        var modelId = sharedNormModelKey(row.model)
        var group = index[modelId]
        if (group === undefined) {
          group = {
            key: modelId, model: modelId === 'glm-5.3-flash' ? 'glm-5.3-flash' : sharedModelDisplayName(row.model),
            providers: [], rangeCost: null, totalCost: null, rangeTokens: 0, calls: 0,
          }
          index[modelId] = group
          merged.push(group)
        }
        if (row.provider && group.providers.indexOf(row.provider) === -1) group.providers.push(row.provider)
        if (row.rangeCost !== null) group.rangeCost = (group.rangeCost === null ? 0 : group.rangeCost) + row.rangeCost
        if (row.totalCost !== null) group.totalCost = (group.totalCost === null ? 0 : group.totalCost) + row.totalCost
        group.rangeTokens += (row.range && row.range.billed) || 0
        group.calls += (row.total && row.total.calls) || 0
      }
      merged.sort(function (a, b) {
        var av = a.rangeCost === null ? -1 : a.rangeCost
        var bv = b.rangeCost === null ? -1 : b.rangeCost
        return bv - av || b.rangeTokens - a.rangeTokens
      })

      var stat = function (value, label) {
        return React.createElement('div', { className: 'dshus-stat' },
          React.createElement('div', { className: 'v' }, fmtCost(value)),
          React.createElement('div', { className: 'k' }, label),
        )
      }
      var providers = (data && data.providers) || []
      var coverage = data ? (data.pricedModels || 0) + '/' + (data.totalModels || 0) : '—'
      var coverageLabel = data ? t('已收录 {priced} / 共 {total} 个模型', { priced: data.pricedModels || 0, total: data.totalModels || 0 }) : ''

      return React.createElement('div', { className: 'dshus-module' },
        React.createElement('h3', null,
          React.createElement('span', { className: 'dshus-muted', 'data-dshus-tip': coverageLabel || undefined, 'aria-label': coverageLabel || undefined }, coverage),
          React.createElement('div', { className: 'dshus-head-tools' },
            React.createElement(DayRangePicker, {
              id: 'dshus-cost-range', idPrefix: 'dshus-cost-range',
              value: range, onChange: function (next) { setRange(next) },
            }),
            React.createElement(SelectField, {
              id: 'dshus-cost-provider', variant: 'field',
              'aria-label': t('供应商'),
              value: provider,
              options: [{ value: '', name: t('全部供应商') }].concat(providers.map(function (name) { return { value: name, name: name } })),
              onChange: function (value) { setProvider(value) },
            }),
            React.createElement('button', { id: 'dshus-price-button', type: 'button', className: 'dshus-btn', disabled: !data, onClick: function () { setPriceOpen(true) } }, t('价格表')),
            refreshIconButton(function () { load(true, range, provider) }, loading, t('刷新成本统计'), true),
          ),
        ),
        React.createElement('div', { className: 'dshus-statbar', role: 'group', 'aria-label': t('成本') },
          stat(data ? data.totalCost : null, t('总成本')),
          stat(data ? data.rangeCost : null, t('区间成本')),
        ),
        error && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(error)),
        React.createElement('div', { className: 'dshus-table-wrap' },
          React.createElement('table', { className: 'dshus-table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, t('模型')),
                React.createElement('th', null, t('区间成本')),
                React.createElement('th', null, t('总成本')),
                React.createElement('th', null, t('区间 Tokens')),
                React.createElement('th', null, t('调用次数')),
              ),
            ),
            React.createElement('tbody', null,
              merged.length > 0 ? merged.map(function (group) {
                return React.createElement('tr', { key: group.key },
                  React.createElement('td', { 'data-dshus-tip': group.providers.join(' · ') },
                    React.createElement('div', { className: 'dshus-table-model-cell' }, React.createElement('span', null, group.model)),
                  ),
                  React.createElement('td', { style: { textAlign: 'right', fontWeight: 600 } }, fmtCost(group.rangeCost)),
                  React.createElement('td', { style: { textAlign: 'right' } }, fmtCost(group.totalCost)),
                  React.createElement('td', { style: { textAlign: 'right' }, 'data-dshus-tip': fmtExact(group.rangeTokens) }, fmt(group.rangeTokens)),
                  React.createElement('td', { style: { textAlign: 'right' } }, fmtExact(group.calls)),
                )
              }) : data && React.createElement('tr', null,
                React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #6b7280)', padding: '16px 0' } }, t('暂无成本数据')),
              ),
            ),
          ),
        ),
        priceOpen && React.createElement(PriceTableDialog, {
          api: api, models: (data && data.priceModels) || [],
          onClose: function () { setPriceOpen(false) },
          onSaved: function () { load(false, range, provider) },
        }),
      )
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

      var controlState = React.useState({ settings: { autoQuota: false, intervalMinutes: 10, showModelDetails: false, showTokenSpeed: true, showModelDetection: true, showLogs: true, showCosts: true, showRules: true, advancedModelSelect: true, modelSeatColor: 'blue', modelReasoning: true, customQueries: [] } })
      var control = controlState[0], setControl = controlState[1]
      // The controls body comes from the host and may lack its settings block:
      // a degraded endpoint or a proxy error page must degrade the page's
      // switches, not crash the whole settings section during render.
      var controlSettings = (control && control.settings) || {}
      var showModelDetection = controlSettings.showModelDetection === true
      var showLogs = controlSettings.showLogs !== false
      var showCosts = controlSettings.showCosts !== false
      var showRules = controlSettings.showRules !== false
      if (tab === 'detection' && !showModelDetection) tab = 'usage'
      if (tab === 'logs' && !showLogs) tab = 'usage'
      if (tab === 'costs' && !showCosts) tab = 'usage'
      if (tab === 'rules' && !showRules) tab = 'usage'
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
      var logsVisitedState = React.useState(props.initialTab === 'logs')
      var logsVisited = logsVisitedState[0], setLogsVisited = logsVisitedState[1]
      var costsVisitedState = React.useState(props.initialTab === 'costs')
      var costsVisited = costsVisitedState[0], setCostsVisited = costsVisitedState[1]
      var rulesVisitedState = React.useState(props.initialTab === 'rules')
      var rulesVisited = rulesVisitedState[0], setRulesVisited = rulesVisitedState[1]
      var quickStartState = React.useState(false)
      var quickStartOpen = quickStartState[0], setQuickStartOpen = quickStartState[1]
      var quotaSnapshotsState = React.useState({})
      var quotaSnapshots = quotaSnapshotsState[0], setQuotaSnapshots = quotaSnapshotsState[1]
      var quotaLoadingState = React.useState(false)
      var quotaLoading = quotaLoadingState[0], setQuotaLoading = quotaLoadingState[1]
      var quotaErrorState = React.useState('')
      var quotaError = quotaErrorState[0], setQuotaError = quotaErrorState[1]

      function changeTab(next) {
        if (next === 'detection' && !showModelDetection) return
        if (next === 'logs' && !showLogs) return
        if (next === 'costs' && !showCosts) return
        if (next === 'rules' && !showRules) return
        if (next === tab) return
        // A short tab must not inherit the long usage page's scroll position.
        if (scrollPortRef.current) scrollPortRef.current.scrollTop = 0
        if (next === 'quota') setQuotaVisited(true)
        if (next === 'detection') setDetectionVisited(true)
        if (next === 'logs') setLogsVisited(true)
        if (next === 'costs') setCostsVisited(true)
        if (next === 'rules') setRulesVisited(true)
        if (next === 'usage') load()
        setTab(next)
      }
      function onTabKeyDown(event) {
        var names = ['usage']
        if (showLogs) names.push('logs')
        if (showCosts) names.push('costs')
        if (showRules) names.push('rules')
        names.push('quota')
        if (showModelDetection) names.push('detection')
        names.push('control')
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
        if (body.settings?.showLogs === false) { setTab(function (previous) { return previous === 'logs' ? 'usage' : previous }); setLogsVisited(false) }
        if (body.settings?.showCosts === false) { setTab(function (previous) { return previous === 'costs' ? 'usage' : previous }); setCostsVisited(false) }
        if (body.settings?.showRules === false) { setTab(function (previous) { return previous === 'rules' ? 'usage' : previous }); setRulesVisited(false) }
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
        React.createElement('button', { id: 'dshus-quickstart-button', type: 'button', className: 'dshus-btn', onClick: function () { setQuickStartOpen(true) } }, t('快速上手')),
        React.createElement('a', { className: 'dshus-btn dshus-icon-btn', href: 'https://github.com/Jockjrop/dsh-usage-stats/issues', target: '_blank', rel: 'noopener noreferrer', 'data-dshus-tip': t('问题反馈'), 'aria-label': t('问题反馈') },
          React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
            React.createElement('path', { d: 'M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z' }))),
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
            React.createElement('div', { className: 'v', 'data-dshus-tip': typeof v === 'number' ? fmtExact(v) : undefined }, display),
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
          React.createElement('td', { 'data-dshus-tip': fmtExact(m.billed || 0), style: { textAlign: 'right', fontWeight: 600 } }, fmt(m.billed || 0)),
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
            React.createElement('a', { className: 'dshus-brand-meta dshus-brand-link', href: 'https://github.com/Jockjrop/dsh-usage-stats', target: '_blank', rel: 'noopener noreferrer', 'data-dshus-tip': t('在 GitHub 查看 dsh-usage-stats') }, 'dsh-usage-stats'),
            PLUGIN_VERSION !== '__DSH_USAGE_STATS_VERSION__' && React.createElement('span', { className: 'dshus-brand-meta' }, 'v' + PLUGIN_VERSION),
          ),
          tools,
        ),
        React.createElement('div', { className: 'dshus-tabs', role: 'tablist', 'aria-label': t('用量统计页面') },
          React.createElement('button', { id: 'dshus-tab-usage', type: 'button', role: 'tab', 'aria-selected': tab === 'usage', 'aria-controls': 'dshus-usage-panel', tabIndex: tab === 'usage' ? 0 : -1, className: 'dshus-tab' + (tab === 'usage' ? ' on' : ''), onClick: function () { changeTab('usage') }, onKeyDown: onTabKeyDown }, t('用量')),
          showLogs && React.createElement('button', { id: 'dshus-tab-logs', type: 'button', role: 'tab', 'aria-selected': tab === 'logs', 'aria-controls': 'dshus-logs-panel', tabIndex: tab === 'logs' ? 0 : -1, className: 'dshus-tab' + (tab === 'logs' ? ' on' : ''), onClick: function () { changeTab('logs') }, onKeyDown: onTabKeyDown }, t('日志')),
          showCosts && React.createElement('button', { id: 'dshus-tab-costs', type: 'button', role: 'tab', 'aria-selected': tab === 'costs', 'aria-controls': 'dshus-costs-panel', tabIndex: tab === 'costs' ? 0 : -1, className: 'dshus-tab' + (tab === 'costs' ? ' on' : ''), onClick: function () { changeTab('costs') }, onKeyDown: onTabKeyDown }, t('成本')),
          showRules && React.createElement('button', { id: 'dshus-tab-rules', type: 'button', role: 'tab', 'aria-selected': tab === 'rules', 'aria-controls': 'dshus-rules-panel', tabIndex: tab === 'rules' ? 0 : -1, className: 'dshus-tab' + (tab === 'rules' ? ' on' : ''), onClick: function () { changeTab('rules') }, onKeyDown: onTabKeyDown }, t('规则')),
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
                'data-dshus-tip': t('每个供应商 · 模型组合单独统计'),
              }, t('供应商·模型')),
              React.createElement('button', {
                type: 'button',
                className: 'dshus-range-btn' + (groupByModel ? ' on' : ''),
                onClick: function () { setGroupByModel(true); setTableExpanded(false) },
                'data-dshus-tip': t('合并同名模型，不区分供应商'),
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
                  React.createElement('th', null, t('用量 Tokens')),
                  React.createElement('th', null, t('占比')),
                  React.createElement('th', { className: 'dshus-table-bar-cell' }, t('分布条')),
                  React.createElement('th', null, t('最后活跃时间')),
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
        showLogs && logsVisited && React.createElement('div', { id: 'dshus-logs-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-logs', tabIndex: 0, hidden: tab !== 'logs' },
          React.createElement(LogsPanel, { api: api, active: tab === 'logs' }),
        ),
        showCosts && costsVisited && React.createElement('div', { id: 'dshus-costs-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-costs', tabIndex: 0, hidden: tab !== 'costs' },
          React.createElement(CostsPanel, { api: api, active: tab === 'costs' }),
        ),
        showRules && rulesVisited && React.createElement('div', { id: 'dshus-rules-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-rules', tabIndex: 0, hidden: tab !== 'rules' },
          React.createElement(RulesPanel, { api: api, active: tab === 'rules' }),
        ),
        quotaVisited && React.createElement('div', { id: 'dshus-quota-panel', className: 'dshus-quota-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-quota', tabIndex: 0, hidden: tab !== 'quota', 'data-empty-label': t('连接模型服务后，可读取的配额会显示在这里') },
          quotaError && React.createElement('div', { className: 'dshus-error', role: 'alert' }, uiError(quotaError)),
          React.createElement(ProviderQuotasPanel, { api: api, key: 'providers', active: tab === 'quota', revision: quotaRevision, refreshing: quotaLoading, snapshot: quotaSnapshots.providers },
            React.createElement(AccountQuotasPanel, { api: api, key: 'accounts', active: tab === 'quota', revision: quotaRevision, refreshing: quotaLoading, snapshot: quotaSnapshots.accounts })),
        ),
        showModelDetection && detectionVisited && React.createElement('div', { id: 'dshus-detection-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-detection', hidden: tab !== 'detection' }, React.createElement(DetectionPanel, { api: api, active: tab === 'detection', onUsageUpdated: load, uiSession: props.uiSession, uiWorkspace: props.uiWorkspace, modelDirectories: props.modelDirectories })),
        tab === 'control' && React.createElement('div', { id: 'dshus-control-panel', role: 'tabpanel', 'aria-labelledby': 'dshus-tab-control' },
          React.createElement('section', { className: 'dshus-star-banner', role: 'note', 'aria-label': t('支持这个插件') },
            React.createElement('span', { className: 'dshus-star-banner-icon', 'aria-hidden': 'true' },
              React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor' },
                React.createElement('path', { d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z' }))),
            React.createElement('p', { className: 'dshus-star-banner-text' }, t('如果 dsh-usage-stats 帮到了你，请在 GitHub 点个 Star')),
            React.createElement('a', { className: 'dshus-btn dshus-star-banner-action', href: 'https://github.com/Jockjrop/dsh-usage-stats', target: '_blank', rel: 'noopener noreferrer' }, t('去点 Star'))),
          controlsBody),
        ),
        quickStartOpen && React.createElement(QuickStartDialog, {
          showModelDetails: controlSettings.showModelDetails === true,
          showTokenSpeed: controlSettings.showTokenSpeed !== false,
          showLogs: showLogs, showCosts: showCosts, showRules: showRules, showModelDetection: showModelDetection,
          onClose: function () { setQuickStartOpen(false) },
        }),
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

var SEAT_COLOR_DEFAULT = 'blue'

var SEAT_COLOR_LABELS = { red: '红色', green: '绿色', yellow: '黄色', blue: '蓝色', purple: '紫色' }

// A missing or unknown value (an older store, a hand-edited file) falls back
// to the blue palette instead of leaving the selector unthemed.
function seatNormalizeColor(color) {
      for (var i = 0; i < SEAT_COLOR_CHOICES.length; i++) {
        if (SEAT_COLOR_CHOICES[i].name === color) return color
      }
      return SEAT_COLOR_DEFAULT
    }

// The seat is painted in the page, so one attribute on <html> retints every
// mounted selector — including ones the host has cached for other sessions.
function seatApplyColor(color) {
      var next = seatNormalizeColor(color)
      try {
        if (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset) {
          document.documentElement.dataset.dshusSeatColor = next
        }
      } catch (error) { /* best-effort theming */ }
      return next
    }

function seatClearColor() {
      try {
        if (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset) {
          delete document.documentElement.dataset.dshusSeatColor
        }
      } catch (error) { /* best-effort theming */ }
    }

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

/**
 * Render whatever the host reported for a rejected model switch.
 *
 * `ModelDirectory.select()` resolves with the Remote failure result
 * (`{ ok: false, error: { code, message } }`) instead of throwing, and an
 * adapter may also reject outright, so normalize both shapes into one line.
 */
function seatFailureText(result) {
      if (result && typeof result === 'object' && result.error && typeof result.error === 'object') {
        var code = result.error.code ? String(result.error.code) : ''
        var message = result.error.message ? String(result.error.message) : ''
        if (code && message) return code + ': ' + message
        return message || code || t('切换模型失败')
      }
      var direct = result && typeof result === 'object' && typeof result.message === 'string' ? result.message : ''
      if (direct) return direct
      if (typeof result === 'string' && result) return result
      return t('切换模型失败')
    }

/**
 * Read the deployment default model — the selection a session that does not
 * exist yet will start with.
 *
 * A composer that paints before its session is created has no model directory
 * (the host resolves one per retained session scope), so a per-session switch is
 * impossible there. The host owns the default (`agentDefaultModel`) and writes
 * it after every session-level switch, so the seat drives that instead.
 */
function seatSaveDefaultModel(selection) {
      var body = { provider: selection.provider, model: selection.model }
      if (selection.reasoningEffort !== undefined) body.reasoningEffort = selection.reasoningEffort
      return Promise.resolve(fetch('/api/dsh-usage-stats/default-model', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
      }).then(readJson))
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

/**
 * Last-resort guard: a composer seat that throws would be dropped from its slot
 * cell for the rest of the page life, and the cell would then render nothing at
 * all. Reporting the failure and painting a disabled trigger keeps the composer
 * honest instead of blank.
 */
function ModelSeat(props) {
  try {
    return ModelSeatBody(props)
  } catch (error) {
    seatDiag('seat/render-threw', { message: (error && error.message) || String(error) })
    console.warn('[dsh-usage-stats] 高级模型选择器: render failed', error)
    return React.createElement('button', { type: 'button', className: 'rs2-root rs2-trigger', disabled: true }, t('选择模型'))
  }
}

function ModelSeatBody(props) {
      useLocaleRevision()
      var store = props.store
      var state = React.useSyncExternalStore(
        function (onChange) { return store ? store.subscribe(onChange) : function () {} },
        function () { return store ? store.getSnapshot() : null },
      )
      // Render evidence: without it a seat that mounts and injects but paints
      // nothing is indistinguishable from one that never reached the composer.
      if (seatDiagSent < 30) {
        seatDiag('seat/render', {
          available: props.available !== false,
          store: !!store,
          state: !!state,
          status: state ? state.status : undefined,
          current: state && state.current ? state.current.model : null,
          groups: state && state.groups ? state.groups.length : undefined,
          locked: props.locked === true,
        })
      }
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
      var failureState = React.useState(null)
      var failure = failureState[0]
      var setFailure = failureState[1]
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
        setFailure(null)
        // The host reports a failed switch as a result, not as a throw — and a
        // switch that silently does nothing is indistinguishable from a broken
        // selector, so keep the menu open and show what the host said.
        return Promise.resolve(props.select(selection)).then(function (result) {
          if (result !== false && !(result && result.ok === false)) {
            setOpt(null)
            return
          }
          setFailure({ text: seatFailureText(result), selection: selection })
          setOpen(true)
        }, function (error) {
          setFailure({ text: seatFailureText(error), selection: selection })
          setOpen(true)
        }).finally(function () {
          selectingRef.current = false
          setOpt(null)
        })
      }
      var stops = []
      var value = 0
      var committedIdx = 0
      if (current && reasoning && reasoning.efforts.length > 0) {
        stops = seatEffortStops(reasoning)
        var idx = -1
        for (var si = 0; si < stops.length; si++) { if (stops[si].id === current.reasoningEffort) { idx = si; break } }
        if (idx === -1) for (var sj = 0; sj < stops.length; sj++) { if (stops[sj].id === undefined) { idx = sj; break } }
        if (idx === -1) idx = 0
        committedIdx = idx
        value = opt && opt.provider === current.provider && opt.model === current.model && opt.value !== idx ? opt.value : idx
      }
      // A brand-new session has no projected model yet, so there is no effort
      // ladder to drag. Keeping the menu on "advanced" then shows an empty rail
      // and hides the model list — the selector looks broken exactly while the
      // user picks the session's first model. Mirror the official seat: with no
      // current model (or no effort levels) the menu opens on the model list.
      var effortPane = stops.length > 0
      var pane = mode === 'models' || !effortPane ? 'models' : 'advanced'
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
      if (pane === 'models') {
        body = React.createElement(React.Fragment, null,
          effortPane ? React.createElement('button', { type: 'button', className: 'rs2-back', onClick: function () { setMode('advanced') } }, t('‹ 模型')) : null,
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
            setFailure(null)
            if (props.available) props.load()
            setOpen(function (v) {
              var next = !v
              if (next) setMode(effortPane ? 'advanced' : 'models')
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
        open && React.createElement('div', { className: 'rs2-menu' },
          failure ? React.createElement('div', { className: 'rs2-error', role: 'alert' },
            React.createElement('span', { className: 'rs2-error-text' }, failure.text),
            React.createElement('button', {
              type: 'button',
              className: 'rs2-retry',
              onClick: function () {
                // Retry the rejected switch itself; only fall back to reloading
                // the catalog when the failure carried no selection.
                var rejected = failure
                setFailure(null)
                if (rejected.selection) commitSelection(rejected.selection)
                else if (props.available) props.load()
              },
            }, t('重试'))) : null,
          state.defaultModel === true ? React.createElement('div', { className: 'rs2-hint' }, t('新会话默认模型，创建后生效')) : null,
          body))
    }

function seatDisposer() {
      // `stores` holds every per-session seat store the seat minted, so unmounting
      // the selector also stops their pending resolve timers and mirroring.
      var state = { disposed: false, disposer: undefined, fiber: undefined, stores: [], timers: [] }
      function dispose() {
        if (state.disposed) return
        state.disposed = true
        if (typeof state.disposer === 'function') state.disposer()
        // The registration is owned by the seat's child fiber, so disposing it
        // also releases the slot controller — including when the fiber was
        // still waiting for its services.
        if (state.fiber && typeof state.fiber.dispose === 'function') {
          try {
            var pending = state.fiber.dispose()
            if (pending && typeof pending.catch === 'function') pending.catch(function () {})
          } catch (error) { /* fiber already disposed */ }
        }
        state.timers.slice().forEach(function (stop) {
          try { if (typeof stop === 'function') stop() } catch (error) { /* timer already fired */ }
        })
        state.timers.length = 0
        state.stores.slice().forEach(function (store) {
          try { store.dispose() } catch (error) { /* store already disposed */ }
        })
        state.stores.length = 0
      }
      return {
        state: state,
        dispose: dispose,
      }
    }

// A brand-new session paints the composer seat before its session scope is
// retained, and `modelDirectories.directoryFor(sessionId)` fails loud on
// unknown sessions ("resolved no scope" / "resolved no binding"). The host
// caches every inject result per session binding and permanently abdicates any
// entry that throws while rendering, so neither throwing nor answering
// "unavailable" from `inject` is survivable: both leave the composer model area
// empty for the rest of that session. The seat therefore hands the component a
// live store that starts pending, resolves once the session's scope exists, and
// notifies on every transition — the trigger paints immediately and fills in
// the real model as soon as the directory can be resolved.
var SEAT_RESOLVE_ATTEMPTS = 48
var SEAT_RESOLVE_DELAY = 90

var SEAT_PENDING_SNAPSHOT = {
  current: null,
  routable: null,
  groups: [],
  failures: [],
  status: 'loading',
  pending: null,
  error: null,
}

var SEAT_UNRESOLVED_SNAPSHOT = {
  current: null,
  routable: null,
  groups: [],
  failures: [],
  status: 'error',
  pending: null,
  error: 'model directory unresolved',
}

// One catalog per host generation, mirroring the official `ModelCatalogDirectory`.
// The catalog is the only model source that needs no session scope, so it is what
// a brand-new session can render at all; sharing it also keeps every seat from
// repeating the same remote call.
var SEAT_CATALOG_TTL = 15000

var seatCatalog = { owner: null, value: null, status: 'idle', error: null, at: 0 }
var seatCatalogWatchers = []

// Deployment default written by a seat, keyed by session: rebuilding the seat for
// the same session must show the pick instead of snapping back to the config value.
var seatDefaultChoices = {}

var seatCatalogLogged = ''

function seatCatalogNotify() {
  var stamp = seatCatalog.status + '|' + (seatCatalog.error || '')
  if (stamp !== seatCatalogLogged) {
    seatCatalogLogged = stamp
    seatDiag('seat/catalog', { status: seatCatalog.status, error: seatCatalog.error || null })
  }
  seatCatalogWatchers.slice().forEach(function (fn) {
    try { fn() } catch (error) { console.warn('[dsh-usage-stats] 高级模型选择器: catalog watcher failed', error) }
  })
}

/**
 * Pull the host-generation model catalog through the shared remote namespace.
 *
 * @param remote - the `remote` client namespace (`ctx.get('remote')`).
 * @param force - reload even when a ready catalog is already cached.
 */
function seatCatalogLoad(remote, force) {
  if (remote === null || remote === undefined) {
    seatCatalog.status = 'error'
    seatCatalog.error = 'remote namespace unavailable'
    seatCatalogNotify()
    return
  }
  var session = remote.session
  if (!session || typeof session.modelCatalog !== 'function') {
    // Not transient: without the namespace there is nothing to retry, so say so
    // instead of leaving a brand-new session on "loading" forever.
    seatCatalog.status = 'error'
    seatCatalog.error = 'model catalog unavailable in this host'
    seatCatalogNotify()
    return
  }
  // The catalog belongs to a host generation: a different remote namespace means
  // a different host, so the cached view must not bleed across.
  if (seatCatalog.owner !== remote) {
    seatCatalog.owner = remote
    seatCatalog.value = null
    seatCatalog.status = 'idle'
    seatCatalog.error = null
    seatCatalog.at = 0
  }
  if (seatCatalog.status === 'loading') return
  if (force !== true && seatCatalog.status === 'ready' && seatCatalog.value !== null) return
  seatCatalog.status = 'loading'
  seatCatalog.error = null
  seatCatalogNotify()
  var pending
  try {
    pending = session.modelCatalog()
  } catch (error) {
    seatCatalog.status = 'error'
    seatCatalog.error = (error && error.message) || String(error)
    seatCatalogNotify()
    return
  }
  Promise.resolve(pending).then(function (response) {
    if (!response || !response.ok) {
      var failure = response && response.error
      seatCatalog.status = 'error'
      seatCatalog.error = failure && failure.code ? failure.code + ': ' + failure.message : 'model catalog unavailable'
      seatCatalogNotify()
      return
    }
    seatCatalog.value = response.value || null
    seatCatalog.status = seatCatalog.value === null ? 'error' : 'ready'
    seatCatalog.error = seatCatalog.value === null ? 'empty model catalog' : null
    seatCatalog.at = Date.now()
    seatCatalogNotify()
  }, function (error) {
    seatCatalog.status = 'error'
    seatCatalog.error = (error && error.message) || String(error)
    seatCatalogNotify()
  })
}

/** True when the cached catalog is old enough to justify a refresh. */
function seatCatalogStale() {
  if (seatCatalog.status !== 'ready' || seatCatalog.value === null) return true
  return (Date.now() - seatCatalog.at) > SEAT_CATALOG_TTL
}

// The desktop renderer console is not reachable from the host, so every seat
// decision that used to fail silently is reported to the control route and
// appended to ~/.dsh/usage-stats-seat-diag.log.
var seatDiagSent = 0

function seatDiag(event, data) {
  if (seatDiagSent >= 120) return
  seatDiagSent++
  try {
    var body = { event: event }
    if (data) Object.keys(data).forEach(function (key) { if (data[key] !== undefined) body[key] = data[key] })
    var request = fetch('/api/dsh-usage-stats/seat-diag', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (request && typeof request.catch === 'function') request.catch(function () {})
  } catch (error) {
    /* diagnostics must never break the seat */
  }
}

/**
 * Per-session seat store that survives a late-arriving model directory.
 *
 * `modelDirectories.directoryFor` fails while a session's scope/binding is
 * still being materialized, which is exactly what a brand-new session looks
 * like on its first frames. Failures are retried on a fibre-owned timer rather
 * than reported as an unavailable seat; once the directory exists the store
 * mirrors its snapshots, so the component keeps the official
 * `{ current, groups, status, error }` view.
 *
 * @param models - the `modelDirectories` client service.
 * @param sessionId - session whose directory this seat renders.
 * @param retry - schedules `fn` after `delay` ms, owned by the plugin fibre.
 */
function createSeatStore(models, sessionId, retry, hooks) {
      hooks = hooks || {}
      var directory = null
      var listeners = []
      var stopMirror = null
      var attempts = 0
      var disposed = false
      var unresolved = false
      var cache = null
      // Fallback view for a composer whose session does not exist yet. Such a
      // session owns no model directory, so the seat shows the shared catalog and
      // the deployment default the new session will start with, and writes that
      // default when the user picks something.
      seatCatalogWatchers.push(watchCatalog)
      function emit() {
        cache = null
        listeners.slice().forEach(function (fn) {
          try { fn() } catch (error) { console.warn('[dsh-usage-stats] 高级模型选择器: store listener failed', error) }
        })
      }
      function watchCatalog() {
        emit()
      }
      function loadCatalog(force) {
        if (disposed) return
        seatCatalogLoad(hooks.remote, force === true)
      }
      /**
       * Snapshot of the fallback view, rebuilt only when something changed so
       * `useSyncExternalStore` sees a stable reference between renders.
       */
      function fallbackSnapshot() {
        if (cache !== null) return cache
        var value = seatCatalog.value
        var groups = (value && value.groups) || []
        var failures = (value && value.failures) || []
        cache = {
          current: seatDefaultChoices[sessionId] || (value && value.default) || null,
          routable: null,
          groups: groups,
          failures: failures,
          status: seatCatalog.status === 'error' ? 'error' : 'ready',
          pending: null,
          error: seatCatalog.status === 'error' ? seatCatalog.error : null,
          // Tells the component this seat drives the deployment default rather
          // than the current session's model.
          defaultModel: true,
        }
        return cache
      }
      function selectDefault(selection) {
        return seatSaveDefaultModel(selection).then(function (response) {
          if (response && response.ok === false) {
            return { ok: false, error: { code: 'model/default-model', message: response.error || '' } }
          }
          // `saveSelection()` returns quietly when the deployment has no config
          // editor, so an "ok" answer alone does not prove the pick survives the
          // next session; say so instead of showing a switch that did nothing.
          if (response && response.persisted === false) {
            return { ok: false, error: { code: 'model/not-persisted', message: t('默认模型未能写入配置') } }
          }
          seatDefaultChoices[sessionId] = (response && response.selection) || selection
          emit()
          return { ok: true }
        }, function (error) {
          return { ok: false, error: { code: 'model/default-model', message: (error && error.message) || String(error) } }
        })
      }
      function adopt(found) {
        directory = found
        unresolved = false
        attempts = 0
        var source = found && found.store
        if (source && typeof source.subscribe === 'function') {
          var stop = source.subscribe(emit)
          if (typeof stop === 'function') stopMirror = stop
        }
        // Adopting is this seat's mount: the component already ran its own load
        // effect against the pending store, so the catalog has to be pulled here.
        try {
          var pending = found && found.load()
          if (pending && typeof pending.catch === 'function') pending.catch(function () {})
        } catch (error) {
          console.warn('[dsh-usage-stats] 高级模型选择器: load failed', error)
        }
      }
      function schedule() {
        if (disposed || directory !== null) return
        if (attempts >= SEAT_RESOLVE_ATTEMPTS) {
          if (unresolved) return
          unresolved = true
          console.warn('[dsh-usage-stats] 高级模型选择器: directoryFor never resolved for session', sessionId)
          emit()
          return
        }
        var delay = Math.min(SEAT_RESOLVE_DELAY + attempts * 30, 1200)
        attempts++
        retry(resolve, delay)
      }
      function resolve() {
        if (disposed || directory !== null) return directory
        var found
        try {
          found = models.directoryFor(sessionId)
        } catch (error) {
          // Unknown-session timing, not a broken seat: wait for the scope. The
          // shared catalog needs no session scope, so pull it in the meantime —
          // that is what lets a not-yet-created session list models at all.
          if (attempts < 3) seatDiag('seat/directory-error', { session: String(sessionId), message: (error && error.message) || String(error) })
          loadCatalog()
          schedule()
          return null
        }
        if (!found) {
          schedule()
          return null
        }
        adopt(found)
        emit()
        return found
      }
      var store = {
        getSnapshot: function () {
          var source = directory && directory.store
          if (source && typeof source.getSnapshot === 'function') return source.getSnapshot()
          if (seatCatalog.value !== null) return fallbackSnapshot()
          return unresolved ? SEAT_UNRESOLVED_SNAPSHOT : SEAT_PENDING_SNAPSHOT
        },
        subscribe: function (fn) {
          if (typeof fn !== 'function') return function () {}
          listeners.push(fn)
          return function () {
            var index = listeners.indexOf(fn)
            if (index >= 0) listeners.splice(index, 1)
          }
        },
      }
      return {
        store: store,
        resolve: resolve,
        resolved: function () { return directory !== null },
        load: function () {
          // An explicit load (mount, or a click on the trigger) is a fresh
          // chance: reset the budget so a directory that appeared later is
          // still picked up after the automatic retries gave up.
          if (directory === null && unresolved) {
            unresolved = false
            attempts = 0
          }
          var had = directory !== null
          var found = resolve()
          if (!found) {
            // A session that has no directory yet still opens a usable menu: the
            // shared catalog needs no scope, so refresh it when it went stale.
            loadCatalog(seatCatalogStale())
            return
          }
          // A directory adopted by this very call already pulled the catalog.
          if (!had) return
          try {
            var pending = found.load()
            if (pending && typeof pending.catch === 'function') pending.catch(function () {})
          } catch (error) {
            console.warn('[dsh-usage-stats] 高级模型选择器: load failed', error)
          }
        },
        // Keep the official `{ ok, error }` outcome: swallowing a failure into a
        // boolean left the menu open with no explanation, which reads as a dead
        // selector.
        select: function (selection) {
          var found = resolve()
          if (!found) return selectDefault(selection)
          return Promise.resolve(found.select(selection)).then(function (result) {
            return result === undefined ? { ok: true } : result
          }, function (error) {
            return { ok: false, error: { code: 'select/failed', message: (error && error.message) || String(error) } }
          })
        },
        dispose: function () {
          disposed = true
          var index = seatCatalogWatchers.indexOf(watchCatalog)
          if (index >= 0) seatCatalogWatchers.splice(index, 1)
          if (typeof stopMirror === 'function') {
            try { stopMirror() } catch (error) { /* directory already gone */ }
          }
          stopMirror = null
          listeners.length = 0
        },
      }
    }

/**
 * Priorities currently registered in the composer's model cell. It answers the
 * one question the seat cannot answer from inside: is this registration really
 * the winning entry of the cell, or is something else shadowing it?
 */
function seatEntryPriorities(slots) {
  if (typeof slots.entries !== 'function') return null
  try {
    var entries = slots.entries('conversation.input.model') || []
    return entries.map(function (entry) {
      return entry && entry.priority !== undefined ? entry.priority : null
    })
  } catch (error) {
    return null
  }
}

function registerModelSeat(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) {
        seatDiag('seat/no-slots')
        console.warn('[dsh-usage-stats] 高级模型选择器: slots service unavailable')
        return null
      }
      var models = ctx.get('modelDirectories')
      var sessions = ctx.get('sessions')
      // The shared catalog lives on the remote namespace; it is the only model
      // source available before a session's scope exists, so the seat keeps it
      // optional and degrades to the pending view without it. Client plugins
      // reach it as `ctx.remote` (the declared `remote` service); `ctx.get` is
      // kept as a fallback for hosts that expose it as a plain service instead.
      var remote = ctx.remote !== undefined ? ctx.remote : ctx.get('remote')
      if (models === undefined || typeof models.directoryFor !== 'function' || sessions === undefined || typeof sessions.subagentAddress !== 'function') {
        seatDiag('seat/no-services', { models: models !== undefined, sessions: sessions !== undefined, remote: remote !== undefined })
        console.warn('[dsh-usage-stats] 高级模型选择器: modelDirectories/sessions service unavailable')
        return null
      }
      var handle = seatDisposer()
      // `ModelDirectoryResolver.directoryFor` runs on its caller's context and
      // reads `ctx.sessions` / `ctx.remote.session` there. Declaring those at
      // the top level would make the whole settings section wait for
      // `modelDirectories`, which hosts without the official selector do not
      // have; a child fiber scoped to the seat's services satisfies the guard
      // without turning them into plugin-wide dependencies.
      try {
        handle.state.fiber = ctx.inject(['slots', 'modelDirectories', 'sessions', 'remote', 'remote.session'], function (seatCtx) {
          mountModelSeat(seatCtx, handle)
        })
      } catch (error) {
        seatDiag('seat/inject-threw', { message: (error && error.message) || String(error) })
        console.warn('[dsh-usage-stats] 高级模型选择器: scoped inject failed', error)
        return null
      }
      return handle
    }

function mountModelSeat(ctx, handle) {
      var slots = ctx.get('slots')
      var models = ctx.get('modelDirectories')
      var sessions = ctx.get('sessions')
      var remote = ctx.remote !== undefined ? ctx.remote : ctx.get('remote')
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
      // Retry timers for seat stores still waiting on a session scope. They are
      // owned by the plugin fibre (ctx.timeout) and cancelled when the seat
      // unmounts, so a disabled selector leaves nothing running.
      function later(fn, delay) {
        if (handle.state.disposed || typeof ctx.timeout !== 'function') return
        var stop
        var fire = function () {
          var index = handle.state.timers.indexOf(stop)
          if (index >= 0) handle.state.timers.splice(index, 1)
          fn()
        }
        try {
          stop = ctx.timeout(fire, delay)
        } catch (error) {
          console.warn('[dsh-usage-stats] 高级模型选择器: retry timer failed', error)
          return
        }
        if (typeof stop === 'function') handle.state.timers.push(stop)
      }
      slots.inject('conversation.input.model', function () {
        if (handle.state.disposed) return undefined
        var disposer
        try {
          disposer = slots.register({
            name: 'conversation.input.model',
            // A negative priority places this enabled seat ahead of the official selector.
            priority: -1,
            locale: 'model',
            inject: function (sessionId) {
              var addressed = true
              try {
                addressed = sessions.subagentAddress(sessionId) === undefined
              } catch (error) {
                addressed = true
              }
              // Agent-addressed subagent sessions cannot switch models; the
              // official seat renders nothing for them either (`if (!available)
              // return null`), so mirroring that keeps the composer identical.
              if (!addressed) {
                seatDiag('seat/inject-addressed', { session: String(sessionId) })
                return { available: false }
              }
              var seat = createSeatStore(models, sessionId, later, { remote: remote })
              handle.state.stores.push(seat)
              // The host caches one inject result per session, so this list grows
              // with the sessions the composer was ever painted for; keep it bounded
              // by retiring the oldest store (a session that is painted again mints
              // a fresh one through the same path).
              while (handle.state.stores.length > 64) {
                var oldest = handle.state.stores.shift()
                try { oldest.dispose() } catch (error) { /* store already disposed */ }
              }
              // Resolve eagerly: a retained session (every session whose composer
              // already paints) skips the pending state entirely, so the trigger
              // still shows the real model on its first frame.
              seat.resolve()
              seatDiag('seat/inject', {
                session: String(sessionId),
                resolved: seat.resolved(),
                catalog: seatCatalog.status,
                remote: remote !== undefined,
              })
              return {
                available: true,
                store: seat.store,
                load: seat.load,
                select: seat.select,
              }
            },
          }, function (slotProps) {
            return React.createElement(ModelSeat, Object.assign({}, slotProps, { scheduleClear: scheduleClear }))
          })
        } catch (error) {
          seatDiag('seat/register-threw', { message: (error && error.message) || String(error) })
          console.warn('[dsh-usage-stats] 高级模型选择器: register failed', error)
          return undefined
        }
        if (handle.state.disposed) {
          if (typeof disposer === 'function') disposer()
          return undefined
        }
        seatDiag('seat/registered', { priority: -1, entries: seatEntryPriorities(slots) })
        handle.state.disposer = disposer
        return disposer
      })
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
        seatApplyColor(control && control.settings && control.settings.modelSeatColor)
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
          seatClearColor()
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
  if (applyStarted) return
  applyStarted = true
  mountClient(ctx, 0)
}

// The client half must never lose the race against the services it renders
// into. `dsh.client.inject` in package.json is what normally makes the host wait
// for them, but a host that activates this plugin without that gate (or a slot
// service that appears a frame later) would otherwise leave the caller with no
// seat and no settings section at all, silently and permanently.
var applyStarted = false
var APPLY_RETRY_LIMIT = 40

function mountClient(ctx, attempt) {
  var slots = ctx.get('slots')
  if (slots) {
    if (attempt > 0) seatDiag('apply/delayed', { attempts: attempt })
    mountClientOnce(ctx, slots)
    return
  }
  if (attempt >= APPLY_RETRY_LIMIT) {
    seatDiag('apply/no-slots', { attempts: attempt })
    console.warn('[dsh-usage-stats] 用量统计: slots service never appeared; client UI not mounted')
    return
  }
  var delay = Math.min(50 + attempt * 50, 1000)
  var again = function () { mountClient(ctx, attempt + 1) }
  if (typeof ctx.timeout === 'function') {
    try { ctx.timeout(again, delay); return } catch (error) { /* fall through to window timer */ }
  }
  if (typeof window.setTimeout === 'function') window.setTimeout(again, delay)
}

function mountClientOnce(ctx, slots) {
  seatDiag('apply/mounted', {
    slots: slots !== undefined,
    locale: ctx.get('locale') !== undefined,
    timer: typeof ctx.timeout === 'function',
    remote: ctx.remote !== undefined || ctx.get('remote') !== undefined,
    modelDirectories: ctx.get('modelDirectories') !== undefined,
    sessions: ctx.get('sessions') !== undefined,
    seatPref: seatReadEnabledPref(),
  })
  registerLocale(ctx)
  // An abdicated entry is silently dropped from its cell for the rest of the
  // page life, and that is the difference between "our seat is hidden" and "the
  // seat never registered" — so record every abdication the host reports.
  if (typeof slots.onEntryError === 'function') {
    try {
      ctx.effect(function () {
        return slots.onEntryError(function (slotKey, entry, error) {
          seatDiag('slot/entry-error', {
            slot: slotKey === undefined ? null : String(slotKey),
            message: (error && error.message) || String(error),
          })
        })
      }, 'dsh-usage-stats: slot diagnostics')
    } catch (error) {
      /* diagnostics only */
    }
  }
  var api = new UsageApi()
  // Final evidence for the composer seat: does our trigger actually exist in the
  // DOM, does it have a box, and is the host showing a dead cell instead?
  ctx.effect(function () {
    if (typeof ctx.timeout !== 'function') return undefined
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return undefined
    var schedule = ctx.timeout
    var stops = []
    function probe(delay, label) {
      stops.push(schedule(function () {
        var trigger = null
        try { trigger = typeof document.querySelector === 'function' ? document.querySelector('.rs2-trigger') : null } catch (error) { trigger = null }
        var rect = null
        try { rect = trigger && typeof trigger.getBoundingClientRect === 'function' ? trigger.getBoundingClientRect() : null } catch (error) { rect = null }
        var dead = 0
        try { dead = typeof document.querySelectorAll === 'function' ? document.querySelectorAll('[data-slot-error]').length : 0 } catch (error) { dead = 0 }
        seatDiag('seat/dom', {
          at: label,
          trigger: trigger !== null,
          width: rect ? Math.round(rect.width) : null,
          height: rect ? Math.round(rect.height) : null,
          deadCells: dead,
        })
      }, delay))
    }
    probe(1500, '1.5s')
    probe(5000, '5s')
    return function () { stops.forEach(function (stop) { try { stop() } catch (error) { /* already fired */ } }) }
  }, 'dsh-usage-stats: seat dom probe')
  injectStyles()
  ctx.effect(bindHoverTips, 'dsh-usage-stats: hover tips')
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
  ctx.effect(function () { return slots.inject('sidebar.footer.action', function () {
    return slots.register({ name: 'sidebar.footer.action', id: SECTION_ID + '-dashboard', locale: SECTION_ID }, UsageDashboardTrigger)
  }) }, 'dsh-usage-stats: dashboard shortcut')
  ctx.effect(function () { return slots.inject('shell.overlay', function () {
    return slots.register({ name: 'shell.overlay', id: SECTION_ID + '-dashboard', locale: SECTION_ID }, function () {
      return React.createElement(UsageDashboard, { api: api })
    })
  }) }, 'dsh-usage-stats: dashboard overlay')
}

// `modelDirectories` stays out of this list so a host without the official
// model selector still mounts the settings section; the composer seat takes it
// through a scoped `ctx.inject` (see registerModelSeat). The services that
// `ModelDirectoryResolver.directoryFor` reads on its caller's context —
// `sessions`, `remote` and `remote.session` — are declared here because the
// settings section's model detection also calls `directoryFor` on this fiber,
// where the cordis guard turns an undeclared access into a throw.
// `remote.session` is a separate service from `remote`, so both are required.
exports.inject = ['slots', 'sessions', 'remote', 'remote.session', 'locale', 'timer']; exports.apply = apply; exports.__components = { Heatmap, HeatPager, buildHeatmap, OverviewDetails, TokenSpeedRanking, UsageDisplayControls, ControlsPanel, DetectionPanel, ProviderPicker };
return module.exports
} })
