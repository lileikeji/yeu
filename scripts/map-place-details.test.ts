import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const detailsSource = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')
const layoutSource = readFileSync(resolve('app/layouts/default.vue'), 'utf8')
const e2eFixtureSource = readFileSync(resolve('scripts/prepare-e2e-database.ts'), 'utf8')

test('map place details use compact mobile and desktop-only floating panels', () => {
  assert.equal(pageSource.match(/<MapPlaceDetailsPanel\b/g)?.length, 2)
  assert.match(pageSource, /variant="mobile"/)
  assert.match(pageSource, /variant="desktop"/)
  assert.match(pageSource, /@copy="copyPoiLocation\(selectedPoi\)"/)
  assert.match(pageSource, /@plan-route="startWalkingRoute\(selectedPoi\.name, selectedPoi\.point\)"/)
  assert.match(pageSource, /On mobile, free the bottom list sheet so the floating place card can show over the map/)
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
  assert.equal((detailsSource.match(/class="min-h-11(?:\s+dark:[^"\s]+)*\s+w-full(?:\s+dark:[^"\s]+)*\s+justify-center(?:\s+dark:[^"\s]+)*"/g) || []).length, 4)
  assert.equal((detailsSource.match(/class="min-h-11(?:\s+dark:[^"\s]+)*"/g) || []).length, 4)
  assert.match(pageSource, /aria-label="全隐藏地点面板"[\s\S]{0,120}?mobileSheetState === 'collapsed'/)
  assert.equal((pageSource.match(/class="size-9"\s+aria-label="(?:全隐藏|半屏显示|展开)地点面板"/g) || []).length, 3)
  assert.match(pageSource, /class="min-h-10(?:\s+dark:[^"\s]+)*\s+w-full(?:\s+dark:[^"\s]+)*\s+md:mt-3(?:\s+dark:[^"\s]+)*\s+md:min-h-11(?:\s+dark:[^"\s]+)*"/)
  assert.equal((pageSource.match(/\['min-h-11 rounded-none px-3'/g) || []).length, 2)
  assert.match(detailsSource, /max-h-\[min\(38dvh,18rem\)\]/)
  assert.match(detailsSource, /md:hidden/)
  assert.match(detailsSource, /hidden md:absolute/)
  assert.match(detailsSource, /absolute bottom-\[calc\(var\(--mobile-nav-height\)\+env\(safe-area-inset-bottom\)\+0\.75rem\)\]/)
  assert.match(pageSource, /min-h-0 overflow-hidden bg-white/)
  assert.doesNotMatch(pageSource, /min-h-\[34rem\]/)
  assert.match(layoutSource, /v-if="!isMapPage && !isSearchPage"/)
  assert.doesNotMatch(detailsSource, /useRoute|useRouter|createRuntimeMapProvider/)
  assert.match(e2eFixtureSource, /【到这里前先确认】\\n- 核对地点名称和入口标识。/)
})

test('map header hides branding and reflects the selected place on mobile', () => {
  assert.match(layoutSource, /v-if="!isMapPage"[\s\S]*?aria-label="迎新指南首页"/)
  assert.match(layoutSource, /v-else-if="mapHeaderTitle"/)
  assert.match(layoutSource, /\{\{ mapHeaderTitle \}\}/)
  assert.match(pageSource, /useState<string>\('map-header-title'/)
  assert.match(pageSource, /mapHeaderTitle\.value = poi\?\.name \?\? area\?\.name \?\? ''/)
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
