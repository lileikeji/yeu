import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  adminVisitorBansQuerySchema,
  adminAuditLogsQuerySchema,
  createVisitorBanSchema,
  muteChatUserSchema,
  muteAllChatRoomSchema
} from '../shared/schemas/server'

const bansPage = readFileSync(resolve('app/pages/admin/bans/index.vue'), 'utf8')
const chatPage = readFileSync(resolve('app/pages/admin/chat/index.vue'), 'utf8')
const auditPage = readFileSync(resolve('app/pages/admin/audit/index.vue'), 'utf8')
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
