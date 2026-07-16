import type { ApiProcedure } from '~~/shared/types/server'
import type { ProcedureForm } from '~/components/admin/procedure-editor-types'
import type {
  AdminProcedureOperationState,
  ProcedureNotification,
  ProcedureRequestOptions
} from '~/utils/admin-procedure-operations'
import { createAdminProcedureOperations } from '~/utils/admin-procedure-operations'

interface UseAdminProcedureOperationsOptions {
  form: ProcedureForm
  resetForm: () => void
  fillForm: (procedure: ApiProcedure) => void
  loadReferences: (force?: boolean) => Promise<void>
  reloadProcedures: () => Promise<void>
  request: (endpoint: string, options: ProcedureRequestOptions) => Promise<unknown>
  handleUnauthorized: (error: unknown) => Promise<boolean>
  notify: (notification: ProcedureNotification) => void
}

export function useAdminProcedureOperations(options: UseAdminProcedureOperationsOptions) {
  const state: AdminProcedureOperationState = {
    editorOpen: ref(false),
    editorLoading: ref(false),
    editingId: ref<string | null>(null),
    saving: ref(false),
    formError: ref(''),
    rowActionId: ref<string | null>(null),
    deleteOpen: ref(false),
    deleteTarget: ref<ApiProcedure | null>(null),
    deleting: ref(false)
  }
  const operations = createAdminProcedureOperations({ ...options, state })

  watch(state.editorOpen, (open) => {
    if (!open && !state.saving.value) operations.invalidateEditorRequest()
  })

  return operations
}
