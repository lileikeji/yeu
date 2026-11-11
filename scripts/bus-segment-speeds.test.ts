/**
 * 校车分段车速表测试：表结构自检 + 按段速积分的秒数（含空档兜底）。
 * 表由实测采样生成，这里只校验「结构与量级合理」，不锁死具体数字。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUS_SEGMENT_SPEEDS, buildSegmentProfile } from '../shared/utils/bus-segment-speeds'
import { CAMPUS_AVERAGE_MPS, CAMPUS_CRUISE_MPS } from '../shared/utils/campus-speed-bumps'
import { cumulativeDistances, travelSecondsOnLine } from '../shared/utils/bus-route-progress'

const line = [
  { lng: 118.6, lat: 25.11 },
  { lng: 118.601, lat: 25.11 },
  { lng: 118.602, lat: 25.11 }
]
const cumulative = cumulativeDistances(line)
const total = cumulative[cumulative.length - 1]!

test('段速表每行自检：站序、米数、用时、样本数、隐含速度', () => {
  for (const row of BUS_SEGMENT_SPEEDS) {
    assert.ok(row.routeId.length > 0, 'routeId 不能为空')
    assert.ok(row.to > row.from, `${row.routeId} ${row.from}->${row.to} 站序必须递增`)
    assert.ok(row.meters >= 30, `${row.routeId} ${row.from}->${row.to} 段太短`)
    assert.ok(row.seconds > 0, `${row.routeId} ${row.from}->${row.to} 用时必须为正`)
    assert.ok(row.samples >= 1, `${row.routeId} ${row.from}->${row.to} 至少一个样本`)
    const speed = row.meters / row.seconds
    assert.ok(speed > 1 && speed < 7, `${row.routeId} ${row.from}->${row.to} 隐含速度 ${speed.toFixed(2)} m/s 超出校园合理区间`)
  }
})

test('段速表同一线路同一段只出现一次', () => {
  const keys = BUS_SEGMENT_SPEEDS.map(row => `${row.routeId}|${row.from}|${row.to}`)
  assert.equal(new Set(keys).size, keys.length)
})

test('没有段速表时 buildSegmentProfile 返回 undefined', () => {
  const stops = [{ lng: 118.6, lat: 25.11 }, { lng: 118.602, lat: 25.11 }]
  assert.equal(buildSegmentProfile('not-a-route', stops, line), undefined)
})

test('段速切片覆盖整段时按实测均速积分，不再叠加减速带加时', () => {
  const profile = [{ fromAlong: 0, toAlong: total, speedMps: 2.5 }]
  const seconds = travelSecondsOnLine(line, cumulative, 0, total, profile)
  assert.ok(Math.abs(seconds - total / 2.5) < 1e-6, `期望 ${total / 2.5}，实际 ${seconds}`)
})

test('段速切片没覆盖的空档用 3.4 m/s 兜底', () => {
  const half = total / 2
  const profile = [{ fromAlong: 0, toAlong: half, speedMps: 5 }]
  const seconds = travelSecondsOnLine(line, cumulative, 0, total, profile)
  const expected = half / 5 + (total - half) / CAMPUS_AVERAGE_MPS
  assert.ok(Math.abs(seconds - expected) < 1e-6, `期望 ${expected}，实际 ${seconds}`)
})

test('空切片数组退回老算法（巡航 6.4 m/s 起算）', () => {
  const seconds = travelSecondsOnLine(line, cumulative, 0, total, [])
  assert.ok(seconds >= total / CAMPUS_CRUISE_MPS - 1e-6, '退回老算法后不应比巡航更快')
  assert.ok(seconds < total / CAMPUS_CRUISE_MPS + 10, '这条合成折线不该吃到大量减速带加时')
})

test('站点或折线不足时 buildSegmentProfile 返回 undefined', () => {
  const twoStops = [{ lng: 118.6, lat: 25.11 }, { lng: 118.602, lat: 25.11 }]
  for (const row of BUS_SEGMENT_SPEEDS.slice(0, 3)) {
    assert.equal(buildSegmentProfile(row.routeId, [{ lng: 118.6, lat: 25.11 }], line), undefined)
    assert.equal(buildSegmentProfile(row.routeId, twoStops, [{ lng: 118.6, lat: 25.11 }]), undefined)
  }
})
