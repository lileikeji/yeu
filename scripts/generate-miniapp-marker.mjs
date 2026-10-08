// 生成小程序地图图钉：按分类着色，避免默认红色图钉堆叠。
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = resolve(fileURLToPath(new URL('../miniapp/static/marker', import.meta.url)))

const WIDTH = 48
const HEIGHT = 60
const WHITE = [0xff, 0xff, 0xff]

/** 分类配色取自网页端色板，保持低饱和、可区分。 */
const CATEGORY_COLORS = {
  'campus-building': [0x17, 0x6f, 0x46],
  dorm: [0x2d, 0x6f, 0x8e],
  food: [0xb4, 0x3c, 0x0b],
  service: [0x5b, 0x6b, 0x7c],
  express: [0x8a, 0x6d, 0x1f],
  gate: [0x44, 0x40, 0x3c],
  nearby: [0x6b, 0x72, 0x80]
}

const DEFAULT_COLOR = [0x17, 0x6f, 0x46]

const crcTable = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0
    offset += 1
    rgba.copy(raw, offset, y * width * 4, (y + 1) * width * 4)
    offset += width * 4
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const HEAD_CENTER = { x: 24, y: 22 }
const HEAD_RADIUS = 18
const DOT_RADIUS = 7.5
const TAIL_TOP = 30
const TAIL_BOTTOM = 58
const TAIL_HALF_WIDTH = 14

function insideHead(x, y) {
  return (x - HEAD_CENTER.x) ** 2 + (y - HEAD_CENTER.y) ** 2 <= HEAD_RADIUS ** 2
}

function insideTail(x, y) {
  if (y < TAIL_TOP || y > TAIL_BOTTOM) return false
  const halfWidth = TAIL_HALF_WIDTH * (TAIL_BOTTOM - y) / (TAIL_BOTTOM - TAIL_TOP)
  return Math.abs(x - HEAD_CENTER.x) <= halfWidth
}

function insideDot(x, y) {
  return (x - HEAD_CENTER.x) ** 2 + (y - HEAD_CENTER.y) ** 2 <= DOT_RADIUS ** 2
}

function renderPin(color) {
  // 打包成紧凑 RGBA（每行不加 filter 字节），由 encodePng 统一补行首 filter。
  const rgba = Buffer.alloc(WIDTH * 4 * HEIGHT)
  let offset = 0
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let alpha = 0
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < 2; sy += 1) {
        for (let sx = 0; sx < 2; sx += 1) {
          const px = x + sx * 0.5 + 0.25
          const py = y + sy * 0.5 + 0.25
          const dot = insideDot(px, py)
          const body = insideHead(px, py) || insideTail(px, py)
          if (!dot && !body) continue
          const tone = dot ? WHITE : color
          alpha += 1
          r += tone[0]
          g += tone[1]
          b += tone[2]
        }
      }
      const divisor = alpha || 1
      rgba[offset] = alpha ? Math.round(r / divisor) : 0
      rgba[offset + 1] = alpha ? Math.round(g / divisor) : 0
      rgba[offset + 2] = alpha ? Math.round(b / divisor) : 0
      rgba[offset + 3] = Math.round((alpha / 4) * 255)
      offset += 4
    }
  }
  return encodePng(WIDTH, HEIGHT, rgba)
}

mkdirSync(OUT_DIR, { recursive: true })

writeFileSync(resolve(OUT_DIR, 'pin-default.png'), renderPin(DEFAULT_COLOR))
for (const [category, color] of Object.entries(CATEGORY_COLORS)) {
  writeFileSync(resolve(OUT_DIR, `pin-${category}.png`), renderPin(color))
}

process.stdout.write(`generated ${Object.keys(CATEGORY_COLORS).length + 1} pins into ${OUT_DIR}\n`)
