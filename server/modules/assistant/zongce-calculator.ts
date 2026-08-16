/**
 * 综测总分估算（供 AI 直接算分，与站内计算器同一套数据/口径）。
 * 规则依据：官网 2025 版《仰恩大学学生综合测评实施办法（修订）》（仰恩大学办公室 2024-12-23 印发）。
 * - 智育基础分 =（本人本学年度平均成绩 ÷ 本年级本专业最高平均成绩）× 60，满分 60
 * - 德育 25 = 德育基础分（辅导员评分，满分6，5.4-6 分人数≤20%）+ 班内互评（满分6）+ 德育奖励（≤13）− 扣分
 * - 智育 70 = 智育基础分 + 智育奖励（≤10）
 * - 体育 5 = 体育基础分（体育课+体测均≥60 得 3，任一项不及格得 1）+ 体育奖励（≤2）
 * 说明：自然语言解析做不到 100% 精确，凡是无法确认的字段一律按"满分估算"并明确标注假设，
 * 最终以学院当年审核与申报材料为准。
 */

import {
  zongceBonusCategories,
  zongceStructure,
  type ZongceItem
} from '../../../data/comprehensive-evaluation'

export interface ZongceCalcLine {
  label: string
  detail: string
  points: number
}

export interface ZongceCalcResult {
  /** 是否成功解析出至少一个关键输入（成绩或奖项） */
  parsed: boolean
  /** 分板块明细 */
  lines: ZongceCalcLine[]
  /** 假设/待确认说明 */
  notes: string[]
  /** 总分（四舍五入保留两位） */
  total: number
  /** 供 AI 展示的最终文本 */
  answer: string
}

interface ScoreContext {
  value: number
  ctx: string
}

/** 提取数字并带上前后文。 */
function numbersWithContext(query: string): ScoreContext[] {
  const out: ScoreContext[] = []
  const re = /\d{1,3}(?:\.\d+)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(query)) !== null) {
    const idx = m.index
    // 只看数字前文：避免"我平均成绩85，专业最高平均成绩90"里 85 被后面的"专业最高"污染
    out.push({
      value: Number(m[0]),
      ctx: query.slice(Math.max(0, idx - 8), idx)
    })
  }
  return out
}

/** 从数字上下文里分出"本人成绩"与"本专业最高成绩"。 */
function extractScores(query: string): { mine: number | null; highest: number | null } {
  const nums = numbersWithContext(query)
  if (nums.length === 0) return { mine: null, highest: null }
  let mine: number | null = null
  let highest: number | null = null
  const others: ScoreContext[] = []
  for (const n of nums) {
    if (/最高|年级最高|专业最高|最高平均|本专业最高/.test(n.ctx)) {
      if (highest === null) highest = n.value
    } else if (/我|本人|我的|期末总分|期末成绩|我的成绩|本人成绩|学年成绩|期末考/.test(n.ctx)) {
      if (mine === null) mine = n.value
    } else if (/平均分|平均成绩/.test(n.ctx)) {
      // 裸"平均分 X"在提问里通常指本专业最高平均成绩（公式分母），记为最高分候选
      if (highest === null) highest = n.value
      else others.push(n)
    } else {
      others.push(n)
    }
  }
  if (mine === null && others.length > 0) mine = others[0].value
  if (highest === null && others.length > 1) highest = others[1].value
  return { mine, highest }
}

/** 提取查询里的奖项等级标记。 */
function gradeTokens(query: string): string[] {
  const found: string[] = []
  const rules: Array<[RegExp, string]> = [
    [/一等奖|第一名|第1名|冠军|金奖/g, '一等'],
    [/二等奖|第二名|第2名|亚军|银奖/g, '二等'],
    [/三等奖|第三名|第3名|季军|铜奖/g, '三等'],
    [/优秀奖|优胜奖/g, '优秀奖']
  ]
  for (const [re, grade] of rules) {
    if (re.test(query)) found.push(grade)
  }
  return found
}

/** 提取查询里的级别（国家级/省部/市/校/院、A/B/C 类）。 */
function tierTokens(query: string): string[] {
  const found: string[] = []
  const rules: Array<[RegExp, string]> = [
    [/国家级|国家[级]?/g, '国家级'],
    [/省部级|省部|省级/g, '省部级'],
    [/市级/g, '市级'],
    [/校级|校赛|学校/g, '校级'],
    [/院级|学院/g, '院级'],
    [/A\s*类/g, 'A类'],
    [/B\s*类/g, 'B类'],
    [/C\s*类/g, 'C类']
  ]
  for (const [re, tier] of rules) {
    if (re.test(query)) found.push(tier)
  }
  return found
}

