<script setup lang="ts">
import type {
  CompetitionPopularityAuditReport,
  CompetitionPopularityInspectionItem,
  CompetitionPopularityVoteLogItem
} from '~~/shared/types'
import { adminFetch } from '~~/app/utils/admin-request'
import { apiErrorMessage } from '~~/app/composables/useCompetitionRoster'

const props = defineProps<{
  updatedAt?: number
  candidatesCount?: number
}>()

const emit = defineEmits<{ refresh: [] }>()
const toast = useToast()

type SubTab = 'estimate' | 'charts' | 'logs'
const activeTab = ref<SubTab>('estimate')
const loading = ref(false)
const loadError = ref('')
const report = ref<CompetitionPopularityAuditReport | null>(null)

const logFilter = ref<'all' | 'quarantined' | 'suspect' | 'watch' | 'voided' | 'blocked'>('all')
const logSingerId = ref('')
const logQuery = ref('')
const selectedBallotIds = ref<string[]>([])
const moderating = ref(false)
const inspecting = ref(false)

let pollTimer: ReturnType<typeof setTimeout> | null = null

const singerOptions = computed(() => {
  const list = report.value?.singerEstimates ?? []
  return list.map(item => ({
    label: `${item.number}号 ${item.name}（有效 ${item.validVotes} / 冻结 ${item.quarantinedVotes} / 净估 ${item.estimatedRealVotes}）`,
    value: item.singerId
  }))
})

const maxEstimateVotes = computed(() => {
  const list = report.value?.singerEstimates ?? []
  return Math.max(1, ...list.map(item => item.validVotes + item.quarantinedVotes + item.voidedVotes))
})

const maxTimelineCount = computed(() => {
  const list = report.value?.timeline ?? []
  return Math.max(1, ...list.map(item => item.totalCount))
})

const maxDwellCount = computed(() => {
  const list = report.value?.dwellDistribution ?? []
  return Math.max(1, ...list.map(item => item.count))
})

const maxUaCount = computed(() => {
  const list = report.value?.uaDistribution ?? []
  return Math.max(1, ...list.map(item => item.count))
})

const selectedSet = computed(() => new Set(selectedBallotIds.value))

const selectableBallotIds = computed(() => {
  const ids = (report.value?.logs ?? [])
    .map(log => log.ballotId)
    .filter((id): id is string => Boolean(id))
  return Array.from(new Set(ids))
})

function clearPollTimer(): void {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false })
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

function verdictLabel(verdict: CompetitionPopularityInspectionItem['verdict']): string {
  if (verdict === 'suspect') return '疑似刷票'
  if (verdict === 'watch') return '需关注'
  return '正常'
}

function verdictClass(verdict: CompetitionPopularityInspectionItem['verdict']): string {
  if (verdict === 'suspect') return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
  if (verdict === 'watch') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
}

function modeLabel(mode: CompetitionPopularityInspectionItem['mode']): string {
  if (mode === 'auto-batch') return '自动微批'
  if (mode === 'singer-focus') return '选手专项'
  if (mode === 'single-log') return '单票上下文'
  return '手动批次'
}

function clusterKindLabel(kind: 'ip' | 'env' | 'qr' | 'fp'): string {
  if (kind === 'ip') return '同 IP'
  if (kind === 'env') return '同硬件环境'
  if (kind === 'fp') return '同浏览器指纹'
  return '同码段'
}

function rowRiskClass(log: CompetitionPopularityVoteLogItem): string {
  if (log.action === 'blocked') return 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
  if (log.ballotVoided) return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
  if (log.ballotQuarantined) return 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
  if (log.riskLevel === 'suspect') return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
  if (log.riskLevel === 'watch') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
}

