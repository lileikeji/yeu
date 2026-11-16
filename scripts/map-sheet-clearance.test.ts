import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const MOBILE_BREAKPOINT = 'max-width: 767.98px'

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

function mobileSpanOf(source: string, index: number): { start: number, end: number } {
  assert.notEqual(index, -1, '锚点必须存在')
  const span = mediaSpans(source, MOBILE_BREAKPOINT).find(item => index > item.start && index < item.end)
  assert.ok(span, '规则必须包在手机断点媒体块内')
  return span as { start: number, end: number }
}

function allIndexesOf(source: string, needle: string): number[] {
  const hits: number[] = []
  let from = 0
  for (;;) {
    const at = source.indexOf(needle, from)
    if (at === -1) break
    hits.push(at)
    from = at + needle.length
  }
  return hits
}

test('sheet collapse phases only exist on the phone breakpoint', () => {
  // T-033 R9（F-52）：桌面没有 dock 可收，半屏→折叠（打开显示设置等路径）不该让侧栏闪缩。
  for (const phase of ['pin', 'shrink', 'drop']) {
    const needle = `[data-sheet-collapse='${phase}']`
    const hits = allIndexesOf(pageSource, needle)
    assert.ok(hits.length > 0, `${phase} 相位规则必须存在`)
    const span = mobileSpanOf(pageSource, hits[0])
    for (const hit of hits) {
      assert.ok(hit > span.start && hit < span.end, `${phase} 相位的每条规则都要在手机断点内`)
    }
  }
  // 高度规则仍留在 @layer utilities（层序不能变），但同样在手机断点内。
  const heightAt = pageSource.indexOf('height: var(--sheet-collapse-h, 326px) !important')
  const heightSpan = mobileSpanOf(pageSource, heightAt)
  assert.ok(pageSource.indexOf('@layer utilities', heightSpan.start) < heightSpan.end, '高度规则要留在 @layer utilities 里')
  mobileSpanOf(pageSource, pageSource.indexOf('height: 0 !important'))
})

test('collapseSheetToDock is a no-op on desktop', () => {
  const start = pageSource.indexOf('function collapseSheetToDock')
  assert.notEqual(start, -1)
  const body = pageSource.slice(start, start + 1200)
  assert.match(body, /if \(window\.matchMedia\?\.\(PANEL_DESKTOP_MEDIA_QUERY\)\.matches\) return/)
})

test('dock command guard compares the entry snapshot instead of a literal zero', () => {
  // T-033 R9（F-51）：seq 是布局级共享 state，跨访问累加；用进页面时的快照判断「本次访问有没有发过命令」。
  assert.ok(pageSource.includes('\nconst dockCommandSeqOnMount = shellDockCommand.value.seq'), '快照要在 setup 顶层取')
  assert.match(
    pageSource,
    /if \(window\.innerWidth < 768 && shellDockCommand\.value\.seq === dockCommandSeqOnMount\) mobileSheetState\.value = 'collapsed'/
  )
  assert.doesNotMatch(pageSource, /shellDockCommand\.value\.seq === 0\b/)
  // 水合前点过抬起钮（seq 已变）不能被产品默认收起覆盖：紧跟在 sheetHydrated 之后只有这一处收起。
  const hydratedAt = pageSource.indexOf('sheetHydrated.value = true')
  assert.notEqual(hydratedAt, -1)
  const mountedBody = pageSource.slice(hydratedAt, hydratedAt + 600)
  assert.equal(mountedBody.match(/mobileSheetState\.value = 'collapsed'/g)?.length, 1)
  assert.ok(mountedBody.includes('dockCommandSeqOnMount'), '收起条件要跟快照比')
  assert.ok(!mountedBody.includes('const dockCommandSeqOnMount'), '快照不能在 onMounted 里取')
})
