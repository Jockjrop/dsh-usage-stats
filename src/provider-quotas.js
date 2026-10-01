/** Read-only quotas for pi-ai providers shipped by DSH. Secrets stay on the host. */
import { createHash, createHmac, randomUUID } from 'node:crypto'

const PROVIDERS = {
  anthropic: { name: 'Claude 订阅', host: 'api.anthropic.com', url: 'https://api.anthropic.com/api/oauth/usage', auth: 'oauth', ttl: 300_000, headers: { 'anthropic-beta': 'oauth-2025-04-20' }, parse: parseAnthropic },
  deepseek: { name: 'DeepSeek', kind: 'balance', env: 'DEEPSEEK_API_KEY', host: 'api.deepseek.com', url: 'https://api.deepseek.com/user/balance', parse: parseDeepSeek },
  // GET /v1/accounts returns { object, type, balance, total_cash_balance,
  // total_voucher_balance }. There is no /step_plan/... route: that path 404s.
  stepfun: { name: 'StepFun 阶跃星辰', kind: 'balance', env: 'STEPFUN_API_KEY', host: 'api.stepfun.com', url: 'https://api.stepfun.com/v1/accounts', parse: parseStepFun },
  'openai-codex': { name: 'OpenAI Codex 订阅', host: 'chatgpt.com', url: 'https://chatgpt.com/backend-api/wham/usage', auth: 'oauth', parse: parseCodex },
  'github-copilot': { name: 'GitHub Copilot', host: ['api.githubcopilot.com', 'api.individual.githubcopilot.com'], url: 'https://api.github.com/copilot_internal/user', auth: 'github', headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-usage-stats' }, parse: parseCopilot },
  'opencode-go': { name: 'OpenCode Go', kind: 'subscription', configuredOnly: true, showUnqueried: true, host: 'opencode.ai', url: 'https://opencode.ai/zen/go/v1/usage', auth: 'configured-key', env: 'OPENCODE_API_KEY', parse: parseOpencodeGo, description: '只使用 DSH 中此供应商的凭据查询官方订阅额度。' },
  // The Go usage API requires a Go subscription. Zen's wallet has no public
  // key-authenticated balance API; leave it available for a user-defined query.
  opencode: { name: 'OpenCode Zen', kind: 'balance', configuredOnly: true, queryable: false, host: 'opencode.ai', auth: 'configured-key', env: 'OPENCODE_API_KEY', description: '官方暂未提供可用的 Zen 余额查询接口，可配置自定义查询。' },
  openrouter: { name: 'OpenRouter', kind: 'balance', env: 'OPENROUTER_API_KEY', host: 'openrouter.ai', url: 'https://openrouter.ai/api/v1/key', auth: 'oauth-or-key', parse: parseOpenRouter },
  moonshotai: { name: 'Moonshot AI', kind: 'balance', env: 'MOONSHOT_API_KEY', host: 'api.moonshot.ai', url: 'https://api.moonshot.ai/v1/users/me/balance', parse: (body) => parseMoonshot(body, 'USD') },
  'moonshotai-cn': { name: 'Moonshot AI 国内', kind: 'balance', env: 'MOONSHOT_API_KEY', host: 'api.moonshot.cn', url: 'https://api.moonshot.cn/v1/users/me/balance', parse: (body) => parseMoonshot(body, 'CNY') },
  'kimi-coding': { name: 'Kimi Coding', env: 'KIMI_API_KEY', host: 'api.kimi.com', url: 'https://api.kimi.com/coding/v1/usages', auth: 'oauth-or-key', parse: parseKimi },
  minimax: { name: 'MiniMax 国际', env: 'MINIMAX_API_KEY', host: 'api.minimax.io', url: 'https://www.minimax.io/v1/token_plan/remains', parse: parseMiniMax },
  'minimax-cn': { name: 'MiniMax 国内', env: 'MINIMAX_CN_API_KEY', host: 'api.minimaxi.com', url: 'https://www.minimaxi.com/v1/token_plan/remains', parse: parseMiniMax },
  zai: { name: 'Z.AI', env: 'ZAI_API_KEY', host: 'api.z.ai', url: 'https://api.z.ai/api/monitor/usage/quota/limit', parse: parseZai },
  'zai-coding-cn': { name: '智谱 GLM Coding', env: 'ZAI_CODING_CN_API_KEY', host: 'open.bigmodel.cn', url: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit', parse: parseZai },
  'qwen-token-plan-cn': { name: '阿里云 Token Plan 国内', host: 'token-plan.cn-beijing.maas.aliyuncs.com', url: 'https://modelstudio.cn-beijing.aliyuncs.com/tokenplan/subscription/stats', auth: 'alibaba', parse: parseQwenTokenPlan },
  xai: { name: 'xAI', kind: 'balance', host: 'api.x.ai', auth: 'management', parse: parseXai },
}

const TTL_MS = 60_000

function nonnegative(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function percentage(value) {
  const number = nonnegative(value)
  return number !== null && number <= 100 ? number : null
}

function resetAt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value < 1e12 ? value * 1000 : value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function amount(label, remaining, currency) {
  const value = nonnegative(remaining)
  return value === null ? null : { label, kind: 'amount', remaining: value, currency }
}

function windowMetric(label, remainingPercent, reset, remaining = null, total = null) {
  const value = percentage(remainingPercent)
  if (value === null) return null
  return { label, kind: 'window', remainingPercent: value, resetAt: resetAt(reset), remaining: nonnegative(remaining), total: nonnegative(total) }
}

function parseOpenRouter(body) {
  const data = body && body.data
  if (!data || typeof data !== 'object') return []
  const remaining = nonnegative(data.limit_remaining)
  if (remaining === null) return [] // An unlimited key has no readable remaining credit.
  const limit = nonnegative(data.limit)
  const label = data.limit_reset === 'monthly' ? '本月密钥额度' : '密钥额度'
  return [{ label, kind: 'amount', remaining, total: limit, currency: 'USD' }]
}

function parseOpencodeGo(body) {
  const windows = body?.usage
  if (!windows || typeof windows !== 'object') return []
  return [['rolling', '5 小时剩余'], ['weekly', '周剩余'], ['monthly', '月剩余']].map(([key, label]) => {
    const row = windows[key]
    const used = nonnegative(row?.percent)
    return used === null ? null : windowMetric(label, Math.max(0, 100 - used), row.resetsAt)
  }).filter(Boolean)
}

function parseOpenRouterCredits(body) {
  const data = body && body.data
  const total = nonnegative(data && data.total_credits)
  const used = nonnegative(data && data.total_usage)
  return total === null || used === null ? [] : [{ label: '账户可用额度', kind: 'amount', remaining: Math.max(0, total - used), total, currency: 'USD' }]
}

function parseMoonshot(body, currency) {
  const data = body && body.data
  if (!data || typeof data !== 'object') return []
  const available = data.available_balance ?? data.total_balance
  const metric = amount('账户可用余额', available, currency)
  return metric ? [metric] : []
}

function parseDeepSeek(body) {
  const infos = body && Array.isArray(body.balance_infos) ? body.balance_infos : []
  return infos.map((row) => amount('账户可用余额', row && row.total_balance, row && row.currency)).filter(Boolean)
}

/**
 * StepFun reports a single CNY balance at the response ROOT — not under `data`,
 * which is where the generic prefill looks. `total_cash_balance` and
 * `total_voucher_balance` split that total into paid and gift credit, so they
 * are surfaced as extra rows when the account reports them.
 */
function parseStepFun(body) {
  if (!body || typeof body !== 'object') return []
  const metrics = []
  const available = amount('账户可用余额', body.balance, 'CNY')
  if (available) metrics.push(available)
  const cash = amount('充值余额', body.total_cash_balance, 'CNY')
  if (cash) metrics.push(cash)
  const voucher = amount('赠送余额', body.total_voucher_balance, 'CNY')
  if (voucher) metrics.push(voucher)
  return metrics
}

function parseAnthropic(body) {
  if (!body || typeof body !== 'object') return []
  const names = { five_hour: '5 小时剩余', seven_day: '周剩余', seven_day_sonnet: 'Sonnet 周剩余', seven_day_opus: 'Opus 周剩余' }
  const metrics = []
  for (const [key, label] of Object.entries(names)) {
    const item = body[key]
    if (!item || typeof item !== 'object') continue
    const used = percentage(item.utilization ?? item.used_percentage)
    const metric = used === null ? null : windowMetric(label, 100 - used, item.resets_at)
    if (metric) metrics.push(metric)
  }
  const rows = Array.isArray(body) ? body : Array.isArray(body.windows) ? body.windows : []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const used = percentage(row.percent)
    if (used === null) continue
    const model = row.scope?.model?.display_name
    const label = row.group === 'session' ? '5 小时剩余' : model ? model + ' 周剩余' : row.group === 'weekly' ? '周剩余' : null
    const metric = label ? windowMetric(label, 100 - used, row.resets_at) : null
    if (metric) metrics.push(metric)
  }
  return metrics
}

function codexWindow(row, prefix = '') {
  if (!row || typeof row !== 'object') return null
  const used = percentage(row.used_percent)
  if (used === null) return null
  const seconds = nonnegative(row.limit_window_seconds)
  const period = seconds >= 172_800 ? '周剩余' : seconds >= 3600 ? Math.round(seconds / 3600) + ' 小时剩余' : '窗口剩余'
  return windowMetric(prefix + period, 100 - used, row.reset_at)
}

function parseCodex(body) {
  if (!body || typeof body !== 'object') return []
  const rate = body.rate_limit || {}
  const metrics = [codexWindow(rate.primary_window), codexWindow(rate.secondary_window)]
  if (Array.isArray(body.additional_rate_limits)) {
    for (const item of body.additional_rate_limits) {
      if (!item || typeof item !== 'object') continue
      const prefix = String(item.limit_name || item.metered_feature || '其他模型') + ' · '
      metrics.push(codexWindow(item.rate_limit?.primary_window, prefix), codexWindow(item.rate_limit?.secondary_window, prefix))
    }
  }
  return metrics.filter(Boolean)
}

function parseCopilot(body) {
  const snapshots = body && (body.quota_snapshots || body.quotaSnapshots)
  if (!snapshots || typeof snapshots !== 'object') return []
  const names = { premium_interactions: '高级请求剩余', chat: '聊天请求剩余', completions: '补全请求剩余' }
  const metrics = []
  for (const [key, label] of Object.entries(names)) {
    const row = snapshots[key]
    if (!row || typeof row !== 'object' || row.is_unlimited_entitlement === true || row.isUnlimitedEntitlement === true) continue
    const total = nonnegative(row.entitlement ?? row.entitlement_requests ?? row.entitlementRequests)
    const used = nonnegative(row.used ?? row.used_requests ?? row.usedRequests)
    const left = nonnegative(row.remaining ?? row.quota_remaining)
    const remaining = left ?? (total !== null && used !== null ? Math.max(0, total - used) : null)
    const percent = percentage(row.percent_remaining ?? row.remaining_percentage ?? row.remainingPercentage) ?? (total > 0 && remaining !== null ? remaining / total * 100 : null)
    if (total === null || total <= 0 || percent === null) continue
    const metric = windowMetric(label, percent, row.reset_date ?? row.resetDate ?? body.quota_reset_date_utc, remaining, total)
    if (metric) metrics.push(metric)
  }
  return metrics
}

function parseXai(body) {
  const cents = nonnegative(body && body.total && body.total.val)
  const metric = cents === null ? null : amount('预付费余额', cents / 100, 'USD')
  return metric ? [metric] : []
}

function parseQwenTokenPlan(body) {
  if (body?.Success !== true || !Array.isArray(body.Data?.Items)) return []
  return body.Data.Items.map((row) => {
    const total = nonnegative(row?.SeatCredits)
    const remaining = nonnegative(row?.SeatRemainingCredits)
    if (total === null || total <= 0 || remaining === null || remaining > total) return null
    const seat = typeof row.SeatType === 'string' && /^(standard|pro|max)$/i.test(row.SeatType) ? row.SeatType : '席位'
    return windowMetric(seat + ' 积分剩余', remaining / total * 100, row.SeatRefreshTime, remaining, total)
  }).filter(Boolean)
}

function parseMiniMax(body) {
  if (body && body.base_resp && Number(body.base_resp.status_code) !== 0) return []
  const rows = body && Array.isArray(body.model_remains) ? body.model_remains : []
  const metrics = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const model = typeof row.model_name === 'string' ? row.model_name : ''
    if (model === 'video') continue // DSH's MiniMax provider is a text-model route.
    const prefix = model && model !== 'general' ? model + ' · ' : ''
    const intervalTotal = nonnegative(row.current_interval_total_count)
    const intervalLeft = nonnegative(row.current_interval_usage_count)
    const weeklyTotal = nonnegative(row.current_weekly_total_count)
    const weeklyLeft = nonnegative(row.current_weekly_usage_count)
    const intervalPercent = row.current_interval_remaining_percent ?? (intervalTotal > 0 && intervalLeft !== null ? intervalLeft / intervalTotal * 100 : null)
    const weeklyPercent = row.current_weekly_remaining_percent ?? (weeklyTotal > 0 && weeklyLeft !== null ? weeklyLeft / weeklyTotal * 100 : null)
    const fiveHour = Number(row.current_interval_status) === 3 ? null : windowMetric(prefix + '5 小时剩余', intervalPercent, row.end_time, intervalLeft, intervalTotal)
    const weekly = Number(row.current_weekly_status) === 3 ? null : windowMetric(prefix + '周剩余', weeklyPercent, row.weekly_end_time, weeklyLeft, weeklyTotal)
    if (fiveHour) metrics.push(fiveHour)
    if (weekly) metrics.push(weekly)
  }
  return metrics
}

function parseZai(body) {
  if (!body || (body.code !== undefined && Number(body.code) !== 200 && Number(body.code) !== 0)) return []
  const limits = body.data && Array.isArray(body.data.limits) ? body.data.limits : []
  const metrics = []
  for (const row of limits) {
    if (!row || (row.type !== 'TOKENS_LIMIT' && row.type !== 'CREDIT_LIMIT')) continue
    const used = percentage(row.percentage)
    if (used === null) continue
    const label = Number(row.unit) === 3 ? '5 小时剩余' : Number(row.unit) === 6 ? '周剩余' : row.type === 'CREDIT_LIMIT' ? '积分剩余' : 'Token 配额剩余'
    const metric = windowMetric(label, 100 - used, row.nextResetTime)
    if (metric) metrics.push(metric)
  }
  return metrics
}

function parseKimiRow(row, label) {
  if (!row || typeof row !== 'object') return null
  const limit = nonnegative(row.limit)
  const remaining = nonnegative(row.remaining)
  const used = nonnegative(row.used)
  if (limit === null || limit <= 0 || (remaining === null && used === null)) return null
  const left = Math.max(0, Math.min(limit, remaining === null ? limit - used : remaining))
  return windowMetric(label, left / limit * 100, row.reset_at ?? row.resetAt ?? row.reset_time ?? row.resetTime, left, limit)
}

function kimiLimitLabel(item, index) {
  const explicit = item.name || item.title || item.scope
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()
  const window = item.window && typeof item.window === 'object' ? item.window : item
  const duration = nonnegative(window.duration)
  const unit = String(window.timeUnit || '').toUpperCase()
  if (duration === 300 && unit.includes('MINUTE')) return '5 小时剩余'
  if (duration === 7 && unit.includes('DAY')) return '周剩余'
  if (duration !== null && unit.includes('HOUR')) return duration + ' 小时剩余'
  return '配额窗口 ' + (index + 1)
}

function parseKimi(body) {
  if (!body || typeof body !== 'object') return []
  const metrics = []
  const weekly = parseKimiRow(body.usage, '周剩余')
  if (weekly) metrics.push(weekly)
  if (Array.isArray(body.limits)) {
    for (let index = 0; index < body.limits.length; index++) {
      const item = body.limits[index]
      if (!item || typeof item !== 'object') continue
      const detail = item.detail && typeof item.detail === 'object' ? item.detail : item
      const metric = parseKimiRow(detail, kimiLimitLabel(item, index))
      if (metric) metrics.push(metric)
    }
  }
  return metrics
}

export function officialProfile(profile, host) {
  if (!profile || !profile.baseURL) return true
  try {
    const url = new URL(profile.baseURL)
    return url.protocol === 'https:' && (Array.isArray(host) ? host.includes(url.hostname) : url.hostname === host) && !url.username && !url.password
  } catch {
    return false
  }
}

/** Alibaba Cloud ACS3 signing, as required by Model Studio's Token Plan OpenAPI. */
export function signAlibabaRequest({ url, action, version, id, secret, token, date, nonce, method = 'GET', body = '' }) {
  const target = new URL(url)
  const payloadHash = createHash('sha256').update(body).digest('hex')
  const headers = {
    host: target.host,
    'x-acs-action': action,
    'x-acs-content-sha256': payloadHash,
    'x-acs-date': date,
    'x-acs-signature-nonce': nonce,
    'x-acs-version': version,
  }
  if (token) headers['x-acs-security-token'] = token
  const names = Object.keys(headers).sort()
  const signedHeaders = names.join(';')
  const canonicalHeaders = names.map((name) => name + ':' + headers[name].trim() + '\n').join('')
  const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())
  const query = [...target.searchParams].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => encode(key) + '=' + encode(value)).join('&')
  const canonical = [method, target.pathname, query, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const toSign = 'ACS3-HMAC-SHA256\n' + createHash('sha256').update(canonical).digest('hex')
  const signature = createHmac('sha256', secret).update(toSign).digest('hex')
  return { ...headers, authorization: 'ACS3-HMAC-SHA256 Credential=' + id + ',SignedHeaders=' + signedHeaders + ',Signature=' + signature, accept: 'application/json' }
}

