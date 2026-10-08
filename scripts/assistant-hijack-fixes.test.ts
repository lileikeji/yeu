import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  answerCampusQuestion,
  assistantKnowledgeLocalAnswer,
  assistantRetrievalQuery
} from '../server/modules/assistant/service'
import { seedAssistantKnowledge } from './seed-assistant-knowledge'

/**
 * 2026-09-23 第八轮线上排查（126 条真实问句全量回放 + 线上探针复现）照出的
 * 六条确定性答非所问，修复后固化成回归：
 *
 * 1. 「电子数模协会什么时候招新」→ 智育奖励加分表（模型意图主题短语带进学科竞赛分支）。
 * 2. 「新区图书馆」→ 舒适型宿舍楼栋（方面词短路绕过主题覆盖）。
 * 3. 「综测怎么加分」→ 申请表模板（通用匹配被申请表条目抢走）。
 * 4. 「桌子尺寸」/裸「尺寸」→ 蚊帐 90×190（方面词短路 + 床品证据无反向过滤）。
 * 5. 「我在和昌教学楼门口，我要去旧区操场」→ 新生报到分组（报到条目劫持导航问句）。
 * 6. 招新问句只答「暂未公布联系方式」，不给招新安排引导。
 */

const emptyAssistantConfig = {
  gatewayBaseUrl: '',
  gatewayApiKey: '',
  gatewayModel: '',
  gatewayTimeoutMs: 1000,
  mcpSearchUrl: '',
  mcpSearchBearerToken: '',
  mcpAllowedHosts: '',
  mcpToolName: '',
  mcpTimeoutMs: 1000,
  gatewayLookup: async () => ['93.184.216.34']
}

interface SeededAssistant {
  client: DatabaseClient
  directory: string
  databasePath: string
}

