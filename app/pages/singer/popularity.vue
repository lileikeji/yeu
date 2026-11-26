<script setup lang="ts">
import type { CompetitionPopularityPublicState } from '~~/shared/types'
import {
  computePopularityStandingMap,
  groupPopularityCandidates,
  type PopularityCandidateStanding
} from '~~/shared/utils/competition'

definePageMeta({ layout: false })

useSeoMeta({ title: '人气奖投票', robots: 'noindex, nofollow' })

const route = useRoute()
const toast = useToast()
const token = computed(() => String(route.query.t ?? '').trim())
const state = ref<CompetitionPopularityPublicState | null>(null)
const loading = ref(true)
const savingId = ref('')
const error = ref('')
const now = ref(Date.now())

const DEVICE_STORAGE_KEY = 'yeu:popularity-device:v1'
const WECHAT_TICKET_STORAGE_KEY = 'yeu:popularity-wechat-ticket:v1'
let timer: ReturnType<typeof setInterval> | null = null

function readWechatTicket(): string {
  try {
    return localStorage.getItem(WECHAT_TICKET_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function persistWechatTicket(value: string | undefined): void {
  try {
    if (value) localStorage.setItem(WECHAT_TICKET_STORAGE_KEY, value)
    else localStorage.removeItem(WECHAT_TICKET_STORAGE_KEY)
  } catch {
    // 忽略 storage 限制
  }
}

function syncWechatTicketFromLocation(): void {
  const queryVt = String(route.query.vt ?? '').trim()
  if (!queryVt) return
  persistWechatTicket(queryVt)
  try {
    const clean = token.value ? `${window.location.pathname}?t=${encodeURIComponent(token.value)}` : window.location.pathname
    window.history.replaceState(null, '', clean)
  } catch {
    // 忽略 history 限制
  }
}

function readDeviceToken(): string {
  try {
    return localStorage.getItem(DEVICE_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function persistDeviceToken(value: string | undefined): void {
  if (!value) return
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, value)
  } catch {
    // 浏览器禁用 localStorage 时退回 HttpOnly cookie，不影响投票。
  }
}

function messageOf(caught: unknown): string {
  const data = (caught as { data?: { data?: { message?: string }, message?: string } })?.data
  return data?.data?.message ?? data?.message ?? (caught as { message?: string })?.message ?? '出错了，稍后再试。'
}

function errorCodeOf(caught: unknown): string {
  const data = (caught as { data?: { data?: { code?: string, blockCode?: string }, code?: string } })?.data
  return data?.data?.blockCode ?? data?.data?.code ?? data?.code ?? ''
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const query = new URLSearchParams()
    if (token.value) query.set('t', token.value)
    const vt = readWechatTicket()
    if (vt) query.set('vt', vt)
    const device = readDeviceToken()
    if (device) query.set('d', device)
    const qs = query.toString()
    state.value = await plainFetch<CompetitionPopularityPublicState>(
      qs ? `/api/public/competition/popularity/state?${qs}` : '/api/public/competition/popularity/state'
    )
    persistDeviceToken(state.value.deviceToken)
    now.value = Date.now()
  } catch (caught) {
    if (errorCodeOf(caught) === 'POPULARITY_WECHAT_TICKET_INVALID') {
      persistWechatTicket(undefined)
      try {
        const fallbackQuery = new URLSearchParams()
        if (token.value) fallbackQuery.set('t', token.value)
        const qs = fallbackQuery.toString()
        state.value = await plainFetch<CompetitionPopularityPublicState>(
          qs ? `/api/public/competition/popularity/state?${qs}` : '/api/public/competition/popularity/state'
        )
        error.value = messageOf(caught)
        now.value = Date.now()
        return
      } catch {
        // fallthrough
      }
    }
    error.value = messageOf(caught)
  } finally {
    loading.value = false
  }
}

function collectClientEnv() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone?.slice(0, 64) || ''
    const lang = (navigator.language || '').slice(0, 32)
    const width = Math.round((window.screen?.width ?? 0) / 10) * 10
    const height = Math.round((window.screen?.height ?? 0) / 10) * 10
    const screen = width > 0 && height > 0 ? `${width}x${height}` : ''
    const touch = Math.min(32, Math.max(0, Number(navigator.maxTouchPoints ?? 0) || 0))
    return {
      ...(tz ? { tz } : {}),
      ...(lang ? { lang } : {}),
      ...(screen ? { screen } : {}),
      touch
    }
  } catch {
    return undefined
  }
}

async function vote(singerId: string): Promise<void> {
  if (!state.value || savingId.value) return
  if (state.value.requiresWechatTicket) {
    toast.add({
      title: `请先向公众号「${state.value.wechatAccountName || '仰恩大学指南'}」发送大屏口令领专属链接`,
      color: 'warning'
    })
    return
  }
  if (state.value.status !== 'open') {
    toast.add({ title: '投票还没开始或已经截止', color: 'warning' })
    return
  }
  if (multiVote.value && votesRemaining.value <= 0) {
    toast.add({ title: '你的票已经投满，不能继续投', color: 'warning' })
    return
  }
  if (multiVote.value && !allowRepeatVote.value && voteCountOf(singerId) > 0) {
    toast.add({ title: '同一选手最多投 1 票，请投给其他选手', color: 'warning' })
    return
  }
  if (!multiVote.value && state.value.myBallot?.singerId === singerId) {
    toast.add({ title: '你已经投给这位选手了', color: 'neutral' })
    return
  }
  if (!multiVote.value && state.value.myBallot && !state.value.canChange) {
    toast.add({ title: '你已投票，不能继续改票', color: 'warning' })
    return
  }
  savingId.value = singerId
  try {
    const device = readDeviceToken()
    const vt = readWechatTicket()
    const env = collectClientEnv()
    const next = await plainFetch<CompetitionPopularityPublicState>(
      '/api/public/competition/popularity/vote',
      {
        method: 'POST',
        body: {
          ...(token.value ? { token: token.value } : {}),
          ...(vt ? { vt } : {}),
          singerId,
          revision: state.value.revision ?? 0,
          ...(device ? { d: device } : {}),
          ...(state.value.pageTicket ? { pageTicket: state.value.pageTicket } : {}),
          ...(env ? { env } : {})
        }
      }
    )
    const changed = !multiVote.value && votesUsed.value > 0
    state.value = next
    persistDeviceToken(next.deviceToken)
    toast.add({
      title: multiVote.value
        ? `投票成功（已投 ${next.votesUsed}/${next.votesPerVoter} 票）`
        : (changed ? '改票成功' : '投票成功'),
      color: 'success'
    })
  } catch (caught) {
    const err = caught as { statusCode?: number, data?: { data?: { blockCode?: string } } }
    const code = errorCodeOf(caught)
    if (code === 'WECHAT_TICKET_REQUIRED' || code === 'POPULARITY_WECHAT_TICKET_INVALID') {
      persistWechatTicket(undefined)
      void load()
    }
    toast.add({ title: messageOf(caught), color: 'error' })
    if (err.statusCode === 409 || err.data?.data?.blockCode === 'MISSING_OR_INVALID_PAGE_TICKET') {
      void load()
    }
  } finally {
    savingId.value = ''
  }
}

async function withdrawVote(): Promise<void> {
  if (!state.value || savingId.value) return
  const target = state.value.myBallot?.singerId
  if (!target) return
  savingId.value = 'withdraw'
  try {
    const device = readDeviceToken()
    const vt = readWechatTicket()
    const next = await plainFetch<CompetitionPopularityPublicState>(
      '/api/public/competition/popularity/withdraw',
      {
        method: 'POST',
        body: {
          ...(token.value ? { token: token.value } : {}),
          ...(vt ? { vt } : {}),
          singerId: target,
          ...(device ? { d: device } : {})
        }
      }
    )
    state.value = next
    persistDeviceToken(next.deviceToken)
    toast.add({ title: '已取消投票，可以重新选择', color: 'success' })
  } catch (caught) {
    toast.add({ title: messageOf(caught), color: 'error' })
    void load()
  } finally {
    savingId.value = ''
  }
}

function remainingText(): string {
  const closesAt = state.value?.closesAt
  if (!closesAt) return ''
  const seconds = Math.max(0, Math.floor((closesAt - now.value) / 1000))
  if (seconds <= 0) return '已截止'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    return `还剩 ${hours} 小时 ${minutes % 60} 分`
  }
  return `还剩 ${minutes} 分 ${String(rest).padStart(2, '0')} 秒`
}

