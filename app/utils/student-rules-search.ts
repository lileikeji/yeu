import { gpaRules, scholarships, studentRuleCatalog } from '~~/data/student-rules'
import type { PublicSearchResult } from './public-search-presentation'
import type { PublicSearchResultType } from '~~/shared/constants/server'

function normalized(value: string): string {
  return value.toLocaleLowerCase('zh-CN').replace(/[\s，。！？、（）()-]/g, '')
}

function matches(query: string, values: string[]): boolean {
  const needle = normalized(query)
  if (!needle) return false
  const text = normalized(values.join(' '))
  if (text.includes(needle)) return true
  const intent = needle.replace(/请问|学生|怎么算|怎么|如何|是什么|有什么|要求|哪些|多少/g, '')
  if (intent.length >= 2 && text.includes(intent)) return true
  const meaningfulPairs = [...new Set(Array.from({ length: Math.max(0, needle.length - 1) }, (_, index) => needle.slice(index, index + 2)))]
  return meaningfulPairs.length > 0 && meaningfulPairs.filter(pair => text.includes(pair)).length >= Math.min(2, meaningfulPairs.length)
}

export function buildStudentRuleSearchResults(
  query: string,
  activeType?: PublicSearchResultType
): PublicSearchResult[] {
  if (activeType && activeType !== 'guide') return []

  const results: PublicSearchResult[] = []
  if (matches(query, [gpaRules.title, ...gpaRules.formulas, ...gpaRules.notes, '绩点 GPA 平均学分绩点 绩点计算器'])) {
    results.push({
      key: 'student-rule-gpa',
      resultType: 'guide',
      title: '绩点公式与 GPA 计算器',
      summary: '按学校公开的2021版成绩管理办法计算百分制、五级制、补考课程的平均学分绩点。',
      typeLabel: '学生规则',
      icon: 'i-lucide-calculator',
      to: '/student-rules#gpa-calculator',
      sourceLabel: '学校官网制度'
    })
  }

  for (const scholarship of scholarships) {
    if (!matches(query, [
      scholarship.name,
      scholarship.amount,
      scholarship.scope,
      scholarship.ranking,
      scholarship.coexistence,
      ...scholarship.requirements,
      '奖学金 评奖 奖项'
    ])) continue
    results.push({
      key: `student-rule-scholarship-${scholarship.slug}`,
      resultType: 'guide',
      title: scholarship.name,
      summary: `${scholarship.amount}；${scholarship.ranking}。`,
      typeLabel: '奖学金',
      icon: 'i-lucide-award',
      to: `/student-rules#scholarship-${scholarship.slug}`,
      sourceLabel: scholarship.version
    })
  }

  for (const rule of studentRuleCatalog) {
    if (!matches(query, [rule.title, rule.summary, rule.category, ...rule.keywords])) continue
    if (rule.slug === 'gpa' && results.some(item => item.key === 'student-rule-gpa')) continue
    results.push({
      key: `student-rule-${rule.slug}`,
      resultType: 'guide',
      title: rule.title,
      summary: rule.summary,
      typeLabel: rule.category,
      icon: 'i-lucide-book-open-check',
      to: `/student-rules#rule-${rule.slug}`,
      sourceLabel: rule.version
    })
  }

  return results.slice(0, 12)
}
