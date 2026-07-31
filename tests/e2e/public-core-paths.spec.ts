import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { resolve } from 'node:path'
import { loadClientManifest } from '../../scripts/check-client-bundle-budget'

let mapLibreAssetFile = ''

async function dismissIntroIfShown(page: Page): Promise<void> {
  const intro = page.getByRole('dialog', { name: '迎新指南开场动画' })
  try {
    await intro.waitFor({ state: 'visible', timeout: 2_000 })
  } catch {
    return
  }

  const skipIntro = page.getByRole('button', { name: '跳过动画' })
  await skipIntro.waitFor({ state: 'visible' })
  await skipIntro.click()
  await expect(intro).toBeHidden()
}

test.beforeAll(async () => {
  const manifest = await loadClientManifest(resolve(process.cwd(), '.output'))
  const match = Object.values(manifest.dependencies).flatMap(dependency => (
    Object.values(dependency.preload ?? {})
  )).find(asset => asset.name === 'maplibre-gl' && asset.file)
  if (!match?.file) throw new Error('客户端构建清单缺少 MapLibre 动态分包')
  mapLibreAssetFile = match.file
})

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173(?:\/|$))/, route => route.abort())
})

test('首页地点搜索进入地图，并保留文字查询', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '2026级新生入学指南' })).toBeVisible()

  const brandLink = page.getByRole('link', { name: '迎新指南首页' })
  await expect(brandLink).toBeVisible()
  await expect(brandLink.getByText('迎新指南')).toBeVisible()

  await dismissIntroIfShown(page)

  const search = page.getByRole('search').filter({ has: page.getByLabel('搜索校园地点') })
  await search.getByLabel('搜索校园地点').fill('图书馆')
  await search.getByRole('button', { name: '找地点' }).click()

  await expect(page).toHaveURL(/\/map\?q=%E5%9B%BE%E4%B9%A6%E9%A6%86$/)
  await expect(page.getByRole('heading', { level: 1, name: '校园与周边' })).toBeVisible()
  await expect(page.getByLabel('搜索地图地点')).toHaveValue('图书馆')
})

test('全站搜索返回可访问的校园网流程', async ({ page }) => {
  await page.goto('/search')
  await expect(page.getByRole('heading', { level: 1, name: '找地点、办事和校园信息' })).toBeVisible()

  const search = page.getByRole('search').filter({ has: page.getByLabel('全站搜索') })
  await search.getByLabel('全站搜索').fill('校园网')
  await search.getByRole('button', { name: '搜索', exact: true }).click()

  await expect(page).toHaveURL(/\/search\?q=%E6%A0%A1%E5%9B%AD%E7%BD%91$/)
  await expect(page.getByRole('link', { name: /校园网与统一认证排查/ }).first()).toBeVisible()
})

