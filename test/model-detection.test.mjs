import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { createModelDetectionRunner, readDetectionModels, normalizeFingerprintIdentity, summarizeModelDetection, PROBE_PLAN } from '../src/model-detection.js'
import { createFingerprintEngine, verifyEngine } from '../src/lm-fingerprint-engine.js'
import { releaseFiles, validateRelease } from '../src/lm-fingerprint-source.js'
import { createModelDetectionHistory } from '../src/model-detection-history.js'
import { analyzeSharedOutputs } from '../third_party/lm-fingerprint/core/shared-detector.mjs'
import { decodeDetector } from '../third_party/lm-fingerprint/core/detector-codec.mjs'

const selection = { provider: 'gateway', model: 'gpt-6.1-sol', reasoningEffort: 'high' }
const info = { reasoning: { efforts: [{ id: 'off' }, { id: 'high' }], defaultEffort: 'high' } }
const host = stream => ({ get: () => ({ resolveModelInfo: async () => info, stream }) })
const numbers = Array.from({ length: 332 }, (_, i) => (i * 17) % 355 + 1).join(',')
const goodStream = async function* () {
  yield { type: 'text-delta', text: numbers }
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 200, reasoningTokens: 5 } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}
const prepared = (runner, patch = {}) => runner.plan({ sessionId: 'one', selection, ...patch })
async function done(runner, id) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) { const job = runner.status(id); if (job.status !== 'running') return job; await new Promise(resolve => setTimeout(resolve, 5)) }
  assert.fail('fingerprint did not finish')
}
async function directory(t, prefix = 'dsh-lmfp-') {
  const path = await mkdtemp(join(tmpdir(), prefix))
  t.after(async () => { assert.equal(dirname(resolve(path)), resolve(tmpdir())); assert.ok(basename(path).startsWith(prefix)); await rm(path, { recursive: true, force: true }) })
  return path
}

test('detection catalogs expose configured providers and public models without inference or credentials', async () => {
  const listed = []
  const ctx = { get: () => ({
    // DSH ProviderInfo uses id/name; provider/displayName is a different API.
    listProviders: () => [{ id: 'gateway', name: 'Gateway', apiKey: 'PRIVATE' }, { id: 'other', name: 'Other' }, { id: 'gateway' }],
    listModels: async provider => { listed.push(provider); return [{ provider, id: 'model-b', name: 'Model B', headers: { authorization: 'PRIVATE' } }, { provider: 'wrong', id: 'hidden' }, { provider, id: 'model-b' }] },
    stream() { assert.fail('catalogs must not invoke a model') },
  }) }
  const catalog = await readDetectionModels(ctx)
  assert.deepEqual(catalog.providers, [{ provider: 'gateway', name: 'Gateway' }, { provider: 'other', name: 'Other' }])
  assert.deepEqual(listed, [])
  const selected = await readDetectionModels(ctx, 'other')
  assert.deepEqual(selected.models, [{ id: 'model-b', name: 'Model B' }])
  assert.deepEqual(listed, ['other'])
  assert.doesNotMatch(JSON.stringify([catalog, selected]), /PRIVATE|apiKey|headers/)
  await assert.rejects(() => readDetectionModels(ctx, 'unconfigured'), /已配置/)
  await assert.rejects(() => readDetectionModels({ get: () => ({ listProviders() { throw new Error('PRIVATE') }, listModels() {} }) }), error => /列表无法读取/.test(error.message) && !/PRIVATE/.test(error.message))
})

test('detection provider ids take precedence and older provider metadata remains selectable', async () => {
  const ctx = { get: () => ({
    listProviders: () => [{ id: 'actual-route', provider: 'wrong-route', name: 'Actual name', displayName: 'Wrong name' }, { provider: 'legacy-route', displayName: 'Legacy' }, { id: 'actual-route', name: 'Duplicate' }],
    listModels: async provider => [{ provider, id: 'selectable-model', name: 'Selectable model' }],
  }) }
  assert.deepEqual((await readDetectionModels(ctx)).providers, [{ provider: 'actual-route', name: 'Actual name' }, { provider: 'legacy-route', name: 'Legacy' }])
  assert.equal((await readDetectionModels(ctx, 'actual-route')).models[0].id, 'selectable-model')
  assert.equal((await readDetectionModels(ctx, 'legacy-route')).models[0].id, 'selectable-model')
  await assert.rejects(() => readDetectionModels(ctx, 'wrong-route'), /已配置/)
})

