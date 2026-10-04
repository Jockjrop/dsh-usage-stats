import test from 'node:test'
import assert from 'node:assert/strict'
import { captureModelEvidence, normalizeEvidence, analyzeModelEvidence, createModelMatchRunner, summarizeModelTest, modelTestScore, PROBE_PLAN } from '../src/model-match.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { publicFingerprints, fingerprintPrompt, parseFingerprintAnswers, normalizeFingerprint, fingerprintMatch, scoreFingerprint,
  binomialTail, clopperPearsonUpper } from '../src/model-fingerprints.js'
import { capabilityTasks, scoreCapabilities } from '../src/model-capabilities.js'
import { createModelTestHistory } from '../src/model-test-history.js'
import { defaultState, modelTestContribution, foldResponse } from '../src/index.js'

const selection = { provider: 'gateway', model: 'requested', reasoningEffort: 'high' }
const settle = () => new Promise(resolve => setImmediate(resolve))
const response = (responseModel = 'requested', model = 'requested') => ({ type: 'assistant/message', time: 100,
  data: { usage: { inputTokens: 10, outputTokens: 2 }, message: { content: 'PRIVATE_CONVERSATION', source: {
    provider: 'gateway', model, replayState: { response: { kind: 'pi-ai', model, responseModel, responseId: 'PRIVATE_ID', providerThinkingLevel: 'high', stopReason: 'stop' }, blocks: ['PRIVATE_REASONING'] },
  } } } })

test('reference similarity scores answer agreement and never scores unfinished, sparse or capability-only runs', () => {
  const job = { mode: 'audit', status: 'complete', identity: { verdict: 'no-significant-difference', count: 128, valid: 120, mismatches: 15, pValue: 0.25 } }
  assert.deepEqual(modelTestScore(job), { value: 87.5, matched: 105, valid: 120, count: 128, method: 'answer-agreement' })
  assert.equal(modelTestScore({ ...job, identity: { ...job.identity, mismatches: 0 } }).value, 100)
  assert.equal(modelTestScore({ ...job, identity: { ...job.identity, verdict: 'significant-difference', mismatches: 120 } }).value, 0)
  for (const status of ['running', 'cancelled', 'interrupted', 'budget-exhausted', 'failed']) assert.equal(modelTestScore({ ...job, status }), null)
  for (const mode of ['calibrate', 'capability']) assert.equal(modelTestScore({ ...job, mode }), null)
  for (const patch of [{ valid: 63 }, { valid: 102 }, { valid: 129 }, { mismatches: -1 }, { mismatches: 121 }, { count: NaN }, { valid: 120.5 }, { verdict: 'insufficient-evidence' }]) {
    assert.equal(modelTestScore({ ...job, identity: { ...job.identity, ...patch } }), null)
  }
})

test('captures responseModel rather than the adapter-normalized requested model, and strips private replay data', () => {
  const evidence = captureModelEvidence([
    { type: 'request/header', data: { header: { config: { ...selection, token: 'PRIVATE_CREDENTIAL' }, tools: ['PRIVATE_TOOL'] } } },
    response('different'),
  ])
  assert.deepEqual(evidence.latestRequest, selection)
  assert.equal(evidence.records[0].responseModel, 'different')
  assert.equal(evidence.records[0].reasoningEffort, 'high')
  assert.equal(evidence.records[0].requestHeader, true)
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE/)
  const normalized = normalizeEvidence({ ...evidence, private: 'PRIVATE', records: [{ ...evidence.records[0], raw: 'PRIVATE' }] })
  assert.doesNotMatch(JSON.stringify(normalized), /PRIVATE/)
})

test('absent raw response metadata and a single different declaration yield insufficient evidence', () => {
  assert.equal(analyzeModelEvidence(captureModelEvidence([response(undefined)]), selection).verdict, 'insufficient-evidence')
  const missing = response(); delete missing.data.message.source.replayState.response.responseModel
  assert.equal(analyzeModelEvidence(captureModelEvidence([missing])).counts.missing, 1)
  assert.equal(analyzeModelEvidence(captureModelEvidence([response('other')])).verdict, 'insufficient-evidence')
  const repeated = analyzeModelEvidence(captureModelEvidence([response('other'), response('other'), response('other')]))
  assert.equal(repeated.verdict, 'insufficient-evidence')
  assert.equal(repeated.declarationStatus, 'name-difference')
  assert.equal(repeated.strength, 'weak')
})

