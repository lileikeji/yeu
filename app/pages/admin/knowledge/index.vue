<script setup lang="ts">
import { adminFetch } from '~~/app/utils/admin-request'
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'

// The knowledge library is the primary view; claim review remains an explicit workflow.
definePageMeta({
  layout: 'admin',
  middleware: [to => {
    if (to.query.view === 'review' || to.query.action === 'create') return
    return navigateTo('/admin/knowledge/library', { replace: true })
  }]
})
useSeoMeta({ title: '知识库管理', robots: 'noindex, nofollow' })

type ReviewStatus = 'draft' | 'review' | 'published' | 'rejected' | 'archived'
type ConfidenceLabel = 'extracted' | 'inferred' | 'ambiguous' | 'unverified'

type ClaimSource = {
  id?: string
  sourceId: string
  documentId: string | null
  evidenceQuote: string
  locator: string
  isPrimary: boolean
  sourceTitle?: string | null
  sourceUrl?: string | null
  sourceLevel?: string | null
}

type ClaimRow = {
  id: string
  category: string
  title: string
  statement: string
  keywords: string[]
  confidenceLabel: ConfidenceLabel
  confidenceScore: number
  reviewStatus: ReviewStatus
  publicUrl: string | null
  sourceNote: string
  validFrom: string | null
  validUntil: string | null
  publishedAt: string | null
  updatedAt: string
  sources: ClaimSource[]
}

type Health = {
  claims: Record<string, number>
  issues: {
    missingSource: number
    expired: number
    publishedUnverified: number
    openConflicts: number
    orphanEntities: number
  }
  documents: Record<string, number>
  crawl: Record<string, number>
  categories: Array<{ category: string, value: number }>
}

type SourceOption = {
  id: string
  title: string
  sourceLevel: string
  status: string
  isOfficial: boolean
}

const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const items = ref<ClaimRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 30
const queryText = ref('')
const statusFilter = ref('all')
const confidenceFilter = ref('all')
const issueFilter = ref('all')
const sources = ref<SourceOption[]>([])
const editorDialog = ref<HTMLDialogElement | null>(null)
const editingId = ref<string | null>(null)

const emptyHealth = (): Health => ({
  claims: {},
  issues: { missingSource: 0, expired: 0, publishedUnverified: 0, openConflicts: 0, orphanEntities: 0 },
  documents: {},
  crawl: {},
  categories: []
})
const health = ref<Health>(emptyHealth())

const form = reactive({
  category: '',
  title: '',
  statement: '',
  keywordsText: '',
  confidenceLabel: 'unverified' as ConfidenceLabel,
  confidenceScore: 50,
  reviewStatus: 'draft' as ReviewStatus,
  publicUrl: '',
  sourceNote: '',
  validFrom: '',
  validUntil: '',
  sources: [] as ClaimSource[]
})

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '草稿', value: 'draft' },
  { label: '待审核', value: 'review' },
  { label: '已发布', value: 'published' },
  { label: '已拒绝', value: 'rejected' },
  { label: '已归档', value: 'archived' }
]
const confidenceOptions = [
  { label: '全部可信状态', value: 'all' },
  { label: '原文提取', value: 'extracted' },
  { label: '综合推断', value: 'inferred' },
  { label: '存在歧义', value: 'ambiguous' },
  { label: '尚未核实', value: 'unverified' }
]
const editorConfidenceOptions = confidenceOptions.slice(1)
const editorStatusOptions = statusOptions.slice(1)
const issueOptions = [
  { label: '全部内容', value: 'all' },
  { label: '缺少来源', value: 'missing-source' },
  { label: '已经过期', value: 'expired' },
  { label: '尚未核实', value: 'unverified' },
  { label: '存在冲突', value: 'conflict' }
]
const sourceOptions = computed(() => sources.value.map(source => ({
  label: `${source.sourceLevel}级 · ${source.title}`,
  value: source.id
})))
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const healthCards = computed(() => [
  { label: '全部事实', value: health.value.claims.total ?? 0, icon: 'i-lucide-database', issue: 'all' },
  { label: '待审核', value: health.value.claims.review ?? 0, icon: 'i-lucide-clipboard-check', status: 'review' },
  { label: '已发布', value: health.value.claims.published ?? 0, icon: 'i-lucide-badge-check', status: 'published' },
  { label: '官网正文', value: health.value.documents.ready ?? 0, icon: 'i-lucide-library-big' },
  { label: '待抓页面', value: health.value.crawl.pending ?? 0, icon: 'i-lucide-list-restart' },
  { label: '抓取失败', value: health.value.crawl.failed ?? 0, icon: 'i-lucide-circle-alert' },
  { label: '缺少来源', value: health.value.issues.missingSource, icon: 'i-lucide-unlink', issue: 'missing-source' },
  { label: '已过期', value: health.value.issues.expired, icon: 'i-lucide-calendar-x-2', issue: 'expired' },
  { label: '冲突待处理', value: health.value.issues.openConflicts, icon: 'i-lucide-git-compare-arrows', issue: 'conflict' }
])

