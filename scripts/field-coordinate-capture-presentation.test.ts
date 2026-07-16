import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CoordinateCaptureQuality } from '../shared/utils/coordinate-sampling'
import {
  FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS,
  FIELD_CAPTURE_MIN_DURATION_MS,
  FIELD_CAPTURE_MIN_SAMPLES
} from '../shared/utils/coordinate-sampling'
import {
  resolveFieldCaptureAcceptedSample,
  resolveFieldCaptureQualityDetail,
  resolveFieldCaptureQualityLabel,
  resolveFieldCaptureQualityTone,
  resolveFieldCaptureReadyToSubmit
} from '../app/utils/field-coordinate-capture-presentation'

function quality(
  state: CoordinateCaptureQuality['state'],
  overrides: Partial<CoordinateCaptureQuality> = {}
): CoordinateCaptureQuality {
  return {
    state,
    canSubmit: state === 'ready',
    summary: null,
    ...overrides
  }
}

const readySummary = {
  longitude: 118.6,
  latitude: 24.9,
  medianAccuracyMeters: 8,
  maxSpreadMeters: 3,
  effectiveAccuracyMeters: 8,
  captureDurationMs: 20_000,
  minimumSampleIntervalMs: 2_000
}

describe('field-coordinate-capture-presentation', () => {
  it('resolves quality tone and labels', () => {
    assert.equal(resolveFieldCaptureQualityTone({ quality: quality('ready'), sampleCount: 5 }), 'success')
    assert.equal(resolveFieldCaptureQualityTone({ quality: quality('unstable'), sampleCount: 5 }), 'error')
    assert.equal(resolveFieldCaptureQualityTone({ quality: quality('invalid'), sampleCount: 1 }), 'error')
    assert.equal(resolveFieldCaptureQualityTone({ quality: quality('collecting'), sampleCount: 2 }), 'warning')
    assert.equal(resolveFieldCaptureQualityTone({ quality: quality('collecting'), sampleCount: 0 }), 'neutral')

    assert.equal(
      resolveFieldCaptureQualityLabel({
        quality: quality('ready', { summary: readySummary }),
        latestReportedAccuracy: 12
      }),
      '稳定 · 有效精度 8.0 米'
    )
    assert.equal(
      resolveFieldCaptureQualityLabel({
        quality: quality('collecting', { summary: readySummary }),
        latestReportedAccuracy: 12
      }),
      '有效精度约 8.0 米'
    )
    assert.equal(
      resolveFieldCaptureQualityLabel({
        quality: quality('collecting'),
        latestReportedAccuracy: 15.4
      }),
      '当前定位约 15.4 米'
    )
    assert.equal(
      resolveFieldCaptureQualityLabel({
        quality: quality('collecting'),
        latestReportedAccuracy: null
      }),
      '等待高精度定位'
    )
  })

  it('resolves quality detail by capture state', () => {
    assert.equal(
      resolveFieldCaptureQualityDetail({
        quality: quality('collecting'),
        sampleCount: 0,
        latestReportedAccuracy: FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS + 1
      }),
      '当前修复精度不足，等待 ' + FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS + ' 米以内的定位。'
    )
    assert.equal(
      resolveFieldCaptureQualityDetail({
        quality: quality('collecting'),
        sampleCount: 2,
        latestReportedAccuracy: 10
      }),
      '继续保持静止，至少收录 ' + FIELD_CAPTURE_MIN_SAMPLES + ' 个样本。'
    )
    assert.equal(
      resolveFieldCaptureQualityDetail({
        quality: quality('too-short', {
          summary: { ...readySummary, captureDurationMs: 8_000 }
        }),
        sampleCount: 5,
        latestReportedAccuracy: 8
      }),
      '采样仅持续 8 秒，请继续至 ' + (FIELD_CAPTURE_MIN_DURATION_MS / 1000) + ' 秒。'
    )
    assert.equal(
      resolveFieldCaptureQualityDetail({
        quality: quality('unstable', { summary: readySummary }),
        sampleCount: 5,
        latestReportedAccuracy: 8
      }),
      '样本离散或设备精度超过 ' + FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS + ' 米，请移动到开阔处重采。'
    )
    assert.equal(
      resolveFieldCaptureQualityDetail({
        quality: quality('invalid'),
        sampleCount: 1,
        latestReportedAccuracy: null
      }),
      '样本格式异常，请重采。'
    )
    assert.equal(
      resolveFieldCaptureQualityDetail({
        quality: quality('ready', { summary: readySummary }),
        sampleCount: 5,
        latestReportedAccuracy: 8
      }),
      '采样稳定，可停止并填写现场证据。'
    )
  })

  it('gates ready-to-submit by place match, observation id, quality, and evidence', () => {
    assert.equal(
      resolveFieldCaptureReadyToSubmit({
        matchesCurrentPlace: true,
        clientObservationId: 'obs-1',
        canSubmit: true,
        evidenceNote: '南门左侧标牌'
      }),
      true
    )
    assert.equal(
      resolveFieldCaptureReadyToSubmit({
        matchesCurrentPlace: false,
        clientObservationId: 'obs-1',
        canSubmit: true,
        evidenceNote: '南门左侧标牌'
      }),
      false
    )
    assert.equal(
      resolveFieldCaptureReadyToSubmit({
        matchesCurrentPlace: true,
        clientObservationId: null,
        canSubmit: true,
        evidenceNote: '南门左侧标牌'
      }),
      false
    )
    assert.equal(
      resolveFieldCaptureReadyToSubmit({
        matchesCurrentPlace: true,
        clientObservationId: 'obs-1',
        canSubmit: false,
        evidenceNote: '南门左侧标牌'
      }),
      false
    )
    assert.equal(
      resolveFieldCaptureReadyToSubmit({
        matchesCurrentPlace: true,
        clientObservationId: 'obs-1',
        canSubmit: true,
        evidenceNote: '  门  '
      }),
      false
    )
  })

  it('accepts or rejects sample candidates by accuracy, interval, and timestamp skew', () => {
    const base = {
      longitude: 118.6,
      latitude: 24.9,
      accuracy: 12,
      positionTimestamp: 1_000_000,
      nowMs: 1_000_000,
      lastAcceptedAtMs: 0,
      currentSampleCount: 0,
      maxSamples: 8,
      maxAcceptedAccuracyMeters: FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS,
      minSampleIntervalMs: 2_000
    }

    assert.deepEqual(resolveFieldCaptureAcceptedSample(base), {
      longitude: 118.6,
      latitude: 24.9,
      accuracy: 12,
      capturedAtMs: 1_000_000
    })

    assert.equal(
      resolveFieldCaptureAcceptedSample({
        ...base,
        accuracy: FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS + 1
      }),
      null
    )
    assert.equal(
      resolveFieldCaptureAcceptedSample({
        ...base,
        lastAcceptedAtMs: 999_500,
        minSampleIntervalMs: 2_000
      }),
      null
    )
    assert.equal(
      resolveFieldCaptureAcceptedSample({
        ...base,
        currentSampleCount: 8,
        maxSamples: 8
      }),
      null
    )
    assert.equal(
      resolveFieldCaptureAcceptedSample({
        ...base,
        longitude: Number.NaN
      }),
      null
    )

    const skewFallback = resolveFieldCaptureAcceptedSample({
      ...base,
      positionTimestamp: 1_000_000 - 120_000,
      nowMs: 1_000_000
    })
    assert.deepEqual(skewFallback, {
      longitude: 118.6,
      latitude: 24.9,
      accuracy: 12,
      capturedAtMs: 1_000_000
    })
  })
})
