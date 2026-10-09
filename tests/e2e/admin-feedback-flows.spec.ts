import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAME,
  E2E_DRAFT_CONTENT
} from '../../scripts/e2e-fixtures'

async function loginAdmin(page: Page, redirect: string): Promise<void> {
  await page.goto(`/admin/login?redirect=${encodeURIComponent(redirect)}`)
  await page.locator('input[name="username"]').fill(E2E_ADMIN_USERNAME)
  await page.locator('input[name="password"]').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${redirect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
}

async function searchAdminRecords(page: Page, query: string): Promise<void> {
  const search = page.getByLabel('搜索记录')
  await search.fill(query)
  await expect(page.getByText(query, { exact: true }).filter({ visible: true })).toBeVisible()
}

function visibleRecord(page: Page, text: string) {
  return page.locator('tr:visible, article:visible').filter({ hasText: text })
}

async function clickRecordAction(page: Page, recordText: string, action: '编辑' | '发布' | '下架'): Promise<void> {
  const record = visibleRecord(page, recordText)
  const desktopAction = record.locator(`button[aria-label^="${action}"]`)
  if (await desktopAction.count()) {
    await desktopAction.click()
    return
  }
  await record.getByRole('button', { name: action, exact: true }).click()
}

async function exerciseProcedureEditors(page: Page): Promise<void> {
  await page.goto('/admin/procedures?action=create')
  const editor = page.getByRole('dialog', { name: '新增办事流程' })
  await expect(editor).toBeVisible()

  await editor.getByLabel('流程标题').fill('E2E 流程编辑器')
  await editor.getByLabel('网页地址名称').fill('e2e-procedure-editor')
  await editor.getByLabel('摘要').fill('验证基础信息组件与页面共享同一份类型化表单状态。')
  await editor.getByLabel('前台状态说明').fill('E2E 等待确认')
  await editor.getByLabel('预计办理时长').fill('约 10 分钟')
  await expect(editor.getByLabel('流程标题')).toHaveValue('E2E 流程编辑器')
  await expect(editor.getByLabel('前台状态说明')).toHaveValue('E2E 等待确认')
  await expect(editor.getByLabel('信息来源')).toBeVisible()

  const stepTitles = editor.getByLabel('步骤标题')
  await expect(stepTitles).toHaveCount(1)
  await stepTitles.first().fill('第一步')
  await editor.getByRole('button', { name: '添加步骤', exact: true }).click()
  await expect(stepTitles).toHaveCount(2)
  await stepTitles.nth(1).fill('第二步')
  await editor.getByRole('button', { name: '下移步骤 1', exact: true }).click()
  await expect(stepTitles.nth(0)).toHaveValue('第二步')
  await expect(stepTitles.nth(1)).toHaveValue('第一步')
  await editor.getByRole('button', { name: '删除步骤 2', exact: true }).click()
  await expect(stepTitles).toHaveCount(1)

  const materialNames = editor.getByLabel('材料名称')
  await expect(materialNames).toHaveCount(0)
  await editor.getByRole('button', { name: '添加材料', exact: true }).click()
  await editor.getByRole('button', { name: '添加材料', exact: true }).click()
  await expect(materialNames).toHaveCount(2)
  await materialNames.nth(0).fill('材料甲')
  await materialNames.nth(1).fill('材料乙')
  await editor.getByRole('button', { name: '下移材料 1', exact: true }).click()
  await expect(materialNames.nth(0)).toHaveValue('材料乙')
  await expect(materialNames.nth(1)).toHaveValue('材料甲')
  await editor.getByRole('button', { name: '删除材料 2', exact: true }).click()
  await expect(materialNames).toHaveCount(1)
}

async function exerciseOfflineCoordinateQueue(page: Page): Promise<void> {
  const record = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    queuedAt: '2026-07-16T08:30:00.000Z',
    payload: {
      clientObservationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      placeId: 'missing-e2e-place',
      pointRole: 'main-entrance',
      evidenceNote: 'E2E 离线现场说明',
      samples: [{
        longitude: 118.6034567,
        latitude: 24.9123456,
        accuracyMeters: 4.2,
        capturedAt: '2026-07-16T08:29:00.000Z'
      }]
    }
  }

  await page.goto('/admin/field-observations')
  await expect(page.getByRole('heading', { level: 1, name: '现场坐标采集' })).toBeVisible()
  await expect(page.getByLabel('选择采点地点')).toBeVisible()
  await expect(page.getByLabel('搜索定位地点')).toBeVisible()
  await expect(page.getByLabel('筛选审核状态')).toBeVisible()
  await expect(page.getByText('当前条件下暂无定位记录')).toBeVisible()
  await page.evaluate(async (queuedRecord) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('yeu-field-verification', 2)
      request.onerror = () => reject(request.error)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('coordinate-observations')) {
          database.createObjectStore('coordinate-observations', { keyPath: 'id' })
        }
      }
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('coordinate-observations', 'readwrite')
        transaction.objectStore('coordinate-observations').put(queuedRecord)
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  }, record)
  await page.reload()

  const heading = page.getByRole('heading', { level: 2, name: '未上传的定位记录' })
  await expect(heading).toBeVisible()
  const panel = page.locator('section').filter({ has: heading })
  await expect(panel.getByText('未知地点', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '查看', exact: true }).click()
  await expect(panel.getByText('E2E 离线现场说明', { exact: true })).toBeVisible()
  await expect(panel.getByText('118.6034567', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '删除未知地点的本地定位记录' }).click()
  const dialog = page.getByRole('dialog', { name: '删除本地定位记录' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(heading).toHaveCount(0)
  await page.reload()
  await expect(heading).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173(?:\/|$))/, route => route.abort())
})

