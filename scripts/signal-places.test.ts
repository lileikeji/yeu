import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventMatchText, matchPlaceTags } from '../server/modules/signal/places'
import { prescreenSignalCandidate } from '../server/modules/signal/scoring'

const index = [
  { name: '新区图书馆', slug: 'new-library' },
  { name: '旧区图书馆', slug: 'old-library' },
  { name: '和昌教学楼', slug: 'hechang' },
  { name: '仰恩基金会体育场', slug: 'stadium' }
]

test('places: 长名优先，命中后不再被短名重复占位', () => {
  const tags = matchPlaceTags('关于新区图书馆闭馆的通知', index)
  assert.deepEqual(tags, [{ name: '新区图书馆', slug: 'new-library' }])
})

test('places: 一篇文章最多挂三个地点', () => {
  const tags = matchPlaceTags('新区图书馆、和昌教学楼、仰恩基金会体育场同时开放', index, 3)
  assert.equal(tags.length, 3)
})

test('places: 没出现就是空数组，不猜', () => {
  assert.deepEqual(matchPlaceTags('关于做好期末工作的通知', index), [])
})

test('places: 事件正文会把同组标题一起纳入匹配', () => {
  const text = eventMatchText('新区图书馆延长开放', '', ['和昌教学楼自习室调整'])
  const tags = matchPlaceTags(text, index)
  assert.deepEqual(tags.map(tag => tag.slug), ['new-library', 'hechang'])
})

test('prescreen: 太短的放过不来，招标采购挡掉', () => {
  assert.equal(prescreenSignalCandidate({ title: '通知' }), false)
  assert.equal(prescreenSignalCandidate({ title: '关于体育馆维修工程招标公告' }), false)
  assert.equal(prescreenSignalCandidate({ title: '2026级新生报到安排' }), true)
})
