import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)))
const BRAND_DIR = resolve(ROOT_DIR, 'public/images/brand')
const ICONS_DIR = resolve(ROOT_DIR, 'public/icons')
const FAVICON_PATH = resolve(ROOT_DIR, 'public/favicon.ico')

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function fmt(n) {
  return Number(n.toFixed(2))
}

/**
 * 纯解析计算带逐顶点内切圆角的闭合 SVG 路径（仅使用 M / L / A / Z 指令）。
 * 顶点需按顺时针顺序给出；自动识别外凸角（sweep=1）与内凹折角（sweep=0）。
 */
function buildFilletedSvgPath(vertices) {
  const n = vertices.length
  const corners = []

  for (let i = 0; i < n; i += 1) {
    const prev = vertices[(i - 1 + n) % n]
    const curr = vertices[i]
    const next = vertices[(i + 1) % n]

    if (!curr.r || curr.r <= 0) {
      corners.push({
        tinX: curr.x,
        tinY: curr.y,
        toutX: curr.x,
        toutY: curr.y,
        r: 0,
        sweep: 1
      })
      continue
    }

    const ux = prev.x - curr.x
    const uy = prev.y - curr.y
    const ul = Math.hypot(ux, uy)
    const vx = next.x - curr.x
    const vy = next.y - curr.y
    const vl = Math.hypot(vx, vy)

    const udx = ux / ul
    const udy = uy / ul
    const vdx = vx / vl
    const vdy = vy / vl

    const cosAngle = clamp(udx * vdx + udy * vdy, -1, 1)
    const halfAngle = Math.acos(cosAngle) / 2
    const tanHalf = Math.tan(halfAngle)
    const dist = curr.r / tanHalf

    const tinX = curr.x + udx * dist
    const tinY = curr.y + udy * dist
    const toutX = curr.x + vdx * dist
    const toutY = curr.y + vdy * dist

    const cross = udx * vdy - udy * vdx
    const sweep = cross < 0 ? 1 : 0

    corners.push({
      tinX,
      tinY,
      toutX,
      toutY,
      r: curr.r,
      sweep
    })
  }

  let d = `M${fmt(corners[0].tinX)},${fmt(corners[0].tinY)}`
  for (let i = 0; i < n; i += 1) {
    const c = corners[i]
    if (c.r > 0) {
      d += ` A${fmt(c.r)},${fmt(c.r)} 0 0,${c.sweep} ${fmt(c.toutX)},${fmt(c.toutY)}`
    }
    const nextCorner = corners[(i + 1) % n]
    d += ` L${fmt(nextCorner.tinX)},${fmt(nextCorner.tinY)}`
  }
  return `${d}Z`
}

function buildBrandShapes(gapBias = 0) {
  // 上方：晨曦指北罗盘主翼（略向内上提 gapBias 以供 16px 微型光学补偿）
  const kitePath = buildFilletedSvgPath([
    { x: 256, y: 52 - gapBias * 0.5, r: 22 },
    { x: 372, y: 186 - gapBias, r: 24 },
    { x: 256, y: 248 - gapBias, r: 22 },
    { x: 140, y: 186 - gapBias, r: 24 }
  ])

  // 下方：立体展开双页指南册（上下沿斜率与风筝翼下沿严格平行）
  const bookPath = buildFilletedSvgPath([
    { x: 56, y: 172 + gapBias * 0.4, r: 32 },
    { x: 256, y: 279 + gapBias * 0.4, r: 26 },
    { x: 456, y: 172 + gapBias * 0.4, r: 32 },
    { x: 456, y: 360, r: 32 },
    { x: 256, y: 466, r: 30 },
    { x: 56, y: 360, r: 32 }
  ])

  return { kitePath, bookPath }
}

const PALETTES = {
  light: {
    kiteLeftStart: '#FDE047',
    kiteLeftEnd: '#F59E0B',
    kiteRightStart: '#FB923C',
    kiteRightEnd: '#EA580C',
    bookLeftStart: '#34D399',
    bookLeftEnd: '#059669',
    bookRightStart: '#38BDF8',
    bookRightEnd: '#0284C7'
  },
  dark: {
    kiteLeftStart: '#FEF08A',
    kiteLeftEnd: '#FBBF24',
    kiteRightStart: '#FDBA74',
    kiteRightEnd: '#F97316',
    bookLeftStart: '#6EE7B7',
    bookLeftEnd: '#10B981',
    bookRightStart: '#7DD3FC',
    bookRightEnd: '#0EA5E9'
  }
}

