import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  DEFAULT_THEME_PALETTE,
  THEME_BOOT_SCRIPT,
  THEME_PALETTE_IDS,
  THEME_PALETTE_STORAGE_KEY,
  THEME_PALETTES,
  THEME_PALETTE_THEME_COLORS,
  isThemePalette,
  resolveThemePalette
} from '../app/utils/theme-mode'

const css = readFileSync(resolve('app/assets/css/main.css'), 'utf8')
const vueSource = readFileSync(resolve('app/components/ThemeModeToggle.vue'), 'utf8')

/* 2026-11-14 用户裁定「重做，全部配色都不要」：原 9 套（绿/靛蓝/紫罗兰/玫瑰/青蓝 +
   clay/mercury/oura/mist）全部作废，只留一套「极光紫」（Radix Colors violet 色阶）。
   本文件随之收敛为单配色契约测试。 */

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(offset => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

// A. theme-mode.ts 导出契约

test('A1: palette storage key and default palette are pinned', () => {
  assert.equal(THEME_PALETTE_STORAGE_KEY, 'yeu-palette')
  assert.equal(DEFAULT_THEME_PALETTE, 'paper')
})

test('A2: 四套配色候选都在册，label / swatch / theme-color 齐全', () => {
  assert.deepEqual([...THEME_PALETTE_IDS], ['paper', 'mist', 'cream', 'berry'])
  assert.equal(THEME_PALETTES.length, THEME_PALETTE_IDS.length)
  for (const p of THEME_PALETTES) {
    assert.ok(p.label.length > 0, `${p.id} 缺少 label`)
    assert.ok(p.swatchClass.length > 0, `${p.id} 缺少 swatchClass`)
  }
  assert.deepEqual(Object.keys(THEME_PALETTE_THEME_COLORS).sort(), [...THEME_PALETTE_IDS].sort())
  assert.equal(THEME_PALETTE_THEME_COLORS.mist, '#f4f6f9')
  assert.equal(THEME_PALETTE_THEME_COLORS.cream, '#faf7f2')
})

test('A3: 未知值与非在册 id 回落 paper，在册 id 原样保留', () => {
  for (const raw of [null, undefined, '', 'INDIGO', 'bogus', 'aurora ', 'green', 'clay', 'dorm']) {
    assert.equal(resolveThemePalette(raw as string | null | undefined), 'paper')
  }
  for (const id of THEME_PALETTE_IDS) {
    assert.equal(resolveThemePalette(id), id)
  }
})

test('A4: isThemePalette 只认在册四套', () => {
  for (const id of THEME_PALETTE_IDS) assert.equal(isThemePalette(id), true)
  for (const raw of ['clay', 'green', 'dorm', '', 'bogus']) assert.equal(isThemePalette(raw), false)
})

test('B5: boot script 白名单与 THEME_PALETTE_IDS 一致，仍写 data-palette', () => {
  assert.ok(THEME_BOOT_SCRIPT.includes('yeu-palette'), 'boot script 未读取 yeu-palette')
  assert.ok(THEME_BOOT_SCRIPT.includes('data-palette'), 'boot script 未写 data-palette')
  assert.ok(THEME_BOOT_SCRIPT.includes("'paper'"), 'boot script 白名单缺少 paper')
  assert.ok(!THEME_BOOT_SCRIPT.includes("'green'"), 'boot script 仍残留 green 白名单')
})

test('B6: boot script 保留暗色切换', () => {
  assert.ok(THEME_BOOT_SCRIPT.includes("classList.toggle('dark'"))
  assert.ok(THEME_BOOT_SCRIPT.includes("classList.toggle('light'"))
})

// C. main.css 结构

test('C7: 默认配色是白纸 paper（html:not([data-palette]) 覆盖 :root 的旧极光紫）', () => {
  assert.equal(DEFAULT_THEME_PALETTE, 'paper')
  assert.match(css, /html:not\(\[data-palette\]\)\s*\{[^}]*--page-bg:\s*#f4f4f5/i, '默认纸面不是 #f4f4f5')
  assert.match(css, /html:not\(\[data-palette\]\)\s*\{[^}]*--color-green-500:\s*#171717/i, '默认主色不是 #171717')
})

test('C8: 四套各有浅/深主块，且主块里定义了纸面变量（阶梯补块不算）', () => {
  const heads = css.split('\n').map(line => line.trim()).filter(line => /^(html(\.dark)?)?\[data-palette=/.test(line))
  const ids = heads.map(line => (line.match(/data-palette=['"]?([a-z]+)/) ?? [])[1]).filter(Boolean)
  assert.deepEqual([...new Set(ids)].sort(), ['berry', 'cream', 'mist', 'paper'], `配色应为四套，实得 ${ids.join(',')}`)
  for (const id of ['paper', 'mist', 'cream', 'berry']) {
    const light = new RegExp(`html\\[data-palette='${id}'\\]\\s*\\{[^}]*--page-bg:`, 'i')
    const dark = new RegExp(`html\\.dark\\[data-palette='${id}'\\]\\s*\\{[^}]*--page-bg:`, 'i')
    assert.match(css, light, `${id} 缺浅色主块`)
    assert.match(css, dark, `${id} 缺暗色主块`)
  }
})

test('C9: 默认纸面/墨色是 paper 的白灰，不再是旧极光紫', () => {
  assert.match(css, /html:not\(\[data-palette\]\)\s*\{[^}]*--ink:\s*#0a0a0a/i, '默认墨色不是 #0a0a0a')
  assert.match(css, /html\.dark:not\(\[data-palette\]\)\s*\{[^}]*--page-bg:\s*#0a0a0a/i, '默认暗色纸面不是 #0a0a0a')
})

// D. 对比度

test('D10: 白字压在主色 600 上 ≥ 4.5:1（四套都测，见 theme-contrast.test.ts）', () => {
  const ratio = contrast('#ffffff', '#171717')
  assert.ok(ratio >= 4.5, `白字对比度 ${ratio.toFixed(2)} < 4.5`)
})

test('D11: 正文墨色压在纸面上 ≥ 7:1', () => {
  const ratio = contrast('#0a0a0a', '#f4f4f5')
  assert.ok(ratio >= 7, `正文对比度 ${ratio.toFixed(2)} < 7`)
})

// E. 组件

test('E12: 只有一套配色时下拉菜单不渲染配色组', () => {
  assert.ok(vueSource.includes('palettes.length > 1'), '缺少「只有一套不渲染配色组」的守卫')
})
