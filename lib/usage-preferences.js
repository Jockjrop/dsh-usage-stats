/** Persistent usage display preferences. */
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

const defaults = () => ({ showModelDetails: false, showTokenSpeed: true })
export class PreferenceError extends Error {}
export function validateDisplayPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new PreferenceError('设置应为 JSON 对象。')
  for (const [key, value] of Object.entries(patch)) {
    if (!['showModelDetails', 'showTokenSpeed'].includes(key) || typeof value !== 'boolean') throw new PreferenceError('用量展示设置无效。')
  }
}

export function createUsagePreferences(path, legacyPath) {
  let settings = defaults(), loaded, queue = Promise.resolve()
  const load = () => loaded ||= (async () => {
    let text
    try { text = await readFile(path, 'utf8') }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      try { text = await readFile(legacyPath, 'utf8') } catch (legacyError) { if (legacyError.code !== 'ENOENT') throw legacyError }
    }
    if (text) {
      const saved = JSON.parse(text).settings
      if (!saved || typeof saved !== 'object') throw new Error('Invalid usage display preferences')
      for (const key of Object.keys(settings)) if (typeof saved[key] === 'boolean') settings[key] = saved[key]
    }
  })()
  return {
    async get() { await load(); return { ok: true, settings: { ...settings } } },
    update(patch) {
      const operation = queue.catch(() => {}).then(async () => {
        await load()
        validateDisplayPatch(patch)
        const next = { ...settings }
        for (const [key, value] of Object.entries(patch)) {
          if (!Object.hasOwn(next, key) || typeof value !== 'boolean') throw new PreferenceError('用量展示设置无效。')
          next[key] = value
        }
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path + '.tmp', JSON.stringify({ version: 1, settings: next }), { mode: 0o600 })
        await rename(path + '.tmp', path)
        settings = next
        return { ok: true, settings: { ...settings } }
      })
      queue = operation
      return operation
    },
    flush: () => queue.catch(() => {}),
  }
}
