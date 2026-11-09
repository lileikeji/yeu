<script setup lang="ts">
import type {
  CompetitionDimension,
  CompetitionJudgePayload,
  CompetitionRoundEntry
} from '~~/shared/types'
import { calculateCompetitionTotal, COMPETITION_MAX_DIMENSION_SCORE, roundCompetitionScore } from '~~/shared/utils/competition'

definePageMeta({ layout: false })

useSeoMeta({
  title: '评委评分',
  robots: 'noindex, nofollow'
})

type AuthState = 'checking' | 'ready' | 'unauthenticated' | 'error'
type TabKey = 'score' | 'round' | 'final'
type SingerWithScore = CompetitionJudgePayload['singers'][number]

const authState = ref<AuthState>('checking')
const loadError = ref('')
const payload = ref<CompetitionJudgePayload | null>(null)
const activeTab = ref<TabKey>('score')
const selectedSingerId = ref('')
const draftScores = ref<Record<string, number | null>>({})
const draftComment = ref('')
const saving = ref(false)
const refreshing = ref(false)
const loggingOut = ref(false)
/** 手机端：选手列表收成一个悬浮按钮，点开才是悬浮窗。 */
const singerSheetOpen = ref(false)
const toast = useToast()

const event = computed(() => payload.value?.event ?? null)
const round = computed(() => payload.value?.round ?? null)
const dimensions = computed<CompetitionDimension[]>(() => event.value?.dimensions ?? [])
const singers = computed<SingerWithScore[]>(() => payload.value?.singers ?? [])
const roundResults = computed<CompetitionRoundEntry[] | null>(() => payload.value?.roundResults ?? null)
const finalResults = computed<CompetitionRoundEntry[] | null>(() => payload.value?.finalResults ?? null)
const roundClosed = computed(() => round.value?.status === 'closed')
const scoringOpen = computed(() => round.value?.status === 'open')
const selectedSinger = computed<SingerWithScore | null>(() =>
  singers.value.find(singer => singer.id === selectedSingerId.value) ?? null)
const selectedIndex = computed(() => singers.value.findIndex(singer => singer.id === selectedSingerId.value))

const singerQuery = ref('')
const singerList = computed(() => {
  const keyword = singerQuery.value.trim().toLowerCase()
  return singers.value
    .map((singer, index) => ({ singer, index }))
    .filter(({ singer }) => {
      if (!keyword) return true
      return singer.name.toLowerCase().includes(keyword)
        || (singer.song ?? '').toLowerCase().includes(keyword)
    })
})
const maxTotal = computed(() => event.value?.maxTotal ?? dimensions.value.length * 10)
/** 每个维度的满分（当前 20 分），供输入框与校验使用。 */
const dimensionMax = COMPETITION_MAX_DIMENSION_SCORE
const weightSum = computed(() => dimensions.value.reduce((sum, dimension) => sum + dimension.weight, 0))

/** 顺序评分：主持人把全场指到同一位选手，所有人都只能给这一位打分。 */
const current = computed(() => payload.value?.current ?? null)
const sequential = computed(() => current.value !== null)
/** 顺序评分下，我这一位已经提交过：锁定输入，等其他人。 */
const currentSubmitted = computed(() => Boolean(sequential.value && selectedSinger.value?.score))
/** 本场提交进度：1/6 这种。 */
const currentSubmitPercent = computed(() => {
  const item = current.value
  if (!item || item.judgeTotal === 0) return 0
  return Math.round((item.submitted.length / item.judgeTotal) * 100)
})

const tabs = computed<Array<{ key: TabKey, label: string }>>(() => {
  const items: Array<{ key: TabKey, label: string }> = [{ key: 'score', label: '评分' }]
  if (roundResults.value) items.push({ key: 'round', label: '本轮结果' })
  if (finalResults.value && round.value?.key !== 'final') items.push({ key: 'final', label: '决赛结果' })
  return items
})

const hasCompleteScore = computed(() => dimensions.value.length > 0
  && dimensions.value.every(dimension => typeof draftScores.value[dimension.key] === 'number'))

const draftFilled = computed(() => dimensions.value
  .filter(dimension => typeof draftScores.value[dimension.key] === 'number').length)

const draftTotal = computed(() => {
  if (dimensions.value.length === 0) return null
  const scores: Record<string, number> = {}
  for (const dimension of dimensions.value) {
    const value = draftScores.value[dimension.key]
    scores[dimension.key] = typeof value === 'number' ? Number(value) : 0
  }
  return calculateCompetitionTotal(dimensions.value, scores)
})

