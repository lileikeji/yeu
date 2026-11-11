import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import test from 'node:test'
import {
  freshmanGuides,
  officialClubs,
  officialDepartments
} from '../data/seeds/public-content'
import {
  mergePublicDepartments,
  mergePublicGuides,
  publicClubs
} from '../app/utils/public-catalog'
import { publicContentRoute } from '../server/utils/public-content-route'
import { buildCatalogSeed } from './seed-public-catalog'

function publicContentPath(kind: 'guide' | 'department' | 'club', slug: string): string {
  const encoded = encodeURIComponent(slug)
  if (kind === 'guide') return `/guides/${encoded}`
  if (kind === 'department') return `/departments/${encoded}`
  return `/clubs/${encoded}`
}

function listVueFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = resolve(root, entry)
    if (statSync(fullPath).isDirectory()) return listVueFiles(fullPath)
    return entry.endsWith('.vue') ? [fullPath] : []
  })
}

function staticRouteRefs(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/(?:to|href)="(\/[^"#?]+)"/g)].map(match => match[1]!)
}

function concretePageRoutes(): Set<string> {
  const pagesRoot = resolve('app/pages')
  const generatedRoutes = listVueFiles(pagesRoot)
    .map((file) => {
      const segments = relative(pagesRoot, file)
        .split(sep)
        .map(segment => segment.replace(/\.vue$/, ''))
      if (segments.some(segment => segment.startsWith('['))) return null
      if (segments.at(-1) === 'index') segments.pop()
      return `/${segments.join('/')}`.replace(/\/$/, '') || '/'
    })
    .filter((route): route is string => Boolean(route))

  return new Set([
    ...generatedRoutes,
    '/',
    '/about',
    '/campus',
    '/checklist',
    '/clubs',
    '/contact',
    '/departments',
    '/discover',
    '/dorms',
    '/feedback',
    '/guides',
    '/chat',
    '/login',
    '/map',
    '/me',
    '/nearby',
    '/offline',
    '/panorama',
    '/privacy',
    '/procedures',
    '/search',
    '/sources',
    '/student-rules',
    '/transport',
    '/admin',
    '/admin/login',
    '/admin/procedures',
    '/admin/field-observations'
  ])
}

function routeIsDynamicButBacked(path: string): boolean {
  if (/^\/admin\/[a-z0-9-]+$/.test(path)) return true
  if (/^\/guides\/[a-z0-9-]+$/.test(path)) return true
  if (/^\/departments\/[a-z0-9-]+$/.test(path)) return true
  if (/^\/clubs\/[a-z0-9-]+$/.test(path)) return true
  if (/^\/procedures\/[a-z0-9-]+$/.test(path)) return true
  return /^\/places\/[a-z0-9-]+$/.test(path)
}

test('seeded public guides, departments and clubs have stable detail routes and readable bodies', () => {
  const catalog = buildCatalogSeed()
  const published = catalog.contents.filter(content => (
    content.status === 'published'
    && (content.kind === 'guide' || content.kind === 'department' || content.kind === 'club')
  ))
  assert.equal(published.length, 60)

  const paths = published.map(content => publicContentPath(content.kind, content.slug))
  assert.equal(new Set(paths).size, paths.length)
  assert.ok(paths.every(path => /^\/(guides|departments|clubs)\/[a-z0-9][a-z0-9-]*$/.test(path)))
  assert.ok(paths.every(path => !path.includes('static-department-')))
  assert.ok(published.every(content => content.body.trim().length >= 120))
  assert.ok(published.every(content => content.summary.trim().length > 0))
  assert.ok(published.every(content => content.sourceUrls.length > 0))
})

