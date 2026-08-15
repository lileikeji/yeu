/**
 * Cross-encoder rerank channel (P8-1).
 *
 * 2025-2026 industry consensus for RAG is Hybrid Search (BM25 + Dense) + a
 * rerank step: recall brings in a broad candidate pool, then a cross-encoder
 * scores each (query, candidate) pair jointly to fix precision. This project
 * already fuses keyword/n-gram + vector + graph legs with Reciprocal Rank
 * Fusion; this module adds the optional final rerank pass over the fused pool.
 *
 * Only an OpenAI-compatible rerank endpoint is required (e.g. SiliconFlow
 * `BAAI/bge-reranker-v2-m3`). Everything is best-effort and config-gated:
 * when the endpoint is not configured or the call fails, the RRF-ordered
 * evidence list is returned untouched and the assistant behaves exactly as
 * before this channel.
 *
 * The rerank pass reorders the pool but deliberately keeps each item's
 * original score, so deterministic handlers, sufficiency checks and the
 * citation rendering logic see identical data except for the order the LLM
 * context and citations are built from.
 *
 * @module server/modules/assistant/rerank
 */

/** How many top candidates (by the fused RRF score) are sent to the reranker. */
export const RERANK_CANDIDATE_LIMIT = 24

export interface RerankConfig {
  /** OpenAI-compatible base URL, e.g. https://api.siliconflow.cn/v1 */
  baseUrl: string
  apiKey: string
  /** Rerank model id, e.g. BAAI/bge-reranker-v2-m3 */
  model: string
  timeoutMs: number
  signal?: AbortSignal
}

export function rerankConfigReady(config: RerankConfig): boolean {
  return Boolean(config.baseUrl && config.apiKey && config.model)
}

export interface RerankOutcome {
  /** Whether the reranker was invoked and returned a usable ranking. */
  applied: boolean
  /** How many candidates were sent to the reranker. */
  reranked: number
}

interface Rerankable {
  title: string
  snippet?: string
  text?: string
  score: number
}

/**
 * Reorder the top of an evidence list by cross-encoder relevance scores.
 * Returns the (possibly reordered) list plus an outcome record. Never throws:
 * every failure path returns the input unchanged.
 */
export async function rerankEvidence<T extends Rerankable>(
  query: string,
  evidence: T[],
  config: RerankConfig,
  opts: { topK?: number } = {}
): Promise<{ evidence: T[]; outcome: RerankOutcome }> {
  const topK = opts.topK ?? RERANK_CANDIDATE_LIMIT
  if (!rerankConfigReady(config) || evidence.length < 2 || query.trim().length === 0) {
    return { evidence, outcome: { applied: false, reranked: 0 } }
  }

  const pool = evidence.slice(0, topK)
  const tail = evidence.slice(topK)
  const documents = pool.map((item) => {
    const head = `${item.title}\n${item.snippet ?? ''}`.trim()
    return (head || item.text || '').slice(0, 400)
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs || 15_000)
  const signal = config.signal
    ? AbortSignal.any([config.signal, controller.signal])
    : controller.signal
  try {
    const url = `${config.baseUrl.replace(/\/+$/, '')}/rerank`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        query,
        documents,
        top_n: documents.length,
        return_documents: false
      }),
      signal
    })
    if (!res.ok) return { evidence, outcome: { applied: false, reranked: 0 } }
    const body = (await res.json()) as { results?: Array<{ index: number; relevance_score: number }> }
    const scores = new Map<number, number>()
    for (const row of body.results ?? []) {
      if (typeof row.index === 'number' && typeof row.relevance_score === 'number') {
        scores.set(row.index, row.relevance_score)
      }
    }
    if (scores.size === 0) return { evidence, outcome: { applied: false, reranked: 0 } }

    // Reorder the pool by rerank relevance; stable tie-break by original order.
    const reranked = [...pool]
      .map((item, index) => ({ item, index, relevance: scores.get(index) ?? 0 }))
      .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
      .map((entry) => entry.item)
    return { evidence: [...reranked, ...tail], outcome: { applied: true, reranked: pool.length } }
  } catch {
    return { evidence, outcome: { applied: false, reranked: 0 } }
  } finally {
    clearTimeout(timer)
  }
}
