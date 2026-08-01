import assert from 'node:assert/strict'
import test from 'node:test'
import { sortPublicNoticeItems } from '../server/modules/notices/sorting'

test('notice sorting keeps pinned items first and otherwise uses manual order', () => {
  const items = [
    { id: 'newest', title: '最新', pinned: false, sortOrder: null, publishedAt: '2026-08-02T10:00:00.000Z', updatedAt: '2026-08-02T10:00:00.000Z' },
    { id: 'manual-first', title: '手动第一', pinned: false, sortOrder: 1, publishedAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z' },
    { id: 'pinned', title: '置顶', pinned: true, sortOrder: 99, publishedAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-01T10:00:00.000Z' },
    { id: 'manual-second', title: '手动第二', pinned: false, sortOrder: 2, publishedAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-01T10:00:00.000Z' },
    { id: 'oldest', title: '未设置顺序', pinned: false, sortOrder: null, publishedAt: '2026-07-01T09:00:00.000Z', updatedAt: '2026-07-01T09:00:00.000Z' }
  ]

  assert.deepEqual(
    sortPublicNoticeItems(items).map(item => item.id),
    ['pinned', 'manual-first', 'manual-second', 'newest', 'oldest']
  )
  assert.equal(items[0]?.id, 'newest', 'sorting should not mutate the source array')
})

test('notices without a manual order default to publication time descending', () => {
  const items = [
    { id: 'older', title: '旧公告', pinned: false, publishedAt: '2026-07-31T10:00:00.000Z', updatedAt: '2026-07-31T10:00:00.000Z' },
    { id: 'newer', title: '新公告', pinned: false, publishedAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-01T10:00:00.000Z' }
  ]

  assert.deepEqual(sortPublicNoticeItems(items).map(item => item.id), ['newer', 'older'])
})
