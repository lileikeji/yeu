import { randomUUID } from 'node:crypto'
import { and, desc, eq, or, sql } from 'drizzle-orm'
import { createError, deleteCookie, getCookie, getHeader, setCookie } from 'h3'
import type { H3Event } from 'h3'
import type {
  YeucaMemberItem,
  YeucaMemberStatus,
  YeucaPublicMemberProfile
} from '../../../shared/types/yeuca'
import { RESERVED_GIT_USERNAMES } from '../../../shared/schemas/yeuca'
import type { DatabaseClient } from '../../database/client'
import { recruitForms, recruitSubmissions, yeucaMembers, yeucaMemberSessions } from '../../database/schema'
import { getClientIpAddress } from '../../utils/client-ip'
import { hashUserPassword, verifyPassword } from '../../utils/password'
import { assertRateLimit } from '../../utils/rate-limit'
import { createOpaqueToken, getSecurityConfig, hashOpaqueToken } from '../../utils/security'
import { writeAudit } from '../../utils/audit'
import { syncGiteaAccount } from './gitea'

const MEMBER_SESSION_COOKIE = 'yeuca_member_session'
const HOST_MEMBER_SESSION_COOKIE = '__Host-yeuca_member_session'
const MEMBER_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

const DUMMY_PASSWORD_HASH = `scrypt$16384$8$1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`

export interface YeucaMemberDeps {
  giteaSync?: typeof syncGiteaAccount
}

export interface YeucaMemberSessionContext {
  member: YeucaPublicMemberProfile
  sessionId: string
  expiresAt: number
}

function isSecureRequest(event: H3Event): boolean {
  const proto = getHeader(event, 'x-forwarded-proto') || ''
  if (proto.toLowerCase().startsWith('https')) return true
  const url = event.node.req.url || ''
  if (url.startsWith('https://')) return true
  return process.env.NODE_ENV === 'production' && getHeader(event, 'host')?.includes('localhost') !== true
}

