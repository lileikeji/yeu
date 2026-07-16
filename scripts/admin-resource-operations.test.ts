import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { AdminRecord, AdminResourceConfig } from '../app/components/admin/types'
import type {
  AdminResourceOperationNotification,
  AdminResourceOperationState,
  AdminResourceWriteRequestOptions
} from '../app/utils/admin-resource-operations'
import { createAdminResourceOperations } from '../app/utils/admin-resource-operations'

function value<T>(initial: T) {
  return { value: initial }
}

function state(): AdminResourceOperationState {
  return {
    editorOpen: value(false),
    editingRecord: value<AdminRecord | null>(null),
    saving: value(false),
    formError: value(''),
    deleteOpen: value(false),
    deleteTarget: value<AdminRecord | null>(null),
    deleting: value(false),
    rowActionId: value<string | null>(null)
  }
}

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
    fields: []
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

interface HarnessOverrides {
  operationState?: AdminResourceOperationState
  page?: { value: number }
  currentConfig?: () => AdminResourceConfig
  request?: (endpoint: string, options: AdminResourceWriteRequestOptions) => Promise<unknown>
  validateForm?: () => string | null
  buildPayload?: () => AdminRecord
  handleUnauthorized?: (error: unknown) => Promise<boolean>
  recordCount?: () => number
}

function harness(overrides: HarnessOverrides = {}) {
  const operationState = overrides.operationState ?? state()
  const page = overrides.page ?? value(1)
  const notifications: AdminResourceOperationNotification[] = []
  const initialized: Array<AdminRecord | null> = []
  let reloads = 0
  const operations = createAdminResourceOperations({
    state: operationState,
    page,
    getConfig: overrides.currentConfig ?? (() => config()),
    getRecordCount: overrides.recordCount ?? (() => 2),
    request: overrides.request ?? (async () => undefined),
    reloadRecords: async () => { reloads += 1 },
    initializeForm: record => initialized.push(record),
    validateForm: overrides.validateForm ?? (() => null),
    buildPayload: overrides.buildPayload ?? (() => ({ title: 'payload' })),
    handleUnauthorized: overrides.handleUnauthorized ?? (async () => false),
    notify: notification => notifications.push(notification)
  })
  return {
    operationState,
    page,
    notifications,
    initialized,
    operations,
    getReloads: () => reloads
  }
}

test('create and edit initialize the form while validation blocks requests', async () => {
  let requestCount = 0
  const record = { id: 'edit-id', title: '编辑记录' }
  const testHarness = harness({
    validateForm: () => '请填写标题',
    request: async () => { requestCount += 1 }
  })

  testHarness.operations.openCreate()
  assert.equal(testHarness.operationState.editorOpen.value, true)
  assert.equal(testHarness.operationState.editingRecord.value, null)
  testHarness.operations.openEdit(record)
  assert.equal(testHarness.operationState.editingRecord.value, record)
  assert.deepEqual(testHarness.initialized, [null, record])

  await testHarness.operations.saveRecord()
  assert.equal(requestCount, 0)
  assert.equal(testHarness.operationState.formError.value, '请填写标题')
})

test('create save blocks duplicates, closes on success and reloads once', async () => {
  const pending = deferred<unknown>()
  const calls: Array<{ endpoint: string, options: AdminResourceWriteRequestOptions }> = []
  const testHarness = harness({
    request: (endpoint, options) => {
      calls.push({ endpoint, options })
      return pending.promise
    },
    buildPayload: () => ({ title: '新记录' })
  })
  testHarness.operationState.editorOpen.value = true

  const first = testHarness.operations.saveRecord()
  await testHarness.operations.saveRecord()
  assert.equal(testHarness.operationState.saving.value, true)
  assert.deepEqual(calls, [{
    endpoint: '/api/admin/content',
    options: {
      method: 'POST',
      body: { title: '新记录' },
      credentials: 'include'
    }
  }])
  pending.resolve(undefined)
  await first

  assert.equal(testHarness.operationState.editorOpen.value, false)
  assert.equal(testHarness.operationState.saving.value, false)
  assert.equal(testHarness.getReloads(), 1)
  assert.deepEqual(testHarness.notifications, [{ title: '记录已创建', color: 'success' }])
})

test('edit save uses a snapshot endpoint and preserves ordinary errors', async () => {
  const testHarness = harness({
    request: async () => { throw { data: { statusMessage: '记录版本已变化' } } }
  })
  testHarness.operationState.editorOpen.value = true
  testHarness.operationState.editingRecord.value = { id: 'a/b' }

  await testHarness.operations.saveRecord()
  assert.equal(testHarness.operationState.editorOpen.value, true)
  assert.equal(testHarness.operationState.formError.value, '记录版本已变化')
  assert.equal(testHarness.operationState.saving.value, false)
})

test('resource reset invalidates an in-flight save without stale success effects', async () => {
  const pending = deferred<unknown>()
  const testHarness = harness({ request: async () => pending.promise })
  testHarness.operationState.editorOpen.value = true
  const save = testHarness.operations.saveRecord()

  testHarness.operations.resetOperationState()
  pending.resolve(undefined)
  await save
  assert.equal(testHarness.operationState.editorOpen.value, false)
  assert.equal(testHarness.operationState.saving.value, false)
  assert.deepEqual(testHarness.notifications, [])
  assert.equal(testHarness.getReloads(), 0)
})

