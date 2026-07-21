import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApiProcedure } from '../shared/types/server'
import type { ProcedureForm } from '../app/components/admin/procedure-editor-types'
import type { AdminProcedureOperationState } from '../app/utils/admin-procedure-operations'
import { createAdminProcedureOperations } from '../app/utils/admin-procedure-operations'
import {
  getRequestMessage,
  getRequestStatusCode,
  isAuthorizationError,
  isSafeUiErrorMessage
} from '../app/utils/request-error'

function procedure(id: string, title = id): ApiProcedure {
  return { id, title } as ApiProcedure
}

function validForm(): ProcedureForm {
  return {
    slug: 'arrival-registration',
    title: '新生到校报到',
    summary: '核对身份并完成报到。',
    body: '',
    category: '',
    audience: ['undergraduate', 'transfer'],
    method: 'offline',
    informationState: 'confirmed',
    statusText: '已确认',
    processingTime: '',
    deadlineText: '',
    startsAt: '',
    endsAt: '',
    validFrom: '',
    validUntil: '',
    departmentId: '',
    guideId: '',
    lastVerifiedAt: '',
    sourceIds: [],
    placeIds: [],
    steps: [{
      key: 1,
      title: '核验身份',
      description: '',
      audience: ['undergraduate', 'transfer'],
      informationState: 'confirmed',
      timeText: '',
      placeId: '',
      departmentId: '',
      actionUrl: ''
    }],
    materials: []
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

function operationState(): AdminProcedureOperationState {
  const value = <T>(initial: T) => ({ value: initial })
  return {
    editorOpen: value(false),
    editorLoading: value(false),
    editingId: value<string | null>(null),
    saving: value(false),
    formError: value(''),
    rowActionId: value<string | null>(null),
    deleteOpen: value(false),
    deleteTarget: value<ApiProcedure | null>(null),
    deleting: value(false)
  }
}

test('request error helpers preserve nested messages and authorization status', () => {
  assert.equal(getRequestStatusCode({ statusCode: 401 }), 401)
  assert.equal(getRequestStatusCode({ response: { status: 403 } }), 403)
  assert.equal(getRequestStatusCode({ response: { status: '403' } }), null)
  assert.equal(isAuthorizationError({ response: { status: 403 } }), true)
  assert.equal(isAuthorizationError({ statusCode: 422 }), false)
  assert.equal(getRequestMessage({ data: { statusMessage: '字段无效' } }, '失败'), '字段无效')
  assert.equal(getRequestMessage({ data: { message: '关联不存在' } }, '失败'), '关联不存在')
  assert.equal(getRequestMessage(new Error('网络失败'), '失败'), '网络失败')
  assert.equal(getRequestMessage(null, '失败'), '失败')
  assert.equal(getRequestMessage({ message: 'SQLITE_ERROR: no such table' }, '失败'), '失败')
  assert.equal(getRequestMessage({ message: 'Error at foo (/home/user/app.ts:1:1)' }, '失败'), '失败')
  assert.equal(getRequestMessage({ message: 'password hash mismatch for secret token' }, '失败'), '失败')
  assert.equal(isSafeUiErrorMessage('字段无效'), true)
  assert.equal(isSafeUiErrorMessage('a'.repeat(201)), false)
  assert.equal(isSafeUiErrorMessage('C:\\Users\\x\\secret.env leak'), false)
  assert.equal(isSafeUiErrorMessage('ENOENT: no such file'), false)
})

test('a stale editor detail response cannot overwrite a newer procedure', async () => {
  const first = deferred<unknown>()
  const second = deferred<unknown>()
  const filled: string[] = []
  const operations = createAdminProcedureOperations({
    state: operationState(),
    form: validForm(),
    resetForm() {},
    fillForm(detail) { filled.push(detail.id) },
    async loadReferences() {},
    async reloadProcedures() {},
    request(endpoint) {
      return endpoint.endsWith('/first') ? first.promise : second.promise
    },
    async handleUnauthorized() { return false },
    notify() {}
  })

  const firstOpen = operations.openEdit(procedure('first'))
  const secondOpen = operations.openEdit(procedure('second'))
  second.resolve(procedure('second'))
  await secondOpen
  first.resolve(procedure('first'))
  await firstOpen

  assert.deepEqual(filled, ['second'])
  assert.equal(operations.editingId.value, 'second')
  assert.equal(operations.editorLoading.value, false)
})

test('opening create invalidates pending edit details', async () => {
  const detail = deferred<unknown>()
  let fillCount = 0
  let resetCount = 0
  const operations = createAdminProcedureOperations({
    state: operationState(),
    form: validForm(),
    resetForm() { resetCount += 1 },
    fillForm() { fillCount += 1 },
    async loadReferences() {},
    async reloadProcedures() {},
    request() { return detail.promise },
    async handleUnauthorized() { return false },
    notify() {}
  })

  const pendingEdit = operations.openEdit(procedure('old'))
  await operations.openCreate()
  detail.resolve(procedure('old'))
  await pendingEdit

  assert.equal(fillCount, 0)
  assert.equal(resetCount, 2)
  assert.equal(operations.editingId.value, null)
  assert.equal(operations.editorOpen.value, true)
})

test('stale asynchronous authorization handling cannot write an old detail error', async () => {
  const first = deferred<unknown>()
  const authorization = deferred<boolean>()
  const operations = createAdminProcedureOperations({
    state: operationState(),
    form: validForm(),
    resetForm() {},
    fillForm() {},
    async loadReferences() {},
    async reloadProcedures() {},
    request(endpoint) {
      if (endpoint.endsWith('/first')) return first.promise
      return Promise.resolve(procedure('second'))
    },
    handleUnauthorized() { return authorization.promise },
    notify() {}
  })

  const firstOpen = operations.openEdit(procedure('first'))
  first.reject({ data: { message: '旧详情失败' } })
  await Promise.resolve()
  await operations.openEdit(procedure('second'))
  authorization.resolve(false)
  await firstOpen

  assert.equal(operations.editingId.value, 'second')
  assert.equal(operations.formError.value, '')
})

test('save validates first and blocks duplicate create requests', async () => {
  const form = validForm()
  form.title = ''
  const save = deferred<unknown>()
  const calls: Array<{ endpoint: string, options: Record<string, unknown> }> = []
  const notifications: string[] = []
  let reloadCount = 0
  const operations = createAdminProcedureOperations({
    state: operationState(),
    form,
    resetForm() {},
    fillForm() {},
    async loadReferences() {},
    async reloadProcedures() { reloadCount += 1 },
    request(endpoint, options) {
      calls.push({ endpoint, options })
      return save.promise
    },
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })

  await operations.saveProcedure()
  assert.equal(operations.formError.value, '请填写流程标题')
  assert.equal(calls.length, 0)

  form.title = ' 新生到校报到 '
  operations.editorOpen.value = true
  const firstSave = operations.saveProcedure()
  const duplicateSave = operations.saveProcedure()
  assert.equal(operations.saving.value, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.endpoint, '/api/admin/procedures')
  assert.equal(calls[0]?.options.method, 'POST')
  assert.equal((calls[0]?.options.body as { title: string }).title, '新生到校报到')

  save.resolve({})
  await Promise.all([firstSave, duplicateSave])
  assert.equal(operations.saving.value, false)
  assert.equal(operations.editorOpen.value, false)
  assert.deepEqual(notifications, ['流程草稿已创建'])
  assert.equal(reloadCount, 1)
})

test('editing saves with PATCH and surfaces server errors without closing', async () => {
  const form = validForm()
  const requests: string[] = []
  const operations = createAdminProcedureOperations({
    state: operationState(),
    form,
    resetForm() {},
    fillForm() {},
    async loadReferences() {},
    async reloadProcedures() {},
    async request(endpoint, options) {
      requests.push(`${options.method ?? 'GET'} ${endpoint}`)
      if (options.method === 'PATCH') {
        throw { data: { statusMessage: '来源已失效' } }
      }
      return procedure('edit-id')
    },
    async handleUnauthorized() { return false },
    notify() {}
  })

  await operations.openEdit(procedure('edit-id'))
  await operations.saveProcedure()

  assert.deepEqual(requests, [
    'GET /api/admin/procedures/edit-id',
    'PATCH /api/admin/procedures/edit-id'
  ])
  assert.equal(operations.formError.value, '来源已失效')
  assert.equal(operations.editorOpen.value, true)
  assert.equal(operations.saving.value, false)
})

test('row actions allow only one request and report action-specific failures', async () => {
  const action = deferred<unknown>()
  const calls: string[] = []
  const notifications: Array<{ title: string, description?: string }> = []
  const operations = createAdminProcedureOperations({
    state: operationState(),
    form: validForm(),
    resetForm() {},
    fillForm() {},
    async loadReferences() {},
    async reloadProcedures() {},
    request(endpoint) {
      calls.push(endpoint)
      return action.promise
    },
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification) }
  })

  const publishing = operations.runRowAction(procedure('one'), 'publish')
  await operations.runRowAction(procedure('two'), 'unpublish')
  assert.deepEqual(calls, ['/api/admin/procedures/one/publish'])
  action.reject({ data: { message: '缺少发布来源' } })
  await publishing

  assert.deepEqual(notifications, [{ title: '发布失败', description: '缺少发布来源', color: 'error' }])
  assert.equal(operations.rowActionId.value, null)
})