function rowRiskText(log: CompetitionPopularityVoteLogItem): string {
  if (log.action === 'blocked') return '已拦截'
  if (log.ballotVoided) return '已作废'
  if (log.ballotQuarantined) return `冻结 ${log.effectiveScore}`
  if (log.riskLevel === 'suspect') return `高危 ${log.effectiveScore}`
  if (log.riskLevel === 'watch') return `观察 ${log.effectiveScore}`
  return `正常 ${log.effectiveScore}`
}

async function loadAudit(silent = false): Promise<void> {
  if (!silent) loading.value = true
  loadError.value = ''
  try {
    const query = new URLSearchParams()
    if (logFilter.value !== 'all') query.set('filter', logFilter.value)
    if (logSingerId.value) query.set('singerId', logSingerId.value)
    if (logQuery.value.trim()) query.set('q', logQuery.value.trim())
    query.set('limit', '150')
    const data = await adminFetch<{ report: CompetitionPopularityAuditReport }>(
      `/api/admin/competition/popularity/audit?${query.toString()}`
    )
    report.value = data.report
    if (data.report.inspectionJob?.state === 'running') {
      clearPollTimer()
      pollTimer = setTimeout(() => void loadAudit(true), 1500)
    }
  } catch (error) {
    loadError.value = apiErrorMessage(error, '防刷审计数据加载失败。')
  } finally {
    if (!silent) loading.value = false
  }
}

function toggleSelectBallot(ballotId: string): void {
  if (selectedSet.value.has(ballotId)) {
    selectedBallotIds.value = selectedBallotIds.value.filter(id => id !== ballotId)
  } else {
    selectedBallotIds.value = [...selectedBallotIds.value, ballotId]
  }
}

function selectAllVisibleSuspects(): void {
  const ids = (report.value?.logs ?? [])
    .filter(log => log.ballotId && log.riskLevel === 'suspect' && !log.ballotVoided)
    .map(log => log.ballotId!)
  selectedBallotIds.value = Array.from(new Set(ids))
}

function clearSelection(): void {
  selectedBallotIds.value = []
}

async function moderateBallots(mode: 'void' | 'restore' | 'release', ballotIds: string[], reason?: string): Promise<void> {
  const uniqueIds = Array.from(new Set(ballotIds)).filter(Boolean)
  if (uniqueIds.length === 0 || moderating.value) return
  const verb = mode === 'void' ? '作废' : mode === 'release' ? '放行计票' : '恢复'
  if (!window.confirm(`确认${verb}这 ${uniqueIds.length} 张选票？${mode === 'void' ? '作废后将从公开票数和大屏即时剔除，可随时恢复。' : '处理后将重新计入有效票数并免除 AI 重复自动拦截。'}`)) {
    return
  }
  moderating.value = true
  try {
    const res = await adminFetch<{ updatedCount: number }>(
      '/api/admin/competition/popularity/moderate',
      {
        method: 'POST',
        body: { mode, ballotIds: uniqueIds, ...(reason ? { reason } : {}) }
      }
    )
    toast.add({ title: `已${verb} ${res.updatedCount} 张选票`, color: 'success' })
    selectedBallotIds.value = []
    emit('refresh')
    await loadAudit(true)
  } catch (error) {
    toast.add({ title: `${verb}失败`, description: apiErrorMessage(error, '请重试。'), color: 'warning' })
  } finally {
    moderating.value = false
  }
}

