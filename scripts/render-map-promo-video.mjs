import { mkdir, rename } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = new Map(process.argv.slice(2).map((value, index, all) => {
  if (!value.startsWith('--')) return [value, true]
  return [value.slice(2), all[index + 1]?.startsWith('--') ? true : all[index + 1]]
}))

const output = resolve(String(args.get('out') || 'docs/marketing/map-promo/map-promo-captions.webm'))
const captions = args.get('captions') !== '0'
const durationMs = Number(args.get('duration') || 17_200)
const videoDir = resolve('.tmp-map-promo-video')
const scenePath = resolve('docs/marketing/map-promo/map-promo-scenes.html')
const url = `${pathToFileURL(scenePath).href}?captions=${captions ? '1' : '0'}`

await mkdir(dirname(output), { recursive: true })
await mkdir(videoDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
  recordVideo: { dir: videoDir, size: { width: 1080, height: 1920 } }
})
const page = await context.newPage()
const video = page.video()

await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(durationMs)
await page.close()
const recordedPath = await video.path()
await context.close()
await browser.close()
await rename(recordedPath, output)

console.log(output)
