import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const trustedIpConfig = readFileSync(resolve('ops/nginx/trusted-client-ip.conf'), 'utf8')
const configureScript = readFileSync(resolve('ops/configure-nginx.sh'), 'utf8')
const streamConfig = readFileSync(resolve('ops/nginx/assistant-stream.conf'), 'utf8')
const uploadConfig = readFileSync(resolve('ops/nginx/admin-media-upload.conf'), 'utf8')
const momentUploadConfig = readFileSync(resolve('ops/nginx/place-moments-upload.conf'), 'utf8')

test('Nginx accepts forwarded client IP only from observed CDN peers', () => {
  assert.match(trustedIpConfig, /geo \$yeu_trusted_cdn_edge/)
  assert.match(trustedIpConfig, /default 0;/)
  assert.match(trustedIpConfig, /203\.0\.113\.10 1;/)
  assert.match(trustedIpConfig, /default \$remote_addr;/)
  assert.match(trustedIpConfig, /~\^1:\(\[0-9A-Fa-f:\.\]\+\)/)
})

test('all YEU proxy locations pass the validated address to Nitro', () => {
  for (const source of [configureScript, streamConfig, uploadConfig, momentUploadConfig]) {
    assert.match(source, /\$yeu_forwarded_client_ip/)
  }
  assert.doesNotMatch(streamConfig, /X-Forwarded-For \$remote_addr/)
  assert.doesNotMatch(uploadConfig, /X-Forwarded-For \$remote_addr/)
  assert.doesNotMatch(momentUploadConfig, /X-Forwarded-For \$remote_addr/)
})

// 学生随手拍上图是 5MB 的照片。落到 @nuxt 的 256k 默认值，Nginx 会先 413，
// 前端只能看到「上传失败」——所以这条 location 必须装进 extension 目录，
// 且体积上限要大于应用层上限。
test('student moment upload location is installed with a body limit above the app limit', () => {
  assert.match(momentUploadConfig, /location = \/api\/place-moments\/images \{/)
  const limit = momentUploadConfig.match(/client_max_body_size (\d+)m;/)
  assert.ok(limit, '缺少 client_max_body_size')
  assert.ok(Number(limit[1]) >= 6, `Nginx 上限 ${limit[1]}m 低于应用层 5MB`)
  assert.match(configureScript, /nginx\/place-moments-upload\.conf/)
  assert.match(configureScript, /\$EXTENSION\/place-moments-upload\.conf/)
  assert.match(momentUploadConfig, /add_header Cache-Control 'private, no-store' always;/)
})
