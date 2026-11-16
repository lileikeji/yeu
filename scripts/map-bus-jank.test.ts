import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pageSource = await readFile(new URL('../app/pages/map/index.vue', import.meta.url), 'utf8')
const componentSource = await readFile(new URL('../app/components/MapBusRoutePanel.vue', import.meta.url), 'utf8')
const etaSource = await readFile(new URL('../app/composables/useMapBusEta.ts', import.meta.url), 'utf8')
const pillSource = await readFile(new URL('../app/components/MapBusEtaPill.vue', import.meta.url), 'utf8')
const countOf = (source: string, fragment: string): number => source.split(fragment).length - 1

test('T-031 B1：叮叮车折叠条允许起拖，其余视图折叠仍拒绝', () => {
  // 折叠态不再一刀切 return，否则 84px 常驻条拖不动（F-11 卡死）
  assert.doesNotMatch(pageSource, /if \(!event\.isPrimary \|\| mobileSheetState\.value === 'collapsed' \|\| mobileSheetDragging\.value\) return/, '折叠态一律拒拖的旧守卫必须去掉')
  assert.match(pageSource, /if \(!event\.isPrimary \|\| mobileSheetDragging\.value\) return/, '主指针与拖拽中守卫保留')
  assert.match(pageSource, /if \(mobileSheetState\.value === 'collapsed' && mapSheetView\.value !== 'bus'\) return/, '只有叮叮车视图在折叠态允许起拖')
  // 起拖后必须能落回半屏：锚点仍走 bus 分支
  assert.match(pageSource, /if \(mapSheetView\.value === 'bus'\) return resolveBusSheetAnchors\(anchors\)/, '叮叮车锚点分支保留')
  // 折叠条单击抬手势保留
  assert.match(componentSource, /emit\('sheet-raise'\)/, '折叠条点击仍走 sheet-raise')
  // 84px 常驻条本身必须能起拖：data-sheet-drag-handle + sheet-drag-start，否则折叠态没有任何手势入口
  const barAt = componentSource.indexOf('data-bus-collapsed-bar')
  assert.ok(barAt >= 0, '折叠条标记丢失')
  const barWindow = componentSource.slice(barAt - 120, barAt + 420)
  assert.match(barWindow, /data-sheet-drag-handle/, '折叠条要挂 data-sheet-drag-handle 才能绕过 button 拒拖')
  assert.match(barWindow, /@pointerdown="emit\('sheet-drag-start', \$event\)"/, '折叠条按下即交给面板拖拽')
  // 轻点折叠条 = 抬到半屏：pointer capture 会吃掉后续 click，必须自己判「没移动」
  assert.match(pageSource, /const mobileSheetDragMoved = ref\(false\)/, '记录本次按下是否真的移动过')
  assert.match(pageSource, /Math\.abs\(event\.clientY - mobileSheetDragStartY\.value\) > 6/, '位移超过 6px 才算拖动')
  assert.match(pageSource, /const tappedCollapsedBar = !mobileSheetDragMoved\.value && mobileSheetDragStartHeight\.value <= 120/, '折叠条轻点判定')
  assert.match(pageSource, /\? 'half'\s*\n\s*: resolveMobileSheetStateFromHeight/, '轻点落半屏，拖动按锚点吸附')
})

test('T-031 B2：当前站圆点与导轨同心，左缘不再被裁', () => {
  assert.match(componentSource, /class="pointer-events-none absolute left-\[12px\] z-20 -translate-x-1\/2 -translate-y-1\/2"/, '当前站容器以导轨中心为锚点，水平垂直双向居中')
  // 回归（2026-11-16 m12430 截图）：站列 mask 会把绘制裁到自身 border box，
  // 14px 圆点中心在 16px 时会左溢 3px 被平切。用 -ml-2 + pl-2 把 mask 盒子向左扩 8px。
  assert.match(componentSource, /class="relative -ml-2 grid h-full auto-rows-\[minmax\(32px,1fr\)\] pl-2 \[contain:layout\]"/, 'mask 盒子要向左扩 8px，圆点不得被 mask 裁切')
  assert.doesNotMatch(componentSource, /class="pointer-events-none absolute left-0 z-20 -translate-y-1\/2"/, '旧 left-0 半切实现必须消失')
  assert.match(componentSource, /class="absolute bottom-3 left-\[12px\] top-3 w-px bg-\[var\(--bus-accent-line\)\]"/, '导轨锚在 12px，与圆点同轴且不整体右移')
})

