<script setup lang="ts">
import type {
  DuelPrediction,
  SingerAnalyticsProfile
} from '~~/shared/utils/competition-analytics'

const props = withDefaults(defineProps<{
  profile: SingerAnalyticsProfile | null | undefined
  opponent?: SingerAnalyticsProfile | null
  prediction?: DuelPrediction | null
  side?: 'left' | 'right' | null
  pairNo?: number | null
  compact?: boolean
}>(), {
  opponent: null,
  prediction: null,
  side: null,
  pairNo: null,
  compact: false
})

const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const open = ref(false)
const panelStyle = ref<Record<string, string>>({})

let openTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

const power = computed(() => props.profile?.power ?? null)

const tierBadgeClass = computed(() => {
  switch (power.value?.tier) {
    case 'S':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
    case 'A+':
    case 'A':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
    case 'B+':
    case 'B':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
    case 'C':
      return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
    default:
      return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
  }
})

const winRateForSelf = computed(() => {
  if (!props.prediction || props.prediction.leftWinProb === null || props.prediction.rightWinProb === null) {
    return null
  }
  if (props.side === 'right') return props.prediction.rightWinProb
  return props.prediction.leftWinProb
})

const factorRows = computed(() => {
  const item = power.value
  if (!item || !item.hasRating) return []
  return [
    {
      key: 'base',
      label: '硬实力基准',
      weight: '55%',
      value: item.baseScore ?? 0,
      hint: `初 ${(item.prelimWeight * 100).toFixed(0)}% + 复 ${(item.semiWeight * 100).toFixed(0)}%`
    },
    {
      key: 'dominance',
      label: '同场统治力',
      weight: '25%',
      value: item.dominanceScore ?? 0,
      hint: '超越率与同场 Z 值'
    },
    {
      key: 'stability',
      label: '发挥稳定性',
      weight: '10%',
      value: item.stabilityScore ?? 0,
      hint: item.semi?.judgeStdDev != null
        ? `复赛评委分差 ${item.semi.judgeStdDev.toFixed(2)}`
        : (item.prelim?.judgeStdDev != null ? `初赛评委分差 ${item.prelim.judgeStdDev.toFixed(2)}` : '评委共识度')
    },
    {
      key: 'momentum',
      label: '进阶成长势能',
      weight: '10%',
      value: item.momentumScore ?? 0,
      hint: item.deltaPercent === null
        ? '单轮中性基线'
        : `复赛较初赛 ${item.deltaPercent >= 0 ? '+' : ''}${item.deltaPercent.toFixed(1)}%`
    }
  ]
})

