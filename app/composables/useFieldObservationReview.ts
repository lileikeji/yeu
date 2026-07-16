import type { ApiPlace } from '~~/shared/types/server'
import type { CoordinateReviewAction } from '~/utils/field-observation-review-operations'
import { createFieldObservationReviewOperations } from '~/utils/field-observation-review-operations'

interface FieldObservationReviewNotification {
  title: string
  description?: string
  color: 'success' | 'warning' | 'error'
}

interface UseFieldObservationReviewOptions {
  places: Readonly<Ref<ApiPlace[]>>
  requestReview: (
    observationId: string,
    action: CoordinateReviewAction,
    note: string
  ) => Promise<void>
  reloadPlaces: () => Promise<void>
  reloadObservations: () => Promise<void>
  handleUnauthorized: (error: unknown) => Promise<boolean>
  notify: (notification: FieldObservationReviewNotification) => void
}

export function useFieldObservationReview(options: UseFieldObservationReviewOptions) {
  return createFieldObservationReviewOperations({
    state: {
      notes: reactive<Record<string, string>>({}),
      actionId: ref<string | null>(null)
    },
    requestReview: options.requestReview,
    reloadPlaces: options.reloadPlaces,
    reloadObservations: options.reloadObservations,
    getPlaceVerification: placeId => (
      options.places.value.find(place => place.id === placeId)?.coordinateVerification ?? null
    ),
    handleUnauthorized: options.handleUnauthorized,
    notify: options.notify
  })
}
