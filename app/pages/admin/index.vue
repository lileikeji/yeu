<script setup lang="ts">
definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: '管理概览',
  robots: 'noindex, nofollow'
})

interface DashboardModule {
  key: string
  label: string
  icon: string
  endpoint: string
  to: string
  query?: Record<string, string | number>
  color: string
}

type DashboardRecord = Record<string, unknown>

const modules: DashboardModule[] = [
  {
    key: 'places',
    label: '地点',
    icon: 'i-lucide-map-pin',
    endpoint: '/api/admin/places',
    to: '/admin/places',
    color: 'text-blue-700 bg-blue-50'
  },
  {
    key: 'content',
    label: '内容',
    icon: 'i-lucide-files',
    endpoint: '/api/admin/content',
    to: '/admin/content',
    color: 'text-green-700 bg-green-50'
  },
  {
    key: 'sources',
    label: '来源',
    icon: 'i-lucide-book-marked',
    endpoint: '/api/admin/sources',
    to: '/admin/sources',
    color: 'text-violet-700 bg-violet-50'
  },
  {
    key: 'feedback',
    label: '待处理反馈',
    icon: 'i-lucide-message-square-warning',
    endpoint: '/api/admin/feedback',
    to: '/admin/feedback',
    query: { status: 'new' },
    color: 'text-orange-700 bg-orange-50'
  }
]

const counts = reactive<Record<string, number | null>>({})
const recentFeedback = ref<DashboardRecord[]>([])
const recentAudit = ref<DashboardRecord[]>([])
const loading = ref(false)
const loadError = ref('')

const quickActions = [
  { label: '新增地点', icon: 'i-lucide-map-pin-plus', to: '/admin/places?action=create' },
  { label: '新增内容', icon: 'i-lucide-file-plus-2', to: '/admin/content?action=create' },
  { label: '登记来源', icon: 'i-lucide-book-plus', to: '/admin/sources?action=create' },
  { label: '处理反馈', icon: 'i-lucide-message-square-reply', to: '/admin/feedback' }
]

function isObject(value: unknown): value is DashboardRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeResponse(response: unknown): { items: DashboardRecord[], total: number } {
  if (Array.isArray(response)) {
    const items = response.filter(isObject)
    return { items, total: items.length }
  }

  if (!isObject(response)) return { items: [], total: 0 }
  const nestedData = isObject(response.data) ? response.data : null
  const sourceItems = Array.isArray(response.items)
    ? response.items
    : Array.isArray(response.data)
      ? response.data
      : Array.isArray(nestedData?.items)
        ? nestedData.items
        : []
  const items = sourceItems.filter(isObject)
  const rawTotal = response.total ?? nestedData?.total
  const total = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal)
  return { items, total: Number.isFinite(total) ? total : items.length }
}

function statusCode(error: unknown): number | null {
  if (!isObject(error)) return null
  if (typeof error.statusCode === 'number') return error.statusCode
  if (isObject(error.response) && typeof error.response.status === 'number') return error.response.status
  return null
}

async function loadDashboard(): Promise<void> {
  loading.value = true
  loadError.value = ''

  const requests = modules.map(async (module) => {
    const response = await $fetch<unknown>(module.endpoint, {
      query: { page: 1, pageSize: 5, ...(module.query ?? {}) },
      credentials: 'include'
    })
    return { key: module.key, ...normalizeResponse(response) }
  })

  requests.push((async () => {
    const response = await $fetch<unknown>('/api/admin/audit-logs', {
      query: { page: 1, pageSize: 6 },
      credentials: 'include'
    })
    return { key: 'audit', ...normalizeResponse(response) }
  })())

  const results = await Promise.allSettled(requests)
  let failed = false

  for (const result of results) {
    if (result.status === 'rejected') {
      const code = statusCode(result.reason)
      if (code === 401 || code === 403) {
        await navigateTo('/admin/login', { replace: true })
        return
      }
      failed = true
      continue
    }

    const { key, items, total } = result.value
    if (key === 'feedback') recentFeedback.value = items
    if (key === 'audit') recentAudit.value = items
    if (key !== 'audit') counts[key] = total
  }

  for (const module of modules) {
    if (!(module.key in counts)) counts[module.key] = null
  }

  if (failed) loadError.value = '部分管理数据暂时不可用。'
  loading.value = false
}

function value(record: DashboardRecord, ...keys: string[]): string {
  for (const key of keys) {
    const item = record[key]
    if (typeof item === 'string' || typeof item === 'number') return String(item)
  }
  return '—'
}

