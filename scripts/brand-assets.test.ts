import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function readPngDimensions(filePath: string): { width: number, height: number } {
  const buf = readFileSync(resolve(filePath))
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filePath} 不是合法 PNG`)
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', `${filePath} 缺少 IHDR 头`)
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20)
  }
}

test('品牌 SVG 资产均为纯矢量路径，不含位图嵌套', () => {
  const svgPaths = [
    'public/icons/app-icon.svg',
    'public/images/brand/system-logo-mark.svg',
    'public/images/brand/system-logo-mark-light.svg',
    'public/images/brand/system-logo-lockup.svg'
  ]

  for (const svgPath of svgPaths) {
    const content = readFileSync(resolve(svgPath), 'utf8')
    assert.match(content, /<path\b/, `${svgPath} 缺少矢量 <path>`)
    assert.match(content, /<linearGradient\b/, `${svgPath} 缺少渐变色彩定义`)
    assert.doesNotMatch(content, /<image\b/i, `${svgPath} 不得内嵌位图 <image>`)
  }
})

test('品牌 PNG 资产尺寸精确符合规格', () => {
  const expected: Array<[string, number, number]> = [
    ['public/icons/app-icon-192.png', 192, 192],
    ['public/icons/app-icon-512.png', 512, 512],
    ['public/icons/app-icon-maskable-512.png', 512, 512],
    ['public/images/brand/system-logo-mark.png', 512, 512],
    ['public/images/brand/system-logo-mark-light.png', 512, 512],
    ['public/images/brand/system-logo-lockup.png', 760, 180]
  ]

  for (const [filePath, width, height] of expected) {
    assert.deepEqual(readPngDimensions(filePath), { width, height }, `${filePath} 尺寸不匹配`)
  }
})

test('favicon.ico 包含 16/32/48 多尺寸合法 PNG 图层', () => {
  const ico = readFileSync(resolve('public/favicon.ico'))
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)
  const count = ico.readUInt16LE(4)
  assert.equal(count, 3)

  const sizes: number[] = []
  for (let i = 0; i < count; i += 1) {
    const base = 6 + i * 16
    const w = ico[base] === 0 ? 256 : ico[base]!
    const h = ico[base + 1] === 0 ? 256 : ico[base + 1]!
    const bytes = ico.readUInt32LE(base + 8)
    const offset = ico.readUInt32LE(base + 12)
    assert.equal(w, h)
    sizes.push(w)
    assert.equal(
      ico.subarray(offset, offset + 4).toString('hex'),
      '89504e47',
      `favicon ${w}x${w} 图层应为 PNG 负载`
    )
    assert.ok(bytes > 0)
  }

  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 32, 48])
})

test('后台与离线页统一接入系统标志且完整保留计协专属徽标', () => {
  const adminLayout = readFileSync(resolve('app/layouts/admin.vue'), 'utf8')
  const adminLogin = readFileSync(resolve('app/pages/admin/login.vue'), 'utf8')
  const offline = readFileSync(resolve('public/offline.html'), 'utf8')

  for (const [name, source] of [['admin.vue', adminLayout], ['admin/login.vue', adminLogin]] as const) {
    assert.ok(source.includes('/images/yeuca-logo.jpg'), `${name} 应保留计协专属徽标`)
    assert.ok(source.includes('/images/brand/system-logo-mark.png'), `${name} 应接入暗底系统标志`)
    assert.ok(source.includes('/images/brand/system-logo-mark-light.png'), `${name} 应接入浅底系统标志`)
  }

  assert.match(offline, /<svg\b/)
  assert.doesNotMatch(offline, />迎<\/div>/)
})
