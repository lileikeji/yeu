import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { compileOfficialKnowledgeDocuments } from '../server/modules/knowledge/document-compiler'
import { answerCampusQuestion, assistantQueryTerms, localEvidenceIsSufficient, retrieveCampusEvidence } from '../server/modules/assistant/service'
import {
  archiveKnowledgeClaim,
  createKnowledgeClaim,
  knowledgeHealth,
  searchOfficialKnowledgeDocuments,
  searchPublishedKnowledgeClaims,
  updateKnowledgeClaim
} from '../server/modules/knowledge/service'

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-knowledge-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  const now = Date.now()
  const adminId = '00000000-0000-4000-8000-000000000001'
  const sourceId = '00000000-0000-4000-8000-000000000002'
  client.sqlite.prepare(`
    INSERT INTO admin_users (id, username, password_hash, display_name, role, is_active, created_at, updated_at)
    VALUES (?, 'knowledge-test-admin', 'test-hash', 'Knowledge Test', 'super', 1, ?, ?)
  `).run(adminId, now, now)
  client.sqlite.prepare(`
    INSERT INTO sources (
      id, title, url, platform, publisher_name, source_level, is_official,
      accessed_at, status, created_at, updated_at
    ) VALUES (?, '宿舍管理资料', 'https://www.yeu.edu.cn/dorm-test', '学校官网', '仰恩大学', 'A', 1, ?, 'active', ?, ?)
  `).run(sourceId, now, now, now)
  return {
    client,
    directory,
    adminId,
    sourceId,
    close: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

test('knowledge migration creates the compiled tables and FTS index', () => {
  const value = fixture()
  try {
    const names = value.client.sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE name IN ('knowledge_crawl_queue', 'knowledge_documents', 'knowledge_documents_fts', 'knowledge_entities', 'knowledge_claims', 'knowledge_claims_fts')
      ORDER BY name
    `).all() as Array<{ name: string }>
    assert.deepEqual(names.map(row => row.name), [
      'knowledge_claims',
      'knowledge_claims_fts',
      'knowledge_crawl_queue',
      'knowledge_documents',
      'knowledge_documents_fts',
      'knowledge_entities'
    ])
  } finally {
    value.close()
  }
})

test('official document正文 is compiled into searchable published claims and is idempotent', () => {
  const value = fixture()
  try {
    const now = Date.now()
    value.client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, mime_type, content_hash,
        extracted_text, metadata_json, status, captured_at, processed_at, created_at, updated_at
      ) VALUES (?, ?, 'webpage', ?, ?, 'text/html', ?, ?, '{}', 'ready', ?, ?, ?, ?)
    `).run(
      '00000000-0000-4000-8000-000000000010',
      value.sourceId,
      '新生报到说明',
      'https://www.yeu.edu.cn/new-student-compiler-test',
      'compiler-test-hash',
      '新生报到安排\n报到时间为9月5日至6日。请携带录取通知书和身份证原件。\n校园卡可在报到现场领取。',
      now,
      now,
      now,
      now
    )
    const first = compileOfficialKnowledgeDocuments(value.client)
    assert.equal(first.documents, 1)
    assert.ok(first.claimsInserted >= 2)
    const claims = value.client.sqlite.prepare(`
      SELECT kc.title, kc.statement
      FROM knowledge_claims kc
      INNER JOIN knowledge_claim_sources kcs ON kcs.claim_id = kc.id
      WHERE kcs.document_id = ?
      ORDER BY kc.created_at
    `).all('00000000-0000-4000-8000-000000000010') as Array<{ title: string, statement: string }>
    assert.ok(claims.some(item => item.statement.includes('9月5日至6日')))
    assert.ok(searchPublishedKnowledgeClaims(value.client, ['报到时间'], 5).length > 0)

    const second = compileOfficialKnowledgeDocuments(value.client)
    assert.equal(second.claimsInserted, 0)
    assert.ok(second.claimsUpdated >= first.claimsInserted)
    assert.equal(
      (value.client.sqlite.prepare(`
        SELECT count(*) AS value FROM knowledge_claim_sources WHERE document_id = ?
      `).get('00000000-0000-4000-8000-000000000010') as { value: number }).value,
      claims.length
    )
  } finally {
    value.close()
  }
})

