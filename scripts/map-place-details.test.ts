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
  assert.match(detailsSource, /微信内未唤起地图时/)
  assert.match(detailsSource, /grid grid-cols-2 gap-2/)
  assert.ok(
    detailsSource.indexOf('label="规划步行路线"')
    < detailsSource.indexOf('到这里前先确认')
  )
  assert.match(detailsSource, /label="规划步行路线"[\s\S]*?variant="solid"/)
  // 结构性断言：桌面/移动各有「规划步行路线」，另有共用的「选起点规划」降级入口。
  assert.equal((detailsSource.match(/label="规划步行路线"/g) || []).length, 2)
  assert.equal((detailsSource.match(/label="选起点规划"/g) || []).length, 1)
  assert.match(pageSource, /aria-label="全隐藏地点面板"[\s\S]{0,120}?mobileSheetState === 'collapsed'/)
  assert.equal((pageSource.match(/class="size-9"\s+aria-label="(?:全隐藏|半屏显示|展开)地点面板"/g) || []).length, 3)
  assert.match(pageSource, /class="min-h-10(?:\s+dark:[^"\s]+)*\s+w-full(?:\s+dark:[^"\s]+)*\s+md:mt-3(?:\s+dark:[^"\s]+)*\s+md:min-h-11(?:\s+dark:[^"\s]+)*"/)
  assert.equal((pageSource.match(/\['min-h-11 rounded-none px-3'/g) || []).length, 2)
  assert.match(detailsSource, /max-h-\[min\(56dvh,30rem\)\]/)
  assert.match(detailsSource, /md:hidden/)
  assert.match(detailsSource, /hidden md:absolute/)
  assert.match(detailsSource, /absolute bottom-\[calc\(var\(--mobile-nav-height\)\+env\(safe-area-inset-bottom\)\+0\.5rem\)\]/)
  assert.match(pageSource, /min-h-0 overflow-hidden bg-white/)
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
