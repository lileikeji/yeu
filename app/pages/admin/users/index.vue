<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'
import {
  adminUserStatusLabels,
  adminLabel,
  adminAuditActionLabels,
  adminEvidenceStrengthLabels,
  adminInvestigationStepLabels,
  adminPlaybookStatusLabels,
  adminRiskFactorLabels,
  adminConfidenceLabels,
  adminSuggestedActionLabels,
  adminRiskLevelLabels,
  formatAdminDateTime,
  formatAdminRelativeTime,
  shortAdminId,
  confirmAdminAction,
  adminAuditHref
} from '~~/app/utils/admin-security-labels'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '账号管理', robots: 'noindex, nofollow' })

type AppUser = {
  id: string
  username: string
  displayName: string
  major: string | null
  dormBuilding: string | null
  status: 'active' | 'disabled' | 'banned' | string
  lastLoginAt: string | null
  createdAt: string
}

const route = useRoute()
const toast = useToast()
const loading = ref(false)
const creating = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const items = ref<AppUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const selectedUser = ref<AppUser | null>(null)
const focusUserId = ref('')
const dossierLoading = ref(false)
const dossierError = ref('')
const userDossier = ref<{
  summary: Record<string, number | string>
  riskScore?: number
  riskLevel?: string
  riskFactors?: Array<{ code: string; points: number; message: string }>
  confidence?: string
  evidenceEvents?: number
  suggestedActions?: Array<{ kind: string; label: string; href: string; reason: string; priority: string }>
  relationship?: { visitorIds?: string[]; ips?: string[]; rooms?: string[]; activeSessions?: number }
  evidenceLedger?: Array<{ code: string; kind: string; strength: string; weight: number; message: string }>
  playbook?: Array<{ step: number; code: string; status: string; title: string; detail: string; href: string }>
  investigationSummary?: Record<string, number>
  ipFootprint?: Array<{ ip: string; count: number; lastAt: string | null }>
  linkedVisitors: Array<Record<string, any>>
  bans: Array<Record<string, any>>
  mutes: Array<Record<string, any>>
  recentMessages: Array<Record<string, any>>
  auditItems: Array<Record<string, any>>
  memberships: Array<Record<string, any>>
} | null>(null)

const q = ref('')
const status = ref<string>('')
const major = ref('')
const dormBuilding = ref('')

const form = reactive({
  username: '',
  password: '',
  displayName: '',
  major: '',
  dormBuilding: ''
})

const editId = ref<string | null>(null)
const editForm = reactive({
  displayName: '',
  major: '',
  dormBuilding: '',
  status: 'active',
  password: ''
})

const statusSummary = computed(() => {
  const counts = { active: 0, disabled: 0, banned: 0, other: 0 }
  for (const row of items.value) {
    if (row.status === 'active') counts.active += 1
    else if (row.status === 'disabled') counts.disabled += 1
    else if (row.status === 'banned') counts.banned += 1
    else counts.other += 1
  }
  return counts
})

function formatTime(iso: string | null): string {
  return formatAdminDateTime(iso)
}

function statusLabel(value: string): string {
  return adminLabel(adminUserStatusLabels, value, value)
}

function statusClass(value: string): string {
  if (value === 'active') return 'bg-emerald-50 text-emerald-700'
  if (value === 'disabled') return 'bg-amber-50 text-amber-700'
  if (value === 'banned') return 'bg-red-50 text-red-700'
  return 'bg-zinc-100 text-zinc-600'
}

function riskToneClass(level: string | null | undefined): string {
  if (level === 'high') return 'bg-red-100 text-red-800'
  if (level === 'medium') return 'bg-amber-100 text-amber-900'
  if (level === 'low') return 'bg-sky-100 text-sky-900'
  return 'bg-zinc-100 text-zinc-700'
}

async function handleAuth(error: unknown): Promise<boolean> {
  if (!isAuthorizationError(error)) return false
  await navigateTo('/admin/login', { replace: true })
  return true
}

async function loadUserDossier(userId: string): Promise<void> {
  dossierLoading.value = true
  dossierError.value = ''
  try {
    const payload = await adminFetch<any>(`/api/admin/users/${encodeURIComponent(userId)}/security`)
    userDossier.value = {
      summary: payload.summary || {},
      riskScore: payload.riskScore ?? payload.summary?.riskScore,
      riskLevel: payload.riskLevel ?? payload.summary?.riskLevel,
      riskFactors: payload.riskFactors || [],
      ipFootprint: payload.ipFootprint || [],
      linkedVisitors: payload.linkedVisitors || [],
      bans: payload.bans || [],
      mutes: payload.mutes || [],
      recentMessages: payload.recentMessages || [],
      auditItems: payload.auditItems || [],
      memberships: payload.memberships || []
    }
    if (payload.user) {
      selectedUser.value = payload.user as AppUser
    }
  } catch (error) {
    if (await handleAuth(error)) return
    dossierError.value = getRequestMessage(error, '安全档案加载失败')
    userDossier.value = null
  } finally {
    dossierLoading.value = false
  }
}

