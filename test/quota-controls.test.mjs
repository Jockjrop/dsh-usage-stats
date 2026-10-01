import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createQuotaControls, executeQuotaQuery, readWorkBuddyQuota, workBuddyQuotaSource, validateQuotaTemplate } from '../src/quota-controls.js'
import { createProviderQuotaReader, quotaTemplate } from '../src/provider-quotas.js'
import { apply } from '../src/index.js'

const context = () => ({ get(name) {
  return {
    // "deepseek" is only declarable here; it is not in the settings `providers`
    // map, so the control page must not offer it — the same rule the models page
    // uses. Add it to `providers` to make it selectable, as in realSettings.
    llm: { listConfigurableProviders: () => [{ provider: 'deepseek', displayName: 'DeepSeek', settingsNs: 'models' }, { provider: 'gateway', displayName: '本地网关', settingsNs: 'models', declared: true }] },
    settings: { describe: () => [{ ns: 'models', value: { providers: { gateway: { baseURL: 'http://127.0.0.1:9000/v1', apiKeyEnv: 'GATEWAY_KEY' } } } }] },
    credentials: { resolve: async (ref) => ({ value: ref === 'GATEWAY_KEY' ? 'gateway-secret' : 'provider-secret' }), readRecord: async () => null },
  }[name]
} })
/** Same wiring, but both providers are actually configured in settings. */
const configuredContext = () => ({ get(name) {
  return {
    llm: { listConfigurableProviders: () => [{ provider: 'deepseek', displayName: 'DeepSeek', settingsNs: 'models' }, { provider: 'gateway', displayName: '本地网关', settingsNs: 'models', declared: true }] },
    settings: { describe: () => [{ ns: 'models', value: { providers: {
      deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
      gateway: { baseURL: 'http://127.0.0.1:9000/v1', apiKeyEnv: 'GATEWAY_KEY' },
    } } }] },
    credentials: { resolve: async (ref) => ({ value: ref === 'GATEWAY_KEY' ? 'gateway-secret' : 'provider-secret' }), readRecord: async () => null },
  }[name]
} })
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const temporary = async (fn) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-control-test-'))
  try { await fn(join(home, 'controls.json')) } finally { await rm(home, { recursive: true, force: true }) }
}
const waitFor = async (predicate) => {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await new Promise((resolve) => setTimeout(resolve, 5)) }
  assert.fail('operation did not finish')
}

test('default-off reads never query; explicit refresh caches and survives restart without credentials', async () => temporary(async (path) => {
  let calls = 0
  const options = { path, sources: { providers: async () => { calls++; return { ok: true, quotas: [{ provider: 'deepseek', name: 'DeepSeek', metrics: [{ kind: 'amount', remaining: 10, currency: 'CNY' }] }] } } } }
  const controller = createQuotaControls(context(), options)
  assert.deepEqual((await controller.get()).settings, { autoQuota: false, intervalMinutes: 60, showModelDetails: true, advancedModelSelect: false, customQueries: [] })
  await controller.tick()
  assert.deepEqual((await controller.read('providers')).quotas, [])
  assert.equal(calls, 0)
  await controller.read('providers', true)
  const restarted = createQuotaControls(context(), options)
  assert.equal((await restarted.read('providers')).quotas[0].metrics[0].remaining, 10)
  assert.equal(calls, 1)
  await restarted.update({ showModelDetails: false, intervalMinutes: 1440 })
  const persisted = createQuotaControls(context(), options)
  assert.equal((await persisted.get()).settings.showModelDetails, false)
  assert.equal((await persisted.get()).settings.intervalMinutes, 1440)
}))

