import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const client = fs.readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
const keys = new Set()
for (const match of client.slice(0, client.indexOf('function t(')).matchAll(/['"]([^'"]+)['"]\s*:\s*\[/g)) keys.add(match[1])

// Host-side validation and detection messages that reach the renderer through
// an API error body. Without a matching key, t() returns the Chinese source
// string unchanged, so English and Japanese users would see Chinese text.
const hostMessages = [
  '请使用 JSON 请求。',
  '请求内容超过 32 KB。',
  '请求内容不是有效 JSON。',
  '模型推理强度开关值无效。',
  '当前宿主不支持模型参数校验，请更新 DSH。',
  '模型推理参数不受支持。',
  '当前会话已变化，请重新生成预算。',
  '用量展示设置无效。',
  '检测用量记录无法读取，统计可能不完整。',
  '用量统计暂时不可用，请稍后重试。',
  '操作失败，请稍后重试。',
  '检测操作无效。',
  '请选择更新指纹引擎。',
]

test('host API messages surfaced by the renderer all have translations', () => {
  for (const message of hostMessages) assert.ok(keys.has(message), 'missing translation: ' + message)
})
