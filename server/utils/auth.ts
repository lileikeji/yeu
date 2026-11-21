import { randomUUID } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { DatabaseClient } from '../database/client'
import {
  adminSessions,
  adminUsers,
  contents,
  organizationAdminScopes,
  yeucaDepartmentAdmins
} from '../database/schema'
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

export interface AdminYeucaScope {
  role: 'chief' | 'minister'
  departmentName: string | null
  title: string
}

export interface AdminIdentity {
  id: string
  username: string
  displayName: string
  role: 'super' | 'organization'
  mustChangePassword: boolean
  organization: {
    contentId: string
    kind: 'department' | 'club'
    slug: string
    title: string
  } | null
  yeucaScope?: AdminYeucaScope | null
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

function forbidden(code = 'ADMIN_SCOPE_FORBIDDEN'): never {
  throw createError({
    statusCode: 403,
    statusMessage: 'This administrator cannot access the requested resource',
    data: { code }
  })
}

function isValidOrganizationRow(row: {
  contentId: string | null
  contentKind: string | null
  contentSlug: string | null
  contentTitle: string | null
}): row is {
  contentId: string
  contentKind: 'department' | 'club'
  contentSlug: string
  contentTitle: string
} {
  return Boolean(
    row.contentId
    && (row.contentKind === 'department' || row.contentKind === 'club')
    && row.contentSlug
    && row.contentTitle
  )
}

function isComputerAssociationMeta(slug: string, title: string): boolean {
  return slug === 'computer-association' || title === '计算机协会'
}

/** 统一解析组织管理员归属与计协总管/部长分权范围，同时兼容旧的社团单一绑定表。 */
function resolveOrganizationAndYeucaScope(
  client: DatabaseClient,
  adminId: string,
  role: 'super' | 'organization',
  baseOrg: {
    contentId: string | null
    contentKind: string | null
    contentSlug: string | null
    contentTitle: string | null
  }
): {
  organization: AdminIdentity['organization']
  yeucaScope: AdminYeucaScope | null
} {
  if (role === 'super') {
    return {
      organization: null,
      yeucaScope: { role: 'chief', departmentName: null, title: '平台总管' }
    }
  }

  if (isValidOrganizationRow(baseOrg)) {
    const organization: AdminIdentity['organization'] = {
      contentId: baseOrg.contentId,
      kind: baseOrg.contentKind,
      slug: baseOrg.contentSlug,
      title: baseOrg.contentTitle
    }
    const yeucaScope: AdminYeucaScope | null = isComputerAssociationMeta(baseOrg.contentSlug, baseOrg.contentTitle)
      ? { role: 'chief', departmentName: null, title: '计协总管' }
      : null
    return { organization, yeucaScope }
  }

  const deptRow = client.db.select({
    departmentName: yeucaDepartmentAdmins.departmentName,
    title: yeucaDepartmentAdmins.title,
    contentId: contents.id,
    contentKind: contents.kind,
    contentSlug: contents.slug,
    contentTitle: contents.title
  }).from(yeucaDepartmentAdmins)
    .innerJoin(contents, eq(contents.id, yeucaDepartmentAdmins.contentId))
    .where(eq(yeucaDepartmentAdmins.adminUserId, adminId))
    .get()

  if (deptRow && isValidOrganizationRow(deptRow)) {
    return {
      organization: {
        contentId: deptRow.contentId,
        kind: deptRow.contentKind,
        slug: deptRow.contentSlug,
        title: deptRow.contentTitle
      },
      yeucaScope: isComputerAssociationMeta(deptRow.contentSlug, deptRow.contentTitle)
        ? {
            role: 'minister',
            departmentName: deptRow.departmentName,
            title: deptRow.title || '部长'
          }
        : null
    }
  }

  return { organization: null, yeucaScope: null }
}

function getAdminIdentity(client: DatabaseClient, adminId: string): AdminIdentity | null {
  const row = client.db.select({
    id: adminUsers.id,
    username: adminUsers.username,
    displayName: adminUsers.displayName,
    role: adminUsers.role,
    mustChangePassword: adminUsers.mustChangePassword,
    contentId: organizationAdminScopes.contentId,
    contentKind: contents.kind,
    contentSlug: contents.slug,
    contentTitle: contents.title
  }).from(adminUsers)
    .leftJoin(organizationAdminScopes, eq(organizationAdminScopes.adminUserId, adminUsers.id))
    .leftJoin(contents, eq(contents.id, organizationAdminScopes.contentId))
    .where(eq(adminUsers.id, adminId))
    .get()

  if (!row) return null
  const { organization, yeucaScope } = resolveOrganizationAndYeucaScope(client, row.id, row.role, row)

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
    organization,
    yeucaScope
  }
}

