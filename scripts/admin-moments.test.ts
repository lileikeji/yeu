import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  adminDeleteMoment,
  adminListMoments,
  adminModerateMoment
} from '../server/modules/moderation/service'

const ADMIN_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const USER_ID = '0b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-admin-moments-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = Date.now()
  client.sqlite.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, status, created_at, updated_at)
    VALUES (?, ?, 'x', '学生甲', 'active', ?, ?)
  `).run(USER_ID, 'student-a', now, now)
  client.sqlite.prepare(`
    INSERT INTO admin_users (id, username, password_hash, display_name, created_at, updated_at)
    VALUES (?, 'reviewer', 'x', '审核员', ?, ?)
  `).run(ADMIN_ID, now, now)
  client.sqlite.prepare(`
    INSERT INTO bus_moments (id, bus_name, route_name, user_id, ip, body, status, created_at, updated_at)
    VALUES
      ('bm-1', '3', '旧区--新区', ?, '10.1.2.3', '车很空', 'approved', ?, ?),
      ('bm-2', '3', '', null, '10.1.2.4', '广告内容', 'rejected', ?, ?)
  `).run(USER_ID, now - 60_000, now, now - 30_000, now)
  client.sqlite.prepare(`
    INSERT INTO place_moments (id, place_id, kind, body, ip, status, created_at)
    VALUES
      ('pm-1', 'place-x', 'comment', '食堂二楼好吃', '10.1.2.5', 'approved', ?),
      ('pm-2', 'place-x', 'comment', '垃圾地方', '10.1.2.6', 'rejected', ?)
  `).run(now - 45_000, now - 15_000)
  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

test('admin moments: 列表按 kind 分区、含 IP 与昵称、状态过滤', () => {
  const { client, cleanup } = createFixture()
  try {
    const bus = adminListMoments(client, { kind: 'bus', status: 'all' })
    assert.equal(bus.total, 2)
    assert.equal(bus.items[0]!.id, 'bm-2')
    assert.equal(bus.items[1]!.displayName, '学生甲')
    assert.equal(bus.items[0]!.ip, '10.1.2.4')

    const busRejected = adminListMoments(client, { kind: 'bus', status: 'rejected' })
    assert.equal(busRejected.total, 1)
    assert.equal(busRejected.items[0]!.id, 'bm-2')

    const place = adminListMoments(client, { kind: 'place', status: 'all', pageSize: 1, page: 2 })
    assert.equal(place.total, 2)
    assert.equal(place.items.length, 1)
    // 第 2 页 = 按时间倒序的更旧一条
    assert.equal(place.items[0]!.id, 'pm-1')
  } finally {
    cleanup()
  }
})

test('admin moments: 撤回与恢复记录管理员与理由', () => {
  const { client, cleanup } = createFixture()
  try {
    const withdrawn = adminModerateMoment(client, {
      kind: 'bus', id: 'bm-1', action: 'withdraw', reason: '与车无关的闲聊', adminId: ADMIN_ID
    })
    assert.equal(withdrawn?.status, 'rejected')
    assert.equal(withdrawn?.moderatedBy, ADMIN_ID)
    assert.equal(withdrawn?.moderationReason, '与车无关的闲聊')

    const restored = adminModerateMoment(client, {
      kind: 'bus', id: 'bm-1', action: 'restore', adminId: ADMIN_ID
    })
    assert.equal(restored?.status, 'approved')
    assert.equal(restored?.moderationReason, '管理员恢复')

    const place = adminModerateMoment(client, {
      kind: 'place', id: 'pm-1', action: 'withdraw', adminId: ADMIN_ID
    })
    assert.equal(place?.status, 'rejected')
  } finally {
    cleanup()
  }
})

test('admin moments: 物理删除', () => {
  const { client, cleanup } = createFixture()
  try {
    assert.equal(adminDeleteMoment(client, 'place', 'pm-2'), true)
    assert.equal(adminDeleteMoment(client, 'place', 'pm-2'), false)
    const left = adminListMoments(client, { kind: 'place', status: 'all' })
    assert.equal(left.total, 1)
  } finally {
    cleanup()
  }
})
