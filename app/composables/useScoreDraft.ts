import type { CompetitionRoundKey } from '~~/shared/types'

/**
 * 断网续评：评分先在本地落草稿，发送失败就进重试队列。
 *
 * 现场 WiFi 抖动时评委点「提交」只丢一次请求，不该丢一整份分数，
 * 所以顺序是「先写草稿 → 再发请求 → 成功删草稿」。请求失败后由
 * online 事件 / 页面重新可见 / 20 秒兜底扫一次来补交，最多 5 次。
 */

/** 草稿的 localStorage 键；结构一变就改版本号，旧草稿自然作废。 */
export const SCORE_DRAFT_STORAGE_KEY = 'yeu:score-draft:v1'
/** 同一份评分最多补交 5 次。 */
export const SCORE_DRAFT_MAX_ATTEMPTS = 5
/** 补交退避：2 / 4 / 8 / 16 / 32 秒。 */
export const SCORE_DRAFT_BACKOFF_MS = [2000, 4000, 8000, 16000, 32000] as const
/** 队列里有草稿时，每 20 秒兜底扫一次。 */
export const SCORE_DRAFT_RETRY_TICK_MS = 20_000
/** 队列状态标签。 */
export const SCORE_DRAFT_QUEUED_NOTICE = '待提交'

export interface ScoreDraftPayload {
  scores: Record<string, number>
  comment: string
}

export interface ScoreDraftItem {
  id: string
  singerId: string
  roundKey: CompetitionRoundKey
  payload: ScoreDraftPayload
  createdAt: number
  /** 已经自动补交过几次（不含评委手动点的那一下）。 */
  attempts: number
}

export interface ScoreDraftSaveInput {
  roundKey: CompetitionRoundKey
  singerId: string
  judgeId: string
  payload: ScoreDraftPayload
}

export type ScoreDraftSaveResult
  = | { status: 'sent' }
    | { status: 'queued' }
    | { status: 'rejected', error: unknown }

/** 只用到取/写/删三个方法，测试里可以用内存对象顶替。 */
export interface ScoreDraftStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type ScoreDraftSender = (item: ScoreDraftItem) => Promise<unknown>

/**
 * 同一评委、同一选手、同一轮只有一份草稿：
 * 改分后重复提交只会覆盖这一份，不会在队列里堆出第二条。
 */
export function scoreDraftId(roundKey: string, singerId: string, judgeId: string): string {
  return `${roundKey}:${singerId}:${judgeId}`
}

/** 第 n 次自动补交前的等待时间；n 从 0 开始，超出上限就按最后一档算。 */
export function scoreDraftBackoffMs(attempts: number): number {
  const clamped = Number.isFinite(attempts)
    ? Math.min(Math.max(Math.trunc(attempts), 0), SCORE_DRAFT_BACKOFF_MS.length - 1)
    : 0
  return SCORE_DRAFT_BACKOFF_MS[clamped] ?? 0
}

/** 还能不能再自动补交一次。 */
export function canRetryScoreDraft(attempts: number): boolean {
  return attempts < SCORE_DRAFT_MAX_ATTEMPTS
}

/**
 * 网络断了、服务端 5xx、限流才有必要补交；
 * 本轮已结束、不是当前选手、会话失效这类明确拒绝，再交多少次也不会变。
 */
export function shouldRetryScoreDraftError(error: unknown): boolean {
  const failure = typeof error === 'object' && error !== null
    ? error as { statusCode?: number, status?: number }
    : {}
  const status = failure.statusCode ?? failure.status
  if (typeof status !== 'number' || !Number.isFinite(status)) return true
  if (status >= 500) return true
  return status === 408 || status === 429
}

