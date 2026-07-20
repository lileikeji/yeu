import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildChecklistOverview,
  buildHomeChecklistSummary,
  checklistAudienceOptions,
  checklistItems,
  checklistStages,
  createEmptyChecklistProgress,
  filterChecklistItems,
  parseChecklistProgress,
  percentComplete,
  serializeChecklistProgress,
  toggleCompletedId
} from '../app/utils/checklist-presentation'

const pageSource = readFileSync(resolve('app/pages/checklist.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/checklist-presentation.ts'), 'utf8')
const composableSource = readFileSync(resolve('app/composables/useFreshmanChecklist.ts'), 'utf8')

test('checklist page is a thin shell over presentation + local composable', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/checklist-presentation['"]/)
  assert.match(pageSource, /checklistAudienceOptions/)
  assert.match(pageSource, /清单进度只保存在这台设备，换设备或清除本地记录后会丢失。/)
  assert.doesNotMatch(pageSource, /清除本站数据/)
  assert.match(pageSource, /useFreshmanChecklist/)
  assert.doesNotMatch(pageSource, /const checklistItems = \[/)
  assert.match(utilSource, /export const checklistItems/)
  assert.match(utilSource, /export function buildChecklistOverview/)
  assert.match(composableSource, /CHECKLIST_STORAGE_KEY/)
  assert.match(composableSource, /localStorage/)
  assert.match(composableSource, /export function useFreshmanChecklist/)
})

test('checklist catalog covers stages and keeps transfer-only items scoped', () => {
  assert.equal(checklistStages.length, 5)
  assert.ok(checklistItems.length >= 20)
  assert.ok(checklistItems.every(item => item.id && item.title && item.stageId && item.icon))
  assert.ok(checklistItems.some(item => item.to === '/map'))
  assert.ok(checklistItems.some(item => item.to === '/procedures/arrival'))
  assert.ok(checklistItems.some(item => item.awaitingNotice === true))

  const allCount = filterChecklistItems(checklistItems, 'all').length
  const undergradCount = filterChecklistItems(checklistItems, 'undergraduate').length
  const transferCount = filterChecklistItems(checklistItems, 'transfer').length
  assert.ok(allCount > undergradCount)
  assert.ok(transferCount > undergradCount)
  assert.ok(filterChecklistItems(checklistItems, 'undergraduate').every(item => item.audience.includes('undergraduate')))
  assert.ok(filterChecklistItems(checklistItems, 'transfer').some(item => item.id.includes('transfer')))
  assert.equal(checklistAudienceOptions.length, 3)
})

test('checklist progress helpers stay pure and drop unknown ids', () => {
  assert.equal(percentComplete(1, 4), 25)
  assert.equal(percentComplete(0, 0), 0)
  assert.deepEqual(toggleCompletedId(['a'], 'b', true).sort(), ['a', 'b'])
  assert.deepEqual(toggleCompletedId(['a', 'b'], 'a', false), ['b'])

  const empty = createEmptyChecklistProgress()
  assert.deepEqual(empty.completedIds, [])
  assert.equal(empty.audience, 'all')

  const parsed = parseChecklistProgress({
    completedIds: ['save-admission-notice', 'not-a-real-id', 'save-admission-notice', 12],
    audience: 'transfer',
    updatedAt: '2026-07-17T00:00:00.000Z'
  })
  assert.deepEqual(parsed.completedIds, ['save-admission-notice'])
  assert.equal(parsed.audience, 'transfer')
  assert.equal(parseChecklistProgress(null).audience, 'all')
  assert.equal(parseChecklistProgress({ audience: 'nope' }).audience, 'all')

  const roundTrip = parseChecklistProgress(JSON.parse(serializeChecklistProgress(parsed)))
  assert.deepEqual(roundTrip.completedIds, parsed.completedIds)
  assert.equal(roundTrip.audience, 'transfer')
})

test('checklist overview and home summary reflect completed progress', () => {
  const overview = buildChecklistOverview(['save-admission-notice'], 'all')
  assert.ok(overview.totalCount > 0)
  assert.equal(overview.completedCount, 1)
  assert.ok(overview.percent > 0)
  assert.ok(overview.nextItem)
  assert.ok(overview.tasks.length >= 3)
  assert.equal(overview.packing.stage.id, 'packing')
  assert.ok(overview.packing.totalCount > 0)

  const transferOnly = buildChecklistOverview([], 'transfer')
  const undergradOnly = buildChecklistOverview([], 'undergraduate')
  assert.ok(transferOnly.totalCount > undergradOnly.totalCount)

  const summary = buildHomeChecklistSummary(['save-admission-notice'], 'all')
  assert.equal(summary.to, '/checklist')
  assert.equal(summary.percent, overview.percent)
  assert.equal(summary.remainingCount, overview.remainingCount)
  assert.ok(summary.nextTitle)
})

test('checklist only offers clearing after an item has been checked', () => {
  assert.match(pageSource, /v-if="overview\.completedCount > 0 && !confirmReset"/)
  assert.match(pageSource, /v-else-if="confirmReset"/)
  assert.doesNotMatch(pageSource, /:disabled="overview\.completedCount === 0"/)
})
