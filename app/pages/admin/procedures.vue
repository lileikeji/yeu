<script setup lang="ts">
import {
  buildProcedureDepartmentOptions,
  buildProcedureGuideOptions,
  buildProcedurePlaceOptions,
  buildProcedureSourceOptions
} from '~/utils/admin-procedure-presentation'
import { isAuthorizationError } from '~/utils/request-error'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const toast = useToast()

const pageSize = 20

const {
  form,
  procedureFormModel,
  resetForm,
  fillForm,
  toggleAudience,
  addStep,
  addMaterial,
  removeStep,
  removeMaterial,
  moveStep,
  moveMaterial,
  setRequired
} = useAdminProcedureFormModel()

const {
  procedures,
  total,
  page,
  loading,
  loadError,
  searchQuery,
  statusFilter,
  referencesLoading,
  referencesError,
  departments,
  guides,
  places,
  sources,
  pageCount,
  loadProcedures,
  loadReferences
} = useAdminProcedureCatalog({
  pageSize,
  request: (endpoint, options) => adminFetch(endpoint, options),
  handleUnauthorized
})

const departmentOptions = computed(() => buildProcedureDepartmentOptions(departments.value))
const guideOptions = computed(() => buildProcedureGuideOptions(guides.value))
const placeOptions = computed(() => buildProcedurePlaceOptions(places.value))
const placeOptionsWithEmpty = computed(() => buildProcedurePlaceOptions(places.value, true))
const sourceOptions = computed(() => buildProcedureSourceOptions(sources.value))

async function handleUnauthorized(error: unknown): Promise<boolean> {
  if (!isAuthorizationError(error)) return false

  await navigateTo({
    path: '/admin/login',
    query: { redirect: route.fullPath }
  })
  return true
}

const {
  editorOpen,
  editorLoading,
  editingId,
  saving,
  formError,
  rowActionId,
  deleteOpen,
  deleteTarget,
  deleting,
  openCreate,
  openEdit,
  saveProcedure,
  runRowAction,
  requestDelete,
  deleteProcedure
} = useAdminProcedureOperations({
  form,
  resetForm,
  fillForm,
  loadReferences,
  reloadProcedures: loadProcedures,
  request: (endpoint, options) => adminFetch(endpoint, options),
  handleUnauthorized,
  notify: notification => toast.add(notification)
})

async function changePage(nextPage: number): Promise<void> {
  const normalized = Math.min(Math.max(nextPage, 1), pageCount.value)
  if (normalized === page.value) return
  page.value = normalized
  await loadProcedures()
}

onMounted(() => {
  void (async () => {
    await loadProcedures()
    if (route.query.action === 'create') {
      await openCreate()
      return
    }
    await loadReferences()
  })()
})
</script>

<template>
  <div class="mx-auto max-w-[1500px]">
    <AdminPageHeader
      title="办事流程管理"
      icon="i-lucide-list-checks"
    >
      <template #actions>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="loading"
          aria-label="刷新流程列表"
          @click="loadProcedures"
        />
        <UButton
          icon="i-lucide-plus"
          label="新增流程"
          @click="openCreate"
        />
      </template>
    </AdminPageHeader>

    <AdminProcedureCatalogPanel
      v-model:search-query="searchQuery"
      v-model:status-filter="statusFilter"
      :procedures="procedures"
      :total="total"
      :page="page"
      :page-count="pageCount"
      :loading="loading"
      :load-error="loadError"
      :row-action-id="rowActionId"
      @refresh="loadProcedures"
      @change-page="changePage"
      @edit="openEdit"
      @row-action="runRowAction"
      @request-delete="requestDelete"
    />

    <AdminProcedureEditor
      v-model:open="editorOpen"
      v-model:form="procedureFormModel"
      :editing-id="editingId"
      :editor-loading="editorLoading"
      :saving="saving"
      :form-error="formError"
      :references-error="referencesError"
      :references-loading="referencesLoading"
      :department-options="departmentOptions"
      :guide-options="guideOptions"
      :place-options="placeOptions"
      :place-options-with-empty="placeOptionsWithEmpty"
      :source-options="sourceOptions"
      @save="saveProcedure"
      @load-references="loadReferences"
      @toggle-audience="toggleAudience"
      @add-step="addStep"
      @remove-step="removeStep"
      @move-step="moveStep"
      @add-material="addMaterial"
      @remove-material="removeMaterial"
      @move-material="moveMaterial"
      @set-required="setRequired"
    />

    <AdminProcedureDeleteDialog
      v-model:open="deleteOpen"
      :target-title="deleteTarget?.title || ''"
      :deleting="deleting"
      @confirm="deleteProcedure"
    />
  </div>
</template>
