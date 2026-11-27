import type {
  CompetitionDimension,
  CompetitionPopularityCandidate,
  CompetitionPopularityResultRow,
  CompetitionPopularityStandingHint
} from '../types'

export const COMPETITION_MAX_DIMENSION_SCORE = 10
export const COMPETITION_MAX_DIMENSIONS = 10
export const COMPETITION_MAX_JUDGES = 20
export const COMPETITION_MAX_SINGERS = 500

/** 默认五个维度、等权：总分即五项累加（满分 50，每维 10 分）。 */
export const DEFAULT_COMPETITION_DIMENSIONS: CompetitionDimension[] = [
  { key: 'pitch', label: '音准', weight: 20 },
  { key: 'rhythm', label: '节奏', weight: 20 },
  { key: 'emotion', label: '情感', weight: 20 },
  { key: 'timbre', label: '音色', weight: 20 },
  { key: 'stage', label: '舞台表现', weight: 20 }
]

/** 结果邮件模板支持的合并字段；后台展示用，渲染时按 key 精确替换。 */
export const COMPETITION_EMAIL_MERGE_FIELDS: Array<{ key: string, desc: string }> = [
  { key: '{{姓名}}', desc: '选手姓名' },
  { key: '{{班级}}', desc: '班级' },
  { key: '{{学号}}', desc: '学号' },
  { key: '{{歌曲}}', desc: '参赛歌曲' },
  { key: '{{轮次}}', desc: '轮次名称（初赛/复赛/决赛）' },
  { key: '{{平均分}}', desc: '本轮评委平均分' },
  { key: '{{名次}}', desc: '本轮排名' },
  { key: '{{结果}}', desc: '晋级 / 未能晋级 / 弃权' },
  { key: '{{收到按钮}}', desc: '确认收到的按钮' },
  { key: '{{加群按钮}}', desc: '加入 QQ 群的按钮' },
  { key: '{{填歌按钮}}', desc: '填写下一轮参赛曲目的按钮' }
]

export function roundCompetitionScore(value: number): number {
  return Math.round(value * 100) / 100
}

/** 维度自己的满分：显式写的 max 优先，否则用本轮的每维满分。 */
export function dimensionMaxOf(
  dimension: CompetitionDimension,
  dimensionMax: number = COMPETITION_MAX_DIMENSION_SCORE
): number {
  const own = Number(dimension.max)
  return Number.isFinite(own) && own > 0 ? own : dimensionMax
}

/**
 * 只有「每个维度都写了自己的满分」才按评分表模式算（复赛：20+20+20+15+15+10=100）。
 * 只填了其中几个时不能算——否则总分上限与单维折算会各走一套口径，算出来的分对不上。
 */
export function hasPerDimensionMax(dimensions: CompetitionDimension[]): boolean {
  if (dimensions.length === 0) return false
  return dimensions.every((dimension) => {
    const own = Number(dimension.max)
    return Number.isFinite(own) && own > 0
  })
}

export function competitionMaxTotal(
  dimensions: CompetitionDimension[],
  dimensionMax: number = COMPETITION_MAX_DIMENSION_SCORE
): number {
  if (hasPerDimensionMax(dimensions)) {
    return dimensions.reduce((sum, dimension) => sum + dimensionMaxOf(dimension, dimensionMax), 0)
  }
  return dimensions.length * dimensionMax
}

function clampScore(value: number, dimensionMax: number = COMPETITION_MAX_DIMENSION_SCORE): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(dimensionMax, Math.max(0, value))
}

/**
 * 单个评委的总分：各维度按权重求加权平均，再乘以维度数。
* 等权（默认五项）时等价于各维度直接累加，满分 = 每维满分 × 维度数（初赛 10×5=50、复赛 20×5=100）。
 */
export function calculateCompetitionTotal(
  dimensions: CompetitionDimension[],
  scores: Record<string, number>,
  dimensionMax: number = COMPETITION_MAX_DIMENSION_SCORE
): number {
  const usable = dimensions.filter(dimension => Number.isFinite(dimension.weight) && dimension.weight > 0)
  const weightSum = usable.reduce((sum, dimension) => sum + dimension.weight, 0)
  if (usable.length === 0 || weightSum <= 0) return 0

  if (hasPerDimensionMax(dimensions)) {
    // 评分表模式：每维满分不同，总分 = Σ(该维得分 ÷ 该维满分 × 该维分值)。
    const weighted = dimensions.reduce((sum, dimension) => {
      const max = dimensionMaxOf(dimension, dimensionMax)
      const weight = Number.isFinite(dimension.weight) && dimension.weight > 0 ? dimension.weight : 0
      return sum + (clampScore(Number(scores[dimension.key] ?? 0), max) / max) * weight
    }, 0)
    return roundCompetitionScore(weighted)
  }

  const weighted = usable.reduce(
    (sum, dimension) => sum + clampScore(Number(scores[dimension.key] ?? 0), dimensionMax) * dimension.weight,
    0
  )
  return roundCompetitionScore((weighted / weightSum) * usable.length)
}

