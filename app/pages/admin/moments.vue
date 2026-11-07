<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'

definePageMeta({ layout: 'admin' })

interface AdminMomentView {
  id: string
  kind: 'bus' | 'place'
  target: string
  routeName: string | null
  body: string
  displayName: string
  ip: string | null
  status: 'pending' | 'approved' | 'rejected'
  aiCheckedAt: string | null
  aiCategory: string | null
  aiReason: string | null
  moderatedBy: string | null
  moderationReason: string | null
  createdAt: string
}

interface AdminMomentsResponse {
  kind: 'bus' | 'place'
  items: AdminMomentView[]
  total: number
  page: number
  pageSize: number
}

const toast = useToast()
const viewTab = ref<'bus' | 'place'>('bus')
const items = ref<AdminMomentView[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const statusFilter = ref<'all' | 'approved' | 'rejected'>('all')
const loading = ref(true)
const errorMessage = ref('')
const actingIds = ref(new Set<string>())
const reasonDrafts = ref(new Map<string, string>())

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`
}

const AI_CATEGORY_LABELS: Record<string, string> = {
  abuse: '辱骂攻击',
  porn: '色情低俗',
  spam: '广告刷屏',
  political: '政治敏感',
  privacy: '泄露隐私',
  illegal: '其他违法'
}

function aiLabel(item: AdminMomentView): { text: string, class: string } {
  if (item.aiCategory) {
    const label = AI_CATEGORY_LABELS[item.aiCategory] ?? item.aiCategory
    return { text: `AI 违规 · ${label}`, class: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300' }
  }
  if (item.aiCheckedAt) return { text: 'AI 通过', class: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
  return { text: '未巡检', class: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' }
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await adminFetch<AdminMomentsResponse>('/api/admin/moments', {
      query: {
        kind: viewTab.value,
        status: statusFilter.value,
        page: page.value,
        pageSize: pageSize.value
      }
    })
    items.value = response.items ?? []
    total.value = response.total ?? 0
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    errorMessage.value = getRequestMessage(error, '留言数据加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function switchTab(next: 'bus' | 'place'): void {
  if (viewTab.value === next) return
  viewTab.value = next
  page.value = 1
  void load()
}

function switchStatus(next: 'all' | 'approved' | 'rejected'): void {
  if (statusFilter.value === next) return
  statusFilter.value = next
  page.value = 1
  void load()
}

function gotoPage(next: number): void {
  if (next < 1 || next > pageCount.value || next === page.value) return
  page.value = next
  void load()
}

async function act(item: AdminMomentView, action: 'withdraw' | 'restore' | 'delete'): Promise<void> {
  if (actingIds.value.has(item.id)) return
  if (action === 'delete' && !window.confirm('删除后不可恢复，确定删除这条留言？')) return
  actingIds.value = new Set(actingIds.value).add(item.id)
  try {
    if (action === 'delete') {
      await adminFetch(`/api/admin/moments/${item.id}`, { method: 'DELETE', query: { kind: item.kind } })
      toast.add({ color: 'success', title: '已删除' })
    } else {
      await adminFetch(`/api/admin/moments/${item.id}`, {
        method: 'PATCH',
        body: {
          kind: item.kind,
          action,
          reason: reasonDrafts.value.get(item.id) ?? undefined
        }
      })
      toast.add({ color: 'success', title: action === 'withdraw' ? '已撤回' : '已恢复' })
    }
    await load()
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    toast.add({ color: 'error', title: getRequestMessage(error, '操作失败') })
  } finally {
    const next = new Set(actingIds.value)
    next.delete(item.id)
    actingIds.value = next
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        留言治理
      </h1>
      <div class="flex items-center gap-1.5">
        <button
          v-for="tab in (['bus', 'place'] as const)"
          :key="tab"
          type="button"
          class="rounded-full px-3 py-1.5 text-xs font-medium transition"
          :class="viewTab === tab ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'"
          @click="switchTab(tab)"
        >
          {{ tab === 'bus' ? '校车留言' : '地点留言' }}
        </button>
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-1.5">
      <button
        v-for="status in (['all', 'approved', 'rejected'] as const)"
        :key="status"
        type="button"
        class="rounded-full px-2.5 py-1 text-[11px] font-medium transition"
        :class="statusFilter === status ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'"
        @click="switchStatus(status)"
      >
        {{ status === 'all' ? '全部' : status === 'approved' ? '已发布' : '已撤回' }}
      </button>
    </div>

    <p
      v-if="errorMessage"
      class="mt-3 text-sm text-red-600 dark:text-red-400"
    >
      {{ errorMessage }}
    </p>
    <p
      v-else-if="loading"
      class="mt-3 text-sm text-zinc-500"
    >
      加载中…
    </p>

    <div
      v-else
      class="mt-3 space-y-2"
    >
      <p
        v-if="items.length === 0"
        class="text-sm text-zinc-500"
      >
        没有符合条件的留言。
      </p>

      <div
        v-for="item in items"
        :key="item.id"
        class="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
            {{ item.displayName }}
          </span>
          <span class="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {{ item.kind === 'bus' ? `车号 ${item.target}` : `地点 ${item.target}` }}
          </span>
          <span
            v-if="item.routeName"
            class="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          >
            {{ item.routeName }}
          </span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            :class="item.status === 'approved' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'"
          >
            {{ item.status === 'approved' ? '已发布' : '已撤回' }}
          </span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            :class="aiLabel(item).class"
          >
            {{ aiLabel(item).text }}
          </span>
          <span class="ml-auto text-[10px] tabular-nums text-zinc-400">
            {{ formatWhen(item.createdAt) }}
          </span>
        </div>
        <p class="mt-1.5 whitespace-pre-line text-xs leading-5 text-zinc-700 dark:text-zinc-200">
          {{ item.body }}
        </p>
        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-400">
          <span>IP：{{ item.ip ?? '未记录' }}</span>
          <span v-if="item.aiReason">
            AI：{{ item.aiReason }}
          </span>
          <span v-if="item.moderatedBy">
            处理：{{ item.moderatedBy === 'ai' ? 'AI 自动' : '管理员' }}{{ item.moderationReason ? ` · ${item.moderationReason}` : '' }}
          </span>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            :value="reasonDrafts.get(item.id) ?? ''"
            type="text"
            placeholder="理由（可选）"
            class="w-40 rounded-md border-0 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700"
            @input="reasonDrafts.set(item.id, ($event.target as HTMLInputElement).value)"
          >
          <button
            v-if="item.status === 'approved'"
            type="button"
            class="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
            :disabled="actingIds.has(item.id)"
            @click="act(item, 'withdraw')"
          >
            撤回
          </button>
          <button
            v-else
            type="button"
            class="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
            :disabled="actingIds.has(item.id)"
            @click="act(item, 'restore')"
          >
            恢复
          </button>
          <button
            type="button"
            class="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
            :disabled="actingIds.has(item.id)"
            @click="act(item, 'delete')"
          >
            删除
          </button>
        </div>
      </div>

      <div
        v-if="pageCount > 1"
        class="flex items-center justify-center gap-2 pt-2"
      >
        <button
          type="button"
          class="rounded-md bg-zinc-100 px-3 py-1.5 text-xs text-zinc-600 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300"
          :disabled="page <= 1"
          @click="gotoPage(page - 1)"
        >
          上一页
        </button>
        <span class="text-xs tabular-nums text-zinc-500">{{ page }} / {{ pageCount }}</span>
        <button
          type="button"
          class="rounded-md bg-zinc-100 px-3 py-1.5 text-xs text-zinc-600 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300"
          :disabled="page >= pageCount"
          @click="gotoPage(page + 1)"
        >
          下一页
        </button>
      </div>
    </div>
  </div>
</template>
