import type { Ref } from 'vue'
import type { ApiCoordinateObservation, ApiPlace } from '~~/shared/types/server'
import { getRequestMessage } from './request-error'

export type CoordinateReviewAction = 'approve' | 'reject'

export interface FieldObservationReviewState {
  notes: Record<string, string>
  actionId: Ref<string | null>
}

interface ReviewNotification {
  title: string
  description?: string
  color: 'success' | 'warning' | 'error'
}

interface CreateFieldObservationReviewOperationsOptions {
  state: FieldObservationReviewState
  requestReview: (
    observationId: string,
    action: CoordinateReviewAction,
    note: string
  ) => Promise<void>
  reloadPlaces: () => Promise<void>
  reloadObservations: () => Promise<void>
  getPlaceVerification: (placeId: string) => ApiPlace['coordinateVerification'] | null
  handleUnauthorized: (error: unknown) => Promise<boolean>
  notify: (notification: ReviewNotification) => void
}

export function createFieldObservationReviewOperations(
  options: CreateFieldObservationReviewOperationsOptions
) {
  const state = options.state

  async function reviewObservation(
    observation: ApiCoordinateObservation,
    action: CoordinateReviewAction
  ): Promise<void> {
    if (observation.reviewStatus !== 'pending' || state.actionId.value !== null) return
    const note = state.notes[observation.id]?.trim() ?? ''
    if (note.length < 5) {
      options.notify({ title: '请填写至少 5 个字的审核记录', color: 'warning' })
      return
    }

    state.actionId.value = observation.id
    try {
      await options.requestReview(observation.id, action, note)
      await Promise.all([options.reloadPlaces(), options.reloadObservations()])
      Reflect.deleteProperty(state.notes, observation.id)
      const verification = options.getPlaceVerification(observation.placeId)
      options.notify({
        title: action === 'reject'
          ? '定位记录已驳回'
          : verification === 'verified'
            ? '第二条独立记录已确认，地点坐标已完成双重确认'
            : '定位记录已批准，还需另一条独立记录确认',
        color: 'success'
      })
    } catch (error) {
      if (await options.handleUnauthorized(error)) return
      options.notify({
        title: '审核失败',
        description: getRequestMessage(error, '请刷新并检查精度与审核状态。'),
        color: 'error'
      })
    } finally {
      if (state.actionId.value === observation.id) state.actionId.value = null
    }
  }

  return { ...state, reviewObservation }
}
