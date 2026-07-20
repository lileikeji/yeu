<script setup lang="ts">
import { campusMapReferencePlaces } from '~~/data/seeds/preview-places'
import { amapImportedAreas } from '~~/data/seeds/amap-imported-areas'
import { amapImportedPlaces } from '~~/data/seeds/amap-imported-places'
import { freshmanGuides, officialDepartments } from '~~/data/seeds/public-content'
import { mergeAmapImportedPlacesWithDrafts, mergePublicMapPlaces } from '~~/app/utils/public-catalog'
import type { PublicSearchResultType } from '~~/shared/constants/server'
import type { ApiSearchResponse } from '~~/shared/types/server'
import {
  buildPublicSearchResults,
  buildSearchAnnouncement,
  buildSearchErrorMessage,
  groupPublicSearchResults,
  popularSearchSuggestions,
  resolveSearchInputSyncFromRoute,
  resolveSearchNavigationStaleCorrection,
  routeQueryString,
  routeSearchType,
  searchRouteQuery,
  searchStartingPoints,
  shouldSkipSearchNavigation,
  searchTypeOptions
} from '~~/app/utils/public-search-presentation'

useSeoMeta({
  title: '校园搜索',
  description: '搜索仰恩大学新生指南中的地点、指南、部门、社团和公告。',
  robots: 'noindex, follow'
})

const { data: amapOwnerDraftResponse } = await usePublicAmapOwnerDraftPlaces()
const ownerMapSeeds = computed(() => mergeAmapImportedPlacesWithDrafts(
  amapImportedPlaces,
  amapOwnerDraftResponse.value?.items
))
const staticMapPlaces = computed(() => mergePublicMapPlaces(campusMapReferencePlaces, [], ownerMapSeeds.value))
const staticMapAreas = amapImportedAreas

const route = useRoute()
const router = useRouter()

const activeQuery = computed(() => routeQueryString(route.query.q).trim())
const activeType = computed(() => routeSearchType(route.query.type))
const searchInput = ref(activeQuery.value)
let searchNavigationSequence = 0
let latestSubmittedQuery = activeQuery.value
let latestSubmittedType = activeType.value
let pendingSearchNavigations = 0
const requestFetch = useRequestFetch()
const {
  data: response,
  error: responseError,
  status: searchStatus,
  refresh: refreshSearch
} = await useAsyncData<ApiSearchResponse>(
  'public-search',
  () => {
    if (!activeQuery.value) {
      return Promise.resolve({
        query: '',
        type: activeType.value ?? null,
        items: [],
        total: 0,
        hasManagedContent: false,
        managedKinds: []
      })
    }

    return requestFetch<ApiSearchResponse>('/api/public/search', {
      query: {
        q: activeQuery.value,
        type: activeType.value,
        limit: 50
      }
    })
  },
  { watch: [activeQuery, activeType], dedupe: 'cancel' }
)
const currentResponse = computed(() => (
  response.value?.query.trim() === activeQuery.value
  && response.value.type === (activeType.value ?? null)
    ? response.value
    : null
))
const searching = computed(() => searchStatus.value === 'pending')
const searchError = computed(() => buildSearchErrorMessage(
  Boolean(responseError.value),
  activeType.value
))

async function navigateSearch(query: string, type?: PublicSearchResultType): Promise<void> {
  const navigationId = ++searchNavigationSequence
  latestSubmittedQuery = query
  latestSubmittedType = type
  if (shouldSkipSearchNavigation({
    routeQuery: route.query.q,
    routeType: route.query.type,
    query,
    type
  })) {
    return
  }
  pendingSearchNavigations += 1
  try {
    await router.replace({ query: searchRouteQuery(query, type) })
  } finally {
    pendingSearchNavigations -= 1
  }

  const correction = resolveSearchNavigationStaleCorrection({
    navigationId,
    searchNavigationSequence,
    routeQuery: route.query.q,
    routeType: route.query.type,
    latestSubmittedQuery,
    latestSubmittedType
  })
  if (correction?.shouldCorrect) {
    await router.replace({
      query: searchRouteQuery(correction.query, correction.type)
    })
  }
}

async function submitSearch(): Promise<void> {
  await navigateSearch(searchInput.value.trim(), activeType.value)
}

function updateSearchType(value: string): void {
  const type = value === 'all' ? undefined : routeSearchType(value)
  void navigateSearch(activeQuery.value, type)
}

const selectedType = computed({
  get: () => activeType.value ?? 'all',
  set: updateSearchType
})

