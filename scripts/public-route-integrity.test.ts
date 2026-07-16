import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
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
  return new Set([
    '/',
    '/about',
    '/campus',
    '/clubs',
    '/departments',
    '/discover',
    '/feedback',
    '/guides',
    '/map',
    '/nearby',
    '/offline',
    '/privacy',
    '/procedures',
    '/research/xiaohongshu-images',
    '/search',
    '/sources',
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
  assert.equal(published.length, 58)

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

  assert.equal(guides.length, 8)
  assert.equal(departments.length, 27)
  assert.equal(clubs.length, 23)

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
  const broken = listVueFiles(resolve('app'))
    .flatMap(file => staticRouteRefs(file).map(path => ({ file, path })))
    .filter(({ path }) => !pageRoutes.has(path) && !routeIsDynamicButBacked(path))

  assert.deepEqual(broken, [])
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
  assert.match(clubPage, /clubSignupQuestionChecklist/)
  assert.match(clubPage, /PublicSourceDetails/)
  assert.doesNotMatch(clubPage, /const signupQuestionChecklist = \[/)
  assert.match(clubPresentation, /export const clubSignupQuestionChecklist/)
  assert.match(clubPresentation, /入群或报名之前先问清楚/)
  assert.match(clubPresentation, /是否收费，是否需要自备器材、服装或材料/)
  assert.match(clubPresentation, /是否适合零基础新生/)
})

test('home page and docs expose the expanded procedure catalog instead of only arrival', () => {
  const homeSource = readFileSync(resolve('app/pages/index.vue'), 'utf8')
  const homePresentation = readFileSync(resolve('app/utils/home-presentation.ts'), 'utf8')
  assert.match(homeSource, /const procedureRequest = usePublicProcedureList\(\)/)
  assert.match(homeSource, /featuredProcedures/)
  assert.match(homeSource, /buildHomeFeaturedProcedures/)
  assert.match(homeSource, /先做这四件事/)
  assert.match(homeSource, /不知道先看什么，就按这三步/)
  assert.match(homePresentation, /校园卡与网络/)
  assert.match(homePresentation, /快递与外卖/)
  assert.match(homePresentation, /\/procedures\/\$\{encodeURIComponent\(procedure\.slug\)\}/)

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
  assert.doesNotMatch(source, /function sourceClaimForStudents/)
  assert.doesNotMatch(source, />\{\{ source\.claimScope \}\}</)
  assert.doesNotMatch(source, />\s*个人时段、材料、报到点和接站仍需查看录取通知书及学校后续通知；这里仅在官方来源确认后更新。\s*</)
  assert.doesNotMatch(source, />\s*2026公开来源尚未给出可核验的个人材料清单。本页不会用往年材料填充；收到录取通知书或当年报到通知后再逐项核对。\s*</)

  assert.match(presentation, /category === 'arrival'/)
  assert.match(presentation, /办理入口、材料要求、时间窗口或负责窗口/)
  assert.match(presentation, /办理前先看是否需要材料/)
  assert.match(presentation, /当前公开来源没有列出需要提前准备的个人材料/)
  assert.match(presentation, /export function sourceClaimForStudents\(claimScope: string\)/)
  assert.match(presentation, /这条来源主要确认：/)
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
  assert.match(source, /usePublicAmapOwnerDraftPlaces/)
  assert.match(source, /mergeAmapImportedPlacesWithDrafts/)
  assert.match(source, /mergePublicMapPlaces\(campusMapReferencePlaces, \[\], ownerMapSeeds\.value\)/)
  assert.doesNotMatch(source, /function queryVariants\(value: string\): string\[\]/)
  assert.doesNotMatch(source, /sourceLabel: '后台已发布'/)
  assert.doesNotMatch(source, /sourceLabel: '内置基础指南'/)

  assert.match(presentation, /export function queryVariants\(value: string\): string\[\]/)
  assert.match(presentation, /normalized\.replace\(/)
  assert.match(presentation, /仰恩楼/)
  assert.match(presentation, /仰恩教学楼/)
  assert.match(presentation, /新区学生街/)
  assert.match(presentation, /高德地图标点/)
  assert.match(presentation, /高德绘图区域/)
  assert.match(presentation, /area=\$\{encodeURIComponent\(area\.id\)\}/)
  assert.match(presentation, /已按你提供的高德坐标放到地图上/)
  assert.match(presentation, /\/map\?q=\$\{encodeURIComponent\(query\)\}&place=/)
})

test('map page can select imported drawn areas directly from route and search text', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const routeSyncSource = readFileSync(resolve('app/composables/useMapRouteSync.ts'), 'utf8')
  const routeStateSource = readFileSync(resolve('app/utils/map-route-state.ts'), 'utf8')
  const providerLifecycleSource = readFileSync(resolve('app/utils/map-provider-lifecycle.ts'), 'utf8')

  assert.match(source, /filterMapAreasForMapSearch/)
  assert.match(source, /const filteredAreas = computed/)
  assert.match(providerLifecycleSource, /provider\.setSelectedArea\(snapshot\.selectedAreaId\)/)
  assert.match(source, /v-if="selectedArea"\s+class="[^"]*z-30[^"]*"/)
  assert.match(routeStateSource, /mapQueryValue\(query\.area\)/)
  assert.match(routeStateSource, /areas\.find\(candidate => candidate\.id === area\)/)
  assert.match(routeStateSource, /query\.area = state\.selectedAreaId/)
  assert.match(routeSyncSource, /options\.selectedArea\.value = state\.selectedArea/)
  assert.match(source, /selectArea\(decision\.targetArea\)/)
  assert.match(source, /resolveAutoSelectSearchDecision/)
  assert.doesNotMatch(source, /selectArea\(targetArea!\)/)
})

test('map selected-place details explain how students should use unverified and temporary points', () => {
  const source = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  const mapPresentation = readFileSync(resolve('app/utils/map-presentation.ts'), 'utf8')
  const placeDetailsSource = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')

  assert.match(source, /from ['"]~~\/app\/utils\/map-presentation['"]/)
  assert.match(source, /function poiUseChecklist\(poi: PublicMapPlace\): string\[\]/)
  assert.match(source, /return buildMapPoiUseChecklist\(poi\)/)
  assert.match(placeDetailsSource, /到这里前先确认/)
  assert.match(mapPresentation, /这个点来自你提供的高德地图标点，可以先导航到附近/)
  assert.match(mapPresentation, /取快递以短信、平台取件码和站点现场牌子为准/)
  assert.match(mapPresentation, /周边商铺到店前再确认是否营业、价格、服务范围/)
  assert.match(mapPresentation, /这是高德当前视野返回的临时地点，刷新后不会保存到学校目录/)
})

test('student-facing pages do not expose maintenance-only map and backend wording', () => {
  const files = [
    'app/pages/index.vue',
    'app/pages/guides/index.vue',
    'app/pages/guides/[slug].vue',
    'app/pages/campus.vue',
    'app/pages/map/index.vue',
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
    'app/utils/privacy-presentation.ts'
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
  assert.match(source, /地图会直接定位并提供可用的导航入口/)
  assert.match(source, /高德地图标点/)
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
  assert.match(presentation, /指南服务暂时不可用，请稍后重试/)
  assert.match(presentation, /当前显示已整理的新生指南/)
  assert.match(presentation, /指南正在整理中，暂时没有可公开展示的新记录/)
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
  assert.match(presentation, /办事流程暂时不可用/)
  assert.match(presentation, /当前没有匹配的已发布流程/)
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
  assert.match(presentation, /信息不替代官方通知/)
  assert.match(presentation, /反馈错误或补充资料/)
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
  assert.match(presentation, /新生报到/)
  assert.match(presentation, /反馈纠错/)
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
  assert.match(presentation, /公开 API 不作离线数据库/)
  assert.match(presentation, /当前处于离线状态/)
})

test('privacy page is a thin shell over privacy presentation', () => {
  const page = readFileSync(resolve('app/pages/privacy.vue'), 'utf8')
  const presentation = readFileSync(resolve('app/utils/privacy-presentation.ts'), 'utf8')
  assert.match(page, /from ['"]~~\/app\/utils\/privacy-presentation['"]/)
  assert.match(page, /privacySections/)
  assert.doesNotMatch(page, /const sections = \[/)
  assert.match(presentation, /export const privacySections/)
  assert.match(presentation, /公开访问/)
  assert.match(presentation, /不保存原始 IP/)
  assert.match(presentation, /730 天/)
})

test('public source and place pages use student-facing data status wording', () => {
  const sourcePage = readFileSync(resolve('app/pages/sources.vue'), 'utf8')
  const placePage = readFileSync(resolve('app/pages/places/[slug].vue'), 'utf8')
  const placePresentation = readFileSync(resolve('app/utils/place-detail-presentation.ts'), 'utf8')
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
  assert.match(sourcePage, /来源、确认范围与使用说明/)
  assert.match(sourcePage, /你提供的高德地图数据已经导入 76 个标记点和 8 个绘制区域/)
  assert.match(sourcePage, /查看地图原始范围/)
  assert.match(sourcesPresentation, /这类资料用于发现地点和问题/)
  assert.match(sourcesPresentation, /export function collectActiveLinkedSources/)
  assert.doesNotMatch(sourcePage, /function dateOnly/)
  assert.doesNotMatch(sourcePage, /const sourceLevels =/)
  assert.doesNotMatch(sourcePage, /来源、核验与使用边界/)
  assert.doesNotMatch(sourcePage, /高德 GCJ-02 坐标显示/)
  assert.doesNotMatch(sourcePage, /候选校界 relation/)
  assert.doesNotMatch(sourcePage, /\{\{ source\.sourceLevel \}\}/)

  assert.match(placePage, /入口位置已确认/)
  assert.match(placePage, /入口位置待确认/)
  assert.match(placePage, /地图查看/)
  assert.match(placePage, /外部导航/)
  assert.match(placePage, /PublicSourceDetails/)
  assert.doesNotMatch(placePage, /经纬度/)
  assert.doesNotMatch(placePage, /\{\{ place\.coordinateSystem \}\}/)

  assert.match(mapPage, /from ['"]~~\/app\/utils\/map-presentation['"]/)
  assert.match(mapPage, /resolveMapPoiStatusText/)
  assert.match(mapPresentation, /入口位置已现场核对/)
  assert.match(mapPresentation, /位置已记录 · 当前底图暂不能显示/)
  assert.doesNotMatch(mapPage, /WGS84 坐标已核验/)
  assert.doesNotMatch(mapPresentation, /WGS84 坐标已核验/)
})

test('student-facing nearby and research pages use reader-facing wording', () => {
  const files = [
    'app/pages/nearby.vue',
    'app/pages/research/xiaohongshu-images.vue'
  ]
  const source = files.map(file => readFileSync(resolve(file), 'utf8')).join('\n')

  assert.match(source, /周边参考清单/)
  assert.match(source, /高德地图线索 · 到店前再确认/)
  assert.match(source, /内容与版权治理/)
  assert.match(source, /社交平台研究素材暂不公开/)
  assert.doesNotMatch(source, /高德候选 · 待核验/)
  assert.doesNotMatch(source, /待实地核验候选/)
  assert.doesNotMatch(source, /社交平台待核验素材/)
  assert.doesNotMatch(source, /张待核验图|张待确认图/)
  assert.doesNotMatch(source, /核验候选/)
})
