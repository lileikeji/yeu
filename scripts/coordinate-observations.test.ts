import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createCoordinateObservationSchema } from '../shared/schemas/server'
import {
  coordinateCaptureBelongsToPlace,
  shouldLockCoordinateCapturePlace
} from '../app/utils/coordinate-capture-session'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  approveCoordinateObservation,
  createCoordinateObservation,
  rejectCoordinateObservation
} from '../server/modules/places/coordinate-observations'
import { updatePlace } from '../server/modules/places/service'

interface TestHttpError extends Error {
  statusCode?: number
  data?: { code?: string }
}

Object.defineProperty(globalThis, 'createError', {
  configurable: true,
  value: (input: { statusCode?: number, statusMessage?: string, data?: { code?: string } }) => {
    const error = new Error(input.statusMessage) as TestHttpError
    error.statusCode = input.statusCode
    error.data = input.data
    return error
  }
})

function createFixture(): { client: DatabaseClient, adminId: string, placeId: string, cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-coordinate-observations-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = Date.now()
  const adminId = randomUUID()
  const placeId = randomUUID()
  client.sqlite.prepare(`
    INSERT INTO admin_users (
      id, username, password_hash, display_name, is_active, created_at, updated_at
    ) VALUES (?, 'reviewer', 'fixture-hash', 'Reviewer', 1, ?, ?)
  `).run(adminId, now, now)
  client.sqlite.prepare(`
    INSERT INTO places (
      id, slug, name, summary, body, scope, type, coordinate_verification,
      status, created_at, updated_at
    ) VALUES (?, 'field-place', '现场地点', 'Fixture summary', '', 'campus', 'building',
      'missing', 'draft', ?, ?)
  `).run(placeId, now, now)
  return {
    client,
    adminId,
    placeId,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function samples(now: number, accuracyMeters = 6) {
  return [
    { longitude: 118.6050000, latitude: 25.1120000, accuracyMeters, capturedAt: new Date(now - 6_000).toISOString() },
    { longitude: 118.6050100, latitude: 25.1120050, accuracyMeters, capturedAt: new Date(now - 4_000).toISOString() },
    { longitude: 118.6049950, latitude: 25.1119950, accuracyMeters, capturedAt: new Date(now - 2_000).toISOString() }
  ]
}

function clientWithRaceBeforeMethod(
  client: DatabaseClient,
  method: 'transaction' | 'update',
  race: () => void
): DatabaseClient {
  let raced = false
  const db = new Proxy(client.db, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown
      if (property === method && typeof value === 'function') {
        return (...args: unknown[]) => {
          if (!raced) {
            raced = true
            race()
          }
          return Reflect.apply(value, target, args)
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    }
  }) as DatabaseClient['db']
  return { ...client, db }
}

test('capture samples remain bound to their starting place and hold the selector lock', () => {
  assert.equal(coordinateCaptureBelongsToPlace('place-a', 'place-a'), true)
  assert.equal(coordinateCaptureBelongsToPlace('place-a', 'place-b'), false)
  assert.equal(coordinateCaptureBelongsToPlace(null, 'place-a'), false)
  assert.equal(shouldLockCoordinateCapturePlace(true, 0), true)
  assert.equal(shouldLockCoordinateCapturePlace(false, 3), true)
  assert.equal(shouldLockCoordinateCapturePlace(false, 0), false)
})

test('browser capture requires at least three samples', () => {
  const result = createCoordinateObservationSchema.safeParse({
    placeId: randomUUID(),
    captureMethod: 'browser-geolocation',
    pointRole: 'main-entrance',
    evidenceNote: '站在主入口标牌外采集。',
    samples: samples(Date.now()).slice(0, 2)
  })
  assert.equal(result.success, false)
})

test('a pending observation does not change the place until separate approval', () => {
  const fixture = createFixture()
  try {
    const observation = createCoordinateObservation(fixture.client, {
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'browser-geolocation',
      pointRole: 'main-entrance',
      evidenceNote: '站在主入口标牌外，保持静止完成采样。',
      samples: samples(Date.now())
    })
    assert.equal(observation.reviewStatus, 'pending')
    assert.equal(observation.sampleCount, 3)
    assert.ok(observation.accuracyMeters <= 7)

    const before = fixture.client.sqlite.prepare(`
      SELECT longitude, coordinate_verification AS coordinateVerification
      FROM places WHERE id = ?
    `).get(fixture.placeId)
    assert.deepEqual(before, { longitude: null, coordinateVerification: 'missing' })

    const approved = approveCoordinateObservation(
      fixture.client,
      observation.id,
      fixture.adminId,
      '已比对入口标牌与现场道路，批准为主导航点。'
    )
    assert.equal(approved.reviewStatus, 'approved')
    const after = fixture.client.sqlite.prepare(`
      SELECT longitude, latitude, coordinate_system AS coordinateSystem,
        coordinate_verification AS coordinateVerification,
        coordinate_verified_at AS coordinateVerifiedAt
      FROM places WHERE id = ?
    `).get(fixture.placeId) as Record<string, unknown>
    assert.equal(after.coordinateSystem, 'WGS84')
    assert.equal(after.coordinateVerification, 'verified')
    assert.ok(typeof after.coordinateVerifiedAt === 'number')
    assert.equal(after.longitude, observation.longitude)
    assert.equal(after.latitude, observation.latitude)
  } finally {
    fixture.cleanup()
  }
})

test('low-accuracy observations and manual verification are rejected', () => {
  const fixture = createFixture()
  try {
    const observation = createCoordinateObservation(fixture.client, {
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'browser-geolocation',
      pointRole: 'site-point',
      evidenceNote: '设备精度较低，仅保存为待复核线索。',
      samples: samples(Date.now(), 60)
    })

    assert.throws(
      () => approveCoordinateObservation(
        fixture.client,
        observation.id,
        fixture.adminId,
        '当前精度不足，不应批准。'
      ),
      (error: unknown) => (error as TestHttpError).data?.code === 'COORDINATE_OBSERVATION_ACCURACY_TOO_LOW'
    )
    assert.throws(
      () => updatePlace(fixture.client, fixture.placeId, {
        longitude: 118.605,
        latitude: 25.112,
        coordinateSystem: 'WGS84',
        coordinateVerification: 'verified',
        coordinateVerifiedAt: new Date().toISOString()
      }),
      (error: unknown) => (error as TestHttpError).data?.code === 'COORDINATE_OBSERVATION_REQUIRED'
    )
  } finally {
    fixture.cleanup()
  }
})

test('approval compare-and-swap cannot overwrite a concurrent rejection', () => {
  const fixture = createFixture()
  try {
    const observation = createCoordinateObservation(fixture.client, {
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'browser-geolocation',
      pointRole: 'main-entrance',
      evidenceNote: '在入口标牌旁保持静止，等待定位稳定后采集。',
      samples: samples(Date.now())
    })
    const concurrentNote = '另一审核者已先完成驳回。'
    const racingClient = clientWithRaceBeforeMethod(fixture.client, 'transaction', () => {
      const now = Date.now()
      fixture.client.sqlite.prepare(`
        UPDATE place_coordinate_observations
        SET review_status = 'rejected', reviewed_by = ?, reviewed_at = ?,
          review_note = ?, updated_at = ?
        WHERE id = ? AND review_status = 'pending'
      `).run(fixture.adminId, now, concurrentNote, now, observation.id)
    })

    assert.throws(
      () => approveCoordinateObservation(
        racingClient,
        observation.id,
        fixture.adminId,
        '本审核尝试不应覆盖并发决定。'
      ),
      (error: unknown) => (error as TestHttpError).data?.code === 'COORDINATE_OBSERVATION_ALREADY_REVIEWED'
    )
    const row = fixture.client.sqlite.prepare(`
      SELECT review_status AS reviewStatus, review_note AS reviewNote
      FROM place_coordinate_observations WHERE id = ?
    `).get(observation.id)
    assert.deepEqual(row, { reviewStatus: 'rejected', reviewNote: concurrentNote })
    const place = fixture.client.sqlite.prepare(`
      SELECT longitude, coordinate_verification AS coordinateVerification
      FROM places WHERE id = ?
    `).get(fixture.placeId)
    assert.deepEqual(place, { longitude: null, coordinateVerification: 'missing' })
  } finally {
    fixture.cleanup()
  }
})

test('rejection compare-and-swap cannot overwrite a concurrent approval', () => {
  const fixture = createFixture()
  try {
    const observation = createCoordinateObservation(fixture.client, {
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'browser-geolocation',
      pointRole: 'site-point',
      evidenceNote: '在场地点中心保持静止，等待定位稳定后采集。',
      samples: samples(Date.now())
    })
    const concurrentNote = '另一审核者已先完成批准。'
    const racingClient = clientWithRaceBeforeMethod(fixture.client, 'update', () => {
      const now = Date.now()
      fixture.client.sqlite.prepare(`
        UPDATE place_coordinate_observations
        SET review_status = 'approved', reviewed_by = ?, reviewed_at = ?,
          review_note = ?, updated_at = ?
        WHERE id = ? AND review_status = 'pending'
      `).run(fixture.adminId, now, concurrentNote, now, observation.id)
    })

    assert.throws(
      () => rejectCoordinateObservation(
        racingClient,
        observation.id,
        fixture.adminId,
        '本审核尝试不应覆盖并发决定。'
      ),
      (error: unknown) => (error as TestHttpError).data?.code === 'COORDINATE_OBSERVATION_ALREADY_REVIEWED'
    )
    const row = fixture.client.sqlite.prepare(`
      SELECT review_status AS reviewStatus, review_note AS reviewNote
      FROM place_coordinate_observations WHERE id = ?
    `).get(observation.id)
    assert.deepEqual(row, { reviewStatus: 'approved', reviewNote: concurrentNote })
  } finally {
    fixture.cleanup()
  }
})
