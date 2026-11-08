import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, like, lt, or, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { findBannedWord } from '../../../shared/constants/chat-banned-words'
import type { DatabaseClient } from '../../database/client'
import {
  chatMembers,
  chatMessages,
  chatMutes,
  chatRooms,
  places,
  users
} from '../../database/schema'

export const PUBLIC_CHAT_ROOM_ID = '00000000-0000-4000-8000-000000000001'

function slugifyDorm(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `dorm-${base || 'room'}`.slice(0, 80)
}

export function ensurePublicRoom(client: DatabaseClient) {
  const existing = client.db.select().from(chatRooms)
    .where(eq(chatRooms.id, PUBLIC_CHAT_ROOM_ID))
    .get()
  if (existing) return existing
  const now = Date.now()
  const row = {
    id: PUBLIC_CHAT_ROOM_ID,
    kind: 'public' as const,
    slug: 'public',
    title: '公共群聊',
    dormBuilding: null,
    isMutedAll: false,
    isActive: true,
    createdAt: now,
    updatedAt: now
  }
  client.db.insert(chatRooms).values(row).run()
  return row
}

export function ensureDormRoom(client: DatabaseClient, dormBuilding: string) {
  const name = dormBuilding.trim()
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Dorm building is required',
      data: { code: 'DORM_REQUIRED' }
    })
  }
  const existing = client.db.select().from(chatRooms)
    .where(and(eq(chatRooms.kind, 'dorm'), eq(chatRooms.dormBuilding, name)))
    .get()
  if (existing) return existing

  const now = Date.now()
  let slug = slugifyDorm(name)
  const slugTaken = client.db.select({ id: chatRooms.id }).from(chatRooms)
    .where(eq(chatRooms.slug, slug))
    .get()
  if (slugTaken) slug = `${slug}-${randomUUID().slice(0, 8)}`

  const row = {
    id: randomUUID(),
    kind: 'dorm' as const,
    slug,
    title: `${name} 楼群`,
    dormBuilding: name,
    placeId: null,
    isMutedAll: false,
    isActive: true,
    createdAt: now,
    updatedAt: now
  }
  client.db.insert(chatRooms).values(row).run()
  return row
}

// 楼栋群 slug：place-<placeId>
function slugifyPlace(placeId: string): string {
  return `place-${placeId.trim().toLowerCase()}`.slice(0, 80)
}

/**
 * 楼栋群（kind='place'）：每个楼栋类地图点位一个群，懒创建。
 * 与宿舍群（kind='dorm'，按 chatDormBuilding 限定同楼）不同——place 房
 * 任何登录用户都可进（见 assertUserCanAccessRoom）。
 */
export function ensurePlaceRoom(
  client: DatabaseClient,
  place: { placeId: string, title: string }
) {
  const placeId = place.placeId.trim()
  if (!placeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Place id is required',
      data: { code: 'PLACE_REQUIRED' }
    })
  }
  const existing = client.db.select().from(chatRooms)
    .where(and(eq(chatRooms.kind, 'place'), eq(chatRooms.placeId, placeId)))
    .get()
  if (existing) return existing

  const now = Date.now()
  let slug = slugifyPlace(placeId)
  const slugTaken = client.db.select({ id: chatRooms.id }).from(chatRooms)
    .where(eq(chatRooms.slug, slug))
    .get()
  if (slugTaken) slug = `${slug}-${randomUUID().slice(0, 8)}`

  const row = {
    id: randomUUID(),
    kind: 'place' as const,
    slug,
    title: `${place.title.trim().slice(0, 40)} 群聊`,
    dormBuilding: null,
    placeId,
    isMutedAll: false,
    isActive: true,
    createdAt: now,
    updatedAt: now
  }
  client.db.insert(chatRooms).values(row).run()
  return row
}

export function ensureMembership(client: DatabaseClient, roomId: string, userId: string) {
  const existing = client.db.select().from(chatMembers)
    .where(and(eq(chatMembers.roomId, roomId), eq(chatMembers.userId, userId)))
    .get()
  if (existing) return existing
  const now = Date.now()
  const row = {
    roomId,
    userId,
    joinedAt: now,
    lastReadAt: now
  }
  client.db.insert(chatMembers).values(row).run()
  return row
}

