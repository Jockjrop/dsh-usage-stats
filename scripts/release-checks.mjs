import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { renderClient } from './build.mjs'
import { verifyEngine } from '../src/lm-fingerprint-engine.js'

export const archiveName = pkg => `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`
export const archiveAlias = 'dsh-usage-stats.tgz'
const templates = new Set(['client.js', 'reasoning-settings.js', 'account-quotas-client.js', 'quota-brand-icons.js'])
const packageFiles = new Set(['package.json', 'cordis.patch.yml', 'README.md', 'README.en.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE', 'screenshots/icon.svg'])
const privateDirectories = /(?:^|\/)(?:storages|sessions|credentials|\.dsh|\.workbuddy|\.codex|\.ssh|\.local-archive|\.p0-evidence|usage-stats-lm-fingerprint)(?:\/|$)/i
const privateNames = /^(?:\.env(?:\..+)?|\.npmrc|\.?auth\.(?:json|ya?ml)|\.?credentials?\.(?:json|ya?ml)|secrets?\.(?:json|ya?ml)|tokens?\.json|id_rsa|id_ed25519|(?:usage-stats|models-hub)-.+\.json(?:l)?(?:\..+)?)$/i
const temporaryNames = /\.(?:log|bak|tmp|tgz|har|sqlite(?:-.*)?|db(?:-.*)?|pem|key|p12|pfx|jsonl(?:\.zstd)?)$/i

export function assertPublicFile(filename, content = '', { packed = false } = {}) {
  const name = filename.replaceAll('\\', '/')
  assert.ok(name && !path.posix.isAbsolute(name) && !/^[a-z]:/i.test(name) && !name.split('/').includes('..'), 'Invalid release path: ' + filename)
  const base = path.posix.basename(name)
  assert.ok(!privateDirectories.test(name) && !(privateNames.test(base) && base !== '.env.example'), 'Private file: ' + name)
  assert.ok(!temporaryNames.test(base), 'Private or temporary file: ' + name)
  if (packed) {
    assert.ok(packageFiles.has(name) || /^(?:lib\/[^/]+\.js|locale\/[^/]+\.json|third_party\/.+|screenshots\/(?:usage|quotas|detection|controls)\.png)$/.test(name), 'Unexpected package member: ' + name)
    assert.ok(!/(?:^|\/)(?:src|test|scripts|node_modules|\.git|release)(?:\/|$)/.test(name), 'Development package member: ' + name)
  }
  const text = String(content)
  assert.ok(!/\b(?:sk-(?!test|fake|example)[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|npm_[A-Za-z0-9]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/.test(text), 'Sensitive content: ' + name)
  assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(text), 'Private key: ' + name)
  assert.ok(!/[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}(?!Public\b|Example\b|Username\b)[^\\/\s'"<>]+/i.test(text), 'Local user path: ' + name)
  assert.ok(!/(?<![A-Za-z0-9:/])\/(?:Users|home)\/(?!example\b|username\b)[^/\s'"<>]+/.test(text), 'Local user path: ' + name)
}

export async function readReleaseMetadata(directory, { tag } = {}) {
  const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
  const lock = JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'), 'utf8'))
  for (const entry of [lock, lock.packages?.['']]) {
    assert.equal(entry?.name, pkg.name, 'Lockfile package name differs')
    assert.equal(entry?.version, pkg.version, 'Lockfile package version differs')
  }
  for (const key of ['dependencies', 'peerDependencies', 'peerDependenciesMeta']) assert.deepEqual(lock.packages[''][key], pkg[key], 'Lockfile differs: ' + key)
  if (tag !== undefined) assert.equal(tag, 'v' + pkg.version, 'Release tag must match package.json')
  const changelog = (await fs.readFile(path.join(directory, 'CHANGELOG.md'), 'utf8')).replaceAll('\r\n', '\n')
  const notes = changelog.match(/^## ([^\s]+) - \d{4}-\d{2}-\d{2}\n[\s\S]*?(?=^## |$(?![\s\S]))/m)
  assert.equal(notes?.[1], pkg.version, 'Latest changelog version differs')
  const readme = await fs.readFile(path.join(directory, 'README.md'), 'utf8')
  const introduction = readme.split(/^## /m, 1)[0]
  const firstSentence = introduction.match(/<strong>([^<]+)<\/strong>/)?.[1]
    || introduction.replace(/^#.*$/gm, '').split(/\r?\n/).find(line => line.trim())
  assert.match(firstSentence || '', /[\u4e00-\u9fff]/, 'README.md must use Chinese first')
  assert.ok(readme.includes('**' + pkg.version + '**'), 'README version differs')
  return { pkg, notes: notes[0].trim() + '\n' }
}

export function renderReleaseNotes(notes) {
  const changes = notes.slice(notes.indexOf('\n') + 1).trim()
  assert.ok(changes, 'Current release notes must not be empty')
  return "## 本次更新 / What's changed\n\n" + changes + '\n'
}

async function filesUnder(directory, relative = '', skip = new Set()) {
  const files = []
  for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
    if (!relative && skip.has(entry.name)) continue
    const filename = relative ? relative + '/' + entry.name : entry.name
    assert.ok(!entry.isSymbolicLink(), 'Symlink in release inputs: ' + filename)
    if (entry.isDirectory()) files.push(...await filesUnder(directory, filename))
    else files.push(filename)
  }
  return files.sort()
}

export async function checkRelease(directory, options = {}) {
  const metadata = await readReleaseMetadata(directory, options)
  const files = await filesUnder(directory, '', new Set(['.git', 'node_modules', 'release']))
  for (const filename of files) {
    const text = /\.(?:[cm]?js|json|md|ya?ml|txt|svg)$|(?:^|\/)(?:LICENSE|NOTICE|\.gitignore|\.gitattributes)$/.test(filename)
      ? await fs.readFile(path.join(directory, filename), 'utf8') : ''
    assertPublicFile(filename, text)
  }
  const sources = (await filesUnder(path.join(directory, 'src'))).filter(filename => !templates.has(filename))
  assert.deepEqual(await filesUnder(path.join(directory, 'lib')), [...sources, 'client.js'].sort(), 'Unexpected or missing lib files')
  for (const filename of sources) assert.deepEqual(await fs.readFile(path.join(directory, 'src', filename)), await fs.readFile(path.join(directory, 'lib', filename)), 'Stale build: lib/' + filename)
  assert.equal(await fs.readFile(path.join(directory, 'lib/client.js'), 'utf8'), renderClient(directory), 'Stale client build')
  await verifyEngine(path.join(directory, 'third_party/lm-fingerprint'))
  for (const filename of ['LICENSE', 'NOTICE', 'README.en.md', 'cordis.patch.yml', ...['en', 'zh', 'ja'].map(locale => `locale/${locale}.json`), ...['usage', 'quotas', 'detection', 'controls'].map(tab => `screenshots/${tab}.png`)]) await fs.access(path.join(directory, filename))
  return metadata
}

export async function verifyArchives(directory, pkg) {
  const names = [archiveName(pkg), archiveAlias]
  const digests = await Promise.all(names.map(async name => createHash('sha256').update(await fs.readFile(path.join(directory, name))).digest('hex')))
  assert.equal(digests[0], digests[1], 'Versioned and generic archives differ')
  const expected = names.map((name, index) => `${digests[index]}  ${name}\n`).join('')
  assert.equal(await fs.readFile(path.join(directory, 'SHA256SUMS'), 'utf8'), expected, 'Archive checksums differ')
  return path.join(directory, names[0])
}
