import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { initializeAdmin } from '../server/database/admin-bootstrap'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  changeAdminPassword,
  createOrganizationAdmin,
  ORGANIZATION_ADMIN_INITIAL_PASSWORD,
  updateOrganizationAdmin
} from '../server/modules/organization-admins/service'
import type { AdminSessionContext } from '../server/utils/auth'
import {
  assertOrganizationContentUpdateAllowed,
  requireAdminContentAccess
} from '../server/utils/auth'
import { verifyPassword } from '../server/utils/password'
import { createOrganizationAdminSchema } from '../shared/schemas/server'

const firstContentId = '00000000-0000-4000-8000-000000000101'
const secondContentId = '00000000-0000-4000-8000-000000000102'

test('organization account usernames accept Chinese while rejecting spaces', () => {
  const valid = createOrganizationAdminSchema.safeParse({
    contentId: firstContentId,
    username: '计算机协会'
  })
  const invalid = createOrganizationAdminSchema.safeParse({
    contentId: firstContentId,
    username: '计算机 协会'
  })

  assert.equal(valid.success, true)
  assert.equal(invalid.success, false)
})

function insertClub(
  sqlite: ReturnType<typeof getDatabase>['sqlite'],
  id: string,
  slug: string
): void {
  const now = Date.now()
  sqlite.prepare(`
    INSERT INTO contents (
      id, kind, slug, title, summary, body, status, created_at, updated_at
    ) VALUES (?, 'club', ?, '计算机协会', 'Summary', '', 'draft', ?, ?)
  `).run(id, slug, now, now)
}

