import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ApiContent,
  ApiListResponse,
  ApiPlace,
  ApiProcedure,
  ApiSource
} from '../shared/types/server'
import type {
  AdminCatalogRequest,
  AdminProcedureCatalogState
} from '../app/utils/admin-procedure-catalog'
import {
  buildAdminProcedureListQuery,
  createAdminProcedureCatalog,
  fetchAllAdminCatalogItems,
  loadAdminProcedureReferenceSnapshot
} from '../app/utils/admin-procedure-catalog'

function procedure(id: string): ApiProcedure {
  return { id, title: id } as ApiProcedure
}

function content(id: string, status: 'draft' | 'published' | 'archived' = 'published'): ApiContent {
  return { id, title: id, status } as ApiContent
}

function place(id: string, status: 'draft' | 'published' | 'archived' = 'published'): ApiPlace {
  return { id, name: id, status } as ApiPlace
}

function source(id: string): ApiSource {
  return { id, title: id, status: 'active' } as ApiSource
}

function state(): AdminProcedureCatalogState {
  const value = <T>(initial: T) => ({ value: initial })
  return {
    procedures: value<ApiProcedure[]>([]),
    total: value(0),
    page: value(1),
    loading: value(false),
    loadError: value(''),
    searchQuery: value(''),
    statusFilter: value<'all' | ApiProcedure['status']>('all'),
    referencesLoading: value(false),
    referencesLoaded: value(false),
    referencesError: value(''),
    departments: value<ApiContent[]>([]),
    guides: value<ApiContent[]>([]),
    places: value<ApiPlace[]>([]),
    sources: value<ApiSource[]>([])
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

function response<T>(items: T[], total = items.length): ApiListResponse<T> {
  return { items, total, page: 1, pageSize: 200 }
}

function referenceResponse<T>(
  endpoint: string,
  query: Record<string, string | number>,
  label: string
): ApiListResponse<T> {
  if (endpoint === '/api/admin/content') {
    return response([content(`${label}-${query.kind}`)] as T[])
  }
  if (endpoint === '/api/admin/places') return response([place(`${label}-place`)] as T[])
  return response([source(`${label}-source`)] as T[])
}

test('list query trims search text and omits default filters', () => {
  assert.deepEqual(buildAdminProcedureListQuery(2, 20, '  报到  ', 'published'), {
    page: 2,
    pageSize: 20,
    q: '报到',
    status: 'published'
  })
  assert.deepEqual(buildAdminProcedureListQuery(1, 20, '   ', 'all'), {
    page: 1,
    pageSize: 20
  })
})

test('catalog pagination merges every page with stable query fields', async () => {
  const queries: Array<Record<string, string | number>> = []
  const request: AdminCatalogRequest = async <T>(_endpoint, options) => {
    queries.push(options.query)
    const page = Number(options.query.page)
    return response(
      (page === 1 ? [content('one'), content('two')] : [content('three')]) as T[],
      3
    )
  }

  const items = await fetchAllAdminCatalogItems<ApiContent>(
    request,
    '/api/admin/content',
    { kind: 'guide' }
  )
  assert.deepEqual(items.map(item => item.id), ['one', 'two', 'three'])
  assert.deepEqual(queries, [
    { kind: 'guide', page: 1, pageSize: 200 },
    { kind: 'guide', page: 2, pageSize: 200 }
  ])
})

test('catalog pagination rejects a non-progressing empty page', async () => {
  const request: AdminCatalogRequest = async <T>() => response([] as T[], 2)
  await assert.rejects(
    fetchAllAdminCatalogItems(request, '/api/admin/content'),
    /后台分页响应未返回剩余数据/
  )
})

test('a stale list response or error cannot overwrite the latest search', async () => {
  const catalogState = state()
  const oldRequest = deferred<ApiListResponse<ApiProcedure>>()
  const newRequest = deferred<ApiListResponse<ApiProcedure>>()
  let requestCount = 0
  const catalog = createAdminProcedureCatalog({
    state: catalogState,
    pageSize: 20,
    request: async <T>() => {
      requestCount += 1
      return (requestCount === 1 ? oldRequest.promise : newRequest.promise) as Promise<ApiListResponse<T>>
    },
    async handleUnauthorized() { return false }
  })

  catalogState.searchQuery.value = '旧搜索'
  const oldLoad = catalog.loadProcedures()
  catalogState.searchQuery.value = '新搜索'
  const newLoad = catalog.loadProcedures()
  newRequest.resolve(response([procedure('new')]))
  await newLoad
  oldRequest.reject({ data: { message: '旧请求失败' } })
  await oldLoad

  assert.deepEqual(catalogState.procedures.value.map(item => item.id), ['new'])
  assert.equal(catalogState.loadError.value, '')
  assert.equal(catalogState.loading.value, false)
})

test('an out-of-range page is normalized and reloaded once', async () => {
  const catalogState = state()
  catalogState.page.value = 4
  const pages: number[] = []
  const catalog = createAdminProcedureCatalog({
    state: catalogState,
    pageSize: 20,
    request: async <T>(_endpoint, options) => {
      const page = Number(options.query.page)
      pages.push(page)
      return response((page === 2 ? [procedure('last-page')] : []) as T[], 21)
    },
    async handleUnauthorized() { return false }
  })

  await catalog.loadProcedures()
  assert.deepEqual(pages, [4, 2])
  assert.equal(catalogState.page.value, 2)
  assert.equal(catalogState.total.value, 21)
  assert.deepEqual(catalogState.procedures.value.map(item => item.id), ['last-page'])
  assert.equal(catalogState.loading.value, false)
})

test('reference snapshot loads all endpoints and removes archived relations', async () => {
  const calls: string[] = []
  const request: AdminCatalogRequest = async <T>(endpoint, options) => {
    calls.push(`${endpoint}?kind=${options.query.kind ?? ''}`)
    if (endpoint === '/api/admin/content') {
      return response([
        content(`active-${options.query.kind}`),
        content(`archived-${options.query.kind}`, 'archived')
      ] as T[])
    }
    if (endpoint === '/api/admin/places') {
      return response([place('active-place'), place('archived-place', 'archived')] as T[])
    }
    return response([source('source') as T])
  }

  const snapshot = await loadAdminProcedureReferenceSnapshot(request)
  assert.deepEqual(snapshot.departments.map(item => item.id), ['active-department'])
  assert.deepEqual(snapshot.guides.map(item => item.id), ['active-guide'])
  assert.deepEqual(snapshot.places.map(item => item.id), ['active-place'])
  assert.deepEqual(snapshot.sources.map(item => item.id), ['source'])
  assert.deepEqual(calls.sort(), [
    '/api/admin/content?kind=department',
    '/api/admin/content?kind=guide',
    '/api/admin/places?kind=',
    '/api/admin/sources?kind='
  ])
})

test('forced reference reload supersedes an in-flight snapshot', async () => {
  const catalogState = state()
  const oldRequests = Array.from({ length: 4 }, () => deferred<ApiListResponse<unknown>>())
  let requestCount = 0
  const catalog = createAdminProcedureCatalog({
    state: catalogState,
    pageSize: 20,
    request: async <T>(endpoint, options) => {
      requestCount += 1
      if (requestCount <= 4) {
        return oldRequests[requestCount - 1]!.promise as Promise<ApiListResponse<T>>
      }
      return referenceResponse<T>(endpoint, options.query, 'new')
    },
    async handleUnauthorized() { return false }
  })

  const oldLoad = catalog.loadReferences()
  await catalog.loadReferences()
  assert.equal(requestCount, 4)
  await catalog.loadReferences(true)
  assert.equal(requestCount, 8)

  oldRequests[0]!.resolve(response([content('old-department')]))
  oldRequests[1]!.resolve(response([content('old-guide')]))
  oldRequests[2]!.resolve(response([place('old-place')]))
  oldRequests[3]!.resolve(response([source('old-source')]))
  await oldLoad

  assert.deepEqual(catalogState.departments.value.map(item => item.id), ['new-department'])
  assert.deepEqual(catalogState.sources.value.map(item => item.id), ['new-source'])
  assert.equal(catalogState.referencesLoaded.value, true)
  assert.equal(catalogState.referencesLoading.value, false)
})

test('authorization and ordinary list failures keep distinct state', async () => {
  const authorizationState = state()
  authorizationState.procedures.value = [procedure('existing')]
  let unauthorizedCount = 0
  const authorizationCatalog = createAdminProcedureCatalog({
    state: authorizationState,
    pageSize: 20,
    async request() { throw { response: { status: 401 } } },
    async handleUnauthorized() {
      unauthorizedCount += 1
      return true
    }
  })
  await authorizationCatalog.loadProcedures()
  assert.equal(unauthorizedCount, 1)
  assert.deepEqual(authorizationState.procedures.value.map(item => item.id), ['existing'])
  assert.equal(authorizationState.loadError.value, '')

  const errorState = state()
  errorState.procedures.value = [procedure('stale')]
  const errorCatalog = createAdminProcedureCatalog({
    state: errorState,
    pageSize: 20,
    async request() { throw { data: { statusMessage: '数据库暂不可用' } } },
    async handleUnauthorized() { return false }
  })
  await errorCatalog.loadProcedures()
  assert.deepEqual(errorState.procedures.value, [])
  assert.equal(errorState.total.value, 0)
  assert.equal(errorState.loadError.value, '数据库暂不可用')
})
