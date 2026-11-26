<script setup lang="ts">
import type { CompetitionPopularityAuthMode, CompetitionPopularityPublicState } from '~~/shared/types'
import {
  computePopularityStandingMap,
  groupPopularityCandidates,
  type PopularityCandidateStanding
} from '~~/shared/utils/competition'

definePageMeta({ layout: false })

useSeoMeta({ title: '人气奖投票大屏', robots: 'noindex, nofollow' })

const route = useRoute()
const DISPLAY_KEY_STORAGE = 'yeu:popularity-display-key:v1'
const displayKey = ref('')
const displaySessionReady = ref(false)
const isFullscreen = ref(false)

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
  passcodeRotate?: boolean
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

const votesPerVoter = computed(() => Math.max(1, state.value?.votesPerVoter ?? 1))
const multiVote = computed(() => votesPerVoter.value > 1)
const allowRepeatVote = computed(() => state.value?.allowRepeatVote !== false)

const ruleSummary = computed(() => {
  const current = state.value
  if (!current) return '现场扫码投票'
  const identityLabel = current.authMode === 'wechat_mp' ? '一人一微信号' : '每台设备'
  if (multiVote.value) {
    const repeatLabel = allowRepeatVote.value ? '可重复投同一选手' : '同一选手限 1 票'
    return `${identityLabel} · 每人最多 ${votesPerVoter.value} 票 · ${repeatLabel}`
  }
  return `${identityLabel}限投 1 票 · ${current.allowChange ? '截止前可改票' : '投出后锁定'}`
})

const candidateGroups = computed(() => groupPopularityCandidates(state.value?.candidates ?? []))

const standingMap = computed(() => (
  state.value
    ? computePopularityStandingMap(state.value.candidates, state.value.results)
    : null
))

const leaderVotes = computed(() => Math.max(1, ...(state.value?.results?.map(row => row.count) ?? [1])))

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

function progressPercentOf(count: number): number {
  if (count <= 0) return 0
  return Math.max(6, Math.round((count / leaderVotes.value) * 100))
}

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
  if (!closesAt) return '主持人宣布截止'
  const seconds = Math.max(0, Math.floor((closesAt - now.value) / 1000))
  if (seconds <= 0) return '投票已截止'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function syncFullscreenState(): void {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    // 浏览器策略禁止或退出全屏失败时忽略。
  }
}

onMounted(() => {
  syncDisplayKeyFromLocation()
  syncFullscreenState()
  document.addEventListener('fullscreenchange', syncFullscreenState)
  void refreshToken()
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  stopped = true
  document.removeEventListener('fullscreenchange', syncFullscreenState)
  if (tickTimer) clearInterval(tickTimer)
  if (refreshTimer) clearTimeout(refreshTimer)
})
</script>

