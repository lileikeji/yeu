<script setup lang="ts">
import type { FrontendFeatureKey } from '~~/shared/config/frontend-features'
import { currentCohortLabel } from '~~/shared/config/cohort'
import { homeHotlines } from '~~/data/hotlines'
import {
  buildHomeEssentialActions,
  buildHomeImportantDates,
  buildHomeSearchTarget,
  homeMoreEntries,
  homeTimelineStages,
  homeTrustNotice,
  type HomeGuideLike
} from '~~/app/utils/home-presentation'

useSeoMeta({
  title: '首页',
  description: '本科与专升本新生的报到、校园地图、宿舍、校园网和校园生活入口。'
})

const showIntro = ref(false)
const route = useRoute()
const forceIntro = ref(route.query.intro === '1')
const { mode: activeHomeMode } = useHomeMode()
watch(activeHomeMode, (mode) => {
  if (mode === 'compact') showIntro.value = false
})
onMounted(() => {
  // The guide must be usable immediately. The full-screen animation is opt-in
  // after the first visit, or can be forced with ?intro=1.
  if (forceIntro.value) {
    showIntro.value = true
  }
})

function onIntroComplete() {
  showIntro.value = false
  forceIntro.value = false
}

const placeQuery = ref('')
const importantTimeOpen = ref(false)
const featureRequest = usePublicFrontendFeatures()
const homeEntryRequest = usePublicHomeEntries()
const merchantRequest = usePublicPromotedMerchants()
const guideListRequest = usePublicGuideList()
const procedureListRequest = usePublicProcedureList()
await Promise.all([featureRequest, homeEntryRequest, merchantRequest, guideListRequest, procedureListRequest])

const { data: publicFeatureResponse } = featureRequest
const { data: publicHomeEntryResponse } = homeEntryRequest
const { data: publicMerchantResponse } = merchantRequest
const { data: publicGuideListResponse } = guideListRequest
const { data: publicProcedureListResponse } = procedureListRequest

/** 首页"校园周边商家"：仅展示后台开启推广的地点，无推广时整块隐藏。 */
const signalListRequest = usePublicSignalList(5)
const homeSignalEvents = computed(() => signalListRequest.data.value?.events ?? [])

const promotedMerchants = computed(() => publicMerchantResponse.value?.items ?? [])
const merchantIcon = (type: string | null) => (
  ({
    'dining': 'i-lucide-utensils',
    'food': 'i-lucide-utensils',
    'sports-ground': 'i-lucide-dumbbell',
    'shop': 'i-lucide-store'
  } as Record<string, string>)[type ?? ''] ?? 'i-lucide-store'
)
const merchantTypeLabel = (type: string | null) => (
  ({
    'dining': '餐饮',
    'food': '餐饮',
    'sports-ground': '运动休闲',
    'shop': '周边商铺'
  } as Record<string, string>)[type ?? ''] ?? '周边'
)

const importantDates = computed(() => buildHomeImportantDates(publicProcedureListResponse.value?.items))
const importantDatesLine = computed(() => (
  importantDates.value
    .map(item => `${item.date}${item.title}`)
    .join(' · ')
))

const disabledFeatureKeys = computed(() => new Set(publicFeatureResponse.value?.disabledKeys ?? []))
const featureEnabled = (key: FrontendFeatureKey) => !disabledFeatureKeys.value.has(key)
const featurePlacement = (key: FrontendFeatureKey, fallback: 'quick' | 'timeline' | 'services') => (
  publicFeatureResponse.value?.placements?.[key] ?? fallback
)
const featureSortOrder = (key: FrontendFeatureKey) => publicFeatureResponse.value?.sortOrders?.[key] ?? 100
const customHomeEntries = computed(() => publicHomeEntryResponse.value?.items ?? [])
const dbGuides = computed<HomeGuideLike[]>(() => (
  (publicGuideListResponse.value?.items ?? [])
    .filter(item => item.kind === 'guide' && item.status === 'published')
    .map(item => ({ slug: item.slug, summary: item.summary }))
))
const defaultEssentialActions = buildHomeEssentialActions(dbGuides.value)
const defaultTimelineStages = homeTimelineStages
const defaultMoreEntries = homeMoreEntries

