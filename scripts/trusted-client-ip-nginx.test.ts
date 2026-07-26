import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const trustedIpConfig = readFileSync(resolve('ops/nginx/trusted-client-ip.conf'), 'utf8')
const configureScript = readFileSync(resolve('ops/configure-nginx.sh'), 'utf8')
const streamConfig = readFileSync(resolve('ops/nginx/assistant-stream.conf'), 'utf8')
const uploadConfig = readFileSync(resolve('ops/nginx/admin-media-upload.conf'), 'utf8')

test('Nginx accepts forwarded client IP only from observed CDN peers', () => {
  assert.match(trustedIpConfig, /geo \$yeu_trusted_cdn_edge/)
  assert.match(trustedIpConfig, /default 0;/)
  assert.match(trustedIpConfig, /180\.97\.221\.85 1;/)
  assert.match(trustedIpConfig, /default \$remote_addr;/)
  assert.match(trustedIpConfig, /~\^1:\(\[0-9A-Fa-f:\.\]\+\)/)
})

test('all YEU proxy locations pass the validated address to Nitro', () => {
  for (const source of [configureScript, streamConfig, uploadConfig]) {
    assert.match(source, /\$yeu_forwarded_client_ip/)
  }
  assert.doesNotMatch(streamConfig, /X-Forwarded-For \$remote_addr/)
  assert.doesNotMatch(uploadConfig, /X-Forwarded-For \$remote_addr/)
})
