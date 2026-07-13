<script setup lang="ts">
import { campusMapReferencePlaces } from '~~/data/seeds/preview-places'
import { freshmanGuides, officialDepartments } from '~~/data/seeds/public-content'
import type { ContentKind } from '~~/shared/constants/server'

useSeoMeta({
  title: '全站搜索',
  description: '搜索仰恩大学新生指南中的地点、指南、部门、社团和公告。',
  robots: 'noindex, follow'
})

interface ApiSearchItem {
  entityType: 'place' | 'content' | 'procedure'
  id: string
  slug: string
  title: string
  summary: string
  category: string | null
  kind: 'guide' | 'department' | 'club' | 'notice' | null
  updatedAt: string
}

interface ApiSearchResponse {
  query: string
  items: ApiSearchItem[]
  total: number
  hasManagedContent: boolean
  managedKinds: ContentKind[]
}

interface SearchResult {
  key: string
  title: string
  summary: string
  typeLabel: string
  icon: string
  to: string
  sourceLabel: string
}

const route = useRoute()
const router = useRouter()

function routeQuery(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/[\s（）()\-_/]/g, '')
}

function matches(query: string, values: Array<string | null | undefined>): boolean {
  const needle = normalize(query)
  return Boolean(needle) && normalize(values.filter(Boolean).join(' ')).includes(needle)
}

function apiTarget(item: ApiSearchItem): string {
  if (item.entityType === 'place') return `/map?place=${encodeURIComponent(item.slug)}`
  if (item.entityType === 'procedure') return `/procedures/${encodeURIComponent(item.slug)}`
  if (item.kind === 'guide') return `/guides/${encodeURIComponent(item.slug)}`
  if (item.kind === 'department') return `/departments/${encodeURIComponent(item.slug)}`
  if (item.kind === 'club') return `/clubs/${encodeURIComponent(item.slug)}`
  return `/campus#notice-${encodeURIComponent(item.slug)}`
}

function apiPresentation(item: ApiSearchItem): Pick<SearchResult, 'typeLabel' | 'icon'> {
  if (item.entityType === 'place') return { typeLabel: '地点', icon: 'i-lucide-map-pin' }
  if (item.entityType === 'procedure') return { typeLabel: '流程', icon: 'i-lucide-list-checks' }
  if (item.kind === 'department') return { typeLabel: '部门', icon: 'i-lucide-landmark' }
  if (item.kind === 'club') return { typeLabel: '社团', icon: 'i-lucide-users-round' }
  if (item.kind === 'notice') return { typeLabel: '公告', icon: 'i-lucide-megaphone' }
  return { typeLabel: '指南', icon: 'i-lucide-notebook-tabs' }
}

const activeQuery = computed(() => routeQuery(route.query.q).trim())
const searchInput = ref(activeQuery.value)
let searchNavigationSequence = 0
let latestSubmittedQuery = activeQuery.value
let pendingSearchNavigations = 0
const requestFetch = useRequestFetch()
const { data: response, error: responseError, status: searchStatus } = await useAsyncData<ApiSearchResponse>(
  'public-search',
  () => {
    if (!activeQuery.value) {
      return Promise.resolve({
        query: '',
        items: [],
        total: 0,
        hasManagedContent: false,
        managedKinds: []
      })
    }

    return requestFetch<ApiSearchResponse>('/api/public/search', {
      query: { q: activeQuery.value, limit: 40 }
    })
  },
  { watch: [activeQuery], dedupe: 'cancel' }
)
const currentResponse = computed(() => (
  response.value?.query.trim() === activeQuery.value ? response.value : null
))
const searching = computed(() => searchStatus.value === 'pending')
const searchError = computed(() => responseError.value
  ? '动态搜索暂时不可用，仍可查看官网地图文字索引。'
  : '')

async function submitSearch(): Promise<void> {
  const query = searchInput.value.trim()
  const navigationId = ++searchNavigationSequence
  latestSubmittedQuery = query
  const current = routeQuery(route.query.q)
  if (current === query) return
  pendingSearchNavigations += 1
  try {
    await router.replace({ query: query ? { q: query } : undefined })
  } finally {
    pendingSearchNavigations -= 1
  }

  if (navigationId !== searchNavigationSequence && routeQuery(route.query.q) !== latestSubmittedQuery) {
    await router.replace({
      query: latestSubmittedQuery ? { q: latestSubmittedQuery } : undefined
    })
  }
}

