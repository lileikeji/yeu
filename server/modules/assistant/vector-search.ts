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
import { SESSION_MEMORY_KINDS } from './memory'
import type { SessionMemoryKind } from './memory'

export const VECTOR_EVIDENCE_LIMIT = 40
export const VECTOR_CHUNK_CHARS = 600
export const VECTOR_CHUNK_OVERLAP = 80

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

/** Delete embedding rows whose source no longer resolves (sources archived). */
export function pruneVectorIndex(client: DatabaseClient, validIds: Set<string>): number {
  const existing = client.sqlite.prepare('SELECT id FROM assistant_embeddings').all() as Array<{ id: string }>
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

/**
 * Embed the query and return the nearest chunks as candidate evidence. Falls
 * back to a JS cosine scan when the native vec function is unavailable.
 */
export async function retrieveVectorEvidence(
  client: DatabaseClient,
  query: string,
  config: EmbeddingConfig,
  limit = VECTOR_EVIDENCE_LIMIT,
  embedder: EmbeddingProvider = openAiCompatibleEmbedder
): Promise<VectorEvidence[]> {
  if (!embeddingConfigReady(config) || !vectorSearchReady(client)) return []
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  const cached = cachedEmbedding(trimmedQuery)
  let queryVector: number[]
  if (cached) {
    queryVector = cached
  } else {
    const [vector] = await embedder.embedTexts([trimmedQuery], config)
    if (!vector || vector.length === 0) return []
    rememberEmbedding(trimmedQuery, vector)
    queryVector = vector
  }
  const queryBlob = vectorToBlob(queryVector)

  let nearest: NearestRow[]
  try {
    nearest = client.sqlite.prepare(`
      SELECT id, title, url, snippet, content,
        vec_distance_cosine(embedding, ?) AS distance
      FROM assistant_embeddings
      ORDER BY distance ASC
      LIMIT ?
    `).all(queryBlob, limit) as unknown as NearestRow[]
  } catch {
    // Native extension unavailable: JS cosine scan over the same table.
    const rows = client.sqlite.prepare(
      'SELECT id, title, url, snippet, content, embedding FROM assistant_embeddings'
    ).all() as Array<Omit<NearestRow, 'distance'> & { embedding: Buffer }>
    const scored = rows.map(row => ({
      ...row,
      distance: 1 - cosineSimilarity(queryVector, blobToVector(row.embedding))
    })).sort((left, right) => left.distance - right.distance).slice(0, limit)
    nearest = scored.map(({ embedding: _embedding, ...rest }) => rest)
  }

  return nearest
    .filter(row => Number.isFinite(row.distance) && row.distance < 1.4)
    .map(row => ({
      title: row.title || '相关资料',
      url: row.url || '',
      snippet: row.snippet || excerpt(row.content),
      source: 'site' as const,
      text: row.content,
      score: Math.round((1 - row.distance) * 100)
    }))
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
  const kindList = safeKinds.map(kind => "'" + kind + "'").join(',')

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
      + " WHERE source_type = 'memory' AND source_id IN (" + placeholders + ')'
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
    + " ) VALUES (?, 'memory', ?, 0, ?, ?, ?, ?, ?, ?, '', ?, 'session', ?, ?)"
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
      + " WHERE e.source_type = 'memory' AND m.session_key = ?"
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
        + " WHERE e.source_type = 'memory' AND m.session_key = ?"
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
