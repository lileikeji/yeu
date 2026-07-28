import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { scholarships, studentRuleCatalog } from '../data/student-rules'
import { buildStudentRuleSearchResults } from '../app/utils/student-rules-search'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  answerCampusQuestion,
  cachedWebEvidenceForQuery,
  studentRuleEvidenceForQuery,
  storeWebEvidence
} from '../server/modules/assistant/service'

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
  assert.deepEqual(buildStudentRuleSearchResults('吴庆星是谁'), [])
})

test('assistant evidence ranks exact scholarship and GPA questions', () => {
  assert.equal(studentRuleEvidenceForQuery('吴庆星奖学金有什么要求')[0]?.title, '吴庆星奖学金')
  assert.equal(studentRuleEvidenceForQuery('86分绩点是多少')[0]?.title, '绩点公式与 GPA 计算器')
})

test('identity questions do not inherit a suffixed rule title', () => {
  const evidence = studentRuleEvidenceForQuery('\u5434\u5e86\u661f\u662f\u8c01')
  assert.equal(evidence.length, 0)
  assert.deepEqual(studentRuleEvidenceForQuery('请介绍吴庆星的身份和经历？'), [])
})

test('global RAG ranking ignores related web entries for identity questions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-identity-rag-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    storeWebEvidence(client, '吴庆星是谁', [{
      title: '吴庆星奖学金',
      url: 'https://example.edu/scholarship',
      snippet: '奖学金评审与申请条件。',
      source: 'web'
    }])
    assert.deepEqual(cachedWebEvidenceForQuery(client, '吴庆星是谁'), [])
    assert.deepEqual(cachedWebEvidenceForQuery(client, '请介绍吴庆星的身份和经历？'), [])
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
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

    const identity = await answerCampusQuestion(client, '请介绍吴庆星的身份和经历？', assistantConfig)
    assert.doesNotMatch(identity.answer, /吴庆星奖学金/)
    assert.ok(identity.citations.every(item => !item.title.includes('吴庆星奖学金')))
    assert.doesNotMatch(JSON.stringify(identity), /吴庆星奖学金/)

    const naturalIdentity = await answerCampusQuestion(client, '想了解吴庆星的身份与生平？', assistantConfig)
    assert.doesNotMatch(JSON.stringify(naturalIdentity), /吴庆星奖学金/)

    const coexistence = await answerCampusQuestion(client, '吴庆星奖学金和仰恩奖学金能一起拿吗', assistantConfig)
    assert.equal(coexistence.mode, 'local')
    assert.match(coexistence.answer, /每人每学年只能参评一项/)

    const overview = await answerCampusQuestion(client, '奖助学金有哪些具体申请条件、评审流程和时间', assistantConfig)
    assert.equal(overview.mode, 'local')
    assert.equal(overview.usedWebSearch, false)
    assert.equal(overview.retrievalPath, 'local_database')
    assert.match(overview.answer, /国家助学金.*3000元.*5000元/s)
    assert.match(overview.answer, /国家奖学金.*前10%/s)
    assert.match(overview.answer, /国家励志奖学金.*前40%/s)
    assert.match(overview.answer, /仰恩奖学金.*每年9月/)
    assert.deepEqual(overview.trace?.map(item => item.stage), [
      'query_analysis',
      'local_database',
      'answer_generation'
    ])

    const grant = await answerCampusQuestion(client, '国家助学金什么时候申请，有多少钱', assistantConfig)
    assert.equal(grant.mode, 'local')
    assert.match(grant.answer, /9月20日前/)
    assert.match(grant.answer, /3000元和5000元/)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
