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
const viewTab = ref<'reviews' | 'amap' | 'merchants'>('reviews')
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

function switchTab(next: 'reviews' | 'amap' | 'merchants'): void {
  if (viewTab.value === next) return
  viewTab.value = next
  if (next === 'amap' && amapRatings.value.length === 0) {
    void loadAmapRatings()
  }
  if (next === 'merchants' && merchants.value.length === 0) {
    void loadMerchants()
  }
}

/* ---------- 商家管理 ---------- */
interface AdminMerchant {
  placeId: string
  poiName: string | null
  amapScore: number | null
  amapCost: number | null
  amapExpired: boolean
  seedCardCount: number
  originalReviewCount: number
  userReviewCount: number
  seedAvgScore: number | null
  originalAvgScore: number | null
}

interface MerchantReview {
  id: string
  placeId: string
  score: number
  content: string
  status: string
  source: 'user' | 'seed' | 'original'
  sourceUrl: string | null
  sourcePlatform: 'dianping' | 'meituan' | null
  collectedAt: number | null
  displayName: string | null
  createdAt: number
}

interface AdminMerchantDetail {
  placeId: string
  poiName: string | null
  amapScore: number | null
  amapCost: number | null
  amapExpired: boolean
  seedCards: MerchantReview[]
  originalReviews: MerchantReview[]
  userReviews: MerchantReview[]
}

const merchants = ref<AdminMerchant[]>([])
const merchantsLoading = ref(false)
const merchantsError = ref('')
const merchantQuery = ref('')
const selectedMerchant = ref<AdminMerchantDetail | null>(null)
const merchantDetailLoading = ref(false)
const editingSeed = ref<MerchantReview | null>(null)
const editContent = ref('')
const editScore = ref(4)
const savingSeed = ref(false)

/* ---------- 推广设置 ---------- */
interface MerchantPromo {
  placeId: string
  meituanUrl: string | null
  promoWeight: number
  aiFrequency: number
  enabled: boolean
}

const promo = ref<MerchantPromo | null>(null)
const promoLoading = ref(false)
const savingPromo = ref(false)
const promoMeituanUrl = ref('')
const promoWeight = ref(0)
const promoAiFrequency = ref(0)
const promoEnabled = ref(false)

async function loadPromo(placeId: string): Promise<void> {
  promoLoading.value = true
  try {
    const data = await adminFetch<MerchantPromo>(`/api/admin/place-reviews/merchants/${encodeURIComponent(placeId)}/promo`)
    promo.value = data
    promoMeituanUrl.value = data.meituanUrl ?? ''
    promoWeight.value = data.promoWeight
    promoAiFrequency.value = data.aiFrequency
    promoEnabled.value = data.enabled
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    toast.add({ title: getRequestMessage(error, '推广设置加载失败'), color: 'error' })
  } finally {
    promoLoading.value = false
  }
}

async function savePromo(): Promise<void> {
  if (!selectedMerchant.value || savingPromo.value) return
  savingPromo.value = true
  try {
    const updated = await adminFetch<MerchantPromo>(`/api/admin/place-reviews/merchants/${encodeURIComponent(selectedMerchant.value.placeId)}/promo`, {
      method: 'PATCH',
      body: {
        meituanUrl: promoMeituanUrl.value.trim() || null,
        promoWeight: promoWeight.value,
        aiFrequency: promoAiFrequency.value,
        enabled: promoEnabled.value
      }
    })
    promo.value = updated
    toast.add({ title: '推广设置已保存', color: 'success' })
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    toast.add({ title: getRequestMessage(error, '保存失败'), color: 'error' })
  } finally {
    savingPromo.value = false
  }
}

const filteredMerchants = computed(() => {
  const query = merchantQuery.value.trim().toLowerCase()
  if (!query) return merchants.value
  return merchants.value.filter(m =>
    (m.poiName ?? '').toLowerCase().includes(query)
    || m.placeId.toLowerCase().includes(query)
  )
})

