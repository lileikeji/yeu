import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  AmapCoordinateImportError,
  importAmapCoordinates,
  type ReviewedCoordinate,
  runCoordinateCli
} from './import-amap-coordinates'
import { importAmapDrafts } from './import-amap-drafts'

const RAW_PATH = resolve('data/imports/amap-workmap-2026-07-13.raw.json')
const TEMPLATE_PATH = resolve('data/imports/amap-workmap-2026-07-13.coordinates.template.json')
const NOW = Date.parse('2026-07-13T12:00:00+08:00')

interface CoordinateTemplateItem {
  sourceRow: number
  name: string
  locationCode: string
  lng: null
  lat: null
  crs: 'GCJ-02'
  pointRole: null
  accuracyMeters: null
  coordinateSource: null
  coordinateSourceUrl: null
  verificationStatus: 'pending-authorized-coordinate-export'
  verifiedAt: null
  verifierCategory: null
}

const template = JSON.parse(readFileSync(TEMPLATE_PATH, 'utf8')) as CoordinateTemplateItem[]

interface Fixture {
  directory: string
  databasePath: string
  writeInput: (items: unknown[], name?: string) => string
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-amap-coordinates-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  closeDatabase(databasePath)
  const drafts = importAmapDrafts({
    apply: true,
    databasePath,
    inputPath: RAW_PATH,
    now: NOW - 10_000
  })
  assert.equal(drafts.created, 76)
  return {
    directory,
    databasePath,
    writeInput(items: unknown[], name = 'reviewed.json') {
      const path = join(directory, name)
      writeFileSync(path, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
      return path
    },
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

function reviewed(sourceRow: number, lng: number, lat: number): ReviewedCoordinate {
  const base = template.find(item => item.sourceRow === sourceRow)
  assert(base)
  return {
    sourceRow: base.sourceRow,
    name: base.name,
    locationCode: base.locationCode,
    lng,
    lat,
    crs: 'WGS84',
    pointRole: sourceRow === 4 ? 'main-entrance' : 'site-point',
    accuracyMeters: 8,
    coordinateSource: 'Synthetic test evidence; never use this fixture as production map data.',
    coordinateSourceUrl: 'https://example.invalid/coordinate-review',
    verificationStatus: 'human-verified',
    verifiedAt: '2026-07-13T08:00:00+08:00',
    verifierCategory: 'student-team'
  }
}

function getPlace(database: BetterSqlite3.Database, name: string): Record<string, unknown> {
  return database.prepare('SELECT * FROM places WHERE name = ?').get(name) as Record<string, unknown>
}

function getObservation(database: BetterSqlite3.Database, placeId: string): Record<string, unknown> {
  return database.prepare(`
    SELECT id, client_observation_id AS clientObservationId, place_id AS placeId,
           longitude, latitude, coordinate_system AS coordinateSystem,
           accuracy_meters AS accuracyMeters, sample_count AS sampleCount,
           samples_json AS samplesJson, capture_method AS captureMethod,
           point_role AS pointRole, captured_at AS capturedAt,
           evidence_note AS evidenceNote, review_status AS reviewStatus,
           reviewed_by AS reviewedBy, reviewed_at AS reviewedAt,
           review_note AS reviewNote, created_at AS createdAt, updated_at AS updatedAt
    FROM place_coordinate_observations WHERE place_id = ?
  `).get(placeId) as Record<string, unknown>
}

test('dry-run is byte-for-byte read-only and apply creates only one pending authorized-import observation', () => {
  const fixture = createFixture()
  try {
    const coordinate = reviewed(2, 118.606, 25.115)
    const inputPath = fixture.writeInput([coordinate])
    const beforeBytes = readFileSync(fixture.databasePath)
    const preview = importAmapCoordinates({ databasePath: fixture.databasePath, inputPath, now: NOW })
    assert.deepEqual(
      {
        mode: preview.mode,
        coordinateCount: preview.coordinateCount,
        created: preview.created,
        wouldCreate: preview.wouldCreate,
        skipped: preview.skipped,
        conflicts: preview.conflicts,
        applied: preview.applied
      },
      { mode: 'dry-run', coordinateCount: 1, created: 0, wouldCreate: 1, skipped: 0, conflicts: 0, applied: false }
    )
    assert.deepEqual(readFileSync(fixture.databasePath), beforeBytes)

    const databaseBefore = new BetterSqlite3(fixture.databasePath, { readonly: true })
    const placeBefore = getPlace(databaseBefore, coordinate.name)
    databaseBefore.close()
    const applied = importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW })
    assert.deepEqual(
      {
        created: applied.created,
        wouldCreate: applied.wouldCreate,
        skipped: applied.skipped,
        conflicts: applied.conflicts,
        applied: applied.applied
      },
      { created: 1, wouldCreate: 1, skipped: 0, conflicts: 0, applied: true }
    )

    const database = new BetterSqlite3(fixture.databasePath, { readonly: true })
    const placeAfter = getPlace(database, coordinate.name)
    assert.deepEqual(placeAfter, placeBefore, 'the importer must not mutate any places column')
    const observation = getObservation(database, String(placeAfter.id))
    assert.match(String(observation.id), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.match(String(observation.clientObservationId), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.deepEqual(
      {
        longitude: observation.longitude,
        latitude: observation.latitude,
        coordinateSystem: observation.coordinateSystem,
        accuracyMeters: observation.accuracyMeters,
        sampleCount: observation.sampleCount,
        captureMethod: observation.captureMethod,
        pointRole: observation.pointRole,
        capturedAt: observation.capturedAt,
        reviewStatus: observation.reviewStatus,
        reviewedBy: observation.reviewedBy,
        reviewedAt: observation.reviewedAt,
        reviewNote: observation.reviewNote,
        createdAt: observation.createdAt,
        updatedAt: observation.updatedAt
      },
      {
        longitude: coordinate.lng,
        latitude: coordinate.lat,
        coordinateSystem: 'WGS84',
        accuracyMeters: coordinate.accuracyMeters,
        sampleCount: 1,
        captureMethod: 'authorized-import',
        pointRole: coordinate.pointRole,
        capturedAt: Date.parse(coordinate.verifiedAt),
        reviewStatus: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: NOW,
        updatedAt: NOW
      }
    )
    assert.deepEqual(JSON.parse(String(observation.samplesJson)), [{
      longitude: coordinate.lng,
      latitude: coordinate.lat,
      accuracyMeters: coordinate.accuracyMeters,
      capturedAt: '2026-07-13T00:00:00.000Z'
    }])
    const evidence = JSON.parse(String(observation.evidenceNote)) as Record<string, unknown>
    assert.deepEqual(evidence, {
      importer: 'amap-coordinate-observation-v1',
      schemaVersion: 1,
      coordinateSource: coordinate.coordinateSource,
      coordinateSourceUrl: coordinate.coordinateSourceUrl,
      inputVerificationStatus: coordinate.verificationStatus,
      inputVerifiedAt: '2026-07-13T00:00:00.000Z',
      inputVerifierCategory: coordinate.verifierCategory,
      sourceRawRef: placeBefore.source_raw_ref,
      inputSha256: evidence.inputSha256
    })
    assert.match(String(evidence.inputSha256), /^[a-f0-9]{64}$/)
    assert.equal((database.prepare('SELECT count(*) AS count FROM place_coordinate_observations').get() as { count: number }).count, 1)
    assert.equal((database.prepare(`SELECT count(*) AS count FROM places WHERE coordinate_verification = 'verified'`).get() as { count: number }).count, 0)
    database.close()
  } finally {
    fixture.cleanup()
  }
})

test('deterministic identity makes exact reruns idempotent even after review, without duplicates', () => {
  const fixture = createFixture()
  const secondFixture = createFixture()
  try {
    const coordinate = reviewed(2, 118.606, 25.115)
    const inputPath = fixture.writeInput([coordinate])
    const secondInputPath = secondFixture.writeInput([coordinate])
    assert.equal(importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW }).created, 1)
    assert.equal(importAmapCoordinates({ apply: true, databasePath: secondFixture.databasePath, inputPath: secondInputPath, now: NOW + 500 }).created, 1)

    const firstDatabase = new BetterSqlite3(fixture.databasePath)
    const firstIdentity = firstDatabase.prepare('SELECT id, client_observation_id AS clientId FROM place_coordinate_observations').get() as { id: string, clientId: string }
    const secondDatabase = new BetterSqlite3(secondFixture.databasePath, { readonly: true })
    const secondIdentity = secondDatabase.prepare('SELECT id, client_observation_id AS clientId FROM place_coordinate_observations').get() as { id: string, clientId: string }
    secondDatabase.close()
    assert.deepEqual(secondIdentity, firstIdentity)

    firstDatabase.prepare(`
      UPDATE place_coordinate_observations
      SET review_status = 'rejected', reviewed_at = ?, review_note = ?, updated_at = ?
      WHERE id = ?
    `).run(NOW + 100, 'Rejected by deterministic rerun test.', NOW + 100, firstIdentity.id)
    firstDatabase.close()

    const rerun = importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW + 1_000 })
    assert.deepEqual(
      { created: rerun.created, wouldCreate: rerun.wouldCreate, skipped: rerun.skipped, conflicts: rerun.conflicts, applied: rerun.applied },
      { created: 0, wouldCreate: 0, skipped: 1, conflicts: 0, applied: true }
    )
    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal((checked.prepare('SELECT count(*) AS count FROM place_coordinate_observations').get() as { count: number }).count, 1)
    assert.equal((checked.prepare('SELECT review_status AS status FROM place_coordinate_observations').get() as { status: string }).status, 'rejected')
    checked.close()
  } finally {
    fixture.cleanup()
    secondFixture.cleanup()
  }
})

