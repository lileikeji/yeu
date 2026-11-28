import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import {
  competitionEvents,
  competitionPopularityBallots,
  competitionPopularityInspections,
  competitionPopularityVoteLogs
} from '../../database/schema'
import type {
  CompetitionPopularityInspectionItem,
  CompetitionPopularityMemoryEntry
} from '../../../shared/types'
import { chatCompletionsUrl, insightConfigFromValues, type CompetitionInsightConfig } from './insight'
import { computePopularityGuardReport, POPULARITY_AUTO_BATCH_SIZE, POPULARITY_FAST_INSPECTION_COOLDOWN_MS } from './popularity-guard'
import { ensurePopularityInspectionJob } from './popularity-inspection-jobs'
import { ensurePopularitySettings } from './service'

export type PopularityInspectionMode = 'auto-batch' | 'manual-batch' | 'single-log' | 'singer-focus'

export interface PopularityInspectionDigest {
  event: string
  mode: PopularityInspectionMode
  seqRange: { fromSeq: number, toSeq: number }
  targetSinger: string | null
  targetSeq: number | null
  candidateOverview: Array<{
    name: string
    validVotes: number
    voidedVotes: number
    estimatedBrushVotes: number
    estimatedRealVotes: number
  }>
  rollingMemory: Array<{
    mode: string
    fromSeq: number
    toSeq: number
    verdict: string
    estimatedBrushInBatch: number
    memoryNote: string
  }>
  /** 出口聚合：每个 ip 标签的日志条数与互不相同的浏览器指纹数（区分共用出口与刷票簇）。 */
  egress?: Array<{ ip: string, logs: number, distinctFps: number }>
  logs: Array<{
    seq: number
    at: string
    action: string
    blockCode: string | null
    singer: string
    prevSinger: string | null
    dwellMs: number | null
    cookiePresent: boolean
    ua: string
    device: string
    ip: string | null
    env: string | null
    fp: string | null
    qr: string | null
    score: number
    status: 'valid' | 'quarantined' | 'voided' | 'blocked'
    wechatVerified: boolean
    adminProtected: boolean
    reasons: string[]
  }>
}

export interface PopularityInspectionParsedResult {
  verdict: 'clean' | 'watch' | 'suspect'
  confidence: number
  estimatedBrushCount: number
  headline: string
  findings: string[]
  flaggedSeqs: number[]
  releaseSeqs: number[]
  memoryNote: string
}

const MAX_LOGS_IN_PROMPT = 35
const MAX_FINDINGS = 6
const MAX_TEXT_LEN = 180