test('organization authorization creates a pinyin account and enforces first password change', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-organization-admin-'))
  const databasePath = join(directory, 'organization-admin.sqlite')
  const client = getDatabase(databasePath)

  try {
    runMigrations(client)
    await initializeAdmin(client, {
      username: 'admin',
      password: 'super-admin-password'
    })
    const superAdmin = client.sqlite.prepare(`
      SELECT id FROM admin_users WHERE username = 'admin'
    `).get() as { id: string }
    insertClub(client.sqlite, firstContentId, 'computer-association')
    insertClub(client.sqlite, secondContentId, 'computer-association-two')

    const first = await createOrganizationAdmin(client, { contentId: firstContentId }, superAdmin.id)
    const second = await createOrganizationAdmin(client, { contentId: secondContentId }, superAdmin.id)
    assert.equal(first.username, 'jisuanjixiehui')
    assert.equal(second.username, 'jisuanjixiehui-2')
    assert.equal(first.initialPassword, ORGANIZATION_ADMIN_INITIAL_PASSWORD)

    const created = client.sqlite.prepare(`
      SELECT password_hash AS passwordHash, role,
        must_change_password AS mustChangePassword
      FROM admin_users
      WHERE id = ?
    `).get(first.id) as {
      passwordHash: string
      role: string
      mustChangePassword: number
    }
    assert.equal(created.role, 'organization')
    assert.equal(created.mustChangePassword, 1)
    assert.equal(await verifyPassword(ORGANIZATION_ADMIN_INITIAL_PASSWORD, created.passwordHash), true)

    const now = Date.now()
    client.sqlite.prepare(`
      INSERT INTO admin_sessions (
        id, admin_user_id, token_hash, csrf_token_hash,
        expires_at, last_seen_at, created_at
      ) VALUES ('organization-session', ?, 'token-hash', 'csrf-hash', ?, ?, ?)
    `).run(first.id, now + 60_000, now, now)

    await changeAdminPassword(
      client,
      first.id,
      'organization-session',
      ORGANIZATION_ADMIN_INITIAL_PASSWORD,
      'replacement-password-123'
    )
    const changed = client.sqlite.prepare(`
      SELECT password_hash AS passwordHash,
        must_change_password AS mustChangePassword
      FROM admin_users
      WHERE id = ?
    `).get(first.id) as { passwordHash: string, mustChangePassword: number }
    assert.equal(changed.mustChangePassword, 0)
    assert.equal(await verifyPassword('replacement-password-123', changed.passwordHash), true)
    assert.equal(
      client.sqlite.prepare('SELECT count(*) FROM admin_sessions WHERE admin_user_id = ?')
        .pluck().get(first.id),
      0
    )

    const reset = await updateOrganizationAdmin(client, first.id, { resetPassword: true })
    assert.equal(reset.initialPassword, ORGANIZATION_ADMIN_INITIAL_PASSWORD)
    const resetAdmin = client.sqlite.prepare(`
      SELECT password_hash AS passwordHash,
        must_change_password AS mustChangePassword
      FROM admin_users
      WHERE id = ?
    `).get(first.id) as { passwordHash: string, mustChangePassword: number }
    assert.equal(resetAdmin.mustChangePassword, 1)
    assert.equal(await verifyPassword(ORGANIZATION_ADMIN_INITIAL_PASSWORD, resetAdmin.passwordHash), true)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('organization content access only allows the assigned content id', () => {
  const session = {
    admin: {
      id: 'organization-admin',
      username: 'jisuanjixiehui',
      displayName: '计算机协会管理员',
      role: 'organization',
      mustChangePassword: false,
      organization: {
        contentId: firstContentId,
        kind: 'club',
        slug: 'computer-association',
        title: '计算机协会'
      }
    },
    sessionId: 'session',
    expiresAt: Date.now() + 60_000,
    csrfToken: 'csrf'
  } satisfies AdminSessionContext

  assert.doesNotThrow(() => requireAdminContentAccess(session, firstContentId))

  const originalCreateError = globalThis.createError
  globalThis.createError = ((input: {
    statusCode: number
    statusMessage: string
    data: { code: string }
  }) => Object.assign(new Error(input.statusMessage), input)) as typeof createError
  try {
    assert.throws(
      () => requireAdminContentAccess(session, secondContentId),
      error => (
        error instanceof Error
        && 'statusCode' in error
        && error.statusCode === 403
        && 'data' in error
        && (error.data as { code: string }).code === 'ADMIN_SCOPE_FORBIDDEN'
      )
    )
  } finally {
    globalThis.createError = originalCreateError
  }
})

test('organization administrators can edit organization content but not governance fields', () => {
  const session = {
    admin: {
      id: 'organization-admin',
      username: 'jisuanjixiehui',
      displayName: '计算机协会管理员',
      role: 'organization',
      mustChangePassword: false,
      organization: {
        contentId: firstContentId,
        kind: 'club',
        slug: 'computer-association',
        title: '计算机协会'
      }
    },
    sessionId: 'session',
    expiresAt: Date.now() + 60_000,
    csrfToken: 'csrf'
  } satisfies AdminSessionContext

  assert.doesNotThrow(() => assertOrganizationContentUpdateAllowed(session, {
    title: '计算机协会',
    summary: '新的介绍',
    metadata: {
      signupQa: [{ question: '是否招新', answer: '是' }],
      groupQrUrls: ['/uploads/example.jpg']
    }
  }))

  const originalCreateError = globalThis.createError
  globalThis.createError = ((input: {
    statusCode: number
    statusMessage: string
    data: { code: string, field?: string }
  }) => Object.assign(new Error(input.statusMessage), input)) as typeof createError
  try {
    for (const input of [
      { slug: 'changed-slug' },
      { isFeatured: true },
      { lastVerifiedAt: new Date().toISOString() },
      { sourceIds: [] },
      { metadata: { sortOrder: 1 } },
      { metadata: { verificationState: 'verified' } }
    ]) {
      assert.throws(
        () => assertOrganizationContentUpdateAllowed(session, input),
        error => (
          error instanceof Error
          && 'statusCode' in error
          && error.statusCode === 403
          && 'data' in error
          && (error.data as { code: string }).code === 'ORGANIZATION_CONTENT_FIELD_FORBIDDEN'
        )
      )
    }
  } finally {
    globalThis.createError = originalCreateError
  }
})