test('front-end catalog fallbacks expose every seed route without placeholder department slugs', () => {
  const guides = mergePublicGuides(freshmanGuides, [], true)
  const departments = mergePublicDepartments(officialDepartments, [], true)
  const clubs = publicClubs([], officialClubs)

  assert.equal(guides.length, 9)
  assert.equal(departments.length, 27)
  assert.equal(clubs.length, 24)

  assert.ok(guides.every(guide => publicContentPath('guide', guide.slug).startsWith('/guides/')))
  assert.ok(departments.every(department => publicContentPath('department', department.slug).startsWith('/departments/')))
  assert.ok(clubs.every(club => publicContentPath('club', club.slug).startsWith('/clubs/')))

  assert.ok(guides.every(guide => guide.body.trim().length >= 120))
  assert.ok(departments.every(department => department.body.trim().length >= 120))
  assert.ok(clubs.every(club => club.body.trim().length >= 120))
  assert.ok(departments.every(department => !department.slug.startsWith('static-department-')))
})

test('static Nuxt links point to existing pages or backed dynamic routes', () => {
  const pageRoutes = concretePageRoutes()
  const isPublicAsset = (path: string) => /^\/(?:images|icons|fonts|uploads|media|files)\//.test(path)
  // The /__yeu_crawl_trap__ href is a deliberate crawler honeypot, not a nav route.
  const broken = listVueFiles(resolve('app'))
    .flatMap(file => staticRouteRefs(file).map(path => ({ file, path })))
    .filter(({ path }) => (
      !path.startsWith('/__yeu_crawl_trap__')
      && !isPublicAsset(path)
      && !pageRoutes.has(path)
      && !routeIsDynamicButBacked(path)
    ))

  assert.deepEqual(broken, [])
})

test('sitemap only publishes real content detail routes and old content links redirect', () => {
  const sitemap = readFileSync(resolve('server/routes/sitemap.xml.ts'), 'utf8')
  const legacyRoute = readFileSync(resolve('server/routes/content/[slug].ts'), 'utf8')

  assert.doesNotMatch(sitemap, /prefix: '\/content\/'/)
  assert.match(sitemap, /prefix: '\/guides\/'/)
  assert.match(sitemap, /prefix: '\/departments\/'/)
  assert.match(sitemap, /prefix: '\/clubs\/'/)
  assert.match(sitemap, /prefix: '\/places\/'/)
  assert.match(legacyRoute, /publicContentRoute\(content\.kind, slug\)/)
  assert.match(legacyRoute, /sendRedirect\([\s\S]*?, 308\)/)

  assert.equal(publicContentRoute('guide', 'find-campus'), '/guides/find-campus')
  assert.equal(publicContentRoute('department', 'student affairs'), '/departments/student%20affairs')
  assert.equal(publicContentRoute('club', 'computer-association'), '/clubs/computer-association')
  assert.equal(publicContentRoute('notice', 'welcome'), '/campus#notice-welcome')
})

test('the retired more entry sends old links to the current directory', () => {
  const legacyMoreRoute = readFileSync(resolve('server/routes/more.get.ts'), 'utf8')

  assert.match(legacyMoreRoute, /sendRedirect\(event, '\/discover', 308\)/)
})

