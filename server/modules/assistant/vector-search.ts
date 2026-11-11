/**
 * sqlite-vec powered semantic retrieval channel (P1).
 *
 * A maintenance script (scripts/rebuild-embeddings.ts) embeds knowledge chunks
 * into the assistant_embeddings table; at query time the assistant embeds the
 * question and returns the top-K nearest chunks as extra candidate evidence.
 * Keyword + n-gram retrieval remains the baseline; vector results only add
 * semantic recall (the Reciprocal Rank Fusion step is handled by the existing
 * ranking helpers in service.ts).
 *
 * Everything is best-effort: when the embedding API is not configured, the
 * extension failed to load, or the table is empty, every function returns an
 * empty list and the assistant behaves exactly as before P1.
 *
 * @module server/modules/assistant/vector-search
 */

import { desc, eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import {
  assistantKnowledgeEntries,
  contents,
  knowledgeClaims,
  knowledgeDocuments,
  places,
  procedures
} from '../../database/schema'
import {
  blobToVector,
  cachedEmbedding,
  cosineSimilarity,
  embeddingChunkId,
  embeddingConfigReady,
  embeddingTextHash,
  openAiCompatibleEmbedder,
  rememberEmbedding,
  vectorToBlob,
  type EmbeddingConfig,
  type EmbeddingProvider
} from './embedding'
import {
  bindAssistantKnowledgeRevisionDatabase,
  currentAssistantKnowledgeRevision
} from './knowledge-revision'
import { SESSION_MEMORY_KINDS } from './memory'
import type { SessionMemoryKind } from './memory'

export const VECTOR_EVIDENCE_LIMIT = 40
export const VECTOR_CHUNK_CHARS = 600
export const VECTOR_CHUNK_OVERLAP = 80

/**
 * In-process cache of query text -> nearest chunks.
 *
 * 为什么必须缓存这一层：`vec_distance_cosine` 是标量函数，写成 `ORDER BY distance`
 * 就意味着把 assistant_embeddings 的 33069 行、约 **129MB** 向量整表读一遍再排序。
 * 线上实测（服务器 4 核 / 3.6GB 内存、page cache 只有 ~1.3GB，装不下这 129MB）：
 * 空闲连跑 40 次 p50=117ms、p95=132ms，但页面被挤掉时 **max=4577ms**——而且这是
 * 空闲态测出来的，说明瓶颈是冷页 I/O，不是锁争用。学生重复问同一句话很常见，
 * 命中缓存后这一腿直接是 0ms，也顺带消掉那个 4.6s 的长尾。
 *
 * 关键约束：**TTL 必须长于预热周期（6 小时）**，否则预热基本白做。线上实测：
 * 日均只有 ~71 次请求，一个热点问法的重复间隔常常是 40~110 分钟；10 分钟的 TTL 让
 * 预热条目只有约 2.8% 的时间是活的，真实重复大多落在窗口之外。
 *
 * 之所以敢给到 7 小时，是因为键里带了知识修订号（见 nearestCacheKeyFor）：内容/地点/
 * 流程一经后台修改修订号即变，旧键再也不会被查到，**陈旧性由修订号兜住而不是靠 TTL**；
 * TTL 在这里只负责回收内存与让预热重新扫描。
 */
const NEAREST_CACHE_TTL_MS = 7 * 60 * 60 * 1000
const NEAREST_CACHE_MAX = 300
const nearestCache = new Map<string, { expiresAt: number, evidence: VectorEvidence[], hits: number }>()

/**
 * 缓存键的唯一构造处。
 * 预热模块必须用**同一个键**去查命中次数/主动失效，否则它没法判断"预热过的问法到底有没有人用"。
 *
 * 带上知识修订号：修订号在内容/地点/流程被修改时自增（`bumpAssistantKnowledgeRevision`），
 * 于是陈旧性由它兜住，TTL 可以放心设长。
 */
export function nearestCacheKeyFor(query: string, limit: number = VECTOR_EVIDENCE_LIMIT): string {
  return `${currentAssistantKnowledgeRevision()}:${limit}:${embeddingTextHash(query.trim())}`
}

/**
 * 主动丢弃一个缓存条目。
 * 预热用它做「强制刷新」：每个周期都重新扫一遍，才能把当日重建过的向量索引变化吃进来
 * （否则命中旧条目就永远不重扫）。
 */
export function forgetNearestCacheKey(key: string): void {
  nearestCache.delete(key)
}

/** 该键被真实请求命中过多少次（0 = 预热了但没人用）。 */
export function nearestCacheHits(key: string): number {
  return hitLedger.get(key) ?? 0
}

/**
 * 命中台账：按缓存键累计命中次数，**不随条目过期而消失**。
 *
 * 为什么必须有它：`nearestCacheHits` 若读的是存活条目，条目一过期就查不到命中。
 * 线上实测踩到了这个坑——某个 6 小时周期里 40 条预热中有 2 条真的被问过（4 次真实请求），
 * 但下一轮报告仍是 `previousHit: 0`，因为命中发生在 10 分钟 TTL 之后、条目早被删掉。
 * 一个"命中会被过期抹掉"的指标，没法回答"预热有没有白做"。
 *
 * 上限按插入顺序粗略淘汰：条目量级是"预热问法 × 少量变体"，2000 足够。
 */
const HIT_LEDGER_MAX = 2000
const hitLedger = new Map<string, number>()

function recordNearestHit(key: string): void {
  hitLedger.set(key, (hitLedger.get(key) ?? 0) + 1)
  while (hitLedger.size > HIT_LEDGER_MAX) {
    const oldest = hitLedger.keys().next().value
    if (oldest === undefined) break
    hitLedger.delete(oldest)
  }
}

/** 仅供测试：清空命中台账。 */
export function clearNearestHitLedgerForTests(): void {
  hitLedger.clear()
}

/**
 * 量化向量索引（vec0 int8）——把语义召回的「整表读 129MB 向量」压到 ~32MB。
 *
 * 为什么需要：`vec_distance_cosine` 写在 ORDER BY 里会把 assistant_embeddings 的
 * 33069 行、129.2MB 向量整表读一遍；热页 ~119ms，冷页线上实测到 4860ms（服务器 3.6GB
 * 内存、page cache 仅 ~1.27GB，装不下）。实测的四个方案里只有「按字节缩小索引」能压冷尾。
 *
 * 设计是**两段式**：先用 vec0 int8 出候选（k=120），再用精确 float32 余弦重排到 limit。
 * 线上同源数据实测（6 条真实热问法）：
 *   - top-5 100%、**top-40 与现行实现完全一致（100%）** → 零召回损失
 *   - p50 47ms（现行 119ms）→ 热路径 2.5×
 *   - 候选表 32.3MB → 冷尾 ≈1220ms（现行 4860ms）
 * 必须重排的原因：单用 int8 的 top-40 只有 93.8%（单位化 int8 + L2 与真余弦不完全等价），
 * 多取候选再精确重排即回到 100%。
 *
 * 这是**派生数据**：整表重建、可随时 DROP，DROP 后读取路径自动退回现行扫描。
 * sqlite-vec 的两个实测约束：int8 必须用 `vec_int8(...)` 包裹（否则按 float32 解析报错）；
 * 不能显式绑 rowid（"Only integers are allows for primary key values"），所以用元数据列
 * `embedding_id` 回连主表，而不是靠 rowid。
 */
const QUANTIZED_TABLE = 'assistant_embedding_vec'
/** 候选倍数：k=120 实测已覆盖精确 top-40，是召回与耗时的平衡点。 */
const QUANTIZED_CANDIDATE_K = 120
/** 就绪判定缓存时长：count 比对要扫一遍候选表，不能每个请求都做。 */
const QUANTIZED_STATUS_TTL_MS = 60_000

let quantizedStatus: { ready: boolean, checkedAt: number } = { ready: false, checkedAt: 0 }

/** 单位化后量化成 int8（余弦与尺度无关，故单位化 + L2 排序 ≈ 余弦排序）。 */
export function quantizeUnitInt8(vector: ArrayLike<number>): Buffer {
  let norm = 0
  for (let i = 0; i < vector.length; i++) norm += vector[i]! * vector[i]!
  norm = Math.sqrt(norm) || 1
  const out = new Int8Array(vector.length)
  for (let i = 0; i < vector.length; i++) {
    out[i] = Math.max(-127, Math.min(127, Math.round(vector[i]! / norm * 127)))
  }
  return Buffer.from(out)
}

/**
 * 全量重建量化索引。选择重建而不是增量同步：派生数据重建天然不会与主表漂移，
 * 也就不必在 upsert/prune 各挂一处同步点（少两处可能漏掉的地方）。实测 33069 条约 2s。
 */
export function rebuildQuantizedVectorIndex(client: DatabaseClient): { total: number, written: number } {
  if (!vectorSearchReady(client)) return { total: 0, written: 0 }
  const dim = (client.sqlite.prepare(
    'SELECT MAX(dimension) AS d FROM assistant_embeddings WHERE source_type <> \'memory\''
  ).get() as { d: number | null } | undefined)?.d
  if (!dim || dim <= 0) return { total: 0, written: 0 }
  const rows = client.sqlite.prepare(
    'SELECT id, embedding FROM assistant_embeddings WHERE source_type <> \'memory\''
  ).all() as Array<{ id: string, embedding: Buffer }>
  client.sqlite.exec(`DROP TABLE IF EXISTS ${QUANTIZED_TABLE}`)
  client.sqlite.exec(`CREATE VIRTUAL TABLE ${QUANTIZED_TABLE} USING vec0(v int8[${dim}], embedding_id text)`)
  const insert = client.sqlite.prepare(`INSERT INTO ${QUANTIZED_TABLE}(v, embedding_id) VALUES (vec_int8(?), ?)`)
  let written = 0
  client.sqlite.transaction(() => {
    for (const row of rows) {
      const floats = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, Math.floor(row.embedding.byteLength / 4))
      insert.run(quantizeUnitInt8(floats), row.id)
      written += 1
    }
  })()
  quantizedStatus = { ready: false, checkedAt: 0 }
  return { total: rows.length, written }
}