export const POPULARITY_INSPECTOR_PROMPT = `你是仰恩大学歌手大赛人气奖投票的风控日志巡检与自动执法员。
输入包含：
1. candidateOverview：各选手当前有效票数与预估刷票数；
2. rollingMemory：之前各个巡检批次留下的跨批次记忆（历史 ip/env/qr 聚集特征与异常倾向）；
3. logs：本次待检的投票/改票/拦截日志（每条带 seq 序号、时间、动作、当前 status[valid/quarantined/voided/blocked]、wechatVerified、adminProtected、停留 dwellMs、cookiePresent、ua、脱敏短标签 device/ip/env/fp/qr、规则分与命中原因）；
4. egress：按 ip 标签聚合的日志条数与互不相同的浏览器指纹数量。

你的职责（系统已开启自动执法，你的 flaggedSeqs 与 releaseSeqs 会直接执行数据库作废与放行）：
- 结合 rollingMemory 与本批 logs 判断是否存在刷票（同 ip_xxx/env_xxx 切设备、等距节拍、缺少 Fetch 元数据、dwellMs 极短且无 cookie、同码段集中灌票、跨批次慢速注水）。
- 校园网、礼堂 WiFi 会把整场观众 NAT 到极少数公网 IP：同一个 ip 标签下出现大量互不相同的 fp、不同 ua、自然起伏的间隔，属于现场观众正常投票，不得仅凭「同 ip 集中投同一人」判刷票；真正的刷票簇特征是同一 fp 或同一 env 反复出现、间隔等距、dwellMs 极短。
- 开票瞬间几百人同投一位是正常的现场行为，logs 里的爆发类理由只算弱信号，不能单独作为作废依据。
- 若赛事开启混合模式，wechatVerified=true 的单用户合规享有多票权益且允许把多票投给同一选手，勿将同一微信用户连续多票误判为刷票；应重点稽查 wechatVerified=false 的免关注异常簇（如切无痕/飞行模式换 IP 批量灌第一票）。
- 对确认刷票（且 adminProtected=false）的 seq 填入 flaggedSeqs，系统将直接自动作废其对应选票（voided=1）；对 adminProtected=true（管理员人工复核放行）不要重复标入 flaggedSeqs。
- 对本批处于 status='quarantined'（实时冻结待审）但核验为正常观众的选票（例如 wechatVerified=true 且停顿自然、无同环境重复切号），填入 releaseSeqs，系统将自动解除冻结放行计票。
- 输出直白短句，写清 seq 序号、选手姓名、数字（票数、毫秒、标签如 ip_a1b2c3），禁用「闭环/赋能/全方位/深度/值得关注/综合来看/呈现出/彰显」等空话。
- memoryNote 用 1-2 句（不超过 140 字）提炼本批可留给下一批巡检记住的关键线索。

输出严格 JSON：
{
  "verdict": "clean | watch | suspect",
  "confidence": 0-100 的整数,
  "estimatedBrushCount": 0-logs.length 的整数,
  "headline": "不超过 40 字的一句话结论",
  "findings": ["1-5 条短句核查发现，写清 seq 与人名/标签"],
  "flaggedSeqs": [确认刷票、应直接作废的日志 seq 整数数组],
  "releaseSeqs": [复核正常、应解除冻结放行的日志 seq 整数数组],
  "memoryNote": "不超过 140 字的跨批次记忆摘要"
}
只输出 JSON，不要 markdown 包裹或多余解释。`

function shortLabel(prefix: string, hash: string | null | undefined): string | null {
  if (!hash) return null
  return `${prefix}_${hash.slice(0, 6)}`
}

export function inspectorConfigFromValues(runtime: Record<string, unknown>): CompetitionInsightConfig | null {
  return insightConfigFromValues(runtime)
}

export function parsePopularityInspectionOutput(
  text: string,
  allowedSeqs: Set<number>,
  maxBrushCount: number
): PopularityInspectionParsedResult | null {
  const raw = (text || '').trim()
  if (!raw) return null
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  const candidate = fenced?.[1]?.trim() || (start >= 0 && end > start ? raw.slice(start, end + 1) : '')
  if (!candidate) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const rec = parsed as Record<string, unknown>

  const headline = typeof rec.headline === 'string' ? rec.headline.trim().slice(0, MAX_TEXT_LEN) : ''
  if (!headline) return null

  const verdictRaw = typeof rec.verdict === 'string' ? rec.verdict.trim().toLowerCase() : 'watch'
  const verdict: PopularityInspectionParsedResult['verdict']
    = verdictRaw === 'clean' || verdictRaw === 'suspect' ? verdictRaw : 'watch'

  const confRaw = Number(rec.confidence)
  const confidence = Number.isFinite(confRaw) ? Math.min(100, Math.max(0, Math.round(confRaw))) : 60

  const brushRaw = Number(rec.estimatedBrushCount)
  const estimatedBrushCount = Number.isFinite(brushRaw)
    ? Math.min(maxBrushCount, Math.max(0, Math.round(brushRaw)))
    : 0

  const findings = Array.isArray(rec.findings)
    ? rec.findings
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim().slice(0, MAX_TEXT_LEN))
        .filter(Boolean)
        .slice(0, MAX_FINDINGS)
    : []

  const flaggedSeqs = Array.isArray(rec.flaggedSeqs)
    ? Array.from(new Set(
        rec.flaggedSeqs
          .map(item => Number(item))
          .filter(num => Number.isInteger(num) && allowedSeqs.has(num))
      )).slice(0, MAX_LOGS_IN_PROMPT)
    : []

  const flaggedSet = new Set(flaggedSeqs)
  const releaseSeqs = Array.isArray(rec.releaseSeqs)
    ? Array.from(new Set(
        rec.releaseSeqs
          .map(item => Number(item))
          .filter(num => Number.isInteger(num) && allowedSeqs.has(num) && !flaggedSet.has(num))
      )).slice(0, MAX_LOGS_IN_PROMPT)
    : []

  const memoryNote = typeof rec.memoryNote === 'string'
    ? rec.memoryNote.trim().slice(0, MAX_TEXT_LEN)
    : ''

  return {
    verdict,
    confidence,
    estimatedBrushCount,
    headline,
    findings,
    flaggedSeqs,
    releaseSeqs,
    memoryNote
  }
}

