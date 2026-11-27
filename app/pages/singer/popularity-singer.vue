<script setup lang="ts">
import type { CompetitionPopularityPublicState } from '~~/shared/types'
import {
  computePopularityStandingMap,
  type PopularityCandidateStanding
} from '~~/shared/utils/competition'

definePageMeta({ layout: false })

const route = useRoute()
const state = ref<CompetitionPopularityPublicState | null>(null)
const loading = ref(true)
const savingCard = ref(false)
const { sharePage, copyText } = useShareActions()
const { configureWechatShare } = useWechatShareCard()

const singerId = computed(() => String(route.query.id ?? '').trim())
const candidate = computed(() => (
  state.value?.candidates.find(item => item.singerId === singerId.value) ?? null
))
const standing = computed<PopularityCandidateStanding | null>(() => {
  if (!state.value || !candidate.value) return null
  return computePopularityStandingMap(state.value.candidates, state.value.results)
    .get(candidate.value.singerId) ?? null
})
const votes = computed(() => standing.value?.count ?? null)
const rankText = computed(() => {
  const value = standing.value
  if (!value || value.rank === null) return '暂未开榜'
  if (value.rank === 1 && value.tiedCount > 1) return '并列第 1'
  return `第 ${value.rank} 名`
})
const gapText = computed(() => {
  const value = standing.value
  if (!value || value.rank === null) return '等待投出第一票'
  if (value.gapToPrev !== null && value.prevRank !== null) return `距第 ${value.prevRank} 名差 ${value.gapToPrev} 票`
  if (value.rank === 1 && value.tiedCount > 1) return '当前并列第 1 名'
  if (value.rank === 1 && value.leadOverNext !== null) return `领先第 2 名 ${value.leadOverNext} 票`
  return '当前第 1 名'
})
const shareLink = computed(() => (candidate.value ? popularitySingerShareLink(candidate.value.singerId) : ''))
const needsFollow = computed(() => Boolean(state.value?.requiresWechatTicket))

useSeoMeta({
  title: () => (candidate.value ? `${candidate.value.number}号 ${candidate.value.name}｜人气奖投票` : '人气奖投票'),
  description: () => (candidate.value ? popularityShareDescription(candidate.value) : '仰恩大学音乐协会·新声歌手大赛人气奖投票'),
  robots: 'noindex, nofollow'
})

async function load(): Promise<void> {
  loading.value = true
  try {
    state.value = await plainFetch<CompetitionPopularityPublicState>('/api/public/competition/popularity/state')
  } catch {
    state.value = null
  } finally {
    loading.value = false
  }
}

async function shareSinger(): Promise<void> {
  const item = candidate.value
  if (!item) return
  await sharePage({
    title: popularityShareTitle(item),
    text: popularityShareDescription(item),
    url: shareLink.value,
    imageUrl: item.photoUrl || undefined
  })
}

async function saveCard(): Promise<void> {
  const item = candidate.value
  if (!item) return
  savingCard.value = true
  try {
    const qr = await plainFetch<{ dataUrl: string }>('/api/public/competition/popularity/share-qr', {
      query: { url: shareLink.value }
    })
    const blob = await renderPopularityShareCard({
      candidate: item,
      votes: votes.value,
      rankText: rankText.value,
      qrDataUrl: qr.dataUrl
    })
    downloadBlob(blob, `${item.number}-${item.name}-人气奖.png`)
  } catch {
    await copyText(shareLink.value, '选手链接')
  } finally {
    savingCard.value = false
  }
}

onMounted(() => {
  void load()
  void configureWechatShare({
    title: candidate.value ? popularityShareTitle(candidate.value) : '人气奖投票',
    description: candidate.value ? popularityShareDescription(candidate.value) : '仰恩大学音乐协会·新声歌手大赛',
    imageUrl: candidate.value?.photoUrl || new URL('/brand/music-association.png', window.location.origin).toString(),
    link: window.location.href
  })
})
</script>

