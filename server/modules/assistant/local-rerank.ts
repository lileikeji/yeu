/**
 * Optional in-process cross-encoder rerank via Transformers.js (P8-2).
 *
 * The HTTP rerank channel (P8-1, `./rerank.ts`) calls an OpenAI-compatible
 * `/rerank` endpoint. This channel moves that hop in-process: an ONNX
 * cross-encoder (e.g. `BAAI/bge-reranker-v2-m3` or a community int8 conversion)
 * is loaded through `@huggingface/transformers` and scores each (query, pair)
 * locally — zero network latency, no per-call round trip.
 *
 * Deliberately experimental and OFF by default. `local.enabled` must be set
 * explicitly, and the transformer is loaded lazily on first use so a deploy
 * that never opts in pays nothing. Every failure path (dependency absent,
 * model missing, load/score error) THROWS so the caller falls back to the HTTP
 * rerank path — this channel is strictly an enhancement and never a hard
 * dependency.
 *
 * @module server/modules/assistant/local-rerank
 */

export interface LocalRerankConfig {
  /** Master switch; the local scorer is inert unless enabled. */
  enabled: boolean
  /** HuggingFace model id; community int8 ONNX conversions fit a small budget. */
  model: string
  /** Runtime backend: 'cpu' (default, onnxruntime-node) or 'wasm'. */
  device?: 'cpu' | 'wasm'
}

/** True when a local cross-encoder is configured. */
export function localRerankReady(config: LocalRerankConfig | undefined | null): config is LocalRerankConfig {
  return Boolean(config && config.enabled && config.model.trim())
}

/**
 * Score each (query, candidate) pair with a local cross-encoder. Returns one
 * relevance score per document (0..1-ish, higher is more relevant) in input
 * order. Throws on any failure — transport, load, model, or scoring — so the
 * caller can degrade to the HTTP rerank path unchanged.
 */
export async function localRerankScores(
  query: string,
  documents: string[],
  config: LocalRerankConfig
): Promise<number[]> {
  if (!localRerankReady(config)) throw new Error('LOCAL_RERANK_NOT_READY')
  // A variable specifier keeps TypeScript from resolving the module at compile
  // time and keeps the heavy @huggingface/transformers dependency optional at
  // runtime: when the package is absent, the import throws and we fall back.
  const moduleName = '@huggingface/transformers'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformers = (await import(moduleName)) as any
  const pipeline = transformers?.pipeline
  if (typeof pipeline !== 'function') throw new Error('LOCAL_RERANK_NO_PIPELINE')

  const classifier = await pipeline('text-classification', config.model, {
    device: config.device === 'wasm' ? 'wasm' : 'cpu',
    dtype: 'int8'
  })
  const pairs = documents.map(doc => [query, doc])
  const output = await classifier(pairs, { topk: 1 })
  const rows = output as Array<Array<{ score?: number }> | { score?: number }>
  const scores = rows.map((row) => {
    if (Array.isArray(row)) return Number(row[0]?.score ?? 0)
    return Number((row as { score?: number }).score ?? 0)
  })
  if (scores.length !== documents.length) throw new Error('LOCAL_RERANK_BAD_OUTPUT')
  return scores
}
