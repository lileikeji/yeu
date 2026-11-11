<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'
import { visitorBanReasonLabel } from '~~/shared/utils/visitor-ban-reason'
import {
  adminAuditHref,
  adminBanScopeLabels,
  adminHttpMethodLabels,
  adminLabel,
  adminEvidenceStrengthLabels,
  adminInvestigationStepLabels,
  adminPlaybookStatusLabels,
  adminRiskFactorLabels,
  adminConfidenceLabels,
  adminRiskLevelLabels,
  adminSuggestedActionLabels,
  adminVisitorActionLabels,
  adminPathLabel,
  adminPathTransitionLabel,
  adminRiskScoreText,
  banStatusMeta,
  confirmAdminAction,
  formatAdminDateTime,
  formatAdminRelativeTime,
  groupByAdminDay,
  prettyAdminDetails,
  shortAdminId
} from '~~/app/utils/admin-security-labels'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '访客轨迹', robots: 'noindex, nofollow' })

type VisitorRow = {
  id: string
  firstSeenAt: string
  lastSeenAt: string
  lastIp: string | null
  lastCountry: string | null
  lastRegion: string | null
  lastCity: string | null
  lastUserAgent: string | null
  lastPath: string | null
  eventCount: number
  userId: string | null
  isBanned?: boolean
  locationLabel: string
}

type VisitorAnalytics = {
  timeZone: string
  date: string
  today: {
    eventCount: number
    visitorCount: number
  }
  hourly: Array<{
    hour: string
    label: string
    eventCount: number
    visitorCount: number
  }>
  daily: Array<{
    date: string
    eventCount: number
    visitorCount: number
  }>
  moduleViews: Array<{
    moduleKey: string
    moduleName: string
    viewCount: number
    visitorCount: number
    lastViewedAt: string | null
  }>
}

type VisitorEvent = {
  id: string
  action: string
  path: string | null
  method?: string | null
  ip: string | null
  country?: string | null
  region?: string | null
  city?: string | null
  meta?: Record<string, unknown> | null
  createdAt: string
}

type BanRow = {
  id: string
  scope: string
  value: string
  reason: string
  isActive: boolean
  expiresAt: string | null
  createdAt: string
}

type VisitorSecurityDossier = {
  visitor: {
    id: string
    firstSeenAt: string
    lastSeenAt: string
    lastIp: string | null
    lastPath: string | null
    eventCount: number
    userId: string | null
    locationLabel: string
    lastUserAgent?: string | null
  }
  summary: {
    eventTotal: number
    events7d: number
    events24h?: number
    events1h?: number
    uniqueIps: number
    uniquePaths: number
    actionCounts: number
    relatedBanCount: number
    activeBanCount: number
    isBanned: boolean
    hasLinkedUser: boolean
    sameIpVisitorCount: number
    riskScore?: number
    riskLevel?: string
    evidenceEvents?: number
    confidence?: string
    peerPercentile?: number
  }
  riskScore?: number
  riskLevel?: string
  riskFactors?: Array<{ code: string; points: number; message: string }>
  confidence?: string
  evidenceEvents?: number
  peerComparison?: { events24h: number; percentile: number; sampleSize: number; peerMedian?: number }
  pathSequence?: Array<{ path: string; action: string; createdAt: string }>
  pathTransitions?: Array<{ from: string; to: string; transition: string; count: number }>
  burstWindows?: Array<{ startAt: string; endAt: string; count: number }>
  relationship?: Record<string, any>
  sessions?: Array<{ id: string; startAt: string; endAt: string; durationSeconds: number; eventCount: number; uniquePathCount: number; entryPath: string; exitPath: string }>
  evidenceLedger?: Array<{ code: string; kind: string; strength: string; weight: number; message: string }>
  playbook?: Array<{ step: number; code: string; status: string; title: string; detail: string; href: string }>
  investigationSummary?: Record<string, number>
  events1h?: number
  events24h?: number
  userAgentHistory?: Array<{ userAgent: string; count: number; lastAt?: string | null }>
  geoTrail?: Array<{ city: string; region?: string | null; country?: string | null; count: number; lastAt?: string | null }>
  hourlyPattern?: Array<{ hour: string; count: number }>
  suggestedActions?: Array<{
    kind: string
    label: string
    href: string
    reason: string
    priority: 'high' | 'medium' | 'low'
    scope?: 'visitor' | 'ip' | 'user'
    value?: string
  }>
  actionBreakdown: Array<{ action: string; count: number }>
  ipHistory: Array<{ ip: string; count: number; lastAt: string | null }>
  pathTop: Array<{ path: string; count: number }>
  relatedBans: Array<{
    id: string
    scope: string
    value: string
    reason: string
    isActive: boolean
    expiresAt: string | null
    createdAt: string
  }>
  linkedUser: { id: string; username: string; displayName: string; status?: string } | null
  sameIpVisitors: Array<{
    id: string
    lastSeenAt: string
    lastIp: string | null
    lastCity: string | null
    lastPath: string | null
    eventCount: number
    userId: string | null
  }>
  auditItems: Array<{
    id: string
    action: string
    entityType: string
    entityId: string | null
    createdAt: string
  }>
}

type IpSecurityDossier = {
  ip: string
  summary: {
    visitorCount: number
    uniqueVisitors24h?: number
    eventTotal: number
    events1h?: number
    events24h?: number
    events7d?: number
    linkedUserCount?: number
    relatedBanCount?: number
    activeBanCount?: number
    isBanned?: boolean
    riskScore?: number
    riskLevel?: string
    evidenceEvents?: number
    confidence?: string
    peerPercentile?: number
    firstEventAt?: string | null
    lastEventAt?: string | null
  }
  riskScore?: number
  riskLevel?: string
  riskFactors?: Array<{ code: string; points: number; message: string }>
  confidence?: string
  evidenceEvents?: number
  peerComparison?: { events24h: number; percentile: number; sampleSize: number }
  pathSequence?: Array<{ path: string; action: string; createdAt: string }>
  pathTransitions?: Array<{ from: string; to: string; transition: string; count: number }>
  burstWindows?: Array<{ startAt: string; endAt: string; count: number }>
  relationship?: Record<string, any>
  sessions?: Array<{ id: string; startAt: string; endAt: string; durationSeconds: number; eventCount: number; uniquePathCount: number; entryPath: string; exitPath: string }>
  networkProfile?: { prefix: string; eventCount: number; ipCount: number; visitorCount: number; userCount: number; topCity: string; topPath: string; riskScore: number; riskLevel: string }
  evidenceLedger?: Array<{ code: string; kind: string; strength: string; weight: number; message: string }>
  playbook?: Array<{ step: number; code: string; status: string; title: string; detail: string; href: string }>
  investigationSummary?: Record<string, number>
  firstEventAt?: string | null
  lastEventAt?: string | null
  suggestedActions?: Array<{
    kind: string
    label: string
    href: string
    reason: string
    priority: 'high' | 'medium' | 'low'
    scope?: 'visitor' | 'ip' | 'user'
    value?: string
  }>
  visitors?: Array<Record<string, any>>
  pathTop?: Array<{ path: string; count: number }>
  userAgentHistory?: Array<{ userAgent: string; count: number }>
  geoTrail?: Array<{ city: string; count: number }>
}

const toast = useToast()
const route = useRoute()
const loading = ref(false)
const banLoading = ref(false)
const eventsLoading = ref(false)
const creatingBan = ref(false)
const errorMessage = ref('')
const items = ref<VisitorRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const q = ref('')
const ip = ref('')
const banned = ref<'all' | 'true' | 'false'>('all')
const sortMode = ref<'last-seen' | 'first-seen' | 'event-count'>('last-seen')
const visitorAnalytics = ref<VisitorAnalytics | null>(null)

const selectedVisitor = ref<VisitorRow | null>(null)
const events = ref<VisitorEvent[]>([])
const eventTotal = ref(0)
const visitorDossier = ref<VisitorSecurityDossier | null>(null)
const dossierLoading = ref(false)
const ipDossier = ref<IpSecurityDossier | null>(null)
const ipDossierLoading = ref(false)
const bans = ref<BanRow[]>([])
const banScope = ref<'ip' | 'visitor' | 'user'>('ip')
const banValue = ref('')
const banReason = ref('')
const banExpiresAt = ref('')

const bannedCountOnPage = computed(() => items.value.filter(row => row.isBanned).length)
const activeBanCount = computed(() => bans.value.filter(row => banStatusMeta(row).tone === 'active').length)
const maxHourlyEvents = computed(() => Math.max(1, ...(visitorAnalytics.value?.hourly || []).map(row => row.eventCount)))
const maxDailyEvents = computed(() => Math.max(1, ...(visitorAnalytics.value?.daily || []).map(row => row.eventCount)))

