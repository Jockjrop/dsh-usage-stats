// Refresh public data deliberately; runtime never downloads references or runs probes.
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const commit = '68aefbbab879469152aaac9fd988a86c30ee4739'
const root = `https://raw.githubusercontent.com/Ooo0ption/KBF/${commit}/`
async function read(path) {
  const response = await fetch(root + path)
  if (!response.ok) throw new Error(`Reference download failed: ${path} (${response.status})`)
  return response.text()
}
const names = ['claude-fable-5.1_20260911', 'claude-opus-4.6_20260912', 'claude-opus-5_20260911', 'claude-sonnet-4.6_20260912',
  'deepseek-v3.2_20260912', 'deepseek-v4-pro-0813_20260911', 'deepseek-v4.1-flash_20260911', 'gemini-2.5-flash-lite_20260918',
  'gemini-3-flash-preview_20260912', 'glm-4.7_20260913', 'glm-5.3_20260911', 'glm-5_20260912', 'gpt-4.1-mini_20260915',
  'gpt-4.1-nano_20260918', 'gpt-5.4-mini_20260916', 'gpt-5.4_20260913', 'gpt-5.6-luna_20260915', 'gpt-5.6-sol_20260912',
  'gpt-6-astra_20260910', 'hy4-preview_20260911', 'kimi-k2-0905_20260912', 'kimi-k3_20260912', 'llama-4-scout_20260918',
  'minimax-m3_20260911', 'qwen3.5-27b_20260913', 'qwen3.5-397b-a17b_20260912', 'qwen3.5-9b_20260913', 'seed-2-1-turbo_20260911'].map(name => name + '.json')
const [domainSource, license, ...files] = await Promise.all([read('scripts/domains.py'), read('LICENSE'), ...names.map(name => read('probes/reference_202609/' + name))])
const domains = {}
for (const match of domainSource.matchAll(/"(\w+)": \{\s*"name": "([^"]+)"[\s\S]*?"tolerance": ([\d.e+-]+), "tolerance_mode": "(absolute|relative)",[\s\S]*?"value_range": \(([^,]+), ([^)]+)\),[\s\S]*?"cloze_template": "([^"]+)"/g)) {
  domains[match[1]] = { name: match[2], tolerance: Number(match[3]), mode: match[4], range: [Number(match[5]), Number(match[6])], template: match[7] }
}
if (Object.keys(domains).length < 10 || names.length !== 28) throw new Error('Unexpected reference/domain schema')
const references = files.map((text, i) => {
  const data = JSON.parse(text), model = data.reference_model
  const self = data.target_results?.[model.split('/').pop()]
  if (!self || !Array.isArray(self.match_vector) || self.match_vector.length !== data.probes.length) throw new Error('Missing per-probe calibration: ' + names[i])
  if (data.probes.some(probe => !domains[probe.domain])) throw new Error('Unknown domain')
  return { id: 'kbf/' + names[i].replace('.json', ''), model, provider: data.provider_map?.[model] || 'Unspecified',
    date: data.timestamp, source: `https://github.com/Ooo0ption/KBF/blob/${commit}/probes/reference_202609/${names[i]}`,
    sha256: createHash('sha256').update(text).digest('hex'),
    config: { system: self.test_config?.sys || "Follow the user's instructions exactly. Output only what is requested.", temperature: self.test_config?.temp ?? 0, reasoningEffort: 'off' },
    probes: data.probes.map((probe, j) => ({ domain: probe.domain, name: probe.name, value: probe.cloze_consensus ?? probe.value, calibration: self.match_vector[j] })) }
})
const output = new URL('../src/fingerprints/', import.meta.url)
await mkdir(output, { recursive: true })
await writeFile(new URL('kbf-202609.json', output), JSON.stringify({ version: 1, commit, domains, references }) + '\n')
await writeFile(new URL('KBF-LICENSE.txt', output), license)
await writeFile(new URL('NOTICE.txt', output), `KBF reference probes, domain definitions and prompt format\nCopyright 2026 The KBF Authors. Apache License 2.0.\nSource: https://github.com/Ooo0ption/KBF\nPinned revision: ${commit}\nThe reference files were reduced to the fields needed by this plugin.\nReference provenance is recorded per model; third-party references are not official attestations.\n`)
console.log(`Bundled ${references.length} references, ${references.reduce((n, r) => n + r.probes.length, 0)} probes and ${Object.keys(domains).length} domains.`)
