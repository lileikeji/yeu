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
}

interface PublicPlaceReviewsPayload {
  placeId: string
  amap: AmapRatingView | null
  aggregate: { score: number, count: number } | null
  reviews: PublicReviewView[]
  mine: { submitted: boolean, status: 'pending' | 'approved' | 'rejected' | null }
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

function roundScore(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0
  return Math.round(value)
}

async function loadReviews(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    payload.value = await userFetch<PublicPlaceReviewsPayload>('/api/public/place-reviews', {
      query: { placeId: props.placeId }
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
  && (payload.value.aggregate || payload.value.amap?.score !== null || payload.value.amap?.score !== undefined
    || payload.value.reviews.length > 0 || payload.value.mine.submitted)
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
        <!-- 评分摘要 -->
        <div
          v-if="displayScore !== null || displayCost !== null || displayCount > 0"
          class="flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          <div class="flex items-center gap-1">
            <UIcon
              v-for="star in 5"
              :key="star"
              name="i-lucide-star"
              class="size-3.5"
              :class="star <= roundScore(displayScore)
                ? 'fill-amber-400 text-amber-400'
                : 'text-zinc-300'"
            />
            <span
              v-if="displayScore !== null"
              class="ml-1 text-sm font-semibold text-zinc-900"
            >
              {{ displayScore.toFixed(1) }}
            </span>
          </div>
          <span
            v-if="displayCount > 0"
            class="text-xs text-zinc-500"
          >
            {{ displayCount }} 条评价
          </span>
          <span
            v-if="displayCost !== null"
            class="text-xs text-zinc-500"
          >
            人均 ¥{{ displayCost.toFixed(0) }}
          </span>
          <span
            v-if="sourceLabel"
            class="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500"
          >
            {{ sourceLabel }}
          </span>
        </div>

        <!-- 评价列表 -->
        <ul
          v-if="payload.reviews.length"
          class="mt-2 space-y-2"
        >
          <li
            v-for="review in payload.reviews"
            :key="review.id"
            class="rounded-md bg-zinc-50 px-2.5 py-2"
          >
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-zinc-800">
                {{ review.displayName }}
              </span>
              <UIcon
                v-for="star in 5"
                :key="star"
                name="i-lucide-star"
                class="size-2.5"
                :class="star <= review.score ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'"
              />
              <span class="ml-auto text-[10px] text-zinc-400">
                {{ formatDate(review.createdAt) }}
              </span>
            </div>
            <p class="mt-1 whitespace-pre-line text-xs leading-5 text-zinc-600">
              {{ review.content }}
            </p>
          </li>
        </ul>

        <p
          v-else-if="payload.aggregate"
          class="mt-1 text-[11px] text-zinc-400"
        >
          还没有文字评价，成为第一个写评价的人。
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
          <template v-if="!isAuthenticated">
            <ULink
              :to="loginHref"
              class="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
            >
              <UIcon
                name="i-lucide-pen-line"
                class="size-3.5"
              />
              登录后写评价
            </ULink>
          </template>
          <template v-else-if="!formOpen">
            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-lucide-pen-line"
              :label="`评价${props.placeName}`"
              class="!text-green-700"
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
