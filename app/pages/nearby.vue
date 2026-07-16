<script setup lang="ts">
import nearbyCandidateData from '~~/data/imports/amap-nearby-poi-candidates-2026-07-15.json'
import { researchSources } from '~~/data/seeds/public-content'
import {
  buildNearbyCategoryOptions,
  filterNearbyCandidates,
  filterNearbyPlaces,
  nearbyCandidateCenterLabel,
  nearbyCandidateHint,
  nearbyCandidateMapUrl,
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
const verificationChecklist = nearbyVerificationChecklist
const usageTips = nearbyUsageTips
const sourceIsClickable = nearbySourceIsClickable
const sourceContextForStudents = nearbySourceContextForStudents
const candidateMapUrl = nearbyCandidateMapUrl
const candidateCenterLabel = nearbyCandidateCenterLabel
const candidateHint = nearbyCandidateHint

useSeoMeta({
  title: '校园周边',
  description: '查看经过位置与营业状态核验的仰恩大学周边商铺和生活服务。'
})

const searchQuery = ref('')
const activeCategory = ref('all')
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
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          校园周边
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          已核验商铺与生活服务
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          只展示已核对位置、来源和营业状态的地点，不使用平台评分或未经验证的推荐排名。
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
        周边资料暂时不可用，请稍后重试。
      </div>

      <div
        v-else
        class="mb-4 flex items-center justify-between gap-4"
      >
        <h2 class="text-sm font-semibold text-zinc-900">
          {{ filteredPlaces.length }} 个地点
        </h2>
        <UButton
          :to="{ path: '/map', query: { scope: 'nearby' } }"
          icon="i-lucide-map"
          label="地图查看"
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
        class="border-y border-zinc-200 bg-white px-5 py-12 text-center"
      >
        <UIcon
          name="i-lucide-store"
          class="mx-auto size-7 text-zinc-400"
        />
        <h2 class="mt-3 text-base font-bold text-zinc-800">
          暂无达到发布标准的周边地点
        </h2>
        <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          周边商铺还在确认位置、经营状态和营业时间，因此不会提前写成推荐。
        </p>
        <UButton
          :to="{ path: '/feedback', query: { type: 'source_suggestion', from: '/nearby' } }"
          icon="i-lucide-link"
          label="提交可靠来源"
          color="neutral"
          variant="outline"
          class="mt-5"
        />
      </div>

      <section class="mt-10 border-t border-zinc-200 pt-8">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-bold text-zinc-950">
                周边参考清单
              </h2>
              <UBadge
                label="确认后再推荐"
                color="warning"
                variant="soft"
              />
            </div>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              高德当前 POI 搜索取得 30 条新区、旧区餐饮、便利、快递与生活服务参考。平台 POI 只证明地图上出现过这个名称和位置，不代表门店仍在营业；确认招牌、入口、营业状态、时间和服务范围后，才会进入上方正式目录。
            </p>
          </div>
          <a
            :href="candidateCatalog.providerDocumentation"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
          >
            高德 POI 接口来源
            <UIcon
              name="i-lucide-external-link"
              class="size-3.5"
            />
          </a>
        </div>

        <div class="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div class="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 class="text-sm font-bold text-zinc-950">
              新生现在怎么用这份参考清单
            </h3>
            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <div
                v-for="tip in usageTips"
                :key="tip.title"
                class="rounded-md bg-zinc-50 px-3 py-2"
              >
                <p class="text-xs font-semibold text-zinc-900">
                  {{ tip.title }}
                </p>
                <p class="mt-1 text-xs leading-5 text-zinc-600">
                  {{ tip.text }}
                </p>
              </div>
            </div>
          </div>
          <div class="rounded-lg border border-orange-200 bg-orange-50/70 p-4">
            <h3 class="text-sm font-bold text-orange-950">
              进入已核验目录前必须确认
            </h3>
            <ul class="mt-3 space-y-2 text-xs leading-5 text-orange-900">
              <li
                v-for="item in verificationChecklist"
                :key="item"
                class="flex gap-2"
              >
                <UIcon
                  name="i-lucide-check-circle-2"
                  class="mt-0.5 size-3.5 shrink-0"
                />
                <span>{{ item }}</span>
              </li>
            </ul>
          </div>
        </div>

        <p class="mt-4 text-xs text-zinc-500">
          {{ filteredCandidates.length }} 条参考 · 数据整理于 {{ candidateCatalog.generatedAt.slice(0, 10) }}
        </p>
        <div class="mt-4 border-l-2 border-orange-300 bg-orange-50/70 px-4 py-3">
          <p class="text-xs font-bold text-orange-900">
            相关公开资料 · 仅作确认参考
          </p>
          <ul class="mt-2 grid gap-2 md:grid-cols-3">
            <li
              v-for="source in nearbyResearchSources"
              :key="source.url"
            >
              <a
                v-if="sourceIsClickable(source)"
                :href="source.url"
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
        </div>
        <div
          v-if="filteredCandidates.length"
          class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          <a
            v-for="candidate in filteredCandidates"
            :key="candidate.amapPoiId"
            :href="candidateMapUrl(candidate)"
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
              <span class="text-xs text-orange-700">高德地图线索 · 到店前再确认</span>
              <span class="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                高德查看
                <UIcon
                  name="i-lucide-external-link"
                  class="size-3.5"
                />
              </span>
            </div>
          </a>
        </div>
      </section>
    </div>
  </div>
</template>
