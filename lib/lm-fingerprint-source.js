/** Fetch one published upstream revision. Never runs npm scripts or the CLI. */
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici'

export const REGISTRY = 'https://registry.npmjs.org/lmfpd/latest'
// jsDelivr serves commit-pinned repository files from the same revision as the
// npm release, so it can stand in for GitHub's raw host when that host is
// unreachable. Both candidates are immutable URLs for the requested revision.
export const SOURCE_ROOTS = [
  revision => 'https://cdn.jsdelivr.net/gh/Ikaleio/lm-detector@' + revision + '/shared/',
  revision => 'https://raw.githubusercontent.com/Ikaleio/lm-detector/' + revision + '/shared/',
]
const roots = ['challenge-browser.js', 'fingerprint-core.js', 'shared-detector.ts', 'detector-codec.ts']
let downloadAgent
function defaultFetch(url, init) {
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy) {
    downloadAgent ||= new EnvHttpProxyAgent()
    return undiciFetch(url, { ...init, dispatcher: downloadAgent })
  }
  return globalThis.fetch(url, init)
}
export async function closeDownloadTransport() { const agent = downloadAgent; downloadAgent = undefined; await agent?.destroy() }
export const hash = value => createHash('sha256').update(value).digest('hex')
export function validateRelease(value) {
  const version = value?.version, revision = value?.gitHead
  if (value?.name !== 'lmfpd' || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version || '') || version.length > 64 ||
      !/^[a-f0-9]{40}$/.test(revision || '') || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(value?.dist?.integrity || '')) {
    throw new Error('上游版本信息无效。')
  }
  const expected = 'https://registry.npmjs.org/lmfpd/-/lmfpd-' + version + '.tgz'
  if (value.dist.tarball !== expected) throw new Error('上游发布包地址不受支持。')
  return { version, revision, tarball: expected, integrity: value.dist.integrity }
}
export async function readRemote(url, { fetch: request = defaultFetch, signal, limit = 1_048_576 } = {}) {
  const response = await request(url, { signal: signal || AbortSignal.timeout(30_000), redirect: 'error' })
  if (!response.ok) throw new Error('上游文件下载失败（HTTP ' + response.status + '）。')
  if (Number(response.headers.get('content-length')) > limit) throw new Error('上游文件超过大小限制。')
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new Error('上游文件超过大小限制。')
      chunks.push(Buffer.from(value))
    }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks)
}
async function readSource(revision, name, options = {}) {
  let failure
  for (const root of SOURCE_ROOTS) {
    if (options.signal?.aborted) throw options.signal.reason || new Error('上游文件下载已取消。')
    try {
      // Bound each mirror separately so one unreachable host cannot consume the
      // whole update window before the next candidate gets a chance.
      const timeout = AbortSignal.timeout(15_000)
      return await readRemote(root(revision) + name, {
        ...options,
        signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      })
    } catch (error) { failure = error }
  }
  throw failure
}
export async function publishedRelease(options = {}) {
  return validateRelease(JSON.parse((await readRemote(REGISTRY, options)).toString('utf8')))
}
/** Select literal members from a bounded archive; never extract archive paths. */
export function releaseFiles(compressed, integrity) {
  if ('sha512-' + createHash('sha512').update(compressed).digest('base64') !== integrity) throw new Error('上游发布包完整性校验失败。')
  const tar = gunzipSync(compressed, { maxOutputLength: 96 * 1024 * 1024 })
  const wanted = new Set(['package/package.json', 'package/LICENSE', 'package/data/unified_bank.json', 'package/data/shared_detector.bin'])
  const files = new Map()
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(v => v === 0)) break
    const field = (a, b) => header.subarray(a, b).toString('utf8').split('\0')[0]
    const size = Number.parseInt(field(124, 136).trim(), 8)
    const checksum = Number.parseInt(field(148, 156).trim(), 8)
    const actual = header.reduce((sum, v, i) => sum + (i >= 148 && i < 156 ? 32 : v), 0)
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length || actual !== checksum) throw new Error('上游发布包归档无效。')
    const prefix = field(345, 500), name = (prefix ? prefix + '/' : '') + field(0, 100)
    if (wanted.has(name)) {
      if (![0, 48].includes(header[156]) || files.has(name.slice(8))) throw new Error('上游发布包含无效文件。')
      files.set(name.slice(8), Buffer.from(tar.subarray(offset + 512, offset + 512 + size)))
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  if (files.size !== wanted.size) throw new Error('上游发布包缺少检测文件，请更新插件适配。')
  return files
}
export async function buildRelease(release, directory, options = {}) {
  // Types are removed without rewriting the upstream numerical algorithm.
  const ts = (await import('typescript')).default
  const files = releaseFiles(await readRemote(release.tarball, { ...options, limit: 24 * 1024 * 1024 }), release.integrity)
  const pkg = JSON.parse(files.get('package.json').toString('utf8'))
  if (pkg.name !== 'lmfpd' || pkg.version !== release.version || pkg.gitHead !== release.revision) throw new Error('上游代码与发布版本不一致。')
  const bank = JSON.parse(files.get('data/unified_bank.json').toString('utf8'))
  if (!Array.isArray(bank.models) || !bank.models.length || bank.models.length > 1000) throw new Error('上游参考库无效。')
  const modules = new Map(), sourceHashes = {}
  async function moduleFor(name) {
    if (!/^[a-z0-9-]+\.(?:ts|js)$/.test(name)) throw new Error('上游模块路径不受支持。')
    if (modules.has(name)) return
    if (modules.size >= 32) throw new Error('上游模块数量超过限制。')
    modules.set(name, null)
    const raw = await readSource(release.revision, name, options)
    sourceHashes[name] = hash(raw)
    const compiled = ts.transpileModule(raw.toString('utf8'), {
      fileName: name, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
    }).outputText
    const parsed = ts.createSourceFile(name, compiled, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
    const replacements = [], dependencies = []
    for (const statement of parsed.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
      const specifier = statement.moduleSpecifier
      if (!specifier) continue
      const path = specifier.text
      if (typeof path !== 'string' || !/^\.\/[a-z0-9-]+(?:\.(?:js|ts))?$/.test(path)) throw new Error('上游模块依赖不受支持，请更新插件适配。')
      const child = path.slice(2).includes('.') ? path.slice(2) : path.slice(2) + '.ts'
      dependencies.push(child)
      replacements.push({ start: specifier.getStart(parsed), end: specifier.getEnd(), value: JSON.stringify('./' + child.replace(/\.(ts|js)$/, '.mjs')) })
    }
    let dynamic = false
    function visit(node) { if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) dynamic = true; ts.forEachChild(node, visit) }
    visit(parsed)
    if (dynamic) throw new Error('上游动态模块依赖不受支持，请更新插件适配。')
    let code = compiled
    for (const change of replacements.sort((a, b) => b.start - a.start)) code = code.slice(0, change.start) + change.value + code.slice(change.end)
    modules.set(name, code)
    await Promise.all(dependencies.map(moduleFor))
  }
  await Promise.all(roots.map(moduleFor))
  const outputs = new Map([
    ['LICENSE', files.get('LICENSE')],
    ['data/unified_bank.json', files.get('data/unified_bank.json')],
    ['data/shared_detector.bin', files.get('data/shared_detector.bin')],
    ...[...modules].map(([name, code]) => ['core/' + name.replace(/\.(ts|js)$/, '.mjs'), Buffer.from(code)])
  ])
  const manifest = { schema: 1, name: 'lmfpd', version: release.version, revision: release.revision, integrity: release.integrity,
    builtAt: bank.built_at, modelCount: bank.models.length, source: 'https://github.com/Ikaleio/lm-detector/tree/' + release.revision,
    upstream: { url: 'https://github.com/Ikaleio/lm-detector', commit: release.revision },
    compiler: 'TypeScript 5.9.3; type erasure and relative module extensions only', sourceHashes: Object.fromEntries(Object.entries(sourceHashes).sort()),
    files: Object.fromEntries([...outputs].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => [name, hash(bytes)])) }
  for (const [name, bytes] of outputs) {
    const parts = posix.dirname(name)
    await mkdir(join(directory, parts), { recursive: true })
    await writeFile(join(directory, name), bytes)
  }
  await writeFile(join(directory, 'UPSTREAM.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}
