import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { searchPublishedContent } from '../server/modules/search/service'
import { searchQuerySchema } from '../shared/schemas/server'

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-public-search-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function insertContent(
  client: DatabaseClient,
  id: string,
  title: string,
  summary: string,
  updatedAt: number,
  status: 'draft' | 'published' = 'published',
  kind: 'guide' | 'department' | 'club' | 'notice' = 'guide',
  metadata: Record<string, unknown> = {}
): void {
  client.sqlite.prepare(`
    INSERT INTO contents (
      id, kind, slug, title, summary, body, metadata_json, is_featured,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, '', ?, 0, ?, ?, ?)
  `).run(id, kind, id, title, summary, JSON.stringify(metadata), status, updatedAt, updatedAt)
}

function insertPlace(
  client: DatabaseClient,
  id: string,
  name: string,
  summary: string,
  updatedAt: number
): void {
  client.sqlite.prepare(`
    INSERT INTO places (
      id, slug, name, summary, body, scope, type, coordinate_verification,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, '', 'campus', 'building', 'missing', 'published', ?, ?)
  `).run(id, id, name, summary, updatedAt, updatedAt)
}

function insertProcedure(
  client: DatabaseClient,
  id: string,
  options: {
    status?: 'draft' | 'published' | 'archived'
    validFrom?: number | null
    validUntil?: number | null
    stepText?: string
    materialText?: string
  } = {}
): void {
  const now = Date.now()
  client.sqlite.prepare(`
    INSERT INTO procedures (
      id, slug, title, summary, body, audience_json, method, information_state,
      status_text, status, valid_from, valid_until, created_at, updated_at
    ) VALUES (?, ?, ?, 'Structured freshman task', '', '["undergraduate","transfer"]',
      'mixed', 'partial', 'Details pending', ?, ?, ?, ?, ?)
  `).run(
    id,
    id,
    `Procedure ${id}`,
    options.status ?? 'published',
    options.validFrom ?? null,
    options.validUntil ?? null,
    now,
    now
  )
  if (options.stepText) {
    client.sqlite.prepare(`
      INSERT INTO procedure_steps (
        id, procedure_id, step_order, title, description, audience_json,
        information_state, created_at, updated_at
      ) VALUES (?, ?, 1, ?, '', '["undergraduate","transfer"]', 'confirmed', ?, ?)
    `).run(`${id}-step`, id, options.stepText, now, now)
  }
  if (options.materialText) {
    client.sqlite.prepare(`
      INSERT INTO procedure_materials (
        id, procedure_id, item_order, name, description, audience_json,
        information_state, created_at, updated_at
      ) VALUES (?, ?, 1, ?, '', '["undergraduate","transfer"]', 'confirmed', ?, ?)
    `).run(`${id}-material`, id, options.materialText, now, now)
  }
}

test('punctuation-only search terms do not match the full catalog', () => {
  const fixture = createFixture()
  try {
    insertContent(fixture.client, 'guide-one', '校园网', '网络办理说明', Date.now())
    assert.deepEqual(searchPublishedContent(fixture.client, ' %_% ', 20), {
      query: ' %_% ',
      type: null,
      items: [],
      total: 0,
      hasManagedContent: true,
      managedKinds: ['guide']
    })
  } finally {
    fixture.cleanup()
  }
})

test('a single Chinese character is a valid search term', () => {
  const fixture = createFixture()
  try {
    insertContent(fixture.client, 'network-guide', '校园网使用指南', '网络服务说明', Date.now())

    const result = searchPublishedContent(fixture.client, '网', 20)
    assert.equal(result.hasManagedContent, true)
    assert.deepEqual(result.items.map(item => item.id), ['network-guide'])
    assert.equal(searchQuerySchema.parse({ q: '网' }).q, '网')
  } finally {
    fixture.cleanup()
  }
})

test('notice validity is applied before the result limit', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    insertContent(
      fixture.client,
      'expired-notice',
      '新生报到旧公告',
      '已经失效',
      now + 1,
      'published',
      'notice',
      { validUntil: new Date(now - 60_000).toISOString() }
    )
    insertContent(
      fixture.client,
      'active-notice',
      '新生报到当前公告',
      '仍然有效',
      now,
      'published',
      'notice',
      { validUntil: new Date(now + 60_000).toISOString() }
    )
    insertContent(
      fixture.client,
      'future-notice',
      '新生报到未来公告',
      '尚未生效',
      now + 2,
      'published',
      'notice',
      { validFrom: new Date(now + 60_000).toISOString() }
    )

    const result = searchPublishedContent(fixture.client, '报到', 1)
    assert.deepEqual(result.items.map(item => item.id), ['active-notice'])
  } finally {
    fixture.cleanup()
  }
})

test('an empty database reports that static content has not been taken over', () => {
  const fixture = createFixture()
  try {
    assert.deepEqual(searchPublishedContent(fixture.client, '网', 20), {
      query: '网',
      type: null,
      items: [],
      total: 0,
      hasManagedContent: false,
      managedKinds: []
    })
  } finally {
    fixture.cleanup()
  }
})

test('search type query accepts only public result types', () => {
  for (const type of ['place', 'procedure', 'guide', 'department', 'club', 'notice']) {
    assert.equal(searchQuerySchema.parse({ q: '新生', type }).type, type)
  }

  assert.equal(searchQuerySchema.parse({ q: '新生' }).type, undefined)
  assert.throws(() => searchQuerySchema.parse({ q: '新生', type: 'content' }))
  assert.throws(() => searchQuerySchema.parse({ q: '新生', type: 'all' }))
})

