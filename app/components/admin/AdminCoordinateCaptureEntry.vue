<script setup lang="ts">
import type { ApiPlace, CreateCoordinateObservationPayload } from '~~/shared/types/server'
import type AdminFieldCoordinateCapture from './AdminFieldCoordinateCapture.vue'

const props = defineProps<{
  places: ApiPlace[]
  selectedPlace: ApiPlace | null
  placesLoading: boolean
  submitting: boolean
  queuedCount: number
  syncing: boolean
  retryingQueueId: string | null
}>()

const emit = defineEmits<{
  submit: [payload: CreateCoordinateObservationPayload]
  sync: []
}>()

const selectedPlaceId = defineModel<string>('selectedPlaceId', { default: '' })
const capture = ref<InstanceType<typeof AdminFieldCoordinateCapture> | null>(null)
const sessionLocked = ref(false)

const placeOptions = computed(() => props.places.map(place => ({
  label: `${place.name} · ${place.coordinateVerification === 'missing' ? '缺坐标' : place.coordinateVerification}`,
  value: place.id
})))

function setSessionLocked(locked: boolean): void {
  sessionLocked.value = locked
}

function markSubmitted(placeId: string): void {
  capture.value?.markSubmitted(placeId)
}

defineExpose({ markSubmitted })
</script>

<template>
  <section class="mt-5">
    <div class="flex flex-col gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center">
      <UFormField
        label="采点地点"
        class="min-w-0 flex-1"
      >
        <USelect
          v-model="selectedPlaceId"
          :items="placeOptions"
          :disabled="sessionLocked || submitting"
          value-key="value"
          label-key="label"
          placeholder="选择地点"
          aria-label="选择采点地点"
          class="w-full"
        />
      </UFormField>
      <div
        v-if="queuedCount"
        class="flex shrink-0 flex-wrap items-center gap-2 sm:self-end"
      >
        <UBadge
          :label="`${queuedCount} 条本地待同步`"
          color="warning"
          variant="soft"
        />
        <UButton
          icon="i-lucide-cloud-upload"
          label="全部同步"
          size="sm"
          :loading="syncing"
          :disabled="retryingQueueId !== null"
          @click="emit('sync')"
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
      @submit="emit('submit', $event)"
      @session-lock-change="setSessionLocked"
    />
    <div
      v-else-if="!placesLoading"
      class="border-y border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500"
    >
      暂无可采点地点
    </div>
  </section>
</template>
