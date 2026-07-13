<script setup lang="ts">
import { MAX_APPROVABLE_COORDINATE_ACCURACY_METERS } from '~~/shared/constants/server'
import type {
  ApiCoordinateObservation,
  ApiListResponse,
  ApiPlace,
  CreateCoordinateObservationPayload
} from '~~/shared/types/server'
import type AdminFieldCoordinateCapture from '~/components/admin/AdminFieldCoordinateCapture.vue'
import {
  enqueueCoordinateObservation,
  listQueuedCoordinateObservations,
  removeQueuedCoordinateObservation,
  type QueuedCoordinateObservation
} from '~/utils/coordinate-observation-queue'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '现场采点', robots: 'noindex, nofollow' })

const toast = useToast()
const capture = ref<InstanceType<typeof AdminFieldCoordinateCapture> | null>(null)
const places = ref<ApiPlace[]>([])
const observations = ref<ApiCoordinateObservation[]>([])
const queued = ref<QueuedCoordinateObservation[]>([])
const selectedPlaceId = ref('')
const captureSessionLocked = ref(false)
const loading = ref(true)
const submitting = ref(false)
const syncing = ref(false)
const loadError = ref('')
const reviewNotes = reactive<Record<string, string>>({})
const reviewActionId = ref<string | null>(null)

const selectedPlace = computed(() => places.value.find(place => place.id === selectedPlaceId.value) ?? null)
const placeOptions = computed(() => places.value.map(place => ({
  label: `${place.name} · ${place.coordinateVerification === 'missing' ? '缺坐标' : place.coordinateVerification}`,
  value: place.id
})))

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

async function loadData(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const [placeResponse, observationResponse] = await Promise.all([
      $fetch<ApiListResponse<ApiPlace>>('/api/admin/places', {
        query: { page: 1, pageSize: 200 },
        credentials: 'include'
      }),
      $fetch<ApiListResponse<ApiCoordinateObservation>>('/api/admin/coordinate-observations', {
        query: { page: 1, pageSize: 100, status: 'pending' },
        credentials: 'include'
      })
    ])
    places.value = [...placeResponse.items].sort((left, right) => {
      const leftPriority = left.coordinateVerification === 'missing' ? 0 : 1
      const rightPriority = right.coordinateVerification === 'missing' ? 0 : 1
      return leftPriority - rightPriority || left.name.localeCompare(right.name, 'zh-CN')
    })
    observations.value = observationResponse.items
    if (!selectedPlaceId.value && places.value[0]) selectedPlaceId.value = places.value[0].id
  } catch (error) {
    if ([401, 403].includes(statusCode(error) ?? 0)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    loadError.value = errorMessage(error, '采点队列暂时无法加载。')
  } finally {
    loading.value = false
  }
}

async function loadLocalQueue(): Promise<void> {
  try {
    queued.value = await listQueuedCoordinateObservations()
  } catch {
    queued.value = []
  }
}

async function submitToServer(payload: CreateCoordinateObservationPayload): Promise<void> {
  await $fetch('/api/admin/coordinate-observations', {
    method: 'POST',
    body: payload,
    credentials: 'include'
  })
}

async function submitObservation(payload: CreateCoordinateObservationPayload): Promise<void> {
  submitting.value = true
  try {
    await submitToServer(payload)
    capture.value?.markSubmitted(payload.placeId)
    toast.add({ title: '观测已进入审核队列', color: 'success' })
    await loadData()
  } catch (error) {
    const code = statusCode(error)
    if (code === null || code >= 500) {
      try {
        await enqueueCoordinateObservation(payload)
        capture.value?.markSubmitted(payload.placeId)
        await loadLocalQueue()
        toast.add({ title: '网络不可用，观测已保存在本机', color: 'warning' })
      } catch {
        toast.add({ title: '观测提交失败', description: '本机离线队列也不可用。', color: 'error' })
      }
    } else {
      toast.add({ title: '观测未提交', description: errorMessage(error, '请检查样本与说明。'), color: 'error' })
    }
  } finally {
    submitting.value = false
  }
}

