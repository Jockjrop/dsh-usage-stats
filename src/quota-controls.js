/** Persistent quota controls, bounded custom queries and host-side scheduling. */
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { quotaTemplate, hasBuiltinQuotaQuery, officialQuotaSpec, customQuotaAuth } from './provider-quotas.js'

export const QUOTA_INTERVALS = [10, 60, 300, 1440]
const MAX_BYTES = 1_048_576
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const clone = (value) => structuredClone(value)
/** Only deliberate, credential-free validation messages may reach the renderer. */
export class QuotaControlError extends Error {
  constructor(message) {
    super(message)
    this.name = 'QuotaControlError'
  }
}
const fail = (message) => { throw new QuotaControlError(message) }

function defaults() {
  return { autoQuota: false, intervalMinutes: 60, showModelDetails: true, advancedModelSelect: false, customQueries: [] }
}

/**
 * The providers the user actually configured on the models page, in the order the
 * model settings list them. `listConfigurableProviders()` returns every provider
 * DSH could configure, which is not what "从已有供应商列表选择" means: a provider
 * counts as configured only once it has a `providers.<id>` entry in its settings
 * namespace, which is the same rule the models page uses to draw its rows.
 */
function directory(ctx) {
  const entries = ctx.get('llm')?.listConfigurableProviders?.() || []
  const descriptors = ctx.get('settings')?.describe?.({ redactSecrets: true }) || []
  const namespaceOf = (ns) => descriptors.find((row) => row.ns === ns)
  const withProfile = (entry) => namespaceOf(entry.settingsNs)?.value?.providers?.[entry.provider]
  // Settings may be unavailable in some hosts. Filtering on it then would hide
  // every provider, which reads as "nothing to choose" rather than "unknown", so
  // fall back to the declared list instead of showing an empty picker.
  const canFilter = descriptors.some((row) => row && row.value && typeof row.value === 'object' && row.value.providers && typeof row.value.providers === 'object')
  const seen = new Set()
  return entries.filter((entry) => {
    if (!entry || typeof entry.provider !== 'string' || seen.has(entry.provider)) return false
    if (canFilter) {
      const profile = withProfile(entry)
      if (profile === undefined || profile === null) return false
    }
    seen.add(entry.provider)
    return true
  }).map((entry) => ({
    provider: entry.provider,
    name: entry.displayName && entry.displayName !== entry.provider ? entry.displayName : officialQuotaSpec(entry.provider, withProfile(entry))?.name || entry.provider,
    profile: withProfile(entry),
  }))
}

