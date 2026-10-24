#!/usr/bin/env node
/**
 * Dependency-free lint gate: syntax-check every source file, validate JSON
 * documents, and enforce the renderer translation table's shape. Keeps CI
 * honest without pulling a full ESLint toolchain into a zero-devDependency repo.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const fail = message => failures.push(message)

function filesUnder(relative) {
  const found = []
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = relative + '/' + entry.name
    if (entry.isDirectory()) found.push(...filesUnder(name))
    else if (/\.(?:mjs|js)$/.test(entry.name)) found.push(name)
  }
  return found
}

for (const file of ['src', 'scripts', 'test'].flatMap(filesUnder)) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' })
  } catch (error) {
    fail('syntax: ' + file + '\n' + String(error.stderr || error.message).trim())
  }
}

for (const file of ['package.json', 'package-lock.json', ...['zh', 'en', 'ja'].map(locale => `locale/${locale}.json`)]) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
  } catch (error) {
    fail('json: ' + file + ': ' + error.message)
  }
}

const table = fs.readFileSync(path.join(root, 'src/client-messages.js'), 'utf8')
const entries = new Map()
for (const line of table.split('\n')) {
  const match = /^\s*(['"])(.+?)\1\s*:\s*\[(.*)\]\s*,?\s*$/.exec(line)
  if (!match) continue
  const key = match[2]
  if (entries.has(key)) fail('duplicate message key: ' + key)
  // The Chinese source string is the key; each entry supplies [en, ja].
  const translations = [...match[3].matchAll(/(['"])(?:\\.|(?!\1).)*\1/g)].length
  if (translations !== 2) fail(`message "${key}" has ${translations} translations, expected 2 (en/ja; zh is the key)`)
  entries.set(key, true)
}
if (entries.size < 100) fail('renderer translation table looks truncated (' + entries.size + ' entries)')

const bundle = path.join(root, 'lib/client.js')
if (fs.existsSync(bundle) && /^\s*\/\/ __DSH_[A-Z_]+__\s*$/m.test(fs.readFileSync(bundle, 'utf8'))) {
  fail('unresolved bundle marker in lib/client.js')
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log('Lint passed: syntax, JSON documents and ' + entries.size + ' translation keys.')
}
