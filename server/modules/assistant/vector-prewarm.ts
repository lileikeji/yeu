import { desc, gt, sql } from 'drizzle-orm'
import { assistantRuns } from '../../database/schema'
import type { DatabaseClient } from '../../database/client'
import { embeddingConfigReady, type EmbeddingConfig, type EmbeddingProvider } from './embedding'
import {
  forgetNearestCacheKey,
  nearestCacheHits,
  nearestCacheKeyFor,
  retrieveVectorEvidence,
  VECTOR_EVIDENCE_LIMIT,
  type VectorLegTiming
} from './vector-search'

/**
 * 为**高频提问**预热语义召回缓存。
 *
 * 背景（线上实测）：`vec_distance_cosine` 写在 `ORDER BY` 里会把 assistant_embeddings
 * 的 33069 行、约 129MB 向量整表读一遍。空闲时 p50=117ms，但机器只有 3.6GB 内存、
 * page cache 约 1.27GB，装不下这 129MB —— 页面被挤掉时**冷查询首次要付 6.5s**。
 *
 * 这里做的是**零召回损失**的那一步：不改索引、不改精度，只是提前把学生最常问的那些
 * 问法跑一遍，让它们命中 `nearestCache`（同时把向量页读热）。真正会损失召回的手段
 * （量化 / 只扫 chunk_index=0）需要单独的产品取舍，不在这里做。
 *
 * 为什么从 `assistant_runs` 取问法而不是硬编码清单：真实热问法只有日志知道，猜不准；
 * 而且这样天然跟着流量漂移。
 */

export interface VectorPrewarmResult {
  /** 从历史里取到的候选问法数（去重前）。 */
  candidates: number
  /** 去重后真正尝试预热的问法数。 */
  attempted: number
  /** 成功写入缓存的条数。 */
  warmed: number
  /** 因预算用尽而放弃的条数。 */
  skipped: number
  /** 抛错（嵌入失败/向量扩展不可用等）的条数。 */
  failed: number
  /** 预热后向量索引里被读到的证据条数合计（0 说明向量腿根本没生效）。 */
  evidence: number
  /**
   * 上一轮预热过的问法里，之后被真实请求命中过几条。
   * 这是衡量"预热有没有白做"的唯一硬指标——没有它就只能靠猜。
   */
  previousWarmed: number
  previousHit: number
  ms: number
}

export interface VectorPrewarmOptions {
  /** 最多预热多少条不同问法。 */
  maxQueries?: number
  /** 整段预热的墙钟上限；超了就停，剩下的下一轮再说。 */
  budgetMs?: number
  /** 取多久以来的历史提问。 */
  lookbackDays?: number
  /** 向量腿的候选条数，必须与线上实际调用一致，否则缓存键对不上。 */
  limit?: number
  /** 嵌入实现，仅供测试注入（线上用默认的 OpenAI 兼容实现）。 */
  embedder?: EmbeddingProvider
}

const DEFAULT_MAX_QUERIES = 40
const DEFAULT_BUDGET_MS = 90_000
const DEFAULT_LOOKBACK_DAYS = 30

/**
 * 上一轮真正写进缓存的条目：缓存键 + 写入时的累计命中数（基线）。
 *
 * 存**基线**而不是"是否有命中"：命中台账是累计的，用 `当前计数 > 基线` 才能算出
 * "这一轮之后被用过几次"，而且**不受条目过期影响**（否则命中会被过期抹掉，
 * 线上就出现过 40 条里有 2 条被真实请求问过、却报告 0 命中的假象）。
 * 只活在进程内：预热的目的是给下一次同问加速，缓存本身也是进程内的。
 */
let lastWarmed: Array<{ key: string, baseline: number }> = []

/** 仅供测试：重置跨轮次的记忆。 */
export function clearPrewarmHistoryForTests(): void {
  lastWarmed = []
}

