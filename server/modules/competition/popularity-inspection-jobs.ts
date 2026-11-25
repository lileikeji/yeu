import type { CompetitionPopularityInspectionJobView } from '../../../shared/types'

export type InspectionJobState = 'running' | 'done' | 'failed'

export interface PopularityInspectionJob extends CompetitionPopularityInspectionJobView {
  eventId: string
}

const MAX_JOBS = 20
const jobsByKey = new Map<string, PopularityInspectionJob>()
const activeKeyByEvent = new Map<string, string>()

function trimJobs(): void {
  while (jobsByKey.size > MAX_JOBS) {
    const oldest = jobsByKey.keys().next().value
    if (oldest === undefined) return
    const candidate = jobsByKey.get(oldest)
    if (candidate && candidate.state === 'running') return
    jobsByKey.delete(oldest)
  }
}

export function readLatestPopularityInspectionJob(eventId: string): CompetitionPopularityInspectionJobView | null {
  const key = activeKeyByEvent.get(eventId)
  if (!key) return null
  const job = jobsByKey.get(key)
  if (!job) return null
  return {
    key: job.key,
    state: job.state,
    mode: job.mode,
    model: job.model,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error
  }
}

export function readPopularityInspectionJob(key: string): PopularityInspectionJob | null {
  return jobsByKey.get(key) ?? null
}

/**
 * 同一巡检 key 正在运行时复用同一后台任务，避免连点或并发第 20 票重复调网关。
 */
export function ensurePopularityInspectionJob(
  eventId: string,
  key: string,
  mode: PopularityInspectionJob['mode'],
  model: string,
  run: () => Promise<boolean>
): { promise: Promise<void>, job: PopularityInspectionJob } {
  const existing = jobsByKey.get(key)
  if (existing && existing.state === 'running') {
    return { promise: Promise.resolve(), job: existing }
  }

  const job: PopularityInspectionJob = {
    key,
    eventId,
    state: 'running',
    mode,
    model,
    startedAt: Date.now(),
    finishedAt: null,
    error: null
  }
  jobsByKey.set(key, job)
  activeKeyByEvent.set(eventId, key)
  trimJobs()

  const promise = Promise.resolve()
    .then(run)
    .then((ok) => {
      job.finishedAt = Date.now()
      if (ok) {
        job.state = 'done'
        job.error = null
      } else {
        job.state = 'failed'
        job.error = '平台 AI 没有返回可解析的巡检结果'
      }
    })
    .catch((error: unknown) => {
      job.finishedAt = Date.now()
      job.state = 'failed'
      job.error = error instanceof Error ? error.message : String(error)
    })

  return { promise, job }
}

export function resetPopularityInspectionJobs(): void {
  jobsByKey.clear()
  activeKeyByEvent.clear()
}
