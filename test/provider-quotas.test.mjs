import test from 'node:test'
import assert from 'node:assert/strict'
import { createProviderQuotaReader, signAlibabaRequest, officialQuotaSpec, hasBuiltinQuotaQuery, quotaTemplate } from '../src/provider-quotas.js'
import { validateQuotaTemplate } from '../src/quota-controls.js'

function fixture(profiles, replies) {
  const calls = []
  const credentials = {
    async resolve(ref) { return ref === 'OPENROUTER_MANAGEMENT_API_KEY' ? undefined : { value: 'secret-' + ref } },
    async readRecord() { return undefined },
  }
  const ctx = {
    get(name) {
      if (name === 'llm') return { listConfigurableProviders: () => Object.keys(profiles).map((provider) => ({ provider, settingsNs: 'llm-pi-ai', declared: provider === 'custom' })) }
      if (name === 'settings') return { describe: () => [{ ns: 'llm-pi-ai', value: { providers: profiles } }] }
      if (name === 'credentials') return credentials
    },
  }
  const request = async (url, options) => {
    calls.push({ url, options })
    assert.equal(options.redirect, 'error')
    assert.match(options.headers.authorization, /^Bearer secret-/)
    const reply = replies[url]
    return { ok: reply !== undefined, json: async () => reply }
  }
  return { read: createProviderQuotaReader(ctx, request), calls }
}

test('OpenCode queries only the configured Go provider and never substitutes Zen or local usage', async () => {
  const profile = { apiKeyEnv: 'DSH_GO_KEY', baseURL: 'https://opencode.ai/zen/go/v1' }
  const { read, calls } = fixture({ 'opencode-go': profile, opencode: { apiKeyEnv: 'DSH_ZEN_KEY' } }, {
    'https://opencode.ai/zen/go/v1/usage': { usage: {
      rolling: { percent: 0, resetsAt: '2026-10-01T12:00:00Z' },
      weekly: { percent: 54 }, monthly: { percent: 120 },
    } },
  })
  const result = await read(true)
  assert.deepEqual(result.quotas.map((row) => row.provider), ['opencode-go'])
  assert.deepEqual(result.quotas[0].metrics.map((row) => row.remainingPercent), [100, 46, 0])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret-DSH_GO_KEY')
  assert.equal(hasBuiltinQuotaQuery('opencode-go', profile), true)
  assert.equal(hasBuiltinQuotaQuery('opencode', {}), false)
  assert.equal(quotaTemplate('opencode', { baseURL: 'https://opencode.ai/zen/v1' }).url, '')
  assert.equal(quotaTemplate('opencode-go', profile).response.format, 'official')
  assert.equal(result.quotas[0].metrics[0].resetAt, '2026-10-01T12:00:00.000Z')
})

test('OpenCode uses its own DSH record without falling back to a shared environment key', async () => {
  let profile = {}, records = 0, queries = 0
  let ownKey = 'dsh-go-record-key'
  const ctx = { get(name) {
    if (name === 'llm') return { listConfigurableProviders: () => [{ provider: 'opencode-go', settingsNs: 'models', declared: false }] }
    if (name === 'settings') return { describe: () => [{ ns: 'models', value: { providers: profile === undefined ? {} : { 'opencode-go': profile } } }] }
    if (name === 'credentials') return {
      resolve: async () => { assert.fail('must not fall back to a generic credential reference') },
      readRecord: async (id) => { records++; assert.equal(id, 'llm-pi-ai/opencode-go'); return ownKey ? { kind: 'api-key', key: ownKey } : null },
    }
  } }
  const reader = createProviderQuotaReader(ctx, async (url, options) => {
    queries++
    assert.equal(url, 'https://opencode.ai/zen/go/v1/usage')
    assert.equal(options.headers.authorization, 'Bearer dsh-go-record-key')
    return { ok: true, json: async () => ({ usage: { rolling: { percent: 10 } } }) }
  })
  assert.equal((await reader(true)).quotas[0].provider, 'opencode-go')
  ownKey = null
  assert.deepEqual((await reader(true)).quotas, [])
  assert.equal(queries, 1, 'missing DSH credentials must not query another account')
  const prior = records
  profile = undefined
  assert.deepEqual((await reader(true)).quotas, [])
  profile = { baseURL: 'https://relay.example/v1' }
  assert.deepEqual((await reader(true)).quotas, [])
  assert.equal(records, prior, 'unconfigured and relay providers do not read credentials')
})

