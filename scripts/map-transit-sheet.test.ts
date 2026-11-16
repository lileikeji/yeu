import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { resolveSheetBackAction, resolveSheetHistorySync } from '../app/utils/map-presentation'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
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

test('T-030 线路分段：role=tablist 单选，滚动体只画所选那条线', () => {
  assert.match(sheetSource, /role="tablist"/)
  assert.match(sheetSource, /aria-label="选择线路"/)
  assert.match(sheetSource, /role="tab"/)
  assert.match(sheetSource, /:aria-selected="sheetLine === name"/)
  assert.match(sheetSource, /@click="selectSheetLine\(name\)"/)
  assert.match(sheetSource, /sheetActiveGroup = computed\(/)
  assert.doesNotMatch(sheetSource, /sheetLineGroups/, 'K2 / K6 不能再上下堆两段')
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
  assert.match(sheetSource, /toggleSheetStops\(direction\)/)
  assert.match(sheetSource, /scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain/)
  assert.match(sheetSource, /aria-label="线路与站点"/)
})

test('T-030 时刻表抽屉：首班末班 + 四列 chip + 268px 上限', () => {
  assert.match(sheetSource, /首班 \{\{ sheetFirstLast\.first \}\} · 末班 \{\{ sheetFirstLast\.last \}\}/)
  assert.match(sheetSource, /const sheetFirstLast = computed/)
  assert.match(sheetSource, /grid grid-cols-4 gap-1\.5/)
  assert.match(sheetSource, /aria-label="打开今日时刻表"/)
  assert.match(sheetSource, /class="flex h-12 shrink-0/)
  assert.match(sheetSource, /max-h-\[268px\]/)
  assert.match(sheetSource, /v-if="drawerOpen"/)
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

test('修正 01 F1：抽屉打开自动抬到 548，抽屉 268 封顶不再溢出', () => {
  assert.match(pageSource, /mapSheetView === 'transit' && mobileSheetState === 'expanded' \? 'max-md:!h-\[548px\]' : ''/)
  assert.match(pageSource, /function handleTransitDrawerChange\(open: boolean\): void \{/)
  assert.match(pageSource, /if \(!transitDrawerRaised\.value && mobileSheetState\.value === 'half'\) \{/)
  assert.match(pageSource, /@update:drawer-open="handleTransitDrawerChange\(\$event\)"/)
  assert.match(componentSource, /max-h-\[268px\] shrink-0 overflow-y-auto overscroll-contain/)
  assert.match(componentSource, /const drawer = document\.querySelector<HTMLElement>/)
})

test('修正 01 F2：抽屉打开时线路体与方向按钮都还在', () => {
  assert.doesNotMatch(componentSource, /v-show="!drawerOpen" class="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2"/)
  assert.match(componentSource, /v-for="direction in sheetActiveGroup\.directions"/)
  assert.match(componentSource, /@click="toggleDirection\(direction\)"/)
  assert.match(componentSource, /<footer v-show="!drawerOpen"/)
})

test('修正 01 F3：抽屉头带来收起按钮，底栏让位抽屉', () => {
  assert.match(componentSource, /aria-label="收起时刻表"/)
  assert.match(componentSource, /@click="emit\('update:drawerOpen', false\)"/)
  assert.match(componentSource, /\{\{ sheetNextChipTime \|\| .—. \}\}/)
})
