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
      title: '正在检查网络',
      description: '稍后可重新尝试加载公开内容。',
      icon: 'i-lucide-loader-circle',
      tone: 'bg-zinc-100 text-zinc-600'
    }
  }

  if (isOnline) {
    return {
      title: '网络已恢复',
      description: '可以重新加载原页面，获取当前已发布内容。',
      icon: 'i-lucide-wifi',
      tone: 'bg-green-50 text-green-700'
    }
  }

  return {
    title: '当前处于离线状态',
    description: '动态内容和地图数据无法更新，本页不会把旧数据显示为最新结果。',
    icon: 'i-lucide-wifi-off',
    tone: 'bg-orange-50 text-orange-700'
  }
}

export const offlineBoundaries: OfflineBoundary[] = [
  {
    title: '公开 API 不作离线数据库',
    text: '指南、部门、社团、地点与公告以服务端当前发布状态为准。'
  },
  {
    title: '地图瓦片与导航需要网络',
    text: '离线时不显示新地图瓦片，也不保证外部地图或导航链接可用。'
  },
  {
    title: '已缓存页面仍需核对时效',
    text: '浏览器可能保留应用外壳和静态资源，但是否能打开某个页面取决于当前设备缓存。'
  }
]

export const offlineStaticEntries: OfflineStaticEntry[] = [
  { title: '功能目录', to: '/discover', icon: 'i-lucide-layout-grid' },
  { title: '关于项目', to: '/about', icon: 'i-lucide-info' },
  { title: '隐私说明', to: '/privacy', icon: 'i-lucide-shield-check' }
]