test('configured balances appear unqueried without a probe, including custom StepFun ids', async () => temporary(async (path) => {
  const profiles = {
    setpfun: { baseURL: 'https://api.stepfun.com/step_plan/v1', apiKeyEnv: 'CUSTOM_STEP_KEY' },
    deepseek: {}, anthropic: {}, gateway: { baseURL: 'https://relay.example/v1' },
  }
  let queries = 0, credentials = 0, success = false
  const ctx = { get(name) {
    return {
      llm: { listConfigurableProviders: () => Object.keys(profiles).map((provider) => ({ provider, settingsNs: 'models', declared: provider === 'setpfun' || provider === 'gateway' })).concat({ provider: 'openrouter', settingsNs: 'models' }) },
      settings: { describe: () => [{ ns: 'models', value: { providers: profiles } }] },
      credentials: { resolve: async () => { credentials++; return { value: 'mock-key' } }, readRecord: async () => { credentials++; return null } },
    }[name]
  } }
  const reader = createProviderQuotaReader(ctx, async (url) => { queries++; return json(url.endsWith('/accounts') && success ? { balance: 26.5 } : {}) })
  const options = { path, sources: { providers: (excluded) => reader(true, excluded) } }
  const controls = createQuotaControls(ctx, options)
  const offered = (await controls.providers()).providers.find((entry) => entry.provider === 'setpfun')
  assert.equal(offered.hasBuiltinQuery, true, 'the picker can light the built-in query dot for an official custom id')
  assert.equal(offered.template.url, 'https://api.stepfun.com/v1/accounts')
  const initial = (await controls.read('providers')).quotas
  assert.deepEqual(initial.map((row) => [row.provider, row.status, row.metrics]), [['setpfun', 'unqueried', []], ['deepseek', 'unqueried', []]])
  assert.ok(initial.every((row) => row.kind === 'balance'), 'unqueried balances expose their type without requesting a provider')
  await controls.tick()
  assert.equal(queries, 0)
  assert.equal(credentials, 0, 'cached rows need neither credential resolution nor provider requests')
  const failed = (await controls.read('providers', true)).quotas
  assert.equal(failed.find((row) => row.provider === 'setpfun').status, 'unavailable', 'an attempted query is distinct from one never made')
  assert.ok(queries > 0)
  success = true
  const refreshed = (await controls.read('providers', true)).quotas
  assert.equal(refreshed.filter((row) => row.provider === 'setpfun').length, 1)
  assert.equal(refreshed.find((row) => row.provider === 'setpfun').metrics[0].remaining, 26.5)
  profiles.moonshotai = {}
  const priorCalls = queries
  const restarted = createQuotaControls(ctx, options)
  const cached = (await restarted.read('providers')).quotas
  assert.equal(cached.find((row) => row.provider === 'setpfun').metrics[0].remaining, 26.5)
  assert.equal(cached.find((row) => row.provider === 'moonshotai').status, 'unqueried', 'new model configuration appears immediately on a cached read')
  assert.equal(queries, priorCalls)
}))

test('the advanced model selector switch is off by default, persists both ways and rejects non-booleans', async () => temporary(async (path) => {
  const options = { path, sources: {} }
  const controller = createQuotaControls(context(), options)
  // Off by default: the seat must not shadow the official model selector until
  // the user asks for it.
  assert.equal((await controller.get()).settings.advancedModelSelect, false)
  // A settings file written before this switch existed must load as off, not as
  // undefined, or the picker would silently read undefined as "no".
  await writeFile(path, JSON.stringify({ settings: { autoQuota: false, intervalMinutes: 60, showModelDetails: true } }), 'utf8')
  assert.equal((await createQuotaControls(context(), options).get()).settings.advancedModelSelect, false)
  await controller.update({ advancedModelSelect: true })
  assert.equal((await controller.get()).settings.advancedModelSelect, true)
  await assert.rejects(controller.update({ advancedModelSelect: 'true' }), /高级模型选择器开关值无效/)
  assert.equal((await controller.get()).settings.advancedModelSelect, true)
  const persisted = createQuotaControls(context(), options)
  assert.equal((await persisted.get()).settings.advancedModelSelect, true)
  await persisted.update({ advancedModelSelect: false })
  assert.equal((await createQuotaControls(context(), options).get()).settings.advancedModelSelect, false)
}))

test('automatic queries require the cost reminder, run at each supported interval, and stop when disabled', async () => temporary(async (path) => {
  let time = 1_700_000_000_000, calls = 0
  const controller = createQuotaControls(context(), { path, now: () => time, sources: { providers: async () => { calls++; return { ok: true, quotas: [] } }, unavailable: async () => { throw new Error('offline') } } })
  await assert.rejects(controller.update({ autoQuota: true }), /消耗少量余额/)
  assert.equal(calls, 0)
  for (const minutes of [10, 60, 300, 1440]) {
    await controller.update({ intervalMinutes: minutes })
    await controller.update({ autoQuota: true, acknowledgeCost: true })
    await controller.tick()
    const first = calls
    assert.equal((await controller.get()).nextRefreshAt, time + minutes * 60_000)
    time += minutes * 60_000 - 1
    await controller.tick()
    assert.equal(calls, first)
    time++
    await Promise.all([controller.tick(), controller.tick()])
    assert.equal(calls, first + 1)
    await controller.update({ autoQuota: false })
    time += minutes * 60_000
    await controller.tick()
    assert.equal(calls, first + 1)
  }
  await assert.rejects(controller.update({ intervalMinutes: 30 }), /仅支持/)
  const restarted = createQuotaControls(context(), { path, now: () => time, sources: { providers: async () => { calls++; return { ok: true, quotas: [] } } } })
  await restarted.tick()
  assert.equal((await restarted.get()).settings.autoQuota, false)
}))

