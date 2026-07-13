<script setup lang="ts">
import type {
  ApiCoordinateSample,
  CreateCoordinateObservationPayload
} from '~~/shared/types/server'
import {
  coordinateCaptureBelongsToPlace,
  shouldLockCoordinateCapturePlace
} from '~/utils/coordinate-capture-session'

const props = defineProps<{
  placeId: string
  placeName: string
  submitting?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: CreateCoordinateObservationPayload]
  sessionLockChange: [locked: boolean]
}>()

const MAX_SAMPLES = 5
const samples = ref<ApiCoordinateSample[]>([])
const evidenceNote = ref('')
const pointRole = ref<'site-point' | 'main-entrance'>('main-entrance')
const tracking = ref(false)
const captureError = ref('')
const watchId = ref<number | null>(null)
const capturePlaceId = ref<string | null>(null)
let lastAcceptedAt = 0

const latestSample = computed(() => samples.value.at(-1) ?? null)
const captureMatchesCurrentPlace = computed(() => coordinateCaptureBelongsToPlace(
  capturePlaceId.value,
  props.placeId
))
const readyToSubmit = computed(() => captureMatchesCurrentPlace.value
  && samples.value.length >= 3
  && evidenceNote.value.trim().length >= 5)
const sessionLocked = computed(() => shouldLockCoordinateCapturePlace(
  tracking.value,
  samples.value.length
))
const qualityTone = computed(() => {
  const accuracy = latestSample.value?.accuracyMeters
  if (accuracy === undefined) return 'neutral'
  if (accuracy <= 15) return 'success'
  if (accuracy <= 25) return 'warning'
  return 'error'
})
const qualityLabel = computed(() => {
  const accuracy = latestSample.value?.accuracyMeters
  if (accuracy === undefined) return '等待定位'
  return `精度约 ${accuracy.toFixed(1)} 米`
})

function stopCapture(): void {
  if (watchId.value !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId.value)
  }
  watchId.value = null
  tracking.value = false
}

function acceptPosition(position: GeolocationPosition): void {
  if (!captureMatchesCurrentPlace.value) {
    resetCapture()
    captureError.value = '采点地点已变化，请重新采点。'
    return
  }
  const now = Date.now()
  if (now - lastAcceptedAt < 1500 || samples.value.length >= MAX_SAMPLES) return
  const { longitude, latitude, accuracy } = position.coords
  if (![longitude, latitude, accuracy].every(Number.isFinite) || accuracy < 0 || accuracy > 1000) return

  lastAcceptedAt = now
  samples.value.push({
    longitude,
    latitude,
    accuracyMeters: accuracy,
    capturedAt: new Date(position.timestamp).toISOString()
  })
  if (samples.value.length >= MAX_SAMPLES) stopCapture()
}

function handlePositionError(error: GeolocationPositionError): void {
  captureError.value = error.code === error.PERMISSION_DENIED
    ? '定位权限未开启。'
    : '暂时无法取得稳定定位。'
  stopCapture()
}

function startCapture(): void {
  captureError.value = ''
  samples.value = []
  capturePlaceId.value = null
  lastAcceptedAt = 0
  if (!navigator.geolocation) {
    captureError.value = '当前浏览器不支持定位。'
    return
  }

  capturePlaceId.value = props.placeId
  tracking.value = true
  watchId.value = navigator.geolocation.watchPosition(acceptPosition, handlePositionError, {
    enableHighAccuracy: true,
    timeout: 20_000,
    maximumAge: 0
  })
}

function resetCapture(): void {
  stopCapture()
  samples.value = []
  capturePlaceId.value = null
  captureError.value = ''
}

function submitObservation(): void {
  if (!captureMatchesCurrentPlace.value) {
    resetCapture()
    captureError.value = '采点地点已变化，请重新采点。'
    return
  }
  if (!readyToSubmit.value) return
  emit('submit', {
    placeId: capturePlaceId.value!,
    coordinateSystem: 'WGS84',
    captureMethod: 'browser-geolocation',
    pointRole: pointRole.value,
    evidenceNote: evidenceNote.value.trim(),
    samples: [...samples.value]
  })
}

