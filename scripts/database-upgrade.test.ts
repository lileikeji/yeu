import assert from 'node:assert/strict'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const MIGRATIONS_PATH = resolve('server/database/migrations')

interface MigrationJournal {
  version: string
  dialect: string
  entries: Array<{
    idx: number
    version: string
    when: number
    tag: string
    breakpoints: boolean
  }>
}

function createMigrationSet(root: string, entryCount: number): string {
  const target = join(root, `migrations-${entryCount}`)
  const metaTarget = join(target, 'meta')
  mkdirSync(metaTarget, { recursive: true })

  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_PATH, 'meta', '_journal.json'), 'utf8')
  ) as MigrationJournal
  const entries = journal.entries.slice(0, entryCount)

  for (const entry of entries) {
    copyFileSync(
      join(MIGRATIONS_PATH, `${entry.tag}.sql`),
      join(target, `${entry.tag}.sql`)
    )
  }

  writeFileSync(
    join(metaTarget, '_journal.json'),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
    'utf8'
  )
  return target
}

test('0001 preserves place-source links when upgrading a 0000 database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-database-upgrade-'))
  const sqlite = new BetterSqlite3(join(directory, 'upgrade.sqlite'))

  try {
    sqlite.pragma('foreign_keys = ON')
    const database = drizzle(sqlite)
    migrate(database, { migrationsFolder: createMigrationSet(directory, 1) })

    const now = 1_789_000_000_000
    sqlite.prepare(`
      INSERT INTO sources (
        id, title, url, platform, publisher_name, source_level, is_official,
        accessed_at, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'source-before-upgrade',
      'Official source',
      'https://example.edu/source',
      'official-site',
      'Example University',
      'A',
      1,
      now,
      'active',
      now,
      now
    )
    sqlite.prepare(`
      INSERT INTO places (
        id, slug, name, summary, body, scope, type, longitude, latitude,
        coordinate_system, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '', 'campus', 'building', ?, ?, 'WGS84', 'draft', ?, ?)
    `).run(
      'place-before-upgrade',
      'place-before-upgrade',
      'Upgrade fixture',
      'Must retain its source association',
      118.605,
      25.151,
      now,
      now
    )
    sqlite.prepare(`
      INSERT INTO place_sources (place_id, source_id, is_primary, created_at)
      VALUES (?, ?, 1, ?)
    `).run('place-before-upgrade', 'source-before-upgrade', now)

    migrate(database, { migrationsFolder: createMigrationSet(directory, 2) })

    const association = sqlite.prepare(`
      SELECT place_id AS placeId, source_id AS sourceId, is_primary AS isPrimary
      FROM place_sources
    `).get() as { placeId: string, sourceId: string, isPrimary: number }
    assert.deepEqual(association, {
      placeId: 'place-before-upgrade',
      sourceId: 'source-before-upgrade',
      isPrimary: 1
    })

    const place = sqlite.prepare(`
      SELECT coordinate_verification AS verification, coordinate_verified_at AS verifiedAt
      FROM places WHERE id = ?
    `).get('place-before-upgrade') as { verification: string, verifiedAt: number | null }
    assert.deepEqual(place, { verification: 'unverified', verifiedAt: null })

    const temporaryTables = sqlite.prepare(`
      SELECT count(*) AS count
      FROM sqlite_master
      WHERE type = 'table' AND name IN ('__new_places', '__place_sources_backup')
    `).get() as { count: number }
    assert.equal(temporaryTables.count, 0)
    assert.deepEqual(sqlite.pragma('foreign_key_check'), [])
  } finally {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('0003 creates the procedure graph with enforced foreign keys and ordering constraints', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-procedure-migration-'))
  const sqlite = new BetterSqlite3(join(directory, 'procedure.sqlite'))

  try {
    sqlite.pragma('foreign_keys = ON')
    const database = drizzle(sqlite)
    migrate(database, { migrationsFolder: createMigrationSet(directory, 4) })

    const tables = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'procedure%'
      ORDER BY name
    `).all() as Array<{ name: string }>
    assert.deepEqual(tables.map(row => row.name), [
      'procedure_materials',
      'procedure_places',
      'procedure_sources',
      'procedure_steps',
      'procedures'
    ])

    const now = Date.now()
    sqlite.prepare(`
      INSERT INTO procedures (
        id, slug, title, summary, audience_json, method, information_state,
        status_text, status, created_at, updated_at
      ) VALUES ('procedure-migration', 'procedure-migration', 'Procedure', 'Summary',
        '["undergraduate"]', 'mixed', 'partial', 'Partial', 'draft', ?, ?)
    `).run(now, now)
    assert.throws(() => sqlite.prepare(`
      INSERT INTO procedure_steps (
        id, procedure_id, step_order, title, audience_json, information_state,
        created_at, updated_at
      ) VALUES ('invalid-order', 'procedure-migration', 0, 'Invalid',
        '["undergraduate"]', 'confirmed', ?, ?)
    `).run(now, now), /procedure_steps_order_check/)
    assert.throws(() => sqlite.prepare(`
      INSERT INTO procedure_materials (
        id, procedure_id, item_order, name, audience_json, information_state,
        created_at, updated_at
      ) VALUES ('orphan-material', 'missing-procedure', 1, 'Orphan',
        '["undergraduate"]', 'confirmed', ?, ?)
    `).run(now, now), /FOREIGN KEY constraint failed/)
    assert.deepEqual(sqlite.pragma('foreign_key_check'), [])
  } finally {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
