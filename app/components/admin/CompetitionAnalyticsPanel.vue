<script setup lang="ts">
import type {
  CompetitionAdminPayload,
  CompetitionRoundEntry,
  CompetitionRoundKey
} from '~~/shared/types'
import {
  computeCompetitionAnalytics,
  type SingerAnalyticsProfile
} from '~~/shared/utils/competition-analytics'
import { adminFetch } from '~~/app/utils/admin-request'
import { apiErrorMessage } from '~~/app/composables/useCompetitionRoster'

const props = defineProps<{
  payload: CompetitionAdminPayload
}>()

const emit = defineEmits<{
  'update:payload': [value: CompetitionAdminPayload]
  'refresh': []
}>()

const toast = useToast()

const report = computed(() => computeCompetitionAnalytics(props.payload))
const selectedSingerId = ref('')
const activeRoundStatKey = ref<CompetitionRoundKey>('semi')
const rankTab = ref<'power' | 'prelim' | 'semi' | 'final' | 'popularity'>('power')
const rankQuery = ref('')
const stageFilter = ref<'all' | 'final' | 'qualified' | 'pending' | 'forfeited'>('all')
const drawingDuel = ref(false)

const finalRound = computed(() => props.payload.rounds.find(round => round.key === 'final') ?? null)
const final2Round = computed(() => props.payload.rounds.find(round => round.key === 'final2') ?? null)

const canDrawDuel = computed(() => {
  const round = finalRound.value
  if (!round) return false
  return round.status !== 'closed'
    && !round.hasScores
    && round.rosterConfirmedAt === null
    && round.entries.length >= 2
})

const roundDistributionTabs = computed(() => {
  const keys: CompetitionRoundKey[] = ['prelim', 'semi', 'final', 'final2']
  return keys.map(key => report.value.roundStats[key])
})

const activeRoundStat = computed(() => report.value.roundStats[activeRoundStatKey.value])

const maxBucketCount = computed(() =>
  Math.max(1, ...activeRoundStat.value.buckets.map(item => item.count)))

// 初始化默认激活轮次统计（若复赛暂无数据则默认看初赛）
watch(
  () => ({
    semi: report.value.roundStats.semi.scoredCount,
    prelim: report.value.roundStats.prelim.scoredCount
  }),
  ({ semi, prelim }) => {
    if (semi === 0 && prelim > 0 && activeRoundStatKey.value === 'semi') {
      activeRoundStatKey.value = 'prelim'
    }
  },
  { immediate: true }
)

const filteredLeaderboard = computed<SingerAnalyticsProfile[]>(() => {
  const keyword = rankQuery.value.trim().toLowerCase()
  const baseList = report.value.profiles.filter((profile) => {
    if (stageFilter.value === 'final' && !profile.inFinal) return false
    if (stageFilter.value === 'qualified') {
      const qual = profile.rounds.prelim?.qualified || profile.rounds.semi?.qualified || profile.rounds.final?.qualified
      if (!qual) return false
    }
    if (stageFilter.value === 'pending') {
      const pending = Object.values(profile.rounds).some(snap => snap && !snap.checkedIn)
      if (!pending) return false
    }
    if (stageFilter.value === 'forfeited') {
      const forfeited = Object.values(profile.rounds).some(snap => snap?.forfeited)
      if (!forfeited) return false
    }
    if (!keyword) return true
    const haystack = [
      profile.singer.name,
      profile.singer.className ?? '',
      profile.singer.studentNo ?? '',
      profile.singer.song,
      profile.finalSongs?.firstSong ?? '',
      profile.finalSongs?.secondSong ?? ''
    ].join(' ').toLowerCase()
    return haystack.includes(keyword)
  })

  const sorted = baseList.slice()
  if (rankTab.value === 'prelim') {
    sorted.sort((left, right) => {
      const a = left.rounds.prelim?.average ?? -1
      const b = right.rounds.prelim?.average ?? -1
      return (b - a) || ((left.rounds.prelim?.rank ?? 9999) - (right.rounds.prelim?.rank ?? 9999))
    })
  } else if (rankTab.value === 'semi') {
    sorted.sort((left, right) => {
      const a = left.rounds.semi?.average ?? -1
      const b = right.rounds.semi?.average ?? -1
      return (b - a) || ((left.rounds.semi?.rank ?? 9999) - (right.rounds.semi?.rank ?? 9999))
    })
  } else if (rankTab.value === 'final') {
    sorted.sort((left, right) => {
      // 决赛总榜：优先进第二轮按 final2 排名，其次第一轮
      const l2 = left.inFinal2 ? 1 : 0
      const r2 = right.inFinal2 ? 1 : 0
      if (l2 !== r2) return r2 - l2
      if (l2 === 1) {
        const a2 = left.rounds.final2?.average ?? -1
        const b2 = right.rounds.final2?.average ?? -1
        if (a2 !== b2) return b2 - a2
      }
      const a1 = left.rounds.final?.average ?? -1
      const b1 = right.rounds.final?.average ?? -1
      return b1 - a1
    })
  } else if (rankTab.value === 'popularity') {
    sorted.sort((left, right) =>
      (right.popularityVotes - left.popularityVotes)
      || ((right.power.powerScore ?? -1) - (left.power.powerScore ?? -1)))
  }
  return sorted
})

