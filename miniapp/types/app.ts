import type {
  ApiContent,
  ApiListResponse,
  ApiNearbyGuideResponse,
  ApiPlace,
  ApiProcedure,
  ApiSearchResponse,
  ApiWalkingRoute
} from '@shared/types/server'

export interface MiniAppHomeResponse {
  features: {
    disabledKeys: string[]
    placements: Record<string, string>
    sortOrders: Record<string, number>
    updatedAt: string | null
  }
  entries: Array<{
    id: string
    title: string
    description: string
    detailContent: string
    to: string
    sourceUrl: string | null
    icon: string
    placement: 'quick' | 'services' | 'more'
    sortOrder: number
    featureKey?: string
  }>
}

export type MiniAppPlace = ApiPlace
export type MiniAppGuide = ApiContent
export type MiniAppProcedure = ApiProcedure
export type MiniAppSearchResponse = ApiSearchResponse
export type MiniAppListResponse<T> = ApiListResponse<T>
export type MiniAppWalkingRoute = ApiWalkingRoute
export type MiniAppNearbyGuide = ApiNearbyGuideResponse['items'][number]
export type MiniAppNearbyResponse = ApiNearbyGuideResponse

export interface MiniAppNotice extends ApiContent {
  pinned: boolean
  sortOrder: number | null
  autoPopup: boolean
  actions: Array<{ label: string, href: string, icon?: string }>
  confirmationCount: number
  confirmed: boolean
}

export interface MiniAppApiError {
  status: number
  code: string | null
  message: string
  requestId: string | null
  retryAfter: number | null
}

export interface MiniAppRouteQuery {
  slug?: string
  q?: string
  place?: string
  kind?: string
}

export type MiniAppTelemetryAction =
  | 'page_view'
  | 'module_view'
  | 'search_submit'
  | 'result_click'
  | 'map_marker_select'
  | 'open_location'
  | 'route_plan'
  | 'api_request'
  | 'api_error'
  | 'feedback_open'

export interface MiniAppTelemetryMeta {
  [key: string]: string | number | boolean | null | undefined
}
