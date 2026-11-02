import assert from 'node:assert/strict'
import test from 'node:test'
import { CAMPUS_CRUISE_MPS, CAMPUS_SPEED_BUMPS, bumpExtraSeconds } from '../shared/utils/campus-speed-bumps'
import {
  travelSecondsAlongPolyline,
  computeBusProgress,
  computeStopToStop,
  samplePolylinePoint
} from '../shared/utils/bus-route-progress'

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

test('computeBusProgress etaSeconds=距离/巡航速度、distanceAlong/angleDeg 齐备', () => {
  const result = computeBusProgress({ lng: 0.0045, lat: 0 }, stops, stops)
  assert.ok(result)
  // ETA 走减速带限速积分：不会比全速更快，也不会慢过爬行速度
  assert.ok(result.etaSeconds >= 500 / CAMPUS_CRUISE_MPS - 1, `eta=${result.etaSeconds}`)
  assert.ok(result.etaSeconds <= 500 / 1.6, `eta=${result.etaSeconds}`)
  assert.ok(Math.abs(result.distanceAlong - 500) < 10, `along=${result.distanceAlong}`)
  // 正东走向：方位角约 90°
  assert.ok(Math.abs(result.angleDeg - 90) < 1, `angle=${result.angleDeg}`)
  assert.equal(result.stopDistancesAlong.length, 3)
})

test('samplePolylinePoint 中点插值与端点钳制', () => {
  const mid = samplePolylinePoint(stops, 500)
  assert.ok(Math.abs(mid.point.lng - 0.0045) < 0.0002, `lng=${mid.point.lng}`)
  assert.ok(Math.abs(mid.angleDeg - 90) < 1)
  const past = samplePolylinePoint(stops, 9_999)
  assert.ok(Math.abs(past.point.lng - 0.018) < 1e-9, '越界钳制到终点')
})

test('computeStopToStop A→B 距离/途经站/ETA，顺序无关', () => {
  const ab = computeStopToStop(stops, stops, 0, 2)
  assert.ok(ab)
  assert.ok(Math.abs(ab.distanceMeters - 2_000) < 15, `d=${ab.distanceMeters}`)
  assert.equal(ab.stopsBetween, 1)
  assert.ok(ab.etaSeconds >= ab.distanceMeters / CAMPUS_CRUISE_MPS, `eta=${ab.etaSeconds}`)
  const ba = computeStopToStop(stops, stops, 2, 0)
  assert.ok(ba)
  assert.ok(Math.abs(ba.distanceMeters - ab.distanceMeters) < 1)
  assert.equal(computeStopToStop(stops, stops, 1, 1)?.distanceMeters, 0)
  assert.equal(computeStopToStop(stops, stops, 0, 5), null)
})

test('减速带模型：远离校园的直线只按巡航速度算', () => {
  const far = [{ lng: 0, lat: 0 }, { lng: 0.008, lat: 0 }]
  const seconds = travelSecondsAlongPolyline(far, 0, 890)
  assert.ok(Math.abs(seconds - 890 / CAMPUS_CRUISE_MPS) < 2, `seconds=${seconds.toFixed(1)}`)
})

test('减速带模型：碾过一处减速带会多花约 4 秒（实测减速带段均速 6.9 m/s，接近巡航）', () => {
  const [a, b] = [CAMPUS_SPEED_BUMPS[5]!, CAMPUS_SPEED_BUMPS[6]!]
  const segment = [{ lng: a.lng, lat: a.lat }, { lng: b.lng, lat: b.lat }]
  const meters = 30
  const seconds = travelSecondsAlongPolyline(segment, 0, meters)
  const extra = bumpExtraSeconds()
  assert.ok(extra > 2.5 && extra < 7, `extra=${extra.toFixed(2)}`)
  assert.ok(seconds > meters / CAMPUS_CRUISE_MPS + extra * 0.5, `seconds=${seconds.toFixed(1)}`)
  assert.ok(seconds < meters / CAMPUS_CRUISE_MPS + extra * 2.5, `seconds=${seconds.toFixed(1)}`)
})
