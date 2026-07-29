import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { searchSystemFeatures } from '../data/system-features'
import { discoverTaskEntries } from '../app/utils/discover-presentation'
import { homeMoreEntries } from '../app/utils/home-presentation'

const pageSource = readFileSync(resolve('app/pages/dorms.vue'), 'utf8')
const panoramaSource = readFileSync(resolve('app/pages/panorama.vue'), 'utf8')
const sitemapSource = readFileSync(resolve('server/routes/sitemap.xml.ts'), 'utf8')

test('dorm module presents ordinary and comfort walkthroughs as videos', () => {
  assert.match(pageSource, /type DormId = 'ordinary' \| 'comfort'/)
  assert.match(pageSource, /\/media\/ordinary-dorm-tour\.mp4/)
  assert.match(pageSource, /\/media\/comfort-dorm-tour\.mp4/)
  assert.match(pageSource, /ordinary-dorm-poster\.jpg/)
  assert.match(pageSource, /comfort-dorm-poster\.jpg/)
  assert.match(pageSource, /controls/)
  assert.match(pageSource, /playsinline/)
  assert.match(pageSource, /都不是 360° 全景/)
  assert.doesNotMatch(panoramaSource, /dorm-tour\.mp4/)
})

test('dorm media uses web-compatible files with meaningful sizes', () => {
  assert.ok(statSync(resolve('public/media/ordinary-dorm-tour.mp4')).size > 4_000_000)
  assert.ok(statSync(resolve('public/media/comfort-dorm-tour.mp4')).size > 2_000_000)
  assert.ok(statSync(resolve('public/images/panorama/ordinary-dorm-poster.jpg')).size > 20_000)
  assert.ok(statSync(resolve('public/images/panorama/comfort-dorm-poster.jpg')).size > 10_000)
})

test('home, discover, AI feature search and sitemap expose the dorm module', () => {
  assert.equal(homeMoreEntries.find(item => item.title === '宿舍实拍')?.to, '/dorms')
  assert.ok(discoverTaskEntries.some(item => item.title === '宿舍实拍' && item.to === '/dorms'))
  assert.equal(searchSystemFeatures('普通宿舍内部视频在哪看')[0]?.to, '/dorms')
  assert.equal(searchSystemFeatures('舒适型宿舍长什么样')[0]?.to, '/dorms')
  assert.match(sitemapSource, /\['\/dorms', '0\.7', 'monthly'\]/)
})
