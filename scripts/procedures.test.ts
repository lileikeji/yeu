import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  archiveProcedure,
  createProcedure,
  getPublicProcedure,
  listProcedures,
  publishProcedure,
  updateProcedure
} from '../server/modules/procedures/service'
import { updateSource } from '../server/modules/verification/service'
import { createProcedureSchema, updateProcedureSchema } from '../shared/schemas/server'

interface TestHttpError extends Error {
  statusCode?: number
  data?: { code?: string }
}

Object.defineProperty(globalThis, 'createError', {
  configurable: true,
  value: (input: { statusCode?: number, statusMessage?: string, data?: { code?: string } }) => {
    const error = new Error(input.statusMessage) as TestHttpError
    error.statusCode = input.statusCode
    error.data = input.data
    return error
  }
})

const SOURCE_ID = 'd828afce-247d-45ad-90d8-83f18182f221'
const DEPARTMENT_ID = '9b783dfa-fc07-41ec-8ae0-e35d138514cf'
const GUIDE_ID = '3532da30-a943-4af8-b4d3-b40343719278'

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-procedures-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = Date.now() - 60_000
  client.sqlite.prepare(`
    INSERT INTO sources (
      id, title, url, platform, publisher_name, source_level, is_official,
      accessed_at, status, created_at, updated_at
    ) VALUES (?, 'Official source', 'https://example.edu/procedure', 'official-site',
      'Example University', 'A', 1, ?, 'active', ?, ?)
  `).run(SOURCE_ID, now, now, now)
  client.sqlite.prepare(`
    INSERT INTO contents (
      id, kind, slug, title, summary, body, metadata_json, status,
      last_verified_at, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'Summary', '', ?, 'published', ?, ?, ?, ?)
  `).run(
    DEPARTMENT_ID,
    'department',
    'admissions-office',
    'Admissions',
    JSON.stringify({ website: 'https://example.edu/admissions' }),
    now,
    now,
    now,
    now
  )
  client.sqlite.prepare(`
    INSERT INTO contents (
      id, kind, slug, title, summary, body, metadata_json, status,
      last_verified_at, published_at, created_at, updated_at
    ) VALUES (?, 'guide', 'arrival-guide', 'Arrival guide', 'Summary', '', '{}',
      'published', ?, ?, ?, ?)
  `).run(GUIDE_ID, now, now, now, now)
  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function procedureInput(slug = 'arrival') {
  const now = Date.now()
  return createProcedureSchema.parse({
    slug,
    title: 'Arrival procedure',
    summary: 'Confirmed date with pending individual details',
    category: 'arrival',
    method: 'mixed',
    informationState: 'partial',
    statusText: 'Date confirmed; details pending',
    validUntil: new Date(now + 86_400_000).toISOString(),
    lastVerifiedAt: new Date(now - 60_000).toISOString(),
    departmentId: DEPARTMENT_ID,
    guideId: GUIDE_ID,
    sourceIds: [SOURCE_ID],
    steps: [
      {
        title: 'Check notice',
        description: 'Use the official notice.',
        informationState: 'confirmed'
      },
      {
        title: 'Confirm assigned location',
        description: 'Wait for the current notice.',
        informationState: 'awaiting-notice'
      }
    ]
  })
}

function assertHttpError(action: () => unknown, code: string, statusCode = 422): void {
  assert.throws(action, (error: unknown) => {
    const value = error as TestHttpError
    return value.statusCode === statusCode && value.data?.code === code
  })
}

