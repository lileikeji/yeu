import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DatabaseClient } from './client'
import { adminSessions, adminUsers } from './schema'
import { hashPassword, isSupportedPasswordHash } from '../utils/password'

export interface AdminBootstrapOptions {
  username: string
  password?: string
  passwordHash?: string
  force?: boolean
}

export async function initializeAdmin(
  client: DatabaseClient,
  options: AdminBootstrapOptions
): Promise<'created' | 'updated' | 'unchanged'> {
  const username = options.username.trim()

  if (!username) {
    throw new Error('NUXT_ADMIN_USERNAME must not be empty')
  }

  if (!options.password && !options.passwordHash) {
    throw new Error('Set NUXT_ADMIN_PASSWORD or NUXT_ADMIN_PASSWORD_HASH')
  }

  const passwordHash = options.passwordHash
    ? options.passwordHash.trim()
    : await hashPassword(options.password ?? '')

  if (!isSupportedPasswordHash(passwordHash)) {
    throw new Error('NUXT_ADMIN_PASSWORD_HASH is not a supported scrypt hash')
  }

  const existing = client.db.select().from(adminUsers)
    .where(eq(adminUsers.username, username))
    .get()

  if (existing && !options.force) {
    return 'unchanged'
  }

  const now = Date.now()

  if (existing) {
    client.db.transaction((transaction) => {
      transaction.update(adminUsers).set({
        passwordHash,
        isActive: true,
        updatedAt: now
      }).where(eq(adminUsers.id, existing.id)).run()
      transaction.delete(adminSessions)
        .where(eq(adminSessions.adminUserId, existing.id))
        .run()
    })
    return 'updated'
  }

  client.db.insert(adminUsers).values({
    id: randomUUID(),
    username,
    displayName: username,
    passwordHash,
    isActive: true,
    createdAt: now,
    updatedAt: now
  }).run()
  return 'created'
}
