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
const routeDialogSource = readFileSync(resolve('app/components/nearby/NearbyRouteDialog.vue'), 'utf8')
const homeSource = readFileSync(resolve('app/utils/home-presentation.ts'), 'utf8')
const clientIconBundleSource = readFileSync(resolve('shared/client-bundle-icons.ts'), 'utf8')
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
  assert.equal(nearbyGuideItems.length, 19)
  assert.equal(nearbyGuideItems.filter(item => item.scope === 'nearby').length, 6)
  assert.equal(nearbyGuideItems.filter(item => item.scope === 'city').length, 13)
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('凤栖七宝羹')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('仙公山')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('彩虹瀑布')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('面线糊')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('蟳埔')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('浦西万达')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('清源山')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('浔美湾')))
  assert.ok(nearbyGuideItems.some(item => item.keywords.includes('泉州木偶戏')))
  assert.ok(nearbyGuideItems.every(item => item.destinations.length >= 1))
  assert.ok(nearbyGuideItems
    .flatMap(item => item.destinations)
    .every(destination =>
      destination.label.length > 3
      && Number.isFinite(destination.longitude)
      && Number.isFinite(destination.latitude)
      && destination.longitude > 118
      && destination.longitude < 119
      && destination.latitude > 24
      && destination.latitude < 26))
  assert.ok(nearbyGuideItems.some(item => item.destinations.length >= 4))
  assert.ok(nearbyGuideItems.every(item => item.freshnessNote.length > 10))
  assert.ok(nearbyGuideItems
    .filter(item => item.id !== 'student-streets')
    .every(item => item.sources.some(source => source.url.startsWith('https://'))))
  assert.ok(nearbyGuideItems.filter(item => item.image).length >= 7)
  assert.ok(nearbyGuideItems
    .filter(item => item.image)
    .every(item => item.image?.src.startsWith('/images/nearby/') && item.image.credit.length > 8))
  for (const item of nearbyGuideItems) {
    const icon = item.icon.replace(/^i-lucide-/, 'lucide:')
    assert.match(clientIconBundleSource, new RegExp(`'${icon}'`), `${item.icon} must be in the client icon bundle`)
  }
  assert.match(nearbyGuideSearchText(nearbyGuideItems[1]!), /凤栖七宝羹.*炒猪肝/)
})

test('nearby page and home expose the eat-play guide as a visible module', () => {
  assert.match(pageSource, /nearbyGuideItems/)
  assert.match(pageSource, /先选范围，再选想做的事/)
  assert.match(pageSource, /泉州市区/)
  assert.match(pageSource, /guideScopeOptions/)
  assert.match(pageSource, /guideTagOptions/)
  assert.match(pageSource, /selectedGuideItems/)
  assert.doesNotMatch(pageSource, /攻略快捷入口/)
  assert.match(pageSource, /NearbyGuideCard/)
  assert.match(cardSource, /在高德看地点/)
  assert.match(cardSource, /NearbyRouteDialog/)
  assert.match(routeDialogSource, /看具体路线和返校/)
  assert.match(routeDialogSource, /api\/public\/transit\/plan/)
  assert.match(routeDialogSource, /从当前位置坐公交/)
  assert.match(routeDialogSource, /驾车 \/ 打车/)
  assert.match(routeDialogSource, /切换地点分别查看/)
  assert.match(cardSource, /这条攻略从哪里来/)
  assert.match(cardSource, /item\.image/)
  assert.match(pageSource, /nearby-route-path/)
  assert.match(pageSource, /guide-switch/)
  assert.match(pageSource, /商家、景区和票价会变/)
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
    assert.match(city.answer, /开元寺—西街—钟楼/)
    assert.match(city.answer, /面线糊/)
    assert.match(city.answer, /浔美湾/)
    assert.match(city.answer, /木偶/)
    assert.ok(city.citations.some(item => item.url === '/nearby#guide-old-city-walk'))
    assert.ok(city.citations.some(item => item.url === '/nearby#guide-city-food-trail'))

    const cityFood = await answerCampusQuestion(client, '泉州市区有什么美食？', emptyAssistantConfig)
    assert.equal(cityFood.usedWebSearch, false)
    assert.match(cityFood.answer, /面线糊/)
    assert.match(cityFood.answer, /四果汤/)
    assert.equal(cityFood.citations[0]?.url, '/nearby#guide-city-food-trail')
    assert.ok(cityFood.citations.some(item => item.url === '/nearby#guide-city-main-meal'))

    const shows = await answerCampusQuestion(client, '泉州市区哪里能看木偶戏？', emptyAssistantConfig)
    assert.equal(shows.usedWebSearch, false)
    assert.match(shows.answer, /提线木偶/)
    assert.equal(shows.citations[0]?.url, '/nearby#guide-city-heritage-show')

    const waterfront = await answerCampusQuestion(client, '泉州市区海边晚上去哪里？', emptyAssistantConfig)
    assert.equal(waterfront.usedWebSearch, false)
    assert.match(waterfront.answer, /浔美湾/)
    assert.ok(waterfront.citations.some(item => item.url === '/nearby#guide-xunmei-waterfront'))
  } finally {
    closeDatabase(databasePath)
    rmSync(directory, { recursive: true, force: true })
  }
})
