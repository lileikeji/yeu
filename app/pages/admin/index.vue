<script setup lang="ts">
import {
  adminDashboardGroupMeta,
  adminDashboardModules,
  adminDashboardModulesByGroup,
  adminDashboardQuickActions,
  adminDashboardRecordValue,
  adminDashboardStatusCode,
  formatAdminDashboardDate,
  normalizeAdminDashboardResponse,
  type AdminDashboardRecord
} from '~~/app/utils/admin-dashboard-presentation'

definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: '管理概览',
  robots: 'noindex, nofollow'
})

const counts = reactive<Record<string, number | null>>({})
const recentFeedback = ref<AdminDashboardRecord[]>([])
const recentAudit = ref<AdminDashboardRecord[]>([])
const loading = ref(false)
const loadError = ref('')

const moduleGroups = computed(() =>
  adminDashboardGroupMeta.map(group => ({
    ...group,
    modules: adminDashboardModulesByGroup(group.key)
  }))
)

async function loadDashboard(): Promise<void> {
  loading.value = true
  loadError.value = ''

  const requests = adminDashboardModules.map(async (module) => {
    const response = await adminFetch<unknown>(module.endpoint, {
      query: { page: 1, pageSize: 5, ...(module.query ?? {}) }
    })
    return { key: module.key, ...normalizeAdminDashboardResponse(response) }
  })

  requests.push((async () => {
    const response = await adminFetch<unknown>('/api/admin/audit', {
      query: { page: 1, pageSize: 6 }
    })
    return { key: 'audit', ...normalizeAdminDashboardResponse(response) }
  })())

  const results = await Promise.allSettled(requests)
  let failed = false

  for (const result of results) {
    if (result.status === 'rejected') {
      const code = adminDashboardStatusCode(result.reason)
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

  for (const module of adminDashboardModules) {
    if (!(module.key in counts)) counts[module.key] = null
  }

  if (failed) loadError.value = '部分管理数据暂时不可用。'
  loading.value = false
}

onMounted(() => {
  void loadDashboard()
})
</script>

<template>
  <div class="mx-auto max-w-[1500px]">
    <AdminPageHeader
      title="管理概览"
      description="内容资产、用户互动与安全审计分区一览。"
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
      v-for="group in moduleGroups"
      :key="group.key"
      class="mt-5"
      :aria-label="group.label"
    >
      <div class="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-zinc-950">
            {{ group.label }}
          </h2>
          <p class="mt-0.5 text-xs text-zinc-500">
            {{ group.description }}
          </p>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <NuxtLink
          v-for="module in group.modules"
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
      </div>
    </section>

    <section class="mt-5 border-y border-zinc-200 bg-white px-4 py-3">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <h2 class="shrink-0 text-sm font-semibold text-zinc-900">
          快捷操作
        </h2>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="action in adminDashboardQuickActions"
            :key="action.to + action.label"
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
              用户与互动
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
            :key="adminDashboardRecordValue(item, 'id', '_id')"
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
                {{ adminDashboardRecordValue(item, 'reasonType', 'targetType') }}
              </p>
              <p class="mt-1 line-clamp-1 text-xs text-zinc-500">
                {{ adminDashboardRecordValue(item, 'message') }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-zinc-400">{{ formatAdminDashboardDate(item) }}</span>
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
              安全与审计
            </p>
          </div>
          <UButton
            to="/admin/audit"
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
            :key="adminDashboardRecordValue(item, 'id', '_id')"
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
                {{ adminDashboardRecordValue(item, 'action', 'event', 'operation') }}
              </p>
              <p class="mt-1 truncate text-xs text-zinc-500">
                {{ adminDashboardRecordValue(item, 'entityTitle', 'entityType', 'target') }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-zinc-400">{{ formatAdminDashboardDate(item) }}</span>
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
