// 生成小程序图标：24x24 设计网格、统一 2px 线宽，SDF 抗锯齿输出 PNG。
// TabBar 图标按微信建议输出 81x81（常态/选中两色）；界面图标输出 96x96。
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STATIC_DIR = resolve(fileURLToPath(new URL('../miniapp/static', import.meta.url)))

const MUTED = [0x66, 0x70, 0x6a]
const TEAL = [0x17, 0x6f, 0x46]

const GRID = 24
const STROKE = 2

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

// —— 距离基元（返回覆盖率 0..1）——

function coverage(distance) {
  return Math.min(1, Math.max(0, 0.5 - distance))
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / lengthSquared))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

function strokeCircle(cx, cy, r, width = STROKE) {
  return (x, y) => coverage(Math.abs(Math.hypot(x - cx, y - cy) - r) - width / 2)
}

function strokeSegment(x1, y1, x2, y2, width = STROKE) {
  return (x, y) => coverage(distToSegment(x, y, x1, y1, x2, y2) - width / 2)
}

function strokePolygon(points, width = STROKE) {
  return (x, y) => {
    let best = Infinity
    for (let i = 0; i < points.length; i += 1) {
      const [ax, ay] = points[i]
      const [bx, by] = points[(i + 1) % points.length]
      best = Math.min(best, distToSegment(x, y, ax, ay, bx, by))
    }
    return coverage(best - width / 2)
  }
}

function fillRoundRect(x0, y0, w, h, r) {
  const halfW = w / 2 - r
  const halfH = h / 2 - r
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  return (x, y) => {
    const qx = Math.abs(x - cx) - halfW
    const qy = Math.abs(y - cy) - halfH
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
    const inside = Math.min(Math.max(qx, qy), 0)
    return coverage(outside + inside - r)
  }
}

function union(...parts) {
  return (x, y) => {
    let best = 0
    for (const part of parts) best = Math.max(best, part(x, y))
    return best
  }
}

// —— 图标定义（24x24 设计网格）——

const ICONS = {
  desk: union(
    strokePolygon([[6.5, 4.6], [17.5, 4.6], [17.5, 20.2], [6.5, 20.2]]),
    strokeSegment(6.5, 4.6, 17.5, 4.6),
    fillRoundRect(9.2, 2.4, 5.6, 4, 1.6),
    strokeSegment(9.6, 11, 14.4, 11),
    strokeSegment(9.6, 15.4, 14.4, 15.4)
  ),
  map: union(
    strokeCircle(12, 9.4, 3.7),
    strokeSegment(8.7, 11.9, 12, 20.6),
    strokeSegment(15.3, 11.9, 12, 20.6)
  ),
  book: union(
    strokePolygon([[12, 5.4], [20.4, 7.2], [20.4, 18.4], [12, 16.6], [3.6, 18.4], [3.6, 7.2]]),
    strokeSegment(12, 5.4, 12, 16.6)
  ),
  search: union(
    strokeCircle(10.7, 10.7, 5.7),
    strokeSegment(14.8, 14.8, 20.2, 20.2)
  ),
  notice: union(
    strokePolygon([[12, 3.8], [19.6, 7.6], [19.6, 13.2], [12, 17], [4.4, 13.2], [4.4, 7.6]]),
    strokeSegment(12, 17, 12, 20.6)
  ),
  compass: union(
    strokeCircle(12, 12, 8.2),
    strokePolygon([[15.4, 8.6], [13.2, 13.2], [8.6, 15.4], [10.8, 10.8]])
  )
}

function renderIcon(definition, size, color) {
  const scale = size / GRID
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      // 2x2 超采样，坐标换算回 24 网格
      let alpha = 0
      for (let sy = 0; sy < 2; sy += 1) {
        for (let sx = 0; sx < 2; sx += 1) {
          const gx = (px + (sx + 0.5) / 2) / scale
          const gy = (py + (sy + 0.5) / 2) / scale
          alpha += definition(gx, gy)
        }
      }
      alpha /= 4
      const index = (py * size + px) * 4
      rgba[index] = color[0]
      rgba[index + 1] = color[1]
      rgba[index + 2] = color[2]
      rgba[index + 3] = Math.round(Math.min(1, alpha) * 255)
    }
  }
  return encodePng(size, size, rgba)
}

mkdirSync(STATIC_DIR, { recursive: true })

const outputs = []
for (const [name, definition] of Object.entries(ICONS)) {
  const uiFile = resolve(STATIC_DIR, `icon-${name}.png`)
  writeFileSync(uiFile, renderIcon(definition, 96, TEAL))
  outputs.push(uiFile)
}

for (const name of ['desk', 'map', 'book', 'search', 'compass']) {
  const normalFile = resolve(STATIC_DIR, `tab-${name}.png`)
  const activeFile = resolve(STATIC_DIR, `tab-${name}-active.png`)
  writeFileSync(normalFile, renderIcon(ICONS[name], 81, MUTED))
  writeFileSync(activeFile, renderIcon(ICONS[name], 81, TEAL))
  outputs.push(normalFile, activeFile)
}

process.stdout.write(`generated ${outputs.length} icons into ${STATIC_DIR}\n`)
