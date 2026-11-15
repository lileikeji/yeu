import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

// 四套配色 × 浅/深 的可读性回归：值来自 main.css，改色若跌破阈值这里直接红。
const CSS = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')

type Tokens = Record<string, string>
function collect(): Record<string, Tokens> {
  const out: Record<string, Tokens> = {}
  let cur = ''
  for (const line of CSS.split('\n')) {
    const head = line.match(/^(html(?:\.dark)?(?:\[data-palette='([a-z]+)'\])?)\s*\{/)
    if (head) {
      cur = (head[2] ?? 'root') + (head[1].startsWith('html.dark') ? '-dark' : '-light')
      out[cur] ??= {}
      continue
    }
    const decl = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/)
    if (decl && cur)
      out[cur][decl[1]] = decl[2].trim()
    if (line.trim() === '}' && cur)
      cur = ''
  }
  return out
}

function rgb(value: string): [number, number, number] | null {
  const m = value.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i)
  if (!m)
    return null
  let h = m[1]
  if (h.length === 3)
    h = h.split('').map(c => c + c).join('')
  return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)]
}

function luminance(c: [number, number, number]) {
  const f = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}

function contrast(fg: string, bg: string) {
  const a = rgb(fg)
  const b = rgb(bg)
  if (!a || !b)
    return null
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const PAGES = ['paper', 'mist', 'cream', 'berry'] as const
const TEXT_MIN = 4.5

test('四套 × 浅深：正文/次文/主色文字都过 4.5:1', () => {
  const blocks = collect()
  const rows: string[] = []
  for (const id of PAGES) {
    for (const mode of ['light', 'dark'] as const) {
      const key = `${id}-${mode}`
      const t = blocks[key]
      assert.ok(t, `缺少 ${key} 变量块`)
      const checks: [string, string, string][] = [
        ['墨/纸', '--ink', '--page-bg'],
        ['墨/面', '--ink', '--surface'],
        ['次墨/纸', '--muted-ink', '--page-bg'],
        ['主色文字/纸', '--color-green-500', '--page-bg'],
        ['深主文字/纸', '--color-green-700', '--page-bg'],
      ]
      for (const [label, fg, bg] of checks) {
        const ratio = contrast(t[fg], t[bg])
        assert.ok(ratio !== null, `${key} ${label} 无法解析`)
        rows.push(`${key} ${label} ${ratio.toFixed(2)}`)
        assert.ok(ratio >= TEXT_MIN, `${key} ${label} = ${ratio.toFixed(2)} < ${TEXT_MIN}`)
      }
      // 暗色下组件常用 dark:text-green-400
      if (mode === 'dark') {
        const ratio = contrast(t['--color-green-400'], t['--page-bg'])
        assert.ok(ratio !== null && ratio >= TEXT_MIN, `${key} 400 文字 = ${ratio?.toFixed(2)}`)
        rows.push(`${key} 400 文字 ${ratio.toFixed(2)}`)
      }
    }
  }
  assert.equal(rows.length, PAGES.length * 2 * 5 + PAGES.length)
})

test('四套 × 浅深：纯净白字压在主色 600 上过 4.5:1（bg-green-600 + text-white）', () => {
  const blocks = collect()
  for (const id of PAGES) {
    for (const mode of ['light', 'dark'] as const) {
      const t = blocks[`${id}-${mode}`]
      const ratio = contrast('#ffffff', t['--color-green-600'])
      assert.ok(ratio !== null && ratio >= TEXT_MIN, `${id}-${mode} 白字/600 = ${ratio?.toFixed(2)}`)
    }
  }
})

test('选区文字用 --surface，不得写死白色（暗色主题下会瞎）', () => {
  assert.ok(!/::selection\s*\{[^}]*color:\s*#ffffff/i.test(CSS), '::selection 仍写死 #ffffff')
  assert.ok(/::selection\s*\{[^}]*color:\s*var\(--surface\)/i.test(CSS), '::selection 未使用 --surface')
})

// —— T-019 追加：暗色 zinc 文字档 + 禁止写死白底 ——
// zinc 是全局灰阶，四套 palette 共用；主色阶 400/500 在浅底已提到 4.5:1 以上，
// 但暗底上原本只有 2.3–2.7:1，所以在 main.css 末尾的 html.dark 块里单独提亮一次。

function walkVue(dir: URL, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.'))
      continue
    const rel = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isDirectory())
      out.push(...walkVue(new URL(entry.name + '/', dir), rel))
    else if (entry.name.endsWith('.vue'))
      out.push(rel)
  }
  return out
}

