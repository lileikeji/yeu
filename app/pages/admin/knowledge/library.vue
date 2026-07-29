<script setup lang="ts">
import { adminFetch } from '~~/app/utils/admin-request'
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '全部知识资料', robots: 'noindex, nofollow' })

type Collection = 'entries' | 'web' | 'documents' | 'claims' | 'structured'

interface LibraryItem {
  id: string
  title: string
  subtitle: string
  body: string
  category: string
  kind: string
  status: string
  url: string | null
  confidence: number | null
  capturedAt: number
}

interface LibrarySummary {
  retrievalTotal: number
  systemTotal: number
  entries: number
  activeEntries: number
  web: number
  activeWeb: number
  documents: number
  readyDocuments: number
  claims: number
  publishedClaims: number
  structured: number
  sources: number
}

const route = useRoute()
const router = useRouter()
const hasExplicitCollection = ['entries', 'web', 'documents', 'claims', 'structured'].includes(String(route.query.collection))
const collection = ref<Collection>(hasExplicitCollection
  ? route.query.collection as Collection
  : 'entries')
const queryText = ref(typeof route.query.q === 'string' ? route.query.q : '')
const category = ref(typeof route.query.category === 'string' ? route.query.category : '')
const page = ref(1)
const pageSize = 30
const loading = ref(false)
const errorMessage = ref('')
const shouldAutoSelectPopulatedCollection = ref(
  !hasExplicitCollection && !queryText.value.trim() && !category.value
)
const items = ref<LibraryItem[]>([])
const total = ref(0)
const summary = ref<LibrarySummary>({
  retrievalTotal: 0, systemTotal: 0, entries: 0, activeEntries: 0, web: 0,
  activeWeb: 0, documents: 0, readyDocuments: 0, claims: 0,
  publishedClaims: 0, structured: 0, sources: 0
})

const collections: Array<{ value: Collection, label: string, icon: string, count: keyof LibrarySummary }> = [
  { value: 'entries', label: '内置知识', icon: 'i-lucide-book-open-text', count: 'entries' },
  { value: 'structured', label: '平台实时数据', icon: 'i-lucide-refresh-cw', count: 'structured' },
  { value: 'documents', label: '官网正文', icon: 'i-lucide-library-big', count: 'documents' },
  { value: 'claims', label: '官网知识点', icon: 'i-lucide-sparkles', count: 'claims' },
  { value: 'web', label: '网页资料', icon: 'i-lucide-globe-2', count: 'web' }
]
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function formatDate(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value))
}

function statusLabel(value: string): string {
  return ({ active: '可检索', inactive: '已停用', ready: '已入索引', processing: '处理中', failed: '失败', expired: '已过期', rejected: '已拒绝' } as Record<string, string>)[value] ?? value
}

async function loadLibrary(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await adminFetch<{ items: LibraryItem[], total: number, summary: LibrarySummary }>('/api/admin/knowledge/library', {
      query: {
        collection: collection.value,
        page: page.value,
        pageSize,
        q: queryText.value.trim() || undefined,
        category: category.value || undefined
      }
    })
    items.value = result.items ?? []
    total.value = result.total ?? 0
    summary.value = result.summary ?? summary.value
    if (shouldAutoSelectPopulatedCollection.value) {
      shouldAutoSelectPopulatedCollection.value = false
      const populatedCollection = collections.find(item => Number(summary.value[item.count] ?? 0) > 0)?.value
      if (total.value === 0 && populatedCollection && populatedCollection !== collection.value) {
        collection.value = populatedCollection
        await loadLibrary()
        return
      }
    }
    await router.replace({
      query: {
        collection: collection.value,
        ...(queryText.value.trim() ? { q: queryText.value.trim() } : {}),
        ...(category.value ? { category: category.value } : {})
      }
    })
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    errorMessage.value = getRequestMessage(error, '知识资料加载失败')
  } finally {
    loading.value = false
  }
}

function switchCollection(value: Collection): void {
  shouldAutoSelectPopulatedCollection.value = false
  collection.value = value
  page.value = 1
  category.value = ''
  void loadLibrary()
}

function applySearch(): void {
  page.value = 1
  void loadLibrary()
}

function changePage(value: number): void {
  page.value = Math.max(1, Math.min(totalPages.value, value))
  void loadLibrary()
}

