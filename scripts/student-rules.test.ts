import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { scholarships, studentRuleCatalog } from '../data/student-rules'
import { buildStudentRuleSearchResults } from '../app/utils/student-rules-search'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { answerCampusQuestion, studentRuleEvidenceForQuery } from '../server/modules/assistant/service'

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

test('published 2025 scholarship set and public rule catalog stay complete', () => {
  assert.deepEqual(scholarships.map(item => item.name), [
    '国家奖学金',
    '国家励志奖学金',
    '吴庆星奖学金',
    '仰恩奖学金',
    '农行泉州分行助学奖学金',
    '钰齐集团和诚奖学金',
    'E+奖学金'
  ])
  assert.ok(studentRuleCatalog.length >= 15)
  assert.ok(studentRuleCatalog.every(item => item.url.startsWith('https://')))
})

test('ordinary search finds GPA, scholarship and leave rules', () => {
  assert.equal(buildStudentRuleSearchResults('绩点怎么算')[0]?.title, '绩点公式与 GPA 计算器')
  assert.ok(buildStudentRuleSearchResults('国家奖学金要求').some(item => item.title === '国家奖学金'))
  assert.ok(buildStudentRuleSearchResults('学生怎么请假').some(item => item.title.includes('请销假')))
})

test('assistant evidence ranks exact scholarship and GPA questions', () => {
  assert.equal(studentRuleEvidenceForQuery('吴庆星奖学金有什么要求')[0]?.title, '吴庆星奖学金')
  assert.equal(studentRuleEvidenceForQuery('86分绩点是多少')[0]?.title, '绩点公式与 GPA 计算器')
})

test('student rule questions use deterministic local answers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-student-rules-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const gpa = await answerCampusQuestion(client, '86分绩点是多少', assistantConfig)
    assert.equal(gpa.mode, 'local')
    assert.match(gpa.answer, /3\.60/)

    const scholarship = await answerCampusQuestion(client, '国家奖学金有什么要求', assistantConfig)
    assert.equal(scholarship.mode, 'local')
    assert.match(scholarship.answer, /前10%/)

    const coexistence = await answerCampusQuestion(client, '吴庆星奖学金和仰恩奖学金能一起拿吗', assistantConfig)
    assert.equal(coexistence.mode, 'local')
    assert.match(coexistence.answer, /每人每学年只能参评一项/)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
