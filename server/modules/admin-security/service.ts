import { and, count, desc, eq, gt, isNotNull, isNull, like, or, sql } from 'drizzle-orm'
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
