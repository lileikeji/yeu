import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  adminDashboardGroupMeta,
  adminDashboardModules,
  adminDashboardModulesByGroup,
  adminDashboardQuickActions,
  adminDashboardRecordValue,
  adminDashboardStatusCode,
  adminNavigationGroups,
  adminNavigationItems,
  formatAdminDashboardDate,
  normalizeAdminDashboardResponse
} from '../app/utils/admin-dashboard-presentation'

const pageSource = readFileSync(resolve('app/pages/admin/index.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/admin-dashboard-presentation.ts'), 'utf8')
const layoutSource = readFileSync(resolve('app/layouts/admin.vue'), 'utf8')

test('admin dashboard page is a thin shell over admin-dashboard-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/admin-dashboard-presentation['"]/)
  assert.match(pageSource, /adminDashboardModules/)
  assert.match(pageSource, /adminDashboardQuickActions/)
  assert.match(pageSource, /adminDashboardGroupMeta/)
  assert.match(pageSource, /adminDashboardModulesByGroup/)
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
  assert.match(utilSource, /export const adminDashboardGroupMeta/)
  assert.match(utilSource, /export const adminNavigationGroups/)
})

test('admin dashboard catalogs cover content, ops, and security routes', () => {
  assert.equal(adminDashboardGroupMeta.length, 3)
  assert.deepEqual(adminDashboardGroupMeta.map(item => item.key), ['content', 'ops', 'security'])
  assert.equal(adminDashboardModules.length, 10)
  assert.equal(adminDashboardModules[0]?.key, 'places')
  assert.equal(adminDashboardModules[0]?.to, '/admin/places')
  assert.ok(adminDashboardModules.some(item => item.key === 'feedback' && item.query?.status === 'new'))
  assert.ok(adminDashboardModules.some(item => item.key === 'users' && item.group === 'ops'))
  assert.ok(adminDashboardModules.some(item => item.key === 'chat-rooms' && item.endpoint === '/api/admin/chat/rooms'))
  assert.ok(adminDashboardModules.some(item => item.key === 'assistant-runs' && item.to === '/admin/assistant'))
  assert.ok(adminDashboardModules.some(item => item.key === 'visitors' && item.group === 'security'))
  assert.ok(adminDashboardModules.some(item => item.key === 'bans' && item.endpoint === '/api/admin/visitors/bans' && item.to === '/admin/bans'))
  assert.ok(adminDashboardModules.every(item => item.endpoint.startsWith('/api/admin/')))
  assert.ok(adminDashboardModules.every(item => item.group === 'content' || item.group === 'ops' || item.group === 'security'))
  assert.equal(adminDashboardModulesByGroup('content').length, 4)
  assert.equal(adminDashboardModulesByGroup('ops').length, 4)
  assert.equal(adminDashboardModulesByGroup('security').length, 2)
  assert.equal(adminDashboardQuickActions.length, 12)
  assert.equal(adminDashboardQuickActions[0]?.to, '/admin/places?action=create')
  assert.ok(adminDashboardQuickActions.some(item => item.to === '/admin/field-observations'))
  assert.ok(adminDashboardQuickActions.some(item => item.label === '处理反馈'))
  assert.ok(adminDashboardQuickActions.some(item => item.to === '/admin/users'))
  assert.ok(adminDashboardQuickActions.some(item => item.to === '/admin/chat'))
  assert.ok(adminDashboardQuickActions.some(item => item.to === '/admin/assistant'))
  assert.ok(adminDashboardQuickActions.some(item => item.to === '/admin/visitors'))
  assert.ok(adminDashboardQuickActions.some(item => item.to === '/admin/bans'))
  assert.ok(adminDashboardQuickActions.some(item => item.to === '/admin/audit'))
})

test('admin navigation is grouped and shared with the layout shell', () => {
  assert.equal(adminNavigationGroups.length, 4)
  assert.deepEqual(adminNavigationGroups.map(group => group.key), ['overview', 'content', 'ops', 'security'])
  assert.ok(adminNavigationItems.some(item => item.to === '/admin/places'))
  assert.ok(adminNavigationItems.some(item => item.to === '/admin/users'))
  assert.ok(adminNavigationItems.some(item => item.to === '/admin/chat'))
  assert.ok(adminNavigationItems.some(item => item.to === '/admin/assistant'))
  assert.ok(adminNavigationItems.some(item => item.to === '/admin/visitors'))
  assert.ok(adminNavigationItems.some(item => item.to === '/admin/audit'))
  assert.match(layoutSource, /from ['"]~~\/app\/utils\/admin-dashboard-presentation['"]/)
  assert.match(layoutSource, /adminNavigationGroups/)
  assert.match(layoutSource, /navigationGroups/)
  assert.doesNotMatch(layoutSource, /const navigation: NavigationItem\[\] = \[/)
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
