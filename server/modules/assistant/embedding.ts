/**
 * Zero-server embedding helpers for the assistant's vector channel (P1).
 *
 * The production gateway exposes no embedding endpoint, so vectors come from a
 * separate OpenAI-compatible API (Alibaba Bailian text-embedding-v3, SiliconFlow
 * bge-m3, ...) configured through AI_EMBEDDING_*. When it is not configured the
 * whole vector channel stays off and retrieval keeps using the n-gram path.
 *
 * Vectors are stored in SQLite as raw little-endian float32 BLOBs, which is
 * exactly the format sqlite-vec's vec_f32 / vec_distance_cosine expect (verified
 * against sqlite-vec 0.1.9: no length header, even above 255 dimensions).
 *
 * @module server/modules/assistant/embedding
 */

import { createHash } from 'node:crypto'

export interface EmbeddingConfig {
  /** OpenAI-compatible base URL, e.g. https://dashscope.aliyuncs.com/compatible-mode/v1 */
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  signal?: AbortSignal
}

export interface EmbeddingProvider {
  embedTexts(texts: string[], config: EmbeddingConfig): Promise<number[][]>
}

/** Batch size per API call; large batches risk provider timeouts. */
const EMBEDDING_BATCH_SIZE = 32
const MAX_EMBEDDING_TEXT_LENGTH = 2000

function combinedAbortSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (!signal) return AbortSignal.timeout(timeoutMs)
  return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/** True when an embedding endpoint is configured. */
export function embeddingConfigReady(config: EmbeddingConfig | undefined | null): config is EmbeddingConfig {
  return Boolean(config && config.baseUrl.trim() && config.apiKey.trim() && config.model.trim())
}

function trimText(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > MAX_EMBEDDING_TEXT_LENGTH
    ? trimmed.slice(0, MAX_EMBEDDING_TEXT_LENGTH)
    : trimmed
}

/**
 * OpenAI-compatible /v1/embeddings provider. Returns one vector per input
 * text in the same order. Throws EmbeddingError on transport/provider issues;
 * callers treat it as a soft failure (degrade to n-gram retrieval).
 */
export const openAiCompatibleEmbedder: EmbeddingProvider = {
  async embedTexts(texts, config) {
    if (!embeddingConfigReady(config)) throw new Error('EMBEDDING_NOT_CONFIGURED')
    const results: number[][] = []
    for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(offset, offset + EMBEDDING_BATCH_SIZE)
        .map(trimText)
        .filter(text => text.length > 0)
      if (batch.length === 0) continue
      let response: Response
      try {
        response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/embeddings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ model: config.model, input: batch }),
          signal: combinedAbortSignal(config.signal, config.timeoutMs)
        })
      } catch (error) {
        if (isAbortError(error)) throw new Error('EMBEDDING_TIMEOUT', { cause: error })
        throw error
      }
      if (!response.ok) throw new Error(`EMBEDDING_HTTP_${response.status}`)
      const payload = await response.json() as { data?: Array<{ embedding?: number[] }> }
      const vectors = (payload.data ?? []).map(item => item.embedding ?? [])
      if (vectors.length !== batch.length || vectors.some(vector => vector.length === 0)) {
        throw new Error('EMBEDDING_BAD_RESPONSE')
      }
      results.push(...vectors)
    }
    return results
  }
}

/** Encode a vector as sqlite-vec compatible raw float32 LE BLOB. */
export function vectorToBlob(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer)
}

/** Decode a sqlite-vec compatible BLOB back into a number vector. */
export function blobToVector(blob: Buffer): number[] {
  const view = new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.byteLength / 4))
  return Array.from(view)
}

/** Cosine similarity between two equal-length vectors; 0 when either is empty. */
export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!
    const b = right[index]!
    dot += a * b
    leftNorm += a * a
    rightNorm += b * b
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm)
  return denominator === 0 ? 0 : dot / denominator
}

/**
 * Deterministic hash used to dedupe repeated embedding calls for the same text
 * and to detect content changes during index rebuilds.
 */
export function embeddingTextHash(text: string): string {
  return createHash('sha256')
    .update(text.normalize('NFKC'))
    .digest('hex')
}

/** Stable key for one chunk: source type + source id + chunk index. */
export function embeddingChunkId(sourceType: string, sourceId: string, chunkIndex: number): string {
  return createHash('sha256')
    .update(`${sourceType}:${sourceId}:${chunkIndex}`)
    .digest('hex')
}

/**
 * In-process cache of text -> vector to avoid re-embedding identical text
 * within one process lifetime (index rebuilds hit repeated titles/snippets).
 */
const embeddingCache = new Map<string, number[]>()

export function cachedEmbedding(text: string): number[] | undefined {
  return embeddingCache.get(embeddingTextHash(text))
}

export function rememberEmbedding(text: string, vector: number[]): void {
  embeddingCache.set(embeddingTextHash(text), vector)
  if (embeddingCache.size > 4000) {
    const oldest = embeddingCache.keys().next().value
    if (oldest) embeddingCache.delete(oldest)
  }
}
