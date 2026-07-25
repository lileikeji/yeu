<script setup lang="ts">
import {
  campusTransitOrigins,
  campusTransitSources,
  campusTransitUpdatedAt,
  transitOptionsForOrigin,
  type TransitOriginId
} from '~~/data/campus-transit'
import type { ApiTransitPlanResponse } from '~~/shared/types/server'

useSeoMeta({
  title: '到校与离校交通',
  description: '查询泉州站、泉州东站、泉州晋江国际机场和泉州市区往返仰恩大学的公交与换乘方案。'
})

const selectedOrigin = ref<TransitOriginId>('quanzhou-station')
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

const quickFacts = [
  { route: 'K6', destination: '泉州站', detail: '直达，末班较早', tone: 'text-emerald-800 bg-emerald-50' },
  { route: 'K2', destination: '文化宫 / 市区', detail: '直达，运营较晚', tone: 'text-blue-800 bg-blue-50' },
  { route: '换乘', destination: '东站 / 机场', detail: '出发前实时规划', tone: 'text-amber-900 bg-amber-50' }
]
</script>

<template>
  <div class="bg-zinc-50 text-zinc-950">
    <section class="border-b border-zinc-200 bg-white">
      <div class="page-shell py-8 md:py-12">
        <NuxtLink
          to="/"
          class="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-zinc-600 hover:text-zinc-950"
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
            <p class="mt-3 text-sm leading-7 text-zinc-600 md:text-base">
              泉州站可乘 K6 直达，泉州市区可乘 K2 往返。东站和机场没有稳定直达方案，请在出发当天重新规划。
            </p>
          </div>
          <div class="grid grid-cols-3 divide-x divide-zinc-200 border-y border-zinc-200 bg-white">
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
              <p class="mt-1 truncate text-xs font-semibold text-zinc-800">
                {{ fact.destination }}
              </p>
              <p class="mt-1 text-[11px] leading-4 text-zinc-500">
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
            :class="selectedOrigin === origin.id ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'"
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
          <span class="shrink-0 text-xs font-semibold text-zinc-500">去哪里</span>
          <button
            v-for="destination in departureDestinations"
            :key="destination.id"
            type="button"
            class="min-h-10 shrink-0 rounded-md px-3 text-sm font-semibold"
            :class="departureDestination === destination.id ? 'bg-emerald-700 text-white' : 'border border-zinc-200 bg-white text-zinc-700'"
            @click="departureDestination = destination.id"
          >
            {{ destination.label }}
          </button>
        </div>
      </section>

      <section
        class="mt-6 border border-emerald-200 bg-emerald-50/70 p-4 md:p-5"
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
              class="mt-2 text-lg font-bold text-emerald-950"
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
            class="bg-white p-4 shadow-sm"
          >
            <div class="flex items-end justify-between gap-3 border-b border-zinc-200 pb-3">
              <div>
                <p class="text-xs text-zinc-500">
                  方案 {{ planIndex + 1 }}
                </p>
                <p class="mt-1 text-xl font-bold text-zinc-950">
                  约 {{ plan.durationMinutes }} 分钟
                </p>
              </div>
              <p class="text-right text-xs leading-5 text-zinc-500">
                步行 {{ plan.walkingMeters }} 米<br>
                {{ plan.fareYuan === null ? '票价以乘车为准' : `约 ${plan.fareYuan} 元` }}
              </p>
            </div>
            <ol class="mt-3 space-y-3">
              <li
                v-for="segment in plan.segments"
                :key="`${segment.name}-${segment.departureStop}`"
                class="text-sm leading-5"
              >
                <p class="font-bold text-zinc-900">
                  {{ segment.name }}
                </p>
                <p class="mt-0.5 text-xs text-zinc-500">
                  {{ segment.departureStop }} → {{ segment.arrivalStop }}
                  <span v-if="segment.viaStops !== null"> · {{ segment.viaStops }} 站</span>
                </p>
                <p
                  v-if="segment.startTime && segment.endTime"
                  class="mt-0.5 text-xs font-semibold text-emerald-800"
                >
                  线路运营约 {{ segment.startTime }}-{{ segment.endTime }}
                </p>
              </li>
            </ol>
          </article>
        </div>
        <div
          v-else-if="livePlanStatus !== 'pending'"
          class="mt-4 flex items-start gap-2 border-l-2 border-amber-400 bg-white px-3 py-3 text-sm leading-6 text-zinc-700"
        >
          <UIcon
            name="i-lucide-wifi-off"
            class="mt-1 size-4 shrink-0 text-amber-700"
          />
          高德实时规划暂时不可用，下面已自动保留核验过的 K6、K2 与换乘建议。
        </div>
      </section>

      <section
        class="mt-7"
        :aria-label="`${selectedOriginLabel}交通方案`"
      >
        <article
          v-for="option in visibleOptions"
          :key="option.id"
          class="border-t-2 border-emerald-700 bg-white px-4 py-5 shadow-sm md:px-6 md:py-7"
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
                <span class="text-xs text-zinc-500">更新于 {{ campusTransitUpdatedAt }}</span>
              </div>
              <h2 class="mt-3 text-2xl font-bold">
                {{ option.title }}
              </h2>
              <p class="mt-2 text-sm leading-6 text-zinc-600">
                {{ option.summary }}
              </p>
              <dl class="mt-5 divide-y divide-zinc-200 border-y border-zinc-200 text-sm">
                <div class="grid grid-cols-[5.5rem_1fr] gap-3 py-3">
                  <dt class="text-zinc-500">
                    参考耗时
                  </dt><dd class="font-semibold">
                    {{ option.duration }}
                  </dd>
                </div>
                <div class="grid grid-cols-[5.5rem_1fr] gap-3 py-3">
                  <dt class="text-zinc-500">
                    参考票价
                  </dt><dd>{{ option.fare }}</dd>
                </div>
                <div class="grid grid-cols-[5.5rem_1fr] gap-3 py-3">
                  <dt class="text-zinc-500">
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
                  class="flex gap-3 text-sm leading-6 text-zinc-700"
                >
                  <span class="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-950 text-xs font-bold text-white">{{ index + 1 }}</span>
                  <span>{{ step }}</span>
                </li>
              </ol>
              <div class="mt-5 border-l-2 border-amber-400 bg-amber-50 px-4 py-3">
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

      <section class="mt-8 border-y border-zinc-200 py-6 md:mt-10">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p class="section-kicker">
              信息来源
            </p>
            <h2 class="mt-1 text-xl font-bold">
              班次会变，入口留给你复核
            </h2>
          </div>
          <p class="text-xs text-zinc-500">
            资料核对：{{ campusTransitUpdatedAt }}
          </p>
        </div>
        <div class="mt-4 grid gap-px overflow-hidden rounded-md bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3">
          <a
            v-for="source in campusTransitSources"
            :key="source.id"
            :href="source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="group min-h-32 bg-white p-4"
          >
            <span class="flex items-center justify-between gap-2 text-sm font-bold">
              {{ source.title }}<UIcon
                name="i-lucide-external-link"
                class="size-4 shrink-0 text-zinc-400 group-hover:text-emerald-700"
              />
            </span>
            <span class="mt-2 block text-xs leading-5 text-zinc-500">{{ source.note }}</span>
          </a>
        </div>
        <p class="mt-4 text-xs leading-5 text-zinc-500">
          本页是第三方整理，不代表公交公司的实时承诺。首末班、票价、停靠站、临时接驳与新生接站安排，以泉州公交、学校最新通知和出发当天地图结果为准。
        </p>
      </section>
    </main>
  </div>
</template>