function parseSkills(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function toIsoOrNull(ms: number | null | undefined): string | null {
  return typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null
}

export function serializeAdminMember(row: typeof yeucaMembers.$inferSelect): YeucaMemberItem {
  return {
    id: row.id,
    studentNo: row.studentNo,
    name: row.name,
    gradeMajorClass: row.gradeMajorClass,
    department: row.department,
    roleTitle: row.roleTitle,
    term: row.term,
    phone: row.phone,
    qq: row.qq,
    email: row.email,
    gitUsername: row.gitUsername,
    gitUserId: row.gitUserId ?? null,
    gitSynced: Boolean(row.gitSynced),
    gitSyncError: row.gitSyncError,
    memberStatus: row.memberStatus,
    bio: row.bio,
    skills: parseSkills(row.skillsJson),
    notes: row.notes,
    recruitSubmissionId: row.recruitSubmissionId ?? null,
    registeredAt: toIsoOrNull(row.registeredAt),
    lastLoginAt: toIsoOrNull(row.lastLoginAt),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  }
}

export function serializePublicMember(row: typeof yeucaMembers.$inferSelect): YeucaPublicMemberProfile {
  return {
    id: row.id,
    studentNo: row.studentNo,
    name: row.name,
    gradeMajorClass: row.gradeMajorClass,
    department: row.department,
    roleTitle: row.roleTitle,
    term: row.term,
    phone: row.phone,
    qq: row.qq,
    email: row.email,
    gitUsername: row.gitUsername,
    gitSynced: Boolean(row.gitSynced),
    memberStatus: row.memberStatus,
    bio: row.bio,
    skills: parseSkills(row.skillsJson),
    registeredAt: toIsoOrNull(row.registeredAt),
    lastLoginAt: toIsoOrNull(row.lastLoginAt)
  }
}

function buildSuggestedGitUsername(studentNo: string): string {
  const cleaned = studentNo.trim().replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase()
  if (cleaned.length >= 3 && /^[a-z0-9]/.test(cleaned) && !RESERVED_GIT_USERNAMES.has(cleaned)) {
    return cleaned
  }
  return `stu-${cleaned || 'member'}`
}

function resolveMemberEmail(gitUsername: string, customEmail?: string): string {
  const trimmed = (customEmail || '').trim().toLowerCase()
  if (trimmed) return trimmed
  return `${gitUsername.toLowerCase()}@member.yeuca.huiliyill.cn`
}

function readMemberToken(event: H3Event): string | undefined {
  const hostCookie = getCookie(event, HOST_MEMBER_SESSION_COOKIE)
  if (hostCookie) return hostCookie
  const cookie = getCookie(event, MEMBER_SESSION_COOKIE)
  if (cookie) return cookie
  const headerToken = getHeader(event, 'x-yeuca-member-token')
  if (headerToken && headerToken.trim()) return headerToken.trim()
  return undefined
}

function setMemberSessionCookie(event: H3Event, rawToken: string, expiresAt: number): void {
  const secure = isSecureRequest(event)
  const name = secure ? HOST_MEMBER_SESSION_COOKIE : MEMBER_SESSION_COOKIE
  const fallbackName = secure ? MEMBER_SESSION_COOKIE : HOST_MEMBER_SESSION_COOKIE
  deleteCookie(event, fallbackName, { path: '/', sameSite: 'lax', secure: !secure })
  setCookie(event, name, rawToken, {
    path: '/',
    sameSite: 'lax',
    secure,
    httpOnly: true,
    expires: new Date(expiresAt)
  })
}

export function clearMemberSessionCookie(event: H3Event): void {
  const common = { path: '/' as const, sameSite: 'lax' as const }
  deleteCookie(event, HOST_MEMBER_SESSION_COOKIE, { ...common, secure: true })
  deleteCookie(event, HOST_MEMBER_SESSION_COOKIE, { ...common, secure: false })
  deleteCookie(event, MEMBER_SESSION_COOKIE, { ...common, secure: true })
  deleteCookie(event, MEMBER_SESSION_COOKIE, { ...common, secure: false })
}

function resolveMemberSecret(event: H3Event): string {
  try {
    return getSecurityConfig(event).secret
  } catch {
    const fallback = (process.env.NUXT_ADMIN_SESSION_SECRET || '').trim()
    if (Buffer.byteLength(fallback) >= 32) return fallback
    throw createError({
      statusCode: 500,
      statusMessage: 'Member session secret is not configured',
      data: { code: 'SERVER_SECURITY_MISCONFIGURED' }
    })
  }
}

function issueMemberSession(
  event: H3Event,
  client: DatabaseClient,
  memberRow: typeof yeucaMembers.$inferSelect
): YeucaMemberSessionContext & { sessionToken: string } {
  const secret = resolveMemberSecret(event)
  const rawToken = createOpaqueToken()
  const tokenHash = hashOpaqueToken(secret, 'yeuca-member-session', rawToken)
  const now = Date.now()
  const expiresAt = now + MEMBER_SESSION_TTL_MS
  const sessionId = randomUUID()
  const ua = (getHeader(event, 'user-agent') || '').slice(0, 240)

  client.db.insert(yeucaMemberSessions).values({
    id: sessionId,
    memberId: memberRow.id,
    tokenHash,
    expiresAt,
    lastSeenAt: now,
    userAgent: ua,
    createdAt: now
  }).run()

  client.db.update(yeucaMembers).set({
    lastLoginAt: now,
    updatedAt: now
  }).where(eq(yeucaMembers.id, memberRow.id)).run()

  setMemberSessionCookie(event, rawToken, expiresAt)
  return {
    member: serializePublicMember({ ...memberRow, lastLoginAt: now }),
    sessionId,
    expiresAt,
    sessionToken: rawToken
  }
}

export function readOptionalYeucaMemberSession(
  event: H3Event,
  client: DatabaseClient
): YeucaMemberSessionContext | null {
  const rawToken = readMemberToken(event)
  if (!rawToken) return null

  const secret = resolveMemberSecret(event)
  const tokenHash = hashOpaqueToken(secret, 'yeuca-member-session', rawToken)
  const now = Date.now()

  const row = client.db
    .select({
      session: yeucaMemberSessions,
      member: yeucaMembers
    })
    .from(yeucaMemberSessions)
    .innerJoin(yeucaMembers, eq(yeucaMemberSessions.memberId, yeucaMembers.id))
    .where(eq(yeucaMemberSessions.tokenHash, tokenHash))
    .get()

  if (!row) return null
  if (row.session.expiresAt <= now || row.member.memberStatus !== 'active') {
    client.db.delete(yeucaMemberSessions).where(eq(yeucaMemberSessions.id, row.session.id)).run()
    clearMemberSessionCookie(event)
    return null
  }

  if (now - row.session.lastSeenAt >= SESSION_TOUCH_INTERVAL_MS) {
    client.db.update(yeucaMemberSessions)
      .set({ lastSeenAt: now })
      .where(eq(yeucaMemberSessions.id, row.session.id))
      .run()
  }

  return {
    member: serializePublicMember(row.member),
    sessionId: row.session.id,
    expiresAt: row.session.expiresAt
  }
}

export function requireYeucaMemberSession(
  event: H3Event,
  client: DatabaseClient
): YeucaMemberSessionContext {
  const context = readOptionalYeucaMemberSession(event, client)
  if (!context) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Member login required',
      data: { code: 'MEMBER_AUTH_REQUIRED', message: '请先登录计算机协会成员账号' }
    })
  }
  return context
}

export function logoutYeucaMember(event: H3Event, client: DatabaseClient): void {
  const rawToken = readMemberToken(event)
  if (rawToken) {
    const secret = resolveMemberSecret(event)
    const tokenHash = hashOpaqueToken(secret, 'yeuca-member-session', rawToken)
    client.db.delete(yeucaMemberSessions).where(eq(yeucaMemberSessions.tokenHash, tokenHash)).run()
  }
  clearMemberSessionCookie(event)
}

const PROTECTED_CHIEF_ROLES = new Set(['会长', '副会长'])

function recordMemberAudit(
  client: DatabaseClient,
  event: H3Event | undefined,
  action: string,
  entityId: string | null,
  details: Record<string, unknown>
): void {
  if (!event) return
  writeAudit(client, event, {
    actorAdminId: null,
    action,
    entityType: 'yeuca_member',
    entityId,
    details: {
      ...details,
      ip: getClientIpAddress(event)
    }
  })
}

/* ---------- 公开端：名录核验、开放注册、成员登录与个人操作 ---------- */