test('filters historical model and reasoning selections without treating chart aliases as model identity', () => {
  const evidence = captureModelEvidence([
    { type: 'request/header', data: { header: { config: selection } } }, response('requested'),
    { type: 'request/header', data: { header: { config: { ...selection, model: 'x-preview', reasoningEffort: 'low' } } } }, response('glm-5.3', 'x-preview'),
  ])
  const analysis = analyzeModelEvidence(evidence, selection)
  assert.equal(analysis.counts.samples, 1)
  assert.equal(analysis.verdict, 'insufficient-evidence')
  assert.equal(analysis.missingReasoningUsage, 1)
  assert.equal(analyzeModelEvidence(evidence, { ...selection, model: 'x-preview', reasoningEffort: 'low' }).counts.different, 1)
  assert.equal(analyzeModelEvidence(evidence, { ...selection, reasoningEffort: 'medium' }).counts.samples, 0)
  const version = analyzeModelEvidence(captureModelEvidence([response('vendor/requested-2026-10-01')]))
  assert.equal(version.counts.compatible, 1)
})

test('evidence is bounded to the last thirty messages', () => {
  const evidence = captureModelEvidence(Array.from({ length: 80 }, (_, i) => ({ ...response(), time: i + 1 })))
  assert.equal(evidence.records.length, 30)
  assert.equal(evidence.records[0].time, 51)
  assert.equal(analyzeModelEvidence(evidence).records.length, 10)
})

test('a fork inherits its request defaults, but inherited responses are not its own match evidence', () => {
  const events = [{ type: 'request/header', data: { header: { config: selection } } }, response('other'), response('other'), response('other'), response()]
  const evidence = captureModelEvidence(events, 4)
  assert.deepEqual(evidence.latestRequest, selection)
  assert.equal(evidence.records.length, 1)
  assert.equal(analyzeModelEvidence(evidence, selection).verdict, 'insufficient-evidence')
})

const baseline = () => ({ model: 'requested', provider: 'trusted', date: '2026-10-04', config: { reasoningEffort: 'off' },
  probes: Array.from({ length: 128 }, (_, i) => ({ domain: 'math', name: 'fact_' + i, value: i + 100, calibration: 1 })) })
const info = { reasoning: { efforts: [{ id: 'off' }, { id: 'high' }], defaultEffort: 'high' } }
const host = stream => ({ get: () => ({ resolveModelInfo: async () => info, stream }) })
const promptOf = options => options.messages[1].content[0].text
const defaultStream = async function* (options) {
  const prompt = promptOf(options)
  yield { type: 'text-delta', text: prompt.split('\n').flatMap(line => { const m = line.match(/^\((\d+)\).*fact_(\d+)/); return m ? [`(${m[1]}) ${Number(m[2]) + 100}`] : [] }).join('\n') }
  yield { type: 'usage', usage: { inputTokens: 40, outputTokens: 30 } }
  yield { type: 'finish', reason: { kind: 'stop' }, replayState: { response: { responseModel: 'PRIVATE_NAME' }, blocks: 'PRIVATE_REASONING' } }
}
async function prepared(runner, patch = {}) {
  const ref = await runner.importReference(baseline())
  return runner.plan({ mode: 'audit', sessionId: 'one', selection, referenceId: ref.id, ...patch })
}
async function done(runner, id) { for (let i = 0; i < 500; i++) { if (runner.status(id).status !== 'running') return runner.status(id); await settle() } assert.fail('runner did not finish') }

test('public references retain their source and independent per-probe calibration', () => {
  const runner = createModelMatchRunner(host(defaultStream)), catalog = runner.catalog()
  assert.equal(catalog.references.length, 28)
  const flash = catalog.references.find(r => r.model === 'deepseek/deepseek-v4.1-flash')
  assert.equal(flash.count, 363); assert.equal(flash.selfMismatches, 29); assert.equal(flash.provider, 'Novita')
  assert.match(flash.source, /68aefbbab879469152aaac9fd988a86c30ee4739/)
  runner.dispose()
})