function asActionEntry(item: {
  featureKey: FrontendFeatureKey
  title: string
  description: string
  to: string
  icon: string
}, tone = 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300') {
  return {
    ...item,
    featureKey: undefined,
    meta: '首页入口',
    tone
  }
}

const essentialActions = computed(() => [
  ...defaultEssentialActions
    .filter(action => featureEnabled(action.featureKey) && featurePlacement(action.featureKey, 'quick') === 'quick')
    .sort((left, right) => featureSortOrder(left.featureKey) - featureSortOrder(right.featureKey)),
  ...defaultTimelineStages
    .filter(stage => featureEnabled(stage.featureKey) && featurePlacement(stage.featureKey, 'timeline') === 'quick')
    .map(stage => asActionEntry({
      featureKey: stage.featureKey,
      title: stage.title,
      description: stage.items.join(' · '),
      to: stage.to,
      icon: 'i-lucide-list-todo'
    })),
  ...defaultMoreEntries
    .filter(entry => featureEnabled(entry.featureKey) && featurePlacement(entry.featureKey, 'services') === 'quick')
    .map(entry => asActionEntry(entry, entry.tone)),
  ...customHomeEntries.value
    .filter(entry => entry.placement === 'quick')
    .map(entry => ({
      ...entry,
      featureKey: undefined,
      meta: '首页入口',
      tone: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
    }))
].sort((left, right) => featureSortOrder(left.featureKey as FrontendFeatureKey) - featureSortOrder(right.featureKey as FrontendFeatureKey)))
const timelineStages = computed(() => [
  ...defaultTimelineStages
    .filter(stage => featureEnabled(stage.featureKey) && featurePlacement(stage.featureKey, 'timeline') === 'timeline'),
  ...defaultEssentialActions
    .filter(action => featureEnabled(action.featureKey) && featurePlacement(action.featureKey, 'quick') === 'timeline')
    .map(action => ({
      featureKey: action.featureKey,
      label: action.title,
      title: action.title,
      items: [action.description],
      actionLabel: '打开入口',
      to: action.to
    })),
  ...defaultMoreEntries
    .filter(entry => featureEnabled(entry.featureKey) && featurePlacement(entry.featureKey, 'services') === 'timeline')
    .map(entry => ({
      featureKey: entry.featureKey,
      label: entry.title,
      title: entry.title,
      items: [entry.description],
      actionLabel: '打开入口',
      to: entry.to
    }))
].sort((left, right) => featureSortOrder(left.featureKey) - featureSortOrder(right.featureKey)))
const activeTimelineIndex = ref(0)
const activeTimelineStage = computed(() => timelineStages.value[activeTimelineIndex.value] ?? timelineStages.value[0])
const serviceNavEntries = computed(() => [
  ...defaultMoreEntries
    .filter(entry => featureEnabled(entry.featureKey) && featurePlacement(entry.featureKey, 'services') === 'services')
    .sort((left, right) => featureSortOrder(left.featureKey) - featureSortOrder(right.featureKey)),
  ...defaultEssentialActions
    .filter(action => featureEnabled(action.featureKey) && featurePlacement(action.featureKey, 'quick') === 'services')
    .map(action => ({ ...action, external: false })),
  ...defaultTimelineStages
    .filter(stage => featureEnabled(stage.featureKey) && featurePlacement(stage.featureKey, 'timeline') === 'services')
    .map(stage => ({
      featureKey: stage.featureKey,
      title: stage.title,
      description: stage.items.join(' · '),
      to: stage.to,
      icon: 'i-lucide-list-todo',
      tone: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
    })),
  ...customHomeEntries.value
    .filter(entry => entry.placement === 'services' || entry.placement === 'more')
    .map(entry => ({
      ...entry,
      featureKey: undefined,
      tone: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
    }))
])

