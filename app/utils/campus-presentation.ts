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
  serviceUnavailable: '地图、学校官网和下方已有介绍仍然可以使用。',
  staticDepartmentFallback: '这里先列出学校官网中的常用信息，部分联系方式还没有收录。',
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
