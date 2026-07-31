import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  assistantKnowledgeSeeds,
  campusExperienceKnowledge,
  sportsElectiveKnowledge,
  userVerifiedNewStudentExperienceKnowledge,
  verifiedNewStudentFaqKnowledge
} from '../data/assistant-knowledge'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  answerCampusQuestion,
  assistantKnowledgeMatchesForQuery,
  assistantQueryTerms
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
  assert.ok(verifiedNewStudentFaqKnowledge.length >= 10)
  assert.ok(userVerifiedNewStudentExperienceKnowledge.length >= 15)
  assert.equal(sportsElectiveKnowledge.length, 1)
  assert.match(sportsElectiveKnowledge[0].answer, /匹克球.*柔力球/s)
  assert.ok(assistantKnowledgeSeeds.length >= 45)
  assert.ok(assistantKnowledgeSeeds.every(entry => entry.keywords.length >= 3))
  assert.ok(campusExperienceKnowledge.every(entry => (
    !/抖音|douyin|v\.douyin|http/i.test(JSON.stringify(entry))
  )))
})

test('follow-up entity terms stay ahead of a long appended context', () => {
  const longContext = Array.from({ length: 32 }, (_, index) => `官网资料${index}正文内容`).join(' ')
  const terms = assistantQueryTerms(`${longContext}；追问：哪栋楼`)

  assert.equal(terms[0], '哪栋楼')
  assert.ok(terms.indexOf('哪栋楼') < 3)
  assert.equal(terms.includes('追问'), false)
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
      ['今年是12月军训吗，多长时间', /12月13日至26日/],
      ['女生普通型宿舍是几人间', /4至5人间/],
      ['助学贷是在学校弄还是当地弄', /户籍所在地教育局.*入校后/s],
      ['学校有哪些社团', /国旗班.*计算机协会/s],
      ['体育课什么时候抢', /尚未公布/],
      ['数学没及格一定转不了吗', /没有证据能确认/],
      ['舒适型宿舍今年什么时候开放，在哪抢', /开学前约10天.*迎新系统/s],
      ['2026级舒适型宿舍什么时候提交', /2026-08-24.*2026-08-31.*支付时间/s],
      ['舒适型宿舍女生多少钱、男生多少钱', /2780元(?:\/人·年|\/学年).*2580元(?:\/人·年|\/学年)/s],
      ['计算机科学与技术专业住新区还是旧区', /应先按新区记录.*旧区.*不再作为当前答案/s],
      ['新区女生还有舒适型宿舍吗', /女生舒适型宿舍安排在旧区/],
      ['舒适型女生宿舍是哪栋楼', /旧区衡山楼.*男生舒适型宿舍.*新区辽宁楼或陕西楼/s],
      ['体育选修有哪些项目', /女子篮球.*足球.*羽毛球.*匹克球.*柔力球/s],
      ['没钱吃饭怎么办', /不要硬扛.*学生资助中心/s],
      ['上课可以玩手机么', /任课教师当堂要求.*课堂秩序/s],
      ['林惠是谁', /董事会董事长.*仰恩基金会/s],
      ['吴庆星是谁', /仰恩基金会的创始人.*创办了仰恩大学/s],
      ['分宿舍会填作息空调温度问卷吗', /不会先填写作息、空调温度/],
      ['普通宿舍洗澡要水卡吗', /普通型宿舍洗澡使用水卡/],
      ['公共洗衣机一次多久', /10分钟单脱水.*25、35、45分钟/s],
      ['新生一个月生活费多少合适', /1500元.*基础的参考线/s],
      ['选课用什么系统和App', /教务系统.*喜鹊儿/s],
      ['苹果电脑上专业软件方便吗', /专业实验软件.*可能只支持Windows/s],
      ['迎新预报名信息填错不能改怎么办', /保留截图.*班导、辅导员或学院/s],
      ['新区快递地址怎么写', /第三教学区.*宿舍楼栋/s],
      ['学校哪里可以抽烟', /不要把厕所当作“允许吸烟区”/],
      ['报到可以把车开到宿舍楼下吗', /不能进入宿舍区.*宿舍楼下/s],
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