async function voidSingerSuspectBallots(singerId: string, singerName: string): Promise<void> {
  if (!report.value) return
  try {
    const data = await adminFetch<{ report: CompetitionPopularityAuditReport }>(
      `/api/admin/competition/popularity/audit?singerId=${encodeURIComponent(singerId)}&filter=suspect&limit=500`
    )
    const ids = Array.from(new Set(
      data.report.logs
        .filter(log => log.ballotId && !log.ballotVoided && log.riskLevel === 'suspect')
        .map(log => log.ballotId!)
    ))
    if (ids.length === 0) {
      toast.add({ title: `${singerName} 当前没有未作废的高危选票`, color: 'neutral' })
      return
    }
    await moderateBallots('void', ids, `清理 ${singerName} 高危异常票`)
  } catch (error) {
    toast.add({ title: '读取高危选票失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
  }
}

async function runInspection(body: {
  mode: 'manual-batch' | 'single-log' | 'singer-focus'
  fromSeq?: number
  toSeq?: number
  logId?: string
  singerId?: string
}): Promise<void> {
  if (inspecting.value) return
  inspecting.value = true
  try {
    await adminFetch('/api/admin/competition/popularity/inspect', {
      method: 'POST',
      body
    })
    toast.add({ title: 'AI 巡检任务已启动', color: 'success' })
    activeTab.value = 'logs'
    await loadAudit(true)
  } catch (error) {
    toast.add({ title: '无法启动巡检', description: apiErrorMessage(error, '请确认 AI 网关配置后重试。'), color: 'warning' })
  } finally {
    inspecting.value = false
  }
}

function jumpToSingerLogs(singerId: string): void {
  logSingerId.value = singerId
  logFilter.value = 'all'
  activeTab.value = 'logs'
  void loadAudit()
}

watch(() => [props.updatedAt, props.candidatesCount], () => {
  void loadAudit(true)
})

watch([logFilter, logSingerId], () => {
  void loadAudit()
})

onMounted(() => {
  void loadAudit()
})

onBeforeUnmount(() => {
  clearPollTimer()
})
</script>

<template>
  <div class="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          防刷可视化、刷票预估与记忆 AI 巡检
        </h3>
        <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          前置拦截脚本直调与极快提交，每 {{ report?.overview.autoBatchSize ?? 20 }} 条新日志自动结合历史记忆巡检一次。
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            :class="activeTab === 'estimate'
              ? 'bg-zinc-900 text-white dark:bg-zinc-700'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="activeTab = 'estimate'"
          >
            票数与刷票预估
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            :class="activeTab === 'charts'
              ? 'bg-zinc-900 text-white dark:bg-zinc-700'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="activeTab = 'charts'"
          >
            监控图表与聚集簇
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            :class="activeTab === 'logs'
              ? 'bg-zinc-900 text-white dark:bg-zinc-700'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
            @click="activeTab = 'logs'"
          >
            日志与 AI 巡检
          </button>
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="loadAudit()"
        >
          刷新数据
        </UButton>
      </div>
    </div>

    <p
      v-if="loadError"
      class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      {{ loadError }}
    </p>

    <div
      v-if="report"
      class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          当前有效票 / 预估净票
        </p>
        <p class="mt-1 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {{ report.overview.validVotes }}
          <span class="text-sm font-semibold text-emerald-600 dark:text-emerald-400">→ {{ report.overview.estimatedRealVotes }} 净</span>
        </p>
        <p class="mt-0.5 text-xs text-zinc-500">
          冻结 {{ report.overview.quarantinedVotes }} · 作废 {{ report.overview.voidedVotes }} 票
        </p>
      </div>

      <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          预估刷票量与占比
        </p>
        <p class="mt-1 text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
          {{ report.overview.estimatedBrushVotes }} 票
          <span class="text-xs font-medium text-zinc-500">({{ report.overview.estimatedBrushRatePercent }}%)</span>
        </p>
        <p class="mt-0.5 text-xs text-zinc-500">
          高危 {{ report.overview.suspectValidVotes }} · 观察 {{ report.overview.watchValidVotes }}
        </p>
      </div>

      <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          前置脚本硬拦截
        </p>
        <p class="mt-1 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {{ report.overview.blockedAttempts }} 次
        </p>
        <p class="mt-0.5 text-xs text-zinc-500">
          流水共 {{ report.overview.totalLogCount }} 条（最新 #{{ report.overview.latestSeq }}）
        </p>
      </div>

      <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          记忆 AI 巡检进度
        </p>
        <p class="mt-1 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {{ report.inspections.length }} 次
        </p>
        <p class="mt-0.5 text-xs text-zinc-500">
          距下批自动巡检还差 {{ Math.max(0, report.overview.autoBatchSize - report.overview.pendingAutoCount) }} 票
        </p>
      </div>
    </div>

    <div
      v-if="report && activeTab === 'estimate'"
      class="space-y-3"
    >
      <div
        v-if="report.singerEstimates.length === 0"
        class="py-6 text-center text-xs text-zinc-500"
      >
        暂无决赛候选选手。
      </div>
      <div
        v-else
        class="space-y-2.5"
      >
        <div
          v-for="item in report.singerEstimates"
          :key="item.singerId"
          class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {{ item.number }}号
              </span>
              <span class="font-semibold text-zinc-900 dark:text-zinc-100">{{ item.name }}</span>
              <span class="text-xs tabular-nums text-zinc-500">
                原第 {{ item.rawRank }} 名 → 净估第 {{ item.estimatedRealRank }} 名
              </span>
              <span
                v-if="item.rawRank !== item.estimatedRealRank"
                class="rounded px-1.5 py-0.5 text-xs font-medium"
                :class="item.estimatedRealRank < item.rawRank
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'"
              >
                {{ item.estimatedRealRank < item.rawRank ? `上升 ${item.rawRank - item.estimatedRealRank}` : `下降 ${item.estimatedRealRank - item.rawRank}` }}
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-xs tabular-nums">
              <span class="text-zinc-700 dark:text-zinc-300">有效 {{ item.validVotes }}</span>
              <span class="font-semibold text-emerald-700 dark:text-emerald-300">净估 {{ item.estimatedRealVotes }}</span>
              <span class="text-rose-600 dark:text-rose-400">估刷 {{ item.estimatedBrushVotes }}（{{ item.brushRatePercent }}%）</span>
              <span
                v-if="item.quarantinedVotes > 0"
                class="text-amber-600 dark:text-amber-400"
              >冻结 {{ item.quarantinedVotes }}</span>
              <span
                v-if="item.voidedVotes > 0"
                class="text-zinc-400"
              >已废 {{ item.voidedVotes }}</span>
            </div>
          </div>

          <div class="mt-2 flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              class="h-full bg-emerald-500"
              :style="{ width: `${Math.round((item.estimatedRealVotes / maxEstimateVotes) * 100)}%` }"
              title="预估净票"
            />
            <div
              class="h-full bg-rose-400"
              :style="{ width: `${Math.round((Math.max(0, item.validVotes - item.estimatedRealVotes) / maxEstimateVotes) * 100)}%` }"
              title="未作废高危水分"
            />
            <div
              class="h-full bg-amber-400"
              :style="{ width: `${Math.round((item.quarantinedVotes / maxEstimateVotes) * 100)}%` }"
              title="冻结待审选票"
            />
            <div
              class="h-full bg-zinc-400"
              :style="{ width: `${Math.round((item.voidedVotes / maxEstimateVotes) * 100)}%` }"
              title="已作废选票"
            />
          </div>

          <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="reason in item.topReasons"
                :key="reason"
                class="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              >
                {{ reason }}
              </span>
              <span
                v-if="item.topReasons.length === 0"
                class="text-xs text-zinc-400"
              >
                未见集中异常特征
              </span>
            </div>

            <div class="flex flex-wrap gap-1.5">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-list"
                @click="jumpToSingerLogs(item.singerId)"
              >
                查日志
              </UButton>
              <UButton
                v-if="report.aiConfigured"
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-sparkles"
                :loading="inspecting"
                @click="runInspection({ mode: 'singer-focus', singerId: item.singerId })"
              >
                AI 巡检该选手
              </UButton>
              <UButton
                v-if="item.suspectVotes > 0"
                size="xs"
                color="error"
                variant="soft"
                icon="i-lucide-shield-alert"
                :loading="moderating"
                @click="voidSingerSuspectBallots(item.singerId, item.name)"
              >
                作废高危 {{ item.suspectVotes }} 票
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="report && activeTab === 'charts'"
      class="space-y-4"
    >
      <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            时间脉冲曲线（正常票 · 高危票 · 前置拦截）
          </h4>
          <div class="flex items-center gap-3 text-xs text-zinc-500">
            <span class="flex items-center gap-1"><span class="inline-block size-2 rounded-full bg-emerald-500" />正常</span>
            <span class="flex items-center gap-1"><span class="inline-block size-2 rounded-full bg-rose-500" />高危</span>
            <span class="flex items-center gap-1"><span class="inline-block size-2 rounded-full bg-zinc-400" />已拦截</span>
          </div>
        </div>

        <div
          v-if="report.timeline.length === 0"
          class="py-6 text-center text-xs text-zinc-500"
        >
          暂无投票脉冲记录。
        </div>
        <div
          v-else
          class="mt-3 overflow-x-auto"
        >
          <div class="flex h-36 min-w-max items-end gap-1.5 border-b border-zinc-200 pb-1 dark:border-zinc-800">
            <div
              v-for="bucket in report.timeline"
              :key="bucket.startAt"
              class="flex w-8 flex-col items-center gap-1"
              :title="`${bucket.label}：正常 ${bucket.normalCount} / 高危 ${bucket.suspectCount} / 拦截 ${bucket.blockedCount}`"
            >
              <div class="flex h-28 w-4 flex-col justify-end overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
                <div
                  class="w-full bg-zinc-400"
                  :style="{ height: `${Math.round((bucket.blockedCount / maxTimelineCount) * 100)}%` }"
                />
                <div
                  class="w-full bg-rose-500"
                  :style="{ height: `${Math.round((bucket.suspectCount / maxTimelineCount) * 100)}%` }"
                />
                <div
                  class="w-full bg-emerald-500"
                  :style="{ height: `${Math.round((bucket.normalCount / maxTimelineCount) * 100)}%` }"
                />
              </div>
              <span class="text-xs tabular-nums text-zinc-400">{{ bucket.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <h4 class="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            页面停留时长分布（服务端 ticket 实测）
          </h4>
          <div class="mt-3 space-y-2">
            <div
              v-for="row in report.dwellDistribution"
              :key="row.label"
              class="flex items-center gap-2 text-xs"
            >
              <span class="w-16 shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">{{ row.label }}</span>
              <div class="h-2.5 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                <div
                  class="h-full rounded bg-sky-500"
                  :style="{ width: `${row.count > 0 ? Math.max(4, Math.round((row.count / maxDwellCount) * 100)) : 0}%` }"
                />
              </div>
              <span class="w-24 shrink-0 text-right tabular-nums text-zinc-500">
                {{ row.count }} 次<span
                  v-if="row.suspectCount > 0"
                  class="text-rose-500"
                > (危{{ row.suspectCount }})</span>
              </span>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <h4 class="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            客户端环境分布（UA 摘要）
          </h4>
          <div
            v-if="report.uaDistribution.length === 0"
            class="mt-3 text-xs text-zinc-500"
          >
            暂无客户端统计。
          </div>
          <div
            v-else
            class="mt-3 space-y-2"
          >
            <div
              v-for="row in report.uaDistribution"
              :key="row.label"
              class="flex items-center gap-2 text-xs"
            >
              <span class="w-28 shrink-0 truncate text-zinc-600 dark:text-zinc-300">{{ row.label }}</span>
              <div class="h-2.5 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                <div
                  class="h-full rounded bg-indigo-500"
                  :style="{ width: `${row.count > 0 ? Math.max(4, Math.round((row.count / maxUaCount) * 100)) : 0}%` }"
                />
              </div>
              <span class="w-24 shrink-0 text-right tabular-nums text-zinc-500">
                {{ row.count }} 次<span
                  v-if="row.suspectCount > 0"
                  class="text-rose-500"
                > (危{{ row.suspectCount }})</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <h4 class="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          异常聚集簇（同 IP / 同硬件环境 / 同码段）
        </h4>
        <div
          v-if="report.clusters.length === 0"
          class="mt-3 text-xs text-zinc-500"
        >
          未检测到多设备聚集簇。
        </div>
        <div
          v-else
          class="mt-3 grid gap-2 sm:grid-cols-2"
        >
          <div
            v-for="cluster in report.clusters"
            :key="`${cluster.kind}:${cluster.keyLabel}`"
            class="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
          >
            <div class="min-w-0">
              <p class="font-medium text-zinc-800 dark:text-zinc-200">
                {{ clusterKindLabel(cluster.kind) }} · {{ cluster.keyLabel }}
                <span class="ml-1 text-zinc-500">({{ cluster.ballotCount }} 票)</span>
              </p>
              <p class="mt-0.5 truncate text-zinc-500">
                主投 {{ cluster.topSingerName }} ({{ cluster.topSingerVotes }} 票) · 有效 {{ cluster.validCount }} / 冻结 {{ cluster.quarantinedCount }} / 已废 {{ cluster.voidedCount }}
              </p>
            </div>
            <UButton
              v-if="cluster.validCount > 0 || cluster.quarantinedCount > 0"
              size="xs"
              color="error"
              variant="soft"
              :loading="moderating"
              @click="moderateBallots('void', cluster.ballotIds, `作废聚集簇 ${cluster.keyLabel}`)"
            >
              整簇作废
            </UButton>
            <span
              v-else
              class="shrink-0 text-zinc-400"
            >已清</span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="report && activeTab === 'logs'"
      class="space-y-4"
    >
      <div class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 class="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              记忆 AI 巡检与跨批次记忆账本
            </h4>
            <p class="mt-0.5 text-xs text-zinc-500">
              <span v-if="!report.aiConfigured">AI 网关未配置，当前由确定性规则引擎运行；配置 aiGateway 后自动启用 AI 巡检。</span>
              <span v-else-if="report.inspectionJob?.state === 'running'">正在巡检（{{ modeLabel(report.inspectionJob.mode) }}）…</span>
              <span v-else>每次巡检会携带最近 8 次记忆摘要，识别跨批次慢速刷票。</span>
            </p>
          </div>
          <UButton
            v-if="report.aiConfigured"
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-sparkles"
            :loading="inspecting || report.inspectionJob?.state === 'running'"
            :disabled="report.overview.latestSeq === 0"
            @click="runInspection({ mode: 'manual-batch' })"
          >
            立即巡检最新批次
          </UButton>
        </div>

        <div
          v-if="report.rollingMemory.length > 0"
          class="mt-3 rounded-md bg-zinc-50 p-2.5 dark:bg-zinc-900"
        >
          <p class="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            跨批次记忆账本（供后续巡检继承）
          </p>
          <ul class="mt-1.5 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            <li
              v-for="mem in report.rollingMemory"
              :key="mem.id"
              class="flex flex-wrap items-baseline gap-1.5"
            >
              <span
                class="rounded px-1 py-0.5 text-xs font-medium"
                :class="verdictClass(mem.verdict)"
              >
                #{{ mem.fromSeq }}-{{ mem.toSeq }}
              </span>
              <span>{{ mem.memoryNote }}</span>
            </li>
          </ul>
        </div>

        <div
          v-if="report.inspections.length > 0"
          class="mt-3 space-y-2"
        >
          <div
            v-for="item in report.inspections.slice(0, 6)"
            :key="item.id"
            class="rounded-md border border-zinc-200 p-2.5 text-xs dark:border-zinc-800"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  class="rounded px-1.5 py-0.5 font-medium"
                  :class="verdictClass(item.verdict)"
                >
                  {{ verdictLabel(item.verdict) }} · 置信 {{ item.confidence }}%
                </span>
                <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {{ modeLabel(item.mode) }} #{{ item.fromSeq }}-{{ item.toSeq }}（{{ item.logCount }} 条）
                </span>
                <span class="font-semibold text-zinc-900 dark:text-zinc-100">{{ item.headline }}</span>
                <span
                  v-if="item.autoVoidedCount > 0"
                  class="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                >AI自动作废 {{ item.autoVoidedCount }} 票</span>
                <span
                  v-if="item.autoReleasedCount > 0"
                  class="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                >AI自动放行 {{ item.autoReleasedCount }} 票</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="tabular-nums text-zinc-400">{{ formatDateTime(item.createdAt) }}</span>
                <UButton
                  v-if="item.flaggedBallotIds.length > 0"
                  size="xs"
                  color="error"
                  variant="ghost"
                  :loading="moderating"
                  @click="moderateBallots('void', item.flaggedBallotIds, `AI巡检标疑 #${item.fromSeq}-${item.toSeq}`)"
                >
                  作废标疑 {{ item.flaggedBallotIds.length }} 票
                </UButton>
              </div>
            </div>
            <ul
              v-if="item.findings.length > 0"
              class="mt-1.5 space-y-0.5 text-zinc-600 dark:text-zinc-300"
            >
              <li
                v-for="f in item.findings"
                :key="f"
              >
                · {{ f }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <select
              v-model="logFilter"
              aria-label="日志风险筛选"
              class="rounded-md border border-zinc-300 bg-[var(--surface)] px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">
                全部日志
              </option>
              <option value="quarantined">
                冻结待审
              </option>
              <option value="suspect">
                高危可疑
              </option>
              <option value="watch">
                观察级别
              </option>
              <option value="voided">
                已作废选票
              </option>
              <option value="blocked">
                前置硬拦截
              </option>
            </select>
            <select
              v-model="logSingerId"
              aria-label="按选手筛选"
              class="rounded-md border border-zinc-300 bg-[var(--surface)] px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">
                全部候选人
              </option>
              <option
                v-for="opt in singerOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <UInput
              v-model="logQuery"
              size="xs"
              placeholder="搜序号 / ip_ / env_ / 原因"
              @keyup.enter="loadAudit()"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              @click="loadAudit()"
            >
              查询
            </UButton>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="selectableBallotIds.length === 0"
              @click="selectAllVisibleSuspects"
            >
              全选当前高危
            </UButton>
            <UButton
              v-if="selectedBallotIds.length > 0"
              size="xs"
              color="error"
              variant="soft"
              :loading="moderating"
              @click="moderateBallots('void', selectedBallotIds, '批量作废勾选选票')"
            >
              作废已选 ({{ selectedBallotIds.length }})
            </UButton>
            <UButton
              v-if="selectedBallotIds.length > 0"
              size="xs"
              color="neutral"
              variant="outline"
              :loading="moderating"
              @click="moderateBallots('release', selectedBallotIds, '批量放行恢复选票')"
            >
              放行/恢复已选
            </UButton>
            <UButton
              v-if="selectedBallotIds.length > 0"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="clearSelection"
            >
              清空勾选
            </UButton>
          </div>
        </div>

        <div
          v-if="report.logs.length === 0"
          class="py-6 text-center text-xs text-zinc-500"
        >
          当前条件下暂无投票或拦截日志。
        </div>
        <div
          v-else
          class="overflow-x-auto"
        >
          <table class="w-full min-w-[780px] border-collapse text-left text-xs">
            <thead>
              <tr class="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <th class="py-2 pr-2 font-medium">
                  选
                </th>
                <th class="py-2 pr-2 font-medium">
                  序号 / 时间
                </th>
                <th class="py-2 pr-2 font-medium">
                  选手 / 动作
                </th>
                <th class="py-2 pr-2 font-medium">
                  环境与标识
                </th>
                <th class="py-2 pr-2 font-medium">
                  停留 / 状态
                </th>
                <th class="py-2 pr-2 font-medium">
                  风险依据
                </th>
                <th class="py-2 text-right font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
              <tr
                v-for="log in report.logs"
                :key="log.id"
                class="align-top"
              >
                <td class="py-2 pr-2">
                  <input
                    v-if="log.ballotId"
                    type="checkbox"
                    class="size-3.5 rounded border-zinc-300"
                    :checked="selectedSet.has(log.ballotId)"
                    @change="toggleSelectBallot(log.ballotId)"
                  >
                </td>
                <td class="py-2 pr-2 tabular-nums">
                  <p class="font-semibold text-zinc-800 dark:text-zinc-200">
                    #{{ log.seq }}
                  </p>
                  <p class="text-zinc-400">
                    {{ formatClock(log.createdAt) }}
                  </p>
                </td>
                <td class="py-2 pr-2">
                  <p class="font-medium text-zinc-900 dark:text-zinc-100">
                    {{ log.singerName }}
                  </p>
                  <p class="text-zinc-500">
                    {{ log.action === 'cast' ? '首投' : log.action === 'change' ? `改票(原 ${log.prevSingerName ?? '—'})` : `拦截(${log.blockCode ?? 'SCRIPT'})` }}
                  </p>
                </td>
                <td class="py-2 pr-2 text-zinc-600 dark:text-zinc-300">
                  <p>
                    {{ log.uaSummary }} · Cookie:{{ log.cookiePresent ? '有' : '无' }}
                    <span
                      v-if="log.wechatVerified"
                      class="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    >已绑微信</span>
                  </p>
                  <p class="tabular-nums text-zinc-400">
                    {{ log.ipTag ?? 'ip_none' }} · {{ log.envTag ?? 'env_none' }} · {{ log.qrNonceTag ?? 'qr_none' }}
                  </p>
                </td>
                <td class="py-2 pr-2 tabular-nums">
                  <span
                    class="inline-block rounded px-1.5 py-0.5 font-medium"
                    :class="rowRiskClass(log)"
                  >
                    {{ rowRiskText(log) }}
                  </span>
                  <p class="mt-0.5 text-zinc-400">
                    {{ log.dwellMs != null ? `${log.dwellMs} ms` : '—' }}
                  </p>
                </td>
                <td class="py-2 pr-2">
                  <div class="flex max-w-xs flex-wrap gap-1">
                    <span
                      v-for="r in log.suspicionReasons"
                      :key="r"
                      class="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {{ r }}
                    </span>
                    <span
                      v-if="log.suspicionReasons.length === 0"
                      class="text-zinc-400"
                    >—</span>
                  </div>
                </td>
                <td class="py-2 text-right">
                  <div class="flex justify-end gap-1">
                    <UButton
                      v-if="report.aiConfigured"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      :loading="inspecting"
                      @click="runInspection({ mode: 'single-log', logId: log.id })"
                    >
                      AI单票
                    </UButton>
                    <UButton
                      v-if="log.ballotId && log.ballotQuarantined"
                      size="xs"
                      color="primary"
                      variant="ghost"
                      :loading="moderating"
                      @click="moderateBallots('release', [log.ballotId], `手动放行日志 #${log.seq}`)"
                    >
                      放行
                    </UButton>
                    <UButton
                      v-if="log.ballotId && !log.ballotVoided"
                      size="xs"
                      color="error"
                      variant="ghost"
                      :loading="moderating"
                      @click="moderateBallots('void', [log.ballotId], `手动处置日志 #${log.seq}`)"
                    >
                      作废
                    </UButton>
                    <UButton
                      v-else-if="log.ballotId && log.ballotVoided"
                      size="xs"
                      color="neutral"
                      variant="outline"
                      :loading="moderating"
                      @click="moderateBallots('restore', [log.ballotId], `手动恢复日志 #${log.seq}`)"
                    >
                      恢复
                    </UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
