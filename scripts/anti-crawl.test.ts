import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CRAWL_TRAP_ACTION,
  CRAWL_TRAP_PATH,
  CRAWL_TRAP_TTL_MS,
  isAutomationUserAgent,
  isCrawlerProtectedPath
} from '../server/utils/anti-crawl'

test('known automation user agents are identified explicitly', () => {
  assert.equal(isAutomationUserAgent('Mozilla/5.0 HeadlessChrome/150.0.0.0'), true)
  assert.equal(isAutomationUserAgent('GPTBot/1.4'), true)
  assert.equal(isAutomationUserAgent('Mozilla/5.0 (compatible; OAI-SearchBot/1.0)'), true)
  assert.equal(isAutomationUserAgent('Mozilla/5.0 (Linux; Android 14) MicroMessenger/8.0'), false)
  assert.equal(isAutomationUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0'), false)
})

test('only public documents and APIs are protected by the app fallback', () => {
  assert.equal(isCrawlerProtectedPath('/'), true)
  assert.equal(isCrawlerProtectedPath('/map'), true)
  assert.equal(isCrawlerProtectedPath('/api/public/search'), true)
  assert.equal(isCrawlerProtectedPath('/api/admin/visitors'), false)
  assert.equal(isCrawlerProtectedPath('/api/health'), false)
  assert.equal(isCrawlerProtectedPath('/_nuxt/app.js'), false)
  assert.equal(isCrawlerProtectedPath('/images/campus.png'), false)
})

test('honeypot identity and ban window stay stable', () => {
  assert.equal(CRAWL_TRAP_PATH, '/__yeu_crawl_trap__')
  assert.equal(CRAWL_TRAP_ACTION, 'crawler_honeypot')
  assert.equal(CRAWL_TRAP_TTL_MS, 30 * 60 * 1000)
})
