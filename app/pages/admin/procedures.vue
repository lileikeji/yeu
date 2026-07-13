<script setup lang="ts">
import type {
  ApiContent,
  ApiListResponse,
  ApiPlace,
  ApiProcedure,
  ApiSource
} from '~~/shared/types/server'
import type {
  ProcedureAudience,
  ProcedureInformationState,
  ProcedureMethod
} from '~~/shared/constants/server'

definePageMeta({ layout: 'admin' })

interface SelectOption {
  label: string
  value: string
  description?: string
}

interface ProcedureStepForm {
  key: number
  title: string
  description: string
  audience: ProcedureAudience[]
  informationState: ProcedureInformationState
  timeText: string
  placeId: string
  departmentId: string
  actionUrl: string
}

interface ProcedureMaterialForm {
  key: number
  name: string
  description: string
  audience: ProcedureAudience[]
  isRequired: boolean | null
  informationState: ProcedureInformationState
  placeId: string
  departmentId: string
}

interface ProcedureForm {
  slug: string
  title: string
  summary: string
  body: string
  category: string
  audience: ProcedureAudience[]
  method: ProcedureMethod
  informationState: ProcedureInformationState
  statusText: string
  processingTime: string
  deadlineText: string
  startsAt: string
  endsAt: string
  validFrom: string
  validUntil: string
  departmentId: string
  guideId: string
  lastVerifiedAt: string
  sourceIds: string[]
  placeIds: string[]
  steps: ProcedureStepForm[]
  materials: ProcedureMaterialForm[]
}

type PublicationStatus = ApiProcedure['status']
type RowAction = 'publish' | 'unpublish'

const route = useRoute()
const toast = useToast()

const procedures = ref<ApiProcedure[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const loadError = ref('')
const searchQuery = ref('')
const statusFilter = ref<'all' | PublicationStatus>('all')

const editorOpen = ref(false)
const editorLoading = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const formError = ref('')

const referencesLoading = ref(false)
const referencesLoaded = ref(false)
const referencesError = ref('')
const departments = ref<ApiContent[]>([])
const guides = ref<ApiContent[]>([])
const places = ref<ApiPlace[]>([])
const sources = ref<ApiSource[]>([])

const rowActionId = ref<string | null>(null)
const deleteOpen = ref(false)
const deleteTarget = ref<ApiProcedure | null>(null)
const deleting = ref(false)

let nextItemKey = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null

const audienceOptions: Array<{ label: string, value: ProcedureAudience }> = [
  { label: '普通本科', value: 'undergraduate' },
  { label: '专升本', value: 'transfer' }
]

const methodOptions: Array<{ label: string, value: ProcedureMethod }> = [
  { label: '线上办理', value: 'online' },
  { label: '到校办理', value: 'offline' },
  { label: '线上 + 到校', value: 'mixed' }
]

const informationStateOptions: Array<{ label: string, value: ProcedureInformationState }> = [
  { label: '已确认', value: 'confirmed' },
  { label: '部分确认', value: 'partial' },
  { label: '等待通知', value: 'awaiting-notice' }
]

const statusOptions: SelectOption[] = [
  { label: '全部状态', value: 'all' },
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '已下架', value: 'archived' }
]

const requiredOptions: SelectOption[] = [
  { label: '尚未确认', value: 'unknown' },
  { label: '必须携带', value: 'required' },
  { label: '按需携带', value: 'optional' }
]

function emptyStep(): ProcedureStepForm {
  return {
    key: ++nextItemKey,
    title: '',
    description: '',
    audience: ['undergraduate', 'transfer'],
    informationState: 'awaiting-notice',
    timeText: '',
    placeId: '',
    departmentId: '',
    actionUrl: ''
  }
}

function emptyMaterial(): ProcedureMaterialForm {
  return {
    key: ++nextItemKey,
    name: '',
    description: '',
    audience: ['undergraduate', 'transfer'],
    isRequired: null,
    informationState: 'awaiting-notice',
    placeId: '',
    departmentId: ''
  }
}

function emptyForm(): ProcedureForm {
  return {
    slug: '',
    title: '',
    summary: '',
    body: '',
    category: '',
    audience: ['undergraduate', 'transfer'],
    method: 'offline',
    informationState: 'awaiting-notice',
    statusText: '等待学校当年通知',
    processingTime: '',
    deadlineText: '',
    startsAt: '',
    endsAt: '',
    validFrom: '',
    validUntil: '',
    departmentId: '',
    guideId: '',
    lastVerifiedAt: '',
    sourceIds: [],
    placeIds: [],
    steps: [emptyStep()],
    materials: []
  }
}

const form = reactive<ProcedureForm>(emptyForm())

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const departmentOptions = computed<SelectOption[]>(() => [
  { label: '不关联负责部门', value: '' },
  ...departments.value.map(item => ({
    label: item.title,
    value: item.id,
    description: publicationLabel(item.status)
  }))
])

