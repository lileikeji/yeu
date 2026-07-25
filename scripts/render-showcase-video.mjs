import { mkdir, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = new Map(process.argv.slice(2).map((value, index, all) => {
  if (!value.startsWith('--')) return [value, true]
  return [value.slice(2), all[index + 1]?.startsWith('--') ? true : all[index + 1]]
}))

const url = String(args.get('url') || 'http://127.0.0.1:3014/showcase?autoplay=1&controls=0')
const output = resolve(String(args.get('out') || 'docs/marketing/exports/yeu-showcase-screen.webm'))
const durationMs = Number(args.get('duration') || 37_200)
const width = Number(args.get('width') || 1280)
const height = Number(args.get('height') || 720)
const videoDir = resolve('.tmp-showcase-video')

await mkdir(dirname(output), { recursive: true })
await mkdir(videoDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
})
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: videoDir,
    size: { width, height }
  }
})
const page = await context.newPage()
const video = page.video()

await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
await page.mouse.move(6, height - 6)
await page.waitForTimeout(durationMs)
await page.close()
const recordedPath = await video.path()
await context.close()
await browser.close()
await rename(recordedPath, output)

console.log(output)
