export interface CampusStatItem {
  label: string
  value: string
  unit: string
  icon: string
}

export interface CampusPublicContentResponseLike {
  items: readonly unknown[]
}

export const campusStats: CampusStatItem[] = [
  { label: '校园占地', value: '2000+', unit: '亩', icon: 'i-lucide-map' },
  { label: '全日制学生', value: '1.3万+', unit: '人', icon: 'i-lucide-graduation-cap' },
  { label: '学院', value: '12', unit: '个', icon: 'i-lucide-school' }
]

export const campusFallbackMessages = {
  serviceUnavailable: '校园内容服务暂时不可用，请稍后重试。',
  staticDepartmentFallback: '当前先显示学校公开入口与基础资料，后续可在内容管理中持续补充。',
  emptyCatalog: '校园资料正在整理中，暂时没有可公开展示的新记录。'
} as const

export function resolveCampusFallbackMessage(input: {
  hasError: boolean
  response: CampusPublicContentResponseLike | null | undefined
  allowStaticDepartmentFallback: boolean
}): string | null {
  if (input.hasError) return campusFallbackMessages.serviceUnavailable
  if (!input.response) return null
  if (input.allowStaticDepartmentFallback) return campusFallbackMessages.staticDepartmentFallback
  if (!input.response.items.length) return campusFallbackMessages.emptyCatalog
  return null
}
