<script setup lang="ts">
import type { CompetitionRoundKey } from '~~/shared/types'
import type { SingerAnalyticsProfile } from '~~/shared/utils/competition-analytics'

const props = defineProps<{
  profile: SingerAnalyticsProfile | null
}>()

const expandedRoundKey = ref<CompetitionRoundKey | null>(null)

watch(() => props.profile?.singer.id, () => {
  expandedRoundKey.value = null
})

const ROUND_ORDER: Array<{ key: CompetitionRoundKey, label: string }> = [
  { key: 'prelim', label: '初赛' },
  { key: 'semi', label: '复赛' },
  { key: 'final', label: '决赛第一轮' },
  { key: 'final2', label: '决赛第二轮' }
]

const tierBadgeClass = computed(() => {
  switch (props.profile?.power.tier) {
    case 'S':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
    case 'A+':
    case 'A':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
    case 'B+':
    case 'B':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
    default:
      return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
  }
})

const sourceLabel = computed(() => {
  const src = props.profile?.singer.source
  if (src === 'form') return '现场登记'
  if (src === 'pre') return '预报名转正'
  return '后台录入'
})

// 原生 SVG 声乐能力雷达图（viewBox="0 0 280 230"，中心 (140, 115)，半径 74）
const RADAR_CX = 140
const RADAR_CY = 115
const RADAR_R = 72
const RADAR_LEVELS = [0.25, 0.5, 0.75, 1]

const skillAxes = computed(() => props.profile?.power.skillProfile ?? [])
const hasRadar = computed(() => skillAxes.value.length >= 3)

function radarPoint(index: number, total: number, ratio: number): { x: number, y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total
  const clamped = Math.min(1, Math.max(0, ratio))
  return {
    x: RADAR_CX + Math.cos(angle) * RADAR_R * clamped,
    y: RADAR_CY + Math.sin(angle) * RADAR_R * clamped
  }
}

function polygonPoints(ratios: number[]): string {
  const total = ratios.length
  if (total < 3) return ''
  return ratios
    .map((ratio, index) => {
      const pt = radarPoint(index, total, ratio)
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
    })
    .join(' ')
}

const radarGridRings = computed(() => {
  const count = skillAxes.value.length
  if (count < 3) return []
  return RADAR_LEVELS.map(level => polygonPoints(Array.from({ length: count }, () => level)))
})

const radarAxisLines = computed(() => {
  const axes = skillAxes.value
  const count = axes.length
  if (count < 3) return []
  return axes.map((axis, index) => {
    const end = radarPoint(index, count, 1)
    const labelPt = radarPoint(index, count, 1.24)
    const anchor = labelPt.x < RADAR_CX - 12
      ? 'end'
      : (labelPt.x > RADAR_CX + 12 ? 'start' : 'middle')
    return {
      key: axis.key,
      label: axis.label,
      rate: axis.rate,
      x2: end.x.toFixed(1),
      y2: end.y.toFixed(1),
      lx: labelPt.x.toFixed(1),
      ly: labelPt.y.toFixed(1),
      anchor
    }
  })
})

const singerRadarPolygon = computed(() =>
  polygonPoints(skillAxes.value.map(axis => axis.rate / 100)))

const fieldRadarPolygon = computed(() =>
  polygonPoints(skillAxes.value.map(axis => axis.fieldAverage / 100)))

const singerRadarDots = computed(() => {
  const count = skillAxes.value.length
  if (count < 3) return []
  return skillAxes.value.map((axis, index) => {
    const pt = radarPoint(index, count, axis.rate / 100)
    return { key: axis.key, x: pt.x.toFixed(1), y: pt.y.toFixed(1), rate: axis.rate }
  })
})

const timelineRounds = computed(() => {
  const p = props.profile
  if (!p) return []
  return ROUND_ORDER.map((item) => {
    const snap = p.rounds[item.key]
    return {
      ...item,
      snap
    }
  })
})

function toggleRoundDetail(key: CompetitionRoundKey): void {
  expandedRoundKey.value = expandedRoundKey.value === key ? null : key
}
</script>

