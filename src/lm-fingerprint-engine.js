/** Upstream releases are immutable. A running quote always keeps its version. */
import { Worker } from 'node:worker_threads'
import { readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join, relative, isAbsolute, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { hash, publishedRelease, buildRelease, closeDownloadTransport } from './lm-fingerprint-source.js'

const bundled = [new URL('../third_party/lm-fingerprint/', import.meta.url), new URL('./third_party/lm-fingerprint/', import.meta.url)]
  .map(url => fileURLToPath(url)).find(path => existsSync(join(path, 'UPSTREAM.json')))

/** Compare two upstream `x.y.z[-prerelease]` versions. Returns -1, 0 or 1. */
export function compareVersions(a, b) {
  const parse = value => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value || '').trim())
    return match ? { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split('.') : [] } : null
  }
  const left = parse(a), right = parse(b)
  if (!left || !right) return String(a) === String(b) ? 0 : String(a) > String(b) ? 1 : -1
  for (let i = 0; i < 3; i++) if (left.core[i] !== right.core[i]) return left.core[i] < right.core[i] ? -1 : 1
  // A release outranks its prereleases; otherwise compare identifiers per SemVer.
  if (!left.pre.length || !right.pre.length) return left.pre.length === right.pre.length ? 0 : left.pre.length ? -1 : 1
  for (let i = 0; i < Math.min(left.pre.length, right.pre.length); i++) {
    const l = left.pre[i], r = right.pre[i]
    if (l === r) continue
    const ln = /^\d+$/.test(l), rn = /^\d+$/.test(r)
    if (ln && rn) return Number(l) < Number(r) ? -1 : 1
    if (ln !== rn) return ln ? -1 : 1
    return l < r ? -1 : 1
  }
  return left.pre.length === right.pre.length ? 0 : left.pre.length < right.pre.length ? -1 : 1
}

/**
 * Verification cache keyed by directory. The signature covers the manifest and
 * every listed file's size and timestamps, so an unchanged engine is verified
 * once per process instead of re-hashing 16 MB on every detection/catalog call.
 */
const verifiedEngines = new Map()

async function engineSignature(directory, names) {
  const parts = []
  for (const name of names) {
    try {
      const info = await stat(join(directory, name))
      parts.push(name + ':' + info.size + ':' + Math.round(info.mtimeMs) + ':' + Math.round(info.ctimeMs))
    } catch {
      parts.push(name + ':missing')
    }
  }
  return parts.join('|')
}