/**
 * 候选表是否可用：行数必须与主表（排除 memory）完全一致。
 * 不一致就用现行扫描——**宁可慢，绝不能因为索引不全而少召回**（这正是历史上
 * 「答案突然变差」那类事故的形态）。
 */
export function quantizedIndexReady(client: DatabaseClient, recheckMs = QUANTIZED_STATUS_TTL_MS): boolean {
  const now = Date.now()
  if (now - quantizedStatus.checkedAt < recheckMs) return quantizedStatus.ready
  let ready: boolean
  try {
    const main = client.sqlite.prepare(
      'SELECT COUNT(*) AS c FROM assistant_embeddings WHERE source_type <> \'memory\''
    ).get() as { c: number }
    const quant = client.sqlite.prepare(`SELECT COUNT(*) AS c FROM ${QUANTIZED_TABLE}`).get() as { c: number }
    ready = main.c > 0 && main.c === quant.c
    if (!ready) {
      // eslint-disable-next-line no-console -- 索引与主表数量不一致是“答案变差”的前兆，必须留进程日志
      console.warn(`[assistant-vector] quantized index out of sync (main=${main.c} quant=${quant.c}) → 退回全表扫描`)
    }
  } catch {
    ready = false
  }
  quantizedStatus = { ready, checkedAt: now }
  return ready
}

