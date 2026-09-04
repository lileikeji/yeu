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
  adminAnomalyStatusLabels,
  adminOpsTimelineKindLabels,
  adminResponseQueueKindLabels,
  adminRiskFactorLabels,
  adminRiskLevelLabels,
  adminVisitorActionLabels,
  adminPathLabel,
  adminPathTransitionLabel,
  adminRiskScoreText,
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
const securityTopActions = ref<Array<{ action: string; count: number }>>([])
const securityTopIps = ref<Array<{ ip: string; count: number }>>([])
const securityTopBanReasons = ref<Array<{ reason: string; count: number }>>([])
const securityHourlyEvents = ref<Array<{ hour: string; count: number }>>([])
const securityRiskHints = ref<Array<{ level: string; code: string; message: string; href: string }>>([])
const securitySnapshotBans = ref<Array<{
  id: string
  scope: string
  value: string
  reason: string
  createdAt: string
}>>([])
const securityGeneratedAt = ref('')
const securityPrevious24h = reactive({
  visitorsActive: null as number | null,
  visitorsNew: null as number | null,
  visitorEvents: null as number | null,
  bansCreated: null as number | null,
  mutesCreated: null as number | null,
  messages: null as number | null,
  auditEvents: null as number | null,
  adminLogins: null as number | null
})
const securityDeltas24h = reactive({
  visitorsActive: null as number | null,
  visitorsNew: null as number | null,
  visitorEvents: null as number | null,
  bansCreated: null as number | null,
  mutesCreated: null as number | null,
  messages: null as number | null,
  auditEvents: null as number | null,
  adminLogins: null as number | null
})
const securityBanHygiene = reactive({
  activeExpired: null as number | null,
  expiringSoon24h: null as number | null,
  permanentActive: null as number | null,
  temporaryActive: null as number | null
})
const securityPulse = reactive({
  events1h: null as number | null,
  multiVisitorIps: null as number | null,
  staleActiveBans: null as number | null
})
const securityIpClusters = ref<Array<{ ip: string; eventCount: number; visitorCount: number; city?: string; topPath?: string; linkedUsers?: number; isBanned?: boolean; riskScore?: number; riskLevel?: string }>>([])
const securitySuspiciousAgents = ref<Array<{ userAgent: string; eventCount: number; visitorCount: number }>>([])
const securityAdminActors = ref<Array<{ adminId: string; username: string | null; displayName: string | null; actions: number }>>([])
const securityOpsTimeline = ref<Array<{
  id: string
  kind: string
  title: string
  subtitle: string
  createdAt: string
  href: string
}>>([])
const securityResponseQueue = ref<Array<{
  id: string
  kind: string
  priority: string
  title: string
  detail: string
  href: string
  score: number
}>>([])
const securityPathTransitions = ref<Array<{ from: string; to: string; transition: string; count: number }>>([])
const securityBurstWindows = ref<Array<{ startAt: string; endAt: string; count: number }>>([])
const securityBanCoverage = reactive({
  topIpCount: null as number | null,
  bannedTopIps: null as number | null,
  coverageRate: null as number | null,
  activeExpired: null as number | null,
  expiringSoon24h: null as number | null
})
const securityWindows = reactive({
  h1Events: null as number | null,
  peakBurst10m: null as number | null,
  d7Visitors: null as number | null,
  d7Events: null as number | null,
  d7Bans: null as number | null
})
const securityGeoConcentration = reactive({
  topCity: '' as string,
  topCityShare: null as number | null,
  distinctCities: null as number | null
})
const securityRecentSessions = ref<Array<{
  id: string
  startAt: string
  endAt: string
  durationSeconds: number
  eventCount: number
  uniquePathCount: number
  entryPath: string
  exitPath: string
}>>([])
const securityNetworkClusters = ref<Array<{
  prefix: string
  eventCount: number
  ipCount: number
  visitorCount: number
  userCount: number
  topCity: string
  topPath: string
  riskScore: number
  riskLevel: string
}>>([])
const securityAnomalyBaseline = reactive({
  current: null as number | null,
  average: null as number | null,
  median: null as number | null,
  p95: null as number | null,
  zScore: null as number | null,
  multiplier: null as number | null,
  sampleSize: null as number | null,
  status: '' as string
})
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
  return adminLabel(adminAuditActionLabels, raw === '—' ? '' : raw, '其他操作')
}

function banScopeLabel(record: AdminDashboardRecord): string {
  const raw = adminDashboardRecordValue(record, 'scope')
  return adminLabel(adminBanScopeLabels, raw === '—' ? '' : raw, raw)
}

function visitorActionLabel(action: string | null | undefined): string {
  return adminLabel(adminVisitorActionLabels, action, action || '未知')
}

function riskLevelLabel(level: string | null | undefined): string {
  return adminLabel(adminRiskLevelLabels, level, level || '提示')
}

function formatSecurityDelta(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const n = Number(value)
  if (n > 0) return '+' + n
  return String(n)
}

function securityDeltaClass(value: number | null | undefined): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return 'text-zinc-500 dark:text-zinc-400'
  return n > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
}

