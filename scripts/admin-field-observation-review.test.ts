import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { ApiCoordinateObservation, ApiPlace } from '../shared/types/server'
import {
  buildCoordinateReviewHint,
  coordinateDistanceMeters
} from '../app/utils/field-observation-review'
import {
  getCoordinateObservationStatusColor,
  getCoordinateObservationStatusLabel,
  getCoordinatePointRoleLabel,
  getCoordinateCaptureMethodLabel
} from '../app/utils/field-observation-presentation'

function observation(
  overrides: Partial<ApiCoordinateObservation> = {}
): ApiCoordinateObservation {
  return {
    id: 'observation-id',
    placeId: 'place-id',
    longitude: 118.6,
    latitude: 24.9,
    pointRole: 'main-entrance',
    reviewStatus: 'pending',
    ...overrides
  } as ApiCoordinateObservation
}

function place(overrides: Partial<ApiPlace> = {}): ApiPlace {
  return {
    id: 'place-id',
    name: '测试地点',
    longitude: 118.6,
    latitude: 24.9,
    coordinateSystem: 'WGS84',
    coordinatePointRole: 'main-entrance',
    coordinateVerification: 'unverified',
    ...overrides
  } as ApiPlace
}

test('coordinate distance uses meters and is symmetric', () => {
  const origin = { longitude: 118.6, latitude: 24.9 }
  const north = { longitude: 118.6, latitude: 24.901 }
  assert.equal(coordinateDistanceMeters(origin, origin), 0)
  const forward = coordinateDistanceMeters(origin, north)
  const reverse = coordinateDistanceMeters(north, origin)
  assert.ok(forward > 110 && forward < 112)
  assert.ok(Math.abs(forward - reverse) < 0.000_001)
})

test('verified places explain pending replacement and existing dual evidence', () => {
  const verifiedPlace = place({ coordinateVerification: 'verified' })
  const pending = buildCoordinateReviewHint(observation(), verifiedPlace)
  assert.equal(pending?.stage, 'dual-verified')
  assert.match(pending?.description ?? '', /只会保留与它最接近的一条有效旧记录/)

  const approved = buildCoordinateReviewHint(
    observation({ reviewStatus: 'approved' }),
    verifiedPlace
  )
  assert.equal(approved?.title, '地点坐标已完成两次独立确认')
  assert.match(approved?.description ?? '', /两条相互独立且位置相符的批准记录/)
})

test('approved, rejected and superseded history cannot be presented as a new dual candidate', () => {
  const approved = buildCoordinateReviewHint(
    observation({ reviewStatus: 'approved' }),
    place()
  )
  assert.equal(approved?.stage, 'first-candidate')
  assert.equal(approved?.title, '已完成第一次确认')

  const rejected = buildCoordinateReviewHint(
    observation({ reviewStatus: 'rejected' }),
    place()
  )
  assert.equal(rejected?.stage, 'replacement')
  assert.match(rejected?.description ?? '', /已被驳回/)

  const superseded = buildCoordinateReviewHint(
    observation({ reviewStatus: 'superseded' }),
    place()
  )
  assert.match(superseded?.description ?? '', /已由更新的定位记录替代/)
})

test('missing or incompatible candidate coordinates remain a first observation', () => {
  for (const candidate of [
    place({ longitude: null }),
    place({ latitude: null }),
    place({ coordinateSystem: 'GCJ-02' }),
    place({ coordinatePointRole: null })
  ]) {
    const hint = buildCoordinateReviewHint(observation(), candidate)
    assert.equal(hint?.stage, 'first-candidate')
    assert.equal(hint?.title, '批准后将完成第一次确认')
  }
})

test('a point-role mismatch is a replacement even at the same coordinates', () => {
  const hint = buildCoordinateReviewHint(
    observation({ pointRole: 'site-point' }),
    place({ coordinatePointRole: 'main-entrance' })
  )
  assert.equal(hint?.stage, 'replacement')
  assert.equal(hint?.title, '坐标用途与第一次记录不同')
})

test('a distant observation reports separation and replacement threshold', () => {
  const hint = buildCoordinateReviewHint(
    observation({ latitude: 24.901 }),
    place()
  )
  assert.equal(hint?.stage, 'replacement')
  assert.match(hint?.title ?? '', /相距 111\./)
  assert.match(hint?.description ?? '', /距离超过允许的 .* 米/)
})

test('a close matching observation is only a possible dual pending server independence checks', () => {
  const hint = buildCoordinateReviewHint(
    observation({ latitude: 24.900_01 }),
    place()
  )
  assert.equal(hint?.stage, 'possible-dual')
  assert.match(hint?.title ?? '', /相距 1\.1 米/)
  assert.match(hint?.description ?? '', /系统还会确认两次采集是否独立/)
  assert.match(hint?.description ?? '', /浏览器定位或授权地图导入/)
})

test('review status presentation and page delegation stay centralized', () => {
  assert.equal(getCoordinateObservationStatusLabel('pending'), '待审核')
  assert.equal(getCoordinateObservationStatusLabel('approved'), '已批准')
  assert.equal(getCoordinateObservationStatusLabel('rejected'), '已驳回')
  assert.equal(getCoordinateObservationStatusLabel('superseded'), '已被替代')
  assert.equal(getCoordinateObservationStatusColor('pending'), 'warning')
  assert.equal(getCoordinateObservationStatusColor('approved'), 'success')
  assert.equal(getCoordinateObservationStatusColor('rejected'), 'error')
  assert.equal(getCoordinateObservationStatusColor('superseded'), 'neutral')
  assert.equal(getCoordinatePointRoleLabel('main-entrance'), '主入口')
  assert.equal(getCoordinatePointRoleLabel('site-point'), '场地点')
  assert.equal(getCoordinateCaptureMethodLabel('browser-geolocation'), '浏览器定位')
  assert.equal(getCoordinateCaptureMethodLabel('amap-workmap'), '授权地图导入')
  assert.equal(buildCoordinateReviewHint(null, place()), null)
  assert.equal(buildCoordinateReviewHint(observation(), null), null)

  const page = readFileSync(resolve('app/pages/admin/field-observations.vue'), 'utf8')
  const details = readFileSync(
    resolve('app/components/admin/AdminCoordinateObservationReviewDetails.vue'),
    'utf8'
  )
  const review = readFileSync(resolve('app/utils/field-observation-review.ts'), 'utf8')
  assert.match(details, /buildCoordinateReviewHint\(/)
  assert.doesNotMatch(page, /buildCoordinateReviewHint\(/)
  assert.doesNotMatch(page, /function coordinateDistanceMeters|type CoordinateReviewStage/)
  assert.doesNotMatch(review, /\$fetch|useRoute|useRouter|ref\(|reactive\(|computed\(/)
})
