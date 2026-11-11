import assert from 'node:assert/strict'
import test from 'node:test'
import { getDatabase } from '../server/database/client'
import { getClaimEvidence, isPublicClaimId } from '../server/modules/knowledge/evidence'
import { createFeedbackReceiptCode, isFeedbackReceiptCode } from '../server/modules/feedback/service'

/**
 * E 批「立信」的回归：
 *
 * 1. 事实结论的证据链必须能单独取到（来源、核验时间、抓取时间、原文摘录）；
 * 2. 没有来源的结论必须如实返回 `citationStatus: 'none'`，绝不用同一实体的
 *    其它结论或别的来源顶替——这是本站「说得准」的底线；
 * 3. 未发布结论、非法 id 一律当不存在，不泄露库里是否有这条记录；
 * 4. 纠错回执号要能被人念出来、抄下来（去 I/O/0/1），并且能反查状态。
 */

const TABLES = `
create table knowledge_claims (
  id text primary key,
  category text not null,
  title text not null,
  statement text not null,
  confidence_label text not null default 'unverified',
  confidence_score integer not null default 50,
  review_status text not null default 'draft',
  valid_from integer,
  valid_until integer,
  published_at integer,
  created_at integer,
  updated_at integer
);
create table sources (
  id text primary key,
  title text not null,
  url text not null,
  source_level text not null,
  is_official integer not null default 0,
  accessed_at integer not null
);
create table knowledge_documents (
  id text primary key,
  title text not null,
  captured_at integer not null
);
create table knowledge_claim_sources (
  id text primary key,
  claim_id text not null,
  source_id text,
  document_id text,
  evidence_quote text not null default '',
  locator text not null default '',
  is_primary integer not null default 0,
  created_at integer
);
create table knowledge_entities (
  id text primary key,
  entity_type text not null,
  canonical_name text not null
);
create table knowledge_claim_entities (
  claim_id text not null,
  entity_id text not null,
  role text not null default 'mentioned',
  created_at integer,
  primary key (claim_id, entity_id, role)
);
`

let cachedFixture: ReturnType<typeof createFixture> | null = null

function buildFixture() {
  if (!cachedFixture) {
    cachedFixture = createFixture()
  }

  return cachedFixture
}

function createFixture() {
  // better-sqlite3 的 :memory: 由 getDatabase 按路径缓存，整个文件共用一个库。
  const client = getDatabase(':memory:')
  client.sqlite.exec(TABLES)

  const accessedAt = 1_760_000_000_000
  const capturedAt = 1_759_000_000_000

  client.sqlite.exec(`
    insert into knowledge_entities (id, entity_type, canonical_name)
    values ('ent-scholarship', 'policy', '仰恩奖学金');
    insert into sources (id, title, url, source_level, is_official, accessed_at)
    values ('src-official', '仰恩大学学生手册（2025 版）', 'https://www.yeu.edu.cn/xsc/2025.pdf', 'A', 1, ${accessedAt});
    insert into knowledge_documents (id, title, captured_at)
    values ('doc-handbook', '学生手册 2025 版', ${capturedAt});
    insert into knowledge_claims (id, category, title, statement, confidence_label, confidence_score, review_status, published_at, updated_at)
    values
      ('claim-scholarship-amount', 'scholarship', '一等奖学金金额', '仰恩大学一等奖学金每学年 2000 元。', 'extracted', 88, 'published', 1_759_500_000, 1_759_800_000),
      ('claim-scholarship-quota', 'scholarship', '一等奖学金名额', '一等奖学金按专业前 5% 评选。', 'extracted', 80, 'published', 1_759_500_000, 1_759_800_000),
      ('claim-scholarship-vague', 'scholarship', '奖学金发放时间', '奖学金一般在每学年第二学期发放。', 'unverified', 40, 'published', 1_759_500_000, 1_759_800_000),
      ('claim-scholarship-draft', 'scholarship', '草稿结论', '这条还没审。', 'unverified', 30, 'draft', null, 1_759_800_000);
    insert into knowledge_claim_sources (id, claim_id, source_id, document_id, evidence_quote, locator, is_primary, created_at)
    values ('cs-1', 'claim-scholarship-amount', 'src-official', 'doc-handbook', '一等奖学金：每学年 2000 元。', '第 3 章', 1, 1_759_600_000);
    insert into knowledge_claim_entities (claim_id, entity_id, role, created_at)
    values
      ('claim-scholarship-amount', 'ent-scholarship', 'object', 1_759_600_000),
      ('claim-scholarship-quota', 'ent-scholarship', 'object', 1_759_600_000),
      ('claim-scholarship-vague', 'ent-scholarship', 'mentioned', 1_759_600_000);
  `)

  return { client, accessedAt, capturedAt }
}

