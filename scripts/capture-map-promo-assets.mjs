import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const outputDir = 'docs/marketing/map-promo/assets'
const targetUrl = 'https://yeu.huiliyill.cn/map?place=amap-workmap-20260713-r074'

await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
})
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN'
})
const page = await context.newPage()

await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForTimeout(8_000)

const introClose = page.getByRole('button', { name: /跳过|关闭|稍后/ }).first()
if (await introClose.isVisible().catch(() => false)) await introClose.click()

const placeListButton = page.getByRole('button', { name: /地点列表/ }).first()
if (await placeListButton.isVisible().catch(() => false)) {
  await placeListButton.click()
  await page.waitForTimeout(600)
}

const searchInput = page.getByRole('textbox', { name: '搜索地图地点' }).first()
if (await searchInput.isVisible().catch(() => false)) {
  await searchInput.fill('上海楼')
  await page.waitForTimeout(1_200)
  const building = page.getByRole('button', { name: /上海楼/ }).first()
  if (await building.isVisible().catch(() => false)) {
    await building.click()
    await page.waitForTimeout(1_800)
  }
}

await page.screenshot({ path: `${outputDir}/map-selected.png`, fullPage: false })

const planButton = page.getByRole('button', { name: '平面图', exact: true }).first()
if (await planButton.isVisible().catch(() => false)) {
  await planButton.click()
  await page.waitForTimeout(4_000)
}

await page.screenshot({ path: `${outputDir}/plan-selected.png`, fullPage: false })
await browser.close()

console.log(`Captured ${outputDir}`)
