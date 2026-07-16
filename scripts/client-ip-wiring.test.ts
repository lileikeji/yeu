import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

test('rate-limited public and auth IP resolution uses hardened client-ip helper', () => {
  const root = process.cwd()
  const files = [
    'server/utils/auth.ts',
    'server/api/public/search.get.ts',
    'server/api/public/feedback.post.ts',
    'server/api/public/amap-owner-drafts.get.ts'
  ]
  for (const rel of files) {
    const source = readFileSync(join(root, rel), 'utf8')
    assert.match(source, /getClientIpAddress/, `${rel} must use getClientIpAddress`)
    assert.doesNotMatch(
      source,
      /getRequestIP\(event,\s*\{\s*xForwardedFor/,
      `${rel} must not read XFF directly`
    )
  }

  const middleware = readFileSync(join(root, 'server/middleware/public-api-rate-limit.ts'), 'utf8')
  assert.match(middleware, /assertRateLimit/)
  assert.match(middleware, /getClientIpAddress/)
  assert.match(middleware, /public-api:/)
})