const guideOptions = computed<SelectOption[]>(() => [
  { label: '不关联指南', value: '' },
  ...guides.value.map(item => ({
    label: item.title,
    value: item.id,
    description: publicationLabel(item.status)
  }))
])

const placeOptions = computed<SelectOption[]>(() => places.value.map(item => ({
  label: item.name,
  value: item.id,
  description: [item.address, publicationLabel(item.status)].filter(Boolean).join(' · ')
})))

const placeOptionsWithEmpty = computed<SelectOption[]>(() => [
  { label: '不关联地点', value: '' },
  ...placeOptions.value
])

const sourceOptions = computed<SelectOption[]>(() => sources.value.map(item => ({
  label: item.title,
  value: item.id,
  description: `${item.sourceLevel} 级 · ${sourceStatusLabel(item.status)}`
})))

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requestStatusCode(error: unknown): number | null {
  if (!isObject(error)) return null
  if (typeof error.statusCode === 'number') return error.statusCode
  if (isObject(error.response) && typeof error.response.status === 'number') return error.response.status
  return null
}

function requestMessage(error: unknown, fallback: string): string {
  if (!isObject(error)) return fallback
  if (isObject(error.data)) {
    if (typeof error.data.statusMessage === 'string') return error.data.statusMessage
    if (typeof error.data.message === 'string') return error.data.message
  }
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

function publicationLabel(status: PublicationStatus): string {
  return {
    draft: '草稿',
    published: '已发布',
    archived: '已下架'
  }[status]
}

function sourceStatusLabel(status: ApiSource['status']): string {
  return {
    active: '有效',
    unavailable: '不可用',
    disputed: '存在争议'
  }[status]
}

function methodLabel(method: ProcedureMethod): string {
  return methodOptions.find(item => item.value === method)?.label ?? method
}

function informationStateLabel(state: ProcedureInformationState): string {
  return informationStateOptions.find(item => item.value === state)?.label ?? state
}

function informationStateColor(state: ProcedureInformationState): 'success' | 'warning' | 'neutral' {
  if (state === 'confirmed') return 'success'
  if (state === 'partial') return 'warning'
  return 'neutral'
}

function audienceLabel(audience: ProcedureAudience[]): string {
  if (audience.length === 2) return '本科、专升本'
  if (audience.includes('undergraduate')) return '普通本科'
  if (audience.includes('transfer')) return '专升本'
  return '未设置'
}

function formatDate(value: string | null): string {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '日期无效'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

function toDatetimeLocal(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 16)
}

function toIsoOrNull(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function resetForm(): void {
  Object.assign(form, emptyForm())
  formError.value = ''
}

function fillForm(procedure: ApiProcedure): void {
  Object.assign(form, {
    slug: procedure.slug,
    title: procedure.title,
    summary: procedure.summary,
    body: procedure.body,
    category: procedure.category ?? '',
    audience: [...procedure.audience],
    method: procedure.method,
    informationState: procedure.informationState,
    statusText: procedure.statusText,
    processingTime: procedure.processingTime ?? '',
    deadlineText: procedure.deadlineText ?? '',
    startsAt: toDatetimeLocal(procedure.startsAt),
    endsAt: toDatetimeLocal(procedure.endsAt),
    validFrom: toDatetimeLocal(procedure.validFrom),
    validUntil: toDatetimeLocal(procedure.validUntil),
    departmentId: procedure.department?.id ?? '',
    guideId: procedure.relatedGuide?.id ?? '',
    lastVerifiedAt: toDatetimeLocal(procedure.lastVerifiedAt),
    sourceIds: procedure.sources.map(item => item.id),
    placeIds: procedure.places.map(item => item.id),
    steps: procedure.steps.map(step => ({
      key: ++nextItemKey,
      title: step.title,
      description: step.description,
      audience: [...step.audience],
      informationState: step.informationState,
      timeText: step.timeText ?? '',
      placeId: step.place?.id ?? '',
      departmentId: step.department?.id ?? '',
      actionUrl: step.actionUrl ?? ''
    })),
    materials: procedure.materials.map(material => ({
      key: ++nextItemKey,
      name: material.name,
      description: material.description,
      audience: [...material.audience],
      isRequired: material.isRequired,
      informationState: material.informationState,
      placeId: material.place?.id ?? '',
      departmentId: material.department?.id ?? ''
    }))
  })
  formError.value = ''
}

async function fetchAll<T>(
  endpoint: string,
  query: Record<string, string> = {}
): Promise<T[]> {
  const items: T[] = []
  let currentPage = 1
  let expectedTotal = 0

  do {
    const response = await $fetch<ApiListResponse<T>>(endpoint, {
      query: { ...query, page: currentPage, pageSize: 200 },
      credentials: 'include'
    })
    items.push(...response.items)
    expectedTotal = response.total
    currentPage += 1
  } while (items.length < expectedTotal)

  return items
}

async function loadReferences(force = false): Promise<void> {
  if (referencesLoading.value || (referencesLoaded.value && !force)) return
  referencesLoading.value = true
  referencesError.value = ''

  try {
    const [departmentItems, guideItems, placeItems, sourceItems] = await Promise.all([
      fetchAll<ApiContent>('/api/admin/content', { kind: 'department' }),
      fetchAll<ApiContent>('/api/admin/content', { kind: 'guide' }),
      fetchAll<ApiPlace>('/api/admin/places'),
      fetchAll<ApiSource>('/api/admin/sources')
    ])
    departments.value = departmentItems.filter(item => item.status !== 'archived')
    guides.value = guideItems.filter(item => item.status !== 'archived')
    places.value = placeItems.filter(item => item.status !== 'archived')
    sources.value = sourceItems
    referencesLoaded.value = true
  } catch (error) {
    if (await handleUnauthorized(error)) return
    referencesError.value = requestMessage(error, '关联内容加载失败，可稍后重试。')
  } finally {
    referencesLoading.value = false
  }
}

function buildListQuery(): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: page.value,
    pageSize
  }
  if (searchQuery.value.trim()) query.q = searchQuery.value.trim()
  if (statusFilter.value !== 'all') query.status = statusFilter.value
  return query
}

