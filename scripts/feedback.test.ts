import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { H3Event } from 'h3'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  assertPublicFeedbackTarget,
  createFeedback
} from '../server/modules/feedback/service'
import { createFeedbackSchema } from '../shared/schemas/server'

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

Object.defineProperty(globalThis, 'useRuntimeConfig', {
  configurable: true,
  value: () => ({
    adminSessionSecret: 'feedback-test-secret-at-least-32-bytes-long',
    public: { siteUrl: 'https://guide.example.test' }
  })
})

const IDS = {
  publicPlace: '11111111-1111-4111-8111-111111111111',
  draftPlace: '11111111-1111-4111-8111-111111111112',
  publicContent: '22222222-2222-4222-8222-222222222221',
  draftContent: '22222222-2222-4222-8222-222222222222',
  publicProcedure: '33333333-3333-4333-8333-333333333331',
  draftProcedure: '33333333-3333-4333-8333-333333333332',
  futureProcedure: '33333333-3333-4333-8333-333333333333',
  expiredProcedure: '33333333-3333-4333-8333-333333333334'
} as const

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-feedback-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = Date.now()

  const insertPlace = client.sqlite.prepare(`
    INSERT INTO places (
      id, slug, name, summary, body, scope, type, coordinate_verification,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, 'Summary', '', 'campus', 'building', 'missing', ?, ?, ?)
  `)
  insertPlace.run(IDS.publicPlace, 'public-place', 'Public place', 'published', now, now)
  insertPlace.run(IDS.draftPlace, 'draft-place', 'Draft place', 'draft', now, now)

  const insertContent = client.sqlite.prepare(`
    INSERT INTO contents (
      id, kind, slug, title, summary, body, metadata_json, status, created_at, updated_at
    ) VALUES (?, 'guide', ?, ?, 'Summary', '', '{}', ?, ?, ?)
  `)
  insertContent.run(IDS.publicContent, 'public-content', 'Public content', 'published', now, now)
  insertContent.run(IDS.draftContent, 'draft-content', 'Draft content', 'draft', now, now)

  const insertProcedure = client.sqlite.prepare(`
    INSERT INTO procedures (
      id, slug, title, summary, audience_json, method, information_state,
      status_text, status, valid_from, valid_until, created_at, updated_at
    ) VALUES (?, ?, ?, 'Summary', '["undergraduate"]', 'mixed', 'partial',
      'Status', ?, ?, ?, ?, ?)
  `)
  insertProcedure.run(
    IDS.publicProcedure,
    'public-procedure',
    'Public procedure',
    'published',
    null,
    null,
    now,
    now
  )
  insertProcedure.run(
    IDS.draftProcedure,
    'draft-procedure',
    'Draft procedure',
    'draft',
    null,
    null,
    now,
    now
  )
  insertProcedure.run(
    IDS.futureProcedure,
    'future-procedure',
    'Future procedure',
    'published',
    now + 60_000,
    null,
    now,
    now
  )
  insertProcedure.run(
    IDS.expiredProcedure,
    'expired-procedure',
    'Expired procedure',
    'published',
    null,
    now - 60_000,
    now,
    now
  )

  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function feedbackInput(targetType: 'place' | 'content' | 'procedure', targetId: string) {
  return createFeedbackSchema.parse({
    targetType,
    targetId,
    reasonType: 'content_outdated',
    message: 'The published information needs verification.',
    evidenceUrl: null,
    pageUrl: '/procedures/arrival?audience=transfer#step-1',
    contact: null
  })
}

function assertInvalidTarget(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    const value = error as TestHttpError
    return value.statusCode === 422 && value.data?.code === 'INVALID_FEEDBACK_TARGET'
  })
}

test('feedback schema accepts procedure context and rejects external page URLs', () => {
  assert.equal(feedbackInput('procedure', IDS.publicProcedure).targetType, 'procedure')

  for (const pageUrl of [
    'https://example.com/procedures/arrival',
    '//example.com/procedures/arrival',
    '/\\example.com/procedures/arrival',
    '/\t/example.com/procedures/arrival',
    '/\n/example.com/procedures/arrival',
    '/\r/example.com/procedures/arrival'
  ]) {
    const parsed = createFeedbackSchema.safeParse({
      ...feedbackInput('procedure', IDS.publicProcedure),
      pageUrl
    })
    assert.equal(parsed.success, false, pageUrl)
  }
})

test('public feedback targets accept public records and reject draft or inactive records', () => {
  const fixture = createFixture()
  try {
    for (const [targetType, targetId] of [
      ['place', IDS.publicPlace],
      ['content', IDS.publicContent],
      ['procedure', IDS.publicProcedure]
    ] as const) {
      assert.doesNotThrow(() => assertPublicFeedbackTarget(
        fixture.client,
        feedbackInput(targetType, targetId)
      ))
    }

    for (const [targetType, targetId] of [
      ['place', IDS.draftPlace],
      ['content', IDS.draftContent],
      ['procedure', IDS.draftProcedure],
      ['procedure', IDS.futureProcedure],
      ['procedure', IDS.expiredProcedure]
    ] as const) {
      assertInvalidTarget(() => assertPublicFeedbackTarget(
        fixture.client,
        feedbackInput(targetType, targetId)
      ))
    }
  } finally {
    fixture.cleanup()
  }
})

test('created feedback stores and serializes the structured page context', () => {
  const fixture = createFixture()
  try {
    const created = createFeedback(
      {} as H3Event,
      fixture.client,
      feedbackInput('procedure', IDS.publicProcedure),
      '127.0.0.1'
    )
    assert.equal(created.targetType, 'procedure')
    assert.equal(created.pageUrl, '/procedures/arrival?audience=transfer#step-1')
    assert.equal(
      fixture.client.sqlite.prepare('SELECT page_url FROM feedback WHERE id = ?')
        .pluck().get(created.id),
      '/procedures/arrival?audience=transfer#step-1'
    )
  } finally {
    fixture.cleanup()
  }
})
