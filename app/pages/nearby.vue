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
const guideScopeOptions = [
  {
    id: 'nearby',
    label: '学校周边',
    description: '临时吃饭、半天出去、周末放风',
    icon: 'i-lucide-school'
  },
  {
    id: 'city',
    label: '泉州市区',
    description: '古城、美食、夜游、看展和商场',
    icon: 'i-lucide-building-2'
  }
] as const
const guideTagOptions = {
  nearby: [
    { id: 'nearby-food', label: '就近吃点', icon: 'i-lucide-utensils', categories: ['food'] },
    { id: 'nearby-half-day', label: '半天出去', icon: 'i-lucide-sun', categories: ['half-day'] },
    { id: 'nearby-weekend', label: '傍晚或周末', icon: 'i-lucide-trees', categories: ['evening', 'weekend'] }
  ],
  city: [
    { id: 'city-food', label: '边走边吃', icon: 'i-lucide-cooking-pot', categories: ['city-food'] },
    { id: 'city-walk', label: '逛景点', icon: 'i-lucide-landmark', categories: ['city-walk'] },
    { id: 'city-night', label: '晚上去哪', icon: 'i-lucide-moon-star', categories: ['city-night'] },
    { id: 'city-culture', label: '看展看戏', icon: 'i-lucide-theater', categories: ['city-culture'] },
    { id: 'city-shopping', label: '商场放松', icon: 'i-lucide-shopping-bag', categories: ['city-shopping'] }
  ]
} as const

type GuideScope = keyof typeof guideTagOptions

const activeGuideScope = ref<GuideScope>('city')
const activeGuideTag = ref('city-walk')
const activeGuideScopeOption = computed(() =>
  guideScopeOptions.find(option => option.id === activeGuideScope.value) ?? guideScopeOptions[1]
)
const visibleGuideTags = computed(() => guideTagOptions[activeGuideScope.value])
const selectedGuideTag = computed(() =>
  visibleGuideTags.value.find(tag => tag.id === activeGuideTag.value) ?? visibleGuideTags.value[0]
)
const selectedGuideItems = computed(() => {
  const categories = new Set<string>(selectedGuideTag.value?.categories ?? [])
  return guideItems.filter(item => item.scope === activeGuideScope.value && categories.has(item.category))
})
const route = useRoute()

