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
  coordinateSource: null
  verificationStatus: 'pending-authorized-coordinate-export'
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
    coordinateSource: 'Synthetic test evidence; never use this fixture as production map data.',
    coordinateSourceUrl: 'https://example.invalid/coordinate-review',
    verificationStatus: 'human-verified',
    verifiedAt: '2026-07-13T08:00:00+08:00',
    verifierCategory: 'student-team'
  }
}

test('default dry-run is byte-for-byte read-only; apply updates only a reviewed subset and reruns idempotently', () => {
  const fixture = createFixture()
  try {
    const coordinate = reviewed(2, 118.606, 25.115)
    const inputPath = fixture.writeInput([coordinate])
    const before = readFileSync(fixture.databasePath)
    const preview = importAmapCoordinates({ databasePath: fixture.databasePath, inputPath, now: NOW })
    assert.deepEqual(
      {
        mode: preview.mode,
        coordinateCount: preview.coordinateCount,
        updated: preview.updated,
        wouldUpdate: preview.wouldUpdate,
        skipped: preview.skipped,
        conflicts: preview.conflicts,
        applied: preview.applied
      },
      { mode: 'dry-run', coordinateCount: 1, updated: 0, wouldUpdate: 1, skipped: 0, conflicts: 0, applied: false }
    )
    assert.deepEqual(readFileSync(fixture.databasePath), before)

    const applied = importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW })
    assert.deepEqual(
      { updated: applied.updated, wouldUpdate: applied.wouldUpdate, skipped: applied.skipped, conflicts: applied.conflicts, applied: applied.applied },
      { updated: 1, wouldUpdate: 1, skipped: 0, conflicts: 0, applied: true }
    )

    const database = new BetterSqlite3(fixture.databasePath, { readonly: true })
    const row = database.prepare(`
      SELECT longitude, latitude, coordinate_system AS coordinateSystem,
             coordinate_verification AS coordinateVerification,
             coordinate_verified_at AS coordinateVerifiedAt,
             source_raw_ref AS sourceRawRef, status, published_at AS publishedAt,
             last_verified_at AS lastVerifiedAt, is_official AS isOfficial,
             updated_at AS updatedAt
      FROM places WHERE name = ?
    `).get(coordinate.name) as Record<string, unknown>
    assert.deepEqual(
      {
        longitude: row.longitude,
        latitude: row.latitude,
        coordinateSystem: row.coordinateSystem,
        coordinateVerification: row.coordinateVerification,
        coordinateVerifiedAt: row.coordinateVerifiedAt,
        status: row.status,
        publishedAt: row.publishedAt,
        lastVerifiedAt: row.lastVerifiedAt,
        isOfficial: row.isOfficial,
        updatedAt: row.updatedAt
      },
      {
        longitude: coordinate.lng,
        latitude: coordinate.lat,
        coordinateSystem: 'WGS84',
        coordinateVerification: 'verified',
        coordinateVerifiedAt: Date.parse(coordinate.verifiedAt),
        status: 'draft',
        publishedAt: null,
        lastVerifiedAt: null,
        isOfficial: 0,
        updatedAt: NOW
      }
    )
    const rawReference = JSON.parse(String(row.sourceRawRef)) as Record<string, unknown>
    assert.equal(rawReference.sourceRow, coordinate.sourceRow)
    assert.equal(rawReference.locationCode, coordinate.locationCode)
    const coordinateReview = rawReference.coordinateReview as Record<string, unknown>
    assert.match(String(coordinateReview.inputSha256), /^[a-f0-9]{64}$/)
    const { inputSha256: _inputSha256, ...coordinateReviewWithoutFingerprint } = coordinateReview
    assert.deepEqual(coordinateReviewWithoutFingerprint, {
      importer: 'amap-coordinate-review-v1',
      schemaVersion: 1,
      longitude: coordinate.lng,
      latitude: coordinate.lat,
      coordinateSystem: 'WGS84',
      coordinateSource: coordinate.coordinateSource,
      coordinateSourceUrl: coordinate.coordinateSourceUrl,
      verificationStatus: 'human-verified',
      verifiedAt: '2026-07-13T00:00:00.000Z',
      verifierCategory: 'student-team',
      importedAt: NOW
    })
    const verifiedCount = (database.prepare('SELECT count(*) AS count FROM places WHERE coordinate_verification = ?').get('verified') as { count: number }).count
    const missingCount = (database.prepare('SELECT count(*) AS count FROM places WHERE coordinate_verification = ?').get('missing') as { count: number }).count
    const sourceCount = (database.prepare('SELECT count(*) AS count FROM sources').get() as { count: number }).count
    const relationCount = (database.prepare('SELECT count(*) AS count FROM place_sources').get() as { count: number }).count
    database.close()
    assert.equal(verifiedCount, 1)
    assert.equal(missingCount, 75)
    assert.equal(sourceCount, 0)
    assert.equal(relationCount, 0)

    const draftRerun = importAmapDrafts({ apply: true, databasePath: fixture.databasePath, inputPath: RAW_PATH })
    assert.deepEqual(
      { created: draftRerun.created, skipped: draftRerun.skipped, conflicts: draftRerun.conflicts },
      { created: 0, skipped: 76, conflicts: 0 }
    )

    const rerun = importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW + 1_000 })
    assert.deepEqual(
      { updated: rerun.updated, wouldUpdate: rerun.wouldUpdate, skipped: rerun.skipped, conflicts: rerun.conflicts, applied: rerun.applied },
      { updated: 0, wouldUpdate: 0, skipped: 1, conflicts: 0, applied: true }
    )
  } finally {
    fixture.cleanup()
  }
})

