import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

// T-027：叮叮车（校车实时）从独立全屏浮层并入地图面板，成为第三种内容视图。
// 这里只看源码契约：三态高度、84/326/548、暖橙 token、站行 32、入口与回退链。
const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const componentSource = readFileSync(resolve('app/components/MapBusRoutePanel.vue'), 'utf8')
const presentationSource = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')
const cssSource = readFileSync(resolve('app/assets/css/main.css'), 'utf8')

// sheet 变体在组件里排在最前，桌面浮层用 !isSheet 守卫；这两段分开断言，避免浮层里的
// overflow-y-auto 被误判成「展开态还要滚」。
const sheetSource = componentSource.slice(0, componentSource.indexOf('v-if="!isSheet && !open"'))

test('叮叮车是面板第三视图：枚举含 bus、初值 sections、地图胶囊一键进入', () => {
  assert.match(pageSource, /type MapSheetView = 'sections' \| 'all' \| 'activity' \| 'bus' \| 'transit'/)
  assert.match(pageSource, /ref<MapSheetView>\('sections'\)/)
  assert.match(pageSource, /function openBusSheet\(\): void \{/)
  assert.match(pageSource, /mapSheetView\.value = 'bus'/)
  assert.match(pageSource, /mobileSheetState\.value = 'half'/)
  // 手机浮标已删：顶部第 6 格 chip 与折叠条是仅有的两个入口，组件里不再有 map-bus-dock
  assert.doesNotMatch(componentSource, /map-bus-dock/)
  assert.match(pageSource, /aria-label="打开叮叮车"/)
})

test('折叠态 84px 是叮叮车专属，和地点列表的 h-0 互斥', () => {
  assert.match(presentationSource, /collapsed: 'max-md:!h-\[84px\]'/)
  assert.match(pageSource, /mapSheetView === 'bus'\s*\? resolveBusSheetHeightClass\(mobileSheetState\)\s*: mapSheetView === 'transit'/)
  assert.match(pageSource, /mapSheetView !== 'bus' && \(!sheetHydrated \|\| mobileSheetState === 'collapsed'\) \? 'max-md:!h-0/)
  assert.match(pageSource, /mapSheetView !== 'bus' && mapSheetView !== 'transit' && mapSheetView !== 'activity' && sheetHydrated && !mobileSheetDragging/)
  assert.match(componentSource, /data-bus-collapsed-bar/)
  assert.match(componentSource, /aria-label="展开叮叮车"/)
  assert.match(componentSource, /emit\('sheet-raise'\)/)
})

test('折叠条结构：4px 把手 + 30px 图标 + 两行文案 + 4 分钟胶囊', () => {
  assert.match(componentSource, /top-\[7px\]/)
  assert.match(componentSource, /size-\[30px\]/)
  assert.match(componentSource, /collapsedEta/)
  assert.match(componentSource, /collapsedDetail/)
  // 叮叮车只有车名（叮叮车10 / 叮叮车2）没有车牌；分钟数只留右侧胶囊一处，标题不重复。
  assert.match(componentSource, /return bus\.busName \|\| '叮叮车'/)
  assert.doesNotMatch(componentSource, /'叮叮车 ' \+ eta/)
  assert.doesNotMatch(componentSource, /bus\.busName \+ ' · ' \+ where/)
  assert.match(componentSource, /:data-bus-stops="sheetStops\.length"/)
})

test('半屏沿用 326、展开上限 548，拖拽锚点同步收口', () => {
  assert.match(presentationSource, /half: 'max-md:!h-\[326px\]'/)
  assert.match(presentationSource, /expanded: 'max-md:!h-\[min\(548px,calc\(100%_-_0\.75rem\)\)\]'/)
  assert.match(presentationSource, /expanded: Math\.min\(548, fallback\.expanded\)/)
  assert.match(pageSource, /if \(mapSheetView\.value === 'bus'\) return resolveBusSheetAnchors\(anchors\)/)
  // 地点列表的半屏兜底仍在，没有被叮叮车的高度改写
  assert.match(pageSource, /max-md:!h-\[326px\]/)
})

test('暖橙收成 --bus-accent 三 token，组件里没有裸色值', () => {
  assert.doesNotMatch(componentSource, /orange-\d{2,3}/)
  assert.doesNotMatch(componentSource, /#[0-9a-f]{3,8}\b/i)
  assert.doesNotMatch(componentSource, /bg-white|rgba?\(/)
  assert.match(componentSource, /var\(--bus-accent\)/)
  assert.match(componentSource, /var\(--bus-accent-ink\)/)
  assert.match(componentSource, /var\(--bus-accent-soft\)/)
  assert.match(componentSource, /var\(--bus-accent-line\)/)
  assert.match(cssSource, /--bus-accent: #c2410c;/)
  assert.match(cssSource, /--bus-accent-ink: #ffffff;/)
  assert.match(cssSource, /--bus-accent: #fb923c;/)
  assert.match(cssSource, /--bus-accent-ink: #1c1917;/)
  assert.match(cssSource, /--bus-accent-soft: color-mix\(in srgb, var\(--bus-accent\) 12%, var\(--surface\)\)/)
})

test('站行 32px：放得下时等分、放不下时滚动，56 不再当站行常量', () => {
  assert.match(componentSource, /const STOP_ROW_HEIGHT = 32/)
  assert.doesNotMatch(componentSource, /STOP_ROW_HEIGHT = 56/)
  assert.match(componentSource, /Math\.max\(STOP_ROW_HEIGHT, listHeight\.value \/ count\)/)
  assert.match(componentSource, /auto-rows-\[minmax\(32px,1fr\)\]/)
  assert.match(componentSource, /grid min-h-full auto-rows-\[minmax\(32px,1fr\)\]/)
  // T-034：半屏 326 装不下 7 站，站列必须能滚；放得下时仍靠 min-h-full 等分拉满。
  assert.match(sheetSource, /overflow-y-auto overscroll-contain px-3 scrollbar-none/)
  assert.doesNotMatch(sheetSource, /min-h-0 flex-1 overflow-hidden px-3/)
})

test('面板内挂 sheet 变体，三态手势与「回到地点列表」闭环齐全', () => {
  assert.equal(pageSource.match(/<LazyMapBusRoutePanel\b/g)?.length, 2)
  assert.match(pageSource, /variant="sheet"/)
  assert.match(pageSource, /:state="mobileSheetState"/)
  assert.match(pageSource, /@sheet-raise="mobileSheetState = 'half'"/)
  assert.match(pageSource, /@sheet-expand="mobileSheetState = 'expanded'"/)
  assert.match(pageSource, /@sheet-collapse="mobileSheetState = 'half'"/)
  assert.match(pageSource, /@sheet-back="mapSheetView = 'sections'"/)
  assert.match(pageSource, /@sheet-drag-start="handleMobileSheetPointerDown\(\$event\)"/)
  assert.match(componentSource, /'sheet-back': \[\]/)
  assert.match(componentSource, /aria-label="切回地点列表"/)
})

test('视图切换只藏地点内容，桌面浮层原样保留', () => {
  assert.match(pageSource, /<template v-if="mapSheetView !== 'bus'">/)
  assert.match(componentSource, /const isSheet = computed\(\(\) => props\.variant === 'sheet'\)/)
  assert.match(componentSource, /v-if="!isSheet && !open"/)
  assert.match(componentSource, /v-else-if="!isSheet"/)
  assert.match(pageSource, /v-model:open="busPanelOpen"/)
})

test('T-040 入口：叮叮车移到折叠态浮钮带，一次点击进第三视图', () => {
  const grid = pageSource.indexOf('map-sheet-categories')
  const gridBlock = pageSource.slice(grid, pageSource.indexOf('</section>', grid))
  assert.ok(grid > 0, '分类格仍在')
  assert.doesNotMatch(gridBlock, /打开叮叮车/, '分类格里不再有叮叮车 chip')
  const at = pageSource.indexOf('aria-label="打开叮叮车"')
  assert.ok(at > 0, '叮叮车入口仍在页面上')
  const block = pageSource.slice(at - 1200, at + 400)
  assert.match(block, /@click="openBusSheet"/)
  assert.match(block, /var\(--bus-accent-soft\)/)
  assert.match(block, /mapSheetView !== 'bus'/)
})

test('手机浮标退场：dock 机制清零，顶部分类行仍是五格横向滑动', () => {
  // 顶部行本身就有 6 个分类、靠横滑展示，再塞第 7 格会被挤到屏幕外，所以入口只留在面板内。
  assert.match(pageSource, /auto-cols-\[calc\(\(100%_-_28px\)\/5\)\]/)
  assert.doesNotMatch(pageSource, /打开叮叮车线路/)
  assert.doesNotMatch(pageSource, /dock-visible/)
  assert.doesNotMatch(pageSource, /data-mobile-dock/)
})
test('叮叮车标题与「我的地图」同级：15px 半粗，不再是小号标签', () => {
  const at = componentSource.indexOf('text-[15px] font-semibold leading-6')
  assert.ok(at > 0, '标题用 15px 半粗')
  assert.equal(componentSource.slice(at, at + 200).includes('叮叮车'), true)
  assert.match(pageSource, /text-\[15px\] font-semibold[^>]*>\s*我的地图/)
})

test('车辆卡：有车是暖橙描边卡，车名 + 正驶向 + 右侧 ETA', () => {
  assert.match(componentSource, /正驶向「\$\{bus\.nextStopName\}」/)
  assert.match(componentSource, /已到「\$\{bus\.atSiteDetail\}」/)
  assert.match(componentSource, /到下一站/)
  assert.match(componentSource, /border-\[var\(--bus-accent-line\)\] bg-\[var\(--bus-accent-soft\)\]/)
  assert.match(componentSource, /text-\[19px\] font-extrabold/)
  assert.match(componentSource, /i-lucide-bus-front/)
  // 空态仍要有落款行，不能因为隐藏卡片就把「已收车 · 运营时段」一起丢了
  assert.match(componentSource, /v-else[\s\S]{0,700}?vehicleLine/)
})

test('站列底部渐隐按需：只有真溢出才给 12px（T-034 D2）', () => {
  assert.match(componentSource, /data-bus-stops-fade/)
  assert.match(componentSource, /linear-gradient\(to bottom, black calc\(100% - 12px\), transparent\)/)
  assert.match(componentSource, /'-webkit-mask-image': STOPS_FADE_MASK/)
  assert.match(componentSource, /'mask-image': STOPS_FADE_MASK/)
  // 渐隐挂在滚动容器自己身上（视口底边才是要提示的位置）；盖白纱会把 66% 玻璃糊实。
  const at = componentSource.indexOf('data-bus-stops-fade')
  assert.equal(componentSource.slice(at, at + 700).includes('grid min-h-full auto-rows-[minmax(32px,1fr)]'), true)
  assert.doesNotMatch(componentSource, /data-bus-stops-fade[\s\S]{0,300}?linear-gradient\(to top/)
})

// 用户反馈：点「收起」就应当彻底收掉，不能留一条 84px 残条（2026-11-22）。
// 这里锁两条：标题行「收起」走 sheet-hide → hideBusSheet（回地点列表折叠态）；
// 拖到最底同样直接退视图，不再停在 84。
test('收起＝彻底收掉：sheet-hide 回地点列表，标题区可拖，不留残条', () => {
  assert.match(componentSource, /'sheet-hide': \[\]/)
  assert.match(componentSource, /aria-label="收起叮叮车面板"/)
  assert.match(componentSource, /@click="emit\('sheet-hide'\)"/)
  // 标题区包一层 drag handle，避免只认 64×20 的把手；按钮自身不带 handle，点击不被拖拽吞掉。
  const handleAt = componentSource.indexOf('data-sheet-drag-handle\n          class="min-w-0 flex-1 touch-none"')
  assert.notEqual(handleAt, -1)
  assert.equal(componentSource.slice(handleAt, handleAt + 260).includes('@pointerdown="emit(\'sheet-drag-start\', $event)"'), true)
  assert.match(pageSource, /function hideBusSheet\(\): void \{/)
  const hideBusAt = pageSource.indexOf('function hideBusSheet(): void {')
  assert.notEqual(hideBusAt, -1, '缺少 hideBusSheet')
  assert.match(pageSource.slice(hideBusAt, hideBusAt + 240), /mapSheetView\.value = 'sections'/, 'hideBusSheet 体内必须切回地点列表')
  assert.match(pageSource, /@sheet-hide="hideBusSheet\(\)"/)
  // 拖到底＝退出，不停在折叠条
  const busCollapseAt = pageSource.search(/if \(mapSheetView\.value === 'bus' && nextState === 'collapsed'\) \{/)
  assert.notEqual(busCollapseAt, -1, '拖到折叠态必须退出叮叮车')
  assert.equal(pageSource.slice(busCollapseAt, busCollapseAt + 160).includes('hideBusSheet()'), true, '该分支必须真的调 hideBusSheet')
  // 不再给折叠条加叉号：折叠条块里没有「切回地点列表」（底栏的「地点」按钮不算）
  const barAt = componentSource.indexOf('data-bus-collapsed-bar')
  const barBlock = componentSource.slice(barAt, componentSource.indexOf('<template v-else>', barAt))
  assert.equal(barBlock.includes('切回地点列表'), false)
})
