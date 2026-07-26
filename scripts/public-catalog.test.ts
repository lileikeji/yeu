import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApiContent, ApiPlace } from '../shared/types/server'
import {
  findFreshmanGuide,
  officialClubBody,
  freshmanGuideBody,
  freshmanGuides,
  officialDepartmentBody,
  officialClubs,
  officialDepartments,
  officialSources,
  researchSources
} from '../data/seeds/public-content'
import {
  canUseStaticContentKindFallback,
  extractStudentUseChecklist,
  mergePublicDepartments,
  mergePublicGuides,
  mergePublicMapPlaces,
  publicClubs,
  studentFacingGuideText,
  studentFacingPlaceBody
} from '../app/utils/public-catalog'
import { buildCatalogSeed } from './seed-public-catalog'
import { amapImportedPlaces } from '../data/seeds/amap-imported-places'
import { updateContentSchema } from '../shared/schemas/server'

function publishedClub(metadata: Record<string, unknown>): ApiContent {
  return {
    id: '00000000-0000-4000-8000-000000000201',
    kind: 'club',
    slug: 'visual-editor-club',
    title: '可视化编辑测试社团',
    summary: '用于验证可视化编辑的数据能够完整进入前台。',
    body: '社团正文',
    category: '科技创新',
    audience: null,
    metadata,
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: '2026-07-27T00:00:00.000Z',
    publishedAt: '2026-07-27T00:00:00.000Z',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
    sources: []
  }
}

test('visual editor boxes and multiple contacts reach the public club view in order', () => {
  const metadata = {
    contactName: '负责人',
    contactPhones: ['13800000000', '13900000000'],
    groupQrUrls: [
      '/uploads/00000000-0000-4000-8000-000000000211.webp',
      '/uploads/00000000-0000-4000-8000-000000000212.webp'
    ],
    contactQrUrls: [
      '/uploads/00000000-0000-4000-8000-000000000213.webp',
      '/uploads/00000000-0000-4000-8000-000000000214.webp'
    ],
    boxes: [
      {
        id: 'join-us',
        title: '怎么加入',
        body: '先填写报名表。',
        items: ['参加见面会', '等待通知'],
        icon: 'i-lucide-user-plus',
        tone: 'green'
      },
      {
        id: 'weekly-plan',
        title: '每周活动',
        body: '每周三晚见面。',
        items: [],
        icon: 'i-lucide-calendar-days',
        tone: 'blue'
      }
    ]
  }
  assert.equal(updateContentSchema.safeParse({ metadata }).success, true)

  const club = publicClubs([publishedClub(metadata)])[0]
  assert.ok(club)
  assert.deepEqual(club.contactPhones, ['13800000000', '13900000000'])
  assert.deepEqual(club.groupQrUrls, [
    '/uploads/00000000-0000-4000-8000-000000000211.webp',
    '/uploads/00000000-0000-4000-8000-000000000212.webp'
  ])
  assert.deepEqual(club.contactQrUrls, [
    '/uploads/00000000-0000-4000-8000-000000000213.webp',
    '/uploads/00000000-0000-4000-8000-000000000214.webp'
  ])
  assert.deepEqual(club.boxes.map(box => ({
    id: box.id,
    title: box.title,
    tone: box.tone
  })), [
    { id: 'join-us', title: '怎么加入', tone: 'green' },
    { id: 'weekly-plan', title: '每周活动', tone: 'blue' }
  ])
  assert.deepEqual(club.boxes[0]?.items, ['参加见面会', '等待通知'])
})

test('content metadata rejects duplicate boxes and external QR image URLs', () => {
  const duplicateBoxes = {
    boxes: [
      { id: 'duplicate', title: '第一项' },
      { id: 'duplicate', title: '第二项' }
    ]
  }
  const externalQr = {
    contactQrUrls: ['https://untrusted.example/qr.png']
  }

  assert.equal(updateContentSchema.safeParse({ metadata: duplicateBoxes }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: externalQr }).success, false)
})

test('managed guide catalogs do not restore an unpublished static guide', () => {
  const expressGuide = freshmanGuides.find(guide => guide.slug === 'express-delivery')
  assert.ok(expressGuide)

  assert.deepEqual(mergePublicGuides([expressGuide], [], false), [])
  assert.equal(mergePublicGuides([expressGuide], [], true)[0]?.slug, 'express-delivery')
})

