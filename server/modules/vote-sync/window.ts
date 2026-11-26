/**
 * 第三方投票的窗口统计：只看时间与标识，不碰数据库，便于单测。
 */

import type { ThirdPartyVoteContext } from './risk'

/** 同一出口 IP / 同一投票人的观察窗口 */
export const WINDOW_MS = 10 * 60 * 1000
/** 爆发检测窗口 */
export const BURST_WINDOW_MS = 60 * 1000

export interface VoteWindowSample {
  recordId: string
  ipCidr: string | null
  voterRef: string | null
  votedAt: number
}

function withinWindow(value: number, center: number, span: number): boolean {
  return Math.abs(value - center) <= span
}

/**
 * 用同一表单最近的投票样本算出这条票的上下文。
 * 计数不含样本自身，语义是「这是同 IP 段的第 N+1 票」。
 */
export function computeThirdPartyContext(
  sample: VoteWindowSample,
  pool: VoteWindowSample[],
  baselinePerMinute: number
): ThirdPartyVoteContext {
  let sameIpWindow = 0
  let sameVoterWindow = 0
  let burstWindow = 0
  let previousVotedAt: number | null = null

  for (const other of pool) {
    if (other.recordId === sample.recordId) continue
    if (
      sample.ipCidr
      && other.ipCidr === sample.ipCidr
      && withinWindow(other.votedAt, sample.votedAt, WINDOW_MS)
    ) {
      sameIpWindow += 1
    }
    if (
      sample.voterRef
      && other.voterRef === sample.voterRef
      && withinWindow(other.votedAt, sample.votedAt, WINDOW_MS)
    ) {
      sameVoterWindow += 1
    }
    if (withinWindow(other.votedAt, sample.votedAt, BURST_WINDOW_MS)) burstWindow += 1
    if (
      sample.voterRef
      && other.voterRef === sample.voterRef
      && other.votedAt < sample.votedAt
      && (previousVotedAt === null || other.votedAt > previousVotedAt)
    ) {
      previousVotedAt = other.votedAt
    }
  }

  return {
    sameIpWindow,
    sameVoterWindow,
    burstWindow,
    baselinePerMinute,
    votedIntervalMs: previousVotedAt === null ? null : sample.votedAt - previousVotedAt
  }
}

/** 用样本的时间跨度估算每分钟基线；样本不足两条时按 0 处理。 */
export function estimateBaselinePerMinute(pool: VoteWindowSample[]): number {
  if (pool.length < 2) return 0
  let min = pool[0]!.votedAt
  let max = pool[0]!.votedAt
  for (const item of pool) {
    if (item.votedAt < min) min = item.votedAt
    if (item.votedAt > max) max = item.votedAt
  }
  const spanMinutes = Math.max((max - min) / 60_000, 1)
  return (pool.length - 1) / spanMinutes
}
