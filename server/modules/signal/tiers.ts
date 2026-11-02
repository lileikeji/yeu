/**
 * 信源分级。
 *
 * 规则简单到可以直接写在门槛表里：越像「学校自己发的」，入选门槛越低；
 * 越像「谁都能发的地方」，门槛越高。这样官方通知不会被噪音挤掉，
 * 二手信息也不会因为一条热词就混进来。
 */

export type SignalTier = 'A' | 'B' | 'C'
export type SignalSourceLevel = 'A' | 'B' | 'C' | 'D' | 'E'

export interface SignalSourceFacts {
  isOfficial: boolean
  sourceLevel?: SignalSourceLevel | null
}

/** 入选分数线，按来源等级递增。 */
export const SIGNAL_TIER_THRESHOLDS: Record<SignalTier, number> = {
  A: 55,
  B: 65,
  C: 75
}

/** 双评分里较弱的一科可以比分数线低多少分，超过就落选。 */
export const SIGNAL_TIER_GAP = 12

export const SIGNAL_TIER_LABELS: Record<SignalTier, string> = {
  A: '校内官方',
  B: '可信来源',
  C: '一般来源'
}

export function signalTierFor(facts: SignalSourceFacts): SignalTier {
  const level = facts.sourceLevel ?? 'E'
  if (facts.isOfficial && (level === 'A' || level === 'B')) return 'A'
  if (facts.isOfficial || level === 'C') return 'B'
  return 'C'
}

export function signalTierThreshold(tier: SignalTier): number {
  return SIGNAL_TIER_THRESHOLDS[tier]
}

export function signalTierLabel(tier: SignalTier): string {
  return SIGNAL_TIER_LABELS[tier]
}
