import {
  BROWSER_GEOLOCATION_MAX_SAMPLE_ACCURACY_METERS,
  BROWSER_GEOLOCATION_MAX_SAMPLES,
  BROWSER_GEOLOCATION_MIN_DURATION_MS,
  BROWSER_GEOLOCATION_MIN_SAMPLE_INTERVAL_MS,
  BROWSER_GEOLOCATION_MIN_SAMPLES
} from '../constants/server'

export {
  BROWSER_GEOLOCATION_MAX_SAMPLE_ACCURACY_METERS as FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS,
  BROWSER_GEOLOCATION_MAX_SAMPLES as FIELD_CAPTURE_MAX_SAMPLES,
  BROWSER_GEOLOCATION_MIN_DURATION_MS as FIELD_CAPTURE_MIN_DURATION_MS,
  BROWSER_GEOLOCATION_MIN_SAMPLE_INTERVAL_MS as FIELD_CAPTURE_MIN_SAMPLE_INTERVAL_MS,
  BROWSER_GEOLOCATION_MIN_SAMPLES as FIELD_CAPTURE_MIN_SAMPLES
} from '../constants/server'

export interface CoordinateSampleLike {
  longitude: number
  latitude: number
  accuracyMeters: number
  capturedAt: string
}

export interface CoordinateSampleSummary {
  longitude: number
  latitude: number
  medianAccuracyMeters: number
  maxSpreadMeters: number
  effectiveAccuracyMeters: number
  captureDurationMs: number
  minimumSampleIntervalMs: number
}

export type CoordinateCaptureQualityState
  = | 'collecting'
    | 'too-short'
    | 'unstable'
    | 'invalid'
    | 'ready'

export interface CoordinateCaptureQuality {
  state: CoordinateCaptureQualityState
  canSubmit: boolean
  summary: CoordinateSampleSummary | null
}

function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!
}

function distanceMeters(
  left: Pick<CoordinateSampleLike, 'longitude' | 'latitude'>,
  right: Pick<CoordinateSampleLike, 'longitude' | 'latitude'>
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(right.latitude - left.latitude)
  const longitudeDelta = radians(right.longitude - left.longitude)
  const leftLatitude = radians(left.latitude)
  const rightLatitude = radians(right.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function isValidCoordinateSample(sample: CoordinateSampleLike): boolean {
  return Number.isFinite(sample.longitude)
    && sample.longitude >= -180
    && sample.longitude <= 180
    && Number.isFinite(sample.latitude)
    && sample.latitude >= -90
    && sample.latitude <= 90
    && Number.isFinite(sample.accuracyMeters)
    && sample.accuracyMeters >= 0
    && Number.isFinite(Date.parse(sample.capturedAt))
}

export function summarizeCoordinateSamples(
  samples: CoordinateSampleLike[]
): CoordinateSampleSummary | null {
  if (!samples.length || samples.some(sample => !isValidCoordinateSample(sample))) return null
  const timestamps = samples.map(sample => Date.parse(sample.capturedAt)).sort((left, right) => left - right)
  const longitude = median(samples.map(sample => sample.longitude))
  const latitude = median(samples.map(sample => sample.latitude))
  const medianAccuracyMeters = median(samples.map(sample => sample.accuracyMeters))
  const maxSpreadMeters = Math.max(...samples.map(sample => distanceMeters(
    { longitude, latitude },
    sample
  )))
  const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]!)

  return {
    longitude,
    latitude,
    medianAccuracyMeters,
    maxSpreadMeters,
    effectiveAccuracyMeters: Math.max(medianAccuracyMeters, maxSpreadMeters),
    captureDurationMs: timestamps.at(-1)! - timestamps[0]!,
    minimumSampleIntervalMs: intervals.length ? Math.min(...intervals) : 0
  }
}

export function evaluateCoordinateCapture(
  samples: CoordinateSampleLike[]
): CoordinateCaptureQuality {
  if (!samples.length) return { state: 'collecting', canSubmit: false, summary: null }
  const summary = summarizeCoordinateSamples(samples)
  if (!summary || samples.length > BROWSER_GEOLOCATION_MAX_SAMPLES) {
    return { state: 'invalid', canSubmit: false, summary }
  }
  if (samples.length < BROWSER_GEOLOCATION_MIN_SAMPLES) {
    return { state: 'collecting', canSubmit: false, summary }
  }
  if (summary.captureDurationMs < BROWSER_GEOLOCATION_MIN_DURATION_MS
    || summary.minimumSampleIntervalMs < BROWSER_GEOLOCATION_MIN_SAMPLE_INTERVAL_MS) {
    return { state: 'too-short', canSubmit: false, summary }
  }
  if (samples.some(sample => sample.accuracyMeters > BROWSER_GEOLOCATION_MAX_SAMPLE_ACCURACY_METERS)
    || summary.effectiveAccuracyMeters > BROWSER_GEOLOCATION_MAX_SAMPLE_ACCURACY_METERS) {
    return { state: 'unstable', canSubmit: false, summary }
  }
  return { state: 'ready', canSubmit: true, summary }
}
