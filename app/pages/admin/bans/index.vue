<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'
import {
  adminAuditHref,
  adminBanScopeLabels,
  adminEntityHref,
  adminLabel,
  banStatusMeta,
  confirmAdminAction,
  formatAdminDateTime,
  shortAdminId
} from '~~/app/utils/admin-security-labels'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '封禁管理', robots: 'noindex, nofollow' })

type BanRow = {
  id: string
  scope: string
  value: string
  reason: string
  isActive: boolean
  bannedByAdminId?: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt?: string | null
}

const toast = useToast()
const route = useRoute()
const loading = ref(false)
const creating = ref(false)
const errorMessage = ref('')
const items = ref<BanRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 30
const selectedBan = ref<BanRow | null>(null)

const active = ref<'true' | 'false' | 'all'>('true')
const scope = ref<'all' | 'ip' | 'visitor' | 'user'>('all')
const q = ref('')

const form = reactive({
  scope: 'ip' as 'ip' | 'visitor' | 'user',
  value: '',
  reason: '',
  expiresAt: ''
})

const statusCounts = computed(() => {
  let activeN = 0
  let expiredN = 0
  let inactiveN = 0
  for (const ban of items.value) {
    const tone = banStatusMeta(ban).tone
    if (tone === 'active') activeN += 1
    else if (tone === 'expired') expiredN += 1
    else inactiveN += 1
  }
  return { activeN, expiredN, inactiveN }
})

function formatTime(iso: string | null | undefined): string {
  return formatAdminDateTime(iso)
}

function statusClass(tone: 'active' | 'expired' | 'inactive'): string {
  if (tone === 'active') return 'bg-emerald-50 text-emerald-700'
  if (tone === 'expired') return 'bg-amber-50 text-amber-700'
  return 'bg-zinc-100 text-zinc-600'
}

async function handleAuth(error: unknown): Promise<boolean> {
  if (!isAuthorizationError(error)) return false
  await navigateTo('/admin/login', { replace: true })
  return true
}

async function loadBans(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const payload = await adminFetch<{ items: BanRow[]; total: number }>('/api/admin/visitors/bans', {
      query: {
        page: page.value,
        pageSize,
        active: active.value,
        scope: scope.value === 'all' ? undefined : scope.value,
        q: q.value.trim() || undefined
      }
    })
    items.value = payload.items || []
    total.value = payload.total || 0
  } catch (error) {
    if (await handleAuth(error)) return
    errorMessage.value = getRequestMessage(error, '封禁列表加载失败')
  } finally {
    loading.value = false
  }
}

function applySearch(): void {
  page.value = 1
  void loadBans()
}

function applyPreset(nextActive: 'true' | 'false' | 'all', nextScope: 'all' | 'ip' | 'visitor' | 'user' = 'all'): void {
  active.value = nextActive
  scope.value = nextScope
  page.value = 1
  void loadBans()
}

async function createBan(): Promise<void> {
  if (!form.value.trim()) {
    toast.add({ title: '请填写封禁值（IP / 访客编号 / 账号编号）', color: 'warning' })
    return
  }
  if (!form.reason.trim()) {
    toast.add({ title: '请填写封禁原因（必填）', color: 'warning' })
    return
  }
  if (!confirmAdminAction(`确认创建封禁 ${adminLabel(adminBanScopeLabels, form.scope)} · ${form.value.trim()}？`)) return
  creating.value = true
  try {
    await adminFetch('/api/admin/visitors/bans', {
      method: 'POST',
      body: {
        scope: form.scope,
        value: form.value.trim(),
        reason: form.reason.trim(),
        expiresAt: form.expiresAt.trim()
          ? new Date(form.expiresAt.trim()).toISOString()
          : null
      }
    })
    toast.add({ title: '已创建封禁', color: 'success' })
    form.value = ''
    form.reason = ''
    form.expiresAt = ''
    page.value = 1
    active.value = 'true'
    await loadBans()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '创建封禁失败'), color: 'error' })
  } finally {
    creating.value = false
  }
}

