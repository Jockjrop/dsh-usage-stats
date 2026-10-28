/**
 * Built-in model price catalog — USD per million tokens, imported from
 * CogBurn's ModelPricing.cs (models.dev snapshot plus verified list prices).
 * CacheWrite is the cache-creation stage.
 *
 * Matching mirrors CogBurn's ModelPricingCatalog.Find: basename after the last
 * slash, then exact id, alphanumeric key, date suffix, vendor prefix and
 * reasoning-level suffix. A model without an entry stays unpriced; its cost is
 * never estimated from a similar model.
 */

/* [id, input, output, cacheRead, cacheWrite] */
const CATALOG = [
  ['claude-3-5-haiku-20241022', 0.8, 4, 0.08, 1],
  ['claude-3-5-sonnet-20241022', 3, 15, 0.3, 3.75],
  ['claude-fable-5', 10, 50, 1, 12.5],
  ['claude-fable-5-1', 10, 50, 0.25, 12.5],
  ['claude-haiku-4-5-20251001', 1, 5, 0.1, 1.25],
  ['claude-haiku-5-5', 0.1, 0.5, 0.01, 0.125],
  ['claude-mythos-5', 10, 50, 1, 12.5],
  ['claude-mythos-5-1', 10, 50, 0.25, 12.5],
  ['claude-opus-4-1-20250805', 15, 75, 1.5, 18.75],
  ['claude-opus-4-20250514', 15, 75, 1.5, 18.75],
  ['claude-opus-4-5-20251101', 5, 25, 0.5, 6.25],
  ['claude-opus-4-6', 5, 25, 0.5, 6.25],
  ['claude-opus-4-6-20260206', 5, 25, 0.5, 6.25],
  ['claude-opus-4-7', 5, 25, 0.5, 6.25],
  ['claude-opus-4-8', 5, 25, 0.5, 6.25],
  ['claude-opus-5', 5, 25, 0.5, 6.25],
  ['claude-opus-5-5', 4, 20, 0.2, 5],
  ['claude-sonnet-4-20250514', 3, 15, 0.3, 3.75],
  ['claude-sonnet-4-5-20250929', 3, 15, 0.3, 3.75],
  ['claude-sonnet-4-6', 3, 15, 0.3, 3.75],
  ['claude-sonnet-4-6-20260217', 3, 15, 0.3, 3.75],
  ['claude-sonnet-5', 2, 10, 0.2, 2.5],
  ['claude-sonnet-5-5', 2, 10, 0.1, 2.5],
  ['codestral-2508', 0.3, 0.9, 0.03, 0],
  ['codex-mini', 0.75, 3, 0.025, 0],
  ['command-a', 2.5, 10, 0, 0],
  ['command-r', 0.15, 0.6, 0, 0],
  ['command-r-plus', 2.5, 10, 0, 0],
  ['deepseek-chat', 0.44, 1.32, 0.014, 0],
  ['deepseek-flash', 0.15, 0.6, 0.003, 0],
  ['deepseek-reasoner', 0.44, 1.32, 0.014, 0],
  ['deepseek-v3', 0.28, 1.11, 0.028, 0],
  ['deepseek-v3.1', 0.55, 1.67, 0.055, 0],
  ['deepseek-v3.2', 0.28, 0.42, 0.028, 0],
  ['deepseek-v4-flash', 0.3, 1.2, 0.006, 0],
  ['deepseek-v4-flash-0731', 0.3, 1.2, 0.006, 0],
  ['deepseek-v4-flash-vision-exp', 0.3, 1.2, 0.006, 0],
  ['deepseek-v4-pro', 0.66, 1.98, 0.022, 0],
  ['deepseek-v4-pro-0813', 0.66, 1.98, 0.022, 0],
  ['deepseek-v4-pro-202606', 0.66, 1.98, 0.022, 0],
  ['deepseek-v4.1-flash', 0.3, 1.2, 0.006, 0],
  ['deepseek-v4.1-flash-1017', 0.3, 1.2, 0.006, 0],
  ['devstral-2-2512', 0.4, 2, 0.04, 0],
  ['devstral-medium', 0.4, 2, 0.04, 0],
  ['devstral-small-1.1', 0.07, 0.28, 0.01, 0],
  ['devstral-small-2-2512', 0.1, 0.3, 0.01, 0],
  ['doubao-seed-2-0-code', 0.47, 2.37, 0.09, 0],
  ['doubao-seed-2-0-code-preview-latest', 0.47, 2.37, 0.09, 0],
  ['doubao-seed-2-0-lite', 0.08, 0.5, 0.017, 0],
  ['doubao-seed-2-0-mini', 0.03, 0.31, 0.0056, 0],
  ['doubao-seed-2-0-pro', 0.47, 2.37, 0.09, 0],
  ['doubao-seed-2-1-pro', 0.84, 4.2, 0.17, 0],
  ['doubao-seed-2-1-turbo', 0.42, 2.1, 0.08, 0],
  ['doubao-seed-code', 0.17, 1.11, 0.02, 0],
  ['gemini-2.0-flash', 0.1, 0.4, 0.025, 0],
  ['gemini-2.5-flash', 0.3, 2.5, 0.03, 0],
  ['gemini-2.5-flash-lite', 0.1, 0.4, 0.01, 0],
  ['gemini-2.5-pro', 1.25, 10, 0.125, 0],
  ['gemini-3-flash-preview', 0.5, 3, 0.05, 0],
  ['gemini-3-pro-preview', 2, 12, 0.2, 0],
  ['gemini-3.1-flash-lite', 0.25, 1.5, 0.025, 0],
  ['gemini-3.1-flash-lite-preview', 0.25, 1.5, 0.025, 0],
  ['gemini-3.1-pro-preview', 2, 12, 0.2, 0],
  ['gemini-3.5-flash', 1.5, 9, 0.15, 0],
  ['gemini-3.5-flash-lite', 0.3, 2.5, 0.03, 0],
  ['gemini-3.6-flash', 0.75, 3.75, 0.075, 0],
  ['gemini-3.7-flash', 0.75, 3.75, 0.075, 0],
  ['gemini-3.8-flash', 0.75, 3.75, 0.075, 0],
  ['gemini-4-argon', 2, 10, 0.1, 0],
  ['gemini-flash-latest', 0.75, 3.75, 0.075, 0],
  ['gemini-flash-lite-latest', 0.3, 2.5, 0.03, 0],
  ['glm-4.5-air', 0.2, 1.1, 0.03, 0],
  ['glm-4.6', 0.6, 2.2, 0.11, 0],
  ['glm-4.6v', 0.6, 1.8, 0.11, 0],
  ['glm-4.7', 0.6, 2.2, 0.11, 0],
  ['glm-5', 1, 3.2, 0.2, 0],
  ['glm-5-turbo', 1.2, 4, 0.24, 0],
  ['glm-5.1', 1.4, 4.4, 0.26, 0],
  ['glm-5.2', 1.4, 4.4, 0.26, 0],
  ['glm-5.3', 1.4, 4.4, 0.26, 0],
  ['glm-5.3-flash', 0.15, 0.5, 0.03, 0],
  ['glm-5.3-flashx', 0.37, 1.25, 0.075, 0],
  ['glm-5v-turbo', 1.2, 4, 0.24, 0],
  ['gpt-4.1', 2, 8, 0.5, 0],
  ['gpt-4.1-mini', 0.4, 1.6, 0.1, 0],
  ['gpt-4.1-nano', 0.1, 0.4, 0.025, 0],
  ['gpt-4o', 2.5, 10, 1.25, 0],
  ['gpt-4o-mini', 0.15, 0.6, 0.075, 0],
  ['gpt-5', 1.25, 10, 0.125, 0],
  ['gpt-5-codex', 1.25, 10, 0.125, 0],
  ['gpt-5-codex-high', 1.25, 10, 0.125, 0],
  ['gpt-5-codex-low', 1.25, 10, 0.125, 0],
  ['gpt-5-codex-medium', 1.25, 10, 0.125, 0],
  ['gpt-5-codex-mini', 1.25, 10, 0.125, 0],
  ['gpt-5-codex-mini-high', 1.25, 10, 0.125, 0],
  ['gpt-5-codex-mini-medium', 1.25, 10, 0.125, 0],
  ['gpt-5-high', 1.25, 10, 0.125, 0],
  ['gpt-5-low', 1.25, 10, 0.125, 0],
  ['gpt-5-medium', 1.25, 10, 0.125, 0],
  ['gpt-5-mini', 0.25, 2, 0.025, 0],
  ['gpt-5-minimal', 1.25, 10, 0.125, 0],
  ['gpt-5-nano', 0.05, 0.4, 0.005, 0],
  ['gpt-5.1', 1.25, 10, 0.125, 0],
  ['gpt-5.1-codex', 1.25, 10, 0.125, 0],
  ['gpt-5.1-codex-max', 1.25, 10, 0.125, 0],
  ['gpt-5.1-codex-max-high', 1.25, 10, 0.125, 0],
  ['gpt-5.1-codex-max-xhigh', 1.25, 10, 0.125, 0],
  ['gpt-5.1-codex-mini', 1.25, 10, 0.125, 0],
  ['gpt-5.1-high', 1.25, 10, 0.125, 0],
  ['gpt-5.1-low', 1.25, 10, 0.125, 0],
  ['gpt-5.1-medium', 1.25, 10, 0.125, 0],
  ['gpt-5.1-minimal', 1.25, 10, 0.125, 0],
  ['gpt-5.2', 1.75, 14, 0.175, 0],
  ['gpt-5.2-codex', 1.75, 14, 0.175, 0],
  ['gpt-5.2-codex-high', 1.75, 14, 0.175, 0],
  ['gpt-5.2-codex-low', 1.75, 14, 0.175, 0],
  ['gpt-5.2-codex-medium', 1.75, 14, 0.175, 0],
  ['gpt-5.2-codex-xhigh', 1.75, 14, 0.175, 0],
  ['gpt-5.2-high', 1.75, 14, 0.175, 0],
  ['gpt-5.2-low', 1.75, 14, 0.175, 0],
  ['gpt-5.2-medium', 1.75, 14, 0.175, 0],
  ['gpt-5.2-pro', 21, 168, 0, 0],
  ['gpt-5.2-xhigh', 1.75, 14, 0.175, 0],
  ['gpt-5.3-codex', 1.75, 14, 0.175, 0],
  ['gpt-5.3-codex-high', 1.75, 14, 0.175, 0],
  ['gpt-5.3-codex-low', 1.75, 14, 0.175, 0],
  ['gpt-5.3-codex-medium', 1.75, 14, 0.175, 0],
  ['gpt-5.3-codex-spark', 1.75, 14, 0.175, 0],
  ['gpt-5.3-codex-xhigh', 1.75, 14, 0.175, 0],
  ['gpt-5.4', 2.5, 15, 0.25, 0],
  ['gpt-5.4-mini', 0.75, 4.5, 0.075, 0],
  ['gpt-5.4-nano', 0.2, 1.25, 0.02, 0],
  ['gpt-5.4-pro', 30, 180, 0, 0],
  ['gpt-5.5', 5, 30, 0.5, 0],
  ['gpt-5.5-high', 5, 30, 0.5, 0],
  ['gpt-5.5-low', 5, 30, 0.5, 0],
  ['gpt-5.5-medium', 5, 30, 0.5, 0],
  ['gpt-5.5-minimal', 5, 30, 0.5, 0],
  ['gpt-5.5-pro', 30, 180, 0, 0],
  ['gpt-5.5-xhigh', 5, 30, 0.5, 0],
  ['gpt-5.6', 4, 20, 0.4, 5],
  ['gpt-5.6-cyber', 12.5, 75, 1.25, 15.625],
  ['gpt-5.6-high', 4, 20, 0.4, 5],
  ['gpt-5.6-low', 4, 20, 0.4, 5],
  ['gpt-5.6-luna', 0.2, 1.2, 0.02, 0.25],
  ['gpt-5.6-medium', 4, 20, 0.4, 5],
  ['gpt-5.6-minimal', 4, 20, 0.4, 5],
  ['gpt-5.6-sol', 4, 20, 0.4, 5],
  ['gpt-5.6-terra', 2, 12, 0.2, 2.5],
  ['gpt-5.6-xhigh', 4, 20, 0.4, 5],
  ['gpt-6-astra', 10, 50, 1, 12.5],
  ['gpt-6-luna', 0.1, 0.5, 0.01, 0.125],
  ['gpt-6-sol', 2, 10, 0.2, 2.5],
  ['gpt-6.1-sol', 2, 10, 0.1, 2.5],
  ['gpt-6.1-terra', 1, 5, 0.05, 1.25],
  ['gpt-daybreak-blue-latest', 4, 20, 0.4, 5],
  ['gpt-daybreak-red-latest', 12.5, 75, 1.25, 15.625],
  ['grok-3', 3, 15, 0.75, 0],
  ['grok-3-mini', 0.25, 0.5, 0.075, 0],
  ['grok-4', 3, 15, 0.75, 0],
  ['grok-4-1-fast-non-reasoning', 0.2, 0.5, 0.05, 0],
  ['grok-4-1-fast-reasoning', 0.2, 0.5, 0.05, 0],
  ['grok-4.20-0309-non-reasoning', 1.25, 2.5, 0.2, 0],
  ['grok-4.20-0309-reasoning', 1.25, 2.5, 0.2, 0],
  ['grok-4.3', 1.25, 2.5, 0.2, 0],
  ['grok-4.5', 2, 6, 0.3, 0],
  ['grok-4.5-build', 2, 6, 0.3, 0],
  ['grok-4.6', 2, 6, 0.5, 0],
  ['grok-4.7', 2, 6, 0.5, 0],
  ['grok-build-0.1', 1, 2, 0.2, 0],
  ['grok-code-fast-1', 1, 2, 0.2, 0],
  ['hunyuan-hy3', 0.14, 0.56, 0.035, 0],
  ['hy3', 0, 0, 0, 0],
  ['hy4-preview', 0.84, 2.52, 0.042, 0],
  ['k3', 3, 15, 0.3, 3],
  ['k3.1-pro', 2, 10, 0.2, 2],
  ['k3.1-pro-highspeed', 4, 20, 0.2, 4],
  ['kimi-k2-0905', 0.55, 2.2, 0.1, 0],
  ['kimi-k2-thinking', 0.55, 2.2, 0.1, 0],
  ['kimi-k2-turbo', 1.11, 8.06, 0.14, 0],
  ['kimi-k2.5', 0.6, 3, 0.1, 0],
  ['kimi-k2.6', 0.95, 4, 0.16, 0],
  ['kimi-k2.7-code', 0.95, 4, 0.19, 0],
  ['kimi-k2.7-code-highspeed', 1.9, 8, 0.38, 0],
  ['kimi-k3', 3, 15, 0.3, 3],
  ['kimi-k3.1-pro', 2, 10, 0.2, 2],
  ['kimi-k3.1-pro-highspeed', 4, 20, 0.2, 4],
  ['longcat-2.0', 0.75, 2.95, 0.015, 0],
  ['longcat-2.5-preview', 0.3, 1.2, 0.006, 0],
  ['magistral-medium', 2, 5, 0, 0],
  ['magistral-small', 0.5, 1.5, 0, 0],
  ['mercury-2', 0.25, 0.75, 0, 0],
  ['mimo-v2-flash', 0.09, 0.29, 0.009, 0],
  ['mimo-v2-pro', 0.435, 0.87, 0.0036, 0],
  ['mimo-v2.5', 0.14, 0.28, 0.0028, 0],
  ['mimo-v2.5-pro', 0.435, 0.87, 0.0036, 0],
  ['mimo-v2.5-pro-ultraspeed', 1.305, 2.61, 0.0108, 0],
  ['mimo-v2.6-flash', 0.14, 0.28, 0.0028, 0],
  ['mimo-v2.6-pro', 0.435, 0.87, 0.0036, 0],
  ['mimo-v2.6-pro-ultraspeed', 4.35, 8.7, 0.036, 0],
  ['minimax-m2', 0.3, 1.2, 0.03, 0.375],
  ['minimax-m2.1', 0.3, 1.2, 0.03, 0.375],
  ['minimax-m2.1-lightning', 0.27, 2.33, 0.03, 0],
  ['minimax-m2.5', 0.3, 1.2, 0.03, 0.375],
  ['minimax-m2.5-highspeed', 0.6, 2.4, 0.06, 0.375],
  ['minimax-m2.5-lightning', 0.3, 2.4, 0.03, 0],
  ['minimax-m2.7', 0.3, 1.2, 0.06, 0.375],
  ['minimax-m2.7-highspeed', 0.6, 2.4, 0.06, 0.375],
  ['minimax-m3', 0.3, 1.2, 0.06, 0],
  ['minimax-m3.1-flash', 0.15, 0.6, 0.015, 0],
  ['minimax-m3.1-flash-preview', 0.15, 0.6, 0.015, 0],
  ['mistral-large-3-2512', 0.5, 1.5, 0.05, 0],
  ['mistral-medium-3.1', 0.4, 2, 0.04, 0],
  ['mistral-medium-3.5', 1.5, 7.5, 0, 0],
  ['mistral-small-3.2-24b', 0.075, 0.2, 0.01, 0],
  ['mistral-small-4', 0.1, 0.3, 0.01, 0],
  ['muse-spark-1.1', 1.25, 4.25, 0.15, 0],
  ['muse-spark-1.2', 1.25, 4.25, 0.15, 0],
  ['muse-spark-1.2-contributor', 0.1, 0.2, 0.002, 0],
  ['muse-spark-1.3', 1.25, 4.25, 0.15, 0],
  ['muse-spark-1.3-contributor', 0.1, 0.2, 0.002, 0],
  ['o1', 15, 60, 7.5, 0],
  ['o1-mini', 0.55, 2.2, 0.55, 0],
  ['o3', 2, 8, 0.5, 0],
  ['o3-mini', 1.1, 4.4, 0.55, 0],
  ['o3-pro', 20, 80, 0, 0],
  ['o4-mini', 1.1, 4.4, 0.275, 0],
  ['omen-alpha', 0.2, 0.66, 0.04, 0],
  ['ox-alpha-free', 0, 0, 0, 0],
  ['qwen-max', 1.6, 6.4, 0, 0],
  ['qwen-plus', 0.4, 1.2, 0.08, 0],
  ['qwen3-235b-a22b', 0.7, 8.4, 0, 0],
  ['qwen3-32b', 0.16, 0.64, 0, 0],
  ['qwen3-coder-480b', 0.65, 3.25, 0, 0],
  ['qwen3-coder-480b-a35b-instruct', 0.65, 3.25, 0, 0],
  ['qwen3-coder-flash', 0.195, 0.975, 0.039, 0],
  ['qwen3-coder-next', 0.12, 0.75, 0, 0],
  ['qwen3-coder-plus', 0.65, 3.25, 0.13, 0],
  ['qwen3-max', 0.78, 3.9, 0, 0],
  ['qwen3.5-plus', 0.26, 1.56, 0.052, 0],
  ['qwen3.6-27b', 0.6, 3.6, 0, 0],
  ['qwen3.6-flash', 0.1875, 1.125, 0.0375, 0],
  ['qwen3.6-plus', 0.325, 1.95, 0.065, 0],
  ['qwen3.7-flash', 0.03, 0.13, 0.003, 0.0375],
  ['qwen3.7-max', 2.5, 7.5, 0.5, 3.125],
  ['qwen3.7-plus', 0.4, 1.6, 0.04, 0.5],
  ['qwen3.8-2.4t-a95b', 2, 6, 0.25, 2.5],
  ['qwen3.8-27b', 0.5, 3, 0.1, 0.625],
  ['qwen3.8-flash', 0.15, 0.47, 0.016, 0.2],
  ['qwen3.8-max', 2, 6, 0.25, 2.5],
  ['qwen3.8-omni-flash', 0.15, 0.47, 0.016, 0],
  ['qwq-32b', 0.2, 0.6, 0, 0],
  ['qwq-plus', 0.8, 2.4, 0, 0],
  ['step-3.5-flash', 0.1, 0.3, 0.02, 0],
  ['step-3.5-flash-2603', 0.1, 0.3, 0.02, 0],
  ['step-3.7-flash', 0.19, 1.13, 0.04, 0],
  ['step-5-preview', 0.98, 2.8, 0.1, 0],
]

