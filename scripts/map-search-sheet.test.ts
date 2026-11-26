/**
 * T-036 地图页守门：点搜索框不该把点位面板一并弹出，清空搜索要收回折叠。
 * T-037 CR-9 / CR-10：负向断言收窄到「搜索地点」那个 input 标签本身，判定改成纯函数行为测试。
 *
 * 可红自证：把 ShellDock.vue 的 @focus="raiseSheet" 加回去，或把 resolveDockClearSheetAction 的
 * 'collapse' 分支删掉，对应用例立刻变红。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { resolveDockClearSheetAction, resolvePinReselect } from '../app/utils/map-presentation'

function read(path: string): string {
  return readFileSync(resolve(path), 'utf8')
}

const dock = read('app/components/ShellDock.vue')
const mapPage = read('app/pages/map/index.vue')

/** 截出含 marker 的那一个完整标签，免得别处的同名属性替它作证。 */
function tagAround(source: string, marker: string): string {
  const at = source.indexOf(marker)
  assert.ok(at > -1, `missing ${marker}`)
  const start = source.lastIndexOf('<', at)
  const end = source.indexOf('>', at)
  assert.ok(start > -1 && end > at, `malformed tag around ${marker}`)
  return source.slice(start, end + 1)
}

test('T-036 搜索框聚焦不再抬面板，清空搜索收回折叠', () => {
  const searchTag = tagAround(dock, 'aria-label="搜索地点"')
  assert.doesNotMatch(searchTag, /@focus/, '输入框又把聚焦当成输入了')
  const raiseTag = tagAround(dock, 'aria-label="拉起点位面板"')
  assert.match(raiseTag, /@click="raiseSheet"/)
  // 2026-11-23 用户：「点搜索框旁边的箭头展不开面板」——箭头必须两级抬升，
  // 折叠→半屏、半屏→展开，而不是永远停在半屏。
  assert.match(
    mapPage,
    /kind !== 'raise-sheet'[\s\S]{0,320}?mobileSheetState\.value === 'half' \? 'expanded' : 'half'/,
    '箭头又变成只会抬到半屏了'
  )
  // 组词期间不改面板（CR-14）。
  assert.match(dock, /if \(searchIsComposing\.value\) return/)
})

test('2026-11-24 输入期间不抬面板，只有回车/搜索键提交才抬', () => {
  const searchTag = tagAround(dock, 'aria-label="搜索地点"')
  assert.match(searchTag, /@keydown\.enter="onSearchEnter"/, '回车要能提交搜索（输入法组词期间不提交）')
  assert.doesNotMatch(searchTag, /@input="[^"]*raiseSheet/, '输入事件又去抬面板了')
  assert.match(dock, /function submitSearch\(\): void \{[\s\S]{0,140}?kind: 'search-submit'/)
  // 打字期页面的 rise 分支必须空转；抬升只发生在显式提交命令里。
  assert.match(mapPage, /if \(action === 'rise'\) return/)
  assert.match(mapPage, /if \(kind === 'search-submit'\) \{[\s\S]{0,140}?raiseMobileSheetForSearch\(\)/)
  // dock 在 layout 里，够不到 .map-workspace 那条规则，原生搜索叉要和它并进同一处隐藏。
  assert.match(mapPage, /\.shell-dock-search input\[type='search'\]::-webkit-search-cancel-button,/)
})

test('T-037 CR-10 清空搜索判定是纯函数，桌面也不再漏掉 previous', () => {
  assert.equal(resolveDockClearSheetAction('', ''), 'none')
  assert.equal(resolveDockClearSheetAction('  ', ''), 'none')
  assert.equal(resolveDockClearSheetAction('', '图书'), 'rise')
  assert.equal(resolveDockClearSheetAction('图书', ''), 'collapse')
  assert.equal(resolveDockClearSheetAction('图书', '图书馆'), 'rise')

  const watchAt = mapPage.indexOf('watch(searchQuery, (query) => {')
  assert.ok(watchAt > -1, 'searchQuery watch exists')
  const body = mapPage.slice(watchAt, mapPage.indexOf('function onMobileDockSearchInput', watchAt))
  // CR-8：previous 先推进、再判桌面；否则桌面输入过词、切回手机清空会被当成空→空。
  assert.ok(
    body.indexOf('lastDockSearchQuery = query') < body.indexOf('if (panelIsDesktop.value) return'),
    'previous 必须在桌面早退之前推进'
  )
  assert.match(body, /resolveDockClearSheetAction\(previous, query\)/)
  assert.match(mapPage, /mobileSheetState\.value = resolveDockSearchMobileSheetState\(mobileSheetState\.value\)/)
  // 手写守卫已退场，清空搜索只剩纯函数一条路径。
  assert.doesNotMatch(mapPage, /collapseSheetOnClearedSearch/)
})

test('T-037 CR-4 同一点位连点按窗口吞掉，换点位或超窗正常打开', () => {
  const record = { kind: 'place', id: 'p1', at: 1000 }
  assert.equal(resolvePinReselect(record, { kind: 'place', id: 'p1' }, 1100), 'swallow')
  assert.equal(resolvePinReselect(record, { kind: 'place', id: 'p1' }, 1400), 'swallow')
  assert.equal(resolvePinReselect(record, { kind: 'place', id: 'p2' }, 1100), 'other')
  assert.equal(resolvePinReselect(record, { kind: 'bus', id: 'p1' }, 1100), 'other')
  assert.equal(resolvePinReselect(record, { kind: 'place', id: 'p1' }, 1401), 'expired')
  assert.equal(resolvePinReselect(null, { kind: 'place', id: 'p1' }, 1100), 'other')
  // 页面侧只保留记录与清记录，判定交给纯函数。
  assert.match(mapPage, /resolvePinReselect\(record, selection, Date\.now\(\)\)/)
  assert.match(mapPage, /if \(selection && swallowDismissedPinSelection\(selection\)\) return/)
})
