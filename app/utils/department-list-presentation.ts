export const departmentListMessages = {
  serviceUnavailable: '下方仍可查看学校公开的常用部门；办公地点和联系方式请以学校最新信息为准。',
  emptyMatch: '没有匹配的部门'
} as const

export const departmentNeedShortcuts = [
  { label: '录取通知', query: '录取' },
  { label: '课表选课', query: '教务' },
  { label: '校园网', query: '校园网' },
  { label: '宿舍报修', query: '报修' },
  { label: '资助贷款', query: '资助' },
  { label: '安全求助', query: '安全' }
] as const

export interface DepartmentListFilterableItem {
  name: string
  summary: string
  phone?: string | null
  email?: string | null
}

export const departmentListPrioritySlugs = [
  'admissions-office',
  'student-affairs',
  'teaching-affairs-office',
  'financial-aid-center',
  'campus-clinic',
  'mental-health-center',
  'general-affairs-office',
  'information-office',
  'library'
] as const

export function prioritizeDepartmentListItems<T extends { slug: string }>(
  departments: ReadonlyArray<T>
): T[] {
  const priority = new Map<string, number>(departmentListPrioritySlugs.map((slug, index) => [slug, index]))
  return [...departments].sort((left, right) => {
    const leftPriority = priority.get(left.slug) ?? Number.MAX_SAFE_INTEGER
    const rightPriority = priority.get(right.slug) ?? Number.MAX_SAFE_INTEGER
    return leftPriority - rightPriority
  })
}

export function filterDepartmentListItems<T extends DepartmentListFilterableItem>(
  departments: ReadonlyArray<T>,
  query: string
): T[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) {
    return [...departments]
  }

  return departments.filter((department) => {
    const text = [department.name, department.summary, department.phone, department.email]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('zh-CN')
    return text.includes(normalized)
  })
}

export function departmentListContactPreview(department: DepartmentListFilterableItem): string {
  return department.phone || department.email || '查看部门介绍'
}
