import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  blobToVector,
  cosineSimilarity,
  embeddingTextHash,
  vectorToBlob,
  type EmbeddingProvider
} from '../server/modules/assistant/embedding'
import {
  chunkText,
  clearNearestCacheForTests,
  clearNearestHitLedgerForTests,
  collectVectorIndexRows,
  embedSessionMemoryRows,
  mergeVectorEvidence,
  pruneVectorIndex,
  quantizedIndexReady,
  rebuildQuantizedVectorIndex,
  retrieveVectorEvidence,
  sessionMemorySemanticScores,
  upsertVectorIndex,
  vectorSearchReady
} from '../server/modules/assistant/vector-search'
import {
  hashSessionKey,
  rememberExtractedFacts,
  rememberSessionTurn,
  type SessionMemoryRecord
} from '../server/modules/assistant/memory'
import { seedAssistantKnowledge } from './seed-assistant-knowledge'

const fakeConfig = {
  baseUrl: 'http://fake-embedding.invalid/v1',
  apiKey: 'test-key',
  model: 'test-model',
  timeoutMs: 5000
}

/** Deterministic bag-of-chars vector: similar Chinese text lands nearby. */
function bagVector(text: string, dim = 24): number[] {
  const vector = new Array<number>(dim).fill(0)
  for (const char of text) {
    const index = (char.codePointAt(0) ?? 0) % dim
    vector[index] = (vector[index] ?? 0) + 1
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  return norm === 0 ? vector : vector.map(value => value / norm)
}

const fakeEmbedder: EmbeddingProvider = {
  async embedTexts(texts) {
    return texts.map(text => bagVector(text))
  }
}

test('vector blobs are raw little-endian float32 (sqlite-vec compatible)', () => {
  const vector = [0.1, 0.2, -0.3, 1]
  const blob = vectorToBlob(vector)
  assert.equal(blob.length, vector.length * 4)
  const roundTrip = blobToVector(blob)
  assert.equal(roundTrip.length, vector.length)
  roundTrip.forEach((value, index) => {
    assert.ok(Math.abs(value - vector[index]!) < 1e-6, `float32 roundtrip of ${vector[index]} is ${value}`)
  })
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1)
  assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0)
  assert.equal(embeddingTextHash('宿舍床多大'), embeddingTextHash('宿舍床多大'))
  assert.notEqual(embeddingTextHash('宿舍床多大'), embeddingTextHash('食堂几点开饭'))
})

test('chunkText slices long documents with overlap', () => {
  assert.deepEqual(chunkText('短文本'), ['短文本'])
  const long = '甲'.repeat(1000)
  const chunks = chunkText(long, 300, 50)
  assert.ok(chunks.length >= 4)
  assert.ok(chunks.every(chunk => chunk.length <= 300))
  // overlap carries content across chunk boundaries
  assert.ok(chunks[0]!.includes('甲'))
  assert.ok(chunks[chunks.length - 1]!.includes('甲'))
})

