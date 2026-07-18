import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  adminVisitorBansQuerySchema,
  adminAuditLogsQuerySchema,
  adminChatMessagesQuerySchema,
  createVisitorBanSchema,
  muteChatUserSchema,
  muteAllChatRoomSchema
} from '../shared/schemas/server'

const bansPage = readFileSync(resolve('app/pages/admin/bans/index.vue'), 'utf8')
const chatPage = readFileSync(resolve('app/pages/admin/chat/index.vue'), 'utf8')
const auditPage = readFileSync(resolve('app/pages/admin/audit/index.vue'), 'utf8')
const visitorsPage = readFileSync(resolve('app/pages/admin/visitors/index.vue'), 'utf8')
const usersPage = readFileSync(resolve('app/pages/admin/users/index.vue'), 'utf8')
const dashboardPage = readFileSync(resolve('app/pages/admin/index.vue'), 'utf8')
const labels = readFileSync(resolve('app/utils/admin-security-labels.ts'), 'utf8')
const visitorsService = readFileSync(resolve('server/modules/visitors/service.ts'), 'utf8')
const presentation = readFileSync(resolve('app/utils/admin-dashboard-presentation.ts'), 'utf8')
const banPost = readFileSync(resolve('server/api/admin/visitors/bans.post.ts'), 'utf8')
const mutePost = readFileSync(resolve('server/api/admin/chat/mutes.post.ts'), 'utf8')
const auditApi = readFileSync(resolve('server/api/admin/audit.get.ts'), 'utf8')

test('ban reason is required and trimmed', () => {
  assert.throws(() => createVisitorBanSchema.parse({ scope: 'ip', value: '1.1.1.1' }))
  assert.throws(() => createVisitorBanSchema.parse({ scope: 'ip', value: '1.1.1.1', reason: '  ' }))
  const ok = createVisitorBanSchema.parse({ scope: 'ip', value: '1.1.1.1', reason: ' abuse ' })
  assert.equal(ok.reason, 'abuse')
})

test('admin ban query filters parse', () => {
  const q = adminVisitorBansQuerySchema.parse({ page: 1, pageSize: 20, active: 'true', scope: 'visitor', q: 'spam' })
  assert.equal(q.active, 'true')
  assert.equal(q.scope, 'visitor')
  assert.equal(q.q, 'spam')
})

test('admin audit query filters parse', () => {
  const q = adminAuditLogsQuerySchema.parse({
    page: 1,
    pageSize: 10,
    action: 'visitor.ban',
    entityType: 'visitor_ban',
    entityId: 'abc'
  })
  assert.equal(q.action, 'visitor.ban')
  assert.equal(q.entityType, 'visitor_ban')
  assert.equal(q.entityId, 'abc')
})

test('admin chat message query supports body search q up to 200', () => {
  const ok = adminChatMessagesQuerySchema.parse({
    page: 1,
    pageSize: 20,
    q: 'x'.repeat(150),
    userId: '11111111-1111-4111-8111-111111111111'
  })
  assert.equal(ok.q?.length, 150)
  assert.throws(() => adminChatMessagesQuerySchema.parse({ page: 1, q: 'x'.repeat(201) }))
})

test('chat mute reason is required; mute-all reason required when enabling', () => {
  assert.throws(() => muteChatUserSchema.parse({ userId: '11111111-1111-4111-8111-111111111111' }))
  assert.throws(() => muteChatUserSchema.parse({
    userId: '11111111-1111-4111-8111-111111111111',
    reason: '   '
  }))
  const muted = muteChatUserSchema.parse({
    userId: '11111111-1111-4111-8111-111111111111',
    reason: ' spam '
  })
  assert.equal(muted.reason, 'spam')

  assert.throws(() => muteAllChatRoomSchema.parse({ muted: true }))
  assert.throws(() => muteAllChatRoomSchema.parse({ muted: true, reason: '  ' }))
  assert.deepEqual(muteAllChatRoomSchema.parse({ muted: false }), { muted: false })
  const all = muteAllChatRoomSchema.parse({ muted: true, reason: ' exam silence ' })
  assert.equal(all.reason, 'exam silence')
})

