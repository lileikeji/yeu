import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { answerCampusQuestion } from '../server/modules/assistant/service'
import {
  clearSessionMemories,
  cleanupExpiredSessionMemories,
  forgetSessionMemory,
  hashSessionKey,
  isValidSessionId,
  readLastSessionQuery,
  rememberSessionTurn,
  retrieveSessionMemories,
  sessionMemoryStats,
  sessionQueryHash
} from '../server/modules/assistant/memory'
import { seedAssistantKnowledge } from './seed-assistant-knowledge'

const emptyAssistantConfig = {
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

function freshClient() {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-assistant-memory-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  return { directory, databasePath, client }
}

test('session ids are hashed deterministically and validated', () => {
  const first = hashSessionKey('session-abc-123')
  const second = hashSessionKey('session-abc-123')
  const other = hashSessionKey('session-xyz-999')
  assert.equal(first, second)
  assert.equal(first.length, 64)
  assert.notEqual(first, other)
  assert.equal(isValidSessionId('session-abc-123'), true)
  assert.equal(isValidSessionId('abc'), false)
  assert.equal(isValidSessionId('a'.repeat(200)), false)
  assert.equal(isValidSessionId('bad session id!'), false)
  assert.equal(isValidSessionId(undefined), false)
  assert.equal(isValidSessionId(null), false)
})

test('memory turns are ADD-only, deduplicated and session-scoped', () => {
  const { directory, databasePath, client } = freshClient()
  try {
    const sessionA = hashSessionKey('session-a')
    const sessionB = hashSessionKey('session-b')
    rememberSessionTurn(client, sessionA, {
      query: '饮水机的水能喝吗',
      answer: '内置资料显示可以直接饮用。',
      confidence: 0.92,
      mode: 'local'
    })
    // Same question again: refreshed, not duplicated.
    rememberSessionTurn(client, sessionA, {
      query: '饮水机的水能喝吗',
      answer: '内置资料显示可以直接饮用。',
      confidence: 0.92,
      mode: 'local'
    })
    // Another session stays isolated.
    rememberSessionTurn(client, sessionB, {
      query: '食堂几点开饭',
      answer: '内置资料没有找到相关时间。',
      confidence: 0.3,
      mode: 'local'
    })

    const rowsA = client.sqlite.prepare(
      'SELECT kind, content FROM assistant_session_memory WHERE session_key = ?'
    ).all(sessionA) as Array<{ kind: string, content: string }>
    const answered = rowsA.filter(row => row.kind === 'answered')
    assert.equal(answered.length, 1, 'duplicate turns must deduplicate')
    assert.equal(answered[0].content, '饮水机的水能喝吗')

    const rowsB = client.sqlite.prepare(
      'SELECT kind FROM assistant_session_memory WHERE session_key = ?'
    ).all(sessionB) as Array<{ kind: string }>
    assert.ok(rowsB.length >= 1)
    assert.ok(rowsB.some(row => row.kind === 'open_question'), 'low-confidence gap turns are remembered as open questions')

    const retrieved = retrieveSessionMemories(client, sessionA, '饮水机的水能喝吗', 5)
    assert.ok(retrieved.some(item => item.content.includes('饮水机')), 'matching memory is retrieved')
    assert.equal(retrieved.some(item => item.content.includes('食堂')), false, 'other sessions never leak')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('fact extraction remembers clear first-person identity signals', () => {
  const { directory, databasePath, client } = freshClient()
  try {
    const sessionKey = hashSessionKey('fact-session')
    rememberSessionTurn(client, sessionKey, {
      query: '我是专升本的学生，档案要寄到哪里？',
      answer: '内置资料暂时没有找到。',
      confidence: 0.3,
      mode: 'local'
    })
    const facts = client.sqlite.prepare(
      'SELECT content FROM assistant_session_memory WHERE session_key = ? AND kind = ?'
    ).all(sessionKey, 'fact') as Array<{ content: string }>
    assert.ok(facts.some(row => row.content.includes('专升本')), 'identity fact is extracted')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('last query, forget, clear, stats and cleanup behave', () => {
  const { directory, databasePath, client } = freshClient()
  try {
    const sessionKey = hashSessionKey('mgmt-session')
    rememberSessionTurn(client, sessionKey, { query: '宿舍床多大', answer: '长1.9米。', confidence: 0.9, mode: 'local' })
    rememberSessionTurn(client, sessionKey, { query: '那多少钱呢', answer: '待学校通知。', confidence: 0.4, mode: 'local' })
    assert.equal(readLastSessionQuery(client, sessionKey), '那多少钱呢')

    const stats = sessionMemoryStats(client, sessionKey)
    assert.equal(stats.answered, 2)

    const all = client.sqlite.prepare(
      'SELECT id FROM assistant_session_memory WHERE session_key = ?'
    ).all(sessionKey) as Array<{ id: string }>
    assert.ok(all.length >= 2)
    const removed = forgetSessionMemory(client, sessionKey, all[0].id)
    assert.equal(removed, true)
    assert.equal(forgetSessionMemory(client, sessionKey, 'missing-id'), false)
    assert.equal(forgetSessionMemory(client, hashSessionKey('other'), all[0].id), false, 'cannot forget another session memory')

    // Expire one row manually, then clean only expired rows.
    const remaining = client.sqlite.prepare(
      'SELECT id FROM assistant_session_memory WHERE session_key = ?'
    ).all(sessionKey) as Array<{ id: string }>
    client.sqlite.prepare(
      'UPDATE assistant_session_memory SET expires_at = ? WHERE id = ?'
    ).run(Date.now() - 1000, remaining[0].id)
    assert.equal(cleanupExpiredSessionMemories(client), 1)

    const afterCleanup = client.sqlite.prepare(
      'SELECT count(*) AS value FROM assistant_session_memory WHERE session_key = ?'
    ).get(sessionKey) as { value: number }
    assert.ok(afterCleanup.value >= 1)

    const cleared = clearSessionMemories(client, sessionKey)
    assert.ok(cleared >= 1)
    const zero = client.sqlite.prepare(
      'SELECT count(*) AS value FROM assistant_session_memory WHERE session_key = ?'
    ).get(sessionKey) as { value: number }
    assert.equal(zero.value, 0)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('answerCampusQuestion keeps memory off without a session key', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-assistant-memory-off-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    seedAssistantKnowledge({ apply: true, databasePath })
    const client = getDatabase(databasePath)
    const response = await answerCampusQuestion(client, '学校可以染头发吗', emptyAssistantConfig)
    assert.equal(response.mode, 'local')
    const rows = client.sqlite.prepare('SELECT count(*) AS value FROM assistant_session_memory').get() as { value: number }
    assert.equal(rows.value, 0, 'no session key means no memory writes')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('session turns persist memory and compose follow-ups from the session', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-assistant-memory-session-'))
  const databasePath = join(directory, 'test.sqlite')
  try {
    seedAssistantKnowledge({ apply: true, databasePath })
    const client = getDatabase(databasePath)
    const sessionKey = hashSessionKey('integration-session')
    const config = { ...emptyAssistantConfig, sessionKey }

    const first = await answerCampusQuestion(client, '我是专升本的学生，档案要寄到哪里？', config)
    assert.ok(first.answer.length > 0)

    const rows = client.sqlite.prepare(
      'SELECT kind, content FROM assistant_session_memory WHERE session_key = ?'
    ).all(sessionKey) as Array<{ kind: string, content: string }>
    assert.ok(rows.some(row => row.kind === 'answered'), 'every session turn is remembered')
    assert.ok(rows.some(row => row.kind === 'fact' && row.content.includes('专升本')), 'identity facts are extracted')

    // A second turn composes the follow-up against the session last query.
    const second = await answerCampusQuestion(client, '那要准备什么材料呢', config)
    assert.ok(second.answer.length > 0)
    const last = readLastSessionQuery(client, sessionKey)
    assert.equal(last, '那要准备什么材料呢')

    const stats = sessionMemoryStats(client, sessionKey)
    assert.equal(stats.answered, 2)
    assert.ok(sessionQueryHash('档案') !== sessionQueryHash('宿舍'), 'query hashes are stable and distinct')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
