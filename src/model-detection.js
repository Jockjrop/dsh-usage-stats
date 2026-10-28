/** Bounded LM Fingerprint detection. No conversation text is sent or retained. */
import { randomUUID } from 'node:crypto'
import { createFingerprintEngine } from './lm-fingerprint-engine.js'

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
const stopReason = value => ['stop', 'max-tokens', 'tool-calls', 'error', 'aborted', 'unknown'].includes(value) ? value : 'unknown'

export class ModelDetectionError extends Error {}
export async function readDetectionModels(ctx, provider = '') {
  const llm = ctx.get('llm')
  if (typeof llm?.listProviders !== 'function' || typeof llm?.listModels !== 'function') throw new ModelDetectionError('当前宿主不支持读取模型列表，请更新 DSH。')
  try {
    const signal = AbortSignal.timeout(10_000)
    const registered = await abortable(llm.listProviders(), signal)
    if (!Array.isArray(registered)) throw new Error('invalid providers')
    const seen = new Set()
    const providers = registered.flatMap(item => {
      // listProviders() returns ProviderInfo { id, name }; configurable-provider
      // declarations use { provider, displayName } on older host integrations.
      const id = safeText(item?.id || item?.provider)
      if (!id || seen.has(id)) return []
      seen.add(id)
      return [{ provider: id, name: safeText(item.name || item.displayName || id, 512) }]
    })
    provider = safeText(provider)
    if (!provider) return { providers, provider: '', models: [] }
    if (!seen.has(provider)) throw new ModelDetectionError('请选择已配置的供应商。')
    const listed = await abortable(llm.listModels(provider), signal)
    if (!Array.isArray(listed)) throw new Error('invalid models')
    const ids = new Set()
    const models = listed.flatMap(item => {
      const id = safeText(item?.id)
      if (!id || item.provider !== provider || ids.has(id)) return []
      ids.add(id)
      return [{ id, name: safeText(item.name || id, 512) }]
    })
    return { providers, provider, models }
  } catch (error) {
    if (error instanceof ModelDetectionError) throw error
    throw new ModelDetectionError('模型列表无法读取，请检查供应商配置后重试。')
  }
}
export const PROBE_PLAN = Object.freeze({ samples: 3, maxTokens: 4096, timeoutMs: 60_000, budgetTokens: 12_000 })
const sumTokens = usage => usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
function modelKey(value) {
  return safeText(value).toLowerCase().split('/').pop().replace(/[-_]20\d{6}$/, '').replace(/[-_]20\d{2}[-_]\d{2}[-_]\d{2}$/, '').replace(/(\d)-(\d)(?=$|[-.])/, '$1.$2')
}
function modelAliases(model) {
  const first = modelKey(model.id), labels = String(model.name || '').split('/')
  const prefix = first.match(/^\D+/)?.[0] || ''
  return [...new Set([first, ...labels.map(v => modelKey(/^\d/.test(v) ? prefix + v : v))])]
}
export function normalizeFingerprintIdentity(raw) {
  if (!raw || !Array.isArray(raw.candidates)) return null
  const usedSamples = Number.isInteger(raw.usedSamples) && raw.usedSamples >= 0 && raw.usedSamples <= 3 ? raw.usedSamples : 0
  const probability = v => usedSamples === 3 && raw.probabilityScope === 'reference-closed-set' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null
  const candidates = raw.candidates.slice(0, 5).filter(c => safeText(c?.id) && Number.isFinite(c.score)).map(c => ({ id: safeText(c.id), name: safeText(c.name || c.id), family: safeText(c.family), score: c.score, probability: probability(c.probability) }))
  return { method: safeText(raw.method), usedSamples, requestedSamples: raw.requestedSamples === 1 ? 1 : 3,
    candidates, probability: probability(raw.probability), probabilityScope: 'reference-closed-set',
    modelInBank: raw.modelInBank === true, sameCandidate: typeof raw.sameCandidate === 'boolean' ? raw.sameCandidate : null,
    merged: raw.merged === true, unusualDistribution: raw.unusualDistribution === true }
}
export function summarizeModelDetection(job) {
  if (job.status === 'running') return { verdict: 'running', reason: 'running' }
  const identity = job.identity
  const invalid = Object.fromEntries(['incomplete', 'unparseable', 'unavailable', 'timeout'].map(code => [code, (job.results || []).filter(r => r.outcome === code).length]))
  const reason = job.status === 'cancelled' ? 'cancelled' : job.status === 'interrupted' ? 'interrupted' : job.status === 'budget-exhausted' ? 'budget' :
    identity?.unusualDistribution ? 'distribution' : invalid.timeout ? 'timeout' : invalid.unavailable ? 'request-failed' : invalid.incomplete ? 'truncated' : invalid.unparseable ? 'format' : 'unfinished'
  if (['failed', 'budget-exhausted'].includes(job.status) && identity?.usedSamples > 0 && identity.candidates.length && !identity.unusualDistribution) return { verdict: 'ranking-only', reason, invalid }
  if (job.status === 'complete' && identity?.candidates?.length && !identity.unusualDistribution) {
    if (identity.usedSamples < 3 || identity.probability === null) return { verdict: 'ranking-only', reason: 'partial-ranking' }
    if (!identity.modelInBank) return { verdict: 'ranking-only', reason: 'model-not-enrolled' }
    if (identity.probability < .75) return { verdict: 'ranking-only', reason: 'low-confidence' }
    return { verdict: identity.sameCandidate ? 'candidate-consistent' : 'candidate-different', reason: identity.merged ? 'merged-class' : 'closed-set-ranking' }
  }
  return { verdict: 'inconclusive', reason, invalid }
}
function jobView(job) {
  return { id: job.id, sessionId: job.sessionId, selection: job.selection, testSelection: job.testSelection,
    status: job.status, phase: job.phase, startedAt: job.startedAt, finishedAt: job.finishedAt, progress: job.results.length,
    engine: job.engineInfo, plan: job.plan, usage: safeUsage(job.usage), usageReported: job.results.some(r => r.usageReported),
    usageIncomplete: job.status === 'running' || job.results.some(r => !r.usageReported), usageSaved: job.usageSaved === true,
    results: job.results.map(({ time, selection, phase, outcome, stop, usage, usageReported, valid, expected, ttftMs, decodeMs }) => ({ time, selection, phase, outcome, stop, usage, usageReported, valid, expected, ttftMs, decodeMs })),
    identity: job.identity || null, conclusion: summarizeModelDetection(job), message: job.message || '',
    channel: { ttftMs: job.results.some(r => r.ttftMs !== null) ? job.results.filter(r => r.ttftMs !== null).reduce((n, r) => n + r.ttftMs, 0) / job.results.filter(r => r.ttftMs !== null).length : null,
      tps: job.results.some(r => r.decodeMs > 0 && r.usage.outputTokens > 0) ? job.results.filter(r => r.decodeMs > 0 && r.usage.outputTokens > 0).reduce((n, r) => n + r.usage.outputTokens, 0) * 1000 / job.results.filter(r => r.decodeMs > 0 && r.usage.outputTokens > 0).reduce((n, r) => n + r.decodeMs, 0) : null } }
}
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('aborted'))
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
export function createModelDetectionRunner(ctx, options = {}) {
  const engine = options.engine || createFingerprintEngine({ path: options.enginePath, fetch: options.fetch })
  const jobs = new Map(), quotes = new Map()
  let disposed = false
  async function checkpoint(job, patch = {}) {
    if (!options.onUpdate) return
    try { await options.onUpdate({ ...jobView({ ...job, ...patch }), usageSaved: true }); job.usageSaved = true }
    catch { job.usageSaved = false; job.halt = true; job.message = '检测用量保存失败，已停止后续请求；请检查本地存储。' }
  }
  function discardQuote(id) { const quote = quotes.get(id); if (quote) { quote.engine.dispose(); clearTimeout(quote.timer); quotes.delete(id) } }
  async function request(job, challenge) {
    const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), options.timeoutMs || PROBE_PLAN.timeoutMs)
    const signal = AbortSignal.any([job.controller.signal, timeout.signal])
    const item = { time: 0, selection: job.testSelection, phase: 'fingerprint', outcome: 'unavailable', stop: 'unknown',
      usage: safeUsage(null), usageReported: false, valid: 0, expected: challenge.expected_count, ttftMs: null, decodeMs: null }
    let iterator, text = '', firstToken = 0, output = null
    const started = Date.now()
    try {
      const llm = ctx.get('llm')
      iterator = llm.stream({ ...job.testSelection, maxTokens: job.plan.maxTokens,
        messages: [{ role: 'user', content: [{ type: 'text', text: challenge.prompt }] }], signal })[Symbol.asyncIterator]()
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
        if (chunk?.type === 'usage') {
          for (const key of usageKeys) if (Number.isFinite(chunk.usage?.[key]) && chunk.usage[key] >= 0) { item.usage[key] = chunk.usage[key]; item.usageReported = true }
        }
        if (chunk?.type === 'finish') { item.stop = stopReason(chunk.reason?.kind); break }
      }
      if (['stop', 'max-tokens'].includes(item.stop)) {
        const numbers = await job.engine.call('parse', text, signal)
        item.valid = Math.min(numbers.length, challenge.expected_count)
        if (item.stop === 'max-tokens' && numbers.length < challenge.expected_count) item.outcome = 'incomplete'
        else if (numbers.length < Math.max(80, Math.ceil(challenge.expected_count * .55))) item.outcome = 'unparseable'
        else { item.outcome = 'scored'; output = { text: numbers.slice(0, challenge.expected_count).join(','), expected_count: challenge.expected_count } }
        if (firstToken) { item.ttftMs = firstToken - started; item.decodeMs = Date.now() - firstToken }
      }
    } catch { item.outcome = job.controller.signal.aborted ? 'cancelled' : timeout.signal.aborted ? 'timeout' : 'unavailable'; item.stop = signal.aborted ? 'aborted' : 'error' }
    finally {
      clearTimeout(timer); timeout.abort()
      try { Promise.resolve(iterator?.return?.()).catch(() => {}) } catch {}
      text = ''
      item.time = Date.now(); job.results.push(item)
      for (const key of usageKeys) job.usage[key] += item.usage[key]
      if (item.outcome !== 'scored') job.halt = true
      if (sumTokens(job.usage) >= job.plan.budgetTokens && job.results.length < job.plan.requests) { job.halt = true; job.budgetExhausted = true }
      await checkpoint(job)
    }
    return output
  }
  async function run(job, quote) {
    const outputs = []
    try {
      await checkpoint(job)
      for (const challenge of quote.challenges) {
        if (disposed || job.controller.signal.aborted || job.halt) break
        job.phase = 'sampling'
        const output = await request(job, challenge)
        if (output) outputs.push(output)
      }
      // Score the valid samples even when a later call fails. The official
      // scorer withholds calibrated probabilities for fewer than 3 samples.
      if (!disposed && !job.controller.signal.aborted && job.usageSaved !== false && outputs.length > 0) {
        job.phase = 'scoring'
        const analysis = await job.engine.call('score', outputs, job.controller.signal)
        const requested = modelKey(job.selection.model)
        const claimed = job.engine.models.find(m => modelAliases(m).includes(requested))
        job.identity = normalizeFingerprintIdentity({ method: analysis.method, usedSamples: analysis.used_outputs, requestedSamples: job.plan.samples,
          candidates: (analysis.results || []).map(c => ({ id: c.model, name: c.display_name, family: c.family, score: c.score, probability: c.probability })),
          probability: analysis.probability, probabilityScope: analysis.probability_scope,
          modelInBank: !!claimed, sameCandidate: claimed ? claimed.id === analysis.prediction : null,
          merged: !!claimed && modelAliases(claimed).length > 1,
          unusualDistribution: analysis.decision === 'not_model' || outputs.some(o => Math.min(...o.text.split(',').map(Number)) >= 200) })
      }
    } catch { job.halt = true; job.message = '指纹检测未完成，请检查通道或引擎状态。' }
    finally {
      outputs.length = 0; quote.challenges.length = 0; job.engine.dispose()
      const status = disposed || job.controller.signal.aborted ? 'cancelled' : job.budgetExhausted ? 'budget-exhausted' : job.halt ? 'failed' : 'complete'
      if (status === 'cancelled' || job.usageSaved === false) job.identity = null
      job.finishedAt = Date.now(); job.phase = 'finished'
      await checkpoint(job, { status })
      job.status = job.usageSaved === false && options.onUpdate ? 'failed' : status
      if (job.usageSaved === false) job.identity = null
    }
  }
  return {
    catalog: () => engine.catalog(), updateEngine: () => engine.update(true),
    async plan(body) {
      if (disposed) throw new ModelDetectionError('检测服务已停止。')
      const selection = modelSelection(body?.selection), sessionId = safeText(body?.sessionId)
      if (!selection) throw new ModelDetectionError('请选择供应商与检测模型。')
      const samples = body.sampleCount ?? 3
      if (![1, 3].includes(samples)) throw new ModelDetectionError('请选择 1 次初筛或 3 次标准检测。')
      const budgetTokens = body.budgetTokens ?? PROBE_PLAN.budgetTokens
      if (!Number.isInteger(budgetTokens) || budgetTokens < 1024 || budgetTokens > 50_000) throw new ModelDetectionError('Token 预算应为 1,024–50,000 的整数。')
      const maxTokens = body.maxTokens ?? PROBE_PLAN.maxTokens
      if (!Number.isInteger(maxTokens) || maxTokens < 1024 || maxTokens > 16_384) throw new ModelDetectionError('单次输出上限应为 1,024–16,384 的整数。')
      const llm = ctx.get('llm')
      if (typeof llm?.stream !== 'function' || typeof llm?.resolveModelInfo !== 'function') throw new ModelDetectionError('当前宿主不支持模型参数校验，请更新 DSH。')
      let info
      try { info = await llm.resolveModelInfo(selection.provider, selection.model, AbortSignal.timeout(10_000)) }
      catch { throw new ModelDetectionError('模型信息无法读取，请检查供应商配置后重试。') }
      const efforts = info.reasoning?.efforts?.map(e => e.id)
      const effort = efforts ? ['off', 'none', 'minimal', 'low'].find(e => efforts.includes(e)) || selection.reasoningEffort || info.reasoning.defaultEffort : undefined
      if (effort && !efforts.includes(effort)) throw new ModelDetectionError('模型推理参数不受支持。')
      const testSelection = { provider: selection.provider, model: selection.model, ...(effort ? { reasoningEffort: effort } : {}) }
      let lease
      try {
        lease = await engine.acquire()
        const challenges = await lease.call('challenges', samples)
        const plan = { requests: samples, samples, maxTokens, numbers: challenges.map(c => c.expected_count), maxOutputTokens: samples * maxTokens,
          estimatedInputTokens: Math.ceil(challenges.reduce((n, c) => n + c.prompt.length, 0) / 2), budgetTokens, timeoutMs: options.timeoutMs || PROBE_PLAN.timeoutMs }
        for (const [id, quote] of quotes) if (Date.now() - quote.createdAt > 5 * 60_000) discardQuote(id)
        // Only the newest budget can start detection; keep one idle worker.
        for (const id of quotes.keys()) discardQuote(id)
        const id = randomUUID(), timer = setTimeout(() => discardQuote(id), 5 * 60_000); timer.unref?.()
        const engineInfo = { name: 'lmfpd', version: lease.manifest.version, revision: lease.manifest.revision, builtAt: lease.manifest.builtAt, modelCount: lease.models.length }
        quotes.set(id, { id, timer, sessionId, selection, testSelection, plan, engineInfo, engine: lease, challenges, createdAt: Date.now() })
        return { id, selection, testSelection, plan, engine: engineInfo }
      } catch { lease?.dispose(); throw new ModelDetectionError('指纹引擎不可用，请检查更新状态。') }
    },
    start(body) {
      if (disposed) throw new ModelDetectionError('检测服务已停止。')
      if (body?.ackCost !== true) throw new ModelDetectionError('请确认检测会消耗 Token 后再开始。')
      const quote = quotes.get(body.planId)
      if (!quote || Date.now() - quote.createdAt > 5 * 60_000) throw new ModelDetectionError('检测预算已过期，请刷新预算后开始。')
      if (safeText(body.sessionId) !== quote.sessionId) throw new ModelDetectionError('当前会话已变化，请重新生成预算。')
      if ([...jobs.values()].some(j => j.status === 'running')) throw new ModelDetectionError('已有检测正在运行，请先等待或取消。')
      quotes.delete(quote.id); clearTimeout(quote.timer)
      while (jobs.size >= 10) jobs.delete(jobs.keys().next().value)
      const job = { id: randomUUID(), sessionId: quote.sessionId, selection: quote.selection, testSelection: quote.testSelection,
        plan: quote.plan, engineInfo: quote.engineInfo, engine: quote.engine, status: 'running', phase: 'queued', startedAt: Date.now(), finishedAt: 0,
        controller: new AbortController(), results: [], usage: safeUsage(null), identity: null }
      jobs.set(job.id, job)
      queueMicrotask(() => { void run(job, quote) })
      return jobView(job)
    },
    status(id, sessionId) { const job = id ? jobs.get(id) : [...jobs.values()].reverse().find(j => !sessionId || j.sessionId === sessionId); if (id && !job) throw new ModelDetectionError('检测记录已过期。'); return job ? jobView(job) : null },
    cancel(id) { const job = jobs.get(id); if (!job) throw new ModelDetectionError('检测记录已过期。'); if (job.status === 'running') job.controller.abort(); return jobView(job) },
    dispose() { disposed = true; for (const job of jobs.values()) job.controller.abort(); for (const id of quotes.keys()) discardQuote(id); engine.dispose() }
  }
}
