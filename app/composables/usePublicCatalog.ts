import type { ContentKind } from '~~/shared/constants/server'
import type { ApiContent, ApiListResponse, ApiPlace, ApiProcedure } from '~~/shared/types/server'

const PUBLIC_PAGE_SIZE = 200

export function usePublicContentList(kind?: ContentKind) {
  return useFetch<ApiListResponse<ApiContent>>('/api/public/content', {
    key: `public-content-${kind ?? 'all'}`,
    query: {
      page: 1,
      pageSize: PUBLIC_PAGE_SIZE,
      ...(kind ? { kind } : {})
    }
  })
}

export function usePublicGuideList() {
  return useFetch<ApiListResponse<ApiContent>>('/api/public/guides', {
    key: 'public-guides',
    query: {
      page: 1,
      pageSize: PUBLIC_PAGE_SIZE
    }
  })
}

export function usePublicGuide(slug: string) {
  return useFetch<ApiContent>(`/api/public/guides/${encodeURIComponent(slug)}`, {
    key: `public-guide-${slug}`
  })
}

export function usePublicDepartmentList() {
  return useFetch<ApiListResponse<ApiContent>>('/api/public/departments', {
    key: 'public-departments',
    query: { page: 1, pageSize: PUBLIC_PAGE_SIZE }
  })
}

export function usePublicDepartment(slug: string) {
  return useFetch<ApiContent>(`/api/public/departments/${encodeURIComponent(slug)}`, {
    key: `public-department-${slug}`
  })
}

export function usePublicClubList() {
  return useFetch<ApiListResponse<ApiContent>>('/api/public/clubs', {
    key: 'public-clubs',
    query: { page: 1, pageSize: PUBLIC_PAGE_SIZE }
  })
}

export function usePublicClub(slug: string) {
  return useFetch<ApiContent>(`/api/public/clubs/${encodeURIComponent(slug)}`, {
    key: `public-club-${slug}`
  })
}

export function usePublicPlaceList(scope?: 'campus' | 'nearby') {
  return useFetch<ApiListResponse<ApiPlace>>('/api/public/places', {
    key: `public-places-${scope ?? 'all'}`,
    query: {
      page: 1,
      pageSize: PUBLIC_PAGE_SIZE,
      ...(scope ? { scope } : {})
    }
  })
}

export function usePublicPlace(slug: string) {
  return useFetch<ApiPlace>(`/api/public/places/${encodeURIComponent(slug)}`, {
    key: `public-place-${slug}`
  })
}

export function usePublicProcedureList(audience?: 'undergraduate' | 'transfer') {
  return useFetch<ApiListResponse<ApiProcedure>>('/api/public/procedures', {
    key: `public-procedures-${audience ?? 'all'}`,
    query: {
      page: 1,
      pageSize: PUBLIC_PAGE_SIZE,
      ...(audience ? { audience } : {})
    }
  })
}

export function usePublicProcedure(slug: string) {
  return useFetch<ApiProcedure>(`/api/public/procedures/${encodeURIComponent(slug)}`, {
    key: `public-procedure-${slug}`
  })
}