<template>
  <div class="singer-canvas min-h-dvh overflow-x-hidden text-[var(--ink)]">
    <div class="mx-auto flex min-h-dvh w-full max-w-[1680px] flex-col justify-between gap-4 px-5 py-4 lg:px-8 lg:py-5">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div class="min-w-0">
          <p class="text-xs font-bold tracking-[0.28em] text-[var(--color-orange-700)]">
            仰恩大学音乐协会 · 新声歌手大赛
          </p>
          <div class="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 class="text-3xl font-black tracking-tight lg:text-4xl xl:text-5xl">
              {{ state?.title ?? '人气奖投票' }}
            </h1>
            <p class="text-sm font-medium text-[var(--muted-ink)] lg:text-base">
              {{ state?.subtitle || ruleSummary }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-stretch gap-3">
          <div class="flex flex-col justify-between rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-4 py-2.5 shadow-sm">
            <div class="flex items-center gap-1.5 text-xs">
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-bold"
                :class="state?.status === 'open'
                  ? 'bg-[color-mix(in_srgb,var(--color-success-500)_14%,var(--surface))] text-[var(--color-success-700)] dark:text-[var(--color-success-300)]'
                  : 'bg-[var(--surface-sunken)] text-[var(--muted-ink)]'"
              >
                <span
                  v-if="state?.status === 'open'"
                  class="size-1.5 rounded-full bg-current animate-pulse"
                />
                {{ state?.status === 'open' ? '投票进行中' : state?.status === 'closed' ? '投票已截止' : state?.status === 'scheduled' ? '尚未开始' : '等待开启' }}
              </span>
            </div>
            <p class="mt-1 flex items-center gap-1.5 text-xl font-black tabular-nums text-[var(--ink)] xl:text-2xl">
              <UIcon
                name="i-lucide-clock-3"
                class="size-4 shrink-0 text-[var(--color-orange-700)]"
              />
              <span>{{ remainingText() }}</span>
            </p>
          </div>

          <div class="flex flex-col justify-between rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-4 py-2.5 text-right shadow-sm">
            <p class="text-xs font-medium text-[var(--muted-ink)]">
              {{ multiVote ? '累计有效票' : '已投有效票' }}
            </p>
            <p class="mt-1 text-2xl font-black tabular-nums text-rose-600 dark:text-rose-400 xl:text-3xl">
              {{ state?.totalVotes ?? 0 }}
            </p>
          </div>

          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-4 py-2.5 text-xs font-bold text-[var(--ink)] shadow-sm transition hover:bg-[var(--surface)] active:scale-95"
            @click="toggleFullscreen"
          >
            <UIcon
              :name="isFullscreen ? 'i-lucide-monitor' : 'i-lucide-maximize-2'"
              class="size-4 text-[var(--color-green-700)]"
            />
            <span>{{ isFullscreen ? '退出全屏' : '全屏投屏' }}</span>
          </button>
        </div>
      </header>

      <div class="grid flex-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        <aside class="flex flex-col justify-between gap-4 rounded-3xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-5 shadow-md">
          <div class="flex flex-1 flex-col items-center justify-center">
            <div class="flex items-center gap-1.5 text-xs font-bold tracking-wider text-[var(--color-green-700)]">
              <UIcon
                name="i-lucide-qr-code"
                class="size-4"
              />
              <span>{{ tokenState?.authMode === 'wechat_mp' ? '扫码关注公众号领票' : '现场扫码直投入口' }}</span>
            </div>

            <div class="mt-3 w-full max-w-[300px] rounded-2xl border border-[var(--line)] bg-zinc-50 p-3 shadow-sm xl:max-w-[330px]">
              <img
                v-if="displayQrSrc"
                :src="displayQrSrc"
                alt="人气奖投票二维码"
                class="aspect-square w-full rounded-xl object-contain"
              >
              <div
                v-else
                class="grid aspect-square w-full place-items-center rounded-xl bg-zinc-100 px-4 text-center text-sm font-medium text-zinc-600"
              >
                {{ error || '正在生成二维码…' }}
              </div>
            </div>

            <template v-if="tokenState?.authMode === 'wechat_mp'">
              <div class="mt-4 w-full rounded-2xl border border-rose-400/50 bg-rose-500/10 px-4 py-3.5 text-center">
                <p class="text-xs font-bold tracking-wide text-[var(--ink)]">
                  {{ tokenState.passcodeRotate === false ? `关注「${tokenState.wechatAccountName || '仰恩大学指南'}」即可领票` : `向「${tokenState.wechatAccountName || '仰恩大学指南'}」发送口令` }}
                </p>
                <p
                  v-if="tokenState.passcodeRotate !== false"
                  class="mt-1.5 text-4xl font-black tracking-[0.14em] tabular-nums text-rose-600 dark:text-rose-400 xl:text-5xl"
                >
                  投票 {{ tokenState.wechatPasscode }}
                </p>
                <p
                  v-else
                  class="mt-1.5 text-3xl font-black tracking-wide text-rose-600 dark:text-rose-400 xl:text-4xl"
                >
                  发送「投票」
                </p>
                <p class="mt-1.5 text-xs font-medium text-[var(--muted-ink)]">
                  {{ tokenState.passcodeRotate === false ? '无需口令 · 一人一微信号一票' : '口令每分钟自动刷新 · 发送后点击专属链接投票' }}
                </p>
              </div>

              <ol class="mt-3 w-full space-y-1.5 rounded-2xl border border-[var(--line)] bg-[var(--surface-sunken)] px-3.5 py-2.5 text-xs text-[var(--muted-ink)]">
                <li class="flex items-center gap-2">
                  <span class="grid size-4 shrink-0 place-items-center rounded-full bg-[var(--color-green-600)] text-[10px] font-black text-white">1</span>
                  <span>微信扫上方二维码关注公众号</span>
                </li>
                <li class="flex items-center gap-2">
                  <span class="grid size-4 shrink-0 place-items-center rounded-full bg-[var(--color-green-600)] text-[10px] font-black text-white">2</span>
                  <span v-if="tokenState.passcodeRotate !== false">在公众号对话框发送「<strong class="text-[var(--ink)]">投票 {{ tokenState.wechatPasscode }}</strong>」</span>
                  <span v-else>在公众号对话框直接发送「<strong class="text-[var(--ink)]">投票</strong>」</span>
                </li>
                <li class="flex items-center gap-2">
                  <span class="grid size-4 shrink-0 place-items-center rounded-full bg-[var(--color-green-600)] text-[10px] font-black text-white">3</span>
                  <span>点开自动回复的专属链接为喜欢选手投票</span>
                </li>
              </ol>
            </template>

            <template v-else-if="tokenState">
              <div class="mt-4 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-3.5 text-center">
                <p class="text-lg font-black text-[var(--ink)]">
                  微信扫一扫，投出人气奖
                </p>
                <p class="mt-1 flex items-center justify-center gap-1.5 text-xs text-[var(--muted-ink)]">
                  <UIcon
                    name="i-lucide-refresh-cw"
                    class="size-3.5 text-[var(--color-green-700)]"
                  />
                  <span>动态二维码每 {{ tokenState.rotateSeconds }} 秒自动更换</span>
                </p>
              </div>
            </template>
          </div>

          <p
            v-if="error"
            class="flex items-center justify-center gap-1.5 rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2 text-center text-xs font-medium text-red-700 dark:text-red-300"
          >
            <UIcon
              name="i-lucide-circle-alert"
              class="size-3.5 shrink-0"
            />
            <span>{{ error }}</span>
          </p>
        </aside>

        <main class="flex min-w-0 flex-col rounded-3xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-4 shadow-md lg:p-5">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-list-ordered"
                class="size-4 text-[var(--color-green-700)]"
              />
              <h2 class="text-sm font-black tracking-wide text-[var(--ink)] lg:text-base">
                决赛候选人 · 按出场顺序分组
              </h2>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-ink)]">
              <span class="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 font-medium tabular-nums">
                共 {{ state?.candidates.length ?? 0 }} 位选手 · {{ candidateGroups.length }} 组
              </span>
              <span
                v-if="state && !state.showResults"
                class="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 font-medium"
              >
                当前隐藏实时票数
              </span>
            </div>
          </div>

          <div
            v-if="candidateGroups.length === 0"
            class="grid flex-1 place-items-center py-12 text-sm text-[var(--muted-ink)]"
          >
            暂无决赛候选选手。
          </div>

          <div
            v-else
            class="mt-3 grid flex-1 content-start gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
          >
            <section
              v-for="group in candidateGroups"
              :key="group.groupNo"
              class="rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-sunken)_80%,transparent)] p-3"
            >
              <div class="flex items-center justify-between gap-2 px-0.5">
                <span class="rounded-full bg-[color-mix(in_srgb,var(--color-green-600)_14%,var(--surface))] px-2.5 py-0.5 text-xs font-black tracking-wide text-[var(--color-green-700)]">
                  {{ group.title }}
                </span>
                <span class="text-xs font-medium tabular-nums text-[var(--muted-ink)]">
                  {{ groupOrderLabel(group.candidates.map(item => item.number)) }}
                </span>
              </div>

              <div class="mt-2.5 grid grid-cols-2 gap-2.5">
                <article
                  v-for="candidate in group.candidates"
                  :key="candidate.singerId"
                  class="flex flex-col justify-between gap-2 rounded-xl border bg-[var(--surface)] p-2.5 shadow-xs"
                  :class="standingOf(candidate.singerId)?.rank === 1 && (standingOf(candidate.singerId)?.count ?? 0) > 0
                    ? 'border-rose-400/80 ring-1 ring-rose-500/20'
                    : 'border-[var(--line)]'"
                >
                  <div class="flex items-center gap-2.5">
                    <div class="size-12 shrink-0 overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--color-green-600)_10%,var(--surface-sunken))] xl:size-14">
                      <img
                        v-if="candidate.photoUrl"
                        :src="candidate.photoUrl"
                        :alt="`${candidate.number}号选手 ${candidate.name}`"
                        class="size-full object-cover"
                        referrerpolicy="no-referrer"
                      >
                      <span
                        v-else
                        class="grid size-full place-items-center text-lg font-black text-[var(--color-green-700)]"
                      >{{ candidate.name.slice(0, 1) }}</span>
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <span class="inline-flex shrink-0 items-center rounded-md bg-[color-mix(in_srgb,var(--color-green-600)_14%,var(--surface))] px-1.5 py-0.5 text-[11px] font-black tabular-nums text-[var(--color-green-700)]">
                          {{ candidate.number }}号
                        </span>
                        <p class="truncate text-sm font-black text-[var(--ink)] xl:text-base">
                          {{ candidate.name }}
                        </p>
                      </div>
                      <p class="mt-1 flex items-center gap-1 truncate text-xs text-[var(--muted-ink)]">
                        <UIcon
                          name="i-lucide-music"
                          class="size-3 shrink-0 text-[var(--color-orange-700)]"
                        />
                        <span class="truncate">《{{ candidate.song || '曲目待定' }}》</span>
                      </p>
                    </div>
                  </div>

                  <div
                    v-if="standingOf(candidate.singerId)"
                    class="space-y-1.5 border-t border-[var(--line)] pt-2"
                  >
                    <div class="flex items-baseline justify-between gap-1">
                      <span class="whitespace-nowrap text-xs text-[var(--muted-ink)]">
                        <strong class="text-lg font-black tabular-nums text-[var(--ink)] xl:text-xl">{{ standingOf(candidate.singerId)!.count }}</strong>
                        <span class="ml-0.5">票</span>
                      </span>
                      <span
                        class="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                        :class="standingOf(candidate.singerId)!.rank === 1
                          ? 'bg-rose-600 text-white shadow-xs'
                          : standingOf(candidate.singerId)!.rank !== null
                            ? 'bg-[var(--surface-sunken)] text-[var(--ink)] ring-1 ring-[var(--line)]'
                            : 'bg-[var(--surface-sunken)] text-[var(--muted-ink)]'"
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

                    <div class="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                      <div
                        class="h-full rounded-full bg-rose-600 transition-[width] duration-500"
                        :style="{ width: `${progressPercentOf(standingOf(candidate.singerId)!.count)}%` }"
                      />
                    </div>

                    <p
                      class="truncate text-[11px] font-medium leading-tight tabular-nums"
                      :class="standingOf(candidate.singerId)!.gapToPrev !== null
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-[var(--muted-ink)]'"
                    >
                      {{ standingGapText(standingOf(candidate.singerId)!) }}
                    </p>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </main>
      </div>

      <footer class="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[var(--muted-ink)]">
        <span>{{ ruleSummary }}</span>
        <span>数据每 {{ Math.min(10, Math.max(5, tokenState?.rotateSeconds ?? 10)) }} 秒自动刷新 · 按决赛出场顺序排列</span>
      </footer>
    </div>
  </div>
</template>
