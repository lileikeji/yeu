import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  forceHttpsEnabled,
  isSafeRedirectHost,
  shouldRedirectToHttps
} from '../server/utils/force-https'

test('forceHttpsEnabled only accepts true/1', () => {
  assert.equal(forceHttpsEnabled({}), false)
  assert.equal(forceHttpsEnabled({ NUXT_FORCE_HTTPS: 'false' }), false)
  assert.equal(forceHttpsEnabled({ NUXT_FORCE_HTTPS: 'true' }), true)
  assert.equal(forceHttpsEnabled({ FORCE_HTTPS: '1' }), true)
  assert.equal(forceHttpsEnabled({ NUXT_FORCE_HTTPS: 'yes' }), false)
})

test('isSafeRedirectHost rejects header injection and junk hosts', () => {
  assert.equal(isSafeRedirectHost('yeu.huiliyill.cn'), true)
  assert.equal(isSafeRedirectHost('yeu.huiliyill.cn:443'), true)
  assert.equal(isSafeRedirectHost('[::1]'), true)
  assert.equal(isSafeRedirectHost('evil.com\r\nLocation: https://phish'), false)
  assert.equal(isSafeRedirectHost('evil.com,other'), false)
  assert.equal(isSafeRedirectHost('user@evil.com'), false)
  assert.equal(isSafeRedirectHost('evil.com/path'), false)
  assert.equal(isSafeRedirectHost(''), false)
  assert.equal(isSafeRedirectHost('a'.repeat(300)), false)
})

test('shouldRedirectToHttps redirects cleartext only when enabled', () => {
  assert.deepEqual(
    shouldRedirectToHttps({
      forceHttps: false,
      requestProtocol: 'http',
      host: 'yeu.example.com',
      pathname: '/admin'
    }),
    { redirect: false }
  )

  assert.deepEqual(
    shouldRedirectToHttps({
      forceHttps: true,
      requestProtocol: 'https',
      host: 'yeu.example.com',
      pathname: '/admin'
    }),
    { redirect: false }
  )

  assert.deepEqual(
    shouldRedirectToHttps({
      forceHttps: true,
      forwardedProto: 'https',
      requestProtocol: 'http',
      host: 'yeu.example.com',
      pathname: '/admin'
    }),
    { redirect: false }
  )

  assert.deepEqual(
    shouldRedirectToHttps({
      forceHttps: true,
      requestProtocol: 'http',
      host: 'yeu.example.com',
      pathname: '/admin/login',
      search: '?next=/dashboard'
    }),
    {
      redirect: true,
      location: 'https://yeu.example.com/admin/login?next=/dashboard'
    }
  )
})

test('shouldRedirectToHttps skips loopback and unsafe hosts/paths', () => {
  for (const host of ['localhost', '127.0.0.1', '::1', '0.0.0.0', '127.0.0.1:3000']) {
    assert.deepEqual(
      shouldRedirectToHttps({
        forceHttps: true,
        requestProtocol: 'http',
        host,
        pathname: '/api/health'
      }),
      { redirect: false },
      host
    )
  }

  assert.deepEqual(
    shouldRedirectToHttps({
      forceHttps: true,
      requestProtocol: 'http',
      host: 'evil.com\r\nX-Injected: 1',
      pathname: '/'
    }),
    { redirect: false }
  )

  assert.deepEqual(
    shouldRedirectToHttps({
      forceHttps: true,
      requestProtocol: 'http',
      host: 'yeu.example.com',
      pathname: '//evil.example'
    }),
    { redirect: false }
  )
})

test('force-https middleware is opt-in and uses the pure helper', () => {
  const source = readFileSync(join(process.cwd(), 'server/middleware/force-https.ts'), 'utf8')
  assert.match(source, /forceHttpsEnabled/)
  assert.match(source, /shouldRedirectToHttps/)
  assert.match(source, /sendRedirect\(event, decision\.location, 301\)/)
  assert.match(source, /x-forwarded-proto/)
  assert.doesNotMatch(source, /x-forwarded-host/)
  assert.match(source, /getRequestHeader\(event, 'host'\)/)
})
