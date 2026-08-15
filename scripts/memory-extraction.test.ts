import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { answerCampusQuestion } from '../server/modules/assistant/service'
import {
  consolidateSessionMemories,
  hashSessionKey,
  rememberExtractedFacts,
  sessionMemoryStats,
  sessionMemoryTtlMs
} from '../server/modules/assistant/memory'

const gatewayConfig = {
  gatewayBaseUrl: 'https://gateway.example.com',
  gatewayApiKey: 'test-key',
  gatewayModel: 'test-model',
  gatewayTimeoutMs: 3000,
  mcpSearchUrl: '',
  mcpSearchBearerToken: '',
  mcpAllowedHosts: '',
  mcpToolName: '',
  mcpTimeoutMs: 1000,
  // Tests must not depend on ambient DNS for the SSRF gate.
  gatewayLookup: async () => ['93.184.216.34']
}

interface FetchStub {
  (input: string | URL, init?: { body?: string }): Promise<Response>
}

function fakeGateway(extractionMemories: Array<{ kind: string, content: string }>): FetchStub {
  return async (input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      messages: Array<{ role: string, content: string }>
    }
    const system = body.messages.find(message => message.role === 'system')?.content ?? ''
    const isExtraction = system.includes('记忆抽取')
    const content = isExtraction
      ? JSON.stringify({ memories: extractionMemories })
      : JSON.stringify({ answer: '这是测试回答。', citation_indexes: [], confidence: 0.9 })
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

test('LLM extraction writes user facts ADD-only into session memory', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-memory-extract-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  const originalFetch = globalThis.fetch
  try {
    runMigrations(client)
    const sessionKey = hashSessionKey('extract-session')
    globalThis.fetch = fakeGateway([
      { kind: 'fact', content: '用户是专升本学生' },
      { kind: 'preference', content: '用户关注宿舍条件' }
    ]) as unknown as typeof fetch

    const config = { ...gatewayConfig, sessionKey }
    const response = await answerCampusQuestion(client, '我是专升本的学生，宿舍条件怎么样', config)
    assert.ok(response.answer.length > 0)

    const facts = client.sqlite.prepare(
      'SELECT kind, content FROM assistant_session_memory WHERE session_key = ? AND kind IN (?, ?)'
    ).all(sessionKey, 'fact', 'preference') as Array<{ kind: string, content: string }>
    assert.ok(facts.some(item => item.kind === 'fact' && item.content.includes('专升本')), 'fact entry written')
    assert.ok(facts.some(item => item.kind === 'preference' && item.content.includes('宿舍')), 'preference entry written')

    // ADD-only: re-running the same turn does not duplicate the entries.
    await answerCampusQuestion(client, '我是专升本的学生，宿舍条件怎么样', config)
    const after = client.sqlite.prepare(
      'SELECT count(*) AS n FROM assistant_session_memory WHERE session_key = ? AND kind IN (?, ?)'
    ).get(sessionKey, 'fact', 'preference') as { n: number }
    assert.equal(after.n, facts.length, 'identical extraction is not duplicated')

    const stats = sessionMemoryStats(client, sessionKey)
    assert.ok(stats.fact >= 1)
    assert.ok(stats.preference >= 1)
  } finally {
    globalThis.fetch = originalFetch
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('extraction failures never break the answer or poison the gateway circuit', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-memory-extract-fail-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  const originalFetch = globalThis.fetch
  try {
    runMigrations(client)
    const sessionKey = hashSessionKey('extract-fail-session')
    // Answer succeeds; every extraction call (system prompt contains 记忆抽取) fails.
    globalThis.fetch = (async (input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages: Array<{ role: string, content: string }> }
      const system = body.messages.find(message => message.role === 'system')?.content ?? ''
      if (system.includes('记忆抽取')) {
        return new Response('{}', { status: 500 })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: '正常回答', citation_indexes: [], confidence: 0.9 }) } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }) as unknown as typeof fetch

    const config = { ...gatewayConfig, sessionKey }
    const response = await answerCampusQuestion(client, '我想了解一下奖学金政策', config)
    assert.ok(response.answer.length > 0, 'answer still succeeds despite extraction failure')
    const facts = client.sqlite.prepare(
      'SELECT count(*) AS n FROM assistant_session_memory WHERE session_key = ? AND kind IN (?, ?)'
    ).get(sessionKey, 'fact', 'preference') as { n: number }
    assert.equal(facts.n, 0, 'no extracted facts written on failure')
  } finally {
    globalThis.fetch = originalFetch
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('memory TTL respects the environment override', () => {
  const previous = process.env.NUXT_ASSISTANT_MEMORY_TTL_DAYS
  try {
    delete process.env.NUXT_ASSISTANT_MEMORY_TTL_DAYS
    const defaultMs = sessionMemoryTtlMs()
    assert.equal(defaultMs, 30 * 24 * 60 * 60 * 1000)
    process.env.NUXT_ASSISTANT_MEMORY_TTL_DAYS = '7'
    assert.equal(sessionMemoryTtlMs(), 7 * 24 * 60 * 60 * 1000)
    process.env.NUXT_ASSISTANT_MEMORY_TTL_DAYS = '999'
    assert.equal(sessionMemoryTtlMs(), 30 * 24 * 60 * 60 * 1000, 'out-of-range falls back to default')
  } finally {
    if (previous === undefined) delete process.env.NUXT_ASSISTANT_MEMORY_TTL_DAYS
    else process.env.NUXT_ASSISTANT_MEMORY_TTL_DAYS = previous
  }
})

test('memory-recall questions answer from session memories instead of the gap response', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-memory-recall-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  const originalFetch = globalThis.fetch
  try {
    runMigrations(client)
    const sessionKey = hashSessionKey('recall-session')
    // Pre-store a preference as if a previous turn had extracted it.
    rememberExtractedFacts(client, sessionKey, '我喜欢在晚上学习', [
      { kind: 'preference', content: '用户认为自己晚上学习效率更高' }
    ])

    // The gateway is absent: the retrieval pipeline would normally short-circuit
    // to the canned gap response. The memory-recall handler must answer instead.
    globalThis.fetch = (async () => {
      throw new Error('gateway must not be called for a memory recall')
    }) as unknown as typeof fetch

    const config = { ...gatewayConfig, sessionKey }
    const response = await answerCampusQuestion(client, '我刚才说我一般喜欢什么时候学习', config)
    assert.equal(response.mode, 'local')
    assert.equal(response.usedWebSearch, false)
    assert.ok(response.answer.includes('晚上学习'), 'recall answer surfaces the stored preference')
    assert.ok(response.answer.includes('之前的对话'), 'recall answer is labeled as session memory')
    assert.ok(response.confidence >= 0.8)

    // A statement that introduces NEW information must not be hijacked by the
    // recall handler (no past-reference): it should go through the normal
    // pipeline (which with no gateway degrades gracefully).
    const plain = await answerCampusQuestion(client, '我喜欢在操场上夜跑', config)
    assert.ok(!plain.answer.includes('根据我们之前的对话记录'), 'new statements are not treated as recall')
  } finally {
    globalThis.fetch = originalFetch
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('consolidation merges near-duplicate extracted facts per session', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-memory-consolidate-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const sessionKey = hashSessionKey('consolidate-session')
    // Near-duplicate preferences (same meaning, slightly different wording).
    rememberExtractedFacts(client, sessionKey, '我喜欢晚上学习', [
      { kind: 'preference', content: '用户喜欢在晚上学习' },
      { kind: 'preference', content: '用户喜欢在晚上学习效率更高' }
    ])
    // A distinct fact that must survive.
    rememberExtractedFacts(client, sessionKey, '我是专升本学生', [
      { kind: 'fact', content: '用户是专升本学生' }
    ])

    const dry = consolidateSessionMemories(client, { apply: false })
    assert.ok(dry.scanned >= 3)
    assert.ok(dry.removed >= 1, 'near-duplicate preference detected')
    assert.ok(dry.duplicates.every(d => d.kind === 'preference'))
    // Dry run must not delete anything.
    const before = client.sqlite.prepare(
      'SELECT count(*) AS n FROM assistant_session_memory WHERE session_key = ?'
    ).get(sessionKey) as { n: number }
    assert.equal(before.n, 3)

    const applied = consolidateSessionMemories(client, { apply: true })
    assert.ok(applied.removed >= 1)
    const after = client.sqlite.prepare(
      'SELECT count(*) AS n, group_concat(content) AS contents FROM assistant_session_memory WHERE session_key = ?'
    ).get(sessionKey) as { n: number, contents: string }
    assert.equal(after.n, 2, 'one duplicate removed, distinct fact kept')
    assert.ok(after.contents.includes('专升本'), 'distinct fact survives')
    assert.ok(after.contents.includes('晚上学习'), 'newest preference survives')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
