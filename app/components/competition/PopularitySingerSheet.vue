<script setup lang="ts">
import type { CompetitionPopularityCandidate } from '~~/shared/types'

interface Props {
  candidate: CompetitionPopularityCandidate | null
  votes: number | null
  rankText: string
  gapText: string
  voteLabel: string
  voteDisabled: boolean
  busy: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: []; vote: [singerId: string] }>()

const { sharePage, copyText } = useShareActions()
const sharing = ref(false)
const savingCard = ref(false)

const open = computed(() => Boolean(props.candidate))
const link = computed(() => (props.candidate ? popularitySingerShareLink(props.candidate.singerId) : ''))

async function shareToFriend(): Promise<void> {
  const candidate = props.candidate
  if (!candidate) return
  sharing.value = true
  try {
    await sharePage({
      title: popularityShareTitle(candidate),
      text: popularityShareDescription(candidate),
      url: link.value,
      imageUrl: candidate.photoUrl || undefined
    })
  } finally {
    sharing.value = false
  }
}

async function saveCard(): Promise<void> {
  const candidate = props.candidate
  if (!candidate) return
  savingCard.value = true
  try {
    const qr = await plainFetch<{ dataUrl: string }>('/api/public/competition/popularity/share-qr', {
      query: { url: link.value }
    })
    const blob = await renderPopularityShareCard({
      candidate,
      votes: props.votes,
      rankText: props.rankText,
      qrDataUrl: qr.dataUrl
    })
    downloadBlob(blob, `${candidate.number}-${candidate.name}-人气奖.png`)
  } catch {
    await copyText(link.value, '选手链接')
  } finally {
    savingCard.value = false
  }
}

function openDetail(): void {
  if (!props.candidate) return
  void navigateTo(popularitySingerPath(props.candidate.singerId))
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(open, (value) => {
  if (!import.meta.client) return
  if (value) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  if (import.meta.client) document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="scale-95 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="scale-95 opacity-0"
    >
      <div
        v-if="candidate"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div class="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl bg-[var(--surface)] text-[var(--ink)] shadow-2xl">
          <div class="relative">
            <div class="relative h-[36vh] max-h-[360px] min-h-[200px] w-full overflow-hidden rounded-t-3xl bg-rose-100">

              <img
                v-if="candidate.photoUrl"
                :src="candidate.photoUrl"
                :alt="candidate.name"
                class="size-full object-cover"
                referrerpolicy="no-referrer"
              >
              <span
                v-else
                class="grid size-full place-items-center text-7xl font-black text-rose-700"
              >{{ candidate.name.slice(0, 1) }}</span>
              <button
                type="button"
                class="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
                aria-label="关闭"
                @click="emit('close')"
              >
                <UIcon name="i-lucide-x" class="size-5" />
              </button>
              <span class="absolute left-3 top-3 rounded-full bg-black/65 px-3 py-1 text-sm font-bold tabular-nums text-white">
                {{ candidate.number }}号
              </span>
            </div>

            <div class="space-y-3 p-4 sm:p-5">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-2xl font-black leading-tight">
                    {{ candidate.name }}
                  </p>
                  <p class="mt-1 truncate text-sm text-[var(--muted-ink)]">
                    {{ candidate.className || '班级未填' }}
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="text-2xl font-black tabular-nums text-rose-700">
                    {{ votes === null ? '—' : votes }}
                    <span class="text-sm font-bold text-[var(--muted-ink)]">票</span>
                  </p>
                  <p class="mt-0.5 text-xs font-bold text-rose-700">
                    {{ rankText }}
                  </p>
                </div>
              </div>

              <p class="flex items-center gap-1.5 text-sm font-medium text-[var(--muted-ink)]">
                <UIcon name="i-lucide-music" class="size-4 shrink-0 text-orange-700" />
                <span class="truncate">《{{ candidate.song || '曲目待定' }}》</span>
              </p>

              <p class="text-xs font-medium text-[var(--muted-ink)]">
                {{ gapText }}
              </p>

              <div class="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  class="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-bold transition active:scale-[0.98] disabled:opacity-60"
                  :disabled="sharing"
                  @click="shareToFriend"
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

              <button
                type="button"
                class="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-xs transition active:scale-[0.98] disabled:opacity-55"
                :disabled="voteDisabled || busy"
                @click="emit('vote', candidate.singerId)"
              >
                <UIcon v-if="busy" name="i-lucide-loader-circle" class="size-4 animate-spin" />
                {{ voteLabel }}
              </button>

              <button
                type="button"
                class="w-full rounded-xl px-4 py-2 text-xs font-bold text-[var(--muted-ink)] underline decoration-dotted"
                @click="openDetail"
              >
                打开专属详情页
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
