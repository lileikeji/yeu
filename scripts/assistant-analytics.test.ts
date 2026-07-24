import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  listAssistantRuns,
  recordAssistantFailure,
  recordAssistantSuccess
} from '../server/modules/assistant/analytics'

test('assistant analytics records retrieval paths, timings and failures', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-assistant-analytics-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    recordAssistantSuccess(client, {
      requestId: 'request-success',
      query: '奖学金有哪些要求',
      ipAddress: '127.0.0.1'
    }, {
      query: '奖学金有哪些要求',
      mode: 'local',
      answer: '完整规则',
      citations: [{ title: '规则', url: '/student-rules', snippet: '规则', source: 'site' }],
      usedWebSearch: false,
      confidence: 0.98,
      retrievalPath: 'local_database',
      cacheHit: false,
      totalDurationMs: 15,
      trace: [
        { stage: 'query_analysis', label: '分析问题', durationMs: 2, status: 'completed' },
        { stage: 'local_database', label: '搜索内置数据库', durationMs: 8, status: 'completed' },
        { stage: 'answer_generation', label: '整理答案', durationMs: 5, status: 'completed' }
      ]
    })
    recordAssistantFailure(client, {
      requestId: 'request-failure',
      query: '缺少资料的问题',
      ipAddress: '127.0.0.2'
    }, 'AI_UNAVAILABLE', 1200)

    const result = listAssistantRuns(client, { page: 1, pageSize: 20 })
    assert.equal(result.total, 2)
    assert.equal(result.stats.successRate, 0.5)
    assert.equal(result.stats.webSearchRate, 0)
    assert.equal(result.items.find(item => item.requestId === 'request-success')?.databaseMs, 8)
    assert.equal(result.items.find(item => item.requestId === 'request-failure')?.errorCode, 'AI_UNAVAILABLE')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
