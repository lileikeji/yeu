import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { amapImportedPlaces } from '../data/seeds/amap-imported-places'
import { importAmapDrafts } from './import-amap-drafts'
import {
  runCli,
  syncAmapOwnerCoordinates,
  type SyncOwnerCoordinateResult
} from './sync-amap-owner-coordinates'

const RAW_PATH = resolve('data/imports/amap-workmap-2026-07-13.raw.json')
const COORDINATE_PATH = resolve('data/imports/amap-workmap-2026-07-13.coordinates.owner-map.json')
const NOW = Date.parse('2026-07-15T09:00:00+08:00')

interface Fixture {
  directory: string
  databasePath: string
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-amap-owner-sync-'))
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
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

function placeByName(databasePath: string, name: string): Record<string, unknown> {
  const database = new BetterSqlite3(databasePath, { readonly: true })
  try {
    return database.prepare(`
      SELECT name, summary, body, longitude, latitude,
             coordinate_system AS coordinateSystem,
             coordinate_verification AS coordinateVerification,
             coordinate_verified_at AS coordinateVerifiedAt,
             status, external_map_url AS externalMapUrl
      FROM places WHERE name = ?
    `).get(name) as Record<string, unknown>
  } finally {
    database.close()
  }
}

test('owner coordinate sync updates all AMap drafts as unverified GCJ-02 without publishing', () => {
  const fixture = createFixture()
  try {
    const beforeBytes = readFileSync(fixture.databasePath)
    const preview = syncAmapOwnerCoordinates({
      databasePath: fixture.databasePath,
      coordinatePath: COORDINATE_PATH,
      rawPath: RAW_PATH,
      now: NOW
    })
    assert.deepEqual(
      {
        updated: preview.updated,
        wouldUpdate: preview.wouldUpdate,
        skipped: preview.skipped,
        conflicts: preview.conflicts,
        applied: preview.applied
      },
      { updated: 0, wouldUpdate: 76, skipped: 0, conflicts: 0, applied: false }
    )
    assert.deepEqual(readFileSync(fixture.databasePath), beforeBytes)

    const applied = syncAmapOwnerCoordinates({
      apply: true,
      databasePath: fixture.databasePath,
      coordinatePath: COORDINATE_PATH,
      rawPath: RAW_PATH,
      now: NOW
    })
    assert.deepEqual(
      {
        updated: applied.updated,
        wouldUpdate: applied.wouldUpdate,
        skipped: applied.skipped,
        conflicts: applied.conflicts,
        applied: applied.applied
      },
      { updated: 76, wouldUpdate: 76, skipped: 0, conflicts: 0, applied: true }
    )

    const liaoning = placeByName(fixture.databasePath, '辽宁楼')
    assert.deepEqual(
      {
        longitude: liaoning.longitude,
        latitude: liaoning.latitude,
        coordinateSystem: liaoning.coordinateSystem,
        coordinateVerification: liaoning.coordinateVerification,
        coordinateVerifiedAt: liaoning.coordinateVerifiedAt,
        status: liaoning.status
      },
      {
        longitude: 118.59973890906161,
        latitude: 25.103396572681646,
        coordinateSystem: 'GCJ-02',
        coordinateVerification: 'unverified',
        coordinateVerifiedAt: null,
        status: 'draft'
      }
    )
    assert.match(String(liaoning.summary), /已按用户授权的高德地图坐标导入后台草稿/)
    assert.match(String(liaoning.body), /正式公开发布仍需要按项目规则补充有效来源和独立核验/)
    assert.match(String(liaoning.externalMapUrl), /^https:\/\/uri\.amap\.com\/marker\?/)

    const database = new BetterSqlite3(fixture.databasePath, { readonly: true })
    try {
      assert.equal((database.prepare(`SELECT count(*) AS count FROM places WHERE status = 'published'`).get() as { count: number }).count, 0)
      assert.equal((database.prepare(`SELECT count(*) AS count FROM places WHERE coordinate_verification = 'verified'`).get() as { count: number }).count, 0)
      assert.equal((database.prepare(`SELECT count(*) AS count FROM places WHERE coordinate_verification = 'unverified' AND coordinate_system = 'GCJ-02'`).get() as { count: number }).count, 76)

      const backendDrafts = database.prepare(`
        SELECT name, longitude, latitude,
               coordinate_system AS coordinateSystem,
               coordinate_verification AS coordinateVerification,
               source_raw_ref AS sourceRawRef
        FROM places
        WHERE source_raw_ref LIKE '%amap-workmap-draft-v1%'
        ORDER BY name
      `).all() as Array<{
        name: string
        longitude: number
        latitude: number
        coordinateSystem: string
        coordinateVerification: string
        sourceRawRef: string
      }>
      const frontendByName = new Map(amapImportedPlaces.map(place => [place.name, place]))
      assert.equal(backendDrafts.length, amapImportedPlaces.length)
      for (const draft of backendDrafts) {
        const frontend = frontendByName.get(draft.name)
        assert.ok(frontend, `${draft.name} should stay visible in the public static AMap catalog until independently verified`)
        assert.ok(Math.abs(draft.longitude - frontend.sourcePoint.lng) < 0.00000001)
        assert.ok(Math.abs(draft.latitude - frontend.sourcePoint.lat) < 0.00000001)
        assert.equal(draft.coordinateSystem, 'GCJ-02')
        assert.equal(draft.coordinateVerification, 'unverified')
        assert.equal(JSON.parse(draft.sourceRawRef).sourceRow, frontend.sourceRow)
      }
    } finally {
      database.close()
    }
  } finally {
    fixture.cleanup()
  }
})

test('owner coordinate sync is idempotent and refuses conflicting backend coordinates', () => {
  const fixture = createFixture()
  try {
    assert.equal(syncAmapOwnerCoordinates({
      apply: true,
      databasePath: fixture.databasePath,
      coordinatePath: COORDINATE_PATH,
      rawPath: RAW_PATH,
      now: NOW
    }).updated, 76)
    const rerun = syncAmapOwnerCoordinates({
      apply: true,
      databasePath: fixture.databasePath,
      coordinatePath: COORDINATE_PATH,
      rawPath: RAW_PATH,
      now: NOW + 1_000
    })
    assert.deepEqual(
      { updated: rerun.updated, wouldUpdate: rerun.wouldUpdate, skipped: rerun.skipped, conflicts: rerun.conflicts, applied: rerun.applied },
      { updated: 0, wouldUpdate: 0, skipped: 76, conflicts: 0, applied: true }
    )

    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`
      UPDATE places
      SET longitude = longitude + 0.001
      WHERE name = '辽宁楼'
    `).run()
    database.close()

    const conflict = syncAmapOwnerCoordinates({
      apply: true,
      databasePath: fixture.databasePath,
      coordinatePath: COORDINATE_PATH,
      rawPath: RAW_PATH,
      now: NOW + 2_000
    })
    assert.equal(conflict.applied, false)
    assert.equal(conflict.updated, 0)
    assert.equal(conflict.conflicts, 1)
    assert.match(conflict.conflictDetails[0]!.reason, /different non-empty coordinate/)
  } finally {
    fixture.cleanup()
  }
})

