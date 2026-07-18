<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '审计日志', robots: 'noindex, nofollow' })

type AuditRow = {
  id: string
  actorAdminId: string | null
  action: string
  entityType: string
  entityId: string | null
  requestId: string | null
  details: Record<string, unknown>
  createdAt: string
}

const toast = useToast()
const loading = ref(false)
const errorMessage = ref('')
const items = ref<AuditRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 30

const action = ref('')
const entityType = ref('')
const entityId = ref('')

const entityTypeOptions = [
  { label: '全部对象', value: '' },
  { label: 'visitor_ban', value: 'visitor_ban' },
  { label: 'chat_message', value: 'chat_message' },
  { label: 'chat_mute', value: 'chat_mute' },
  { label: 'chat_room', value: 'chat_room' },
  { label: 'user', value: 'user' },
  { label: 'place', value: 'place' },
  { label: 'content', value: 'content' },
  { label: 'procedure', value: 'procedure' }
]

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function detailsText(details: Record<string, unknown> | null | undefined): string {
  if (!details || !Object.keys(details).length) return '—'
  try {
    return JSON.stringify(details)
  } catch {
    return '—'
  }
}

async function handleAuth(error: unknown): Promise<boolean> {
  if (!isAuthorizationError(error)) return false
  await navigateTo('/admin/login', { replace: true })
  return true
}

async function loadAudit(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const payload = await adminFetch<{ items: AuditRow[]; total: number }>('/api/admin/audit', {
      query: {
        page: page.value,
        pageSize,
        action: action.value.trim() || undefined,
        entityType: entityType.value.trim() || undefined,
        entityId: entityId.value.trim() || undefined
      }
    })
    items.value = payload.items || []
    total.value = payload.total || 0
  } catch (error) {
    if (await handleAuth(error)) return
    errorMessage.value = getRequestMessage(error, '审计日志加载失败')
  } finally {
    loading.value = false
  }
}

function applySearch(): void {
  page.value = 1
  void loadAudit()
}

onMounted(() => {
  void loadAudit()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <AdminPageHeader
      title="审计日志"
      description="独立安全分区：按操作、对象类型、对象 ID 筛选后台动作留痕，只读不可改写。"
      icon="i-lucide-scroll-text"
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
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="outline"
          :loading="loading"
          @click="loadAudit"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="errorMessage"
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {{ errorMessage }}
    </div>

    <section class="rounded-2xl border border-zinc-200 bg-white p-4">
      <div class="flex flex-wrap items-end gap-3">
        <UFormField
          label="操作 action"
          class="min-w-[12rem] flex-1"
        >
          <UInput
            v-model="action"
            class="w-full"
            placeholder="如 visitor.ban / chat.mute / soft_delete"
            @keyup.enter="applySearch"
          />
        </UFormField>
        <UFormField
          label="对象类型"
          class="min-w-[10rem]"
        >
          <USelect
            v-model="entityType"
            :items="entityTypeOptions"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="对象 ID"
          class="min-w-[12rem] flex-1"
        >
          <UInput
            v-model="entityId"
            class="w-full"
            placeholder="精确匹配 entityId"
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

      <ul class="mt-4 max-h-[42rem] space-y-2 overflow-y-auto">
        <li
          v-for="row in items"
          :key="row.id"
          class="rounded-xl border border-zinc-100 px-3 py-3 text-sm"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="font-medium text-zinc-900">
                {{ row.action }}
              </p>
              <p class="text-xs text-zinc-500">
                {{ row.entityType }}
                <template v-if="row.entityId"> · {{ row.entityId }}</template>
                · {{ formatTime(row.createdAt) }}
              </p>
              <p class="mt-1 break-all text-xs text-zinc-700">
                详情：{{ detailsText(row.details) }}
              </p>
              <p class="mt-1 text-xs text-zinc-400">
                管理员：{{ row.actorAdminId || '—' }}
                <template v-if="row.requestId"> · req {{ row.requestId }}</template>
              </p>
            </div>
          </div>
        </li>
        <li
          v-if="!items.length && !loading"
          class="py-10 text-center text-sm text-zinc-400"
        >
          暂无审计记录
        </li>
      </ul>

      <div class="mt-3 flex items-center justify-between text-sm text-zinc-500">
        <span>共 {{ total }} 条</span>
        <div class="flex gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="page <= 1"
            @click="page -= 1; loadAudit()"
          >
            上一页
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="page * pageSize >= total"
            @click="page += 1; loadAudit()"
          >
            下一页
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>
