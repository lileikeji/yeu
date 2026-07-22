import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  filterGuideListItems,
  guideCategoryIconTones,
  guideListCategories,
  guideListFallbackMessages,
  guideListMessages,
  guideListReadMinutesLabel,
  guideListStatusDotClass,
  guideListStatusToneClass,
  guideNeedShortcuts,
  isGuideNeedShortcutActive,
  previewGuideListItems,
  resolveGuideListFallbackMessage
} from '../app/utils/guide-list-presentation'

const pageSource = readFileSync(resolve('app/pages/guides/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/guide-list-presentation.ts'), 'utf8')

test('guide list page is a thin shell over guide-list-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/guide-list-presentation['"]/)
  assert.match(pageSource, /filterGuideListItems/)
  assert.match(pageSource, /resolveGuideListFallbackMessage/)
  assert.match(pageSource, /guideListCategories/)
  assert.match(pageSource, /guideCategoryIconTones/)
  assert.match(pageSource, /guideNeedShortcuts/)
  assert.match(pageSource, /guideListMessages/)
  assert.match(pageSource, /guideListReadMinutesLabel/)
  assert.match(pageSource, /guideListStatusDotClass/)
  assert.match(pageSource, /guideListStatusToneClass/)
  assert.match(pageSource, /isGuideNeedShortcutActive/)
  assert.doesNotMatch(pageSource, /const categories = \[/)
  assert.doesNotMatch(pageSource, /const iconTone:/)
  assert.doesNotMatch(pageSource, /function filterGuideListItems/)
  assert.match(utilSource, /export function filterGuideListItems/)
  assert.match(utilSource, /export function resolveGuideListFallbackMessage/)
  assert.match(utilSource, /export const guideListCategories/)
  assert.match(utilSource, /export const guideNeedShortcuts/)
})

test('guide search keeps a comfortable mobile touch height', () => {
  assert.match(pageSource, /aria-label="搜索新生指南"\s+class="min-h-11 w-full"\s+:ui="\{ base: 'min-h-11' \}"/)
  assert.match(pageSource, /placeholder="搜索报到、校园网、图书馆…"/)
  assert.doesNotMatch(pageSource, /placeholder="[^"]{18,}"/)
})

test('guide heading and introduction stay balanced on narrow phones', () => {
  assert.match(pageSource, /从报到到开学后的常用事项/)
  assert.match(pageSource, /本科和专升本的安排会分开说明/)
  assert.doesNotMatch(pageSource, /从到校前到开学后的常用事项/)
})

test('guide categories fit the mobile width and use direct interactions', () => {
  assert.match(pageSource, /const activeCategory = ref<GuideListCategoryId>\('all'\)/)
  assert.match(pageSource, /class="grid grid-cols-5 gap-1 md:flex"/)
  assert.match(pageSource, /:ui="\{ leadingIcon: 'hidden md:block' \}"/)
  assert.match(pageSource, /@click="selectGuideCategory\(category\.id\)"/)
  assert.match(pageSource, /@click="clearGuideSearch"/)
  assert.doesNotMatch(pageSource, /overflow-x-auto/)
})

