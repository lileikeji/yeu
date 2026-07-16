import type { Ref } from 'vue'
import type { AdminRecord, AdminResourceConfig } from '~/components/admin/types'
import {
  createAdminResourceCatalog,
  type AdminResourceCatalogRequest,
  type AdminResourceCatalogState
} from '~/utils/admin-resource-catalog'

interface UseAdminResourceCatalogOptions {
  config: Readonly<Ref<AdminResourceConfig>>
  pageSize: number
  request: AdminResourceCatalogRequest
  handleUnauthorized: (error: unknown) => Promise<boolean>
  openCreateFromQuery: () => Promise<void>
}

const SEARCH_DEBOUNCE_MS = 300

export function useAdminResourceCatalog(options: UseAdminResourceCatalogOptions) {
  const state: AdminResourceCatalogState = {
    records: ref<AdminRecord[]>([]),
    total: ref(0),
    stats: ref<Record<string, number>>({}),
    page: ref(1),
    loading: ref(false),
    loadError: ref(''),
    searchQuery: ref(''),
    filterValues: reactive<Record<string, string>>({})
  }
  const catalog = createAdminResourceCatalog({
    state,
    pageSize: options.pageSize,
    getConfig: () => options.config.value,
    request: options.request,
    handleUnauthorized: options.handleUnauthorized
  })
  const pageCount = computed(() => Math.max(
    1,
    Math.ceil(state.total.value / options.pageSize)
  ))
  const ready = ref(false)
  let searchTimer: ReturnType<typeof setTimeout> | null = null

  async function initializeResource(): Promise<void> {
    ready.value = false
    catalog.resetCatalogState()
    await nextTick()
    ready.value = true
    await catalog.loadRecords()
    await options.openCreateFromQuery()
  }

  function scheduleSearch(): void {
    if (!ready.value) return
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      state.page.value = 1
      void catalog.loadRecords()
    }, SEARCH_DEBOUNCE_MS)
  }

  watch(state.searchQuery, scheduleSearch)
  watch(state.filterValues, () => {
    if (!ready.value) return
    state.page.value = 1
    void catalog.loadRecords()
  }, { deep: true })
  watch(() => options.config.value.key, () => {
    if (ready.value) void initializeResource()
  })

  onMounted(() => void initializeResource())
  onBeforeUnmount(() => {
    if (searchTimer) clearTimeout(searchTimer)
    catalog.cancelCatalogRequests()
  })

  return { ...catalog, pageCount, initializeResource }
}