test('owner coordinate sync CLI defaults to dry-run and reports invalid reviewed files', () => {
  const fixture = createFixture()
  try {
    let stdout = ''
    let stderr = ''
    assert.equal(runCli(['--database', fixture.databasePath, '--coordinates', COORDINATE_PATH, '--raw', RAW_PATH], {
      stdout: (value) => { stdout += value },
      stderr: (value) => { stderr += value }
    }), 0)
    assert.equal(stderr, '')
    const preview = JSON.parse(stdout) as SyncOwnerCoordinateResult
    assert.equal(preview.mode, 'dry-run')
    assert.equal(preview.wouldUpdate, 76)

    const badPath = join(fixture.directory, 'bad.json')
    const badCoordinates = JSON.parse(readFileSync(COORDINATE_PATH, 'utf8')) as Array<Record<string, unknown>>
    badCoordinates[0] = { ...badCoordinates[0], crs: 'WGS84' }
    writeFileSync(badPath, `${JSON.stringify(badCoordinates, null, 2)}\n`, 'utf8')
    stdout = ''
    stderr = ''
    assert.equal(runCli(['--database', fixture.databasePath, '--coordinates', badPath, '--raw', RAW_PATH], {
      stdout: (value) => { stdout += value },
      stderr: (value) => { stderr += value }
    }), 2)
    assert.equal(stdout, '')
    assert.match(stderr, /crs must remain GCJ-02/)
  } finally {
    fixture.cleanup()
  }
})
