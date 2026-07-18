<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'
import {
  adminBanScopeLabels,
  adminLabel,
  banStatusMeta,
  formatAdminDateTime
} from '~~/app/utils/admin-security-labels'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '封禁管理', robots: 'noindex, nofollow' })

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
const creating = ref(false)
const errorMessage = ref('')
const items = ref<BanRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 30

const active = ref<'true' | 'false' | 'all'>('true')
const scope = ref<'' | 'ip' | 'visitor' | 'user'>('')
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
        scope: scope.value || undefined,
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

function applyPreset(nextActive: 'true' | 'false' | 'all', nextScope: '' | 'ip' | 'visitor' | 'user' = ''): void {
  active.value = nextActive
  scope.value = nextScope
  page.value = 1
  void loadBans()
}

async function createBan(): Promise<void> {
  if (!form.value.trim()) {
    toast.add({ title: '请填写封禁值（IP / 访客 ID / 账号 ID）', color: 'warning' })
    return
  }
  if (!form.reason.trim()) {
    toast.add({ title: '请填写封禁原因（必填）', color: 'warning' })
    return
  }
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

onMounted(() => {
  void loadBans()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <AdminPageHeader
      title="封禁管理"
      description="按状态、范围与关键词治理 IP / 访客 / 账号封禁；创建原因必填，支持到期时间。"
      icon="i-lucide-shield-ban"
      eyebrow="安全与审计"
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
              placeholder="IP / 访客 ID / 账号 ID"
            />
          </UFormField>
          <UFormField label="原因（必填）">
            <UInput
              v-model="form.reason"
              class="w-full"
              placeholder="例如：恶意刷接口 / 骚扰聊天"
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
                { label: '全部范围', value: '' },
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
            class="rounded-xl border border-zinc-100 px-3 py-3 text-sm"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
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
                  ID {{ ban.id }}
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
  </div>
</template>
