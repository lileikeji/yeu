import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../server/database/client'
import { thirdPartyVoteSyncStates } from '../server/database/schema'
import { recordThirdPartySyncState } from '../server/modules/vote-sync/ingest'

const BASE_MIGRATION = readFileSync('server/database/migrations/0088_third_party_vote_sync.sql', 'utf8')
const FAILURE_MIGRATION = readFileSync('server/database/migrations/0099_third_party_vote_sync_failures.sql', 'utf8')
const FORM_TOKEN = 'HEALTHCHECK'

function freshClient() {
  const client = getDatabase(':memory:')
  client.sqlite.exec('DROP TABLE IF EXISTS third_party_vote_records')
  client.sqlite.exec('DROP TABLE IF EXISTS third_party_vote_sync_states')

  for (const sql of [BASE_MIGRATION, FAILURE_MIGRATION]) {
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed) client.sqlite.exec(trimmed)
    }
  }

  return client
}

function readState(client: ReturnType<typeof freshClient>) {
  const row = client.db
    .select()
    .from(thirdPartyVoteSyncStates)
    .where(eq(thirdPartyVoteSyncStates.id, `jinshuju:${FORM_TOKEN}`))
    .get()
  assert.ok(row, '同步状态行必须存在')
  return row
}

test('同步失败计数：首次失败置连续 1 次、累计 1 次并记录时间', () => {
  const client = freshClient()
  const context = { client, salt: 'test-salt' }

  recordThirdPartySyncState(context, { formToken: FORM_TOKEN, added: 3, lastEntryAt: 1_700_000_000_000 })
  const okRow = readState(client)
  assert.equal(okRow.totalSynced, 3)
  assert.equal(okRow.failureStreak, 0)
  assert.equal(okRow.totalFailures, 0)
  assert.equal(okRow.lastError, null)
  assert.equal(okRow.lastErrorAt, null)

  recordThirdPartySyncState(context, { formToken: FORM_TOKEN, error: '金数据返回 404（表单不存在或无权访问）' })
  const failedRow = readState(client)
  assert.equal(failedRow.failureStreak, 1)
  assert.equal(failedRow.totalFailures, 1)
  assert.equal(failedRow.lastError, '金数据返回 404（表单不存在或无权访问）')
  assert.equal(typeof failedRow.lastErrorAt, 'number')
  // 失败不能把已入库的数量和水位冲掉。
  assert.equal(failedRow.totalSynced, 3)
  assert.equal(failedRow.lastEntryAt, 1_700_000_000_000)
})

test('同步失败计数：连续失败累加，恢复后归零但不抹掉累计次数', () => {
  const client = freshClient()
  const context = { client, salt: 'test-salt' }

  recordThirdPartySyncState(context, { formToken: FORM_TOKEN, error: 'first' })
  recordThirdPartySyncState(context, { formToken: FORM_TOKEN, error: 'second' })
  const twice = readState(client)
  assert.equal(twice.failureStreak, 2)
  assert.equal(twice.totalFailures, 2)
  assert.equal(twice.lastError, 'second')

  recordThirdPartySyncState(context, { formToken: FORM_TOKEN, added: 5, cursor: 'cursor-1' })
  const recovered = readState(client)
  assert.equal(recovered.failureStreak, 0)
  assert.equal(recovered.totalFailures, 2)
  assert.equal(recovered.lastError, null)
  assert.equal(recovered.cursor, 'cursor-1')
  assert.equal(recovered.lastErrorAt, twice.lastErrorAt)
})

test('同步失败计数：不同表单各记一行，互不影响', () => {
  const client = freshClient()
  const context = { client, salt: 'test-salt' }

  recordThirdPartySyncState(context, { formToken: FORM_TOKEN, error: 'boom' })
  recordThirdPartySyncState(context, { formToken: 'OTHERFORM', added: 1 })

  assert.equal(readState(client).failureStreak, 1)
  const other = client.db
    .select()
    .from(thirdPartyVoteSyncStates)
    .where(eq(thirdPartyVoteSyncStates.id, 'jinshuju:OTHERFORM'))
    .get()
  assert.ok(other)
  assert.equal(other.failureStreak, 0)
  assert.equal(other.totalFailures, 0)
  assert.equal(other.totalSynced, 1)
})