test('social research leads are linked beside the guide claims they support', () => {
  const expectedUrls = new Set(Object.values(researchSources).map(source => source.url))
  assert.equal(expectedUrls.size, 7)
  assert.ok([...expectedUrls].every(url => /^https:\/\/www\.xiaohongshu\.com\/explore\/[a-z0-9]+$/.test(url)))
  assert.ok(Object.values(researchSources).every(source => source.status === 'unavailable'))

  const sectionUrls = new Set(freshmanGuides.flatMap(guide =>
    guide.sections.flatMap(section => section.sources?.map(source => source.url) ?? [])
      .filter(url => url.startsWith('https://www.xiaohongshu.com/explore/'))
  ))
  assert.deepEqual(sectionUrls, expectedUrls)
  assert.ok(Object.values(researchSources).every(source => source.context?.includes('归档线索')))
})

test('static fallback is fail-closed and scoped to each content kind', () => {
  assert.equal(canUseStaticContentKindFallback(null, 'guide'), false)
  assert.equal(canUseStaticContentKindFallback({ managedKinds: ['notice'] }, 'guide'), true)
  assert.equal(canUseStaticContentKindFallback({ managedKinds: ['notice'] }, 'department'), true)
  assert.equal(canUseStaticContentKindFallback({ managedKinds: ['guide'] }, 'guide'), false)
  assert.equal(canUseStaticContentKindFallback({ hasManagedRecords: false }, 'guide'), false)
})

test('official departments keep stable public detail slugs', () => {
  const departments = mergePublicDepartments(officialDepartments, [], true)
  assert.equal(departments.some(department => department.slug === 'admissions-office'), true)
  assert.equal(departments.find(department => department.slug === 'teaching-affairs-office')?.website, 'https://jwb.yeu.edu.cn/')
  assert.ok(departments.every(department => !department.slug.startsWith('static-department-')))
  assert.ok(departments.every(department => department.body.includes('什么时候该看这里')))
  assert.ok(departments.every(department => department.body.includes('官网入口：')))
  assert.ok(officialDepartments.every(department => department.summary.length >= 25))
  assert.ok(officialDepartments.every(department => /新生|学生|入学|查询|查看/.test(department.summary)))
})

test('student-facing place body hides maintenance notes and keeps actionable checklist', () => {
  const body = [
    '辽宁楼 已按用户授权的高德地图坐标导入后台草稿；可用于地图定位和维护。',
    '',
    '【到这里前先确认】',
    '- 先确认通知里写的是辽宁楼还是附近教学楼。',
    '- 到楼下后看现场楼名和入口标识。',
    '',
    '高德 resourceId：2003534061878097602',
    '坐标来源：User-authorized AMap Work Map sparseList response.',
    '发布提醒：该坐标为高德 GCJ-02 原坐标，后台可维护和定位。',
    'sourceRawRef: internal'
  ].join('\n')

  assert.deepEqual(extractStudentUseChecklist(body), [
    '先确认通知里写的是辽宁楼还是附近教学楼。',
    '到楼下后看现场楼名和入口标识。'
  ])
  const publicBody = studentFacingPlaceBody(body)
  assert.match(publicBody, /辽宁楼/)
  assert.doesNotMatch(publicBody, /resourceId|坐标来源|发布提醒|GCJ-02|sourceRawRef/i)
  assert.doesNotMatch(publicBody, /【到这里前先确认】/)
})

