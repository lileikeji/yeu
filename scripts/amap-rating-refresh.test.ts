import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { refreshStaleAmapRatings } from '../server/modules/place-reviews/rating-refresh'
import { upsertAmapRating } from '../server/modules/place-reviews/service'

/**
 * 回归背景：`place_amap_ratings` 过去只有手工脚本写入，TTL 到期后无人刷新，
 * 线上美食推荐、单店详情、评分徽章一起静默失效（2026-09-12 起四天）。
 */
function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-amap-refresh-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

const KEY = 'test-amap-key'

test('stale amap ratings are refreshed while fresh rows are left alone', async () => {
  const { client, cleanup } = createFixture()
  try {
    upsertAmapRating(client, 'place-fresh', { poiId: 'B0FRESH', poiName: '新鲜店', score: 4.8, cost: 20 })
    upsertAmapRating(client, 'place-stale', { poiId: 'B0STALE', poiName: '过期店', score: 3.1, cost: 15 })
    client.sqlite.prepare("UPDATE place_amap_ratings SET expires_at = 1 WHERE place_id = 'place-stale'").run()

    const asked: string[] = []
    const result = await refreshStaleAmapRatings(client, KEY, {
      delayMs: 0,
      fetchRating: async (_key, poiId) => {
        asked.push(poiId)
        return { poiId, poiName: '过期店(新)', score: 4.4, cost: 18 }
      }
    })

    // 只对过期的那一行发起请求：TTL 未到的行不重复调用高德。
    assert.deepEqual(asked, ['B0STALE'])
    assert.deepEqual(result, { stale: 1, refreshed: 1, missing: 0, failed: 0 })

    const refreshed = client.sqlite.prepare(
      "SELECT amap_poi_name AS name, score, expires_at AS expiresAt FROM place_amap_ratings WHERE place_id = 'place-stale'"
    ).get() as { name: string, score: number, expiresAt: number }
    assert.equal(refreshed.name, '过期店(新)')
    assert.equal(refreshed.score, 4.4)
    assert.ok(refreshed.expiresAt > Date.now(), '刷新后 TTL 必须被续上')

    const untouched = client.sqlite.prepare(
      "SELECT score FROM place_amap_ratings WHERE place_id = 'place-fresh'"
    ).get() as { score: number }
    assert.equal(untouched.score, 4.8)
  } finally {
    cleanup()
  }
})

test('a missing POI is reported but never deletes the local rating row', async () => {
  const { client, cleanup } = createFixture()
  try {
    upsertAmapRating(client, 'place-gone', { poiId: 'B0GONE', poiName: '已下线店', score: 3.9, cost: 18 })
    client.sqlite.prepare('UPDATE place_amap_ratings SET expires_at = 1').run()

    const result = await refreshStaleAmapRatings(client, KEY, {
      delayMs: 0,
      fetchRating: async () => null
    })

    assert.deepEqual(result, { stale: 1, refreshed: 0, missing: 1, failed: 0 })
    // 门店仍在服务中：宁可继续用旧评分，也不要把行删掉让推荐池变空。
    const row = client.sqlite.prepare(
      "SELECT amap_poi_name AS name, score FROM place_amap_ratings WHERE place_id = 'place-gone'"
    ).get() as { name: string, score: number } | undefined
    assert.equal(row?.name, '已下线店')
    assert.equal(row?.score, 3.9)
  } finally {
    cleanup()
  }
})

test('one failing row does not abort the rest of the refresh', async () => {
  const { client, cleanup } = createFixture()
  try {
    upsertAmapRating(client, 'place-a', { poiId: 'B0A', poiName: 'A店', score: 3, cost: 10 })
    upsertAmapRating(client, 'place-b', { poiId: 'B0B', poiName: 'B店', score: 4, cost: 12 })
    client.sqlite.prepare('UPDATE place_amap_ratings SET expires_at = 1').run()

    let call = 0
    const result = await refreshStaleAmapRatings(client, KEY, {
      delayMs: 0,
      fetchRating: async (_key, poiId) => {
        call += 1
        if (call === 1) throw new Error('AMAP_TIMEOUT')
        return { poiId, poiName: 'B店(新)', score: 4.5, cost: 12 }
      }
    })

    assert.deepEqual(result, { stale: 2, refreshed: 1, missing: 0, failed: 1 })
  } finally {
    cleanup()
  }
})

test('without an amap key the refresh is a no-op', async () => {
  const { client, cleanup } = createFixture()
  try {
    upsertAmapRating(client, 'place-x', { poiId: 'B0X', poiName: 'X店', score: 3, cost: 10 })
    client.sqlite.prepare('UPDATE place_amap_ratings SET expires_at = 1').run()

    let called = false
    const result = await refreshStaleAmapRatings(client, '   ', {
      delayMs: 0,
      fetchRating: async () => {
        called = true
        return null
      }
    })
    assert.deepEqual(result, { stale: 0, refreshed: 0, missing: 0, failed: 0 })
    assert.equal(called, false)
  } finally {
    cleanup()
  }
})
