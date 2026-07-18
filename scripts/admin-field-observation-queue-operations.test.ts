import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type {
  CoordinateObservationSubmissionPayload,
  NewCoordinateObservationPayload,
  QueuedCoordinateObservation
} from '../app/utils/coordinate-observation-queue'
import type { FieldObservationQueueState } from '../app/utils/field-observation-queue-operations'
import { createFieldObservationQueueOperations } from '../app/utils/field-observation-queue-operations'

function record(id: string): QueuedCoordinateObservation {
  return {
    id,
    queuedAt: '2026-07-16T08:30:00.000Z',
    payload: {
      clientObservationId: id,
      placeId: `place-${id}`,
      pointRole: 'main-entrance',
      evidenceNote: '现场说明',
      samples: []
    } as CoordinateObservationSubmissionPayload
  }
}

function state(records: QueuedCoordinateObservation[] = []): FieldObservationQueueState {
  const value = <T>(initial: T) => ({ value: initial })
  return {
    queued: value(records),
    submitting: value(false),
    syncing: value(false),
    retryingId: value<string | null>(null),
    errors: {},
    deleteOpen: value(false),
    deleteTarget: value<QueuedCoordinateObservation | null>(null),
    deleting: value(false)
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

function submission(id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') {
  return record(id).payload
}

test('stale queue reads cannot overwrite a newer IndexedDB snapshot', async () => {
  const queueState = state()
  const first = deferred<QueuedCoordinateObservation[]>()
  const second = deferred<QueuedCoordinateObservation[]>()
  let calls = 0
  const operations = createFieldObservationQueueOperations({
    state: queueState,
    ensureSubmission: payload => payload as CoordinateObservationSubmissionPayload,
    async enqueue(payload) { return { id: payload.clientObservationId, payload, queuedAt: '' } },
    list() {
      calls += 1
      return calls === 1 ? first.promise : second.promise
    },
    async remove() {},
    async submitToServer() {},
    async reloadObservations() {},
    markSubmitted() {},
    async handleUnauthorized() { return false },
    notify() {}
  })

  const oldLoad = operations.loadLocalQueue()
  const newLoad = operations.loadLocalQueue()
  second.resolve([record('new')])
  await newLoad
  first.resolve([record('old')])
  await oldLoad
  assert.deepEqual(queueState.queued.value.map(item => item.id), ['new'])
})

test('successful submission preserves one client id and blocks duplicate clicks', async () => {
  const queueState = state()
  const request = deferred<undefined>()
  const submittedIds: string[] = []
  const marked: string[] = []
  const notifications: string[] = []
  let reloadCount = 0
  const fixedSubmission = submission()
  const operations = createFieldObservationQueueOperations({
    state: queueState,
    ensureSubmission() { return fixedSubmission },
    async enqueue() { throw new Error('not expected') },
    async list() { return [] },
    async remove() {},
    submitToServer(payload) {
      submittedIds.push(payload.clientObservationId)
      return request.promise
    },
    async reloadObservations() { reloadCount += 1 },
    markSubmitted(placeId) { marked.push(placeId) },
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })

  const first = operations.submitObservation({} as NewCoordinateObservationPayload)
  const duplicate = operations.submitObservation({} as NewCoordinateObservationPayload)
  assert.equal(queueState.submitting.value, true)
  assert.deepEqual(submittedIds, [fixedSubmission.clientObservationId])
  request.resolve(undefined)
  await Promise.all([first, duplicate])

  assert.equal(queueState.submitting.value, false)
  assert.deepEqual(marked, [fixedSubmission.placeId])
  assert.deepEqual(notifications, ['定位记录已提交审核'])
  assert.equal(reloadCount, 1)
})

test('server outages enqueue the exact submission while queue failures are explicit', async () => {
  const queueState = state()
  const fixedSubmission = submission()
  const enqueuedIds: string[] = []
  const notifications: string[] = []
  let stored = [record(fixedSubmission.clientObservationId)]
  const operations = createFieldObservationQueueOperations({
    state: queueState,
    ensureSubmission() { return fixedSubmission },
    async enqueue(payload) {
      enqueuedIds.push(payload.clientObservationId)
      return record(payload.clientObservationId)
    },
    async list() { return stored },
    async remove() {},
    async submitToServer() { throw { statusCode: 503 } },
    async reloadObservations() {},
    markSubmitted() {},
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })
  await operations.submitObservation({} as NewCoordinateObservationPayload)
  assert.deepEqual(enqueuedIds, [fixedSubmission.clientObservationId])
  assert.deepEqual(queueState.queued.value.map(item => item.id), [fixedSubmission.clientObservationId])
  assert.deepEqual(notifications, ['网络不可用，定位记录已保存在本机'])

  stored = []
  const failedQueue = createFieldObservationQueueOperations({
    state: state(),
    ensureSubmission() { return fixedSubmission },
    async enqueue() { throw new Error('IndexedDB unavailable') },
    async list() { return stored },
    async remove() {},
    async submitToServer() { throw new TypeError('network') },
    async reloadObservations() {},
    markSubmitted() {},
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })
  await failedQueue.submitObservation({} as NewCoordinateObservationPayload)
  assert.equal(notifications.at(-1), '定位记录提交失败')
})

test('validation and authorization errors never enter the offline queue', async () => {
  const notifications: string[] = []
  let enqueueCount = 0
  let unauthorizedCount = 0
  let status = 422
  const operations = createFieldObservationQueueOperations({
    state: state(),
    ensureSubmission: () => submission(),
    async enqueue(payload) {
      enqueueCount += 1
      return record(payload.clientObservationId)
    },
    async list() { return [] },
    async remove() {},
    async submitToServer() {
      throw { statusCode: status, data: { statusMessage: '字段无效' } }
    },
    async reloadObservations() {},
    markSubmitted() {},
    async handleUnauthorized() {
      if (status !== 401) return false
      unauthorizedCount += 1
      return true
    },
    notify(notification) { notifications.push(notification.title) }
  })

  await operations.submitObservation({} as NewCoordinateObservationPayload)
  assert.deepEqual(notifications, ['定位记录未提交'])
  status = 401
  await operations.submitObservation({} as NewCoordinateObservationPayload)
  assert.equal(unauthorizedCount, 1)
  assert.equal(enqueueCount, 0)
  assert.deepEqual(notifications, ['定位记录未提交'])
})

test('single retry blocks overlap and keeps a failed record with its message', async () => {
  const first = record('first')
  const queueState = state([first])
  const request = deferred<undefined>()
  let submitCount = 0
  const notifications: string[] = []
  const operations = createFieldObservationQueueOperations({
    state: queueState,
    ensureSubmission: payload => payload as CoordinateObservationSubmissionPayload,
    async enqueue(payload) { return record(payload.clientObservationId) },
    async list() { return [first] },
    async remove() {},
    submitToServer() {
      submitCount += 1
      return request.promise
    },
    async reloadObservations() {},
    markSubmitted() {},
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })

  const retry = operations.retryQueuedObservation(first)
  await operations.retryQueuedObservation(record('second'))
  assert.equal(submitCount, 1)
  request.reject({ data: { statusMessage: '仍然离线' } })
  await retry
  assert.equal(queueState.retryingId.value, null)
  assert.equal(queueState.errors.first, '仍然离线')
  assert.deepEqual(notifications, ['单条同步失败'])
})

test('batch sync continues ordinary failures and reports an exact summary', async () => {
  const records = [record('one'), record('two'), record('three')]
  const queueState = state(records)
  const removed: string[] = []
  let stored = [...records]
  const notifications: string[] = []
  const operations = createFieldObservationQueueOperations({
    state: queueState,
    ensureSubmission: payload => payload as CoordinateObservationSubmissionPayload,
    async enqueue(payload) { return record(payload.clientObservationId) },
    async list() { return stored },
    async remove(id) {
      removed.push(id)
      stored = stored.filter(item => item.id !== id)
    },
    async submitToServer(payload) {
      if (payload.clientObservationId === 'two') {
        throw { data: { statusMessage: '样本冲突' } }
      }
    },
    async reloadObservations() {},
    markSubmitted() {},
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })

  await operations.syncQueue()
  assert.deepEqual(removed, ['one', 'three'])
  assert.deepEqual(queueState.queued.value.map(item => item.id), ['two'])
  assert.equal(queueState.errors.two, '样本冲突')
  assert.deepEqual(notifications, ['已同步 2 条，1 条仍待处理'])
  assert.equal(queueState.syncing.value, false)
})

test('authorization during batch sync refreshes state after earlier successes', async () => {
  const records = [record('one'), record('two'), record('three')]
  const queueState = state(records)
  let stored = [...records]
  const submitted: string[] = []
  let reloadCount = 0
  const notifications: string[] = []
  const operations = createFieldObservationQueueOperations({
    state: queueState,
    ensureSubmission: payload => payload as CoordinateObservationSubmissionPayload,
    async enqueue(payload) { return record(payload.clientObservationId) },
    async list() { return stored },
    async remove(id) { stored = stored.filter(item => item.id !== id) },
    async submitToServer(payload) {
      submitted.push(payload.clientObservationId)
      if (payload.clientObservationId === 'two') throw { statusCode: 401 }
    },
    async reloadObservations() { reloadCount += 1 },
    markSubmitted() {},
    async handleUnauthorized(error) { return (error as { statusCode?: number }).statusCode === 401 },
    notify(notification) { notifications.push(notification.title) }
  })

  await operations.syncQueue()
  assert.deepEqual(submitted, ['one', 'two'])
  assert.deepEqual(queueState.queued.value.map(item => item.id), ['two', 'three'])
  assert.equal(reloadCount, 1)
  assert.deepEqual(notifications, [])
  assert.equal(queueState.syncing.value, false)
})

test('delete snapshots its target, blocks duplicates and preserves failures', async () => {
  const target = record('delete-me')
  const queueState = state([target])
  const deletion = deferred<undefined>()
  let removeCount = 0
  let stored = [target]
  const notifications: string[] = []
  const operations = createFieldObservationQueueOperations({
    state: queueState,
    ensureSubmission: payload => payload as CoordinateObservationSubmissionPayload,
    async enqueue(payload) { return record(payload.clientObservationId) },
    async list() { return stored },
    remove() {
      removeCount += 1
      return deletion.promise
    },
    async submitToServer() {},
    async reloadObservations() {},
    markSubmitted() {},
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })

  operations.requestQueueDeletion(target)
  const firstDelete = operations.deleteQueuedObservation()
  const duplicateDelete = operations.deleteQueuedObservation()
  operations.requestQueueDeletion(record('replacement'))
  assert.equal(removeCount, 1)
  assert.equal(queueState.deleteTarget.value?.id, target.id)
  stored = []
  deletion.resolve(undefined)
  await Promise.all([firstDelete, duplicateDelete])
  assert.equal(queueState.deleteOpen.value, false)
  assert.equal(queueState.deleteTarget.value, null)
  assert.deepEqual(notifications, ['本地定位记录已删除'])
})

test('field observation page delegates queue storage and operation state', () => {
  const page = readFileSync(resolve('app/pages/admin/field-observations.vue'), 'utf8')
  const composable = readFileSync(resolve('app/composables/useFieldObservationQueue.ts'), 'utf8')
  const controller = readFileSync(
    resolve('app/utils/field-observation-queue-operations.ts'),
    'utf8'
  )

  assert.match(page, /useFieldObservationQueue\(\{/)
  assert.doesNotMatch(
    page,
    /function (loadLocalQueue|retryQueuedObservation|syncQueue|requestQueueDeletion|deleteQueuedObservation)/
  )
  assert.match(composable, /listQueuedCoordinateObservations/)
  assert.match(composable, /removeQueuedCoordinateObservation/)
  assert.doesNotMatch(controller, /\$fetch|indexedDB|useRoute|useRouter|ref\(|reactive\(/)
})
