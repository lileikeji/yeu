import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminVisitorBansQuerySchema,
  adminAuditLogsQuerySchema,
  createVisitorBanSchema
} from '../shared/schemas/server'

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
  const q = adminAuditLogsQuerySchema.parse({ page: 1, pageSize: 10, action: 'visitor.ban', entityType: 'visitor_ban' })
  assert.equal(q.action, 'visitor.ban')
  assert.equal(q.entityType, 'visitor_ban')
})
