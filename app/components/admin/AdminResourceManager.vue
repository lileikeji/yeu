<script setup lang="ts">
import type {
  AdminColumnDefinition,
  AdminFieldDefinition,
  AdminFormValue,
  AdminRecord,
  AdminResourceConfig
} from './types'
import type { GeoPoint } from '~~/map/core/types'

const props = defineProps<{
  config: AdminResourceConfig
}>()

const route = useRoute()
const router = useRouter()
const toast = useToast()

const records = ref<AdminRecord[]>([])
const total = ref(0)
const stats = ref<Record<string, number>>({})
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const loadError = ref('')
const searchQuery = ref('')
const filterValues = reactive<Record<string, string>>({})
const ready = ref(false)

const editorOpen = ref(false)
const editingRecord = ref<AdminRecord | null>(null)
const formState = reactive<Record<string, AdminFormValue>>({})
const saving = ref(false)
const formError = ref('')

const deleteOpen = ref(false)
const deleteTarget = ref<AdminRecord | null>(null)
const deleting = ref(false)
const rowActionId = ref<string | null>(null)

let searchTimer: ReturnType<typeof setTimeout> | null = null

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const canCreate = computed(() => props.config.canCreate !== false)
const canEdit = computed(() => props.config.canEdit !== false)
const canDelete = computed(() => props.config.canDelete !== false)

const visibleFields = computed(() => props.config.fields.filter((field) => {
  if (!field.condition) return true
  return field.condition.values.includes(formState[field.condition.key] ?? null)
}))

const groupedFields = computed(() => {
  const groups = new Map<string, AdminFieldDefinition[]>()

  for (const field of visibleFields.value) {
    const group = field.group || '基本信息'
    const fields = groups.get(group) ?? []
    fields.push(field)
    groups.set(group, fields)
  }

  return [...groups.entries()].map(([label, fields]) => ({ label, fields }))
})

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeStats(value: unknown): Record<string, number> {
  if (!isObject(value)) return {}

  return Object.fromEntries(Object.entries(value).flatMap(([key, rawValue]) => {
    const numberValue = typeof rawValue === 'number' ? rawValue : Number(rawValue)
    return Number.isFinite(numberValue) ? [[key, numberValue]] : []
  }))
}

function normalizeListResponse(response: unknown): {
  items: AdminRecord[]
  total: number
  stats: Record<string, number>
} {
  if (Array.isArray(response)) {
    const items = response.filter(isObject)
    return { items, total: items.length, stats: {} }
  }

  if (!isObject(response)) {
    return { items: [], total: 0, stats: {} }
  }

  const nestedData = isObject(response.data) ? response.data : null
  const rawItems = Array.isArray(response.items)
    ? response.items
    : Array.isArray(response.data)
      ? response.data
      : Array.isArray(nestedData?.items)
        ? nestedData.items
        : []
  const items = rawItems.filter(isObject)
  const rawTotal = response.total ?? nestedData?.total
  const normalizedTotal = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal)
  const statsKey = props.config.stats?.responseKey
  const rawStats = statsKey ? response[statsKey] ?? nestedData?.[statsKey] : undefined

  return {
    items,
    total: Number.isFinite(normalizedTotal) ? normalizedTotal : items.length,
    stats: normalizeStats(rawStats)
  }
}

function requestStatusCode(error: unknown): number | null {
  if (!isObject(error)) return null
  if (typeof error.statusCode === 'number') return error.statusCode
  if (isObject(error.response) && typeof error.response.status === 'number') return error.response.status
  return null
}

function requestMessage(error: unknown, fallback: string): string {
  if (!isObject(error)) return fallback
  if (isObject(error.data) && typeof error.data.message === 'string') return error.data.message
  if (typeof error.statusMessage === 'string') return error.statusMessage
  if (typeof error.message === 'string') return error.message
  return fallback
}

