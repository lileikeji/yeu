<script setup lang="ts">
import type { PlaceReviewStatus } from '~~/shared/constants/server'
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'

definePageMeta({ layout: 'admin' })

interface AdminPlaceReview {
  id: string
  placeId: string
  userId: string
  username: string
  displayName: string
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

const toast = useToast()
const items = ref<AdminPlaceReview[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const statusFilter = ref<'all' | PlaceReviewStatus>('pending')
const loading = ref(true)
const errorMessage = ref('')
const actingIds = ref(new Set<string>())
const noteDrafts = ref(new Map<string, string>())

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
          共 {{ total }} 条评价，通过后在校园地图弹窗公开展示
        </p>
      </div>
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
      暂无评价
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
            @{{ review.username }}
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
  </div>
</template>