test('ready A-level official documents are searchable and archived versions are excluded', async () => {
  const value = fixture()
  try {
    const now = Date.now()
    const documentId = '00000000-0000-4000-8000-000000000003'
    value.client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, mime_type, content_hash,
        extracted_text, metadata_json, status, captured_at, processed_at, created_at, updated_at
      ) VALUES (?, ?, 'webpage', ?, 'https://www.yeu.edu.cn/dorm-test', 'text/markdown', ?, ?, '{}', 'ready', ?, ?, ?, ?)
    `).run(
      documentId,
      value.sourceId,
      'Freshman dormitory mattress guide',
      'official-document-hash',
      'Freshmen should measure the dormitory bed before buying a mattress. Dormitory room assignments may change.',
      now,
      now,
      now,
      now
    )
    const matches = searchOfficialKnowledgeDocuments(value.client, ['dormitory mattress'], 5)
    assert.equal(matches[0]?.id, documentId)
    assert.match(matches[0]?.excerpt ?? '', /measure the dormitory bed/)
    value.client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, mime_type, content_hash,
        extracted_text, metadata_json, status, captured_at, processed_at, created_at, updated_at
      ) VALUES (?, ?, 'webpage', ?, ?, 'text/markdown', ?, ?, '{}', 'ready', ?, ?, ?, ?)
    `).run(
      '00000000-0000-4000-8000-000000000009',
      value.sourceId,
      'Freshman dormitory mattress guide mirror',
      'https://web.yeu.edu.cn/dorm-test-mirror',
      'official-document-hash',
      'Freshmen should measure the dormitory bed before buying a mattress. Dormitory room assignments may change.',
      now + 1,
      now + 1,
      now + 1,
      now + 1
    )
    assert.equal(searchOfficialKnowledgeDocuments(value.client, ['dormitory mattress'], 5).length, 1)
    value.client.sqlite.prepare('UPDATE knowledge_documents SET status = \'archived\' WHERE id = ?')
      .run('00000000-0000-4000-8000-000000000009')
    value.client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, mime_type, content_hash,
        extracted_text, metadata_json, status, captured_at, processed_at, created_at, updated_at
      ) VALUES (?, ?, 'webpage', ?, ?, 'text/markdown', ?, ?, '{}', 'ready', ?, ?, ?, ?)
    `).run(
      '00000000-0000-4000-8000-000000000004',
      value.sourceId,
      '新生开学典礼',
      'https://www.yeu.edu.cn/ceremony-test',
      'irrelevant-official-document-hash',
      '学校举行新生开学典礼，欢迎新同学到校。',
      now,
      now,
      now,
      now
    )
    assert.deepEqual(searchOfficialKnowledgeDocuments(value.client, ['新生', '缴费'], 5, '新生怎么缴费'), [])
    const reportId = '00000000-0000-4000-8000-000000000005'
    value.client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, mime_type, content_hash,
        extracted_text, metadata_json, status, captured_at, processed_at, created_at, updated_at
      ) VALUES (?, ?, 'pdf', ?, ?, 'application/pdf', ?, ?, '{}', 'ready', ?, ?, ?, ?)
    `).run(
      reportId,
      value.sourceId,
      '仰恩大学本科教学质量报告（含2024年数据）',
      'https://www.yeu.edu.cn/report-test.pdf',
      'official-report-document-hash',
      '本科教育基本情况。学校现有教职工626人，其中专任教师424人，外聘教师数量另行统计。',
      now,
      now,
      now,
      now
    )
    const reportQuery = '仰恩大学本科教学质量报告里专任教师有多少人'
    const report = searchOfficialKnowledgeDocuments(value.client, assistantQueryTerms(reportQuery), 5, reportQuery)
    assert.equal(report[0]?.id, reportId)
    assert.match(report[0]?.excerpt ?? '', /专任教师424人/)
    const reportEvidence = retrieveCampusEvidence(value.client, reportQuery, 6)
    assert.equal(reportEvidence[0]?.title, '仰恩大学本科教学质量报告（含2024年数据）')
    assert.equal(localEvidenceIsSufficient(reportQuery, reportEvidence), true)
    const reportAnswer = await answerCampusQuestion(value.client, reportQuery, {
      gatewayBaseUrl: '',
      gatewayApiKey: '',
      gatewayModel: '',
      gatewayTimeoutMs: 1000,
      mcpSearchUrl: '',
      mcpSearchBearerToken: '',
      mcpAllowedHosts: '',
      mcpToolName: '',
      mcpTimeoutMs: 1000
    })
    assert.match(reportAnswer.answer, /专任教师424人/)
    assert.equal(reportAnswer.usedWebSearch, false)
    assert.equal(reportAnswer.citations.length, 1)
    const transferDocumentId = '00000000-0000-4000-8000-000000000006'
    value.client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, mime_type, content_hash,
        extracted_text, metadata_json, status, captured_at, processed_at, created_at, updated_at
      ) VALUES (?, ?, 'document', ?, ?, 'application/msword', ?, ?, '{}', 'ready', ?, ?, ?, ?)
    `).run(
      transferDocumentId,
      value.sourceId,
      '仰恩大学学生转专业管理办法（修订）',
      'https://www.yeu.edu.cn/transfer-major-rule.doc',
      'official-transfer-major-rule-hash',
      '仰恩大学学生转专业管理办法（修订）。学生申请转专业应当按照学院公布的时间提交申请，经转出学院和转入学院审核。',
      now,
      now,
      now,
      now
    )
    value.client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, mime_type, content_hash,
        extracted_text, metadata_json, status, captured_at, processed_at, created_at, updated_at
      ) VALUES (?, ?, 'webpage', ?, ?, 'text/html', ?, ?, ?, 'ready', ?, ?, ?, ?)
    `).run(
      '00000000-0000-4000-8000-000000000008',
      value.sourceId,
      '仰恩大学学生转专业管理办法（修订）',
      'https://www.yeu.edu.cn/transfer-major-rule-landing',
      'official-transfer-major-rule-landing-hash',
      '仰恩大学学生转专业管理办法（修订）。本页正文由仰恩大学官网附件展示。',
      JSON.stringify({ attachmentLandingPage: true }),
      now + 1,
      now + 1,
      now + 1,
      now + 1
    )
    assert.equal(
      searchOfficialKnowledgeDocuments(value.client, ['转专业', '要求'], 5, '转专业有什么要求')[0]?.id,
      transferDocumentId
    )
    const statusDocumentId = '00000000-0000-4000-8000-000000000007'
    value.client.sqlite.prepare(`
      INSERT INTO knowledge_documents (
        id, source_id, kind, title, original_url, mime_type, content_hash,
        extracted_text, metadata_json, status, captured_at, processed_at, created_at, updated_at
      ) VALUES (?, ?, 'document', ?, ?, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ?, ?, '{}', 'ready', ?, ?, ?, ?)
    `).run(
      statusDocumentId,
      value.sourceId,
      '仰恩大学本科生学籍管理规定（修订）',
      'https://www.yeu.edu.cn/student-status-rule.docx',
      'official-student-status-rule-hash',
      '仰恩大学本科生学籍管理规定（修订）。本规定适用于普通本科学生和专升本学生的入学、注册、考核、成绩记载、休学与复学。',
      now,
      now,
      now,
      now
    )
    assert.equal(
      searchOfficialKnowledgeDocuments(value.client, ['本科生', '学籍管理', '规定'], 5, '本科生学籍管理有什么规定')[0]?.id,
      statusDocumentId
    )
    value.client.sqlite.prepare('UPDATE knowledge_documents SET status = \'archived\' WHERE id = ?').run(documentId)
    assert.deepEqual(searchOfficialKnowledgeDocuments(value.client, ['dormitory mattress'], 5), [])
  } finally {
    value.close()
  }
})

