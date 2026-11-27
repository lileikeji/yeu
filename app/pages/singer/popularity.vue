<script setup lang="ts">
import type { LocationQuery } from 'vue-router'
import { DEFAULT_SHARE_ICON_URL } from '~~/shared/config/brand'
import type { CompetitionPopularityPublicState } from '~~/shared/types'
import {
  groupPopularityCandidates,
  resolvePopularityStandingMap,
  type PopularityCandidateStanding
} from '~~/shared/utils/competition'
import { solvePopularityVotePow } from '~~/shared/utils/popularity-pow'
import { primePopularityFingerprint, readPopularityFingerprint } from '~/composables/usePopularityTelemetry'
import { itempropMeta } from '~/utils/itemprop-meta'
import { resolvePopularityPageSharePayload } from '~/utils/popularity-share'
import {
  createVoteBurstController,
  resolveElementCenterPoint,
  type VoteBurstItem
} from '~/utils/vote-burst'

definePageMeta({ layout: false })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const requestUrl = useRequestURL()
const requestFetch = useRequestFetch()
const { configureWechatShare } = useWechatShareCard()
const token = computed(() => String(route.query.t ?? '').trim())
const state = ref<CompetitionPopularityPublicState | null>(null)
const loading = ref(true)
const savingId = ref('')
const error = ref('')
const now = ref(Date.now())
const wechatGuideRef = ref<HTMLElement | null>(null)
const voteBursts = shallowRef<readonly VoteBurstItem[]>([])
const justVotedId = ref('')
const cowCheering = ref(false)
let justVotedTimer: ReturnType<typeof setTimeout> | null = null
let cowCheerTimer: ReturnType<typeof setTimeout> | null = null

const burstController = createVoteBurstController({
  onChange: (items) => {
    voteBursts.value = items
  }
})

function triggerCowCheer(anchorEl?: HTMLElement | null): void {
  if (import.meta.client) {
    cowCheering.value = false
    requestAnimationFrame(() => {
      cowCheering.value = true
    })
  }
  if (cowCheerTimer) clearTimeout(cowCheerTimer)
  cowCheerTimer = setTimeout(() => {
    cowCheering.value = false
  }, 720)
  if (anchorEl) {
    const point = resolveElementCenterPoint(anchorEl)
    burstController.trigger({ ...point, label: '加油!' })
  }
}

const { data: publicSeed } = await useAsyncData<CompetitionPopularityPublicState | null>(
  'competition-popularity-public',
  async () => {
    try {
      return await requestFetch<CompetitionPopularityPublicState>('/api/public/competition/popularity/state')
    } catch {
      return null
    }
  },
  { default: () => null }
)

const activeState = computed(() => state.value ?? publicSeed.value)
const selectedSingerId = computed(() => String(route.query.id ?? '').trim())
const sheetCandidate = computed(() => {
  if (!selectedSingerId.value) return null
  return activeState.value?.candidates.find(item => item.singerId === selectedSingerId.value) ?? null
})
const sharePayload = computed(() => resolvePopularityPageSharePayload({
  title: activeState.value?.title,
  subtitle: activeState.value?.subtitle,
  candidate: sheetCandidate.value,
  origin: requestUrl.origin
}))
const fallbackShareImage = useState<string>('wechat-fallback-share-image', () => sharePayload.value.imageUrl)
fallbackShareImage.value = sharePayload.value.imageUrl

useHead({
  meta: [
    itempropMeta('name', () => sharePayload.value.title),
    itempropMeta('description', () => sharePayload.value.description),
    itempropMeta('image', () => sharePayload.value.imageUrl)
  ]
})

useSeoMeta({
  title: () => sharePayload.value.title,
  description: () => sharePayload.value.description,
  ogTitle: () => sharePayload.value.title,
  ogDescription: () => sharePayload.value.description,
  ogType: 'website',
  ogImage: () => sharePayload.value.imageUrl,
  twitterCard: 'summary',
  twitterImage: () => sharePayload.value.imageUrl,
  robots: 'noindex, nofollow'
})

