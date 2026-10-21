import { randomUUID } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { DatabaseClient } from '../database/client'
import {
  competitionEvents,
  competitionJudgeSessions,
  competitionJudges
} from '../database/schema'
import { verifyPassword } from './password'
import { getClientIpAddress } from './client-ip'
import { assertRateLimit } from './rate-limit'
import {
  assertTrustedOrigin,
  createOpaqueToken,
  getSecurityConfig,
  hashOpaqueToken,
  safeEqual
} from './security'
import {
  ALL_JUDGE_CSRF_COOKIE_NAMES,
  ALL_JUDGE_SESSION_COOKIE_NAMES,
  HOST_JUDGE_CSRF_COOKIE_NAME,
  HOST_JUDGE_SESSION_COOKIE_NAME,
  JUDGE_CSRF_COOKIE_NAME,
  JUDGE_CSRF_HEADER_NAME,
  JUDGE_SESSION_COOKIE_NAME,
  judgeAuthCookieNames
} from '../../shared/constants/security'

const DUMMY_PASSWORD_HASH = `scrypt$16384$8$1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000
/** 比赛当天可能连续使用十多个小时，评委会话固定 24 小时。 */
const JUDGE_SESSION_TTL_MS = 24 * 60 * 60 * 1000

export interface CompetitionJudgeIdentity {
  id: string
  username: string
  displayName: string
  eventId: string
  roundId: string
}

export interface CompetitionJudgeSessionContext {
  judge: CompetitionJudgeIdentity
  sessionId: string
  expiresAt: number
  csrfToken: string
}

function unauthorized(): never {
  throw createError({
    statusCode: 401,
    statusMessage: 'Judge authentication required',
    data: { code: 'AUTHENTICATION_REQUIRED' }
  })
}

function setJudgeAuthCookies(
  event: H3Event,
  sessionToken: string,
  csrfToken: string,
  expiresAt: number,
  secure: boolean
): void {
  const names = judgeAuthCookieNames(secure)
  const common = {
    path: '/' as const,
    sameSite: 'lax' as const,
    secure,
    expires: new Date(expiresAt)
  }

  const alternate = secure
    ? [JUDGE_SESSION_COOKIE_NAME, JUDGE_CSRF_COOKIE_NAME]
    : [HOST_JUDGE_SESSION_COOKIE_NAME, HOST_JUDGE_CSRF_COOKIE_NAME]
  for (const name of alternate) {
    deleteCookie(event, name, { path: '/', sameSite: 'lax', secure: true })
    deleteCookie(event, name, { path: '/', sameSite: 'lax', secure: false })
  }

  setCookie(event, names.session, sessionToken, { ...common, httpOnly: true })
  setCookie(event, names.csrf, csrfToken, { ...common, httpOnly: false })
}

function readJudgeSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, HOST_JUDGE_SESSION_COOKIE_NAME)
    || getCookie(event, JUDGE_SESSION_COOKIE_NAME)
    || undefined
}

function readJudgeCsrfCookie(event: H3Event): string | undefined {
  return getCookie(event, HOST_JUDGE_CSRF_COOKIE_NAME)
    || getCookie(event, JUDGE_CSRF_COOKIE_NAME)
    || undefined
}

export function clearJudgeAuthCookies(event: H3Event): void {
  for (const name of [...ALL_JUDGE_SESSION_COOKIE_NAMES, ...ALL_JUDGE_CSRF_COOKIE_NAMES]) {
    deleteCookie(event, name, { path: '/', sameSite: 'lax', secure: true })
    deleteCookie(event, name, { path: '/', sameSite: 'lax', secure: false })
  }
}

function assertJudgeCsrf(
  event: H3Event,
  client: DatabaseClient,
  sessionId: string,
  expectedHash: string,
  secret: string
): string {
  assertTrustedOrigin(event)
  const cookieToken = readJudgeCsrfCookie(event) || ''
  const headerToken = getHeader(event, JUDGE_CSRF_HEADER_NAME) || ''
  const actualHash = hashOpaqueToken(secret, 'judge-csrf', headerToken)

  if (!headerToken
    || !cookieToken
    || !safeEqual(headerToken, cookieToken)
    || !safeEqual(actualHash, expectedHash)) {
    client.db.delete(competitionJudgeSessions)
      .where(eq(competitionJudgeSessions.id, sessionId))
      .run()
    clearJudgeAuthCookies(event)
    throw createError({
      statusCode: 403,
      statusMessage: 'Invalid CSRF token',
      data: { code: 'CSRF_REJECTED' }
    })
  }
  return headerToken
}

function sessionTtlMs(): number {
  return JUDGE_SESSION_TTL_MS
}

export async function loginCompetitionJudge(
  event: H3Event,
  client: DatabaseClient,
  usernameInput: string,
  password: string
): Promise<CompetitionJudgeSessionContext> {
  assertTrustedOrigin(event)
  const ip = getClientIpAddress(event)
  const username = usernameInput.trim().toLowerCase()

  assertRateLimit(event, `judge-login-ip:${ip}`, 20, 15 * 60 * 1000, client)
  assertRateLimit(event, `judge-login:${ip}:${username}`, 5, 15 * 60 * 1000, client)
  assertRateLimit(event, `judge-login:user:${username}`, 10, 15 * 60 * 1000, client)

  // 限制 scrypt 工作因子，避免绕过 parseBody 的超长密码拖垮进程。
  if (!username || password.length > 128) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid username or password',
      data: { code: 'INVALID_CREDENTIALS' }
    })
  }

  const now = Date.now()
  client.db.delete(competitionJudgeSessions)
    .where(lt(competitionJudgeSessions.expiresAt, now))
    .run()

  const judge = client.db.select().from(competitionJudges)
    .where(eq(competitionJudges.username, username))
    .get()
  const passwordMatches = await verifyPassword(password, judge?.passwordHash || DUMMY_PASSWORD_HASH)
  const competition = judge
    ? client.db.select({ id: competitionEvents.id }).from(competitionEvents)
        .where(eq(competitionEvents.id, judge.eventId)).get()
    : null
  if (!judge || !judge.isActive || !competition || !passwordMatches) {
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
  const expiresAt = now + sessionTtlMs()

  client.db.transaction((transaction) => {
    transaction.insert(competitionJudgeSessions).values({
      id: sessionId,
      judgeId: judge.id,
      tokenHash: hashOpaqueToken(security.secret, 'judge-session', sessionToken),
      csrfTokenHash: hashOpaqueToken(security.secret, 'judge-csrf', csrfToken),
      expiresAt,
      lastSeenAt: now,
      createdAt: now
    }).run()
    transaction.update(competitionJudges).set({
      lastLoginAt: now,
      updatedAt: now
    }).where(eq(competitionJudges.id, judge.id)).run()
  })

  setJudgeAuthCookies(event, sessionToken, csrfToken, expiresAt, security.secureCookies)
  return {
    judge: {
      id: judge.id,
      username: judge.username,
      displayName: judge.displayName,
      eventId: judge.eventId,
      roundId: judge.roundId
    },
    sessionId,
    expiresAt,
    csrfToken
  }
}

export function getOptionalJudgeSession(
  event: H3Event,
  client: DatabaseClient,
  options: { csrf?: boolean } = {}
): CompetitionJudgeSessionContext | null {
  const sessionToken = readJudgeSessionCookie(event)
  if (!sessionToken) return null

  const security = getSecurityConfig(event)
  const tokenHash = hashOpaqueToken(security.secret, 'judge-session', sessionToken)
  const result = client.db.select({
    sessionId: competitionJudgeSessions.id,
    csrfTokenHash: competitionJudgeSessions.csrfTokenHash,
    expiresAt: competitionJudgeSessions.expiresAt,
    lastSeenAt: competitionJudgeSessions.lastSeenAt,
    judgeId: competitionJudges.id,
    username: competitionJudges.username,
    displayName: competitionJudges.displayName,
    eventId: competitionJudges.eventId,
    roundId: competitionJudges.roundId,
    isActive: competitionJudges.isActive
  }).from(competitionJudgeSessions)
    .innerJoin(competitionJudges, eq(competitionJudgeSessions.judgeId, competitionJudges.id))
    .where(eq(competitionJudgeSessions.tokenHash, tokenHash))
    .get()

  const now = Date.now()
  if (!result || !result.isActive || result.expiresAt <= now) {
    if (result) {
      client.db.delete(competitionJudgeSessions)
        .where(eq(competitionJudgeSessions.id, result.sessionId))
        .run()
    }
    clearJudgeAuthCookies(event)
    return null
  }

  let csrfToken = readJudgeCsrfCookie(event) || ''
  if (options.csrf) {
    csrfToken = assertJudgeCsrf(event, client, result.sessionId, result.csrfTokenHash, security.secret)
  } else {
    const csrfHash = csrfToken ? hashOpaqueToken(security.secret, 'judge-csrf', csrfToken) : ''
    if (!csrfToken || !safeEqual(csrfHash, result.csrfTokenHash)) {
      csrfToken = createOpaqueToken()
      client.db.update(competitionJudgeSessions).set({
        csrfTokenHash: hashOpaqueToken(security.secret, 'judge-csrf', csrfToken)
      }).where(eq(competitionJudgeSessions.id, result.sessionId)).run()
      setJudgeAuthCookies(event, sessionToken, csrfToken, result.expiresAt, security.secureCookies)
    }
  }

  if (now - result.lastSeenAt >= SESSION_TOUCH_INTERVAL_MS) {
    client.db.update(competitionJudgeSessions).set({ lastSeenAt: now })
      .where(eq(competitionJudgeSessions.id, result.sessionId))
      .run()
  }

  return {
    judge: {
      id: result.judgeId,
      username: result.username,
      displayName: result.displayName,
      eventId: result.eventId,
      roundId: result.roundId
    },
    sessionId: result.sessionId,
    expiresAt: result.expiresAt,
    csrfToken
  }
}

export function requireJudgeSession(
  event: H3Event,
  client: DatabaseClient,
  options: { csrf?: boolean } = {}
): CompetitionJudgeSessionContext {
  return getOptionalJudgeSession(event, client, options) || unauthorized()
}

export function logoutCompetitionJudge(
  event: H3Event,
  client: DatabaseClient,
  session: CompetitionJudgeSessionContext
): void {
  client.db.delete(competitionJudgeSessions).where(and(
    eq(competitionJudgeSessions.id, session.sessionId),
    eq(competitionJudgeSessions.judgeId, session.judge.id)
  )).run()
  clearJudgeAuthCookies(event)
}
