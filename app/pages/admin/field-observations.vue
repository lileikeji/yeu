<script setup lang="ts">
import type AdminCoordinateCaptureEntry from '~/components/admin/AdminCoordinateCaptureEntry.vue'
import { isAuthorizationError } from '~/utils/request-error'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '现场采点', robots: 'noindex, nofollow' })

const toast = useToast()
const captureEntry = ref<InstanceType<typeof AdminCoordinateCaptureEntry> | null>(null)

const {
  places,
  observations,
  selectedPlaceId,
  selectedObservationId,
  selectedPlace,
  selectedObservation,
  selectedObservationPlace,
  placesLoading,
  observationsLoading,
  loadError,
  searchInput: observationSearchInput,
  status: observationStatus,
  page: observationPage,
  pageSize: observationPageSize,
  total: observationTotal,
  pageCount: observationPageCount,
  loadPlaces,
  loadObservations,
  applySearch: applyObservationSearch
} = useFieldObservationCatalog({
  request: (endpoint, options) => adminFetch(endpoint, options),
  handleUnauthorized: redirectIfUnauthorized
})

async function redirectIfUnauthorized(error: unknown): Promise<boolean> {
  if (!isAuthorizationError(error)) return false
  await navigateTo('/admin/login', { replace: true })
  return true
}

const {
  queued,
  submitting,
  syncing,
  retryingId: retryingQueueId,
  errors: queueErrors,
  deleteOpen: deleteQueueOpen,
  deleteTarget: deleteQueueTarget,
  deleting: deletingQueue,
  loadLocalQueue,
  submitObservation,
  retryQueuedObservation,
  syncQueue,
  requestQueueDeletion,
  deleteQueuedObservation
} = useFieldObservationQueue({
  submitToServer: async (payload) => {
    await adminFetch('/api/admin/coordinate-observations', {
      method: 'POST',
      body: payload
    })
  },
  reloadObservations: loadObservations,
  markSubmitted: placeId => captureEntry.value?.markSubmitted(placeId),
  handleUnauthorized: redirectIfUnauthorized,
  notify: notification => toast.add(notification)
})

const {
  notes: reviewNotes,
  actionId: reviewActionId,
  reviewObservation
} = useFieldObservationReview({
  places,
  requestReview: async (observationId, action, note) => {
    await adminFetch(
      `/api/admin/coordinate-observations/${encodeURIComponent(observationId)}/${action}`,
      {
        method: 'POST',
        body: { note }
      }
    )
  },
  reloadPlaces: loadPlaces,
  reloadObservations: loadObservations,
  handleUnauthorized: redirectIfUnauthorized,
  notify: notification => toast.add(notification)
})

const selectedReviewNote = computed({
  get: () => {
    const observationId = selectedObservation.value?.id
    return observationId ? reviewNotes[observationId] ?? '' : ''
  },
  set: (value: string) => {
    const observationId = selectedObservation.value?.id
    if (observationId) reviewNotes[observationId] = value
  }
})

async function refreshAll(): Promise<void> {
  await Promise.all([loadPlaces(), loadObservations(), loadLocalQueue()])
}

onMounted(() => void refreshAll())
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <AdminPageHeader
      title="现场坐标采集"
      icon="i-lucide-crosshair"
      eyebrow="地图审核"
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
      class="mt-4 border-l-2 border-red-500 bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-800 dark:text-red-300"
      role="alert"
    >
      {{ loadError }}
    </div>

    <AdminCoordinateCaptureEntry
      ref="captureEntry"
      v-model:selected-place-id="selectedPlaceId"
      :places="places"
      :selected-place="selectedPlace"
      :places-loading="placesLoading"
      :submitting="submitting"
      :queued-count="queued.length"
      :syncing="syncing"
      :retrying-queue-id="retryingQueueId"
      @submit="submitObservation"
      @sync="syncQueue"
    />

    <AdminCoordinateOfflineQueuePanel
      v-if="queued.length"
      v-model:delete-open="deleteQueueOpen"
      :records="queued"
      :places="places"
      :syncing="syncing"
      :retrying-id="retryingQueueId"
      :errors="queueErrors"
      :delete-target="deleteQueueTarget"
      :deleting="deletingQueue"
      @sync="syncQueue"
      @retry="retryQueuedObservation"
      @request-delete="requestQueueDeletion"
      @confirm-delete="deleteQueuedObservation"
    />

    <AdminCoordinateObservationReviewList
      v-model:search-input="observationSearchInput"
      v-model:status="observationStatus"
      v-model:page-size="observationPageSize"
      v-model:page="observationPage"
      v-model:selected-observation-id="selectedObservationId"
      :observations="observations"
      :total="observationTotal"
      :page-count="observationPageCount"
      :loading="observationsLoading"
      @apply-search="applyObservationSearch"
    >
      <template #details>
        <AdminCoordinateObservationReviewDetails
          v-if="selectedObservation"
          v-model:review-note="selectedReviewNote"
          :observation="selectedObservation"
          :place="selectedObservationPlace"
          :places="places"
          :action-id="reviewActionId"
          @review="reviewObservation"
        />
      </template>
    </AdminCoordinateObservationReviewList>
  </div>
</template>
