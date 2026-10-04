/** Local, bounded evidence analysis. Response-declared names are observations,
 * never proof of a provider's real model identity. No conversation text is kept. */
import { randomUUID, randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { publicFingerprints, normalizeFingerprint, fingerprintSummary, fingerprintModelKey, subsetFingerprint,
  calibrationPool, fingerprintPrompt, parseFingerprintAnswers, fingerprintMatch, scoreFingerprint, FINGERPRINT_SYSTEM, AUDIT_POLICY } from './model-fingerprints.js'
import { capabilityTasks, scoreCapabilities } from './model-capabilities.js'

const LIMIT = 30
const usageKeys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']
const safeText = (value, max = 256) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : ''
const nonnegative = value => Number.isFinite(value) && value >= 0 ? value : 0
export function safeUsage(value) {
  return Object.fromEntries(usageKeys.map(key => [key, nonnegative(value?.[key])]))
}
export function modelSelection(value) {
  const provider = safeText(value?.provider), model = safeText(value?.model)
  if (!provider || !model) return null
  const reasoningEffort = safeText(value.reasoningEffort, 64)
  return { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) }
}
function record(value) {
  const selection = modelSelection(value)
  if (!selection) return null
  const responseModel = safeText(value.responseModel)
  const responseEffort = safeText(value.responseEffort, 64)
  const stop = ['stop', 'max-tokens', 'tool-calls', 'error', 'aborted', 'unknown'].includes(value.stop) ? value.stop : 'unknown'
  return { ...selection, time: nonnegative(value.time), requestHeader: value.requestHeader === true,
    ...(responseModel ? { responseModel } : {}), ...(responseEffort ? { responseEffort } : {}),
    stop, usage: safeUsage(value.usage) }
}
export function normalizeEvidence(value) {
  if (!value || value.version !== 1) return null
  return { version: 1, latestRequest: modelSelection(value.latestRequest),
    records: (Array.isArray(value.records) ? value.records : []).slice(-LIMIT).map(record).filter(Boolean) }
}

export function captureModelEvidence(events, inheritedEventCount = 0) {
  let latestRequest = null
  const records = []
  const inherited = Math.max(0, Math.floor(Number(inheritedEventCount) || 0))
  for (const [index, event] of (events || []).entries()) {
    if (event?.type === 'request/header') latestRequest = modelSelection(event.data?.header?.config) || latestRequest
    if (event?.type !== 'assistant/message' || index < inherited) continue
    const source = event.data?.message?.source
    const selection = modelSelection(source)
    if (!selection) continue
    const paired = latestRequest?.provider === selection.provider && latestRequest?.model === selection.model
    const response = source.replayState?.response
    records.push(record({ ...(paired ? latestRequest : selection), time: event.time,
      requestHeader: paired, responseModel: response?.responseModel,
      responseEffort: response?.providerThinkingLevel,
      stop: response?.stopReason === 'length' ? 'max-tokens' : response?.stopReason === 'toolUse' ? 'tool-calls' : response?.stopReason,
      usage: event.data.usage }))
  }
  return { version: 1, latestRequest, records: records.slice(-LIMIT) }
}

/** Only obvious provider-prefix/date-snapshot variations are comparable. No
 * aliases used by usage charts are used to decide identity or compatibility. */
