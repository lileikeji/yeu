import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { listPublishedEventsForPlace } from '../server/modules/signal/service'

const NOW = Date.now()
const HOUR = 60 * 60 * 1000

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-place-events-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = NOW
  client.sqlite.prepare(`
    INSERT INTO places (id, slug, name, summary, scope, type, status, created_at, updated_at)
    VALUES
      ('place-1', 'yangen-building', '仰恩楼', '主教学楼', 'campus', 'teaching', 'published', ?, ?),
      ('place-2', 'library', '图书馆', '图书馆', 'campus', 'teaching', 'published', ?, ?),
      ('place-3', 'draft-hall', '草稿馆', '未发布', 'campus', 'teaching', 'draft', ?, ?)
  `).run(now, now, now, now, now, now)
  client.sqlite.prepare(`
    INSERT INTO knowledge_entities (id, entity_type, canonical_name, normalized_name, aliases_json, summary, status, created_at, updated_at)
    VALUES ('ent-1', 'place', '仰恩楼', '仰恩楼', '["仰恩教学楼","仰恩教学大楼"]', '', 'active', ?, ?)
  `).run(now, now)
  db_close_guard(client)
  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function db_close_guard(_client: DatabaseClient): void {
  // 占位：保持 fixture 函数结构与 signal.test.ts 一致
}

function insertEvent(
  client: DatabaseClient,
  input: { id: string, slug: string, title: string, places: Array<{ name: string, slug: string }>, lastSeenAt: number }
): void {
  client.sqlite.prepare(`
    INSERT INTO signal_events (
      id, slug, title, summary, category, status, heat, source_count, item_count,
      score, tier, first_seen_at, last_seen_at, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, '', 'campus', 'published', 1, 1, 1, 1, 'B', ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.slug,
    input.title,
    input.lastSeenAt,
    input.lastSeenAt,
    JSON.stringify({ places: input.places }),
    input.lastSeenAt,
    input.lastSeenAt
  )
}

const YANGEN = { name: '仰恩楼', slug: 'yangen-building' }
const LIBRARY = { name: '图书馆', slug: 'library' }

function upcomingTitle(daysAhead: number): string {
  const date = new Date(NOW + daysAhead * 24 * HOUR)
  return `${date.getMonth() + 1}月${date.getDate()}日 学术讲座：AI 与校园生活`
}

test('place-events: 按 slug 反查挂在该点位的已发布事件，未来日期标预告', () => {
  const { client, cleanup } = createFixture()
  try {
    insertEvent(client, { id: 'ev-1', slug: 'ev-1', title: upcomingTitle(10), places: [YANGEN], lastSeenAt: NOW - 2 * HOUR })
    insertEvent(client, { id: 'ev-2', slug: 'ev-2', title: '期末考试安排通知', places: [LIBRARY], lastSeenAt: NOW - HOUR })
    insertEvent(client, { id: 'ev-3', slug: 'ev-3', title: '不相关事件', places: [{ name: '体育馆', slug: 'gym' }], lastSeenAt: NOW })

    const events = listPublishedEventsForPlace(client, { slug: 'yangen-building', name: null })
    assert.equal(events.length, 1)
    assert.equal(events[0]!.slug, 'ev-1')
    assert.ok(events[0]!.dateHint, 'future date in title should be parsed')
    assert.equal(events[0]!.dateHint?.kind, 'upcoming')
  } finally {
    cleanup()
  }
})

test('place-events: slug 缺省时按地点名解析（知识实体别名同源）', () => {
  const { client, cleanup } = createFixture()
  try {
    insertEvent(client, { id: 'ev-1', slug: 'ev-1', title: '仰恩楼机房检修', places: [YANGEN], lastSeenAt: NOW })
    const events = listPublishedEventsForPlace(client, { slug: null, name: '仰恩楼' })
    assert.equal(events.length, 1)
    assert.equal(events[0]!.slug, 'ev-1')
  } finally {
    cleanup()
  }
})

test('place-events: 未发布点位与未知地点返回空数组', () => {
  const { client, cleanup } = createFixture()
  try {
    insertEvent(client, { id: 'ev-1', slug: 'ev-1', title: '草稿馆活动', places: [{ name: '草稿馆', slug: 'draft-hall' }], lastSeenAt: NOW })
    assert.deepEqual(listPublishedEventsForPlace(client, { slug: 'draft-hall', name: null }), [])
    assert.deepEqual(listPublishedEventsForPlace(client, { slug: null, name: '不存在的大楼' }), [])
  } finally {
    cleanup()
  }
})

test('place-events: 按最近活跃排序且 limit 生效', () => {
  const { client, cleanup } = createFixture()
  try {
    for (let i = 0; i < 7; i++) {
      insertEvent(client, {
        id: `ev-${i}`,
        slug: `ev-${i}`,
        title: `仰恩楼通知 ${i}`,
        places: [YANGEN],
        lastSeenAt: NOW - i * HOUR
      })
    }
    const events = listPublishedEventsForPlace(client, { slug: 'yangen-building', name: null }, 5)
    assert.equal(events.length, 5)
    assert.equal(events[0]!.slug, 'ev-0')
    assert.equal(events[4]!.slug, 'ev-4')
  } finally {
    cleanup()
  }
})
