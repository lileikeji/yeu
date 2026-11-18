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
  // popover 属性改成按能力挂：Chrome 114 之前没有 showPopover，`popover="auto"` 也不会隐藏。
  // T-035：popover 用 manual，不用 auto —— auto 会在 pointerdown 自行 light dismiss，
  // 下一帧 syncOpen() 又把它开回来，@starting-style 重播成「闪一下」。
  assert.match(popoverSource, /:popover="supportsPopover \? 'manual' : undefined"/)
  assert.doesNotMatch(popoverSource, /:popover="supportsPopover \? 'auto'/)
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
  // 打开后连算两帧：第一帧等浏览器把卡片排好，第二帧才拿到最终尺寸（降级路径尤其需要）。
  assert.ok(
    (popoverSource.match(/requestAnimationFrame\(layout\)/g) || []).length >= 1,
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

test('pin popover degrades to fixed positioning when anchor positioning is missing', () => {
  // 两条能力检测：锚定定位（Chrome 125 / Safari 26 起）与原生 popover（Chrome 114 / Safari 17 起）。
  assert.match(popoverSource, /CSS\.supports\('position-anchor: --pin-anchor'\)/)
  assert.match(popoverSource, /typeof HTMLElement\.prototype\.showPopover === 'function'/)
  assert.match(popoverSource, /const supportsAnchor = ref\(true\)/)
  assert.match(popoverSource, /const supportsPopover = ref\(true\)/)
  // 降级路径：自己按 pinAnchor 与卡片实测尺寸算位置，只在缺锚定时接管。
  assert.match(popoverSource, /function placeFallback\(\): void \{/)
  assert.match(popoverSource, /function layout\(\): void \{\s*if \(!supportsAnchor\.value\) \{\s*placeFallback\(\)/)
  assert.match(popoverSource, /el\.style\.left = left \+ 'px'/)
  assert.match(popoverSource, /el\.toggleAttribute\('data-flipped', flipped\)/)
  assert.match(popoverSource, /:data-placement="supportsAnchor \? 'anchor' : 'fallback'"/)
  assert.match(popoverSource, /\.pin-popover\[data-placement='fallback'\] \{/)
  assert.match(popoverSource, /inset: auto/)
  // 没有原生 popover 时显隐交给 hidden 绑定，别让卡片常驻在页面角落。
  assert.match(popoverSource, /:hidden="!supportsPopover && !open"/)
  assert.match(popoverSource, /function isShown\(\): boolean \{/)
  assert.match(popoverSource, /if \(supportsPopover\.value\) \{\s*const visible = el\.matches\(':popover-open'\)/)
})

test('bus and stop chips on the amap canvas ignore drag gestures', () => {
  // 车标、在途车胶囊、首末站徽标、站点圆点都盖在 canvas 上：
  // 拖动地图经过它们时只认 tap，判定与 POI 图钉同一套，避免误开详情卡。
  assert.equal((amapSource.match(/attachTapGesture\(element, select/g) || []).length, 4)
  assert.match(amapSource, /attachTapGesture\(element, selectBus\)/)
  assert.match(amapSource, /attachTapGesture\(element, selectVehicle\)/)
  assert.match(amapSource, /attachTapGesture\(element, selectTerminal\)/)
  assert.match(amapSource, /attachTapGesture\(element, selectStopDot\)/)
})

test('T-035：浮窗拖动不重播入场、玻璃圆角按真实像素同心', () => {
  const glassSource = readFileSync(resolve('app/composables/useMapGlassRefraction.ts'), 'utf8')

  // F1 拖动闪：manual popover + 只在 false→true 时 showPopover，入场只播一次。
  assert.match(popoverSource, /const isOpening = wantOpen && !wantOpenLast/)
  assert.match(popoverSource, /if \(isOpening && !visible\) \{/)
  // 首次打开后挂 data-entered，@starting-style 只对没挂的生效。
  assert.match(popoverSource, /:data-entered="entered \? 'true' : undefined"/)
  assert.match(popoverSource, /\.pin-popover:popover-open:not\(\[data-entered\]\) \{/)
  // light dismiss 自己实现：捕获阶段 + 排除卡片内部与锚点宿主。
  assert.match(popoverSource, /document\.addEventListener\('pointerdown', onDocumentPointerDown, true\)/)
  assert.match(popoverSource, /target\.closest\(PIN_ANCHOR_HOST_SELECTOR\)/)
  // 点空白要等 pointerup 才判定：按下即关会把「拖地图」变成一闭一开，正是要修的闪。
  assert.match(popoverSource, /document\.addEventListener\('pointerup', onDocumentPointerUp, true\)/)
  assert.match(popoverSource, /LIGHT_DISMISS_DRAG_SLOP = 6/)

  // F2 圆角：真实像素进 GlassTarget，按短边换算成 shader 的比例。
  assert.match(glassSource, /radiusPx\?: number/)
  assert.match(glassSource, /target\.radiusPx \/ Math\.min\(rect\.width, rect\.height\)/)
  assert.match(pageSource, /'all', 14\)/)
  // 折射态不留 DOM 边框：shader 的 rim 已画边缘，1px 边框会成双线。
  assert.match(popoverSource, /border-color: transparent;/)
  // rim 只画在内侧：圆角外侧的残余白线就是白月牙（CR-6 起色值与 alpha 共用这份掩码）。
  assert.match(glassSource, /col \+= vec3\(1\.0\) \* rimMasked \* 0\.35;/)
  // 关闭按钮与 14px 圆角共心：6px 内缩、24px 命中区。
  assert.match(popoverSource, /\.pin-popover__close \{[^}]*inset-block-start: 6px;/)
  assert.match(popoverSource, /\.pin-popover__close \{[^}]*inset-inline-end: 6px;/)
  assert.match(popoverSource, /\.pin-popover__close \{[^}]*width: 24px;/)
  assert.match(popoverSource, /\.pin-popover__close \{[^}]*height: 24px;/)
})

test('T-037：light dismiss 只在真点空白时关，玻璃 rim 内外一致', () => {
  const glassSource = readFileSync(resolve('app/composables/useMapGlassRefraction.ts'), 'utf8')
  const presSource = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')
  // CR-1：新按压不接管旧手势；系统取消手势（来电、系统缩放）也要解除武装。
  assert.match(popoverSource, /if \(dismissPointerId !== null\) \{\s*resetDismissGesture\(\)\s*return\s*\}/)
  assert.match(popoverSource, /function resetDismissGesture\(\): void \{/)
  assert.match(popoverSource, /document\.addEventListener\('pointercancel', onDocumentPointerCancel, true\)/)
  assert.match(popoverSource, /document\.removeEventListener\('pointercancel', onDocumentPointerCancel, true\)/)
  // CR-2：越过阈值即锁定为拖拽，拖回起点松手也不关。
  assert.match(popoverSource, /let dismissDragged = false/)
  assert.match(popoverSource, /document\.addEventListener\('pointermove', onDocumentPointerMove, true\)/)
  assert.match(popoverSource, /if \(moved > LIGHT_DISMISS_DRAG_SLOP\) dismissDragged = true/)
  assert.match(popoverSource, /if \(!props\.open \|\| dragged\) return/)
  // CR-3：落点命中元素判内外，冲掉隐式指针捕获钉住的旧 target。
  assert.match(popoverSource, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/)
  // CR-4 / CR-5：点位二击吞掉、焦点归还前重判输入框。
  assert.match(presSource, /export const PIN_DISMISS_TOGGLE_MS = 400/)
  assert.match(pageSource, /resolvePinReselect\(record, selection, Date\.now\(\)\)/)
  assert.match(pageSource, /if \(selection && swallowDismissedPinSelection\(selection\)\) return/)
  assert.match(pageSource, /activeNow instanceof HTMLInputElement/)
  assert.match(pageSource, /activeNow\?\.isContentEditable/)
  // CR-6：rim 的色值与透明度共用同一份 inside 掩码。
  assert.match(glassSource, /float rimMasked = rim \* inside;/)
  assert.match(glassSource, /alpha \+= rimMasked \* 0\.25 \+ topLit \* 0\.12 \+ gloss \* 0\.06;/)
  // CR-7：radiusPx = 0 是合法圆角，不能当成缺省落到旧比例路径。
  assert.match(glassSource, /target\.radiusPx !== undefined && Number\.isFinite\(target\.radiusPx\)/)
})