test('a changed payload conflicts on the stable identity and prevents the whole batch from writing', () => {
  const fixture = createFixture()
  try {
    const first = reviewed(2, 118.606, 25.115)
    const second = reviewed(3, 118.609, 25.114)
    assert.equal(importAmapCoordinates({
      apply: true,
      databasePath: fixture.databasePath,
      inputPath: fixture.writeInput([first], 'first.json'),
      now: NOW
    }).created, 1)

    const changedFirst = { ...first, lng: first.lng + 0.00001 }
    const result = importAmapCoordinates({
      apply: true,
      databasePath: fixture.databasePath,
      inputPath: fixture.writeInput([changedFirst, second], 'conflict.json'),
      now: NOW + 1_000
    })
    assert.deepEqual(
      { created: result.created, wouldCreate: result.wouldCreate, conflicts: result.conflicts, applied: result.applied },
      { created: 0, wouldCreate: 1, conflicts: 1, applied: false }
    )
    assert.match(result.conflictDetails[0]!.reason, /deterministic import identity already exists with a different/)
    const database = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal((database.prepare('SELECT count(*) AS count FROM place_coordinate_observations').get() as { count: number }).count, 1)
    assert.equal((database.prepare(`
      SELECT count(*) AS count FROM place_coordinate_observations o
      JOIN places p ON p.id = o.place_id WHERE p.name = ?
    `).get(second.name) as { count: number }).count, 0)
    database.close()
  } finally {
    fixture.cleanup()
  }
})

