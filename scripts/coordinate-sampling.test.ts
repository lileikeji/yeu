import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateCoordinateCapture,
  FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS,
  FIELD_CAPTURE_MAX_SAMPLES,
  FIELD_CAPTURE_MIN_DURATION_MS,
  FIELD_CAPTURE_MIN_SAMPLES,
  summarizeCoordinateSamples,
  type CoordinateSampleLike
} from '../shared/utils/coordinate-sampling'

function sample(
  seconds: number,
  longitude = 118.605,
  latitude = 25.115,
  accuracyMeters = 8
): CoordinateSampleLike {
  return {
    longitude,
    latitude,
    accuracyMeters,
    capturedAt: new Date(Date.UTC(2026, 6, 14, 0, 0, seconds)).toISOString()
  }
}

test('accepts a stable five-sample field session spanning at least twelve seconds', () => {
  const samples = [
    sample(0, 118.6050000, 25.1150000),
    sample(3, 118.6050001, 25.1150001),
    sample(6, 118.6049999, 25.1149999),
    sample(9, 118.6050001, 25.1149999),
    sample(12, 118.6049999, 25.1150001)
  ]
  const quality = evaluateCoordinateCapture(samples)
  assert.equal(quality.state, 'ready')
  assert.equal(quality.canSubmit, true)
  assert.equal(quality.summary?.captureDurationMs, FIELD_CAPTURE_MIN_DURATION_MS)
  assert.ok((quality.summary?.maxSpreadMeters ?? Infinity) < 1)
  assert.equal(quality.summary?.effectiveAccuracyMeters, 8)
})
test('rejects a burst of samples even when the reported accuracy looks good', () => {
  const quality = evaluateCoordinateCapture([
    sample(0), sample(1), sample(2), sample(3), sample(4)
  ])
  assert.equal(quality.state, 'too-short')
  assert.equal(quality.canSubmit, false)
})

test('uses spatial spread when it is worse than the device accuracy estimate', () => {
  const samples = [
    sample(0), sample(3), sample(6), sample(9),
    sample(12, 118.606, 25.116)
  ]
  const summary = summarizeCoordinateSamples(samples)!
  assert.ok(summary.maxSpreadMeters > 100)
  assert.equal(summary.effectiveAccuracyMeters, summary.maxSpreadMeters)
  assert.equal(evaluateCoordinateCapture(samples).state, 'unstable')
})

test('rejects malformed coordinates and documents the browser capture thresholds', () => {
  assert.equal(evaluateCoordinateCapture([
    sample(0), sample(3), sample(6), sample(9), sample(12, 999, 25.115)
  ]).state, 'invalid')
  assert.equal(FIELD_CAPTURE_MIN_SAMPLES, 5)
  assert.equal(FIELD_CAPTURE_MAX_SAMPLES, 7)
  assert.equal(FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS, 25)
})
