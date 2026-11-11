<script setup lang="ts">
import type { ActivityStatus } from '~~/shared/constants/server'
import type { ApiAdminActivity } from '~~/shared/types/server'

const props = defineProps<{
  role: 'super' | 'organization'
  organizationTitle?: string
  initialStatus?: 'all' | ActivityStatus
}>()

interface AdminActivityListPayload {
  items: ApiAdminActivity[]
  total: number
  page: number
  pageSize: number
  counts: Record<ActivityStatus, number>
}

interface PlaceOption {
  id: string
  name: string
  slug: string
}

interface ActivityFormState {
  title: string
  summary: string
  body: string
  startsAt: string
  endsAt: string
  placeId: string
  room: string
  photos: string[]
}

type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

const STATUS_META: Record<ActivityStatus, { label: string, color: BadgeColor }> = {
  draft: { label: '草稿', color: 'neutral' },
  pending: { label: '待审核', color: 'warning' },
  published: { label: '已发布', color: 'success' },
  rejected: { label: '已驳回', color: 'error' },
  archived: { label: '已归档', color: 'neutral' }
}

const toast = useToast()

const items = ref<ApiAdminActivity[]>([])
const counts = ref<Record<ActivityStatus, number>>(emptyCounts())
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(true)
const activeStatus = ref<'all' | ActivityStatus>(props.initialStatus ?? 'all')
const search = ref('')

const formOpen = ref(false)
const editing = ref<ApiAdminActivity | null>(null)
const saving = ref(false)
const form = reactive<ActivityFormState>(emptyForm())
const places = ref<PlaceOption[]>([])
const photoInput = ref<HTMLInputElement | null>(null)
const uploadingPhotos = ref(false)

const submittingId = ref('')
const archivingId = ref('')
const deletingId = ref('')

const reviewOpen = ref(false)
const reviewTarget = ref<ApiAdminActivity | null>(null)
const reviewNote = ref('')
const reviewing = ref(false)

const statusTabs = computed(() => {
  const tabs: Array<{ value: 'all' | ActivityStatus, label: string }> = [
    { value: 'all', label: '全部' }
  ]
  if (props.role === 'organization') tabs.push({ value: 'draft', label: '草稿' })
  tabs.push({ value: 'pending', label: '待审核' })
  tabs.push({ value: 'published', label: '已发布' })
  if (props.role === 'organization') tabs.push({ value: 'rejected', label: '已驳回' })
  tabs.push({ value: 'archived', label: '已归档' })
  return tabs
})

const placeOptions = computed(() => [
  { label: '不关联校园地点', value: '' },
  ...places.value.map(place => ({ label: place.name, value: place.id }))
])

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const canCreate = computed(() => props.role === 'organization')

function emptyCounts(): Record<ActivityStatus, number> {
  return { draft: 0, pending: 0, published: 0, rejected: 0, archived: 0 }
}

function emptyForm(): ActivityFormState {
  return {
    title: '',
    summary: '',
    body: '',
    startsAt: defaultStartLocal(),
    endsAt: '',
    placeId: '',
    room: '',
    photos: []
  }
}

function defaultStartLocal(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  return toLocalInput(date.toISOString())
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function formatRange(item: ApiAdminActivity): string {
  if (!item.endsAt) return formatDateTime(item.startsAt)
  return `${formatDateTime(item.startsAt)} – ${formatDateTime(item.endsAt)}`
}

function errorMessage(error: unknown): string {
  const data = (error as { data?: { statusMessage?: string, message?: string } } | null)?.data
  if (data?.statusMessage) return data.statusMessage
  if (data?.message) return data.message
  if (error instanceof Error && error.message) return error.message
  return '操作失败，请稍后再试。'
}

function showError(error: unknown, fallback: string): void {
  toast.add({ title: fallback, description: errorMessage(error), color: 'error' })
}

function tabCount(value: 'all' | ActivityStatus): number {
  if (value === 'all') {
    return Object.values(counts.value).reduce((sum, count) => sum + count, 0)
  }
  return counts.value[value] ?? 0
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const query = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize)
    })
    if (activeStatus.value !== 'all') query.set('status', activeStatus.value)
    if (search.value.trim()) query.set('q', search.value.trim())
    const payload = await adminFetch<AdminActivityListPayload>(`/api/admin/activities?${query.toString()}`)
    items.value = payload.items ?? []
    total.value = payload.total ?? 0
    counts.value = { ...emptyCounts(), ...(payload.counts ?? {}) }
    if (items.value.length === 0 && page.value > 1) {
      page.value -= 1
      await load()
    }
  } catch (error) {
    showError(error, '活动列表加载失败')
  } finally {
    loading.value = false
  }
}

