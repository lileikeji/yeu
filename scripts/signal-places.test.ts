import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventMatchText, matchPlaceTags, parseEventDateHint } from '../server/modules/signal/places'
import { prescreenSignalCandidate } from '../server/modules/signal/scoring'

const index = [
  { name: '新区图书馆', slug: 'new-library' },
  { name: '旧区图书馆', slug: 'old-library' },
  { name: '和昌教学楼', slug: 'hechang' },
  { name: '仰恩基金会体育场', slug: 'stadium' }
]

const aliasedIndex = [
  { name: '仰恩楼', slug: 'yangen-building', matchNames: ['仰恩楼', '仰恩教学楼', '仰恩教学大楼'] },
  { name: '图书馆', slug: 'library', matchNames: ['图书馆'] },
  { name: '新区图书馆', slug: 'new-library', matchNames: ['新区图书馆'] }
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

test('places: 别名命中归到标准点位', () => {
  const tags = matchPlaceTags('仰恩教学楼 5 楼机房检修', aliasedIndex)
  assert.deepEqual(tags, [{ name: '仰恩楼', slug: 'yangen-building' }])
})

test('places: 别名参与长名优先排序', () => {
  // 「新区图书馆」(5字) 优先于「图书馆」(3字)
  const tags = matchPlaceTags('新区图书馆与图书馆的开放时间', aliasedIndex)
  assert.deepEqual(tags.map(tag => tag.slug), ['new-library', 'library'])
})

test('places: 无 matchNames 的旧结构按标准名匹配（兼容）', () => {
  const tags = matchPlaceTags('仰恩楼门口修路', index)
  assert.deepEqual(tags, [])
})

const ANCHOR = new Date('2026-11-07T08:00:00+08:00').getTime()

test('dateHint: 未来日期解析为 upcoming（缺年份按锚点年补全）', () => {
  const hint = parseEventDateHint('11月20日图书馆讲座预告', '', ANCHOR)
  assert.deepEqual(hint, { kind: 'upcoming', date: '2026-11-20' })
})

test('dateHint: 带年份的跨年预告', () => {
  const hint = parseEventDateHint('2027年1月5日 新生技能大赛', '报名截止 2026年12月30日', ANCHOR)
  // 两个未来日期取最近的一个
  assert.deepEqual(hint, { kind: 'upcoming', date: '2026-12-30' })
})

test('dateHint: 过去日期返回 null，不硬造预告', () => {
  assert.equal(parseEventDateHint('10月20日已举办运动会', '', ANCHOR), null)
})

test('dateHint: 没有日期字样返回 null', () => {
  assert.equal(parseEventDateHint('关于期末考试安排的通知', '请同学们注意查收', ANCHOR), null)
  assert.equal(parseEventDateHint('', '', ANCHOR), null)
})

test('prescreen: 太短的放过不来，招标采购挡掉', () => {
  assert.equal(prescreenSignalCandidate({ title: '通知' }), false)
  assert.equal(prescreenSignalCandidate({ title: '关于体育馆维修工程招标公告' }), false)
  assert.equal(prescreenSignalCandidate({ title: '2026级新生报到安排' }), true)
})
