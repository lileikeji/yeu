import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { assistantKnowledgeSeeds, campusExperienceKnowledge } from '../data/assistant-knowledge'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  answerCampusQuestion,
  assistantKnowledgeMatchesForQuery
} from '../server/modules/assistant/service'
import { seedAssistantKnowledge } from './seed-assistant-knowledge'

const assistantConfig = {
  gatewayBaseUrl: '',
  gatewayApiKey: '',
  gatewayModel: '',
  gatewayTimeoutMs: 1000,
  mcpSearchUrl: '',
  mcpSearchBearerToken: '',
  mcpAllowedHosts: '',
  mcpToolName: '',
  mcpTimeoutMs: 1000
}

test('campus experience entries are normalized and do not retain the source platform URL', () => {
  assert.ok(campusExperienceKnowledge.length >= 20)
  assert.ok(assistantKnowledgeSeeds.length >= 30)
  assert.ok(assistantKnowledgeSeeds.every(entry => entry.keywords.length >= 3))
  assert.ok(campusExperienceKnowledge.every(entry => (
    !/抖音|douyin|v\.douyin|http/i.test(JSON.stringify(entry))
  )))
})

test('assistant knowledge seed migrates and reruns idempotently', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-assistant-knowledge-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    const first = seedAssistantKnowledge({ apply: true, databasePath, now: 1_785_120_000_000 })
    const seededClient = getDatabase(databasePath)
    seededClient.sqlite.prepare(`
      INSERT INTO assistant_knowledge_entries (
        id, kind, category, title, question, answer, keywords_json,
        confidence, source_note, is_active, imported_at, created_at, updated_at
      ) VALUES (?, 'official_reference', '教职工', ?, ?, ?, '[]', 90, ?, 1, ?, ?, ?)
    `).run(
      'faculty-stale-test',
      '已删除的教师资料',
      '这条教师资料还有效吗？',
      '这是一条用于验证旧资料会被停用的测试记录。',
      '测试数据',
      1_785_120_000_000,
      1_785_120_000_000,
      1_785_120_000_000
    )

    const second = seedAssistantKnowledge({ apply: true, databasePath, now: 1_785_120_001_000 })
    assert.equal(first.total, assistantKnowledgeSeeds.length)
    assert.equal(second.total, assistantKnowledgeSeeds.length)

    const client = getDatabase(databasePath)
    runMigrations(client)
    const count = client.sqlite.prepare(
      'SELECT count(*) AS count FROM assistant_knowledge_entries WHERE is_active = 1'
    ).get() as { count: number }
    assert.equal(count.count, assistantKnowledgeSeeds.length)

    const stale = client.sqlite.prepare(
      'SELECT is_active AS isActive, updated_at AS updatedAt FROM assistant_knowledge_entries WHERE id = ?'
    ).get('faculty-stale-test') as { isActive: number, updatedAt: number }
    assert.deepEqual(stale, { isActive: 0, updatedAt: 1_785_120_001_000 })

    const currentFaculty = assistantKnowledgeSeeds.find(entry => entry.category === '教职工')
    assert.ok(currentFaculty)
    const current = client.sqlite.prepare(
      'SELECT is_active AS isActive FROM assistant_knowledge_entries WHERE id = ?'
    ).get(currentFaculty.id) as { isActive: number }
    assert.equal(current.isActive, 1)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('permanent knowledge RAG matches common experience and comprehensive-evaluation questions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-assistant-knowledge-rag-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    seedAssistantKnowledge({ apply: true, databasePath })
    const client = getDatabase(databasePath)

    const cases = [
      ['饮水机的水能喝吗', /可以直接饮用/],
      ['叮叮车是什么', /校内接驳车/],
      ['开学考什么', /学生手册测试.*英语分班/s],
      ['宿舍洗衣机脏吗', /先清洗内筒/],
      ['学校可以染头发吗', /一般允许染发/],
      ['综测怎么算', /德育25分、智育70分、体育5分/],
      ['综测表格怎么填', /班级代码、学号、姓名/]
    ] as const

    for (const [query, expected] of cases) {
      const matches = assistantKnowledgeMatchesForQuery(client, query, 3)
      assert.ok(matches[0]?.score && matches[0].score >= 12, `${query} should match permanent knowledge`)
      const response = await answerCampusQuestion(client, query, assistantConfig)
      assert.equal(response.mode, 'local')
      assert.equal(response.usedWebSearch, false)
      assert.match(response.answer, expected)
    }

    const experience = await answerCampusQuestion(client, '学校可以染头发吗', assistantConfig)
    assert.deepEqual(experience.citations, [])

    const unsupportedDormDetail = await answerCampusQuestion(client, '普通型宿舍有阳台吗', assistantConfig)
    assert.match(unsupportedDormDetail.answer, /内置资料暂时没有找到/)
    assert.doesNotMatch(unsupportedDormDetail.answer, /洗衣机|宿舍价格/)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('assistant indexes current campus scale and 2026 military-training facts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-assistant-campus-facts-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)

    const campusScale = await answerCampusQuestion(client, '仰恩大学校园面积有多大？', assistantConfig)
    assert.equal(campusScale.retrievalPath, 'local_database')
    assert.match(campusScale.answer, /2000余亩/)
    assert.equal(campusScale.citations[0]?.url, '/campus')

    const military = await answerCampusQuestion(client, '2026级什么时候军训？', assistantConfig)
    assert.equal(military.retrievalPath, 'local_database')
    assert.match(military.answer, /12月13日至26日/)
    assert.equal(military.citations[0]?.url, '/campus#military-training')
    assert.doesNotMatch(military.answer, /学生经验称本届首次安排冬训/)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