test('statistical tails and CP99 calibration agree with analytical binomial cases', () => {
  assert.ok(Math.abs(binomialTail(3, 5, 0.5) - 0.5) < 1e-12)
  assert.ok(Math.abs(binomialTail(5, 5, 0.1) - 0.00001) < 1e-12)
  assert.ok(Math.abs(clopperPearsonUpper(0, 100) - (1 - 0.01 ** (1 / 100))) < 1e-12)
  assert.equal(clopperPearsonUpper(100, 100), 1)
  assert.equal(binomialTail(1, 100, 0), 0)
  assert.equal(binomialTail(100, 100, 1), 1)
  assert.equal(binomialTail(0, 100, 0), 1)
  assert.throws(() => binomialTail(3, 2, 0.5))
  const ref = normalizeFingerprint(baseline())
  assert.equal(scoreFingerprint(ref, Array(128).fill(1)).verdict, 'no-significant-difference')
  assert.equal(scoreFingerprint(ref, Array(128).fill(0)).verdict, 'significant-difference')
  assert.equal(scoreFingerprint(ref, Array(63).fill(1)).verdict, 'insufficient-evidence')
  assert.equal(scoreFingerprint(ref, Array(99).fill(1)).verdict, 'insufficient-evidence')
  assert.equal(scoreFingerprint(ref, Array(128).fill(1), false).verdict, 'insufficient-evidence')
})

test('parser preserves positions and excludes prose, duplicates, range violations and missing values', () => {
  const probes = [{ domain: 'math' }, { domain: 'programming' }, { domain: 'biology' }, { domain: 'physics' }]
  assert.deepEqual(parseFingerprintAnswers('(1) −32\n(3) 16\n(4) 1.5e3', probes), [-32, null, 16, 1500])
  assert.deepEqual(parseFingerprintAnswers('(1) 20\n(1) 20\n(2) 9000\n(3) 4 extra words\n(4) NaN', probes), [null, null, null, null])
  assert.equal(fingerprintMatch(-2.5, -3, 'math'), true)
  assert.equal(fingerprintMatch(100, 104, 'physics'), true)
  assert.equal(fingerprintMatch(100, 106, 'physics'), false)
})

test('import rejects incomplete, duplicate and incompatible references, and strips endpoints and private data', () => {
  assert.throws(() => normalizeFingerprint({ ...baseline(), probes: [] }), /64/)
  assert.throws(() => normalizeFingerprint({ ...baseline(), probes: [...baseline().probes, baseline().probes[0]] }), /重复/)
  assert.throws(() => normalizeFingerprint({ ...baseline(), config: { temperature: 1 } }), /温度/)
  assert.throws(() => normalizeFingerprint({ ...baseline(), probes: baseline().probes.map(p => ({ ...p, calibration: null })) }), /校准/)
  assert.doesNotMatch(JSON.stringify(normalizeFingerprint({ ...baseline(), api_key: 'PRIVATE', api_base: 'https://secret.example', source: 'PRIVATE', raw_log: 'PRIVATE' })), /PRIVATE|secret.example/)
})

test('catalog and budget planning are dormant; a start requires acknowledgement and a one-use quote', async () => {
  let calls = 0
  const runner = createModelMatchRunner(host(async function* () { calls++ }))
  runner.catalog(); assert.equal(runner.status(), null)
  assert.throws(() => runner.start({ sessionId: 'one', selection }), /Token/)
  assert.throws(() => runner.start({ sessionId: 'one', ackCost: true }), /预算/)
  const quote = await prepared(runner)
  assert.equal(quote.plan.requests, 13); assert.equal(quote.plan.maxOutputTokens, 128 * 80)
  assert.equal(quote.testSelection.reasoningEffort, 'off')
  assert.equal(calls, 0)
  assert.throws(() => runner.start({ sessionId: 'two', planId: quote.id, ackCost: true }), /会话/)
  runner.dispose()
})

