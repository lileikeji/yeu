import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertNoPersonalFields,
  parseWelcomeFiles,
  parseWelcomeGuides,
  publicWelcomeAttachmentUrl,
  welcomeHtmlToText
} from '../server/modules/knowledge/welcome-public'

test('welcome public parser keeps only allowlisted guide fields and usable text', () => {
  const guides = parseWelcomeGuides({
    status: '200',
    isOK: true,
    data: [{
      id: 'public-guide-id',
      title: '新生公共指南',
      order: 1,
      content: '<p>报到时请携带录取通知书，并按现场指引依次完成身份核验和注册。</p><script>secret()</script>',
      updateAt: '2026-08-09 10:00:00',
      createAt: '2026-08-09 09:00:00'
    }]
  })
  assert.deepEqual(guides, [{
    title: '新生公共指南',
    order: 1,
    text: '报到时请携带录取通知书，并按现场指引依次完成身份核验和注册。',
    updatedAt: '2026-08-09 10:00:00'
  }])
})

test('welcome public parser rejects personal or unexpected fields', () => {
  assert.throws(() => parseWelcomeGuides({
    status: '200',
    isOK: true,
    data: [{
      id: 'guide',
      title: '个人结果',
      order: 1,
      content: '<p>不应导入</p>',
      updateAt: '2026-08-09',
      createAt: '2026-08-09',
      studentNo: '20260001'
    }]
  }), /personal field/)
  assert.throws(() => assertNoPersonalFields({ data: { phone: '13800000000' } }), /personal field/)
})

test('welcome public file parser deduplicates and pins attachments to the public host', () => {
  const files = parseWelcomeFiles({
    status: '200',
    isOK: true,
    data: [
      { id: '1', title: '公共材料', order: 1, url: '/files/public.doc', downTimes: 0 },
      { id: '2', title: '重复材料', order: 2, url: '/files/public.doc', downTimes: 0 }
    ]
  })
  assert.equal(files.length, 1)
  assert.equal(files[0]?.url, 'https://ltc-tfs-yx-yedx.oss-cn-shenzhen.aliyuncs.com/files/public.doc')
  assert.throws(() => publicWelcomeAttachmentUrl('https://example.com/files/private.doc'), /not allowlisted/)
  assert.throws(() => publicWelcomeAttachmentUrl('/uploads/private.pdf'), /not allowlisted/)
})

test('welcome HTML extraction removes executable and embedded content', () => {
  assert.equal(
    welcomeHtmlToText('<div>第一段</div><iframe src="https://example.com"></iframe><p>第二段</p>'),
    '第一段\n第二段'
  )
})