async function loadProcedures(): Promise<void> {
  loading.value = true
  loadError.value = ''

  try {
    const response = await $fetch<ApiListResponse<ApiProcedure>>('/api/admin/procedures', {
      query: buildListQuery(),
      credentials: 'include'
    })
    procedures.value = response.items
    total.value = response.total
    if (page.value > Math.max(1, Math.ceil(response.total / pageSize))) {
      page.value = Math.max(1, Math.ceil(response.total / pageSize))
      await loadProcedures()
    }
  } catch (error) {
    if (await handleUnauthorized(error)) return
    procedures.value = []
    total.value = 0
    loadError.value = requestMessage(error, '暂时无法读取办事流程，请稍后重试。')
  } finally {
    loading.value = false
  }
}

async function openCreate(): Promise<void> {
  editingId.value = null
  resetForm()
  editorOpen.value = true
  await loadReferences()
}

async function openEdit(procedure: ApiProcedure): Promise<void> {
  editingId.value = procedure.id
  resetForm()
  editorOpen.value = true
  editorLoading.value = true
  await loadReferences()

  try {
    const detail = await $fetch<ApiProcedure>(`/api/admin/procedures/${encodeURIComponent(procedure.id)}`, {
      credentials: 'include'
    })
    fillForm(detail)
  } catch (error) {
    if (await handleUnauthorized(error)) return
    formError.value = requestMessage(error, '流程详情加载失败，请关闭后重试。')
  } finally {
    editorLoading.value = false
  }
}

function toggleAudience(
  target: { audience: ProcedureAudience[] },
  audience: ProcedureAudience,
  checked: boolean
): void {
  if (checked && !target.audience.includes(audience)) target.audience.push(audience)
  if (!checked) target.audience = target.audience.filter(item => item !== audience)
}

function addStep(): void {
  form.steps.push(emptyStep())
}

function addMaterial(): void {
  form.materials.push(emptyMaterial())
}

function removeStep(index: number): void {
  form.steps.splice(index, 1)
}

function removeMaterial(index: number): void {
  form.materials.splice(index, 1)
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): void {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= items.length) return
  const [item] = items.splice(index, 1)
  if (item !== undefined) items.splice(targetIndex, 0, item)
}

function requiredValue(value: boolean | null): string {
  if (value === true) return 'required'
  if (value === false) return 'optional'
  return 'unknown'
}

function setRequired(material: ProcedureMaterialForm, value: unknown): void {
  material.isRequired = value === 'required' ? true : value === 'optional' ? false : null
}

function validateDateRange(start: string, end: string, label: string): string | null {
  if (!start || !end) return null
  if (new Date(end).getTime() >= new Date(start).getTime()) return null
  return `${label}的结束时间不能早于开始时间`
}

function isHttpUrl(value: string): boolean {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function validateForm(): string | null {
  if (!form.title.trim()) return '请填写流程标题'
  if (!form.slug.trim()) return '请填写公开路径标识'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) return '公开路径只能使用小写字母、数字和连字符'
  if (!form.summary.trim()) return '请填写流程摘要'
  if (!form.statusText.trim()) return '请填写前台状态说明'
  if (form.audience.length === 0) return '流程至少需要选择一种适用人群'
  if (form.steps.length === 0) return '流程至少需要一个步骤'

  const scheduleError = validateDateRange(form.startsAt, form.endsAt, '办理时间')
  if (scheduleError) return scheduleError
  const validityError = validateDateRange(form.validFrom, form.validUntil, '公开有效期')
  if (validityError) return validityError

  for (const [index, step] of form.steps.entries()) {
    if (!step.title.trim()) return `请填写第 ${index + 1} 个步骤的标题`
    if (step.audience.length === 0) return `第 ${index + 1} 个步骤至少需要选择一种适用人群`
    if (!isHttpUrl(step.actionUrl.trim())) return `第 ${index + 1} 个步骤的办理链接必须是 http 或 https 地址`
  }

  for (const [index, material] of form.materials.entries()) {
    if (!material.name.trim()) return `请填写第 ${index + 1} 项材料名称`
    if (material.audience.length === 0) return `第 ${index + 1} 项材料至少需要选择一种适用人群`
  }

  return null
}

