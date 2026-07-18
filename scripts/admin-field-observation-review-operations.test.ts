import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { ApiCoordinateObservation, ApiPlace } from '../shared/types/server'
import type { FieldObservationReviewState } from '../app/utils/field-observation-review-operations'
import { createFieldObservationReviewOperations } from '../app/utils/field-observation-review-operations'

function observation(
  id: string,
  status: ApiCoordinateObservation['reviewStatus'] = 'pending'
): ApiCoordinateObservation {
  return {
    id,
    placeId: `place-${id}`,
    reviewStatus: status
  } as ApiCoordinateObservation
}

function state(notes: Record<string, string> = {}): FieldObservationReviewState {
  return { notes, actionId: { value: null } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('non-pending observations and short notes never reach the review API', async () => {
  const reviewState = state({ pending: ' 短 ' })
  let requestCount = 0
  const notifications: string[] = []
  const operations = createFieldObservationReviewOperations({
    state: reviewState,
    async requestReview() { requestCount += 1 },
    async reloadPlaces() {},
    async reloadObservations() {},
    getPlaceVerification() { return null },
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })

  await operations.reviewObservation(observation('approved', 'approved'), 'approve')
  await operations.reviewObservation(observation('pending'), 'approve')
  assert.equal(requestCount, 0)
  assert.deepEqual(notifications, ['请填写至少 5 个字的审核记录'])
  assert.equal(reviewState.actionId.value, null)
})

test('review notes are trimmed and concurrent review actions are blocked globally', async () => {
  const reviewState = state({ first: '  现场位置确认无误  ', second: '第二条审核说明' })
  const request = deferred<undefined>()
  const calls: Array<{ id: string, action: string, note: string }> = []
  const operations = createFieldObservationReviewOperations({
    state: reviewState,
    requestReview(id, action, note) {
      calls.push({ id, action, note })
      return request.promise
    },
    async reloadPlaces() {},
    async reloadObservations() {},
    getPlaceVerification() { return 'unverified' },
    async handleUnauthorized() { return false },
    notify() {}
  })

  const first = operations.reviewObservation(observation('first'), 'approve')
  await operations.reviewObservation(observation('second'), 'reject')
  assert.deepEqual(calls, [{ id: 'first', action: 'approve', note: '现场位置确认无误' }])
  assert.equal(reviewState.actionId.value, 'first')
  request.resolve(undefined)
  await first
  assert.equal(reviewState.actionId.value, null)
})

test('approved first evidence reloads both catalogs and clears its note', async () => {
  const reviewState = state({ candidate: '首条候选现场核对完成' })
  const notifications: string[] = []
  let placeReloads = 0
  let observationReloads = 0
  const operations = createFieldObservationReviewOperations({
    state: reviewState,
    async requestReview() {},
    async reloadPlaces() { placeReloads += 1 },
    async reloadObservations() { observationReloads += 1 },
    getPlaceVerification() { return 'unverified' },
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })

  await operations.reviewObservation(observation('candidate'), 'approve')
  assert.equal(placeReloads, 1)
  assert.equal(observationReloads, 1)
  assert.equal(reviewState.notes.candidate, undefined)
  assert.deepEqual(notifications, ['定位记录已批准，还需另一条独立记录确认'])
})

test('verified approval and rejection use action-specific success messages', async () => {
  const reviewState = state({ dual: '第二条独立证据确认', rejected: '现场入口与记录不符' })
  let verification: ApiPlace['coordinateVerification'] = 'verified'
  const notifications: string[] = []
  const operations = createFieldObservationReviewOperations({
    state: reviewState,
    async requestReview() {},
    async reloadPlaces() {},
    async reloadObservations() {},
    getPlaceVerification() { return verification },
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification.title) }
  })

  await operations.reviewObservation(observation('dual'), 'approve')
  verification = 'unverified'
  await operations.reviewObservation(observation('rejected'), 'reject')
  assert.deepEqual(notifications, [
    '第二条独立记录已确认，地点坐标已完成双重确认',
    '定位记录已驳回'
  ])
})

test('ordinary server errors preserve notes and expose server messages', async () => {
  const reviewState = state({ failed: '审核依据仍需保留' })
  const notifications: Array<{ title: string, description?: string }> = []
  const operations = createFieldObservationReviewOperations({
    state: reviewState,
    async requestReview() { throw { data: { statusMessage: '观测状态已变化' } } },
    async reloadPlaces() {},
    async reloadObservations() {},
    getPlaceVerification() { return null },
    async handleUnauthorized() { return false },
    notify(notification) { notifications.push(notification) }
  })

  await operations.reviewObservation(observation('failed'), 'approve')
  assert.equal(reviewState.notes.failed, '审核依据仍需保留')
  assert.deepEqual(notifications, [{
    title: '审核失败',
    description: '观测状态已变化',
    color: 'error'
  }])
  assert.equal(reviewState.actionId.value, null)
})

test('authorization failures delegate navigation without generic error notifications', async () => {
  const reviewState = state({ protected: '审核依据完整记录' })
  let unauthorizedCount = 0
  const notifications: string[] = []
  const operations = createFieldObservationReviewOperations({
    state: reviewState,
    async requestReview() { throw { statusCode: 401 } },
    async reloadPlaces() {},
    async reloadObservations() {},
    getPlaceVerification() { return null },
    async handleUnauthorized() {
      unauthorizedCount += 1
      return true
    },
    notify(notification) { notifications.push(notification.title) }
  })

  await operations.reviewObservation(observation('protected'), 'reject')
  assert.equal(unauthorizedCount, 1)
  assert.deepEqual(notifications, [])
  assert.equal(reviewState.notes.protected, '审核依据完整记录')
  assert.equal(reviewState.actionId.value, null)
})

test('field observation page delegates review request state and disables overlap', () => {
  const page = readFileSync(resolve('app/pages/admin/field-observations.vue'), 'utf8')
  const details = readFileSync(
    resolve('app/components/admin/AdminCoordinateObservationReviewDetails.vue'),
    'utf8'
  )
  const composable = readFileSync(resolve('app/composables/useFieldObservationReview.ts'), 'utf8')
  const controller = readFileSync(
    resolve('app/utils/field-observation-review-operations.ts'),
    'utf8'
  )

  assert.match(page, /useFieldObservationReview\(\{/)
  assert.doesNotMatch(page, /async function reviewObservation/)
  assert.match(details, /:disabled="actionId !== null \|\| observation\.accuracyMeters/)
  assert.match(composable, /getPlaceVerification: placeId/)
  assert.doesNotMatch(controller, /\$fetch|useRoute|useRouter|ref\(|reactive\(|computed\(/)
})
