import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertSafeResolvedPublicHttpUrl,
  isBlockedNetworkHostname,
  isLiteralIpHostname,
  isSafePublicHttpUrl,
  parseSafePublicHttpUrl,
  parseSafeResolvedPublicHttpUrl
} from '../shared/utils/public-http-url'

test('accepts public https URLs', () => {
  assert.equal(isSafePublicHttpUrl('https://www.yeu.edu.cn/path'), true)
  assert.equal(isSafePublicHttpUrl('http://example.com'), true)
})

test('rejects credentials, non-http schemes, and overlong values', () => {
  assert.equal(isSafePublicHttpUrl('https://user:pass@example.com'), false)
  assert.equal(isSafePublicHttpUrl('file:///etc/passwd'), false)
  assert.equal(isSafePublicHttpUrl('javascript:alert(1)'), false)
  assert.equal(isSafePublicHttpUrl(`https://example.com/${'a'.repeat(3000)}`), false)
})

test('rejects loopback, private, link-local, and metadata hosts', () => {
  for (const host of [
    'localhost',
    'foo.localhost',
    '127.0.0.1',
    '10.0.0.5',
    '172.16.1.2',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    'metadata.google.internal'
  ]) {
    assert.equal(isBlockedNetworkHostname(host), true, host)
    const urlHost = host.includes(':') ? `[${host}]` : host
    assert.equal(isSafePublicHttpUrl(`http://${urlHost}/x`), false, host)
  }
})

test('allowPrivateNetwork opts into loopback for tests', () => {
  const url = parseSafePublicHttpUrl('http://127.0.0.1:3000/health', {
    allowPrivateNetwork: true
  })
  assert.ok(url)
  assert.equal(url.hostname, '127.0.0.1')
})

test('isLiteralIpHostname detects IPv4 and IPv6 literals', () => {
  assert.equal(isLiteralIpHostname('8.8.8.8'), true)
  assert.equal(isLiteralIpHostname('127.0.0.1'), true)
  assert.equal(isLiteralIpHostname('::1'), true)
  assert.equal(isLiteralIpHostname('example.com'), false)
})

test('resolved public URL accepts hostnames that resolve only to public IPs', async () => {
  const url = await assertSafeResolvedPublicHttpUrl('https://cdn.example.com/a', {
    lookup: async () => ['93.184.216.34']
  })
  assert.equal(url.hostname, 'cdn.example.com')
})

test('resolved public URL rejects DNS rebinding to private or metadata addresses', async () => {
  await assert.rejects(
    () => assertSafeResolvedPublicHttpUrl('https://evil.example/x', {
      lookup: async () => ['169.254.169.254']
    }),
    /DNS rebinding|non-public/i
  )
  await assert.rejects(
    () => assertSafeResolvedPublicHttpUrl('https://evil.example/x', {
      lookup: async () => ['1.2.3.4', '10.0.0.8']
    }),
    /DNS rebinding|non-public/i
  )
  const blocked = await parseSafeResolvedPublicHttpUrl('https://evil.example/x', {
    lookup: async () => ['192.168.0.2']
  })
  assert.equal(blocked, null)
})

test('resolved public URL fails closed when DNS is empty or throws', async () => {
  await assert.rejects(
    () => assertSafeResolvedPublicHttpUrl('https://missing.example/', {
      lookup: async () => []
    }),
    /no addresses|non-public/i
  )
  await assert.rejects(
    () => assertSafeResolvedPublicHttpUrl('https://broken.example/', {
      lookup: async () => { throw new Error('ENOTFOUND') }
    }),
    /DNS resolution failed|non-public/i
  )
})

test('resolved public URL skips DNS when allowPrivateNetwork is set', async () => {
  let lookedUp = false
  const url = await assertSafeResolvedPublicHttpUrl('http://127.0.0.1:3000/health', {
    allowPrivateNetwork: true,
    lookup: async () => {
      lookedUp = true
      return ['127.0.0.1']
    }
  })
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(lookedUp, false)
})