function buildPayload() {
  return {
    slug: form.slug.trim(),
    title: form.title.trim(),
    summary: form.summary.trim(),
    body: form.body.trim(),
    category: form.category.trim() || null,
    audience: [...form.audience],
    method: form.method,
    informationState: form.informationState,
    statusText: form.statusText.trim(),
    processingTime: form.processingTime.trim() || null,
    deadlineText: form.deadlineText.trim() || null,
    startsAt: toIsoOrNull(form.startsAt),
    endsAt: toIsoOrNull(form.endsAt),
    validFrom: toIsoOrNull(form.validFrom),
    validUntil: toIsoOrNull(form.validUntil),
    departmentId: form.departmentId || null,
    guideId: form.guideId || null,
    lastVerifiedAt: toIsoOrNull(form.lastVerifiedAt),
    sourceIds: [...form.sourceIds],
    placeIds: [...form.placeIds],
    steps: form.steps.map(step => ({
      title: step.title.trim(),
      description: step.description.trim(),
      audience: [...step.audience],
      informationState: step.informationState,
      timeText: step.timeText.trim() || null,
      placeId: step.placeId || null,
      departmentId: step.departmentId || null,
      actionUrl: step.actionUrl.trim() || null
    })),
    materials: form.materials.map(material => ({
      name: material.name.trim(),
      description: material.description.trim(),
      audience: [...material.audience],
      isRequired: material.isRequired,
      informationState: material.informationState,
      placeId: material.placeId || null,
      departmentId: material.departmentId || null
    }))
  }
}

async function saveProcedure(): Promise<void> {
  const validationError = validateForm()
  if (validationError) {
    formError.value = validationError
    return
  }

  saving.value = true
  formError.value = ''

  try {
    const endpoint = editingId.value
      ? `/api/admin/procedures/${encodeURIComponent(editingId.value)}`
      : '/api/admin/procedures'
    await $fetch(endpoint, {
      method: editingId.value ? 'PATCH' : 'POST',
      body: buildPayload(),
      credentials: 'include'
    })
    editorOpen.value = false
    toast.add({
      title: editingId.value ? '流程已更新' : '流程草稿已创建',
      color: 'success'
    })
    await loadProcedures()
  } catch (error) {
    if (await handleUnauthorized(error)) return
    formError.value = requestMessage(error, '保存失败，请检查字段和关联内容后重试。')
  } finally {
    saving.value = false
  }
}

async function runRowAction(procedure: ApiProcedure, action: RowAction): Promise<void> {
  rowActionId.value = procedure.id

  try {
    await $fetch(`/api/admin/procedures/${encodeURIComponent(procedure.id)}/${action}`, {
      method: 'POST',
      credentials: 'include'
    })
    toast.add({
      title: action === 'publish' ? '流程已发布' : '流程已下架',
      color: action === 'publish' ? 'success' : 'warning'
    })
    await loadProcedures()
  } catch (error) {
    if (await handleUnauthorized(error)) return
    toast.add({
      title: action === 'publish' ? '发布失败' : '下架失败',
      description: requestMessage(error, '请稍后重试。'),
      color: 'error'
    })
  } finally {
    rowActionId.value = null
  }
}

function requestDelete(procedure: ApiProcedure): void {
  deleteTarget.value = procedure
  deleteOpen.value = true
}

