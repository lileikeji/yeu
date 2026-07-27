import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { facultyProfiles } from '../data/faculty-directory'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { answerCampusQuestion } from '../server/modules/assistant/service'
import { assistantIdentitySubject } from '../shared/utils/assistant-query'
import {
  parseFacultyDocument,
  retainVerifiedFacultySnapshot
} from './collect-official-faculty'
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

test('official faculty directory covers colleges without retaining private-profile noise', () => {
  assert.ok(facultyProfiles.length >= 350)
  assert.ok(new Set(facultyProfiles.map(profile => profile.college)).size >= 12)
  assert.ok(facultyProfiles.every(profile => (
    profile.name.length >= 2
    && profile.sourceUrl.startsWith('https://')
    && profile.sourceUrl.includes('.yeu.edu.cn/')
  )))
  assert.ok(facultyProfiles.every(profile => (
    !/(?:中国共产党|中共|共青团|群众|农工党|致公党)党员/u.test(profile.profile)
    && !/\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日出生/u.test(profile.profile)
  )))
})

test('faculty parser only treats a name next to a professional heading as a person', () => {
  const profiles = parseFacultyDocument({
    url: 'https://example.yeu.edu.cn/faculty/page.htm',
    title: '计算机系师资简介',
    text: [
      '张三 男 副教授 博士',
      '主要从事软件工程和数据分析教学。',
      '福建泉州人',
      '参与教师教学竞赛并获奖。',
      '李四',
      '女、讲师、硕士',
      '承担程序设计课程。'
    ].join('\n')
  }, '工程技术学院', '2026-07-27')

  assert.deepEqual(profiles.map(profile => profile.name), ['张三', '李四'])
  assert.equal(profiles[0]?.position, '副教授')
})

test('faculty parser rejects academic fields that resemble Chinese names', () => {
  const profiles = parseFacultyDocument({
    url: 'https://example.yeu.edu.cn/faculty/page.htm',
    title: '市场营销系师资简介',
    text: '行为学，讲师，硕士，长期承担组织行为学课程教学。'
  }, '管理学院', '2026-07-27')

  assert.deepEqual(profiles, [])
  assert.ok(facultyProfiles.every(profile => profile.name !== '行为学'))
})

test('faculty parser separates numbered inline profiles and keeps teaching-only biographies', () => {
  const profiles = parseFacultyDocument({
    url: 'https://example.yeu.edu.cn/faculty/page.htm',
    title: '教师简介',
    text: [
      '1.王艳红，副教授，国家二级心理咨询师，从事心理健康教育教学工作。',
      '2.王君婷，助教，国家三级心理咨询师，从事心理健康教育教学工作。',
      '姓名：May Garcia Villahermosa（梅）',
      '拥有20余年高校教学经验，主讲计算机英语和商务英语课程。'
    ].join(' ')
  }, '心理健康咨询中心', '2026-07-27')

  assert.deepEqual(profiles.map(profile => profile.name), [
    '王艳红',
    '王君婷',
    'May Garcia Villahermosa（梅）'
  ])
  assert.equal(profiles[2]?.position, '教师')
})

test('faculty collection retains missing profiles from the previous verified snapshot', () => {
  const previous = [
    { id: 'old-a', name: '张三', college: '工程技术学院', unit: '', position: '讲师', profile: '旧版官网公开教师简介资料完整', sourceUrl: 'https://computer.yeu.edu.cn/a', sourceTitle: '师资简介', retrievedAt: '2026-07-26' },
    { id: 'old-b', name: '李四', college: '工程技术学院', unit: '', position: '教授', profile: '旧版官网公开教师简介资料完整', sourceUrl: 'https://computer.yeu.edu.cn/b', sourceTitle: '师资简介', retrievedAt: '2026-07-26' }
  ]
  const collected = [
    { ...previous[0]!, profile: '更新后的官网公开教师简介资料更完整', retrievedAt: '2026-07-27' }
  ]

  const result = retainVerifiedFacultySnapshot(collected, previous)
  assert.equal(result.retained, 1)
  assert.equal(result.profiles.length, 2)
  assert.equal(result.profiles.find(profile => profile.name === '张三')?.profile, '更新后的官网公开教师简介资料更完整')
  assert.ok(result.profiles.some(profile => profile.name === '李四'))
})

test('teacher identity normalization removes the spoken title', () => {
  assert.equal(assistantIdentitySubject('张国安老师是谁'), '张国安')
  assert.equal(assistantIdentitySubject('张国安教授简介'), '张国安')
})

test('faculty RAG returns exact, duplicate-name, college-list and school-summary answers locally', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-faculty-rag-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    seedAssistantKnowledge({ apply: true, databasePath })
    const client = getDatabase(databasePath)
    runMigrations(client)

    const exact = await answerCampusQuestion(client, '张国安老师是谁', assistantConfig)
    assert.equal(exact.mode, 'local')
    assert.equal(exact.usedWebSearch, false)
    assert.match(exact.answer, /张国安.*法学院/s)
    assert.doesNotMatch(exact.answer, /吴庆星奖学金/)

    const duplicate = await answerCampusQuestion(client, '李婷是谁', assistantConfig)
    assert.equal(duplicate.mode, 'local')
    assert.match(duplicate.answer, /同名教师/)
    assert.match(duplicate.answer, /管理学院/)
    assert.match(duplicate.answer, /体育教研部/)

    const college = await answerCampusQuestion(client, '管理学院有哪些老师？', assistantConfig)
    assert.equal(college.mode, 'local')
    assert.match(college.answer, /管理学院官网公开师资/)
    assert.match(college.answer, /林迎星/)

    const overview = await answerCampusQuestion(client, '学校所有教师名单有哪些？', assistantConfig)
    assert.equal(overview.mode, 'local')
    assert.match(overview.answer, /官网公开师资资料/)
    assert.match(overview.answer, /管理学院\d+人/)

    const ordinaryPhrase = await answerCampusQuestion(client, '这个办法尚可继续使用吗？', assistantConfig)
    assert.doesNotMatch(ordinaryPhrase.answer, /人文学院公开师资页面列出的教师/)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