test('audit uses frozen parameters, ignores injected conversation data and compares behavior rather than declared names', async () => {
  const calls = []
  const runner = createModelMatchRunner(host(async function* (options) { calls.push(options); yield* defaultStream(options) }))
  const quote = await prepared(runner)
  const start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true, selection: { provider: 'evil', model: 'other' }, messages: ['PRIVATE_CONVERSATION'] })
  assert.throws(() => runner.start({ sessionId: 'one', planId: quote.id, ackCost: true }), /预算/)
  const job = await done(runner, start.id)
  assert.equal(job.status, 'complete'); assert.equal(job.identity.verdict, 'no-significant-difference')
  assert.equal(job.identity.valid, 128); assert.equal(calls.length, 13)
  assert.equal(job.usage.inputTokens, 13 * 40); assert.equal(job.usageIncomplete, false)
  for (const call of calls) {
    assert.equal(call.provider, 'gateway'); assert.equal(call.model, 'requested'); assert.equal(call.reasoningEffort, 'off'); assert.equal(call.temperature, 0)
    assert.ok(call.maxTokens <= PROBE_PLAN.maxTokens); assert.equal(call.messages[0].role, 'system'); assert.equal(call.sessionId, undefined)
  }
  assert.doesNotMatch(JSON.stringify(job), /PRIVATE|"messages"|"text"/)
  runner.dispose()
})

test('same declared name cannot hide a statistically different answer fingerprint', async () => {
  const runner = createModelMatchRunner(host(async function* (options) {
    yield { type: 'text-delta', text: promptOf(options).split('\n').flatMap(line => { const m = line.match(/^\((\d+)\).*fact_/); return m ? [`(${m[1]}) 9999`] : [] }).join('\n') }
    yield { type: 'finish', reason: { kind: 'stop' }, replayState: { response: { responseModel: 'requested' } } }
  }))
  const quote = await prepared(runner), start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true })
  assert.equal((await done(runner, start.id)).identity.verdict, 'significant-difference')
  runner.dispose()
})

test('missing answers, truncation and reported reasoning despite off are inconclusive', async () => {
  for (const fixture of ['truncated', 'missing']) {
    let calls = 0
    const runner = createModelMatchRunner(host(async function* (options) {
      calls++
      yield { type: 'text-delta', text: '(1) 100' }
      yield { type: 'finish', reason: { kind: fixture === 'truncated' ? 'max-tokens' : 'stop' } }
    }))
    const quote = await prepared(runner), start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true })
    assert.equal((await done(runner, start.id)).identity.verdict, 'insufficient-evidence'); assert.equal(calls, 13)
    runner.dispose()
  }
  const runner = createModelMatchRunner(host(async function* () { yield { type: 'text-delta', text: '(1) 100' }; yield { type: 'usage', usage: { reasoningTokens: 12 } }; yield { type: 'finish', reason: { kind: 'stop' } } }))
  const quote = await prepared(runner), start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true })
  const job = await done(runner, start.id)
  assert.equal(job.status, 'failed'); assert.equal(job.progress, 1); assert.equal(job.identity.verdict, 'insufficient-evidence')
  runner.dispose()
})

test('budget exhaustion and cancellation stop subsequent requests without granting a verdict', async () => {
  let calls = 0, signal
  const runner = createModelMatchRunner(host(async function* (options) {
    calls++; yield { type: 'usage', usage: { inputTokens: 1024 } }; yield { type: 'finish', reason: { kind: 'stop' } }
  }))
  const quote = await prepared(runner, { budgetTokens: 1024 }), start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true })
  const job = await done(runner, start.id)
  assert.equal(calls, 1); assert.equal(job.status, 'budget-exhausted'); assert.equal(job.identity.verdict, 'insufficient-evidence')
  runner.dispose()
  const cancelled = createModelMatchRunner(host(options => {
    signal = options.signal
    return { [Symbol.asyncIterator]() { return { next: () => new Promise(() => {}), return: () => Promise.resolve({ done: true }) } } }
  }))
  const q = await prepared(cancelled), s = cancelled.start({ sessionId: 'one', planId: q.id, ackCost: true })
  await settle(); cancelled.cancel(s.id)
  const result = await done(cancelled, s.id)
  assert.equal(signal.aborted, true); assert.equal(result.status, 'cancelled'); assert.equal(result.progress, 1); assert.equal(result.identity.verdict, 'insufficient-evidence')
  cancelled.dispose()
})

test('failed adapters and timeouts are bounded and never expose credential details', async () => {
  for (const timeout of [false, true]) {
    const runner = createModelMatchRunner(host(timeout ? () => ({ [Symbol.asyncIterator]() { return { next: () => new Promise(() => {}) } } }) : () => { throw new Error('PRIVATE_CREDENTIAL C:\\private\\token.json') }), { timeoutMs: 10 })
    const quote = await prepared(runner), start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true })
    if (timeout) await new Promise(resolve => setTimeout(resolve, 25))
    const job = await done(runner, start.id)
    assert.equal(job.status, 'failed'); assert.equal(job.progress, 1); assert.equal(job.identity.verdict, 'insufficient-evidence')
    assert.doesNotMatch(JSON.stringify(job), /PRIVATE|token.json/)
    runner.dispose()
  }
})

