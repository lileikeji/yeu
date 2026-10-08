import assert from 'node:assert/strict'
import test from 'node:test'
import { clearCompetitionHintCacheForTests, competitionHintsForQuery, primeCompetitionHints } from '../server/modules/assistant/competition-classifier'
import { clearInflightForTests, coalesceInFlight, inflightCount } from '../server/modules/assistant/inflight'

/**
 * 回归背景：网关有两条硬约束——进程内并发上限（`activeGatewayCalls >= 2` 直接抛
 * AI_BUSY）与每分钟请求数配额（429 + retry-after=24）。两者都会让**后来者**的增强
 * 调用被静默丢掉：调用方 catch 成 null 就退回保守行为，用户看到的是"比赛少算了分"
 * "意图没切对"，没有任何报错。
 *
 * 治理手段有两条，都在这个文件里锁住：
 *  1. 同问在途合并（本文件）：并发问同一句话只发一次网关调用，后来者复用结果。
 *  2. 名额等待（`waitForSlotMs`）：名额满时等一小会儿而不是立刻抛 AI_BUSY。
 *     它依赖进程内的 activeGatewayCalls，无法在单测里直接构造，靠线上并发探针复测。
 */

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('coalesceInFlight runs once for concurrent callers of the same key', async () => {
  clearInflightForTests()
  let runs = 0
  const run = async () => {
    runs += 1
    await sleep(20)
    return `value-${runs}`
  }
  const results = await Promise.all([
    coalesceInFlight('k', run),
    coalesceInFlight('k', run),
    coalesceInFlight('k', run)
  ])
  assert.equal(runs, 1, '同一 key 并发三次只能真正执行一次')
  assert.deepEqual(results, ['value-1', 'value-1', 'value-1'], '所有调用者拿到同一份结果')
  assert.equal(inflightCount(), 0, '落定后必须清空在途表')
})

test('coalesceInFlight only merges in-flight work, never caches the result', async () => {
  clearInflightForTests()
  let runs = 0
  const run = async () => {
    runs += 1
    return runs
  }
  assert.equal(await coalesceInFlight('k2', run), 1)
  // 第一次已落定：第二次必须重新执行（真正的结果缓存由各调用点自己负责）
  assert.equal(await coalesceInFlight('k2', run), 2)
  assert.equal(runs, 2)
})

test('coalesceInFlight keeps different keys apart', async () => {
  clearInflightForTests()
  const keys: string[] = []
  const run = (key: string) => async () => {
    keys.push(key)
    await sleep(10)
    return key
  }
  const [a, b] = await Promise.all([
    coalesceInFlight('alpha', run('alpha')),
    coalesceInFlight('beta', run('beta'))
  ])
  assert.equal(a, 'alpha')
  assert.equal(b, 'beta')
  assert.equal(keys.length, 2, '不同 key 各自执行')
})

test('a failed in-flight call is not inherited by later callers', async () => {
  clearInflightForTests()
  let runs = 0
  const failing = async () => {
    runs += 1
    await sleep(10)
    throw new Error('GATEWAY_DOWN')
  }
  const [first, second] = await Promise.allSettled([
    coalesceInFlight('boom', failing),
    coalesceInFlight('boom', failing)
  ])
  assert.equal(first.status, 'rejected')
  assert.equal(second.status, 'rejected', '在途的失败要透传给所有调用者')
  assert.equal(runs, 1, '失败也只在途执行一次')
  assert.equal(inflightCount(), 0, '失败后必须清空，否则后续请求会一直复用这个失败')

  // 落定后再问：必须重新尝试，不能被上一次的失败粘住。
  await assert.rejects(coalesceInFlight('boom', failing))
  assert.equal(runs, 2, '失败不得被缓存')
})

test('concurrent identical competition questions cost exactly one gateway call', async () => {
  clearCompetitionHintCacheForTests()
  clearInflightForTests()
  const query = '综测 平均成绩85 专业最高90 省级红色文化创意大赛一等奖'
  let calls = 0
  const ask = async () => {
    calls += 1
    await sleep(30)
    return {
      choices: [{ message: { content: JSON.stringify({ name: '省级红色文化创意大赛', category: 'culture', confidence: 0.7 }) } }]
    }
  }

  // 三个并发请求同时问同一个赛事（开学季很常见）。
  await Promise.all([
    primeCompetitionHints(query, ask),
    primeCompetitionHints(query, ask),
    primeCompetitionHints(query, ask)
  ])

  assert.equal(calls, 1, '并发问同一个赛事只该发一次网关调用')
  const hints = competitionHintsForQuery(query)
  assert.equal(hints[0]?.category, 'culture')
  assert.equal(hints[0]?.name, '省级红色文化创意大赛')
})