async function deleteProcedure(): Promise<void> {
  if (!deleteTarget.value) return
  deleting.value = true

  try {
    await $fetch(`/api/admin/procedures/${encodeURIComponent(deleteTarget.value.id)}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    deleteOpen.value = false
    toast.add({ title: '流程已删除并归档', color: 'success' })
    await loadProcedures()
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
  const normalized = Math.min(Math.max(nextPage, 1), pageCount.value)
  if (normalized === page.value) return
  page.value = normalized
  await loadProcedures()
}

function scheduleSearch(): void {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    void loadProcedures()
  }, 300)
}

watch(searchQuery, scheduleSearch)

watch(statusFilter, () => {
  page.value = 1
  void loadProcedures()
})

onMounted(() => {
  void Promise.all([loadProcedures(), loadReferences()])
})

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <div class="mx-auto max-w-[1500px]">
    <AdminPageHeader
      title="办事流程管理"
      description="维护报到和新生办事的结构化步骤、材料、地点、部门与核验依据。"
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

    <section class="mt-5 overflow-hidden rounded-md border border-zinc-200 bg-white">
      <div class="grid gap-3 border-b border-zinc-200 bg-zinc-50/70 p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="搜索流程、步骤或材料"
          aria-label="搜索办事流程"
        />
        <USelect
          v-model="statusFilter"
          :items="statusOptions"
          value-key="value"
          label-key="label"
          aria-label="按发布状态筛选"
        />
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
          @click="loadProcedures"
        />
      </div>

      <div
        v-if="loading && procedures.length === 0"
        class="divide-y divide-zinc-100"
        aria-label="正在加载流程"
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

      <template v-else-if="procedures.length">
        <div class="hidden overflow-x-auto md:block">
          <table class="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead class="bg-zinc-50 text-xs font-semibold text-zinc-500">
              <tr>
                <th class="min-w-64 border-b border-zinc-200 px-4 py-2.5">
                  流程
                </th>
                <th class="border-b border-zinc-200 px-4 py-2.5">
                  适用人群
                </th>
                <th class="border-b border-zinc-200 px-4 py-2.5">
                  办理方式
                </th>
                <th class="border-b border-zinc-200 px-4 py-2.5">
                  信息状态
                </th>
                <th class="border-b border-zinc-200 px-4 py-2.5">
                  发布状态
                </th>
                <th class="border-b border-zinc-200 px-4 py-2.5">
                  最后核验
                </th>
                <th class="w-44 border-b border-zinc-200 px-4 py-2.5 text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <tr
                v-for="procedure in procedures"
                :key="procedure.id"
                class="hover:bg-zinc-50/70"
              >
                <td class="px-4 py-3">
                  <p class="line-clamp-1 font-semibold text-zinc-950">
                    {{ procedure.title }}
                  </p>
                  <p class="mt-1 line-clamp-1 text-xs text-zinc-500">
                    {{ procedure.slug }} · {{ procedure.steps.length }} 个步骤 / {{ procedure.materials.length }} 项材料
                  </p>
                </td>
                <td class="px-4 py-3 text-zinc-600">
                  {{ audienceLabel(procedure.audience) }}
                </td>
                <td class="px-4 py-3 text-zinc-600">
                  {{ methodLabel(procedure.method) }}
                </td>
                <td class="px-4 py-3">
                  <UBadge
                    :color="informationStateColor(procedure.informationState)"
                    variant="soft"
                    size="sm"
                  >
                    {{ informationStateLabel(procedure.informationState) }}
                  </UBadge>
                </td>
                <td class="px-4 py-3">
                  <AdminStatusBadge :value="procedure.status" />
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                  {{ formatDate(procedure.lastVerifiedAt) }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <UTooltip text="编辑">
                      <UButton
                        icon="i-lucide-pencil"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :aria-label="`编辑${procedure.title}`"
                        @click="openEdit(procedure)"
                      />
                    </UTooltip>
                    <UTooltip
                      v-if="procedure.status !== 'published'"
                      text="发布"
                    >
                      <UButton
                        icon="i-lucide-send"
                        color="success"
                        variant="ghost"
                        size="sm"
                        :loading="rowActionId === procedure.id"
                        :aria-label="`发布${procedure.title}`"
                        @click="runRowAction(procedure, 'publish')"
                      />
                    </UTooltip>
                    <UTooltip
                      v-else
                      text="下架"
                    >
                      <UButton
                        icon="i-lucide-archive"
                        color="warning"
                        variant="ghost"
                        size="sm"
                        :loading="rowActionId === procedure.id"
                        :aria-label="`下架${procedure.title}`"
                        @click="runRowAction(procedure, 'unpublish')"
                      />
                    </UTooltip>
                    <UTooltip text="删除">
                      <UButton
                        icon="i-lucide-trash-2"
                        color="error"
                        variant="ghost"
                        size="sm"
                        :aria-label="`删除${procedure.title}`"
                        @click="requestDelete(procedure)"
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
            v-for="procedure in procedures"
            :key="procedure.id"
            class="p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="line-clamp-2 text-sm font-semibold text-zinc-950">
                  {{ procedure.title }}
                </p>
                <p class="mt-1 text-xs text-zinc-500">
                  {{ procedure.steps.length }} 个步骤 · {{ procedure.materials.length }} 项材料
                </p>
              </div>
              <AdminStatusBadge :value="procedure.status" />
            </div>
            <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt class="text-zinc-400">
                  适用人群
                </dt>
                <dd class="mt-0.5 text-zinc-700">
                  {{ audienceLabel(procedure.audience) }}
                </dd>
              </div>
              <div>
                <dt class="text-zinc-400">
                  办理方式
                </dt>
                <dd class="mt-0.5 text-zinc-700">
                  {{ methodLabel(procedure.method) }}
                </dd>
              </div>
            </dl>
            <div class="mt-3 flex flex-wrap items-center gap-1 border-t border-zinc-100 pt-2">
              <UButton
                icon="i-lucide-pencil"
                label="编辑"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="openEdit(procedure)"
              />
              <UButton
                v-if="procedure.status !== 'published'"
                icon="i-lucide-send"
                label="发布"
                color="success"
                variant="ghost"
                size="sm"
                :loading="rowActionId === procedure.id"
                @click="runRowAction(procedure, 'publish')"
              />
              <UButton
                v-else
                icon="i-lucide-archive"
                label="下架"
                color="warning"
                variant="ghost"
                size="sm"
                :loading="rowActionId === procedure.id"
                @click="runRowAction(procedure, 'unpublish')"
              />
              <UButton
                icon="i-lucide-trash-2"
                label="删除"
                color="error"
                variant="ghost"
                size="sm"
                class="ml-auto"
                @click="requestDelete(procedure)"
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
              name="i-lucide-list-x"
              class="size-5"
            />
          </span>
          <p class="mt-3 text-sm font-semibold text-zinc-800">
            没有匹配流程
          </p>
          <p class="mt-1 text-xs text-zinc-500">
            调整搜索或状态筛选后重试。
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
      :title="editingId ? '编辑办事流程' : '新增办事流程'"
      :description="editingId ? '更新结构化步骤、材料、关联地点与核验信息。' : '新建内容将先保存为草稿。'"
      scrollable
      :dismissible="!saving"
      :ui="{ content: 'sm:max-w-6xl' }"
    >
      <template #body>
        <div
          v-if="editorLoading"
          class="space-y-4 py-3"
          aria-label="正在加载流程详情"
        >
          <USkeleton class="h-10 w-full" />
          <USkeleton class="h-24 w-full" />
          <USkeleton class="h-48 w-full" />
        </div>

        <div
          v-else
          class="space-y-7"
        >
          <div
            v-if="formError"
            class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            <UIcon
              name="i-lucide-circle-alert"
              class="mt-0.5 size-4 shrink-0"
            />
            <span>{{ formError }}</span>
          </div>

          <div
            v-if="referencesError"
            class="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <span>{{ referencesError }}</span>
            <UButton
              label="重试加载"
              icon="i-lucide-refresh-cw"
              color="warning"
              variant="outline"
              size="sm"
              :loading="referencesLoading"
              @click="loadReferences(true)"
            />
          </div>

          <section>
            <h3 class="border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900">
              基本信息
            </h3>
            <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField
                label="流程标题"
                required
              >
                <UInput
                  v-model="form.title"
                  placeholder="例：新生到校报到"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="公开路径标识"
                description="仅使用小写字母、数字和连字符。"
                required
              >
                <UInput
                  v-model="form.slug"
                  placeholder="arrival-registration"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="分类"
                description="可留空，用于前台分组。"
              >
                <UInput
                  v-model="form.category"
                  placeholder="arrival"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="办理方式"
                required
              >
                <USelect
                  v-model="form.method"
                  :items="methodOptions"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="适用人群"
                description="至少选择一种。"
                required
                class="sm:col-span-2"
              >
                <div class="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-zinc-200 px-3 py-2">
                  <UCheckbox
                    v-for="option in audienceOptions"
                    :key="option.value"
                    :model-value="form.audience.includes(option.value)"
                    :label="option.label"
                    @update:model-value="value => toggleAudience(form, option.value, value === true)"
                  />
                </div>
              </UFormField>
              <UFormField
                label="摘要"
                required
                class="sm:col-span-2"
              >
                <UTextarea
                  v-model="form.summary"
                  :rows="3"
                  autoresize
                  placeholder="概括适用对象、办理目标和关键信息。"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="详细说明"
                class="sm:col-span-2"
              >
                <UTextarea
                  v-model="form.body"
                  :rows="6"
                  autoresize
                  placeholder="填写流程背景、注意事项和统一说明。"
                  class="w-full"
                />
              </UFormField>
            </div>
          </section>

          <section>
            <h3 class="border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900">
              状态与时间
            </h3>
            <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField
                label="信息确认状态"
                required
              >
                <USelect
                  v-model="form.informationState"
                  :items="informationStateOptions"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="前台状态说明"
                required
              >
                <UInput
                  v-model="form.statusText"
                  placeholder="例：等待 2026 级通知"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="预计办理时长">
                <UInput
                  v-model="form.processingTime"
                  placeholder="例：约 20 分钟"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="截止时间说明">
                <UInput
                  v-model="form.deadlineText"
                  placeholder="以录取通知书或当年通知为准"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="办理开始时间">
                <UInput
                  v-model="form.startsAt"
                  type="datetime-local"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="办理结束时间">
                <UInput
                  v-model="form.endsAt"
                  type="datetime-local"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="公开有效期开始"
                description="留空表示不限制开始时间。"
              >
                <UInput
                  v-model="form.validFrom"
                  type="datetime-local"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="公开有效期结束"
                description="过期后前台自动隐藏。"
              >
                <UInput
                  v-model="form.validUntil"
                  type="datetime-local"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="最后核验时间"
                description="发布前必须填写，且不能晚于当前时间。"
                class="sm:col-span-2"
              >
                <UInput
                  v-model="form.lastVerifiedAt"
                  type="datetime-local"
                  class="w-full sm:max-w-md"
                />
              </UFormField>
            </div>
          </section>

          <section>
            <h3 class="border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900">
              负责部门与关联内容
            </h3>
            <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="负责部门">
                <USelectMenu
                  v-model="form.departmentId"
                  :items="departmentOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="选择负责部门"
                  :loading="referencesLoading"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="相关指南">
                <USelectMenu
                  v-model="form.guideId"
                  :items="guideOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="选择相关指南"
                  :loading="referencesLoading"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="流程涉及地点"
                description="可选择多个，顺序按选择结果保存。"
                class="sm:col-span-2"
              >
                <USelectMenu
                  v-model="form.placeIds"
                  :items="placeOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="搜索并选择地点"
                  :loading="referencesLoading"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="核验来源"
                description="发布至少需要一个有效且达到发布等级的来源。"
                class="sm:col-span-2"
              >
                <USelectMenu
                  v-model="form.sourceIds"
                  :items="sourceOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="搜索并选择来源"
                  :loading="referencesLoading"
                  class="w-full"
                />
              </UFormField>
            </div>
          </section>

          <section>
            <div class="flex items-center justify-between gap-3 border-b border-zinc-200 pb-2">
              <div>
                <h3 class="text-sm font-semibold text-zinc-900">
                  办理步骤
                </h3>
                <p class="mt-0.5 text-xs text-zinc-500">
                  发布至少需要一个步骤，前台按此处顺序展示。
                </p>
              </div>
              <UButton
                icon="i-lucide-plus"
                label="添加步骤"
                color="neutral"
                variant="outline"
                size="sm"
                @click="addStep"
              />
            </div>

            <div class="mt-3 space-y-3">
              <article
                v-for="(step, index) in form.steps"
                :key="step.key"
                class="rounded-md border border-zinc-200 bg-zinc-50/40 p-3 sm:p-4"
              >
                <header class="flex items-center justify-between gap-3">
                  <p class="text-sm font-semibold text-zinc-900">
                    步骤 {{ index + 1 }}
                  </p>
                  <div class="flex items-center gap-1">
                    <UTooltip text="上移">
                      <UButton
                        icon="i-lucide-arrow-up"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :disabled="index === 0"
                        :aria-label="`上移步骤 ${index + 1}`"
                        @click="moveItem(form.steps, index, -1)"
                      />
                    </UTooltip>
                    <UTooltip text="下移">
                      <UButton
                        icon="i-lucide-arrow-down"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :disabled="index === form.steps.length - 1"
                        :aria-label="`下移步骤 ${index + 1}`"
                        @click="moveItem(form.steps, index, 1)"
                      />
                    </UTooltip>
                    <UTooltip text="删除步骤">
                      <UButton
                        icon="i-lucide-trash-2"
                        color="error"
                        variant="ghost"
                        size="sm"
                        :aria-label="`删除步骤 ${index + 1}`"
                        @click="removeStep(index)"
                      />
                    </UTooltip>
                  </div>
                </header>
                <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <UFormField
                    label="步骤标题"
                    required
                    class="sm:col-span-2"
                  >
                    <UInput
                      v-model="step.title"
                      placeholder="清晰描述本步要完成的事项"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    label="步骤说明"
                    class="sm:col-span-2"
                  >
                    <UTextarea
                      v-model="step.description"
                      :rows="3"
                      autoresize
                      placeholder="填写操作、材料核对和注意事项。"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    label="适用人群"
                    required
                    class="sm:col-span-2"
                  >
                    <div class="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-zinc-200 bg-white px-3 py-2">
                      <UCheckbox
                        v-for="option in audienceOptions"
                        :key="option.value"
                        :model-value="step.audience.includes(option.value)"
                        :label="option.label"
                        @update:model-value="value => toggleAudience(step, option.value, value === true)"
                      />
                    </div>
                  </UFormField>
                  <UFormField label="信息状态">
                    <USelect
                      v-model="step.informationState"
                      :items="informationStateOptions"
                      value-key="value"
                      label-key="label"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="时间说明">
                    <UInput
                      v-model="step.timeText"
                      placeholder="例：到校当天 08:00-17:00"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="办理地点">
                    <USelectMenu
                      v-model="step.placeId"
                      :items="placeOptionsWithEmpty"
                      value-key="value"
                      label-key="label"
                      placeholder="选择地点"
                      :loading="referencesLoading"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="负责部门">
                    <USelectMenu
                      v-model="step.departmentId"
                      :items="departmentOptions"
                      value-key="value"
                      label-key="label"
                      placeholder="选择部门"
                      :loading="referencesLoading"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    label="线上办理链接"
                    class="sm:col-span-2"
                  >
                    <UInput
                      v-model="step.actionUrl"
                      type="url"
                      placeholder="https://"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </article>

              <div
                v-if="form.steps.length === 0"
                class="rounded-md border border-dashed border-amber-300 bg-amber-50 p-5 text-center text-sm text-amber-900"
              >
                发布流程至少需要一个办理步骤。
              </div>
            </div>
          </section>

          <section>
            <div class="flex items-center justify-between gap-3 border-b border-zinc-200 pb-2">
              <div>
                <h3 class="text-sm font-semibold text-zinc-900">
                  所需材料
                </h3>
                <p class="mt-0.5 text-xs text-zinc-500">
                  材料可留空；已添加材料按此处顺序展示。
                </p>
              </div>
              <UButton
                icon="i-lucide-plus"
                label="添加材料"
                color="neutral"
                variant="outline"
                size="sm"
                @click="addMaterial"
              />
            </div>

            <div class="mt-3 space-y-3">
              <article
                v-for="(material, index) in form.materials"
                :key="material.key"
                class="rounded-md border border-zinc-200 bg-zinc-50/40 p-3 sm:p-4"
              >
                <header class="flex items-center justify-between gap-3">
                  <p class="text-sm font-semibold text-zinc-900">
                    材料 {{ index + 1 }}
                  </p>
                  <div class="flex items-center gap-1">
                    <UTooltip text="上移">
                      <UButton
                        icon="i-lucide-arrow-up"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :disabled="index === 0"
                        :aria-label="`上移材料 ${index + 1}`"
                        @click="moveItem(form.materials, index, -1)"
                      />
                    </UTooltip>
                    <UTooltip text="下移">
                      <UButton
                        icon="i-lucide-arrow-down"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        :disabled="index === form.materials.length - 1"
                        :aria-label="`下移材料 ${index + 1}`"
                        @click="moveItem(form.materials, index, 1)"
                      />
                    </UTooltip>
                    <UTooltip text="删除材料">
                      <UButton
                        icon="i-lucide-trash-2"
                        color="error"
                        variant="ghost"
                        size="sm"
                        :aria-label="`删除材料 ${index + 1}`"
                        @click="removeMaterial(index)"
                      />
                    </UTooltip>
                  </div>
                </header>
                <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <UFormField
                    label="材料名称"
                    required
                    class="sm:col-span-2"
                  >
                    <UInput
                      v-model="material.name"
                      placeholder="使用通知中的正式名称"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    label="材料说明"
                    class="sm:col-span-2"
                  >
                    <UTextarea
                      v-model="material.description"
                      :rows="2"
                      autoresize
                      placeholder="说明原件、复印件、份数等已确认要求。"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField
                    label="适用人群"
                    required
                    class="sm:col-span-2"
                  >
                    <div class="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-zinc-200 bg-white px-3 py-2">
                      <UCheckbox
                        v-for="option in audienceOptions"
                        :key="option.value"
                        :model-value="material.audience.includes(option.value)"
                        :label="option.label"
                        @update:model-value="value => toggleAudience(material, option.value, value === true)"
                      />
                    </div>
                  </UFormField>
                  <UFormField label="信息状态">
                    <USelect
                      v-model="material.informationState"
                      :items="informationStateOptions"
                      value-key="value"
                      label-key="label"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="是否必需">
                    <USelect
                      :model-value="requiredValue(material.isRequired)"
                      :items="requiredOptions"
                      value-key="value"
                      label-key="label"
                      class="w-full"
                      @update:model-value="value => setRequired(material, value)"
                    />
                  </UFormField>
                  <UFormField label="提交地点">
                    <USelectMenu
                      v-model="material.placeId"
                      :items="placeOptionsWithEmpty"
                      value-key="value"
                      label-key="label"
                      placeholder="选择地点"
                      :loading="referencesLoading"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="负责部门">
                    <USelectMenu
                      v-model="material.departmentId"
                      :items="departmentOptions"
                      value-key="value"
                      label-key="label"
                      placeholder="选择部门"
                      :loading="referencesLoading"
                      class="w-full"
                    />
                  </UFormField>
                </div>
              </article>

              <div
                v-if="form.materials.length === 0"
                class="rounded-md border border-dashed border-zinc-300 p-5 text-center text-sm text-zinc-500"
              >
                当前流程未登记所需材料。
              </div>
            </div>
          </section>

          <aside class="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div class="flex items-start gap-2">
              <UIcon
                name="i-lucide-shield-check"
                class="mt-0.5 size-4 shrink-0"
              />
              <p class="leading-6">
                保存不会自动发布。发布前还会由服务端检查核验时间、连续步骤、有效来源，以及所有关联部门和地点的公开状态。
              </p>
            </div>
          </aside>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            :disabled="saving"
            @click="editorOpen = false"
          />
          <UButton
            icon="i-lucide-save"
            label="保存流程"
            :loading="saving"
            :disabled="editorLoading"
            @click="saveProcedure"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteOpen"
      title="删除办事流程"
      :description="deleteTarget ? `确认删除“${deleteTarget.title}”？` : '确认删除此流程？'"
      :dismissible="!deleting"
    >
      <template #body>
        <p class="text-sm leading-6 text-zinc-600">
          当前服务端会将删除的流程归档并从前台隐藏，历史记录和审计信息会保留。
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
            @click="deleteProcedure"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
