import type {
  ApiAmapOwnerDraftPlace,
  ApiContent,
  ApiPlace,
  ApiProcedure,
  ApiSearchResponse
} from '../../shared/types/server'
import {
  sanitizePublicAmapOwnerDraftPlace,
  sanitizePublicContent,
  sanitizePublicPlace,
  sanitizePublicProcedure,
  sanitizePublicSearchResponse
} from '../../app/utils/public-api-presentation'
import { studentFacingGuideText } from '../../app/utils/public-catalog'
import { presentStudentSourceContext } from '../../app/utils/source-context-presentation'

function transformStudentFacingStrings<T>(value: T, fieldName?: string): T {
  if (typeof value === 'string') {
    const presented = studentFacingGuideText(value)
    return (fieldName === 'context'
      ? presentStudentSourceContext(presented) ?? presented
      : presented) as T
  }
  if (Array.isArray(value)) {
    return value.map(item => transformStudentFacingStrings(item, fieldName)) as T
  }
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, transformStudentFacingStrings(item, key)])
  ) as T
}

export function presentPublicContent(content: ApiContent): ApiContent {
  return sanitizePublicContent(transformStudentFacingStrings(content))
}

export function presentPublicPlace(place: ApiPlace): ApiPlace {
  return sanitizePublicPlace(transformStudentFacingStrings(place))
}

export function presentPublicProcedure(procedure: ApiProcedure): ApiProcedure {
  return sanitizePublicProcedure(transformStudentFacingStrings(procedure))
}

export function presentPublicSearchResponse(response: ApiSearchResponse): ApiSearchResponse {
  return sanitizePublicSearchResponse(transformStudentFacingStrings(response))
}

export function presentPublicAmapOwnerDraftPlace(
  place: ApiAmapOwnerDraftPlace
): ApiAmapOwnerDraftPlace {
  return sanitizePublicAmapOwnerDraftPlace(transformStudentFacingStrings(place))
}

export function presentPublicList<TItem, TResponse extends { items: TItem[] }>(
  response: TResponse,
  presentItem: (item: TItem) => TItem
): TResponse {
  return {
    ...response,
    items: response.items.map(presentItem)
  }
}
