import { and, count, desc, eq, gt, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import {
  adminUsers,
  auditLogs,
  chatMembers,
  chatMessages,
  chatMutes,
  chatRooms,
  userSessions,
  users,
  visitorBans,
  visitorEvents,
  visitors
} from '../../database/schema'
import { serializeAppUser } from '../users/service'

const DAY_MS = 24 * 60 * 60 * 1000

function countWhere(client: DatabaseClient, table: any, where?: any): number {
  const row = where
    ? client.db.select({ value: count() }).from(table).where(where).get()
    : client.db.select({ value: count() }).from(table).get()
  return Number(row?.value ?? 0)
}


function shortUa(ua: string | null | undefined, keep = 64): string {
  const text = (ua || '').trim()
  if (!text) return 'unknown'
  return text.length <= keep ? text : text.slice(0, keep) + '…'
}

function isBanEffectivelyActive(
  ban: { isActive: boolean; expiresAt: number | string | null },
  now: number
): boolean {
  if (!ban.isActive) return false
  if (ban.expiresAt == null || ban.expiresAt === '') return true
  const exp = typeof ban.expiresAt === 'number' ? ban.expiresAt : Date.parse(String(ban.expiresAt))
  if (!Number.isFinite(exp)) return true
  return exp > now
}

function deltaValue(current: number, previous: number): number {
  return current - previous
}

function scoreRisk(factors: Array<{ code: string; points: number; message: string }>) {
  const riskScore = factors.reduce((sum, f) => sum + f.points, 0)
  const riskLevel: 'high' | 'medium' | 'low' | 'info' =
    riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : riskScore >= 15 ? 'low' : 'info'
  return {
    riskScore,
    riskLevel,
    riskFactors: factors.map(f => ({ code: f.code, points: f.points, message: f.message }))
  }
}

function buildBurstWindows(
  rows: Array<{ createdAt: number }>,
  bucketMs = 10 * 60 * 1000,
  limit = 6
) {
  const map = new Map<number, number>()
  for (const row of rows) {
    const ts = Number(row.createdAt)
    if (!Number.isFinite(ts)) continue
    const bucket = Math.floor(ts / bucketMs) * bucketMs
    map.set(bucket, (map.get(bucket) || 0) + 1)
  }
  return [...map.entries()]
    .map(([startAt, count]) => ({
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(startAt + bucketMs).toISOString(),
      count
    }))
    .sort((a, b) => b.count - a.count || Date.parse(b.startAt) - Date.parse(a.startAt))
    .slice(0, limit)
}

function buildPathTransitions(
  rows: Array<{ path: string | null | undefined; createdAt: number }>,
  limit = 8
) {
  const sorted = [...rows]
    .filter(row => Number.isFinite(Number(row.createdAt)))
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
  const map = new Map<string, number>()
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]
    const current = sorted[i]
    if (!previous || !current) continue
    const from = ((previous.path || '/').trim() || '/')
    const to = ((current.path || '/').trim() || '/')
    if (from === to) continue
    const key = `${from}\t${to}`
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split('\t')
      return { from, to, transition: `${from} → ${to}`, count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function buildPathSequence(
  rows: Array<{ path: string | null | undefined; action?: string | null; createdAt: number }>,
  limit = 12
) {
  return [...rows]
    .filter(row => Number.isFinite(Number(row.createdAt)))
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    .slice(0, limit)
    .map(row => ({
      path: (row.path || '/').trim() || '/',
      action: row.action || 'unknown',
      createdAt: new Date(Number(row.createdAt)).toISOString()
    }))
    .reverse()
}

function percentileRank(value: number, population: number[]): number {
  if (!population.length) return 0
  const below = population.filter(v => v < value).length
  return Math.round((below / population.length) * 100)
}

function riskConfidence(factorCount: number, evidenceEvents: number): 'high' | 'medium' | 'low' {
  if (factorCount <= 0) return 'low'
  if (factorCount >= 3 && evidenceEvents >= 30) return 'high'
  if (factorCount >= 2 || evidenceEvents >= 10) return 'medium'
  return 'low'
}

function buildSessions(
  rows: Array<{
    path: string | null | undefined
    action?: string | null
    ip?: string | null
    createdAt: number
  }>,
  idleMs = 30 * 60 * 1000,
  limit = 12
) {
  const sorted = [...rows]
    .filter(row => Number.isFinite(Number(row.createdAt)))
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))

  const groups: typeof sorted[] = []
  for (const row of sorted) {
    const current = groups.at(-1)
    const previous = current?.at(-1)
    if (!current || !previous || Number(row.createdAt) - Number(previous.createdAt) > idleMs) {
      groups.push([row])
    } else {
      current.push(row)
    }
  }

  return groups.map((group, index) => {
    const first = group[0]
    const last = group[group.length - 1]
    if (!first || !last) return null
    const startAt = Number(first.createdAt)
    const endAt = Number(last.createdAt)
    const paths = [...new Set(group.map(row => (row.path || '/').trim() || '/'))]
    const actions = [...new Set(group.map(row => row.action || 'unknown'))]
    const ips = [...new Set(group.map(row => row.ip).filter(Boolean))] as string[]
    return {
      id: `session-${index + 1}-${startAt}`,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      durationSeconds: Math.max(0, Math.round((endAt - startAt) / 1000)),
      eventCount: group.length,
      uniquePathCount: paths.length,
      entryPath: paths[0] || '/',
      exitPath: paths.at(-1) || '/',
      actionCount: actions.length,
      ips
    }
  }).filter((session): session is NonNullable<typeof session> => Boolean(session))
    .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
    .slice(0, limit)
}

function normalizeNetworkPrefix(rawIp: string | null | undefined): string {
  const ip = (rawIp || '').trim()
  if (!ip) return ''
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part))) {
      return `${parts.slice(0, 3).join('.')}.0/24`
    }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean)
    return `${parts.slice(0, 4).join(':')}::/64`
  }
  return ip
}