function statusLabel(value: ReviewStatus): string {
  return statusOptions.find(item => item.value === value)?.label ?? value
}

function confidenceLabel(value: ConfidenceLabel): string {
  return confidenceOptions.find(item => item.value === value)?.label ?? value
}

function statusColor(value: ReviewStatus): 'neutral' | 'warning' | 'success' | 'error' | 'info' {
  if (value === 'published') return 'success'
  if (value === 'review') return 'warning'
  if (value === 'rejected') return 'error'
  if (value === 'archived') return 'neutral'
  return 'info'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value))
}

function toLocalInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

async function loadSources(): Promise<void> {
  const result = await adminFetch<{ items: SourceOption[] }>('/api/admin/sources', {
    query: { page: 1, pageSize: 100, status: 'active' }
  })
  sources.value = result.items ?? []
}

async function loadClaims(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await adminFetch<{ items: ClaimRow[], total: number, health: Health }>('/api/admin/knowledge', {
      query: {
        page: page.value,
        pageSize,
        q: queryText.value.trim() || undefined,
        status: statusFilter.value === 'all' ? undefined : statusFilter.value,
        confidenceLabel: confidenceFilter.value === 'all' ? undefined : confidenceFilter.value,
        issue: issueFilter.value === 'all' ? undefined : issueFilter.value
      }
    })
    items.value = result.items ?? []
    total.value = result.total ?? 0
    health.value = result.health ?? emptyHealth()
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    errorMessage.value = getRequestMessage(error, '知识库加载失败')
  } finally {
    loading.value = false
  }
}

function resetForm(): void {
  editingId.value = null
  Object.assign(form, {
    category: '', title: '', statement: '', keywordsText: '',
    confidenceLabel: 'unverified', confidenceScore: 50, reviewStatus: 'draft',
    publicUrl: '', sourceNote: '', validFrom: '', validUntil: '', sources: []
  })
}

function openCreate(): void {
  resetForm()
  editorDialog.value?.showModal()
}

function openEdit(row: ClaimRow): void {
  editingId.value = row.id
  Object.assign(form, {
    category: row.category,
    title: row.title,
    statement: row.statement,
    keywordsText: row.keywords.join('、'),
    confidenceLabel: row.confidenceLabel,
    confidenceScore: row.confidenceScore,
    reviewStatus: row.reviewStatus,
    publicUrl: row.publicUrl ?? '',
    sourceNote: row.sourceNote,
    validFrom: toLocalInput(row.validFrom),
    validUntil: toLocalInput(row.validUntil),
    sources: row.sources.map(source => ({
      sourceId: source.sourceId,
      documentId: source.documentId,
      evidenceQuote: source.evidenceQuote,
      locator: source.locator,
      isPrimary: source.isPrimary
    }))
  })
  editorDialog.value?.showModal()
}

function closeEditor(): void {
  editorDialog.value?.close()
}

function addSource(): void {
  const sourceId = sourceOptions.value.find(option => !form.sources.some(source => source.sourceId === option.value))?.value
  if (!sourceId) return
  form.sources.push({
    sourceId,
    documentId: null,
    evidenceQuote: '',
    locator: '',
    isPrimary: form.sources.length === 0
  })
}