function openUserDetail(row: AppUser): void {
  selectedUser.value = row
  focusUserId.value = row.id
  void loadUserDossier(row.id)
}

function closeUserDetail(): void {
  selectedUser.value = null
  userDossier.value = null
  dossierError.value = ''
}

function syncSelectedUser(): void {
  if (!focusUserId.value) return
  const hit = items.value.find(row => row.id === focusUserId.value)
  if (hit) {
    selectedUser.value = hit
    if (!userDossier.value || (userDossier.value as any)._userId !== hit.id) {
      void loadUserDossier(hit.id)
    }
  }
}

async function loadUsers(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const payload = await adminFetch<{ items: AppUser[]; total: number }>('/api/admin/users', {
      query: {
        page: page.value,
        pageSize,
        q: q.value.trim() || undefined,
        status: status.value || undefined,
        major: major.value.trim() || undefined,
        dormBuilding: dormBuilding.value.trim() || undefined
      }
    })
    items.value = payload.items || []
    total.value = payload.total || 0
    syncSelectedUser()
  } catch (error) {
    if (await handleAuth(error)) return
    errorMessage.value = getRequestMessage(error, '账号列表加载失败')
  } finally {
    loading.value = false
  }
}

function applySearch(): void {
  page.value = 1
  void loadUsers()
}

function applyStatusPreset(next: string): void {
  status.value = next
  page.value = 1
  void loadUsers()
}

async function createUser(): Promise<void> {
  if (!form.username.trim() || !form.password || !form.displayName.trim()) {
    toast.add({ title: '请填写账号、密码和显示名', color: 'warning' })
    return
  }
  if (form.password.length < 8) {
    toast.add({ title: '密码至少 8 位', color: 'warning' })
    return
  }
  creating.value = true
  try {
    await adminFetch('/api/admin/users', {
      method: 'POST',
      body: {
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim(),
        major: form.major.trim() || null,
        dormBuilding: form.dormBuilding.trim() || null
      }
    })
    toast.add({ title: '账号已创建', color: 'success' })
    form.username = ''
    form.password = ''
    form.displayName = ''
    form.major = ''
    form.dormBuilding = ''
    await loadUsers()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '创建失败'), color: 'error' })
  } finally {
    creating.value = false
  }
}

function startEdit(row: AppUser): void {
  openUserDetail(row)
  editId.value = row.id
  editForm.displayName = row.displayName
  editForm.major = row.major || ''
  editForm.dormBuilding = row.dormBuilding || ''
  editForm.status = row.status || 'active'
  editForm.password = ''
}

