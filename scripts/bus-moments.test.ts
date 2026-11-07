import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { createBusMoment, listBusMoments, normalizeBusName } from '../server/modules/transit/bus-moments'

const USER_A = '0b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-bus-moments-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = Date.now()
  client.sqlite.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, status, created_at, updated_at)
    VALUES (?, ?, 'x', '学生甲', 'active', ?, ?)
  `).run(USER_A, 'student-a', now, now)
  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

test('bus-moments: 匿名与登录用户都能留言，按车号分区聚合', () => {
  const { client, cleanup } = createFixture()
  try {
    createBusMoment(client, { busName: ' 3 ', routeName: '旧区--新区', body: '这趟车很空' }, { anonymousKey: 'anon-1' })
    createBusMoment(client, { busName: '3', routeName: '新区--旧区', body: '师傅开得稳' }, { userId: USER_A })
    createBusMoment(client, { busName: '5', routeName: '旧区--新区', body: '5 号车的留言' }, { anonymousKey: 'anon-2' })

    const bus3 = listBusMoments(client, '3')
    assert.equal(bus3.busName, '3')
    // 两个方向的 3 号车留言聚合在同一分区
    assert.equal(bus3.moments.length, 2)
    assert.deepEqual(bus3.moments.map(moment => moment.routeName), ['新区--旧区', '旧区--新区'])

    const bus5 = listBusMoments(client, '5')
    assert.equal(bus5.moments.length, 1)

    // 登录用户显示昵称，匿名显示访客
    assert.equal(bus3.moments[0]!.displayName, '学生甲')
    assert.equal(bus3.moments[1]!.displayName, '访客')
  } finally {
    cleanup()
  }
})

test('bus-moments: 空内容与空车号被拒绝', () => {
  const { client, cleanup } = createFixture()
  try {
    assert.throws(
      () => createBusMoment(client, { busName: '3', routeName: '', body: '   ' }, { anonymousKey: 'anon-1' }),
      (error: { data?: { code?: string } }) => error.data?.code === 'BUS_MOMENT_EMPTY'
    )
    assert.throws(
      () => createBusMoment(client, { busName: '   ', routeName: '', body: '内容' }, { anonymousKey: 'anon-1' }),
      (error: { data?: { code?: string } }) => error.data?.code === 'BUS_MOMENT_BUS_EMPTY'
    )
    assert.equal(listBusMoments(client, '3').moments.length, 0)
  } finally {
    cleanup()
  }
})

test('bus-moments: 超长内容截断、车号规范化', () => {
  const { client, cleanup } = createFixture()
  try {
    createBusMoment(client, {
      busName: ' 7 ',
      routeName: '旧区--新区',
      body: '长'.repeat(400)
    }, { anonymousKey: 'anon-1' })
    const moments = listBusMoments(client, '7').moments
    assert.equal(moments.length, 1)
    assert.equal(moments[0]!.body.length, 300)
    assert.equal(normalizeBusName('  12  '), '12')
  } finally {
    cleanup()
  }
})

test('bus-moments: 按时间倒序且 limit 生效', () => {
  const { client, cleanup } = createFixture()
  try {
    for (let i = 0; i < 8; i++) {
      const moment = createBusMoment(client, {
        busName: '9',
        routeName: '',
        body: `留言 ${i}`
      }, { anonymousKey: `anon-${i}` })
      // 同毫秒插入会按主键乱序，手动错开 created_at
      client.sqlite.prepare('UPDATE bus_moments SET created_at = ? WHERE id = ?')
        .run(Date.now() - i * 60_000, moment.id)
    }
    const moments = listBusMoments(client, '9', 5).moments
    assert.equal(moments.length, 5)
    assert.equal(moments[0]!.body, '留言 0')
  } finally {
    cleanup()
  }
})
