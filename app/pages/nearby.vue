<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import nearbyCandidateData from '~~/data/imports/amap-nearby-poi-candidates-2026-07-15.json'
import { researchSources } from '~~/data/seeds/public-content'
import {
  buildNearbyCategoryOptions,
  buildNearbyCandidatePreview,
  filterNearbyCandidates,
  filterNearbyPlaces,
  nearbyCandidateCenterLabel,
  nearbyCandidateHint,
  nearbyCandidateMapUrl,
  nearbyCandidatePreviewLimit,
  nearbyCategoryLabels,
  selectNearbyResearchSources,
  nearbySourceContextForStudents,
  nearbySourceIsClickable,
  nearbyUsageTips,
  nearbyVerificationChecklist,
  type NearbyCandidate
} from '~~/app/utils/nearby-presentation'

const candidateCatalog = nearbyCandidateData as {
  generatedAt: string
  providerDocumentation: string
  status: 'unverified-platform-candidates'
  candidates: NearbyCandidate[]
}
const nearbyResearchSources = selectNearbyResearchSources(researchSources)
const categoryLabels = nearbyCategoryLabels
const usageTips = nearbyUsageTips
const verificationChecklist = nearbyVerificationChecklist
const sourceIsClickable = nearbySourceIsClickable
const sourceContextForStudents = nearbySourceContextForStudents
const candidateMapUrl = nearbyCandidateMapUrl
const candidateCenterLabel = nearbyCandidateCenterLabel
const candidateHint = nearbyCandidateHint
const candidateProviderLabel = safeExternalHref(candidateCatalog.providerDocumentation)?.includes('amap.com')
  ? '高德地图'
  : '地图'

useSeoMeta({
  title: '校园周边',
  description: '查找仰恩大学周边吃饭、快递、购物和生活服务地点。'
})

const searchQuery = ref('')
const activeCategory = ref('all')
const candidatesExpanded = ref(false)
const { data: response, error } = await usePublicPlaceList('nearby')
const places = computed(() => response.value?.items ?? [])
const categories = computed(() => buildNearbyCategoryOptions(places.value, candidateCatalog.candidates))
const filteredPlaces = computed(() => filterNearbyPlaces(places.value, {
  query: searchQuery.value,
  activeCategory: activeCategory.value
}))
const filteredCandidates = computed(() => filterNearbyCandidates(candidateCatalog.candidates, {
  query: searchQuery.value,
  activeCategory: activeCategory.value
}))
const candidateFilterActive = computed(() => Boolean(searchQuery.value.trim()) || activeCategory.value !== 'all')
const candidatePreview = computed(() => buildNearbyCandidatePreview(filteredCandidates.value, {
  expanded: candidatesExpanded.value,
  filterActive: candidateFilterActive.value
}))
const visibleCandidates = computed(() => candidatePreview.value.items)

watch([searchQuery, activeCategory], () => {
  candidatesExpanded.value = false
})

function toggleCandidatePreview(): void {
  candidatesExpanded.value = !candidatesExpanded.value
}

