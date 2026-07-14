<script setup lang="ts">
import {
  COORDINATE_OBSERVATION_STATUSES,
  MAX_APPROVABLE_COORDINATE_ACCURACY_METERS,
  MAX_DUAL_VERIFICATION_DISTANCE_METERS,
  MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS,
  type CoordinateObservationStatus
} from '~~/shared/constants/server'
import type {
  ApiCoordinateObservation,
  ApiListResponse,
  ApiPlace
} from '~~/shared/types/server'
import type AdminFieldCoordinateCapture from '~/components/admin/AdminFieldCoordinateCapture.vue'
import {
  enqueueCoordinateObservation,
  ensureCoordinateObservationClientId,
  listQueuedCoordinateObservations,
  removeQueuedCoordinateObservation,
  type CoordinateObservationSubmissionPayload,
  type NewCoordinateObservationPayload,
  type QueuedCoordinateObservation
} from '~/utils/coordinate-observation-queue'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '现场采点', robots: 'noindex, nofollow' })

type ObservationStatusFilter = CoordinateObservationStatus | 'all'
type CoordinateReviewStage = 'first-candidate' | 'possible-dual' | 'dual-verified' | 'replacement'

interface CoordinateReviewHint {
  stage: CoordinateReviewStage
  title: string
  description: string
}

const toast = useToast()
const capture = ref<InstanceType<typeof AdminFieldCoordinateCapture> | null>(null)
const places = ref<ApiPlace[]>([])
const observations = ref<ApiCoordinateObservation[]>([])
const queued = ref<QueuedCoordinateObservation[]>([])
const selectedPlaceId = ref('')
const selectedObservationId = ref<string | null>(null)
const captureSessionLocked = ref(false)
const placesLoading = ref(true)
const observationsLoading = ref(true)
const submitting = ref(false)
const syncing = ref(false)
const loadError = ref('')
const reviewNotes = reactive<Record<string, string>>({})
const reviewActionId = ref<string | null>(null)

const observationSearchInput = ref('')
const appliedObservationSearch = ref('')
const observationStatus = ref<ObservationStatusFilter>('pending')
const observationPage = ref(1)
const observationPageSize = ref(20)
const observationTotal = ref(0)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let observationRequestId = 0

const expandedQueueId = ref<string | null>(null)
const retryingQueueId = ref<string | null>(null)
const queueErrors = reactive<Record<string, string>>({})
const deleteQueueOpen = ref(false)
const deleteQueueTarget = ref<QueuedCoordinateObservation | null>(null)
const deletingQueue = ref(false)

const selectedPlace = computed(() => places.value.find(place => place.id === selectedPlaceId.value) ?? null)
const selectedObservation = computed(() => observations.value.find(
  observation => observation.id === selectedObservationId.value
) ?? null)
const selectedObservationPlace = computed(() => selectedObservation.value
  ? places.value.find(place => place.id === selectedObservation.value!.placeId) ?? null
  : null)