/**
 * 上一轮预热条目的被使用情况。给"每 N 分钟打一行"的观测用：6 小时才结算一次的话，
 * 出问题（或修好了）都要等太久才看得见。
 */
export function lastPrewarmUsage(): { warmed: number, hit: number } {
  let hit = 0
  for (const entry of lastWarmed) {
    if (nearestCacheHits(entry.key) > entry.baseline) hit += 1
  }
  return { warmed: lastWarmed.length, hit }
}

/** 历史问法里，能说明"这条问法真的会走向量腿"的证据。 */
interface HotQueryStats {
  query: string
  hits: number
  /** 走到过 web_search 的次数：说明本地检索（含向量腿）跑过但没够用。 */
  webHits: number
  /** 分析阶段最长耗时：确定性快路是几十到几百毫秒，跑过改写腿才会到秒级。 */
  maxAnalysisMs: number
}

/**
 * 给问法打分：分数越高越值得预热。
 *
 * 为什么需要这个：`retrieval_path` 只有 `local_database` / `web_search` / `answer_cache`
 * / `error` 四种，**没有任何一列直接记录"这条问法用没用过向量腿"**。但两个可观测的
 * 事实能强指向它：
 *  - 走到过 `web_search`：本地检索跑过（含向量腿）却没够用 → 一定会走向量腿。
 *  - `analysis_ms` 到秒级：确定性快路是几十~几百毫秒，只有跑过改写腿（向量腿就在其中）
 *    才会这么久。
 * 上一轮线上实测的教训：只按"频次"取前 40，结果多数是 `国奖多少` 这类确定性问法，
 * 它们根本走不到向量腿，预热等于白做。
 */
function prewarmPriority(stats: HotQueryStats): number {
  let score = 0
  if (stats.webHits > 0) score += 1000
  if (stats.maxAnalysisMs >= 800) score += 400
  return score + Math.min(stats.hits, 99)
}

/**
 * 取历史里最值得预热的提问，按"是否真的走向量腿"优先、其次按频次。
 *
 * 只取 success=1 的：失败请求的问法不代表学生真实关心的问题。
 */
function hotQueries(
  client: DatabaseClient,
  lookbackDays: number,
  maxQueries: number
): HotQueryStats[] {
  const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  try {
    const rows = client.db
      .select({
        query: assistantRuns.query,
        hits: sql<number>`count(*)`,
        webHits: sql<number>`sum(case when ${assistantRuns.retrievalPath} = 'web_search' or ${assistantRuns.usedWebSearch} = 1 then 1 else 0 end)`,
        maxAnalysisMs: sql<number>`max(${assistantRuns.analysisMs})`
      })
      .from(assistantRuns)
      .where(gt(assistantRuns.createdAt, since))
      .groupBy(assistantRuns.query)
      .orderBy(desc(sql`count(*)`))
      // 多取一些再排序：优先项可能不在"频次前 N"里。
      .limit(Math.max(maxQueries * 3, maxQueries))
      .all()
    return rows
      .filter(row => row.query.trim().length >= 2)
      .map(row => ({
        query: row.query,
        hits: Number(row.hits) || 0,
        webHits: Number(row.webHits) || 0,
        maxAnalysisMs: Number(row.maxAnalysisMs) || 0
      }))
  } catch {
    // 历史表读不出来（老库/迁移中）就当作没有热点，不影响任何请求路径。
    return []
  }
}

/**
 * 预热入口。best-effort：任何失败都不抛，只体现在返回值里。
 *
 * `retrievalQueryFor` 由调用方注入（通常是 service.ts 的 `assistantRetrievalQuery`）：
 * 向量腿的缓存键用的是**检索问题**而不是原始提问，注入可以让这里与线上调用完全一致，
 * 同时避免本模块反向依赖那个 8000 行的 service 模块。
 */
