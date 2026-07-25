import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  FRONTEND_FEATURE_DEFINITIONS,
  FRONTEND_FEATURE_KEYS
} from '../shared/config/frontend-features'
import { adminUsers } from '../server/database/schema'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  getPublicFrontendFeatures,
  listFrontendFeatures,
  updateFrontendFeature
} from '../server/modules/features/service'
import {
  buildHomeEssentialActions,
  homeMoreEntries,
  homeTimelineStages
} from '../app/utils/home-presentation'

const pageSource = readFileSync(resolve('app/pages/index.vue'), 'utf8')
const adminPageSource = readFileSync(resolve('app/pages/admin/features.vue'), 'utf8')
const adminApiSource = readFileSync(resolve('server/api/admin/features.put.ts'), 'utf8')

test('frontend feature catalog covers every configurable home card with unique keys', () => {
  assert.equal(new Set(FRONTEND_FEATURE_KEYS).size, FRONTEND_FEATURE_KEYS.length)
  assert.equal(FRONTEND_FEATURE_DEFINITIONS.length, 19)

  const catalogKeys = new Set<string>(FRONTEND_FEATURE_KEYS)
  const homeKeys = [
    ...buildHomeEssentialActions([]).map(item => item.featureKey),
    ...homeTimelineStages.map(item => item.featureKey),
    ...homeMoreEntries.map(item => item.featureKey)
  ]
  for (const key of homeKeys) assert.equal(catalogKeys.has(key), true, `Missing ${key}`)

  assert.match(pageSource, /usePublicFrontendFeatures\(\)/)
  assert.match(pageSource, /featureEnabled\('home\.arrival-summary'\)/)
  assert.match(pageSource, /featureEnabled\('home\.featured-procedures'\)/)
  assert.match(pageSource, /featureEnabled\('home\.emergency-contact'\)/)
  assert.match(pageSource, /\.filter\(action => featureEnabled\(action\.featureKey\)\)/)
})

test('feature settings default to visible and persist individual admin changes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-frontend-features-'))
  const databasePath = join(directory, 'features.sqlite')
  const client = getDatabase(databasePath)

  try {
    runMigrations(client)
    const now = Date.now()
    client.db.insert(adminUsers).values({
      id: 'feature-admin',
      username: 'feature-admin',
      passwordHash: 'fixture-password-hash',
      displayName: 'Feature admin',
      isActive: true,
      createdAt: now,
      updatedAt: now
    }).run()

    const initial = listFrontendFeatures(client)
    assert.equal(initial.length, FRONTEND_FEATURE_DEFINITIONS.length)
    assert.equal(initial.every(item => item.enabled), true)
    assert.deepEqual(getPublicFrontendFeatures(client).disabledKeys, [])

    const disabled = updateFrontendFeature(client, {
      key: 'home.more.clubs',
      enabled: false,
      adminId: 'feature-admin'
    })
    assert.equal(disabled.enabled, false)
    assert.ok(disabled.updatedAt)
    assert.deepEqual(getPublicFrontendFeatures(client).disabledKeys, ['home.more.clubs'])

    const enabled = updateFrontendFeature(client, {
      key: 'home.more.clubs',
      enabled: true,
      adminId: 'feature-admin'
    })
    assert.equal(enabled.enabled, true)
    assert.deepEqual(getPublicFrontendFeatures(client).disabledKeys, [])
    assert.deepEqual(client.sqlite.pragma('foreign_key_check'), [])
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('admin feature controls are guarded, audited, and use binary switches', () => {
  assert.match(adminPageSource, /adminFetch<\{ items: ApiFrontendFeature\[\] \}>\('\/api\/admin\/features'\)/)
  assert.match(adminPageSource, /<USwitch/)
  assert.match(adminPageSource, /@update:model-value="setFeatureEnabled\(feature, \$event\)"/)
  assert.match(adminApiSource, /useAdminRequest\(event\)/)
  assert.match(adminApiSource, /writeAudit\(client, event/)
  assert.match(adminApiSource, /frontend-feature\.disable/)
})