/** 两段式取最近邻：int8 候选 → 精确 float32 重排。失败返回 null，由调用方退回全表扫描。 */
function quantizedNearest(client: DatabaseClient, queryVector: number[], limit: number): NearestRow[] | null {
  try {
    const candidates = client.sqlite.prepare(
      `SELECT embedding_id, distance FROM ${QUANTIZED_TABLE} WHERE v MATCH vec_int8(?) AND k = ?`
    ).all(quantizeUnitInt8(queryVector), QUANTIZED_CANDIDATE_K) as Array<{ embedding_id: string, distance: number }>
    if (candidates.length === 0) return null
    const ids = candidates.map(item => item.embedding_id)
    const rows = client.sqlite.prepare(
      `SELECT id, title, url, snippet, content, embedding FROM assistant_embeddings WHERE id IN (${ids.map(() => '?').join(',')})`
    ).all(...ids) as Array<{ id: string, title: string, url: string, snippet: string, content: string, embedding: Buffer }>
    const byId = new Map(rows.map(row => [row.id, row]))
    // 查询向量的模长只需算一次。
    let queryNorm = 0
    for (let i = 0; i < queryVector.length; i++) queryNorm += queryVector[i]! * queryVector[i]!
    queryNorm = Math.sqrt(queryNorm) || 1
    const scored: NearestRow[] = []
    for (const id of ids) {
      const row = byId.get(id)
      // 主表里已被删掉的候选直接跳过（不回退、不报错）。
      if (!row) continue
      const floats = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, Math.floor(row.embedding.byteLength / 4))
      let dot = 0
      let norm = 0
      for (let i = 0; i < floats.length; i++) {
        dot += queryVector[i]! * floats[i]!
        norm += floats[i]! * floats[i]!
      }
      scored.push({
        id: row.id,
        title: row.title,
        url: row.url,
        snippet: row.snippet,
        content: row.content,
        distance: 1 - dot / (Math.sqrt(norm) * queryNorm || 1)
      })
    }
    if (scored.length === 0) return null
    scored.sort((left, right) => left.distance - right.distance)
    return scored.slice(0, limit)
  } catch {
    return null
  }
}

function cachedNearest(key: string): VectorEvidence[] | undefined {
  const hit = nearestCache.get(key)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    nearestCache.delete(key)
    return undefined
  }
  hit.hits += 1
  recordNearestHit(key)
  // 浅拷贝：调用方会把它并进自己的候选池，不能让它改到缓存里的数组。
  return [...hit.evidence]
}

function rememberNearest(key: string, evidence: VectorEvidence[]): void {
  nearestCache.set(key, { expiresAt: Date.now() + NEAREST_CACHE_TTL_MS, evidence: [...evidence], hits: 0 })
  while (nearestCache.size > NEAREST_CACHE_MAX) {
    const oldest = nearestCache.keys().next().value
    if (oldest === undefined) break
    nearestCache.delete(oldest)
  }
}

/** 仅供测试：清空最近邻缓存。 */
export function clearNearestCacheForTests(): void {
  nearestCache.clear()
}

/**
 * Index-scaling controls. The production knowledge library holds tens of
 * thousands of claims and documents; embedding every chunk is neither cheap
 * nor fast, so the default caps keep the index at a few thousand chunks while
 * preserving the most recent claims and one summary chunk per document.
 *
 * Both knobs can also be overridden at runtime via `NUXT_VECTOR_CLAIM_LIMIT`
 * and `NUXT_VECTOR_DOCUMENT_CHUNKS` (0 = all), which is how a deploy can widen
 * semantic coverage without code changes. Explicit `limits` passed in always
 * win over the environment.
 */
export interface VectorIndexLimits {
  /** Chunks indexed per document (0 = all). Default 1 (first ~600 chars). */
  documentChunksPerItem?: number
  /** Max published claims indexed (0 = all). Default 8000, newest first. */
  claimLimit?: number
}