function formatDate(record: DashboardRecord): string {
  const raw = record.createdAt ?? record.created_at ?? record.updatedAt ?? record.updated_at
  if (typeof raw !== 'string' && typeof raw !== 'number') return '—'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(raw)
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

onMounted(() => {
  void loadDashboard()
})
</script>

<template>
  <div class="mx-auto max-w-[1500px]">
    <AdminPageHeader
      title="管理概览"
      description="待处理事项、内容规模与最近操作。"
      icon="i-lucide-layout-dashboard"
      eyebrow="工作台"
    >
      <template #actions>
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="outline"
          :loading="loading"
          @click="loadDashboard"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="loadError"
      class="mt-4 flex items-center gap-2 border-l-2 border-orange-500 bg-orange-50 px-3 py-2 text-sm text-orange-800"
      role="status"
    >
      <UIcon
        name="i-lucide-triangle-alert"
        class="size-4 shrink-0"
      />
      {{ loadError }}
    </div>

    <section
      class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="内容统计"
    >
      <NuxtLink
        v-for="module in modules"
        :key="module.key"
        :to="module.to"
        class="group rounded-md border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
      >
        <div class="flex items-start justify-between gap-3">
          <span
            class="grid size-9 place-items-center rounded-md"
            :class="module.color"
          >
            <UIcon
              :name="module.icon"
              class="size-4"
            />
          </span>
          <UIcon
            name="i-lucide-arrow-up-right"
            class="size-4 text-zinc-300 group-hover:text-zinc-500"
          />
        </div>
        <p class="mt-4 text-2xl font-bold text-zinc-950">
          <USkeleton
            v-if="loading && counts[module.key] === undefined"
            class="h-7 w-14"
          />
          <template v-else>
            {{ counts[module.key] ?? '—' }}
          </template>
        </p>
        <p class="mt-1 text-xs font-medium text-zinc-500">
          {{ module.label }}
        </p>
      </NuxtLink>
    </section>

    <section class="mt-5 border-y border-zinc-200 bg-white px-4 py-3">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <h2 class="shrink-0 text-sm font-semibold text-zinc-900">
          快捷操作
        </h2>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="action in quickActions"
            :key="action.to"
            :to="action.to"
            :icon="action.icon"
            :label="action.label"
            color="neutral"
            variant="soft"
            size="sm"
          />
        </div>
      </div>
    </section>

    <div class="mt-5 grid gap-5 xl:grid-cols-2">
      <section class="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950">
              待处理反馈
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500">
              最近提交
            </p>
          </div>
          <UButton
            to="/admin/feedback"
            icon="i-lucide-arrow-right"
            trailing
            label="全部"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </div>
        <div
          v-if="recentFeedback.length"
          class="divide-y divide-zinc-100"
        >
          <NuxtLink
            v-for="item in recentFeedback"
            :key="value(item, 'id', '_id')"
            to="/admin/feedback"
            class="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50"
          >
            <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-orange-50 text-orange-700">
              <UIcon
                name="i-lucide-message-square-warning"
                class="size-4"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900">
                {{ value(item, 'reasonType', 'targetType') }}
              </p>
              <p class="mt-1 line-clamp-1 text-xs text-zinc-500">
                {{ value(item, 'message') }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-zinc-400">{{ formatDate(item) }}</span>
          </NuxtLink>
        </div>
        <p
          v-else
          class="px-4 py-10 text-center text-sm text-zinc-500"
        >
          暂无待处理反馈
        </p>
      </section>

      <section class="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950">
              最近操作
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500">
              审计日志
            </p>
          </div>
          <UButton
            to="/admin/audit-logs"
            icon="i-lucide-arrow-right"
            trailing
            label="全部"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </div>
        <div
          v-if="recentAudit.length"
          class="divide-y divide-zinc-100"
        >
          <div
            v-for="item in recentAudit"
            :key="value(item, 'id', '_id')"
            class="flex items-start gap-3 px-4 py-3"
          >
            <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-600">
              <UIcon
                name="i-lucide-history"
                class="size-4"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900">
                {{ value(item, 'action', 'event', 'operation') }}
              </p>
              <p class="mt-1 truncate text-xs text-zinc-500">
                {{ value(item, 'entityTitle', 'entityType', 'target') }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-zinc-400">{{ formatDate(item) }}</span>
          </div>
        </div>
        <p
          v-else
          class="px-4 py-10 text-center text-sm text-zinc-500"
        >
          暂无操作记录
        </p>
      </section>
    </div>
  </div>
</template>