test('vector index builds, retrieves and prunes with a deterministic embedder', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-vector-search-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    seedAssistantKnowledge({ apply: true, databasePath })
    const client = getDatabase(databasePath)

    const rows = collectVectorIndexRows(client)
    assert.ok(rows.length >= 10, 'seeded knowledge produces chunks')

    const first = await upsertVectorIndex(client, rows, { config: fakeConfig, embedder: fakeEmbedder })
    assert.ok(first.embedded > 0)

    // Idempotent second run: everything skipped.
    const second = await upsertVectorIndex(client, rows, { config: fakeConfig, embedder: fakeEmbedder })
    assert.ok(second.skipped >= first.embedded)

    assert.equal(vectorSearchReady(client), true)

    const results = await retrieveVectorEvidence(client, '饮水机的水能喝吗', fakeConfig, 5, fakeEmbedder)
    assert.ok(results.length >= 1, 'nearest chunks are returned')
    assert.ok(results.some(item => item.text.includes('饮水机') || item.text.includes('水')), 'relevant chunk surfaces')
    assert.ok(results.every(item => item.score >= 0 && item.score <= 100))
    assert.ok(results.every(item => typeof item.url === 'string'))
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('index scaling limits cap documents and claims', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-vector-limits-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    // seed a document with long text + many claims
    const now = Date.now()
    client.sqlite.prepare(`
      INSERT INTO knowledge_documents (id, kind, title, content_hash, extracted_text, status, captured_at, processed_at, created_at, updated_at)
      VALUES ('doc-long', 'webpage', '长文档', 'h1', ?, 'ready', ?, ?, ?, ?)
    `).run('甲'.repeat(3000), now, now, now, now)
    for (let i = 0; i < 12; i += 1) {
      client.sqlite.prepare(`
        INSERT INTO knowledge_claims (id, category, title, statement, review_status, published_at, created_at, updated_at)
        VALUES (?, 'c', ?, ?, 'published', ?, ?, ?)
      `).run('claim-' + i, '声明' + i, '声明内容' + i, now, now, now)
    }

    const all = collectVectorIndexRows(client)
    const docs = all.filter(row => row.sourceType === 'document')
    const claims = all.filter(row => row.sourceType === 'claim')
    assert.equal(docs.length, 1, 'long document is capped to one chunk by default')
    assert.ok(claims.length <= 8000 && claims.length >= 12)

    // explicit limits: all document chunks, no claim cap
    const expanded = collectVectorIndexRows(client, { documentChunksPerItem: 0, claimLimit: 0 })
    assert.ok(expanded.filter(row => row.sourceType === 'document').length > 1, 'documentChunksPerItem: 0 keeps all chunks')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('vector search degrades gracefully when unconfigured or empty', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-vector-off-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)

    // Table exists but is empty.
    assert.equal(vectorSearchReady(client), true)
    const empty = await retrieveVectorEvidence(client, '宿舍床多大', fakeConfig, 5, fakeEmbedder)
    assert.deepEqual(empty, [])

    // No embedding config -> off, no calls made.
    const unconfigured = await retrieveVectorEvidence(client, '宿舍床多大', {
      baseUrl: '',
      apiKey: '',
      model: 'x',
      timeoutMs: 1000
    }, 5, fakeEmbedder)
    assert.deepEqual(unconfigured, [])

    // merge deduplicates by url/title
    const merged = mergeVectorEvidence(
      [{ title: 'A', url: '/a' }, { title: 'B', url: '/b' }],
      [{ title: 'A', url: '/a', snippet: '', source: 'site', text: 'a', score: 50 }, { title: 'C', url: '/c', snippet: '', source: 'site', text: 'c', score: 60 }]
    )
    assert.deepEqual(merged.map(item => item.title), ['A', 'B', 'C'])

    // prune removes everything when no source remains valid
    const rows = [{ sourceType: 'entry', sourceId: 'x', chunkIndex: 0, content: '内容', title: 't', url: '', snippet: 's', textHash: 'h' }]
    await upsertVectorIndex(client, rows, { config: fakeConfig, embedder: fakeEmbedder })
    const before = client.sqlite.prepare('SELECT count(*) AS n FROM assistant_embeddings').get() as { n: number }
    assert.equal(before.n, 1)
    const pruned = pruneVectorIndex(client, new Set())
    assert.equal(pruned, 1)
    const after = client.sqlite.prepare('SELECT count(*) AS n FROM assistant_embeddings').get() as { n: number }
    assert.equal(after.n, 0)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('offline prune never deletes runtime-managed memory rows or truncated sources', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-vector-prune-scope-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)

    // 一条离线管理的 entry + 一条运行时管理的 memory。
    await upsertVectorIndex(client, [
      { sourceType: 'entry', sourceId: 'gone-entry', chunkIndex: 0, content: '将被清理的条目', title: 't', url: '', snippet: 's', textHash: 'h1' }
    ], { config: fakeConfig, embedder: fakeEmbedder })
    await upsertVectorIndex(client, [
      { sourceType: 'memory', sourceId: 'keep-memory', chunkIndex: 0, content: '用户偏好', title: 'preference', url: '', snippet: 's', textHash: 'h2' }
    ], { config: fakeConfig, embedder: fakeEmbedder })
    await upsertVectorIndex(client, [
      { sourceType: 'claim', sourceId: 'cap-truncated-claim', chunkIndex: 0, content: '被上限截断的主张', title: 'c', url: '', snippet: 's', textHash: 'h3' }
    ], { config: fakeConfig, embedder: fakeEmbedder })

    const count = (type: string) => (client.sqlite.prepare(
      'SELECT count(*) AS n FROM assistant_embeddings WHERE source_type = ?'
    ).get(type) as { n: number }).n

    // 采集集为空（模拟源被归档）：entry 应被清理。
    const pruned = pruneVectorIndex(client, new Set(), { protectedSourceTypes: ['claim', 'document'] })
    assert.equal(pruned, 1, '只有受离线管理的 entry 会被清理')
    assert.equal(count('entry'), 0)
    assert.equal(count('memory'), 1, '会话记忆由运行时维护，离线重建不得删除')
    assert.equal(count('claim'), 1, '被上限截断的来源不在采集集里，不等于失效')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the general vector channel never returns session memory rows', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-vector-no-memory-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)

    // 一条知识条目 + 一条与提问措辞更接近的会话记忆。
    await upsertVectorIndex(client, [
      { sourceType: 'entry', sourceId: 'entry-1', chunkIndex: 0, content: '竞赛获奖奖金标准：A类一等奖个人6000元', title: '竞赛奖金标准', url: '/k/1', snippet: 's', textHash: 'h-entry' }
    ], { config: fakeConfig, embedder: fakeEmbedder })
    await upsertVectorIndex(client, [
      { sourceType: 'memory', sourceId: 'mem-1', chunkIndex: 0, content: '省一能拿多少奖金', title: 'answered', url: '', snippet: 's', textHash: 'h-mem' }
    ], { config: fakeConfig, embedder: fakeEmbedder })

    // 提问与记忆行几乎同文：若不过滤，记忆行必然排第一并被当成引用来源
    // （线上表现为答案里出现 “也可以核对“answered””，且跨会话泄漏他人记忆）。
    const results = await retrieveVectorEvidence(client, '省一能拿多少奖金', fakeConfig, 10, fakeEmbedder)
    assert.equal(results.length, 1, '只有知识条目应当进入通用向量通道')
    assert.equal(results[0]!.title, '竞赛奖金标准')
    assert.equal(results.some(item => item.title === 'answered'), false)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('session memory facts embed into the vector index and skip unchanged rows', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-vector-mem-embed-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)
    const sessionKey = hashSessionKey('mem-embed-session')

    const added = rememberExtractedFacts(client, sessionKey, '我喜欢晚上学习效率更高', [
      { kind: 'preference', content: '用户认为自己晚上学习效率更高' }
    ])
    assert.equal(added, 1)

    const first = await embedSessionMemoryRows(client, sessionKey, ['preference'], fakeConfig, fakeEmbedder)
    assert.equal(first, 1, 'one preference row embedded')
    const rows = client.sqlite.prepare(
      "SELECT source_type, source_id, title FROM assistant_embeddings WHERE source_type = 'memory'"
    ).all() as Array<{ source_type: string, source_id: string, title: string }>
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.source_id.length > 0, true)
    assert.equal(rows[0]!.title, 'preference')

    // Unchanged content is skipped on a second pass.
    const second = await embedSessionMemoryRows(client, sessionKey, ['preference'], fakeConfig, fakeEmbedder)
    assert.equal(second, 0, 'unchanged memory rows are skipped')

    // Only requested kinds are embedded; answered turns are embedded too once present.
    rememberSessionTurn(client, sessionKey, {
      query: '我晚上学习效率更高',
      answer: '测试回答',
      confidence: 0.9,
      mode: 'ai'
    })
    const third = await embedSessionMemoryRows(client, sessionKey, ['answered'], fakeConfig, fakeEmbedder)
    assert.equal(third, 1, 'answered turn embedded when requested')
    const fourth = await embedSessionMemoryRows(client, sessionKey, ['answered'], fakeConfig, fakeEmbedder)
    assert.equal(fourth, 0, 'answered turn skipped when unchanged')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('session memory semantic scores are session-scoped and return cosine similarities', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-vector-mem-scores-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)
    const sessionA = hashSessionKey('mem-scores-a')
    const sessionB = hashSessionKey('mem-scores-b')
    rememberExtractedFacts(client, sessionA, '我喜欢晚上学习', [
      { kind: 'preference', content: '用户认为自己晚上学习效率更高' }
    ])
    rememberExtractedFacts(client, sessionB, '我喜欢踢足球', [
      { kind: 'preference', content: '用户喜欢踢足球' }
    ])
    await embedSessionMemoryRows(client, sessionA, ['preference'], fakeConfig, fakeEmbedder)
    await embedSessionMemoryRows(client, sessionB, ['preference'], fakeConfig, fakeEmbedder)

    const scoresA = await sessionMemorySemanticScores(client, sessionA, '我刚才说我一般喜欢什么时候学习', fakeConfig, 8, fakeEmbedder)
    assert.ok(scoresA.size >= 1, 'session A has semantic scores')
    for (const value of scoresA.values()) {
      assert.ok(value > 0 && value <= 1)
    }

    // Session B memories must not leak into session A's scores.
    const memoryB = client.sqlite.prepare(
      'SELECT id FROM assistant_session_memory WHERE session_key = ? AND kind = ?'
    ).get(sessionB, 'preference') as { id: string }
    assert.equal(scoresA.has(memoryB.id), false, 'other-session memory is excluded')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the quantized two-stage index returns the same neighbours as the full scan', async () => {
  // 两段式（vec0 int8 候选 + float32 精排）必须与全表扫描给出**同一批**邻居，
  // 否则就是静默的召回变化——线上同源实测 top-40 100% 一致，这里锁住这个契约。
  const directory = mkdtempSync(join(tmpdir(), 'yeu-quant-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)
    clearNearestCacheForTests()
    clearNearestHitLedgerForTests()
    const indexRows = []
    for (let i = 0; i < 40; i += 1) {
      indexRows.push({
        sourceType: 'entry' as const,
        sourceId: `e${i}`,
        chunkIndex: 0,
        content: `第${i}条：饮水机的水能喝吗，宿舍床尺寸，校园快递点位置`,
        title: `条目${i}`,
        url: `/k/${i}`,
        snippet: 's',
        textHash: `h${i}`
      })
    }
    await upsertVectorIndex(client, indexRows, { config: fakeConfig, embedder: fakeEmbedder })

    // 基线：强制走全表扫描（把最近邻缓存清掉，且此时还没有量化表 → quantizedIndexReady 为 false）
    assert.equal(quantizedIndexReady(client), false, '没建量化表时就绪判定应为 false')
    const baseline = await retrieveVectorEvidence(client, '饮水机的水能喝吗', fakeConfig, 5, fakeEmbedder)
    assert.ok(baseline.length > 0)

    // 建量化索引后，读取路径应当切换到两段式，并且给出同一批邻居。
    const rebuilt = rebuildQuantizedVectorIndex(client)
    assert.equal(rebuilt.total, 40)
    assert.equal(rebuilt.written, 40)
    assert.equal(quantizedIndexReady(client), true)

    clearNearestCacheForTests()
    const viaQuantized = await retrieveVectorEvidence(client, '饮水机的水能喝吗', fakeConfig, 5, fakeEmbedder)
    assert.deepEqual(
      viaQuantized.map(item => item.title),
      baseline.map(item => item.title),
      '两段式与全表扫描必须给出同样的邻居'
    )
    assert.deepEqual(
      viaQuantized.map(item => item.score),
      baseline.map(item => item.score),
      '分数也要一致（score 由余弦距离换算）'
    )

    // 主表行数与候选表不一致时（例如索引过期）必须退回全表扫描，而不是少召回。
    // 就绪判定有 60s 的模块级状态缓存（避免每次查询都 COUNT 全表），这里显式传
    // recheckMs=0 绕过缓存直接验证行数比对本身；直删 SQL 不经过 upsert/prune，
    // 任何失效钩子都帮不到它。
    client.sqlite.prepare("DELETE FROM assistant_embeddings WHERE id = (SELECT id FROM assistant_embeddings LIMIT 1)").run()
    assert.equal(quantizedIndexReady(client, 0), false, '行数不一致就该判定为不可用')
    clearNearestCacheForTests()
    const afterDrift = await retrieveVectorEvidence(client, '饮水机的水能喝吗', fakeConfig, 5, fakeEmbedder)
    assert.ok(afterDrift.length > 0, '退回全表扫描后仍要有结果')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a repeated query reuses the nearest-neighbour cache instead of rescanning', async () => {
  // 线上实测：`vec_distance_cosine` 的 ORDER BY 会把 33069 行、约 129MB 向量整表读一遍，
  // 空闲时 p50=117ms，页面被挤掉时 max=4577ms。学生重复问同一句话很常见，命中缓存后
  // 嵌入与扫描都应该完全跳过。
  const directory = mkdtempSync(join(tmpdir(), 'yeu-vector-cache-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    // 缓存是模块级的：同进程里前面的用例已经问过同一句话，必须先清掉。
    clearNearestCacheForTests()
    const client = getDatabase(databasePath)
    runMigrations(client)
    await upsertVectorIndex(client, [
      { sourceType: 'entry', sourceId: 'e1', chunkIndex: 0, content: '饮水机的水能喝吗：可以，先放掉隔夜水', title: '饮水机', url: '/k/1', snippet: 's', textHash: 'h1' },
      { sourceType: 'entry', sourceId: 'e2', chunkIndex: 0, content: '宿舍床尺寸：0.9 米乘 1.9 米', title: '宿舍床', url: '/k/2', snippet: 's', textHash: 'h2' }
    ], { config: fakeConfig, embedder: fakeEmbedder })

    let embeds = 0
    const countingEmbedder: EmbeddingProvider = {
      async embedTexts(texts) {
        embeds += texts.length
        return texts.map(text => bagVector(text))
      }
    }

    // 第一次：真的要嵌入并扫描。
    const firstTiming = { } as Parameters<typeof retrieveVectorEvidence>[5]
    const first = await retrieveVectorEvidence(client, '饮水机的水到底能不能直接喝呢', fakeConfig, 5, countingEmbedder, firstTiming)
    assert.ok(first.length >= 1)
    assert.equal(firstTiming?.cacheHit, undefined, '首次不该命中缓存')
    const embedsAfterFirst = embeds
    assert.ok(embedsAfterFirst >= 1, '首次必须真的调嵌入')

    // 第二次同问：嵌入与扫描都跳过。
    const secondTiming = { } as Parameters<typeof retrieveVectorEvidence>[5]
    const second = await retrieveVectorEvidence(client, '饮水机的水到底能不能直接喝呢', fakeConfig, 5, countingEmbedder, secondTiming)
    assert.equal(secondTiming?.cacheHit, true, '同问应当命中最近邻缓存')
    assert.equal(embeds, embedsAfterFirst, '命中缓存后不得再调嵌入')
    assert.deepEqual(
      second.map(item => item.title),
      first.map(item => item.title),
      '命中缓存与首次扫描必须给出同样的邻居'
    )

    // 缓存必须返回副本：调用方并池时改到数组不能污染缓存。
    second.push({ title: '污染', url: '', snippet: '', source: 'site', text: '', score: 1 })
    const thirdTiming = { } as Parameters<typeof retrieveVectorEvidence>[5]
    const third = await retrieveVectorEvidence(client, '饮水机的水到底能不能直接喝呢', fakeConfig, 5, countingEmbedder, thirdTiming)
    assert.equal(third.length, first.length, '缓存内容不能被调用方改到')

    // 不同 limit 是不同结果集，不能混用。
    const otherLimitTiming = { } as Parameters<typeof retrieveVectorEvidence>[5]
    await retrieveVectorEvidence(client, '饮水机的水能喝吗', fakeConfig, 2, countingEmbedder, otherLimitTiming)
    assert.equal(otherLimitTiming?.cacheHit, undefined, 'limit 不同不能命中同一缓存项')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