const selectedCoordinateReviewHint = computed<CoordinateReviewHint | null>(() => {
  const observation = selectedObservation.value
  const place = selectedObservationPlace.value
  if (!observation || !place) return null

  if (place.coordinateVerification === 'verified') {
    return {
      stage: 'dual-verified',
      title: '地点当前已完成双重核验',
      description: observation.reviewStatus === 'pending'
        ? '批准这条新观测时，服务端只会保留与其最匹配的一条有效旧证据；若没有兼容证据，地点会退回首条候选状态。'
        : '当前地点由两条有效 approved 观测共同支持，前台才可使用该导航坐标。'
    }
  }

  if (observation.reviewStatus === 'approved') {
    return {
      stage: 'first-candidate',
      title: '已批准为首条候选',
      description: '当前只有一条有效 approved 证据，地点保持 unverified；仍需满足角色、距离、可信采集方式和时间独立性规则的第二条观测。'
    }
  }
  if (observation.reviewStatus !== 'pending') {
    return {
      stage: 'replacement',
      title: '历史观测不参与当前核验',
      description: observation.reviewStatus === 'superseded'
        ? '该记录的审核历史已保留，但已由更新证据替代。'
        : '该记录已被驳回，不会计入地点坐标证据。'
    }
  }

  const hasCandidate = place.longitude !== null
    && place.latitude !== null
    && place.coordinateSystem === 'WGS84'
    && place.coordinatePointRole !== null
  if (!hasCandidate) {
    return {
      stage: 'first-candidate',
      title: '批准后仅形成首条候选',
      description: '地点会保存该 WGS84 点，但仍保持 unverified；还需要第二条独立、同点位角色且位置相符的观测。'
    }
  }

  const separation = coordinateDistanceMeters(
    { longitude: observation.longitude, latitude: observation.latitude },
    { longitude: place.longitude!, latitude: place.latitude! }
  )
  if (place.coordinatePointRole !== observation.pointRole) {
    return {
      stage: 'replacement',
      title: '点位角色与首条候选不同',
      description: '这条观测不能与现有候选组成双重证据；批准后会替代旧候选，地点仍保持 unverified。'
    }
  }
  if (separation > MAX_DUAL_VERIFICATION_DISTANCE_METERS) {
    return {
      stage: 'replacement',
      title: `与首条候选相距 ${separation.toFixed(1)} m`,
      description: `超过 ${MAX_DUAL_VERIFICATION_DISTANCE_METERS} m 阈值，批准后会替代旧候选，不会完成双重核验。`
    }
  }

  return {
    stage: 'possible-dual',
    title: `与首条候选相距 ${separation.toFixed(1)} m`,
    description: `角色和距离已匹配；服务端还会核对采集独立性。同方法须至少间隔 ${MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS / 60_000} 分钟，且至少一条来自浏览器定位或授权导入，全部满足后才升级为 verified。`
  }
})
const observationPageCount = computed(() => Math.max(
  1,
  Math.ceil(observationTotal.value / observationPageSize.value)
))
const placeOptions = computed(() => places.value.map(place => ({
  label: `${place.name} · ${place.coordinateVerification === 'missing' ? '缺坐标' : place.coordinateVerification}`,
  value: place.id
})))
const observationStatusOptions = [
  { label: '全部状态', value: 'all' },
  ...COORDINATE_OBSERVATION_STATUSES.map(status => ({
    label: observationStatusLabel(status),
    value: status
  }))
]
const pageSizeOptions = [
  { label: '每页 10 条', value: 10 },
  { label: '每页 20 条', value: 20 },
  { label: '每页 50 条', value: 50 }
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coordinateDistanceMeters(
  left: { longitude: number, latitude: number },
  right: { longitude: number, latitude: number }
): number {
  const earthRadius = 6_371_000
  const toRadians = (value: number) => value * Math.PI / 180
  const latitudeDelta = toRadians(right.latitude - left.latitude)
  const longitudeDelta = toRadians(right.longitude - left.longitude)
  const leftLatitude = toRadians(left.latitude)
  const rightLatitude = toRadians(right.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function statusCode(error: unknown): number | null {
  if (!isObject(error)) return null
  if (typeof error.statusCode === 'number') return error.statusCode
  if (isObject(error.response) && typeof error.response.status === 'number') return error.response.status
  return null
}

function errorMessage(error: unknown, fallback: string): string {
  if (!isObject(error)) return fallback
  if (typeof error.statusMessage === 'string') return error.statusMessage
  if (isObject(error.data) && typeof error.data.statusMessage === 'string') return error.data.statusMessage
  return fallback
}

async function redirectIfUnauthorized(error: unknown): Promise<boolean> {
  if (![401, 403].includes(statusCode(error) ?? 0)) return false
  await navigateTo('/admin/login', { replace: true })
  return true
}

function sortPlaces(items: ApiPlace[]): ApiPlace[] {
  return [...items].sort((left, right) => {
    const leftPriority = left.coordinateVerification === 'missing' ? 0 : 1
    const rightPriority = right.coordinateVerification === 'missing' ? 0 : 1
    return leftPriority - rightPriority || left.name.localeCompare(right.name, 'zh-CN')
  })
}

async function loadPlaces(): Promise<void> {
  placesLoading.value = true
  try {
    const response = await $fetch<ApiListResponse<ApiPlace>>('/api/admin/places', {
      query: { page: 1, pageSize: 200 },
      credentials: 'include'
    })
    places.value = sortPlaces(response.items)
    if (!selectedPlaceId.value && places.value[0]) selectedPlaceId.value = places.value[0].id
  } catch (error) {
    if (await redirectIfUnauthorized(error)) return
    loadError.value = errorMessage(error, '地点数据暂时无法加载。')
  } finally {
    placesLoading.value = false
  }
}

async function loadObservations(): Promise<void> {
  const requestId = ++observationRequestId
  observationsLoading.value = true
  try {
    const response = await $fetch<ApiListResponse<ApiCoordinateObservation>>(
      '/api/admin/coordinate-observations',
      {
        query: {
          page: observationPage.value,
          pageSize: observationPageSize.value,
          q: appliedObservationSearch.value || undefined,
          status: observationStatus.value === 'all' ? undefined : observationStatus.value
        },
        credentials: 'include'
      }
    )
    if (requestId !== observationRequestId) return
    observations.value = response.items
    observationTotal.value = response.total
    const maximumPage = Math.max(1, Math.ceil(response.total / response.pageSize))
    if (observationPage.value > maximumPage) {
      observationPage.value = maximumPage
      return
    }
    if (!response.items.some(item => item.id === selectedObservationId.value)) {
      selectedObservationId.value = response.items[0]?.id ?? null
    }
  } catch (error) {
    if (requestId !== observationRequestId) return
    if (await redirectIfUnauthorized(error)) return
    loadError.value = errorMessage(error, '坐标观测暂时无法加载。')
  } finally {
    if (requestId === observationRequestId) observationsLoading.value = false
  }
}

async function loadLocalQueue(): Promise<void> {
  try {
    queued.value = await listQueuedCoordinateObservations()
    if (expandedQueueId.value && !queued.value.some(item => item.id === expandedQueueId.value)) {
      expandedQueueId.value = null
    }
  } catch {
    queued.value = []
  }
}

async function refreshAll(): Promise<void> {
  loadError.value = ''
  await Promise.all([loadPlaces(), loadObservations(), loadLocalQueue()])
}

async function submitToServer(payload: CoordinateObservationSubmissionPayload): Promise<void> {
  await $fetch('/api/admin/coordinate-observations', {
    method: 'POST',
    body: payload,
    credentials: 'include'
  })
}

async function submitObservation(payload: NewCoordinateObservationPayload): Promise<void> {
  submitting.value = true
  const submission = ensureCoordinateObservationClientId(payload)
  try {
    await submitToServer(submission)
    capture.value?.markSubmitted(submission.placeId)
    toast.add({ title: '观测已进入审核队列', color: 'success' })
    await loadObservations()
  } catch (error) {
    const code = statusCode(error)
    if (code === null || code >= 500) {
      try {
        await enqueueCoordinateObservation(submission)
        capture.value?.markSubmitted(submission.placeId)
        await loadLocalQueue()
        toast.add({
          title: '网络不可用，观测已保存在本机',
          description: '稍后可在离线队列中逐条或批量同步。',
          color: 'warning'
        })
      } catch {
        toast.add({
          title: '观测提交失败',
          description: '本机离线队列也不可用。',
          color: 'error'
        })
      }
    } else if (!await redirectIfUnauthorized(error)) {
      toast.add({
        title: '观测未提交',
        description: errorMessage(error, '请检查样本与说明。'),
        color: 'error'
      })
    }
  } finally {
    submitting.value = false
  }
}

async function retryQueuedObservation(record: QueuedCoordinateObservation): Promise<void> {
  retryingQueueId.value = record.id
  Reflect.deleteProperty(queueErrors, record.id)
  try {
    await submitToServer(record.payload)
    await removeQueuedCoordinateObservation(record.id)
    await Promise.all([loadLocalQueue(), loadObservations()])
    toast.add({ title: '本地观测已同步', color: 'success' })
  } catch (error) {
    if (await redirectIfUnauthorized(error)) return
    const message = errorMessage(error, '同步失败，记录仍保存在本机。')
    queueErrors[record.id] = message
    toast.add({ title: '单条同步失败', description: message, color: 'warning' })
  } finally {
    retryingQueueId.value = null
  }
}

async function syncQueue(): Promise<void> {
  if (!queued.value.length) return
  syncing.value = true
  let synced = 0
  let failed = 0
  try {
    for (const record of [...queued.value]) {
      Reflect.deleteProperty(queueErrors, record.id)
      try {
        await submitToServer(record.payload)
        await removeQueuedCoordinateObservation(record.id)
        synced += 1
      } catch (error) {
        if (await redirectIfUnauthorized(error)) return
        failed += 1
        queueErrors[record.id] = errorMessage(error, '同步失败，记录仍保存在本机。')
      }
    }
    await Promise.all([loadLocalQueue(), loadObservations()])
    if (failed) {
      toast.add({
        title: `已同步 ${synced} 条，${failed} 条仍待处理`,
        description: '展开失败记录可查看原因并单独重试。',
        color: 'warning'
      })
    } else {
      toast.add({ title: `已同步 ${synced} 条本地观测`, color: 'success' })
    }
  } finally {
    syncing.value = false
  }
}

function requestQueueDeletion(record: QueuedCoordinateObservation): void {
  deleteQueueTarget.value = record
  deleteQueueOpen.value = true
}

async function deleteQueuedObservation(): Promise<void> {
  const record = deleteQueueTarget.value
  if (!record) return
  deletingQueue.value = true
  try {
    await removeQueuedCoordinateObservation(record.id)
    Reflect.deleteProperty(queueErrors, record.id)
    await loadLocalQueue()
    deleteQueueOpen.value = false
    deleteQueueTarget.value = null
    toast.add({ title: '本地观测已删除', color: 'success' })
  } catch {
    toast.add({ title: '删除失败', description: '本地队列暂时不可用。', color: 'error' })
  } finally {
    deletingQueue.value = false
  }
}

async function reviewObservation(
  observation: ApiCoordinateObservation,
  action: 'approve' | 'reject'
): Promise<void> {
  if (observation.reviewStatus !== 'pending') return
  const note = reviewNotes[observation.id]?.trim() ?? ''
  if (note.length < 5) {
    toast.add({ title: '请填写至少 5 个字的审核记录', color: 'warning' })
    return
  }
  reviewActionId.value = observation.id
  try {
    await $fetch(`/api/admin/coordinate-observations/${encodeURIComponent(observation.id)}/${action}`, {
      method: 'POST',
      body: { note },
      credentials: 'include'
    })
    await Promise.all([loadPlaces(), loadObservations()])
    Reflect.deleteProperty(reviewNotes, observation.id)
    const updatedPlace = places.value.find(place => place.id === observation.placeId)
    toast.add({
      title: action === 'reject'
        ? '观测已驳回'
        : updatedPlace?.coordinateVerification === 'verified'
          ? '第二条独立证据已完成，地点坐标已双重核验'
          : '观测已批准为首条候选，仍待独立复核',
      color: 'success'
    })
  } catch (error) {
    if (await redirectIfUnauthorized(error)) return
    toast.add({
      title: '审核失败',
      description: errorMessage(error, '请刷新并检查精度与审核状态。'),
      color: 'error'
    })
  } finally {
    reviewActionId.value = null
  }
}

function applyObservationSearch(): void {
  if (searchTimer) clearTimeout(searchTimer)
  const nextValue = observationSearchInput.value.trim()
  if (nextValue === appliedObservationSearch.value) {
    void loadObservations()
    return
  }
  appliedObservationSearch.value = nextValue
}

function toggleQueueDetails(id: string): void {
  expandedQueueId.value = expandedQueueId.value === id ? null : id
}

function placeName(placeId: string): string {
  return places.value.find(place => place.id === placeId)?.name ?? '未知地点'
}

function observationStatusLabel(status: CoordinateObservationStatus): string {
  return {
    pending: '待审核',
    approved: '已批准',
    rejected: '已驳回',
    superseded: '已被替代'
  }[status]
}

function observationStatusColor(status: CoordinateObservationStatus): 'neutral' | 'success' | 'error' | 'warning' {
  const colors: Record<
    CoordinateObservationStatus,
    'neutral' | 'success' | 'error' | 'warning'
  > = {
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
    superseded: 'neutral'
  }
  return colors[status]
}

function pointRoleLabel(role: ApiCoordinateObservation['pointRole']): string {
  return role === 'main-entrance' ? '主入口' : '场地点'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

watch(observationSearchInput, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(applyObservationSearch, 350)
})
watch([observationStatus, observationPageSize, appliedObservationSearch], () => {
  if (observationPage.value !== 1) observationPage.value = 1
  else void loadObservations()
})
watch(observationPage, () => void loadObservations())

onMounted(() => void refreshAll())
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <AdminPageHeader
      title="现场坐标观测"
      description="采集、暂存并审核地点主入口或场地点。"
      icon="i-lucide-crosshair"
      eyebrow="地图核验"
    >
      <template #actions>
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="outline"
          :loading="placesLoading || observationsLoading"
          @click="refreshAll"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="loadError"
      class="mt-4 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800"
      role="alert"
    >
      {{ loadError }}
    </div>

    <section class="mt-5">
      <div class="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center">
        <UFormField
          label="采点地点"
          class="min-w-0 flex-1"
        >
          <USelect
            v-model="selectedPlaceId"
            :items="placeOptions"
            :disabled="captureSessionLocked || submitting"
            value-key="value"
            label-key="label"
            placeholder="选择地点"
            class="w-full"
          />
        </UFormField>
        <div
          v-if="queued.length"
          class="flex shrink-0 flex-wrap items-center gap-2 sm:self-end"
        >
          <UBadge
            :label="`${queued.length} 条本地待同步`"
            color="warning"
            variant="soft"
          />
          <UButton
            icon="i-lucide-cloud-upload"
            label="全部同步"
            size="sm"
            :loading="syncing"
            :disabled="retryingQueueId !== null"
            @click="syncQueue"
          />
        </div>
      </div>

      <AdminFieldCoordinateCapture
        v-if="selectedPlace"
        :key="selectedPlace.id"
        ref="capture"
        :place-id="selectedPlace.id"
        :place-name="selectedPlace.name"
        :submitting="submitting"
        @submit="submitObservation"
        @session-lock-change="captureSessionLocked = $event"
      />
      <div
        v-else-if="!placesLoading"
        class="border-y border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500"
      >
        暂无可采点地点
      </div>
    </section>

    <section
      v-if="queued.length"
      class="mt-8 border-y border-amber-200 bg-amber-50/50"
    >
      <div class="flex flex-col gap-3 border-b border-amber-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-xs font-medium text-amber-800">
            本机 IndexedDB
          </p>
          <h2 class="mt-1 text-base font-bold text-zinc-950">
            离线观测队列
          </h2>
          <p class="mt-1 text-xs leading-5 text-zinc-600">
            每条记录保留原始幂等键；重试不会创建重复观测。
          </p>
        </div>
        <UButton
          icon="i-lucide-cloud-upload"
          label="全部同步"
          size="sm"
          :loading="syncing"
          :disabled="retryingQueueId !== null"
          @click="syncQueue"
        />
      </div>

      <div class="divide-y divide-amber-200">
        <article
          v-for="record in queued"
          :key="record.id"
          class="px-4 py-4"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h3 class="font-semibold text-zinc-950">
                {{ placeName(record.payload.placeId) }}
              </h3>
              <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                <span>{{ record.payload.samples.length }} 个样本</span>
                <span>{{ record.payload.pointRole === 'main-entrance' ? '主入口' : '场地点' }}</span>
                <span>{{ formatDate(record.queuedAt) }}</span>
              </div>
              <p
                v-if="queueErrors[record.id]"
                class="mt-2 text-xs leading-5 text-red-700"
                role="alert"
              >
                {{ queueErrors[record.id] }}
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <UButton
                :icon="expandedQueueId === record.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                :label="expandedQueueId === record.id ? '收起' : '查看'"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="toggleQueueDetails(record.id)"
              />
              <UButton
                icon="i-lucide-refresh-cw"
                label="重试"
                color="neutral"
                variant="outline"
                size="sm"
                :loading="retryingQueueId === record.id"
                :disabled="syncing || (retryingQueueId !== null && retryingQueueId !== record.id)"
                @click="retryQueuedObservation(record)"
              />
              <UTooltip text="删除本地记录">
                <UButton
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="soft"
                  size="sm"
                  :aria-label="`删除${placeName(record.payload.placeId)}的本地观测`"
                  :disabled="syncing || retryingQueueId !== null"
                  @click="requestQueueDeletion(record)"
                />
              </UTooltip>
            </div>
          </div>

          <div
            v-if="expandedQueueId === record.id"
            class="mt-4 border-t border-amber-200 pt-4"
          >
            <dl class="grid gap-x-5 gap-y-3 text-xs sm:grid-cols-2">
              <div>
                <dt class="text-zinc-500">
                  现场说明
                </dt>
                <dd class="mt-1 leading-5 text-zinc-800">
                  {{ record.payload.evidenceNote }}
                </dd>
              </div>
              <div>
                <dt class="text-zinc-500">
                  客户端观测 ID
                </dt>
                <dd class="mt-1 break-all font-mono text-zinc-800">
                  {{ record.payload.clientObservationId }}
                </dd>
              </div>
            </dl>
            <div class="mt-4 overflow-x-auto">
              <table class="min-w-full text-left text-xs">
                <thead class="text-zinc-500">
                  <tr>
                    <th class="whitespace-nowrap px-2 py-2 font-medium">
                      样本
                    </th>
                    <th class="whitespace-nowrap px-2 py-2 font-medium">
                      经度
                    </th>
                    <th class="whitespace-nowrap px-2 py-2 font-medium">
                      纬度
                    </th>
                    <th class="whitespace-nowrap px-2 py-2 font-medium">
                      定位精度
                    </th>
                    <th class="whitespace-nowrap px-2 py-2 font-medium">
                      采集时间
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-amber-100 text-zinc-800">
                  <tr
                    v-for="(sample, index) in record.payload.samples"
                    :key="`${record.id}-${index}`"
                  >
                    <td class="whitespace-nowrap px-2 py-2">
                      {{ index + 1 }}
                    </td>
                    <td class="whitespace-nowrap px-2 py-2 font-mono">
                      {{ sample.longitude.toFixed(7) }}
                    </td>
                    <td class="whitespace-nowrap px-2 py-2 font-mono">
                      {{ sample.latitude.toFixed(7) }}
                    </td>
                    <td class="whitespace-nowrap px-2 py-2">
                      {{ sample.accuracyMeters.toFixed(1) }} m
                    </td>
                    <td class="whitespace-nowrap px-2 py-2">
                      {{ formatDate(sample.capturedAt) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="mt-8">
      <div class="border-b border-zinc-200 pb-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-xs font-medium text-green-700">
              审核队列
            </p>
            <h2 class="mt-1 text-lg font-bold text-zinc-950">
              坐标观测记录
            </h2>
            <p class="mt-1 text-xs text-zinc-500">
              共 {{ observationTotal }} 条符合条件的观测
            </p>
          </div>
          <div class="grid min-w-0 gap-2 sm:grid-cols-[minmax(14rem,1fr)_10rem_9rem] lg:w-[42rem]">
            <UInput
              v-model="observationSearchInput"
              icon="i-lucide-search"
              placeholder="搜索地点名称"
              aria-label="搜索观测地点"
              @keydown.enter="applyObservationSearch"
            />
            <USelect
              v-model="observationStatus"
              :items="observationStatusOptions"
              value-key="value"
              label-key="label"
              aria-label="筛选审核状态"
            />
            <USelect
              v-model="observationPageSize"
              :items="pageSizeOptions"
              value-key="value"
              label-key="label"
              aria-label="每页条数"
            />
          </div>
        </div>
      </div>

      <div
        v-if="observationsLoading && !observations.length"
        class="grid min-h-52 place-items-center text-zinc-500"
        role="status"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 animate-spin"
        />
      </div>

      <div
        v-else-if="observations.length"
        class="grid gap-6 pt-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)]"
      >
        <div class="order-2 min-w-0 xl:order-1">
          <div class="divide-y divide-zinc-200 border-y border-zinc-200">
            <button
              v-for="observation in observations"
              :key="observation.id"
              type="button"
              class="block w-full px-3 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
              :class="selectedObservationId === observation.id ? 'bg-green-50' : 'hover:bg-zinc-50'"
              :aria-pressed="selectedObservationId === observation.id"
              @click="selectedObservationId = observation.id"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-zinc-950">{{ observation.placeName }}</span>
                <UBadge
                  :label="observationStatusLabel(observation.reviewStatus)"
                  :color="observationStatusColor(observation.reviewStatus)"
                  variant="soft"
                  size="sm"
                />
                <UBadge
                  :label="`${observation.accuracyMeters.toFixed(1)} m`"
                  :color="observation.accuracyMeters <= MAX_APPROVABLE_COORDINATE_ACCURACY_METERS ? 'success' : 'error'"
                  variant="soft"
                  size="sm"
                />
              </div>
              <p class="mt-2 line-clamp-2 text-sm leading-5 text-zinc-600">
                {{ observation.evidenceNote }}
              </p>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                <span>{{ observation.sampleCount }} 个样本</span>
                <span>{{ pointRoleLabel(observation.pointRole) }}</span>
                <span>{{ formatDate(observation.capturedAt) }}</span>
              </div>
            </button>
          </div>

          <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-xs text-zinc-500">
              第 {{ observationPage }} / {{ observationPageCount }} 页
            </p>
            <div class="flex items-center gap-2">
              <UTooltip text="上一页">
                <UButton
                  icon="i-lucide-chevron-left"
                  color="neutral"
                  variant="outline"
                  aria-label="上一页"
                  :disabled="observationPage <= 1 || observationsLoading"
                  @click="observationPage -= 1"
                />
              </UTooltip>
              <span class="min-w-20 text-center text-sm tabular-nums text-zinc-700">
                {{ observationPage }} / {{ observationPageCount }}
              </span>
              <UTooltip text="下一页">
                <UButton
                  icon="i-lucide-chevron-right"
                  color="neutral"
                  variant="outline"
                  aria-label="下一页"
                  :disabled="observationPage >= observationPageCount || observationsLoading"
                  @click="observationPage += 1"
                />
              </UTooltip>
            </div>
          </div>
        </div>

        <aside
          v-if="selectedObservation"
          class="order-1 min-w-0 xl:order-2"
          aria-label="选中观测审核详情"
        >
          <div class="border-b border-zinc-200 pb-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-base font-bold text-zinc-950">
                    {{ selectedObservation.placeName }}
                  </h3>
                  <UBadge
                    :label="observationStatusLabel(selectedObservation.reviewStatus)"
                    :color="observationStatusColor(selectedObservation.reviewStatus)"
                    variant="soft"
                  />
                  <UBadge
                    v-if="selectedObservation.outsideCampusReviewBounds"
                    label="超出校界缓冲区"
                    color="error"
                    variant="soft"
                  />
                </div>
                <p class="mt-2 text-sm leading-6 text-zinc-600">
                  {{ selectedObservation.evidenceNote }}
                </p>
              </div>
              <UBadge
                :label="`精度 ${selectedObservation.accuracyMeters.toFixed(1)} m`"
                :color="selectedObservation.accuracyMeters <= MAX_APPROVABLE_COORDINATE_ACCURACY_METERS ? 'success' : 'error'"
                variant="soft"
              />
            </div>
            <dl class="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt class="text-zinc-500">
                  计算结果
                </dt>
                <dd class="mt-1 font-mono text-zinc-900">
                  {{ selectedObservation.longitude.toFixed(7) }}, {{ selectedObservation.latitude.toFixed(7) }}
                </dd>
              </div>
              <div>
                <dt class="text-zinc-500">
                  采集方式
                </dt>
                <dd class="mt-1 text-zinc-900">
                  {{ selectedObservation.captureMethod }}
                </dd>
              </div>
              <div>
                <dt class="text-zinc-500">
                  采集时间
                </dt>
                <dd class="mt-1 text-zinc-900">
                  {{ formatDate(selectedObservation.capturedAt) }}
                </dd>
              </div>
            </dl>
          </div>

          <div
            v-if="selectedCoordinateReviewHint"
            class="mt-4 flex gap-3 border-l-4 px-3 py-3 text-sm"
            :class="selectedCoordinateReviewHint.stage === 'dual-verified'
              ? 'border-green-700 bg-green-50 text-green-950'
              : selectedCoordinateReviewHint.stage === 'possible-dual'
                ? 'border-blue-700 bg-blue-50 text-blue-950'
                : selectedCoordinateReviewHint.stage === 'replacement'
                  ? 'border-amber-600 bg-amber-50 text-amber-950'
                  : 'border-zinc-500 bg-zinc-50 text-zinc-800'"
            role="status"
          >
            <UIcon
              :name="selectedCoordinateReviewHint.stage === 'dual-verified'
                ? 'i-lucide-badge-check'
                : selectedCoordinateReviewHint.stage === 'possible-dual'
                  ? 'i-lucide-scan-search'
                  : selectedCoordinateReviewHint.stage === 'replacement'
                    ? 'i-lucide-triangle-alert'
                    : 'i-lucide-map-pin-check-inside'"
              class="mt-0.5 size-4 shrink-0"
            />
            <div>
              <p class="font-semibold">
                {{ selectedCoordinateReviewHint.title }}
              </p>
              <p class="mt-1 leading-5 opacity-80">
                {{ selectedCoordinateReviewHint.description }}
              </p>
            </div>
          </div>

          <AdminCoordinateReviewMap
            class="mt-5"
            :observation="selectedObservation"
            :place="selectedObservationPlace"
            :places="places"
          />

          <div
            v-if="selectedObservation.reviewStatus === 'pending'"
            class="mt-5 border-t border-zinc-200 pt-4"
          >
            <UFormField
              label="审核依据与现场比对结果"
              required
            >
              <UTextarea
                v-model="reviewNotes[selectedObservation.id]"
                :rows="3"
                maxlength="2000"
                placeholder="说明样本散点、精度圈、入口位置和邻近地点的比对结果"
                class="w-full"
              />
            </UFormField>
            <div class="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <UButton
                icon="i-lucide-x"
                label="驳回"
                color="neutral"
                variant="outline"
                :loading="reviewActionId === selectedObservation.id"
                @click="reviewObservation(selectedObservation, 'reject')"
              />
              <UButton
                icon="i-lucide-check"
                label="批准并纳入坐标证据"
                :disabled="selectedObservation.accuracyMeters > MAX_APPROVABLE_COORDINATE_ACCURACY_METERS || selectedObservation.outsideCampusReviewBounds"
                :loading="reviewActionId === selectedObservation.id"
                @click="reviewObservation(selectedObservation, 'approve')"
              />
            </div>
          </div>
          <div
            v-else
            class="mt-5 border-t border-zinc-200 pt-4 text-sm"
          >
            <p class="font-medium text-zinc-800">
              历史审核记录
            </p>
            <p class="mt-2 leading-6 text-zinc-600">
              {{ selectedObservation.reviewNote || '未填写审核说明。' }}
            </p>
            <p
              v-if="selectedObservation.reviewedAt"
              class="mt-2 text-xs text-zinc-500"
            >
              {{ formatDate(selectedObservation.reviewedAt) }}
            </p>
          </div>
        </aside>
      </div>

      <p
        v-else-if="!observationsLoading"
        class="py-12 text-center text-sm text-zinc-500"
      >
        当前筛选条件下暂无坐标观测
      </p>
    </section>

    <UModal
      v-model:open="deleteQueueOpen"
      title="删除本地观测"
      :description="deleteQueueTarget ? `确认删除“${placeName(deleteQueueTarget.payload.placeId)}”的离线观测？` : '确认删除此离线观测？'"
      :dismissible="!deletingQueue"
    >
      <template #body>
        <p class="text-sm leading-6 text-zinc-600">
          删除后无法从本机队列恢复。仅当这条记录确定无效或已经通过其他方式提交时执行此操作。
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            :disabled="deletingQueue"
            @click="deleteQueueOpen = false"
          />
          <UButton
            icon="i-lucide-trash-2"
            label="确认删除"
            color="error"
            :loading="deletingQueue"
            @click="deleteQueuedObservation"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
