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
  buildHomeMapSearchTarget,
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
const introPlayedThisVisit = useState('yeu-guide-intro-played-this-visit', () => false)

onMounted(() => {
  if (forceIntro.value || !introPlayedThisVisit.value) {
    showIntro.value = true
    introPlayedThisVisit.value = true
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
const moreEntries = computed(() => homeMoreEntries
  .filter(entry => featureEnabled(entry.featureKey)))
const trustNotice = homeTrustNotice
const fallbackMessage = computed(() => getHomeFallbackMessage(
  Boolean(publicContentError.value),
  Boolean(publicProcedureError.value)
))
const featuredProcedures = computed(() => buildHomeFeaturedProcedures(
  publicProcedureResponse.value?.items
))

function searchMap() {
  void navigateTo(buildHomeMapSearchTarget(placeQuery.value))
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
      <section class="border-b border-[var(--line)] bg-white/60 backdrop-blur-md relative overflow-hidden">
        <div class="page-shell grid gap-5 py-5 md:gap-7 md:py-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
          <div class="max-w-3xl">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <UBadge
                color="success"
                variant="soft"
              >
                2026 新生入学
              </UBadge>
              <span class="text-zinc-500">本科 · 专升本</span>
            </div>
            <h1 class="mt-4 text-3xl font-bold tracking-tight text-zinc-950 md:text-4xl">
              第一次来仰恩，<span class="block sm:inline">从这里开始</span>
            </h1>
            <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600 md:text-base">
              不用先看完所有资料。先确认报到安排、找到宿舍和教学楼，再处理校园卡、网络与日常生活。
            </p>

            <form
              class="mt-4 flex max-w-2xl gap-2 md:mt-6"
              role="search"
              @submit.prevent="searchMap"
            >
              <UInput
                v-model="placeQuery"
                icon="i-lucide-search"
                size="xl"
                class="min-w-0 flex-1"
                placeholder="搜宿舍、教学楼或快递"
                aria-label="搜索校园地点"
              />
              <UButton
                type="submit"
                icon="i-lucide-map-pinned"
                label="找地点"
                size="xl"
                class="min-h-11 shrink-0"
              />
            </form>
          </div>

          <NuxtLink
            v-if="featureEnabled('home.arrival-summary')"
            :to="arrivalSummary.to"
            class="group p-4 premium-card glow-effect bg-orange-50/60 border-orange-200 md:p-5"
            @mousemove="onCardMouseMove"
            @mouseleave="onCardMouseLeave"
          >
            <p class="text-xs font-semibold text-orange-800">
              {{ arrivalSummary.kicker }}
            </p>
            <p class="mt-2 text-2xl font-bold text-orange-950 md:text-3xl">
              {{ arrivalSummary.title }}
            </p>
            <div class="mt-3 space-y-2 border-t border-orange-200 pt-3 text-xs leading-5 text-orange-900 md:mt-4 md:pt-4">
              <p>{{ arrivalSummary.meta }}</p>
              <p>9月7–9日入学教育 · 9月10日上课</p>
            </div>
            <span class="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-orange-950 md:mt-4">
              打开入学清单 / 流程
              <UIcon
                name="i-lucide-arrow-right"
                class="size-4 transition group-hover:translate-x-0.5"
              />
            </span>
          </NuxtLink>
        </div>

        <div
          v-if="featureEnabled('home.trust-notice')"
          class="page-shell pb-5 md:pb-7"
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
                  :rel="link.external ? 'noopener noreferrer' : undefined"
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
        </div>
      </section>

      <section
        v-if="essentialActions.length"
        class="page-shell py-7 md:py-10"
      >
        <div>
          <p class="section-kicker">
            先做这四件事
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            新生最常用的入口
          </h2>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <NuxtLink
            v-for="action in essentialActions"
            :key="action.to"
            :to="action.to"
            class="group flex min-h-44 flex-col p-4 premium-card glow-effect"
            @mousemove="onCardMouseMove"
            @mouseleave="onCardMouseLeave"
          >
            <div class="flex items-center justify-between gap-3">
              <span
                class="grid size-10 place-items-center rounded-lg"
                :class="action.tone"
              >
                <UIcon
                  :name="action.icon"
                  class="size-5"
                />
              </span>
              <span class="text-xs font-medium text-zinc-400">{{ action.meta }}</span>
            </div>
            <h3 class="mt-4 font-bold text-zinc-950">
              {{ action.title }}
            </h3>
            <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600">
              {{ action.description }}
            </p>
            <span class="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-green-700">
              立即查看
              <UIcon
                name="i-lucide-arrow-right"
                class="size-4 transition group-hover:translate-x-0.5"
              />
            </span>
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
        v-if="featureEnabled('home.checklist')"
        class="page-shell pb-2 md:pb-4"
      >
        <NuxtLink
          to="/checklist"
          class="group flex flex-col gap-4 rounded-lg border border-green-200 bg-gradient-to-r from-green-50 via-white to-emerald-50 p-4 transition hover:border-green-300 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div class="flex min-w-0 items-start gap-3">
            <span class="grid size-11 shrink-0 place-items-center rounded-lg bg-green-100 text-green-700">
              <UIcon
                name="i-lucide-list-checks"
                class="size-5"
              />
            </span>
            <div class="min-w-0">
              <p class="text-xs font-semibold text-green-800">
                新生清单
              </p>
              <h2 class="mt-1 text-base font-bold text-zinc-950">
                到校前到第一周，逐项勾选
              </h2>
              <p class="mt-1 text-sm leading-6 text-zinc-600">
                <template v-if="checklistHydrated && checklistSummary.remainingCount > 0">
                  已完成 {{ checklistSummary.percent }}%，还剩 {{ checklistSummary.remainingCount }} 项
                  <span v-if="checklistSummary.nextTitle">
                    · 下一项：{{ checklistSummary.nextTitle }}
                  </span>
                </template>
                <template v-else-if="checklistHydrated">
                  当前清单已全部勾完，可随时复查行李与日常事项。
                </template>
                <template v-else>
                  进度只保存在这台设备，打开后可以继续勾选。
                </template>
              </p>
            </div>
          </div>
          <span class="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-green-700">
            打开清单
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 transition group-hover:translate-x-0.5"
            />
          </span>
        </NuxtLink>
      </section>

      <section
        v-if="timelineStages.length"
        class="border-y border-[var(--line)] bg-white"
      >
        <div class="page-shell py-8 md:py-10">
          <p class="section-kicker">
            按时间做
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            不知道先看什么，就按这三步
          </h2>

          <div class="mt-5 grid gap-3 lg:grid-cols-3">
            <NuxtLink
              v-for="(stage, index) in timelineStages"
              :key="stage.label"
              :to="stage.to"
              :aria-label="`${stage.label}：${stage.title}，${stage.actionLabel}`"
              class="group block rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-green-300 hover:shadow-sm active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            >
              <div class="flex items-center gap-3">
                <span class="grid size-8 place-items-center rounded-full bg-green-700 text-sm font-bold text-white">{{ index + 1 }}</span>
                <div>
                  <p class="text-xs font-semibold text-green-700">
                    {{ stage.label }}
                  </p>
                  <h3 class="text-sm font-bold text-zinc-950">
                    {{ stage.title }}
                  </h3>
                </div>
              </div>
              <ul class="mt-4 space-y-2 text-sm leading-6 text-zinc-600">
                <li
                  v-for="item in stage.items"
                  :key="item"
                  class="flex items-start gap-2"
                >
                  <UIcon
                    name="i-lucide-check"
                    class="mt-1 size-4 shrink-0 text-green-700"
                  />
                  <span>{{ item }}</span>
                </li>
              </ul>
              <span class="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-green-700 group-hover:text-green-800">
                {{ stage.actionLabel }}
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-4 transition group-hover:translate-x-0.5"
                />
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
            <h2 class="mt-1 text-xl font-bold text-zinc-950">
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
        v-if="moreEntries.length"
        class="border-y border-[var(--line)] bg-white"
      >
        <div class="page-shell py-8 md:py-10">
          <p class="section-kicker">
            继续了解
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            其他常用入口
          </h2>
          <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NuxtLink
              v-for="entry in moreEntries"
              :key="entry.to"
              :to="entry.to"
              :external="entry.external"
              :target="entry.external ? '_blank' : undefined"
              :rel="entry.external ? 'noopener noreferrer' : undefined"
              class="flex min-h-28 items-start gap-3 rounded-lg border border-zinc-200 p-4 transition hover:border-green-300"
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