async function providerAuth(credentials, profile, provider, spec) {
  if (spec.auth === 'configured-key') {
    if (!profile || typeof profile !== 'object') return null
    let key
    if (typeof profile.apiKeyEnv === 'string') {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(profile.apiKeyEnv)) return null
      key = (await credentials?.resolve?.(profile.apiKeyEnv))?.value
    } else {
      const record = await credentials?.readRecord?.('llm-pi-ai/' + provider)
      if (record?.kind === 'api-key') key = record.key || record.env?.[spec.env]
    }
    return typeof key === 'string' && key.trim() ? { key: key.trim(), headers: {} } : null
  }
  if (!spec.auth || spec.auth === 'oauth-or-key') {
    if (spec.auth === 'oauth-or-key' && !profile?.apiKeyEnv) {
      const record = await credentials?.readRecord('llm-pi-ai/' + provider)
      const grant = record?.kind === 'grant' ? record.payload : null
      if (grant?.type === 'oauth' && typeof grant.access === 'string' && grant.access && Number.isFinite(grant.expires) && grant.expires > Date.now() + 30_000) {
        return { key: grant.access, headers: {} }
      }
    }
    const key = await providerKey(credentials, profile, provider, spec.env)
    return key ? { key, headers: {} } : null
  }
  if (spec.auth === 'management') {
    const key = await optionalCredential(credentials, 'XAI_MANAGEMENT_API_KEY')
    const team = await optionalCredential(credentials, 'XAI_TEAM_ID')
    if (!key || !team || !/^[A-Za-z0-9-]{1,80}$/.test(team)) return null
    return { key, url: 'https://management-api.x.ai/v1/billing/teams/' + team + '/prepaid/balance', headers: {} }
  }
  if (spec.auth === 'alibaba') {
    const id = await optionalCredential(credentials, 'ALIBABA_CLOUD_ACCESS_KEY_ID')
    const secret = await optionalCredential(credentials, 'ALIBABA_CLOUD_ACCESS_KEY_SECRET')
    const token = await optionalCredential(credentials, 'ALIBABA_CLOUD_SECURITY_TOKEN')
    if (!id || !secret || !/^[A-Za-z0-9_-]+$/.test(id)) return null
    return { key: id, secret, token, headers: {} }
  }
  if (profile?.apiKeyEnv) return null // A configured API key is not a subscription OAuth grant.
  const record = await credentials?.readRecord('llm-pi-ai/' + provider)
  const grant = record?.kind === 'grant' ? record.payload : null
  if (!grant || grant.type !== 'oauth') return null
  if (spec.auth === 'github') {
    if (grant.enterpriseUrl || typeof grant.refresh !== 'string' || !grant.refresh) return null
    return { key: grant.refresh, headers: {} }
  }
  if (typeof grant.access !== 'string' || !grant.access || !Number.isFinite(grant.expires) || grant.expires <= Date.now() + 30_000) return null
  if (provider === 'openai-codex') {
    if (typeof grant.accountId !== 'string' || !grant.accountId) return null
    return { key: grant.access, headers: { 'chatgpt-account-id': grant.accountId } }
  }
  return { key: grant.access, headers: {} }
}

