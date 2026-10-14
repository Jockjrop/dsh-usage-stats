import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { build } from './build.mjs'
import { archiveName, archiveAlias, assertPublicFile, checkRelease, renderReleaseNotes, verifyArchives } from './release-checks.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const npmCli = process.env.npm_execpath
assert.ok(npmCli, 'Run this through npm run release')
build(root)
const { notes } = await checkRelease(root, process.env.GITHUB_REF_TYPE === 'tag' ? { tag: process.env.GITHUB_REF_NAME } : {})
const output = path.join(root, 'release')
await fs.mkdir(output, { recursive: true })
const metadata = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', output], { cwd: root, encoding: 'utf8' }))
const packed = Array.isArray(metadata) ? metadata[0] : metadata[pkg.name] ?? metadata
const filename = archiveName(pkg)
assert.equal(packed.filename, filename)
assert.equal(packed.name, pkg.name)
assert.equal(packed.version, pkg.version)
for (const file of packed.files) {
  const content = /\.(?:[cm]?js|json|md|ya?ml|txt|svg)$|(?:^|\/)(?:LICENSE|NOTICE)$/.test(file.path)
    ? await fs.readFile(path.join(root, file.path), 'utf8') : ''
  assertPublicFile(file.path, content, { packed: true })
}
const fixture = await fs.mkdtemp(path.join(tmpdir(), 'dsh-usage-package-'))
try {
  await fs.writeFile(path.join(fixture, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  // npm run's allow-scripts setting is invalid for a child project install in npm 12.
  // Consumer installation still explicitly disables every lifecycle script.
  const installEnv = { ...process.env }
  for (const key of Object.keys(installEnv)) if (/^npm_config_allow_scripts$/i.test(key)) delete installEnv[key]
  execFileSync(process.execPath, [npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', path.join(output, filename)], { cwd: fixture, env: installEnv, stdio: 'pipe' })
  const installed = path.join(fixture, 'node_modules', ...pkg.name.split('/'))
  const installedPackage = JSON.parse(await fs.readFile(path.join(installed, 'package.json'), 'utf8'))
  assert.equal(installedPackage.name, pkg.name)
  assert.equal(installedPackage.version, pkg.version)
  for (const file of packed.files) assert.deepEqual(await fs.readFile(path.join(installed, file.path)), await fs.readFile(path.join(root, file.path)), 'Installed member differs: ' + file.path)
  const plugin = await import(pathToFileURL(path.join(installed, pkg.main)).href)
  assert.equal(typeof plugin.apply, 'function')
  plugin.apply({ get(name) { assert.equal(name, 'profileContext'); return { name: 'web' } } })
  const { verifyEngine, openEngine } = await import(pathToFileURL(path.join(installed, 'lib/lm-fingerprint-engine.js')).href)
  const enginePath = path.join(installed, 'third_party/lm-fingerprint')
  const manifest = await verifyEngine(enginePath)
  const engine = openEngine(enginePath, manifest)
  try { await engine.ready; assert.equal(engine.models.length, manifest.modelCount) } finally { engine.dispose() }
  let client
  vm.runInNewContext(await fs.readFile(path.join(installed, 'lib/client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load(definition) { assert.equal(definition.id, pkg.name); client = definition.factory(() => ({})) } } }, console, URLSearchParams,
  })
  assert.equal(typeof client.apply, 'function')
  client.apply({ get() { assert.fail('A browser must not mount a desktop plugin') } })
} finally {
  const relative = path.relative(tmpdir(), fixture)
  assert.ok(relative.startsWith('dsh-usage-package-') && !relative.includes(path.sep))
  await fs.rm(fixture, { recursive: true, force: true })
}
const hash = createHash('sha256').update(await fs.readFile(path.join(output, filename))).digest('hex')
await fs.copyFile(path.join(output, filename), path.join(output, archiveAlias))
await fs.writeFile(path.join(output, 'SHA256SUMS'), `${hash}  ${filename}\n${hash}  ${archiveAlias}\n`)
await fs.writeFile(path.join(output, 'RELEASE_NOTES.txt'), renderReleaseNotes(notes))
await verifyArchives(output, pkg)
console.log('Verified prebuilt package installation: release/' + filename)