test('a target identity or source_raw_ref conflict rolls back otherwise valid observations', () => {
  const fixture = createFixture()
  try {
    const first = reviewed(2, 118.606, 25.115)
    const second = reviewed(3, 118.609, 25.114)
    const database = new BetterSqlite3(fixture.databasePath)
    const secondPlace = getPlace(database, second.name)
    const reference = JSON.parse(String(secondPlace.source_raw_ref)) as Record<string, unknown>
    reference.unreviewedField = true
    const drifted = JSON.stringify(reference)
    database.prepare('UPDATE places SET source_raw_ref = ? WHERE id = ?').run(drifted, secondPlace.id)
    database.close()

    const result = importAmapCoordinates({
      apply: true,
      databasePath: fixture.databasePath,
      inputPath: fixture.writeInput([first, second]),
      now: NOW
    })
    assert.equal(result.applied, false)
    assert.equal(result.created, 0)
    assert.equal(result.wouldCreate, 0)
    assert.equal(result.conflicts, 1)
    assert.match(result.conflictDetails[0]!.reason, /malformed source_raw_ref/)
    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal((checked.prepare('SELECT count(*) AS count FROM place_coordinate_observations').get() as { count: number }).count, 0)
    assert.equal((checked.prepare('SELECT source_raw_ref AS ref FROM places WHERE id = ?').get(secondPlace.id) as { ref: string }).ref, drifted)
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('published coordinates and coordinate point role remain byte-for-byte unchanged', () => {
  const fixture = createFixture()
  try {
    const coordinate = reviewed(4, 118.6065, 25.1155)
    const database = new BetterSqlite3(fixture.databasePath)
    const hasCoordinatePointRole = (database.prepare(`PRAGMA table_info('places')`).all() as Array<{ name: string }>)
      .some(column => column.name === 'coordinate_point_role')
    database.prepare(`
      UPDATE places
      SET longitude = ?, latitude = ?, coordinate_system = 'WGS84',
          coordinate_verification = 'verified', coordinate_verified_at = ?,
          ${hasCoordinatePointRole ? 'coordinate_point_role = \'main-entrance\',' : ''}
          status = 'published', published_at = ?
      WHERE name = ?
    `).run(118.607, 25.116, NOW - 5_000, NOW - 5_000, coordinate.name)
    const before = getPlace(database, coordinate.name)
    database.close()

    const result = importAmapCoordinates({
      apply: true,
      databasePath: fixture.databasePath,
      inputPath: fixture.writeInput([coordinate]),
      now: NOW
    })
    assert.equal(result.created, 1)
    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.deepEqual(getPlace(checked, coordinate.name), before)
    const observation = getObservation(checked, String(before.id))
    assert.equal(observation.reviewStatus, 'pending')
    assert.equal(observation.captureMethod, 'authorized-import')
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('rejects non-WGS84 input instead of converting or relabelling it', () => {
  const fixture = createFixture()
  try {
    for (const crs of ['GCJ-02', 'BD-09'] as const) {
      const input = { ...reviewed(2, 118.606, 25.115), crs }
      assert.throws(
        () => importAmapCoordinates({ databasePath: fixture.databasePath, inputPath: fixture.writeInput([input], `${crs}.json`), now: NOW }),
        (error: unknown) => error instanceof AmapCoordinateImportError
          && error.message.includes(`${crs} input is not accepted`)
          && error.message.includes('re-verify the WGS84 result')
      )
    }
  } finally {
    fixture.cleanup()
  }
})

test('requires a role, approvable accuracy, evidence, valid time, tight bounds, and unique identities', () => {
  const fixture = createFixture()
  try {
    const base = reviewed(2, 118.606, 25.115)
    const { pointRole: _pointRole, ...missingPointRole } = base
    const cases: Array<{ name: string, items: unknown[], pattern: RegExp }> = [
      { name: 'missing-role', items: [missingPointRole], pattern: /fields changed.*pointRole/ },
      { name: 'invalid-role', items: [{ ...base, pointRole: 'centroid' }], pattern: /pointRole must be one of/ },
      { name: 'zero-accuracy', items: [{ ...base, accuracyMeters: 0 }], pattern: /accuracyMeters must be greater than 0/ },
      { name: 'low-accuracy', items: [{ ...base, accuracyMeters: 26 }], pattern: /at most 25/ },
      { name: 'outside-bounds', items: [{ ...base, lng: 118.62 }], pattern: /outside the campus validation bounds/ },
      { name: 'future', items: [{ ...base, verifiedAt: '2026-07-14T08:00:00+08:00' }], pattern: /cannot be in the future/ },
      { name: 'blank-evidence', items: [{ ...base, coordinateSource: ' ' }], pattern: /evidence description/ },
      { name: 'credential-url', items: [{ ...base, coordinateSourceUrl: 'https://user:secret@example.invalid/evidence' }], pattern: /must not contain credentials/ },
      {
        name: 'oversized-audit-envelope',
        items: [{
          ...base,
          coordinateSource: 'x'.repeat(1_000),
          coordinateSourceUrl: `https://example.invalid/${'a'.repeat(1_900)}`
        }],
        pattern: /serialized evidence exceeds 2000 characters/
      },
      { name: 'person-name-category', items: [{ ...base, verifierCategory: 'Zhang San' }], pattern: /do not put a person's name here/ },
      { name: 'duplicate-row', items: [base, { ...base, lng: 118.6061, lat: 25.1151 }], pattern: /duplicate sourceRow/ },
      { name: 'duplicate-point', items: [base, reviewed(3, base.lng, base.lat)], pattern: /duplicate coordinate/ }
    ]
    for (const item of cases) {
      assert.throws(
        () => importAmapCoordinates({ databasePath: fixture.databasePath, inputPath: fixture.writeInput(item.items, `${item.name}.json`), now: NOW }),
        item.pattern,
        item.name
      )
    }
  } finally {
    fixture.cleanup()
  }
})

test('refuses a database without the unique observation idempotency index', () => {
  const fixture = createFixture()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    database.exec('DROP INDEX coordinate_observations_client_id_unique')
    database.close()
    assert.throws(
      () => importAmapCoordinates({
        databasePath: fixture.databasePath,
        inputPath: fixture.writeInput([reviewed(2, 118.606, 25.115)]),
        now: NOW
      }),
      /missing the unique coordinate observation idempotency index/
    )
  } finally {
    fixture.cleanup()
  }
})

test('strictly binds input and the committed template to all 76 sourceRow/name/WIA identities', () => {
  const fixture = createFixture()
  try {
    const changedName = { ...reviewed(2, 118.606, 25.115), name: 'Unreviewed renamed place' }
    const changedWia = { ...reviewed(2, 118.606, 25.115), locationCode: 'WIA-999.999,888.888' }
    assert.throws(
      () => importAmapCoordinates({ databasePath: fixture.databasePath, inputPath: fixture.writeInput([changedName], 'name.json'), now: NOW }),
      /name does not match source row/
    )
    assert.throws(
      () => importAmapCoordinates({ databasePath: fixture.databasePath, inputPath: fixture.writeInput([changedWia], 'wia.json'), now: NOW }),
      /WIA locationCode does not match source row/
    )

    const changedTemplate = structuredClone(template)
    changedTemplate[0]!.pointRole = 'site-point' as never
    const changedTemplatePath = fixture.writeInput(changedTemplate, 'template.json')
    assert.throws(
      () => importAmapCoordinates({
        databasePath: fixture.databasePath,
        inputPath: fixture.writeInput([reviewed(2, 118.606, 25.115)]),
        templatePath: changedTemplatePath,
        now: NOW
      }),
      /committed template pointRole must remain null/
    )
  } finally {
    fixture.cleanup()
  }
})

test('CLI defaults to preview and reports observation conflicts without writes', () => {
  const fixture = createFixture()
  try {
    let stdout = ''
    let stderr = ''
    assert.equal(runCoordinateCli([], {
      stdout: (value) => { stdout += value },
      stderr: (value) => { stderr += value }
    }), 2)
    assert.equal(stdout, '')
    assert.match(stderr, /--input PATH is required/)

    const coordinate = reviewed(2, 118.606, 25.115)
    const inputPath = fixture.writeInput([coordinate])
    stdout = ''
    stderr = ''
    assert.equal(runCoordinateCli(['--database', fixture.databasePath, '--input', inputPath], {
      stdout: (value) => { stdout += value },
      stderr: (value) => { stderr += value }
    }), 0)
    assert.equal(stderr, '')
    const preview = JSON.parse(stdout) as { mode: string, wouldCreate: number }
    assert.equal(preview.mode, 'dry-run')
    assert.equal(preview.wouldCreate, 1)

    assert.equal(importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW }).created, 1)
    stdout = ''
    const changedPath = fixture.writeInput([{ ...coordinate, accuracyMeters: 9 }], 'changed.json')
    assert.equal(runCoordinateCli(['--apply', '--database', fixture.databasePath, '--input', changedPath], {
      stdout: (value) => { stdout += value },
      stderr: (value) => { stderr += value }
    }), 1)
    const conflict = JSON.parse(stdout) as { applied: boolean, created: number, conflicts: number }
    assert.deepEqual(
      { applied: conflict.applied, created: conflict.created, conflicts: conflict.conflicts },
      { applied: false, created: 0, conflicts: 1 }
    )
  } finally {
    fixture.cleanup()
  }
})