const votesPerVoter = computed(() => Math.max(1, state.value?.votesPerVoter ?? 1))
const votesUsed = computed(() => state.value?.votesUsed ?? 0)
const votesRemaining = computed(() => state.value?.votesRemaining ?? Math.max(0, votesPerVoter.value - votesUsed.value))
const multiVote = computed(() => votesPerVoter.value > 1)
const allowRepeatVote = computed(() => state.value?.allowRepeatVote !== false)
const myVoteCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const ballot of state.value?.myBallots ?? []) {
    counts.set(ballot.singerId, (counts.get(ballot.singerId) ?? 0) + 1)
  }
  return counts
})
function voteCountOf(singerId: string): number {
  return myVoteCounts.value.get(singerId) ?? 0
}
const canVote = computed(() => (
  !state.value?.requiresWechatTicket
  && state.value?.status === 'open'
  && (state.value?.candidates.length ?? 0) > 0
  && (!multiVote.value || votesRemaining.value > 0)
))
function canVoteFor(singerId: string): boolean {
  if (!canVote.value) return false
  return !(multiVote.value && !allowRepeatVote.value && voteCountOf(singerId) > 0)
}
const hasBallot = computed(() => votesUsed.value > 0)
const candidateGroups = computed(() => groupPopularityCandidates(state.value?.candidates ?? []))
const standingMap = computed(() => (
  state.value
    ? computePopularityStandingMap(state.value.candidates, state.value.results)
    : null
))

