<script setup lang="ts">
import type { CompetitionPopularityPublicState } from '~~/shared/types'

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
let timer: ReturnType<typeof setInterval> | null = null

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

async function load(): Promise<void> {
  if (!token.value) {
    error.value = '请扫大屏上的二维码进入投票页。'
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const query = new URLSearchParams({ t: token.value })
    const device = readDeviceToken()
    if (device) query.set('d', device)
    state.value = await plainFetch<CompetitionPopularityPublicState>(
      `/api/public/competition/popularity/state?${query.toString()}`
    )
    persistDeviceToken(state.value.deviceToken)
    now.value = Date.now()
  } catch (caught) {
    error.value = messageOf(caught)
  } finally {
    loading.value = false
  }
}

async function vote(singerId: string): Promise<void> {
  if (!state.value || savingId.value) return
  if (state.value.status !== 'open') {
    toast.add({ title: '投票还没开始或已经截止', color: 'warning' })
    return
  }
  if (state.value.myBallot?.singerId === singerId) {
    toast.add({ title: '你已经投给这位选手了', color: 'neutral' })
    return
  }
  if (state.value.myBallot && !state.value.canChange) {
    toast.add({ title: '你已投票，不能继续改票', color: 'warning' })
    return
  }
  savingId.value = singerId
  try {
    const device = readDeviceToken()
    const next = await plainFetch<CompetitionPopularityPublicState>(
      '/api/public/competition/popularity/vote',
      {
        method: 'POST',
        body: {
          token: token.value,
          singerId,
          revision: state.value.myBallot?.version ?? 0,
          ...(device ? { d: device } : {})
        }
      }
    )
    const changed = Boolean(state.value.myBallot)
    state.value = next
    persistDeviceToken(next.deviceToken)
    toast.add({ title: changed ? '改票成功' : '投票成功', color: 'success' })
  } catch (caught) {
    toast.add({ title: messageOf(caught), color: 'error' })
    if ((caught as { statusCode?: number }).statusCode === 409) void load()
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

const canVote = computed(() => state.value?.status === 'open' && (state.value?.candidates.length ?? 0) > 0)
const hasBallot = computed(() => Boolean(state.value?.myBallot))

onMounted(() => {
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
  <div class="singer-canvas min-h-dvh px-4 py-6 text-[var(--ink)]">
    <div class="mx-auto w-full max-w-3xl space-y-4">
      <header class="text-center">
        <p class="text-xs tracking-[0.24em] text-rose-600">
          仰恩大学音乐协会 · 新声歌手大赛
        </p>
        <h1 class="mt-2 text-3xl font-black tracking-tight">
          {{ state?.title ?? '人气奖投票' }}
        </h1>
        <p
          v-if="state?.subtitle"
          class="mt-2 text-sm text-[var(--muted-ink)]"
        >
          {{ state.subtitle }}
        </p>
        <div class="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span
            class="rounded-full px-3 py-1 font-medium"
            :class="state?.status === 'open'
              ? 'bg-green-100 text-green-800'
              : 'bg-[var(--surface-sunken)] text-[var(--muted-ink)]'"
          >
            {{ state?.status === 'open' ? '投票进行中' : state?.status === 'closed' ? '投票已截止' : state?.status === 'scheduled' ? '尚未开始' : '投票未开启' }}
          </span>
          <span
            v-if="remainingText()"
            class="rounded-full bg-[var(--surface)] px-3 py-1 text-[var(--muted-ink)] shadow-sm"
          >
            {{ remainingText() }}
          </span>
          <span class="rounded-full bg-[var(--surface)] px-3 py-1 text-[var(--muted-ink)] shadow-sm">
            {{ state?.totalVotes ?? 0 }} 人已投
          </span>
        </div>
      </header>

      <p
        v-if="error"
        class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ error }}
      </p>

      <div
        v-if="loading"
        class="rounded-2xl bg-[var(--surface)] px-4 py-12 text-center text-sm text-[var(--muted-ink)] shadow-sm"
      >
        正在加载候选名单…
      </div>

      <template v-else-if="state">
        <p
          v-if="hasBallot"
          class="rounded-xl border border-rose-200 bg-[var(--surface)] px-4 py-3 text-sm text-rose-800 shadow-sm"
        >
          你已投票：<strong>{{ state.candidates.find(item => item.singerId === state?.myBallot?.singerId)?.name ?? '当前选手' }}</strong>。
          <span v-if="state.canChange && state.allowChange">截止前还可以改 {{ Math.max(0, state.maxChanges - (state.myBallot?.changeCount ?? 0)) }} 次。</span>
          <span v-else>投票后不可更改。</span>
        </p>
        <p
          v-else-if="!canVote"
          class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {{ state.status === 'scheduled' ? '还没到开始时间，先看看候选人。' : state.status === 'closed' ? '投票已经截止。' : state.status === 'disabled' ? '主办方还没开启人气奖投票。' : '暂无可投票的候选名单。' }}
        </p>

        <div class="grid grid-cols-2 gap-3 sm:gap-4">
          <article
            v-for="candidate in state.candidates"
            :key="candidate.singerId"
            class="flex flex-col overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-sm"
            :class="state.myBallot?.singerId === candidate.singerId
              ? 'border-rose-400 ring-2 ring-rose-200'
              : 'border-[var(--line)]'"
          >
            <div class="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-rose-100 to-amber-100">
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
                class="grid size-full place-items-center text-5xl font-black text-rose-500"
              >{{ candidate.name.slice(0, 1) }}</span>
              <span class="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">
                {{ candidate.number }}号选手
              </span>
              <span
                v-if="state.myBallot?.singerId === candidate.singerId"
                class="absolute right-2 top-2 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white"
              >
                已投
              </span>
            </div>

            <div class="flex flex-1 flex-col gap-2 p-2.5 sm:p-3">
              <div>
                <p class="text-base font-black leading-tight sm:text-lg">
                  {{ candidate.name }}
                </p>
                <p class="mt-0.5 text-xs text-[var(--muted-ink)]">
                  {{ candidate.className || '班级未填' }}
                </p>
              </div>
              <p class="line-clamp-2 text-sm leading-snug text-[var(--muted-ink)]">
                演唱：{{ candidate.song || '曲目待定' }}
              </p>
              <button
                type="button"
                class="mt-auto flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                :class="state.myBallot?.singerId === candidate.singerId
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-rose-600 text-white hover:bg-rose-700'"
                :disabled="Boolean(savingId) || !canVote || (hasBallot && !state.canChange) || state.myBallot?.singerId === candidate.singerId"
                @click="vote(candidate.singerId)"
              >
                <UIcon
                  v-if="savingId === candidate.singerId"
                  name="i-lucide-loader-circle"
                  class="size-4 animate-spin"
                />
                <span v-else-if="state.myBallot?.singerId === candidate.singerId">你已投票</span>
                <span v-else-if="hasBallot && !state.canChange">你已投票</span>
                <span v-else-if="hasBallot">改投 TA</span>
                <span v-else>投给 TA</span>
              </button>
            </div>
          </article>
        </div>

        <div
          v-if="state.results"
          class="rounded-2xl bg-[var(--surface)] p-4 shadow-sm"
        >
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-bold">
              实时票数
            </h2>
            <span class="text-xs text-[var(--muted-ink)]">共 {{ state.totalVotes }} 票</span>
          </div>
          <div class="mt-3 space-y-2">
            <div
              v-for="row in state.results"
              :key="row.singerId"
              class="flex items-center gap-3 text-sm"
            >
              <span class="w-20 shrink-0 truncate">{{ row.name }}</span>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  class="h-full rounded-full bg-rose-400"
                  :style="{ width: `${row.percent}%` }"
                />
              </div>
              <span class="w-20 shrink-0 text-right text-xs tabular-nums text-[var(--muted-ink)]">{{ row.count }} 票 · {{ row.percent }}%</span>
            </div>
          </div>
        </div>

        <p class="text-center text-xs leading-relaxed text-[var(--muted-ink)]">
          每台设备限投一票；二维码失效请重扫大屏。
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
