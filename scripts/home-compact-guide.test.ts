import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const componentPath = resolve('app/components/home/HomeCompactWechatGuide.vue')
const componentSource = readFileSync(componentPath, 'utf8')
const homeSource = readFileSync(resolve('app/pages/index.vue'), 'utf8')

test('homepage switches between full and compact modes without a separate route entry', () => {
  assert.match(homeSource, /HomeCompactWechatGuide/)
  assert.match(homeSource, /完整模式/)
  assert.match(homeSource, /简洁模式/)
  assert.match(homeSource, /useCookie<'full' \| 'compact'>/)
})

test('wechat guide reads live catalogs and keeps direct web media', () => {
  assert.match(componentSource, /\/api\/public\/notices/)
  assert.match(componentSource, /usePublicProcedureList\(\)/)
  assert.match(componentSource, /usePublicGuideList\(\)/)
  assert.match(componentSource, /usePublicClubList\(\)/)
  assert.match(componentSource, /usePublicDepartmentList\(\)/)
  assert.match(componentSource, /usePublicPlaceList\('nearby'\)/)
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
