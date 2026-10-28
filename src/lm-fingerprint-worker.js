/** The worker loads upstream code and data together; no network or credentials. */
import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const root = workerData.directory
const [challenge, fingerprint, scorer, codec] = await Promise.all(
  ['challenge-browser', 'fingerprint-core', 'shared-detector', 'detector-codec'].map(name => import(pathToFileURL(join(root, 'core', name + '.mjs')).href)))
const bank = JSON.parse(await readFile(join(root, 'data', 'unified_bank.json'), 'utf8'))
const detector = codec.decodeDetector(await readFile(join(root, 'data', 'shared_detector.bin')))
if (!scorer.supportsSharedDetector(bank, detector)) throw new Error('参考库与检测器不匹配。')
const models = bank.models.map(m => ({ id: m.id, name: m.display_name, family: m.family }))
// Exercise the numerical interface before activating an update. No model calls.
// Alternating extremes produce no tool-like small steps, so newer upstream
// releases that reject regular sequences still rank this fixture.
const fixture = Array.from({ length: 300 }, (_, index) => index % 2 ? 355 : 1).join(',')
const check = scorer.analyzeSharedOutputs(Array.from({ length: 3 }, () => ({ text: fixture, expected_count: 300 })), bank, detector)
// Older releases always return a full ranking; newer ones may classify this
// fixture as an unusual distribution and return an empty ranking with a decision.
if (!check || !Array.isArray(check.results) || !check.results.length && typeof check.decision !== 'string' ||
    check.results.some(r => typeof r.model !== 'string' || !Number.isFinite(r.score)) ||
    check.probability !== null && (!Number.isFinite(check.probability) || check.probability < 0 || check.probability > 1)) throw new Error('上游检测接口不兼容。')
const challenges = challenge.generateChallenges(3)
if (challenges.length !== 3 || challenges.some(c => typeof c.prompt !== 'string' || !Number.isInteger(c.expected_count) || c.expected_count < 80 || c.expected_count > 500)) throw new Error('上游挑战接口不兼容。')
parentPort.postMessage({ ready: true, models, builtAt: bank.built_at })
parentPort.on('message', ({ id, operation, value }) => {
  try {
    let result
    if (operation === 'challenges') result = challenge.generateChallenges(value)
    else if (operation === 'parse') result = fingerprint.parseNumbers(value)
    else if (operation === 'score') result = scorer.analyzeSharedOutputs(value, bank, detector, { allowPartial: true })
    else throw new Error('Unsupported engine operation')
    parentPort.postMessage({ id, result })
  } catch { parentPort.postMessage({ id, error: '指纹评分失败，请检查引擎版本或有效样本。' }) }
})
