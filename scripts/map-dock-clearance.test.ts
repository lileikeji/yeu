import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const MOBILE_BREAKPOINT = 'max-width: 767.98px'
const DOCK_CLEARANCE = 'padding-bottom: calc('
  + 'var(--shell-dock-map-height, 6.25rem) + var(--mobile-dock-inset, 0.625rem) + 1rem'
  + ' + env(safe-area-inset-bottom))'

/** 取某个媒体查询的全部规则块区间（含嵌套块，按花括号配平）。 */
function mediaSpans(source: string, query: string): Array<{ start: number, end: number }> {
  const spans: Array<{ start: number, end: number }> = []
  const opener = `@media (${query})`
  let from = 0
  for (;;) {
    const at = source.indexOf(opener, from)
    if (at === -1) break
    const braceAt = source.indexOf('{', at)
    if (braceAt === -1) break
    let depth = 0
    let i = braceAt
    for (; i < source.length; i += 1) {
      const ch = source[i]
      if (ch === '{') {
        depth += 1
      } else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          i += 1
          break
        }
      }
    }
    spans.push({ start: at, end: i })
    from = i
  }
  return spans
}

function insideMobileMedia(source: string, index: number): boolean {
  assert.notEqual(index, -1, '锚点必须存在')
  return mediaSpans(source, MOBILE_BREAKPOINT).some(span => index > span.start && index < span.end)
}

test('map result scrollers reserve the mobile dock clearance', () => {
  // T-033 R9（F-50）：原生搜索结果块原本只有 pb-2（8px）、全地点列表没有底距，
  // 结果多到要滚时最后一行压在 dock 下面 —— 两个滚动器都要在手机断点留出 dock 高度。
  assert.equal(pageSource.match(/class="map-sheet-results /g)?.length, 1, '原生搜索结果块要挂上 .map-sheet-results')
  assert.equal(pageSource.split(DOCK_CLEARANCE).length - 1, 1, '底栏留白只能有一条声明')

  const css = pageSource.slice(pageSource.indexOf('<style>'))
  const scrollerRules = [...css.matchAll(/\.map-workspace \.map-(?:sheet-results|place-list)[^{]*\{[^}]*\}/g)]
  const paddingRules = scrollerRules.filter(rule => rule[0].includes('padding-bottom'))
  assert.equal(paddingRules.length, 1, '两个滚动器共用一条 padding-bottom 规则')
  assert.match(paddingRules[0][0], /\.map-workspace \.map-sheet-results,[\s\S]*\.map-workspace \.map-place-list \{/)
  assert.match(paddingRules[0][0], /padding-bottom: calc\(var\(--shell-dock-map-height, 6\.25rem\)/)

  // 桌面（md+）不受影响：这条规则只出现在 max-width 媒体块里。
  const declAt = pageSource.indexOf(DOCK_CLEARANCE)
  assert.ok(insideMobileMedia(pageSource, declAt), '留白必须包在 @media (max-width: 767.98px) 内')
  assert.ok(
    mediaSpans(pageSource, 'min-width: 768px').every(span => declAt <= span.start || declAt >= span.end),
    '桌面断点里不能出现这条留白'
  )
})
