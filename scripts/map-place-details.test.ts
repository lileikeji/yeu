import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
// 选点后收起底部列表的行为搬进了 useMapPoi（selectPoi），断言跟着实现走。
const poiComposableSource = readFileSync(resolve('app/composables/useMapPoi.ts'), 'utf8')
const detailsSource = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')
const layoutSource = readFileSync(resolve('app/layouts/default.vue'), 'utf8')
const e2eFixtureSource = readFileSync(resolve('scripts/prepare-e2e-database.ts'), 'utf8')
// 展开/收起过渡期不暂停绘制、只冻结纹理上传；纹理降本都在这个 composable 里。
const glassSource = readFileSync(resolve('app/composables/useMapGlassRefraction.ts'), 'utf8')

test('map place details use compact mobile and desktop-only floating panels', () => {
  // 拆分后整棵面板只挂一份，variant 由 matchMedia 断点切换：两份并挂会把同一地点在 DOM 里渲染两遍。
  assert.equal(pageSource.match(/<MapPlaceDetailsPanel\b/g)?.length, 1)
  assert.match(pageSource, /:variant="panelIsDesktop \? 'desktop' : 'mobile'"/)
  assert.match(pageSource, /const PANEL_DESKTOP_MEDIA_QUERY = '\(min-width: 768px\)'/)
  assert.doesNotMatch(pageSource, /variant="mobile"/)
  assert.doesNotMatch(pageSource, /variant="desktop"/)
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
  assert.match(detailsSource, /max-h-\[min\(56dvh,30rem\)\]/)
  assert.match(detailsSource, /md:hidden/)
  assert.match(detailsSource, /hidden md:absolute/)
  assert.match(detailsSource, /absolute bottom-\[calc\(var\(--mobile-nav-height\)\+env\(safe-area-inset-bottom\)\+0\.5rem\)\]/)
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
    /sheetHydrated && !mobileSheetDragging && mobileSheetState === 'half'\s*\?\s*'max-md:!h-\[326px\]'\s*:\s*''/,
    '半屏高度必须挂在水合完成 + half 的守卫上，无条件挂 max-md 会把 expanded 也压成 326'
  )
  assert.equal((pageSource.match(/max-md:!h-\[326px\]/g) || []).length, 1, '半屏高度类只应出现一次')
})

test('mobile sheet collapsed state collapses via the max-md breakpoint', () => {
  assert.match(
    pageSource,
    /!sheetHydrated \|\| mobileSheetState === 'collapsed'\s*\?\s*'max-md:!h-0 max-md:border-t-0 max-md:shadow-none'\s*:\s*''/,
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
    /class="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3 pt-0 md:hidden"/
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

test('sheet fallback keeps a 90% veil with blur(16px) when WebGL is unavailable', () => {
  const rule = pageSource.match(/\.map-workspace \.map-glass-sheet \{([^}]*)\}/)
  assert.ok(rule, '应存在 .map-glass-sheet 基础规则')
  const body = rule[1] ?? ''
  assert.match(body, /var\(--surface\) 90%/, '回落态白纱应为 90%')
  assert.match(body, /blur\(16px\)/, '回落态 blur 应为 16px')
})

test('sheet refracting state drops the veil to <=82% and blur to <=2px', () => {
  const rule = pageSource.match(/\.map-workspace \.map-glass-sheet\.map-glass-refracting \{([^}]*)\}/)
  assert.ok(rule, '应存在 .map-glass-sheet.map-glass-refracting 规则')
  const body = rule[1] ?? ''
  const veil = Number(body.match(/var\(--surface\) (\d+(?:\.\d+)?)%/)?.[1])
  assert.ok(Number.isFinite(veil) && veil <= 82, '折射态白纱应 ≤82%，实际 ' + veil + '%')
  const blur = Number(body.match(/blur\((\d+(?:\.\d+)?)px\)/)?.[1])
  assert.ok(Number.isFinite(blur) && blur <= 2, '折射态 blur 应 ≤2px，实际 ' + blur + 'px')
})

test('sheet height transition animates height only and keeps a 320ms soft ease', () => {
  // T-024：只过渡 height。transition-all 会把圆角、阴影、边框一起插值，展开时抖动明显。
  assert.match(pageSource, /transition-\[height\] duration-\[320ms\] ease-\[cubic-bezier\(0\.24,1,0\.32,1\)\]/)
  assert.equal(pageSource.match(/transition-all/g), null, '页面里不应出现 transition-all')
  // 面板内容隔离 layout/paint：高度变化不再触发整块重排。
  assert.match(pageSource, /\[contain:layout_paint\]/)
})

test('sheet transition keeps glass refracting and only freezes the texture upload', () => {
  // 面板在动、底图没动：过渡期照常画折射，只冻结底图纹理上传。
  // 停画会让面板退回 90% 白纱、落定瞬间再切回 66% 玻璃，收起时看得见闪一下。
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
  assert.ok(pageSource.includes('sheetHydrated && !mobileSheetDragging && mobileSheetState === \'half\' ? \'max-md:!h-[326px]\' : \'\''))
  assert.ok(pageSource.includes('!sheetHydrated || mobileSheetState === \'collapsed\' ? \'max-md:!h-0 max-md:border-t-0 max-md:shadow-none\' : \'\''))
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
  assert.match(pageSource, /function openMapSheetCategory\(id: MapSheetCategoryId\): void \{[\s\S]{0,220}?mapSheetView\.value = 'all'/)
  assert.match(pageSource, /\{ id: 'all', label: '全部地点'/)
})

test('sheet live height records the collapsed zero baseline', () => {
  // CR-8：折叠态高度 0 也要记进基线，dock 才会贴底。
  assert.match(pageSource, /mobileSheetLiveHeightPx\.value = height/)
  assert.doesNotMatch(pageSource, /if \(height > 0\) mobileSheetLiveHeightPx/)
})

test('mobile dock search expands the sheet and renders results in the panel', () => {
  // CR-11：手机搜索要有加载态/结果列表并可点选。
  assert.match(pageSource, /function onMobileDockSearchInput\(value: string\): void \{/)
  assert.match(pageSource, /@input="onMobileDockSearchInput\(/)
  assert.match(pageSource, /aria-label="地图搜索结果"/)
  assert.match(pageSource, /正在搜索地图里的地点…/)
  assert.match(pageSource, /找到 \{\{ nativeSearchResults\.length \}\} 个地点/)
})

test('mobile sheet exposes the display settings entry', () => {
  // CR-12：手机要有「地图显示设置」入口，开的是同一个面板。
  assert.match(pageSource, /aria-label="地图显示设置"[\s\S]{0,120}?@click="toggleDisplaySettings"/)
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
  assert.match(pageSource, /v-for="place in nativeSearchResults"[\s\S]{0,400}?@click="selectPoi\(place\)"/)
})

test('mobile dock search input stays visible while searching', () => {
  // F23：抬到半屏后 dock 整块被 v-show 关掉，用户正在输入的搜索框会消失。
  assert.match(pageSource, /v-show="mobileSheetState === 'collapsed' \|\| mapSheetSearching"/)
  // 搜索把面板抬到半屏后，dock 要让开面板高度，否则搜索框被面板压在下面看不见。
  assert.match(pageSource, /mobileSheetState === 'collapsed' \? '' : 'bottom-\[var\(--map-mobile-dock\)\]'/)
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