const DEVICE_STORAGE_KEY = 'yeu:popularity-device:v1'
const WECHAT_TICKET_STORAGE_KEY = 'yeu:popularity-wechat-ticket:v1'
let timer: ReturnType<typeof setInterval> | null = null

function buildRouteQuery(nextSingerId?: string): LocationQuery {
  const next: LocationQuery = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'vt' || key === 'id' || value === undefined) continue
    next[key] = value
  }
  if (nextSingerId) {
    next.id = nextSingerId
  }
  return next
}

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

async function syncWechatTicketFromLocation(): Promise<void> {
  const queryVt = String(route.query.vt ?? '').trim()
  if (!queryVt) return
  persistWechatTicket(queryVt)
  try {
    await router.replace({ query: buildRouteQuery(selectedSingerId.value || undefined) })
  } catch {
    // 忽略路由替换限制
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
    void syncWechatShare()
  }
}

function readWebglRenderer(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return ''
    const webgl = gl as WebGLRenderingContext
    const ext = webgl.getExtension('WEBGL_debug_renderer_info')
    const raw = ext
      ? webgl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : webgl.getParameter(webgl.RENDERER)
    return typeof raw === 'string' ? raw.trim().slice(0, 120) : ''
  } catch {
    return ''
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
    const cores = Math.min(128, Math.max(0, Number(navigator.hardwareConcurrency ?? 0) || 0))
    const memRaw = Number((navigator as { deviceMemory?: number }).deviceMemory ?? 0)
    const mem = Number.isFinite(memRaw) && memRaw > 0 ? Math.min(1024, memRaw) : undefined
    const dprRaw = Number(window.devicePixelRatio ?? 1)
    const dpr = Number.isFinite(dprRaw) && dprRaw > 0 ? Math.min(800, Math.max(50, Math.round(dprRaw * 100))) : undefined
    const gpu = readWebglRenderer()
    const wd = Boolean((navigator as { webdriver?: boolean }).webdriver)
    return {
      ...(tz ? { tz } : {}),
      ...(lang ? { lang } : {}),
      ...(screen ? { screen } : {}),
      touch,
      ...(cores > 0 ? { cores } : {}),
      ...(mem !== undefined ? { mem } : {}),
      ...(dpr !== undefined ? { dpr } : {}),
      ...(gpu ? { gpu } : {}),
      wd,
      ...readPopularityFingerprint()
    }
  } catch {
    return undefined
  }
}

function focusWechatGuide(): void {
  wechatGuideRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  toast.add({
    title: `普通票已投满，向公众号「${state.value?.wechatAccountName || '仰恩大学指南'}」发送「投票」可再领 ${bonusVotes.value} 票`,
    color: 'warning'
  })
}

