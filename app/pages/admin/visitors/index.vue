<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '访客与封禁', robots: 'noindex, nofollow' })

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
  locationLabel: string
}

type VisitorEvent = {
  id: string
  action: string
  path: string | null
  ip: string | null
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
const loading = ref(false)
const banLoading = ref(false)
const eventsLoading = ref(false)
const errorMessage = ref('')
const items = ref<VisitorRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const q = ref('')
const ip = ref('')

const selectedVisitor = ref<VisitorRow | null>(null)
const events = ref<VisitorEvent[]>([])
const bans = ref<BanRow[]>([])
const banScope = ref<'ip' | 'visitor' | 'user'>('ip')
const banValue = ref('')
const banReason = ref('')

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(iso))
  } catch {
    return iso
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
        ip: ip.value.trim() || undefined
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
      query: { page: 1, pageSize: 50 }
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
    const payload = await adminFetch<{ items: VisitorEvent[] }>(
      `/api/admin/visitors/${encodeURIComponent(row.id)}/events`,
      { query: { page: 1, pageSize: 40 } }
    )
    events.value = payload.items || []
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
}

async function createBan(): Promise<void> {
  if (!banValue.value.trim()) {
    toast.add({ title: '请填写封禁值', color: 'warning' })
    return
  }
  try {
    await adminFetch('/api/admin/visitors/bans', {
      method: 'POST',
      body: {
        scope: banScope.value,
        value: banValue.value.trim(),
        reason: banReason.value.trim() || undefined
      }
    })
    toast.add({ title: '已添加封禁', color: 'success' })
    banReason.value = ''
    await loadBans()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '封禁失败'), color: 'error' })
  }
}

async function deactivateBan(id: string): Promise<void> {
  try {
    await adminFetch(`/api/admin/visitors/bans/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
    toast.add({ title: '已解除封禁', color: 'success' })
    await loadBans()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '解除失败'), color: 'error' })
  }
}

function applySearch(): void {
  page.value = 1
  void loadVisitors()
}

onMounted(() => {
  void loadVisitors()
  void loadBans()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <AdminPageHeader
      title="访客与封禁"
      description="记录访客 IP、地点与操作；可按 IP / 访客 / 账号封禁。"
      icon="i-lucide-radar"
      eyebrow="运营安全"
    >
      <template #actions>
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

    <div class="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-3">
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
          placeholder="可选"
          class="w-full"
          @keyup.enter="applySearch"
        />
      </UFormField>
      <div class="flex items-end">
        <UButton
          color="primary"
          icon="i-lucide-search"
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
            <th class="px-3 py-3 font-medium">路径</th>
            <th class="px-3 py-3 font-medium">事件</th>
            <th class="px-3 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in items"
            :key="row.id"
            class="border-t border-zinc-100 align-top"
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
                {{ row.id }}
              </div>
            </td>
            <td class="px-3 py-3 text-xs text-zinc-600">
              {{ row.lastPath || '—' }}
            </td>
            <td class="px-3 py-3">
              {{ row.eventCount }}
            </td>
            <td class="px-3 py-3">
              <div class="flex flex-wrap gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  @click="openEvents(row)"
                >
                  记录
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
              </div>
            </td>
          </tr>
          <tr v-if="!items.length && !loading">
            <td
              colspan="5"
              class="px-3 py-10 text-center text-sm text-zinc-400"
            >
              暂无访客数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between text-sm text-zinc-500">
      <span>共 {{ total }} 条</span>
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
      <section class="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 class="font-semibold text-zinc-950">
          添加封禁
        </h2>
        <div class="mt-3 space-y-3">
          <UFormField label="范围">
            <USelect
              v-model="banScope"
              :items="[
                { label: 'IP', value: 'ip' },
                { label: '访客', value: 'visitor' },
                { label: '用户', value: 'user' }
              ]"
              class="w-full"
            />
          </UFormField>
          <UFormField label="值">
            <UInput
              v-model="banValue"
              class="w-full"
              placeholder="IP / 访客 ID / 用户 ID"
            />
          </UFormField>
          <UFormField label="原因">
            <UInput
              v-model="banReason"
              class="w-full"
              placeholder="可选"
            />
          </UFormField>
          <UButton
            color="error"
            icon="i-lucide-ban"
            @click="createBan"
          >
            确认封禁
          </UButton>
        </div>
      </section>

      <section class="rounded-2xl border border-zinc-200 bg-white p-4">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-zinc-950">
            封禁列表
          </h2>
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
        <ul class="mt-3 max-h-80 space-y-2 overflow-y-auto">
          <li
            v-for="ban in bans"
            :key="ban.id"
            class="rounded-xl border border-zinc-100 px-3 py-2 text-sm"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="font-medium text-zinc-900">
                  {{ ban.scope }} · {{ ban.value }}
                </p>
                <p class="text-xs text-zinc-500">
                  {{ ban.isActive ? '生效中' : '已解除' }} · {{ formatTime(ban.createdAt) }}
                </p>
                <p
                  v-if="ban.reason"
                  class="mt-1 text-xs text-zinc-600"
                >
                  {{ ban.reason }}
                </p>
              </div>
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
          </li>
          <li
            v-if="!bans.length"
            class="py-6 text-center text-sm text-zinc-400"
          >
            暂无封禁
          </li>
        </ul>
      </section>
    </div>

    <section
      v-if="selectedVisitor"
      class="rounded-2xl border border-zinc-200 bg-white p-4"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 class="font-semibold text-zinc-950">
          操作记录 · {{ selectedVisitor.lastIp || selectedVisitor.id }}
        </h2>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          @click="selectedVisitor = null"
        >
          关闭
        </UButton>
      </div>
      <div
        v-if="eventsLoading"
        class="py-6 text-sm text-zinc-400"
      >
        加载中…
      </div>
      <ul
        v-else
        class="mt-3 max-h-96 space-y-2 overflow-y-auto"
      >
        <li
          v-for="event in events"
          :key="event.id"
          class="rounded-lg bg-zinc-50 px-3 py-2 text-sm"
        >
          <span class="font-medium text-zinc-900">{{ event.action }}</span>
          <span class="mx-2 text-zinc-300">·</span>
          <span class="text-zinc-600">{{ event.path || '—' }}</span>
          <div class="text-xs text-zinc-400">
            {{ formatTime(event.createdAt) }} · {{ event.ip || '—' }}
          </div>
        </li>
        <li
          v-if="!events.length"
          class="py-6 text-center text-sm text-zinc-400"
        >
          暂无事件
        </li>
      </ul>
    </section>
  </div>
</template>