function formatTime(iso: string | null | undefined): string {
  return formatAdminDateTime(iso)
}

function actionLabel(value: string | null | undefined): string {
  return adminLabel(adminVisitorActionLabels, value, value || '未知动作')
}

function methodLabel(value: string | null | undefined): string {
  return adminLabel(adminHttpMethodLabels, value, value || '')
}

const eventActionSummary = computed(() => {
  const map = new Map<string, number>()
  for (const ev of events.value) {
    const key = ev.action || 'unknown'
    map.set(key, (map.get(key) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([action, count]) => ({ action, count, label: actionLabel(action) }))
    .sort((a, b) => b.count - a.count)
})

function shortUa(ua: string | null | undefined): string {
  if (!ua) return '—'
  return ua.length > 72 ? `${ua.slice(0, 72)}…` : ua
}

function riskToneClass(level: string | null | undefined): string {
  if (level === 'high') return 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300'
  if (level === 'medium') return 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-300'
  if (level === 'low') return 'bg-sky-100 text-sky-900 dark:text-sky-300'
  return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
}

function activityLevel(percentile: number | null | undefined): string {
  const value = Number(percentile)
  if (!Number.isFinite(value)) return '暂无足够数据'
  if (value >= 90) return `高于约 ${value}% 的访客`
  if (value >= 60) return `高于约 ${value}% 的访客，活跃度偏高`
  return `高于约 ${value}% 的访客，活跃度正常`
}

function activeHourlyRows(rows: Array<{ hour: string; count: number }> | null | undefined) {
  return (rows || []).filter(row => Number(row.count) > 0).slice(0, 12)
}

function formatHourLabel(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

function applySuggestedAction(action: {
  kind: string
  label: string
  href: string
  reason: string
  priority: string
  scope?: 'visitor' | 'ip' | 'user'
  value?: string
}): void {
  if (action.scope && action.value) {
    banScope.value = action.scope
    banValue.value = action.value
    if (!banReason.value.trim()) {
      banReason.value = action.reason || action.label
    }
    toast.add({ title: '已预填封禁表单：' + action.label, color: 'primary' })
    return
  }
  if (action.kind === 'open_ip' && action.value) {
    ip.value = action.value
    page.value = 1
    void loadVisitors()
    return
  }
  if (action.href) {
    void navigateTo(action.href)
  }
}

async function loadIpDossier(targetIp: string): Promise<void> {
  const raw = (targetIp || '').trim()
  if (!raw) {
    ipDossier.value = null
    return
  }
  ipDossierLoading.value = true
  try {
    ipDossier.value = await adminFetch<IpSecurityDossier>(
      '/api/admin/security/ip/' + encodeURIComponent(raw)
    )
  } catch (error) {
    console.warn('ip security dossier failed', error)
    ipDossier.value = null
  } finally {
    ipDossierLoading.value = false
  }
}

function eventLocation(event: VisitorEvent): string {
  return [event.country, event.region, event.city].filter(Boolean).join(' · ') || '未知'
}

const eventGroups = computed(() => groupByAdminDay(events.value))

function prepBanFromEvent(event: VisitorEvent, scope: 'ip' | 'visitor' = 'ip'): void {
  if (!selectedVisitor.value) return
  if (scope === 'ip') {
    banScope.value = 'ip'
    banValue.value = event.ip || selectedVisitor.value.lastIp || ''
  } else {
    banScope.value = 'visitor'
    banValue.value = selectedVisitor.value.id
  }
  banReason.value = event.path ? `来自操作记录：${actionLabel(event.action)} · ${adminPathLabel(event.path)}` : ''
  banExpiresAt.value = ''
  if (typeof window !== 'undefined') {
    document.getElementById('visitor-ban-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

async function handleAuth(error: unknown): Promise<boolean> {
  if (!isAuthorizationError(error)) return false
  await navigateTo('/admin/login', { replace: true })
  return true
}

async function loadVisitors(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const payload = await adminFetch<{ items: VisitorRow[]; total: number; analytics?: VisitorAnalytics }>('/api/admin/visitors', {
      query: {
        page: page.value,
        pageSize,
        q: q.value.trim() || undefined,
        ip: ip.value.trim() || undefined,
        banned: banned.value === 'all' ? undefined : banned.value,
        sort: sortMode.value,
        analytics: 'true'
      }
    })
    items.value = payload.items || []
    total.value = payload.total || 0
    visitorAnalytics.value = payload.analytics || null
      if (ip.value.trim()) {
      void loadIpDossier(ip.value.trim())
    } else {
      ipDossier.value = null
    }
} catch (error) {
    if (await handleAuth(error)) return
    errorMessage.value = getRequestMessage(error, '访客列表加载失败')
  } finally {
    loading.value = false
  }
}

async function loadBans(): Promise<void> {
  banLoading.value = true
  try {
    const payload = await adminFetch<{ items: BanRow[] }>('/api/admin/visitors/bans', {
      query: { page: 1, pageSize: 30, active: 'true' }
    })
    bans.value = payload.items || []
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: '封禁列表加载失败', color: 'error' })
  } finally {
    banLoading.value = false
  }
}

async function openEvents(row: VisitorRow): Promise<void> {
  selectedVisitor.value = row
  eventsLoading.value = true
  dossierLoading.value = false
  visitorDossier.value = null
  try {
    const eventsPayload = await adminFetch<{ items: VisitorEvent[]; total: number }>(
      `/api/admin/visitors/${encodeURIComponent(row.id)}/events`,
      { query: { page: 1, pageSize: 60 } }
    )
    events.value = eventsPayload.items || []
    eventTotal.value = eventsPayload.total || events.value.length
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '操作记录加载失败'), color: 'error' })
  } finally {
    eventsLoading.value = false
  }

  // The timeline is the useful first response. The long risk analysis follows
  // without keeping the detail panel blank while aggregate queries complete.
  dossierLoading.value = true
  void adminFetch<VisitorSecurityDossier>(
    `/api/admin/visitors/${encodeURIComponent(row.id)}/security`
  ).then((payload) => {
    if (selectedVisitor.value?.id === row.id) visitorDossier.value = payload
  }).catch((error) => {
    console.warn('visitor security dossier failed', error)
  }).finally(() => {
    if (selectedVisitor.value?.id === row.id) dossierLoading.value = false
  })
}

function clearSelectedVisitor(): void {
  selectedVisitor.value = null
  visitorDossier.value = null
  events.value = []
  eventTotal.value = 0
}

function prepBan(row: VisitorRow, scope: 'ip' | 'visitor' | 'user'): void {
  banScope.value = scope
  if (scope === 'ip') banValue.value = row.lastIp || ''
  else if (scope === 'visitor') banValue.value = row.id
  else banValue.value = row.userId || ''
  banReason.value = ''
  banExpiresAt.value = ''
  if (typeof window !== 'undefined') {
    document.getElementById('visitor-ban-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

async function createBan(): Promise<void> {
  if (!banValue.value.trim()) {
    toast.add({ title: '请填写封禁值', color: 'warning' })
    return
  }
  if (!banReason.value.trim()) {
    toast.add({ title: '请填写封禁原因（必填）', color: 'warning' })
    return
  }
  if (!confirmAdminAction(`确认封禁 ${adminLabel(adminBanScopeLabels, banScope.value)} · ${banValue.value.trim()}？`)) return
  creatingBan.value = true
  try {
    await adminFetch('/api/admin/visitors/bans', {
      method: 'POST',
      body: {
        scope: banScope.value,
        value: banValue.value.trim(),
        reason: banReason.value.trim(),
        expiresAt: banExpiresAt.value.trim()
          ? new Date(banExpiresAt.value.trim()).toISOString()
          : null
      }
    })
    toast.add({ title: '已添加封禁', color: 'success' })
    banReason.value = ''
    banExpiresAt.value = ''
    await Promise.all([loadBans(), loadVisitors()])
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '封禁失败'), color: 'error' })
  } finally {
    creatingBan.value = false
  }
}

