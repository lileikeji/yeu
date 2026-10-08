import type { ContentKind } from '~~/shared/constants/server'
import type {
  ApiAmapOwnerDraftPlace,
  ApiContent,
  ApiPublicHomeEntries,
  ApiPublicFrontendFeatures,
  ApiPublicPromotedMerchants,
  ApiListResponse,
  ApiPlace,
  ApiProcedure
} from '~~/shared/types/server'

const PUBLIC_PAGE_SIZE = 100

export function usePublicFrontendFeatures() {
  return useFetch<ApiPublicFrontendFeatures>('/api/public/features', {
    key: 'public-frontend-features'
  })
}

export function usePublicHomeEntries() {
  return useFetch<ApiPublicHomeEntries>('/api/public/home-entries', {
    key: 'public-home-entries'
  })
}

export function usePublicPromotedMerchants() {
  return useFetch<ApiPublicPromotedMerchants>('/api/public/promoted-merchants', {
    key: 'public-promoted-merchants'
  })
}

async function sanitizeServerPayload<T>(
  response: T,
  sanitize: (presentation: typeof import('~/utils/public-api-presentation')) => T
): Promise<T> {
  if (import.meta.client) return response
  const presentation = await import('~/utils/public-api-presentation')
  return sanitize(presentation)
}

export function usePublicContentList(kind?: ContentKind) {
  return useFetch<ApiListResponse<ApiContent>>('/api/public/content', {
    key: `public-content-${kind ?? 'all'}`,
    query: {
      page: 1,
      pageSize: PUBLIC_PAGE_SIZE,
      ...(kind ? { kind } : {})
    },
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicContent, sanitizePublicList }) =>
        sanitizePublicList(response, sanitizePublicContent)
    )
  })
}

export function usePublicGuideList() {
  return useFetch<ApiListResponse<ApiContent>>('/api/public/guides', {
    key: 'public-guides',
    query: {
      page: 1,
      pageSize: PUBLIC_PAGE_SIZE
    },
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicContent, sanitizePublicList }) =>
        sanitizePublicList(response, sanitizePublicContent)
    )
  })
}

export function usePublicGuide(slug: string) {
  return useFetch<ApiContent>(`/api/public/guides/${encodeURIComponent(slug)}`, {
    key: `public-guide-${slug}`,
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicContent }) => sanitizePublicContent(response)
    )
  })
}

export function usePublicDepartmentList() {
  return useFetch<ApiListResponse<ApiContent>>('/api/public/departments', {
    key: 'public-departments',
    query: { page: 1, pageSize: PUBLIC_PAGE_SIZE },
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicContent, sanitizePublicList }) =>
        sanitizePublicList(response, sanitizePublicContent)
    )
  })
}

export function usePublicDepartment(slug: string) {
  return useFetch<ApiContent>(`/api/public/departments/${encodeURIComponent(slug)}`, {
    key: `public-department-${slug}`,
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicContent }) => sanitizePublicContent(response)
    )
  })
}

export function usePublicClubList() {
  return useFetch<ApiListResponse<ApiContent>>('/api/public/clubs', {
    key: 'public-clubs',
    query: { page: 1, pageSize: PUBLIC_PAGE_SIZE },
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicContent, sanitizePublicList }) =>
        sanitizePublicList(response, sanitizePublicContent)
    )
  })
}

export function usePublicClub(slug: string) {
  return useFetch<ApiContent>(`/api/public/clubs/${encodeURIComponent(slug)}`, {
    key: `public-club-${slug}`,
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicContent }) => sanitizePublicContent(response)
    )
  })
}

export function usePublicPlaceList(scope?: 'campus' | 'nearby') {
  return useFetch<ApiListResponse<ApiPlace>>('/api/public/places', {
    key: `public-places-${scope ?? 'all'}`,
    query: {
      page: 1,
      pageSize: PUBLIC_PAGE_SIZE,
      ...(scope ? { scope } : {})
    },
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicList, sanitizePublicPlace }) =>
        sanitizePublicList(response, sanitizePublicPlace)
    )
  })
}

export function usePublicAmapOwnerDraftPlaces() {
  return useFetch<ApiListResponse<ApiAmapOwnerDraftPlace>>('/api/public/amap-owner-drafts', {
    key: 'public-amap-owner-drafts',
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicAmapOwnerDraftPlace, sanitizePublicList }) =>
        sanitizePublicList(response, sanitizePublicAmapOwnerDraftPlace)
    )
  })
}

export function usePublicPlace(slug: string) {
  return useFetch<ApiPlace>(`/api/public/places/${encodeURIComponent(slug)}`, {
    key: `public-place-${slug}`,
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicPlace }) => sanitizePublicPlace(response)
    )
  })
}

export function usePublicProcedureList(audience?: 'undergraduate' | 'transfer') {
  return useFetch<ApiListResponse<ApiProcedure>>('/api/public/procedures', {
    key: `public-procedures-${audience ?? 'all'}`,
    query: {
      page: 1,
      pageSize: PUBLIC_PAGE_SIZE,
      ...(audience ? { audience } : {})
    },
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicList, sanitizePublicProcedure }) =>
        sanitizePublicList(response, sanitizePublicProcedure)
    )
  })
}

export function usePublicProcedure(slug: string) {
  return useFetch<ApiProcedure>(`/api/public/procedures/${encodeURIComponent(slug)}`, {
    key: `public-procedure-${slug}`,
    transform: response => sanitizeServerPayload(
      response,
      ({ sanitizePublicProcedure }) => sanitizePublicProcedure(response)
    )
  })
}
