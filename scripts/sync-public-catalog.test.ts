import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { seedPublicCatalog } from './seed-public-catalog'
import { syncPublicCatalog } from './sync-public-catalog'

function createDatabase(): { databasePath: string, cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-public-catalog-sync-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  closeDatabase(databasePath)
  return {
    databasePath,
    cleanup: () => {
      closeDatabase(databasePath)
      try {
        rmSync(directory, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 200
        })
      } catch (error) {
        closeDatabase()
        try {
          rmSync(directory, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 200
          })
        } catch {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'EPERM') {
            throw error
          }
        }
      }
    }
  }
}

function count(database: InstanceType<typeof BetterSqlite3>, table: string): number {
  return (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count
}

test('owned sync upgrades an older catalog and is idempotent', () => {
  const fixture = createDatabase()
  try {
    seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    const database = new BetterSqlite3(fixture.databasePath)
    database.pragma('foreign_keys = ON')
    database.prepare(`DELETE FROM contents WHERE kind = 'club'`).run()
    database.prepare(`
      DELETE FROM content_sources
      WHERE source_id IN (SELECT id FROM sources WHERE url IN (?, ?))
    `).run(
      'https://library.yeu.edu.cn/198/list.htm',
      'https://library.yeu.edu.cn/2025/0226/c193a47629/page.htm'
    )
    database.prepare(`DELETE FROM sources WHERE url IN (?, ?)`).run(
      'https://library.yeu.edu.cn/198/list.htm',
      'https://library.yeu.edu.cn/2025/0226/c193a47629/page.htm'
    )
    const guide = database.prepare(`
      SELECT id, metadata_json AS metadataJson
      FROM contents WHERE kind = 'guide' AND slug = 'campus-card-network'
    `).get() as { id: string, metadataJson: string }
    const metadata = JSON.parse(guide.metadataJson) as Record<string, unknown>
    delete metadata.verificationState
    database.prepare(`
      UPDATE contents SET summary = ?, metadata_json = ?, last_verified_at = ? WHERE id = ?
    `).run(
      '旧版校园卡说明',
      JSON.stringify(metadata),
      Date.parse('2026-07-13T00:00:00.000Z'),
      guide.id
    )
    database.close()

    const preview = syncPublicCatalog({ databasePath: fixture.databasePath })
    assert.deepEqual({
      createSources: preview.wouldCreateSources,
      createContents: preview.wouldCreateContents,
      updateContents: preview.wouldUpdateContents,
      conflicts: preview.conflicts.length,
      applied: preview.applied
    }, {
      createSources: 2,
      createContents: 23,
      updateContents: 2,
      conflicts: 0,
      applied: false
    })

    const applied = syncPublicCatalog({
      applyOwned: true,
      databasePath: fixture.databasePath,
      now: 1_789_000_000_000
    })
    assert.deepEqual({
      createdSources: applied.createdSources,
      createdContents: applied.createdContents,
      updatedContents: applied.updatedContents,
      conflicts: applied.conflicts.length,
      applied: applied.applied
    }, {
      createdSources: 2,
      createdContents: 23,
      updatedContents: 2,
      conflicts: 0,
      applied: true
    })

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    try {
      assert.equal(count(checked, 'contents'), 59)
      assert.equal(
        (checked.prepare(`SELECT count(*) AS count FROM contents WHERE kind = 'club'`).get() as { count: number }).count,
        23
      )
      assert.equal(
        (checked.prepare(`
          SELECT count(*) AS count
          FROM content_sources AS relation
          JOIN contents AS content ON content.id = relation.content_id
          WHERE content.kind = 'guide' AND content.slug = 'campus-card-network'
        `).get() as { count: number }).count,
        7
      )
      assert.equal(
        (checked.prepare(`
          SELECT count(*) AS count
          FROM content_sources AS relation
          JOIN contents AS content ON content.id = relation.content_id
          JOIN sources AS source ON source.id = relation.source_id
          WHERE content.kind = 'guide'
            AND content.slug = 'campus-card-network'
            AND source.url = 'https://metc.yeu.edu.cn/2025/0804/c1241a50868/page.htm'
        `).get() as { count: number }).count,
        1
      )
    } finally {
      checked.close()
    }

    const rerun = syncPublicCatalog({ applyOwned: true, databasePath: fixture.databasePath })
    assert.equal(rerun.createdSources, 0)
    assert.equal(rerun.createdContents, 0)
    assert.equal(rerun.updatedContents, 0)
    assert.equal(rerun.applied, true)
  } finally {
    fixture.cleanup()
  }
})

test('manual content collisions abort the entire owned sync', () => {
  const fixture = createDatabase()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`
      INSERT INTO contents (
        id, kind, slug, title, summary, body, metadata_json, is_featured,
        status, created_at, updated_at
      ) VALUES ('manual-arrival', 'guide', 'arrival', '人工内容', '不得覆盖', '', '{}', 0, 'draft', 1, 1)
    `).run()
    database.close()

    const result = syncPublicCatalog({ applyOwned: true, databasePath: fixture.databasePath })
    assert.equal(result.applied, false)
    assert.ok(result.conflicts.some(conflict => conflict.includes('guide:arrival')))

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal(count(checked, 'sources'), 0)
    assert.equal(count(checked, 'contents'), 1)
    checked.close()
  } finally {
    fixture.cleanup()
  }
})