function buildNetworkClusters(
  rows: Array<{
    ip: string | null | undefined
    visitorId?: string | null
    userId?: string | null
    city?: string | null
    path?: string | null
    createdAt: number
  }>,
  limit = 10
) {
  const clusters = new Map<string, {
    prefix: string
    eventCount: number
    ips: Set<string>
    visitors: Set<string>
    users: Set<string>
    cities: Map<string, number>
    paths: Map<string, number>
    firstAt: number
    lastAt: number
  }>()

  for (const row of rows) {
    const ip = (row.ip || '').trim()
    const prefix = normalizeNetworkPrefix(ip)
    const createdAt = Number(row.createdAt)
    if (!prefix || !Number.isFinite(createdAt)) continue
    let cluster = clusters.get(prefix)
    if (!cluster) {
      cluster = {
        prefix,
        eventCount: 0,
        ips: new Set(),
        visitors: new Set(),
        users: new Set(),
        cities: new Map(),
        paths: new Map(),
        firstAt: createdAt,
        lastAt: createdAt
      }
      clusters.set(prefix, cluster)
    }
    cluster.eventCount += 1
    cluster.ips.add(ip)
    if (row.visitorId) cluster.visitors.add(row.visitorId)
    if (row.userId) cluster.users.add(row.userId)
    const city = (row.city || '').trim()
    const path = (row.path || '/').trim() || '/'
    if (city) cluster.cities.set(city, (cluster.cities.get(city) || 0) + 1)
    cluster.paths.set(path, (cluster.paths.get(path) || 0) + 1)
    cluster.firstAt = Math.min(cluster.firstAt, createdAt)
    cluster.lastAt = Math.max(cluster.lastAt, createdAt)
  }

  return [...clusters.values()].map(cluster => {
    const topCity = [...cluster.cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    const topPath = [...cluster.paths.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '/'
    const riskScore = Math.min(100,
      (cluster.visitors.size >= 5 ? 28 : cluster.visitors.size >= 3 ? 18 : 0)
      + (cluster.ips.size >= 5 ? 22 : cluster.ips.size >= 2 ? 10 : 0)
      + (cluster.users.size >= 3 ? 18 : cluster.users.size ? 6 : 0)
      + (cluster.eventCount >= 200 ? 22 : cluster.eventCount >= 80 ? 12 : 0)
    )
    return {
      prefix: cluster.prefix,
      eventCount: cluster.eventCount,
      ipCount: cluster.ips.size,
      visitorCount: cluster.visitors.size,
      userCount: cluster.users.size,
      topCity,
      topPath,
      firstAt: new Date(cluster.firstAt).toISOString(),
      lastAt: new Date(cluster.lastAt).toISOString(),
      riskScore,
      riskLevel: riskScore >= 55 ? 'high' : riskScore >= 30 ? 'medium' : riskScore >= 12 ? 'low' : 'info'
    }
  }).filter(row => row.eventCount >= 2)
    .sort((a, b) => b.riskScore - a.riskScore || b.eventCount - a.eventCount)
    .slice(0, limit)
}

function buildAnomalyBaseline(current: number, historical: number[]) {
  const values = historical.filter(value => Number.isFinite(value) && value >= 0)
  const sorted = [...values].sort((a, b) => a - b)
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0
  const variance = values.length
    ? values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length
    : 0
  const deviation = Math.sqrt(variance)
  const zScore = deviation > 0 ? (current - average) / deviation : current > average ? 3 : 0
  const multiplier = average > 0 ? current / average : current > 0 ? current : 0
  const status: 'critical' | 'elevated' | 'normal' =
    zScore >= 3 || multiplier >= 4 ? 'critical' : zScore >= 2 || multiplier >= 2 ? 'elevated' : 'normal'
  return {
    current,
    sampleSize: values.length,
    average: Math.round(average * 10) / 10,
    median,
    p95,
    standardDeviation: Math.round(deviation * 10) / 10,
    zScore: Math.round(zScore * 100) / 100,
    multiplier: Math.round(multiplier * 100) / 100,
    status
  }
}

function buildEvidenceLedger(
  factors: Array<{ code: string; points: number; message: string }>,
  context: Array<{ code: string; message: string; weight?: number }> = []
) {
  return [
    ...factors.map(factor => ({
      code: factor.code,
      kind: 'risk_factor' as const,
      strength: factor.points >= 25 ? 'strong' as const : factor.points >= 10 ? 'moderate' as const : 'weak' as const,
      weight: factor.points,
      message: factor.message
    })),
    ...context.map(item => ({
      code: item.code,
      kind: 'context' as const,
      strength: (item.weight || 0) >= 20 ? 'strong' as const : (item.weight || 0) >= 8 ? 'moderate' as const : 'weak' as const,
      weight: item.weight || 0,
      message: item.message
    }))
  ].sort((a, b) => b.weight - a.weight)
}

function buildInvestigationPlaybook(input: {
  riskLevel: string
  isBanned: boolean
  hasAccount?: boolean
  hasCluster?: boolean
  auditHref: string
  visitorHref: string
}) {
  return [
    {
      step: 1,
      code: 'VERIFY_EVIDENCE',
      status: 'recommended',
      title: '确认判断依据与操作记录',
      detail: '先确认访问高峰、访问顺序、地点和设备变化是否一致。',
      href: input.visitorHref
    },
    {
      step: 2,
      code: 'REVIEW_CLUSTER',
      status: input.hasCluster ? 'recommended' : 'optional',
      title: '核对同一网络的关联对象',
      detail: input.hasCluster ? '同一或相近网络下存在关联对象，建议先排除校园网等共享网络。' : '当前未发现明显关联，可继续观察。',
      href: input.visitorHref
    },
    {
      step: 3,
      code: 'CONTAIN_RISK',
      status: input.isBanned ? 'completed' : input.riskLevel === 'high' ? 'recommended' : 'optional',
      title: input.isBanned ? '限制措施已生效' : '选择最小影响范围限制',
      detail: input.hasAccount ? '优先账号级或访客级限制，确认属于单一来源后再扩大到 IP。' : '优先访客级限制，避免直接封禁共享出口 IP。',
      href: input.visitorHref
    },
    {
      step: 4,
      code: 'AUDIT_AND_CLOSE',
      status: 'recommended',
      title: '记录原因并审计闭环',
      detail: '处置时填写原因，随后检查管理员操作日志与到期时间。',
      href: input.auditHref
    }
  ]
}


export function getSecuritySnapshot(client: DatabaseClient) {
  const now = Date.now()
  const since24h = now - DAY_MS
  const since7d = now - DAY_MS * 7

  const activeBans = countWhere(client, visitorBans, eq(visitorBans.isActive, true))
  const inactiveBans = countWhere(client, visitorBans, eq(visitorBans.isActive, false))
  const activeMutes = countWhere(
    client,
    chatMutes,
    and(
      eq(chatMutes.isActive, true),
      or(isNull(chatMutes.expiresAt), gt(chatMutes.expiresAt, now))
    )
  )
  const mutedRooms = countWhere(client, chatRooms, eq(chatRooms.isMutedAll, true))
  const totalUsers = countWhere(client, users)
  const bannedUsers = countWhere(client, users, eq(users.status, 'banned'))
  const disabledUsers = countWhere(client, users, eq(users.status, 'disabled'))
  const totalVisitors = countWhere(client, visitors)
  const totalMessages = countWhere(client, chatMessages)
  const deletedMessages = countWhere(client, chatMessages, isNotNull(chatMessages.deletedAt))
  const auditTotal = countWhere(client, auditLogs)

  const visitors24h = countWhere(client, visitors, gt(visitors.lastSeenAt, since24h))
  const newVisitors24h = countWhere(client, visitors, gt(visitors.firstSeenAt, since24h))
  const events24h = countWhere(client, visitorEvents, gt(visitorEvents.createdAt, since24h))
  const bans24h = countWhere(client, visitorBans, gt(visitorBans.createdAt, since24h))
  const mutes24h = countWhere(client, chatMutes, gt(chatMutes.createdAt, since24h))
  const messages24h = countWhere(client, chatMessages, gt(chatMessages.createdAt, since24h))
  const audit24h = countWhere(client, auditLogs, gt(auditLogs.createdAt, since24h))
  const logins24h = countWhere(
    client,
    auditLogs,
    and(eq(auditLogs.action, 'admin.login'), gt(auditLogs.createdAt, since24h))
  )

  const since48h = now - DAY_MS * 2
  const since1h = now - 60 * 60 * 1000
  const visitorsPrev24h = countWhere(
    client,
    visitors,
    and(gt(visitors.lastSeenAt, since48h), lt(visitors.lastSeenAt, since24h))
  )
  const newVisitorsPrev24h = countWhere(
    client,
    visitors,
    and(gt(visitors.firstSeenAt, since48h), lt(visitors.firstSeenAt, since24h))
  )
  const eventsPrev24h = countWhere(
    client,
    visitorEvents,
    and(gt(visitorEvents.createdAt, since48h), lt(visitorEvents.createdAt, since24h))
  )
  const bansPrev24h = countWhere(
    client,
    visitorBans,
    and(gt(visitorBans.createdAt, since48h), lt(visitorBans.createdAt, since24h))
  )
  const mutesPrev24h = countWhere(
    client,
    chatMutes,
    and(gt(chatMutes.createdAt, since48h), lt(chatMutes.createdAt, since24h))
  )
  const messagesPrev24h = countWhere(
    client,
    chatMessages,
    and(gt(chatMessages.createdAt, since48h), lt(chatMessages.createdAt, since24h))
  )
  const auditPrev24h = countWhere(
    client,
    auditLogs,
    and(gt(auditLogs.createdAt, since48h), lt(auditLogs.createdAt, since24h))
  )
  const loginsPrev24h = countWhere(
    client,
    auditLogs,
    and(
      eq(auditLogs.action, 'admin.login'),
      gt(auditLogs.createdAt, since48h),
      lt(auditLogs.createdAt, since24h)
    )
  )
  const events1h = countWhere(client, visitorEvents, gt(visitorEvents.createdAt, since1h))

  const visitors7d = countWhere(client, visitors, gt(visitors.lastSeenAt, since7d))
  const events7d = countWhere(client, visitorEvents, gt(visitorEvents.createdAt, since7d))
  const bans7d = countWhere(client, visitorBans, gt(visitorBans.createdAt, since7d))
  const mutes7d = countWhere(client, chatMutes, gt(chatMutes.createdAt, since7d))
  const messages7d = countWhere(client, chatMessages, gt(chatMessages.createdAt, since7d))
  const audit7d = countWhere(client, auditLogs, gt(auditLogs.createdAt, since7d))

  // Approximate banned visitors by scanning recent visitors against active bans
  // (same approach as listVisitors; keep cheap: only active ban values).
  const banRows = client.db.select({
    scope: visitorBans.scope,
    value: visitorBans.value
  }).from(visitorBans)
    .where(eq(visitorBans.isActive, true))
    .all()
  const bannedVisitorIds = new Set(banRows.filter(r => r.scope === 'visitor').map(r => r.value))
  const bannedIps = new Set(banRows.filter(r => r.scope === 'ip').map(r => r.value))
  const bannedUserIds = new Set(banRows.filter(r => r.scope === 'user').map(r => r.value))

  const visitorSample = client.db.select({
    id: visitors.id,
    lastIp: visitors.lastIp,
    userId: visitors.userId
  }).from(visitors).all()
  let bannedVisitors = 0
  for (const row of visitorSample) {
    if (
      bannedVisitorIds.has(row.id)
      || (row.lastIp && bannedIps.has(row.lastIp))
      || (row.userId && bannedUserIds.has(row.userId))
    ) {
      bannedVisitors += 1
    }
  }

  const topPaths = client.db.select({
    path: visitorEvents.path,
    value: count()
  }).from(visitorEvents)
    .where(gt(visitorEvents.createdAt, since7d))
    .groupBy(visitorEvents.path)
    .orderBy(desc(count()))
    .limit(8)
    .all()
    .map(row => ({ path: row.path || '/', count: Number(row.value) }))

  const topCities = client.db.select({
    city: visitors.lastCity,
    value: count()
  }).from(visitors)
    .where(and(isNotNull(visitors.lastCity), sql`trim(${visitors.lastCity}) != ''`))
    .groupBy(visitors.lastCity)
    .orderBy(desc(count()))
    .limit(8)
    .all()
    .map(row => ({ city: row.city || '未知', count: Number(row.value) }))

  const recentMutes = client.db.select({
    id: chatMutes.id,
    userId: chatMutes.userId,
    roomId: chatMutes.roomId,
    reason: chatMutes.reason,
    expiresAt: chatMutes.expiresAt,
    createdAt: chatMutes.createdAt,
    username: users.username,
    displayName: users.displayName,
    roomTitle: chatRooms.title
  }).from(chatMutes)
    .leftJoin(users, eq(chatMutes.userId, users.id))
    .leftJoin(chatRooms, eq(chatMutes.roomId, chatRooms.id))
    .where(and(
      eq(chatMutes.isActive, true),
      or(isNull(chatMutes.expiresAt), gt(chatMutes.expiresAt, now))
    ))
    .orderBy(desc(chatMutes.createdAt))
    .limit(6)
    .all()
    .map(row => ({
      id: row.id,
      userId: row.userId,
      roomId: row.roomId,
      reason: row.reason,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      username: row.username,
      displayName: row.displayName,
      roomTitle: row.roomTitle || (row.roomId ? '指定房间' : '全站')
    }))

  const recentAudit = client.db.select().from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(8)
    .all()
    .map(row => ({
      id: row.id,
      actorAdminId: row.actorAdminId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      createdAt: new Date(row.createdAt).toISOString()
    }))

  const topActions = client.db.select({
    action: visitorEvents.action,
    value: count()
  }).from(visitorEvents)
    .where(gt(visitorEvents.createdAt, since7d))
    .groupBy(visitorEvents.action)
    .orderBy(desc(count()))
    .limit(8)
    .all()
    .map(row => ({ action: row.action || 'unknown', count: Number(row.value) }))

  const topIps = client.db.select({
    ip: visitorEvents.ip,
    value: count()
  }).from(visitorEvents)
    .where(and(
      gt(visitorEvents.createdAt, since24h),
      isNotNull(visitorEvents.ip),
      sql`trim(${visitorEvents.ip}) != ''`
    ))
    .groupBy(visitorEvents.ip)
    .orderBy(desc(count()))
    .limit(8)
    .all()
    .map(row => ({ ip: row.ip || '—', count: Number(row.value) }))

  const topBanReasons = client.db.select({
    reason: visitorBans.reason,
    value: count()
  }).from(visitorBans)
    .where(and(
      eq(visitorBans.isActive, true),
      isNotNull(visitorBans.reason),
      sql`trim(${visitorBans.reason}) != ''`
    ))
    .groupBy(visitorBans.reason)
    .orderBy(desc(count()))
    .limit(6)
    .all()
    .map(row => ({ reason: row.reason || '未填写', count: Number(row.value) }))

  const hourBucketExpr = sql`cast((${visitorEvents.createdAt} / 3600000) as integer)`
  const hourlyRaw = client.db.select({
    bucket: hourBucketExpr,
    value: count()
  }).from(visitorEvents)
    .where(gt(visitorEvents.createdAt, since24h))
    .groupBy(hourBucketExpr)
    .all()

  const currentHour = Math.floor(now / 3600000)
  const hourlyMap = new Map(hourlyRaw.map(row => [Number(row.bucket), Number(row.value)]))
  const hourlyEvents = Array.from({ length: 24 }, (_, i) => {
    const bucket = currentHour - 23 + i
    return {
      hour: new Date(bucket * 3600000).toISOString(),
      count: hourlyMap.get(bucket) || 0
    }
  })

  const recentBans = client.db.select({
    id: visitorBans.id,
    scope: visitorBans.scope,
    value: visitorBans.value,
    reason: visitorBans.reason,
    isActive: visitorBans.isActive,
    expiresAt: visitorBans.expiresAt,
    bannedByAdminId: visitorBans.bannedByAdminId,
    createdAt: visitorBans.createdAt
  }).from(visitorBans)
    .where(eq(visitorBans.isActive, true))
    .orderBy(desc(visitorBans.createdAt))
    .limit(6)
    .all()
    .map(row => ({
      id: row.id,
      scope: row.scope,
      value: row.value,
      reason: row.reason,
      isActive: row.isActive,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      bannedByAdminId: row.bannedByAdminId,
      createdAt: new Date(row.createdAt).toISOString()
    }))

  const activeBanRows = client.db.select({
    id: visitorBans.id,
    isActive: visitorBans.isActive,
    expiresAt: visitorBans.expiresAt,
    scope: visitorBans.scope,
    value: visitorBans.value,
    reason: visitorBans.reason,
    bannedByAdminId: visitorBans.bannedByAdminId,
    createdAt: visitorBans.createdAt
  }).from(visitorBans)
    .where(eq(visitorBans.isActive, true))
    .all()

  let activeExpired = 0
  let expiringSoon24h = 0
  let permanentActive = 0
  let temporaryActive = 0
  for (const ban of activeBanRows) {
    if (!ban.isActive) continue
    if (ban.expiresAt == null) {
      permanentActive += 1
      continue
    }
    if (ban.expiresAt <= now) {
      activeExpired += 1
      continue
    }
    temporaryActive += 1
    if (ban.expiresAt <= now + DAY_MS) expiringSoon24h += 1
  }

  const banHygiene = {
    activeExpired,
    expiringSoon24h,
    permanentActive,
    temporaryActive
  }

  const ipClusterRaw = client.db.select({
    ip: visitorEvents.ip,
    eventCount: count(),
    visitorCount: sql<number>`count(distinct ${visitorEvents.visitorId})`
  }).from(visitorEvents)
    .where(and(
      gt(visitorEvents.createdAt, since24h),
      isNotNull(visitorEvents.ip),
      sql`trim(${visitorEvents.ip}) != ''`
    ))
    .groupBy(visitorEvents.ip)
    .orderBy(desc(sql`count(distinct ${visitorEvents.visitorId})`))
    .limit(12)
    .all()

  const ipClustersBase = ipClusterRaw
    .map(row => ({
      ip: row.ip || '',
      eventCount: Number(row.eventCount),
      visitorCount: Number(row.visitorCount)
    }))
    .filter(row => row.ip && row.visitorCount >= 2)
    .slice(0, 8)

  const suspiciousAgents = client.db.select({
    userAgent: visitorEvents.userAgent,
    eventCount: count(),
    visitorCount: sql<number>`count(distinct ${visitorEvents.visitorId})`
  }).from(visitorEvents)
    .where(and(
      gt(visitorEvents.createdAt, since7d),
      isNotNull(visitorEvents.userAgent),
      sql`trim(${visitorEvents.userAgent}) != ''`
    ))
    .groupBy(visitorEvents.userAgent)
    .orderBy(desc(count()))
    .limit(8)
    .all()
    .map(row => ({
      userAgent: shortUa(row.userAgent, 80),
      eventCount: Number(row.eventCount),
      visitorCount: Number(row.visitorCount)
    }))
    .filter(row => row.eventCount >= 20 || row.visitorCount >= 3)

  const adminActorRaw = client.db.select({
    actorAdminId: auditLogs.actorAdminId,
    value: count()
  }).from(auditLogs)
    .where(and(gt(auditLogs.createdAt, since7d), isNotNull(auditLogs.actorAdminId)))
    .groupBy(auditLogs.actorAdminId)
    .orderBy(desc(count()))
    .limit(8)
    .all()

  const adminActors = adminActorRaw.map((row) => {
    const admin = row.actorAdminId
      ? client.db.select({
        id: adminUsers.id,
        username: adminUsers.username,
        displayName: adminUsers.displayName
      }).from(adminUsers).where(eq(adminUsers.id, row.actorAdminId)).get()
      : null
    return {
      adminId: row.actorAdminId || '',
      username: admin?.username || null,
      displayName: admin?.displayName || null,
      auditCount: Number(row.value)
    }
  })

  const timelineItems: Array<{
    id: string
    kind: 'ban' | 'mute' | 'audit' | 'login'
    title: string
    subtitle: string
    createdAt: string
    href: string
  }> = []

  for (const ban of recentBans.slice(0, 6)) {
    timelineItems.push({
      id: `ban:${ban.id}`,
      kind: 'ban',
      title: `封禁 · ${ban.scope} · ${ban.value}`,
      subtitle: ban.reason || '无原因',
      createdAt: ban.createdAt,
      href: `/admin/bans?banId=${encodeURIComponent(ban.id)}`
    })
  }
  for (const mute of recentMutes.slice(0, 6)) {
    timelineItems.push({
      id: `mute:${mute.id}`,
      kind: 'mute',
      title: `禁言 · ${mute.displayName || mute.username || mute.userId}`,
      subtitle: `${mute.roomTitle || '全站/房间'} · ${mute.reason || '无原因'}`,
      createdAt: mute.createdAt,
      href: `/admin/chat?muteId=${encodeURIComponent(mute.id)}`
    })
  }
  for (const item of recentAudit.slice(0, 8)) {
    const kind = item.action === 'admin.login' ? 'login' as const : 'audit' as const
    timelineItems.push({
      id: `audit:${item.id}`,
      kind,
      title: item.action,
      subtitle: `${item.entityType}${item.entityId ? ` · ${item.entityId}` : ''}`,
      createdAt: item.createdAt,
      href: item.entityType
        ? `/admin/audit?entityType=${encodeURIComponent(item.entityType)}${item.entityId ? `&entityId=${encodeURIComponent(item.entityId)}` : ''}`
        : '/admin/audit'
    })
  }

  const opsTimeline = timelineItems
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 16)

  const multiVisitorIps = ipClustersBase.length
  const pulse = {
    events1h,
    multiVisitorIps,
    staleActiveBans: activeExpired
  }

  const previous24h = {
    visitorsActive: visitorsPrev24h,
    visitorsNew: newVisitorsPrev24h,
    visitorEvents: eventsPrev24h,
    bansCreated: bansPrev24h,
    mutesCreated: mutesPrev24h,
    messages: messagesPrev24h,
    auditEvents: auditPrev24h,
    adminLogins: loginsPrev24h
  }

  const deltas24h = {
    visitorsActive: deltaValue(visitors24h, visitorsPrev24h),
    visitorsNew: deltaValue(newVisitors24h, newVisitorsPrev24h),
    visitorEvents: deltaValue(events24h, eventsPrev24h),
    bansCreated: deltaValue(bans24h, bansPrev24h),
    mutesCreated: deltaValue(mutes24h, mutesPrev24h),
    messages: deltaValue(messages24h, messagesPrev24h),
    auditEvents: deltaValue(audit24h, auditPrev24h),
    adminLogins: deltaValue(logins24h, loginsPrev24h)
  }

  const riskHints: Array<{ level: 'high' | 'medium' | 'low' | 'info'; code: string; message: string; href: string }> = []
  if (activeBans >= 20) {
    riskHints.push({
      level: 'high',
      code: 'MANY_ACTIVE_BANS',
      message: `当前生效封禁 ${activeBans} 条，建议复核是否有误封或过期未清理`,
      href: '/admin/bans?active=true'
    })
  } else if (activeBans >= 5) {
    riskHints.push({
      level: 'medium',
      code: 'ACTIVE_BANS',
      message: `生效封禁 ${activeBans} 条，可在封禁页按范围筛选复核`,
      href: '/admin/bans?active=true'
    })
  }
  if (bans24h >= 5) {
    riskHints.push({
      level: 'high',
      code: 'BAN_SPIKE_24H',
      message: `近 24 小时新建封禁 ${bans24h} 条，存在异常流量或批量操作`,
      href: '/admin/audit?entityType=visitor_ban'
    })
  } else if (bans24h >= 2) {
    riskHints.push({
      level: 'medium',
      code: 'BAN_ACTIVITY_24H',
      message: `近 24 小时新建封禁 ${bans24h} 条`,
      href: '/admin/bans'
    })
  }
  if (activeMutes >= 10 || mutedRooms >= 3) {
    riskHints.push({
      level: 'medium',
      code: 'MUTE_PRESSURE',
      message: `禁言压力偏高：个人禁言 ${activeMutes} · 全员禁言房间 ${mutedRooms}`,
      href: '/admin/chat'
    })
  }
  if (events24h >= 2000) {
    riskHints.push({
      level: 'medium',
      code: 'EVENT_SPIKE',
      message: `近 24 小时访客操作 ${events24h} 次，关注高频 IP 与常访页面`,
      href: '/admin/visitors'
    })
  }
  if (logins24h >= 20) {
    riskHints.push({
      level: 'medium',
      code: 'ADMIN_LOGIN_SPIKE',
      message: `近 24 小时管理员登录 ${logins24h} 次，请核对是否本人操作`,
      href: '/admin/audit?action=admin.login'
    })
  }
  if (activeExpired >= 1) {
    riskHints.push({
      level: activeExpired >= 3 ? 'high' : 'medium',
      code: 'STALE_ACTIVE_BANS',
      message: `有 ${activeExpired} 条封禁仍标记生效但已过期，请清理`,
      href: '/admin/bans?active=true'
    })
  }
  if (ipClustersBase.some(row => row.visitorCount >= 4)) {
    const top = ipClustersBase[0]
    if (top) {
      riskHints.push({
        level: 'medium',
        code: 'IP_VISITOR_CLUSTER',
        message: `IP ${top.ip} 近 24 小时关联 ${top.visitorCount} 个访客`,
        href: `/admin/visitors?ip=${encodeURIComponent(top.ip)}`
      })
    }
  }
  if (deltas24h.visitorEvents >= 300) {
    riskHints.push({
      level: 'medium',
      code: 'EVENT_DELTA_SPIKE',
      message: `访客操作较前一天增加 ${deltas24h.visitorEvents} 次`,
      href: '/admin/visitors'
    })
  }
  if (events1h >= 120) {
    riskHints.push({
      level: 'high',
      code: 'EVENT_BURST_1H',
      message: `近 1 小时访客操作 ${events1h} 次，可能存在集中访问或异常流量`,
      href: '/admin/visitors'
    })
  }
  if (!riskHints.length) {
    riskHints.push({
      level: 'info',
      code: 'ALL_CLEAR',
      message: '当前未发现明显风险峰值，建议定期查看访客档案与审计',
      href: '/admin/visitors'
    })
  }


  const recentPathRows = client.db.select({
    path: visitorEvents.path,
    action: visitorEvents.action,
    createdAt: visitorEvents.createdAt,
    ip: visitorEvents.ip,
    visitorId: visitorEvents.visitorId,
    userId: visitorEvents.userId,
    city: visitorEvents.city
  }).from(visitorEvents)
    .where(gt(visitorEvents.createdAt, since24h))
    .orderBy(desc(visitorEvents.createdAt))
    .limit(500)
    .all()

  const pathTransitions = buildPathTransitions(
    recentPathRows.map(row => ({ path: row.path, createdAt: Number(row.createdAt) })),
    10
  )
  const burstWindows = buildBurstWindows(
    recentPathRows.map(row => ({ createdAt: Number(row.createdAt) })),
    10 * 60 * 1000,
    8
  )
  const peakBurst = burstWindows[0]?.count || 0
  const recentSessions = buildSessions(
    recentPathRows.map(row => ({
      path: row.path,
      action: row.action,
      ip: row.ip,
      createdAt: Number(row.createdAt)
    })),
    30 * 60 * 1000,
    16
  )
  const networkClusters = buildNetworkClusters(
    recentPathRows.map(row => ({
      ip: row.ip,
      visitorId: row.visitorId,
      userId: row.userId,
      city: row.city,
      path: row.path,
      createdAt: Number(row.createdAt)
    })),
    10
  )

  const dailyBucketExpr = sql<number>`cast(floor(${visitorEvents.createdAt} / 86400000.0) as integer)`
  const dailyEventRows = client.db.select({
    bucket: dailyBucketExpr,
    value: count()
  }).from(visitorEvents)
    .where(gt(visitorEvents.createdAt, now - DAY_MS * 14))
    .groupBy(dailyBucketExpr)
    .all()
  const currentDayBucket = Math.floor(now / DAY_MS)
  const historicalDailyEvents = dailyEventRows
    .filter(row => Number(row.bucket) < currentDayBucket)
    .map(row => Number(row.value))
  const anomalyBaseline = buildAnomalyBaseline(events24h, historicalDailyEvents)

  const ipClusters = ipClustersBase.map((cluster) => {
    const cityRow = client.db.select({
      city: visitorEvents.city,
      country: visitorEvents.country,
      value: count()
    }).from(visitorEvents)
      .where(and(eq(visitorEvents.ip, cluster.ip), gt(visitorEvents.createdAt, since24h)))
      .groupBy(visitorEvents.city, visitorEvents.country)
      .orderBy(desc(count()))
      .limit(1)
      .get()

    const pathRow = client.db.select({
      path: visitorEvents.path,
      value: count()
    }).from(visitorEvents)
      .where(and(eq(visitorEvents.ip, cluster.ip), gt(visitorEvents.createdAt, since24h)))
      .groupBy(visitorEvents.path)
      .orderBy(desc(count()))
      .limit(1)
      .get()

    const linkedUsers = Number(
      client.db.select({ value: sql<number>`count(distinct ${visitorEvents.userId})` })
        .from(visitorEvents)
        .where(and(
          eq(visitorEvents.ip, cluster.ip),
          gt(visitorEvents.createdAt, since24h),
          isNotNull(visitorEvents.userId),
          sql`trim(${visitorEvents.userId}) != ''`
        ))
        .get()?.value ?? 0
    )

    const banRowsForIp = client.db.select().from(visitorBans)
      .where(and(
        eq(visitorBans.scope, 'ip'),
        eq(visitorBans.value, cluster.ip),
        eq(visitorBans.isActive, true)
      ))
      .orderBy(desc(visitorBans.createdAt))
      .limit(5)
      .all()
    const isBanned = banRowsForIp.some(row => isBanEffectivelyActive({ isActive: row.isActive, expiresAt: row.expiresAt }, now))

    let riskScore = 0
    if (cluster.visitorCount >= 5) riskScore += 24
    else if (cluster.visitorCount >= 3) riskScore += 16
    else if (cluster.visitorCount >= 2) riskScore += 8
    if (cluster.eventCount >= 200) riskScore += 18
    else if (cluster.eventCount >= 80) riskScore += 10
    if (linkedUsers >= 3) riskScore += 14
    else if (linkedUsers >= 1) riskScore += 6
    if (isBanned) riskScore += 12

    const riskLevel: 'high' | 'medium' | 'low' | 'info' =
      riskScore >= 40 ? 'high' : riskScore >= 22 ? 'medium' : riskScore >= 10 ? 'low' : 'info'

    return {
      ...cluster,
      city: cityRow?.city || '',
      country: cityRow?.country || '',
      topPath: pathRow?.path || '/',
      linkedUsers,
      isBanned,
      riskScore,
      riskLevel
    }
  })

  const bannedTopIpCount = topIps.filter((row) => {
    const ban = client.db.select().from(visitorBans)
      .where(and(
        eq(visitorBans.scope, 'ip'),
        eq(visitorBans.value, row.ip),
        eq(visitorBans.isActive, true)
      ))
      .orderBy(desc(visitorBans.createdAt))
      .limit(1)
      .get()
    return ban ? isBanEffectivelyActive({ isActive: ban.isActive, expiresAt: ban.expiresAt }, now) : false
  }).length

  const banCoverage = {
    topIpCount: topIps.length,
    bannedTopIps: bannedTopIpCount,
    coverageRate: topIps.length ? Math.round((bannedTopIpCount / topIps.length) * 100) : 0,
    activeExpired: banHygiene.activeExpired,
    expiringSoon24h: banHygiene.expiringSoon24h
  }

  const cityTotal = topCities.reduce((sum, row) => sum + row.count, 0) || 1
  const geoConcentration = {
    topCityShare: Math.round(((topCities[0]?.count || 0) / cityTotal) * 100),
    topCity: topCities[0]?.city || '',
    distinctCities: topCities.length,
    cities: topCities.map(row => ({
      city: row.city,
      count: row.count,
      share: Math.round((row.count / cityTotal) * 100)
    }))
  }

  const windows = {
    h1: {
      visitorEvents: events1h,
      peakBurst10m: peakBurst
    },
    h24: {
      visitorsActive: visitors24h,
      visitorsNew: newVisitors24h,
      visitorEvents: events24h,
      bansCreated: bans24h,
      mutesCreated: mutes24h,
      messages: messages24h,
      auditEvents: audit24h,
      adminLogins: logins24h
    },
    d7: {
      visitorsActive: visitors7d,
      visitorEvents: events7d,
      bansCreated: bans7d,
      mutesCreated: mutes7d,
      messages: messages7d,
      auditEvents: audit7d
    }
  }

  const responseQueue: Array<{
    id: string
    kind: 'ip_cluster' | 'risk_hint' | 'ban_hygiene' | 'burst'
    priority: 'high' | 'medium' | 'low'
    title: string
    detail: string
    href: string
    score: number
  }> = []

  for (const cluster of ipClusters) {
    if (cluster.riskLevel === 'info') continue
    responseQueue.push({
      id: `ip:${cluster.ip}`,
      kind: 'ip_cluster',
      priority: cluster.riskLevel === 'high' ? 'high' : cluster.riskLevel === 'medium' ? 'medium' : 'low',
      title: `同一网络来源 ${cluster.ip}`,
      detail: `${cluster.visitorCount} 个访客 · ${cluster.eventCount} 次操作 · ${cluster.city || '未知地区'}${cluster.isBanned ? ' · 已封禁' : ''}`,
      href: `/admin/visitors?ip=${encodeURIComponent(cluster.ip)}`,
      score: cluster.riskScore
    })
  }

  for (const hint of riskHints) {
    if (hint.level === 'info') continue
    responseQueue.push({
      id: `hint:${hint.code}`,
      kind: 'risk_hint',
      priority: hint.level === 'high' ? 'high' : hint.level === 'medium' ? 'medium' : 'low',
      title: hint.message,
      detail: '查看相关访客、封禁和操作记录',
      href: hint.href,
      score: hint.level === 'high' ? 90 : hint.level === 'medium' ? 60 : 30
    })
  }

  if (banHygiene.activeExpired > 0) {
    responseQueue.push({
      id: 'hygiene:stale-bans',
      kind: 'ban_hygiene',
      priority: banHygiene.activeExpired >= 3 ? 'high' : 'medium',
      title: `清理过期但仍标记生效的封禁 ${banHygiene.activeExpired} 条`,
      detail: `即将过期 ${banHygiene.expiringSoon24h} 条 · 永久生效 ${banHygiene.permanentActive} 条`,
      href: '/admin/bans?active=true',
      score: 50 + banHygiene.activeExpired * 5
    })
  }

  if (peakBurst >= 40) {
    responseQueue.push({
      id: 'burst:peak',
      kind: 'burst',
      priority: peakBurst >= 100 ? 'high' : 'medium',
      title: `近 24 小时内，10 分钟访问峰值为 ${peakBurst} 次操作`,
      detail: burstWindows[0]
        ? `${burstWindows[0].startAt} ~ ${burstWindows[0].endAt}`
        : '访问量激增',
      href: '/admin/visitors',
      score: Math.min(99, peakBurst)
    })
  }

  responseQueue.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 } as const
    return order[a.priority] - order[b.priority] || b.score - a.score
  })

  const detail = {
    pathTransitions,
    burstWindows,
    recentSessions,
    networkClusters,
    anomalyBaseline,
    peakBurst10m: peakBurst,
    sampleEventCount: recentPathRows.length,
    riskHintCount: riskHints.length,
    responseQueueSize: Math.min(responseQueue.length, 12)
  }


  return {
    generatedAt: new Date(now).toISOString(),
    counts: {
      activeBans,
      inactiveBans,
      bannedVisitors,
      activeMutes,
      mutedRooms,
      totalUsers,
      bannedUsers,
      disabledUsers,
      totalVisitors,
      totalMessages,
      deletedMessages,
      auditTotal
    },
    last24h: {
      visitorsActive: visitors24h,
      visitorsNew: newVisitors24h,
      visitorEvents: events24h,
      bansCreated: bans24h,
      mutesCreated: mutes24h,
      messages: messages24h,
      auditEvents: audit24h,
      adminLogins: logins24h
    },
    previous24h,
    deltas24h,
    banHygiene,
    banCoverage,
    windows,
    ipClusters,
    pathTransitions,
    burstWindows,
    recentSessions,
    networkClusters,
    anomalyBaseline,
    geoConcentration,
    responseQueue: responseQueue.slice(0, 12),
    detail,
    suspiciousAgents,
    adminActors,
    opsTimeline,
    pulse,
    topPaths,
    topCities,
    topActions,
    topIps,
    topBanReasons,
    hourlyEvents,
    recentBans,
    riskHints,
    recentMutes,
    recentAudit
  }
}


