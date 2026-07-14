import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  getPublicContent,
  listContent,
  publishContent,
  updateContent
} from '../server/modules/content/service'
import { publishPlace, updatePlace } from '../server/modules/places/service'
import { updateSource } from '../server/modules/verification/service'

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

const VERIFIED_AT = Date.now() - 60_000

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-publishing-invariants-'))
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

function insertSource(
  client: DatabaseClient,
  id: string,
  options: {
    level?: 'A' | 'B' | 'C' | 'D' | 'E'
    official?: boolean
    status?: 'active' | 'unavailable' | 'disputed'
  } = {}
): void {
  client.sqlite.prepare(`
    INSERT INTO sources (
      id, title, url, platform, publisher_name, source_level, is_official,
      accessed_at, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'fixture', 'Fixture publisher', ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    `Source ${id}`,
    `https://example.edu/${id}`,
    options.level ?? 'A',
    options.official === false ? 0 : 1,
    VERIFIED_AT,
    options.status ?? 'active',
    VERIFIED_AT,
    VERIFIED_AT
  )
}

function insertContent(
  client: DatabaseClient,
  id: string,
  sourceIds: string[],
  status: 'draft' | 'published' = 'draft',
  kind: 'guide' | 'department' | 'club' | 'notice' = 'guide',
  metadata: Record<string, unknown> = {}
): void {
  client.sqlite.prepare(`
    INSERT INTO contents (
      id, kind, slug, title, summary, body, metadata_json, is_featured,
      status, last_verified_at, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'Fixture summary', '', ?, 0, ?, ?, ?, ?, ?)
  `).run(
    id,
    kind,
    id,
    `Content ${id}`,
    JSON.stringify(metadata),
    status,
    VERIFIED_AT,
    status === 'published' ? VERIFIED_AT : null,
    VERIFIED_AT,
    VERIFIED_AT
  )
  const attach = client.sqlite.prepare(`
    INSERT INTO content_sources (content_id, source_id, is_primary, created_at)
    VALUES (?, ?, ?, ?)
  `)
  sourceIds.forEach((sourceId, index) => attach.run(id, sourceId, index === 0 ? 1 : 0, VERIFIED_AT))
}

