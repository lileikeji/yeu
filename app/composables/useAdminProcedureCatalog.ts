import type {
  AdminCatalogRequest,
  AdminProcedureCatalogState,
  ProcedurePublicationStatus
} from '~/utils/admin-procedure-catalog'
import { createAdminProcedureCatalog } from '~/utils/admin-procedure-catalog'

interface UseAdminProcedureCatalogOptions {
  pageSize: number
  request: AdminCatalogRequest
  handleUnauthorized: (error: unknown) => Promise<boolean>
}

const SEARCH_DEBOUNCE_MS = 300

export function useAdminProcedureCatalog(options: UseAdminProcedureCatalogOptions) {
  const state: AdminProcedureCatalogState = {
    procedures: ref([]),
    total: ref(0),
    page: ref(1),
    loading: ref(false),
    loadError: ref(''),
    searchQuery: ref(''),
    statusFilter: ref<'all' | ProcedurePublicationStatus>('all'),
    referencesLoading: ref(false),
    referencesLoaded: ref(false),
    referencesError: ref(''),
    departments: ref([]),
    guides: ref([]),
    places: ref([]),
    sources: ref([])
  }
  const catalog = createAdminProcedureCatalog({ ...options, state })
  const pageCount = computed(() => (
    Math.max(1, Math.ceil(state.total.value / options.pageSize))
  ))
  let searchTimer: ReturnType<typeof setTimeout> | null = null

  watch(state.searchQuery, () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      state.page.value = 1
      void catalog.loadProcedures()
    }, SEARCH_DEBOUNCE_MS)
  })

  watch(state.statusFilter, () => {
    state.page.value = 1
    void catalog.loadProcedures()
  })

  onBeforeUnmount(() => {
    if (searchTimer) clearTimeout(searchTimer)
    catalog.cancelCatalogRequests()
  })

  return { ...catalog, pageCount }
}
