<script setup lang="ts">
import {
  buildNearbyGuideMapUrl,
  buildNearbyGuideNavigationUrl,
  type NearbyGuideDestination,
  type NearbyGuideItem
} from '~~/data/nearby-guide'
import type { ApiTransitPlan, ApiTransitPlanResponse } from '~~/shared/types/server'
import { safeExternalHref } from '~/utils/safe-external-href'

const props = defineProps<{
  item: NearbyGuideItem
}>()

const open = ref(false)
const selectedDestinationId = ref(props.item.destinations[0]?.id ?? '')
const outbound = ref<ApiTransitPlanResponse | null>(null)
const inbound = ref<ApiTransitPlanResponse | null>(null)
const loading = ref(false)
const routeError = ref('')

const selectedDestination = computed<NearbyGuideDestination>(() =>
  props.item.destinations.find(destination => destination.id === selectedDestinationId.value)
  ?? props.item.destinations[0]!
)

function transitPointId(destination: NearbyGuideDestination): string {
  return `guide:${props.item.id}:${destination.id}`
}

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

function formatFare(plan: ApiTransitPlan): string {
  const routeNames = plan.segments.map(segment => segment.name).join(' ')
  if (/\bK6\b/i.test(routeNames)) return 'K6 全程 2 元'
  if (/\bK2\b/i.test(routeNames)) {
    return plan.fareYuan === null
      ? 'K2 分段计价，全程 5 元'
      : `K2 本次约 ${plan.fareYuan} 元`
  }
  return plan.fareYuan === null ? '票价以乘车为准' : `约 ${plan.fareYuan} 元`
}

function planTitle(plan: ApiTransitPlan): string {
  return plan.segments.map(segment => segment.name.replace(/\([^)]*\)/g, '')).join(' → ')
}

async function loadRoutes(): Promise<void> {
  if (!selectedDestination.value) return
  loading.value = true
  routeError.value = ''
  outbound.value = null
  inbound.value = null

  const pointId = transitPointId(selectedDestination.value)
  const [outboundResult, inboundResult] = await Promise.allSettled([
    $fetch<ApiTransitPlanResponse>('/api/public/transit/plan', {
      query: { from: 'campus', to: pointId }
    }),
    $fetch<ApiTransitPlanResponse>('/api/public/transit/plan', {
      query: { from: pointId, to: 'campus' }
    })
  ])

  if (outboundResult.status === 'fulfilled') outbound.value = outboundResult.value
  if (inboundResult.status === 'fulfilled') inbound.value = inboundResult.value
  if (!outbound.value && !inbound.value) {
    routeError.value = '高德当前没有返回可用的公交组合。可直接用下方“驾车 / 打车”规划，出发前同时确认返程是否还能叫到车。'
  }
  loading.value = false
}

function openDialog(): void {
  open.value = true
  void loadRoutes()
}

function selectDestination(destination: NearbyGuideDestination): void {
  if (selectedDestinationId.value === destination.id) return
  selectedDestinationId.value = destination.id
  void loadRoutes()
}
</script>

