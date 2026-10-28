/** Locale-aware number/date formatting shared by every panel. */
export function createClientFormat() {
function fmt(n) {
      if (typeof n !== 'number' || !Number.isFinite(n)) return '0'
      if (Math.abs(n) >= 1e9) return Number((n / 1e9).toFixed(2)) + 'B'
      if (Math.abs(n) >= 1e6) return Number((n / 1e6).toFixed(2)) + 'M'
      if (Math.abs(n) >= 1e3) return Number((n / 1e3).toFixed(2)) + 'k'
      return String(Math.round(n))
    }

function fmtExact(n) {
      return Number(n || 0).toLocaleString(currentLanguage() === 'zh' ? 'zh-CN' : currentLanguage() === 'ja' ? 'ja-JP' : 'en-US')
    }

function fmtReset(iso) {
      if (!iso) return ''
      var ms = new Date(iso).getTime() - Date.now()
      if (!(ms > 0)) return t('即将重置')
      var totalMin = Math.ceil(ms / 60000)
      if (totalMin < 60) return t('{minutes} 分钟后重置', { minutes: totalMin })
      var h = Math.floor(totalMin / 60)
      var m = totalMin % 60
      if (h < 24) return t('{hours} 小时{minutes}后重置', { hours: h, minutes: m > 0 ? t(' {minutes} 分', { minutes: m }) : '' })
      var d = Math.floor(h / 24)
      var hr = h % 24
      return t('{days} 天{hours}后重置', { days: d, hours: hr > 0 ? t(' {hours} 小时', { hours: hr }) : '' })
    }

function fmtInTz(dateOrMs, tzMin) {
      if (!dateOrMs) return '—'
      var d = new Date(dateOrMs)
      if (Number.isNaN(d.getTime())) return '—'
      var shifted = new Date(d.getTime() - tzMin * 60000)
      var y = shifted.getUTCFullYear()
      var mo = String(shifted.getUTCMonth() + 1).padStart(2, '0')
      var day = String(shifted.getUTCDate()).padStart(2, '0')
      var h = String(shifted.getUTCHours()).padStart(2, '0')
      var min = String(shifted.getUTCMinutes()).padStart(2, '0')
      var s = String(shifted.getUTCSeconds()).padStart(2, '0')
      return y + '-' + mo + '-' + day + ' ' + h + ':' + min + ':' + s
    }

function fmtFetched(value) {
      if (value === null || value === undefined || value === '') return '—'
      var ms = typeof value === 'number' ? value : new Date(value).getTime()
      if (!Number.isFinite(ms) || ms <= 0) return '—'
      var d = new Date(ms)
      if (Number.isNaN(d.getTime())) return '—'
      var p = function (n) { return String(n).padStart(2, '0') }
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    }

function formatPct(value) {
       var pct = Number(value) || 0
       if (pct === 0) return '0%'
       var digits = 1
       while (digits < 6 && Number(pct.toFixed(digits)) === 0) digits += 1
       return pct.toFixed(digits).replace(/\.?(0+)$/, '') + '%'
     }

function monthShort(dateKey) {
      var parts = String(dateKey).split('-')
      if (parts.length !== 3) return ''
      var month = Number(parts[1])
      if (!(month >= 1 && month <= 12)) return ''
      return new Intl.DateTimeFormat(currentLanguage() === 'en' ? 'en-US' : 'ja-JP', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, 1)))
    }

function fmtCost(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      if (value === 0) return '$0'
      var digits = value >= 1 ? 2 : value >= 0.01 ? 3 : value >= 0.0001 ? 4 : 6
      return '$' + value.toFixed(digits)
    }

function readJson(response) {
      return response.json().then(function (body) {
        if (!response.ok || (body && body.ok === false)) throw new Error((body && body.error) || ('HTTP ' + response.status))
        return body
      })
    }

  return { fmt, fmtExact, fmtReset, fmtInTz, fmtFetched, fmtCost, formatPct, monthShort, readJson }
}
