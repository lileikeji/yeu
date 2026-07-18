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

  const ipClusters = ipClusterRaw
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

  const multiVisitorIps = ipClusters.length
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
      message: `近 24 小时访客事件 ${events24h} 次，关注高频 IP 与路径`,
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
  if (ipClusters.some(row => row.visitorCount >= 4)) {
    const top = ipClusters[0]
    riskHints.push({
      level: 'medium',
      code: 'IP_VISITOR_CLUSTER',
      message: `IP ${top.ip} 近 24 小时关联 ${top.visitorCount} 个访客`,
      href: `/admin/visitors?ip=${encodeURIComponent(top.ip)}`
    })
  }
  if (deltas24h.visitorEvents >= 300) {
    riskHints.push({
      level: 'medium',
      code: 'EVENT_DELTA_SPIKE',
      message: `访客事件较前一窗口 +${deltas24h.visitorEvents}`,
      href: '/admin/visitors'
    })
  }
  if (events1h >= 120) {
    riskHints.push({
      level: 'high',
      code: 'EVENT_BURST_1H',
      message: `近 1 小时访客事件 ${events1h}，疑似突发扫描或异常流量`,
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
    ipClusters,
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
      riskLevel: userRisk.riskLevel
    },
    riskScore: userRisk.riskScore,
    riskLevel: userRisk.riskLevel,
    riskFactors: userRisk.riskFactors,
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
  if (events1h >= 40) visitorFactors.push({ code: 'BURST_1H', points: 25, message: `近 1 小时事件 ${events1h}` })
  else if (events1h >= 15) visitorFactors.push({ code: 'BURST_1H', points: 12, message: `近 1 小时事件 ${events1h}` })
  if (events24h >= 200) visitorFactors.push({ code: 'HIGH_VOLUME_24H', points: 18, message: `近 24 小时事件 ${events24h}` })
  else if (events24h >= 80) visitorFactors.push({ code: 'HIGH_VOLUME_24H', points: 8, message: `近 24 小时事件 ${events24h}` })
  if (uniqueIps >= 4) visitorFactors.push({ code: 'MULTI_IP', points: 16, message: `历史 IP ${uniqueIps} 个` })
  else if (uniqueIps >= 2) visitorFactors.push({ code: 'MULTI_IP', points: 6, message: `历史 IP ${uniqueIps} 个` })
  if (sameIpVisitors.length >= 4) visitorFactors.push({ code: 'SAME_IP_CLUSTER', points: 14, message: `同 IP 其他访客 ${sameIpVisitors.length}` })
  else if (sameIpVisitors.length >= 2) visitorFactors.push({ code: 'SAME_IP_CLUSTER', points: 6, message: `同 IP 其他访客 ${sameIpVisitors.length}` })
  if (userAgentHistory.length >= 4) visitorFactors.push({ code: 'UA_SWITCH', points: 8, message: `UA 切换 ${userAgentHistory.length} 种` })
  const visitorRisk = scoreRisk(visitorFactors)

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
        reason: '该访客最近使用此 IP，可联动封禁网段异常',
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
      reason: '展开同 IP 访客与事件聚类',
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
      riskLevel: visitorRisk.riskLevel
    },
    riskScore: visitorRisk.riskScore,
    riskLevel: visitorRisk.riskLevel,
    riskFactors: visitorRisk.riskFactors,
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
  if (events1h >= 80) factors.push({ code: 'BURST_1H', points: 25, message: `近 1 小时事件 ${events1h}` })
  else if (events1h >= 30) factors.push({ code: 'BURST_1H', points: 12, message: `近 1 小时事件 ${events1h}` })
  if (events24h >= 500) factors.push({ code: 'HIGH_VOLUME_24H', points: 20, message: `近 24 小时事件 ${events24h}` })
  else if (events24h >= 150) factors.push({ code: 'HIGH_VOLUME_24H', points: 10, message: `近 24 小时事件 ${events24h}` })
  if (linkedUserIds.length >= 3) factors.push({ code: 'MULTI_ACCOUNT_IP', points: 15, message: `关联账号 ${linkedUserIds.length} 个` })
  if (userAgentHistory.length >= 5) factors.push({ code: 'UA_DIVERSITY', points: 8, message: `近 7 天 UA 种类 ${userAgentHistory.length}` })

  const risk = scoreRisk(factors)
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
      riskLevel: risk.riskLevel
    },
    riskScore: risk.riskScore,
    riskLevel: risk.riskLevel,
    riskFactors: risk.riskFactors,
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
