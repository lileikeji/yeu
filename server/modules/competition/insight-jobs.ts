import type { CompetitionInsight } from './insight'

/**
 * AI 分析的生成进度表。
 *
 * 生成一次要走几秒到几十秒的网关调用，挂在浏览器请求上等它返回很容易被
 * 客户端超时、切页或刷新掐断（服务端其实已经算完，用户看到的却是失败）。
 * 所以改成「请求只负责起任务，结果靠轮询取」：
 * 同一份数据同一时间只跑一个任务，重复点击复用同一个任务，不会重复烧网关额度。
 */

export type InsightJobState = 'running' | 'done' | 'failed'

export interface InsightJob {
  fingerprint: string
  state: InsightJobState
  model: string
  startedAt: number
  finishedAt: number | null
  insight: CompetitionInsight | null
  error: string | null
}

const MAX_JOBS = 20
const jobs = new Map<string, InsightJob>()

function trimJobs(): void {
  while (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value
    if (oldest === undefined) return
    const candidate = jobs.get(oldest)
    // 正在跑的任务不淘汰，否则轮询端会看不到进度。
    if (candidate && candidate.state === 'running') return
    jobs.delete(oldest)
  }
}

export function readInsightJob(fingerprint: string): InsightJob | null {
  return jobs.get(fingerprint) ?? null
}

/**
 * 同一个 fingerprint 只跑一次：已经在跑就返回同一个 Promise。
 * 调用方负责把这个 Promise 交给 event.waitUntil，保证响应结束后任务继续跑。
 */
export function ensureInsightJob(
  fingerprint: string,
  model: string,
  run: () => Promise<CompetitionInsight | null>
): Promise<void> {
  const existing = jobs.get(fingerprint)
  if (existing && (existing.state === 'running' || existing.state === 'done')) {
    // 在跑的复用同一个任务，已完成的直接读结果；只有上次失败才允许重跑。
    return Promise.resolve()
  }
  const job: InsightJob = {
    fingerprint,
    state: 'running',
    model,
    startedAt: Date.now(),
    finishedAt: null,
    insight: null,
    error: null
  }
  jobs.set(fingerprint, job)
  trimJobs()

  return Promise.resolve()
    .then(run)
    .then((insight) => {
      job.finishedAt = Date.now()
      if (insight) {
        job.state = 'done'
        job.insight = insight
      } else {
        job.state = 'failed'
        job.error = '平台 AI 没有返回可解析的分析结果'
      }
    })
    .catch((error: unknown) => {
      job.finishedAt = Date.now()
      job.state = 'failed'
      job.error = error instanceof Error ? error.message : String(error)
    })
}

/** 后台任务成功后由调用方回写，让轮询端能直接从任务表读到结果。 */
export function markInsightJobDone(fingerprint: string, insight: CompetitionInsight): void {
  const job = jobs.get(fingerprint)
  if (!job) return
  job.state = 'done'
  job.insight = insight
  job.finishedAt = job.finishedAt ?? Date.now()
  job.error = null
}

export function resetInsightJobs(): void {
  jobs.clear()
}