async function deactivateBan(id: string): Promise<void> {
  if (!confirmAdminAction('确认解除该封禁？解除后相关访客或账号可立即访问。')) return
  try {
    await adminFetch(`/api/admin/visitors/bans/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
    toast.add({ title: '已解除封禁', color: 'success' })
    if (selectedBan.value?.id === id) selectedBan.value = null
    await loadBans()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '解除失败'), color: 'error' })
  }
}

function openBanDetail(ban: BanRow): void {
  selectedBan.value = ban
}

function closeBanDetail(): void {
  selectedBan.value = null
}

function relatedVisitorHref(ban: BanRow): string | null {
  if (ban.scope === 'visitor') return adminEntityHref('visitor', ban.value)
  if (ban.scope === 'user') return adminEntityHref('user', ban.value)
  if (ban.scope === 'ip') return `/admin/visitors?ip=${encodeURIComponent(ban.value)}`
  return null
}

function banReasonText(reason: string): string {
  if (reason === 'crawler_honeypot') return '系统自动限制：访问到了仅用于识别自动抓取的隐藏地址。该限制为临时措施，到期后不会继续拦截。'
  return reason || '未填写原因'
}

function isAutomaticHoneypotBan(ban: BanRow): boolean {
  return ban.reason === 'crawler_honeypot'
}

onMounted(async () => {
  const activeQuery = typeof route.query.active === 'string' ? route.query.active : ''
  const scopeQuery = typeof route.query.scope === 'string' ? route.query.scope : ''
  const qQuery = typeof route.query.q === 'string' ? route.query.q : ''
  const ipQuery = typeof route.query.ip === 'string' ? route.query.ip : ''
  if (activeQuery === 'true' || activeQuery === 'false' || activeQuery === 'all') active.value = activeQuery
  if (scopeQuery === 'ip' || scopeQuery === 'visitor' || scopeQuery === 'user') scope.value = scopeQuery
  if (qQuery) q.value = qQuery
  else if (ipQuery) q.value = ipQuery
  await loadBans()
  const banIdQuery = typeof route.query.banId === 'string' ? route.query.banId : ''
  if (banIdQuery) {
    const hit = items.value.find(row => row.id === banIdQuery)
    if (hit) selectedBan.value = hit
    else {
      try {
        const payload = await adminFetch<{ items: BanRow[] }>('/api/admin/visitors/bans', {
          query: { page: 1, pageSize: 1, id: banIdQuery }
        })
        selectedBan.value = payload.items?.[0] || null
      } catch (error) {
        if (!(await handleAuth(error))) toast.add({ title: '封禁详情加载失败', color: 'error' })
      }
    }
  }
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <AdminPageHeader
      title="封禁管理"
      description="按状态、类型和关键词查找并管理 IP、访客和账号封禁。原因必填，可设置到期时间。"
      icon="i-lucide-shield-ban"
      eyebrow="安全与操作记录"
    >
      <template #actions>
        <UButton
          to="/admin/visitors"
          icon="i-lucide-radar"
          label="访客轨迹"
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
          @click="loadBans"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="errorMessage"
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {{ errorMessage }}
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton
        size="sm"
        :color="active === 'true' && !scope ? 'primary' : 'neutral'"
        :variant="active === 'true' && !scope ? 'solid' : 'soft'"
        @click="applyPreset('true')"
      >
        生效中
      </UButton>
      <UButton
        size="sm"
        :color="active === 'false' ? 'primary' : 'neutral'"
        :variant="active === 'false' ? 'solid' : 'soft'"
        @click="applyPreset('false')"
      >
        已解除
      </UButton>
      <UButton
        size="sm"
        :color="active === 'all' && !scope ? 'primary' : 'neutral'"
        :variant="active === 'all' && !scope ? 'solid' : 'soft'"
        @click="applyPreset('all')"
      >
        全部状态
      </UButton>
      <UButton
        size="sm"
        :color="scope === 'ip' ? 'primary' : 'neutral'"
        :variant="scope === 'ip' ? 'solid' : 'soft'"
        @click="applyPreset(active, 'ip')"
      >
        仅 IP
      </UButton>
      <UButton
        size="sm"
        :color="scope === 'visitor' ? 'primary' : 'neutral'"
        :variant="scope === 'visitor' ? 'solid' : 'soft'"
        @click="applyPreset(active, 'visitor')"
      >
        仅访客
      </UButton>
      <UButton
        size="sm"
        :color="scope === 'user' ? 'primary' : 'neutral'"
        :variant="scope === 'user' ? 'solid' : 'soft'"
        @click="applyPreset(active, 'user')"
      >
        仅账号
      </UButton>
    </div>

    <div class="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <section class="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 class="font-semibold text-zinc-950">
          新建封禁
        </h2>
        <div class="mt-3 space-y-3">
          <UFormField label="范围">
            <USelect
              v-model="form.scope"
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
              v-model="form.value"
              class="w-full"
              placeholder="IP / 访客编号 / 账号编号"
            />
          </UFormField>
          <UFormField label="原因（必填）">
            <UInput
              v-model="form.reason"
              class="w-full"
              placeholder="例如：频繁访问 / 骚扰聊天"
            />
          </UFormField>
          <UFormField label="到期时间（可选）">
            <UInput
              v-model="form.expiresAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
          <UButton
            color="error"
            icon="i-lucide-ban"
            :loading="creating"
            @click="createBan"
          >
            确认封禁
          </UButton>
        </div>
      </section>

      <section class="rounded-2xl border border-zinc-200 bg-white p-4">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField
            label="状态"
            class="min-w-[8rem]"
          >
            <USelect
              v-model="active"
              :items="[
                { label: '生效中', value: 'true' },
                { label: '已解除', value: 'false' },
                { label: '全部', value: 'all' }
              ]"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="范围"
            class="min-w-[8rem]"
          >
            <USelect
              v-model="scope"
              :items="[
                { label: '全部范围', value: 'all' },
                { label: 'IP', value: 'ip' },
                { label: '访客', value: 'visitor' },
                { label: '账号', value: 'user' }
              ]"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="关键词"
            class="min-w-[12rem] flex-1"
          >
            <UInput
              v-model="q"
              class="w-full"
              placeholder="值 / 原因"
              @keyup.enter="applySearch"
            />
          </UFormField>
          <UButton
            color="primary"
            icon="i-lucide-search"
            :loading="loading"
            @click="applySearch"
          >
            查询
          </UButton>
        </div>

        <p class="mt-3 text-xs text-zinc-500">
          本页：生效 {{ statusCounts.activeN }} · 过期 {{ statusCounts.expiredN }} · 已解除 {{ statusCounts.inactiveN }}
        </p>

        <ul class="mt-4 max-h-[36rem] space-y-2 overflow-y-auto">
          <li
            v-for="ban in items"
            :key="ban.id"
            class="rounded-xl border px-3 py-3 text-sm"
            :class="selectedBan?.id === ban.id ? 'border-red-300 bg-red-50/40' : 'border-zinc-100'"
          >
            <div class="flex items-start justify-between gap-2">
              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                @click="openBanDetail(ban)"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-medium text-zinc-900">
                    {{ adminLabel(adminBanScopeLabels, ban.scope) }} · {{ ban.value }}
                  </p>
                  <span
                    class="rounded-full px-2 py-0.5 text-[11px]"
                    :class="statusClass(banStatusMeta(ban).tone)"
                  >
                    {{ banStatusMeta(ban).label }}
                  </span>
                </div>
                <p class="mt-1 text-xs text-zinc-500">
                  创建 {{ formatTime(ban.createdAt) }}
                  <template v-if="ban.expiresAt"> · 到期 {{ formatTime(ban.expiresAt) }}</template>
                  <template v-else> · 永久</template>
                </p>
                <p class="mt-1 text-xs text-zinc-700">
                  原因：{{ ban.reason || '—' }}
                </p>
                <p class="mt-1 break-all text-[11px] text-zinc-400">
                  封禁记录 {{ shortAdminId(ban.id, 10) }}
                  <template v-if="ban.bannedByAdminId"> · 管理员 {{ shortAdminId(ban.bannedByAdminId, 10) }}</template>
                </p>
              </button>
              <div class="flex shrink-0 flex-col gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="openBanDetail(ban)"
                >
                  详情
                </UButton>
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
            v-if="!items.length && !loading"
            class="py-10 text-center text-sm text-zinc-400"
          >
            暂无封禁记录
          </li>
        </ul>

        <div class="mt-3 flex items-center justify-between text-sm text-zinc-500">
          <span>共 {{ total }} 条 · 第 {{ page }} 页</span>
          <div class="flex gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="page <= 1"
              @click="page -= 1; loadBans()"
            >
              上一页
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="page * pageSize >= total"
              @click="page += 1; loadBans()"
            >
              下一页
            </UButton>
          </div>
        </div>
      </section>
    </div>

    <section
      v-if="selectedBan"
      class="rounded-2xl border border-red-200 bg-red-50/30 p-4"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="font-semibold text-zinc-950">
            封禁详情 · {{ adminLabel(adminBanScopeLabels, selectedBan.scope) }}
          </h2>
          <p class="mt-1 break-all text-sm text-zinc-700">
            {{ selectedBan.value }}
          </p>
          <p
            v-if="isAutomaticHoneypotBan(selectedBan)"
            class="mt-2 max-w-2xl text-xs leading-5 text-amber-800"
          >
            这是系统自动生成的临时限制记录，不是管理员手动封禁。
          </p>
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          @click="closeBanDetail"
        >
          关闭
        </UButton>
      </div>
      <dl class="mt-3 grid gap-2 sm:grid-cols-2">
        <div class="rounded-xl border border-white bg-white px-3 py-2">
          <dt class="text-[11px] text-zinc-500">状态</dt>
          <dd class="text-sm font-medium text-zinc-900">{{ banStatusMeta(selectedBan).label }}</dd>
        </div>
        <div class="rounded-xl border border-white bg-white px-3 py-2">
          <dt class="text-[11px] text-zinc-500">原因</dt>
          <dd class="text-sm text-zinc-800">{{ banReasonText(selectedBan.reason) }}</dd>
        </div>
        <div class="rounded-xl border border-white bg-white px-3 py-2">
          <dt class="text-[11px] text-zinc-500">创建时间</dt>
          <dd class="text-sm text-zinc-800">{{ formatTime(selectedBan.createdAt) }}</dd>
        </div>
        <div class="rounded-xl border border-white bg-white px-3 py-2">
          <dt class="text-[11px] text-zinc-500">到期</dt>
          <dd class="text-sm text-zinc-800">{{ selectedBan.expiresAt ? formatTime(selectedBan.expiresAt) : '永久' }}</dd>
        </div>
        <div class="rounded-xl border border-white bg-white px-3 py-2">
          <dt class="text-[11px] text-zinc-500">操作管理员编号</dt>
          <dd class="text-sm text-zinc-800">{{ selectedBan.bannedByAdminId ? shortAdminId(selectedBan.bannedByAdminId, 12) : '—' }}</dd>
        </div>
        <div class="rounded-xl border border-white bg-white px-3 py-2">
          <dt class="text-[11px] text-zinc-500">封禁记录编号</dt>
          <dd class="text-sm text-zinc-800">{{ shortAdminId(selectedBan.id, 12) }}</dd>
        </div>
      </dl>
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          :to="adminAuditHref('visitor_ban', selectedBan.id)"
          icon="i-lucide-scroll-text"
        >
                  查看相关操作记录
        </UButton>
        <UButton
          v-if="relatedVisitorHref(selectedBan)"
          size="sm"
          color="neutral"
          variant="outline"
          :to="relatedVisitorHref(selectedBan) || undefined"
          icon="i-lucide-radar"
        >
          关联访客/账号
        </UButton>
        <UButton
          v-if="selectedBan.isActive"
          size="sm"
          color="error"
          variant="soft"
          @click="deactivateBan(selectedBan.id)"
        >
          解除封禁
        </UButton>
      </div>
    </section>
  </div>
</template>