test('model and reasoning compatibility are checked before inference calls', async () => {
  let calls = 0
  const runner = createModelMatchRunner({ get: () => ({ resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high' }], defaultEffort: 'high' } }), stream() { calls++ } }) })
  const ref = await runner.importReference(baseline())
  await assert.rejects(() => runner.plan({ sessionId: 'one', selection: { ...selection, model: 'other' }, referenceId: ref.id }), /不同/)
  await assert.rejects(() => runner.plan({ sessionId: 'one', selection, referenceId: ref.id }), /关闭推理/)
  assert.equal(calls, 0); runner.dispose()
})

test('unreliable reference calibration is rejected before quoting or calling the target', async () => {
  let calls = 0, metadata = 0
  const runner = createModelMatchRunner({ get: () => ({ resolveModelInfo: async () => { metadata++; return info }, stream() { calls++ } }) })
  for (const calibration of [Array.from({ length: 128 }, (_, i) => i < 42 ? 1 : null), Array.from({ length: 128 }, (_, i) => i < 96 ? 1 : null), Array(128).fill(0)]) {
    const raw = baseline()
    raw.probes = raw.probes.map((p, i) => ({ ...p, calibration: calibration[i] }))
    const ref = await runner.importReference(raw)
    await assert.rejects(() => runner.plan({ sessionId: 'one', selection, referenceId: ref.id }), /参考自测/)
  }
  assert.equal(calls, 0); assert.equal(metadata, 0); runner.dispose()
})

test('private reference calibration persists stable answers and independent self-test counts without raw output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-fingerprint-')), path = join(directory, 'references.json')
  const referenceStream = async function* (options) {
    const text = promptOf(options).split('\n').flatMap(line => { const m = line.match(/^\((\d+)\)/); if (!m) return []
      const value = /year|年/.test(line) ? 2000 : /boiling/.test(line) ? 100 : /half-life/.test(line) ? 5 : 100
      return [`(${m[1]}) ${value}`]
    }).join('\n')
    yield { type: 'text-delta', text: text || '{"answer":0}' }; yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const runner = createModelMatchRunner(host(referenceStream), { path })
  try {
    const quote = await runner.plan({ mode: 'calibrate', sessionId: 'one', selection: { ...selection, reasoningEffort: 'off' }, claimedModel: 'requested', ackReference: true })
    assert.equal(quote.plan.requests, 68); assert.equal(quote.plan.capabilityTasks, 16)
    const start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true }), job = await done(runner, start.id)
    assert.equal(job.status, 'complete'); assert.ok(job.baselineId)
    const exported = runner.exportReference(job.baselineId)
    assert.equal(exported.probes.length, 128); assert.equal(exported.probes.filter(p => p.calibration === 1).length, 128)
    assert.equal(exported.capabilities.outcomes.length, 16)
    const restarted = createModelMatchRunner(host(defaultStream), { path })
    assert.ok(restarted.catalog().references.some(r => r.id === job.baselineId))
    assert.doesNotMatch(await readFile(path, 'utf8'), /"messages"|"api_key"|"raw_log"|"text"/)
    await restarted.removeReference(job.baselineId); assert.ok(!restarted.catalog().references.some(r => r.id === job.baselineId)); restarted.dispose()
  } finally {
    runner.dispose(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(basename(directory).startsWith('dsh-fingerprint-')); await rm(directory, { recursive: true, force: true })
  }
})

test('capability scores are separate from identity and use a paired decline test only with a baseline', () => {
  assert.equal(capabilityTasks(42).length, 16)
  assert.deepEqual(capabilityTasks(42).map(t => t.prompt), capabilityTasks(42).map(t => t.prompt))
  assert.notDeepEqual(capabilityTasks(42).map(t => t.prompt), capabilityTasks(43).map(t => t.prompt))
  assert.equal(scoreCapabilities(Array(16).fill(1)).verdict, 'current-sample')
  assert.equal(scoreCapabilities(Array(16).fill(0), Array(16).fill(1)).verdict, 'significant-decline')
  assert.equal(scoreCapabilities(Array(16).fill(1), Array(16).fill(1)).verdict, 'no-significant-decline')
  assert.equal(scoreCapabilities(Array(11).fill(0), Array(16).fill(1)).verdict, 'insufficient-evidence')
})

test('audit verdicts clearly separate matching, downgrade, baseline creation and incomplete causes', () => {
  const completed = { mode: 'audit', status: 'complete', results: [] }
  assert.equal(summarizeModelTest({ ...completed, identity: { verdict: 'no-significant-difference' }, capability: { verdict: 'current-sample' } }).verdict, 'no-anomaly')
  assert.equal(summarizeModelTest({ ...completed, identity: { verdict: 'significant-difference' } }).verdict, 'suspected-mismatch')
  assert.equal(summarizeModelTest({ ...completed, identity: { verdict: 'no-significant-difference' }, capability: { verdict: 'significant-decline' } }).verdict, 'suspected-decline')
  assert.equal(summarizeModelTest({ ...completed, mode: 'calibrate', baselineId: 'local/a' }).verdict, 'reference-created')
  assert.equal(summarizeModelTest({ ...completed, mode: 'capability', capability: { verdict: 'current-sample' } }).reason, 'no-capability-reference')
  for (const [patch, reason] of [[{ status: 'cancelled' }, 'cancelled'], [{ status: 'budget-exhausted' }, 'budget'], [{ status: 'interrupted' }, 'interrupted'], [{ results: [{ outcome: 'incomplete' }] }, 'truncated'], [{ results: [{ outcome: 'unparseable' }] }, 'format'], [{ results: [{ outcome: 'timeout' }] }, 'timeout'], [{ identity: { verdict: 'insufficient-evidence', reason: 'coverage' } }, 'coverage']]) {
    assert.deepEqual(Object.values(summarizeModelTest({ ...completed, ...patch })).slice(0, 2), ['inconclusive', reason])
  }
})

async function storedDone(runner, id) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) { if (runner.status(id).status !== 'running') return runner.status(id); await new Promise(resolve => setTimeout(resolve, 5)) }
  assert.fail('durable runner did not finish')
}
test('reported audit usage persists per call, folds into every chart, and never duplicates or creates sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-audit-history-')), path = join(directory, 'tests.json')
  const history = createModelTestHistory(path), runner = createModelMatchRunner(host(defaultStream), { onUpdate: job => history.record(job) })
  try {
    const quote = await prepared(runner), start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true }), job = await storedDone(runner, start.id)
    assert.equal(job.usageSaved, true); assert.equal(job.conclusion.verdict, 'no-anomaly')
    assert.equal(history.usage().length, 13); assert.ok(history.usage().every(r => r.selection.provider === 'gateway' && r.time > 0))
    await history.record(job); await history.record({ ...job, results: job.results.slice(0, 1) })
    const restored = createModelTestHistory(path), state = { ...defaultState(), tz: -480 }, now = Date.now()
    for (const tz of [-480, 330]) {
      state.tz = tz
      const contribution = modelTestContribution(restored, tz), stats = foldResponse(state, 1, null, tz, now, [contribution])
      assert.equal(stats.totals.billed, 910); assert.equal(stats.totals.calls, 13); assert.equal(stats.overview.totalBilled, 910)
      assert.equal(stats.overview.todayBilled, 910); assert.equal(stats.sessionsWithUsage, 0); assert.equal(Object.keys(state.sessions).length, 0)
      assert.equal(stats.byDay[0].bucket.billed, 910); assert.equal(stats.byModel[0].bucket.billed, 910)
      assert.equal(stats.byHour.reduce((n, h) => n + h.bucket.billed, 0), 910)
      assert.equal(stats.byHourModels.flatMap(h => h.models).reduce((n, m) => n + m.billed, 0), 910)
      assert.equal(foldResponse(state, 1, 'other/model', tz, now, [contribution]).totals.billed, 0)
    }
    assert.equal(restored.latest('one').conclusion.verdict, 'no-anomaly'); assert.equal(restored.latest('other'), null)
    assert.equal(restored.latest('one').score.value, 100)
    assert.doesNotMatch(await readFile(path, 'utf8'), /PRIVATE_|"text"|"messages"|"replayState"/)
  } finally { runner.dispose(); await rm(directory, { recursive: true, force: true }) }
})