test('四套暗色：zinc-400/500 文字压在 --surface 与 --page-bg 上都过 4.5:1', () => {
  const blocks = collect()
  const shared = blocks['root-dark']
  assert.ok(shared, '缺少 html.dark 公共暗色块（zinc 提亮应写在里面）')
  const tokens = ['--color-zinc-400', '--color-zinc-500']
  for (const id of PAGES) {
    const t = { ...shared, ...blocks[id + '-dark'] }
    for (const token of tokens) {
      for (const bg of ['--surface', '--page-bg']) {
        const ratio = contrast(t[token], t[bg])
        assert.ok(ratio !== null, id + ' 暗色 ' + token + ' / ' + bg + ' 无法解析')
        assert.ok(ratio! >= TEXT_MIN, id + ' 暗色 ' + token + ' / ' + bg + ' = ' + ratio!.toFixed(2) + ' < ' + TEXT_MIN)
      }
    }
  }
})

test('组件不再写死白底：app/**/*.vue 不得出现 bg-white，白色只允许白名单里的渲染层/字色', () => {
  // 白名单不是"以后随便写"，是这三处白色不属于 CSS 主题层：
  // 1) maplibre 的 paint 颜色写进 canvas，CSS 变量在那里不生效；
  // 2) nearby 的渐变写了浅/深两套，白色只在浅色一侧；
  // 3) 线路徽标上的 #fff 是压在彩色底上的字色，不是背景。
  const allow = new Set([
    'components/admin/AdminCoordinateReviewMap.vue',
    'pages/nearby.vue',
    'pages/transport/lines.vue',
  ])
  const files = walkVue(new URL('../app/', import.meta.url))
  assert.ok(files.length > 50, '没扫到 app/**/*.vue，路径可能错了')
  const bgWhite: string[] = []
  const whiteHex: string[] = []
  for (const rel of files) {
    const src = readFileSync(new URL('../app/' + rel, import.meta.url), 'utf8')
    if (/(^|[^\w-])bg-white(?![\w/-])/.test(src))
      bgWhite.push(rel)
    if (/#ffffff|#fff(?![\da-f])/i.test(src) && !allow.has(rel))
      whiteHex.push(rel + '(#fff)')
  }
  assert.deepEqual(bgWhite, [], '仍有 bg-white 白底：' + bgWhite.join(', '))
  assert.deepEqual(whiteHex, [], '有未登记的写死白色：' + whiteHex.join(', '))
  for (const rel of allow)
    assert.ok(existsSync(new URL('../app/' + rel, import.meta.url)), '白名单文件已不存在：' + rel)
})

test('四套暗色：--color-zinc-900 跟随该套 --surface（暗色卡片面不再钉死 #18181b）', () => {
  const blocks = collect()
  for (const id of PAGES) {
    const t = blocks[id + '-dark']
    assert.ok(t, '缺少 ' + id + '-dark 变量块')
    assert.ok(t['--color-zinc-900'], id + '-dark 缺少 --color-zinc-900')
    assert.equal(t['--color-zinc-900'].toLowerCase(), t['--surface']?.toLowerCase(), id + ' 暗色 --color-zinc-900 未等于 --surface')
  }
})

test('class 里不得出现 codemod 残片 var(--…)]:bg-', () => {
  const files = walkVue(new URL('../app/', import.meta.url))
  const broken: string[] = []
  for (const rel of files) {
    const src = readFileSync(new URL('../app/' + rel, import.meta.url), 'utf8')
    if (/var\(--[^)]*\)\]:bg-/.test(src))
      broken.push(rel)
  }
  assert.deepEqual(broken, [], '有 codemod 残片 var(--…)]:bg-：' + broken.join(', '))
})

test('浅渐变面板必须有暗色分支：class 串里出现 via-white 时同串要有 dark:from/via/to-', () => {
  const files = walkVue(new URL('../app/', import.meta.url))
  const broken: string[] = []
  for (const rel of files) {
    const src = readFileSync(new URL('../app/' + rel, import.meta.url), 'utf8')
    for (const m of src.matchAll(/class="([^"]*)"/g)) {
      const cls = m[1]
      if (!cls.includes('via-white')) continue
      if (!/\bdark:(from|via|to)-/.test(cls)) broken.push(rel + ' -> ' + cls.slice(0, 70))
    }
  }
  assert.deepEqual(broken, [], '浅渐变缺 dark 分支：' + broken.join(' | '))
})

test('品牌底不放白字：class 串同时出现 bg-green-700 与 text-white 即报红（四套暗色 green-700 全是浅色）', () => {
  const files = walkVue(new URL('../app/', import.meta.url))
  const broken: string[] = []
  for (const rel of files) {
    const src = readFileSync(new URL('../app/' + rel, import.meta.url), 'utf8')
    for (const m of src.matchAll(/class="([^"]*)"/g)) {
      const cls = m[1]
      if (!/\bbg-green-700\b/.test(cls)) continue
      if (/\btext-white\b/.test(cls)) broken.push(rel + ' -> ' + cls.slice(0, 70))
    }
  }
  assert.deepEqual(broken, [], '品牌底上有白字（暗色会白压白）：' + broken.join(' | '))
})
