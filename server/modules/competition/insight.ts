/**
 * 大赛数据可视化的人工智能解读。
 *
 * 复用平台既有的 AI 网关（aiGatewayBaseUrl / aiGatewayApiKey / aiGatewayModel），
 * 不新开一套 baseUrl 配置：再多一份配置就是再多一个会漂移的真相源。
 *
 * 三条纪律（与 modules/signal/llm-score.ts 同源）：
 * - 只把结构化摘要喂给模型（选手前 12、对阵前 6、每轮评委前 6），原始名单不进 prompt；
 * - 模型必须输出 JSON，解析失败一律当作「本次没有分析」，不猜、不补、不拼半截；
 * - 网关未配置或调用失败返回 null，由路由给出可读原因，前端显示占位而不是编造结论。
 */
import { createHash } from 'node:crypto'
import type { CompetitionRoundKey } from '../../../shared/types'
import type {
  CompetitionAnalyticsReport,
  DuelPrediction,
  RoundDistributionStat,
  SingerAnalyticsProfile
} from '../../../shared/utils/competition-analytics'

export interface CompetitionInsightConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export interface CompetitionInsight {
  headline: string
  highlights: string[]
  risks: string[]
  actions: string[]
  caveats: string[]
}

export interface CompetitionInsightDigest {
  event: string
  overview: {
    singers: number
    preReg: number
    preRegConverted: number
    rated: number
    sTier: number
    aPlusOrAbove: number
    finalists: number
    final2: number
    finalSongs: number
    duelGroups: number
    duelReady: number
    votes: number
    topVoteName: string | null
    topVoteCount: number
  }
  funnel: Array<{ label: string, count: number, rateFromPrev: number }>
  rounds: Array<{
    key: CompetitionRoundKey
    title: string
    status: string
    entries: number
    scored: number
    checkedIn: number
    averagePercent: number | null
    stdDevPercent: number | null
    highestPercent: number | null
    lowestPercent: number | null
    topBucket: { label: string, percent: number } | null
    judges: Array<{ name: string, scored: number, averagePercent: number | null, bias: number | null }>
  }>
  leaders: Array<{
    rank: number
    name: string
    className: string
    song: string
    stage: string
    power: number | null
    tier: string
    prelimPercent: number | null
    semiPercent: number | null
    deltaPercent: number | null
    topStrength: string | null
    weakSpot: string | null
    votes: number
  }>
  duels: Array<{
    pairNo: number
    left: string
    right: string
    leftWinPercent: number | null
    rightWinPercent: number | null
    tag: string
    upset: boolean
    note: string
  }>
  fieldSkills: Array<{ label: string, average: number }>
}

const MAX_LEADERS = 12
const MAX_DUELS = 6
const MAX_JUDGES = 6
const MAX_TEXT = 160
const MAX_ITEMS = 6

export const COMPETITION_INSIGHT_PROMPT = `你是仰恩大学歌手大赛的赛事数据分析师。下面给出的是本届比赛的结构化统计（选手实力模型、各轮分数分布、评委打分偏差、决赛对阵胜率、人气投票）。
请只依据给出的数字作判断，不得编造选手、曲目、分数或规则；数字看起来不合理时，把它写进 caveats 而不是自行修正。

输出严格 JSON，字段如下：
{
  "headline": "一句话总判断，不超过 40 字",
  "highlights": ["3-5 条值得注意的强项或亮点，每条不超过 60 字"],
  "risks": ["1-4 条需要警惕的异常，如分数离散度过高、评委偏差明显、晋级名额与实际人数不匹配"],
  "actions": ["2-4 条具体可执行的办赛建议，每条不超过 60 字"],
  "caveats": ["0-3 条数据本身的局限，如样本量小、某轮尚未开始打分"]
}
用中文，语气客观，不要客套话，不要 markdown 语法。`

