import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceBusTrack,
  createBusTrack,
  observeBusTrack,
  resetBusTrack,
  TRACK_ARRIVE_MARGIN_M,
  TRACK_MAX_EXTRAPOLATE_M
} from '../shared/utils/bus-track'

const T0 = 1_000_000

/** 逐帧推进显示位，返回每个 150ms 采样点的显示里程。 */
function render(track: ReturnType<typeof createBusTrack>, fromMs: number, toMs: number, stepMs = 150, atSite = false): number[] {
  const samples: number[] = []
  for (let now = fromMs; now <= toMs; now += stepMs) samples.push(advanceBusTrack(track, now, atSite))
  return samples
}

test('createBusTrack 里程落在首帧投影位置，接近终点即视为已到站', () => {
  const track = createBusTrack('r1', 2000, 300, T0)
  assert.equal(track.along, 300)
  assert.equal(track.display, 300)
  assert.equal(track.arrived, false)

  const atEnd = createBusTrack('r1', 2000, 2000 - TRACK_ARRIVE_MARGIN_M + 1, T0)
  assert.equal(atEnd.arrived, true)
})

test('前进帧被接受：本地里程与显示位都按上报走', () => {
  const track = createBusTrack('r1', 2000, 0, T0)
  const verdict = observeBusTrack(track, { along: 36, now: T0 + 7_000 })
  assert.equal(verdict, 'accepted')
  assert.equal(track.along, 36)
  assert.ok(track.speedMps > 3 && track.speedMps < 7, `speed=${track.speedMps}`)

  render(track, T0 + 7_000, T0 + 9_000)
  assert.ok(track.display >= 36 - 1e-9, `显示位不应落后于已确认里程：${track.display}`)
  assert.ok(track.display <= 36 + TRACK_MAX_EXTRAPOLATE_M + 1e-9, `显示位不应越过推算上限：${track.display}`)
})

test('4 米内的抖动不推动里程（GPS 静态漂移）', () => {
  const track = createBusTrack('r1', 2000, 100, T0)
  const verdict = observeBusTrack(track, { along: 97.5, now: T0 + 7_000 })
  assert.equal(verdict, 'held')
  assert.equal(track.along, 100)
})

test('单次 30 米后退按住，连续 3 帧且累计 ≥150 米才重锚', () => {
  const track = createBusTrack('r1', 2000, 100, T0)
  // 先真的跑起来：本趟按 5.7 m/s 前进 200 m
  for (const [index, along] of [140, 180, 220, 260, 300].entries()) {
    assert.equal(observeBusTrack(track, { along, now: T0 + (index + 1) * 7_000 }), 'accepted')
  }
  assert.equal(track.travelled, 200)
  assert.equal(observeBusTrack(track, { along: 270, now: T0 + 42_000 }), 'held')
  assert.equal(observeBusTrack(track, { along: 230, now: T0 + 49_000 }), 'held')
  assert.equal(track.along, 300, '两帧后退还不够认账')
  const verdict = observeBusTrack(track, { along: 140, now: T0 + 56_000 })
  assert.equal(verdict, 'reanchored')
  assert.equal(track.along, 140)
  assert.equal(track.display, 140, '重锚时显示位直接落到新位置，不再回放动画')
  assert.equal(track.reanchors, 1)
})

test('静止车的大幅漂移不当掉头：本趟没跑出 150 米就一直按住', () => {
  // 现场：电瓶车1 全天停在车场，GPS 在线上随机跳 300–1300 m。
  const track = createBusTrack('r1', 2319, 2218, T0)
  for (const [index, along] of [1310, 1310, 892, 892, 892].entries()) {
    assert.equal(observeBusTrack(track, { along, now: T0 + (index + 1) * 7_000 }), 'held')
  }
  assert.equal(track.along, 2218, '没有跑起来的车，后退只是漂移')
  assert.equal(track.display, 2218)
  assert.equal(track.reanchors, 0)
})

test('已到终点后回到起点：立即重锚，视为下一趟', () => {
  const track = createBusTrack('r1', 2000, 1985, T0)
  assert.equal(track.arrived, true)
  const verdict = observeBusTrack(track, { along: 20, now: T0 + 20_000 })
  assert.equal(verdict, 'reanchored')
  assert.equal(track.along, 20)
  assert.equal(track.arrived, false)
})

test('偏离线路 >150 米的上报不采信（车不在本线路上）', () => {
  const track = createBusTrack('r1', 2000, 200, T0)
  const verdict = observeBusTrack(track, { along: 900, now: T0 + 7_000, offsetMeters: 400 })
  assert.equal(verdict, 'ignored')
  assert.equal(track.along, 200)
  assert.equal(track.display, 200)
})