function pathValue(body, path) {
  if (typeof path !== 'string') return undefined
  if (path === '' || path === '$') return body
  const keys = path.replace(/^\$\./, '').replace(/\[(\d+)\]/g, '.$1').split('.')
  let current = body
  for (const key of keys) {
    if (!key || ['__proto__', 'constructor', 'prototype'].includes(key) || current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined
    current = current[key]
  }
  return current
}

function number(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function mappedMetrics(body, mapping) {
  const rows = mapping.rows ? pathValue(body, mapping.rows) : [body]
  if (!Array.isArray(rows)) return []
  const metrics = []
  for (const row of rows.slice(0, 100)) {
    for (const field of mapping.metrics) {
      const total = number(pathValue(row, field.total))
      const used = number(pathValue(row, field.used))
      const remaining = number(pathValue(row, field.remaining)) ?? (total !== null && used !== null ? Math.max(0, total - used) : null)
      let pct = number(pathValue(row, field.remainingPercent))
      const usedPct = number(pathValue(row, field.usedPercent))
      if (pct === null && usedPct !== null && usedPct <= 100) pct = 100 - usedPct
      if (pct === null && total > 0 && remaining !== null) pct = remaining / total * 100
      const labelValue = field.labelPath ? pathValue(row, field.labelPath) : field.label
      const label = typeof labelValue === 'string' && labelValue ? labelValue.slice(0, 120) : field.label
      const currency = field.currencyPath ? pathValue(row, field.currencyPath) : field.currency
      const reset = pathValue(row, field.resetAt)
      const date = typeof reset !== 'number' && typeof reset !== 'string' ? null : new Date(typeof reset === 'number' && reset < 1e12 ? reset * 1000 : reset)
      if (field.kind === 'window') {
        if (pct === null || pct > 100) continue
        metrics.push({ label, kind: 'window', remainingPercent: pct, remaining, total, resetAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : null })
      } else if (remaining !== null) {
        metrics.push({ label, kind: 'amount', remaining, total, currency: typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : undefined })
      }
    }
  }
  return metrics.slice(0, 100)
}

export function validateQuotaTemplate(template, provider, profile) {
  if (!plain(template) || JSON.stringify(template).length > 16_384) fail('查询模板应为 JSON 对象，且不超过 16 KB。')
  const spec = officialQuotaSpec(provider, profile)
  if (typeof template.url !== 'string' || template.url.length > 2048) fail('请填写配额查询 URL。')
  let target
  try { target = new URL(template.url.replace('{{teamId}}', 'team')) } catch { fail('查询 URL 格式无效。') }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  if (target.username || target.password || target.hash || !['https:', 'http:'].includes(target.protocol) || (target.protocol === 'http:' && !loopback)) fail('查询 URL 需使用 HTTPS；本机供应商可使用 HTTP。')
  if (/(?:api[-_]?key|access[-_]?token|secret|authorization)/i.test([...target.searchParams.keys()].join(' '))) fail('请使用供应商凭据认证，不要把密钥放入 URL。')
  const method = template.method || 'GET'
  if (!['GET', 'POST'].includes(method)) fail('查询方法仅支持 GET 或 POST。')
  const auth = template.auth || 'provider'
  if (!['provider', 'none'].includes(auth)) fail('auth 仅支持 provider 或 none。')
  const headers = template.headers || {}
  if (!plain(headers) || Object.keys(headers).length > 20) fail('headers 应为 JSON 对象，最多 20 项。')
  for (const [key, value] of Object.entries(headers)) {
    if (!/^[A-Za-z0-9-]+$/.test(key) || /^(authorization|proxy-authorization|cookie|host|connection|content-length|set-cookie)$/i.test(key) || /(?:api[-_]?key|token|secret)/i.test(key)) fail('认证由供应商凭据提供，请移除模板中的密钥或认证请求头。')
    if (typeof value !== 'string' || value.length > 1000 || /[\r\n]/.test(value)) fail('请求头值应为单行文本。')
  }
  if (method === 'GET' && template.body != null) fail('GET 查询不能包含 body。')
  if (template.body != null && !plain(template.body) && !Array.isArray(template.body)) fail('POST body 应为 JSON 对象或数组。')
  if (template.body != null && /"(?:api[-_]?key|access[-_]?token|secret|authorization)"\s*:/i.test(JSON.stringify(template.body))) fail('请使用供应商凭据认证，不要在 body 中填写密钥。')
  const response = template.response
  if (!plain(response)) fail('请填写 response 字段映射。')
  if (response.format === 'official') {
    if (typeof spec?.parse !== 'function') fail('此供应商没有内置解析器，请使用 response.metrics 映射。')
  } else {
    if (!Array.isArray(response.metrics) || !response.metrics.length || response.metrics.length > 20) fail('response.metrics 需包含 1–20 个指标。')
    if (response.rows != null && typeof response.rows !== 'string') fail('response.rows 应为数组字段路径。')
    for (const field of response.metrics) {
      if (!plain(field) || !['amount', 'window'].includes(field.kind) || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 120) fail('每个指标需填写 label 和 kind（amount 或 window）。')
      for (const key of ['remaining', 'total', 'used', 'remainingPercent', 'usedPercent', 'resetAt', 'currencyPath', 'labelPath']) {
        if (field[key] != null && (typeof field[key] !== 'string' || field[key].length > 200)) fail('指标字段路径应为不超过 200 字符的文本。')
      }
      if (field.kind === 'amount' && !field.remaining && !(field.total && field.used)) fail('余额指标需提供 remaining，或 total 与 used 字段路径。')
      if (field.kind === 'window' && !field.remainingPercent && !field.usedPercent && !(field.total && (field.remaining || field.used))) fail('配额指标需提供百分比或总量与剩余量字段路径。')
    }
  }
  return { url: template.url, method, auth, headers: clone(headers), ...(template.body == null ? {} : { body: clone(template.body) }), response: clone(response) }
}

async function readBoundedJson(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) fail('查询响应过大（上限 1 MB）。')
  const reader = response.body?.getReader()
  if (!reader) fail('查询未返回 JSON 数据。')
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_BYTES) fail('查询响应过大（上限 1 MB）。')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    await reader.cancel().catch(() => {})
    if (error?.message === '查询响应过大（上限 1 MB）。') throw error
    fail('查询响应不是有效 JSON，或读取已超时。')
  }
}