const progressPercent = computed(() => {
  const progress = payload.value?.progress
  if (!progress || progress.total === 0) return 0
  return Math.round((progress.scored / progress.total) * 100)
})

function weightPercent(dimension: CompetitionDimension): number {
  if (weightSum.value <= 0) return 0
  return Math.round((dimension.weight / weightSum.value) * 100)
}

function statusCode(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null
    ? (error as { statusCode?: number }).statusCode
    : undefined
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null
    ? (error as { data?: { data?: { code?: string } } }).data?.data?.code
    : undefined
}

function errorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null
    ? (error as { data?: { data?: { message?: string } } }).data?.data?.message ?? ''
    : ''
}

function initDraft(singer: SingerWithScore | null): void {
  const existing = singer?.score
  const next: Record<string, number | null> = {}
  for (const dimension of dimensions.value) {
    const saved = existing?.dimensions.find(item => item.key === dimension.key)
    next[dimension.key] = typeof saved?.score === 'number' ? saved.score : null
  }
  draftScores.value = next
  draftComment.value = existing?.comment ?? ''
}

function selectSinger(singerId: string): void {
  const singer = singers.value.find(item => item.id === singerId)
  if (!singer) return
  selectedSingerId.value = singer.id
  initDraft(singer)
}

function scrollScoreTop(): void {
  const section = document.querySelector('[data-score-section]')
  if (section instanceof HTMLElement) section.scrollTop = 0
}

/** 回车：填完这一格跳到下一格，最后一格跳到备注。 */
function focusNextScore(currentKey: string): void {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-score-input]'))
    .filter(el => !el.disabled && el.offsetParent !== null)
  const index = inputs.findIndex(el => el.dataset.scoreInput === currentKey)
  const next = inputs[index + 1]
  if (next) {
    next.focus()
    next.select()
    return
  }
  const comment = document.querySelector<HTMLTextAreaElement>('[data-score-comment]')
  if (comment) comment.focus()
}

/** 手机端悬浮窗里点一位：选中并收起。 */
function pickSinger(singerId: string): void {
  selectSinger(singerId)
  singerSheetOpen.value = false
}

function applyPayload(data: CompetitionJudgePayload, keepSelection: boolean): void {
  payload.value = data
  // 顺序评分：页面永远停在主持人指的那一位，别人点的位置一律作废。
  if (data.current) {
    // 同一位选手的轮询刷新不能重设草稿，否则正在填的分数会被抹掉。
    const only = data.singers.find(singer => singer.id === data.current!.singer.id) ?? null
    if (only && only.id !== selectedSingerId.value) {
      selectSinger(only.id)
      scrollScoreTop()
    }
    return
  }

  // 自由评分：正在填的这一位没变，就绝不重设草稿（4 秒轮询会把手里的分数冲掉）。
  const kept = keepSelection
    ? data.singers.find(singer => singer.id === selectedSingerId.value)
    : null
  const target = kept
    ?? data.singers.find(singer => singer.score === null)
    ?? data.singers[0]
    ?? null

  if (target) {
    if (target.id !== selectedSingerId.value) selectSinger(target.id)
  } else {
    selectedSingerId.value = ''
    draftScores.value = {}
    draftComment.value = ''
  }

  if (data.round.key === 'final' && data.roundResults) activeTab.value = 'round'
  else if (data.round.status === 'closed' && data.roundResults) activeTab.value = 'round'
  else if (!data.roundResults && data.finalResults) activeTab.value = 'final'
  else if (data.round.status === 'open' && activeTab.value === 'score') {
    // keep scoring tab
  }
}

async function loadPayload(keepSelection = true): Promise<void> {
  loadError.value = ''
  try {
    const data = await judgeFetch<CompetitionJudgePayload>('/api/judge')
    applyPayload(data, keepSelection)
    authState.value = 'ready'
  } catch (error) {
    if (statusCode(error) === 401) {
      authState.value = 'unauthenticated'
      await navigateTo('/judge/login', { replace: true })
      return
    }
    loadError.value = '评分数据加载失败，请检查网络后重试。'
    authState.value = 'error'
  }
}

