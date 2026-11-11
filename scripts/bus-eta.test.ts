import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUS_ETA_SAMPLE_CAVEAT,
  buildBusSegmentProfile,
  estimateBusEta
} from '../server/modules/transport/eta'

test('真实采样：7 个站、累计秒数单调递增、分段求和等于总时长', () => {
  const profile = buildBusSegmentProfile()
  assert.equal(profile.available, true, '真实种子应能生成区间')
  if (!profile.available) return

  assert.equal(profile.stops.length, 7)
  assert.equal(profile.segments.length, 6, '相邻站之间应有 6 段')
  assert.equal(profile.measuredAt, '2026-11-04')
  assert.equal(profile.stops[0]?.stop, '旧区创业园')
  assert.equal(profile.stops.at(-1)?.stop, '新区和昌楼2号门')

  for (let index = 1; index < profile.stops.length; index += 1) {
    const previous = profile.stops[index - 1]!
    const current = profile.stops[index]!
    assert.ok(
      current.cumulativeSeconds > previous.cumulativeSeconds,
      `第 ${index + 1} 站累计秒数必须大于前一站：${previous.cumulativeSeconds} -> ${current.cumulativeSeconds}`
    )
    assert.equal(current.cumulativeSeconds, previous.cumulativeSeconds + profile.segments[index - 1]!.seconds)
  }

  const segmentTotal = profile.segments.reduce((sum, segment) => sum + segment.seconds, 0)
  assert.equal(segmentTotal, profile.totalSeconds)
  assert.equal(profile.stops.at(-1)?.cumulativeSeconds, profile.totalSeconds)

  const roundedMinutes = profile.stops.map(stop => Math.round(stop.cumulativeSeconds / 60))
  assert.deepEqual(roundedMinutes, [0, 1, 3, 4, 5, 7, 8])
})

test('estimateBusEta：每站 [min,max] 有效、max>=min、起点站到点', () => {
  const estimate = estimateBusEta({ minutesSinceDeparture: 0 })
  assert.equal(estimate.available, true)
  if (!estimate.available) return

  assert.equal(estimate.stops.length, 7)
  assert.equal(estimate.stops[0]?.status, 'due')

  for (const stop of estimate.stops) {
    assert.ok(Number.isFinite(stop.etaMin[0]), `${stop.stop} 下限必须是有限数`)
    assert.ok(Number.isFinite(stop.etaMin[1]), `${stop.stop} 上限必须是有限数`)
    assert.ok(stop.etaMin[0] >= 0, `${stop.stop} 下限不能为负`)
    assert.ok(stop.etaMin[1] >= stop.etaMin[0], `${stop.stop} 上限必须不小于下限`)
    assert.ok(['passed', 'upcoming', 'due'].includes(stop.status))
  }

  const upcoming = estimate.stops.find(stop => stop.status === 'upcoming')
  assert.ok(upcoming, '发车 0 分钟时应还有未到站的站')
  if (upcoming) assert.ok(upcoming.etaMin[1] > upcoming.etaMin[0], '未到站的区间应有宽度可展示')
})

test('分钟数超过全程时所有站都是 passed', () => {
  const profile = buildBusSegmentProfile()
  assert.equal(profile.available, true)
  if (!profile.available) return

  const beyond = Math.ceil(profile.totalSeconds / 60) + 1
  const estimate = estimateBusEta({ minutesSinceDeparture: beyond })
  assert.equal(estimate.available, true)
  if (!estimate.available) return

  assert.equal(estimate.stops.length, 7)
  for (const stop of estimate.stops) {
    assert.equal(stop.status, 'passed', `${stop.stop} 在 ${beyond} 分钟时应已过站`)
    assert.deepEqual(stop.etaMin, [0, 0])
  }
})

test('脏数据不抛异常：空点集 / 全零坐标 / 站点对不上几何', () => {
  const empty = buildBusSegmentProfile({ points: [] })
  assert.equal(empty.available, false)
  assert.ok(empty.reason.length > 0)

  const zeroed = buildBusSegmentProfile({
    points: Array.from({ length: 6 }, () => ({ lng: 0, lat: 0 }))
  })
  assert.equal(zeroed.available, false)

  const mismatched = buildBusSegmentProfile({
    stops: [
      { name: '旧区创业园', lng: 118.6114, lat: 25.1160 },
      { name: '不存在的站', lng: 118.7, lat: 25.2 }
    ]
  })
  assert.equal(mismatched.available, false)

  const unavailable = estimateBusEta({ minutesSinceDeparture: 5, profile: empty })
  assert.equal(unavailable.available, false)
  if (!unavailable.available) assert.ok(unavailable.reason.length > 0)

  assert.equal(BUS_ETA_SAMPLE_CAVEAT, '数据口径：2026-11-04 实测采样，非实时')
})
