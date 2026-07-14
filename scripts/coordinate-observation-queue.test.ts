import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import {
  ensureCoordinateObservationClientId,
  type NewCoordinateObservationPayload
} from '../app/utils/coordinate-observation-queue'

function observationPayload(): NewCoordinateObservationPayload {
  return {
    placeId: randomUUID(),
    coordinateSystem: 'WGS84',
    captureMethod: 'browser-geolocation',
    pointRole: 'main-entrance',
    evidenceNote: 'Main entrance sign verified on site.',
    samples: [{
      longitude: 118.605,
      latitude: 25.112,
      accuracyMeters: 8,
      capturedAt: new Date().toISOString()
    }]
  }
}

test('creates a client observation id for a fresh capture', () => {
  const result = ensureCoordinateObservationClientId(observationPayload())
  assert.match(result.clientObservationId, /^[0-9a-f-]{36}$/i)
})

test('preserves the client observation id across retries', () => {
  const clientObservationId = randomUUID()
  const result = ensureCoordinateObservationClientId({
    ...observationPayload(),
    clientObservationId
  })
  assert.equal(result.clientObservationId, clientObservationId)
})