function comparableModel(value) {
  return safeText(value).toLowerCase().split('/').pop().replace(/[-_]\d{4}[-_]\d{2}[-_]\d{2}$/, '')
}
export function analyzeModelEvidence(value, requested) {
  const evidence = normalizeEvidence(value)
  const selection = modelSelection(requested) || evidence?.latestRequest || evidence?.records.at(-1) || null
  const samples = (evidence?.records || []).filter(item => selection && item.provider === selection.provider && item.model === selection.model &&
    (!selection.reasoningEffort || item.reasoningEffort === selection.reasoningEffort))
  let exact = 0, compatible = 0, different = 0, missing = 0
  for (const item of samples) {
    if (!item.responseModel) missing++
    else if (item.responseModel === item.model) exact++
    else if (comparableModel(item.responseModel) === comparableModel(item.model)) compatible++
    else different++
  }
  // Metadata describes declarations only. Identity remains untested even when
  // every response repeats the requested name or every name differs.
  return { selection: modelSelection(selection), verdict: 'insufficient-evidence', strength: 'weak',
    declarationStatus: different ? 'name-difference' : exact + compatible ? 'names-consistent' : 'not-reported',
    counts: { samples: samples.length, exact, compatible, different, missing },
    // Newest first, deliberately excludes replay blocks, ids, headers and text.
    records: samples.slice(-10).reverse(),
    missingReasoningUsage: samples.filter(item => item.reasoningEffort && item.usage.reasoningTokens === 0).length }
}

export class ModelMatchError extends Error {}
export const PROBE_PLAN = Object.freeze({ maxTokens: 800, capabilityMaxTokens: 1024, timeoutMs: AUDIT_POLICY.timeoutMs })
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('aborted'))
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

const batches = values => Array.from({ length: Math.ceil(values.length / 10) }, (_, i) => values.slice(i * 10, i * 10 + 10))
const sumTokens = usage => usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
/** Answer agreement, not the statistical test's p-value or identity probability. */
export function modelTestScore(job) {
  const identity = job?.identity
  if (job?.status !== 'complete' || job.mode !== 'audit' || !['significant-difference', 'no-significant-difference'].includes(identity?.verdict)) return null
  const { count, valid, mismatches } = identity
  if (![count, valid, mismatches].every(Number.isInteger) || valid < AUDIT_POLICY.minSamples || valid > count || mismatches < 0 || mismatches > valid || valid / count < AUDIT_POLICY.minCoverage) return null
  return { value: Math.round((valid - mismatches) * 1000 / valid) / 10, matched: valid - mismatches, valid, count, method: 'answer-agreement' }
}
export function summarizeModelTest(job) {
  if (job.status === 'running') return { verdict: 'running', reason: 'running' }
  if (job.mode === 'calibrate' && job.status === 'complete' && job.baselineId) return { verdict: 'reference-created', reason: 'reference-created' }
  if (job.status === 'complete') {
    if (job.identity?.verdict === 'significant-difference') return { verdict: 'suspected-mismatch', reason: 'behavior-difference' }
    if (job.capability?.verdict === 'significant-decline') return { verdict: 'suspected-decline', reason: 'capability-decline' }
    if (job.identity?.verdict === 'no-significant-difference') return { verdict: 'no-anomaly', reason: 'behavior-consistent' }
    if (job.mode === 'capability' && job.capability?.verdict === 'no-significant-decline') return { verdict: 'no-decline', reason: 'capability-consistent' }
    if (job.mode === 'capability' && job.capability?.verdict === 'current-sample') return { verdict: 'capability-complete', reason: 'no-capability-reference' }
  }
  const results = job.results || []
  const invalid = Object.fromEntries(['incomplete', 'unparseable', 'unavailable', 'timeout', 'parameters-ignored'].map(code => [code, results.filter(r => r.outcome === code).length]))
  const reason = job.status === 'cancelled' ? 'cancelled' : job.status === 'interrupted' ? 'interrupted' : job.status === 'budget-exhausted' ? 'budget' :
    invalid['parameters-ignored'] ? 'parameters' : invalid.timeout ? 'timeout' : invalid.unavailable ? 'request-failed' : invalid.incomplete ? 'truncated' :
      invalid.unparseable ? 'format' : job.identity?.reason === 'coverage' || job.identity?.reason === 'sample-size' ? 'coverage' : job.mode === 'calibrate' ? 'reference-failed' : 'unfinished'
  return { verdict: 'inconclusive', reason, invalid }
}
const jobView = job => ({ id: job.id, sessionId: job.sessionId, selection: job.selection, testSelection: job.testSelection, capabilitySelection: job.capabilitySelection,
  mode: job.mode, status: job.status, phase: job.phase, startedAt: job.startedAt, finishedAt: job.finishedAt, progress: job.results.length,
  plan: job.plan, reference: job.reference && fingerprintSummary(job.reference), baselineId: job.baselineId || null,
  results: job.results.map(({ time, selection, phase, outcome, stop, usage, usageReported, valid, mismatches, ttftMs, decodeMs }) => ({ time, selection, phase, outcome, stop, usage, usageReported, valid, mismatches, ttftMs, decodeMs })),
  usage: safeUsage(job.usage), usageReported: job.results.some(r => r.usageReported),
  usageIncomplete: job.status === 'running' || job.results.some(r => !r.usageReported),
  identity: job.identity || null, capability: job.capability || null, message: job.message || '', conclusion: summarizeModelTest(job), score: modelTestScore(job), usageSaved: job.usageSaved === true,
  channel: { ttftMs: job.results.some(r => r.ttftMs !== null) ? job.results.filter(r => r.ttftMs !== null).reduce((n, r) => n + r.ttftMs, 0) / job.results.filter(r => r.ttftMs !== null).length : null,
    tps: job.results.some(r => r.decodeMs > 0 && r.usage.outputTokens > 0) ? job.results.filter(r => r.decodeMs > 0 && r.usage.outputTokens > 0).reduce((n, r) => n + r.usage.outputTokens, 0) * 1000 / job.results.filter(r => r.decodeMs > 0 && r.usage.outputTokens > 0).reduce((n, r) => n + r.decodeMs, 0) : null } })