export function verifyMemberEligibility(
  event: H3Event,
  client: DatabaseClient,
  studentNo: string,
  name: string
) {
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `yeuca-member-verify:${ip}`, 30, 10 * 60 * 1000, client)

  const normalizedNo = studentNo.trim()
  const normalizedName = name.trim()

  const found = client.db
    .select()
    .from(yeucaMembers)
    .where(sql`lower(${yeucaMembers.studentNo}) = lower(${normalizedNo})`)
    .get()

  if (!found || found.name.trim() !== normalizedName) {
    recordMemberAudit(client, event, 'yeuca.member.verify_rejected', found?.id ?? null, {
      studentNo: normalizedNo,
      name: normalizedName,
      department: found?.department ?? '',
      reason: 'NOT_IN_LIST'
    })
    return {
      eligible: false as const,
      reason: 'NOT_IN_LIST',
      message: '未在协会成员名录中查到该学号与姓名，请确认是否已通过招新或联系管理员录入名单'
    }
  }

  if (found.memberStatus === 'disabled') {
    recordMemberAudit(client, event, 'yeuca.member.verify_rejected', found.id, {
      studentNo: found.studentNo,
      name: found.name,
      department: found.department,
      reason: 'DISABLED'
    })
    return {
      eligible: false as const,
      reason: 'DISABLED',
      message: '该成员名额当前已停用，请联系协会管理员核实'
    }
  }

  if (found.memberStatus === 'active') {
    recordMemberAudit(client, event, 'yeuca.member.verify_rejected', found.id, {
      studentNo: found.studentNo,
      name: found.name,
      department: found.department,
      reason: 'ALREADY_REGISTERED'
    })
    return {
      eligible: false as const,
      reason: 'ALREADY_REGISTERED',
      message: '该学号已完成官网注册与 Git 账号激活，请直接切换「会员登录」进入'
    }
  }

  recordMemberAudit(client, event, 'yeuca.member.verify_passed', found.id, {
    studentNo: found.studentNo,
    name: found.name,
    department: found.department
  })

  return {
    eligible: true as const,
    profile: {
      studentNo: found.studentNo,
      name: found.name,
      gradeMajorClass: found.gradeMajorClass,
      department: found.department,
      roleTitle: found.roleTitle,
      email: found.email,
      suggestedGitUsername: found.gitUsername || buildSuggestedGitUsername(found.studentNo)
    }
  }
}

export async function registerYeucaMember(
  event: H3Event,
  client: DatabaseClient,
  input: {
    studentNo: string
    name: string
    gitUsername: string
    email: string
    password: string
    gradeMajorClass?: string
    phone?: string
    qq?: string
    bio?: string
  },
  deps: YeucaMemberDeps = {}
) {
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `yeuca-member-reg:${ip}`, 10, 60 * 60 * 1000, client)

  const normalizedNo = input.studentNo.trim()
  const normalizedName = input.name.trim()
  const normalizedGitUser = input.gitUsername.trim().toLowerCase()

  const member = client.db
    .select()
    .from(yeucaMembers)
    .where(sql`lower(${yeucaMembers.studentNo}) = lower(${normalizedNo})`)
    .get()

  if (!member || member.name.trim() !== normalizedName) {
    recordMemberAudit(client, event, 'yeuca.member.register_rejected', member?.id ?? null, {
      studentNo: normalizedNo,
      name: normalizedName,
      department: member?.department ?? '',
      reason: 'NOT_IN_LIST'
    })
    throw createError({
      statusCode: 403,
      statusMessage: 'Not eligible for registration',
      data: { code: 'NOT_IN_LIST', message: '学号与姓名未在可注册成员名单内，仅限导入名录内的协会成员注册' }
    })
  }
  if (member.memberStatus === 'disabled') {
    recordMemberAudit(client, event, 'yeuca.member.register_rejected', member.id, {
      studentNo: member.studentNo,
      name: member.name,
      department: member.department,
      reason: 'MEMBER_DISABLED'
    })
    throw createError({
      statusCode: 403,
      statusMessage: 'Member is disabled',
      data: { code: 'MEMBER_DISABLED', message: '该成员名额已停用，无法注册' }
    })
  }
  if (member.memberStatus === 'active') {
    recordMemberAudit(client, event, 'yeuca.member.register_rejected', member.id, {
      studentNo: member.studentNo,
      name: member.name,
      department: member.department,
      reason: 'ALREADY_REGISTERED'
    })
    throw createError({
      statusCode: 409,
      statusMessage: 'Member already registered',
      data: { code: 'ALREADY_REGISTERED', message: '该成员账号已激活注册，请直接登录' }
    })
  }

  const conflictGit = client.db
    .select({ id: yeucaMembers.id })
    .from(yeucaMembers)
    .where(and(
      sql`lower(${yeucaMembers.gitUsername}) = ${normalizedGitUser}`,
      sql`${yeucaMembers.id} != ${member.id}`
    ))
    .get()

  if (conflictGit) {
    recordMemberAudit(client, event, 'yeuca.member.register_rejected', member.id, {
      studentNo: member.studentNo,
      name: member.name,
      department: member.department,
      gitUsername: normalizedGitUser,
      reason: 'GIT_USERNAME_TAKEN'
    })
    throw createError({
      statusCode: 409,
      statusMessage: 'Git username already taken',
      data: { code: 'GIT_USERNAME_TAKEN', message: `Git 用户名「${normalizedGitUser}」已被其他成员占用，请更换` }
    })
  }

  const finalEmail = resolveMemberEmail(normalizedGitUser, input.email || member.email)
  const giteaSync = deps.giteaSync ?? syncGiteaAccount
  let gitResult: Awaited<ReturnType<typeof syncGiteaAccount>>
  try {
    gitResult = await giteaSync({
      username: normalizedGitUser,
      email: finalEmail,
      fullName: member.name,
      password: input.password,
      active: true,
      rejectIfUsernameExists: true
    })
  } catch (err: unknown) {
    const errObj = err as { data?: { message?: string, code?: string }, statusMessage?: string }
    const errMsg = errObj?.data?.message || errObj?.statusMessage || (err instanceof Error ? err.message : 'Gitea 同步失败')
    recordMemberAudit(client, event, 'yeuca.member.gitea_sync_failed', member.id, {
      studentNo: member.studentNo,
      name: member.name,
      department: member.department,
      gitUsername: normalizedGitUser,
      code: errObj?.data?.code || 'GIT_PROVISION_FAILED',
      error: errMsg
    })
    throw err
  }

  const now = Date.now()
  const passwordHash = await hashUserPassword(input.password)

  client.db.update(yeucaMembers).set({
    gitUsername: normalizedGitUser,
    gitUserId: gitResult.gitUserId,
    gitSynced: gitResult.synced,
    gitSyncError: gitResult.error,
    email: finalEmail,
    gradeMajorClass: input.gradeMajorClass?.trim() || member.gradeMajorClass,
    phone: input.phone?.trim() || member.phone,
    qq: input.qq?.trim() || member.qq,
    bio: input.bio?.trim() ?? member.bio,
    passwordHash,
    memberStatus: 'active',
    registeredAt: now,
    updatedAt: now
  }).where(eq(yeucaMembers.id, member.id)).run()

  recordMemberAudit(client, event, 'yeuca.member.register', member.id, {
    studentNo: member.studentNo,
    name: member.name,
    department: member.department,
    gitUsername: normalizedGitUser,
    gitSynced: gitResult.synced,
    gitUserId: gitResult.gitUserId,
    gitSyncError: gitResult.error
  })

  const updated = client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, member.id)).get()!
  const session = issueMemberSession(event, client, updated)
  return {
    authenticated: true,
    member: session.member,
    expiresAt: new Date(session.expiresAt).toISOString(),
    sessionToken: session.sessionToken
  }
}