watch(
  filteredLeaderboard,
  (list) => {
    if (!selectedSingerId.value || !report.value.profilesById[selectedSingerId.value]) {
      selectedSingerId.value = list[0]?.singer.id ?? report.value.profiles[0]?.singer.id ?? ''
    }
  },
  { immediate: true }
)

const selectedProfile = computed<SingerAnalyticsProfile | null>(() =>
  selectedSingerId.value ? (report.value.profilesById[selectedSingerId.value] ?? null) : null)

const duelPairsView = computed(() => {
  const round = finalRound.value
  if (!round || round.duelPairs.length === 0) return []
  return round.duelPairs.map((pair) => {
    const leftEntry = pair.entries[0] ?? null
    const rightEntry = pair.entries[1] ?? null
    const leftProfile = leftEntry ? (report.value.profilesById[leftEntry.singer.id] ?? null) : null
    const rightProfile = rightEntry ? (report.value.profilesById[rightEntry.singer.id] ?? null) : null
    const prediction = report.value.duelPredictions[pair.pairNo] ?? null
    return {
      pair,
      leftEntry,
      rightEntry,
      leftProfile,
      rightProfile,
      prediction
    }
  })
})

function duelEntrySong(entry: CompetitionRoundEntry | null): string {
  if (!entry) return '—'
  if (entry.finalSongs?.firstSong?.trim()) return entry.finalSongs.firstSong.trim()
  return (entry.song ?? entry.singer.song ?? '').trim() || '未填曲目'
}

