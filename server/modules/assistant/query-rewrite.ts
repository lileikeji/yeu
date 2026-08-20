/**
 * LLM multi-query rewrite channel (P9).
 *
 * 2025-2026 RAG consensus adds a query-translation step in front of recall:
 * a single surface question misses paraphrase coverage (「宿舍买多大床垫」 vs
 * 「宿舍床垫尺寸」), so before retrieval the LLM rewrites the question into
 * 1..n variants. Each variant — plus the original, weighted double — runs
 * through the same recall legs (keyword + optional vector), and the per-variant
 * pools are merged with a second Reciprocal Rank Fusion. The existing P8
 * cross-encoder rerank pass then fixes precision over the enlarged pool, so
 * this channel is purely a recall broadener and stays invisible when rerank
 * or embedding endpoints are absent.
 *
 * This module is deliberately pure: prompt building, response parsing and
 * variant sanitizing only. The transport (an OpenAI-compatible chat call) is
 * injected by the caller — service.ts uses the gated gateway transport, the
 * offline eval harness uses a deterministic stub — so the channel is testable
 * without a model.
 *
 * Everything is best-effort and config-gated: when disabled, unconfigured or
 * failed, retrieval behaves exactly as before (single query, no extra calls).
 *
 * @module server/modules/assistant/query-rewrite
 */

/** Default number of LLM variants requested (plus the original query). */
export const QUERY_REWRITE_DEFAULT_VARIANTS = 2

/** Hard ceiling on variants; latency and fusion cost stay bounded. */
export const QUERY_REWRITE_MAX_VARIANTS = 3

/** Variants longer than this are truncated; they are recall hints, not answers. */
export const QUERY_REWRITE_VARIANT_MAX_CHARS = 48

export interface RewriteConfig {
  /** Master switch; the channel is inert unless explicitly enabled. */
  enabled: boolean
  /** Chat model used for rewriting; falls back to the answering gateway model. */
  model?: string
  /** How many LLM variants to request (1..QUERY_REWRITE_MAX_VARIANTS). */
  maxVariants?: number
  /** Time budget for the rewrite call in ms. */
  timeoutMs?: number
}

export function rewriteConfigReady(config: RewriteConfig | undefined | null): config is RewriteConfig {
  return Boolean(config && config.enabled)
}

export interface RewriteMessage {
  role: 'system' | 'user'
  content: string
}

/** Clamp a requested variant count into the supported range. */
export function rewriteVariantCount(maxVariants: number | undefined): number {
  const value = Math.round(Number(maxVariants) || QUERY_REWRITE_DEFAULT_VARIANTS)
  return Math.min(QUERY_REWRITE_MAX_VARIANTS, Math.max(1, value))
}

/**
 * Build the system + user messages for the rewrite call. The system prompt
 * asks for pure JSON and keeps the variants short, campus-term-preserving
 * recall hints — never fabrication.
 */
export function buildRewriteMessages(query: string, maxVariants = QUERY_REWRITE_DEFAULT_VARIANTS): RewriteMessage[] {
  const count = rewriteVariantCount(maxVariants)
  return [
    {
      role: 'system',
      content: '你是校园问答检索的查询改写助手。用户会给你一个问题，请改写出 '
        + `${count} 个不同的表达方式（同义改述、去掉问句虚词、补全校园术语），用于检索校园知识库。`
        + '要求：只输出 JSON，格式为 {"queries":["改写1","改写2",...]}；'
        + `每条不超过 ${QUERY_REWRITE_VARIANT_MAX_CHARS} 个字符；保留校区与校园专有名词；`
        + '不要编造知识库之外的事实；不要输出任何解释或多余文字。'
    },
    { role: 'user', content: `问题：${query}` }
  ]
}

function normalizeVariantKey(value: string): string {
  return value
    .toLocaleLowerCase('zh-CN')
    .replace(/[?？!！。，,、；;：:""''（）()【】\s]+/gu, '')
}

/**
 * Parse the model answer into sanitized variant queries. Accepts a JSON object
 * `{"queries":[...]}` (possibly wrapped in ```json fences) or a bare JSON
 * array; non-JSON answers fall back to line-based extraction. Duplicates,
 * variants identical to the original and empty strings are dropped; variants
 * are truncated and the result is capped at the requested count.
 */
export function parseRewriteVariants(
  raw: unknown,
  original: string,
  maxVariants = QUERY_REWRITE_DEFAULT_VARIANTS
): string[] {
  const count = rewriteVariantCount(maxVariants)
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return []

  const candidates: string[] = []
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fence && fence[1] ? fence[1].trim() : text
  try {
    const parsed = JSON.parse(body) as unknown
    if (Array.isArray(parsed)) {
      for (const item of parsed) if (typeof item === 'string') candidates.push(item)
    } else if (parsed && typeof parsed === 'object') {
      const queries = (parsed as { queries?: unknown }).queries
      if (Array.isArray(queries)) {
        for (const item of queries) if (typeof item === 'string') candidates.push(item)
      }
    }
  } catch {
    // Not JSON: fall back to line-based extraction.
    for (const line of body.split(/\n+/)) {
      const cleaned = line.replace(/^[-*\d.)\s]+/, '').trim()
      if (cleaned) candidates.push(cleaned)
    }
  }

  const seen = new Set<string>()
  const normalizedOriginal = normalizeVariantKey(original)
  const variants: string[] = []
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/\s+/g, ' ').trim().slice(0, QUERY_REWRITE_VARIANT_MAX_CHARS)
    if (!cleaned) continue
    const key = normalizeVariantKey(cleaned)
    if (!key || key === normalizedOriginal || seen.has(key)) continue
    seen.add(key)
    variants.push(cleaned)
    if (variants.length >= count) break
  }
  return variants
}
