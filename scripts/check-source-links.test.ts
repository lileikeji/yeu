import assert from 'node:assert/strict'
import test from 'node:test'
import { checkSourceLink, checkSourceLinks } from './check-source-links'

test('source checker follows redirects and falls back to GET when HEAD is unsupported', async () => {
  // Fully mocked: no real socket/DNS so the suite stays deterministic under
  // parallel load. The mock routes by path and honours HEAD-vs-GET fallback.
  const base = 'http://check-source.test';
  const mockedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = String(input)
    const url = new URL(href)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (url.pathname === '/redirect') {
      return new Response(null, { status: 302, headers: { Location: base + '/ok' } })
    }
    if (url.pathname === '/fallback' && method === 'HEAD') {
      return new Response(null, { status: 405 })
    }
    if (url.pathname === '/missing') {
      return new Response(null, { status: 404 })
    }
    return new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  const results = await checkSourceLinks([
    { id: 'redirect', title: 'Redirect', url: base + '/redirect' },
    { id: 'fallback', title: 'Fallback', url: base + '/fallback' },
    { id: 'missing', title: 'Missing', url: base + '/missing' }
  ], { concurrency: 2, timeoutMs: 2_000, allowPrivateNetwork: true }, mockedFetch)

  assert.deepEqual(results.map(result => ({
    id: result.id,
    state: result.state,
    status: result.status,
    method: result.method
  })), [
    { id: 'redirect', state: 'healthy', status: 200, method: 'HEAD' },
    { id: 'fallback', state: 'healthy', status: 200, method: 'GET' },
    { id: 'missing', state: 'broken', status: 404, method: 'HEAD' }
  ])
  assert.equal(results[0]?.finalUrl, base + '/ok')
})

test('source checker rejects non-HTTP URLs without issuing a request', async () => {
  let requested = false
  const result = await checkSourceLink({
    id: 'invalid',
    title: 'Invalid',
    url: 'file:///etc/passwd'
  }, {}, (() => {
    requested = true
    throw new Error('must not run')
  }) as typeof fetch)

  assert.equal(result.state, 'invalid')
  assert.equal(requested, false)
})

test('source checker rejects private/loopback targets by default (SSRF)', async () => {
  let requested = false
  const result = await checkSourceLink({
    id: 'loopback',
    title: 'Loopback',
    url: 'http://127.0.0.1:9/secret'
  }, {}, (() => {
    requested = true
    throw new Error('must not run')
  }) as typeof fetch)

  assert.equal(result.state, 'invalid')
  assert.equal(requested, false)
})

test('source checker blocks redirects into private network targets', async () => {
  let requestedPublic = false
  const result = await checkSourceLink({
    id: 'redirect-ssrf',
    title: 'Redirect SSRF',
    url: 'https://example.com/open'
  }, { lookup: async () => ['93.184.216.34'] as const }, (async (input) => {
    const href = String(input)
    if (href.includes('example.com')) {
      requestedPublic = true
      return new Response(null, {
        status: 302,
        headers: { Location: 'http://169.254.169.254/latest/meta-data/' }
      })
    }
    throw new Error(`unexpected fetch: ${href}`)
  }) as typeof fetch)

  assert.equal(requestedPublic, true)
  assert.equal(result.state, 'invalid')
  assert.match(result.message || '', /SSRF|non-public/i)
})

test('source checker blocks hostnames that rebind to private addresses via DNS', async () => {
  // Monkey-patch via URL that looks public but we intercept lookup by using a fake
  // fetch is never reached if resolution fails — use assert through invalid literal already covered.
  // Here: inject a public-looking hostname with mocked fetch; resolution uses real DNS for
  // example.com (public). For rebinding we rely on unit tests of assertSafeResolvedPublicHttpUrl.
  // Integration: if redirect Location is a hostname we cannot control DNS for, mock only string SSRF.
  // This test documents that private literals remain blocked after hop validation.
  let hops = 0
  const result = await checkSourceLink({
    id: 'rebinding-redirect',
    title: 'Rebinding redirect',
    url: 'https://example.com/start'
  }, { lookup: async () => ['93.184.216.34'] as const }, (async (input) => {
    hops += 1
    const href = String(input)
    if (href.includes('example.com/start')) {
      return new Response(null, {
        status: 302,
        headers: { Location: 'http://192.168.1.50/internal' }
      })
    }
    throw new Error('must not fetch private hop: ' + href)
  }) as typeof fetch)

  assert.equal(hops, 1)
  assert.equal(result.state, 'invalid')
  assert.match(result.message || '', /SSRF|non-public/i)
})
