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

test('legacy /api/auth/* route handlers are removed', () => {
  const legacyFiles = [
    join(process.cwd(), 'server/api/auth/login.post.ts'),
    join(process.cwd(), 'server/api/auth/logout.post.ts'),
    join(process.cwd(), 'server/api/auth/status.get.ts'),
    join(process.cwd(), 'server/utils/legacy-auth-deprecation.ts')
  ]
  for (const file of legacyFiles) {
    assert.equal(existsSync(file), false, 'legacy auth file must not exist: ' + file)
  }
})

test('admin UI only calls /api/admin/auth/* (not legacy /api/auth/*)', () => {
  const roots = [
    join(process.cwd(), 'app'),
    join(process.cwd(), 'shared'),
    join(process.cwd(), 'server')
  ]
  const files = roots.flatMap(rootDir => walkFiles(rootDir, name => /\.(vue|ts|js|mjs)$/.test(name)))
  const offenders: string[] = []
  for (const file of files) {
    // Skip nothing under server/api/auth except .gitkeep (handlers deleted)
    const text = readFileSync(file, 'utf8')
    const legacy = text.match(/['"`]\/api\/auth\/(login|logout|status)/g)
    if (legacy?.length) offenders.push(file + ': ' + legacy.join(', '))
  }
  assert.deepEqual(offenders, [], 'legacy /api/auth paths found:\n' + offenders.join('\n'))
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