function renderBrandDefs(prefix, palette) {
  return `<clipPath id="${prefix}-clip-left">
      <rect x="0" y="0" width="256.5" height="512"/>
    </clipPath>
    <clipPath id="${prefix}-clip-right">
      <rect x="256" y="0" width="256" height="512"/>
    </clipPath>
    <linearGradient id="${prefix}-kite-left" x1="140" y1="52" x2="256" y2="248" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.kiteLeftStart}"/>
      <stop offset="1" stop-color="${palette.kiteLeftEnd}"/>
    </linearGradient>
    <linearGradient id="${prefix}-kite-right" x1="256" y1="52" x2="372" y2="248" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.kiteRightStart}"/>
      <stop offset="1" stop-color="${palette.kiteRightEnd}"/>
    </linearGradient>
    <linearGradient id="${prefix}-book-left" x1="56" y1="172" x2="256" y2="466" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.bookLeftStart}"/>
      <stop offset="1" stop-color="${palette.bookLeftEnd}"/>
    </linearGradient>
    <linearGradient id="${prefix}-book-right" x1="256" y1="172" x2="456" y2="466" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${palette.bookRightStart}"/>
      <stop offset="1" stop-color="${palette.bookRightEnd}"/>
    </linearGradient>`
}

function renderBrandMarkGroup(prefix, shapes) {
  return `<path d="${shapes.bookPath}" fill="url(#${prefix}-book-right)" clip-path="url(#${prefix}-clip-right)"/>
    <path d="${shapes.bookPath}" fill="url(#${prefix}-book-left)" clip-path="url(#${prefix}-clip-left)"/>
    <path d="${shapes.kitePath}" fill="url(#${prefix}-kite-right)" clip-path="url(#${prefix}-clip-right)"/>
    <path d="${shapes.kitePath}" fill="url(#${prefix}-kite-left)" clip-path="url(#${prefix}-clip-left)"/>`
}

function renderMarkSvg({ shapes, palette, prefix, title, desc }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">${desc}</desc>
  <defs>
    ${renderBrandDefs(prefix, palette)}
  </defs>
  <g>
    ${renderBrandMarkGroup(prefix, shapes)}
  </g>
</svg>
`
}

function renderAppIconSvg({ shapes, rounded = true, scale = 0.8 }) {
  const clipRect = rounded
    ? `<rect width="512" height="512" rx="112" fill="url(#atlas-porcelain-bg)"/>`
    : `<rect width="512" height="512" fill="url(#atlas-porcelain-bg)"/>`
  const borderOverlay = rounded
    ? `\n  <rect x="2" y="2" width="508" height="508" rx="110" fill="none" stroke="#CBD5E1" stroke-opacity="0.75" stroke-width="4"/>`
    : ''
  const shift = fmt((1 - scale) * 256)
  // 垂直边界 [52, 466]，中心为 259，略向上偏 2px 取得光学居中
  const ty = fmt(shift - 2)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
  <title id="title">迎新指南</title>
  <desc id="desc">晴翠晴空折页与晨曦指北罗盘组成的迎新指南系统图标</desc>
  <defs>
    <linearGradient id="atlas-porcelain-bg" x1="36" y1="24" x2="476" y2="488" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.52" stop-color="#F0F9FF"/>
      <stop offset="1" stop-color="#ECFDF5"/>
    </linearGradient>
    ${renderBrandDefs('icon', PALETTES.light)}
  </defs>
  ${clipRect}${borderOverlay}
  <g transform="translate(${shift}, ${ty}) scale(${scale})">
    ${renderBrandMarkGroup('icon', shapes)}
  </g>
</svg>
`
}

function renderLockupSvg(shapes) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 180" role="img" aria-labelledby="title desc">
  <title id="title">迎新指南</title>
  <desc id="desc">晴翠晴空折页与晨曦指北罗盘组成的迎新指南横版品牌标志</desc>
  <defs>
    ${renderBrandDefs('lockup', PALETTES.light)}
  </defs>
  <g transform="translate(8, 8) scale(0.32)">
    ${renderBrandMarkGroup('lockup', shapes)}
  </g>
  <text x="192" y="96" fill="#0F172A" font-family="PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="68" font-weight="800" letter-spacing="2">迎新指南</text>
  <text x="195" y="136" fill="#0D9488" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="2.6">CAMPUS ATLAS · FRESHMAN GUIDE</text>
</svg>
`
}

function packIco(pngEntries) {
  const count = pngEntries.length
  const headerSize = 6
  const dirEntrySize = 16
  let offset = headerSize + count * dirEntrySize

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)

  const dirs = []
  const chunks = []

  for (const { size, buffer } of pngEntries) {
    const dir = Buffer.alloc(dirEntrySize)
    dir[0] = size >= 256 ? 0 : size
    dir[1] = size >= 256 ? 0 : size
    dir[2] = 0
    dir[3] = 0
    dir.writeUInt16LE(1, 4)
    dir.writeUInt16LE(32, 6)
    dir.writeUInt32LE(buffer.length, 8)
    dir.writeUInt32LE(offset, 12)
    dirs.push(dir)
    chunks.push(buffer)
    offset += buffer.length
  }

  return Buffer.concat([header, ...dirs, ...chunks])
}

async function rasterizeSvg(page, svgMarkup, width, height) {
  await page.setViewportSize({ width, height })
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;width:${width}px;height:${height}px;">${svgMarkup.replace('<svg ', `<svg style="display:block;width:${width}px;height:${height}px;" `)}</body></html>`,
    { waitUntil: 'load' }
  )
  return page.screenshot({ type: 'png', omitBackground: true })
}

