import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

// T-028 W2：折叠态地图上叠校车 ETA 胶囊。位置来自 provider.projectToScreen 投影 seam，
// ETA 口径必须和校车面板一致（computeBusProgress + buildSegmentProfile 分段实测车速）；
// 胶囊本体只用 token，不许写死颜色。
const pillSource = readFileSync(resolve('app/components/MapBusEtaPill.vue'), 'utf8')
const etaSource = readFileSync(resolve('app/composables/useMapBusEta.ts'), 'utf8')
const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')

const pillAt = pageSource.indexOf('<MapBusEtaPill')
const pillWindow = pillAt < 0 ? '' : pageSource.slice(Math.max(0, pillAt - 400), pillAt + 400)

test('ETA 胶囊本体是圆角小胶囊，只用 token 不写死颜色', () => {
  assert.match(pillSource, /rounded-full/)
  assert.match(pillSource, /pointer-events-none/)
  assert.match(pillSource, /h-7/)
  assert.match(pillSource, /text-\[12px\]/)
  assert.match(pillSource, /bg-\[var\(--surface\)\]/)
  assert.match(pillSource, /var\(--bus-accent\)/)
  assert.match(pillSource, /var\(--bus-accent-line\)/)
  assert.doesNotMatch(pillSource, /#[0-9a-f]{3,8}\b/i)
})

test('ETA 复用 computeBusProgress 并带分段车速 profile，不是裸直线距离', () => {
  assert.match(etaSource, /computeBusProgress/)
  assert.match(etaSource, /buildSegmentProfile/)
  assert.match(etaSource, /profile: resolveProfile\(route\)/)
  // 每 150ms 重算一次，profile 必须按线路缓存，不能每次都重建
  assert.match(etaSource, /profileCache\.has\(route\.routeId\)/)
  assert.match(etaSource, /projectToScreen/
  )
  assert.match(etaSource, /MAX_BUS_ETA_PILLS = 3/)
  assert.match(etaSource, /typeof provider\.projectToScreen !== 'function'/)
})

test('按当前方向过滤，且不拿别的线路兜底算 ETA', () => {
  assert.match(etaSource, /activeRouteId/)
  assert.match(etaSource, /bus\.routeId !== activeRouteId/)
  assert.match(etaSource, /continue/)
  assert.doesNotMatch(etaSource, /\?\? routes\[0\]/)
})

test('胶囊文案是到站名（退站点名再退车名），不是车名', () => {
  assert.match(etaSource, /progress\.nextStopIndex/)
  assert.match(etaSource, /bus\.siteName/)
  assert.match(etaSource, /到\$\{stopName\}/)
  assert.doesNotMatch(etaSource, /label: bus\.busName/)
})

test('胶囊层只在地图折叠态出现，且避开点按（pointer-events-none）', () => {
  const layerAt = pageSource.indexOf('pointer-events-none absolute inset-0 z-[19] md:hidden')
  assert.ok(layerAt >= 0, '页面上找不到 z-[19] 的胶囊层')
  const layerWindow = pageSource.slice(Math.max(0, layerAt - 200), layerAt + 200)
  assert.match(layerWindow, /v-if="mobileSheetState === 'collapsed'"/)
})

test('贴到右缘时胶囊翻到车点左侧，不被缩放/罗盘控件压住', () => {
  // maplibre 右侧控件组 40×120 会盖住居中悬挂的胶囊：必须有右缘安全区与翻转分支。
  assert.match(etaSource, /RIGHT_CONTROL_GUTTER_PX = \d+/)
  assert.match(etaSource, /PILL_HALF_WIDTH_PX = \d+/)
  assert.match(etaSource, /screen\.x \+ PILL_HALF_WIDTH_PX > viewportWidth - RIGHT_CONTROL_GUTTER_PX/)
  assert.match(etaSource, /window\.innerWidth/)
  assert.match(etaSource, /nearLeft = viewportWidth > 0 && screen\.x - PILL_HALF_WIDTH_PX < 8/)
  assert.match(etaSource, /flipLeft \? 'calc\(-100% - 10px\)' : nearLeft \? '10px' : '-50%'/)
})

test('页面按当前方向接线，胶囊用 transform 定位', () => {
  assert.ok(pillAt >= 0, '页面上找不到 <MapBusEtaPill>')
  assert.match(pageSource, /useMapBusEta\(\{ buses: busVehicles, routes: busRoutes, provider: mapProvider, activeRouteId: busSelectedRouteId \}\)/)
  assert.match(pillWindow, /:style="{ transform: pill\.transform }"/)
})