export function getUserSecurityDossier(client: DatabaseClient, userId: string) {
  const userRow = client.db.select().from(users).where(eq(users.id, userId)).get()
  if (!userRow) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
      data: { code: 'USER_NOT_FOUND' }
    })
  }

  const now = Date.now()
  const user = serializeAppUser(userRow)

  const linkedVisitors = client.db.select().from(visitors)
    .where(eq(visitors.userId, userId))
    .orderBy(desc(visitors.lastSeenAt))
    .limit(10)
    .all()
    .map(row => ({
      id: row.id,
      lastSeenAt: new Date(row.lastSeenAt).toISOString(),
      firstSeenAt: new Date(row.firstSeenAt).toISOString(),
      lastIp: row.lastIp,
      lastCity: row.lastCity,
      lastRegion: row.lastRegion,
      lastCountry: row.lastCountry,
      lastPath: row.lastPath,
      eventCount: row.eventCount
    }))

  const bans = client.db.select().from(visitorBans)
    .where(and(
      eq(visitorBans.scope, 'user'),
      eq(visitorBans.value, userId)
    ))
    .orderBy(desc(visitorBans.createdAt))
    .limit(20)
    .all()
    .map(row => ({
      id: row.id,
      scope: row.scope,
      value: row.value,
      reason: row.reason,
      isActive: row.isActive,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString()
    }))

  const mutes = client.db.select({
    id: chatMutes.id,
    roomId: chatMutes.roomId,
    reason: chatMutes.reason,
    isActive: chatMutes.isActive,
    expiresAt: chatMutes.expiresAt,
    createdAt: chatMutes.createdAt,
    roomTitle: chatRooms.title
  }).from(chatMutes)
    .leftJoin(chatRooms, eq(chatMutes.roomId, chatRooms.id))
    .where(eq(chatMutes.userId, userId))
    .orderBy(desc(chatMutes.createdAt))
    .limit(20)
    .all()
    .map(row => ({
      id: row.id,
      roomId: row.roomId,
      reason: row.reason,
      isActive: row.isActive && (!row.expiresAt || row.expiresAt > now),
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      roomTitle: row.roomTitle || (row.roomId ? '指定房间' : '全站')
    }))

  const messageTotal = countWhere(client, chatMessages, eq(chatMessages.userId, userId))
  const messageDeleted = countWhere(
    client,
    chatMessages,
    and(eq(chatMessages.userId, userId), isNotNull(chatMessages.deletedAt))
  )
  const recentMessages = client.db.select({
    id: chatMessages.id,
    roomId: chatMessages.roomId,
    body: chatMessages.body,
    deletedAt: chatMessages.deletedAt,
    createdAt: chatMessages.createdAt,
    roomTitle: chatRooms.title
  }).from(chatMessages)
    .leftJoin(chatRooms, eq(chatMessages.roomId, chatRooms.id))
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(8)
    .all()
    .map(row => ({
      id: row.id,
      roomId: row.roomId,
      body: row.body,
      deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      roomTitle: row.roomTitle || '未知房间'
    }))

  const auditItems = client.db.select().from(auditLogs)
    .where(and(eq(auditLogs.entityType, 'user'), eq(auditLogs.entityId, userId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(12)
    .all()
    .map(row => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorAdminId: row.actorAdminId,
      createdAt: new Date(row.createdAt).toISOString()
    }))

  const activeSessions = countWhere(
    client,
    userSessions,
    and(eq(userSessions.userId, userId), gt(userSessions.expiresAt, now))
  )

  const memberships = client.db.select({
    roomId: chatMembers.roomId,
    joinedAt: chatMembers.joinedAt,
    title: chatRooms.title,
    kind: chatRooms.kind
  }).from(chatMembers)
    .leftJoin(chatRooms, eq(chatMembers.roomId, chatRooms.id))
    .where(eq(chatMembers.userId, userId))
    .all()
    .map(row => ({
      roomId: row.roomId,
      title: row.title || row.roomId,
      kind: row.kind,
      joinedAt: new Date(row.joinedAt).toISOString()
    }))

  const ipFootprintMap = new Map<string, { ip: string; count: number; lastAt: string | null }>()
  for (const v of linkedVisitors) {
    if (!v.lastIp) continue
    const prev = ipFootprintMap.get(v.lastIp)
    if (!prev) {
      ipFootprintMap.set(v.lastIp, { ip: v.lastIp, count: v.eventCount || 1, lastAt: v.lastSeenAt })
    } else {
      prev.count += v.eventCount || 1
      if (!prev.lastAt || Date.parse(v.lastSeenAt) > Date.parse(prev.lastAt)) prev.lastAt = v.lastSeenAt
    }
  }
  const ipFootprint = [...ipFootprintMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const userFactors: Array<{ code: string; points: number; message: string }> = []
  const activeBanCount = bans.filter(b => isBanEffectivelyActive(b, now)).length
  const activeMuteCount = mutes.filter(m => m.isActive).length
  if (user.status === 'banned' || activeBanCount > 0) {
    userFactors.push({ code: 'USER_BANNED', points: 50, message: '账号处于封禁或命中生效封禁' })
  }
  if (user.status === 'disabled') {
    userFactors.push({ code: 'USER_DISABLED', points: 20, message: '账号已停用' })
  }
  if (activeMuteCount > 0) {
    userFactors.push({ code: 'ACTIVE_MUTES', points: 15, message: `生效禁言 ${activeMuteCount} 条` })
  }
  if (messageDeleted >= 5) {
    userFactors.push({ code: 'DELETED_MESSAGES', points: 12, message: `已删消息 ${messageDeleted}` })
  }
  if (ipFootprint.length >= 4) {
    userFactors.push({ code: 'MULTI_IP_FOOTPRINT', points: 18, message: `关联 IP ${ipFootprint.length} 个` })
  } else if (ipFootprint.length >= 2) {
    userFactors.push({ code: 'MULTI_IP_FOOTPRINT', points: 8, message: `关联 IP ${ipFootprint.length} 个` })
  }
  if (linkedVisitors.length >= 4) {
    userFactors.push({ code: 'MULTI_VISITOR_LINK', points: 10, message: `关联访客设备 ${linkedVisitors.length}` })
  }
  const userRisk = scoreRisk(userFactors)
  const evidenceEvents = messageTotal + linkedVisitors.reduce((sum, v) => sum + (v.eventCount || 0), 0)
  const confidence = riskConfidence(userRisk.riskFactors.length, evidenceEvents)

  const suggestedActions: Array<{
    kind: 'ban_user' | 'open_chat' | 'open_visitors' | 'open_audit'
    label: string
    href: string
    reason: string
    priority: 'high' | 'medium' | 'low'
  }> = []

  if (user.status !== 'banned' && activeBanCount === 0) {
    suggestedActions.push({
      kind: 'ban_user',
      label: '限制此账号',
      href: `/admin/users?userId=${encodeURIComponent(userId)}`,
      reason: userRisk.riskLevel === 'high' ? '风险偏高，建议限制登录或聊天' : '可按需停用或封禁账号',
      priority: userRisk.riskLevel === 'high' ? 'high' : 'medium'
    })
  }
  if (memberships.length) {
    suggestedActions.push({
      kind: 'open_chat',
      label: '查看群聊消息',
      href: `/admin/chat?userId=${encodeURIComponent(userId)}`,
      reason: '核对发言与禁言状态',
      priority: 'medium'
    })
  }
  if (linkedVisitors.length) {
    suggestedActions.push({
      kind: 'open_visitors',
      label: '查看关联访客',
      href: `/admin/visitors?userId=${encodeURIComponent(userId)}`,
      reason: `关联 ${linkedVisitors.length} 个访客设备`,
      priority: 'low'
    })
  }
  suggestedActions.push({
    kind: 'open_audit',
    label: '打开审计日志',
    href: `/admin/audit?entityType=user&entityId=${encodeURIComponent(userId)}`,
    reason: '核对管理员操作轨迹',
    priority: 'low'
  })

  const relationship = {
    visitorIds: linkedVisitors.map(v => v.id),
    ips: ipFootprint.map(item => item.ip),
    rooms: memberships.map((m: any) => m.roomId || m.roomTitle).filter(Boolean),
    activeSessions
  }
  const evidenceLedger = buildEvidenceLedger(userRisk.riskFactors, [
    {
      code: 'ACCOUNT_VISITOR_LINKS',
      message: `账号关联 ${linkedVisitors.length} 个访客设备`,
      weight: linkedVisitors.length >= 4 ? 15 : linkedVisitors.length ? 5 : 0
    },
    {
      code: 'ACCOUNT_IP_FOOTPRINT',
      message: `账号关联 ${ipFootprint.length} 个 IP`,
      weight: ipFootprint.length >= 4 ? 15 : ipFootprint.length >= 2 ? 8 : 0
    },
    {
      code: 'ACCOUNT_CHAT_ACTIVITY',
      message: `消息 ${messageTotal} 条，其中已删 ${messageDeleted} 条`,
      weight: messageDeleted >= 5 ? 12 : messageDeleted ? 4 : 0
    }
  ])
  const playbook = buildInvestigationPlaybook({
    riskLevel: userRisk.riskLevel,
    isBanned: user.status === 'banned' || activeBanCount > 0,
    hasAccount: true,
    hasCluster: linkedVisitors.length > 1 || ipFootprint.length > 1,
    auditHref: `/admin/audit?entityType=user&entityId=${encodeURIComponent(userId)}`,
    visitorHref: `/admin/visitors?userId=${encodeURIComponent(userId)}`
  })
  const investigationSummary = {
    evidenceCount: evidenceLedger.length,
    strongEvidenceCount: evidenceLedger.filter(item => item.strength === 'strong').length,
    linkedVisitorCount: linkedVisitors.length,
    ipCount: ipFootprint.length,
    roomCount: memberships.length,
    recommendedSteps: playbook.filter(step => step.status === 'recommended').length
  }


  return {
    user,
    summary: {
      linkedVisitorCount: linkedVisitors.length,
      banCount: bans.length,
      activeBanCount,
      muteCount: mutes.length,
      activeMuteCount,
      messageTotal,
      messageDeleted,
      activeSessions,
      membershipCount: memberships.length,
      auditCount: auditItems.length,
      riskScore: userRisk.riskScore,
      riskLevel: userRisk.riskLevel,
      evidenceEvents,
      confidence
    },
    riskScore: userRisk.riskScore,
    riskLevel: userRisk.riskLevel,
    riskFactors: userRisk.riskFactors,
    confidence,
    evidenceEvents,
    suggestedActions,
    evidenceLedger,
    playbook,
    investigationSummary,
    relationship,
    ipFootprint,
    linkedVisitors,
    bans,
    mutes,
    recentMessages,
    auditItems,
    memberships
  }
}


export function getVisitorSecurityDossier(client: DatabaseClient, visitorId: string) {
  const visitorRow = client.db.select().from(visitors).where(eq(visitors.id, visitorId)).get()
  if (!visitorRow) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Visitor not found',
      data: { code: 'VISITOR_NOT_FOUND' }
    })
  }

  const now = Date.now()
  const since7d = now - DAY_MS * 7

  const visitor = {
    id: visitorRow.id,
    firstSeenAt: new Date(visitorRow.firstSeenAt).toISOString(),
    lastSeenAt: new Date(visitorRow.lastSeenAt).toISOString(),
    lastIp: visitorRow.lastIp,
    lastCountry: visitorRow.lastCountry,
    lastRegion: visitorRow.lastRegion,
    lastCity: visitorRow.lastCity,
    lastUserAgent: visitorRow.lastUserAgent,
    lastPath: visitorRow.lastPath,
    eventCount: visitorRow.eventCount,
    userId: visitorRow.userId,
    locationLabel: [visitorRow.lastCountry, visitorRow.lastRegion, visitorRow.lastCity]
      .filter(Boolean)
      .join(' · ') || '未知'
  }

  const eventTotal = countWhere(client, visitorEvents, eq(visitorEvents.visitorId, visitorId))

  const actionBreakdown = client.db.select({
    action: visitorEvents.action,
    value: count()
  }).from(visitorEvents)
    .where(eq(visitorEvents.visitorId, visitorId))
    .groupBy(visitorEvents.action)
    .orderBy(desc(count()))
    .limit(12)
    .all()
    .map(row => ({ action: row.action || 'unknown', count: Number(row.value) }))

  const ipHistory = client.db.select({
    ip: visitorEvents.ip,
    value: count(),
    lastAt: sql`max(${visitorEvents.createdAt})`
  }).from(visitorEvents)
    .where(and(
      eq(visitorEvents.visitorId, visitorId),
      isNotNull(visitorEvents.ip),
      sql`trim(${visitorEvents.ip}) != ''`
    ))
    .groupBy(visitorEvents.ip)
    .orderBy(desc(sql`max(${visitorEvents.createdAt})`))
    .limit(12)
    .all()
    .map(row => ({
      ip: row.ip || '—',
      count: Number(row.value),
      lastAt: row.lastAt ? new Date(Number(row.lastAt)).toISOString() : null
    }))

  const pathTop = client.db.select({
    path: visitorEvents.path,
    value: count()
  }).from(visitorEvents)
    .where(eq(visitorEvents.visitorId, visitorId))
    .groupBy(visitorEvents.path)
    .orderBy(desc(count()))
    .limit(10)
    .all()
    .map(row => ({ path: row.path || '/', count: Number(row.value) }))

  const uniqueIps = ipHistory.length
  const uniquePaths = pathTop.length

  // Related bans: visitor id, last IP, any historical IP, linked user
  const banOrConditions: any[] = [
    and(eq(visitorBans.scope, 'visitor'), eq(visitorBans.value, visitorId))
  ]
  if (visitorRow.lastIp) {
    banOrConditions.push(and(eq(visitorBans.scope, 'ip'), eq(visitorBans.value, visitorRow.lastIp)))
  }
  for (const item of ipHistory) {
    if (item.ip && item.ip !== visitorRow.lastIp) {
      banOrConditions.push(and(eq(visitorBans.scope, 'ip'), eq(visitorBans.value, item.ip)))
    }
  }
  if (visitorRow.userId) {
    banOrConditions.push(and(eq(visitorBans.scope, 'user'), eq(visitorBans.value, visitorRow.userId)))
  }

  const relatedBans = client.db.select().from(visitorBans)
    .where(or(...banOrConditions))
    .orderBy(desc(visitorBans.createdAt))
    .limit(20)
    .all()
    .map(row => ({
      id: row.id,
      scope: row.scope,
      value: row.value,
      reason: row.reason,
      isActive: row.isActive,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      bannedByAdminId: row.bannedByAdminId,
      createdAt: new Date(row.createdAt).toISOString()
    }))

  const isBanned = relatedBans.some((ban) => {
    if (!ban.isActive) return false
    if (ban.expiresAt && Date.parse(ban.expiresAt) <= now) return false
    return true
  })

  let linkedUser: ReturnType<typeof serializeAppUser> | null = null
  if (visitorRow.userId) {
    const userRow = client.db.select().from(users).where(eq(users.id, visitorRow.userId)).get()
    if (userRow) linkedUser = serializeAppUser(userRow)
  }

  const sameIpVisitors = visitorRow.lastIp
    ? client.db.select({
      id: visitors.id,
      lastSeenAt: visitors.lastSeenAt,
      lastIp: visitors.lastIp,
      lastCity: visitors.lastCity,
      lastPath: visitors.lastPath,
      eventCount: visitors.eventCount,
      userId: visitors.userId
    }).from(visitors)
      .where(and(
        eq(visitors.lastIp, visitorRow.lastIp),
        ne(visitors.id, visitorId)
      ))
      .orderBy(desc(visitors.lastSeenAt))
      .limit(8)
      .all()
      .map(row => ({
        id: row.id,
        lastSeenAt: new Date(row.lastSeenAt).toISOString(),
        lastIp: row.lastIp,
        lastCity: row.lastCity,
        lastPath: row.lastPath,
        eventCount: row.eventCount,
        userId: row.userId
      }))
    : []

  const recentEvents = client.db.select().from(visitorEvents)
    .where(eq(visitorEvents.visitorId, visitorId))
    .orderBy(desc(visitorEvents.createdAt))
    .limit(20)
    .all()
    .map(row => ({
      id: row.id,
      action: row.action,
      path: row.path,
      method: row.method,
      ip: row.ip,
      country: row.country,
      region: row.region,
      city: row.city,
      createdAt: new Date(row.createdAt).toISOString()
    }))

  const auditItems = client.db.select().from(auditLogs)
    .where(and(eq(auditLogs.entityType, 'visitor'), eq(auditLogs.entityId, visitorId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(12)
    .all()
    .map(row => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorAdminId: row.actorAdminId,
      createdAt: new Date(row.createdAt).toISOString()
    }))

  // Also pull audits for related ban entity ids
  const banIds = relatedBans.map(b => b.id)
  let banAudits: typeof auditItems = []
  if (banIds.length) {
    banAudits = client.db.select().from(auditLogs)
      .where(and(
        eq(auditLogs.entityType, 'visitor_ban'),
        or(...banIds.map(id => eq(auditLogs.entityId, id)))
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(12)
      .all()
      .map(row => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actorAdminId: row.actorAdminId,
        createdAt: new Date(row.createdAt).toISOString()
      }))
  }

  const mergedAudit = [...auditItems, ...banAudits]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((item, index, arr) => arr.findIndex(x => x.id === item.id) === index)
    .slice(0, 12)

  const events7d = countWhere(
    client,
    visitorEvents,
    and(eq(visitorEvents.visitorId, visitorId), gt(visitorEvents.createdAt, since7d))
  )
  const since1hVisitor = now - 60 * 60 * 1000
  const since24hVisitor = now - DAY_MS
  const events1h = countWhere(
    client,
    visitorEvents,
    and(eq(visitorEvents.visitorId, visitorId), gt(visitorEvents.createdAt, since1hVisitor))
  )
  const events24h = countWhere(
    client,
    visitorEvents,
    and(eq(visitorEvents.visitorId, visitorId), gt(visitorEvents.createdAt, since24hVisitor))
  )

  const userAgentHistory = client.db.select({
    userAgent: visitorEvents.userAgent,
    value: count(),
    lastAt: sql<number>`max(${visitorEvents.createdAt})`
  }).from(visitorEvents)
    .where(eq(visitorEvents.visitorId, visitorId))
    .groupBy(visitorEvents.userAgent)
    .orderBy(desc(count()))
    .limit(8)
    .all()
    .map(row => ({
      userAgent: shortUa(row.userAgent, 96),
      count: Number(row.value),
      lastAt: row.lastAt ? new Date(Number(row.lastAt)).toISOString() : null
    }))

  const geoTrail = client.db.select({
    country: visitorEvents.country,
    region: visitorEvents.region,
    city: visitorEvents.city,
    value: count(),
    lastAt: sql<number>`max(${visitorEvents.createdAt})`
  }).from(visitorEvents)
    .where(eq(visitorEvents.visitorId, visitorId))
    .groupBy(visitorEvents.country, visitorEvents.region, visitorEvents.city)
    .orderBy(desc(count()))
    .limit(8)
    .all()
    .map(row => ({
      country: row.country || '',
      region: row.region || '',
      city: row.city || '',
      label: [row.country, row.region, row.city].filter(Boolean).join(' · ') || '未知',
      count: Number(row.value),
      lastAt: row.lastAt ? new Date(Number(row.lastAt)).toISOString() : null
    }))

  const hourBucketExprVisitor = sql<number>`cast(floor(${visitorEvents.createdAt} / 3600000.0) as integer)`
  const hourlyRawVisitor = client.db.select({
    bucket: hourBucketExprVisitor,
    value: count()
  }).from(visitorEvents)
    .where(and(eq(visitorEvents.visitorId, visitorId), gt(visitorEvents.createdAt, since24hVisitor)))
    .groupBy(hourBucketExprVisitor)
    .all()
  const currentHourVisitor = Math.floor(now / 3600000)
  const hourlyMapVisitor = new Map(hourlyRawVisitor.map(row => [Number(row.bucket), Number(row.value)]))
  const hourlyPattern = Array.from({ length: 24 }, (_, i) => {
    const bucket = currentHourVisitor - 23 + i
    return {
      hour: new Date(bucket * 3600000).toISOString(),
      count: hourlyMapVisitor.get(bucket) || 0
    }
  })

  const activeBanCount = relatedBans.filter((ban) => {
    if (!ban.isActive) return false
    if (ban.expiresAt && Date.parse(ban.expiresAt) <= now) return false
    return true
  }).length

  const visitorFactors: Array<{ code: string; points: number; message: string }> = []
  if (isBanned) visitorFactors.push({ code: 'HIT_BAN', points: 50, message: '已命中生效封禁' })
  if (events1h >= 40) visitorFactors.push({ code: 'BURST_1H', points: 25, message: `近 1 小时操作 ${events1h} 次` })
  else if (events1h >= 15) visitorFactors.push({ code: 'BURST_1H', points: 12, message: `近 1 小时操作 ${events1h} 次` })
  if (events24h >= 200) visitorFactors.push({ code: 'HIGH_VOLUME_24H', points: 18, message: `近 24 小时操作 ${events24h} 次` })
  else if (events24h >= 80) visitorFactors.push({ code: 'HIGH_VOLUME_24H', points: 8, message: `近 24 小时操作 ${events24h} 次` })
  if (uniqueIps >= 4) visitorFactors.push({ code: 'MULTI_IP', points: 16, message: `历史 IP ${uniqueIps} 个` })
  else if (uniqueIps >= 2) visitorFactors.push({ code: 'MULTI_IP', points: 6, message: `历史 IP ${uniqueIps} 个` })
  if (sameIpVisitors.length >= 4) visitorFactors.push({ code: 'SAME_IP_CLUSTER', points: 14, message: `同 IP 其他访客 ${sameIpVisitors.length}` })
  else if (sameIpVisitors.length >= 2) visitorFactors.push({ code: 'SAME_IP_CLUSTER', points: 6, message: `同 IP 其他访客 ${sameIpVisitors.length}` })
  if (userAgentHistory.length >= 4) visitorFactors.push({ code: 'UA_SWITCH', points: 8, message: `设备或浏览器变化 ${userAgentHistory.length} 种` })
  const visitorRisk = scoreRisk(visitorFactors)

  const seqSource = client.db.select({
    path: visitorEvents.path,
    action: visitorEvents.action,
    createdAt: visitorEvents.createdAt
  }).from(visitorEvents)
    .where(eq(visitorEvents.visitorId, visitorId))
    .orderBy(desc(visitorEvents.createdAt))
    .limit(80)
    .all()

  const pathSequence = buildPathSequence(
    seqSource.map(row => ({
      path: row.path,
      action: row.action,
      createdAt: Number(row.createdAt)
    })),
    12
  )
  const pathTransitions = buildPathTransitions(
    seqSource.map(row => ({ path: row.path, createdAt: Number(row.createdAt) })),
    8
  )
  const burstWindows = buildBurstWindows(
    seqSource.map(row => ({ createdAt: Number(row.createdAt) })),
    10 * 60 * 1000,
    6
  )

  const peerRows = client.db.select({
    visitorId: visitorEvents.visitorId,
    value: count()
  }).from(visitorEvents)
    .where(gt(visitorEvents.createdAt, now - DAY_MS))
    .groupBy(visitorEvents.visitorId)
    .orderBy(desc(count()))
    .limit(200)
    .all()
  const peerPopulation = peerRows.map(row => Number(row.value))
  const peerComparison = {
    events24h,
    percentile: percentileRank(events24h, peerPopulation),
    sampleSize: peerPopulation.length,
    peerMedian: peerPopulation.length
      ? peerPopulation[Math.floor(peerPopulation.length / 2)]
      : 0
  }

  const evidenceEvents = events24h + events1h + relatedBans.length
  const confidence = riskConfidence(visitorRisk.riskFactors.length, evidenceEvents)
  const relationship = {
    lastIp: visitor.lastIp || null,
    linkedUserId: linkedUser?.id || visitor.userId || null,
    sameIpVisitorIds: sameIpVisitors.map((row: any) => row.id),
    topPaths: pathTop.slice(0, 5).map(row => row.path)
  }
  const sessions = buildSessions(
    seqSource.map(row => ({
      path: row.path,
      action: row.action,
      ip: visitor.lastIp,
      createdAt: Number(row.createdAt)
    })),
    30 * 60 * 1000,
    12
  )
  const evidenceLedger = buildEvidenceLedger(visitorRisk.riskFactors, [
    {
      code: 'PEER_PERCENTILE',
      message: `今天的访问量高于约 ${peerComparison.percentile}% 的访客`,
      weight: peerComparison.percentile >= 95 ? 20 : peerComparison.percentile >= 80 ? 10 : 3
    },
    {
      code: 'SESSION_DENSITY',
      message: `最近样本切分为 ${sessions.length} 个会话`,
      weight: sessions.some(session => session.eventCount >= 30) ? 15 : 3
    },
    {
      code: 'RELATIONSHIP_SCOPE',
      message: `同 IP 关联 ${sameIpVisitors.length} 个其他访客`,
      weight: sameIpVisitors.length >= 3 ? 12 : sameIpVisitors.length ? 4 : 0
    }
  ])
  const playbook = buildInvestigationPlaybook({
    riskLevel: visitorRisk.riskLevel,
    isBanned,
    hasAccount: Boolean(linkedUser),
    hasCluster: sameIpVisitors.length > 0,
    auditHref: `/admin/audit?entityType=visitor&entityId=${encodeURIComponent(visitorId)}`,
    visitorHref: `/admin/visitors?visitorId=${encodeURIComponent(visitorId)}`
  })
  const investigationSummary = {
    sessionCount: sessions.length,
    longestSessionSeconds: Math.max(0, ...sessions.map(session => session.durationSeconds)),
    densestSessionEvents: Math.max(0, ...sessions.map(session => session.eventCount)),
    evidenceCount: evidenceLedger.length,
    strongEvidenceCount: evidenceLedger.filter(item => item.strength === 'strong').length,
    recommendedSteps: playbook.filter(step => step.status === 'recommended').length
  }



  const suggestedActions: Array<{
    kind: 'ban_visitor' | 'ban_ip' | 'ban_user' | 'open_ip' | 'open_user'
    label: string
    href: string
    reason: string
    priority: 'high' | 'medium' | 'low'
    scope?: 'visitor' | 'ip' | 'user'
    value?: string
  }> = []

  if (!isBanned) {
    suggestedActions.push({
      kind: 'ban_visitor',
      label: '封禁此访客',
      href: `/admin/visitors?visitorId=${encodeURIComponent(visitorId)}`,
      reason: visitorRisk.riskLevel === 'high' ? '风险偏高，建议限制访问' : '可按需创建访客级封禁',
      priority: visitorRisk.riskLevel === 'high' ? 'high' : 'medium',
      scope: 'visitor',
      value: visitorId
    })
    if (visitor.lastIp) {
      suggestedActions.push({
        kind: 'ban_ip',
        label: '封禁最近 IP',
        href: `/admin/visitors?ip=${encodeURIComponent(visitor.lastIp)}`,
        reason: '该访客最近使用此网络地址，可结合相近网络来源检查',
        priority: sameIpVisitors.length >= 2 ? 'high' : 'medium',
        scope: 'ip',
        value: visitor.lastIp
      })
    }
    if (linkedUser) {
      suggestedActions.push({
        kind: 'ban_user',
        label: '封禁关联账号',
        href: `/admin/users?userId=${encodeURIComponent(linkedUser.id)}`,
        reason: '访客已绑定账号，可同步限制账号能力',
        priority: 'medium',
        scope: 'user',
        value: linkedUser.id
      })
    }
  }
  if (visitor.lastIp) {
    suggestedActions.push({
      kind: 'open_ip',
      label: '查看 IP 安全档案',
      href: `/admin/visitors?ip=${encodeURIComponent(visitor.lastIp)}`,
      reason: '查看同一网络下的访客和操作记录',
      priority: 'low'
    })
  }
  if (linkedUser) {
    suggestedActions.push({
      kind: 'open_user',
      label: '打开关联账号',
      href: `/admin/users?userId=${encodeURIComponent(linkedUser.id)}`,
      reason: '查看账号封禁、禁言与消息',
      priority: 'low'
    })
  }

  return {
    visitor,
    summary: {
      eventTotal,
      events7d,
      events1h,
      events24h,
      uniqueIps,
      uniquePaths,
      actionCounts: actionBreakdown.length,
      relatedBanCount: relatedBans.length,
      activeBanCount,
      isBanned,
      hasLinkedUser: Boolean(linkedUser),
      sameIpVisitorCount: sameIpVisitors.length,
      riskScore: visitorRisk.riskScore,
      riskLevel: visitorRisk.riskLevel,
      evidenceEvents,
      confidence,
      peerPercentile: peerComparison.percentile
    },
    riskScore: visitorRisk.riskScore,
    riskLevel: visitorRisk.riskLevel,
    riskFactors: visitorRisk.riskFactors,
    confidence,
    evidenceEvents,
    peerComparison,
    pathSequence,
    pathTransitions,
    burstWindows,
    sessions,
    evidenceLedger,
    playbook,
    investigationSummary,
    relationship,
    events1h,
    events24h,
    userAgentHistory,
    geoTrail,
    hourlyPattern,
    suggestedActions,
    actionBreakdown,
    ipHistory,
    pathTop,
    relatedBans,
    linkedUser,
    sameIpVisitors,
    recentEvents,
    auditItems: mergedAudit
  }
}

