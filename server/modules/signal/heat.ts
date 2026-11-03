/**
 * 热度。
 *
 * 看最近 7 天，按 24 小时半衰加权；同一个来源重复发只算一次。
 * 窗口定 7 天是因为官网不是每天都有新通知：只算 48 小时，大多数条目热度都是 0。
 * 涨跌是拿「现在」和「6 小时前」两次数值比出来的，不是历史峰值。
 */
import { SIGNAL_HOUR_MS } from './time'

export const SIGNAL_HEAT_WINDOW_HOURS = 168
export const SIGNAL_HEAT_HALF_LIFE_HOURS = 24
export const SIGNAL_HEAT_COMPARE_HOURS = 6
/** 判断涨跌看最近两个 6 小时窗口里有没有新来源跟进。 */
export const SIGNAL_TREND_WINDOW_HOURS = 6

export type SignalTrend = 'new' | 'up' | 'down' | 'flat'

export interface SignalHeatParticipant {
  /** 去重键：优先用信源 id，没有信源时用条目自身。 */
  key: string
  /** 该来源发布这件事的时间。 */
  at: number
}

export interface SignalHeatResult {
  heat: number
  heatPrev: number
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** 在 anchor 这个时刻回看的加权热度。 */
export function decayedHeat(participants: SignalHeatParticipant[], anchor: number): number {
  const windowStart = anchor - SIGNAL_HEAT_WINDOW_HOURS * SIGNAL_HOUR_MS
  const latest = new Map<string, number>()
  for (const participant of participants) {
    if (participant.at > anchor || participant.at < windowStart) continue
    const previous = latest.get(participant.key)
    if (previous === undefined || participant.at > previous) latest.set(participant.key, participant.at)
  }
  let heat = 0
  for (const at of latest.values()) {
    const ageHours = (anchor - at) / SIGNAL_HOUR_MS
    heat += 2 ** (-ageHours / SIGNAL_HEAT_HALF_LIFE_HOURS)
  }
  return round3(heat)
}

/**
 * 涨跌看「跟进的来源数有没有变」：这件事又多了几个站点在发，才算在涨。
 * 不拿热度比：48 小时窗口加半衰，旧来源自然掉出窗口，热度一定往下走，
 * 那样只要有事件变老就会被判成「退」。来源数只增不减，语义稳定。
 * 第一次进快照判 new。
 */
export function signalTrend(
  sourceCount: number,
  previousSourceCount: number | null,
  firstSeenAt: number,
  now: number
): SignalTrend {
  if (previousSourceCount === null) return 'new'
  if (now - firstSeenAt <= SIGNAL_TREND_WINDOW_HOURS * SIGNAL_HOUR_MS) return 'new'
  if (sourceCount > previousSourceCount) return 'up'
  if (sourceCount < previousSourceCount) return 'down'
  return 'flat'
}

export function computeSignalHeat(
  participants: SignalHeatParticipant[],
  firstSeenAt: number,
  now: number
): SignalHeatResult {
  const heat = decayedHeat(participants, now)
  const heatPrev = decayedHeat(participants, now - SIGNAL_HEAT_COMPARE_HOURS * SIGNAL_HOUR_MS)
  return {
    heat,
    heatPrev
  }
}
