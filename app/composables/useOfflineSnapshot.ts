/**
 * F6「弱网 / 断网兜底」：把最近一次成功打开的公开内容留在本机。
 *
 * 约定：
 * - 首次成功取到数据后写 localStorage，键名统一是 `yeu:offline:` + key，
 *   值是 `{ savedAt: number, payload: T }`；
 * - 之后 loader 抛错（断网、网关错）或超过 4 秒没返回，退回快照并把 stale 置为 true；
 * - 单条超过 64KB 不写，全量只留 12 条，超出按 savedAt 淘汰最旧；
 * - SSR 阶段不读 localStorage，loader 直接打后端；
 * - localStorage 本身出问题（隐私模式、配额满）全部静默吞掉，页面照常能用。
 */

export const OFFLINE_SNAPSHOT_PREFIX = 'yeu:offline:'
export const OFFLINE_SNAPSHOT_MAX_ENTRIES = 12
export const OFFLINE_SNAPSHOT_MAX_BYTES = 64 * 1024
export const OFFLINE_SNAPSHOT_TIMEOUT_MS = 4000

export interface OfflineSnapshot<T> {
  savedAt: number
  payload: T
}

export interface OfflineSnapshotUsage {
  /** 完整的 localStorage 键，含 `yeu:offline:` 前缀。 */
  key: string
  savedAt: number
}

export function buildOfflineSnapshotStorageKey(key: string): string {
  return `${OFFLINE_SNAPSHOT_PREFIX}${key}`
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

/**
 * 序列化一条快照。超过单条上限时返回 null，调用方跳过写入即可。
 */
export function serializeOfflineSnapshot<T>(
  payload: T,
  savedAt: number
): { raw: string, bytes: number } | null {
  try {
    const raw = JSON.stringify({ savedAt, payload })
    const bytes = utf8Bytes(raw)
    return bytes > OFFLINE_SNAPSHOT_MAX_BYTES ? null : { raw, bytes }
  } catch {
    return null
  }
}

export function parseOfflineSnapshot<T>(raw: string | null): OfflineSnapshot<T> | null {
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const candidate = parsed as { savedAt?: unknown, payload?: unknown }
    if (typeof candidate.savedAt !== 'number' || !Number.isFinite(candidate.savedAt)) return null
    if (candidate.payload === undefined) return null
    return { savedAt: candidate.savedAt, payload: candidate.payload as T }
  } catch {
    return null
  }
}

/**
 * 超出条数上限时，返回要删掉的键（按 savedAt 从旧到新）。
 * 解析失败的条目 savedAt 记 0，排在最前面先被淘汰。
 */
export function selectOfflineSnapshotEvictions(
  usage: readonly OfflineSnapshotUsage[],
  limit = OFFLINE_SNAPSHOT_MAX_ENTRIES
): string[] {
  if (usage.length <= limit) return []
  return [...usage]
    .sort((left, right) => left.savedAt - right.savedAt)
    .slice(0, usage.length - limit)
    .map(entry => entry.key)
}

export function formatOfflineSnapshotTime(savedAt: number | null): string {
  if (savedAt === null || !Number.isFinite(savedAt)) return ''
  const date = new Date(savedAt)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function snapshotStorage(): Storage | null {
  if (import.meta.server) return null

  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function readOfflineSnapshot<T>(storageKey: string): OfflineSnapshot<T> | null {
  const storage = snapshotStorage()
  if (!storage) return null

  try {
    return parseOfflineSnapshot<T>(storage.getItem(storageKey))
  } catch {
    return null
  }
}

function pruneOfflineSnapshots(storage: Storage): void {
  try {
    const usage: OfflineSnapshotUsage[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key?.startsWith(OFFLINE_SNAPSHOT_PREFIX)) continue
      usage.push({
        key,
        savedAt: parseOfflineSnapshot(storage.getItem(key))?.savedAt ?? 0
      })
    }
    for (const key of selectOfflineSnapshotEvictions(usage)) {
      storage.removeItem(key)
    }
  } catch {
    // 隐私模式 / 配额：淘汰是尽力而为，失败不影响当前页面。
  }
}

/**
 * 写一条快照。成功返回 savedAt；超出单条上限、序列化失败或 localStorage
 * 不可用都返回 null，调用方不需要区分。
 */
export function writeOfflineSnapshot<T>(storageKey: string, payload: T): number | null {
  const storage = snapshotStorage()
  if (!storage) return null

  const savedAt = Date.now()
  const record = serializeOfflineSnapshot(payload, savedAt)
  if (!record) return null

  try {
    storage.setItem(storageKey, record.raw)
    pruneOfflineSnapshots(storage)
    return savedAt
  } catch {
    return null
  }
}

function isNotFoundError(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) return false
  const status = (cause as { statusCode?: unknown }).statusCode
    ?? (cause as { status?: unknown }).status
  return status === 404
}

function withOfflineSnapshotTimeout<T>(loader: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('OFFLINE_SNAPSHOT_TIMEOUT'))
    }, OFFLINE_SNAPSHOT_TIMEOUT_MS)

    Promise.resolve()
      .then(loader)
      .then(
        (payload) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(payload)
        },
        (cause) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(cause)
        }
      )
  })
}

/**
 * 页面数据入口：成功就顺手存一份，失败就用上一次的快照顶住。
 * `error` 只在「连快照都没有、页面确实给不出内容」时才有值；
 * 成功回落到快照时 `stale` 为 true、`error` 保持 null。
 */
export async function useOfflineSnapshot<T>(key: string, loader: () => Promise<T>) {
  const storageKey = buildOfflineSnapshotStorageKey(key)
  const stale = ref(false)
  const savedAt = ref<number | null>(null)
  const error = ref<unknown>(null)
  let persisted = false

  const { data } = await useAsyncData<T | null>(
    `offline-snapshot-${key}`,
    async () => {
      if (import.meta.server) {
        try {
          return await loader()
        } catch (cause) {
          error.value = cause
          return null
        }
      }

      try {
        const payload = await withOfflineSnapshotTimeout(loader)
        savedAt.value = writeOfflineSnapshot(storageKey, payload)
        persisted = true
        return payload
      } catch (cause) {
        // 404 表示内容真没了，不拿旧快照遮盖；断网、超时、网关错才回落。
        const snapshot = isNotFoundError(cause) ? null : readOfflineSnapshot<T>(storageKey)
        if (!snapshot) {
          error.value = cause
          return null
        }
        stale.value = true
        savedAt.value = snapshot.savedAt
        return snapshot.payload
      }
    },
    { default: () => null }
  )

  // SSR 首屏成功时 loader 跑在服务端，写不了 localStorage；客户端补水后补一次。
  if (import.meta.client && !persisted && !stale.value
    && data.value !== null && data.value !== undefined) {
    savedAt.value = writeOfflineSnapshot(storageKey, data.value)
  }

  return { data, stale, savedAt, error }
}