function normalizeDraftItem(raw: unknown): ScoreDraftItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<ScoreDraftItem>
  if (typeof item.id !== 'string' || !item.id) return null
  if (typeof item.singerId !== 'string' || !item.singerId) return null
  if (typeof item.roundKey !== 'string' || !item.roundKey) return null
  const payload = item.payload
  if (!payload || typeof payload !== 'object') return null
  return {
    id: item.id,
    singerId: item.singerId,
    roundKey: item.roundKey as CompetitionRoundKey,
    payload: {
      scores: { ...(payload.scores ?? {}) },
      comment: typeof payload.comment === 'string' ? payload.comment : ''
    },
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : 0,
    attempts: typeof item.attempts === 'number' && item.attempts > 0 ? Math.trunc(item.attempts) : 0
  }
}

/** 解析 localStorage 里的原始串；坏数据一律当作没有草稿。 */
export function parseScoreDrafts(raw: string | null | undefined): ScoreDraftItem[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return []
    const items = (parsed as { items?: unknown }).items
    if (!Array.isArray(items)) return []
    return items
      .map(normalizeDraftItem)
      .filter((item): item is ScoreDraftItem => item !== null)
  } catch {
    return []
  }
}

/** 读草稿；storage 不可用（SSR、隐私模式、配额爆了）就是空队列。 */
export function readScoreDrafts(storage: ScoreDraftStorage | null | undefined): ScoreDraftItem[] {
  if (!storage) return []
  try {
    return parseScoreDrafts(storage.getItem(SCORE_DRAFT_STORAGE_KEY))
  } catch {
    return []
  }
}

/** 写草稿；写不进去只影响刷新后的续评，不影响本次提交。 */
export function writeScoreDrafts(
  storage: ScoreDraftStorage | null | undefined,
  items: ScoreDraftItem[]
): void {
  if (!storage) return
  try {
    if (items.length === 0) {
      storage.removeItem(SCORE_DRAFT_STORAGE_KEY)
      return
    }
    storage.setItem(SCORE_DRAFT_STORAGE_KEY, JSON.stringify({ items }))
  } catch {
    // localStorage 满了或被禁用：队列退回内存，本次会话照常补交。
  }
}

/** 按 id 覆盖或追加；同一份评分永远只留一条。 */
export function upsertScoreDraft(items: ScoreDraftItem[], next: ScoreDraftItem): ScoreDraftItem[] {
  const index = items.findIndex(item => item.id === next.id)
  if (index === -1) return [...items, next]
  const copy = items.slice()
  copy[index] = next
  return copy
}

export function removeScoreDraft(items: ScoreDraftItem[], id: string): ScoreDraftItem[] {
  return items.filter(item => item.id !== id)
}

export interface UseScoreDraftOptions {
  /** 真正发请求的那一步；抛错就会被当成「没交上去」。 */
  send: ScoreDraftSender
  /** 后台补交成功后回调，页面拿来刷新当前评分。 */
  onFlushed?: (item: ScoreDraftItem) => void
}

