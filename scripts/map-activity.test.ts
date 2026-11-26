import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const service = read('../server/modules/activities/service.ts')
const api = read('../server/api/public/activity-place-markers.get.ts')
const amap = read('../map/providers/amap/provider.ts')
const maplibre = read('../map/providers/maplibre/marker-image.ts')
const index = read('../app/pages/map/index.vue')
const presentation = read('../app/utils/map-presentation.ts')

const sliceBetween = (source: string, from: string, to: string) => {
  const start = source.indexOf(from)
  assert.notEqual(start, -1, `缺少锚点 ${from}`)
  const end = source.indexOf(to, start)
  assert.notEqual(end, -1, `缺少结束锚点 ${to}`)
  return source.slice(start, end)
}

test('T-040 阶段1：接口返回 placeIds + hotspots，热点查询复用同一时间边界', () => {
  assert.match(api, /listActivityHotspots\(/)
  assert.match(api, /placeIds/)
  assert.match(api, /hotspots/)
  assert.match(api, /setPublicCache\(event, 30\)/)
  assert.match(service, /export function listActivityHotspots\(/)
  const fnStart = service.indexOf('export function listActivityHotspots(')
  const body = service.slice(fnStart, fnStart + 1600)
  assert.match(body, /ACTIVITY_PUBLIC_GRACE_MS/, '热点查询必须复用 listActivityPlaceIds 的时间边界')
  assert.match(body, /row_number\(\) over \(partition by place_id order by starts_at asc\)/)
  assert.match(body, /count\(\*\) over \(partition by place_id\) as placeTotal/, '每地点在期真数必须由 SQL 给出，界面不能数预览行数')
  assert.match(body, /placeTotal: row\.placeTotal/)
})

test('T-040 阶段2：两家图钉都是纯红点，高德不留文字角标', () => {
  assert.doesNotMatch(amap, /textContent\s*=\s*'!'/)
  assert.match(amap, /#e11d48/)
  assert.match(amap, /10\.8px/)
  assert.match(amap, /rgba\(255,255,255,\.55\)/)
  assert.match(maplibre, /arc\(31, 8, 6\.9, 0, Math\.PI \* 2\)/)
  assert.match(maplibre, /rgba\(255, 255, 255, 0\.55\)/)
})

test('T-040 阶段3：分类 4×2、热点入口在网格里、叮叮车 chip 移出网格', () => {
  const grid = sliceBetween(index, 'class="map-sheet-categories', '</section>')
  assert.match(grid, /grid-cols-4/)
  assert.match(grid, /v-for="entry in mapSheetCategoryEntries"/)
  assert.doesNotMatch(grid, /打开叮叮车/)
  const entries = sliceBetween(index, 'const mapSheetCategoryEntries = [', '] as const')
  assert.match(entries, /'hotspot', label: '热点'/)
  assert.ok(entries.indexOf('\'全部地点\'') < entries.indexOf('\'热点\''), '热点必须排在全部地点之后、其余分类之前')
  assert.ok(entries.indexOf('\'热点\'') < entries.indexOf('\'教学\''), '热点必须紧挨全部地点')
  assert.doesNotMatch(index, /repeat\(6, minmax\(0, 1fr\)\)/)
  // 2026-11-23 用户：「点最近活动就显示全部的地点，谁会想看这些」——
  // 热点必须进活动视图，只有一条活动都没有时才退回整表。
  // openHotspotPlace 定义在 openMapSheetCategory 之前，结束锚点改到脚本末尾。
  const openCategory = sliceBetween(index, 'function openMapSheetCategory(', '</script>')
  assert.match(openCategory, /id === 'hotspot' && activityHotspots\.value\.length/, '热点入口又掉回全部地点整表了')
  assert.match(openCategory, /mapSheetView\.value = 'activity'/)
})

test('T-040 阶段3：折叠态浮钮带用 dock 变量定位且排除叮叮车视图', () => {
  const band = sliceBetween(index, 'T-040：地图层浮钮带', '点位浮窗')
  assert.match(band, /--shell-dock-map-height, ?6\.25rem/)
  assert.match(band, /查看附近活动/)
  assert.match(band, /mapSheetView !== 'bus'/)
  assert.match(band, /activityHotspots\.length/)
  assert.equal(index.match(/bottom-\[calc\(var\(--shell-dock-map-height/g)?.length, 1)
})

test('T-041 阶段4：活动视图进入 MapSheetView，收起直达 sections 折叠', () => {
  assert.match(index, /type MapSheetView = 'sections' \| 'all' \| 'activity' \| 'bus' \| 'transit'/)
  const open = sliceBetween(index, 'function openActivitySheet()', 'function hideActivitySheet()')
  assert.match(open, /mapSheetView\.value = 'activity'/)
  assert.match(open, /mobileSheetState\.value = 'half'/)
  const hide = sliceBetween(index, 'function hideActivitySheet()', 'function openActivitySheetRow(')
  assert.match(hide, /mapSheetView\.value = 'sections'/)
  assert.match(hide, /mobileSheetState\.value = 'collapsed'/)
})

test('T-041 阶段4：活动面板锚点 326/548，不存在 84 残条', () => {
  const anchors = sliceBetween(presentation, 'export function resolveActivitySheetAnchors(', 'export function resolveMobileSheetHeightClass(')
  assert.match(anchors, /collapsed: 0/)
  assert.match(anchors, /const half = Math\.min\(326, limit\)/)
  assert.match(anchors, /const limit = Math\.max\(0, Math\.min\(548, fallback\.expanded - 80\)\)/)
  // 326 已抽成 SHEET_HALF_326 常量；活动分支再收一道容器上限，矮容器里不能压过锚点。
  assert.match(index, /const SHEET_HALF_326 = 'max-md:!h-\[326px\]'/, '半屏 326 抽成常量')
  assert.match(index, /const SHEET_ACTIVITY_HALF = 'max-md:!h-\[min\(326px,calc\(100%_-_5\.75rem\)\)\]'/, '活动半屏必须与展开同口径收容器上限')
  assert.match(index, /mapSheetView === 'activity'[\s\S]{0,420}SHEET_ACTIVITY_HALF/)
  assert.match(index, /mapSheetView === 'activity'[\s\S]{0,420}max-md:!h-\[min\(548px,calc\(100%_-_5\.75rem\)\)\]/)
})

test('T-041 阶段4：浮钮打开活动视图，行点击先收起再定位地点', () => {
  assert.match(index, /@click="openActivitySheet"/)
  const row = sliceBetween(index, 'function openActivitySheetRow(', 'function openHotspotPlace(')
  assert.ok(row.indexOf('hideActivitySheet()') < row.indexOf('openHotspotPlace(hotspot.placeId)'), '必须先收起面板再定位，否则卡片会和面板抢半屏')
})

test('T-041 阶段4：旧热点带与旧展开列表已从模板退场', () => {
  assert.doesNotMatch(index, /id="map-sheet-hotspot"/)
  assert.doesNotMatch(index, /id="map-sheet-hotspot-list"/)
  assert.doesNotMatch(index, /openHotspotSection|expandHotspotList/)
})

test('T-041 阶段4：场次与总数用 placeTotal 真值，预览截断另有说明', () => {
  assert.match(index, /interface MapActivityHotspot \{[\s\S]{0,240}placeTotal: number/)
  assert.match(index, /totals\.set\(hotspot\.placeId, hotspot\.placeTotal \|\| 1\)/, '场次标签不能数预览行数')
  const total = sliceBetween(index, 'const activityTotalCount = computed(', 'const HOTSPOT_SHANGHAI_OFFSET_MS')
  assert.match(total, /for \(const placeTotal of hotspotTotalByPlaceId\.value\.values\(\)\) total \+= placeTotal/)
  const truncation = sliceBetween(index, 'const activityListTruncated = computed(', 'const HOTSPOT_SHANGHAI_OFFSET_MS')
  assert.match(truncation, /activityHotspots\.value\.length < activityTotalCount\.value/)
  assert.match(index, /每个地点最多列出 6 场，共 \{\{ activityTotalCount \}\} 场在期活动/)
  assert.match(index, /共 \{\{ activityTotalCount \}\} 个活动 · 点任意一条在地图上定位/)
})

test('T-041 阶段4：时间筛选按 hotspotDayDiff 分档，四组顺序固定', () => {
  const counts = sliceBetween(index, 'const activityFilterCounts = computed(', 'const activityFilterOptions = computed(')
  assert.match(counts, /diff <= 0\) today \+= 1/)
  assert.match(counts, /diff <= 7\) week \+= 1/)
  assert.match(counts, /else later \+= 1/)
  const groups = sliceBetween(index, 'const activityGroups = computed(', 'function openActivitySheet(')
  assert.ok(groups.indexOf('\'今天\'') < groups.indexOf('\'明天\''), '今天必须在明天之前')
  assert.ok(groups.indexOf('\'明天\'') < groups.indexOf('\'本周\''), '明天必须在本周之前')
  assert.ok(groups.indexOf('\'本周\'') < groups.indexOf('\'之后\''), '本周必须在之后之前')
})

test('T-041 阶段4：面板具备拖动区、筛选 chips 与空态文案', () => {
  const panel = sliceBetween(index, 'data-sheet-view="activity"', 'v-if="mapSheetView === \'transit\'"')
  assert.match(panel, /data-sheet-drag-zone/)
  assert.match(panel, /data-sheet-drag-handle/)
  assert.match(panel, /aria-label="收起活动面板"/)
  assert.match(panel, /v-for="chip in activityFilterOptions"/)
  assert.match(panel, /这个时间段没有活动/)
  assert.match(panel, /@click="openActivitySheetRow\(hotspot\)"/)
})
