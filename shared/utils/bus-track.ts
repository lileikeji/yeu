/**
 * 校车沿线里程跟踪：把「投影到线路上的里程」做成只增不减的状态，
 * 显示位每个动画帧从当前位置向前推进，永不回退。
 *
 * 现场采样（2026-11-11 生产站，103 帧 / 4 辆车 / 约 30 分钟）决定这个模型：
 * - 上报间隔 p50 6.2 s、p90 12–13 s、最长 168 s（上游一次查询 6 s 上下，不是 5 s）；
 * - 单帧位移 p90 43.5 m、最大 194 m；车速 p90 9.7 m/s，只有跳点会超过 12 m/s；
 * - 静止帧占 61%（发车点、图书馆门口长时间不动），所以不能按时间往前推；
 * - 同线路沿线里程没有超过 43 m 的后退（GPS 抖动就是几十米），而改判到反方向
 *   线路会出现 900–1600 m 的后退——「跑了一段又回退」全部来自后者。
 *
 * 纯函数 + 显式状态，composable 与单测/回放脚本共用。
 */

export interface BusTrack {
  routeId: string
  /** 已确认的沿线里程（米）：本趟内只增不减。 */
  along: number
  /** 显示里程（米）：每帧向前推进，永不后退。 */
  display: number
  /** 平滑后的车速（m/s），用于两次上报之间推算位置。 */
  speedMps: number
  /** 本趟线路总长（米）。 */
  totalMeters: number
  /** 是否已到终点；到终点后才允许下一趟把里程重置回起点。 */
  arrived: boolean
  /** 连续「明显后退」的上报次数。 */
  backStreak: number
  /** 连续「快得不合理」的上报次数。 */
  jumpStreak: number
  /** 最近一次接受前进的时刻（ms）。 */
  lastAdvanceAt: number
  /** 最近一次上报时刻（ms）。 */
  lastObserveAt: number
  /** 最近一次渲染时刻（ms）。 */
  lastRenderAt: number
  /** 累计重锚次数（换趟或确认掉头），供回放统计。 */
  reanchors: number
  /** 自上次重锚以来确认前进的距离（米）：没跑起来就不认后退。 */
  travelled: number
}

export interface BusTrackObserve {
  /** 本帧投影到线路上的沿线里程（米）。 */
  along: number
  /** 本帧时刻（ms）。 */
  now: number
  /** 投影点偏离线路的距离（米）；明显偏离时不采信。 */
  offsetMeters?: number
  /** 上游「已到站」标志：到站不做前进推算。 */
  atSite?: boolean
}

export type BusTrackVerdict = 'accepted' | 'held' | 'ignored' | 'reanchored'

/** 小于此值的后退视为 GPS 抖动，不推动里程。 */
export const TRACK_JITTER_M = 4
/** 连续多少帧明确后退才认账（按 p50 7 s 一帧，约 21 s）。 */
export const TRACK_REANCHOR_FRAMES = 3
/** 认账所需的累计后退距离（米）：比这小的后退一律按住。 */
export const TRACK_REANCHOR_BACK_M = 150
/** 本趟至少要真的跑出这么远，才把大后退当成掉头/新一趟（否则是静止车的 GPS 漂移）。 */
export const TRACK_REANCHOR_MIN_TRAVEL_M = 150
/** 距终点小于此值算「已到终点」，下一趟才允许重置。 */
export const TRACK_ARRIVE_MARGIN_M = 25
/** 偏离线路超过此值不采信（车不在本线路上）。 */
export const TRACK_OFF_ROUTE_M = 150
/** 两次上报之间最多向前推算的距离（米）。 */
export const TRACK_MAX_EXTRAPOLATE_M = 30
/** 超过此时长没有新上报就不再推算（上游失联时车停在最后位置）。 */
export const TRACK_EXTRAPOLATE_WINDOW_MS = 20_000
/** 显示位追上真实里程的收敛增益（1/s）：差距按 gap×GAIN 追赶，再受速度上限约束。 */
export const TRACK_CATCHUP_GAIN = 2.5
/** 追赶速度上限（m/s）：防止一次跳点让车标瞬移。 */
export const TRACK_MAX_CATCHUP_MPS = 40
/** 确认后的前进量超过此值就直接落到新位置：这种量级是断档/换趟，不是行驶。 */
export const TRACK_SNAP_FORWARD_M = 250
/** 超过此速度视为不可信跳点（校内电瓶车实测 3–8 m/s）。 */
export const TRACK_MAX_PLAUSIBLE_MPS = 12
/** 跳点至少要有这么远才拦（抖动几米不必拦）。 */
export const TRACK_JUMP_MIN_M = 50

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 新建一趟的跟踪状态；along 取首帧投影里程。 */
export function createBusTrack(routeId: string, totalMeters: number, along: number, now: number): BusTrack {
  const total = Math.max(1, totalMeters)
  const start = clamp(along, 0, total)
  return {
    routeId,
    along: start,
    display: start,
    speedMps: 0,
    totalMeters: total,
    arrived: start >= total - TRACK_ARRIVE_MARGIN_M,
    backStreak: 0,
    jumpStreak: 0,
    lastAdvanceAt: now,
    lastObserveAt: now,
    lastRenderAt: now,
    reanchors: 0,
    travelled: 0
  }
}