export async function requestPopularityInspection(
  config: CompetitionInsightConfig,
  digest: PopularityInspectionDigest,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<PopularityInspectionParsedResult | null> {
  const doFetch = options.fetchImpl ?? fetch
  const url = chatCompletionsUrl(config.baseUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  const allowedSeqs = new Set(digest.logs.map(l => l.seq))
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: POPULARITY_INSPECTOR_PROMPT },
          { role: 'user', content: JSON.stringify(digest) }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) return null
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    return parsePopularityInspectionOutput(
      payload.choices?.[0]?.message?.content ?? '',
      allowedSeqs,
      digest.logs.length
    )
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface RunPopularityInspectionInput {
  mode: PopularityInspectionMode
  triggerSource: 'auto' | 'manual'
  adminId: string | null
  fromSeq?: number
  toSeq?: number
  logId?: string
  singerId?: string
}

export interface PreparedPopularityInspection {
  fromSeq: number
  toSeq: number
  targetLogId: string | null
  targetSingerId: string | null
  logCount: number
  digest: PopularityInspectionDigest
}

export function preparePopularityInspection(
  client: DatabaseClient,
  eventId: string,
  input: RunPopularityInspectionInput
): PreparedPopularityInspection | null {
  const eventRow = client.db.select({ title: competitionEvents.title })
    .from(competitionEvents)
    .where(eq(competitionEvents.id, eventId))
    .get()
  const report = computePopularityGuardReport(client, eventId, { limit: 20 })
  const singerNameById = new Map(report.singerEstimates.map(s => [s.singerId, s.name]))

  let targetLogId: string | null = null
  let targetSingerId: string | null = null
  let targetSeq: number | null = null
  let selectedRows: Array<typeof competitionPopularityVoteLogs.$inferSelect>

  if (input.mode === 'single-log' && input.logId) {
    const target = client.db.select().from(competitionPopularityVoteLogs)
      .where(and(
        eq(competitionPopularityVoteLogs.eventId, eventId),
        eq(competitionPopularityVoteLogs.id, input.logId)
      ))
      .get()
    if (!target) return null
    targetLogId = target.id
    targetSingerId = target.singerId
    targetSeq = Number(target.seq)
    const minSeq = Math.max(1, targetSeq - 5)
    const maxSeq = targetSeq + 5
    selectedRows = client.db.select().from(competitionPopularityVoteLogs)
      .where(and(
        eq(competitionPopularityVoteLogs.eventId, eventId),
        gte(competitionPopularityVoteLogs.seq, minSeq),
        lte(competitionPopularityVoteLogs.seq, maxSeq)
      ))
      .orderBy(asc(competitionPopularityVoteLogs.seq))
      .all()
  } else if (input.mode === 'singer-focus' && input.singerId) {
    targetSingerId = input.singerId
    selectedRows = client.db.select().from(competitionPopularityVoteLogs)
      .where(and(
        eq(competitionPopularityVoteLogs.eventId, eventId),
        eq(competitionPopularityVoteLogs.singerId, input.singerId)
      ))
      .orderBy(desc(competitionPopularityVoteLogs.seq))
      .limit(MAX_LOGS_IN_PROMPT)
      .all()
      .reverse()
  } else if (input.fromSeq != null && input.toSeq != null) {
    selectedRows = client.db.select().from(competitionPopularityVoteLogs)
      .where(and(
        eq(competitionPopularityVoteLogs.eventId, eventId),
        gte(competitionPopularityVoteLogs.seq, input.fromSeq),
        lte(competitionPopularityVoteLogs.seq, input.toSeq)
      ))
      .orderBy(asc(competitionPopularityVoteLogs.seq))
      .limit(MAX_LOGS_IN_PROMPT)
      .all()
  } else {
    selectedRows = client.db.select().from(competitionPopularityVoteLogs)
      .where(eq(competitionPopularityVoteLogs.eventId, eventId))
      .orderBy(desc(competitionPopularityVoteLogs.seq))
      .limit(POPULARITY_AUTO_BATCH_SIZE)
      .all()
      .reverse()
  }

  if (selectedRows.length === 0) return null

  const fromSeq = Number(selectedRows[0]!.seq)
  const toSeq = Number(selectedRows[selectedRows.length - 1]!.seq)

  const ballotIds = Array.from(new Set(
    selectedRows.map(r => r.ballotId).filter((id): id is string => Boolean(id))
  ))
  const ballotRows = ballotIds.length > 0
    ? client.db.select({
        id: competitionPopularityBallots.id,
        voided: competitionPopularityBallots.voided,
        quarantined: competitionPopularityBallots.quarantined,
        voidedBy: competitionPopularityBallots.voidedBy,
        voterOpenidHash: competitionPopularityBallots.voterOpenidHash,
        clientFp: competitionPopularityBallots.clientFp
      })
        .from(competitionPopularityBallots)
        .where(and(
          eq(competitionPopularityBallots.eventId, eventId),
          inArray(competitionPopularityBallots.id, ballotIds)
        ))
        .all()
    : []
  const ballotMap = new Map(ballotRows.map(b => [b.id, b]))

  const recentMemories: CompetitionPopularityMemoryEntry[] = report.rollingMemory.slice(-8)
  const digest: PopularityInspectionDigest = {
    event: eventRow?.title || '仰恩大学歌手大赛',
    mode: input.mode,
    seqRange: { fromSeq, toSeq },
    targetSinger: targetSingerId ? (singerNameById.get(targetSingerId) ?? null) : null,
    targetSeq,
    candidateOverview: report.singerEstimates.slice(0, 15).map(item => ({
      name: item.name,
      validVotes: item.validVotes,
      voidedVotes: item.voidedVotes,
      estimatedBrushVotes: item.estimatedBrushVotes,
      estimatedRealVotes: item.estimatedRealVotes
    })),
    rollingMemory: recentMemories.map(m => ({
      mode: m.mode,
      fromSeq: m.fromSeq,
      toSeq: m.toSeq,
      verdict: m.verdict,
      estimatedBrushInBatch: m.estimatedBrushInBatch,
      memoryNote: m.memoryNote
    })),
    logs: selectedRows.map((row) => {
      let reasons: string[] = []
      try {
        const parsed = JSON.parse(row.suspicionReasonsJson || '[]') as unknown
        if (Array.isArray(parsed)) reasons = parsed.filter((x): x is string => typeof x === 'string')
      } catch {
        reasons = []
      }
      const ballot = row.ballotId ? ballotMap.get(row.ballotId) : undefined
      const status: 'valid' | 'quarantined' | 'voided' | 'blocked' = row.action === 'blocked'
        ? 'blocked'
        : ballot && Number(ballot.voided) === 1
          ? 'voided'
          : ballot && Number(ballot.quarantined) === 1
            ? 'quarantined'
            : 'valid'
      const fp = shortLabel('fp', ballot?.clientFp)
      return {
        seq: Number(row.seq),
        at: new Date(Number(row.createdAt)).toLocaleTimeString('zh-CN', { hour12: false }),
        action: row.action,
        blockCode: row.blockCode,
        singer: row.singerId ? (singerNameById.get(row.singerId) ?? '未知') : '—',
        prevSinger: row.prevSingerId ? (singerNameById.get(row.prevSingerId) ?? '未知') : null,
        dwellMs: row.dwellMs == null ? null : Number(row.dwellMs),
        cookiePresent: Number(row.cookiePresent) === 1,
        ua: row.uaSummary,
        device: shortLabel('dev', row.deviceHash) ?? 'dev_none',
        ip: shortLabel('ip', row.ipHash),
        env: shortLabel('env', row.envHash),
        fp,
        qr: shortLabel('qr', row.qrNonce),
        score: Number(row.suspicionScore),
        status,
        wechatVerified: Boolean(ballot?.voterOpenidHash),
        adminProtected: ballot?.voidedBy === 'admin-restored',
        reasons
      }
    })
  }

  // 出口聚合：校园网会把整场观众 NAT 到少数几个公网 IP，
  // 同一个 ip 标签下出现大量互不相同的浏览器指纹才是「正常观众」，重复指纹才是刷票。
  const ipStats = new Map<string, { logs: number, fps: Set<string> }>()
  for (const log of digest.logs) {
    if (!log.ip) continue
    const entry = ipStats.get(log.ip) ?? { logs: 0, fps: new Set<string>() }
    entry.logs += 1
    if (log.fp) entry.fps.add(log.fp)
    ipStats.set(log.ip, entry)
  }
  digest.egress = Array.from(ipStats.entries())
    .map(([ip, stat]) => ({ ip, logs: stat.logs, distinctFps: stat.fps.size }))
    .sort((a, b) => b.logs - a.logs)
    .slice(0, 5)

  return {
    fromSeq,
    toSeq,
    targetLogId,
    targetSingerId,
    logCount: selectedRows.length,
    digest
  }
}

export function savePopularityInspectionResult(
  client: DatabaseClient,
  eventId: string,
  input: RunPopularityInspectionInput,
  prepared: PreparedPopularityInspection,
  parsed: PopularityInspectionParsedResult,
  model: string
): CompetitionPopularityInspectionItem {
  const id = randomUUID()
  const now = Date.now()
  const settings = ensurePopularitySettings(client, eventId)
  const aiAutoModerate = Boolean(settings.aiAutoModerate ?? true)

  let autoVoidedCount = 0
  let autoReleasedCount = 0
  let flaggedBallotIds: string[] = []

  client.sqlite.transaction(() => {
    const seqRows = client.db.select({
      seq: competitionPopularityVoteLogs.seq,
      ballotId: competitionPopularityVoteLogs.ballotId
    })
      .from(competitionPopularityVoteLogs)
      .where(and(
        eq(competitionPopularityVoteLogs.eventId, eventId),
        gte(competitionPopularityVoteLogs.seq, prepared.fromSeq),
        lte(competitionPopularityVoteLogs.seq, prepared.toSeq)
      ))
      .all()

    const ballotBySeq = new Map<number, string>()
    for (const row of seqRows) {
      if (row.ballotId) ballotBySeq.set(Number(row.seq), row.ballotId)
    }

    flaggedBallotIds = Array.from(new Set(
      parsed.flaggedSeqs
        .map(seq => ballotBySeq.get(seq) ?? null)
        .filter((bid): bid is string => Boolean(bid))
    ))

    if (aiAutoModerate) {
      const flaggedSet = new Set(parsed.flaggedSeqs)
      const voidTargetIds = (parsed.verdict === 'suspect' || parsed.confidence >= 65)
        ? flaggedBallotIds
        : []

      if (voidTargetIds.length > 0) {
        const placeholders = voidTargetIds.map(() => '?').join(', ')
        const voidRes = client.sqlite.prepare(
          `UPDATE competition_popularity_ballots
           SET voided = 1, quarantined = 0, quarantined_reason = NULL,
               voided_by = 'ai-inspector', voided_reason = ?, voided_at = ?, updated_at = ?
           WHERE event_id = ? AND id IN (${placeholders})
             AND voided = 0 AND COALESCE(voided_by, '') != 'admin-restored'`
        ).run(`AI巡检自动作废: ${parsed.headline}`, now, now, eventId, ...voidTargetIds)
        autoVoidedCount = Number(voidRes.changes ?? 0)
      }

      const voidedIdSet = new Set(voidTargetIds)
      const releaseSeqs = new Set<number>(parsed.releaseSeqs)
      if (parsed.verdict === 'clean' && parsed.confidence >= 70) {
        for (const item of prepared.digest.logs) {
          if (item.status === 'quarantined' && !flaggedSet.has(item.seq)) {
            releaseSeqs.add(item.seq)
          }
        }
      }

      const releaseTargetIds = Array.from(new Set(
        Array.from(releaseSeqs)
          .map(seq => ballotBySeq.get(seq) ?? null)
          .filter((bid): bid is string => typeof bid === 'string' && bid.length > 0)
          .filter(bid => !voidedIdSet.has(bid))
      ))

      if (releaseTargetIds.length > 0) {
        const placeholders = releaseTargetIds.map(() => '?').join(', ')
        const releaseRes = client.sqlite.prepare(
          `UPDATE competition_popularity_ballots
           SET quarantined = 0, quarantined_reason = NULL, updated_at = ?
           WHERE event_id = ? AND id IN (${placeholders})
             AND quarantined = 1 AND voided = 0`
        ).run(now, eventId, ...releaseTargetIds)
        autoReleasedCount = Number(releaseRes.changes ?? 0)
      }
    }

    client.db.insert(competitionPopularityInspections).values({
      id,
      eventId,
      mode: input.mode,
      fromSeq: prepared.fromSeq,
      toSeq: prepared.toSeq,
      targetLogId: prepared.targetLogId,
      targetSingerId: prepared.targetSingerId,
      logCount: prepared.logCount,
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      estimatedBrushInBatch: parsed.estimatedBrushCount,
      headline: parsed.headline,
      findingsJson: JSON.stringify(parsed.findings),
      flaggedSeqsJson: JSON.stringify(parsed.flaggedSeqs),
      memoryNote: parsed.memoryNote,
      model,
      triggerSource: input.triggerSource,
      createdByAdminId: input.adminId,
      autoVoidedCount,
      autoReleasedCount,
      createdAt: now
    }).run()
  })()

  return {
    id,
    mode: input.mode,
    fromSeq: prepared.fromSeq,
    toSeq: prepared.toSeq,
    targetLogId: prepared.targetLogId,
    targetSingerId: prepared.targetSingerId,
    targetSingerName: prepared.digest.targetSinger,
    logCount: prepared.logCount,
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    estimatedBrushInBatch: parsed.estimatedBrushCount,
    headline: parsed.headline,
    findings: parsed.findings,
    flaggedSeqs: parsed.flaggedSeqs,
    flaggedBallotIds,
    memoryNote: parsed.memoryNote,
    model,
    triggerSource: input.triggerSource,
    autoVoidedCount,
    autoReleasedCount,
    createdAt: now
  }
}

export async function runPopularityInspectionNow(
  client: DatabaseClient,
  eventId: string,
  config: CompetitionInsightConfig,
  input: RunPopularityInspectionInput,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<CompetitionPopularityInspectionItem | null> {
  const prepared = preparePopularityInspection(client, eventId, input)
  if (!prepared) return null
  const parsed = await requestPopularityInspection(config, prepared.digest, options)
  if (!parsed) return null
  return savePopularityInspectionResult(client, eventId, input, prepared, parsed, config.model)
}

/** 尾巴静止多久之后补扫：一次刷票脚本停止后，剩下的零头必须有人接着检。 */
export const POPULARITY_TAIL_IDLE_MS = 10_000
/** 积压时单批上限，与 digest 的 MAX_LOGS_IN_PROMPT 对齐；再大就会截断日志。 */
export const POPULARITY_SWEEP_BATCH_SIZE = MAX_LOGS_IN_PROMPT

export interface PopularityInspectionBacklog {
  latestSeq: number
  lastToSeq: number
  pendingCount: number
  lastLogAt: number
}

/** 巡检水位：auto-batch 已覆盖到哪一条，还剩多少条从没进过任何批次。 */
export function readPopularityInspectionBacklog(
  client: DatabaseClient,
  eventId: string
): PopularityInspectionBacklog {
  const logRow = client.sqlite.prepare(
    `SELECT COALESCE(MAX(seq), 0) AS maxSeq, COALESCE(MAX(created_at), 0) AS lastAt
     FROM competition_popularity_vote_logs WHERE event_id = ?`
  ).get(eventId) as { maxSeq: number, lastAt: number } | undefined
  const latestSeq = Number(logRow?.maxSeq ?? 0)
  const lastRow = client.sqlite.prepare(
    `SELECT COALESCE(MAX(to_seq), 0) AS lastToSeq FROM competition_popularity_inspections
     WHERE event_id = ? AND mode = 'auto-batch'`
  ).get(eventId) as { lastToSeq: number } | undefined
  const lastToSeq = Number(lastRow?.lastToSeq ?? 0)
  return {
    latestSeq,
    lastToSeq,
    pendingCount: Math.max(0, latestSeq - lastToSeq),
    lastLogAt: Number(logRow?.lastAt ?? 0)
  }
}

/**
 * 每满 20 条新增投票日志时在后台自动启动微批巡检；另有两条加急通道：
 * 产生实时冻结且未检积压 >= 3 条，或出现「聚集但无机器证据」的高危未冻票且积压 >= 5 条。
 * 加急通道带 45 秒冷却，避免一次刷票把巡检调用打成洪水。巡检结论会直接自动作废确认刷票或放行正常冻结票。
 *
 * 触发只挂在投票请求上：脚本一停，最后不足一批的尾巴就永远排不上队，事后也不会有人补扫
 * （2026-11-28 线上 80 票因此从未进入巡检）。allowTailSweep 打开后，只要最后一条日志静止超过
 * POPULARITY_TAIL_IDLE_MS，就用一次带冷却的补扫把尾巴清掉。
 */
export function maybeTriggerAutoPopularityInspection(
  client: DatabaseClient,
  eventId: string,
  config: CompetitionInsightConfig | null,
  options: {
    fetchImpl?: typeof fetch
    hasNewQuarantined?: boolean
    hasHighRiskPending?: boolean
    allowTailSweep?: boolean
    now?: number
  } = {}
): Promise<void> | null {
  if (!config) return null
  const backlog = readPopularityInspectionBacklog(client, eventId)
  const latestSeq = backlog.latestSeq
  const lastToSeq = backlog.lastToSeq
  const pendingCount = backlog.pendingCount
  if (latestSeq <= 0) return null

  const now = options.now ?? Date.now()
  const idleMs = backlog.lastLogAt > 0 ? now - backlog.lastLogAt : 0
  const fastQuarantineTrigger = Boolean(options.hasNewQuarantined) && pendingCount >= 3
  const fastRiskTrigger = Boolean(options.hasHighRiskPending) && pendingCount >= 5
  const tailSweepTrigger = Boolean(options.allowTailSweep)
    && pendingCount > 0
    && idleMs >= POPULARITY_TAIL_IDLE_MS
  if (
    pendingCount < POPULARITY_AUTO_BATCH_SIZE
    && !fastQuarantineTrigger
    && !fastRiskTrigger
    && !tailSweepTrigger
  ) return null

  if ((fastQuarantineTrigger || fastRiskTrigger || tailSweepTrigger) && pendingCount < POPULARITY_AUTO_BATCH_SIZE) {
    const lastAutoRow = client.sqlite.prepare(
      `SELECT COALESCE(MAX(created_at), 0) AS lastAt FROM competition_popularity_inspections
       WHERE event_id = ? AND trigger_source = 'auto'`
    ).get(eventId) as { lastAt: number } | undefined
    if (now - Number(lastAutoRow?.lastAt ?? 0) < POPULARITY_FAST_INSPECTION_COOLDOWN_MS) return null
  }

  const fromSeq = lastToSeq + 1
  const batchSize = pendingCount >= POPULARITY_AUTO_BATCH_SIZE
    ? POPULARITY_SWEEP_BATCH_SIZE
    : pendingCount
  const toSeq = Math.min(latestSeq, fromSeq + batchSize - 1)
  const jobKey = `auto:${eventId}:${fromSeq}-${toSeq}`
  const { promise } = ensurePopularityInspectionJob(eventId, jobKey, 'auto-batch', config.model, async () => {
    const result = await runPopularityInspectionNow(client, eventId, config, {
      mode: 'auto-batch',
      triggerSource: 'auto',
      adminId: null,
      fromSeq,
      toSeq
    }, options)
    return Boolean(result)
  })
  return promise
}

export interface PopularityInspectionSweepResult {
  batches: number
  inspected: number
  voided: number
}

/**
 * 把水位之后积压的日志成批补扫完（每批 POPULARITY_SWEEP_BATCH_SIZE 条，串行）。
 *
 * 为什么需要它：自动巡检只在投票请求里被动触发，脚本 3 票/秒 时模型一次 3-6 秒，
 * 积压只会越滚越大；投票一停，尾巴彻底没人管。这里由进程内的定时器驱动，
 * 与请求路径解耦，单次最多 maxBatches 批，AI 返回失败立即停下等下一轮。
 */
export async function sweepPopularityInspectionBacklog(
  client: DatabaseClient,
  eventId: string,
  config: CompetitionInsightConfig | null,
  options: { fetchImpl?: typeof fetch, maxBatches?: number } = {}
): Promise<PopularityInspectionSweepResult> {
  const summary: PopularityInspectionSweepResult = { batches: 0, inspected: 0, voided: 0 }
  if (!config) return summary
  const maxBatches = Math.max(1, options.maxBatches ?? 2)
  while (summary.batches < maxBatches) {
    const backlog = readPopularityInspectionBacklog(client, eventId)
    if (backlog.pendingCount <= 0) break
    const fromSeq = backlog.lastToSeq + 1
    const toSeq = Math.min(backlog.latestSeq, fromSeq + POPULARITY_SWEEP_BATCH_SIZE - 1)
    const holder: { item: CompetitionPopularityInspectionItem | null } = { item: null }
    const jobKey = `auto:${eventId}:${fromSeq}-${toSeq}`
    const { promise, job } = ensurePopularityInspectionJob(eventId, jobKey, 'auto-batch', config.model, async () => {
      const item = await runPopularityInspectionNow(client, eventId, config, {
        mode: 'auto-batch',
        triggerSource: 'auto',
        adminId: null,
        fromSeq,
        toSeq
      }, options)
      holder.item = item
      return Boolean(item)
    })
    await promise
    const item = holder.item
    // 同一区间已有在跑的批次（投票请求抢先触发）时不重复计数，留给下一轮。
    if (job.state !== 'done' || !item) break
    summary.batches += 1
    summary.inspected += item.logCount
    summary.voided += item.autoVoidedCount
  }
  return summary
}
