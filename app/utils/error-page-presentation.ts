export interface ErrorPageContent {
  code: string | null
  kicker: string
  title: string
  description: string
  icon: string
  canRetry: boolean
}

export const errorRecoveryActions = [
  { label: '搜索校园信息', to: '/search', icon: 'i-lucide-search' },
  { label: '查看校园地图', to: '/map', icon: 'i-lucide-map' },
  { label: '查找办事流程', to: '/procedures', icon: 'i-lucide-list-checks' }
] as const

export function resolveErrorPageContent(statusCode: number | null | undefined): ErrorPageContent {
  if (statusCode === 404) {
    return {
      code: null,
      kicker: '页面走丢了',
      title: '这个页面不存在',
      description: '链接可能已经更新，这条内容也可能已经移动或下架。你可以返回首页，或从下面的入口继续查找。',
      icon: 'i-lucide-map-pin-off',
      canRetry: false
    }
  }

  if (statusCode === 403) {
    return {
      code: null,
      kicker: '暂时不能进入',
      title: '这里现在不能访问',
      description: '这个账号暂时不能打开这里。校园地图和办事指南仍然可以正常使用。',
      icon: 'i-lucide-shield-alert',
      canRetry: false
    }
  }

  if (statusCode === 429) {
    return {
      code: null,
      kicker: '先缓一缓',
      title: '刚才的操作有点快',
      description: '请稍等一会儿再试。你也可以先去地图、办事指南或校园搜索看看。',
      icon: 'i-lucide-timer-reset',
      canRetry: true
    }
  }

  return {
    code: null,
    kicker: '暂时没打开',
    title: '页面现在有点忙',
    description: '请稍后重新打开。校园地图和办事指南通常仍能使用，你也可以先从首页继续浏览。',
    icon: 'i-lucide-cloud-sun',
    canRetry: true
  }
}