async function loadPlaces(): Promise<void> {
  try {
    const payload = await adminFetch<{ items?: PlaceOption[] }>('/api/public/places?scope=campus&pageSize=100')
    places.value = payload.items ?? []
  } catch {
    places.value = []
  }
}

function applyFilters(): void {
  page.value = 1
  void load()
}

function changeStatus(value: 'all' | ActivityStatus): void {
  activeStatus.value = value
  page.value = 1
  void load()
}

function openCreate(): void {
  editing.value = null
  Object.assign(form, emptyForm())
  formOpen.value = true
}

function openEdit(item: ApiAdminActivity): void {
  editing.value = item
  Object.assign(form, {
    title: item.title,
    summary: item.summary,
    body: item.body,
    startsAt: toLocalInput(item.startsAt),
    endsAt: toLocalInput(item.endsAt),
    placeId: item.place?.id ?? '',
    room: item.room ?? '',
    photos: [...item.photos]
  })
  formOpen.value = true
}

function closeForm(): void {
  if (saving.value) return
  formOpen.value = false
}

async function save(): Promise<void> {
  if (saving.value) return
  const title = form.title.trim()
  const summary = form.summary.trim()
  if (!title) {
    toast.add({ title: '请填写活动标题', color: 'error' })
    return
  }
  if (!summary) {
    toast.add({ title: '请填写一句话简介', color: 'error' })
    return
  }
  const startsAt = new Date(form.startsAt)
  if (Number.isNaN(startsAt.getTime())) {
    toast.add({ title: '请选择有效的开始时间', color: 'error' })
    return
  }
  let endsAt: Date | null = null
  if (form.endsAt) {
    endsAt = new Date(form.endsAt)
    if (Number.isNaN(endsAt.getTime())) {
      toast.add({ title: '结束时间格式不正确', color: 'error' })
      return
    }
    if (endsAt.getTime() < startsAt.getTime()) {
      toast.add({ title: '结束时间不能早于开始时间', color: 'error' })
      return
    }
  }

  const payload = {
    title,
    summary,
    body: form.body.trim(),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt ? endsAt.toISOString() : null,
    placeId: form.placeId || null,
    room: form.room.trim() || null,
    photos: form.photos
  }

  saving.value = true
  try {
    if (editing.value) {
      await adminFetch(`/api/admin/activities/${editing.value.id}`, { method: 'PUT', body: payload })
      toast.add({ title: '活动已保存', color: 'success' })
    } else {
      await adminFetch('/api/admin/activities', { method: 'POST', body: payload })
      toast.add({ title: '草稿已创建', description: '确认内容后提交总管理员审核。', color: 'success' })
    }
    formOpen.value = false
    await load()
  } catch (error) {
    showError(error, '保存失败')
  } finally {
    saving.value = false
  }
}

async function submitForReview(item: ApiAdminActivity): Promise<void> {
  if (submittingId.value) return
  submittingId.value = item.id
  try {
    await adminFetch(`/api/admin/activities/${item.id}/submit`, { method: 'POST' })
    toast.add({ title: '已提交审核', description: '系统已向总管理员发送审核邮件。', color: 'success' })
    await load()
  } catch (error) {
    showError(error, '提交审核失败')
  } finally {
    submittingId.value = ''
  }
}

function openReview(item: ApiAdminActivity): void {
  reviewTarget.value = item
  reviewNote.value = ''
  reviewOpen.value = true
}

async function review(decision: 'approve' | 'reject'): Promise<void> {
  const target = reviewTarget.value
  if (!target || reviewing.value) return
  const note = reviewNote.value.trim()
  if (decision === 'reject' && !note) {
    toast.add({ title: '驳回时请填写原因', color: 'error' })
    return
  }
  reviewing.value = true
  try {
    await adminFetch(`/api/admin/activities/${target.id}/review`, {
      method: 'POST',
      body: { decision, note: note || null }
    })
    toast.add({
      title: decision === 'approve' ? '活动已通过审核并发布' : '活动已驳回',
      color: decision === 'approve' ? 'success' : 'warning'
    })
    reviewOpen.value = false
    await load()
  } catch (error) {
    showError(error, '审核失败')
  } finally {
    reviewing.value = false
  }
}