/** Read a non-negative integer env override; invalid/missing → fallback. */
function envVectorLimit(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

export interface VectorIndexRow {
  sourceType: string
  sourceId: string
  chunkIndex: number
  content: string
  title: string
  url: string
  snippet: string
  textHash: string
}

export interface VectorEvidence {
  title: string
  url: string
  snippet: string
  source: 'site'
  text: string
  /** Cosine similarity (0..1, higher is closer), used for ordering/score. */
  score: number
}

interface NearestRow {
  id: string
  title: string
  url: string
  snippet: string
  content: string
  distance: number
}

const CONTENT_KIND_URL_PREFIX: Readonly<Record<string, string>> = {
  department: '/departments',
  club: '/clubs',
  notice: '/notices',
  guide: '/guides'
}

function contentKindUrl(kind: string, slug: string): string {
  const prefix = CONTENT_KIND_URL_PREFIX[kind] ?? '/guides'
  return `${prefix}/${encodeURIComponent(slug)}`
}

function excerpt(value: string, max = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized
}

/** Sliding-window chunker for long documents (CJK-friendly by characters). */
export function chunkText(text: string, chunkChars = VECTOR_CHUNK_CHARS, overlap = VECTOR_CHUNK_OVERLAP): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  if (normalized.length <= chunkChars) return [normalized]
  const chunks: string[] = []
  const step = Math.max(1, chunkChars - overlap)
  for (let offset = 0; offset < normalized.length; offset += step) {
    const chunk = normalized.slice(offset, offset + chunkChars)
    if (chunk.trim()) chunks.push(chunk)
    if (offset + chunkChars >= normalized.length) break
  }
  return chunks
}

/**
 * Enumerate every chunk that should be embedded, straight from the current
 * database content. Deterministic ids let rebuilds upsert in place.
 */
export function collectVectorIndexRows(
  client: DatabaseClient,
  limits: VectorIndexLimits = {}
): VectorIndexRow[] {
  const rows: VectorIndexRow[] = []

  const entries = client.db.select({
    id: assistantKnowledgeEntries.id,
    title: assistantKnowledgeEntries.title,
    question: assistantKnowledgeEntries.question,
    answer: assistantKnowledgeEntries.answer,
    publicUrl: assistantKnowledgeEntries.publicUrl
  }).from(assistantKnowledgeEntries).where(eq(assistantKnowledgeEntries.isActive, true)).all()
  for (const entry of entries) {
    const content = `问题：${entry.question} 答案：${entry.answer}`
    rows.push({
      sourceType: 'entry',
      sourceId: entry.id,
      chunkIndex: 0,
      content,
      title: entry.title || entry.question,
      url: entry.publicUrl ?? '',
      snippet: excerpt(content),
      textHash: embeddingTextHash(content)
    })
  }

  const claimLimit = limits.claimLimit ?? envVectorLimit('NUXT_VECTOR_CLAIM_LIMIT', 8000)
  const claimQuery = client.db.select({
    id: knowledgeClaims.id,
    title: knowledgeClaims.title,
    statement: knowledgeClaims.statement,
    publicUrl: knowledgeClaims.publicUrl
  }).from(knowledgeClaims).where(eq(knowledgeClaims.reviewStatus, 'published'))
  const claims = claimLimit > 0
    ? claimQuery.orderBy(desc(knowledgeClaims.updatedAt)).limit(claimLimit).all()
    : claimQuery.all()
  for (const claim of claims) {
    rows.push({
      sourceType: 'claim',
      sourceId: claim.id,
      chunkIndex: 0,
      content: claim.statement,
      title: claim.title || claim.statement.slice(0, 60),
      url: claim.publicUrl ?? '',
      snippet: excerpt(claim.statement),
      textHash: embeddingTextHash(claim.statement)
    })
  }

  const documents = client.db.select({
    id: knowledgeDocuments.id,
    title: knowledgeDocuments.title,
    originalUrl: knowledgeDocuments.originalUrl,
    extractedText: knowledgeDocuments.extractedText
  }).from(knowledgeDocuments).where(eq(knowledgeDocuments.status, 'ready')).all()
  const documentChunks = limits.documentChunksPerItem ?? envVectorLimit('NUXT_VECTOR_DOCUMENT_CHUNKS', 1)
  for (const document of documents) {
    const chunks = chunkText(document.extractedText)
    const capped = documentChunks > 0 ? chunks.slice(0, documentChunks) : chunks
    capped.forEach((chunk, chunkIndex) => {
      rows.push({
        sourceType: 'document',
        sourceId: document.id,
        chunkIndex,
        content: chunk,
        title: document.title,
        url: document.originalUrl ?? '',
        snippet: excerpt(chunk),
        textHash: embeddingTextHash(chunk)
      })
    })
  }

  const placeRows = client.db.select({
    id: places.id,
    slug: places.slug,
    name: places.name,
    summary: places.summary
  }).from(places).where(eq(places.status, 'published')).all()
  for (const place of placeRows) {
    const content = `${place.name} ${place.summary}`
    rows.push({
      sourceType: 'place',
      sourceId: place.id,
      chunkIndex: 0,
      content,
      title: place.name,
      url: `/map?place=${encodeURIComponent(place.slug)}`,
      snippet: excerpt(place.summary || `${place.name}已收录在校园地图中。`),
      textHash: embeddingTextHash(content)
    })
  }

  const contentRows = client.db.select({
    id: contents.id,
    kind: contents.kind,
    slug: contents.slug,
    title: contents.title,
    summary: contents.summary
  }).from(contents).where(eq(contents.status, 'published')).all()
  for (const item of contentRows) {
    const content = `${item.title} ${item.summary}`
    rows.push({
      sourceType: 'content',
      sourceId: item.id,
      chunkIndex: 0,
      content,
      title: item.title,
      url: contentKindUrl(item.kind, item.slug),
      snippet: excerpt(item.summary),
      textHash: embeddingTextHash(content)
    })
  }

  const procedureRows = client.db.select({
    id: procedures.id,
    slug: procedures.slug,
    title: procedures.title,
    summary: procedures.summary
  }).from(procedures).where(eq(procedures.status, 'published')).all()
  for (const item of procedureRows) {
    const content = `${item.title} ${item.summary}`
    rows.push({
      sourceType: 'procedure',
      sourceId: item.id,
      chunkIndex: 0,
      content,
      title: item.title,
      url: `/procedures/${encodeURIComponent(item.slug)}`,
      snippet: excerpt(item.summary),
      textHash: embeddingTextHash(content)
    })
  }

  return rows
}

