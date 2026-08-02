import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  evaluateApiOrigin,
  isApiOriginExempt
} from '../server/utils/api-origin'

const SITE_ORIGINS = new Set(['https://yx.huiliyill.cn'])

test('API origin guard accepts explicit same-origin browser signals', () => {
  assert.deepEqual(
    evaluateApiOrigin({ origin: 'https://yx.huiliyill.cn' }, SITE_ORIGINS),
    { allowed: true, reason: 'origin' }
  )
  assert.deepEqual(
    evaluateApiOrigin({ secFetchSite: 'same-origin' }, SITE_ORIGINS),
    { allowed: true, reason: 'fetch-metadata' }
  )
  assert.deepEqual(
    evaluateApiOrigin({ referer: 'https://yx.huiliyill.cn/map?place=library' }, SITE_ORIGINS),
    { allowed: true, reason: 'referer' }
  )
})

test('API origin guard rejects direct and cross-site requests', () => {
  assert.deepEqual(
    evaluateApiOrigin({}, SITE_ORIGINS),
    { allowed: false, reason: 'missing-source' }
  )
  assert.deepEqual(
    evaluateApiOrigin({ origin: 'https://evil.example' }, SITE_ORIGINS),
    { allowed: false, reason: 'origin-mismatch' }
  )
  assert.deepEqual(
    evaluateApiOrigin({ secFetchSite: 'cross-site' }, SITE_ORIGINS),
    { allowed: false, reason: 'fetch-site-mismatch' }
  )
  assert.deepEqual(
    evaluateApiOrigin({ referer: 'https://evil.example/page' }, SITE_ORIGINS),
    { allowed: false, reason: 'referer-mismatch' }
  )
  assert.deepEqual(
    evaluateApiOrigin({ origin: 'https://yx.huiliyill.cn', secFetchSite: 'cross-site' }, SITE_ORIGINS),
    { allowed: false, reason: 'fetch-site-mismatch' }
  )
})

test('health and server callbacks remain reachable without page headers', () => {
  assert.equal(isApiOriginExempt('/api/health'), true)
  assert.equal(isApiOriginExempt('/api/integrations/wechat-mp'), true)
  assert.equal(isApiOriginExempt('/api/integrations/bots/qq-onebot'), true)
  assert.equal(isApiOriginExempt('/api/public/content'), false)
})

test('global API middleware and response context are wired', () => {
  const middleware = readFileSync('server/middleware/01-api-origin-guard.ts', 'utf8')
  const requestContext = readFileSync('server/middleware/request-context.ts', 'utf8')
  assert.match(middleware, /assertApiOrigin\(event\)/)
  assert.match(requestContext, /CDN-Cache-Control', 'no-store'/)
  assert.match(requestContext, /Cloudflare-CDN-Cache-Control', 'no-store'/)
  assert.match(requestContext, /Surrogate-Control', 'no-store'/)
})
