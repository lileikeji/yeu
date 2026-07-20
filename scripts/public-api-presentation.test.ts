import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type {
  ApiContent,
  ApiPlace,
  ApiProcedure
} from '../shared/types/server'
import {
  sanitizePublicContent,
  sanitizePublicPlace,
  sanitizePublicProcedure
} from '../app/utils/public-api-presentation'

const publicCatalogSource = readFileSync(
  new URL('../app/composables/usePublicCatalog.ts', import.meta.url),
  'utf8'
)

test('public payload sanitizer stays out of the client entry bundle', () => {
  assert.match(publicCatalogSource, /if \(import\.meta\.client\) return response/)
  assert.match(
    publicCatalogSource,
    /await import\('~\/utils\/public-api-presentation'\)/
  )
  assert.doesNotMatch(
    publicCatalogSource,
    /import \{[\s\S]*sanitizePublicContent[\s\S]*\} from '~\/utils\/public-api-presentation'/
  )
})

const source = {
  id: 'source-1',
  title: '用户授权的高德工作地图坐标导入',
  url: 'https://example.test/source',
  platform: 'amap-workmap',
  publisherName: '用户授权导入',
  sourceLevel: 'D' as const,
  isOfficial: false,
  publishedAt: null,
  accessedAt: '2026-07-20T00:00:00.000Z',
  status: 'active' as const
}

test('public content payload uses student-facing copy before Nuxt serializes it', () => {
  const content = {
    id: 'guide-1',
    kind: 'guide',
    slug: 'find-campus',
    title: '找宿舍和教学楼',
    summary: '地图目录已导入，坐标核验中',
    body: '工作地图的 76 个标点已按未独立现场核验状态显示。',
    category: 'campus',
    audience: 'undergraduate',
    metadata: {
      statusText: '地图目录已导入，坐标核验中',
      sections: [{
        title: '现场核验清单',
        items: ['查看地点的数据状态、来源和最后核验日期。']
      }]
    },
    isFeatured: true,
    status: 'published',
    lastVerifiedAt: '2026-07-20T00:00:00.000Z',
    publishedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    sources: [source]
  } satisfies ApiContent

  const sanitized = sanitizePublicContent(content)
  const serialized = JSON.stringify(sanitized)

  assert.doesNotMatch(serialized, /坐标核验|点位|现场核验|数据状态|高德工作地图/)
  assert.match(sanitized.summary, /入口仍在确认/)
  assert.equal(sanitized.sources[0]?.title, '高德地图位置参考')
  assert.equal(sanitized.sources[0]?.publisherName, '地图位置提供者')
  assert.equal(sanitized.sources[0]?.url, source.url)
})

test('public place payload removes internal notes and maintenance wording', () => {
  const raw = '上海楼 已按用户授权的高德地图坐标导入后台草稿；可用于地图定位和维护，具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。'
  const place = {
    id: 'place-1',
    slug: 'shanghai-building',
    name: '上海楼',
    summary: raw,
    body: `${raw}\n\n高德 resourceId：123\n坐标来源：GCJ-02`,
    scope: 'campus',
    type: 'building',
    category: 'campus-building',
    address: null,
    campusArea: null,
    floor: null,
    room: null,
    longitude: 118,
    latitude: 25,
    coordinateSystem: 'GCJ-02',
    coordinateVerification: 'unverified',
    coordinateVerifiedAt: null,
    coordinatePointRole: null,
    navigationAvailable: false,
    sourceRawRef: '{"internal":true}',
    openingHours: null,
    phone: null,
    website: null,
    externalMapUrl: null,
    isOfficial: false,
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    sources: [source]
  } satisfies ApiPlace

  const sanitized = sanitizePublicPlace(place)
  const serialized = JSON.stringify(sanitized)

  assert.doesNotMatch(serialized, /后台草稿|resourceId|坐标来源|GCJ-02 原坐标|sourceRawRef/)
  assert.match(sanitized.summary, /可以先用来找方向/)
  assert.equal('sourceRawRef' in sanitized, false)
})

test('public place payload keeps the arrival checklist for the map detail panel', () => {
  const place = {
    id: 'place-2',
    slug: 'library',
    name: '图书馆',
    summary: '图书馆位置说明',
    body: '图书馆位置说明\n\n【到这里前先确认】\n- 开放时间以图书馆通知为准\n- 入口位置以现场标识为准',
    scope: 'campus',
    type: 'building',
    category: 'service',
    address: null,
    campusArea: null,
    floor: null,
    room: null,
    longitude: null,
    latitude: null,
    coordinateSystem: null,
    coordinateVerification: 'missing',
    coordinateVerifiedAt: null,
    coordinatePointRole: null,
    navigationAvailable: false,
    openingHours: null,
    phone: null,
    website: null,
    externalMapUrl: null,
    isOfficial: true,
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    sources: []
  } satisfies ApiPlace

  const sanitized = sanitizePublicPlace(place)

  assert.match(sanitized.body, /【到这里前先确认】/)
  assert.match(sanitized.body, /开放时间以图书馆通知为准/)
})

test('public procedure payload translates nested steps, materials and source notes', () => {
  const procedure = {
    id: 'procedure-1',
    slug: 'arrival',
    title: '新生报到流程',
    summary: '个人时段、材料、点位和接站待通知',
    body: '公开来源尚未列明个人材料。',
    category: 'arrival',
    audience: ['undergraduate'],
    method: 'offline',
    informationState: 'awaiting-notice',
    statusText: '报到日期已确认，点位待通知',
    processingTime: null,
    deadlineText: null,
    startsAt: null,
    endsAt: null,
    validFrom: null,
    validUntil: null,
    department: null,
    relatedGuide: null,
    places: [],
    steps: [{
      id: 'step-1',
      order: 1,
      title: '核验报到点位',
      description: '等待官方来源确认。',
      audience: ['undergraduate'],
      informationState: 'awaiting-notice',
      timeText: null,
      place: null,
      department: null,
      actionUrl: null
    }],
    materials: [{
      id: 'material-1',
      order: 1,
      name: '待核验材料',
      description: '公开来源尚未列明。',
      audience: ['undergraduate'],
      isRequired: null,
      informationState: 'awaiting-notice',
      place: null,
      department: null
    }],
    sources: [{
      ...source,
      claimScope: '官方信息入口',
      isPrimary: true,
      order: 1
    }],
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z'
  } satisfies ApiProcedure

  const sanitized = sanitizePublicProcedure(procedure)
  const serialized = JSON.stringify(sanitized)

  assert.doesNotMatch(serialized, /点位|核验|公开来源|官方信息入口/)
  assert.match(sanitized.summary, /报到地点/)
  assert.match(sanitized.statusText, /学校通知/)
})
