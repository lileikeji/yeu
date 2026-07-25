<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import nearbyCandidateData from '~~/data/imports/amap-nearby-poi-candidates-2026-07-15.json'
import {
  nearbyGuideCategoryLabels,
  nearbyGuideItems
} from '~~/data/nearby-guide'
import { researchSources } from '~~/data/seeds/public-content'
import {
  buildNearbyCategoryOptions,
  buildNearbyCandidatePreview,
  filterNearbyCandidates,
  filterNearbyPlaces,
  isNearbyNeedShortcutActive,
  nearbyCandidateCenterLabel,
  nearbyCandidateDistanceLabel,
  nearbyCandidateHint,
  nearbyCandidateMapUrl,
  nearbyCandidatePreviewLimit,
  nearbyCategoryLabels,
  nearbyListMessages,
  nearbyMatchCountLabel,
  nearbyNeedShortcuts,
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
const needShortcuts = nearbyNeedShortcuts
const listMessages = nearbyListMessages
const verificationChecklist = nearbyVerificationChecklist
const sourceIsClickable = nearbySourceIsClickable
const sourceContextForStudents = nearbySourceContextForStudents
const candidateMapUrl = nearbyCandidateMapUrl
const candidateCenterLabel = nearbyCandidateCenterLabel
const candidateDistanceLabel = nearbyCandidateDistanceLabel
const candidateHint = nearbyCandidateHint
const matchCountLabel = nearbyMatchCountLabel
const isNeedShortcutActive = isNearbyNeedShortcutActive
const guideItems = nearbyGuideItems
const guideCategoryLabels = nearbyGuideCategoryLabels

useSeoMeta({
  title: '校园吃喝玩乐',
  description: '查看仰恩大学学生街、马甲镇美食与洛江周边半日、周末游玩攻略。'
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

async function selectNearbyNeed(category: string): Promise<void> {
  searchQuery.value = ''
  activeCategory.value = activeCategory.value === category ? 'all' : category
  await nextTick()
  document.getElementById('nearby-results')?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start'
  })
}
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          吃喝玩乐
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          从下课随手吃，到周末出去玩
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          学生街吃什么、马甲有什么本地味道、半天和周末能去哪，已经按时间成本整理好。商家营业、景区开放和票价变化较快，出发前再用地图复核。
        </p>
        <div class="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="搜索吃饭、快递、便利店…"
            aria-label="搜索校园周边"
            size="lg"
            class="min-h-11 w-full"
            :ui="{ base: 'min-h-11' }"
          />
          <USelect
            v-model="activeCategory"
            :items="[{ label: '全部分类', value: 'all' }, ...categories.map(category => ({ label: category.label, value: category.value }))]"
            value-key="value"
            label-key="label"
            aria-label="周边地点分类"
            size="lg"
            class="min-h-11"
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
        class="mb-10"
        aria-labelledby="nearby-guide-heading"
      >
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="section-kicker">
              不用临时做攻略
            </p>
            <h2
              id="nearby-guide-heading"
              class="mt-1 text-xl font-bold text-zinc-950"
            >
              按空闲时间直接选
            </h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              校门口先解决吃饭，半天空闲在仙公山和动物园中二选一；傍晚关注永安村活动，完整周末再考虑虹山生态线。
            </p>
          </div>
          <UButton
            :to="'/transport'"
            icon="i-lucide-bus-front"
            label="先看往返交通"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
        </div>

        <nav
          class="mt-5 flex gap-2 overflow-x-auto pb-1"
          aria-label="吃喝玩乐攻略快捷入口"
        >
          <a
            v-for="item in guideItems"
            :key="`shortcut-${item.id}`"
            :href="`#guide-${item.id}`"
            class="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-green-300 hover:bg-green-50 hover:text-green-800"
          >
            <UIcon
              :name="item.icon"
              class="size-3.5"
            />
            {{ item.eyebrow }}
          </a>
        </nav>

        <div class="mt-5 grid gap-4 lg:grid-cols-2">
          <article
            v-for="item in guideItems"
            :id="`guide-${item.id}`"
            :key="item.id"
            class="surface-panel scroll-mt-20 overflow-hidden"
          >
            <div class="flex h-full flex-col p-5 md:p-6">
              <div class="flex items-start justify-between gap-4">
                <div class="flex min-w-0 items-start gap-3">
                  <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-green-50 text-green-700">
                    <UIcon
                      :name="item.icon"
                      class="size-5"
                    />
                  </span>
                  <div class="min-w-0">
                    <p class="text-xs font-semibold tracking-wide text-green-700">
                      {{ item.eyebrow }}
                    </p>
                    <h3 class="mt-1 text-lg font-bold leading-7 text-zinc-950">
                      {{ item.title }}
                    </h3>
                  </div>
                </div>
                <UBadge
                  :label="guideCategoryLabels[item.category]"
                  color="warning"
                  variant="soft"
                  class="shrink-0"
                />
              </div>

              <p class="mt-4 text-sm leading-6 text-zinc-600">
                {{ item.summary }}
              </p>
              <ul class="mt-4 space-y-2">
                <li
                  v-for="highlight in item.highlights"
                  :key="highlight"
                  class="flex items-start gap-2 text-sm leading-6 text-zinc-700"
                >
                  <UIcon
                    name="i-lucide-circle-check"
                    class="mt-1 size-4 shrink-0 text-green-600"
                  />
                  <span>{{ highlight }}</span>
                </li>
              </ul>

              <dl class="mt-5 grid gap-3 rounded-xl bg-zinc-50 p-4 text-xs leading-5 sm:grid-cols-2">
                <div>
                  <dt class="font-semibold text-zinc-900">
                    适合
                  </dt>
                  <dd class="mt-1 text-zinc-600">
                    {{ item.suitableFor }}
                  </dd>
                </div>
                <div>
                  <dt class="font-semibold text-zinc-900">
                    费用提醒
                  </dt>
                  <dd class="mt-1 text-zinc-600">
                    {{ item.costNote }}
                  </dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="font-semibold text-zinc-900">
                    出发建议
                  </dt>
                  <dd class="mt-1 text-zinc-600">
                    {{ item.travelNote }}
                  </dd>
                </div>
              </dl>

              <div class="mt-auto pt-5">
                <p class="flex items-start gap-2 text-xs leading-5 text-amber-800">
                  <UIcon
                    name="i-lucide-clock-3"
                    class="mt-0.5 size-3.5 shrink-0"
                  />
                  <span>{{ item.freshnessNote }}</span>
                </p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <UButton
                    :href="safeExternalHref(item.mapUrl) || undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    icon="i-lucide-map-pinned"
                    label="在高德地图查看"
                    color="primary"
                    variant="solid"
                    class="min-h-11"
                  />
                  <UButton
                    v-for="source in item.sources"
                    :key="source.url"
                    :href="safeExternalHref(source.url) || undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    icon="i-lucide-book-open"
                    :label="`查看${source.publisher}来源`"
                    color="neutral"
                    variant="ghost"
                    class="min-h-11"
                  />
                  <UButton
                    v-if="item.id === 'student-streets'"
                    href="#nearby-results"
                    icon="i-lucide-list-filter"
                    label="筛选学生街地点"
                    color="neutral"
                    variant="ghost"
                    class="min-h-11"
                  />
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section
        v-if="!candidateFilterActive || activeCategory !== 'all' || searchQuery.trim()"
        class="mb-6"
        aria-labelledby="nearby-need-shortcuts-heading"
      >
        <p
          id="nearby-need-shortcuts-heading"
          class="text-xs font-semibold text-zinc-600"
        >
          {{ listMessages.needShortcutsTitle }}
        </p>
        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            v-for="shortcut in needShortcuts"
            :key="shortcut.category"
            type="button"
            class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            :class="isNeedShortcutActive(shortcut, activeCategory)
              ? 'border-green-600 bg-green-50 text-green-800'
              : 'border-[var(--line)] bg-white text-zinc-700 hover:border-green-300 hover:bg-green-50/40'"
            :aria-pressed="isNeedShortcutActive(shortcut, activeCategory)"
            @click="selectNearbyNeed(shortcut.category)"
          >
            <UIcon
              :name="shortcut.icon"
              class="size-4"
            />
            {{ shortcut.label }}
          </button>
        </div>
      </section>
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
              {{ listMessages.publishedHeading }}
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
              :label="listMessages.openMap"
              color="neutral"
              variant="outline"
              class="min-h-11"
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
              {{ listMessages.viewPlace }}
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
            :label="listMessages.openMap"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
        </div>
        <ul class="mt-3 grid gap-2 md:grid-cols-2">
          <li
            v-for="tip in usageTips"
            :key="tip.title"
          >
            <button
              type="button"
              class="group flex min-h-24 w-full items-start gap-3 rounded-md border border-[var(--line)] bg-white p-4 text-left transition hover:border-green-300 hover:bg-green-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
              :aria-label="`查看${tip.title}地点`"
              @click="selectNearbyNeed(tip.category)"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-md bg-green-50 text-green-700">
                <UIcon
                  :name="tip.icon"
                  class="size-4.5"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="font-bold text-zinc-950">{{ tip.title }}</span>
                <span class="mt-1 block text-sm leading-6 text-zinc-600">{{ tip.text }}</span>
              </span>
              <UIcon
                name="i-lucide-arrow-right"
                class="mt-2 size-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-green-700"
              />
            </button>
          </li>
        </ul>
      </section>

      <div
        v-else-if="!error && filteredCandidates.length"
        class="flex flex-wrap items-center justify-between gap-3 border-l-2 border-green-600 bg-green-50 px-4 py-3"
        role="status"
      >
        <p class="text-sm font-medium text-green-950">
          {{ matchCountLabel(filteredCandidates.length) }}
        </p>
        <UButton
          icon="i-lucide-x"
          :label="listMessages.clearFilters"
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
          {{ listMessages.emptyMatchTitle }}
        </p>
        <p class="mt-1 text-xs leading-5 text-amber-900">
          {{ listMessages.emptyMatchHint }}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-x"
            :label="listMessages.clearFilters"
            color="neutral"
            variant="outline"
            size="sm"
            @click="clearNearbyFilters"
          />
          <UButton
            :to="{ path: '/map', query: { scope: 'nearby' } }"
            icon="i-lucide-map"
            :label="listMessages.openMap"
            color="neutral"
            variant="ghost"
            size="sm"
            class="min-h-11"
          />
        </div>
      </div>

      <section
        v-if="filteredCandidates.length || !candidateFilterActive"
        id="nearby-results"
        class="mt-10 scroll-mt-20 border-t border-zinc-200 pt-8"
      >
        <div>
          <h2 class="text-lg font-bold text-zinc-950">
            {{ listMessages.candidatesHeading }}
          </h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            <template v-if="candidateFilterActive">
              按当前条件找到 {{ filteredCandidates.length }} 个地点。点开后可以在{{ safeExternalHref(candidateCatalog.providerDocumentation) ? '高德地图' : '地图' }}查看位置和近期营业信息。
            </template>
            <template v-else>
              这里整理了 {{ filteredCandidates.length }} 个新区、旧区的餐饮、便利、快递和生活服务地点。点开后可以在{{ safeExternalHref(candidateCatalog.providerDocumentation) ? '高德地图' : '地图' }}查看位置，营业时间和价格请以近期信息或现场为准。
            </template>
          </p>
          <p class="mt-2 flex max-w-3xl items-start gap-2 text-xs leading-5 text-zinc-500">
            <UIcon
              name="i-lucide-info"
              class="mt-0.5 size-3.5 shrink-0 text-green-700"
            />
            <span>卡片里的距离是商铺到新区或旧区学生街参考位置的大致距离，不是从你当前位置算起。</span>
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
                  name="i-lucide-link-2-off"
                  class="mt-0.5 size-3.5 shrink-0 text-orange-600"
                />
                <span>
                  <span class="font-medium">{{ source.title }}</span>
                  <span class="block text-zinc-500">{{ sourceContextForStudents(source.context) }}</span>
                  <span class="block text-orange-700">原分享目前打不开，以上内容只作参考。</span>
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
              <span class="text-right text-xs leading-5 text-zinc-500">{{ candidateDistanceLabel(candidate) }}</span>
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
            class="min-h-11"
            :aria-expanded="candidatesExpanded"
            @click="toggleCandidatePreview"
          />
        </div>
      </section>
    </div>
  </div>
</template>