export interface UpsertVectorIndexOptions {
  config: EmbeddingConfig
  embedder?: EmbeddingProvider
  onProgress?: (done: number, total: number) => void
}

/**
 * Embed every collected chunk and upsert it. Chunks whose text hash is
 * unchanged are skipped (their embedding row already matches).
 */
export async function upsertVectorIndex(
  client: DatabaseClient,
  rows: VectorIndexRow[],
  options: UpsertVectorIndexOptions
): Promise<{ embedded: number, skipped: number }> {
  const embedder = options.embedder ?? openAiCompatibleEmbedder
  const now = Date.now()
  let embedded = 0
  let skipped = 0

  const existing = client.sqlite.prepare(
    'SELECT id, text_hash AS textHash, model FROM assistant_embeddings'
  ).all() as Array<{ id: string, textHash: string, model: string }>
  const existingByHash = new Map(existing.map(row => [row.id, row]))

  // A content chunk is "already done" when every row carrying it is present with
  // a matching hash + model. Skipping those at EMBED time is what makes a resumed
  // re-run cheap: prior successful slices live in the DB, so we never re-call the
  // provider for work already persisted (the in-process cache is lost on restart).
  const contentDone = new Map<string, boolean>()
  for (const row of rows) {
    const id = embeddingChunkId(row.sourceType, row.sourceId, row.chunkIndex)
    const existingRow = existingByHash.get(id)
    const ok = Boolean(existingRow && existingRow.textHash === row.textHash && existingRow.model === options.config.model)
    const prev = contentDone.get(row.content)
    contentDone.set(row.content, prev === false ? false : ok)
    // Rows already correct in the DB are skipped work; count them once here so an
    // idempotent re-run reports them as skipped (embedded + skipped = rows touched).
    if (ok) skipped += 1
  }

  // Batch by unique content to avoid duplicate API calls, skipping contents that
  // are already correct in-process or already persisted to the DB.
  const uniqueContents = [...new Set(rows.map(row => row.content))]
  const indexByContent = new Map<string, number[]>()
  const toEmbed: string[] = []
  for (const content of uniqueContents) {
    if (cachedEmbedding(content)) {
      indexByContent.set(content, cachedEmbedding(content)!)
    } else if (contentDone.get(content) !== true) {
      toEmbed.push(content)
    }
  }

  const insert = client.sqlite.prepare(`
    INSERT INTO assistant_embeddings (
      id, source_type, source_id, chunk_index, content, text_hash, embedding,
      model, dimension, title, url, snippet, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'site', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      text_hash = excluded.text_hash,
      embedding = excluded.embedding,
      model = excluded.model,
      dimension = excluded.dimension,
      title = excluded.title,
      url = excluded.url,
      snippet = excluded.snippet,
      updated_at = excluded.updated_at
  `)

  // Slice size for incremental persistence: each slice is embedded, then every
  // row whose content came from this slice is written to the DB immediately. A
  // crash then loses at most one slice, and the next run resumes from the DB.
  // `touched` guarantees each row is processed exactly once — without it, later
  // slices would re-upsert earlier slices' rows on every pass.
  const SLICE = 96
  const touched = new Set<string>()
  let progressed = 0
  for (let sliceStart = 0; sliceStart < toEmbed.length; sliceStart += SLICE) {
    const slice = toEmbed.slice(sliceStart, sliceStart + SLICE)
    if (slice.length > 0) {
      const vectors = await embedder.embedTexts(slice, options.config)
      slice.forEach((content, index) => {
        const vector = vectors[index]
        if (vector) {
          indexByContent.set(content, vector)
          rememberEmbedding(content, vector)
        }
      })
    }
    // Persist every row whose content was (re)embedded by this slice.
    for (const row of rows) {
      const vector = indexByContent.get(row.content)
      if (!vector) continue
      const id = embeddingChunkId(row.sourceType, row.sourceId, row.chunkIndex)
      if (touched.has(id)) continue
      touched.add(id)
      const existingRow = existingByHash.get(id)
      if (existingRow && existingRow.textHash === row.textHash && existingRow.model === options.config.model) {
        // Already correct and counted as skipped during pre-scan.
        continue
      }
      insert.run(
        id,
        row.sourceType,
        row.sourceId,
        row.chunkIndex,
        row.content,
        row.textHash,
        vectorToBlob(vector),
        options.config.model,
        vector.length,
        row.title,
        row.url,
        row.snippet,
        now,
        now
      )
      embedded += 1
    }
    progressed += slice.length
    options.onProgress?.(progressed, toEmbed.length)
  }
  return { embedded, skipped }
}