test('an independently selected provider and model run without any conversation', async t => {
  const selected = { provider: 'other-gateway', model: 'custom-model' }, calls = [], resolved = []
  const runner = createModelDetectionRunner({ get: () => ({
    resolveModelInfo: async (provider, model) => { resolved.push({ provider, model }); return info },
    stream: options => { calls.push(options); return goodStream() },
  }) }); t.after(() => runner.dispose())
  const quote = await runner.plan({ selection: selected, sampleCount: 1 })
  assert.deepEqual(resolved, [selected]); assert.equal(calls.length, 0)
  const job = await done(runner, runner.start({ planId: quote.id, ackCost: true }).id)
  assert.equal(job.sessionId, ''); assert.equal(job.status, 'complete'); assert.equal(calls.length, 1)
  assert.equal(calls[0].provider, selected.provider); assert.equal(calls[0].model, selected.model)
  assert.equal(calls[0].sessionId, undefined); assert.equal(job.conclusion.verdict, 'ranking-only')
})

test('catalog and budget preview never call a model; explicit standard test sends exactly three isolated prompts', async t => {
  const calls = [], runner = createModelDetectionRunner(host(options => { calls.push(options); return goodStream() }))
  t.after(() => runner.dispose())
  const catalog = await runner.catalog(), quote = await prepared(runner)
  assert.equal(calls.length, 0); assert.equal(catalog.models.length, 57)
  assert.equal(quote.plan.requests, 3); assert.equal(quote.plan.maxTokens, 4096); assert.equal(quote.plan.maxOutputTokens, 12288)
  assert.equal(quote.plan.budgetTokens, 12000); assert.equal(quote.testSelection.reasoningEffort, 'off')
  assert.equal(new Set(quote.plan.numbers).size, 3)
  assert.throws(() => runner.start({ sessionId: 'one', planId: quote.id }), /Token/)
  assert.throws(() => runner.start({ sessionId: 'other', planId: quote.id, ackCost: true }), /会话/)
  assert.equal(calls.length, 0)
  const start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true })
  assert.throws(() => runner.start({ sessionId: 'one', planId: quote.id, ackCost: true }), /过期/)
  const job = await done(runner, start.id)
  assert.equal(job.status, 'complete'); assert.equal(job.progress, 3); assert.equal(calls.length, 3)
  for (const options of calls) {
    assert.equal(options.maxTokens, PROBE_PLAN.maxTokens); assert.equal(options.reasoningEffort, 'off')
    assert.equal(options.messages.length, 1); assert.equal(options.messages[0].role, 'user')
    assert.equal(options.tools, undefined); assert.equal(options.temperature, undefined)
    assert.doesNotMatch(JSON.stringify(options.messages), /PRIVATE|fact_|知识|capability/i)
  }
  assert.equal(job.identity.usedSamples, 3); assert.equal(job.identity.candidates.length, 5)
  assert.equal(job.identity.modelInBank, true); assert.equal(job.identity.merged, true)
  assert.ok(Number.isFinite(job.identity.probability)); assert.equal(job.identity.probabilityScope, 'reference-closed-set')
  assert.equal(job.usage.inputTokens, 300); assert.equal(job.usage.outputTokens, 600)
  assert.doesNotMatch(JSON.stringify(job), /"prompt"|"text"|"messages"|"controller"|"score":\{/)
})

test('one-request screening has rankings but no confidence or identity verdict', async t => {
  let calls = 0
  const runner = createModelDetectionRunner(host(() => { calls++; return goodStream() }))
  t.after(() => runner.dispose())
  const quote = await prepared(runner, { sampleCount: 1 }), start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true })
  const job = await done(runner, start.id)
  assert.equal(calls, 1); assert.equal(job.status, 'complete'); assert.equal(job.identity.probability, null)
  assert.ok(job.identity.candidates.every(c => c.probability === null))
  assert.equal(job.conclusion.verdict, 'ranking-only'); assert.equal(job.conclusion.reason, 'partial-ranking')
})

