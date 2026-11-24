import type {
  CompetitionAdminPayload,
  CompetitionDimension,
  CompetitionFinalSongsPair,
  CompetitionQueueState,
  CompetitionRoundEntry,
  CompetitionRoundKey,
  CompetitionRoundStatus,
  CompetitionRoundView,
  CompetitionScore,
  CompetitionSinger
} from '../types'
import {
  competitionMaxTotal,
  dimensionMaxOf,
  plainSortName,
  roundCompetitionScore
} from './competition'

export type PowerTier = 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C' | '—'
export type PowerCompleteness = 'both' | 'semi_only' | 'prelim_only' | 'none'

export interface RoundMetricSnapshot {
  roundKey: CompetitionRoundKey
  roundTitle: string
  joined: boolean
  average: number | null
  maxTotal: number
  percentScore: number | null
  zScore: number | null
  rank: number | null
  totalScored: number
  percentile: number | null
  scoreCount: number
  judgeStdDev: number | null
  consensusScore: number | null
  song: string
  sortOrder: number
  checkedIn: boolean
  hasAccompaniment: boolean
  qualified: boolean
  forfeited: boolean
  queueState: CompetitionQueueState | null
  judgeScores: CompetitionScore[]
}

export interface SkillAxisStat {
  key: string
  label: string
  rate: number
  fieldAverage: number
  prelimRate: number | null
  semiRate: number | null
}

export interface SingerPowerRating {
  singerId: string
  hasRating: boolean
  completeness: PowerCompleteness
  powerScore: number | null
  powerRank: number | null
  tier: PowerTier
  tierLabel: string
  prelimWeight: number
  semiWeight: number
  baseScore: number | null
  dominanceScore: number | null
  stabilityScore: number | null
  momentumScore: number | null
  deltaPercent: number | null
  deltaZ: number | null
  prelim: RoundMetricSnapshot | null
  semi: RoundMetricSnapshot | null
  skillProfile: SkillAxisStat[]
  topStrength: SkillAxisStat | null
  weakSpot: SkillAxisStat | null
  summaryNote: string
}

export interface SingerAnalyticsProfile {
  singer: CompetitionSinger
  power: SingerPowerRating
  rounds: Record<CompetitionRoundKey, RoundMetricSnapshot | null>
  currentStageLabel: string
  inFinal: boolean
  inFinal2: boolean
  finalPairNo: number | null
  finalPairSlot: number | null
  finalOpponentName: string | null
  finalDuelWon: boolean | null
  finalSongs: CompetitionFinalSongsPair | null
  popularityVotes: number
  popularityPercent: number
  popularityRank: number | null
}

export interface DuelPrediction {
  pairNo: number
  leftSingerId: string | null
  rightSingerId: string | null
  leftPower: number | null
  rightPower: number | null
  leftWinProb: number | null
  rightWinProb: number | null
  powerDiff: number | null
  tag: string
  upset: boolean
  note: string
  /**
   * 这次预测的置信度（0–100）。两人前两轮的评委分歧越小，胜率越可信；
   * 分歧大到一定程度，两个实力分本身就不稳，概率要往 50% 收。
   */
  confidence: number
  /** 波动档位，直接给面板显示，不用前端再判断阈值。 */
  volatility: '稳定' | '波动' | '未知'
}

export interface ScoreBucketStat {
  label: string
  min: number
  max: number
  count: number
  percent: number
}

export interface JudgeScaleStat {
  id: string
  displayName: string
  isActive: boolean
  scoredCount: number
  averageScore: number | null
  averagePercent: number | null
  minScore: number | null
  maxScore: number | null
  biasFromRound: number | null
}

export interface RoundDistributionStat {
  roundKey: CompetitionRoundKey
  roundTitle: string
  status: CompetitionRoundStatus
  maxTotal: number
  entryCount: number
  scoredCount: number
  checkedInCount: number
  accompanimentCount: number
  qualifiedCount: number
  forfeitedCount: number
  averageScore: number | null
  averagePercent: number | null
  highestScore: number | null
  lowestScore: number | null
  stdDevPercent: number | null
  buckets: ScoreBucketStat[]
  judges: JudgeScaleStat[]
}

export interface FunnelStageStat {
  key: string
  label: string
  count: number
  rateFromStart: number
  rateFromPrev: number
}

export interface CompetitionAnalyticsReport {
  generatedAt: number
  overview: {
    singerTotal: number
    preRegTotal: number
    preRegConverted: number
    ratedCount: number
    sTierCount: number
    aPlusOrAboveCount: number
    finalCount: number
    final2Count: number
    finalSongsCount: number
    duelReadyCount: number
    duelTotalCount: number
    totalVotes: number
    topPopularityName: string | null
    topPopularityVotes: number
  }
  funnel: FunnelStageStat[]
  roundStats: Record<CompetitionRoundKey, RoundDistributionStat>
  profiles: SingerAnalyticsProfile[]
  profilesById: Record<string, SingerAnalyticsProfile>
  duelPredictions: Record<number, DuelPrediction>
  fieldSkillAverages: Array<{ key: string, label: string, fieldAverage: number }>
}

const PRELIM_WEIGHT_BOTH = 0.35
const SEMI_WEIGHT_BOTH = 0.65
/** 强项/短板要和全场平均差出这么多分（百分点）才认定，差距过小说明只是评委尺度波动。 */
const SKILL_GAP_THRESHOLD = 2

const SCORE_BUCKET_RANGES: Array<{ label: string, min: number, max: number }> = [
  { label: '90–100%', min: 90, max: 100.01 },
  { label: '85–90%', min: 85, max: 90 },
  { label: '80–85%', min: 80, max: 85 },
  { label: '70–80%', min: 70, max: 80 },
  { label: '60–70%', min: 60, max: 70 },
  { label: '60% 以下', min: -0.01, max: 60 }
]

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function meanOf(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, item) => sum + item, 0) / values.length
}