test('custom templates use existing supplier credentials and normalize numeric balances, windows and arrays', async () => {
  let captured
  const quota = await executeQuotaQuery(context(), 'gateway', {
    url: 'http://127.0.0.1:9000/quota', method: 'POST', auth: 'provider', body: { include: 'balance' },
    response: { rows: 'data.items', metrics: [
      { label: '余额', kind: 'amount', remaining: 'balance', currency: 'CNY' },
      { label: '周剩余', kind: 'window', total: 'total', used: 'used', resetAt: 'reset' },
    ] },
  }, async (url, init) => { captured = { url, ...init }; return json({ secret: 'never-return', data: { items: [{ balance: '0.00', total: 100, used: 25, reset: 1_800_000_000 }, { balance: null, total: null, used: null }] } }) })
  assert.equal(captured.headers.authorization, 'Bearer gateway-secret')
  assert.equal(captured.redirect, 'error')
  assert.ok(captured.signal instanceof AbortSignal)
  assert.equal(captured.body, '{"include":"balance"}')
  assert.equal(quota.metrics.length, 2)
  assert.equal(quota.metrics[0].remaining, 0)
  assert.equal(quota.metrics[1].remainingPercent, 75)
  assert.equal(quota.metrics[1].remaining, 75)
  assert.doesNotMatch(JSON.stringify(quota), /secret|never-return/)
})

test('successful tests must match the confirmed template; confirmation displays and overrides built-in quota', async () => temporary(async (path) => {
  let time = Date.now(), exclusions
  const controller = createQuotaControls(configuredContext(), { path, now: () => time,
    sources: { providers: async (excluded) => { exclusions = excluded; return { ok: true, quotas: [] } } },
    request: async () => json({ balance_infos: [{ total_balance: '8.88', currency: 'CNY' }] }),
  })
  const template = quotaTemplate('deepseek')
  const result = await controller.test('deepseek', template)
  assert.equal((await controller.read('providers')).quotas[0].status, 'unqueried') // test does not activate
  await assert.rejects(controller.update({ action: 'save-query', provider: 'deepseek', template: { ...template, url: template.url + '?changed=1' }, testId: result.testId }), /重新测试/)
  await controller.update({ action: 'save-query', provider: 'deepseek', template, testId: result.testId })
  assert.equal((await controller.read('providers')).quotas[0].metrics[0].remaining, 8.88)
  await controller.read('providers', true)
  assert.deepEqual(exclusions, ['deepseek'])
  const restarted = createQuotaControls(configuredContext(), { path, sources: { providers: async () => ({ ok: true, quotas: [] }) } })
  assert.equal((await restarted.get()).settings.customQueries.length, 1)
  const saved = await readFile(path, 'utf8')
  assert.doesNotMatch(saved, /provider-secret|gateway-secret/)
  const stale = await controller.test('deepseek', template)
  time += 900_001
  await assert.rejects(controller.update({ action: 'save-query', provider: 'deepseek', template, testId: stale.testId }), /重新测试/)
  await controller.update({ action: 'remove-query', provider: 'deepseek' })
  assert.deepEqual((await controller.get()).settings.customQueries, [])
  assert.equal((await controller.read('providers')).quotas[0].status, 'unqueried')
}))

