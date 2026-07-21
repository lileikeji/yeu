import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { amapImportedPlaces } from '../data/seeds/amap-imported-places'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { classifyMarker, importAmapDrafts } from './import-amap-drafts'
import {
  runCli,
  syncAmapOwnerClassifications,
  type SyncOwnerClassificationResult
} from './sync-amap-owner-classifications'

const RAW_PATH = resolve('data/imports/amap-workmap-2026-07-13.raw.json')
const NOW = Date.parse('2026-07-21T16:00:00+08:00')

interface Fixture {
  databasePath: string
  cleanup: () => void
}

function createLegacyFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-amap-owner-classifications-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  closeDatabase(databasePath)
  assert.equal(importAmapDrafts({
    apply: true,
    databasePath,
    inputPath: RAW_PATH,
    now: NOW - 1_000
  }).created, 76)

  const database = new BetterSqlite3(databasePath)
  try {
    const update = database.prepare('UPDATE places SET category = ? WHERE name = ?')
    const restoreLegacyCategories = database.transaction(() => {
      for (const place of amapImportedPlaces) {
        update.run(classifyMarker(place.name).category, place.name)
      }
    })
    restoreLegacyCategories()
  } finally {
    database.close()
  }

  return {
    databasePath,
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

function categoryByName(databasePath: string, name: string): string | null {
  const database = new BetterSqlite3(databasePath, { readonly: true })
  try {
    return (database.prepare('SELECT category FROM places WHERE name = ?').get(name) as { category: string | null }).category
  } finally {
    database.close()
  }
}

test('classification sync repairs every legacy owner-map mismatch and is idempotent', () => {
  const fixture = createLegacyFixture()
  try {
    const expectedChanges = amapImportedPlaces.filter(place =>
      classifyMarker(place.name).category !== place.category
    ).length
    assert.equal(expectedChanges, 54)

    const preview = syncAmapOwnerClassifications({
      databasePath: fixture.databasePath,
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
      { updated: 0, wouldUpdate: 54, skipped: 22, conflicts: 0, applied: false }
    )

    const applied = syncAmapOwnerClassifications({
      apply: true,
      databasePath: fixture.databasePath,
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
      { updated: 54, wouldUpdate: 54, skipped: 22, conflicts: 0, applied: true }
    )
    assert.equal(categoryByName(fixture.databasePath, '长春楼'), 'dorm')
    assert.equal(categoryByName(fixture.databasePath, '新区行政楼'), 'service')
    assert.equal(categoryByName(fixture.databasePath, '图书馆'), 'service')
    assert.equal(categoryByName(fixture.databasePath, '多功能报告厅'), 'service')
    assert.equal(categoryByName(fixture.databasePath, '普照大礼堂'), 'service')
    assert.equal(categoryByName(fixture.databasePath, '新区学生街'), 'nearby')
    assert.equal(categoryByName(fixture.databasePath, '旧区车来车往（京东）'), 'express')

    const rerun = syncAmapOwnerClassifications({
      apply: true,
      databasePath: fixture.databasePath,
      now: NOW + 1_000
    })
    assert.deepEqual(
      {
        updated: rerun.updated,
        wouldUpdate: rerun.wouldUpdate,
        skipped: rerun.skipped,
        conflicts: rerun.conflicts,
        applied: rerun.applied
      },
      { updated: 0, wouldUpdate: 0, skipped: 76, conflicts: 0, applied: true }
    )
  } finally {
    fixture.cleanup()
  }
})

test('classification sync stops before writing when a category was manually changed', () => {
  const fixture = createLegacyFixture()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`UPDATE places SET category = 'food' WHERE name = '长春楼'`).run()
    database.close()

    const result = syncAmapOwnerClassifications({
      apply: true,
      databasePath: fixture.databasePath,
      now: NOW
    })
    assert.equal(result.applied, false)
    assert.equal(result.updated, 0)
    assert.equal(result.conflicts, 1)
    assert.match(result.conflictDetails[0]!.reason, /manual change/)
    assert.equal(categoryByName(fixture.databasePath, '长春楼'), 'food')
    assert.equal(categoryByName(fixture.databasePath, '新区行政楼'), null)
  } finally {
    fixture.cleanup()
  }
})

test('classification sync refuses a published mismatch and CLI defaults to dry-run', () => {
  const fixture = createLegacyFixture()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`UPDATE places SET status = 'published' WHERE name = '长春楼'`).run()
    database.close()

    const blocked = syncAmapOwnerClassifications({
      apply: true,
      databasePath: fixture.databasePath,
      now: NOW
    })
    assert.equal(blocked.applied, false)
    assert.equal(blocked.conflicts, 1)
    assert.match(blocked.conflictDetails[0]!.reason, /published or archived/)

    const reopened = new BetterSqlite3(fixture.databasePath)
    reopened.prepare(`UPDATE places SET status = 'draft' WHERE name = '长春楼'`).run()
    reopened.close()
    let stdout = ''
    let stderr = ''
    assert.equal(runCli(['--database', fixture.databasePath], {
      stdout: (value) => { stdout += value },
      stderr: (value) => { stderr += value }
    }), 0)
    assert.equal(stderr, '')
    const preview = JSON.parse(stdout) as SyncOwnerClassificationResult
    assert.equal(preview.mode, 'dry-run')
    assert.equal(preview.wouldUpdate, 54)
  } finally {
    fixture.cleanup()
  }
})
