<script setup lang="ts">
import type { CompetitionPopularityPublicState } from '~~/shared/types'

definePageMeta({ layout: false })

useSeoMeta({ title: '人气奖投票大屏', robots: 'noindex, nofollow' })

const route = useRoute()
const key = computed(() => String(route.query.key ?? '').trim())

interface TokenState {
  token: string
  expiresAt: number
  qrDataUrl: string
  rotateSeconds: number
}

const tokenState = ref<TokenState | null>(null)
const state = ref<CompetitionPopularityPublicState | null>(null)
const error = ref('')
const now = ref(Date.now())

let tickTimer: ReturnType<typeof setInterval> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let stateTimer: ReturnType<typeof setInterval> | null = null
let stopped = false

function messageOf(caught: unknown): string {
  const data = (caught as { data?: { data?: { message?: string }, message?: string } })?.data
  return data?.data?.message ?? data?.message ?? '大屏链接无效或已过期。'
}

async function refreshToken(): Promise<void> {
  if (stopped) return
  if (!key.value) {
    error.value = '缺少大屏密钥，请从后台重新复制链接。'
    return
  }
  try {
    const data = await plainFetch<TokenState>(
      `/api/public/competition/popularity/token?key=${encodeURIComponent(key.value)}`
    )
    tokenState.value = data
    error.value = ''
    await refreshState()
    refreshTimer = setTimeout(() => void refreshToken(), Math.max(10, data.rotateSeconds) * 1000)
  } catch (caught) {
    tokenState.value = null
    error.value = messageOf(caught)
    refreshTimer = setTimeout(() => void refreshToken(), 5000)
  }
}

async function refreshState(): Promise<void> {
  const token = tokenState.value?.token
  if (!token) return
  try {
    state.value = await plainFetch<CompetitionPopularityPublicState>(
      `/api/public/competition/popularity/state?t=${encodeURIComponent(token)}`
    )
  } catch {
    // token 过期时让 refreshToken 换新码，不在这里反复报错。
  }
}

function remainingText(): string {
  const closesAt = state.value?.closesAt
  if (!closesAt) return '等待主持人宣布截止'
  const seconds = Math.max(0, Math.floor((closesAt - now.value) / 1000))
  if (seconds <= 0) return '投票已截止'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

onMounted(() => {
  void refreshToken()
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  stateTimer = setInterval(() => {
    void refreshState()
  }, 10_000)
})

onBeforeUnmount(() => {
  stopped = true
  if (tickTimer) clearInterval(tickTimer)
  if (stateTimer) clearInterval(stateTimer)
  if (refreshTimer) clearTimeout(refreshTimer)
})
</script>

<template>
  <div class="singer-canvas min-h-dvh overflow-hidden text-[var(--ink)]">
    <div class="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-6 py-6 lg:px-10">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-xs tracking-[0.3em] text-[var(--muted-ink)]">
            仰恩大学音乐协会 · 新声歌手大赛
          </p>
          <h1 class="mt-2 text-4xl font-black tracking-tight lg:text-5xl">
            {{ state?.title ?? '人气奖投票' }}
          </h1>
          <p class="mt-2 text-base text-[var(--muted-ink)]">
            {{ state?.subtitle || '现场扫码投票，一人一票' }}
          </p>
        </div>
        <div class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4 text-right">
          <p class="text-xs text-[var(--muted-ink)]">
            已投票设备
          </p>
          <p class="mt-1 text-4xl font-black tabular-nums text-[var(--color-green-600)]">
            {{ state?.totalVotes ?? 0 }}
          </p>
        </div>
      </header>

      <div class="mt-6 grid flex-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div class="flex flex-col items-center justify-center rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-2xl">
          <img
            v-if="tokenState?.qrDataUrl"
            :src="tokenState.qrDataUrl"
            alt="人气奖投票二维码"
            class="aspect-square w-full max-w-[320px] rounded-xl"
          >
          <div
            v-else
            class="grid aspect-square w-full max-w-[320px] place-items-center rounded-xl bg-zinc-100 text-sm text-zinc-500"
          >
            {{ error || '正在生成二维码…' }}
          </div>
          <p class="mt-4 text-center text-lg font-bold">
            微信扫一扫，投出人气奖
          </p>
          <p class="mt-1 text-center text-xs text-[var(--muted-ink)]">
            二维码每 {{ tokenState?.rotateSeconds ?? 30 }} 秒自动更换
          </p>
          <p
            v-if="error"
            class="mt-2 text-center text-xs text-red-600"
          >
            {{ error }}
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <div class="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p class="text-xs text-[var(--muted-ink)]">
                  {{ state?.status === 'open' ? '投票进行中' : state?.status === 'closed' ? '投票已截止' : '等待开始' }}
                </p>
                <p class="mt-1 text-3xl font-black tabular-nums text-[var(--color-green-600)]">
                  {{ remainingText() }}
                </p>
              </div>
              <p class="text-sm text-[var(--muted-ink)]">
                一台设备一票 · 截止前可改
              </p>
            </div>
          </div>

          <div class="min-h-0 flex-1 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold text-[var(--ink)]">
                候选人
              </h2>
              <span class="text-xs text-[var(--muted-ink)]">{{ state?.candidates.length ?? 0 }} 位决赛选手</span>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              <div
                v-for="candidate in state?.candidates ?? []"
                :key="candidate.singerId"
                class="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-2"
              >
                <div class="size-9 shrink-0 overflow-hidden rounded-full bg-[var(--surface)]">
                  <img
                    v-if="candidate.photoUrl"
                    :src="candidate.photoUrl"
                    :alt="candidate.name"
                    class="size-full object-cover"
                    referrerpolicy="no-referrer"
                  >
                  <span
                    v-else
                    class="grid size-full place-items-center text-sm font-bold text-[var(--color-green-600)]"
                  >{{ candidate.name.slice(0, 1) }}</span>
                </div>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold">
                    {{ candidate.name }}
                  </p>
                  <p class="truncate text-[11px] text-[var(--muted-ink)]">
                    {{ candidate.song || '曲目待定' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p class="mt-4 text-center text-xs text-[var(--muted-ink)]">
        票数实时更新，候选人顺序按决赛出场顺序排列
      </p>
    </div>
  </div>
</template>
