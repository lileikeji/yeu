import { createHash, randomUUID } from 'node:crypto'
import { and, count, desc, eq, like, or } from 'drizzle-orm'
import { createError } from 'h3'
import type { DatabaseClient } from '../../database/client'
import { emailVerifications, userSessions, users } from '../../database/schema'
import { hashUserPassword } from '../../utils/password'
import { generateVerificationCode } from '../../utils/mailer'

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

// ---------- 开放注册（邮箱验证码） ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_]{2,20}$/
export const REGISTRATION_CODE_TTL_MS = 10 * 60 * 1000
export const REGISTRATION_CODE_MAX_ATTEMPTS = 5

export interface RegistrationInput {
  username: string
  nickname?: string
  password: string
  email: string
}

function assertRegistrationIdentityAvailable(client: DatabaseClient, username: string, email: string): void {
  const nameTaken = client.db.select({ id: users.id }).from(users)
    .where(eq(users.username, username))
    .get()
  if (nameTaken) {
    throw createError({ statusCode: 409, statusMessage: '用户名已被使用', data: { code: 'REG_USERNAME_TAKEN' } })
  }
  const emailTaken = client.db.select({ id: users.id }).from(users)
    .where(eq(users.email, email))
    .get()
  if (emailTaken) {
    throw createError({ statusCode: 409, statusMessage: '邮箱已被注册', data: { code: 'REG_EMAIL_TAKEN' } })
  }
}

function normalizeRegistrationInput(input: RegistrationInput): { username: string, nickname: string, email: string, password: string } {
  const username = input.username.trim()
  const nickname = (input.nickname ?? '').trim().slice(0, 12) || username
  const email = input.email.trim().toLowerCase()
  const password = input.password
  if (!USERNAME_RE.test(username)) {
    throw createError({ statusCode: 422, statusMessage: '用户名 2-20 位，可为中文、字母、数字、下划线', data: { code: 'REG_USERNAME_INVALID' } })
  }
  if (!EMAIL_RE.test(email)) {
    throw createError({ statusCode: 422, statusMessage: '邮箱格式不正确', data: { code: 'REG_EMAIL_INVALID' } })
  }
  if (password.length < 8 || password.length > 72) {
    throw createError({ statusCode: 422, statusMessage: '密码至少 8 位', data: { code: 'REG_PASSWORD_INVALID' } })
  }
  return { username, nickname, email, password }
}

/** 校验注册信息并下发邮箱验证码。sendEmail 由路由注入（SMTP 配置检查在路由）。 */
export async function requestRegistrationCode(
  client: DatabaseClient,
  input: RegistrationInput,
  sendEmail: (to: string, code: string) => Promise<boolean>
): Promise<{ sent: boolean }> {
  const normalized = normalizeRegistrationInput(input)
  assertRegistrationIdentityAvailable(client, normalized.username, normalized.email)

  const code = generateVerificationCode()
  const codeHash = createHash('sha256').update(code).digest('hex')
  const now = Date.now()
  client.db.insert(emailVerifications)
    .values({
      email: normalized.email,
      codeHash,
      attempts: 0,
      expiresAt: now + REGISTRATION_CODE_TTL_MS,
      createdAt: now
    })
    .onConflictDoUpdate({
      target: emailVerifications.email,
      set: { codeHash, attempts: 0, expiresAt: now + REGISTRATION_CODE_TTL_MS, createdAt: now }
    })
    .run()

  const sent = await sendEmail(normalized.email, code)
  if (!sent) {
    throw createError({ statusCode: 502, statusMessage: '验证码邮件发送失败，请稍后再试', data: { code: 'REG_SEND_FAILED' } })
  }
  return { sent: true }
}

/** 验证码校验 + 建号（邮箱已验证）；username/email 冲突时 409。 */
export async function registerUser(
  client: DatabaseClient,
  input: RegistrationInput & { code: string }
): Promise<typeof users.$inferSelect> {
  const normalized = normalizeRegistrationInput(input)
  assertRegistrationIdentityAvailable(client, normalized.username, normalized.email)

  const row = client.db.select().from(emailVerifications)
    .where(eq(emailVerifications.email, normalized.email))
    .get()
  if (!row) {
    throw createError({ statusCode: 422, statusMessage: '请先获取邮箱验证码', data: { code: 'REG_CODE_MISSING' } })
  }
  if (row.expiresAt <= Date.now()) {
    throw createError({ statusCode: 422, statusMessage: '验证码已过期，请重新获取', data: { code: 'REG_CODE_EXPIRED' } })
  }
  if (row.attempts >= REGISTRATION_CODE_MAX_ATTEMPTS) {
    throw createError({ statusCode: 422, statusMessage: '尝试次数过多，请重新获取验证码', data: { code: 'REG_CODE_LOCKED' } })
  }
  const codeHash = createHash('sha256').update(input.code.trim()).digest('hex')
  if (codeHash !== row.codeHash) {
    client.db.update(emailVerifications)
      .set({ attempts: row.attempts + 1 })
      .where(eq(emailVerifications.email, normalized.email))
      .run()
    throw createError({ statusCode: 422, statusMessage: '验证码不正确', data: { code: 'REG_CODE_MISMATCH' } })
  }

  const now = Date.now()
  const passwordHash = await hashUserPassword(normalized.password)
  const id = randomUUID()
  try {
    client.db.insert(users).values({
      id,
      username: normalized.username,
      passwordHash,
      displayName: normalized.nickname,
      email: normalized.email,
      emailVerifiedAt: now,
      status: 'active',
      createdAt: now,
      updatedAt: now
    }).run()
  } catch {
    throw createError({ statusCode: 409, statusMessage: '用户名或邮箱已被使用', data: { code: 'REG_CONFLICT' } })
  }
  client.db.delete(emailVerifications).where(eq(emailVerifications.email, normalized.email)).run()

  const created = client.db.select().from(users).where(eq(users.id, id)).get()
  if (!created) throw new Error('REGISTRATION_INSERT_MISSING')
  return created
}
