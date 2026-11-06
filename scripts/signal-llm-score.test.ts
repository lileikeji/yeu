import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decideWithLlm,
  monthKey,
  readCache,
  recordCall,
  remainingCalls,
  scoreTwice,
  thresholdForTier,
  writeCache
} from '../server/modules/signal/llm-score'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const config = {
  baseUrl: 'https://gateway.example.com/v1',
  apiKey: 'test-key',
  model: 'test-model',
  monthlyCallLimit: 4,
  timeoutMs: 3_000
}

function stubFetch(scores: Array<number | null>): typeof fetch {
  let index = 0
  return (async () => {
    const score = scores[index++]
    if (score === null) return new Response('boom', { status: 500 })
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ score, reason: '测试' }) } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

test('llm: 两次评分取平均，任一次失败算未评分', async () => {
  const ok = await scoreTwice(config, '标题', '正文', { fetchImpl: stubFetch([80, 60]) })
  assert.deepEqual(ok, { a: 80, b: 60 })
  const half = await scoreTwice(config, '标题', '正文', { fetchImpl: stubFetch([70, null]) })
  assert.equal(half, null)
})

test('llm: 分级门槛与状态机', () => {
  assert.equal(thresholdForTier('A'), 55)
  assert.equal(thresholdForTier('B'), 62)
  assert.equal(thresholdForTier('C'), 70)
  assert.equal(decideWithLlm(null, 'A'), 'unknown')
  assert.equal(decideWithLlm(70, 'C'), 'selected')
  assert.equal(decideWithLlm(60, 'C'), 'hidden')
})

test('llm: 月度额度按自然月累计，用完即止', () => {
  const cache = { scores: {}, usage: {} as Record<string, number> }
  const now = Date.UTC(2026, 10, 6)
  assert.equal(remainingCalls(cache, config, now), 4)
  recordCall(cache, now)
  recordCall(cache, now)
  assert.equal(cache.usage[monthKey(now)], 2)
  assert.equal(remainingCalls(cache, config, now), 2)
  assert.equal(remainingCalls(cache, config, Date.UTC(2026, 11, 1)), 4)
})

test('llm: 缓存读写往返（缺失文件视为空）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signal-llm-'))
  const path = join(dir, 'cache.json')
  try {
    assert.deepEqual(readCache(path), { scores: {}, usage: {} })
    writeCache({ scores: { 'notice:1': { a: 70, b: 80, model: 'm', at: 1 } }, usage: { '2026-11': 2 } }, path)
    const back = readCache(path)
    assert.equal(back.scores['notice:1']!.a, 70)
    assert.equal(back.usage['2026-11'], 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