function clearSearch(): void {
  searchInput.value = ''
  void submitSearch()
}

const results = computed<SearchResult[]>(() => {
  if (!activeQuery.value) return []

  const apiItems = currentResponse.value?.items ?? []
  const canUseStaticFallback = !searchError.value && Boolean(currentResponse.value)
  const managedKinds = currentResponse.value?.managedKinds
  const allowStaticGuides = canUseStaticFallback
    && (managedKinds ? !managedKinds.includes('guide') : currentResponse.value?.hasManagedContent === false)
  const allowStaticDepartments = canUseStaticFallback
    && (managedKinds ? !managedKinds.includes('department') : currentResponse.value?.hasManagedContent === false)
  const apiKeys = new Set(apiItems.map(item => `${item.entityType}:${item.kind ?? 'place'}:${item.slug}`))
  const apiDepartmentNames = new Set(apiItems
    .filter(item => item.entityType === 'content' && item.kind === 'department')
    .map(item => normalize(item.title)))
  const apiPlaceNames = new Set(apiItems
    .filter(item => item.entityType === 'place')
    .map(item => normalize(item.title)))
  const dynamic = apiItems.map((item): SearchResult => ({
    key: `api-${item.entityType}-${item.id}`,
    title: item.title,
    summary: item.summary,
    ...apiPresentation(item),
    to: apiTarget(item),
    sourceLabel: '后台已发布'
  }))

  const mapReferences = campusMapReferencePlaces
    .filter(place => ![place.name, ...(place.aliases ?? [])]
      .some(name => apiPlaceNames.has(normalize(name))))
    .filter(place => matches(activeQuery.value, [place.mapNumber, place.name, ...(place.aliases ?? [])]))
    .map((place): SearchResult => ({
      key: `map-reference-${place.id}`,
      title: place.name,
      summary: `学校官网平面图编号 ${place.mapNumber}。当前仅作文字位置索引，坐标独立核验前不提供导航。`,
      typeLabel: '地图索引',
      icon: 'i-lucide-map-pinned',
      to: `/map?q=${encodeURIComponent(activeQuery.value)}`,
      sourceLabel: '官网平面图文字索引'
    }))

  const staticGuides = (allowStaticGuides ? freshmanGuides : [])
    .filter(guide => !apiKeys.has(`content:guide:${guide.slug}`))
    .filter(guide => matches(activeQuery.value, [guide.title, guide.shortTitle, guide.summary, ...guide.audience]))
    .map((guide): SearchResult => ({
      key: `static-guide-${guide.slug}`,
      title: guide.title,
      summary: guide.summary,
      typeLabel: '指南',
      icon: guide.icon,
      to: guide.slug === 'arrival'
        ? '/procedures/arrival'
        : `/guides/${encodeURIComponent(guide.slug)}`,
      sourceLabel: '内置基础指南'
    }))

  const staticDepartments = (allowStaticDepartments ? officialDepartments : [])
    .map((department, index) => ({ department, slug: `static-department-${index + 1}` }))
    .filter(({ department }) => !apiDepartmentNames.has(normalize(department.name)))
    .filter(({ department }) => matches(activeQuery.value, [department.name, department.summary]))
    .map(({ department, slug }): SearchResult => ({
      key: slug,
      title: department.name,
      summary: department.summary,
      typeLabel: '部门',
      icon: 'i-lucide-landmark',
      to: `/campus#department-${encodeURIComponent(slug)}`,
      sourceLabel: '官网部门入口'
    }))

  return [...dynamic, ...mapReferences, ...staticGuides, ...staticDepartments]
})

const searchAnnouncement = computed(() => {
  if (!activeQuery.value) return '请输入关键词开始搜索。'
  if (searching.value) return `正在搜索“${activeQuery.value}”。`
  if (searchError.value) return `动态搜索暂时不可用，当前显示 ${results.value.length} 项可用结果。`
  return `搜索完成，找到 ${results.value.length} 项匹配结果。`
})

