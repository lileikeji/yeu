import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { ApiAssistantResponse } from '../shared/types/server'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { recordAssistantSuccess } from '../server/modules/assistant/analytics'
import type { AssistantAnswerResponse } from '../server/modules/assistant/assistant-response'
import { ANONYMOUS_SESSION_SCOPE, buildAssistantCacheKey } from '../server/modules/assistant/cache-key'
import { hashSessionKey, rememberExtractedFacts } from '../server/modules/assistant/memory'
import { maskAssistantQuery } from '../server/modules/assistant/query-mask'
import {
  answerCampusQuestion,
  assistantAnswerCacheStats,
  blockedAssistantResponse,
  clearAssistantAnswerCache
} from '../server/modules/assistant/service'

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

/**
 * 只走网关的答案生成：记忆抽取返回空，答案按本次请求里的会话记忆区分。
 * 会话记忆在答案调用的 user 载荷里（system 是固定指令），所以整包都要看。
 */
function gatewayStub(answerFor: (payload: string) => string) {
  return async (_input: string | URL, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      messages: Array<{ role: string, content: string }>
    }
    const payload = body.messages.map(message => message.content).join('\n')
    const content = payload.includes('记忆抽取')
      ? JSON.stringify({ memories: [] })
      : JSON.stringify({ answer: answerFor(payload), citation_indexes: [], confidence: 0.9 })
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

function withTemporaryDatabase(name: string, run: (client: DatabaseClient) => Promise<void>) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), name))
    const databasePath = join(directory, 'test.sqlite')
    const client = getDatabase(databasePath)
    const originalFetch = globalThis.fetch
    try {
      runMigrations(client)
      clearAssistantAnswerCache()
      await run(client)
    } finally {
      globalThis.fetch = originalFetch
      clearAssistantAnswerCache()
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function cacheRows(client: DatabaseClient) {
  return client.sqlite.prepare(
    'SELECT cache_key, query, knowledge_revision FROM assistant_answer_cache ORDER BY cache_key'
  ).all() as Array<{ cache_key: string, query: string, knowledge_revision: number }>
}

test('cache key carries the session scope and anonymous turns share one scope', () => {
  const anonymous = buildAssistantCacheKey({
    version: 'v',
    variant: 'standard',
    knowledgeRevision: 7,
    query: '我想了解一下奖学金政策'
  })
  assert.equal(anonymous, `v:standard:7:${ANONYMOUS_SESSION_SCOPE}:我想了解一下奖学金政策`)

  const first = buildAssistantCacheKey({
    version: 'v',
    variant: 'standard',
    knowledgeRevision: 7,
    sessionKey: 'session-a',
    sessionContext: ['[此前偏好] 用户关注宿舍条件'],
    query: '我想了解一下奖学金政策'
  })
  const second = buildAssistantCacheKey({
    version: 'v',
    variant: 'standard',
    knowledgeRevision: 7,
    sessionKey: 'session-b',
    sessionContext: ['[此前偏好] 用户关注奖学金公示'],
    query: '我想了解一下奖学金政策'
  })
  assert.match(first, /^v:standard:7:s[0-9a-f]{16}:/)
  assert.notEqual(first, second, 'different sessions must not collide')
  // 记忆变了，同一会话的新 key 也必须变（prompt 已注入新的 session_context）。
  const drift = buildAssistantCacheKey({
    version: 'v',
    variant: 'standard',
    knowledgeRevision: 7,
    sessionKey: 'session-a',
    sessionContext: ['[此前偏好] 用户关注宿舍条件', '[此前事实] 用户宿舍线路老化'],
    query: '我想了解一下奖学金政策'
  })
  assert.notEqual(drift, first, 'same session with new memory must miss the old entry')
})

test('two sessions asking the same question never share a cached answer', withTemporaryDatabase(
  'yeu-integrity-session-',
  async (client) => {
    const query = '我想了解一下奖学金政策'
    const sessionA = hashSessionKey('integrity-session-a')
    const sessionB = hashSessionKey('integrity-session-b')
    rememberExtractedFacts(client, sessionA, query, [{ kind: 'fact', content: '用户宿舍线路老化需要报修' }])
    rememberExtractedFacts(client, sessionB, query, [{ kind: 'preference', content: '用户关注奖学金公示名单' }])
    globalThis.fetch = gatewayStub((payload) => {
      if (payload.includes('线路老化')) return '先处理宿舍线路问题。'
      if (payload.includes('公示名单')) return '先看奖学金公示名单。'
      return '这是测试回答。'
    }) as unknown as typeof fetch

    const first = await answerCampusQuestion(client, query, { ...gatewayConfig, sessionKey: sessionA })
    const second = await answerCampusQuestion(client, query, { ...gatewayConfig, sessionKey: sessionB })
    assert.notEqual(first.answer, second.answer, 'session B must not be served session A\'s answer')

    const rows = cacheRows(client)
    assert.equal(rows.length, 2, 'one cache row per session scope')
    assert.equal(new Set(rows.map(row => row.cache_key)).size, 2)
    assert.ok(
      rows.every(row => /:s[0-9a-f]{16}:/u.test(row.cache_key)),
      `session scope segment missing: ${rows.map(row => row.cache_key).join(' , ')}`
    )

    // 同会话重问：第一轮回答后会话里多了一条「问过」记忆，key 因此变一次（保守但正确，
    // prompt 里的 session_context 真的变了）；上下文稳定后的重问才命中缓存。
    const repeat = await answerCampusQuestion(client, query, { ...gatewayConfig, sessionKey: sessionA })
    assert.equal(repeat.answer, first.answer)
    const repeatAgain = await answerCampusQuestion(client, query, { ...gatewayConfig, sessionKey: sessionA })
    assert.equal(repeatAgain.answer, first.answer)
    assert.equal(repeatAgain.cacheHit, true, 'a stable session context reuses its own cached answer')
    assert.equal(assistantAnswerCacheStats().hits > 0, true)
    const finalRows = cacheRows(client)
    assert.equal(new Set(finalRows.map(row => row.cache_key)).size, finalRows.length)
    assert.equal(finalRows.some(row => /:s[0-9a-f]{16}:/u.test(row.cache_key)), true)
    // B 会话的行不能被 A 会话的命中去掉，也不能被 A 的答案污染。
    assert.ok(cacheRows(client).length >= 2)
    const countCached = (needle: string) => (client.sqlite.prepare(
      'SELECT count(*) AS n FROM assistant_answer_cache WHERE response_json LIKE ?'
    ).get(`%${needle}%`) as { n: number }).n
    assert.ok(countCached('先处理宿舍线路问题') > 0, 'session A answer stays cached under its own key')
    assert.ok(countCached('先看奖学金公示名单') > 0, 'session B answer stays cached under its own key')
  }
))

test('a model answer without citation indexes gets no citation instead of a fake one', withTemporaryDatabase(
  'yeu-integrity-citation-',
  async (client) => {
    globalThis.fetch = gatewayStub(() => '奖学金按学年评定。') as unknown as typeof fetch
    const response = await answerCampusQuestion(client, '我想了解一下奖学金政策', gatewayConfig) as AssistantAnswerResponse
    assert.equal(response.mode, 'ai')
    assert.equal(response.citations.length, 0, 'no evidence may be attached when the model cited nothing')
    assert.equal(response.citationStatus, 'none')
    assert.equal(response.answer, '奖学金按学年评定。')
  }
))

test('blocked answers report failure and are never cached', withTemporaryDatabase(
  'yeu-integrity-blocked-',
  async (client) => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: { category: 'prompt_injection', blocked: true }
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
    const response = await answerCampusQuestion(client, '我想了解一下奖学金政策', gatewayConfig) as AssistantAnswerResponse
    assert.equal(response.answer, '禁止回答')
    assert.equal(response.confidence, 0)
    assert.equal(response.blocked, true)
    assert.equal(response.citationStatus, 'none')
    assert.equal(cacheRows(client).length, 0, 'a refusal must never be stored as an answer')
    assert.equal(assistantAnswerCacheStats().size, 0)
    assert.equal(assistantAnswerCacheStats().blockedSkipped > 0, true)
  }
))

