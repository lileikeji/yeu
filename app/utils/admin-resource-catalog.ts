import type { Ref } from 'vue'
import type { AdminRecord, AdminResourceConfig } from '~/components/admin/types'
import { normalizeAdminResourceList } from './admin-resource-presentation'
import { getRequestMessage } from './request-error'

export interface AdminResourceCatalogRequestOptions {
  query: Record<string, string | number>
  credentials: 'include'
}

export type AdminResourceCatalogRequest = (
  endpoint: string,
  options: AdminResourceCatalogRequestOptions
) => Promise<unknown>

export interface AdminResourceCatalogState {
  records: Ref<AdminRecord[]>
  total: Ref<number>
  stats: Ref<Record<string, number>>
  page: Ref<number>
  loading: Ref<boolean>
  loadError: Ref<string>
  searchQuery: Ref<string>
  filterValues: Record<string, string>
}

interface CreateAdminResourceCatalogOptions {
  state: AdminResourceCatalogState
  pageSize: number
  getConfig: () => AdminResourceConfig
  request: AdminResourceCatalogRequest
  handleUnauthorized: (error: unknown) => Promise<boolean>
}

export function buildAdminResourceQuery(
  page: number,
  pageSize: number,
  searchQuery: string,
  filterValues: Record<string, string>
): Record<string, string | number> {
  const query: Record<string, string | number> = { page, pageSize }
  const normalizedSearch = searchQuery.trim()
  if (normalizedSearch) query.q = normalizedSearch

  for (const [key, value] of Object.entries(filterValues)) {
    if (value && value !== 'all') query[key] = value
  }
  return query
}

export function resetAdminResourceFilters(
  filterValues: Record<string, string>,
  config: AdminResourceConfig
): void {
  for (const key of Object.keys(filterValues)) Reflect.deleteProperty(filterValues, key)
  for (const filter of config.filters ?? []) filterValues[filter.key] = 'all'
}

export function createAdminResourceCatalog(options: CreateAdminResourceCatalogOptions) {
  const state = options.state
  let requestVersion = 0

  async function loadRecords(): Promise<void> {
    const currentVersion = ++requestVersion
    const config = options.getConfig()
    state.loading.value = true
    state.loadError.value = ''

    try {
      const response = await options.request(config.endpoint, {
        query: buildAdminResourceQuery(
          state.page.value,
          options.pageSize,
          state.searchQuery.value,
          state.filterValues
        ),
        credentials: 'include'
      })
      if (currentVersion !== requestVersion) return

      const normalized = normalizeAdminResourceList(response, config.stats?.responseKey)
      state.total.value = normalized.total
      state.stats.value = normalized.stats
      const maximumPage = Math.max(1, Math.ceil(normalized.total / options.pageSize))
      if (state.page.value > maximumPage) {
        state.page.value = maximumPage
        await loadRecords()
        return
      }
      state.records.value = normalized.items
    } catch (error) {
      if (currentVersion !== requestVersion) return
      const unauthorized = await options.handleUnauthorized(error)
      if (currentVersion !== requestVersion || unauthorized) return
      state.records.value = []
      state.total.value = 0
      state.stats.value = {}
      state.loadError.value = getRequestMessage(error, '暂时无法读取数据，请稍后重试。')
    } finally {
      if (currentVersion === requestVersion) state.loading.value = false
    }
  }

  function resetCatalogState(): void {
    cancelCatalogRequests()
    state.searchQuery.value = ''
    state.page.value = 1
    state.records.value = []
    state.total.value = 0
    state.stats.value = {}
    state.loadError.value = ''
    resetAdminResourceFilters(state.filterValues, options.getConfig())
  }

  async function changePage(nextPage: number): Promise<void> {
    const pageCount = Math.max(1, Math.ceil(state.total.value / options.pageSize))
    const normalizedPage = Math.min(Math.max(nextPage, 1), pageCount)
    if (normalizedPage === state.page.value) return
    state.page.value = normalizedPage
    await loadRecords()
  }

  function cancelCatalogRequests(): void {
    requestVersion += 1
    state.loading.value = false
  }

  return {
    ...state,
    loadRecords,
    resetCatalogState,
    changePage,
    cancelCatalogRequests
  }
}
