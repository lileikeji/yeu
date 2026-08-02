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
  assert.equal((detailsSource.match(/class="min-h-11 w-full justify-center"/g) || []).length, 4)
  assert.equal((detailsSource.match(/class="min-h-11"/g) || []).length, 4)
  assert.match(pageSource, /aria-label="全隐藏地点面板"[\s\S]{0,120}?mobileSheetState === 'collapsed'/)
  assert.equal((pageSource.match(/class="size-11"\s+aria-label="(?:全隐藏|半屏显示|展开)地点面板"/g) || []).length, 3)
  assert.match(pageSource, /class="mt-3 min-h-11 w-full"\s+:ui="\{ base: 'min-h-11' \}"/)
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

test('desktop place list keeps mouse and wheel control after mobile sheet collapse', () => {
  assert.match(pageSource, /md:pointer-events-auto/)
  assert.match(
    pageSource,
    /mobileSheetState === 'collapsed'[\s\S]*?'hidden md:block' : 'block'/
  )
  assert.match(pageSource, /class="map-place-list min-h-0 flex-1 overflow-y-auto overscroll-y-contain md:block"/)
  assert.match(pageSource, /@wheel\.stop/)
  assert.match(pageSource, /@touchmove\.stop/)
  assert.match(pageSource, /'overflow-hidden'/)
  assert.match(pageSource, /mobileSheetState === 'collapsed'[\s\S]*?'hidden md:block' : 'block'/)
})