function clearSearch(): void {
  searchInput.value = ''
  void submitSearch()
}

function retrySearch(): void {
  void refreshSearch()
}

function startSuggestedSearch(query: string): void {
  searchInput.value = query
  void navigateSearch(query)
}

const results = computed(() => {
  if (!activeQuery.value) return []

  return buildPublicSearchResults({
    query: activeQuery.value,
    activeType: activeType.value,
    apiResponse: currentResponse.value,
    hasSearchError: Boolean(searchError.value),
    mapPlaces: staticMapPlaces.value,
    mapAreas: staticMapAreas,
    guides: freshmanGuides,
    departments: officialDepartments
  })
})

const groupedResults = computed(() => groupPublicSearchResults(results.value, activeQuery.value))

const searchAnnouncement = computed(() => buildSearchAnnouncement({
  query: activeQuery.value,
  searching: searching.value,
  searchError: searchError.value,
  resultCount: results.value.length,
  groupCount: groupedResults.value.length
}))

watch([activeQuery, activeType], ([query, type]) => {
  const sync = resolveSearchInputSyncFromRoute({
    pendingSearchNavigations,
    routeQuery: query,
    routeType: type,
    latestSubmittedQuery,
    latestSubmittedType
  })
  if (!sync.shouldUpdateInput) return
  searchInput.value = sync.searchInput ?? query
  if (sync.shouldUpdateLatestSubmitted) {
    latestSubmittedQuery = sync.latestSubmittedQuery ?? query
    latestSubmittedType = sync.latestSubmittedType
  }
})
</script>

