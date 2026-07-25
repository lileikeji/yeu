import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  nearbyGuideItems,
  nearbyGuideSearchText
} from '../data/nearby-guide'
import { searchSystemFeatures } from '../data/system-features'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  answerCampusQuestion,
  seedCatalogEvidenceForQuery
} from '../server/modules/assistant/service'

const pageSource = readFileSync(resolve('app/pages/nearby.vue'), 'utf8')
const cardSource = readFileSync(resolve('app/components/nearby/NearbyGuideCard.vue'), 'utf8')
const homeSource = readFileSync(resolve('app/utils/home-presentation.ts'), 'utf8')
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

test('nearby guide contains sourced food and outing plans with safe map entries', () => {
  assert.equal(nearbyGuideItems.length, 12)
  assert.equal(nearbyGuideItems.filter(item => item.scope === 'nearby').length, 6)
  assert.equal(nearbyGuideItems.filter(item => item.scope === 'city').length, 6)
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('凤栖七宝羹')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('仙公山')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('彩虹瀑布')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('面线糊')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('蟳埔')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('浦西万达')))
  assert.ok(nearbyGuideItems.every(item => item.mapUrl.startsWith('https://uri.amap.com/search?')))
  assert.ok(nearbyGuideItems.every(item => item.freshnessNote.length > 10))
  assert.ok(nearbyGuideItems
    .filter(item => item.id !== 'student-streets')
    .every(item => item.sources.some(source => source.url.startsWith('https://'))))
  assert.match(nearbyGuideSearchText(nearbyGuideItems[1]!), /凤栖七宝羹.*炒猪肝/)
})

test('nearby page and home expose the eat-play guide as a visible module', () => {
  assert.match(pageSource, /nearbyGuideItems/)
  assert.match(pageSource, /先选近郊还是进城/)
  assert.match(pageSource, /泉州市区/)
  assert.match(pageSource, /guideGroups/)
  assert.match(pageSource, /NearbyGuideCard/)
  assert.match(cardSource, /在高德地图查看/)
  assert.match(cardSource, /查看进城与返校/)
  assert.match(pageSource, /商家营业、景区开放和票价变化较快/)
  assert.match(cardSource, /:id="`guide-\$\{item\.id\}`"/)
  assert.match(homeSource, /title: '吃喝玩乐'/)
  assert.match(homeSource, /学生街、马甲周边与泉州市区吃喝玩乐攻略/)
  assert.equal(searchSystemFeatures('吃喝玩乐功能入口')[0]?.to, '/nearby')
  assert.equal(searchSystemFeatures('泉州市区吃喝玩乐入口')[0]?.to, '/nearby')
})

test('assistant retrieves the guide locally instead of requiring a web search', async () => {
  const evidence = seedCatalogEvidenceForQuery('仰恩附近有什么好吃好玩的？', 8)
  assert.ok(evidence.some(item => item.url.startsWith('/nearby#guide-')))

  const directory = mkdtempSync(join(tmpdir(), 'yeu-nearby-guide-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  try {
    runMigrations(client)

    const overview = await answerCampusQuestion(client, '仰恩附近有什么好吃好玩的？', emptyAssistantConfig)
    assert.equal(overview.mode, 'local')
    assert.equal(overview.usedWebSearch, false)
    assert.match(overview.answer, /学生街/)
    assert.match(overview.answer, /仙公山/)
    assert.ok(overview.citations.some(item => item.url.startsWith('/nearby#guide-')))

    const localFood = await answerCampusQuestion(client, '马甲镇有什么本地美食？', emptyAssistantConfig)
    assert.equal(localFood.usedWebSearch, false)
    assert.match(localFood.answer, /凤栖七宝羹/)
    assert.match(localFood.answer, /炒猪肝/)

    const weekend = await answerCampusQuestion(client, '周末去虹山有什么玩的？', emptyAssistantConfig)
    assert.equal(weekend.usedWebSearch, false)
    assert.match(weekend.answer, /彩虹瀑布/)
    assert.match(weekend.answer, /石龙谷/)

    const city = await answerCampusQuestion(client, '泉州市区有什么好吃好玩的？', emptyAssistantConfig)
    assert.equal(city.usedWebSearch, false)
    assert.match(city.answer, /开元寺—西街—钟楼—中山路/)
    assert.match(city.answer, /面线糊/)
    assert.ok(city.citations.some(item => item.url === '/nearby#guide-old-city-walk'))
    assert.ok(city.citations.some(item => item.url === '/nearby#guide-city-food-trail'))

    const cityFood = await answerCampusQuestion(client, '泉州市区有什么美食？', emptyAssistantConfig)
    assert.equal(cityFood.usedWebSearch, false)
    assert.match(cityFood.answer, /面线糊/)
    assert.match(cityFood.answer, /四果汤/)
    assert.equal(cityFood.citations[0]?.url, '/nearby#guide-city-food-trail')
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
