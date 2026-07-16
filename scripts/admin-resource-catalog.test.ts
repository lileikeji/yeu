import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { AdminResourceConfig } from '../app/components/admin/types'
import type { AdminResourceCatalogState } from '../app/utils/admin-resource-catalog'
import {
  buildAdminResourceQuery,
  createAdminResourceCatalog,
  resetAdminResourceFilters
} from '../app/utils/admin-resource-catalog'

function config(key = 'content'): AdminResourceConfig {
  return {
    key,
    title: key,
    description: key,
    icon: 'icon',
    endpoint: `/api/admin/${key}`,
    createLabel: '新增',
    searchPlaceholder: '搜索',
    rowTitleKey: 'title',
    columns: [],
    fields: [],
    filters: [
      { key: 'status', label: '状态', allLabel: '全部', options: [] },
      { key: 'kind', label: '类型', allLabel: '全部', options: [] }
    ],
    stats: { responseKey: 'metrics', items: [] }
  }
}

function state(): AdminResourceCatalogState {
  const value = <T>(initial: T) => ({ value: initial })
  return {
    records: value([]),
    total: value(0),
    stats: value({}),
    page: value(1),
    loading: value(false),
    loadError: value(''),
    searchQuery: value(''),
    filterValues: {}
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

test('resource query trims search and omits empty or all filters', () => {
  assert.deepEqual(buildAdminResourceQuery(2, 20, '  新生  ', {
    status: 'published',
    kind: 'all',
    empty: ''
  }), {
    page: 2,
    pageSize: 20,
    q: '新生',
    status: 'published'
  })
})

test('filter reset removes stale keys and initializes configured filters', () => {
  const filters = { old: 'value', status: 'published' }
  resetAdminResourceFilters(filters, config())
  assert.deepEqual(filters, { status: 'all', kind: 'all' })
})

test('stale list responses and failures cannot overwrite the latest resource', async () => {
  const catalogState = state()
  const oldRequest = deferred<unknown>()
  const newRequest = deferred<unknown>()
  let currentConfig = config('content')
  let requestCount = 0
  const catalog = createAdminResourceCatalog({
    state: catalogState,
    pageSize: 20,
    getConfig: () => currentConfig,
    request: async () => {
      requestCount += 1
      return requestCount === 1 ? oldRequest.promise : newRequest.promise
    },
    async handleUnauthorized() { return false }
  })

  const oldLoad = catalog.loadRecords()
  currentConfig = config('places')
  const newLoad = catalog.loadRecords()
  newRequest.resolve({ items: [{ id: 'new-place' }], total: 1 })
  await newLoad
  oldRequest.reject({ data: { message: '旧内容请求失败' } })
  await oldLoad

  assert.deepEqual(catalogState.records.value.map(record => record.id), ['new-place'])
  assert.equal(catalogState.loadError.value, '')
  assert.equal(catalogState.loading.value, false)
})

test('out-of-range pages normalize and reload using the current endpoint', async () => {
  const catalogState = state()
  catalogState.page.value = 4
  const pages: number[] = []
  const endpoints: string[] = []
  const catalog = createAdminResourceCatalog({
    state: catalogState,
    pageSize: 20,
    getConfig: () => config('content'),
    request: async (endpoint, options) => {
      endpoints.push(endpoint)
      const page = Number(options.query.page)
      pages.push(page)
      return {
        items: page === 2 ? [{ id: 'last-page' }] : [],
        total: 21,
        metrics: { published: 2 }
      }
    },
    async handleUnauthorized() { return false }
  })

  await catalog.loadRecords()
  assert.deepEqual(pages, [4, 2])
  assert.deepEqual(endpoints, ['/api/admin/content', '/api/admin/content'])
  assert.equal(catalogState.page.value, 2)
  assert.deepEqual(catalogState.records.value.map(record => record.id), ['last-page'])
  assert.deepEqual(catalogState.stats.value, { published: 2 })
})

test('ordinary errors clear the catalog while authorization delegates without mutation', async () => {
  const ordinaryState = state()
  ordinaryState.records.value = [{ id: 'old' }]
  const ordinaryCatalog = createAdminResourceCatalog({
    state: ordinaryState,
    pageSize: 20,
    getConfig: () => config(),
    async request() { throw { data: { statusMessage: '目录暂不可用' } } },
    async handleUnauthorized() { return false }
  })
  await ordinaryCatalog.loadRecords()
  assert.deepEqual(ordinaryState.records.value, [])
  assert.equal(ordinaryState.loadError.value, '目录暂不可用')

  const authState = state()
  authState.records.value = [{ id: 'keep' }]
  let authorizationCount = 0
  const authCatalog = createAdminResourceCatalog({
    state: authState,
    pageSize: 20,
    getConfig: () => config(),
    async request() { throw { statusCode: 401 } },
    async handleUnauthorized() {
      authorizationCount += 1
      return true
    }
  })
  await authCatalog.loadRecords()
  assert.equal(authorizationCount, 1)
  assert.deepEqual(authState.records.value.map(record => record.id), ['keep'])
  assert.equal(authState.loadError.value, '')
})

test('catalog reset cancels requests and restores one clean resource state', async () => {
  const catalogState = state()
  catalogState.records.value = [{ id: 'old' }]
  catalogState.total.value = 7
  catalogState.stats.value = { old: 7 }
  catalogState.page.value = 3
  catalogState.searchQuery.value = 'old'
  Object.assign(catalogState.filterValues, { stale: 'value' })
  const pending = deferred<unknown>()
  const catalog = createAdminResourceCatalog({
    state: catalogState,
    pageSize: 20,
    getConfig: () => config(),
    request: async () => pending.promise,
    async handleUnauthorized() { return false }
  })
  const oldLoad = catalog.loadRecords()

  catalog.resetCatalogState()
  pending.resolve({ items: [{ id: 'stale' }], total: 1 })
  await oldLoad
  assert.deepEqual(catalogState.records.value, [])
  assert.equal(catalogState.total.value, 0)
  assert.deepEqual(catalogState.stats.value, {})
  assert.equal(catalogState.page.value, 1)
  assert.equal(catalogState.searchQuery.value, '')
  assert.deepEqual(catalogState.filterValues, { status: 'all', kind: 'all' })
})

test('page changes clamp to range and request only real changes', async () => {
  const catalogState = state()
  catalogState.total.value = 45
  const pages: number[] = []
  const catalog = createAdminResourceCatalog({
    state: catalogState,
    pageSize: 20,
    getConfig: () => config(),
    request: async (_endpoint, options) => {
      pages.push(Number(options.query.page))
      return { items: [], total: 45 }
    },
    async handleUnauthorized() { return false }
  })

  await catalog.changePage(99)
  await catalog.changePage(3)
  assert.equal(catalogState.page.value, 3)
  assert.deepEqual(pages, [3])
})

test('resource manager delegates debounce, filters and request versions', () => {
  const manager = readFileSync(resolve('app/components/admin/AdminResourceManager.vue'), 'utf8')
  const composable = readFileSync(resolve('app/composables/useAdminResourceCatalog.ts'), 'utf8')
  const controller = readFileSync(resolve('app/utils/admin-resource-catalog.ts'), 'utf8')

  assert.match(manager, /useAdminResourceCatalog\(\{/)
  assert.doesNotMatch(manager, /searchTimer|async function loadRecords|function buildQuery/)
  assert.match(composable, /watch\(state\.searchQuery, scheduleSearch\)/)
  assert.match(composable, /watch\(state\.filterValues/)
  assert.match(composable, /options\.config\.value\.key/)
  assert.match(controller, /currentVersion !== requestVersion/)
  assert.doesNotMatch(controller, /\$fetch|navigateTo|useRoute|useRouter|ref\(|reactive\(/)
})