test('global evidence ranking requires the question subject instead of generic aspect words', () => {
  const value = fixture()
  try {
    const unrelated = retrieveCampusEvidence(value.client, '校车预约有什么条件', 8)
    assert.equal(unrelated.some(item => /奖学金|助学金/.test(item.title)), false)

    const transfer = retrieveCampusEvidence(value.client, '转专业有什么条件', 8)
    assert.equal(transfer.some(item => /奖学金|助学金/.test(item.title)), false)

    const library = retrieveCampusEvidence(value.client, '图书馆怎么借书', 8)
    assert.ok(library.some(item => item.title.includes('图书馆')))
  } finally {
    value.close()
  }
})

test('published knowledge requires a publishable source and quoted evidence', () => {
  const value = fixture()
  try {
    assert.throws(() => createKnowledgeClaim(value.client, {
      category: '住宿',
      title: '宿舍床尺寸',
      statement: '宿舍床尺寸以当年宿舍安排为准。',
      keywords: ['床垫', '宿舍床'],
      confidenceLabel: 'extracted',
      confidenceScore: 90,
      reviewStatus: 'published',
      publicUrl: '/campus',
      sourceNote: '',
      validFrom: null,
      validUntil: null,
      supersedesClaimId: null,
      sources: []
    }, value.adminId), /requires a source/)
  } finally {
    value.close()
  }
})