<template>
  <div class="singer-canvas min-h-dvh px-3 py-5 text-[var(--ink)] sm:px-4 sm:py-8">
    <div class="mx-auto w-full max-w-lg space-y-4">
      <header class="flex items-center justify-between">
        <NuxtLink
          to="/singer/popularity"
          class="inline-flex items-center gap-1 text-sm font-bold text-[var(--muted-ink)]"
        >
          <UIcon name="i-lucide-chevron-left" class="size-4" />
          返回投票页
        </NuxtLink>
        <img src="/brand/music-association.png" alt="仰恩大学音乐协会" class="size-9">
      </header>

      <div
        v-if="loading"
        class="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-16 text-center text-sm text-[var(--muted-ink)]"
      >
        <UIcon name="i-lucide-loader-circle" class="mx-auto size-6 animate-spin" />
      </div>

      <div
        v-else-if="!candidate"
        class="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-16 text-center text-sm text-[var(--muted-ink)]"
      >
        没有找到这位选手，可能链接已失效。
      </div>

      <template v-else>
        <section class="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">
          <div class="relative aspect-[4/5] w-full overflow-hidden bg-rose-100">
            <img
              v-if="candidate.photoUrl"
              :src="candidate.photoUrl"
              :alt="candidate.name"
              class="size-full object-cover"
              referrerpolicy="no-referrer"
            >
            <span v-else class="grid size-full place-items-center text-7xl font-black text-rose-700">
              {{ candidate.name.slice(0, 1) }}
            </span>
            <span class="absolute left-3 top-3 rounded-full bg-black/65 px-3 py-1 text-sm font-bold tabular-nums text-white">
              {{ candidate.number }}号
            </span>
          </div>

          <div class="space-y-3 p-4 sm:p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h1 class="truncate text-2xl font-black leading-tight">{{ candidate.name }}</h1>
                <p class="mt-1 truncate text-sm text-[var(--muted-ink)]">{{ candidate.className || '班级未填' }}</p>
              </div>
              <div class="shrink-0 text-right">
                <p class="text-3xl font-black tabular-nums text-rose-700">
                  {{ votes === null ? '—' : votes }}
                  <span class="text-sm font-bold text-[var(--muted-ink)]">票</span>
                </p>
                <p class="mt-0.5 text-xs font-bold text-rose-700">{{ rankText }}</p>
              </div>
            </div>

            <p class="flex items-center gap-1.5 text-sm font-medium text-[var(--muted-ink)]">
              <UIcon name="i-lucide-music" class="size-4 shrink-0 text-orange-700" />
              决赛曲目《{{ candidate.song || '待定' }}》
            </p>
            <p class="text-xs font-medium text-[var(--muted-ink)]">{{ gapText }}</p>

            <div class="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                class="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white shadow-xs transition active:scale-[0.98]"
                @click="shareSinger"
              >
                <UIcon name="i-lucide-share-2" class="size-4" />
                分享给朋友
              </button>
              <button
                type="button"
                class="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-bold transition active:scale-[0.98] disabled:opacity-60"
                :disabled="savingCard"
                @click="saveCard"
              >
                <UIcon
                  :name="savingCard ? 'i-lucide-loader-circle' : 'i-lucide-image-down'"
                  class="size-4"
                  :class="savingCard ? 'animate-spin' : ''"
                />
                保存卡片图
              </button>
            </div>

            <NuxtLink
              :to="`/singer/popularity?id=${encodeURIComponent(candidate.singerId)}`"
              class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-bold"
            >
              <UIcon name="i-lucide-vote" class="size-4" />
              去投票页给 TA 投票
            </NuxtLink>
          </div>
        </section>

        <section
          v-if="needsFollow && state?.wechatQrUrl"
          class="rounded-3xl border border-rose-200 bg-rose-50/80 p-4 text-center"
        >
          <p class="text-sm font-black text-rose-700">
            投票前需要先关注公众号「{{ state.wechatAccountName || '仰大音乐馆' }}」
          </p>
          <img
            :src="state.wechatQrUrl"
            alt="公众号二维码"
            class="mx-auto mt-3 size-40 rounded-2xl bg-white object-contain p-2 shadow-sm"
          >
          <p class="mt-2 text-xs font-medium text-rose-700/80">
            长按识别关注后，发送「投票」领取专属链接，再回到这里点「去投票页」。
          </p>
        </section>

        <p class="px-1 text-center text-[11px] text-[var(--muted-ink)]">
          仰恩大学音乐协会 · 新声歌手大赛决赛 · 一人一微信号限票
        </p>
      </template>
    </div>
  </div>
</template>