test('rejects GCJ-02 and BD-09 rather than converting or relabelling them', () => {
  const fixture = createFixture()
  try {
    for (const crs of ['GCJ-02', 'BD-09'] as const) {
      const input = { ...reviewed(2, 118.606, 25.115), crs }
      const inputPath = fixture.writeInput([input], `${crs}.json`)
      assert.throws(
        () => importAmapCoordinates({ databasePath: fixture.databasePath, inputPath, now: NOW }),
        (error: unknown) => error instanceof AmapCoordinateImportError
          && error.message.includes(`${crs} input is not accepted`)
          && error.message.includes('re-verify the WGS84 result')
      )
    }
  } finally {
    fixture.cleanup()
  }
})

test('validates the tight campus range, evidence, verification time, verifier category, and duplicate identities', () => {
  const fixture = createFixture()
  try {
    const cases: Array<{ name: string, items: unknown[], pattern: RegExp }> = [
      {
        name: 'outside-bounds',
        items: [reviewed(2, 118.62, 25.115)],
        pattern: /outside the campus validation bounds/
      },
      {
        name: 'future',
        items: [{ ...reviewed(2, 118.606, 25.115), verifiedAt: '2026-07-14T08:00:00+08:00' }],
        pattern: /cannot be in the future/
      },
      {
        name: 'blank-evidence',
        items: [{ ...reviewed(2, 118.606, 25.115), coordinateSource: ' ' }],
        pattern: /coordinateSource must be a non-blank evidence description/
      },
      {
        name: 'credential-url',
        items: [{ ...reviewed(2, 118.606, 25.115), coordinateSourceUrl: 'https://user:secret@example.invalid/evidence' }],
        pattern: /must not contain credentials/
      },
      {
        name: 'person-name-category',
        items: [{ ...reviewed(2, 118.606, 25.115), verifierCategory: 'Zhang San' }],
        pattern: /do not put a person's name here/
      },
      {
        name: 'duplicate-row',
        items: [reviewed(2, 118.606, 25.115), { ...reviewed(2, 118.6061, 25.1151) }],
        pattern: /duplicate sourceRow/
      },
      {
        name: 'duplicate-point',
        items: [reviewed(2, 118.606, 25.115), reviewed(3, 118.606, 25.115)],
        pattern: /duplicate coordinate/
      }
    ]
    for (const item of cases) {
      const inputPath = fixture.writeInput(item.items, `${item.name}.json`)
      assert.throws(
        () => importAmapCoordinates({ databasePath: fixture.databasePath, inputPath, now: NOW }),
        item.pattern,
        item.name
      )
    }
  } finally {
    fixture.cleanup()
  }
})

test('strictly binds input and the committed template to all 76 reviewed sourceRow/name/WIA identities', () => {
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
    changedTemplate[0]!.locationCode = 'WIA-999.999,888.888'
    const changedTemplatePath = fixture.writeInput(changedTemplate, 'template.json')
    assert.throws(
      () => importAmapCoordinates({
        databasePath: fixture.databasePath,
        inputPath: fixture.writeInput([reviewed(2, 118.606, 25.115)]),
        templatePath: changedTemplatePath,
        now: NOW
      }),
      /template item 1: WIA locationCode drifted/
    )
  } finally {
    fixture.cleanup()
  }
})

test('published or manually edited targets conflict and roll back the entire reviewed subset', () => {
  const fixture = createFixture()
  try {
    const first = reviewed(2, 118.606, 25.115)
    const second = reviewed(3, 118.609, 25.114)
    const inputPath = fixture.writeInput([first, second])
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`UPDATE places SET status = 'published', published_at = ?, updated_at = updated_at + 1 WHERE name = ?`)
      .run(NOW - 1, first.name)
    database.close()

    const result = importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW })
    assert.equal(result.applied, false)
    assert.equal(result.updated, 0)
    assert.equal(result.wouldUpdate, 1)
    assert.equal(result.conflicts, 1)
    assert.match(result.conflictDetails[0]!.reason, /Published or non-draft/)
    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal((checked.prepare('SELECT longitude FROM places WHERE name = ?').get(second.name) as { longitude: number | null }).longitude, null)
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('manual edits before or after coordinate import never get overwritten', () => {
  const fixture = createFixture()
  try {
    const coordinate = reviewed(2, 118.606, 25.115)
    const inputPath = fixture.writeInput([coordinate])
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`UPDATE places SET summary = 'manual review', updated_at = updated_at + 1 WHERE name = ?`).run(coordinate.name)
    database.close()
    const before = importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW })
    assert.equal(before.conflicts, 1)
    assert.match(before.conflictDetails[0]!.reason, /manually edited/)

    const reset = new BetterSqlite3(fixture.databasePath)
    reset.prepare('UPDATE places SET updated_at = created_at WHERE name = ?').run(coordinate.name)
    reset.close()
    const applied = importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW })
    assert.equal(applied.updated, 1)

    const changed = new BetterSqlite3(fixture.databasePath)
    changed.prepare('UPDATE places SET longitude = longitude + 0.0001, updated_at = updated_at + 1 WHERE name = ?').run(coordinate.name)
    changed.close()
    const after = importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW + 1_000 })
    assert.equal(after.conflicts, 1)
    assert.match(after.conflictDetails[0]!.reason, /Stored coordinate fields drifted|manually edited/)
  } finally {
    fixture.cleanup()
  }
})

