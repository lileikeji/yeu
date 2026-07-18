import { and, count, desc, eq, gt, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import {
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

  return {
    user,
    summary: {
      linkedVisitorCount: linkedVisitors.length,
      banCount: bans.length,
      activeBanCount: bans.filter(b => b.isActive).length,
      muteCount: mutes.length,
      activeMuteCount: mutes.filter(m => m.isActive).length,
      messageTotal,
      messageDeleted,
      activeSessions,
      membershipCount: memberships.length,
      auditCount: auditItems.length
    },
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

  return {
    visitor,
    summary: {
      eventTotal,
      events7d,
      uniqueIps,
      uniquePaths,
      actionCounts: actionBreakdown.length,
      relatedBanCount: relatedBans.length,
      activeBanCount: relatedBans.filter((ban) => {
        if (!ban.isActive) return false
        if (ban.expiresAt && Date.parse(ban.expiresAt) <= now) return false
        return true
      }).length,
      isBanned,
      hasLinkedUser: Boolean(linkedUser),
      sameIpVisitorCount: sameIpVisitors.length
    },
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
