import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isLoopbackIp,
  isPrivateIp,
  isTrustedProxyPeer,
  normalizeIpAddress,
  trustProxyEnabled,
  trustProxyPeerMode
} from '../server/utils/client-ip'
import { cleanSearchTerm, likeContainsPattern } from '../shared/utils/like-search'

test('normalizeIpAddress maps IPv4-mapped IPv6 forms', () => {
  assert.equal(normalizeIpAddress('::ffff:203.0.113.9'), '203.0.113.9')
  assert.equal(normalizeIpAddress(':ffff:127.0.0.1'), '127.0.0.1')
  assert.equal(normalizeIpAddress('  198.51.100.2  '), '198.51.100.2')
})

test('loopback and private peer classification', () => {
  assert.equal(isLoopbackIp('127.0.0.1'), true)
  assert.equal(isLoopbackIp('::1'), true)
  assert.equal(isLoopbackIp('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackIp('203.0.113.10'), false)
  assert.equal(isPrivateIp('10.0.0.5'), true)
  assert.equal(isPrivateIp('172.16.1.1'), true)
  assert.equal(isPrivateIp('192.168.1.1'), true)
  assert.equal(isPrivateIp('203.0.113.10'), false)
})

test('trusted proxy peers default to loopback only', () => {
  assert.equal(isTrustedProxyPeer('127.0.0.1', 'loopback'), true)
  assert.equal(isTrustedProxyPeer('10.0.0.2', 'loopback'), false)
  assert.equal(isTrustedProxyPeer('10.0.0.2', 'private'), true)
  assert.equal(isTrustedProxyPeer('203.0.113.10', 'private'), false)
})

test('trust proxy env helpers are strict', () => {
  assert.equal(trustProxyEnabled('true'), true)
  assert.equal(trustProxyEnabled('1'), false)
  assert.equal(trustProxyEnabled('false'), false)
  assert.equal(trustProxyPeerMode(undefined), 'loopback')
  assert.equal(trustProxyPeerMode('private'), 'private')
  assert.equal(trustProxyPeerMode('loopback'), 'loopback')
  assert.equal(trustProxyPeerMode('anything'), 'loopback')
})

test('LIKE search terms strip wildcard metacharacters', () => {
  assert.equal(cleanSearchTerm('  100%_off  '), '100off')
  assert.equal(likeContainsPattern('%admin_'), '%admin%')
  assert.equal(likeContainsPattern('%%%'), null)
  assert.equal(likeContainsPattern('  '), null)
})