/** 多音姓氏按姓氏读音换成同音常用字，只为借用拼音排序规则定位（曾 zēng 不是 céng）。 */
export const COMPETITION_SURNAME_HINTS: Record<string, string> = {
  曾: '增',
  单: '山',
  仇: '求',
  解: '谢',
  查: '扎',
  朴: '瓢',
  区: '欧',
  乐: '月',
  覃: '秦',
  缪: '妙',
  盖: '葛',
  尉: '玉',
  种: '崇'
}

/** 排序用的名字：多音姓氏换成同音字，其余原样。 */
export function plainSortName(name: string): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return ''
  const head = trimmed.slice(0, 1)
  const hint = COMPETITION_SURNAME_HINTS[head]
  return hint ? `${hint}${trimmed.slice(1)}` : trimmed
}

export interface PopularityCandidateGroup {
  groupNo: number
  title: string
  candidates: CompetitionPopularityCandidate[]
}

export interface PopularityCandidateStanding {
  singerId: string
  count: number
  /** 当前名次（标准竞赛并列排名 1, 2, 2, 4）；全场 0 票时为 null。 */
  rank: number | null
  /** 与自己同票并列的人数（含自己）。 */
  tiedCount: number
  /** 紧邻更高一档票数对应的名次；第 1 名或全场 0 票时为 null。 */
  prevRank: number | null
  /** 距离第 prevRank 名相差多少票（>= 1）；第 1 名或全场 0 票时为 null。 */
  gapToPrev: number | null
  /** 独占第 1 名且存在下一档选手时，领先第 2 名的票数；否则为 null。 */
  leadOverNext: number | null
}

const CHINESE_GROUP_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const

/** 将组号格式化为中文组名（1–99 转「第一组」..「第九十九组」，其余回退阿拉伯数字）。 */
export function formatChineseGroupTitle(groupNo: number): string {
  const n = Math.max(1, Math.trunc(Number.isFinite(groupNo) ? groupNo : 1))
  if (n <= 9) return `第${CHINESE_GROUP_DIGITS[n]}组`
  if (n === 10) return '第十组'
  if (n < 20) return `第十${CHINESE_GROUP_DIGITS[n % 10]}组`
  if (n <= 99) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return `第${CHINESE_GROUP_DIGITS[tens]}十${ones === 0 ? '' : CHINESE_GROUP_DIGITS[ones]}组`
  }
  return `第 ${n} 组`
}

function comparePopularityCandidateOrder(
  left: CompetitionPopularityCandidate,
  right: CompetitionPopularityCandidate
): number {
  return (left.number - right.number)
    || (left.sortOrder - right.sortOrder)
    || left.singerId.localeCompare(right.singerId)
}

function validCandidatePairNo(candidate: CompetitionPopularityCandidate): number | null {
  const raw = candidate.pairNo
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  return Math.trunc(raw)
}

/**
 * 按出场顺序将人气奖候选人组织为分组框：
 * 1) 优先沿用后台 1v1 抽签的 pairNo（组间按组内最小出场号 / pairNo 升序，组内按出场号 / pairSlot 升序）；
 * 2) 若未抽签（pairNo 全为空）或存在未分配组号的尾部选手，按出场顺序每 2 人切为一组。
 */
export function groupPopularityCandidates(
  candidates: CompetitionPopularityCandidate[]
): PopularityCandidateGroup[] {
  if (candidates.length === 0) return []
  const ordered = [...candidates].sort(comparePopularityCandidateOrder)
  const hasPaired = ordered.some(candidate => validCandidatePairNo(candidate) !== null)
  if (!hasPaired) {
    const groups: PopularityCandidateGroup[] = []
    for (let index = 0; index < ordered.length; index += 2) {
      const groupNo = Math.floor(index / 2) + 1
      groups.push({
        groupNo,
        title: formatChineseGroupTitle(groupNo),
        candidates: ordered.slice(index, index + 2)
      })
    }
    return groups
  }

  const pairedMap = new Map<number, CompetitionPopularityCandidate[]>()
  const unpaired: CompetitionPopularityCandidate[] = []
  for (const candidate of ordered) {
    const pairNo = validCandidatePairNo(candidate)
    if (pairNo === null) {
      unpaired.push(candidate)
      continue
    }
    const list = pairedMap.get(pairNo) ?? []
    list.push(candidate)
    pairedMap.set(pairNo, list)
  }

  const groups: PopularityCandidateGroup[] = [...pairedMap.entries()]
    .map(([pairNo, items]) => {
      const sortedItems = [...items].sort((left, right) =>
        (left.number - right.number)
        || ((left.pairSlot ?? Number.MAX_SAFE_INTEGER) - (right.pairSlot ?? Number.MAX_SAFE_INTEGER))
        || (left.sortOrder - right.sortOrder)
        || left.singerId.localeCompare(right.singerId)
      )
      return {
        groupNo: pairNo,
        minNumber: sortedItems[0]?.number ?? Number.MAX_SAFE_INTEGER,
        title: formatChineseGroupTitle(pairNo),
        candidates: sortedItems
      }
    })
    .sort((left, right) => left.minNumber - right.minNumber || left.groupNo - right.groupNo)
    .map(({ groupNo, title, candidates: groupCandidates }) => ({
      groupNo,
      title,
      candidates: groupCandidates
    }))

  let nextGroupNo = groups.reduce((max, group) => Math.max(max, group.groupNo), 0) + 1
  for (let index = 0; index < unpaired.length; index += 2) {
    const groupNo = nextGroupNo
    nextGroupNo += 1
    groups.push({
      groupNo,
      title: formatChineseGroupTitle(groupNo),
      candidates: unpaired.slice(index, index + 2)
    })
  }
  return groups
}

