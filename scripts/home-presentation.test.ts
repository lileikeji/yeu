import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildHomeEssentialActions,
  buildHomeImportantDates,
  findGuideSummary,
  homeMoreEntries,
  homeTrustNotice,
  homeTimelineStages
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

function sampleProcedureStep(title: string, timeText: string) {
  return {
    id: `step-${title}`,
    order: 0,
    title,
    description: '',
    audience: ['undergraduate', 'transfer'],
    informationState: 'confirmed',
    timeText,
    place: null,
    department: null,
    actionUrl: null
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
    '校园地图',
    '校园一卡通与网络',
    '快递与外卖'
  ])
  assert.deepEqual(
    actions.map(item => [item.featureKey, item.to]),
    [
      ['home.essential.arrival', '/procedures/arrival'],
      ['home.essential.map', '/map'],
      ['home.essential.network', '/procedures/campus-network'],
      ['home.essential.delivery', '/guides/express-delivery']
    ]
  )
  assert.equal(actions[2]?.description, '查看校园网、校园卡和连接问题')
  // Delivery/arrival descriptions hydrate from the passed DB guide summaries;
  // the network card has no matching guide so it keeps its fallback copy.
  assert.equal(actions[3]?.description, 'API 快递摘要')
  assert.equal(findGuideSummary([], 'missing', 'fallback'), 'fallback')
  assert.deepEqual(buildHomeEssentialActions([]).map(item => item.description), [
    '查询报到时间、地点与流程',
    '查找宿舍、教学楼和校园服务点',
    '查看校园网、校园卡和连接问题',
    '查看取件站点、外卖送达和取餐说明'
  ])
  assert.equal(homeTimelineStages.length, 3)
  assert.equal(homeTimelineStages[0]?.to, '/procedures/arrival')
  assert.equal(homeMoreEntries.length, 10)
  assert.equal(homeMoreEntries[0]?.to, '/checklist')
  assert.equal(homeMoreEntries[0]?.description, '勾选到校前和第一周事项')
  assert.equal(homeMoreEntries[1]?.to, '/guides/safety-health')
  assert.equal(homeMoreEntries[1]?.description, '保存校园 110')
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
  assert.match(pageSource, /currentCohortLabel.*入学指南/s)
  assert.match(pageSource, /placeholder="搜索校园信息，或输入你的问题"/)
  assert.doesNotMatch(pageSource, /先从这里开始|快递或商铺/)
})

test('home puts its student-run status, official entry points and correction path up front', () => {
  assert.equal(homeTrustNotice.badge, '学生整理 · 非学校官网')
  assert.match(homeTrustNotice.description, /最终看录取通知书和学校通知/)
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
  assert.match(pageSource, /currentCohortLabel.*重要时间/s)
  assert.doesNotMatch(JSON.stringify(homeTrustNotice), /来源库|核验|治理/)
})

test('home important dates derive from the arrival procedure and fall back safely', () => {
  const arrival = sampleProcedure({
    slug: 'arrival',
    steps: [
      { ...sampleProcedureStep('记录报到日期', '2026年9月5日至6日'), order: 1 },
      { ...sampleProcedureStep('参加新生入学教育', '2026年9月7日至9日'), order: 2 },
      { ...sampleProcedureStep('按课表开始上课', '2026年9月10日'), order: 3 }
    ]
  })

  const dates = buildHomeImportantDates([arrival])
  assert.deepEqual(dates.map(item => [item.date, item.title]), [
    ['9月5–6日', '注册报到'],
    ['9月7–9日', '入学教育'],
    ['9月10日', '开始上课']
  ])

  // Missing procedures/unknown steps fall back to curated defaults.
  const fallback = buildHomeImportantDates(null)
  assert.deepEqual(fallback.map(item => item.date), ['9月5–6日', '9月7–9日', '9月10日'])
  assert.deepEqual(buildHomeImportantDates([sampleProcedure({ slug: 'campus-network' })]), fallback)
})
