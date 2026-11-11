import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import type { EmbeddingProvider } from '../server/modules/assistant/embedding'
import { clearNearestCacheForTests, clearNearestHitLedgerForTests, forgetNearestCacheKey, nearestCacheKeyFor, upsertVectorIndex, retrieveVectorEvidence, type VectorLegTiming } from '../server/modules/assistant/vector-search'
import { clearPrewarmHistoryForTests, lastPrewarmUsage, prewarmVectorCacheForHotQueries } from '../server/modules/assistant/vector-prewarm'

/**
 * 回归背景：语义召回的全表扫描（33069 行 / 129MB）在冷页时要 6.5s。第一步做的是
 * **零召回损失**的预热：把学生最常问的问法提前跑一遍，让它们命中 `nearestCache`。
 * 这里锁住预热确实写进了缓存，且不会因为预算/配置问题反过来影响请求路径。
 */

const fakeConfig = {
  baseUrl: 'http://127.0.0.1:1/v1',
  apiKey: 'test-key',
  model: 'test-embedding',
  timeoutMs: 5_000
}

/** 与 vector-search.test.ts 同款的确定性词袋向量。 */
function bagVector(text: string, size = 64): number[] {
  const vector = new Array<number>(size).fill(0)
  for (const char of text) {
    const index = char.codePointAt(0)! % size
    vector[index] = (vector[index] ?? 0) + 1
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map(value => value / norm)
}

const fakeEmbedder: EmbeddingProvider = {
  async embedTexts(texts) {
    return texts.map(text => bagVector(text))
  }
}

function seedRun(client: ReturnType<typeof getDatabase>, query: string, times: number): void {
  const statement = client.sqlite.prepare(`
    INSERT INTO assistant_runs (id, request_id, query_hash, query, mode, retrieval_path, created_at)
    VALUES (?, ?, ?, ?, 'local', 'local_database', ?)
  `)
  for (let index = 0; index < times; index += 1) {
    const id = `run-${query}-${index}`
    statement.run(id, id, `h-${id}`, query, Date.now())
  }
}

test('prewarming hot queries writes them into the nearest cache', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-prewarm-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)
    clearNearestCacheForTests()

    await upsertVectorIndex(client, [
      { sourceType: 'entry', sourceId: 'e1', chunkIndex: 0, content: '饮水机的水能喝吗：可以，先放掉隔夜水', title: '饮水机', url: '/k/1', snippet: 's', textHash: 'h1' },
      { sourceType: 'entry', sourceId: 'e2', chunkIndex: 0, content: '宿舍床尺寸：0.9 米乘 1.9 米', title: '宿舍床', url: '/k/2', snippet: 's', textHash: 'h2' }
    ], { config: fakeConfig, embedder: fakeEmbedder })

    // 高频问法：饮水机那句问得最多。
    seedRun(client, '饮水机的水能喝吗', 9)
    seedRun(client, '宿舍床多大', 3)

    const result = await prewarmVectorCacheForHotQueries(client, fakeConfig, query => query, {
      embedder: fakeEmbedder,
      maxQueries: 10
    })
    assert.equal(result.candidates, 2, '两条不同问法都该被取到')
    assert.equal(result.attempted, 2)
    assert.equal(result.warmed, 2, '两条都该真正扫一次并写入缓存')
    assert.equal(result.failed, 0)
    assert.ok(result.evidence >= 1, '预热应当真的取到证据')

    // 关键断言：预热之后再问同一句，向量腿直接命中缓存（学生真实请求走的就是这条路）。
    const timing: VectorLegTiming = {}
    await retrieveVectorEvidence(client, '饮水机的水能喝吗', fakeConfig, undefined, fakeEmbedder, timing)
    assert.equal(timing.cacheHit, true, '预热过的问法必须命中缓存')
    assert.equal(timing.scanMs, undefined, '命中缓存就不该再扫表')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('prewarming dedupes by retrieval query and honours the budget', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-prewarm-budget-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)
    clearNearestCacheForTests()
    await upsertVectorIndex(client, [
      { sourceType: 'entry', sourceId: 'e1', chunkIndex: 0, content: '饮水机的水能喝吗', title: '饮水机', url: '/k/1', snippet: 's', textHash: 'h1' }
    ], { config: fakeConfig, embedder: fakeEmbedder })

    seedRun(client, '问法甲', 5)
    seedRun(client, '问法乙', 4)
    seedRun(client, '问法丙', 3)

    // 三个不同问法都映射到同一个检索问题：只该预热一次。
    const deduped = await prewarmVectorCacheForHotQueries(client, fakeConfig, () => '饮水机的水能喝吗', {
      embedder: fakeEmbedder,
      maxQueries: 10
    })
    assert.equal(deduped.candidates, 3)
    assert.equal(deduped.attempted, 1, '映射到同一检索问题只预热一次')

    // 预算极小：只跑得完第一条就该停下并记 skipped，而不是硬跑完。
    // 时钟走注入的计数器而不是墙钟：整机负载高时，"第一次嵌入还没开始就已经超预算"
    // 会让断言在 0 与 1 之间抖（2026-11-10 全量跑复现过一次）。
    clearNearestCacheForTests()
    let clock = 0
    const tickingEmbedder: EmbeddingProvider = {
      async embedTexts(texts) {
        clock += 30 // 一次嵌入模拟花掉 30ms
        return texts.map(text => bagVector(text))
      }
    }
    const budgeted = await prewarmVectorCacheForHotQueries(client, fakeConfig, query => query, {
      embedder: tickingEmbedder,
      maxQueries: 10,
      budgetMs: 10,
      now: () => clock
    })
    assert.equal(budgeted.attempted, 1, '预算只够跑第一条')
    assert.equal(budgeted.skipped, 2, '剩下两条应记为 skipped')
    assert.equal(budgeted.warmed, 1)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('prewarming ranks queries that reach the vector leg above deterministic ones', async () => {
  // 上一轮线上实测的教训：只按频次取前 N，挑中的多数是 `国奖多少` 这类确定性问法，
  // 它们根本走不到向量腿，预热等于白做。所以排序要优先"真的走向量腿"的问法：
  //   · 走到过 web_search（本地检索跑过却没够用）→ 一定会走向量腿
  //   · analysis_ms 到秒级（确定性快路只有几十~几百毫秒）→ 跑过改写腿
  const directory = mkdtempSync(join(tmpdir(), 'yeu-prewarm-rank-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)
    clearNearestCacheForTests()
    clearNearestHitLedgerForTests()
    clearPrewarmHistoryForTests()
    await upsertVectorIndex(client, [
      { sourceType: 'entry', sourceId: 'e1', chunkIndex: 0, content: '附近理发店推荐', title: '理发店', url: '/k/1', snippet: 's', textHash: 'h1' }
    ], { config: fakeConfig, embedder: fakeEmbedder })

    const insert = client.sqlite.prepare(`
      INSERT INTO assistant_runs (id, request_id, query_hash, query, mode, retrieval_path, used_web_search, analysis_ms, created_at)
      VALUES (?, ?, ?, ?, 'local', ?, ?, ?, ?)
    `)
    // 高频但确定性的问法：次数远高于另一个，但从不走向量腿。
    for (let index = 0; index < 30; index += 1) {
      insert.run(`det-${index}`, `det-${index}`, `h-det-${index}`, '国奖多少', 'local_database', 0, 40, Date.now())
    }
    // 低频但真的走过检索腿：只出现 2 次。
    for (let index = 0; index < 2; index += 1) {
      insert.run(`rag-${index}`, `rag-${index}`, `h-rag-${index}`, '附近理发店推荐', 'web_search', 1, 4200, Date.now())
    }

    // 只允许预热 1 条：应当挑中走向量腿的那条，而不是频次最高的那条。
    const result = await prewarmVectorCacheForHotQueries(client, fakeConfig, query => query, {
      embedder: fakeEmbedder,
      maxQueries: 1
    })
    assert.equal(result.attempted, 1)
    const ragTiming: VectorLegTiming = {}
    await retrieveVectorEvidence(client, '附近理发店推荐', fakeConfig, undefined, fakeEmbedder, ragTiming)
    assert.equal(ragTiming.cacheHit, true, '走向量腿的低频问法应当被优先预热')
    const detTiming: VectorLegTiming = {}
    await retrieveVectorEvidence(client, '国奖多少', fakeConfig, undefined, fakeEmbedder, detTiming)
    assert.equal(detTiming.cacheHit, undefined, '确定性问法不该占掉唯一的预热名额')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the hit-rate metric counts prewarmed entries that real traffic actually used', async () => {
  // 这是"预热有没有白做"的唯一硬指标，必须能真的测出来：预热一轮 → 有真实请求命中
  // → 下一轮预热报告 previousWarmed/previousHit。线上等一个周期要 6 小时，所以在这里
  // 把"两个周期之间发生了什么"完整演一遍。
  const directory = mkdtempSync(join(tmpdir(), 'yeu-prewarm-hitrate-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)
    clearNearestCacheForTests()
    clearNearestHitLedgerForTests()
    clearPrewarmHistoryForTests()
    await upsertVectorIndex(client, [
      { sourceType: 'entry', sourceId: 'e1', chunkIndex: 0, content: '饮水机的水能喝吗', title: '饮水机', url: '/k/1', snippet: 's', textHash: 'h1' },
      { sourceType: 'entry', sourceId: 'e2', chunkIndex: 0, content: '宿舍床尺寸', title: '宿舍床', url: '/k/2', snippet: 's', textHash: 'h2' }
    ], { config: fakeConfig, embedder: fakeEmbedder })
    seedRun(client, '饮水机的水能喝吗', 5)
    seedRun(client, '宿舍床多大', 4)

    const first = await prewarmVectorCacheForHotQueries(client, fakeConfig, query => query, {
      embedder: fakeEmbedder,
      maxQueries: 10
    })
    assert.equal(first.attempted, 2)
    assert.equal(first.previousWarmed, 0, '第一轮没有上一轮记录')

    // 模拟真实流量：只有其中一条问法被人问了（另一条预热了但没人用）。
    const hitTiming: VectorLegTiming = {}
    await retrieveVectorEvidence(client, '饮水机的水能喝吗', fakeConfig, undefined, fakeEmbedder, hitTiming)
    assert.equal(hitTiming.cacheHit, true)

    // 下一个预热周期：应当报告 2 条预热里有 1 条被真的用过，并且强制重扫（不吃自己的缓存）。
    const second = await prewarmVectorCacheForHotQueries(client, fakeConfig, query => query, {
      embedder: fakeEmbedder,
      maxQueries: 10
    })
    assert.equal(second.previousWarmed, 2, '上一轮预热了 2 条')
    assert.equal(second.previousHit, 1, '只有被真实请求问过的那条算命中')
    assert.equal(second.warmed, 2, '每轮都要重扫，不能靠自己的缓存蒙混过去')
    assert.equal(second.attempted, 2)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a hit still counts after the cache entry expires', async () => {
  // 线上真实踩到的坑：那个 6 小时周期里 40 条预热里有 2 条真的被问过（4 次请求），
  // 下一轮却报告 previousHit=0 —— 因为命中发生在 10 分钟 TTL 之后，条目早被删掉，
  // 而当时的指标读的是"存活条目上的命中数"。命中必须记在不受过期影响的台账上。
  const directory = mkdtempSync(join(tmpdir(), 'yeu-prewarm-ledger-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)
    clearNearestCacheForTests()
    clearNearestHitLedgerForTests()
    clearPrewarmHistoryForTests()
    await upsertVectorIndex(client, [
      { sourceType: 'entry', sourceId: 'e1', chunkIndex: 0, content: '饮水机的水能喝吗', title: '饮水机', url: '/k/1', snippet: 's', textHash: 'h1' }
    ], { config: fakeConfig, embedder: fakeEmbedder })
    seedRun(client, '饮水机的水能喝吗', 5)

    await prewarmVectorCacheForHotQueries(client, fakeConfig, query => query, { embedder: fakeEmbedder, maxQueries: 10 })

    // 真实请求命中一次，随后条目因过期/淘汰被丢掉（这里直接删掉，等价效果）。
    await retrieveVectorEvidence(client, '饮水机的水能喝吗', fakeConfig, undefined, fakeEmbedder)
    forgetNearestCacheKey(nearestCacheKeyFor('饮水机的水能喝吗'))

    const usage = lastPrewarmUsage()
    assert.equal(usage.warmed, 1)
    assert.equal(usage.hit, 1, '命中不能因为条目过期就消失')

    // 下一轮结算同样要看到这 1 次命中。
    const next = await prewarmVectorCacheForHotQueries(client, fakeConfig, query => query, { embedder: fakeEmbedder, maxQueries: 10 })
    assert.equal(next.previousWarmed, 1)
    assert.equal(next.previousHit, 1)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('prewarming is a no-op without an embedding endpoint', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-prewarm-off-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)
    clearNearestCacheForTests()
    seedRun(client, '饮水机的水能喝吗', 5)

    const result = await prewarmVectorCacheForHotQueries(
      client,
      { baseUrl: '', apiKey: '', model: '', timeoutMs: 5_000 },
      query => query,
      { embedder: fakeEmbedder }
    )
    assert.equal(result.attempted, 0, '没配嵌入端点时不该做任何事')
    assert.equal(result.warmed, 0)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