test('department and club detail pages expose structured freshman decision aids', () => {
  const departmentPage = readFileSync(resolve('app/pages/departments/[slug].vue'), 'utf8')
  const clubPage = readFileSync(resolve('app/pages/clubs/[slug].vue'), 'utf8')

  const departmentPresentation = readFileSync(resolve('app/utils/department-detail-presentation.ts'), 'utf8')
  assert.match(departmentPage, /from ['"]~~\/app\/utils\/department-detail-presentation['"]/)
  assert.match(departmentPage, /extractDepartmentUseCases/)
  assert.match(departmentPage, /buildDepartmentDetailSources/)
  assert.match(departmentPage, /resolveDepartmentVerifiedDate/)
  assert.match(departmentPage, /PublicSourceDetails/)
  assert.doesNotMatch(departmentPage, /function extractDepartmentUseCases/)
  assert.doesNotMatch(departmentPage, /function extractPrefixedParagraph/)
  assert.match(departmentPresentation, /export function extractDepartmentUseCases/)
  assert.match(departmentPresentation, /export function extractPrefixedParagraph/)
  assert.match(departmentPresentation, /新生先看这几件事/)
  assert.match(departmentPresentation, /咨询前准备/)
  assert.match(departmentPresentation, /使用建议/)

  const clubPresentation = readFileSync(resolve('app/utils/club-detail-presentation.ts'), 'utf8')
  assert.match(clubPage, /from ['"]~~\/app\/utils\/club-detail-presentation['"]/)
  assert.match(clubPage, /resolveClubSourceStatusText/)
  assert.match(clubPage, /buildClubDetailSources/)
  assert.match(clubPage, /club\.signupQa/)
  assert.match(clubPage, /<details/)
  assert.match(clubPage, /PublicSourceDetails/)
  assert.doesNotMatch(clubPage, /const signupQuestionChecklist = \[/)
  assert.match(clubPresentation, /export const clubSignupQuestionChecklist/)
  assert.match(clubPresentation, /报名之前问清楚/)
  assert.match(clubPresentation, /是否收费，是否需要自备器材、服装或材料/)
  assert.match(clubPresentation, /是否适合零基础新生/)
  for (const page of [departmentPage, clubPage]) {
    assert.match(page, /复制分享链接/)
    assert.match(page, /ogTitle/)
    assert.match(page, /ogImage/)
    // Share wiring now goes through useShareActions (which internally uses
    // useWechatShareCard) so detail pages stay as thin shells over composables.
    assert.match(page, /useShareActions\(\)/)
    assert.match(page, /sharePage|copyText/)
    assert.match(page, /boxesAt\('after-intro'\)/)
  }
  assert.match(clubPage, /boxesAt\('after-signup'\)/)
  assert.match(departmentPage, /boxesAt\('after-contact'\)/)
})

test('home page and docs expose the expanded procedure catalog instead of only arrival', () => {
  const homeSource = readFileSync(resolve('app/pages/index.vue'), 'utf8')
  const homePresentation = readFileSync(resolve('app/utils/home-presentation.ts'), 'utf8')
  // The home page surfaces the procedure catalog through feature-driven entries
  // (essentialActions / timeline / more entries) wired from home-presentation,
  // which links to the expanded procedure pages rather than a hardcoded arrival-only card.
  assert.match(homeSource, /home-presentation/)
  assert.match(homeSource, /<div class="overflow-x-clip">/)
  assert.match(homePresentation, /\/procedures\/arrival/)
  assert.match(homePresentation, /\/procedures\/campus-network/)
  assert.match(homePresentation, /校园一卡通与网络/)
  assert.match(homePresentation, /快递与外卖/)

  for (const file of ['README.md', 'data/README.md', 'docs/DEPLOYMENT.md']) {
    const source = readFileSync(resolve(file), 'utf8')
    assert.match(source, /校园网与统一认证/)
    assert.match(source, /宿舍.*报修|宿舍维修报修/)
    assert.match(source, /图书馆.*借阅证/)
    assert.match(source, /专升本.*档案/)
    assert.doesNotMatch(source, /只读预检再导入结构化报到流程/)
    assert.doesNotMatch(source, /当前报到流程只录入/)
  }
})

test('procedure detail page does not show arrival-only wording for every procedure', () => {
  const source = readFileSync(resolve('app/pages/procedures/[slug].vue'), 'utf8')
  const presentation = readFileSync(resolve('app/utils/procedure-detail-presentation.ts'), 'utf8')

  assert.match(source, /from ['"]~~\/app\/utils\/procedure-detail-presentation['"]/)
  assert.match(source, /getProcedureNoticeText/)
  assert.match(source, /getProcedureMaterialTitle/)
  assert.match(source, /getProcedureEmptyMaterialText/)
  assert.match(source, /buildProcedureDetailSources/)
  assert.match(source, /resolveProcedureAudienceRouteQuery/)
  assert.match(source, /resolveProcedureChecklistFromStorageText/)
  assert.match(presentation, /export function resolveProcedureStepCompletionPresentation/)
  assert.doesNotMatch(source, /function sourceClaimForStudents/)
  assert.doesNotMatch(source, />\{\{ source\.claimScope \}\}</)
  assert.doesNotMatch(source, />\s*个人时段、材料、报到点和接站仍需查看录取通知书及学校后续通知；这里仅在官方来源确认后更新。\s*</)
  assert.doesNotMatch(source, />\s*2026公开来源尚未给出可核验的个人材料清单。本页不会用往年材料填充；收到录取通知书或当年报到通知后再逐项核对。\s*</)

  assert.match(presentation, /category === 'arrival'/)
  assert.match(presentation, /有些办理入口、材料或时间还没公布/)
  assert.match(presentation, /办理前先看是否需要材料/)
  assert.match(presentation, /学校目前没有列出需要提前准备的个人材料/)
  assert.match(presentation, /export function sourceClaimForStudents\(claimScope: string\)/)
  assert.match(presentation, /这份说明可以确认：/)
  assert.match(presentation, /招生咨询方式和适用范围/)
  assert.match(presentation, /source\.claimScope \? sourceClaimForStudents\(source\.claimScope\)/)
})

test('public search includes imported AMap markers and student-readable labels', () => {
  const source = readFileSync(resolve('app/pages/search.vue'), 'utf8')
  const presentation = readFileSync(resolve('app/utils/public-search-presentation.ts'), 'utf8')

  assert.match(source, /amapImportedPlaces/)
  assert.match(source, /amapImportedAreas/)
  assert.match(source, /public-search-presentation/)
  assert.match(source, /buildPublicSearchResults/)
  assert.match(source, /shouldSkipSearchNavigation/)
  assert.match(source, /resolveSearchNavigationStaleCorrection/)
  assert.match(source, /resolveSearchInputSyncFromRoute/)
  assert.match(source, /usePublicAmapOwnerDraftPlaces/)
  assert.match(source, /mergeAmapImportedPlacesWithDrafts/)
  assert.match(source, /mergePublicMapPlaces\(campusMapReferencePlaces, \[\], ownerMapSeeds\.value, geoCipherKey\)/)
  assert.doesNotMatch(source, /function queryVariants\(value: string\): string\[\]/)
  assert.doesNotMatch(source, /sourceLabel: '后台已发布'/)
  assert.doesNotMatch(source, /sourceLabel: '内置基础指南'/)

  assert.match(presentation, /export function queryVariants\(value: string\): string\[\]/)
  assert.match(presentation, /normalized\.replace\(/)
  assert.match(presentation, /仰恩楼/)
  assert.match(presentation, /仰恩教学楼/)
  assert.match(presentation, /新区学生街/)
  assert.match(presentation, /高德地点/)
  assert.match(presentation, /地图范围/)
  assert.match(presentation, /area=\$\{encodeURIComponent\(area\.id\)\}/)
  assert.match(presentation, /已经放到地图上/)
  assert.match(presentation, /\/map\?q=\$\{encodeURIComponent\(query\)\}&place=/)
})

test('map page can select imported drawn areas directly from route and search text', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const routeSyncSource = readFileSync(resolve('app/composables/useMapRouteSync.ts'), 'utf8')
  const routeStateSource = readFileSync(resolve('app/utils/map-route-state.ts'), 'utf8')
  const providerLifecycleSource = readFileSync(resolve('app/utils/map-provider-lifecycle.ts'), 'utf8')
  // 地图页拆分后：筛选与选点决策归 composable，页面只校验注入后的调用名。
  const filterComposableSource = readFileSync(resolve('app/composables/useMapFilter.ts'), 'utf8')
  const poiComposableSource = readFileSync(resolve('app/composables/useMapPoi.ts'), 'utf8')

  assert.match(filterComposableSource, /filterMapAreasForMapSearch/)
  assert.match(filterComposableSource, /const filteredAreas = computed/)
  assert.match(providerLifecycleSource, /provider\.setSelectedArea\(snapshot\.selectedAreaId\)/)
  assert.match(source, /v-if="selectedArea"\s+class="[^"]*z-30[^"]*"/)
  assert.match(routeStateSource, /mapQueryValue\(query\.area\)/)
  assert.match(routeStateSource, /areas\.find\(candidate => candidate\.id === area\)/)
  assert.match(routeStateSource, /query\.area = state\.selectedAreaId/)
  assert.match(routeSyncSource, /options\.selectedArea\.value = state\.selectedArea/)
  assert.match(routeSyncSource, /resolveMapRouteApplyDecision/)
  assert.doesNotMatch(routeSyncSource, /selectionIsVisible/)
  assert.match(source, /selectArea\(apply\.targetArea\)/)
  assert.match(source, /resolveAutoSelectSearchApply/)
  assert.match(source, /resolveAutoSelectSearchDecision/)
  assert.match(poiComposableSource, /resolveClosePoiDetailsDecision/)
  assert.match(filterComposableSource, /resolveSetCategoryDecision/)
  assert.match(filterComposableSource, /resolveFitToVisiblePoisDecision/)
  assert.match(source, /resolveSearchQueryChangeReset/)
  assert.match(poiComposableSource, /resolveSelectPoiApplyDecision/)
  assert.match(poiComposableSource, /resolveMapPoiClickApply/)
  assert.match(poiComposableSource, /resolveSelectOfficialPlanNumberDecision/)
  assert.doesNotMatch(source, /selectArea\(targetArea!\)/)
})

test('map selected-place details explain how students should use unverified and temporary points', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const mapPresentation = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')
  const placeDetailsSource = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')
  // poiUseChecklist 的实现搬进 useMapPoi：页面只解构注入后的函数名。
  const poiComposableSource = readFileSync(resolve('app/composables/useMapPoi.ts'), 'utf8')

  assert.match(source, /from ['"]~~\/app\/utils\/map-presentation['"]/)
  assert.match(poiComposableSource, /function poiUseChecklist\(poi: PublicMapPlace\): string\[\]/)
  assert.match(poiComposableSource, /return buildMapPoiUseChecklist\(poi\)/)
  assert.match(placeDetailsSource, /到这里前先确认/)
  assert.match(mapPresentation, /可导航到附近，末段看门牌/)
  assert.match(mapPresentation, /取件码为准，品牌窗口不同/)
  assert.match(mapPresentation, /营业与价格到店确认/)
  assert.match(mapPresentation, /当前页面内的结果/)
})

test('student-facing pages do not expose maintenance-only map and backend wording', () => {
  const files = [
    'app/pages/index.vue',
    'app/pages/guides/index.vue',
    'app/pages/guides/[slug].vue',
    'app/pages/campus.vue',
    'app/pages/map/index.vue',
    'app/components/map/PlaceDetailsPanel.vue',
    'app/pages/sources.vue',
    'app/utils/public-catalog.ts',
    'app/utils/home-presentation.ts',
    'app/utils/place-detail-presentation.ts',
    'app/utils/campus-presentation.ts',
    'app/utils/map-presentation.ts',
    'app/utils/guide-detail-presentation.ts',
    'app/utils/department-detail-presentation.ts',
    'app/utils/sources-presentation.ts',
    'app/utils/club-detail-presentation.ts',
    'app/utils/guide-list-presentation.ts',
    'app/utils/procedure-list-presentation.ts',
    'app/utils/about-presentation.ts',
    'app/utils/discover-presentation.ts',
    'app/utils/offline-presentation.ts',
    'app/utils/privacy-presentation.ts',
    'app/utils/source-context-presentation.ts'
  ]
  const source = files.map(file => readFileSync(resolve(file), 'utf8')).join('\n')

  assert.doesNotMatch(source, /WIA 工作地图/)
  assert.doesNotMatch(source, /后台尚未/)
  assert.doesNotMatch(source, /内置基础指南/)
  assert.doesNotMatch(source, /后台暂无/)
  assert.doesNotMatch(source, /导出文件没有经纬度/)
  assert.doesNotMatch(source, /不会绘制导航点/)
  assert.doesNotMatch(source, /高德 GCJ-02 坐标显示/)
  assert.doesNotMatch(source, /候选校界 relation/)
  assert.doesNotMatch(source, /WGS84 坐标已核验/)
  assert.doesNotMatch(source, /学校官网原图|社区地图预览|检查网络和地图配置/)
  assert.doesNotMatch(source, /地图内路线/)
  assert.match(source, /学校平面图/)
  assert.match(source, /校园范围参考/)
  assert.match(source, /可重试，或先看平面图与清单/)
  assert.match(source, /高德地图位置/)
})

test('guide list page is a thin shell over guide-list presentation', () => {
  const page = readFileSync(resolve('app/pages/guides/index.vue'), 'utf8')
  const presentation = readFileSync(resolve('app/utils/guide-list-presentation.ts'), 'utf8')
  assert.match(page, /from ['"]~~\/app\/utils\/guide-list-presentation['"]/)
  assert.match(page, /filterGuideListItems/)
  assert.match(page, /resolveGuideListFallbackMessage/)
  assert.match(page, /guideListCategories/)
  assert.match(page, /guideCategoryIconTones/)
  assert.doesNotMatch(page, /const categories = \[/)
  assert.doesNotMatch(page, /const iconTone:/)
  assert.doesNotMatch(page, /function filterGuideListItems/)
  assert.match(presentation, /export const guideListCategories/)
  assert.match(presentation, /export function filterGuideListItems/)
  assert.match(presentation, /export function resolveGuideListFallbackMessage/)
  assert.match(presentation, /可以稍后再试，也可以先查看校园地图和常用部门/)
  assert.match(page, /指南暂时没有显示出来/)
  assert.match(page, /label="重新试一次"/)
  assert.match(presentation, /指南为整理稿/)
  assert.match(presentation, /指南还在整理，过一会再来看看/)
})

test('global public copy describes the student project in ordinary language', () => {
  const layout = readFileSync(resolve('app/layouts/default.vue'), 'utf8')
  const about = readFileSync(resolve('app/pages/about.vue'), 'utf8')

  assert.match(layout, /个人整理，非学校官方发布/)
  assert.doesNotMatch(layout, /学生团队维护的非官方指南/)
  assert.match(about, /内容由学生个人整理/)
  assert.doesNotMatch(about, /个人或学生团队维护/)
})

test('procedure list page is a thin shell over procedure-list presentation', () => {
  const page = readFileSync(resolve('app/pages/procedures/index.vue'), 'utf8')
  const presentation = readFileSync(resolve('app/utils/procedure-list-presentation.ts'), 'utf8')
  assert.match(page, /from ['"]~~\/app\/utils\/procedure-list-presentation['"]/)
  assert.match(page, /filterProcedureListItems/)
  assert.match(page, /procedureListAudienceOptions/)
  assert.match(page, /procedureMethodLabel/)
  assert.match(page, /procedureListDetailQuery/)
  assert.match(page, /procedureListMessages/)
  assert.doesNotMatch(page, /const audienceOptions = \[/)
  assert.doesNotMatch(page, /const methodLabel = \{/)
  assert.doesNotMatch(page, /const keyword = query\.value\.trim/)
  assert.match(presentation, /export const procedureListAudienceOptions/)
  assert.match(presentation, /procedureMethodLabels/)
  assert.match(presentation, /from ['"]\.\/procedure-detail-presentation['"]/)
  assert.match(presentation, /export function filterProcedureListItems/)
  assert.match(presentation, /export function procedureListDetailQuery/)
  assert.match(presentation, /全部新生/)
  assert.match(page, /办事信息暂时没有显示出来/)
  assert.match(presentation, /可以稍后再试，也可以先查看入学指南/)
  assert.match(presentation, /没有找到你要办的事/)
  assert.match(page, /label="重新试一次"/)
  assert.match(page, /label="清除条件"/)
})

test('about page is a thin shell over about presentation', () => {
  const page = readFileSync(resolve('app/pages/about.vue'), 'utf8')
  const presentation = readFileSync(resolve('app/utils/about-presentation.ts'), 'utf8')
  assert.match(page, /from ['"]~~\/app\/utils\/about-presentation['"]/)
  assert.match(page, /aboutProjectFacts/)
  assert.match(page, /aboutBoundaries/)
  assert.match(page, /aboutGovernanceLinks/)
  assert.doesNotMatch(page, /const projectFacts = \[/)
  assert.doesNotMatch(page, /const boundaries = \[/)
  assert.doesNotMatch(page, /const governanceLinks = \[/)
  assert.match(presentation, /export const aboutProjectFacts/)
  assert.match(presentation, /export const aboutBoundaries/)
  assert.match(presentation, /export const aboutGovernanceLinks/)
  assert.match(presentation, /学校通知优先/)
  assert.match(presentation, /告诉我们哪里不对/)
})

test('discover page is a thin shell over discover presentation', () => {
  const page = readFileSync(resolve('app/pages/discover.vue'), 'utf8')
  const presentation = readFileSync(resolve('app/utils/discover-presentation.ts'), 'utf8')
  assert.match(page, /from ['"]~~\/app\/utils\/discover-presentation['"]/)
  assert.match(page, /discoverTaskEntries/)
  assert.match(page, /discoverDirectoryEntries/)
  assert.match(page, /discoverTrustEntries/)
  assert.doesNotMatch(page, /const taskEntries = \[/)
  assert.doesNotMatch(page, /const directoryEntries = \[/)
  assert.doesNotMatch(page, /const trustEntries = \[/)
  assert.match(presentation, /export const discoverTaskEntries/)
  assert.match(presentation, /export const discoverDirectoryEntries/)
  assert.match(presentation, /export const discoverTrustEntries/)
  assert.match(presentation, /export function buildDiscoverTaskPreview/)
  assert.match(presentation, /新生报到/)
  assert.match(presentation, /告诉我们哪里不对/)
})

test('offline page is a thin shell over offline presentation', () => {
  const page = readFileSync(resolve('app/pages/offline.vue'), 'utf8')
  const presentation = readFileSync(resolve('app/utils/offline-presentation.ts'), 'utf8')
  assert.match(page, /from ['"]~~\/app\/utils\/offline-presentation['"]/)
  assert.match(page, /offlineBoundaries/)
  assert.match(page, /offlineStaticEntries/)
  assert.match(page, /resolveOfflineStatus/)
  assert.doesNotMatch(page, /const offlineBoundaries = \[/)
  assert.doesNotMatch(page, /const staticEntries = \[/)
  assert.match(presentation, /export const offlineBoundaries/)
  assert.match(presentation, /export const offlineStaticEntries/)
  assert.match(presentation, /export function resolveOfflineStatus/)
  assert.match(presentation, /报到安排要重新确认/)
  assert.match(presentation, /还没有连上网络/)
  assert.doesNotMatch(presentation, /地图瓦片|旧缓存/)
})

test('checklist page is a thin shell over checklist presentation', () => {
  const page = readFileSync(resolve('app/pages/checklist.vue'), 'utf8')
  const presentation = readFileSync(resolve('app/utils/checklist-presentation.ts'), 'utf8')
  // 目录与纯函数已抽到 shared，供网页与小程序共用；app 侧只做转发。
  const catalog = readFileSync(resolve('shared/utils/checklist-catalog.ts'), 'utf8')
  assert.match(page, /from ['"]~~\/app\/utils\/checklist-presentation['"]/)
  assert.match(page, /useFreshmanChecklist/)
  assert.match(page, /checklistAudienceOptions/)
  assert.match(presentation, /shared\/utils\/checklist-catalog/)
  assert.match(catalog, /export const checklistItems/)
  assert.match(catalog, /export function buildChecklistOverview/)
})

test('privacy page is a thin shell over privacy presentation', () => {
  const page = readFileSync(resolve('app/pages/privacy.vue'), 'utf8')
  const presentation = readFileSync(resolve('app/utils/privacy-presentation.ts'), 'utf8')
  assert.match(page, /from ['"]~~\/app\/utils\/privacy-presentation['"]/)
  assert.match(page, /privacySections/)
  assert.match(page, /privacyHighlights/)
  assert.doesNotMatch(page, /const sections = \[/)
  assert.match(presentation, /export const privacySections/)
  assert.match(presentation, /浏览和定位/)
  assert.match(presentation, /网站安全与访问记录/)
  assert.match(presentation, /一串随机编号/)
  assert.match(presentation, /不能倒推出原地址的编号/)
  assert.match(presentation, /730 天/)
})

test('public source and place pages use student-facing data status wording', () => {
  const sourcePage = readFileSync(resolve('app/pages/sources.vue'), 'utf8')
  const placePage = readFileSync(resolve('app/pages/places/[slug].vue'), 'utf8')
  const placePresentation = readFileSync(resolve('app/utils/place-detail-presentation.ts'), 'utf8')
  const sharedPlacePresentation = readFileSync(resolve('shared/utils/place-presentation.ts'), 'utf8')
  assert.match(placePage, /from ['"]~~\/app\/utils\/place-detail-presentation['"]/)
  assert.match(placePresentation, /export function isPlaceCoordinateVerified/)
  assert.match(placePresentation, /export function buildPlaceFallbackUseChecklist/)
  const mapPage = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const mapPresentation = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')

  const sourcesPresentation = readFileSync(resolve('app/utils/sources-presentation.ts'), 'utf8')
  assert.match(sourcePage, /from ['"]~~\/app\/utils\/sources-presentation['"]/)
  assert.match(sourcePage, /collectActiveLinkedSources/)
  assert.match(sourcePage, /sourceLevelGuides/)
  assert.match(sourcePage, /sourceLevelLabels/)
  assert.match(sourcePage, /校园消息，<span class="block sm:inline">先看能不能直接用<\/span>/)
  assert.match(sourcePage, /地图边界只用来辨认方向/)
  assert.match(sourcePage, /了解社区地图/)
  assert.match(sourcesPresentation, /找地点和生活经验/)
  assert.match(sourcesPresentation, /营业、收费和办事要求看现场/)
  assert.match(sourcesPresentation, /export function collectActiveLinkedSources/)
  assert.doesNotMatch(sourcePage, /function dateOnly/)
  assert.doesNotMatch(sourcePage, /const sourceLevels =/)
  assert.doesNotMatch(sourcePage, /来源、核验与使用边界/)
  assert.doesNotMatch(sourcePage, /高德 GCJ-02 坐标显示/)
  assert.doesNotMatch(sourcePage, /候选校界 relation/)
  assert.doesNotMatch(sourcePage, /\{\{ source\.sourceLevel \}\}/)

  assert.match(placePage, /navigationStatusLabel/)
  assert.match(sharedPlacePresentation, /可直接导航/)
  assert.match(sharedPlacePresentation, /入口以现场为准/)
  assert.match(placePage, /查看地图/)
  assert.match(placePage, /开始导航/)
  assert.match(placePage, /PublicSourceDetails/)
  assert.match(placePage, /resolvePlaceStudentSummary/)
  assert.match(placePage, /告诉我们哪里不对/)
  assert.doesNotMatch(placePage, /经纬度/)
  assert.doesNotMatch(placePage, /\{\{ place\.coordinateSystem \}\}/)

  assert.match(mapPage, /from ['"]~~\/app\/utils\/map-presentation['"]/)
  // 状态文案解析搬进 useMapPoi，页面只渲染注入后的 poiStatusText。
  assert.match(readFileSync(resolve('app/composables/useMapPoi.ts'), 'utf8'), /resolveMapPoiStatusText/)
  assert.match(mapPresentation, /可直接导航/)
  assert.match(mapPresentation, /已有位置 · 暂时无法在地图显示/)
  assert.doesNotMatch(mapPage, /WGS84 坐标已核验/)
  assert.doesNotMatch(mapPresentation, /WGS84 坐标已核验/)
})

test('student-facing nearby pages use reader-facing wording', () => {
  const files = [
    'app/pages/nearby.vue',
    'app/utils/nearby-presentation.ts'
  ]
  const source = files.map(file => readFileSync(resolve(file), 'utf8')).join('\n')

  assert.match(source, /从下课随手吃，到周末出去玩/)
  assert.match(source, /附近这些地方可以先看看/)
  assert.doesNotMatch(source, /高德候选 · 待核验/)
  assert.doesNotMatch(source, /待实地核验候选/)
  assert.doesNotMatch(source, /社交平台待核验素材/)
  assert.doesNotMatch(source, /张待核验图|张待确认图/)
  assert.doesNotMatch(source, /核验候选/)
  assert.doesNotMatch(source, /本站介绍|地图结果|单独整理的商铺介绍/)
  assert.doesNotMatch(source, /research-only|AI 重构|内部事实核验|视觉重构|发布确认/)
})