test('published map places use student-facing copy in the map panel', () => {
  const place = mergePublicMapPlaces([], [{
    id: 'place-1',
    slug: 'shanghai-building',
    name: '上海楼',
    summary: '上海楼 已按用户授权的高德地图坐标导入后台草稿；可用于地图定位和维护，具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。',
    body: '上海楼 已按用户授权的高德地图坐标导入后台草稿；可用于地图定位和维护，具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。\n\n高德 resourceId：123',
    scope: 'campus',
    type: 'building',
    category: null,
    address: null,
    campusArea: null,
    floor: null,
    room: null,
    longitude: 118.6,
    latitude: 25.1,
    coordinateSystem: 'WGS84',
    coordinateVerification: 'verified',
    coordinateVerifiedAt: null,
    coordinatePointRole: null,
    navigationAvailable: true,
    openingHours: null,
    phone: null,
    website: null,
    externalMapUrl: 'https://uri.amap.com/marker?position=118.6,25.1',
    isOfficial: false,
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: null,
    createdAt: '',
    updatedAt: '',
    sources: []
  } as ApiPlace])[0]

  assert.ok(place)
  assert.equal(place.summary, '上海楼的位置来自高德地图，可以先用来找方向。具体入口、楼层和开放时间请以现场标识或学校通知为准。')
  assert.doesNotMatch(place.summary, /\s的位置|。，/)
  assert.doesNotMatch(place.body, /后台草稿|resourceId|坐标来源|正式发布/)
})

test('owner map summaries do not repeat the location disclaimer', () => {
  const seed = amapImportedPlaces.find(place => place.name === '韵达快递')
  assert.ok(seed)
  const place = mergePublicMapPlaces([], [], [{
    ...seed,
    summary: '韵达快递 已按用户授权的高德地图坐标导入后台草稿；可用于地图定位和维护，具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。'
  }])[0]

  assert.ok(place)
  assert.equal((place.summary.match(/位置来自/g) ?? []).length, 1)
  assert.doesNotMatch(place.summary, /为准。位置来自/)
})

test('official plan places explain how students can use the number', () => {
  const place = mergePublicMapPlaces([{
    id: 'campus-map-29',
    mapNumber: '29',
    name: '永福楼',
    category: 'campus-building'
  }], [])[0]

  assert.ok(place)
  assert.equal(
    place.summary,
    '学校平面图编号 29。点开会在平面图中标出这个位置，方便你按编号找方向；这里不能直接规划路线。'
  )
  assert.equal(place.body, place.summary)
  assert.doesNotMatch(place.summary, /可验证|比例尺|经纬度|索引/)
})

