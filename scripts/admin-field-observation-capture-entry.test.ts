import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/admin/field-observations.vue'), 'utf8')
const entrySource = readFileSync(
  resolve('app/components/admin/AdminCoordinateCaptureEntry.vue'),
  'utf8'
)
const captureSource = readFileSync(
  resolve('app/components/admin/AdminFieldCoordinateCapture.vue'),
  'utf8'
)
const e2eSource = readFileSync(resolve('tests/e2e/admin-feedback-flows.spec.ts'), 'utf8')

test('capture entry owns place selection, queue shortcut and empty state', () => {
  assert.match(entrySource, /defineModel<string>\('selectedPlaceId'/)
  assert.match(entrySource, /props\.places\.map\(place =>/)
  assert.match(entrySource, /aria-label="选择采点地点"/)
  assert.match(entrySource, /:label="`\$\{queuedCount\} 条本地待同步`"/)
  assert.match(entrySource, /emit\('sync'\)/)
  assert.match(entrySource, /暂无可采点地点/)
})

test('capture entry keeps the selector locked for an active child session', () => {
  assert.match(entrySource, /const sessionLocked = ref\(false\)/)
  assert.match(entrySource, /:disabled="sessionLocked \|\| submitting"/)
  assert.match(entrySource, /@session-lock-change="setSessionLocked"/)
  assert.match(captureSource, /watch\(sessionLocked, locked => emit\('sessionLockChange', locked\)/)
  assert.match(captureSource, /capturePlaceId\.value = props\.placeId/)
})

test('capture entry forwards submissions and exposes markSubmitted safely', () => {
  assert.match(entrySource, /submit: \[payload: CreateCoordinateObservationPayload\]/)
  assert.match(entrySource, /@submit="emit\('submit', \$event\)"/)
  assert.match(entrySource, /capture\.value\?\.markSubmitted\(placeId\)/)
  assert.match(entrySource, /defineExpose\(\{ markSubmitted \}\)/)
  assert.doesNotMatch(entrySource, /\$fetch|navigateTo|useRoute|useRouter|navigator\.geolocation/)
})

test('field observation page delegates capture entry and browser accessibility', () => {
  assert.match(pageSource, /<AdminCoordinateCaptureEntry\b/)
  assert.match(pageSource, /v-model:selected-place-id="selectedPlaceId"/)
  assert.match(pageSource, /markSubmitted: placeId => captureEntry\.value\?\.markSubmitted\(placeId\)/)
  assert.match(pageSource, /@submit="submitObservation"/)
  assert.match(pageSource, /@sync="syncQueue"/)
  assert.doesNotMatch(pageSource, /<AdminFieldCoordinateCapture\b|captureSessionLocked/)
  assert.match(e2eSource, /getByLabel\('选择采点地点'\)/)
})
