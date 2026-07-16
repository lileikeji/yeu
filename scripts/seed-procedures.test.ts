import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { procedureSeeds } from '../data/seeds/procedures'
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
    cleanup: () => {
      try {
        rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EPERM') throw error
      }
    }
  }
}

test('procedure seeds cover high-frequency freshman workflows and rerun safely', () => {
  const fixture = createDatabase()
  try {
    assert.deepEqual(procedureSeeds.map(seed => seed.slug), [
      'arrival',
      'campus-network',
      'dorm-repair',
      'library-card-wechat',
      'transfer-archive-mailing'
    ])
    assert.ok(procedureSeeds.every(seed => seed.steps.length >= 4))
    assert.ok(procedureSeeds.every(seed => seed.sources.some(source => source.isPrimary)))
    assert.ok(procedureSeeds.every(seed => seed.body.length > 80))
    assert.equal(procedureSeeds.find(seed => seed.slug === 'transfer-archive-mailing')?.audience.join(','), 'transfer')

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
      wouldCreate: 5,
      wouldUpdate: 0,
      procedureCount: 5,
      stepCount: 23,
      materialCount: 4,
      applied: false
    })

    const first = seedProcedures({
      apply: true,
      databasePath: fixture.databasePath,
      now: Date.parse('2026-07-14T01:00:00+08:00')
    })
    assert.equal(first.created, 5)
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
    assert.deepEqual((steps as Array<{ stepOrder: number }>).map(step => step.stepOrder), [1, 2, 3, 4, 5, 6, 7])
    assert.equal((steps as Array<{ placeId: string | null }>).every(step => step.placeId === null), true)
    assert.equal((steps as Array<{ informationState: string }>).filter(
      step => step.informationState === 'awaiting-notice'
    ).length, 3)
    assert.deepEqual(
      (steps as Array<{ title: string, informationState: string }>).slice(-2).map(step => ({
        title: step.title,
        informationState: step.informationState
      })),
      [
        { title: '参加新生入学教育', informationState: 'confirmed' },
        { title: '按课表开始上课', informationState: 'confirmed' }
      ]
    )
    assert.equal((
      database.prepare(`
        SELECT count(*) AS count
        FROM procedure_materials
        WHERE procedure_id = (SELECT id FROM procedures WHERE slug = 'arrival')
      `).get() as { count: number }
    ).count, 0)
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
    assert.match(sourceClaims[0]!.claimScope, /9月7日至9日/)
    assert.match(sourceClaims[0]!.claimScope, /9月10日/)
    assert.equal(sourceClaims[0]!.isPrimary, 1)

    const workflowRows = database.prepare(`
      SELECT slug, status, information_state AS informationState, audience_json AS audienceJson
      FROM procedures
      ORDER BY slug
    `).all() as Array<{ slug: string, status: string, informationState: string, audienceJson: string }>
    assert.deepEqual(workflowRows.map(row => row.slug), [
      'arrival',
      'campus-network',
      'dorm-repair',
      'library-card-wechat',
      'transfer-archive-mailing'
    ])
    assert.ok(workflowRows.every(row => row.status === 'published'))
    assert.equal(
      workflowRows.find(row => row.slug === 'transfer-archive-mailing')?.audienceJson,
      '["transfer"]'
    )
    assert.equal(
      workflowRows.find(row => row.slug === 'campus-network')?.informationState,
      'partial'
    )
    assert.equal(
      workflowRows.find(row => row.slug === 'library-card-wechat')?.informationState,
      'confirmed'
    )

    const continuityRows = database.prepare(`
      SELECT procedure.slug, step.step_order AS stepOrder
      FROM procedure_steps AS step
      JOIN procedures AS procedure ON procedure.id = step.procedure_id
      ORDER BY procedure.slug, step.step_order
    `).all() as Array<{ slug: string, stepOrder: number }>
    for (const seed of procedureSeeds) {
      assert.deepEqual(
        continuityRows.filter(row => row.slug === seed.slug).map(row => row.stepOrder),
        seed.steps.map((_, index) => index + 1),
        `${seed.slug} steps must be continuous`
      )
    }
    const materialRows = database.prepare(`
      SELECT procedure.slug, material.name, material.is_required AS isRequired,
        material.information_state AS informationState
      FROM procedure_materials AS material
      JOIN procedures AS procedure ON procedure.id = material.procedure_id
      ORDER BY procedure.slug, material.item_order
    `).all() as Array<{ slug: string, name: string, isRequired: number | null, informationState: string }>
    assert.equal(materialRows.length, 4)
    assert.ok(materialRows.some(row => row.slug === 'dorm-repair' && row.name.includes('故障照片') && row.isRequired === 1))
    assert.ok(materialRows.some(row => row.slug === 'campus-network' && row.informationState === 'confirmed'))
    assert.ok(materialRows.some(row => row.slug === 'transfer-archive-mailing' && row.isRequired === 1))

    const sourceCounts = database.prepare(`
      SELECT procedure.slug, count(*) AS count, sum(relation.is_primary) AS primaryCount
      FROM procedure_sources AS relation
      JOIN procedures AS procedure ON procedure.id = relation.procedure_id
      GROUP BY procedure.slug
    `).all() as Array<{ slug: string, count: number, primaryCount: number }>
    assert.equal(sourceCounts.length, 5)
    assert.ok(sourceCounts.every(row => row.count >= 2 && row.primaryCount === 1))
    assert.deepEqual(database.pragma('foreign_key_check'), [])
    database.close()

    const rerun = seedProcedures({
      apply: true,
      databasePath: fixture.databasePath,
      now: Date.parse('2026-07-14T02:00:00+08:00')
    })
    assert.equal(rerun.created, 0)
    assert.equal(rerun.updated, 0)
    database = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal((database.prepare('SELECT count(*) AS count FROM procedures').get() as { count: number }).count, 5)
    assert.equal((database.prepare('SELECT count(*) AS count FROM procedure_steps').get() as { count: number }).count, 23)
    assert.equal((database.prepare('SELECT count(*) AS count FROM procedure_sources').get() as { count: number }).count, 15)
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