export type AdminCapability = import('../../shared/types/server').AdminCapability

const ADMIN_CAPABILITIES: readonly AdminCapability[] = [
  'analytics.view',
  'visitor.list',
  'visitor.detail',
  'visitor.raw_ua',
  'visitor.raw_ip',
  'visitor.source',
  'api_metrics.view',
  'audit.view',
  'ban.manage'
]

export function adminCapabilities(session: AdminSessionContext): AdminCapability[] {
  return session.admin.role === 'super' ? [...ADMIN_CAPABILITIES] : ['analytics.view']
}

export function hasAdminCapability(
  session: AdminSessionContext,
  capability: AdminCapability
): boolean {
  return session.admin.role === 'super' || capability === 'analytics.view'
}

export function requireAdminCapability(
  session: AdminSessionContext,
  capability: AdminCapability
): void {
  if (hasAdminCapability(session, capability)) return
  forbidden('ADMIN_CAPABILITY_FORBIDDEN')
}

export function requireSuperAdmin(session: AdminSessionContext): void {
  if (session.admin.role !== 'super') forbidden('SUPER_ADMIN_REQUIRED')
}

export function requireAdminContentAccess(session: AdminSessionContext, contentId: string): void {
  if (session.admin.role === 'super') return
  if (session.admin.organization?.contentId !== contentId) forbidden()
}

const ORGANIZATION_PROTECTED_CONTENT_FIELDS = new Set([
  'slug',
  'isFeatured',
  'lastVerifiedAt',
  'sourceIds',
  'status'
])

const ORGANIZATION_PROTECTED_METADATA_FIELDS = new Set([
  'verificationState',
  'featuredSummary',
  'sortOrder'
])

export function assertOrganizationContentUpdateAllowed(
  session: AdminSessionContext,
  input: Record<string, unknown>
): void {
  if (session.admin.role === 'super') return

  const protectedField = Object.keys(input)
    .find(key => ORGANIZATION_PROTECTED_CONTENT_FIELDS.has(key))
  const metadata = input.metadata
  const protectedMetadataField = metadata
    && typeof metadata === 'object'
    && !Array.isArray(metadata)
    ? Object.keys(metadata).find(key => ORGANIZATION_PROTECTED_METADATA_FIELDS.has(key))
    : undefined

  if (!protectedField && !protectedMetadataField) return
  throw createError({
    statusCode: 403,
    statusMessage: '组织管理员不能修改发布、核验、排序或页面标识字段',
    data: {
      code: 'ORGANIZATION_CONTENT_FIELD_FORBIDDEN',
      field: protectedField ?? `metadata.${protectedMetadataField}`
    }
  })
}

export function withAutomaticOrganizationVerification<T extends Record<string, unknown>>(
  session: AdminSessionContext,
  input: T,
  now = Date.now()
): T & { lastVerifiedAt?: string } {
  if (session.admin.role !== 'organization') return input
  return {
    ...input,
    lastVerifiedAt: new Date(now).toISOString()
  }
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
  // Bound distributed credential-spraying of a known username across many source
  // IPs: the per-IP and per-(IP,user) limits above do not stop an attacker who
  // rotates addresses. This global-per-username sliding window caps the app-wide
  // attempt rate for that account. Deliberate, availability-safe trade-off: the
  // same window also throttles post-typo retries, but a single admin will not
  // exceed this within 15 minutes while a multi-IP spray is slowed to a crawl.
  assertRateLimit(event, `admin-login:user:${username.toLowerCase()}`, 10, 15 * 60 * 1000, client)

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

  return establishAdminSession(event, client, user.id, true, 'auth.login')
}

