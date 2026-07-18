import type {
  CoordinateCaptureQuality,
  CoordinateSampleSummary
} from '../../shared/utils/coordinate-sampling'
import {
  FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS,
  FIELD_CAPTURE_MIN_DURATION_MS,
  FIELD_CAPTURE_MIN_SAMPLES
} from '../../shared/utils/coordinate-sampling'

export type FieldCaptureQualityTone = 'success' | 'error' | 'warning' | 'neutral'

export function resolveFieldCaptureQualityTone(input: {
  quality: CoordinateCaptureQuality
  sampleCount: number
}): FieldCaptureQualityTone {
  if (input.quality.state === 'ready') return 'success'
  if (input.quality.state === 'unstable' || input.quality.state === 'invalid') return 'error'
  if (input.sampleCount > 0) return 'warning'
  return 'neutral'
}

export function resolveFieldCaptureQualityLabel(input: {
  quality: CoordinateCaptureQuality
  latestReportedAccuracy: number | null
}): string {
  const summary = input.quality.summary
  if (input.quality.state === 'ready' && summary) {
    return '稳定 · 有效精度 ' + summary.effectiveAccuracyMeters.toFixed(1) + ' 米'
  }
  if (summary) {
    return '有效精度约 ' + summary.effectiveAccuracyMeters.toFixed(1) + ' 米'
  }
  if (input.latestReportedAccuracy !== null) {
    return '当前定位约 ' + input.latestReportedAccuracy.toFixed(1) + ' 米'
  }
  return '等待高精度定位'
}

export function resolveFieldCaptureQualityDetail(input: {
  quality: CoordinateCaptureQuality
  sampleCount: number
  latestReportedAccuracy: number | null
  maxAcceptedAccuracyMeters?: number
  minSamples?: number
  minDurationMs?: number
}): string {
  const maxAccuracy = input.maxAcceptedAccuracyMeters ?? FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS
  const minSamples = input.minSamples ?? FIELD_CAPTURE_MIN_SAMPLES
  const minDurationMs = input.minDurationMs ?? FIELD_CAPTURE_MIN_DURATION_MS
  const summary = input.quality.summary

  if (
    input.sampleCount === 0
    && input.latestReportedAccuracy !== null
    && input.latestReportedAccuracy > maxAccuracy
  ) {
    return '当前修复精度不足，等待 ' + maxAccuracy + ' 米以内的定位。'
  }
  if (input.quality.state === 'collecting') {
    return '继续保持静止，至少收录 ' + minSamples + ' 个样本。'
  }
  if (input.quality.state === 'too-short' && summary) {
    return '采样仅持续 ' + (summary.captureDurationMs / 1000).toFixed(0) + ' 秒，请继续至 ' + (minDurationMs / 1000) + ' 秒。'
  }
  if (input.quality.state === 'unstable' && summary) {
    return '定位记录分散或设备准确度超过 ' + maxAccuracy + ' 米，请移动到开阔处重新定位。'
  }
  if (input.quality.state === 'invalid') return '定位记录格式异常，请重新定位。'
  return '采样稳定，可停止并填写现场证据。'
}

export function resolveFieldCaptureReadyToSubmit(input: {
  matchesCurrentPlace: boolean
  clientObservationId: string | null
  canSubmit: boolean
  evidenceNote: string
  minEvidenceLength?: number
}): boolean {
  const minLength = input.minEvidenceLength ?? 5
  return input.matchesCurrentPlace
    && input.clientObservationId !== null
    && input.canSubmit
    && input.evidenceNote.trim().length >= minLength
}

export type FieldCaptureSampleCandidate = {
  longitude: number
  latitude: number
  accuracy: number
  capturedAtMs: number
}

export function resolveFieldCaptureAcceptedSample(input: {
  longitude: number
  latitude: number
  accuracy: number
  positionTimestamp: number
  nowMs: number
  lastAcceptedAtMs: number
  currentSampleCount: number
  maxSamples: number
  maxAcceptedAccuracyMeters: number
  minSampleIntervalMs: number
  maxTimestampSkewMs?: number
}): FieldCaptureSampleCandidate | null {
  if (input.currentSampleCount >= input.maxSamples) return null
  if (![input.longitude, input.latitude, input.accuracy].every(Number.isFinite)) return null
  if (input.accuracy < 0 || input.accuracy > 1000) return null

  const maxSkew = input.maxTimestampSkewMs ?? 60_000
  const capturedAtMs = Number.isFinite(input.positionTimestamp)
    && input.positionTimestamp > 0
    && Math.abs(input.nowMs - input.positionTimestamp) <= maxSkew
    ? input.positionTimestamp
    : input.nowMs

  if (input.accuracy > input.maxAcceptedAccuracyMeters) return null
  if (capturedAtMs - input.lastAcceptedAtMs < input.minSampleIntervalMs) return null

  return {
    longitude: input.longitude,
    latitude: input.latitude,
    accuracy: input.accuracy,
    capturedAtMs
  }
}

export type { CoordinateSampleSummary }