test('guide copy hides maintainer language from student pages', () => {
  assert.equal(
    studentFacingGuideText('学院独立官网已经上线，可查询计算机、网络工程、物联网等相关栏目；网站仍混有原工程技术学院历史内容，2026级专业归属应以录取材料和学院最新通知为准。'),
    '可以在学院官网查看计算机、网络工程、物联网等专业信息。2026级专业归属和报到安排请以录取材料及学院最新通知为准。'
  )
  assert.equal(
    studentFacingGuideText('计算机科学与工程学院是新生查找相关通知和办事入口时需要优先确认的官方渠道。\n使用建议：如果你不确定该不该找这个部门，可以先在站内搜索关键词，再核对官网栏目名称、发布时间和落款；不要只靠群聊截图或二手转述。\n资料核对：独立官网入口已于2026-07-15核对。\n当前只整理到官网入口，固定办公地点、办公时间和直拨电话未核验前不写死。'),
    '新生可以在计算机科学与工程学院官网查找相关通知和办事入口。\n不确定该找谁时，可以先在站内搜索想办的事，再打开学校或部门官网看最新通知；不要只看群聊截图。\n具体办公地点、办公时间和电话可能调整，请打开官网查看最新安排。'
  )
  assert.equal(
    studentFacingGuideText('首版展示字段'),
    '现在可以查看'
  )
  assert.equal(
    studentFacingGuideText('后续商业功能'),
    '到店前先确认'
  )
  assert.equal(
    studentFacingGuideText('首批交叉命中候选'),
    '先参考这两个地点'
  )
  assert.equal(
    studentFacingGuideText('公开美食笔记提到旧区“喜又”和新区二街“思念小馆”，两家名称均能在高德 POI 中命中，因此提升为优先实地核验对象。'),
    '学生公开分享里提到旧区“喜又”和新区二街“思念小馆”，高德地图也能找到同名地点，可以先用于认路。'
  )
  assert.equal(
    studentFacingGuideText('专升本档案（2026已发布）'),
    '专升本档案（2026年说明）'
  )
  assert.equal(
    studentFacingGuideText('资料状态：部分内容待通知。强时效事项以学校通知为准。'),
    '目前：部分内容待通知。时间变化较快的事项以学校通知为准。'
  )
  assert.equal(
    studentFacingGuideText('地图目录已导入，坐标核验中'),
    '地图可以先用来找方向，入口还要现场确认'
  )
  assert.equal(
    studentFacingGuideText('工作地图的 76 个标点与 8 个原始不规则区域边界已按“未独立现场核验”状态显示，并支持地图内步行路线与外部高德导航；区域只绘制边界线，避免遮挡内部高德商铺。'),
    '校园地图可以直接规划步行路线，也能打开高德导航。到达后请按现场指示牌确认具体入口。'
  )
  assert.equal(
    studentFacingGuideText('查看地点的数据状态、来源和最后核验日期。'),
    '点开地点可以查看位置说明；入口不确定时，页面会直接提醒。'
  )
  assert.equal(
    studentFacingGuideText('用校园地图搜索地点，同时区分“已导入”和“已确认坐标”。'),
    '用校园地图搜索宿舍、教学楼和服务点；地图上的位置可先用来找方向，入口细节仍需现场确认。'
  )
  assert.equal(
    studentFacingGuideText('用校园地图搜索宿舍、教学楼和服务点；高德导入标点可先导航，入口细节仍需现场确认。'),
    '用校园地图搜索宿舍、教学楼和服务点；地图上的位置可先用来找方向，入口细节仍需现场确认。'
  )
  assert.equal(
    studentFacingGuideText('新生处理校园网、统一认证、VPN、网络故障和信息化服务问题的主管部门入口。'),
    '新生遇到校园网、在校外打不开校园网站或线上办事页面、网络故障时，可以找这个部门。'
  )
  assert.equal(
    studentFacingGuideText('新生遇到校园卡网络认证、Wi-Fi 或账号登录问题。'),
    '新生遇到校园卡、校园网连接或账号登录问题。'
  )
  assert.equal(
    studentFacingGuideText('新生遇到校园卡网络认证、Wi-Fi、账号登录问题。'),
    '新生遇到校园卡、校园网连接或账号登录问题。'
  )
  assert.equal(studentFacingGuideText('本系统不收集账号或密码。'), '这里不收集账号或密码。')
  assert.equal(
    studentFacingGuideText('连接后通过浏览器认证。新生注册后以学号获得校园网和VPN账号，首次登录按官方通知操作并立即修改密码。'),
    '连接后按页面提示登录。新生注册后会获得校园网和校外访问账号，第一次使用请按学校通知操作并及时修改密码。'
  )
  assert.equal(
    studentFacingGuideText('宿舍或校外访问教务等校内资源时，可按官方指南使用 https://vpn.yeu.edu.cn:444。'),
    '在宿舍或校外需要打开教务等校内资源时，请按学校指南使用校外访问入口（https://vpn.yeu.edu.cn:444）。'
  )
  assert.equal(
    studentFacingGuideText('信息网络管理规定禁止未经批准私设代理或DHCP、把校园网扩展到校外、向非校内用户提供接入，或利用校园网开展经营活动。'),
    '学校规定不能私自搭建网络转接工具、把校园网分享给校外人员，或利用校园网做经营活动。'
  )
  assert.equal(
    studentFacingGuideText('工作地图目前只有一个“创业园”标点，后续应拆分为A、B两个地点并分别核对入口坐标。'),
    '地图目前只显示一个“创业园”地点；到达后请按现场标识确认 A、B 区入口。'
  )
  assert.equal(
    studentFacingGuideText('具体到校时段、报到校区或点位、材料清单和接站安排仍待通知。'),
    '具体到校时段、报到校区或报到地点、材料清单和接站安排仍待通知。'
  )
  assert.equal(
    studentFacingGuideText('近期公开笔记提供普通型宿舍图片和视频线索，并描述上床下桌、空调、风扇和公共卫浴隔间等情况。'),
    '近期有学生分享普通型宿舍的图片和视频，并介绍了上床下桌、空调、风扇和公共卫浴隔间等情况。'
  )
  assert.equal(
    studentFacingGuideText('查看地点的数据状态、来源和最后核验日期。'),
    '点开地点可以查看位置说明；入口不确定时，页面会直接提醒。'
  )
  assert.equal(
    studentFacingGuideText('站点与配送规则待现场核验，查看页面的最后核验日期。'),
    '站点和配送规则还要到现场确认，查看页面的最后确认日期。'
  )
  assert.doesNotMatch(
    studentFacingGuideText('系统只在内部资料目录保存少量带来源和版权状态的核验图片，不在前台发布，也不复制完整正文或评论用户资料。'),
    /内部资料目录|前台|核验/
  )
})

