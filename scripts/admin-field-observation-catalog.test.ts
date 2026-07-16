import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type {
  ApiCoordinateObservation,
  ApiListResponse,
  ApiPlace
} from '../shared/types/server'
import type {
  FieldObservationCatalogRequest,
  FieldObservationCatalogState
} from '../app/utils/field-observation-catalog'
import {
  buildFieldObservationListQuery,
  createFieldObservationCatalog,
  sortFieldObservationPlaces
} from '../app/utils/field-observation-catalog'

function place(
  id: string,
  name = id,
  coordinateVerification: ApiPlace['coordinateVerification'] = 'unverified'
): ApiPlace {
  return { id, name, coordinateVerification } as ApiPlace
}

function observation(id: string, placeId = `place-${id}`): ApiCoordinateObservation {
  return { id, placeId, reviewStatus: 'pending' } as ApiCoordinateObservation
}

function response<T>(
  items: T[],
  total = items.length,
  page = 1,
  pageSize = 20
): ApiListResponse<T> {
  return { items, total, page, pageSize }
}

function state(): FieldObservationCatalogState {
  const value = <T>(initial: T) => ({ value: initial })
  return {
    places: value<ApiPlace[]>([]),
    observations: value<ApiCoordinateObservation[]>([]),
    selectedPlaceId: value(''),
    selectedObservationId: value<string | null>(null),
    placesLoading: value(true),
    observationsLoading: value(true),
    placesError: value(''),
    observationsError: value(''),
    searchInput: value(''),
    appliedSearch: value(''),
    status: value('pending'),
    page: value(1),
    pageSize: value(20),
    total: value(0)
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('observation query trims search and omits the all-status filter', () => {
  assert.deepEqual(buildFieldObservationListQuery(2, 50, '  南门  ', 'approved'), {
    page: 2,
    pageSize: 50,
    q: '南门',
    status: 'approved'
  })
  assert.deepEqual(buildFieldObservationListQuery(1, 20, '   ', 'all'), {
    page: 1,
    pageSize: 20
  })
})

test('place sorting is immutable and prioritizes missing coordinates', () => {
  const original = [
    place('verified', '中门', 'verified'),
    place('missing-b', '北门', 'missing'),
    place('missing-a', '南门', 'missing')
  ]
  const sorted = sortFieldObservationPlaces(original)

  assert.notEqual(sorted, original)
  assert.deepEqual(original.map(item => item.id), ['verified', 'missing-b', 'missing-a'])
  assert.deepEqual(sorted.map(item => item.id), ['missing-b', 'missing-a', 'verified'])
})

test('place loading applies sorting and selects the first place only when needed', async () => {
  const catalogState = state()
  const catalog = createFieldObservationCatalog({
    state: catalogState,
    async request<T>() {
      return response([
        place('verified', '中门', 'verified'),
        place('missing', '南门', 'missing')
      ] as T[])
    },
    async handleUnauthorized() { return false }
  })

  await catalog.loadPlaces()
  assert.deepEqual(catalogState.places.value.map(item => item.id), ['missing', 'verified'])
  assert.equal(catalogState.selectedPlaceId.value, 'missing')

  catalogState.selectedPlaceId.value = 'operator-selection'
  await catalog.loadPlaces()
  assert.equal(catalogState.selectedPlaceId.value, 'operator-selection')
  assert.equal(catalogState.placesLoading.value, false)
})

test('stale place responses cannot overwrite a newer catalog snapshot', async () => {
  const catalogState = state()
  const oldRequest = deferred<ApiListResponse<ApiPlace>>()
  const newRequest = deferred<ApiListResponse<ApiPlace>>()
  let requestCount = 0
  const catalog = createFieldObservationCatalog({
    state: catalogState,
    request: async <T>() => {
      requestCount += 1
      return (requestCount === 1 ? oldRequest.promise : newRequest.promise) as Promise<ApiListResponse<T>>
    },
    async handleUnauthorized() { return false }
  })

  const oldLoad = catalog.loadPlaces()
  const newLoad = catalog.loadPlaces()
  newRequest.resolve(response([place('new')]))
  await newLoad
  oldRequest.resolve(response([place('old')]))
  await oldLoad

  assert.deepEqual(catalogState.places.value.map(item => item.id), ['new'])
  assert.equal(catalogState.selectedPlaceId.value, 'new')
  assert.equal(catalogState.placesLoading.value, false)
})

test('stale observation failures cannot replace the latest filter result', async () => {
  const catalogState = state()
  const oldRequest = deferred<ApiListResponse<ApiCoordinateObservation>>()
  const newRequest = deferred<ApiListResponse<ApiCoordinateObservation>>()
  let requestCount = 0
  const queries: Array<Record<string, string | number>> = []
  const catalog = createFieldObservationCatalog({
    state: catalogState,
    request: async <T>(_endpoint, options) => {
      requestCount += 1
      queries.push(options.query)
      return (requestCount === 1 ? oldRequest.promise : newRequest.promise) as Promise<ApiListResponse<T>>
    },
    async handleUnauthorized() { return false }
  })

  catalogState.appliedSearch.value = '旧地点'
  const oldLoad = catalog.loadObservations()
  catalogState.appliedSearch.value = '新地点'
  const newLoad = catalog.loadObservations()
  newRequest.resolve(response([observation('new')]))
  await newLoad
  oldRequest.reject({ data: { statusMessage: '旧筛选请求失败' } })
  await oldLoad

  assert.deepEqual(queries.map(query => query.q), ['旧地点', '新地点'])
  assert.deepEqual(catalogState.observations.value.map(item => item.id), ['new'])
  assert.equal(catalogState.selectedObservationId.value, 'new')
  assert.equal(catalogState.observationsError.value, '')
  assert.equal(catalogState.observationsLoading.value, false)
})

test('out-of-range pages normalize using the server page size before selection changes', async () => {
  const catalogState = state()
  catalogState.page.value = 5
  catalogState.selectedObservationId.value = 'existing'
  catalogState.observations.value = [observation('existing')]
  const catalog = createFieldObservationCatalog({
    state: catalogState,
    async request<T>() { return response([] as T[], 21, 5, 10) },
    async handleUnauthorized() { return false }
  })

  await catalog.loadObservations()
  assert.equal(catalogState.page.value, 3)
  assert.equal(catalogState.total.value, 21)
  assert.equal(catalogState.selectedObservationId.value, 'existing')
  assert.deepEqual(catalogState.observations.value.map(item => item.id), ['existing'])
})

test('authorization and ordinary failures keep separate place and observation errors', async () => {
  const catalogState = state()
  let unauthorizedCount = 0
  const request: FieldObservationCatalogRequest = async (endpoint) => {
    if (endpoint === '/api/admin/places') throw { statusCode: 401 }
    throw { data: { statusMessage: '观测服务暂不可用' } }
  }
  const catalog = createFieldObservationCatalog({
    state: catalogState,
    request,
    async handleUnauthorized(error) {
      if ((error as { statusCode?: number }).statusCode !== 401) return false
      unauthorizedCount += 1
      return true
    }
  })

  await catalog.loadPlaces()
  await catalog.loadObservations()
  assert.equal(unauthorizedCount, 1)
  assert.equal(catalogState.placesError.value, '')
  assert.equal(catalogState.observationsError.value, '观测服务暂不可用')
  assert.equal(catalogState.placesLoading.value, false)
  assert.equal(catalogState.observationsLoading.value, false)
})

test('field observation page delegates debounce, request versions and pagination', () => {
  const page = readFileSync(resolve('app/pages/admin/field-observations.vue'), 'utf8')
  const composable = readFileSync(resolve('app/composables/useFieldObservationCatalog.ts'), 'utf8')
  const controller = readFileSync(resolve('app/utils/field-observation-catalog.ts'), 'utf8')

  assert.match(page, /useFieldObservationCatalog\(\{/)
  assert.doesNotMatch(page, /observationRequestId|searchTimer|async function loadPlaces/)
  assert.match(composable, /watch\(\[state\.status, state\.pageSize, state\.appliedSearch\]/)
  assert.match(composable, /catalog\.cancelCatalogRequests\(\)/)
  assert.match(controller, /observationsRequestVersion/)
  assert.doesNotMatch(controller, /\$fetch|navigateTo|useRoute|ref\(|computed\(/)
})
