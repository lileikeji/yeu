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

const visualEditorPath = computed(() => {
  if (props.config.key !== 'content' || !editingRecord.value) return undefined
  const kind = typeof editingRecord.value.kind === 'string' ? editingRecord.value.kind : ''
  const id = typeof editingRecord.value.id === 'string' ? editingRecord.value.id : ''
  return id && (kind === 'club' || kind === 'department')
    ? `/admin/content/${encodeURIComponent(id)}/visual`
    : undefined
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

async function openVisualCreate(kind: 'club' | 'department'): Promise<void> {
  await navigateTo({
    path: '/admin/content/new/visual',
    query: { kind }
  })
}

function openStructuredCreate(kind: 'guide' | 'notice'): void {
  openCreate()
  setFormValue('kind', kind)
}

async function handleEdit(record: AdminRecord): Promise<void> {
  const kind = typeof record.kind === 'string' ? record.kind : ''
  const id = typeof record.id === 'string' ? record.id : ''
  if (props.config.key === 'content'
    && id
    && (kind === 'club' || kind === 'department')) {
    await navigateTo(`/admin/content/${encodeURIComponent(id)}/visual`)
    return
  }
  openEdit(record)
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
  const editId = typeof route.query.edit === 'string' ? route.query.edit.trim() : ''
  if (editId && canEdit.value && props.config.key === 'content') {
    try {
      const record = await adminFetch<AdminRecord>(
        `/api/admin/content/${encodeURIComponent(editId)}`
      )
      openEdit(record)
    } catch (error) {
      if (!await handleUnauthorized(error)) {
        toast.add({
          title: '详细内容加载失败',
          description: '请刷新后重试，或从内容列表重新进入。',
          color: 'error'
        })
      }
    } finally {
      const query = { ...route.query }
      delete query.edit
      await router.replace({ query })
    }
    return
  }

  if (route.query.action !== 'create' || !canCreate.value) return
  openCreate()
  const requestedKind = typeof route.query.kind === 'string' ? route.query.kind : ''
  if (props.config.key === 'content' && (requestedKind === 'guide' || requestedKind === 'notice')) {
    setFormValue('kind', requestedKind)
  }

  const query = { ...route.query }
  delete query.action
  delete query.kind
  await router.replace({ query })
}

function buildPayload(): AdminRecord {
  const payload = buildAdminResourcePayload(visibleFields.value, formState)
  if (props.config.key !== 'content' || formState.kind !== 'notice') return payload

  if (!editingRecord.value) {
    payload.kind = 'notice'
    payload.slug = `notice-${Date.now()}`
    payload.category = null
    payload.isFeatured = false
    payload.lastVerifiedAt = null
  }

  return payload
}

function validateForm(): string | null {
  return validateAdminResourceForm(visibleFields.value, formState)
}
</script>

<template>
  <div class="mx-auto max-w-[1500px]">
    <AdminPageHeader
      :title="config.title"
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
        <template v-if="canCreate && config.key === 'content'">
          <UButton
            icon="i-lucide-users-round"
            label="新增社团"
            :disabled="writeBusy"
            @click="openVisualCreate('club')"
          />
          <UButton
            icon="i-lucide-landmark"
            label="新增部门"
            color="neutral"
            variant="outline"
            :disabled="writeBusy"
            @click="openVisualCreate('department')"
          />
          <UButton
            icon="i-lucide-file-plus-2"
            label="新增指南"
            color="neutral"
            variant="outline"
            :disabled="writeBusy"
            @click="openStructuredCreate('guide')"
          />
          <UButton
            icon="i-lucide-megaphone"
            label="新增公告"
            color="warning"
            variant="soft"
            :disabled="writeBusy"
            @click="openStructuredCreate('notice')"
          />
        </template>
        <UButton
          v-else-if="canCreate"
          icon="i-lucide-plus"
          :label="config.createLabel"
          :disabled="writeBusy"
          @click="openCreate"
        />
      </template>
    </AdminPageHeader>

    <p
      v-if="config.readOnlyNote"
      class="mt-4 border-l-2 border-zinc-300 dark:border-zinc-700 pl-3 text-sm text-zinc-500 dark:text-zinc-400"
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
      @edit="handleEdit"
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
      :visual-editor-path="visualEditorPath"
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
