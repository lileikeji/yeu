import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { resolveSheetBackAction, resolveSheetHistorySync } from '../app/utils/map-presentation'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const presentationSource = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')
const componentSource = readFileSync(resolve('app/components/MapTransitPanel.vue'), 'utf8')
const glassSource = readFileSync(resolve('app/composables/useMapGlassRefraction.ts'), 'utf8')
const sheetSource = componentSource.slice(0, componentSource.indexOf('v-else-if="!open"'))

test('T-029 入口：第 3 行两格各占一半，叮叮车与校外公交并排', () => {
  assert.match(pageSource, /type MapSheetView = 'sections' \| 'all' \| 'bus' \| 'transit'/)
  assert.match(pageSource, /function openTransitSheet\(\)/)
  assert.match(pageSource, /aria-label="打开校外公交"/)
  assert.match(pageSource, /aria-label="打开叮叮车"/)
  assert.match(pageSource, /\.map-workspace \.map-sheet-categories > \* \{\s*grid-column: span 2;/)
  assert.match(pageSource, /\.map-workspace \.map-sheet-categories > \.map-sheet-transport \{\s*grid-column: span 3;/)
  assert.doesNotMatch(pageSource, /nth-child\(n \+ 4\)/)
  assert.equal(pageSource.match(/class="map-sheet-transport /g)?.length, 2, '两个交通格都要挂 map-sheet-transport')
})

test('T-032 线路双卡：两卡并排、无 tablist、选中卡走线色内联样式', () => {
  assert.match(sheetSource, /grid shrink-0 grid-cols-2 gap-2/)
  assert.match(sheetSource, /v-for="card in sheetLineCards"/)
  assert.match(sheetSource, /const sheetLineCards = computed/)
  assert.match(sheetSource, /backgroundColor: lineColor\(card\.name\) \+ '14'/)
  assert.match(sheetSource, /@click="selectSheetLine\(card\.name\)"/)
  assert.doesNotMatch(sheetSource, /role="tablist"/, '段式 tab 已换成双卡')
  assert.doesNotMatch(sheetSource, /role="tab"/)
  assert.doesNotMatch(sheetSource, /v-for="group in /)
})

test('T-030 标题只报当前线：校外公交 · K2', () => {
  assert.match(sheetSource, /function resolveTransitSheetTitle\(line: string\): string/)
  assert.match(sheetSource, /sheetTitle = computed\(\(\) => resolveTransitSheetTitle\(sheetLine\.value\)\)/)
  assert.match(sheetSource, /\{\{ sheetTitle \}\}/)
  assert.match(sheetSource, /sheetActiveGroup\.directions\.length/)
})

test('T-029 面板内线路视图：头部返回、折叠中间站、可滚动', () => {
  assert.match(pageSource, /<MapTransitPanel\s+variant="sheet"/)
  assert.match(pageSource, /:drawer-open="transitDrawerOpen"/)
  assert.match(pageSource, /@back="handleSheetBack\(\)"/)
  assert.match(pageSource, /@update:drawer-open="handleTransitDrawerChange\(\$event\)"/)
  assert.match(sheetSource, /aria-label="返回我的地图"/)
  assert.match(sheetSource, /中间 \{\{ row\.count \}\} 站（点开）/)
  assert.match(sheetSource, /toggleSheetStops\(sheetActiveDirection\)/)
  assert.match(sheetSource, /展开中间 /)
  assert.match(sheetSource, /scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain/)
  assert.match(sheetSource, /aria-label="线路与站点"/)
})

test('T-030 时刻表抽屉：首班末班 + 四列 chip + 填空剩余高度', () => {
  assert.match(sheetSource, /首班 \$\{sheetFirstLast\.first\} · 末班 \$\{sheetFirstLast\.last\}/)
  assert.doesNotMatch(sheetSource, /今日时刻[\s\S]{0,500}?首班 \{\{/)
  assert.match(sheetSource, /const sheetFirstLast = computed/)
  assert.match(sheetSource, /grid grid-cols-4 gap-1\.5/)
  assert.match(sheetSource, /aria-label="drawerOpen \? '收起今日时刻表' : '打开今日时刻表'"/)
  assert.match(sheetSource, /class="flex h-12 shrink-0/)
  assert.match(sheetSource, /drawerOpen \? 'flex-1 opacity-100' :/)
  assert.match(sheetSource, /v-show="!drawerOpen"/)
  assert.match(sheetSource, /:inert="!drawerOpen"/)
  assert.match(pageSource, /function handleMapSurfaceClick\(\)/)
  assert.match(pageSource, /@click="handleMapSurfaceClick"/)
})

test('T-029 返回栈：resolveSheetBackAction 四级判定', () => {
  assert.equal(resolveSheetBackAction({ view: 'transit', drawerOpen: true, sheetState: 'half' }), 'close-drawer')
  assert.equal(resolveSheetBackAction({ view: 'transit', drawerOpen: false, sheetState: 'half' }), 'to-sections')
  assert.equal(resolveSheetBackAction({ view: 'sections', drawerOpen: false, sheetState: 'half' }), 'collapse')
  assert.equal(resolveSheetBackAction({ view: 'sections', drawerOpen: false, sheetState: 'collapsed' }), 'leave')
})

test('T-029 守卫层跟着面板状态进出，popstate 与 Esc 共用一条判定', () => {
  assert.equal(resolveSheetHistorySync({ hasLayer: true, pushed: false }), 'push')
  assert.equal(resolveSheetHistorySync({ hasLayer: false, pushed: true }), 'drop')
  assert.equal(resolveSheetHistorySync({ hasLayer: true, pushed: true }), 'none')
  assert.match(pageSource, /addEventListener\('popstate', handleSheetPopState\)/)
  assert.match(pageSource, /addEventListener\('keydown', handleSheetKeydown\)/)
  assert.match(pageSource, /removeEventListener\('popstate', handleSheetPopState\)/)
  assert.match(pageSource, /removeEventListener\('keydown', handleSheetKeydown\)/)
  assert.match(pageSource, /history\.pushState/)
  assert.match(pageSource, /sheetHistoryPushed/)
})

test('T-030 面板左右竖带：sheet 只按上边算 band，玻璃开也干净', () => {
  assert.match(pageSource, /push\(mobileSheetElement\.value, 0\.008, 2\.2, 0\.18, 0, 'top'\)/)
  assert.match(pageSource, /const push = \(element: HTMLElement \| null, radius: number, strengthMul: number, frost: number, rim = 1, bandEdges: 'all' \| 'top' = 'all'\): void => \{/)
  assert.match(glassSource, /bandEdges\?: 'all' \| 'top'/)
  assert.match(glassSource, /if \(vEdges > 0\.5\)/)
  assert.match(glassSource, /uniform1fv\(pipeline\.uEdges, mount\.edges\)/)
})

test('桌面浮层行为不变：overlay 分支与既有限高原样', () => {
  assert.match(componentSource, /v-else-if="!open"/)
  assert.match(componentSource, /md:max-h-\[62vh\]/)
  assert.match(pageSource, /<MapTransitPanel\s+v-if="transitLinesOpen/)
  assert.match(pageSource, /:left-offset="sidebarCollapsed/)
  assert.match(pageSource, /flex min-h-0 flex-1 flex-col md:hidden/)
})

test('修正 01 F1+05：抽屉在 400 半屏内铺满，不再把面板顶到 548', () => {
  // 修正 02：transit 视图改走自己的高度助手（半屏 400 / 展开 548），不再和列表视图共用 326。
  assert.match(pageSource, /mapSheetView === 'transit'\s*\?\s*resolveTransitSheetHeightClass\(mobileSheetState\)/)
  assert.match(presentationSource, /half: 'max-md:!h-\[400px\]'/)
  assert.match(presentationSource, /expanded: 'max-md:!h-\[min\(548px,calc\(100%_-_0\.75rem\)\)\]'/)
  assert.match(pageSource, /function handleTransitDrawerChange\(open: boolean\): void \{/)
  assert.doesNotMatch(pageSource, /transitDrawerRaised\.value = true/)
  assert.match(pageSource, /@update:drawer-open="handleTransitDrawerChange\(\$event\)"/)
  assert.match(componentSource, /min-h-0 overflow-y-auto overscroll-contain/)
  assert.match(componentSource, /drawerOpen \? 'flex-1 opacity-100' :/)
  assert.match(componentSource, /const drawer = document\.querySelector<HTMLElement>/)
})

test('修正 01/02 F2：抽屉打开时线路体与方向切换都还在', () => {
  assert.match(componentSource, /v-show="!drawerOpen"\n {6}class="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2"/)
  assert.match(componentSource, /v-for="segment in sheetDirectionSegments"/)
  assert.match(componentSource, /@click="toggleDirection\(segment\.direction\)"/)
  assert.doesNotMatch(componentSource, /<footer[\s\S]{0,200}?v-show=/)
  assert.match(componentSource, /drawerOpen \? `今日 \$\{sheetTodayCount\} 班` : `下一班 \$\{sheetNextChipTime \|\| '—'\}`/)
})

test('T-032 在途车大卡、站列徽标与头部更新秒数', () => {
  assert.match(sheetSource, /const sheetFreshness = computed/)
  assert.match(sheetSource, /更新 \$\{seconds\} 秒前/)
  assert.match(sheetSource, /const sheetLeadVehicle = computed/)
  assert.match(sheetSource, /h-\[56px\] items-center gap-2 rounded-\[14px\] border px-2\.5/)
  assert.match(sheetSource, /text-\[26px\] font-extrabold/)
  assert.match(sheetSource, /预计 \{\{ sheetLeadVehicle\.etaMinutes \}\} 分钟后到/)
  assert.match(sheetSource, /v-for="vehicle in sheetOtherVehicles"/)
  assert.match(sheetSource, /<ol[^>]*v-if="sheetActiveDirection"[^>]*aria-label="站点"/)
  assert.match(sheetSource, /sheetStartBadge/)
  assert.match(sheetSource, /v-if="rowIsStart\(sheetActiveDirection, row\.stop\.seq\)"/)
  assert.match(sheetSource, /v-if="rowIsStart\(sheetActiveDirection, row\.stop\.seq\)"/)
  assert.match(sheetSource, />末站</)
})

test('修正 01 F3：抽屉头带来收起按钮，底栏让位抽屉', () => {
  assert.doesNotMatch(componentSource, /aria-label="收起时刻表"/)
  assert.match(componentSource, /aria-label="drawerOpen \? '收起今日时刻表' : '打开今日时刻表'"/)
  assert.match(componentSource, /@click="emit\('update:drawerOpen', !drawerOpen\)"/)
  assert.match(componentSource, /\{\{ sheetNextChipTime \|\| .—. \}\}/)
})

test('修正 04：时刻表抽屉带过渡、表头吸附，下一班不再被表头压住', () => {
  assert.match(componentSource, /transition-\[opacity\] duration-200 ease-out/)
  assert.match(componentSource, /drawerOpen \? 'flex-1 opacity-100' : 'pointer-events-none max-h-0 flex-none border-t-0 !p-0 opacity-0'/)
  assert.match(componentSource, /sticky top-0 z-10 -mx-3 flex items-baseline gap-1\.5 border-b[^"]*bg-white\/95 px-3 pt-2 pb-1 backdrop-blur-\[3px\]/)
  assert.match(componentSource, /const headerHeight = header instanceof HTMLElement \? header\.getBoundingClientRect\(\)\.height : 0/)
  assert.match(componentSource, /drawer\.scrollTop \+= offset - \(visibleTop \+ room \/ 2\)/)
  assert.match(componentSource, /\{\{ drawerOpen \? '收起 ⌄' : '时刻表 ›' \}\}/)
})