test('custom queries reject credential exfiltration, redirects, raw secrets, invalid metrics and oversized bodies', async () => {
  const base = quotaTemplate('deepseek')
  let requests = 0
  const request = async () => { requests++; return json({}) }
  await assert.rejects(executeQuotaQuery(configuredContext(), 'deepseek', { ...base, url: 'https://unrelated.example/quota' }, request), /同源/)
  await assert.rejects(executeQuotaQuery(context(), 'missing', base, request), /不存在/)
  assert.equal(requests, 0)
  for (const change of [{ url: 'http://unrelated.example' }, { url: 'https://user:secret@api.deepseek.com' }, { headers: { Authorization: 'raw-secret' } }, { url: base.url + '?api_key=raw-secret' }, { method: 'DELETE' }]) {
    assert.throws(() => validateQuotaTemplate({ ...base, ...change }, 'deepseek'))
  }
  await assert.rejects(executeQuotaQuery(configuredContext(), 'deepseek', base, async () => { throw new Error('secret redirect target') }), /不跟随重定向/)
  await assert.rejects(executeQuotaQuery(configuredContext(), 'deepseek', base, async () => json({ secret: 'raw-secret' }, 401)), /HTTP 401/)
  await assert.rejects(executeQuotaQuery(configuredContext(), 'deepseek', base, async () => json({ balance_infos: [{ total_balance: null }] })), /未找到有效配额/)
  await assert.rejects(executeQuotaQuery(configuredContext(), 'deepseek', base, async () => new Response('x'.repeat(1_048_577))), /1 MB/)
})

test('the provider list offers only providers configured on the models page', async () => {
  // Declarable but unconfigured providers must not appear; a configured one must.
  const controls = createQuotaControls(context(), { path: 'unused.json', sources: {} })
  const offered = (await controls.providers()).providers.map((row) => row.provider)
  assert.ok(offered.includes('gateway'), 'a configured provider must be offered')
  assert.ok(!offered.includes('deepseek'), 'a merely declarable provider must not be offered')

  const entries = (await createQuotaControls(configuredContext(), { path: 'unused.json', sources: {} }).providers()).providers
  const all = entries.map((row) => row.provider)
  assert.ok(all.includes('deepseek'), 'the same provider is offered once configured')
  assert.deepEqual(all.sort(), ['deepseek', 'gateway'])
  assert.equal(entries.find((row) => row.provider === 'deepseek').hasBuiltinQuery, true)
  assert.equal(entries.find((row) => row.provider === 'gateway').hasBuiltinQuery, false, 'generic /balance examples must remain unmarked')

  const proxyContext = configuredContext()
  const proxySettings = proxyContext.get('settings').describe()
  proxySettings[0].value.providers.deepseek.baseURL = 'https://gateway.example/v1'
  const proxied = createQuotaControls({ get: (name) => name === 'settings' ? { describe: () => proxySettings } : proxyContext.get(name) }, { path: 'unused.json', sources: {} })
  const proxyEntry = (await proxied.providers()).providers.find((row) => row.provider === 'deepseek')
  assert.equal(proxyEntry.hasBuiltinQuery, false, 'an official provider id on a proxy does not have the official query')
  assert.equal(proxyEntry.template.url, 'https://gateway.example/v1/balance')
})

test('an unusable settings service falls back to the declared list instead of emptying the picker', async () => {
  const noSettings = () => ({ get: (name) => (name === 'llm'
    ? { listConfigurableProviders: () => [{ provider: 'deepseek', displayName: 'DeepSeek', settingsNs: 'models' }] }
    : undefined) })
  const unavailable = createQuotaControls(noSettings(), { path: 'unused.json', sources: { providers: async () => { assert.fail('must not probe on a cached read') } } })
  const offered = (await unavailable.providers()).providers
  assert.deepEqual(offered.map((row) => row.provider), ['deepseek'])
  assert.deepEqual((await unavailable.read('providers')).quotas, [], 'an unavailable settings service cannot establish configured balances')

  // A descriptor whose providers map is missing must not filter everything away.
  const emptyProviders = () => ({ get: (name) => (name === 'llm'
    ? { listConfigurableProviders: () => [{ provider: 'deepseek', displayName: 'DeepSeek', settingsNs: 'models' }] }
    : { describe: () => [{ ns: 'models', value: {} }] }) })
  const stillOffered = (await createQuotaControls(emptyProviders(), { path: 'unused.json', sources: {} }).providers()).providers
  assert.deepEqual(stillOffered.map((row) => row.provider), ['deepseek'])
})