export async function loginYeucaMember(
  event: H3Event,
  client: DatabaseClient,
  account: string,
  password: string
) {
  const ip = getClientIpAddress(event)
  const cleanAccount = account.trim()
  assertRateLimit(event, `yeuca-member-login-ip:${ip}`, 30, 15 * 60 * 1000, client)
  assertRateLimit(event, `yeuca-member-login:${ip}:${cleanAccount.toLowerCase()}`, 10, 15 * 60 * 1000, client)

  const member = client.db
    .select()
    .from(yeucaMembers)
    .where(or(
      sql`lower(${yeucaMembers.studentNo}) = lower(${cleanAccount})`,
      sql`lower(${yeucaMembers.gitUsername}) = lower(${cleanAccount})`
    ))
    .get()

  if (!member) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH)
    recordMemberAudit(client, event, 'yeuca.member.login_failed', null, {
      account: cleanAccount,
      reason: 'ACCOUNT_NOT_FOUND'
    })
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid account or password',
      data: { code: 'INVALID_CREDENTIALS', message: '学号/Git 用户名或密码错误' }
    })
  }

  if (member.memberStatus === 'pending') {
    recordMemberAudit(client, event, 'yeuca.member.login_failed', member.id, {
      studentNo: member.studentNo,
      department: member.department,
      reason: 'NOT_ACTIVATED'
    })
    throw createError({
      statusCode: 403,
      statusMessage: 'Member not activated yet',
      data: { code: 'NOT_ACTIVATED', message: '您的学号已在名录中，请先点击「名录注册」设置密码并开通 Git 账号' }
    })
  }

  if (member.memberStatus === 'disabled') {
    recordMemberAudit(client, event, 'yeuca.member.login_failed', member.id, {
      studentNo: member.studentNo,
      department: member.department,
      reason: 'MEMBER_DISABLED'
    })
    throw createError({
      statusCode: 403,
      statusMessage: 'Member account disabled',
      data: { code: 'MEMBER_DISABLED', message: '该成员账号已被管理员停用，无法登录官网及 Git 站' }
    })
  }

  const ok = member.passwordHash ? await verifyPassword(password, member.passwordHash) : false
  if (!ok) {
    recordMemberAudit(client, event, 'yeuca.member.login_failed', member.id, {
      studentNo: member.studentNo,
      department: member.department,
      reason: 'WRONG_PASSWORD'
    })
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid account or password',
      data: { code: 'INVALID_CREDENTIALS', message: '学号/Git 用户名或密码错误' }
    })
  }

  recordMemberAudit(client, event, 'yeuca.member.login', member.id, {
    studentNo: member.studentNo,
    name: member.name,
    department: member.department,
    gitUsername: member.gitUsername
  })

  const session = issueMemberSession(event, client, member)
  return {
    authenticated: true,
    member: session.member,
    expiresAt: new Date(session.expiresAt).toISOString(),
    sessionToken: session.sessionToken
  }
}

