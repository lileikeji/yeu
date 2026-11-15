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
  resolveSecurityHeaders,
  shouldDisableCache,
  shouldDisableDocumentCache
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
  assert.match(BASE_SECURITY_HEADERS['Content-Security-Policy'], /form-action 'self'/)
  assert.match(BASE_SECURITY_HEADERS['Content-Security-Policy'], /https:\/\/res\.wx\.qq\.com/)
  assert.match(BASE_SECURITY_HEADERS['Permissions-Policy'], /geolocation=\(self\)/)
  assert.match(BASE_SECURITY_HEADERS['Permissions-Policy'], /camera=\(\)/)
})

test('all writes and sensitive authentication, admin, and feedback reads are no-store', () => {
  assert.equal(shouldDisableCache('POST', '/api/public/anything'), true)
  assert.equal(shouldDisableCache('GET', '/api/admin/places'), true)
  assert.equal(shouldDisableCache('GET', '/api/auth/status'), true)
  assert.equal(shouldDisableCache('GET', '/api/public/feedback'), true)
  assert.equal(shouldDisableCache('GET', '/api/public/guides'), true)
  assert.equal(shouldDisableCache('HEAD', '/icons/app-icon.svg'), false)
})

test('HTML documents bypass browser and CDN caches while hashed assets remain cacheable', () => {
  assert.equal(shouldDisableDocumentCache('GET', '/', 'text/html', 'document'), true)
  assert.equal(shouldDisableDocumentCache('GET', '/clubs/music-association', 'text/html', ''), true)
  assert.equal(shouldDisableDocumentCache('HEAD', '/map', '*/*', 'document'), true)
  assert.equal(shouldDisableDocumentCache('GET', '/_nuxt/entry.hash.css', 'text/css', 'style'), false)
  assert.equal(shouldDisableDocumentCache('GET', '/uploads/code.jpg', 'image/avif', 'image'), false)
  assert.equal(shouldDisableDocumentCache('GET', '/api/public/clubs', 'application/json', ''), false)
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
    const normalizedPath = relativePath.replaceAll('\\', '/')
    if (normalizedPath === 'panorama/campus.get.ts') {
      assert.ok(initialNoStore >= 0, `${relativePath} must start with no-store`)
      assert.match(source, /sendRedirect\(event, BAIDU_CAMPUS_PAGE_URL, 302\)/)
      assert.doesNotMatch(source, /'Cache-Control': 'public,/)
      continue
    }
    if (normalizedPath === 'notices/index.get.ts') {
      // 2026-11-10：改成「数据准备好之后再给 30 秒私有缓存」——
      // 响应里有按访客计算的 confirmed，不能上 CDN（setPublicCache 自带 s-maxage=0），
      // 但也不必连浏览器自己的前进/后退都重新打接口。错误路径在执行中抛出，
      // 到不了 setPublicCache，所以仍然是「只缓存成功响应」。
      assert.doesNotMatch(source, /'Cache-Control': 'public,/)
      assert.doesNotMatch(source, /setHeader\(event, 'Cache-Control', 'no-store'\)/)
      assert.ok(source.indexOf('setPublicCache(event, 30)') >= 0, `${relativePath} must cache for 30s`)
      assert.ok(
        source.indexOf('setPublicCache(event, 30)') > source.indexOf('listPublicNotices('),
        `${relativePath} must cache only after the data is prepared`
      )
      continue
    }
    if (normalizedPath === 'evidence/[claimId].get.ts') {
      // 证据链是只读的已发布结论，按 claimId 命中后可以给 5 分钟私有缓存；
      // 404 在执行中抛出，走不到 setPublicCache，所以缓存只覆盖成功响应。
      assert.doesNotMatch(source, /'Cache-Control': 'public,/)
      assert.doesNotMatch(source, /setHeader\(event, 'Cache-Control', 'no-store'\)/)
      assert.ok(source.indexOf('setPublicCache(event, 300)') >= 0, `${relativePath} must cache for 300s`)
      assert.ok(
        source.indexOf('setPublicCache(event, 300)') > source.indexOf('getClaimEvidence('),
        `${relativePath} must cache only after the evidence is loaded`
      )
      continue
    }
    if (normalizedPath === 'feedback/receipt/[code].get.ts') {
      // 回执状态会随处理进展变化，缓存窗口压到 60 秒；未命中直接 404 不缓存。
      assert.doesNotMatch(source, /'Cache-Control': 'public,/)
      assert.doesNotMatch(source, /setHeader\(event, 'Cache-Control', 'no-store'\)/)
      assert.ok(source.indexOf('setPublicCache(event, 60)') >= 0, `${relativePath} must cache for 60s`)
      assert.ok(
        source.indexOf('setPublicCache(event, 60)') > source.indexOf('getFeedbackByReceiptCode('),
        `${relativePath} must cache only after the receipt is loaded`
      )
      continue
    }
    if (normalizedPath === 'bus/eta.get.ts') {
      // 站间区间同一份实测样本对所有人相同，可以上 CDN 60 秒；
      // 参数非法时在执行中抛 400，走不到 setPublicCache，所以缓存只覆盖成功响应。
      assert.doesNotMatch(source, /'Cache-Control': 'public,/)
      assert.doesNotMatch(source, /setHeader\(event, 'Cache-Control', 'no-store'\)/)
      assert.ok(source.indexOf('setPublicCache(event, 60)') >= 0, `${relativePath} must cache for 60s`)
      assert.ok(
        source.indexOf('setPublicCache(event, 60)') > source.indexOf('buildBusSegmentProfile('),
        `${relativePath} must cache only after the profile is built`
      )
      continue
    }
    if (
      normalizedPath === 'track/stats.get.ts'
      || normalizedPath === 'competition/register/queue.get.ts'
      || normalizedPath === 'competition/call-board.get.ts'
    ) {
      assert.ok(initialNoStore >= 0, `${relativePath} must start with no-store`)
      assert.doesNotMatch(source, /'Cache-Control': 'public,/)
      continue
    }
    if (normalizedPath === 'transit/plan.get.ts') {
      assert.ok(initialNoStore >= 0, `${relativePath} must start with no-store`)
      assert.match(source, /private, max-age=30, s-maxage=0/)
      assert.match(source, /CDN-Cache-Control.*no-store/)
      continue
    }
    if (normalizedPath === 'wechat-share.get.ts') {
      assert.ok(initialNoStore >= 0, `${relativePath} must start with no-store`)
      assert.match(source, /CDN-Cache-Control', 'no-store'/)
      assert.doesNotMatch(source, /setPublicCache/)
      continue
    }
    const publicCache = source.indexOf('setPublicCache(event,')
    assert.ok(initialNoStore >= 0, `${relativePath} must start with no-store`)
    assert.ok(publicCache > initialNoStore, `${relativePath} must only cache successful responses`)
  }

  const cacheHelper = readFileSync(join(process.cwd(), 'server/utils/http.ts'), 'utf8')
  assert.match(cacheHelper, /private, max-age=\$\{maxAge\}, stale-while-revalidate=\$\{maxAge \* 5\}/)
  assert.match(cacheHelper, /CDN-Cache-Control', 'no-store'/)
  assert.match(cacheHelper, /Cloudflare-CDN-Cache-Control', 'no-store'/)

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
  assert.match(middleware, /shouldDisableDocumentCache\(/)
  assert.match(middleware, /CDN-Cache-Control', 'no-store'/)
  assert.match(middleware, /Edge-Control', 'no-store'/)
  assert.match(middleware, /new URL\(request\.url \?\? '\/', 'http:\/\/localhost'\)\.pathname/)
  assert.doesNotMatch(middleware, /getRequestURL|getHeader|getMethod|setHeader\(event/)
  assert.match(middleware, /JSON\.stringify\(entry\)/)
  assert.doesNotMatch(middleware, /getRequestIP|remoteAddress|cookie|authorization|searchParams/)
})

test('resolveSecurityHeaders adds upgrade-insecure-requests only for production HTTPS sites', () => {
  const base = resolveSecurityHeaders({ nodeEnv: 'development', siteUrl: 'https://example.com' })
  assert.equal(base['Content-Security-Policy'], BASE_SECURITY_HEADERS['Content-Security-Policy'])
  assert.doesNotMatch(base['Content-Security-Policy'], /upgrade-insecure-requests/)

  const prodHttp = resolveSecurityHeaders({ nodeEnv: 'production', siteUrl: 'http://example.com' })
  assert.doesNotMatch(prodHttp['Content-Security-Policy'], /upgrade-insecure-requests/)

  const prodHttps = resolveSecurityHeaders({ nodeEnv: 'production', siteUrl: 'https://yeu.example.com' })
  assert.match(prodHttps['Content-Security-Policy'], /form-action 'self'/)
  assert.match(prodHttps['Content-Security-Policy'], /upgrade-insecure-requests/)
  assert.equal(prodHttps['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains')
  assert.equal(prodHttps['Cross-Origin-Opener-Policy'], 'same-origin')
  assert.equal(prodHttps['Cross-Origin-Resource-Policy'], 'same-site')

  assert.equal(base['Strict-Transport-Security'], undefined)
  assert.equal(prodHttp['Strict-Transport-Security'], undefined)
})

test('CSP allows the AMap eval requirement on every route, not just /map', () => {
  // The AMap WebGL renderer builds shaders with eval. A /map-only policy broke
  // client-side navigation: the browser keeps the CSP from the document it
  // loaded, so arriving from '/' left the map without 'unsafe-eval' and AMap
  // failed with "Module.WebGLRender is not a constructor" and a 0x0 canvas.
  const map = resolveSecurityHeaders({ pathname: '/map' })
  const mapChild = resolveSecurityHeaders({ pathname: '/map/place/campus-gate' })
  const home = resolveSecurityHeaders({ pathname: '/' })
  const api = resolveSecurityHeaders({ pathname: '/api/public/places' })

  for (const headers of [map, mapChild, home, api]) {
    assert.match(headers['Content-Security-Policy'], /script-src [^;]*'unsafe-eval'/)
  }

  // The policy must not depend on the path at all.
  assert.equal(home['Content-Security-Policy'], map['Content-Security-Policy'])
})

test('framework fingerprint header is stripped by middleware and nitro plugin', () => {
  const middleware = readFileSync(join(process.cwd(), 'server/middleware/request-context.ts'), 'utf8')
  const plugin = readFileSync(join(process.cwd(), 'server/plugins/strip-powered-by.ts'), 'utf8')
  assert.match(middleware, /resolveSecurityHeaders\(\{ pathname \}\)/)
  assert.match(middleware, /removeHeader\(['"]x-powered-by['"]\)/)
  assert.match(plugin, /beforeResponse/)
  assert.match(plugin, /afterResponse/)
  assert.match(plugin, /render:response/)
  assert.match(plugin, /removeResponseHeader/)
  assert.match(plugin, /x-powered-by/i)
})

test('production origin allowlist empty is explicit server misconfiguration', () => {
  const security = readFileSync(join(process.cwd(), 'server/utils/security.ts'), 'utf8')
  assert.match(security, /ORIGIN_ALLOWLIST_EMPTY/)
  assert.match(security, /allowed\.size === 0/)
  assert.match(security, /statusCode: 500/)
})

test('admin UI and admin API route rules force no-store and noindex', () => {
  const nuxtConfig = readFileSync(join(process.cwd(), 'nuxt.config.ts'), 'utf8')
  assert.match(nuxtConfig, /'\/admin\/\*\*'/)
  assert.match(nuxtConfig, /'\/api\/admin\/\*\*'/)
  assert.match(nuxtConfig, /Cache-Control': 'private, no-store'/)
  assert.match(nuxtConfig, /X-Robots-Tag': 'noindex, nofollow'/)
})