function searchSite() {
  const target = buildHomeSearchTarget(placeQuery.value)
  void navigateTo({
    ...target,
    query: {
      ...target.query,
      mode: 'ai'
    }
  })
}

function openImportantTime(): void {
  importantTimeOpen.value = true
}

function closeImportantTime(): void {
  importantTimeOpen.value = false
}

const {
  homeSummary: checklistSummary,
  hydrated: checklistHydrated
} = useFreshmanChecklist()
</script>

<template>
  <div class="overflow-x-clip">
    <HomeCompactWechatGuide v-if="activeHomeMode === 'compact'" />

    <ClientOnly>
      <IntroOverlay
        v-if="activeHomeMode === 'full' && showIntro"
        :force="forceIntro"
        @complete="onIntroComplete"
      />
    </ClientOnly>

    <div
      v-show="activeHomeMode === 'full'"
      class="animate-spring-up"
    >
      <section class="border-b border-[var(--line)] bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md relative overflow-hidden">
        <div class="border-b border-orange-200/80 bg-orange-50/80 dark:bg-orange-950/80 text-orange-800 dark:text-orange-300">
          <button
            type="button"
            class="page-shell grid min-h-12 w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 py-2 text-left text-[11px] md:min-h-12 md:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] md:gap-4 md:text-sm"
            :aria-label="`查看${currentCohortLabel}重要时间`"
            @click="openImportantTime"
          >
            <UIcon
              name="i-lucide-volume-2"
              class="size-4 shrink-0 text-orange-600 dark:text-orange-300 md:size-5"
            />
            <span class="shrink-0 font-semibold">{{ currentCohortLabel }}重要时间</span>
            <span class="hidden h-5 w-px bg-orange-300 md:block" />
            <span class="important-time-window min-w-0 overflow-hidden whitespace-nowrap">
              <span class="important-time-track inline-flex min-w-max items-center gap-10 pr-10">
                <span>{{ importantDatesLine }}</span>
                <span aria-hidden="true">{{ importantDatesLine }}</span>
              </span>
            </span>
            <span class="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-orange-900 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/50 md:min-h-9 md:px-2 md:text-xs">
              查看
              <UIcon
                name="i-lucide-chevron-right"
                class="size-3.5"
              />
            </span>
          </button>
        </div>

        <UModal
          v-model:open="importantTimeOpen"
          :title="`${currentCohortLabel}重要时间`"
          description="以下日期来自学校最新校历，具体到校时段与材料以录取通知书及学校后续通知为准。"
          :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-xl' }"
        >
          <template #body>
            <ol class="divide-y divide-zinc-100 dark:divide-zinc-800">
              <li
                v-for="item in importantDates"
                :key="item.title"
                class="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-4 first:pt-0"
              >
                <span class="text-sm font-bold text-green-700 dark:text-green-400">{{ item.date }}</span>
                <div>
                  <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                    {{ item.title }}
                  </h3>
                  <p class="mt-1 text-xs leading-6 text-zinc-600 dark:text-zinc-300">
                    {{ item.description }}
                  </p>
                </div>
              </li>
            </ol>
            <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                个人安排有变化时，以学校和学院的最新通知为准。
              </p>
              <UButton
                to="/guides/arrival"
                icon="i-lucide-arrow-right"
                trailing
                label="查看详细"
                class="min-h-11"
                @click="closeImportantTime"
              />
            </div>
          </template>
        </UModal>

        <div class="page-shell py-6 text-left md:py-10 md:text-center">
          <h1 class="text-left text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100 md:text-center md:text-4xl">
            {{ currentCohortLabel }}入学指南
          </h1>
          <p class="mx-auto mt-2 max-w-2xl text-left text-xs leading-5 text-zinc-600 dark:text-zinc-300 md:mt-3 md:text-center md:text-sm md:leading-6">
            报到、住宿、地图、办事这些新生要弄明白的事项，集中整理在这里，便于你按需查询。信息以录取通知书和学校最新通知为准。
          </p>

          <form
            class="mx-auto mt-4 flex max-w-3xl gap-0 text-left md:mt-7"
            role="search"
            @submit.prevent="searchSite"
          >
            <UInput
              v-model="placeQuery"
              icon="i-lucide-search"
              size="md"
              class="min-w-0 flex-1"
              placeholder="搜索校园信息，或输入你的问题"
              aria-label="搜索校园信息或提出问题"
            />
            <UButton
              type="submit"
              icon="i-lucide-sparkles"
              label="AI 搜索"
              size="md"
              class="min-h-10 rounded-l-none px-3 text-xs md:min-h-11 md:px-8 md:text-sm"
            />
          </form>
        </div>
      </section>

      <section
        v-if="essentialActions.length"
        class="page-shell py-5 md:py-8"
      >
        <div>
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100 md:text-xl">
            常用查询
          </h2>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2.5 md:mt-4 md:gap-3 lg:grid-cols-4">
          <NuxtLink
            v-for="action in essentialActions"
            :key="action.to"
            :to="action.to"
            class="group grid min-h-[4.75rem] place-items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-left transition hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm md:min-h-32 md:p-4 md:text-center"
          >
            <div class="flex w-full min-w-0 items-center gap-2 md:flex-col md:justify-center md:gap-3 md:text-center">
              <span
                class="grid size-8 shrink-0 place-items-center rounded-md md:size-12 md:rounded-lg"
                :class="action.tone"
              >
                <UIcon
                  :name="action.icon"
                  class="size-4.5 md:size-7"
                />
              </span>
              <span class="min-w-0">
                <h3 class="text-[13px] font-bold leading-4.5 text-zinc-950 dark:text-zinc-100 md:text-base md:leading-5">
                  {{ action.title }}
                </h3>
                <span class="mt-0.5 line-clamp-2 block text-[10px] leading-3.5 text-zinc-500 dark:text-zinc-400 md:hidden">
                  {{ action.description }}
                </span>
              </span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section
        v-if="homeSignalEvents.length"
        class="border-t border-[var(--line)] bg-white dark:bg-zinc-900"
      >
        <div class="page-shell py-5 md:py-8">
          <div class="flex items-end justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100 md:text-xl">
                  最近在发
                </h2>
                <span class="inline-flex min-h-6 items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                  <UIcon
                    name="i-lucide-flame"
                    class="size-3.5"
                  />
                  每天更新
                </span>
              </div>
              <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400 md:text-sm md:leading-6">
                教务处、学生处等站点新发的通知，同一件事多个来源合成一条，按热度排。
              </p>
            </div>
            <NuxtLink
              to="/hot"
              class="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-semibold text-green-700 dark:text-green-400"
            >
              全部热度
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4"
              />
            </NuxtLink>
          </div>

          <ul class="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <li
              v-for="event in homeSignalEvents"
              :key="event.id"
            >
              <NuxtLink
                to="/hot"
                class="flex items-start gap-2.5 px-3 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 md:gap-3 md:px-4"
              >
                <span
                  class="mt-0.5 inline-flex min-h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-bold"
                  :class="SIGNAL_TREND_CLASS[event.trend]"
                >
                  {{ SIGNAL_TREND_LABEL[event.trend] }}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="line-clamp-2 text-[13px] font-semibold leading-5 text-zinc-950 dark:text-zinc-100 md:line-clamp-1 md:text-sm">
                    {{ event.title }}
                  </span>
                  <span class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>{{ event.category }}</span>
                    <span aria-hidden="true">·</span>
                    <span>{{ event.sourceCount }} 个来源 · {{ event.itemCount }} 条</span>
                    <span aria-hidden="true">·</span>
                    <span>热度 {{ signalHeatText(event.heat) }}</span>
                    <span aria-hidden="true">·</span>
                    <span>{{ signalRelativeTime(event.lastSeenAt) }}</span>
                  </span>
                </span>
                <span
                  class="mt-0.5 hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold sm:inline-flex"
                  :class="SIGNAL_TIER_CLASS[event.tier]"
                >
                  {{ event.tierLabel }}
                </span>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </section>

      <section
        v-if="promotedMerchants.length"
        class="border-t border-[var(--line)] bg-white dark:bg-zinc-900"
      >
        <div class="page-shell py-5 md:py-8">
          <div class="flex items-end justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100 md:text-xl">
                  校园周边商家
                </h2>
                <span class="inline-flex min-h-6 items-center gap-1 rounded-full bg-green-50 dark:bg-green-950 px-2 text-[11px] font-bold text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800">
                  <UIcon
                    name="i-lucide-badge-check"
                    class="size-3.5"
                  />
                  入驻商家
                </span>
              </div>
              <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400 md:text-sm md:leading-6">
                入驻学生街的商家均已收录在校园地图，评分来自高德，营业与价格以到店实际为准。
              </p>
            </div>
            <NuxtLink
              to="/map"
              class="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-semibold text-green-700 dark:text-green-400"
            >
              打开地图
              <UIcon
                name="i-lucide-arrow-right"
                class="size-4"
              />
            </NuxtLink>
          </div>

          <div class="mt-3 grid gap-2.5 md:mt-4 md:grid-cols-3 md:gap-3">
            <NuxtLink
              v-for="merchant in promotedMerchants"
              :key="merchant.slug"
              :to="`/map?place=${encodeURIComponent(merchant.slug)}`"
              class="group flex flex-col gap-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 text-left transition hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm md:min-h-40 md:p-4"
            >
              <span class="flex items-center gap-2.5">
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
                  <UIcon
                    :name="merchantIcon(merchant.type)"
                    class="size-4.5"
                  />
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-sm font-bold text-zinc-950 dark:text-zinc-100">
                    {{ merchant.name }}
                  </span>
                  <span class="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <template v-if="merchant.area">
                      <span class="rounded bg-amber-100 px-1 py-px font-semibold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                        {{ merchant.area }}
                      </span>
                    </template>
                    {{ merchantTypeLabel(merchant.type) }}
                  </span>
                </span>
                <span
                  v-if="merchant.score !== null"
                  class="ml-auto shrink-0 rounded-md bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-300"
                >
                  ★ {{ merchant.score.toFixed(1) }}
                </span>
                <span
                  v-else
                  class="ml-auto shrink-0 rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"
                >
                  新店收录
                </span>
              </span>
              <span
                v-if="merchant.tagline"
                class="line-clamp-2 min-h-0 text-xs leading-5 text-zinc-600 dark:text-zinc-300"
              >
                {{ merchant.tagline }}
              </span>
              <span class="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400">
                查看地图定位
                <UIcon
                  name="i-lucide-map-pin"
                  class="size-3.5 transition group-hover:translate-x-0.5"
                />
              </span>
            </NuxtLink>
          </div>
        </div>
      </section>

      <section
        v-if="timelineStages.length"
        class="border-y border-[var(--line)] bg-white dark:bg-zinc-900"
      >
        <div class="page-shell py-6 md:py-9">
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100 md:text-xl">
            按入学阶段查看
          </h2>
          <div class="mt-3 grid gap-5 md:mt-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)] lg:items-stretch lg:gap-4">
            <div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 md:p-5">
              <div class="grid grid-cols-3 border-b border-zinc-200 dark:border-zinc-800">
                <button
                  v-for="(stage, index) in timelineStages"
                  :key="stage.label"
                  type="button"
                  class="min-h-10 border-b-2 px-2 text-xs font-medium transition md:min-h-11 md:text-sm"
                  :class="index === activeTimelineIndex ? 'border-green-700 bg-green-700 font-bold text-white md:bg-transparent dark:md:bg-transparent md:text-green-700 dark:md:text-green-400' : 'border-transparent text-zinc-600 dark:text-zinc-300 hover:text-green-700 dark:hover:text-green-400'"
                  @click="activeTimelineIndex = index"
                >
                  {{ stage.label }}
                </button>
              </div>

              <div
                v-if="activeTimelineStage"
                class="px-3 pb-3 pt-1 md:px-0 md:pb-0 md:pt-2"
              >
                <ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
                  <li
                    v-for="item in activeTimelineStage.items"
                    :key="item"
                    class="flex items-center gap-2.5 py-2.5 text-sm leading-5 text-zinc-700 dark:text-zinc-200 md:gap-3 md:py-3 md:leading-6"
                  >
                    <UIcon
                      name="i-lucide-circle-check"
                      class="size-4.5 shrink-0 text-green-700 dark:text-green-400 md:size-5"
                    />
                    <span>{{ item }}</span>
                  </li>
                </ul>
                <NuxtLink
                  :to="activeTimelineStage.to"
                  class="mt-1 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-green-700 dark:text-green-400 md:mt-3 md:min-h-11"
                >
                  {{ activeTimelineStage.actionLabel }}
                  <UIcon
                    name="i-lucide-arrow-right"
                    class="size-4"
                  />
                </NuxtLink>
              </div>
            </div>

            <NuxtLink
              v-if="featureEnabled('home.more.checklist')"
              to="/checklist"
              class="group bg-white dark:bg-zinc-900 transition lg:rounded-lg lg:border lg:border-zinc-200 dark:lg:border-zinc-800 lg:p-5 lg:hover:border-green-300 dark:hover:border-green-700 dark:lg:hover:border-green-600 lg:hover:shadow-sm"
            >
              <div class="flex items-center gap-3">
                <span class="hidden size-10 place-items-center rounded-lg bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 lg:grid">
                  <UIcon
                    name="i-lucide-list-checks"
                    class="size-5"
                  />
                </span>
                <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100 lg:text-base">
                  新生准备清单
                </h2>
              </div>
              <p class="mt-3 text-sm text-zinc-700 dark:text-zinc-200 lg:mt-5">
                已完成 <strong class="text-lg text-green-700 dark:text-green-400">{{ checklistSummary.percent }}%</strong>
              </p>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 lg:mt-3">
                <div
                  class="h-full rounded-full bg-green-700 transition-[width]"
                  :style="{ width: `${checklistSummary.percent}%` }"
                />
              </div>
              <div class="mt-3 flex items-center justify-between gap-3 lg:mt-4">
                <p class="min-w-0 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  <template v-if="checklistHydrated && checklistSummary.remainingCount > 0">
                    下一项：{{ checklistSummary.nextTitle || '继续完成准备事项' }}
                  </template>
                  <template v-else-if="checklistHydrated">当前清单已全部勾完，可随时复查。</template>
                  <template v-else>打开后可以继续勾选。</template>
                </p>
                <span class="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-green-700 px-4 text-sm font-semibold text-green-700 dark:text-green-400 transition group-hover:bg-green-50 dark:group-hover:bg-green-950 lg:min-h-11 lg:px-5">
                  打开清单
                </span>
              </div>
            </NuxtLink>
          </div>
        </div>
      </section>

      <section
        class="border-t border-[var(--line)] bg-green-50/60 dark:bg-green-950/60"
      >
        <div class="page-shell py-6 md:py-8">
          <div class="flex items-center gap-2">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-green-700 text-white">
              <UIcon
                name="i-lucide-phone-call"
                class="size-4"
              />
            </span>
            <h2 class="text-base font-bold text-zinc-950 dark:text-zinc-100 md:text-lg">
              校内求助与常用电话
            </h2>
          </div>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-zinc-700 dark:text-zinc-200">
            校内遇到火情、治安或宿舍设施紧急故障，先拨校园 110 报修求助。就医、心理支持和学籍问题上，按下面电话找对应部门。
          </p>
          <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <a
              v-for="hotline in homeHotlines"
              :key="hotline.id"
              :href="`tel:${hotline.phone.replace(/\D/g, '')}`"
              class="inline-flex min-h-11 items-center justify-between gap-2 rounded-md bg-white dark:bg-zinc-900 px-4 text-sm font-semibold text-zinc-950 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700 hover:ring-green-300"
            >
              <span class="flex items-center gap-2">
                <UIcon
                  :name="hotline.icon"
                  class="size-4 text-green-700 dark:text-green-400"
                />
                <span>{{ hotline.label }}</span>
              </span>
              <span class="text-zinc-500 dark:text-zinc-400">{{ hotline.note }}</span>
            </a>
          </div>
          <p class="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            医务室实行全年 24 小时值班，具体入口可在校园地图搜索「医务所」；报修和求助详情以校保卫处、医务室及到场人员指引为准。
          </p>
        </div>
      </section>

      <section
        class="border-y border-[var(--line)] bg-white dark:bg-zinc-900"
      >
        <div class="page-shell py-6 md:py-9">
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100 md:text-xl">
            服务导航
          </h2>
          <div class="mt-3 grid overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 md:mt-4 md:grid-cols-5">
            <NuxtLink
              v-for="entry in serviceNavEntries"
              :key="entry.to"
              :to="entry.to"
              class="group flex min-h-16 items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2.5 transition hover:bg-green-50 dark:hover:bg-green-950 md:min-h-28 md:flex-col md:justify-center md:border-b-0 md:border-r md:p-4 md:text-center md:last:border-r-0"
            >
              <UIcon
                :name="entry.icon"
                class="size-5.5 shrink-0 text-green-700 dark:text-green-400 md:size-7"
              />
              <span class="min-w-0">
                <span class="block text-sm font-bold text-zinc-950 dark:text-zinc-100">{{ entry.title }}</span>
                <span class="mt-0.5 block text-[11px] leading-4 text-zinc-500 dark:text-zinc-400 md:hidden">{{ entry.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="ml-auto size-4 shrink-0 text-zinc-400 dark:text-zinc-500 md:hidden"
              />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section
        class="border-t border-[var(--line)] bg-zinc-50/60 dark:bg-zinc-800/60"
      >
        <div class="page-shell py-8 md:py-10">
          <div class="mx-auto max-w-3xl text-center">
            <span class="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white dark:bg-zinc-900 px-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200 ring-1 ring-zinc-200 dark:ring-zinc-700">
              <UIcon
                name="i-lucide-heart-handshake"
                class="size-4 text-green-700 dark:text-green-400"
              />
              {{ homeTrustNotice.badge }}
            </span>
            <h2 class="mt-4 text-lg font-bold text-zinc-950 dark:text-zinc-100 md:text-xl">
              {{ homeTrustNotice.title }}
            </h2>
            <p class="mx-auto mt-2 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              {{ homeTrustNotice.description }}
            </p>
            <p class="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {{ homeTrustNotice.checkedText }}
            </p>
            <div class="mt-5 flex flex-wrap justify-center gap-2">
              <UButton
                v-for="link in homeTrustNotice.links"
                :key="link.label"
                :to="link.to"
                :icon="link.icon"
                :label="link.label"
                :external="link.external"
                :target="link.external ? '_blank' : undefined"
                :rel="link.external ? 'noopener noreferrer' : undefined"
                color="neutral"
                variant="ghost"
                size="sm"
                class="min-h-10"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.important-time-track {
  animation: important-time-scroll 16s linear infinite;
}

.important-time-window:hover .important-time-track {
  animation-play-state: paused;
}

@keyframes important-time-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(calc(-50% - 1.25rem)); }
}

@media (prefers-reduced-motion: reduce) {
  .important-time-track { animation: none; }
}
</style>
