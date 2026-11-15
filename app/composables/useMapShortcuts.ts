// P-002/impl/04：地图抽屉首屏的「收藏 / 最近去过」快捷数据。
// 只存 id 与时间戳，地点本体永远以 public catalog 为准，避免缓存过期数据。
const FAVORITES_KEY = 'yeu-map-favorites'
const RECENT_KEY = 'yeu-map-recent'
const RECENT_LIMIT = 12

export interface MapRecentEntry {
  id: string
  at: number
}

function readFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'string' || item.length === 0 || seen.has(item)) continue
      seen.add(item)
      result.push(item)
    }
    return result
  } catch {
    return []
  }
}

function readRecent(): MapRecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const byId = new Map<string, number>()
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const { id, at } = item as { id?: unknown, at?: unknown }
      if (typeof id !== 'string' || id.length === 0) continue
      if (typeof at !== 'number' || !Number.isFinite(at)) continue
      const stored = byId.get(id)
      if (stored === undefined || at > stored) byId.set(id, at)
    }
    return [...byId.entries()]
      .map(([id, at]) => ({ id, at }))
      .sort((left, right) => right.at - left.at)
      .slice(0, RECENT_LIMIT)
  } catch {
    return []
  }
}

export function useMapShortcuts() {
  const favorites = useState<string[]>('map-shortcuts-favorites', () => [])
  const recent = useState<MapRecentEntry[]>('map-shortcuts-recent', () => [])
  const hydrated = useState<boolean>('map-shortcuts-hydrated', () => false)

  function persist(): void {
    if (!import.meta.client) return
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.value))
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value))
    } catch {
      // 无痕模式 / 配额用尽：只保留内存态，不阻断交互
    }
  }

  function hydrate(): void {
    if (!import.meta.client || hydrated.value) return
    hydrated.value = true
    favorites.value = readFavorites()
    recent.value = readRecent()
    // 读盘后立刻按规范形态回写：去重、倒序、上限 12 都落盘
    persist()
  }

  function isFavorite(id: string): boolean {
    return favorites.value.includes(id)
  }

  function toggleFavorite(id: string): void {
    hydrate()
    favorites.value = favorites.value.includes(id)
      ? favorites.value.filter(item => item !== id)
      : [...favorites.value, id]
    persist()
  }

  function touchRecent(id: string): void {
    hydrate()
    const at = Date.now()
    recent.value = [
      { id, at },
      ...recent.value.filter(entry => entry.id !== id)
    ].slice(0, RECENT_LIMIT)
    persist()
  }

  function clearRecent(): void {
    hydrated.value = true
    recent.value = []
    persist()
  }

  // 首屏在 mounted 后读盘，SSR 首帧使用空数组，不会触发 hydration mismatch
  onMounted(hydrate)

  return {
    favorites,
    recent,
    isFavorite,
    toggleFavorite,
    touchRecent,
    clearRecent
  }
}
