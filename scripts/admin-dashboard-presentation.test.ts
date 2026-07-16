import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  adminDashboardModules,
  adminDashboardQuickActions,
  adminDashboardRecordValue,
  adminDashboardStatusCode,
  formatAdminDashboardDate,
  normalizeAdminDashboardResponse
} from '../app/utils/admin-dashboard-presentation'

const pageSource = readFileSync(resolve('app/pages/admin/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/admin-dashboard-presentation.ts'), 'utf8')

test('admin dashboard page is a thin shell over admin-dashboard-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/admin-dashboard-presentation['"]/)
  assert.match(pageSource, /adminDashboardModules/)
  assert.match(pageSource, /adminDashboardQuickActions/)
  assert.match(pageSource, /normalizeAdminDashboardResponse/)
  assert.match(pageSource, /adminDashboardStatusCode/)
  assert.match(pageSource, /adminDashboardRecordValue/)
  assert.match(pageSource, /formatAdminDashboardDate/)
  assert.doesNotMatch(pageSource, /const modules: DashboardModule\[\] = \[/)
  assert.doesNotMatch(pageSource, /const quickActions = \[/)
  assert.doesNotMatch(pageSource, /function normalizeResponse/)
  assert.doesNotMatch(pageSource, /function formatDate/)
  assert.match(utilSource, /export const adminDashboardModules/)
  assert.match(utilSource, /export const adminDashboardQuickActions/)
})

test('admin dashboard catalogs cover core maintenance routes', () => {
  assert.equal(adminDashboardModules.length, 5)
  assert.equal(adminDashboardModules[0]?.key, 'places')
  assert.equal(adminDashboardModules[0]?.to, '/admin/places')
  assert.ok(adminDashboardModules.some(item => item.key === 'feedback' && item.query?.status === 'new'))
  assert.ok(adminDashboardModules.every(item => item.endpoint.startsWith('/api/admin/')))
  assert.equal(adminDashboardQuickActions.length, 7)
  assert.equal(adminDashboardQuickActions[0]?.to, '/admin/places?action=create')
  assert.ok(adminDashboardQuickActions.some(item => item.to === '/admin/field-observations'))
  assert.ok(adminDashboardQuickActions.some(item => item.label === '处理反馈'))
})

test('admin dashboard response helpers stay pure and stable', () => {
  assert.deepEqual(normalizeAdminDashboardResponse([{ id: 1, title: 'a' }]), {
    items: [{ id: 1, title: 'a' }],
    total: 1
  })
  assert.deepEqual(normalizeAdminDashboardResponse({ items: [{ id: 2 }], total: 9 }), {
    items: [{ id: 2 }],
    total: 9
  })
  assert.deepEqual(normalizeAdminDashboardResponse({ data: { items: [{ id: 3 }], total: '4' } }), {
    items: [{ id: 3 }],
    total: 4
  })
  assert.equal(adminDashboardStatusCode({ statusCode: 401 }), 401)
  assert.equal(adminDashboardStatusCode({ response: { status: 403 } }), 403)
  assert.equal(adminDashboardStatusCode('x'), null)
  assert.equal(adminDashboardRecordValue({ name: '地点 A', title: '忽略' }, 'name', 'title'), '地点 A')
  assert.equal(adminDashboardRecordValue({}, 'name'), '—')
  const stamped = formatAdminDashboardDate({ createdAt: '2026-07-16T12:00:00.000Z' })
  assert.notEqual(stamped, '—')
  assert.equal(formatAdminDashboardDate({}), '—')
})