test('express guide gives students direct, current-use advice', () => {
  const express = findFreshmanGuide('express-delivery')
  assert.ok(express)
  const view = mergePublicGuides([express], [], true)[0]
  assert.ok(view)
  assert.equal(view.summary, '整理快递站点、取件前要确认的事项和外卖取餐边界。站点可能随学期调整，出发前请再看现场通知。')
  assert.equal(view.statusText, '站点和配送规则还要到现场确认')
  assert.deepEqual(view.sections.map(section => section.title), [
    '取件前先确认',
    '容易变化的地方',
    '往年信息怎么用'
  ])
  assert.match(view.leadNotice, /本学期现场标识和宿舍通知/)
  assert.match(view.sections[0]?.items[1] ?? '', /带好取件码/)
  assert.match(view.sections[1]?.items[1] ?? '', /只表示商家接单/)
  assert.match(view.sections[2]?.items[2] ?? '', /先问宿管或站点工作人员/)
  const publicCopy = JSON.stringify({
    summary: view.summary,
    statusText: view.statusText,
    leadNotice: view.leadNotice,
    sections: view.sections
  })
  assert.doesNotMatch(publicCopy, /上线前|线索|追溯|本系统|两项独立核验|再发布到地图|不直接转录|最后核验日期/)
  assert.equal(
    studentFacingGuideText('以下链接用于追溯线索，不表示学校或本系统已经确认其内容。'),
    '下面是往年公开分享和校园地图，适合先了解大致情况；今年的具体安排请以学校通知和现场标识为准。'
  )
  assert.equal(studentFacingGuideText('使用时注意'), '容易变化的地方')
  assert.equal(
    studentFacingGuideText('一篇2025年公开笔记称新区约有6个快递点，并附有新区、旧区站点地图线索；由于品牌和位置主要在图片中，当前不直接转录为地点。'),
    '2025年公开分享提到新区约有6个快递点，并附有新区、旧区示意图；可以先用来认方向，站点品牌和位置仍要现场确认。'
  )
})

test('clubs guide helps students choose an interest and verify this year recruitment', () => {
  const clubs = findFreshmanGuide('clubs')
  assert.ok(clubs)
  const view = mergePublicGuides([clubs], [], true)[0]
  assert.ok(view)
  assert.equal(view.statusText, '2026级招新时间和报名方式还要等通知')
  assert.deepEqual(view.sections.map(section => section.title), [
    '先了解有哪些方向',
    '2026年仍有活动的社团',
    '按兴趣找社团',
    '学校仍在组织社团活动',
    '往年通常怎么招新',
    '学生分享可以怎么参考',
    '名称不同怎么办',
    '报名时注意'
  ])
  assert.match(view.summary, /先按兴趣了解/)
  assert.match(view.leadNotice, /具体招新时间、报名方式和群聊入口/)
  assert.match(view.sections[2]?.items[1] ?? '', /学术、表达和创作方向/)
  assert.match(view.sections[4]?.items[1] ?? '', /仍要等本学期通知/)
  assert.match(view.sections[7]?.items[2] ?? '', /不要使用往年群二维码/)
  const publicCopy = JSON.stringify({
    summary: view.summary,
    statusText: view.statusText,
    leadNotice: view.leadNotice,
    sections: view.sections.map(section => ({
      title: section.title,
      items: section.items,
      notice: section.notice
    }))
  })
  assert.doesNotMatch(publicCopy, /线索|运行证据|干部任职|系统保留|自动合并|发布规则|存续状态|归档/)
  assert.equal(
    studentFacingGuideText('其余名称主要来自校团委公开附件中的干部任职线索，适合做招新前索引，不适合直接写成“2026正在招新”。'),
    '这些名称来自校团委公开资料，社团名称和是否招新可能调整，报名时以本学期通知为准。'
  )
})

