export interface OfflineStatus {
  pageKicker: string
  pageTitle: string
  pageDescription: string
  title: string
  description: string
  icon: string
  tone: string
}

export interface OfflineBoundary {
  title: string
  text: string
  icon: string
}

export interface OfflineStaticEntry {
  title: string
  to: string
  icon: string
}

export function resolveOfflineStatus(isOnline: boolean | null): OfflineStatus {
  if (isOnline === null) {
    return {
      pageKicker: '网络提示',
      pageTitle: '正在看看网络是否恢复',
      pageDescription: '校园地图、路线和最新通知需要联网查看。连上网络后，这里会自动恢复。',
      title: '正在查看网络',
      description: '连上网络后，这里会自动恢复。',
      icon: 'i-lucide-loader-circle',
      tone: 'bg-zinc-100 text-zinc-600'
    }
  }

  if (isOnline) {
    return {
      pageKicker: '网络已恢复',
      pageTitle: '可以回到刚才的页面了',
      pageDescription: '连接已经恢复，回到原页面后可以继续查看校园地图、路线和最新通知。',
      title: '网络已经恢复',
      description: '可以回到刚才的页面继续查看。',
      icon: 'i-lucide-wifi',
      tone: 'bg-green-50 text-green-700'
    }
  }

  return {
    pageKicker: '网络断开了',
    pageTitle: '先检查网络，连上后再继续',
    pageDescription: '校园地图、路线和最新通知需要联网查看。连接恢复后，可以直接回到刚才的页面。',
    title: '还没有连上网络',
    description: '先检查 Wi-Fi 或移动网络，连上后再回到刚才的页面。',
    icon: 'i-lucide-wifi-off',
    tone: 'bg-orange-50 text-orange-700'
  }
}

export const offlineBoundaries: OfflineBoundary[] = [
  {
    title: '报到安排要重新确认',
    text: '报到日期、地点和材料可能调整，连上网络后请再看学校最新通知。',
    icon: 'i-lucide-calendar-check-2'
  },
  {
    title: '地图和路线暂时用不了',
    text: '校园地图、路线规划和外部导航都需要联网，出发前请先恢复网络。',
    icon: 'i-lucide-map-pinned'
  },
  {
    title: '之前看过的内容可能有变化',
    text: '手机里之前打开过的页面可能还能看，但日期、地点和营业时间不一定还是最新的。',
    icon: 'i-lucide-history'
  }
]

export const offlineStaticEntries: OfflineStaticEntry[] = [
  { title: '报到准备', to: '/procedures/arrival', icon: 'i-lucide-clipboard-check' },
  { title: '新生清单', to: '/checklist', icon: 'i-lucide-list-checks' },
  { title: '安全电话与求助', to: '/guides/safety-health', icon: 'i-lucide-shield-plus' }
]
