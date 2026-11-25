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
  },
  {
    canonical: '吉龙教学楼',
    aliases: ['吉龙教学楼', '吉龙楼', '吉隆教学楼', '吉隆楼', '吉林楼', '吉林'],
    kind: 'place'
  },
  {
    canonical: '仰恩教学楼',
    aliases: ['仰恩教学楼', '仰恩楼'],
    kind: 'place'
  },
  {
    canonical: '多功能报告厅',
    aliases: ['多功能报告厅', '旧区报告厅', '报告厅'],
    kind: 'place'
  },
  {
    canonical: '仰恩基金会体育场',
    aliases: ['仰恩基金会体育场', '基金会体育场', '基金操场', '基金会操场'],
    kind: 'place'
  },
  {
    canonical: '祥贤楼',
    // 不要加两字「贤楼」：canonicalCampusPlaceForQuery 用的是 includes，
    // 「普贤楼」里含「贤楼」，会把普贤楼错答成祥贤楼（2026-11-25 扫描实测）。
    aliases: ['祥贤楼', '祥贤', '闲楼'],
    kind: 'place'
  },
  {
    // 「宏大船楼」是线上真实错写（2026-11-25 回放），多打一个字就落空。
    canonical: '宏船楼',
    aliases: ['宏船楼', '宏船', '宏大船楼'],
    kind: 'place'
  },
  {
    // 「新区和昌楼」必须排在「和昌教学楼」之前：两栋楼在新旧区各有一栋，
    // includes 匹配下宽组会先把「新区和昌楼」吃掉，答成旧区那栋。
    canonical: '新区和昌教学楼',
    aliases: ['新区和昌教学楼', '新区和昌楼', '新区合昌教学楼', '新区合昌楼', '第三教学区和昌'],
    kind: 'place'
  },
  {
    canonical: '和昌教学楼',
    aliases: ['和昌教学楼', '和昌楼', '合昌教学楼', '合昌楼'],
    kind: 'place'
  },
  {
    // 校内没有单独的「普贤楼」点位，地图上标的是创业园（校内人 2026-11-25 确认）。
    canonical: '创业园',
    aliases: ['创业园', '普贤楼', '普贤'],
    kind: 'place'
  },
  {
    // 「新区广场」就是碑林广场；「无字碑」是高德上的独立地标，不并进来。
    canonical: '碑林广场',
    aliases: ['碑林广场', '新区广场'],
    kind: 'place'
  },
  {
    canonical: '旧区公交车上车点',
    aliases: ['旧区公交车上车点', '公交车上车点', '公交上车点', '叮叮车上车点', '叮叮车在哪上车'],
    kind: 'place'
  }
]

// Term-level synonyms that recover transpositions and regional variants the
// character n-gram similarity cannot (e.g. 「住宿」↔「宿舍」share only one
// unigram after the order swap). Each pair adds the canonical form to the
// retrieval terms when the source appears verbatim, so a canonical term is
// never polluted by an unrelated expansion.
const CAMPUS_TERM_SYNONYMS: readonly (readonly [string, string])[] = [
  ['住宿', '宿舍'],
  ['寝室', '宿舍'],
  ['饭堂', '食堂'],
  ['饭卡', '校园卡'],
  ['一卡通', '校园卡']
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

  for (const [source, target] of CAMPUS_TERM_SYNONYMS) {
    if (compact.includes(compactSearchText(source))) terms.add(target)
  }

  return [...terms]
}

export function canonicalCampusPlaceForQuery(value: string): string | null {
  return campusPlaceAliasForQuery(value)?.canonical ?? null
}

/**
 * 返回命中的别名原文，答案里用它说明「学生说的「普贤楼」在地图上叫「创业园」」。
 * 同一组内取最长别名，避免「普贤」抢在「普贤楼」前面。
 */
export function campusPlaceAliasForQuery(value: string): { canonical: string, alias: string } | null {
  const compact = compactSearchText(value)
  if (!compact) return null
  for (const group of CAMPUS_SEARCH_ALIAS_GROUPS) {
    if (group.kind !== 'place') continue
    const alias = [...group.aliases]
      .sort((left, right) => right.length - left.length)
      .find(item => compact.includes(compactSearchText(item)))
    if (alias) return { canonical: group.canonical, alias }
  }
  return null
}
