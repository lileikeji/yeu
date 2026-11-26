/**
 * T-046 面板动效守门（移动端地图页）。
 *
 * guide: natural-interactions / animate-to-from-top-layer —— 弹层要从触发控件长出来，
 * transform-origin 对齐触发点，只用 transform/opacity，并且必须尊重 prefers-reduced-motion。
 * 每条断言都对应一处可能被改坏的点：曲线被换掉、origin 变量被删、按钮忘了传事件、浮窗退回居中。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const read = (path: string): string => readFileSync(resolve(path), 'utf8')

const css = read('app/assets/css/main.css')
const origin = read('app/utils/panel-origin.ts')
const mapPage = read('app/pages/map/index.vue')
const pinPopover = read('app/components/map/MapPinPopover.vue')

test('动效曲线用 Material 3 emphasized token，不写死 cubic-bezier', () => {
  assert.match(css, /--ease-panel-in: cubic-bezier\(0\.05, 0\.7, 0\.1, 1\);/)
  assert.match(css, /--ease-panel-out: cubic-bezier\(0\.3, 0, 0\.8, 0\.15\);/)
  assert.match(css, /--dur-panel-in: 280ms;/)
  assert.match(css, /--dur-panel-out: 180ms;/)
})

test('进出场只动 transform / opacity，origin 取 --pv-ox / --pv-oy', () => {
  assert.match(
    css,
    /\.pv-origin-enter-active,\s*\.pv-origin-leave-active \{[\s\S]{0,160}?transform-origin: var\(--pv-ox, 50%\) var\(--pv-oy, 100%\);[\s\S]{0,120}?will-change: transform, opacity;/
  )
  assert.match(css, /@keyframes pv-origin-in \{[\s\S]{0,120}?opacity: 0;[\s\S]{0,80}?scale: 0\.88;[\s\S]{0,120}?translate: var\(--pv-tx, 0px\) var\(--pv-ty, 0px\);/)
  assert.match(css, /@keyframes pv-origin-out \{[\s\S]{0,120}?opacity: 0;[\s\S]{0,80}?scale: 0\.92;/)
})

test('减弱动效下不做缩放位移：120ms 淡入淡出且 origin 归中', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,400}?\.pv-origin-enter-active \{ animation: pv-origin-fade-in 120ms linear both; \}/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,600}?transform-origin: 50% 50%;/)
})

test('origin 计算：按钮取不到时回落底边中点，元素尚未布局时下一帧补算', () => {
  assert.match(origin, /export function readTriggerPoint/)
  assert.match(origin, /export function markPanelOriginFromPoint/)
  assert.match(origin, /style\.setProperty\('--pv-ox'/)
  assert.match(origin, /style\.setProperty\('--pv-tx'/)
  // enter 钩子里实测拿到 0×0，必须补一帧，否则动效退回居中
  assert.match(origin, /if \(!panelRect\.width \|\| !panelRect\.height\) \{[\s\S]{0,240}?requestAnimationFrame\(/)
})

test('显示设置面板：两个齿轮都传事件，Transition 在 before-enter 写 origin', () => {
  const gearClicks = mapPage.match(/@click="toggleDisplaySettings\(\$event\)"/g) ?? []
  assert.equal(gearClicks.length, 2, '移动端与桌面的齿轮按钮都必须把 currentTarget 传进去')
  assert.doesNotMatch(mapPage, /@click="toggleDisplaySettings"/, '还有齿轮按钮没传事件，origin 会退回居中')
  assert.match(mapPage, /<Transition\s+name="pv-origin"\s+@before-enter="applyDisplaySettingsOrigin"/)
})

test('面板 bloom 用液体弹簧曲线，高度仍走 --ease-sheet', () => {
  assert.match(
    mapPage,
    /\.map-workspace\[data-sheet-bloom='off'\] \.map-glass-sheet \{[\s\S]{0,320}?transform 560ms var\(--ease-spring-sheet\),[\s\S]{0,200}?opacity 200ms var\(--ease-fade\),[\s\S]{0,240}?height 320ms var\(--ease-sheet\);/
  )
})

test('点位浮窗从 pin 一侧长出：origin 变量与 scale 入场都要在', () => {
  assert.match(pinPopover, /transform-origin: var\(--pin-origin-x, 50%\) var\(--pin-origin-y, 100%\);/)
  assert.match(pinPopover, /scale 140ms ease/)
  assert.match(pinPopover, /\n\s+scale: 0\.94;/)
  const calls = pinPopover.match(/setOriginFromAnchor\(/g) ?? []
  assert.equal(calls.length, 3, '定义 + 锚定定位 + 回落定位 各一次')
  assert.match(pinPopover, /el\.style\.setProperty\('--pin-origin-y', flipped \? '0%' : '100%'\)/)
})