test('official built-in providers report only validated quota or balance data', async () => {
  const profiles = {
    deepseek: {},
    openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY' },
    moonshotai: {},
    'moonshotai-cn': {},
    'kimi-coding': {},
    minimax: {},
    'minimax-cn': {},
    zai: {},
    'zai-coding-cn': {},
    custom: { baseURL: 'https://example.org/v1' },
  }
  const replies = {
    'https://api.deepseek.com/user/balance': { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '9.50' }] },
    'https://openrouter.ai/api/v1/key': { data: { limit: 100, limit_remaining: 24.5, limit_reset: 'monthly' } },
    'https://api.moonshot.ai/v1/users/me/balance': { data: { available_balance: '0.00' } },
    'https://api.moonshot.cn/v1/users/me/balance': { data: { available_balance: '18.2' } },
    'https://api.kimi.com/coding/v1/usages': { usage: { limit: '100', remaining: '75' }, limits: [{ window: { duration: 300, timeUnit: 'MINUTE' }, detail: { limit: '50', used: '20' } }] },
    'https://www.minimax.io/v1/token_plan/remains': { base_resp: { status_code: 0 }, model_remains: [{ model_name: 'general', current_interval_remaining_percent: 72, current_weekly_remaining_percent: 35 }, { model_name: 'video', current_interval_remaining_percent: 10 }] },
    'https://www.minimaxi.com/v1/token_plan/remains': { base_resp: { status_code: 0 }, model_remains: [{ model_name: 'MiniMax-M2.7', current_interval_total_count: 100, current_interval_usage_count: 62 }] },
    'https://api.z.ai/api/monitor/usage/quota/limit': { code: 200, data: { limits: [{ type: 'TOKENS_LIMIT', unit: 3, percentage: 25 }, { type: 'TIME_LIMIT', percentage: 50 }] } },
    'https://open.bigmodel.cn/api/monitor/usage/quota/limit': { code: 200, data: { limits: [{ type: 'TOKENS_LIMIT', unit: 6, percentage: 90 }] } },
  }
  const { read, calls } = fixture(profiles, replies)
  const result = await read()
  assert.equal(result.ok, true)
  assert.equal(result.quotas.length, 9)
  assert.equal(calls.length, 9)
  assert.equal(result.quotas.find((q) => q.provider === 'deepseek').metrics[0].remaining, 9.5)
  assert.equal(result.quotas.find((q) => q.provider === 'openrouter').metrics[0].remaining, 24.5)
  assert.equal(result.quotas.find((q) => q.provider === 'moonshotai').metrics[0].remaining, 0)
  assert.deepEqual(result.quotas.find((q) => q.provider === 'kimi-coding').metrics.map((m) => m.remainingPercent), [75, 60])
  assert.deepEqual(result.quotas.find((q) => q.provider === 'minimax').metrics.map((m) => m.remainingPercent), [72, 35])
  assert.equal(result.quotas.find((q) => q.provider === 'minimax-cn').metrics[0].remainingPercent, 62)
  assert.equal(result.quotas.find((q) => q.provider === 'zai').metrics[0].remainingPercent, 75)
  assert.equal(result.quotas.find((q) => q.provider === 'zai-coding-cn').metrics[0].remainingPercent, 10)
  assert.doesNotMatch(JSON.stringify(result), /secret-/)
  await read()
  assert.equal(calls.length, 9, 'cached responses avoid repeated provider calls')
  await read(true)
  assert.equal(calls.length, 18, 'manual refresh re-reads each available provider')
})

test('custom gateways and invalid upstream data never produce quota cards', async () => {
  const { read, calls } = fixture({
    openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY', baseURL: 'https://gateway.example/v1' },
    moonshotai: {},
    minimax: {},
    zai: {},
  }, {
    'https://api.moonshot.ai/v1/users/me/balance': { data: { available_balance: null } },
    'https://www.minimax.io/v1/token_plan/remains': { base_resp: { status_code: 401 }, model_remains: [{ current_interval_remaining_percent: 100 }] },
    'https://api.z.ai/api/monitor/usage/quota/limit': { code: 401, data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 1 }] } },
  })
  const result = await read()
  assert.deepEqual(result.quotas, [])
  assert.equal(calls.length, 3)
  assert.ok(calls.every(({ url }) => !url.includes('openrouter')))
})