function standingOf(singerId: string): PopularityCandidateStanding | null {
  return standingMap.value?.get(singerId) ?? null
}

function groupOrderLabel(numbers: number[]): string {
  if (numbers.length === 0) return ''
  return `${numbers.map(num => `${num}号`).join(' · ')} 出场`
}

function standingGapText(standing: PopularityCandidateStanding): string {
  if (standing.rank === null) return '等待投出第一票'
  if (standing.gapToPrev !== null && standing.prevRank !== null) {
    return `距第 ${standing.prevRank} 名差 ${standing.gapToPrev} 票`
  }
  if (standing.rank === 1 && standing.tiedCount > 1) return '当前并列第 1 名'
  if (standing.rank === 1 && standing.leadOverNext !== null) return `领先第 2 名 ${standing.leadOverNext} 票`
  return '当前第 1 名'
}

onMounted(() => {
  syncWechatTicketFromLocation()
  void load()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="singer-canvas min-h-dvh px-3 py-5 text-[var(--ink)] sm:px-4 sm:py-7">
    <div class="mx-auto w-full max-w-3xl space-y-4">
      <header class="text-center">
        <p class="text-xs font-semibold tracking-[0.24em] text-[var(--color-orange-700)]">
          仰恩大学音乐协会 · 新声歌手大赛
        </p>
        <h1 class="mt-1.5 text-3xl font-black tracking-tight sm:text-4xl">
          {{ state?.title ?? '人气奖投票' }}
        </h1>
        <p
          v-if="state?.subtitle"
          class="mt-1.5 text-sm text-[var(--muted-ink)]"
        >
          {{ state.subtitle }}
        </p>

        <div class="mt-4 rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-3.5 py-2.5 text-left shadow-sm sm:px-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold"
                :class="state?.status === 'open'
                  ? 'bg-[color-mix(in_srgb,var(--color-success-500)_14%,var(--surface))] text-[var(--color-success-700)] dark:text-[var(--color-success-300)]'
                  : 'bg-[var(--surface-sunken)] text-[var(--muted-ink)]'"
              >
                <span
                  v-if="state?.status === 'open'"
                  class="size-1.5 rounded-full bg-current animate-pulse"
                />
                {{ state?.status === 'open' ? '投票进行中' : state?.status === 'closed' ? '投票已截止' : state?.status === 'scheduled' ? '尚未开始' : '投票未开启' }}
              </span>
              <span
                v-if="remainingText()"
                class="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 font-medium tabular-nums text-[var(--muted-ink)]"
              >
                {{ remainingText() }}
              </span>
              <span
                v-if="state?.wechatVerified"
                class="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-green-600)_12%,var(--surface))] px-2.5 py-1 font-semibold text-[var(--color-green-700)]"
              >
                <UIcon
                  name="i-lucide-shield-check"
                  class="size-3.5"
                />
                微信已核验
              </span>
            </div>

            <div class="flex items-center gap-2">
              <div class="text-right">
                <span class="text-base font-black tabular-nums text-[var(--ink)]">{{ state?.totalVotes ?? 0 }}</span>
                <span class="ml-1 text-xs text-[var(--muted-ink)]">{{ multiVote ? '总票数' : '人已投' }}</span>
              </div>
              <button
                type="button"
                aria-label="刷新投票状态"
                class="grid size-8 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--muted-ink)] transition hover:text-[var(--ink)] active:scale-95 disabled:opacity-50"
                :disabled="loading"
                @click="load"
              >
                <UIcon
                  name="i-lucide-refresh-cw"
                  class="size-3.5"
                  :class="loading ? 'animate-spin' : ''"
                />
              </button>
            </div>
          </div>

          <div
            v-if="multiVote"
            class="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-2 text-xs"
          >
            <span class="font-semibold text-[var(--ink)]">
              我的票数 <span class="tabular-nums text-rose-600 dark:text-rose-400">{{ votesUsed }}/{{ votesPerVoter }}</span>
            </span>
            <span class="text-[var(--muted-ink)]">
              <template v-if="votesRemaining > 0">
                还可投 <strong class="text-[var(--ink)]">{{ votesRemaining }}</strong> 票 · {{ allowRepeatVote ? '可投同一选手' : '每位选手限 1 票' }}
              </template>
              <template v-else>本轮票已投满</template>
            </span>
          </div>
        </div>
      </header>

      <p
        v-if="error"
        class="rounded-2xl border border-red-300/60 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300"
      >
        {{ error }}
      </p>

      <div
        v-if="loading"
        class="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-12 text-center text-sm text-[var(--muted-ink)] shadow-sm"
      >
        正在加载候选名单…
      </div>

      <template v-else-if="state">
        <div
          v-if="state.requiresWechatTicket"
          class="flex flex-col gap-3 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--ink)] shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="space-y-1.5">
            <p class="font-bold text-[var(--color-green-700)]">
              需要先向公众号领取专属投票链接
            </p>
            <p class="text-xs leading-relaxed text-[var(--muted-ink)]">
              1. 打开微信关注「<strong>{{ state.wechatAccountName || '仰恩大学指南' }}</strong>」（长按右侧二维码识别，或微信搜索公众号名）；<br>
              <template v-if="state.passcodeRequired !== false">
                2. 看现场大屏上的 2 位数字口令，发送「<strong>投票 XX</strong>」（如：投票 58）；<br>
                3. 点回复的专属链接进入即可投票。
              </template>
              <template v-else>
                2. 直接给公众号发送「<strong>投票</strong>」，即可收到你的专属投票链接；<br>
                3. 点开链接就能投票（一人一微信号一票）。
              </template>
            </p>
          </div>
          <div
            v-if="state.wechatQrUrl"
            class="flex shrink-0 flex-col items-center gap-1 self-center"
          >
            <img
              :src="state.wechatQrUrl"
              :alt="state.wechatAccountName || '公众号二维码'"
              class="size-24 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] object-contain p-1"
            >
            <span class="text-[11px] font-semibold text-[var(--muted-ink)]">长按识别关注</span>
          </div>
        </div>

        <p
          v-if="hasBallot && !multiVote"
          class="rounded-2xl border border-rose-300/70 bg-rose-500/10 px-4 py-3 text-sm text-[var(--ink)] shadow-sm"
        >
          你已投票给 <strong>{{ state.candidates.find(item => item.singerId === state?.myBallot?.singerId)?.name ?? '当前选手' }}</strong>。
          <span
            v-if="state.canChange && state.allowChange"
            class="text-[var(--muted-ink)]"
          >截止前还可以改 {{ Math.max(0, state.maxChanges - (state.myBallot?.changeCount ?? 0)) }} 次。</span>
          <span
            v-else
            class="text-[var(--muted-ink)]"
          >投票后不可更改。</span>
          <button
            v-if="state.canWithdraw"
            type="button"
            class="ml-2 rounded-full border border-rose-300/80 bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
            :disabled="Boolean(savingId)"
            @click="withdrawVote()"
          >
            {{ savingId === 'withdraw' ? '取消中…' : '取消投票' }}
          </button>
        </p>
        <p
          v-else-if="!hasBallot && !canVote && !state.requiresWechatTicket"
          class="rounded-2xl border border-amber-400/50 bg-[color-mix(in_srgb,var(--color-orange-500)_10%,var(--surface))] px-4 py-3 text-sm text-[var(--ink)] shadow-sm"
        >
          {{ state.status === 'scheduled' ? '还没到开始时间，先看看出场选手。' : state.status === 'closed' ? '投票已经截止。' : state.status === 'disabled' ? '主办方还没开启人气奖投票。' : '暂无可投票的候选名单。' }}
        </p>

        <div
          v-if="candidateGroups.length > 0"
          class="flex items-center justify-between gap-2 px-1 text-xs text-[var(--muted-ink)]"
        >
          <span class="inline-flex items-center gap-1.5 font-medium">
            <UIcon
              name="i-lucide-list-ordered"
              class="size-3.5 text-[var(--color-green-700)]"
            />
            按出场顺序分组排列 · 共 {{ state.candidates.length }} 位选手
          </span>
          <span class="tabular-nums">共 {{ candidateGroups.length }} 组</span>
        </div>

        <div
          v-if="candidateGroups.length === 0"
          class="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-12 text-center text-sm text-[var(--muted-ink)] shadow-sm"
        >
          暂无决赛候选选手。
        </div>

        <div
          v-else
          class="space-y-4"
        >
          <section
            v-for="group in candidateGroups"
            :key="group.groupNo"
            class="rounded-3xl border bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] p-3 shadow-sm transition sm:p-4"
            :class="group.candidates.some(item => voteCountOf(item.singerId) > 0)
              ? 'border-rose-400/70 ring-1 ring-rose-500/20'
              : 'border-[var(--line)]'"
          >
            <div class="flex flex-wrap items-center justify-between gap-2 px-0.5">
              <div class="flex items-center gap-2">
                <span class="rounded-full bg-[color-mix(in_srgb,var(--color-green-600)_14%,var(--surface))] px-3 py-1 text-xs font-black tracking-wide text-[var(--color-green-700)]">
                  {{ group.title }}
                </span>
                <span
                  v-if="group.candidates.some(item => voteCountOf(item.singerId) > 0)"
                  class="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300"
                >
                  已投票
                </span>
              </div>
              <span class="text-xs font-medium tabular-nums text-[var(--muted-ink)]">
                {{ groupOrderLabel(group.candidates.map(item => item.number)) }}
              </span>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2.5 sm:gap-4">
              <article
                v-for="candidate in group.candidates"
                :key="candidate.singerId"
                class="flex flex-col overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-xs transition"
                :class="voteCountOf(candidate.singerId) > 0
                  ? 'border-rose-400 ring-2 ring-rose-500/25'
                  : 'border-[var(--line)]'"
              >
                <div class="relative aspect-[4/5] overflow-hidden bg-[color-mix(in_srgb,var(--color-green-600)_10%,var(--surface-sunken))]">
                  <img
                    v-if="candidate.photoUrl"
                    :src="candidate.photoUrl"
                    :alt="`${candidate.number}号选手 ${candidate.name}`"
                    class="size-full object-cover"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                  >
                  <span
                    v-else
                    class="grid size-full place-items-center text-4xl font-black text-[var(--color-green-700)] sm:text-5xl"
                  >{{ candidate.name.slice(0, 1) }}</span>
                  <span class="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white backdrop-blur-xs">
                    {{ candidate.number }}号
                  </span>
                  <span
                    v-if="voteCountOf(candidate.singerId) > 0"
                    class="absolute right-2 top-2 rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-xs"
                  >
                    {{ multiVote ? `已投 ${voteCountOf(candidate.singerId)} 票` : '已投' }}
                  </span>
                </div>

                <div class="flex flex-1 flex-col gap-2 p-2.5 sm:p-3.5">
                  <div>
                    <p class="truncate text-base font-black leading-tight text-[var(--ink)] sm:text-lg">
                      {{ candidate.name }}
                    </p>
                    <p class="mt-0.5 truncate text-xs text-[var(--muted-ink)]">
                      {{ candidate.className || '班级未填' }}
                    </p>
                  </div>

                  <p class="flex items-center gap-1 truncate text-xs font-medium text-[var(--muted-ink)] sm:text-sm">
                    <UIcon
                      name="i-lucide-music"
                      class="size-3.5 shrink-0 text-[var(--color-orange-700)]"
                    />
                    <span class="truncate">《{{ candidate.song || '曲目待定' }}》</span>
                  </p>

                  <div
                    v-if="standingOf(candidate.singerId)"
                    class="rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-2"
                  >
                    <div class="flex items-center justify-between gap-1">
                      <span class="whitespace-nowrap text-xs text-[var(--muted-ink)]">
                        <strong class="text-base font-black tabular-nums text-[var(--ink)] sm:text-lg">{{ standingOf(candidate.singerId)!.count }}</strong>
                        <span class="ml-0.5">票</span>
                      </span>
                      <span
                        class="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                        :class="standingOf(candidate.singerId)!.rank === 1
                          ? 'bg-rose-600 text-white shadow-xs'
                          : standingOf(candidate.singerId)!.rank !== null
                            ? 'bg-[var(--surface)] text-[var(--ink)] ring-1 ring-[var(--line)]'
                            : 'bg-[var(--surface)] text-[var(--muted-ink)]'"
                      >
                        <template v-if="standingOf(candidate.singerId)!.rank === null">
                          暂未开榜
                        </template>
                        <template v-else-if="standingOf(candidate.singerId)!.rank === 1 && standingOf(candidate.singerId)!.tiedCount > 1">
                          并列第 1
                        </template>
                        <template v-else>
                          第 {{ standingOf(candidate.singerId)!.rank }} 名
                        </template>
                      </span>
                    </div>
                    <p
                      class="mt-1 truncate text-[11px] font-medium leading-tight tabular-nums"
                      :class="standingOf(candidate.singerId)!.gapToPrev !== null
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-[var(--muted-ink)]'"
                    >
                      {{ standingGapText(standingOf(candidate.singerId)!) }}
                    </p>
                  </div>

                  <button
                    type="button"
                    class="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-transform active:scale-[0.98] disabled:cursor-not-allowed"
                    :class="voteCountOf(candidate.singerId) > 0
                      ? 'bg-rose-500/12 text-rose-700 ring-1 ring-rose-400/60 dark:text-rose-300'
                      : 'bg-rose-600 text-white shadow-xs hover:bg-rose-700 disabled:opacity-55'"
                    :disabled="Boolean(savingId) || !canVoteFor(candidate.singerId) || (multiVote ? votesRemaining <= 0 : (hasBallot && !state.canChange) || voteCountOf(candidate.singerId) > 0)"
                    @click="vote(candidate.singerId)"
                  >
                    <UIcon
                      v-if="savingId === candidate.singerId"
                      name="i-lucide-loader-circle"
                      class="size-4 animate-spin"
                    />
                    <span v-else-if="state.requiresWechatTicket">请先从公众号领链接</span>
                    <span v-else-if="multiVote && votesRemaining <= 0">票已投满</span>
                    <span v-else-if="multiVote && !allowRepeatVote && voteCountOf(candidate.singerId) > 0">同一选手限一票</span>
                    <span v-else-if="multiVote">{{ voteCountOf(candidate.singerId) > 0 ? '再投一票' : '投给 TA' }}</span>
                    <span v-else-if="voteCountOf(candidate.singerId) > 0">你已投票</span>
                    <span v-else-if="hasBallot && !state.canChange">你已投票</span>
                    <span v-else-if="hasBallot">改投 TA</span>
                    <span v-else>投给 TA</span>
                  </button>
                </div>
              </article>
            </div>
          </section>
        </div>

        <p class="pt-1 text-center text-xs leading-relaxed text-[var(--muted-ink)]">
          {{ multiVote
            ? `每人最多 ${votesPerVoter} 票，${allowRepeatVote ? '可投给不同或同一位选手' : '同一选手最多 1 票'}；${state.allowWithdraw ? '投错了可点「取消投票」重投。' : '投出后不能改票。'}`
            : (state.authMode === 'wechat_mp' ? '一个微信号限投一票；链接失效请回公众号重领。' : '每台设备限投一票；二维码失效请重扫大屏。') }}
        </p>

        <div class="flex justify-center">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            @click="load"
          >
            刷新投票状态
          </UButton>
        </div>
      </template>
    </div>
  </div>
</template>