function clearNearbyFilters(): void {
  searchQuery.value = ''
  activeCategory.value = 'all'
}
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          周边生活
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          找吃饭、快递和日用品
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          学校附近吃饭、取快递、买日用品和生活服务都在这里。营业时间变化较快，出发前再看一下地图中的近期信息。
        </p>
        <div class="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="搜索商铺或服务"
            aria-label="搜索校园周边"
            size="lg"
          />
          <USelect
            v-model="activeCategory"
            :items="[{ label: '全部分类', value: 'all' }, ...categories.map(category => ({ label: category.label, value: category.value }))]"
            value-key="value"
            label-key="label"
            aria-label="周边地点分类"
            size="lg"
          />
        </div>
      </div>
    </header>

    <div class="page-shell page-section">
      <div
        v-if="error"
        class="border-l-2 border-orange-400 bg-orange-50 px-3 py-2 text-sm text-orange-900"
        role="status"
      >
        部分周边介绍暂时没显示出来，下面的地图地点仍然可以查看。
      </div>

      <section
        v-if="filteredPlaces.length"
        aria-labelledby="nearby-published-heading"
      >
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-3">
          <div>
            <p class="section-kicker">
              精选地点
            </p>
            <h2
              id="nearby-published-heading"
              class="mt-1 text-lg font-bold text-zinc-950"
            >
              本页整理的周边地点
            </h2>
          </div>
          <div class="flex items-center gap-2">
            <UBadge
              :label="`${filteredPlaces.length} 个`"
              color="neutral"
              variant="soft"
            />
            <UButton
              :to="{ path: '/map', query: { scope: 'nearby' } }"
              icon="i-lucide-map"
              label="打开周边地图"
              color="neutral"
              variant="outline"
            />
          </div>
        </div>

        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <NuxtLink
            v-for="place in filteredPlaces"
            :key="place.id"
            :to="`/places/${place.slug}`"
            class="surface-panel group flex min-h-52 flex-col p-5 transition hover:border-green-300 hover:shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="grid size-10 place-items-center rounded-md bg-orange-50 text-orange-700">
                <UIcon
                  name="i-lucide-store"
                  class="size-5"
                />
              </span>
              <UBadge
                :label="categoryLabels[place.category ?? place.type] ?? (place.category ?? place.type)"
                color="neutral"
                variant="soft"
              />
            </div>
            <h3 class="mt-4 font-bold text-zinc-950">
              {{ place.name }}
            </h3>
            <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600">
              {{ place.summary }}
            </p>
            <p
              v-if="place.address"
              class="mt-3 text-xs leading-5 text-zinc-500"
            >
              {{ place.address }}
            </p>
            <span class="mt-4 inline-flex items-center gap-1 text-xs font-medium text-green-700">
              查看详情
              <UIcon
                name="i-lucide-arrow-right"
                class="size-3.5"
              />
            </span>
          </NuxtLink>
        </div>
      </section>

      <section
        v-else-if="!error && !candidateFilterActive"
        aria-labelledby="nearby-needs-heading"
      >
        <div class="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-3">
          <div>
            <p class="section-kicker">
              常用需求
            </p>
            <h2
              id="nearby-needs-heading"
              class="mt-1 text-lg font-bold text-zinc-950"
            >
              先按要做的事找
            </h2>
          </div>
          <UButton
            :to="{ path: '/map', query: { scope: 'nearby' } }"
            icon="i-lucide-map"
            label="打开周边地图"
            color="neutral"
            variant="outline"
          />
        </div>
        <ul class="mt-3 grid gap-2 md:grid-cols-2">
          <li
            v-for="tip in usageTips"
            :key="tip.title"
            class="flex items-start gap-3 rounded-md border border-[var(--line)] bg-white p-4"
          >
            <span class="grid size-9 shrink-0 place-items-center rounded-md bg-green-50 text-green-700">
              <UIcon
                :name="tip.icon"
                class="size-4.5"
              />
            </span>
            <span>
              <span class="font-bold text-zinc-950">{{ tip.title }}</span>
              <span class="mt-1 block text-sm leading-6 text-zinc-600">{{ tip.text }}</span>
            </span>
          </li>
        </ul>
      </section>

      <div
        v-else-if="!error && filteredCandidates.length"
        class="flex flex-wrap items-center justify-between gap-3 border-l-2 border-green-600 bg-green-50 px-4 py-3"
        role="status"
      >
        <p class="text-sm font-medium text-green-950">
          下方找到 {{ filteredCandidates.length }} 个相关地点
        </p>
        <UButton
          icon="i-lucide-x"
          label="清除筛选"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="clearNearbyFilters"
        />
      </div>

      <div
        v-else-if="!error"
        class="border-l-2 border-amber-400 bg-amber-50 px-4 py-3"
        role="status"
      >
        <p class="text-sm font-semibold text-amber-950">
          没有找到相关地点
        </p>
        <p class="mt-1 text-xs leading-5 text-amber-900">
          换个名称或分类试试，也可以直接打开周边地图。
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-x"
            label="清除筛选"
            color="neutral"
            variant="outline"
            size="sm"
            @click="clearNearbyFilters"
          />
          <UButton
            :to="{ path: '/map', query: { scope: 'nearby' } }"
            icon="i-lucide-map"
            label="打开周边地图"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </div>
      </div>

      <section class="mt-10 border-t border-zinc-200 pt-8">
        <div>
          <h2 class="text-lg font-bold text-zinc-950">
            附近这些地方可以先看看
          </h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            <template v-if="candidateFilterActive">
              按当前条件找到 {{ filteredCandidates.length }} 个地点。点开后可以在{{ candidateProviderLabel }}查看位置和近期营业信息。
            </template>
            <template v-else>
              这里整理了 {{ filteredCandidates.length }} 个新区、旧区的餐饮、便利、快递和生活服务地点。点开后可以在{{ candidateProviderLabel }}查看位置，营业时间和价格请以近期信息或现场为准。
            </template>
          </p>
        </div>

        <details class="group mt-5 border-y border-zinc-200 bg-white">
          <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-zinc-800 marker:hidden">
            <span class="inline-flex items-center gap-2">
              <UIcon
                name="i-lucide-list-checks"
                class="size-4 text-green-700"
              />
              出发前确认这几件事
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 text-zinc-400 transition group-open:rotate-180"
            />
          </summary>
          <div class="border-t border-zinc-100 py-4">
            <ul class="grid gap-2 text-xs leading-5 text-zinc-700 md:grid-cols-2">
              <li
                v-for="item in verificationChecklist"
                :key="item"
                class="flex gap-2 rounded-md bg-zinc-50 px-3 py-2"
              >
                <UIcon
                  name="i-lucide-circle-check"
                  class="mt-0.5 size-3.5 shrink-0 text-green-700"
                />
                <span>{{ item }}</span>
              </li>
            </ul>
          </div>
        </details>

        <p class="mt-4 text-xs text-zinc-500">
          <template v-if="candidateFilterActive">
            找到 {{ filteredCandidates.length }} 个地点
          </template>
          <template v-else>
            先显示 {{ Math.min(filteredCandidates.length, nearbyCandidatePreviewLimit) }} 个，共 {{ filteredCandidates.length }} 个
          </template>
          · 名单更新于 {{ candidateCatalog.generatedAt.slice(0, 10) }}
        </p>
        <details class="group mt-4 border-y border-zinc-200 bg-white">
          <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-xs font-semibold text-zinc-700 marker:hidden">
            <span class="inline-flex items-center gap-2">
              <UIcon
                name="i-lucide-book-open"
                class="size-4 text-green-700"
              />
              这些地点从哪里整理
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 text-zinc-400 transition group-open:rotate-180"
            />
          </summary>
          <ul class="grid gap-3 border-t border-zinc-100 py-4 md:grid-cols-3">
            <li
              v-for="source in nearbyResearchSources"
              :key="source.url"
            >
              <a
                v-if="sourceIsClickable(source)"
                :href="safeExternalHref(source.url) || undefined"
                target="_blank"
                rel="noopener noreferrer"
                class="group flex items-start gap-2 text-xs leading-5 text-zinc-700 hover:text-green-700"
              >
                <UIcon
                  name="i-lucide-external-link"
                  class="mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  <span class="font-medium">{{ source.title }}</span>
                  <span class="block text-zinc-500">{{ sourceContextForStudents(source.context) }}</span>
                </span>
              </a>
              <div
                v-else
                class="flex items-start gap-2 text-xs leading-5 text-zinc-700"
              >
                <UIcon
                  name="i-lucide-archive"
                  class="mt-0.5 size-3.5 shrink-0 text-orange-600"
                />
                <span>
                  <span class="font-medium">{{ source.title }}</span>
                  <span class="block text-zinc-500">{{ sourceContextForStudents(source.context) }}</span>
                  <span class="block text-orange-700">这个链接现在打不开，先作为参考记录保留。</span>
                </span>
              </div>
            </li>
          </ul>
        </details>
        <div
          v-if="filteredCandidates.length"
          class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          <a
            v-for="candidate in visibleCandidates"
            :key="candidate.amapPoiId"
            :href="safeExternalHref(candidateMapUrl(candidate)) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            class="surface-panel group flex min-h-44 flex-col p-5 transition hover:border-orange-300 hover:shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <UBadge
                :label="candidateCenterLabel(candidate)"
                color="neutral"
                variant="soft"
              />
              <span class="text-xs text-zinc-400">约 {{ candidate.distanceMeters }} m</span>
            </div>
            <h3 class="mt-3 font-bold text-zinc-950">
              {{ candidate.name }}
            </h3>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <UBadge
                :label="categoryLabels[candidate.category]"
                color="warning"
                variant="soft"
              />
            </div>
            <p class="mt-2 text-xs leading-5 text-zinc-500">
              {{ candidate.address || '暂时没有详细地址' }}
            </p>
            <p class="mt-3 rounded-md bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-900">
              {{ candidateHint(candidate) }}
            </p>
            <div class="mt-auto flex items-end justify-between gap-3 pt-4">
              <span class="text-xs text-orange-700">出发前看营业情况</span>
              <span class="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                在高德地图打开
                <UIcon
                  name="i-lucide-external-link"
                  class="size-3.5"
                />
              </span>
            </div>
          </a>
        </div>
        <div
          v-if="!candidateFilterActive && filteredCandidates.length > nearbyCandidatePreviewLimit"
          class="mt-5 flex justify-center"
        >
          <UButton
            :icon="candidatesExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :label="candidatesExpanded ? '收起地点' : `再看 ${candidatePreview.hiddenCount} 个地点`"
            color="neutral"
            variant="soft"
            :aria-expanded="candidatesExpanded"
            @click="toggleCandidatePreview"
          />
        </div>
      </section>
    </div>
  </div>
</template>
