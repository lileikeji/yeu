import type {
  ApiCoordinateObservation,
  ApiCoordinateSample,
  ApiPlace
} from '~~/shared/types/server'
import { coordinateDistanceMeters } from './field-observation-review'

export const COORDINATE_REVIEW_EARTH_RADIUS_METERS = 6_371_000
export const COORDINATE_REVIEW_NEIGHBOR_LIMIT = 8
export const COORDINATE_REVIEW_ACCURACY_SEGMENTS = 64

export interface ReviewMapPoint {
  longitude: number
  latitude: number
}

export type ReviewFeatureKind = 'sample' | 'result' | 'current' | 'neighbor'

export interface ReviewFeatureProperties {
  kind: ReviewFeatureKind
  label: string
  sampleIndex: number
}

export interface ReviewPointFeature {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: ReviewFeatureProperties
}

export interface ReviewPointCollection {
  type: 'FeatureCollection'
  features: ReviewPointFeature[]
}

export interface ReviewPolygonCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: {
      type: 'Polygon'
      coordinates: [number, number][][]
    }
    properties: Record<string, never>
  }>
}

export type RenderableWgs84Place = ApiPlace & {
  longitude: number
  latitude: number
  coordinateSystem: 'WGS84'
}

export interface NeighborReviewPlace {
  place: RenderableWgs84Place
  distance: number
}

export interface ReviewMapBounds {
  west: number
  south: number
  east: number
  north: number
}

export type ReviewMapFitDecision
  = { kind: 'none' }
    | { kind: 'fly-to', center: [number, number], zoom: number }
    | {
      kind: 'fit-bounds'
      bounds: [[number, number], [number, number]]
      padding: number
      maxZoom: number
    }

export function hasRenderableWgs84Coordinates(place: ApiPlace): place is RenderableWgs84Place {
  return place.coordinateSystem === 'WGS84'
    && place.longitude !== null
    && place.latitude !== null
    && Number.isFinite(place.longitude)
    && Number.isFinite(place.latitude)
}

export function isVerifiedRenderableWgs84Place(place: ApiPlace): place is RenderableWgs84Place {
  return place.coordinateVerification === 'verified'
    && hasRenderableWgs84Coordinates(place)
}

export function resolveCurrentPlacePoint(place: ApiPlace | null): ReviewMapPoint | null {
  if (!place || !hasRenderableWgs84Coordinates(place)) return null
  return {
    longitude: place.longitude,
    latitude: place.latitude
  }
}

export function resolveCurrentPlacePointLabel(place: ApiPlace | null): string {
  return place?.coordinateVerification === 'verified'
    ? '当前双重核验坐标'
    : '首条已批准候选'
}

export function isCurrentCoordinateNotDisplayable(place: ApiPlace | null): boolean {
  return place !== null
    && place.longitude !== null
    && place.latitude !== null
    && place.coordinateSystem !== 'WGS84'
}

export function selectNeighboringReviewPlaces(input: {
  observation: Pick<ApiCoordinateObservation, 'placeId' | 'placeScope' | 'longitude' | 'latitude'>
  places: ApiPlace[]
  limit?: number
}): NeighborReviewPlace[] {
  const origin = {
    longitude: input.observation.longitude,
    latitude: input.observation.latitude
  }
  const limit = input.limit ?? COORDINATE_REVIEW_NEIGHBOR_LIMIT

  return input.places
    .filter(place => place.id !== input.observation.placeId
      && place.scope === input.observation.placeScope)
    .filter(isVerifiedRenderableWgs84Place)
    .map(place => ({
      place,
      distance: coordinateDistanceMeters(origin, {
        longitude: place.longitude,
        latitude: place.latitude
      })
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit)
}

export function buildEmptyReviewFeatureCollection(): ReviewPointCollection {
  return {
    type: 'FeatureCollection',
    features: []
  }
}

export function buildCoordinateReviewPointCollection(input: {
  observation: Pick<ApiCoordinateObservation, 'longitude' | 'latitude' | 'samples'>
  currentPlacePoint: ReviewMapPoint | null
  currentPlacePointLabel: string
  neighboringPlaces: Array<{ place: Pick<RenderableWgs84Place, 'longitude' | 'latitude' | 'name'> }>
}): ReviewPointCollection {
  const features: ReviewPointFeature[] = input.observation.samples.map((sample, index) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [sample.longitude, sample.latitude]
    },
    properties: {
      kind: 'sample',
      label: `样本 ${index + 1}`,
      sampleIndex: index + 1
    }
  }))

  features.push({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [input.observation.longitude, input.observation.latitude]
    },
    properties: {
      kind: 'result',
      label: '计算结果',
      sampleIndex: 0
    }
  })

  if (input.currentPlacePoint) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          input.currentPlacePoint.longitude,
          input.currentPlacePoint.latitude
        ]
      },
      properties: {
        kind: 'current',
        label: input.currentPlacePointLabel,
        sampleIndex: 0
      }
    })
  }

  for (const { place } of input.neighboringPlaces) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [place.longitude, place.latitude]
      },
      properties: {
        kind: 'neighbor',
        label: place.name,
        sampleIndex: 0
      }
    })
  }

  return { type: 'FeatureCollection', features }
}