test('security modules stay separated in dedicated admin pages and nav', () => {
  assert.match(presentation, /to: '\/admin\/bans'/)
  assert.match(presentation, /to: '\/admin\/audit'/)
  assert.doesNotMatch(presentation, /to: '\/admin\/audit-logs'/)
  assert.match(bansPage, /原因（必填）/)
  assert.match(bansPage, /expiresAt/)
  assert.match(chatPage, /禁言原因（必填/)
  assert.match(chatPage, /softDeleteMessage/)
  assert.match(auditPage, /\/api\/admin\/audit/)
  assert.match(auditPage, /entityType/)
  assert.match(auditPage, /entityId/)
  assert.match(banPost, /reason: input\.reason/)
  assert.match(mutePost, /reason: input\.reason/)
  assert.match(auditApi, /query\.entityId/)
})

test('admin depth: visitors expose isBanned, labels and richer panels', () => {
  assert.match(visitorsService, /isBanned:\s*isBanned\(row\)/)
  assert.match(visitorsPage, /isBanned/)
  assert.match(visitorsPage, /banned/)
  assert.match(bansPage, /生效中|已过期|已解除/)
  assert.match(auditPage, /prettyAdminDetails|admin-security-labels/)
  assert.match(chatPage, /softDeleteMessage/)
  assert.match(chatPage, /expiresAt/)
  assert.match(usersPage, /\/admin\/chat/)
  assert.match(dashboardPage, /\/api\/admin\/visitors\/bans/)
  assert.match(dashboardPage, /recentBans|recent-bans/)
  assert.match(labels, /prettyAdminDetails/)
  assert.match(labels, /banStatusMeta/)
  assert.match(labels, /adminAuditActionLabels/)
})

test('admin depth2: entity links, confirms, detail panels, security snapshot', () => {
  assert.match(labels, /export function adminEntityHref/)
  assert.match(labels, /export function adminAuditHref/)
  assert.match(labels, /export function confirmAdminAction/)
  assert.match(labels, /export function groupByAdminDay/)
  assert.match(labels, /export function formatAdminDay/)
  assert.match(labels, /adminHttpMethodLabels/)

  assert.match(visitorsPage, /confirmAdminAction/)
  assert.match(visitorsPage, /route\.query\.banned/)
  assert.match(visitorsPage, /prettyAdminDetails/)
  assert.match(visitorsPage, /adminAuditHref|\/admin\/audit/)

  assert.match(bansPage, /confirmAdminAction/)
  assert.match(bansPage, /selectedBan/)
  assert.match(bansPage, /bannedByAdminId/)
  assert.match(bansPage, /adminEntityHref|adminAuditHref/)
  assert.match(bansPage, /route\.query\.active|route\.query\.banId/)

  assert.match(auditPage, /adminEntityHref/)
  assert.match(auditPage, /entityType/)
  assert.match(auditPage, /跳转对象|相关对象|adminEntityHref/)

  assert.match(chatPage, /confirmAdminAction/)
  assert.match(chatPage, /openMessageDetail|selectedMessage/)
  assert.match(chatPage, /deletedOnly|仅看已删除|softDelete/)

  assert.match(usersPage, /selectedUser/)
  assert.match(usersPage, /openUserDetail/)
  assert.match(usersPage, /route\.query\.userId/)
  assert.match(usersPage, /confirmAdminAction/)
  assert.match(usersPage, /adminAuditHref/)
  assert.match(usersPage, /账号详情/)

  assert.match(dashboardPage, /securitySnapshot/)
  assert.match(dashboardPage, /安全态势/)
  assert.match(dashboardPage, /生效封禁/)
  assert.match(dashboardPage, /security-snapshot|securitySnapshot/)
  assert.match(dashboardPage, /\/api\/admin\/security\/snapshot/)

  assert.match(visitorsService, /bannedByAdminId/)
})


