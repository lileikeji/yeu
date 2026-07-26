import { randomUUID } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { DatabaseClient } from '../database/client'
import { userSessions, users } from '../database/schema'
import { verifyPassword } from './password'
import { getClientIpAddress } from './client-ip'
import { assertRateLimit } from './rate-limit'
import { assertTrustedOrigin } from './security'
import {
  clearUserAuthCookies,
  createOpaqueToken,
  getSecurityConfig,
  hashOpaqueToken,
  readUserCsrfCookie,
  readUserSessionCookie,
  safeEqual,
  setUserAuthCookies,
  USER_CSRF_HEADER_NAME
} from './user-security'
import { writeAudit } from './audit'

const DUMMY_PASSWORD_HASH = `scrypt$16384$8$1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000

function sessionIdleLimitMs(): number {
  const hours = Number(process.env.NUXT_USER_SESSION_IDLE_HOURS || 168)
  if (!Number.isFinite(hours)) return DEFAULT_SESSION_IDLE_MS
  return Math.min(720, Math.max(1, hours)) * 60 * 60 * 1000
}

export interface AppUserIdentity {
  id: string
  username: string
  displayName: string
  major: string | null
  dormBuilding: string | null
  chatDormBuilding: string | null
  status: 'active' | 'disabled' | 'banned'
}

export interface UserSessionContext {
  user: AppUserIdentity
  sessionId: string
  expiresAt: number
  csrfToken: string
}

function unauthorized(): never {
  throw createError({
    statusCode: 401,
    statusMessage: 'Authentication required',
    data: { code: 'AUTHENTICATION_REQUIRED' }
  })
}

function assertUserCsrf(
  event: H3Event,
  client: DatabaseClient,
  sessionId: string,
  expectedHash: string,
  secret: string
): string {
  assertTrustedOrigin(event)
  const cookieToken = readUserCsrfCookie(event) || ''
  const headerToken = getHeader(event, USER_CSRF_HEADER_NAME) || ''
  const actualHash = hashOpaqueToken(secret, 'user-csrf', headerToken)

  if (!headerToken
    || !cookieToken
    || !safeEqual(headerToken, cookieToken)
    || !safeEqual(actualHash, expectedHash)) {
    client.db.delete(userSessions).where(eq(userSessions.id, sessionId)).run()
    clearUserAuthCookies(event)
    throw createError({
      statusCode: 403,
      statusMessage: 'Invalid CSRF token',
      data: { code: 'CSRF_REJECTED' }
    })
  }

  return headerToken
}

export async function loginAppUser(
  event: H3Event,
  client: DatabaseClient,
  username: string,
  password: string
): Promise<UserSessionContext> {
  assertTrustedOrigin(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `user-login-ip:${ip}`, 30, 15 * 60 * 1000, client)
  assertRateLimit(event, `user-login:${ip}:${username.toLowerCase()}`, 8, 15 * 60 * 1000, client)

  if (password.length > 128) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid username or password',
      data: { code: 'INVALID_CREDENTIALS' }
    })
  }

  const now = Date.now()
  client.db.delete(userSessions).where(lt(userSessions.expiresAt, now)).run()
  const user = client.db.select().from(users)
    .where(eq(users.username, username))
    .get()
  const passwordMatches = await verifyPassword(password, user?.passwordHash || DUMMY_PASSWORD_HASH)

  if (!user || user.status !== 'active' || !passwordMatches) {
    writeAudit(client, event, {
      actorAdminId: null,
      action: 'user.login_failed',
      entityType: 'user',
      details: { username }
    })
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid username or password',
      data: { code: 'INVALID_CREDENTIALS' }
    })
  }

  const security = getSecurityConfig(event)
  const sessionToken = createOpaqueToken()
  const csrfToken = createOpaqueToken()
  const sessionId = randomUUID()
  const userTtlHours = Number(process.env.NUXT_USER_SESSION_TTL_HOURS || 336)
  const ttlMs = (Number.isFinite(userTtlHours) ? Math.min(720, Math.max(1, userTtlHours)) : 336) * 60 * 60 * 1000
  const expiresAt = now + ttlMs

  client.db.transaction((transaction) => {
    transaction.delete(userSessions).where(eq(userSessions.userId, user.id)).run()
    transaction.insert(userSessions).values({
      id: sessionId,
      userId: user.id,
      tokenHash: hashOpaqueToken(security.secret, 'user-session', sessionToken),
      csrfTokenHash: hashOpaqueToken(security.secret, 'user-csrf', csrfToken),
      expiresAt,
      lastSeenAt: now,
      createdAt: now
    }).run()
    transaction.update(users).set({
      lastLoginAt: now,
      updatedAt: now
    }).where(eq(users.id, user.id)).run()
  })

  setUserAuthCookies(event, sessionToken, csrfToken, expiresAt, security.secureCookies)

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      major: user.major,
      dormBuilding: user.dormBuilding,
      chatDormBuilding: user.chatDormBuilding,
      status: user.status
    },
    sessionId,
    expiresAt,
    csrfToken
  }
}

export function getOptionalUserSession(
  event: H3Event,
  client: DatabaseClient,
  options: { csrf?: boolean } = {}
): UserSessionContext | null {
  const sessionToken = readUserSessionCookie(event)
  if (!sessionToken) return null

  const security = getSecurityConfig(event)
  const tokenHash = hashOpaqueToken(security.secret, 'user-session', sessionToken)
  const result = client.db.select({
    sessionId: userSessions.id,
    csrfTokenHash: userSessions.csrfTokenHash,
    expiresAt: userSessions.expiresAt,
    lastSeenAt: userSessions.lastSeenAt,
    userId: users.id,
    username: users.username,
    displayName: users.displayName,
    major: users.major,
    dormBuilding: users.dormBuilding,
    chatDormBuilding: users.chatDormBuilding,
    status: users.status
  }).from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(eq(userSessions.tokenHash, tokenHash))
    .get()

  const now = Date.now()
  const idleExpired = result ? (now - result.lastSeenAt) > sessionIdleLimitMs() : false
  if (!result || result.status !== 'active' || result.expiresAt <= now || idleExpired) {
    if (result) {
      client.db.delete(userSessions).where(eq(userSessions.id, result.sessionId)).run()
    }
    clearUserAuthCookies(event)
    return null
  }

  let csrfToken = readUserCsrfCookie(event) || ''

  if (options.csrf) {
    csrfToken = assertUserCsrf(
      event,
      client,
      result.sessionId,
      result.csrfTokenHash,
      security.secret
    )
  } else {
    const csrfHash = csrfToken ? hashOpaqueToken(security.secret, 'user-csrf', csrfToken) : ''
    if (!csrfToken || !safeEqual(csrfHash, result.csrfTokenHash)) {
      csrfToken = createOpaqueToken()
      client.db.update(userSessions).set({
        csrfTokenHash: hashOpaqueToken(security.secret, 'user-csrf', csrfToken)
      }).where(eq(userSessions.id, result.sessionId)).run()
      setUserAuthCookies(event, sessionToken, csrfToken, result.expiresAt, security.secureCookies)
    }
  }

  if (now - result.lastSeenAt >= SESSION_TOUCH_INTERVAL_MS) {
    client.db.update(userSessions).set({ lastSeenAt: now })
      .where(eq(userSessions.id, result.sessionId))
      .run()
  }

  return {
    user: {
      id: result.userId,
      username: result.username,
      displayName: result.displayName,
      major: result.major,
      dormBuilding: result.dormBuilding,
      chatDormBuilding: result.chatDormBuilding,
      status: result.status
    },
    sessionId: result.sessionId,
    expiresAt: result.expiresAt,
    csrfToken
  }
}

export function requireUserSession(
  event: H3Event,
  client: DatabaseClient,
  options: { csrf?: boolean } = {}
): UserSessionContext {
  return getOptionalUserSession(event, client, options) || unauthorized()
}

export function logoutAppUser(
  event: H3Event,
  client: DatabaseClient,
  session: UserSessionContext
): void {
  client.db.delete(userSessions).where(and(
    eq(userSessions.id, session.sessionId),
    eq(userSessions.userId, session.user.id)
  )).run()
  clearUserAuthCookies(event)
}
