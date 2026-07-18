<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'
import {
  adminAuditActionLabels,
  adminAuditEntityLabels,
  adminAuditEntityTypeOptions,
  adminAuditActionOptions,
  adminAuditPresets,
  adminEntityHref,
  adminLabel,
  formatAdminDateTime,
  formatAdminRelativeTime,
  groupByAdminDay,
  prettyAdminDetails,
  shortAdminId
} from '~~/app/utils/admin-security-labels'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '审计日志', robots: 'noindex, nofollow' })

type AuditRow = {
  id: string
  actorAdminId: string | null
  actorUsername?: string | null
  actorDisplayName?: string | null
  action: string
  entityType: string
  entityId: string | null
  requestId: string | null
  details: Record<string, unknown>
  createdAt: string
}

const toast = useToast()
const route = useRoute()
const loading = ref(false)
const errorMessage = ref('')
const items = ref<AuditRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 30

const action = ref('')
const entityType = ref('')
const entityId = ref('')
const activePreset = ref('all')
const expanded = ref<Record<string, boolean>>({})

function formatTime(iso: string | null | undefined): string {
  return formatAdminDateTime(iso, true)
}

function actionLabel(value: string): string {
  return adminLabel(adminAuditActionLabels, value, '其他操作')
}

function entityLabel(value: string): string {
  return adminLabel(adminAuditEntityLabels, value, '其他对象')
}

function actorLabel(row: AuditRow): string {
  if (row.actorDisplayName) return row.actorDisplayName
  if (row.actorUsername) return row.actorUsername
  if (row.actorAdminId) return shortAdminId(row.actorAdminId, 10)
  return '系统 / 未知'
}

function detailLabel(key: string): string {
  const labels: Record<string, string> = {
    reason: '原因',
    scope: '范围',
    value: '对象',
    status: '状态',
    previousStatus: '原状态',
    nextStatus: '新状态',
    expiresAt: '到期时间',
    roomId: '群聊编号',
    userId: '账号编号',
    visitorId: '访客编号',
    messageId: '消息编号',
    username: '登录名',
    displayName: '显示名',
    ip: '网络地址',
    body: '内容',
    deletedAt: '删除时间'
  }
  return labels[key] || '补充信息'
}

const auditDayGroups = computed(() => groupByAdminDay(items.value))

function toggleExpand(id: string): void {
  expanded.value = {
    ...expanded.value,
    [id]: !expanded.value[id]
  }
}

function entityHref(row: AuditRow): string | null {
  return adminEntityHref(row.entityType, row.entityId)
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

function applyPreset(key: string): void {
  const preset = adminAuditPresets.find(item => item.key === key)
  if (!preset) return
  activePreset.value = key
  action.value = preset.action || ''
  entityType.value = preset.entityType || ''
  page.value = 1
  void loadAudit()
}

onMounted(() => {
  if (typeof route.query.entityType === 'string' && route.query.entityType) {
    entityType.value = route.query.entityType
    activePreset.value = 'all'
  }
  if (typeof route.query.entityId === 'string' && route.query.entityId) {
    entityId.value = route.query.entityId
  }
  if (typeof route.query.action === 'string' && route.query.action) {
    action.value = route.query.action
  }
  void loadAudit()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <AdminPageHeader
      title="审计日志"
      description="查看管理员近期做过的操作，记录仅供核对，不能修改。"
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
          to="/admin/visitors"
          icon="i-lucide-radar"
          label="访客轨迹"
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

    <section class="rounded-md border border-zinc-200 bg-white p-4">
      <div class="mb-3 flex flex-wrap gap-2">
        <UButton
          v-for="preset in adminAuditPresets"
          :key="preset.key"
          size="sm"
          :color="activePreset === preset.key ? 'primary' : 'neutral'"
          :variant="activePreset === preset.key ? 'solid' : 'soft'"
          @click="applyPreset(preset.key)"
        >
          {{ preset.label }}
        </UButton>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField
          label="操作类型"
          class="min-w-[12rem] flex-1"
        >
          <USelect
            v-model="action"
            :items="adminAuditActionOptions"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="对象类型"
          class="min-w-[10rem]"
        >
          <USelect
            v-model="entityType"
            :items="adminAuditEntityTypeOptions"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="相关对象编号"
          class="min-w-[12rem] flex-1"
        >
          <UInput
            v-model="entityId"
            class="w-full"
            placeholder="从账号、访客或封禁页跳转时自动填写"
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

      <div class="mt-4 max-h-[42rem] space-y-4 overflow-y-auto">
        <div
          v-for="group in auditDayGroups"
          :key="group.day"
        >
          <p class="sticky top-0 z-[1] mb-2 bg-white/90 py-1 text-xs font-semibold text-zinc-700 backdrop-blur">
            {{ group.day }} · {{ group.items.length }} 条
          </p>
          <ul class="space-y-2">
        <li
          v-for="row in group.items"
          :key="row.id"
          class="rounded-md border border-zinc-100 px-3 py-3 text-sm"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium text-zinc-900">
                  {{ actionLabel(row.action) }}
                </p>
              </div>
              <p class="mt-1 text-xs text-zinc-500">
                {{ entityLabel(row.entityType) }}
                <template v-if="row.entityId"> · 编号 {{ shortAdminId(row.entityId, 10) }}</template>
                · {{ formatTime(row.createdAt) }}
              </p>
              <p class="mt-1 text-xs text-zinc-400">
                操作人：{{ actorLabel(row) }}
                · {{ formatAdminRelativeTime(row.createdAt) }}
              </p>

              <div
                v-if="expanded[row.id]"
                class="mt-2 rounded-md border border-zinc-100 bg-zinc-50 p-3"
              >
                <dl class="mb-3 grid gap-1 text-xs text-zinc-500 sm:grid-cols-2">
                  <div><dt class="inline font-medium">操作记录：</dt><dd class="inline">{{ shortAdminId(row.id, 12) }}</dd></div>
                  <div v-if="row.requestId"><dt class="inline font-medium">请求记录：</dt><dd class="inline">{{ shortAdminId(row.requestId, 12) }}</dd></div>
                </dl>
                <dl
                  v-if="prettyAdminDetails(row.details).length"
                  class="space-y-1.5"
                >
                  <div
                    v-for="item in prettyAdminDetails(row.details)"
                    :key="item.key"
                    class="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]"
                  >
                    <dt class="text-xs font-medium text-zinc-500">
                      {{ detailLabel(item.key) }}
                    </dt>
                    <dd class="break-all text-xs text-zinc-800 whitespace-pre-wrap">
                      {{ item.value }}
                    </dd>
                  </div>
                </dl>
                <p
                  v-else
                  class="text-xs text-zinc-400"
                >
                  没有补充说明
                </p>
              </div>
            </div>
            <div class="flex shrink-0 flex-col gap-1">
              <UButton
                v-if="entityHref(row)"
                size="xs"
                color="primary"
                variant="soft"
                :to="entityHref(row) || undefined"
              >
                查看对象
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                @click="toggleExpand(row.id)"
              >
                {{ expanded[row.id] ? '收起详情' : '展开详情' }}
              </UButton>
            </div>
          </div>
        </li>
          </ul>
        </div>
        <p
          v-if="!items.length && !loading"
          class="py-10 text-center text-sm text-zinc-400"
        >
          暂无审计记录
        </p>
      </div>

      <div class="mt-3 flex items-center justify-between text-sm text-zinc-500">
        <span>共 {{ total }} 条 · 第 {{ page }} 页</span>
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
