import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pageSource = await readFile(new URL('../app/pages/map/index.vue', import.meta.url), 'utf8')
const componentSource = await readFile(new URL('../app/components/MapBusRoutePanel.vue', import.meta.url), 'utf8')

test('T-031 B1：叮叮车折叠条允许起拖，其余视图折叠仍拒绝', () => {
  // 折叠态不再一刀切 return，否则 84px 常驻条拖不动（F-11 卡死）
  assert.doesNotMatch(pageSource, /if \(!event\.isPrimary \|\| mobileSheetState\.value === 'collapsed' \|\| mobileSheetDragging\.value\) return/, '折叠态一律拒拖的旧守卫必须去掉')
  assert.match(pageSource, /if \(!event\.isPrimary \|\| mobileSheetDragging\.value\) return/, '主指针与拖拽中守卫保留')
  assert.match(pageSource, /if \(mobileSheetState\.value === 'collapsed' && mapSheetView\.value !== 'bus'\) return/, '只有叮叮车视图在折叠态允许起拖')
  // 起拖后必须能落回半屏：锚点仍走 bus 分支
  assert.match(pageSource, /if \(mapSheetView\.value === 'bus'\) return resolveBusSheetAnchors\(anchors\)/, '叮叮车锚点分支保留')
  // 折叠条单击抬手势保留
  assert.match(componentSource, /emit\('sheet-raise'\)/, '折叠条点击仍走 sheet-raise')
})

test('T-031 B2：当前站圆点与导轨同心，左缘不再被裁', () => {
  assert.match(componentSource, /class="pointer-events-none absolute left-\[4px\] z-20 -translate-x-1\/2 -translate-y-1\/2"/, '当前站容器以导轨中心为锚点，水平垂直双向居中')
  assert.doesNotMatch(componentSource, /class="pointer-events-none absolute left-0 z-20 -translate-y-1\/2"/, '旧 left-0 半切实现必须消失')
  assert.match(componentSource, /class="absolute bottom-3 left-\[4px\] top-3 w-px bg-\[var\(--bus-accent-line\)\]"/, '导轨仍在 left-[4px]，不允许整体右移')
})