function clearTimers(): void {
  if (openTimer) {
    clearTimeout(openTimer)
    openTimer = null
  }
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function updatePosition(): void {
  const trigger = triggerRef.value
  if (!trigger || typeof window === 'undefined') return
  const rect = trigger.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cardWidth = Math.min(352, vw - 24)
  const estHeight = panelRef.value?.offsetHeight ?? 420

  let left = rect.right - cardWidth
  if (left < 12) left = Math.max(12, rect.left)
  if (left + cardWidth > vw - 12) left = vw - cardWidth - 12

  let top = rect.bottom + 8
  if (top + estHeight > vh - 12 && rect.top - estHeight - 8 >= 12) {
    top = rect.top - estHeight - 8
  } else if (top + estHeight > vh - 12) {
    top = Math.max(12, vh - estHeight - 12)
  }

  panelStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(cardWidth)}px`
  }
}

function showNow(): void {
  clearTimers()
  open.value = true
  nextTick(updatePosition)
}

function scheduleOpen(): void {
  clearTimers()
  if (open.value) {
    nextTick(updatePosition)
    return
  }
  openTimer = setTimeout(() => {
    open.value = true
    nextTick(updatePosition)
  }, 60)
}

function scheduleClose(): void {
  clearTimers()
  closeTimer = setTimeout(() => {
    open.value = false
  }, 150)
}

function toggleClick(): void {
  clearTimers()
  open.value = !open.value
  if (open.value) nextTick(updatePosition)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    open.value = false
  }
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!open.value) return
  const target = event.target as Node | null
  if (!target) return
  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) return
  open.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updatePosition, { passive: true })
  window.addEventListener('scroll', updatePosition, { passive: true, capture: true })
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  clearTimers()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <span class="relative inline-flex shrink-0 items-center">
    <button
      ref="triggerRef"
      type="button"
      class="inline-flex size-5 items-center justify-center rounded-full border border-zinc-300 bg-[var(--surface)] text-xs font-bold text-zinc-500 transition-colors hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-emerald-950 dark:hover:text-emerald-300"
      :class="compact ? 'size-5' : 'size-6'"
      :aria-expanded="open"
      :aria-label="profile ? `查看${profile.singer.name}的详细实力评分` : '查看实力评分'"
      title="查看基于前两轮的详细实力评分"
      @mouseenter="scheduleOpen"
      @mouseleave="scheduleClose"
      @focus="showNow"
      @blur="scheduleClose"
      @click.stop="toggleClick"
    >
      ?
    </button>

    <Teleport to="body">
      <div
        v-if="open && profile && power"
        ref="panelRef"
        role="dialog"
        :aria-label="`${profile.singer.name}实力评分详情`"
        class="fixed z-50 rounded-xl border border-zinc-200 bg-[var(--surface)] p-3.5 text-left text-xs text-zinc-700 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        :style="panelStyle"
        @mouseenter="clearTimers"
        @mouseleave="scheduleClose"
        @click.stop
      >
        <div class="flex items-start justify-between gap-2 border-b border-zinc-100 pb-2.5 dark:border-zinc-800">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{{ profile.singer.name }}</span>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-bold"
                :class="tierBadgeClass"
              >
                {{ power.tier }} · {{ power.tierLabel }}
              </span>
            </div>
            <p class="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {{ profile.singer.className || '未填班级' }}
              <template v-if="power.powerRank">
                · 实力总榜第 {{ power.powerRank }} 名
              </template>
            </p>
          </div>
          <div class="shrink-0 text-right">
            <p class="text-xl font-black tabular-nums leading-none text-zinc-900 dark:text-zinc-50">
              {{ power.powerScore !== null ? power.powerScore.toFixed(2) : '—' }}
            </p>
            <p class="mt-0.5 text-xs text-zinc-400">
              综合实力 / 100
            </p>
          </div>
        </div>

        <div
          v-if="opponent && winRateForSelf !== null && prediction"
          class="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2 dark:border-emerald-900 dark:bg-emerald-950/30"
        >
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="font-semibold text-emerald-800 dark:text-emerald-200">
              <template v-if="pairNo">第 {{ pairNo }} 组 </template>1v1 预测胜率 vs {{ opponent.singer.name }}
            </span>
            <span class="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {{ winRateForSelf }}% : {{ 100 - winRateForSelf }}%
            </span>
          </div>
          <div class="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              class="h-full bg-emerald-600 transition-all"
              :style="{ width: `${winRateForSelf}%` }"
            />
          </div>
          <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {{ prediction.tag }} · {{ prediction.note }}
          </p>
        </div>

        <div class="mt-2.5 grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/70">
            <p class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>初赛实绩</span>
              <span v-if="power.prelimWeight > 0">权重 {{ Math.round(power.prelimWeight * 100) }}%</span>
            </p>
            <p class="mt-1 font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              <template v-if="power.prelim && power.prelim.average !== null">
                {{ power.prelim.average.toFixed(2) }} / {{ power.prelim.maxTotal }}
              </template>
              <template v-else>
                暂无成绩
              </template>
            </p>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              <template v-if="power.prelim && power.prelim.percentScore !== null">
                {{ power.prelim.percentScore.toFixed(1) }}% · 第 {{ power.prelim.rank ?? '—' }} 名（超越 {{ power.prelim.percentile?.toFixed(0) ?? '—' }}%）
              </template>
              <template v-else>
                未进入或未打分
              </template>
            </p>
          </div>
          <div class="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/70">
            <p class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>复赛实绩</span>
              <span v-if="power.semiWeight > 0">权重 {{ Math.round(power.semiWeight * 100) }}%</span>
            </p>
            <p class="mt-1 font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              <template v-if="power.semi && power.semi.average !== null">
                {{ power.semi.average.toFixed(2) }} / {{ power.semi.maxTotal }}
              </template>
              <template v-else>
                暂无成绩
              </template>
            </p>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              <template v-if="power.semi && power.semi.percentScore !== null">
                {{ power.semi.percentScore.toFixed(1) }}% · 第 {{ power.semi.rank ?? '—' }} 名（超越 {{ power.semi.percentile?.toFixed(0) ?? '—' }}%）
              </template>
              <template v-else>
                未进入或未打分
              </template>
            </p>
          </div>
        </div>

        <div
          v-if="factorRows.length > 0"
          class="mt-2.5 space-y-1.5"
        >
          <p class="font-semibold text-zinc-800 dark:text-zinc-200">
            四维算法评分拆解
          </p>
          <div
            v-for="row in factorRows"
            :key="row.key"
            class="space-y-0.5"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-zinc-700 dark:text-zinc-300">
                {{ row.label }}
                <span class="text-zinc-400">({{ row.weight }})</span>
              </span>
              <span class="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {{ row.value.toFixed(1) }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  class="h-full rounded-full bg-emerald-600"
                  :style="{ width: `${Math.min(100, Math.max(0, row.value))}%` }"
                />
              </div>
              <span class="shrink-0 text-xs text-zinc-400">
                {{ row.hint }}
              </span>
            </div>
          </div>
        </div>

        <div
          v-if="power.skillProfile.length > 0"
          class="mt-2.5 border-t border-zinc-100 pt-2 dark:border-zinc-800"
        >
          <div class="flex flex-wrap items-center justify-between gap-1 text-xs">
            <span class="font-semibold text-zinc-800 dark:text-zinc-200">声乐分项能力</span>
            <span
              v-if="power.topStrength"
              class="text-emerald-700 dark:text-emerald-300"
            >
              强项：{{ power.topStrength.label }} {{ power.topStrength.rate.toFixed(1) }}%
            </span>
          </div>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            <span
              v-for="axis in power.skillProfile"
              :key="axis.key"
              class="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs tabular-nums text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {{ axis.label }} {{ axis.rate.toFixed(0) }}%
            </span>
          </div>
        </div>

        <p class="mt-2 text-xs leading-5 text-zinc-400">
          {{ power.summaryNote }}
        </p>
      </div>
    </Teleport>
  </span>
</template>
