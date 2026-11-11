import { studentFacingSourceTitle } from './sources-presentation'
import {
  PLACE_CATEGORY_LABELS,
  buildPlaceFallbackUseChecklist as buildPlaceFallbackUseChecklistShared,
  buildPlaceLocationCopyText as buildPlaceLocationCopyTextShared,
  isPlaceCoordinateVerified as isPlaceCoordinateVerifiedShared,
  resolvePlaceCategoryLabel as resolvePlaceCategoryLabelShared,
  resolvePlaceFloorRoomLabel as resolvePlaceFloorRoomLabelShared,
  resolvePlaceNavigationStatusLabel as resolvePlaceNavigationStatusLabelShared,
  resolvePlaceScopeLabel as resolvePlaceScopeLabelShared,
  resolvePlaceStudentBody as resolvePlaceStudentBodyShared,
  resolvePlaceStudentSummary as resolvePlaceStudentSummaryShared,
  resolvePlaceUseChecklist as resolvePlaceUseChecklistShared
} from '~~/shared/utils/place-presentation'
import type {
  PlaceCoordinateFields,
  PlaceLocationFields
} from '~~/shared/utils/place-presentation'

export type { PlaceCoordinateFields, PlaceLocationFields }

/** @deprecated 用 shared/utils/place-presentation 的 PLACE_CATEGORY_LABELS。 */
export const placeCategoryLabels = PLACE_CATEGORY_LABELS

export function resolvePlaceCategoryLabel(category: string | null | undefined, type: string | null | undefined): string {
  return resolvePlaceCategoryLabelShared(category, type)
}

export function resolvePlaceScopeLabel(scope: string | null | undefined): string {
  return resolvePlaceScopeLabelShared(scope)
}

export function isPlaceCoordinateVerified(place: PlaceCoordinateFields | null | undefined): boolean {
  return isPlaceCoordinateVerifiedShared(place)
}

export function resolvePlaceNavigationStatusLabel(coordinateIsVerified: boolean): string {
  return resolvePlaceNavigationStatusLabelShared(coordinateIsVerified)
}

export function buildPlaceLocationCopyText(place: PlaceLocationFields): string {
  return buildPlaceLocationCopyTextShared(place)
}

export function resolvePlaceStudentSummary(
  summary: string | null | undefined,
  name: string,
  category: string | null | undefined,
  type: string | null | undefined
): string {
  return resolvePlaceStudentSummaryShared(summary, name, category, type)
}

export function resolvePlaceStudentBody(
  body: string | null | undefined,
  name = '',
  category?: string | null,
  type?: string | null
): string {
  return resolvePlaceStudentBodyShared(body, name, category, type)
}

export function resolvePlaceUseChecklist(body: string | null | undefined): string[] {
  return resolvePlaceUseChecklistShared(body)
}

export function buildPlaceFallbackUseChecklist(
  extractedChecklist: string[],
  category: string | null | undefined
): string[] {
  return buildPlaceFallbackUseChecklistShared(extractedChecklist, category)
}

export function resolvePlaceFloorRoomLabel(
  floor: string | null | undefined,
  room: string | null | undefined
): string {
  return resolvePlaceFloorRoomLabelShared(floor, room)
}

export interface PlaceDetailSourceLike {
  id: string
  title: string
  url: string
}

export interface PlaceDetailSourceView {
  key: string
  title: string
  url: string | null
  meta?: string
  unavailable?: boolean
}

export function buildPlaceMapTarget(
  placeSlug: string,
  returnPath: string | null | undefined
): { path: string, query: Record<string, string> } {
  return {
    path: '/map',
    query: {
      place: placeSlug,
      ...(returnPath ? { from: returnPath } : {})
    }
  }
}

export function buildPlaceDetailSources(
  sources: PlaceDetailSourceLike[] | null | undefined
): PlaceDetailSourceView[] {
  return (sources ?? []).map((source) => {
    const title = studentFacingSourceTitle(source.title)
    if (title === '高德地图位置参考') {
      return {
        key: source.id,
        title,
        url: null,
        meta: '位置来自高德，仅供认路',
        unavailable: true
      }
    }
    return { key: source.id, title, url: source.url }
  })
}
