import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { adminSectionConfigs } from '../app/utils/admin-section-config'
import {
  noticePublishedTime,
  noticeRelativeTime,
  noticeUnreadCount
} from '../app/utils/notice-presentation'

const noticeCenter = readFileSync(resolve('app/components/PublicNoticeCenter.vue'), 'utf8')
const resourceManager = readFileSync(resolve('app/components/admin/AdminResourceManager.vue'), 'utf8')
const resourceEditor = readFileSync(resolve('app/components/admin/AdminResourceEditor.vue'), 'utf8')

test('notice presentation reports unread counts and useful relative times', () => {
  const now = Date.parse('2026-07-31T12:00:00+08:00')
  assert.equal(noticeUnreadCount([
    { confirmed: false },
    { confirmed: true },
    { confirmed: false }
  ]), 2)
  assert.equal(noticeRelativeTime('2026-07-31T11:59:30+08:00', now), '刚刚')
  assert.equal(noticeRelativeTime('2026-07-31T11:42:00+08:00', now), '18 分钟前')
  assert.equal(noticeRelativeTime('2026-07-29T12:00:00+08:00', now), '2 天前')
  assert.match(noticePublishedTime('2026-07-31T11:42:00+08:00'), /2026年7月31日.*11:42/)
})

test('public notice center uses a list-detail flow and marks details read automatically', () => {
  assert.match(noticeCenter, /noticeUnreadCount\(notices\.value\)/)
  assert.match(noticeCenter, /autoPopup/)
  assert.match(noticeCenter, /autoPopupDismissalKey/)
  assert.match(noticeCenter, /localStorage\.setItem/)
  assert.match(noticeCenter, /dismissAutoPopupForToday/)
  assert.match(noticeCenter, /onMounted\(\(\) =>/)
  assert.match(noticeCenter, /open\.value = true/)
  assert.match(noticeCenter, /openNoticeDetail\(notice\)/)
  assert.match(noticeCenter, /void confirmNotice\(notice\)/)
  assert.match(noticeCenter, /handleModalOpenChange/)
  assert.match(noticeCenter, /detailSource/)
  assert.match(noticeCenter, /ml-auto inline-flex shrink-0 items-center gap-2/)
  assert.doesNotMatch(noticeCenter, /返回公告列表/)
  assert.match(noticeCenter, /置顶公告/)
  assert.match(noticeCenter, /人已读/)
  assert.doesNotMatch(noticeCenter, /在公告页查看|\/campus#notice-/)
})

test('notice editor hides URL and verification-only fields while generating an internal slug', () => {
  const contentFields = adminSectionConfigs.content!.fields
  for (const key of ['kind', 'slug', 'category', 'sourceIds', 'lastVerifiedAt', 'isFeatured']) {
    const field = contentFields.find(item => item.key === key)
    assert.ok(field?.condition)
    assert.equal(field.condition.values.includes('notice'), false)
  }

  assert.match(resourceManager, /label="新增公告"/)
  assert.match(resourceManager, /payload\.slug = `notice-\$\{Date\.now\(\)\}`/)
  assert.match(resourceManager, /payload\.kind = 'notice'/)

  const autoPopupField = contentFields.find(item => item.key === 'metadata.autoPopup')
  assert.equal(autoPopupField?.type, 'checkbox')
  assert.equal(autoPopupField?.condition?.values.includes('notice'), true)
  assert.match(resourceEditor, /前台显示方式/)
  assert.match(resourceEditor, /进入前台时自动弹出/)
  assert.match(resourceEditor, /metadata\.autoPopup/)

  const noticeSortField = contentFields.find(item => item.key === 'metadata.sortOrder')
  assert.equal(noticeSortField?.condition?.values.includes('notice'), true)
})