/**
 * 计算每位候选人的实时票数、标准竞赛并列排名（1, 2, 2, 4）以及与紧邻上一名次的差票。
 * 当 results 为 null（后台关闭公开票数展示）时直接返回 null。
 */
export function computePopularityStandingMap(
  candidates: CompetitionPopularityCandidate[],
  results: CompetitionPopularityResultRow[] | null
): Map<string, PopularityCandidateStanding> | null {
  if (results === null) return null
  const standingMap = new Map<string, PopularityCandidateStanding>()
  if (candidates.length === 0) return standingMap

  const countBySinger = new Map<string, number>()
  for (const row of results) {
    const count = Number.isFinite(row.count) ? Math.max(0, Math.trunc(row.count)) : 0
    countBySinger.set(row.singerId, count)
  }

  const entries: Array<{ singerId: string, count: number }> = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate.singerId)) continue
    seen.add(candidate.singerId)
    entries.push({
      singerId: candidate.singerId,
      count: countBySinger.get(candidate.singerId) ?? 0
    })
  }

  const maxCount = entries.reduce((max, entry) => Math.max(max, entry.count), 0)
  if (maxCount <= 0) {
    for (const entry of entries) {
      standingMap.set(entry.singerId, {
        singerId: entry.singerId,
        count: 0,
        rank: null,
        tiedCount: entries.length,
        prevRank: null,
        gapToPrev: null,
        leadOverNext: null
      })
    }
    return standingMap
  }

  const freq = new Map<number, number>()
  for (const entry of entries) {
    freq.set(entry.count, (freq.get(entry.count) ?? 0) + 1)
  }
  const sortedCounts = [...freq.keys()].sort((left, right) => right - left)

  const tierByCount = new Map<number, {
    count: number
    size: number
    rank: number
    prevRank: number | null
    gapToPrev: number | null
    leadOverNext: number | null
  }>()
  let nextRank = 1
  for (let index = 0; index < sortedCounts.length; index += 1) {
    const count = sortedCounts[index]!
    const size = freq.get(count)!
    const rank = nextRank
    nextRank += size
    const prevTier = index > 0 ? tierByCount.get(sortedCounts[index - 1]!)! : null
    const nextCount = index + 1 < sortedCounts.length ? sortedCounts[index + 1]! : null
    tierByCount.set(count, {
      count,
      size,
      rank,
      prevRank: prevTier ? prevTier.rank : null,
      gapToPrev: prevTier ? prevTier.count - count : null,
      leadOverNext: index === 0 && size === 1 && nextCount !== null ? count - nextCount : null
    })
  }

  for (const entry of entries) {
    const tier = tierByCount.get(entry.count)!
    standingMap.set(entry.singerId, {
      singerId: entry.singerId,
      count: entry.count,
      rank: tier.rank,
      tiedCount: tier.size,
      prevRank: tier.prevRank,
      gapToPrev: tier.gapToPrev,
      leadOverNext: tier.leadOverNext
    })
  }

  return standingMap
}

/** 从完整结果生成脱敏差票数组，剥离具体得票数 count，避免在仅展示差票模式下泄露绝对票数。 */
export function toPopularityStandingHints(
  candidates: CompetitionPopularityCandidate[],
  results: CompetitionPopularityResultRow[]
): CompetitionPopularityStandingHint[] {
  const map = computePopularityStandingMap(candidates, results)
  if (!map) return []
  return Array.from(map.values()).map(entry => ({
    singerId: entry.singerId,
    rank: entry.rank,
    tiedCount: entry.tiedCount,
    prevRank: entry.prevRank,
    gapToPrev: entry.gapToPrev,
    leadOverNext: entry.leadOverNext
  }))
}

/** 统一解析公开页/弹窗/大屏使用的名次与差票映射：优先完整 results，其次脱敏 standings。 */
export function resolvePopularityStandingMap(
  candidates: CompetitionPopularityCandidate[],
  results: CompetitionPopularityResultRow[] | null | undefined,
  standings?: CompetitionPopularityStandingHint[] | null
): Map<string, PopularityCandidateStanding> | null {
  if (results) {
    return computePopularityStandingMap(candidates, results)
  }
  if (!standings) return null
  const standingMap = new Map<string, PopularityCandidateStanding>()
  for (const hint of standings) {
    standingMap.set(hint.singerId, {
      singerId: hint.singerId,
      count: 0,
      rank: hint.rank,
      tiedCount: hint.tiedCount,
      prevRank: hint.prevRank,
      gapToPrev: hint.gapToPrev,
      leadOverNext: hint.leadOverNext
    })
  }
  return standingMap
}