test('搜索可进入已发布地点、查看详情并返回地图', async ({ page }) => {
  await page.goto('/search')
  const search = page.getByRole('search').filter({ has: page.getByLabel('全站搜索') })
  await search.getByLabel('全站搜索').fill('E2E 核验服务点')
  await search.getByRole('button', { name: '搜索', exact: true }).click()

  await page.getByRole('link', { name: /E2E 核验服务点/ }).first().click()
  await expect(page).toHaveURL(/\/map\?place=e2e-verified-service-point$/)
  await expect(page.getByRole('heading', { level: 2, name: 'E2E 核验服务点' }).filter({ visible: true })).toBeVisible()
  await expect(page.getByText('到这里前先确认', { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByText('核对地点名称和入口标识。', { exact: true }).filter({ visible: true })).toBeVisible()

  await page.getByRole('link', { name: '详情', exact: true }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/\/places\/e2e-verified-service-point\?from=/)
  await expect(page.getByRole('heading', { level: 1, name: 'E2E 核验服务点' })).toBeVisible()
  await expect(page.getByText('入口位置已确认', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: '地图查看', exact: true }).click()
  await expect(page).toHaveURL(/\/map\?place=e2e-verified-service-point/)
})

test('地图区域查询可在首次加载恢复，并在关闭详情后清理 URL', async ({ page }) => {
  await page.goto('/map?q=学生街&area=wia-area-2003534061878101222')

  await expect(page.getByLabel('搜索地图地点')).toHaveValue('学生街')
  await expect(page.getByRole('heading', { level: 2, name: '旧区学生街' }).filter({ visible: true })).toBeVisible()
  await expect(page).toHaveURL(/area=wia-area-2003534061878101222/)

  await page.getByRole('button', { name: '关闭区域详情' }).filter({ visible: true }).click()
  await expect(page).not.toHaveURL(/(?:\?|&)area=/)
})

test('校园平面图可加载完整原图、编号热点与来源链接', async ({ page }) => {
  await page.goto('/map')
  await page.getByRole('button', { name: '平面图', exact: true }).click()

  const plan = page.getByRole('img', { name: /官网校园平面图/ })
  await expect(plan).toBeVisible()
  const dimensions = await plan.evaluate(image => ({
    width: image.naturalWidth,
    height: image.naturalHeight
  }))
  expect(dimensions).toEqual({ width: 8504, height: 3898 })
  await expect(page.getByRole('button', { name: /平面图 08：仰恩楼/ })).toBeVisible()
  await expect(page.getByRole('link', { name: '查看来源' })).toHaveAttribute(
    'href',
    'https://www.yeu.edu.cn/xydt/list.htm'
  )
  await expect(page.getByText(/仅用于校内方位对照，不作为导航坐标/)).toBeVisible()
})

test('办事流程可查看材料和来源，并用键盘记录本地步骤进度', async ({ context, page }) => {
  await page.goto('/procedures')
  await expect(page.getByRole('heading', { level: 1, name: '新生办事流程' })).toBeVisible()

  await page.getByRole('link', { name: /校园网与统一认证排查/ }).first().click()
  await expect(page).toHaveURL(/\/procedures\/campus-network$/)
  await expect(page.getByRole('heading', { level: 1, name: '校园网与统一认证排查' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: '错误截图和设备信息', exact: true })).toBeVisible()

  const firstStep = page.getByRole('button', { name: '标记第1步完成' })
  await firstStep.focus()
  await firstStep.press('Space')
  await expect(page.getByRole('button', { name: '取消完成第1步' })).toBeVisible()

  const sourceSummary = page.locator('summary').filter({ hasText: '来源与更新时间' })
  await sourceSummary.focus()
  await sourceSummary.press('Enter')

  const sourceUrl = 'https://metc.yeu.edu.cn/2025/1006/c1324a51853/page.htm'
  const sourceLink = page.getByRole('link', { name: /仰恩大学校园网使用指南/ })
  await expect(sourceLink).toBeVisible()
  await expect(sourceLink).toHaveAttribute('href', sourceUrl)
  await expect(sourceLink).toHaveAttribute('rel', 'noopener noreferrer')

  await context.route(sourceUrl, route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><title>E2E official source</title>'
  }))
  const popupPromise = page.waitForEvent('popup')
  await sourceLink.click()
  const sourcePage = await popupPromise
  await expect(sourcePage).toHaveURL(sourceUrl)
  await sourcePage.close()
})

test.describe('搜索故障恢复', () => {
  test.use({ serviceWorkers: 'block' })

  test('搜索 API 失败时仍显示明确告警和可用文字地点', async ({ page }) => {
    await page.goto('/search')
    await page.route('**/api/public/search**', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 503, statusMessage: 'E2E forced failure' })
    }))

    const search = page.getByRole('search').filter({ has: page.getByLabel('全站搜索') })
    await search.getByLabel('全站搜索').fill('图书馆')
    await search.getByRole('button', { name: '搜索', exact: true }).click()

    await expect(page.getByText('搜索服务暂时不稳定；如果关键词命中地图目录，下面仍会先显示可用地点。')).toBeVisible()
    await expect(page.getByRole('link', { name: /图书馆/ }).first()).toBeVisible()
  })
})

test('地图 SDK 加载失败时保留地点列表和重试说明', async ({ page }) => {
  await page.route(`**/_nuxt/${mapLibreAssetFile}`, route => route.abort())
  await page.goto('/map')

  await expect(page.getByRole('heading', { level: 1, name: '校园与周边' })).toBeVisible()
  await expect(page.getByText('地图暂时无法载入', { exact: true })).toBeVisible()
  await expect(page.getByText(/地点列表仍可继续浏览/)).toBeVisible()
  const fallbackPlace = page.getByRole('button', { name: /E2E 核验服务点/ })
  await fallbackPlace.scrollIntoViewIfNeeded()
  await expect(fallbackPlace).toBeVisible()
})

