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
  sanitizePublicProcedure,
  sanitizePublicSearchResponse
} from '../app/utils/public-api-presentation'
import { presentPublicContent } from '../server/utils/public-api-presentation'

const publicCatalogSource = readFileSync(
  new URL('../app/composables/usePublicCatalog.ts', import.meta.url),
  'utf8'
)
const clientPresentationSource = readFileSync(
  new URL('../app/utils/public-api-presentation.ts', import.meta.url),
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
  assert.doesNotMatch(clientPresentationSource, /from ['"].*public-catalog['"]/)
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
    body: '工作地图的 76 个标点已按未独立现场核验状态显示。\n系统只在内部资料目录保存少量带来源和版权状态的核验图片，不在前台发布，也不复制完整正文或评论用户资料。',
    category: 'campus',
    audience: 'undergraduate',
    metadata: {
      statusText: '地图目录已导入，坐标核验中',
      leadNotice: '工作地图的 76 个标点与 8 个原始不规则区域边界已按“未独立现场核验”状态显示，并支持地图内步行路线与外部高德导航；区域只绘制边界线，避免遮挡内部高德商铺。',
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

  assert.doesNotMatch(serialized, /坐标核验|点位|现场核验|数据状态|高德工作地图|内部资料目录|版权状态|前台|76 个标点|原始不规则区域|区域边界/)
  assert.match(sanitized.summary, /入口仍在确认/)
  assert.match(sanitized.body, /部分图片只用于确认地点和设施信息/)
  assert.match(serialized, /校园地图可以直接规划步行路线/)
  assert.match(serialized, /入口不确定时，页面会直接提醒/)
  assert.equal(sanitized.sources[0]?.title, '高德地图位置参考')
  assert.equal(sanitized.sources[0]?.publisherName, '地图位置提供者')
  assert.equal(sanitized.sources[0]?.url, source.url)
})

test('public department payload removes maintainer notes before SSR serialization', () => {
  const content = {
    id: 'department-1',
    kind: 'department',
    slug: 'computer-school',
    title: '计算机科学与工程学院',
    summary: '学院独立官网已经上线，可查询计算机、网络工程、物联网等相关栏目；网站仍混有原工程技术学院历史内容，2026级专业归属应以录取材料和学院最新通知为准。',
    body: '计算机科学与工程学院是新生查找相关通知和办事入口时需要优先确认的官方渠道。\n资料核对：独立官网入口已于2026-07-15核对。',
    category: 'department',
    audience: 'undergraduate',
    metadata: {},
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    sources: []
  } satisfies ApiContent

  const sanitized = sanitizePublicContent(content)
  const serialized = JSON.stringify(sanitized)

  assert.doesNotMatch(serialized, /独立官网已经上线|网站仍混有|资料核对|优先确认的官方渠道/)
  assert.match(sanitized.summary, /可以在学院官网查看/)
  assert.match(sanitized.body, /新生可以在计算机科学与工程学院官网查找/)
})

test('public department payload gives the university office a direct website label', () => {
  const content = {
    id: 'department-2',
    kind: 'department',
    slug: 'university-office',
    title: '学校办公室',
    summary: '新生可以在这里查看校历、校级通知、节假日安排、学校办公室信息和全校性安排。',
    body: '学校办公室是新生查找相关通知和办事入口时需要优先确认的官方渠道。\n新生查看校历、校级通知、节假日安排、学校办公室信息和全校性安排的官方入口。',
    category: 'department',
    audience: 'undergraduate',
    metadata: {},
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    sources: []
  } satisfies ApiContent

  const presented = sanitizePublicContent(content)
  assert.equal(presented.summary, '新生可以在学校办公室官网查看校历、校级通知和全校性安排。')
  assert.match(presented.body, /新生可以在学校办公室官网查看/)
})

test('public search payload removes raw department maintenance copy', () => {
  const sanitized = sanitizePublicSearchResponse({
    query: '校园网',
    type: null,
    items: [{
      entityType: 'content',
      resultType: 'department',
      id: 'department-1',
      slug: 'computer-school',
      title: '计算机科学与工程学院',
      summary: '学院独立官网已经上线，可查询计算机、网络工程、物联网等相关栏目；网站仍混有原工程技术学院历史内容，2026级专业归属应以录取材料和学院最新通知为准。',
      category: 'department',
      kind: 'department',
      updatedAt: '2026-07-20T00:00:00.000Z'
    }],
    total: 1,
    hasManagedContent: true,
    managedKinds: ['department']
  })

  assert.doesNotMatch(JSON.stringify(sanitized), /独立官网已经上线|网站仍混有/)
  assert.match(sanitized.items[0]?.summary ?? '', /可以在学院官网查看/)
})

test('public search payload removes legacy club status suffixes from categories', () => {
  const sanitized = sanitizePublicSearchResponse({
    query: '校园',
    type: null,
    items: [{
      entityType: 'content',
      resultType: 'club',
      id: 'club-1',
      slug: 'sample-club',
      title: '书画社',
      summary: '校团委公开资料曾提到这个社团。',
      category: '文化艺术 · 名称线索待确认',
      kind: 'club',
      updatedAt: '2026-07-20T00:00:00.000Z'
    }],
    total: 1,
    hasManagedContent: true,
    managedKinds: ['club']
  })

  assert.equal(sanitized.items[0]?.category, '文化艺术')
  assert.doesNotMatch(JSON.stringify(sanitized), /名称线索待确认|近期活动可确认/)
})

test('nested guide sources use student-facing link wording', () => {
  const content = {
    id: 'guide-source-1',
    kind: 'guide',
    slug: 'source-copy',
    title: '周边生活',
    summary: '周边信息',
    body: '周边信息',
    category: 'life',
    audience: 'undergraduate',
    metadata: {
      sections: [{
        title: '来源',
        items: [],
        sources: [{
          title: '学生分享',
          publisher: '小红书公开笔记',
          url: 'https://example.test/source',
          accessedAt: '2026-07-20',
          status: 'unavailable',
          context: '与高德地图地点 交叉命中的商铺候选；营业状态和菜品仍待实地确认。原链接当前不可稳定访问，公开页面仅保留为归档线索。'
        }]
      }]
    },
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    sources: []
  } satisfies ApiContent

  const presented = presentPublicContent(content)
  const serialized = JSON.stringify(presented)

  assert.doesNotMatch(serialized, /归档线索|原链接当前不可稳定访问|公开页面仅保留/)
  assert.match(serialized, /原分享链接目前打不开/)
})

test('public payload rewrites internal map import states at the final response boundary', () => {
  const sanitized = sanitizePublicSearchResponse({
    query: '宿舍',
    type: null,
    items: [{
      entityType: 'content',
      resultType: 'guide',
      id: 'guide-1',
      slug: 'find-campus',
      title: '找宿舍和教学楼',
      summary: '用校园地图搜索地点，同时区分“已导入”和“已确认坐标”。',
      category: 'campus',
      kind: 'guide',
      updatedAt: '2026-07-20T00:00:00.000Z'
    }],
    total: 1,
    hasManagedContent: true,
    managedKinds: ['guide']
  })

  assert.doesNotMatch(JSON.stringify(sanitized), /已导入|已确认坐标/)
  assert.match(sanitized.items[0]?.summary ?? '', /搜索宿舍、教学楼和服务点/)
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
  assert.equal(
    sanitized.summary,
    '上海楼的位置来自高德地图，可以先用来找方向。具体入口、楼层和开放时间请以现场标识或学校通知为准。'
  )
  assert.doesNotMatch(sanitized.summary, /\s的位置|。，/)
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

test('server public presentation rewrites nested club and guide maintenance copy', () => {
  const content = {
    id: 'club-1',
    kind: 'club',
    slug: 'sample-club',
    title: '示例社团',
    summary: '资料状态是：名称线索待确认',
    body: [
      '这个社团目前属于「科技创新」方向，资料状态是：名称线索待确认。',
      '可信度中等：这个名字出现在校团委的公开资料里，可以作为找社团时的名称索引；是否仍按同名注册和招新，需要等当年公告或现场确认。',
      '还不能写死的信息：2026级招新时间、摆摊地点、报名二维码。系统不会把未核验内容伪装成确定通知。'
    ].join('\n'),
    category: 'community',
    audience: 'undergraduate',
    metadata: {
      note: '系统只在内部资料目录保存少量带来源和版权状态的核验图片，不在前台发布，也不复制完整正文或评论用户资料。'
    },
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    sources: []
  } satisfies ApiContent

  const presented = presentPublicContent(content)
  const serialized = JSON.stringify(presented)

  assert.doesNotMatch(serialized, /资料状态|可信度|写死|伪装|未核验|内部资料目录|版权状态|前台/)
  assert.match(presented.summary, /今年是否继续招新还要等通知/)
  assert.match(presented.body, /请以本学期通知为准/)
  assert.match(presented.body, /请不要使用往年的二维码或群聊入口/)
  assert.equal(presented.category, 'community')
})

test('public club categories remove verification suffixes', () => {
  const content = {
    id: 'club-2',
    kind: 'club',
    slug: 'sample-club-2',
    title: '示例社团',
    summary: '今年是否继续招新还要等通知',
    body: '这个社团属于科技创新方向。',
    category: '科技创新 · 名称线索待确认',
    audience: 'undergraduate',
    metadata: {},
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: '2026-07-20T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    sources: []
  } satisfies ApiContent

  assert.equal(presentPublicContent(content).category, '科技创新')
})

test('all public read endpoints apply student-facing presentation before returning', () => {
  const endpointFiles = [
    '../server/api/public/amap-owner-drafts.get.ts',
    '../server/api/public/clubs/index.get.ts',
    '../server/api/public/clubs/[slug].get.ts',
    '../server/api/public/content/index.get.ts',
    '../server/api/public/content/[slug].get.ts',
    '../server/api/public/departments/index.get.ts',
    '../server/api/public/departments/[slug].get.ts',
    '../server/api/public/guides/index.get.ts',
    '../server/api/public/guides/[slug].get.ts',
    '../server/api/public/places/index.get.ts',
    '../server/api/public/places/[slug].get.ts',
    '../server/api/public/procedures/index.get.ts',
    '../server/api/public/procedures/[slug].get.ts',
    '../server/api/public/search.get.ts'
  ]

  for (const file of endpointFiles) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.match(source, /presentPublic/)
    assert.match(source, /utils\/public-api-presentation/)
  }
})