test('不合理跳点（7 秒 300 米）第一次按住，连续两帧才认账', () => {
  const track = createBusTrack('r1', 2000, 100, T0)
  assert.equal(observeBusTrack(track, { along: 400, now: T0 + 7_000 }), 'held')
  assert.equal(track.along, 100)
  assert.equal(track.display, 100, '第一帧按住时显示位不动')
  assert.equal(observeBusTrack(track, { along: 430, now: T0 + 14_000 }), 'reanchored')
  assert.equal(track.along, 430)
  assert.equal(track.display, 430, '几百米的前进量直接落到新位置，不做几十秒滑行动画')
  assert.equal(track.reanchors, 1)
})

test('小跳点（7 秒 194 米）确认后仍用滑行，不瞬移（现场实测最大单帧位移）', () => {
  const track = createBusTrack('r1', 2319, 1200, T0)
  assert.equal(observeBusTrack(track, { along: 1394, now: T0 + 6_300 }), 'held')
  assert.equal(observeBusTrack(track, { along: 1394, now: T0 + 12_600 }), 'accepted')
  assert.ok(track.display < 1394, `确认后显示位逐步追上：${track.display}`)
  const samples = render(track, T0 + 12_600, T0 + 18_900)
  assert.ok(samples.at(-1)! >= 1394 - 0.5, '6 秒内追上')
  assert.ok(samples.every(value => value <= 1394 + 30 + 1e-9), '不超过推算上限')
})

test('显示里程永不后退：真实倒车样本 55→49→12→0 全程单调', () => {
  // 2026-11-11 生产采样：电瓶车10 在发车点倒车入库，沿线里程从 55 m 退回 0 m。
  const track = createBusTrack('r1', 2319, 55, T0)
  const alongs = [49, 12, 0, 0, 0, 0, 6, 40, 90]
  let previous = track.display
  let now = T0
  for (const [index, along] of alongs.entries()) {
    now += 7_000
    observeBusTrack(track, { along, now })
    for (const value of render(track, now - 7_000 + 150, now)) {
      assert.ok(value >= previous - 1e-9, `第 ${index} 帧显示回退：${previous} → ${value}`)
      previous = value
    }
  }
  // 里程回到 55 m 之前一直按住，越过之后才继续前进
  assert.equal(track.along, 90)
  assert.ok(Math.abs(track.display - 90) < 0.5, `display=${track.display}`)
})

test('显示位在 1.6 秒量级追上目标，且只向前、不越过推算上限', () => {
  const track = createBusTrack('r1', 2000, 0, T0)
  observeBusTrack(track, { along: 40, now: T0 + 7_000 })
  const samples = render(track, T0 + 7_000, T0 + 10_000)
  const ceiling = 40 + TRACK_MAX_EXTRAPOLATE_M + 1e-9
  assert.ok(samples.every(value => value <= ceiling), '推算不超过 30 米上限')
  assert.ok(samples.some(value => value >= 40 - 1e-9), '1.6 秒内追上已确认里程')
  for (let index = 1; index < samples.length; index++) {
    assert.ok(samples[index]! >= samples[index - 1]! - 1e-9, '追赶过程单调')
  }
})

test('静止车辆不惯性前推（旧实现的 60 m creep 已移除）', () => {
  const track = createBusTrack('r1', 2319, 120, T0)
  observeBusTrack(track, { along: 120, now: T0 + 7_000 })
  const samples = render(track, T0 + 7_000, T0 + 90_000)
  assert.ok(samples.every(value => Math.abs(value - 120) < 1e-9), '停着就不该动')
})

test('两次上报之间按车速向前推算，且封顶 30 米', () => {
  const track = createBusTrack('r1', 2319, 0, T0)
  observeBusTrack(track, { along: 40, now: T0 + 7_000 })
  const before = track.display
  render(track, T0 + 7_000, T0 + 8_000)
  const afterOneSecond = track.display
  assert.ok(afterOneSecond >= before, '推算只会向前')
  assert.ok(afterOneSecond <= 40 + TRACK_MAX_EXTRAPOLATE_M + 1e-9, `推算超限：${afterOneSecond}`)
})

test('到站（isAtSite）时不做前进推算：先追平已确认里程，然后停住', () => {
  const track = createBusTrack('r1', 2319, 500, T0)
  observeBusTrack(track, { along: 530, now: T0 + 7_000 })
  render(track, T0 + 7_000, T0 + 9_000, 150, true)
  assert.ok(Math.abs(track.display - 530) < 0.5, `显示位应停在到站里程：${track.display}`)
  const settled = track.display
  render(track, T0 + 9_000, T0 + 25_000, 150, true)
  assert.equal(track.display, settled, '到站后显示位停住等客')
})

test('resetBusTrack 换线路：里程按新线路重算并计入重锚', () => {
  const track = createBusTrack('r1', 2000, 1800, T0)
  const next = resetBusTrack(track, 'r2', 2320, 40, T0 + 60_000)
  assert.equal(next.routeId, 'r2')
  assert.equal(next.along, 40)
  assert.equal(next.display, 40)
  assert.equal(next.reanchors, 1)
  assert.equal(track.along, 1800, '旧状态不被改写')
})
