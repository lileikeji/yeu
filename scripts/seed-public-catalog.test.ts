import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { buildCatalogSeed, runCli, seedPublicCatalog } from './seed-public-catalog'

function createDatabase(): { databasePath: string, cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-public-catalog-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  closeDatabase(databasePath)
  return {
    databasePath,
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

function count(database: InstanceType<typeof BetterSqlite3>, table: string): number {
  return (database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count
}

test('catalog definition keeps source-free guides as unverified drafts', () => {
  const catalog = buildCatalogSeed()
  assert.equal(catalog.contents.filter(content => content.kind === 'guide').length, 9)
  assert.equal(catalog.contents.filter(content => content.kind === 'department').length, 27)
  assert.equal(catalog.contents.filter(content => content.kind === 'club').length, 24)

  const draftGuides = catalog.contents
    .filter(content => content.kind === 'guide' && content.status === 'draft')
    .map(content => content.slug)
  assert.deepEqual(draftGuides, [])

  for (const content of catalog.contents) {
    if (content.status === 'published') {
      assert.ok(content.lastVerifiedAt)
      assert.ok(content.sourceUrls.length > 0)
    } else {
      assert.equal(content.lastVerifiedAt, null)
      assert.deepEqual(content.sourceUrls, [])
    }
  }
})

test('dry-run is read-only; apply writes readable metadata and valid publication evidence', () => {
  const fixture = createDatabase()
  let database: InstanceType<typeof BetterSqlite3> | null = null
  try {
    const catalog = buildCatalogSeed()
    const preview = seedPublicCatalog({ databasePath: fixture.databasePath })
    assert.deepEqual({
      mode: preview.mode,
      createdSources: preview.createdSources,
      wouldCreateSources: preview.wouldCreateSources,
      createdContents: preview.createdContents,
      wouldCreateContents: preview.wouldCreateContents,
      conflicts: preview.conflicts,
      applied: preview.applied
    }, {
      mode: 'dry-run',
      createdSources: 0,
      wouldCreateSources: catalog.sources.length,
      createdContents: 0,
      wouldCreateContents: 60,
      conflicts: 0,
      applied: false
    })

    const before = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal(count(before, 'sources'), 0)
    assert.equal(count(before, 'contents'), 0)
    before.close()

    const now = 1_789_000_000_000
    const applied = seedPublicCatalog({ apply: true, databasePath: fixture.databasePath, now })
    assert.deepEqual({
      createdSources: applied.createdSources,
      createdContents: applied.createdContents,
      publishedContents: applied.publishedContents,
      draftContents: applied.draftContents,
      conflicts: applied.conflicts,
      applied: applied.applied
    }, {
      createdSources: catalog.sources.length,
      createdContents: 60,
      publishedContents: 60,
      draftContents: 0,
      conflicts: 0,
      applied: true
    })

    database = new BetterSqlite3(fixture.databasePath, { readonly: true })
    database.pragma('foreign_keys = ON')
    assert.equal(count(database, 'sources'), catalog.sources.length)
    assert.equal(count(database, 'contents'), 60)

    const publicationViolations = database.prepare(`
      SELECT count(*) AS count
      FROM contents AS content
      WHERE content.status = 'published'
        AND (
          content.last_verified_at IS NULL
          OR content.published_at IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM content_sources AS relation
            JOIN sources AS source ON source.id = relation.source_id
            WHERE relation.content_id = content.id
              AND source.status = 'active'
          )
        )
    `).get() as { count: number }
    assert.equal(publicationViolations.count, 0)

    const guidePublicationViolations = database.prepare(`
      SELECT count(*) AS count
      FROM contents AS content
      WHERE content.slug IN ('express-delivery', 'nearby')
        AND (
          content.kind != 'guide'
          OR content.status != 'published'
          OR content.last_verified_at IS NULL
          OR content.published_at IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM content_sources AS relation
            JOIN sources AS source ON source.id = relation.source_id
            WHERE relation.content_id = content.id
              AND source.status = 'active'
          )
          OR NOT EXISTS (
            SELECT 1
            FROM content_sources AS relation
            JOIN sources AS source ON source.id = relation.source_id
            WHERE relation.content_id = content.id
              AND source.source_level = 'D'
              AND source.is_official = 0
              AND source.status = 'unavailable'
          )
        )
    `).get() as { count: number }
    assert.equal(guidePublicationViolations.count, 0)

    const guide = database.prepare(`
      SELECT category, audience, body, metadata_json AS metadataJson
      FROM contents
      WHERE kind = 'guide' AND slug = 'arrival'
    `).get() as { category: string, audience: string, body: string, metadataJson: string }
    assert.match(guide.body, /适用对象：本科新生、专升本新生/)
    assert.match(guide.body, /强时效事项以页面底部列出的官方来源/)
    const guideMetadata = JSON.parse(guide.metadataJson) as Record<string, unknown>
    assert.deepEqual({ category: guide.category, audience: guide.audience }, {
      category: 'arrival',
      audience: '本科新生、专升本新生'
    })
    for (const key of ['sections', 'shortTitle', 'icon', 'readMinutes', 'statusText', 'leadNotice', 'verificationState']) {
      assert.ok(key in guideMetadata, `Guide metadata is missing ${key}`)
    }

    const department = database.prepare(`
      SELECT body, metadata_json AS metadataJson
      FROM contents
      WHERE kind = 'department' AND slug = 'admissions-office'
    `).get() as { body: string, metadataJson: string }
    assert.match(department.body, /什么时候该看这里/)
    assert.match(department.body, /官网入口：https:\/\/zhaosheng\.yeu\.edu\.cn\//)
    assert.deepEqual(
      Object.fromEntries(Object.entries(JSON.parse(department.metadataJson) as Record<string, unknown>)
        .filter(([key]) => ['website', 'phone', 'email'].includes(key))),
      {
        website: 'https://zhaosheng.yeu.edu.cn/',
        phone: '0595-22091988 / 0595-22085622',
        email: 'yeu@yeu.edu.cn'
      }
    )
    const financeDepartment = database.prepare(`
      SELECT metadata_json AS metadataJson
      FROM contents
      WHERE kind = 'department' AND slug = 'finance-office'
    `).get() as { metadataJson: string }
    const financeMetadata = JSON.parse(financeDepartment.metadataJson) as Record<string, unknown>
    assert.deepEqual({
      website: financeMetadata.website,
      phone: financeMetadata.phone,
      email: financeMetadata.email
    }, {
      website: 'https://uf.yeu.edu.cn/',
      phone: '财务咨询：0595-22082010',
      email: null
    })

    const clubBodies = database.prepare(`
      SELECT title, body, metadata_json AS metadataJson
      FROM contents
      WHERE kind = 'club'
      ORDER BY title
    `).all() as Array<{ title: string, body: string, metadataJson: string }>
    assert.equal(clubBodies.length, 24)
    for (const club of clubBodies) {
      assert.ok(club.body.length > 260, `${club.title} body should be readable for freshmen`)
      assert.match(club.body, /招新时间、摆摊地点、报名二维码/)
      const metadata = JSON.parse(club.metadataJson) as Record<string, unknown>
      assert.equal(typeof metadata.group, 'string')
      assert.equal(typeof metadata.direction, 'string')
      assert.match(club.body, new RegExp(String(metadata.direction).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
  } finally {
    database?.close()
    fixture.cleanup()
  }
})

test('reruns are idempotent and preserve edits to seed-owned records', () => {
  const fixture = createDatabase()
  try {
    const first = seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`UPDATE contents SET title = ? WHERE kind = 'guide' AND slug = 'arrival'`)
      .run('人工校订后的报到标题')
    database.prepare(`UPDATE sources SET title = ? WHERE url = ?`)
      .run('人工校订后的招生来源标题', 'https://zhaosheng.yeu.edu.cn/')
    database.close()

    const rerun = seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    assert.deepEqual({
      createdSources: rerun.createdSources,
      skippedSources: rerun.skippedSources,
      createdContents: rerun.createdContents,
      skippedContents: rerun.skippedContents,
      conflicts: rerun.conflicts,
      applied: rerun.applied
    }, {
      createdSources: 0,
      skippedSources: first.sourceCount,
      createdContents: 0,
      skippedContents: first.contentCount,
      conflicts: 0,
      applied: true
    })

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal(
      (checked.prepare(`SELECT title FROM contents WHERE kind = 'guide' AND slug = 'arrival'`).get() as { title: string }).title,
      '人工校订后的报到标题'
    )
    assert.equal(
      (checked.prepare('SELECT title FROM sources WHERE url = ?').get('https://zhaosheng.yeu.edu.cn/') as { title: string }).title,
      '人工校订后的招生来源标题'
    )
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('a manual content collision stops the whole batch and makes the CLI fail', () => {
  const fixture = createDatabase()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`
      INSERT INTO contents (
        id, kind, slug, title, summary, body, metadata_json, is_featured,
        status, created_at, updated_at
      ) VALUES (?, 'guide', 'arrival', ?, ?, '', '{}', 0, 'draft', ?, ?)
    `).run('manual-content', '人工报到指南', '不得被种子覆盖', 1, 1)
    database.close()

    let stdout = ''
    let stderr = ''
    const exitCode = runCli(['--apply', '--database', fixture.databasePath], {
      stdout: (value) => {
        stdout += value
      },
      stderr: (value) => {
        stderr += value
      }
    })
    assert.equal(exitCode, 1)
    assert.equal(stderr, '')
    const result = JSON.parse(stdout) as { createdSources: number, createdContents: number, conflicts: number, applied: boolean }
    assert.deepEqual({
      createdSources: result.createdSources,
      createdContents: result.createdContents,
      conflicts: result.conflicts,
      applied: result.applied
    }, {
      createdSources: 0,
      createdContents: 0,
      conflicts: 1,
      applied: false
    })

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal(count(checked, 'sources'), 0)
    assert.equal(count(checked, 'contents'), 1)
    assert.equal(
      (checked.prepare(`SELECT title FROM contents WHERE id = 'manual-content'`).get() as { title: string }).title,
      '人工报到指南'
    )
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('a manual source URL collision stops every catalog write', () => {
  const fixture = createDatabase()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`
      INSERT INTO sources (
        id, title, url, platform, publisher_name, source_level, is_official,
        accessed_at, notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'A', 1, ?, ?, 'active', ?, ?)
    `).run(
      'manual-source',
      '人工维护的学校来源',
      'https://web.yeu.edu.cn/',
      '官网',
      '仰恩大学',
      Date.parse('2026-07-13T00:00:00.000Z'),
      '人工备注',
      1,
      1
    )
    database.close()

    const result = seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    assert.equal(result.applied, false)
    assert.equal(result.createdSources, 0)
    assert.equal(result.createdContents, 0)
    assert.equal(result.conflicts, 1)
    assert.equal(result.conflictDetails[0]?.entityType, 'source')

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal(count(checked, 'sources'), 1)
    assert.equal(count(checked, 'contents'), 0)
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('a seed-owned source made unavailable is preserved and blocks reruns', () => {
  const fixture = createDatabase()
  try {
    seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`UPDATE sources SET status = 'unavailable' WHERE url = ?`)
      .run('https://zhaosheng.yeu.edu.cn/')
    database.close()

    const result = seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    assert.equal(result.applied, false)
    assert.equal(result.createdSources, 0)
    assert.equal(result.createdContents, 0)
    assert.equal(result.conflicts, 1)
    assert.match(result.conflictDetails[0]?.reason ?? '', /catalog source constraints/)

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal(
      (checked.prepare('SELECT status FROM sources WHERE url = ?').get('https://zhaosheng.yeu.edu.cn/') as { status: string }).status,
      'unavailable'
    )
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('source URL identity drift blocks duplicate creation', () => {
  const fixture = createDatabase()
  try {
    const first = seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`UPDATE sources SET url = ? WHERE url = ?`)
      .run('https://zhaosheng.yeu.edu.cn/manual-location', 'https://zhaosheng.yeu.edu.cn/')
    database.close()

    const result = seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    assert.equal(result.applied, false)
    assert.equal(result.createdSources, 0)
    assert.equal(result.createdContents, 0)
    assert.ok(result.conflictDetails.some(conflict => /identity drifted/.test(conflict.reason)))

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal(count(checked, 'sources'), first.sourceCount)
    assert.equal(count(checked, 'contents'), first.contentCount)
    assert.equal(
      (checked.prepare('SELECT count(*) AS count FROM sources WHERE url = ?').get('https://zhaosheng.yeu.edu.cn/') as { count: number }).count,
      0
    )
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('content identity drift blocks duplicate creation', () => {
  const fixture = createDatabase()
  try {
    const first = seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`UPDATE contents SET slug = 'arrival-manual' WHERE kind = 'guide' AND slug = 'arrival'`).run()
    database.close()

    const result = seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    assert.equal(result.applied, false)
    assert.equal(result.createdSources, 0)
    assert.equal(result.createdContents, 0)
    assert.ok(result.conflictDetails.some(conflict => /identity drifted/.test(conflict.reason)))

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal(count(checked, 'contents'), first.contentCount)
    assert.equal(
      (checked.prepare(`SELECT count(*) AS count FROM contents WHERE kind = 'guide' AND slug = 'arrival'`).get() as { count: number }).count,
      0
    )
    checked.close()
  } finally {
    fixture.cleanup()
  }
})

test('missing source relationships on seed-owned content block reruns', () => {
  const fixture = createDatabase()
  try {
    seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    const database = new BetterSqlite3(fixture.databasePath)
    database.prepare(`
      DELETE FROM content_sources
      WHERE content_id = (
        SELECT id FROM contents WHERE kind = 'guide' AND slug = 'arrival'
      )
    `).run()
    database.close()

    const result = seedPublicCatalog({ apply: true, databasePath: fixture.databasePath })
    assert.equal(result.applied, false)
    assert.equal(result.createdSources, 0)
    assert.equal(result.createdContents, 0)
    assert.ok(result.conflictDetails.some(conflict => /source relationships drifted/.test(conflict.reason)))

    const checked = new BetterSqlite3(fixture.databasePath, { readonly: true })
    assert.equal(
      (checked.prepare(`
        SELECT count(*) AS count
        FROM content_sources
        WHERE content_id = (
          SELECT id FROM contents WHERE kind = 'guide' AND slug = 'arrival'
        )
      `).get() as { count: number }).count,
      0
    )
    checked.close()
  } finally {
    fixture.cleanup()
  }
})