async function main() {
  mkdirSync(BRAND_DIR, { recursive: true })
  mkdirSync(ICONS_DIR, { recursive: true })

  process.stdout.write('1/3 正在生成纯解析 SVG 圆弧几何矢量文件...\n')
  const standard = buildBrandShapes(0)
  const micro = buildBrandShapes(8)

  const markLightSvg = renderMarkSvg({
    shapes: standard,
    palette: PALETTES.light,
    prefix: 'mark-light',
    title: '迎新指南标志（浅色背景版）',
    desc: '晴翠晴空双页折册与晨曦指北罗盘构成的多彩立体标志'
  })

  const markDarkSvg = renderMarkSvg({
    shapes: standard,
    palette: PALETTES.dark,
    prefix: 'mark-dark',
    title: '迎新指南标志（深色背景版）',
    desc: '亮翠晴空双页折册与明亮金橙指北罗盘构成的多彩立体标志'
  })

  const appIconSvg = renderAppIconSvg({
    shapes: standard,
    rounded: true,
    scale: 0.8
  })

  const maskableIconSvg = renderAppIconSvg({
    shapes: standard,
    rounded: false,
    scale: 0.64
  })

  const faviconIconSvg = renderAppIconSvg({
    shapes: micro,
    rounded: true,
    scale: 0.82
  })

  const lockupSvg = renderLockupSvg(standard)

  writeFileSync(resolve(BRAND_DIR, 'system-logo-mark-light.svg'), markLightSvg, 'utf8')
  writeFileSync(resolve(BRAND_DIR, 'system-logo-mark.svg'), markDarkSvg, 'utf8')
  writeFileSync(resolve(BRAND_DIR, 'system-logo-lockup.svg'), lockupSvg, 'utf8')
  writeFileSync(resolve(ICONS_DIR, 'app-icon.svg'), appIconSvg, 'utf8')

  process.stdout.write('2/3 正在使用 Chromium 矢量引擎光栅化透明底 PNG 与 ICO 资产...\n')
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 })
    const page = await context.newPage()

    const markLightPng = await rasterizeSvg(page, markLightSvg, 512, 512)
    const markDarkPng = await rasterizeSvg(page, markDarkSvg, 512, 512)
    const appIcon192Png = await rasterizeSvg(page, appIconSvg, 192, 192)
    const appIcon512Png = await rasterizeSvg(page, appIconSvg, 512, 512)
    const maskable512Png = await rasterizeSvg(page, maskableIconSvg, 512, 512)
    const lockupPng = await rasterizeSvg(page, lockupSvg, 760, 180)

    const fav16 = await rasterizeSvg(page, faviconIconSvg, 16, 16)
    const fav32 = await rasterizeSvg(page, appIconSvg, 32, 32)
    const fav48 = await rasterizeSvg(page, appIconSvg, 48, 48)
    const faviconIco = packIco([
      { size: 16, buffer: fav16 },
      { size: 32, buffer: fav32 },
      { size: 48, buffer: fav48 }
    ])

    writeFileSync(resolve(BRAND_DIR, 'system-logo-mark-light.png'), markLightPng)
    writeFileSync(resolve(BRAND_DIR, 'system-logo-mark.png'), markDarkPng)
    writeFileSync(resolve(BRAND_DIR, 'system-logo-lockup.png'), lockupPng)
    writeFileSync(resolve(ICONS_DIR, 'app-icon-192.png'), appIcon192Png)
    writeFileSync(resolve(ICONS_DIR, 'app-icon-512.png'), appIcon512Png)
    writeFileSync(resolve(ICONS_DIR, 'app-icon-maskable-512.png'), maskable512Png)
    writeFileSync(FAVICON_PATH, faviconIco)
  } finally {
    await browser.close()
  }

  process.stdout.write('3/3 全套品牌资产生成完成。\n')
  for (const rel of [
    'public/images/brand/system-logo-mark-light.svg',
    'public/images/brand/system-logo-mark.svg',
    'public/images/brand/system-logo-lockup.svg',
    'public/icons/app-icon.svg',
    'public/images/brand/system-logo-mark-light.png',
    'public/images/brand/system-logo-mark.png',
    'public/images/brand/system-logo-lockup.png',
    'public/icons/app-icon-192.png',
    'public/icons/app-icon-512.png',
    'public/icons/app-icon-maskable-512.png',
    'public/favicon.ico'
  ]) {
    const bytes = readFileSync(resolve(ROOT_DIR, rel)).length
    process.stdout.write(`  - ${rel}: ${bytes} bytes\n`)
  }
}

await main()