test('管理员可登录、编辑、发布、公开检索并下线受控内容', async ({ page }, testInfo) => {
  const fixture = E2E_DRAFT_CONTENT.find(item => item.project === testInfo.project.name)
  if (!fixture) throw new Error(`缺少 ${testInfo.project.name} 的 E2E 内容夹具`)
  const updatedSummary = `${fixture.title} 已由浏览器后台完成编辑。`

  await loginAdmin(page, '/admin/content')
  await expect(page.getByRole('heading', { level: 1, name: '内容管理' })).toBeVisible()
  await searchAdminRecords(page, fixture.title)

  await clickRecordAction(page, fixture.title, '编辑')
  const editor = page.getByRole('dialog', { name: '编辑公告' })
  await expect(editor).toBeVisible()
  await editor.getByLabel('摘要').fill(updatedSummary)
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('记录已更新', { exact: true })).toBeVisible()

  let record = visibleRecord(page, fixture.title)
  await clickRecordAction(page, fixture.title, '发布')
  await expect(page.getByText('内容已发布', { exact: true })).toBeVisible()
  await expect(record.getByRole('button', { name: /^下架/ })).toBeVisible()

  await page.goto(`/search?mode=site&q=${encodeURIComponent(fixture.title)}`)
  const publicResult = page.getByRole('link', { name: new RegExp(fixture.title) }).first()
  await expect(publicResult).toBeVisible()
  await expect(publicResult).toContainText(updatedSummary)

  await page.goto('/admin/content')
  await searchAdminRecords(page, fixture.title)
  record = visibleRecord(page, fixture.title)
  await clickRecordAction(page, fixture.title, '下架')
  await expect(page.getByText('内容已下架', { exact: true })).toBeVisible()
  await expect(record.getByRole('button', { name: /^发布/ })).toBeVisible()

  await page.goto(`/search?mode=site&q=${encodeURIComponent(fixture.title)}`)
  await expect(page.getByRole('link', { name: new RegExp(fixture.title) })).toHaveCount(0)

  await page.goto('/admin/audit-logs')
  await expect(page.getByRole('heading', { level: 1, name: '操作记录' })).toBeVisible()
  await expect(page.getByText('content.update', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('content.published', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('content.archived', { exact: true }).filter({ visible: true }).first()).toBeVisible()

  await exerciseProcedureEditors(page)
  await exerciseOfflineCoordinateQueue(page)
})

test('公开反馈可提交并由管理员标记为已解决', async ({ page }, testInfo) => {
  const message = `E2E ${testInfo.project.name} 反馈处理闭环`
  const resolution = `${testInfo.project.name} 已核对并完成处理。`

  await page.goto('/feedback')
  await expect(page.getByRole('heading', { level: 1, name: '发现信息不对？告诉我们' })).toBeVisible()
  await page.locator('#feedback-reason').selectOption('content_outdated')
  await page.locator('#feedback-message').fill(message)
  await page.getByText('补充信息（选填）', { exact: true }).click()
  await page.locator('#feedback-evidence').fill('https://example.com/e2e-evidence')
  await page.locator('#feedback-contact').fill(`contact-${testInfo.project.name}`)
  await page.getByRole('button', { name: '提交反馈', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: '已经收到你的反馈' })).toBeVisible()

  await loginAdmin(page, '/admin/feedback')
  await expect(page.getByRole('heading', { level: 1, name: '反馈管理' })).toBeVisible()
  await searchAdminRecords(page, message)

  let record = visibleRecord(page, message)
  await record.getByRole('button', { name: /编辑/ }).click()
  const editor = page.getByRole('dialog', { name: '编辑反馈管理' })
  await editor.getByLabel('处理状态').click()
  await page.getByRole('option', { name: '已解决', exact: true }).click()
  await editor.getByLabel('处理备注').fill(resolution)
  const updateResponse = page.waitForResponse(response => (
    /\/api\/admin\/feedback\/[0-9a-f-]+$/.test(new URL(response.url()).pathname)
    && response.request().method() === 'PUT'
  ))
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  const response = await updateResponse
  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toMatchObject({ status: 'resolved', resolutionNote: resolution })
  await expect(page.getByText('记录已更新', { exact: true })).toBeVisible()

  record = visibleRecord(page, message)
  await expect(record).toBeVisible()

  await page.goto('/admin/audit-logs')
  await expect(page.getByText('feedback.update', { exact: true }).filter({ visible: true }).first()).toBeVisible()
})
