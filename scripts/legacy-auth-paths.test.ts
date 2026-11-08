import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function walkFiles(rootDir: string, predicate: (name: string) => boolean): string[] {
  const out: string[] = []
  for (const entry of readdirSync(rootDir)) {
    const full = join(rootDir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walkFiles(full, predicate))
    else if (predicate(entry)) out.push(full)
  }
  return out
}

test('user auth routes exist without restoring the deprecated status handler', () => {
  for (const rel of [
    'server/api/auth/login.post.ts',
    'server/api/auth/logout.post.ts',
    'server/api/auth/session.get.ts'
  ]) {
    assert.equal(existsSync(join(process.cwd(), rel)), true, rel)
  }
  for (const rel of [
    'server/api/auth/status.get.ts',
    'server/utils/legacy-auth-deprecation.ts'
  ]) {
    assert.equal(existsSync(join(process.cwd(), rel)), false, 'deprecated auth file must not exist: ' + rel)
  }
})

test('admin UI only calls /api/admin/auth/* and never user auth routes', () => {
  const roots = [
    join(process.cwd(), 'app/pages/admin'),
    join(process.cwd(), 'app/components/admin')
  ]
  const files = [
    ...roots.flatMap(rootDir => walkFiles(rootDir, name => /\.(vue|ts|js|mjs)$/.test(name))),
    join(process.cwd(), 'app/layouts/admin.vue')
  ]
  const offenders: string[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const userAuthPaths = text.match(/['"`]\/api\/auth\/(login|logout|session)/g)
    if (userAuthPaths?.length) offenders.push(file + ': ' + userAuthPaths.join(', '))
  }
  assert.deepEqual(offenders, [], 'user auth paths found in admin UI:\n' + offenders.join('\n'))
})

test('canonical admin auth handlers exist', () => {
  for (const rel of [
    'server/api/admin/auth/login.post.ts',
    'server/api/admin/auth/logout.post.ts',
    'server/api/admin/auth/session.get.ts'
  ]) {
    assert.equal(existsSync(join(process.cwd(), rel)), true, rel)
  }
})

test('admin auth entry points keep their per-IP rate limits', () => {
  const login = readFileSync(join(process.cwd(), 'server/api/admin/auth/login.post.ts'), 'utf8')
  assert.match(login, /assertRateLimit\(/, 'admin login must keep per-IP rate limiting (brute-force gate)')
  const passwordChange = readFileSync(join(process.cwd(), 'server/api/admin/auth/password.post.ts'), 'utf8')
  assert.match(passwordChange, /assertRateLimit\(/, 'admin password change must keep per-IP rate limiting')
})
