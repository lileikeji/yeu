import assert from 'node:assert/strict'
import test from 'node:test'
import {
  directoryListBatchSize,
  directoryListToggleLabel,
  nextDirectoryVisibleCount,
  previewDirectoryItems
} from '../app/utils/directory-list-presentation'

test('directory lists reveal complete rows and can collapse again', () => {
  const items = Array.from({ length: 23 }, (_, index) => index + 1)
  assert.equal(directoryListBatchSize, 9)
  assert.deepEqual(
    previewDirectoryItems(items, { filtered: false, visibleCount: 9 }),
    items.slice(0, 9)
  )
  assert.deepEqual(
    previewDirectoryItems(items, { filtered: true, visibleCount: 9 }),
    items
  )
  assert.equal(nextDirectoryVisibleCount(9, 23), 18)
  assert.equal(nextDirectoryVisibleCount(18, 23), 23)
  assert.equal(nextDirectoryVisibleCount(23, 23), 9)
  assert.equal(directoryListToggleLabel(9, 23), '再看 9 个')
  assert.equal(directoryListToggleLabel(18, 23), '再看 5 个')
  assert.equal(directoryListToggleLabel(23, 23), '收起列表')
})