export function useScoreDraft(options: UseScoreDraftOptions) {
  const items = ref<ScoreDraftItem[]>([])
  const flushing = ref(false)
  /** 每份草稿下一次允许补交的时间点；只活在内存里，刷新页面就重新给机会。 */
  const notBefore = new Map<string, number>()
  let ticker: ReturnType<typeof setInterval> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const pendingCount = computed(() => items.value.length)

  function resolveStorage(): ScoreDraftStorage | null {
    if (!import.meta.client || typeof window === 'undefined') return null
    try {
      return window.localStorage
    } catch {
      return null
    }
  }

  function persist(next: ScoreDraftItem[]): void {
    items.value = next
    writeScoreDrafts(resolveStorage(), next)
    syncTicker()
  }

  function syncTicker(): void {
    const wanted = import.meta.client && items.value.length > 0
    if (wanted && !ticker) {
      ticker = setInterval(() => {
        void flush()
      }, SCORE_DRAFT_RETRY_TICK_MS)
    } else if (!wanted && ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  /** 按最近的「可补交时间」挂一个定时器，让 2/4/8/16/32 秒真的生效。 */
  function armRetryTimer(): void {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (!import.meta.client || items.value.length === 0) return
    const now = Date.now()
    const waits = items.value
      .filter(item => canRetryScoreDraft(item.attempts))
      .map(item => Math.max(0, (notBefore.get(item.id) ?? now) - now))
    if (waits.length === 0) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      void flush()
    }, Math.min(...waits))
  }

  async function attempt(item: ScoreDraftItem): Promise<{
    outcome: 'sent' | 'retry' | 'rejected'
    error?: unknown
  }> {
    try {
      await options.send(item)
      return { outcome: 'sent' }
    } catch (error) {
      return {
        outcome: shouldRetryScoreDraftError(error) ? 'retry' : 'rejected',
        error
      }
    }
  }

  /** 按创建顺序把能交的都交一遍；交不掉的等下一轮。 */
  async function flush(): Promise<void> {
    if (flushing.value || !import.meta.client) return
    const queue = items.value.slice().sort((a, b) => a.createdAt - b.createdAt)
    if (queue.length === 0) {
      armRetryTimer()
      return
    }

    flushing.value = true
    try {
      for (const queued of queue) {
        const current = items.value.find(item => item.id === queued.id)
        if (!current || !canRetryScoreDraft(current.attempts)) continue
        if ((notBefore.get(current.id) ?? 0) > Date.now()) continue

        const result = await attempt(current)
        if (result.outcome === 'sent') {
          notBefore.delete(current.id)
          persist(removeScoreDraft(items.value, current.id))
          options.onFlushed?.(current)
          continue
        }
        if (result.outcome === 'rejected') {
          // 服务端明确拒绝：本轮已关闭、已切到下一位。继续交只会一直撞墙。
          notBefore.delete(current.id)
          persist(removeScoreDraft(items.value, current.id))
          continue
        }

        const attempts = current.attempts + 1
        persist(upsertScoreDraft(items.value, { ...current, attempts }))
        if (canRetryScoreDraft(attempts)) {
          notBefore.set(current.id, Date.now() + scoreDraftBackoffMs(attempts))
        } else {
          notBefore.delete(current.id)
        }
      }
    } finally {
      flushing.value = false
      armRetryTimer()
    }
  }

  async function save(input: ScoreDraftSaveInput): Promise<ScoreDraftSaveResult> {
    const id = scoreDraftId(input.roundKey, input.singerId, input.judgeId)
    const existing = items.value.find(item => item.id === id)
    const item: ScoreDraftItem = {
      id,
      singerId: input.singerId,
      roundKey: input.roundKey,
      payload: {
        scores: { ...input.payload.scores },
        comment: input.payload.comment
      },
      createdAt: existing?.createdAt ?? Date.now(),
      attempts: 0
    }

    // 先落草稿再发请求：请求还没回来就断网、关页面，分数也还在。
    persist(upsertScoreDraft(items.value, item))
    notBefore.delete(id)

    const result = await attempt(item)
    if (result.outcome === 'sent') {
      persist(removeScoreDraft(items.value, id))
      return { status: 'sent' }
    }
    if (result.outcome === 'rejected') {
      persist(removeScoreDraft(items.value, id))
      return { status: 'rejected', error: result.error }
    }

    notBefore.set(id, Date.now() + scoreDraftBackoffMs(0))
    armRetryTimer()
    return { status: 'queued' }
  }

  /** 「立即重试」：评委手动点一下，之前的次数清零，马上按顺序再交一遍。 */
  async function retryNow(): Promise<void> {
    if (!import.meta.client) return
    notBefore.clear()
    if (items.value.length > 0) {
      persist(items.value.map(item => ({ ...item, attempts: 0 })))
    }
    await flush()
  }

  function handleOnline(): void {
    // 网络刚回来，之前的退避不再有意义，立刻按顺序补交。
    notBefore.clear()
    void flush()
  }

  function handleVisibility(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') void flush()
  }

  function stop(): void {
    if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (!import.meta.client || typeof window === 'undefined') return
    window.removeEventListener('online', handleOnline)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }

  onMounted(() => {
    items.value = readScoreDrafts(resolveStorage())
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)
    syncTicker()
    if (items.value.length > 0) void flush()
  })

  onBeforeUnmount(stop)

  return {
    pendingCount,
    flushing,
    save,
    retryNow
  }
}