function populationStdDev(values: number[]): number {
  if (values.length <= 1) return 0
  const avg = meanOf(values)
  const variance = values.reduce((sum, item) => sum + (item - avg) ** 2, 0) / values.length
  return Math.sqrt(Math.max(0, variance))
}

function trimmedAverage(values: number[], trimExtremes: boolean): number | null {
  if (values.length === 0) return null
  const usable = trimExtremes && values.length >= 3
    ? [...values].sort((left, right) => left - right).slice(1, -1)
    : values
  return roundCompetitionScore(meanOf(usable))
}

function effectiveMaxTotal(round: CompetitionRoundView, eventDimensions: CompetitionDimension[]): number {
  if (Number.isFinite(round.maxTotal) && round.maxTotal > 0) return round.maxTotal
  const dims = round.dimensions.length > 0 ? round.dimensions : eventDimensions
  const computed = competitionMaxTotal(dims, round.dimensionMax)
  return computed > 0 ? computed : 50
}

function normalizeSkillKey(label: string): string {
  const normalized = label.trim().replace(/\s+/g, '')
  return normalized || '未命名维度'
}

export function powerTierOf(score: number | null): { tier: PowerTier, label: string } {
  if (score === null || !Number.isFinite(score)) return { tier: '—', label: '待评分' }
  if (score >= 90) return { tier: 'S', label: '夺冠热门' }
  if (score >= 85) return { tier: 'A+', label: '强力争冠' }
  if (score >= 80) return { tier: 'A', label: '稳健高分' }
  if (score >= 75) return { tier: 'B+', label: '均衡实力' }
  if (score >= 65) return { tier: 'B', label: '潜力冲击' }
  return { tier: 'C', label: '待突破' }
}

function roundSongLabel(entry: CompetitionRoundEntry, roundKey: CompetitionRoundKey): string {
  if (roundKey === 'final' && entry.finalSongs?.firstSong?.trim()) {
    return entry.finalSongs.firstSong.trim()
  }
  if (roundKey === 'final2' && entry.finalSongs?.secondSong?.trim()) {
    return entry.finalSongs.secondSong.trim()
  }
  const entrySong = (entry.song ?? '').trim()
  if (entrySong) return entrySong
  return (entry.singer.song ?? '').trim()
}

interface BuiltRoundContext {
  round: CompetitionRoundView
  maxTotal: number
  snapshotsBySinger: Map<string, RoundMetricSnapshot>
  distribution: RoundDistributionStat
}

