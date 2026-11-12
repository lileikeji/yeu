import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isTapGesture,
  TAP_MOVE_TOLERANCE_PX,
  tapPointOf
} from '../map/core/tap-gesture'

const base = { startTouchCount: 1, endTouchCount: 0 }

test('tap 手势：位移 0px 视为 tap', () => {
  assert.equal(isTapGesture({
    ...base,
    start: { x: 100, y: 200 },
    end: { x: 100, y: 200 }
  }), true)
})

test('tap 手势：位移 5px（手抖）仍视为 tap', () => {
  assert.equal(isTapGesture({
    ...base,
    start: { x: 100, y: 200 },
    end: { x: 103, y: 204 } // hypot(3,4) = 5
  }), true)
})

test('tap 手势：位移 50px 视为滑动，不触发', () => {
  assert.equal(isTapGesture({
    ...base,
    start: { x: 100, y: 200 },
    end: { x: 130, y: 240 } // hypot(30,40) = 50
  }), false)
})

test('tap 手势：阈值边界——恰好 10px 是 tap，超过 10px 不是', () => {
  assert.equal(isTapGesture({
    ...base,
    start: { x: 100, y: 200 },
    end: { x: 110, y: 200 }
  }), true, '恰好等于阈值应算 tap（<= 比较）')

  assert.equal(isTapGesture({
    ...base,
    start: { x: 100, y: 200 },
    end: { x: 110.5, y: 200 }
  }), false, '超过阈值 0.5px 就应算滑动')
})

test('tap 手势：双指按下（pinch）不触发', () => {
  assert.equal(isTapGesture({
    startTouchCount: 2,
    endTouchCount: 0,
    start: { x: 100, y: 200 },
    end: { x: 100, y: 200 }
  }), false)
})

test('tap 手势：手势中途变成双指，也不触发', () => {
  assert.equal(isTapGesture({
    startTouchCount: 1,
    endTouchCount: 2,
    start: { x: 100, y: 200 },
    end: { x: 100, y: 200 }
  }), false)
})

test('tap 手势：touchend 时仍有手指留在屏上，不触发', () => {
  assert.equal(isTapGesture({
    startTouchCount: 1,
    endTouchCount: 1,
    start: { x: 100, y: 200 },
    end: { x: 100, y: 200 }
  }), false)
})

test('tap 手势：touchcancel 后 tapStart 已被清空（start=null）时保守当 tap，不吞掉点击', () => {
  // 这是「异常序列」分支：调用方在 touchcancel 里把 tapStart 置 null，
  // 随后若仍有 touchend 却没有起点，保持改动前的旧行为（触发点击），
  // 而不是静默丢弃——宁可偶尔多打开一次详情，也不要让标点变得点不开。
  assert.equal(isTapGesture({
    startTouchCount: 1,
    endTouchCount: 0,
    start: null,
    end: { x: 100, y: 200 }
  }), true)
})

test('tap 手势：changedTouches 为空（end=null）时保守当 tap', () => {
  assert.equal(isTapGesture({
    startTouchCount: 1,
    endTouchCount: 0,
    start: { x: 100, y: 200 },
    end: null
  }), true)
})

test('tap 手势：多指优先于位移——双指且位移为 0 仍不是 tap', () => {
  // 回归护栏：不能因为「位移没超阈值」就把 pinch 放过去。
  assert.equal(isTapGesture({
    startTouchCount: 2,
    endTouchCount: 0,
    start: { x: 50, y: 50 },
    end: { x: 50, y: 50 }
  }), false)
})

test('阈值常量为 10px', () => {
  assert.equal(TAP_MOVE_TOLERANCE_PX, 10)
})

test('tapPointOf 读取 clientX/clientY', () => {
  assert.deepEqual(tapPointOf({ clientX: 12.5, clientY: 33 }), { x: 12.5, y: 33 })
})
