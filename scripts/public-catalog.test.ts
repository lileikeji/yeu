import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findFreshmanGuide,
  freshmanGuides,
  officialClubs,
  officialSources,
  researchSources
} from '../data/seeds/public-content'
import {
  canUseStaticContentKindFallback,
  mergePublicGuides
} from '../app/utils/public-catalog'

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

  const sectionUrls = new Set(freshmanGuides.flatMap(guide =>
    guide.sections.flatMap(section => section.sources?.map(source => source.url) ?? [])
      .filter(url => url.startsWith('https://www.xiaohongshu.com/explore/'))
  ))
  assert.deepEqual(sectionUrls, expectedUrls)
  assert.ok(Object.values(researchSources).every(source => source.context?.trim()))
})

test('static fallback is fail-closed and scoped to each content kind', () => {
  assert.equal(canUseStaticContentKindFallback(null, 'guide'), false)
  assert.equal(canUseStaticContentKindFallback({ managedKinds: ['notice'] }, 'guide'), true)
  assert.equal(canUseStaticContentKindFallback({ managedKinds: ['notice'] }, 'department'), true)
  assert.equal(canUseStaticContentKindFallback({ managedKinds: ['guide'] }, 'guide'), false)
  assert.equal(canUseStaticContentKindFallback({ hasManagedRecords: false }, 'guide'), false)
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
  assert.equal(studyGuide.updatedAt, '2026-07-14')
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

test('the seven active clubs share the 2026-07-14 verification date', () => {
  assert.deepEqual(
    officialClubs.map(club => club.name),
    [
      '国旗班',
      '音乐协会',
      '公共关系协会',
      '青年志愿者先锋队',
      '就业与创业者协会',
      '青云汉服社',
      '舞蹈协会'
    ]
  )
  assert.ok(officialClubs.every(club => club.source.accessedAt === '2026-07-14'))

  const clubsGuide = findFreshmanGuide('clubs')
  assert.equal(clubsGuide?.updatedAt, '2026-07-14')
  assert.equal(clubsGuide?.statusText, '2026招新安排待发布')
  assert.equal(officialSources.clubOverview.title, '学生社团简介')
  assert.equal(officialSources.clubOverview.accessedAt, '2026-07-14')

  const clubsText = clubsGuide?.sections.flatMap(section => section.items).join('\n') ?? ''
  assert.match(clubsText, /23个学生社团/)
  assert.match(clubsText, /文化体育类12个/)
  assert.match(clubsText, /不能替代当年注册名册或招新公告/)
  assert.ok(clubsGuide?.sources.includes(officialSources.clubOverview))
})
