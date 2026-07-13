import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectRuntimeReadiness } from '../server/utils/readiness'

const strongSecret = 'a'.repeat(32)

test('development readiness accepts the preview map with a configured admin secret', () => {
  assert.deepEqual(inspectRuntimeReadiness({
    nodeEnv: 'development',
    siteUrl: 'http://127.0.0.1:3000',
    mapProvider: 'maplibre-dev',
    amapKey: '',
    amapSecurityCode: '',
    adminSessionSecret: strongSecret
  }), {
    ready: true,
    issues: []
  })
})

test('production readiness requires HTTPS, AMap credentials and a strong session secret', () => {
  assert.deepEqual(inspectRuntimeReadiness({
    nodeEnv: 'production',
    siteUrl: 'http://example.test',
    mapProvider: 'maplibre-dev',
    amapKey: '',
    amapSecurityCode: '',
    adminSessionSecret: 'short'
  }), {
    ready: false,
    issues: [
      'site_url_https_required',
      'admin_session_secret_missing',
      'development_map_provider_in_production'
    ]
  })
})

test('production readiness accepts a complete AMap configuration', () => {
  assert.deepEqual(inspectRuntimeReadiness({
    nodeEnv: 'production',
    siteUrl: 'https://guide.example.test',
    mapProvider: 'amap',
    amapKey: 'public-web-key',
    amapSecurityCode: 'public-security-code',
    adminSessionSecret: strongSecret
  }), {
    ready: true,
    issues: []
  })
})
