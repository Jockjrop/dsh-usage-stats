import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRelease } from './release-checks.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--tag'), 'Usage: npm run check:release -- [--tag v<version>]')
const { pkg } = await checkRelease(root, args.length ? { tag: args[1] } : {})
console.log(`Release checks passed: ${pkg.name}@${pkg.version} (versions, privacy, builds and third-party integrity).`)
