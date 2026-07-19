import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

interface AuditPage {
  name: string
  path: string
  heading: string
}

const auditPages: AuditPage[] = [
  { name: '首页', path: '/', heading: '第一次来仰恩，先从这里开始' },
  { name: '全站搜索', path: '/search', heading: '找地点、办事和校园信息' },
  { name: '校园地图', path: '/map', heading: '校园与周边' },
  { name: '办事流程详情', path: '/procedures/campus-network', heading: '校园网与账号登录问题' },
  { name: '公众反馈', path: '/feedback?type=general&path=%2F', heading: '发现信息不对？告诉我们' },
  { name: '后台登录', path: '/admin/login', heading: '管理员登录' }
]

async function dismissIntroIfShown(page: Page): Promise<void> {
  const intro = page.getByRole('dialog', { name: '仰恩新生指南开场动画' })
  try {
    await intro.waitFor({ state: 'visible', timeout: 2_000 })
  } catch {
    return
  }

  await page.getByRole('button', { name: '跳过动画' }).click()
  await expect(intro).toBeHidden()
}

function summarizeViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']): string {
  return violations.map(violation => [
    `${violation.impact ?? 'unknown'}: ${violation.id} — ${violation.help}`,
    ...violation.nodes.map(node => `  ${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
  ].join('\n')).join('\n')
}

async function auditAccessibility(page: Page, testInfo: TestInfo): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  await testInfo.attach('axe-results.json', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json'
  })

  const blocking = results.violations.filter(violation => (
    violation.impact === 'critical' || violation.impact === 'serious'
  ))
  if (blocking.length > 0) throw new Error(summarizeViolations(blocking))
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173(?:\/|$))/, route => route.abort())
})

for (const auditPage of auditPages) {
  test(`${auditPage.name}没有严重或阻断级自动无障碍问题`, async ({ page }, testInfo) => {
    await page.goto(auditPage.path)
    await expect(page.getByRole('heading', { level: 1, name: auditPage.heading })).toBeVisible()
    if (auditPage.path === '/') await dismissIntroIfShown(page)
    await auditAccessibility(page, testInfo)
  })
}
