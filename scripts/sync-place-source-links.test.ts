import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import {
  expectedPlaceSourceLinkCount,
  placeSourceLinkSeeds
} from '../data/seeds/place-source-links'
import { syncPlaceSourceLinks } from './sync-place-source-links'

function createFixture(): { databasePath: string, cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-place-source-sync-'))
  const databasePath = join(directory, 'test.sqlite')
  const database = new BetterSqlite3(databasePath)
  database.exec(`
    CREATE TABLE sources (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      source_level TEXT NOT NULL,
      is_official INTEGER NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE places (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE place_sources (
      place_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      PRIMARY KEY (place_id, source_id)
    );
  `)
  const insertSource = database.prepare('INSERT INTO sources VALUES (?, ?, ?, ?, ?)')
  placeSourceLinkSeeds.forEach((seed, index) => {
    insertSource.run(`source-${index + 1}`, seed.sourceUrl, 'A', 1, 'active')
  })
  const names = [...new Set(placeSourceLinkSeeds.flatMap(seed => [...seed.placeNames]))]
  const insertPlace = database.prepare('INSERT INTO places VALUES (?, ?)')
  names.forEach((name, index) => insertPlace.run(`place-${index + 1}`, name))
  database.close()
  return { databasePath, cleanup: () => rmSync(directory, { recursive: true, force: true }) }
}

test('reviewed place source sync is dry-run by default, additive and idempotent', () => {
  const fixture = createFixture()
  try {
    const before = readFileSync(fixture.databasePath)
    const preview = syncPlaceSourceLinks({ databasePath: fixture.databasePath })
    assert.deepEqual(
      {
        inserted: preview.inserted,
        wouldInsert: preview.wouldInsert,
        skipped: preview.skipped,
        conflicts: preview.conflicts,
        coveredPlaces: preview.coveredPlaces,
        applied: preview.applied
      },
      {
        inserted: 0,
        wouldInsert: expectedPlaceSourceLinkCount,
        skipped: 0,
        conflicts: 0,
        coveredPlaces: 26,
        applied: false
      }
    )
    assert.deepEqual(readFileSync(fixture.databasePath), before)

    const applied = syncPlaceSourceLinks({ apply: true, databasePath: fixture.databasePath, now: 1_752_540_000_000 })
    assert.equal(applied.inserted, expectedPlaceSourceLinkCount)
    assert.equal(applied.applied, true)

    const rerun = syncPlaceSourceLinks({ apply: true, databasePath: fixture.databasePath, now: 1_752_540_001_000 })
    assert.equal(rerun.inserted, 0)
    assert.equal(rerun.skipped, expectedPlaceSourceLinkCount)
    assert.equal(rerun.conflicts, 0)

    const database = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal(
      (database.prepare('SELECT count(*) AS count FROM place_sources').get() as { count: number }).count,
      expectedPlaceSourceLinkCount
    )
    database.close()
  } finally {
    fixture.cleanup()
  }
})

test('reviewed place source sync stops on missing or downgraded evidence', () => {
  const fixture = createFixture()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare('UPDATE sources SET status = ? WHERE url = ?')
      .run('unavailable', placeSourceLinkSeeds[0].sourceUrl)
    database.prepare('DELETE FROM places WHERE name = ?').run('创业园')
    database.close()

    const result = syncPlaceSourceLinks({ apply: true, databasePath: fixture.databasePath })
    assert.equal(result.applied, false)
    assert.ok(result.conflicts >= 3)
    assert.ok(result.conflictDetails.some(item => /not an active official/.test(item.reason)))
    assert.ok(result.conflictDetails.some(item => item.placeName === '创业园'))
  } finally {
    fixture.cleanup()
  }
})
