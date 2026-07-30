<script setup lang="ts">
import { freshmanGuides } from '~~/data/seeds/public-content'
import type { FrontendFeatureKey } from '~~/shared/config/frontend-features'
import {
  canUseStaticContentKindFallback,
  mergePublicGuides
} from '~/utils/public-catalog'
import {
  buildHomeEssentialActions,
  buildHomeFeaturedProcedures,
  buildHomeSearchTarget,
  computeHomeCardTilt,
  getHomeFallbackMessage,
  homeMoreEntries,
  homeTrustNotice,
  homeTimelineStages
} from '~~/app/utils/home-presentation'
import { buildHomeArrivalSummary } from '~~/app/utils/arrival-timeline-presentation'

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

async function replayIntro() {
  showIntro.value = false
  await nextTick()
  forceIntro.value = true
  showIntro.value = true
}

// 3D 卡片阻尼倾斜与流光定位
function onCardMouseMove(e: MouseEvent) {
  const card = e.currentTarget as HTMLElement
  if (!card) return
  const rect = card.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const { rotateX, rotateY } = computeHomeCardTilt(x, y, rect.width, rect.height)

  card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`
  card.style.setProperty('--mouse-x', `${x}px`)
  card.style.setProperty('--mouse-y', `${y}px`)
}

function onCardMouseLeave(e: MouseEvent) {
  const card = e.currentTarget as HTMLElement
  if (!card) return
  card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)'
}

const placeQuery = ref('')
const featureRequest = usePublicFrontendFeatures()
const contentRequest = usePublicContentList()
const procedureRequest = usePublicProcedureList()
await Promise.all([featureRequest, contentRequest, procedureRequest])

const { data: publicFeatureResponse } = featureRequest
const { data: publicContentResponse, error: publicContentError } = contentRequest
const { data: publicProcedureResponse, error: publicProcedureError } = procedureRequest
const allowStaticGuideFallback = computed(() => !publicContentError.value
  && canUseStaticContentKindFallback(publicContentResponse.value, 'guide'))
const guides = computed(() => mergePublicGuides(
  freshmanGuides,
  publicContentResponse.value?.items ?? [],
  allowStaticGuideFallback.value
))

const disabledFeatureKeys = computed(() => new Set(publicFeatureResponse.value?.disabledKeys ?? []))
const featureEnabled = (key: FrontendFeatureKey) => !disabledFeatureKeys.value.has(key)
const essentialActions = computed(() => buildHomeEssentialActions(guides.value)
  .filter(action => featureEnabled(action.featureKey)))
const timelineStages = computed(() => homeTimelineStages
  .filter(stage => featureEnabled(stage.featureKey)))
const activeTimelineIndex = ref(0)
const activeTimelineStage = computed(() => timelineStages.value[activeTimelineIndex.value] ?? timelineStages.value[0])
const moreEntries = computed(() => homeMoreEntries
  .filter(entry => featureEnabled(entry.featureKey)))
const serviceNavEntries = [
  { title: '入学与报到', to: '/guides', icon: 'i-lucide-file-text', description: '报到、材料、缴费与入学准备' },
  { title: '住宿与校园生活', to: '/dorms', icon: 'i-lucide-house', description: '宿舍、快递、外卖与校园生活' },
  { title: '学业与规章制度', to: '/guides/study-library', icon: 'i-lucide-book-open', description: '课程、图书馆、学生手册与规章制度' },
  { title: '地图与办事', to: '/map', icon: 'i-lucide-map-pinned', description: '校园地图、地点和办事流程' },
  { title: '组织与公共服务', to: '/discover', icon: 'i-lucide-users-round', description: '部门、社团、群聊与公共服务' }
]
const trustNotice = homeTrustNotice
const fallbackMessage = computed(() => getHomeFallbackMessage(
  Boolean(publicContentError.value),
  Boolean(publicProcedureError.value)
))
const featuredProcedures = computed(() => buildHomeFeaturedProcedures(
  publicProcedureResponse.value?.items
))

function searchSite() {
  void navigateTo(buildHomeSearchTarget(placeQuery.value))
}

const {
  homeSummary: checklistSummary,
  hydrated: checklistHydrated
} = useFreshmanChecklist()

const arrivalSummary = computed(() => buildHomeArrivalSummary())
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
          <div class="page-shell flex min-h-16 items-center gap-3 py-3 text-sm md:min-h-12 md:gap-4 md:py-2 md:text-sm">
            <UIcon
              name="i-lucide-volume-2"
              class="size-5 shrink-0 text-orange-600"
            />
            <span class="shrink-0 font-semibold">2026级新生重要时间</span>
            <span class="hidden h-5 w-px bg-orange-300 md:block" />
            <span class="truncate">9月5—6日报到 · 9月7—9日入学教育 · 9月10日上课</span>
            <NuxtLink
              v-if="featureEnabled('home.arrival-summary')"
              :to="arrivalSummary.to"
              class="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-orange-900 hover:bg-orange-100"
            >
              查看安排
              <UIcon
                name="i-lucide-arrow-right"
                class="size-3.5"
              />
            </NuxtLink>
          </div>
        </div>

        <div class="page-shell py-9 text-center md:py-12">
          <div class="flex flex-wrap items-center justify-center gap-2 text-xs">
            <UBadge
              color="success"
              variant="soft"
            >
              2026 新生入学
            </UBadge>
            <span class="text-zinc-500">本科 · 专升本</span>
          </div>
          <h1 class="mt-4 text-3xl font-bold tracking-tight text-zinc-950 md:text-4xl">
            2026级新生入学指南
          </h1>
          <p class="mx-auto mt-3 max-w-2xl text-xs leading-6 text-zinc-600 md:text-sm">
            集中查询报到、住宿、交通、校园地图、办事流程和校园生活信息。
          </p>

          <form
            class="mx-auto mt-6 flex max-w-4xl gap-0 text-left md:mt-8"
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
              icon="i-lucide-search"
              label="搜索"
              size="xl"
              class="min-h-11 rounded-l-none px-5 md:px-8"
            />
          </form>
        </div>
      </section>

      <section
        v-if="essentialActions.length"
        class="page-shell py-7 md:py-10"
      >
        <div>
          <p class="section-kicker">
            常用查询
          </p>
          <h2 class="mt-1 text-lg font-bold text-zinc-950">
            新生最常查的四类信息
          </h2>
        </div>

        <div class="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <NuxtLink
            v-for="action in essentialActions"
            :key="action.to"
            :to="action.to"
            class="group flex min-h-36 flex-col items-center justify-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 text-center transition hover:border-green-300 hover:shadow-sm md:min-h-40"
            @mousemove="onCardMouseMove"
            @mouseleave="onCardMouseLeave"
          >
            <div class="flex items-center justify-center gap-3">
              <span
                class="grid size-12 place-items-center rounded-lg md:size-14"
                :class="action.tone"
              >
                <UIcon
                  :name="action.icon"
                  class="size-7 md:size-8"
                />
              </span>
            </div>
            <h3 class="text-sm font-bold text-zinc-950 md:text-base">
              {{ action.title }}
            </h3>
            <p class="mt-1 text-xs leading-5 text-zinc-500">
              {{ action.description }}
            </p>
          </NuxtLink>
        </div>

        <div
          v-if="fallbackMessage"
          class="mt-4 flex items-start gap-2 border-l-2 border-blue-500 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900"
          role="status"
        >
          <UIcon
            name="i-lucide-info"
            class="mt-0.5 size-3.5 shrink-0"
          />
          <span>{{ fallbackMessage }}</span>
        </div>
      </section>

      <section
        v-if="timelineStages.length"
        class="border-y border-[var(--line)] bg-white"
      >
        <div class="page-shell py-8 md:py-10">
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)] lg:items-stretch">
            <div class="rounded-lg border border-zinc-200 bg-white p-4 md:p-5">
              <p class="section-kicker">
                按入学阶段查看
              </p>
              <div class="mt-3 grid grid-cols-3 border-b border-zinc-200">
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
                class="pt-4"
              >
                <h2 class="text-base font-bold text-zinc-950">
                  {{ activeTimelineStage.title }}
                </h2>
                <ul class="mt-3 divide-y divide-zinc-100">
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
              class="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-green-300 hover:shadow-sm"
            >
              <div class="flex items-center gap-3">
                <span class="grid size-10 place-items-center rounded-lg bg-green-50 text-green-700">
                  <UIcon
                    name="i-lucide-list-checks"
                    class="size-5"
                  />
                </span>
                <div>
                  <p class="text-xs font-semibold text-green-700">新生准备清单</p>
                  <h2 class="mt-1 text-base font-bold text-zinc-950">到校前到第一周</h2>
                </div>
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
              <p class="mt-4 text-sm leading-6 text-zinc-600">
                <template v-if="checklistHydrated && checklistSummary.remainingCount > 0">
                  下一项：{{ checklistSummary.nextTitle || '继续完成准备事项' }}
                </template>
                <template v-else-if="checklistHydrated">当前清单已全部勾完，可随时复查。</template>
                <template v-else>进度只保存在这台设备，打开后可以继续勾选。</template>
              </p>
              <span class="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-green-700 text-sm font-semibold text-green-700 transition group-hover:bg-green-50">
                打开清单
              </span>
            </NuxtLink>
          </div>
        </div>
      </section>

      <section
        v-if="moreEntries.length"
        class="border-y border-[var(--line)] bg-white"
      >
        <div class="page-shell py-8 md:py-10">
          <p class="section-kicker">
            服务导航
          </p>
          <h2 class="mt-1 text-lg font-bold text-zinc-950">
            按需要选择入口
          </h2>
          <div class="mt-5 grid overflow-hidden rounded-lg border border-zinc-200 bg-white md:grid-cols-5">
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

          <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NuxtLink
              v-for="entry in moreEntries"
              :key="entry.to"
              :to="entry.to"
              :external="entry.external"
              :target="entry.external ? '_blank' : undefined"
              rel="noopener noreferrer"
              class="flex min-h-24 items-start gap-3 rounded-lg border border-zinc-200 p-4 transition hover:border-green-300"
            >
              <span
                class="grid size-9 shrink-0 place-items-center rounded-lg"
                :class="entry.tone"
              >
                <UIcon
                  :name="entry.icon"
                  class="size-4"
                />
              </span>
              <span>
                <span class="flex items-center gap-1.5 text-sm font-bold text-zinc-950">
                  {{ entry.title }}
                  <UIcon
                    v-if="entry.external"
                    name="i-lucide-external-link"
                    class="size-3.5 text-zinc-400"
                  />
                </span>
                <span class="mt-1 block text-xs leading-5 text-zinc-500">{{ entry.description }}</span>
              </span>
            </NuxtLink>
          </div>
        </div>
      </section>

      <section
        v-if="featureEnabled('home.featured-procedures') && featuredProcedures.length"
        class="page-shell py-8 md:py-10"
      >
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="section-kicker">
              常用办事
            </p>
            <h2 class="mt-1 text-lg font-bold text-zinc-950">
              可以照着步骤完成
            </h2>
          </div>
          <NuxtLink
            to="/procedures"
            class="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-green-700 hover:bg-green-50"
          >
            全部流程
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4"
            />
          </NuxtLink>
        </div>
        <div class="mt-5 grid gap-3 md:grid-cols-2">
          <NuxtLink
            v-for="procedure in featuredProcedures"
            :key="procedure.id"
            :to="procedure.to"
            class="group flex items-start gap-4 rounded-lg border border-zinc-200 bg-white p-4 transition hover:border-green-300 hover:shadow-sm"
          >
            <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-green-50 text-green-700">
              <UIcon
                name="i-lucide-list-checks"
                class="size-5"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-bold text-zinc-950">{{ procedure.title }}</span>
                <span class="text-xs text-zinc-400">{{ procedure.methodLabel }}</span>
              </span>
              <span class="mt-1 line-clamp-2 block text-sm leading-6 text-zinc-600">{{ procedure.summary }}</span>
              <span class="mt-2 block text-xs font-medium text-orange-700">{{ procedure.statusText }}</span>
            </span>
            <UIcon
              name="i-lucide-chevron-right"
              class="mt-1 size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-green-700"
            />
          </NuxtLink>
        </div>
      </section>

      <section
        v-if="featureEnabled('home.trust-notice')"
        class="page-shell py-6 md:py-8"
      >
        <aside class="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-emerald-50 p-4 shadow-sm md:p-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0 max-w-3xl">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :label="trustNotice.badge"
                  color="warning"
                  variant="soft"
                />
                <span class="text-xs text-zinc-500">{{ trustNotice.checkedText }}</span>
              </div>
              <h2 class="mt-3 text-base font-bold text-zinc-950">
                {{ trustNotice.title }}
              </h2>
              <p class="mt-1.5 text-sm leading-6 text-zinc-600">
                {{ trustNotice.description }}
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2 lg:max-w-sm lg:justify-end">
              <UButton
                v-for="link in trustNotice.links"
                :key="link.to"
                :to="link.to"
                :external="link.external"
                :target="link.external ? '_blank' : undefined"
                rel="noopener noreferrer"
                :icon="link.icon"
                :label="link.label"
                color="neutral"
                :variant="link.external ? 'outline' : 'ghost'"
                size="sm"
                class="min-h-11"
              />
            </div>
          </div>
        </aside>
      </section>

      <section
        v-if="featureEnabled('home.emergency-contact')"
        class="page-shell py-6 md:py-8"
      >
        <div class="flex flex-col gap-4 rounded-lg bg-zinc-900 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-start gap-3">
            <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10">
              <UIcon
                name="i-lucide-phone-call"
                class="size-5"
              />
            </span>
            <div>
              <p class="font-bold">
                紧急情况先求助
              </p>
              <p class="mt-1 text-xs leading-5 text-zinc-300">
                校园 110：0595-22076110。危及生命或需要公安、消防、急救时，同时按情况拨打下面的电话。
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <a
                  href="tel:110"
                  class="inline-flex min-h-10 items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white"
                >拨打 110</a>
                <a
                  href="tel:119"
                  class="inline-flex min-h-10 items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white"
                >拨打 119</a>
                <a
                  href="tel:120"
                  class="inline-flex min-h-10 items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white"
                >拨打 120</a>
              </div>
            </div>
          </div>
          <a
            href="tel:059522076110"
            class="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-zinc-900"
          >
            <UIcon
              name="i-lucide-phone"
              class="size-4"
            />
            拨打校园 110
          </a>
        </div>
      </section>

      <!-- 重新播放动画入口 -->
      <div class="flex justify-center pb-8">
        <button
          class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 text-xs text-zinc-500 transition hover:border-green-300 hover:text-green-700 cursor-pointer"
          @click="replayIntro"
        >
          <UIcon
            name="i-lucide-sparkles"
            class="size-3.5 text-green-700 animate-pulse"
          />
          <span>再看一次开场动画</span>
        </button>
      </div>
    </div>
  </div>
</template>
