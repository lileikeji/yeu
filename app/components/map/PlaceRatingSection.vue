<script setup lang="ts">
import { useUserSession } from '~~/app/composables/useUserSession'
import { userFetch } from '~~/app/utils/user-request'
import { getRequestMessage } from '~~/app/utils/request-error'

interface AmapRatingView {
  poiId: string
  poiName: string
  score: number | null
  cost: number | null
  fetchedAt: string
  expiresAt: string
}

interface PublicReviewView {
  id: string
  placeId: string
  score: number
  content: string
  displayName: string
  createdAt: string
  mine: boolean
  source: 'user' | 'seed'
  sourcePlatform: 'dianping' | 'meituan' | null
  likeCount: number
  likedByMe: boolean
}

interface PublicPlaceReviewsPayload {
  placeId: string
  amap: AmapRatingView | null
  aggregate: { score: number, count: number } | null
  reviews: PublicReviewView[]
  mine: { submitted: boolean, status: 'pending' | 'approved' | 'rejected' | null }
  seedCount: number
  promo: { meituanUrl: string | null, qrCodeUrl: string | null, promoWeight: number, aiFrequency: number, clickCount7d: number, clickCount30d: number } | null
}

interface PlaceReviewTrackView {
  status: 'pending' | 'approved' | 'rejected'
  score: number
  content: string
  reviewNote: string | null
  createdAt: string
  reviewedAt: string | null
}

const props = defineProps<{
  placeId: string
  placeName: string
  variant?: 'mobile' | 'desktop'
}>()

const { isAuthenticated, refreshSession } = useUserSession()
const route = useRoute()
const payload = ref<PublicPlaceReviewsPayload | null>(null)
const loading = ref(false)
const loadError = ref('')
const sort = ref<'newest' | 'hot'>('newest')
const likingIds = ref(new Set<string>())
const likeError = ref('')

const formOpen = ref(false)
const draftScore = ref(0)
const draftContent = ref('')
const submitting = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)
const lastTrackCode = ref('')
const trackCopied = ref(false)

const trackOpen = ref(false)
const trackCodeInput = ref('')
const trackLoading = ref(false)
const trackError = ref('')
const trackResult = ref<PlaceReviewTrackView | null>(null)

