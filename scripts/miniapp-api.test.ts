import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isMiniAppPostRoute, isMiniAppReadRoute, MINIAPP_API_PREFIX } from '../server/utils/miniapp'
import { miniappTelemetrySchema } from '../shared/schemas/server'
import { normalizeMiniappTelemetryMeta, normalizeVisitorPath } from '../server/modules/visitors/service'
import { adminCapabilities, hasAdminCapability } from '../server/utils/auth'

test('miniapp route policy only allows known GET endpoints', () => {
  for (const path of [
    'home',
    'places',
    'places/campus-map',
    'guides',
    'guides/welcome',
    'procedures',
    'procedures/check-in',
    'notices',
    'notices/holiday',
    'departments',
    'departments/admissions',
    'clubs',
    'clubs/computer',
    'search',
    'directions/walking',
    'nearby'
  ]) {
    assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}${path}`, 'GET'), true, path)
  }
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}places/?page=1`, 'GET'), true)
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}places/`, 'GET'), true)
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}places`, 'POST'), false)
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}track`, 'GET'), false)
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}unknown`, 'GET'), false)
  assert.equal(isMiniAppReadRoute('/api/miniapp/v1', 'GET'), false)
  assert.equal(isMiniAppReadRoute('/api/miniapp/v2/places', 'GET'), false)
  assert.equal(isMiniAppReadRoute('/api/public/places', 'GET'), false)
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}places/a/b`, 'GET'), false)
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}places`, 'OPTIONS'), false)
  // 路线规划只读，但不能开成任意坐标代理：只认 walking 这一条固定路径。
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}directions/driving`, 'GET'), false)
  assert.equal(isMiniAppReadRoute(`${MINIAPP_API_PREFIX}directions/walking`, 'POST'), false)
})

test('miniapp API exposes only read-only handlers', () => {
  const files = [
    'server/api/miniapp/v1/home.get.ts',
    'server/api/miniapp/v1/places/index.get.ts',
    'server/api/miniapp/v1/places/[slug].get.ts',
    'server/api/miniapp/v1/guides/index.get.ts',
    'server/api/miniapp/v1/guides/[slug].get.ts',
    'server/api/miniapp/v1/procedures/index.get.ts',
    'server/api/miniapp/v1/procedures/[slug].get.ts',
    'server/api/miniapp/v1/notices/index.get.ts',
    'server/api/miniapp/v1/notices/[slug].get.ts',
    'server/api/miniapp/v1/search.get.ts',
    'server/api/miniapp/v1/directions/walking.get.ts',
    'server/api/miniapp/v1/nearby/index.get.ts'
  ]
  for (const file of files) {
    assert.match(readFileSync(file, 'utf8'), /defineEventHandler/)
    assert.doesNotMatch(file, /\.post\.ts$/)
  }
})

test('miniapp POST exception covers only telemetry and ai assistant', () => {
  assert.equal(isMiniAppPostRoute(`${MINIAPP_API_PREFIX}track`, 'POST'), true)
  assert.equal(isMiniAppPostRoute(`${MINIAPP_API_PREFIX}assistant`, 'POST'), true)
  assert.equal(isMiniAppPostRoute(`${MINIAPP_API_PREFIX}assistant`, 'GET'), false)
  assert.equal(isMiniAppPostRoute(`${MINIAPP_API_PREFIX}places`, 'POST'), false)
  assert.equal(isMiniAppPostRoute(`${MINIAPP_API_PREFIX}assistant/extra`, 'POST'), false)
  assert.equal(isMiniAppPostRoute('/api/public/assistant', 'POST'), false)
})

test('origin guard bypass is narrow and method-gated', () => {
  const source = readFileSync('server/middleware/01-api-origin-guard.ts', 'utf8')
  assert.match(source, /isMiniAppReadRoute\(pathname, method\)/)
  assert.match(source, /isMiniAppPostRoute\(pathname, method\)/)
  assert.match(source, /assertApiOrigin\(event\)/)
})

test('miniapp API has an independent rate-limit middleware', () => {
  const source = readFileSync('server/middleware/miniapp-api-rate-limit.ts', 'utf8')
  assert.match(source, /miniapp-api:/)
  assert.match(source, /600/)
})

test('miniapp POST handlers keep their own rate limits', () => {
  const track = readFileSync('server/api/miniapp/v1/track.post.ts', 'utf8')
  assert.match(track, /miniappTelemetrySchema/)
  assert.match(track, /assertRateLimit\(event, `miniapp-track:/)

  const assistant = readFileSync('server/api/miniapp/v1/assistant.post.ts', 'utf8')
  assert.match(assistant, /assistantQuestionSchema/)
  assert.match(assistant, /assertRateLimit\(event, `miniapp-assistant:/)
  assert.match(assistant, /answerCampusQuestion/)
  // 与网页共用同一套网关配置，避免两处 config 漂移。
  assert.match(assistant, /assistantConfigFromRuntime/)
  const publicAssistant = readFileSync('server/api/public/assistant.post.ts', 'utf8')
  assert.match(publicAssistant, /assistantConfigFromRuntime/)
})

test('telemetry schema rejects external paths and oversized metadata', () => {
  assert.equal(miniappTelemetrySchema.safeParse({ action: 'page_view', pathname: 'https://example.com' }).success, false)
  assert.equal(miniappTelemetrySchema.safeParse({ action: 'page_view', pathname: '/pages/index/index' }).success, true)
  const oversized = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`key-${index}`, true]))
  assert.equal(miniappTelemetrySchema.safeParse({ action: 'page_view', pathname: '/', meta: oversized }).success, false)
})

test('visitor telemetry normalization removes unsafe values and normalizes paths', () => {
  assert.equal(normalizeVisitorPath('/pages//search/index?query=secret'), '/pages/search/index')
  assert.equal(normalizeVisitorPath('https://example.com/pages/index/index?q=secret'), '/pages/index/index')
  assert.equal(normalizeVisitorPath('javascript:alert(1)'), '/')
  const meta = normalizeMiniappTelemetryMeta({
    api: 'https://example.com/api/private?token=secret',
    source: '  develop\u0000ment ',
    status: 200,
    latency: 120.6,
    ignored: 'drop'
  }, 'request-123')
  assert.equal(meta.api, undefined)
  assert.equal(meta.source, 'development')
  assert.equal(meta.status, 200)
  assert.equal(meta.latency, 120.6)
  assert.equal(meta.requestId, 'request-123')
  assert.equal('ignored' in meta, false)
})

test('miniapp manifest and page contracts cover the read-only task surface', () => {
  const pages = JSON.parse(readFileSync('miniapp/pages.json', 'utf8')) as {
    pages: Array<{ path: string }>
    tabBar: { list: Array<{ pagePath: string, iconPath?: string, selectedIconPath?: string }> }
    globalStyle: { enablePullDownRefresh: boolean }
  }
  const pagePaths = new Set(pages.pages.map(page => page.path))
  for (const path of [
    'pages/index/index',
    'pages/map/index',
    'pages/guides/index',
    'pages/guides/detail',
    'pages/places/detail',
    'pages/search/index',
    'pages/services/index',
    'pages/checklist/index',
    'pages/departments/index',
    'pages/clubs/index',
    'pages/nearby/index',
    'pages/dorms/index',
    'pages/panorama/index',
    'pages/procedures/index',
    'pages/procedures/detail',
    'pages/notices/index',
    'pages/about/index'
  ]) assert.equal(pagePaths.has(path), true, path)
  assert.deepEqual(pages.tabBar.list.map(item => item.pagePath), [
    'pages/index/index',
    'pages/map/index',
    'pages/guides/index',
    'pages/services/index',
    'pages/search/index'
  ])
  // 每个 tab 都必须有图标（小程序端会显示默认占位图，所以这里当作契约检查）。
  for (const item of pages.tabBar.list) {
    assert.match((item as { iconPath?: string }).iconPath ?? '', /^static\/tab-.+\.png$/, item.pagePath)
    assert.match((item as { selectedIconPath?: string }).selectedIconPath ?? '', /^static\/tab-.+-active\.png$/, item.pagePath)
  }
  assert.equal(pages.globalStyle.enablePullDownRefresh, true)
})

test('miniapp declares the getLocation privacy scope it actually uses', () => {
  // 地图页调 uni.getLocation；微信要求声明 requiredPrivateInfos + scope.userLocation，
  // 缺了的话真机上 getLocation 直接失败，提审也会被卡。
  const manifest = JSON.parse(readFileSync('miniapp/manifest.json', 'utf8')) as {
    'mp-weixin': {
      requiredPrivateInfos?: string[]
      permission?: Record<string, { desc?: string }>
    }
  }
  const weixin = manifest['mp-weixin']
  assert.deepEqual(weixin.requiredPrivateInfos, ['getLocation'])
  assert.match(weixin.permission?.['scope.userLocation']?.desc ?? '', /位置/)

  // manifest.config.ts 是手工同步的副本，两边不能漂移。
  const config = readFileSync('miniapp/manifest.config.ts', 'utf8')
  assert.match(config, /requiredPrivateInfos:\s*\['getLocation'\]/)
  assert.match(config, /'scope\.userLocation'/)

  // 用到的隐私接口必须和声明一致，避免声明了却没写进 requiredPrivateInfos。
  const mapPage = readFileSync('miniapp/pages/map/index.vue', 'utf8')
  assert.match(mapPage, /uni\.getLocation\(/)
  for (const api of ['chooseLocation', 'getUserProfile', 'getUserInfo', 'chooseImage', 'chooseMedia']) {
    assert.doesNotMatch(mapPage, new RegExp(`wx\\.${api}|uni\\.${api}`), api)
  }
})

test('miniapp pages expose retry, provenance, freshness, and native failure exits', () => {
  const source = (file: string) => readFileSync(file, 'utf8')
  assert.match(source('miniapp/components/StateView.vue'), /retryDisabled|retryLoading/)
  assert.match(source('miniapp/pages/places/detail.vue'), /sources|lastVerifiedAt|coordinateVerifiedAt/)
  assert.match(source('miniapp/pages/guides/detail.vue'), /sources|lastVerifiedAt/)
  assert.match(source('miniapp/pages/procedures/detail.vue'), /sources|lastVerifiedAt|deadlineText/)
  assert.match(source('miniapp/pages/map/index.vue'), /@error="handleMapError"|MAP_RENDER_FAILED/)
  assert.match(source('miniapp/utils/navigation.ts'), /uni\.openLocation|地图打开失败/)
  assert.match(source('miniapp/pages/search/index.vue'), /features|openFeature/)
  assert.match(source('miniapp/services/catalog.ts'), /getNotice[\s\S]*api\/miniapp\/v1\/notices/)
  assert.match(source('server/api/miniapp/v1/notices/[slug].get.ts'), /getPublicNotice/)
  assert.match(source('miniapp/pages/guides/detail.vue'), /confirmationCount|notice-actions/)
})

test('miniapp analytics and feature controls are wired to the admin surface', () => {
  const home = readFileSync('miniapp/pages/index/index.vue', 'utf8')
  const analytics = readFileSync('server/api/admin/miniapp/analytics.get.ts', 'utf8')
  const adminPage = readFileSync('app/pages/admin/miniapp.vue', 'utf8')
  assert.match(home, /disabledKeys|placements|sortOrders/)
  assert.match(home, /onPullDownRefresh|page_view/)
  assert.match(analytics, /analytics\.view/)
  assert.match(analytics, /visitor\.source/)
  assert.match(analytics, /api_metrics\.view/)
  assert.match(analytics, /analytics\.miniapp_raw_view/)
  assert.match(adminPage, /接口状态与延迟|版本与设备|原始字段/)
})

test('admin capability matrix keeps organization analytics aggregate-only', () => {
  const superSession = { admin: { role: 'super' } } as Parameters<typeof adminCapabilities>[0]
  const organizationSession = { admin: { role: 'organization' } } as Parameters<typeof adminCapabilities>[0]
  assert.equal(adminCapabilities(superSession).includes('visitor.raw_ua'), true)
  assert.deepEqual(adminCapabilities(organizationSession), ['analytics.view'])
  assert.equal(hasAdminCapability(organizationSession, 'analytics.view'), true)
  assert.equal(hasAdminCapability(organizationSession, 'visitor.raw_ip'), false)
})

test('miniapp map and detail pages render Chinese presentation, never raw enums', () => {
  const source = (file: string) => readFileSync(file, 'utf8')
  const map = source('miniapp/pages/map/index.vue')
  assert.match(map, /MAP_CATEGORY_LABELS/)
  assert.match(map, /mapCategoryFromPlaceType/)
  assert.match(map, /marker\/pin-/)
  assert.match(map, /enable-clustering/)
  assert.match(map, /toMapCoordinate/)
  assert.doesNotMatch(map, /place\.category \|\| place\.type\s*\)\)/)
  assert.match(map, /getLocation/)
  assert.match(map, /LOCATION_DENIED/)
  assert.match(source('miniapp/pages/places/detail.vue'), /resolveCoordinateVerificationLabel|resolvePlaceStudentSummary/)
  assert.doesNotMatch(source('miniapp/pages/places/detail.vue'), /place\.coordinateVerification \}\}/)
  assert.match(source('miniapp/components/ContentBlocks.vue'), /parseContentBlocks/)
  assert.match(source('miniapp/components/PlaceCard.vue'), /resolvePlaceCategoryLabel/)
})

test('miniapp home surfaces the pinned notice and recent history', () => {
  const home = readFileSync('miniapp/pages/index/index.vue', 'utf8')
  assert.match(home, /listNotices/)
  // 置顶公告会顶到轮播第一屏，所以首页仍按 pinned 排序取第一条。
  assert.match(home, /pinned/)
  assert.match(home, /readRecent|rememberRecent/)
  assert.match(home, /openNotice/)
  assert.doesNotMatch(home, /index === 0/)
})

test('telemetry keeps identifying fields and dedupes page_view', () => {
  const visitors = readFileSync('server/modules/visitors/service.ts', 'utf8')
  for (const key of ['entityType', 'kind', 'slug', 'id', 'target', 'queryLength', 'hasPlace', 'hasCoordinate', 'success', 'map']) {
    assert.match(visitors, new RegExp(`'${key}'`), key)
  }
  assert.match(visitors, /MINIAPP_PAGE_VIEW_DEDUPE_WINDOW_MS/)
  assert.match(visitors, /eq\(visitorEvents\.action, 'page_view'\)/)
  assert.match(visitors, /p50:/)
})

test('admin miniapp analytics renders events, sources, device breakdown and raw fields', () => {
  const page = readFileSync('app/pages/admin/miniapp.vue', 'utf8')
  assert.match(page, /data\.events/)
  assert.match(page, /data\.sources/)
  assert.match(page, /data\.userAgents/)
  assert.match(page, /latencyMs\.p50/)
  assert.match(page, /data\.raw\.userAgents/)
  assert.match(page, /data\.raw\.ips/)
})

