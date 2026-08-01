import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildWechatJsSdkSignature,
  normalizeWechatShareUrl
} from '../server/modules/wechat/share'

const allowedHosts = ['yx.huiliyill.cn']

test('WeChat share signing accepts only the configured HTTPS sites and removes fragments', () => {
  assert.equal(
    normalizeWechatShareUrl(
      'https://yx.huiliyill.cn/clubs/computer-association?a=1#contact',
      allowedHosts
    ),
    'https://yx.huiliyill.cn/clubs/computer-association?a=1'
  )
  assert.equal(
    normalizeWechatShareUrl('https://yx.huiliyill.cn/departments/student-union', allowedHosts),
    'https://yx.huiliyill.cn/departments/student-union'
  )
  assert.throws(
    () => normalizeWechatShareUrl('https://yx.huiliyill.cn.evil.example/clubs/test', allowedHosts),
    /分享页面地址不受支持/
  )
  assert.throws(
    () => normalizeWechatShareUrl('http://yx.huiliyill.cn/clubs/test', allowedHosts),
    /分享页面地址不受支持/
  )
})

test('WeChat JS-SDK signature uses the required lowercase canonical parameter order', () => {
  assert.equal(
    buildWechatJsSdkSignature(
      'ticket-demo',
      'nonce-demo',
      1722222222,
      'https://yx.huiliyill.cn/clubs/computer-association?a=1'
    ),
    '88433fd165b55ff861944c530f12f27e14c1e167'
  )
})

test('WeChat credentials stay server-side and route sharing uses one automatic SDK entry', () => {
  const runtimeConfig = readFileSync(resolve('nuxt.config.ts'), 'utf8')
  const endpoint = readFileSync(resolve('server/api/public/wechat-share.get.ts'), 'utf8')
  const composable = readFileSync(resolve('app/composables/useWechatShareCard.ts'), 'utf8')
  const shareActions = readFileSync(resolve('app/composables/useShareActions.ts'), 'utf8')
  const layout = readFileSync(resolve('app/layouts/default.vue'), 'utf8')
  const plugin = readFileSync(resolve('app/plugins/wechat-share.client.ts'), 'utf8')
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
  assert.match(composable, /sdk\.ready\([\s\S]*sdk\.config\(/)
  assert.doesNotMatch(composable, /signature\.url !== signedUrl/)
  // WeChat validates wx.config against the URL that loaded the page. On iOS
  // that never changes after pushState, so the entry URL must be captured once
  // and reused for signing instead of reading location.href per route.
  assert.match(composable, /entryPageUrl/)
  assert.match(composable, /if \(entryPageUrl\) return entryPageUrl/)
  assert.match(plugin, /configureWechatShare/)
  assert.match(plugin, /lastScheduledRouteKey/)
  assert.doesNotMatch(layout, /configureWechatShare/)
  assert.doesNotMatch(club, /configureWechatShare/)
  assert.doesNotMatch(department, /configureWechatShare/)
  assert.match(shareActions, /微信分享未就绪/)
  assert.match(shareActions, /Do not fall through to clipboard sharing/)
})