export function getIpSecurityDossier(client: DatabaseClient, rawIp: string) {
  const ip = (rawIp || '').trim()
  if (!ip) {
    throw Object.assign(new Error('IP is required'), { statusCode: 400 })
  }

  const now = Date.now()
  const since1h = now - 60 * 60 * 1000
  const since24h = now - DAY_MS
  const since7d = now - DAY_MS * 7

  const visitorRows = client.db.select({
    id: visitors.id,
    firstSeenAt: visitors.firstSeenAt,
    lastSeenAt: visitors.lastSeenAt,
    lastIp: visitors.lastIp,
    lastCity: visitors.lastCity,
    lastRegion: visitors.lastRegion,
    lastCountry: visitors.lastCountry,
    lastPath: visitors.lastPath,
    lastUserAgent: visitors.lastUserAgent,
    eventCount: visitors.eventCount,
    userId: visitors.userId
  }).from(visitors)
    .where(eq(visitors.lastIp, ip))
    .orderBy(desc(visitors.lastSeenAt))
    .limit(40)
    .all()
    .map(row => ({
      id: row.id,
      firstSeenAt: new Date(row.firstSeenAt).toISOString(),
      lastSeenAt: new Date(row.lastSeenAt).toISOString(),
      lastIp: row.lastIp,
      lastCity: row.lastCity,
      lastRegion: row.lastRegion,
      lastCountry: row.lastCountry,
      lastPath: row.lastPath,
      lastUserAgent: row.lastUserAgent,
      eventCount: row.eventCount,
      userId: row.userId
    }))

  const events24h = countWhere(
    client,
    visitorEvents,
    and(eq(visitorEvents.ip, ip), gt(visitorEvents.createdAt, since24h))
  )
  const events1h = countWhere(
    client,
    visitorEvents,
    and(eq(visitorEvents.ip, ip), gt(visitorEvents.createdAt, since1h))
  )
  const events7d = countWhere(
    client,
    visitorEvents,
    and(eq(visitorEvents.ip, ip), gt(visitorEvents.createdAt, since7d))
  )
  const eventTotal = countWhere(client, visitorEvents, eq(visitorEvents.ip, ip))

  const uniqueVisitors24h = Number(
    client.db.select({ value: sql<number>`count(distinct ${visitorEvents.visitorId})` })
      .from(visitorEvents)
      .where(and(eq(visitorEvents.ip, ip), gt(visitorEvents.createdAt, since24h)))
      .get()?.value ?? 0
  )

  const pathTop = client.db.select({
    path: visitorEvents.path,
    value: count()
  }).from(visitorEvents)
    .where(and(eq(visitorEvents.ip, ip), gt(visitorEvents.createdAt, since7d)))
    .groupBy(visitorEvents.path)
    .orderBy(desc(count()))
    .limit(8)
    .all()
    .map(row => ({ path: row.path || '/', count: Number(row.value) }))

  const actionBreakdown = client.db.select({
    action: visitorEvents.action,
    value: count()
  }).from(visitorEvents)
    .where(and(eq(visitorEvents.ip, ip), gt(visitorEvents.createdAt, since7d)))
    .groupBy(visitorEvents.action)
    .orderBy(desc(count()))
    .limit(10)
    .all()
    .map(row => ({ action: row.action, count: Number(row.value) }))

  const userAgentHistory = client.db.select({
    userAgent: visitorEvents.userAgent,
    value: count()
  }).from(visitorEvents)
    .where(and(eq(visitorEvents.ip, ip), gt(visitorEvents.createdAt, since7d)))
    .groupBy(visitorEvents.userAgent)
    .orderBy(desc(count()))
    .limit(8)
    .all()
    .map(row => ({
      userAgent: shortUa(row.userAgent, 96),
      count: Number(row.value)
    }))

  const geoTrail = client.db.select({
    country: visitorEvents.country,
    region: visitorEvents.region,
    city: visitorEvents.city,
    value: count()
  }).from(visitorEvents)
    .where(and(eq(visitorEvents.ip, ip), gt(visitorEvents.createdAt, since7d)))
    .groupBy(visitorEvents.country, visitorEvents.region, visitorEvents.city)
    .orderBy(desc(count()))
    .limit(8)
    .all()
    .map(row => ({
      country: row.country || '',
      region: row.region || '',
      city: row.city || '',
      label: [row.country, row.region, row.city].filter(Boolean).join(' · ') || '未知',
      count: Number(row.value)
    }))

  const relatedBans = client.db.select().from(visitorBans)
    .where(and(eq(visitorBans.scope, 'ip'), eq(visitorBans.value, ip)))
    .orderBy(desc(visitorBans.createdAt))
    .limit(20)
    .all()
    .map(row => ({
      id: row.id,
      scope: row.scope,
      value: row.value,
      reason: row.reason,
      isActive: row.isActive,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      bannedByAdminId: row.bannedByAdminId,
      createdAt: new Date(row.createdAt).toISOString()
    }))

  const activeBanCount = relatedBans.filter(b => isBanEffectivelyActive(b, now)).length
  const isBanned = activeBanCount > 0
  const linkedUserIds = [...new Set(visitorRows.map(v => v.userId).filter(Boolean))] as string[]

  const recentEvents = client.db.select().from(visitorEvents)
    .where(eq(visitorEvents.ip, ip))
    .orderBy(desc(visitorEvents.createdAt))
    .limit(20)
    .all()
    .map(row => ({
      id: row.id,
      visitorId: row.visitorId,
      action: row.action,
      path: row.path,
      method: row.method,
      ip: row.ip,
      city: row.city,
      createdAt: new Date(row.createdAt).toISOString()
    }))

  const factors: Array<{ code: string; points: number; message: string }> = []
  if (isBanned) factors.push({ code: 'IP_BANNED', points: 50, message: '该 IP 已命中生效封禁' })
  if (uniqueVisitors24h >= 5) factors.push({ code: 'MULTI_VISITOR_IP', points: 25, message: `近 24 小时关联 ${uniqueVisitors24h} 个访客` })
  else if (uniqueVisitors24h >= 3) factors.push({ code: 'MULTI_VISITOR_IP', points: 15, message: `近 24 小时关联 ${uniqueVisitors24h} 个访客` })
  if (events1h >= 80) factors.push({ code: 'BURST_1H', points: 25, message: `近 1 小时操作 ${events1h} 次` })
  else if (events1h >= 30) factors.push({ code: 'BURST_1H', points: 12, message: `近 1 小时操作 ${events1h} 次` })
  if (events24h >= 500) factors.push({ code: 'HIGH_VOLUME_24H', points: 20, message: `近 24 小时操作 ${events24h} 次` })
  else if (events24h >= 150) factors.push({ code: 'HIGH_VOLUME_24H', points: 10, message: `近 24 小时操作 ${events24h} 次` })
  if (linkedUserIds.length >= 3) factors.push({ code: 'MULTI_ACCOUNT_IP', points: 15, message: `关联账号 ${linkedUserIds.length} 个` })
  if (userAgentHistory.length >= 5) factors.push({ code: 'UA_DIVERSITY', points: 8, message: `近 7 天设备或浏览器共 ${userAgentHistory.length} 种` })

  const risk = scoreRisk(factors)

  const seqSource = client.db.select({
    path: visitorEvents.path,
    action: visitorEvents.action,
    createdAt: visitorEvents.createdAt
  }).from(visitorEvents)
    .where(eq(visitorEvents.ip, ip))
    .orderBy(desc(visitorEvents.createdAt))
    .limit(100)
    .all()

  const pathSequence = buildPathSequence(
    seqSource.map(row => ({
      path: row.path,
      action: row.action,
      createdAt: Number(row.createdAt)
    })),
    12
  )
  const pathTransitions = buildPathTransitions(
    seqSource.map(row => ({ path: row.path, createdAt: Number(row.createdAt) })),
    8
  )
  const burstWindows = buildBurstWindows(
    seqSource.map(row => ({ createdAt: Number(row.createdAt) })),
    10 * 60 * 1000,
    6
  )

  const firstEventAt = seqSource.length
    ? new Date(Math.min(...seqSource.map(row => Number(row.createdAt)))).toISOString()
    : null
  const lastEventAt = seqSource.length
    ? new Date(Math.max(...seqSource.map(row => Number(row.createdAt)))).toISOString()
    : null

  const peerIpRows = client.db.select({
    ip: visitorEvents.ip,
    value: count()
  }).from(visitorEvents)
    .where(and(gt(visitorEvents.createdAt, since24h), isNotNull(visitorEvents.ip), sql`trim(${visitorEvents.ip}) != ''`))
    .groupBy(visitorEvents.ip)
    .orderBy(desc(count()))
    .limit(200)
    .all()
  const peerPopulation = peerIpRows.map(row => Number(row.value))
  const peerComparison = {
    events24h,
    percentile: percentileRank(events24h, peerPopulation),
    sampleSize: peerPopulation.length
  }

  const evidenceEvents = events24h + events1h + visitorRows.length
  const confidence = riskConfidence(risk.riskFactors.length, evidenceEvents)
  const relationship = {
    visitorIds: visitorRows.map(row => row.id),
    linkedUserIds,
    topPaths: pathTop.slice(0, 5).map(row => row.path),
    firstEventAt,
    lastEventAt
  }
  const sessions = buildSessions(
    seqSource.map(row => ({
      path: row.path,
      action: row.action,
      ip,
      createdAt: Number(row.createdAt)
    })),
    30 * 60 * 1000,
    12
  )
  const networkPrefix = normalizeNetworkPrefix(ip)
  const networkPeerRows = networkPrefix
    ? client.db.select({
      ip: visitorEvents.ip,
      visitorId: visitorEvents.visitorId,
      userId: visitorEvents.userId,
      city: visitorEvents.city,
      path: visitorEvents.path,
      createdAt: visitorEvents.createdAt
    }).from(visitorEvents)
      .where(and(gt(visitorEvents.createdAt, since24h), isNotNull(visitorEvents.ip)))
      .orderBy(desc(visitorEvents.createdAt))
      .limit(1000)
      .all()
      .filter(row => normalizeNetworkPrefix(row.ip) === networkPrefix)
    : []
  const networkProfile = buildNetworkClusters(
    networkPeerRows.map(row => ({
      ip: row.ip,
      visitorId: row.visitorId,
      userId: row.userId,
      city: row.city,
      path: row.path,
      createdAt: Number(row.createdAt)
    })),
    1
  )[0] || {
    prefix: networkPrefix,
    eventCount: events24h,
    ipCount: ip ? 1 : 0,
    visitorCount: uniqueVisitors24h,
    userCount: linkedUserIds.length,
    topCity: geoTrail[0]?.city || '',
    topPath: pathTop[0]?.path || '/',
    firstAt: firstEventAt,
    lastAt: lastEventAt,
    riskScore: 0,
    riskLevel: 'info'
  }
  const evidenceLedger = buildEvidenceLedger(risk.riskFactors, [
    {
      code: 'IP_PEER_PERCENTILE',
      message: `今天的访问量高于约 ${peerComparison.percentile}% 的网络来源`,
      weight: peerComparison.percentile >= 95 ? 20 : peerComparison.percentile >= 80 ? 10 : 3
    },
    {
      code: 'NETWORK_CLUSTER',
      message: `${networkProfile.prefix || '未知网络'} 关联 ${networkProfile.ipCount} 个地址、${networkProfile.visitorCount} 个访客`,
      weight: networkProfile.riskScore || 0
    },
    {
      code: 'SESSION_DENSITY',
      message: `最近样本切分为 ${sessions.length} 个会话`,
      weight: sessions.some(session => session.eventCount >= 40) ? 15 : 3
    }
  ])
  const playbook = buildInvestigationPlaybook({
    riskLevel: risk.riskLevel,
    isBanned,
    hasAccount: linkedUserIds.length > 0,
    hasCluster: networkProfile.visitorCount > 1 || networkProfile.ipCount > 1,
    auditHref: '/admin/audit?entityType=visitor_ban',
    visitorHref: `/admin/visitors?ip=${encodeURIComponent(ip)}`
  })
  const investigationSummary = {
    sessionCount: sessions.length,
    longestSessionSeconds: Math.max(0, ...sessions.map(session => session.durationSeconds)),
    densestSessionEvents: Math.max(0, ...sessions.map(session => session.eventCount)),
    evidenceCount: evidenceLedger.length,
    strongEvidenceCount: evidenceLedger.filter(item => item.strength === 'strong').length,
    networkRiskScore: networkProfile.riskScore,
    recommendedSteps: playbook.filter(step => step.status === 'recommended').length
  }


  const suggestedActions: Array<{
    kind: 'ban_ip' | 'review_visitors' | 'open_audit'
    label: string
    href: string
    reason: string
    priority: 'high' | 'medium' | 'low'
  }> = []

  if (!isBanned && (risk.riskLevel === 'high' || risk.riskLevel === 'medium')) {
    suggestedActions.push({
      kind: 'ban_ip',
      label: '建议封禁该 IP',
      href: `/admin/visitors?ip=${encodeURIComponent(ip)}`,
      reason: '当前 IP 风险偏高，可在访客页快速创建 IP 封禁',
      priority: risk.riskLevel === 'high' ? 'high' : 'medium'
    })
  }
  if (visitorRows.length) {
    suggestedActions.push({
      kind: 'review_visitors',
      label: '复核关联访客',
      href: `/admin/visitors?ip=${encodeURIComponent(ip)}`,
      reason: `该 IP 关联 ${visitorRows.length} 个访客档案`,
      priority: 'medium'
    })
  }
  suggestedActions.push({
    kind: 'open_audit',
    label: '查看相关审计',
    href: '/admin/audit?entityType=visitor_ban',
    reason: '核对历史封禁与管理操作',
    priority: 'low'
  })

  return {
    ip,
    generatedAt: new Date(now).toISOString(),
    summary: {
      visitorCount: visitorRows.length,
      uniqueVisitors24h,
      eventTotal,
      events1h,
      events24h,
      events7d,
      linkedUserCount: linkedUserIds.length,
      relatedBanCount: relatedBans.length,
      activeBanCount,
      isBanned,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      evidenceEvents,
      confidence,
      peerPercentile: peerComparison.percentile,
      firstEventAt,
      lastEventAt
    },
    riskScore: risk.riskScore,
    riskLevel: risk.riskLevel,
    riskFactors: risk.riskFactors,
    confidence,
    evidenceEvents,
    peerComparison,
    pathSequence,
    pathTransitions,
    burstWindows,
    sessions,
    networkProfile,
    evidenceLedger,
    playbook,
    investigationSummary,
    relationship,
    firstEventAt,
    lastEventAt,
    visitors: visitorRows,
    pathTop,
    actionBreakdown,
    userAgentHistory,
    geoTrail,
    relatedBans,
    recentEvents,
    suggestedActions
  }
}