test('publication actions are globally exclusive and action-specific', async () => {
  const pending = deferred<unknown>()
  const calls: Array<{ endpoint: string, options: AdminResourceWriteRequestOptions }> = []
  const testHarness = harness({
    request: (endpoint, options) => {
      calls.push({ endpoint, options })
      return pending.promise
    }
  })

  const publication = testHarness.operations.setPublicationStatus({ id: 'one' }, 'published')
  await testHarness.operations.setPublicationStatus({ id: 'two' }, 'archived')
  testHarness.operations.requestDelete({ id: 'three' })
  testHarness.operations.openCreate()
  assert.equal(testHarness.operationState.rowActionId.value, 'one')
  assert.equal(testHarness.operationState.deleteOpen.value, false)
  assert.deepEqual(testHarness.initialized, [])
  assert.deepEqual(calls, [{
    endpoint: '/api/admin/content/one',
    options: { method: 'PUT', body: { status: 'published' }, credentials: 'include' }
  }])

  pending.resolve(undefined)
  await publication
  assert.equal(testHarness.operationState.rowActionId.value, null)
  assert.deepEqual(testHarness.notifications, [{ title: '内容已发布', color: 'success' }])
  assert.equal(testHarness.getReloads(), 1)
})

test('row failures distinguish ordinary errors from authorization navigation', async () => {
  const ordinary = harness({
    request: async () => { throw { data: { message: '禁止发布' } } }
  })
  await ordinary.operations.setPublicationStatus({ id: 'one' }, 'published')
  assert.deepEqual(ordinary.notifications, [{
    title: '操作失败',
    description: '禁止发布',
    color: 'error'
  }])

  let authorizationCount = 0
  const authorized = harness({
    request: async () => { throw { statusCode: 401 } },
    handleUnauthorized: async () => {
      authorizationCount += 1
      return true
    }
  })
  await authorized.operations.setPublicationStatus({ id: 'two' }, 'archived')
  assert.equal(authorizationCount, 1)
  assert.deepEqual(authorized.notifications, [])
  assert.equal(authorized.operationState.rowActionId.value, null)
})

test('delete snapshots its target, blocks duplicates and adjusts the last page', async () => {
  const pending = deferred<unknown>()
  const calls: string[] = []
  const page = value(2)
  const testHarness = harness({
    page,
    recordCount: () => 1,
    request: async (endpoint) => {
      calls.push(endpoint)
      return pending.promise
    }
  })
  const originalTarget = { id: 'delete-me', title: '原目标' }
  testHarness.operations.requestDelete(originalTarget)
  const deletion = testHarness.operations.deleteRecord()
  testHarness.operationState.deleteTarget.value = { id: 'replacement' }
  await testHarness.operations.deleteRecord()
  assert.deepEqual(calls, ['/api/admin/content/delete-me'])

  pending.resolve(undefined)
  await deletion
  assert.equal(page.value, 1)
  assert.equal(testHarness.operationState.deleteOpen.value, false)
  assert.equal(testHarness.operationState.deleting.value, false)
  assert.equal(testHarness.getReloads(), 1)
  assert.deepEqual(testHarness.notifications, [{ title: '记录已删除', color: 'success' }])
})

test('delete failures preserve confirmation context and expose server messages', async () => {
  const target = { id: 'failed-delete' }
  const testHarness = harness({
    request: async () => { throw { data: { statusMessage: '记录仍被引用' } } }
  })
  testHarness.operations.requestDelete(target)
  await testHarness.operations.deleteRecord()
  assert.equal(testHarness.operationState.deleteOpen.value, true)
  assert.equal(testHarness.operationState.deleteTarget.value, target)
  assert.equal(testHarness.operationState.deleting.value, false)
  assert.deepEqual(testHarness.notifications, [{
    title: '删除失败',
    description: '记录仍被引用',
    color: 'error'
  }])
})

test('resource manager delegates write state and disables overlapping controls', () => {
  const manager = readFileSync(resolve('app/components/admin/AdminResourceManager.vue'), 'utf8')
  const composable = readFileSync(resolve('app/composables/useAdminResourceOperations.ts'), 'utf8')
  const controller = readFileSync(resolve('app/utils/admin-resource-operations.ts'), 'utf8')

  assert.match(manager, /useAdminResourceOperations\(\{/)
  assert.doesNotMatch(manager, /async function (saveRecord|updateRecord|deleteRecord)/)
  assert.match(manager, /:disabled="writeBusy"/)
  assert.match(manager, /:write-busy="writeBusy"/)
  const catalogPanel = readFileSync(resolve('app/components/admin/AdminResourceCatalogPanel.vue'), 'utf8')
  assert.match(catalogPanel, /:disabled="writeBusy"/)
  assert.match(composable, /options\.config\.value\.key, operations\.resetOperationState/)
  assert.match(controller, /currentVersion !== operationVersion/)
  assert.match(controller, /if \(isWriteBusy\(\)\) return/)
  assert.doesNotMatch(controller, /\$fetch|navigateTo|useRoute|useRouter|ref\(|reactive\(/)
})
