import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const MAX_PUBLIC_RASTER_BYTES = 256 * 1024

function pngDimensions(bytes: Buffer): { width: number, height: number } {
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG')
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR')
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  }
}

test('public media excludes research derivatives and legacy official logo copies', () => {
  assert.equal(existsSync(resolve('public/images/xiaohongshu-recreations-2026-07-15')), false)
  assert.equal(existsSync(resolve('public/images/yeu-campus-plan-2025.jpg')), true)
  assert.equal(existsSync(resolve('public/images/yeu-logo.svg')), false)
  assert.equal(existsSync(resolve('app/assets/brand/yeu-logo.svg')), false)
})

test('site chrome uses the workspace-provided logo without claiming official endorsement', () => {
  const layout = readFileSync(resolve('app/layouts/default.vue'), 'utf8')
  const sourceLogo = readFileSync(resolve('logo.png'))
  const publicLogo = readFileSync(resolve('public/icons/site-logo.png'))

  assert.match(layout, /src="\/icons\/site-logo\.png"/)
  assert.match(layout, /aria-label="仰恩新生指南首页"/)
  assert.match(layout, /alt=""/)
  assert.match(layout, /width="325"/)
  assert.match(layout, /height="72"/)
  assert.doesNotMatch(layout, /仰恩大学校标|yeu-logo/)
  assert.deepEqual(publicLogo, sourceLogo)
  assert.deepEqual(pngDimensions(publicLogo), { width: 325, height: 72 })
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
