<script setup lang="ts">
import { adminFetch } from '~~/app/utils/admin-request'
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'AI 检索统计', robots: 'noindex, nofollow' })

type AssistantRunRow = {
  id: string
  requestId: string
  query: string
  mode: 'local' | 'ai' | 'error'
  retrievalPath: string
  usedWebSearch: boolean
  cacheHit: boolean
  success: boolean
  errorCode: string | null
  analysisMs: number
  featureApiMs: number
  databaseMs: number
  webCacheMs: number
  webSearchMs: number
  answerMs: number
  totalMs: number
  firstTokenMs: number | null
  citationCount: number
  ipAddress: string | null
  createdAt: string
}

type AssistantRunStats = {
  total: number
  successRate: number
  webSearchRate: number
  cacheHitRate: number
  averageMs: number
  p95Ms: number
}

type AssistantStageDurationKey = 'analysisMs' | 'featureApiMs' | 'databaseMs' | 'webCacheMs' | 'webSearchMs' | 'answerMs'

const assistantStageDefinitions: Array<{ key: AssistantStageDurationKey, label: string }> = [
  { key: 'analysisMs', label: '分析问题' },
  { key: 'featureApiMs', label: '系统 API' },
  { key: 'databaseMs', label: '内置数据库' },
  { key: 'webCacheMs', label: '网页缓存' },
  { key: 'webSearchMs', label: '网页搜索' },
  { key: 'answerMs', label: '整理答案' }
]

const loading = ref(false)
const errorMessage = ref('')
const items = ref<AssistantRunRow[]>([])
const total = ref(0)
const stats = ref<AssistantRunStats>({
  total: 0,
  successRate: 0,
  webSearchRate: 0,
  cacheHitRate: 0,
  averageMs: 0,
  p95Ms: 0
})
const page = ref(1)
const pageSize = 30
const queryText = ref('')
const retrievalPath = ref('all')
const success = ref('all')
const expanded = ref<Record<string, boolean>>({})

const pathOptions = [
  { label: '全部路径', value: 'all' },
  { label: '系统 API', value: 'feature_api' },
  { label: '内置数据库', value: 'local_database' },
  { label: '答案缓存', value: 'answer_cache' },
  { label: '网页资料缓存', value: 'web_cache' },
  { label: '网页搜索', value: 'web_search' },
  { label: '失败', value: 'error' }
]
const successOptions = [
  { label: '全部结果', value: 'all' },
  { label: '成功', value: 'true' },
  { label: '失败', value: 'false' }
]
const statCards = computed(() => [
  { label: '检索次数', value: stats.value.total.toLocaleString('zh-CN'), icon: 'i-lucide-messages-square' },
  { label: '成功率', value: formatPercent(stats.value.successRate), icon: 'i-lucide-circle-check' },
  { label: '网页调用占比', value: formatPercent(stats.value.webSearchRate), icon: 'i-lucide-globe' },
  { label: '缓存命中率', value: formatPercent(stats.value.cacheHitRate), icon: 'i-lucide-database-zap' },
  { label: '平均耗时', value: formatDuration(stats.value.averageMs), icon: 'i-lucide-timer' },
  { label: 'P95 耗时', value: formatDuration(stats.value.p95Ms), icon: 'i-lucide-gauge' }
])
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}

function formatDuration(value: number): string {
  if (value <= 0) return '0 秒'
  if (value < 100) return '<0.1 秒'
  if (value < 10_000) return `${(value / 1000).toFixed(1)} 秒`
  return `${Math.round(value / 1000)} 秒`
}

function visibleStages(row: AssistantRunRow): Array<{ key: AssistantStageDurationKey, label: string, durationMs: number }> {
  return assistantStageDefinitions
    .map(stage => ({ ...stage, durationMs: row[stage.key] }))
    .filter(stage => stage.durationMs > 0)
}

function requestOrigin(row: AssistantRunRow): string {
  if (row.requestId.startsWith('bot:qq:')) return 'QQ 机器人请求，不产生网页访客 IP'
  if (row.requestId.startsWith('bot:wechat:')) return '微信机器人请求，不产生网页访客 IP'
  return row.ipAddress ? `网页请求 · ${row.ipAddress}` : '网页请求 · IP 未记录'
}

function errorDescription(code: string): string {
  const descriptions: Record<string, string> = {
    AI_GATEWAY_401: 'AI 中转鉴权失败',
    AI_GATEWAY_403: 'AI 中转拒绝请求',
    AI_CIRCUIT_OPEN: 'AI 中转连续失败，熔断保护已开启',
    AI_CONTENT_BLOCKED: '内容安全规则拒绝回答',
    AI_BUSY: 'AI 当前请求过多',
    AI_NOT_CONFIGURED: 'AI 中转尚未配置'
  }
  return descriptions[code] ?? '问答处理失败'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value))
}

function pathLabel(value: string): string {
  return pathOptions.find(item => item.value === value)?.label ?? value
}

function shortValue(value: string | null, length = 12): string {
  if (!value) return '—'
  return value.length > length ? `${value.slice(0, length)}…` : value
}

function toggleExpanded(id: string): void {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
}

async function loadRuns(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const payload = await adminFetch<{
      items: AssistantRunRow[]
      total: number
      stats: AssistantRunStats
    }>('/api/admin/assistant', {
      query: {
        page: page.value,
        pageSize,
        q: queryText.value.trim() || undefined,
        retrievalPath: retrievalPath.value === 'all' ? undefined : retrievalPath.value,
        success: success.value === 'all' ? undefined : success.value
      }
    })
    items.value = payload.items ?? []
    total.value = payload.total ?? 0
    stats.value = payload.stats ?? stats.value
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    errorMessage.value = getRequestMessage(error, 'AI 检索记录加载失败')
  } finally {
    loading.value = false
  }
}