async function vote(singerId: string, anchorEl?: HTMLElement | null): Promise<void> {
  if (!state.value || savingId.value) return
  if (state.value.requiresWechatTicket) {
    toast.add({
      title: `请先向公众号「${state.value.wechatAccountName || '仰恩大学指南'}」发送大屏口令领专属链接`,
      color: 'warning'
    })
    return
  }
  if (state.value.requiresQrScan) {
    toast.add({
      title: '请先扫描现场大屏上的最新二维码再投票',
      color: 'warning'
    })
    return
  }
  if (state.value.status !== 'open') {
    toast.add({ title: '投票还没开始或已经截止', color: 'warning' })
    return
  }
  if (hybridNeedWechatForBonus.value) {
    focusWechatGuide()
    return
  }
  if (multiVote.value && votesRemaining.value <= 0) {
    toast.add({ title: '你的票已经投满，不能继续投', color: 'warning' })
    return
  }
  if (slotMode.value && !allowRepeatVote.value && voteCountOf(singerId) > 0) {
    toast.add({ title: '同一选手最多投 1 票，请投给其他选手', color: 'warning' })
    return
  }
  if (!slotMode.value && state.value.myBallot?.singerId === singerId) {
    toast.add({ title: '你已经投给这位选手了', color: 'neutral' })
    return
  }
  if (!slotMode.value && state.value.myBallot && !state.value.canChange) {
    toast.add({ title: '你已投票，不能继续改票', color: 'warning' })
    return
  }
  const fallbackPoint = resolveElementCenterPoint(anchorEl)
  savingId.value = singerId
  try {
    const device = readDeviceToken()
    const vt = readWechatTicket()
    const env = collectClientEnv()
    const pageTicket = state.value.pageTicket
    const pow = !vt && pageTicket ? solvePopularityVotePow(pageTicket, singerId) : undefined
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
          ...(pageTicket ? { pageTicket } : {}),
          ...(pow ? { pow } : {}),
          ...(env ? { env } : {})
        }
      }
    )
    const changed = !slotMode.value && votesUsed.value > 0
    state.value = next
    persistDeviceToken(next.deviceToken)
    await nextTick()
    const point = resolveElementCenterPoint(anchorEl, fallbackPoint)
    burstController.trigger({ ...point, label: changed ? '已改投' : '+1 票' })
    justVotedId.value = singerId
    if (justVotedTimer) clearTimeout(justVotedTimer)
    justVotedTimer = setTimeout(() => {
      justVotedId.value = ''
    }, 680)
    triggerCowCheer()
    toast.add({
      title: slotMode.value
        ? (next.authMode === 'hybrid' && !next.wechatVerified && (next.wechatBonusVotes ?? 0) > 0 && next.votesRemaining <= 0
            ? `基础票投票成功！关注公众号可再得 ${next.wechatBonusVotes} 票`
            : `投票成功（已投 ${next.votesUsed}/${next.votesPerVoter} 票）`)
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
    if (err.statusCode === 409 || err.data?.data?.blockCode === 'MISSING_OR_INVALID_PAGE_TICKET' || err.data?.data?.blockCode === 'INVALID_VOTE_PROOF') {
      void load()
    }
  } finally {
    savingId.value = ''
  }
}