async function archive(item: ApiAdminActivity): Promise<void> {
  if (archivingId.value) return
  if (!window.confirm(`归档「${item.title}」？归档后前台不再展示。`)) return
  archivingId.value = item.id
  try {
    await adminFetch(`/api/admin/activities/${item.id}/archive`, { method: 'POST' })
    toast.add({ title: '活动已归档', color: 'success' })
    await load()
  } catch (error) {
    showError(error, '归档失败')
  } finally {
    archivingId.value = ''
  }
}

async function remove(item: ApiAdminActivity): Promise<void> {
  if (deletingId.value) return
  if (!window.confirm(`删除「${item.title}」？此操作不可恢复。`)) return
  deletingId.value = item.id
  try {
    await adminFetch(`/api/admin/activities/${item.id}`, { method: 'DELETE' })
    toast.add({ title: '活动已删除', color: 'success' })
    await load()
  } catch (error) {
    showError(error, '删除失败')
  } finally {
    deletingId.value = ''
  }
}

async function pickPhotos(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length || uploadingPhotos.value) return
  const remaining = 9 - form.photos.length
  if (remaining <= 0) {
    toast.add({ title: '最多上传 9 张照片', color: 'warning' })
    return
  }
  uploadingPhotos.value = true
  try {
    for (const file of files.slice(0, remaining)) {
      if (file.size > 5 * 1024 * 1024) {
        toast.add({ title: `${file.name} 超过 5MB，已跳过`, color: 'warning' })
        continue
      }
      const body = new FormData()
      body.append('image', file)
      try {
        const uploaded = await adminFetch<{ url: string }>('/api/admin/media/images', {
          method: 'POST',
          body
        })
        form.photos.push(uploaded.url)
      } catch (error) {
        showError(error, '照片上传失败')
        break
      }
    }
  } finally {
    uploadingPhotos.value = false
  }
}

function removePhoto(index: number): void {
  if (uploadingPhotos.value) return
  form.photos.splice(index, 1)
}

function canEdit(item: ApiAdminActivity): boolean {
  return props.role === 'organization' && (item.status === 'draft' || item.status === 'rejected')
}

function canSubmit(item: ApiAdminActivity): boolean {
  return props.role === 'organization' && (item.status === 'draft' || item.status === 'rejected')
}

function canDelete(item: ApiAdminActivity): boolean {
  if (props.role === 'super') return true
  return item.status === 'draft' || item.status === 'rejected'
}

function canArchive(item: ApiAdminActivity): boolean {
  return item.status === 'published'
}

onMounted(() => {
  void load()
  void loadPlaces()
})
</script>

