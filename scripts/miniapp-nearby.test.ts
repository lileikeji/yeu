import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { nearbyGuideCategoryLabels, nearbyGuideItems } from '../data/nearby-guide'
import { nearbyGuideQuerySchema } from '../shared/schemas/server'
import { isMiniAppReadRoute, MINIAPP_API_PREFIX } from '../server/utils/miniapp'

const routeSource = readFileSync('server/api/miniapp/v1/nearby/index.get.ts', 'utf8')

test('nearby guide data is usable as-is for the miniapp browse surface', () => {
  assert.ok(nearbyGuideItems.length >= 10)
  const scopes = new Set(nearbyGuideItems.map(item => item.scope))
  assert.deepEqual([...scopes].sort(), ['city', 'nearby'])

  for (const item of nearbyGuideItems) {
    assert.ok(item.id, 'item id')
    assert.ok(item.title, `${item.id} title`)
    assert.ok(item.summary, `${item.id} summary`)
    assert.ok(item.freshnessNote, `${item.id} must carry a freshness note`)
    assert.ok(item.suitableFor && item.travelNote && item.costNote, `${item.id} decision aids`)
    assert.ok(Array.isArray(item.destinations), `${item.id} destinations`)
    for (const destination of item.destinations) {
      assert.ok(destination.label, `${item.id} destination label`)
      assert.ok(Number.isFinite(destination.longitude), `${item.id} destination longitude`)
      assert.ok(Number.isFinite(destination.latitude), `${item.id} destination latitude`)
    }
  }
})

test('every nearby category has a student-facing label', () => {
  for (const item of nearbyGuideItems) {
    assert.equal(
      nearbyGuideCategoryLabels[item.category],
      nearbyGuideCategoryLabels[item.category],
      item.category
    )
    assert.ok(nearbyGuideCategoryLabels[item.category], `missing label for ${item.category}`)
  }
})

test('nearby guide coordinates stay GCJ-02 end to end', () => {
  // 高德 POI 坐标是 GCJ-02；标成 WGS84 会被小程序再换算一次，偏几百米。
  assert.match(routeSource, /coordinateSystem: 'GCJ-02'/)
  const page = readFileSync('miniapp/pages/nearby/index.vue', 'utf8')
  assert.match(page, /uni\.openLocation\(\{/)
  // openLocation 直接吃 GCJ-02，所以这里不能走 toMapCoordinate 再换算一遍。
  assert.doesNotMatch(page, /toMapCoordinate/)
})

test('nearby query schema only accepts scope and category', () => {
  assert.deepEqual(nearbyGuideQuerySchema.parse({}), {})
  assert.equal(nearbyGuideQuerySchema.parse({ scope: 'nearby' }).scope, 'nearby')
  assert.equal(nearbyGuideQuerySchema.parse({ category: 'food' }).category, 'food')
  assert.throws(() => nearbyGuideQuerySchema.parse({ scope: 'anywhere' }))
  assert.throws(() => nearbyGuideQuerySchema.parse({ category: 'x'.repeat(41) }))
})

test('nearby read route is allowlisted and read-only', () => {
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}nearby`, 'GET'), true)
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}nearby`, 'POST'), false)
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}nearby/extra`, 'GET'), false)
  assert.match(routeSource, /defineEventHandler/)
})

test('nearby categories are counted per scope so the filter chips stay coherent', () => {
  assert.match(routeSource, /nearbyGuideItems\.filter\(item => item\.scope === query\.scope\)/)
  assert.match(routeSource, /counts\.set\(item\.category/)
})