async function syncQueue(): Promise<void> {
  syncing.value = true
  let synced = 0
  try {
    for (const record of queued.value) {
      await submitToServer(record.payload)
      await removeQueuedCoordinateObservation(record.id)
      synced += 1
    }
    await Promise.all([loadLocalQueue(), loadData()])
    toast.add({ title: `已同步 ${synced} 条本地观测`, color: 'success' })
  } catch (error) {
    await loadLocalQueue()
    toast.add({ title: '同步中断', description: errorMessage(error, '剩余观测继续保存在本机。'), color: 'warning' })
  } finally {
    syncing.value = false
  }
}

async function reviewObservation(observation: ApiCoordinateObservation, action: 'approve' | 'reject'): Promise<void> {
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
    Reflect.deleteProperty(reviewNotes, observation.id)
    toast.add({ title: action === 'approve' ? '坐标已批准并写入地点' : '观测已驳回', color: 'success' })
    await loadData()
  } catch (error) {
    toast.add({ title: '审核失败', description: errorMessage(error, '请检查精度与校界状态。'), color: 'error' })
  } finally {
    reviewActionId.value = null
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

onMounted(() => {
  void Promise.all([loadData(), loadLocalQueue()])
})
</script>

<template>
  <div class="mx-auto max-w-6xl">
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
          :loading="loading"
          @click="loadData"
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
          class="flex shrink-0 items-center gap-2 sm:self-end"
        >
          <UBadge
            :label="`${queued.length} 条本地待同步`"
            color="warning"
            variant="soft"
          />
          <UButton
            icon="i-lucide-cloud-upload"
            label="同步"
            size="sm"
            :loading="syncing"
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
        v-else-if="!loading"
        class="border-y border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500"
      >
        暂无可采点地点
      </div>
    </section>

    <section class="mt-8">
      <div class="flex items-end justify-between gap-3 border-b border-zinc-200 pb-3">
        <div>
          <p class="text-xs font-medium text-green-700">
            审核队列
          </p>
          <h2 class="mt-1 text-lg font-bold text-zinc-950">
            待审核观测
          </h2>
        </div>
        <span class="text-xs text-zinc-500">{{ observations.length }} 条</span>
      </div>

      <div
        v-if="observations.length"
        class="divide-y divide-zinc-200"
      >
        <article
          v-for="observation in observations"
          :key="observation.id"
          class="py-5"
        >
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-bold text-zinc-950">
                  {{ observation.placeName }}
                </h3>
                <UBadge
                  :label="observation.pointRole === 'main-entrance' ? '主入口' : '场地点'"
                  color="neutral"
                  variant="soft"
                />
                <UBadge
                  :label="`精度 ${observation.accuracyMeters.toFixed(1)} m`"
                  :color="observation.accuracyMeters <= MAX_APPROVABLE_COORDINATE_ACCURACY_METERS ? 'success' : 'error'"
                  variant="soft"
                />
                <UBadge
                  v-if="observation.outsideCampusReviewBounds"
                  label="超出校界缓冲区"
                  color="error"
                  variant="soft"
                />
              </div>
              <p class="mt-2 text-sm leading-6 text-zinc-600">
                {{ observation.evidenceNote }}
              </p>
              <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
                <span>{{ observation.sampleCount }} 个样本</span>
                <span class="tabular-nums">{{ observation.longitude.toFixed(7) }}, {{ observation.latitude.toFixed(7) }}</span>
                <span>{{ formatDate(observation.capturedAt) }}</span>
              </div>
            </div>
            <div class="w-full shrink-0 lg:w-80">
              <UTextarea
                v-model="reviewNotes[observation.id]"
                :rows="2"
                maxlength="2000"
                placeholder="审核依据与现场比对结果"
                class="w-full"
              />
              <div class="mt-2 flex justify-end gap-2">
                <UButton
                  icon="i-lucide-x"
                  label="驳回"
                  color="neutral"
                  variant="outline"
                  :loading="reviewActionId === observation.id"
                  @click="reviewObservation(observation, 'reject')"
                />
                <UButton
                  icon="i-lucide-check"
                  label="批准"
                  :disabled="observation.accuracyMeters > MAX_APPROVABLE_COORDINATE_ACCURACY_METERS || observation.outsideCampusReviewBounds"
                  :loading="reviewActionId === observation.id"
                  @click="reviewObservation(observation, 'approve')"
                />
              </div>
            </div>
          </div>
        </article>
      </div>
      <p
        v-else-if="!loading"
        class="py-12 text-center text-sm text-zinc-500"
      >
        暂无待审核观测
      </p>
    </section>
  </div>
</template>