/** 只读配置，网关三项缺一行就当作未接入。 */
export function insightConfigFromValues(runtime: Record<string, unknown>): CompetitionInsightConfig | null {
  const baseUrl = String(runtime.aiGatewayBaseUrl || '')
  const apiKey = String(runtime.aiGatewayApiKey || '')
  if (!baseUrl || !apiKey) return null
  return {
    baseUrl,
    apiKey,
    model: String(runtime.competitionInsightModel || runtime.aiGatewayModel || 'gpt-5.4'),
    timeoutMs: Math.max(10_000, Number(runtime.competitionInsightTimeoutMs) || 45_000)
  }
}

function percentOf(value: number | null, maxTotal: number): number | null {
  if (value === null || !Number.isFinite(value) || maxTotal <= 0) return null
  return Math.round((value / maxTotal) * 1000) / 10
}

function roundDigest(stat: RoundDistributionStat): CompetitionInsightDigest['rounds'][number] {
  const topBucket = [...stat.buckets].sort((left, right) => right.count - left.count)[0] ?? null
  const judges = [...stat.judges]
    .sort((left, right) => (right.scoredCount - left.scoredCount) || left.displayName.localeCompare(right.displayName))
    .slice(0, MAX_JUDGES)
    .map(judge => ({
      name: judge.displayName,
      scored: judge.scoredCount,
      averagePercent: judge.averagePercent === null ? null : Math.round(judge.averagePercent * 10) / 10,
      bias: judge.biasFromRound === null ? null : Math.round(judge.biasFromRound * 10) / 10
    }))
  return {
    key: stat.roundKey,
    title: stat.roundTitle,
    status: stat.status,
    entries: stat.entryCount,
    scored: stat.scoredCount,
    checkedIn: stat.checkedInCount,
    averagePercent: stat.averagePercent === null ? null : Math.round(stat.averagePercent * 10) / 10,
    stdDevPercent: stat.stdDevPercent === null ? null : Math.round(stat.stdDevPercent * 10) / 10,
    highestPercent: percentOf(stat.highestScore, stat.maxTotal),
    lowestPercent: percentOf(stat.lowestScore, stat.maxTotal),
    topBucket: topBucket && topBucket.count > 0 ? { label: topBucket.label, percent: Math.round(topBucket.percent * 10) / 10 } : null,
    judges
  }
}

function leaderDigest(profile: SingerAnalyticsProfile, index: number): CompetitionInsightDigest['leaders'][number] {
  return {
    rank: index + 1,
    name: profile.singer.name,
    className: profile.singer.className || '',
    song: profile.singer.song || '',
    stage: profile.currentStageLabel,
    power: profile.power.powerScore === null ? null : Math.round(profile.power.powerScore * 10) / 10,
    tier: profile.power.tier,
    prelimPercent: profile.power.prelim?.percentScore ?? null,
    semiPercent: profile.power.semi?.percentScore ?? null,
    deltaPercent: profile.power.deltaPercent === null ? null : Math.round(profile.power.deltaPercent * 10) / 10,
    topStrength: profile.power.topStrength?.label ?? null,
    weakSpot: profile.power.weakSpot?.label ?? null,
    votes: profile.popularityVotes
  }
}

function duelDigest(prediction: DuelPrediction, nameOf: (id: string | null) => string): CompetitionInsightDigest['duels'][number] {
  return {
    pairNo: prediction.pairNo,
    left: nameOf(prediction.leftSingerId),
    right: nameOf(prediction.rightSingerId),
    leftWinPercent: prediction.leftWinProb === null ? null : Math.round(prediction.leftWinProb * 1000) / 10,
    rightWinPercent: prediction.rightWinProb === null ? null : Math.round(prediction.rightWinProb * 1000) / 10,
    tag: prediction.tag,
    upset: prediction.upset,
    note: (prediction.note || '').slice(0, MAX_TEXT)
  }
}

