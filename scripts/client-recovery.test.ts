import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolveRecoveryUrl } from '../app/utils/client-recovery'

test('recovery keeps the requested page and adds a cache-busting query', () => {
  const target = resolveRecoveryUrl(
    'https://yeu.example/map?place=dorm#details',
    undefined,
    null,
    123456
  )

  assert.equal(target.pathname, '/map')
  assert.equal(target.searchParams.get('place'), 'dorm')
  assert.equal(target.searchParams.get('_recover'), '123456')
  assert.equal(target.hash, '#details')
})

test('a repeated recovery falls back to the home page', () => {
  const target = resolveRecoveryUrl(
    'https://yeu.example/map?place=dorm',
    undefined,
    { at: 123000, pathname: '/map' },
    123456
  )

  assert.equal(target.pathname, '/')
  assert.equal(target.searchParams.has('_recover'), false)
  assert.equal(target.searchParams.has('place'), false)
})

test('a recovery URL never appends another recovery token', () => {
  const target = resolveRecoveryUrl(
    'https://yeu.example/search?q=dorm&_recover=123000',
    undefined,
    null,
    123456
  )

  assert.equal(target.pathname, '/')
  assert.equal(target.search, '')
})

test('explicit recovery actions remain usable after a failed attempt', () => {
  const target = resolveRecoveryUrl(
    'https://yeu.example/search?q=dorm&_recover=123000',
    '/map',
    null,
    123456
  )

  assert.equal(target.pathname, '/map')
  assert.equal(target.search, '')
})

test('error and update views use the full recovery flow instead of reload', () => {
  const errorPage = readFileSync('app/error.vue', 'utf8')
  const updatePrompt = readFileSync('app/components/PwaUpdatePrompt.vue', 'utf8')

  assert.match(errorPage, /recoverClientPage/)
  assert.match(updatePrompt, /recoverClientPage/)
  assert.doesNotMatch(errorPage, /location\.reload/)
  assert.doesNotMatch(updatePrompt, /location\.reload/)
})

test('service worker builds never fall back to a shared local filename', () => {
  const config = readFileSync('nuxt.config.ts', 'utf8')

  assert.match(config, /build-\$\{Date\.now\(\)\.toString\(36\)\}/)
  assert.doesNotMatch(config, /\|\|\s*['"]local['"]/)
})

test('HTML and service-worker bootstrap responses cannot be cached by a CDN', () => {
  const documentMiddleware = readFileSync('server/middleware/document-no-cache.ts', 'utf8')
  const pwaMiddleware = readFileSync('server/middleware/pwa-no-cache.ts', 'utf8')
  const config = readFileSync('nuxt.config.ts', 'utf8')

  assert.match(documentMiddleware, /accept\.includes\(['"]text\/html['"]\)/)
  assert.match(documentMiddleware, /CDN-Cache-Control['"]?: ['"]no-store/)
  assert.match(pwaMiddleware, /registerSW\.js/)
  assert.match(pwaMiddleware, /CDN-Cache-Control['"]?: ['"]no-store/)
  assert.match(config, /\[`\/sw-\$\{serviceWorkerBuildId\}\.js`\]/)
  assert.match(config, /pwaBootstrapNoCacheHeaders/)
})
