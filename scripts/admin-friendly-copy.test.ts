import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { adminSectionConfigs } from '../app/utils/admin-section-config'
import { displayAdminResourceCell } from '../app/utils/admin-resource-presentation'
import {
  adminAuditActionLabels,
  adminHttpMethodLabels,
  adminPathLabel,
  adminPathTransitionLabel,
  adminRiskScoreText,
  adminVisitorActionLabels
} from '../app/utils/admin-security-labels'

const captureEntry = readFileSync(resolve('app/components/admin/AdminCoordinateCaptureEntry.vue'), 'utf8')
const reviewCopy = readFileSync(resolve('app/utils/field-observation-review.ts'), 'utf8')
const picker = readFileSync(resolve('app/components/admin/AdminCoordinatePicker.vue'), 'utf8')
const reviewMap = readFileSync(resolve('app/components/admin/AdminCoordinateReviewMap.vue'), 'utf8')
const offlineQueue = readFileSync(resolve('app/components/admin/AdminCoordinateOfflineQueuePanel.vue'), 'utf8')
const resourceForm = readFileSync(resolve('app/utils/admin-resource-form.ts'), 'utf8')
const procedureBasics = readFileSync(resolve('app/components/admin/AdminProcedureBasicsEditor.vue'), 'utf8')
const procedureCatalog = readFileSync(resolve('app/components/admin/AdminProcedureCatalogPanel.vue'), 'utf8')
const bansPage = readFileSync(resolve('app/pages/admin/bans/index.vue'), 'utf8')
const visitorsPage = readFileSync(resolve('app/pages/admin/visitors/index.vue'), 'utf8')
const dashboardPage = readFileSync(resolve('app/pages/admin/index.vue'), 'utf8')
const usersPage = readFileSync(resolve('app/pages/admin/users/index.vue'), 'utf8')
const proceduresPage = readFileSync(resolve('app/pages/admin/procedures.vue'), 'utf8')
const procedureEditor = readFileSync(resolve('app/components/admin/AdminProcedureEditor.vue'), 'utf8')
const chatPage = readFileSync(resolve('app/pages/admin/chat/index.vue'), 'utf8')
const auditPage = readFileSync(resolve('app/pages/admin/audit/index.vue'), 'utf8')
const securityService = readFileSync(resolve('server/modules/admin-security/service.ts'), 'utf8')

test('content and source catalogs translate stored values for administrators', () => {
  const contentKind = adminSectionConfigs.content!.columns.find(column => column.key === 'kind')!
  const sourcePlatform = adminSectionConfigs.sources!.columns.find(column => column.key === 'platform')!
  const sourceLevel = adminSectionConfigs.sources!.columns.find(column => column.key === 'sourceLevel')!

  assert.equal(displayAdminResourceCell({ kind: 'club' }, contentKind), '社团')
  assert.equal(displayAdminResourceCell({ kind: 'department' }, contentKind), '部门')
  assert.equal(displayAdminResourceCell({ platform: 'amap-workmap' }, sourcePlatform), '高德工作地图（授权导入）')
  assert.equal(displayAdminResourceCell({ platform: 'official-website' }, sourcePlatform), '学校官网')
  assert.equal(displayAdminResourceCell({ sourceLevel: 'A' }, sourceLevel), 'A（学校官方）')
  assert.equal(displayAdminResourceCell({ sourceLevel: 'C' }, sourceLevel), 'C（当事方或授权导入）')
})

test('content editor and coordinate workflows avoid engineer-facing copy', () => {
  const combined = [captureEntry, reviewCopy, picker, reviewMap, offlineQueue].join('\n')
  const visibleJargon = /approved 观测|保持 unverified|升级为 verified|服务端还会|m 阈值|客户端观测 ID|写入 WGS84|来自 OSM/

  assert.doesNotMatch(combined, visibleJargon)
  assert.doesNotMatch(combined, /幂等键|坐标证据|离线观测队列|本地观测|坐标观测/)
  assert.match(captureEntry, /verificationLabel/)
  assert.match(picker, /标准地理坐标/)
  assert.match(reviewCopy, /两次独立确认/)
  assert.match(offlineQueue, /本地记录编号/)
  assert.doesNotMatch(resourceForm, /必须是合法 JSON/)
})

test('operator identifiers and procedure paths use plain-language labels', () => {
  assert.match(procedureBasics, /网页地址名称/)
  assert.doesNotMatch(procedureBasics, /公开路径标识/)
  assert.doesNotMatch(procedureCatalog, /\{\{ procedure\.slug \}\}/)
  assert.doesNotMatch(bansPage, /访客 ID|账号 ID|封禁 ID/)
  assert.doesNotMatch(visitorsPage, /访客 ID|账号 ID/)
  assert.doesNotMatch(visitorsPage, /访客 \{\{ row\.id \}\}|账号 \{\{ row\.userId \}\}/)
  assert.doesNotMatch(visitorsPage, />高频路径</)
  assert.match(bansPage, /封禁记录编号/)
  assert.match(visitorsPage, /访客编号/)
  assert.match(visitorsPage, /常访页面/)
})

test('security paths and scores are presented as operator-facing explanations', () => {
  assert.equal(adminPathLabel('/admin/visitors?banned=true'), '访客轨迹')
  assert.equal(adminPathLabel('/chat/00000000-0000-4000-8000-000000000001'), '群聊房间')
  assert.equal(adminPathLabel('/mech-smoke-123'), '系统检查页面')
  assert.equal(adminPathLabel('/unknown-internal-route'), '其他页面')
  assert.equal(adminPathTransitionLabel('/admin/login', '/admin'), '后台登录 → 后台概览')
  assert.equal(adminRiskScoreText(89.6), '风险分数 90/100')
  assert.equal(adminRiskScoreText(null), '风险分数未知')
  assert.equal(adminAuditActionLabels['source.delete'], '删除来源')
  assert.equal(adminAuditActionLabels['procedure.archive'], '下架办事流程')
  assert.equal(adminAuditActionLabels['place.update'], '编辑地点')
  assert.equal(adminAuditActionLabels['auth.logout'], '管理员登出')
  assert.equal(adminVisitorActionLabels.route_view, '浏览页面')
  assert.equal(adminVisitorActionLabels.api_request, '数据加载')
  assert.equal(adminHttpMethodLabels.GET, '读取数据')
  assert.equal(adminHttpMethodLabels.POST, '提交数据')
  assert.doesNotMatch(dashboardPage, /审计事件|事件节奏|访客事件/)
  assert.doesNotMatch(visitorsPage, /事件详情|本页事件摘要|暂无事件/)
  assert.doesNotMatch(usersPage, /· 事件 \{\{ v\.eventCount \}\}/)
  assert.doesNotMatch(securityService, /访客事件|事件 ·/)
})

test('admin pages avoid internal and layout-dependent wording', () => {
  const combined = [
    dashboardPage,
    proceduresPage,
    procedureEditor,
    chatPage,
    auditPage,
    bansPage,
    usersPage,
    visitorsPage
  ].join('\n')

  assert.doesNotMatch(
    combined,
    /内容资产|治理|结构化|核验依据|对象类型|相关对象编号|侧栏|空=全站禁言|右侧「个人禁言」|安全快照|请求记录|恶意刷接口/
  )
})
