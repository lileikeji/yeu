<script setup lang="ts">
import type {
  ApiCoordinateSample,
  CreateCoordinateObservationPayload
} from '~~/shared/types/server'
import {
  coordinateCaptureBelongsToPlace,
  shouldLockCoordinateCapturePlace
} from '~/utils/coordinate-capture-session'
import {
  evaluateCoordinateCapture,
  FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS,
  FIELD_CAPTURE_MAX_SAMPLES,
  FIELD_CAPTURE_MIN_DURATION_MS,
  FIELD_CAPTURE_MIN_SAMPLE_INTERVAL_MS,
  FIELD_CAPTURE_MIN_SAMPLES
} from '~~/shared/utils/coordinate-sampling'

const props = defineProps<{
  placeId: string
  placeName: string
  submitting?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: CreateCoordinateObservationPayload]
  sessionLockChange: [locked: boolean]
}>()

const samples = ref<ApiCoordinateSample[]>([])
const evidenceNote = ref('')
const pointRole = ref<'site-point' | 'main-entrance'>('main-entrance')
const tracking = ref(false)
const captureError = ref('')
const watchId = ref<number | null>(null)
const capturePlaceId = ref<string | null>(null)
const clientObservationId = ref<string | null>(null)
const latestReportedAccuracy = ref<number | null>(null)
let lastAcceptedAt = 0

const captureQuality = computed(() => evaluateCoordinateCapture(samples.value))
const captureSummary = computed(() => captureQuality.value.summary)
const captureMatchesCurrentPlace = computed(() => coordinateCaptureBelongsToPlace(
  capturePlaceId.value,
  props.placeId
))
const readyToSubmit = computed(() => captureMatchesCurrentPlace.value
  && clientObservationId.value !== null
  && captureQuality.value.canSubmit
  && evidenceNote.value.trim().length >= 5)
const sessionLocked = computed(() => shouldLockCoordinateCapturePlace(
  tracking.value,
  samples.value.length
))
const qualityTone = computed(() => {
  if (captureQuality.value.state === 'ready') return 'success'
  if (captureQuality.value.state === 'unstable' || captureQuality.value.state === 'invalid') return 'error'
  if (samples.value.length) return 'warning'
  return 'neutral'
})
const qualityLabel = computed(() => {
  const summary = captureSummary.value
  if (captureQuality.value.state === 'ready' && summary) {
    return `稳定 · 有效精度 ${summary.effectiveAccuracyMeters.toFixed(1)} 米`
  }
  if (summary) return `有效精度约 ${summary.effectiveAccuracyMeters.toFixed(1)} 米`
  if (latestReportedAccuracy.value !== null) {
    return `当前定位约 ${latestReportedAccuracy.value.toFixed(1)} 米`
  }
  return '等待高精度定位'
})
const qualityDetail = computed(() => {
  const summary = captureSummary.value
  if (!samples.value.length && latestReportedAccuracy.value !== null
    && latestReportedAccuracy.value > FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS) {
    return `当前修复精度不足，等待 ${FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS} 米以内的定位。`
  }
  if (captureQuality.value.state === 'collecting') {
    return `继续保持静止，至少收录 ${FIELD_CAPTURE_MIN_SAMPLES} 个样本。`
  }
  if (captureQuality.value.state === 'too-short' && summary) {
    return `采样仅持续 ${(summary.captureDurationMs / 1000).toFixed(0)} 秒，请继续至 ${FIELD_CAPTURE_MIN_DURATION_MS / 1000} 秒。`
  }
  if (captureQuality.value.state === 'unstable' && summary) {
    return `样本离散或设备精度超过 ${FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS} 米，请移动到开阔处重采。`
  }
  if (captureQuality.value.state === 'invalid') return '样本格式异常，请重采。'
  return '采样稳定，可停止并填写现场证据。'
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
  if (samples.value.length >= FIELD_CAPTURE_MAX_SAMPLES) return
  const { longitude, latitude, accuracy } = position.coords
  if (![longitude, latitude, accuracy].every(Number.isFinite) || accuracy < 0 || accuracy > 1000) return
  const capturedAtMs = Number.isFinite(position.timestamp)
    && position.timestamp > 0
    && Math.abs(now - position.timestamp) <= 60_000
    ? position.timestamp
    : now
  latestReportedAccuracy.value = accuracy
  if (accuracy > FIELD_CAPTURE_MAX_ACCEPTED_ACCURACY_METERS
    || capturedAtMs - lastAcceptedAt < FIELD_CAPTURE_MIN_SAMPLE_INTERVAL_MS) return

  lastAcceptedAt = capturedAtMs
  samples.value.push({
    longitude,
    latitude,
    accuracyMeters: accuracy,
    capturedAt: new Date(capturedAtMs).toISOString()
  })
  const quality = evaluateCoordinateCapture(samples.value)
  if (quality.canSubmit || samples.value.length >= FIELD_CAPTURE_MAX_SAMPLES) stopCapture()
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
  clientObservationId.value = null
  latestReportedAccuracy.value = null
  lastAcceptedAt = 0
  if (!navigator.geolocation) {
    captureError.value = '当前浏览器不支持定位。'
    return
  }

  capturePlaceId.value = props.placeId
  clientObservationId.value = crypto.randomUUID()
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
  clientObservationId.value = null
  latestReportedAccuracy.value = null
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
    clientObservationId: clientObservationId.value!,
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
      class="mt-5 grid grid-cols-7 gap-2"
      aria-label="定位样本进度"
    >
      <span
        v-for="index in FIELD_CAPTURE_MAX_SAMPLES"
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
      已收录 {{ samples.length }} / {{ FIELD_CAPTURE_MAX_SAMPLES }} 个精度合格样本
    </p>
    <p
      class="mt-1 text-xs"
      :class="captureQuality.state === 'unstable' || captureQuality.state === 'invalid'
        ? 'text-red-700'
        : 'text-zinc-500'"
    >
      {{ qualityDetail }}
    </p>

    <div
      v-if="captureSummary"
      class="mt-4 grid grid-cols-2 gap-3 border-y border-zinc-100 py-3 text-xs sm:grid-cols-4"
    >
      <div>
        <p class="text-zinc-400">
          经度
        </p>
        <p class="mt-1 font-medium tabular-nums text-zinc-800">
          {{ captureSummary.longitude.toFixed(7) }}
        </p>
      </div>
      <div>
        <p class="text-zinc-400">
          纬度
        </p>
        <p class="mt-1 font-medium tabular-nums text-zinc-800">
          {{ captureSummary.latitude.toFixed(7) }}
        </p>
      </div>
      <div>
        <p class="text-zinc-400">
          最大离散
        </p>
        <p class="mt-1 font-medium tabular-nums text-zinc-800">
          {{ captureSummary.maxSpreadMeters.toFixed(1) }} 米
        </p>
      </div>
      <div>
        <p class="text-zinc-400">
          采样时长
        </p>
        <p class="mt-1 font-medium tabular-nums text-zinc-800">
          {{ (captureSummary.captureDurationMs / 1000).toFixed(0) }} 秒
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
