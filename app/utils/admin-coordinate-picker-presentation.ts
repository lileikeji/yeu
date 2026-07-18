import type { GeoPoint, MapPoi } from '../../map/core/types'
import {
  isPointWithinBounds,
  YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS
} from '../../map/core/campus'

export const ADMIN_COORDINATE_PICKER_DRAFT_POI_ID = 'admin-coordinate-draft'
export const ADMIN_COORDINATE_PICKER_DEFAULT_NAME = '待确认地点'

export function resolveAdminCoordinatePickerCurrentPoint(input: {
  coordinateSystem: string | null
  longitude: number | null
  latitude: number | null
}): GeoPoint | null {
  if (input.coordinateSystem !== 'WGS84'
    || input.longitude === null
    || input.latitude === null
    || !Number.isFinite(input.longitude)
    || !Number.isFinite(input.latitude)) {
    return null
  }

  return {
    lng: input.longitude,
    lat: input.latitude,
    crs: 'WGS84'
  }
}

export function resolveAdminCoordinatePickerCurrentPoi(input: {
  point: GeoPoint | null
  name: string
  draftPoiId?: string
  defaultName?: string
}): MapPoi[] {
  if (!input.point) return []
  return [{
    id: input.draftPoiId ?? ADMIN_COORDINATE_PICKER_DRAFT_POI_ID,
    name: input.name || (input.defaultName ?? ADMIN_COORDINATE_PICKER_DEFAULT_NAME),
    category: 'service',
    point: input.point,
    status: 'draft'
  }]
}

export function resolveAdminCoordinatePickerOutsideCampusBounds(input: {
  scope: string
  point: GeoPoint | null
}): boolean {
  return input.scope === 'campus'
    && input.point !== null
    && !isPointWithinBounds(input.point, YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS)
}

export function resolveAdminCoordinatePickerMountOptions(input: {
  point: GeoPoint | null
  focusedZoom?: number
  defaultZoom?: number
}): { center?: GeoPoint, zoom: number } {
  const focusedZoom = input.focusedZoom ?? 18
  const defaultZoom = input.defaultZoom ?? 15
  if (!input.point) return { zoom: defaultZoom }
  return {
    center: input.point,
    zoom: focusedZoom
  }
}
