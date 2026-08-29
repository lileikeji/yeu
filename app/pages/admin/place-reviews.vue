<script setup lang="ts">
import type { PlaceReviewStatus } from '~~/shared/constants/server'
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'

definePageMeta({ layout: 'admin' })

interface AdminPlaceReview {
  id: string
  placeId: string
  userId: string | null
  anonymousKey: string | null
  username: string | null
  displayName: string | null
  score: number
  content: string
  status: PlaceReviewStatus
  reviewNote: string | null
  reviewedAt: number | null
  createdAt: number
  updatedAt: number
}

interface AdminPlaceReviewsResponse {
  items: AdminPlaceReview[]
  total: number
  page: number
  pageSize: number
}

interface AdminAmapRating {
  placeId: string
  poiId: string
  poiName: string
  score: number | null
  cost: number | null
  fetchedAt: string
  expiresAt: string
  expired: boolean
}

const toast = useToast()
const viewTab = ref<'reviews' | 'amap'>('reviews')
const items = ref<AdminPlaceReview[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const statusFilter = ref<'all' | PlaceReviewStatus>('pending')
const loading = ref(true)
const errorMessage = ref('')
const actingIds = ref(new Set<string>())
const noteDrafts = ref(new Map<string, string>())

const amapRatings = ref<AdminAmapRating[]>([])
const amapLoading = ref(false)
const amapError = ref('')
const amapQuery = ref('')

const filteredAmapRatings = computed(() => {
  const query = amapQuery.value.trim().toLowerCase()
  if (!query) return amapRatings.value
  return amapRatings.value.filter(rating =>
    rating.placeId.toLowerCase().includes(query)
    || rating.poiName.toLowerCase().includes(query)
    || rating.poiId.toLowerCase().includes(query)
  )
})

const amapExpiredCount = computed(() => amapRatings.value.filter(rating => rating.expired).length)

async function loadAmapRatings(): Promise<void> {
  amapLoading.value = true
  amapError.value = ''
  try {
    const response = await adminFetch<{ items: AdminAmapRating[], total: number }>('/api/admin/amap-ratings')
    amapRatings.value = response.items ?? []
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    amapError.value = getRequestMessage(error, '高德评分数据加载失败')
  } finally {
    amapLoading.value = false
  }
}

function switchTab(next: 'reviews' | 'amap'): void {
  if (viewTab.value === next) return
  viewTab.value = next
  if (next === 'amap' && amapRatings.value.length === 0) {
    void loadAmapRatings()
  }
}

const STATUS_LABELS: Record<PlaceReviewStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝'
}