export async function updateMemberProfile(
  client: DatabaseClient,
  memberId: string,
  input: {
    gradeMajorClass?: string
    phone?: string
    qq?: string
    email?: string
    bio?: string
    skills?: string[]
  },
  deps: YeucaMemberDeps = {},
  event?: H3Event
): Promise<YeucaPublicMemberProfile> {
  const existing = client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, memberId)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found', data: { code: 'NOT_FOUND' } })
  }

  const nextEmail = input.email !== undefined
    ? (input.email.trim().toLowerCase() || existing.email)
    : existing.email

  let gitSynced = existing.gitSynced
  let gitSyncError = existing.gitSyncError
  if (existing.gitUsername && input.email !== undefined && nextEmail !== existing.email) {
    const giteaSync = deps.giteaSync ?? syncGiteaAccount
    const syncRes = await giteaSync({
      username: existing.gitUsername,
      email: nextEmail,
      fullName: existing.name,
      active: existing.memberStatus === 'active'
    })
    gitSynced = syncRes.synced
    gitSyncError = syncRes.error
  }

  const now = Date.now()
  client.db.update(yeucaMembers).set({
    ...(input.gradeMajorClass !== undefined ? { gradeMajorClass: input.gradeMajorClass.trim() } : {}),
    ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
    ...(input.qq !== undefined ? { qq: input.qq.trim() } : {}),
    ...(input.email !== undefined ? { email: nextEmail } : {}),
    ...(input.bio !== undefined ? { bio: input.bio.trim() } : {}),
    ...(input.skills !== undefined ? { skillsJson: JSON.stringify(input.skills) } : {}),
    gitSynced,
    gitSyncError,
    updatedAt: now
  }).where(eq(yeucaMembers.id, memberId)).run()

  recordMemberAudit(client, event, 'yeuca.member.profile_update', existing.id, {
    studentNo: existing.studentNo,
    department: existing.department,
    fields: Object.keys(input),
    gitSynced,
    gitSyncError
  })

  return serializePublicMember(client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, memberId)).get()!)
}

export async function changeMemberPassword(
  client: DatabaseClient,
  memberId: string,
  currentPassword: string,
  newPassword: string,
  deps: YeucaMemberDeps = {},
  event?: H3Event
): Promise<{ gitSynced: boolean, gitSyncError: string }> {
  const existing = client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, memberId)).get()
  if (!existing || existing.memberStatus !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Member unavailable', data: { code: 'MEMBER_UNAVAILABLE' } })
  }

  const ok = existing.passwordHash ? await verifyPassword(currentPassword, existing.passwordHash) : false
  if (!ok) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Current password is incorrect',
      data: { code: 'WRONG_PASSWORD', message: '原密码不正确' }
    })
  }

  const nextHash = await hashUserPassword(newPassword)
  let gitSynced = existing.gitSynced
  let gitSyncError = existing.gitSyncError
  let gitUserId = existing.gitUserId

  if (existing.gitUsername) {
    const giteaSync = deps.giteaSync ?? syncGiteaAccount
    const res = await giteaSync({
      username: existing.gitUsername,
      email: resolveMemberEmail(existing.gitUsername, existing.email),
      fullName: existing.name,
      password: newPassword,
      active: true
    })
    gitSynced = res.synced
    gitSyncError = res.error
    gitUserId = res.gitUserId ?? gitUserId
  }

  client.db.update(yeucaMembers).set({
    passwordHash: nextHash,
    gitSynced,
    gitSyncError,
    gitUserId,
    updatedAt: Date.now()
  }).where(eq(yeucaMembers.id, memberId)).run()

  recordMemberAudit(client, event, 'yeuca.member.password_change', existing.id, {
    studentNo: existing.studentNo,
    department: existing.department,
    gitUsername: existing.gitUsername,
    gitSynced,
    gitSyncError
  })

  return { gitSynced, gitSyncError }
}

/* ---------- 管理后台：成员台账 CRUD、批量导入与招新转正 ---------- */

export function getYeucaMemberById(client: DatabaseClient, id: string): YeucaMemberItem | null {
  const row = client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, id)).get()
  return row ? serializeAdminMember(row) : null
}

export function listYeucaMembersAdmin(client: DatabaseClient): YeucaMemberItem[] {
  return client.db
    .select()
    .from(yeucaMembers)
    .orderBy(desc(yeucaMembers.updatedAt), desc(yeucaMembers.createdAt))
    .all()
    .map(serializeAdminMember)
}

