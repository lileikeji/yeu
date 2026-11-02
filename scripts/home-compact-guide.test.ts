import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const componentPath = resolve('app/components/home/HomeCompactWechatGuide.vue')
const componentSource = readFileSync(componentPath, 'utf8')
const previewContentSource = readFileSync(resolve('data/compact-preview-content.ts'), 'utf8')
const homeSource = readFileSync(resolve('app/pages/index.vue'), 'utf8')
const layoutSource = readFileSync(resolve('app/layouts/default.vue'), 'utf8')
const panoramaSource = readFileSync(resolve('app/pages/panorama.vue'), 'utf8')
const dormSource = readFileSync(resolve('app/pages/dorms.vue'), 'utf8')
const transportSource = readFileSync(resolve('app/pages/transport/index.vue'), 'utf8')
const publicDetailSources = [
  ['app/pages/procedures/[slug].vue', '/procedures'],
  ['app/pages/guides/[slug].vue', '/guides'],
  ['app/pages/clubs/[slug].vue', '/clubs'],
  ['app/pages/departments/[slug].vue', '/departments'],
  ['app/pages/places/[slug].vue', '/map']
] as const

test('homepage switches between full and compact modes without a separate route entry', () => {
  assert.match(homeSource, /HomeCompactWechatGuide/)
  assert.match(layoutSource, />\s*完整\s*<\/button>/)
  assert.match(layoutSource, />\s*简洁\s*<\/button>/)
  assert.match(layoutSource, /useHomeMode\(\)/)
  assert.match(homeSource, /useHomeMode\(\)/)
})