async function deactivateBan(id: string): Promise<void> {
  if (!confirmAdminAction('确认解除该条封禁？解除后立即生效。')) return
  try {
    await adminFetch(`/api/admin/visitors/bans/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
    toast.add({ title: '已解除封禁', color: 'success' })
    await Promise.all([loadBans(), loadVisitors()])
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '解除失败'), color: 'error' })
  }
}

function applySearch(): void {
  page.value = 1
  void loadVisitors()
}

onMounted(async () => {
  const bannedQuery = typeof route.query.banned === 'string' ? route.query.banned : ''
  const ipQuery = typeof route.query.ip === 'string' ? route.query.ip : ''
  const qQuery = typeof route.query.q === 'string' ? route.query.q : ''
  if (bannedQuery === 'true' || bannedQuery === 'false') banned.value = bannedQuery
  if (ipQuery) ip.value = ipQuery
  if (qQuery) q.value = qQuery
  await loadVisitors()
  void loadBans()
  const visitorIdQuery = typeof route.query.visitorId === 'string' ? route.query.visitorId : ''
  if (visitorIdQuery) {
    const hit = items.value.find(row => row.id === visitorIdQuery)
    if (hit) await openEvents(hit)
    else {
      // still open panel with id if not on first page
      selectedVisitor.value = {
        id: visitorIdQuery,
        firstSeenAt: '',
        lastSeenAt: '',
        lastIp: null,
        lastCountry: null,
        lastRegion: null,
        lastCity: null,
        lastUserAgent: null,
        lastPath: null,
        eventCount: 0,
        userId: null,
        locationLabel: '从链接打开'
      }
      await openEvents(selectedVisitor.value)
    }
  }
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <AdminPageHeader
      title="访客轨迹"
      icon="i-lucide-radar"
      eyebrow="安全与操作记录"
    >
      <template #actions>
        <UButton
          to="/admin/bans"
          icon="i-lucide-shield-ban"
          label="封禁管理"
          color="neutral"
          variant="outline"
        />
        <UButton
          to="/admin/audit"
          icon="i-lucide-scroll-text"
          label="操作记录"
          color="neutral"
          variant="outline"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="outline"
          :loading="loading"
          @click="loadVisitors"
        />
      </template>
    </AdminPageHeader>
          <div
      v-if="errorMessage"
      class="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-300"
    >
      {{ errorMessage }}
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          当前筛选结果
        </p>
        <p class="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">
          {{ total }}
        </p>
      </div>
      <div class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          本页已封禁访客
        </p>
        <p class="mt-1 text-2xl font-semibold text-rose-700 dark:text-rose-300">
          {{ bannedCountOnPage }}
        </p>
      </div>
      <div class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          当前生效封禁
        </p>
        <p class="mt-1 text-2xl font-semibold text-amber-700 dark:text-amber-300">
          {{ activeBanCount }}
        </p>
      </div>
    </div>

    <section
      v-if="visitorAnalytics?.moduleViews?.length"
      class="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
    >
      <div class="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 px-4 py-4">
        <div>
          <h2 class="font-semibold text-zinc-950 dark:text-zinc-100">
            功能模块访问量
          </h2>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            按前台功能归类，同一位访客的多次访问会分别计入访问次数。
          </p>
        </div>
        <span class="text-xs text-zinc-500 dark:text-zinc-400">
          共 {{ visitorAnalytics.moduleViews.length }} 个模块
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[38rem] text-left text-sm">
          <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-500 dark:text-zinc-400">
            <tr>
              <th class="px-4 py-3 font-medium">功能模块</th>
              <th class="px-4 py-3 text-right font-medium">访问次数</th>
              <th class="px-4 py-3 text-right font-medium">访客人数</th>
              <th class="px-4 py-3 text-right font-medium">最近访问</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
            <tr v-for="module in visitorAnalytics.moduleViews" :key="module.moduleKey">
              <td class="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{{ module.moduleName }}</td>
              <td class="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{{ module.viewCount }}</td>
              <td class="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{{ module.visitorCount }}</td>
              <td class="px-4 py-3 text-right text-xs text-zinc-500 dark:text-zinc-400">
                {{ module.lastViewedAt ? formatAdminRelativeTime(module.lastViewedAt) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="grid gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <UFormField label="关键词">
        <UInput
          v-model="q"
          placeholder="IP / 城市 / 页面 / 访客编号"
          class="w-full"
          @keyup.enter="applySearch"
        />
      </UFormField>
      <UFormField label="精确 IP">
        <UInput
          v-model="ip"
          placeholder="例如 1.2.3.4"
          class="w-full"
          @keyup.enter="applySearch"
        />
      </UFormField>
      <UFormField label="封禁状态">
        <USelect
          v-model="banned"
          :items="[
            { label: '全部访客', value: 'all' },
            { label: '仅已封禁', value: 'true' },
            { label: '仅未封禁', value: 'false' }
          ]"
          class="w-full"
        />
      </UFormField>
      <UFormField label="访客显示顺序">
        <USelect
          v-model="sortMode"
          :items="[
            { label: '最近活动（时间顺序）', value: 'last-seen' },
            { label: '操作次数最多', value: 'event-count' },
            { label: '最早访问', value: 'first-seen' }
          ]"
          class="w-full"
          @update:model-value="page = 1; loadVisitors()"
        />
      </UFormField>
      <div class="flex items-end">
        <UButton
          color="primary"
          icon="i-lucide-search"
          :loading="loading"
          @click="applySearch"
        >
          查询
        </UButton>
      </div>
    </div>

    <section
      v-if="visitorAnalytics"
      class="grid gap-4 rounded-2xl border border-sky-100 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/40 p-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]"
    >
      <div>
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 class="font-semibold text-sky-950 dark:text-sky-300">当日访问频率</h2>
            <p class="mt-1 text-xs text-sky-800/70">
              {{ visitorAnalytics.date }} · 按中国标准时间统计
            </p>
          </div>
          <div class="flex gap-3 text-xs text-sky-900 dark:text-sky-300">
            <span>访客 {{ visitorAnalytics.today.visitorCount }} 位</span>
            <span>操作 {{ visitorAnalytics.today.eventCount }} 次</span>
          </div>
        </div>
        <div class="mt-4 grid grid-cols-12 items-end gap-1.5">
          <div
            v-for="row in visitorAnalytics.hourly"
            :key="row.hour"
            class="group flex min-w-0 flex-col items-center gap-1"
            :title="`${row.label} · ${row.eventCount} 次操作 · ${row.visitorCount} 位访客`"
          >
            <div class="flex h-28 w-full items-end justify-center">
              <div
                class="w-full max-w-5 rounded-t bg-sky-500/75 transition-[height] group-hover:bg-sky-600"
                :style="{ height: `${Math.max(row.eventCount ? 8 : 2, (row.eventCount / maxHourlyEvents) * 100)}%` }"
              />
            </div>
            <span
              v-if="Number(row.hour) % 2 === 0"
              class="text-[10px] tabular-nums text-sky-800/70"
            >{{ row.hour }}</span>
          </div>
        </div>
      </div>
      <div class="rounded-xl border border-white bg-white/80 dark:bg-zinc-900/80 p-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">近 14 天</h3>
          <span class="text-[11px] text-zinc-500 dark:text-zinc-400">按日汇总</span>
        </div>
        <div class="mt-3 space-y-2">
          <div
            v-for="row in visitorAnalytics.daily"
            :key="row.date"
            class="grid grid-cols-[4.75rem_minmax(0,1fr)_3rem] items-center gap-2 text-xs"
          >
            <span class="tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.date.slice(5) }}</span>
            <div class="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                class="h-full rounded-full bg-sky-400"
                :style="{ width: `${Math.max(row.eventCount ? 6 : 0, (row.eventCount / maxDailyEvents) * 100)}%` }"
              />
            </div>
            <span class="text-right tabular-nums text-zinc-700 dark:text-zinc-200">{{ row.eventCount }}</span>
          </div>
        </div>
      </div>
    </section>

    <div class="grid gap-2 md:hidden" aria-label="访客列表">
      <article
        v-for="row in items"
        :key="'mobile-' + row.id"
        class="min-w-0 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3"
        :class="selectedVisitor?.id === row.id ? 'border-sky-300 bg-sky-50/40 dark:bg-sky-950/40' : ''"
      >
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ row.lastIp || '未知网络' }}</p>
            <p class="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{{ row.locationLabel || '未知地点' }}</p>
          </div>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
            :class="row.isBanned ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'"
          >
            {{ row.isBanned ? '已封禁' : '正常' }}
          </span>
        </div>
        <p class="mt-2 truncate text-xs text-zinc-700 dark:text-zinc-200" :title="row.lastPath || ''">{{ adminPathLabel(row.lastPath) }}</p>
        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>{{ formatTime(row.lastSeenAt) }}</span>
          <span>{{ row.eventCount }} 次操作</span>
          <span>访客 {{ shortAdminId(row.id, 8) }}</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <UButton size="xs" color="neutral" variant="outline" @click="openEvents(row)">查看详情</UButton>
          <UButton size="xs" color="error" variant="soft" :disabled="!row.lastIp" @click="prepBan(row, 'ip')">封 IP</UButton>
          <UButton size="xs" color="error" variant="ghost" @click="prepBan(row, 'visitor')">封访客</UButton>
          <UButton v-if="row.userId" size="xs" color="error" variant="ghost" @click="prepBan(row, 'user')">封账号</UButton>
        </div>
      </article>
      <p v-if="!items.length && !loading" class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">暂无访客数据</p>
    </div>

    <div class="hidden overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 md:block">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-500 dark:text-zinc-400">
          <tr>
            <th class="px-3 py-3 font-medium">最近访问</th>
            <th class="px-3 py-3 font-medium">IP / 地点</th>
            <th class="px-3 py-3 font-medium">页面 / 设备</th>
            <th class="px-3 py-3 font-medium">操作次数</th>
            <th class="px-3 py-3 font-medium">状态</th>
            <th class="px-3 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in items"
            :key="row.id"
            class="border-t border-zinc-100 dark:border-zinc-800 align-top"
            :class="selectedVisitor?.id === row.id ? 'bg-sky-50/40 dark:bg-sky-950/40' : ''"
          >
            <td class="px-3 py-3 whitespace-nowrap text-zinc-700 dark:text-zinc-200">
              {{ formatTime(row.lastSeenAt) }}
              <div class="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                首次 {{ formatTime(row.firstSeenAt) }}
              </div>
            </td>
            <td class="px-3 py-3">
              <div class="font-medium text-zinc-900 dark:text-zinc-100">
                {{ row.lastIp || '—' }}
              </div>
              <div class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ row.locationLabel }}
              </div>
              <div class="mt-1 break-all text-[11px] text-zinc-400 dark:text-zinc-500">
                访客编号 {{ shortAdminId(row.id, 12) }}
              </div>
              <div
                v-if="row.userId"
                class="mt-1 break-all text-[11px] text-sky-600"
              >
                账号编号 {{ shortAdminId(row.userId, 12) }}
              </div>
            </td>
            <td class="px-3 py-3">
              <div class="text-xs text-zinc-700 dark:text-zinc-200">
                <span :title="row.lastPath || ''">{{ adminPathLabel(row.lastPath) }}</span>
              </div>
              <div class="mt-1 break-all text-[11px] text-zinc-400 dark:text-zinc-500">
                {{ shortUa(row.lastUserAgent) }}
              </div>
            </td>
            <td class="px-3 py-3 font-medium text-zinc-800 dark:text-zinc-100">
              {{ row.eventCount }}
            </td>
            <td class="px-3 py-3">
              <span
                class="rounded-full px-2 py-0.5 text-xs"
                :class="row.isBanned ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'"
              >
                {{ row.isBanned ? '已封禁' : '正常' }}
              </span>
            </td>
            <td class="px-3 py-3">
              <div class="flex flex-wrap gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  @click="openEvents(row)"
                >
                  操作详情
                </UButton>
                <UButton
                  size="xs"
                  color="error"
                  variant="soft"
                  :disabled="!row.lastIp"
                  @click="prepBan(row, 'ip')"
                >
                  封 IP
                </UButton>
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  @click="prepBan(row, 'visitor')"
                >
                  封访客
                </UButton>
                <UButton
                  v-if="row.userId"
                  size="xs"
                  color="error"
                  variant="ghost"
                  @click="prepBan(row, 'user')"
                >
                  封账号
                </UButton>
              </div>
            </td>
          </tr>
          <tr v-if="!items.length && !loading">
            <td
              colspan="6"
              class="px-3 py-10 text-center text-sm text-zinc-400 dark:text-zinc-500"
            >
              暂无访客数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
      <span>共 {{ total }} 条 · 第 {{ page }} 页</span>
      <div class="flex gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          :disabled="page <= 1"
          @click="page -= 1; loadVisitors()"
        >
          上一页
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          :disabled="page * pageSize >= total"
          @click="page += 1; loadVisitors()"
        >
          下一页
        </UButton>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <section
        id="visitor-ban-form"
        class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
      >
        <h2 class="font-semibold text-zinc-950 dark:text-zinc-100">
          快速封禁
        </h2>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          原因必填；可选到期时间。创建后会写入操作记录。
        </p>
        <div class="mt-3 space-y-3">
          <UFormField label="范围">
            <USelect
              v-model="banScope"
              :items="[
                { label: 'IP', value: 'ip' },
                { label: '访客', value: 'visitor' },
                { label: '账号', value: 'user' }
              ]"
              class="w-full"
            />
          </UFormField>
          <UFormField label="值">
            <UInput
              v-model="banValue"
              class="w-full"
              placeholder="IP / 访客编号 / 账号编号"
            />
          </UFormField>
          <UFormField label="原因（必填）">
            <UInput
              v-model="banReason"
              class="w-full"
              placeholder="例如：频繁访问 / 自动批量访问"
            />
          </UFormField>
          <UFormField label="到期时间（可选）">
            <UInput
              v-model="banExpiresAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
          <UButton
            color="error"
            icon="i-lucide-ban"
            :loading="creatingBan"
            @click="createBan"
          >
            确认封禁
          </UButton>
        </div>
      </section>

      <section class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-zinc-950 dark:text-zinc-100">
              生效中封禁（最近 30 条）
            </h2>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              完整筛选与分页请前往封禁管理。
            </p>
          </div>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :loading="banLoading"
            @click="loadBans"
          >
            刷新
          </UButton>
        </div>
        <ul class="mt-3 max-h-96 space-y-2 overflow-y-auto">
          <li
            v-for="ban in bans"
            :key="ban.id"
            class="rounded-xl border border-zinc-100 dark:border-zinc-800 px-3 py-2 text-sm"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="font-medium text-zinc-900 dark:text-zinc-100">
                  {{ adminLabel(adminBanScopeLabels, ban.scope) }} · {{ ban.value }}
                </p>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  <span
                    :class="{
                      'text-emerald-700 dark:text-emerald-300': banStatusMeta(ban).tone === 'active',
                      'text-amber-700 dark:text-amber-300': banStatusMeta(ban).tone === 'expired',
                      'text-zinc-500 dark:text-zinc-400': banStatusMeta(ban).tone === 'inactive'
                    }"
                  >{{ banStatusMeta(ban).label }}</span>
                  · {{ formatTime(ban.createdAt) }}
                  <template v-if="ban.expiresAt"> · 到期 {{ formatTime(ban.expiresAt) }}</template>
                </p>
                <p
                  v-if="ban.reason"
                  class="mt-1 text-xs text-zinc-600 dark:text-zinc-300"
                >
                  {{ visitorBanReasonLabel(ban.reason) }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :to="adminAuditHref('visitor_ban', ban.id)"
                >
                  操作记录
                </UButton>
                <UButton
                  v-if="ban.isActive"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  @click="deactivateBan(ban.id)"
                >
                  解除
                </UButton>
              </div>
            </div>
          </li>
          <li
            v-if="!bans.length"
            class="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500"
          >
            暂无生效封禁
          </li>
        </ul>
      </section>
    </div>

    <section
      v-if="ip.trim() || ipDossier || ipDossierLoading"
      class="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 to-white p-4"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="font-semibold text-indigo-950">网络地址记录</h2>
          <p class="mt-0.5 text-xs text-indigo-800/80">
            {{ ipDossier?.ip || ip.trim() || '—' }}
            <template v-if="ipDossier">
              · 访客 {{ ipDossier.summary.visitorCount }}
              · 操作 {{ ipDossier.summary.eventTotal }}
              <template v-if="ipDossier.summary.events24h != null"> · 24h {{ ipDossier.summary.events24h }}</template>
              <template v-if="ipDossier.summary.linkedUserCount != null"> · 账号 {{ ipDossier.summary.linkedUserCount }}</template>
            </template>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            v-if="ipDossier?.riskLevel || ipDossier?.summary.riskLevel"
            class="rounded-full px-2 py-0.5 text-[11px] font-medium"
            :class="riskToneClass(ipDossier.riskLevel || ipDossier.summary.riskLevel)"
          >
            {{ adminLabel(adminRiskLevelLabels, ipDossier.riskLevel || ipDossier.summary.riskLevel) }}
            <template v-if="(ipDossier.riskScore ?? ipDossier.summary.riskScore) != null">
              · {{ adminRiskScoreText(ipDossier.riskScore ?? ipDossier.summary.riskScore) }}
            </template>
          </span>
          <span
            v-if="ipDossier?.summary.isBanned"
            class="rounded-full bg-red-100 dark:bg-red-900/50 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:text-red-300"
          >IP 命中封禁</span>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :loading="ipDossierLoading"
            :disabled="!ip.trim()"
            @click="loadIpDossier(ip.trim())"
          >
            刷新记录
          </UButton>
        </div>
      </div>

      <div v-if="ipDossierLoading && !ipDossier" class="mt-3 text-xs text-indigo-700">正在加载网络地址记录…</div>
      <template v-else-if="ipDossier">
        <div
          v-if="ipDossier.riskFactors?.length"
          class="mt-3 rounded-lg border border-rose-100 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/40 p-2.5"
        >
          <p class="text-[11px] font-medium text-rose-900 dark:text-rose-300">风险原因</p>
          <ul class="mt-1.5 flex flex-wrap gap-1.5">
            <li
              v-for="factor in ipDossier.riskFactors"
              :key="'ipf-' + factor.code + '-' + factor.points"
              class="rounded-full bg-white dark:bg-zinc-900 px-2 py-0.5 text-[11px] text-rose-900 dark:text-rose-300 ring-1 ring-rose-100"
            >
              {{ adminLabel(adminRiskFactorLabels, factor.code, factor.code) }}
              风险分数 +{{ factor.points }} · {{ factor.message }}
            </li>
          </ul>
        </div>
        <div
          v-if="ipDossier.suggestedActions?.length"
          class="mt-3 rounded-lg border border-sky-100 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/40 p-2.5"
        >
          <p class="text-[11px] font-medium text-sky-950 dark:text-sky-300">建议处置</p>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            <button
              v-for="(action, idx) in ipDossier.suggestedActions"
              :key="'ipsa-' + action.kind + '-' + idx"
              type="button"
              class="rounded-full bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-sky-900 dark:text-sky-300 ring-1 ring-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950"
              :title="action.reason"
              @click="applySuggestedAction(action)"
            >
              {{ adminLabel(adminSuggestedActionLabels, action.kind, action.label) }}
            </button>
          </div>
        </div>

        <div class="mt-3 grid gap-3 md:grid-cols-3">
          <div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">关联访客</p>
            <ul class="mt-1.5 max-h-32 space-y-1 overflow-y-auto">
              <li
                v-for="v in (ipDossier.visitors || []).slice(0, 8)"
                :key="'ipv-' + v.id"
                class="flex items-center justify-between gap-2 text-[11px]"
              >
                <button
                  type="button"
                  class="truncate text-left text-sky-700 dark:text-sky-300 hover:underline"
                  @click="q = v.id; page = 1; loadVisitors()"
                >
                  {{ shortAdminId(v.id, 10) }}
                </button>
                <span class="shrink-0 text-zinc-500 dark:text-zinc-400">{{ v.eventCount ?? '—' }} 次操作</span>
              </li>
              <li v-if="!(ipDossier.visitors || []).length" class="text-zinc-400 dark:text-zinc-500">暂无</li>
            </ul>
          </div>
          <div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">常访页面</p>
            <ul class="mt-1.5 max-h-32 space-y-1 overflow-y-auto">
              <li
                v-for="row in (ipDossier.pathTop || []).slice(0, 8)"
                :key="'ipp-' + row.path"
                class="flex items-center justify-between gap-2 text-[11px]"
              >
                <span class="truncate text-zinc-700 dark:text-zinc-200" :title="row.path">{{ adminPathLabel(row.path) }}</span>
                <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
              </li>
              <li v-if="!(ipDossier.pathTop || []).length" class="text-zinc-400 dark:text-zinc-500">暂无</li>
            </ul>
          </div>
          <div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">设备与地点</p>
            <ul class="mt-1.5 max-h-32 space-y-1 overflow-y-auto text-[11px] text-zinc-700 dark:text-zinc-200">
              <li
                v-for="(row, idx) in (ipDossier.userAgentHistory || []).slice(0, 4)"
                :key="'ipua-' + idx"
              >
                <span class="tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}×</span>
                {{ shortUa(row.userAgent) }}
              </li>
              <li
                v-for="(row, idx) in (ipDossier.geoTrail || []).slice(0, 4)"
                :key="'ipgeo-' + idx"
                class="text-zinc-600 dark:text-zinc-300"
              >
                {{ row.city || '未知地点' }} · {{ row.count }}
              </li>
              <li
                v-if="!(ipDossier.userAgentHistory || []).length && !(ipDossier.geoTrail || []).length"
                class="text-zinc-400 dark:text-zinc-500"
              >
                暂无
              </li>
            </ul>
          </div>
        </div>
        <div
          v-if="ipDossier?.confidence || ipDossier?.peerComparison || ipDossier?.firstEventAt"
          class="mt-3 grid gap-2 sm:grid-cols-3"
        >
          <div class="rounded-lg border border-violet-100 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/40 p-2.5 text-[11px]">
            <p class="font-medium text-violet-950 dark:text-violet-300">判断把握</p>
            <p class="mt-1 text-sm font-semibold text-violet-900 dark:text-violet-300">
              {{ adminLabel(adminConfidenceLabels, ipDossier.confidence || ipDossier.summary?.confidence, ipDossier.confidence || '—') }}
            </p>
            <p class="mt-0.5 text-violet-800/80">参考记录 {{ ipDossier.evidenceEvents ?? ipDossier.summary?.evidenceEvents ?? '—' }} 条</p>
          </div>
          <div class="rounded-lg border border-sky-100 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/40 p-2.5 text-[11px]">
            <p class="font-medium text-sky-950 dark:text-sky-300">活跃程度</p>
            <p class="mt-1 text-sm font-semibold text-sky-900 dark:text-sky-300">{{ activityLevel(ipDossier.peerComparison?.percentile ?? ipDossier.summary?.peerPercentile) }}</p>
            <p class="mt-0.5 text-sky-800/80">参考 {{ ipDossier.peerComparison?.sampleSize ?? '—' }} 个来源</p>
          </div>
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[11px]">
            <p class="font-medium text-zinc-800 dark:text-zinc-100">活跃时段</p>
            <p class="mt-1 text-zinc-600 dark:text-zinc-300">首见 {{ formatAdminRelativeTime(ipDossier.firstEventAt || ipDossier.summary?.firstEventAt) }}</p>
            <p class="mt-0.5 text-zinc-500 dark:text-zinc-400">最近 {{ formatAdminRelativeTime(ipDossier.lastEventAt || ipDossier.summary?.lastEventAt) }}</p>
          </div>
        </div>

        <div
          v-if="ipDossier?.pathSequence?.length || ipDossier?.pathTransitions?.length || ipDossier?.burstWindows?.length"
          class="mt-3 grid gap-3 md:grid-cols-3"
        >
          <div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">访问过程</p>
            <ul class="mt-1.5 max-h-32 space-y-1 overflow-y-auto text-[11px]">
              <li v-for="(row, idx) in (ipDossier.pathSequence || []).slice(0, 10)" :key="'iseq-' + idx" class="flex justify-between gap-2">
                <span class="truncate" :title="row.path">{{ adminPathLabel(row.path) }}</span>
                <span class="shrink-0 text-zinc-400 dark:text-zinc-500">{{ actionLabel(row.action) }}</span>
              </li>
            </ul>
          </div>
          <div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">常见访问顺序</p>
            <ul class="mt-1.5 max-h-32 space-y-1 overflow-y-auto text-[11px]">
              <li v-for="(row, idx) in (ipDossier.pathTransitions || []).slice(0, 8)" :key="'ipt-' + idx" class="flex justify-between gap-2">
                <span class="truncate" :title="row.transition">{{ adminPathTransitionLabel(row.from, row.to) }}</span>
                <span class="shrink-0 tabular-nums">{{ row.count }}</span>
              </li>
            </ul>
          </div>
          <div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">访问高峰</p>
            <ul class="mt-1.5 max-h-32 space-y-1 overflow-y-auto text-[11px]">
              <li v-for="(row, idx) in (ipDossier.burstWindows || []).slice(0, 6)" :key="'ibw-' + idx" class="flex justify-between gap-2">
                <span class="truncate text-zinc-600 dark:text-zinc-300">{{ formatAdminRelativeTime(row.startAt) }}</span>
                <span class="shrink-0 tabular-nums text-amber-800 dark:text-amber-300">{{ row.count }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div
          v-if="ipDossier.networkProfile || ipDossier.evidenceLedger?.length || ipDossier.playbook?.length"
          class="mt-3 grid gap-3 lg:grid-cols-3"
        >
          <section class="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <h3 class="text-xs font-semibold text-indigo-950">相近网络来源</h3>
            <template v-if="ipDossier.networkProfile">
              <p class="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{{ ipDossier.networkProfile.prefix || '—' }}</p>
              <p class="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                {{ ipDossier.networkProfile.ipCount }} IP · {{ ipDossier.networkProfile.visitorCount }} 访客 · {{ ipDossier.networkProfile.userCount }} 账号
              </p>
              <p class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {{ ipDossier.networkProfile.eventCount }} 次操作 · {{ adminRiskScoreText(ipDossier.networkProfile.riskScore) }}
              </p>
            </template>
          </section>
          <section class="rounded-lg border border-rose-100 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/40 p-3">
            <h3 class="text-xs font-semibold text-rose-950">判断依据</h3>
            <ul class="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              <li v-for="item in ipDossier.evidenceLedger" :key="'ipe-' + item.code" class="text-[11px]">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate font-medium text-zinc-800 dark:text-zinc-100">{{ item.message }}</span>
                  <span class="shrink-0 rounded-full bg-white dark:bg-zinc-900 px-1.5 py-0.5 text-[10px] text-rose-800">
                    {{ adminLabel(adminEvidenceStrengthLabels, item.strength, item.strength) }} · 参考分 {{ item.weight }}
                  </span>
                </div>
              </li>
              <li v-if="!ipDossier.evidenceLedger?.length" class="text-[11px] text-zinc-400 dark:text-zinc-500">暂无判断依据</li>
            </ul>
          </section>
          <section class="rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/40 p-3">
            <h3 class="text-xs font-semibold text-emerald-950 dark:text-emerald-300">处理建议</h3>
            <ol class="mt-2 max-h-48 space-y-2 overflow-y-auto">
              <li v-for="step in ipDossier.playbook" :key="'ippb-' + step.code" class="text-[11px]">
                <NuxtLink :to="step.href" class="block rounded-md bg-white dark:bg-zinc-900 px-2 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium text-zinc-900 dark:text-zinc-100">{{ step.step }}. {{ adminLabel(adminInvestigationStepLabels, step.code, step.title) }}</span>
                    <span class="shrink-0 text-[10px] text-emerald-800 dark:text-emerald-300">{{ adminLabel(adminPlaybookStatusLabels, step.status, step.status) }}</span>
                  </div>
                  <p class="mt-0.5 line-clamp-2 text-zinc-500 dark:text-zinc-400">{{ step.detail }}</p>
                </NuxtLink>
              </li>
            </ol>
          </section>
        </div>

      </template>
      <p v-else-if="ip.trim()" class="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        暂无该网络地址记录，可点击刷新或确认筛选条件。
      </p>
    </section>

    <section
      v-if="selectedVisitor"
      class="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/30 dark:bg-sky-950/30 p-4"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="font-semibold text-zinc-950 dark:text-zinc-100">
            操作详情 · {{ selectedVisitor.lastIp || shortAdminId(selectedVisitor.id, 12) }}
          </h2>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {{ selectedVisitor.locationLabel }} · 共 {{ eventTotal }} 条操作记录 · 访客编号 {{ shortAdminId(selectedVisitor.id, 12) }}
          </p>
        </div>
        <div class="flex gap-2">
          <UButton
            size="xs"
            color="error"
            variant="soft"
            :disabled="!selectedVisitor.lastIp"
            @click="prepBan(selectedVisitor, 'ip')"
          >
            封此 IP
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            @click="clearSelectedVisitor()"
          >
            关闭
          </UButton>
        </div>
      </div>


      <div
        v-if="dossierLoading"
        class="mt-3 rounded-xl border border-violet-100 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/40 px-3 py-2 text-xs text-violet-800"
      >
        详细情况加载中…
      </div>
      <div
        v-else-if="visitorDossier"
        class="mt-3 space-y-3 rounded-xl border border-violet-100 dark:border-violet-900 bg-gradient-to-br from-violet-50/70 to-white p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-xs font-semibold text-violet-950 dark:text-violet-300">访客详情</p>
            <p class="mt-0.5 text-[11px] text-violet-700/80">
            操作 {{ visitorDossier.summary.eventTotal }} · 近 7 天 {{ visitorDossier.summary.events7d }}
              · IP {{ visitorDossier.summary.uniqueIps }} · 页面 {{ visitorDossier.summary.uniquePaths }}
            </p>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span
              class="rounded-full px-2 py-0.5 text-[11px] font-medium"
              :class="visitorDossier.summary.isBanned ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300' : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300'"
            >
              {{ visitorDossier.summary.isBanned ? '命中封禁' : '未命中封禁' }}
            </span>
            <span
              v-if="visitorDossier.summary.activeBanCount"
              class="rounded-full bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-[11px] text-amber-900 dark:text-amber-300"
            >
              生效封禁 {{ visitorDossier.summary.activeBanCount }}
            </span>
            <span
              v-if="visitorDossier.riskLevel || visitorDossier.summary.riskLevel"
              class="rounded-full px-2 py-0.5 text-[11px] font-medium"
              :class="riskToneClass(visitorDossier.riskLevel || visitorDossier.summary.riskLevel)"
            >
              {{ adminLabel(adminRiskLevelLabels, visitorDossier.riskLevel || visitorDossier.summary.riskLevel) }}
              <template v-if="(visitorDossier.riskScore ?? visitorDossier.summary.riskScore) != null">
                · {{ adminRiskScoreText(visitorDossier.riskScore ?? visitorDossier.summary.riskScore) }}
              </template>
            </span>
            <NuxtLink
              v-if="visitorDossier.linkedUser"
              :to="'/admin/users?userId=' + encodeURIComponent(visitorDossier.linkedUser.id)"
              class="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-900 dark:text-sky-300 hover:underline"
            >
              关联账号 {{ visitorDossier.linkedUser.displayName || visitorDossier.linkedUser.username }}
            </NuxtLink>
            <NuxtLink
              :to="adminAuditHref('visitor', selectedVisitor.id)"
              class="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-700 dark:text-zinc-200 hover:underline"
            >
              操作记录
            </NuxtLink>
          </div>
        </div>

        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="row in visitorDossier.actionBreakdown.slice(0, 8)"
            :key="'act-' + row.action"
            class="rounded-full bg-white dark:bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-700 dark:text-zinc-200 ring-1 ring-violet-100"
          >
            {{ actionLabel(row.action) }} {{ row.count }}
          </span>
        </div>

        <div
          v-if="visitorDossier.riskFactors?.length"
          class="rounded-lg border border-rose-100 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/40 p-2.5"
        >
          <p class="text-[11px] font-medium text-rose-900 dark:text-rose-300">风险原因</p>
          <ul class="mt-1.5 flex flex-wrap gap-1.5">
            <li
              v-for="factor in visitorDossier.riskFactors"
              :key="factor.code + '-' + factor.points"
              class="rounded-full bg-white dark:bg-zinc-900 px-2 py-0.5 text-[11px] text-rose-900 dark:text-rose-300 ring-1 ring-rose-100"
              :title="factor.message"
            >
              {{ adminLabel(adminRiskFactorLabels, factor.code, factor.code) }}
              <span class="tabular-nums text-rose-700 dark:text-rose-300">风险分数 +{{ factor.points }}</span>
              <span class="text-rose-700/70">· {{ factor.message }}</span>
            </li>
          </ul>
        </div>

        <div
          v-if="visitorDossier.suggestedActions?.length"
          class="rounded-lg border border-sky-100 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/40 p-2.5"
        >
          <p class="text-[11px] font-medium text-sky-950 dark:text-sky-300">建议处置</p>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            <button
              v-for="(action, idx) in visitorDossier.suggestedActions"
              :key="action.kind + '-' + idx"
              type="button"
              class="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition hover:brightness-95"
              :class="action.priority === 'high'
                ? 'bg-red-100 dark:bg-red-900/50 text-red-900 ring-red-200'
                : action.priority === 'medium'
                  ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-950 ring-amber-200'
                  : 'bg-white dark:bg-zinc-900 text-sky-900 dark:text-sky-300 ring-sky-200'"
              :title="action.reason"
              @click="applySuggestedAction(action)"
            >
              {{ adminLabel(adminSuggestedActionLabels, action.kind, action.label) }}
            </button>
          </div>
        </div>

        <div
          v-if="visitorDossier.userAgentHistory?.length || visitorDossier.geoTrail?.length || visitorDossier.hourlyPattern?.length"
          class="grid gap-3 md:grid-cols-3"
        >
          <div
            v-if="visitorDossier.userAgentHistory?.length"
            class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5"
          >
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">设备与浏览器</p>
            <ul class="mt-1.5 max-h-28 space-y-1 overflow-y-auto">
              <li
                v-for="(row, idx) in visitorDossier.userAgentHistory.slice(0, 6)"
                :key="'ua-' + idx"
                class="text-[11px] text-zinc-700 dark:text-zinc-200"
              >
                <span class="tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}×</span>
                {{ shortUa(row.userAgent) }}
              </li>
            </ul>
          </div>
          <div
            v-if="visitorDossier.geoTrail?.length"
            class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5"
          >
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">地理轨迹</p>
            <ul class="mt-1.5 max-h-28 space-y-1 overflow-y-auto">
              <li
                v-for="(row, idx) in visitorDossier.geoTrail.slice(0, 8)"
                :key="'geo-' + idx"
                class="flex items-center justify-between gap-2 text-[11px]"
              >
                <span class="truncate text-zinc-700 dark:text-zinc-200">
                  {{ [row.country, row.region, row.city].filter(Boolean).join(' · ') || row.city || '未知' }}
                </span>
                <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
              </li>
            </ul>
          </div>
          <div
            v-if="activeHourlyRows(visitorDossier.hourlyPattern).length"
            class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5"
          >
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">活跃时段</p>
            <ul class="mt-1.5 max-h-28 space-y-1 overflow-y-auto">
              <li
                v-for="row in activeHourlyRows(visitorDossier.hourlyPattern)"
                :key="'hour-' + row.hour"
                class="flex items-center justify-between gap-2 text-[11px]"
              >
                <span class="text-zinc-700 dark:text-zinc-200">{{ formatHourLabel(row.hour) }}</span>
                <span class="tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
        <div
          v-if="visitorDossier?.confidence || visitorDossier?.peerComparison"
          class="mt-3 grid gap-2 sm:grid-cols-3"
        >
          <div class="rounded-lg border border-violet-100 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/40 p-2.5 text-[11px]">
            <p class="font-medium text-violet-950 dark:text-violet-300">判断把握</p>
            <p class="mt-1 text-sm font-semibold text-violet-900 dark:text-violet-300">
              {{ adminLabel(adminConfidenceLabels, visitorDossier.confidence || visitorDossier.summary?.confidence, visitorDossier.confidence || '—') }}
            </p>
            <p class="mt-0.5 text-violet-800/80">参考记录 {{ visitorDossier.evidenceEvents ?? visitorDossier.summary?.evidenceEvents ?? '—' }} 条</p>
          </div>
          <div class="rounded-lg border border-sky-100 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/40 p-2.5 text-[11px]">
            <p class="font-medium text-sky-950 dark:text-sky-300">活跃程度</p>
            <p class="mt-1 text-sm font-semibold text-sky-900 dark:text-sky-300">{{ activityLevel(visitorDossier.peerComparison?.percentile ?? visitorDossier.summary?.peerPercentile) }}</p>
            <p class="mt-0.5 text-sky-800/80">
              今天 {{ visitorDossier.peerComparison?.events24h ?? visitorDossier.summary?.events24h ?? '—' }} 次
              · 参考 {{ visitorDossier.peerComparison?.sampleSize ?? '—' }} 位访客
            </p>
          </div>
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[11px]">
            <p class="font-medium text-zinc-800 dark:text-zinc-100">关系摘要</p>
            <p class="mt-1 text-zinc-600 dark:text-zinc-300">
              IP {{ visitorDossier.relationship?.lastIp || visitorDossier.visitor?.lastIp || '—' }}
            </p>
            <p class="mt-0.5 text-zinc-500 dark:text-zinc-400">
              同 IP 访客 {{ (visitorDossier.relationship?.sameIpVisitorIds || []).length || visitorDossier.summary?.sameIpVisitorCount || 0 }}
            </p>
          </div>
        </div>

        <div
          v-if="visitorDossier?.pathSequence?.length || visitorDossier?.pathTransitions?.length || visitorDossier?.burstWindows?.length"
          class="mt-3 grid gap-3 md:grid-cols-3"
        >
          <div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">访问过程</p>
            <ul class="mt-1.5 max-h-36 space-y-1 overflow-y-auto text-[11px]">
              <li
                v-for="(row, idx) in (visitorDossier.pathSequence || []).slice(0, 12)"
                :key="'vseq-' + idx"
                class="flex items-center justify-between gap-2"
              >
                <span class="truncate text-zinc-700 dark:text-zinc-200" :title="row.path">{{ adminPathLabel(row.path) }}</span>
                <span class="shrink-0 text-zinc-400 dark:text-zinc-500">{{ adminLabel(adminVisitorActionLabels, row.action, row.action) }}</span>
              </li>
              <li v-if="!(visitorDossier.pathSequence || []).length" class="text-zinc-400 dark:text-zinc-500">暂无</li>
            </ul>
          </div>
          <div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">常见访问顺序</p>
            <ul class="mt-1.5 max-h-36 space-y-1 overflow-y-auto text-[11px]">
              <li
                v-for="(row, idx) in (visitorDossier.pathTransitions || []).slice(0, 8)"
                :key="'vpt-' + idx"
                class="flex items-center justify-between gap-2"
              >
                <span class="truncate text-zinc-700 dark:text-zinc-200" :title="row.transition">{{ adminPathTransitionLabel(row.from, row.to) }}</span>
                <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
              </li>
              <li v-if="!(visitorDossier.pathTransitions || []).length" class="text-zinc-400 dark:text-zinc-500">暂无</li>
            </ul>
          </div>
          <div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">访问高峰</p>
            <ul class="mt-1.5 max-h-36 space-y-1 overflow-y-auto text-[11px]">
              <li
                v-for="(row, idx) in (visitorDossier.burstWindows || []).slice(0, 6)"
                :key="'vbw-' + idx"
                class="flex items-center justify-between gap-2"
              >
                <span class="truncate text-zinc-600 dark:text-zinc-300">{{ formatAdminRelativeTime(row.startAt) }}</span>
                <span class="shrink-0 tabular-nums text-amber-800 dark:text-amber-300">{{ row.count }}</span>
              </li>
              <li v-if="!(visitorDossier.burstWindows || []).length" class="text-zinc-400 dark:text-zinc-500">暂无</li>
            </ul>
          </div>
        </div>

<div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">IP 历史</p>
            <ul class="mt-1.5 max-h-28 space-y-1 overflow-y-auto">
              <li
                v-for="row in visitorDossier.ipHistory"
                :key="row.ip"
                class="flex items-center justify-between gap-2 text-[11px]"
              >
                <button
                  type="button"
                  class="truncate text-left text-sky-700 dark:text-sky-300 hover:underline"
                  @click="ip = row.ip; page = 1; loadVisitors()"
                >
                  {{ row.ip }}
                </button>
                <span class="shrink-0 text-zinc-500 dark:text-zinc-400">{{ row.count }} · {{ formatAdminRelativeTime(row.lastAt) }}</span>
              </li>
              <li v-if="!visitorDossier.ipHistory.length" class="text-zinc-400 dark:text-zinc-500">暂无</li>
            </ul>
          </div>
          <div class="rounded-lg border border-white bg-white/90 dark:bg-zinc-900/90 p-2.5">
            <p class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">常访页面</p>
            <ul class="mt-1.5 max-h-28 space-y-1 overflow-y-auto">
              <li
                v-for="row in visitorDossier.pathTop"
                :key="row.path"
                class="flex items-center justify-between gap-2 text-[11px]"
              >
                <span class="truncate text-zinc-700 dark:text-zinc-200" :title="row.path">{{ adminPathLabel(row.path) }}</span>
                <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{{ row.count }}</span>
              </li>
              <li v-if="!visitorDossier.pathTop.length" class="text-zinc-400 dark:text-zinc-500">暂无</li>
            </ul>
          </div>
        </div>

        <div
          v-if="visitorDossier.relatedBans.length"
          class="rounded-lg border border-red-100 bg-red-50/40 dark:bg-red-950/40 p-2.5"
        >
          <p class="text-[11px] font-medium text-red-900">关联封禁</p>
          <ul class="mt-1.5 space-y-1.5">
            <li
              v-for="ban in visitorDossier.relatedBans.slice(0, 6)"
              :key="ban.id"
              class="flex flex-wrap items-start justify-between gap-2 text-[11px]"
            >
              <div class="min-w-0">
                <p class="font-medium text-zinc-900 dark:text-zinc-100">
                  {{ adminLabel(adminBanScopeLabels, ban.scope, ban.scope) }} · {{ ban.value }}
                  <span
                    class="ml-1 rounded-full px-1.5 py-0.5"
                    :class="banStatusMeta(ban).tone === 'active' ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'"
                  >
                    {{ banStatusMeta(ban).label }}
                  </span>
                </p>
                <p class="mt-0.5 line-clamp-2 text-zinc-600 dark:text-zinc-300">{{ visitorBanReasonLabel(ban.reason) }}</p>
              </div>
              <NuxtLink
                :to="'/admin/bans?banId=' + encodeURIComponent(ban.id)"
                class="shrink-0 text-sky-700 dark:text-sky-300 hover:underline"
              >
                查看
              </NuxtLink>
            </li>
          </ul>
        </div>

        <div
          v-if="visitorDossier.sameIpVisitors.length"
          class="rounded-lg border border-amber-100 bg-amber-50/30 dark:bg-amber-950/30 p-2.5"
        >
          <p class="text-[11px] font-medium text-amber-950">
            同 IP 其他访客 · {{ visitorDossier.summary.sameIpVisitorCount }}
          </p>
          <ul class="mt-1.5 space-y-1">
            <li
              v-for="sib in visitorDossier.sameIpVisitors"
              :key="sib.id"
              class="flex flex-wrap items-center justify-between gap-2 text-[11px]"
            >
              <button
                type="button"
                class="truncate text-left text-sky-700 dark:text-sky-300 hover:underline"
                @click="openEvents({
                  id: sib.id,
                  firstSeenAt: sib.lastSeenAt,
                  lastSeenAt: sib.lastSeenAt,
                  lastIp: sib.lastIp,
                  lastCountry: null,
                  lastRegion: null,
                  lastCity: sib.lastCity,
                  lastUserAgent: null,
                  lastPath: sib.lastPath,
                  eventCount: sib.eventCount,
                  userId: sib.userId,
                  locationLabel: sib.lastCity || '未知'
                })"
              >
                {{ shortAdminId(sib.id, 10) }} · <span :title="sib.lastPath || ''">{{ adminPathLabel(sib.lastPath) }}</span>
              </button>
              <span class="text-zinc-500 dark:text-zinc-400">{{ formatAdminRelativeTime(sib.lastSeenAt) }} · {{ sib.eventCount }} 次操作</span>
            </li>
          </ul>
        </div>

        <div
          v-if="visitorDossier.sessions?.length || visitorDossier.evidenceLedger?.length || visitorDossier.playbook?.length"
          class="grid gap-3 lg:grid-cols-3"
        >
          <section class="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <h3 class="text-xs font-semibold text-indigo-950">最近访问过程</h3>
            <ul class="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              <li v-for="session in visitorDossier.sessions" :key="session.id" class="rounded-md bg-white dark:bg-zinc-900 px-2 py-1.5 text-[11px]">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-zinc-500 dark:text-zinc-400">{{ formatAdminRelativeTime(session.startAt) }}</span>
                  <span class="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{{ session.eventCount }} 次操作</span>
                </div>
                <p class="mt-0.5 truncate text-zinc-600 dark:text-zinc-300" :title="`${session.entryPath} → ${session.exitPath}`">{{ adminPathTransitionLabel(session.entryPath, session.exitPath) }}</p>
                <p class="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">{{ session.uniquePathCount }} 个页面 · {{ session.durationSeconds }} 秒</p>
              </li>
              <li v-if="!visitorDossier.sessions?.length" class="text-[11px] text-zinc-400 dark:text-zinc-500">暂无访问过程</li>
            </ul>
          </section>
          <section class="rounded-lg border border-rose-100 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/40 p-3">
            <h3 class="text-xs font-semibold text-rose-950">判断依据</h3>
            <ul class="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              <li v-for="item in visitorDossier.evidenceLedger" :key="'ve-' + item.code" class="text-[11px]">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate font-medium text-zinc-800 dark:text-zinc-100">{{ item.message }}</span>
                  <span class="shrink-0 rounded-full bg-white dark:bg-zinc-900 px-1.5 py-0.5 text-[10px] text-rose-800">
                    {{ adminLabel(adminEvidenceStrengthLabels, item.strength, item.strength) }} · 参考分 {{ item.weight }}
                  </span>
                </div>
              </li>
              <li v-if="!visitorDossier.evidenceLedger?.length" class="text-[11px] text-zinc-400 dark:text-zinc-500">暂无判断依据</li>
            </ul>
          </section>
          <section class="rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/40 p-3">
            <h3 class="text-xs font-semibold text-emerald-950 dark:text-emerald-300">处理建议</h3>
            <ol class="mt-2 max-h-48 space-y-2 overflow-y-auto">
              <li v-for="step in visitorDossier.playbook" :key="'vpb-' + step.code" class="text-[11px]">
                <NuxtLink :to="step.href" class="block rounded-md bg-white dark:bg-zinc-900 px-2 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium text-zinc-900 dark:text-zinc-100">{{ step.step }}. {{ adminLabel(adminInvestigationStepLabels, step.code, step.title) }}</span>
                    <span class="shrink-0 text-[10px] text-emerald-800 dark:text-emerald-300">{{ adminLabel(adminPlaybookStatusLabels, step.status, step.status) }}</span>
                  </div>
                  <p class="mt-0.5 line-clamp-2 text-zinc-500 dark:text-zinc-400">{{ step.detail }}</p>
                </NuxtLink>
              </li>
            </ol>
          </section>
        </div>
      </div>

      <div
        v-if="eventsLoading"
        class="py-6 text-sm text-zinc-400 dark:text-zinc-500"
      >
        加载中…
      </div>
      <div
        v-else
        class="mt-3 max-h-[28rem] space-y-4 overflow-y-auto"
      >
        <div
          v-if="eventActionSummary.length"
          class="flex flex-wrap gap-1.5 rounded-xl border border-sky-100 dark:border-sky-900 bg-white dark:bg-zinc-900 px-3 py-2"
        >
          <span class="w-full text-[11px] font-medium text-sky-900 dark:text-sky-300">本页操作摘要</span>
          <span
            v-for="row in eventActionSummary"
            :key="row.action"
            class="rounded-full bg-sky-50 dark:bg-sky-950 px-2 py-0.5 text-[11px] text-sky-800"
          >
            {{ row.label }} {{ row.count }}
          </span>
        </div>
        <div
          v-for="group in eventGroups"
          :key="group.day"
        >
          <p class="sticky top-0 z-[1] mb-2 bg-sky-50/90 py-1 text-xs font-semibold text-sky-900 dark:text-sky-300 backdrop-blur">
            {{ group.day }} · {{ group.items.length }} 条
          </p>
          <ul class="space-y-2">
            <li
              v-for="event in group.items"
              :key="event.id"
              class="rounded-xl border border-white bg-white dark:bg-zinc-900 px-3 py-3 text-sm shadow-sm"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-800 dark:text-zinc-100">
                    {{ actionLabel(event.action) }}
                  </span>
                  <span class="rounded-full bg-zinc-50 dark:bg-zinc-800/60 px-2 py-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {{ event.action }}
                  </span>
                  <span
                    v-if="event.method"
                    class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                  >
                    {{ methodLabel(event.method) }}
                  </span>
                  <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ formatAdminRelativeTime(event.createdAt) }} · {{ formatTime(event.createdAt) }}</span>
                </div>
                <div class="flex flex-wrap gap-1">
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    :disabled="!event.ip && !selectedVisitor?.lastIp"
                    @click="prepBanFromEvent(event, 'ip')"
                  >
                    封此 IP
                  </UButton>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="prepBanFromEvent(event, 'visitor')"
                  >
                    封访客
                  </UButton>
                </div>
              </div>
              <p class="mt-2 break-all text-sm text-zinc-800 dark:text-zinc-100">
                {{ event.path || '—' }}
              </p>
              <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {{ event.ip || '—' }} · {{ eventLocation(event) }}
              </p>
              <dl
                v-if="event.meta && Object.keys(event.meta).length"
                class="mt-2 space-y-1 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 p-2"
              >
                <div
                  v-for="item in prettyAdminDetails(event.meta)"
                  :key="item.key"
                  class="grid gap-1 sm:grid-cols-[6rem_minmax(0,1fr)]"
                >
                  <dt class="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    {{ item.key }}
                  </dt>
                  <dd class="break-all text-[11px] leading-5 text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">
                    {{ item.value }}
                  </dd>
                </div>
              </dl>
            </li>
          </ul>
        </div>
        <p
          v-if="!events.length"
          class="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500"
        >
          暂无操作记录
        </p>
      </div>
    </section>
  </div>
</template>
