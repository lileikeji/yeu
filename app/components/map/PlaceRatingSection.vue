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
const qrPreviewOpen = ref(false)

const formOpen = ref(false)
const draftScore = ref(0)
const draftContent = ref('')
const submitting = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)

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
    await userFetch('/api/place-reviews', {
      method: 'POST',
      body: {
        placeId: props.placeId,
        score: draftScore.value,
        content
      }
    })
    submitSuccess.value = true
    formOpen.value = false
    await loadReviews()
  } catch (error) {
    submitError.value = getRequestMessage(error, '评价提交失败')
  } finally {
    submitting.value = false
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

function trackPromoClick(): void {
  if (!payload.value?.promo?.meituanUrl) return
  void userFetch('/api/public/merchant-promo/click', {
    method: 'POST',
    body: { placeId: props.placeId }
  }).catch(() => {})
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
    class="border-t border-zinc-100 pt-3"
  >
    <div
      v-if="loading && !payload"
      class="text-xs text-zinc-500"
    >
      评分加载中…
    </div>

    <template v-else>
      <p
        v-if="loadError"
        class="text-xs text-zinc-500"
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
                  class="absolute inset-0 size-4 text-zinc-200"
                />
                <span
                  class="absolute inset-y-0 left-0 overflow-hidden"
                  :style="{ width: (starFill(displayScore, star) * 100) + '%' }"
                >
                  <UIcon
                    name="i-lucide-star"
                    class="block size-4 fill-amber-400 text-amber-400"
                  />
                </span>
              </span>
              <span
                v-if="displayScore !== null"
                class="ml-1 text-[15px] font-bold leading-none text-zinc-900"
              >
                {{ displayScore.toFixed(1) }}
              </span>
            </div>
            <span
              v-if="displayCount > 0"
              class="text-[11px] text-zinc-400"
            >
              {{ displayCount }} 条评价
            </span>
            <span
              v-if="displayCost !== null"
              class="text-[11px] text-zinc-400"
            >
              人均 ¥{{ displayCost.toFixed(0) }}
            </span>
            <span
              v-if="sourceLabel"
              class="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500"
            >
              {{ sourceLabel }}
            </span>
          </div>

          <!-- 商家推广条：美团下单 + 合作商家 + 二维码 -->
          <div
            v-if="payload.promo?.meituanUrl || payload.promo?.qrCodeUrl"
            class="mt-2 flex items-center justify-between gap-2 rounded-xl bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 px-2.5 py-2"
          >
            <div class="flex min-w-0 flex-col gap-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <a
                  v-if="payload.promo?.meituanUrl"
                  :href="payload.promo.meituanUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 rounded-full bg-yellow-400 px-2.5 py-1 text-[11px] font-bold text-yellow-950 shadow-sm transition-transform active:scale-95 hover:bg-yellow-300"
                  @click="trackPromoClick"
                >
                  <UIcon
                    name="i-lucide-bike"
                    class="size-3"
                  />
                  美团下单
                </a>
                <span
                  v-if="payload.promo?.meituanUrl"
                  class="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
                >
                  <UIcon
                    name="i-lucide-badge-check"
                    class="size-3"
                  />
                  合作商家
                </span>
                <span
                  v-if="(payload.promo.clickCount30d ?? 0) > 0"
                  class="text-[10px] text-zinc-400"
                >
                  已 {{ payload.promo.clickCount30d }} 人跳转
                </span>
              </div>
              <span
                v-if="payload.promo?.qrCodeUrl"
                class="text-[10px] text-zinc-400"
              >
                微信扫码打开小程序
              </span>
            </div>
            <button
              v-if="payload.promo?.qrCodeUrl"
              type="button"
              class="group relative shrink-0 overflow-hidden rounded-lg border border-white bg-white shadow-sm"
              aria-label="放大查看二维码，用微信扫码"
              @click="qrPreviewOpen = true"
            >
              <img
                :src="payload.promo.qrCodeUrl"
                :alt="`${props.placeName} 小程序码`"
                class="size-14 object-contain"
              >
              <span class="absolute bottom-0.5 right-0.5 grid size-4.5 place-items-center rounded bg-zinc-950/60 text-white/90">
                <UIcon
                  name="i-lucide-zoom-in"
                  class="size-3"
                />
              </span>
            </button>
            <UModal
              v-model:open="qrPreviewOpen"
              :title="`${props.placeName} 小程序码`"
              :ui="{ content: 'w-[calc(100vw-2rem)] max-w-none sm:w-full sm:max-w-md' }"
            >
              <template #body>
                <div class="flex items-center justify-center bg-white p-4">
                  <img
                    :src="payload.promo?.qrCodeUrl"
                    :alt="`${props.placeName} 小程序码`"
                    class="max-h-[70dvh] w-auto max-w-full object-contain"
                  >
                </div>
                <p class="pb-3 text-center text-[11px] text-zinc-500">
                  用微信扫一扫即可打开
                </p>
              </template>
            </UModal>
          </div>
        </div>

        <!-- 排序切换 -->
        <div
          v-if="payload.reviews.length > 1"
          class="mt-2.5 inline-flex items-center rounded-full bg-zinc-100 p-0.5"
        >
          <button
            type="button"
            class="rounded-full px-2.5 py-1 text-[10px] font-medium transition-all"
            :class="sort === 'newest' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'"
            @click="changeSort('newest')"
          >
            最新
          </button>
          <button
            type="button"
            class="rounded-full px-2.5 py-1 text-[10px] font-medium transition-all"
            :class="sort === 'hot' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'"
            @click="changeSort('hot')"
          >
            最热
          </button>
        </div>
        <p
          v-if="likeError"
          class="mt-1 text-[11px] text-red-600"
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
            class="rounded-xl border border-zinc-100 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          >
            <div class="flex items-center gap-1.5">
              <span
                class="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                :class="review.source === 'seed' ? 'bg-amber-400' : 'bg-green-600'"
              >
                {{ review.source === 'seed' ? '整' : (review.displayName || '同').slice(0, 1) }}
              </span>
              <span class="text-xs font-semibold text-zinc-800">
                {{ review.source === 'seed' ? '整理评价' : review.displayName }}
              </span>
              <span
                v-if="review.source === 'seed'"
                class="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600"
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
                  class="absolute inset-0 size-2.5 text-zinc-300"
                />
                <span
                  class="absolute inset-y-0 left-0 overflow-hidden"
                  :style="{ width: (starFill(review.score, star) * 100) + '%' }"
                >
                  <UIcon
                    name="i-lucide-star"
                    class="block size-2.5 fill-amber-400 text-amber-400"
                  />
                </span>
              </span>
              <span class="ml-auto text-[10px] text-zinc-400">
                {{ formatDate(review.createdAt) }}
              </span>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors"
                :class="review.likedByMe ? 'text-amber-600' : 'text-zinc-500 hover:text-amber-600'"
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
            <p class="mt-1.5 whitespace-pre-line text-xs leading-5 text-zinc-600">
              {{ review.content }}
            </p>
          </li>
        </ul>

        <p
          v-else-if="payload.aggregate && payload.seedCount === 0"
          class="mt-1 text-[11px] text-zinc-400"
        >
          还没有文字评价，成为第一个写评价的人。
        </p>

        <p
          v-if="payload.seedCount > 0 && !payload.reviews.some(r => r.source === 'user')"
          class="mt-1 text-[11px] text-zinc-400"
        >
          以上为整理评价，也欢迎你写下真实到店体验。
        </p>

        <!-- 我的评价状态 -->
        <p
          v-if="mineStatusText"
          class="mt-2 text-[11px] text-zinc-500"
        >
          {{ mineStatusText }}
        </p>

        <!-- 写评价入口 -->
        <div
          v-else
          class="mt-2"
        >
          <template v-if="!formOpen">
            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-lucide-pen-line"
              :label="`评价${props.placeName}`"
              :class="['!bg-white !text-green-700 !ring-green-200 hover:!bg-green-50 active:!bg-green-100', props.variant === 'mobile' ? 'min-h-9 px-3' : '']"
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
                  :class="star <= draftScore ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'"
                />
              </button>
              <span
                v-if="draftScore"
                class="ml-1 text-xs text-zinc-500"
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
              class="!bg-white !text-zinc-700 !ring-zinc-200 placeholder:!text-zinc-400"
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
                class="!text-zinc-400 hover:!bg-zinc-100 hover:!text-zinc-600"
                @click="closeForm"
              />
              <span
                v-if="submitSuccess"
                class="text-[11px] text-green-700"
              >
                已提交，等待审核
              </span>
              <span
                v-else-if="submitError"
                class="text-[11px] text-red-600"
              >
                {{ submitError }}
              </span>
            </div>
            <p class="text-[10px] leading-4 text-zinc-400">
              请基于真实到店体验评价；提交后由管理员审核，审核通过后公开展示。
            </p>
          </form>
        </div>
      </template>
    </template>
  </div>
</template>