test('parallel manual reads share a request and removing a query prevents an old response from restoring it', async () => temporary(async (path) => {
  let release, calls = 0
  const controller = createQuotaControls(context(), { path, sources: { providers: async () => { calls++; return new Promise((resolve) => { release = () => resolve({ ok: true, quotas: [{ provider: 'deepseek' }] }) }) } } })
  const one = controller.read('providers', true), two = controller.read('providers', true)
  await waitFor(() => !!release)
  assert.equal(calls, 1)
  await controller.update({ action: 'remove-query', provider: 'deepseek' })
  release()
  await Promise.all([one, two])
  assert.deepEqual((await controller.read('providers')).quotas, [])
}))

test('WorkBuddy proxy stores only safe display data and reads the active host port', async () => {
  let url
  const body = await readWorkBuddyQuota({ get: (name) => name === 'webServer' ? { port: 19387 } : name === 'settings' ? { describe: () => [{ ns: 'workbuddy' }] } : undefined }, async (target) => {
    url = target
    return json({ status: 'signed-in', token: 'should-not-store', uid: 'private-id', credits: { total: 9, accounts: [{ packageName: '套餐', remain: 9, size: 10, secret: 'hidden' }] }, models: [{ id: 'offer', free: true, credits: 0 }] })
  })
  assert.equal(url, 'http://127.0.0.1:19387/plugins/dsh-workbuddy-connect/status')
  assert.equal(body.credits.total, 9)
  assert.doesNotMatch(JSON.stringify(body), /private-id|should-not-store|hidden/)
})

test('WorkBuddy AI reads the Connect international endpoint and keeps credit responses separate', async () => temporary(async (path) => {
  let aiEnabled = true
  const requests = []
  const ctx = { get(name) {
    if (name === 'webServer') return { port: 23456 }
    if (name === 'settings') return { describe: () => [{ ns: 'workbuddy' }, ...(aiEnabled ? [{ ns: 'workbuddy-ai' }] : [])] }
    if (name === 'llm') return { listConfigurableProviders: () => [] }
  } }
  const request = async (url) => {
    requests.push(url)
    const ai = url.endsWith('/ai/status')
    return json({ status: 'signed-in', token: 'private-token', domain: 'private-domain', credits: {
      total: ai ? 130 : 3403,
      accounts: [{ packageName: ai ? 'AI 套餐' : '国内套餐', remain: ai ? 130 : 3403, size: ai ? 200 : 4000, secret: 'hidden' }],
    } })
  }
  const options = { path, sources: {
    workbuddy: workBuddyQuotaSource(ctx, request),
    'workbuddy-ai': workBuddyQuotaSource(ctx, request, 'workbuddy-ai'),
  } }
  const controls = createQuotaControls(ctx, options)
  assert.deepEqual((await controls.providers()).providers.map((row) => [row.provider, row.name, row.source]), [
    ['workbuddy', 'WorkBuddy', 'workbuddy'], ['workbuddy-ai', 'WorkBuddy AI', 'workbuddy-ai'],
  ])
  assert.equal((await controls.read('workbuddy-ai')).status, 'unqueried')
  assert.equal(requests.length, 0, 'adding the international card does not enable paid automatic reads')
  assert.equal((await controls.read('workbuddy', true)).credits.total, 3403)
  assert.equal((await controls.read('workbuddy-ai', true)).credits.total, 130)
  assert.deepEqual(requests, [
    'http://127.0.0.1:23456/plugins/dsh-workbuddy-connect/status',
    'http://127.0.0.1:23456/plugins/dsh-workbuddy-connect/ai/status',
  ])
  const restarted = createQuotaControls(ctx, options)
  assert.equal((await restarted.read('workbuddy')).credits.total, 3403)
  assert.equal((await restarted.read('workbuddy-ai')).credits.total, 130)
  assert.equal(requests.length, 2, 'both sources restore their own persisted cache')
  assert.doesNotMatch(await readFile(path, 'utf8'), /private-token|private-domain|hidden/)
  aiEnabled = false
  assert.equal((await restarted.read('workbuddy-ai', true)).status, 'not-configured')
  assert.equal((await restarted.read('workbuddy')).credits.total, 3403)
  assert.equal(requests.length, 2, 'disabling the AI source must not probe another account')
}))