async function handleUnauthorized(error: unknown): Promise<boolean> {
  const statusCode = requestStatusCode(error)
  if (statusCode !== 401 && statusCode !== 403) return false

  await navigateTo({
    path: '/admin/login',
    query: { redirect: route.fullPath }
  })
  return true
}

function buildQuery(): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: page.value,
    pageSize
  }

  if (searchQuery.value.trim()) query.q = searchQuery.value.trim()

  for (const [key, value] of Object.entries(filterValues)) {
    if (value && value !== 'all') query[key] = value
  }

  return query
}

async function loadRecords(): Promise<void> {
  loading.value = true
  loadError.value = ''

  try {
    const response = await $fetch<unknown>(props.config.endpoint, {
      query: buildQuery(),
      credentials: 'include'
    })
    const normalized = normalizeListResponse(response)
    records.value = normalized.items
    total.value = normalized.total
    stats.value = normalized.stats
  } catch (error) {
    if (await handleUnauthorized(error)) return
    records.value = []
    total.value = 0
    stats.value = {}
    loadError.value = requestMessage(error, '暂时无法读取数据，请稍后重试。')
  } finally {
    loading.value = false
  }
}

function resetFilters(): void {
  for (const key of Object.keys(filterValues)) Reflect.deleteProperty(filterValues, key)
  for (const filter of props.config.filters ?? []) filterValues[filter.key] = 'all'
}

async function initializeResource(): Promise<void> {
  ready.value = false
  searchQuery.value = ''
  page.value = 1
  records.value = []
  total.value = 0
  stats.value = {}
  resetFilters()
  await nextTick()
  ready.value = true
  await loadRecords()
  await openCreateFromQuery()
}

function scheduleSearch(): void {
  if (!ready.value) return
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    void loadRecords()
  }, 300)
}

function readPath(record: AdminRecord, key: string): unknown {
  let value: unknown = record

  for (const part of key.split('.')) {
    if (!isObject(value)) return undefined
    value = value[part]
  }

  return value
}

function readColumnValue(record: AdminRecord, column: AdminColumnDefinition): unknown {
  const keys = [column.key, ...(column.fallbackKeys ?? [])]

  for (const key of keys) {
    const value = readPath(record, key)
    if (value !== undefined && value !== null && value !== '') return value
  }

  return undefined
}

function humanizeValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.length ? `${value.length} 项` : '—'

  if (isObject(value)) {
    for (const key of ['name', 'title', 'label']) {
      if (typeof value[key] === 'string') return value[key]
    }
  }

  return '—'
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return humanizeValue(value)

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function displayCell(record: AdminRecord, column: AdminColumnDefinition): string {
  const value = readColumnValue(record, column)
  if (column.kind === 'date') return formatDate(value)
  if (column.kind === 'boolean') return value === true ? '是' : value === false ? '否' : '—'
  if ((typeof value === 'string' || typeof value === 'number') && column.valueLabels?.[String(value)]) {
    return column.valueLabels[String(value)]!
  }
  return humanizeValue(value)
}

