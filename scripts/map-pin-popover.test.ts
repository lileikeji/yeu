import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const popoverSource = readFileSync(resolve('app/components/map/MapPinPopover.vue'), 'utf8')
const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const providerSource = readFileSync(resolve('map/providers/maplibre/provider.ts'), 'utf8')
const amapSource = readFileSync(resolve('map/providers/amap/provider.ts'), 'utf8')
const coreSource = readFileSync(resolve('map/core/provider.ts'), 'utf8')

test('pin card phone rows stay inside the card and dial through tel:', () => {
  assert.match(popoverSource, /href\?: string/)
  assert.match(popoverSource, /:href="row\.href"/)
  assert.match(popoverSource, /pin-popover__row--link/)
  // 电话来自完整地点（原生搜索结果没有 catalog 行），不靠 poiId 再查一次 catalog。
  assert.match(pageSource, /pinPhoneRows\(place\?\.phone\)/)
  assert.match(pageSource, /function pinPhoneRows\(phone\?: string \| null\)/)
  assert.match(pageSource, /parsePublicPhoneContacts/)
})

test('pin popover uses native popover with css anchor positioning', () => {
  assert.match(popoverSource, /popover="auto"/)
  assert.match(popoverSource, /role="dialog"/)
  assert.match(popoverSource, /anchor-name: --pin-anchor/)
  assert.match(popoverSource, /position-anchor: --pin-anchor/)
  assert.match(popoverSource, /position-area: block-start/)
  assert.match(popoverSource, /position-try-fallbacks: flip-block, shift-inline/)
  assert.match(popoverSource, /container-type: anchored/)
  // 箭头换向不靠 @container anchored()：lightningcss 1.33 解析不了这条，
  // 会让 nuxt build 直接失败（CI「Verify code and production build」红过），改由脚本写 data-flipped。
  assert.match(popoverSource, /toggleAttribute\('data-flipped'/)
  assert.match(popoverSource, /\.pin-popover\[data-flipped\] \.pin-popover__arrow/)
  assert.doesNotMatch(popoverSource, /@container anchored\(/)
  // 浮窗不抢焦点：不做 aria-expanded 的触发器语义。
  assert.doesNotMatch(popoverSource, /aria-expanded/)
})

test('map page mounts one pin popover and drops the fixed vehicle card', () => {
  assert.equal((pageSource.match(/<MapPinPopover\b/g) || []).length, 1)
  assert.doesNotMatch(pageSource, /车辆详情：点车后镜头跟住它/)
  assert.equal((pageSource.match(/<MapPlaceDetailsPanel\b/g) || []).length, 1)
  assert.match(pageSource, /onFeatureSelect\?\.\(/)
  assert.match(pageSource, /onViewportChange\?\.\(/)
  assert.match(pageSource, /projectToScreen\?\.\(/)
})

test('provider exposes canvas feature selection for the five painted layers', () => {
  assert.match(coreSource, /onFeatureSelect\?\(/)
  assert.match(coreSource, /onViewportChange\?\(/)
  assert.match(providerSource, /BUS_STOP_DOTS_LAYER_ID/)
  assert.match(providerSource, /BUS_TERMINALS_LAYER_ID/)
  assert.match(providerSource, /BUSES_ICON_LAYER_ID/)
  assert.match(providerSource, /TRANSIT_TERMINALS_LAYER_ID/)
  assert.match(providerSource, /TRANSIT_VEHICLES_LAYER_ID/)
  assert.match(providerSource, /selectionFromFeature/)
})

test('pin card covers all seven tappable entity kinds', () => {
  for (const kind of ['poi', 'cluster', 'bus', 'bus-stop', 'bus-terminal', 'transit-terminal', 'transit-vehicle']) {
    assert.ok(pageSource.includes(`selection.kind === '${kind}'`), `missing branch for ${kind}`)
  }
  assert.match(pageSource, /kind === 'bus-stop' \|\| selection\.kind === 'bus-terminal'/)
})

test('pin card is a 248-272 wide anchored card', () => {
  assert.match(popoverSource, /width: 262/)
  assert.match(popoverSource, /max-width: calc\(100vw - 24px\)/)
  assert.match(popoverSource, /position-try-fallbacks: flip-block;\s*position-try-fallbacks: flip-block, flip-inline;/)
})

test('escape closes the pin card before the sheet and hands focus back to the map', () => {
  const keydownStart = pageSource.indexOf('function handleSheetKeydown')
  const keydownEnd = pageSource.indexOf('function handlePopState', keydownStart)
  const block = pageSource.slice(keydownStart, keydownEnd === -1 ? undefined : keydownEnd)
  assert.ok(block.includes('if (pinSelection.value)'), 'escape must check for an open pin card')
  assert.ok(block.indexOf('dismissPinPopover()') > -1)
  assert.ok(block.indexOf('dismissPinPopover()') < block.indexOf('handleSheetBack()'), 'pin close runs before sheet back')
  assert.match(pageSource, /mapElement\.value\?\.focus\(\{ preventScroll: true \}\)/)
})

test('pin card stays on the mobile branch and keeps the moments block', () => {
  assert.ok((pageSource.match(/if \(panelIsDesktop\.value\) \{/g) || []).length >= 2)
  assert.match(pageSource, /watch\(\(\) => panelIsDesktop\.value/)
  assert.equal((pageSource.match(/<MapBusMomentsSection/g) || []).length, 1)
  assert.match(pageSource, /mobileSheetState\.value = 'collapsed'\s*void nextTick/)
  // 卡片被 Esc 关掉后，同一条列表行再点一次也要把卡弹回来（selectedPoiId 没变不能直接跳过）。
  assert.match(pageSource, /if \(selectedPoiId\.value === poi\.id\) \{/)
})
test('pin arrow follows the anchor column after shift fallback', () => {
  assert.match(popoverSource, /const ARROW_INSET = 18/)
  assert.match(popoverSource, /const offset = anchor\.x - \(baseLeft \+ appliedShift\)/)
  assert.match(popoverSource, /const limit = Math\.max\(0, rect\.width \/ 2 - 8\)/)
  assert.match(popoverSource, /el\.style\.setProperty\('--pin-arrow-x', Math\.round\(clamped\) \+ 'px'\)/)
  assert.match(popoverSource, /inset-inline-start: var\(--pin-arrow-x, 50%\)/)
  assert.ok(
    (popoverSource.match(/requestAnimationFrame\(alignArrow\)/g) || []).length >= 1,
    'arrow realigns on the frame after the popover opens'
  )
  assert.match(popoverSource, /addEventListener\('resize', onViewportResize/)
  assert.match(popoverSource, /const VIEWPORT_INSET = 0/)
  // getBoundingClientRect() 含 translate：修正量必须扣掉已写入的位移再算，否则第二帧会把卡片放回屏外。
  assert.match(popoverSource, /const baseLeft = rect\.left - appliedShift/)
  assert.match(popoverSource, /const overflowRight = baseRight - \(window\.innerWidth - VIEWPORT_INSET\)/)
  assert.match(popoverSource, /if \(shift !== appliedShift\) \{/)
  assert.match(popoverSource, /el\.style\.translate = shift \+ 'px 0'/)
  assert.match(popoverSource, /el\.style\.transitionProperty = 'opacity'/)
})

test('pin projection normalizes GCJ-02 before projecting onto the WGS84 basemap', () => {
  assert.match(pageSource, /import { gcj02ToWgs84 } from '~~\/shared\/utils\/coordinate-convert'/)
  assert.match(pageSource, /function pinProjectionPoint\(point: GeoPoint\): GeoPoint/)
  assert.match(pageSource, /if \(point\.crs !== 'GCJ-02'\) return point/)
  assert.match(pageSource, /function pinSelectionPoint\(selection: PinSelection\): GeoPoint \| undefined/)
  assert.match(pageSource, /projectToScreen\?\.\(pinProjectionPoint\(point\)\)/)
})

test('mobile row selection retries the projection while the map is still resizing', () => {
  assert.match(pageSource, /for \(const delay of \[120, 300, 700, 1200\]\)/)
  assert.match(pageSource, /if \(pinDetached\.value\) refreshPinAnchor\(\)/)
  // 只补投影、不重放选中：几百毫秒内换了地点，旧回调不能把新选择顶掉。
  assert.match(pageSource, /if \(pinSelection\.value\?\.kind !== 'poi' \|\| pinSelection\.value\.id !== poi\.id\) return/)
})

test('pin subtitle does not claim a missing map position when the card is anchored to a pin', () => {
  assert.match(pageSource, /point \? '' : poiStatusText\(detail\)/)
})
test('pin card scrolls its own body and hides the scrollbar until it overflows', () => {
  assert.match(popoverSource, /overflow-y: auto;/)
  assert.match(popoverSource, /overscroll-behavior: contain;/)
  assert.match(popoverSource, /scrollbar-width: none;/)
  assert.match(popoverSource, /\.pin-popover__body::-webkit-scrollbar \{/)
  // D2：只有内容真的超出才加渐隐，短卡不受影响。
  assert.match(popoverSource, /\.pin-popover\[data-overflow='true'\] \.pin-popover__body \{/)
  assert.match(popoverSource, /:data-overflow="overflow \? 'true' : 'false'"/)
  // D2：上限按视口算，不写死高度也不给 min-height，短内容卡自然收缩。
  assert.match(popoverSource, /max-height: min\(60dvh, calc\(100dvh - var\(--pin-card-safe, 180px\)\)\);/)
  assert.doesNotMatch(popoverSource, /\.pin-popover__body \{[^}]*min-height:/)
})

test('pin card joins the glass refraction layer instead of a css blur', () => {
  assert.match(popoverSource, /defineExpose\(\{ rootElement: popEl \}\)/)
  assert.match(popoverSource, /:class="glass \? 'map-glass-refracting' : 'map-glass-surface'"/)
  assert.match(popoverSource, /--pin-glass-tint: var\(--surface\);/)
  assert.match(popoverSource, /\.pin-popover\.map-glass-refracting \{/)
  assert.match(popoverSource, /background: color-mix\(in srgb, var\(--pin-glass-tint\) 66%, transparent\);/)
  assert.match(popoverSource, /--pin-glass-tint: var\(--color-zinc-900, #1c1c1f\);/)
  assert.match(pageSource, /ref="pinPopoverElement"/)
  assert.match(pageSource, /:glass="mapGlassActive"/)
  const register = pageSource.match(/push\(pinPopoverElement\.value\?\.rootElement \?\? null, [^)]+\)/)
  assert.ok(register, 'pin popover is registered as a glass target')
  assert.match(register[0], /0\.055/)
  assert.match(register[0], /'all'/)
})

test('amap provider emits feature selections like maplibre does', () => {
  // 生产地图走高德：只有 onBusSelect（桌面侧栏）时手机浮窗永远打不开。
  assert.match(amapSource, /onFeatureSelect\(handler: FeatureSelectHandler\)/)
  assert.match(amapSource, /private featureSelectHandler: FeatureSelectHandler \| null = null/)
  assert.match(amapSource, /this\.featureSelectHandler\?\.\(\{ kind: 'bus'/)
  assert.match(amapSource, /kind: 'transit-vehicle'/)
  assert.match(amapSource, /private emitStopSelection\(/)
  assert.match(amapSource, /this\.emitStopSelection\('bus-stop', stop\)/)
  assert.match(amapSource, /createBusTerminalChip\(stop, color, 'bus-terminal'\)/)
  assert.match(amapSource, /createBusTerminalChip\(stop, color, 'transit-terminal'\)/)
})

test('cluster click dispatches a selection before expanding the camera', () => {
  const start = providerSource.indexOf('if (feature.layer.id === CLUSTER_LAYER_ID) {')
  assert.ok(start > -1, 'cluster branch exists')
  const branch = providerSource.slice(start, start + 400)
  const dispatch = branch.indexOf('featureSelectHandler?.(clusterSelection)')
  const expand = branch.indexOf('expandCluster(feature)')
  assert.ok(dispatch > -1, 'cluster branch sends a selection')
  assert.ok(expand > dispatch, 'selection is dispatched before the camera move')
})

test('vehicle anchor follows live positions instead of the click-time point', () => {
  assert.match(pageSource, /let pinLivePointReader: \(\(selection: PinSelection\) => GeoPoint \| undefined\) \| null = null/)
  assert.match(pageSource, /pinLivePointReader = \(selection\) => \{/)
  assert.match(pageSource, /const bus = busVehicles\.value\.find\(item => item\.busId === selection\.id\)/)
  assert.match(pageSource, /crs: 'GCJ-02'/)
  assert.match(pageSource, /return pinLivePointReader\?\.\(selection\) \?\? selection\.point/)
})

test('native search results keep their own card and details target', () => {
  assert.match(pageSource, /function resolvePinPlace\(selection: PinSelection\)/)
  assert.match(pageSource, /nativeSearchResults\.value\.find\(item => item\.id === selection\.id\)/)
  assert.match(pageSource, /const \{ poi, place \} = resolvePinPlace\(selection\)/)
  assert.match(pageSource, /const target = place \? placeDetailsTarget\(place\) : undefined/)
})

test('eta numbers stay readable on the dark glass card', () => {
  assert.match(popoverSource, /:global\(\.dark \.pin-popover__etavalue\) \{\s*color: var\(--color-zinc-50, #fafafa\);\s*\}/)
})

test('route sync ignores the popstate from its own sheet history layer', () => {
  const routeStateSource = readFileSync(resolve('app/utils/map-route-state.ts'), 'utf8')
  const routeSyncSource = readFileSync(resolve('app/composables/useMapRouteSync.ts'), 'utf8')
  // 面板收起会撤掉自己压的那层历史；那次回退只把 URL 退回压层前的样子，不能拿来回灌状态
  assert.match(routeStateSource, /export function mapRouteQueryEqual\(/)
  assert.match(routeSyncSource, /consumeSelfNavigation\?: \(\) => boolean/)
  assert.match(routeSyncSource, /if \(options\.consumeSelfNavigation\?\.\(\)\) return/)
  assert.match(pageSource, /ignoreRouteApplyAfterDrop = true/)
  assert.match(pageSource, /consumeSelfNavigation: \(\) => \{/)
  // 必须先认领自撤层，再动待写的定时器：本地改动不能被这次假导航取消
  const consumeIndex = routeSyncSource.indexOf('if (options.consumeSelfNavigation?.()) return')
  assert.ok(consumeIndex >= 0, 'route watch must claim its own layer drop first')
  assert.ok(
    routeSyncSource.indexOf('clearTimeout(routeSyncTimer)', consumeIndex) > consumeIndex,
    'consumeSelfNavigation must be checked before the pending write timer is cleared'
  )
  // 自己刚写进去的 URL 回灌也不再覆盖本地状态
  assert.match(routeSyncSource, /if \(route\.fullPath === lastWrittenFullPath\) \{/)
})
