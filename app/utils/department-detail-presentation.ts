export const departmentBodyPrefixes = {
  useCases: '新生什么时候该看这里：',
  contactPreparation: '联系前先确认：',
  usageSuggestion: '使用建议：',
  verification: '资料核对：'
} as const

export const departmentSectionLabels = {
  firstLook: '新生先看这几件事',
  contactPrep: '咨询前准备',
  usageSuggestion: '使用建议',
  publicContact: '公开联系方式',
  emptyContact: '暂未找到可公开确认的电话、邮箱或服务时间，请优先使用上方部门官网。'
} as const

export interface DepartmentSourceLike {
  id?: string
  key?: string
  title: string
  url: string | null
}

export interface DepartmentDetailSourceView {
  key: string
  title: string
  url: string | null
}

export interface DepartmentSeedSourceInput {
  organizationsTitle: string
  organizationsUrl: string
  departmentName?: string | null
  website?: string | null
}

export function extractPrefixedParagraph(body: string, prefix: string): string {
  return body
    .split('\n')
    .find(line => line.startsWith(prefix))
    ?.slice(prefix.length)
    .trim() ?? ''
}

export function extractDepartmentUseCases(body: string): string[] {
  const block = body.match(/新生什么时候该看这里：\n([\s\S]*?)(?:\n联系前先确认：|\n使用建议：|$)/)?.[1] ?? ''
  return block
    .split('\n')
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(Boolean)
}

export function resolveDepartmentContactPreparation(body: string): string {
  return extractPrefixedParagraph(body, departmentBodyPrefixes.contactPreparation)
}

export function resolveDepartmentUsageSuggestion(body: string): string {
  return extractPrefixedParagraph(body, departmentBodyPrefixes.usageSuggestion)
}

export function resolveDepartmentVerificationSummary(body: string): string {
  return extractPrefixedParagraph(body, departmentBodyPrefixes.verification)
}

export function buildDepartmentWebsiteSourceTitle(departmentName: string): string {
  return departmentName + '官网入口'
}

export function buildDepartmentApiSources(
  sources: ReadonlyArray<DepartmentSourceLike> | null | undefined
): DepartmentDetailSourceView[] {
  return (sources ?? []).map(source => ({
    key: source.id ?? source.key ?? source.url ?? source.title,
    title: source.title,
    url: source.url
  }))
}

export function buildDepartmentSeedSources(
  input: DepartmentSeedSourceInput
): DepartmentDetailSourceView[] {
  const sources: DepartmentDetailSourceView[] = [
    {
      key: 'organizations',
      title: input.organizationsTitle,
      url: input.organizationsUrl
    }
  ]
  if (input.website) {
    sources.push({
      key: 'department-website',
      title: buildDepartmentWebsiteSourceTitle(input.departmentName ?? '部门'),
      url: input.website
    })
  }
  return sources
}

export function buildDepartmentDetailSources(
  apiSources: ReadonlyArray<DepartmentSourceLike> | null | undefined,
  seed: DepartmentSeedSourceInput
): DepartmentDetailSourceView[] {
  const fromApi = buildDepartmentApiSources(apiSources)
  if (fromApi.length) return fromApi
  return buildDepartmentSeedSources(seed)
}

export function resolveDepartmentVerifiedDate(
  lastVerifiedAt: string | null | undefined,
  updatedAt: string | null | undefined,
  fallbackAccessedAt: string
): string {
  return (lastVerifiedAt ?? updatedAt ?? fallbackAccessedAt).slice(0, 10)
}