/**
 * 离线索引重建负责维护的来源类型。`memory` 刻意不在此列：会话记忆由运行时
 * （embedSessionMemoryRows）自己写入，任何一次离线重建的采集集都不包含它——
 * 如果一起 prune，一次重建就会把全部会话记忆向量删光（实测 2026-08-19 那次
 * `pruned: 30` 之后记忆向量归零，靠运行时流量才慢慢长回来）。
 */
const PRUNABLE_SOURCE_TYPES = ['entry', 'claim', 'document', 'place', 'content', 'procedure'] as const

/**
 * Delete embedding rows whose source no longer resolves (sources archived).
 *
 * `protectedSourceTypes` 用于「采集被上限截断」的来源：例如 `--claims 20000`
 * 只取最新的两万条，此时不在采集集里并不代表该行已失效，不能删。
 */
export function pruneVectorIndex(
  client: DatabaseClient,
  validIds: Set<string>,
  options: { protectedSourceTypes?: readonly string[] } = {}
): number {
  const protectedTypes = new Set(options.protectedSourceTypes ?? [])
  const prunable = PRUNABLE_SOURCE_TYPES.filter(type => !protectedTypes.has(type))
  if (prunable.length === 0) return 0
  const existing = client.sqlite.prepare(
    `SELECT id FROM assistant_embeddings WHERE source_type IN (${prunable.map(() => '?').join(',')})`
  ).all(...prunable) as Array<{ id: string }>
  const stale = existing.filter(row => !validIds.has(row.id)).map(row => row.id)
  if (stale.length === 0) return 0
  client.sqlite.prepare(`DELETE FROM assistant_embeddings WHERE id IN (${stale.map(() => '?').join(',')})`)
    .run(...stale)
  return stale.length
}

/** True when the embeddings table exists and the vec functions are callable. */
export function vectorSearchReady(client: DatabaseClient): boolean {
  try {
    const table = client.sqlite.prepare(
      'SELECT 1 AS value FROM sqlite_master WHERE type = \'table\' AND name = \'assistant_embeddings\''
    ).get()
    if (!table) return false
    client.sqlite.prepare('SELECT vec_length(?)').get(Buffer.from(new Float32Array([1]).buffer))
    return true
  } catch {
    return false
  }
}

/** 向量腿内部分段耗时。诊断「语义召回为什么慢」时用：是嵌入 API 还是本地扫描。 */
export interface VectorLegTiming {
  /** 嵌入 API 往返（缓存命中时为 0）。 */
  embedMs?: number
  /** 距离扫描。 */
  scanMs?: number
  /** 扫描走了 JS 兜底（原生扩展不可用）——比原生慢一个数量级。 */
  usedJsFallback?: boolean
  /** 整腿命中最近邻缓存（嵌入与扫描都没跑）。 */
  cacheHit?: boolean
  /**
   * 本函数自身的墙钟耗时。**不要**用调用方包在 promise 外面测的耗时：
   * 缓存命中时本函数在第一个 await 之前就返回了，调用方那段同步的关键词召回会被
   * 算进来，于是「缓存命中」却显示 vec=1473ms，把排查的人带偏。
   */
  totalMs?: number
}

/**
 * Embed the query and return the nearest chunks as candidate evidence. Falls
 * back to a JS cosine scan when the native vec function is unavailable.
 */
export async function retrieveVectorEvidence(
  client: DatabaseClient,
  query: string,
  config: EmbeddingConfig,
  limit = VECTOR_EVIDENCE_LIMIT,
  embedder: EmbeddingProvider = openAiCompatibleEmbedder,
  timing?: VectorLegTiming
): Promise<VectorEvidence[]> {
  const legStartedAt = Date.now()
  const finish = (evidence: VectorEvidence[]): VectorEvidence[] => {
    if (timing) timing.totalMs = Date.now() - legStartedAt
    return evidence
  }
  if (!embeddingConfigReady(config) || !vectorSearchReady(client)) return finish([])
  // 缓存键里带知识修订号（落库了）：本次调用先把连接挂上，键才和在线请求一致。
  bindAssistantKnowledgeRevisionDatabase(client)
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return finish([])

  // 命中就直接返回，嵌入与全表扫描都省掉（见 nearestCache 的说明）。
  const nearestKey = nearestCacheKeyFor(trimmedQuery, limit)
  const cachedResult = cachedNearest(nearestKey)
  if (cachedResult) {
    if (timing) timing.cacheHit = true
    return finish(cachedResult)
  }

  const cached = cachedEmbedding(trimmedQuery)
  let queryVector: number[]
  if (cached) {
    queryVector = cached
  } else {
    const embedStartedAt = Date.now()
    const [vector] = await embedder.embedTexts([trimmedQuery], config)
    if (timing) timing.embedMs = Date.now() - embedStartedAt
    if (!vector || vector.length === 0) return finish([])
    rememberEmbedding(trimmedQuery, vector)
    queryVector = vector
  }
  const queryBlob = vectorToBlob(queryVector)

  // 刻意排除 source_type='memory'：
  //  * 会话记忆有自己的、按 session_key 过滤的召回通道（sessionMemorySemanticScores）。
  //    把记忆行混进通用通道就等于跨会话泄漏——实测它们会挤进候选并被当成引用来源
  //    （答案里因此出现过 “也可以核对“answered”” 这种残留 token，标题来自记忆行）。
  //  * 记忆行语义上贴近日常口语问题，距离往往比真正的知识条目更近，会把后者挤出
  //    候选窗口（实测某次提问前 2000 名里有 49 条记忆行）。
  const scanStartedAt = Date.now()
  let nearest: NearestRow[]
  // 优先走两段式量化索引（int8 候选 + float32 精排）：字节量 129MB→32MB，实测结果与
  // 现行完全一致。就绪检查含行数比对，不一致就落到下面的全表扫描——宁可慢也不错。
  const quantized = quantizedIndexReady(client) ? quantizedNearest(client, queryVector, limit) : null
  if (quantized) {
    nearest = quantized
  } else try {
    nearest = client.sqlite.prepare(`
      SELECT id, title, url, snippet, content,
        vec_distance_cosine(embedding, ?) AS distance
      FROM assistant_embeddings
      WHERE source_type <> 'memory'
      ORDER BY distance ASC
      LIMIT ?
    `).all(queryBlob, limit) as unknown as NearestRow[]
  } catch {
    // Native extension unavailable: JS cosine scan over the same table.
    if (timing) timing.usedJsFallback = true
    const rows = client.sqlite.prepare(
      'SELECT id, title, url, snippet, content, embedding FROM assistant_embeddings WHERE source_type <> \'memory\''
    ).all() as Array<Omit<NearestRow, 'distance'> & { embedding: Buffer }>
    const scored = rows.map(row => ({
      ...row,
      distance: 1 - cosineSimilarity(queryVector, blobToVector(row.embedding))
    })).sort((left, right) => left.distance - right.distance).slice(0, limit)
    nearest = scored.map(({ embedding: _embedding, ...rest }) => rest)
  }
  if (timing) timing.scanMs = Date.now() - scanStartedAt

  const evidence = nearest
    .filter(row => Number.isFinite(row.distance) && row.distance < 1.4)
    .map(row => ({
      title: row.title || '相关资料',
      url: row.url || '',
      snippet: row.snippet || excerpt(row.content),
      source: 'site' as const,
      text: row.content,
      score: Math.round((1 - row.distance) * 100)
    }))
  rememberNearest(nearestKey, evidence)
  return finish(evidence)
}

