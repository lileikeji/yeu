import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('admin login asserts trusted origin before parseBody', () => {
  const source = readFileSync(join(process.cwd(), 'server/api/admin/auth/login.post.ts'), 'utf8')
  const originIdx = source.indexOf('assertTrustedOrigin(event)')
  const parseIdx = source.indexOf('parseBody(event, loginSchema)')
  assert.ok(originIdx >= 0, 'must call assertTrustedOrigin')
  assert.ok(parseIdx >= 0, 'must call parseBody')
  assert.ok(originIdx < parseIdx, 'origin check must run before body parse')
  assert.match(source, /from '\.\.\/\.\.\/\.\.\/utils\/security'/)
})