export function listRoomsForUser(
  client: DatabaseClient,
  user: { id: string; chatDormBuilding: string | null }
) {
  ensurePublicRoom(client)
  const publicRoom = ensurePublicRoom(client)
  ensureMembership(client, publicRoom.id, user.id)

  const rooms = [publicRoom]
  if (user.chatDormBuilding?.trim()) {
    const dormRoom = ensureDormRoom(client, user.chatDormBuilding)
    ensureMembership(client, dormRoom.id, user.id)
    rooms.push(dormRoom)
  }

  return rooms.map((room) => {
    const personalMute = getActiveMute(client, user.id, room.id)
    return {
      id: room.id,
      kind: room.kind,
      slug: room.slug,
      title: room.title,
      dormBuilding: room.dormBuilding,
      isMutedAll: room.isMutedAll,
      isMuted: Boolean(personalMute),
      muteReason: personalMute?.reason || null,
      isActive: room.isActive
    }
  })
}

export function getRoomOrThrow(client: DatabaseClient, roomId: string) {
  const room = client.db.select().from(chatRooms).where(eq(chatRooms.id, roomId)).get()
  if (!room || !room.isActive) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Chat room not found',
      data: { code: 'CHAT_ROOM_NOT_FOUND' }
    })
  }
  return room
}

export function assertUserCanAccessRoom(
  client: DatabaseClient,
  room: { id: string; kind: string; dormBuilding: string | null },
  user: { id: string; chatDormBuilding: string | null }
) {
  if (room.kind === 'public') {
    ensureMembership(client, room.id, user.id)
    return
  }
  if (room.kind === 'dorm') {
    if (!user.chatDormBuilding || user.chatDormBuilding !== room.dormBuilding) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Not a member of this dorm room',
        data: { code: 'CHAT_ROOM_FORBIDDEN' }
      })
    }
    ensureMembership(client, room.id, user.id)
    return
  }
  if (room.kind === 'place') {
    // 楼栋群对全体登录用户开放
    ensureMembership(client, room.id, user.id)
    return
  }
  throw createError({
    statusCode: 403,
    statusMessage: 'Chat room forbidden',
    data: { code: 'CHAT_ROOM_FORBIDDEN' }
  })
}

function isMuteActive(row: { isActive: boolean; expiresAt: number | null }, now: number) {
  return row.isActive && (!row.expiresAt || row.expiresAt > now)
}

export function getActiveMute(
  client: DatabaseClient,
  userId: string,
  roomId: string
) {
  const now = Date.now()
  const rows = client.db.select().from(chatMutes)
    .where(and(
      eq(chatMutes.userId, userId),
      eq(chatMutes.isActive, true),
      or(isNull(chatMutes.roomId), eq(chatMutes.roomId, roomId))
    ))
    .all()
  return rows.find(row => isMuteActive(row, now)) ?? null
}

export function listMessages(
  client: DatabaseClient,
  roomId: string,
  query: { after?: string; before?: string; limit: number }
) {
  const conditions = [
    eq(chatMessages.roomId, roomId),
    isNull(chatMessages.deletedAt)
  ]

  if (query.after) {
    const afterRow = client.db.select().from(chatMessages)
      .where(eq(chatMessages.id, query.after))
      .get()
    if (afterRow) conditions.push(gt(chatMessages.createdAt, afterRow.createdAt))
  }
  if (query.before) {
    const beforeRow = client.db.select().from(chatMessages)
      .where(eq(chatMessages.id, query.before))
      .get()
    if (beforeRow) conditions.push(lt(chatMessages.createdAt, beforeRow.createdAt))
  }

  const rows = client.db.select().from(chatMessages)
    .where(and(...conditions))
    .orderBy(query.after ? asc(chatMessages.createdAt) : desc(chatMessages.createdAt))
    .limit(query.limit)
    .all()

  const ordered = query.after ? rows : rows.reverse()
  return ordered.map(row => ({
    id: row.id,
    roomId: row.roomId,
    userId: row.userId,
    displayName: row.displayName,
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString()
  }))
}

