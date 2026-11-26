import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

// T-034：叮叮车面板让开合成块、站列真能滚、从搜索条长出、跟车有出口。
// 四条契约各一段：D1 dock 让位 / D2 站列滚动 / D3 bloom 不再早退 / D4 停跟链路。
const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const componentSource = readFileSync(resolve('app/components/MapBusRoutePanel.vue'), 'utf8')
const transitSource = readFileSync(resolve('app/composables/useMapTransit.ts'), 'utf8')

const bloomAt = pageSource.indexOf('// 只有「折叠 → 非折叠」的离散切换才 bloom')
const bloomWatcher = pageSource.slice(bloomAt, bloomAt + 900)

test('D1 独立浮卡让开底栏：根节点暴露 data-detached-dock，层外按底栏高度抬 bottom', () => {
  assert.match(pageSource, /:data-detached-dock="mapSheetView === 'bus' \|\| mapSheetView === 'activity' \? 'on' : 'off'"/)
  assert.match(pageSource, /\.map-workspace\[data-detached-dock='on'\] > aside\.map-glass-sheet \{\s*bottom: calc\(var\(--mobile-nav-height, 3\.25rem\) \+ 0\.5rem \+ var\(--mobile-dock-inset, 0\.625rem\) \+ var\(--map-float-gap, 0\.625rem\)/)
  assert.match(pageSource, /\.map-workspace\[data-detached-dock='on'\] > aside\.map-glass-sheet \{[\s\S]{0,320}?border-radius: 26px;/, '浮卡四周自己收圆角，不跟底栏拼成一块')
  // 过渡只在稳态生效：bloom 首帧与收起三相位必须保持瞬时
  assert.match(pageSource, /\.map-workspace\[data-sheet-bloom='off'\]\[data-sheet-collapse='off'\] > aside\.map-glass-sheet \{\s*transition:/)
  assert.match(pageSource, /bottom 220ms var\(--ease-sheet\)/)
  assert.equal((pageSource.match(/:data-detached-dock=/g) ?? []).length, 1, '只暴露一处，别在别的分支重复绑定')
})

test('D2 站列真能滚：overflow-y-auto + 隐藏滚动条 + 只在真溢出时给 12px 渐隐', () => {
  assert.match(componentSource, /class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 scrollbar-none"/)
  assert.match(componentSource, /class="relative -ml-2 grid min-h-full auto-rows-\[minmax\(32px,1fr\)\] pl-2 \[contain:layout\]"/)
  assert.match(componentSource, /:data-bus-stops-overflow="stopsOverflowing \? 'on' : 'off'"/)
  assert.match(componentSource, /el\.scrollHeight > el\.clientHeight \+ 1/)
  assert.match(componentSource, /new ResizeObserver\(\(\) => measureStopsOverflow\(\)\)/)
  assert.match(componentSource, /calc\(100% - 12px\), transparent/)
  assert.doesNotMatch(componentSource, /calc\(100% - 24px\)/, '写死的 24px 渐隐已换成按需 12px')
  assert.doesNotMatch(componentSource, /min-h-0 flex-1 overflow-hidden px-3/, '站列不能再是 overflow-hidden')
})

test('D3 叮叮车也 bloom：离散切换统一从搜索条长出，bloom 段内不再早退', () => {
  assert.notEqual(bloomAt, -1, 'bloom watcher 必须存在')
  assert.match(bloomWatcher, /if \(previous !== 'collapsed' \|\| state === 'collapsed'\) return/)
  assert.match(bloomWatcher, /if \(Date\.now\(\) - sheetDragEndedAt < 240\) return/)
  assert.match(bloomWatcher, /bloomSheetFromDock\(\)/)
  assert.doesNotMatch(bloomWatcher, /mapSheetView\.value === 'bus'/, 'bus 视图不得再跳过 bloom')
  // 收起方向那条早退保留（收起动画不走 bloom）
  assert.equal((pageSource.match(/if \(mapSheetView\.value === 'bus'\) return\s*\n/g) ?? []).length, 1)
})

test('D4 跟车必须能停：关卡片 / 停止跟随 / 面板抬起 / canFollowVehicle 四道口子', () => {
  // ① 关浮窗顺带停跟（后置读取器，避开 setup 早期的 TDZ）
  assert.match(pageSource, /let vehicleFollowStopper: \(\(\) => void\) \| null = null/)
  assert.match(pageSource, /if \(closed\?\.kind === 'bus' \|\| closed\?\.kind === 'transit-vehicle'\) vehicleFollowStopper\?\.\(\)/)
  assert.match(pageSource, /vehicleFollowStopper = closeVehicleDetails/)
  assert.match(pageSource, /closeVehicleDetails\s*\n\} = useMapTransit\(/)
  // ② 车辆卡有「停止跟随」：校车卡 + 两处实时公交卡
  assert.equal((pageSource.match(/\{ key: 'follow-stop', label: '停止跟随', variant: 'ghost' \}/g) ?? []).length, 3)
  assert.match(pageSource, /if \(key === 'follow-stop'\) \{/)
  // ③ 面板一抬起来就收卡，收卡即停跟
  assert.match(pageSource, /watch\(mobileSheetState, \(state\) => \{\s*if \(state !== 'collapsed'\) closePinPopover\(\)/)
  // ④ composable 可注入护栏，两处 flyToPoint 之前都要问一句
  assert.match(transitSource, /canFollowVehicle\?: \(\) => boolean/)
  assert.match(transitSource, /const canFollowVehicle = options\.canFollowVehicle \?\? \(\(\) => true\)/)
  assert.equal((transitSource.match(/if \(!canFollowVehicle\(\)\) return/g) ?? []).length, 2)
})

test('D4 桌面端点面板里的车仍要跟：闸门不能把桌面一起掐死', () => {
  // 桌面分支先 focus 再从桌面 return，镜头完全靠 5s/20s 的 flyToPoint 带过去；
  // 闸门若只认「手机折叠态」，桌面点了车等于没反应。
  assert.match(pageSource, /canFollowVehicle: \(\) => panelIsDesktop\.value \|\| mobileSheetState\.value === 'collapsed'/)
  assert.doesNotMatch(pageSource, /canFollowVehicle: \(\) => mobileSheetState\.value === 'collapsed' && !panelIsDesktop\.value/)
})