export async function prewarmVectorCacheForHotQueries(
  client: DatabaseClient,
  embedding: EmbeddingConfig,
  retrievalQueryFor: (query: string) => string,
  options: VectorPrewarmOptions = {}
): Promise<VectorPrewarmResult> {
  const startedAt = Date.now()
  const maxQueries = Math.max(1, options.maxQueries ?? DEFAULT_MAX_QUERIES)
  // 不设人为下限：调用方给多少预算就照多少执行（唯一的线上调用方用默认值）。
  // 之前垫了个 1000ms 的下限，结果是"预算"这个参数说了不算。
  const budgetMs = Math.max(1, options.budgetMs ?? DEFAULT_BUDGET_MS)
  const limit = options.limit
  const result: VectorPrewarmResult = {
    candidates: 0,
    attempted: 0,
    warmed: 0,
    skipped: 0,
    failed: 0,
    evidence: 0,
    previousWarmed: 0,
    previousHit: 0,
    ms: 0
  }
  // 没配嵌入端点就整个跳过：语义召回本来就关着，预热毫无意义。
  if (!embeddingConfigReady(embedding)) {
    result.ms = Date.now() - startedAt
    return result
  }

  const raw = hotQueries(client, options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS, maxQueries)
  result.candidates = raw.length
  // 先按「是否真的走向量腿」排序，再按频次：只按频次会挑中一堆确定性问法（上一轮实测）。
  const ranked = [...raw].sort((left, right) => prewarmPriority(right) - prewarmPriority(left))
  // 按「检索问题」去重：不同问法可能映射到同一个检索问题，只需预热一次。
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const stats of ranked) {
    let retrievalQuery = stats.query
    try {
      retrievalQuery = retrievalQueryFor(stats.query)
    } catch {
      retrievalQuery = stats.query
    }
    const key = retrievalQuery.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(key)
  }
  // 上限必须落在这里，而不是只写在 SQL 的 limit 上：SQL 现在多取候选是为了先排序，
  // 若在这里不截断，maxQueries 就形同虚设（实测会按 3 倍预热，白做两倍功）。
  const targets = deduped.slice(0, maxQueries)

  const warmLimit = limit ?? VECTOR_EVIDENCE_LIMIT
  // 上一轮预热过的条目里，之后被真实请求用过几条？这是"预热有没有白做"的唯一硬指标。
  // 用「累计计数 > 写入时基线」判定，而不是「当前是否有命中」——后者会被条目过期抹掉。
  // 必须**先**结算、再刷新：刷新会把条目和计数一起清掉。
  result.previousWarmed = lastWarmed.length
  for (const entry of lastWarmed) {
    if (nearestCacheHits(entry.key) > entry.baseline) result.previousHit += 1
  }

  const warmedKeys: Array<{ key: string, baseline: number }> = []
  for (const retrievalQuery of targets) {
    if (Date.now() - startedAt > budgetMs) {
      result.skipped = targets.length - result.attempted
      break
    }
    result.attempted += 1
    const timing: VectorLegTiming = {}
    // 强制重扫：命中旧条目就永远吃不到当日重建过的向量索引变化。
    const cacheKey = nearestCacheKeyFor(retrievalQuery, warmLimit)
    forgetNearestCacheKey(cacheKey)
    try {
      const evidence = await retrieveVectorEvidence(
        client,
        retrievalQuery,
        embedding,
        limit,
        options.embedder,
        timing
      )
      result.evidence += evidence.length
      // 已经命中缓存的也算「不需要再扫」，计进 warmed 只会误导，单列出来更好读。
      if (timing.cacheHit !== true) result.warmed += 1
      warmedKeys.push({ key: cacheKey, baseline: nearestCacheHits(cacheKey) })
    } catch {
      result.failed += 1
    }
  }

  // 记下本轮写进缓存的**键 + 基线**（不是问法原文）：下一轮按 `计数 > 基线` 结算，
  // 即使期间知识修订号变化导致重算出的键不同，也不会把命中数算错。
  lastWarmed = warmedKeys
  result.ms = Date.now() - startedAt
  return result
}
