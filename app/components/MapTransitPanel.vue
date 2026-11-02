<script setup lang="ts">
import type {
  ApiBusDeparturesDirection,
  ApiBusLineDirection,
  ApiBusLiveDirection,
  ApiBusLiveResponse,
  ApiBusDeparturesResponse
} from '~~/shared/types/server'

const props = defineProps<{
  directions: ApiBusLineDirection[]
  fetchedAt: string | null
  open: boolean
  /** 桌面端距地图左缘的距离；左侧地点栏展开时要让开 18rem。 */
  leftOffset?: string
  /** 掌上公交实时车辆（20 秒刷新）。 */
  live?: ApiBusLiveResponse | null
  /** 全天发车时刻表。 */
  departures?: ApiBusDeparturesResponse | null
  liveError?: string
  /** 当前只看某一个方向（方向 id）；空串表示双向都画。 */
  selectedDirection?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'focus-stop': [point: { lng: number, lat: number }]
  'select-direction': [line: ApiBusLineDirection]
  'change-line': [line: string]
}>()

const LINE_ORDER = ['K2', 'K6'] as const
const LINE_COLORS: Record<string, string> = { K2: '#1a6cf5', K6: '#e8590c' }

const ALL = 'all'
const selectedLine = ref<string>(ALL)
const expandedId = ref<string>('')