function allowedOrigins(profile, spec) {
  const result = new Set()
  for (const url of [profile?.baseURL, spec?.url, ...(Array.isArray(spec?.host) ? spec.host : spec?.host ? [spec.host] : []).map((host) => 'https://' + host)]) {
    try { result.add(new URL(url).origin) } catch {}
  }
  if (spec?.auth === 'management') result.add('https://management-api.x.ai')
  return result
}

export async function executeQuotaQuery(ctx, provider, rawTemplate, request = fetch) {
  const entry = directory(ctx).find((item) => item.provider === provider)
  if (!entry) fail('所选供应商已不存在，请重新选择。')
  const template = validateQuotaTemplate(rawTemplate, provider, entry.profile)
  const spec = officialQuotaSpec(provider, entry.profile)
  let url = template.url
  const target = new URL(url.replace('{{teamId}}', 'team'))
  if (target.protocol === 'http:') {
    let configuredOrigin
    try { configuredOrigin = new URL(entry.profile?.baseURL).origin } catch {}
    if (configuredOrigin !== target.origin) fail('HTTP 本机查询地址需与供应商配置地址同源。')
  }
  let headers = { accept: 'application/json', ...template.headers }
  if (template.auth === 'provider') {
    if (!allowedOrigins(entry.profile, spec).has(target.origin)) fail('认证查询地址需与所选供应商的地址或官方配额地址同源。')
    const auth = await customQuotaAuth(ctx, entry.profile, provider, url, template.method, template.body == null ? '' : JSON.stringify(template.body)).catch(() => null)
    if (!auth) fail('未找到可用的供应商凭据，请先在模型设置中配置或登录。')
    if (url.includes('{{teamId}}')) url = auth.url || fail('未配置 xAI 管理凭据和团队 ID。')
    headers = { ...headers, ...auth.headers }
  }
  if (template.body != null) headers['content-type'] = 'application/json'
  let response
  try {
    response = await request(url, { method: template.method, headers, ...(template.body == null ? {} : { body: JSON.stringify(template.body) }), redirect: 'error', signal: AbortSignal.timeout(8000) })
  } catch {
    fail('查询失败，请检查地址和网络（8 秒超时，不跟随重定向）。')
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    fail('查询返回 HTTP ' + response.status + '，请检查地址和供应商凭据。')
  }
  const body = await readBoundedJson(response)
  const metrics = template.response.format === 'official' ? spec.parse(body) : mappedMetrics(body, template.response)
  if (!metrics.length) fail('响应中未找到有效配额，请检查 response 的字段路径。')
  return { provider, name: entry.name, metrics, syncedAt: Date.now(), custom: true }
}

