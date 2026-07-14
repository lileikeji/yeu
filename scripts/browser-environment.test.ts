import assert from 'node:assert/strict'
import test from 'node:test'
import { isWechatUserAgent } from '../app/utils/browser-environment'

test('detects WeChat webviews without misclassifying ordinary mobile browsers', () => {
  assert.equal(isWechatUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) MicroMessenger/8.0.60'
  ), true)
  assert.equal(isWechatUserAgent(
    'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36'
  ), false)
})