export function sendMessage(
  client: DatabaseClient,
  room: { id: string; isMutedAll: boolean },
  user: { id: string; displayName: string },
  body: string
) {
  const text = body.trim()
  if (!text) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Message body required',
      data: { code: 'VALIDATION_ERROR' }
    })
  }
  const banned = findBannedWord(text)
  if (banned) {
    throw createError({
      statusCode: 422,
      statusMessage: `消息包含违禁内容（${banned.label}），无法发送`,
      data: { code: 'CHAT_BANNED_WORD', category: banned.label }
    })
  }
  if (room.isMutedAll) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Room is muted for all members',
      data: { code: 'CHAT_MUTED_ALL' }
    })
  }
  const mute = getActiveMute(client, user.id, room.id)
  if (mute) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You are muted',
      data: { code: 'CHAT_MUTED', reason: mute.reason || null }
    })
  }

  const now = Date.now()
  const id = randomUUID()
  client.db.insert(chatMessages).values({
    id,
    roomId: room.id,
    userId: user.id,
    displayName: user.displayName,
    body: text,
    deletedAt: null,
    createdAt: now
  }).run()
  client.db.update(chatMembers).set({ lastReadAt: now })
    .where(and(eq(chatMembers.roomId, room.id), eq(chatMembers.userId, user.id)))
    .run()

  return {
    id,
    roomId: room.id,
    userId: user.id,
    displayName: user.displayName,
    body: text,
    createdAt: new Date(now).toISOString()
  }
}

export function listAdminRooms(client: DatabaseClient) {
  ensurePublicRoom(client)
  const now = Date.now()
  const rooms = client.db.select().from(chatRooms)
    .orderBy(desc(chatRooms.createdAt))
    .all()

  return rooms.map((room) => {
    const messageCount = client.db.select({ value: count() }).from(chatMessages)
      .where(eq(chatMessages.roomId, room.id))
      .get()?.value ?? 0
    const deletedMessageCount = client.db.select({ value: count() }).from(chatMessages)
      .where(and(eq(chatMessages.roomId, room.id), isNotNull(chatMessages.deletedAt)))
      .get()?.value ?? 0
    const memberCount = client.db.select({ value: count() }).from(chatMembers)
      .where(eq(chatMembers.roomId, room.id))
      .get()?.value ?? 0
    const activeMuteCount = client.db.select({ value: count() }).from(chatMutes)
      .where(and(
        eq(chatMutes.roomId, room.id),
        eq(chatMutes.isActive, true),
        or(isNull(chatMutes.expiresAt), gt(chatMutes.expiresAt, now))
      ))
      .get()?.value ?? 0
    const lastMessage = client.db.select({
      createdAt: chatMessages.createdAt,
      body: chatMessages.body,
      displayName: chatMessages.displayName
    }).from(chatMessages)
      .where(eq(chatMessages.roomId, room.id))
      .orderBy(desc(chatMessages.createdAt))
      .limit(1)
      .get()

    return {
      id: room.id,
      kind: room.kind,
      slug: room.slug,
      title: room.title,
      dormBuilding: room.dormBuilding,
      isMutedAll: room.isMutedAll,
      isActive: room.isActive,
      createdAt: new Date(room.createdAt).toISOString(),
      messageCount: Number(messageCount),
      deletedMessageCount: Number(deletedMessageCount),
      memberCount: Number(memberCount),
      activeMuteCount: Number(activeMuteCount),
      lastMessageAt: lastMessage ? new Date(lastMessage.createdAt).toISOString() : null,
      lastMessagePreview: lastMessage ? String(lastMessage.body || '').slice(0, 80) : null,
      lastMessageAuthor: lastMessage?.displayName || null
    }
  })
}

