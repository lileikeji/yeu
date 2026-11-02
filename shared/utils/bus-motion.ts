/**
 * 校车视觉平滑 —— GPS 观测与显示位分离：断讯按末速滑行后缓降，不冻结不硬跳。
 * 沿线里程空间运算（米），纯函数无 IO。移植自掌上叮叮 motion.js 思路。
 */

import { CAMPUS_AVERAGE_MPS } from './campus-speed-bumps'

/** 演示态位移速度：用实测均速（3.4 m/s），不再用理想的 6.5 巡航。 */
const DEMO_SPEED_MPS = CAMPUS_AVERAGE_MPS

export interface BusMotionState {
  /** 动画显示位（沿线里程，米） */
  display: number
  /** 最近实测位（沿线里程，米） */
  position: number
  /** 最近实测数据时间戳（ms）；0=无有效时间 */
  stamp: number
  /** 最近接收时刻（本地 performance.now / Date.now，ms） */
  received: number
  /** 实测速度（m/s，带方向符号） */
  speed: number
  /** 行驶方向（1=沿线正向） */
  dir: number
  /** 连续被判定为「跳点」的次数；连续多次才认账，避免 GPS 回调把车拽回去。 */
  rejects?: number
}

/** 可信速度上限（m/s）：校园电瓶车 3–4 m/s，超过 14 m/s（50 km/h）视为跳点。 */
const MAX_PLAUSIBLE_MPS = 14
/** 允许的倒退量（米）：在此之内当作 GPS 抖动吸收，超过则视为回调。 */
const BACK_TOLERANCE_M = 30
/** 连续多少次跳点后认账（例如线路重置、车辆换线）。 */
const REANCHOR_AFTER = 3

/**
 * 断讯外推秒数：前 45s 按实测速度滑行，45–165s 线性缓降到 55% 速度，之后恒速慢行。
 */
export function coastSeconds(age: number): number {
  const hold = 45
  const fade = 120
  const floor = 0.55
  if (age <= hold) return age
  const into = age - hold
  if (into >= fade) return hold + (1 + floor) / 2 * fade + floor * (into - fade)
  const end = 1 - (1 - floor) * (into / fade)
  return hold + (1 + end) / 2 * into
}

/**
 * 记录一次实测（新 fix 到达时调用）。测速仅在时间前进、间隔 ≤90s、速率 ≤12 m/s 且与方向一致时采纳。
 * @param status 'moving' 才计速度；'waiting'（已到站）速度归零
 */
export function observeMotion(
  state: BusMotionState | null,
  position: number,
  timestamp: number,
  received: number,
  dir: number,
  status: 'moving' | 'waiting',
  demo = false
): BusMotionState {
  if (!Number.isFinite(position) || !Number.isFinite(received)) {
    return state ?? {
      display: position, position, stamp: 0, received, speed: 0, dir
    }
  }
  const stamp = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
  if (!state) {
    return {
      display: position,
      position,
      stamp,
      received,
      speed: demo && status === 'moving' ? dir * DEMO_SPEED_MPS : 0,
      dir
    }
  }
  const fresh = stamp > 0 && (!state.stamp || stamp > state.stamp)
  if (fresh) {
    const seconds = state.stamp ? (stamp - state.stamp) / 1000 : 0
    const delta = position - state.position
    const measured = seconds > 0 && seconds <= 90 ? delta / seconds : 0
    // 跳点判定：倒车超过容差、或隐含速度超过可信上限 —— 保留预测位，等下一帧再看。
    const jumpBack = delta < -BACK_TOLERANCE_M
    const tooFast = Math.abs(measured) > MAX_PLAUSIBLE_MPS
    if (seconds > 0 && (tooFast || jumpBack)) {
      state.rejects = (state.rejects ?? 0) + 1
      state.received = received
      if (state.rejects < REANCHOR_AFTER) {
        state.stamp = stamp
        return state
      }
    }
    state.rejects = 0
    state.speed = status !== 'moving'
      ? 0
      : demo
        ? dir * DEMO_SPEED_MPS
        : Math.abs(measured) <= 12 && measured * dir > 0 ? measured : 0
    state.position = position
    state.stamp = stamp
    state.received = received
  } else if (!stamp && position !== state.position) {
    state.position = position
    state.received = received
    state.speed = 0
  }
  if (status !== 'moving' || dir !== state.dir) {
    state.speed = demo && status === 'moving' ? dir * DEMO_SPEED_MPS : 0
  }
  state.dir = dir
  return state
}

/**
 * 推进一帧显示位：向「实测位 + 末速 × 外推秒数」缓动。返回是否发生移动。
 * @param length 线路总长（米），用于端点钳制
 */
export function stepMotion(
  state: BusMotionState | null,
  now: number,
  dt: number,
  length: number
): boolean {
  if (!state || !Number.isFinite(length) || length <= 0) return false
  const age = Math.max(0, (now - state.received) / 1000)
  const projectedSeconds = coastSeconds(age)
  const target = Math.max(0, Math.min(length, state.position + state.speed * projectedSeconds))
  const diff = target - state.display
  const frame = Math.max(0, Math.min(dt, 1))
  const delta = Math.min(
    Math.abs(diff),
    Math.min(15, Math.max(Math.abs(diff) * 3, Math.abs(state.speed))) * frame
  )
  if (delta < 0.00001) return false
  state.display += Math.sign(diff) * delta
  return true
}
