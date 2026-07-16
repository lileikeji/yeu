import type { ApiCoordinateObservation, ApiPlace } from '~~/shared/types/server'
import {
  createFieldObservationCatalog,
  type FieldObservationCatalogRequest,
  type FieldObservationCatalogState,
  type ObservationStatusFilter
} from '~/utils/field-observation-catalog'

interface UseFieldObservationCatalogOptions {
  request: FieldObservationCatalogRequest
  handleUnauthorized: (error: unknown) => Promise<boolean>
}

const SEARCH_DEBOUNCE_MS = 350

export function useFieldObservationCatalog(options: UseFieldObservationCatalogOptions) {
  const state: FieldObservationCatalogState = {
    places: ref<ApiPlace[]>([]),
    observations: ref<ApiCoordinateObservation[]>([]),
    selectedPlaceId: ref(''),
    selectedObservationId: ref<string | null>(null),
    placesLoading: ref(true),
    observationsLoading: ref(true),
    placesError: ref(''),
    observationsError: ref(''),
    searchInput: ref(''),
    appliedSearch: ref(''),
    status: ref<ObservationStatusFilter>('pending'),
    page: ref(1),
    pageSize: ref(20),
    total: ref(0)
  }
  const catalog = createFieldObservationCatalog({ ...options, state })
  const selectedPlace = computed(() => state.places.value.find(
    place => place.id === state.selectedPlaceId.value
  ) ?? null)
  const selectedObservation = computed(() => state.observations.value.find(
    observation => observation.id === state.selectedObservationId.value
  ) ?? null)
  const selectedObservationPlace = computed(() => selectedObservation.value
    ? state.places.value.find(place => place.id === selectedObservation.value!.placeId) ?? null
    : null)
  const pageCount = computed(() => Math.max(
    1,
    Math.ceil(state.total.value / state.pageSize.value)
  ))
  const loadError = computed(() => state.placesError.value || state.observationsError.value)
  let searchTimer: ReturnType<typeof setTimeout> | null = null

  function applySearch(): void {
    if (searchTimer) clearTimeout(searchTimer)
    const nextValue = state.searchInput.value.trim()
    if (nextValue === state.appliedSearch.value) {
      void catalog.loadObservations()
      return
    }
    state.appliedSearch.value = nextValue
  }

  watch(state.searchInput, () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(applySearch, SEARCH_DEBOUNCE_MS)
  })
  watch([state.status, state.pageSize, state.appliedSearch], () => {
    if (state.page.value !== 1) state.page.value = 1
    else void catalog.loadObservations()
  })
  watch(state.page, () => void catalog.loadObservations())

  onBeforeUnmount(() => {
    if (searchTimer) clearTimeout(searchTimer)
    catalog.cancelCatalogRequests()
  })

  return {
    ...catalog,
    selectedPlace,
    selectedObservation,
    selectedObservationPlace,
    pageCount,
    loadError,
    applySearch
  }
}
