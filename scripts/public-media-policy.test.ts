import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const MAX_PUBLIC_RASTER_BYTES = 256 * 1024

test('public media excludes research derivatives and legacy official logo copies', () => {
  assert.equal(existsSync(resolve('public/images/xiaohongshu-recreations-2026-07-15')), false)
  assert.equal(existsSync(resolve('public/images/yeu-campus-plan-2025.jpg')), true)
  assert.equal(existsSync(resolve('public/images/yeu-logo.svg')), false)
  assert.equal(existsSync(resolve('app/assets/brand/yeu-logo.svg')), false)
})

test('site chrome uses a generic welcome mark without claiming official endorsement', () => {
  const layout = readFileSync(resolve('app/layouts/default.vue'), 'utf8')

  assert.doesNotMatch(layout, /site-logo|yeu-seal|仰恩大学校标|yeu-logo/)
  assert.match(layout, /aria-label="迎新指南首页"/)
  assert.match(layout, /i-lucide-compass/)
  assert.match(layout, /迎新指南/)
})

test('public raster images stay below the direct-delivery budget', () => {
  const publicRoot = resolve('public')
  const rasterFiles = readdirSync(publicRoot, {
    encoding: 'utf8',
    recursive: true
  }).filter(path => /\.(?:png|jpe?g|webp|gif)$/i.test(path))

  assert.ok(rasterFiles.length > 0)
  for (const relativePath of rasterFiles) {
    const normalizedPath = relativePath.replaceAll('\\', '/')
    const bytes = statSync(resolve(publicRoot, relativePath)).size
    if (normalizedPath === 'images/yeu-campus-plan-2025.jpg') {
      assert.equal(bytes, 1_250_742)
      continue
    }
    assert.ok(
      bytes <= MAX_PUBLIC_RASTER_BYTES,
      `${relativePath} is ${bytes} bytes; generate a thumbnail or use an explicit media loading strategy`
    )
  }
})

test('intro hero ships only the optimized delivery asset', () => {
  assert.equal(existsSync(resolve('public/images/intro/yeu-campus-hero.webp')), true)
  assert.equal(existsSync(resolve('public/images/intro/yeu-campus-hero.jpg')), false)
})
