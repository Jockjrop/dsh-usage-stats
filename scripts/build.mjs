import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templates = new Set(['client.js', 'reasoning-settings.js', 'account-quotas-client.js', 'quota-brand-icons.js'])

export function renderClient(directory = root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
  let client = fs.readFileSync(path.join(directory, 'src/client.js'), 'utf8')
    .replace("var PLUGIN_VERSION = '__DSH_USAGE_STATS_VERSION__'", 'var PLUGIN_VERSION = ' + JSON.stringify(pkg.version))
    .replace("id: '__DSH_USAGE_STATS_PACKAGE__'", 'id: ' + JSON.stringify(pkg.name))
    .replaceAll('__DSH_USAGE_STATS_PACKAGE__', pkg.name)
  const inline = (marker, filename, factory, brandFile) => {
    if (!client.includes('// ' + marker)) return
    let module = fs.readFileSync(path.join(directory, 'src', filename), 'utf8')
    if (brandFile) module = module.replace(/^import \{ BRAND_ICONS \} from '[^']+'\r?\n/m,
      fs.readFileSync(path.join(directory, 'src', brandFile), 'utf8').replace('export const BRAND_ICONS', 'const BRAND_ICONS') + '\n')
    module = module.replace('export function ' + factory, 'function ' + factory).replace(/^export \{[^}]*\}\s*$/m, '')
    client = client.replace('// ' + marker, () => module)
  }
  inline('__DSH_USAGE_STATS_REASONING_SETTINGS__', 'reasoning-settings.js', 'createReasoningSettings')
  inline('__DSH_ACCOUNT_QUOTAS_CLIENT__', 'account-quotas-client.js', 'createAccountQuotasClient', 'quota-brand-icons.js')
  if (/^\s*\/\/ __DSH_[A-Z_]+__\s*$/m.test(client)) throw new Error('Unresolved client bundle marker')
  return client
}

export function build(directory = root) {
  const output = path.resolve(directory, 'lib'), relative = path.relative(directory, output)
  if (relative !== 'lib' || !path.isAbsolute(output)) throw new Error('Invalid build output path')
  fs.rmSync(output, { recursive: true, force: true })
  fs.mkdirSync(output, { recursive: true })
  for (const entry of fs.readdirSync(path.join(directory, 'src'))) {
    if (templates.has(entry)) continue
    fs.cpSync(path.join(directory, 'src', entry), path.join(output, entry), { recursive: true })
  }
  fs.writeFileSync(path.join(output, 'client.js'), renderClient(directory))
  console.log('Built ' + JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).name + ' from src/ into lib/.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build()
