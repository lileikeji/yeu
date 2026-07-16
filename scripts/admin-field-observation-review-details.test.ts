import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/admin/field-observations.vue'), 'utf8')
const detailsSource = readFileSync(
  resolve('app/components/admin/AdminCoordinateObservationReviewDetails.vue'),
  'utf8'
)

test('review details component owns evidence, map and historical presentation', () => {
  assert.match(detailsSource, /aria-label="选中观测审核详情"/)
  assert.match(detailsSource, /<AdminCoordinateReviewMap\b/)
  assert.match(detailsSource, /buildCoordinateReviewHint\(props\.observation, props\.place\)/)
  assert.match(detailsSource, /observation\.longitude\.toFixed\(7\)/)
  assert.match(detailsSource, /observation\.reviewStatus === 'pending'/)
  assert.match(detailsSource, /observation\.reviewNote \|\| '未填写审核说明。'/)
})

test('review details expose one typed note model and action-specific events', () => {
  assert.match(detailsSource, /defineModel<string>\('reviewNote', \{ default: '' \}\)/)
  assert.match(detailsSource, /review: \[observation: ApiCoordinateObservation, action: 'approve' \| 'reject'\]/)
  assert.match(detailsSource, /emit\('review', observation, 'reject'\)/)
  assert.match(detailsSource, /emit\('review', observation, 'approve'\)/)
  assert.match(detailsSource, /actionId !== null \|\| observation\.accuracyMeters/)
  assert.doesNotMatch(detailsSource, /\$fetch|navigateTo|useRoute|useRouter/)
})

test('field observation page delegates details while preserving notes per observation', () => {
  assert.match(pageSource, /<AdminCoordinateObservationReviewDetails\b/)
  assert.match(pageSource, /v-model:review-note="selectedReviewNote"/)
  assert.match(pageSource, /@review="reviewObservation"/)
  assert.match(pageSource, /reviewNotes\[observationId\] = value/)
  assert.doesNotMatch(pageSource, /<AdminCoordinateReviewMap\b|aria-label="选中观测审核详情"/)
})