test('WorkBuddy AI recognizes its provider registry and preserves zero credit and query failures', async () => {
  const ctx = { get: (name) => ({ webServer: { port: 23456 }, llm: { listConfigurableProviders: () => [{ provider: 'workbuddy-ai' }] } })[name] }
  const zero = await readWorkBuddyQuota(ctx, async () => json({ status: 'signed-in', credits: { total: 0, accounts: [] } }), 'workbuddy-ai')
  assert.equal(zero.status, 'signed-in')
  assert.equal(zero.credits.total, 0)
  const signedOut = await readWorkBuddyQuota(ctx, async () => json({ status: 'signed-out' }), 'workbuddy-ai')
  assert.equal(signedOut.status, 'signed-out')
  const failed = await readWorkBuddyQuota(ctx, async () => json({ status: 'error', message: 'private detail' }), 'workbuddy-ai')
  assert.equal(failed.status, 'unavailable')
  assert.equal(failed.credits, undefined)
  assert.doesNotMatch(JSON.stringify(failed), /private detail/)
})

test('WorkBuddy joins the query registry, shares persistent caching and skips reads when absent', async () => temporary(async (path) => {
  let enabled = false, calls = 0, status = 'signed-out', offline = false
  const ctx = { get(name) {
    if (name === 'webServer') return { port: 23456 }
    if (name === 'settings') return { describe: () => enabled ? [{ ns: 'workbuddy' }] : [] }
    if (name === 'llm') return { listConfigurableProviders: () => [] }
  } }
  const options = { path, sources: { workbuddy: workBuddyQuotaSource(ctx, async (url) => {
    calls++
    assert.equal(url, 'http://127.0.0.1:23456/plugins/dsh-workbuddy-connect/status')
    if (offline) throw new Error('offline')
    return json({ status, token: 'private-token', credits: { total: 8 }, models: [] })
  }) } }
  const controls = createQuotaControls(ctx, options)
  assert.deepEqual((await controls.providers()).providers, [])
  assert.equal((await controls.read('workbuddy', true)).status, 'not-configured')
  await controls.update({ autoQuota: true, acknowledgeCost: true })
  await controls.tick()
  assert.equal(calls, 0, 'missing optional plugins must not be probed')
  enabled = true
  const offered = (await controls.providers()).providers[0]
  assert.equal(offered.provider, 'workbuddy')
  assert.equal(offered.queryType, 'adapter')
  assert.equal(offered.hasBuiltinQuery, true)
  assert.equal(offered.template, null)
  assert.equal((await controls.read('workbuddy')).status, 'unqueried')
  assert.equal(calls, 0, 'opening either page only reads configuration and cache')
  await assert.rejects(controls.test('workbuddy', quotaTemplate('deepseek')), /内置适配器/)
  assert.equal((await controls.read('workbuddy', true)).status, 'signed-out')
  status = 'signed-in'
  const queried = await controls.read('workbuddy', true)
  assert.equal(queried.credits.total, 8)
  const prior = calls
  const restarted = createQuotaControls(ctx, options)
  assert.equal((await restarted.read('workbuddy')).credits.total, 8)
  assert.equal(calls, prior)
  assert.doesNotMatch(await readFile(path, 'utf8'), /private-token/)
  enabled = false
  assert.equal((await restarted.read('workbuddy')).available, false, 'an unloaded plugin cannot leave a stale credit card visible')
  assert.equal((await restarted.read('workbuddy', true)).status, 'not-configured')
  assert.equal(calls, prior)
  enabled = true
  offline = true
  assert.equal((await restarted.read('workbuddy', true)).status, 'unavailable')
}))

test('configured OpenCode Go uses common unqueried rows and discards removed legacy sources', async () => temporary(async (path) => {
  const profiles = { 'opencode-go': { apiKeyEnv: 'GO_DSH_KEY' }, opencode: {} }
  let calls = 0
  const ctx = { get(name) {
    if (name === 'llm') return { listConfigurableProviders: () => ['opencode-go', 'opencode'].map((provider) => ({ provider, settingsNs: 'models' })) }
    if (name === 'settings') return { describe: () => [{ ns: 'models', value: { providers: profiles } }] }
  } }
  const options = { path, sources: { providers: async () => { calls++; return { ok: true, quotas: [] } } } }
  await writeFile(path, JSON.stringify({ settings: { autoQuota: false }, snapshots: {
    gemini: { ok: true, remainingFraction: 1 }, opencode: { ok: true, official: false, subscription: 'zen' },
  } }))
  const controls = createQuotaControls(ctx, options)
  const initial = (await controls.read('providers')).quotas
  assert.deepEqual(initial.map((row) => [row.provider, row.status]), [['opencode-go', 'unqueried']])
  assert.equal(initial[0].kind, 'subscription', 'a subscription placeholder must stay below balance-only providers')
  const offered = (await controls.providers()).providers
  assert.equal(offered.find((row) => row.provider === 'opencode-go').hasBuiltinQuery, true)
  assert.equal(offered.find((row) => row.provider === 'opencode').hasBuiltinQuery, false)
  assert.equal(calls, 0)
  await assert.rejects(controls.read('gemini'), /未知配额来源/)
  await assert.rejects(controls.read('opencode'), /未知配额来源/)
  assert.equal((await controls.read('providers', true)).quotas[0].status, 'unavailable')
  await controls.update({ intervalMinutes: 300 })
  const disk = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(disk.snapshots.gemini, undefined)
  assert.equal(disk.snapshots.opencode, undefined)
  delete profiles['opencode-go']
  assert.deepEqual((await controls.read('providers')).quotas, [])
}))

