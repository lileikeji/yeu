import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { checkSourceLink, checkSourceLinks } from './check-source-links'

test('source checker follows redirects and falls back to GET when HEAD is unsupported', async (context) => {
  const server = createServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: '/ok' }).end()
      return
    }
    if (request.url === '/fallback' && request.method === 'HEAD') {
      response.writeHead(405).end()
      return
    }
    if (request.url === '/missing') {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`

  const results = await checkSourceLinks([
    { id: 'redirect', title: 'Redirect', url: `${base}/redirect` },
    { id: 'fallback', title: 'Fallback', url: `${base}/fallback` },
    { id: 'missing', title: 'Missing', url: `${base}/missing` }
  ], { concurrency: 2, timeoutMs: 2_000 })

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
  assert.equal(results[0]?.finalUrl, `${base}/ok`)
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
