import type { Ref } from 'vue'
import type {
  CoordinateObservationSubmissionPayload,
  NewCoordinateObservationPayload,
  QueuedCoordinateObservation
} from './coordinate-observation-queue'
import { getRequestMessage, getRequestStatusCode } from './request-error'

export interface FieldObservationQueueState {
  queued: Ref<QueuedCoordinateObservation[]>
  submitting: Ref<boolean>
  syncing: Ref<boolean>
  retryingId: Ref<string | null>
  errors: Record<string, string>
  deleteOpen: Ref<boolean>
  deleteTarget: Ref<QueuedCoordinateObservation | null>
  deleting: Ref<boolean>
}

interface QueueNotification {
  title: string
  description?: string
  color: 'success' | 'warning' | 'error'
}

interface CreateFieldObservationQueueOperationsOptions {
  state: FieldObservationQueueState
  ensureSubmission: (
    payload: NewCoordinateObservationPayload
  ) => CoordinateObservationSubmissionPayload
  enqueue: (
    payload: CoordinateObservationSubmissionPayload
  ) => Promise<QueuedCoordinateObservation>
  list: () => Promise<QueuedCoordinateObservation[]>
  remove: (id: string) => Promise<void>
  submitToServer: (payload: CoordinateObservationSubmissionPayload) => Promise<void>
  reloadObservations: () => Promise<void>
  markSubmitted: (placeId: string) => void
  handleUnauthorized: (error: unknown) => Promise<boolean>
  notify: (notification: QueueNotification) => void
}

export function createFieldObservationQueueOperations(
  options: CreateFieldObservationQueueOperationsOptions
) {
  const state = options.state
  let loadRequestVersion = 0

  async function loadLocalQueue(): Promise<void> {
    const requestVersion = ++loadRequestVersion
    try {
      const records = await options.list()
      if (requestVersion === loadRequestVersion) state.queued.value = records
    } catch {
      if (requestVersion === loadRequestVersion) state.queued.value = []
    }
  }

  async function submitObservation(payload: NewCoordinateObservationPayload): Promise<void> {
    if (state.submitting.value) return
    state.submitting.value = true
    const submission = options.ensureSubmission(payload)
    try {
      await options.submitToServer(submission)
      options.markSubmitted(submission.placeId)
      options.notify({ title: '观测已进入审核队列', color: 'success' })
      await options.reloadObservations()
    } catch (error) {
      const code = getRequestStatusCode(error)
      if (code === null || code >= 500) {
        try {
          await options.enqueue(submission)
          options.markSubmitted(submission.placeId)
          await loadLocalQueue()
          options.notify({
            title: '网络不可用，观测已保存在本机',
            description: '稍后可在离线队列中逐条或批量同步。',
            color: 'warning'
          })
        } catch {
          options.notify({
            title: '观测提交失败',
            description: '本机离线队列也不可用。',
            color: 'error'
          })
        }
      } else if (!await options.handleUnauthorized(error)) {
        options.notify({
          title: '观测未提交',
          description: getRequestMessage(error, '请检查样本与说明。'),
          color: 'error'
        })
      }
    } finally {
      state.submitting.value = false
    }
  }

  async function retryQueuedObservation(record: QueuedCoordinateObservation): Promise<void> {
    if (state.syncing.value || state.retryingId.value) return
    state.retryingId.value = record.id
    Reflect.deleteProperty(state.errors, record.id)
    try {
      await options.submitToServer(record.payload)
      await options.remove(record.id)
      await Promise.all([loadLocalQueue(), options.reloadObservations()])
      options.notify({ title: '本地观测已同步', color: 'success' })
    } catch (error) {
      if (await options.handleUnauthorized(error)) return
      const message = getRequestMessage(error, '同步失败，记录仍保存在本机。')
      state.errors[record.id] = message
      options.notify({ title: '单条同步失败', description: message, color: 'warning' })
    } finally {
      if (state.retryingId.value === record.id) state.retryingId.value = null
    }
  }

  async function syncQueue(): Promise<void> {
    if (!state.queued.value.length || state.syncing.value || state.retryingId.value) return
    const records = [...state.queued.value]
    state.syncing.value = true
    let synced = 0
    let failed = 0
    let authorizationFailed = false
    try {
      for (const record of records) {
        Reflect.deleteProperty(state.errors, record.id)
        try {
          await options.submitToServer(record.payload)
          await options.remove(record.id)
          synced += 1
        } catch (error) {
          if (await options.handleUnauthorized(error)) {
            authorizationFailed = true
            break
          }
          failed += 1
          state.errors[record.id] = getRequestMessage(
            error,
            '同步失败，记录仍保存在本机。'
          )
        }
      }
      await Promise.all([loadLocalQueue(), options.reloadObservations()])
      if (authorizationFailed) return
      if (failed) {
        options.notify({
          title: `已同步 ${synced} 条，${failed} 条仍待处理`,
          description: '展开失败记录可查看原因并单独重试。',
          color: 'warning'
        })
      } else {
        options.notify({ title: `已同步 ${synced} 条本地观测`, color: 'success' })
      }
    } finally {
      state.syncing.value = false
    }
  }

  function requestQueueDeletion(record: QueuedCoordinateObservation): void {
    if (state.deleting.value) return
    state.deleteTarget.value = record
    state.deleteOpen.value = true
  }

  async function deleteQueuedObservation(): Promise<void> {
    const record = state.deleteTarget.value
    if (!record || state.deleting.value) return
    state.deleting.value = true
    try {
      await options.remove(record.id)
      Reflect.deleteProperty(state.errors, record.id)
      await loadLocalQueue()
      state.deleteOpen.value = false
      state.deleteTarget.value = null
      options.notify({ title: '本地观测已删除', color: 'success' })
    } catch {
      options.notify({
        title: '删除失败',
        description: '本地队列暂时不可用。',
        color: 'error'
      })
    } finally {
      state.deleting.value = false
    }
  }

  function cancelQueueLoads(): void {
    loadRequestVersion += 1
  }

  return {
    ...state,
    loadLocalQueue,
    submitObservation,
    retryQueuedObservation,
    syncQueue,
    requestQueueDeletion,
    deleteQueuedObservation,
    cancelQueueLoads
  }
}