test('provider credential records are read without exposing the key', async () => {
  const calls = []
  const ctx = { get(name) {
    if (name === 'llm') return { listConfigurableProviders: () => [{ provider: 'openrouter', settingsNs: 'llm-pi-ai', declared: false }] }
    if (name === 'settings') return { describe: () => [{ ns: 'llm-pi-ai', value: { providers: {} } }] }
    if (name === 'credentials') return { readRecord: async (key) => {
      assert.equal(key, 'llm-pi-ai/openrouter')
      return { kind: 'api-key', key: 'stored-private-key' }
    } }
  } }
  const read = createProviderQuotaReader(ctx, async (_url, options) => {
    calls.push(options.headers.authorization)
    return { ok: true, json: async () => ({ data: { limit_remaining: 0 } }) }
  })
  const result = await read()
  assert.deepEqual(calls, ['Bearer stored-private-key'])
  assert.equal(result.quotas[0].metrics[0].remaining, 0)
  assert.doesNotMatch(JSON.stringify(result), /stored-private-key/)
})

test('Kimi Coding and OpenRouter also accept unexpired DSH OAuth grants', async () => {
  const records = {
    'llm-pi-ai/kimi-coding': { kind: 'grant', payload: { type: 'oauth', access: 'kimi-login-secret', expires: Date.now() + 3600_000 } },
    'llm-pi-ai/openrouter': { kind: 'grant', payload: { type: 'oauth', access: 'router-login-secret', expires: Number.MAX_SAFE_INTEGER } },
  }
  const calls = []
  const ctx = { get(name) {
    if (name === 'llm') return { listConfigurableProviders: () => ['kimi-coding', 'openrouter'].map((provider) => ({ provider, settingsNs: 'llm-pi-ai', declared: false })) }
    if (name === 'settings') return { describe: () => [{ ns: 'llm-pi-ai', value: { providers: {} } }] }
    if (name === 'credentials') return { readRecord: async (key) => records[key], resolve: async () => undefined }
  } }
  const read = createProviderQuotaReader(ctx, async (url, options) => {
    calls.push(options.headers.authorization)
    const body = url.includes('kimi.com') ? { usage: { limit: 100, remaining: 60 } } : { data: { limit_remaining: 5 } }
    return { ok: true, json: async () => body }
  })
  const result = await read()
  assert.deepEqual(calls.sort(), ['Bearer kimi-login-secret', 'Bearer router-login-secret'])
  assert.equal(result.quotas.length, 2)
  assert.doesNotMatch(JSON.stringify(result), /login-secret/)
  records['llm-pi-ai/kimi-coding'].payload.expires = Date.now() - 1000
  const afterExpiry = await read(true)
  assert.deepEqual(afterExpiry.quotas.map((row) => row.provider), ['openrouter'])
})