test('procedure writes continuous steps, publishes with evidence, and stays maintainable', () => {
  const fixture = createFixture()
  try {
    const created = createProcedure(fixture.client, procedureInput())
    assert.equal(created.status, 'draft')
    assert.deepEqual(created.steps.map(step => step.order), [1, 2])
    assert.equal(created.department?.slug, 'admissions-office')
    assert.equal(created.relatedGuide?.slug, 'arrival-guide')
    fixture.client.sqlite.prepare(`
      UPDATE procedure_sources
      SET claim_scope = 'Confirmed registration date', is_primary = 1
      WHERE procedure_id = ? AND source_id = ?
    `).run(created.id, SOURCE_ID)

    const updated = updateProcedure(fixture.client, created.id, updateProcedureSchema.parse({
      sourceIds: [SOURCE_ID],
      steps: [
        { title: 'First', informationState: 'confirmed' },
        { title: 'Second', informationState: 'partial' },
        { title: 'Third', informationState: 'awaiting-notice' }
      ],
      materials: [{
        name: 'Current notice material list',
        description: 'Contents remain pending.',
        informationState: 'awaiting-notice',
        departmentId: DEPARTMENT_ID
      }]
    }))
    assert.deepEqual(updated.steps.map(step => step.order), [1, 2, 3])
    assert.deepEqual(updated.materials.map(material => material.order), [1])
    assert.equal(updated.materials[0]?.isRequired, null)
    assert.deepEqual(fixture.client.sqlite.prepare(`
      SELECT claim_scope AS claimScope, is_primary AS isPrimary
      FROM procedure_sources WHERE procedure_id = ? AND source_id = ?
    `).get(created.id, SOURCE_ID), {
      claimScope: 'Confirmed registration date',
      isPrimary: 1
    })

    const published = publishProcedure(fixture.client, created.id)
    assert.equal(published.status, 'published')
    assert.deepEqual(
      listProcedures(fixture.client, { page: 1, pageSize: 20 }, true).items.map(item => item.slug),
      ['arrival']
    )
    assert.equal(getPublicProcedure(fixture.client, 'arrival').steps.length, 3)
    assert.deepEqual(
      listProcedures(fixture.client, { page: 1, pageSize: 20, q: 'Third' }, true)
        .items.map(item => item.slug),
      ['arrival']
    )
    assert.deepEqual(
      listProcedures(fixture.client, { page: 1, pageSize: 20, q: 'material list' }, true)
        .items.map(item => item.slug),
      ['arrival']
    )
    assertHttpError(
      () => updateSource(fixture.client, SOURCE_ID, { status: 'unavailable' }),
      'SOURCE_REQUIRED_BY_PUBLISHED_RECORDS'
    )

    archiveProcedure(fixture.client, created.id)
    assertHttpError(() => getPublicProcedure(fixture.client, 'arrival'), 'PROCEDURE_NOT_PUBLIC', 404)
  } finally {
    fixture.cleanup()
  }
})

test('public procedure list and detail fail closed for drafts, future, and expired records', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    const insert = fixture.client.sqlite.prepare(`
      INSERT INTO procedures (
        id, slug, title, summary, audience_json, method, information_state,
        status_text, status, valid_from, valid_until, created_at, updated_at
      ) VALUES (?, ?, ?, 'Summary', '["undergraduate"]', 'mixed', 'partial',
        'Status', ?, ?, ?, ?, ?)
    `)
    insert.run('active-procedure', 'active-procedure', 'Active', 'published', null, now + 60_000, now, now)
    insert.run('draft-procedure', 'draft-procedure', 'Draft', 'draft', null, now + 60_000, now, now)
    insert.run('future-procedure', 'future-procedure', 'Future', 'published', now + 60_000, null, now, now)
    insert.run('expired-procedure', 'expired-procedure', 'Expired', 'published', null, now - 60_000, now, now)

    const result = listProcedures(fixture.client, { page: 1, pageSize: 20 }, true)
    assert.equal(result.total, 1)
    assert.deepEqual(result.items.map(item => item.slug), ['active-procedure'])
    assert.equal(getPublicProcedure(fixture.client, 'active-procedure').slug, 'active-procedure')
    for (const slug of ['draft-procedure', 'future-procedure', 'expired-procedure']) {
      assertHttpError(() => getPublicProcedure(fixture.client, slug), 'PROCEDURE_NOT_PUBLIC', 404)
    }
  } finally {
    fixture.cleanup()
  }
})

test('publishing rejects a gap introduced outside the ordered editing API', () => {
  const fixture = createFixture()
  try {
    const created = createProcedure(fixture.client, procedureInput('broken-order'))
    fixture.client.sqlite.prepare(`
      UPDATE procedure_steps SET step_order = 3
      WHERE procedure_id = ? AND step_order = 2
    `).run(created.id)
    assertHttpError(() => publishProcedure(fixture.client, created.id), 'PROCEDURE_STEPS_INVALID')
  } finally {
    fixture.cleanup()
  }
})
