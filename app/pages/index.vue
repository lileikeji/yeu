<script setup lang="ts">
import type { FrontendFeatureKey } from '~~/shared/config/frontend-features'
import {
  buildHomeEssentialActions,
  buildHomeSearchTarget,
  homeTimelineStages
} from '~~/app/utils/home-presentation'

useSeoMeta({
  title: '首页',
  description: '仰恩大学本科与专升本新生的报到、校园地图、宿舍、校园网和校园生活入口。'
})

const showIntro = ref(false)
const route = useRoute()
const forceIntro = ref(route.query.intro === '1')
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
const importantDates = [
  { date: '9月5–6日', title: '注册报到', description: '具体到校时段、报到地点和材料以录取通知书及学校后续通知为准。' },
  { date: '9月7–9日', title: '入学教育', description: '学院集合地点、时间和安排以辅导员或学院通知为准。' },
  { date: '9月10日', title: '开始上课', description: '课表、教材和教学安排以教务系统及学院通知为准。' }
]
const featureRequest = usePublicFrontendFeatures()
await featureRequest

const { data: publicFeatureResponse } = featureRequest

const disabledFeatureKeys = computed(() => new Set(publicFeatureResponse.value?.disabledKeys ?? []))
const featureEnabled = (key: FrontendFeatureKey) => !disabledFeatureKeys.value.has(key)
const essentialActions = computed(() => buildHomeEssentialActions([])
  .filter(action => featureEnabled(action.featureKey)))
const timelineStages = computed(() => homeTimelineStages
  .filter(stage => featureEnabled(stage.featureKey)))
