export const departmentListMessages = {
  serviceUnavailable: '部门资料暂时不可用，请稍后重试。',
  emptyMatch: '没有匹配的部门'
} as const

export interface DepartmentListFilterableItem {
  name: string
  summary: string
  phone?: string | null
  email?: string | null
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
  return department.phone || department.email || '查看官方入口'
}