export function listAdminMessages(
  client: DatabaseClient,
  query: {
    page: number
    pageSize: number
    roomId?: string
    userId?: string
    q?: string
    deleted?: 'true' | 'false' | 'all'
  }
) {
  const offset = (query.page - 1) * query.pageSize
  const conditions = []
  if (query.roomId) conditions.push(eq(chatMessages.roomId, query.roomId))
  if (query.userId) conditions.push(eq(chatMessages.userId, query.userId))
  if (query.q) conditions.push(like(chatMessages.body, `%${query.q}%`))
  if (query.deleted === 'true') conditions.push(isNotNull(chatMessages.deletedAt))
  if (query.deleted === 'false') conditions.push(isNull(chatMessages.deletedAt))
  const where = conditions.length ? and(...conditions) : undefined
  const rows = client.db.select({
    id: chatMessages.id,
    roomId: chatMessages.roomId,
    userId: chatMessages.userId,
    displayName: chatMessages.displayName,
    body: chatMessages.body,
    deletedAt: chatMessages.deletedAt,
    createdAt: chatMessages.createdAt,
    roomTitle: chatRooms.title,
    username: users.username
  }).from(chatMessages)
    .leftJoin(chatRooms, eq(chatMessages.roomId, chatRooms.id))
    .leftJoin(users, eq(chatMessages.userId, users.id))
    .where(where)
    .orderBy(desc(chatMessages.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(chatMessages).where(where).get()?.value ?? 0
  return {
    items: rows.map(row => ({
      id: row.id,
      roomId: row.roomId,
      userId: row.userId,
      displayName: row.displayName,
      username: row.username || null,
      roomTitle: row.roomTitle || null,
      body: row.body,
      deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString()
    })),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
}


export function softDeleteAdminMessage(client: DatabaseClient, messageId: string): boolean {
  const existing = client.db.select({
    id: chatMessages.id,
    deletedAt: chatMessages.deletedAt
  }).from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .get()

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Chat message not found',
      data: { code: 'CHAT_MESSAGE_NOT_FOUND' }
    })
  }

  if (existing.deletedAt) {
    return false
  }

  const now = Date.now()
  const result = client.db.update(chatMessages).set({
    deletedAt: now
  }).where(and(
    eq(chatMessages.id, messageId),
    isNull(chatMessages.deletedAt)
  )).run()

  return (result.changes ?? 0) > 0
}

export function setRoomMutedAll(
  client: DatabaseClient,
  roomId: string,
  muted: boolean
) {
  const now = Date.now()
  const result = client.db.update(chatRooms).set({
    isMutedAll: muted,
    updatedAt: now
  }).where(eq(chatRooms.id, roomId)).run()
  if (!(result.changes ?? 0)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Chat room not found',
      data: { code: 'CHAT_ROOM_NOT_FOUND' }
    })
  }
}

export function muteUser(
  client: DatabaseClient,
  input: {
    userId: string
    roomId?: string | null
    reason?: string
    expiresAt?: string | null
    mutedByAdminId: string | null
  }
) {
  const user = client.db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).get()
  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
      data: { code: 'USER_NOT_FOUND' }
    })
  }
  if (input.roomId) getRoomOrThrow(client, input.roomId)
  const now = Date.now()
  const id = randomUUID()
  client.db.insert(chatMutes).values({
    id,
    roomId: input.roomId ?? null,
    userId: input.userId,
    reason: input.reason?.trim() || '',
    mutedByAdminId: input.mutedByAdminId,
    expiresAt: input.expiresAt ? Date.parse(input.expiresAt) : null,
    isActive: true,
    createdAt: now,
    updatedAt: now
  }).run()
  return id
}

