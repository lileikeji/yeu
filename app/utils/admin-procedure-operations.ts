import type { ApiProcedure } from '~~/shared/types/server'
import type { Ref } from 'vue'
import type { ProcedureForm } from '../components/admin/procedure-editor-types'
import { buildProcedurePayload, validateProcedureForm } from './admin-procedure-form'
import { getRequestMessage } from './request-error'

export type ProcedureRowAction = 'publish' | 'unpublish'

export interface AdminProcedureOperationState {
  editorOpen: Ref<boolean>
  editorLoading: Ref<boolean>
  editingId: Ref<string | null>
  saving: Ref<boolean>
  formError: Ref<string>
  rowActionId: Ref<string | null>
  deleteOpen: Ref<boolean>
  deleteTarget: Ref<ApiProcedure | null>
  deleting: Ref<boolean>
}

export interface ProcedureRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown>
  credentials: 'include'
}

export interface ProcedureNotification {
  title: string
  description?: string
  color: 'success' | 'warning' | 'error'
}

interface CreateAdminProcedureOperationsOptions {
  state: AdminProcedureOperationState
  form: ProcedureForm
  resetForm: () => void
  fillForm: (procedure: ApiProcedure) => void
  loadReferences: (force?: boolean) => Promise<void>
  reloadProcedures: () => Promise<void>
  request: (endpoint: string, options: ProcedureRequestOptions) => Promise<unknown>
  handleUnauthorized: (error: unknown) => Promise<boolean>
  notify: (notification: ProcedureNotification) => void
}

export function createAdminProcedureOperations(options: CreateAdminProcedureOperationsOptions) {
  const state = options.state
  let editorRequestVersion = 0

  function invalidateEditorRequest(): void {
    editorRequestVersion += 1
    state.editorLoading.value = false
  }

  function resetEditorForm(): void {
    options.resetForm()
    state.formError.value = ''
  }

  async function openCreate(): Promise<void> {
    invalidateEditorRequest()
    state.editingId.value = null
    resetEditorForm()
    state.editorOpen.value = true
    await options.loadReferences()
  }

  async function openEdit(procedure: ApiProcedure): Promise<void> {
    const requestVersion = ++editorRequestVersion
    state.editingId.value = procedure.id
    resetEditorForm()
    state.editorOpen.value = true
    state.editorLoading.value = true

    try {
      const [detail] = await Promise.all([
        options.request(`/api/admin/procedures/${encodeURIComponent(procedure.id)}`, {
          credentials: 'include'
        }),
        options.loadReferences()
      ])
      if (requestVersion !== editorRequestVersion || state.editingId.value !== procedure.id) return
      options.fillForm(detail as ApiProcedure)
    } catch (error) {
      if (requestVersion !== editorRequestVersion) return
      const unauthorized = await options.handleUnauthorized(error)
      if (requestVersion !== editorRequestVersion || unauthorized) return
      state.formError.value = getRequestMessage(error, '流程详情加载失败，请关闭后重试。')
    } finally {
      if (requestVersion === editorRequestVersion) state.editorLoading.value = false
    }
  }

  async function saveProcedure(): Promise<void> {
    if (state.saving.value) return
    const validationError = validateProcedureForm(options.form)
    if (validationError) {
      state.formError.value = validationError
      return
    }

    const procedureId = state.editingId.value
    state.saving.value = true
    state.formError.value = ''

    try {
      const endpoint = procedureId
        ? `/api/admin/procedures/${encodeURIComponent(procedureId)}`
        : '/api/admin/procedures'
      await options.request(endpoint, {
        method: procedureId ? 'PATCH' : 'POST',
        body: buildProcedurePayload(options.form),
        credentials: 'include'
      })
      state.editorOpen.value = false
      options.notify({
        title: procedureId ? '流程已更新' : '流程草稿已创建',
        color: 'success'
      })
      await options.reloadProcedures()
    } catch (error) {
      if (await options.handleUnauthorized(error)) return
      state.formError.value = getRequestMessage(error, '保存失败，请检查字段和关联内容后重试。')
    } finally {
      state.saving.value = false
    }
  }

  async function runRowAction(
    procedure: ApiProcedure,
    action: ProcedureRowAction
  ): Promise<void> {
    if (state.rowActionId.value) return
    state.rowActionId.value = procedure.id

    try {
      await options.request(
        `/api/admin/procedures/${encodeURIComponent(procedure.id)}/${action}`,
        { method: 'POST', credentials: 'include' }
      )
      options.notify({
        title: action === 'publish' ? '流程已发布' : '流程已下架',
        color: action === 'publish' ? 'success' : 'warning'
      })
      await options.reloadProcedures()
    } catch (error) {
      if (await options.handleUnauthorized(error)) return
      options.notify({
        title: action === 'publish' ? '发布失败' : '下架失败',
        description: getRequestMessage(error, '请稍后重试。'),
        color: 'error'
      })
    } finally {
      state.rowActionId.value = null
    }
  }

  function requestDelete(procedure: ApiProcedure): void {
    if (state.deleting.value) return
    state.deleteTarget.value = procedure
    state.deleteOpen.value = true
  }

  async function deleteProcedure(): Promise<void> {
    const target = state.deleteTarget.value
    if (!target || state.deleting.value) return
    state.deleting.value = true

    try {
      await options.request(`/api/admin/procedures/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      state.deleteOpen.value = false
      state.deleteTarget.value = null
      options.notify({ title: '流程已删除并归档', color: 'success' })
      await options.reloadProcedures()
    } catch (error) {
      if (await options.handleUnauthorized(error)) return
      options.notify({
        title: '删除失败',
        description: getRequestMessage(error, '请稍后重试。'),
        color: 'error'
      })
    } finally {
      state.deleting.value = false
    }
  }

  return {
    ...state,
    invalidateEditorRequest,
    openCreate,
    openEdit,
    saveProcedure,
    runRowAction,
    requestDelete,
    deleteProcedure
  }
}