/** 判断一条提示是否为"扣分"条目。 */
function isDeductionItem(hint: string): boolean {
  return hint.startsWith('扣分：')
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** 尝试为某条目解析奖项分数；返回 {points, note}。 */
function resolveItemPoints(
  item: ZongceItem,
  query: string,
  grades: string[],
  tiers: string[]
): { points: number; note?: string } {
  if (item.points !== undefined) {
    // 固定分值条目：数量类（志愿/献血/讲座/演出）需要数量，先不自动加分
    if (item.cap !== undefined) {
      return { points: 0, note: `${item.name}按数量计（${item.points}分/次，上限${item.cap}分），需提供时长/次数` }
    }
    return { points: item.points, note: undefined }
  }
  const levels = item.levels ?? []
  if (levels.length === 0) return { points: 0, note: `${item.name}暂无自动计分规则` }

  const tier = tiers.find(t => levels.some(l => l.level.includes(t)))
  const picks: Array<{ level: string; points: number }> = []
  const seenGrades = new Set<string>()
  for (const grade of grades) {
    if (seenGrades.has(grade)) continue
    seenGrades.add(grade)
    // 先找同时匹配级别+等级的档位；没有再退回任意档位的该等级（取分值最低的保守档）
    let matched = levels.filter(l => l.level.includes(grade) && (!tier || l.level.includes(tier)))
    if (matched.length === 0) matched = levels.filter(l => l.level.includes(grade))
    if (matched.length === 0) continue
    matched.sort((a, b) => a.points - b.points)
    picks.push({ level: matched[0].level, points: matched[0].points })
  }
  if (picks.length === 0) {
    // 没解析出等级：给不出精确档位时，按该大类最低档计入并明确标注范围，避免漏算也不冒充准确
    const pool = tier ? levels.filter(l => l.level.includes(tier)) : levels
    if (pool.length === 0) return { points: 0, note: `${item.name}未注明等级，暂不计分` }
    pool.sort((a, b) => a.points - b.points)
    const min = pool[0]
    const max = pool[pool.length - 1]
    return {
      points: min.points,
      note: `${item.name}未注明等级/类型，暂按最低档"${min.level}" ${min.points} 分计入（该大类 ${min.points}~${max.points} 分），请补充实际档位`
    }
  }
  if (item.multi) {
    const sum = picks.reduce((s, p) => s + p.points, 0)
    const capped = item.cap !== undefined ? Math.min(item.cap, sum) : sum
    const detail = picks.map(p => `${p.level} ${p.points}分`).join(' + ')
    return {
      points: capped,
      note: picks.length > 1 ? `${item.name}多项目累计：${detail}` : `${item.name}：${detail}`
    }
  }
  // 单选条目取最高档
  picks.sort((a, b) => b.points - a.points)
  return { points: picks[0].points, note: `${item.name}：${picks[0].level} ${picks[0].points}分` }
}

/** 用关键词命中的条目（复用 matchZongceItem 的匹配逻辑，但返回条目对象）。 */
function matchZongceItemsForQuery(query: string): Array<{ item: ZongceItem; hint: string }> {
  const norm = query.replace(/[。，、？?.！!：:s]/g, '')
  const out: Array<{ item: ZongceItem; hint: string }> = []
  const seen = new Set<string>()
  for (const category of zongceBonusCategories) {
    for (const item of category.items) {
      if (seen.has(item.id)) continue
      const hits = item.keywords.filter(k => norm.includes(k)).length
      if (hits === 0) continue
      seen.add(item.id)
      out.push({ item, hint: item.name })
    }
  }
  return out
}

/** 条目归属板块。 */
function sectionOfItem(item: ZongceItem): 'moral' | 'intellectual' | 'sports' {
  const id = item.id
  if (id === 'sports-competition') return 'sports'
  if (['research-project', 'academic-competition', 'paper', 'patent', 'cert-vocational', 'cert-proficiency'].includes(id)) {
    return 'intellectual'
  }
  return 'moral'
}

/**
 * 尝试把一条"综测算分"提问解析成估算结果；不是可计算提问时返回 null。
 */
export function tryComputeZongce(query: string): ZongceCalcResult | null {
  if (!/综测|综合测评/.test(query)) return null
  // 奖学金/助学金是评选资格问题，不是综测加分项，交给奖学金回答
  if (/奖学金|助学金/.test(query)) return null
  const hasNumbers = /\d/.test(query)
  const hasAwardKeyword = /奖|专利|论文|证书|资格|志愿|献血|竞赛|比赛|荣誉称号|学生干部/.test(query)
  if (!hasNumbers && !hasAwardKeyword) return null

  const notes: string[] = []
  const lines: ZongceCalcLine[] = []
  const grades = gradeTokens(query)
  const tiers = tierTokens(query)

  // 1) 智育基础分（唯一按成绩百分比折算的部分）
  const { mine, highest } = extractScores(query)
  let intellectualBase: number
  if (mine !== null && highest !== null && highest > 0) {
    const ratio = Math.max(0, Math.min(1, mine / highest))
    intellectualBase = ratio * zongceStructure.intellectual.base
    lines.push({
      label: '智育基础分',
      detail: `${mine} ÷ ${highest} × 60 = ${round2(intellectualBase)}`,
      points: round2(intellectualBase)
    })
  } else if (mine !== null) {
    intellectualBase = zongceStructure.intellectual.base
    lines.push({ label: '智育基础分', detail: '未提供本专业最高成绩，按满分 60 估算', points: 60 })
    notes.push('未提供"本专业最高平均成绩"，智育基础分按满分 60 估算；实际 = 本人平均成绩 ÷ 专业最高平均成绩 × 60。')
  } else {
    intellectualBase = zongceStructure.intellectual.base
    lines.push({ label: '智育基础分', detail: '未提供成绩，按满分 60 估算', points: 60 })
    notes.push('未提供本人平均成绩与本专业最高平均成绩，智育基础分按满分 60 估算。')
  }

  // 2) 奖项
  const intellectualReward = { points: 0 }
  const moralReward = { points: 0 }
  const sportsReward = { points: 0 }
  const awardNotes: string[] = []

  const matches = matchZongceItemsForQuery(query)
  for (const { item } of matches) {
    const r = resolveItemPoints(item, query, grades, tiers)
    const section = sectionOfItem(item)
    if (section === 'intellectual') {
      intellectualReward.points += r.points
      if (r.note) awardNotes.push(r.note)
    } else if (section === 'moral') {
      moralReward.points += r.points
      if (r.note) awardNotes.push(r.note)
    } else if (section === 'sports') {
      sportsReward.points += r.points
      if (r.note) awardNotes.push(r.note)
    }
  }
  const intellectualRewardCapped = Math.min(zongceStructure.intellectual.rewardCap, intellectualReward.points)
  const moralRewardCapped = Math.min(zongceStructure.moral.rewardCap, moralReward.points)
  const sportsRewardCapped = Math.min(zongceStructure.sports.rewardCap, sportsReward.points)

  // 3) 德育基础分 + 班内互评（默认按满分估算）
  const moralBase = zongceStructure.moral.base + zongceStructure.moral.peerReview
  if (moralReward.points === 0) {
    notes.push('未识别到德育奖励项；德育基础分+班内互评按满分 12 估算（辅导员评分与互评以实际为准）。')
  }

  // 4) 体育
  let sportsBase = zongceStructure.sports.base
  if (/体育/.test(query)) {
    if (/不及格|挂科|没过|挂了|未通过/.test(query)) {
      sportsBase = 1
      notes.push('体育课或体质健康测试有不及格，体育基础分按 1 分计。')
    } else if (/满分|及格|合格|通过|均过|都过/.test(query)) {
      sportsBase = zongceStructure.sports.base
    } else {
      notes.push('提到体育但未说明体测情况，按体育课+体测均及格（基础 3 分）估算。')
    }
  } else {
    notes.push('未提及体育，按体育课与体质健康测试均及格（基础 3 分）估算。')
  }

  const moralTotal = moralBase + moralRewardCapped
  const intellectualTotal = intellectualBase + intellectualRewardCapped
  const sportsTotal = sportsBase + sportsRewardCapped
  const total = round2(moralTotal + intellectualTotal + sportsTotal)

  lines.push(
    {
      label: '智育奖励',
      detail: intellectualRewardCapped > 0
        ? (intellectualReward.points > intellectualRewardCapped
          ? `原计 ${intellectualReward.points}，封顶 10 → ${intellectualRewardCapped} 分`
          : `${intellectualRewardCapped} 分`)
        : '未识别到项目（0 分）',
      points: intellectualRewardCapped
    },
    { label: '德育', detail: `基础分+互评 ${moralBase} + 奖励 ${moralRewardCapped}`, points: round2(moralTotal) },
    { label: '体育', detail: `基础 ${sportsBase} + 奖励 ${sportsRewardCapped}`, points: round2(sportsTotal) }
  )
  for (const n of awardNotes.slice(0, 6)) notes.push(n)

  const answer = [
    '按 2025 版《仰恩大学学生综合测评实施办法（修订）》估算你的综测总分：',
    ...lines.map(l => `• ${l.label}：${l.detail}`),
    `合计 ≈ ${total.toFixed(2)} / 100 分`,
    '',
    '说明与待确认：',
    ...notes.map(n => `• ${n}`),
    '同一项目/同一作品/同类任职按最高项计、不重复累计；团体获奖分数减半（最低 0.1 分）；最终以学院当年审核与申报材料为准。'
  ].join('\n')

  return { parsed: true, lines, notes, total, answer }
}
