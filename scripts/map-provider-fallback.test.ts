import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveProviderFallback } from '../map/providers/fallback'

const WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.40'
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

test('explicit offline / maplibre-dev are respected', () => {
  assert.equal(resolveProviderFallback({ configuredProvider: 'offline' }), 'offline')
  assert.equal(resolveProviderFallback({ configuredProvider: ' maplibre-dev ' }), 'maplibre-dev')
})

test('empty configuration falls back to offline self-drawn map', () => {
  assert.equal(resolveProviderFallback({ configuredProvider: '' }), 'offline')
})

test('unknown provider passes through so the factory throws', () => {
  assert.equal(resolveProviderFallback({ configuredProvider: 'bogus' }), 'bogus')
})

test('amap with complete keys on a normal browser stays amap', () => {
  assert.equal(resolveProviderFallback({
    configuredProvider: 'amap',
    amapKey: 'key',
    amapSecurityCode: 'code',
    userAgent: BROWSER_UA
  }), 'amap')
})

test('amap missing a key degrades to offline', () => {
  assert.equal(resolveProviderFallback({
    configuredProvider: 'amap',
    amapKey: 'key',
    amapSecurityCode: '',
    userAgent: BROWSER_UA
  }), 'offline')
  assert.equal(resolveProviderFallback({
    configuredProvider: 'amap',
    amapKey: '',
    amapSecurityCode: 'code',
    userAgent: BROWSER_UA
  }), 'offline')
})

test('WeChat WebView degrades to offline even with a complete amap key', () => {
  assert.equal(resolveProviderFallback({
    configuredProvider: 'amap',
    amapKey: 'key',
    amapSecurityCode: 'code',
    userAgent: WECHAT_UA
  }), 'offline')
})
