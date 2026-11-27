export type BurstParticleKind = 'heart' | 'thumb' | 'note' | 'sparkle'

export interface BurstParticlePreset {
  readonly kind: BurstParticleKind
  readonly dx: number
  readonly dy: number
  readonly rot: number
  readonly delayMs: number
  readonly scale: number
  readonly color: string
}

export interface VoteBurstItem {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly label: string
  readonly variant: 0 | 1 | 2
}

export interface VoteBurstTriggerInput {
  x: number
  y: number
  label?: string
}

export const MAX_ACTIVE_VOTE_BURSTS = 3
export const VOTE_BURST_TTL_MS = 820

/**
 * 模块级只读粒子模板：全页共用同一份偏移与配色常量，
 * 每次点赞只分配 1 个极简 VoteBurstItem，避免频繁创建大数组。
 */
export const BURST_PARTICLE_PRESETS: readonly BurstParticlePreset[] = Object.freeze([
  { kind: 'thumb', dx: -46, dy: -66, rot: -18, delayMs: 0, scale: 1.05, color: '#e11d48' },
  { kind: 'heart', dx: 44, dy: -68, rot: 16, delayMs: 25, scale: 1, color: '#fb7185' },
  { kind: 'note', dx: -68, dy: -28, rot: -24, delayMs: 40, scale: 0.95, color: '#f97316' },
  { kind: 'sparkle', dx: 66, dy: -32, rot: 28, delayMs: 15, scale: 0.9, color: '#f59e0b' },
  { kind: 'heart', dx: -22, dy: -84, rot: -12, delayMs: 55, scale: 0.85, color: '#f43f5e' },
  { kind: 'note', dx: 24, dy: -82, rot: 20, delayMs: 45, scale: 0.9, color: '#0ea5e9' },
  { kind: 'sparkle', dx: -54, dy: 14, rot: -32, delayMs: 65, scale: 0.8, color: '#f59e0b' },
  { kind: 'thumb', dx: 54, dy: 12, rot: 22, delayMs: 55, scale: 0.85, color: '#0ea5e9' }
])

function clampCoordinate(value: number, fallback: number, maxLimit = 4096): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(maxLimit, Math.max(0, Math.round(value)))
}

export function resolveElementCenterPoint(
  element: Element | null | undefined,
  fallback?: VoteBurstTriggerInput
): VoteBurstTriggerInput {
  if (element && element.isConnected && typeof element.getBoundingClientRect === 'function') {
    const rect = element.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }
    }
  }
  if (fallback) return fallback
  if (typeof window !== 'undefined') {
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.65
    }
  }
  return { x: 180, y: 360 }
}

export interface VoteBurstControllerOptions {
  maxActive?: number
  ttlMs?: number
  onChange?: (items: readonly VoteBurstItem[]) => void
}

export interface VoteBurstController {
  readonly bursts: { readonly value: readonly VoteBurstItem[] }
  trigger: (input: VoteBurstTriggerInput) => void
  dispose: () => void
  activeTimerCount: () => number
}

/**
 * 轻量有界粒子队列控制器：
 * - 并发上限封顶（默认 3 组），防止快速连点导致 DOM 与合成层内存累积
 * - 每组到期自动移出并清理定时器，组件卸载时一键释放全部资源
 */
export function createVoteBurstController(options: VoteBurstControllerOptions = {}): VoteBurstController {
  const maxActive = Math.max(1, options.maxActive ?? MAX_ACTIVE_VOTE_BURSTS)
  const ttlMs = Math.max(20, options.ttlMs ?? VOTE_BURST_TTL_MS)
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let current: VoteBurstItem[] = []
  let seq = 0

  const burstsBox = {
    get value(): readonly VoteBurstItem[] {
      return current
    }
  }

  function notify(): void {
    options.onChange?.(current)
  }

  function removeById(id: number): void {
    const timer = timers.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(id)
    }
    const next = current.filter(item => item.id !== id)
    if (next.length !== current.length) {
      current = next
      notify()
    }
  }

  function trigger(input: VoteBurstTriggerInput): void {
    seq += 1
    const id = seq
    const label = (input.label ?? '').trim() || '+1'
    const item: VoteBurstItem = {
      id,
      x: clampCoordinate(input.x, 180),
      y: clampCoordinate(input.y, 320),
      label,
      variant: (id % 3) as 0 | 1 | 2
    }

    while (current.length >= maxActive) {
      const oldest = current[0]
      if (!oldest) break
      const oldestTimer = timers.get(oldest.id)
      if (oldestTimer !== undefined) {
        clearTimeout(oldestTimer)
        timers.delete(oldest.id)
      }
      current = current.slice(1)
    }

    current = [...current, item]
    const timer = setTimeout(() => {
      removeById(id)
    }, ttlMs)
    timers.set(id, timer)
    notify()
  }

  function dispose(): void {
    for (const timer of timers.values()) {
      clearTimeout(timer)
    }
    timers.clear()
    if (current.length > 0) {
      current = []
      notify()
    }
  }

  return {
    bursts: burstsBox,
    trigger,
    dispose,
    activeTimerCount: () => timers.size
  }
}
