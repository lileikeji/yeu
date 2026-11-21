import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  adminDeviceLoginMessages,
  adminDeviceLoginRequestMessage,
  adminLoginMessages,
  adminLoginRequestMessage,
  isAdminLoginPayloadObject,
  isAdminSessionAuthenticated,
  resolveAdminLoginRedirectTarget,
  resolveAdminPostLoginTarget
} from '../app/utils/admin-login-presentation'

const pageSource = readFileSync(resolve('app/pages/admin/login.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/admin-login-presentation.ts'), 'utf8')

test('admin login page is a thin shell over admin-login-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/admin-login-presentation['"]/)
  assert.match(pageSource, /isAdminSessionAuthenticated/)
  assert.match(pageSource, /adminLoginRequestMessage/)
  assert.match(pageSource, /resolveAdminLoginRedirectTarget/)
  assert.match(pageSource, /resolveAdminPostLoginTarget/)
  assert.match(pageSource, /adminLoginMessages/)
  assert.doesNotMatch(pageSource, /function isObject\(/)
  assert.doesNotMatch(pageSource, /function authenticated\(/)
  assert.doesNotMatch(pageSource, /function requestMessage\(/)
  assert.doesNotMatch(pageSource, /function resolveAdminLoginRedirectTarget\(/)
  assert.match(utilSource, /export function isAdminSessionAuthenticated/)
  assert.match(utilSource, /export function adminLoginRequestMessage/)
  assert.match(utilSource, /export function resolveAdminLoginRedirectTarget/)
  assert.match(utilSource, /export function resolveAdminPostLoginTarget/)
  assert.match(utilSource, /export const adminLoginMessages/)
})

test('admin login messages stay operator-facing Chinese', () => {
  assert.equal(adminLoginMessages.missingCredentials, '请输入管理员账号和密码。')
  assert.equal(adminLoginMessages.genericFailure, '登录失败，请稍后重试。')
  assert.equal(adminLoginMessages.invalidCredentials, '账号或密码不正确。')
})

test('admin login pure helpers resolve session, errors, and safe redirects', () => {
  assert.equal(isAdminLoginPayloadObject(null), false)
  assert.equal(isAdminLoginPayloadObject([]), false)
  assert.equal(isAdminLoginPayloadObject({}), true)

  assert.equal(isAdminSessionAuthenticated({ authenticated: true }), true)
  assert.equal(isAdminSessionAuthenticated({ isAuthenticated: true }), true)
  assert.equal(isAdminSessionAuthenticated({ loggedIn: true }), true)
  assert.equal(isAdminSessionAuthenticated({ user: { id: 'a' } }), true)
  assert.equal(isAdminSessionAuthenticated({ admin: { id: 'a' } }), true)
  assert.equal(isAdminSessionAuthenticated({ session: { user: { id: 'a' } } }), true)
  assert.equal(isAdminSessionAuthenticated({ session: {} }), false)
  assert.equal(isAdminSessionAuthenticated({ authenticated: false }), false)
  assert.equal(isAdminSessionAuthenticated(null), false)

  assert.equal(adminLoginRequestMessage(null), adminLoginMessages.genericFailure)
  assert.equal(adminLoginRequestMessage({ data: { message: '限流中' } }), '限流中')
  assert.equal(adminLoginRequestMessage({ statusMessage: '服务不可用' }), '服务不可用')
  assert.equal(adminLoginRequestMessage({}), adminLoginMessages.invalidCredentials)

  assert.equal(
    adminDeviceLoginRequestMessage({ data: { data: { code: 'ADMIN_DEVICE_LOGIN_DISABLED' } }, statusCode: 404 }),
    adminDeviceLoginMessages.disabled
  )
  assert.equal(
    adminDeviceLoginRequestMessage(new Error('ADMIN_DEVICE_KEY_NOT_FOUND')),
    adminDeviceLoginMessages.keyMismatch
  )
  assert.equal(
    adminDeviceLoginRequestMessage({ statusCode: 429 }),
    adminDeviceLoginMessages.rateLimited
  )
  assert.equal(
    adminDeviceLoginRequestMessage({ data: { data: { code: 'ADMIN_DEVICE_AUTH_FAILED' } }, statusCode: 401 }),
    adminDeviceLoginMessages.rejected
  )

  assert.equal(resolveAdminLoginRedirectTarget('/admin/procedures'), '/admin/procedures')
  assert.equal(resolveAdminLoginRedirectTarget('/admin/login'), '/admin')
  assert.equal(resolveAdminLoginRedirectTarget('/admin/login?x=1'), '/admin')
  assert.equal(resolveAdminLoginRedirectTarget('/map'), '/admin')
  assert.equal(resolveAdminLoginRedirectTarget('https://evil.example/admin'), '/admin')
  assert.equal(resolveAdminLoginRedirectTarget(undefined), '/admin')
  assert.equal(resolveAdminLoginRedirectTarget(['/admin/places']), '/admin')
  assert.equal(resolveAdminLoginRedirectTarget('/admin/../etc'), '/admin')
  assert.equal(resolveAdminLoginRedirectTarget('/admin//evil'), '/admin')
  assert.equal(resolveAdminLoginRedirectTarget('/adminfoo'), '/admin')
  assert.equal(resolveAdminLoginRedirectTarget('/admin/places/'), '/admin/places')
})

test('organization administrators enter their isolated workspace immediately after login', () => {
  assert.deepEqual(resolveAdminPostLoginTarget({
    admin: {
      role: 'organization',
      mustChangePassword: true
    }
  }, '/admin'), {
    path: '/admin/organization',
    query: { password: 'required' }
  })
  assert.equal(resolveAdminPostLoginTarget({
    admin: {
      role: 'organization',
      mustChangePassword: false
    }
  }, '/admin/content'), '/admin/organization')
  assert.equal(resolveAdminPostLoginTarget({
    admin: {
      role: 'super'
    }
  }, '/admin/content'), '/admin/content')
})

test('organization administrators keep a shared-page redirect after re-authenticating', () => {
  // 数据看板对组织账号开放：被 403 弹回登录后必须回到看板，而不是被改道回工作台。
  assert.equal(resolveAdminPostLoginTarget({
    admin: { role: 'organization', mustChangePassword: false }
  }, '/admin/overview'), '/admin/overview')
  // 计协账号同样适用。
  assert.equal(resolveAdminPostLoginTarget({
    admin: {
      role: 'organization',
      mustChangePassword: false,
      organization: { slug: 'computer-association', title: '计算机协会' }
    }
  }, '/admin/overview'), '/admin/overview')
  // 非共享页面仍然回到自己的工作台。
  assert.equal(resolveAdminPostLoginTarget({
    admin: { role: 'organization', mustChangePassword: false }
  }, '/admin/overview/report'), '/admin/organization')
  // 强制改密码优先于一切跳转。
  assert.deepEqual(resolveAdminPostLoginTarget({
    admin: { role: 'organization', mustChangePassword: true }
  }, '/admin/overview'), {
    path: '/admin/organization',
    query: { password: 'required' }
  })
})