test('nearby guide only exposes student-useful sections', () => {
  const nearby = freshmanGuides.find(guide => guide.slug === 'nearby')
  assert.ok(nearby)
  const view = mergePublicGuides([nearby], [], true)[0]
  assert.ok(view)
  assert.deepEqual(view.sections.map(section => section.title), [
    '现在可以查看',
    '到店前先确认',
    '先参考这两个地点'
  ])
  const publicCopy = JSON.stringify({
    summary: view.summary,
    leadNotice: view.leadNotice,
    sections: view.sections
  })
  assert.doesNotMatch(publicCopy, /首版|展示字段|商业功能|交叉命中|高德 POI|门店控制权/)
  assert.match(publicCopy, /避免白跑|出发前请再确认|只作为找店参考/)
})

test('guide source notes hide maintainer wording', () => {
  const campus = freshmanGuides.find(guide => guide.slug === 'find-campus')
  assert.ok(campus)
  const view = mergePublicGuides([campus], [], true)[0]
  assert.ok(view)
  const contexts = [
    ...view.sources,
    ...view.sections.flatMap(section => section.sources ?? [])
  ]
    .map(source => source.context ?? '')
    .join('\n')
  assert.match(contexts, /往年的学生分享|往年的宿舍视频/)
  assert.doesNotMatch(
    contexts,
    /现场核验|独立核验|待复核|待核验|原外链|归档线索|前台|争议配图禁止发布/
  )
})

test('campus guide explains map use without inventory language', () => {
  const campus = freshmanGuides.find(guide => guide.slug === 'find-campus')
  assert.ok(campus)
  const view = mergePublicGuides([campus], [], true)[0]
  assert.ok(view)
  assert.equal(
    view.leadNotice,
    '校园地图可以直接规划步行路线，也能打开高德导航。到达后请按现场指示牌确认具体入口。'
  )
  assert.match(view.sections[0]?.items.join('\n') ?? '', /入口不确定时，页面会直接提醒/)
  assert.doesNotMatch(
    JSON.stringify(view),
    /76 个标点|原始不规则区域|区域边界|未独立现场核验|数据状态|最后核验日期/
  )
})

test('nearby and delivery source notes do not retain archive wording', () => {
  const nearby = freshmanGuides.find(guide => guide.slug === 'nearby')
  assert.ok(nearby)
  const view = mergePublicGuides([nearby], [], true)[0]
  assert.ok(view)
  const contexts = [
    ...view.sources,
    ...view.sections.flatMap(section => section.sources ?? [])
  ].map(source => source.context ?? '').join('\n')
  assert.doesNotMatch(contexts, /归档线索|原链接当前不可稳定访问|公开页面仅保留/)
})

test('published department copy also hides internal network wording', () => {
  const content: ApiContent = {
    id: 'department-copy-test',
    kind: 'department',
    slug: 'information-office',
    title: '实验室与信息化管理处',
    summary: '新生处理校园网、统一认证、VPN、网络故障和信息化服务问题的主管部门入口。',
    body: '查校园网、统一认证、网络故障、信息化服务和实验室信息。\n连接后通过浏览器认证。新生注册后以学号获得校园网和VPN账号，首次登录按官方通知操作并立即修改密码。',
    category: 'office',
    audience: '本科新生',
    metadata: {},
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: '2026-07-15',
    publishedAt: '2026-07-15',
    createdAt: '2026-07-15',
    updatedAt: '2026-07-15',
    sources: []
  }
  const view = mergePublicDepartments([], [content], false)[0]
  assert.equal(view?.summary, '新生遇到校园网、在校外打不开校园网站或线上办事页面、网络故障时，可以找这个部门。')
  assert.match(view?.body ?? '', /按页面提示登录|校外访问账号/)
  assert.doesNotMatch(view?.body ?? '', /统一认证|信息化服务|通过浏览器认证|VPN账号/)
})