test('OpenRouter account credits require a separate management credential', async () => {
  const calls = []
  const ctx = { get(name) {
    if (name === 'llm') return { listConfigurableProviders: () => [{ provider: 'openrouter', settingsNs: 'llm-pi-ai', declared: false }] }
    if (name === 'settings') return { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY' } } } }] }
    if (name === 'credentials') return { resolve: async (ref) => ({ value: ref === 'OPENROUTER_MANAGEMENT_API_KEY' ? 'management-private' : 'model-private' }) }
  } }
  const read = createProviderQuotaReader(ctx, async (url, options) => {
    calls.push({ url, auth: options.headers.authorization })
    if (url.endsWith('/key')) return { ok: true, json: async () => ({ data: { limit_remaining: null } }) }
    return { ok: true, json: async () => ({ data: { total_credits: 20, total_usage: 6.75 } }) }
  })
  const result = await read()
  assert.equal(result.quotas[0].metrics[0].remaining, 13.25)
  assert.deepEqual(calls.map((call) => call.auth), ['Bearer model-private', 'Bearer management-private'])
  assert.doesNotMatch(JSON.stringify(result), /private/)
})

test('xAI balance uses its management key and team id, never the model key', async () => {
  const ctx = { get(name) {
    if (name === 'llm') return { listConfigurableProviders: () => [{ provider: 'xai', settingsNs: 'llm-pi-ai', declared: false }] }
    if (name === 'settings') return { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { xai: { apiKeyEnv: 'XAI_API_KEY' } } } }] }
    if (name === 'credentials') return { resolve: async (ref) => ({ value: { XAI_MANAGEMENT_API_KEY: 'management-secret', XAI_TEAM_ID: 'team-123', XAI_API_KEY: 'model-secret' }[ref] }) }
  } }
  const read = createProviderQuotaReader(ctx, async (url, options) => {
    assert.equal(url, 'https://management-api.x.ai/v1/billing/teams/team-123/prepaid/balance')
    assert.equal(options.headers.authorization, 'Bearer management-secret')
    return { ok: true, json: async () => ({ total: { val: '1234' } }) }
  })
  const result = await read()
  assert.equal(result.quotas[0].metrics[0].remaining, 12.34)
  assert.doesNotMatch(JSON.stringify(result), /secret|team-123/)
})

test('Alibaba Cloud ACS3 signature matches the official reference vector', () => {
  const signed = signAlibabaRequest({
    url: 'https://ecs.cn-shanghai.aliyuncs.com/?ImageId=win2019_1809_x64_dtc_zh-cn_40G_alibase_20230811.vhd&RegionId=cn-shanghai',
    action: 'RunInstances', version: '2014-05-26', method: 'POST',
    id: 'YourAccessKeyId', secret: 'YourAccessKeySecret',
    date: '2023-10-26T10:22:32Z', nonce: '3156853299f313e23d1673dc12e1703d',
  })
  assert.equal(signed.authorization, 'ACS3-HMAC-SHA256 Credential=YourAccessKeyId,SignedHeaders=host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version,Signature=06563a9e1b43f5dfe96b81484da74bceab24a1d853912eee15083a6f0f3283c0')
})

test('Qwen CN Token Plan uses signed account credentials and shows only valid seat credits', async () => {
  const calls = []
  const ctx = { get(name) {
    if (name === 'llm') return { listConfigurableProviders: () => [{ provider: 'qwen-token-plan-cn', settingsNs: 'llm-pi-ai', declared: false }] }
    if (name === 'settings') return { describe: () => [{ ns: 'llm-pi-ai', value: { providers: {} } }] }
    if (name === 'credentials') return { resolve: async (ref) => ({ value: {
      ALIBABA_CLOUD_ACCESS_KEY_ID: 'LTAItest',
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'account-secret',
      ALIBABA_CLOUD_SECURITY_TOKEN: 'session-secret',
    }[ref] }) }
  } }
  const read = createProviderQuotaReader(ctx, async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ Success: true, Data: { Items: [
      { SeatType: 'pro', SeatCredits: 100, SeatRemainingCredits: 40, SeatRefreshTime: 1893456000000 },
      { SeatType: 'max', SeatCredits: 0, SeatRemainingCredits: 0 },
      { SeatType: 'standard', SeatCredits: 100, SeatRemainingCredits: null },
    ] } }) }
  })
  const result = await read()
  assert.equal(calls[0].url, 'https://modelstudio.cn-beijing.aliyuncs.com/tokenplan/subscription/stats')
  assert.match(calls[0].options.headers.authorization, /^ACS3-HMAC-SHA256 Credential=LTAItest,/)
  assert.equal(calls[0].options.headers['x-acs-security-token'], 'session-secret')
  assert.equal(result.quotas[0].metrics.length, 1)
  assert.equal(result.quotas[0].metrics[0].remainingPercent, 40)
  assert.equal(result.quotas[0].metrics[0].remaining, 40)
  assert.doesNotMatch(JSON.stringify(result), /LTAItest|secret/)
})

