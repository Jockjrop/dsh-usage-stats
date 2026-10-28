import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const messages = fs.readFileSync(new URL('../src/client-messages.js', import.meta.url), 'utf8')
const keys = new Set()
for (const match of messages.matchAll(/['"]([^'"]+)['"]\s*:\s*\[/g)) keys.add(match[1])

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
  '日期范围无效。',
  '规则设置应为 JSON 对象。',
  '未知规则操作。',
  '请填写归一名称和至少一个原始模型。',
  '同一个原始模型不能同时归入两个不同的归一名称。',
  '模型规则最多支持 1000 条。',
  '名称规则形成了循环，请调整后保存。',
  '模型规则保存失败，请检查存储目录权限。',
  '规则开关值无效。',
  '要移除的规则不存在。',
]

test('host API messages surfaced by the renderer all have translations', () => {
  for (const message of hostMessages) assert.ok(keys.has(message), 'missing translation: ' + message)
})
