import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  createCoordinateObservationSchema
} from '../shared/schemas/server'
import {
  MAX_DUAL_VERIFICATION_DISTANCE_METERS,
  MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS
} from '../shared/constants/server'
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

function samples(
  now: number,
  accuracyMeters = 6,
  longitude = 118.605,
  latitude = 25.112
) {
  return [
    { longitude, latitude, accuracyMeters, capturedAt: new Date(now - 14_000).toISOString() },
    { longitude: longitude + 0.00001, latitude: latitude + 0.000005, accuracyMeters, capturedAt: new Date(now - 11_000).toISOString() },
    { longitude: longitude - 0.000005, latitude: latitude - 0.000005, accuracyMeters, capturedAt: new Date(now - 8_000).toISOString() },
    { longitude: longitude + 0.000005, latitude: latitude - 0.000005, accuracyMeters, capturedAt: new Date(now - 5_000).toISOString() },
    { longitude: longitude - 0.00001, latitude: latitude + 0.000005, accuracyMeters, capturedAt: new Date(now - 2_000).toISOString() }
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

test('browser capture schema enforces every field sampling threshold', () => {
  const now = Date.now()
  const stable = samples(now)
  const eightSamples = Array.from({ length: 8 }, (_, index) => ({
    ...stable[0]!,
    capturedAt: new Date(now - 23_000 + index * 3_000).toISOString()
  }))
  const scenarios = [
    { name: 'fewer than five samples', values: stable.slice(0, 4) },
    { name: 'more than seven samples', values: eightSamples },
    {
      name: 'less than twelve seconds total duration',
      values: stable.map((sample, index) => ({
        ...sample,
        capturedAt: new Date(now - 11_000 + index * 2_750).toISOString()
      }))
    },
    {
      name: 'one interval below three seconds despite twelve seconds total duration',
      values: stable.map((sample, index) => ({
        ...sample,
        capturedAt: new Date(now + [-14_000, -11_000, -8_000, -6_000, -2_000][index]!).toISOString()
      }))
    },
    {
      name: 'one device sample above twenty-five metre accuracy',
      values: stable.map((sample, index) => ({
        ...sample,
        accuracyMeters: index === 2 ? 26 : sample.accuracyMeters
      }))
    },
    {
      name: 'effective accuracy above twenty-five metres',
      values: stable.map((sample, index) => ({
        ...sample,
        longitude: index === stable.length - 1 ? sample.longitude + 0.001 : sample.longitude
      }))
    }
  ]

  for (const scenario of scenarios) {
    const result = createCoordinateObservationSchema.safeParse({
      clientObservationId: randomUUID(),
      placeId: randomUUID(),
      captureMethod: 'browser-geolocation',
      pointRole: 'main-entrance',
      evidenceNote: '站在主入口标牌外采集。',
      samples: scenario.values
    })
    assert.equal(result.success, false, scenario.name)
  }
})

test('service rejects forged browser captures that bypass schema quality validation', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    const stable = samples(now)
    const eightSamples = Array.from({ length: 8 }, (_, index) => ({
      ...stable[0]!,
      capturedAt: new Date(now - 23_000 + index * 3_000).toISOString()
    }))
    const scenarios = [
      {
        name: 'too few samples',
        expectedCode: 'BROWSER_GEOLOCATION_SAMPLE_COUNT_INVALID',
        values: stable.slice(0, 4)
      },
      {
        name: 'too many samples',
        expectedCode: 'BROWSER_GEOLOCATION_SAMPLE_COUNT_INVALID',
        values: eightSamples
      },
      {
        name: 'short capture duration',
        expectedCode: 'BROWSER_GEOLOCATION_CAPTURE_TIMING_INVALID',
        values: stable.map((sample, index) => ({
          ...sample,
          capturedAt: new Date(now - 5_000 + index * 1_000).toISOString()
        }))
      },
      {
        name: 'sub-three-second interval in a twelve-second capture',
        expectedCode: 'BROWSER_GEOLOCATION_CAPTURE_TIMING_INVALID',
        values: stable.map((sample, index) => ({
          ...sample,
          capturedAt: new Date(now + [-14_000, -11_000, -8_000, -6_000, -2_000][index]!).toISOString()
        }))
      },
      {
        name: 'poor device accuracy',
        expectedCode: 'BROWSER_GEOLOCATION_CAPTURE_UNSTABLE',
        values: stable.map((sample, index) => ({
          ...sample,
          accuracyMeters: index === 2 ? 26 : sample.accuracyMeters
        }))
      },
      {
        name: 'spatially unstable samples',
        expectedCode: 'BROWSER_GEOLOCATION_CAPTURE_UNSTABLE',
        values: stable.map((sample, index) => ({
          ...sample,
          longitude: index === stable.length - 1 ? sample.longitude + 0.001 : sample.longitude
        }))
      }
    ]

    for (const scenario of scenarios) {
      assert.throws(
        () => createCoordinateObservation(fixture.client, {
          clientObservationId: randomUUID(),
          placeId: fixture.placeId,
          coordinateSystem: 'WGS84',
          captureMethod: 'browser-geolocation',
          pointRole: 'main-entrance',
          evidenceNote: `Forged browser request: ${scenario.name}`,
          samples: scenario.values
        }),
        (error: unknown) => {
          const httpError = error as TestHttpError
          return httpError.statusCode === 422 && httpError.data?.code === scenario.expectedCode
        }
      )
    }
    assert.equal((fixture.client.sqlite.prepare(`
      SELECT count(*) AS count FROM place_coordinate_observations
    `).get() as { count: number }).count, 0)
  } finally {
    fixture.cleanup()
  }
})

