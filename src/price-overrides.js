/** Persistent per-model price overrides, USD per million tokens. */
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite']
const MAX_MODELS = 1000
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const clone = (value) => structuredClone(value)
export class PriceOverrideError extends Error {}

const fail = (message) => { throw new PriceOverrideError(message) }
const validPrice = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000

function sanitize(price) {
  if (!plain(price)) return null
  const out = {}
  for (const field of FIELDS) {
    if (!validPrice(price[field])) return null
    out[field] = price[field]
  }
  return out
}

export function createPriceOverrides(path) {
  let prices = {}, loaded, queue = Promise.resolve()
  const load = () => loaded ||= (async () => {
    let text
    try { text = await readFile(path, 'utf8') }
    catch (error) { if (error.code !== 'ENOENT') throw error; return }
    let saved
    try { saved = JSON.parse(text)?.prices } catch { return }
    if (!plain(saved)) return
    for (const [model, price] of Object.entries(saved)) {
      if (typeof model !== 'string' || model === '' || model.length > 300) continue
      const clean = sanitize(price)
      if (clean) prices[model] = clean
      if (Object.keys(prices).length >= MAX_MODELS) break
    }
  })()
  return {
    async get() { await load(); return clone(prices) },
    update(body) {
      const operation = queue.catch(() => {}).then(async () => {
        await load()
        if (!plain(body)) fail('价格设置应为 JSON 对象。')
        const model = typeof body.model === 'string' ? body.model.trim() : ''
        if (model === '' || model.length > 300) fail('模型名称无效。')
        const price = {}
        for (const field of FIELDS) {
          if (!validPrice(body[field])) fail('价格必须是非负数字。')
          price[field] = body[field]
        }
        if (!Object.hasOwn(prices, model) && Object.keys(prices).length >= MAX_MODELS) fail('价格表最多支持 1000 个模型。')
        const previous = prices
        prices = { ...prices, [model]: price }
        try {
          await mkdir(dirname(path), { recursive: true })
          const temp = path + '.' + randomUUID() + '.tmp'
          await writeFile(temp, JSON.stringify({ version: 1, prices }), { encoding: 'utf8', mode: 0o600 })
          await rename(temp, path)
        } catch {
          prices = previous
          fail('价格表保存失败，请检查存储目录权限。')
        }
        return { ok: true, prices: clone(prices) }
      })
      queue = operation
      return operation
    },
    flush: () => queue.catch(() => {}),
  }
}
