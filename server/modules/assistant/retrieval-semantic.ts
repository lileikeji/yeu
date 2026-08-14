/**
 * Zero-dependency semantic retrieval helpers for the campus assistant.
 *
 * The production gateway exposes no embedding or rerank endpoint, and the
 * single-core 768 MB budget rules out a local transformer. Character n-gram
 * Dice similarity is the pragmatic substitute: for Chinese short-text matching
 * (question vs. title/snippet) it recovers synonym-ish and paraphrased hits
 * that pure LIKE/FTS5 keyword matching misses — e.g. 「宿舍怎么样」 vs 「住宿条件」,
 * 「买多大」 vs 「尺寸」 — without a model, a vector store, or a new dependency.
 *
 * Reciprocal Rank Fusion (RRF) merges independent ranked lists (keyword score,
 * semantic score, web results) into one ordering with 1/(k + rank), the same
 * scheme used by production RAG engines (RAGFlow, R2R).
 *
 * @module server/modules/assistant/retrieval-semantic
 */

/** Strip CJK-free noise and normalize before n-gram extraction. */
export function normalizeForNgrams(value: string): string {
  return value
    .toLocaleLowerCase('zh-CN')
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

/** Character n-grams of the normalized text (CJK runs dominate). */
export function charNgrams(value: string, n: number): Set<string> {
  const normalized = normalizeForNgrams(value)
  const result = new Set<string>()
  if (normalized.length < n) return result
  for (let index = 0; index <= normalized.length - n; index += 1) {
    result.add(normalized.slice(index, index + n))
  }
  return result
}

/** Dice coefficient of two n-gram sets; empty either side → 0. */
export function diceSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left]
  for (const item of smaller) {
    if (larger.has(item)) intersection += 1
  }
  return (2 * intersection) / (left.size + right.size)
}

/**
 * Hybrid 1-gram + 2-gram + 3-gram similarity between a query and a candidate
 * text. The unigram (character-set) component recovers word-order inversions
 * like 「宿舍」 vs 「住宿」; bigrams reward tight lexical overlap; trigrams
 * reward longer shared spans. Returns 0..1.
 */
export function semanticTextSimilarity(query: string, text: string): number {
  const q1 = charNgrams(query, 1)
  const t1 = charNgrams(text, 1)
  const q2 = charNgrams(query, 2)
  const t2 = charNgrams(text, 2)
  const q3 = charNgrams(query, 3)
  const t3 = charNgrams(text, 3)
  const unigramScore = diceSimilarity(q1, t1)
  const bigramScore = diceSimilarity(q2, t2)
  const trigramScore = diceSimilarity(q3, t3)
  return unigramScore * 0.2 + bigramScore * 0.5 + trigramScore * 0.3
}

/**
 * Semantic relevance of one evidence item to the query, weighted toward the
 * title and snippet (the fields the user actually sees) over the raw body.
 * Returns 0..1.
 */
export function evidenceSemanticScore(
  query: string,
  item: { title: string; snippet?: string; text?: string }
): number {
  const titleScore = semanticTextSimilarity(query, item.title)
  const snippetScore = semanticTextSimilarity(query, item.snippet ?? '')
  const bodyScore = item.text ? semanticTextSimilarity(query, item.text) : 0
  return Math.min(1, titleScore * 0.55 + snippetScore * 0.3 + bodyScore * 0.15)
}

/**
 * Reciprocal Rank Fusion over independent ranked lists. Each list is an array
 * of stable keys; position 0 is rank 1. Returns a map from key to fused score
 * (higher is better). `k` dampens rank dominance (default 60).
 */
export function reciprocalRankFusion(
  rankedLists: ReadonlyArray<ReadonlyArray<string>>,
  k = 60
): Map<string, number> {
  const fused = new Map<string, number>()
  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank += 1) {
      const key = list[rank]!
      fused.set(key, (fused.get(key) ?? 0) + 1 / (k + rank + 1))
    }
  }
  return fused
}
