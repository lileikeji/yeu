import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { inflateSync } from 'node:zlib'

function readPngDimensions(filePath: string): { width: number, height: number } {
  const buf = readFileSync(resolve(filePath))
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filePath} 不是合法 PNG`)
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', `${filePath} 缺少 IHDR 头`)
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20)
  }
}

function readPngTopCornersAlpha(filePath: string): { topLeft: number, topRight: number } {
  const buf = readFileSync(resolve(filePath))
  const width = buf.readUInt32BE(16)
  const bitDepth = buf[24]!
  const colorType = buf[25]!
  assert.equal(bitDepth, 8)
  if (colorType === 2) return { topLeft: 255, topRight: 255 }
  assert.equal(colorType, 6, `${filePath} 应为 RGB 或 RGBA PNG`)

  const idatChunks: Buffer[] = []
  let offset = 8
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii')
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (type === 'IDAT') idatChunks.push(buf.subarray(dataStart, dataEnd))
    offset = dataEnd + 4
    if (type === 'IEND') break
  }

  const raw = inflateSync(Buffer.concat(idatChunks))
  const bpp = 4
  const stride = width * bpp
  const filterType = raw[0]!
  const row0 = Buffer.alloc(stride)
  for (let i = 0; i < stride; i += 1) {
    const x = raw[1 + i]!
    const left = i >= bpp ? row0[i - bpp]! : 0
    if (filterType === 0) row0[i] = x
    else if (filterType === 1 || filterType === 4) row0[i] = (x + left) & 0xff
    else if (filterType === 2) row0[i] = x
    else if (filterType === 3) row0[i] = (x + Math.floor(left / 2)) & 0xff
    else assert.fail(`不支持的 PNG 行滤镜类型: ${filterType}`)
  }

  return {
    topLeft: row0[3]!,
    topRight: row0[stride - 1]!
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

  const shareIconPath = 'public/icons/app-icon-512.png'
  assert.equal(existsSync(resolve(shareIconPath)), true)
  const shareIconBytes = statSync(resolve(shareIconPath)).size
  assert.notEqual(shareIconBytes, 112227, '512px 分享图标应切换为直角满铺版本而非旧圆角版本')
  assert.deepEqual(readPngTopCornersAlpha(shareIconPath), { topLeft: 255, topRight: 255 })
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