function markSubmitted(submittedPlaceId = props.placeId): void {
  if (!coordinateCaptureBelongsToPlace(capturePlaceId.value, submittedPlaceId)) return
  resetCapture()
  evidenceNote.value = ''
}

watch(sessionLocked, locked => emit('sessionLockChange', locked), {
  immediate: true,
  flush: 'sync'
})
watch(() => props.placeId, (placeId, previousPlaceId) => {
  if (placeId === previousPlaceId) return
  resetCapture()
  evidenceNote.value = ''
})

defineExpose({ markSubmitted })
onBeforeUnmount(() => {
  stopCapture()
  emit('sessionLockChange', false)
})
</script>

<template>
  <section class="border-y border-zinc-200 bg-white px-4 py-5 sm:px-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium text-green-700">
          当前地点
        </p>
        <h2 class="mt-1 text-base font-bold text-zinc-950">
          {{ placeName }}
        </h2>
      </div>
      <UBadge
        :label="qualityLabel"
        :color="qualityTone"
        variant="soft"
      />
    </div>

    <div
      class="mt-5 grid grid-cols-5 gap-2"
      aria-label="定位样本进度"
    >
      <span
        v-for="index in MAX_SAMPLES"
        :key="index"
        class="h-2 rounded-sm"
        :class="index <= samples.length ? 'bg-green-600' : 'bg-zinc-200'"
      />
    </div>
    <p
      class="mt-2 text-xs text-zinc-500"
      role="status"
      aria-live="polite"
    >
      已采集 {{ samples.length }} / {{ MAX_SAMPLES }} 个样本，至少需要 3 个
    </p>

    <div
      v-if="latestSample"
      class="mt-4 grid grid-cols-2 gap-3 border-y border-zinc-100 py-3 text-xs"
    >
      <div>
        <p class="text-zinc-400">
          经度
        </p>
        <p class="mt-1 font-medium tabular-nums text-zinc-800">
          {{ latestSample.longitude.toFixed(7) }}
        </p>
      </div>
      <div>
        <p class="text-zinc-400">
          纬度
        </p>
        <p class="mt-1 font-medium tabular-nums text-zinc-800">
          {{ latestSample.latitude.toFixed(7) }}
        </p>
      </div>
    </div>

    <p
      v-if="captureError"
      class="mt-3 text-sm text-red-700"
      role="alert"
    >
      {{ captureError }}
    </p>

    <div class="mt-4 flex flex-wrap gap-2">
      <UButton
        v-if="!tracking"
        icon="i-lucide-locate-fixed"
        label="开始采点"
        @click="startCapture"
      />
      <UButton
        v-else
        icon="i-lucide-square"
        label="停止采点"
        color="warning"
        variant="soft"
        @click="stopCapture"
      />
      <UButton
        icon="i-lucide-rotate-ccw"
        label="重采"
        color="neutral"
        variant="outline"
        :disabled="!samples.length && !tracking"
        @click="resetCapture"
      />
    </div>

    <div class="mt-5 grid gap-4 sm:grid-cols-2">
      <UFormField
        label="点位角色"
        required
      >
        <USelect
          v-model="pointRole"
          :items="[
            { label: '主入口', value: 'main-entrance' },
            { label: '场地点', value: 'site-point' }
          ]"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="现场证据说明"
        required
      >
        <UTextarea
          v-model="evidenceNote"
          :rows="3"
          maxlength="2000"
          placeholder="标牌、入口方向或现场参照物"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="mt-5 flex justify-end">
      <UButton
        icon="i-lucide-cloud-upload"
        label="提交待审核观测"
        :loading="submitting"
        :disabled="!readyToSubmit || tracking"
        @click="submitObservation"
      />
    </div>
  </section>
</template>
