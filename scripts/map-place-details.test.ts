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
// T-024：展开/收起过渡期的暂停与纹理降本都在这个 composable 里。
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
    /:aria-label="mobileSheetState === 'collapsed' \? '展开地点面板' : '收起地点面板'"/,
  )
  assert.equal(
    (pageSource.match(/class="justify-center size-9"/g) || []).length,
    0,
    '三态图标按钮应已被文字按钮取代',
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
  assert.match(pageSource, /max-md:!h-\[326px\]/, '半屏高度应使用 max-md:!h-[326px]')
})

test('mobile sheet collapsed state collapses via the max-md breakpoint', () => {
  assert.match(pageSource, /max-md:!h-0 max-md:border-t-0 max-md:shadow-none/, '折叠态收起与边框阴影应走 max-md:')
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
    /searchQuery\.trim\(\) \|\| nativeSearchLoading \|\| mapFallbackMessage \? '' : 'hidden md:block'/,
  )
  assert.match(
    pageSource,
    /class="hidden shrink-0 border-b border-\[var\(--line\)\] px-3 py-2 md:block md:px-5 md:py-4"/,
  )
})

test('mobile sheet sections scroller hides the scrollbar', () => {
  assert.match(
    pageSource,
    /class="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3 pt-0 md:hidden"/,
  )
})

test('mobile sheet stays bound to the two glass state classes', () => {
  assert.match(pageSource, /mapGlassActive \? 'map-glass-refracting' : 'map-glass-surface'/)
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

test('sheet height transition animates height only and keeps a 280ms soft ease', () => {
  // T-024：只过渡 height。transition-all 会把圆角、阴影、边框一起插值，展开时抖动明显。
  assert.match(pageSource, /transition-\[height\] duration-\[280ms\] ease-\[cubic-bezier\(0\.32,0\.72,0,1\)\]/)
  assert.equal(pageSource.match(/transition-all/g), null, '页面里不应出现 transition-all')
  // 面板内容隔离 layout/paint：高度变化不再触发整块重排。
  assert.match(pageSource, /\[contain:layout_paint\]/)
})

test('sheet transition pauses glass refraction and resumes afterwards', () => {
  // T-024：过渡期不画折射，靠 transitionstart/end 开关；360ms 兜底定时器覆盖反向拖拽。
  assert.match(pageSource, /@transitionstart="handleSheetTransitionStart"/)
  assert.match(pageSource, /@transitionend="handleSheetTransitionEnd"/)
  assert.match(pageSource, /setMapGlassPaused\(true\)/)
  assert.match(pageSource, /setMapGlassPaused\(false\)/)
  assert.match(pageSource, /setTimeout\(endGlassTransition, 360\)/)
  assert.match(glassSource, /function setPaused\(value: boolean\): void/)
  assert.match(glassSource, /if \(paused\.value\) return/, 'renderFrame 应在暂停时提前返回')
  assert.match(glassSource, /return \{ attach, start, stop, setPaused, ready, fps, paused \}/)
})

test('glass texture upload is downsampled to half size and rate limited to 30Hz', () => {
  // T-024 降本：底图纹理 0.5x 降采样（像素量 1/4）+ 上传限频 33ms。
  assert.match(glassSource, /const GLASS_UPLOAD_SCALE = 0\.5/)
  assert.match(glassSource, /const GLASS_UPLOAD_INTERVAL_MS = 33/)
  assert.match(glassSource, /downscaleContext\.drawImage\(source, 0, 0, targetWidth, targetHeight\)/)
  assert.match(glassSource, /gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA, gl\.RGBA, gl\.UNSIGNED_BYTE, downscaleCanvas\)/)
  assert.match(glassSource, /if \(!textureUploaded \|\| now - lastUploadAt >= GLASS_UPLOAD_INTERVAL_MS\)/)
})
