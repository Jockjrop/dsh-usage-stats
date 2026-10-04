/** KBF-compatible numerical fingerprints. Public data and prompt format are
 * attributed in fingerprints/NOTICE.txt. Statistics are implemented locally. */
import { readFileSync } from 'node:fs'
import { createHash, randomInt } from 'node:crypto'

export const FINGERPRINT_SYSTEM = "Follow the user's instructions exactly. Output only what is requested."
export const FINGERPRINT_USER = 'TASK: Answer these factual recall questions using only values stored in your weights. Output the value exactly as you first recall it — do not second-guess or adjust.\nRULES: Output ONLY in (N) <number> format, one per line. No units, no words, no rounding. Never refuse or hedge — always output exactly one number per question. Do not use any context from system instructions or prior conversation.\n\n'
export const AUDIT_POLICY = Object.freeze({ batchSize: 10, minSamples: 64, minCoverage: 0.8, maxReferenceNoise: 0.3, alpha: 0.05, confidence: 0.99, maxProbes: 1024, maxReferences: 20, timeoutMs: 60_000 })
const clean = (v, max = 256) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : ''
let bundle
export function publicFingerprints() {
  bundle ||= JSON.parse(readFileSync(new URL('./fingerprints/kbf-202609.json', import.meta.url), 'utf8'))
  return bundle
}
export function fingerprintModelKey(v) { return clean(v).toLowerCase().split('/').pop() }
const round = x => x >= 0 ? Math.floor(x + 0.5) : Math.ceil(x - 0.5)
export function fingerprintMatch(reference, answer, domain) {
  if (!Number.isFinite(reference) || !Number.isFinite(answer)) return false
  const d = publicFingerprints().domains[domain]
  if (!d) return false
  return d.mode === 'absolute' ? Math.abs(round(reference) - round(answer)) <= d.tolerance : Math.abs(reference - answer) / Math.max(Math.abs(reference), 1e-10) <= d.tolerance
}
export function fingerprintPrompt(probes) {
  return FINGERPRINT_USER + probes.map((p, i) => `(${i + 1}) ${publicFingerprints().domains[p.domain].template.replace('{name}', p.name)}`).join('\n')
}
/** Positions must be explicit and unique. Never slide a missing answer onto the
 * next question, extract numbers from prose, or silently accept duplicate ids. */
