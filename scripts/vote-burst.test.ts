import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BURST_PARTICLE_PRESETS,
  MAX_ACTIVE_VOTE_BURSTS,
  VOTE_BURST_TTL_MS,
  createVoteBurstController
} from '../app/utils/vote-burst'

test('模块预设粒子表保持轻量只读常量且覆盖 4 类视觉元素', () => {
  assert.ok(BURST_PARTICLE_PRESETS.length >= 6 && BURST_PARTICLE_PRESETS.length <= 10)
  const kinds = new Set(BURST_PARTICLE_PRESETS.map(item => item.kind))
  assert.deepEqual([...kinds].sort(), ['heart', 'note', 'sparkle', 'thumb'])
})

test('连续触发时严格限制同时活跃特效上限为 MAX_ACTIVE_VOTE_BURSTS，避免 DOM 与内存堆积', () => {
  const controller = createVoteBurstController()
  try {
    for (let i = 0; i < 12; i += 1) {
      controller.trigger({ x: 100 + i * 10, y: 300, label: '+1' })
    }
    assert.equal(controller.bursts.value.length, MAX_ACTIVE_VOTE_BURSTS)
    assert.equal(controller.activeTimerCount(), MAX_ACTIVE_VOTE_BURSTS)
    // 保留最近触发的 3 条（x 为 190, 200, 210）
    assert.deepEqual(
      controller.bursts.value.map(item => item.x),
      [190, 200, 210]
    )
  } finally {
    controller.dispose()
  }
})

test('特效到期自动销毁并清理定时器，组件卸载时全部归零', async () => {
  const ttlMs = 40
  const controller = createVoteBurstController({ ttlMs })
  controller.trigger({ x: 180, y: 420, label: '👍 +1' })
  assert.equal(controller.bursts.value.length, 1)
  assert.equal(controller.activeTimerCount(), 1)

  await new Promise(resolve => setTimeout(resolve, ttlMs + 35))
  assert.equal(controller.bursts.value.length, 0)
  assert.equal(controller.activeTimerCount(), 0)

  // 手动连续触发后立即 dispose，确保零残留定时器
  controller.trigger({ x: 50, y: 50 })
  controller.trigger({ x: 60, y: 60 })
  assert.equal(controller.bursts.value.length, 2)
  controller.dispose()
  assert.equal(controller.bursts.value.length, 0)
  assert.equal(controller.activeTimerCount(), 0)
})

test('非法坐标和超大值会被规范化，默认 TTL 不超过 1 秒', () => {
  assert.ok(VOTE_BURST_TTL_MS <= 1000)
  const controller = createVoteBurstController()
  try {
    controller.trigger({ x: Number.NaN, y: -120, label: '  ' })
    const [first] = controller.bursts.value
    assert.ok(first)
    assert.equal(Number.isFinite(first.x), true)
    assert.equal(Number.isFinite(first.y), true)
    assert.ok(first.y >= 0)
    assert.equal(first.label, '+1')
  } finally {
    controller.dispose()
  }
})
