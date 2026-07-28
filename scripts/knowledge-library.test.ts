import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { getKnowledgeLandscapeGraph, listKnowledgeLibrary } from '../server/modules/knowledge/library'

test('knowledge admin pages are sibling routes instead of hidden nested pages', () => {
  assert.equal(existsSync('app/pages/admin/knowledge.vue'), false)
  for (const page of ['index', 'library', 'graph']) {
    const source = readFileSync(`app/pages/admin/knowledge/${page}.vue`, 'utf8')
    assert.match(source, /definePageMeta\([\s\S]*?layout: ['"]admin['"]/)
  }
})

test('knowledge navigation opens the full library before the empty review queue', () => {
  const indexSource = readFileSync('app/pages/admin/knowledge/index.vue', 'utf8')
  const librarySource = readFileSync('app/pages/admin/knowledge/library.vue', 'utf8')
  assert.match(
    indexSource,
    /navigateTo\(['"]\/admin\/knowledge\/library['"]/
  )
  assert.match(
    indexSource,
    /to\.query\.view === ['"]review['"]/
  )
  assert.match(
    librarySource,
    /to=['"]\/admin\/knowledge\?view=review['"]/
  )
})

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-knowledge-library-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = Date.now()

  client.sqlite.prepare(`
    INSERT INTO assistant_knowledge_entries (
      id, kind, category, title, question, answer, keywords_json, confidence,
      source_note, is_active, imported_at, created_at, updated_at
    ) VALUES ('entry-1', 'official_reference', '教职工', '林老师简介', '林老师是谁',
      '用于知识资料列表测试的教师简介。', '["教师"]', 90, '测试资料', 1, ?, ?, ?)
  `).run(now, now, now)

  client.sqlite.prepare(`
    INSERT INTO assistant_web_knowledge (
      id, query_hash, query, title, url, snippet, source_host, status,
      fetched_at, expires_at, created_at, updated_at
    ) VALUES ('web-1', 'hash-1', '校园新闻', '官网新闻', 'https://www.yeu.edu.cn/test',
      '用于网页资料列表测试的摘要。', 'www.yeu.edu.cn', 'active', ?, ?, ?, ?)
  `).run(now, now + 86_400_000, now, now)

  client.sqlite.prepare(`
    INSERT INTO knowledge_documents (
      id, kind, title, content_hash, extracted_text, metadata_json, status,
      captured_at, processed_at, created_at, updated_at
    ) VALUES ('document-1', 'webpage', '官网正文', 'document-hash-1',
      '用于官网正文列表测试的完整内容。', '{}', 'ready', ?, ?, ?, ?)
  `).run(now, now, now, now)

  return {
    client,
    close: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

test('knowledge library lists every retrieval collection instead of only reviewed claims', () => {
  const value = fixture()
  try {
    for (const collection of ['entries', 'web', 'documents'] as const) {
      const result = listKnowledgeLibrary(value.client, { collection, page: 1, pageSize: 20 })
      assert.equal(result.total, 1)
      assert.equal(result.items.length, 1)
      assert.equal(result.summary.retrievalTotal, 3)
    }

    const search = listKnowledgeLibrary(value.client, {
      collection: 'entries', page: 1, pageSize: 20, q: '林老师'
    })
    assert.equal(search.total, 1)
  } finally {
    value.close()
  }
})

test('digital landscape graph is derived from current knowledge collections', () => {
  const value = fixture()
  try {
    const graph = getKnowledgeLandscapeGraph(value.client)
    assert.equal(graph.summary.retrievalTotal, 3)
    assert.ok(graph.nodes.some(node => node.id === 'root' && node.count === 3))
    assert.ok(graph.nodes.some(node => node.label === '教职工' && node.count === 1))
    assert.ok(graph.nodes.some(node => node.label === 'www.yeu.edu.cn' && node.count === 1))
    assert.ok(graph.edges.some(edge => edge.source === 'entries' && edge.target === 'entry:教职工'))
    assert.ok(graph.nodes.some(node => node.id === 'item:entries:entry-1'))
    assert.ok(graph.nodes.some(node => node.id === 'item:web:web-1'))
    assert.ok(graph.nodes.some(node => node.id === 'item:documents:document-1'))
    assert.equal(graph.visibleItems, 3)
  } finally {
    value.close()
  }
})
