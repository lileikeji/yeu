import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('计协后台保留专属登录页入口', () => {
  const login = read('app/pages/admin/login.vue')
  assert.match(login, /isYeucaHost/)
  assert.doesNotMatch(login, /isLegacyConsole/)
})

test('计协后台保留按组织角色校验路由的守卫', () => {
  const layout = read('app/layouts/admin.vue')
  assert.match(layout, /isOrganizationRouteAllowed/)
  assert.match(layout, /enforceOrganizationRouteScope/)
})

test('站点保留计协主站互链', () => {
  for (const path of ['app/layouts/default.vue', 'app/pages/about.vue', 'app/pages/clubs/[slug].vue']) {
    assert.match(read(path), /yeuca\.huiliyill\.cn/, `${path} 缺少计协主站入口`)
  }
})
