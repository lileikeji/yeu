import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { listPlaceFeed } from '../server/modules/place-feed/service'

const NOW = Date.now()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-place-feed-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)

  client.sqlite.prepare(`
    INSERT INTO contents (id, kind, slug, title, summary, status, created_at, updated_at)
    VALUES ('club-1', 'club', 'ai-club', '人工智能协会', '社团简介', 'published', ?, ?)
  `).run(NOW, NOW)
  client.sqlite.prepare(`
    INSERT INTO places (id, slug, name, summary, scope, type, category, status, created_at, updated_at)
    VALUES
      ('place-1', 'jilong-building', '吉龙楼', '教学楼', 'campus', 'teaching-building', 'campus-building', 'published', ?, ?),
      ('place-draft', 'draft-building', '草稿楼', '未发布', 'campus', 'teaching-building', 'campus-building', 'draft', ?, ?)
  `).run(NOW, NOW, NOW, NOW)

  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function insertActivity(
  client: DatabaseClient,
  input: { id: string, slug: string, title: string, startsAt: number, placeId?: string }
): void {
  client.sqlite.prepare(`
    INSERT INTO activities (
      id, slug, organization_content_id, place_id, room, title, summary, body,
      photos_json, starts_at, ends_at, status, published_at, created_at, updated_at
    ) VALUES (?, ?, 'club-1', ?, '305', ?, '活动简介', '', '[]', ?, ?, 'published', ?, ?, ?)
  `).run(
    input.id,
    input.slug,
    input.placeId ?? 'place-1',
    input.title,
    input.startsAt,
    input.startsAt + HOUR,
    NOW,
    NOW,
    NOW
  )
}

function insertSignal(
  client: DatabaseClient,
  input: { id: string, slug: string, title: string, lastSeenAt: number }
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
    JSON.stringify({ places: [{ name: '吉龙楼', slug: 'jilong-building' }] }),
    input.lastSeenAt,
    input.lastSeenAt
  )
}

function upcomingTitle(daysAhead: number): string {
  const date = new Date(NOW + daysAhead * DAY)
  return `${date.getMonth() + 1}月${date.getDate()}日 学术讲座`
}

test('place-feed: 活动与信号事件合并，按未开始/已开始分组且时间新的在前', () => {
  const { client, cleanup } = createFixture()
  try {
    insertSignal(client, {
      id: 'ev-future',
      slug: 'ev-future',
      title: upcomingTitle(6),
      lastSeenAt: NOW - HOUR
    })
    insertSignal(client, {
      id: 'ev-recent',
      slug: 'ev-recent',
      title: '期末考试安排通知',
      lastSeenAt: NOW - 3 * HOUR
    })
    insertActivity(client, {
      id: 'act-future',
      slug: 'act-future',
      title: '两天后的活动',
      startsAt: NOW + 2 * DAY
    })
    insertActivity(client, {
      id: 'act-started',
      slug: 'act-started',
      title: '已经开始的活动',
      startsAt: NOW - 2 * HOUR
    })

    const items = listPlaceFeed(client, { slug: 'jilong-building', name: null }, 10)
    assert.equal(items.length, 4)

    const upcoming = items.filter(item => item.status === 'upcoming')
    assert.deepEqual(upcoming.map(item => item.slug), ['ev-future', 'act-future'])
    assert.equal(upcoming[0]!.kind, 'signal')
    assert.equal(upcoming[1]!.kind, 'activity')
    assert.equal(upcoming[1]!.room, '305')
    assert.equal(upcoming[1]!.organization?.title, '人工智能协会')

    const started = items.filter(item => item.status === 'started')
    assert.deepEqual(started.map(item => item.slug), ['act-started', 'ev-recent'])
    assert.equal(started[1]!.channel, 'notice')
  } finally {
    cleanup()
  }
})

test('place-feed: slug 缺省时按地点名解析，草稿地点不外露', () => {
  const { client, cleanup } = createFixture()
  try {
    insertActivity(client, {
      id: 'act-1',
      slug: 'act-1',
      title: '按名称命中的活动',
      startsAt: NOW + DAY
    })
    const byName = listPlaceFeed(client, { slug: null, name: '吉龙楼' }, 10)
    assert.equal(byName.length, 1)
    assert.equal(byName[0]!.slug, 'act-1')

    assert.deepEqual(
      listPlaceFeed(client, { slug: 'draft-building', name: '草稿楼' }, 10),
      []
    )
  } finally {
    cleanup()
  }
})

test('place-feed: limit 作用于合并后的结果', () => {
  const { client, cleanup } = createFixture()
  try {
    for (let index = 0; index < 5; index++) {
      insertActivity(client, {
        id: `act-${index}`,
        slug: `act-${index}`,
        title: `活动 ${index}`,
        startsAt: NOW + (index + 1) * DAY
      })
    }
    const items = listPlaceFeed(client, { slug: 'jilong-building', name: null }, 3)
    assert.equal(items.length, 3)
    assert.deepEqual(items.map(item => item.slug), ['act-4', 'act-3', 'act-2'])
  } finally {
    cleanup()
  }
})
