<script setup lang="ts">
import type { CompetitionPopularityAuthMode, CompetitionPopularityPublicState } from '~~/shared/types'

definePageMeta({ layout: false })

useSeoMeta({ title: '人气奖投票大屏', robots: 'noindex, nofollow' })

const route = useRoute()
const DISPLAY_KEY_STORAGE = 'yeu:popularity-display-key:v1'
const displayKey = ref('')
const displaySessionReady = ref(false)

function syncDisplayKeyFromLocation(): void {
  const queryKey = String(route.query.key ?? '').trim()
  if (queryKey) {
    displayKey.value = queryKey
    try {
      sessionStorage.setItem(DISPLAY_KEY_STORAGE, queryKey)
      if (window.location.search.includes('key=')) {
        window.history.replaceState(null, '', window.location.pathname)
      }
    } catch {
      // 禁用 sessionStorage/history 时保留内存值即可。
    }
    return
  }
  try {
    displayKey.value = sessionStorage.getItem(DISPLAY_KEY_STORAGE) ?? ''
  } catch {
    displayKey.value = ''
  }
}

interface TokenState {
  expiresAt: number
  qrDataUrl: string
  rotateSeconds: number
  authMode: CompetitionPopularityAuthMode
  wechatAccountName: string
  wechatQrUrl: string
  wechatPasscode: string
  state: CompetitionPopularityPublicState
}

const tokenState = ref<TokenState | null>(null)
const state = ref<CompetitionPopularityPublicState | null>(null)
const error = ref('')
const now = ref(Date.now())

/**
 * 公众号模式下 wechat_qr_url 本身就是公众号名片码图片，
 * 再包一层二维码会让学生扫到图片文件后还要长按识别。
 */
const displayQrSrc = computed(() => {
  const source = tokenState.value
  if (!source) return ''
  if (source.authMode === 'wechat_mp' && source.wechatQrUrl) return source.wechatQrUrl
  return source.qrDataUrl
})

let tickTimer: ReturnType<typeof setInterval> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let stopped = false

function messageOf(caught: unknown): string {
  const data = (caught as { data?: { data?: { message?: string }, message?: string } })?.data
  return data?.data?.message ?? data?.message ?? '大屏链接无效或已过期。'
}

function errorCodeOf(caught: unknown): string {
  const data = (caught as { data?: { data?: { code?: string }, code?: string } })?.data
  return data?.data?.code ?? data?.code ?? ''
}

async function ensureDisplaySession(): Promise<void> {
  if (!displayKey.value || displaySessionReady.value) return
  await plainFetch<{ ok: boolean }>(
    '/api/public/competition/popularity/display-session',
    {
      method: 'POST',
      body: { key: displayKey.value }
    }
  )
  displaySessionReady.value = true
}

async function refreshToken(): Promise<void> {
  if (stopped) return
  try {
    if (displayKey.value && !displaySessionReady.value) {
      await ensureDisplaySession()
    }
    const data = await plainFetch<TokenState>(
      '/api/public/competition/popularity/token'
    )
    tokenState.value = data
    state.value = data.state
    error.value = ''
    const nextDelayMs = Math.min(10, Math.max(5, data.rotateSeconds)) * 1000
    refreshTimer = setTimeout(() => void refreshToken(), nextDelayMs)
  } catch (caught) {
    const code = errorCodeOf(caught)
    if (code === 'POPULARITY_DISPLAY_SESSION_REQUIRED' && displayKey.value) {
      displaySessionReady.value = false
    }
    if (!displayKey.value && code === 'POPULARITY_DISPLAY_SESSION_REQUIRED') {
      tokenState.value = null
      error.value = '缺少大屏密钥，请从后台重新复制链接。'
    } else {
      tokenState.value = null
      error.value = messageOf(caught)
    }
    refreshTimer = setTimeout(() => void refreshToken(), 5000)
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
  syncDisplayKeyFromLocation()
  void refreshToken()
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  stopped = true
  if (tickTimer) clearInterval(tickTimer)
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
            v-if="displayQrSrc"
            :src="displayQrSrc"
            alt="人气奖投票二维码"
            class="aspect-square w-full max-w-[320px] rounded-xl"
          >
          <p
            v-if="displayQrSrc && tokenState?.authMode === 'wechat_mp'"
            class="mt-3 text-center text-sm font-bold text-[var(--color-green-600)]"
          >
            微信扫一扫，直接关注公众号领票
          </p>
          <div
            v-else
            class="grid aspect-square w-full max-w-[320px] place-items-center rounded-xl bg-zinc-100 text-sm text-zinc-500"
          >
            {{ error || '正在生成二维码…' }}
          </div>
          <template v-if="tokenState?.authMode === 'wechat_mp'">
            <div class="mt-4 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-3 text-center">
              <p class="text-xs font-semibold tracking-wider text-[var(--color-green-600)]">
                关注「{{ tokenState.wechatAccountName }}」发送口令领票
              </p>
              <p class="mt-1 text-3xl font-black tracking-widest text-[var(--ink)]">
                投票 {{ tokenState.wechatPasscode }}
              </p>
              <p class="mt-1 text-xs text-[var(--muted-ink)]">
                口令每分钟刷新 · 一人一微信号一票
              </p>
            </div>
          </template>
          <template v-else>
            <p class="mt-4 text-center text-lg font-bold">
              微信扫一扫，投出人气奖
            </p>
            <p class="mt-1 text-center text-xs text-[var(--muted-ink)]">
              二维码每 {{ tokenState?.rotateSeconds ?? 30 }} 秒自动更换
            </p>
          </template>
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
