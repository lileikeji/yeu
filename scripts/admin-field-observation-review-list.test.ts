import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/admin/field-observations.vue'), 'utf8')
const listSource = readFileSync(
  resolve('app/components/admin/AdminCoordinateObservationReviewList.vue'),
  'utf8'
)
const e2eSource = readFileSync(resolve('tests/e2e/admin-feedback-flows.spec.ts'), 'utf8')

test('review list owns filters, rows, pagination and empty/loading states', () => {
  assert.match(listSource, /aria-label="搜索定位地点"/)
  assert.match(listSource, /aria-label="筛选审核状态"/)
  assert.match(listSource, /v-for="observation in observations"/)
  assert.match(listSource, /observationStatusLabel\(observation\.reviewStatus\)/)
  assert.match(listSource, /goToPreviousPage/)
  assert.match(listSource, /goToNextPage/)
  assert.match(listSource, /当前条件下暂无定位记录/)
  assert.match(listSource, /<slot name="details"/)
})

test('review list exposes typed models and one search event without side effects', () => {
  assert.match(listSource, /defineModel<string>\('searchInput'/)
  assert.match(listSource, /defineModel<ObservationStatusFilter>\('status'/)
  assert.match(listSource, /defineModel<number>\('pageSize'/)
  assert.match(listSource, /defineModel<number>\('page'/)
  assert.match(listSource, /defineModel<string \| null>\('selectedObservationId'/)
  assert.match(listSource, /applySearch: \[\]/)
  assert.match(listSource, /emit\('applySearch'\)/)
  assert.doesNotMatch(listSource, /\$fetch|navigateTo|useRoute|useRouter|watch\(/)
})

test('field observation page delegates list models and browser coverage', () => {
  assert.match(pageSource, /<AdminCoordinateObservationReviewList\b/)
  assert.match(pageSource, /v-model:search-input="observationSearchInput"/)
  assert.match(pageSource, /v-model:selected-observation-id="selectedObservationId"/)
  assert.match(pageSource, /@apply-search="applyObservationSearch"/)
  assert.match(pageSource, /<template #details>/)
  assert.doesNotMatch(pageSource, /aria-label="搜索定位地点"|observationStatusOptions/)
  assert.match(e2eSource, /getByLabel\('搜索定位地点'\)/)
  assert.match(e2eSource, /getByText\('当前条件下暂无定位记录'\)/)
})
