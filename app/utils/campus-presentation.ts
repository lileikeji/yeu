export interface CampusStatItem {
  label: string
  value: string
  unit: string
  icon: string
}

export interface CampusFreshmanDateItem {
  date: string
  title: string
  description: string
  icon: string
  to: string
}

export interface CampusPublicContentResponseLike {
  items: readonly unknown[]
}

export const campusStats: CampusStatItem[] = [
  { label: '校园占地', value: '2000+', unit: '亩', icon: 'i-lucide-map' },
  { label: '全日制学生', value: '1.3万+', unit: '人', icon: 'i-lucide-graduation-cap' },
  { label: '学院', value: '12', unit: '个', icon: 'i-lucide-school' }
]

export const campusFreshmanDates: CampusFreshmanDateItem[] = [
  {
    date: '9 月 5—6 日',
    title: '注册报到',
    description: '个人到校时段、地点和材料看录取通知书',
    icon: 'i-lucide-clipboard-check',
    to: '/procedures/arrival'
  },
  {
    date: '9 月 7—9 日',
    title: '入学教育',
    description: '具体安排等学院或辅导员通知',
    icon: 'i-lucide-users-round',
    to: '/guides/study-library#guide-section-0'
  },
  {
    date: '9 月 10 日',
    title: '开始上课',
    description: '课表、教室和教材按教务及学院通知准备',
    icon: 'i-lucide-book-open-check',
    to: '/guides/study-library#guide-section-0'
  },
  {
    date: '12 月 13—26 日',
    title: '军训（暂定）',
    description: '部队安排仍可能调整，先不要照搬往年时间',
    icon: 'i-lucide-shield-check',
    to: '/guides/study-library#guide-section-0'
  }
]

export const campusFallbackMessages = {
  serviceUnavailable: '地图、学校官网和下方已有介绍仍然可以使用。',
  staticDepartmentFallback: '这里先列出学校官网中的常用信息，部分联系方式还在整理。',
  emptyCatalog: '校园信息暂时还没有准备好，请稍后再看。'
} as const

export const campusFeaturedDepartmentSlugs = [
  'teaching-affairs-office',
  'student-affairs',
  'admissions-office',
  'financial-aid-center',
  'campus-clinic',
  'library'
] as const

export function selectFeaturedDepartments<T extends { slug: string }>(departments: ReadonlyArray<T>): T[] {
  const bySlug = new Map(departments.map(department => [department.slug, department]))
  return campusFeaturedDepartmentSlugs
    .map(slug => bySlug.get(slug))
    .filter((department): department is T => Boolean(department))
}

export function selectFeaturedClubs<T>(clubs: ReadonlyArray<T>, limit = 6): T[] {
  return clubs.slice(0, Math.max(0, limit))
}

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
