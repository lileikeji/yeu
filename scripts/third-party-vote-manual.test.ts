import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getDatabase } from '../server/database/client'
import {
  MANUAL_FORM_TOKEN,
  deleteThirdPartyVote,
  insertManualVotes,
  listThirdPartyVotes,
  summarizeThirdPartyVotes
} from '../server/modules/vote-sync/manual'

const MIGRATION = readFileSync('server/database/migrations/0088_third_party_vote_sync.sql', 'utf8')

function freshClient() {
  const client = getDatabase(':memory:')
  client.sqlite.exec('DROP TABLE IF EXISTS third_party_vote_records')
  client.sqlite.exec('DROP TABLE IF EXISTS third_party_vote_sync_states')

  for (const statement of MIGRATION.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()
    if (trimmed) client.sqlite.exec(trimmed)
  }

  return client
}

test('补录一票后统计为一条有效票', () => {
  const client = freshClient()
  const result = insertManualVotes(client, MANUAL_FORM_TOKEN, { optionId: '林敬凯' })

  assert.equal(result.inserted, 1)
  assert.deepEqual(summarizeThirdPartyVotes(client, MANUAL_FORM_TOKEN), {
    total: 1,
    valid: 1,
    watch: 0,
    voided: 0
  })

  const rows = listThirdPartyVotes(client, MANUAL_FORM_TOKEN)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.optionId, '林敬凯')
  assert.equal(rows[0]!.provider, 'manual')
  assert.equal(rows[0]!.status, 'valid')
  assert.equal(rows[0]!.score, 0)
  assert.deepEqual(rows[0]!.flags, [])
})

test('补录多票且指定等待审核状态', () => {
  const client = freshClient()
  insertManualVotes(client, MANUAL_FORM_TOKEN, { optionId: '姜阳', count: 3, status: 'watch' })

  assert.deepEqual(summarizeThirdPartyVotes(client, MANUAL_FORM_TOKEN), {
    total: 3,
    valid: 0,
    watch: 3,
    voided: 0
  })
})

test('单次补录数量上限为 50 票', () => {
  const client = freshClient()
  const result = insertManualVotes(client, MANUAL_FORM_TOKEN, { optionId: '苏家溢', count: 999 })

  assert.equal(result.inserted, 50)
  assert.equal(summarizeThirdPartyVotes(client, MANUAL_FORM_TOKEN).total, 50)
})

test('数量为 0 或负数时按 1 票处理', () => {
  const client = freshClient()
  assert.equal(insertManualVotes(client, MANUAL_FORM_TOKEN, { optionId: '林艳阳', count: 0 }).inserted, 1)
  assert.equal(insertManualVotes(client, MANUAL_FORM_TOKEN, { optionId: '林艳阳', count: -5 }).inserted, 1)
})

test('删除只移除指定记录且统计同步回落', () => {
  const client = freshClient()
  insertManualVotes(client, MANUAL_FORM_TOKEN, { optionId: '余孟依', count: 2 })

  const [first] = listThirdPartyVotes(client, MANUAL_FORM_TOKEN)
  assert.ok(first)
  const result = deleteThirdPartyVote(client, MANUAL_FORM_TOKEN, first.id)

  assert.equal(result.deleted, 1)
  assert.equal(summarizeThirdPartyVotes(client, MANUAL_FORM_TOKEN).total, 1)
})

test('不同 form_token 之间记录互不可见', () => {
  const client = freshClient()
  insertManualVotes(client, MANUAL_FORM_TOKEN, { optionId: '郭梓瑜' })
  insertManualVotes(client, 'MpuE34', { optionId: '游安祺' })

  assert.equal(summarizeThirdPartyVotes(client, MANUAL_FORM_TOKEN).total, 1)
  assert.equal(summarizeThirdPartyVotes(client, 'MpuE34').total, 1)
  assert.equal(listThirdPartyVotes(client, MANUAL_FORM_TOKEN)[0]!.optionId, '郭梓瑜')

  const manualRow = listThirdPartyVotes(client, MANUAL_FORM_TOKEN)[0]!
  assert.equal(deleteThirdPartyVote(client, 'MpuE34', manualRow.id).deleted, 0)
})

test('补录票与平台同步票在同一 form_token 下合并统计', () => {
  const client = freshClient()
  insertManualVotes(client, MANUAL_FORM_TOKEN, { optionId: '张晨捷' })
  client.sqlite.exec(`INSERT INTO third_party_vote_records
    (id, provider, form_token, record_id, option_id, voted_at, score, flags_json, status)
    VALUES ('jinshuju:abc', 'jinshuju', '${MANUAL_FORM_TOKEN}', 'abc', '张晨捷', 1790000000000, 0, '[]', 'valid')`)

  const summary = summarizeThirdPartyVotes(client, MANUAL_FORM_TOKEN)
  assert.equal(summary.total, 2)
  assert.equal(summary.valid, 2)

  const rows = listThirdPartyVotes(client, MANUAL_FORM_TOKEN)
  assert.deepEqual(rows.map(row => row.provider).sort(), ['jinshuju', 'manual'])
})