<template>
  <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
    <div
      v-if="!profile"
      class="grid min-h-72 place-items-center text-center text-sm text-zinc-400"
    >
      在左侧排行榜点击任意选手，可查看单选手档案、声乐雷达图与各轮评委评分轨迹。
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
        <div class="flex min-w-0 items-center gap-3">
          <img
            v-if="profile.singer.photoUrl"
            :src="profile.singer.photoUrl"
            :alt="profile.singer.name"
            class="size-14 shrink-0 rounded-xl border border-zinc-200 object-cover dark:border-zinc-700"
          >
          <div
            v-else
            class="grid size-14 shrink-0 place-items-center rounded-xl bg-emerald-100 text-lg font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          >
            {{ profile.singer.name.slice(0, 1) }}
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="truncate text-base font-bold text-zinc-900 dark:text-zinc-100">
                {{ profile.singer.name }}
              </h3>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-bold"
                :class="tierBadgeClass"
              >
                {{ profile.power.tier }} · {{ profile.power.tierLabel }}
              </span>
              <span class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {{ profile.currentStageLabel }}
              </span>
            </div>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {{ profile.singer.className || '未填班级' }}
              <template v-if="profile.singer.studentNo">
                · 学号 {{ profile.singer.studentNo }}
              </template>
              · {{ sourceLabel }}
            </p>
            <p class="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
              主报曲目：《{{ profile.singer.song }}》
              <template v-if="profile.finalSongs?.secondSong">
                · 决赛二轮：《{{ profile.finalSongs.secondSong }}》
              </template>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <div class="text-right">
            <p class="text-2xl font-black tabular-nums leading-none text-zinc-900 dark:text-zinc-50">
              {{ profile.power.powerScore !== null ? profile.power.powerScore.toFixed(2) : '—' }}
            </p>
            <p class="mt-1 text-xs text-zinc-400">
              <template v-if="profile.power.powerRank">
                实力总榜 #{{ profile.power.powerRank }}
              </template>
              <template v-else>
                暂无实力分
              </template>
            </p>
          </div>
          <AdminCompetitionPowerPopover :profile="profile" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div class="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-800/60">
          <p class="text-xs text-zinc-400">
            QQ / 手机
          </p>
          <p class="mt-0.5 truncate text-xs font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {{ profile.singer.qq || profile.singer.phone || '—' }}
          </p>
        </div>
        <div class="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-800/60">
          <p class="text-xs text-zinc-400">
            决赛 1v1 分组
          </p>
          <p class="mt-0.5 truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
            <template v-if="profile.finalPairNo">
              第 {{ profile.finalPairNo }} 组 vs {{ profile.finalOpponentName || '轮空' }}
            </template>
            <template v-else>
              {{ profile.inFinal ? '待抽签分组' : '未入决赛' }}
            </template>
          </p>
        </div>
        <div class="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-800/60">
          <p class="text-xs text-zinc-400">
            人气投票
          </p>
          <p class="mt-0.5 truncate text-xs font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {{ profile.popularityVotes }} 票
            <template v-if="profile.popularityRank">
              (#{{ profile.popularityRank }})
            </template>
          </p>
        </div>
        <div class="rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-800/60">
          <p class="text-xs text-zinc-400">
            复赛变化
          </p>
          <p
            class="mt-0.5 truncate text-xs font-semibold tabular-nums"
            :class="profile.power.deltaPercent === null
              ? 'text-zinc-500'
              : (profile.power.deltaPercent >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')"
          >
            <template v-if="profile.power.deltaPercent !== null">
              {{ profile.power.deltaPercent >= 0 ? '+' : '' }}{{ profile.power.deltaPercent.toFixed(1) }}%
            </template>
            <template v-else>
              —
            </template>
          </p>
        </div>
      </div>

      <div class="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="text-xs font-bold text-zinc-800 dark:text-zinc-200">
            声乐能力多维画像（对比全场均线）
          </h4>
          <div class="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span class="inline-flex items-center gap-1">
              <span class="inline-block size-2 rounded-full bg-emerald-600" />
              选手得分率
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="inline-block size-2 rounded-full bg-zinc-400" />
              全场均值
            </span>
          </div>
        </div>

        <div
          v-if="skillAxes.length === 0"
          class="py-6 text-center text-xs text-zinc-400"
        >
          暂无前两轮分维度评分，尚不能绘制声乐画像。
        </div>

        <div
          v-else-if="hasRadar"
          class="mt-2 grid items-center gap-3 sm:grid-cols-2"
        >
          <svg
            viewBox="-24 0 328 230"
            class="mx-auto w-full max-w-xs text-zinc-300 dark:text-zinc-600"
            role="img"
            :aria-label="`${profile.singer.name} 声乐能力雷达图`"
          >
            <polygon
              v-for="(ring, idx) in radarGridRings"
              :key="idx"
              :points="ring"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
            />
            <line
              v-for="axis in radarAxisLines"
              :key="axis.key"
              :x1="RADAR_CX"
              :y1="RADAR_CY"
              :x2="axis.x2"
              :y2="axis.y2"
              stroke="currentColor"
              stroke-width="1"
            />
            <polygon
              :points="fieldRadarPolygon"
              fill="rgba(161, 161, 170, 0.14)"
              stroke="#a1a1aa"
              stroke-width="1.5"
              stroke-dasharray="4 3"
            />
            <polygon
              :points="singerRadarPolygon"
              fill="rgba(5, 150, 105, 0.22)"
              stroke="#059669"
              stroke-width="2"
            />
            <circle
              v-for="dot in singerRadarDots"
              :key="dot.key"
              :cx="dot.x"
              :cy="dot.y"
              r="3.2"
              fill="#059669"
            />
            <text
              v-for="axis in radarAxisLines"
              :key="`lbl-${axis.key}`"
              :x="axis.lx"
              :y="axis.ly"
              :text-anchor="axis.anchor"
              dominant-baseline="middle"
              fill="currentColor"
              class="text-xs font-medium text-zinc-600 dark:text-zinc-300"
            >
              {{ axis.label }} {{ axis.rate.toFixed(0) }}%
            </text>
          </svg>

          <div class="space-y-2">
            <div
              v-for="axis in skillAxes"
              :key="axis.key"
              class="space-y-1 text-xs"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-zinc-700 dark:text-zinc-300">{{ axis.label }}</span>
                <span class="tabular-nums text-zinc-900 dark:text-zinc-100">
                  <strong>{{ axis.rate.toFixed(1) }}%</strong>
                  <span class="ml-1 text-zinc-400">/ 均 {{ axis.fieldAverage.toFixed(1) }}%</span>
                </span>
              </div>
              <div class="relative h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  class="h-full rounded-full bg-emerald-600"
                  :style="{ width: `${Math.min(100, Math.max(0, axis.rate))}%` }"
                />
              </div>
            </div>
            <p
              v-if="profile.power.topStrength || profile.power.weakSpot"
              class="pt-1 text-xs text-zinc-500 dark:text-zinc-400"
            >
              <template v-if="profile.power.topStrength">
                优势项：<span class="font-semibold text-emerald-700 dark:text-emerald-300">{{ profile.power.topStrength.label }}</span>
              </template>
              <template v-if="profile.power.topStrength && profile.power.weakSpot">
                ·
              </template>
              <template v-if="profile.power.weakSpot">
                可提升：<span class="font-semibold text-amber-700 dark:text-amber-300">{{ profile.power.weakSpot.label }}</span>
              </template>
            </p>
          </div>
        </div>

        <div
          v-else
          class="mt-2 space-y-2"
        >
          <div
            v-for="axis in skillAxes"
            :key="axis.key"
            class="space-y-1 text-xs"
          >
            <div class="flex items-center justify-between">
              <span>{{ axis.label }}</span>
              <span class="font-semibold tabular-nums">{{ axis.rate.toFixed(1) }}%（均线 {{ axis.fieldAverage.toFixed(1) }}%）</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                class="h-full rounded-full bg-emerald-600"
                :style="{ width: `${Math.min(100, Math.max(0, axis.rate))}%` }"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <h4 class="text-xs font-bold text-zinc-800 dark:text-zinc-200">
          全赛程轨迹与评委打分明细
        </h4>
        <div class="space-y-2">
          <div
            v-for="item in timelineRounds"
            :key="item.key"
            class="rounded-lg border border-zinc-100 p-2.5 dark:border-zinc-800"
          >
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-bold text-zinc-900 dark:text-zinc-100">{{ item.label }}</span>
                <template v-if="item.snap">
                  <span class="text-zinc-500 dark:text-zinc-400">
                    《{{ item.snap.song || '未填曲目' }}》
                  </span>
                  <span
                    v-if="item.snap.qualified"
                    class="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  >
                    晋级
                  </span>
                  <span
                    v-else-if="item.snap.forfeited"
                    class="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
                  >
                    弃权
                  </span>
                </template>
                <span
                  v-else
                  class="text-zinc-400"
                >
                  未进入本轮
                </span>
              </div>

              <div
                v-if="item.snap"
                class="flex items-center gap-2"
              >
                <span class="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {{ item.snap.average !== null ? `${item.snap.average.toFixed(2)} / ${item.snap.maxTotal}` : '未评分' }}
                </span>
                <span
                  v-if="item.snap.rank !== null"
                  class="rounded bg-zinc-100 px-1.5 py-0.5 tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  #{{ item.snap.rank }}
                </span>
                <button
                  v-if="item.snap.judgeScores.length > 0"
                  type="button"
                  class="rounded px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"
                  @click="toggleRoundDetail(item.key)"
                >
                  {{ expandedRoundKey === item.key ? '收起' : `${item.snap.judgeScores.length} 评委明细` }}
                </button>
              </div>
            </div>

            <div
              v-if="item.snap && expandedRoundKey === item.key && item.snap.judgeScores.length > 0"
              class="mt-2 space-y-1.5 border-t border-zinc-100 pt-2 dark:border-zinc-800"
            >
              <div
                v-for="score in item.snap.judgeScores"
                :key="score.id"
                class="rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs dark:bg-zinc-800/70"
              >
                <div class="flex items-center justify-between font-medium text-zinc-800 dark:text-zinc-200">
                  <span>{{ score.judgeName }}</span>
                  <span class="font-bold tabular-nums">{{ score.total.toFixed(2) }} / {{ item.snap.maxTotal }}</span>
                </div>
                <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <span
                    v-for="dim in score.dimensions"
                    :key="dim.key"
                  >
                    {{ dim.label }}: <strong class="text-zinc-700 dark:text-zinc-200">{{ dim.score }}</strong>
                  </span>
                </div>
                <p
                  v-if="score.comment"
                  class="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
                >
                  备注：{{ score.comment }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
