/** Persist and deduplicate reported detection usage across plugin restarts. */
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getBridge, HUB_SERVICE } from './bridge.js'

const keys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']
function sanitize(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id || !Number.isFinite(raw.time) || raw.time <= 0
    || typeof raw.selection?.provider !== 'string' || typeof raw.selection?.model !== 'string') throw new Error('Invalid supplemental usage')
  return { id: raw.id.slice(0, 320), time: raw.time,
    selection: { provider: raw.selection.provider.slice(0, 256), model: raw.selection.model.slice(0, 256) },
    usageReported: raw.usageReported === true,
    usage: Object.fromEntries(keys.map(key => [key, Number.isFinite(raw.usage?.[key]) && raw.usage[key] >= 0 ? raw.usage[key] : 0])),
    stop: ['stop', 'max-tokens'].includes(raw.stop) ? raw.stop : 'unknown',
    ttftMs: Number.isFinite(raw.ttftMs) && raw.ttftMs >= 0 ? raw.ttftMs : null,
    decodeMs: Number.isFinite(raw.decodeMs) && raw.decodeMs > 0 ? raw.decodeMs : null }
}

export function createSupplementalUsage(ctx, path, legacyPath, history) {
  let records = new Map(), warning = '', loaded, flight, queue = Promise.resolve(), connected = false
  const merge = rows => { const next = new Map(records); for (const row of rows) { const cleaned = sanitize(row); next.set(cleaned.id, cleaned) }; records = next }
  const persist = () => {
    const text = JSON.stringify({ version: 1, records: [...records.values()] })
    return queue = queue.catch(() => {}).then(async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path + '.tmp', text, { mode: 0o600 }); await rename(path + '.tmp', path)
    })
  }
  const load = () => loaded ||= (async () => {
    try {
      let document
      try { document = JSON.parse(await readFile(path, 'utf8')); if (document.version !== 1 || !Array.isArray(document.records)) throw new Error('Invalid cache'); merge(document.records) }
      catch (error) {
        if (error.code !== 'ENOENT') throw error
        try { document = JSON.parse(await readFile(legacyPath, 'utf8')) } catch (legacyError) { if (legacyError.code !== 'ENOENT') throw legacyError; return }
        if (document.version !== 1 || !Array.isArray(document.usage)) throw new Error('Invalid legacy history')
        merge(document.usage.flatMap(job => (job.results || []).map((row, index) => ({ ...row, selection: row.selection || job.selection,
          time: row.time || job.finishedAt || job.startedAt, id: `${job.id}:${index}` }))))
        await persist()
      }
    } catch { warning = '检测用量记录无法读取，统计可能不完整。' }
  })()
  return {
    refresh() {
      if (flight) return flight
      return flight = (async () => {
        await load()
        if (history) {
          const before = JSON.stringify([...records.values()])
          merge(history.usageRecords())
          if (before !== JSON.stringify([...records.values()])) await persist()
          warning = history.warning()
        }
        const hub = getBridge(ctx, HUB_SERVICE)
        connected = !!hub
        if (!hub || typeof hub.readSupplementalUsage !== 'function') return
        let timer
        try {
          const snapshot = await Promise.race([
            Promise.resolve().then(() => hub.readSupplementalUsage()),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Supplemental usage timeout')), 1500); timer.unref?.() }),
          ])
          if (snapshot.protocolVersion !== 1 || !Array.isArray(snapshot.records)) throw new Error('Invalid interface')
          const before = JSON.stringify([...records.values()])
          merge(snapshot.records)
          if (before !== JSON.stringify([...records.values()])) await persist()
          warning = snapshot.warning || ''
        } catch { warning = '补充用量暂时不可用，保留上次成功记录。' }
        finally { clearTimeout(timer) }
      })().finally(() => { flight = null })
    },
    usage: () => [...records.values()],
    warning: () => warning,
    connected: () => connected,
    flush: () => queue.catch(() => {}),
  }
}
