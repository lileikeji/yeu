import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  assertUserCanAccessRoom,
  enterPlaceChatRoom,
  getRoomOrThrow,
  listPlaceChatRooms,
  sendMessage
} from '../server/modules/chat/service'

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

const USER_A = { id: '0b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', displayName: '学生甲', chatDormBuilding: '旧区1号楼' }
const USER_B = { id: '1c2d3e4f-5a6b-4c7d-8e9f-1a2b3c4d5e6f', displayName: '学生乙', chatDormBuilding: '新区2号楼' }

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-place-chat-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = Date.now()
  client.sqlite.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, chat_dorm_building, status, created_at, updated_at)
    VALUES (?, 'a', 'x', '学生甲', '旧区1号楼', 'active', ?, ?), (?, 'b', 'x', '学生乙', '新区2号楼', 'active', ?, ?)
  `).run(USER_A.id, now, now, USER_B.id, now, now)
  client.sqlite.prepare(`
    INSERT INTO places (id, slug, name, summary, scope, type, category, status, created_at, updated_at)
    VALUES
      ('place-building-1', 'yangen-building', '仰恩楼', '主教学楼', 'campus', 'teaching-building', 'campus-building', 'published', ?, ?),
      ('place-food-1', 'canteen', '食堂', '餐厅', 'campus', 'dining', 'food', 'published', ?, ?),
      ('place-draft-1', 'draft-building', '未发布楼', '草稿', 'campus', 'teaching-building', 'campus-building', 'draft', ?, ?)
  `).run(now, now, now, now, now, now)
  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

test('place-rooms: 只列楼栋类已发布点位，进入懒建房且幂等', () => {
  const { client, cleanup } = createFixture()
  try {
    const rooms = listPlaceChatRooms(client)
    // 食堂（food）与草稿楼不进列表
    assert.deepEqual(rooms.map(room => room.placeId), ['place-building-1'])
    assert.equal(rooms[0]!.roomId, null)

    const first = enterPlaceChatRoom(client, USER_A, 'place-building-1')
    const again = enterPlaceChatRoom(client, USER_B, 'place-building-1')
    assert.equal(first.roomId, again.roomId, 'same place reuses the same room')

    const list = listPlaceChatRooms(client)
    assert.equal(list[0]!.roomId, first.roomId)
    assert.equal(list[0]!.memberCount, 2)
  } finally {
    cleanup()
  }
})

test('place-rooms: 任意登录用户可进可发言，非楼栋/未发布 404', () => {
  const { client, cleanup } = createFixture()
  try {
    const { roomId } = enterPlaceChatRoom(client, USER_A, 'place-building-1')
    const room = getRoomOrThrow(client, roomId)
    // 学生乙（不同宿舍楼）也能进 place 房
    assertUserCanAccessRoom(client, room, USER_B)
    const message = sendMessage(client, room, USER_B, '大家好')
    assert.equal(message.body, '大家好')

    assert.throws(
      () => enterPlaceChatRoom(client, USER_A, 'place-food-1'),
      (error: { data?: { code?: string } }) => error.data?.code === 'CHAT_PLACE_NOT_FOUND'
    )
    assert.throws(
      () => enterPlaceChatRoom(client, USER_A, 'place-draft-1'),
      (error: { data?: { code?: string } }) => error.data?.code === 'CHAT_PLACE_NOT_FOUND'
    )
  } finally {
    cleanup()
  }
})

test('place-rooms: 违禁词消息被拒绝', () => {
  const { client, cleanup } = createFixture()
  try {
    const { roomId } = enterPlaceChatRoom(client, USER_A, 'place-building-1')
    const room = getRoomOrThrow(client, roomId)
    assert.throws(
      () => sendMessage(client, room, USER_A, '需要的加微信联系我'),
      (error: { data?: { code?: string } }) => error.data?.code === 'CHAT_BANNED_WORD'
    )
    const count = client.sqlite.prepare('SELECT COUNT(*) c FROM chat_messages WHERE room_id = ?').get(roomId) as { c: number }
    assert.equal(count.c, 0)
  } finally {
    cleanup()
  }
})