test('mobile header keeps the centered mode switch clear of action buttons', () => {
  assert.match(layoutSource, /min-w-10[^"]*sm:min-w-12/)
  assert.match(layoutSource, /hidden(?:\s+dark:[^"\s]+)*\s+truncate(?:\s+dark:[^"\s]+)*\s+text-base(?:\s+dark:[^"\s]+)*\s+font-bold(?:\s+dark:[^"\s]+)*\s+text-zinc-950(?:\s+dark:[^"\s]+)*\s+sm:inline(?:\s+dark:[^"\s]+)*/)
  assert.match(layoutSource, /class="hidden min-h-10 min-w-10 sm:inline-flex/)
})

test('compact cards open a content-first bottom sheet with a configurable source link', () => {
  assert.match(componentSource, /entrySheetOpen/)
  assert.match(componentSource, /@click="openEntry\(entry\)"/)
  assert.match(componentSource, /h-\[72svh\]/)
  assert.match(componentSource, /scrollbar-none/)
  assert.match(componentSource, /selectedEntryContentBlocks/)
  assert.match(componentSource, /selectedEntryIsLinkPreview/)
  assert.match(componentSource, /entryModalUi/)
  assert.match(componentSource, /将跳转至：/)
  assert.match(componentSource, /入口主要内容/)
  assert.match(previewContentSource, /录取材料到手后/)
  assert.match(previewContentSource, /迎新系统截图显示 1300 元\/人·年/)
  assert.match(previewContentSource, /K2。该线路曾采用分段计价/)
  assert.match(previewContentSource, /女生舒适型：旧区衡山楼/)
  assert.match(componentSource, /来源地址/)
  assert.match(componentSource, /selectedEntrySourceHref/)
  assert.match(componentSource, /item\.sourceUrl/)
  assert.match(componentSource, /item\.detailContent/)
  assert.match(componentSource, /https:\/\/doc\.sourl\.cc\/jkyxfu/)
  assert.match(componentSource, /label="打开小程序"/)
  assert.match(componentSource, /to="\/contact"/)
  assert.match(componentSource, /aria-label="联系整理者"/)
})

test('single-link entries use the compact centered link preview', () => {
  assert.match(componentSource, /selectedEntryIsLinkPreview \? '链接预览'/)
  assert.match(componentSource, /top-1\/2 bottom-auto/)
  assert.match(componentSource, /max-w-sm/)
  assert.match(componentSource, /-translate-y-1\/2/)
  assert.match(componentSource, /footer: 'hidden'/)
  assert.match(componentSource, /v-if="selectedEntry && !selectedEntryIsLinkPreview"/)
})

test('campus service cards always render image covers', () => {
  assert.match(componentSource, /serviceEntryCoverById/)
  assert.match(componentSource, /compact-panorama.*yeu-campus-hero\.webp/s)
  assert.match(componentSource, /compact-map.*freshman-guide-campus-map\.png/s)
  assert.match(componentSource, /compact-delivery.*city-food\.webp/s)
  assert.match(componentSource, /compact-procedures.*new-student-guide-no-qr\.png/s)
  assert.doesNotMatch(componentSource, /v-if="serviceEntryImage\(entry\)"/)
})

test('contact preview includes the existing organizer QR code', () => {
  assert.match(componentSource, /selectedEntryShowsContactQr/)
  assert.match(componentSource, /entryPath\(selectedEntry\.value\) === '\/contact'/)
  assert.match(componentSource, /src="\/images\/contact-wechat\.png"/)
  assert.match(componentSource, /长按识别二维码/)
})

test('direct-open cards stay inside the guide before exposing third-party sources', () => {
  for (const route of [
    '/panorama?tour=campus',
    '/panorama?tour=history',
    '/map',
    '/transport?origin=quanzhou-station',
    '/transport?origin=quanzhou-east',
    '/transport?origin=jinjiang-airport',
    '/transport?origin=city-center',
    '/dorms?type=ordinary',
    '/dorms?type=comfort',
    '/nearby'
  ]) assert.match(componentSource, new RegExp(`to: '${route.replace(/[?]/gu, '\\?')}'`))

  assert.match(panoramaSource, /route\.query\.tour === 'history'/)
  assert.match(dormSource, /route\.query\.type === 'comfort'/)
  assert.match(transportSource, /route\.query\.origin/)
  assert.match(transportSource, /transitOriginIds\.has/)
})

test('outer navigation avoids a duplicate back action while detail modules retain context links', () => {
  assert.doesNotMatch(layoutSource, /aria-label="返回上一步"/)
  assert.doesNotMatch(layoutSource, /router\.back\(\)/)
  for (const [file, parentRoute] of publicDetailSources) {
    const source = readFileSync(resolve(file), 'utf8')
    assert.match(source, new RegExp(`to="${parentRoute}"`))
  }
})

test('desktop home mode switch stays outside the main navigation space', () => {
  assert.match(layoutSource, /md:static md:z-auto md:ml-auto md:shrink-0 md:translate-x-0 md:translate-y-0/)
})

test('wechat guide reads live catalogs and keeps direct web media', () => {
  assert.match(componentSource, /\/api\/public\/notices/)
  assert.match(componentSource, /usePublicProcedureList\(\)/)
  assert.match(componentSource, /usePublicGuideList\(\)/)
  assert.match(componentSource, /usePublicClubList\(\)/)
  assert.match(componentSource, /usePublicDepartmentList\(\)/)
  assert.match(componentSource, /usePublicPlaceList\('campus'\)/)
  assert.match(componentSource, /nearbyGuideItems/)
  assert.match(componentSource, /majorProfiles/)
  assert.match(componentSource, /playsinline/)
  assert.match(componentSource, /preload="metadata"/)
  assert.match(componentSource, /homeEntryResponse\.value\?\.items/)
  assert.match(componentSource, /featurePlacement\(definition\)/)
  assert.match(componentSource, /featureEnabled\(definition\.featureKey\)/)

  for (const asset of [
    'public/media/ordinary-dorm-tour.mp4',
    'public/media/comfort-dorm-tour.mp4',
    'public/images/panorama/ordinary-dorm-poster.jpg',
    'public/images/panorama/comfort-dorm-poster.jpg'
  ]) assert.equal(existsSync(resolve(asset)), true, `Missing ${asset}`)
})

test('compact homepage exposes complete live catalog categories', () => {
  for (const category of [
    'id: \'guides\'',
    'id: \'procedures\'',
    'id: \'places\'',
    'id: \'clubs\'',
    'id: \'departments\''
  ]) assert.match(componentSource, new RegExp(category))

  assert.match(componentSource, /contentCatalogs/)
  assert.match(componentSource, /visibleCatalogItems/)
  assert.match(componentSource, /toggleCatalogExpansion/)
  assert.match(componentSource, /展开其余/)
  assert.match(componentSource, /activeCatalogId/)
  assert.match(componentSource, /nearbyHighlights/)
  assert.match(componentSource, /\/places\/\$\{encodeURIComponent\(item\.slug\)\}/)
})

test('compact map and delivery entries use their matching backend feature switches', () => {
  assert.match(componentSource, /id: 'compact-map',[\s\S]*?featureKey: 'home\.essential\.map'/)
  assert.match(componentSource, /id: 'compact-delivery',[\s\S]*?featureKey: 'home\.essential\.delivery'/)
  assert.doesNotMatch(componentSource, /id: 'compact-major',[^}]*featureKey: 'home\.essential\.map'/)
})

test('full homepage essential entries use the same routes as their backend feature keys', () => {
  const presentationSource = readFileSync(resolve('app/utils/home-presentation.ts'), 'utf8')
  assert.match(presentationSource, /featureKey: 'home\.essential\.map',[\s\S]*?to: '\/map'/)
  assert.match(presentationSource, /featureKey: 'home\.essential\.network',[\s\S]*?to: '\/procedures\/campus-network'/)
  assert.match(presentationSource, /featureKey: 'home\.essential\.delivery',[\s\S]*?to: '\/guides\/express-delivery'/)
})

test('compact homepage follows the five-section mobile preview without nested tabs', () => {
  for (const title of [
    '新生常用入口',
    '校园服务',
    '迎新指南功能',
    '直接打开',
    '了解与反馈'
  ]) assert.match(componentSource, new RegExp(title))

  assert.match(componentSource, /const managedEntryDefinitions/)
  assert.match(componentSource, /const guideToolDefinitions/)
  assert.match(componentSource, /const directEntryDefinitions/)
  assert.match(componentSource, /const supplementalMoreEntries/)
  assert.doesNotMatch(componentSource, /type GuideTab/)
  assert.doesNotMatch(componentSource, /activeTab/)
})

test('compact homepage exposes the same core entry set as the reference preview', () => {
  for (const title of [
    '校园网络',
    '校园问答',
    '联系整理者',
    '全部办事流程',
    '专业住宿查询',
    'VR 校史馆',
    '泉州东站到校',
    '晋江机场到校',
    '信息来源',
    '反馈纠错'
  ]) assert.match(componentSource, new RegExp(title))
})

test('wechat guide avoids account and hidden floor-plan entries', () => {
  assert.doesNotMatch(componentSource, /to="\/(?:login|me|chat)"/)
  assert.doesNotMatch(componentSource, /平面图入口/)
})

test('homepage dynamic download entry has a bundled icon', () => {
  const iconSource = readFileSync(resolve('shared/client-bundle-icons.ts'), 'utf8')
  assert.match(iconSource, /'lucide:download'/)
})
