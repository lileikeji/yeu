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
import {
  adminAuditActionLabels,
  adminBanScopeLabels,
  adminLabel,
  formatAdminDateTime,
  formatAdminRelativeTime,
  shortAdminId
} from '~~/app/utils/admin-security-labels'
import { adminFetch } from '~~/app/utils/admin-request'

definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: '管理概览',
  robots: 'noindex, nofollow'
})

const counts = reactive<Record<string, number | null>>({})
const recentFeedback = ref<AdminDashboardRecord[]>([])
const recentAudit = ref<AdminDashboardRecord[]>([])
const recentBans = ref<AdminDashboardRecord[]>([])
const recentVisitors = ref<AdminDashboardRecord[]>([])
const securitySnapshot = reactive({
  activeBans: null as number | null,
  bannedVisitors: null as number | null,
  activeMutes: null as number | null,
  mutedRooms: null as number | null,
  totalUsers: null as number | null,
  totalVisitors: null as number | null,
  totalMessages: null as number | null,
  deletedMessages: null as number | null
})
const securityLast24h = reactive({
  visitorsActive: null as number | null,
  visitorsNew: null as number | null,
  visitorEvents: null as number | null,
  bansCreated: null as number | null,
  mutesCreated: null as number | null,
  messages: null as number | null,
  auditEvents: null as number | null,
  adminLogins: null as number | null
})
const securityTopPaths = ref<Array<{ path: string; count: number }>>([])
const securityTopCities = ref<Array<{ city: string; count: number }>>([])
const securityRecentMutes = ref<Array<{
  id: string
  userId: string
  roomId: string | null
  reason: string
  expiresAt: string | null
  createdAt: string
  username: string | null
  displayName: string | null
  roomTitle: string | null
}>>([])
const securityGeneratedAt = ref('')
const loading = ref(false)
const loadError = ref('')

const moduleGroups = computed(() =>
  adminDashboardGroupMeta.map(group => ({
    ...group,
    modules: adminDashboardModulesByGroup(group.key)
  }))
)

function auditActionLabel(record: AdminDashboardRecord): string {
  const raw = adminDashboardRecordValue(record, 'action', 'event', 'operation')
  return adminLabel(adminAuditActionLabels, raw === '—' ? '' : raw, raw)
}

