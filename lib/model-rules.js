/** Persistent model-name rules: fold many raw model names into one display name. */
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_RULES = 1000
const MAX_NAME = 300
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const clone = (value) => structuredClone(value)
export class ModelRuleError extends Error {}

const fail = (message) => { throw new ModelRuleError(message) }

/** Comparison key for a model name; matching ignores case and outer spaces. */
export function modelRuleKey(name) {
  return String(name == null ? '' : name).trim().toLowerCase()
}

function ruleName(value) {
  if (typeof value !== 'string') return ''
  const name = value.trim()
  return name.length > 0 && name.length <= MAX_NAME ? name : ''
}

/** True when the rule chain starting at `from` reaches `target`. */
function reaches(next, from, target) {
  let current = from
  for (let step = 0; step <= next.size; step++) {
    if (current === target) return true
    if (!next.has(current)) return false
    current = next.get(current)
  }
  return true
}

/** Keep valid, duplicate-free, cycle-free rules (file order wins). */
function sanitizeRules(value) {
  if (!Array.isArray(value)) return []
  const next = new Map()
  const out = []
  for (const rule of value) {
    if (out.length >= MAX_RULES) break
    if (!plain(rule)) continue
    const original = ruleName(rule.original)
    const canonical = ruleName(rule.canonical)
    if (original === '' || canonical === '') continue
    const key = original.toLowerCase()
    if (next.has(key) || reaches(next, canonical.toLowerCase(), key)) continue
    next.set(key, canonical.toLowerCase())
    out.push({ original, canonical })
  }
  return out
}

/** Resolve any raw model name to its canonical name; chains are followed. */
export function createModelResolver(rules) {
  const next = new Map()
  const casing = new Map()
  for (const rule of sanitizeRules(rules)) {
    const key = rule.original.toLowerCase()
    if (next.has(key)) continue
    next.set(key, rule.canonical.toLowerCase())
    casing.set(key, rule.canonical)
  }
  if (next.size === 0) return (name) => String(name == null ? '' : name).trim()
  const cache = new Map()
  return (name) => {
    const text = String(name == null ? '' : name).trim()
    const key = text.toLowerCase()
    if (!next.has(key)) return text
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    let current = key
    let resolved = casing.get(key) || text
    for (let step = 0; step <= next.size && next.has(current); step++) {
      resolved = casing.get(current) || resolved
      current = next.get(current)
    }
    cache.set(key, resolved)
    return resolved
  }
}

/** Group flat rules by canonical name for the settings page. */
export function modelRuleGroups(rules) {
  if (!Array.isArray(rules)) return []
  const groups = new Map()
  for (const rule of rules) {
    if (!rule || typeof rule.canonical !== 'string' || typeof rule.original !== 'string') continue
    const key = modelRuleKey(rule.canonical)
    if (key === '') continue
    const group = groups.get(key)
    if (group) group.originals.push(rule.original)
    else groups.set(key, { canonical: rule.canonical, originals: [rule.original] })
  }
  return [...groups.values()]
    .map((group) => ({ canonical: group.canonical, originals: group.originals.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.canonical.localeCompare(b.canonical))
}

export function createModelRules(path) {
  let rules = []
  let loaded
  let queue = Promise.resolve()
  const load = () => loaded ||= (async () => {
    let text
    try { text = await readFile(path, 'utf8') }
    catch (error) { if (error.code !== 'ENOENT') throw error; return }
    let saved
    try { saved = JSON.parse(text)?.rules } catch { return }
    rules = sanitizeRules(saved)
  })()

  const save = async (next) => {
    const previous = rules
    rules = next
    try {
      await mkdir(dirname(path), { recursive: true })
      const temp = path + '.' + randomUUID() + '.tmp'
      await writeFile(temp, JSON.stringify({ version: 1, rules: next }), { encoding: 'utf8', mode: 0o600 })
      await rename(temp, path)
    } catch {
      rules = previous
      fail('模型规则保存失败，请检查存储目录权限。')
    }
  }

  return {
    async get() { await load(); return clone(rules) },
    update(body) {
      const operation = queue.catch(() => {}).then(async () => {
        await load()
        if (!plain(body)) fail('规则设置应为 JSON 对象。')
        if (body.action === 'remove') {
          const key = modelRuleKey(body.canonical)
          const next = rules.filter((rule) => modelRuleKey(rule.canonical) !== key)
          if (next.length === rules.length) fail('要移除的规则不存在。')
          await save(next)
          return { ok: true, rules: modelRuleGroups(rules) }
        }
        if (body.action !== 'add' && body.action !== 'update') fail('未知规则操作。')
        const canonical = ruleName(body.canonical)
        const originals = Array.isArray(body.originals) ? body.originals.map(ruleName) : []
        if (canonical === '' || originals.length === 0 || originals.some((name) => name === '')) fail('请填写归一名称和至少一个原始模型。')
        const removed = new Set(Array.isArray(body.removed) ? body.removed.map(modelRuleKey) : [])
        const next = rules.filter((rule) => !removed.has(modelRuleKey(rule.original)))
        const seen = new Map(next.map((rule) => [modelRuleKey(rule.original), rule]))
        for (const original of originals) {
          const key = modelRuleKey(original)
          const existing = seen.get(key)
          if (existing) {
            if (modelRuleKey(existing.canonical) === modelRuleKey(canonical)) continue
            fail('同一个原始模型不能同时归入两个不同的归一名称。')
          }
          const rule = { original, canonical }
          seen.set(key, rule)
          next.push(rule)
        }
        if (next.length > MAX_RULES) fail('模型规则最多支持 1000 条。')
        if (sanitizeRules(next).length !== next.length) fail('名称规则形成了循环，请调整后保存。')
        await save(next)
        return { ok: true, rules: modelRuleGroups(rules) }
      })
      queue = operation
      return operation
    },
    flush: () => queue.catch(() => {}),
  }
}