function tierBadgeClass(tier: string): string {
  switch (tier) {
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
}

function selectSinger(singerId: string): void {
  selectedSingerId.value = singerId
}

async function enableDuelAndDraw(): Promise<void> {
  const round = finalRound.value
  if (!round || drawingDuel.value) return
  drawingDuel.value = true
  try {
    if (round.advanceMode !== 'duel') {
      const updated = await adminFetch<CompetitionAdminPayload>(
        '/api/admin/competition/rounds/final',
        { method: 'PUT', body: { advanceMode: 'duel' } }
      )
      emit('update:payload', updated)
    }
    const result = await adminFetch<{ payload: CompetitionAdminPayload }>(
      '/api/admin/competition/rounds/final/pairs',
      { method: 'POST', body: { action: 'draw' } }
    )
    emit('update:payload', result.payload)
    toast.add({ title: '决赛 1v1 分组已抽签生成', color: 'success' })
  } catch (error) {
    toast.add({
      title: '无法生成 1v1 分组',
      description: apiErrorMessage(error, '请确认决赛已生成名单且尚未产生评分。'),
      color: 'warning'
    })
  } finally {
    drawingDuel.value = false
  }
}

function displayScoreForTab(profile: SingerAnalyticsProfile): string {
  if (rankTab.value === 'prelim') {
    const s = profile.rounds.prelim
    return s?.average != null ? `${s.average.toFixed(2)} / ${s.maxTotal}` : '—'
  }
  if (rankTab.value === 'semi') {
    const s = profile.rounds.semi
    return s?.average != null ? `${s.average.toFixed(2)} / ${s.maxTotal}` : '—'
  }
  if (rankTab.value === 'final') {
    const s2 = profile.rounds.final2
    if (s2?.average != null) return `二轮 ${s2.average.toFixed(2)}`
    const s1 = profile.rounds.final
    return s1?.average != null ? `一轮 ${s1.average.toFixed(2)}` : '—'
  }
  if (rankTab.value === 'popularity') {
    return `${profile.popularityVotes} 票`
  }
  return profile.power.powerScore !== null ? profile.power.powerScore.toFixed(2) : '—'
}
</script>

<template>
  <div class="space-y-5">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          参赛选手总库
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
          {{ report.overview.singerTotal }}
        </p>
        <p class="mt-0.5 text-xs text-zinc-400">
          预报名 {{ report.overview.preRegTotal }} · 转正 {{ report.overview.preRegConverted }}
        </p>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          初赛完赛均分
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
          {{ report.roundStats.prelim.averageScore !== null ? report.roundStats.prelim.averageScore.toFixed(2) : '—' }}
          <span class="text-xs font-normal text-zinc-400">/ {{ report.roundStats.prelim.maxTotal }}</span>
        </p>
        <p class="mt-0.5 text-xs text-zinc-400">
          有分 {{ report.roundStats.prelim.scoredCount }} / {{ report.roundStats.prelim.entryCount }} 人
        </p>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          复赛完赛均分
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
          {{ report.roundStats.semi.averageScore !== null ? report.roundStats.semi.averageScore.toFixed(2) : '—' }}
          <span class="text-xs font-normal text-zinc-400">/ {{ report.roundStats.semi.maxTotal }}</span>
        </p>
        <p class="mt-0.5 text-xs text-zinc-400">
          有分 {{ report.roundStats.semi.scoredCount }} / {{ report.roundStats.semi.entryCount }} 人
        </p>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          高潜实力梯度
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
          {{ report.overview.aPlusOrAboveCount }}
          <span class="text-xs font-normal text-zinc-400">A+ 及以上</span>
        </p>
        <p class="mt-0.5 text-xs text-zinc-400">
          S 级 {{ report.overview.sTierCount }} 人 · 已建模 {{ report.overview.ratedCount }} 人
        </p>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          决赛筹备与对阵
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
          {{ report.overview.finalCount }}
          <span class="text-xs font-normal text-zinc-400">入围</span>
        </p>
        <p class="mt-0.5 text-xs text-zinc-400">
          两首歌 {{ report.overview.finalSongsCount }}/{{ report.overview.finalCount }} · 1v1 {{ report.overview.duelTotalCount }} 组
        </p>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          人气奖投票实况
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
          {{ report.overview.totalVotes }}
          <span class="text-xs font-normal text-zinc-400">票</span>
        </p>
        <p class="mt-0.5 truncate text-xs text-zinc-400">
          {{ report.overview.topPopularityName ? `榜首 ${report.overview.topPopularityName} (${report.overview.topPopularityVotes})` : '暂无投票数据' }}
        </p>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-12">
      <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 dark:border-zinc-800 dark:bg-zinc-900 xl:col-span-5">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              全赛程选手流转漏斗
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              从预报名到决赛第二轮的实时沉淀与晋级转化率
            </p>
          </div>
        </div>
        <div class="mt-3 space-y-2.5">
          <div
            v-for="stage in report.funnel"
            :key="stage.key"
            class="space-y-1 text-xs"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-zinc-700 dark:text-zinc-200">{{ stage.label }}</span>
              <span class="tabular-nums text-zinc-500 dark:text-zinc-400">
                <strong class="text-zinc-900 dark:text-zinc-100">{{ stage.count }}</strong> 人
                <span v-if="stage.key !== 'prereg'">· 转化 {{ stage.rateFromPrev.toFixed(0) }}%</span>
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                class="h-full rounded-full bg-emerald-600 transition-all"
                :style="{ width: `${stage.count > 0 ? Math.max(4, stage.rateFromStart) : 0}%` }"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 dark:border-zinc-800 dark:bg-zinc-900 xl:col-span-7">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              轮次分数段分布与评委尺度
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              百分制归一化分数直方图与各位评委给分偏差（满分 {{ activeRoundStat.maxTotal }}）
            </p>
          </div>
          <div class="flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
            <button
              v-for="tab in roundDistributionTabs"
              :key="tab.roundKey"
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              :class="activeRoundStatKey === tab.roundKey
                ? 'bg-zinc-900 text-white dark:bg-zinc-700'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
              @click="activeRoundStatKey = tab.roundKey"
            >
              {{ tab.roundTitle }}
            </button>
          </div>
        </div>

        <div class="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <div class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>成绩分布（{{ activeRoundStat.scoredCount }} 人有分）</span>
              <span
                v-if="activeRoundStat.highestScore !== null && activeRoundStat.lowestScore !== null"
                class="tabular-nums"
              >
                区间 {{ activeRoundStat.lowestScore.toFixed(1) }} ~ {{ activeRoundStat.highestScore.toFixed(1) }}
              </span>
            </div>
            <div class="mt-2 space-y-2">
              <div
                v-for="bucket in activeRoundStat.buckets"
                :key="bucket.label"
                class="flex items-center gap-2 text-xs"
              >
                <span class="w-16 shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">{{ bucket.label }}</span>
                <div class="h-3 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                  <div
                    class="h-full rounded bg-sky-500 transition-all"
                    :style="{ width: `${bucket.count > 0 ? Math.max(6, (bucket.count / maxBucketCount) * 100) : 0}%` }"
                  />
                </div>
                <span class="w-16 shrink-0 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {{ bucket.count }} 人
                </span>
              </div>
            </div>
          </div>

          <div>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              评委打分尺度对比（相对本轮均分）
            </p>
            <div
              v-if="activeRoundStat.judges.length === 0"
              class="mt-3 rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-800"
            >
              该轮次尚未生成评委账号。
            </div>
            <div
              v-else
              class="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1"
            >
              <div
                v-for="judge in activeRoundStat.judges"
                :key="judge.id"
                class="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs dark:bg-zinc-800/70"
              >
                <div class="min-w-0">
                  <span class="font-medium text-zinc-800 dark:text-zinc-200">{{ judge.displayName }}</span>
                  <span class="ml-1.5 text-zinc-400">已评 {{ judge.scoredCount }}</span>
                </div>
                <div class="flex shrink-0 items-center gap-2 tabular-nums">
                  <span class="font-semibold text-zinc-900 dark:text-zinc-100">
                    {{ judge.averageScore !== null ? judge.averageScore.toFixed(2) : '—' }}
                  </span>
                  <span
                    v-if="judge.biasFromRound !== null"
                    class="rounded px-1.5 py-0.5 text-xs"
                    :class="judge.biasFromRound >= 0
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'"
                  >
                    {{ judge.biasFromRound >= 0 ? '+' : '' }}{{ judge.biasFromRound.toFixed(2) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            决赛 1v1 对阵大盘与赛前实力预测
          </h2>
          <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            基于初赛（35%）与复赛（65%）的跨轮实力分模型；把鼠标移到每位选手右上角的 <strong>?</strong> 小问号可查看详细实力评分。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-if="canDrawDuel"
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-shuffle"
            :loading="drawingDuel"
            :label="duelPairsView.length > 0 ? '重新抽签 1v1' : (finalRound?.advanceMode === 'duel' ? '抽签 1v1 分组' : '切换 1v1 并抽签分组')"
            @click="enableDuelAndDraw"
          />
          <span
            v-if="final2Round && final2Round.entries.length > 0"
            class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          >
            第二轮已产生 {{ final2Round.entries.length }} 位选手
          </span>
        </div>
      </div>

      <div
        v-if="duelPairsView.length > 0"
        class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <div
          v-for="item in duelPairsView"
          :key="item.pair.pairNo"
          class="rounded-xl border p-3"
          :class="item.pair.ready ? 'border-emerald-200 dark:border-emerald-900' : 'border-zinc-200 dark:border-zinc-800'"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-zinc-700 dark:text-zinc-200">第 {{ item.pair.pairNo }} 组</span>
              <span
                v-if="item.prediction"
                class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {{ item.prediction.tag }}
              </span>
              <span
                v-if="item.prediction?.upset"
                class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              >
                爆冷逆袭
              </span>
            </div>
            <span
              v-if="item.pair.ready"
              class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              胜者：{{ item.pair.winnerName }}
            </span>
            <span
              v-else
              class="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
            >
              {{ item.pair.note || '待比赛' }}
            </span>
          </div>

          <div
            v-if="item.prediction && item.prediction.leftWinProb !== null && item.prediction.rightWinProb !== null"
            class="mt-2 space-y-1"
          >
            <div class="flex items-center justify-between text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              <span>预计胜率 {{ item.prediction.leftWinProb }}%</span>
              <span>{{ item.prediction.rightWinProb }}%</span>
            </div>
            <div class="flex h-1.5 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950">
              <div
                class="h-full bg-emerald-600"
                :style="{ width: `${item.prediction.leftWinProb}%` }"
              />
            </div>
          </div>

          <div class="mt-2.5 grid grid-cols-2 gap-2">
            <div
              v-for="(slotData, idx) in [
                { entry: item.leftEntry, profile: item.leftProfile, opponent: item.rightProfile, side: 'left' as const },
                { entry: item.rightEntry, profile: item.rightProfile, opponent: item.leftProfile, side: 'right' as const }
              ]"
              :key="slotData.entry?.id ?? idx"
              class="relative cursor-pointer rounded-lg border p-2.5 transition-colors"
              :class="[
                slotData.entry && slotData.entry.id === item.pair.winnerEntryId
                  ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30'
                  : 'border-zinc-200 bg-zinc-50/60 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-800/40',
                slotData.entry && selectedSingerId === slotData.entry.singer.id ? 'ring-2 ring-emerald-500' : ''
              ]"
              @click="slotData.entry && selectSinger(slotData.entry.singer.id)"
            >
              <div class="absolute right-2 top-2">
                <AdminCompetitionPowerPopover
                  :profile="slotData.profile"
                  :opponent="slotData.opponent"
                  :prediction="item.prediction"
                  :side="slotData.side"
                  :pair-no="item.pair.pairNo"
                  compact
                />
              </div>

              <template v-if="slotData.entry">
                <div class="flex items-center gap-2 pr-6">
                  <img
                    v-if="slotData.entry.singer.photoUrl"
                    :src="slotData.entry.singer.photoUrl"
                    :alt="slotData.entry.singer.name"
                    class="size-8 shrink-0 rounded-lg object-cover"
                  >
                  <div
                    v-else
                    class="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-200 text-xs font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                  >
                    {{ slotData.entry.singer.name.slice(0, 1) }}
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      {{ slotData.entry.singer.name }}
                    </p>
                    <p class="truncate text-xs text-zinc-400">
                      {{ slotData.entry.sortOrder > 0 ? `#${slotData.entry.sortOrder}` : '待排序' }}
                    </p>
                  </div>
                </div>
                <p class="mt-1.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  《{{ duelEntrySong(slotData.entry) }}》
                </p>
                <div class="mt-2 flex items-center justify-between gap-1 text-xs">
                  <span
                    class="rounded px-1.5 py-0.5 font-semibold tabular-nums"
                    :class="tierBadgeClass(slotData.profile?.power.tier ?? '—')"
                  >
                    {{ slotData.profile?.power.tier ?? '—' }} · {{ slotData.profile?.power.powerScore !== null && slotData.profile?.power.powerScore !== undefined ? slotData.profile.power.powerScore.toFixed(1) : '—' }}
                  </span>
                  <span class="tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">
                    {{ slotData.entry.average !== null ? slotData.entry.average.toFixed(2) : '未评' }}
                  </span>
                </div>
              </template>
              <p
                v-else
                class="py-4 text-center text-xs text-zinc-400"
              >
                轮空
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="finalRound && finalRound.entries.length > 0"
        class="mt-4 space-y-3"
      >
        <p class="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300">
          决赛目前尚未完成 1v1 抽签分组（当前模式：{{ finalRound.advanceMode === 'duel' ? '抽签 1v1' : '整轮前六晋级' }}）。以下为决赛入围选手实力卡，右上角 <strong>?</strong> 同样可悬浮查看前两轮详细实力拆解。
        </p>
        <div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="entry in finalRound.entries"
            :key="entry.id"
            class="relative cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-800/40"
            :class="selectedSingerId === entry.singer.id ? 'ring-2 ring-emerald-500' : ''"
            @click="selectSinger(entry.singer.id)"
          >
            <div class="absolute right-2 top-2">
              <AdminCompetitionPowerPopover
                :profile="report.profilesById[entry.singer.id]"
                compact
              />
            </div>
            <p class="pr-6 text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {{ entry.singer.name }}
            </p>
            <p class="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              《{{ duelEntrySong(entry) }}》
            </p>
            <div class="mt-2 flex items-center justify-between text-xs tabular-nums">
              <span
                class="rounded px-1.5 py-0.5 font-semibold"
                :class="tierBadgeClass(report.profilesById[entry.singer.id]?.power.tier ?? '—')"
              >
                实力 {{ report.profilesById[entry.singer.id]?.power.powerScore?.toFixed(1) ?? '—' }}
              </span>
              <span class="text-zinc-500 dark:text-zinc-400">
                决赛分：{{ entry.average !== null ? entry.average.toFixed(2) : '未评' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else
        class="mt-4 rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-400 dark:border-zinc-800"
      >
        尚未生成决赛参赛名单，待复赛结束并确认晋级名单后，即可在此进行决赛 1v1 分组与实力对位预测。
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-12">
      <div class="rounded-xl border border-zinc-200 bg-[var(--surface)] p-4 dark:border-zinc-800 dark:bg-zinc-900 xl:col-span-7">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              选手状况与评分排行榜
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              点击任意行可查看单选手档案；移入 <strong>?</strong> 查看前两轮实力拆解
            </p>
          </div>
          <div class="flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
            <button
              v-for="tab in [
                { key: 'power' as const, label: '综合实力榜' },
                { key: 'prelim' as const, label: '初赛榜' },
                { key: 'semi' as const, label: '复赛榜' },
                { key: 'final' as const, label: '决赛榜' },
                { key: 'popularity' as const, label: '人气榜' }
              ]"
              :key="tab.key"
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              :class="rankTab === tab.key
                ? 'bg-zinc-900 text-white dark:bg-zinc-700'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
              @click="rankTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <UInput
            v-model="rankQuery"
            placeholder="搜姓名 / 班级 / 学号 / 曲目"
            icon="i-lucide-search"
            size="sm"
            class="w-full sm:w-64"
          />
          <div class="flex flex-wrap gap-1">
            <button
              v-for="chip in [
                { key: 'all' as const, label: '全部' },
                { key: 'final' as const, label: '决赛入围' },
                { key: 'qualified' as const, label: '已晋级' },
                { key: 'pending' as const, label: '未签到' },
                { key: 'forfeited' as const, label: '弃权' }
              ]"
              :key="chip.key"
              type="button"
              class="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
              :class="stageFilter === chip.key
                ? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'"
              @click="stageFilter = chip.key"
            >
              {{ chip.label }}
            </button>
          </div>
        </div>

        <div
          v-if="filteredLeaderboard.length === 0"
          class="mt-4 rounded-lg border border-dashed border-zinc-200 py-10 text-center text-xs text-zinc-400 dark:border-zinc-800"
        >
          没有符合条件的选手。
        </div>

        <div
          v-else
          class="mt-3 max-h-96 overflow-auto rounded-lg border border-zinc-100 dark:border-zinc-800"
        >
          <table class="w-full text-left text-xs">
            <thead class="sticky top-0 z-10 bg-zinc-50 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
              <tr>
                <th class="w-12 px-2.5 py-2 font-medium">
                  #
                </th>
                <th class="px-2.5 py-2 font-medium">
                  选手 / 曲目
                </th>
                <th class="px-2.5 py-2 font-medium">
                  初 / 复赛
                </th>
                <th class="px-2.5 py-2 font-medium">
                  状态
                </th>
                <th class="px-2.5 py-2 text-right font-medium">
                  {{ rankTab === 'power' ? '综合实力' : '榜单分值' }}
                </th>
                <th class="w-10 px-2 py-2 text-center font-medium">
                  详情
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
              <tr
                v-for="(profile, index) in filteredLeaderboard"
                :key="profile.singer.id"
                class="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                :class="selectedSingerId === profile.singer.id ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : ''"
                @click="selectSinger(profile.singer.id)"
              >
                <td class="px-2.5 py-2 font-bold tabular-nums text-zinc-700 dark:text-zinc-200">
                  {{ index + 1 }}
                </td>
                <td class="px-2.5 py-2">
                  <p class="font-semibold text-zinc-900 dark:text-zinc-100">
                    {{ profile.singer.name }}
                    <span class="ml-1 font-normal text-zinc-400">{{ profile.singer.className || '' }}</span>
                  </p>
                  <p class="truncate text-zinc-500 dark:text-zinc-400">
                    《{{ profile.singer.song }}》
                  </p>
                </td>
                <td class="px-2.5 py-2 tabular-nums text-zinc-600 dark:text-zinc-300">
                  <span>{{ profile.rounds.prelim?.percentScore != null ? `${profile.rounds.prelim.percentScore.toFixed(0)}%` : '—' }}</span>
                  <span class="mx-1 text-zinc-400">/</span>
                  <span>{{ profile.rounds.semi?.percentScore != null ? `${profile.rounds.semi.percentScore.toFixed(0)}%` : '—' }}</span>
                </td>
                <td class="px-2.5 py-2">
                  <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {{ profile.currentStageLabel }}
                  </span>
                </td>
                <td class="px-2.5 py-2 text-right tabular-nums">
                  <div class="inline-flex items-center gap-1.5">
                    <span
                      v-if="profile.power.hasRating"
                      class="rounded px-1.5 py-0.5 font-bold"
                      :class="tierBadgeClass(profile.power.tier)"
                    >
                      {{ profile.power.tier }}
                    </span>
                    <span class="font-bold text-zinc-900 dark:text-zinc-100">
                      {{ displayScoreForTab(profile) }}
                    </span>
                  </div>
                </td>
                <td
                  class="px-2 py-2 text-center"
                  @click.stop
                >
                  <AdminCompetitionPowerPopover
                    :profile="profile"
                    compact
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="xl:col-span-5">
        <AdminCompetitionSingerDetailCard :profile="selectedProfile" />
      </div>
    </div>
  </div>
</template>