test('delete snapshots its target, blocks duplicates and reloads after success', async () => {
  const deletion = deferred<unknown>()
  const calls: string[] = []
  const notifications: string[] = []
  let reloadCount = 0
  const target = procedure('delete/id', '待归档流程')
  const operations = createAdminProcedureOperations({
    state: operationState(),
    form: validForm(),
    resetForm() {},
    fillForm() {},
    async loadReferences() {},
    async reloadProcedures() { reloadCount += 1 },
    request(endpoint) {
      calls.push(endpoint)
      return deletion.promise
    },
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })

  operations.requestDelete(target)
  const firstDelete = operations.deleteProcedure()
  const duplicateDelete = operations.deleteProcedure()
  operations.requestDelete(procedure('replacement'))
  assert.deepEqual(calls, ['/api/admin/procedures/delete%2Fid'])
  assert.equal(operations.deleteTarget.value?.id, target.id)

  deletion.resolve({})
  await Promise.all([firstDelete, duplicateDelete])
  assert.equal(operations.deleteOpen.value, false)
  assert.equal(operations.deleteTarget.value, null)
  assert.equal(operations.deleting.value, false)
  assert.deepEqual(notifications, ['流程已删除并归档'])
  assert.equal(reloadCount, 1)
})

test('authorization failures are delegated without leaking generic errors', async () => {
  let unauthorizedCount = 0
  const notifications: string[] = []
  const operations = createAdminProcedureOperations({
    state: operationState(),
    form: validForm(),
    resetForm() {},
    fillForm() {},
    async loadReferences() {},
    async reloadProcedures() {},
    async request() { throw { response: { status: 401 } } },
    async handleUnauthorized(error) {
      if (!isAuthorizationError(error)) return false
      unauthorizedCount += 1
      return true
    },
    notify(notification) { notifications.push(notification.title) }
  })

  operations.editorOpen.value = true
  await operations.saveProcedure()
  await operations.runRowAction(procedure('protected'), 'publish')

  assert.equal(unauthorizedCount, 2)
  assert.deepEqual(notifications, [])
  assert.equal(operations.formError.value, '')
  assert.equal(operations.saving.value, false)
  assert.equal(operations.rowActionId.value, null)
})
