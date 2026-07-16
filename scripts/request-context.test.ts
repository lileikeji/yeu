import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  BASE_SECURITY_HEADERS,
  createRequestLogEntry,
  normalizeIncomingRequestId,
  requestLoggingEnabled,
  resolveRequestId,
  shouldDisableCache
} from '../server/utils/request-context'

test('request IDs accept a restricted proxy-safe format and replace untrusted values', () => {
  assert.equal(normalizeIncomingRequestId('edge-01:abc_123.9'), 'edge-01:abc_123.9')
  assert.equal(normalizeIncomingRequestId(''), null)
  assert.equal(normalizeIncomingRequestId(' bad'), null)
  assert.equal(normalizeIncomingRequestId('bad/request'), null)
  assert.equal(normalizeIncomingRequestId('a'.repeat(101)), null)
  assert.equal(resolveRequestId('bad request', () => 'generated-id'), 'generated-id')
  assert.equal(resolveRequestId('trusted-id', () => 'unused'), 'trusted-id')
})

test('baseline security headers prevent sniffing and framing without blocking field geolocation', () => {
  assert.equal(BASE_SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff')
  assert.equal(BASE_SECURITY_HEADERS['X-Frame-Options'], 'DENY')
  assert.match(BASE_SECURITY_HEADERS['Content-Security-Policy'], /frame-ancestors 'none'/)
  assert.match(BASE_SECURITY_HEADERS['Content-Security-Policy'], /object-src 'none'/)
  assert.match(BASE_SECURITY_HEADERS['Permissions-Policy'], /geolocation=\(self\)/)
  assert.match(BASE_SECURITY_HEADERS['Permissions-Policy'], /camera=\(\)/)
})

test('all writes and sensitive authentication, admin, and feedback reads are no-store', () => {
  assert.equal(shouldDisableCache('POST', '/api/public/anything'), true)
  assert.equal(shouldDisableCache('GET', '/api/admin/places'), true)
  assert.equal(shouldDisableCache('GET', '/api/auth/status'), true)
  assert.equal(shouldDisableCache('GET', '/api/public/feedback'), true)
  assert.equal(shouldDisableCache('GET', '/api/public/guides'), false)
  assert.equal(shouldDisableCache('HEAD', '/icons/app-icon.svg'), false)
})

test('public read APIs only enable short caching after successful data preparation', () => {
  const publicApiRoot = join(process.cwd(), 'server/api/public')
  const publicGetRoutes = readdirSync(publicApiRoot, {
    encoding: 'utf8',
    recursive: true
  }).filter(entry => entry.endsWith('.get.ts'))

  assert.ok(publicGetRoutes.length >= 10)
  for (const relativePath of publicGetRoutes) {
    const source = readFileSync(join(publicApiRoot, relativePath), 'utf8')
    const initialNoStore = source.indexOf('setHeader(event, \'Cache-Control\', \'no-store\')')
    const publicCache = source.indexOf('setPublicCache(event,')
    assert.ok(initialNoStore >= 0, `${relativePath} must start with no-store`)
    assert.ok(publicCache > initialNoStore, `${relativePath} must only cache successful responses`)
  }

  const cacheHelper = readFileSync(join(process.cwd(), 'server/utils/http.ts'), 'utf8')
  assert.match(cacheHelper, /public, max-age=\$\{maxAge\}, stale-while-revalidate=\$\{maxAge \* 5\}/)

  const feedback = readFileSync(join(publicApiRoot, 'feedback.post.ts'), 'utf8')
  assert.match(feedback, /Cache-Control', 'no-store'/)
  assert.doesNotMatch(feedback, /setPublicCache/)
})

test('structured request logs exclude query strings and use stable status error codes', () => {
  const entry = createRequestLogEntry({
    requestId: 'request-1',
    method: 'get',
    pathname: '/api/public/search',
    statusCode: 503,
    durationMs: 12.345,
    now: Date.parse('2026-07-16T03:30:00+08:00')
  })
  assert.deepEqual(entry, {
    event: 'http_request',
    timestamp: '2026-07-15T19:30:00.000Z',
    requestId: 'request-1',
    method: 'GET',
    route: '/api/public/search',
    statusCode: 503,
    durationMs: 12.3,
    errorCode: 'HTTP_503',
    aborted: false
  })
  assert.doesNotMatch(JSON.stringify(entry), /query|cookie|password|longitude|latitude|ip/i)
  assert.equal(requestLoggingEnabled('production', undefined), true)
  assert.equal(requestLoggingEnabled('production', 'false'), false)
  assert.equal(requestLoggingEnabled('development', 'true'), true)
})

test('global middleware applies request context without collecting client identifiers', () => {
  const middleware = readFileSync(join(process.cwd(), 'server/middleware/request-context.ts'), 'utf8')
  assert.match(middleware, /event\.context\.requestId = requestId/)
  assert.match(middleware, /response\.setHeader\('X-Request-Id', requestId\)/)
  assert.match(middleware, /shouldDisableCache\(method, pathname\)/)
  assert.match(middleware, /new URL\(request\.url \?\? '\/', 'http:\/\/localhost'\)\.pathname/)
  assert.doesNotMatch(middleware, /getRequestURL|getHeader|getMethod|setHeader\(event/)
  assert.match(middleware, /JSON\.stringify\(entry\)/)
  assert.doesNotMatch(middleware, /getRequestIP|remoteAddress|cookie|authorization|searchParams/)
})