/**
 * Embed this session's memory rows (kinds = answered/fact/preference) into the
 * vector index so recall questions phrased differently from the stored fact
 * can still surface it (P4 semantic recall). Rows whose embedding already
 * matches the current content hash are skipped. Best-effort: any failure
 * returns 0 and leaves the n-gram recall path untouched.
 */
export async function embedSessionMemoryRows(
  client: DatabaseClient,
  sessionKey: string,
  kinds: readonly SessionMemoryKind[],
  config: EmbeddingConfig,
  embedder: EmbeddingProvider = openAiCompatibleEmbedder,
  limit = 60
): Promise<number> {
  if (!embeddingConfigReady(config) || !vectorSearchReady(client) || sessionKey.length === 0) return 0
  const allowed = new Set(SESSION_MEMORY_KINDS)
  const safeKinds = kinds.filter(kind => allowed.has(kind))
  if (safeKinds.length === 0) return 0
  const kindList = safeKinds.map(kind => '\'' + kind + '\'').join(',')

  let rows: Array<{ id: string, kind: string, content: string, contentHash: string }>
  try {
    const sql = 'SELECT id, kind, content, content_hash AS contentHash FROM assistant_session_memory'
      + ' WHERE session_key = ? AND kind IN (' + kindList + ') AND (expires_at IS NULL OR expires_at > ?)'
      + ' ORDER BY created_at DESC LIMIT ?'
    rows = client.sqlite.prepare(sql).all(sessionKey, Date.now(), limit) as Array<{ id: string, kind: string, content: string, contentHash: string }>
  } catch {
    return 0
  }
  if (rows.length === 0) return 0

  let existingByMemoryId = new Map<string, string>()
  try {
    const placeholders = rows.map(() => '?').join(',')
    const existing = client.sqlite.prepare(
      'SELECT id, text_hash AS textHash FROM assistant_embeddings'
      + ' WHERE source_type = \'memory\' AND source_id IN (' + placeholders + ')'
    ).all(...rows.map(row => row.id)) as Array<{ id: string, textHash: string }>
    existingByMemoryId = new Map(existing.map(row => [row.id, row.textHash]))
  } catch {
    // The embeddings table may not exist yet; treat everything as new.
  }

  const vectorByContent = new Map<string, number[]>()
  const toEmbed: string[] = []
  // rememberExtractedFacts does not populate content_hash, so fall back to the
  // embedding text hash to keep the staleness key non-null (text_hash is NOT NULL).
  const contentHashOf = (row: { id: string, content: string, contentHash: string | null }): string =>
    row.contentHash || embeddingTextHash(row.content)
  for (const row of rows) {
    const cached = cachedEmbedding(row.content)
    if (cached) {
      vectorByContent.set(row.content, cached)
      continue
    }
    const chunkId = embeddingChunkId('memory', row.id, 0)
    if (existingByMemoryId.get(chunkId) !== contentHashOf(row)) toEmbed.push(row.content)
  }
  if (toEmbed.length > 0) {
    let vectors: number[][]
    try {
      vectors = await embedder.embedTexts(toEmbed, config)
    } catch {
      return 0
    }
    toEmbed.forEach((content, index) => {
      const vector = vectors[index]
      if (vector) {
        vectorByContent.set(content, vector)
        rememberEmbedding(content, vector)
      }
    })
  }

  const now = Date.now()
  const insert = client.sqlite.prepare(
    'INSERT INTO assistant_embeddings ('
    + ' id, source_type, source_id, chunk_index, content, text_hash, embedding,'
    + ' model, dimension, title, url, snippet, source, created_at, updated_at'
    + ' ) VALUES (?, \'memory\', ?, 0, ?, ?, ?, ?, ?, ?, \'\', ?, \'session\', ?, ?)'
    + ' ON CONFLICT(id) DO UPDATE SET'
    + ' content = excluded.content, text_hash = excluded.text_hash,'
    + ' embedding = excluded.embedding, model = excluded.model,'
    + ' dimension = excluded.dimension, title = excluded.title,'
    + ' snippet = excluded.snippet, updated_at = excluded.updated_at'
  )

  let embedded = 0
  for (const row of rows) {
    const chunkId = embeddingChunkId('memory', row.id, 0)
    if (existingByMemoryId.get(chunkId) === contentHashOf(row)) continue
    const vector = vectorByContent.get(row.content)
    if (!vector) continue
    try {
      insert.run(
        chunkId,
        row.id,
        row.content,
        contentHashOf(row),
        vectorToBlob(vector),
        config.model,
        vector.length,
        row.kind,
        excerpt(row.content),
        now,
        now
      )
      embedded += 1
    } catch {
      // A single row must not abort the batch.
    }
  }
  return embedded
}