const VENDOR_PREFIXES = ['zai_', 'zaicoding_', 'tdpsk_']
const LEVELS = ['-thinking', '-xhigh', '-high', '-medium', '-minimal', '-low']

function asciiKey(value) {
  let out = ''
  for (const ch of value) if (/^[A-Za-z0-9]$/.test(ch)) out += ch.toLowerCase()
  return out
}

const BY_ID = new Map()
const BY_KEY = new Map()
for (const [id, input, output, cacheRead, cacheWrite] of CATALOG) {
  const price = { id, input, output, cacheRead, cacheWrite }
  BY_ID.set(id.toLowerCase(), price)
  const key = asciiKey(id)
  if (key !== '' && !BY_KEY.has(key)) BY_KEY.set(key, price)
}

function isDigits(value) {
  return value.length > 0 && /^\d+$/.test(value)
}

function isDate(value) {
  return (value.length === 8 && isDigits(value))
    || (value.length === 10 && value[4] === '-' && value[7] === '-' && isDigits(value.slice(0, 4)) && isDigits(value.slice(5, 7)) && isDigits(value.slice(8)))
}

function stripDate(value) {
  if (value.length >= 9 && value[value.length - 9] === '-' && isDigits(value.slice(-8))) return value.slice(0, -9)
  if (value.length >= 11 && value[value.length - 11] === '-' && isDate(value.slice(-10))) return value.slice(0, -11)
  return value
}

