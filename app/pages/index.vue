<script setup lang="ts">
import type { FrontendFeatureKey } from '~~/shared/config/frontend-features'
import {
  buildHomeEssentialActions,
  buildHomeSearchTarget,
  homeMoreEntries,
  homeTimelineStages
} from '~~/app/utils/home-presentation'

useSeoMeta({
  title: '首页',
  description: '本科与专升本新生的报到、校园地图、宿舍、校园网和校园生活入口。'
})

const showIntro = ref(false)
const route = useRoute()
const forceIntro = ref(route.query.intro === '1')
const homeMode = useCookie<'full' | 'compact'>('yeu-home-mode', {
  default: () => 'full',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365
})
// Keep the visible mode in a local ref so embedded browsers update the page
// immediately; the cookie only persists the user's choice between visits.
const activeHomeMode = ref<'full' | 'compact'>(homeMode.value)
onMounted(() => {
  // The guide must be usable immediately. The full-screen animation is opt-in
  // after the first visit, or can be forced with ?intro=1.
  if (forceIntro.value) {
    showIntro.value = true
  }
  activeHomeMode.value = homeMode.value
})

function onIntroComplete() {
  showIntro.value = false
  forceIntro.value = false
}

const placeQuery = ref('')
const importantTimeOpen = ref(false)
const importantDates = [
  { date: '9月5–6日', title: '注册报到', description: '具体到校时段、报到地点和材料以录取通知书及学校后续通知为准。' },
  { date: '9月7–9日', title: '入学教育', description: '学院集合地点、时间和安排以辅导员或学院通知为准。' },
  { date: '9月10日', title: '开始上课', description: '课表、教材和教学安排以教务系统及学院通知为准。' }
]
const featureRequest = usePublicFrontendFeatures()
const homeEntryRequest = usePublicHomeEntries()
await Promise.all([featureRequest, homeEntryRequest])

const { data: publicFeatureResponse } = featureRequest
const { data: publicHomeEntryResponse } = homeEntryRequest

const disabledFeatureKeys = computed(() => new Set(publicFeatureResponse.value?.disabledKeys ?? []))
const featureEnabled = (key: FrontendFeatureKey) => !disabledFeatureKeys.value.has(key)
const featurePlacement = (key: FrontendFeatureKey, fallback: 'quick' | 'timeline' | 'services') => (
  publicFeatureResponse.value?.placements?.[key] ?? fallback
)
const featureSortOrder = (key: FrontendFeatureKey) => publicFeatureResponse.value?.sortOrders?.[key] ?? 100
const customHomeEntries = computed(() => publicHomeEntryResponse.value?.items ?? [])
const defaultEssentialActions = buildHomeEssentialActions([])
const defaultTimelineStages = homeTimelineStages
const defaultMoreEntries = homeMoreEntries

function asActionEntry(item: {
  featureKey: FrontendFeatureKey
  title: string
  description: string
  to: string
  icon: string
}, tone = 'bg-amber-50 text-amber-700') {
  return {
    ...item,
    featureKey: undefined,
    meta: '首页入口',
    tone
  }
}

