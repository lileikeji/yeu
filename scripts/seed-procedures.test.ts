import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { seedPublicCatalog } from './seed-public-catalog'
import { seedProcedures } from './seed-procedures'

function createDatabase(): { databasePath: string, cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-procedure-seed-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  closeDatabase(databasePath)
  seedPublicCatalog({ apply: true, databasePath, now: Date.parse('2026-07-14T00:00:00+08:00') })
  return {
    databasePath,
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

test('arrival procedure seed is explicit, traceable, and idempotent', () => {
  const fixture = createDatabase()
  try {
    const preview = seedProcedures({ databasePath: fixture.databasePath })
    assert.deepEqual({
      mode: preview.mode,
      wouldCreate: preview.wouldCreate,
      wouldUpdate: preview.wouldUpdate,
      procedureCount: preview.procedureCount,
      stepCount: preview.stepCount,
      materialCount: preview.materialCount,
      applied: preview.applied
    }, {
      mode: 'dry-run',
      wouldCreate: 1,
      wouldUpdate: 0,
      procedureCount: 1,
      stepCount: 5,
      materialCount: 0,
      applied: false
    })

    const first = seedProcedures({
      apply: true,
      databasePath: fixture.databasePath,
      now: Date.parse('2026-07-14T01:00:00+08:00')
    })
    assert.equal(first.created, 1)
    assert.equal(first.updated, 0)

    let database = new BetterSqlite3(fixture.databasePath, { readonly: true })
    database.pragma('foreign_keys = ON')
    const procedure = database.prepare(`
      SELECT
        procedure.slug,
        procedure.status,
        procedure.information_state AS informationState,
        procedure.processing_time AS processingTime,
        procedure.deadline_text AS deadlineText,
        department.slug AS departmentSlug,
        guide.slug AS guideSlug
      FROM procedures AS procedure
      LEFT JOIN contents AS department ON department.id = procedure.department_id
      LEFT JOIN contents AS guide ON guide.id = procedure.guide_id
      WHERE procedure.slug = 'arrival'
    `).get()
    assert.deepEqual(procedure, {
      slug: 'arrival',
      status: 'published',
      informationState: 'partial',
      processingTime: null,
      deadlineText: '2026年9月5日至6日；个人日期和时段以录取通知书及学校后续通知为准。',
      departmentSlug: 'admissions-office',
      guideSlug: 'arrival'
    })
    const steps = database.prepare(`
      SELECT step_order AS stepOrder, title, information_state AS informationState,
        place_id AS placeId
      FROM procedure_steps WHERE procedure_id = (
        SELECT id FROM procedures WHERE slug = 'arrival'
      ) ORDER BY step_order
    `).all()
    assert.deepEqual((steps as Array<{ stepOrder: number }>).map(step => step.stepOrder), [1, 2, 3, 4, 5])
    assert.equal((steps as Array<{ placeId: string | null }>).every(step => step.placeId === null), true)
    assert.equal((steps as Array<{ informationState: string }>).filter(
      step => step.informationState === 'awaiting-notice'
    ).length, 3)
    assert.equal((database.prepare('SELECT count(*) AS count FROM procedure_materials').get() as { count: number }).count, 0)
    const sourceClaims = database.prepare(`
      SELECT relation.claim_scope AS claimScope, relation.is_primary AS isPrimary,
        source.url
      FROM procedure_sources AS relation
      JOIN sources AS source ON source.id = relation.source_id
      WHERE relation.procedure_id = (SELECT id FROM procedures WHERE slug = 'arrival')
      ORDER BY relation.sort_order
    `).all() as Array<{ claimScope: string, isPrimary: number, url: string }>
    assert.equal(sourceClaims.length, 4)
    assert.match(sourceClaims[0]!.claimScope, /9月5日至6日/)
    assert.equal(sourceClaims[0]!.isPrimary, 1)
    assert.deepEqual(database.pragma('foreign_key_check'), [])
    database.close()

    const rerun = seedProcedures({
      apply: true,
      databasePath: fixture.databasePath,
      now: Date.parse('2026-07-14T02:00:00+08:00')
    })
    assert.equal(rerun.created, 0)
    assert.equal(rerun.updated, 1)
    database = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal((database.prepare('SELECT count(*) AS count FROM procedures').get() as { count: number }).count, 1)
    assert.equal((database.prepare('SELECT count(*) AS count FROM procedure_steps').get() as { count: number }).count, 5)
    assert.equal((database.prepare('SELECT count(*) AS count FROM procedure_sources').get() as { count: number }).count, 4)
    database.close()
  } finally {
    fixture.cleanup()
  }
})

test('procedure seed refuses to overwrite a manually maintained arrival record', () => {
  const fixture = createDatabase()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    const now = Date.now()
    database.prepare(`
      INSERT INTO procedures (
        id, slug, title, summary, audience_json, method, information_state,
        status_text, status, created_at, updated_at
      ) VALUES ('manual-arrival', 'arrival', 'Manual', 'Manual summary',
        '["undergraduate"]', 'mixed', 'partial', 'Manual', 'draft', ?, ?)
    `).run(now, now)
    database.close()
    assert.throws(
      () => seedProcedures({ apply: true, databasePath: fixture.databasePath }),
      /maintained manually/
    )
    const readonly = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal((readonly.prepare('SELECT count(*) AS count FROM procedure_steps').get() as { count: number }).count, 0)
    readonly.close()
  } finally {
    fixture.cleanup()
  }
})