function establishAdminSession(
  event: H3Event,
  client: DatabaseClient,
  adminId: string,
  replaceExisting: boolean,
  auditAction: string,
  auditDetails?: Record<string, unknown>
): AdminSessionContext {
  const now = Date.now()
  const security = getSecurityConfig(event)
  const sessionToken = createOpaqueToken()
  const csrfToken = createOpaqueToken()
  const sessionId = randomUUID()
  const expiresAt = now + security.ttlMs

  client.db.transaction((transaction) => {
    if (replaceExisting) {
      transaction.delete(adminSessions).where(eq(adminSessions.adminUserId, adminId)).run()
    }
    transaction.insert(adminSessions).values({
      id: sessionId,
      adminUserId: adminId,
      tokenHash: hashOpaqueToken(security.secret, 'session', sessionToken),
      csrfTokenHash: hashOpaqueToken(security.secret, 'csrf', csrfToken),
      expiresAt,
      lastSeenAt: now,
      createdAt: now
    }).run()
    transaction.update(adminUsers).set({
      lastLoginAt: now,
      updatedAt: now
    }).where(eq(adminUsers.id, adminId)).run()
  })

  setAuthCookies(event, sessionToken, csrfToken, expiresAt, security.secureCookies)
  writeAudit(client, event, {
    actorAdminId: adminId,
    action: auditAction,
    entityType: 'admin',
    entityId: adminId,
    details: auditDetails
  })

  return {
    admin: getAdminIdentity(client, adminId) ?? unauthorized(),
    sessionId,
    expiresAt,
    csrfToken
  }
}

export function loginAdminWithDevice(
  event: H3Event,
  client: DatabaseClient,
  username: string,
  keyId: string
): AdminSessionContext {
  assertTrustedOrigin(event)
  const ip = requestIp(event)
  assertRateLimit(event, `admin-device-login:${ip}`, 6, 15 * 60 * 1000, client)

  const user = client.db.select({
    id: adminUsers.id,
    username: adminUsers.username,
    role: adminUsers.role,
    isActive: adminUsers.isActive
  }).from(adminUsers)
    .where(eq(adminUsers.username, username))
    .get()

  if (!user || !user.isActive || user.role !== 'super') {
    writeAudit(client, event, {
      actorAdminId: null,
      action: 'auth.device_login_failed',
      entityType: 'admin',
      details: { username, keyId }
    })
    throw createError({
      statusCode: 401,
      statusMessage: 'Device authentication failed',
      data: { code: 'ADMIN_DEVICE_AUTH_FAILED' }
    })
  }

  return establishAdminSession(
    event,
    client,
    user.id,
    false,
    'auth.device_login',
    { keyId }
  )
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
    role: adminUsers.role,
    mustChangePassword: adminUsers.mustChangePassword,
    contentId: organizationAdminScopes.contentId,
    contentKind: contents.kind,
    contentSlug: contents.slug,
    contentTitle: contents.title,
    isActive: adminUsers.isActive
  }).from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    .leftJoin(organizationAdminScopes, eq(organizationAdminScopes.adminUserId, adminUsers.id))
    .leftJoin(contents, eq(contents.id, organizationAdminScopes.contentId))
    .where(eq(adminSessions.tokenHash, tokenHash))
    .get()

  const now = Date.now()
  const idleExpired = result ? (now - result.lastSeenAt) > sessionIdleLimitMs() : false
  const resolvedScope = result
    ? resolveOrganizationAndYeucaScope(client, result.adminId, result.role, result)
    : { organization: null, yeucaScope: null }
  const organizationScopeMissing = result?.role === 'organization' && !resolvedScope.organization
  if (!result || !result.isActive || result.expiresAt <= now || idleExpired || organizationScopeMissing) {
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
      displayName: result.displayName,
      role: result.role,
      mustChangePassword: result.mustChangePassword,
      organization: resolvedScope.organization,
      yeucaScope: resolvedScope.yeucaScope
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
