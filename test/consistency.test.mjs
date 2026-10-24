import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderClient } from '../scripts/build.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
assert.equal(fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8'), renderClient(root), 'Client build must match its canonical sources')
const templates = new Set(['client.js', 'client-messages.js', 'client-styles.js', 'client-format.js', 'reasoning-settings.js', 'account-quotas-client.js', 'quota-brand-icons.js'])
function compare(source, target) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (source === path.join(root, 'src') && templates.has(entry.name)) continue
    const from = path.join(source, entry.name), to = path.join(target, entry.name)
    if (entry.isDirectory()) compare(from, to)
    else assert.deepEqual(fs.readFileSync(to), fs.readFileSync(from), 'Stale build: ' + to)
  }
}
compare(path.join(root, 'src'), path.join(root, 'lib'))
console.log('Source and lib/ are consistent.')