export async function createYeucaMemberAdmin(
  client: DatabaseClient,
  adminId: string,
  input: {
    studentNo: string
    name: string
    gradeMajorClass: string
    department: string
    roleTitle: string
    term: string
    phone: string
    qq: string
    email: string
    gitUsername: string
    memberStatus: YeucaMemberStatus
    initialPassword?: string
    bio: string
    skills: string[]
    notes: string
  },
  deps: YeucaMemberDeps = {}
): Promise<YeucaMemberItem> {
  const cleanStudentNo = input.studentNo.trim()
  const existing = client.db
    .select({ id: yeucaMembers.id })
    .from(yeucaMembers)
    .where(sql`lower(${yeucaMembers.studentNo}) = lower(${cleanStudentNo})`)
    .get()

  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Student number already exists',
      data: { code: 'DUPLICATE_STUDENT_NO', message: `学号「${cleanStudentNo}」已在成员名录中` }
    })
  }

  const hasInitialPassword = Boolean(input.initialPassword && input.initialPassword.trim().length >= 8)
  const resolvedStatus: YeucaMemberStatus = input.memberStatus === 'active' && !hasInitialPassword
    ? 'pending'
    : input.memberStatus

  let cleanGitUsername = input.gitUsername.trim().toLowerCase()
  if (resolvedStatus === 'active' && !cleanGitUsername) {
    cleanGitUsername = buildSuggestedGitUsername(cleanStudentNo)
  }

  if (cleanGitUsername) {
    const dupGit = client.db
      .select({ id: yeucaMembers.id })
      .from(yeucaMembers)
      .where(sql`lower(${yeucaMembers.gitUsername}) = ${cleanGitUsername}`)
      .get()
    if (dupGit) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Git username already taken',
        data: { code: 'GIT_USERNAME_TAKEN', message: `Git 用户名「${cleanGitUsername}」已被占用` }
      })
    }
  }

  let gitSynced = false
  let gitUserId: number | null = null
  let gitSyncError = ''
  let passwordHash = ''
  let registeredAt: number | null = null
  const finalEmail = cleanGitUsername
    ? resolveMemberEmail(cleanGitUsername, input.email)
    : input.email.trim().toLowerCase()

  if (hasInitialPassword && input.initialPassword) {
    passwordHash = await hashUserPassword(input.initialPassword)
    if (resolvedStatus === 'active') {
      registeredAt = Date.now()
    }
    const giteaSync = deps.giteaSync ?? syncGiteaAccount
    const syncRes = await giteaSync({
      username: cleanGitUsername || buildSuggestedGitUsername(cleanStudentNo),
      email: resolveMemberEmail(cleanGitUsername || buildSuggestedGitUsername(cleanStudentNo), finalEmail),
      fullName: input.name.trim(),
      password: input.initialPassword,
      active: resolvedStatus === 'active'
    })
    gitSynced = syncRes.synced
    gitUserId = syncRes.gitUserId
    gitSyncError = syncRes.error
  }

  const now = Date.now()
  const id = randomUUID()
  client.db.insert(yeucaMembers).values({
    id,
    studentNo: cleanStudentNo,
    name: input.name.trim(),
    gradeMajorClass: input.gradeMajorClass.trim(),
    department: input.department.trim(),
    roleTitle: input.roleTitle.trim() || '会员',
    term: input.term.trim(),
    phone: input.phone.trim(),
    qq: input.qq.trim(),
    email: finalEmail,
    gitUsername: cleanGitUsername,
    gitUserId,
    gitSynced,
    gitSyncError,
    memberStatus: resolvedStatus,
    passwordHash,
    bio: input.bio.trim(),
    skillsJson: JSON.stringify(input.skills),
    notes: input.notes.trim(),
    registeredAt,
    createdByAdminId: adminId,
    createdAt: now,
    updatedAt: now
  }).run()

  return serializeAdminMember(client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, id)).get()!)
}

export async function updateYeucaMemberAdmin(
  client: DatabaseClient,
  id: string,
  input: Partial<{
    studentNo: string
    name: string
    gradeMajorClass: string
    department: string
    roleTitle: string
    term: string
    phone: string
    qq: string
    email: string
    gitUsername: string
    memberStatus: YeucaMemberStatus
    bio: string
    skills: string[]
    notes: string
  }>,
  deps: YeucaMemberDeps = {}
): Promise<YeucaMemberItem> {
  const existing = client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found', data: { code: 'NOT_FOUND' } })
  }

  if (input.studentNo && input.studentNo.trim().toLowerCase() !== existing.studentNo.toLowerCase()) {
    const dup = client.db.select({ id: yeucaMembers.id }).from(yeucaMembers)
      .where(sql`lower(${yeucaMembers.studentNo}) = lower(${input.studentNo.trim()})`)
      .get()
    if (dup) {
      throw createError({ statusCode: 409, statusMessage: 'Student number already exists', data: { code: 'DUPLICATE_STUDENT_NO', message: '学号已存在' } })
    }
  }

  const nextGitUser = input.gitUsername !== undefined ? input.gitUsername.trim().toLowerCase() : existing.gitUsername
  if (nextGitUser && nextGitUser !== existing.gitUsername) {
    const dupGit = client.db.select({ id: yeucaMembers.id }).from(yeucaMembers)
      .where(sql`lower(${yeucaMembers.gitUsername}) = ${nextGitUser}`)
      .get()
    if (dupGit && dupGit.id !== id) {
      throw createError({ statusCode: 409, statusMessage: 'Git username taken', data: { code: 'GIT_USERNAME_TAKEN', message: 'Git 用户名已被占用' } })
    }
  }

  const nextStatus = input.memberStatus ?? existing.memberStatus
  if (nextStatus === 'active' && !existing.passwordHash) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot activate member without password',
      data: { code: 'NO_PASSWORD', message: '该成员尚未在注册页设定密码，请保持「待激活」或先为其重置密码后再启用' }
    })
  }

  const nextName = input.name?.trim() ?? existing.name
  const nextEmail = input.email !== undefined
    ? (input.email.trim().toLowerCase() || (nextGitUser ? resolveMemberEmail(nextGitUser, '') : ''))
    : existing.email

  let gitSynced = existing.gitSynced
  let gitUserId = existing.gitUserId
  let gitSyncError = existing.gitSyncError

  if (nextGitUser && (existing.passwordHash || existing.gitSynced)) {
    const giteaSync = deps.giteaSync ?? syncGiteaAccount
    const syncRes = await giteaSync({
      username: nextGitUser,
      email: resolveMemberEmail(nextGitUser, nextEmail),
      fullName: nextName,
      active: nextStatus === 'active'
    })
    gitSynced = syncRes.synced
    gitUserId = syncRes.gitUserId ?? gitUserId
    gitSyncError = syncRes.error
  }

  if (nextStatus === 'disabled') {
    client.db.delete(yeucaMemberSessions).where(eq(yeucaMemberSessions.memberId, id)).run()
  }

  client.db.update(yeucaMembers).set({
    ...(input.studentNo !== undefined ? { studentNo: input.studentNo.trim() } : {}),
    ...(input.name !== undefined ? { name: nextName } : {}),
    ...(input.gradeMajorClass !== undefined ? { gradeMajorClass: input.gradeMajorClass.trim() } : {}),
    ...(input.department !== undefined ? { department: input.department.trim() } : {}),
    ...(input.roleTitle !== undefined ? { roleTitle: input.roleTitle.trim() } : {}),
    ...(input.term !== undefined ? { term: input.term.trim() } : {}),
    ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
    ...(input.qq !== undefined ? { qq: input.qq.trim() } : {}),
    ...(input.email !== undefined ? { email: nextEmail } : {}),
    ...(input.gitUsername !== undefined ? { gitUsername: nextGitUser } : {}),
    memberStatus: nextStatus,
    ...(input.bio !== undefined ? { bio: input.bio.trim() } : {}),
    ...(input.skills !== undefined ? { skillsJson: JSON.stringify(input.skills) } : {}),
    ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
    gitSynced,
    gitUserId,
    gitSyncError,
    updatedAt: Date.now()
  }).where(eq(yeucaMembers.id, id)).run()

  return serializeAdminMember(client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, id)).get()!)
}