test('authorized imports and map review are not subject to browser sampling duration rules', () => {
  const fixture = createFixture()
  try {
    for (const captureMethod of ['authorized-import', 'map-review'] as const) {
      const input = {
        clientObservationId: randomUUID(),
        placeId: fixture.placeId,
        coordinateSystem: 'WGS84',
        captureMethod,
        pointRole: 'main-entrance',
        evidenceNote: `Single ${captureMethod} evidence item.`,
        samples: [{
          longitude: 118.605,
          latitude: 25.112,
          accuracyMeters: 40,
          capturedAt: new Date(Date.now() - 2_000).toISOString()
        }]
      } as const
      assert.equal(createCoordinateObservationSchema.safeParse(input).success, true)
      const observation = createCoordinateObservation(fixture.client, input).observation
      assert.equal(observation.sampleCount, 1)
      assert.equal(observation.reviewStatus, 'pending')
    }
  } finally {
    fixture.cleanup()
  }
})

test('service revalidates an idempotent browser replay before returning a stored result', () => {
  const fixture = createFixture()
  try {
    const clientObservationId = randomUUID()
    const stable = samples(Date.now())
    const input = {
      clientObservationId,
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84' as const,
      captureMethod: 'browser-geolocation' as const,
      pointRole: 'main-entrance' as const,
      evidenceNote: 'Captured at the signed entrance for replay validation.',
      samples: stable
    }
    createCoordinateObservation(fixture.client, input)
    const invalidSamples = stable.slice(0, 4)
    fixture.client.sqlite.prepare(`
      UPDATE place_coordinate_observations
      SET sample_count = ?, samples_json = ?
      WHERE client_observation_id = ?
    `).run(invalidSamples.length, JSON.stringify(invalidSamples), clientObservationId)

    assert.throws(
      () => createCoordinateObservation(fixture.client, { ...input, samples: invalidSamples }),
      (error: unknown) => {
        const httpError = error as TestHttpError
        return httpError.statusCode === 422
          && httpError.data?.code === 'BROWSER_GEOLOCATION_SAMPLE_COUNT_INVALID'
      }
    )
  } finally {
    fixture.cleanup()
  }
})

