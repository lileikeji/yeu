import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { assistantQueryTerms, localEvidenceIsSufficient } from '../server/modules/assistant/service'
import { searchOfficialKnowledgeDocuments } from '../server/modules/knowledge/service'

test('official welcome-system documents are included in document retrieval', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-welcome-search-'))
  const databasePath = join(directory, 'knowledge.sqlite')
  try {
    const client = getDatabase(databasePath)
    runMigrations(client)
    const now = Date.now()
    client.sqlite.prepare(`
      INSERT INTO sources (
        id, title, url, platform, publisher_name, source_level, is_official,
        published_at, accessed_at, notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'A', 1, NULL, ?, '', 'active', ?, ?)
    `).run(
      'welcome-test-source',
      '舒适型宿舍申请指南',
      'https://yedx_yx.leyunykt.com/student/index.html#/userGuide?guide=8',
      '仰恩大学官方迎新系统',
      '仰恩大学',
      now,
      now,
      now
    )
    client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, storage_path, mime_type,
        content_hash, extracted_text, metadata_json, status, captured_at,
        processed_at, created_by_admin_id, created_at, updated_at
      ) VALUES (?, ?, 'api', ?, ?, NULL, 'text/html', ?, ?, ?, 'ready', ?, ?, NULL, ?, ?)
    `).run(
      'welcome-test-document',
      'welcome-test-source',
      '舒适型宿舍申请指南',
      'https://yedx_yx.leyunykt.com/student/index.html#/userGuide?guide=8',
      'welcome-test-hash',
      '舒适型女生宿舍位于旧区衡山楼；舒适型男生宿舍位于新区辽宁楼和陕西楼。五、应带证件和材料：录取通知书、身份证、档案材料。',
      JSON.stringify({ importer: 'welcome-public-knowledge', publicCitation: false }),
      now,
      now,
      now,
      now
    )
    const matches = searchOfficialKnowledgeDocuments(
      client,
      ['舒适型女生宿舍'],
      8,
      '舒适型女生宿舍是哪栋？'
    )
    assert.equal(matches.length, 1)
    assert.equal(matches[0]?.title, '舒适型宿舍申请指南')
    assert.match(matches[0]?.excerpt ?? '', /衡山楼/u)

    const preparationQuery = '到校前需要准备什么？'
    const preparationMatches = searchOfficialKnowledgeDocuments(
      client,
      assistantQueryTerms(preparationQuery),
      8,
      preparationQuery
    )
    assert.equal(preparationMatches.length, 1)
    assert.match(preparationMatches[0]?.excerpt ?? '', /录取通知书/u)
    assert.equal(localEvidenceIsSufficient(preparationQuery, preparationMatches.map(item => ({
      title: item.title,
      url: item.url,
      snippet: item.excerpt,
      source: 'site' as const,
      authority: 'official_site' as const,
      text: item.excerpt,
      score: item.score
    }))), true)
    closeDatabase(databasePath)
  } finally {
    try {
      closeDatabase(databasePath)
    } catch {
      // The success path already closes this connection.
    }
    rmSync(directory, { recursive: true, force: true })
  }
})