async function optionalCredential(credentials, ref) {
  const hit = await credentials?.resolve?.(ref)
  const value = hit?.value ?? process.env[ref]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function providerKey(credentials, profile, provider, defaultEnv) {
  const ref = profile && typeof profile.apiKeyEnv === 'string' ? profile.apiKeyEnv : null
  if (ref) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) return null
    const hit = await credentials?.resolve(ref)
    const value = hit?.value ?? process.env[ref]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  const record = await credentials?.readRecord('llm-pi-ai/' + provider)
  if (record) {
    if (record.kind !== 'api-key') return null // OAuth grants require their owner to refresh them.
    if (typeof record.key === 'string' && record.key.trim()) return record.key.trim()
    const inRecord = record.env && record.env[defaultEnv]
    if (typeof inRecord === 'string' && inRecord.trim()) return inRecord.trim()
  }
  if (!defaultEnv) return null
  const hit = await credentials?.resolve(defaultEnv)
  const value = hit?.value ?? process.env[defaultEnv]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Resolve official catalog entries and make bounded, single-flight reads. */
export function createProviderQuotaReader(ctx, request = fetch) {
  const cache = new Map()
  return async function readProviderQuotas(fresh = false, excluded = []) {
    const llm = ctx.get('llm')
    const settings = ctx.get('settings')
    const credentials = ctx.get('credentials')
    if (!llm || typeof llm.listConfigurableProviders !== 'function' || typeof settings?.describe !== 'function') return { ok: true, quotas: [] }
    const directory = llm.listConfigurableProviders()
    const descriptors = settings.describe({ redactSecrets: true })
    const entries = Array.isArray(directory) ? directory.filter((entry) => entry && typeof entry.provider === 'string' && !excluded.includes(entry.provider)) : []
    const quotas = await Promise.all(entries.map(async (entry) => {
      const descriptor = Array.isArray(descriptors) ? descriptors.find((row) => row.ns === entry.settingsNs) : null
      if (!descriptor) return null
      const profile = descriptor?.value?.providers?.[entry.provider]
      if (profile == null ? entry.declared !== false : typeof profile !== 'object') return null
      const spec = officialQuotaSpec(entry.provider, profile)
      if (!spec || !hasBuiltinQuotaQuery(entry.provider, profile)) return null
      try {
        const auth = await providerAuth(credentials, profile, entry.provider, spec)
        if (!auth) return null
        const key = auth.key
        const identity = createHash('sha256').update(JSON.stringify([key, auth.secret, auth.token, auth.url || spec.url, auth.headers['chatgpt-account-id']])).digest('hex')
        const cached = cache.get(entry.provider)
        if (!fresh && cached?.identity === identity && Date.now() - cached.at < (spec.ttl || TTL_MS)) return cached.result
        if (cached?.identity === identity && cached.promise) return cached.promise
        const promise = (async () => {
          let metrics = []
          try {
            const headers = spec.auth === 'alibaba'
              ? signAlibabaRequest({ url: spec.url, action: 'GetSubscriptionStats', version: '2026-02-10', id: key, secret: auth.secret, token: auth.token, date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), nonce: randomUUID() })
              : { authorization: 'Bearer ' + key, accept: 'application/json', ...spec.headers, ...auth.headers }
            const response = await request(auth.url || spec.url, {
              method: 'GET',
              headers,
              redirect: 'error',
              signal: AbortSignal.timeout(8000),
            })
            if (response.ok) metrics = spec.parse(await response.json())
          } catch {
            // An optional account-credit read can still succeed for OpenRouter.
          }
          if (entry.provider === 'openrouter') {
            const managementKey = await optionalCredential(credentials, 'OPENROUTER_MANAGEMENT_API_KEY')
            if (managementKey) {
              try {
                const credits = await request('https://openrouter.ai/api/v1/credits', {
                  method: 'GET',
                  headers: { authorization: 'Bearer ' + managementKey, accept: 'application/json' },
                  redirect: 'error',
                  signal: AbortSignal.timeout(8000),
                })
                if (credits.ok) metrics = parseOpenRouterCredits(await credits.json()).concat(metrics)
              } catch {
                // The model key's own limit can still be shown.
              }
            }
          }
          const name = entry.displayName && entry.displayName !== entry.provider ? entry.displayName : spec.name
          return metrics.length ? { provider: entry.provider, name, metrics, syncedAt: Date.now() } : null
        })()
        cache.set(entry.provider, { identity, at: 0, result: null, promise })
        try {
          const result = await promise
          cache.set(entry.provider, { identity, at: Date.now(), result })
          return result
        } catch {
          if (cache.get(entry.provider)?.promise === promise) cache.delete(entry.provider)
          return null
        }
      } catch {
        // Invalid, expired, or unreachable providers are intentionally absent.
        return null
      }
    }))
    return { ok: true, quotas: quotas.filter(Boolean) }
  }
}

