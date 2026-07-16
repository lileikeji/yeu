import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authCookieNames,
  HOST_CSRF_COOKIE_NAME,
  HOST_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME
} from '../shared/constants/security'

test('secure auth cookies use the __Host- prefix', () => {
  assert.deepEqual(authCookieNames(true), {
    session: HOST_SESSION_COOKIE_NAME,
    csrf: HOST_CSRF_COOKIE_NAME
  })
  assert.ok(HOST_SESSION_COOKIE_NAME.startsWith('__Host-'))
  assert.ok(HOST_CSRF_COOKIE_NAME.startsWith('__Host-'))
})

test('development cookies keep non-host names for HTTP localhost', () => {
  assert.deepEqual(authCookieNames(false), {
    session: SESSION_COOKIE_NAME,
    csrf: CSRF_COOKIE_NAME
  })
})