const lineNames = computed(() => {
  const present = [...new Set(props.directions.map(item => item.line))]
  return present.sort((a, b) => {
    const ai = LINE_ORDER.indexOf(a as typeof LINE_ORDER[number])
    const bi = LINE_ORDER.indexOf(b as typeof LINE_ORDER[number])
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
})

watch(lineNames, (names) => {
  if (selectedLine.value !== ALL && !names.includes(selectedLine.value)) selectedLine.value = ALL
}, { immediate: true })

function sameStop(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a)
}

function liveOf(direction: ApiBusLineDirection): ApiBusLiveDirection | null {
  const list = (props.live?.directions ?? []).filter(item => item.line === direction.line)
  return list.find(item => sameStop(item.from, direction.from) && sameStop(item.to, direction.to)) ?? null
}

function departuresOf(direction: ApiBusLineDirection): ApiBusDeparturesDirection | null {
  const list = (props.departures?.directions ?? []).filter(item => item.line === direction.line)
  return list.find(item => sameStop(item.from, direction.from) && sameStop(item.to, direction.to)) ?? null
}

function nextDeparture(direction: ApiBusLineDirection): string {
  return departuresOf(direction)?.next?.[0] ?? ''
}

function laterDepartures(direction: ApiBusLineDirection): string[] {
  return (departuresOf(direction)?.next ?? []).slice(1)
}

function onlineCount(direction: ApiBusLineDirection): number {
  return liveOf(direction)?.vehicles.length ?? 0
}

const lineDirections = computed(() => selectedLine.value === ALL
  ? [...props.directions].sort((a, b) => lineNames.value.indexOf(a.line) - lineNames.value.indexOf(b.line))
  : props.directions.filter(item => item.line === selectedLine.value))

function selectLine(name: string): void {
  selectedLine.value = name
  expandedId.value = ''
  emit('change-line', name)
}

/** 手机上是整屏浮层，默认展开第一个方向，免得大片留白。 */
function autoExpandOnMobile(): void {
  if (typeof window === 'undefined' || window.innerWidth >= 768) return
  if (expandedId.value) return
  expandedId.value = lineDirections.value[0]?.id ?? ''
}

watch(() => props.open, (open) => {
  if (open) nextTick(autoExpandOnMobile)
}, { immediate: true })

/** 页面侧切了“只看某方向”时，标签页跟着走，避免标签写着全部但地图只有一条。 */
watch(() => props.selectedDirection, (id) => {
  if (!id) {
    selectedLine.value = ALL
    return
  }
  const hit = props.directions.find(item => item.id === id)
  if (hit) selectedLine.value = hit.line
})

function lineColor(line: string): string {
  return LINE_COLORS[line] ?? '#1a6cf5'
}

const selectedDirectionLabel = computed(() => {
  const hit = props.directions.find(item => item.id === props.selectedDirection)
  return hit ? `${hit.line} ${hit.from} → ${hit.to}` : ''
})

function clearDirection(): void {
  const hit = props.directions.find(item => item.id === props.selectedDirection)
  if (hit) emit('select-direction', hit)
}

function priceText(direction: ApiBusLineDirection): string {
  if (direction.totalPrice === null) return '票价未标注'
  if (direction.basicPrice === direction.totalPrice) return `全程 ${direction.totalPrice} 元`
  return `全程 ${direction.totalPrice} 元（起步 ${direction.basicPrice ?? '-'} 元）`
}

/** 点方向行 = 只看这一条（地图只留这条折线与它的车）；再点一次回到双向。 */
function toggleDirection(direction: ApiBusLineDirection): void {
  const selected = props.selectedDirection === direction.id
  expandedId.value = selected ? '' : direction.id
  emit('select-direction', direction)
}

const snapshotText = computed(() => {
  if (!props.fetchedAt) return ''
  const date = new Date(props.fetchedAt)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
})
</script>

<template>
  <!-- 收起态：地图左下角浮钮 -->
  <UButton
    v-if="!open"
    icon="i-lucide-bus"
    label="公交线路"
    color="neutral"
    variant="solid"
    class="absolute bottom-20 left-3 z-30 shadow-lg md:bottom-6 md:left-[var(--transit-left,1rem)]"
    :style="{ '--transit-left': leftOffset ?? '1rem' }"
    @click="emit('update:open', true)"
  />

  <section
    v-else
    class="absolute inset-x-3 bottom-2 top-2 z-50 flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 md:inset-x-auto md:bottom-6 md:left-[var(--transit-left,1rem)] md:top-auto md:z-50 md:max-h-[62vh] md:w-80 max-md:landscape:inset-x-auto max-md:landscape:left-2 max-md:landscape:w-60"
    :style="{ '--transit-left': leftOffset ?? '1rem' }"
    aria-label="校外公交线路"
  >
    <header class="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
      <UIcon
        name="i-lucide-bus"
        class="size-4 text-blue-600 dark:text-blue-400"
      />
      <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        校外公交
      </h2>
      <span
        v-if="snapshotText"
        class="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500"
      >快照 {{ snapshotText }}</span>
      <UButton
        icon="i-lucide-chevron-down"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="收起公交面板"
        @click="emit('update:open', false)"
      />
    </header>

    <!-- 线路切换 -->
    <div class="flex shrink-0 gap-1 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
      <button
        v-for="name in [ALL, ...lineNames]"
        :key="name"
        type="button"
        class="min-h-9 flex-1 rounded-md px-2 py-1 text-xs font-semibold transition"
        :class="name === selectedLine
          ? 'text-white shadow-sm'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'"
        :style="name === selectedLine ? { backgroundColor: name === ALL ? '#3f3f46' : lineColor(name) } : undefined"
        @click="selectLine(name)"
      >
        {{ name === ALL ? '全部' : name }}
      </button>
    </div>

    <div
      v-if="selectedDirectionLabel"
      class="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-3 py-1 dark:border-zinc-800"
    >
      <span class="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
        只看 {{ selectedDirectionLabel }}
      </span>
      <button
        type="button"
        class="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
        @click="clearDirection"
      >
        显示双向
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      <article
        v-for="direction in lineDirections"
        :key="direction.id"
        class="border-b border-zinc-100 transition-colors last:border-b-0 dark:border-zinc-800"
        :class="selectedDirection === direction.id ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''"
      >
        <button
          type="button"
          class="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          :aria-expanded="expandedId === direction.id"
          @click="toggleDirection(direction)"
        >
          <span
            class="mt-1 size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: lineColor(direction.line) }"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
              {{ direction.from }} → {{ direction.to }}
            </span>
            <span
              v-if="selectedDirection === direction.id"
              class="mt-0.5 inline-flex items-center gap-1 rounded-full bg-blue-600 px-1.5 py-px text-[10px] font-medium text-white"
            >
              <UIcon
                name="i-lucide-eye"
                class="size-2.5"
              />
              地图只看这条
            </span>
            <span class="mt-0.5 block text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
              首 {{ direction.startTime }} · 末 {{ direction.endTime }} · {{ direction.distanceKm }} km · {{ direction.stops.length }} 站<br>
              {{ priceText(direction) }}
            </span>
            <span
              v-if="nextDeparture(direction)"
              class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4"
            >
              <span class="font-semibold text-zinc-700 dark:text-zinc-200">
                下一班 {{ nextDeparture(direction) }}
              </span>
              <span
                v-if="laterDepartures(direction).length"
                class="text-zinc-400"
              >
                之后 {{ laterDepartures(direction).join(' · ') }}
              </span>
              <span
                v-if="onlineCount(direction)"
                class="rounded-full bg-emerald-50 px-1.5 py-px font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              >
                在线 {{ onlineCount(direction) }} 辆
              </span>
            </span>
          </span>
          <UIcon
            name="i-lucide-chevron-right"
            class="mt-0.5 size-3.5 shrink-0 text-zinc-400 transition-transform"
            :class="expandedId === direction.id ? 'rotate-90' : ''"
          />
        </button>

        <div
          v-if="expandedId === direction.id"
          class="pb-2"
        >
          <p class="px-3 pb-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">
            点站名在地图上定位；下一班与在途车辆来自掌上公交，20 秒刷新。
          </p>
          <ol class="overscroll-y-contain md:max-h-72 md:overflow-y-auto">
            <li
              v-for="stop in direction.stops"
              :key="stop.seq"
            >
              <button
                type="button"
                class="flex min-h-8 w-full items-center gap-2 px-3 py-1 text-left text-xs text-zinc-600 transition-colors hover:bg-green-50 dark:text-zinc-300 dark:hover:bg-green-950/60"
                @click="emit('focus-stop', { lng: stop.lng, lat: stop.lat })"
              >
                <span class="w-4 shrink-0 text-right text-[10px] tabular-nums text-zinc-400">{{ stop.seq }}</span>
                <span class="size-1.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                <span class="truncate">{{ stop.name }}</span>
              </button>
            </li>
          </ol>
        </div>
      </article>

      <p
        v-if="!directions.length"
        class="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500"
      >
        公交线路加载中…
      </p>
    </div>
  </section>
</template>
