import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { initializeAdmin } from '../server/database/admin-bootstrap'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { hashPassword, verifyPassword } from '../server/utils/password'

test('forced administrator reset replaces the password and revokes existing sessions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-admin-bootstrap-'))
  const databasePath = join(directory, 'admin.sqlite')
  const client = getDatabase(databasePath)

  try {
    runMigrations(client)

    assert.equal(await initializeAdmin(client, {
      username: 'admin',
      password: 'initial-password-123'
    }), 'created')

    const admin = client.sqlite.prepare(`
      SELECT id, password_hash AS passwordHash
      FROM admin_users WHERE username = 'admin'
    `).get() as { id: string, passwordHash: string }
    const now = Date.now()

    client.sqlite.prepare(`
      INSERT INTO admin_sessions (
        id, admin_user_id, token_hash, csrf_token_hash,
        expires_at, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'existing-session',
      admin.id,
      'existing-token-hash',
      'existing-csrf-hash',
      now + 60_000,
      now,
      now
    )

    assert.equal(await initializeAdmin(client, {
      username: 'admin',
      password: 'ignored-password-456'
    }), 'unchanged')
    assert.equal(
      (client.sqlite.prepare('SELECT count(*) AS count FROM admin_sessions').get() as { count: number }).count,
      1
    )

    assert.equal(await initializeAdmin(client, {
      username: 'admin',
      password: 'replacement-password-789',
      force: true
    }), 'updated')

    const updated = client.sqlite.prepare(`
      SELECT password_hash AS passwordHash, is_active AS isActive
      FROM admin_users WHERE username = 'admin'
    `).get() as { passwordHash: string, isActive: number }

    assert.equal(updated.isActive, 1)
    assert.equal(await verifyPassword('replacement-password-789', updated.passwordHash), true)
    assert.equal(await verifyPassword('initial-password-123', updated.passwordHash), false)
    assert.equal(
      (client.sqlite.prepare('SELECT count(*) AS count FROM admin_sessions').get() as { count: number }).count,
      0
    )
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('administrator password policy enforces a 12-character minimum on hash/bootstrap', async () => {
  const password = 'synthetic-admin-pass-12'
  const hash = await hashPassword(password)

  assert.equal(await verifyPassword(password, hash), true)
  assert.equal(await verifyPassword(password + 'x', hash), false)
  await assert.rejects(() => hashPassword('12345678901'), /at least 12 characters/)
  await assert.rejects(() => hashPassword('short'), /at least 12 characters/)
})
