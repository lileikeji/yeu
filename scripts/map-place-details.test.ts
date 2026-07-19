import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const detailsSource = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')
const e2eFixtureSource = readFileSync(resolve('scripts/prepare-e2e-database.ts'), 'utf8')

test('map place details use one floating panel for mobile and desktop', () => {
  // Intentional UX: selecting a POI collapses the mobile list sheet and shows a single
  // floating card (desktop variant styles also cover mobile bottom overlay).
  assert.equal(pageSource.match(/<MapPlaceDetailsPanel\b/g)?.length, 1)
  assert.match(pageSource, /variant="desktop"/)
  assert.doesNotMatch(pageSource, /variant="mobile"/)
  assert.match(pageSource, /@copy="copyPoiLocation\(selectedPoi\)"/)
  assert.match(pageSource, /@plan-route="startWalkingRoute\(selectedPoi\.name, selectedPoi\.point\)"/)
  assert.match(pageSource, /On mobile, free the bottom list sheet so the floating place card can show over the map/)
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
  // Desktop variant is the floating card used on both breakpoints.
  assert.match(detailsSource, /absolute bottom-\[calc\(var\(--mobile-nav-height\)\+0\.75rem\)\]/)
  assert.doesNotMatch(detailsSource, /useRoute|useRouter|createRuntimeMapProvider/)
  assert.match(e2eFixtureSource, /【到这里前先确认】\\n- 核对地点名称和入口标识。/)
})