export async function verifyEngine(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'UPSTREAM.json'), 'utf8'))
  if (manifest.schema !== 1 || manifest.name !== 'lmfpd' || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(manifest.version || '') ||
      !/^[a-f0-9]{40}$/.test(manifest.revision || '') || !manifest.files || Object.keys(manifest.files).length > 40) throw new Error('指纹引擎清单无效。')
  const required = ['LICENSE', 'data/unified_bank.json', 'data/shared_detector.bin',
    ...['challenge-browser', 'fingerprint-core', 'shared-detector', 'detector-codec'].map(name => 'core/' + name + '.mjs')]
  if (required.some(name => !manifest.files[name])) throw new Error('指纹引擎文件缺失。')
  const signature = await engineSignature(directory, ['UPSTREAM.json', ...Object.keys(manifest.files)])
  const cached = verifiedEngines.get(directory)
  if (cached && cached.signature === signature) return cached.manifest
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (!/^(?:LICENSE|data\/(?:unified_bank\.json|shared_detector\.bin)|core\/[a-z0-9-]+\.mjs)$/.test(name) ||
        !/^[a-f0-9]{64}$/.test(digest) || hash(await readFile(join(directory, name))) !== digest) throw new Error('指纹引擎文件校验失败。')
  }
  verifiedEngines.set(directory, { signature, manifest })
  return manifest
}
export function openEngine(directory, manifest, options = {}) {
  const worker = new Worker(new URL('./lm-fingerprint-worker.js', import.meta.url), {
    workerData: { directory }, resourceLimits: { maxOldGenerationSizeMb: 256 }, execArgv: []
  })
  const pending = new Map()
  let sequence = 0, closed = false, metadata
  let resolveReady, rejectReady
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  const timeoutMs = options.timeoutMs || 30_000
  const startup = setTimeout(() => fail(new Error('指纹引擎启动超时。')), timeoutMs)
  const dispose = () => { if (!closed) { closed = true; clearTimeout(startup); rejectReady(new Error('指纹引擎已停止。')); void worker.terminate(); for (const p of pending.values()) p.reject(new Error('指纹引擎已停止。')); pending.clear() } }
  function fail(error) { clearTimeout(startup); rejectReady(error); dispose() }
  worker.on('message', message => {
    if (message.ready) { clearTimeout(startup); metadata = message; resolveReady(message); return }
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id)
    message.error ? item.reject(new Error(message.error)) : item.resolve(message.result)
  })
  worker.on('error', error => fail(new Error('指纹引擎无法启动，请检查宿主运行环境。', { cause: error })))
  worker.on('exit', () => { if (!closed) fail(new Error('指纹引擎意外退出。')) })
  return {
    manifest, directory, ready, dispose,
    get models() { return metadata?.models || [] },
    async call(operation, value, signal) {
      await ready
      if (closed || signal?.aborted) throw new Error('指纹检测已停止。')
      return new Promise((resolve, reject) => {
        const id = ++sequence
        const finish = handler => result => { clearTimeout(timer); signal?.removeEventListener('abort', abort); pending.delete(id); handler(result) }
        const abort = () => pending.get(id)?.reject(new Error('指纹检测已取消。'))
        const timer = setTimeout(() => { pending.get(id)?.reject(new Error('指纹引擎计算超时。')); dispose() }, timeoutMs)
        pending.set(id, { resolve: finish(resolve), reject: finish(reject) })
        signal?.addEventListener('abort', abort, { once: true })
        worker.postMessage({ id, operation, value })
      })
    }
  }
}
export function createFingerprintEngine(options = {}) {
  const cache = options.path && resolve(options.path), fallback = options.bundledPath || bundled
  let active = fallback, activeManifest, warning = '', warningKind = '', checkedAt = 0, checking, initialized, disposed = false, autoTimer
  const lifecycle = new AbortController()
  const sessions = new Set()
  try { activeManifest = JSON.parse(readFileSync(join(fallback, 'UPSTREAM.json'), 'utf8')) } catch { warning = '内置指纹引擎不可用，请重新安装插件。'; warningKind = 'fatal' }
  function status() { return { name: 'lmfpd', version: activeManifest?.version || '', revision: activeManifest?.revision || '',
    builtAt: activeManifest?.builtAt || '', modelCount: activeManifest?.modelCount || 0, source: active === fallback ? 'bundled' : 'updated',
    checkedAt, updating: !!checking, warning, warningKind, autoUpdate: !!cache } }
  function cacheDirectory(version) {
    if (!cache || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version || '') || version.length > 64) throw new Error('指纹引擎缓存路径无效。')
    const target = resolve(cache, 'versions', version), rel = relative(cache, target)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('指纹引擎缓存路径无效。')
    return target
  }
  async function init() {
    if (!initialized) initialized = (async () => {
      if (cache) {
        try {
          const pointer = JSON.parse(await readFile(join(cache, 'current.json'), 'utf8'))
          const directory = cacheDirectory(pointer.version), manifest = await verifyEngine(directory)
          if (pointer.manifestHash !== hash(await readFile(join(directory, 'UPSTREAM.json')))) throw new Error('缓存清单不一致。')
          active = directory; activeManifest = manifest; checkedAt = Number(pointer.checkedAt) || 0
        } catch (error) { if (error.code !== 'ENOENT') { warning = '缓存引擎校验失败，已保留内置版本。'; warningKind = 'cache' } }
        try {
          const check = JSON.parse(await readFile(join(cache, 'check.json'), 'utf8'))
          if (Number.isFinite(check.checkedAt)) checkedAt = Math.min(Date.now(), Math.max(0, check.checkedAt))
          // check.json only records background update attempts; an offline check
          // must not override a real engine problem discovered above.
          if (!warning && typeof check.warning === 'string' && check.warning) { warning = check.warning; warningKind = 'update' }
        } catch {}
      }
      activeManifest = await verifyEngine(active)
    })()
    await initialized
    if (disposed) throw new Error('指纹引擎已停止。')
  }
  async function update(force = false) {
    await init()
    if (!cache || disposed) return status()
    if (checking) return checking
    if (!force && Date.now() - checkedAt < (options.checkIntervalMs ?? 86_400_000)) return status()
    checking = (async () => {
      let staging, trial
      try {
        checkedAt = Date.now()
        const release = await publishedRelease({ fetch: options.fetch, signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(15_000)]) })
        if (release.version === activeManifest.version || compareVersions(release.version, activeManifest.version) <= 0) { warning = ''; warningKind = ''; checkedAt = Date.now(); return }
        staging = join(cache, '.stage-' + randomUUID())
        const manifest = await buildRelease(release, staging, { fetch: options.fetch, signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(60_000)]) })
        trial = openEngine(staging, manifest, options); await trial.ready
        trial.dispose(); trial = null
        if (disposed) throw new Error('指纹引擎已停止。')
        const destination = cacheDirectory(manifest.version)
        if (existsSync(destination)) {
          const existing = await verifyEngine(destination)
          if (existing.revision !== manifest.revision || existing.integrity !== manifest.integrity ||
            JSON.stringify(Object.entries(existing.files).sort()) !== JSON.stringify(Object.entries(manifest.files).sort())) throw new Error('同版本缓存内容不同。')
        } else { await mkdir(dirname(destination), { recursive: true }); await rename(staging, destination) }
        const pointer = { version: manifest.version, checkedAt, manifestHash: hash(await readFile(join(destination, 'UPSTREAM.json'))) }
        await mkdir(cache, { recursive: true })
        const temporary = join(cache, 'current-' + randomUUID() + '.tmp')
        await writePointer(temporary, pointer)
        await rename(temporary, join(cache, 'current.json'))
        active = destination; activeManifest = manifest; warning = ''; warningKind = ''
      } catch { warning = '上游更新暂不可用，继续使用已验证的指纹引擎。'; warningKind = 'update' }
      finally {
        trial?.dispose()
        const rel = staging && relative(cache, resolve(staging))
        if (rel && !rel.startsWith('..') && !isAbsolute(rel)) await rm(staging, { recursive: true, force: true }).catch(() => {})
        if (!disposed) {
          const temporary = join(cache, 'check-' + randomUUID() + '.tmp')
          try { await mkdir(cache, { recursive: true }); await writePointer(temporary, { checkedAt, warning }); await rename(temporary, join(cache, 'check.json')) }
          catch { await rm(temporary, { force: true }).catch(() => {}) }
        }
      }
    })().finally(() => { checking = null })
    await checking
    return status()
  }
  async function writePointer(path, value) { await writeFile(path, JSON.stringify(value) + '\n') }
  return {
    status, update,
    async acquire() {
      await init()
      const manifest = await verifyEngine(active), engine = openEngine(active, manifest, options)
      sessions.add(engine)
      const close = engine.dispose
      engine.dispose = () => { sessions.delete(engine); close() }
      try { await engine.ready } catch (error) { engine.dispose(); throw error }
      return engine
    },
    async catalog() {
      const engine = await this.acquire()
      try {
        if (cache && !autoTimer) { autoTimer = setInterval(() => { void update().catch(() => {}) }, 3_600_000); autoTimer.unref?.() }
        void update().catch(() => {})
        // Let the background check enter its downloading state for the UI.
        await new Promise(resolve => setImmediate(resolve))
        return { ...status(), version: engine.manifest.version, builtAt: engine.manifest.builtAt, modelCount: engine.models.length, models: engine.models }
      } finally { engine.dispose() }
    },
    dispose() { disposed = true; lifecycle.abort(); clearInterval(autoTimer); for (const session of sessions) session.dispose(); void closeDownloadTransport() }
  }
}