const STATUS_COLORS: Record<PlaceReviewStatus, string> = {
  pending: 'text-orange-700',
  approved: 'text-green-700',
  rejected: 'text-red-600'
}

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day} ${hour}:${minute}`
}

function formatDateOnly(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

async function loadReviews(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await adminFetch<AdminPlaceReviewsResponse>('/api/admin/place-reviews', {
      query: {
        page: page.value,
        pageSize: pageSize.value,
        ...(statusFilter.value === 'all' ? {} : { status: statusFilter.value })
      }
    })
    items.value = response.items ?? []
    total.value = response.total ?? 0
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    errorMessage.value = getRequestMessage(error, '评价列表加载失败')
  } finally {
    loading.value = false
  }
}

async function decideReview(review: AdminPlaceReview, status: 'approved' | 'rejected'): Promise<void> {
  if (actingIds.value.has(review.id)) return
  actingIds.value = new Set(actingIds.value).add(review.id)
  const note = status === 'rejected' ? (noteDrafts.value.get(review.id) ?? '') : undefined
  try {
    const updated = await adminFetch<AdminPlaceReview>(`/api/admin/place-reviews/${review.id}`, {
      method: 'PATCH',
      body: { status, ...(note ? { note } : {}) }
    })
    const index = items.value.findIndex(item => item.id === review.id)
    if (index >= 0) items.value.splice(index, 1, updated)
    noteDrafts.value.delete(review.id)
    toast.add({
      title: status === 'approved' ? '已通过该评价' : '已拒绝该评价',
      color: status === 'approved' ? 'success' : 'neutral'
    })
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    toast.add({ title: getRequestMessage(error, '操作失败'), color: 'error' })
  } finally {
    const next = new Set(actingIds.value)
    next.delete(review.id)
    actingIds.value = next
  }
}

onMounted(loadReviews)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-bold text-zinc-900">
          商家评价审核
        </h1>
        <p class="mt-1 text-xs text-zinc-500">
          {{ viewTab === 'reviews'
            ? `共 ${total} 条用户评价，通过后在校园地图弹窗公开展示`
            : `高德评分种子数据 ${amapRatings.length} 家（其中已过期 ${amapExpiredCount} 家），用于地图弹窗评分展示，过期后需重新拉取` }}
        </p>
      </div>
      <div class="flex items-center gap-1 rounded-lg border border-zinc-200 p-1">
        <button
          type="button"
          class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          :class="viewTab === 'reviews' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'"
          @click="switchTab('reviews')"
        >
          用户评价
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          :class="viewTab === 'amap' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'"
          @click="switchTab('amap')"
        >
          高德评分数据
        </button>
      </div>
    </div>

    <template v-if="viewTab === 'reviews'">
      <div class="flex items-center gap-1 rounded-lg border border-zinc-200 p-1">
        <button
          v-for="option in ([{ value: 'pending', label: '待审核' }, { value: 'all', label: '全部' }, { value: 'approved', label: '已通过' }, { value: 'rejected', label: '已拒绝' }] as const)"
          :key="option.value"
          type="button"
          class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          :class="statusFilter === option.value ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'"
          @click="statusFilter = option.value; page = 1; loadReviews()"
        >
          {{ option.label }}
        </button>
      </div>

      <p
        v-if="errorMessage"
        class="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
      >
        {{ errorMessage }}
      </p>

      <div
        v-if="loading"
        class="py-8 text-center text-sm text-zinc-500"
      >
        加载中…
      </div>

      <div
        v-else-if="items.length === 0"
        class="rounded-lg border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500"
      >
        暂无用户评价——用户在校园地图弹窗里提交的评价会出现在这里，审核通过后公开展示。
      </div>

      <ul
        v-else
        class="space-y-3"
      >
        <li
          v-for="review in items"
          :key="review.id"
          class="rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="text-sm font-semibold text-zinc-900">
              {{ review.displayName }}
            </span>
            <span class="text-xs text-zinc-500">
              {{ review.username ? `@${review.username}` : '' }}
            </span>
            <span class="flex items-center gap-0.5">
              <UIcon
                v-for="star in 5"
                :key="star"
                name="i-lucide-star"
                class="size-3"
                :class="star <= review.score ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'"
              />
              <span class="ml-1 text-xs text-zinc-600">
                {{ review.score }} 星
              </span>
            </span>
            <span
              class="text-xs font-medium"
              :class="STATUS_COLORS[review.status]"
            >
              {{ STATUS_LABELS[review.status] }}
            </span>
            <span class="ml-auto text-xs text-zinc-400">
              {{ formatTime(review.createdAt) }}
            </span>
          </div>
          <p class="mt-2 text-sm leading-6 text-zinc-700">
            {{ review.content }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <span class="rounded bg-zinc-100 px-1.5 py-0.5 font-mono">
              {{ review.placeId }}
            </span>
            <span v-if="review.reviewedAt">
              审核于 {{ formatTime(review.reviewedAt) }}
            </span>
            <span
              v-if="review.reviewNote"
              class="text-red-600"
            >
              拒绝原因：{{ review.reviewNote }}
            </span>
          </div>
          <div
            v-if="review.status === 'pending'"
            class="mt-3 flex flex-wrap items-center gap-2"
          >
            <input
              :value="noteDrafts.get(review.id) ?? ''"
              placeholder="拒绝原因（可选）"
              class="min-w-0 flex-1 rounded-md border border-zinc-200 px-3 py-1.5 text-xs"
              @input="noteDrafts.set(review.id, ($event.target as HTMLInputElement).value)"
            >
            <UButton
              color="primary"
              size="xs"
              :loading="actingIds.has(review.id)"
              label="通过"
              icon="i-lucide-check"
              @click="decideReview(review, 'approved')"
            />
            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              label="拒绝"
              icon="i-lucide-x"
              :disabled="actingIds.has(review.id)"
              @click="decideReview(review, 'rejected')"
            />
          </div>
        </li>
      </ul>

      <div
        v-if="pageCount > 1"
        class="flex items-center justify-center gap-3 pt-2"
      >
        <UButton
          color="neutral"
          variant="outline"
          size="xs"
          label="上一页"
          icon="i-lucide-chevron-left"
          :disabled="page <= 1 || loading"
          @click="page -= 1; loadReviews()"
        />
        <span class="text-xs text-zinc-500">
          {{ page }} / {{ pageCount }}
        </span>
        <UButton
          color="neutral"
          variant="outline"
          size="xs"
          label="下一页"
          icon="i-lucide-chevron-right"
          :disabled="page >= pageCount || loading"
          @click="page += 1; loadReviews()"
        />
      </div>
    </template>

    <template v-else>
      <div class="flex max-w-md items-center gap-2">
        <UInput
          v-model="amapQuery"
          size="sm"
          placeholder="按地点 id 或 POI 名称筛选"
          icon="i-lucide-search"
          class="w-full"
        />
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-refresh-cw"
          :loading="amapLoading"
          aria-label="刷新高德评分数据"
          @click="loadAmapRatings"
        />
      </div>

      <p
        v-if="amapError"
        class="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
      >
        {{ amapError }}
      </p>

      <div
        v-if="amapLoading"
        class="py-8 text-center text-sm text-zinc-500"
      >
        加载中…
      </div>

      <div
        v-else-if="filteredAmapRatings.length === 0"
        class="rounded-lg border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500"
      >
        暂无高德评分数据（可运行 pnpm db:seed:amap-ratings 拉取）
      </div>

      <ul
        v-else
        class="space-y-2"
      >
        <li
          v-for="rating in filteredAmapRatings"
          :key="rating.placeId"
          class="rounded-lg border border-zinc-200 bg-white px-4 py-3"
        >
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="text-sm font-medium text-zinc-900">
              {{ rating.poiName }}
            </span>
            <span
              v-if="rating.score !== null"
              class="flex items-center gap-0.5"
            >
              <UIcon
                v-for="star in 5"
                :key="star"
                name="i-lucide-star"
                class="size-3"
                :class="star <= Math.round(rating.score) ? 'fill-amber-400 text-amber-400' : 'text-zinc-300'"
              />
              <span class="ml-1 text-xs text-zinc-600">
                {{ rating.score.toFixed(1) }}
              </span>
            </span>
            <span
              v-else
              class="text-xs text-zinc-400"
            >
              暂无评分
            </span>
            <span
              v-if="rating.cost !== null"
              class="text-xs text-zinc-500"
            >
              人均 ¥{{ rating.cost.toFixed(0) }}
            </span>
            <span
              class="ml-auto rounded px-1.5 py-0.5 text-[10px]"
              :class="rating.expired ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'"
            >
              {{ rating.expired ? '已过期' : '有效' }}
            </span>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span class="rounded bg-zinc-100 px-1.5 py-0.5 font-mono">
              {{ rating.placeId }}
            </span>
            <span>
              匹配 POI：{{ rating.poiId }}
            </span>
            <span>
              抓取于 {{ formatDateOnly(rating.fetchedAt) }}
            </span>
            <span>
              到期 {{ formatDateOnly(rating.expiresAt) }}
            </span>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