function removeSource(index: number): void {
  const wasPrimary = form.sources[index]?.isPrimary
  form.sources.splice(index, 1)
  if (wasPrimary && form.sources[0]) form.sources[0].isPrimary = true
}

function setPrimary(index: number): void {
  form.sources.forEach((source, sourceIndex) => {
    source.isPrimary = sourceIndex === index
  })
}

async function saveClaim(): Promise<void> {
  saving.value = true
  errorMessage.value = ''
  try {
    const payload = {
      category: form.category,
      title: form.title,
      statement: form.statement,
      keywords: form.keywordsText.split(/[、,，\n]/).map(item => item.trim()).filter(Boolean),
      confidenceLabel: form.confidenceLabel,
      confidenceScore: Number(form.confidenceScore),
      reviewStatus: form.reviewStatus,
      publicUrl: form.publicUrl || null,
      sourceNote: form.sourceNote,
      validFrom: toIso(form.validFrom),
      validUntil: toIso(form.validUntil),
      supersedesClaimId: null,
      sources: form.sources.map((source, index) => ({
        sourceId: source.sourceId,
        documentId: source.documentId,
        evidenceQuote: source.evidenceQuote,
        locator: source.locator,
        isPrimary: source.isPrimary || index === 0
      }))
    }
    if (editingId.value) {
      await adminFetch(`/api/admin/knowledge/${editingId.value}`, { method: 'PATCH', body: payload })
    } else {
      await adminFetch('/api/admin/knowledge', { method: 'POST', body: payload })
    }
    closeEditor()
    await loadClaims()
  } catch (error) {
    errorMessage.value = getRequestMessage(error, '知识保存失败，请检查来源、证据和审核状态')
  } finally {
    saving.value = false
  }
}

async function archiveClaim(row: ClaimRow): Promise<void> {
  if (!window.confirm(`确认归档“${row.title}”？归档后问答不再使用这条内容。`)) return
  try {
    await adminFetch(`/api/admin/knowledge/${row.id}`, { method: 'DELETE' })
    await loadClaims()
  } catch (error) {
    errorMessage.value = getRequestMessage(error, '归档失败')
  }
}

function applyFilters(): void {
  page.value = 1
  void loadClaims()
}

function applyHealthFilter(card: { issue?: string, status?: string }): void {
  issueFilter.value = card.issue ?? 'all'
  statusFilter.value = card.status ?? 'all'
  applyFilters()
}

function changePage(value: number): void {
  page.value = Math.max(1, Math.min(totalPages.value, value))
  void loadClaims()
}