test('client observation IDs make equivalent retries idempotent and reject conflicts', () => {
  const fixture = createFixture()
  try {
    const clientObservationId = randomUUID()
    const input = {
      clientObservationId,
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84' as const,
      captureMethod: 'browser-geolocation' as const,
      pointRole: 'main-entrance' as const,
      evidenceNote: 'Captured at the signed main entrance for idempotency testing.',
      samples: samples(Date.now())
    }

    const created = createCoordinateObservation(fixture.client, input)
    const replayed = createCoordinateObservation(fixture.client, {
      ...input,
      samples: input.samples.map(sample => ({
        ...sample,
        capturedAt: sample.capturedAt.replace('Z', '+00:00')
      }))
    })

    assert.equal(created.created, true)
    assert.equal(replayed.created, false)
    assert.equal(replayed.observation.id, created.observation.id)
    assert.equal(replayed.observation.clientObservationId, clientObservationId)
    assert.equal(fixture.client.sqlite.prepare(`
      SELECT count(*) AS count FROM place_coordinate_observations
      WHERE client_observation_id = ?
    `).get(clientObservationId)?.count, 1)

    assert.throws(
      () => createCoordinateObservation(fixture.client, {
        ...input,
        evidenceNote: 'This payload is intentionally different from the original capture.'
      }),
      (error: unknown) => {
        const httpError = error as TestHttpError
        return httpError.statusCode === 409
          && httpError.data?.code === 'COORDINATE_OBSERVATION_IDEMPOTENCY_CONFLICT'
      }
    )
    assert.equal(fixture.client.sqlite.prepare(`
      SELECT count(*) AS count FROM place_coordinate_observations
    `).get()?.count, 1)
  } finally {
    fixture.cleanup()
  }
})

