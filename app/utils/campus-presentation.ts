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

export interface CampusMilitaryPreparationItem {
  title: string
  description: string
  icon: string
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
    to: '/campus#military-training'
  }
]

export const campusMilitaryPreparation = {
  badge: '2026 级 · 暂定安排',
  date: '12 月 13—26 日',
  title: '军训现在先准备到这里',
  description: '学校校历已经给出暂定日期，具体地点、每天时段、服装装备、体检和请假要求还要等当届通知。',
  items: [
    {
      title: '先记日期，不急着定行程',
      description: '校历注明这是部队初定时间，后续通知如果调整，请按学校和学院最新安排执行。',
      icon: 'i-lucide-calendar-clock'
    },
    {
      title: '装备清单出来后再买',
      description: '目前还没有2026级服装、鞋袜和用品清单，不要按往年帖子购买整套装备，也不要向私人收款码付款。',
      icon: 'i-lucide-shirt'
    },
    {
      title: '身体情况提前说明',
      description: '需要请假、免训或调整训练内容时，提前保留相关材料；交给谁、要哪些证明，以学校当届通知为准。',
      icon: 'i-lucide-heart-pulse'
    },
    {
      title: '往年经历只用来了解形式',
      description: '2025级曾进行16天军训和35公里长途拉练，但不能据此推定2026级训练科目、路线或里程。',
      icon: 'i-lucide-history'
    }
  ] satisfies CampusMilitaryPreparationItem[]
} as const

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