async function loadMerchants(): Promise<void> {
  merchantsLoading.value = true
  merchantsError.value = ''
  try {
    const response = await adminFetch<AdminMerchant[]>('/api/admin/place-reviews/merchants')
    merchants.value = response ?? []
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    merchantsError.value = getRequestMessage(error, '商家列表加载失败')
  } finally {
    merchantsLoading.value = false
  }
}

async function openMerchant(placeId: string): Promise<void> {
  selectedMerchant.value = null
  merchantDetailLoading.value = true
  promo.value = null
  try {
    const detail = await adminFetch<AdminMerchantDetail>(`/api/admin/place-reviews/merchants/${encodeURIComponent(placeId)}`)
    selectedMerchant.value = detail
    void loadPromo(placeId)
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    toast.add({ title: getRequestMessage(error, '商家详情加载失败'), color: 'error' })
  } finally {
    merchantDetailLoading.value = false
  }
}

function startEditSeed(review: MerchantReview): void {
  editingSeed.value = review
  editContent.value = review.content
  editScore.value = review.score
}

async function saveSeedEdit(): Promise<void> {
  if (!editingSeed.value || savingSeed.value) return
  savingSeed.value = true
  try {
    const updated = await adminFetch<MerchantReview>(`/api/admin/place-reviews/${editingSeed.value.id}`, {
      method: 'PATCH',
      body: { content: editContent.value.trim(), score: editScore.value }
    })
    const detail = selectedMerchant.value
    if (detail) {
      const index = detail.seedCards.findIndex(card => card.id === updated.id)
      if (index >= 0) detail.seedCards.splice(index, 1, updated)
    }
    editingSeed.value = null
    toast.add({ title: '整理卡已更新', color: 'success' })
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    toast.add({ title: getRequestMessage(error, '保存失败'), color: 'error' })
  } finally {
    savingSeed.value = false
  }
}

function renderStars(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—'
  return '★'.repeat(Math.round(score)) + '☆'.repeat(5 - Math.round(score))
}

