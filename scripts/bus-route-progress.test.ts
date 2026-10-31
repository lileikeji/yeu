import assert from 'node:assert/strict'
import test from 'node:test'
import { computeBusProgress } from '../shared/utils/bus-route-progress'

// 经纬度步长：赤道附近 0.009° 经度 ≈ 1000 米（haversine 实算 1000.7m）
const stops = [
  { lng: 0, lat: 0 },
  { lng: 0.009, lat: 0 },
  { lng: 0.018, lat: 0 }
]

test('computeBusProgress 车在两站正中：进度 0.5、距下一站约 500 米', () => {
  const result = computeBusProgress({ lng: 0.0045, lat: 0 }, stops, stops)
  assert.ok(result)
  assert.equal(result.segmentIndex, 0)
  assert.equal(result.nextStopIndex, 1)
  assert.equal(result.atStopIndex, null)
  assert.ok(Math.abs(result.progress - 0.5) < 0.01, `progress=${result.progress}`)
  assert.ok(Math.abs(result.distanceToNextStopMeters - 500) < 10, `next=${result.distanceToNextStopMeters}`)
  assert.ok(Math.abs(result.distanceToDestinationMeters - 1500) < 15, `dest=${result.distanceToDestinationMeters}`)
  assert.equal(result.stopsRemaining, 2)
})

test('computeBusProgress 车贴站：判已到站、距下一站为段长', () => {
  const result = computeBusProgress({ lng: 0, lat: 0 }, stops, stops)
  assert.ok(result)
  assert.equal(result.atStopIndex, 0)
  assert.equal(result.nextStopIndex, 1)
  assert.equal(result.distanceToNextStopMeters, 0)
  assert.equal(result.stopsRemaining, 2)
})

test('computeBusProgress 车过终点：钳制在终点、不再报下一站', () => {
  const result = computeBusProgress({ lng: 0.03, lat: 0 }, stops, stops)
  assert.ok(result)
  assert.equal(result.atStopIndex, 2)
  assert.equal(result.nextStopIndex, 2)
  assert.equal(result.distanceToDestinationMeters, 0)
  assert.equal(result.stopsRemaining, 0)
})

test('computeBusProgress isAtSite 强制到站（GPS 偏离 300 米也认）', () => {
  const result = computeBusProgress({ lng: 0.003, lat: 0 }, stops, stops, { isAtSite: true })
  assert.ok(result)
  assert.equal(result.atStopIndex, 0)
  assert.equal(result.distanceToNextStopMeters, 0)
})

test('computeBusProgress 折线缺失回退站点直连', () => {
  const result = computeBusProgress({ lng: 0.0045, lat: 0 }, stops, [])
  assert.ok(result)
  assert.ok(Math.abs(result.progress - 0.5) < 0.01, `progress=${result.progress}`)
})

test('computeBusProgress 站点不足两个返回 null', () => {
  assert.equal(computeBusProgress({ lng: 0, lat: 0 }, [{ lng: 0, lat: 0 }], []), null)
})