test('worker scores equal the official scorer, including normalized closed-set probabilities', async t => {
  const manager = createFingerprintEngine(); t.after(() => manager.dispose())
  const engine = await manager.acquire(); t.after(() => engine.dispose())
  const bank = JSON.parse(await readFile('third_party/lm-fingerprint/data/unified_bank.json', 'utf8'))
  const detector = decodeDetector(await readFile('third_party/lm-fingerprint/data/shared_detector.bin'))
  const outputs = Array.from({ length: 3 }, () => ({ text: numbers, expected_count: 300 }))
  const direct = analyzeSharedOutputs(outputs, bank, detector, { allowPartial: true })
  assert.deepEqual(await engine.call('score', outputs), direct)
  assert.ok(Math.abs(direct.results.reduce((sum, c) => sum + c.probability, 0) - 1) < 1e-9)
  assert.equal(direct.probability_scope, 'reference-closed-set')
})

test('invalid budgets and incompatible parameters stop before inference', async t => {
  let calls = 0
  const runner = createModelDetectionRunner(host(() => { calls++; return goodStream() })); t.after(() => runner.dispose())
  for (const budgetTokens of [NaN, 1023, 50001, 12000.5]) await assert.rejects(() => prepared(runner, { budgetTokens }), /预算/)
  for (const maxTokens of [NaN, 1023, 16385, 4096.5, '8192']) await assert.rejects(() => prepared(runner, { maxTokens }), /单次输出上限/)
  for (const sampleCount of [0, 2, 4, '3']) await assert.rejects(() => prepared(runner, { sampleCount }), /1 次/)
  const missing = createModelDetectionRunner({ get: () => ({ stream() { calls++ } }) }); t.after(() => missing.dispose())
  await assert.rejects(() => prepared(missing), /参数校验/)
  assert.equal(calls, 0)
  assert.equal(runner.importReference, undefined); assert.equal(runner.exportReference, undefined)
})

test('invalid output, truncation and timeout each stop further samples without retries', async t => {
  for (const kind of ['format', 'truncated', 'timeout', 'failed']) {
    let calls = 0
    const runner = createModelDetectionRunner(host(async function* () {
      calls++
      yield { type: 'usage', usage: { inputTokens: 11, outputTokens: 2 } }
      if (kind === 'timeout') { await new Promise(() => {}); return }
      if (kind === 'failed') throw new Error('PRIVATE_SECRET')
      yield { type: 'text-delta', text: kind === 'format' ? 'not numbers' : '1,2,3' }
      yield { type: 'finish', reason: { kind: kind === 'truncated' ? 'max-tokens' : 'stop' } }
    }), { timeoutMs: 20 }); t.after(() => runner.dispose())
    const quote = await prepared(runner), start = runner.start({ sessionId: 'one', planId: quote.id, ackCost: true }), job = await done(runner, start.id)
    assert.equal(calls, 1); assert.equal(job.status, 'failed'); assert.equal(job.identity, null)
    assert.equal(job.conclusion.reason, { format: 'format', truncated: 'truncated', timeout: 'timeout', failed: 'request-failed' }[kind])
    assert.equal(job.usage.inputTokens, 11); assert.doesNotMatch(JSON.stringify(job), /PRIVATE_SECRET/)
  }
})

test('reported-token budget halts the next request and cancelled partial usage persists', async t => {
  const folder = await directory(t), history = createModelDetectionHistory(join(folder, 'history.json'))
  let calls = 0
  const runner = createModelDetectionRunner(host(async function* () {
    calls++; yield { type: 'text-delta', text: numbers }; yield { type: 'usage', usage: { inputTokens: 1000, outputTokens: 200 } }; yield { type: 'finish', reason: { kind: 'stop' } }
  }), { onUpdate: j => history.record(j) }); t.after(() => runner.dispose())
  const quote = await prepared(runner, { budgetTokens: 1024 }), job = await done(runner, runner.start({ sessionId: 'one', planId: quote.id, ackCost: true }).id)
  assert.equal(calls, 1); assert.equal(job.status, 'budget-exhausted'); assert.equal(job.identity.usedSamples, 1)
  assert.equal(job.identity.probability, null); assert.equal(job.conclusion.verdict, 'ranking-only'); assert.equal(job.conclusion.reason, 'budget')
  let entered
  const started = new Promise(resolve => { entered = resolve })
  const cancel = createModelDetectionRunner(host(async function* () {
    yield { type: 'usage', usage: { inputTokens: 10, cacheReadTokens: 30, cacheWriteTokens: 40 } }
    yield { type: 'usage', usage: { outputTokens: 20, reasoningTokens: 5 } }
    entered(); await new Promise(() => {})
  }), { onUpdate: j => history.record(j) }); t.after(() => cancel.dispose())
  const second = await prepared(cancel), id = cancel.start({ sessionId: 'one', planId: second.id, ackCost: true }).id
  await started; cancel.cancel(id)
  const cancelled = await done(cancel, id)
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.identity, null)
  assert.deepEqual(cancelled.usage, { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40, reasoningTokens: 5 })
  const restored = createModelDetectionHistory(join(folder, 'history.json'))
  assert.equal(restored.usage().length, 2); assert.equal(restored.latest().conclusion.reason, 'cancelled')
})