function buildRoundContext(
  round: CompetitionRoundView,
  eventDimensions: CompetitionDimension[],
  eventTrimExtremes: boolean
): BuiltRoundContext {
  const maxTotal = effectiveMaxTotal(round, eventDimensions)
  const trimExtremes = typeof round.trimExtremes === 'boolean' ? round.trimExtremes : eventTrimExtremes
  const scoresBySinger = new Map<string, CompetitionScore[]>()
  const scoresByJudge = new Map<string, CompetitionScore[]>()

  for (const score of round.scores) {
    const singerList = scoresBySinger.get(score.singerId) ?? []
    singerList.push(score)
    scoresBySinger.set(score.singerId, singerList)

    const judgeList = scoresByJudge.get(score.judgeId) ?? []
    judgeList.push(score)
    scoresByJudge.set(score.judgeId, judgeList)
  }

  const rawEntries = round.entries.map((entry) => {
    const judgeScores = scoresBySinger.get(entry.singer.id) ?? []
    const totals = judgeScores.map(score => roundCompetitionScore(Number(score.total ?? 0)))
    const average = entry.average !== null && Number.isFinite(entry.average)
      ? roundCompetitionScore(entry.average)
      : trimmedAverage(totals, trimExtremes)
    const percentScore = average !== null
      ? roundCompetitionScore(clamp((average / maxTotal) * 100, 0, 100))
      : null
    const percentTotals = totals.map(total => clamp((total / maxTotal) * 100, 0, 100))
    const judgeStdDev = percentTotals.length >= 2
      ? roundCompetitionScore(populationStdDev(percentTotals))
      : (percentTotals.length === 1 ? 0 : null)
    const consensusScore = percentTotals.length >= 2
      ? roundCompetitionScore(clamp(100 - 6 * (judgeStdDev ?? 0), 40, 100))
      : (percentTotals.length === 1 ? 85 : null)
    return {
      entry,
      judgeScores,
      average,
      percentScore,
      judgeStdDev,
      consensusScore
    }
  })

  const scoredItems = rawEntries
    .filter(item => item.percentScore !== null && item.average !== null)
    .sort((left, right) =>
      ((right.percentScore ?? 0) - (left.percentScore ?? 0))
      || (left.entry.sortOrder - right.entry.sortOrder)
      || left.entry.singer.name.localeCompare(right.entry.singer.name, 'zh-Hans-CN'))

  const computedRankByEntryId = new Map<string, number>()
  let lastPercent: number | null = null
  let lastRank = 0
  scoredItems.forEach((item, index) => {
    if (lastPercent === null || item.percentScore !== lastPercent) {
      lastRank = index + 1
      lastPercent = item.percentScore
    }
    computedRankByEntryId.set(item.entry.id, lastRank)
  })

  const scoredPercents = scoredItems.map(item => item.percentScore!)
  const scoredRaws = scoredItems.map(item => item.average!)
  const roundMeanPercent = meanOf(scoredPercents)
  const roundStdPercent = populationStdDev(scoredPercents)
  const totalScored = scoredItems.length

  const snapshotsBySinger = new Map<string, RoundMetricSnapshot>()
  for (const item of rawEntries) {
    const { entry } = item
    const rank = item.percentScore !== null
      ? (entry.rank ?? computedRankByEntryId.get(entry.id) ?? null)
      : null
    const zScore = item.percentScore !== null
      ? (roundStdPercent > 1e-4
          ? roundCompetitionScore(clamp((item.percentScore - roundMeanPercent) / roundStdPercent, -2.5, 2.5))
          : 0)
      : null
    const percentile = item.percentScore !== null && rank !== null
      ? (totalScored <= 1
          ? 100
          : roundCompetitionScore(clamp(((totalScored - rank) / (totalScored - 1)) * 100, 0, 100)))
      : null

    snapshotsBySinger.set(entry.singer.id, {
      roundKey: round.key,
      roundTitle: round.title,
      joined: true,
      average: item.average,
      maxTotal,
      percentScore: item.percentScore,
      zScore,
      rank,
      totalScored,
      percentile,
      scoreCount: entry.scoreCount > 0 ? entry.scoreCount : item.judgeScores.length,
      judgeStdDev: item.judgeStdDev,
      consensusScore: item.consensusScore,
      song: roundSongLabel(entry, round.key),
      sortOrder: entry.sortOrder,
      checkedIn: entry.checkedInAt !== null,
      hasAccompaniment: Boolean(entry.accompaniment),
      qualified: entry.qualified,
      forfeited: entry.forfeited,
      queueState: entry.queueState ?? null,
      judgeScores: item.judgeScores
    })
  }

  const buckets: ScoreBucketStat[] = SCORE_BUCKET_RANGES.map((range) => {
    const count = scoredPercents.filter(value => value >= range.min && value < range.max).length
    return {
      label: range.label,
      min: range.min,
      max: range.max,
      count,
      percent: totalScored > 0 ? roundCompetitionScore((count / totalScored) * 100) : 0
    }
  })

  const roundMeanRaw = totalScored > 0 ? roundCompetitionScore(meanOf(scoredRaws)) : null
  const judges: JudgeScaleStat[] = round.judges.map((judge) => {
    const judgeList = scoresByJudge.get(judge.id) ?? []
    const totals = judgeList.map(score => roundCompetitionScore(Number(score.total ?? 0)))
    const avgScore = totals.length > 0 ? roundCompetitionScore(meanOf(totals)) : null
    const avgPercent = avgScore !== null ? roundCompetitionScore(clamp((avgScore / maxTotal) * 100, 0, 100)) : null
    return {
      id: judge.id,
      displayName: judge.displayName,
      isActive: judge.isActive,
      scoredCount: totals.length,
      averageScore: avgScore,
      averagePercent: avgPercent,
      minScore: totals.length > 0 ? Math.min(...totals) : null,
      maxScore: totals.length > 0 ? Math.max(...totals) : null,
      biasFromRound: avgScore !== null && roundMeanRaw !== null
        ? roundCompetitionScore(avgScore - roundMeanRaw)
        : null
    }
  })

  const distribution: RoundDistributionStat = {
    roundKey: round.key,
    roundTitle: round.title,
    status: round.status,
    maxTotal,
    entryCount: round.entries.length,
    scoredCount: totalScored,
    checkedInCount: round.entries.filter(entry => entry.checkedInAt !== null).length,
    accompanimentCount: round.entries.filter(entry => Boolean(entry.accompaniment)).length,
    qualifiedCount: round.entries.filter(entry => entry.qualified).length,
    forfeitedCount: round.entries.filter(entry => entry.forfeited).length,
    averageScore: roundMeanRaw,
    averagePercent: totalScored > 0 ? roundCompetitionScore(roundMeanPercent) : null,
    highestScore: scoredRaws.length > 0 ? Math.max(...scoredRaws) : null,
    lowestScore: scoredRaws.length > 0 ? Math.min(...scoredRaws) : null,
    stdDevPercent: totalScored > 0 ? roundCompetitionScore(roundStdPercent) : null,
    buckets,
    judges
  }

  return {
    round,
    maxTotal,
    snapshotsBySinger,
    distribution
  }
}

interface RoundSingerSkillMap {
  order: Array<{ key: string, label: string }>
  bySinger: Map<string, Map<string, number>>
}

function buildRoundSkillRates(
  round: CompetitionRoundView | undefined,
  eventDimensions: CompetitionDimension[],
  eventTrimExtremes: boolean
): RoundSingerSkillMap {
  const order: Array<{ key: string, label: string }> = []
  const seenKeys = new Set<string>()
  const bySinger = new Map<string, Map<string, number>>()
  if (!round) return { order, bySinger }

  const roundDims = round.dimensions.length > 0 ? round.dimensions : eventDimensions
  const trimExtremes = typeof round.trimExtremes === 'boolean' ? round.trimExtremes : eventTrimExtremes
  const dimByKey = new Map<string, CompetitionDimension>()
  for (const dim of roundDims) {
    dimByKey.set(dim.key, dim)
    const norm = normalizeSkillKey(dim.label)
    if (!seenKeys.has(norm)) {
      seenKeys.add(norm)
      order.push({ key: norm, label: dim.label.trim() || norm })
    }
  }

  const bucketBySinger = new Map<string, Map<string, number[]>>()
  for (const score of round.scores) {
    let singerBuckets = bucketBySinger.get(score.singerId)
    if (!singerBuckets) {
      singerBuckets = new Map<string, number[]>()
      bucketBySinger.set(score.singerId, singerBuckets)
    }
    for (const dimScore of score.dimensions) {
      const def = dimByKey.get(dimScore.key)
      const label = (dimScore.label || def?.label || dimScore.key).trim()
      const norm = normalizeSkillKey(label)
      if (!seenKeys.has(norm)) {
        seenKeys.add(norm)
        order.push({ key: norm, label })
      }
      const dimMax = def
        ? dimensionMaxOf(def, round.dimensionMax)
        : (Number.isFinite(round.dimensionMax) && round.dimensionMax > 0 ? round.dimensionMax : 10)
      const rate = clamp((Number(dimScore.score ?? 0) / dimMax) * 100, 0, 100)
      const list = singerBuckets.get(norm) ?? []
      list.push(rate)
      singerBuckets.set(norm, list)
    }
  }

  for (const [singerId, skillMap] of bucketBySinger) {
    const rateMap = new Map<string, number>()
    for (const [norm, values] of skillMap) {
      const avg = trimmedAverage(values, trimExtremes)
      if (avg !== null) rateMap.set(norm, roundCompetitionScore(avg))
    }
    bySinger.set(singerId, rateMap)
  }

  return { order, bySinger }
}

