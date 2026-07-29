import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  COMPACT_GRAPH_NODE_LIMIT,
  getKnowledgeLandscapeGraph,
  listKnowledgeLibrary
} from '../server/modules/knowledge/library'

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

  client.sqlite.prepare(`
    INSERT INTO contents (
      id, kind, slug, title, summary, body, metadata_json, is_featured,
      status, created_at, updated_at
    ) VALUES ('content-1', 'club', 'computer-club', '计算机协会',
      '面向新生的计算机技术社团。', '每周开展编程交流与项目实践。',
      '{"boxes":[{"id":"projects","title":"项目方向","body":"网站与机器人"}]}',
      0, 'published', ?, ?)
  `).run(now, now)

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
    for (const collection of ['entries', 'web', 'documents', 'structured'] as const) {
      const result = listKnowledgeLibrary(value.client, { collection, page: 1, pageSize: 20 })
      assert.equal(result.total, 1)
      assert.equal(result.items.length, 1)
      assert.equal(result.summary.retrievalTotal, 4)
    }

    const search = listKnowledgeLibrary(value.client, {
      collection: 'entries', page: 1, pageSize: 20, q: '林老师'
    })
    assert.equal(search.total, 1)
    const structuredSearch = listKnowledgeLibrary(value.client, {
      collection: 'structured', page: 1, pageSize: 20, q: '网站与机器人'
    })
    assert.equal(structuredSearch.total, 1)
    assert.equal((structuredSearch.items[0] as { title: string }).title, '计算机协会')
  } finally {
    value.close()
  }
})

test('digital landscape graph is derived from current knowledge collections', () => {
  const value = fixture()
  try {
    const graph = getKnowledgeLandscapeGraph(value.client)
    assert.equal(graph.summary.retrievalTotal, 4)
    assert.equal(graph.meta.total_nodes, 4)
    assert.equal(graph.meta.total_edges, graph.edges.length)
    assert.ok(graph.nodes.some(node => node.id === 'knowledge:entries:entry-1'))
    assert.ok(graph.nodes.some(node => node.id === 'knowledge:web:web-1'))
    assert.ok(graph.nodes.some(node => node.id === 'knowledge:documents:document-1'))
    assert.ok(graph.nodes.some(node => node.id === 'knowledge:structured:content:content-1'))
    assert.ok(graph.nodes.every(node => node.community.startsWith('community:')))
    assert.ok(graph.nodes.every(node => node.source_path.startsWith('library://')))
    assert.ok(graph.nodes.every(node => (
      ['EXTRACTED', 'INFERRED', 'AMBIGUOUS', 'UNVERIFIED'] as string[]
    ).includes(node.confidence)))
    assert.equal(graph.learning.communities.length, 1)
    assert.ok(graph.learning.communities.every(community => community.node_count >= 3))
    assert.equal(graph.learning.views.global.node_ids.length, 4)
    assert.equal(graph.visibleItems, 4)
    assert.equal(graph.truncatedItems, 0)
  } finally {
    value.close()
  }
})

test('compact landscape graph stays within the mobile WebView budget', () => {
  const value = fixture()
  try {
    const insert = value.client.sqlite.prepare(`
      INSERT INTO assistant_knowledge_entries (
        id, kind, category, title, question, answer, keywords_json, confidence,
        source_note, is_active, imported_at, created_at, updated_at
      ) VALUES (?, 'official_reference', ?, ?, ?, ?, '[]', 90, '移动端图谱测试', 1, ?, ?, ?)
    `)
    const now = Date.now()
    for (let index = 0; index < COMPACT_GRAPH_NODE_LIMIT + 80; index += 1) {
      insert.run(
        `compact-entry-${index}`,
        index % 2 === 0 ? '宿舍与生活' : '学业与教务',
        `移动端知识 ${index}`,
        `移动端问题 ${index}`,
        `用于验证手机图谱不会一次渲染全部节点的答案 ${index}`,
        now + index,
        now + index,
        now + index
      )
    }

    const graph = getKnowledgeLandscapeGraph(value.client, {
      nodeLimit: COMPACT_GRAPH_NODE_LIMIT
    })
    assert.equal(graph.visibleItems, COMPACT_GRAPH_NODE_LIMIT)
    assert.equal(graph.meta.total_nodes, COMPACT_GRAPH_NODE_LIMIT)
    assert.equal(graph.meta.degraded, true)
    assert.ok(graph.truncatedItems > 0)
    assert.ok(new Set(graph.nodes.map(node => node.collection)).size > 1)
  } finally {
    value.close()
  }
})