useSeoMeta({
  title: '校园吃喝玩乐',
  description: '查看学生街、马甲洛江周边与泉州市区的吃喝玩乐攻略。'
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

function selectGuideScope(scope: GuideScope): void {
  activeGuideScope.value = scope
  activeGuideTag.value = guideTagOptions[scope][0].id
}

function selectGuideTag(tagId: string): void {
  activeGuideTag.value = tagId
}

function guideTagItemCount(categories: readonly string[]): number {
  const categorySet = new Set(categories)
  return guideItems.filter(item =>
    item.scope === activeGuideScope.value && categorySet.has(item.category)
  ).length
}

async function revealGuideFromHash(hash: string): Promise<void> {
  const matchedId = hash.replace(/^#guide-/, '')
  if (!matchedId || matchedId === hash) return
  const item = guideItems.find(guide => guide.id === matchedId)
  if (!item) return

  const scope = item.scope as GuideScope
  const tag = guideTagOptions[scope].find(option =>
    (option.categories as readonly string[]).includes(item.category)
  )
  if (!tag) return

  activeGuideScope.value = scope
  activeGuideTag.value = tag.id
  await nextTick()
  document.getElementById(`guide-${item.id}`)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'center'
  })
}

onMounted(() => {
  void revealGuideFromHash(route.hash)
})

watch(() => route.hash, (hash) => {
  if (import.meta.client) void revealGuideFromHash(hash)
})

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
    <header class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          吃喝玩乐
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
          从下课随手吃，到周末出去玩
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          学生街、马甲周边、泉州市区三片，按距离和路上时间分开整理。商家、景区和票价会变，出发前用地图复核。
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
        class="border-l-2 border-orange-400 bg-orange-50 dark:bg-orange-950 px-3 py-2 text-sm text-orange-900 dark:text-orange-300"
        role="status"
      >
        部分周边介绍暂时没显示出来，下面的地图地点仍然可以查看。
      </div>

      <section
        class="mb-10"
        aria-labelledby="nearby-guide-heading"
      >
        <div class="nearby-guide-shell overflow-hidden rounded-3xl border border-emerald-200/70 bg-[linear-gradient(145deg,#f0fdf4_0%,#ffffff_48%,#fff7ed_100%)] dark:bg-[linear-gradient(145deg,#0e1f13_0%,#171b17_48%,#241a10_100%)]">
          <div class="relative grid gap-6 overflow-hidden border-b border-emerald-100 dark:border-emerald-900 px-5 py-6 md:grid-cols-[minmax(0,1fr)_19rem] md:px-7 md:py-8">
            <div class="relative z-10">
              <p class="section-kicker">
                先选范围，再选想做的事
              </p>
              <h2
                id="nearby-guide-heading"
                class="mt-2 text-xl font-bold text-zinc-950 dark:text-zinc-100 md:text-2xl"
              >
                不用从一长页攻略里慢慢翻
              </h2>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                选“学校周边”或“泉州市区”，再点吃饭、景点、夜游、看展等标签。每个标签会给出几种不同地点，挑一个适合当天时间和预算的就行。
              </p>
              <p class="mt-5 inline-flex items-center gap-2 rounded-xl border border-green-200 dark:border-green-800 bg-white/80 dark:bg-zinc-900/80 px-3 py-2 text-xs font-semibold text-green-900 dark:text-green-300">
                <UIcon
                  name="i-lucide-route"
                  class="size-4"
                />
                每张卡片都能查这个地点的往返公交、步行和打车路线
              </p>
            </div>

            <div
              class="nearby-route-scene"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 320 180"
                class="h-full w-full"
              >
                <path
                  class="nearby-route-path"
                  d="M22 134 C77 73 118 150 167 91 S257 48 298 74"
                />
                <circle
                  class="nearby-route-dot nearby-route-dot-a"
                  cx="22"
                  cy="134"
                  r="7"
                />
                <circle
                  class="nearby-route-dot nearby-route-dot-b"
                  cx="167"
                  cy="91"
                  r="7"
                />
                <circle
                  class="nearby-route-dot nearby-route-dot-c"
                  cx="298"
                  cy="74"
                  r="7"
                />
              </svg>
              <span class="nearby-route-label nearby-route-label-a">学校</span>
              <span class="nearby-route-label nearby-route-label-b">古城</span>
              <span class="nearby-route-label nearby-route-label-c">海边</span>
            </div>
          </div>

          <div class="px-4 py-5 md:px-7 md:py-6">
            <div
              class="grid gap-2 sm:grid-cols-2"
              role="tablist"
              aria-label="选择游玩范围"
            >
              <button
                v-for="scope in guideScopeOptions"
                :key="scope.id"
                type="button"
                role="tab"
                class="group flex min-h-16 items-center gap-3 rounded-2xl border px-4 text-left transition"
                :class="activeGuideScope === scope.id
                  ? 'border-green-600 bg-green-700 text-white shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/50'"
                :aria-selected="activeGuideScope === scope.id"
                @click="selectGuideScope(scope.id)"
              >
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-xl"
                  :class="activeGuideScope === scope.id ? 'bg-white/15 dark:bg-zinc-900/15 text-white' : 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400'"
                >
                  <UIcon
                    :name="scope.icon"
                    class="size-5"
                  />
                </span>
                <span class="min-w-0">
                  <span class="block font-bold">{{ scope.label }}</span>
                  <span
                    class="mt-0.5 block text-xs"
                    :class="activeGuideScope === scope.id ? 'text-green-50' : 'text-zinc-500 dark:text-zinc-400'"
                  >{{ scope.description }}</span>
                </span>
              </button>
            </div>

            <div class="mt-5">
              <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                这次想做什么
              </p>
              <div
                class="guide-tag-tabs mt-2 flex snap-x gap-2 overflow-x-auto pb-2"
                role="tablist"
                :aria-label="`${activeGuideScopeOption.label}分类`"
              >
                <button
                  v-for="tag in visibleGuideTags"
                  :key="tag.id"
                  type="button"
                  role="tab"
                  class="inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-4 text-sm font-semibold transition"
                  :class="activeGuideTag === tag.id
                    ? 'border-orange-500 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 text-orange-800 dark:text-orange-300'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:border-orange-300 hover:text-orange-800 dark:hover:text-orange-300'"
                  :aria-selected="activeGuideTag === tag.id"
                  @click="selectGuideTag(tag.id)"
                >
                  <UIcon
                    :name="tag.icon"
                    class="size-4"
                  />
                  {{ tag.label }}
                  <span class="rounded-full bg-black/5 px-1.5 py-0.5 text-[11px] tabular-nums">
                    {{ guideTagItemCount(tag.categories) }}
                  </span>
                </button>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-200/80 pt-4">
              <div>
                <p class="text-xs font-semibold text-green-700 dark:text-green-400">
                  {{ activeGuideScopeOption.label }} · {{ selectedGuideTag?.label }}
                </p>
                <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  下面有 {{ selectedGuideItems.length }} 个选择，不用全部去。
                </p>
              </div>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                图片来自对应来源页面，营业、票价和场次出发前再查。
              </p>
            </div>

            <Transition
              name="guide-switch"
              mode="out-in"
            >
              <div
                :key="activeGuideTag"
                class="mt-5 grid gap-4 lg:grid-cols-2"
              >
                <NearbyGuideCard
                  v-for="(item, index) in selectedGuideItems"
                  :key="item.id"
                  :item="item"
                  :index="index"
                  :category-label="guideCategoryLabels[item.category]"
                />
              </div>
            </Transition>
          </div>
        </div>
      </section>

      <section
        v-if="!candidateFilterActive || activeCategory !== 'all' || searchQuery.trim()"
        class="mb-6"
        aria-labelledby="nearby-need-shortcuts-heading"
      >
        <p
          id="nearby-need-shortcuts-heading"
          class="text-xs font-semibold text-zinc-600 dark:text-zinc-300"
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
              ? 'border-green-600 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300'
              : 'border-[var(--line)] bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/40'"
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
              class="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-100"
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
            class="surface-panel group flex min-h-52 flex-col p-5 transition hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="grid size-10 place-items-center rounded-md bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300">
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
            <h3 class="mt-4 font-bold text-zinc-950 dark:text-zinc-100">
              {{ place.name }}
            </h3>
            <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {{ place.summary }}
            </p>
            <p
              v-if="place.address"
              class="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
            >
              {{ place.address }}
            </p>
            <span class="mt-4 inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
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
              class="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-100"
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
              class="group flex min-h-24 w-full items-start gap-3 rounded-md border border-[var(--line)] bg-white dark:bg-zinc-900 p-4 text-left transition hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
              :aria-label="`查看${tip.title}地点`"
              @click="selectNearbyNeed(tip.category)"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-md bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
                <UIcon
                  :name="tip.icon"
                  class="size-4.5"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="font-bold text-zinc-950 dark:text-zinc-100">{{ tip.title }}</span>
                <span class="mt-1 block text-sm leading-6 text-zinc-600 dark:text-zinc-300">{{ tip.text }}</span>
              </span>
              <UIcon
                name="i-lucide-arrow-right"
                class="mt-2 size-4 shrink-0 text-zinc-400 dark:text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-green-700 dark:group-hover:text-green-400"
              />
            </button>
          </li>
        </ul>
      </section>

      <div
        v-else-if="!error && filteredCandidates.length"
        class="flex flex-wrap items-center justify-between gap-3 border-l-2 border-green-600 bg-green-50 dark:bg-green-950 px-4 py-3"
        role="status"
      >
        <p class="text-sm font-medium text-green-950 dark:text-green-300">
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
        class="border-l-2 border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-3"
        role="status"
      >
        <p class="text-sm font-semibold text-amber-950 dark:text-amber-100">
          {{ listMessages.emptyMatchTitle }}
        </p>
        <p class="mt-1 text-xs leading-5 text-amber-900 dark:text-amber-300">
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
        class="mt-10 scroll-mt-20 border-t border-zinc-200 dark:border-zinc-800 pt-8"
      >
        <div>
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
            {{ listMessages.candidatesHeading }}
          </h2>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            <template v-if="candidateFilterActive">
              按当前条件找到 {{ filteredCandidates.length }} 个地点。点开后可以在{{ safeExternalHref(candidateCatalog.providerDocumentation) ? '高德地图' : '地图' }}查看位置和近期营业信息。
            </template>
            <template v-else>
              这里整理了 {{ filteredCandidates.length }} 个新区、旧区的餐饮、便利、快递和生活服务地点。点开后可以在{{ safeExternalHref(candidateCatalog.providerDocumentation) ? '高德地图' : '地图' }}查看位置，营业时间和价格请以近期信息或现场为准。
            </template>
          </p>
          <p class="mt-2 flex max-w-3xl items-start gap-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            <UIcon
              name="i-lucide-info"
              class="mt-0.5 size-3.5 shrink-0 text-green-700 dark:text-green-400"
            />
            <span>卡片里的距离是商铺到新区或旧区学生街参考位置的大致距离，不是从你当前位置算起。</span>
          </p>
        </div>

        <details class="group mt-5 border-y border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-zinc-800 dark:text-zinc-100 marker:hidden">
            <span class="inline-flex items-center gap-2">
              <UIcon
                name="i-lucide-list-checks"
                class="size-4 text-green-700 dark:text-green-400"
              />
              出发前确认这几件事
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 text-zinc-400 dark:text-zinc-500 transition group-open:rotate-180"
            />
          </summary>
          <div class="border-t border-zinc-100 dark:border-zinc-800 py-4">
            <ul class="grid gap-2 text-xs leading-5 text-zinc-700 dark:text-zinc-200 md:grid-cols-2">
              <li
                v-for="item in verificationChecklist"
                :key="item"
                class="flex gap-2 rounded-md bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2"
              >
                <UIcon
                  name="i-lucide-circle-check"
                  class="mt-0.5 size-3.5 shrink-0 text-green-700 dark:text-green-400"
                />
                <span>{{ item }}</span>
              </li>
            </ul>
          </div>
        </details>

        <p class="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          <template v-if="candidateFilterActive">
            找到 {{ filteredCandidates.length }} 个地点
          </template>
          <template v-else>
            先显示 {{ Math.min(filteredCandidates.length, nearbyCandidatePreviewLimit) }} 个，共 {{ filteredCandidates.length }} 个
          </template>
          · 名单更新于 {{ candidateCatalog.generatedAt.slice(0, 10) }}
        </p>
        <details class="group mt-4 border-y border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200 marker:hidden">
            <span class="inline-flex items-center gap-2">
              <UIcon
                name="i-lucide-book-open"
                class="size-4 text-green-700 dark:text-green-400"
              />
              这些地点从哪里整理
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 text-zinc-400 dark:text-zinc-500 transition group-open:rotate-180"
            />
          </summary>
          <ul class="grid gap-3 border-t border-zinc-100 dark:border-zinc-800 py-4 md:grid-cols-3">
            <li
              v-for="source in nearbyResearchSources"
              :key="source.url"
            >
              <a
                v-if="sourceIsClickable(source)"
                :href="safeExternalHref(source.url) || undefined"
                target="_blank"
                rel="noopener noreferrer"
                class="group flex items-start gap-2 text-xs leading-5 text-zinc-700 dark:text-zinc-200 hover:text-green-700 dark:hover:text-green-400"
              >
                <UIcon
                  name="i-lucide-external-link"
                  class="mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  <span class="font-medium">{{ source.title }}</span>
                  <span class="block text-zinc-500 dark:text-zinc-400">{{ sourceContextForStudents(source.context) }}</span>
                </span>
              </a>
              <div
                v-else
                class="flex items-start gap-2 text-xs leading-5 text-zinc-700 dark:text-zinc-200"
              >
                <UIcon
                  name="i-lucide-link-2-off"
                  class="mt-0.5 size-3.5 shrink-0 text-orange-600 dark:text-orange-300"
                />
                <span>
                  <span class="font-medium">{{ source.title }}</span>
                  <span class="block text-zinc-500 dark:text-zinc-400">{{ sourceContextForStudents(source.context) }}</span>
                  <span class="block text-orange-700 dark:text-orange-300">原分享目前打不开，以上内容只作参考。</span>
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
              <span class="text-right text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ candidateDistanceLabel(candidate) }}</span>
            </div>
            <h3 class="mt-3 font-bold text-zinc-950 dark:text-zinc-100">
              {{ candidate.name }}
            </h3>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <UBadge
                :label="categoryLabels[candidate.category]"
                color="warning"
                variant="soft"
              />
            </div>
            <p class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {{ candidate.address || '暂时没有详细地址' }}
            </p>
            <p class="mt-3 rounded-md bg-orange-50 dark:bg-orange-950 px-3 py-2 text-xs leading-5 text-orange-900 dark:text-orange-300">
              {{ candidateHint(candidate) }}
            </p>
            <div class="mt-auto flex items-end justify-between gap-3 pt-4">
              <span class="text-xs text-orange-700 dark:text-orange-300">出发前看营业情况</span>
              <span class="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
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

<style scoped>
.nearby-route-scene {
  position: relative;
  min-height: 10rem;
  border: 1px solid rgb(167 243 208 / 70%);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at 78% 20%, rgb(251 146 60 / 22%), transparent 30%),
    radial-gradient(circle at 20% 80%, rgb(34 197 94 / 20%), transparent 34%),
    linear-gradient(135deg, rgb(255 255 255 / 82%), rgb(236 253 245 / 84%));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 85%);
}

