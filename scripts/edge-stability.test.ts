import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('client fallback never redirects between CDN hostnames', () => {
  const source = readFileSync(resolve('app/plugins/edge-route.client.ts'), 'utf8')
  assert.match(source, /yeu_fast_edge=; Max-Age=0/)
  assert.doesNotMatch(source, /location\.replace/)
  assert.doesNotMatch(source, /fetch\(/)
})

test('transit cache hits bypass both public API rate-limit layers', () => {
  const middleware = readFileSync(resolve('server/middleware/public-api-rate-limit.ts'), 'utf8')
  const handler = readFileSync(resolve('server/api/public/transit/plan.get.ts'), 'utf8')

  assert.match(middleware, /'\/api\/public\/transit\/plan'/)
  assert.ok(
    handler.indexOf('const cached = responseCache.get(cacheKey)')
    < handler.indexOf('assertRateLimit(event, `public:transit:'),
    'cached transit responses must be returned before the per-address limiter'
  )
  assert.match(handler, /assertRateLimit\(event, 'public:transit:global', 120, 60_000\)/)
})