test('cancelled usage remains counted and a host restart leaves an unfinished audit inconclusive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-audit-cancel-')), path = join(directory, 'tests.json'), history = createModelTestHistory(path)
  let entered
  const firstUsage = new Promise(resolve => { entered = resolve })
  const runner = createModelMatchRunner(host(async function* () { yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40, reasoningTokens: 5 } }; entered(); await new Promise(() => {}) }), { onUpdate: job => history.record(job) })
  try {
    const quote = await prepared(runner), start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true })
    await firstUsage; runner.cancel(start.id)
    const job = await storedDone(runner, start.id), restored = createModelTestHistory(path)
    assert.equal(job.status, 'cancelled'); assert.equal(restored.latest('one').conclusion.reason, 'cancelled')
    const state = defaultState(), contribution = modelTestContribution(restored, state.tz)
    assert.equal(foldResponse(state, 0, null, state.tz, Date.now(), [contribution]).totals.billed, 190)
    await history.record({ ...job, id: 'another', status: 'running', results: [] })
    assert.equal(createModelTestHistory(path).latest('one').conclusion.reason, 'interrupted')
  } finally { runner.dispose(); await rm(directory, { recursive: true, force: true }) }
})

test('usage follows the billed reference provider and older usage survives recent-result eviction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-audit-provenance-')), path = join(directory, 'tests.json'), history = createModelTestHistory(path)
  try {
    for (let i = 0; i < 12; i++) await history.record({ id: 'audit-' + i, sessionId: 'one', mode: 'calibrate', status: 'complete', selection,
      startedAt: Date.now(), finishedAt: Date.now(), usage: { inputTokens: 8 }, results: [{ time: Date.now(), selection: { provider: 'trusted', model: 'reference-model' }, stop: 'stop', usageReported: true, usage: { inputTokens: 8 }, ttftMs: 50, decodeMs: 40 }] })
    const restored = createModelTestHistory(path), state = defaultState(), data = foldResponse(state, 0, null, state.tz, Date.now(), [modelTestContribution(restored, state.tz)])
    assert.equal(data.totals.billed, 96); assert.equal(data.byModel[0].provider, 'trusted'); assert.equal(restored.get('audit-0'), null)
    assert.equal(restored.usage().length, 12)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a failed usage store prevents further paid calls and never reports a completed matching result', async () => {
  let calls = 0, updates = 0
  const runner = createModelMatchRunner(host(async function* (options) { calls++; yield* defaultStream(options) }), { onUpdate: async () => { updates++; throw new Error('PRIVATE_STORAGE_PATH') } })
  const quote = await prepared(runner), start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true }), job = await storedDone(runner, start.id)
  assert.equal(calls, 0); assert.equal(job.status, 'failed'); assert.equal(job.usageSaved, false); assert.equal(job.conclusion.verdict, 'inconclusive')
  assert.ok(updates > 0); assert.doesNotMatch(JSON.stringify(job), /PRIVATE_STORAGE_PATH/); runner.dispose()
})

test('generated optimization tasks agree with exhaustive independent solvers', () => {
  for (const seed of [1, 967]) for (const task of capabilityTasks(seed)) {
    if (task.domain === 'constraints') {
      const jobs = JSON.parse(task.prompt.split('Jobs [start,end,reward]: ')[1].split('\n')[0])
      let best = 0
      for (let mask = 0; mask < 2 ** jobs.length; mask++) {
        const selected = jobs.filter((_, i) => mask & (1 << i)).sort((a, b) => a[0] - b[0])
        if (selected.every((job, i) => !i || selected[i - 1][1] <= job[0])) best = Math.max(best, selected.reduce((sum, job) => sum + job[2], 0))
      }
      assert.equal(task.check(JSON.stringify({ answer: best })), true)
      assert.equal(task.check(JSON.stringify({ answer: best + 1 })), false)
    } else if (task.domain === 'reasoning') {
      const edges = JSON.parse(task.prompt.split('Edges [from,to,weight]: ')[1].split('\n')[0])
      const walk = node => node === 10 ? 0 : Math.min(...edges.filter(e => e[0] === node).map(e => e[2] + walk(e[1])))
      assert.equal(task.check(JSON.stringify({ answer: walk(0) })), true)
    }
  }
})