/** Generic /balance examples do not count as a provider-specific query. */
export function hasBuiltinQuotaQuery(provider, profile) {
  const spec = officialQuotaSpec(provider, profile)
  return !!spec && spec.queryable !== false && (!spec.configuredOnly || !!profile && typeof profile === 'object') && officialProfile(profile, spec.host)
}

/** Query templates carry field paths and credential references, never keys. */
export function quotaTemplate(provider, profile) {
  const spec = hasBuiltinQuotaQuery(provider, profile) ? officialQuotaSpec(provider, profile) : null
  let baseURL = ''
  try {
    const base = new URL(profile?.baseURL)
    if (!base.username && !base.password) baseURL = base.origin + base.pathname.replace(/\/$/, '')
  } catch {}
  const url = provider === 'xai' && spec ? 'https://management-api.x.ai/v1/billing/teams/{{teamId}}/prepaid/balance' : spec?.url || (provider === 'opencode' ? '' : baseURL ? baseURL + '/balance' : '')
  let response = spec ? { format: 'official' } : { metrics: [{ label: '账户可用余额', kind: 'amount', remaining: 'data.balance', currency: 'CNY' }] }
  if (spec && provider === 'deepseek') response = { rows: 'balance_infos', metrics: [{ label: '账户可用余额', kind: 'amount', remaining: 'total_balance', currencyPath: 'currency' }] }
  if (spec && provider === 'openrouter') response = { metrics: [{ label: '密钥额度', kind: 'amount', remaining: 'data.limit_remaining', total: 'data.limit', currency: 'USD' }] }
  if (spec && (provider === 'moonshotai' || provider === 'moonshotai-cn')) response = { metrics: [{ label: '账户可用余额', kind: 'amount', remaining: 'data.available_balance', currency: provider === 'moonshotai-cn' ? 'CNY' : 'USD' }] }
  // StepFun's balance sits at the response ROOT. The generic `data.balance`
  // guess prefilled for unknown providers silently yields no metric, so give
  // this one the real paths — all three, so the editable form shows the same
  // cash/voucher split the built-in parser reports.
  if (spec === PROVIDERS.stepfun) response = {
    metrics: [
      { label: '账户可用余额', kind: 'amount', remaining: 'balance', currency: 'CNY' },
      { label: '充值余额', kind: 'amount', remaining: 'total_cash_balance', currency: 'CNY' },
      { label: '赠送余额', kind: 'amount', remaining: 'total_voucher_balance', currency: 'CNY' },
    ],
  }
  return { url, method: 'GET', auth: 'provider', headers: { accept: 'application/json' }, response }
}