function formatCollectedAt(timestamp: number | null): string {
  if (!timestamp) return ''
  return formatTime(timestamp)
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
        <button
          type="button"
          class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          :class="viewTab === 'merchants' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'"
          @click="switchTab('merchants')"
        >
          商家管理
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

    <template v-if="viewTab === 'merchants'">
      <div v-if="!selectedMerchant" class="space-y-3">
        <div class="flex items-center gap-2">
          <input
            v-model="merchantQuery"
            type="search"
            placeholder="搜索店名或 placeId…"
            class="w-64 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
          >
          <span class="text-xs text-zinc-500">
            共 {{ filteredMerchants.length }} 家商家
          </span>
        </div>
        <p
          v-if="merchantsError"
          class="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {{ merchantsError }}
        </p>
        <div
          v-if="merchantsLoading"
          class="py-8 text-center text-sm text-zinc-500"
        >
          加载中…
        </div>
        <ul
          v-else
          class="space-y-2"
        >
          <li
            v-for="merchant in filteredMerchants"
            :key="merchant.placeId"
            class="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-400"
            @click="openMerchant(merchant.placeId)"
          >
            <div class="flex items-center gap-3">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-zinc-900">
                  {{ merchant.poiName ?? merchant.placeId }}
                </div>
                <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                  <span class="font-mono">
                    {{ merchant.placeId }}
                  </span>
                  <span>
                    高德分 {{ merchant.amapScore?.toFixed(1) ?? '—' }}{{ merchant.amapCost != null ? ` · 人均¥${Math.round(merchant.amapCost)}` : '' }}
                  </span>
                  <span :class="merchant.amapExpired ? 'text-red-500' : ''">
                    {{ merchant.amapExpired ? '评分已过期' : '' }}
                  </span>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2 text-right text-[11px] text-zinc-600">
                <span class="rounded bg-amber-50 px-2 py-1">
                  整理卡 {{ merchant.seedCardCount }}
                </span>
                <span class="rounded bg-blue-50 px-2 py-1">
                  原文 {{ merchant.originalReviewCount }}
                </span>
                <span class="rounded bg-green-50 px-2 py-1">
                  学生评 {{ merchant.userReviewCount }}
                </span>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <div v-else class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <button
              type="button"
              class="mb-1 text-xs text-zinc-500 hover:text-zinc-800"
              @click="selectedMerchant = null"
            >
              ← 返回商家列表
            </button>
            <h2 class="text-base font-bold text-zinc-900">
              {{ selectedMerchant.poiName ?? selectedMerchant.placeId }}
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500">
              <span class="font-mono">{{ selectedMerchant.placeId }}</span>
              · 高德评分 {{ selectedMerchant.amapScore?.toFixed(1) ?? '—' }}
              {{ selectedMerchant.amapCost != null ? ` · 人均约 ¥${Math.round(selectedMerchant.amapCost)}` : '' }}
              · 整理卡 {{ selectedMerchant.seedCards.length }} · 原文评论 {{ selectedMerchant.originalReviews.length }} · 学生评价 {{ selectedMerchant.userReviews.length }}
            </p>
          </div>
        </div>

        <div
          v-if="merchantDetailLoading"
          class="py-8 text-center text-sm text-zinc-500"
        >
          加载中…
        </div>

        <template v-else>
          <!-- 推广设置 -->
          <section class="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
            <h3 class="text-sm font-bold text-zinc-800">
              商家推广设置
            </h3>
            <p class="mt-0.5 text-xs text-zinc-500">
              挂美团链接后，地图弹窗与 AI 推荐会出现该商家的快捷跳转；排行占比与 AI 频率用于提升推荐权重。
            </p>
            <div v-if="promoLoading" class="mt-3 text-xs text-zinc-500">
              加载中…
            </div>
            <div v-else class="mt-3 grid gap-3 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label class="text-xs font-medium text-zinc-600">
                  美团店铺链接
                </label>
                <input
                  v-model="promoMeituanUrl"
                  type="url"
                  placeholder="https://waimai.meituan.com/… 或 https://www.meituan.com/…"
                  class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-violet-500"
                >
              </div>
              <div>
                <label class="text-xs font-medium text-zinc-600">
                  排行占比：{{ promoWeight }}%
                </label>
                <input
                  v-model.number="promoWeight"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  class="mt-2 w-full accent-violet-600"
                >
                <p class="mt-1 text-[11px] text-zinc-400">
                  越高排名越靠前（0 = 不干预）
                </p>
              </div>
              <div>
                <label class="text-xs font-medium text-zinc-600">
                  AI 出现频率：{{ promoAiFrequency }}%
                </label>
                <input
                  v-model.number="promoAiFrequency"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  class="mt-2 w-full accent-violet-600"
                >
                <p class="mt-1 text-[11px] text-zinc-400">
                  越高 AI 推荐时越常出现
                </p>
              </div>
              <div class="sm:col-span-2 flex items-center justify-between">
                <label class="flex items-center gap-2 text-xs font-medium text-zinc-600">
                  <input
                    v-model="promoEnabled"
                    type="checkbox"
                    class="accent-violet-600"
                  >
                  启用推广（前台显示跳转与权重生效）
                </label>
                <button
                  type="button"
                  class="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50"
                  :disabled="savingPromo"
                  @click="savePromo"
                >
                  {{ savingPromo ? '保存中…' : '保存推广设置' }}
                </button>
              </div>
            </div>
          </section>

          <!-- 整理卡（前台展示版，可编辑） -->
          <section>
            <h3 class="mb-2 text-sm font-bold text-zinc-800">
              整理卡（前台展示）
            </h3>
            <ul class="space-y-2">
              <li
                v-for="card in selectedMerchant.seedCards"
                :key="card.id"
                class="rounded-lg border border-amber-200 bg-amber-50/40 p-3"
              >
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-amber-600">
                    {{ renderStars(card.score) }} {{ card.score.toFixed(1) }} 分
                  </span>
                  <span class="text-zinc-500">
                    来自{{ card.sourcePlatform === 'dianping' ? '点评' : card.sourcePlatform === 'meituan' ? '美团' : '' }}整理
                  </span>
                  <button
                    type="button"
                    class="ml-auto rounded px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-amber-100"
                    @click="startEditSeed(card)"
                  >
                    编辑
                  </button>
                </div>
                <p class="mt-1.5 whitespace-pre-line text-xs leading-5 text-zinc-700">
                  {{ card.content }}
                </p>
              </li>
              <li
                v-if="selectedMerchant.seedCards.length === 0"
                class="rounded-lg border border-dashed border-zinc-200 py-4 text-center text-xs text-zinc-500"
              >
                暂无整理卡
              </li>
            </ul>
          </section>

          <!-- 原始评论（完整原文） -->
          <section>
            <h3 class="mb-2 text-sm font-bold text-zinc-800">
              完整原文评论（{{ selectedMerchant.originalReviews.length }} 条）
            </h3>
            <ul class="space-y-2">
              <li
                v-for="review in selectedMerchant.originalReviews"
                :key="review.id"
                class="rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-zinc-700">
                    {{ renderStars(review.score) }}
                  </span>
                  <span class="text-zinc-500">
                    {{ review.displayName ?? '匿名' }} · {{ formatCollectedAt(review.collectedAt) }}
                  </span>
                  <a
                    v-if="review.sourceUrl"
                    :href="review.sourceUrl"
                    target="_blank"
                    rel="noopener"
                    class="ml-auto text-blue-600 hover:underline"
                  >
                    来源链接
                  </a>
                </div>
                <p class="mt-1.5 whitespace-pre-line text-xs leading-5 text-zinc-600">
                  {{ review.content }}
                </p>
              </li>
              <li
                v-if="selectedMerchant.originalReviews.length === 0"
                class="rounded-lg border border-dashed border-zinc-200 py-4 text-center text-xs text-zinc-500"
              >
                暂无原文评论（抓取后入库）
              </li>
            </ul>
          </section>

          <!-- 学生评价 -->
          <section v-if="selectedMerchant.userReviews.length > 0">
            <h3 class="mb-2 text-sm font-bold text-zinc-800">
              学生评价（{{ selectedMerchant.userReviews.length }} 条）
            </h3>
            <ul class="space-y-2">
              <li
                v-for="review in selectedMerchant.userReviews"
                :key="review.id"
                class="rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-zinc-700">
                    {{ renderStars(review.score) }}
                  </span>
                  <span class="text-zinc-500">
                    {{ review.displayName ?? '匿名' }}
                  </span>
                  <span
                    class="ml-auto rounded px-1.5 py-0.5 text-[10px]"
                    :class="review.status === 'approved' ? 'bg-green-50 text-green-700' : review.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-700'"
                  >
                    {{ review.status === 'approved' ? '已通过' : review.status === 'rejected' ? '已拒绝' : '待审核' }}
                  </span>
                </div>
                <p class="mt-1.5 whitespace-pre-line text-xs leading-5 text-zinc-600">
                  {{ review.content }}
                </p>
              </li>
            </ul>
          </section>
        </template>
      </div>

      <!-- 编辑整理卡弹窗 -->
      <div
        v-if="editingSeed"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        @click.self="editingSeed = null"
      >
        <div class="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
          <h3 class="text-sm font-bold text-zinc-900">
            编辑整理卡
          </h3>
          <div class="mt-3 space-y-3">
            <div>
              <label class="text-xs font-medium text-zinc-600">
                星级（1-5）
              </label>
              <div class="mt-1 flex items-center gap-1">
                <input
                  v-model.number="editScore"
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  class="w-24 rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-500"
                >
                <span class="text-sm text-amber-600">
                  {{ renderStars(editScore) }}
                </span>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium text-zinc-600">
                内容（前台展示的整理文案）
              </label>
              <textarea
                v-model="editContent"
                rows="6"
                class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm leading-5 outline-none focus:border-zinc-500"
              />
            </div>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
              @click="editingSeed = null"
            >
              取消
            </button>
            <button
              type="button"
              class="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-700 disabled:opacity-50"
              :disabled="savingSeed || !editContent.trim()"
              @click="saveSeedEdit"
            >
              {{ savingSeed ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