/** Source reads are explicit; cached page reads never spend account credit. */
export function createQuotaControls(ctx, { path, sources, request = fetch, now = Date.now }) {
  let settings = defaults()
  let snapshots = {}
  let lastRefreshAt = 0
  let loaded
  let saveQueue = Promise.resolve()
  let updateQueue = Promise.resolve()
  let allFlight = null
  const flights = new Map()
  const tests = new Map()
  let queryRevision = 0
  let disposed = false

  const sourceEnabled = (key) => {
    const source = sources[key]
    if (typeof source === 'function') return true
    try { return typeof source?.read === 'function' && source.available() === true } catch { return false }
  }
  const adapters = () => Object.entries(sources).filter(([key, source]) => plain(source) && source.provider && sourceEnabled(key))
  const adapterFor = (provider) => Object.values(sources).find((source) => plain(source) && source.provider === provider)
  const providerDirectory = () => {
    const entries = directory(ctx).map((entry) => {
      const spec = officialQuotaSpec(entry.provider, entry.profile)
      return { provider: entry.provider, name: entry.name, queryType: 'http', hasBuiltinQuery: hasBuiltinQuotaQuery(entry.provider, entry.profile), template: quotaTemplate(entry.provider, entry.profile), ...(spec?.description ? { description: spec.description } : {}) }
    }).filter((entry) => !adapterFor(entry.provider))
    for (const [key, source] of adapters()) entries.push({ provider: source.provider, name: source.name, queryType: 'adapter', source: key, hasBuiltinQuery: true, template: null, description: source.description })
    return entries
  }

  const load = () => loaded ||= (async () => {
    try {
      const stat = JSON.parse(await readFile(path, 'utf8'))
      const saved = stat.settings
      if (plain(saved)) {
        settings.autoQuota = saved.autoQuota === true
        settings.showModelDetails = saved.showModelDetails !== false
        settings.advancedModelSelect = saved.advancedModelSelect === true
        if (QUOTA_INTERVALS.includes(saved.intervalMinutes)) settings.intervalMinutes = saved.intervalMinutes
        if (Array.isArray(saved.customQueries)) {
          settings.customQueries = saved.customQueries.slice(0, 50).flatMap((query) => {
            if (adapterFor(query?.provider)) return []
            try { return [{ provider: query.provider, template: validateQuotaTemplate(query.template, query.provider, directory(ctx).find((entry) => entry.provider === query.provider)?.profile) }] } catch { return [] }
          }).filter((query) => typeof query.provider === 'string')
        }
      }
      if (plain(stat.snapshots)) snapshots = Object.fromEntries(Object.keys(sources).filter((key) => plain(stat.snapshots[key])).map((key) => [key, stat.snapshots[key]]))
      if (Number.isFinite(stat.lastRefreshAt) && stat.lastRefreshAt > 0) lastRefreshAt = Math.min(stat.lastRefreshAt, now())
    } catch {} // Missing/corrupt settings use conservative defaults.
  })()

  const persist = () => {
    const payload = JSON.stringify({ settings, snapshots, lastRefreshAt })
    const next = saveQueue.catch(() => {}).then(async () => {
      await mkdir(dirname(path), { recursive: true })
      const temp = path + '.' + randomUUID() + '.tmp'
      await writeFile(temp, payload, { encoding: 'utf8', mode: 0o600 })
      await rename(temp, path)
    })
    saveQueue = next
    return next
  }

  const get = async () => {
    await load()
    return { ok: true, settings: clone(settings), lastRefreshAt, nextRefreshAt: settings.autoQuota ? (lastRefreshAt ? lastRefreshAt + settings.intervalMinutes * 60_000 : now()) : null }
  }

  const configuredQuotaEntries = () => directory(ctx).filter((entry) => {
    if (!entry.profile || typeof entry.profile !== 'object') return false
    const spec = officialQuotaSpec(entry.provider, entry.profile)
    const custom = settings.customQueries.find((query) => query.provider === entry.provider)
    if (custom) {
      const mapping = custom.template.response
      return spec?.showUnqueried === true || (mapping.format === 'official' ? spec?.kind === 'balance' : mapping.metrics.every((metric) => metric.kind === 'amount'))
    }
    return (spec?.kind === 'balance' || spec?.showUnqueried) && hasBuiltinQuotaQuery(entry.provider, entry.profile)
  })

  // These rows describe configuration, not a provider response. Build them on
  // each cached read so newly added model providers appear without a probe.
  const displaySnapshot = (key, body) => {
    if (key !== 'providers') return clone(body)
    const entries = directory(ctx)
    const quotas = (Array.isArray(body.quotas) ? body.quotas : []).filter((quota) => {
      if (!officialQuotaSpec(quota.provider)?.configuredOnly) return true
      const entry = entries.find((item) => item.provider === quota.provider)
      return !!entry?.profile && (settings.customQueries.some((query) => query.provider === quota.provider) || hasBuiltinQuotaQuery(entry.provider, entry.profile))
    })
    const shown = new Set(quotas.map((quota) => quota.provider))
    const queried = new Set(body.queriedProviders || [])
    for (const entry of configuredQuotaEntries()) {
      if (shown.has(entry.provider)) continue
      const spec = officialQuotaSpec(entry.provider, entry.profile)
      const mapping = settings.customQueries.find((query) => query.provider === entry.provider)?.template.response
      const balance = mapping && mapping.format !== 'official' ? mapping.metrics.every((metric) => metric.kind === 'amount') : spec?.kind === 'balance'
      quotas.push({ provider: entry.provider, name: entry.name, kind: balance ? 'balance' : 'subscription', status: queried.has(entry.provider) ? 'unavailable' : 'unqueried', metrics: [] })
    }
    return clone({ ...body, quotas })
  }

  const read = async (key, fresh = false) => {
    await load()
    if (!Object.hasOwn(sources, key)) fail('未知配额来源。')
    const source = sources[key]
    const adapter = plain(source)
    if (!sourceEnabled(key)) return { ok: true, available: false, status: 'not-configured', cached: true }
    if (!fresh) {
      const body = snapshots[key] || (key === 'providers' ? { ok: true, quotas: [], cached: true } : { ok: true, available: adapter, status: adapter ? 'unqueried' : 'unavailable', cached: true })
      return displaySnapshot(key, adapter ? { ...body, available: true } : body)
    }
    if (flights.has(key)) return flights.get(key)
    const revision = queryRevision
    const queries = clone(settings.customQueries)
    const queriedProviders = key === 'providers' ? configuredQuotaEntries().map((entry) => entry.provider) : []
    const flight = (async () => {
      let body = await (adapter ? source.read() : source(queries.map((query) => query.provider)))
      if (key === 'providers') {
        const custom = await Promise.all(queries.filter((query) => !adapterFor(query.provider)).map(async (query) => {
          try { return await executeQuotaQuery(ctx, query.provider, query.template, request) } catch { return null }
        }))
        body = { ok: true, quotas: (body?.quotas || []).concat(custom.filter(Boolean)), queriedProviders }
      }
      if (key !== 'providers' || revision === queryRevision) {
        snapshots[key] = body
        await persist()
      }
      return displaySnapshot(key, snapshots[key] || body)
    })().finally(() => { if (flights.get(key) === flight) flights.delete(key) })
    flights.set(key, flight)
    return flight
  }

  const tick = async () => {
    await load()
    if (disposed || !settings.autoQuota) return
    if (allFlight) return allFlight
    if (lastRefreshAt && now() < lastRefreshAt + settings.intervalMinutes * 60_000) return
    lastRefreshAt = now()
    allFlight = (async () => {
      await Promise.allSettled(Object.keys(sources).filter(sourceEnabled).map((key) => read(key, true)))
      await persist()
    })().finally(() => { allFlight = null })
    return allFlight
  }

  const test = async (provider, raw) => {
    if (adapterFor(provider)) fail('此来源使用内置适配器，无需填写 HTTP 查询模板。')
    const template = validateQuotaTemplate(raw, provider, directory(ctx).find((entry) => entry.provider === provider)?.profile)
    const quota = await executeQuotaQuery(ctx, provider, template, request)
    for (const [id, result] of tests) if (now() - result.at > 900_000) tests.delete(id)
    if (tests.size >= 50) tests.delete(tests.keys().next().value)
    const testId = randomUUID()
    tests.set(testId, { provider, template, quota, at: now() })
    return { ok: true, testId, quota }
  }

  const update = (patch) => {
    const operation = updateQueue.catch(() => {}).then(async () => {
      await load()
      if (!plain(patch)) fail('设置应为 JSON 对象。')
      const previous = clone(settings)
      const next = clone(settings)
      let tested
      if (patch.action === 'save-query') {
        if (adapterFor(patch.provider)) fail('此来源使用内置适配器，无需填写 HTTP 查询模板。')
        const template = validateQuotaTemplate(patch.template, patch.provider, directory(ctx).find((entry) => entry.provider === patch.provider)?.profile)
        tested = tests.get(patch.testId)
        if (!tested || now() - tested.at > 900_000 || tested.provider !== patch.provider || JSON.stringify(tested.template) !== JSON.stringify(template)) fail('模板已修改或测试已过期，请重新测试后确认。')
        next.customQueries = next.customQueries.filter((query) => query.provider !== patch.provider).concat({ provider: patch.provider, template })
        if (next.customQueries.length > 50) fail('自定义查询最多支持 50 个供应商。')
      } else if (patch.action === 'remove-query') {
        next.customQueries = next.customQueries.filter((query) => query.provider !== patch.provider)
      } else if (patch.action == null) {
        if (patch.autoQuota != null) {
          if (typeof patch.autoQuota !== 'boolean') fail('自动查询开关值无效。')
          if (patch.autoQuota && !settings.autoQuota && patch.acknowledgeCost !== true) fail('请先确认自动查询可能会消耗少量余额。')
          next.autoQuota = patch.autoQuota
        }
        if (patch.intervalMinutes != null) {
          if (!QUOTA_INTERVALS.includes(patch.intervalMinutes)) fail('仅支持 10 分钟、1 小时、5 小时或每天。')
          next.intervalMinutes = patch.intervalMinutes
        }
        if (patch.showModelDetails != null) {
          if (typeof patch.showModelDetails !== 'boolean') fail('模型明细开关值无效。')
          next.showModelDetails = patch.showModelDetails
        }
        if (patch.advancedModelSelect != null) {
          if (typeof patch.advancedModelSelect !== 'boolean') fail('高级模型选择器开关值无效。')
          next.advancedModelSelect = patch.advancedModelSelect
        }
      } else fail('未知设置操作。')
      const oldSnapshots = clone(snapshots)
      if (patch.action) {
        queryRevision++
        const rows = (snapshots.providers?.quotas || []).filter((quota) => quota.provider !== patch.provider)
        if (tested) rows.push(tested.quota)
        snapshots.providers = { ok: true, quotas: rows, queriedProviders: (snapshots.providers?.queriedProviders || []).filter((provider) => provider !== patch.provider) }
      }
      settings = next
      const oldLastRefreshAt = lastRefreshAt
      if (!previous.autoQuota && next.autoQuota) lastRefreshAt = 0
      try { await persist() } catch { settings = previous; snapshots = oldSnapshots; lastRefreshAt = oldLastRefreshAt; fail('设置保存失败，请检查存储目录权限。') }
      if (tested) tests.delete(patch.testId)
      if (settings.autoQuota) void tick().catch(() => {})
      return get()
    })
    updateQueue = operation
    return operation
  }

  return {
    get, update, test, read, tick,
    providers: async () => ({ ok: true, providers: providerDirectory() }),
    dispose: () => { disposed = true },
  }
}