test('history survives restart and folds fingerprint usage into all charts exactly once', async t => {
  const folder = await directory(t), path = join(folder, 'history.json'), history = createModelDetectionHistory(path)
  const runner = createModelDetectionRunner(host(goodStream), { onUpdate: j => history.record(j) }); t.after(() => runner.dispose())
  const quote = await prepared(runner), job = await done(runner, runner.start({ sessionId: 'one', planId: quote.id, ackCost: true }).id)
  assert.equal(job.usageSaved, true)
  await history.record(job); await history.record({ ...job, results: job.results.slice(0, 1) })
  const restored = createModelDetectionHistory(path)
  const records = restored.usageRecords()
  assert.equal(records.length, 3)
  assert.equal(new Set(records.map(row => row.id)).size, 3)
  assert.equal(records.reduce((sum, row) => sum + row.usage.inputTokens + row.usage.outputTokens, 0), 900)
  assert.deepEqual(restored.latest().identity, job.identity)
  assert.doesNotMatch(await readFile(path, 'utf8'), /"text"|"prompt"|"messages"|"replayState"/)
})

test('unfinished detections reload as interrupted and keep reported usage', async t => {
  const folder = await directory(t), path = join(folder, 'history.json')
  const history = createModelDetectionHistory(path)
  await history.record({ id: 'unfinished', sessionId: '', status: 'running', selection,
    plan: { requests: 3 }, startedAt: 100, finishedAt: 0,
    results: [{ time: 200, outcome: 'scored', usageReported: true, usage: { inputTokens: 700, outputTokens: 200 } }] })
  const restored = createModelDetectionHistory(path)
  assert.equal(restored.latest().status, 'interrupted')
  assert.equal(restored.latest().conclusion.reason, 'interrupted')
  assert.equal(restored.usage()[0].usage.inputTokens, 700)
})

test('storage failure stops calls before inference and abnormal distributions are inconclusive', async t => {
  let calls = 0
  const runner = createModelDetectionRunner(host(() => { calls++; return goodStream() }), { onUpdate() { throw new Error('PRIVATE_FILE') } }); t.after(() => runner.dispose())
  const quote = await prepared(runner), job = await done(runner, runner.start({ sessionId: 'one', planId: quote.id, ackCost: true }).id)
  assert.equal(calls, 0); assert.equal(job.status, 'failed'); assert.equal(job.usageSaved, false)
  const identity = normalizeFingerprintIdentity({ usedSamples: 3, probabilityScope: 'reference-closed-set', probability: .99, modelInBank: true, sameCandidate: true, candidates: [{ id: 'one', score: -1, probability: .99 }] })
  assert.equal(summarizeModelDetection({ mode: 'fingerprint', status: 'complete', identity }).verdict, 'candidate-consistent')
  assert.equal(summarizeModelDetection({ mode: 'fingerprint', status: 'complete', identity: { ...identity, unusualDistribution: true } }).verdict, 'inconclusive')
  assert.equal(summarizeModelDetection({ mode: 'fingerprint', status: 'complete', identity: { ...identity, modelInBank: false } }).verdict, 'ranking-only')
  assert.equal(summarizeModelDetection({ status: 'complete', identity: { ...identity, probability: .74 } }).reason, 'low-confidence')
})

