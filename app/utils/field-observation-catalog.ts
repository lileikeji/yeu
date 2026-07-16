import type { Ref } from 'vue'
import type {
  ApiCoordinateObservation,
  ApiListResponse,
  ApiPlace
} from '~~/shared/types/server'
import type { CoordinateObservationStatus } from '~~/shared/constants/server'
import { getRequestMessage } from './request-error'

export type ObservationStatusFilter = CoordinateObservationStatus | 'all'

export interface FieldObservationCatalogRequestOptions {
  query: Record<string, string | number>
  credentials: 'include'
}

export type FieldObservationCatalogRequest = <T>(
  endpoint: string,
  options: FieldObservationCatalogRequestOptions
) => Promise<ApiListResponse<T>>

export interface FieldObservationCatalogState {
  places: Ref<ApiPlace[]>
  observations: Ref<ApiCoordinateObservation[]>
  selectedPlaceId: Ref<string>
  selectedObservationId: Ref<string | null>
  placesLoading: Ref<boolean>
  observationsLoading: Ref<boolean>
  placesError: Ref<string>
  observationsError: Ref<string>
  searchInput: Ref<string>
  appliedSearch: Ref<string>
  status: Ref<ObservationStatusFilter>
  page: Ref<number>
  pageSize: Ref<number>
  total: Ref<number>
}

interface CreateFieldObservationCatalogOptions {
  state: FieldObservationCatalogState
  request: FieldObservationCatalogRequest
  handleUnauthorized: (error: unknown) => Promise<boolean>
}

export function sortFieldObservationPlaces(items: ApiPlace[]): ApiPlace[] {
  return [...items].sort((left, right) => {
    const leftPriority = left.coordinateVerification === 'missing' ? 0 : 1
    const rightPriority = right.coordinateVerification === 'missing' ? 0 : 1
    return leftPriority - rightPriority || left.name.localeCompare(right.name, 'zh-CN')
  })
}

export function buildFieldObservationListQuery(
  page: number,
  pageSize: number,
  search: string,
  status: ObservationStatusFilter
): Record<string, string | number> {
  const query: Record<string, string | number> = { page, pageSize }
  const normalizedSearch = search.trim()
  if (normalizedSearch) query.q = normalizedSearch
  if (status !== 'all') query.status = status
  return query
}

export function createFieldObservationCatalog(options: CreateFieldObservationCatalogOptions) {
  const state = options.state
  let placesRequestVersion = 0
  let observationsRequestVersion = 0

  async function loadPlaces(): Promise<void> {
    const requestVersion = ++placesRequestVersion
    state.placesLoading.value = true
    state.placesError.value = ''

    try {
      const response = await options.request<ApiPlace>('/api/admin/places', {
        query: { page: 1, pageSize: 100 },
        credentials: 'include'
      })
      if (requestVersion !== placesRequestVersion) return

      state.places.value = sortFieldObservationPlaces(response.items)
      if (!state.selectedPlaceId.value && state.places.value[0]) {
        state.selectedPlaceId.value = state.places.value[0].id
      }
    } catch (error) {
      if (requestVersion !== placesRequestVersion) return
      const unauthorized = await options.handleUnauthorized(error)
      if (requestVersion !== placesRequestVersion || unauthorized) return
      state.placesError.value = getRequestMessage(error, '地点数据暂时无法加载。')
    } finally {
      if (requestVersion === placesRequestVersion) state.placesLoading.value = false
    }
  }

  async function loadObservations(): Promise<void> {
    const requestVersion = ++observationsRequestVersion
    state.observationsLoading.value = true
    state.observationsError.value = ''

    try {
      const response = await options.request<ApiCoordinateObservation>(
        '/api/admin/coordinate-observations',
        {
          query: buildFieldObservationListQuery(
            state.page.value,
            state.pageSize.value,
            state.appliedSearch.value,
            state.status.value
          ),
          credentials: 'include'
        }
      )
      if (requestVersion !== observationsRequestVersion) return

      state.total.value = response.total
      const responsePageSize = Math.max(1, response.pageSize)
      const maximumPage = Math.max(1, Math.ceil(response.total / responsePageSize))
      if (state.page.value > maximumPage) {
        state.page.value = maximumPage
        return
      }

      state.observations.value = response.items
      if (!response.items.some(item => item.id === state.selectedObservationId.value)) {
        state.selectedObservationId.value = response.items[0]?.id ?? null
      }
    } catch (error) {
      if (requestVersion !== observationsRequestVersion) return
      const unauthorized = await options.handleUnauthorized(error)
      if (requestVersion !== observationsRequestVersion || unauthorized) return
      state.observationsError.value = getRequestMessage(
        error,
        '坐标观测暂时无法加载。'
      )
    } finally {
      if (requestVersion === observationsRequestVersion) {
        state.observationsLoading.value = false
      }
    }
  }

  function cancelCatalogRequests(): void {
    placesRequestVersion += 1
    observationsRequestVersion += 1
    state.placesLoading.value = false
    state.observationsLoading.value = false
  }

  return {
    ...state,
    loadPlaces,
    loadObservations,
    cancelCatalogRequests
  }
}
