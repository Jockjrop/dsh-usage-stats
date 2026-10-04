/** Durable reported usage and recent audit results. No prompts, answers or credentials. */
import { readFileSync } from 'node:fs'
import { mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { modelSelection, safeUsage, summarizeModelTest, modelTestScore } from './model-match.js'

const clean = v => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 256) : ''
const number = v => Number.isFinite(v) && v >= 0 ? v : 0
const timing = v => Number.isFinite(v) && v >= 0 ? v : null
const modes = ['audit', 'calibrate', 'capability']
const states = ['running', 'complete', 'failed', 'cancelled', 'budget-exhausted', 'interrupted']
const outcomes = ['scored', 'pass', 'fail', 'unparseable', 'unavailable', 'timeout', 'incomplete', 'cancelled', 'parameters-ignored']
const fields = (value, keys) => Object.fromEntries(keys.filter(k => Number.isFinite(value?.[k]) && value[k] >= 0).map(k => [k, value[k]]))
function result(raw, job) {
  const selection = modelSelection(raw.selection) || (raw.phase === 'capabilities' ? job.capabilitySelection || job.selection : job.testSelection || job.selection)
  return { time: number(raw.time) || job.finishedAt || job.startedAt, selection,
    phase: clean(raw.phase), outcome: outcomes.includes(raw.outcome) ? raw.outcome : 'unavailable', stop: clean(raw.stop),
    usage: safeUsage(raw.usage), usageReported: raw.usageReported === true || (raw.usageReported === undefined && Object.values(safeUsage(raw.usage)).some(v => v > 0)),
    valid: number(raw.valid), mismatches: number(raw.mismatches), ttftMs: timing(raw.ttftMs), decodeMs: timing(raw.decodeMs) }
}
function jobSnapshot(raw) {
  const selection = modelSelection(raw?.selection)
  if (!selection || !clean(raw.id) || !modes.includes(raw.mode) || !states.includes(raw.status)) return null
  const job = { id: clean(raw.id), sessionId: clean(raw.sessionId), selection, testSelection: modelSelection(raw.testSelection), capabilitySelection: modelSelection(raw.capabilitySelection),
    mode: raw.mode, status: raw.status, phase: clean(raw.phase), startedAt: number(raw.startedAt), finishedAt: number(raw.finishedAt), baselineId: clean(raw.baselineId) || null,
    plan: fields(raw.plan, ['requests', 'probes', 'maxOutputTokens', 'estimatedInputTokens', 'budgetTokens', 'capabilityTasks']),
    usage: safeUsage(raw.usage), usageReported: raw.usageReported === true, usageIncomplete: raw.usageIncomplete === true, usageSaved: true,
    message: clean(raw.message), channel: { tps: timing(raw.channel?.tps), ttftMs: timing(raw.channel?.ttftMs) } }
  const metrics = (value, codes, keys) => value && codes.includes(value.verdict) ? { ...fields(value, keys), verdict: value.verdict, reason: clean(value.reason), pValue: timing(value.pValue) } : null
  job.identity = metrics(raw.identity, ['significant-difference', 'no-significant-difference', 'insufficient-evidence'], ['count', 'valid', 'mismatches', 'coverage', 'selfTotal', 'selfMismatches', 'selfCoverage', 'alpha', 'confidence', 'p0'])
  job.capability = metrics(raw.capability, ['current-sample', 'significant-decline', 'no-significant-decline', 'insufficient-evidence'], ['count', 'valid', 'passed', 'paired', 'losses', 'gains'])
  if (raw.reference) {
    const r = raw.reference
    job.reference = { id: clean(r.id), model: clean(r.model), provider: clean(r.provider), origin: ['public', 'imported', 'calibrated'].includes(r.origin) ? r.origin : 'imported', date: clean(r.date),
      ...fields(r, ['count', 'selfTotal', 'selfMismatches']), effort: clean(r.effort), hasCapabilities: r.hasCapabilities === true,
      ...(typeof r.source === 'string' && r.source.startsWith('https://github.com/Ooo0ption/KBF/blob/') ? { source: r.source.slice(0, 1024) } : {}) }
  }
  job.results = (Array.isArray(raw.results) ? raw.results : []).map(r => result(r, job))
  job.progress = job.results.length
  job.conclusion = summarizeModelTest(job)
  job.score = modelTestScore(job)
  return job
}
export function createModelTestHistory(path) {
  const usage = new Map(), jobs = new Map()
  let queue = Promise.resolve(), warning = ''
  try {
    const document = JSON.parse(readFileSync(path, 'utf8'))
    if (document.version !== 1 || !Array.isArray(document.usage) || !Array.isArray(document.jobs)) throw new Error('invalid')
    for (const raw of document.usage) {
      const job = { selection: modelSelection(raw.selection), startedAt: number(raw.startedAt), finishedAt: number(raw.finishedAt) }
      if (!clean(raw.id) || !job.selection || !Array.isArray(raw.results)) throw new Error('invalid')
      usage.set(clean(raw.id), { id: clean(raw.id), ...job, results: raw.results.map(r => result(r, job)) })
    }
    for (const raw of document.jobs.slice(-10)) {
      const job = jobSnapshot(raw)
      if (!job) continue
      if (job.status === 'running') {
        job.status = 'interrupted'; job.finishedAt = Date.now(); job.message = ''
        if (job.identity) job.identity = { ...job.identity, verdict: 'insufficient-evidence', reason: 'unfinished', pValue: null }
        if (job.capability) job.capability = { ...job.capability, verdict: 'insufficient-evidence', pValue: null }
        job.conclusion = summarizeModelTest(job)
        job.score = null
      }
      jobs.set(job.id, job)
    }
  } catch (error) { if (error.code !== 'ENOENT') warning = '检测记录无法读取，请检查本地记录后重新加载插件。' }
  return {
    warning: () => warning,
    latest(sessionId) { return [...jobs.values()].reverse().find(j => !sessionId || j.sessionId === sessionId) || null },
    get(id) { return jobs.get(id) || null },
    usage() { return [...usage.values()].flatMap(j => j.results) },
    async record(raw) {
      if (warning) throw new Error(warning)
      const job = jobSnapshot(raw)
      if (!job) throw new Error('invalid audit record')
      const prior = usage.get(job.id)
      // A late poll or repeated migration must never shrink or duplicate spend.
      if (prior && job.results.length < prior.results.length) return
      usage.set(job.id, { id: job.id, selection: job.selection, startedAt: job.startedAt, finishedAt: job.finishedAt, results: job.results })
      jobs.set(job.id, job)
      while (jobs.size > 10) jobs.delete(jobs.keys().next().value)
      const document = JSON.stringify({ version: 1, usage: [...usage.values()], jobs: [...jobs.values()] })
      const next = queue.catch(() => {}).then(async () => {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path + '.tmp', document, { mode: 0o600 })
        await rename(path + '.tmp', path)
      })
      queue = next
      await next
    },
  }
}
