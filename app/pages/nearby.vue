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
const verificationChecklist = nearbyVerificationChecklist
const sourceIsClickable = nearbySourceIsClickable
const sourceContextForStudents = nearbySourceContextForStudents
const candidateMapUrl = nearbyCandidateMapUrl
const candidateCenterLabel = nearbyCandidateCenterLabel
const candidateHint = nearbyCandidateHint

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
          可以按名称或类别查找学校附近的生活服务。商铺营业时间变化较快，出发前建议先在地图上看一眼，到店后以现场情况为准。
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
        class="border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800"
        role="alert"
      >
        周边地点暂时无法加载，请稍后再试。
      </div>

      <div
        v-else
        class="mb-4 flex items-center justify-between gap-4"
      >
        <h2 class="text-sm font-semibold text-zinc-900">
          {{ filteredPlaces.length }} 个本站介绍
        </h2>
        <UButton
          :to="{ path: '/map', query: { scope: 'nearby' } }"
          icon="i-lucide-map"
          label="在地图中查看周边"
          color="neutral"
          variant="outline"
        />
      </div>

      <div
        v-if="filteredPlaces.length"
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
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
          <h2 class="mt-4 font-bold text-zinc-950">
            {{ place.name }}
          </h2>
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

      <div
        v-else-if="!error"
        class="border-l-2 border-amber-300 bg-amber-50 px-4 py-3"
      >
        <p class="text-sm leading-6 text-amber-950">
          暂时没有单独整理的商铺介绍，可以先看下方地图结果，或直接进入周边地图查找。
        </p>
        <UButton
          :to="{ path: '/feedback', query: { type: 'source_suggestion', from: '/nearby' } }"
          icon="i-lucide-message-square-plus"
          label="告诉我们附近的新店"
          color="neutral"
          variant="ghost"
          size="sm"
          class="mt-2"
        />
      </div>

      <section class="mt-10 border-t border-zinc-200 pt-8">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-bold text-zinc-950">
                地图上还能找到这些地方
              </h2>
              <UBadge
                label="出发前再看一眼"
                color="warning"
                variant="soft"
              />
            </div>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              高德地图中整理了 {{ filteredCandidates.length }} 个新区、旧区的餐饮、便利、快递和生活服务地点，适合先找方向。营业时间、价格和服务范围请以地图近期信息或现场为准。
            </p>
          </div>
          <a
            :href="safeExternalHref(candidateCatalog.providerDocumentation) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
          >
            地图地点说明
            <UIcon
              name="i-lucide-external-link"
              class="size-3.5"
            />
          </a>
        </div>

        <details class="group mt-5 border-y border-zinc-200 bg-white">
          <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-zinc-800 marker:hidden">
            <span class="inline-flex items-center gap-2">
              <UIcon
                name="i-lucide-list-checks"
                class="size-4 text-green-700"
              />
              出发前看一眼
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
            共 {{ filteredCandidates.length }} 个地点 · 先显示 {{ Math.min(filteredCandidates.length, nearbyCandidatePreviewLimit) }} 个
          </template>
          · 地图信息更新于 {{ candidateCatalog.generatedAt.slice(0, 10) }}
        </p>
        <details class="group mt-4 border-y border-zinc-200 bg-white">
          <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-xs font-semibold text-zinc-700 marker:hidden">
            <span class="inline-flex items-center gap-2">
              <UIcon
                name="i-lucide-book-open"
                class="size-4 text-green-700"
              />
              查看这些地点的资料出处
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
              {{ candidate.address || '高德未提供详细地址' }}
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
