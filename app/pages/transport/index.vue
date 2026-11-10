<script setup lang="ts">
import {
  campusTransitOrigins,
  campusTransitQuickFacts,
  campusTransitSources,
  campusTransitUpdatedAt,
  transitOptionsForOrigin,
  transitRouteFareNotes,
  type TransitOriginId
} from '~~/data/campus-transit'
import type { ApiTransitPlanResponse } from '~~/shared/types/server'

useSeoMeta({
  title: '到校与离校交通',
  description: '查询泉州站、泉州东站、泉州晋江国际机场和泉州市区往返学校的公交与换乘方案。'
})

const route = useRoute()
const transitOriginIds = new Set<TransitOriginId>([
  'quanzhou-station',
  'quanzhou-east',
  'jinjiang-airport',
  'city-center',
  'from-campus'
])
const requestedOrigin = typeof route.query.origin === 'string' ? route.query.origin : ''
const selectedOrigin = ref<TransitOriginId>(
  transitOriginIds.has(requestedOrigin as TransitOriginId)
    ? requestedOrigin as TransitOriginId
    : 'quanzhou-station'
)
const departureDestination = ref<Exclude<TransitOriginId, 'from-campus'>>('quanzhou-station')
const visibleOptions = computed(() => transitOptionsForOrigin(selectedOrigin.value))
const selectedOriginLabel = computed(() => campusTransitOrigins.find(item => item.id === selectedOrigin.value)?.label ?? '交通路线')
const departureDestinations = campusTransitOrigins.filter(origin => origin.id !== 'from-campus')
const liveQuery = computed(() => selectedOrigin.value === 'from-campus'
  ? { from: 'campus', to: departureDestination.value }
  : { from: selectedOrigin.value, to: 'campus' })
const {
  data: livePlan,
  status: livePlanStatus,
  refresh: refreshLivePlan
} = await useFetch<ApiTransitPlanResponse>('/api/public/transit/plan', {
  query: liveQuery,
  watch: [liveQuery]
})

function formatQueryTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai'
  }).format(new Date(value))
}

function formatPlanFare(plan: ApiTransitPlanResponse['plans'][number]): string {
  const routeNames = plan.segments.map(segment => segment.name).join(' ')
  const fixedFare = Object.entries(transitRouteFareNotes)
    .find(([route]) => new RegExp(`\\b${route}\\b`, 'i').test(routeNames))
  if (fixedFare) {
    if (!fixedFare[0].startsWith('K2')) return fixedFare[1]
    return plan.fareYuan === null ? fixedFare[1] : `K2 本次约 ${plan.fareYuan} 元`
  }
  return plan.fareYuan === null ? '票价以乘车为准' : `约 ${plan.fareYuan} 元`
}

const quickFacts = campusTransitQuickFacts

interface BusEtaStopView {
  stop: string
  etaMin: [number, number]
  status: 'passed' | 'upcoming' | 'due'
  cumulativeSeconds: number
}

interface BusEtaSegmentView {
  from: string
  to: string
  seconds: number
  cumulativeSeconds: number
}

interface BusEtaPayload {
  available: boolean
  measuredAt: string
  minutesSinceDeparture: number
  stops: BusEtaStopView[]
  segments: BusEtaSegmentView[]
  warning: string
}

/** 滑杆范围与接口的 0–90 校验分开：页面上只开放 0–60，避免给出离谱估算。 */
const ETA_SLIDER_MIN = 0
const ETA_SLIDER_MAX = 60
const etaMinutes = ref(0)
const etaQuery = computed(() => ({ minutes: etaMinutes.value }))
const { data: busEta, status: busEtaStatus } = await useFetch<BusEtaPayload>('/api/public/bus/eta', {
  query: etaQuery,
  watch: [etaQuery]
})
const etaTotalMinutes = computed(() => {
  const last = busEta.value?.segments.at(-1)
  return last ? Math.round(last.cumulativeSeconds / 60) : null
})

function onEtaMinutesInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  etaMinutes.value = Math.min(ETA_SLIDER_MAX, Math.max(ETA_SLIDER_MIN, Math.round(value)))
}

function stepEtaMinutes() {
  etaMinutes.value = Math.min(ETA_SLIDER_MAX, etaMinutes.value + 5)
}

function etaStatusText(stop: BusEtaStopView): string {
  if (stop.status === 'passed') return '已过站'
  const range = `${stop.etaMin[0]}–${stop.etaMin[1]} 分钟`
  return stop.status === 'due' ? `${range} · 即将到站` : range
}

