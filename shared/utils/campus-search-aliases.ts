import { cleanSearchTerm } from './like-search'

interface CampusSearchAliasGroup {
  canonical: string
  aliases: readonly string[]
  kind: 'place' | 'service'
}

const CAMPUS_SEARCH_ALIAS_GROUPS: readonly CampusSearchAliasGroup[] = [
  {
    canonical: '泽钏教学楼',
    aliases: ['泽钏教学楼', '泽钏楼', '泽川教学楼', '泽川楼', '泽川'],
    kind: 'place'
  },
  {
    canonical: '迎新系统',
    aliases: ['迎新系统', '所在班级怎么查询', '查询所在班级', '查询班级', '班级查询', '分班查询', '编班查询'],
    kind: 'service'
  }
]

function compactSearchText(value: string): string {
  return cleanSearchTerm(value)
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s，。！？、（）()：:？?]/g, '')
}

export function expandCampusSearchTerms(value: string): string[] {
  const original = cleanSearchTerm(value)
  if (!original) return []
  const compact = compactSearchText(original)
  const terms = new Set([original])

  for (const group of CAMPUS_SEARCH_ALIAS_GROUPS) {
    if (!group.aliases.some(alias => compact.includes(compactSearchText(alias)))) continue
    terms.add(group.canonical)
    group.aliases.forEach(alias => terms.add(alias))
  }

  return [...terms]
}

export function canonicalCampusPlaceForQuery(value: string): string | null {
  const compact = compactSearchText(value)
  if (!compact) return null
  const group = CAMPUS_SEARCH_ALIAS_GROUPS.find(item => (
    item.kind === 'place'
    && item.aliases.some(alias => compact.includes(compactSearchText(alias)))
  ))
  return group?.canonical ?? null
}