watch(activeQuery, (query) => {
  if (pendingSearchNavigations > 0 && query !== latestSubmittedQuery) return
  searchInput.value = query
  if (pendingSearchNavigations === 0) latestSubmittedQuery = query
})
</script>

<template>
  <div>
    <section class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          关键词检索
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          搜索地点、指南与校内服务
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          搜索结果会区分已发布内容与官网文字索引。没有完成坐标核验的地点不会显示导航入口。
        </p>

        <form
          class="mt-6 flex max-w-3xl gap-2"
          role="search"
          @submit.prevent="submitSearch"
        >
          <UInput
            v-model="searchInput"
            icon="i-lucide-search"
            size="xl"
            class="min-w-0 flex-1"
            placeholder="例如：报到、校园网、网络信息中心、图书馆"
            aria-label="全站搜索"
          >
            <template
              v-if="searchInput"
              #trailing
            >
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="清空搜索"
                @click="clearSearch"
              />
            </template>
          </UInput>
          <UButton
            type="submit"
            icon="i-lucide-search"
            label="搜索"
            size="xl"
            class="min-h-11 shrink-0"
            :loading="searching"
          />
        </form>
      </div>
    </section>

    <section class="page-shell page-section">
      <p
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ searchAnnouncement }}
      </p>

      <div
        v-if="searchError"
        class="mb-5 flex items-start gap-2 border-l-2 border-orange-500 bg-orange-50 px-3 py-2 text-sm text-orange-900"
        role="status"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="mt-0.5 size-4 shrink-0"
        />
        {{ searchError }}
      </div>

      <div v-if="activeQuery">
        <div class="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-3">
          <div>
            <p class="text-xs text-zinc-500">
              “{{ activeQuery }}”的结果
            </p>
            <h2 class="mt-1 text-lg font-bold text-zinc-950">
              {{ results.length }} 项匹配
            </h2>
          </div>
          <UButton
            :to="`/map?q=${encodeURIComponent(activeQuery)}`"
            icon="i-lucide-map"
            label="只看地图"
            color="neutral"
            variant="outline"
          />
        </div>

        <div
          v-if="results.length"
          class="divide-y divide-zinc-100"
        >
          <NuxtLink
            v-for="result in results"
            :key="result.key"
            :to="result.to"
            class="group flex min-h-28 items-start gap-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
          >
            <span class="grid size-10 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700 group-hover:bg-green-50 group-hover:text-green-700">
              <UIcon
                :name="result.icon"
                class="size-5"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-bold text-zinc-950">{{ result.title }}</span>
                <UBadge
                  color="neutral"
                  variant="soft"
                  size="sm"
                >
                  {{ result.typeLabel }}
                </UBadge>
              </span>
              <span class="mt-1.5 line-clamp-2 block text-sm leading-6 text-zinc-600">{{ result.summary }}</span>
              <span class="mt-2 block text-xs text-zinc-400">{{ result.sourceLabel }}</span>
            </span>
            <UIcon
              name="i-lucide-chevron-right"
              class="mt-3 size-4 shrink-0 text-zinc-300 group-hover:text-green-700"
            />
          </NuxtLink>
        </div>

        <div
          v-else-if="!searching"
          class="py-12 text-center"
        >
          <UIcon
            name="i-lucide-search-x"
            class="mx-auto size-7 text-zinc-400"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-800">
            暂无匹配内容
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500">
            可换用正式名称、常用简称或用途词，也可以提交缺失信息。
          </p>
          <div class="mt-4 flex justify-center gap-2">
            <UButton
              to="/guides"
              label="浏览指南"
              color="neutral"
              variant="outline"
            />
            <UButton
              to="/feedback"
              label="反馈缺失"
              color="neutral"
              variant="ghost"
            />
          </div>
        </div>
      </div>

      <div
        v-else
        class="grid min-h-64 place-items-center border-y border-[var(--line)] bg-white px-5 text-center"
      >
        <div>
          <UIcon
            name="i-lucide-text-search"
            class="mx-auto size-7 text-green-700"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-800">
            输入一个名称或问题关键词
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500">
            当前为普通关键词搜索，不包含 AI 问答。
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