.nearby-route-scene::after {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgb(22 101 52 / 18%) 1px, transparent 1px);
  background-size: 18px 18px;
  border-radius: inherit;
  content: '';
  mask-image: linear-gradient(to bottom right, black, transparent 82%);
  pointer-events: none;
}

.nearby-route-path {
  fill: none;
  stroke: rgb(22 163 74 / 72%);
  stroke-dasharray: 8 10;
  stroke-linecap: round;
  stroke-width: 3;
  animation: nearby-route-travel 12s linear infinite;
}

.nearby-route-dot {
  fill: white;
  stroke: rgb(22 163 74);
  stroke-width: 4;
  transform-box: fill-box;
  transform-origin: center;
  animation: nearby-route-pulse 2.4s ease-in-out infinite;
}

.nearby-route-dot-b {
  animation-delay: 0.5s;
}

.nearby-route-dot-c {
  animation-delay: 1s;
}

.nearby-route-label {
  position: absolute;
  z-index: 1;
  border: 1px solid rgb(255 255 255 / 80%);
  border-radius: 999px;
  background: rgb(255 255 255 / 88%);
  box-shadow: 0 8px 24px rgb(15 23 42 / 8%);
  color: rgb(39 39 42);
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
  padding: 0.4rem 0.55rem;
  backdrop-filter: blur(8px);
}

.nearby-route-label-a {
  bottom: 9%;
  left: 3%;
}

.nearby-route-label-b {
  left: 47%;
  top: 39%;
}

.nearby-route-label-c {
  right: 2%;
  top: 21%;
}

.guide-tag-tabs {
  scrollbar-width: none;
}

.guide-tag-tabs::-webkit-scrollbar {
  display: none;
}

.guide-switch-enter-active,
.guide-switch-leave-active {
  transition: opacity 180ms ease, transform 220ms ease;
}

.guide-switch-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.guide-switch-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

@keyframes nearby-route-travel {
  to {
    stroke-dashoffset: -180;
  }
}

@keyframes nearby-route-pulse {
  0%,
  100% {
    transform: scale(0.86);
  }

  50% {
    transform: scale(1.18);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nearby-route-path,
  .nearby-route-dot {
    animation: none;
  }

  .guide-switch-enter-active,
  .guide-switch-leave-active {
    transition: none;
  }
}
</style>