test('custom output limits are quoted, bound to the plan and persisted without implicit retries', async t => {
  const folder = await directory(t), path = join(folder, 'history.json'), history = createModelDetectionHistory(path), calls = []
  const runner = createModelDetectionRunner(host(options => { calls.push(options); return goodStream() }), { onUpdate: job => history.record(job) })
  t.after(() => runner.dispose())
  const quote = await prepared(runner, { maxTokens: 8192, sampleCount: 1 })
  assert.equal(quote.plan.maxTokens, 8192); assert.equal(quote.plan.maxOutputTokens, 8192); assert.equal(calls.length, 0)
  const job = await done(runner, runner.start({ planId: quote.id, sessionId: 'one', ackCost: true, maxTokens: 16384 }).id)
  assert.equal(calls.length, 1); assert.equal(calls[0].maxTokens, 8192)
  assert.equal(job.status, 'complete'); assert.equal(createModelDetectionHistory(path).latest().plan.maxTokens, 8192)
})

test('two complete samples survive a truncated third sample as rankings without confidence', async t => {
  const folder = await directory(t), path = join(folder, 'history.json'), history = createModelDetectionHistory(path)
  let calls = 0
  const runner = createModelDetectionRunner(host(async function* () {
    calls++
    yield { type: 'text-delta', text: calls < 3 ? numbers : numbers.split(',').slice(0, 140).join(',') }
    yield { type: 'usage', usage: { inputTokens: 259, outputTokens: 2048 } }
    yield { type: 'finish', reason: { kind: 'max-tokens' } }
  }), { onUpdate: job => history.record(job) }); t.after(() => runner.dispose())
  const quote = await prepared(runner, { maxTokens: 2048 })
  const job = await done(runner, runner.start({ planId: quote.id, sessionId: 'one', ackCost: true }).id)
  assert.equal(calls, 3); assert.equal(job.status, 'failed'); assert.equal(job.conclusion.reason, 'truncated')
  assert.equal(job.conclusion.verdict, 'ranking-only'); assert.equal(job.identity.usedSamples, 2)
  assert.equal(job.identity.probability, null); assert.ok(job.identity.candidates.length > 0)
  assert.ok(job.identity.candidates.every(candidate => candidate.probability === null))
  assert.deepEqual(job.results.map(result => result.outcome), ['scored', 'scored', 'incomplete'])
  assert.equal(job.results[2].valid, 140); assert.equal(job.results[2].expected, quote.plan.numbers[2])
  assert.ok(job.results[2].valid < job.results[2].expected, 'the third sample is shorter than its randomly generated challenge')
  assert.equal(job.usage.inputTokens + job.usage.outputTokens, 6921)
  const restored = createModelDetectionHistory(path).latest()
  assert.deepEqual(restored.identity, job.identity); assert.equal(restored.conclusion.reason, 'truncated')
  assert.doesNotMatch(await readFile(path, 'utf8'), /"text"|"prompt"|"messages"/)
})

test('reaching the reported budget on the final valid sample does not discard a completed test', async t => {
  let calls = 0
  const runner = createModelDetectionRunner(host(async function* () {
    calls++; yield { type: 'text-delta', text: numbers }
    yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 300 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })); t.after(() => runner.dispose())
  const quote = await prepared(runner, { budgetTokens: 1024 })
  const job = await done(runner, runner.start({ planId: quote.id, sessionId: 'one', ackCost: true }).id)
  assert.equal(calls, 3); assert.equal(job.status, 'complete'); assert.equal(job.identity.usedSamples, 3)
  assert.equal(job.usage.inputTokens + job.usage.outputTokens, 1200)
})

function tar(entries) {
  const chunks = []
  for (const [name, body] of entries) {
    const bytes = Buffer.from(body), header = Buffer.alloc(512)
    header.write(name); header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124)
    header.fill(32, 148, 156); header[156] = 48
    const checksum = header.reduce((sum, value) => sum + value, 0)
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148)
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]))
}
const integrityOf = bytes => 'sha512-' + createHash('sha512').update(bytes).digest('base64')