test('unexpired DSH OAuth grants expose subscription windows without refreshing or leaking tokens', async () => {
  const now = Date.now()
  const records = {
    'llm-pi-ai/anthropic': { kind: 'grant', payload: { type: 'oauth', access: 'claude-secret', expires: now + 3600_000 } },
    'llm-pi-ai/openai-codex': { kind: 'grant', payload: { type: 'oauth', access: 'codex-secret', accountId: 'acct-1', expires: now + 3600_000 } },
    'llm-pi-ai/github-copilot': { kind: 'grant', payload: { type: 'oauth', access: 'copilot-short-token', refresh: 'github-secret', expires: now - 1000 } },
  }
  const calls = []
  const ctx = { get(name) {
    if (name === 'llm') return { listConfigurableProviders: () => ['anthropic', 'openai-codex', 'github-copilot'].map((provider) => ({ provider, declared: false, settingsNs: 'llm-pi-ai' })) }
    if (name === 'settings') return { describe: () => [{ ns: 'llm-pi-ai', value: { providers: {} } }] }
    if (name === 'credentials') return { readRecord: async (key) => records[key] }
  } }
  const response = {
    'https://api.anthropic.com/api/oauth/usage': { five_hour: { utilization: 20, resets_at: '2099-01-01T00:00:00Z' }, seven_day: { utilization: 80 } },
    'https://chatgpt.com/backend-api/wham/usage': { rate_limit: { primary_window: { used_percent: 30, limit_window_seconds: 18000, reset_at: 4102444800 } }, additional_rate_limits: [{ limit_name: 'spark', rate_limit: { primary_window: { used_percent: 90, limit_window_seconds: 604800 } } }] },
    'https://api.github.com/copilot_internal/user': { quota_snapshots: { premium_interactions: { entitlement: 100, remaining: 45, percent_remaining: 45 }, chat: { entitlement: -1, remaining: 0 } } },
  }
  const read = createProviderQuotaReader(ctx, async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => response[url] }
  })
  const result = await read()
  assert.equal(calls.length, 3)
  assert.deepEqual(result.quotas.find((q) => q.provider === 'anthropic').metrics.map((m) => m.remainingPercent), [80, 20])
  assert.deepEqual(result.quotas.find((q) => q.provider === 'openai-codex').metrics.map((m) => m.remainingPercent), [70, 10])
  assert.equal(result.quotas.find((q) => q.provider === 'github-copilot').metrics[0].remainingPercent, 45)
  assert.equal(calls.find((c) => c.url.includes('wham')).options.headers['chatgpt-account-id'], 'acct-1')
  assert.equal(calls.find((c) => c.url.includes('github.com')).options.headers.authorization, 'Bearer github-secret')
  assert.doesNotMatch(JSON.stringify(result), /secret|acct-1/)
  records['llm-pi-ai/anthropic'].payload.expires = now - 1000
  const second = await read(true)
  assert.ok(!second.quotas.some((q) => q.provider === 'anthropic'))
})

/**
 * StepFun regression guard.
 *
 * StepFun has no `/balance` route and no `data` wrapper: the documented endpoint
 * is GET https://api.stepfun.com/v1/accounts and the amount is `balance` at the
 * response ROOT. Before this was a built-in the UI prefilled the generic
 * `<baseURL>/balance` + `data.balance` guess, which produced a 404 and then (on a
 * corrected URL) an empty metric list. Both halves are pinned here.
 */