export function officialQuotaSpec(provider, profile) {
  if (Object.hasOwn(PROVIDERS, provider)) return PROVIDERS[provider]
  // Model settings allow arbitrary custom ids (including "setpfun"). Match
  // StepFun by its verified HTTPS host, while credentials keep the original id.
  if (profile?.baseURL && officialProfile(profile, PROVIDERS.stepfun.host)) return PROVIDERS.stepfun
  return null
}

export async function customQuotaAuth(ctx, profile, provider, url, method, body) {
  const spec = officialQuotaSpec(provider, profile)
  const credentials = ctx.get('credentials')
  const useOfficial = spec && officialProfile(profile, spec.host)
  const auth = useOfficial || spec?.auth === 'configured-key'
    ? await providerAuth(credentials, profile, provider, spec)
    : { key: await providerKey(credentials, profile, provider, spec?.env) }
  if (!auth?.key) return null
  if (useOfficial && spec.auth === 'alibaba') return { headers: signAlibabaRequest({ url, method, body, action: 'GetSubscriptionStats', version: '2026-02-10', id: auth.key, secret: auth.secret, token: auth.token, date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), nonce: randomUUID() }) }
  return { headers: { authorization: 'Bearer ' + auth.key, ...(useOfficial ? spec.headers : {}), ...auth.headers }, url: auth.url }
}
