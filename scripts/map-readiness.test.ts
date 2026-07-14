import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import {
  inspectMapReadiness,
  runMapReadinessCli,
  type MapReadinessReport
} from './map-readiness'

const NOW = 1_800_000_000_000
const MIGRATIONS_PATH = resolve('server/database/migrations')

interface Fixture {
  directory: string
  databasePath: string
  cleanup: () => void
}

function createMigratedFixture(prefix = 'yeu-map-readiness-'): Fixture {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  const databasePath = join(directory, 'readiness.sqlite')
  const sqlite = new BetterSqlite3(databasePath)
  sqlite.pragma('foreign_keys = ON')
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_PATH })
  sqlite.close()
  return {
    directory,
    databasePath,
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

function insertAdmin(database: InstanceType<typeof BetterSqlite3>): void {
  database.prepare(`
    INSERT INTO admin_users (
      id, username, password_hash, display_name, is_active, created_at, updated_at
    ) VALUES ('map-reviewer', 'map-reviewer', 'fixture-hash', 'Map reviewer', 1, ?, ?)
  `).run(NOW, NOW)
}

function insertSource(database: InstanceType<typeof BetterSqlite3>): void {
  database.prepare(`
    INSERT INTO sources (
      id, title, url, platform, publisher_name, source_level, is_official,
      accessed_at, status, created_at, updated_at
    ) VALUES (
      'official-source', 'Official source', 'https://example.edu/map', 'official-site',
      'Example University', 'A', 1, ?, 'active', ?, ?
    )
  `).run(NOW - 10_000, NOW, NOW)
}

function insertPlace(
  database: InstanceType<typeof BetterSqlite3>,
  options: {
    id: string
    status: 'draft' | 'published' | 'archived'
    longitude?: number | null
    latitude?: number | null
    verification?: 'missing' | 'unverified' | 'verified' | 'rejected'
    pointRole?: 'site-point' | 'main-entrance' | null
    externalMapUrl?: string | null
    verifiedAt?: number | null
    lastVerifiedAt?: number | null
    publishedAt?: number | null
  }
): void {
  database.prepare(`
    INSERT INTO places (
      id, slug, name, summary, body, scope, type, longitude, latitude,
      coordinate_system, coordinate_verification, coordinate_verified_at,
      coordinate_point_role, external_map_url, status, last_verified_at, published_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'Fixture summary', '', 'campus', 'building', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    options.id,
    options.id,
    options.id,
    options.longitude ?? null,
    options.latitude ?? null,
    options.longitude === null || options.longitude === undefined ? null : 'WGS84',
    options.verification ?? 'missing',
    options.verifiedAt ?? null,
    options.pointRole ?? null,
    options.externalMapUrl ?? null,
    options.status,
    options.lastVerifiedAt ?? null,
    options.publishedAt ?? null,
    NOW,
    NOW
  )
}

function linkSource(database: InstanceType<typeof BetterSqlite3>, placeId: string): void {
  database.prepare(`
    INSERT INTO place_sources (place_id, source_id, is_primary, created_at)
    VALUES (?, 'official-source', 1, ?)
  `).run(placeId, NOW)
}

function insertObservation(
  database: InstanceType<typeof BetterSqlite3>,
  options: {
    id: string
    placeId: string
    longitude: number
    latitude: number
    captureMethod: 'browser-geolocation' | 'authorized-import' | 'map-review'
    capturedAt: number
    status: 'pending' | 'approved' | 'rejected' | 'superseded'
    pointRole?: 'site-point' | 'main-entrance'
    accuracyMeters?: number
  }
): void {
  const reviewed = options.status !== 'pending'
  database.prepare(`
    INSERT INTO place_coordinate_observations (
      id, place_id, longitude, latitude, coordinate_system, accuracy_meters,
      sample_count, samples_json, capture_method, point_role, captured_at,
      evidence_note, review_status, reviewed_by, reviewed_at, review_note,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'WGS84', ?, 1, '[]', ?, ?, ?, 'Fixture evidence', ?, ?, ?, ?, ?, ?)
  `).run(
    options.id,
    options.placeId,
    options.longitude,
    options.latitude,
    options.accuracyMeters ?? 4,
    options.captureMethod,
    options.pointRole ?? 'main-entrance',
    options.capturedAt,
    options.status,
    reviewed ? 'map-reviewer' : null,
    reviewed ? NOW - 1_000 : null,
    reviewed ? 'Reviewed fixture evidence' : null,
    NOW,
    NOW
  )
}

function createReadyFixture(): Fixture {
  const fixture = createMigratedFixture()
  const database = new BetterSqlite3(fixture.databasePath)
  try {
    database.pragma('foreign_keys = ON')
    insertAdmin(database)
    insertSource(database)
    insertPlace(database, {
      id: 'ready-place',
      status: 'published',
      longitude: 118.60501,
      latitude: 25.112,
      verification: 'verified',
      pointRole: 'main-entrance',
      externalMapUrl: 'https://example.edu/navigation/ready-place',
      verifiedAt: NOW - 2_000,
      lastVerifiedAt: NOW - 2_000,
      publishedAt: NOW - 1_000
    })
    insertPlace(database, { id: 'archived-place', status: 'archived' })
    linkSource(database, 'ready-place')
    insertObservation(database, {
      id: 'ready-observation-a',
      placeId: 'ready-place',
      longitude: 118.605,
      latitude: 25.112,
      captureMethod: 'browser-geolocation',
      capturedAt: NOW - 10_000,
      status: 'approved'
    })
    insertObservation(database, {
      id: 'ready-observation-b',
      placeId: 'ready-place',
      longitude: 118.60501,
      latitude: 25.112,
      captureMethod: 'map-review',
      capturedAt: NOW - 5_000,
      status: 'approved'
    })
    insertObservation(database, {
      id: 'pending-observation',
      placeId: 'archived-place',
      longitude: 118.605,
      latitude: 25.112,
      captureMethod: 'browser-geolocation',
      capturedAt: NOW - 4_000,
      status: 'pending'
    })
    insertObservation(database, {
      id: 'rejected-observation',
      placeId: 'archived-place',
      longitude: 118.605,
      latitude: 25.112,
      captureMethod: 'browser-geolocation',
      capturedAt: NOW - 3_000,
      status: 'rejected'
    })
    insertObservation(database, {
      id: 'superseded-observation',
      placeId: 'archived-place',
      longitude: 118.605,
      latitude: 25.112,
      captureMethod: 'authorized-import',
      capturedAt: NOW - 2_000,
      status: 'superseded'
    })
  } finally {
    database.close()
  }
  return fixture
}

function blockerCodes(report: MapReadinessReport): string[] {
  return report.releaseReadiness.blockers.map(item => item.code)
}

function fileHash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

test('authoritative report covers place, observation, source, role, navigation and dual evidence states', () => {
  const fixture = createReadyFixture()
  try {
    const before = fileHash(fixture.databasePath)
    const report = inspectMapReadiness({ databasePath: fixture.databasePath, now: NOW })
    assert.equal(fileHash(fixture.databasePath), before)

    assert.deepEqual(report.schemaCapabilities, {
      coordinateVerification: true,
      coordinatePointRole: true,
      coordinateObservations: true,
      dualVerificationEvidence: true
    })
    assert.equal(report.places.total, 2)
    assert.equal(report.places.releaseScopeTotal, 1)
    assert.deepEqual(report.places.byScope, { campus: 2, nearby: 0, other: 0 })
    assert.deepEqual(report.places.byStatus, { draft: 0, published: 1, archived: 1, other: 0 })
    assert.deepEqual(report.places.byCoordinateState, {
      missing: 1,
      unverified: 0,
      verified: 1,
      rejected: 0,
      other: 0
    })
    assert.deepEqual(report.places.coordinateStorage, { empty: 1, complete: 1, partial: 0 })
    assert.equal(report.places.releaseReadyCoordinates, 1)

    assert.equal(report.observations.total, 5)
    assert.deepEqual(report.observations.byReviewStatus, {
      pending: 1,
      approved: 2,
      rejected: 1,
      superseded: 1,
      other: 0
    })
    assert.equal(report.observations.placesWithAnyObservation, 2)
    assert.equal(report.observations.releaseScopeWithoutObservation, 0)

    assert.equal(report.formalSourceCoverage.totalSources, 1)
    assert.equal(report.formalSourceCoverage.placeSourceLinks, 1)
    assert.deepEqual(report.formalSourceCoverage.allPlaces, {
      totalPlaces: 2,
      withAnyLinkedSource: 1,
      withActiveSource: 1,
      withActiveOfficialSource: 1,
      withPublishableSource: 1,
      withoutPublishableSource: 1
    })
    assert.equal(report.formalSourceCoverage.releaseScope.withPublishableSource, 1)
    assert.equal(report.publicNavigationPoints.total, 1)
    assert.deepEqual(report.publicNavigationPoints.byScope, { campus: 1, nearby: 0, other: 0 })

    assert.equal(report.coordinatePointRoles.assigned, 1)
    assert.equal(report.coordinatePointRoles.missing, 1)
    assert.deepEqual(report.coordinatePointRoles.byRole, {
      'site-point': 0,
      'main-entrance': 1,
      'other': 0
    })
    assert.equal(report.coordinatePointRoles.releaseScopeMissing, 0)

    assert.equal(report.dualVerificationEvidence.eligiblePairCount, 1)
    assert.equal(report.dualVerificationEvidence.placesWithEligiblePair, 1)
    assert.equal(report.dualVerificationEvidence.verifiedPlacesWithEligiblePair, 1)
    assert.equal(report.dualVerificationEvidence.verifiedPlacesWithCurrentCoordinatePair, 1)
    assert.equal(report.dualVerificationEvidence.verifiedPlacesWithoutCurrentCoordinatePair, 0)
    assert.equal(report.dualVerificationEvidence.releaseScopeWithoutCurrentCoordinatePair, 0)
    assert.equal(report.releaseReadiness.ready, true)
    assert.equal(report.releaseReadiness.blockerCount, 0)
  } finally {
    fixture.cleanup()
  }
})

test('default CLI only reports blockers while explicit release enforcement returns one', () => {
  const fixture = createMigratedFixture()
  const database = new BetterSqlite3(fixture.databasePath)
  try {
    insertPlace(database, { id: 'draft-place', status: 'draft' })
  } finally {
    database.close()
  }

  try {
    const defaultStdout: string[] = []
    const defaultStderr: string[] = []
    const defaultExit = runMapReadinessCli([
      '--database', fixture.databasePath
    ], {
      stdout: value => defaultStdout.push(value),
      stderr: value => defaultStderr.push(value)
    })
    assert.equal(defaultExit, 0)
    assert.deepEqual(defaultStderr, [])
    const defaultReport = JSON.parse(defaultStdout.join('')) as MapReadinessReport
    assert.equal(defaultReport.releaseReadiness.enforced, false)
    assert.equal(defaultReport.releaseReadiness.ready, false)
    assert.ok(blockerCodes(defaultReport).includes('RELEASE_SCOPE_PLACES_NOT_PUBLISHED'))

    const strictStdout: string[] = []
    const strictExit = runMapReadinessCli([
      `--database=${fixture.databasePath}`,
      '--require-release-ready'
    ], {
      stdout: value => strictStdout.push(value),
      stderr: () => undefined
    })
    assert.equal(strictExit, 1)
    const strictReport = JSON.parse(strictStdout.join('')) as MapReadinessReport
    assert.equal(strictReport.releaseReadiness.enforced, true)
    assert.equal(strictReport.releaseReadiness.ready, false)
  } finally {
    fixture.cleanup()
  }
})

test('verified coordinates without a valid external URL are not release-ready navigation points', () => {
  for (const externalMapUrl of [null, 'javascript:alert(1)', 'https://user:pass@example.edu/map']) {
    const fixture = createReadyFixture()
    const database = new BetterSqlite3(fixture.databasePath)
    try {
      database.prepare(`
        UPDATE places SET external_map_url = ? WHERE id = 'ready-place'
      `).run(externalMapUrl)
    } finally {
      database.close()
    }

    try {
      const report = inspectMapReadiness({ databasePath: fixture.databasePath, now: NOW })
      assert.equal(report.places.releaseReadyCoordinates, 0)
      assert.equal(report.publicNavigationPoints.total, 0)
      assert.ok(blockerCodes(report).includes(
        'RELEASE_SCOPE_PLACES_WITHOUT_VALID_EXTERNAL_NAVIGATION_URL'
      ))
      assert.equal(report.releaseReadiness.ready, false)
    } finally {
      fixture.cleanup()
    }
  }
})

test('public navigation and release-ready counts require every coordinate eligibility field', () => {
  const scenarios = [
    { name: 'published status', sql: 'UPDATE places SET status = \'draft\' WHERE id = \'ready-place\'' },
    { name: 'verified state', sql: 'UPDATE places SET coordinate_verification = \'unverified\' WHERE id = \'ready-place\'' },
    { name: 'WGS84 CRS', sql: 'UPDATE places SET coordinate_system = \'GCJ-02\' WHERE id = \'ready-place\'' },
    { name: 'point role', sql: 'UPDATE places SET coordinate_point_role = NULL WHERE id = \'ready-place\'' },
    { name: 'external map URL', sql: 'UPDATE places SET external_map_url = NULL WHERE id = \'ready-place\'' }
  ]

  for (const scenario of scenarios) {
    const fixture = createReadyFixture()
    const database = new BetterSqlite3(fixture.databasePath)
    try {
      database.exec(scenario.sql)
    } finally {
      database.close()
    }

    try {
      const report = inspectMapReadiness({ databasePath: fixture.databasePath, now: NOW })
      assert.equal(report.places.releaseReadyCoordinates, 0, scenario.name)
      assert.equal(report.publicNavigationPoints.total, 0, scenario.name)
      assert.equal(report.releaseReadiness.ready, false, scenario.name)
    } finally {
      fixture.cleanup()
    }
  }
})

test('an eligible historical pair does not verify a different current coordinate', () => {
  const fixture = createMigratedFixture()
  const database = new BetterSqlite3(fixture.databasePath)
  try {
    database.pragma('foreign_keys = ON')
    insertAdmin(database)
    insertSource(database)
    insertPlace(database, {
      id: 'stale-evidence-place',
      status: 'published',
      longitude: 118.606,
      latitude: 25.112,
      verification: 'verified',
      pointRole: 'main-entrance',
      verifiedAt: NOW - 2_000,
      lastVerifiedAt: NOW - 2_000,
      publishedAt: NOW - 1_000
    })
    linkSource(database, 'stale-evidence-place')
    insertObservation(database, {
      id: 'historical-a',
      placeId: 'stale-evidence-place',
      longitude: 118.605,
      latitude: 25.112,
      captureMethod: 'browser-geolocation',
      capturedAt: NOW - 10_000,
      status: 'approved'
    })
    insertObservation(database, {
      id: 'historical-b',
      placeId: 'stale-evidence-place',
      longitude: 118.60501,
      latitude: 25.112,
      captureMethod: 'authorized-import',
      capturedAt: NOW - 5_000,
      status: 'approved'
    })
  } finally {
    database.close()
  }

  try {
    const report = inspectMapReadiness({ databasePath: fixture.databasePath, now: NOW })
    assert.equal(report.dualVerificationEvidence.placesWithEligiblePair, 1)
    assert.equal(report.dualVerificationEvidence.verifiedPlacesWithCurrentCoordinatePair, 0)
    assert.ok(blockerCodes(report).includes(
      'RELEASE_SCOPE_PLACES_WITHOUT_CURRENT_DUAL_VERIFICATION_EVIDENCE'
    ))
  } finally {
    fixture.cleanup()
  }
})

test('legacy schema capability gaps are reported instead of treated as verified evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-map-readiness-legacy-'))
  const databasePath = join(directory, 'legacy.sqlite')
  const database = new BetterSqlite3(databasePath)
  try {
    database.exec(`
      CREATE TABLE places (
        id TEXT PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL,
        scope TEXT NOT NULL, status TEXT NOT NULL,
        longitude REAL, latitude REAL, coordinate_system TEXT,
        last_verified_at INTEGER, published_at INTEGER
      );
      CREATE TABLE sources (
        id TEXT PRIMARY KEY, status TEXT NOT NULL, source_level TEXT NOT NULL,
        is_official INTEGER NOT NULL
      );
      CREATE TABLE place_sources (place_id TEXT NOT NULL, source_id TEXT NOT NULL);
      INSERT INTO places VALUES (
        'legacy-place', 'legacy-place', 'Legacy place', 'campus', 'published',
        118.605, 25.112, 'WGS84', ${NOW - 2_000}, ${NOW - 1_000}
      );
      INSERT INTO sources VALUES ('legacy-source', 'active', 'A', 1);
      INSERT INTO place_sources VALUES ('legacy-place', 'legacy-source');
    `)
  } finally {
    database.close()
  }

  try {
    const report = inspectMapReadiness({ databasePath, now: NOW })
    assert.deepEqual(report.schemaCapabilities, {
      coordinateVerification: false,
      coordinatePointRole: false,
      coordinateObservations: false,
      dualVerificationEvidence: false
    })
    assert.equal(report.observations.total, null)
    assert.equal(report.coordinatePointRoles.assigned, null)
    assert.equal(report.dualVerificationEvidence.eligiblePairCount, null)
    assert.equal(report.publicNavigationPoints.total, 0)
    assert.ok(blockerCodes(report).includes('COORDINATE_VERIFICATION_SCHEMA_UNAVAILABLE'))
    assert.ok(blockerCodes(report).includes('COORDINATE_POINT_ROLE_SCHEMA_UNAVAILABLE'))
    assert.ok(blockerCodes(report).includes('DUAL_VERIFICATION_EVIDENCE_SCHEMA_UNAVAILABLE'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('missing databases and invalid arguments fail without creating files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-map-readiness-missing-'))
  const databasePath = join(directory, 'missing.sqlite')
  try {
    const errors: string[] = []
    assert.equal(runMapReadinessCli(['--database', databasePath], {
      stdout: () => undefined,
      stderr: value => errors.push(value)
    }), 2)
    assert.equal(existsSync(databasePath), false)
    assert.match(errors.join(''), /Target database does not exist/)

    assert.equal(runMapReadinessCli(['--unknown'], {
      stdout: () => undefined,
      stderr: value => errors.push(value)
    }), 2)
    assert.match(errors.join(''), /Unknown argument/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
