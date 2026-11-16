import { expect, test } from '@playwright/test'

/**
 * T-033 底部 dock 的两态几何闸门（真浏览器，量 getBoundingClientRect）。
 *
 * 三条：顶栏 44px；其他页悬浮胶囊 52px；/map 合成块 100px（= 4 + 36 + 4 + 52）。
 * 两态互斥：/map 只有 .shell-dock--map，其他路由只有 .shell-dock。
 * Playwright 配置里 reducedMotion: 'reduce'，动效瞬切，量到的就是终态。
 * 桌面项目（≥768px）dock 整块 md:hidden，跳过。
 */
const isNarrow = (width: number | null | undefined): boolean => (width ?? 0) < 768

test('其他页是 52px 悬浮胶囊，/map 是 100px 合成块，两态互斥且导航行高度一致', async ({ page }) => {
  test.skip(!isNarrow(page.viewportSize()?.width), 'dock 只在窄屏断点以下渲染')

  await page.goto('/checklist')
  const pill = page.locator('nav.shell-dock')
  await expect(pill).toHaveCount(1)
  const pillBox = await pill.boundingBox()
  expect(pillBox?.height ?? 0, '其他页胶囊高 52px').toBeCloseTo(52, 0)
  expect(await page.locator('nav.shell-dock--map').count(), '/map 合成块不该出现').toBe(0)
  // 其他页没有搜索行（合成块才长搜索行）
  expect(await page.locator('nav.shell-dock .shell-dock-search').count(), '其他页不该有搜索行').toBe(0)

  const headerBox = await page.locator('header').first().boundingBox()
  expect(headerBox?.height ?? 0, '顶栏 44px').toBeCloseTo(44, 0)

  await page.goto('/map')
  const block = page.locator('nav.shell-dock--map')
  await expect(block).toHaveCount(1)
  // T-033 R4：dock 不再挂 WebGL 玻璃层（错采样会画出深灰带）
  expect(await block.evaluate(el => el.querySelector('.shell-dock-glass') === null), 'dock 里不该有折射画布').toBe(true)
  expect(await block.evaluate(el => el.classList.contains('shell-dock--glass')), 'dock 不该挂玻璃类').toBe(false)
  const blockBox = await block.boundingBox()
  expect(blockBox?.height ?? 0, '/map 合成块高 114px').toBeCloseTo(100, 0)
  expect(await page.locator('nav.shell-dock:not(.shell-dock--map)').count(), '胶囊不该同时出现').toBe(0)

  const mapHeaderBox = await page.locator('header').first().boundingBox()
  expect(mapHeaderBox?.height ?? 0, '地图页顶栏同为 44px').toBeCloseTo(44, 0)

  // 导航行两态一致：都是 52px（A3 零位移的几何前提）
  const navRow = await block.locator('.shell-dock-nav').boundingBox()
  expect(navRow?.height ?? 0, '合成块里的导航行仍 52px').toBeCloseTo(52, 0)

  // 搜索行 40px：只在 /map 出现
  const searchRow = await block.locator('.shell-dock-search').boundingBox()
  expect(searchRow?.height ?? 0, '搜索行 36px').toBeCloseTo(36, 0)
})
