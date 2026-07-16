<script setup lang="ts">
import type { AdminFormValue, AdminRecord, AdminResourceConfig } from './types'
import {
  applyAdminResourceCoordinatePoint,
  buildAdminResourcePayload,
  clearAdminResourceCoordinates,
  getVisibleAdminResourceFields,
  groupAdminResourceFields,
  initializeAdminResourceForm,
  setAdminResourceFormValue,
  validateAdminResourceForm
} from '~/utils/admin-resource-form'
import { getAdminResourceRowTitle } from '~/utils/admin-resource-presentation'
import { isAuthorizationError } from '~/utils/request-error'

const props = defineProps<{
  config: AdminResourceConfig
}>()

const route = useRoute()
const router = useRouter()
const toast = useToast()

const pageSize = 20

const {
  records,
  total,
  stats,
  page,
  loading,
  loadError,
  searchQuery,
  filterValues,
  pageCount,
  loadRecords,
  changePage
} = useAdminResourceCatalog({
  config: computed(() => props.config),
  pageSize,
  request: (endpoint, options) => adminFetch(endpoint, options),
  handleUnauthorized,
  openCreateFromQuery
})

const formState = reactive<Record<string, AdminFormValue>>({})

const canCreate = computed(() => props.config.canCreate !== false)
const canEdit = computed(() => props.config.canEdit !== false)
const canDelete = computed(() => props.config.canDelete !== false)

const visibleFields = computed(() => getVisibleAdminResourceFields(props.config.fields, formState))
const groupedFields = computed(() => groupAdminResourceFields(visibleFields.value))

const {
  editorOpen,
  editingRecord,
  saving,
  formError,
  deleteOpen,
  deleteTarget,
  deleting,
  rowActionId,
  writeBusy,
  openCreate,
  openEdit,
  saveRecord,
  setPublicationStatus,
  requestDelete,
  deleteRecord
} = useAdminResourceOperations({
  config: computed(() => props.config),
  records,
  page,
  request: (endpoint, options) => adminFetch(endpoint, options),
  reloadRecords: loadRecords,
  initializeForm,
  validateForm,
  buildPayload,
  handleUnauthorized,
  notify: notification => toast.add(notification)
})

async function handleUnauthorized(error: unknown): Promise<boolean> {
  if (!isAuthorizationError(error)) return false

  await navigateTo({
    path: '/admin/login',
    query: { redirect: route.fullPath }
  })
  return true
}

function rowTitle(record: AdminRecord | null): string {
  return getAdminResourceRowTitle(record, props.config.rowTitleKey)
}

function setFormValue(key: string, value: unknown): void {
  setAdminResourceFormValue(formState, props.config.key, key, value)
}

function handleCoordinatePicked(point: Parameters<typeof applyAdminResourceCoordinatePoint>[1]): void {
  applyAdminResourceCoordinatePoint(formState, point)
}

function clearCoordinates(): void {
  clearAdminResourceCoordinates(formState)
}

function initializeForm(record: AdminRecord | null): void {
  initializeAdminResourceForm(formState, props.config.fields, record)
}

async function openCreateFromQuery(): Promise<void> {
  if (route.query.action !== 'create' || !canCreate.value) return
  openCreate()

  const query = { ...route.query }
  delete query.action
  await router.replace({ query })
}

function buildPayload(): AdminRecord {
  return buildAdminResourcePayload(visibleFields.value, formState)
}

function validateForm(): string | null {
  return validateAdminResourceForm(visibleFields.value, formState)
}
</script>

<template>
  <div class="mx-auto max-w-[1500px]">
    <AdminPageHeader
      :title="config.title"
      :description="config.description"
      :icon="config.icon"
    >
      <template #actions>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="loading"
          aria-label="刷新列表"
          @click="loadRecords"
        />
        <UButton
          v-if="canCreate"
          icon="i-lucide-plus"
          :label="config.createLabel"
          :disabled="writeBusy"
          @click="openCreate"
        />
      </template>
    </AdminPageHeader>

    <p
      v-if="config.readOnlyNote"
      class="mt-4 border-l-2 border-zinc-300 pl-3 text-sm text-zinc-500"
    >
      {{ config.readOnlyNote }}
    </p>

    <AdminResourceCatalogPanel
      v-model:search-query="searchQuery"
      v-model:filter-values="filterValues"
      :config="config"
      :records="records"
      :total="total"
      :stats="stats"
      :page="page"
      :page-count="pageCount"
      :loading="loading"
      :load-error="loadError"
      :can-edit="canEdit"
      :can-delete="canDelete"
      :write-busy="writeBusy"
      :row-action-id="rowActionId"
      @refresh="loadRecords"
      @change-page="changePage"
      @edit="openEdit"
      @set-publication-status="setPublicationStatus"
      @request-delete="requestDelete"
    />

    <AdminResourceEditor
      v-model:open="editorOpen"
      :config="config"
      :editing-record="editingRecord"
      :editing-record-title="rowTitle(editingRecord)"
      :grouped-fields="groupedFields"
      :form-state="formState"
      :saving="saving"
      :form-error="formError"
      @update-field="setFormValue"
      @coordinate-picked="handleCoordinatePicked"
      @clear-coordinates="clearCoordinates"
      @save="saveRecord"
    />

    <AdminResourceDeleteDialog
      v-model:open="deleteOpen"
      :target-title="rowTitle(deleteTarget)"
      :deleting="deleting"
      @confirm="deleteRecord"
    />
  </div>
</template>
