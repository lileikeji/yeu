import assert from 'node:assert/strict'
import test from 'node:test'
import { coastSeconds, observeMotion, stepMotion, type BusMotionState } from '../shared/utils/bus-motion'

function fresh(overrides: Partial<BusMotionState> = {}): BusMotionState {
  return {
    display: 0,
    position: 0,
    stamp: 1_000,
    received: 1_000,
    speed: 0,
    dir: 1,
    ...overrides
  }
}

test('coastSeconds 45s 内按实测时间原样返回', () => {
  assert.equal(coastSeconds(0), 0)
  assert.equal(coastSeconds(10), 10)
  assert.equal(coastSeconds(45), 45)
})

test('coastSeconds 45–165s 缓降到 55% 速度，之后恒速慢行', () => {
  // 105s：45 + (1+end)/2*60，end = 1 - 0.45*(60/120) = 0.775 → 45 + 53.25
  assert.ok(Math.abs(coastSeconds(105) - 98.25) < 0.01, `got=${coastSeconds(105)}`)
  // 200s：45 + 0.775*120 + 0.55*35 = 45 + 93 + 19.25
  assert.ok(Math.abs(coastSeconds(200) - 157.25) < 0.01, `got=${coastSeconds(200)}`)
})

test('observeMotion 首个 fix 建状态、不测速', () => {
  const state = observeMotion(null, 100, 5_000, 6_000, 1, 'moving')
  assert.equal(state.position, 100)
  assert.equal(state.display, 100)
  assert.equal(state.speed, 0)
})

test('observeMotion 相邻 fix 测速（方向一致、限速内）', () => {
  let state = observeMotion(null, 0, 1_000, 1_000, 1, 'moving')
  state = observeMotion(state, 30, 6_000, 6_100, 1, 'moving')
  assert.ok(Math.abs(state.speed - 6) < 0.01, `speed=${state.speed}`)
  assert.equal(state.position, 30)
})

test('observeMotion 超速（>12 m/s）拒绝采纳', () => {
  let state = observeMotion(null, 0, 1_000, 1_000, 1, 'moving')
  state = observeMotion(state, 200, 6_000, 6_100, 1, 'moving')
  assert.equal(state.speed, 0)
})

test('observeMotion waiting 状态速度归零', () => {
  let state = observeMotion(null, 0, 1_000, 1_000, 1, 'moving')
  state = observeMotion(state, 30, 6_000, 6_100, 1, 'moving')
  state = observeMotion(state, 30, 11_000, 11_100, 1, 'waiting')
  assert.equal(state.speed, 0)
})

test('stepMotion 向目标缓动、端点钳制', () => {
  const state = fresh({ position: 100, display: 90, speed: 6, received: 10_000, stamp: 10_000 })
  const moved = stepMotion(state, 10_000, 0.5, 500)
  assert.ok(moved)
  assert.ok(state.display > 90 && state.display <= 100, `display=${state.display}`)
  // 长时间推进后不越过 length
  for (let i = 0; i < 100; i++) stepMotion(state, 10_000 + i * 1_000, 1, 120)
  assert.ok(state.display <= 120, `display=${state.display}`)
})

test('stepMotion 已到达目标时不动', () => {
  const state = fresh({ position: 50, display: 50, speed: 0, received: 10_000, stamp: 10_000 })
  assert.equal(stepMotion(state, 10_000, 0.5, 500), false)
})

test('stepMotion 断讯按末速外推（coast 生效）', () => {
  const state = fresh({ position: 0, display: 0, speed: 10, received: 0, stamp: 0 })
  // received=0，now=30000 → age=30s（45s 内全额外推）→ target=300
  stepMotion(state, 30_000, 1, 1_000)
  assert.ok(state.display > 0, '断讯期间显示位仍向前走')
})
