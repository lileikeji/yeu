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
const cardPreviewUrl = ref('')
const cardFileName = ref('人气奖投票.png')
const photoFailed = ref(false)
const photoZoom = ref(false)

const open = computed(() => Boolean(props.candidate))
const photoFallback = computed(() => props.candidate?.name?.slice(0, 1) || '?')
const link = computed(() => (props.candidate ? popularitySingerShareLink(props.candidate.singerId) : ''))
const photoSrc = computed(() =>
  props.candidate ? popularitySingerPhotoPath(props.candidate.singerId, props.candidate.photoUrl) : '',
)

async function shareToFriend(): Promise<void> {
  const candidate = props.candidate
  if (!candidate) return
  sharing.value = true
  try {
    await sharePage({
      title: popularityShareTitle(candidate),
      text: popularityShareDescription(candidate),
      url: link.value,
      imageUrl: popularityShareImageUrl(candidate)
    })
  } finally {
    sharing.value = false
  }
}

function releasePreview(): void {
  if (cardPreviewUrl.value) URL.revokeObjectURL(cardPreviewUrl.value)
  cardPreviewUrl.value = ''
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
    releasePreview()
    cardPreviewUrl.value = URL.createObjectURL(blob)
    cardFileName.value = `${candidate.number}-${candidate.name}-人气奖.png`
  } catch {
    await copyText(link.value, '选手链接')
  } finally {
    savingCard.value = false
  }
}

function downloadCard(): void {
  if (!cardPreviewUrl.value) return
  void fetch(cardPreviewUrl.value)
    .then(response => response.blob())
    .then(blob => downloadBlob(blob, cardFileName.value))
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (photoZoom.value) {
    photoZoom.value = false
    return
  }
  if (cardPreviewUrl.value) {
    releasePreview()
    return
  }
  emit('close')
}

watch(open, (value) => {
  if (!import.meta.client) return
  if (value) document.addEventListener('keydown', onKeydown)
  else {
    document.removeEventListener('keydown', onKeydown)
    releasePreview()
  }
})

watch(() => props.candidate?.singerId, () => {
  photoFailed.value = false
  photoZoom.value = false
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.removeEventListener('keydown', onKeydown)
  releasePreview()
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
            <div class="relative h-[48vh] max-h-[520px] min-h-[260px] w-full overflow-hidden rounded-t-3xl bg-rose-50">
              <img
                v-if="!photoFailed"
                :src="photoSrc"
                :alt="candidate.name"
                class="size-full cursor-zoom-in object-contain"
                referrerpolicy="no-referrer"
                @error="photoFailed = true"
                @click="photoZoom = true"
              >
              <div
                v-else
                class="grid size-full place-items-center bg-linear-to-br from-rose-100 to-rose-200 text-6xl font-black text-rose-700"
              >
                {{ photoFallback }}
              </div>
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
                  生成分享图
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
            </div>
          </div>
        </div>

        <div
          v-if="photoZoom"
          class="fixed inset-0 z-70 grid place-items-center bg-black/95 p-2"
          @click="photoZoom = false"
        >
          <img
            :src="photoSrc"
            :alt="candidate.name"
            class="max-h-full max-w-full object-contain"
            referrerpolicy="no-referrer"
          >
          <button
            type="button"
            class="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur"
            aria-label="close"
            @click.stop="photoZoom = false"
          >
            <UIcon name="i-lucide-x" class="size-6" />
          </button>
        </div>

        <div
          v-if="cardPreviewUrl"
          class="fixed inset-0 z-60 flex flex-col items-center justify-center gap-4 bg-slate-950/85 p-4"
          @click.self="releasePreview"
        >
          <img
            :src="cardPreviewUrl"
            alt="分享卡片"
            class="max-h-[74vh] w-auto max-w-full rounded-2xl shadow-2xl"
          >
          <p class="text-center text-sm font-bold text-white/90">
            在手机上长按图片即可保存，或点下面的按钮下载
          </p>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900"
              @click="releasePreview"
            >
              关闭
            </button>
            <button
              type="button"
              class="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-bold text-white"
              @click="downloadCard"
            >
              下载图片
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