async function saveEdit(): Promise<void> {
  if (!editId.value) return
  if (!confirmAdminAction('确认保存该账号资料修改？')) return
  saving.value = true
  try {
    await adminFetch(`/api/admin/users/${encodeURIComponent(editId.value)}`, {
      method: 'PATCH',
      body: {
        displayName: editForm.displayName.trim(),
        major: editForm.major.trim() || null,
        dormBuilding: editForm.dormBuilding.trim() || null,
        status: editForm.status,
        password: editForm.password || undefined
      }
    })
    toast.add({ title: '已更新', color: 'success' })
    editId.value = null
    await loadUsers()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '更新失败'), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function quickStatus(row: AppUser, next: 'active' | 'disabled' | 'banned'): Promise<void> {
  if (row.status === next) return
  const labels = { active: '恢复正常', disabled: '停用', banned: '封禁' }
  if (!confirmAdminAction(`确认将 ${row.displayName}（${row.username}）设为「${labels[next]}」？`)) return
  try {
    await adminFetch(`/api/admin/users/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      body: { status: next }
    })
    toast.add({ title: `已${labels[next]}`, color: 'success' })
    await loadUsers()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '状态更新失败'), color: 'error' })
  }
}

onMounted(async () => {
  const userIdQuery = typeof route.query.userId === 'string' ? route.query.userId : ''
  if (userIdQuery) {
    focusUserId.value = userIdQuery
    q.value = userIdQuery
  }
  await loadUsers()
  if (userIdQuery && !selectedUser.value) {
    selectedUser.value = {
      id: userIdQuery,
      username: userIdQuery.slice(0, 8),
      displayName: '从链接打开',
      major: null,
      dormBuilding: null,
      status: 'active',
      lastLoginAt: null,
      createdAt: ''
    }
  }
  if (userIdQuery) {
    void loadUserDossier(userIdQuery)
  }
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <AdminPageHeader
      title="账号管理"
      description="创建和管理账号，可按专业、宿舍楼和状态查找。"
      icon="i-lucide-users"
      eyebrow="用户与互动"
    >
      <template #actions>
        <UButton
          to="/admin/chat"
          icon="i-lucide-messages-square"
          label="群聊管理"
          color="neutral"
          variant="outline"
        />
        <UButton
          to="/admin/audit?entityType=user"
          icon="i-lucide-scroll-text"
          label="账号审计"
          color="neutral"
          variant="outline"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="outline"
          :loading="loading"
          @click="loadUsers"
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
        :color="!status ? 'primary' : 'neutral'"
        :variant="!status ? 'solid' : 'soft'"
        @click="applyStatusPreset('')"
      >
        全部
      </UButton>
      <UButton
        size="sm"
        :color="status === 'active' ? 'primary' : 'neutral'"
        :variant="status === 'active' ? 'solid' : 'soft'"
        @click="applyStatusPreset('active')"
      >
        正常
      </UButton>
      <UButton
        size="sm"
        :color="status === 'disabled' ? 'primary' : 'neutral'"
        :variant="status === 'disabled' ? 'solid' : 'soft'"
        @click="applyStatusPreset('disabled')"
      >
        停用
      </UButton>
      <UButton
        size="sm"
        :color="status === 'banned' ? 'primary' : 'neutral'"
        :variant="status === 'banned' ? 'solid' : 'soft'"
        @click="applyStatusPreset('banned')"
      >
        封禁
      </UButton>
    </div>

    <details class="group rounded-md border border-zinc-200 bg-white">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-zinc-950 [&::-webkit-details-marker]:hidden">
        <span>创建账号</span>
        <span class="flex items-center gap-1 text-xs font-normal text-zinc-500">
          注册暂未开放，由管理员创建
          <UIcon name="i-lucide-chevron-down" class="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div class="border-t border-zinc-100 px-4 pb-4">
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <UFormField label="登录名">
          <UInput v-model="form.username" class="w-full" />
        </UFormField>
        <UFormField label="密码（≥8）">
          <UInput v-model="form.password" type="password" class="w-full" />
        </UFormField>
        <UFormField label="显示名">
          <UInput v-model="form.displayName" class="w-full" />
        </UFormField>
        <UFormField label="专业">
          <UInput v-model="form.major" class="w-full" />
        </UFormField>
        <UFormField label="宿舍楼">
          <UInput v-model="form.dormBuilding" class="w-full" />
        </UFormField>
        <div class="flex items-end">
          <UButton color="primary" icon="i-lucide-user-plus" :loading="creating" @click="createUser">
            创建
          </UButton>
        </div>
      </div>
      </div>
    </details>

    <div class="grid gap-4 rounded-md border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
      <UFormField label="关键词">
        <UInput
          v-model="q"
          class="w-full"
          placeholder="用户名 / 显示名 / 账号编号"
          @keyup.enter="applySearch"
        />
      </UFormField>
      <UFormField label="状态">
        <USelect
          v-model="status"
          :items="[
            { label: '全部状态', value: '' },
            { label: '正常', value: 'active' },
            { label: '停用', value: 'disabled' },
            { label: '封禁', value: 'banned' }
          ]"
          class="w-full"
        />
      </UFormField>
      <UFormField label="专业">
        <UInput
          v-model="major"
          class="w-full"
          @keyup.enter="applySearch"
        />
      </UFormField>
      <UFormField label="宿舍楼">
        <UInput
          v-model="dormBuilding"
          class="w-full"
          @keyup.enter="applySearch"
        />
      </UFormField>
      <div class="flex items-end">
        <UButton color="primary" icon="i-lucide-search" :loading="loading" @click="applySearch">
          筛选
        </UButton>
      </div>
    </div>

    <p class="text-xs text-zinc-500">
      本页概览：正常 {{ statusSummary.active }} · 停用 {{ statusSummary.disabled }} · 封禁 {{ statusSummary.banned }}
    </p>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="min-w-0 space-y-4">
        <div class="grid gap-2 md:hidden" aria-label="账号列表">
          <article
            v-for="row in items"
            :key="'mobile-' + row.id"
            class="min-w-0 rounded-md border border-zinc-200 bg-white p-3"
            :class="selectedUser?.id === row.id ? 'border-emerald-300 bg-emerald-50/40' : ''"
          >
            <div class="flex min-w-0 items-start justify-between gap-3">
              <button type="button" class="min-w-0 text-left" @click="openUserDetail(row)">
                <p class="truncate text-sm font-semibold text-zinc-900">{{ row.displayName }}</p>
                <p class="mt-0.5 truncate text-xs text-zinc-500">{{ row.username }}</p>
              </button>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px]" :class="statusClass(row.status)">
                {{ statusLabel(row.status) }}
              </span>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <p class="truncate">{{ row.major || '未填专业' }}</p>
              <p class="truncate">{{ row.dormBuilding || '未填宿舍' }}</p>
            </div>
            <p class="mt-2 text-[11px] text-zinc-400">
              最近登录 {{ formatTime(row.lastLoginAt) }} · 编号 {{ shortAdminId(row.id, 8) }}
            </p>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <UButton size="xs" color="neutral" variant="outline" @click="openUserDetail(row)">详情</UButton>
              <UButton size="xs" color="neutral" variant="outline" @click="startEdit(row)">编辑</UButton>
              <UButton size="xs" color="neutral" variant="ghost" :to="`/admin/chat?userId=${encodeURIComponent(row.id)}`">群聊</UButton>
              <UButton v-if="row.status !== 'active'" size="xs" color="success" variant="soft" @click="quickStatus(row, 'active')">恢复</UButton>
              <UButton v-if="row.status !== 'disabled'" size="xs" color="warning" variant="soft" @click="quickStatus(row, 'disabled')">停用</UButton>
              <UButton v-if="row.status !== 'banned'" size="xs" color="error" variant="soft" @click="quickStatus(row, 'banned')">封禁</UButton>
            </div>
          </article>
          <p v-if="!items.length && !loading" class="rounded-md border border-zinc-200 bg-white px-3 py-8 text-center text-sm text-zinc-400">暂无账号</p>
        </div>

        <div class="hidden overflow-x-auto rounded-md border border-zinc-200 bg-white md:block">
          <table class="min-w-full text-left text-sm">
            <thead class="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th class="px-3 py-3 font-medium">账号</th>
                <th class="px-3 py-3 font-medium">专业 / 宿舍</th>
                <th class="px-3 py-3 font-medium">状态</th>
                <th class="px-3 py-3 font-medium">最近登录 / 创建</th>
                <th class="px-3 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in items"
                :key="row.id"
                class="border-t border-zinc-100 align-top transition-colors hover:bg-zinc-50/80"
                :class="selectedUser?.id === row.id ? 'bg-emerald-50/50' : ''"
              >
                <td class="px-3 py-3">
                  <button
                    type="button"
                    class="text-left"
                    @click="openUserDetail(row)"
                  >
                    <div class="font-medium text-zinc-900">
                      {{ row.displayName }}
                    </div>
                    <div class="text-xs text-zinc-500">
                      {{ row.username }}
                    </div>
                    <div class="mt-1 text-[11px] text-zinc-400">
                      编号 {{ shortAdminId(row.id, 10) }}
                    </div>
                  </button>
                </td>
                <td class="px-3 py-3 text-xs text-zinc-600">
                  <div>{{ row.major || '未填专业' }}</div>
                  <div class="mt-1">
                    {{ row.dormBuilding || '未填宿舍' }}
                  </div>
                </td>
                <td class="px-3 py-3">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs"
                    :class="statusClass(row.status)"
                  >
                    {{ statusLabel(row.status) }}
                  </span>
                </td>
                <td class="px-3 py-3 text-xs text-zinc-500">
                  <div>登录 {{ formatTime(row.lastLoginAt) }}</div>
                  <div class="mt-1">
                    创建 {{ formatTime(row.createdAt) }}
                  </div>
                </td>
                <td class="px-3 py-3">
                  <div class="flex flex-wrap gap-1">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="outline"
                      @click="openUserDetail(row)"
                    >
                      详情
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="outline"
                      @click="startEdit(row)"
                    >
                      编辑
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :to="`/admin/chat?userId=${encodeURIComponent(row.id)}`"
                    >
                      群聊
                    </UButton>
                    <UButton
                      v-if="row.status !== 'active'"
                      size="xs"
                      color="success"
                      variant="soft"
                      @click="quickStatus(row, 'active')"
                    >
                      恢复
                    </UButton>
                    <UButton
                      v-if="row.status !== 'disabled'"
                      size="xs"
                      color="warning"
                      variant="soft"
                      @click="quickStatus(row, 'disabled')"
                    >
                      停用
                    </UButton>
                    <UButton
                      v-if="row.status !== 'banned'"
                      size="xs"
                      color="error"
                      variant="soft"
                      @click="quickStatus(row, 'banned')"
                    >
                      封禁
                    </UButton>
                  </div>
                </td>
              </tr>
              <tr v-if="!items.length && !loading">
                <td
                  colspan="5"
                  class="px-3 py-10 text-center text-zinc-400"
                >
                  暂无账号
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
              @click="page -= 1; loadUsers()"
            >
              上一页
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="page * pageSize >= total"
              @click="page += 1; loadUsers()"
            >
              下一页
            </UButton>
          </div>
        </div>

        <section
          v-if="editId"
          class="rounded-2xl border border-green-200 bg-green-50/40 p-4"
        >
          <h2 class="font-semibold text-zinc-950">
            编辑账号
          </h2>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <UFormField label="显示名">
              <UInput v-model="editForm.displayName" class="w-full" />
            </UFormField>
            <UFormField label="专业">
              <UInput v-model="editForm.major" class="w-full" />
            </UFormField>
            <UFormField label="宿舍楼">
              <UInput v-model="editForm.dormBuilding" class="w-full" />
            </UFormField>
            <UFormField label="状态">
              <USelect
                v-model="editForm.status"
                :items="[
                  { label: '正常', value: 'active' },
                  { label: '停用', value: 'disabled' },
                  { label: '封禁', value: 'banned' }
                ]"
                class="w-full"
              />
            </UFormField>
            <UFormField label="重置密码（可选）">
              <UInput
                v-model="editForm.password"
                type="password"
                class="w-full"
                placeholder="留空不改"
              />
            </UFormField>
            <div class="flex items-end gap-2">
              <UButton color="primary" :loading="saving" @click="saveEdit">
                保存
              </UButton>
              <UButton color="neutral" variant="outline" @click="() => { editId = null }">
                取消
              </UButton>
            </div>
          </div>
        </section>
      </div>

      <aside
        v-if="selectedUser"
        class="h-fit rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 lg:sticky lg:top-4"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold text-zinc-950">
              账号详情
            </h2>
            <p class="mt-1 text-sm text-zinc-700">
              {{ selectedUser.displayName }}
              <span class="text-zinc-500">· {{ selectedUser.username }}</span>
            </p>
          </div>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            @click="closeUserDetail"
          >
            关闭
          </UButton>
        </div>

        <dl class="mt-3 grid gap-2">
          <div class="rounded-xl border border-white bg-white px-3 py-2">
            <dt class="text-[11px] text-zinc-500">状态</dt>
            <dd>
              <span
                class="rounded-full px-2 py-0.5 text-xs"
                :class="statusClass(selectedUser.status)"
              >
                {{ statusLabel(selectedUser.status) }}
              </span>
            </dd>
          </div>
          <div class="rounded-xl border border-white bg-white px-3 py-2">
            <dt class="text-[11px] text-zinc-500">专业</dt>
            <dd class="text-sm text-zinc-800">{{ selectedUser.major || '—' }}</dd>
          </div>
          <div class="rounded-xl border border-white bg-white px-3 py-2">
            <dt class="text-[11px] text-zinc-500">宿舍楼</dt>
            <dd class="text-sm text-zinc-800">{{ selectedUser.dormBuilding || '—' }}</dd>
          </div>
          <div class="rounded-xl border border-white bg-white px-3 py-2">
            <dt class="text-[11px] text-zinc-500">最近登录</dt>
            <dd class="text-sm text-zinc-800">{{ formatTime(selectedUser.lastLoginAt) }}</dd>
          </div>
          <div class="rounded-xl border border-white bg-white px-3 py-2">
            <dt class="text-[11px] text-zinc-500">创建时间</dt>
            <dd class="text-sm text-zinc-800">{{ formatTime(selectedUser.createdAt) }}</dd>
          </div>
          <div class="rounded-xl border border-white bg-white px-3 py-2">
            <dt class="text-[11px] text-zinc-500">账号编号</dt>
            <dd class="text-xs text-zinc-700">{{ shortAdminId(selectedUser.id, 12) }}</dd>
          </div>
        </dl>

        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            @click="startEdit(selectedUser)"
          >
            编辑资料
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :to="`/admin/chat?userId=${encodeURIComponent(selectedUser.id)}`"
            icon="i-lucide-messages-square"
          >
            查看群聊
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :to="adminAuditHref('user', selectedUser.id)"
            icon="i-lucide-scroll-text"
          >
            相关审计
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :to="`/admin/bans?q=${encodeURIComponent(selectedUser.id)}`"
            icon="i-lucide-shield-ban"
          >
            封禁记录
          </UButton>
          <UButton
            v-if="selectedUser.status !== 'active'"
            size="sm"
            color="success"
            variant="soft"
            @click="quickStatus(selectedUser, 'active')"
          >
            恢复正常
          </UButton>
          <UButton
            v-if="selectedUser.status !== 'disabled'"
            size="sm"
            color="warning"
            variant="soft"
            @click="quickStatus(selectedUser, 'disabled')"
          >
            停用
          </UButton>
          <UButton
            v-if="selectedUser.status !== 'banned'"
            size="sm"
            color="error"
            variant="soft"
            @click="quickStatus(selectedUser, 'banned')"
          >
            封禁账号
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            :loading="dossierLoading"
            @click="loadUserDossier(selectedUser.id)"
          >
            刷新档案
          </UButton>
        </div>

        <div
          v-if="dossierError"
          class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {{ dossierError }}
        </div>

        <div v-if="dossierLoading && !userDossier" class="mt-3 text-xs text-zinc-500">
          安全档案加载中…
        </div>

        <template v-if="userDossier">
          <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div class="rounded-xl border border-white bg-white px-3 py-2">
              <p class="text-[11px] text-zinc-500">关联访客</p>
              <p class="mt-1 text-lg font-semibold tabular-nums">{{ userDossier.summary.linkedVisitorCount ?? 0 }}</p>
            </div>
            <div class="rounded-xl border border-white bg-white px-3 py-2">
              <p class="text-[11px] text-zinc-500">生效封禁</p>
              <p class="mt-1 text-lg font-semibold tabular-nums text-red-700">{{ userDossier.summary.activeBanCount ?? 0 }}</p>
            </div>
            <div class="rounded-xl border border-white bg-white px-3 py-2">
              <p class="text-[11px] text-zinc-500">生效禁言</p>
              <p class="mt-1 text-lg font-semibold tabular-nums text-amber-700">{{ userDossier.summary.activeMuteCount ?? 0 }}</p>
            </div>
            <div class="rounded-xl border border-white bg-white px-3 py-2">
              <p class="text-[11px] text-zinc-500">消息总数</p>
              <p class="mt-1 text-lg font-semibold tabular-nums">{{ userDossier.summary.messageTotal ?? 0 }}</p>
            </div>
            <div class="rounded-xl border border-white bg-white px-3 py-2">
              <p class="text-[11px] text-zinc-500">已删消息</p>
              <p class="mt-1 text-lg font-semibold tabular-nums">{{ userDossier.summary.messageDeleted ?? 0 }}</p>
            </div>
            <div class="rounded-xl border border-white bg-white px-3 py-2">
              <p class="text-[11px] text-zinc-500">在线会话</p>
              <p class="mt-1 text-lg font-semibold tabular-nums">{{ userDossier.summary.activeSessions ?? 0 }}</p>
            </div>
          </div>

          <div
            v-if="userDossier.riskLevel || userDossier.riskFactors?.length || userDossier.ipFootprint?.length"
            class="mt-3 space-y-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3"
          >
            <div
              v-if="userDossier.confidence || userDossier.suggestedActions?.length"
              class="space-y-2"
            >
              <div class="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  v-if="userDossier.confidence"
                  class="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-900"
                >
                  {{ adminLabel(adminConfidenceLabels, userDossier.confidence, userDossier.confidence) }}
                  · 证据 {{ userDossier.evidenceEvents ?? userDossier.summary?.evidenceEvents ?? '—' }}
                </span>
                <span
                  v-if="userDossier.relationship?.ips?.length"
                  class="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700"
                >
                  关联 IP {{ userDossier.relationship.ips.length }}
                </span>
              </div>
              <div v-if="userDossier.suggestedActions?.length" class="flex flex-wrap gap-1.5">
                <NuxtLink
                  v-for="(action, idx) in userDossier.suggestedActions"
                  :key="'usa-' + action.kind + '-' + idx"
                  :to="action.href"
                  class="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-sky-900 ring-1 ring-sky-200 hover:bg-sky-50"
                  :title="action.reason"
                >
                  {{ adminLabel(adminSuggestedActionLabels, action.kind, action.label) }}
                </NuxtLink>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs font-semibold text-violet-950">账号风险</span>
              <span
                v-if="userDossier.riskLevel"
                class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="riskToneClass(userDossier.riskLevel)"
              >
                {{ adminLabel(adminRiskLevelLabels, userDossier.riskLevel) }}
                <template v-if="userDossier.riskScore != null">· {{ userDossier.riskScore }}</template>
              </span>
            </div>
            <ul
              v-if="userDossier.riskFactors?.length"
              class="flex flex-wrap gap-1.5"
            >
              <li
                v-for="factor in userDossier.riskFactors"
                :key="'urf-' + factor.code + '-' + factor.points"
                class="rounded-full bg-white px-2 py-0.5 text-[11px] text-rose-900 ring-1 ring-rose-100"
              >
                {{ adminLabel(adminRiskFactorLabels, factor.code, factor.code) }}
                +{{ factor.points }} · {{ factor.message }}
              </li>
            </ul>
            <div v-if="userDossier.ipFootprint?.length">
              <p class="text-[11px] font-medium text-violet-900">常用网络</p>
              <ul class="mt-1 max-h-28 space-y-1 overflow-y-auto">
                <li
                  v-for="row in userDossier.ipFootprint"
                  :key="'uip-' + row.ip"
                  class="flex items-center justify-between gap-2 text-[11px]"
                >
                  <NuxtLink
                    :to="'/admin/visitors?ip=' + encodeURIComponent(row.ip)"
                    class="truncate text-sky-700 hover:underline"
                  >
                    {{ row.ip }}
                  </NuxtLink>
                  <span class="shrink-0 text-zinc-500">
                    {{ row.count }} · {{ formatAdminRelativeTime(row.lastAt) }}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div
            v-if="userDossier.evidenceLedger?.length || userDossier.playbook?.length"
            class="mt-3 grid gap-3 lg:grid-cols-2"
          >
            <section class="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-xs font-semibold text-rose-950">判断依据</h3>
                <span class="text-[10px] text-rose-700">
                  重要依据 {{ userDossier.investigationSummary?.strongEvidenceCount ?? 0 }} / {{ userDossier.investigationSummary?.evidenceCount ?? 0 }}
                </span>
              </div>
              <ul class="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                <li v-for="item in userDossier.evidenceLedger" :key="'ue-' + item.code" class="rounded-md bg-white px-2 py-1.5 text-[11px]">
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate font-medium text-zinc-800">{{ item.message }}</span>
                    <span class="shrink-0 text-[10px] text-rose-800">
                      {{ adminLabel(adminEvidenceStrengthLabels, item.strength, item.strength) }} · {{ item.weight }}
                    </span>
                  </div>
                </li>
              </ul>
            </section>
            <section class="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-xs font-semibold text-emerald-950">处理建议</h3>
                <span class="text-[10px] text-emerald-700">建议 {{ userDossier.investigationSummary?.recommendedSteps ?? 0 }} 步</span>
              </div>
              <ol class="mt-2 max-h-48 space-y-2 overflow-y-auto">
                <li v-for="step in userDossier.playbook" :key="'upb-' + step.code" class="text-[11px]">
                  <NuxtLink :to="step.href" class="block rounded-md bg-white px-2 py-1.5 hover:bg-emerald-50">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-medium text-zinc-900">{{ step.step }}. {{ adminLabel(adminInvestigationStepLabels, step.code, step.title) }}</span>
                      <span class="shrink-0 text-[10px] text-emerald-800">{{ adminLabel(adminPlaybookStatusLabels, step.status, step.status) }}</span>
                    </div>
                    <p class="mt-0.5 line-clamp-2 text-zinc-500">{{ step.detail }}</p>
                  </NuxtLink>
                </li>
              </ol>
            </section>
          </div>

          <div class="mt-4 space-y-3">
            <section class="rounded-xl border border-white bg-white p-3">
              <h3 class="text-xs font-semibold text-zinc-800">群成员身份（{{ userDossier.memberships.length }}）</h3>
              <ul class="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-zinc-600">
                <li v-for="m in userDossier.memberships" :key="m.roomId">
                  {{ m.title }}
                  <span class="text-zinc-400">· {{ m.kind }} · {{ formatAdminRelativeTime(m.joinedAt) }}</span>
                </li>
                <li v-if="!userDossier.memberships.length" class="text-zinc-400">未加入群聊</li>
              </ul>
            </section>

            <section class="rounded-xl border border-white bg-white p-3">
              <h3 class="text-xs font-semibold text-zinc-800">关联访客（{{ userDossier.linkedVisitors.length }}）</h3>
              <ul class="mt-2 max-h-32 space-y-1.5 overflow-y-auto text-xs">
                <li
                  v-for="v in userDossier.linkedVisitors"
                  :key="v.id"
                  class="rounded-lg bg-zinc-50 px-2 py-1.5"
                >
                  <NuxtLink
                    :to="`/admin/visitors?q=${encodeURIComponent(v.id)}`"
                    class="font-medium text-emerald-700 hover:underline"
                  >
                    {{ shortAdminId(v.id, 10) }}
                  </NuxtLink>
                  <span class="text-zinc-500"> · {{ v.lastCity || v.lastRegion || '未知地点' }} · {{ v.lastIp || '无 IP' }}</span>
                  <p class="text-zinc-400">末次 {{ formatAdminRelativeTime(v.lastSeenAt) }} · {{ v.eventCount }} 次操作</p>
                </li>
                <li v-if="!userDossier.linkedVisitors.length" class="text-zinc-400">无关联访客</li>
              </ul>
            </section>

            <section class="rounded-xl border border-white bg-white p-3">
              <h3 class="text-xs font-semibold text-zinc-800">封禁记录（{{ userDossier.bans.length }}）</h3>
              <ul class="mt-2 max-h-28 space-y-1.5 overflow-y-auto text-xs">
                <li
                  v-for="b in userDossier.bans"
                  :key="b.id"
                  class="rounded-lg bg-zinc-50 px-2 py-1.5"
                >
                  <span :class="b.isActive ? 'text-red-700' : 'text-zinc-500'">{{ b.isActive ? '生效' : '失效' }}</span>
                  · {{ b.reason || '—' }}
                  <p class="text-zinc-400">{{ formatTime(b.createdAt) }}</p>
                </li>
                <li v-if="!userDossier.bans.length" class="text-zinc-400">无账号级封禁</li>
              </ul>
            </section>

            <section class="rounded-xl border border-white bg-white p-3">
              <h3 class="text-xs font-semibold text-zinc-800">禁言记录（{{ userDossier.mutes.length }}）</h3>
              <ul class="mt-2 max-h-28 space-y-1.5 overflow-y-auto text-xs">
                <li
                  v-for="m in userDossier.mutes"
                  :key="m.id"
                  class="rounded-lg bg-zinc-50 px-2 py-1.5"
                >
                  <span :class="m.isActive ? 'text-amber-700' : 'text-zinc-500'">{{ m.isActive ? '生效' : '失效' }}</span>
                  · {{ m.roomTitle || '全站' }} · {{ m.reason || '—' }}
                  <p class="text-zinc-400">{{ formatTime(m.createdAt) }}</p>
                </li>
                <li v-if="!userDossier.mutes.length" class="text-zinc-400">无禁言记录</li>
              </ul>
            </section>

            <section class="rounded-xl border border-white bg-white p-3">
              <h3 class="text-xs font-semibold text-zinc-800">最近消息（{{ userDossier.recentMessages.length }}）</h3>
              <ul class="mt-2 max-h-36 space-y-1.5 overflow-y-auto text-xs">
                <li
                  v-for="msg in userDossier.recentMessages"
                  :key="msg.id"
                  class="rounded-lg bg-zinc-50 px-2 py-1.5"
                >
                  <p class="text-zinc-500">
                    {{ msg.roomTitle }} · {{ formatAdminRelativeTime(msg.createdAt) }}
                    <span v-if="msg.deletedAt" class="text-red-600"> · 已删</span>
                  </p>
                  <p class="mt-0.5 line-clamp-2 text-zinc-800">{{ msg.body }}</p>
                </li>
                <li v-if="!userDossier.recentMessages.length" class="text-zinc-400">暂无消息</li>
              </ul>
            </section>

            <section class="rounded-xl border border-white bg-white p-3">
              <h3 class="text-xs font-semibold text-zinc-800">相关审计（{{ userDossier.auditItems.length }}）</h3>
              <ul class="mt-2 max-h-28 space-y-1.5 overflow-y-auto text-xs">
                <li
                  v-for="a in userDossier.auditItems"
                  :key="a.id"
                  class="rounded-lg bg-zinc-50 px-2 py-1.5"
                >
                  {{ adminLabel(adminAuditActionLabels, a.action, a.action) }}
                  <span class="text-zinc-400"> · {{ formatAdminRelativeTime(a.createdAt) }}</span>
                </li>
                <li v-if="!userDossier.auditItems.length" class="text-zinc-400">暂无审计</li>
              </ul>
            </section>
          </div>
        </template>
      </aside>

      <aside
        v-else
        class="hidden h-fit rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 p-4 text-sm text-zinc-500 lg:block lg:sticky lg:top-4"
      >
        点击账号行或「详情」，可在此查看资料、跳转群聊/审计，并快捷改状态。
      </aside>
    </div>
  </div>
</template>
