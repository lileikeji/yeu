import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
// 选点后收起底部列表的行为搬进了 useMapPoi（selectPoi），断言跟着实现走。
const poiComposableSource = readFileSync(resolve('app/composables/useMapPoi.ts'), 'utf8')
const detailsSource = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')
// T-033：搜索行与胶囊都在 ShellDock 里，dock 相关断言改读它。
const shellDockSource = readFileSync(resolve('app/components/ShellDock.vue'), 'utf8')
const layoutSource = readFileSync(resolve('app/layouts/default.vue'), 'utf8')
const e2eFixtureSource = readFileSync(resolve('scripts/prepare-e2e-database.ts'), 'utf8')
// 展开/收起过渡期不暂停绘制、只冻结纹理上传；纹理降本都在这个 composable 里。
const glassSource = readFileSync(resolve('app/composables/useMapGlassRefraction.ts'), 'utf8')

test('map place details use compact mobile and desktop-only floating panels', () => {
  // 拆分后整棵面板只挂一份，variant 由 matchMedia 断点切换：两份并挂会把同一地点在 DOM 里渲染两遍。
  assert.equal(pageSource.match(/<MapPlaceDetailsPanel\b/g)?.length, 1)
  // T-028：手机不再有底部详情卡，整棵面板只挂桌面分支。
  assert.match(pageSource, /v-if="selectedPoi && panelIsDesktop"/)
  assert.match(pageSource, /const PANEL_DESKTOP_MEDIA_QUERY = '\(min-width: 768px\)'/)
  assert.doesNotMatch(pageSource, /variant="mobile"/)
  assert.match(pageSource, /^\s+variant="desktop"$/m)
  assert.match(pageSource, /@copy="copyPoiLocation\(selectedPoi\)"/)
  assert.match(pageSource, /@plan-route="startWalkingRoute\(selectedPoi\.name, selectedPoi\.point\)"/)
  assert.match(poiComposableSource, /On mobile, free the bottom list sheet so the floating place card can show over the map/)
  assert.match(pageSource, /const initialSelectedPoiId = resolveInitialSelectedMapPoiId\(places\.value, initialPlace\)/)
  assert.match(pageSource, /ref<MobileSheetState>\(initialSelectedPoiId \? 'collapsed' : 'half'\)/)
  assert.match(pageSource, /ref="mobileSheetElement"/)
  assert.match(pageSource, /@pointerdown="handleMobileSheetPointerDown"/)
  assert.match(pageSource, /@pointermove="handleMobileSheetPointerMove"/)
  assert.match(pageSource, /@pointerup="finishMobileSheetDrag\(\$event\.pointerId\)"/)
  assert.match(pageSource, /data-sheet-drag-handle/)
  assert.match(pageSource, /上下拖动地点面板/)
  assert.match(pageSource, /explicitDragHandle/)
  assert.doesNotMatch(pageSource, /label="复制位置"/)
  assert.doesNotMatch(pageSource, /到这里前先确认/)

  assert.match(detailsSource, /place: PublicMapPlace/)
  assert.match(detailsSource, /variant: 'mobile' \| 'desktop'/)
  assert.match(detailsSource, /detailsTarget\?: RouteLocationRaw/)
  assert.match(detailsSource, /emit\('close'\)/)
  assert.match(detailsSource, /emit\('copy'\)/)
  assert.match(detailsSource, /emit\('planRoute'\)/)
  assert.match(detailsSource, /props\.variant === 'desktop'/)
  assert.match(detailsSource, /props\.place\.campusArea/)
  assert.match(detailsSource, /微信内可复制位置再搜/)
  assert.match(detailsSource, /grid grid-cols-2 gap-2/)
  assert.ok(
    detailsSource.indexOf('label="规划步行路线"')
    < detailsSource.indexOf('到这里前先确认')
  )
  assert.match(detailsSource, /label="规划步行路线"[\s\S]*?variant="solid"/)
  // 结构性断言：桌面/移动各有「规划步行路线」，另有共用的「选起点规划」降级入口。
  assert.equal((detailsSource.match(/label="规划步行路线"/g) || []).length, 2)
  assert.equal((detailsSource.match(/label="选起点规划"/g) || []).length, 1)
  // T-022：面板头部三态图标按钮（全隐藏 / 半屏 / 展开）换成「展开 / 收起」文字按钮，
  // 结构以 mockup 18-地图页-真折射手机.png 为准。
  assert.match(
    pageSource,
    /:aria-label="mobileSheetState === 'collapsed' \? '展开地点面板' : '收起地点面板'"/
  )
  assert.equal(
    (pageSource.match(/class="justify-center size-9"/g) || []).length,
    0,
    '三态图标按钮应已被文字按钮取代'
  )
  assert.match(pageSource, /class="min-h-10(?:\s+dark:[^"\s]+)*\s+w-full(?:\s+dark:[^"\s]+)*\s+md:mt-3(?:\s+dark:[^"\s]+)*\s+md:min-h-11(?:\s+dark:[^"\s]+)*"/)
  assert.equal((pageSource.match(/\['min-h-11 rounded-none px-3'/g) || []).length, 2)
  // T-028：手机分支已删除，只剩桌面定位类。
  assert.doesNotMatch(detailsSource, /max-h-\[min\(56dvh,30rem\)\]/)
  assert.doesNotMatch(detailsSource, /md:hidden/)
  assert.match(detailsSource, /hidden md:absolute/)
  assert.doesNotMatch(detailsSource, /--mobile-nav-height/)
  assert.match(pageSource, /min-h-0 overflow-hidden bg-\[var\(--surface\)\]/)
  assert.doesNotMatch(pageSource, /min-h-\[34rem\]/)
  assert.match(layoutSource, /v-if="!isMapPage && !isSearchPage"/)
  assert.doesNotMatch(detailsSource, /useRoute|useRouter|createRuntimeMapProvider/)
  assert.match(e2eFixtureSource, /【到这里前先确认】\\n- 核对地点名称和入口标识。/)
})

test('map header keeps the same branding as other pages', () => {
  // 2026-11-07 用户要求地图页顶栏与其他页面统一：品牌 logo 始终渲染，
  // 不再有「地图页隐藏 logo、移动端显示选中地点名」的特判。
  assert.doesNotMatch(layoutSource, /v-if="!isMapPage"[^>]*aria-label="迎新指南首页"/)
  assert.doesNotMatch(layoutSource, /mapHeaderTitle/)
  assert.doesNotMatch(pageSource, /map-header-title/)
  assert.match(layoutSource, /aria-label="迎新指南首页"/)
})

test('mobile map search and controls use the compact interaction layout', () => {
  assert.match(pageSource, /class="relative flex h-14 shrink-0 touch-none cursor-ns-resize/)
  assert.match(pageSource, /class="mt-2 grid grid-cols-4 gap-1/)
  assert.match(pageSource, /class="min-h-9 min-w-0 justify-center/)
  assert.match(pageSource, /map-control-btn size-10 rounded-none md:size-11/)
  // 右侧连体工具栏 7 个按钮必须带 justify-center：UButton 的 base 只有 items-center，
  // 方形按钮不加 justify-center 时图标会贴左侧。
  assert.equal((pageSource.match(/class="justify-center map-control-btn size-10 rounded-none md:size-11"/g) || []).length, 7)
  assert.match(pageSource, /divide-y(?:\s+dark:[^"\s]+)*\s+divide-zinc-200(?:\s+dark:[^"\s]+)*\s+overflow-hidden(?:\s+dark:[^"\s]+)*\s+rounded-xl(?:\s+dark:[^"\s]+)*/)
})

test('desktop place list keeps mouse and wheel control after mobile sheet collapse', () => {
  assert.match(pageSource, /md:pointer-events-auto/)
  assert.match(
    pageSource,
    /mobileSheetState === 'collapsed'[\s\S]*?'hidden md:block' : 'block'/
  )
  assert.match(pageSource, /class="map-place-list(?:\s+dark:[^"\s]+)*\s+min-h-0(?:\s+dark:[^"\s]+)*\s+flex-1(?:\s+dark:[^"\s]+)*\s+overflow-y-auto(?:\s+dark:[^"\s]+)*\s+overscroll-y-contain(?:\s+dark:[^"\s]+)*\s+md:block(?:\s+dark:[^"\s]+)*"/)
  assert.match(pageSource, /@wheel\.stop/)
  assert.match(pageSource, /@touchmove\.stop/)
  assert.match(pageSource, /'overflow-hidden'/)
  assert.match(pageSource, /mobileSheetState === 'collapsed'[\s\S]*?'hidden md:block' : 'block'/)
})

// T-022 修正 01（R-010 F14）：半屏 326 / 折叠 0 必须由 CSS 断点决定（max-md:），
// 不能挂在 panelIsDesktop 上——JS 断点与 CSS 断点不同源时面板会卡在 58vh。
test('mobile sheet half height is pinned by the max-md breakpoint', () => {
  assert.match(
    pageSource,
    /mapSheetView !== 'bus' && mapSheetView !== 'transit' && mapSheetView !== 'activity' && sheetHydrated && !mobileSheetDragging && mobileSheetState === 'half'\s*\?\s*SHEET_HALF_326\s*:\s*''/,
    '半屏高度必须挂在水合完成 + half 的守卫上，无条件挂 max-md 会把 expanded 也压成 326'
  )
  assert.equal((pageSource.match(/max-md:!h-\[326px\]/g) || []).length, 1, '半屏高度类只应出现一次')
})

test('mobile sheet collapsed state collapses via the max-md breakpoint', () => {
  assert.match(
    pageSource,
    /mapSheetView !== 'bus' && \(!sheetHydrated \|\| mobileSheetState === 'collapsed'\)\s*\?\s*'max-md:!h-0 max-md:border-t-0 max-md:shadow-none'\s*:\s*''/,
    '折叠态收起与边框阴影应挂在「未水合或 collapsed」守卫上'
  )
  assert.equal((pageSource.match(/max-md:!h-0/g) || []).length, 1, '折叠高度类只应出现一次')
})

test('mobile sheet no longer renders an in-panel search input', () => {
  assert.doesNotMatch(pageSource, /aria-label="面板里搜索地图地点"/)
  // dock 搜索胶囊与桌面搜索块保持不变
  assert.match(pageSource, /aria-label="搜索地图地点"/)
  assert.match(pageSource, /hidden md:block/)
})

// T-023 修正 01（用户手机截图）：面板里两条突兀横线 —— 桌面侧栏搜索块在移动端内层已隐藏，
// 外壳只剩 py-2 空白 + border-b（实测 17px 空条）；移动端整块不该出。滚动区竖向滚动条也要藏。
test('mobile sheet drops the empty desktop search strip and its border', () => {
  assert.doesNotMatch(
    pageSource,
    /searchQuery\.trim\(\) \|\| nativeSearchLoading \|\| mapFallbackMessage \? '' : 'hidden md:block'/
  )
  assert.match(
    pageSource,
    /class="hidden shrink-0 border-b border-\[var\(--line\)\] px-3 py-2 md:block md:px-5 md:py-4"/
  )
})

test('mobile sheet sections scroller hides the scrollbar', () => {
  assert.match(
    pageSource,
    // T-033：滚动容器多挂了底部隐化类，断言只钉滚动相关那串 class。
    /class="[^"]*scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3 pt-0 md:hidden"/
  )
})

test('favorite star keeps 3:1 against surface in both states', () => {
  // 非文本图标按 WCAG 1.4.11 要 3:1：amber-500 压纸白仅 2.13、zinc-400 仅 2.6
  assert.match(detailsSource, /text-amber-600 dark:text-amber-400/, '点亮态浅色需 amber-600')
  assert.match(detailsSource, /text-zinc-500 dark:text-zinc-400/, '未点亮态浅色需 zinc-500')
  assert.doesNotMatch(detailsSource, /text-amber-500/)
})

test('mobile sheet stays bound to the two glass state classes', () => {
  // 全文另有三处同串（chips / dock / 桌面侧栏），只查全文会被「删掉面板那条」骗过，必须锚到 aside
  const sheetStart = pageSource.indexOf('class="map-glass-sheet')
  assert.ok(sheetStart > 0, '未找到 .map-glass-sheet 面板节点')
  const sheetBlock = pageSource.slice(sheetStart, sheetStart + 2500)
  assert.match(sheetBlock, /'map-glass-refracting' : 'map-glass-surface'/, '面板本身必须绑定折射/回落两个状态类')
})

test('mobile sheet is registered as a glass refraction target', () => {
  assert.match(pageSource, /push\(mobileSheetElement\.value,/)
})

test('sheet fallback keeps the 96% veil when WebGL2 is unavailable', () => {
  const rule = pageSource.match(/\.map-workspace \.map-glass-sheet \{([^}]*)\}/)
  assert.ok(rule, '应存在 .map-glass-sheet 基础规则')
  const body = rule[1] ?? ''
  assert.match(body, /var\(--surface\) 96%/, '回落态（无 WebGL2 / 关开关）仍要靠 96% 白纱撑住可读性')
  assert.match(body, /blur\(2px\) saturate\(1\.05\)/, '回落态 blur 应与折射态一致，不再发雾')
})

test('sheet refracting state is painted by WebGL2 alone: no CSS veil, no CSS backdrop blur', () => {
  const rule = pageSource.match(/\.map-workspace \.map-glass-sheet\.map-glass-refracting \{([^}]*)\}/)
  assert.ok(rule, '应存在 .map-glass-sheet.map-glass-refracting 规则')
  const body = rule[1] ?? ''
  // 2026-11-26 用户「我要把折射都改为 webgl2」：白纱与模糊搬进着色器（frost 0.9 + 步长随 frost 加粗），
  // CSS 再叠 backdrop-filter 会把弯折后的底图糊回平色，折射等于白做。
  assert.match(body, /background: transparent;/, '折射态背景必须透明，玻璃外观全部由 WebGL2 着色器画')
  assert.match(body, /backdrop-filter: none;/, '折射态不能再叠 CSS blur')
  assert.doesNotMatch(body, /color-mix/, '折射态不再保留 CSS 白纱')
})

test('sheet height transition animates height only and keeps a 320ms soft ease', () => {
  // T-024：只过渡 height。transition-all 会把圆角、阴影、边框一起插值，展开时抖动明显。
  assert.match(pageSource, /transition-\[height\] duration-\[320ms\] ease-\[var\(--ease-sheet\)\]/)
  assert.equal(pageSource.match(/transition-all/g), null, '页面里不应出现 transition-all')
  // 面板内容隔离 layout：高度变化不再触发整块重排。
  // 不能用 paint containment —— 它把元素背景/内容裁到 padding box 矩形、无视 border-radius，
  // 26px 圆角会退化成直角（用户 2026-11-23「这四角根本就不是圆角，有异常」）。
  assert.match(pageSource, /\[contain:layout\]/)
  assert.doesNotMatch(pageSource, /\[contain:layout_paint\]/, '面板用了 paint containment，圆角会被裁成直角')
})

test('sheet transition keeps glass refracting and only freezes the texture upload', () => {
  // 面板在动、底图没动：过渡期照常画折射，只冻结底图纹理上传。
  // 停画会让面板当场换一层白纱、落定瞬间再切回来，收起时看得见闪一下。
  assert.match(pageSource, /@transitionstart="handleSheetTransitionStart"/)
  assert.match(pageSource, /@transitionend="handleSheetTransitionEnd"/)
  assert.doesNotMatch(pageSource, /setMapGlassPaused/, '过渡期不应暂停玻璃绘制')
  assert.doesNotMatch(pageSource, /glassTransitioning/, '折射类不应随过渡期切换')
  assert.match(pageSource, /mapGlassActive \? 'map-glass-refracting' : 'map-glass-surface'/)
  assert.match(pageSource, /setMapGlassUploadFrozen\(true\)/)
  assert.match(pageSource, /setMapGlassUploadFrozen\(false\)/)
  assert.match(pageSource, /setTimeout\(endGlassTransition, 420\)/)
  assert.match(glassSource, /let uploadFrozen = false/)
  assert.match(glassSource, /function setUploadFrozen\(value: boolean\): void/)
  assert.match(glassSource, /!uploadFrozen && now - lastUploadAt >= GLASS_UPLOAD_INTERVAL_MS/, '过渡期应跳过纹理上传')
  assert.match(glassSource, /return \{ attach, start, stop, setUploadFrozen, ready, fps \}/)
})

test('glass texture upload is downsampled to half size and rate limited to 30Hz', () => {
  // T-024 降本：底图纹理 0.5x 降采样（像素量 1/4）+ 上传限频 33ms。
  assert.match(glassSource, /const GLASS_UPLOAD_SCALE = 0\.5/)
  assert.match(glassSource, /const GLASS_UPLOAD_INTERVAL_MS = 33/)
  assert.match(glassSource, /downscaleContext\.drawImage\(source, 0, 0, targetWidth, targetHeight\)/)
  assert.match(glassSource, /gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA, gl\.RGBA, gl\.UNSIGNED_BYTE, downscaleCanvas\)/)
  assert.match(glassSource, /if \(!textureUploaded \|\| \(!uploadFrozen && now - lastUploadAt >= GLASS_UPLOAD_INTERVAL_MS\)\)/)
})

test('sheet stays collapsed before hydration so mobile first paint never flashes open', () => {
  // 用户手机反馈：地图还在转圈时面板已经展开，hydration 完才收起。
  assert.match(pageSource, /const sheetHydrated = ref\(false\)/)
  assert.match(pageSource, /sheetHydrated\.value = true/)
  assert.ok(pageSource.includes('mapSheetView !== \'bus\' && mapSheetView !== \'transit\' && mapSheetView !== \'activity\' && sheetHydrated && !mobileSheetDragging && mobileSheetState === \'half\' ? SHEET_HALF_326 : \'\''))
  assert.ok(pageSource.includes('mapSheetView !== \'bus\' && (!sheetHydrated || mobileSheetState === \'collapsed\') ? \'max-md:!h-0 max-md:border-t-0 max-md:shadow-none\' : \'\''))
})

test('map chrome backdrop follows the palette instead of a fixed green grey', () => {
  // 固定 #e5ebe7/#1c231e 会让纸色/莓红等配色下地图底板透出灰绿，玻璃面板也跟着染色。
  assert.doesNotMatch(pageSource, /#e5ebe7/)
  assert.doesNotMatch(pageSource, /#1c231e/)
  assert.match(pageSource, /bg-\[var\(--page-bg\)\]/)
})
test('glass pipeline keeps premultiplied alpha consistent and clears the staging canvas', () => {
  // CR-4：上下文与混合函数必须同为预乘表示，着色器输出也要预乘，否则颜色被二次衰减。
  assert.match(glassSource, /premultipliedAlpha: true/)
  assert.match(glassSource, /outColor = vec4\(col \* alpha, alpha\);/)
  assert.match(glassSource, /gl\.blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\)/)
  // CR-2：中转画布复用，上传前必须擦除，透明区域不能留上一帧。
  assert.match(glassSource, /downscaleContext\.clearRect\(0, 0, targetWidth, targetHeight\)/)
})

test('glass pipeline stops claiming ready when the source or targets are missing', () => {
  // CR-3：源不可用时 ready 必须落回 false，页面才会走 backdrop-filter 兜底。
  assert.match(glassSource, /if \(!source\) \{\s*\/\/[^\n]*\n\s*ready\.value = false/)
  // CR-5：没有 target 就不上传底图，顺手把状态收干净。
  assert.match(glassSource, /const targets = options\.targets\(\)/)
  assert.match(glassSource, /if \(targets\.length === 0\) \{/)
})

test('glass stop clears run intent, ready flag and canvas', () => {
  // CR-5：stop() 要清掉「上下文恢复后继续」的意图；CR-6：停画后 ready=false 并擦画布。
  assert.match(glassSource, /function stop\(\): void \{[\s\S]{0,400}?resumeAfterRestore = false/)
  assert.match(glassSource, /function stop\(\): void \{[\s\S]{0,900}?ready\.value = false/)
  assert.match(glassSource, /function stop\(\): void \{[\s\S]{0,900}?gl\.clear\(gl\.COLOR_BUFFER_BIT\)/)
})

test('sheet category tap lands on the filtered place list', () => {
  // CR-7：分类点进去要看到地点（整表视图），且分类入口含「全部地点」，与注释一致。
  // 2026-11-23：热点分支插在整表之前，允许更长的函数体；整表仍是最终兜底
  assert.match(pageSource, /function openMapSheetCategory\(id: MapSheetCategoryId\): void \{[\s\S]{0,600}?mapSheetView\.value = 'all'/)
  assert.match(pageSource, /\{ id: 'all', label: '全部地点'/)
})

test('sheet live height records the collapsed zero baseline', () => {
  // CR-8：折叠态高度 0 也要记进基线，dock 才会贴底。
  assert.match(pageSource, /mobileSheetLiveHeightPx\.value = height/)
  assert.doesNotMatch(pageSource, /if \(height > 0\) mobileSheetLiveHeightPx/)
})

test('mobile dock search expands the sheet from the committed query and renders results', () => {
  // CR-11：手机搜索要有加载态/结果列表并可点选。
  // CR-14：抬面板只能跟提交后的 searchQuery，不能跟原始 input —— 输入法组词期间 searchQuery 不变，
  // 若按原始 input 抬成半屏，dock 里的输入框会被 v-show 隐藏、组词直接断掉。
  assert.match(pageSource, /function onMobileDockSearchInput\(value: string\): void \{\s*onSearchQueryInput\(value\)\s*\}/)
  // 2026-11-24 用户：「在搜索框敲下任何字符都会呼出面板」——打字不再抬面板，抬升只走显式提交那条。
  assert.match(pageSource, /watch\(searchQuery, \(query\) => \{[\s\S]{0,1400}?if \(action === 'rise'\) return/)
  assert.match(pageSource, /function raiseMobileSheetForSearch\(\): void \{[\s\S]{0,160}?resolveDockSearchMobileSheetState/)
  assert.match(shellDockSource, /@input="onSearchInput"/)
  // T-033：输入口搬进 ShellDock，页面靠共享 state 收口到同一个 onMobileDockSearchInput。
  assert.match(pageSource, /watch\(shellDockSearch,/)
  assert.match(pageSource, /aria-label="地图搜索结果"/)
  assert.match(pageSource, /正在搜索地图里的地点…/)
  assert.match(pageSource, /找到 \{\{ nativeSearchResults\.length \}\} 个地点/)
})

test('mobile sheet exposes the display settings entry', () => {
  // CR-12：手机要有「地图显示设置」入口，开的是同一个面板。
  // 手机入口用独立名字：桌面工具条的那个按钮同时存在于 DOM（只是 md 以下隐藏），
  // 同名会让读屏与 Playwright 的 getByRole 都解析到两个控件。
  assert.match(pageSource, /aria-label="打开地图显示设置"[\s\S]{0,120}?@click="toggleDisplaySettings\(\$event\)"/)
  assert.doesNotMatch(
    pageSource,
    /aria-label="地图显示设置"[\s\S]{0,120}?toggleDisplaySettings[\s\S]{0,200}?打开地图显示设置/,
    '手机入口与桌面工具条不应共用同一个可访问名'
  )
})

test('page source keeps no multiple consecutive blank lines', () => {
  // CR-10：@stylistic/no-multiple-empty-lines。
  assert.doesNotMatch(pageSource, /\n[ \t]*\n[ \t]*\n/)
})

test('search results block sits next to the toggle button instead of inside it', () => {
  // F23：<button> 里不能再套 <button>，结果块必须是「展开/收起」按钮的兄弟节点。
  const labelAt = pageSource.indexOf('{{ mobileSheetState === \'collapsed\' ? \'展开\' : \'收起\' }}')
  const resultsAt = pageSource.indexOf('aria-label="地图搜索结果"')
  const closeAt = pageSource.indexOf('</button>', labelAt)
  assert.ok(labelAt > 0, '面板头部应有「展开/收起」文字按钮')
  assert.ok(closeAt > 0, '「展开/收起」按钮应正常闭合')
  assert.ok(resultsAt > closeAt, '搜索结果块必须在按钮闭合之后，不能嵌在按钮里')
  // 结果条目仍然是 selectPoi 的入口，移出按钮后不许丢。
  assert.match(pageSource, /v-for="place in nativeSearchResults"[\s\S]{0,400}?@click="selectPoiFromSheet\(place\)"/)
})

test('mobile dock search input stays visible while searching', () => {
  // T-033：搜索行搬进全局 ShellDock 的合成块，不再随面板态 v-show 整块关掉；
  // 面板 expanded 时只淡出并让出指针（C2），输入框本身仍在 DOM 里。
  assert.match(shellDockSource, /class="shell-dock-search"/)
  assert.match(shellDockSource, /shell-dock--sheet-/)
  assert.doesNotMatch(shellDockSource, /v-show="mobileSheetState/)
  // 旧的在页内 dock 让位规则随合成块退场。
  assert.doesNotMatch(pageSource, /bottom-\[var\(--map-mobile-dock\)\]/)
})

test('native search widgets are hidden so only the custom clear button shows', () => {
  // F27：appearance:none 挡不住 ::-webkit-search-cancel-button，必须显式 display:none。
  assert.match(pageSource, /\.map-workspace input\[type='search'\]::-webkit-search-cancel-button,/)
  assert.match(pageSource, /\.map-workspace input\[type='search'\]::-webkit-search-decoration \{/)
  const rule = pageSource.match(/\.map-workspace input\[type='search'\]::-webkit-search-cancel-button,[\s\S]{0,200}?\{([\s\S]{0,120}?)\}/)
  assert.ok(rule, '取消钮与装饰伪元素应合并成一条规则')
  assert.match(rule![1], /display:\s*none/)
})

test('search result block only occupies space when it has content', () => {
  // F31：结果块是 flex-1，搜索中但没有 native 结果时仍占位，面板头部与列表之间空出一大块。
  assert.match(pageSource, /v-show="mapSheetSearching && \(nativeSearchLoading \|\| nativeSearchResults\.length > 0\)"/)
  // 空态交给下方的「地点列表」承载，结果块里不再留第二套空态文案。
  assert.doesNotMatch(pageSource, /没有找到匹配的地点/)
  assert.match(pageSource, /v-if="filteredPois\.length === 0"[\s\S]{0,600}?没有匹配的地点/)
})

test('map empty overlay separates "no match" from "no data"', () => {
  // F29：搜索筛掉全部地点时，覆盖层仍说「还没有可直接显示的地点」——把筛选无匹配说成数据缺失。
  assert.match(pageSource, /mapSheetSearching \? '没有匹配的地点' : '当前地图还没有可直接显示的地点'/)
})

test('glass upload scales the source once per frame', () => {
  // F24：clearRect + drawImage 各一次，重复的 drawImage 会让每帧多做一次缩放绘制。
  assert.equal((glassSource.match(/downscaleContext\.drawImage\(/g) || []).length, 1)
})

test('glass clears the canvas on both missing-source and missing-target paths', () => {
  // F25：源缺失也要擦画布，否则地图区挂着上一帧发白玻璃；stop() 注释缩进与函数体对齐。
  assert.match(glassSource, /if \(!source\) \{[\s\S]{0,240}?gl\.clear\(gl\.COLOR_BUFFER_BIT\)/)
  assert.match(glassSource, /^ {4}\/\/ 停画 = 不需要运行/m)
})

test('clearing the search folds the mobile sheet so the dock stays reachable', () => {
  // F32：面板停在半屏、查询又被清空时，dock 的 v-show 两个条件都不成立，整条 dock 会连输入框一起消失。
  assert.match(pageSource, /function onClearSearch\(\): void \{[\s\S]{0,220}?mobileSheetState\.value = 'collapsed'/)
  assert.equal((pageSource.match(/@click="clearSearchQuery"/g) || []).length, 0)
  assert.equal((pageSource.match(/@click="onClearSearch"/g) || []).length, 1)
  // 合成块里的 × 走 ShellDock 的 clearSearch，页面 watch 到空串后收口到同一条 onClearSearch。
  assert.match(shellDockSource, /@click="clearSearch"/)
  assert.match(pageSource, /watch\(shellDockSearch, \(value\) => \{[\s\S]{0,160}?onMobileDockSearchInput\(value\)/)
})

test('mobile bus pill is gone: no dock offset rules left to collide with the search dock', () => {
  // 手机浮标删除后，T-026 的 data-mobile-dock 让位机制整体退场；搜索胶囊位置只看 data-sheet-state。
  assert.doesNotMatch(pageSource, /map-bus-dock/)
  assert.doesNotMatch(pageSource, /data-mobile-dock/)
  assert.match(pageSource, /\.map-workspace\[data-sheet-state='expanded'\] \.map-mobile-dock \{[\s\S]{0,80}?display: none/)
})

test('大面板关掉 rim 亮边：28px 圆角处不再出现一道白线', () => {
  // 着色器那段 2px 亮边在小胶囊上是水切面，铺到 390×326 的面板上就只剩一条白线。
  // 2026-11-23（用户「左上角右上角还有白色的亮条」）：面板 quad 的圆角要跟 CSS 的 26px 对齐，
  // 否则方角从圆弧外露出来；frost 归 0，雾化在 96% 白纱下看不见，只会在圆角外缘叠白边。
  assert.match(pageSource, /push\(mobileSheetElement\.value, 0\.008, 3, 1, 0, 'top', 26, 16\)/)
  assert.match(pageSource, /const push = \(element: HTMLElement \| null, radius: number, strengthMul: number, frost: number, rim = 1, bandEdges: 'all' \| 'top' = 'all', radiusPx\?: number, band = 0\): void => \{/)
  assert.match(glassSource, /float rim = \(1\.0 - smoothstep\(0\.0, 2\.0 \* uDpr, -d\)\) \* clamp\(vParams\.w, 0\.0, 2\.0\)/)
  assert.match(glassSource, /rim: clamp\(target\.rim \?\? 1, 0, 2\)/)
  assert.match(glassSource, /mount\.params\[base \+ 3\] = quad\.rim/)
})

test('F-39 深色面板上沿用浅色 hairline：那 1px 不再用 --line 画（T-033 R5）', () => {
  const hairlineSites = pageSource.match(/border-t border-\[var\(--sheet-hairline\)\]/g) ?? []
  // 2026-11-23：活动视图页脚也加了一条同类 hairline（原来是 --line，深色下是黑边）
  assert.equal(hairlineSites.length, 3, '面板上沿（折叠/展开/活动页脚）都该用 --sheet-hairline')
  assert.doesNotMatch(pageSource, /border-t border-\[var\(--line\)\]/, '还有地方用 --line 画面板上沿，深色下就是黑边')
  const mainCss = readFileSync(resolve('app/assets/css/main.css'), 'utf8')
  assert.match(mainCss, /--sheet-hairline: rgb\(0 0 0 \/ 8%\);/)
  assert.match(mainCss, /html\.dark \{[\s\S]{0,600}?--sheet-hairline: rgb\(255 255 255 \/ 14%\);/)
})

test('手机面板手柄轻点在半屏与展开之间切换（搜索行隐藏后唯一入口）', () => {
  // 半屏起底栏搜索行整条隐藏，原来搜索框旁的上下箭头消失，改由拖拽手柄承担轻点切换。
  assert.match(pageSource, /const mobileSheetDragFromHandle = ref\(false\)/)
  assert.match(pageSource, /mobileSheetDragFromHandle\.value = Boolean\(explicitDragHandle\)/)
  assert.match(pageSource, /const tappedHandle = !mobileSheetDragMoved\.value[\s\S]{0,120}?mobileSheetDragFromHandle\.value/)
  assert.match(pageSource, /function toggleMobileSheetHeight\(\)[\s\S]{0,220}?mobileSheetState\.value === 'half' \? 'expanded' : 'half'/)
  // 拖拽过就不该当成点击：判据是这一个指针周期有没有移动，而不是「松手后 N ms」。
  assert.doesNotMatch(pageSource, /function toggleMobileSheetHeight\(\)[\s\S]{0,200}?sheetDragEndedAt \+ 240/)
})