const activeTimelineIndex = ref(0)
const activeTimelineStage = computed(() => timelineStages.value[activeTimelineIndex.value] ?? timelineStages.value[0])
const serviceNavEntries = [
  { title: '到校与离校交通', to: '/transport', icon: 'i-lucide-bus-front', description: '公交、车站、机场与返程路线' },
  { title: '校园周边生活', to: '/nearby', icon: 'i-lucide-compass', description: '学生街、快递点和吃喝玩乐' },
  { title: '学生手册与资助', to: '/student-rules', icon: 'i-lucide-book-open-check', description: '校内规定、奖助学金与学习要求' },
  { title: '社团与学生组织', to: '/clubs', icon: 'i-lucide-users-round', description: '社团介绍、招新信息和报名入口' },
  { title: '校内部门服务', to: '/departments', icon: 'i-lucide-landmark', description: '招生、教务、学生事务等部门' }
]

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
    <ClientOnly>
      <IntroOverlay
        v-if="showIntro"
        :force="forceIntro"
        @complete="onIntroComplete"
      />
    </ClientOnly>

    <div class="animate-spring-up">
      <section class="border-b border-[var(--line)] bg-white/70 backdrop-blur-md relative overflow-hidden">
        <div class="border-b border-orange-200/80 bg-orange-50/80 text-orange-800">
          <button
            type="button"
            class="page-shell grid min-h-16 w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left text-xs md:min-h-12 md:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] md:gap-4 md:py-2 md:text-sm"
            aria-label="查看2026级新生重要时间"
            @click="openImportantTime"
          >
            <UIcon
              name="i-lucide-volume-2"
              class="size-5 shrink-0 text-orange-600"
            />
            <span class="shrink-0 font-semibold">2026级新生重要时间</span>
            <span class="hidden h-5 w-px bg-orange-300 md:block" />
            <span class="important-time-window min-w-0 overflow-hidden whitespace-nowrap">
              <span class="important-time-track inline-flex min-w-max items-center gap-10 pr-10">
                <span>9月5–6日报到 · 9月7–9日入学教育 · 9月10日上课</span>
                <span aria-hidden="true">9月5–6日报到 · 9月7–9日入学教育 · 9月10日上课</span>
              </span>
            </span>
            <span class="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-orange-900 hover:bg-orange-100">
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

        <div class="page-shell py-9 text-left md:py-10 md:text-center">
          <h1 class="text-left text-3xl font-bold tracking-tight text-zinc-950 md:text-center md:text-4xl">
            2026级新生入学指南
          </h1>
          <p class="mx-auto mt-3 max-w-2xl text-left text-xs leading-6 text-zinc-600 md:text-center md:text-sm">
            集中查询报到、住宿、交通、校园地图、办事流程和校园生活信息。
          </p>

          <form
            class="mx-auto mt-6 flex max-w-3xl gap-0 text-left md:mt-7"
            role="search"
            @submit.prevent="searchSite"
          >
            <UInput
              v-model="placeQuery"
              icon="i-lucide-search"
              size="xl"
              class="min-w-0 flex-1"
              placeholder="搜索校园信息，或输入你的问题"
              aria-label="搜索校园信息或提出问题"
            />
            <UButton
              type="submit"
              icon="i-lucide-sparkles"
              label="AI 搜索"
              size="xl"
              class="min-h-11 rounded-l-none px-5 md:px-8"
            />
          </form>
        </div>
      </section>

      <section
        v-if="essentialActions.length"
        class="page-shell py-7 md:py-8"
      >
        <div>
          <h2 class="text-xl font-bold text-zinc-950">
            常用查询
          </h2>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <NuxtLink
            v-for="action in essentialActions"
            :key="action.to"
            :to="action.to"
            class="group grid min-h-32 place-items-center rounded-lg border border-zinc-200 bg-white p-4 text-center transition hover:border-green-300 hover:shadow-sm md:min-h-32"
          >
            <div class="flex w-full min-w-0 flex-col items-center justify-center gap-3 text-center">
              <span
                class="grid size-11 shrink-0 place-items-center rounded-lg md:size-12"
                :class="action.tone"
              >
                <UIcon
                  :name="action.icon"
                  class="size-6 md:size-7"
                />
              </span>
              <span class="min-w-0">
                <h3 class="text-sm font-bold leading-5 text-zinc-950 md:text-base">
                  {{ action.title }}
                </h3>
                <span class="mt-1 block text-xs leading-5 text-zinc-500 md:hidden">
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
        <div class="page-shell py-8 md:py-9">
          <h2 class="text-xl font-bold text-zinc-950">
            按入学阶段查看
          </h2>
          <div class="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)] lg:items-stretch lg:gap-4">
            <div class="rounded-lg border border-zinc-200 bg-white p-4 md:p-5">
              <div class="grid grid-cols-3 border-b border-zinc-200">
                <button
                  v-for="(stage, index) in timelineStages"
                  :key="stage.label"
                  type="button"
                  class="min-h-11 border-b-2 px-2 text-xs font-medium transition md:text-sm"
                  :class="index === activeTimelineIndex ? 'border-green-700 bg-green-700 font-bold text-white md:bg-transparent md:text-green-700' : 'border-transparent text-zinc-600 hover:text-green-700'"
                  @click="activeTimelineIndex = index"
                >
                  {{ stage.label }}
                </button>
              </div>

              <div
                v-if="activeTimelineStage"
                class="pt-2"
              >
                <ul class="divide-y divide-zinc-100">
                  <li
                    v-for="item in activeTimelineStage.items"
                    :key="item"
                    class="flex items-center gap-3 py-3 text-sm leading-6 text-zinc-700"
                  >
                    <UIcon
                      name="i-lucide-circle-check"
                      class="size-5 shrink-0 text-green-700"
                    />
                    <span>{{ item }}</span>
                  </li>
                </ul>
                <NuxtLink
                  :to="activeTimelineStage.to"
                  class="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-green-700"
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
                <h2 class="text-xl font-bold text-zinc-950 lg:text-base">
                  新生准备清单
                </h2>
              </div>
              <p class="mt-5 text-sm text-zinc-700">
                已完成 <strong class="text-lg text-green-700">{{ checklistSummary.percent }}%</strong>
              </p>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200">
                <div
                  class="h-full rounded-full bg-green-700 transition-[width]"
                  :style="{ width: `${checklistSummary.percent}%` }"
                />
              </div>
              <div class="mt-4 flex items-center justify-between gap-3">
                <p class="min-w-0 text-sm leading-6 text-zinc-600">
                  <template v-if="checklistHydrated && checklistSummary.remainingCount > 0">
                    下一项：{{ checklistSummary.nextTitle || '继续完成准备事项' }}
                  </template>
                  <template v-else-if="checklistHydrated">当前清单已全部勾完，可随时复查。</template>
                  <template v-else>打开后可以继续勾选。</template>
                </p>
                <span class="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-green-700 px-5 text-sm font-semibold text-green-700 transition group-hover:bg-green-50">
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
        <div class="page-shell py-8 md:py-9">
          <h2 class="text-xl font-bold text-zinc-950">
            服务导航
          </h2>
          <div class="mt-4 grid overflow-hidden rounded-lg border border-zinc-200 bg-white md:grid-cols-5">
            <NuxtLink
              v-for="entry in serviceNavEntries"
              :key="entry.to"
              :to="entry.to"
              class="group flex min-h-24 items-center gap-3 border-b border-zinc-200 p-4 transition hover:bg-green-50 md:min-h-28 md:flex-col md:justify-center md:border-b-0 md:border-r md:text-center md:last:border-r-0"
            >
              <UIcon
                :name="entry.icon"
                class="size-7 shrink-0 text-green-700"
              />
              <span class="min-w-0">
                <span class="block text-sm font-bold text-zinc-950">{{ entry.title }}</span>
                <span class="mt-1 block text-xs leading-5 text-zinc-500 md:hidden">{{ entry.description }}</span>
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
