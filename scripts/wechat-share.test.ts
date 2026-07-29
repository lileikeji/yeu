import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildWechatJsSdkSignature,
  normalizeWechatShareUrl
} from '../server/modules/wechat/share'

const allowedHosts = [
  'yeu.huiliyill.cn',
  'global.yeu.huiliyill.cn',
  'cn.yeu.huiliyill.cn'
]

test('WeChat share signing accepts only the configured HTTPS sites and removes fragments', () => {
  assert.equal(
    normalizeWechatShareUrl(
      'https://yeu.huiliyill.cn/clubs/computer-association?a=1#contact',
      allowedHosts
    ),
    'https://yeu.huiliyill.cn/clubs/computer-association?a=1'
  )
  assert.equal(
    normalizeWechatShareUrl('https://global.yeu.huiliyill.cn/departments/student-union', allowedHosts),
    'https://global.yeu.huiliyill.cn/departments/student-union'
  )
  assert.throws(
    () => normalizeWechatShareUrl('https://yeu.huiliyill.cn.evil.example/clubs/test', allowedHosts),
    /分享页面地址不受支持/
  )
  assert.throws(
    () => normalizeWechatShareUrl('http://yeu.huiliyill.cn/clubs/test', allowedHosts),
    /分享页面地址不受支持/
  )
})

test('WeChat JS-SDK signature uses the required lowercase canonical parameter order', () => {
  assert.equal(
    buildWechatJsSdkSignature(
      'ticket-demo',
      'nonce-demo',
      1722222222,
      'https://yeu.huiliyill.cn/clubs/computer-association?a=1'
    ),
    'e10c15acaa480b10157652a10ae71a56512b957a'
  )
})

test('WeChat credentials stay server-side and public pages configure their own card content', () => {
  const runtimeConfig = readFileSync(resolve('nuxt.config.ts'), 'utf8')
  const endpoint = readFileSync(resolve('server/api/public/wechat-share.get.ts'), 'utf8')
  const composable = readFileSync(resolve('app/composables/useWechatShareCard.ts'), 'utf8')
  const club = readFileSync(resolve('app/pages/clubs/[slug].vue'), 'utf8')
  const department = readFileSync(resolve('app/pages/departments/[slug].vue'), 'utf8')

  assert.match(runtimeConfig, /wechatMpAppSecret: ''/)
  assert.doesNotMatch(runtimeConfig, /wechatMpAppSecret:\s*'[0-9a-f]{32}'/i)
  assert.match(endpoint, /runtimeConfig\.wechatMpAppSecret/)
  assert.match(endpoint, /CDN-Cache-Control', 'no-store'/)
  assert.doesNotMatch(endpoint, /appSecret[,\s}]*$/m)
  assert.match(composable, /updateAppMessageShareData/)
  assert.match(composable, /updateTimelineShareData/)
  assert.match(composable, /res\.wx\.qq\.com/)
  assert.match(club, /configureWechatShare/)
  assert.match(department, /configureWechatShare/)
})
