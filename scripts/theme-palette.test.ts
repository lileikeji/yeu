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
  isThemePalette,
  resolveThemePalette
} from '../app/utils/theme-mode'

const css = readFileSync(resolve('app/assets/css/main.css'), 'utf8')
const vueSource = readFileSync(resolve('app/components/ThemeModeToggle.vue'), 'utf8')
const composableSource = readFileSync(resolve('app/composables/useThemeMode.ts'), 'utf8')

const PALETTE_IDS = ['indigo', 'violet', 'rose', 'teal'] as const
const GREEN_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

/** 取出 `selector { ... }` 的块体；只处理文件里无嵌套的扁平规则块。 */
function cssBlock(selector: string): string {
  const start = css.indexOf(selector)
  assert.notEqual(start, -1, `main.css 缺少选择器 ${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('\n}', open)
  assert.notEqual(close, -1, `main.css 中 ${selector} 块未闭合`)
  return css.slice(open + 1, close)
}

function declarations(block: string, family: 'green' | 'orange'): Map<string, string> {
  const found = new Map<string, string>()
  const pattern = new RegExp(`--color-${family}-(\\d+):\\s*(#[0-9a-fA-F]{3,8})`, 'g')
  for (const match of block.matchAll(pattern)) found.set(match[1]!, match[2]!.toLowerCase())
  return found
}

interface PaletteColors {
  green300: string
  green400: string
  green500: string
  green700: string
  orange600: string
}

function paletteColors(block: string): PaletteColors {
  const green = declarations(block, 'green')
  const orange = declarations(block, 'orange')
  for (const shade of ['300', '400', '500', '700']) {
    assert.ok(green.has(shade), `块内缺少 --color-green-${shade}`)
  }
  assert.ok(orange.has('600'), '块内缺少 --color-orange-600')
  return {
    green300: green.get('300')!,
    green400: green.get('400')!,
    green500: green.get('500')!,
    green700: green.get('700')!,
    orange600: orange.get('600')!
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ]
}

/** WCAG 2.x 相对亮度：sRGB 通道先线性化再加权。 */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

// A. theme-mode.ts 导出契约

test('A1: palette storage key and default palette are pinned', () => {
  assert.equal(THEME_PALETTE_STORAGE_KEY, 'yeu-palette')
  assert.equal(DEFAULT_THEME_PALETTE, 'green')
})

test('A2: THEME_PALETTES exposes five palettes in display order', () => {
  assert.equal(THEME_PALETTES.length, 5)
  assert.deepEqual(THEME_PALETTE_IDS, ['green', 'indigo', 'violet', 'rose', 'teal'])
  assert.deepEqual(THEME_PALETTES.map(palette => palette.id), ['green', 'indigo', 'violet', 'rose', 'teal'])
  for (const palette of THEME_PALETTES) {
    assert.ok(palette.label.length > 0, `palette ${palette.id} 缺少 label`)
    assert.match(palette.swatchClass, /^text-\[#[0-9a-f]{6}\]$/i, `palette ${palette.id} 的 swatchClass 不是 hex 文本色`)
  }
})

test('A3: resolveThemePalette falls back to green for anything not an exact id', () => {
  assert.equal(resolveThemePalette(null), 'green')
  assert.equal(resolveThemePalette(undefined), 'green')
  assert.equal(resolveThemePalette(''), 'green')
  assert.equal(resolveThemePalette('INDIGO'), 'green')
  assert.equal(resolveThemePalette('bogus'), 'green')
  assert.equal(resolveThemePalette('green '), 'green')
  assert.equal(resolveThemePalette('indigo'), 'indigo')
  assert.equal(resolveThemePalette('teal'), 'teal')
})

test('A4: isThemePalette accepts only the five exact ids', () => {
  for (const id of ['green', 'indigo', 'violet', 'rose', 'teal']) {
    assert.equal(isThemePalette(id), true, `${id} 应判定为合法 palette`)
  }
  for (const value of ['INDIGO', '', null, 42, {}] as unknown[]) {
    assert.equal(isThemePalette(value), false, `${String(value)} 不应判定为合法 palette`)
  }
})

// B. boot script 完整性

test('B5: boot script reads the palette key and applies a whitelisted data-palette', () => {
  assert.ok(THEME_BOOT_SCRIPT.includes('yeu-palette'), 'boot script 未读取 yeu-palette')
  assert.ok(THEME_BOOT_SCRIPT.includes('data-palette'), 'boot script 未写 data-palette')
  assert.ok(THEME_BOOT_SCRIPT.includes(`'green'`), 'boot script 白名单缺少 green')
  assert.ok(THEME_BOOT_SCRIPT.includes(`'teal'`), 'boot script 白名单缺少 teal')
})

test('B6: boot script keeps the original dark/light class toggle', () => {
  assert.ok(THEME_BOOT_SCRIPT.includes(`classList.toggle('dark'`), 'boot script 丢失 classList.toggle dark')
  assert.ok(THEME_BOOT_SCRIPT.includes(`classList.toggle('light'`), 'boot script 丢失 classList.toggle light')
})

// C. main.css 结构

test('C7: main.css keeps the theme tokens the palette override depends on', () => {
  assert.match(css, /@theme static/)
  assert.match(css, /@custom-variant dark/)
  assert.match(css, /--color-red-500: #b4232c/)
})

test('C8: four non-default palette blocks exist', () => {
  for (const id of PALETTE_IDS) {
    assert.match(css, new RegExp(`\\[data-palette="${id}"\\]\\s*\\{`), `缺少 [data-palette="${id}"] 块`)
  }
})

test('C9: no green override block is written (default keeps @theme static as single source)', () => {
  assert.doesNotMatch(css, /\[data-palette="green"\]/)
})

test('C10: each palette block overrides exactly the 11 green and 11 orange shades', () => {
  for (const id of PALETTE_IDS) {
    const block = cssBlock(`[data-palette="${id}"]`)
    const green = declarations(block, 'green')
    const orange = declarations(block, 'orange')
    assert.equal(green.size, 11, `[data-palette="${id}"] 的 green 声明数不是 11`)
    assert.equal(orange.size, 11, `[data-palette="${id}"] 的 orange 声明数不是 11`)
    for (const shade of GREEN_SHADES) {
      assert.ok(green.has(shade), `[data-palette="${id}"] 缺少 --color-green-${shade}`)
      assert.ok(orange.has(shade), `[data-palette="${id}"] 缺少 --color-orange-${shade}`)
    }
  }
})

test('C11: each palette keeps its planned green-500 value', () => {
  const planned: Record<string, string> = {
    indigo: '#5159bb',
    violet: '#7a49bd',
    rose: '#b23450',
    teal: '#0a7aa3'
  }
  for (const id of PALETTE_IDS) {
    const green = declarations(cssBlock(`[data-palette="${id}"]`), 'green')
    assert.equal(green.get('500'), planned[id], `[data-palette="${id}"] 的 --color-green-500 与计划值不符`)
  }
})

test('C12: all five green-500 anchors are distinct', () => {
  const anchors = [
    declarations(cssBlock('@theme static'), 'green').get('500'),
    ...PALETTE_IDS.map(id => declarations(cssBlock(`[data-palette="${id}"]`), 'green').get('500'))
  ]
  for (const anchor of anchors) assert.ok(anchor, 'green-500 缺失')
  assert.equal(new Set(anchors).size, 5, `5 套 green-500 出现重复：${anchors.join(', ')}`)
  assert.equal(anchors[0], '#176f46', '@theme static 里的默认 green-500 应为 #176f46')
})

test('C13: palette overrides stay unlayered and come after @theme static', () => {
  // 逐字符扫描 {@layer} 嵌套深度：palette 选择器必须出现在深度 0 处，才算无层规则。
  // 无层规则在层叠中优先于任何 @layer，这是整个换肤机制成立的前提，必须真拦住。
  // 先剥离 CSS 注释，否则注释里提到的 "@layer theme" 会被误计。
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const target = '[data-palette="indigo"]'
  const at = stripped.indexOf(target)
  assert.ok(at > 0, 'palette 覆盖块缺失')
  let depth = 0
  let inLayer = 0
  for (let i = 0; i < at; i++) {
    if (stripped.startsWith('@layer', i)) inLayer++
    if (stripped[i] === '{') depth++
    else if (stripped[i] === '}') {
      depth--
      if (depth === 0) inLayer = 0
    }
  }
  assert.equal(inLayer, 0, 'palette 覆盖块被包进了 @layer，无层优先级会失效')
  assert.equal(depth, 0, 'palette 覆盖块前存在未闭合的 {} 块')
  assert.ok(
    at > stripped.indexOf('@theme static'),
    'palette 覆盖块必须写在 @theme static 之后才能生效'
  )
})

// D. WCAG 对比度

const paletteBlocks: Record<string, string> = {
  green: '@theme static',
  indigo: '[data-palette="indigo"]',
  violet: '[data-palette="violet"]',
  rose: '[data-palette="rose"]',
  teal: '[data-palette="teal"]'
}

test('D14: green-500 reads on white for every palette (>= 4.5)', () => {
  for (const [id, selector] of Object.entries(paletteBlocks)) {
    const { green500 } = paletteColors(cssBlock(selector))
    const ratio = contrastRatio(green500, '#ffffff')
    assert.ok(ratio >= 4.5, `${id} green-500 ${green500} 对白色对比度 ${ratio.toFixed(2)} < 4.5`)
  }
})

test('D15: green-700 reads on white for every palette (>= 7)', () => {
  for (const [id, selector] of Object.entries(paletteBlocks)) {
    const { green700 } = paletteColors(cssBlock(selector))
    const ratio = contrastRatio(green700, '#ffffff')
    assert.ok(ratio >= 7, `${id} green-700 ${green700} 对白色对比度 ${ratio.toFixed(2)} < 7`)
  }
})

test('D16: green-400 reads on the dark page background for every palette (>= 4.5)', () => {
  for (const [id, selector] of Object.entries(paletteBlocks)) {
    const { green400 } = paletteColors(cssBlock(selector))
    const ratio = contrastRatio(green400, '#101310')
    assert.ok(ratio >= 4.5, `${id} green-400 ${green400} 对 #101310 对比度 ${ratio.toFixed(2)} < 4.5`)
  }
})

test('D17: green-300 reads on the dark surface for every palette (>= 4.5)', () => {
  for (const [id, selector] of Object.entries(paletteBlocks)) {
    const { green300 } = paletteColors(cssBlock(selector))
    const ratio = contrastRatio(green300, '#171b17')
    assert.ok(ratio >= 4.5, `${id} green-300 ${green300} 对 #171b17 对比度 ${ratio.toFixed(2)} < 4.5`)
  }
})

test('D18: orange-600 reads on white for every palette (>= 4.5)', () => {
  for (const [id, selector] of Object.entries(paletteBlocks)) {
    const { orange600 } = paletteColors(cssBlock(selector))
    const ratio = contrastRatio(orange600, '#ffffff')
    assert.ok(ratio >= 4.5, `${id} orange-600 ${orange600} 对白色对比度 ${ratio.toFixed(2)} < 4.5`)
  }
})

// E. 组件与组合式接线

test('E19: ThemeModeToggle renders palettes from the composable and uses swatch colors', () => {
  assert.match(vueSource, /palettes/)
  assert.match(vueSource, /setPalette/)
  assert.ok(
    /swatchClass/.test(vueSource) || /itemLeadingIcon/.test(vueSource),
    '组件未使用 swatchClass/itemLeadingIcon 渲染色板'
  )
})

test('E20: ThemeModeToggle does not hand-write data-palette', () => {
  assert.doesNotMatch(vueSource, /setAttribute\(['"]data-palette/)
})

test('E21: useThemeMode keeps palette and mode logic wired together', () => {
  assert.match(composableSource, /THEME_PALETTE_STORAGE_KEY/)
  assert.match(composableSource, /applyThemePalette/)
  assert.match(composableSource, /storedThemeMode/)
})