async function bootstrap(): Promise<void> {
  authState.value = 'checking'
  try {
    const session = await judgeFetch<{ authenticated?: boolean }>('/api/judge/auth/session')
    if (!session.authenticated) {
      authState.value = 'unauthenticated'
      await navigateTo('/judge/login', { replace: true })
      return
    }
    await loadPayload(false)
  } catch (error) {
    if (statusCode(error) === 401) {
      await navigateTo('/judge/login', { replace: true })
      return
    }
    loadError.value = '无法验证评委会话，请检查网络或联系负责同学。'
    authState.value = 'error'
  }
}

function normalizeScore(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return roundCompetitionScore(Math.min(dimensionMax, Math.max(0, value)))
}

function setDraftScore(key: string, raw: unknown): void {
  draftScores.value = {
    ...draftScores.value,
    [key]: normalizeScore(raw)
  }
}

async function saveScore(advance: boolean): Promise<void> {
  const singer = selectedSinger.value
  if (!singer || saving.value || !scoringOpen.value) return

  if (!hasCompleteScore.value) {
    toast.add({ title: '请填写全部评分维度', color: 'warning' })
    return
  }

  saving.value = true
  try {
    const scores: Record<string, number> = {}
    for (const dimension of dimensions.value) {
      scores[dimension.key] = Number(draftScores.value[dimension.key])
    }
    await judgeFetch(`/api/judge/scores/${encodeURIComponent(singer.id)}`, {
      method: 'PUT',
      body: {
        scores,
        comment: draftComment.value.trim()
      }
    })

    const wasSequential = sequential.value
    await loadPayload(true)
    toast.add({
      title: wasSequential ? '已提交，等待其他评委' : '评分已保存',
      color: 'success'
    })
    if (wasSequential) return

    if (advance) {
      const index = singers.value.findIndex(item => item.id === singer.id)
      const next = singers.value
        .slice(index + 1)
        .find(item => item.score === null) ?? singers.value[index + 1]
      if (next) selectSinger(next.id)
    }
  } catch (error) {
    const code = errorCode(error)
    if (code === 'COMPETITION_NOT_CURRENT_SINGER') {
      toast.add({
        title: '已经换到别人了',
        description: errorMessage(error) || '页面已同步到当前这位选手。',
        color: 'warning'
      })
      await loadPayload(true)
    } else if (code === 'COMPETITION_SCORING_CLOSED') {
      toast.add({
        title: '本轮评分未开放或已结束',
        description: '成绩已锁定，页面将刷新为只读。',
        color: 'warning'
      })
      await loadPayload(true)
    } else {
      toast.add({
        title: '保存失败',
        description: errorMessage(error) || '请检查网络后重试。',
        color: 'warning'
      })
    }
  } finally {
    saving.value = false
  }
}

async function refresh(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  await loadPayload(true)
  refreshing.value = false
}

function moveSelection(delta: number): void {
  const next = singers.value[selectedIndex.value + delta]
  if (next) selectSinger(next.id)
}

async function logout(): Promise<void> {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await judgeFetch('/api/judge/auth/logout', { method: 'POST' })
  } catch {
    // Expired sessions should still land on the login page.
  } finally {
    loggingOut.value = false
    await navigateTo('/judge/login', { replace: true })
  }
}

function rankText(rank: number | null): string {
  return rank === null ? '—' : String(rank)
}

function averageText(entry: CompetitionRoundEntry): string {
  return entry.average === null ? '—' : entry.average.toFixed(2)
}

function resultStatus(entry: CompetitionRoundEntry): string {
  if (entry.forfeited) return '弃权'
  if (entry.qualified) return '晋级'
  return '已评分'
}

function resultStatusClass(entry: CompetitionRoundEntry): string {
  if (entry.forfeited) return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
  if (entry.qualified) return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
  return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
}

function myTotalFor(singerId: string): number | null {
  if (activeTab.value === 'final' && round.value?.key !== 'final') return null
  return singers.value.find(singer => singer.id === singerId)?.score?.total ?? null
}

function myTotalText(singerId: string): string {
  const total = myTotalFor(singerId)
  return total === null ? '—' : total.toFixed(2)
}

function resultsFor(tab: TabKey): CompetitionRoundEntry[] {
  if (tab === 'final') return finalResults.value ?? []
  return roundResults.value ?? []
}

function resultsTitle(tab: TabKey): string {
  if (tab === 'final') return finalResults.value ? '决赛总结果' : '决赛结果'
  return round.value ? `${round.value.title}结果` : '本轮结果'
}

let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/**
 * 一直轮询：主持人结束评分后，评委这边最多 4 秒就同步成只读，
 * 不会出现「后台已经结束、前台还在打分」的窗口。
 */
