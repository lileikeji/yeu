import type { CompetitionDimension } from '../types'

export const COMPETITION_MAX_DIMENSION_SCORE = 20
export const COMPETITION_MAX_DIMENSIONS = 10
export const COMPETITION_MAX_JUDGES = 20
export const COMPETITION_MAX_SINGERS = 500

/** 默认五个维度、等权：总分即五项累加（满分 100，每维 20 分）。 */
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
  { key: '{{结果}}', desc: '晋级 / 未能晋级 / 弃权' }
]

export function roundCompetitionScore(value: number): number {
  return Math.round(value * 100) / 100
}

export function competitionMaxTotal(dimensions: CompetitionDimension[]): number {
  return dimensions.length * COMPETITION_MAX_DIMENSION_SCORE
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(COMPETITION_MAX_DIMENSION_SCORE, Math.max(0, value))
}

/**
 * 单个评委的总分：各维度按权重求加权平均，再乘以维度数。
 * 等权（默认五项）时等价于各维度直接累加，满分 10×维度数。
 */
export function calculateCompetitionTotal(
  dimensions: CompetitionDimension[],
  scores: Record<string, number>
): number {
  const usable = dimensions.filter(dimension => Number.isFinite(dimension.weight) && dimension.weight > 0)
  const weightSum = usable.reduce((sum, dimension) => sum + dimension.weight, 0)
  if (usable.length === 0 || weightSum <= 0) return 0

  const weighted = usable.reduce(
    (sum, dimension) => sum + clampScore(Number(scores[dimension.key] ?? 0)) * dimension.weight,
    0
  )
  return roundCompetitionScore((weighted / weightSum) * usable.length)
}