function stripLevel(value) {
  for (const suffix of LEVELS) {
    if (value.toLowerCase().endsWith(suffix)) return value.slice(0, -suffix.length)
  }
  return value
}

function tryFind(candidate) {
  const exact = BY_ID.get(candidate.toLowerCase())
  if (exact) return exact
  const key = asciiKey(candidate)
  if (key !== '' && BY_KEY.has(key)) return BY_KEY.get(key)
  const prefix = candidate.toLowerCase() + '-'
  for (const [id, price] of BY_ID) {
    if (id.startsWith(prefix) && isDate(id.slice(prefix.length))) return price
  }
  return null
}

/** Catalog price for a basename, or null when the model is unpriced. */
function resolveCatalogPrice(bare) {
  let price = tryFind(bare)
  if (price) return price

  let candidate = stripDate(bare)
  if (candidate.toLowerCase() !== bare.toLowerCase()) {
    price = tryFind(candidate)
    if (price) return price
  }

  for (const prefix of VENDOR_PREFIXES) {
    if (!candidate.toLowerCase().startsWith(prefix)) continue
    candidate = candidate.slice(prefix.length)
    price = tryFind(candidate)
    if (price) return price
    break
  }

  const unleveled = stripLevel(candidate)
  if (unleveled.toLowerCase() !== candidate.toLowerCase()) {
    price = tryFind(unleveled)
    if (price) return price
  }

  if (bare.toLowerCase() === 'dfmodel') return tryFind('deepseek-flash')
  if (bare.toLowerCase() === 'qfmodel') return tryFind('qwen3.8-flash')
  return null
}

/**
 * Effective price for a provider model name: a user override keyed by the raw
 * model name wins over the built-in catalog, so an edited or newly priced
 * model is also reflected in the request log. Null means still unpriced.
 */
export function findModelPrice(model, overrides) {
  const name = typeof model === 'string' ? model : ''
  const bare = name.slice(name.lastIndexOf('/') + 1).trim()
  if (bare === '') return null
  const catalog = resolveCatalogPrice(bare)
  const custom = overrides && typeof overrides === 'object' ? overrides[name] : null
  if (custom) return { id: catalog ? catalog.id : bare, input: custom.input, output: custom.output, cacheRead: custom.cacheRead, cacheWrite: custom.cacheWrite }
  return catalog
}

/** Request cost in USD; each token stage is priced at its own rate. */
export function usageCost(bucket, price) {
  if (!price) return null
  return ((bucket.inputTokens || 0) * price.input + (bucket.outputTokens || 0) * price.output
    + (bucket.cacheReadTokens || 0) * price.cacheRead + (bucket.cacheWriteTokens || 0) * price.cacheWrite) / 1_000_000
}