onMounted(async () => {
  await Promise.all([loadSources(), loadClaims()])
  if (route.query.action === 'create') openCreate()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-5">
    <AdminPageHeader
      title="知识库"
      icon="i-lucide-brain-circuit"
      eyebrow="内容管理"
    >
      <template #actions>
        <UButton
          to="/admin/knowledge/library"
          icon="i-lucide-database"
          label="全部资料"
          color="neutral"
          variant="outline"
        />
        <UButton
          to="/admin/knowledge/graph"
          icon="i-lucide-git-fork"
          label="关联视图"
          color="neutral"
          variant="outline"
        />
        <UButton
          to="/admin/sources"
          icon="i-lucide-book-marked"
          label="来源"
          color="neutral"
          variant="outline"
        />
        <UButton
          icon="i-lucide-plus"
          label="新增知识"
          @click="openCreate"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="errorMessage"
      class="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-300"
    >
      {{ errorMessage }}
    </div>

    <section
      class="grid grid-cols-2 gap-3 lg:grid-cols-6"
      aria-label="知识库概况"
    >
      <button
        v-for="card in healthCards"
        :key="card.label"
        type="button"
        class="min-h-24 rounded-md border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 text-left transition hover:border-green-400 dark:hover:border-green-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
        @click="applyHealthFilter(card)"
      >
        <UIcon
          :name="card.icon"
          class="size-4 text-green-700 dark:text-green-400"
        />
        <p class="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          {{ card.label }}
        </p>
        <p class="mt-1 text-xl font-bold tabular-nums text-zinc-950 dark:text-zinc-100">
          {{ card.value }}
        </p>
      </button>
    </section>

    <section class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4">
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_11rem_11rem_auto] md:items-end">
        <UFormField label="关键词">
          <UInput
            v-model="queryText"
            class="w-full"
            placeholder="标题、正文或分类"
            @keyup.enter="applyFilters"
          />
        </UFormField>
        <UFormField label="状态">
          <USelect
            v-model="statusFilter"
            :items="statusOptions"
            class="w-full"
          />
        </UFormField>
        <UFormField label="可信状态">
          <USelect
            v-model="confidenceFilter"
            :items="confidenceOptions"
            class="w-full"
          />
        </UFormField>
        <UFormField label="问题项">
          <USelect
            v-model="issueFilter"
            :items="issueOptions"
            class="w-full"
          />
        </UFormField>
        <UButton
          icon="i-lucide-search"
          label="查询"
          :loading="loading"
          @click="applyFilters"
        />
      </div>
    </section>

    <section aria-labelledby="knowledge-list-title">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2
            id="knowledge-list-title"
            class="text-sm font-bold text-zinc-950 dark:text-zinc-100"
          >
            知识事实
          </h2>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            当前筛选 {{ total }} 条
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="ghost"
          :loading="loading"
          @click="loadClaims"
        />
      </div>

      <div
        v-if="loading && !items.length"
        class="grid min-h-48 place-items-center text-sm text-zinc-500 dark:text-zinc-400"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-6 animate-spin text-green-700 dark:text-green-400"
        />
      </div>
      <div
        v-else-if="!items.length"
        class="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-900 px-4 py-14 text-center text-sm text-zinc-500 dark:text-zinc-400"
      >
        暂无符合条件的知识
      </div>
      <ul
        v-else
        class="grid gap-3 lg:grid-cols-2"
      >
        <li
          v-for="row in items"
          :key="row.id"
          class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :label="statusLabel(row.reviewStatus)"
                  :color="statusColor(row.reviewStatus)"
                  variant="soft"
                />
                <UBadge
                  :label="confidenceLabel(row.confidenceLabel)"
                  color="neutral"
                  variant="soft"
                />
                <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ row.category }}</span>
              </div>
              <h3 class="mt-2 break-words text-sm font-bold leading-6 text-zinc-950 dark:text-zinc-100">
                {{ row.title }}
              </h3>
            </div>
            <div class="flex shrink-0 gap-1">
              <UButton
                icon="i-lucide-pencil"
                aria-label="编辑知识"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="openEdit(row)"
              />
              <UButton
                icon="i-lucide-archive"
                aria-label="归档知识"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="archiveClaim(row)"
              />
            </div>
          </div>
          <p class="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-6 text-zinc-700 dark:text-zinc-200">
            {{ row.statement }}
          </p>
          <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span>可信度 {{ row.confidenceScore }}</span>
            <span>{{ row.sources.length }} 个来源</span>
            <span>{{ formatDate(row.updatedAt) }}</span>
          </div>
        </li>
      </ul>

      <div
        v-if="totalPages > 1"
        class="mt-4 flex items-center justify-between"
      >
        <UButton
          icon="i-lucide-chevron-left"
          label="上一页"
          color="neutral"
          variant="outline"
          :disabled="page <= 1"
          @click="changePage(page - 1)"
        />
        <span class="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{{ page }} / {{ totalPages }}</span>
        <UButton
          icon="i-lucide-chevron-right"
          trailing
          label="下一页"
          color="neutral"
          variant="outline"
          :disabled="page >= totalPages"
          @click="changePage(page + 1)"
        />
      </div>
    </section>

    <dialog
      ref="editorDialog"
      class="m-auto max-h-[92dvh] w-[min(94vw,860px)] overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-0 shadow-2xl backdrop:bg-black/45"
      @close="resetForm"
    >
      <form
        class="flex max-h-[92dvh] flex-col"
        @submit.prevent="saveClaim"
      >
        <header class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
          <div>
            <h2 class="text-base font-bold text-zinc-950 dark:text-zinc-100">
              {{ editingId ? '编辑知识' : '新增知识' }}
            </h2>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {{ editingId ? editingId.slice(0, 12) : '先保存草稿，再提交审核' }}
            </p>
          </div>
          <UButton
            type="button"
            icon="i-lucide-x"
            aria-label="关闭"
            color="neutral"
            variant="ghost"
            @click="closeEditor"
          />
        </header>

        <div class="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="分类"
              required
            >
              <UInput
                v-model="form.category"
                class="w-full"
                placeholder="如：住宿、奖学金、教职工"
                required
              />
            </UFormField>
            <UFormField
              label="标题"
              required
            >
              <UInput
                v-model="form.title"
                class="w-full"
                required
              />
            </UFormField>
          </div>
          <UFormField
            label="事实内容"
            required
          >
            <UTextarea
              v-model="form.statement"
              class="w-full"
              :rows="7"
              autoresize
              required
            />
          </UFormField>
          <UFormField label="查找词">
            <UInput
              v-model="form.keywordsText"
              class="w-full"
              placeholder="用顿号或逗号分隔"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField label="可信状态">
              <USelect
                v-model="form.confidenceLabel"
                :items="editorConfidenceOptions"
                class="w-full"
              />
            </UFormField>
            <UFormField label="可信度">
              <UInput
                v-model.number="form.confidenceScore"
                type="number"
                min="0"
                max="100"
                class="w-full"
              />
            </UFormField>
            <UFormField label="审核状态">
              <USelect
                v-model="form.reviewStatus"
                :items="editorStatusOptions"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="开始生效">
              <UInput
                v-model="form.validFrom"
                type="datetime-local"
                class="w-full"
              />
            </UFormField>
            <UFormField label="失效时间">
              <UInput
                v-model="form.validUntil"
                type="datetime-local"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField label="前台入口">
            <UInput
              v-model="form.publicUrl"
              class="w-full"
              placeholder="/页面路径或 https:// 地址"
            />
          </UFormField>
          <UFormField label="内部备注">
            <UTextarea
              v-model="form.sourceNote"
              class="w-full"
              :rows="2"
            />
          </UFormField>

          <section aria-labelledby="claim-sources-title">
            <div class="flex items-center justify-between gap-3">
              <h3
                id="claim-sources-title"
                class="text-sm font-bold text-zinc-950 dark:text-zinc-100"
              >
                证据来源
              </h3>
              <UButton
                type="button"
                icon="i-lucide-plus"
                label="添加来源"
                size="sm"
                color="neutral"
                variant="outline"
                :disabled="!sourceOptions.length"
                @click="addSource"
              />
            </div>
            <p
              v-if="!form.sources.length"
              class="mt-3 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-5 text-center text-xs text-zinc-500 dark:text-zinc-400"
            >
              待审核和已发布内容必须添加来源
            </p>
            <div
              v-for="(source, index) in form.sources"
              :key="`${source.sourceId}-${index}`"
              class="mt-3 border-t border-zinc-200 dark:border-zinc-800 pt-4"
            >
              <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
                <UFormField label="来源">
                  <USelect
                    v-model="source.sourceId"
                    :items="sourceOptions"
                    class="w-full"
                  />
                </UFormField>
                <UButton
                  type="button"
                  :icon="source.isPrimary ? 'i-lucide-star' : 'i-lucide-star-off'"
                  :label="source.isPrimary ? '主要来源' : '设为主要'"
                  color="neutral"
                  variant="outline"
                  @click="setPrimary(index)"
                />
                <UButton
                  type="button"
                  icon="i-lucide-trash-2"
                  aria-label="移除来源"
                  color="error"
                  variant="ghost"
                  @click="removeSource(index)"
                />
              </div>
              <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <UFormField label="原文证据">
                  <UTextarea
                    v-model="source.evidenceQuote"
                    class="w-full"
                    :rows="3"
                  />
                </UFormField>
                <UFormField label="页码或章节">
                  <UInput
                    v-model="source.locator"
                    class="w-full"
                    placeholder="第 12 页 / 第三章"
                  />
                </UFormField>
              </div>
            </div>
          </section>
        </div>

        <footer class="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-5 py-4">
          <UButton
            type="button"
            label="取消"
            color="neutral"
            variant="outline"
            @click="closeEditor"
          />
          <UButton
            type="submit"
            icon="i-lucide-save"
            label="保存"
            :loading="saving"
          />
        </footer>
      </form>
    </dialog>
  </div>
</template>
