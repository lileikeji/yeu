<script setup lang="ts">
import type {
  YeucaAdminScopePayload,
  YeucaAuditLogItem,
  YeucaAuditLogsPayload,
  YeucaGiteaProbeResult
} from '~~/shared/types/yeuca'
import { adminFetch } from '~~/app/utils/admin-request'
import {
  adminAuditActionLabels,
  adminAuditEntityLabels,
  adminLabel
} from '~~/app/utils/admin-security-labels'

const props = defineProps<{
  adminScope: YeucaAdminScopePayload
}>()

const toast = useToast()

const loading = ref(true)
const probing = ref(false)
const category = ref('all')
const keyword = ref('')
const page = ref(1)
const data = ref<YeucaAuditLogsPayload | null>(null)
const probeResult = ref<YeucaGiteaProbeResult | null>(null)
const expanded = ref<Record<string, boolean>>({})

const categories = computed(() => [
  { value: 'all', label: '全部流水' },
  { value: 'git', label: '开户与 Git 同步' },
  { value: 'member_auth', label: '成员登录与激活' },
  { value: 'member_admin', label: '名单录入与审批' },
  ...(props.adminScope.role === 'chief' ? [{ value: 'minister', label: '部长与后台登录' }] : []),
  { value: 'content', label: '活动与部门内容' }
])