function applyFilters(): void {
  page.value = 1
  void loadRuns()
}

function changePage(nextPage: number): void {
  page.value = Math.min(totalPages.value, Math.max(1, nextPage))
  void loadRuns()
}

onMounted(() => void loadRuns())
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <AdminPageHeader
      title="AI 检索统计"
      description="查看问答走了哪条检索路径、各阶段耗时、网页调用和失败情况。"
      icon="i-lucide-bot"
      eyebrow="用户与互动"
    >
      <template #actions>
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
          @click="loadRuns"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="errorMessage"
      class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {{ errorMessage }}
    </div>

    <section class="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label="AI 检索概览">
      <div
        v-for="card in statCards"
        :key="card.label"
        class="rounded-md border border-zinc-200 bg-white p-4"
      >
        <UIcon :name="card.icon" class="size-4 text-green-700" />
        <p class="mt-3 text-xs text-zinc-500">{{ card.label }}</p>
        <p class="mt-1 text-lg font-bold tabular-nums text-zinc-950">{{ card.value }}</p>
      </div>
    </section>

    <section class="rounded-md border border-zinc-200 bg-white p-4">
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_10rem_auto] md:items-end">
        <UFormField label="问题关键词">
          <UInput
            v-model="queryText"
            class="w-full"
            placeholder="搜索用户问题"
            @keyup.enter="applyFilters"
          />
        </UFormField>
        <UFormField label="检索路径">
          <USelect v-model="retrievalPath" :items="pathOptions" class="w-full" />
        </UFormField>
        <UFormField label="运行结果">
          <USelect v-model="success" :items="successOptions" class="w-full" />
        </UFormField>
        <UButton icon="i-lucide-search" label="查询" :loading="loading" @click="applyFilters" />
      </div>
    </section>

    <section class="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <div class="border-b border-zinc-100 px-4 py-3">
        <h2 class="text-sm font-bold text-zinc-950">运行记录</h2>
        <p class="mt-1 text-xs text-zinc-500">当前筛选共 {{ total }} 次</p>
      </div>

      <div v-if="loading && !items.length" class="grid min-h-48 place-items-center text-sm text-zinc-500">
        <UIcon name="i-lucide-loader-circle" class="mb-2 size-5 animate-spin text-green-700" />
        正在加载
      </div>
      <div v-else-if="!items.length" class="grid min-h-48 place-items-center px-4 text-sm text-zinc-500">
        暂无符合条件的 AI 检索记录
      </div>
      <ul v-else class="divide-y divide-zinc-100">
        <li v-for="row in items" :key="row.id" class="px-4 py-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :label="row.success ? '成功' : '失败'"
                  :color="row.success ? 'success' : 'error'"
                  variant="soft"
                  size="sm"
                />
                <UBadge :label="pathLabel(row.retrievalPath)" color="neutral" variant="soft" size="sm" />
                <span v-if="row.cacheHit" class="text-xs font-medium text-emerald-700">缓存命中</span>
              </div>
              <p class="mt-2 break-words text-sm font-medium leading-6 text-zinc-900">{{ row.query }}</p>
              <p class="mt-1 text-xs text-zinc-500">
                {{ formatDate(row.createdAt) }} · 总耗时 {{ formatDuration(row.totalMs) }} · 首字
                {{ row.firstTokenMs ? formatDuration(row.firstTokenMs) : '—' }} · {{ row.citationCount }} 条引用
              </p>
            </div>
            <UButton
              :icon="expanded[row.id] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              :label="expanded[row.id] ? '收起' : '详情'"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="toggleExpanded(row.id)"
            />
          </div>

          <div v-if="expanded[row.id]" class="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
            <dl class="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              <div
                v-for="stage in visibleStages(row)"
                :key="stage.key"
              >
                <dt class="text-zinc-400">
                  {{ stage.label }}
                </dt>
                <dd class="mt-0.5">
                  {{ formatDuration(stage.durationMs) }}
                </dd>
              </div>
              <div
                v-if="visibleStages(row).length === 0"
                class="sm:col-span-2"
              >
                <dt class="text-zinc-400">
                  执行阶段
                </dt>
                <dd class="mt-0.5">
                  请求在进入可计时检索阶段前失败
                </dd>
              </div>
              <div>
                <dt class="text-zinc-400">
                  请求来源
                </dt>
                <dd class="mt-0.5">
                  {{ requestOrigin(row) }}
                </dd>
              </div>
              <div>
                <dt class="text-zinc-400">
                  首字耗时
                </dt>
                <dd class="mt-0.5">
                  {{ row.firstTokenMs ? formatDuration(row.firstTokenMs) : '—' }}
                </dd>
              </div>
              <div>
                <dt class="text-zinc-400">
                  请求编号
                </dt>
                <dd
                  class="mt-0.5"
                  :title="row.requestId"
                >
                  {{ shortValue(row.requestId) }}
                </dd>
              </div>
            </dl>
            <p v-if="row.errorCode" class="mt-3 text-red-700">
              {{ errorDescription(row.errorCode) }}（{{ row.errorCode }}）
            </p>
          </div>
        </li>
      </ul>

      <div v-if="totalPages > 1" class="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
        <UButton
          icon="i-lucide-chevron-left"
          label="上一页"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="page <= 1"
          @click="changePage(page - 1)"
        />
        <span class="text-xs tabular-nums text-zinc-500">{{ page }} / {{ totalPages }}</span>
        <UButton
          icon="i-lucide-chevron-right"
          trailing
          label="下一页"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="page >= totalPages"
          @click="changePage(page + 1)"
        />
      </div>
    </section>
  </div>
</template>
