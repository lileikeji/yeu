import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { visitorBans, visitorEvents, visitors } from '../server/database/schema'
import { getPublicPageViewStats, listVisitorBans, listVisitors } from '../server/modules/visitors/service'

test('visitor list supports activity sorting and daily/hourly analytics', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-visitors-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const now = Date.now()
    const firstId = randomUUID()
    const secondId = randomUUID()
    // Events are placed inside "today" in the China timezone regardless of
    // when the suite runs (this fails at 00:00-02:00 if a 2-hour offset
    // crosses the midnight boundary). Use small offsets from now.
    const firstEventAt = now - 60_000
    const secondEventAt = now - 120_000
    const searchEventAt = now - 180_000
    client.db.insert(visitors).values([
      {
        id: firstId,
        firstSeenAt: now - 86_400_000,
        lastSeenAt: firstEventAt,
        lastIp: '192.0.2.1',
        lastPath: '/',
        eventCount: 1,
        createdAt: now - 86_400_000,
        updatedAt: now
      },
      {
        id: secondId,
        firstSeenAt: now - 7_200_000,
        lastSeenAt: secondEventAt,
        lastIp: '192.0.2.2',
        lastPath: '/search',
        eventCount: 2,
        createdAt: now - 7_200_000,
        updatedAt: now
      }
    ]).run()
    client.db.insert(visitorEvents).values([
      {
        id: randomUUID(),
        visitorId: firstId,
        action: 'page_view',
        path: '/guides/example',
        createdAt: firstEventAt,
        metaJson: '{}'
      },
      {
        id: randomUUID(),
        visitorId: secondId,
        action: 'page_view',
        path: '/guides/example',
        createdAt: secondEventAt,
        metaJson: '{}'
      },
      {
        id: randomUUID(),
        visitorId: secondId,
        action: 'search',
        path: '/search',
        createdAt: searchEventAt,
        metaJson: '{}'
      }
    ]).run()

    const recent = listVisitors(client, { page: 1, pageSize: 10, sort: 'last-seen' })
    assert.equal(recent.items[0]?.id, firstId)
    assert.equal(recent.analytics.today.eventCount, 3)
    assert.equal(recent.analytics.today.visitorCount, 2)
    assert.equal(recent.analytics.hourly.reduce((sum, item) => sum + item.eventCount, 0), 3)

    const mostActive = listVisitors(client, { page: 1, pageSize: 10, sort: 'event-count' })
    assert.equal(mostActive.items[0]?.id, secondId)

    const historicalIp = listVisitors(client, {
      page: 1,
      pageSize: 10,
      ip: '192.0.2.1',
      sort: 'last-seen',
      analytics: 'false'
    })
    assert.equal(historicalIp.items[0]?.id, firstId)
    assert.equal(historicalIp.analytics, undefined)

    assert.deepEqual(getPublicPageViewStats(client, '/guides/example'), {
      path: '/guides/example',
      viewCount: 2,
      visitorCount: 2
    })
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('IP filtering includes visitors with historical activity from the requested address', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-visitor-ip-history-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const now = Date.now()
    const visitorId = randomUUID()
    client.db.insert(visitors).values({
      id: visitorId,
      firstSeenAt: now - 2_000,
      lastSeenAt: now,
      lastIp: '192.0.2.77',
      lastPath: '/',
      eventCount: 2,
      createdAt: now - 2_000,
      updatedAt: now
    }).run()
    client.db.insert(visitorEvents).values({
      id: randomUUID(),
      visitorId,
      ip: '192.0.2.55',
      action: 'crawler_honeypot',
      path: '/__yeu_crawl_trap__',
      metaJson: '{}',
      createdAt: now - 1_000
    }).run()

    const result = listVisitors(client, {
      page: 1,
      pageSize: 10,
      ip: '192.0.2.55',
      analytics: 'false'
    })
    assert.equal(result.total, 1)
    assert.equal(result.items[0]?.id, visitorId)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('expired automatic bans stay available as history but do not count as active', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-visitor-bans-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const now = Date.now()
    client.db.insert(visitorBans).values([
      {
        id: randomUUID(),
        scope: 'ip',
        value: '192.0.2.10',
        reason: 'crawler_honeypot',
        isActive: true,
        expiresAt: now - 1,
        createdAt: now - 60_000,
        updatedAt: now - 1
      },
      {
        id: randomUUID(),
        scope: 'ip',
        value: '192.0.2.11',
        reason: 'manual_review',
        isActive: true,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now
      }
    ]).run()

    const active = listVisitorBans(client, { page: 1, pageSize: 10, active: 'true' })
    assert.equal(active.total, 1)
    assert.equal(active.items[0]?.reason, 'manual_review')

    const history = listVisitorBans(client, { page: 1, pageSize: 10, active: 'false' })
    assert.equal(history.total, 1)
    assert.equal(history.items[0]?.reason, 'crawler_honeypot')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('unfiltered visitor total follows the visitor_stats counter', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-visitor-total-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const total = () => listVisitors(client, {
      page: 1,
      pageSize: 5,
      sort: 'last-seen',
      analytics: 'false'
    }).total

    assert.equal(total(), 0)
    const visitorId = randomUUID()
    const now = Date.now()
    client.db.insert(visitors).values({
      id: visitorId,
      firstSeenAt: now,
      lastSeenAt: now,
      lastIp: '192.0.2.20',
      lastPath: '/',
      eventCount: 1,
      createdAt: now,
      updatedAt: now
    }).run()
    // 触发器即时维护计数器，不需要缓存失效
    assert.equal(total(), 1)
    assert.equal(client.sqlite.prepare('SELECT total FROM visitor_stats WHERE id = 1').get<{ total: number }>()['total'], 1)
    client.sqlite.prepare('DELETE FROM visitors WHERE id = ?').run(visitorId)
    assert.equal(total(), 0)
    // 带筛选的查询仍实时统计，不走计数器
    assert.equal(listVisitors(client, {
      page: 1,
      pageSize: 5,
      ip: '192.0.2.20',
      analytics: 'false'
    }).total, 0)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
