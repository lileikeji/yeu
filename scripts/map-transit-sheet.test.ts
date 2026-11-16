import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { resolveSheetBackAction, resolveSheetHistorySync } from '../app/utils/map-presentation'

// T-029：校外公交从桌面浮层收进手机底部面板 —— 第 8 格入口、面板内滚动、
// 268px 时刻表底栏抽屉、popstate 返回栈。桌面 overlay 行为必须原样保留。
const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const componentSource = readFileSync(resolve('app/components/MapTransitPanel.vue'), 'utf8')
const presentationSource = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')
// sheet 变体只截到浮层之前：桌面浮层里的 overflow-y-auto / h-12 不能当「面板内滚动」的证据。
const sheetSource = componentSource.slice(0, componentSource.indexOf('v-else-if="!open"'))

test('第 8 格入口：6 分类 + 叮叮车 / 校外公交两格各占一半，不再有 span 3 通栏', () => {
  assert.match(pageSource, /type MapSheetView = 'sections' \| 'all' \| 'bus' \| 'transit'/)
  assert.match(pageSource, /function openTransitSheet\(\): void \{/)
  assert.match(pageSource, /aria-label="打开校外公交"/)
  assert.match(pageSource, /aria-label="打开叮叮车"/)
  assert.equal((pageSource.match(/class="map-sheet-transport /g) ?? []).length, 2)
  assert.match(pageSource, /\.map-workspace \.map-sheet-categories > \.map-sheet-transport \{\s*grid-column: span 3;/)
  assert.doesNotMatch(pageSource, /nth-child\(n \+ 4\)/)
  // 6 个分类每格 span 2（6 列 = 每行三个，共 2 行），两个交通格 span 3 → 第 3 行正好各占一半，不留空洞。
  assert.match(pageSource, /\.map-workspace \.map-sheet-categories > \* \{\s*grid-column: span 2;/)
})

test('transit 视图复用 useMapTransit 数据：头部返回 + 线路卡 + 方向切换 + 中间站折叠', () => {
  assert.match(pageSource, /v-if="mapSheetView === 'transit'"/)
  assert.match(pageSource, /<MapTransitPanel\s+variant="sheet"/)
  assert.match(pageSource, /:directions="transitDirections"/)
  assert.match(pageSource, /:departures="transitDepartures"/)
  assert.match(pageSource, /:drawer-open="transitDrawerOpen"/)
  assert.match(pageSource, /@back="handleSheetBack\(\)"/)
  assert.match(sheetSource, /aria-label="返回我的地图"/)
  assert.match(sheetSource, /sheetLineGroups/)
  assert.match(sheetSource, /中间 \{\{ row\.count \}\} 站（点开）/)
  assert.match(sheetSource, /toggleSheetStops\(direction\)/)
  assert.match(sheetSource, /emit\('focus-stop'/)
})

test('面板内滚动 + 48px 常驻底栏 + 268px 时刻表抽屉，点地图空白只关抽屉', () => {
  assert.match(sheetSource, /class="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain/)
  assert.match(sheetSource, /class="flex h-11 shrink-0 items-center/)
  assert.match(sheetSource, /下一班 \{\{ sheetNextBus/)
  assert.match(sheetSource, /今日 \{\{ sheetTodayCount \}\} 班/)
  assert.match(sheetSource, /aria-label="打开今日时刻表"/)
  assert.match(sheetSource, /class="flex h-12 shrink-0 items-center/)
  assert.match(sheetSource, /max-h-\[268px\]/)
  assert.match(sheetSource, /v-if="drawerOpen"/)
  assert.match(pageSource, /function handleMapSurfaceClick\(\): void \{/)
  assert.match(pageSource, /@click="handleMapSurfaceClick"/)
})

test('返回栈判定：关抽屉 → 回 sections → 收 collapsed → 离开页面', () => {
  assert.equal(resolveSheetBackAction({ view: 'transit', drawerOpen: true, sheetState: 'half' }), 'close-drawer')
  assert.equal(resolveSheetBackAction({ view: 'transit', drawerOpen: false, sheetState: 'half' }), 'to-sections')
  assert.equal(resolveSheetBackAction({ view: 'sections', drawerOpen: false, sheetState: 'half' }), 'collapse')
  assert.equal(resolveSheetBackAction({ view: 'sections', drawerOpen: false, sheetState: 'collapsed' }), 'leave')
  assert.match(presentationSource, /export type MapSheetBackAction/)
})

test('视图入参收窄成四值联合：传错值编译期就红', () => {
  type SheetBackView = Parameters<typeof resolveSheetBackAction>[0]['view']
  const views: SheetBackView[] = ['sections', 'all', 'bus', 'transit']
  assert.equal(views.length, 4)
  assert.match(presentationSource, /view: MapSheetBackView/)
  // @ts-expect-error 视图联合之外的值编译期就该红
  const rejected: SheetBackView = 'nope'
  assert.equal(rejected, 'nope')
})

test('半屏即压层：任一非折叠态都补一层守卫历史', () => {
  assert.equal(resolveSheetHistorySync({ hasLayer: true, pushed: false }), 'push')
  assert.equal(resolveSheetHistorySync({ hasLayer: true, pushed: true }), 'none')
  assert.match(pageSource, /watch\(\[mobileSheetState, mapSheetView, transitDrawerOpen\]/)
  assert.match(pageSource, /function syncSheetHistoryGuard\(\): void \{/)
  assert.match(pageSource, /if \(action === 'push'\) pushSheetHistoryLayer\(\)/)
})

test('收起撤层：手动收起到 collapsed 用 history.back() 撤层，popstate 被吞掉', () => {
  assert.equal(resolveSheetHistorySync({ hasLayer: false, pushed: true }), 'drop')
  assert.equal(resolveSheetHistorySync({ hasLayer: false, pushed: false }), 'none')
  assert.match(pageSource, /function dropSheetHistoryLayer\(\): void \{/)
  assert.match(pageSource, /suppressNextPop = true/)
  assert.match(pageSource, /window\.history\.back\(\)/)
  assert.match(pageSource, /if \(suppressNextPop\) \{/)
})

test('popstate 与桌面 Esc 共用一条判定，卸载时清掉监听与守卫层', () => {
  assert.match(pageSource, /window\.addEventListener\('popstate', handleSheetPopState\)/)
  assert.match(pageSource, /window\.addEventListener\('keydown', handleSheetKeydown\)/)
  assert.match(pageSource, /event\.key !== 'Escape'/)
  assert.match(pageSource, /window\.history\.pushState\(\{ mapSheet:/)
  assert.match(pageSource, /if \(action !== 'leave'\) pushSheetHistoryLayer\(\)/)
  assert.match(pageSource, /window\.removeEventListener\('popstate', handleSheetPopState\)/)
  assert.match(pageSource, /window\.removeEventListener\('keydown', handleSheetKeydown\)/)
  assert.match(pageSource, /sheetHistoryPushed = false/)
})

test('桌面浮层不动：overlay 分支与页面右侧浮层参数原样保留', () => {
  assert.match(componentSource, /v-else-if="!open"/)
  assert.match(componentSource, /aria-label="校外公交线路"/)
  assert.match(componentSource, /md:max-h-\[62vh\]/)
  // 手机只走 sheet 容器；浮层实例限定桌面端，避免手机底部再飘一个「公交线路」浮钮。
  assert.match(pageSource, /<MapTransitPanel\s+v-if="transitLinesOpen && panelIsDesktop"/)
  assert.match(pageSource, /:left-offset="sidebarCollapsed \? '1rem' : '19rem'"/)
  // 手机分流只靠 md:hidden 的 sheet 容器，不改桌面浮层的可见性
  assert.match(pageSource, /class="flex min-h-0 flex-1 flex-col md:hidden"/)
})

test('transit 不抢叮叮车的高度：仍走 mobileSheetHeightClass 的 84/326/548', () => {
  assert.match(pageSource, /mapSheetView === 'bus' \? resolveBusSheetHeightClass\(mobileSheetState\) : mobileSheetHeightClass/)
  assert.doesNotMatch(pageSource, /mapSheetView === 'transit' \? resolveBusSheetHeightClass/)
  assert.match(pageSource, /mapSheetView !== 'bus' && sheetHydrated && !mobileSheetDragging/)
})
