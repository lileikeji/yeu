import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import BetterSqlite3 from 'better-sqlite3'
import { closeDatabase, getDatabase } from '../server/database/client'
import { initializeAdmin } from '../server/database/admin-bootstrap'
import { runMigrations } from '../server/database/migrate'
import { importAmapDrafts } from './import-amap-drafts'
import { seedPublicCatalog } from './seed-public-catalog'
import { seedProcedures } from './seed-procedures'
import { syncAmapOwnerCoordinates } from './sync-amap-owner-coordinates'
import { runCli, verifyLiveDataParity } from './verify-live-data-parity'

const RAW_PATH = resolve('data/imports/amap-workmap-2026-07-13.raw.json')
const COORDINATE_PATH = resolve('data/imports/amap-workmap-2026-07-13.coordinates.owner-map.json')
const ADMIN_USERNAME = 'parity-admin'
const ADMIN_PASSWORD = 'synthetic-parity-pass-12'
const NOW = Date.parse('2026-07-15T10:00:00+08:00')

interface Fixture {
  databasePath: string
  cleanup: () => void
}

async function createVerifiedFixture(): Promise<Fixture> {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-live-data-parity-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  await initializeAdmin(client, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    force: true
  })

  assert.equal(seedPublicCatalog({ apply: true, databasePath, now: NOW }).conflicts, 0)
  assert.equal(seedProcedures({ apply: true, databasePath, now: NOW }).updated >= 0, true)
  assert.equal(importAmapDrafts({ apply: true, databasePath, inputPath: RAW_PATH, now: NOW }).created, 76)
  assert.equal(syncAmapOwnerCoordinates({
    apply: true,
    databasePath,
    coordinatePath: COORDINATE_PATH,
    rawPath: RAW_PATH,
    now: NOW
  }).updated, 76)

  return {
    databasePath,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

test('live data parity verifier accepts a fully seeded current SQLite database', async () => {
  const fixture = await createVerifiedFixture()
  try {
    const result = await verifyLiveDataParity({
      databasePath: fixture.databasePath,
      adminUsername: ADMIN_USERNAME,
      adminPassword: ADMIN_PASSWORD
    })

    assert.equal(result.ok, true)
    assert.deepEqual(result.counts, {
      sources: 98,
      activeSources: 91,
      unavailableSources: 7,
      publishedContents: 58,
      procedures: 5,
      procedureSteps: 23,
      amapDraftPlaces: 76
    })
    assert.deepEqual(result.admin, {
      username: ADMIN_USERNAME,
      passwordVerified: true
    })
    assert.deepEqual(result.failures, [])
  } finally {
    fixture.cleanup()
  }
})

test('live data parity verifier detects public content and AMap coordinate or category drift', async () => {
  const fixture = await createVerifiedFixture()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    try {
      database.prepare(`
        UPDATE contents
        SET summary = summary || ' 漂移'
        WHERE kind = 'department' AND slug = 'admissions-office'
      `).run()
      database.prepare(`
        UPDATE places
        SET longitude = longitude + 0.001,
            category = 'campus-building'
        WHERE source_raw_ref LIKE '%"sourceRow":49%'
      `).run()
    } finally {
      database.close()
    }

    const result = await verifyLiveDataParity({ databasePath: fixture.databasePath })
    assert.equal(result.ok, false)
    assert.ok(result.failures.some(failure =>
      failure.scope === 'contents' && failure.message.includes('department:admissions-office summary drifted')
    ))
    assert.ok(result.failures.some(failure =>
      failure.scope === 'places' && failure.message.includes('辽宁楼 longitude drifted')
    ))
    assert.ok(result.failures.some(failure =>
      failure.scope === 'places' && failure.message.includes('辽宁楼 category drifted')
    ))
  } finally {
    fixture.cleanup()
  }
})

test('live data parity verifier detects content and procedure source relation drift', async () => {
  const fixture = await createVerifiedFixture()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    try {
      database.prepare(`
        DELETE FROM content_sources
        WHERE content_id = (
          SELECT id FROM contents
          WHERE kind = 'guide' AND slug = 'arrival'
        )
        AND source_id = (
          SELECT id FROM sources
          WHERE url = 'https://bgs.yeu.edu.cn/2026/0710/c1102a57503/page.htm'
        )
      `).run()
      database.prepare(`
        UPDATE procedure_sources
        SET claim_scope = '漂移后的来源说明'
        WHERE procedure_id = (
          SELECT id FROM procedures WHERE slug = 'arrival'
        )
        AND sort_order = 1
      `).run()
    } finally {
      database.close()
    }

    const result = await verifyLiveDataParity({ databasePath: fixture.databasePath })
    assert.equal(result.ok, false)
    assert.ok(result.failures.some(failure =>
      failure.scope === 'contents' && failure.message.includes('guide:arrival source links drifted')
    ))
    assert.ok(result.failures.some(failure =>
      failure.scope === 'procedures' && failure.message.includes('arrival source links drifted')
    ))
  } finally {
    fixture.cleanup()
  }
})

test('live data parity verifier detects source title and URL drift', async () => {
  const fixture = await createVerifiedFixture()
  try {
    const database = new BetterSqlite3(fixture.databasePath)
    try {
      database.prepare(`
        UPDATE sources
        SET title = ''
        WHERE url = 'https://zhaosheng.yeu.edu.cn/'
      `).run()
      database.prepare(`
        UPDATE sources
        SET url = 'ftp://example.invalid/source'
        WHERE url = 'https://web.yeu.edu.cn/'
      `).run()
    } finally {
      database.close()
    }

    const result = await verifyLiveDataParity({ databasePath: fixture.databasePath })
    assert.equal(result.ok, false)
    assert.ok(result.failures.some(failure =>
      failure.scope === 'sources' && failure.message.includes('has empty title')
    ))
    assert.ok(result.failures.some(failure =>
      failure.scope === 'sources' && failure.message.includes('Missing source')
    ))
    assert.ok(result.failures.some(failure =>
      failure.scope === 'sources' && failure.message.includes('invalid URL')
    ))
  } finally {
    fixture.cleanup()
  }
})

test('live data parity verifier reports admin password failure without exposing hashes', async () => {
  const fixture = await createVerifiedFixture()
  try {
    const result = await verifyLiveDataParity({
      databasePath: fixture.databasePath,
      adminUsername: ADMIN_USERNAME,
      adminPassword: 'wrong-password'
    })

    assert.equal(result.ok, false)
    assert.deepEqual(result.admin, {
      username: ADMIN_USERNAME,
      passwordVerified: false
    })
    assert.ok(result.failures.some(failure =>
      failure.scope === 'admin' && failure.message.includes('password verification failed')
    ))
    assert.doesNotMatch(JSON.stringify(result), /scrypt:/)
  } finally {
    fixture.cleanup()
  }
})

test('live data parity CLI returns non-zero for missing database and supports help', async () => {
  let stdout = ''
  let stderr = ''
  assert.equal(await runCli(['--database', join(tmpdir(), 'missing-yeu-live-data.sqlite')], {
    stdout: (value) => { stdout += value },
    stderr: (value) => { stderr += value }
  }), 1)
  assert.equal(stderr, '')
  assert.match(stdout, /Database does not exist/)

  stdout = ''
  stderr = ''
  assert.equal(await runCli(['--help'], {
    stdout: (value) => { stdout += value },
    stderr: (value) => { stderr += value }
  }), 0)
  assert.equal(stderr, '')
  assert.match(stdout, /Usage: pnpm data:verify/)
})