function createSeededAssistant(): SeededAssistant {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-hijack-fixes-'))
  const databasePath = join(directory, 'test.sqlite')
  seedAssistantKnowledge({ apply: true, databasePath })
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = Date.now()
  // 社团页面（招新问句的正确来源；线上内容表的真实 slug）。
  client.sqlite.prepare(`
    INSERT INTO contents (id, kind, slug, title, summary, body, metadata_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'test-club-electronic-modeling', 'club', 'electronic-mathematical-modeling-association', '电子数模协会',
    '电子技术与数理科创类学术学习社团。',
    '电子数模协会主要开展电子技术学习、数学建模训练与竞赛实践。',
    JSON.stringify({ direction: '电子技术、数学建模和竞赛实践', recruitmentPeriod: '', contactMethod: '' }),
    'published', now, now
  )
  // 地图地点：线上只有「图书馆」，「新区图书馆」靠片区前缀剥离命中。
  client.sqlite.prepare(`
    INSERT INTO places (
      id, slug, name, summary, body, scope, type, address, campus_area,
      longitude, latitude, coordinate_system, coordinate_verification,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'campus', 'service', ?, ?, 118.6113, 25.1149, 'GCJ-02', 'verified', 'published', ?, ?)
  `).run('test-place-library', 'library', '图书馆', '校内图书馆。', '', '第三教学区', '新区', now, now)
  // 报到分组条目（导航问句的劫持来源；线上 handbook 条目的等价最小复刻）。
  client.sqlite.prepare(`
    INSERT INTO assistant_knowledge_entries (
      id, kind, category, title, question, answer, keywords_json,
      public_url, confidence, source_note, is_active, imported_at, created_at, updated_at
    ) VALUES (?, 'official_reference', '报到与新生', ?, ?, ?, ?, NULL, 62, 'test', 1, ?, ?, ?)
  `).run(
    'test-handbook-registration-groups',
    '2026 新生手册｜报到时间、地点与专业分组',
    '2026新生报到地点在哪里 哪些专业去新区和昌教学楼',
    '法学、网络工程等专业暂列在新区和昌教学楼报到；计算机科学与技术等专业暂列在旧区普照大礼堂报到。',
    '["和昌教学楼","新区报到","旧区报到","专业分组"]',
    now, now, now
  )
  // 舒适型宿舍条目（「新区图书馆」的劫持来源；线上该条目不在种子里，按快照等价复刻）。
  client.sqlite.prepare(`
    INSERT INTO assistant_knowledge_entries (
      id, kind, category, title, question, answer, keywords_json,
      public_url, confidence, source_note, is_active, imported_at, created_at, updated_at
    ) VALUES (?, 'student_experience', '宿舍', ?, ?, ?, ?, NULL, 70, 'test', 1, ?, ?, ?)
  `).run(
    'test-comfort-dorm-location',
    '舒适型宿舍位置',
    '仰恩大学舒适型宿舍在哪？哪个校区？',
    '女生舒适型在旧区衡山楼，男生舒适型在新区辽宁楼或陕西楼（学生经验，最终以迎新系统和学校通知为准）。',
    '["舒适型宿舍在哪","舒适型宿舍位置","衡山楼","辽宁楼","陕西楼","旧区","新区"]',
    now, now, now
  )
  return { client, directory, databasePath }
}

function cleanupSeeded(assistant: SeededAssistant): void {
  closeDatabase(assistant.databasePath)
  rmSync(assistant.directory, { recursive: true, force: true })
}

test('club recruitment query is not hijacked by the competition-bonus entry', async () => {
  const seeded = createSeededAssistant()
  try {
    // 线上真实路径：模型把问句归纳成主题短语后，竞赛分支按主题短语打分必中
    // 「2025版学科技能竞赛加分」——修复后整条拒绝，交给社团分支。
    const intentPath = assistantKnowledgeLocalAnswer(
      seeded.client,
      '电子数模协会什么时候招新',
      { intent: 'competition', topic: '学科技能竞赛加分' },
      '学科技能竞赛加分'
    )
    assert.equal(intentPath, null, 'club recruitment query must not enter knowledge/competition matching')

    const response = await answerCampusQuestion(seeded.client, '电子数模协会什么时候招新', emptyAssistantConfig)
    assert.match(response.answer, /电子数模协会/)
    assert.match(response.answer, /招新/, 'answer must address recruitment, not dodge it')
    assert.doesNotMatch(response.answer, /智育奖励|A类赛事|学科技能竞赛/)
  } finally {
    cleanupSeeded(seeded)
  }
})

test('area-prefixed place name lands on the map entry, not the dorm entry', async () => {
  const seeded = createSeededAssistant()
  try {
    const response = await answerCampusQuestion(seeded.client, '新区图书馆', emptyAssistantConfig)
    assert.match(response.answer, /图书馆/)
    assert.equal(response.citations[0]?.url, '/map?place=library')
    assert.doesNotMatch(response.answer, /舒适型|衡山楼|辽宁楼/)
  } finally {
    cleanupSeeded(seeded)
  }
})

test('generic zongce bonus question gets the bonus overview, not the application forms', async () => {
  const seeded = createSeededAssistant()
  try {
    const response = await answerCampusQuestion(seeded.client, '综测怎么加分', emptyAssistantConfig)
    assert.doesNotMatch(response.answer, /自评报告|模板包含|申请表/)
    assert.match(response.answer, /德育奖励|智育奖励/)

    // 反向保护：真正问申请表的问法仍要答申请表条目。
    const forms = await answerCampusQuestion(seeded.client, '申请综测加分需要填什么表', emptyAssistantConfig)
    assert.match(forms.answer, /自评报告|申请表/)
  } finally {
    cleanupSeeded(seeded)
  }
})

test('non-bed size queries never inherit the mosquito-net bed dimensions', async () => {
  const seeded = createSeededAssistant()
  try {
    const desk = await answerCampusQuestion(seeded.client, '桌子尺寸', emptyAssistantConfig)
    assert.doesNotMatch(desk.answer, /蚊帐|90[×x]190/)

    const bare = await answerCampusQuestion(seeded.client, '尺寸', emptyAssistantConfig)
    assert.doesNotMatch(bare.answer, /蚊帐|90[×x]190/)

    // 钉住 find() 这条独立路径：知识条目匹配不经过 rankAssistantEvidence 的
    // 证据池过滤，2026-09-23 线上裸「尺寸」正是从这里绕过去的。
    for (const sizeQuery of ['桌子尺寸', '尺寸']) {
      const knowledgePath = assistantKnowledgeLocalAnswer(seeded.client, sizeQuery, null)
      assert.ok(
        !knowledgePath || !/蚊帐|90[×x]190/.test(knowledgePath.answer),
        `knowledge matcher must not answer ${sizeQuery} with bed dimensions`
      )
    }

    // 反向保护：宿舍语境的尺寸问句仍按床位规格作答。
    const dorm = await answerCampusQuestion(seeded.client, '宿舍尺寸', emptyAssistantConfig)
    assert.match(dorm.answer, /90[×x]190|0\.9|1\.9/)

    // 裸尺寸问句不得被改写成宿舍床位检索（isDormBedDimensionQuery 需要床词）。
    assert.equal(assistantRetrievalQuery('桌子尺寸'), '桌子尺寸')
    assert.equal(assistantRetrievalQuery('尺寸'), '尺寸')
    assert.match(assistantRetrievalQuery('宿舍床多大'), /床/)
  } finally {
    cleanupSeeded(seeded)
  }
})

test('on-campus navigation sentence gets a map route guide, not registration groups', async () => {
  const seeded = createSeededAssistant()
  try {
    const response = await answerCampusQuestion(
      seeded.client,
      '我在和昌教学楼门口，我要去旧区操场，',
      emptyAssistantConfig
    )
    assert.match(response.answer, /校园地图|步行/)
    assert.doesNotMatch(response.answer, /报到|普照大礼堂|专业分组/)
    assert.equal(response.citations[0]?.url, '/map')
  } finally {
    cleanupSeeded(seeded)
  }
})
