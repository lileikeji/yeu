import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const serviceWorkerPath = resolve('.output/public/sw.js')
const offlinePage = readFileSync(resolve('public/offline.html'), 'utf8')

test('offline fallback uses student-facing language', () => {
  assert.match(offlinePage, /网络断开了/)
  assert.doesNotMatch(offlinePage, /PWA/)
  assert.match(offlinePage, /校园地图、路线和最新通知需要联网查看/)
  assert.doesNotMatch(offlinePage, /校园数据库/)
  assert.doesNotMatch(offlinePage, /地图瓦片|旧缓存/)
})

test('production service worker only provides the explicit offline navigation fallback', () => {
  const serviceWorker = readFileSync(serviceWorkerPath, 'utf8')

  assert.match(serviceWorker, /offline\.html/)
  assert.match(serviceWorker, /PrecacheFallbackPlugin/)
  assert.match(serviceWorker, /NetworkOnly/)
  assert.doesNotMatch(serviceWorker, /NavigationRoute|createHandlerBoundToURL/)
  assert.doesNotMatch(serviceWorker, /\/_nuxt\/[^"']+\.js/)
  assert.match(serviceWorker, /pathname\.startsWith\(["']\/admin["']\)/)
  assert.ok(serviceWorker.includes(String.raw`registerRoute(/\/api\//`))
})
