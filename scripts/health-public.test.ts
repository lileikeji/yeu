import assert from 'node:assert/strict'
import test from 'node:test'
import { isLoopbackAddress, publicConfigurationIssues } from '../server/utils/health-public'

test('health issue redaction hides specific configuration codes from remote probes', () => {
  assert.deepEqual(
    publicConfigurationIssues(['admin_session_secret_missing', 'amap_key_missing'], false),
    ['configuration_invalid']
  )
  assert.deepEqual(
    publicConfigurationIssues(['admin_session_secret_missing'], true),
    ['admin_session_secret_missing']
  )
  assert.deepEqual(publicConfigurationIssues([], false), [])
})

test('loopback address detection covers IPv4 and IPv6 localhost forms', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::1'), true)
  assert.equal(isLoopbackAddress(':ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('203.0.113.10'), false)
  assert.equal(isLoopbackAddress(null), false)
})
