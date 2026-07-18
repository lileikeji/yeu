import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApiContent } from '../shared/types/server'
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
  studentFacingGuideText,
  studentFacingPlaceBody
} from '../app/utils/public-catalog'
import { buildCatalogSeed } from './seed-public-catalog'

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

test('guide copy hides maintainer language from student pages', () => {
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
    '地图地点已整理，入口仍在确认'
  )
  assert.equal(
    studentFacingGuideText('用校园地图搜索宿舍、教学楼和服务点；高德导入标点可先导航，入口细节仍需现场确认。'),
    '用校园地图搜索宿舍、教学楼和服务点；地图上的位置可先用来找方向，入口细节仍需现场确认。'
  )
  assert.equal(
    studentFacingGuideText('新生处理校园网、统一认证、VPN、网络故障和信息化服务问题的主管部门入口。'),
    '新生遇到校园网、校外访问（VPN）、网络故障或校园系统问题时，可以找这个部门。'
  )
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
    studentFacingGuideText('查看地点的数据状态、来源和最后核验日期。'),
    '查看地点是否已经确认、参考来源和最后更新时间。'
  )
  assert.equal(
    studentFacingGuideText('站点与配送规则待现场核验，查看页面的最后核验日期。'),
    '站点与配送规则还要到现场确认，查看页面的最后确认日期。'
  )
  assert.doesNotMatch(
    studentFacingGuideText('系统只在内部资料目录保存少量带来源和版权状态的核验图片，不在前台发布，也不复制完整正文或评论用户资料。'),
    /内部资料目录|前台|核验/
  )
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
  assert.equal(view?.summary, '新生遇到校园网、校外访问（VPN）、网络故障或校园系统问题时，可以找这个部门。')
  assert.match(view?.body ?? '', /按页面提示登录|校外访问账号/)
  assert.doesNotMatch(view?.body ?? '', /统一认证|信息化服务|通过浏览器认证|VPN账号/)
})

test('static guide and department bodies are readable for freshmen instead of empty placeholders', () => {
  assert.ok(freshmanGuides.every(guide => freshmanGuideBody(guide).length > 300))
  assert.ok(freshmanGuides.every(guide => freshmanGuideBody(guide).includes('适用对象：本科新生、专升本新生')))
  assert.ok(officialDepartments.every(department => officialDepartmentBody(department).includes('不要只靠群聊截图或二手转述')))
})

test('verified campus facts retain their official source and scope', () => {
  assert.equal(officialSources.campusNetwork.accessedAt, '2026-07-14')
  assert.equal(officialSources.dormChangeProcess2025.accessedAt, '2026-07-14')
  assert.equal(officialSources.diningStallLease2026.accessedAt, '2026-07-14')

  const campusGuide = findFreshmanGuide('find-campus')
  assert.ok(campusGuide)

  const campusText = campusGuide.sections
    .flatMap(section => section.items)
    .join('\n')

  assert.match(campusText, /新生入学时由学校统一安排入住，无需提交宿舍申请/)
  assert.match(campusText, /维修人员在24小时内响应，一般故障48小时内修复，紧急故障立即处理/)
  assert.match(campusText, /凭本人有效证件到总务处借用备份钥匙/)
  assert.match(campusText, /第一教学区设北苑餐厅，第三教学区设西苑餐厅/)
  assert.match(campusText, /精确坐标仍需现场核验/)
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

test('official club catalog exposes 23 traceable club entries with source levels', () => {
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
  assert.equal(officialClubs.length, 23)
  assert.equal(officialClubs.filter(club => club.source === officialSources.clubShowcase2026).length, 7)
  assert.equal(officialClubs.filter(club => club.source === officialSources.clubCadreAttachment2024).length, 13)
  assert.equal(officialClubs.filter(club => (
    club.source !== officialSources.clubShowcase2026
    && club.source !== officialSources.clubCadreAttachment2024
  )).length, 3)
  assert.ok(officialClubs.every(club => /适合.*了解|可确认近期有正式活动证据|可作为社团名称线索/.test(club.summary)))
  assert.ok(officialClubs.every(club => club.group.length >= 4 && club.direction.length >= 8))
  assert.ok(officialClubs.every(club => officialClubBody(club).length > 260))
  assert.ok(officialClubs.every(club => officialClubBody(club).includes(club.direction)))
  assert.ok(officialClubs.every(club => officialClubBody(club).includes('招新时间、摆摊地点、报名二维码')))

  const clubsGuide = findFreshmanGuide('clubs')
  assert.equal(clubsGuide?.updatedAt, '2026-07-15')
  assert.equal(clubsGuide?.statusText, '2026招新安排待发布')
  assert.equal(officialSources.clubOverview.title, '学生社团简介')
  assert.equal(officialSources.clubOverview.accessedAt, '2026-07-14')

  const clubsText = clubsGuide?.sections.flatMap(section => section.items).join('\n') ?? ''
  assert.match(clubsText, /23个学生社团/)
  assert.match(clubsText, /文化体育类12个/)
  assert.match(clubsText, /当前已整理的23个社团名称|近期活动可确认：国旗班、音乐协会、公共关系协会/)
  assert.match(clubsText, /体育协会排球分会、体育协会乒乓球分会、体育协会跆拳道分会、体育协会足球分会、体育协会定向越野分会/)
  assert.match(clubsText, /不能替代当年注册名册或招新公告/)
  assert.ok(clubsGuide?.sources.includes(officialSources.clubOverview))
})

test('published seed summaries are specific enough for freshman cards', () => {
  const catalog = buildCatalogSeed()
  const published = catalog.contents.filter(content => content.status === 'published')
  assert.equal(published.length, 58)
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
