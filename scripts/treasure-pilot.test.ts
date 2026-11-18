import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { users } from '../server/database/schema'
import {
  awardTreasureStamp,
  checkTreasurePosition,
  matchesTreasureAnswer,
  readTreasurePilotConfig,
  readTreasureStamp,
  treasurePilotRequestSchema
} from '../server/modules/treasure-pilot/service'

const center = { lat: 25.11556, lng: 118.6132 }
const time = 1_794_900_000_000

function position(metersNorth: number, accuracy = 5, timestamp = time) {
  return {
    lng: center.lng,
    lat: center.lat + metersNorth / 6_371_000 * 180 / Math.PI,
    accuracy,
    timestamp
  }
}

test('uses the unrounded 20 m boundary and rejects stale or imprecise locations', () => {
  assert.equal(checkTreasurePosition(center, position(19), time).status, 'eligible')
  assert.equal(checkTreasurePosition(center, position(20), time).status, 'eligible')
  assert.deepEqual(checkTreasurePosition(center, position(20.01), time), {
    status: 'outside',
    distanceMeters: 20.1
  })
  assert.equal(checkTreasurePosition(center, position(21), time).status, 'outside')
  assert.equal(checkTreasurePosition(center, position(1, 13), time).status, 'inaccurate')
  assert.equal(checkTreasurePosition(center, position(1, 5, time - 30_001), time).status, 'stale')
  assert.equal(checkTreasurePosition(center, position(1, 5, time + 5_001), time).status, 'stale')
})

test('requires configured coordinates and answer, and rejects invalid request bodies', () => {
  assert.equal(readTreasurePilotConfig({
    treasurePilotLatitude: '',
    treasurePilotLongitude: '',
    treasurePilotAnswer: 'test'
  }), null)
  assert.deepEqual(readTreasurePilotConfig({
    treasurePilotLatitude: center.lat,
    treasurePilotLongitude: center.lng,
    treasurePilotAnswer: 1234
  }), { point: center, answer: '1234' })
  assert.equal(treasurePilotRequestSchema.safeParse({
    action: 'claim', position: { ...position(1), accuracy: -1 }, answer: 'test'
  }).success, false)
  assert.equal(treasurePilotRequestSchema.safeParse({
    action: 'check', position: { ...position(1), lng: 181 }
  }).success, false)
  assert.ok(matchesTreasureAnswer(' ｐｉｌｏｔ ', 'pilot'))
  assert.equal(matchesTreasureAnswer('guess', 'pilot'), false)
})

test('persists one stamp per account and keeps each account independent', () => {
  const client = getDatabase(':memory:')
  try {
    runMigrations(client)
    for (const id of ['first', 'second']) {
      client.db.insert(users).values({ id, username: id, passwordHash: 'fixture', displayName: id }).run()
    }
    const collectedAt = awardTreasureStamp(client, 'first')
    assert.equal(awardTreasureStamp(client, 'first'), collectedAt)
    assert.equal(readTreasureStamp(client, 'first'), collectedAt)
    assert.equal(readTreasureStamp(client, 'second'), null)
    assert.deepEqual(client.sqlite.prepare('select count(*) as count from treasure_stamps').get(), { count: 1 })
    assert.deepEqual(client.sqlite.pragma('foreign_key_check'), [])
  } finally {
    closeDatabase(':memory:')
  }
})
