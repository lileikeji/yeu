import type { Ref } from 'vue'
import type { AdminRecord, AdminResourceConfig } from '~/components/admin/types'
import {
  createAdminResourceOperations,
  type AdminResourceOperationNotification,
  type AdminResourceOperationState,
  type AdminResourceWriteRequest
} from '~/utils/admin-resource-operations'

interface UseAdminResourceOperationsOptions {
  config: Readonly<Ref<AdminResourceConfig>>
  records: Readonly<Ref<AdminRecord[]>>
  page: Ref<number>
  request: AdminResourceWriteRequest
  reloadRecords: () => Promise<void>
  initializeForm: (record: AdminRecord | null) => void
  validateForm: () => string | null
  buildPayload: () => AdminRecord
  handleUnauthorized: (error: unknown) => Promise<boolean>
  notify: (notification: AdminResourceOperationNotification) => void
}

export function useAdminResourceOperations(options: UseAdminResourceOperationsOptions) {
  const state: AdminResourceOperationState = {
    editorOpen: ref(false),
    editingRecord: ref<AdminRecord | null>(null),
    saving: ref(false),
    formError: ref(''),
    deleteOpen: ref(false),
    deleteTarget: ref<AdminRecord | null>(null),
    deleting: ref(false),
    rowActionId: ref<string | null>(null)
  }
  const operations = createAdminResourceOperations({
    state,
    page: options.page,
    getConfig: () => options.config.value,
    getRecordCount: () => options.records.value.length,
    request: options.request,
    reloadRecords: options.reloadRecords,
    initializeForm: options.initializeForm,
    validateForm: options.validateForm,
    buildPayload: options.buildPayload,
    handleUnauthorized: options.handleUnauthorized,
    notify: options.notify
  })
  const writeBusy = computed(() => operations.isWriteBusy())

  watch(() => options.config.value.key, operations.resetOperationState)
  onBeforeUnmount(operations.resetOperationState)

  return { ...operations, writeBusy }
}
