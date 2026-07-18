<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'
import {
  adminAuditHref,
  adminBanScopeLabels,
  adminLabel,
  banStatusMeta,
  confirmAdminAction,
  formatAdminDateTime,
  groupByAdminDay,
  prettyAdminDetails
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

const selectedVisitor = ref<VisitorRow | null>(null)
const events = ref<VisitorEvent[]>([])
const eventTotal = ref(0)
const bans = ref<BanRow[]>([])
const banScope = ref<'ip' | 'visitor' | 'user'>('ip')
const banValue = ref('')
const banReason = ref('')
const banExpiresAt = ref('')

const bannedCountOnPage = computed(() => items.value.filter(row => row.isBanned).length)
const activeBanCount = computed(() => bans.value.filter(row => banStatusMeta(row).tone === 'active').length)

function formatTime(iso: string | null | undefined): string {
  return formatAdminDateTime(iso)
}

function shortUa(ua: string | null | undefined): string {
  if (!ua) return '—'
  return ua.length > 72 ? `${ua.slice(0, 72)}…` : ua
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
  banReason.value = event.path ? `来自事件 ${event.action} · ${event.path}` : ''
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
    const payload = await adminFetch<{ items: VisitorRow[]; total: number }>('/api/admin/visitors', {
      query: {
        page: page.value,
        pageSize,
        q: q.value.trim() || undefined,
        ip: ip.value.trim() || undefined,
        banned: banned.value === 'all' ? undefined : banned.value
      }
    })
    items.value = payload.items || []
    total.value = payload.total || 0
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
  try {
    const payload = await adminFetch<{ items: VisitorEvent[]; total: number }>(
      `/api/admin/visitors/${encodeURIComponent(row.id)}/events`,
      { query: { page: 1, pageSize: 60 } }
    )
    events.value = payload.items || []
    eventTotal.value = payload.total || events.value.length
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '操作记录加载失败'), color: 'error' })
  } finally {
    eventsLoading.value = false
  }
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
      description="按 IP / 地点 / 路径检索访客；可看详细事件抽屉，并快速封禁（支持到期时间）。完整封禁治理见「封禁」页。"
      icon="i-lucide-radar"
      eyebrow="安全与审计"
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
          label="审计日志"
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
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {{ errorMessage }}
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
        <p class="text-xs text-zinc-500">
          当前筛选结果
        </p>
        <p class="mt-1 text-2xl font-semibold text-zinc-950">
          {{ total }}
        </p>
      </div>
      <div class="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
        <p class="text-xs text-zinc-500">
          本页已封禁访客
        </p>
        <p class="mt-1 text-2xl font-semibold text-rose-700">
          {{ bannedCountOnPage }}
        </p>
      </div>
      <div class="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
        <p class="text-xs text-zinc-500">
          生效中封禁（侧栏）
        </p>
        <p class="mt-1 text-2xl font-semibold text-amber-700">
          {{ activeBanCount }}
        </p>
      </div>
    </div>

    <div class="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <UFormField label="关键词">
        <UInput
          v-model="q"
          placeholder="IP / 城市 / 路径 / 访客 ID"
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

    <div class="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-zinc-50 text-xs text-zinc-500">
          <tr>
            <th class="px-3 py-3 font-medium">最近访问</th>
            <th class="px-3 py-3 font-medium">IP / 地点</th>
            <th class="px-3 py-3 font-medium">路径 / UA</th>
            <th class="px-3 py-3 font-medium">事件</th>
            <th class="px-3 py-3 font-medium">状态</th>
            <th class="px-3 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in items"
            :key="row.id"
            class="border-t border-zinc-100 align-top"
            :class="selectedVisitor?.id === row.id ? 'bg-sky-50/40' : ''"
          >
            <td class="px-3 py-3 whitespace-nowrap text-zinc-700">
              {{ formatTime(row.lastSeenAt) }}
              <div class="mt-1 text-[11px] text-zinc-400">
                首次 {{ formatTime(row.firstSeenAt) }}
              </div>
            </td>
            <td class="px-3 py-3">
              <div class="font-medium text-zinc-900">
                {{ row.lastIp || '—' }}
              </div>
              <div class="text-xs text-zinc-500">
                {{ row.locationLabel }}
              </div>
              <div class="mt-1 break-all text-[11px] text-zinc-400">
                访客 {{ row.id }}
              </div>
              <div
                v-if="row.userId"
                class="mt-1 break-all text-[11px] text-sky-600"
              >
                账号 {{ row.userId }}
              </div>
            </td>
            <td class="px-3 py-3">
              <div class="text-xs text-zinc-700">
                {{ row.lastPath || '—' }}
              </div>
              <div class="mt-1 break-all text-[11px] text-zinc-400">
                {{ shortUa(row.lastUserAgent) }}
              </div>
            </td>
            <td class="px-3 py-3 font-medium text-zinc-800">
              {{ row.eventCount }}
            </td>
            <td class="px-3 py-3">
              <span
                class="rounded-full px-2 py-0.5 text-xs"
                :class="row.isBanned ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'"
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
                  事件详情
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
              class="px-3 py-10 text-center text-sm text-zinc-400"
            >
              暂无访客数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between text-sm text-zinc-500">
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
        class="rounded-2xl border border-zinc-200 bg-white p-4"
      >
        <h2 class="font-semibold text-zinc-950">
          快速封禁
        </h2>
        <p class="mt-1 text-xs text-zinc-500">
          原因必填；可选到期时间。创建后会写入审计日志。
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
              placeholder="IP / 访客 ID / 账号 ID"
            />
          </UFormField>
          <UFormField label="原因（必填）">
            <UInput
              v-model="banReason"
              class="w-full"
              placeholder="例如：恶意刷接口 / 异常爬取"
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

      <section class="rounded-2xl border border-zinc-200 bg-white p-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-zinc-950">
              生效中封禁（最近 30 条）
            </h2>
            <p class="mt-1 text-xs text-zinc-500">
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
            class="rounded-xl border border-zinc-100 px-3 py-2 text-sm"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="font-medium text-zinc-900">
                  {{ adminLabel(adminBanScopeLabels, ban.scope) }} · {{ ban.value }}
                </p>
                <p class="text-xs text-zinc-500">
                  <span
                    :class="{
                      'text-emerald-700': banStatusMeta(ban).tone === 'active',
                      'text-amber-700': banStatusMeta(ban).tone === 'expired',
                      'text-zinc-500': banStatusMeta(ban).tone === 'inactive'
                    }"
                  >{{ banStatusMeta(ban).label }}</span>
                  · {{ formatTime(ban.createdAt) }}
                  <template v-if="ban.expiresAt"> · 到期 {{ formatTime(ban.expiresAt) }}</template>
                </p>
                <p
                  v-if="ban.reason"
                  class="mt-1 text-xs text-zinc-600"
                >
                  {{ ban.reason }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :to="adminAuditHref('visitor_ban', ban.id)"
                >
                  审计
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
            class="py-6 text-center text-sm text-zinc-400"
          >
            暂无生效封禁
          </li>
        </ul>
      </section>
    </div>

    <section
      v-if="selectedVisitor"
      class="rounded-2xl border border-sky-200 bg-sky-50/30 p-4"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="font-semibold text-zinc-950">
            事件详情 · {{ selectedVisitor.lastIp || selectedVisitor.id }}
          </h2>
          <p class="mt-1 text-xs text-zinc-500">
            {{ selectedVisitor.locationLabel }} · 共 {{ eventTotal }} 条事件 · 访客 ID {{ selectedVisitor.id }}
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
            @click="selectedVisitor = null"
          >
            关闭
          </UButton>
        </div>
      </div>

      <div
        v-if="eventsLoading"
        class="py-6 text-sm text-zinc-400"
      >
        加载中…
      </div>
      <div
        v-else
        class="mt-3 max-h-[28rem] space-y-4 overflow-y-auto"
      >
        <div
          v-for="group in eventGroups"
          :key="group.day"
        >
          <p class="sticky top-0 z-[1] mb-2 bg-sky-50/90 py-1 text-xs font-semibold text-sky-900 backdrop-blur">
            {{ group.day }} · {{ group.items.length }} 条
          </p>
          <ul class="space-y-2">
            <li
              v-for="event in group.items"
              :key="event.id"
              class="rounded-xl border border-white bg-white px-3 py-3 text-sm shadow-sm"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800">
                    {{ event.action }}
                  </span>
                  <span
                    v-if="event.method"
                    class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                  >
                    {{ event.method }}
                  </span>
                  <span class="text-xs text-zinc-500">{{ formatTime(event.createdAt) }}</span>
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
              <p class="mt-2 break-all text-sm text-zinc-800">
                {{ event.path || '—' }}
              </p>
              <p class="mt-1 text-xs text-zinc-500">
                {{ event.ip || '—' }} · {{ eventLocation(event) }}
              </p>
              <dl
                v-if="event.meta && Object.keys(event.meta).length"
                class="mt-2 space-y-1 rounded-lg bg-zinc-50 p-2"
              >
                <div
                  v-for="item in prettyAdminDetails(event.meta)"
                  :key="item.key"
                  class="grid gap-1 sm:grid-cols-[6rem_minmax(0,1fr)]"
                >
                  <dt class="text-[11px] font-medium text-zinc-500">
                    {{ item.key }}
                  </dt>
                  <dd class="break-all text-[11px] leading-5 text-zinc-700 whitespace-pre-wrap">
                    {{ item.value }}
                  </dd>
                </div>
              </dl>
            </li>
          </ul>
        </div>
        <p
          v-if="!events.length"
          class="py-6 text-center text-sm text-zinc-400"
        >
          暂无事件
        </p>
      </div>
    </section>
  </div>
</template>