test('T-031 B3：过渡期摘掉站列 mask，站列容器自带 containment', () => {
  // 高度过渡 320ms 里面板面积每帧都在变，底部渐隐 mask 会逼着整块面板重建合成层。
  assert.match(pageSource, /:data-sheet-transition="sheetTransitioning \? 'on' : 'off'"/, '面板根节点要暴露过渡态')
  assert.match(pageSource, /map-workspace\[data-sheet-transition='on'\] \[data-bus-stops-fade\][\s\S]{0,200}mask-image: none !important/, '过渡期必须摘掉站列 mask，且要 !important 才压得过组件内联 style')
  assert.match(componentSource, /data-bus-collapsed-bar[\s\S]{0,240}touch-none/, '折叠条要声明 touch-action: none，否则竖向拖动会被原生滚动抢走')
  assert.match(componentSource, /auto-rows-\[minmax\(32px,1fr\)\] pl-2 \[contain:layout\]/, '站列容器要带 layout containment')
  // 回归（2026-11-16 用户截图）：paint containment 把内容裁到 padding box，车辆圆点
  // 中心在 left-[4px]（相对内层 12px 起 → 绝对 16px），14px 宽就会左溢 3px 被平切。
  assert.doesNotMatch(componentSource, /\[contain:layout_paint\]/, '站列容器不能用 paint containment，会裁掉出血的车辆圆点')
  assert.match(componentSource, /mask-image: linear-gradient\(to bottom, black calc\(100% - 24px\), transparent\)/, '非过渡期渐隐仍在')
  assert.equal(countOf(pageSource, 'sheetTransitioning.value = true'), 1, '起过渡要置位')
  assert.equal(countOf(pageSource, 'sheetTransitioning.value = false'), 1, '结束过渡要复位')
  assert.match(pageSource, /const sheetInteractionActive = computed\(\(\) => mobileSheetDragging\.value \|\| sheetTransitioning\.value\)/, '拖动与过渡共用同一个冻结开关')
  assert.match(pageSource, /frozen: sheetInteractionActive/, 'ETA 在拖动 / 过渡期冻结')
  assert.match(etaSource, /const geometryCache = new WeakMap/, '线路几何按线路缓存，不再每 150ms 重分配')
})

test('T-031 B4：胶囊逐帧定位器接管位移，跟手不靠 150ms tick', () => {
  // eslint 的 attributes-order 会把 ref 排到 data-* 前面，这里按窗口判定，不锁属性顺序。
  const layerAt = pageSource.indexOf('data-bus-eta-layer')
  assert.ok(layerAt >= 0, '页面上找不到胶囊层')
  const layerWindow = pageSource.slice(Math.max(0, layerAt - 300), layerAt + 300)
  assert.match(layerWindow, /ref="busEtaLayerElement"/, '胶囊层要能被定位器直接拿到')
  assert.match(layerWindow, /z-\[19\]/, '胶囊层仍是折叠态浮层')
  assert.match(pageSource, /:pill-id="pill\.id"/, '父层把 busId 透给胶囊节点')
  assert.match(pillSource, /:data-bus-eta-id="pillId"/, '胶囊节点带 data-bus-eta-id，定位器按 id 找节点')
  assert.match(etaSource, /export function useMapBusEtaPositioner/, '定位器是 composable 导出')
  assert.match(etaSource, /node\.style\.transform !== next/, '只在投影确实变化时写 style')
  assert.match(etaSource, /globalThis\.requestAnimationFrame\(tick\)/, '位移循环跑在 rAF 上')
  assert.match(etaSource, /typeof globalThis\.requestAnimationFrame !== 'function'\) return/, 'SSR / Node 无 rAF 时直接跳过')
  assert.match(pageSource, /watch\(busEtaLayerVisible, \(visible\) => \{/, '只在折叠层可见时跑定位器')
  assert.match(pageSource, /busEtaPositioner\.start\(\)/, '可见时启动')
  assert.match(pageSource, /busEtaPositioner\.stop\(\)/, '不可见 / 卸载时停掉')
  // 定位器接管后模板必须停止绑 :style，否则重渲染会用冻结快照覆盖逐帧写入（实测 dx 51.4px）。
  assert.match(pageSource, /:style="busEtaPositionerActive \? undefined : \{ transform: pill\.transform \}"/, '定位器接管时模板不再绑 transform')
  assert.match(pageSource, /busEtaPositionerActive\.value = true/, '进入折叠态先标记接管再首帧同步')
})
