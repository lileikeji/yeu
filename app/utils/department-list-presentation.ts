export const departmentListMessages = {
  serviceUnavailable: '下方仍可查看学校公开的常用部门；办公地点和联系方式请以学校最新信息为准。',
  emptyMatch: '没有匹配的部门',
  contactPending: '联系方式待公布',
  contactReady: '有公开联系方式',
  openIntro: '打开介绍'
} as const

export const departmentNeedShortcuts = [
  { label: '录取通知', query: '招生办公室' },
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
  address?: string | null
  officeHours?: string | null
  website?: string | null
  contactPhone?: string | null
  groupQrUrl?: string | null
  contactQrUrl?: string | null
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

export function prioritizeDepartmentListItems<T extends { slug: string, sortOrder?: number }>(
  departments: ReadonlyArray<T>
): T[] {
  if (departments.some(item => typeof item.sortOrder === 'number' && item.sortOrder < 10000)) {
    return [...departments].sort((left, right) => (
      (left.sortOrder ?? 10000) - (right.sortOrder ?? 10000)
    ))
  }
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

export function hasDepartmentContactMethod(department: DepartmentListFilterableItem): boolean {
  return Boolean(
    department.phone?.trim()
    || department.email?.trim()
    || department.contactPhone?.trim()
    || department.groupQrUrl?.trim()
    || department.contactQrUrl?.trim()
  )
}

export function resolveDepartmentContactStatusText(department: DepartmentListFilterableItem): string {
  return hasDepartmentContactMethod(department)
    ? departmentListMessages.contactReady
    : departmentListMessages.contactPending
}

export function departmentListContactPreview(department: DepartmentListFilterableItem): string {
  const phone = department.phone?.trim()
  if (phone) return phone

  const email = department.email?.trim()
  if (email) return email

  if (department.contactPhone?.trim()) return department.contactPhone.trim()
  if (department.groupQrUrl?.trim()) return '可扫码加入群聊'
  if (department.contactQrUrl?.trim()) return '可扫码联系负责人'

  return departmentListMessages.contactPending
}