test('queries are masked before they are stored', withTemporaryDatabase(
  'yeu-integrity-mask-',
  async (client) => {
    const raw = '我叫张三，学号是20231234，手机号13812345678'
    const masked = maskAssistantQuery(raw)
    assert.ok(!masked.includes('张三'), `name leaked: ${masked}`)
    assert.ok(!masked.includes('20231234'), `student id leaked: ${masked}`)
    assert.ok(!masked.includes('13812345678'), `phone leaked: ${masked}`)
    assert.equal(maskAssistantQuery(masked), masked, 'masking is idempotent')
    // 「我是……」是普通自述，不是姓名，不能被遮。
    assert.equal(maskAssistantQuery('我是专升本的学生'), '我是专升本的学生')

    const answer: ApiAssistantResponse = {
      query: raw,
      mode: 'ai',
      answer: '测试回答',
      citations: [],
      usedWebSearch: false,
      confidence: 1
    }
    recordAssistantSuccess(client, { requestId: randomUUID(), query: raw }, answer)
    const stored = client.sqlite.prepare(
      'SELECT query, success, error_code FROM assistant_runs ORDER BY created_at DESC LIMIT 1'
    ).get() as { query: string, success: number, error_code: string | null }
    assert.equal(stored.query, masked)
    assert.equal(stored.success, 1)
    assert.equal(stored.error_code, null)

    recordAssistantSuccess(
      client,
      { requestId: randomUUID(), query: raw },
      blockedAssistantResponse(raw)
    )
    const blockedRow = client.sqlite.prepare(
      'SELECT query, success, error_code FROM assistant_runs ORDER BY created_at DESC LIMIT 1'
    ).get() as { query: string, success: number, error_code: string | null }
    assert.equal(blockedRow.query, masked)
    assert.equal(blockedRow.success, 0, 'a refusal is not a successful answer')
    assert.equal(blockedRow.error_code, 'BLOCKED_QUERY')
  }
))

test('the admission-plan gap answer cites nothing rather than padding with retrieved evidence', withTemporaryDatabase(
  'yeu-integrity-admission-citation-',
  async (client) => {
    const now = Date.now()
    // 能被检索命中，但标题既不写「普通本科」也不写 2025：正文只点名招生计划页，
    // 这条证据没被点名。旧实现回退 evidence.slice(0, 2)，把它挂成了引用。
    client.sqlite.prepare(`
      INSERT INTO contents (id, kind, slug, title, summary, body, metadata_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'test-admission-plan-overview', 'guide', 'admission-plan-overview', '招生计划发布入口汇总',
      '学校逐年发布招生计划，具体人数以当年公告为准。',
      '招生计划按年度发布，专升本与普通本科分列。',
      '{}', 'published', now, now
    )
    globalThis.fetch = gatewayStub(() => '这段回答不该出现') as unknown as typeof fetch

    const response = await answerCampusQuestion(
      client,
      '2025年普通本科招生计划招多少人',
      gatewayConfig
    ) as AssistantAnswerResponse

    assert.match(response.answer, /正文里没有可以核验的招生总人数/u, 'must take the admission-plan gap branch')
    assert.equal(response.citations.length, 0, 'evidence the answer never names must not be cited')
    assert.equal(response.citationStatus, 'none')
    assert.equal(response.evidenceGap, true)
  }
))