test('release validation restricts destinations and archive members and rejects modified packages', () => {
  const entries = [['package/package.json', '{}'], ['package/LICENSE', 'MIT'], ['package/data/unified_bank.json', '{}'], ['package/data/shared_detector.bin', 'fixture'], ['../../outside.txt', 'PRIVATE']]
  const bytes = tar(entries), files = releaseFiles(bytes, integrityOf(bytes))
  assert.equal(files.size, 4); assert.equal(files.has('../../outside.txt'), false)
  assert.throws(() => releaseFiles(Buffer.from('changed'), integrityOf(bytes)), /完整性/)
  const duplicate = tar([...entries, entries[0]])
  assert.throws(() => releaseFiles(duplicate, integrityOf(duplicate)), /无效文件/)
  const release = { name: 'lmfpd', version: '0.0.9999999999999', gitHead: 'a'.repeat(40), dist: { integrity: integrityOf(bytes), tarball: 'https://registry.npmjs.org/lmfpd/-/lmfpd-0.0.9999999999999.tgz' } }
  assert.equal(validateRelease(release).version, release.version)
  for (const patch of [{ gitHead: '../main' }, { version: '../escape' }, { dist: { ...release.dist, tarball: 'https://evil.example/pkg.tgz' } }]) assert.throws(() => validateRelease({ ...release, ...patch }))
})

test('failed updates and invalid cache pointers keep the verified bundle', async t => {
  const folder = await directory(t), cache = join(folder, 'cache'); await mkdir(cache)
  await writeFile(join(cache, 'current.json'), JSON.stringify({ version: '../escape', manifestHash: 'invalid' }))
  let requests = 0
  const manager = createFingerprintEngine({ path: cache, fetch: async () => { requests++; throw new Error('PRIVATE_NETWORK') } }); t.after(() => manager.dispose())
  const before = (await manager.acquire()).manifest.version
  const after = await manager.update(true)
  assert.equal(after.version, before); assert.equal(after.source, 'bundled'); assert.match(after.warning, /已验证/)
  assert.equal(requests, 1); assert.doesNotMatch(after.warning, /PRIVATE_NETWORK/)
  await manager.update(); assert.equal(requests, 1)
  const restarted = createFingerprintEngine({ path: cache, fetch: async () => { requests++; throw new Error('PRIVATE_NETWORK') } }); t.after(() => restarted.dispose())
  await restarted.update(); assert.equal(requests, 1, 'daily check survives a host restart')
})

test('verified upstream update persists and a prepared quote keeps its prior engine version', async t => {
  const folder = await directory(t), cache = join(folder, 'cache'), base = 'third_party/lm-fingerprint'
  const manifest = await verifyEngine(base), version = '0.0.9999999999999'
  const entries = [['package/package.json', JSON.stringify({ name: 'lmfpd', version, gitHead: manifest.revision })]]
  for (const file of ['LICENSE', 'data/unified_bank.json', 'data/shared_detector.bin']) entries.push(['package/' + file, await readFile(join(base, file))])
  const bytes = tar(entries), metadata = { name: 'lmfpd', version, gitHead: manifest.revision, dist: { integrity: integrityOf(bytes), tarball: 'https://registry.npmjs.org/lmfpd/-/lmfpd-' + version + '.tgz' } }
  const fetch = async url => {
    if (url.endsWith('/latest')) return new Response(JSON.stringify(metadata))
    if (url.endsWith('.tgz')) return new Response(bytes)
    const name = url.split('/').pop().replace(/\.(ts|js)$/, '.mjs')
    const source = (await readFile(join(base, 'core', name), 'utf8')).replace(/\.mjs(["'])/g, '.ts$1')
    return new Response(source)
  }
  const manager = createFingerprintEngine({ path: cache, fetch }), runner = createModelDetectionRunner(host(goodStream), { engine: manager }); t.after(() => runner.dispose())
  const quote = await prepared(runner), update = await manager.update(true)
  assert.equal(update.version, version); assert.equal(update.source, 'updated')
  const job = await done(runner, runner.start({ sessionId: 'one', planId: quote.id, ackCost: true }).id)
  assert.equal(job.engine.version, manifest.version); assert.equal(job.status, 'complete')
  const restarted = createFingerprintEngine({ path: cache }); t.after(() => restarted.dispose())
  const restored = await restarted.acquire(); t.after(() => restored.dispose())
  assert.equal(restored.manifest.version, version)
  await writeFile(join(cache, 'versions', version, 'core', 'shared-detector.mjs'), 'changed')
  const fallback = createFingerprintEngine({ path: cache }); t.after(() => fallback.dispose())
  const lease = await fallback.acquire(); t.after(() => lease.dispose())
  assert.equal(lease.manifest.version, manifest.version); assert.equal(fallback.status().source, 'bundled')
})
