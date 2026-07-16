import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  isAllowedJsonContentType,
  isJsonBodyWithinLimit,
  MAX_JSON_BODY_BYTES
} from '../server/utils/validation'
import { BASE_SECURITY_HEADERS } from '../server/utils/request-context'

test('parseBody only accepts application/json content types', () => {
  assert.equal(isAllowedJsonContentType('application/json'), true)
  assert.equal(isAllowedJsonContentType('application/json; charset=utf-8'), true)
  assert.equal(isAllowedJsonContentType('APPLICATION/JSON'), true)
  assert.equal(isAllowedJsonContentType('application/x-www-form-urlencoded'), false)
  assert.equal(isAllowedJsonContentType('multipart/form-data'), false)
  assert.equal(isAllowedJsonContentType('text/plain'), false)
  assert.equal(isAllowedJsonContentType(''), false)
  assert.equal(isAllowedJsonContentType(undefined), false)
  assert.equal(isAllowedJsonContentType('application/jsonx'), false)
})

test('JSON body size helper enforces 1 MiB cap', () => {
  assert.equal(isJsonBodyWithinLimit(0), true)
  assert.equal(isJsonBodyWithinLimit(MAX_JSON_BODY_BYTES), true)
  assert.equal(isJsonBodyWithinLimit(MAX_JSON_BODY_BYTES + 1), false)
  assert.equal(isJsonBodyWithinLimit(-1), false)
  assert.equal(isJsonBodyWithinLimit(Number.NaN), false)
  assert.equal(MAX_JSON_BODY_BYTES, 1_048_576)
})

test('parseBody source measures raw body and rejects non-JSON content types', () => {
  const source = readFileSync(join(process.cwd(), 'server/utils/validation.ts'), 'utf8')
  assert.match(source, /assertJsonContentType/)
  assert.match(source, /readRawBody\(event,\s*false\)/)
  assert.match(source, /UNSUPPORTED_MEDIA_TYPE/)
  assert.match(source, /PAYLOAD_TOO_LARGE/)
  assert.match(source, /JSON\.parse/)
  assert.doesNotMatch(source, /await readBody\(event\)/)
})

test('useAdminRequest defaults CSRF on for mutating methods', () => {
  const source = readFileSync(join(process.cwd(), 'server/utils/http.ts'), 'utf8')
  assert.match(source, /csrf \?\? !\['GET', 'HEAD', 'OPTIONS'\]\.includes\(method\)/)
  assert.match(source, /getMethod\(event\)/)
  assert.doesNotMatch(source, /csrf = false/)
})

test('baseline security headers include COOP and CORP', () => {
  assert.equal(BASE_SECURITY_HEADERS['Cross-Origin-Opener-Policy'], 'same-origin')
  assert.equal(BASE_SECURITY_HEADERS['Cross-Origin-Resource-Policy'], 'same-site')
})