<template>
  <UButton
    icon="i-lucide-route"
    label="看具体路线和返校"
    color="neutral"
    variant="outline"
    class="min-h-11"
    @click="openDialog"
  />

  <UModal
    v-model:open="open"
    :title="`怎么去 ${selectedDestination.label}`"
    description="先选这张攻略里的具体地点，再看实时公交、打车和返校方案。"
    scrollable
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-5">
        <section
          v-if="item.destinations.length > 1"
          aria-labelledby="guide-destination-title"
        >
          <p
            id="guide-destination-title"
            class="text-xs font-semibold text-zinc-700"
          >
            这张攻略有 {{ item.destinations.length }} 个地点，先选一个
          </p>
          <div class="mt-2 flex gap-2 overflow-x-auto pb-1">
            <button
              v-for="(destination, index) in item.destinations"
              :key="destination.id"
              type="button"
              class="min-h-11 shrink-0 rounded-xl border px-3 text-left text-xs transition"
              :class="destination.id === selectedDestination.id
                ? 'border-green-700 bg-green-50 text-green-900'
                : 'border-zinc-200 bg-white text-zinc-600 hover:border-green-300'"
              @click="selectDestination(destination)"
            >
              <span class="block font-semibold">{{ index + 1 }}. {{ destination.label }}</span>
              <span
                v-if="destination.note"
                class="mt-0.5 block max-w-64 text-[11px] leading-4 opacity-75"
              >{{ destination.note }}</span>
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-green-100 bg-green-50/70 p-4">
          <div class="flex items-start gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-green-700 shadow-sm">
              <UIcon
                name="i-lucide-map-pin-check-inside"
                class="size-4.5"
              />
            </span>
            <div>
              <p class="text-sm font-bold text-zinc-950">
                导航目标：{{ selectedDestination.label }}
              </p>
              <p class="mt-1 text-xs leading-5 text-zinc-600">
                {{ selectedDestination.poiId ? '已用高德 POI 与经纬度交叉核对，不再使用可能搜不到的模糊关键词。' : '已使用系统内核验过的区域中心坐标，不依赖模糊关键词。' }}
              </p>
              <p
                v-if="selectedDestination.note"
                class="mt-1 text-xs leading-5 text-amber-800"
              >
                {{ selectedDestination.note }}
              </p>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              :href="safeExternalHref(buildNearbyGuideMapUrl(selectedDestination)) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-map-pinned"
              label="在高德看这个点"
              color="primary"
              variant="solid"
            />
            <UButton
              :href="safeExternalHref(buildNearbyGuideNavigationUrl(selectedDestination, 'bus')) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-bus-front"
              label="从当前位置坐公交"
              color="neutral"
              variant="outline"
            />
            <UButton
              :href="safeExternalHref(buildNearbyGuideNavigationUrl(selectedDestination, 'car')) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-car-taxi-front"
              label="驾车 / 打车"
              color="neutral"
              variant="outline"
            />
            <UButton
              :href="safeExternalHref(buildNearbyGuideNavigationUrl(selectedDestination, 'walk')) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-navigation"
              label="步行"
              color="neutral"
              variant="ghost"
            />
          </div>
        </section>

        <div
          v-if="loading"
          class="grid gap-3 sm:grid-cols-2"
          aria-label="正在查询往返公交"
        >
          <USkeleton class="h-40 rounded-2xl" />
          <USkeleton class="h-40 rounded-2xl" />
        </div>

        <UAlert
          v-else-if="routeError"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="公交方案暂时不可用"
          :description="routeError"
        />

        <div
          v-else
          class="grid gap-4 sm:grid-cols-2"
        >
          <section
            v-for="routeGroup in [
              { key: 'outbound', title: '从学校出发', data: outbound },
              { key: 'inbound', title: '回学校', data: inbound }
            ]"
            :key="routeGroup.key"
            class="rounded-2xl border border-zinc-200 bg-white p-4"
          >
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-bold text-zinc-950">
                {{ routeGroup.title }}
              </h3>
              <span
                v-if="routeGroup.data"
                class="text-[11px] text-zinc-400"
              >查询于 {{ formatQueryTime(routeGroup.data.queriedAt) }}</span>
            </div>
            <ol
              v-if="routeGroup.data?.plans.length"
              class="mt-3 space-y-3"
            >
              <li
                v-for="(plan, planIndex) in routeGroup.data.plans.slice(0, 2)"
                :key="`${routeGroup.key}-${planIndex}`"
                class="rounded-xl bg-zinc-50 p-3"
              >
                <p class="text-xs font-bold leading-5 text-zinc-900">
                  {{ planTitle(plan) }}
                </p>
                <p class="mt-1 text-[11px] leading-5 text-zinc-500">
                  约 {{ plan.durationMinutes }} 分钟 · 步行约 {{ plan.walkingMeters }} 米 · {{ formatFare(plan) }}
                </p>
                <ul class="mt-2 space-y-1.5">
                  <li
                    v-for="segment in plan.segments"
                    :key="`${segment.name}-${segment.departureStop}`"
                    class="text-[11px] leading-4 text-zinc-600"
                  >
                    {{ segment.departureStop }} 上 {{ segment.name }}，到 {{ segment.arrivalStop }}
                  </li>
                </ul>
              </li>
            </ol>
            <p
              v-else
              class="mt-3 text-xs leading-5 text-zinc-500"
            >
              这一方向暂未取得实时公交结果，请用高德公交或打车按钮重新规划。
            </p>
          </section>
        </div>

        <section class="rounded-2xl bg-zinc-950 p-4 text-white">
          <p class="text-xs font-bold text-green-300">
            组合地点怎么走
          </p>
          <p class="mt-2 text-sm leading-6 text-zinc-200">
            {{ item.travelNote }}
          </p>
          <p
            v-if="item.destinations.length > 1"
            class="mt-2 text-xs leading-5 text-zinc-400"
          >
            上面的公交 API 每次只规划到你选中的一个地点。切换地点即可分别查看，不会把多个相距较远的点误当成同一个终点。
          </p>
        </section>
      </div>
    </template>
  </UModal>
</template>