function setHomeMode(mode: 'full' | 'compact'): void {
  activeHomeMode.value = mode
  homeMode.value = mode
  if (mode === 'compact') showIntro.value = false
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
      tone: 'bg-amber-50 text-amber-700'
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
      tone: 'bg-amber-50 text-amber-700'
    })),
  ...customHomeEntries.value
    .filter(entry => entry.placement === 'services' || entry.placement === 'more')
    .map(entry => ({
      ...entry,
      featureKey: undefined,
      tone: 'bg-amber-50 text-amber-700'
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
    <section class="border-b border-zinc-200 bg-white">
      <div class="page-shell flex items-center justify-between gap-3 py-2.5">
        <p class="hidden text-xs text-zinc-500 sm:block">
          选择适合你的浏览方式
        </p>
        <div
          class="ml-auto grid grid-cols-2 rounded-md bg-zinc-100 p-1"
          aria-label="首页显示模式"
        >
          <button
            type="button"
            class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded px-3 text-xs font-semibold transition sm:min-w-28 sm:text-sm"
            :class="activeHomeMode === 'full' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'"
            :aria-pressed="activeHomeMode === 'full'"
            @click="setHomeMode('full')"
          >
            <UIcon
              name="i-lucide-layout-template"
              class="size-4"
            />
            完整模式
          </button>
          <button
            type="button"
            class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded px-3 text-xs font-semibold transition sm:min-w-28 sm:text-sm"
            :class="activeHomeMode === 'compact' ? 'bg-white text-green-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'"
            :aria-pressed="activeHomeMode === 'compact'"
            @click="setHomeMode('compact')"
          >
            <UIcon
              name="i-lucide-smartphone"
              class="size-4"
            />
            简洁模式
          </button>
        </div>
      </div>
    </section>

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
      <section class="border-b border-[var(--line)] bg-white/70 backdrop-blur-md relative overflow-hidden">
        <div class="border-b border-orange-200/80 bg-orange-50/80 text-orange-800">
          <button
            type="button"
            class="page-shell grid min-h-12 w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 py-2 text-left text-[11px] md:min-h-12 md:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] md:gap-4 md:text-sm"
            aria-label="查看2026级新生重要时间"
            @click="openImportantTime"
          >
            <UIcon
              name="i-lucide-volume-2"
              class="size-4 shrink-0 text-orange-600 md:size-5"
            />
            <span class="shrink-0 font-semibold">2026级新生重要时间</span>
            <span class="hidden h-5 w-px bg-orange-300 md:block" />
            <span class="important-time-window min-w-0 overflow-hidden whitespace-nowrap">
              <span class="important-time-track inline-flex min-w-max items-center gap-10 pr-10">
                <span>9月5–6日报到 · 9月7–9日入学教育 · 9月10日上课</span>
                <span aria-hidden="true">9月5–6日报到 · 9月7–9日入学教育 · 9月10日上课</span>
              </span>
            </span>
            <span class="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-orange-900 hover:bg-orange-100 md:min-h-9 md:px-2 md:text-xs">
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
          title="2026级新生重要时间"
          description="以下日期来自学校2026—2027学年第一学期校历。"
          :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-xl' }"
        >
          <template #body>
            <ol class="divide-y divide-zinc-100">
              <li
                v-for="item in importantDates"
                :key="item.title"
                class="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-4 first:pt-0"
              >
                <span class="text-sm font-bold text-green-700">{{ item.date }}</span>
                <div>
                  <h3 class="text-sm font-bold text-zinc-950">
                    {{ item.title }}
                  </h3>
                  <p class="mt-1 text-xs leading-6 text-zinc-600">
                    {{ item.description }}
                  </p>
                </div>
              </li>
            </ol>
            <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
              <p class="text-xs leading-5 text-zinc-500">
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
          <h1 class="text-left text-2xl font-bold tracking-tight text-zinc-950 md:text-center md:text-4xl">
            2026级新生入学指南
          </h1>
          <p class="mx-auto mt-2 max-w-2xl text-left text-xs leading-5 text-zinc-600 md:mt-3 md:text-center md:text-sm md:leading-6">
            集中查询报到、住宿、交通、校园地图、办事流程和校园生活信息。
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
          <h2 class="text-lg font-bold text-zinc-950 md:text-xl">
            常用查询
          </h2>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2.5 md:mt-4 md:gap-3 lg:grid-cols-4">
          <NuxtLink
            v-for="action in essentialActions"
            :key="action.to"
            :to="action.to"
            class="group grid min-h-[4.75rem] place-items-center rounded-lg border border-zinc-200 bg-white p-2.5 text-left transition hover:border-green-300 hover:shadow-sm md:min-h-32 md:p-4 md:text-center"
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
                <h3 class="text-[13px] font-bold leading-4.5 text-zinc-950 md:text-base md:leading-5">
                  {{ action.title }}
                </h3>
                <span class="mt-0.5 line-clamp-2 block text-[10px] leading-3.5 text-zinc-500 md:hidden">
                  {{ action.description }}
                </span>
              </span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section
        v-if="timelineStages.length"
        class="border-y border-[var(--line)] bg-white"
      >
        <div class="page-shell py-6 md:py-9">
          <h2 class="text-lg font-bold text-zinc-950 md:text-xl">
            按入学阶段查看
          </h2>
          <div class="mt-3 grid gap-5 md:mt-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)] lg:items-stretch lg:gap-4">
            <div class="overflow-hidden rounded-lg border border-zinc-200 bg-white md:p-5">
              <div class="grid grid-cols-3 border-b border-zinc-200">
                <button
                  v-for="(stage, index) in timelineStages"
                  :key="stage.label"
                  type="button"
                  class="min-h-10 border-b-2 px-2 text-xs font-medium transition md:min-h-11 md:text-sm"
                  :class="index === activeTimelineIndex ? 'border-green-700 bg-green-700 font-bold text-white md:bg-transparent md:text-green-700' : 'border-transparent text-zinc-600 hover:text-green-700'"
                  @click="activeTimelineIndex = index"
                >
                  {{ stage.label }}
                </button>
              </div>

              <div
                v-if="activeTimelineStage"
                class="px-3 pb-3 pt-1 md:px-0 md:pb-0 md:pt-2"
              >
                <ul class="divide-y divide-zinc-100">
                  <li
                    v-for="item in activeTimelineStage.items"
                    :key="item"
                    class="flex items-center gap-2.5 py-2.5 text-sm leading-5 text-zinc-700 md:gap-3 md:py-3 md:leading-6"
                  >
                    <UIcon
                      name="i-lucide-circle-check"
                      class="size-4.5 shrink-0 text-green-700 md:size-5"
                    />
                    <span>{{ item }}</span>
                  </li>
                </ul>
                <NuxtLink
                  :to="activeTimelineStage.to"
                  class="mt-1 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-green-700 md:mt-3 md:min-h-11"
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
              v-if="featureEnabled('home.checklist')"
              to="/checklist"
              class="group bg-white transition lg:rounded-lg lg:border lg:border-zinc-200 lg:p-5 lg:hover:border-green-300 lg:hover:shadow-sm"
            >
              <div class="flex items-center gap-3">
                <span class="hidden size-10 place-items-center rounded-lg bg-green-50 text-green-700 lg:grid">
                  <UIcon
                    name="i-lucide-list-checks"
                    class="size-5"
                  />
                </span>
                <h2 class="text-lg font-bold text-zinc-950 lg:text-base">
                  新生准备清单
                </h2>
              </div>
              <p class="mt-3 text-sm text-zinc-700 lg:mt-5">
                已完成 <strong class="text-lg text-green-700">{{ checklistSummary.percent }}%</strong>
              </p>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 lg:mt-3">
                <div
                  class="h-full rounded-full bg-green-700 transition-[width]"
                  :style="{ width: `${checklistSummary.percent}%` }"
                />
              </div>
              <div class="mt-3 flex items-center justify-between gap-3 lg:mt-4">
                <p class="min-w-0 text-sm leading-6 text-zinc-600">
                  <template v-if="checklistHydrated && checklistSummary.remainingCount > 0">
                    下一项：{{ checklistSummary.nextTitle || '继续完成准备事项' }}
                  </template>
                  <template v-else-if="checklistHydrated">当前清单已全部勾完，可随时复查。</template>
                  <template v-else>打开后可以继续勾选。</template>
                </p>
                <span class="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-green-700 px-4 text-sm font-semibold text-green-700 transition group-hover:bg-green-50 lg:min-h-11 lg:px-5">
                  打开清单
                </span>
              </div>
            </NuxtLink>
          </div>
        </div>
      </section>

      <section
        class="border-y border-[var(--line)] bg-white"
      >
        <div class="page-shell py-6 md:py-9">
          <h2 class="text-lg font-bold text-zinc-950 md:text-xl">
            服务导航
          </h2>
          <div class="mt-3 grid overflow-hidden rounded-lg border border-zinc-200 bg-white md:mt-4 md:grid-cols-5">
            <NuxtLink
              v-for="entry in serviceNavEntries"
              :key="entry.to"
              :to="entry.to"
              class="group flex min-h-16 items-center gap-3 border-b border-zinc-200 px-3 py-2.5 transition hover:bg-green-50 md:min-h-28 md:flex-col md:justify-center md:border-b-0 md:border-r md:p-4 md:text-center md:last:border-r-0"
            >
              <UIcon
                :name="entry.icon"
                class="size-5.5 shrink-0 text-green-700 md:size-7"
              />
              <span class="min-w-0">
                <span class="block text-sm font-bold text-zinc-950">{{ entry.title }}</span>
                <span class="mt-0.5 block text-[11px] leading-4 text-zinc-500 md:hidden">{{ entry.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="ml-auto size-4 shrink-0 text-zinc-400 md:hidden"
              />
            </NuxtLink>
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