test('published facts are indexed, validity-gated and removed from retrieval after archive', () => {
  const value = fixture()
  try {
    const claim = createKnowledgeClaim(value.client, {
      category: '住宿',
      title: '新生床垫购买尺寸',
      statement: '购买床垫前先按宿舍床铺净尺寸核对，不要只按商家标称下单。',
      keywords: ['床垫', '买多大', '宿舍床尺寸'],
      confidenceLabel: 'extracted',
      confidenceScore: 92,
      reviewStatus: 'published',
      publicUrl: '/campus',
      sourceNote: '测试资料',
      validFrom: null,
      validUntil: null,
      supersedesClaimId: null,
      sources: [{
        sourceId: value.sourceId,
        documentId: null,
        evidenceQuote: '宿舍床铺尺寸应以所在楼栋现场测量结果为准。',
        locator: '住宿说明',
        isPrimary: true
      }]
    }, value.adminId)

    const matches = searchPublishedKnowledgeClaims(value.client, ['床垫', '尺寸'], 5)
    assert.equal(matches[0]?.id, claim.id)
    assert.match(matches[0]?.statement ?? '', /购买床垫/)
    const assistantEvidence = retrieveCampusEvidence(value.client, '新生应该买多大的床垫？', 8)
    assert.ok(assistantEvidence.some(item => item.title === '新生床垫购买尺寸'))
    assert.equal(knowledgeHealth(value.client).claims.published, 1)

    archiveKnowledgeClaim(value.client, claim.id, value.adminId)
    assert.deepEqual(searchPublishedKnowledgeClaims(value.client, ['床垫', '尺寸'], 5), [])
  } finally {
    value.close()
  }
})

test('updating a draft refreshes the FTS index before publication', () => {
  const value = fixture()
  try {
    const claim = createKnowledgeClaim(value.client, {
      category: '校历',
      title: '旧标题',
      statement: '内容尚未确认。',
      keywords: [],
      confidenceLabel: 'unverified',
      confidenceScore: 40,
      reviewStatus: 'draft',
      publicUrl: null,
      sourceNote: '',
      validFrom: null,
      validUntil: null,
      supersedesClaimId: null,
      sources: []
    }, value.adminId)
    updateKnowledgeClaim(value.client, claim.id, {
      title: '新生开学时间',
      statement: '新生开学时间见学校正式校历。',
      keywords: ['什么时候开学'],
      confidenceLabel: 'extracted',
      confidenceScore: 90,
      reviewStatus: 'published',
      sources: [{
        sourceId: value.sourceId,
        documentId: null,
        evidenceQuote: '新生报到时间以正式校历为准。',
        locator: '校历',
        isPrimary: true
      }]
    }, value.adminId)
    assert.equal(searchPublishedKnowledgeClaims(value.client, ['开学', '时间'], 3)[0]?.id, claim.id)
    assert.deepEqual(searchPublishedKnowledgeClaims(value.client, ['旧标题'], 3), [])
  } finally {
    value.close()
  }
})