test('StepFun is a built-in with the documented /v1/accounts endpoint and root balance', () => {
  const spec = officialQuotaSpec('stepfun')
  assert.ok(spec, 'stepfun must ship a built-in spec')
  assert.equal(spec.url, 'https://api.stepfun.com/v1/accounts',
    'the documented endpoint is /v1/accounts; /step_plan/... and /v1/balance both 404')
  assert.equal(spec.host, 'api.stepfun.com', 'the origin guard needs the real host')

  const profile = { baseURL: 'https://api.stepfun.com/v1' }
  assert.equal(hasBuiltinQuotaQuery('stepfun', profile), true, 'the official endpoint counts as built-in')
  assert.equal(hasBuiltinQuotaQuery('stepfun', { baseURL: 'https://relay.example/v1' }), false,
    'a third-party relay must NOT borrow the official parser')

  // The prefilled template must carry the ROOT paths, not the generic data.balance
  // guess. It ships an editable metrics mapping (like deepseek/openrouter/moonshot)
  // rather than `format: official`, so the field paths stay visible and fixable.
  const template = quotaTemplate('stepfun', profile)
  assert.equal(template.url, 'https://api.stepfun.com/v1/accounts', 'the prefill must use the real URL')
  assert.doesNotMatch(JSON.stringify(template), /data\.balance/,
    'the generic data.balance guess must not be prefilled for StepFun')
  assert.deepEqual(template.response.metrics.map((m) => m.remaining),
    ['balance', 'total_cash_balance', 'total_voucher_balance'],
    'the prefill must read the root balance fields')

  // The prefill must survive the plugin's own validator.
  assert.doesNotThrow(() => validateQuotaTemplate(template, 'stepfun'))

  // Parser: documented shape, including the cash/voucher split.
  const metrics = spec.parse({ object: 'account', type: 'prepaid', balance: 26.5, total_cash_balance: 0.5, total_voucher_balance: 26 })
  assert.deepEqual(metrics.map((m) => [m.label, m.remaining, m.currency]), [
    ['账户可用余额', 26.5, 'CNY'],
    ['充值余额', 0.5, 'CNY'],
    ['赠送余额', 26, 'CNY'],
  ])

  // A postpaid account without a voucher reports only the balance.
  assert.deepEqual(spec.parse({ object: 'account', type: 'postpaid', balance: 12.25 }).map((m) => m.label), ['账户可用余额'])

  // Never invent a metric from junk, and never surface a negative balance.
  for (const junk of [null, undefined, {}, { balance: null }, 'nope', { balance: -5 }, { balance: 'abc' }]) {
    assert.deepEqual(spec.parse(junk), [], 'junk must not produce metrics: ' + JSON.stringify(junk))
  }
})

test('a custom StepFun id uses the official query and keeps its configured credentials', async () => {
  const profile = { baseURL: 'https://api.stepfun.com/step_plan/v1', apiKeyEnv: 'CUSTOM_STEP_KEY' }
  const calls = [], refs = []
  const ctx = { get(name) {
    return {
      llm: { listConfigurableProviders: () => [{ provider: 'setpfun', displayName: 'stepfun', declared: true, settingsNs: 'models' }] },
      settings: { describe: () => [{ ns: 'models', value: { providers: { setpfun: profile } } }] },
      credentials: { resolve: async (ref) => { refs.push(ref); return { value: 'alias-credential' } } },
    }[name]
  } }
  assert.equal(hasBuiltinQuotaQuery('setpfun', profile), true)
  const template = quotaTemplate('setpfun', profile)
  assert.equal(template.url, 'https://api.stepfun.com/v1/accounts')
  assert.equal(template.response.metrics[0].remaining, 'balance')
  assert.doesNotThrow(() => validateQuotaTemplate({ ...template, response: { format: 'official' } }, 'setpfun', profile))
  const read = createProviderQuotaReader(ctx, async (url, options) => {
    calls.push({ url, options })
    return new Response(JSON.stringify({ balance: 26.5, total_cash_balance: .5, total_voucher_balance: 26 }), { status: 200 })
  })
  const body = await read(true)
  assert.equal(body.quotas.length, 1)
  assert.equal(body.quotas[0].provider, 'setpfun', 'custom ids remain stable for cache and exclusion')
  assert.equal(body.quotas[0].metrics[0].remaining, 26.5)
  assert.deepEqual(refs, ['CUSTOM_STEP_KEY'])
  assert.equal(calls[0].url, template.url)
  assert.equal(calls[0].options.headers.authorization, 'Bearer alias-credential')
  assert.doesNotMatch(JSON.stringify(body), /alias-credential/)
  assert.deepEqual((await read(true, ['setpfun'])).quotas, [])
  assert.equal(calls.length, 1, 'a saved custom query excludes the original custom id')
  for (const baseURL of ['https://relay.example/v1', 'http://api.stepfun.com/v1', 'https://api.stepfun.com.evil.example/v1']) {
    assert.equal(hasBuiltinQuotaQuery('setpfun', { baseURL }), false)
  }
  assert.equal(hasBuiltinQuotaQuery('unrelated', {}), false, 'a missing URL cannot identify a custom provider')
})
