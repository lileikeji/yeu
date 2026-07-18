export interface OfflineStatus {
  title: string
  description: string
  icon: string
  tone: string
}

export interface OfflineBoundary {
  title: string
  text: string
}

export interface OfflineStaticEntry {
  title: string
  to: string
  icon: string
}

export function resolveOfflineStatus(isOnline: boolean | null): OfflineStatus {
  if (isOnline === null) {
    return {
      title: '正在看看网络是否恢复',
      description: '通常几秒钟就能确认。',
      icon: 'i-lucide-loader-circle',
      tone: 'bg-zinc-100 text-zinc-600'
    }
  }

  if (isOnline) {
    return {
      title: '网络已经恢复',
      description: '可以回到刚才的页面继续查看。',
      icon: 'i-lucide-wifi',
      tone: 'bg-green-50 text-green-700'
    }
  }

  return {
    title: '现在仍然没有网络',
    description: '地图和最新校园消息还不能加载，请稍后再试。',
    icon: 'i-lucide-wifi-off',
    tone: 'bg-orange-50 text-orange-700'
  }
}

export const offlineBoundaries: OfflineBoundary[] = [
  {
    title: '重要信息不要只看旧页面',
    text: '报到日期、地点、营业时间和招新安排可能变化，联网后请再看最新消息。'
  },
  {
    title: '地图和导航需要网络',
    text: '离线时无法加载新的地图画面，也不保证外部地图或导航链接可用。'
  },
  {
    title: '以前打开过的页面不一定能打开',
    text: '设备可能保留一部分页面，但能否打开取决于你之前是否看过，内容也可能已经变化。'
  }
]

export const offlineStaticEntries: OfflineStaticEntry[] = [
  { title: '更多功能', to: '/discover', icon: 'i-lucide-layout-grid' },
  { title: '关于这份指南', to: '/about', icon: 'i-lucide-info' },
  { title: '隐私说明', to: '/privacy', icon: 'i-lucide-shield-check' }
]