function insertPlace(
  client: DatabaseClient,
  id: string,
  sourceIds: string[],
  coordinate: {
    longitude: number | null
    latitude: number | null
    system: 'WGS84' | 'GCJ-02' | 'BD-09' | null
    verification: 'missing' | 'unverified' | 'verified' | 'rejected'
    verifiedAt: number | null
  },
  status: 'draft' | 'published' = 'draft',
  scope: 'campus' | 'nearby' = 'campus'
): void {
  client.sqlite.prepare(`
    INSERT INTO places (
      id, slug, name, summary, body, scope, type, longitude, latitude,
      coordinate_system, coordinate_verification, coordinate_verified_at,
      status, last_verified_at, published_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, 'Fixture summary', '', ?, 'building', ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    id,
    id,
    `Place ${id}`,
    scope,
    coordinate.longitude,
    coordinate.latitude,
    coordinate.system,
    coordinate.verification,
    coordinate.verifiedAt,
    status,
    VERIFIED_AT,
    status === 'published' ? VERIFIED_AT : null,
    VERIFIED_AT,
    VERIFIED_AT
  )
  const attach = client.sqlite.prepare(`
    INSERT INTO place_sources (place_id, source_id, is_primary, created_at)
    VALUES (?, ?, ?, ?)
  `)
  sourceIds.forEach((sourceId, index) => attach.run(id, sourceId, index === 0 ? 1 : 0, VERIFIED_AT))
}

function assertHttpError(action: () => unknown, code: string, statusCode = 422): void {
  assert.throws(action, (error: unknown) => {
    const value = error as TestHttpError
    return value.statusCode === statusCode && value.data?.code === code
  })
}

test('managed draft content disables static fallback without becoming public', () => {
  const fixture = createFixture()
  try {
    const empty = listContent(fixture.client, { page: 1, pageSize: 20 }, true, 'guide')
    assert.equal(empty.hasManagedRecords, false)
    assert.deepEqual(empty.managedKinds, [])
    assertHttpError(
      () => getPublicContent(fixture.client, 'unmanaged-static-guide', 'guide'),
      'CONTENT_CATALOG_UNMANAGED',
      404
    )

    insertContent(fixture.client, 'managed-draft', [], 'draft')
    const managed = listContent(fixture.client, { page: 1, pageSize: 20 }, true, 'guide')
    assert.equal(managed.hasManagedRecords, true)
    assert.deepEqual(managed.managedKinds, ['guide'])
    assert.deepEqual(managed.items, [])

    assertHttpError(
      () => getPublicContent(fixture.client, 'managed-draft', 'guide'),
      'CONTENT_NOT_PUBLIC',
      404
    )
  } finally {
    fixture.cleanup()
  }
})

test('partial metadata updates preserve unsubmitted structured guide fields', () => {
  const fixture = createFixture()
  try {
    const sections = [{
      title: '报到步骤',
      icon: 'i-lucide-list-checks',
      items: ['核对官方通知']
    }]
    insertContent(fixture.client, 'metadata-preservation', [], 'draft', 'guide', {
      sections,
      leadNotice: '以当年官方通知为准',
      statusText: '部分信息待通知',
      readMinutes: 4
    })

    const updated = updateContent(fixture.client, 'metadata-preservation', {
      metadata: { readMinutes: 6 }
    })

    assert.deepEqual(updated.metadata, {
      sections,
      leadNotice: '以当年官方通知为准',
      statusText: '部分信息待通知',
      readMinutes: 6
    })
  } finally {
    fixture.cleanup()
  }
})

test('public content lists and details enforce notice validity windows', () => {
  const fixture = createFixture()
  try {
    const now = Date.now()
    insertContent(fixture.client, 'regular-guide', [], 'published')
    insertContent(
      fixture.client,
      'active-notice',
      [],
      'published',
      'notice',
      {
        validFrom: new Date(now - 60_000).toISOString(),
        validUntil: new Date(now + 60_000).toISOString()
      }
    )
    insertContent(
      fixture.client,
      'expired-notice',
      [],
      'published',
      'notice',
      { validUntil: new Date(now - 60_000).toISOString() }
    )
    insertContent(
      fixture.client,
      'future-notice',
      [],
      'published',
      'notice',
      { validFrom: new Date(now + 60_000).toISOString() }
    )
    insertContent(
      fixture.client,
      'invalid-window-notice',
      [],
      'published',
      'notice',
      { validUntil: 'not-a-date' }
    )

    const result = listContent(fixture.client, { page: 1, pageSize: 20 }, true)
    assert.deepEqual(result.items.map(item => item.id).sort(), ['active-notice', 'regular-guide'])
    assert.equal(result.total, 2)
    assert.deepEqual(result.managedKinds, ['guide', 'notice'])

    for (const slug of ['expired-notice', 'future-notice', 'invalid-window-notice']) {
      assertHttpError(
        () => getPublicContent(fixture.client, slug),
        'CONTENT_NOT_PUBLIC',
        404
      )
    }
  } finally {
    fixture.cleanup()
  }
})

test('disputed low-confidence evidence cannot publish content', () => {
  const fixture = createFixture()
  try {
    insertSource(fixture.client, 'source-e-disputed', { level: 'E', official: false, status: 'disputed' })
    insertContent(fixture.client, 'content-with-weak-source', ['source-e-disputed'])

    assertHttpError(
      () => publishContent(fixture.client, 'content-with-weak-source'),
      'PUBLISH_REQUIREMENTS_NOT_MET'
    )
  } finally {
    fixture.cleanup()
  }
})

test('missing, unverified, and GCJ-02 coordinates cannot publish a place', () => {
  const fixture = createFixture()
  try {
    insertSource(fixture.client, 'source-c', { level: 'C', official: false })
    insertPlace(fixture.client, 'place-missing', ['source-c'], {
      longitude: null,
      latitude: null,
      system: null,
      verification: 'missing',
      verifiedAt: null
    })
    insertPlace(fixture.client, 'place-unverified', ['source-c'], {
      longitude: 118.605,
      latitude: 25.112,
      system: 'WGS84',
      verification: 'unverified',
      verifiedAt: null
    })
    insertPlace(fixture.client, 'place-gcj02', ['source-c'], {
      longitude: 118.605,
      latitude: 25.112,
      system: 'GCJ-02',
      verification: 'verified',
      verifiedAt: VERIFIED_AT
    })

    for (const id of ['place-missing', 'place-unverified', 'place-gcj02']) {
      assertHttpError(() => publishPlace(fixture.client, id), 'PUBLISH_REQUIREMENTS_NOT_MET')
    }
  } finally {
    fixture.cleanup()
  }
})

test('active authoritative evidence and verified WGS84 coordinates can publish', () => {
  const fixture = createFixture()
  try {
    insertSource(fixture.client, 'source-b-official', { level: 'B', official: true })
    insertContent(fixture.client, 'publishable-content', ['source-b-official'])
    insertPlace(fixture.client, 'publishable-place', ['source-b-official'], {
      longitude: 118.605,
      latitude: 25.112,
      system: 'WGS84',
      verification: 'verified',
      verifiedAt: VERIFIED_AT
    })

    assert.equal(publishContent(fixture.client, 'publishable-content').status, 'published')
    assert.equal(publishPlace(fixture.client, 'publishable-place').status, 'published')
  } finally {
    fixture.cleanup()
  }
})

test('campus coordinates must be in the review bounds while nearby places may be outside', () => {
  const fixture = createFixture()
  try {
    insertSource(fixture.client, 'source-campus-bounds', { level: 'C', official: false })
    const outsideCampus = {
      longitude: 118.605,
      latitude: 25.151,
      system: 'WGS84' as const,
      verification: 'verified' as const,
      verifiedAt: VERIFIED_AT
    }
    insertPlace(fixture.client, 'outside-campus-place', ['source-campus-bounds'], outsideCampus)
    insertPlace(
      fixture.client,
      'outside-nearby-place',
      ['source-campus-bounds'],
      outsideCampus,
      'draft',
      'nearby'
    )

    assertHttpError(
      () => publishPlace(fixture.client, 'outside-campus-place'),
      'PUBLISH_REQUIREMENTS_NOT_MET'
    )
    const rejectedCampus = fixture.client.sqlite.prepare(`
      SELECT status, published_at AS publishedAt
      FROM places
      WHERE id = 'outside-campus-place'
    `).get() as { status: string, publishedAt: number | null }
    assert.deepEqual(rejectedCampus, { status: 'draft', publishedAt: null })

    assert.equal(publishPlace(fixture.client, 'outside-nearby-place').status, 'published')
  } finally {
    fixture.cleanup()
  }
})

test('changing draft coordinates clears prior verification', () => {
  const fixture = createFixture()
  try {
    insertSource(fixture.client, 'source-coordinate-change')
    insertPlace(fixture.client, 'moved-draft-place', ['source-coordinate-change'], {
      longitude: 118.605,
      latitude: 25.112,
      system: 'WGS84',
      verification: 'verified',
      verifiedAt: VERIFIED_AT
    })
    insertPlace(fixture.client, 'cleared-draft-place', ['source-coordinate-change'], {
      longitude: 118.605,
      latitude: 25.112,
      system: 'WGS84',
      verification: 'verified',
      verifiedAt: VERIFIED_AT
    })
    fixture.client.sqlite.prepare(`
      UPDATE places
      SET coordinate_point_role = 'main-entrance',
        external_map_url = 'https://example.test/old-navigation'
      WHERE id IN ('moved-draft-place', 'cleared-draft-place')
    `).run()

    const moved = updatePlace(fixture.client, 'moved-draft-place', { longitude: 118.606 })
    assert.equal(moved.longitude, 118.606)
    assert.equal(moved.coordinateVerification, 'unverified')
    assert.equal(moved.coordinateVerifiedAt, null)
    assert.equal(moved.coordinatePointRole, null)
    assert.equal(moved.externalMapUrl, null)

    const cleared = updatePlace(fixture.client, 'cleared-draft-place', {
      longitude: null,
      latitude: null,
      coordinateSystem: null
    })
    assert.equal(cleared.longitude, null)
    assert.equal(cleared.latitude, null)
    assert.equal(cleared.coordinateSystem, null)
    assert.equal(cleared.coordinateVerification, 'missing')
    assert.equal(cleared.coordinateVerifiedAt, null)
    assert.equal(cleared.coordinatePointRole, null)
    assert.equal(cleared.externalMapUrl, null)
  } finally {
    fixture.cleanup()
  }
})

test('coordinate changes require a separate verification step and failed updates are atomic', () => {
  const fixture = createFixture()
  try {
    insertSource(fixture.client, 'source-published-coordinate')
    insertPlace(fixture.client, 'published-coordinate-place', ['source-published-coordinate'], {
      longitude: 118.605,
      latitude: 25.112,
      system: 'WGS84',
      verification: 'verified',
      verifiedAt: VERIFIED_AT
    }, 'published')

    const readCoordinateState = () => fixture.client.sqlite.prepare(`
      SELECT longitude, latitude, coordinate_system AS coordinateSystem,
        coordinate_verification AS coordinateVerification,
        coordinate_verified_at AS coordinateVerifiedAt,
        status, published_at AS publishedAt, updated_at AS updatedAt
      FROM places
      WHERE id = 'published-coordinate-place'
    `).get()
    const original = readCoordinateState()

    assertHttpError(
      () => updatePlace(fixture.client, 'published-coordinate-place', { longitude: 118.606 }),
      'PUBLISH_REQUIREMENTS_NOT_MET'
    )
    assert.deepEqual(readCoordinateState(), original)

    assertHttpError(
      () => updatePlace(fixture.client, 'published-coordinate-place', {
        longitude: 118.606,
        coordinateVerification: 'verified',
        coordinateVerifiedAt: new Date(VERIFIED_AT + 1_000).toISOString()
      }),
      'COORDINATE_REVERIFICATION_REQUIRED'
    )
    assert.deepEqual(readCoordinateState(), original)
  } finally {
    fixture.cleanup()
  }
})

test('published records cannot lose their only evidence or verification', () => {
  const fixture = createFixture()
  try {
    insertSource(fixture.client, 'source-a-official')
    insertContent(fixture.client, 'published-content', ['source-a-official'], 'published')
    insertPlace(fixture.client, 'published-place', ['source-a-official'], {
      longitude: 118.605,
      latitude: 25.112,
      system: 'WGS84',
      verification: 'verified',
      verifiedAt: VERIFIED_AT
    }, 'published')

    assertHttpError(
      () => updateContent(fixture.client, 'published-content', { sourceIds: [] }),
      'PUBLISH_REQUIREMENTS_NOT_MET'
    )
    assertHttpError(
      () => updateContent(fixture.client, 'published-content', { lastVerifiedAt: null }),
      'PUBLISH_REQUIREMENTS_NOT_MET'
    )
    assertHttpError(
      () => updatePlace(fixture.client, 'published-place', { sourceIds: [] }),
      'PUBLISH_REQUIREMENTS_NOT_MET'
    )
    assertHttpError(
      () => updatePlace(fixture.client, 'published-place', { lastVerifiedAt: null }),
      'PUBLISH_REQUIREMENTS_NOT_MET'
    )
    assertHttpError(
      () => updatePlace(fixture.client, 'published-place', {
        longitude: null,
        latitude: null,
        coordinateSystem: null,
        coordinateVerification: 'missing',
        coordinateVerifiedAt: null
      }),
      'PUBLISH_REQUIREMENTS_NOT_MET'
    )
  } finally {
    fixture.cleanup()
  }
})

test('a required source can only be disabled after an effective alternative is attached', () => {
  const fixture = createFixture()
  try {
    insertSource(fixture.client, 'source-required')
    insertSource(fixture.client, 'source-alternative', { level: 'C', official: false })
    insertContent(fixture.client, 'source-dependent-content', ['source-required'], 'published')
    insertPlace(fixture.client, 'source-dependent-place', ['source-required'], {
      longitude: 118.605,
      latitude: 25.112,
      system: 'WGS84',
      verification: 'verified',
      verifiedAt: VERIFIED_AT
    }, 'published')

    assertHttpError(
      () => updateSource(fixture.client, 'source-required', { status: 'disputed' }),
      'SOURCE_REQUIRED_BY_PUBLISHED_RECORDS'
    )

    fixture.client.sqlite.prepare(`
      INSERT INTO content_sources (content_id, source_id, is_primary, created_at)
      VALUES ('source-dependent-content', 'source-alternative', 0, ?)
    `).run(VERIFIED_AT)
    fixture.client.sqlite.prepare(`
      INSERT INTO place_sources (place_id, source_id, is_primary, created_at)
      VALUES ('source-dependent-place', 'source-alternative', 0, ?)
    `).run(VERIFIED_AT)

    const updated = updateSource(fixture.client, 'source-required', { status: 'unavailable' })
    assert.equal(updated.status, 'unavailable')
  } finally {
    fixture.cleanup()
  }
})