onMounted(loadLibrary)
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-5">
    <AdminPageHeader
      title="全部知识资料"
      description="查看 AI 实际会检索的内置知识、平台实时数据、官网正文和网页资料缓存。"
      icon="i-lucide-database"
      eyebrow="知识库"
    >
      <template #actions>
        <UButton
          to="/admin/knowledge/graph"
          icon="i-lucide-git-fork"
          label="知识图谱"
          color="neutral"
          variant="outline"
        />
        <UButton
          to="/admin/knowledge?view=review"
          icon="i-lucide-clipboard-check"
          label="审核事实"
          color="neutral"
          variant="outline"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="errorMessage"
      class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {{ errorMessage }}
    </div>

    <section
      class="grid grid-cols-2 gap-3 md:grid-cols-4"
      aria-label="知识资料统计"
    >
      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <p class="text-xs text-zinc-500">
          可检索资料
        </p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-zinc-950">
          {{ summary.retrievalTotal }}
        </p>
      </div>
      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <p class="text-xs text-zinc-500">
          系统结构化数据
        </p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-zinc-950">
          {{ summary.structured }}
        </p>
      </div>
      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <p class="text-xs text-zinc-500">
          已登记来源
        </p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-zinc-950">
          {{ summary.sources }}
        </p>
      </div>
      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <p class="text-xs text-zinc-500">
          人工审核事实
        </p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-zinc-950">
          {{ summary.claims }}
        </p>
      </div>
    </section>

    <section class="rounded-md border border-zinc-200 bg-white p-2">
      <div
        class="grid grid-cols-2 gap-1 md:grid-cols-4"
        role="tablist"
        aria-label="资料类型"
      >
        <button
          v-for="item in collections"
          :key="item.value"
          type="button"
          role="tab"
          :aria-selected="collection === item.value"
          class="flex min-h-11 items-center justify-center gap-2 rounded-md px-2 text-sm font-medium transition"
          :class="collection === item.value ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'"
          @click="switchCollection(item.value)"
        >
          <UIcon
            :name="item.icon"
            class="size-4 shrink-0"
          />
          <span>{{ item.label }}</span>
          <span class="tabular-nums opacity-70">{{ summary[item.count] }}</span>
        </button>
      </div>
    </section>

    <section class="rounded-md border border-zinc-200 bg-white p-4">
      <div class="flex flex-col gap-3 sm:flex-row">
        <UInput
          v-model="queryText"
          icon="i-lucide-search"
          class="min-w-0 flex-1"
          placeholder="搜索标题、问题或正文"
          @keyup.enter="applySearch"
        />
        <UButton
          icon="i-lucide-search"
          label="搜索"
          :loading="loading"
          @click="applySearch"
        />
      </div>
      <p
        v-if="category"
        class="mt-3 flex items-center gap-2 text-xs text-zinc-600"
      >
        当前筛选：{{ category }}
        <button
          type="button"
          class="text-green-700 hover:underline"
          @click="category = ''; applySearch()"
        >
          清除
        </button>
      </p>
    </section>

    <section aria-labelledby="library-list-title">
      <div class="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2
            id="library-list-title"
            class="text-sm font-bold text-zinc-950"
          >
            资料列表
          </h2>
          <p class="mt-1 text-xs text-zinc-500">
            当前找到 {{ total }} 条
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="ghost"
          :loading="loading"
          @click="loadLibrary"
        />
      </div>

      <div
        v-if="loading && !items.length"
        class="grid min-h-48 place-items-center text-zinc-500"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-6 animate-spin"
        />
      </div>
      <div
        v-else-if="!items.length"
        class="rounded-md border border-dashed border-zinc-300 bg-white px-4 py-14 text-center text-sm text-zinc-500"
      >
        没有找到符合条件的资料
      </div>
      <ul
        v-else
        class="grid gap-3 lg:grid-cols-2"
      >
        <li
          v-for="item in items"
          :key="item.id"
          class="rounded-md border border-zinc-200 bg-white p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <UBadge
                  :label="statusLabel(item.status)"
                  color="success"
                  variant="soft"
                />
                <span class="text-zinc-500">{{ item.category }}</span>
                <span
                  v-if="item.confidence !== null"
                  class="text-zinc-500"
                >可信度 {{ item.confidence }}</span>
              </div>
              <h3 class="mt-2 break-words text-sm font-bold leading-6 text-zinc-950">
                {{ item.title }}
              </h3>
              <p
                v-if="item.subtitle && item.subtitle !== item.category"
                class="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500"
              >
                {{ item.subtitle }}
              </p>
            </div>
            <UButton
              v-if="item.url"
              :to="item.url"
              target="_blank"
              icon="i-lucide-external-link"
              aria-label="打开资料来源"
              color="neutral"
              variant="ghost"
              size="sm"
            />
          </div>
          <p class="mt-3 line-clamp-5 whitespace-pre-line text-sm leading-6 text-zinc-700">
            {{ item.body }}
          </p>
          <p class="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            {{ formatDate(item.capturedAt) }}
          </p>
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
        <span class="text-xs tabular-nums text-zinc-500">{{ page }} / {{ totalPages }}</span>
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
  </div>
</template>
