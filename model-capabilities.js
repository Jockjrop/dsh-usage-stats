/** Seeded, locally graded tasks. Scores describe these tasks only, never model identity. */
import { binomialTail } from './model-fingerprints.js'
export function capabilityTasks(seed) {
  let state = seed >>> 0
  const rand = max => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max }
  const tasks = []
  const add = (domain, prompt, answer) => tasks.push({ id: `${domain}-${tasks.length}`, domain,
    prompt: prompt + '\nReturn only JSON with exactly one key "answer". Do not use tools.',
    check(text) { const value = JSON.parse(text.trim()); return Object.keys(value).length === 1 && JSON.stringify(value.answer) === JSON.stringify(answer) } })
  for (let i = 0; i < 4; i++) {
    const a = rand(17) + 2, b = rand(23) + 1, turns = rand(16) + 30
    let x = rand(300), initial = x, sum = 0
    for (let j = 0; j < turns; j++) { x = (x * a + b + j) % 997; sum += j % 3 === 0 ? -x : x }
    add('code', `Evaluate this JavaScript without executing it. What is sum?\nlet x=${initial}, sum=0; for(let j=0;j<${turns};j++){x=(x*${a}+${b}+j)%997;sum+=j%3===0?-x:x;}`, sum)
    const edges = [], costs = Array(11).fill(Infinity); costs[0] = 0
    for (let u = 0; u < 10; u++) for (let v = u + 1; v <= Math.min(10, u + 4); v++) edges.push([u, v, rand(31) + 1])
    for (let u = 0; u < 10; u++) for (const [from, to, weight] of edges) if (from === u) costs[to] = Math.min(costs[to], costs[from] + weight)
    add('reasoning', `Find the minimum total weight of a directed path from node 0 to node 10. Edges [from,to,weight]: ${JSON.stringify(edges)}`, costs[10])
    const entries = Array.from({ length: 160 }, (_, n) => ({ key: `record_${n}`, priority: rand(1000), value: rand(100_000) }))
    const chosen = rand(150) + 5, key = entries[chosen].key
    add('context', `Read the following records. For key ${key}, return the value in the LAST occurrence. Ignore priorities.\n${JSON.stringify(entries.concat({ key, priority: 9999, value: entries[chosen].value + 17 }))}`, entries[chosen].value + 17)
    const intervals = Array.from({ length: 16 }, () => { const start = rand(30); return [start, start + rand(9) + 1, rand(40) + 1] }).sort((a, b) => a[1] - b[1])
    const dp = [0]
    intervals.forEach(([start, , reward], j) => { let previous = j - 1; while (previous >= 0 && intervals[previous][1] > start) previous--; dp.push(Math.max(dp[j], reward + dp[previous + 1])) })
    add('constraints', `Choose non-overlapping jobs to maximize reward. A job ending at t is compatible with a job starting at t. Return the maximum reward. Jobs [start,end,reward]: ${JSON.stringify(intervals)}`, dp.at(-1))
  }
  return tasks
}
export function scoreCapabilities(outcomes, reference, complete = true) {
  const valid = outcomes.filter(v => v === 0 || v === 1), passed = valid.filter(v => v === 1).length
  const result = { verdict: 'current-sample', valid: valid.length, passed, count: 16, paired: 0, losses: 0, gains: 0, pValue: null }
  if (!complete || valid.length < 12) return { ...result, verdict: 'insufficient-evidence' }
  if (!reference) return result
  outcomes.forEach((value, i) => { const ref = reference[i]; if ((value === 0 || value === 1) && (ref === 0 || ref === 1)) {
    result.paired++; if (ref === 1 && value === 0) result.losses++; if (ref === 0 && value === 1) result.gains++
  } })
  if (result.paired < 12) return { ...result, verdict: 'insufficient-evidence' }
  const discordant = result.losses + result.gains
  result.pValue = discordant ? binomialTail(result.losses, discordant, 0.5) : 1
  return { ...result, verdict: result.pValue < 0.05 ? 'significant-decline' : 'no-significant-decline' }
}
