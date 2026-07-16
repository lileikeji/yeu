import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  filterGuideListItems,
  guideCategoryIconTones,
  guideListCategories,
  guideListFallbackMessages,
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
  assert.doesNotMatch(pageSource, /const categories = \[/)
  assert.doesNotMatch(pageSource, /const iconTone:/)
  assert.doesNotMatch(pageSource, /function filterGuideListItems/)
  assert.match(utilSource, /export function filterGuideListItems/)
  assert.match(utilSource, /export function resolveGuideListFallbackMessage/)
  assert.match(utilSource, /export const guideListCategories/)
})

test('guide list categories and fallback messages stay student-facing', () => {
  assert.equal(guideListCategories[0]?.id, 'all')
  assert.equal(guideListCategories.length, 5)
  assert.ok(guideListCategories.some(item => item.id === 'arrival' && item.label === '入学'))
  assert.equal(guideCategoryIconTones.arrival, 'bg-green-50 text-green-700')
  assert.equal(guideListFallbackMessages.serviceUnavailable, '指南服务暂时不可用，请稍后重试。')
  assert.match(guideListFallbackMessages.staticGuide, /当前显示已整理的新生指南/)
})

test('guide list filter and fallback resolution', () => {
  const guides = [
    {
      category: 'arrival',
      title: '报到指南',
      shortTitle: '报到',
      summary: '核对材料和时间',
      audience: ['本科新生']
    },
    {
      category: 'life',
      title: '快递外卖',
      shortTitle: '快递',
      summary: '校内外快递点',
      audience: ['本科新生', '专升本']
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
    filterGuideListItems(guides, { query: '社团', category: 'all' }),
    []
  )

  assert.equal(
    resolveGuideListFallbackMessage({ hasError: true, response: null, allowStaticFallback: false }),
    '指南服务暂时不可用，请稍后重试。'
  )
  assert.equal(
    resolveGuideListFallbackMessage({ hasError: false, response: null, allowStaticFallback: false }),
    null
  )
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
    '指南正在整理中，暂时没有可公开展示的新记录。'
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