test('static guide and department bodies are readable for freshmen instead of empty placeholders', () => {
  assert.ok(freshmanGuides.every(guide => freshmanGuideBody(guide).length > 300))
  assert.ok(freshmanGuides.every(guide => freshmanGuideBody(guide).includes('适用对象：本科新生、专升本新生')))
  assert.ok(officialDepartments.every(department => officialDepartmentBody(department).includes('不要只靠群聊截图或二手转述')))
  const departmentViews = mergePublicDepartments(officialDepartments, [], true)
  assert.ok(departmentViews.every(department => !/资料核对|未核验前不写死|优先确认的官方渠道/.test(department.body)))
  assert.ok(departmentViews.every(department => /新生可以在.+官网查找|新生什么时候该看这里/.test(department.body)))
})

test('verified campus facts retain their official source and scope', () => {
  assert.equal(officialSources.campusNetwork.accessedAt, '2026-07-14')
  assert.equal(officialSources.dormChangeProcess2025.accessedAt, '2026-07-14')
  assert.equal(officialSources.diningStallLease2026.accessedAt, '2026-07-14')

  const campusGuide = findFreshmanGuide('find-campus')
  assert.ok(campusGuide)
  assert.equal(campusGuide.title, '找宿舍、教学楼和食堂')
  assert.match(campusGuide.summary, /东苑、北苑、西苑餐厅/)

  const campusText = campusGuide.sections
    .flatMap(section => section.items)
    .join('\n')

  assert.match(campusText, /新生入学时由学校统一安排入住，无需提交宿舍申请/)
  assert.match(campusText, /维修人员在24小时内响应，一般故障48小时内修复，紧急故障立即处理/)
  assert.match(campusText, /凭本人有效证件到总务处借用备份钥匙/)
  assert.match(campusText, /第一教学区设北苑餐厅，第三教学区设西苑餐厅/)
  assert.match(campusText, /具体档口是否营业、从哪个入口进入和开放时间请到校后确认/)
  assert.ok(campusGuide.sources.includes(officialSources.dormChangeProcess2025))
  assert.ok(campusGuide.sources.includes(officialSources.diningStallLease2026))

  const networkGuide = findFreshmanGuide('campus-card-network')
  assert.ok(networkGuide)

  const networkText = networkGuide.sections
    .flatMap(section => section.items)
    .join('\n')

  assert.match(networkText, /不包括教师、学生宿舍区/)
  assert.match(networkText, /校园一卡通门禁系统刷脸进出宿舍区/)
  assert.match(networkText, /不代表校园卡资金账户或完整服务流程/)
  assert.ok(networkGuide.sources.includes(officialSources.dormRules2025))
  assert.doesNotMatch(networkText, /Yeu@/)
})

test('study and safety guides expose official sources without inventing pending arrangements', () => {
  const studyGuide = findFreshmanGuide('study-library')
  assert.ok(studyGuide)
  assert.equal(studyGuide.updatedAt, '2026-07-15')
  assert.ok(studyGuide.sources.includes(officialSources.academicCalendar2026Fall))
  assert.ok(studyGuide.sources.includes(officialSources.libraryBorrowingRules))

  const studyText = studyGuide.sections.flatMap(section => section.items).join('\n')
  assert.match(studyText, /9月7至9日参加入学教育，9月10日开始上课/)
  assert.match(studyText, /个人课表、分班、教材领取、选课轮次及补退选时间尚未/)
  assert.match(studyText, /不公开或猜测默认密码/)

  const safetyGuide = findFreshmanGuide('safety-health')
  assert.ok(safetyGuide)
  assert.ok(safetyGuide.sources.includes(officialSources.campusFireSafety2025))
  assert.ok(safetyGuide.sources.includes(officialSources.mentalHealthVisitorNotice))

  const safetyText = safetyGuide.sections.flatMap(section => section.items).join('\n')
  assert.match(safetyText, /校园110：0595-22076110/)
  assert.match(safetyText, /医务室直拨电话和2026级体检安排尚未/)
  assert.match(safetyText, /保密会有必要例外/)
})

