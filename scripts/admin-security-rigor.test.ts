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
  assert.match(dashboardPage, /security-active-bans/)
  assert.match(dashboardPage, /security-active-mutes/)
  assert.match(dashboardPage, /security-muted-rooms/)
  assert.match(dashboardPage, /\/api\/admin\/chat\/mutes/)
  assert.match(dashboardPage, /\/api\/admin\/chat\/rooms/)

  assert.match(visitorsService, /bannedByAdminId/)
})