/** No inference happens in catalog, import, export or plan. A one-use quote
 * freezes reference, parameters and maximum workload before the manual start. */
export function createModelMatchRunner(ctx, options = {}) {
  const jobs = new Map(), quotes = new Map(), references = new Map()
  let disposed = false, loaded = false, storageWarning = '', saveQueue = Promise.resolve()
  async function checkpoint(job, patch = {}) {
    if (!options.onUpdate) return
    try { await options.onUpdate({ ...jobView({ ...job, ...patch }), usageSaved: true }); job.usageSaved = true }
    catch { job.usageSaved = false; job.halt = true; job.message = '检测用量保存失败，已停止后续请求；请检查本地存储。' }
  }
  function load() {
    if (loaded) return
    loaded = true
    for (const raw of publicFingerprints().references) { const ref = normalizeFingerprint(raw, 'public'); references.set(ref.id, ref) }
    if (!options.path) return
    try {
      const data = JSON.parse(readFileSync(options.path, 'utf8'))
      for (const raw of (data.references || []).slice(0, AUDIT_POLICY.maxReferences)) {
        try { const ref = normalizeFingerprint(raw, raw.origin === 'calibrated' ? 'calibrated' : 'imported'); references.set(ref.id, ref) } catch { storageWarning = '部分本地基线无效，请重新导入或校准。' }
      }
    } catch (error) { if (error.code !== 'ENOENT') storageWarning = '本地基线文件无法读取，请检查文件后重新加载插件。' }
  }
  function save() {
    if (!options.path) return Promise.resolve()
    const document = JSON.stringify({ version: 2, references: [...references.values()].filter(r => r.origin !== 'public') })
    const next = saveQueue.catch(() => {}).then(async () => {
      await mkdir(dirname(options.path), { recursive: true })
      const temporary = options.path + '.tmp'
      await writeFile(temporary, document, { mode: 0o600 })
      await rename(temporary, options.path)
    })
    saveQueue = next
    return next
  }
  function getReference(id) { load(); const ref = references.get(id); if (!ref) throw new ModelMatchError('参考基线已不可用，请重新选择。'); return ref }
  function ensureLocalCapacity() { if ([...references.values()].filter(r => r.origin !== 'public').length >= AUDIT_POLICY.maxReferences) throw new ModelMatchError('本地基线已达 20 份，请先移除旧基线。') }
  async function resolveTestSelection(selection, effort) {
    const llm = ctx.get('llm')
    if (typeof llm?.stream !== 'function' || typeof llm?.resolveModelInfo !== 'function') throw new ModelMatchError('当前宿主不支持模型参数校验，请更新 DSH。')
    let info
    try { info = await llm.resolveModelInfo(selection.provider, selection.model, AbortSignal.timeout(10_000)) }
    catch { throw new ModelMatchError('模型信息无法读取，请检查供应商配置后重试。') }
    const efforts = info.reasoning?.efforts?.map(e => e.id)
    if (effort === 'off') {
      if (efforts && !efforts.includes('off')) throw new ModelMatchError('该模型无法关闭推理，不能使用关闭推理的公开基线。请建立相同推理强度的本地参考。')
      return { provider: selection.provider, model: selection.model, ...(efforts ? { reasoningEffort: 'off' } : {}) }
    }
    const actual = effort || info.reasoning?.defaultEffort
    if (actual && !efforts?.includes(actual)) throw new ModelMatchError('参考与目标的推理强度不兼容，请重新校准。')
    return { provider: selection.provider, model: selection.model, ...(actual ? { reasoningEffort: actual } : {}) }
  }
  async function request(job, task, phase, config) {
    const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), options.timeoutMs || PROBE_PLAN.timeoutMs)
    timer.unref?.()
    const signal = AbortSignal.any([job.controller.signal, timeout.signal])
    const item = { time: 0, selection: modelSelection(config.selection), phase, outcome: 'unavailable', stop: 'unknown', usage: safeUsage(null), usageReported: false, valid: 0, mismatches: 0, ttftMs: null, decodeMs: null }
    let iterator, text = '', firstToken = 0, finish, values = task.probes?.map(() => null)
    const started = Date.now()
    try {
      iterator = ctx.get('llm').stream({ ...config.selection, temperature: config.temperature, maxTokens: task.probes ? task.probes.length * 80 : PROBE_PLAN.capabilityMaxTokens,
        messages: [{ role: 'system', content: [{ type: 'text', text: FINGERPRINT_SYSTEM }] }, { role: 'user', content: [{ type: 'text', text: task.prompt }] }], signal })[Symbol.asyncIterator]()
      for (;;) {
        const next = await abortable(iterator.next(), signal)
        if (signal.aborted) throw new Error('aborted')
        if (next.done) break
        const chunk = next.value
        if (chunk?.type === 'text-delta') {
          if (chunk.text && !firstToken) firstToken = Date.now()
          text += String(chunk.text || '')
          if (text.length > 32_768) { item.stop = 'max-tokens'; break }
        }
        if (chunk?.type === 'usage') { item.usage = safeUsage(chunk.usage); item.usageReported = usageKeys.some(k => Number.isFinite(chunk.usage?.[k])) }
        if (chunk?.type === 'finish') { finish = chunk; break }
      }
      if (finish) item.stop = record({ ...job.selection, stop: finish.reason?.kind })?.stop || 'unknown'
      if (item.stop === 'stop') {
        // Public KBF references suppress reasoning. A relay reporting reasoning
        // despite off invalidates comparability, rather than receiving a pass.
        if ((config.noReasoning || config.selection.reasoningEffort === 'off') && item.usage.reasoningTokens > 0) item.outcome = 'parameters-ignored'
        else if (task.probes) {
          values = parseFingerprintAnswers(text, task.probes)
          item.valid = values.filter(Number.isFinite).length
          item.mismatches = task.probes.filter((p, i) => Number.isFinite(p.value) && Number.isFinite(values[i]) && !fingerprintMatch(p.value, values[i], p.domain)).length
          item.outcome = item.valid ? 'scored' : 'unparseable'
        } else {
          try { item.outcome = task.check(text) ? 'pass' : 'fail' } catch { item.outcome = 'unparseable' }
          item.valid = ['pass', 'fail'].includes(item.outcome) ? 1 : 0
        }
        if (firstToken) { item.ttftMs = firstToken - started; item.decodeMs = Date.now() - firstToken }
      } else item.outcome = item.stop === 'max-tokens' ? 'incomplete' : 'unavailable'
    } catch {
      item.outcome = job.controller.signal.aborted ? 'cancelled' : timeout.signal.aborted ? 'timeout' : 'unavailable'
      item.stop = signal.aborted ? 'aborted' : 'error'
    } finally {
      clearTimeout(timer); timeout.abort()
      try { Promise.resolve(iterator?.return?.()).catch(() => {}) } catch { /* broken adapters cannot block cancellation */ }
      text = ''
    }
    job.results.push(item)
    item.time = Date.now()
    for (const key of usageKeys) job.usage[key] += item.usage[key]
    if (['unavailable', 'timeout', 'parameters-ignored'].includes(item.outcome)) { job.halt = true; job.message = item.outcome === 'parameters-ignored' ? '通道未遵守关闭推理的测试参数，请重新校准。' : '请求未完成，已停止后续请求；检查通道后可重新测试。' }
    if (sumTokens(job.usage) >= job.plan.budgetTokens) { job.halt = true; job.budgetExhausted = true; job.message = '已达到已上报 Token 预算，后续请求已停止。' }
    await checkpoint(job)
    return { values: task.probes ? values : undefined, outcome: item.outcome, score: item.outcome === 'pass' ? 1 : item.outcome === 'fail' ? 0 : null }
  }
  const stopped = job => disposed || job.halt || job.controller.signal.aborted
  async function runFingerprints(job, probes, phase, temperature) {
    const values = []
    job.phase = phase
    for (const batch of batches(probes)) {
      if (stopped(job)) break
      const response = await request(job, { probes: batch, prompt: fingerprintPrompt(batch) }, phase, { selection: job.testSelection, temperature, noReasoning: job.reference?.config.reasoningEffort === 'off' || (job.mode === 'calibrate' && !job.testSelection.reasoningEffort) })
      values.push(...(response.values || batch.map(() => null)))
    }
    while (values.length < probes.length) values.push(null)
    return values
  }
  async function runCapabilities(job, seed, selection) {
    job.phase = 'capabilities'
    const outcomes = []
    for (const task of capabilityTasks(seed)) { if (stopped(job)) break; outcomes.push((await request(job, task, 'capabilities', { selection, temperature: 0 })).score) }
    while (outcomes.length < 16) outcomes.push(null)
    return outcomes
  }
  async function run(job, quote) {
    await checkpoint(job)
    let referenceToSave
    if (job.mode === 'calibrate') {
      const passes = []
      for (const [i, temp] of [0, 0.7, 0.7].entries()) { if (stopped(job)) break; passes.push(await runFingerprints(job, quote.pool, 'consensus-' + (i + 1), temp)) }
      if (!stopped(job) && passes.length === 3) {
        const stable = quote.pool.flatMap((p, i) => passes.every(v => Number.isFinite(v[i]) && fingerprintMatch(passes[0][i], v[i], p.domain)) ? [{ ...p, value: passes[0][i] }] : [])
        if (stable.length < AUDIT_POLICY.minSamples) { job.halt = true; job.message = '稳定探针少于 64 个，未保存基线；可提高校准题量后重试。' }
        else {
          const holdout = await runFingerprints(job, stable, 'calibration', 0)
          const probes = stable.map((p, i) => ({ ...p, calibration: Number.isFinite(holdout[i]) ? (fingerprintMatch(p.value, holdout[i], p.domain) ? 1 : 0) : null }))
          referenceToSave = normalizeFingerprint({ model: quote.claimedModel, provider: job.selection.provider, date: new Date().toISOString(), selection: job.testSelection,
            config: { system: FINGERPRINT_SYSTEM, temperature: 0, reasoningEffort: job.testSelection.reasoningEffort || 'off' }, probes }, 'calibrated')
          const calibrationCheck = scoreFingerprint(referenceToSave, probes.map(p => p.calibration))
          if (calibrationCheck.verdict === 'insufficient-evidence' || calibrationCheck.p0 > AUDIT_POLICY.maxReferenceNoise) { job.halt = true; job.message = '参考自测覆盖不足或波动过大，未保存基线。' }
        }
      }
    } else if (job.mode === 'audit') {
      const values = await runFingerprints(job, job.reference.probes, 'fingerprint', 0)
      const outcomes = job.reference.probes.map((p, i) => Number.isFinite(values[i]) ? (fingerprintMatch(p.value, values[i], p.domain) ? 1 : 0) : null)
      job.identity = scoreFingerprint(job.reference, outcomes, !stopped(job))
    }
    if (!stopped(job) && (job.mode === 'capability' || quote.includeCapabilities)) {
      const seed = quote.capabilitySeed, outcomes = await runCapabilities(job, seed, quote.capabilitySelection)
      const reference = job.reference?.capabilities
      job.capability = scoreCapabilities(outcomes, reference?.outcomes, !stopped(job))
      if (referenceToSave && outcomes.filter(v => v === 0 || v === 1).length >= 12) referenceToSave.capabilities = { version: 1, seed, effort: quote.capabilitySelection.reasoningEffort || '', outcomes }
    }
    let status = job.controller.signal.aborted || disposed ? 'cancelled' : job.budgetExhausted ? 'budget-exhausted' : job.halt ? 'failed' : 'complete'
    if (status === 'complete' && referenceToSave) {
      ensureLocalCapacity()
      const normalized = normalizeFingerprint(referenceToSave, 'calibrated')
      references.set(normalized.id, normalized)
      try {
        await save()
        if (disposed || job.controller.signal.aborted) { references.delete(normalized.id); await save(); status = 'cancelled' }
        else { job.reference = normalized; job.baselineId = normalized.id; job.identity = scoreFingerprint(normalized, normalized.probes.map(p => p.calibration)); job.message = '参考基线已保存，可用于同模型的后续检测。' }
      }
      catch { references.delete(normalized.id); status = 'failed'; job.message = '基线保存失败，请检查本地存储后重新校准。' }
    }
    if (status !== 'complete') {
      if (job.identity) job.identity = { ...job.identity, verdict: 'insufficient-evidence', reason: 'unfinished', pValue: null }
      if (job.capability) job.capability = { ...job.capability, verdict: 'insufficient-evidence', pValue: null }
    }
    job.finishedAt = Date.now()
    await checkpoint(job, { status })
    if ((disposed || job.controller.signal.aborted) && status !== 'cancelled') {
      status = 'cancelled'
      if (job.baselineId) { references.delete(job.baselineId); job.baselineId = null; await save() }
      if (job.identity) job.identity = { ...job.identity, verdict: 'insufficient-evidence', reason: 'unfinished', pValue: null }
      if (job.capability) job.capability = { ...job.capability, verdict: 'insufficient-evidence', pValue: null }
      await checkpoint(job, { status })
    }
    if (options.onUpdate && job.usageSaved === false && status === 'complete') {
      status = 'failed'
      if (job.identity) job.identity = { ...job.identity, verdict: 'insufficient-evidence', reason: 'unfinished', pValue: null }
      if (job.capability) job.capability = { ...job.capability, verdict: 'insufficient-evidence', pValue: null }
    }
    job.status = status
  }
  return {
    catalog() { load(); return { references: [...references.values()].map(fingerprintSummary), policy: AUDIT_POLICY, storageWarning } },
    exportReference(id) { return getReference(id) },
    async importReference(raw) {
      load()
      let ref
      try { ref = normalizeFingerprint(raw) } catch (error) { throw new ModelMatchError(error.message) }
      if (!references.has(ref.id)) ensureLocalCapacity()
      const previous = references.get(ref.id); references.set(ref.id, ref)
      try { await save() } catch { if (previous) references.set(ref.id, previous); else references.delete(ref.id); throw new ModelMatchError('基线保存失败，请检查本地存储。') }
      return fingerprintSummary(ref)
    },
    async removeReference(id) {
      const ref = getReference(id)
      if (ref.origin === 'public') throw new ModelMatchError('公开参考随插件提供，无法移除。')
      if ([...jobs.values()].some(j => j.status === 'running' && j.reference?.id === id)) throw new ModelMatchError('该基线正在使用，请先取消测试。')
      references.delete(id)
      try { await save() } catch { references.set(id, ref); throw new ModelMatchError('基线移除失败，请重试。') }
    },
    async plan(body) {
      if (disposed) throw new ModelMatchError('匹配服务已停止。')
      load()
      const mode = ['audit', 'calibrate', 'capability'].includes(body?.mode) ? body.mode : 'audit'
      const selection = modelSelection(body?.selection), sessionId = safeText(body?.sessionId)
      if (!selection || !sessionId) throw new ModelMatchError('请先选择当前会话与模型。')
      let reference, pool, count = 0, includeCapabilities = mode === 'calibrate' || body.includeCapabilities === true
      let testSelection, capabilitySelection, capabilitySeed = randomInt(0x100000000), claimedModel = selection.model
      if (mode === 'calibrate') {
        ensureLocalCapacity()
        if (body.ackReference !== true) throw new ModelMatchError('请确认所选通道可作为可信参考。')
        claimedModel = safeText(body.claimedModel)
        if (!claimedModel) throw new ModelMatchError('请选择该参考对应的目标模型。')
        count = body.probeCount === 256 ? 256 : 128; pool = calibrationPool(count)
        testSelection = await resolveTestSelection(selection, selection.reasoningEffort || 'off')
      } else if (mode === 'audit' || body.referenceId) {
        reference = getReference(body.referenceId)
        if (fingerprintModelKey(reference.model) !== fingerprintModelKey(selection.model)) throw new ModelMatchError('参考基线与当前模型不同，请选择对应基线或建立本地参考。')
        if (mode === 'audit') {
          const selfCheck = scoreFingerprint(reference, reference.probes.map(() => 1))
          if (selfCheck.verdict === 'insufficient-evidence' || selfCheck.p0 > AUDIT_POLICY.maxReferenceNoise) throw new ModelMatchError('参考自测覆盖不足或波动过大，请重新校准后检测。')
        }
        count = body.probeCount === 128 && !reference.calibration ? Math.min(128, reference.probes.length) : reference.probes.length
        testSelection = await resolveTestSelection(selection, mode === 'capability' ? selection.reasoningEffort || '' : reference.config.reasoningEffort)
        if (reference.capabilities) capabilitySeed = reference.capabilities.seed
      }
      testSelection ||= await resolveTestSelection(selection, selection.reasoningEffort || (mode === 'capability' ? '' : 'off'))
      if (mode === 'capability' || includeCapabilities) {
        capabilitySelection = await resolveTestSelection(selection, selection.reasoningEffort || '')
        if (reference?.capabilities && reference.capabilities.effort !== (capabilitySelection.reasoningEffort || '')) throw new ModelMatchError('能力基线的推理强度与当前模型不同，请选择相同档位或重新校准。')
      }
      const requests = (mode === 'calibrate' ? 4 : mode === 'audit' ? 1 : 0) * Math.ceil(count / 10) + (mode === 'capability' || includeCapabilities ? 16 : 0)
      const maxOutputTokens = (mode === 'calibrate' ? 4 : mode === 'audit' ? 1 : 0) * count * 80 + (mode === 'capability' || includeCapabilities ? 16 * 1024 : 0)
      const fingerprintChars = mode === 'capability' ? 0 : batches(pool || reference.probes.slice(0, count)).reduce((n, batch) => n + fingerprintPrompt(batch).length + FINGERPRINT_SYSTEM.length, 0) * (mode === 'calibrate' ? 4 : 1)
      const capabilityChars = mode === 'capability' || includeCapabilities ? capabilityTasks(capabilitySeed).reduce((n, task) => n + task.prompt.length + FINGERPRINT_SYSTEM.length, 0) : 0
      if (body.budgetTokens !== undefined && (!Number.isInteger(body.budgetTokens) || body.budgetTokens < 1024 || body.budgetTokens > 500_000)) throw new ModelMatchError('Token 预算应为 1,024–500,000 的整数。')
      const budgetTokens = body.budgetTokens ?? 120_000
      const plan = { requests, probes: count, maxOutputTokens, estimatedInputTokens: Math.ceil((fingerprintChars + capabilityChars) / 3), budgetTokens,
        batchSize: 10, temperature: 0, timeoutMs: PROBE_PLAN.timeoutMs, capabilities: mode === 'capability' || includeCapabilities, capabilityTasks: mode === 'capability' || includeCapabilities ? 16 : 0 }
      while (quotes.size >= 10) quotes.delete(quotes.keys().next().value)
      const id = randomUUID()
      quotes.set(id, { id, mode, selection, sessionId, reference, pool, count, includeCapabilities, testSelection, capabilitySelection, capabilitySeed, claimedModel, plan, createdAt: Date.now() })
      return { id, mode, selection, testSelection, capabilitySelection, reference: reference && fingerprintSummary(reference), claimedModel, plan }
    },
    start(body) {
      if (disposed) throw new ModelMatchError('匹配服务已停止。')
      if (body?.ackCost !== true) throw new ModelMatchError('请确认测试会消耗 Token 后再开始。')
      const quote = quotes.get(body.planId)
      if (!quote || Date.now() - quote.createdAt > 5 * 60_000) throw new ModelMatchError('测试预算已过期，请刷新预算后开始。')
      if (body.sessionId !== quote.sessionId) throw new ModelMatchError('当前会话已变化，请重新生成预算。')
      if ([...jobs.values()].some(j => j.status === 'running')) throw new ModelMatchError('已有测试正在运行，请先等待或取消。')
      if (quote.reference && references.get(quote.reference.id) !== quote.reference) throw new ModelMatchError('参考基线已变化，请刷新预算。')
      quotes.delete(quote.id)
      while (jobs.size >= 10) jobs.delete(jobs.keys().next().value)
      const job = { id: randomUUID(), sessionId: quote.sessionId, selection: quote.selection, testSelection: quote.testSelection, mode: quote.mode,
        capabilitySelection: quote.capabilitySelection,
        reference: quote.reference && subsetFingerprint(quote.reference, quote.count), plan: quote.plan, status: 'running', phase: 'queued',
        startedAt: Date.now(), finishedAt: 0, controller: new AbortController(), results: [], usage: safeUsage(null) }
      jobs.set(job.id, job)
      queueMicrotask(() => { void run(job, quote).catch(async () => { job.status = 'failed'; job.message = '测试未完成，请检查通道或重新生成预算。'; job.finishedAt = Date.now(); await checkpoint(job) }) })
      return jobView(job)
    },
    status(id, sessionId) { const job = id ? jobs.get(id) : [...jobs.values()].reverse().find(j => !sessionId || j.sessionId === sessionId); if (id && !job) throw new ModelMatchError('测试记录已过期。'); return job ? jobView(job) : null },
    cancel(id) { const job = jobs.get(id); if (!job) throw new ModelMatchError('测试记录已过期。'); if (job.status === 'running') job.controller.abort(); return jobView(job) },
    dispose() { disposed = true; quotes.clear(); for (const job of jobs.values()) job.controller.abort() },
  }
}