const WORKBUDDY_SOURCES = {
  workbuddy: { name: 'WorkBuddy', path: '/plugins/dsh-workbuddy-connect/status' },
  'workbuddy-ai': { name: 'WorkBuddy AI', path: '/plugins/dsh-workbuddy-connect/ai/status' },
}

/** Optional plugin registration is detected without probing its HTTP route. */
export function workBuddyAvailable(ctx, provider = 'workbuddy') {
  if (!Object.hasOwn(WORKBUDDY_SOURCES, provider)) return false
  const port = ctx.get('webServer')?.port
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false
  try {
    return (ctx.get('settings')?.describe?.({ redactSecrets: true }) || []).some((row) => row?.ns === provider) ||
      (ctx.get('llm')?.listProviders?.() || []).some((row) => row?.id === provider) ||
      (ctx.get('llm')?.listConfigurableProviders?.() || []).some((row) => row?.provider === provider)
  } catch { return false }
}

export function workBuddyQuotaSource(ctx, request = fetch, provider = 'workbuddy') {
  if (!Object.hasOwn(WORKBUDDY_SOURCES, provider)) fail('未知 WorkBuddy 积分来源。')
  const source = WORKBUDDY_SOURCES[provider]
  return {
    provider, name: source.name,
    description: '由已启用的 WorkBuddy Connect 插件读取 ' + source.name + ' 账号与积分，无需填写查询模板。',
    available: () => workBuddyAvailable(ctx, provider), read: () => readWorkBuddyQuota(ctx, request, provider),
  }
}