<template>
  <div>
    <section class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          校园搜索
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          找地点、办事和校园信息
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          报到流程、校园网、教学楼、部门和社团，都可以在这里查到。
        </p>

        <div class="mt-6 max-w-3xl">
          <form
            class="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
            role="search"
            @submit.prevent="submitSearch"
          >
            <UInput
              v-model="searchInput"
              icon="i-lucide-search"
              size="xl"
              class="min-w-0"
              placeholder="搜索地点、办事或部门"
              aria-label="全站搜索"
            >
              <template
                v-if="searchInput"
                #trailing
              >
                <UButton
                  type="button"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="清空搜索"
                  class="min-h-10 min-w-10"
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

          <div class="mt-3 flex items-center gap-3">
            <label
              for="search-result-type"
              class="shrink-0 text-xs font-medium text-zinc-600"
            >
              只看
            </label>
            <USelect
              id="search-result-type"
              v-model="selectedType"
              :items="searchTypeOptions"
              value-key="value"
              label-key="label"
              size="sm"
              class="min-h-11 w-36 max-w-full"
              aria-label="筛选搜索结果"
            />
          </div>
        </div>
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
              找到 {{ results.length }} 项
            </h2>
          </div>
          <UButton
            v-if="!activeType || activeType === 'place'"
            :to="`/map?q=${encodeURIComponent(activeQuery)}`"
            icon="i-lucide-map"
            label="只看地图"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
        </div>

        <nav
          v-if="groupedResults.length > 1"
          class="mt-4 rounded-lg border border-green-100 bg-green-50/60 p-3"
          aria-label="快速跳到结果分类"
        >
          <p class="text-xs font-semibold text-green-900">
            快速跳到
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <a
              v-for="group in groupedResults"
              :key="group.type"
              :href="`#search-group-${group.type}`"
              class="inline-flex min-h-11 items-center gap-2 rounded-md border border-green-200 bg-white px-3 text-sm font-semibold text-zinc-800 transition-colors hover:border-green-400 hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            >
              <UIcon
                :name="group.icon"
                class="size-4 text-green-700"
              />
              <span>{{ group.label }}</span>
              <span class="text-xs font-normal text-zinc-500">{{ group.items.length }} 项</span>
            </a>
          </div>
        </nav>

        <div
          v-if="results.length"
          class="divide-y divide-[var(--line)]"
        >
          <section
            v-for="group in groupedResults"
            :key="group.type"
            class="scroll-mt-20 py-5"
            :aria-labelledby="`search-group-${group.type}`"
          >
            <div class="flex items-center gap-2">
              <UIcon
                :name="group.icon"
                class="size-4 text-green-700"
              />
              <h3
                :id="`search-group-${group.type}`"
                class="text-sm font-bold text-zinc-950"
              >
                {{ group.label }}
              </h3>
              <span class="text-xs text-zinc-500">{{ group.items.length }} 项</span>
            </div>

            <div class="mt-2 divide-y divide-zinc-100">
              <NuxtLink
                v-for="result in group.items"
                :key="result.key"
                :to="result.to"
                class="group flex min-h-24 items-start gap-3 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 sm:gap-4"
              >
                <span class="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700 group-hover:bg-green-50 group-hover:text-green-700 sm:size-10">
                  <UIcon
                    :name="result.icon"
                    class="size-5"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-2">
                    <span class="break-words font-bold text-zinc-950">{{ result.title }}</span>
                    <UBadge
                      v-if="result.typeLabel !== group.label"
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
          </section>
        </div>

        <div
          v-else-if="searching"
          class="grid min-h-48 place-items-center border-b border-[var(--line)] text-center"
          role="status"
        >
          <div>
            <UIcon
              name="i-lucide-loader-circle"
              class="mx-auto size-6 animate-spin text-green-700"
            />
            <p class="mt-3 text-sm font-medium text-zinc-600">
              正在搜索
            </p>
          </div>
        </div>

        <div
          v-else-if="searchError"
          class="grid min-h-48 place-items-center border-b border-[var(--line)] px-4 text-center"
        >
          <div>
            <UIcon
              name="i-lucide-cloud-off"
              class="mx-auto size-7 text-orange-600"
            />
            <p class="mt-3 text-sm font-semibold text-zinc-800">
              暂时没能完成搜索
            </p>
            <p class="mt-1 text-xs leading-5 text-zinc-500">
              请稍后再试，或先从校园地图和新生指南里找找。
            </p>
            <UButton
              class="mt-4 min-h-11"
              icon="i-lucide-refresh-cw"
              label="重新搜索"
              color="neutral"
              variant="outline"
              @click="retrySearch"
            />
          </div>
        </div>

        <div
          v-else
          class="py-12 text-center"
        >
          <UIcon
            name="i-lucide-search-x"
            class="mx-auto size-7 text-zinc-400"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-800">
            暂时没找到相关内容
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500">
            可以试试正式名称、常用简称，或直接写你想办的事。
          </p>
          <div class="mt-4 flex justify-center gap-2">
            <UButton
              to="/guides"
              label="浏览指南"
              color="neutral"
              variant="outline"
              class="min-h-11"
            />
            <UButton
              to="/feedback"
              label="告诉我们缺了什么"
              color="neutral"
              variant="ghost"
              class="min-h-11"
            />
          </div>
          <div class="mt-5 flex flex-wrap justify-center gap-2">
            <UButton
              v-for="suggestion in popularSearchSuggestions.slice(0, 3)"
              :key="suggestion.query"
              :icon="suggestion.icon"
              :label="suggestion.label"
              color="neutral"
              variant="soft"
              size="sm"
              class="min-h-10"
              @click="startSuggestedSearch(suggestion.query)"
            />
          </div>
        </div>
      </div>

      <div
        v-else
        class="space-y-8"
      >
        <section aria-labelledby="popular-searches-heading">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-sparkles"
              class="size-4 text-green-700"
            />
            <h2
              id="popular-searches-heading"
              class="text-base font-bold text-zinc-950"
            >
              大家常找
            </h2>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              v-for="suggestion in popularSearchSuggestions"
              :key="suggestion.query"
              :icon="suggestion.icon"
              :label="suggestion.label"
              color="neutral"
              variant="soft"
              @click="startSuggestedSearch(suggestion.query)"
            />
          </div>
        </section>

        <section aria-labelledby="search-starting-points-heading">
          <div class="flex items-end justify-between gap-3 border-b border-[var(--line)] pb-3">
            <div>
              <p class="section-kicker">
                按需要浏览
              </p>
              <h2
                id="search-starting-points-heading"
                class="mt-1 text-lg font-bold text-zinc-950"
              >
                也可以从这里开始
              </h2>
            </div>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <NuxtLink
              v-for="item in searchStartingPoints"
              :key="item.to"
              :to="item.to"
              class="group flex min-h-24 items-start gap-3 rounded-md border border-[var(--line)] bg-white p-4 transition-colors hover:border-green-300 hover:bg-green-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-md bg-green-50 text-green-700">
                <UIcon
                  :name="item.icon"
                  class="size-5"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="font-bold text-zinc-950">{{ item.title }}</span>
                <span class="mt-1 block text-sm leading-6 text-zinc-600">{{ item.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="mt-3 size-4 shrink-0 text-zinc-300 transition-colors group-hover:text-green-700"
              />
            </NuxtLink>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>