async function withdrawVote(singerId?: string): Promise<void> {
  if (!state.value || savingId.value) return
  const target = singerId ?? state.value.myBallot?.singerId
  if (!target) return
  savingId.value = `withdraw:${target}`
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
    toast.add({ title: '已取消 1 票，可以重新选择', color: 'success' })
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

const isHybridMode = computed(() => state.value?.authMode === 'hybrid')
const bonusVotes = computed(() => (isHybridMode.value ? Math.max(0, state.value?.wechatBonusVotes ?? 2) : 0))
const maxVotesPerVoter = computed(() => Math.max(1, state.value?.maxVotesPerVoter ?? ((state.value?.votesPerVoter ?? 1) + bonusVotes.value)))
const votesPerVoter = computed(() => Math.max(1, state.value?.votesPerVoter ?? 1))
const votesUsed = computed(() => state.value?.votesUsed ?? 0)
const votesRemaining = computed(() => state.value?.votesRemaining ?? Math.max(0, votesPerVoter.value - votesUsed.value))
const multiVote = computed(() => votesPerVoter.value > 1)
const slotMode = computed(() => maxVotesPerVoter.value > 1 || multiVote.value)
const hybridNeedWechatForBonus = computed(() => (
  isHybridMode.value
  && !state.value?.wechatVerified
  && bonusVotes.value > 0
  && votesRemaining.value <= 0
  && votesUsed.value < maxVotesPerVoter.value
))
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
  && !state.value?.requiresQrScan
  && state.value?.status === 'open'
  && (state.value?.candidates.length ?? 0) > 0
  && (!slotMode.value || votesRemaining.value > 0)
))
function canVoteFor(singerId: string): boolean {
  if (!canVote.value) return false
  return !(slotMode.value && !allowRepeatVote.value && voteCountOf(singerId) > 0)
}
const hasBallot = computed(() => votesUsed.value > 0)
const hasGuideCard = computed(() => {
  if (!state.value) return false
  if (state.value.requiresWechatTicket) return true
  return isHybridMode.value && !state.value.wechatVerified && bonusVotes.value > 0
})
type NoticeBarMode = 'ballot-single' | 'ballot-withdraw' | 'qr-required' | 'unavailable' | 'cheer'
const noticeMode = computed<NoticeBarMode | null>(() => {
  if (!state.value) return null
  if (hasBallot.value && !slotMode.value) return 'ballot-single'
  if (hasBallot.value && slotMode.value && state.value.canWithdraw) return 'ballot-withdraw'
  if (!hasBallot.value && state.value.requiresQrScan) return 'qr-required'
  if (!hasBallot.value && !canVote.value && !state.value.requiresWechatTicket && !state.value.requiresQrScan) return 'unavailable'
  if (!hasGuideCard.value) return 'cheer'
  return null
})
const noticeToneClass = computed(() => {
  if (noticeMode.value === 'ballot-single' || noticeMode.value === 'ballot-withdraw') {
    return 'border-rose-300/70 bg-rose-500/10'
  }
  if (noticeMode.value === 'qr-required' || noticeMode.value === 'unavailable') {
    return 'border-amber-400/50 bg-[color-mix(in_srgb,var(--color-orange-500)_10%,var(--surface))]'
  }
  return 'border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)]'
})
const candidateGroups = computed(() => groupPopularityCandidates(state.value?.candidates ?? []))
const standingMap = computed(() => (
  activeState.value
    ? resolvePopularityStandingMap(activeState.value.candidates, activeState.value.results, activeState.value.standings)
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
  const showExactVotes = Boolean(activeState.value?.showResults)
  if (standing.rank === null) return '等待投出第一票'
  if (standing.gapToPrev !== null && standing.prevRank !== null) {
    return showExactVotes
      ? `距第 ${standing.prevRank} 名差 ${standing.gapToPrev} 票`
      : `距前一名差 ${standing.gapToPrev} 票`
  }
  if (standing.rank === 1 && standing.tiedCount > 1) return '当前并列第 1 名'
  if (showExactVotes && standing.rank === 1 && standing.leadOverNext !== null) return `领先第 2 名 ${standing.leadOverNext} 票`
  return '当前第 1 名'
}

const sheetStanding = computed(() => (
  sheetCandidate.value ? standingOf(sheetCandidate.value.singerId) : null
))
const sheetRankText = computed(() => {
  const value = sheetStanding.value
  if (!value || value.rank === null) return '暂未开榜'
  if (value.rank === 1 && value.tiedCount > 1) return '并列第 1'
  return `第 ${value.rank} 名`
})
const sheetGapText = computed(() => (sheetStanding.value ? standingGapText(sheetStanding.value) : ''))

async function syncWechatShare(): Promise<void> {
  fallbackShareImage.value = sharePayload.value.imageUrl
  if (!import.meta.client) return
  await nextTick()
  await configureWechatShare(sharePayload.value)
}

async function openSheet(singerId: string): Promise<void> {
  if (selectedSingerId.value !== singerId) {
    await router.replace({ query: buildRouteQuery(singerId) })
  }
  void syncWechatShare()
}

async function closeSheet(): Promise<void> {
  if (selectedSingerId.value) {
    await router.replace({ query: buildRouteQuery(undefined) })
  }
  void syncWechatShare()
}

function voteLabelFor(singerId: string): string {
  if (!state.value) return '投给 TA'
  if (state.value.requiresWechatTicket) return '请先从公众号领链接'
  if (state.value.requiresQrScan) return '请扫现场大屏码'
  if (hybridNeedWechatForBonus.value) return `关注再投 ${bonusVotes.value} 票`
  if (slotMode.value && votesRemaining.value <= 0) return '票已投满'
  if (slotMode.value && !allowRepeatVote.value && voteCountOf(singerId) > 0) return '同一选手限一票'
  if (slotMode.value) return voteCountOf(singerId) > 0 ? '再投一票' : '投给 TA'
  if (voteCountOf(singerId) > 0) return '你已投票'
  if (hasBallot.value && !state.value.canChange) return '你已投票'
  if (hasBallot.value) return '改投 TA'
  return '投给 TA'
}

function voteDisabledFor(singerId: string): boolean {
  if (!state.value) return true
  if (savingId.value) return true
  if (hybridNeedWechatForBonus.value && state.value.status === 'open') return false
  if (!canVoteFor(singerId)) return true
  if (slotMode.value) {
    return votesRemaining.value <= 0 || (!allowRepeatVote.value && voteCountOf(singerId) > 0)
  }
  return (hasBallot.value && !state.value.canChange) || voteCountOf(singerId) > 0
}

async function voteFromSheet(singerId: string, anchorEl?: HTMLElement | null): Promise<void> {
  await vote(singerId, anchorEl)
  await closeSheet()
}

/** 访问埋点：页面打开打一发，服务端负责拆设备/浏览器并区分公众号来源。 */async function reportVisit(): Promise<void> {
  try {
    const vt = readWechatTicket()
    await plainFetch<{ ok: boolean }>('/api/public/competition/popularity/visit', {
      method: 'POST',
      body: { page: 'vote', ...(vt ? { vt } : {}) }
    })
  } catch {
    // 埋点失败不影响阅读与投票。
  }
}

onMounted(async () => {
  await syncWechatTicketFromLocation()
  void reportVisit()
  void load()
  void syncWechatShare()
  primePopularityFingerprint()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (justVotedTimer) clearTimeout(justVotedTimer)
  if (cowCheerTimer) clearTimeout(cowCheerTimer)
  burstController.dispose()
  fallbackShareImage.value = DEFAULT_SHARE_ICON_URL
})
</script>

<template>
  <div class="singer-canvas min-h-dvh px-3 py-5 text-[var(--ink)] sm:px-4 sm:py-7">
    <div class="mx-auto w-full max-w-3xl space-y-4">
      <header class="text-center">
        <div class="mb-2.5 flex items-center justify-center gap-3.5">
          <img
            src="/brand/music-association.png"
            alt="仰恩大学音乐协会"
            class="size-10 drop-shadow-sm"
          >
          <span class="h-7 w-px bg-[var(--line)]" />
          <img
            src="/brand/yougong.png"
            alt="优公教育"
            class="h-6 w-auto"
          >
        </div>
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
              <div
                v-if="state?.showResults"
                class="text-right"
              >
                <span class="text-base font-black tabular-nums text-[var(--ink)]">{{ state?.totalVotes ?? 0 }}</span>
                <span class="ml-1 text-xs text-[var(--muted-ink)]">{{ slotMode ? '总票数' : '人已投' }}</span>
              </div>
              <span
                v-else-if="state"
                class="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-medium text-[var(--muted-ink)]"
              >
                {{ state.showRankGap ? '票数暂不公布 · 仅看差票' : '票数暂不公布' }}
              </span>
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
            v-if="slotMode"
            class="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-2 text-xs"
          >
            <span class="font-semibold text-[var(--ink)]">
              我的票数 <span class="tabular-nums text-rose-600 dark:text-rose-400">{{ votesUsed }}/{{ votesPerVoter }}</span>
              <span
                v-if="isHybridMode && !state?.wechatVerified && bonusVotes > 0"
                class="ml-1 font-medium text-[var(--color-green-700)]"
              >（关注公众号再 +{{ bonusVotes }} 票）</span>
            </span>
            <span class="text-[var(--muted-ink)]">
              <template v-if="votesRemaining > 0">
                还可投 <strong class="text-[var(--ink)]">{{ votesRemaining }}</strong> 票 · {{ allowRepeatVote ? '可投同一选手' : '每位选手限 1 票' }}
              </template>
              <template v-else-if="hybridNeedWechatForBonus">
                基础票已投满 · 关注公众号还可投 {{ bonusVotes }} 票
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
          <div class="flex shrink-0 items-end gap-2 self-center">
            <div
              v-if="state.wechatQrUrl"
              class="flex flex-col items-center gap-1"
            >
              <img
                :src="state.wechatQrUrl"
                :alt="state.wechatAccountName || '公众号二维码'"
                class="size-24 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] object-contain p-1"
              >
              <span class="text-[11px] font-semibold text-[var(--muted-ink)]">长按识别关注</span>
            </div>
            <button
              type="button"
              aria-label="优公牛牛为你点赞"
              class="shrink-0 cursor-pointer rounded-xl p-0.5 transition active:scale-95"
              :class="state.wechatQrUrl ? 'mb-4' : ''"
              @click="triggerCowCheer($event.currentTarget as HTMLElement | null)"
            >
              <img
                src="/brand/yougong-cow.png"
                alt="优公牛牛"
                class="h-16 w-auto select-none sm:h-20"
                :class="{ 'cow-cheer-anim': cowCheering }"
              >
            </button>
          </div>
        </div>

        <div
          v-if="isHybridMode && !state.wechatVerified && bonusVotes > 0"
          ref="wechatGuideRef"
          class="flex flex-col gap-3 rounded-3xl border border-emerald-400/50 bg-[var(--surface)] p-4 text-sm text-[var(--ink)] shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="space-y-1.5">
            <p class="font-bold text-[var(--color-green-700)]">
              免关注可直接投 {{ state.votesPerVoter }} 票 · 关注公众号再多得 {{ bonusVotes }} 票
            </p>
            <p class="text-xs leading-relaxed text-[var(--muted-ink)]">
              1. 无需关注即可先投出 <strong>{{ state.votesPerVoter }}</strong> 票；<br>
              2. 微信关注「<strong>{{ state.wechatAccountName || '仰恩大学指南' }}</strong>」并发送<template v-if="state.passcodeRequired">
                大屏口令「<strong>投票 XX</strong>」
              </template><template v-else>
                「<strong>投票</strong>」
              </template>，点回复链接即可多解锁 <strong>{{ bonusVotes }}</strong> 票；<br>
              3. {{ allowRepeatVote ? '全部票都可自由投给同一位选手，也可分投多人。' : '每位选手最多可投 1 票。' }}
            </p>
          </div>
          <div class="flex shrink-0 items-end gap-2 self-center">
            <div
              v-if="state.wechatQrUrl"
              class="flex flex-col items-center gap-1"
            >
              <img
                :src="state.wechatQrUrl"
                :alt="state.wechatAccountName || '公众号二维码'"
                class="size-24 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] object-contain p-1"
              >
              <span class="text-[11px] font-semibold text-[var(--muted-ink)]">长按识别加 {{ bonusVotes }} 票</span>
            </div>
            <button
              type="button"
              aria-label="优公牛牛为你点赞"
              class="shrink-0 cursor-pointer rounded-xl p-0.5 transition active:scale-95"
              :class="state.wechatQrUrl ? 'mb-4' : ''"
              @click="triggerCowCheer($event.currentTarget as HTMLElement | null)"
            >
              <img
                src="/brand/yougong-cow.png"
                alt="优公牛牛"
                class="h-16 w-auto select-none sm:h-20"
                :class="{ 'cow-cheer-anim': cowCheering }"
              >
            </button>
          </div>
        </div>

        <div
          v-if="noticeMode"
          class="flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-sm text-[var(--ink)] shadow-sm"
          :class="noticeToneClass"
        >
          <div class="min-w-0 flex-1">
            <p v-if="noticeMode === 'ballot-single'">
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
                {{ savingId.startsWith('withdraw:') ? '取消中…' : '取消投票' }}
              </button>
            </p>
            <p
              v-else-if="noticeMode === 'ballot-withdraw'"
              class="text-xs leading-relaxed"
            >
              已投 <strong>{{ votesUsed }}</strong> 票（可在下方选手卡片点「撤回 1 票」重投）。
            </p>
            <p v-else-if="noticeMode === 'qr-required'">
              当前为只读分享预览；如需投票，请扫描现场大屏上的最新二维码进入。
            </p>
            <p v-else-if="noticeMode === 'unavailable'">
              {{ state.status === 'scheduled' ? '还没到开始时间，先看看出场选手。' : state.status === 'closed' ? '投票已经截止。' : state.status === 'disabled' ? '主办方还没开启人气奖投票。' : '暂无可投票的候选名单。' }}
            </p>
            <div
              v-else
              class="space-y-0.5"
            >
              <p class="text-sm font-bold text-[var(--ink)]">
                {{ isHybridMode && state.wechatVerified
                  ? `微信已核验，可投共 ${maxVotesPerVoter} 票`
                  : slotMode && hasBallot && votesRemaining > 0
                    ? `已投 ${votesUsed}/${votesPerVoter} 票，还可投 ${votesRemaining} 票`
                    : slotMode && votesRemaining <= 0
                      ? `本轮 ${votesPerVoter} 票已全部投出`
                      : '点击下方「投给 TA」为你喜欢的歌手点赞' }}
              </p>
              <p class="text-xs text-[var(--muted-ink)]">
                {{ slotMode && votesRemaining > 0
                  ? (allowRepeatVote ? '可继续投同一位或改投其他选手' : '每位选手最多可投 1 票')
                  : '优公牛牛为你加油 · 点选手照片可生成应援海报' }}
              </p>
            </div>
          </div>

          <button
            v-if="!hasGuideCard"
            type="button"
            aria-label="优公牛牛为你点赞"
            class="shrink-0 cursor-pointer rounded-xl p-0.5 transition active:scale-95"
            @click="triggerCowCheer($event.currentTarget as HTMLElement | null)"
          >
            <img
              src="/brand/yougong-cow.png"
              alt="优公牛牛"
              class="h-14 w-auto select-none sm:h-16"
              :class="{ 'cow-cheer-anim': cowCheering }"
            >
          </button>
        </div>

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
                :class="[
                  voteCountOf(candidate.singerId) > 0
                    ? 'border-rose-400 ring-2 ring-rose-500/25'
                    : 'border-[var(--line)]',
                  justVotedId === candidate.singerId ? 'vote-card-pop' : ''
                ]"
              >
                <div
                  class="relative aspect-[4/5] cursor-pointer overflow-hidden bg-[color-mix(in_srgb,var(--color-green-600)_10%,var(--surface-sunken))]"
                  role="button"
                  tabindex="0"
                  :aria-label="`查看 ${candidate.number}号 ${candidate.name} 的详情`"
                  @click="openSheet(candidate.singerId)"
                  @keydown.enter.prevent="openSheet(candidate.singerId)"
                >
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
                    <div
                      v-if="state.showResults"
                      class="flex items-center justify-between gap-1"
                    >
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
                    <div
                      v-else
                      class="flex items-center justify-between gap-1.5"
                    >
                      <span
                        class="min-w-0 truncate text-[11px] font-bold leading-tight tabular-nums"
                        :class="standingOf(candidate.singerId)!.gapToPrev !== null
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-[var(--muted-ink)]'"
                      >
                        {{ standingGapText(standingOf(candidate.singerId)!) }}
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
                      v-if="state.showResults"
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
                    :class="voteCountOf(candidate.singerId) > 0 && !canVoteFor(candidate.singerId)
                      ? 'bg-rose-500/12 text-rose-700 ring-1 ring-rose-400/60 dark:text-rose-300'
                      : 'bg-rose-600 text-white shadow-xs hover:bg-rose-700 disabled:opacity-55'"
                    :disabled="voteDisabledFor(candidate.singerId)"
                    @click="vote(candidate.singerId, $event.currentTarget as HTMLElement | null)"
                  >
                    <UIcon
                      v-if="savingId === candidate.singerId"
                      name="i-lucide-loader-circle"
                      class="size-4 animate-spin"
                    />
                    <template v-else>
                      <svg
                        v-if="!voteDisabledFor(candidate.singerId) && !hybridNeedWechatForBonus"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        class="size-3.5 shrink-0"
                        aria-hidden="true"
                      >
                        <path d="M5.2 6.8V14H2.8a1 1 0 0 1-1-1V7.8a1 1 0 0 1 1-1h2.4Zm1.3 0 2.1-4.3a1.1 1.1 0 0 1 2 .5v2.6h2.6a1.3 1.3 0 0 1 1.3 1.5l-.8 5.2a1.4 1.4 0 0 1-1.4 1.2H6.5V6.8Z" />
                      </svg>
                      <span>{{ voteLabelFor(candidate.singerId) }}</span>
                    </template>
                  </button>
                  <button
                    v-if="slotMode && state.canWithdraw && voteCountOf(candidate.singerId) > 0"
                    type="button"
                    class="mt-1.5 w-full rounded-lg border border-rose-300/70 px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-55 dark:text-rose-300"
                    :disabled="Boolean(savingId)"
                    @click="withdrawVote(candidate.singerId)"
                  >
                    {{ savingId === `withdraw:${candidate.singerId}` ? '撤回中…' : '撤回 1 票' }}
                  </button>
                </div>
              </article>
            </div>
          </section>
        </div>

        <p class="pt-1 text-center text-xs leading-relaxed text-[var(--muted-ink)]">
          {{ isHybridMode
            ? `无需关注即可直接投 ${state.votesPerVoter - (state.wechatVerified ? bonusVotes : 0)} 票，关注公众号可再获 ${bonusVotes} 票（共 ${maxVotesPerVoter} 票，${allowRepeatVote ? '可全投同一位选手' : '每位选手限 1 票'}）。`
            : slotMode
              ? `每人最多 ${votesPerVoter} 票，${allowRepeatVote ? '可投给不同或同一位选手' : '同一选手最多 1 票'}；${state.allowWithdraw ? '投错了可点「撤回 1 票」重投。' : '投出后不能改票。'}`
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

    <ClientOnly>
      <CompetitionVoteBurstLayer :bursts="voteBursts" />
      <CompetitionPopularitySingerSheet
        :candidate="sheetCandidate"
        :show-results="Boolean(activeState?.showResults)"
        :show-rank-gap="Boolean(activeState?.showRankGap)"
        :votes="activeState?.showResults && sheetStanding ? sheetStanding.count : null"
        :rank-text="sheetRankText"
        :gap-text="sheetGapText"
        :vote-label="sheetCandidate ? voteLabelFor(sheetCandidate.singerId) : '投给 TA'"
        :vote-disabled="sheetCandidate ? voteDisabledFor(sheetCandidate.singerId) : true"
        :busy="Boolean(savingId)"
        @close="closeSheet"
        @vote="voteFromSheet"
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
.cow-cheer-anim {
  animation: cow-cheer-bounce 680ms var(--ease-soft-fade);
}

.vote-card-pop {
  animation: vote-card-pulse 520ms var(--ease-soft-fade);
}

@keyframes cow-cheer-bounce {
  0% {
    transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
  }
  28% {
    transform: translate3d(0, -8px, 0) scale(1.1) rotate(-5deg);
  }
  58% {
    transform: translate3d(0, -2px, 0) scale(1.04) rotate(4deg);
  }
  100% {
    transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
  }
}

@keyframes vote-card-pulse {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.025);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cow-cheer-anim,
  .vote-card-pop {
    animation: none;
  }
}
</style>