/**
 * Compute per-memory semantic cosine scores for one session's memory rows
 * against the query (memoryId -> 0..1). Uses the sqlite-vec native scan when
 * available and falls back to a JS cosine scan. Best-effort: returns an empty
 * map when embeddings are unconfigured, the extension is missing, or the
 * session has no embedded memories.
 */
export async function sessionMemorySemanticScores(
  client: DatabaseClient,
  sessionKey: string,
  query: string,
  config: EmbeddingConfig,
  limit = 12,
  embedder: EmbeddingProvider = openAiCompatibleEmbedder
): Promise<Map<string, number>> {
  const scores = new Map<string, number>()
  if (!embeddingConfigReady(config) || !vectorSearchReady(client) || !query.trim()) return scores

  let queryVector = cachedEmbedding(query)
  if (!queryVector) {
    let vectors: number[][]
    try {
      vectors = await embedder.embedTexts([query], config)
    } catch {
      return scores
    }
    const vector = vectors[0]
    if (!vector || vector.length === 0) return scores
    rememberEmbedding(query, vector)
    queryVector = vector
  }
  const queryBlob = vectorToBlob(queryVector)

  try {
    const rows = client.sqlite.prepare(
      'SELECT m.id AS memoryId,'
      + ' vec_distance_cosine(e.embedding, ?) AS distance'
      + ' FROM assistant_embeddings e'
      + ' JOIN assistant_session_memory m ON m.id = e.source_id'
      + ' WHERE e.source_type = \'memory\' AND m.session_key = ?'
      + ' ORDER BY distance ASC'
      + ' LIMIT ?'
    ).all(queryBlob, sessionKey, limit) as Array<{ memoryId: string, distance: number }>
    for (const row of rows) {
      const cosine = 1 - Number(row.distance)
      if (Number.isFinite(cosine) && cosine > 0) {
        scores.set(row.memoryId, Math.min(1, Math.max(0, cosine)))
      }
    }
    return scores
  } catch {
    // Native extension unavailable: JS cosine scan scoped to this session.
    try {
      const rows = client.sqlite.prepare(
        'SELECT m.id AS memoryId, e.embedding AS embedding'
        + ' FROM assistant_embeddings e'
        + ' JOIN assistant_session_memory m ON m.id = e.source_id'
        + ' WHERE e.source_type = \'memory\' AND m.session_key = ?'
      ).all(sessionKey) as Array<{ memoryId: string, embedding: Buffer }>
      for (const row of rows) {
        const cosine = cosineSimilarity(queryVector, blobToVector(row.embedding))
        if (cosine > 0) scores.set(row.memoryId, Math.min(1, Math.max(0, cosine)))
      }
    } catch {
      return new Map()
    }
    return scores
  }
}

/** Merge vector evidence into a keyword evidence list, de-duplicating by URL. */
export function mergeVectorEvidence(
  base: Array<{ title: string, url: string }>,
  vectorEvidence: VectorEvidence[]
): Array<VectorEvidence> {
  if (vectorEvidence.length === 0) return base as Array<VectorEvidence>
  const seen = new Set(base.map(item => item.url || item.title))
  const additions: VectorEvidence[] = []
  let added = 0
  for (const item of vectorEvidence) {
    const key = item.url || item.title
    if (seen.has(key)) continue
    seen.add(key)
    // Keyword evidence is scored by the RRF-fused value (~0..0.18). The vector
    // cosine (0..100) and graph fixed (46/32) scores sit on an incompatible
    // scale and would outrank every keyword title hit in the later dedupe/rank
    // sort, letting a semantically-similar-but-wrong hybrid chunk win. Normalize
    // hybrid candidates to a rank-based value in the RRF range instead; title
    // matches (the +56/+90 hitReason bonus) still let genuinely relevant hybrid
    // hits surface while irrelevant ones stop dominating.
    additions.push({ ...item, score: 1 / (60 + added) })
    added += 1
  }
  return [...base as Array<VectorEvidence>, ...additions]
}