function banScopeLabel(record: AdminDashboardRecord): string {
  const raw = adminDashboardRecordValue(record, 'scope')
  return adminLabel(adminBanScopeLabels, raw === '—' ? '' : raw, raw)
}

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

  requests.push((async () => {
    const response = await adminFetch<unknown>('/api/admin/visitors/bans', {
      query: { page: 1, pageSize: 5, active: 'true' }
    })
    return { key: 'recent-bans', ...normalizeAdminDashboardResponse(response) }
  })())

  requests.push((async () => {
    const response = await adminFetch<unknown>('/api/admin/visitors', {
      query: { page: 1, pageSize: 5 }
    })
    return { key: 'recent-visitors', ...normalizeAdminDashboardResponse(response) }
  })())

  
  requests.push((async () => {
    const response = await adminFetch<{
      generatedAt?: string
      counts?: Record<string, number>
      last24h?: Record<string, number>
      topPaths?: Array<{ path: string; count: number }>
      topCities?: Array<{ city: string; count: number }>
      recentMutes?: Array<{
        id: string
        userId: string
        roomId: string | null
        reason: string
        expiresAt: string | null
        createdAt: string
        username: string | null
        displayName: string | null
        roomTitle: string | null
      }>
    }>('/api/admin/security/snapshot')
    return { key: 'security-snapshot', items: [], total: 0, snapshot: response }
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

    const { key, items, total } = result.value as any
    if (key === 'feedback') recentFeedback.value = items
    if (key === 'audit') recentAudit.value = items
    if (key === 'recent-bans') recentBans.value = items
    if (key === 'recent-visitors') recentVisitors.value = items
    if (key === 'security-snapshot') {
      const snap = (result.value as any).snapshot || {}
      const c = snap.counts || {}
      const h = snap.last24h || {}
      securitySnapshot.activeBans = Number(c.activeBans ?? 0)
      securitySnapshot.bannedVisitors = Number(c.bannedVisitors ?? 0)
      securitySnapshot.activeMutes = Number(c.activeMutes ?? 0)
      securitySnapshot.mutedRooms = Number(c.mutedRooms ?? 0)
      securitySnapshot.totalUsers = Number(c.totalUsers ?? 0)
      securitySnapshot.totalVisitors = Number(c.totalVisitors ?? 0)
      securitySnapshot.totalMessages = Number(c.totalMessages ?? 0)
      securitySnapshot.deletedMessages = Number(c.deletedMessages ?? 0)
      securityLast24h.visitorsActive = Number(h.visitorsActive ?? 0)
      securityLast24h.visitorsNew = Number(h.visitorsNew ?? 0)
      securityLast24h.visitorEvents = Number(h.visitorEvents ?? 0)
      securityLast24h.bansCreated = Number(h.bansCreated ?? 0)
      securityLast24h.mutesCreated = Number(h.mutesCreated ?? 0)
      securityLast24h.messages = Number(h.messages ?? 0)
      securityLast24h.auditEvents = Number(h.auditEvents ?? 0)
      securityLast24h.adminLogins = Number(h.adminLogins ?? 0)
      securityTopPaths.value = Array.isArray(snap.topPaths) ? snap.topPaths : []
      securityTopCities.value = Array.isArray(snap.topCities) ? snap.topCities : []
      securityRecentMutes.value = Array.isArray(snap.recentMutes) ? snap.recentMutes : []
      securityGeneratedAt.value = snap.generatedAt || ''
    } else if (key !== 'audit' && key !== 'recent-bans' && key !== 'recent-visitors') {
      counts[key] = total
    }
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
      class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="安全态势"
    >
      <NuxtLink
        to="/admin/bans?active=true"
        class="rounded-md border border-red-200 bg-red-50/50 p-4 transition hover:border-red-300"
      >
        <p class="text-xs font-medium text-red-700">生效封禁</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">
          <USkeleton v-if="loading && securitySnapshot.activeBans == null" class="h-7 w-12" />
          <template v-else>{{ securitySnapshot.activeBans ?? '—' }}</template>
        </p>
        <p class="mt-1 text-[11px] text-zinc-500">IP / 访客 / 账号</p>
      </NuxtLink>
      <NuxtLink
        to="/admin/visitors?banned=true"
        class="rounded-md border border-rose-200 bg-rose-50/40 p-4 transition hover:border-rose-300"
      >
        <p class="text-xs font-medium text-rose-700">命中封禁访客</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">
          <USkeleton v-if="loading && securitySnapshot.bannedVisitors == null" class="h-7 w-12" />
          <template v-else>{{ securitySnapshot.bannedVisitors ?? '—' }}</template>
        </p>
        <p class="mt-1 text-[11px] text-zinc-500">当前列表命中封禁策略</p>
      </NuxtLink>
      <NuxtLink
        to="/admin/chat"
        class="rounded-md border border-amber-200 bg-amber-50/40 p-4 transition hover:border-amber-300"
      >
        <p class="text-xs font-medium text-amber-800">个人禁言</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">
          <USkeleton v-if="loading && securitySnapshot.activeMutes == null" class="h-7 w-12" />
          <template v-else>{{ securitySnapshot.activeMutes ?? '—' }}</template>
        </p>
        <p class="mt-1 text-[11px] text-zinc-500">生效中的用户禁言</p>
      </NuxtLink>
      <NuxtLink
        to="/admin/chat"
        class="rounded-md border border-orange-200 bg-orange-50/40 p-4 transition hover:border-orange-300"
      >
        <p class="text-xs font-medium text-orange-800">全员禁言房间</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">
          <USkeleton v-if="loading && securitySnapshot.mutedRooms == null" class="h-7 w-12" />
          <template v-else>{{ securitySnapshot.mutedRooms ?? '—' }}</template>
        </p>
        <p class="mt-1 text-[11px] text-zinc-500">房间级 mute-all</p>
      </NuxtLink>
    </section>

    <section class="mt-4 grid gap-3 lg:grid-cols-3" aria-label="安全深度快照">
      <div class="rounded-md border border-zinc-200 bg-white p-4 lg:col-span-2">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950">近 24 小时动态</h2>
            <p class="mt-0.5 text-[11px] text-zinc-500">
              访客活跃、封禁禁言与审计动作
              <template v-if="securityGeneratedAt"> · 更新 {{ formatAdminRelativeTime(securityGeneratedAt) }}</template>
            </p>
          </div>
          <UButton to="/admin/audit" size="xs" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right">审计</UButton>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-lg bg-zinc-50 px-3 py-2">
            <p class="text-[11px] text-zinc-500">活跃访客</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950">{{ securityLast24h.visitorsActive ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-zinc-50 px-3 py-2">
            <p class="text-[11px] text-zinc-500">新访客</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950">{{ securityLast24h.visitorsNew ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-zinc-50 px-3 py-2">
            <p class="text-[11px] text-zinc-500">访客事件</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950">{{ securityLast24h.visitorEvents ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-zinc-50 px-3 py-2">
            <p class="text-[11px] text-zinc-500">聊天消息</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950">{{ securityLast24h.messages ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-red-50/60 px-3 py-2">
            <p class="text-[11px] text-red-700">新建封禁</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950">{{ securityLast24h.bansCreated ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-amber-50/60 px-3 py-2">
            <p class="text-[11px] text-amber-800">新建禁言</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950">{{ securityLast24h.mutesCreated ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-indigo-50/50 px-3 py-2">
            <p class="text-[11px] text-indigo-700">审计事件</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950">{{ securityLast24h.auditEvents ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-emerald-50/50 px-3 py-2">
            <p class="text-[11px] text-emerald-700">管理员登录</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950">{{ securityLast24h.adminLogins ?? '—' }}</p>
          </div>
        </div>
        <p class="mt-3 text-[11px] text-zinc-500">
          总量：账号 {{ securitySnapshot.totalUsers ?? '—' }} · 访客 {{ securitySnapshot.totalVisitors ?? '—' }} · 消息 {{ securitySnapshot.totalMessages ?? '—' }}
          （已删 {{ securitySnapshot.deletedMessages ?? '—' }}）
        </p>
      </div>

      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <h2 class="text-sm font-semibold text-zinc-950">生效禁言</h2>
        <p class="mt-0.5 text-[11px] text-zinc-500">来自安全快照 · 最多 6 条</p>
        <ul class="mt-3 max-h-56 space-y-2 overflow-y-auto">
          <li
            v-for="mute in securityRecentMutes"
            :key="mute.id"
            class="rounded-lg border border-zinc-100 px-2.5 py-2 text-xs"
          >
            <p class="font-medium text-zinc-900">
              {{ mute.displayName || mute.username || shortAdminId(mute.userId) }}
            </p>
            <p class="mt-0.5 text-zinc-500">
              {{ mute.roomTitle || '全站' }} · {{ formatAdminRelativeTime(mute.createdAt) }}
            </p>
            <p class="mt-1 line-clamp-2 text-amber-800">原因：{{ mute.reason || '—' }}</p>
          </li>
          <li v-if="!securityRecentMutes.length" class="py-6 text-center text-zinc-400">暂无生效禁言</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <h2 class="text-sm font-semibold text-zinc-950">热门路径 · 近 7 天</h2>
        <ul class="mt-3 space-y-1.5">
          <li
            v-for="row in securityTopPaths"
            :key="row.path"
            class="flex items-center justify-between gap-2 text-xs"
          >
            <span class="truncate text-zinc-700">{{ row.path || '/' }}</span>
            <span class="shrink-0 tabular-nums text-zinc-500">{{ row.count }}</span>
          </li>
          <li v-if="!securityTopPaths.length" class="py-4 text-center text-zinc-400">暂无数据</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <h2 class="text-sm font-semibold text-zinc-950">访客城市 TOP</h2>
        <ul class="mt-3 space-y-1.5">
          <li
            v-for="row in securityTopCities"
            :key="row.city"
            class="flex items-center justify-between gap-2 text-xs"
          >
            <span class="truncate text-zinc-700">{{ row.city }}</span>
            <span class="shrink-0 tabular-nums text-zinc-500">{{ row.count }}</span>
          </li>
          <li v-if="!securityTopCities.length" class="py-4 text-center text-zinc-400">暂无数据</li>
        </ul>
      </div>
    </section>

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
              class="size-4 text-zinc-300 transition group-hover:text-zinc-500"
            />
          </div>
          <p class="mt-3 text-2xl font-semibold tabular-nums text-zinc-950">
            <USkeleton
              v-if="loading && counts[module.key] == null"
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
                {{ auditActionLabel(item) }}
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

      <section class="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950">
              生效封禁
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500">
              安全与审计
            </p>
          </div>
          <UButton
            to="/admin/bans"
            icon="i-lucide-arrow-right"
            trailing
            label="全部"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </div>
        <div
          v-if="recentBans.length"
          class="divide-y divide-zinc-100"
        >
          <NuxtLink
            v-for="item in recentBans"
            :key="adminDashboardRecordValue(item, 'id', '_id')"
            :to="'/admin/bans?banId=' + encodeURIComponent(String(adminDashboardRecordValue(item, 'id', '_id')))"
            class="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50"
          >
            <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-red-50 text-red-700">
              <UIcon
                name="i-lucide-shield-ban"
                class="size-4"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900">
                {{ banScopeLabel(item) }} · {{ adminDashboardRecordValue(item, 'value') }}
              </p>
              <p class="mt-1 line-clamp-1 text-xs text-zinc-500">
                {{ adminDashboardRecordValue(item, 'reason') }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-zinc-400">{{ formatAdminDashboardDate(item) }}</span>
          </NuxtLink>
        </div>
        <p
          v-else
          class="px-4 py-10 text-center text-sm text-zinc-500"
        >
          暂无生效封禁
        </p>
      </section>

      <section class="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div class="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950">
              最近访客
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500">
              安全与审计
            </p>
          </div>
          <UButton
            to="/admin/visitors"
            icon="i-lucide-arrow-right"
            trailing
            label="全部"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </div>
        <div
          v-if="recentVisitors.length"
          class="divide-y divide-zinc-100"
        >
          <NuxtLink
            v-for="item in recentVisitors"
            :key="adminDashboardRecordValue(item, 'id', '_id')"
            :to="'/admin/visitors?visitorId=' + encodeURIComponent(String(adminDashboardRecordValue(item, 'id', '_id')))"
            class="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50"
          >
            <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-700">
              <UIcon
                name="i-lucide-radar"
                class="size-4"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900">
                {{ adminDashboardRecordValue(item, 'lastIp', 'id') }}
              </p>
              <p class="mt-1 truncate text-xs text-zinc-500">
                {{ adminDashboardRecordValue(item, 'locationLabel', 'lastCity', 'lastPath') }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-zinc-400">
              {{ formatAdminDashboardDate({ createdAt: item.lastSeenAt } as AdminDashboardRecord) }}
            </span>
          </NuxtLink>
        </div>
        <p
          v-else
          class="px-4 py-10 text-center text-sm text-zinc-500"
        >
          暂无访客数据
        </p>
      </section>
    </div>
  </div>
</template>