export function buildCoordinateReviewAccuracyCircle(input: {
  longitude: number
  latitude: number
  accuracyMeters: number
  segments?: number
}): ReviewPolygonCollection {
  const center = {
    longitude: input.longitude,
    latitude: input.latitude
  }
  const radius = Math.max(1, input.accuracyMeters)
  const segments = input.segments ?? COORDINATE_REVIEW_ACCURACY_SEGMENTS
  const latitudeRadians = center.latitude * Math.PI / 180
  const points: [number, number][] = []

  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2
    const latitudeOffset = Math.sin(angle) * radius / COORDINATE_REVIEW_EARTH_RADIUS_METERS * 180 / Math.PI
    const longitudeOffset = Math.cos(angle) * radius / (
      COORDINATE_REVIEW_EARTH_RADIUS_METERS * Math.max(0.01, Math.cos(latitudeRadians))
    ) * 180 / Math.PI
    points.push([
      center.longitude + longitudeOffset,
      center.latitude + latitudeOffset
    ])
  }

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [points] },
      properties: {}
    }]
  }
}

export function collectReviewMapFitPoints(input: {
  samples: Array<Pick<ApiCoordinateSample, 'longitude' | 'latitude'>>
  observation: Pick<ApiCoordinateObservation, 'longitude' | 'latitude'>
  currentPlacePoint: ReviewMapPoint | null
  neighboringPlaces: Array<{ place: Pick<RenderableWgs84Place, 'longitude' | 'latitude'> }>
}): ReviewMapPoint[] {
  const points: ReviewMapPoint[] = [
    ...input.samples.map(sample => ({
      longitude: sample.longitude,
      latitude: sample.latitude
    })),
    {
      longitude: input.observation.longitude,
      latitude: input.observation.latitude
    }
  ]

  if (input.currentPlacePoint) points.push(input.currentPlacePoint)
  for (const { place } of input.neighboringPlaces) {
    points.push({ longitude: place.longitude, latitude: place.latitude })
  }
  return points
}

export function resolveReviewMapBounds(points: ReviewMapPoint[]): ReviewMapBounds | null {
  const first = points[0]
  if (!first) return null

  return points.reduce((result, point) => ({
    west: Math.min(result.west, point.longitude),
    south: Math.min(result.south, point.latitude),
    east: Math.max(result.east, point.longitude),
    north: Math.max(result.north, point.latitude)
  }), {
    west: first.longitude,
    south: first.latitude,
    east: first.longitude,
    north: first.latitude
  })
}

export function resolveReviewMapFitDecision(
  points: ReviewMapPoint[],
  options?: { zoom?: number, padding?: number, maxZoom?: number }
): ReviewMapFitDecision {
  const first = points[0]
  if (!first) return { kind: 'none' }

  const bounds = resolveReviewMapBounds(points)
  if (!bounds) return { kind: 'none' }

  const zoom = options?.zoom ?? 18
  const padding = options?.padding ?? 52
  const maxZoom = options?.maxZoom ?? 18

  if (bounds.west === bounds.east && bounds.south === bounds.north) {
    return {
      kind: 'fly-to',
      center: [first.longitude, first.latitude],
      zoom
    }
  }

  return {
    kind: 'fit-bounds',
    bounds: [
      [bounds.west, bounds.south],
      [bounds.east, bounds.north]
    ],
    padding,
    maxZoom
  }
}