test('type filtering happens before result totals and limits are applied', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    insertPlace(fixture.client, 'shared-place', 'Shared place', 'Shared location', now + 10)
    insertProcedure(fixture.client, 'shared-procedure')
    insertContent(fixture.client, 'shared-guide-old', 'Shared guide old', 'Shared guide', now, 'published', 'guide')
    insertContent(fixture.client, 'shared-guide-new', 'Shared guide new', 'Shared guide', now + 1, 'published', 'guide')
    insertContent(fixture.client, 'shared-department', 'Shared department', 'Shared office', now + 2, 'published', 'department')
    insertContent(fixture.client, 'shared-club', 'Shared club', 'Shared student club', now + 3, 'published', 'club')
    insertContent(fixture.client, 'shared-notice', 'Shared notice', 'Shared announcement', now + 20, 'published', 'notice')

    const guideResult = searchPublishedContent(fixture.client, 'Shared', 1, 'guide')
    assert.equal(guideResult.type, 'guide')
    assert.equal(guideResult.total, 2)
    assert.equal(guideResult.items.length, 1)
    assert.ok(guideResult.items.every(item => item.resultType === 'guide' && item.kind === 'guide'))

    const placeResult = searchPublishedContent(fixture.client, 'Shared', 1, 'place')
    assert.equal(placeResult.total, 1)
    assert.deepEqual(placeResult.items.map(item => item.resultType), ['place'])

    const procedureResult = searchPublishedContent(fixture.client, 'Shared', 1, 'procedure')
    assert.equal(procedureResult.total, 1)
    assert.deepEqual(procedureResult.items.map(item => item.resultType), ['procedure'])

    for (const type of ['department', 'club', 'notice'] as const) {
      const result = searchPublishedContent(fixture.client, 'Shared', 1, type)
      assert.equal(result.total, 1)
      assert.deepEqual(result.items.map(item => item.resultType), [type])
    }

    const allResultTypes = new Set(
      searchPublishedContent(fixture.client, 'Shared', 20).items.map(item => item.resultType)
    )
    assert.deepEqual(
      [...allResultTypes].sort(),
      ['place', 'procedure', 'guide', 'department', 'club', 'notice'].sort()
    )
  } finally {
    fixture.cleanup()
  }
})

test('one entity type can fill the requested result limit and drafts stay private', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    for (let index = 0; index < 8; index += 1) {
      insertContent(fixture.client, `guide-${index}`, `新生指南 ${index}`, '新生常用事项', now + index)
    }
    insertContent(fixture.client, 'draft-guide', '新生内部草稿', '不应公开', now + 100, 'draft')

    const result = searchPublishedContent(fixture.client, '新生', 6)
    assert.equal(result.items.length, 6)
    assert.equal(result.total, 8)
    assert.equal(result.items.some(item => item.id === 'draft-guide'), false)
  } finally {
    fixture.cleanup()
  }
})

test('exact titles rank ahead of newer title and summary matches', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    insertContent(fixture.client, 'summary-match', '网络服务', '校园网办理说明', now + 3)
    insertContent(fixture.client, 'title-match', '校园网使用指南', '连接说明', now + 2)
    insertContent(fixture.client, 'exact-match', '校园网', '官方入口', now)

    const result = searchPublishedContent(fixture.client, '校园网', 1)
    assert.deepEqual(result.items.map(item => item.id), ['exact-match'])
  } finally {
    fixture.cleanup()
  }
})

test('guide section metadata participates in public search', () => {
  const fixture = createFixture()
  try {
    insertContent(
      fixture.client,
      'network-metadata',
      '校园卡与校园网',
      '官方服务入口',
      Date.now(),
      'published',
      'guide',
      {
        sections: [{ title: '校外访问', items: ['使用 VPN 访问校内资源'] }],
        catalogSeed: { importer: 'public-catalog-seed', identity: 'guide:network-metadata' }
      }
    )

    assert.deepEqual(
      searchPublishedContent(fixture.client, 'VPN', 20).items.map(item => item.id),
      ['network-metadata']
    )
    assert.deepEqual(searchPublishedContent(fixture.client, 'public-catalog-seed', 20).items, [])
  } finally {
    fixture.cleanup()
  }
})

test('procedure steps and materials are searchable only while the procedure is public', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    insertProcedure(fixture.client, 'active-step-procedure', { stepText: '核对个人报到时段' })
    insertProcedure(fixture.client, 'active-material-procedure', { materialText: '录取材料清单' })
    insertProcedure(fixture.client, 'draft-step-procedure', {
      status: 'draft',
      stepText: '内部报到时段'
    })
    insertProcedure(fixture.client, 'expired-material-procedure', {
      validUntil: now - 60_000,
      materialText: '过期录取材料'
    })
    insertProcedure(fixture.client, 'future-step-procedure', {
      validFrom: now + 60_000,
      stepText: '未来个人时段'
    })

    const stepResult = searchPublishedContent(fixture.client, '个人报到时段', 20)
    assert.deepEqual(stepResult.items.map(item => [item.entityType, item.id]), [
      ['procedure', 'active-step-procedure']
    ])
    const materialResult = searchPublishedContent(fixture.client, '录取材料', 20)
    assert.deepEqual(materialResult.items.map(item => [item.entityType, item.id]), [
      ['procedure', 'active-material-procedure']
    ])
    assert.deepEqual(searchPublishedContent(fixture.client, '内部报到时段', 20).items, [])
    assert.deepEqual(searchPublishedContent(fixture.client, '过期录取材料', 20).items, [])
    assert.deepEqual(searchPublishedContent(fixture.client, '未来个人时段', 20).items, [])
  } finally {
    fixture.cleanup()
  }
})
