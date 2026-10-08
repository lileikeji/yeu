// 把网页端已有的实拍图转成小程序轮播横幅（JPEG，750x400 视觉区，2x 输出）。
// 依赖 pnpm store 里的 sharp，不新增项目依赖。
import { createRequire } from 'node:module'
import { mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

function loadSharp() {
  const store = resolve(root, 'node_modules/.pnpm')
  const entry = readdirSync(store).find(name => name.startsWith('sharp@'))
  if (!entry) throw new Error('sharp is not installed in the pnpm store')
  return require(resolve(store, entry, 'node_modules/sharp'))
}

const sharp = loadSharp()

const BANNERS = [
  { source: 'public/images/intro/yeu-campus-hero.webp', target: 'campus.jpg', width: 1200, height: 620 },
  { source: 'public/images/nearby/city-night.webp', target: 'city-night.jpg', width: 1200, height: 620 },
  { source: 'public/images/nearby/city-food.webp', target: 'city-food.jpg', width: 1200, height: 620 }
]

const outputDir = resolve(root, 'miniapp/static/banner')
mkdirSync(outputDir, { recursive: true })

for (const banner of BANNERS) {
  const from = resolve(root, banner.source)
  const to = resolve(outputDir, banner.target)
  await sharp(from)
    .resize(banner.width, banner.height, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 74, mozjpeg: true })
    .toFile(to)
  process.stdout.write(`banner ${banner.target} <- ${banner.source}\n`)
}
