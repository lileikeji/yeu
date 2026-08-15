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
  collectVectorIndexRows,
  mergeVectorEvidence,
  pruneVectorIndex,
  retrieveVectorEvidence,
  upsertVectorIndex,
  vectorSearchReady
} from '../server/modules/assistant/vector-search'
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