function anomalyComparisonText(): string {
  const current = Number(securityAnomalyBaseline.current)
  const average = Number(securityAnomalyBaseline.average)
  if (!Number.isFinite(current) || !Number.isFinite(average) || average <= 0) return '暂无足够的历史数据'
  const percent = Math.round(Math.abs((current - average) / average) * 100)
  if (percent < 5) return '与平时基本一致'
  return current > average ? `比平时高约 ${percent}%` : `比平时低约 ${percent}%`
}

function shortUaDash(ua: string | null | undefined): string {
  const t = (ua || '').trim()
  if (!t) return '未知设备或浏览器'
  return t.length > 64 ? t.slice(0, 64) + '…' : t
}

const securityHourlyMax = computed(() =>
  Math.max(1, ...securityHourlyEvents.value.map(row => Number(row.count) || 0))
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

  requests.push((async () => {
    const response = await adminFetch<unknown>('/api/admin/visitors/bans', {
      query: { page: 1, pageSize: 5, active: 'true' }
    })
    return { key: 'recent-bans', ...normalizeAdminDashboardResponse(response) }
  })())

  requests.push((async () => {
    const response = await adminFetch<unknown>('/api/admin/visitors', {
      // The overview only needs a recent-visitor sample. The 14-day visitor
      // chart belongs to the dedicated visitor page and is loaded there.
      query: { page: 1, pageSize: 5, analytics: 'false' }
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
      topActions?: Array<{ action: string; count: number }>
      topIps?: Array<{ ip: string; count: number }>
      topBanReasons?: Array<{ reason: string; count: number }>
      hourlyEvents?: Array<{ hour: string; count: number }>
      riskHints?: Array<{ level: string; code: string; message: string; href: string }>
      previous24h?: Record<string, number>
      deltas24h?: Record<string, number>
      banHygiene?: Record<string, number>
      pulse?: Record<string, number>
      ipClusters?: Array<{ ip: string; eventCount: number; visitorCount: number }>
      suspiciousAgents?: Array<{ userAgent: string; eventCount: number; visitorCount: number }>
      adminActors?: Array<{ adminId: string; username: string | null; displayName: string | null; actions: number }>
      opsTimeline?: Array<{ id: string; kind: string; title: string; subtitle: string; createdAt: string; href: string }>
      recentBans?: Array<{ id: string; scope: string; value: string; reason: string; createdAt: string }>
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
      const prev = snap.previous24h || {}
      securityPrevious24h.visitorsActive = Number(prev.visitorsActive ?? 0)
      securityPrevious24h.visitorsNew = Number(prev.visitorsNew ?? 0)
      securityPrevious24h.visitorEvents = Number(prev.visitorEvents ?? 0)
      securityPrevious24h.bansCreated = Number(prev.bansCreated ?? 0)
      securityPrevious24h.mutesCreated = Number(prev.mutesCreated ?? 0)
      securityPrevious24h.messages = Number(prev.messages ?? 0)
      securityPrevious24h.auditEvents = Number(prev.auditEvents ?? 0)
      securityPrevious24h.adminLogins = Number(prev.adminLogins ?? 0)
      const dlt = snap.deltas24h || {}
      securityDeltas24h.visitorsActive = Number(dlt.visitorsActive ?? 0)
      securityDeltas24h.visitorsNew = Number(dlt.visitorsNew ?? 0)
      securityDeltas24h.visitorEvents = Number(dlt.visitorEvents ?? 0)
      securityDeltas24h.bansCreated = Number(dlt.bansCreated ?? 0)
      securityDeltas24h.mutesCreated = Number(dlt.mutesCreated ?? 0)
      securityDeltas24h.messages = Number(dlt.messages ?? 0)
      securityDeltas24h.auditEvents = Number(dlt.auditEvents ?? 0)
      securityDeltas24h.adminLogins = Number(dlt.adminLogins ?? 0)
      const hy = snap.banHygiene || {}
      securityBanHygiene.activeExpired = Number(hy.activeExpired ?? 0)
      securityBanHygiene.expiringSoon24h = Number(hy.expiringSoon24h ?? 0)
      securityBanHygiene.permanentActive = Number(hy.permanentActive ?? 0)
      securityBanHygiene.temporaryActive = Number(hy.temporaryActive ?? 0)
      const pulse = snap.pulse || {}
      securityPulse.events1h = Number(pulse.events1h ?? 0)
      securityPulse.multiVisitorIps = Number(pulse.multiVisitorIps ?? 0)
      securityPulse.staleActiveBans = Number(pulse.staleActiveBans ?? 0)
      securityIpClusters.value = Array.isArray(snap.ipClusters) ? snap.ipClusters : []
      securitySuspiciousAgents.value = Array.isArray(snap.suspiciousAgents) ? snap.suspiciousAgents : []
      securityAdminActors.value = Array.isArray(snap.adminActors)
        ? snap.adminActors.map((row: any) => ({
          adminId: row.adminId,
          username: row.username ?? null,
          displayName: row.displayName ?? null,
          actions: Number(row.actions ?? row.auditCount ?? 0)
        }))
        : []
      securityOpsTimeline.value = Array.isArray(snap.opsTimeline) ? snap.opsTimeline : []
      securityResponseQueue.value = Array.isArray(snap.responseQueue) ? snap.responseQueue : []
      securityPathTransitions.value = Array.isArray(snap.pathTransitions) ? snap.pathTransitions : []
      securityBurstWindows.value = Array.isArray(snap.burstWindows) ? snap.burstWindows : []
      const cov = snap.banCoverage || {}
      securityBanCoverage.topIpCount = Number(cov.topIpCount ?? 0)
      securityBanCoverage.bannedTopIps = Number(cov.bannedTopIps ?? 0)
      securityBanCoverage.coverageRate = Number(cov.coverageRate ?? 0)
      securityBanCoverage.activeExpired = Number(cov.activeExpired ?? 0)
      securityBanCoverage.expiringSoon24h = Number(cov.expiringSoon24h ?? 0)
      const win = snap.windows || {}
      securityWindows.h1Events = Number(win.h1?.visitorEvents ?? 0)
      securityWindows.peakBurst10m = Number(win.h1?.peakBurst10m ?? 0)
      securityWindows.d7Visitors = Number(win.d7?.visitorsActive ?? 0)
      securityWindows.d7Events = Number(win.d7?.visitorEvents ?? 0)
      securityWindows.d7Bans = Number(win.d7?.bansCreated ?? 0)
      const geo = snap.geoConcentration || {}
      securityGeoConcentration.topCity = geo.topCity || ''
      securityGeoConcentration.topCityShare = Number(geo.topCityShare ?? 0)
      securityGeoConcentration.distinctCities = Number(geo.distinctCities ?? 0)
      securityRecentSessions.value = Array.isArray(snap.recentSessions) ? snap.recentSessions : []
      securityNetworkClusters.value = Array.isArray(snap.networkClusters) ? snap.networkClusters : []
      const baseline = snap.anomalyBaseline || {}
      securityAnomalyBaseline.current = Number(baseline.current ?? 0)
      securityAnomalyBaseline.average = Number(baseline.average ?? 0)
      securityAnomalyBaseline.median = Number(baseline.median ?? 0)
      securityAnomalyBaseline.p95 = Number(baseline.p95 ?? 0)
      securityAnomalyBaseline.zScore = Number(baseline.zScore ?? 0)
      securityAnomalyBaseline.multiplier = Number(baseline.multiplier ?? 0)
      securityAnomalyBaseline.sampleSize = Number(baseline.sampleSize ?? 0)
      securityAnomalyBaseline.status = baseline.status || 'normal'
      securityTopPaths.value = Array.isArray(snap.topPaths) ? snap.topPaths : []
      securityTopCities.value = Array.isArray(snap.topCities) ? snap.topCities : []
      securityTopActions.value = Array.isArray(snap.topActions) ? snap.topActions : []
      securityTopIps.value = Array.isArray(snap.topIps) ? snap.topIps : []
      securityTopBanReasons.value = Array.isArray(snap.topBanReasons) ? snap.topBanReasons : []
      securityHourlyEvents.value = Array.isArray(snap.hourlyEvents) ? snap.hourlyEvents : []
      securityRiskHints.value = Array.isArray(snap.riskHints) ? snap.riskHints : []
      securitySnapshotBans.value = Array.isArray(snap.recentBans) ? snap.recentBans : []
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
      description="集中查看内容、用户互动、访客和安全情况。"
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
      class="mt-4 flex items-center gap-2 border-l-2 border-orange-500 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 px-3 py-2 text-sm text-orange-800 dark:text-orange-300"
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
        class="rounded-md border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/50 p-4 transition hover:border-red-300 dark:hover:border-red-800"
      >
        <p class="text-xs font-medium text-red-700 dark:text-red-300">生效封禁</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">
          <USkeleton v-if="loading && securitySnapshot.activeBans == null" class="h-7 w-12" />
          <template v-else>{{ securitySnapshot.activeBans ?? '—' }}</template>
        </p>
        <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">IP / 访客 / 账号</p>
      </NuxtLink>
      <NuxtLink
        to="/admin/visitors?banned=true"
        class="rounded-md border border-rose-200 bg-rose-50/40 dark:bg-rose-950/40 p-4 transition hover:border-rose-300 dark:hover:border-rose-800"
      >
        <p class="text-xs font-medium text-rose-700 dark:text-rose-300">命中封禁访客</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">
          <USkeleton v-if="loading && securitySnapshot.bannedVisitors == null" class="h-7 w-12" />
          <template v-else>{{ securitySnapshot.bannedVisitors ?? '—' }}</template>
        </p>
        <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">当前列表命中封禁策略</p>
      </NuxtLink>
      <NuxtLink
        to="/admin/chat"
        class="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/40 p-4 transition hover:border-amber-300"
      >
        <p class="text-xs font-medium text-amber-800 dark:text-amber-300">个人禁言</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">
          <USkeleton v-if="loading && securitySnapshot.activeMutes == null" class="h-7 w-12" />
          <template v-else>{{ securitySnapshot.activeMutes ?? '—' }}</template>
        </p>
        <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">生效中的用户禁言</p>
      </NuxtLink>
      <NuxtLink
        to="/admin/chat"
        class="rounded-md border border-orange-200 bg-orange-50/40 dark:bg-orange-950/40 p-4 transition hover:border-orange-300"
      >
        <p class="text-xs font-medium text-orange-800 dark:text-orange-300">全员禁言房间</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">
          <USkeleton v-if="loading && securitySnapshot.mutedRooms == null" class="h-7 w-12" />
          <template v-else>{{ securitySnapshot.mutedRooms ?? '—' }}</template>
        </p>
        <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">已开启全员禁言</p>
      </NuxtLink>
    </section>
    <section
      v-if="securityRiskHints.length"
      class="mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
      aria-label="风险提示"
    >
      <div class="flex items-center justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">风险提示</h2>
          <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">需要管理员留意的异常情况</p>
        </div>
        <UButton to="/admin/audit" size="xs" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right">
          操作记录
        </UButton>
      </div>
      <ul class="mt-3 grid gap-2 sm:grid-cols-2">
        <li
          v-for="hint in securityRiskHints"
          :key="hint.code"
        >
          <NuxtLink
            :to="hint.href"
            class="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            :class="hint.level === 'high'
              ? 'border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/50'
              : hint.level === 'medium'
                ? 'border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/40'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50'"
          >
            <span
              class="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              :class="hint.level === 'high'
                ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300'
                : hint.level === 'medium'
                  ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-300'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'"
            >
              {{ riskLevelLabel(hint.level) }}
            </span>
            <span class="min-w-0 leading-5 text-zinc-800 dark:text-zinc-100">{{ hint.message }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section
      v-if="securityResponseQueue.length"
      class="mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
      aria-label="待处理事项"
    >
      <div class="flex items-center justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">待处理事项</h2>
          <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">按紧急程度汇总需要检查的访问与封禁情况</p>
        </div>
        <UButton to="/admin/visitors" size="xs" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right">
          访客
        </UButton>
      </div>
      <ul class="mt-3 grid gap-2 lg:grid-cols-2">
        <li
          v-for="item in securityResponseQueue"
          :key="item.id"
        >
          <NuxtLink
            :to="item.href"
            class="block rounded-lg border px-3 py-2 text-xs transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            :class="item.priority === 'high'
              ? 'border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/40'
              : item.priority === 'medium'
                ? 'border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/30'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-800/40'"
          >
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="rounded-full bg-white dark:bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:text-zinc-200 ring-1 ring-zinc-200 dark:ring-zinc-700">
                {{ adminLabel(adminResponseQueueKindLabels, item.kind, item.kind) }}
              </span>
              <span
                class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                :class="item.priority === 'high'
                  ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300'
                  : item.priority === 'medium'
                    ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-300'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'"
              >
                {{ riskLevelLabel(item.priority) }}
              </span>
              <span class="tabular-nums text-zinc-500 dark:text-zinc-400">{{ adminRiskScoreText(item.score) }}</span>
            </div>
            <p class="mt-1 font-medium text-zinc-900 dark:text-zinc-100">{{ item.title }}</p>
            <p class="mt-0.5 line-clamp-2 text-zinc-500 dark:text-zinc-400">{{ item.detail }}</p>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section class="mt-4 grid gap-3 lg:grid-cols-3" aria-label="近期情况与封禁覆盖">
      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">近期变化</h2>
        <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">1 小时、今天与近 7 天</p>
        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">近 1 小时访问</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ securityWindows.h1Events ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-amber-50/60 dark:bg-amber-950/60 px-3 py-2">
            <p class="text-[11px] text-amber-800 dark:text-amber-300">10 分钟峰值</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ securityWindows.peakBurst10m ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">近 7 天活跃访客</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ securityWindows.d7Visitors ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">近 7 天访问 / 封禁</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ securityWindows.d7Events ?? '—' }} / {{ securityWindows.d7Bans ?? '—' }}</p>
          </div>
        </div>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">封禁覆盖</h2>
        <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">高频 IP 是否已封禁</p>
        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div class="rounded-lg bg-emerald-50/60 dark:bg-emerald-950/60 px-3 py-2">
            <p class="text-[11px] text-emerald-800 dark:text-emerald-300">封禁比例</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ securityBanCoverage.coverageRate ?? '—' }}%</p>
          </div>
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">已封 / 记录</p>
            <p class="mt-1 text-lg font-semibold tabular-nums">{{ securityBanCoverage.bannedTopIps ?? '—' }} / {{ securityBanCoverage.topIpCount ?? '—' }}</p>
          </div>
        </div>
        <p class="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          地理集中：{{ securityGeoConcentration.topCity || '—' }}
          <template v-if="securityGeoConcentration.topCityShare != null"> · {{ securityGeoConcentration.topCityShare }}%</template>
          <template v-if="securityGeoConcentration.distinctCities != null"> · {{ securityGeoConcentration.distinctCities }} 城</template>
        </p>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">访问高峰</h2>
        <ul
          class="mt-3 max-h-40 space-y-1.5 overflow-y-auto text-xs"
          tabindex="0"
          aria-label="访问高峰记录"
        >
          <li
            v-for="(row, idx) in securityBurstWindows"
            :key="'bw-' + idx"
            class="flex items-center justify-between gap-2"
          >
            <span class="truncate text-zinc-600 dark:text-zinc-300">{{ formatAdminRelativeTime(row.startAt) }}</span>
            <span class="shrink-0 tabular-nums font-medium text-amber-800 dark:text-amber-300">{{ row.count }}</span>
          </li>
          <li v-if="!securityBurstWindows.length" class="py-4 text-center text-zinc-400 dark:text-zinc-500">暂无明显高峰</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 lg:col-span-3">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">常见访问顺序 · 今天</h2>
        <ul class="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <li
            v-for="(row, idx) in securityPathTransitions"
            :key="'pt-' + idx"
            class="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-1.5"
          >
            <span class="truncate text-zinc-700 dark:text-zinc-200" :title="row.transition">{{ adminPathTransitionLabel(row.from, row.to) }}</span>
            <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
          </li>
          <li v-if="!securityPathTransitions.length" class="py-4 text-center text-zinc-400 dark:text-zinc-500 sm:col-span-2 lg:col-span-3">暂无连续访问记录</li>
        </ul>
      </div>
    </section>

    <details class="group mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
        <span>更多访问分析</span>
        <span class="flex items-center gap-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
          网络来源与访问过程
          <UIcon name="i-lucide-chevron-down" class="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
    <section class="grid gap-3 border-t border-zinc-100 dark:border-zinc-800 p-3 lg:grid-cols-3" aria-label="更多访问分析">
      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">今天与平时相比</h2>
            <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">参考最近 14 天访问量</p>
          </div>
          <span
            class="rounded-full px-2 py-0.5 text-[10px] font-medium"
            :class="securityAnomalyBaseline.status === 'critical'
              ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300'
              : securityAnomalyBaseline.status === 'elevated'
                ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-300'
                : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300'"
          >
            {{ adminLabel(adminAnomalyStatusLabels, securityAnomalyBaseline.status, '—') }}
          </span>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">今天 / 平均每天</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">
              {{ securityAnomalyBaseline.current ?? '—' }} / {{ securityAnomalyBaseline.average ?? '—' }}
            </p>
          </div>
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">变化幅度</p>
            <p class="mt-1 text-sm font-semibold text-zinc-950 dark:text-zinc-100">{{ anomalyComparisonText() }}</p>
          </div>
        </div>
        <p class="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          已参考 {{ securityAnomalyBaseline.sampleSize ?? '—' }} 天数据
        </p>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 lg:col-span-2">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">相近网络来源</h2>
        <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">帮助识别来自同一校园网、宿舍网或公共网络的访问</p>
        <ul class="mt-3 grid gap-2 sm:grid-cols-2">
          <li
            v-for="cluster in securityNetworkClusters"
            :key="cluster.prefix"
            class="rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/60 px-3 py-2 text-xs"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate font-medium text-zinc-900 dark:text-zinc-100">{{ cluster.prefix }}</span>
              <span
                class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]"
                :class="cluster.riskLevel === 'high'
                  ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300'
                  : cluster.riskLevel === 'medium'
                    ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-300'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'"
              >
                {{ riskLevelLabel(cluster.riskLevel) }} · {{ adminRiskScoreText(cluster.riskScore) }}
              </span>
            </div>
            <p class="mt-1 text-zinc-600 dark:text-zinc-300">
              {{ cluster.ipCount }} IP · {{ cluster.visitorCount }} 访客 · {{ cluster.userCount }} 账号 · {{ cluster.eventCount }} 次操作
            </p>
            <p class="mt-0.5 truncate text-zinc-400 dark:text-zinc-500" :title="cluster.topPath">{{ cluster.topCity || '未知地点' }} · {{ adminPathLabel(cluster.topPath) }}</p>
          </li>
          <li v-if="!securityNetworkClusters.length" class="py-6 text-center text-xs text-zinc-400 dark:text-zinc-500 sm:col-span-2">暂无相近网络来源</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 lg:col-span-3">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">最近访问过程</h2>
        <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">连续 30 分钟无操作后视为一次新的访问</p>
        <ul class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <li
            v-for="session in securityRecentSessions.slice(0, 8)"
            :key="session.id"
            class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-xs"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-zinc-500 dark:text-zinc-400">{{ formatAdminRelativeTime(session.startAt) }}</span>
              <span class="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{{ session.eventCount }} 次操作</span>
            </div>
            <p class="mt-1 truncate text-zinc-700 dark:text-zinc-200" :title="`${session.entryPath} → ${session.exitPath}`">{{ adminPathTransitionLabel(session.entryPath, session.exitPath) }}</p>
            <p class="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">{{ session.uniquePathCount }} 个页面 · {{ session.durationSeconds }} 秒</p>
          </li>
          <li v-if="!securityRecentSessions.length" class="py-6 text-center text-xs text-zinc-400 dark:text-zinc-500 sm:col-span-2 lg:col-span-4">暂无访问过程</li>
        </ul>
      </div>
    </section>
    </details>

    <details class="group mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
        <span>更多安全数据</span>
        <span class="flex items-center gap-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
          访问趋势、封禁与管理记录
          <UIcon name="i-lucide-chevron-down" class="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
    <section class="grid gap-3 border-t border-zinc-100 dark:border-zinc-800 p-3 lg:grid-cols-3" aria-label="更多安全数据">
      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 lg:col-span-2">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">今天的动态</h2>
            <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              访客活跃、封禁禁言与管理员操作
              <template v-if="securityGeneratedAt"> · 更新 {{ formatAdminRelativeTime(securityGeneratedAt) }}</template>
            </p>
          </div>
          <UButton to="/admin/audit" size="xs" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right">操作记录</UButton>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">活跃访客</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityLast24h.visitorsActive ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">新访客</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityLast24h.visitorsNew ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">访客操作</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityLast24h.visitorEvents ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">聊天消息</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityLast24h.messages ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-red-50/60 dark:bg-red-950/60 px-3 py-2">
            <p class="text-[11px] text-red-700 dark:text-red-300">新建封禁</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityLast24h.bansCreated ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-amber-50/60 dark:bg-amber-950/60 px-3 py-2">
            <p class="text-[11px] text-amber-800 dark:text-amber-300">新建禁言</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityLast24h.mutesCreated ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-indigo-50/50 px-3 py-2">
            <p class="text-[11px] text-indigo-700">操作记录</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityLast24h.auditEvents ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-emerald-50/50 dark:bg-emerald-950/50 px-3 py-2">
            <p class="text-[11px] text-emerald-700 dark:text-emerald-300">管理员登录</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityLast24h.adminLogins ?? '—' }}</p>
          </div>
        </div>
        <p class="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          总量：账号 {{ securitySnapshot.totalUsers ?? '—' }} · 访客 {{ securitySnapshot.totalVisitors ?? '—' }} · 消息 {{ securitySnapshot.totalMessages ?? '—' }}
          （已删 {{ securitySnapshot.deletedMessages ?? '—' }}）
        </p>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">生效禁言</h2>
        <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">根据近期安全情况整理 · 最多 6 条</p>
        <ul class="mt-3 max-h-56 space-y-2 overflow-y-auto">
          <li
            v-for="mute in securityRecentMutes"
            :key="mute.id"
            class="rounded-lg border border-zinc-100 dark:border-zinc-800 px-2.5 py-2 text-xs"
          >
            <p class="font-medium text-zinc-900 dark:text-zinc-100">
              {{ mute.displayName || mute.username || shortAdminId(mute.userId) }}
            </p>
            <p class="mt-0.5 text-zinc-500 dark:text-zinc-400">
              {{ mute.roomTitle || '全站' }} · {{ formatAdminRelativeTime(mute.createdAt) }}
            </p>
            <p class="mt-1 line-clamp-2 text-amber-800 dark:text-amber-300">原因：{{ mute.reason || '—' }}</p>
          </li>
          <li v-if="!securityRecentMutes.length" class="py-6 text-center text-zinc-400 dark:text-zinc-500">暂无生效禁言</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">常见访问页面 · 近 7 天</h2>
        <ul class="mt-3 space-y-1.5">
          <li
            v-for="row in securityTopPaths"
            :key="row.path"
            class="flex items-center justify-between gap-2 text-xs"
          >
            <span class="truncate text-zinc-700 dark:text-zinc-200" :title="row.path">{{ adminPathLabel(row.path) }}</span>
            <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
          </li>
          <li v-if="!securityTopPaths.length" class="py-4 text-center text-zinc-400 dark:text-zinc-500">暂无数据</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">访客主要城市</h2>
        <ul class="mt-3 space-y-1.5">
          <li
            v-for="row in securityTopCities"
            :key="row.city"
            class="flex items-center justify-between gap-2 text-xs"
          >
            <span class="truncate text-zinc-700 dark:text-zinc-200">{{ row.city }}</span>
            <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
          </li>
          <li v-if="!securityTopCities.length" class="py-4 text-center text-zinc-400 dark:text-zinc-500">暂无数据</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">常见操作 · 近 7 天</h2>
        <ul class="mt-3 space-y-1.5">
          <li
            v-for="row in securityTopActions"
            :key="row.action"
            class="flex items-center justify-between gap-2 text-xs"
          >
            <span class="truncate text-zinc-700 dark:text-zinc-200">{{ visitorActionLabel(row.action) }}</span>
            <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
          </li>
          <li v-if="!securityTopActions.length" class="py-4 text-center text-zinc-400 dark:text-zinc-500">暂无数据</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">高频网络地址 · 今天</h2>
        <ul class="mt-3 space-y-1.5">
          <li
            v-for="row in securityTopIps"
            :key="row.ip"
            class="flex items-center justify-between gap-2 text-xs"
          >
            <NuxtLink
              :to="'/admin/visitors?ip=' + encodeURIComponent(row.ip)"
              class="truncate text-sky-700 dark:text-sky-300 hover:underline"
            >
              {{ row.ip }}
            </NuxtLink>
            <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
          </li>
          <li v-if="!securityTopIps.length" class="py-4 text-center text-zinc-400 dark:text-zinc-500">暂无数据</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">常见封禁原因</h2>
        <ul class="mt-3 space-y-1.5">
          <li
            v-for="row in securityTopBanReasons"
            :key="row.reason"
            class="flex items-start justify-between gap-2 text-xs"
          >
            <span class="line-clamp-2 text-zinc-700 dark:text-zinc-200">{{ row.reason }}</span>
            <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
          </li>
          <li v-if="!securityTopBanReasons.length" class="py-4 text-center text-zinc-400 dark:text-zinc-500">暂无生效原因</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 lg:col-span-2">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">24 小时操作趋势</h2>
            <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">按小时汇总访客操作</p>
          </div>
        </div>
        <div class="mt-3 flex h-24 items-end gap-0.5">
          <div
            v-for="(row, idx) in securityHourlyEvents"
            :key="row.hour + '-' + idx"
            class="group relative min-w-0 flex-1 rounded-t bg-sky-400/80 transition hover:bg-sky-500"
            :style="{ height: Math.max(4, Math.round((Number(row.count) / securityHourlyMax) * 100)) + '%' }"
            :title="formatAdminDateTime(row.hour) + ' · ' + row.count"
          />
        </div>
        <p v-if="!securityHourlyEvents.length" class="py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">暂无节奏数据</p>
      </div>


      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">封禁状态检查</h2>
        <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">过期未清理 / 即将到期 / 永久与临时</p>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-red-50/70 dark:bg-red-950/70 px-3 py-2">
            <p class="text-[11px] text-red-700 dark:text-red-300">过期仍生效</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityBanHygiene.activeExpired ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-amber-50/70 dark:bg-amber-950/70 px-3 py-2">
            <p class="text-[11px] text-amber-800 dark:text-amber-300">24h 内到期</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityBanHygiene.expiringSoon24h ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">永久生效</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityBanHygiene.permanentActive ?? '—' }}</p>
          </div>
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2">
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400">临时生效</p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">{{ securityBanHygiene.temporaryActive ?? '—' }}</p>
          </div>
        </div>
        <UButton to="/admin/bans?active=true" size="xs" color="neutral" variant="soft" class="mt-3" trailing-icon="i-lucide-arrow-right">
          清理封禁
        </UButton>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <div class="flex items-center justify-between gap-2">
          <div>
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">同一网络的多个访客 · 今天</h2>
            <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">同一 IP 关联多名访客</p>
          </div>
        </div>
        <ul class="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
          <li
            v-for="row in securityIpClusters"
            :key="'ipc-' + row.ip"
            class="flex items-center justify-between gap-2 text-xs"
          >
            <NuxtLink
              :to="'/admin/visitors?ip=' + encodeURIComponent(row.ip)"
              class="truncate text-sky-700 dark:text-sky-300 hover:underline"
            >
              {{ row.ip }}
            </NuxtLink>
            <span class="shrink-0 text-right text-zinc-500 dark:text-zinc-400">
              <span class="tabular-nums">访客 {{ row.visitorCount }} · {{ row.eventCount }} 次操作</span>
              <span v-if="row.city" class="block text-[10px] text-zinc-400 dark:text-zinc-500" :title="row.topPath">{{ row.city }} · {{ adminPathLabel(row.topPath) }}</span>
              <span v-if="row.riskLevel && row.riskLevel !== 'info'" class="block text-[10px]" :class="row.riskLevel === 'high' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'">
                {{ riskLevelLabel(row.riskLevel) }} · {{ adminRiskScoreText(row.riskScore) }}
                <template v-if="row.isBanned"> · 已封</template>
              </span>
            </span>
          </li>
          <li v-if="!securityIpClusters.length" class="py-4 text-center text-zinc-400 dark:text-zinc-500">暂无关联访客</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">异常设备与浏览器 · 今天</h2>
        <ul class="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
          <li
            v-for="(row, idx) in securitySuspiciousAgents"
            :key="'ua-' + idx"
            class="text-xs"
          >
            <p class="truncate text-zinc-800 dark:text-zinc-100" :title="row.userAgent">{{ shortUaDash(row.userAgent) }}</p>
            <p class="mt-0.5 text-zinc-500 dark:text-zinc-400">访客 {{ row.visitorCount }} · {{ row.eventCount }} 次操作</p>
          </li>
          <li v-if="!securitySuspiciousAgents.length" class="py-4 text-center text-zinc-400 dark:text-zinc-500">暂无异常设备或浏览器</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">管理员操作 · 今天</h2>
        <ul class="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
          <li
            v-for="row in securityAdminActors"
            :key="'actor-' + row.adminId"
            class="flex items-center justify-between gap-2 text-xs"
          >
            <span class="truncate text-zinc-800 dark:text-zinc-100">{{ row.displayName || row.username || shortAdminId(row.adminId) }}</span>
            <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.actions }} 次</span>
          </li>
          <li v-if="!securityAdminActors.length" class="py-4 text-center text-zinc-400 dark:text-zinc-500">暂无管理员动作</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 lg:col-span-2">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">最近管理记录</h2>
            <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">最近的封禁、禁言、管理员和登录操作</p>
          </div>
          <UButton to="/admin/audit" size="xs" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right">操作记录</UButton>
        </div>
        <ul class="mt-3 max-h-64 space-y-2 overflow-y-auto">
          <li
            v-for="item in securityOpsTimeline"
            :key="item.id"
          >
            <NuxtLink
              :to="item.href"
              class="block rounded-lg border border-zinc-100 dark:border-zinc-800 px-2.5 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-300">
                  {{ adminLabel(adminOpsTimelineKindLabels, item.kind, item.kind) }}
                </span>
                <span class="font-medium text-zinc-900 dark:text-zinc-100">{{ item.title }}</span>
                <span class="text-zinc-400 dark:text-zinc-500">{{ formatAdminRelativeTime(item.createdAt) }}</span>
              </div>
              <p class="mt-1 line-clamp-2 text-zinc-500 dark:text-zinc-400">{{ item.subtitle }}</p>
            </NuxtLink>
          </li>
          <li v-if="!securityOpsTimeline.length" class="py-6 text-center text-zinc-400 dark:text-zinc-500">暂无管理记录</li>
        </ul>
      </div>

      <div class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">最近生效封禁</h2>
        <ul class="mt-3 max-h-56 space-y-2 overflow-y-auto">
          <li
            v-for="ban in securitySnapshotBans"
            :key="ban.id"
          >
            <NuxtLink
              :to="'/admin/bans?banId=' + encodeURIComponent(ban.id)"
              class="block rounded-lg border border-zinc-100 dark:border-zinc-800 px-2.5 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              <p class="font-medium text-zinc-900 dark:text-zinc-100">
                {{ adminLabel(adminBanScopeLabels, ban.scope, ban.scope) }} · {{ ban.value }}
              </p>
              <p class="mt-0.5 line-clamp-2 text-zinc-500 dark:text-zinc-400">{{ ban.reason || '—' }}</p>
              <p class="mt-1 text-zinc-400 dark:text-zinc-500">{{ formatAdminRelativeTime(ban.createdAt) }}</p>
            </NuxtLink>
          </li>
          <li v-if="!securitySnapshotBans.length" class="py-6 text-center text-zinc-400 dark:text-zinc-500">暂无生效封禁</li>
        </ul>
      </div>

    </section>
    </details>

    <section
      v-for="group in moduleGroups"
      :key="group.key"
      class="mt-5"
      :aria-label="group.label"
    >
      <div class="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            {{ group.label }}
          </h2>
          <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {{ group.description }}
          </p>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <NuxtLink
          v-for="module in group.modules"
          :key="module.key"
          :to="module.to"
          class="group rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
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
              class="size-4 text-zinc-300 dark:text-zinc-600 transition group-hover:text-zinc-500"
            />
          </div>
          <p class="mt-3 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">
            <USkeleton
              v-if="loading && counts[module.key] == null"
              class="h-7 w-14"
            />
            <template v-else>
              {{ counts[module.key] ?? '—' }}
            </template>
          </p>
          <p class="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {{ module.label }}
          </p>
        </NuxtLink>
      </div>
    </section>

    <section class="mt-5 border-y border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <h2 class="shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
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
      <section class="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              待处理反馈
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
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
          class="divide-y divide-zinc-100 dark:divide-zinc-800"
        >
          <NuxtLink
            v-for="item in recentFeedback"
            :key="adminDashboardRecordValue(item, 'id', '_id')"
            to="/admin/feedback"
            class="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          >
            <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300">
              <UIcon
                name="i-lucide-message-square-warning"
                class="size-4"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {{ adminDashboardRecordValue(item, 'reasonType', 'targetType') }}
              </p>
              <p class="mt-1 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                {{ adminDashboardRecordValue(item, 'message') }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{{ formatAdminDashboardDate(item) }}</span>
          </NuxtLink>
        </div>
        <p
          v-else
          class="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          暂无待处理反馈
        </p>
      </section>

      <section class="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              最近操作
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              安全与操作记录
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
          class="divide-y divide-zinc-100 dark:divide-zinc-800"
        >
          <div
            v-for="item in recentAudit"
            :key="adminDashboardRecordValue(item, 'id', '_id')"
            class="flex items-start gap-3 px-4 py-3"
          >
            <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              <UIcon
                name="i-lucide-history"
                class="size-4"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {{ auditActionLabel(item) }}
              </p>
              <p class="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {{ adminDashboardRecordValue(item, 'entityTitle', 'entityType', 'target') }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{{ formatAdminDashboardDate(item) }}</span>
          </div>
        </div>
        <p
          v-else
          class="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          暂无操作记录
        </p>
      </section>

      <section class="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              生效封禁
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              安全与操作记录
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
          class="divide-y divide-zinc-100 dark:divide-zinc-800"
        >
          <NuxtLink
            v-for="item in recentBans"
            :key="adminDashboardRecordValue(item, 'id', '_id')"
            :to="'/admin/bans?banId=' + encodeURIComponent(String(adminDashboardRecordValue(item, 'id', '_id')))"
            class="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          >
            <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
              <UIcon
                name="i-lucide-shield-ban"
                class="size-4"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {{ banScopeLabel(item) }} · {{ adminDashboardRecordValue(item, 'value') }}
              </p>
              <p class="mt-1 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                {{ adminDashboardRecordValue(item, 'reason') }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{{ formatAdminDashboardDate(item) }}</span>
          </NuxtLink>
        </div>
        <p
          v-else
          class="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          暂无生效封禁
        </p>
      </section>

      <section class="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              最近访客
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              安全与操作记录
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
          class="divide-y divide-zinc-100 dark:divide-zinc-800"
        >
          <NuxtLink
            v-for="item in recentVisitors"
            :key="adminDashboardRecordValue(item, 'id', '_id')"
            :to="'/admin/visitors?visitorId=' + encodeURIComponent(String(adminDashboardRecordValue(item, 'id', '_id')))"
            class="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          >
            <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
              <UIcon
                name="i-lucide-radar"
                class="size-4"
              />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {{ adminDashboardRecordValue(item, 'lastIp', 'id') }}
              </p>
              <p class="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {{ adminDashboardRecordValue(item, 'locationLabel', 'lastCity', 'lastPath') }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
              {{ formatAdminDashboardDate({ createdAt: item.lastSeenAt } as AdminDashboardRecord) }}
            </span>
          </NuxtLink>
        </div>
        <p
          v-else
          class="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          暂无访客数据
        </p>
      </section>
    </div>
  </div>
</template>