<template>
  <section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium tracking-wide text-green-700 dark:text-green-400">
          {{ role === 'super' ? '校级审核' : '组织后台' }}
        </p>
        <h1 class="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
          活动管理
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
          {{ role === 'super'
            ? '审核各社团与部门提交的活动，通过后自动进入首页通告、组织主页和地图教学卡片。'
            : `${organizationTitle || '本组织'}发布的活动需经总管理员审核，审核通过后展示在前台。` }}
        </p>
      </div>
      <UButton
        v-if="canCreate"
        icon="i-lucide-plus"
        color="primary"
        @click="openCreate"
      >
        新建活动
      </UButton>
    </div>

    <div class="mt-5 flex flex-wrap gap-2">
      <button
        v-for="tab in statusTabs"
        :key="tab.value"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition"
        :class="activeStatus === tab.value
          ? 'border-green-700 bg-green-700 text-white dark:border-green-600 dark:bg-green-600'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'"
        @click="changeStatus(tab.value)"
      >
        {{ tab.label }}
        <span
          class="rounded-full px-1.5 text-xs"
          :class="activeStatus === tab.value ? 'bg-white/20' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'"
        >{{ tabCount(tab.value) }}</span>
      </button>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="搜索活动标题或简介"
        class="w-full sm:w-80"
        @keyup.enter="applyFilters"
      />
      <UButton
        color="neutral"
        variant="soft"
        @click="applyFilters"
      >
        搜索
      </UButton>
      <span class="text-xs text-gray-500 dark:text-gray-400">
        共 {{ total }} 条
      </span>
    </div>
  </section>

  <div
    v-if="loading"
    class="mt-4 grid min-h-52 place-items-center rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
    role="status"
  >
    <UIcon
      name="i-lucide-loader-circle"
      class="size-6 animate-spin text-green-700 dark:text-green-400"
    />
  </div>

  <div
    v-else-if="items.length === 0"
    class="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-900"
  >
    <UIcon
      name="i-lucide-calendar-days"
      class="mx-auto size-9 text-gray-400"
    />
    <p class="mt-3 text-sm text-gray-600 dark:text-gray-400">
      {{ activeStatus === 'all' ? '还没有活动，先发布一个吧。' : '当前筛选条件下没有活动。' }}
    </p>
  </div>

  <div
    v-else
    class="mt-4 space-y-3"
  >
    <article
      v-for="item in items"
      :key="item.id"
      class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <div class="flex flex-col gap-4 sm:flex-row">
        <img
          v-if="item.photos[0]"
          :src="item.photos[0]"
          :alt="`${item.title} 封面`"
          class="h-28 w-full rounded-lg object-cover sm:w-40"
          loading="lazy"
        >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              :color="STATUS_META[item.status].color"
              variant="subtle"
              size="sm"
            >
              {{ STATUS_META[item.status].label }}
            </UBadge>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {{ item.organization?.title || organizationTitle || '本组织' }}
            </span>
          </div>
          <h2 class="mt-1.5 text-base font-semibold text-gray-900 dark:text-gray-100">
            <NuxtLink
              v-if="item.status === 'published'"
              :to="`/activities/${item.slug}`"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-green-700 dark:hover:text-green-400"
            >
              {{ item.title }}
            </NuxtLink>
            <span v-else>{{ item.title }}</span>
          </h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {{ formatRange(item) }}
            <template v-if="item.place">
              · {{ item.place.name }}{{ item.room ? ` ${item.room}` : '' }}
            </template>
            <template v-else-if="item.room">
              · {{ item.room }}
            </template>
          </p>
          <p class="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
            {{ item.summary }}
          </p>
          <p
            v-if="item.status === 'rejected' && item.reviewNote"
            class="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            驳回原因：{{ item.reviewNote }}
          </p>
          <p
            v-if="item.status === 'pending'"
            class="mt-2 text-xs text-amber-700 dark:text-amber-400"
          >
            已提交审核，审核期间不可修改。
          </p>
        </div>

        <div class="flex shrink-0 flex-row flex-wrap gap-2 sm:w-28 sm:flex-col">
          <UButton
            v-if="canEdit(item)"
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-pencil"
            @click="openEdit(item)"
          >
            编辑
          </UButton>
          <UButton
            v-if="canSubmit(item)"
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-send"
            :loading="submittingId === item.id"
            @click="submitForReview(item)"
          >
            提交审核
          </UButton>
          <UButton
            v-if="role === 'super' && item.status === 'pending'"
            size="xs"
            color="warning"
            variant="soft"
            icon="i-lucide-shield-check"
            @click="openReview(item)"
          >
            审核
          </UButton>
          <UButton
            v-if="item.status === 'published'"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-external-link"
            :to="`/activities/${item.slug}`"
            target="_blank"
            rel="noopener noreferrer"
          >
            查看
          </UButton>
          <UButton
            v-if="canArchive(item)"
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-archive"
            :loading="archivingId === item.id"
            @click="archive(item)"
          >
            归档
          </UButton>
          <UButton
            v-if="canDelete(item)"
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            :loading="deletingId === item.id"
            @click="remove(item)"
          >
            删除
          </UButton>
        </div>
      </div>
    </article>
  </div>

  <div
    v-if="totalPages > 1"
    class="mt-4 flex items-center justify-center gap-3"
  >
    <UButton
      size="sm"
      color="neutral"
      variant="soft"
      :disabled="page <= 1 || loading"
      @click="page -= 1; load()"
    >
      上一页
    </UButton>
    <span class="text-sm text-gray-600 dark:text-gray-400">
      {{ page }} / {{ totalPages }}
    </span>
    <UButton
      size="sm"
      color="neutral"
      variant="soft"
      :disabled="page >= totalPages || loading"
      @click="page += 1; load()"
    >
      下一页
    </UButton>
  </div>

  <UModal
    v-model:open="formOpen"
    :title="editing ? '编辑活动' : '发布活动'"
    :ui="{ content: 'max-w-3xl' }"
    :close="{ disabled: saving }"
  >
    <template #body>
      <div class="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        <UFormField
          label="活动标题"
          required
        >
          <UInput
            v-model="form.title"
            maxlength="120"
            placeholder="如：计算机协会 Agent 工作流分享会"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="一句话简介"
          required
          hint="展示在列表与首页通告中，建议 60 字以内"
        >
          <UInput
            v-model="form.summary"
            maxlength="500"
            class="w-full"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="开始时间"
            required
          >
            <UInput
              v-model="form.startsAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
          <UFormField label="结束时间">
            <UInput
              v-model="form.endsAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="校园地点"
            hint="关联后活动会出现在地图建筑卡片中"
          >
            <USelect
              v-model="form.placeId"
              :items="placeOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="教室 / 地点备注">
            <UInput
              v-model="form.room"
              maxlength="80"
              placeholder="如：吉龙楼 302"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="活动详情">
          <UTextarea
            v-model="form.body"
            :rows="8"
            maxlength="20000"
            placeholder="活动流程、报名方式、注意事项等"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="活动照片"
          hint="最多 9 张，第一张作为封面，单张不超过 5MB"
        >
          <div class="flex flex-wrap gap-3">
            <div
              v-for="(photo, index) in form.photos"
              :key="photo"
              class="relative size-24 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <img
                :src="photo"
                :alt="`活动照片 ${index + 1}`"
                class="size-full object-cover"
              >
              <button
                type="button"
                class="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="移除照片"
                @click="removePhoto(index)"
              >
                <UIcon
                  name="i-lucide-x"
                  class="size-3"
                />
              </button>
              <span
                v-if="index === 0"
                class="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white"
              >封面</span>
            </div>
            <button
              v-if="form.photos.length < 9"
              type="button"
              class="grid size-24 place-items-center rounded-lg border border-dashed border-gray-300 text-gray-500 transition hover:border-green-600 hover:text-green-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400"
              :disabled="uploadingPhotos"
              @click="photoInput?.click()"
            >
              <UIcon
                :name="uploadingPhotos ? 'i-lucide-loader-circle' : 'i-lucide-image-plus'"
                class="size-5"
                :class="{ 'animate-spin': uploadingPhotos }"
              />
              <span class="mt-1 text-xs">添加照片</span>
            </button>
          </div>
          <input
            ref="photoInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            class="hidden"
            @change="pickPhotos"
          >
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          保存后为草稿，提交审核后由总管理员发布。
        </p>
        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="saving"
            @click="closeForm"
          >
            取消
          </UButton>
          <UButton
            color="primary"
            :loading="saving"
            @click="save"
          >
            {{ editing ? '保存修改' : '保存草稿' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="reviewOpen"
    title="审核活动"
  >
    <template #body>
      <div
        v-if="reviewTarget"
        class="space-y-4"
      >
        <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
          <p class="font-medium text-gray-900 dark:text-gray-100">
            {{ reviewTarget.title }}
          </p>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {{ reviewTarget.organization?.title }} · {{ formatRange(reviewTarget) }}
          </p>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ reviewTarget.summary }}
          </p>
          <p
            v-if="reviewTarget.place"
            class="mt-1 text-xs text-gray-500 dark:text-gray-400"
          >
            {{ reviewTarget.place.name }}{{ reviewTarget.room ? ` ${reviewTarget.room}` : '' }}
          </p>
        </div>
        <UFormField
          label="审核意见"
          hint="驳回时必填，组织管理员会在活动列表看到"
        >
          <UTextarea
            v-model="reviewNote"
            :rows="4"
            maxlength="2000"
            placeholder="通过可不填；驳回请说明原因。"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="reviewing"
          @click="reviewOpen = false"
        >
          取消
        </UButton>
        <UButton
          color="error"
          variant="soft"
          :loading="reviewing"
          @click="review('reject')"
        >
          驳回
        </UButton>
        <UButton
          color="success"
          :loading="reviewing"
          @click="review('approve')"
        >
          通过并发布
        </UButton>
      </div>
    </template>
  </UModal>
</template>
