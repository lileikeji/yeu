export interface SpringCurve {
  /** 每帧把数值拉向目标的强度 */
  k: number
  /** 每帧后残存的动量比例（按 60fps 标定） */
  d: number
}

/**
 * 一条弹簧，管这一页所有有弹性的东西。
 *
 * 取样点：0 → 重、稳、仍然到位；100 → 快、能看到回弹；中间任何位置都不会长时间振荡。
 * 系数不是随手写的：k 0.08..0.24 与 d 0.62..0.82 合起来，
 * 阻尼比从约 0.85（几乎不过冲）滑到约 0.20（两次可见回弹），两端都能上线。
 */
export function springOf(tune: number): SpringCurve {
  const clamped = Math.min(100, Math.max(0, tune))
  return {
    k: 0.08 + (clamped / 100) * 0.16,
    d: 0.62 + (clamped / 100) * 0.2
  }
}

/** 收敛阈值：位移和速度都掉到这个量级以下就直接吸附，省掉看不见的尾帧 */
const SNAP = 0.02

/**
 * 逐值弹簧：每个采样点自己追自己的目标，跑完停在原位。
 *
 * 帧数而不是毫秒：阻尼按 Math.pow(d, dt) 折算，掉帧时能量衰减与两帧等价，
 * 忙页面上不会变成另一条曲线。数值本身立刻是正确值，只有图形在追赶。
 */
export function settleSeries(
  from: number[],
  to: number[],
  onFrame: (values: number[]) => void,
  options: { tune?: number, onDone?: () => void } = {}
): () => void {
  const { k, d } = springOf(options.tune ?? 55)
  const size = to.length
  const values = new Array<number>(size)
  const velocity = new Array<number>(size)
  for (let i = 0; i < size; i += 1) {
    values[i] = from[i] ?? to[i] ?? 0
    velocity[i] = 0
  }

  let frame = 0
  let previous = 0
  let cancelled = false

  const step = (now: number) => {
    if (cancelled) return
    const dt = previous ? Math.min(3, Math.max(0.25, (now - previous) / (1000 / 60))) : 1
    previous = now
    let moving = false

    for (let i = 0; i < size; i += 1) {
      const target = to[i] ?? 0
      const delta = target - values[i]!
      velocity[i] = (velocity[i]! + delta * k) * Math.pow(d, dt)
      values[i] = values[i]! + velocity[i]! * dt
      if (Math.abs(target - values[i]!) > SNAP || Math.abs(velocity[i]!) > SNAP) {
        moving = true
      } else {
        values[i] = target
        velocity[i] = 0
      }
    }

    onFrame(values.slice())
    if (moving) frame = requestAnimationFrame(step)
    else options.onDone?.()
  }

  frame = requestAnimationFrame(step)
  return () => {
    cancelled = true
    cancelAnimationFrame(frame)
  }
}

/**
 * 重采样到固定点数：7/30/90 天切换时点数不同，先统一长度才谈得上"图形过渡"。
 */
export function resampleSeries(values: number[], size: number): number[] {
  if (size <= 0) return []
  if (values.length === 0) return new Array<number>(size).fill(0)
  if (values.length === 1) return new Array<number>(size).fill(values[0]!)
  const result = new Array<number>(size)
  const span = values.length - 1
  for (let i = 0; i < size; i += 1) {
    const position = (i / (size - 1)) * span
    const left = Math.floor(position)
    const right = Math.min(span, left + 1)
    const ratio = position - left
    result[i] = values[left]! + (values[right]! - values[left]!) * ratio
  }
  return result
}