const trackStatusMeta: Record<PlaceReviewTrackView['status'], { text: string, class: string }> = {
  pending: { text: '待审核', class: 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-300' },
  approved: { text: '已通过', class: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' },
  rejected: { text: '未通过', class: 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400' }
}

const REVIEW_CONTENT_MAX = 500

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function _roundScore(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0
  return Math.round(value)
}

/** Fractional fill (0..1) of the star at 1-based position, for partial stars. */
function starFill(value: number | null | undefined, position: number): number {
  if (value === null || value === undefined) return 0
  const clamped = Math.max(0, Math.min(5, value))
  const fill = clamped - (position - 1)
  return Math.max(0, Math.min(1, fill))
}

async function loadReviews(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    payload.value = await userFetch<PublicPlaceReviewsPayload>('/api/public/place-reviews', {
      query: { placeId: props.placeId, sort: sort.value }
    })
  } catch (error) {
    loadError.value = getRequestMessage(error, '评分加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await refreshSession()
  await loadReviews()
})

watch(() => props.placeId, async () => {
  formOpen.value = false
  submitSuccess.value = false
  lastTrackCode.value = ''
  trackOpen.value = false
  trackCodeInput.value = ''
  trackResult.value = null
  trackError.value = ''
  await loadReviews()
})

const displayScore = computed<number | null>(() => {
  if (!payload.value) return null
  if (payload.value.aggregate) return payload.value.aggregate.score
  return payload.value.amap?.score ?? null
})

const displayCount = computed<number>(() => payload.value?.aggregate?.count ?? 0)

const displayCost = computed<number | null>(() => payload.value?.amap?.cost ?? null)

const sourceLabel = computed<string>(() => {
  if (!payload.value) return ''
  if (payload.value.aggregate) return '用户评分'
  if (payload.value.amap?.score !== null && payload.value.amap?.score !== undefined) return '高德评分'
  return ''
})

const hasAnyContent = computed(() => Boolean(
  payload.value
  && (payload.value.aggregate
    || (payload.value.amap !== null && payload.value.amap.score !== null)
    || payload.value.reviews.length > 0
    || payload.value.seedCount > 0
    || payload.value.mine.submitted)
))

const loginHref = computed(() => {
  const from = encodeURIComponent(route.fullPath)
  return `/login?from=${from}`
})

function pickScore(score: number): void {
  draftScore.value = score
}

function resetDraft(): void {
  draftScore.value = 0
  draftContent.value = ''
  submitError.value = ''
  submitSuccess.value = false
}

function openForm(): void {
  resetDraft()
  formOpen.value = true
}

function closeForm(): void {
  formOpen.value = false
}

async function submitReview(): Promise<void> {
  if (draftScore.value < 1 || draftScore.value > 5) {
    submitError.value = '请先选择星级'
    return
  }
  const content = draftContent.value.trim()
  if (!content) {
    submitError.value = '请写一点评价内容'
    return
  }
  submitting.value = true
  submitError.value = ''
  try {
    const response = await userFetch<{ review: { trackCode?: string | null } }>('/api/place-reviews', {
      method: 'POST',
      body: {
        placeId: props.placeId,
        score: draftScore.value,
        content
      }
    })
    lastTrackCode.value = response.review?.trackCode ?? ''
    trackCopied.value = false
    submitSuccess.value = true
    formOpen.value = false
    await loadReviews()
  } catch (error) {
    submitError.value = getRequestMessage(error, '评价提交失败')
  } finally {
    submitting.value = false
  }
}

async function copyTrackCode(): Promise<void> {
  if (!lastTrackCode.value) return
  try {
    await navigator.clipboard.writeText(lastTrackCode.value)
    trackCopied.value = true
    setTimeout(() => { trackCopied.value = false }, 2000)
  } catch {
    // 剪贴板不可用（如非安全上下文）时静默，用户仍可手动抄码
  }
}

async function queryTrack(): Promise<void> {
  const code = trackCodeInput.value.trim().toUpperCase()
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
    trackError.value = '查询码是 8 位字母数字（不含 I、O、0、1）'
    return
  }
  trackLoading.value = true
  trackError.value = ''
  try {
    const response = await userFetch<{ review: PlaceReviewTrackView }>('/api/public/place-reviews/track', {
      query: { code }
    })
    trackResult.value = response.review
  } catch (error) {
    trackResult.value = null
    trackError.value = getRequestMessage(error, '查询失败，请稍后再试')
  } finally {
    trackLoading.value = false
  }
}

async function changeSort(next: 'newest' | 'hot'): Promise<void> {
  if (sort.value === next) return
  sort.value = next
  await loadReviews()
}

async function toggleLike(review: PublicReviewView): Promise<void> {
  if (likingIds.value.has(review.id)) return
  likingIds.value = new Set(likingIds.value).add(review.id)
  likeError.value = ''
  try {
    const method = review.likedByMe ? 'DELETE' : 'POST'
    await userFetch(`/api/place-reviews/${review.id}/like`, { method })
    await loadReviews()
  } catch (error) {
    likeError.value = getRequestMessage(error, '点赞失败，请稍后再试')
  } finally {
    const next = new Set(likingIds.value)
    next.delete(review.id)
    likingIds.value = next
  }
}

function handleLikeClick(review: PublicReviewView): void {
  if (!isAuthenticated.value) {
    void navigateTo(loginHref.value)
    return
  }
  void toggleLike(review)
}


const mineStatusText = computed<string | null>(() => {
  const mine = payload.value?.mine
  if (!mine?.submitted) return null
  if (mine.status === 'approved') return '你已经评价过这家店'
  if (mine.status === 'rejected') return '你的评价未通过审核，无法再次提交'
  return '你的评价已提交，审核通过后展示'
})
</script>

<template>
  <div
    v-if="hasAnyContent"
    class="border-t border-zinc-100 dark:border-zinc-800 pt-3"
  >
    <div
      v-if="loading && !payload"
      class="text-xs text-zinc-500 dark:text-zinc-400"
    >
      评分加载中…
    </div>

    <template v-else>
      <p
        v-if="loadError"
        class="text-xs text-zinc-500 dark:text-zinc-400"
      >
        {{ loadError }}
      </p>

      <template v-if="payload">
        <!-- 评分摘要：评分行 + 元信息 -->
        <div v-if="displayScore !== null || displayCost !== null || displayCount > 0">
          <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <div class="flex items-center gap-1">
              <span
                v-for="star in 5"
                :key="star"
                class="relative inline-block size-4"
              >
                <UIcon
                  name="i-lucide-star"
                  class="absolute inset-0 size-4 text-zinc-200 dark:text-zinc-600"
                />
                <span
                  class="absolute inset-y-0 left-0 overflow-hidden"
                  :style="{ width: (starFill(displayScore, star) * 100) + '%' }"
                >
                  <UIcon
                    name="i-lucide-star"
                    class="block size-4 fill-amber-400 text-amber-400 dark:text-amber-300"
                  />
                </span>
              </span>
              <span
                v-if="displayScore !== null"
                class="ml-1 text-[15px] font-bold leading-none text-zinc-900 dark:text-zinc-100"
              >
                {{ displayScore.toFixed(1) }}
              </span>
            </div>
            <span
              v-if="displayCount > 0"
              class="text-[11px] text-zinc-400 dark:text-zinc-500"
            >
              {{ displayCount }} 条评价
            </span>
            <span
              v-if="displayCost !== null"
              class="text-[11px] text-zinc-400 dark:text-zinc-500"
            >
              人均 ¥{{ displayCost.toFixed(0) }}
            </span>
            <span
              v-if="sourceLabel"
              class="rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400"
            >
              {{ sourceLabel }}
            </span>
          </div>


        </div>

        <!-- 排序切换 -->
        <div
          v-if="payload.reviews.length > 1"
          class="mt-2.5 inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 p-0.5"
        >
          <button
            type="button"
            class="rounded-full px-2.5 py-1 text-[10px] font-medium transition-all"
            :class="sort === 'newest' ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400'"
            @click="changeSort('newest')"
          >
            最新
          </button>
          <button
            type="button"
            class="rounded-full px-2.5 py-1 text-[10px] font-medium transition-all"
            :class="sort === 'hot' ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400'"
            @click="changeSort('hot')"
          >
            最热
          </button>
        </div>
        <p
          v-if="likeError"
          class="mt-1 text-[11px] text-red-600 dark:text-red-400"
        >
          {{ likeError }}
        </p>

        <!-- 评价列表 -->
        <ul
          v-if="payload.reviews.length"
          class="mt-2 space-y-2"
        >
          <li
            v-for="review in payload.reviews"
            :key="review.id"
            class="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          >
            <div class="flex items-center gap-1.5">
              <span
                class="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                :class="review.source === 'seed' ? 'bg-amber-400' : 'bg-green-600 dark:bg-green-500'"
              >
                {{ review.source === 'seed' ? '整' : (review.displayName || '同').slice(0, 1) }}
              </span>
              <span class="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                {{ review.source === 'seed' ? '整理评价' : review.displayName }}
              </span>
              <span
                v-if="review.source === 'seed'"
                class="rounded-full bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-300"
              >
                点评整理
              </span>
              <span
                v-for="star in 5"
                :key="star"
                class="relative ml-1 inline-block size-2.5"
              >
                <UIcon
                  name="i-lucide-star"
                  class="absolute inset-0 size-2.5 text-zinc-300 dark:text-zinc-600"
                />
                <span
                  class="absolute inset-y-0 left-0 overflow-hidden"
                  :style="{ width: (starFill(review.score, star) * 100) + '%' }"
                >
                  <UIcon
                    name="i-lucide-star"
                    class="block size-2.5 fill-amber-400 text-amber-400 dark:text-amber-300"
                  />
                </span>
              </span>
              <span class="ml-auto text-[10px] text-zinc-400 dark:text-zinc-500">
                {{ formatDate(review.createdAt) }}
              </span>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors"
                :class="review.likedByMe ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-500 dark:text-zinc-400 hover:text-amber-600'"
                :disabled="likingIds.has(review.id)"
                :aria-pressed="review.likedByMe"
                aria-label="点赞这条评价"
                @click="handleLikeClick(review)"
              >
                <UIcon
                  name="i-lucide-thumbs-up"
                  class="size-3"
                  :class="review.likedByMe ? 'fill-amber-500 text-amber-500' : ''"
                />
                <span v-if="review.likeCount > 0">{{ review.likeCount }}</span>
              </button>
            </div>
            <p class="mt-1.5 whitespace-pre-line text-xs leading-5 text-zinc-600 dark:text-zinc-300">
              {{ review.content }}
            </p>
          </li>
        </ul>

        <p
          v-else-if="payload.aggregate && payload.seedCount === 0"
          class="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500"
        >
          还没有文字评价，成为第一个写评价的人。
        </p>

        <p
          v-if="payload.seedCount > 0 && !payload.reviews.some(r => r.source === 'user')"
          class="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500"
        >
          以上为整理评价，也欢迎你写下真实到店体验。
        </p>

        <!-- 我的评价状态 -->
        <p
          v-if="mineStatusText"
          class="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400"
        >
          {{ mineStatusText }}
        </p>
        <p
          v-if="lastTrackCode"
          class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400"
        >
          查询码
          <span class="font-mono font-bold text-zinc-800 dark:text-zinc-100">{{ lastTrackCode }}</span>
          <button
            type="button"
            class="ml-1 underline decoration-dotted"
            @click="copyTrackCode"
          >
            {{ trackCopied ? '已复制' : '复制' }}
          </button>
          ，换设备也能凭它查审核进度
        </p>

        <!-- 凭码查进度 -->
        <div
          v-if="!formOpen"
          class="mt-2"
        >
          <button
            type="button"
            class="text-[11px] text-zinc-400 underline decoration-dotted dark:text-zinc-500"
            @click="trackOpen = !trackOpen"
          >
            {{ trackOpen ? '收起查进度' : '凭码查进度' }}
          </button>
          <div
            v-if="trackOpen"
            class="mt-1.5 space-y-1.5"
          >
            <div class="flex items-center gap-1.5">
              <input
                v-model="trackCodeInput"
                type="text"
                maxlength="8"
                placeholder="输入 8 位查询码"
                class="w-40 rounded-md border-0 bg-white px-2 py-1 text-xs text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700 placeholder:text-zinc-400 font-mono uppercase"
                @keyup.enter="queryTrack"
              >
              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                :loading="trackLoading"
                label="查询"
                @click="queryTrack"
              />
            </div>
            <p
              v-if="trackError"
              class="text-[11px] text-red-600 dark:text-red-400"
            >
              {{ trackError }}
            </p>
            <div
              v-else-if="trackResult"
              class="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5"
            >
              <div class="flex items-center gap-1.5">
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                  :class="trackStatusMeta[trackResult.status].class"
                >
                  {{ trackStatusMeta[trackResult.status].text }}
                </span>
                <span class="text-[10px] text-zinc-400 dark:text-zinc-500">
                  {{ formatDate(trackResult.createdAt) }} 提交
                </span>
              </div>
              <p class="mt-1.5 whitespace-pre-line text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                {{ trackResult.content }}
              </p>
              <p
                v-if="trackResult.status === 'rejected' && trackResult.reviewNote"
                class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400"
              >
                驳回理由：{{ trackResult.reviewNote }}
              </p>
            </div>
          </div>
        </div>

        <!-- 写评价入口 -->
        <div
          v-if="!mineStatusText"
          class="mt-2"
        >
          <template v-if="!formOpen">
            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-lucide-pen-line"
              :label="`评价${props.placeName}`"
              :class="['!bg-white dark:!bg-zinc-800 !text-green-700 dark:!text-green-300 !ring-green-200 dark:!ring-green-800 hover:!bg-green-50 dark:hover:!bg-green-950/60 active:!bg-green-100 dark:active:!bg-green-900/50', props.variant === 'mobile' ? 'min-h-9 px-3' : '']"
              @click="openForm"
            />
          </template>
          <form
            v-else
            class="mt-2 space-y-2"
            @submit.prevent="submitReview"
          >
            <div class="flex items-center gap-1">
              <button
                v-for="star in 5"
                :key="star"
                type="button"
                aria-label="评分 {{ star }} 星"
                class="transition-transform active:scale-90"
                @click="pickScore(star)"
              >
                <UIcon
                  name="i-lucide-star"
                  class="size-5"
                  :class="star <= draftScore ? 'fill-amber-400 text-amber-400 dark:text-amber-300' : 'text-zinc-300 dark:text-zinc-600'"
                />
              </button>
              <span
                v-if="draftScore"
                class="ml-1 text-xs text-zinc-500 dark:text-zinc-400"
              >
                {{ draftScore }} 星
              </span>
            </div>
            <UTextarea
              v-model="draftContent"
              :maxlength="REVIEW_CONTENT_MAX"
              :rows="3"
              size="sm"
              placeholder="说说到店体验：口味、服务、价格、卫生等"
              class="!bg-white dark:!bg-zinc-900 !text-zinc-700 dark:!text-zinc-200 !ring-zinc-200 dark:!ring-zinc-700 placeholder:!text-zinc-400 dark:placeholder:!text-zinc-500"
            />
            <div class="flex items-center gap-2">
              <UButton
                type="submit"
                color="primary"
                size="xs"
                :loading="submitting"
                label="提交评价"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                label="取消"
                class="!text-zinc-400 dark:!text-zinc-500 hover:!bg-zinc-100 dark:hover:!bg-zinc-800 hover:!text-zinc-600 dark:hover:!text-zinc-300"
                @click="closeForm"
              />
              <span
                v-if="submitSuccess"
                class="text-[11px] text-green-700 dark:text-green-400"
              >
                已提交，等待审核
              </span>
              <span
                v-else-if="submitError"
                class="text-[11px] text-red-600 dark:text-red-400"
              >
                {{ submitError }}
              </span>
            </div>
            <p class="text-[10px] leading-4 text-zinc-400 dark:text-zinc-500">
              请基于真实到店体验评价；提交后由管理员审核，审核通过后公开展示。
            </p>
          </form>
        </div>
      </template>
    </template>
  </div>
</template>