/**
 * 换线路（换趟）时重置：里程归零重算，显示位直接落在新线路上。
 * 只有上游把同一台车改挂到另一条线路时才调用。
 */
export function resetBusTrack(track: BusTrack, routeId: string, totalMeters: number, along: number, now: number): BusTrack {
  const next = createBusTrack(routeId, totalMeters, along, now)
  next.reanchors = track.reanchors + 1
  return next
}

/**
 * 吸收一帧上报：里程只增不减。
 * - 前进（含 4 m 内抖动）→ 接受；
 * - 明确后退 → 按住，连续 3 帧且累计 ≥150 m、且本趟已经跑出 ≥150 m 才重锚
 *   （真掉头/新一趟；静止车的大幅漂移不算掉头）；
 * - 已到终点后回到起点 → 立即重锚（换下一趟）；
 * - 偏离线路 >150 m 或速度不合理 → 本帧不采信。
 */
export function observeBusTrack(track: BusTrack, input: BusTrackObserve): BusTrackVerdict {
  const now = input.now
  const dtSec = Math.max(1, (now - track.lastObserveAt) / 1000)
  track.lastObserveAt = now

  if (input.offsetMeters !== undefined && input.offsetMeters > TRACK_OFF_ROUTE_M) {
    track.speedMps *= 0.5
    track.backStreak = 0
    track.jumpStreak = 0
    return 'ignored'
  }

  const raw = clamp(input.along, 0, track.totalMeters)
  const delta = raw - track.along

  if (delta >= -TRACK_JITTER_M) {
    track.backStreak = 0
    if (delta > 0.5) {
      const measured = delta / dtSec
      if (measured > TRACK_MAX_PLAUSIBLE_MPS && delta > TRACK_JUMP_MIN_M) {
        track.jumpStreak += 1
        // 第一次当成跳点按住，连续两帧都这么快才认账（上游补报/数据断档）。
        if (track.jumpStreak < 2) {
          track.speedMps *= 0.5
          return 'held'
        }
      }
      track.jumpStreak = 0
      track.speedMps = track.speedMps * 0.35 + Math.min(measured, TRACK_MAX_PLAUSIBLE_MPS) * 0.65
      track.along = raw
      track.lastAdvanceAt = now
      track.travelled += delta
      if (track.along >= track.totalMeters - TRACK_ARRIVE_MARGIN_M) track.arrived = true
      if (delta > TRACK_SNAP_FORWARD_M) {
        // 一次前进几百米不可能是行驶（实测最大 8 m/s）：这是补报/换趟，直接落到新位置。
        track.display = raw
        track.speedMps = 0
        track.travelled = 0
        track.reanchors += 1
        return 'reanchored'
      }
      return 'accepted'
    }
    track.jumpStreak = 0
    track.speedMps *= 0.55
    return 'held'
  }

  // 明确后退：先按住，等连续证据。
  track.backStreak += 1
  track.speedMps *= 0.5
  const back = track.along - raw
  const newTrip = track.arrived && back >= TRACK_ARRIVE_MARGIN_M
  // 本趟还没跑出 150 m 就出现大后退：静止车的 GPS 漂移，不是掉头。
  const moved = track.travelled >= TRACK_REANCHOR_MIN_TRAVEL_M
  const confirmedTurn = moved && track.backStreak >= TRACK_REANCHOR_FRAMES && back >= TRACK_REANCHOR_BACK_M
  if (!newTrip && !confirmedTurn) return 'held'

  track.along = raw
  track.display = raw
  track.speedMps = 0
  track.arrived = false
  track.backStreak = 0
  track.jumpStreak = 0
  track.travelled = 0
  track.lastAdvanceAt = now
  track.reanchors += 1
  return 'reanchored'
}

/**
 * 推进一步显示里程并返回它（米）。只增不减。
 * 两次上报之间按平滑车速向前推算，最多 TRACK_MAX_EXTRAPOLATE_M 米；
 * 显示位落后于目标时按 差距×TRACK_CATCHUP_GAIN 追赶，再受速度上限约束。
 */
export function advanceBusTrack(track: BusTrack, now: number, atSite = false): number {
  const dt = clamp((now - track.lastRenderAt) / 1000, 0, 0.5)
  track.lastRenderAt = now
  const age = Math.max(0, now - track.lastObserveAt)
  const canPredict = !atSite && track.speedMps > 0.6 && age <= TRACK_EXTRAPOLATE_WINDOW_MS
  const predict = canPredict ? Math.min(track.speedMps * (age / 1000) * 0.85, TRACK_MAX_EXTRAPOLATE_M) : 0
  const target = Math.min(track.totalMeters, track.along + predict)
  if (track.display < target) {
    const gap = target - track.display
    const rate = Math.min(TRACK_MAX_CATCHUP_MPS, Math.max(track.speedMps, gap * TRACK_CATCHUP_GAIN))
    track.display = Math.min(target, track.display + rate * dt)
  }
  // display 走到过 along 前面（推算多了）时向后等 along 追上来，不回退。
  return track.display
}