function etaSegmentText(index: number): string | null {
  const segment = busEta.value?.segments[index]
  if (!segment) return null
  return `站间约 ${Math.max(1, Math.round(segment.seconds / 60))} 分钟`
}
</script>

<template>
  <div class="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-950 dark:text-zinc-100">
    <section class="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-12">
        <NuxtLink
          to="/"
          class="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100"
        >
          <UIcon
            name="i-lucide-arrow-left"
            class="size-4"
          />返回首页
        </NuxtLink>
        <div class="mt-4 grid gap-7 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
          <div class="max-w-3xl">
            <p class="section-kicker">
              校外交通
            </p>
            <h1 class="mt-2 text-3xl font-bold md:text-4xl">
              到学校，也要知道怎么出去
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300 md:text-base">
              泉州站可乘 K6 直达，泉州市区可乘 K2 往返。东站和机场没有稳定直达方案，请在出发当天重新规划。
            </p>
            <NuxtLink
              to="/transport/lines"
              class="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-950 dark:border-zinc-100 px-4 text-sm font-semibold text-zinc-950 dark:text-zinc-100 hover:bg-zinc-950 hover:text-white dark:hover:bg-zinc-100 dark:hover:text-zinc-950 transition"
            >
              <UIcon
                name="i-lucide-route"
                class="size-4"
              />看 K2 / K6 实际线路图
            </NuxtLink>
          </div>
          <div class="grid grid-cols-3 divide-x divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div
              v-for="fact in quickFacts"
              :key="fact.route"
              class="min-w-0 py-3 px-2 text-center"
            >
              <p
                class="text-lg font-bold"
                :class="fact.tone.split(' ')[0]"
              >
                {{ fact.route }}
              </p>
              <p class="mt-1 truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                {{ fact.destination }}
              </p>
              <p class="mt-1 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                {{ fact.detail }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <main class="page-shell py-7 md:py-11">
      <section aria-labelledby="origin-title">
        <h2
          id="origin-title"
          class="text-lg font-bold"
        >
          你从哪里出发？
        </h2>
        <div
          class="mt-3 flex gap-2 overflow-x-auto pb-2"
          role="tablist"
          aria-label="选择出发地点"
        >
          <button
            v-for="origin in campusTransitOrigins"
            :key="origin.id"
            type="button"
            role="tab"
            :aria-selected="selectedOrigin === origin.id"
            class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3.5 text-sm font-semibold transition"
            :class="selectedOrigin === origin.id ? 'border-zinc-950 bg-zinc-950 dark:bg-zinc-800 dark:bg-zinc-800 text-white' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600'"
            @click="selectedOrigin = origin.id"
          >
            <UIcon
              :name="origin.icon"
              class="size-4"
            />{{ origin.label }}
          </button>
        </div>
        <div
          v-if="selectedOrigin === 'from-campus'"
          class="mt-3 flex items-center gap-2 overflow-x-auto pb-2"
          aria-label="选择离校目的地"
        >
          <span class="shrink-0 text-xs font-semibold text-zinc-500 dark:text-zinc-400">去哪里</span>
          <button
            v-for="destination in departureDestinations"
            :key="destination.id"
            type="button"
            class="min-h-10 shrink-0 rounded-md px-3 text-sm font-semibold"
            :class="departureDestination === destination.id ? 'bg-emerald-700 text-white' : 'border border-zinc-200 dark:border-zinc-800 dark:border-zinc-800 bg-white dark:bg-zinc-900 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200'"
            @click="departureDestination = destination.id"
          >
            {{ destination.label }}
          </button>
        </div>
      </section>

      <section
        class="mt-6 border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/70 p-4 md:p-5"
        aria-labelledby="live-plan-title"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                color="success"
                variant="solid"
              >
                高德 API 优先
              </UBadge>
              <span
                v-if="livePlan"
                class="text-xs text-emerald-900/65"
              >
                查询于 {{ formatQueryTime(livePlan.queriedAt) }}
              </span>
            </div>
            <h2
              id="live-plan-title"
              class="mt-2 text-lg font-bold text-emerald-950 dark:text-emerald-300"
            >
              {{ livePlan ? `${livePlan.origin.label} → ${livePlan.destination.label}` : '正在获取当天公交方案' }}
            </h2>
            <p class="mt-1 text-xs leading-5 text-emerald-950/65">
              高德提供路线、站点与运营时段，不提供泉州公交车辆实时位置或“还有几站”。
            </p>
          </div>
          <UButton
            type="button"
            icon="i-lucide-refresh-cw"
            label="重新查询"
            color="success"
            variant="outline"
            :loading="livePlanStatus === 'pending'"
            class="min-h-11 shrink-0"
            @click="refreshLivePlan()"
          />
        </div>

        <div
          v-if="livePlan?.plans.length"
          class="mt-4 grid gap-3 lg:grid-cols-3"
        >
          <article
            v-for="(plan, planIndex) in livePlan.plans"
            :key="`${livePlan.queriedAt}-${planIndex}`"
            class="bg-white dark:bg-zinc-900 p-4 shadow-sm"
          >
            <div class="flex items-end justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div>
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  方案 {{ planIndex + 1 }}
                </p>
                <p class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
                  约 {{ plan.durationMinutes }} 分钟
                </p>
              </div>
              <p class="text-right text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                步行 {{ plan.walkingMeters }} 米<br>
                {{ formatPlanFare(plan) }}
              </p>
            </div>
            <ol class="mt-3 space-y-3">
              <li
                v-for="segment in plan.segments"
                :key="`${segment.name}-${segment.departureStop}`"
                class="text-sm leading-5"
              >
                <p class="font-bold text-zinc-900 dark:text-zinc-100">
                  {{ segment.name }}
                </p>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {{ segment.departureStop }} → {{ segment.arrivalStop }}
                  <span v-if="segment.viaStops !== null"> · {{ segment.viaStops }} 站</span>
                </p>
                <p
                  v-if="segment.startTime && segment.endTime"
                  class="mt-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
                >
                  线路运营约 {{ segment.startTime }}-{{ segment.endTime }}
                </p>
              </li>
            </ol>
          </article>
        </div>
        <div
          v-else-if="livePlanStatus !== 'pending'"
          class="mt-4 flex items-start gap-2 border-l-2 border-amber-400 dark:border-amber-700 bg-white dark:bg-zinc-900 px-3 py-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200"
        >
          <UIcon
            name="i-lucide-wifi-off"
            class="mt-1 size-4 shrink-0 text-amber-700 dark:text-amber-300"
          />
          高德实时规划暂时不可用，下面已自动保留核验过的 K6、K2 与换乘建议。
        </div>
      </section>

      <section
        class="mt-7 surface-panel px-4 py-5 md:px-6 md:py-7"
        aria-labelledby="bus-eta-title"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-2xl">
            <p class="section-kicker">
              校车站间
            </p>
            <h2
              id="bus-eta-title"
              class="mt-2 text-lg font-bold text-emerald-950 dark:text-emerald-300"
            >
              现在出发几分钟后到哪
            </h2>
            <p class="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
              数据口径：{{ busEta?.measuredAt ?? '2026-11-04' }} 实测采样，非实时。区间由「已从首站发车多少分钟」推算，不是车辆当前位置。
            </p>
          </div>
          <div class="w-full max-w-sm">
            <label
              for="bus-eta-minutes"
              class="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-300"
            >
              <span>已发车</span>
              <span class="text-emerald-800 dark:text-emerald-300">{{ etaMinutes }} 分钟</span>
            </label>
            <input
              id="bus-eta-minutes"
              type="range"
              :min="ETA_SLIDER_MIN"
              :max="ETA_SLIDER_MAX"
              step="1"
              :value="etaMinutes"
              class="mt-2 w-full accent-emerald-700"
              @change="onEtaMinutesInput"
            >
            <div class="mt-2 flex items-center justify-between gap-2">
              <span class="text-[11px] text-zinc-500 dark:text-zinc-400">{{ ETA_SLIDER_MIN }}</span>
              <UButton
                type="button"
                size="xs"
                color="success"
                variant="outline"
                icon="i-lucide-plus"
                label="+5 分钟"
                class="min-h-9"
                @click="stepEtaMinutes"
              />
              <span class="text-[11px] text-zinc-500 dark:text-zinc-400">{{ ETA_SLIDER_MAX }}</span>
            </div>
          </div>
        </div>

        <div
          v-if="busEta?.available && busEta.stops.length"
          class="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800"
          :class="busEtaStatus === 'pending' ? 'opacity-60' : ''"
        >
          <div
            v-for="(stop, index) in busEta.stops"
            :key="stop.stop"
            class="flex items-center justify-between gap-3 py-3"
          >
            <div class="min-w-0">
              <p
                class="truncate text-sm font-semibold"
                :class="stop.status === 'passed' ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'"
              >
                {{ stop.stop }}
              </p>
              <p class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                {{ etaSegmentText(index - 1) ?? '起点站' }}
              </p>
            </div>
            <span
              class="shrink-0 text-sm font-bold"
              :class="stop.status === 'passed' ? 'text-zinc-400 dark:text-zinc-500' : stop.status === 'due' ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-900 dark:text-zinc-100'"
            >
              {{ etaStatusText(stop) }}
            </span>
          </div>
        </div>
        <p
          v-else-if="busEtaStatus === 'pending'"
          class="mt-4 text-sm text-zinc-500 dark:text-zinc-400"
        >
          正在读取实测区间…
        </p>
        <div
          v-else
          class="mt-4 border-l-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300"
        >
          <UIcon
            name="i-lucide-info"
            class="mr-1 inline size-4 text-zinc-400 dark:text-zinc-500"
          />
          校车站间数据暂不可用{{ busEta?.warning ? `：${busEta.warning}` : '' }}。上面的公交方案不受影响。
        </div>
        <p
          v-if="etaTotalMinutes !== null"
          class="mt-3 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400"
        >
          首站到末站实测约 {{ etaTotalMinutes }} 分钟；每站区间取实测中位数 ±20%，不代表实时车辆位置。
        </p>
      </section>

      <section
        class="mt-7"
        :aria-label="`${selectedOriginLabel}交通方案`"
      >
        <article
          v-for="option in visibleOptions"
          :key="option.id"
          class="border-t-2 border-emerald-700 bg-white dark:bg-zinc-900 px-4 py-5 shadow-sm md:px-6 md:py-7"
        >
          <div class="grid gap-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  color="success"
                  variant="soft"
                >
                  {{ option.badge }}
                </UBadge>
                <span class="text-xs text-zinc-500 dark:text-zinc-400">更新于 {{ campusTransitUpdatedAt }}</span>
              </div>
              <h2 class="mt-3 text-2xl font-bold">
                {{ option.title }}
              </h2>
              <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {{ option.summary }}
              </p>
              <dl class="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800 text-sm">
                <div class="grid grid-cols-[5.5rem_1fr] gap-3 py-3">
                  <dt class="text-zinc-500 dark:text-zinc-400">
                    参考耗时
                  </dt><dd class="font-semibold">
                    {{ option.duration }}
                  </dd>
                </div>
                <div class="grid grid-cols-[5.5rem_1fr] gap-3 py-3">
                  <dt class="text-zinc-500 dark:text-zinc-400">
                    计价方式
                  </dt><dd>{{ option.fare }}</dd>
                </div>
                <div class="grid grid-cols-[5.5rem_1fr] gap-3 py-3">
                  <dt class="text-zinc-500 dark:text-zinc-400">
                    常见时段
                  </dt><dd>{{ option.serviceHours }}</dd>
                </div>
              </dl>
              <UButton
                :to="option.mapUrl"
                external
                target="_blank"
                rel="noopener noreferrer"
                icon="i-lucide-navigation"
                label="打开高德重新规划"
                size="lg"
                class="mt-5 min-h-11"
              />
            </div>

            <div>
              <h3 class="text-sm font-bold">
                乘车步骤
              </h3>
              <ol class="mt-3 space-y-3">
                <li
                  v-for="(step, index) in option.steps"
                  :key="step"
                  class="flex gap-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200"
                >
                  <span class="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-950 dark:bg-zinc-800 text-xs font-bold text-white">{{ index + 1 }}</span>
                  <span>{{ step }}</span>
                </li>
              </ol>
              <div class="mt-5 border-l-2 border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-3">
                <p class="text-xs font-bold text-amber-950">
                  出发前确认
                </p>
                <ul class="mt-2 space-y-1.5 text-sm leading-6 text-amber-950/85">
                  <li
                    v-for="note in option.notes"
                    :key="note"
                  >
                    {{ note }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section class="mt-8 border-y border-zinc-200 dark:border-zinc-800 py-6 md:mt-10">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p class="section-kicker">
              信息来源
            </p>
            <h2 class="mt-1 text-xl font-bold">
              班次会变，入口留给你复核
            </h2>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            资料核对：{{ campusTransitUpdatedAt }}
          </p>
        </div>
        <div class="mt-4 grid gap-px overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800 sm:grid-cols-2 lg:grid-cols-3">
          <a
            v-for="source in campusTransitSources"
            :key="source.id"
            :href="source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="group min-h-32 bg-white dark:bg-zinc-900 p-4"
          >
            <span class="flex items-center justify-between gap-2 text-sm font-bold">
              {{ source.title }}<UIcon
                name="i-lucide-external-link"
                class="size-4 shrink-0 text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-700"
              />
            </span>
            <span class="mt-2 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ source.note }}</span>
          </a>
        </div>
        <p class="mt-4 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          本页是第三方整理，不代表公交公司的实时承诺。首末班、票价、停靠站、临时接驳与新生接站安排，以泉州公交、学校最新通知和出发当天地图结果为准。
        </p>
      </section>
    </main>
  </div>
</template>