test('custom OpenCode queries also require that provider own DSH credentials', async () => {
  let fallbacks = 0, queries = 0
  const ctx = { get(name) {
    if (name === 'llm') return { listConfigurableProviders: () => [{ provider: 'opencode', settingsNs: 'models' }] }
    if (name === 'settings') return { describe: () => [{ ns: 'models', value: { providers: { opencode: { baseURL: 'https://relay.example/v1' } } } }] }
    if (name === 'credentials') return { readRecord: async () => null, resolve: async () => { fallbacks++; return { value: 'unrelated-key' } } }
  } }
  const template = { url: 'https://relay.example/quota', auth: 'provider', response: { metrics: [{ label: '余额', kind: 'amount', remaining: 'balance', currency: 'USD' }] } }
  await assert.rejects(executeQuotaQuery(ctx, 'opencode', template, async () => { queries++; return json({ balance: 123 }) }), /未找到可用的供应商凭据/)
  assert.equal(fallbacks, 0)
  assert.equal(queries, 0)
})

test('desktop control routes persist settings and reject cross-origin writes and non-JSON requests', async () => temporary(async (path) => {
  const home = join(path, '..')
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const routes = new Map(), cleanups = []
  let intervalCount = 0
  const ctx = {
    get(name) { return name === 'profileContext' ? { name: 'desktop' } : name === 'webServer' ? { register: (route) => { routes.set(route.path, route.handler); return () => routes.delete(route.path) } } : name === 'sessionQuery' ? { listSessions: async () => [] } : configuredContext().get(name) },
    effect(fn) { const dispose = fn(); if (dispose) cleanups.push(dispose) },
    interval() { intervalCount++; return () => {} },
  }
  const server = createServer((req, res) => { const route = routes.get(new URL(req.url, 'http://local').pathname); if (route) void route(req, res); else { res.writeHead(404); res.end() } })
  try {
    apply(ctx)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const root = 'http://127.0.0.1:' + server.address().port + '/api/dsh-usage-stats/'
    assert.equal((await (await fetch(root + 'controls')).json()).settings.autoQuota, false)
    assert.equal((await fetch(root + 'gemini-pro')).status, 404)
    assert.equal((await fetch(root + 'opencode')).status, 404)
    assert.equal((await fetch(root + 'opencode-go')).status, 404)
    assert.equal((await (await fetch(root + 'workbuddy?fresh=1')).json()).status, 'not-configured')
    assert.equal((await (await fetch(root + 'workbuddy-ai?fresh=1')).json()).status, 'not-configured')
    assert.ok(intervalCount >= 2)
    const providers = await (await fetch(root + 'quota-providers')).json()
    assert.equal(providers.providers.length, 2)
    assert.doesNotMatch(JSON.stringify(providers), /provider-secret|gateway-secret/)
    const options = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ showModelDetails: false }) }
    assert.equal((await (await fetch(root + 'controls', options)).json()).settings.showModelDetails, false)
    assert.equal((await fetch(root + 'controls', { ...options, headers: { ...options.headers, origin: 'https://outside.example' } })).status, 403)
    assert.equal((await fetch(root + 'controls', { ...options, headers: { 'content-type': 'text/plain' } })).status, 400)
    assert.equal((await fetch(root + 'quota-test', { ...options, body: '{broken' })).status, 400)
    assert.equal((await (await fetch(root + 'provider-quotas')).json()).quotas[0].status, 'unqueried')
  } finally {
    cleanups.reverse().forEach((dispose) => dispose())
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
}))