function buildPowerSummaryNote(
  completeness: PowerCompleteness,
  prelim: RoundMetricSnapshot | null,
  semi: RoundMetricSnapshot | null,
  deltaPercent: number | null
): string {
  if (completeness === 'none') {
    return '初赛与复赛暂无评委有效评分，待评分后生成综合实力评估。'
  }
  if (completeness === 'both' && prelim && semi) {
    const trend = deltaPercent === null
      ? ''
      : (deltaPercent >= 2
          ? `，复赛较初赛提升 +${deltaPercent.toFixed(1)}%`
          : (deltaPercent <= -2
              ? `，复赛较初赛小幅回落 ${deltaPercent.toFixed(1)}%`
              : '，两轮发挥保持稳定'))
    return `综合初赛（35%，第 ${prelim.rank ?? '—'} 名）与复赛（65%，第 ${semi.rank ?? '—'} 名）标准化成绩${trend}。`
  }
  if (completeness === 'semi_only' && semi) {
    return `仅采集到复赛成绩（第 ${semi.rank ?? '—'} 名，百分制 ${semi.percentScore?.toFixed(1) ?? '—'}%），按复赛单轮全权评估。`
  }
  return `仅采集到初赛成绩（第 ${prelim?.rank ?? '—'} 名，百分制 ${prelim?.percentScore?.toFixed(1) ?? '—'}%），待复赛开赛后更新加权。`
}

/**
 * 一位选手前两轮「评委分歧」的加权标准差（百分制）。
 *
 * 评委之间越一致，这个值越小，这位选手的实力分越可信；越小样本（只有一轮评分）
 * 时直接用该轮权重归一，不会因为缺一轮就把分歧算成 0。
 */
export function singerSpreadSigma(profile: SingerAnalyticsProfile): number | null {
  const parts: Array<{ value: number, weight: number }> = []
  const prelimSigma = profile.power.prelim?.judgeStdDev ?? null
  const semiSigma = profile.power.semi?.judgeStdDev ?? null
  if (prelimSigma !== null && Number.isFinite(prelimSigma)) {
    parts.push({ value: prelimSigma, weight: profile.power.prelimWeight })
  }
  if (semiSigma !== null && Number.isFinite(semiSigma)) {
    parts.push({ value: semiSigma, weight: profile.power.semiWeight })
  }
  if (parts.length === 0) return null
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0)
  if (!(totalWeight > 0)) return null
  const weighted = parts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight
  return roundCompetitionScore(weighted)
}

/**
 * 1v1 赛前胜率。传入双方评委分歧（sigma）后按分歧程度收缩：sigma 越大，
 * 两个实力分越不可靠，概率越向 50% 靠；不传 sigma 时退化为纯实力分模型，
 * 与历史行为完全一致。
 */