test('a first approved observation creates only an unverified candidate and clears stale navigation', () => {
  const fixture = createFixture()
  try {
    const { observation } = createCoordinateObservation(fixture.client, {
      clientObservationId: randomUUID(),
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'browser-geolocation',
      pointRole: 'main-entrance',
      evidenceNote: '站在主入口标牌外，保持静止完成采样。',
      samples: samples(Date.now())
    })
    assert.equal(observation.reviewStatus, 'pending')
    assert.equal(observation.sampleCount, 5)
    assert.ok(observation.accuracyMeters <= 7)
    fixture.client.sqlite.prepare(`
      UPDATE places SET external_map_url = 'https://example.test/stale-navigation'
      WHERE id = ?
    `).run(fixture.placeId)

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
        coordinate_verified_at AS coordinateVerifiedAt,
        coordinate_point_role AS coordinatePointRole,
        external_map_url AS externalMapUrl
      FROM places WHERE id = ?
    `).get(fixture.placeId) as Record<string, unknown>
    assert.equal(after.coordinateSystem, 'WGS84')
    assert.equal(after.coordinateVerification, 'unverified')
    assert.equal(after.coordinateVerifiedAt, null)
    assert.equal(after.coordinatePointRole, 'main-entrance')
    assert.equal(after.externalMapUrl, null)
    assert.equal(after.longitude, observation.longitude)
    assert.equal(after.latitude, observation.latitude)
  } finally {
    fixture.cleanup()
  }
})

test('a second same-role observation completes verification only after the independence interval', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    const first = createCoordinateObservation(fixture.client, {
      clientObservationId: randomUUID(),
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'browser-geolocation',
      pointRole: 'main-entrance',
      evidenceNote: 'First independently reviewed main entrance capture.',
      samples: samples(now - MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS - 60_000)
    }).observation
    approveCoordinateObservation(
      fixture.client,
      first.id,
      fixture.adminId,
      'First candidate checked against the signed main entrance.'
    )

    const second = createCoordinateObservation(fixture.client, {
      clientObservationId: randomUUID(),
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'browser-geolocation',
      pointRole: 'main-entrance',
      evidenceNote: 'Second capture from a separate field visit.',
      samples: samples(now)
    }).observation
    approveCoordinateObservation(
      fixture.client,
      second.id,
      fixture.adminId,
      'Second independent capture matches the same entrance.'
    )

    const place = fixture.client.sqlite.prepare(`
      SELECT coordinate_verification AS coordinateVerification,
        coordinate_verified_at AS coordinateVerifiedAt,
        coordinate_point_role AS coordinatePointRole
      FROM places WHERE id = ?
    `).get(fixture.placeId) as Record<string, unknown>
    assert.equal(place.coordinateVerification, 'verified')
    assert.ok(typeof place.coordinateVerifiedAt === 'number')
    assert.equal(place.coordinatePointRole, 'main-entrance')
    assert.equal((fixture.client.sqlite.prepare(`
      SELECT count(*) AS count FROM place_coordinate_observations
      WHERE place_id = ? AND review_status = 'approved'
    `).get(fixture.placeId) as { count: number }).count, 2)
  } finally {
    fixture.cleanup()
  }
})

test('distance and point-role mismatches replace the candidate without verifying the place', () => {
  const scenarios = [
    {
      name: 'distance',
      pointRole: 'main-entrance' as const,
      longitude: 118.605 + (MAX_DUAL_VERIFICATION_DISTANCE_METERS + 15) / 100_000
    },
    {
      name: 'role',
      pointRole: 'site-point' as const,
      longitude: 118.605
    }
  ]

  for (const scenario of scenarios) {
    const fixture = createFixture()
    try {
      const now = Date.now()
      const first = createCoordinateObservation(fixture.client, {
        clientObservationId: randomUUID(),
        placeId: fixture.placeId,
        coordinateSystem: 'WGS84',
        captureMethod: 'browser-geolocation',
        pointRole: 'main-entrance',
        evidenceNote: `Initial candidate for ${scenario.name} mismatch testing.`,
        samples: samples(now - 60_000)
      }).observation
      approveCoordinateObservation(
        fixture.client,
        first.id,
        fixture.adminId,
        'Initial candidate approved after map review.'
      )
      const second = createCoordinateObservation(fixture.client, {
        clientObservationId: randomUUID(),
        placeId: fixture.placeId,
        coordinateSystem: 'WGS84',
        captureMethod: 'authorized-import',
        pointRole: scenario.pointRole,
        evidenceNote: `Independent ${scenario.name} mismatch evidence.`,
        samples: samples(now, 6, scenario.longitude)
      }).observation
      approveCoordinateObservation(
        fixture.client,
        second.id,
        fixture.adminId,
        'The new evidence is valid on its own and becomes the current candidate.'
      )

      const place = fixture.client.sqlite.prepare(`
        SELECT coordinate_verification AS coordinateVerification,
          coordinate_verified_at AS coordinateVerifiedAt,
          coordinate_point_role AS coordinatePointRole
        FROM places WHERE id = ?
      `).get(fixture.placeId)
      assert.deepEqual(place, {
        coordinateVerification: 'unverified',
        coordinateVerifiedAt: null,
        coordinatePointRole: scenario.pointRole
      })
      const evidence = fixture.client.sqlite.prepare(`
        SELECT id, review_status AS reviewStatus,
          superseded_by_observation_id AS supersededByObservationId
        FROM place_coordinate_observations WHERE place_id = ? ORDER BY created_at
      `).all(fixture.placeId) as Array<Record<string, unknown>>
      assert.equal(evidence.find(item => item.id === first.id)?.reviewStatus, 'approved')
      assert.equal(evidence.find(item => item.id === first.id)?.supersededByObservationId, null)
      assert.equal(evidence.find(item => item.id === second.id)?.reviewStatus, 'approved')
    } finally {
      fixture.cleanup()
    }
  }
})

test('same-session duplicates and map-review-only pairs are not independent verification', () => {
  const scenarios = [
    {
      name: 'same session',
      method: 'browser-geolocation' as const,
      firstCapturedAt: Date.now() - MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS + 60_000
    },
    {
      name: 'untrusted methods',
      method: 'map-review' as const,
      firstCapturedAt: Date.now() - MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS - 60_000
    }
  ]

  for (const scenario of scenarios) {
    const fixture = createFixture()
    try {
      const now = Date.now()
      const first = createCoordinateObservation(fixture.client, {
        clientObservationId: randomUUID(),
        placeId: fixture.placeId,
        coordinateSystem: 'WGS84',
        captureMethod: scenario.method,
        pointRole: 'main-entrance',
        evidenceNote: `First ${scenario.name} observation.`,
        samples: samples(scenario.firstCapturedAt)
      }).observation
      approveCoordinateObservation(fixture.client, first.id, fixture.adminId, 'First candidate approved.')
      const second = createCoordinateObservation(fixture.client, {
        clientObservationId: randomUUID(),
        placeId: fixture.placeId,
        coordinateSystem: 'WGS84',
        captureMethod: scenario.method,
        pointRole: 'main-entrance',
        evidenceNote: `Second ${scenario.name} observation.`,
        samples: samples(now)
      }).observation
      approveCoordinateObservation(fixture.client, second.id, fixture.adminId, 'Second candidate approved.')

      const state = fixture.client.sqlite.prepare(`
        SELECT coordinate_verification AS coordinateVerification,
          coordinate_verified_at AS coordinateVerifiedAt
        FROM places WHERE id = ?
      `).get(fixture.placeId)
      assert.deepEqual(state, { coordinateVerification: 'unverified', coordinateVerifiedAt: null })
      assert.equal((fixture.client.sqlite.prepare(`
        SELECT count(*) AS count FROM place_coordinate_observations
        WHERE place_id = ? AND review_status = 'approved'
      `).get(fixture.placeId) as { count: number }).count, 2)
    } finally {
      fixture.cleanup()
    }
  }
})

test('a third compatible approval retains two effective records and preserves replaced review history', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    const observationTimes = [
      now - MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS * 2 - 120_000,
      now - MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS - 60_000,
      now
    ]
    const records = observationTimes.map((capturedAt, index) => createCoordinateObservation(
      fixture.client,
      {
        clientObservationId: randomUUID(),
        placeId: fixture.placeId,
        coordinateSystem: 'WGS84',
        captureMethod: 'browser-geolocation',
        pointRole: 'main-entrance',
        evidenceNote: `Independent entrance evidence ${index + 1}.`,
        samples: samples(capturedAt)
      }
    ).observation)
    const firstReviewNote = 'Original approval evidence must remain in history.'
    approveCoordinateObservation(fixture.client, records[0]!.id, fixture.adminId, firstReviewNote)
    approveCoordinateObservation(fixture.client, records[1]!.id, fixture.adminId, 'Second independent approval.')
    approveCoordinateObservation(fixture.client, records[2]!.id, fixture.adminId, 'Third independent replacement.')

    const evidence = fixture.client.sqlite.prepare(`
      SELECT id, review_status AS reviewStatus, review_note AS reviewNote,
        superseded_by_observation_id AS supersededByObservationId
      FROM place_coordinate_observations WHERE place_id = ?
    `).all(fixture.placeId) as Array<Record<string, unknown>>
    const approved = evidence.filter(item => item.reviewStatus === 'approved')
    assert.deepEqual(new Set(approved.map(item => item.id)), new Set([records[1]!.id, records[2]!.id]))
    const replaced = evidence.find(item => item.id === records[0]!.id)
    assert.equal(replaced?.reviewStatus, 'superseded')
    assert.equal(replaced?.reviewNote, firstReviewNote)
    assert.equal(replaced?.supersededByObservationId, records[2]!.id)
    assert.equal(fixture.client.sqlite.prepare(`
      SELECT coordinate_verification AS value FROM places WHERE id = ?
    `).get(fixture.placeId)?.value, 'verified')
  } finally {
    fixture.cleanup()
  }
})

test('a third observation verifies against the matching branch instead of combining conflicting evidence', () => {
  const scenarios = [
    { name: 'old branch', thirdMethod: 'browser-geolocation' as const, expectedPartner: 'first' as const },
    { name: 'new branch', thirdMethod: 'authorized-import' as const, expectedPartner: 'second' as const }
  ]
  for (const scenario of scenarios) {
    const fixture = createFixture()
    try {
      const now = Date.now()
      const distantLongitude = 118.605 + (MAX_DUAL_VERIFICATION_DISTANCE_METERS + 15) / 100_000
      const first = createCoordinateObservation(fixture.client, {
        clientObservationId: randomUUID(),
        placeId: fixture.placeId,
        coordinateSystem: 'WGS84',
        captureMethod: 'browser-geolocation',
        pointRole: 'main-entrance',
        evidenceNote: `Old branch evidence (${scenario.name}).`,
        samples: samples(now - MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS * 3)
      }).observation
      approveCoordinateObservation(fixture.client, first.id, fixture.adminId, 'Old branch approved.')
      const second = createCoordinateObservation(fixture.client, {
        clientObservationId: randomUUID(),
        placeId: fixture.placeId,
        coordinateSystem: 'WGS84',
        captureMethod: 'authorized-import',
        pointRole: 'main-entrance',
        evidenceNote: `New branch evidence (${scenario.name}).`,
        samples: samples(now - MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS * 2, 6, distantLongitude)
      }).observation
      approveCoordinateObservation(fixture.client, second.id, fixture.adminId, 'New branch approved.')

      const thirdLongitude = scenario.expectedPartner === 'first' ? 118.605 : distantLongitude
      const third = createCoordinateObservation(fixture.client, {
        clientObservationId: randomUUID(),
        placeId: fixture.placeId,
        coordinateSystem: 'WGS84',
        captureMethod: scenario.thirdMethod,
        pointRole: 'main-entrance',
        evidenceNote: `Third branch evidence (${scenario.name}).`,
        samples: samples(now, 6, thirdLongitude)
      }).observation
      approveCoordinateObservation(fixture.client, third.id, fixture.adminId, 'Third evidence selects one compatible branch.')

      const expectedPartnerId = scenario.expectedPartner === 'first' ? first.id : second.id
      const supersededId = scenario.expectedPartner === 'first' ? second.id : first.id
      assert.equal(fixture.client.sqlite.prepare(`
        SELECT coordinate_verification AS value FROM places WHERE id = ?
      `).get(fixture.placeId)?.value, 'verified')
      const active = fixture.client.sqlite.prepare(`
        SELECT id FROM place_coordinate_observations
        WHERE place_id = ? AND review_status = 'approved'
      `).all(fixture.placeId) as Array<{ id: string }>
      assert.deepEqual(new Set(active.map(item => item.id)), new Set([expectedPartnerId, third.id]))
      assert.deepEqual(fixture.client.sqlite.prepare(`
        SELECT review_status AS status, superseded_by_observation_id AS replacement
        FROM place_coordinate_observations WHERE id = ?
      `).get(supersededId), { status: 'superseded', replacement: third.id })
    } finally {
      fixture.cleanup()
    }
  }
})

test('low-accuracy imported observations and manual verification are rejected at approval', () => {
  const fixture = createFixture()
  try {
    const { observation } = createCoordinateObservation(fixture.client, {
      clientObservationId: randomUUID(),
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'authorized-import',
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

test('interleaved approvals recalculate evidence inside the transaction without losing verification', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    const first = createCoordinateObservation(fixture.client, {
      clientObservationId: randomUUID(),
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'browser-geolocation',
      pointRole: 'main-entrance',
      evidenceNote: 'Baseline evidence for interleaved approval testing.',
      samples: samples(now - MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS * 2)
    }).observation
    approveCoordinateObservation(fixture.client, first.id, fixture.adminId, 'Baseline candidate approved.')

    const second = createCoordinateObservation(fixture.client, {
      clientObservationId: randomUUID(),
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'authorized-import',
      pointRole: 'main-entrance',
      evidenceNote: 'Concurrent authorized evidence.',
      samples: samples(now - 30_000)
    }).observation
    const third = createCoordinateObservation(fixture.client, {
      clientObservationId: randomUUID(),
      placeId: fixture.placeId,
      coordinateSystem: 'WGS84',
      captureMethod: 'browser-geolocation',
      pointRole: 'main-entrance',
      evidenceNote: 'Outer field evidence.',
      samples: samples(now)
    }).observation
    const racingClient = clientWithRaceBeforeMethod(fixture.client, 'transaction', () => {
      approveCoordinateObservation(
        fixture.client,
        second.id,
        fixture.adminId,
        'Concurrent approval completed before the outer transaction.'
      )
    })
    approveCoordinateObservation(
      racingClient,
      third.id,
      fixture.adminId,
      'Outer approval must observe the newly committed evidence.'
    )

    assert.equal(fixture.client.sqlite.prepare(`
      SELECT coordinate_verification AS value FROM places WHERE id = ?
    `).get(fixture.placeId)?.value, 'verified')
    const active = fixture.client.sqlite.prepare(`
      SELECT id FROM place_coordinate_observations
      WHERE place_id = ? AND review_status = 'approved'
    `).all(fixture.placeId) as Array<{ id: string }>
    assert.deepEqual(new Set(active.map(item => item.id)), new Set([second.id, third.id]))
  } finally {
    fixture.cleanup()
  }
})

test('approval compare-and-swap cannot overwrite a concurrent rejection', () => {
  const fixture = createFixture()
  try {
    const { observation } = createCoordinateObservation(fixture.client, {
      clientObservationId: randomUUID(),
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
    const { observation } = createCoordinateObservation(fixture.client, {
      clientObservationId: randomUUID(),
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
