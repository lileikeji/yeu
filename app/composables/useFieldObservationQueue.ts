import type { CoordinateObservationSubmissionPayload } from '~/utils/coordinate-observation-queue'
import {
  enqueueCoordinateObservation,
  ensureCoordinateObservationClientId,
  listQueuedCoordinateObservations,
  removeQueuedCoordinateObservation
} from '~/utils/coordinate-observation-queue'
import { createFieldObservationQueueOperations } from '~/utils/field-observation-queue-operations'

interface FieldObservationQueueNotification {
  title: string
  description?: string
  color: 'success' | 'warning' | 'error'
}

interface UseFieldObservationQueueOptions {
  submitToServer: (payload: CoordinateObservationSubmissionPayload) => Promise<void>
  reloadObservations: () => Promise<void>
  markSubmitted: (placeId: string) => void
  handleUnauthorized: (error: unknown) => Promise<boolean>
  notify: (notification: FieldObservationQueueNotification) => void
}

export function useFieldObservationQueue(options: UseFieldObservationQueueOptions) {
  const operations = createFieldObservationQueueOperations({
    state: {
      queued: ref([]),
      submitting: ref(false),
      syncing: ref(false),
      retryingId: ref<string | null>(null),
      errors: reactive<Record<string, string>>({}),
      deleteOpen: ref(false),
      deleteTarget: ref(null),
      deleting: ref(false)
    },
    ensureSubmission: ensureCoordinateObservationClientId,
    enqueue: enqueueCoordinateObservation,
    list: listQueuedCoordinateObservations,
    remove: removeQueuedCoordinateObservation,
    ...options
  })

  onBeforeUnmount(operations.cancelQueueLoads)
  return operations
}
