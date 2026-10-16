import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertPublicFile, archiveName, archiveAlias, readReleaseMetadata, renderReleaseNotes, verifyArchives } from '../scripts/release-checks.mjs'

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'dsh-release-test-'))
  const relative = path.relative(tmpdir(), directory)
  assert.ok(relative.startsWith('dsh-release-test-') && !relative.includes(path.sep))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  for (const name of ['package.json', 'package-lock.json', 'CHANGELOG.md', 'README.md']) await fs.copyFile(new URL('../' + name, import.meta.url), path.join(directory, name))
  return directory
}

test('release privacy rejects runtime records and credentials even inside public directories', () => {
  for (const name of ['.env', '.env.local', 'lib/.env.example', 'locale/auth.json', 'third_party/credentials.yaml', 'third_party/.ssh/id_ed25519', 'screenshots/account.har', 'usage-stats-detections.json', 'usage-stats-detections.json.tmp', 'lib/models-hub-controls.json', 'storages/data.json', 'sessions/session.jsonl.zstd', 'sessions.sqlite-wal', 'cache.db-shm', 'credential.pem', 'request.log']) {
    if (name.endsWith('.env.example')) assert.throws(() => assertPublicFile(name, '', { packed: true }), /Unexpected package member/)
    else assert.throws(() => assertPublicFile(name), /Private/, name)
  }
})

test('release privacy rejects secrets and private user paths without exposing their contents', () => {
  for (const content of ['sk-' + 'A'.repeat(32), 'npm_' + 'B'.repeat(36), 'github_pat_' + 'C'.repeat(44), '-----BEGIN ' + 'PRIVATE KEY-----', 'C:' + '/Users/' + 'personal/profile', 'C:' + '\\\\Users\\\\' + 'personal\\\\profile', '/' + 'Users/' + 'personal/profile', '/' + 'home/' + 'personal/profile']) {
    assert.throws(() => assertPublicFile('README.md', content), error => /Sensitive content|Private key|Local user path/.test(error.message) && !error.message.includes(content))
  }
})

test('release privacy retains safe examples, provider API paths and license attribution', () => {
  for (const content of ['https://api.example.org/v1/users/me/balance', 'https://docs.example.org/home/guide', 'sk-example-' + 'X'.repeat(32), 'C:/Users/Example/project', 'Copyright (c) Example <author@example.org>']) assert.doesNotThrow(() => assertPublicFile('NOTICE', content))
  assert.doesNotThrow(() => assertPublicFile('.env.example', 'API_KEY=sk-example-placeholder'))
})

test('package members reject development files and path escapes', () => {
  for (const name of ['scripts/build.mjs', 'test/fixture.json', 'src/client.js', '../outside.json', '/absolute.json', 'third_party/../../outside.json', 'unrelated.md']) assert.throws(() => assertPublicFile(name, '', { packed: true }))
  for (const name of ['README.md', 'README.en.md', 'lib/index.js', 'locale/zh.json', 'third_party/lm-fingerprint/LICENSE', 'screenshots/usage.png']) assert.doesNotThrow(() => assertPublicFile(name, '', { packed: true }))
})

test('release metadata rejects mismatched tags and lockfile versions', async t => {
  const directory = await fixture(t)
  const { pkg } = await readReleaseMetadata(directory)
  await readReleaseMetadata(directory, { tag: 'v' + pkg.version })
  await assert.rejects(readReleaseMetadata(directory, { tag: 'v0.0.0' }), /Release tag/)
  const lock = JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'), 'utf8'))
  lock.packages[''].version = '0.0.0'
  await fs.writeFile(path.join(directory, 'package-lock.json'), JSON.stringify(lock))
  await assert.rejects(readReleaseMetadata(directory), /Lockfile package version/)
})

test('release metadata rejects stale notes and accepts Windows line endings', async t => {
  const directory = await fixture(t)
  const file = path.join(directory, 'CHANGELOG.md'), original = await fs.readFile(file, 'utf8')
  await fs.writeFile(file, original.replace(/\r?\n/g, '\r\n'))
  await readReleaseMetadata(directory)
  await fs.writeFile(file, original.replace(/^## \S+/m, '## 0.0.0'))
  await assert.rejects(readReleaseMetadata(directory), /Latest changelog version/)
})

test('release metadata accepts the HTML layout and rejects English as the primary introduction', async t => {
  const directory = await fixture(t)
  await readReleaseMetadata(directory)
  const filename = path.join(directory, 'README.md'), readme = await fs.readFile(filename, 'utf8')
  await fs.writeFile(filename, readme.replace(/<strong>[^<]+<\/strong>/, '<strong>See your token usage inside DSH.</strong>'))
  await assert.rejects(readReleaseMetadata(directory), /README.md must use Chinese first/)
})

test('release notes keep Chinese first and English changes without installation instructions', async t => {
  const directory = await fixture(t), { pkg, notes } = await readReleaseMetadata(directory)
  const rendered = renderReleaseNotes(notes)
  assert.ok(rendered.startsWith("## 本次更新 / What's changed\n"))
  assert.ok(!rendered.includes('## ' + pkg.version + ' - '))
  assert.match(rendered, /\*\*简体中文\*\*[\s\S]*\*\*English\*\*/)
  assert.doesNotMatch(rendered, /^## 安装|Optional prebuilt archive|Plugins → Add plugin|可选预构建安装包/m)
  for (const host of pkg.peerDependencies['@deepseek-ai/dsh'].split(' || ')) assert.ok(rendered.includes(host))
})

test('verified archives reject tampered bytes and stale checksums', async t => {
  const directory = await fixture(t), { pkg } = await readReleaseMetadata(directory)
  const bytes = Buffer.from('verified synthetic archive'), digest = createHash('sha256').update(bytes).digest('hex')
  for (const name of [archiveName(pkg), archiveAlias]) await fs.writeFile(path.join(directory, name), bytes)
  const sums = path.join(directory, 'SHA256SUMS')
  await fs.writeFile(sums, `${digest}  ${archiveName(pkg)}\n${digest}  ${archiveAlias}\n`)
  assert.equal(await verifyArchives(directory, pkg), path.join(directory, archiveName(pkg)))
  await fs.writeFile(path.join(directory, archiveAlias), 'changed')
  await assert.rejects(verifyArchives(directory, pkg), /archives differ/)
  await fs.writeFile(path.join(directory, archiveAlias), bytes)
  await fs.writeFile(sums, 'stale checksums\n')
  await assert.rejects(verifyArchives(directory, pkg), /checksums differ/)
})