test('guide need shortcuts help students start from real tasks', () => {
  assert.deepEqual(
    guideNeedShortcuts.map(item => [item.label, item.query, item.category]),
    [
      ['报到', '报到', 'arrival'],
      ['费用资助', '学费', 'arrival'],
      ['校园网', '校园网', 'campus'],
      ['图书馆', '图书馆', 'campus'],
      ['快递', '快递', 'life'],
      ['社团', '社团', 'community']
    ]
  )
  assert.match(pageSource, /按要办的事找/)
  assert.match(pageSource, /selectGuideNeed\(shortcut\)/)
  assert.match(pageSource, /class="min-h-11 rounded-md border/)
  assert.equal(
    isGuideNeedShortcutActive(guideNeedShortcuts[0], { query: '报到', category: 'arrival' }),
    true
  )
  assert.equal(
    isGuideNeedShortcutActive(guideNeedShortcuts[0], { query: '报到', category: 'all' }),
    false
  )
})

test('guide cards show readiness badge, current status, and reading time', () => {
  assert.match(pageSource, /class="surface-panel group flex min-h-0 flex-col p-4[^"]*md:min-h-56 md:p-5"/)
  assert.match(pageSource, /line-clamp-2[^"]*md:line-clamp-none/)
  assert.match(pageSource, /guideStatePresentation\(guide\.status\)\.label/)
  assert.match(pageSource, /guideListStatusDotClass\(guide\.status\)/)
  assert.match(pageSource, /guideListStatusToneClass\(guide\.status\)/)
  assert.match(pageSource, /目前：/)
  assert.match(pageSource, /studentFacingGuideStatusText\(guide\.statusText\)/)
  assert.match(pageSource, /guideListReadMinutesLabel\(guide\.readMinutes\)/)
  assert.match(pageSource, /guideListMessages\.openGuide/)
  assert.doesNotMatch(pageSource, />\s*打开\s*<UIcon/)
  assert.equal(guideListReadMinutesLabel(3), '约 3 分钟')
  assert.equal(guideListReadMinutesLabel(0), '约 1 分钟')
  assert.equal(guideListStatusDotClass('verified'), 'bg-emerald-500')
  assert.equal(guideListStatusDotClass('awaiting-notice'), 'bg-amber-400')
  assert.equal(guideListStatusToneClass('partial'), 'text-zinc-600')
})

test('guide list categories and fallback messages stay student-facing', () => {
  assert.equal(guideListCategories[0]?.id, 'all')
  assert.equal(guideListCategories.length, 5)
  assert.ok(guideListCategories.some(item => item.id === 'arrival' && item.label === '入学'))
  assert.equal(guideCategoryIconTones.arrival, 'bg-green-50 text-green-700')
  assert.equal(guideListFallbackMessages.serviceUnavailable, '可以稍后再试，也可以先查看校园地图和常用部门。')
  assert.match(guideListFallbackMessages.staticGuide, /已经整理好的指南/)
  assert.equal(guideListMessages.emptyMatchTitle, '没有找到相关指南')
  assert.match(guideListMessages.emptyMatchHint, /校园地图和办事入口/)
  assert.equal(guideListMessages.openGuide, '打开指南')
})

test('guide list filter and fallback resolution', () => {
  const guides = [
    {
      category: 'arrival',
      title: '报到指南',
      shortTitle: '报到',
      summary: '核对材料和时间',
      audience: ['本科新生'],
      statusText: '报到日期已确认'
    },
    {
      category: 'life',
      title: '快递外卖',
      shortTitle: '快递',
      summary: '校内外快递点',
      audience: ['本科新生', '专升本'],
      statusText: '站点和配送规则还要到现场确认'
    }
  ]

  assert.deepEqual(
    filterGuideListItems(guides, { query: '', category: 'all' }).map(item => item.title),
    ['报到指南', '快递外卖']
  )
  assert.deepEqual(
    filterGuideListItems(guides, { query: '快递', category: 'all' }).map(item => item.title),
    ['快递外卖']
  )
  assert.deepEqual(
    filterGuideListItems(guides, { query: '本科', category: 'arrival' }).map(item => item.title),
    ['报到指南']
  )
  assert.deepEqual(
    filterGuideListItems(guides, { query: '现场确认', category: 'all' }).map(item => item.title),
    ['快递外卖']
  )
  assert.deepEqual(
    filterGuideListItems(guides, { query: '社团', category: 'all' }),
    []
  )

  assert.equal(
    resolveGuideListFallbackMessage({ hasError: true, response: null, allowStaticFallback: false }),
    '可以稍后再试，也可以先查看校园地图和常用部门。'
  )
  assert.equal(
    resolveGuideListFallbackMessage({ hasError: false, response: null, allowStaticFallback: false }),
    null
  )
  assert.match(pageSource, /指南暂时没有显示出来/)
  assert.match(pageSource, /label="重新试一次"/)
  assert.match(pageSource, /label="打开校园地图"/)
  assert.match(pageSource, /label="查看常用部门"/)
  assert.match(pageSource, /!publicGuideError && !filteredGuides\.length/)
  assert.match(pageSource, /guideListMessages\.emptyMatchTitle/)
  assert.match(pageSource, /label="查看办事流程"/)
  assert.equal(
    resolveGuideListFallbackMessage({
      hasError: false,
      response: { items: [] },
      allowStaticFallback: true
    }),
    guideListFallbackMessages.staticGuide
  )
  assert.equal(
    resolveGuideListFallbackMessage({
      hasError: false,
      response: { items: [] },
      allowStaticFallback: false
    }),
    '指南还在整理，过一会再来看看。'
  )
  assert.equal(
    resolveGuideListFallbackMessage({
      hasError: false,
      response: { items: [{ id: '1' }] },
      allowStaticFallback: false
    }),
    null
  )
})

test('guide list preview stays compact until the reader searches, filters, or expands', () => {
  const guides = Array.from({ length: 8 }, (_, index) => index + 1)
  assert.deepEqual(
    previewGuideListItems(guides, { expanded: false, query: '', category: 'all' }),
    [1, 2, 3, 4, 5, 6]
  )
  assert.deepEqual(
    previewGuideListItems(guides, { expanded: true, query: '', category: 'all' }),
    guides
  )
  assert.deepEqual(
    previewGuideListItems(guides, { expanded: false, query: '校园网', category: 'all' }),
    guides
  )
  assert.deepEqual(
    previewGuideListItems(guides, { expanded: false, query: '', category: 'campus' }),
    guides
  )
})
