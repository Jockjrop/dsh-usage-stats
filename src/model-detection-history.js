/** Reported detection usage and recent fingerprints. No prompts, answers or credentials. */
import { readFileSync } from 'node:fs'
import { mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { modelSelection, safeUsage, summarizeModelDetection, normalizeFingerprintIdentity } from './model-detection.js'

const clean = v => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 256) : ''
const number = v => Number.isFinite(v) && v >= 0 ? v : 0
const timing = v => Number.isFinite(v) && v >= 0 ? v : null
const states = ['running', 'complete', 'failed', 'cancelled', 'budget-exhausted', 'interrupted']
const outcomes = ['scored', 'unparseable', 'unavailable', 'timeout', 'incomplete', 'cancelled']
const fields = (value, keys) => Object.fromEntries(keys.filter(k => Number.isFinite(value?.[k]) && value[k] >= 0).map(k => [k, value[k]]))
function result(raw, job) {
  const selection = modelSelection(raw.selection) || (job.testSelection || job.selection)
  return { time: number(raw.time) || job.finishedAt || job.startedAt, selection,
    phase: 'fingerprint', outcome: outcomes.includes(raw.outcome) ? raw.outcome : 'unavailable', stop: clean(raw.stop),
    usage: safeUsage(raw.usage), usageReported: raw.usageReported === true,
    valid: number(raw.valid), expected: number(raw.expected), ttftMs: timing(raw.ttftMs), decodeMs: timing(raw.decodeMs) }
}
function jobSnapshot(raw) {
  const selection = modelSelection(raw?.selection)
  if (!selection || !clean(raw.id) || !states.includes(raw.status)) return null
  const job = { id: clean(raw.id), sessionId: clean(raw.sessionId), selection, testSelection: modelSelection(raw.testSelection),
    status: raw.status, phase: clean(raw.phase), startedAt: number(raw.startedAt), finishedAt: number(raw.finishedAt),
    plan: fields(raw.plan, ['requests', 'samples', 'maxTokens', 'maxOutputTokens', 'estimatedInputTokens', 'budgetTokens', 'timeoutMs']),
    usage: safeUsage(raw.usage), usageReported: raw.usageReported === true, usageIncomplete: raw.usageIncomplete === true, usageSaved: true,
    message: clean(raw.message), channel: { tps: timing(raw.channel?.tps), ttftMs: timing(raw.channel?.ttftMs) } }
  job.plan.numbers = (Array.isArray(raw.plan?.numbers) ? raw.plan.numbers : []).slice(0, 3).map(number)
  if (raw.engine) job.engine = { name: 'lmfpd', version: clean(raw.engine.version), revision: clean(raw.engine.revision), builtAt: clean(raw.engine.builtAt), modelCount: number(raw.engine.modelCount) }
  job.identity = normalizeFingerprintIdentity(raw.identity)
  job.results = (Array.isArray(raw.results) ? raw.results : []).map(r => result(r, job))
  job.progress = job.results.length
  job.conclusion = summarizeModelDetection(job)
  return job
}
export function createModelDetectionHistory(path) {
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
        job.identity = null
        job.conclusion = summarizeModelDetection(job)
      }
      jobs.set(job.id, job)
    }
  } catch (error) { if (error.code !== 'ENOENT') warning = '检测记录无法读取，请检查本地记录后重新加载插件。' }
  return {
    warning: () => warning,
    flush: () => queue.catch(() => {}),
    latest(sessionId) { return [...jobs.values()].reverse().find(j => !sessionId || j.sessionId === sessionId) || null },
    get(id) { return jobs.get(id) || null },
    usage() { return [...usage.values()].flatMap(j => j.results) },
    // Stable sample IDs let the statistics plugin replace repeated snapshots without double counting.
    usageRecords() { return [...usage.values()].flatMap(j => j.results.map((row, index) => ({ ...row, id: `${j.id}:${index}` }))) },
    async record(raw) {
      if (warning) throw new Error(warning)
      const job = jobSnapshot(raw)
      if (!job) throw new Error('invalid fingerprint record')
      const prior = usage.get(job.id)
      // A late poll or repeated save must never shrink or duplicate spend.
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
