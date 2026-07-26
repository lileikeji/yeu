import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  assertUserCanAccessRoom,
  ensureDormRoom,
  listRoomsForUser
} from '../server/modules/chat/service'
import { updateAppUser, updateOwnProfile } from '../server/modules/users/service'

test('self-reported dorm changes never grant access to another dorm room', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-chat-dorm-auth-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)

  try {
    runMigrations(client)
    const now = Date.now()
    client.sqlite.prepare(`
      INSERT INTO users (
        id, username, password_hash, display_name, dorm_building,
        chat_dorm_building, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run('user-a', 'user-a', 'unused', 'User A', 'A dorm', 'A dorm', now, now)

    const targetRoom = ensureDormRoom(client, 'B dorm')
    await updateOwnProfile(client, 'user-a', { dormBuilding: 'B dorm' })

    const afterSelfEdit = client.sqlite.prepare(`
      SELECT dorm_building AS dormBuilding, chat_dorm_building AS chatDormBuilding
      FROM users WHERE id = ?
    `).get('user-a') as { dormBuilding: string, chatDormBuilding: string }

    assert.deepEqual(afterSelfEdit, {
      dormBuilding: 'B dorm',
      chatDormBuilding: 'A dorm'
    })
    assert.deepEqual(
      listRoomsForUser(client, { id: 'user-a', chatDormBuilding: afterSelfEdit.chatDormBuilding })
        .filter(room => room.kind === 'dorm')
        .map(room => room.dormBuilding),
      ['A dorm']
    )
    assert.throws(
      () => assertUserCanAccessRoom(
        client,
        targetRoom,
        { id: 'user-a', chatDormBuilding: afterSelfEdit.chatDormBuilding }
      ),
      error => error instanceof Error && 'statusCode' in error && error.statusCode === 403
    )

    await updateAppUser(client, 'user-a', { dormBuilding: 'B dorm' })
    const afterAdminEdit = client.sqlite.prepare(`
      SELECT chat_dorm_building AS chatDormBuilding FROM users WHERE id = ?
    `).get('user-a') as { chatDormBuilding: string }
    assert.equal(afterAdminEdit.chatDormBuilding, 'B dorm')
    assert.doesNotThrow(() => assertUserCanAccessRoom(
      client,
      targetRoom,
      { id: 'user-a', chatDormBuilding: afterAdminEdit.chatDormBuilding }
    ))
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
