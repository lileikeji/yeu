import type { Ref } from 'vue'
import type {
  ApiContent,
  ApiListResponse,
  ApiPlace,
  ApiProcedure,
  ApiSource
} from '~~/shared/types/server'
import { getRequestMessage } from './request-error'

export type ProcedurePublicationStatus = ApiProcedure['status']

export interface AdminCatalogRequestOptions {
  query: Record<string, string | number>
  credentials: 'include'
}

export type AdminCatalogRequest = <T>(
  endpoint: string,
  options: AdminCatalogRequestOptions
) => Promise<ApiListResponse<T>>

export interface AdminProcedureCatalogState {
  procedures: Ref<ApiProcedure[]>
  total: Ref<number>
  page: Ref<number>
  loading: Ref<boolean>
  loadError: Ref<string>
  searchQuery: Ref<string>
  statusFilter: Ref<'all' | ProcedurePublicationStatus>
  referencesLoading: Ref<boolean>
  referencesLoaded: Ref<boolean>
  referencesError: Ref<string>
  departments: Ref<ApiContent[]>
  guides: Ref<ApiContent[]>
  places: Ref<ApiPlace[]>
  sources: Ref<ApiSource[]>
}

interface CreateAdminProcedureCatalogOptions {
  state: AdminProcedureCatalogState
  pageSize: number
  request: AdminCatalogRequest
  handleUnauthorized: (error: unknown) => Promise<boolean>
}

interface AdminProcedureReferenceSnapshot {
  departments: ApiContent[]
  guides: ApiContent[]
  places: ApiPlace[]
  sources: ApiSource[]
}

export function buildAdminProcedureListQuery(
  page: number,
  pageSize: number,
  searchQuery: string,
  statusFilter: 'all' | ProcedurePublicationStatus
): Record<string, string | number> {
  const query: Record<string, string | number> = { page, pageSize }
  const normalizedSearch = searchQuery.trim()
  if (normalizedSearch) query.q = normalizedSearch
  if (statusFilter !== 'all') query.status = statusFilter
  return query
}

export async function fetchAllAdminCatalogItems<T>(
  request: AdminCatalogRequest,
  endpoint: string,
  query: Record<string, string> = {}
): Promise<T[]> {
  const items: T[] = []
  let currentPage = 1

  while (true) {
    const response = await request<T>(endpoint, {
      query: { ...query, page: currentPage, pageSize: 200 },
      credentials: 'include'
    })
    if (response.items.length === 0 && items.length < response.total) {
      throw new Error('后台分页响应未返回剩余数据')
    }
    items.push(...response.items)
    if (items.length >= response.total) return items
    currentPage += 1
  }
}

export async function loadAdminProcedureReferenceSnapshot(
  request: AdminCatalogRequest
): Promise<AdminProcedureReferenceSnapshot> {
  const [departments, guides, places, sources] = await Promise.all([
    fetchAllAdminCatalogItems<ApiContent>(request, '/api/admin/content', { kind: 'department' }),
    fetchAllAdminCatalogItems<ApiContent>(request, '/api/admin/content', { kind: 'guide' }),
    fetchAllAdminCatalogItems<ApiPlace>(request, '/api/admin/places'),
    fetchAllAdminCatalogItems<ApiSource>(request, '/api/admin/sources')
  ])
  return {
    departments: departments.filter(item => item.status !== 'archived'),
    guides: guides.filter(item => item.status !== 'archived'),
    places: places.filter(item => item.status !== 'archived'),
    sources
  }
}

export function createAdminProcedureCatalog(options: CreateAdminProcedureCatalogOptions) {
  const state = options.state
  let listRequestVersion = 0
  let referencesRequestVersion = 0

  async function loadProcedures(): Promise<void> {
    const requestVersion = ++listRequestVersion
    state.loading.value = true
    state.loadError.value = ''

    try {
      const response = await options.request<ApiProcedure>('/api/admin/procedures', {
        query: buildAdminProcedureListQuery(
          state.page.value,
          options.pageSize,
          state.searchQuery.value,
          state.statusFilter.value
        ),
        credentials: 'include'
      })
      if (requestVersion !== listRequestVersion) return

      state.total.value = response.total
      const maxPage = Math.max(1, Math.ceil(response.total / options.pageSize))
      if (state.page.value > maxPage) {
        state.page.value = maxPage
        await loadProcedures()
        return
      }
      state.procedures.value = response.items
    } catch (error) {
      if (requestVersion !== listRequestVersion) return
      const unauthorized = await options.handleUnauthorized(error)
      if (requestVersion !== listRequestVersion || unauthorized) return
      state.procedures.value = []
      state.total.value = 0
      state.loadError.value = getRequestMessage(
        error,
        '暂时无法读取办事流程，请稍后重试。'
      )
    } finally {
      if (requestVersion === listRequestVersion) state.loading.value = false
    }
  }

  async function loadReferences(force = false): Promise<void> {
    if (!force && (state.referencesLoading.value || state.referencesLoaded.value)) return
    const requestVersion = ++referencesRequestVersion
    state.referencesLoading.value = true
    state.referencesError.value = ''

    try {
      const snapshot = await loadAdminProcedureReferenceSnapshot(options.request)
      if (requestVersion !== referencesRequestVersion) return
      state.departments.value = snapshot.departments
      state.guides.value = snapshot.guides
      state.places.value = snapshot.places
      state.sources.value = snapshot.sources
      state.referencesLoaded.value = true
    } catch (error) {
      if (requestVersion !== referencesRequestVersion) return
      const unauthorized = await options.handleUnauthorized(error)
      if (requestVersion !== referencesRequestVersion || unauthorized) return
      state.referencesError.value = getRequestMessage(
        error,
        '关联内容加载失败，可稍后重试。'
      )
    } finally {
      if (requestVersion === referencesRequestVersion) state.referencesLoading.value = false
    }
  }

  function cancelCatalogRequests(): void {
    listRequestVersion += 1
    referencesRequestVersion += 1
    state.loading.value = false
    state.referencesLoading.value = false
  }

  return {
    ...state,
    loadProcedures,
    loadReferences,
    cancelCatalogRequests
  }
}
