/** Read-only account quota presentation. */
import { BRAND_ICONS } from './quota-brand-icons.js'
const ACCOUNT_CHANNEL_ORDER = Object.freeze([
  'codearts', 'buddy', 'workbuddy', 'lobsterai', 'qoder', 'qoder-cn', 'trae',
  'cline', 'loomy', 'raccoon', 'minimax', 'gemini',
])

const CHANNEL_LABELS = Object.freeze({
  zen: 'OpenCode Zen 免费模型',
  kilo: 'Kilo 免费模型',
  codearts: '华为 CodeArts',
  buddy: 'WorkBuddy 国内版',
  workbuddy: 'WorkBuddy 国际版',
  lobsterai: '有道 LobsterAI',
  qoder: 'Qoder 国际版',
  'qoder-cn': 'Qoder 中国版',
  trae: 'TRAE',
  cline: 'Cline',
  loomy: '讯飞 Loomy',
  raccoon: '商汤 Raccoon',
  minimax: 'MiniMax Code',
  gemini: 'Google Code Assist',
})

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function num(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isEpoch(value) {
  return Number.isFinite(value) && value > 0
}

function channelLabel(id, reported) {
  if (typeof reported === 'string' && reported.trim() !== '') return reported
  return CHANNEL_LABELS[id] ?? id
}

function quotaSummary(quota) {
  if (!isObject(quota)) return { key: '未知' }
  if (quota.error) return { key: '额度读取失败' }
  if (quota.scope === 'unsupported') return { key: '该渠道不提供额度查询' }
  if (quota.unlimited === true) return { key: '不限额' }
  if (quota.displayOnly === true) {
    const balance = num(quota.balance) ?? num(quota.remaining) ?? num(quota.total)
    return balance === null ? { key: '未知' } : { key: '{count}', params: { count: String(balance) } }
  }
  if (quota.paused === true) return { key: '已暂停调用' }
  const balance = num(quota.remaining) ?? num(quota.balance)
  if (balance === null) return { key: '未知' }
  return { key: '{count}', params: { count: String(balance) } }
}

function readChannels(body) {
  const reported = new Map()
  for (const row of Array.isArray(body?.channels) ? body.channels : []) {
    if (!isObject(row) || typeof row.id !== 'string') continue
    reported.set(row.id, row)
  }
  const ids = [...reported.keys()]
  for (const id of ACCOUNT_CHANNEL_ORDER) if (!reported.has(id)) ids.push(id)
  ids.sort((left, right) => {
    const leftIndex = ACCOUNT_CHANNEL_ORDER.indexOf(left)
    const rightIndex = ACCOUNT_CHANNEL_ORDER.indexOf(right)
    if (leftIndex === -1 && rightIndex === -1) return left < right ? -1 : 1
    if (leftIndex === -1) return -1
    if (rightIndex === -1) return 1
    return leftIndex - rightIndex
  })
  return ids.map((id) => {
    const row = reported.get(id) ?? {}
    const isAnonymous = id === 'zen' || id === 'kilo'
    const known = reported.has(id)
    return {
      id,
      kind: row.kind === 'anonymous' || isAnonymous ? 'anonymous' : 'account',
      displayName: channelLabel(id, row.displayName),
      // Absent from the response means this build has no driver for it.
      implemented: known && row.implemented !== false,
      // `usable` is the host's own verdict: no credential service means no
      // login button, however implemented the driver is.
      usable: known && row.usable !== false && row.implemented !== false,
      unusableReason: typeof row.unusableReason === 'string' ? row.unusableReason : '',
      loginMethods: (Array.isArray(row.loginMethods) ? row.loginMethods : []).filter((v) => typeof v === 'string'),
      supportsRefresh: row.supportsRefresh === true,
      supportsQuota: row.supportsQuota === true,
      supportsClaim: row.supportsClaim === true,
      supportsAutoClaim: row.supportsAutoClaim === true,
      inferenceSupported: known && row.inferenceSupported !== false && row.inferencePaused !== true && row.implemented !== false,
      unsupportedReason: typeof row.pauseReason === 'string' && row.pauseReason !== '' ? row.pauseReason : typeof row.unsupportedReason === 'string' ? row.unsupportedReason : '',
      enabled: row.enabled === true,
      accountStrategy: row.accountStrategy === 'auto' ? 'auto' : 'fixed',
      autoClaim: row.autoClaim === true,
      selectedAccountId: typeof row.selectedAccountId === 'string' ? row.selectedAccountId : null,
      accountCount: num(row.accountCount),
      // Display-only convenience from the host; it never enables a call button.
      modelsAllowed: row.modelsAllowed === true,
      note: typeof row.note === 'string' ? row.note : '',
      billing: typeof row.billing === 'string' ? row.billing : '',
      error: typeof row.error === 'string' ? row.error : '',
    }
  })
}

function readAccounts(body) {
  return (Array.isArray(body?.accounts) ? body.accounts : []).filter(isObject).map((row) => ({
    id: typeof row.id === 'string' ? row.id : '',
    channelId: typeof row.channelId === 'string' ? row.channelId : '',
    displayName: typeof row.displayName === 'string' && row.displayName !== '' ? row.displayName : (typeof row.id === 'string' ? row.id : ''),
    enabled: row.enabled !== false,
    selected: row.selected === true,
    status: ['ready', 'expired', 'pending', 'error', 'unknown'].includes(row.status) ? row.status : 'unknown',
    version: num(row.version),
    credentialVersion: num(row.credentialVersion),
    credentialExpiresAt: isEpoch(row.credentialExpiresAt) ? row.credentialExpiresAt : null,
    lastRefreshAt: isEpoch(row.lastRefreshAt) ? row.lastRefreshAt : null,
    lastErrorCode: typeof row.lastErrorCode === 'string' ? row.lastErrorCode : '',
    detailsLoading: row.detailsLoading === true,
  })).filter((row) => row.id !== '' && row.channelId !== '')
}

function readQuotas(body) {
  const rows = Array.isArray(body?.results) ? body.results : Array.isArray(body?.quotas) ? body.quotas : []
  return rows.filter(isObject).map((row) => ({
    channelId: typeof row.channelId === 'string' ? row.channelId : '',
    accountId: typeof row.accountId === 'string' ? row.accountId : '',
    // `balance: null` means "not reported". It is never turned into a 0.
    balance: num(row.balance),
    remaining: num(row.remaining),
    total: num(row.total),
    unlimited: row.unlimited === true,
    displayOnly: row.displayOnly === true,
    supportsAccountCredits: row.supportsAccountCredits === true,
    supportsFreeRoute: row.supportsFreeRoute === true,
    unit: typeof row.unit === 'string' ? row.unit : null,
    currency: typeof row.currency === 'string' ? row.currency : null,
    scope: ['gift', 'included', 'paid', 'unknown', 'unsupported'].includes(row.scope) ? row.scope : 'unknown',
    // Only a gift/included reading may be presented as a free entitlement.
    callableEntitlement: row.callableEntitlement === true,
    claimedToday: typeof row.claimedToday === 'boolean' ? row.claimedToday : null,
    resetsAt: isEpoch(row.resetsAt) ? row.resetsAt : null,
    observedAt: isEpoch(row.observedAt) ? row.observedAt : null,
    source: typeof row.source === 'string' ? row.source : '',
    paused: row.paused === true,
    stale: row.stale === true,
    pauseReason: typeof row.pauseReason === 'string' ? row.pauseReason : '',
    error: isObject(row.error) ? { code: typeof row.error.code === 'string' ? row.error.code : '', message: typeof row.error.message === 'string' ? row.error.message : '' } : null,
    kinds: readQuotaDetails(row.kinds),
    windows: readQuotaDetails(row.windows),
    tier: typeof row.tier === 'string' ? row.tier.slice(0, 200) : '',
    entitlementModels: (Array.isArray(row.entitlementModels) ? row.entitlementModels : []).filter((model) => typeof model === 'string').slice(0, 100).map((model) => model.slice(0, 200)),
  })).filter((row) => row.channelId !== '')
}

function readQuotaDetails(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 40).filter(isObject).map((row) => ({
    id: typeof row.id === 'string' ? row.id.slice(0, 200) : '',
    name: typeof row.name === 'string' ? row.name.slice(0, 200) : '',
    label: typeof row.label === 'string' ? row.label.slice(0, 200) : typeof row.name === 'string' ? row.name.slice(0, 200) : '',
    kind: typeof row.kind === 'string' ? row.kind : '',
    planId: typeof row.planId === 'string' ? row.planId.slice(0, 200) : '',
    bucketId: typeof row.bucketId === 'string' ? row.bucketId.slice(0, 200) : '',
    source: typeof row.source === 'string' ? row.source.slice(0, 200) : '',
    scope: ['gift', 'included', 'paid', 'unknown', 'unsupported'].includes(row.scope) ? row.scope : 'unknown',
    balance: num(row.balance),
    remaining: num(row.remaining),
    total: num(row.total),
    used: num(row.used),
    active: typeof row.active === 'boolean' ? row.active : null,
    remainingPercent: num(row.remainingPercent),
    usedPercent: num(row.usedPercent),
    unit: typeof row.unit === 'string' ? row.unit.slice(0, 80) : '',
    currency: typeof row.currency === 'string' ? row.currency.slice(0, 80) : '',
    expiresAt: isEpoch(row.expiresAt) ? row.expiresAt : null,
    resetsAt: isEpoch(row.resetsAt) ? row.resetsAt : null,
    observedAt: isEpoch(row.observedAt) ? row.observedAt : null,
    error: isObject(row.error) ? { code: typeof row.error.code === 'string' ? row.error.code.slice(0, 80) : '' } : null,
  }))
}
export function createAccountQuotasClient(React, t, useLocaleRevision) {
const h = React.createElement

function BrandIcon({ brand, small = false }) {
    const key = brand === 'zen' ? 'opencode' : brand === 'gemini' ? (BRAND_ICONS.gemini ? 'gemini' : 'google') : brand
    return h('span', { className: 'dshus-ma-brand-icon' + (small ? ' dshus-ma-brand-icon-small' : ''), 'aria-hidden': true, 'data-brand': brand },
      h('img', { src: BRAND_ICONS[key] ?? BRAND_ICONS.generic, alt: '', width: small ? 24 : 36, height: small ? 24 : 36, draggable: false }))
  }

function quotaText(quota) {
    if (!quota) return t('额度未读取')
    const summary = quotaSummary(quota)
    if (['未知', '不限额', '该渠道不提供额度查询', '已暂停调用'].includes(summary.key)) return t(summary.key)
    const amount = num(summary.params?.count)
    const value = amount === null ? t('未知') : amount.toLocaleString(undefined, { maximumFractionDigits: 6 })
    const unit = ['credit', 'credits', 'point', 'points'].includes(quota.unit) ? t('积分')
      : ['request', 'requests'].includes(quota.unit) ? t('次') : quota.unit || quota.currency || ''
    return value + (unit ? ' ' + unit : '')
  }

function QuotaAccount({ account, quota, channel, loading, onRefresh, refreshButton, formatTime, formatReset }) {
    const [expanded, setExpanded] = React.useState(false)
    const windowBuckets = new Set((quota?.windows ?? []).map(pool => pool.bucketId).filter(Boolean))
    const pools = quota ? [...quota.kinds.filter(pool => pool.kind !== 'window' && !windowBuckets.has(pool.bucketId)), ...quota.windows] : []
    const visible = expanded ? pools : pools.slice(0, 3)
    const value = quota ? quotaText({ ...quota, paused: false, error: null }) : t(channel.supportsQuota ? '未查询' : '该渠道不提供额度查询')
    const hasAmount = quota?.unlimited || num(quota?.remaining) !== null || num(quota?.balance) !== null || quota?.displayOnly && num(quota?.total) !== null
    const isCredit = ['credit', 'credits', 'point', 'points'].includes(quota?.unit)
    const reset = quota?.resetsAt && formatReset(quota.resetsAt)
    return h('div', { className: 'dshus-account-quota-row', 'data-quota-account': account.id },
      h('div', { className: 'dshus-account-quota-summary' },
        h('div', { className: 'dshus-account-quota-identity' },
          h('span', { className: 'dshus-account-quota-name' }, account.displayName),
          account.selected || channel.selectedAccountId === account.id ? h('span', { className: 'dshus-account-quota-meta' }, t('当前账号')) : null,
          quota?.tier ? h('span', { className: 'dshus-account-quota-meta' }, quota.tier) : null,
          account.status === 'expired' ? h('span', { className: 'dshus-account-quota-meta' }, t('凭据已过期')) : null),
        h('div', { className: 'dshus-account-quota-balance' },
          h('span', { className: 'dshus-account-quota-meta' }, t(isCredit ? '剩余积分' : quota?.displayOnly ? '账号余额' : '剩余额度')),
          h('strong', { className: 'dshus-account-quota-value' + (hasAmount ? '' : ' dshus-account-quota-status') }, value)),
        channel.supportsQuota ? refreshButton(() => onRefresh({ channelId: channel.id, accountId: account.id }), loading,
          t('刷新 {name} 配额', { name: account.displayName }), false) : null),
      quota?.error ? h('p', { className: 'dshus-error', role: 'status' },
        quota.stale ? t('保留上次成功数据') + ' · ' : '', quota.error.message || t('额度读取失败')) : null,
      quota?.paused && !quota.displayOnly ? h('p', { className: 'dshus-account-quota-meta', 'data-dshus-tip': quota.pauseReason || undefined }, t('已暂停调用')) : null,
      quota?.displayOnly && !quota.supportsAccountCredits && !quota.supportsFreeRoute ? h('p', { className: 'dshus-account-quota-meta' }, t('余额仅供展示')) : null,
      pools.length ? h('dl', { className: 'dshus-credit-details' }, visible.map((pool, index) => {
        const remaining = pool.remaining ?? pool.balance
        const pct = pool.remainingPercent ?? (pool.usedPercent !== null ? 100 - pool.usedPercent
          : remaining !== null && pool.total !== null && pool.total > 0 ? remaining / pool.total * 100 : null)
        const bounded = pct === null ? null : Math.max(0, Math.min(100, pct))
        const label = pool.label || pool.name || t('额度明细')
        const amount = remaining !== null ? pool.total !== null ? remaining.toLocaleString(undefined, { maximumFractionDigits: 6 }) : quotaText({ ...pool, remaining })
          : bounded !== null ? t('剩余 {count}%', { count: Number(bounded.toFixed(2)) }) : t('未知')
        const total = pool.total !== null ? quotaText({ ...pool, remaining: pool.total }) : ''
        const color = bounded !== null && bounded < 10 ? '#ef4444' : bounded !== null && bounded < 30 ? '#f59e0b' : 'var(--dsw-alias-brand-primary, #3b82f6)'
        return h('div', { key: pool.id || pool.bucketId || index, className: 'dshus-credit-detail', 'data-quota-pool': pool.id || pool.bucketId || index },
          h('dt', null, label),
          h('dd', { className: 'dshus-credit-detail-amount' }, amount,
            total ? h('span', { className: 'dshus-account-quota-meta' }, ' / ' + total) : null),
          h('dd', { className: 'dshus-credit-detail-progress' }, bounded !== null ? h('div', { className: 'dshus-go-track', role: 'progressbar', 'aria-label': label,
            'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': bounded, 'aria-valuetext': amount + (total ? ' / ' + total : '') },
          h('div', { className: 'dshus-go-fill', style: { width: bounded + '%', background: color } })) : null),
          h('dd', { className: 'dshus-credit-detail-time' },
            pool.active === false ? t('已过期') : '',
            pool.resetsAt !== null ? formatReset(pool.resetsAt) : '',
            pool.expiresAt !== null ? t('到期时间') + '：' + formatTime(pool.expiresAt) : '',
            pool.error ? t('额度读取失败') : ''))
      })) : null,
      pools.length > 3 ? h('button', { type: 'button', className: 'dshus-btn dshus-credit-toggle', 'aria-expanded': expanded,
        onClick: () => setExpanded(!expanded) }, expanded ? t('收起额度明细') : t('展开其余 {count} 项明细', { count: pools.length - 3 })) : null,
      h('div', { className: 'dshus-account-quota-footer' },
        reset ? h('span', null, reset) : null,
        h('span', null, t('上次获取时间：{time}', { time: formatTime(quota?.observedAt) }))))
  }

function AccountQuotaList({ data, loading, onRefresh, refreshButton, formatTime, formatReset }) {
    const channels = readChannels(data).filter(channel => channel.kind === 'account' && channel.enabled)
    const accounts = readAccounts(data).filter(account => account.enabled)
    const quotas = readQuotas(data)
    return h(React.Fragment, null, channels.map(channel => {
      const rows = accounts.filter(account => account.channelId === channel.id)
      return h('section', { key: channel.id, className: 'dshus-module dshus-account-quota-section', 'data-quota-channel': channel.id },
        h('h3', null, h(BrandIcon, { brand: channel.id, small: true }), t(channel.displayName)),
        rows.length ? rows.map(account => h(QuotaAccount, { key: account.id, account, channel, loading, onRefresh, refreshButton, formatTime, formatReset,
          quota: quotas.find(quota => quota.channelId === channel.id && quota.accountId === account.id) }))
          : h('p', { className: 'dshus-account-quota-meta' }, t('未登录')))
    }))
  }
return { QuotaPanel: AccountQuotaList, css: "\n.dshus-ma-brand-icon { display:inline-flex; vertical-align:middle; justify-content:center; align-items:center; width:42px; height:42px; flex:none; background:var(--dshus-brand-canvas,#f4f5f8); border-radius:10px; border:1px solid var(--dshus-brand-border,#e3e5eb); }\n.dshus-ma-brand-icon img { display:block; width:30px; height:30px; object-fit:contain; }\n.dshus-ma-brand-icon-small { width:30px; height:30px; border-radius:7px; }\n.dshus-ma-brand-icon-small img { width:22px; height:22px; }" }
}
