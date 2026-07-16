import type { Ref } from 'vue'
import type { AdminRecord, AdminResourceConfig } from '~/components/admin/types'
import { getAdminResourceRecordId } from './admin-resource-presentation'
import { getRequestMessage } from './request-error'

export interface AdminResourceWriteRequestOptions {
  method: 'POST' | 'PUT' | 'DELETE'
  body?: AdminRecord
  credentials: 'include'
}

export type AdminResourceWriteRequest = (
  endpoint: string,
  options: AdminResourceWriteRequestOptions
) => Promise<unknown>

export interface AdminResourceOperationNotification {
  title: string
  description?: string
  color: 'success' | 'error'
}

export interface AdminResourceOperationState {
  editorOpen: Ref<boolean>
  editingRecord: Ref<AdminRecord | null>
  saving: Ref<boolean>
  formError: Ref<string>
  deleteOpen: Ref<boolean>
  deleteTarget: Ref<AdminRecord | null>
  deleting: Ref<boolean>
  rowActionId: Ref<string | null>
}

interface CreateAdminResourceOperationsOptions {
  state: AdminResourceOperationState
  page: Ref<number>
  getConfig: () => AdminResourceConfig
  getRecordCount: () => number
  request: AdminResourceWriteRequest
  reloadRecords: () => Promise<void>
  initializeForm: (record: AdminRecord | null) => void
  validateForm: () => string | null
  buildPayload: () => AdminRecord
  handleUnauthorized: (error: unknown) => Promise<boolean>
  notify: (notification: AdminResourceOperationNotification) => void
}

export function createAdminResourceOperations(options: CreateAdminResourceOperationsOptions) {
  const state = options.state
  let operationVersion = 0

  function isWriteBusy(): boolean {
    return state.saving.value || state.deleting.value || state.rowActionId.value !== null
  }

  function openCreate(): void {
    if (isWriteBusy()) return
    state.editingRecord.value = null
    state.formError.value = ''
    options.initializeForm(null)
    state.editorOpen.value = true
  }

  function openEdit(record: AdminRecord): void {
    if (isWriteBusy()) return
    state.editingRecord.value = record
    state.formError.value = ''
    options.initializeForm(record)
    state.editorOpen.value = true
  }

  async function saveRecord(): Promise<void> {
    if (isWriteBusy()) return
    const validationError = options.validateForm()
    if (validationError) {
      state.formError.value = validationError
      return
    }

    const currentVersion = ++operationVersion
    const config = options.getConfig()
    const id = getAdminResourceRecordId(state.editingRecord.value)
    state.saving.value = true
    state.formError.value = ''

    try {
      await options.request(id
        ? `${config.endpoint}/${encodeURIComponent(id)}`
        : config.endpoint, {
        method: id ? 'PUT' : 'POST',
        body: options.buildPayload(),
        credentials: 'include'
      })
      if (currentVersion !== operationVersion) return
      state.editorOpen.value = false
      options.notify({
        title: id ? '记录已更新' : '记录已创建',
        color: 'success'
      })
      await options.reloadRecords()
    } catch (error) {
      if (currentVersion !== operationVersion) return
      const unauthorized = await options.handleUnauthorized(error)
      if (currentVersion !== operationVersion || unauthorized) return
      state.formError.value = getRequestMessage(error, '保存失败，请检查字段后重试。')
    } finally {
      if (currentVersion === operationVersion) state.saving.value = false
    }
  }

  async function updateRecord(
    record: AdminRecord,
    body: AdminRecord,
    successTitle: string
  ): Promise<void> {
    if (isWriteBusy()) return
    const id = getAdminResourceRecordId(record)
    if (!id) return
    const currentVersion = ++operationVersion
    const config = options.getConfig()
    state.rowActionId.value = id

    try {
      await options.request(`${config.endpoint}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body,
        credentials: 'include'
      })
      if (currentVersion !== operationVersion) return
      options.notify({ title: successTitle, color: 'success' })
      await options.reloadRecords()
    } catch (error) {
      if (currentVersion !== operationVersion) return
      const unauthorized = await options.handleUnauthorized(error)
      if (currentVersion !== operationVersion || unauthorized) return
      options.notify({
        title: '操作失败',
        description: getRequestMessage(error, '请稍后重试。'),
        color: 'error'
      })
    } finally {
      if (currentVersion === operationVersion) state.rowActionId.value = null
    }
  }

  async function setPublicationStatus(
    record: AdminRecord,
    status: 'published' | 'archived'
  ): Promise<void> {
    await updateRecord(
      record,
      { status },
      status === 'published' ? '内容已发布' : '内容已下架'
    )
  }

  function requestDelete(record: AdminRecord): void {
    if (isWriteBusy()) return
    state.deleteTarget.value = record
    state.deleteOpen.value = true
  }

  async function deleteRecord(): Promise<void> {
    if (isWriteBusy()) return
    const target = state.deleteTarget.value
    const id = getAdminResourceRecordId(target)
    if (!id) return
    const currentVersion = ++operationVersion
    const config = options.getConfig()
    state.deleting.value = true

    try {
      await options.request(`${config.endpoint}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (currentVersion !== operationVersion) return
      state.deleteOpen.value = false
      options.notify({ title: '记录已删除', color: 'success' })
      if (options.getRecordCount() === 1 && options.page.value > 1) {
        options.page.value -= 1
      }
      await options.reloadRecords()
    } catch (error) {
      if (currentVersion !== operationVersion) return
      const unauthorized = await options.handleUnauthorized(error)
      if (currentVersion !== operationVersion || unauthorized) return
      options.notify({
        title: '删除失败',
        description: getRequestMessage(error, '请稍后重试。'),
        color: 'error'
      })
    } finally {
      if (currentVersion === operationVersion) state.deleting.value = false
    }
  }

  function resetOperationState(): void {
    operationVersion += 1
    state.editorOpen.value = false
    state.editingRecord.value = null
    state.saving.value = false
    state.formError.value = ''
    state.deleteOpen.value = false
    state.deleteTarget.value = null
    state.deleting.value = false
    state.rowActionId.value = null
  }

  return {
    ...state,
    isWriteBusy,
    openCreate,
    openEdit,
    saveRecord,
    updateRecord,
    setPublicationStatus,
    requestDelete,
    deleteRecord,
    resetOperationState
  }
}