export function predictDuelWinProbability(
  leftPower: number | null,
  rightPower: number | null,
  options: {
    pairNo?: number
    leftSingerId?: string | null
    rightSingerId?: string | null
    leftEntryId?: string | null
    rightEntryId?: string | null
    winnerEntryId?: string | null
    /** 左侧选手前两轮评委打分标准差的加权值（百分制）。 */
    leftSigma?: number | null
    /** 右侧选手前两轮评委打分标准差的加权值（百分制）。 */
    rightSigma?: number | null
  } = {}
): DuelPrediction {
  const pairNo = options.pairNo ?? 0
  const leftSigma = typeof options.leftSigma === 'number' && Number.isFinite(options.leftSigma) && options.leftSigma >= 0
    ? options.leftSigma
    : null
  const rightSigma = typeof options.rightSigma === 'number' && Number.isFinite(options.rightSigma) && options.rightSigma >= 0
    ? options.rightSigma
    : null

  if (leftPower === null || rightPower === null || !Number.isFinite(leftPower) || !Number.isFinite(rightPower)) {
    return {
      pairNo,
      leftSingerId: options.leftSingerId ?? null,
      rightSingerId: options.rightSingerId ?? null,
      leftPower: leftPower ?? null,
      rightPower: rightPower ?? null,
      leftWinProb: null,
      rightWinProb: null,
      powerDiff: null,
      tag: '实力数据待补',
      upset: false,
      note: '至少一方缺少前两轮评分，暂无法计算 1v1 赛前胜率。',
      confidence: 0,
      volatility: '未知'
    }
  }

  const diff = roundCompetitionScore(leftPower - rightPower)

  // 只有双方都有评委分歧数据时才收缩；单边缺失会让收缩系数偏向一侧，宁可不缩。
  const sigma = leftSigma !== null && rightSigma !== null ? (leftSigma + rightSigma) / 2 : null
  const shrink = sigma === null ? 1 : 1 / (1 + sigma / 10)
  const effectiveDiff = diff * shrink
  const rawLeft = 100 / (1 + Math.exp(-effectiveDiff / 6))
  const leftWinProb = Math.round(clamp(rawLeft, 5, 95))
  const rightWinProb = 100 - leftWinProb
  const absDiff = Math.abs(diff)

  const confidence = sigma === null
    ? 55
    : Math.round(clamp(90 - sigma * 3 - absDiff * 0.3, 25, 95))
  const volatility: DuelPrediction['volatility'] = sigma === null
    ? '未知'
    : (sigma >= 8 ? '波动' : '稳定')

  let tag = '常规对决'
  if (leftPower >= 83 && rightPower >= 83 && absDiff <= 4) {
    tag = '强强焦点组'
  } else if (absDiff <= 3) {
    tag = '势均力敌'
  } else if (absDiff >= 8) {
    tag = '优势明显'
  }

  let upset = false
  if (options.winnerEntryId) {
    if (options.winnerEntryId === options.leftEntryId && diff <= -2) upset = true
    if (options.winnerEntryId === options.rightEntryId && diff >= 2) upset = true
  }

  const leaderText = absDiff < 0.01
    ? '双方赛前实力分完全持平'
    : `${diff > 0 ? '左侧' : '右侧'}实力分领先 ${absDiff.toFixed(2)} 分（预计胜率 ${Math.max(leftWinProb, rightWinProb)}%）`
  const sigmaText = sigma === null
    ? ''
    : (volatility === '波动'
        ? `；评委分歧偏大（σ≈${sigma.toFixed(1)}），该实力分参考价值有限`
        : `；评委判断一致（σ≈${sigma.toFixed(1)}）`)

  return {
    pairNo,
    leftSingerId: options.leftSingerId ?? null,
    rightSingerId: options.rightSingerId ?? null,
    leftPower: roundCompetitionScore(leftPower),
    rightPower: roundCompetitionScore(rightPower),
    leftWinProb,
    rightWinProb,
    powerDiff: diff,
    tag,
    upset,
    confidence,
    volatility,
    note: upset ? `${leaderText}；实际赛果出现低分逆袭。` : `${leaderText}${sigmaText}`
  }
}

