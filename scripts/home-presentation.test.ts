import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildHomeEssentialActions,
  buildHomeFeaturedProcedures,
  buildHomeMapSearchTarget,
  computeHomeCardTilt,
  findGuideSummary,
  getHomeFallbackMessage,
  homeMoreEntries,
  homeProcedureMethodLabels,
  homeTrustNotice,
  homeTimelineStages,
  toHomeProcedureItem
} from '../app/utils/home-presentation'
import type { ApiProcedure } from '../shared/types/server'

const pageSource = readFileSync(resolve('app/pages/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/home-presentation.ts'), 'utf8')

function sampleProcedure(overrides: Partial<ApiProcedure> = {}): ApiProcedure {
  return {
    id: 'p1',
    slug: 'campus-network',
    title: '校园网',
    summary: '办理说明',
    body: '',
    category: 'network',
    audience: ['undergraduate', 'transfer'],
    method: 'mixed',
    informationState: 'confirmed',
    statusText: '可办理',
    processingTime: null,
    deadlineText: null,
    startsAt: null,
    endsAt: null,
    validFrom: null,
    validUntil: null,
    department: null,
    relatedGuide: null,
    places: [],
    steps: [],
    materials: [],
    sources: [],
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

test('home page is a thin shell over home-presentation util', () => {
  assert.match(
    pageSource,
    /from ['"]~~\/app\/utils\/home-presentation['"]/
  )
  assert.match(pageSource, /buildHomeEssentialActions/)
  assert.match(pageSource, /buildHomeSearchTarget/)
  assert.match(pageSource, /homeTimelineStages/)
  assert.match(pageSource, /homeMoreEntries/)
  assert.match(pageSource, /useFreshmanChecklist/)
  assert.match(pageSource, /\/checklist/)
  assert.match(pageSource, /<IntroOverlay/)
  assert.match(utilSource, /export function buildHomeEssentialActions/)
  assert.match(utilSource, /export function buildHomeFeaturedProcedures/)
})

test('home timeline and secondary actions remain comfortable to tap on mobile', () => {
  assert.match(pageSource, /<button[\s\S]*v-for="\(stage, index\) in timelineStages"/)
  assert.match(pageSource, /class="min-h-10 border-b-2/)
  assert.match(pageSource, /:to="activeTimelineStage\.to"/)
  assert.match(pageSource, /class="mt-1 inline-flex min-h-10 items-center gap-1/)
  assert.match(pageSource, /class="group flex min-h-16 items-center gap-3/)
})

test('home essential actions and timeline keep freshman-first copy', () => {
  const actions = buildHomeEssentialActions([
    { slug: 'campus-card-network', summary: 'API 校园卡摘要' },
    { slug: 'express-delivery', summary: 'API 快递摘要' }
  ])
  assert.deepEqual(actions.map(item => item.title), [
    '报到安排',
    '专业与住宿片区',
    '宿舍信息',
    '校园地图与交通'
  ])
  assert.equal(actions[2]?.description, '查询宿舍分配与入住须知')
  assert.equal(actions[3]?.description, '查看校园地图与到校路线')
  assert.equal(findGuideSummary([], 'missing', 'fallback'), 'fallback')
  assert.equal(homeTimelineStages.length, 3)
  assert.equal(homeTimelineStages[0]?.to, '/procedures/arrival')
  assert.equal(homeMoreEntries.length, 10)
  assert.equal(homeMoreEntries[0]?.to, '/checklist')
  assert.equal(homeMoreEntries[0]?.description, '勾选到校前和第一周事项，进度会留在这台设备上')
  assert.equal(homeMoreEntries[1]?.to, '/guides/safety-health')
  assert.equal(homeMoreEntries[1]?.description, '保存校园 110，知道紧急情况先找谁')
  assert.equal(homeMoreEntries[3]?.title, '学生社团')
  assert.equal(homeMoreEntries[4]?.title, '校内部门')
  assert.equal(homeMoreEntries[5]?.description, '学生街、马甲周边与泉州市区吃喝玩乐攻略')
  assert.equal(homeMoreEntries[6]?.title, '到校与离校交通')
  assert.equal(homeMoreEntries[6]?.to, '/transport')
  assert.equal(homeMoreEntries[7]?.title, '全景云游校园')
  assert.equal(homeMoreEntries[7]?.to, '/panorama')
  assert.equal(homeMoreEntries[8]?.title, '宿舍实拍')
  assert.equal(homeMoreEntries[8]?.to, '/dorms')
  assert.equal(homeMoreEntries[9]?.title, 'WeLearn 学习工具')
  assert.equal(homeMoreEntries[9]?.to, 'https://dz.lileikeji.top/uploads/releases/download.php')
  assert.equal(homeMoreEntries[9]?.external, true)
  assert.doesNotMatch(JSON.stringify(homeMoreEntries), /线索/)
  assert.match(pageSource, /服务导航/)
  assert.match(pageSource, /2026级新生入学指南/)
  assert.match(pageSource, /placeholder="搜索校园信息，或输入你的问题"/)
  assert.doesNotMatch(pageSource, /先从这里开始|快递或商铺/)
})

test('home puts its student-run status, official entry points and correction path up front', () => {
  assert.equal(homeTrustNotice.badge, '学生整理 · 非学校官网')
  assert.match(homeTrustNotice.description, /最终以录取通知书和学校最新通知为准/)
  assert.match(homeTrustNotice.checkedText, /2026年7月23日/)
  assert.deepEqual(
    homeTrustNotice.links.map(link => link.label),
    ['学校官网', '招生官网', '学生资助', '看信息从哪来', '反馈纠错']
  )
  assert.deepEqual(
    homeTrustNotice.links.filter(link => link.external).map(link => link.to),
    [
      'https://www.yeu.edu.cn/',
      'https://zhaosheng.yeu.edu.cn/',
      'https://xsb.yeu.edu.cn/xszz/list.htm'
    ]
  )
  assert.equal(homeTrustNotice.links.find(link => link.label === '看信息从哪来')?.to, '/sources')
  assert.equal(homeTrustNotice.links.find(link => link.label === '反馈纠错')?.to, '/feedback')
  assert.match(pageSource, /2026级新生重要时间/)
  assert.doesNotMatch(JSON.stringify(homeTrustNotice), /来源库|核验|治理/)
})

test('home featured procedures put broadly useful freshman tasks before audience-specific items', () => {
  const featured = buildHomeFeaturedProcedures([
    sampleProcedure({ id: 'a', slug: 'arrival', title: '报到' }),
    sampleProcedure({ id: 'b', slug: 'transfer-archive-mailing', title: '专升本学生档案邮寄', method: 'offline' }),
    sampleProcedure({ id: 'c', slug: 'library-card-wechat', title: '图书馆借阅证与微信绑定', method: 'online' }),
    sampleProcedure({ id: 'd', slug: 'dorm-repair', title: '宿舍维修报修', method: 'mixed' }),
    sampleProcedure({ id: 'e', slug: 'campus-network', title: '校园网与账号登录问题', method: 'mixed' })
  ], 4)
  assert.deepEqual(featured.map(item => item.to), [
    '/procedures/campus-network',
    '/procedures/dorm-repair',
    '/procedures/library-card-wechat',
    '/procedures/transfer-archive-mailing'
  ])
  assert.deepEqual(
    buildHomeFeaturedProcedures([
      sampleProcedure({ id: 'a', slug: 'transfer-archive-mailing' }),
      sampleProcedure({ id: 'b', slug: 'library-card-wechat' }),
      sampleProcedure({ id: 'c', slug: 'dorm-repair' }),
      sampleProcedure({ id: 'd', slug: 'campus-network' })
    ], 3).map(item => item.to),
    [
      '/procedures/campus-network',
      '/procedures/dorm-repair',
      '/procedures/library-card-wechat'
    ]
  )
  assert.equal(featured[2]?.methodLabel, homeProcedureMethodLabels.online)
  assert.equal(toHomeProcedureItem(sampleProcedure({ method: 'mixed' })).methodLabel, '网上确认 + 到校办理')
  assert.equal(
    toHomeProcedureItem(sampleProcedure({ statusText: '入口已发布，材料待通知' })).statusText,
    '入口已经公布，材料还要等学校通知'
  )
  assert.equal(getHomeFallbackMessage(true, false), '有些新生信息暂时没显示出来，可以先查校园地图和基础指南。')
  assert.equal(getHomeFallbackMessage(false, false), null)
})

test('home card tilt and map search target stay pure and bounded', () => {
  assert.deepEqual(computeHomeCardTilt(50, 0, 100, 100, 6), { rotateX: 6, rotateY: 0 })
  assert.deepEqual(computeHomeCardTilt(100, 50, 100, 100, 6), { rotateX: 0, rotateY: 6 })
  assert.deepEqual(computeHomeCardTilt(0, 0, 0, 0), { rotateX: 0, rotateY: 0 })
  assert.deepEqual(buildHomeMapSearchTarget('  教学楼  '), { path: '/search', query: { q: '教学楼' } })
  assert.deepEqual(buildHomeMapSearchTarget('   '), { path: '/search' })
})
