import assert from 'node:assert/strict'
import test from 'node:test'
import { isActivityStartingToday } from '../app/utils/activity-presentation'

test('activity starting today uses the Asia/Shanghai day', () => {
  assert.equal(
    isActivityStartingToday('2026-11-12T00:00:00+08:00', new Date('2026-11-11T16:30:00Z')),
    true
  )
  assert.equal(
    isActivityStartingToday('2026-11-12T23:30:00+08:00', new Date('2026-11-12T15:59:00Z')),
    true
  )
})

test('activity starting tomorrow or yesterday is not highlighted', () => {
  assert.equal(
    isActivityStartingToday('2026-11-12T00:00:00+08:00', new Date('2026-11-11T15:59:59Z')),
    false
  )
  assert.equal(
    isActivityStartingToday('2026-11-12T23:30:00+08:00', new Date('2026-11-12T16:01:00Z')),
    false
  )
})

test('invalid activity start is not highlighted', () => {
  assert.equal(isActivityStartingToday('not-a-date'), false)
})
