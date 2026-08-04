import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const componentPath = resolve('app/components/home/HomeCompactWechatGuide.vue')
const componentSource = readFileSync(componentPath, 'utf8')
const homeSource = readFileSync(resolve('app/pages/index.vue'), 'utf8')
const layoutSource = readFileSync(resolve('app/layouts/default.vue'), 'utf8')

test('homepage switches between full and compact modes without a separate route entry', () => {
  assert.match(homeSource, /HomeCompactWechatGuide/)
  assert.match(layoutSource, />\s*完整\s*<\/button>/)
  assert.match(layoutSource, />\s*简洁\s*<\/button>/)
  assert.match(layoutSource, /useHomeMode\(\)/)
  assert.match(homeSource, /useHomeMode\(\)/)
})

test('mobile header keeps the centered mode switch clear of action buttons', () => {
  assert.match(layoutSource, /min-w-10[^"]*sm:min-w-12/)
  assert.match(layoutSource, /hidden truncate text-base font-bold text-zinc-950 sm:inline/)
  assert.match(layoutSource, /class="hidden min-h-10 min-w-10 sm:inline-flex/)
})

test('compact cards open a bottom sheet with a configurable source link', () => {
  assert.match(componentSource, /entrySheetOpen/)
  assert.match(componentSource, /@click="openEntry\(entry\)"/)
  assert.match(componentSource, /max-h-\[72dvh\]/)
  assert.match(componentSource, /来源地址/)
  assert.match(componentSource, /selectedEntrySourceHref/)
  assert.match(componentSource, /item\.sourceUrl/)
})

test('every public subpage gets one shared back action', () => {
  assert.match(layoutSource, /v-if="!isHomePage"/)
  assert.match(layoutSource, /aria-label="返回上一步"/)
  assert.match(layoutSource, /window\.history\.state\?\.back/)
  assert.match(layoutSource, /router\.back\(\)/)
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
