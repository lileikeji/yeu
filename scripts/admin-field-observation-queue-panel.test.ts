import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  formatCoordinateObservationDate,
  getCoordinateObservationPlaceName
} from '../app/utils/field-observation-presentation'

const pageSource = readFileSync(resolve('app/pages/admin/field-observations.vue'), 'utf8')
const panelSource = readFileSync(
  resolve('app/components/admin/AdminCoordinateOfflineQueuePanel.vue'),
  'utf8'
)

test('field observation dates distinguish invalid and valid timestamps', () => {
  assert.equal(formatCoordinateObservationDate(''), '时间无效')
  assert.equal(formatCoordinateObservationDate('invalid'), '时间无效')

  const value = '2026-07-16T08:30:00.000Z'
  const expected = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
  assert.equal(formatCoordinateObservationDate(value), expected)
})

test('offline queue place names have an explicit unknown fallback', () => {
  const places = [
    { id: 'library', name: '图书馆' },
    { id: 'gate', name: '校门' }
  ]
  assert.equal(getCoordinateObservationPlaceName(places, 'library'), '图书馆')
  assert.equal(getCoordinateObservationPlaceName(places, 'missing'), '未知地点')
})

test('field observation page delegates the complete offline queue surface', () => {
  assert.match(pageSource, /<AdminCoordinateOfflineQueuePanel\b/)
  assert.match(pageSource, /v-model:delete-open="deleteQueueOpen"/)
  assert.match(pageSource, /:records="queued"/)
  assert.match(pageSource, /@sync="syncQueue"/)
  assert.match(pageSource, /@retry="retryQueuedObservation"/)
  assert.match(pageSource, /@request-delete="requestQueueDeletion"/)
  assert.match(pageSource, /@confirm-delete="deleteQueuedObservation"/)
  assert.doesNotMatch(pageSource, /expandedQueueId|toggleQueueDetails|function placeName/)
  assert.equal(pageSource.match(/离线观测队列/g)?.length ?? 0, 0)
})

test('offline queue panel owns presentation and emits operations without storage access', () => {
  assert.match(panelSource, /defineModel<boolean>\('deleteOpen', \{ required: true \}\)/)
  assert.match(panelSource, /retry: \[record: QueuedCoordinateObservation\]/)
  assert.match(panelSource, /requestDelete: \[record: QueuedCoordinateObservation\]/)
  assert.match(panelSource, /v-for="record in records"/)
  assert.match(panelSource, /record\.payload\.clientObservationId/)
  assert.match(panelSource, /sample\.accuracyMeters\.toFixed\(1\)/)
  assert.match(panelSource, /records\.some\(record => record\.id === expandedId\.value\)/)
  assert.match(panelSource, /删除后无法从本机队列恢复/)
  assert.doesNotMatch(
    panelSource,
    /\$fetch|enqueueCoordinateObservation|listQueuedCoordinateObservations|removeQueuedCoordinateObservation/
  )
})
