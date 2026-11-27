import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import test from 'node:test'

const appRoot = resolve('app')
const mainCssPath = resolve('app/assets/css/main.css')
const mainCss = readFileSync(mainCssPath, 'utf8')
const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const shellDockSource = readFileSync(resolve('app/components/ShellDock.vue'), 'utf8')

const Z_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['--z-glass', '18'],
  ['--z-glass-top', '19'],
  ['--z-overlay', '20'],
  ['--z-sheet', '30'],
  ['--z-popover', '50'],
  ['--z-toast', '60']
]
const SHEET_EASE = 'cubic-bezier(0.24, 1, 0.32, 1)'
const COMPACT_SHEET_EASE = 'cubic-bezier(0.24,1,0.32,1)'
const SOFT_FADE_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const SCAN_EXTENSIONS = new Set(['.vue', '.ts', '.js', '.css', '.scss', '.html'])

function allIndexesOf(source: string, needle: string): number[] {
  const hits: number[] = []
  let at = source.indexOf(needle)
  while (at !== -1) {
    hits.push(at)
    at = source.indexOf(needle, at + needle.length)
  }
  return hits
}

// 注释里的旧值（如「折射画布在地图 z-18」）是文档，不是类名；断言前先剔掉。
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\n)[ \t]*\/\/[^\n]*/g, '$1')
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
    } else if (SCAN_EXTENSIONS.has(extname(full))) {
      out.push(full)
    }
  }
  return out
}

test(':root 定义地图层叠与缓动 token，取值与替换前一致', () => {
  const rootStart = mainCss.indexOf(':root {')
  assert.notEqual(rootStart, -1, 'main.css 必须存在 :root 变量块')
  const rootEnd = mainCss.indexOf('}', rootStart)
  assert.ok(rootEnd > rootStart, ':root 变量块必须闭合')

  for (const [name, value] of Z_TOKENS) {
    const declaration = `${name}: ${value};`
    const hits = allIndexesOf(mainCss, declaration)
    assert.equal(hits.length, 1, `${declaration} 必须且只能定义一次`)
    assert.ok(hits[0] > rootStart && hits[0] < rootEnd, `${declaration} 必须写在 :root 块内`)
  }

  const ease = `--ease-sheet: ${SHEET_EASE};`
  const easeHits = allIndexesOf(mainCss, ease)
  assert.equal(easeHits.length, 1, `${ease} 必须且只能定义一次`)
  assert.ok(easeHits[0] > rootStart && easeHits[0] < rootEnd, '--ease-sheet 必须写在 :root 块内')
})

test('地图页 class 里不再出现裸 z 值', () => {
  const body = stripComments(pageSource)
  for (const bare of ['z-[18]', 'z-[19]', 'z-20', 'z-30', 'z-50']) {
    assert.equal(allIndexesOf(body, bare).length, 0, `class 里不许再出现裸 ${bare}，必须换成 var(--z-*)`)
  }
  for (const token of ['z-[var(--z-glass)]', 'z-[var(--z-glass-top)]', 'z-[var(--z-overlay)]', 'z-[var(--z-sheet)]']) {
    assert.ok(body.includes(token), `地图页必须出现 ${token}`)
  }
})

test('面板缓动曲线只允许出现在 main.css 的 token 定义里', () => {
  assert.equal(allIndexesOf(mainCss, COMPACT_SHEET_EASE).length, 0, 'main.css 的 token 用带空格写法，不写紧凑写法')

  const files = walk(appRoot)
  assert.ok(files.length > 0, 'app 目录必须能扫到源码文件')
  const offenders: string[] = []
  for (const file of files) {
    if (file === mainCssPath) {
      continue
    }
    const text = readFileSync(file, 'utf8')
    if (allIndexesOf(text, SHEET_EASE).length > 0
      || allIndexesOf(text, COMPACT_SHEET_EASE).length > 0
      || allIndexesOf(text, SOFT_FADE_EASE).length > 0) {
      offenders.push(file)
    }
  }
  assert.deepEqual(offenders, [], '曲线必须引用 var(--ease-sheet) / var(--ease-soft-fade)，不许裸写 cubic-bezier')
})

test('面板曲线全部走 token，时长改动必须显式登记', () => {
  const body = stripComments(pageSource)

  // 2026-11-26 面板动效改成弹簧（linear() 过冲）＋收起草果冻曲线：曲线仍然只能来自 token。
  assert.equal(allIndexesOf(body, 'cubic-bezier(').length, 0, '地图页不许裸写 cubic-bezier，曲线必须引用 token')
  const pageTokens: ReadonlyArray<readonly [string, number]> = [
    ['var(--ease-sheet)', 2],
    ['var(--ease-spring-sheet)', 3],
    ['var(--ease-liquid-out)', 2],
    ['var(--ease-soft-fade)', 2]
  ]
  for (const [token, least] of pageTokens) {
    assert.ok(allIndexesOf(body, token).length >= least, `地图页至少 ${least} 处必须引用 ${token}`)
  }
  assert.ok(
    allIndexesOf(shellDockSource, 'var(--ease-sheet)').length >= 8,
    'ShellDock 8 处过渡必须引用 --ease-sheet'
  )

  // linear() 在旧内核（微信 X5 / Chromium < 113）不成立时整条 transition 会失效，
  // 所以弹簧规则必须包在 @supports 里，页面里还得留一档 cubic-bezier 兜底。
  assert.ok(
    body.includes('@supports (transition-timing-function: linear(0, 1))'),
    '弹簧 / 果冻曲线必须包在 @supports (transition-timing-function: linear(0, 1)) 里'
  )
  assert.ok(mainCss.includes(`--ease-soft-fade: ${SOFT_FADE_EASE};`), '--ease-soft-fade 必须在 main.css 的 :root 里定义')

  // 红线：时长只能整档审过再改，改了就同步这张表。
  for (const duration of [
    'transform 300ms',
    'transform 560ms',
    'transform 460ms',
    'height 320ms',
    'bottom 220ms',
    'opacity 200ms',
    'opacity 140ms'
  ]) {
    assert.ok(body.includes(duration), `地图页时长 ${duration} 必须保持登记值`)
  }
  for (const duration of ['height 240ms', 'transform 200ms', 'transform 220ms', 'transform 260ms']) {
    assert.ok(shellDockSource.includes(duration), `ShellDock 时长 ${duration} 必须保持原样`)
  }
})