export function listActiveMutes(
  client: DatabaseClient,
  query: { page: number; pageSize: number }
) {
  const offset = (query.page - 1) * query.pageSize
  const now = Date.now()
  const rows = client.db.select({
    id: chatMutes.id,
    userId: chatMutes.userId,
    roomId: chatMutes.roomId,
    reason: chatMutes.reason,
    isActive: chatMutes.isActive,
    expiresAt: chatMutes.expiresAt,
    createdAt: chatMutes.createdAt,
    displayName: users.displayName,
    username: users.username,
    roomTitle: chatRooms.title
  }).from(chatMutes)
    .leftJoin(users, eq(chatMutes.userId, users.id))
    .leftJoin(chatRooms, eq(chatMutes.roomId, chatRooms.id))
    .where(eq(chatMutes.isActive, true))
    .orderBy(desc(chatMutes.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
    .filter(row => !row.expiresAt || row.expiresAt > now)

  const total = client.db.select({ value: count() }).from(chatMutes)
    .where(eq(chatMutes.isActive, true))
    .get()?.value ?? 0

  return {
    items: rows.map(row => ({
      id: row.id,
      userId: row.userId,
      roomId: row.roomId,
      reason: row.reason,
      isActive: row.isActive,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      displayName: row.displayName,
      username: row.username,
      roomTitle: row.roomTitle
    })),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
}

export function deactivateMute(client: DatabaseClient, muteId: string): boolean {
  const now = Date.now()
  const result = client.db.update(chatMutes).set({
    isActive: false,
    updatedAt: now
  }).where(eq(chatMutes.id, muteId)).run()
  return (result.changes ?? 0) > 0
}

export function listDormSuggestions(client: DatabaseClient, q?: string) {
  const conditions = [eq(places.type, 'dormitory'), eq(places.status, 'published')]
  if (q?.trim()) conditions.push(like(places.name, `%${q.trim()}%`))
  const rows = client.db.select({
    name: places.name
  }).from(places)
    .where(and(...conditions))
    .orderBy(asc(places.name))
    .limit(30)
    .all()

  const fromUsers = client.db.select({
    name: users.dormBuilding
  }).from(users)
    .where(and(
      sql`${users.dormBuilding} is not null`,
      sql`trim(${users.dormBuilding}) != ''`,
      q?.trim() ? like(users.dormBuilding, `%${q.trim()}%`) : sql`1=1`
    ))
    .limit(30)
    .all()

  const set = new Set<string>()
  for (const row of rows) set.add(row.name)
  for (const row of fromUsers) {
    if (row.name) set.add(row.name)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN')).slice(0, 30)
}

// ---------- 楼栋群（按地图点位分房） ----------

export interface PlaceChatRoomView {
  placeId: string
  title: string
  roomId: string | null
  memberCount: number
}

/** 楼栋类点位（published + category 为楼栋/宿舍）与其群房；未创建的 roomId 为 null。 */
export function listPlaceChatRooms(client: DatabaseClient): PlaceChatRoomView[] {
  const rows = client.db.select({ id: places.id, name: places.name })
    .from(places)
    .where(and(
      eq(places.status, 'published'),
      inArray(places.category, ['campus-building', 'dorm'])
    ))
    .orderBy(asc(places.name))
    .all()
  return rows.map((row) => {
    const room = client.db.select().from(chatRooms)
      .where(and(eq(chatRooms.kind, 'place'), eq(chatRooms.placeId, row.id)))
      .get()
    const memberCount = room
      ? client.db.select({ value: count() }).from(chatMembers)
          .where(eq(chatMembers.roomId, room.id)).get()?.value ?? 0
      : 0
    return {
      placeId: row.id,
      title: row.name,
      roomId: room?.id ?? null,
      memberCount: Number(memberCount)
    }
  })
}

/** 进入楼栋群：校验点位是楼栋类且已发布，懒建房 + 入会，返回 roomId。 */
export function enterPlaceChatRoom(
  client: DatabaseClient,
  user: { id: string },
  placeId: string
): { roomId: string, title: string } {
  const place = client.db.select({ id: places.id, name: places.name })
    .from(places)
    .where(and(
      eq(places.id, placeId.trim()),
      eq(places.status, 'published'),
      inArray(places.category, ['campus-building', 'dorm'])
    ))
    .get()
  if (!place) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Place not found',
      data: { code: 'CHAT_PLACE_NOT_FOUND' }
    })
  }
  const room = ensurePlaceRoom(client, { placeId: place.id, title: place.name })
  ensureMembership(client, room.id, user.id)
  return { roomId: room.id, title: place.name }
}

/** 房间内按关键词搜历史消息（LIKE，倒序，轻量限 50 条）。 */
export function searchRoomMessages(
  client: DatabaseClient,
  roomId: string,
  query: string,
  limit = 50
): Array<{ id: string, roomId: string, userId: string, displayName: string, body: string, createdAt: string }> {
  const keyword = query.trim()
  if (!keyword) return []
  const rows = client.db.select({
    id: chatMessages.id,
    roomId: chatMessages.roomId,
    userId: chatMessages.userId,
    displayName: chatMessages.displayName,
    body: chatMessages.body,
    createdAt: chatMessages.createdAt
  })
    .from(chatMessages)
    .where(and(
      eq(chatMessages.roomId, roomId),
      isNull(chatMessages.deletedAt),
      like(chatMessages.body, `%${keyword.replace(/[%_]/g, '\$&')}%`)
    ))
    .orderBy(desc(chatMessages.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50))
    .all()
  return rows.map(row => ({
    ...row,
    createdAt: new Date(row.createdAt).toISOString()
  }))
}
