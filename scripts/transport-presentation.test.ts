import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  campusTransitOptions,
  campusTransitSources,
  transitOptionsForOrigin
} from '../data/campus-transit'
import { searchSystemFeatures } from '../data/system-features'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { answerCampusQuestion, seedCatalogEvidenceForQuery } from '../server/modules/assistant/service'

const pageSource = readFileSync(resolve('app/pages/transport.vue'), 'utf8')
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

test('transport catalog covers the main arrival and departure hubs', () => {
  assert.ok(transitOptionsForOrigin('quanzhou-station').some(option => option.title.includes('K6')))
  assert.ok(transitOptionsForOrigin('city-center').some(option => option.title.includes('K2')))
  assert.ok(transitOptionsForOrigin('quanzhou-east').some(option => option.summary.includes('K507')))
  assert.ok(transitOptionsForOrigin('jinjiang-airport').some(option => option.summary.includes('没有核对到稳定直达公交')))
  assert.ok(transitOptionsForOrigin('from-campus').some(option => option.steps.some(step => step.includes('泉州站'))))
  assert.ok(campusTransitOptions.every(option => option.mapUrl.startsWith('https://ditu.amap.com/')))
  assert.ok(campusTransitSources.some(source => source.id === 'qzbus'))
})

test('dynamic services are presented with explicit freshness warnings', () => {
  const k6 = campusTransitOptions.find(option => option.id === 'station-k6')
  assert.match(k6?.serviceHours ?? '', /常见资料/)
  assert.match(k6?.notes.join(' ') ?? '', /差异/)
  assert.match(pageSource, /班次会变，入口留给你复核/)
  assert.match(pageSource, /以泉州公交、学校最新通知和出发当天地图结果为准/)
  assert.match(pageSource, /打开高德重新规划/)
})

test('site search and local assistant retrieve transport facts and entry', () => {
  assert.equal(searchSystemFeatures('泉州站怎么到学校')[0]?.id, 'campus-transport')
  assert.equal(searchSystemFeatures('K6末班车几点')[0]?.to, '/transport')

  const stationEvidence = seedCatalogEvidenceForQuery('泉州站怎么到学校？', 5)
  assert.ok(stationEvidence.some(item => item.url === '/transport' && item.text.includes('K6')))

  const cityEvidence = seedCatalogEvidenceForQuery('学校怎么去泉州市区？', 5)
  assert.ok(cityEvidence.some(item => item.url === '/transport' && item.text.includes('K2')))

  const airportEvidence = seedCatalogEvidenceForQuery('晋江机场怎么到学校？', 5)
  assert.ok(airportEvidence.some(item => item.url === '/transport' && item.text.includes('接近 3 小时')))
})

test('assistant answers common transport questions from local evidence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-transport-answer-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)
    const station = await answerCampusQuestion(client, '泉州站怎么到仰恩大学？', emptyAssistantConfig)
    assert.equal(station.mode, 'local')
    assert.equal(station.usedWebSearch, false)
    assert.match(station.answer, /K6/)
    assert.ok(station.citations.some(item => item.url === '/transport'))

    const city = await answerCampusQuestion(client, '从学校怎么去泉州市区？', emptyAssistantConfig)
    assert.match(city.answer, /K2/)
    assert.ok(city.citations.some(item => item.url === '/transport'))
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
