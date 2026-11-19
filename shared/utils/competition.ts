import type { CompetitionDimension } from '../types'

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

export function competitionMaxTotal(
  dimensions: CompetitionDimension[],
  dimensionMax: number = COMPETITION_MAX_DIMENSION_SCORE
): number {
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
