import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { visitorEvents, visitors } from '../server/database/schema'
import { listVisitors } from '../server/modules/visitors/service'

test('visitor list supports activity sorting and daily/hourly analytics', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-visitors-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const now = Date.now()
    const firstId = randomUUID()
    const secondId = randomUUID()
    client.db.insert(visitors).values([
      {
        id: firstId,
        firstSeenAt: now - 86_400_000,
        lastSeenAt: now - 3_600_000,
        lastIp: '192.0.2.1',
        lastPath: '/',
        eventCount: 1,
        createdAt: now - 86_400_000,
        updatedAt: now
      },
      {
        id: secondId,
        firstSeenAt: now - 7_200_000,
        lastSeenAt: now - 7_200_000,
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
        createdAt: now - 3_600_000,
        metaJson: '{}'
      },
      {
        id: randomUUID(),
        visitorId: secondId,
        action: 'page_view',
        createdAt: now - 7_200_000,
        metaJson: '{}'
      },
      {
        id: randomUUID(),
        visitorId: secondId,
        action: 'search',
        createdAt: now - 7_100_000,
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
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
