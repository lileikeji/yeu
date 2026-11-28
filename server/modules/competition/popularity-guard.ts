import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import {
  competitionPopularityBallots,
  competitionPopularityInspections,
  competitionPopularityVoteLogs
} from '../../database/schema'
import type {
  CompetitionPopularityAuditReport,
  CompetitionPopularityClusterItem,
  CompetitionPopularityDistributionItem,
  CompetitionPopularityInspectionItem,
  CompetitionPopularityInspectionJobView,
  CompetitionPopularityMemoryEntry,
  CompetitionPopularityRiskLevel,
  CompetitionPopularitySingerEstimate,
  CompetitionPopularityTimelineBucket,
  CompetitionPopularityVoteLogItem
} from '../../../shared/types'
import { listPopularityCandidates } from './service'

export const POPULARITY_AUTO_BATCH_SIZE = 20
/** 加急巡检冷却：冻结/高危未冻票触发的自动巡检最多 45 秒一次，防止刷票把模型调用打成洪水。 */
export const POPULARITY_FAST_INSPECTION_COOLDOWN_MS = 45_000
const BLOCKED_LOG_RATE_WINDOW_MS = 60_000
const BLOCKED_LOG_MAX_PER_IP_PER_MINUTE = 30
const DWELL_BUCKETS = [
  { label: '<1.2s', min: 0, max: 1200 },
  { label: '1.2-2.5s', min: 1200, max: 2500 },
  { label: '2.5-8s', min: 2500, max: 8000 },
  { label: '8-30s', min: 8000, max: 30000 },
  { label: '>30s', min: 30000, max: Number.POSITIVE_INFINITY }
] as const

type BallotRow = typeof competitionPopularityBallots.$inferSelect
type LogRow = typeof competitionPopularityVoteLogs.$inferSelect
type InspectionRow = typeof competitionPopularityInspections.$inferSelect

export interface PopularityAuditQueryOptions {
  singerId?: string
  filter?: 'all' | 'quarantined' | 'suspect' | 'watch' | 'voided' | 'blocked'
  q?: string
  limit?: number
  aiConfigured?: boolean
  inspectionJob?: CompetitionPopularityInspectionJobView | null
}

function shortTag(prefix: string, hash: string | null | undefined): string {
  if (!hash) return `${prefix}_none`
  return `${prefix}_${hash.slice(0, 6)}`
}

function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  } catch {
    return []
  }
}

function parseNumberArray(json: string | null | undefined): number[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is number => typeof item === 'number' && Number.isInteger(item))
      : []
  } catch {
    return []
  }
}

function riskLevelOf(score: number): CompetitionPopularityRiskLevel {
  if (score >= 60) return 'suspect'
  if (score >= 30) return 'watch'
  return 'normal'
}

function probabilityFromScore(score: number): number {
  if (score >= 80) return 0.92
  if (score >= 60) return 0.78
  if (score >= 45) return 0.48
  if (score >= 30) return 0.28
  return 0
}