test('admin depth3: security snapshot, user dossier, room stats, deleted filter, relative time', () => {
  const snapshotApi = readFileSync(resolve('server/api/admin/security/snapshot.get.ts'), 'utf8')
  const dossierApi = readFileSync(resolve('server/api/admin/users/[id]/security.get.ts'), 'utf8')
  const securityService = readFileSync(resolve('server/modules/admin-security/service.ts'), 'utf8')
  const chatService = readFileSync(resolve('server/modules/chat/service.ts'), 'utf8')
  const usersService = readFileSync(resolve('server/modules/users/service.ts'), 'utf8')

  assert.match(snapshotApi, /getSecuritySnapshot/)
  assert.match(dossierApi, /getUserSecurityDossier/)
  assert.match(securityService, /export function getSecuritySnapshot/)
  assert.match(securityService, /export function getUserSecurityDossier/)
  assert.match(securityService, /last24h/)
  assert.match(securityService, /topPaths/)
  assert.match(securityService, /topCities/)
  assert.match(securityService, /recentMutes/)
  assert.match(securityService, /linkedVisitors/)
  assert.match(securityService, /activeSessions/)

  assert.match(chatService, /messageCount/)
  assert.match(chatService, /deletedMessageCount/)
  assert.match(chatService, /memberCount/)
  assert.match(chatService, /activeMuteCount/)
  assert.match(chatService, /lastMessagePreview/)
  assert.match(chatService, /roomTitle/)
  assert.match(chatService, /username/)
  assert.match(chatService, /deleted === 'true'/)
  assert.match(chatService, /deleted === 'false'/)

  const deleted = adminChatMessagesQuerySchema.parse({ page: 1, deleted: 'true' })
  assert.equal(deleted.deleted, 'true')
  assert.throws(() => adminChatMessagesQuerySchema.parse({ page: 1, deleted: 'maybe' as any }))

  assert.match(usersService, /like\(users\.id/)

  assert.match(dashboardPage, /\/api\/admin\/security\/snapshot/)
  assert.match(dashboardPage, /securityLast24h/)
  assert.match(dashboardPage, /securityTopPaths/)
  assert.match(dashboardPage, /securityRecentMutes/)
  assert.match(dashboardPage, /今天的动态/)

  assert.match(usersPage, /\/api\/admin\/users\//)
  assert.match(usersPage, /security/)
  assert.match(usersPage, /loadUserDossier|userDossier/)
  assert.match(usersPage, /关联访客|生效封禁|最近消息/)

  assert.match(chatPage, /messageCount/)
  assert.match(chatPage, /deletedFilter|cycleDeletedFilter/)
  assert.match(chatPage, /message\.username|message\.roomTitle/)
  assert.match(chatPage, /memberCount/)

  assert.match(visitorsPage, /adminVisitorActionLabels|actionLabel/)
  assert.match(visitorsPage, /eventActionSummary/)

  assert.match(auditPage, /actorUsername|actorLabel|actorDisplayName/)
  assert.match(auditPage, /auditDayGroups|groupByAdminDay/)
  assert.match(auditApi, /actorUsername/)
  assert.match(auditApi, /actorDisplayName/)

  assert.match(labels, /formatAdminRelativeTime/)
  assert.match(labels, /shortAdminId/)
  assert.match(labels, /adminVisitorActionLabels/)
  assert.match(labels, /adminSecurityWindowLabels/)
  assert.match(labels, /'auth\.login'/)
  assert.match(labels, /'auth\.login_failed'/)
  assert.match(labels, /user_login/)
})


test('admin depth4: visitor dossier, risk snapshot, richer security ops', () => {
  const snapshotApi = readFileSync(resolve('server/api/admin/security/snapshot.get.ts'), 'utf8')
  const visitorSecurityApi = readFileSync(resolve('server/api/admin/visitors/[id]/security.get.ts'), 'utf8')
  const securityService = readFileSync(resolve('server/modules/admin-security/service.ts'), 'utf8')

  assert.match(snapshotApi, /getSecuritySnapshot/)
  assert.match(visitorSecurityApi, /getVisitorSecurityDossier/)
  assert.match(securityService, /export function getSecuritySnapshot/)
  assert.match(securityService, /export function getVisitorSecurityDossier/)
  assert.match(securityService, /topActions/)
  assert.match(securityService, /topIps/)
  assert.match(securityService, /topBanReasons/)
  assert.match(securityService, /hourlyEvents/)
  assert.match(securityService, /riskHints/)
  assert.match(securityService, /recentBans/)
  assert.match(securityService, /actionBreakdown/)
  assert.match(securityService, /ipHistory/)
  assert.match(securityService, /sameIpVisitors/)
  assert.match(securityService, /relatedBans/)
  assert.match(securityService, /linkedUser/)

  assert.match(dashboardPage, /securityRiskHints/)
  assert.match(dashboardPage, /securityTopActions/)
  assert.match(dashboardPage, /securityTopIps/)
  assert.match(dashboardPage, /securityTopBanReasons/)
  assert.match(dashboardPage, /securityHourlyEvents/)
  assert.match(dashboardPage, /风险提示/)
  assert.match(dashboardPage, /常见操作/)
  assert.match(dashboardPage, /高频网络地址/)
  assert.match(dashboardPage, /24 小时操作趋势/)

  assert.match(visitorsPage, /\/api\/admin\/visitors\//)
  assert.match(visitorsPage, /security/)
  assert.match(visitorsPage, /visitorDossier|VisitorSecurityDossier/)
  assert.match(visitorsPage, /访客详情/)
  assert.match(visitorsPage, /IP 历史/)
  assert.match(visitorsPage, /关联封禁/)
  assert.match(visitorsPage, /同 IP 其他访客/)

  assert.match(labels, /adminRiskLevelLabels/)
  assert.match(labels, /adminRiskLevelTone/)
  assert.match(labels, /adminVisitorActionLabels/)
})

test('admin depth5: ops snapshot, ip dossier, risk dossiers', () => {
  const securityService = readFileSync(resolve('server/modules/admin-security/service.ts'), 'utf8')
  const ipApi = readFileSync(resolve('server/api/admin/security/ip/[ip].get.ts'), 'utf8')

  assert.match(securityService, /export function getIpSecurityDossier/)
  assert.match(securityService, /previous24h/)
  assert.match(securityService, /deltas24h/)
  assert.match(securityService, /banHygiene/)
  assert.match(securityService, /ipClusters/)
  assert.match(securityService, /suspiciousAgents/)
  assert.match(securityService, /adminActors/)
  assert.match(securityService, /opsTimeline/)
  assert.match(securityService, /STALE_ACTIVE_BANS/)
  assert.match(securityService, /IP_VISITOR_CLUSTER/)
  assert.match(securityService, /EVENT_DELTA_SPIKE/)
  assert.match(securityService, /EVENT_BURST_1H/)
  assert.match(securityService, /suggestedActions/)
  assert.match(securityService, /ipFootprint/)
  assert.match(securityService, /riskScore/)
  assert.match(securityService, /riskFactors/)

  assert.match(ipApi, /getIpSecurityDossier/)
  assert.match(ipApi, /useAdminRequest/)

  assert.match(dashboardPage, /securityDeltas24h/)
  assert.match(dashboardPage, /securityBanHygiene/)
  assert.match(dashboardPage, /securityPulse/)
  assert.match(dashboardPage, /securityIpClusters/)
  assert.match(dashboardPage, /securityOpsTimeline/)
  assert.match(dashboardPage, /封禁状态检查/)
  assert.match(dashboardPage, /deltas24h/)
  assert.match(dashboardPage, /opsTimeline/)

  assert.match(visitorsPage, /loadIpDossier/)
  assert.match(visitorsPage, /IpSecurityDossier/)
  assert.match(visitorsPage, /建议处置/)
  assert.match(visitorsPage, /IP 安全档案/)
  assert.match(visitorsPage, /风险原因/)
  assert.match(visitorsPage, /applySuggestedAction/)
  assert.match(visitorsPage, /\/api\/admin\/security\/ip\//)

  assert.match(usersPage, /ipFootprint/)
  assert.match(usersPage, /riskFactors/)
  assert.match(usersPage, /账号风险/)
  assert.match(usersPage, /adminRiskFactorLabels/)
  assert.match(usersPage, /常用网络/)

  assert.match(labels, /adminRiskFactorLabels/)
  assert.match(labels, /adminOpsTimelineKindLabels/)
  assert.match(labels, /adminSuggestedActionLabels/)
  assert.match(labels, /MULTI_IP_FOOTPRINT/)
  assert.match(labels, /ban_visitor/)
})

test('admin depth6: response queue, windows, transitions, bursts, confidence', () => {
  const securityService = readFileSync(resolve('server/modules/admin-security/service.ts'), 'utf8')

  assert.match(securityService, /function buildBurstWindows/)
  assert.match(securityService, /function buildPathTransitions/)
  assert.match(securityService, /function buildPathSequence/)
  assert.match(securityService, /function percentileRank/)
  assert.match(securityService, /function riskConfidence/)
  assert.match(securityService, /responseQueue/)
  assert.match(securityService, /banCoverage/)
  assert.match(securityService, /geoConcentration/)
  assert.match(securityService, /peakBurst10m/)
  assert.match(securityService, /pathSequence/)
  assert.match(securityService, /pathTransitions/)
  assert.match(securityService, /burstWindows/)
  assert.match(securityService, /peerComparison/)
  assert.match(securityService, /confidence/)
  assert.match(securityService, /evidenceEvents/)
  assert.match(securityService, /relationship/)

  assert.match(dashboardPage, /securityResponseQueue/)
  assert.match(dashboardPage, /securityBanCoverage/)
  assert.match(dashboardPage, /securityWindows/)
  assert.match(dashboardPage, /securityPathTransitions/)
  assert.match(dashboardPage, /securityBurstWindows/)
  assert.match(dashboardPage, /待处理事项/)
  assert.match(dashboardPage, /常见访问顺序/)

  assert.match(visitorsPage, /peerComparison/)
  assert.match(visitorsPage, /pathSequence/)
  assert.match(visitorsPage, /burstWindows/)
  assert.match(visitorsPage, /活跃程度/)
  assert.match(visitorsPage, /判断把握/)

  assert.match(usersPage, /suggestedActions/)
  assert.match(usersPage, /relationship/)
  assert.match(usersPage, /adminConfidenceLabels/)
  assert.match(usersPage, /adminSuggestedActionLabels/)

  assert.match(labels, /adminResponseQueueKindLabels/)
  assert.match(labels, /adminConfidenceLabels/)
  assert.match(labels, /adminBanCoverageLabels/)
  assert.match(labels, /open_visitors/)
  assert.match(labels, /open_chat/)
})

test('admin depth7: sessions, anomaly baseline, network clusters, evidence and playbooks', () => {
  const securityService = readFileSync(resolve('server/modules/admin-security/service.ts'), 'utf8')

  assert.match(securityService, /function buildSessions/)
  assert.match(securityService, /function normalizeNetworkPrefix/)
  assert.match(securityService, /function buildNetworkClusters/)
  assert.match(securityService, /function buildAnomalyBaseline/)
  assert.match(securityService, /dailyBucketExpr/)
  assert.doesNotMatch(securityService, /\$\{DAY_MS\}\.0/)
  assert.match(securityService, /function buildEvidenceLedger/)
  assert.match(securityService, /function buildInvestigationPlaybook/)
  assert.match(securityService, /recentSessions/)
  assert.match(securityService, /networkClusters/)
  assert.match(securityService, /anomalyBaseline/)
  assert.match(securityService, /evidenceLedger/)
  assert.match(securityService, /playbook/)
  assert.match(securityService, /investigationSummary/)
  assert.match(securityService, /networkProfile/)

  assert.match(dashboardPage, /securityRecentSessions/)
  assert.match(dashboardPage, /securityNetworkClusters/)
  assert.match(dashboardPage, /securityAnomalyBaseline/)
  assert.match(dashboardPage, /今天与平时相比/)
  assert.match(dashboardPage, /相近网络来源/)
  assert.match(dashboardPage, /最近访问过程/)

  assert.match(visitorsPage, /evidenceLedger/)
  assert.match(visitorsPage, /networkProfile/)
  assert.match(visitorsPage, /playbook/)
  assert.match(visitorsPage, /判断依据/)
  assert.match(visitorsPage, /处理建议/)
  assert.match(visitorsPage, /最近访问过程/)

  assert.match(usersPage, /evidenceLedger/)
  assert.match(usersPage, /playbook/)
  assert.match(usersPage, /判断依据/)
  assert.match(usersPage, /处理建议/)

  assert.match(labels, /adminAnomalyStatusLabels/)
  assert.match(labels, /adminEvidenceStrengthLabels/)
  assert.match(labels, /adminPlaybookStatusLabels/)
  assert.match(labels, /adminInvestigationStepLabels/)
})

test('admin security pages use administrator-friendly language and mobile visitor cards', () => {
  const forbidden = /处置响应队列|IP 聚类|IP 访客聚类|时间窗口|突发窗口|Z 分数|网段聚类|会话切片|证据账本|调查剧本|封禁卫生|mute-all|同行百分位|路径迁移|路径序列|风险因子|访客安全档案|账号证据账本|账号调查剧本|运维时间线/

  assert.doesNotMatch(dashboardPage, forbidden)
  assert.doesNotMatch(visitorsPage, forbidden)
  assert.doesNotMatch(usersPage, forbidden)
  assert.match(visitorsPage, /md:hidden/)
  assert.match(visitorsPage, /hidden overflow-x-auto[^\n]*md:block/)
  assert.match(visitorsPage, /activeHourlyRows/)
  assert.match(visitorsPage, /formatHourLabel/)
  assert.match(dashboardPage, /更多安全数据/)
})

test('admin daily workflows hide internal codes and use mobile account cards', () => {
  const securityService = readFileSync(resolve('server/modules/admin-security/service.ts'), 'utf8')
  const filterSources = [labels, auditPage, bansPage, chatPage, usersPage].join('\n')

  assert.doesNotMatch(filterSources, /label:[^\n]+value:\s*''/)

  assert.match(labels, /adminAuditActionOptions/)
  assert.match(auditPage, /:items="adminAuditActionOptions"/)
  assert.match(auditPage, /操作类型/)
  assert.match(auditPage, /相关记录编号/)
  assert.doesNotMatch(auditPage, /操作 action|对象 ID|placeholder="如 visitor\.ban|\{\{ row\.action \}\}|req \{\{/)

  assert.match(chatPage, /roomKindLabel/)
  assert.match(chatPage, /宿舍楼群/)
  assert.match(chatPage, /公共群聊/)
  assert.doesNotMatch(chatPage, /软删除确认|服务端筛选|用户 ID|\{\{ room\.kind \}\}|user \{\{/)

  assert.match(usersPage, /aria-label="账号列表"/)
  assert.match(usersPage, /md:hidden/)
  assert.match(usersPage, /hidden overflow-x-auto[^\n]*md:block/)
  assert.match(usersPage, /注册暂未开放，由管理员创建/)
  assert.doesNotMatch(usersPage, /用户 ID/)

  assert.doesNotMatch(securityService, /detail: hint\.code/)
  assert.match(securityService, /查看相关访客、封禁和操作记录/)
})
