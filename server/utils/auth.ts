import { randomUUID } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { DatabaseClient } from '../database/client'
import { adminSessions, adminUsers } from '../database/schema'
import { verifyPassword } from './password'
import { getClientIpAddress } from './client-ip'
import { assertRateLimit } from './rate-limit'
import {
  assertTrustedOrigin,
  clearAuthCookies,
  createOpaqueToken,
  CSRF_HEADER_NAME,
  getSecurityConfig,
  hashOpaqueToken,
  readCsrfCookie,
  readSessionCookie,
  safeEqual,
  setAuthCookies
} from './security'
import { writeAudit } from './audit'

const DUMMY_PASSWORD_HASH = `scrypt$16384$8$1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_SESSION_IDLE_MS = 4 * 60 * 60 * 1000

function sessionIdleLimitMs(): number {
  const hours = Number(process.env.NUXT_ADMIN_SESSION_IDLE_HOURS || 4)
  if (!Number.isFinite(hours)) return DEFAULT_SESSION_IDLE_MS
  return Math.min(168, Math.max(1, hours)) * 60 * 60 * 1000
}

export interface AdminIdentity {
  id: string
  username: string
  displayName: string
}

export interface AdminSessionContext {
  admin: AdminIdentity
  sessionId: string
  expiresAt: number
  csrfToken: string
}

function requestIp(event: H3Event): string {
  return getClientIpAddress(event)
}

function unauthorized(): never {
  throw createError({
    statusCode: 401,
    statusMessage: 'Authentication required',
    data: { code: 'AUTHENTICATION_REQUIRED' }
  })
}

function assertCsrf(
  event: H3Event,
  client: DatabaseClient,
  sessionId: string,
  expectedHash: string,
  secret: string
): string {
  assertTrustedOrigin(event)
  const cookieToken = readCsrfCookie(event) || ''
  const headerToken = getHeader(event, CSRF_HEADER_NAME) || ''
  const actualHash = hashOpaqueToken(secret, 'csrf', headerToken)

  if (!headerToken
    || !cookieToken
    || !safeEqual(headerToken, cookieToken)
    || !safeEqual(actualHash, expectedHash)) {
    client.db.delete(adminSessions).where(eq(adminSessions.id, sessionId)).run()
    clearAuthCookies(event)
    throw createError({
      statusCode: 403,
      statusMessage: 'Invalid CSRF token',
      data: { code: 'CSRF_REJECTED' }
    })
  }

  return headerToken
}

export async function loginAdmin(
  event: H3Event,
  client: DatabaseClient,
  username: string,
  password: string
): Promise<AdminSessionContext> {
  assertTrustedOrigin(event)
  const ip = requestIp(event)
  assertRateLimit(event, `admin-login-ip:${ip}`, 20, 15 * 60 * 1000, client)
  assertRateLimit(event, `admin-login:${ip}:${username.toLowerCase()}`, 5, 15 * 60 * 1000, client)

  // Cap password work factor if callers bypass parseBody (scrypt DoS).
  // Short passwords still hit dummy verify for timing parity with real failures.
  if (password.length > 128) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid username or password',
      data: { code: 'INVALID_CREDENTIALS' }
    })
  }

  const now = Date.now()
  client.db.delete(adminSessions).where(lt(adminSessions.expiresAt, now)).run()
  const user = client.db.select().from(adminUsers)
    .where(eq(adminUsers.username, username))
    .get()
  const passwordMatches = await verifyPassword(password, user?.passwordHash || DUMMY_PASSWORD_HASH)

  if (!user || !user.isActive || !passwordMatches) {
    writeAudit(client, event, {
      actorAdminId: null,
      action: 'auth.login_failed',
      entityType: 'admin',
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
  const expiresAt = now + security.ttlMs

  client.db.transaction((transaction) => {
    transaction.delete(adminSessions).where(eq(adminSessions.adminUserId, user.id)).run()
    transaction.insert(adminSessions).values({
      id: sessionId,
      adminUserId: user.id,
      tokenHash: hashOpaqueToken(security.secret, 'session', sessionToken),
      csrfTokenHash: hashOpaqueToken(security.secret, 'csrf', csrfToken),
      expiresAt,
      lastSeenAt: now,
      createdAt: now
    }).run()
    transaction.update(adminUsers).set({
      lastLoginAt: now,
      updatedAt: now
    }).where(eq(adminUsers.id, user.id)).run()
  })

  setAuthCookies(event, sessionToken, csrfToken, expiresAt, security.secureCookies)
  writeAudit(client, event, {
    actorAdminId: user.id,
    action: 'auth.login',
    entityType: 'admin',
    entityId: user.id
  })

  return {
    admin: {
      id: user.id,
      username: user.username,
      displayName: user.displayName
    },
    sessionId,
    expiresAt,
    csrfToken
  }
}

export function getOptionalAdminSession(
  event: H3Event,
  client: DatabaseClient,
  options: { csrf?: boolean } = {}
): AdminSessionContext | null {
  const sessionToken = readSessionCookie(event)

  if (!sessionToken) {
    return null
  }

  const security = getSecurityConfig(event)
  const tokenHash = hashOpaqueToken(security.secret, 'session', sessionToken)
  const result = client.db.select({
    sessionId: adminSessions.id,
    csrfTokenHash: adminSessions.csrfTokenHash,
    expiresAt: adminSessions.expiresAt,
    lastSeenAt: adminSessions.lastSeenAt,
    adminId: adminUsers.id,
    username: adminUsers.username,
    displayName: adminUsers.displayName,
    isActive: adminUsers.isActive
  }).from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    .where(eq(adminSessions.tokenHash, tokenHash))
    .get()

  const now = Date.now()
  const idleExpired = result ? (now - result.lastSeenAt) > sessionIdleLimitMs() : false
  if (!result || !result.isActive || result.expiresAt <= now || idleExpired) {
    if (result) {
      client.db.delete(adminSessions).where(eq(adminSessions.id, result.sessionId)).run()
    }
    clearAuthCookies(event)
    return null
  }

  let csrfToken = readCsrfCookie(event) || ''

  if (options.csrf) {
    csrfToken = assertCsrf(
      event,
      client,
      result.sessionId,
      result.csrfTokenHash,
      security.secret
    )
  } else {
    const csrfHash = csrfToken ? hashOpaqueToken(security.secret, 'csrf', csrfToken) : ''

    if (!csrfToken || !safeEqual(csrfHash, result.csrfTokenHash)) {
      csrfToken = createOpaqueToken()
      client.db.update(adminSessions).set({
        csrfTokenHash: hashOpaqueToken(security.secret, 'csrf', csrfToken)
      }).where(eq(adminSessions.id, result.sessionId)).run()
      setAuthCookies(event, sessionToken, csrfToken, result.expiresAt, security.secureCookies)
    }
  }

  if (now - result.lastSeenAt >= SESSION_TOUCH_INTERVAL_MS) {
    client.db.update(adminSessions).set({ lastSeenAt: now })
      .where(eq(adminSessions.id, result.sessionId))
      .run()
  }

  return {
    admin: {
      id: result.adminId,
      username: result.username,
      displayName: result.displayName
    },
    sessionId: result.sessionId,
    expiresAt: result.expiresAt,
    csrfToken
  }
}

export function requireAdminSession(
  event: H3Event,
  client: DatabaseClient,
  options: { csrf?: boolean } = {}
): AdminSessionContext {
  return getOptionalAdminSession(event, client, options) || unauthorized()
}

export function logoutAdmin(
  event: H3Event,
  client: DatabaseClient,
  session: AdminSessionContext
): void {
  client.db.delete(adminSessions).where(and(
    eq(adminSessions.id, session.sessionId),
    eq(adminSessions.adminUserId, session.admin.id)
  )).run()
  clearAuthCookies(event)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'auth.logout',
    entityType: 'admin',
    entityId: session.admin.id
  })
}