function formatTimeBucketLabel(ms: number): string {
  const date = new Date(ms)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function selectTimelineBucketSize(logs: LogRow[]): number {
  if (logs.length < 2) return 60_000
  const first = Number(logs[0]!.createdAt)
  const last = Number(logs[logs.length - 1]!.createdAt)
  const span = Math.max(60_000, last - first)
  if (span <= 20 * 60_000) return 60_000
  if (span <= 2 * 3600_000) return 5 * 60_000
  if (span <= 12 * 3600_000) return 30 * 60_000
  return 60 * 60_000
}

/**
 * 事后簇分析：同一 (ipHash, envHash) 对同选手投 >=3 票、同 IP >=5 设备、
 * 或同一旧 qrNonce 集中灌票时，为相关选票补充簇级风控分与标签。
 */
function buildRetrospectiveBoosts(
  ballots: BallotRow[],
  logs: LogRow[]
): {
  ballotScoreMap: Map<string, number>
  ballotReasonsMap: Map<string, string[]>
  latestQrByBallot: Map<string, string>
} {
  const ipDevices = new Map<string, Set<string>>()
  const envDevices = new Map<string, Set<string>>()
  const fpDevices = new Map<string, Set<string>>()
  const ipEnvSingerActors = new Map<string, Set<string>>()
  const qrBallots = new Map<string, Set<string>>()
  const latestQrByBallot = new Map<string, string>()

  for (const log of logs) {
    if (log.ballotId && log.qrNonce) {
      latestQrByBallot.set(log.ballotId, log.qrNonce)
      const set = qrBallots.get(log.qrNonce) ?? new Set<string>()
      set.add(log.ballotId)
      qrBallots.set(log.qrNonce, set)
    }
  }

  for (const ballot of ballots) {
    if (ballot.ipHash) {
      const set = ipDevices.get(ballot.ipHash) ?? new Set<string>()
      set.add(ballot.deviceHash)
      ipDevices.set(ballot.ipHash, set)
    }
    if (ballot.envHash) {
      const envKey = ballot.ipHash ? `${ballot.ipHash}|${ballot.envHash}` : ballot.envHash
      const set = envDevices.get(envKey) ?? new Set<string>()
      set.add(ballot.voterOpenidHash || ballot.deviceHash)
      envDevices.set(envKey, set)
    }
    if (ballot.ipHash && ballot.envHash) {
      const key = `${ballot.ipHash}|${ballot.envHash}|${ballot.singerId}`
      const actorSet = ipEnvSingerActors.get(key) ?? new Set<string>()
      actorSet.add(ballot.voterOpenidHash || ballot.deviceHash)
      ipEnvSingerActors.set(key, actorSet)
    }
    if (ballot.clientFp) {
      const set = fpDevices.get(ballot.clientFp) ?? new Set<string>()
      set.add(ballot.deviceHash)
      fpDevices.set(ballot.clientFp, set)
    }
  }

  const ballotScoreMap = new Map<string, number>()
  const ballotReasonsMap = new Map<string, string[]>()

  for (const ballot of ballots) {
    let score = Number(ballot.suspicionScore ?? 0)
    const reasons = parseStringArray(ballot.suspicionReasonsJson)
    const ipCount = ballot.ipHash ? (ipDevices.get(ballot.ipHash)?.size ?? 0) : 0
    const envKey = ballot.envHash ? (ballot.ipHash ? `${ballot.ipHash}|${ballot.envHash}` : ballot.envHash) : ''
    const envCount = envKey ? (envDevices.get(envKey)?.size ?? 0) : 0
    if (ipCount >= 5) {
      score = Math.max(score, 45)
      if (!reasons.some(r => r.includes('同IP'))) reasons.push(`同IP聚集(${ipCount}台设备)`)
    }
    if (envCount >= 3) {
      score = Math.max(score, 65)
      if (!reasons.some(r => r.includes('同设备环境'))) reasons.push(`同环境切换(${envCount}个身份)`)
    }
    if (ballot.ipHash && ballot.envHash) {
      const clusterSize = ipEnvSingerActors.get(`${ballot.ipHash}|${ballot.envHash}|${ballot.singerId}`)?.size ?? 0
      if (clusterSize >= 3) {
        score = Math.max(score, 80)
        reasons.push(`同IP+环境同投该选手(${clusterSize}个身份)`)
      }
    }
    const fpCount = ballot.clientFp ? (fpDevices.get(ballot.clientFp)?.size ?? 0) : 0
    if (fpCount >= 4) {
      score = Math.max(score, 70)
      if (!reasons.some(r => r.includes('同浏览器指纹'))) reasons.push(`同浏览器指纹切换身份(${fpCount}个设备)`)
    }
    const qrNonce = latestQrByBallot.get(ballot.id)
    if (qrNonce && (qrBallots.get(qrNonce)?.size ?? 0) >= 8) {
      score = Math.min(100, Math.max(score, score + 15))
      reasons.push(`同码段集中(${qrBallots.get(qrNonce)!.size}票)`)
    }
    ballotScoreMap.set(ballot.id, Math.min(100, score))
    ballotReasonsMap.set(ballot.id, Array.from(new Set(reasons)).slice(0, 6))
  }

  return { ballotScoreMap, ballotReasonsMap, latestQrByBallot }
}

/**
 * 记录前置硬拦的脚本/异常请求。同 IP 1 分钟内超过 30 条 blocked 日志时静默跳过，
 * 避免脚本并发刷接口造成日志表写放大。
 */
export function recordBlockedPopularityAttempt(
  client: DatabaseClient,
  eventId: string,
  input: {
    blockCode: string
    deviceHash: string
    ipHash: string | null
    envHash: string | null
    qrNonce: string | null
    singerId: string | null
    uaSummary: string
    cookiePresent: boolean
    dwellMs: number | null
  }
): void {
  const now = Date.now()
  if (input.ipHash) {
    const recentBlocked = client.sqlite.prepare(
      `SELECT count(*) AS cnt FROM competition_popularity_vote_logs
       WHERE event_id = ? AND ip_hash = ? AND action = 'blocked' AND created_at > ?`
    ).get(eventId, input.ipHash, now - BLOCKED_LOG_RATE_WINDOW_MS) as { cnt: number } | undefined
    if (Number(recentBlocked?.cnt ?? 0) >= BLOCKED_LOG_MAX_PER_IP_PER_MINUTE) return
  }

  client.sqlite.transaction(() => {
    const seqRow = client.sqlite.prepare(
      'SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM competition_popularity_vote_logs WHERE event_id = ?'
    ).get(eventId) as { maxSeq: number } | undefined
    const seq = Number(seqRow?.maxSeq ?? 0) + 1
    client.db.insert(competitionPopularityVoteLogs).values({
      id: randomUUID(),
      eventId,
      seq,
      ballotId: null,
      singerId: input.singerId,
      prevSingerId: null,
      action: 'blocked',
      blockCode: input.blockCode,
      deviceHash: input.deviceHash,
      ipHash: input.ipHash,
      envHash: input.envHash,
      qrNonce: input.qrNonce,
      uaSummary: input.uaSummary.slice(0, 64),
      cookiePresent: input.cookiePresent ? 1 : 0,
      dwellMs: input.dwellMs,
      suspicionScore: 100,
      suspicionReasonsJson: JSON.stringify([`前置拦截:${input.blockCode}`]),
      createdAt: now
    }).run()
  })()
}

export function moderatePopularityBallots(
  client: DatabaseClient,
  eventId: string,
  adminId: string | null,
  input: { mode: 'void' | 'restore' | 'release', ballotIds: string[], reason?: string }
): { updatedCount: number } {
  const uniqueIds = Array.from(new Set(input.ballotIds)).filter(Boolean)
  if (uniqueIds.length === 0) return { updatedCount: 0 }

  const now = Date.now()
  const reason = (input.reason || '').trim() || (input.mode === 'void' ? '后台风控作废' : null)
  const result = input.mode === 'void'
    ? client.db.update(competitionPopularityBallots).set({
        voided: 1,
        quarantined: 0,
        quarantinedReason: null,
        voidedReason: reason,
        voidedAt: now,
        voidedBy: adminId,
        updatedAt: now
      }).where(and(
        eq(competitionPopularityBallots.eventId, eventId),
        inArray(competitionPopularityBallots.id, uniqueIds)
      )).run()
    : client.db.update(competitionPopularityBallots).set({
        voided: 0,
        quarantined: 0,
        quarantinedReason: null,
        voidedReason: null,
        voidedAt: null,
        voidedBy: 'admin-restored',
        updatedAt: now
      }).where(and(
        eq(competitionPopularityBallots.eventId, eventId),
        inArray(competitionPopularityBallots.id, uniqueIds)
      )).run()

  return { updatedCount: Number(result.changes ?? 0) }
}

export function computePopularityGuardReport(
  client: DatabaseClient,
  eventId: string,
  options: PopularityAuditQueryOptions = {}
): CompetitionPopularityAuditReport {
  const candidates = listPopularityCandidates(client, eventId)
  const candidateNameById = new Map(candidates.map(c => [c.singerId, c.name]))
  const ballots = client.db.select().from(competitionPopularityBallots)
    .where(eq(competitionPopularityBallots.eventId, eventId))
    .all()
  const ballotById = new Map(ballots.map(b => [b.id, b]))

  const logsAsc = client.db.select().from(competitionPopularityVoteLogs)
    .where(eq(competitionPopularityVoteLogs.eventId, eventId))
    .orderBy(competitionPopularityVoteLogs.seq)
    .all()

  const { ballotScoreMap, ballotReasonsMap, latestQrByBallot } = buildRetrospectiveBoosts(ballots, logsAsc)

  // 1. 选手刷票预估与排名对比
  const ballotsBySinger = new Map<string, BallotRow[]>()
  for (const ballot of ballots) {
    const list = ballotsBySinger.get(ballot.singerId) ?? []
    list.push(ballot)
    ballotsBySinger.set(ballot.singerId, list)
  }

  let totalExpectedBrushActive = 0
  let suspectValidVotes = 0
  let watchValidVotes = 0
  let validVotes = 0
  let quarantinedVotes = 0
  let voidedVotes = 0

  const baseEstimates = candidates.map((candidate) => {
    const singerBallots = ballotsBySinger.get(candidate.singerId) ?? []
    const nonVoided = singerBallots.filter(b => Number(b.voided) === 0)
    const active = nonVoided.filter(b => Number(b.quarantined) === 0)
    const quarantined = nonVoided.length - active.length
    const voided = singerBallots.length - nonVoided.length
    validVotes += active.length
    quarantinedVotes += quarantined
    voidedVotes += voided

    let activeBrushProbSum = 0
    let suspectCount = 0
    let watchCount = 0
    const reasonCounter = new Map<string, number>()

    for (const ballot of active) {
      const score = ballotScoreMap.get(ballot.id) ?? Number(ballot.suspicionScore ?? 0)
      if (score >= 60) suspectCount += 1
      else if (score >= 30) watchCount += 1
      activeBrushProbSum += probabilityFromScore(score)
      for (const reason of ballotReasonsMap.get(ballot.id) ?? []) {
        reasonCounter.set(reason, (reasonCounter.get(reason) ?? 0) + 1)
      }
    }
    for (const ballot of nonVoided) {
      if (Number(ballot.quarantined) !== 1) continue
      const score = ballotScoreMap.get(ballot.id) ?? Number(ballot.suspicionScore ?? 0)
      if (score >= 60) suspectCount += 1
      else if (score >= 30) watchCount += 1
      for (const reason of ballotReasonsMap.get(ballot.id) ?? []) {
        reasonCounter.set(reason, (reasonCounter.get(reason) ?? 0) + 1)
      }
    }

    suspectValidVotes += suspectCount
    watchValidVotes += watchCount
    totalExpectedBrushActive += activeBrushProbSum

    const activeBrushEst = Math.min(active.length, Math.round(activeBrushProbSum))
    const estimatedRealVotes = Math.max(0, active.length - activeBrushEst)
    const estimatedBrushVotes = activeBrushEst + quarantined + voided
    const denominator = active.length + quarantined + voided
    const brushRatePercent = denominator > 0 ? Math.round((estimatedBrushVotes / denominator) * 1000) / 10 : 0
    const topReasons = Array.from(reasonCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => `${reason}(${count})`)

    return {
      singerId: candidate.singerId,
      number: candidate.number,
      name: candidate.name,
      validVotes: active.length,
      quarantinedVotes: quarantined,
      voidedVotes: voided,
      suspectVotes: suspectCount,
      watchVotes: watchCount,
      estimatedBrushVotes,
      estimatedRealVotes,
      estimatedRealPercent: 0,
      brushRatePercent,
      rawRank: 0,
      estimatedRealRank: 0,
      topReasons
    } satisfies CompetitionPopularitySingerEstimate
  })

  const totalRealVotes = baseEstimates.reduce((sum, item) => sum + item.estimatedRealVotes, 0)
  for (const item of baseEstimates) {
    item.estimatedRealPercent = totalRealVotes > 0
      ? Math.round((item.estimatedRealVotes / totalRealVotes) * 1000) / 10
      : 0
  }

  const byRaw = [...baseEstimates].sort((a, b) => b.validVotes - a.validVotes || a.number - b.number)
  byRaw.forEach((item, idx) => {
    item.rawRank = idx + 1
  })
  const byReal = [...baseEstimates].sort((a, b) => b.estimatedRealVotes - a.estimatedRealVotes || a.number - b.number)
  byReal.forEach((item, idx) => {
    item.estimatedRealRank = idx + 1
  })

  const singerEstimates = [...baseEstimates].sort((a, b) => b.validVotes - a.validVotes || b.estimatedRealVotes - a.estimatedRealVotes || a.number - b.number)

  // 2. 时间脉冲序列
  const bucketMs = selectTimelineBucketSize(logsAsc)
  const timelineMap = new Map<number, CompetitionPopularityTimelineBucket>()
  for (const log of logsAsc) {
    const startAt = Math.floor(Number(log.createdAt) / bucketMs) * bucketMs
    let bucket = timelineMap.get(startAt)
    if (!bucket) {
      bucket = {
        startAt,
        label: formatTimeBucketLabel(startAt),
        normalCount: 0,
        suspectCount: 0,
        blockedCount: 0,
        totalCount: 0
      }
      timelineMap.set(startAt, bucket)
    }
    if (log.action === 'blocked') {
      bucket.blockedCount += 1
    } else {
      const ballotScore = log.ballotId ? (ballotScoreMap.get(log.ballotId) ?? Number(log.suspicionScore ?? 0)) : Number(log.suspicionScore ?? 0)
      if (ballotScore >= 60) bucket.suspectCount += 1
      else bucket.normalCount += 1
    }
    bucket.totalCount += 1
  }
  const timeline = Array.from(timelineMap.values())
    .sort((a, b) => a.startAt - b.startAt)
    .slice(-36)

  // 3. 页面停留分布 & UA 分布
  const dwellCounts = DWELL_BUCKETS.map(bucket => ({ label: bucket.label, count: 0, suspectCount: 0 }))
  const uaCounter = new Map<string, { count: number, suspectCount: number }>()
  for (const log of logsAsc) {
    const effective = log.action === 'blocked'
      ? 100
      : (log.ballotId ? (ballotScoreMap.get(log.ballotId) ?? Number(log.suspicionScore ?? 0)) : Number(log.suspicionScore ?? 0))
    const isSuspect = effective >= 60

    if (typeof log.dwellMs === 'number' && Number.isFinite(log.dwellMs)) {
      const idx = DWELL_BUCKETS.findIndex(b => log.dwellMs! >= b.min && log.dwellMs! < b.max)
      if (idx >= 0 && dwellCounts[idx]) {
        dwellCounts[idx]!.count += 1
        if (isSuspect) dwellCounts[idx]!.suspectCount += 1
      }
    }

    const ua = log.uaSummary || 'unknown'
    const entry = uaCounter.get(ua) ?? { count: 0, suspectCount: 0 }
    entry.count += 1
    if (isSuspect) entry.suspectCount += 1
    uaCounter.set(ua, entry)
  }
  const uaDistribution: CompetitionPopularityDistributionItem[] = Array.from(uaCounter.entries())
    .map(([label, stats]) => ({ label, count: stats.count, suspectCount: stats.suspectCount }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // 4. 可疑聚集簇（IP / 硬件环境 / 二维码批次）
  const clusters: CompetitionPopularityClusterItem[] = []
  const collectClusters = (kind: 'ip' | 'env' | 'qr' | 'fp', extractKey: (b: BallotRow) => string | null) => {
    const grouped = new Map<string, BallotRow[]>()
    for (const ballot of ballots) {
      const key = extractKey(ballot)
      if (!key) continue
      const list = grouped.get(key) ?? []
      list.push(ballot)
      grouped.set(key, list)
    }
    for (const [key, list] of grouped.entries()) {
      const minThreshold = kind === 'qr' ? 5 : (kind === 'fp' ? 4 : 2)
      if (list.length < minThreshold) continue
      const singerCounts = new Map<string, number>()
      let validCount = 0
      let quarantinedCount = 0
      let voidedCount = 0
      let maxScore = 0
      let latestAt = 0
      for (const b of list) {
        if (Number(b.voided) === 1) voidedCount += 1
        else if (Number(b.quarantined) === 1) quarantinedCount += 1
        else validCount += 1
        maxScore = Math.max(maxScore, ballotScoreMap.get(b.id) ?? Number(b.suspicionScore ?? 0))
        latestAt = Math.max(latestAt, Number(b.updatedAt ?? b.createdAt ?? 0))
        singerCounts.set(b.singerId, (singerCounts.get(b.singerId) ?? 0) + 1)
      }
      const [topSingerId = '', topSingerVotes = 0] = Array.from(singerCounts.entries())
        .sort((a, b) => b[1] - a[1])[0] ?? []
      clusters.push({
        kind,
        keyLabel: shortTag(kind, key),
        ballotCount: list.length,
        validCount,
        quarantinedCount,
        voidedCount,
        maxSuspicionScore: maxScore,
        topSingerName: candidateNameById.get(topSingerId) ?? '未知选手',
        topSingerVotes,
        ballotIds: list.map(b => b.id),
        latestAt
      })
    }
  }
  collectClusters('ip', b => b.ipHash ?? null)
  collectClusters('env', b => b.envHash ?? null)
  collectClusters('fp', b => b.clientFp ?? null)
  collectClusters('qr', b => latestQrByBallot.get(b.id) ?? null)

  clusters.sort((a, b) => b.maxSuspicionScore - a.maxSuspicionScore || b.ballotCount - a.ballotCount || b.latestAt - a.latestAt)

  // 5. 流水日志投影与筛选
  const keyword = (options.q || '').trim().toLowerCase()
  const filter = options.filter ?? 'all'
  const limit = Math.min(500, Math.max(20, options.limit ?? 150))

  const mappedLogsDesc: CompetitionPopularityVoteLogItem[] = []
  for (let idx = logsAsc.length - 1; idx >= 0; idx -= 1) {
    const log = logsAsc[idx]!
    const ballot = log.ballotId ? (ballotById.get(log.ballotId) ?? null) : null
    const effectiveScore = log.action === 'blocked'
      ? 100
      : Math.max(Number(log.suspicionScore ?? 0), ballot ? (ballotScoreMap.get(ballot.id) ?? 0) : 0)
    const mergedReasons = Array.from(new Set([
      ...parseStringArray(log.suspicionReasonsJson),
      ...(ballot ? (ballotReasonsMap.get(ballot.id) ?? []) : [])
    ])).slice(0, 6)
    const ballotVoided = ballot ? Number(ballot.voided) === 1 : false
    const ballotQuarantined = ballot ? (!ballotVoided && Number(ballot.quarantined) === 1) : false
    const riskLevel: CompetitionPopularityRiskLevel = log.action === 'blocked' ? 'suspect' : riskLevelOf(effectiveScore)

    if (options.singerId && log.singerId !== options.singerId) continue
    if (filter === 'quarantined' && !ballotQuarantined) continue
    if (filter === 'suspect' && !(riskLevel === 'suspect' && log.action !== 'blocked')) continue
    if (filter === 'watch' && riskLevel !== 'watch') continue
    if (filter === 'voided' && !ballotVoided) continue
    if (filter === 'blocked' && log.action !== 'blocked') continue

    const singerName = log.singerId ? (candidateNameById.get(log.singerId) ?? '未知选手') : '—'
    const prevSingerName = log.prevSingerId ? (candidateNameById.get(log.prevSingerId) ?? '未知选手') : null
    const deviceTag = shortTag('dev', log.deviceHash)
    const ipTag = log.ipHash ? shortTag('ip', log.ipHash) : null
    const envTag = log.envHash ? shortTag('env', log.envHash) : null
    const qrNonceTag = log.qrNonce ? shortTag('qr', log.qrNonce) : null

    if (keyword) {
      const haystack = [
        String(log.seq),
        singerName,
        deviceTag,
        ipTag ?? '',
        envTag ?? '',
        qrNonceTag ?? '',
        log.uaSummary,
        log.blockCode ?? '',
        mergedReasons.join(' ')
      ].join(' ').toLowerCase()
      if (!haystack.includes(keyword)) continue
    }

    mappedLogsDesc.push({
      id: log.id,
      seq: Number(log.seq),
      ballotId: log.ballotId,
      singerId: log.singerId,
      singerName,
      prevSingerId: log.prevSingerId,
      prevSingerName,
      action: log.action,
      blockCode: log.blockCode,
      deviceTag,
      ipTag,
      envTag,
      qrNonceTag,
      uaSummary: log.uaSummary,
      cookiePresent: Number(log.cookiePresent) === 1,
      dwellMs: log.dwellMs == null ? null : Number(log.dwellMs),
      suspicionScore: Number(log.suspicionScore),
      effectiveScore,
      riskLevel,
      suspicionReasons: mergedReasons,
      ballotQuarantined,
      ballotQuarantinedReason: ballot?.quarantinedReason ?? null,
      ballotVoided,
      ballotVoidedReason: ballot?.voidedReason ?? null,
      wechatVerified: Boolean(ballot?.voterOpenidHash),
      createdAt: Number(log.createdAt)
    })

    if (mappedLogsDesc.length >= limit) break
  }

  // 6. 记忆 AI 巡检记录与 Rolling Memory
  const inspectionRows = client.db.select().from(competitionPopularityInspections)
    .where(eq(competitionPopularityInspections.eventId, eventId))
    .orderBy(desc(competitionPopularityInspections.createdAt))
    .limit(30)
    .all()

  const logBySeq = new Map(logsAsc.map(l => [Number(l.seq), l]))
  const inspections: CompetitionPopularityInspectionItem[] = inspectionRows.map((row: InspectionRow) => {
    const flaggedSeqs = parseNumberArray(row.flaggedSeqsJson)
    const flaggedBallotIds = Array.from(new Set(
      flaggedSeqs
        .map(seq => logBySeq.get(seq)?.ballotId ?? null)
        .filter((id): id is string => Boolean(id))
    ))
    return {
      id: row.id,
      mode: row.mode,
      fromSeq: Number(row.fromSeq),
      toSeq: Number(row.toSeq),
      targetLogId: row.targetLogId,
      targetSingerId: row.targetSingerId,
      targetSingerName: row.targetSingerId ? (candidateNameById.get(row.targetSingerId) ?? null) : null,
      logCount: Number(row.logCount),
      verdict: row.verdict,
      confidence: Number(row.confidence),
      estimatedBrushInBatch: Number(row.estimatedBrushInBatch),
      headline: row.headline,
      findings: parseStringArray(row.findingsJson),
      flaggedSeqs,
      flaggedBallotIds,
      memoryNote: row.memoryNote,
      model: row.model,
      triggerSource: row.triggerSource,
      autoVoidedCount: Number(row.autoVoidedCount ?? 0),
      autoReleasedCount: Number(row.autoReleasedCount ?? 0),
      createdAt: Number(row.createdAt)
    }
  })

  const rollingMemory: CompetitionPopularityMemoryEntry[] = inspectionRows
    .filter(row => row.memoryNote.trim().length > 0)
    .slice(0, 8)
    .reverse()
    .map(row => ({
      id: row.id,
      mode: row.mode,
      fromSeq: Number(row.fromSeq),
      toSeq: Number(row.toSeq),
      verdict: row.verdict,
      confidence: Number(row.confidence),
      estimatedBrushInBatch: Number(row.estimatedBrushInBatch),
      memoryNote: row.memoryNote,
      createdAt: Number(row.createdAt)
    }))

  const latestSeq = logsAsc.length > 0 ? Number(logsAsc[logsAsc.length - 1]!.seq) : 0
  const lastAutoInspectedSeq = inspectionRows
    .filter(row => row.mode === 'auto-batch')
    .reduce((max, row) => Math.max(max, Number(row.toSeq)), 0)
  const pendingAutoCount = Math.max(0, latestSeq - lastAutoInspectedSeq)
  const blockedAttempts = logsAsc.filter(log => log.action === 'blocked').length
  const totalEstimatedBrush = Math.round(totalExpectedBrushActive) + quarantinedVotes + voidedVotes
  const totalDenominator = validVotes + quarantinedVotes + voidedVotes

  return {
    overview: {
      validVotes,
      quarantinedVotes,
      voidedVotes,
      blockedAttempts,
      totalLogCount: logsAsc.length,
      suspectValidVotes,
      watchValidVotes,
      estimatedBrushVotes: totalEstimatedBrush,
      estimatedRealVotes: totalRealVotes,
      estimatedBrushRatePercent: totalDenominator > 0
        ? Math.round((totalEstimatedBrush / totalDenominator) * 1000) / 10
        : 0,
      latestSeq,
      lastAutoInspectedSeq,
      pendingAutoCount,
      autoBatchSize: POPULARITY_AUTO_BATCH_SIZE
    },
    singerEstimates,
    timeline,
    dwellDistribution: dwellCounts,
    uaDistribution,
    clusters: clusters.slice(0, 12),
    logs: mappedLogsDesc,
    inspections,
    rollingMemory,
    aiConfigured: Boolean(options.aiConfigured),
    inspectionJob: options.inspectionJob ?? null,
    generatedAt: Date.now()
  }
}