/** 把整份报表压成模型读得下的摘要：固定上限，数目不随选手增长。 */
export function insightDigest(report: CompetitionAnalyticsReport, eventLabel = '仰恩大学歌手大赛'): CompetitionInsightDigest {
  const nameOf = (id: string | null): string => id ? (report.profilesById[id]?.singer.name ?? '待定') : '待定'
  const ranked = [...report.profiles]
    .filter(profile => profile.power.hasRating)
    .sort((left, right) => (left.power.powerRank ?? Number.MAX_SAFE_INTEGER) - (right.power.powerRank ?? Number.MAX_SAFE_INTEGER))
  const ordered = ranked.length > 0
    ? ranked
    : [...report.profiles].sort((left, right) => right.popularityVotes - left.popularityVotes)

  const rounds: CompetitionInsightDigest['rounds'] = (['prelim', 'semi', 'final', 'final2'] as CompetitionRoundKey[])
    .map(key => report.roundStats[key])
    .filter((stat): stat is RoundDistributionStat => Boolean(stat))
    .map(roundDigest)

  const duels = Object.values(report.duelPredictions)
    .sort((left, right) => left.pairNo - right.pairNo)
    .slice(0, MAX_DUELS)
    .map(prediction => duelDigest(prediction, nameOf))

  return {
    event: eventLabel,
    overview: {
      singers: report.overview.singerTotal,
      preReg: report.overview.preRegTotal,
      preRegConverted: report.overview.preRegConverted,
      rated: report.overview.ratedCount,
      sTier: report.overview.sTierCount,
      aPlusOrAbove: report.overview.aPlusOrAboveCount,
      finalists: report.overview.finalCount,
      final2: report.overview.final2Count,
      finalSongs: report.overview.finalSongsCount,
      duelGroups: report.overview.duelTotalCount,
      duelReady: report.overview.duelReadyCount,
      votes: report.overview.totalVotes,
      topVoteName: report.overview.topPopularityName,
      topVoteCount: report.overview.topPopularityVotes
    },
    funnel: report.funnel.map(stage => ({
      label: stage.label,
      count: stage.count,
      rateFromPrev: Math.round(stage.rateFromPrev * 10) / 10
    })),
    rounds,
    leaders: ordered.slice(0, MAX_LEADERS).map(leaderDigest),
    duels,
    fieldSkills: report.fieldSkillAverages
      .slice(0, 8)
      .map(item => ({ label: item.label, average: Math.round(item.fieldAverage * 10) / 10 }))
  }
}

/** 同一份数据得到同一个指纹，用来判断缓存能不能复用。 */
export function insightFingerprint(digest: CompetitionInsightDigest): string {
  return createHash('sha256').update(JSON.stringify(digest)).digest('hex').slice(0, 16)
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.length > MAX_TEXT ? `${item.slice(0, MAX_TEXT)}…` : item)
    .slice(0, MAX_ITEMS)
}

/** 容错解析：容忍 ```json 包裹、前后寒暄、字段缺失；拿不到 headline 就算失败。 */
export function parseInsight(text: string): CompetitionInsight | null {
  const raw = (text || '').trim()
  if (!raw) return null
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const candidate = fenced?.[1]?.trim() || raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  if (!candidate) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as Record<string, unknown>
  const headline = typeof record.headline === 'string' ? record.headline.trim().slice(0, MAX_TEXT) : ''
  if (!headline) return null
  return {
    headline,
    highlights: cleanList(record.highlights),
    risks: cleanList(record.risks),
    actions: cleanList(record.actions),
    caveats: cleanList(record.caveats)
  }
}

/** 调一次网关。失败返回 null，交给上层当作「本次没有分析」。 */
export async function requestInsight(
  config: CompetitionInsightConfig,
  digest: CompetitionInsightDigest,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<CompetitionInsight | null> {
  const doFetch = options.fetchImpl ?? fetch
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: COMPETITION_INSIGHT_PROMPT },
          { role: 'user', content: JSON.stringify(digest) }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) return null
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    return parseInsight(payload.choices?.[0]?.message?.content ?? '')
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