export async function resetYeucaMemberPasswordAdmin(
  client: DatabaseClient,
  id: string,
  newPassword: string,
  activateIfPending: boolean,
  deps: YeucaMemberDeps = {}
): Promise<YeucaMemberItem> {
  const existing = client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found', data: { code: 'NOT_FOUND' } })
  }

  const nextStatus: YeucaMemberStatus = existing.memberStatus === 'pending' && activateIfPending
    ? 'active'
    : existing.memberStatus
  const nextGitUser = existing.gitUsername || buildSuggestedGitUsername(existing.studentNo)
  const nextEmail = resolveMemberEmail(nextGitUser, existing.email)
  const passwordHash = await hashUserPassword(newPassword)

  const giteaSync = deps.giteaSync ?? syncGiteaAccount
  const syncRes = await giteaSync({
    username: nextGitUser,
    email: nextEmail,
    fullName: existing.name,
    password: newPassword,
    active: nextStatus === 'active'
  })

  const now = Date.now()
  client.db.update(yeucaMembers).set({
    passwordHash,
    gitUsername: nextGitUser,
    email: nextEmail,
    memberStatus: nextStatus,
    registeredAt: existing.registeredAt ?? now,
    gitSynced: syncRes.synced,
    gitUserId: syncRes.gitUserId ?? existing.gitUserId,
    gitSyncError: syncRes.error,
    updatedAt: now
  }).where(eq(yeucaMembers.id, id)).run()

  return serializeAdminMember(client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, id)).get()!)
}

export async function syncYeucaMemberGitAdmin(
  client: DatabaseClient,
  id: string,
  deps: YeucaMemberDeps = {}
): Promise<YeucaMemberItem> {
  const existing = client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found', data: { code: 'NOT_FOUND' } })
  }
  const targetGitUser = existing.gitUsername || buildSuggestedGitUsername(existing.studentNo)
  const giteaSync = deps.giteaSync ?? syncGiteaAccount
  const syncRes = await giteaSync({
    username: targetGitUser,
    email: resolveMemberEmail(targetGitUser, existing.email),
    fullName: existing.name,
    active: existing.memberStatus === 'active'
  })

  client.db.update(yeucaMembers).set({
    gitSynced: syncRes.synced,
    gitUserId: syncRes.gitUserId ?? existing.gitUserId,
    gitSyncError: syncRes.error,
    updatedAt: Date.now()
  }).where(eq(yeucaMembers.id, id)).run()

  return serializeAdminMember(client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, id)).get()!)
}

export async function deleteYeucaMemberAdmin(
  client: DatabaseClient,
  id: string,
  deps: YeucaMemberDeps = {}
): Promise<void> {
  const existing = client.db.select().from(yeucaMembers).where(eq(yeucaMembers.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found', data: { code: 'NOT_FOUND' } })
  }
  if (existing.gitUsername && existing.gitSynced) {
    const giteaSync = deps.giteaSync ?? syncGiteaAccount
    await giteaSync({
      username: existing.gitUsername,
      email: resolveMemberEmail(existing.gitUsername, existing.email),
      fullName: existing.name,
      active: false
    }).catch(() => undefined)
  }
  client.db.delete(yeucaMembers).where(eq(yeucaMembers.id, id)).run()
}

export function importYeucaMembersAdmin(
  client: DatabaseClient,
  adminId: string,
  mode: 'skip_existing' | 'update_existing',
  items: Array<{
    studentNo: string
    name: string
    gradeMajorClass: string
    department: string
    roleTitle: string
    term: string
    phone: string
    qq: string
    email: string
    gitUsername: string
    memberStatus?: YeucaMemberStatus
    notes: string
  }>,
  scopedDepartment: string | null = null
): { inserted: number, updated: number, skipped: number, total: number } {
  const now = Date.now()
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const raw of items) {
    const cleanStudentNo = raw.studentNo.trim()
    const cleanName = raw.name.trim()
    if (!cleanStudentNo || !cleanName) {
      skipped++
      continue
    }

    const existing = client.db
      .select()
      .from(yeucaMembers)
      .where(sql`lower(${yeucaMembers.studentNo}) = lower(${cleanStudentNo})`)
      .get()

    const resolvedDept = scopedDepartment ? scopedDepartment.trim() : raw.department.trim()
    const rawRole = raw.roleTitle.trim() || '会员'
    const resolvedRole = scopedDepartment && PROTECTED_CHIEF_ROLES.has(rawRole) ? '会员' : rawRole

    if (existing) {
      if (scopedDepartment && existing.department.trim() !== scopedDepartment.trim()) {
        skipped++
        continue
      }
      if (mode === 'skip_existing') {
        skipped++
        continue
      }
      client.db.update(yeucaMembers).set({
        name: cleanName,
        ...(raw.gradeMajorClass.trim() ? { gradeMajorClass: raw.gradeMajorClass.trim() } : {}),
        ...(resolvedDept ? { department: resolvedDept } : {}),
        ...(raw.roleTitle.trim() ? { roleTitle: resolvedRole } : {}),
        ...(raw.term.trim() ? { term: raw.term.trim() } : {}),
        ...(raw.phone.trim() ? { phone: raw.phone.trim() } : {}),
        ...(raw.qq.trim() ? { qq: raw.qq.trim() } : {}),
        ...(raw.email.trim() ? { email: raw.email.trim().toLowerCase() } : {}),
        ...(raw.notes.trim() ? { notes: raw.notes.trim() } : {}),
        ...(raw.memberStatus === 'disabled' ? { memberStatus: 'disabled' } : {}),
        updatedAt: now
      }).where(eq(yeucaMembers.id, existing.id)).run()
      updated++
      continue
    }

    let gitUser = raw.gitUsername.trim().toLowerCase()
    if (gitUser) {
      const taken = client.db
        .select({ id: yeucaMembers.id })
        .from(yeucaMembers)
        .where(sql`lower(${yeucaMembers.gitUsername}) = ${gitUser}`)
        .get()
      if (taken || RESERVED_GIT_USERNAMES.has(gitUser)) {
        gitUser = ''
      }
    }

    const initialStatus: YeucaMemberStatus = raw.memberStatus === 'disabled' ? 'disabled' : 'pending'

    client.db.insert(yeucaMembers).values({
      id: randomUUID(),
      studentNo: cleanStudentNo,
      name: cleanName,
      gradeMajorClass: raw.gradeMajorClass.trim(),
      department: resolvedDept,
      roleTitle: resolvedRole,
      term: raw.term.trim(),
      phone: raw.phone.trim(),
      qq: raw.qq.trim(),
      email: raw.email.trim().toLowerCase(),
      gitUsername: gitUser,
      gitSynced: false,
      memberStatus: initialStatus,
      notes: raw.notes.trim(),
      createdByAdminId: adminId,
      createdAt: now,
      updatedAt: now
    }).run()
    inserted++
  }

  return {
    inserted,
    updated,
    skipped,
    total: items.length
  }
}