test('source_raw_ref drift blocks the bound row without repairing or replacing it', () => {
  const fixture = createFixture()
  try {
    const coordinate = reviewed(2, 118.606, 25.115)
    const inputPath = fixture.writeInput([coordinate])
    const database = new BetterSqlite3(fixture.databasePath)
    const row = database.prepare('SELECT id, source_raw_ref AS sourceRawRef FROM places WHERE name = ?')
      .get(coordinate.name) as { id: string, sourceRawRef: string }
    const reference = JSON.parse(row.sourceRawRef) as Record<string, unknown>
    reference.unreviewedField = true
    const drifted = JSON.stringify(reference)
    database.prepare('UPDATE places SET source_raw_ref = ? WHERE id = ?').run(drifted, row.id)
    database.close()

    const result = importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW })
    assert.equal(result.applied, false)
    assert.equal(result.updated, 0)
    assert.equal(result.conflicts, 1)
    assert.match(result.conflictDetails[0]!.reason, /malformed source_raw_ref related to this import/)
    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    const unchanged = checked.prepare('SELECT longitude, source_raw_ref AS sourceRawRef FROM places WHERE id = ?')
      .get(row.id) as { longitude: number | null, sourceRawRef: string }
    checked.close()
    assert.equal(unchanged.longitude, null)
    assert.equal(unchanged.sourceRawRef, drifted)
  } finally {
    fixture.cleanup()
  }
})

test('an existing manually linked source is a conflict and remains untouched', () => {
  const fixture = createFixture()
  try {
    const coordinate = reviewed(2, 118.606, 25.115)
    const inputPath = fixture.writeInput([coordinate])
    const database = new BetterSqlite3(fixture.databasePath)
    const place = database.prepare('SELECT id FROM places WHERE name = ?').get(coordinate.name) as { id: string }
    database.prepare(`
      INSERT INTO sources (
        id, title, url, platform, publisher_name, source_level, is_official,
        accessed_at, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'active', ?, ?)
    `).run('manual-test-source', 'Synthetic source', 'https://example.invalid/manual-source', 'test', 'Test publisher', 'C', NOW, NOW, NOW)
    database.prepare(`INSERT INTO place_sources (place_id, source_id, is_primary, created_at) VALUES (?, ?, 1, ?)`)
      .run(place.id, 'manual-test-source', NOW)
    database.close()

    const result = importAmapCoordinates({ apply: true, databasePath: fixture.databasePath, inputPath, now: NOW })
    assert.equal(result.applied, false)
    assert.equal(result.updated, 0)
    assert.equal(result.conflicts, 1)
    assert.match(result.conflictDetails[0]!.reason, /metadata or source links were manually changed/)
    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal((checked.prepare('SELECT count(*) AS count FROM sources').get() as { count: number }).count, 1)
    assert.equal((checked.prepare('SELECT count(*) AS count FROM place_sources').get() as { count: number }).count, 1)
    assert.equal((checked.prepare('SELECT longitude FROM places WHERE id = ?').get(place.id) as { longitude: number | null }).longitude, null)
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('CLI requires an input, defaults to dry-run, and returns a conflict exit code without writes', () => {
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

    stdout = ''
    stderr = ''
    const coordinate = reviewed(2, 118.606, 25.115)
    const inputPath = fixture.writeInput([coordinate])
    assert.equal(runCoordinateCli(['--database', fixture.databasePath, '--input', inputPath], {
      stdout: (value) => { stdout += value },
      stderr: (value) => { stderr += value }
    }), 0)
    assert.equal(stderr, '')
    assert.equal((JSON.parse(stdout) as { mode: string }).mode, 'dry-run')

    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare('UPDATE places SET updated_at = updated_at + 1 WHERE name = ?').run(coordinate.name)
    database.close()
    stdout = ''
    assert.equal(runCoordinateCli(['--apply', '--database', fixture.databasePath, '--input', inputPath], {
      stdout: (value) => { stdout += value },
      stderr: (value) => { stderr += value }
    }), 1)
    const conflict = JSON.parse(stdout) as { applied: boolean, updated: number, conflicts: number }
    assert.deepEqual(
      { applied: conflict.applied, updated: conflict.updated, conflicts: conflict.conflicts },
      { applied: false, updated: 0, conflicts: 1 }
    )
  } finally {
    fixture.cleanup()
  }
})