function recordId(record: AdminRecord | null): string {
  if (!record) return ''
  const value = record.id ?? record._id
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function rowTitle(record: AdminRecord | null): string {
  if (!record) return '此记录'
  return humanizeValue(readPath(record, props.config.rowTitleKey))
}

function recordStatus(record: AdminRecord): string {
  const key = props.config.statusKey || 'status'
  const value = readPath(record, key)
  return typeof value === 'string' ? value : ''
}

function fieldSpan(field: AdminFieldDefinition): string {
  if (field.span === 'full' || field.type === 'textarea' || field.type === 'checkbox') return 'sm:col-span-2'
  return ''
}

function fieldInputType(field: AdminFieldDefinition): 'text' | 'url' | 'email' | 'tel' | 'number' | 'date' | 'datetime-local' {
  if (field.type === 'url' || field.type === 'email' || field.type === 'tel' || field.type === 'number' || field.type === 'date' || field.type === 'datetime-local') {
    return field.type
  }
  return 'text'
}

function inputValue(key: string): string {
  const value = formState[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function selectValue(key: string): string | undefined {
  const value = formState[key]
  return typeof value === 'string' ? value : undefined
}

function checkboxValue(key: string): boolean {
  return formState[key] === true
}

function coordinateFormValue(key: 'longitude' | 'latitude' | 'coordinateSystem', value: AdminFormValue): number | string | null {
  if (key === 'coordinateSystem') {
    return typeof value === 'string' && value ? value : null
  }

  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function setFormValue(key: string, value: unknown): void {
  const previousValue = formState[key] ?? null

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    formState[key] = value
  } else if (value === undefined) {
    formState[key] = null
  }

  if (props.config.key !== 'places'
    || (key !== 'longitude' && key !== 'latitude' && key !== 'coordinateSystem')) {
    return
  }

  const nextValue = formState[key] ?? null
  if (coordinateFormValue(key, previousValue) === coordinateFormValue(key, nextValue)) return

  const hasCompleteCoordinates = coordinateNumber('longitude') !== null
    && coordinateNumber('latitude') !== null
    && coordinateSystemValue() !== null

  formState.coordinateVerification = hasCompleteCoordinates ? 'unverified' : 'missing'
  formState.coordinateVerifiedAt = null
}

function coordinateNumber(key: 'longitude' | 'latitude'): number | null {
  const value = formState[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function coordinateSystemValue(): string | null {
  const value = formState.coordinateSystem
  return typeof value === 'string' && value ? value : null
}

function handleCoordinatePicked(point: GeoPoint): void {
  formState.longitude = Number(point.lng.toFixed(7))
  formState.latitude = Number(point.lat.toFixed(7))
  formState.coordinateSystem = point.crs
  formState.coordinateVerification = 'unverified'
  formState.coordinateVerifiedAt = null
}

function clearCoordinates(): void {
  formState.longitude = null
  formState.latitude = null
  formState.coordinateSystem = null
  formState.coordinateVerification = 'missing'
  formState.coordinateVerifiedAt = null
}

function toInputDate(value: unknown, includeTime: boolean): AdminFormValue {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  if (!includeTime) return date.toISOString().slice(0, 10)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function sourceIdsValue(record: AdminRecord): string {
  const direct = readPath(record, 'sourceIds')
  if (Array.isArray(direct)) {
    return direct.filter(value => typeof value === 'string').join('\n')
  }

  const sources = Array.isArray(record.sources) ? record.sources : []
  return sources
    .filter(isObject)
    .map(source => source.id)
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

function initializeForm(record: AdminRecord | null): void {
  for (const key of Object.keys(formState)) Reflect.deleteProperty(formState, key)

  for (const field of props.config.fields) {
    let value = record ? readPath(record, field.key) : undefined
    if (value === undefined && record && field.key === 'sourceIds') value = sourceIdsValue(record)
    if (value === undefined) value = field.defaultValue ?? (field.type === 'checkbox' ? false : '')

    if (field.type === 'date') value = toInputDate(value, false)
    if (field.type === 'datetime-local') value = toInputDate(value, true)

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      formState[field.key] = value
    } else {
      formState[field.key] = ''
    }
  }
}

function openCreate(): void {
  editingRecord.value = null
  formError.value = ''
  initializeForm(null)
  editorOpen.value = true
}

function openEdit(record: AdminRecord): void {
  editingRecord.value = record
  formError.value = ''
  initializeForm(record)
  editorOpen.value = true
}

async function openCreateFromQuery(): Promise<void> {
  if (route.query.action !== 'create' || !canCreate.value) return
  openCreate()

  const query = { ...route.query }
  delete query.action
  await router.replace({ query })
}

function normalizeFieldValue(field: AdminFieldDefinition, value: AdminFormValue): unknown {
  if (field.key === 'sourceIds') {
    if (typeof value !== 'string') return []
    return [...new Set(value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean))]
  }

  if (field.type === 'number') {
    if (value === '' || value === null) return null
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : null
  }

  if ((field.type === 'date' || field.type === 'datetime-local') && (value === '' || value === null)) {
    return null
  }

  if ((field.type === 'date' || field.type === 'datetime-local') && typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString()
  }

  if (field.type === 'select' && value === '') return null

  return value
}

function writePath(record: AdminRecord, key: string, value: unknown): void {
  const parts = key.split('.')
  let current = record

  for (const part of parts.slice(0, -1)) {
    const child = current[part]
    if (isObject(child)) {
      current = child
      continue
    }

    const next: AdminRecord = {}
    current[part] = next
    current = next
  }

  current[parts.at(-1)!] = value
}

function buildPayload(): AdminRecord {
  const payload: AdminRecord = {}

  for (const field of visibleFields.value) {
    const value = normalizeFieldValue(field, formState[field.key] ?? null)
    writePath(payload, field.key, value)
  }

  return payload
}

function validateForm(): string | null {
  for (const field of visibleFields.value) {
    if (!field.required) continue
    const value = formState[field.key]
    if (value === '' || value === null || value === undefined) return `请填写${field.label}`
  }
  return null
}

async function saveRecord(): Promise<void> {
  const validationError = validateForm()
  if (validationError) {
    formError.value = validationError
    return
  }

  const id = recordId(editingRecord.value)
  saving.value = true
  formError.value = ''

  try {
    await $fetch(id ? `${props.config.endpoint}/${encodeURIComponent(id)}` : props.config.endpoint, {
      method: id ? 'PUT' : 'POST',
      body: buildPayload(),
      credentials: 'include'
    })
    editorOpen.value = false
    toast.add({
      title: id ? '记录已更新' : '记录已创建',
      color: 'success'
    })
    await loadRecords()
  } catch (error) {
    if (await handleUnauthorized(error)) return
    formError.value = requestMessage(error, '保存失败，请检查字段后重试。')
  } finally {
    saving.value = false
  }
}

async function updateRecord(record: AdminRecord, body: AdminRecord, successTitle: string): Promise<void> {
  const id = recordId(record)
  if (!id) return
  rowActionId.value = id

  try {
    await $fetch(`${props.config.endpoint}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body,
      credentials: 'include'
    })
    toast.add({ title: successTitle, color: 'success' })
    await loadRecords()
  } catch (error) {
    if (await handleUnauthorized(error)) return
    toast.add({
      title: '操作失败',
      description: requestMessage(error, '请稍后重试。'),
      color: 'error'
    })
  } finally {
    rowActionId.value = null
  }
}

async function setPublicationStatus(record: AdminRecord, status: 'published' | 'archived'): Promise<void> {
  await updateRecord(record, { status }, status === 'published' ? '内容已发布' : '内容已下架')
}

function requestDelete(record: AdminRecord): void {
  deleteTarget.value = record
  deleteOpen.value = true
}

async function deleteRecord(): Promise<void> {
  const id = recordId(deleteTarget.value)
  if (!id) return
  deleting.value = true

  try {
    await $fetch(`${props.config.endpoint}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    deleteOpen.value = false
    toast.add({ title: '记录已删除', color: 'success' })
    if (records.value.length === 1 && page.value > 1) page.value -= 1
    await loadRecords()
  } catch (error) {
    if (await handleUnauthorized(error)) return
    toast.add({
      title: '删除失败',
      description: requestMessage(error, '请稍后重试。'),
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}

async function changePage(nextPage: number): Promise<void> {
  const normalizedPage = Math.min(Math.max(nextPage, 1), pageCount.value)
  if (normalizedPage === page.value) return
  page.value = normalizedPage
  await loadRecords()
}

watch(searchQuery, scheduleSearch)

watch(filterValues, () => {
  if (!ready.value) return
  page.value = 1
  void loadRecords()
}, { deep: true })

watch(() => props.config.key, () => {
  if (ready.value) void initializeResource()
})

onMounted(() => {
  void initializeResource()
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
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

    <section class="mt-5 overflow-hidden rounded-md border border-zinc-200 bg-white">
      <dl
        v-if="config.stats"
        class="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-zinc-200 bg-white p-3 sm:grid-cols-3 lg:grid-cols-5"
        aria-label="地点坐标统计"
      >
        <div
          v-for="item in config.stats.items"
          :key="item.key"
          class="flex min-w-0 items-center gap-3"
        >
          <span class="grid size-8 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500">
            <UIcon
              :name="item.icon"
              class="size-4"
            />
          </span>
          <div class="min-w-0">
            <dt class="truncate text-xs text-zinc-500">
              {{ item.label }}
            </dt>
            <dd class="mt-0.5 text-lg font-semibold tabular-nums text-zinc-950">
              {{ stats[item.key] ?? 0 }}
            </dd>
          </div>
        </div>
      </dl>

      <div class="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50/70 p-3 lg:flex-row lg:items-center">
        <UInput
          v-if="config.searchable !== false"
          v-model="searchQuery"
          icon="i-lucide-search"
          :placeholder="config.searchPlaceholder"
          aria-label="搜索记录"
          class="w-full lg:max-w-sm"
        />

        <div class="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:justify-end">
          <USelect
            v-for="filter in config.filters ?? []"
            :key="filter.key"
            v-model="filterValues[filter.key]"
            :items="[{ label: filter.allLabel, value: 'all' }, ...filter.options]"
            value-key="value"
            label-key="label"
            :aria-label="filter.label"
            class="w-full lg:w-44"
          />
        </div>
      </div>

      <div
        v-if="loadError"
        class="flex flex-col items-start gap-3 border-b border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        role="alert"
      >
        <div class="flex items-start gap-2 text-sm text-red-800">
          <UIcon
            name="i-lucide-circle-alert"
            class="mt-0.5 size-4 shrink-0"
          />
          <span>{{ loadError }}</span>
        </div>
        <UButton
          label="重试"
          icon="i-lucide-refresh-cw"
          color="error"
          variant="outline"
          size="sm"
          @click="loadRecords"
        />
      </div>

      <div
        v-if="loading && records.length === 0"
        class="divide-y divide-zinc-100"
        aria-label="正在加载"
      >
        <div
          v-for="index in 6"
          :key="index"
          class="flex items-center gap-4 px-4 py-4"
        >
          <USkeleton class="h-4 w-1/3" />
          <USkeleton class="h-4 w-24" />
          <USkeleton class="ml-auto h-8 w-28" />
        </div>
      </div>

      <template v-else-if="records.length">
        <div class="hidden overflow-x-auto md:block">
          <table class="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead class="bg-zinc-50 text-xs font-semibold text-zinc-500">
              <tr>
                <th
                  v-for="column in config.columns"
                  :key="column.key"
                  class="border-b border-zinc-200 px-4 py-2.5"
                  :class="column.class"
                >
                  {{ column.label }}
                </th>
                <th class="w-44 border-b border-zinc-200 px-4 py-2.5 text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <tr
                v-for="record in records"
                :key="recordId(record)"
                class="hover:bg-zinc-50/70"
              >
                <td
                  v-for="column in config.columns"
                  :key="column.key"
                  class="max-w-xs px-4 py-3 text-zinc-600"
                  :class="column.class"
                >
                  <AdminStatusBadge
                    v-if="column.kind === 'status'"
                    :value="readColumnValue(record, column)"
                  />
                  <span
                    v-else
                    class="line-clamp-2"
                    :class="column.key === config.rowTitleKey ? 'font-semibold text-zinc-950' : ''"
                  >
                    {{ displayCell(record, column) }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <UTooltip
                      v-if="canEdit"
                      text="编辑"
                    >
                      <UButton
                        icon="i-lucide-pencil"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :aria-label="`编辑${rowTitle(record)}`"
                        @click="openEdit(record)"
                      />
                    </UTooltip>
                    <UTooltip
                      v-if="config.publicationActions && recordStatus(record) !== 'published'"
                      text="发布"
                    >
                      <UButton
                        icon="i-lucide-send"
                        color="success"
                        variant="ghost"
                        size="sm"
                        :loading="rowActionId === recordId(record)"
                        :aria-label="`发布${rowTitle(record)}`"
                        @click="setPublicationStatus(record, 'published')"
                      />
                    </UTooltip>
                    <UTooltip
                      v-if="config.publicationActions && recordStatus(record) === 'published'"
                      text="下架"
                    >
                      <UButton
                        icon="i-lucide-archive"
                        color="warning"
                        variant="ghost"
                        size="sm"
                        :loading="rowActionId === recordId(record)"
                        :aria-label="`下架${rowTitle(record)}`"
                        @click="setPublicationStatus(record, 'archived')"
                      />
                    </UTooltip>
                    <UTooltip
                      v-if="canDelete"
                      text="删除"
                    >
                      <UButton
                        icon="i-lucide-trash-2"
                        color="error"
                        variant="ghost"
                        size="sm"
                        :aria-label="`删除${rowTitle(record)}`"
                        @click="requestDelete(record)"
                      />
                    </UTooltip>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="divide-y divide-zinc-100 md:hidden">
          <article
            v-for="record in records"
            :key="recordId(record)"
            class="p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-zinc-950">
                  {{ rowTitle(record) }}
                </p>
                <dl class="mt-2 space-y-1.5 text-xs">
                  <div
                    v-for="column in config.columns.slice(1, 4)"
                    :key="column.key"
                    class="flex gap-2"
                  >
                    <dt class="w-16 shrink-0 text-zinc-400">
                      {{ column.label }}
                    </dt>
                    <dd class="min-w-0 text-zinc-600">
                      <AdminStatusBadge
                        v-if="column.kind === 'status'"
                        :value="readColumnValue(record, column)"
                      />
                      <span
                        v-else
                        class="line-clamp-2"
                      >{{ displayCell(record, column) }}</span>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-1 border-t border-zinc-100 pt-2">
              <UButton
                v-if="canEdit"
                icon="i-lucide-pencil"
                label="编辑"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="openEdit(record)"
              />
              <UButton
                v-if="config.publicationActions && recordStatus(record) !== 'published'"
                icon="i-lucide-send"
                label="发布"
                color="success"
                variant="ghost"
                size="sm"
                :loading="rowActionId === recordId(record)"
                @click="setPublicationStatus(record, 'published')"
              />
              <UButton
                v-if="config.publicationActions && recordStatus(record) === 'published'"
                icon="i-lucide-archive"
                label="下架"
                color="warning"
                variant="ghost"
                size="sm"
                :loading="rowActionId === recordId(record)"
                @click="setPublicationStatus(record, 'archived')"
              />
              <UButton
                v-if="canDelete"
                icon="i-lucide-trash-2"
                label="删除"
                color="error"
                variant="ghost"
                size="sm"
                class="ml-auto"
                @click="requestDelete(record)"
              />
            </div>
          </article>
        </div>
      </template>

      <div
        v-else-if="!loadError"
        class="grid min-h-64 place-items-center p-8 text-center"
      >
        <div>
          <span class="mx-auto grid size-10 place-items-center rounded-md bg-zinc-100 text-zinc-500">
            <UIcon
              name="i-lucide-inbox"
              class="size-5"
            />
          </span>
          <p class="mt-3 text-sm font-semibold text-zinc-800">
            没有匹配记录
          </p>
          <p class="mt-1 text-xs text-zinc-500">
            {{ config.searchable === false ? '暂无记录。' : '调整搜索或筛选条件后重试。' }}
          </p>
        </div>
      </div>

      <footer class="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50/70 px-4 py-3 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <span>共 {{ total }} 条，第 {{ page }} / {{ pageCount }} 页</span>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-chevron-left"
            label="上一页"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="page <= 1 || loading"
            @click="changePage(page - 1)"
          />
          <UButton
            icon="i-lucide-chevron-right"
            trailing
            label="下一页"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="page >= pageCount || loading"
            @click="changePage(page + 1)"
          />
        </div>
      </footer>
    </section>

    <UModal
      v-model:open="editorOpen"
      :title="editingRecord ? `编辑${config.title}` : config.createLabel"
      :description="editingRecord ? `更新“${rowTitle(editingRecord)}”的字段与状态。` : '填写后保存为所选状态。'"
      scrollable
      :dismissible="!saving"
      :ui="{ content: 'sm:max-w-4xl' }"
    >
      <template #body>
        <div
          v-if="formError"
          class="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <UIcon
            name="i-lucide-circle-alert"
            class="mt-0.5 size-4 shrink-0"
          />
          <span>{{ formError }}</span>
        </div>

        <div class="space-y-6">
          <AdminCoordinatePicker
            v-if="config.key === 'places'"
            :name="inputValue('name')"
            :longitude="coordinateNumber('longitude')"
            :latitude="coordinateNumber('latitude')"
            :coordinate-system="coordinateSystemValue()"
            :scope="inputValue('scope')"
            @pick="handleCoordinatePicked"
            @clear="clearCoordinates"
          />

          <section
            v-for="group in groupedFields"
            :key="group.label"
          >
            <h3 class="border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900">
              {{ group.label }}
            </h3>
            <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField
                v-for="field in group.fields"
                :key="field.key"
                :label="field.label"
                :description="field.description"
                :required="field.required"
                :class="fieldSpan(field)"
              >
                <UTextarea
                  v-if="field.type === 'textarea'"
                  :model-value="inputValue(field.key)"
                  :placeholder="field.placeholder"
                  :rows="field.rows ?? 4"
                  autoresize
                  class="w-full"
                  @update:model-value="value => setFormValue(field.key, value)"
                />
                <USelect
                  v-else-if="field.type === 'select'"
                  :model-value="selectValue(field.key)"
                  :items="field.options ?? []"
                  value-key="value"
                  label-key="label"
                  :placeholder="field.placeholder || `请选择${field.label}`"
                  class="w-full"
                  @update:model-value="value => setFormValue(field.key, value)"
                />
                <UCheckbox
                  v-else-if="field.type === 'checkbox'"
                  :model-value="checkboxValue(field.key)"
                  :label="field.label"
                  :description="field.description"
                  @update:model-value="value => setFormValue(field.key, value === true)"
                />
                <UInput
                  v-else
                  :model-value="inputValue(field.key)"
                  :type="fieldInputType(field)"
                  :placeholder="field.placeholder"
                  :min="field.min"
                  :max="field.max"
                  :step="field.step"
                  class="w-full"
                  @update:model-value="value => setFormValue(field.key, value)"
                />
              </UFormField>
            </div>
          </section>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            :disabled="saving"
            @click="editorOpen = false"
          />
          <UButton
            icon="i-lucide-save"
            label="保存"
            :loading="saving"
            @click="saveRecord"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteOpen"
      title="删除记录"
      :description="`确认删除“${rowTitle(deleteTarget)}”？已公开内容优先使用下架。`"
      :dismissible="!deleting"
    >
      <template #body>
        <p class="text-sm leading-6 text-zinc-600">
          删除操作不可由当前界面撤销。若记录已被其他内容引用，服务端可能拒绝删除。
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            :disabled="deleting"
            @click="deleteOpen = false"
          />
          <UButton
            icon="i-lucide-trash-2"
            label="确认删除"
            color="error"
            :loading="deleting"
            @click="deleteRecord"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