test('地图显示设置可切换名称图层并关闭面板', async ({ page }) => {
  await page.goto('/map')

  await page.getByRole('button', { name: '地图图层与显示设置' }).click()
  const settings = page.getByRole('region', { name: '地图显示设置' })
  await expect(settings).toBeVisible()

  const labels = settings.getByRole('button', { name: '显示名称' })
  await expect(labels).toHaveAttribute('aria-pressed', 'true')
  await labels.click()
  await expect(labels).toHaveAttribute('aria-pressed', 'false')

  await settings.getByRole('button', { name: '关闭地图显示设置' }).click()
  await expect(settings).toBeHidden()
})

test('PWA 清单有效且浏览器可完成 Service Worker 更新检查', async ({ page }) => {
  await page.goto('/')
  await dismissIntroIfShown(page)

  const state = await page.evaluate(async () => {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!manifestLink?.href) throw new Error('页面缺少 Web App Manifest 链接')

    const manifestResponse = await fetch(manifestLink.href, { cache: 'no-store' })
    if (!manifestResponse.ok) throw new Error(`Manifest 返回 ${manifestResponse.status}`)
    const manifest = await manifestResponse.json() as {
      name?: string
      start_url?: string
      scope?: string
      display?: string
      icons?: Array<{ src?: string, sizes?: string }>
    }

    const registration = await navigator.serviceWorker.ready
    await registration.update()

    return {
      manifest,
      scope: registration.scope,
      scriptUrl: registration.active?.scriptURL ?? null,
      workerState: registration.active?.state ?? null
    }
  })

  expect(state.manifest).toMatchObject({
    name: '迎新指南',
    start_url: '/',
    scope: '/',
    display: 'standalone'
  })
  expect(state.manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192' }),
    expect.objectContaining({ sizes: '512x512' })
  ]))
  expect(state.scope).toBe('http://127.0.0.1:4173/')
  expect(state.scriptUrl).toMatch(/\/sw\.js$/)
  expect(state.workerState).toBe('activated')
})

test('PWA 新版本出现时提示刷新并保护未提交表单', async ({ page }) => {
  await page.goto('/')
  await dismissIntroIfShown(page)

  await page.evaluate(() => {
    const root = document.querySelector('#__nuxt') as (Element & {
      __vue_app__?: {
        config: { globalProperties: { $nuxt?: { $pwa?: Record<string, unknown> } } }
      }
    }) | null
    const pwa = root?.__vue_app__?.config.globalProperties.$nuxt?.$pwa
    if (!pwa) throw new Error('Nuxt PWA injection is unavailable')

    pwa.updateServiceWorker = async (reloadPage?: boolean) => {
      Object.assign(window, { __e2ePwaUpdateReloadPage: reloadPage })
      pwa.needRefresh = false
    }
    pwa.needRefresh = true
  })

  const prompt = page.getByRole('alertdialog', { name: '指南有新内容' })
  await expect(prompt).toBeVisible()
  await expect(prompt.getByText('正在填写反馈或聊天内容时，可以稍后更新。', { exact: false })).toBeVisible()
  await expect(prompt.getByRole('button', { name: '更新内容' })).toBeFocused()
  await prompt.getByRole('button', { name: '更新内容' }).click()
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __e2ePwaUpdateReloadPage?: boolean }).__e2ePwaUpdateReloadPage
  ))).toBe(true)
  await expect(prompt).toBeHidden()
})

test('Service Worker 在断网导航时返回明确离线说明页', async ({ context, page }) => {
  await page.goto('/')
  await dismissIntroIfShown(page)

  await page.evaluate(async () => navigator.serviceWorker.ready)
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await context.setOffline(true)
  try {
    await page.goto('/e2e-offline-navigation-probe', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: '先检查网络，连上后再继续' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: '连上网络后再试一次' })).toBeVisible()
    await expect(page.getByText(/校园地图、路线和最新通知需要联网查看/)).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