test('official club catalog keeps every listed organization traceable to a source', () => {
  assert.deepEqual(
    officialClubs.map(club => club.name),
    [
      '国旗班',
      '音乐协会',
      '公共关系协会',
      '青年志愿者先锋队',
      '就业与创业者协会',
      '青云汉服社',
      '舞蹈协会',
      '战鹰退伍兵协会',
      '孙子兵法研究会',
      '演讲与口才协会',
      '书画社',
      '体育协会排球分会',
      '体育协会乒乓球分会',
      '体育协会跆拳道分会',
      '体育协会足球分会',
      '体育协会定向越野分会',
      '创新发明协会',
      '计算机协会',
      '电子数模协会',
      '红城文学社',
      '英语学习社',
      '心理协会',
      '习近平新时代中国特色社会主义思想读书社',
      '红十字会'
    ]
  )
  assert.equal(officialClubs.length, 24)
  assert.equal(officialClubs.filter(club => club.source === officialSources.clubShowcase2026).length, 7)
  assert.equal(officialClubs.filter(club => club.source === officialSources.clubCadreAttachment2024).length, 13)
  assert.equal(officialClubs.filter(club => (
    club.source !== officialSources.clubShowcase2026
    && club.source !== officialSources.clubCadreAttachment2024
  )).length, 4)
  assert.ok(officialClubs.every(club => /适合.*(?:了解|关注)|可确认近期有正式活动证据|可作为社团名称线索/.test(club.summary)))
  assert.ok(officialClubs.every(club => club.group.length >= 4 && club.direction.length >= 8))
  assert.ok(officialClubs.every(club => officialClubBody(club).length > 260))
  assert.ok(officialClubs.every(club => officialClubBody(club).includes(club.direction)))
  assert.ok(officialClubs.every(club => officialClubBody(club).includes('招新时间、摆摊地点、报名二维码')))

  const clubsGuide = findFreshmanGuide('clubs')
  assert.equal(clubsGuide?.updatedAt, '2026-07-15')
  assert.equal(clubsGuide?.statusText, '2026级招新时间和报名方式还要等通知')
  assert.equal(officialSources.clubOverview.title, '学生社团简介')
  assert.equal(officialSources.clubOverview.accessedAt, '2026-07-14')

  const clubsText = clubsGuide?.sections.flatMap(section => section.items).join('\n') ?? ''
  assert.match(clubsText, /23个学生社团/)
  assert.match(clubsText, /文化体育类12个/)
  assert.match(clubsText, /近期有公开活动：国旗班、音乐协会、公共关系协会/)
  assert.match(clubsText, /体育协会排球分会、体育协会乒乓球分会、体育协会跆拳道分会、体育协会足球分会、体育协会定向越野分会/)
  assert.match(clubsText, /报到后再关注本学期招新通知/)
  assert.ok(clubsGuide?.sources.includes(officialSources.clubOverview))
})

test('fees and aid guide makes 2026 costs discoverable without inventing a payment entry', () => {
  const guide = findFreshmanGuide('fees-aid')
  assert.ok(guide)
  assert.equal(guide.updatedAt, '2026-07-23')
  assert.equal(guide.category, 'arrival')
  assert.ok(guide.sources.includes(officialSources.undergraduateRules2026))
  assert.ok(guide.sources.includes(officialSources.nationalGrantRules2025))

  const text = guide.sections.flatMap(section => section.items).join('\n')
  assert.match(text, /每学年23000元/)
  assert.match(text, /每学年2780元/)
  assert.match(text, /生源地信用助学贷款.*最高20000元/)
  assert.match(text, /国家助学金分每年3000元和5000元两档/)
  assert.match(text, /尚未在面向2026级新生的公开通知中公布统一操作入口/)
  assert.doesNotMatch(text, /支付宝|微信缴费|统一支付平台/)
  assert.match(guide.leadNotice, /专升本新生.*以自己的录取通知书/)
})

test('published seed summaries are specific enough for freshman cards', () => {
  const catalog = buildCatalogSeed()
  const published = catalog.contents.filter(content => content.status === 'published')
  assert.equal(published.length, 60)
  for (const content of published) {
    assert.ok(
      content.summary.trim().length >= 35,
      `${content.kind}/${content.slug} summary is too short: ${content.summary}`
    )
    assert.match(
      content.summary,
      /新生|报到|校园|宿舍|快递|外卖|社团|商铺|图书馆|心理|安全|缴费|学籍|课程|招新|服务|活动|专业|办理/,
      `${content.kind}/${content.slug} summary lacks freshman-facing specifics: ${content.summary}`
    )
  }
})