export function computeCompetitionAnalytics(payload: CompetitionAdminPayload): CompetitionAnalyticsReport {
  const eventDimensions = payload.event.dimensions ?? []
  const eventTrimExtremes = payload.event.trimExtremes === true
  const roundMap = new Map<CompetitionRoundKey, CompetitionRoundView>()
  for (const round of payload.rounds) {
    roundMap.set(round.key, round)
  }

  const keys: CompetitionRoundKey[] = ['prelim', 'semi', 'final', 'final2']
  const contextByKey = new Map<CompetitionRoundKey, BuiltRoundContext>()
  for (const key of keys) {
    const round = roundMap.get(key)
    if (round) {
      contextByKey.set(key, buildRoundContext(round, eventDimensions, eventTrimExtremes))
    } else {
      const emptyRound: CompetitionRoundView = {
        id: key,
        key,
        title: key,
        position: 0,
        status: 'draft',
        judgeCount: 0,
        advanceCount: null,
        advanceMode: 'rank',
        rosterConfirmedAt: null,
        resultQueryOpen: false,
        scorePrecision: 'integer',
        dimensions: [],
        dimensionMax: 10,
        maxTotal: 50,
        trimExtremes: false,
        activeDay: null,
        createdAt: 0,
        updatedAt: 0,
        entries: [],
        judges: [],
        scores: [],
        hasScores: false,
        sequential: false,
        current: null,
        duelPairs: []
      }
      contextByKey.set(key, buildRoundContext(emptyRound, eventDimensions, eventTrimExtremes))
    }
  }

  const prelimCtx = contextByKey.get('prelim')!
  const semiCtx = contextByKey.get('semi')!
  const finalCtx = contextByKey.get('final')!
  const final2Ctx = contextByKey.get('final2')!

  const prelimSkills = buildRoundSkillRates(roundMap.get('prelim'), eventDimensions, eventTrimExtremes)
  const semiSkills = buildRoundSkillRates(roundMap.get('semi'), eventDimensions, eventTrimExtremes)

  const combinedAxisList: Array<{ key: string, label: string }> = []
  const seenAxis = new Set<string>()
  for (const item of [...prelimSkills.order, ...semiSkills.order]) {
    if (!seenAxis.has(item.key)) {
      seenAxis.add(item.key)
      combinedAxisList.push(item)
    }
  }

  const finalRound = roundMap.get('final')
  const final2Round = roundMap.get('final2')
  const finalEntriesBySinger = new Map<string, CompetitionRoundEntry>()
  for (const entry of finalRound?.entries ?? []) {
    finalEntriesBySinger.set(entry.singer.id, entry)
  }
  const final2SingerIds = new Set((final2Round?.entries ?? []).map(entry => entry.singer.id))

  const duelInfoBySinger = new Map<string, {
    pairNo: number
    pairSlot: number | null
    opponentName: string | null
    won: boolean | null
  }>()
  for (const pair of finalRound?.duelPairs ?? []) {
    const [first, second] = pair.entries
    if (first) {
      duelInfoBySinger.set(first.singer.id, {
        pairNo: pair.pairNo,
        pairSlot: first.pairSlot,
        opponentName: second?.singer.name ?? null,
        won: pair.winnerEntryId ? pair.winnerEntryId === first.id : null
      })
    }
    if (second) {
      duelInfoBySinger.set(second.singer.id, {
        pairNo: pair.pairNo,
        pairSlot: second.pairSlot,
        opponentName: first?.singer.name ?? null,
        won: pair.winnerEntryId ? pair.winnerEntryId === second.id : null
      })
    }
  }

  const popularityRows = (payload.popularity?.results ?? []).slice().sort((left, right) => right.count - left.count)
  const popularityMap = new Map<string, { count: number, percent: number, rank: number | null }>()
  let lastVotes: number | null = null
  let lastVoteRank = 0
  popularityRows.forEach((row, index) => {
    if (row.count > 0) {
      if (lastVotes === null || row.count !== lastVotes) {
        lastVoteRank = index + 1
        lastVotes = row.count
      }
      popularityMap.set(row.singerId, { count: row.count, percent: row.percent, rank: lastVoteRank })
    } else {
      popularityMap.set(row.singerId, { count: 0, percent: 0, rank: null })
    }
  })

  // 第一步：合成每位选手的前两轮四维分与初步声乐能力（全场均值稍后归并）
  const rawSkillRatesBySinger = new Map<string, Map<string, { rate: number, prelimRate: number | null, semiRate: number | null }>>()
  const axisAggregate = new Map<string, number[]>()

  const draftProfiles = payload.singers.map((singer) => {
    const prelimSnap = prelimCtx.snapshotsBySinger.get(singer.id) ?? null
    const semiSnap = semiCtx.snapshotsBySinger.get(singer.id) ?? null
    const finalSnap = finalCtx.snapshotsBySinger.get(singer.id) ?? null
    const final2Snap = final2Ctx.snapshotsBySinger.get(singer.id) ?? null

    const hasPrelim = prelimSnap !== null && prelimSnap.percentScore !== null
    const hasSemi = semiSnap !== null && semiSnap.percentScore !== null

    let completeness: PowerCompleteness = 'none'
    let prelimWeight = 0
    let semiWeight = 0
    if (hasPrelim && hasSemi) {
      completeness = 'both'
      prelimWeight = PRELIM_WEIGHT_BOTH
      semiWeight = SEMI_WEIGHT_BOTH
    } else if (hasSemi) {
      completeness = 'semi_only'
      semiWeight = 1
    } else if (hasPrelim) {
      completeness = 'prelim_only'
      prelimWeight = 1
    }

    let baseScore: number | null = null
    let dominanceScore: number | null = null
    let stabilityScore: number | null = null
    let momentumScore: number | null = null
    let powerScore: number | null = null
    let deltaPercent: number | null = null
    let deltaZ: number | null = null

    if (completeness !== 'none') {
      const prelimBase = hasPrelim ? prelimSnap!.percentScore! : 0
      const semiBase = hasSemi ? semiSnap!.percentScore! : 0
      baseScore = roundCompetitionScore(clamp(prelimWeight * prelimBase + semiWeight * semiBase, 0, 100))

      const prelimDom = hasPrelim
        ? 0.6 * (prelimSnap!.percentile ?? 100) + 0.4 * clamp(75 + 10 * (prelimSnap!.zScore ?? 0), 0, 100)
        : 0
      const semiDom = hasSemi
        ? 0.6 * (semiSnap!.percentile ?? 100) + 0.4 * clamp(75 + 10 * (semiSnap!.zScore ?? 0), 0, 100)
        : 0
      dominanceScore = roundCompetitionScore(clamp(prelimWeight * prelimDom + semiWeight * semiDom, 0, 100))

      const prelimConsensus = hasPrelim ? (prelimSnap!.consensusScore ?? 85) : 0
      const semiConsensus = hasSemi ? (semiSnap!.consensusScore ?? 85) : 0
      const rawStability = prelimWeight * prelimConsensus + semiWeight * semiConsensus
      const dropPenalty = completeness === 'both'
        ? Math.max(0, (prelimBase - semiBase - 5) * 0.8)
        : 0
      stabilityScore = roundCompetitionScore(clamp(rawStability - dropPenalty, 0, 100))

      if (completeness === 'both') {
        deltaPercent = roundCompetitionScore(semiBase - prelimBase)
        deltaZ = roundCompetitionScore((semiSnap!.zScore ?? 0) - (prelimSnap!.zScore ?? 0))
        momentumScore = roundCompetitionScore(clamp(75 + 12 * deltaZ + 0.6 * deltaPercent, 35, 100))
      } else {
        momentumScore = 75
      }

      powerScore = roundCompetitionScore(clamp(
        0.55 * baseScore
        + 0.25 * dominanceScore
        + 0.10 * stabilityScore
        + 0.10 * momentumScore,
        0,
        100
      ))
    }

    const pSkills = prelimSkills.bySinger.get(singer.id)
    const sSkills = semiSkills.bySinger.get(singer.id)
    const singerSkillMap = new Map<string, { rate: number, prelimRate: number | null, semiRate: number | null }>()
    for (const axis of combinedAxisList) {
      const pRate = pSkills?.get(axis.key) ?? null
      const sRate = sSkills?.get(axis.key) ?? null
      if (pRate === null && sRate === null) continue
      const combined = pRate !== null && sRate !== null
        ? roundCompetitionScore(PRELIM_WEIGHT_BOTH * pRate + SEMI_WEIGHT_BOTH * sRate)
        : roundCompetitionScore((sRate ?? pRate)!)
      singerSkillMap.set(axis.key, { rate: combined, prelimRate: pRate, semiRate: sRate })
      const list = axisAggregate.get(axis.key) ?? []
      list.push(combined)
      axisAggregate.set(axis.key, list)
    }
    rawSkillRatesBySinger.set(singer.id, singerSkillMap)

    return {
      singer,
      prelimSnap,
      semiSnap,
      finalSnap,
      final2Snap,
      completeness,
      prelimWeight,
      semiWeight,
      baseScore,
      dominanceScore,
      stabilityScore,
      momentumScore,
      powerScore,
      deltaPercent,
      deltaZ
    }
  })

  const fieldSkillAverages = combinedAxisList
    .map((axis) => {
      const list = axisAggregate.get(axis.key) ?? []
      return {
        key: axis.key,
        label: axis.label,
        fieldAverage: list.length > 0 ? roundCompetitionScore(meanOf(list)) : 0
      }
    })
    .filter(item => (axisAggregate.get(item.key)?.length ?? 0) > 0)

  const fieldAverageMap = new Map(fieldSkillAverages.map(item => [item.key, item.fieldAverage]))

  // 计算实力排名（并列同分同名次）
  const ratedSorted = draftProfiles
    .filter(item => item.powerScore !== null)
    .sort((left, right) =>
      ((right.powerScore ?? 0) - (left.powerScore ?? 0))
      || ((right.baseScore ?? 0) - (left.baseScore ?? 0))
      || (left.singer.sortOrder - right.singer.sortOrder))
  const powerRankMap = new Map<string, number>()
  let lastPower: number | null = null
  let lastPowerRank = 0
  ratedSorted.forEach((item, index) => {
    if (lastPower === null || item.powerScore !== lastPower) {
      lastPowerRank = index + 1
      lastPower = item.powerScore
    }
    powerRankMap.set(item.singer.id, lastPowerRank)
  })

  const nameCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin')
  const profiles: SingerAnalyticsProfile[] = draftProfiles.map((draft) => {
    const singerId = draft.singer.id
    const skillMap = rawSkillRatesBySinger.get(singerId) ?? new Map()
    const skillProfile: SkillAxisStat[] = []
    for (const axis of combinedAxisList) {
      const entry = skillMap.get(axis.key)
      if (!entry) continue
      skillProfile.push({
        key: axis.key,
        label: axis.label,
        rate: entry.rate,
        fieldAverage: fieldAverageMap.get(axis.key) ?? entry.rate,
        prelimRate: entry.prelimRate,
        semiRate: entry.semiRate
      })
    }

    let topStrength: SkillAxisStat | null = null
    let weakSpot: SkillAxisStat | null = null
    if (skillProfile.length > 0) {
      // 强弱项按「相对全场平均」判断：某个维度若全场都给低分，那是维度难度或评委尺度问题，
      // 不是这个人的短板；按绝对分取最低会让人人都被标成同一个维度（例如首轮没有的舞台分）。
      const ranked = skillProfile
        .map(item => ({ item, gap: item.rate - item.fieldAverage }))
        .sort((left, right) =>
          (right.gap - left.gap)
          || (right.item.rate - left.item.rate)
          || left.item.key.localeCompare(right.item.key))
      const best = ranked[0]
      if (best && best.gap >= SKILL_GAP_THRESHOLD) topStrength = best.item
      const worst = ranked[ranked.length - 1]
      if (ranked.length >= 2 && worst && worst.gap <= -SKILL_GAP_THRESHOLD) weakSpot = worst.item
    }

    const tierInfo = powerTierOf(draft.powerScore)
    const power: SingerPowerRating = {
      singerId,
      hasRating: draft.powerScore !== null,
      completeness: draft.completeness,
      powerScore: draft.powerScore,
      powerRank: powerRankMap.get(singerId) ?? null,
      tier: tierInfo.tier,
      tierLabel: tierInfo.label,
      prelimWeight: draft.prelimWeight,
      semiWeight: draft.semiWeight,
      baseScore: draft.baseScore,
      dominanceScore: draft.dominanceScore,
      stabilityScore: draft.stabilityScore,
      momentumScore: draft.momentumScore,
      deltaPercent: draft.deltaPercent,
      deltaZ: draft.deltaZ,
      prelim: draft.prelimSnap,
      semi: draft.semiSnap,
      skillProfile,
      topStrength,
      weakSpot,
      summaryNote: buildPowerSummaryNote(draft.completeness, draft.prelimSnap, draft.semiSnap, draft.deltaPercent)
    }

    const finalEntry = finalEntriesBySinger.get(singerId) ?? null
    const inFinal = Boolean(finalEntry)
    const inFinal2 = final2SingerIds.has(singerId)
    const duelInfo = duelInfoBySinger.get(singerId)
    const pop = popularityMap.get(singerId)

    let currentStageLabel = '初赛未出分'
    if (inFinal2) {
      currentStageLabel = draft.final2Snap?.forfeited ? '决赛二轮弃权' : '决赛第二轮'
    } else if (inFinal) {
      if (draft.finalSnap?.forfeited) currentStageLabel = '决赛一轮弃权'
      else if (duelInfo?.won === true) currentStageLabel = '1v1 胜出'
      else if (duelInfo?.won === false) currentStageLabel = '1v1 止步'
      else currentStageLabel = '决赛第一轮'
    } else if (draft.semiSnap) {
      currentStageLabel = draft.semiSnap.forfeited
        ? '复赛弃权'
        : (draft.semiSnap.qualified ? '复赛晋级' : '止步复赛')
    } else if (draft.prelimSnap) {
      currentStageLabel = draft.prelimSnap.forfeited
        ? '初赛弃权'
        : (draft.prelimSnap.qualified ? '初赛晋级' : (draft.prelimSnap.scoreCount > 0 ? '初赛完赛' : '待评分'))
    }

    return {
      singer: draft.singer,
      power,
      rounds: {
        prelim: draft.prelimSnap,
        semi: draft.semiSnap,
        final: draft.finalSnap,
        final2: draft.final2Snap
      },
      currentStageLabel,
      inFinal,
      inFinal2,
      finalPairNo: duelInfo?.pairNo ?? finalEntry?.pairNo ?? null,
      finalPairSlot: duelInfo?.pairSlot ?? finalEntry?.pairSlot ?? null,
      finalOpponentName: duelInfo?.opponentName ?? null,
      finalDuelWon: duelInfo?.won ?? null,
      finalSongs: finalEntry?.finalSongs ?? null,
      popularityVotes: pop?.count ?? 0,
      popularityPercent: pop?.percent ?? 0,
      popularityRank: pop?.rank ?? null
    }
  })

  profiles.sort((left, right) => {
    const scoreLeft = left.power.powerScore ?? -1
    const scoreRight = right.power.powerScore ?? -1
    if (scoreLeft !== scoreRight) return scoreRight - scoreLeft
    const sortLeft = left.singer.sortOrder > 0 ? left.singer.sortOrder : Number.MAX_SAFE_INTEGER
    const sortRight = right.singer.sortOrder > 0 ? right.singer.sortOrder : Number.MAX_SAFE_INTEGER
    if (sortLeft !== sortRight) return sortLeft - sortRight
    return nameCollator.compare(plainSortName(left.singer.name), plainSortName(right.singer.name))
  })

  const profilesById: Record<string, SingerAnalyticsProfile> = {}
  for (const profile of profiles) {
    profilesById[profile.singer.id] = profile
  }

  const duelPredictions: Record<number, DuelPrediction> = {}
  for (const pair of finalRound?.duelPairs ?? []) {
    const leftEntry = pair.entries[0] ?? null
    const rightEntry = pair.entries[1] ?? null
    const leftProfile = leftEntry ? profilesById[leftEntry.singer.id] : undefined
    const rightProfile = rightEntry ? profilesById[rightEntry.singer.id] : undefined
    duelPredictions[pair.pairNo] = predictDuelWinProbability(
      leftProfile?.power.powerScore ?? null,
      rightProfile?.power.powerScore ?? null,
      {
        pairNo: pair.pairNo,
        leftSingerId: leftEntry?.singer.id ?? null,
        rightSingerId: rightEntry?.singer.id ?? null,
        leftEntryId: leftEntry?.id ?? null,
        rightEntryId: rightEntry?.id ?? null,
        winnerEntryId: pair.winnerEntryId,
        leftSigma: leftProfile ? singerSpreadSigma(leftProfile) : null,
        rightSigma: rightProfile ? singerSpreadSigma(rightProfile) : null
      }
    )
  }

  const preRegTotal = payload.preRegistrations.length
  const preRegConverted = payload.preRegistrations.filter(item => item.registeredAt !== null).length
  const funnelRaw: Array<{ key: string, label: string, count: number }> = [
    { key: 'prereg', label: '预报名', count: preRegTotal },
    { key: 'singers', label: '选手库登记', count: payload.singers.length },
    { key: 'prelim_checked', label: '初赛已签到', count: prelimCtx.distribution.checkedInCount },
    { key: 'prelim_scored', label: '初赛有分完赛', count: prelimCtx.distribution.scoredCount },
    { key: 'semi', label: '晋级复赛', count: semiCtx.distribution.entryCount },
    { key: 'final', label: '晋级决赛第一轮', count: finalCtx.distribution.entryCount },
    { key: 'final2', label: '晋级决赛第二轮', count: final2Ctx.distribution.entryCount }
  ]
  const funnelBaseline = Math.max(1, funnelRaw[0]?.count || funnelRaw[1]?.count || 1)
  const funnel: FunnelStageStat[] = funnelRaw.map((stage, index) => {
    const prevCount = index === 0 ? stage.count : (funnelRaw[index - 1]?.count ?? 0)
    return {
      key: stage.key,
      label: stage.label,
      count: stage.count,
      rateFromStart: roundCompetitionScore(clamp((stage.count / funnelBaseline) * 100, 0, 100)),
      rateFromPrev: index === 0
        ? 100
        : (prevCount > 0 ? roundCompetitionScore(clamp((stage.count / prevCount) * 100, 0, 100)) : 0)
    }
  })

  const topPopularity = popularityRows[0]
  const finalSongsCount = (finalRound?.entries ?? [])
    .filter(entry => Boolean(entry.finalSongs?.firstSong?.trim() && entry.finalSongs?.secondSong?.trim())).length

  return {
    generatedAt: Date.now(),
    overview: {
      singerTotal: payload.singers.length,
      preRegTotal,
      preRegConverted,
      ratedCount: ratedSorted.length,
      sTierCount: ratedSorted.filter(item => (item.powerScore ?? 0) >= 90).length,
      aPlusOrAboveCount: ratedSorted.filter(item => (item.powerScore ?? 0) >= 85).length,
      finalCount: finalCtx.distribution.entryCount,
      final2Count: final2Ctx.distribution.entryCount,
      finalSongsCount,
      duelReadyCount: (finalRound?.duelPairs ?? []).filter(pair => pair.ready).length,
      duelTotalCount: (finalRound?.duelPairs ?? []).length,
      totalVotes: payload.popularity?.totalVotes ?? 0,
      topPopularityName: topPopularity && topPopularity.count > 0 ? topPopularity.name : null,
      topPopularityVotes: topPopularity?.count ?? 0
    },
    funnel,
    roundStats: {
      prelim: prelimCtx.distribution,
      semi: semiCtx.distribution,
      final: finalCtx.distribution,
      final2: final2Ctx.distribution
    },
    profiles,
    profilesById,
    duelPredictions,
    fieldSkillAverages
  }
}