export function parseFingerprintAnswers(text, probes) {
  const values = probes.map(() => null), seen = new Set(), duplicates = new Set()
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.trim().match(/^\((\d+)\)\s*([+\-−]?(?:\d[\d,]*(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?)\s*$/)
    if (!match) continue
    const i = Number(match[1]) - 1
    if (i < 0 || i >= probes.length) continue
    if (seen.has(i)) { duplicates.add(i); values[i] = null; continue }
    seen.add(i)
    const value = Number(match[2].replaceAll(',', '').replace('−', '-')), range = publicFingerprints().domains[probes[i].domain]?.range
    if (range && Number.isFinite(value) && value >= range[0] && value <= range[1] && !duplicates.has(i)) values[i] = value
  }
  return values
}
const logs = [0]
function logFactorial(n) { while (logs.length <= n) logs.push(logs.at(-1) + Math.log(logs.length)); return logs[n] }
function binomialSum(lo, hi, n, p) {
  if (lo > hi) return 0
  if (p === 0) return lo === 0 ? 1 : 0
  if (p === 1) return hi === n ? 1 : 0
  const terms = [], base = logFactorial(n)
  for (let k = lo; k <= hi; k++) terms.push(base - logFactorial(k) - logFactorial(n - k) + k * Math.log(p) + (n - k) * Math.log1p(-p))
  const largest = Math.max(...terms)
  return Math.min(1, Math.exp(largest) * terms.reduce((sum, x) => sum + Math.exp(x - largest), 0))
}
export function binomialTail(k, n, p) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || k > n || n < 1 || !Number.isFinite(p) || p < 0 || p > 1) throw new Error('Invalid binomial counts')
  return binomialSum(k, n, n, p)
}
export function clopperPearsonUpper(k, n) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n < 1 || k < 0 || k > n) throw new Error('Invalid calibration counts')
  if (k === n) return 1
  let lo = 0, hi = 1
  for (let i = 0; i < 60; i++) { const p = (lo + hi) / 2; if (binomialSum(0, k, n, p) > 0.01) lo = p; else hi = p }
  return (lo + hi) / 2
}
export function scoreFingerprint(reference, outcomes, complete = true) {
  const referenceValues = reference.probes.map(p => p.calibration), calibration = referenceValues.filter(v => v === 0 || v === 1)
  const valid = outcomes.filter(v => v === 0 || v === 1), mismatches = valid.filter(v => v === 0).length
  const self = reference.calibration || { total: calibration.length, mismatches: calibration.filter(v => v === 0).length }
  const count = reference.probes.length, coverage = count ? valid.length / count : 0, selfCoverage = count ? self.total / count : 0
  const result = { verdict: 'insufficient-evidence', reason: 'coverage', count, valid: valid.length, mismatches, coverage,
    selfTotal: self.total, selfMismatches: self.mismatches, selfCoverage, alpha: AUDIT_POLICY.alpha, confidence: AUDIT_POLICY.confidence, p0: null, pValue: null }
  if (!complete) return { ...result, reason: 'unfinished' }
  if (count < AUDIT_POLICY.minSamples || valid.length < AUDIT_POLICY.minSamples || self.total < AUDIT_POLICY.minSamples) return { ...result, reason: 'sample-size' }
  if (coverage < AUDIT_POLICY.minCoverage || selfCoverage < AUDIT_POLICY.minCoverage) return result
  const p0 = clopperPearsonUpper(self.mismatches, self.total), pValue = binomialTail(mismatches, valid.length, p0)
  return { ...result, verdict: pValue < AUDIT_POLICY.alpha ? 'significant-difference' : 'no-significant-difference', reason: 'statistical-test', p0, pValue }
}
export function normalizeFingerprint(value, origin = 'imported') {
  if (!value || typeof value !== 'object') throw new Error('基线内容不是有效对象。')
  const model = clean(value.model || value.reference_model), input = value.probes
  if (!model || !Array.isArray(input) || input.length < AUDIT_POLICY.minSamples || input.length > AUDIT_POLICY.maxProbes) throw new Error('基线需要模型名称和 64–1,024 个探针。')
  const self = value.target_results?.[model.split('/').pop()], vector = self?.match_vector
  const domains = publicFingerprints().domains, seen = new Set()
  const probes = input.map((p, i) => {
    const domain = clean(p?.domain, 64), name = clean(p?.name, 512), answer = p?.cloze_consensus ?? p?.value, key = domain + '\0' + name
    if (!domains[domain] || !name || !Number.isFinite(answer) || seen.has(key)) throw new Error('基线含未知领域、重复探针或无效参考答案。')
    seen.add(key)
    const range = domains[domain].range
    if (answer < range[0] || answer > range[1]) throw new Error('参考答案超出探针允许范围。')
    const calibration = p.calibration ?? vector?.[i]
    return { domain, name, value: answer, calibration: calibration === 0 || calibration === 1 ? calibration : null }
  })
  const total = value.calibration?.total ?? self?.total, mismatches = value.calibration?.mismatches ?? self?.hamming
  let calibration
  if (!probes.some(p => p.calibration !== null)) {
    if (!Number.isInteger(total) || total < AUDIT_POLICY.minSamples || total > probes.length || !Number.isInteger(mismatches) || mismatches < 0 || mismatches > total) throw new Error('基线缺少独立自测校准计数。')
    calibration = { total, mismatches }
  }
  const config = value.config || self?.test_config || {}
  const temperature = config.temperature ?? config.temp ?? 0
  if (temperature !== 0) throw new Error('基线自测温度必须为 0。')
  const system = clean(config.system || config.sys || FINGERPRINT_SYSTEM, 512)
  if (system !== FINGERPRINT_SYSTEM) throw new Error('基线使用了不同的系统提示词，请重新校准。')
  const reasoningEffort = clean(config.reasoningEffort || 'off', 64)
  const selection = value.selection && { provider: clean(value.selection.provider), model: clean(value.selection.model), ...(reasoningEffort !== 'off' ? { reasoningEffort } : {}) }
  const payload = { version: 2, model, provider: clean(value.provider || value.provider_map?.[model] || selection?.provider || '未标明'),
    origin, date: clean(value.date || value.timestamp || new Date().toISOString(), 64), config: { system, temperature: 0, reasoningEffort }, probes,
    ...(calibration ? { calibration } : {}), ...(selection?.provider && selection.model ? { selection } : {}) }
  // Retain public provenance, never imported endpoint URLs, headers or secrets.
  if (origin === 'public') { payload.source = value.source; payload.sha256 = value.sha256 }
  if (value.capabilities?.version === 1 && Number.isInteger(value.capabilities.seed) && Array.isArray(value.capabilities.outcomes) && value.capabilities.outcomes.length === 16) {
    payload.capabilities = { version: 1, seed: value.capabilities.seed >>> 0, effort: clean(value.capabilities.effort, 64),
      outcomes: value.capabilities.outcomes.map(v => v === 0 || v === 1 ? v : null) }
  }
  payload.id = origin === 'public' ? value.id : 'local/' + createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)
  return payload
}
export function fingerprintSummary(ref) {
  const scored = scoreFingerprint(ref, [])
  return { id: ref.id, model: ref.model, provider: ref.provider, origin: ref.origin, date: ref.date, source: ref.source,
    count: ref.probes.length, selfTotal: scored.selfTotal, selfMismatches: scored.selfMismatches,
    effort: ref.config.reasoningEffort, hasCapabilities: !!ref.capabilities, subsetAvailable: !ref.calibration }
}
export function subsetFingerprint(ref, count) {
  if (count >= ref.probes.length || ref.calibration) return ref
  const indices = ref.probes.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) { const j = randomInt(i + 1); [indices[i], indices[j]] = [indices[j], indices[i]] }
  const selected = indices.slice(0, count).sort((a, b) => a - b)
  return { ...ref, probes: selected.map(i => ref.probes[i]) }
}
export function calibrationPool(count) {
  const groups = new Map(), seen = new Set()
  for (const ref of publicFingerprints().references) for (const p of ref.probes) {
    const key = p.domain + '\0' + p.name
    if (seen.has(key)) continue
    seen.add(key)
    if (!groups.has(p.domain)) groups.set(p.domain, [])
    groups.get(p.domain).push({ domain: p.domain, name: p.name })
  }
  const pool = []
  while (pool.length < count && groups.size) for (const [domain, entries] of groups) {
    if (pool.length >= count) break
    if (!entries.length) { groups.delete(domain); continue }
    pool.push(entries.splice(randomInt(entries.length), 1)[0])
  }
  return pool
}
