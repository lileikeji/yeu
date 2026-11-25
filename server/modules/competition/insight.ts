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
import type {
  CompetitionAnalyticsReport,
  DuelPrediction,
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
    finalists: number
    final2: number
    /** 第二轮名单里由隐藏赛制复活补位进来的人数。 */
    revived: number
    finalSongs: number
    duelGroups: number
    duelReady: number
  }
  leaders: Array<{
    rank: number
    name: string
    className: string
    song: string
    secondSong: string | null
    stage: string
    power: number | null
    tier: string
    prelimPercent: number | null
    semiPercent: number | null
    deltaPercent: number | null
    topStrength: string | null
    weakSpot: string | null
    pairNo: number | null
    pairSlot: number | null
    opponent: string | null
    duelResult: '胜' | '负' | '待唱' | null
    finalSongsReady: boolean
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
    /** 预测置信度 0–100，来自两人前两轮评委分歧；模型据此判断「这场能不能当参考」。 */
    confidence: number
    volatility: string
  }>
  /**
   * 隐藏赛制复活：决赛第一轮 1v1 的败者按本轮均分排队，前 N 名跟着胜者进第二轮。
   * 非决赛 1v1 时为 null；开关关闭时 enabled=false 且没有候选。
   */
  revival: {
    enabled: boolean
    slots: number
    candidates: Array<{ loserRank: number, name: string, average: number | null, revived: boolean }>
  } | null
}

const MAX_LEADERS = 12
const MAX_DUELS = 6
const MAX_TEXT = 160
const MAX_ITEMS = 6

export const COMPETITION_INSIGHT_PROMPT = `你是仰恩大学歌手大赛的决赛现场记录员。输入包含决赛选手、两首歌准备情况、前两轮成绩、1v1 对阵胜率与复活信息。
你的任务：用直白短句写出每位选手当前分数和排名、每组 1v1 谁占优、谁曲目还没齐，不做赛事运营复盘。
禁止输出：报名/预报名转化、签到率、评委偏差、维度平均分、分数分布、泛泛的赛制建议；即使输入里出现这些字段也不要写。
文风硬约束：一条只讲一两件事，直接写人名、歌名和数字（分数、胜率、分差、名次），不要写空洞修辞；禁用「展现出、彰显、强劲、赋能、闭环、全方位、深度、格局、冠军相、脱颖而出、值得关注、综合来看、悬念」等套话。没有数据就写 caveats，不要编造。
字段说明：duels[].leftWinPercent/rightWinPercent 是赛前胜率；confidence 是这次预测的置信度（0–100，评委分差大、分差小时会变低）；volatility 为「稳定 / 波动 / 未知」，为「波动」时只当参考，不要写成一定赢。
leaders[].song/secondSong 分别是第一轮、第二轮曲目；finalSongsReady=true 表示两首歌都已提交；pairNo/pairSlot/opponent/duelResult 描述 1v1 分组与结果（待唱=尚未出结果）。
revival 是隐藏赛制复活：决赛第一轮 1v1 的败者按本轮均分排队，前 slots 名（revived=true）跟着胜者一起进第二轮；candidates 按 loserRank 从小到大排。复活名额对具体选手晋级的影响，可以写进 highlights 或 risks。

输出严格 JSON，字段如下：
{
  "headline": "一句话写出排名前列或最接近的对阵（带分数或胜率），不超过 40 字",
  "highlights": ["3-5 条，短句直陈具体选手或对阵的分数、胜率、分差与曲目情况，每条不超过 60 字"],
  "risks": ["1-4 条，具体到选手或对阵的风险，如分差过小、未交两首歌、评委分差大、复活名额挤压，每条不超过 60 字"],
  "actions": ["2-4 条，针对具体选手或对阵的现场核对/备赛动作，每条不超过 60 字"],
  "caveats": ["0-3 条数据缺口，如某轮未打分、未抽签，不要写运营建议"]
}
用中文，短句陈述事实，不要客套话，不要 markdown 语法。`

/** 只读配置，网关三项缺一行就当作未接入。 */
export function insightConfigFromValues(runtime: Record<string, unknown>): CompetitionInsightConfig | null {
  const baseUrl = String(runtime.aiGatewayBaseUrl || '')
  const apiKey = String(runtime.aiGatewayApiKey || '')
  if (!baseUrl || !apiKey) return null
  return {
    baseUrl,
    apiKey,
    model: String(runtime.competitionInsightModel || runtime.aiGatewayModel || 'gpt-5.4'),
    timeoutMs: Math.max(10_000, Number(runtime.competitionInsightTimeoutMs ?? runtime.aiGatewayTimeoutMs) || 45_000)
  }
}