test('证据链：有来源的已发布结论带回来源、核验时间与抓取时间', () => {
  const { client, accessedAt, capturedAt } = buildFixture()
  const evidence = getClaimEvidence(client, 'claim-scholarship-amount')

  assert.ok(evidence, '已发布结论必须能取到证据')
  assert.equal(evidence.citationStatus, 'available')
  assert.equal(evidence.claim.id, 'claim-scholarship-amount')
  assert.equal(evidence.sources.length, 1)

  const [source] = evidence.sources
  assert.equal(source.sourceTitle, '仰恩大学学生手册（2025 版）')
  assert.equal(source.sourceLevel, 'A')
  assert.equal(source.isOfficial, true)
  assert.equal(source.verifiedAt, new Date(accessedAt).toISOString())
  assert.equal(source.fetchedAt, new Date(capturedAt).toISOString())
  assert.equal(source.quote, '一等奖学金：每学年 2000 元。')
})

test('证据链：没有来源时不顶替，如实返回 none', () => {
  const { client } = buildFixture()
  const evidence = getClaimEvidence(client, 'claim-scholarship-vague')

  assert.ok(evidence, '结论本身存在，应该返回结论与明确的“无来源”状态')
  assert.equal(evidence.citationStatus, 'none')
  assert.deepEqual(evidence.sources, [])
})

test('证据链：同一实体的已发布结论数用于表达“还有哪些相关结论”', () => {
  const { client } = buildFixture()
  const evidence = getClaimEvidence(client, 'claim-scholarship-amount')

  assert.ok(evidence)
  assert.equal(evidence.entity?.canonicalName, '仰恩奖学金')
  assert.equal(evidence.claimCount, 3)
})

test('证据链：未发布结论与非法 id 一律当不存在', () => {
  const { client } = buildFixture()

  assert.equal(getClaimEvidence(client, 'claim-scholarship-draft'), null)
  assert.equal(getClaimEvidence(client, ''), null)
  assert.equal(getClaimEvidence(client, 'a'.repeat(201)), null)
  assert.equal(getClaimEvidence(client, 'claim with space'), null)
  assert.equal(isPublicClaimId('docclaim:doc-handbook:9f2c1a'), true)
  assert.equal(isPublicClaimId('-leading-dash'), false)
})

test('纠错回执号：可念可抄，格式固定且能反查', () => {
  const codes = new Set<string>()
  for (let index = 0; index < 50; index += 1) {
    const code = createFeedbackReceiptCode()
    assert.match(code, /^YEU-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    assert.equal(isFeedbackReceiptCode(code), true)
    codes.add(code)
  }

  // 6 位 32 进制：50 次抽样不该撞车，撞了说明随机源被写死。
  assert.equal(codes.size, 50)
  assert.equal(isFeedbackReceiptCode('YEU-ABC123'), false, '字母表不含 1')
  assert.equal(isFeedbackReceiptCode('YEU-ABCDE'), false, '长度不足')
  assert.equal(isFeedbackReceiptCode('yeu-ABCDEF'), false, '必须大写')
})
