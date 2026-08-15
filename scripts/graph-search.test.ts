import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  expandClaimsFromEntities,
  extractEntityIdsFromQuery,
  retrieveGraphEvidence
} from '../server/modules/assistant/graph-search'

const DAY_MS = 24 * 60 * 60 * 1000

function seedGraph(client: { sqlite: { prepare(s: string): { run(...args: unknown[]): void } } }, now: number) {
  // entities
  const insertEntity = client.sqlite.prepare(`
    INSERT INTO knowledge_entities (id, entity_type, canonical_name, normalized_name, aliases_json, summary, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '', 'active', ?, ?)
  `)
  insertEntity.run('entity-library', 'place', '图书馆', '图书馆', '["library","校图书馆"]', now, now)
  insertEntity.run('entity-dorm', 'place', '宿舍', '宿舍', '["寝室","宿舍楼"]', now, now)
  insertEntity.run('entity-report', 'procedure', '新生报到', '新生报到', '["开学报到","报到"]', now, now)

  // claims
  const insertClaim = client.sqlite.prepare(`
    INSERT INTO knowledge_claims (
      id, category, title, statement, keywords_json, search_text, confidence_label,
      confidence_score, review_status, public_url, source_note, valid_from, valid_until,
      supersedes_claim_id, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, '[]', '', 'unverified', 60, 'published', ?, '', ?, ?, ?, ?, ?, ?)
  `)
  insertClaim.run('claim-library-hours', '校园生活', '图书馆开放时间', '图书馆周一至周日 8:00-22:00 开放。', null, now - 10 * DAY_MS, null, null, now, now, now)
  insertClaim.run('claim-library-borrow', '校园生活', '图书馆借阅规则（过期）', '旧版借阅规则每人限借 3 本。', null, now - 20 * DAY_MS, now - 5 * DAY_MS, null, now, now, now)
  insertClaim.run('claim-dorm-fee', '宿舍', '宿舍水电费', '宿舍水电费按实际用量计费。', null, now - 5 * DAY_MS, null, null, now, now, now)
  insertClaim.run('claim-dorm-new-policy', '宿舍', '新版宿舍分配规则', '2026级宿舍分配需等学校通知。', null, now - 2 * DAY_MS, null, null, now, now, now)
  insertClaim.run('claim-dorm-old-policy', '宿舍', '旧版宿舍分配规则', '旧版宿舍分配规则按学院分配。', null, now - 30 * DAY_MS, null, 'claim-dorm-new-policy', now, now, now)
  insertClaim.run('claim-library-dorm-shared', '校园生活', '图书馆与宿舍服务', '图书馆闭馆后可使用宿舍自习室。', null, now - 3 * DAY_MS, null, null, now, now, now)

  // edges: claim <-> entity
  const insertEdge = client.sqlite.prepare(`
    INSERT INTO knowledge_claim_entities (claim_id, entity_id, role, created_at) VALUES (?, ?, 'subject', ?)
  `)
  insertEdge.run('claim-library-hours', 'entity-library', now)
  insertEdge.run('claim-library-borrow', 'entity-library', now)
  insertEdge.run('claim-dorm-fee', 'entity-dorm', now)
  insertEdge.run('claim-dorm-old-policy', 'entity-dorm', now)
  insertEdge.run('claim-dorm-new-policy', 'entity-dorm', now)
  insertEdge.run('claim-library-dorm-shared', 'entity-library', now)
  insertEdge.run('claim-library-dorm-shared', 'entity-dorm', now)
}

test('graph entity extraction matches canonical names and aliases', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-graph-entity-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    seedGraph(client, Date.now())

    const library = extractEntityIdsFromQuery(client, '图书馆几点开门')
    assert.ok(library.some(item => item.canonicalName === '图书馆'), 'canonical name match')
    const libraryAlias = extractEntityIdsFromQuery(client, '校图书馆在哪')
    assert.ok(libraryAlias.some(item => item.canonicalName === '图书馆'), 'alias match')

    const dorm = extractEntityIdsFromQuery(client, '宿舍条件怎么样')
    assert.ok(dorm.some(item => item.canonicalName === '宿舍'), 'dorm match')

    const none = extractEntityIdsFromQuery(client, '食堂好吃吗')
    assert.deepEqual(none, [], 'unmatched query yields nothing')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('graph expansion respects temporal validity and supersession', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-graph-expand-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const now = Date.now()
    seedGraph(client, now)

    const evidence = expandClaimsFromEntities(client, ['entity-library'], now)
    const texts = evidence.map(item => item.text)

    assert.ok(texts.some(text => text.includes('8:00-22:00')), 'valid claim returned')
    assert.ok(!texts.some(text => text.includes('旧版借阅规则')), 'expired claim excluded by valid_until')
    assert.ok(!texts.some(text => text.includes('旧版宿舍分配规则')), 'superseded claim excluded')
    assert.ok(texts.some(text => text.includes('宿舍自习室')), 'shared claim reachable via library entity')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('two-hop expansion reaches claims of a second entity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-graph-hops-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const now = Date.now()
    seedGraph(client, now)

    // Query 图书馆: hop-1 claims about library; the shared claim also links
    // 宿舍, whose own claims are reachable at hop 2.
    const evidence = retrieveGraphEvidence(client, '图书馆几点开门', 8, now)
    const texts = evidence.map(item => item.text)
    assert.ok(texts.some(text => text.includes('8:00-22:00')))
    assert.ok(texts.some(text => text.includes('宿舍自习室')))
    // dorm fee is a 2-hop claim via the shared claim's dorm entity
    assert.ok(texts.some(text => text.includes('水电费按实际用量')), '2-hop dorm claim reachable')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('graph retrieval is empty on an empty knowledge library', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-graph-empty-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    assert.deepEqual(retrieveGraphEvidence(client, '图书馆几点开门'), [])
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