function leaderDigest(profile: SingerAnalyticsProfile, index: number): CompetitionInsightDigest['leaders'][number] {
  const firstSong = profile.finalSongs?.firstSong?.trim() || profile.singer.song || ''
  const secondSong = profile.finalSongs?.secondSong?.trim() || null
  const finalSongsReady = Boolean(firstSong && secondSong)
  const duelResult: CompetitionInsightDigest['leaders'][number]['duelResult']
    = profile.finalDuelWon === true
      ? '胜'
      : profile.finalDuelWon === false
        ? '负'
        : profile.finalPairNo !== null
          ? '待唱'
          : null
  return {
    rank: index + 1,
    name: profile.singer.name,
    className: profile.singer.className || '',
    song: firstSong,
    secondSong,
    stage: profile.currentStageLabel,
    power: profile.power.powerScore === null ? null : Math.round(profile.power.powerScore * 10) / 10,
    tier: profile.power.tier,
    prelimPercent: profile.power.prelim?.percentScore ?? null,
    semiPercent: profile.power.semi?.percentScore ?? null,
    deltaPercent: profile.power.deltaPercent === null ? null : Math.round(profile.power.deltaPercent * 10) / 10,
    topStrength: profile.power.topStrength?.label ?? null,
    weakSpot: profile.power.weakSpot?.label ?? null,
    pairNo: profile.finalPairNo,
    pairSlot: profile.finalPairSlot,
    opponent: profile.finalOpponentName,
    duelResult,
    finalSongsReady
  }
}

function duelDigest(prediction: DuelPrediction, nameOf: (id: string | null) => string): CompetitionInsightDigest['duels'][number] {
  return {
    pairNo: prediction.pairNo,
    left: nameOf(prediction.leftSingerId),
    right: nameOf(prediction.rightSingerId),
    // leftWinProb 本身是 0–100 的百分数，这里只保留一位小数，不能再乘 100。
    leftWinPercent: prediction.leftWinProb === null ? null : Math.round(prediction.leftWinProb * 10) / 10,
    rightWinPercent: prediction.rightWinProb === null ? null : Math.round(prediction.rightWinProb * 10) / 10,
    tag: prediction.tag,
    upset: prediction.upset,
    note: (prediction.note || '').slice(0, MAX_TEXT),
    confidence: prediction.confidence,
    volatility: prediction.volatility
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
    : [...report.profiles].sort((left, right) => (
        (left.finalPairNo ?? Number.MAX_SAFE_INTEGER) - (right.finalPairNo ?? Number.MAX_SAFE_INTEGER)
        || left.singer.name.localeCompare(right.singer.name, 'zh-CN')
      ))

  const duels = Object.values(report.duelPredictions)
    .sort((left, right) => left.pairNo - right.pairNo)
    .slice(0, MAX_DUELS)
    .map(prediction => duelDigest(prediction, nameOf))

  return {
    event: eventLabel,
    overview: {
      finalists: report.overview.finalCount,
      final2: report.overview.final2Count,
      revived: report.overview.revivedCount,
      finalSongs: report.overview.finalSongsCount,
      duelGroups: report.overview.duelTotalCount,
      duelReady: report.overview.duelReadyCount
    },
    leaders: ordered.slice(0, MAX_LEADERS).map(leaderDigest),
    duels,
    revival: report.revival
      ? {
          enabled: report.revival.enabled,
          slots: report.revival.slots,
          candidates: report.revival.candidates.slice(0, MAX_ITEMS).map(candidate => ({
            loserRank: candidate.loserRank,
            name: candidate.name,
            average: candidate.average === null ? null : Math.round(candidate.average * 10) / 10,
            revived: candidate.revived
          }))
        }
      : null
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
/**
 * 平台网关的 baseUrl 只到主机端口（如 http://127.0.0.1:18080），OpenAI 兼容路由挂在 /v1 下。
 * 若运维把 /v1 写进了 baseUrl，就不要再叠一层。
 */
export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  return /\/v1$/.test(trimmed) ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`
}

export async function requestInsight(
  config: CompetitionInsightConfig,
  digest: CompetitionInsightDigest,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<CompetitionInsight | null> {
  const doFetch = options.fetchImpl ?? fetch
  const url = chatCompletionsUrl(config.baseUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${config.apiKey}` },
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
