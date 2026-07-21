import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { amapImportedPlaces } from '../data/seeds/amap-imported-places'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  classifyMarker,
  importAmapDrafts,
  parseAmapMarkers,
  runCli
} from './import-amap-drafts'

const RAW_PATH = resolve('data/imports/amap-workmap-2026-07-13.raw.json')

function createDatabase(): { databasePath: string, cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-amap-drafts-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  closeDatabase(databasePath)
  return {
    databasePath,
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

test('strictly validates the reviewed marker sheet and keeps name-only fallback conservative', () => {
  const raw: unknown = JSON.parse(readFileSync(RAW_PATH, 'utf8'))
  const markers = parseAmapMarkers(raw)
  assert.equal(markers.length, 76)
  assert.deepEqual(markers.map(marker => marker.sourceRow), Array.from({ length: 76 }, (_, index) => index + 2))
  for (const name of ['海南楼', '陕西楼', '黄海楼', '泰山楼', '南海楼']) {
    assert.deepEqual(classifyMarker(name), { type: 'building', category: null })
  }
  assert.deepEqual(classifyMarker('新区学生宿舍'), { type: 'dormitory', category: 'dorm' })
})

test('rejects marker count and reviewed marker data changes', () => {
  const raw = JSON.parse(readFileSync(RAW_PATH, 'utf8')) as {
    sheets: Array<{ rows: Array<Record<string, unknown>> }>
  }
  const missingMarker = structuredClone(raw)
  missingMarker.sheets[0]!.rows.pop()
  assert.throws(() => parseAmapMarkers(missingMarker), /exactly 76 markers/)

  const changedMarker = structuredClone(raw)
  changedMarker.sheets[0]!.rows[0]!['地址'] = '未经审计的修改'
  assert.throws(() => parseAmapMarkers(changedMarker), /fingerprint/)
})

test('dry-run is read-only and apply creates 76 source-free missing-coordinate drafts', () => {
  const fixture = createDatabase()
  try {
    const preview = importAmapDrafts({ databasePath: fixture.databasePath, inputPath: RAW_PATH })
    assert.deepEqual(
      { created: preview.created, wouldCreate: preview.wouldCreate, skipped: preview.skipped, conflicts: preview.conflicts, applied: preview.applied },
      { created: 0, wouldCreate: 76, skipped: 0, conflicts: 0, applied: false }
    )

    const database = new BetterSqlite3(fixture.databasePath)
    assert.equal((database.prepare('SELECT count(*) AS count FROM places').get() as { count: number }).count, 0)
    database.close()

    const applied = importAmapDrafts({
      apply: true,
      databasePath: fixture.databasePath,
      inputPath: RAW_PATH,
      now: 1_789_000_000_000
    })
    assert.deepEqual(
      { created: applied.created, wouldCreate: applied.wouldCreate, skipped: applied.skipped, conflicts: applied.conflicts, applied: applied.applied },
      { created: 76, wouldCreate: 76, skipped: 0, conflicts: 0, applied: true }
    )

    const verified = new BetterSqlite3(fixture.databasePath)
    const invariant = verified.prepare(`
      SELECT count(*) AS count
      FROM places
      WHERE longitude IS NULL
        AND latitude IS NULL
        AND coordinate_system IS NULL
        AND coordinate_verification = 'missing'
        AND coordinate_verified_at IS NULL
        AND status = 'draft'
        AND last_verified_at IS NULL
        AND published_at IS NULL
        AND is_official = 0
        AND is_featured = 0
    `).get() as { count: number }
    assert.equal(invariant.count, 76)
    assert.equal((verified.prepare('SELECT count(*) AS count FROM place_sources').get() as { count: number }).count, 0)

    const detailed = verified.prepare(`
      SELECT body, address, source_raw_ref AS sourceRawRef
      FROM places
      WHERE name = ?
    `).get('新区行政楼') as { body: string, address: string, sourceRawRef: string }
    assert.match(detailed.body, /一楼:校资助中心、就业中心/)
    assert.equal(detailed.address, '福建省泉州市洛江区马甲镇挪威街')
    assert.deepEqual(JSON.parse(detailed.sourceRawRef), {
      importer: 'amap-workmap-draft-v1',
      file: 'amap-workmap-2026-07-13.raw.json',
      sheet: '标记位置',
      sourceRow: 16,
      locationCode: 'WIA-200.35340,62.878096498'
    })

    const imported = verified.prepare(`
      SELECT name, category, source_raw_ref AS sourceRawRef
      FROM places
      ORDER BY name
    `).all() as Array<{ name: string, category: string | null, sourceRawRef: string }>
    const reviewedByRow = new Map(amapImportedPlaces.map(place => [place.sourceRow, place]))
    assert.equal(imported.length, 76)
    for (const place of imported) {
      const sourceRow = Number((JSON.parse(place.sourceRawRef) as { sourceRow: number }).sourceRow)
      const reviewed = reviewedByRow.get(sourceRow)
      assert.ok(reviewed)
      assert.equal(place.name, reviewed.name)
      assert.equal(place.category, reviewed.category)
    }

    const examples = verified.prepare(`
      SELECT name, category
      FROM places
      WHERE name IN ('长春楼', '新区行政楼', '图书馆', '多功能报告厅', '普照大礼堂', '新区学生街', '旧区车来车往（京东）')
      ORDER BY name
    `).all() as Array<{ name: string, category: string }>
    assert.deepEqual(Object.fromEntries(examples.map(place => [place.name, place.category])), {
      '图书馆': 'service',
      '多功能报告厅': 'service',
      '新区学生街': 'nearby',
      '新区行政楼': 'service',
      '旧区车来车往（京东）': 'express',
      '普照大礼堂': 'service',
      '长春楼': 'dorm'
    })
    verified.close()
  } finally {
    fixture.cleanup()
  }
})

test('reruns are idempotent by source row plus WIA code and preserve manual edits', () => {
  const fixture = createDatabase()
  try {
    importAmapDrafts({ apply: true, databasePath: fixture.databasePath, inputPath: RAW_PATH })
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`UPDATE places SET summary = 'manual edit', category = 'service' WHERE name = ?`).run('海南楼')
    database.close()

    const rerun = importAmapDrafts({ apply: true, databasePath: fixture.databasePath, inputPath: RAW_PATH })
    assert.deepEqual(
      { created: rerun.created, skipped: rerun.skipped, conflicts: rerun.conflicts, applied: rerun.applied },
      { created: 0, skipped: 76, conflicts: 0, applied: true }
    )
    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    const edited = checked.prepare('SELECT summary, category FROM places WHERE name = ?').get('海南楼') as { summary: string, category: string }
    assert.deepEqual(edited, { summary: 'manual edit', category: 'service' })
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('a manual name collision blocks the whole batch and runCli exits non-zero', () => {
  const fixture = createDatabase()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`
      INSERT INTO places (
        id, slug, name, summary, body, scope, type, coordinate_verification, status,
        is_official, is_featured, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '', 'campus', 'building', 'missing', 'draft', 0, 0, ?, ?)
    `).run('manual-place', 'manual-library', '图书馆', 'manual', 1, 1)
    database.close()

    let stdout = ''
    let stderr = ''
    const exitCode = runCli(
      ['--apply', '--database', fixture.databasePath, '--input', RAW_PATH],
      {
        stdout: (value) => {
          stdout += value
        },
        stderr: (value) => {
          stderr += value
        }
      }
    )
    assert.equal(exitCode, 1)
    assert.equal(stderr, '')
    const result = JSON.parse(stdout) as { created: number, conflicts: number, applied: boolean }
    assert.equal(result.created, 0)
    assert.equal(result.conflicts, 1)
    assert.equal(result.applied, false)

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal((checked.prepare('SELECT count(*) AS count FROM places').get() as { count: number }).count, 1)
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('a partial source-row/WIA identity mismatch blocks every write', () => {
  const fixture = createDatabase()
  try {
    importAmapDrafts({ apply: true, databasePath: fixture.databasePath, inputPath: RAW_PATH })
    const database = new BetterSqlite3(fixture.databasePath)
    const original = database.prepare(`
      SELECT id, source_raw_ref AS sourceRawRef
      FROM places
      WHERE name = ?
    `).get('泽钏教学楼') as { id: string, sourceRawRef: string }
    const changedReference = JSON.parse(original.sourceRawRef) as Record<string, unknown>
    changedReference.locationCode = 'WIA-999.999,888.888'
    database.prepare('UPDATE places SET source_raw_ref = ? WHERE id = ?')
      .run(JSON.stringify(changedReference), original.id)
    database.close()

    const result = importAmapDrafts({ apply: true, databasePath: fixture.databasePath, inputPath: RAW_PATH })
    assert.equal(result.created, 0)
    assert.equal(result.skipped, 75)
    assert.equal(result.conflicts, 1)
    assert.equal(result.applied, false)

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal((checked.prepare('SELECT count(*) AS count FROM places').get() as { count: number }).count, 76)
    checked.close()
  } finally {
    fixture.cleanup()
  }
})
