import { randomBytes, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { pinyin } from 'pinyin-pro'
import type { DatabaseClient } from '../../database/client'
import {
  adminSessions,
  adminUsers,
  contents,
  organizationAdminScopes
} from '../../database/schema'
import { hashPassword, verifyPassword } from '../../utils/password'

/**
 * One-time random initial password for organization administrators.
 * Never use a shared fixed password: a predictable credential combined with
 * the predictable pinyin username would allow account takeover before the
 * legitimate admin's first login. Each account/reset gets a fresh value that
 * is shown once to the super admin and hashed before storage.
 */
export function generateOrganizationAdminInitialPassword(): string {
  return randomBytes(18).toString('base64url')
}

function conflict(message: string, code: string): never {
  throw createError({
    statusCode: 409,
    statusMessage: message,
    data: { code }
  })
}

function notFound(): never {
  throw createError({
    statusCode: 404,
    statusMessage: 'Organization administrator not found',
    data: { code: 'ORGANIZATION_ADMIN_NOT_FOUND' }
  })
}

function defaultUsername(title: string, slug: string, contentId: string): string {
  const titlePinyin = pinyin(title, {
    toneType: 'none',
    type: 'array'
  }).join('')
  const normalized = titlePinyin.toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
  if (normalized) return normalized

  const slugFallback = slug.toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
  return slugFallback || `org-${contentId.slice(0, 8)}`
}

function uniqueUsername(client: DatabaseClient, preferred: string): string {
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? preferred : `${preferred}-${suffix + 1}`
    const exists = client.db.select({ id: adminUsers.id }).from(adminUsers)
      .where(eq(adminUsers.username, candidate))
      .get()
    if (!exists) return candidate
  }
  conflict('Unable to allocate a unique organization username', 'ORGANIZATION_USERNAME_EXHAUSTED')
}

export function listOrganizationAdmins(client: DatabaseClient) {
  return client.db.select({
    id: adminUsers.id,
    username: adminUsers.username,
    displayName: adminUsers.displayName,
    isActive: adminUsers.isActive,
    mustChangePassword: adminUsers.mustChangePassword,
    lastLoginAt: adminUsers.lastLoginAt,
    createdAt: adminUsers.createdAt,
    contentId: contents.id,
    contentKind: contents.kind,
    contentSlug: contents.slug,
    contentTitle: contents.title
  }).from(adminUsers)
    .innerJoin(organizationAdminScopes, eq(organizationAdminScopes.adminUserId, adminUsers.id))
    .innerJoin(contents, eq(contents.id, organizationAdminScopes.contentId))
    .where(eq(adminUsers.role, 'organization'))
    .orderBy(contents.kind, contents.title)
    .all()
}

export async function createOrganizationAdmin(
  client: DatabaseClient,
  input: { contentId: string, username?: string },
  createdByAdminId: string
) {
  const content = client.db.select({
    id: contents.id,
    kind: contents.kind,
    slug: contents.slug,
    title: contents.title
  }).from(contents).where(eq(contents.id, input.contentId)).get()

  if (!content || (content.kind !== 'club' && content.kind !== 'department')) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Only a club or department can receive an organization account',
      data: { code: 'ORGANIZATION_CONTENT_REQUIRED' }
    })
  }
  const existingScope = client.db.select({ adminUserId: organizationAdminScopes.adminUserId })
    .from(organizationAdminScopes)
    .where(eq(organizationAdminScopes.contentId, content.id))
    .get()
  if (existingScope) conflict('This organization already has an administrator', 'ORGANIZATION_ADMIN_EXISTS')

  const preferred = input.username?.trim().toLowerCase()
    || defaultUsername(content.title, content.slug, content.id)
  const username = uniqueUsername(client, preferred)
  const initialPassword = generateOrganizationAdminInitialPassword()
  const passwordHash = await hashPassword(initialPassword)
  const adminUserId = randomUUID()
  const now = Date.now()

  client.db.transaction((transaction) => {
    transaction.insert(adminUsers).values({
      id: adminUserId,
      username,
      passwordHash,
      displayName: `${content.title}管理员`,
      role: 'organization',
      mustChangePassword: true,
      isActive: true,
      createdAt: now,
      updatedAt: now
    }).run()
    transaction.insert(organizationAdminScopes).values({
      adminUserId,
      contentId: content.id,
      createdByAdminId,
      createdAt: now,
      updatedAt: now
    }).run()
  })

  return {
    id: adminUserId,
    username,
    initialPassword,
    mustChangePassword: true,
    organization: content
  }
}

export async function updateOrganizationAdmin(
  client: DatabaseClient,
  adminUserId: string,
  input: { isActive?: boolean, resetPassword?: boolean }
) {
  const existing = client.db.select().from(adminUsers)
    .where(eq(adminUsers.id, adminUserId))
    .get()
  if (!existing || existing.role !== 'organization') notFound()

  const now = Date.now()
  const resetInitialPassword = input.resetPassword
    ? generateOrganizationAdminInitialPassword()
    : undefined
  const passwordHash = resetInitialPassword
    ? await hashPassword(resetInitialPassword)
    : undefined

  client.db.transaction((transaction) => {
    transaction.update(adminUsers).set({
      isActive: input.isActive,
      passwordHash,
      mustChangePassword: input.resetPassword ? true : undefined,
      updatedAt: now
    }).where(eq(adminUsers.id, adminUserId)).run()
    if (input.isActive === false || input.resetPassword) {
      transaction.delete(adminSessions)
        .where(eq(adminSessions.adminUserId, adminUserId))
        .run()
    }
  })

  return {
    id: adminUserId,
    isActive: input.isActive ?? existing.isActive,
    passwordReset: Boolean(input.resetPassword),
    ...(input.resetPassword && { initialPassword: resetInitialPassword })
  }
}

export async function changeAdminPassword(
  client: DatabaseClient,
  adminUserId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string
) {
  const existing = client.db.select().from(adminUsers)
    .where(eq(adminUsers.id, adminUserId))
    .get()
  const matches = existing ? await verifyPassword(currentPassword, existing.passwordHash) : false
  if (!existing || !matches) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Current password is incorrect',
      data: { code: 'CURRENT_PASSWORD_INCORRECT' }
    })
  }

  const passwordHash = await hashPassword(newPassword)
  client.db.transaction((transaction) => {
    transaction.update(adminUsers).set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: Date.now()
    }).where(eq(adminUsers.id, adminUserId)).run()
    transaction.delete(adminSessions)
      .where(eq(adminSessions.adminUserId, adminUserId))
      .run()
  })

  return { changed: true, sessionRevoked: currentSessionId }
}