function submissionMatchesDepartment(departmentsText: string, targetDept: string): boolean {
  const parts = departmentsText
    .split(/[,，/、]/)
    .map(item => item.trim())
    .filter(Boolean)
  return parts.includes(targetDept.trim())
}

export function approveRecruitSubmissionsToMembers(
  client: DatabaseClient,
  contentId: string,
  adminId: string,
  submissionIds: string[],
  defaultDepartment = '',
  defaultTerm = '',
  scopedDepartment: string | null = null
): { imported: number, skippedNoStudentNo: number, skippedAlreadyExists: number } {
  const form = client.db
    .select({ id: recruitForms.id })
    .from(recruitForms)
    .where(eq(recruitForms.contentId, contentId))
    .get()

  if (!form) {
    throw createError({ statusCode: 404, statusMessage: 'Recruit form not found', data: { code: 'NOT_FOUND' } })
  }

  const allSubs = client.db
    .select()
    .from(recruitSubmissions)
    .where(eq(recruitSubmissions.formId, form.id))
    .all()

  const idSet = new Set(submissionIds)
  const targetSubs = allSubs.filter(sub => idSet.has(sub.id))

  let imported = 0
  let skippedNoStudentNo = 0
  let skippedAlreadyExists = 0
  const now = Date.now()

  for (const sub of targetSubs) {
    if (scopedDepartment && !submissionMatchesDepartment(sub.departments || '', scopedDepartment)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Submission does not match minister department',
        data: {
          code: 'YEUCA_DEPARTMENT_FORBIDDEN',
          message: `报名记录「${sub.name || sub.studentNo}」的意向部门不含「${scopedDepartment}」，无法审批转入`
        }
      })
    }

    const cleanNo = (sub.studentNo || '').trim()
    const cleanName = (sub.name || '').trim()
    if (!cleanNo || !cleanName || !/^[a-zA-Z0-9_-]{4,32}$/.test(cleanNo)) {
      skippedNoStudentNo++
      continue
    }

    const exists = client.db
      .select({ id: yeucaMembers.id })
      .from(yeucaMembers)
      .where(sql`lower(${yeucaMembers.studentNo}) = lower(${cleanNo})`)
      .get()

    if (exists) {
      skippedAlreadyExists++
      continue
    }

    const majorClass = [sub.major || '', sub.className || ''].filter(Boolean).join(' ').trim()
    const dept = scopedDepartment
      ? scopedDepartment.trim()
      : (sub.departments || defaultDepartment || '').split(/[,，/、]/)[0]?.trim() || defaultDepartment

    client.db.insert(yeucaMembers).values({
      id: randomUUID(),
      studentNo: cleanNo,
      name: cleanName,
      gradeMajorClass: majorClass,
      department: dept,
      roleTitle: '会员',
      term: defaultTerm.trim(),
      phone: (sub.phone || '').trim(),
      qq: (sub.qq || '').trim(),
      email: '',
      gitUsername: '',
      memberStatus: 'pending',
      recruitSubmissionId: sub.id,
      notes: scopedDepartment ? `由${scopedDepartment}部长纳新审批入档` : '由纳新报名审批入档',
      createdByAdminId: adminId,
      createdAt: now,
      updatedAt: now
    }).run()
    imported++
  }

  return { imported, skippedNoStudentNo, skippedAlreadyExists }
}