/** Only display fields from WorkBuddy are retained in our quota cache. */
export async function readWorkBuddyQuota(ctx, request = fetch, provider = 'workbuddy') {
  if (!workBuddyAvailable(ctx, provider)) return { ok: true, available: false, status: 'not-configured' }
  const port = ctx.get('webServer')?.port
  const source = WORKBUDDY_SOURCES[provider]
  let body
  try {
    const response = await request('http://127.0.0.1:' + port + source.path, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12_000) })
    if (!response.ok) return { ok: true, available: true, status: 'unavailable' }
    body = await readBoundedJson(response)
  } catch { return { ok: true, available: true, status: 'unavailable' } }
  if (!plain(body)) return { ok: true, available: true, status: 'unavailable' }
  if (body.status === 'signed-out') return { ok: true, available: true, status: 'signed-out' }
  if (body.status !== 'signed-in') return { ok: true, available: true, status: 'unavailable' }
  if (!plain(body.credits) || number(body.credits.total) === null) return { ok: true, available: true, status: 'unavailable' }
  const text = (value) => typeof value === 'string' ? value.slice(0, 160) : ''
  return {
    ok: true, available: true, status: 'signed-in', syncedAt: Date.now(),
    credits: { total: number(body.credits.total), accounts: (Array.isArray(body.credits.accounts) ? body.credits.accounts : []).slice(0, 200).filter(plain).map((row) => ({ packageName: text(row.packageName), remain: number(row.remain), size: number(row.size) })) },
    models: (Array.isArray(body.models) ? body.models : []).slice(0, 200).filter(plain).map((row) => ({ id: text(row.id), name: text(row.name), free: row.free === true, badges: (Array.isArray(row.badges) ? row.badges : []).filter((tag) => typeof tag === 'string').slice(0, 10).map(text), credits: typeof row.credits === 'string' || typeof row.credits === 'number' ? text(String(row.credits)) : undefined })),
  }
}
