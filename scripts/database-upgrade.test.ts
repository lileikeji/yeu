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

test('0004 adds nullable idempotency keys and preserves coordinate review history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-coordinate-idempotency-migration-'))
  const sqlite = new BetterSqlite3(join(directory, 'coordinate-idempotency.sqlite'))

  try {
    sqlite.pragma('foreign_keys = ON')
    const database = drizzle(sqlite)
    migrate(database, { migrationsFolder: createMigrationSet(directory, 4) })

    const now = Date.now()
    sqlite.prepare(`
      INSERT INTO admin_users (
        id, username, password_hash, display_name, is_active, created_at, updated_at
      ) VALUES ('migration-reviewer', 'migration-reviewer', 'fixture-hash',
        'Migration reviewer', 1, ?, ?)
    `).run(now, now)
    sqlite.prepare(`
      INSERT INTO places (
        id, slug, name, summary, body, scope, type, coordinate_verification,
        status, created_at, updated_at
      ) VALUES ('migration-place', 'migration-place', 'Migration place', 'Summary', '',
        'campus', 'building', 'missing', 'draft', ?, ?)
    `).run(now, now)
    sqlite.prepare(`
      INSERT INTO place_coordinate_observations (
        id, place_id, longitude, latitude, coordinate_system, accuracy_meters,
        sample_count, samples_json, capture_method, point_role, captured_at,
        evidence_note, review_status, reviewed_by, reviewed_at, review_note,
        created_at, updated_at
      ) VALUES ('legacy-observation', 'migration-place', 118.605, 25.112, 'WGS84',
        5, 1, '[]', 'authorized-import', 'main-entrance', ?, 'Legacy evidence',
        'approved', 'migration-reviewer', ?, 'Original approval evidence', ?, ?)
    `).run(now, now, now, now)

    migrate(database, { migrationsFolder: createMigrationSet(directory, 5) })

    const legacy = sqlite.prepare(`
      SELECT client_observation_id AS clientObservationId,
        superseded_by_observation_id AS supersededByObservationId,
        review_status AS reviewStatus, reviewed_by AS reviewedBy,
        reviewed_at AS reviewedAt, review_note AS reviewNote
      FROM place_coordinate_observations WHERE id = 'legacy-observation'
    `).get()
    assert.deepEqual(legacy, {
      clientObservationId: null,
      supersededByObservationId: null,
      reviewStatus: 'approved',
      reviewedBy: 'migration-reviewer',
      reviewedAt: now,
      reviewNote: 'Original approval evidence'
    })

    sqlite.prepare(`
      INSERT INTO place_coordinate_observations (
        id, client_observation_id, place_id, longitude, latitude, coordinate_system,
        accuracy_meters, sample_count, samples_json, capture_method, point_role,
        captured_at, evidence_note, review_status, created_at, updated_at
      ) VALUES (?, ?, 'migration-place', 118.605, 25.112, 'WGS84', 5, 1, '[]',
        'authorized-import', 'main-entrance', ?, 'Migration fixture', 'pending', ?, ?)
    `).run('second-null-observation', null, now, now, now)
    sqlite.prepare(`
      INSERT INTO place_coordinate_observations (
        id, client_observation_id, place_id, longitude, latitude, coordinate_system,
        accuracy_meters, sample_count, samples_json, capture_method, point_role,
        captured_at, evidence_note, review_status, created_at, updated_at
      ) VALUES (?, ?, 'migration-place', 118.605, 25.112, 'WGS84', 5, 1, '[]',
        'authorized-import', 'main-entrance', ?, 'Migration fixture', 'pending', ?, ?)
    `).run('replacement-observation', 'client-observation-key', now, now, now)

    assert.equal((sqlite.prepare(`
      SELECT count(*) AS count FROM place_coordinate_observations
      WHERE client_observation_id IS NULL
    `).get() as { count: number }).count, 2)
    assert.throws(() => sqlite.prepare(`
      INSERT INTO place_coordinate_observations (
        id, client_observation_id, place_id, longitude, latitude, coordinate_system,
        accuracy_meters, sample_count, samples_json, capture_method, point_role,
        captured_at, evidence_note, review_status, created_at, updated_at
      ) VALUES ('duplicate-client-id', 'client-observation-key', 'migration-place',
        118.605, 25.112, 'WGS84', 5, 1, '[]', 'authorized-import', 'main-entrance',
        ?, 'Duplicate fixture', 'pending', ?, ?)
    `).run(now, now, now), /UNIQUE constraint failed/)

    sqlite.prepare(`
      UPDATE place_coordinate_observations
      SET review_status = 'superseded', superseded_by_observation_id = 'replacement-observation'
      WHERE id = 'legacy-observation'
    `).run()
    sqlite.prepare(`
      DELETE FROM place_coordinate_observations WHERE id = 'replacement-observation'
    `).run()
    const retainedReview = sqlite.prepare(`
      SELECT superseded_by_observation_id AS supersededByObservationId,
        reviewed_by AS reviewedBy, reviewed_at AS reviewedAt, review_note AS reviewNote
      FROM place_coordinate_observations WHERE id = 'legacy-observation'
    `).get()
    assert.deepEqual(retainedReview, {
      supersededByObservationId: null,
      reviewedBy: 'migration-reviewer',
      reviewedAt: now,
      reviewNote: 'Original approval evidence'
    })
    assert.deepEqual(sqlite.pragma('foreign_key_check'), [])
  } finally {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('0005 persists point roles and downgrades legacy single-evidence verification', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-coordinate-role-migration-'))
  const sqlite = new BetterSqlite3(join(directory, 'coordinate-role.sqlite'))

  try {
    sqlite.pragma('foreign_keys = ON')
    const database = drizzle(sqlite)
    migrate(database, { migrationsFolder: createMigrationSet(directory, 5) })
    const now = Date.now()
    sqlite.prepare(`
      INSERT INTO admin_users (
        id, username, password_hash, display_name, is_active, created_at, updated_at
      ) VALUES ('role-reviewer', 'role-reviewer', 'fixture-hash',
        'Role reviewer', 1, ?, ?)
    `).run(now, now)
    sqlite.prepare(`
      INSERT INTO places (
        id, slug, name, summary, body, scope, type, longitude, latitude,
        coordinate_system, coordinate_verification, coordinate_verified_at,
        external_map_url, status, created_at, updated_at
      ) VALUES ('role-place', 'role-place', 'Role place', 'Summary', '', 'campus',
        'building', 118.605, 25.112, 'WGS84', 'verified', ?,
        'https://example.test/navigation', 'draft', ?, ?)
    `).run(now, now, now)
    sqlite.prepare(`
      INSERT INTO place_coordinate_observations (
        id, client_observation_id, place_id, longitude, latitude, coordinate_system,
        accuracy_meters, sample_count, samples_json, capture_method, point_role,
        captured_at, evidence_note, review_status, reviewed_by, reviewed_at,
        review_note, created_at, updated_at
      ) VALUES ('role-observation', 'role-client-id', 'role-place', 118.605, 25.112,
        'WGS84', 5, 1, '[]', 'authorized-import', 'main-entrance', ?,
        'Legacy single evidence', 'approved', 'role-reviewer', ?,
        'Legacy approval history', ?, ?)
    `).run(now, now, now, now)

    migrate(database, { migrationsFolder: createMigrationSet(directory, 6) })

    const place = sqlite.prepare(`
      SELECT coordinate_point_role AS coordinatePointRole,
        coordinate_verification AS coordinateVerification,
        coordinate_verified_at AS coordinateVerifiedAt,
        external_map_url AS externalMapUrl
      FROM places WHERE id = 'role-place'
    `).get()
    assert.deepEqual(place, {
      coordinatePointRole: 'main-entrance',
      coordinateVerification: 'unverified',
      coordinateVerifiedAt: null,
      externalMapUrl: 'https://example.test/navigation'
    })
    const evidence = sqlite.prepare(`
      SELECT review_status AS reviewStatus, reviewed_by AS reviewedBy,
        reviewed_at AS reviewedAt, review_note AS reviewNote
      FROM place_coordinate_observations WHERE id = 'role-observation'
    `).get()
    assert.deepEqual(evidence, {
      reviewStatus: 'approved',
      reviewedBy: 'role-reviewer',
      reviewedAt: now,
      reviewNote: 'Legacy approval history'
    })
    assert.deepEqual(sqlite.pragma('foreign_key_check'), [])
  } finally {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('0006 preserves feedback, adds page context, and accepts procedure targets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-feedback-context-migration-'))
  const sqlite = new BetterSqlite3(join(directory, 'feedback-context.sqlite'))

  try {
    sqlite.pragma('foreign_keys = ON')
    const database = drizzle(sqlite)
    migrate(database, { migrationsFolder: createMigrationSet(directory, 6) })
    const createdAt = Date.now() - 60_000
    const resolvedAt = Date.now() - 30_000
    const updatedAt = Date.now()

    sqlite.prepare(`
      INSERT INTO admin_users (
        id, username, password_hash, display_name, is_active, created_at, updated_at
      ) VALUES ('feedback-reviewer', 'feedback-reviewer', 'fixture-hash',
        'Feedback reviewer', 1, ?, ?)
    `).run(createdAt, createdAt)
    sqlite.prepare(`
      INSERT INTO feedback (
        id, target_type, target_id, reason_type, message, evidence_url, contact,
        status, resolution_note, submitter_ip_hash, resolved_by, resolved_at,
        created_at, updated_at
      ) VALUES (
        'legacy-feedback', 'content', 'legacy-content', 'content_outdated',
        'Legacy feedback message', 'https://example.edu/evidence', 'student@example.test',
        'resolved', 'Verified and corrected', 'legacy-ip-hash', 'feedback-reviewer', ?, ?, ?
      )
    `).run(resolvedAt, createdAt, updatedAt)

    migrate(database, { migrationsFolder: createMigrationSet(directory, 7) })

    const legacy = sqlite.prepare(`
      SELECT id, target_type AS targetType, target_id AS targetId,
        reason_type AS reasonType, message, evidence_url AS evidenceUrl,
        page_url AS pageUrl, contact, status, resolution_note AS resolutionNote,
        submitter_ip_hash AS submitterIpHash, resolved_by AS resolvedBy,
        resolved_at AS resolvedAt, created_at AS createdAt, updated_at AS updatedAt
      FROM feedback WHERE id = 'legacy-feedback'
    `).get()
    assert.deepEqual(legacy, {
      id: 'legacy-feedback',
      targetType: 'content',
      targetId: 'legacy-content',
      reasonType: 'content_outdated',
      message: 'Legacy feedback message',
      evidenceUrl: 'https://example.edu/evidence',
      pageUrl: null,
      contact: 'student@example.test',
      status: 'resolved',
      resolutionNote: 'Verified and corrected',
      submitterIpHash: 'legacy-ip-hash',
      resolvedBy: 'feedback-reviewer',
      resolvedAt,
      createdAt,
      updatedAt
    })

    sqlite.prepare(`
      INSERT INTO feedback (
        id, target_type, target_id, reason_type, message, page_url,
        status, created_at, updated_at
      ) VALUES (
        'procedure-feedback', 'procedure', 'procedure-target', 'procedure_error',
        'Procedure feedback message', '/procedures/arrival?audience=transfer',
        'new', ?, ?
      )
    `).run(updatedAt, updatedAt)
    assert.equal(
      sqlite.prepare('SELECT page_url FROM feedback WHERE id = ?')
        .pluck().get('procedure-feedback'),
      '/procedures/arrival?audience=transfer'
    )

    assert.throws(() => sqlite.prepare(`
      INSERT INTO feedback (
        id, target_type, target_id, reason_type, message, status, created_at, updated_at
      ) VALUES ('invalid-target-type', 'unknown', 'target', 'other',
        'Invalid target type', 'new', ?, ?)
    `).run(updatedAt, updatedAt), /feedback_target_type_check/)
    assert.throws(() => sqlite.prepare(`
      INSERT INTO feedback (
        id, target_type, target_id, reason_type, message, status, created_at, updated_at
      ) VALUES ('invalid-general-target', 'general', 'unexpected', 'other',
        'Invalid general target', 'new', ?, ?)
    `).run(updatedAt, updatedAt), /feedback_target_id_check/)
    assert.throws(() => sqlite.prepare(`
      INSERT INTO feedback (
        id, target_type, target_id, reason_type, message, resolved_by,
        status, created_at, updated_at
      ) VALUES ('invalid-reviewer', 'procedure', 'procedure-target', 'other',
        'Invalid reviewer', 'missing-admin', 'new', ?, ?)
    `).run(updatedAt, updatedAt), /FOREIGN KEY constraint failed/)

    const indexes = sqlite.pragma('index_list(feedback)') as Array<{ name: string }>
    assert.deepEqual(
      indexes.map(index => index.name).filter(name => name.startsWith('feedback_')).sort(),
      ['feedback_status_created_idx', 'feedback_target_idx']
    )
    assert.equal(sqlite.pragma('foreign_keys', { simple: true }), 1)
    assert.deepEqual(sqlite.pragma('foreign_key_check'), [])
  } finally {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('0007 creates rate_limit_buckets for shared rate limiting', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-rate-limit-migration-'))
  const sqlite = new BetterSqlite3(join(directory, 'rate-limit.sqlite'))

  try {
    sqlite.pragma('foreign_keys = ON')
    const database = drizzle(sqlite)
    migrate(database, { migrationsFolder: createMigrationSet(directory, 7) })

    assert.equal(
      sqlite.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'rate_limit_buckets'
      `).get(),
      undefined
    )

    migrate(database, { migrationsFolder: createMigrationSet(directory, 8) })

    const table = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'rate_limit_buckets'
    `).get() as { name: string } | undefined
    assert.equal(table?.name, 'rate_limit_buckets')

    const columns = sqlite.prepare(`PRAGMA table_info(rate_limit_buckets)`).all() as Array<{ name: string }>
    assert.deepEqual(
      columns.map(column => column.name).sort(),
      ['bucket_key', 'hit_count', 'reset_at']
    )

    const indexes = sqlite.pragma('index_list(rate_limit_buckets)') as Array<{ name: string }>
    assert.ok(indexes.some(index => index.name === 'rate_limit_buckets_reset_idx'))

    sqlite.prepare(`
      INSERT INTO rate_limit_buckets (bucket_key, hit_count, reset_at)
      VALUES ('probe', 1, ?)
    `).run(Date.now() + 60_000)
    assert.equal(
      sqlite.prepare('SELECT hit_count FROM rate_limit_buckets WHERE bucket_key = ?')
        .pluck().get('probe'),
      1
    )
  } finally {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