function getErrDesc(err: unknown, fallback = '请求失败'): string {
  const e = err as { data?: { message?: string }, statusMessage?: string }
  return e?.data?.message || e?.statusMessage || fallback
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function actorLabel(row: YeucaAuditLogItem): string {
  if (row.actorDisplayName) return `${row.actorDisplayName} (${row.actorUsername || ''})`
  if (row.actorUsername) return row.actorUsername
  if (row.action.startsWith('yeuca.member.')) return '官网会员端'
  return '系统'
}

function actionColor(action: string): 'error' | 'warning' | 'success' | 'info' | 'neutral' {
  if (action.includes('failed') || action.includes('rejected') || action.includes('ban') || action.includes('delete')) {
    return 'error'
  }
  if (action.includes('register') || action.includes('create') || action.includes('approve')) {
    return 'success'
  }
  if (action.includes('probe') || action.includes('sync') || action.includes('password')) {
    return 'info'
  }
  return 'neutral'
}

function summarizeDetails(details: Record<string, unknown>): string {
  const parts: string[] = []
  if (details.studentNo) parts.push(`学号 ${String(details.studentNo)}`)
  if (details.name) parts.push(String(details.name))
  if (details.gitUsername) parts.push(`@${String(details.gitUsername)}`)
  if (details.username) parts.push(`账号 ${String(details.username)}`)
  if (details.reason) parts.push(`原因：${String(details.reason)}`)
  if (details.error) parts.push(`异常：${String(details.error)}`)
  if (details.gitSyncError) parts.push(`Git 错误：${String(details.gitSyncError)}`)
  if (typeof details.gitSynced === 'boolean') parts.push(details.gitSynced ? 'Git 已同步' : 'Git 未同步')
  if (details.title) parts.push(String(details.title))
  if (details.ip) parts.push(`IP ${String(details.ip)}`)
  return parts.join(' · ')
}

function rowDepartment(details: Record<string, unknown>): string {
  return String(details.department || details.deptName || details.departmentName || '').trim()
}

function toggleExpand(id: string): void {
  expanded.value = {
    ...expanded.value,
    [id]: !expanded.value[id]
  }
}

async function loadAudits(): Promise<void> {
  loading.value = true
  try {
    const query = new URLSearchParams({
      category: category.value,
      page: String(page.value),
      pageSize: '40'
    })
    if (keyword.value.trim()) query.set('keyword', keyword.value.trim())
    data.value = await adminFetch<YeucaAuditLogsPayload>(`/api/admin/yeuca/audits?${query.toString()}`)
  } catch (err) {
    toast.add({ title: '读取审计日志失败', description: getErrDesc(err), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function runGiteaProbe(): Promise<void> {
  probing.value = true
  try {
    const res = await adminFetch<YeucaGiteaProbeResult>('/api/admin/yeuca/gitea/probe', { method: 'POST' })
    probeResult.value = res
    toast.add({
      title: res.adminTokenValid ? 'Gitea 自动开户接口连通正常' : 'Gitea 开户探测发现异常',
      description: res.adminTokenValid
        ? `管理令牌身份：${res.adminLogin} · Gitea v${res.version} · 已注册用户数 ${res.totalGiteaUsers ?? '未知'}`
        : res.error,
      color: res.adminTokenValid ? 'success' : 'error'
    })
    await loadAudits()
  } catch (err) {
    toast.add({ title: '探测请求失败', description: getErrDesc(err), color: 'error' })
  } finally {
    probing.value = false
  }
}

function switchCategory(next: string): void {
  if (category.value === next) return
  category.value = next
  page.value = 1
  void loadAudits()
}

function applySearch(): void {
  page.value = 1
  void loadAudits()
}

const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / 40)))

onMounted(() => {
  void loadAudits()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Gitea 自动开户探活卡片 + 范围说明 -->
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            <UIcon
              name="i-lucide-scroll-text"
              class="size-4 text-[#a8121e]"
            />
            <span>计协操作审计与开户流水</span>
            <UBadge
              :label="adminScope.role === 'chief' ? '全协会视图' : `仅查看：${adminScope.departmentName}`"
              color="info"
              variant="soft"
              size="xs"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            size="sm"
            color="primary"
            variant="subtle"
            icon="i-lucide-git-branch"
            label="实测 Gitea 开户接口"
            :loading="probing"
            @click="runGiteaProbe"
          />
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            label="刷新"
            :loading="loading"
            @click="loadAudits"
          />
        </div>
      </div>

      <div
        v-if="probeResult"
        class="rounded-lg border p-3 text-xs flex flex-wrap items-center justify-between gap-2"
        :class="probeResult.adminTokenValid
          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
          : 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'"
      >
        <div class="flex flex-wrap items-center gap-2">
          <UIcon
            :name="probeResult.adminTokenValid ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
            class="size-4 shrink-0"
          />
          <span v-if="probeResult.adminTokenValid">
            <strong>接口可用：</strong>
            Gitea {{ probeResult.version }} 在线 · 令牌身份 <code class="font-mono">{{ probeResult.adminLogin }}</code> · 当前 Gitea 账号 {{ probeResult.totalGiteaUsers ?? '未知' }} 个 · {{ probeResult.requireSigninView ? '全站门禁已开启' : '门禁未开' }}
          </span>
          <span v-else>
            <strong>接口异常：</strong>{{ probeResult.error }}
          </span>
        </div>
        <span class="font-mono opacity-80">检测于 {{ formatTime(probeResult.checkedAt) }}</span>
      </div>
    </div>

    <!-- 筛选条 -->
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-1.5">
        <UButton
          v-for="cat in categories"
          :key="cat.value"
          size="xs"
          :label="cat.label"
          color="neutral"
          :variant="category === cat.value ? 'solid' : 'outline'"
          @click="switchCategory(cat.value)"
        />
      </div>

      <div class="flex items-center gap-2">
        <UInput
          v-model="keyword"
          icon="i-lucide-search"
          placeholder="搜学号 / 账号 / 错误关键词"
          size="sm"
          class="w-60"
          @keydown.enter="applySearch"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          label="筛选"
          @click="applySearch"
        />
      </div>
    </div>

    <!-- 审计表 -->
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 overflow-hidden">
      <div
        v-if="loading && !data"
        class="p-10 text-center text-sm text-zinc-500"
      >
        正在读取审计日志…
      </div>
      <div
        v-else-if="!data?.items.length"
        class="p-10 text-center text-sm text-zinc-500"
      >
        当前筛选下暂无审计记录
      </div>
      <div
        v-else
        class="divide-y divide-zinc-200 dark:divide-zinc-800"
      >
        <div
          v-for="row in data.items"
          :key="row.id"
          class="px-4 py-3 hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30 transition-colors"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="space-y-1 min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs text-zinc-500">
                  {{ formatTime(row.createdAt) }}
                </span>
                <UBadge
                  :label="adminLabel(adminAuditActionLabels, row.action, row.action)"
                  :color="actionColor(row.action)"
                  variant="soft"
                  size="xs"
                />
                <UBadge
                  :label="adminLabel(adminAuditEntityLabels, row.entityType, row.entityType)"
                  color="neutral"
                  variant="outline"
                  size="xs"
                />
                <UBadge
                  v-if="rowDepartment(row.details)"
                  :label="rowDepartment(row.details)"
                  color="info"
                  variant="subtle"
                  size="xs"
                />
                <span class="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {{ actorLabel(row) }}
                </span>
              </div>

              <p
                v-if="summarizeDetails(row.details)"
                class="text-xs text-zinc-600 dark:text-zinc-300 break-all"
              >
                {{ summarizeDetails(row.details) }}
              </p>
            </div>

            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :icon="expanded[row.id] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              label="详情"
              @click="toggleExpand(row.id)"
            />
          </div>

          <pre
            v-if="expanded[row.id]"
            class="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2.5 font-mono text-[11px] leading-5 text-zinc-700 dark:text-zinc-300"
          >{{ JSON.stringify({ id: row.id, action: row.action, entityId: row.entityId, requestId: row.requestId, details: row.details }, null, 2) }}</pre>
        </div>
      </div>

      <div
        v-if="data && data.total > 40"
        class="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-4 py-2.5 text-xs text-zinc-500"
      >
        <span>共 {{ data.total }} 条 · 第 {{ data.page }} / {{ totalPages }} 页</span>
        <div class="flex gap-1.5">
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-chevron-left"
            :disabled="page <= 1"
            @click="page--; loadAudits()"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-chevron-right"
            :disabled="page >= totalPages"
            @click="page++; loadAudits()"
          />
        </div>
      </div>
    </div>
  </div>
</template>