function syncPolling(): void {
  const needPoll = authState.value === 'ready' && !saving.value
  if (needPoll && !pollTimer) {
    pollTimer = setInterval(() => {
      if (saving.value) return
      loadPayload(true).catch(() => {})
    }, 4000)
  } else if (!needPoll) {
    stopPolling()
  }
}

watch([authState, saving], syncPolling)

onMounted(bootstrap)
onBeforeUnmount(stopPolling)
</script>

<template>
  <div class="min-h-dvh bg-[#f5f7f4] dark:bg-zinc-950">
    <div
      v-if="authState === 'checking'"
      class="grid min-h-dvh place-items-center p-6"
      role="status"
      aria-live="polite"
    >
      <div class="text-center">
        <UIcon
          name="i-lucide-loader-circle"
          class="mx-auto size-7 animate-spin text-green-700 dark:text-green-400"
        />
        <p class="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">
          正在验证评委会话
        </p>
      </div>
    </div>

    <div
      v-else-if="authState === 'error'"
      class="grid min-h-dvh place-items-center p-6"
    >
      <div class="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <UIcon
          name="i-lucide-shield-alert"
          class="mx-auto size-7 text-orange-600 dark:text-orange-300"
        />
        <h1 class="mt-3 text-lg font-bold text-zinc-900 dark:text-zinc-100">
          加载失败
        </h1>
        <p class="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          {{ loadError }}
        </p>
        <div class="mt-5 flex justify-center gap-2">
          <UButton
            label="重新加载"
            icon="i-lucide-refresh-cw"
            @click="bootstrap"
          />
          <UButton
            label="退出登录"
            color="neutral"
            variant="outline"
            @click="logout"
          />
        </div>
      </div>
    </div>

    <template v-else-if="payload && event && round">
      <div class="flex h-[100dvh] flex-col overflow-hidden lg:block lg:h-auto lg:overflow-visible">
        <header class="shrink-0 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
            <span class="hidden size-10 shrink-0 place-items-center rounded-lg bg-green-700 text-white sm:grid">
              <UIcon
                name="i-lucide-mic-vocal"
                class="size-5"
                aria-hidden="true"
              />
            </span>
            <div class="min-w-0 flex-1">
              <h1 class="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100 sm:text-base">
                {{ event.title }} · {{ round.title }}
              </h1>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                评委 {{ payload.judge.displayName }}
              </p>
            </div>
            <span
              class="rounded-full px-2.5 py-1 text-xs font-medium"
              :class="scoringOpen
                ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                : roundClosed
                  ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'"
            >
              {{ scoringOpen ? '评分进行中' : roundClosed ? '评分已结束' : '等待开放' }}
            </span>
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="soft"
              size="sm"
              :loading="refreshing"
              aria-label="刷新"
              @click="refresh"
            />
            <UButton
              icon="i-lucide-log-out"
              color="neutral"
              variant="ghost"
              size="sm"
              label="退出"
              :loading="loggingOut"
              @click="logout"
            />
          </div>
        </header>

        <main
          class="mx-auto w-full max-w-6xl min-h-0 flex-1 space-y-2 px-2 py-2 sm:space-y-4 sm:px-6 sm:py-6 lg:flex-none lg:overflow-visible lg:pb-6"
          :class="activeTab === 'score' ? 'overflow-hidden' : 'overflow-y-auto'"
        >
          <div class="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900 sm:gap-3 sm:px-4 sm:py-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span>我的进度</span>
                <span class="tabular-nums">{{ payload.progress.scored }} / {{ payload.progress.total }} 位</span>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  class="h-full rounded-full bg-green-600 transition-[width] duration-300"
                  :style="{ width: `${progressPercent}%` }"
                />
              </div>
            </div>
            <div class="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
              <button
                v-for="tab in tabs"
                :key="tab.key"
                type="button"
                class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                :class="activeTab === tab.key
                  ? 'bg-zinc-900 text-white dark:bg-zinc-700'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
                @click="activeTab = tab.key"
              >
                {{ tab.label }}
              </button>
            </div>
          </div>

          <div
            v-if="round.status === 'draft'"
            class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
            role="status"
          >
            本轮尚未开放评分。名单与出场顺序已确定，请等待组织者开放后开始打分。
          </div>
          <div
            v-else-if="roundClosed"
            class="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            role="status"
          >
            本轮评分已结束，成绩已锁定。未提交评分的选手按弃权处理。
          </div>

          <section
            v-show="activeTab === 'score'"
            data-score-section
            class="grid min-h-0 gap-2 overflow-hidden lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] lg:gap-4 lg:overflow-visible"
          >
            <aside
              v-if="sequential && current"
              class="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div class="border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
                <h2 class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  顺序评分 · {{ current.day === 1 ? '第一天' : current.day === 2 ? '第二天' : '本场' }} ·
                  第 {{ current.index }} / {{ current.total }} 位
                </h2>
              </div>
              <div class="space-y-2 p-3">
                <div class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>本场提交进度</span>
                  <span class="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                    {{ current.submitted.length }} / {{ current.judgeTotal }}
                  </span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    class="h-full rounded-full bg-green-600 transition-[width] duration-300"
                    :style="{ width: `${currentSubmitPercent}%` }"
                  />
                </div>
                <ul class="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  <li
                    v-for="(item, slot) in current.judges"
                    :key="item.id"
                    class="flex items-center gap-2 px-2.5 py-1.5 text-[11px]"
                    :class="item.submitted
                      ? 'bg-green-50/70 dark:bg-green-950/40'
                      : 'bg-white dark:bg-zinc-900'"
                  >
                    <span class="w-4 shrink-0 tabular-nums text-zinc-400">{{ slot + 1 }}</span>
                    <span class="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">
                      {{ item.name }}
                      <span
                        v-if="item.id === payload.judge.id"
                        class="text-zinc-400 dark:text-zinc-500"
                      >（我）</span>
                    </span>
                    <span
                      class="shrink-0 rounded px-1.5 py-0.5 font-medium"
                      :class="item.submitted
                        ? 'bg-green-600 text-white'
                        : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'"
                    >
                      {{ item.submitted ? '已提交' : '未提交' }}
                    </span>
                  </li>
                </ul>
              </div>
            </aside>

            <aside
              v-else
              class="hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:block"
            >
              <div class="border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
                <h2 class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  {{ round.title }}名单（{{ singers.length }}）
                </h2>
                <input
                  v-model="singerQuery"
                  type="search"
                  placeholder="搜名字或歌名"
                  class="mt-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  aria-label="搜索选手"
                >
              </div>
              <div class="max-h-[26rem] overflow-y-auto p-1.5 lg:max-h-[calc(100vh-16rem)]">
                <button
                  v-for="{ singer, index } in singerList"
                  :key="singer.id"
                  type="button"
                  class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors"
                  :class="singer.id === selectedSingerId
                    ? 'bg-green-50 ring-1 ring-green-200 dark:bg-green-950/50 dark:ring-green-900'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'"
                  @click="selectSinger(singer.id)"
                >
                  <span class="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-zinc-400">
                    {{ singer.sortOrder || index + 1 }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ singer.name }}</span>
                    <span class="block truncate text-xs text-zinc-500 dark:text-zinc-400">{{ singer.song || '待定' }}</span>
                  </span>
                  <UIcon
                    v-if="singer.score"
                    name="i-lucide-circle-check"
                    class="size-4 shrink-0 text-green-600 dark:text-green-400"
                    aria-label="已评分"
                  />
                  <span
                    v-else
                    class="size-2 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600"
                    aria-label="未评分"
                  />
                </button>

                <p
                  v-if="singerList.length === 0"
                  class="px-3 py-8 text-center text-xs text-zinc-400"
                >
                  {{ singers.length === 0 ? '本轮还没有参赛名单。' : '没有匹配的选手。' }}
                </p>
              </div>
            </aside>

            <template v-if="!sequential">
              <UButton
                class="fixed right-4 bottom-20 z-30 shadow-lg lg:hidden"
                icon="i-lucide-list-music"
                color="neutral"
                :label="`选手 ${payload.progress.scored}/${singers.length}`"
                @click="singerSheetOpen = true"
              />
              <div
                v-if="singerSheetOpen"
                class="fixed inset-0 z-40 lg:hidden"
                role="dialog"
                aria-modal="true"
                aria-label="选手名单"
              >
                <div
                  class="absolute inset-0 bg-black/40"
                  @click="singerSheetOpen = false"
                />
                <div class="absolute inset-x-0 bottom-0 max-h-[72dvh] rounded-t-2xl border-t border-zinc-200 bg-white px-3 pt-3 pb-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
                  <div class="flex items-center justify-between gap-2 pb-2">
                    <p class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      选手名单（{{ singers.length }}）
                    </p>
                    <UButton
                      icon="i-lucide-x"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      aria-label="关闭名单"
                      @click="singerSheetOpen = false"
                    />
                  </div>
                  <input
                    v-model="singerQuery"
                    type="search"
                    placeholder="搜名字或歌名"
                    class="mb-2 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    aria-label="搜索选手"
                  >
                  <div class="max-h-[60dvh] overflow-y-auto">
                    <button
                      v-for="{ singer, index } in singerList"
                      :key="`sheet-${singer.id}`"
                      type="button"
                      class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors"
                      :class="singer.id === selectedSingerId
                        ? 'bg-green-50 ring-1 ring-green-200 dark:bg-green-950/50 dark:ring-green-900'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'"
                      @click="pickSinger(singer.id)"
                    >
                      <span class="w-6 shrink-0 text-right text-xs tabular-nums text-zinc-400">{{ index + 1 }}</span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ singer.name }}</span>
                        <span class="block truncate text-xs text-zinc-500 dark:text-zinc-400">{{ singer.song || '待定' }}</span>
                      </span>
                      <UIcon
                        v-if="singer.score"
                        name="i-lucide-circle-check"
                        class="size-4 shrink-0 text-green-600 dark:text-green-400"
                        aria-label="已评分"
                      />
                      <span
                        v-else
                        class="size-2 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600"
                        aria-label="未评分"
                      />
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <article
              v-if="selectedSinger"
              class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
            >
              <div class="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 pb-1.5 dark:border-zinc-800 sm:gap-3 sm:pb-4">
                <div class="min-w-0">
                  <p class="hidden text-[11px] font-medium text-green-700 dark:text-green-400 sm:block sm:text-xs">
                    出场序 {{ selectedSinger.sortOrder || selectedIndex + 1 }} / {{ singers.length }}
                  </p>
                  <h2 class="flex flex-wrap items-baseline gap-1.5 text-base font-bold leading-tight text-zinc-900 dark:text-zinc-100 sm:mt-1 sm:gap-2 sm:text-xl">
                    {{ selectedSinger.name }}
                    <span class="truncate text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      《{{ selectedSinger.song || '待定' }}》
                    </span>
                  </h2>
                  <p
                    v-if="selectedSinger.className"
                    class="hidden text-[11px] text-zinc-500 dark:text-zinc-400 sm:mt-1 sm:block sm:text-xs"
                  >
                    {{ selectedSinger.className }}
                  </p>
                  <p
                    v-if="selectedSinger.advancedFromRank"
                    class="hidden text-[11px] text-zinc-400 sm:mt-1 sm:block sm:text-xs"
                  >
                    上一轮第 {{ selectedSinger.advancedFromRank }} 名晋级
                  </p>
                  <p
                    v-if="selectedSinger.remark"
                    class="hidden rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 sm:mt-2 sm:block sm:px-2.5 sm:py-1.5 sm:text-xs dark:bg-amber-950 dark:text-amber-300"
                  >
                    备注：{{ selectedSinger.remark }}
                  </p>
                </div>
                <div
                  v-if="!sequential"
                  class="flex items-center gap-1"
                >
                  <UButton
                    icon="i-lucide-chevron-left"
                    color="neutral"
                    variant="soft"
                    size="sm"
                    aria-label="上一位"
                    :disabled="selectedIndex <= 0"
                    @click="moveSelection(-1)"
                  />
                  <UButton
                    icon="i-lucide-chevron-right"
                    color="neutral"
                    variant="soft"
                    size="sm"
                    aria-label="下一位"
                    :disabled="selectedIndex >= singers.length - 1"
                    @click="moveSelection(1)"
                  />
                </div>
              </div>

              <div class="mt-1.5 judge-compact-scores flex-1 content-start gap-1">
                <label
                  v-for="dimension in dimensions"
                  :key="`m-${dimension.key}`"
                  class="flex items-center gap-2 rounded-lg border border-zinc-200 px-2 py-0.5 dark:border-zinc-800"
                >
                  <span class="w-[4.6rem] shrink-0 truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">
                    {{ dimension.label }}
                  </span>
                  <input
                    type="range"
                    min="0"
                    :max="dimensionMax"
                    step="0.1"
                    class="min-w-0 flex-1 accent-green-600"
                    :value="draftScores[dimension.key] ?? 0"
                    :disabled="!scoringOpen || currentSubmitted"
                    :aria-label="`${dimension.label}滑块`"
                    @input="setDraftScore(dimension.key, ($event.target as HTMLInputElement).value)"
                  >
                  <input
                    type="number"
                    min="0"
                    :max="dimensionMax"
                    step="0.1"
                    inputmode="decimal"
                    enterkeyhint="next"
                    :data-score-input="dimension.key"
                    class="w-14 shrink-0 rounded-md border border-zinc-300 bg-white px-1 py-1 text-center text-sm font-semibold tabular-nums text-zinc-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-800"
                    :value="draftScores[dimension.key] ?? ''"
                    :disabled="!scoringOpen || currentSubmitted"
                    :aria-label="`${dimension.label}评分`"
                    :placeholder="`0-${dimensionMax}`"
                    @input="setDraftScore(dimension.key, ($event.target as HTMLInputElement).value)"
                    @keydown.enter.prevent="focusNextScore(dimension.key)"
                  >
                </label>
              </div>

              <div class="mt-4 hidden gap-3 sm:grid sm:grid-cols-2">
                <label
                  v-for="dimension in dimensions"
                  :key="dimension.key"
                  class="rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
                >
                  <span class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ dimension.label }}</span>
                    <span class="text-xs text-zinc-400">占比 {{ weightPercent(dimension) }}%</span>
                  </span>
                  <span class="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      :max="dimensionMax"
                      step="0.1"
                      inputmode="decimal"
                      enterkeyhint="next"
                      :data-score-input="dimension.key"
                      class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-semibold tabular-nums text-zinc-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-800"
                      :value="draftScores[dimension.key] ?? ''"
                      :disabled="!scoringOpen || currentSubmitted"
                      :aria-label="`${dimension.label}评分`"
                      :placeholder="`0-${dimensionMax}`"
                      @input="setDraftScore(dimension.key, ($event.target as HTMLInputElement).value)"
                      @keydown.enter.prevent="focusNextScore(dimension.key)"
                    >
                    <span class="shrink-0 text-xs text-zinc-400">/ {{ dimensionMax }}</span>
                  </span>
                  <input
                    type="range"
                    min="0"
                    :max="dimensionMax"
                    step="0.1"
                    class="mt-2 w-full accent-green-600"
                    :value="draftScores[dimension.key] ?? 0"
                    :disabled="!scoringOpen || currentSubmitted"
                    :aria-label="`${dimension.label}滑块`"
                    @input="setDraftScore(dimension.key, ($event.target as HTMLInputElement).value)"
                  >
                </label>
              </div>

              <div class="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-zinc-50 px-2.5 py-1 dark:bg-zinc-800/60 sm:mt-4 sm:items-end sm:px-4 sm:py-3">
                <div class="flex items-baseline gap-2">
                  <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    我的总分
                  </p>
                  <p class="text-lg font-bold leading-none tabular-nums text-zinc-900 dark:text-zinc-100 sm:mt-0.5 sm:text-2xl">
                    {{ draftTotal === null ? '—' : draftTotal.toFixed(2) }}
                    <span class="text-sm font-medium text-zinc-400">/ {{ maxTotal }}</span>
                    <span
                      v-if="draftFilled < dimensions.length"
                      class="ml-1 text-xs font-normal text-zinc-400"
                    >已填 {{ draftFilled }}/{{ dimensions.length }}</span>
                  </p>
                </div>
                <p
                  v-if="selectedSinger.score"
                  class="text-xs text-zinc-500 dark:text-zinc-400"
                >
                  已评分 {{ selectedSinger.score.total.toFixed(2) }} 分
                </p>
                <p
                  v-else
                  class="text-xs text-amber-700 dark:text-amber-300"
                >
                  尚未评分
                </p>
              </div>

              <label class="mt-1.5 block sm:mt-4">
                <span class="hidden text-xs font-medium text-zinc-800 sm:block sm:text-sm dark:text-zinc-100">备注（可选）</span>
                <textarea
                  v-model="draftComment"
                  rows="1"
                  maxlength="500"
                  data-score-comment
                  enterkeyhint="done"
                  class="mt-0 h-8 w-full resize-none rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20 disabled:cursor-not-allowed disabled:bg-zinc-100 sm:mt-1.5 sm:h-auto sm:px-3 sm:py-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-800"
                  :disabled="!scoringOpen || currentSubmitted"
                  placeholder="备注（可选）"
                  @keydown.enter.prevent
                />
              </label>

              <div
                v-if="scoringOpen && sequential && currentSubmitted"
                class="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 sm:mt-4 sm:px-4 sm:py-3 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
                role="status"
              >
                <p class="font-medium">
                  这一位已经提交，等待其他评委。
                </p>
                <div class="mt-2 flex items-center gap-2">
                  <div class="h-2 flex-1 overflow-hidden rounded-full bg-green-100 dark:bg-green-900">
                    <div
                      class="h-full rounded-full bg-green-600 transition-[width] duration-300"
                      :style="{ width: `${currentSubmitPercent}%` }"
                    />
                  </div>
                  <span class="shrink-0 text-xs font-semibold tabular-nums">
                    {{ current?.submitted.length ?? 0 }} / {{ current?.judgeTotal ?? 0 }}
                  </span>
                </div>
                <p class="mt-1.5 text-xs">
                  {{ current?.allSubmitted
                    ? '全部提交了，等主持人点「下一位」。'
                    : `还差 ${current?.pending.length ?? 0} 位：${(current?.pending ?? []).join('、')}` }}
                </p>
              </div>

              <div
                v-else-if="scoringOpen"
                class="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-4"
              >
                <UButton
                  icon="i-lucide-save"
                  :label="selectedSinger.score ? '更新评分' : '保存评分'"
                  :loading="saving"
                  :disabled="!hasCompleteScore"
                  @click="saveScore(false)"
                />
                <UButton
                  v-if="!sequential && selectedIndex < singers.length - 1"
                  icon="i-lucide-arrow-right"
                  label="保存并下一位"
                  color="neutral"
                  variant="soft"
                  :loading="saving"
                  :disabled="!hasCompleteScore"
                  @click="saveScore(true)"
                />
                <span
                  v-if="!hasCompleteScore"
                  class="text-xs text-zinc-400"
                >
                  填满 {{ dimensions.length }} 个维度后可保存
                </span>
              </div>
            </article>

            <div
              v-else
              class="grid min-h-60 place-items-center rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-400 dark:border-zinc-700"
            >
              本轮还没有可评分的选手
            </div>
          </section>

          <section
            v-if="activeTab !== 'score'"
            class="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <div>
                <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {{ resultsTitle(activeTab) }}
                </h2>
                <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  按平均分从高到低，同分按出场顺序；未评分的按弃权处理。
                </p>
              </div>
              <span class="text-xs text-zinc-400">
                {{ resultsFor(activeTab).filter(entry => entry.average !== null).length }} 位有成绩
              </span>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full min-w-[720px] text-sm">
                <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                  <tr>
                    <th class="w-20 px-4 py-2 font-medium">
                      排名
                    </th>
                    <th class="px-3 py-2 font-medium">
                      选手
                    </th>
                    <th class="px-3 py-2 font-medium">
                      歌曲
                    </th>
                    <th class="px-3 py-2 text-right font-medium">
                      平均分
                    </th>
                    <th class="px-3 py-2 text-right font-medium">
                      评分人数
                    </th>
                    <th class="px-3 py-2 font-medium">
                      状态
                    </th>
                    <th class="px-4 py-2 text-right font-medium">
                      我的评分
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                  <tr
                    v-for="entry in resultsFor(activeTab)"
                    :key="entry.id"
                  >
                    <td class="px-4 py-2.5">
                      <span
                        class="inline-grid min-w-8 place-items-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums"
                        :class="entry.rank === 1
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : entry.rank === 2
                            ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
                            : entry.rank === 3
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                              : 'text-zinc-500 dark:text-zinc-400'"
                      >
                        {{ rankText(entry.rank) }}
                      </span>
                    </td>
                    <td class="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                      {{ entry.singer.name }}
                    </td>
                    <td class="px-3 py-2.5 text-zinc-600 dark:text-zinc-300">
                      {{ entry.singer.song || '待定' }}
                    </td>
                    <td class="px-3 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {{ averageText(entry) }}
                    </td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                      {{ entry.scoreCount }}
                    </td>
                    <td class="px-3 py-2.5">
                      <span
                        class="rounded px-1.5 py-0.5 text-xs font-medium"
                        :class="resultStatusClass(entry)"
                      >
                        {{ resultStatus(entry) }}
                      </span>
                    </td>
                    <td class="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                      {{ myTotalText(entry.singer.id) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p
              v-if="resultsFor(activeTab).length === 0"
              class="px-4 py-10 text-center text-sm text-zinc-400"
            >
              结果尚未公布。
            </p>
          </section>
        </main>
      </div>
    </template>
  </div>
</template>
