import assert from 'node:assert/strict'
import test from 'node:test'

import { filterHotEvents, normalizeHotSearch } from '../app/utils/hot-search'

const events = [
  {
    title: '11月20日 社团联合招新',
    summary: '本周五在吉龙楼前广场摆摊。',
    category: '社团活动',
    tierLabel: '校内官方',
    places: [{ name: '吉龙楼' }]
  },
  {
    title: '宏船楼 303 歌手大赛初赛',
    summary: '音乐协会主办，晚上七点开始。',
    category: '校园动态',
    tierLabel: '学生组织',
    places: [{ name: '宏船楼' }]
  },
  {
    title: '图书馆闭馆通知',
    summary: '设备检修，暂停开放一天。',
    category: '通知公告',
    tierLabel: '校内官方',
    places: []
  }
]

test('hot search: 标题、摘要、地点都能命中', () => {
  assert.deepEqual(filterHotEvents(events, '社团').map(event => event.title), ['11月20日 社团联合招新'])
  assert.deepEqual(filterHotEvents(events, '七点').map(event => event.title), ['宏船楼 303 歌手大赛初赛'])
  assert.deepEqual(filterHotEvents(events, '吉龙楼').map(event => event.title), ['11月20日 社团联合招新'])
})

test('hot search: 分类和来源层级也能搜', () => {
  assert.deepEqual(filterHotEvents(events, '通知公告').map(event => event.title), ['图书馆闭馆通知'])
  assert.deepEqual(filterHotEvents(events, '学生组织').map(event => event.title), ['宏船楼 303 歌手大赛初赛'])
})

test('hot search: 空关键词返回全部，大小写和空白归一', () => {
  assert.equal(filterHotEvents(events, '   ').length, 3)
  assert.equal(normalizeHotSearch('  YEU   Campus  '), 'yeu campus')
  assert.equal(filterHotEvents(events, 'yeu campus').length, 0)
})
