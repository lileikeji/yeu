import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, like, or } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import { userSessions, users } from '../../database/schema'
import { hashUserPassword } from '../../utils/password'

export function serializeAppUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    major: row.major,
    dormBuilding: row.dormBuilding,
    status: row.status,
    lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  }
}

export function listAppUsers(
  client: DatabaseClient,
  query: {
    page: number
    pageSize: number
    q?: string
    status?: 'active' | 'disabled' | 'banned'
    major?: string
    dormBuilding?: string
  }
) {
  const offset = (query.page - 1) * query.pageSize
  const conditions = []
  if (query.status) conditions.push(eq(users.status, query.status))
  if (query.major) conditions.push(eq(users.major, query.major))
  if (query.dormBuilding) conditions.push(eq(users.dormBuilding, query.dormBuilding))
  if (query.q) {
    const raw = query.q.trim()
    const likeValue = `%${raw}%`
    // Support deep-link by full/partial user id from admin panels.
    conditions.push(or(
      eq(users.id, raw),
      like(users.id, likeValue),
      like(users.username, likeValue),
      like(users.displayName, likeValue),
      like(users.major, likeValue),
      like(users.dormBuilding, likeValue)
    ))
  }
  const where = conditions.length ? and(...conditions) : undefined
  const rows = client.db.select().from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(users).where(where).get()?.value ?? 0
  return {
    items: rows.map(serializeAppUser),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
}

export async function createAppUser(
  client: DatabaseClient,
  input: {
    username: string
    password: string
    displayName: string
    major?: string | null
    dormBuilding?: string | null
    createdByAdminId: string | null
  }
) {
  const username = input.username.trim()
  const existing = client.db.select({ id: users.id }).from(users)
    .where(eq(users.username, username))
    .get()
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Username already exists',
      data: { code: 'USERNAME_TAKEN' }
    })
  }
  const now = Date.now()
  const id = randomUUID()
  const passwordHash = await hashUserPassword(input.password)
  client.db.insert(users).values({
    id,
    username,
    passwordHash,
    displayName: input.displayName.trim(),
    major: normalizeOptionalText(input.major),
    dormBuilding: normalizeOptionalText(input.dormBuilding),
    chatDormBuilding: normalizeOptionalText(input.dormBuilding),
    status: 'active',
    createdByAdminId: input.createdByAdminId,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now
  }).run()
  const row = client.db.select().from(users).where(eq(users.id, id)).get()!
  return serializeAppUser(row)
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export async function updateAppUser(
  client: DatabaseClient,
  userId: string,
  input: {
    displayName?: string
    major?: string | null
    dormBuilding?: string | null
    status?: 'active' | 'disabled' | 'banned'
    password?: string
  }
) {
  const existing = client.db.select().from(users).where(eq(users.id, userId)).get()
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
      data: { code: 'USER_NOT_FOUND' }
    })
  }
  const now = Date.now()
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: now }
  if (input.displayName !== undefined) patch.displayName = input.displayName.trim()
  if (input.major !== undefined) patch.major = normalizeOptionalText(input.major)
  if (input.dormBuilding !== undefined) {
    const dormBuilding = normalizeOptionalText(input.dormBuilding)
    patch.dormBuilding = dormBuilding
    patch.chatDormBuilding = dormBuilding
  }
  if (input.status !== undefined) patch.status = input.status
  if (input.password) patch.passwordHash = await hashUserPassword(input.password)

  client.db.update(users).set(patch).where(eq(users.id, userId)).run()
  if (input.status && input.status !== 'active') {
    client.db.delete(userSessions).where(eq(userSessions.userId, userId)).run()
  }
  const row = client.db.select().from(users).where(eq(users.id, userId)).get()!
  return serializeAppUser(row)
}

export function updateOwnProfile(
  client: DatabaseClient,
  userId: string,
  input: {
    displayName?: string
    major?: string | null
    dormBuilding?: string | null
  }
) {
  const existing = client.db.select().from(users).where(eq(users.id, userId)).get()
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
      data: { code: 'USER_NOT_FOUND' }
    })
  }

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: Date.now() }
  if (input.displayName !== undefined) patch.displayName = input.displayName.trim()
  if (input.major !== undefined) patch.major = normalizeOptionalText(input.major)
  if (input.dormBuilding !== undefined) patch.dormBuilding = normalizeOptionalText(input.dormBuilding)
  client.db.update(users).set(patch).where(eq(users.id, userId)).run()

  const row = client.db.select().from(users).where(eq(users.id, userId)).get()!
  return serializeAppUser(row)
}
