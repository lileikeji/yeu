/**
 * T-036 地图页守门：点搜索框不该把点位面板一并弹出，清空搜索要收回折叠。
 *
 * 可红自证：把 ShellDock.vue 的 @focus="raiseSheet" 加回去，或删掉 collapseSheetOnClearedSearch
 * 里的 previous.trim() 守卫，对应用例立刻变红。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const read = (path: string): string => readFileSync(resolve(path), 'utf8')

const dock = read('app/components/ShellDock.vue')
const mapPage = read('app/pages/map/index.vue')

test('T-036 搜索框聚焦不再抬面板，清空搜索收回折叠', () => {
  // D1：输入框不再发 raise-sheet；显式入口（上箭头按钮）保留
  assert.doesNotMatch(dock, /@focus="raiseSheet"/, '输入框又把聚焦当成输入了')
  assert.match(dock, /@click="raiseSheet"/)
  assert.match(dock, /aria-label="拉起点位面板"/)

  // D2：只在「非空 → 空」这一次跃迁收起，初值空串与无关重渲染不触发
  assert.match(
    mapPage,
    /function collapseSheetOnClearedSearch\(query: string\): boolean \{[\s\S]{0,200}?if \(previous\.trim\(\)\) mobileSheetState\.value = 'collapsed'/,
    '清空路径缺「非空 → 空」守卫，初始空值或重渲染会把面板误收'
  )
  // 清空分支只负责收起；非空分支的自动抬升语义原样保留（CR-11 / CR-14）
  assert.match(mapPage, /if \(collapseSheetOnClearedSearch\(query\)\) return/)
  assert.match(mapPage, /mobileSheetState\.value = resolveDockSearchMobileSheetState\(mobileSheetState\.value\)/)
  assert.match(dock, /if \(searchIsComposing\.value\) return/)
})
