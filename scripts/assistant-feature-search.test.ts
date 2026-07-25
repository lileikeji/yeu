import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { searchSystemFeatures } from '../data/system-features'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  answerCampusQuestion,
  assistantRetrievalQuery,
  cachedWebEvidenceForQuery,
  sanitizeAssistantAnswer,
  storeWebEvidence
} from '../server/modules/assistant/service'
import { searchPublishedContent } from '../server/modules/search/service'

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

test('feature catalog resolves natural function-finding questions', () => {
  assert.equal(searchSystemFeatures('专业在哪查是什么学院')[0]?.id, 'major-college-lookup')
  assert.equal(searchSystemFeatures('在哪里规划去教学楼的路线')[0]?.id, 'campus-map')
  assert.equal(searchSystemFeatures('我想算绩点')[0]?.id, 'gpa-calculator')
  assert.equal(searchSystemFeatures('WeLearn 软件在哪里下载')[0]?.id, 'welearn-download')
  assert.equal(searchSystemFeatures('泉州站怎么到学校')[0]?.id, 'campus-transport')
})

test('public search API result includes direct feature targets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-feature-api-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const result = searchPublishedContent(client, '专业在哪查是什么学院', 20)
    assert.equal(result.features?.[0]?.title, '专业与学院查询')
    assert.equal(result.features?.[0]?.to, '/#major-lookup')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('assistant answers feature location with a clickable local entry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-feature-answer-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const response = await answerCampusQuestion(client, '专业在哪查是什么学院', emptyAssistantConfig)
    assert.equal(response.mode, 'local')
    assert.match(response.answer, /专业与学院查询/)
    assert.equal(response.citations[0]?.url, '/#major-lookup')
    assert.deepEqual(response.trace?.map(item => item.stage), [
      'query_analysis',
      'feature_api',
      'answer_generation'
    ])
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('assistant exposes historical transfer-major rules with an explicit freshness warning', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-transfer-history-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const response = await answerCampusQuestion(client, '仰恩大学转专业有哪些要求？', emptyAssistantConfig)
    assert.equal(response.mode, 'local')
    assert.equal(response.retrievalPath, 'local_database')
    assert.match(response.answer, /2017-10-26/)
    assert.match(response.answer, /不能替代教务部最新通知/)
    assert.match(response.answer, /12 月下旬/)
    assert.equal(response.usedWebSearch, false)
    const cachedResponse = await answerCampusQuestion(client, '仰恩大学转专业有哪些要求？', emptyAssistantConfig)
    assert.equal(cachedResponse.retrievalPath, 'local_database')
    assert.equal(cachedResponse.cacheHit, false)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('MCP web evidence can be persisted and reused without becoming site evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-assistant-web-cache-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const query = '宿舍床尺寸缓存测试'
    assert.equal(storeWebEvidence(client, query, [{
      title: '公开网页线索',
      url: 'https://example.edu/dorm-bed',
      snippet: '需要按楼栋核验。',
      source: 'web'
    }]), 1)
    const cached = cachedWebEvidenceForQuery(client, query)
    assert.equal(cached.length, 1)
    assert.equal(cached[0]?.source, 'web')
    assert.equal(cached[0]?.url, 'https://example.edu/dorm-bed')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('bed and mattress wording share one normalized web-knowledge cache', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-assistant-mattress-cache-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    assert.equal(
      assistantRetrievalQuery('新生要买多大的床垫'),
      assistantRetrievalQuery('宿舍床的尺寸是多大')
    )
    storeWebEvidence(client, '宿舍床的尺寸是多大', [{
      title: '宿舍床尺寸公开资料',
      url: 'https://example.edu/dorm-mattress-size',
      snippet: '床位宽0.9米、长1.9米，具体楼栋仍需核验。',
      source: 'web'
    }])
    const cached = cachedWebEvidenceForQuery(client, '新生要买多大的床垫')
    assert.equal(cached[0]?.url, 'https://example.edu/dorm-mattress-size')

    const response = await answerCampusQuestion(client, '新生要买多大的床垫', emptyAssistantConfig)
    assert.equal(response.retrievalPath, 'web_cache')
    assert.deepEqual(response.trace?.map(item => item.stage), [
      'query_analysis',
      'web_cache',
      'answer_generation'
    ])
    assert.equal(response.trace?.[0]?.detail, '识别为：宿舍床与床垫尺寸')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('assistant answer text strips raw URLs while citations remain separate', () => {
  assert.equal(
    sanitizeAssistantAnswer('查看[宿舍说明](https://example.edu/very/long/path)，也可访问 https://example.edu/raw。'),
    '查看宿舍说明，也可访问'
  )
})

test('bed-size question still gets a safe answer when MCP has no verified result', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-bed-answer-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const response = await answerCampusQuestion(client, '宿舍床的尺寸', emptyAssistantConfig)
    assert.match(response.answer, /没有检索到仰恩大学官方公开的统一宿舍床尺寸/)
    assert.match(response.answer, /不要按未经核验的尺寸/)
    assert.ok(response.citations.some(item => item.url === '/contact'))
    assert.deepEqual(response.trace?.map(item => item.stage), [
      'query_analysis',
      'local_database',
      'answer_generation'
    ])
    assert.equal(response.trace?.some(item => item.stage === 'web_cache' || item.stage === 'web_search'), false)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('cached web evidence selects only the web-cache route', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-bed-cached-route-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const query = '宿舍床尺寸缓存路线测试'
    storeWebEvidence(client, query, [{
      title: '公开网页线索',
      url: 'https://example.edu/dorm-bed-route',
      snippet: '不同楼栋需要分别核验。',
      source: 'web'
    }])
    const response = await answerCampusQuestion(client, query, emptyAssistantConfig)
    assert.deepEqual(response.trace?.map(item => item.stage), [
      'query_analysis',
      'web_cache',
      'answer_generation'
    ])
    assert.equal(response.trace?.some(item => item.stage === 'local_database' || item.stage === 'web_search'), false)
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})

test('bed-size fallback survives a delayed web-cache migration', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-bed-cache-migration-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    client.sqlite.exec('drop table assistant_web_knowledge')
    const response = await answerCampusQuestion(client, '宿舍床多大', emptyAssistantConfig)
    assert.match(response.answer, /没有检索到仰恩大学官方公开的统一宿舍床尺寸/)
    assert.ok(response.citations.some(item => item.url === '/contact'))
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
