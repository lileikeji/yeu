import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { searchSystemFeatures } from '../data/system-features'
import { homeMoreEntries } from '../app/utils/home-presentation'

const pageSource = readFileSync(resolve('app/pages/panorama.vue'), 'utf8')
const sitemapSource = readFileSync(resolve('server/routes/sitemap.xml.ts'), 'utf8')

test('panorama page embeds the verified official tour only after user intent', () => {
  assert.match(pageSource, /https:\/\/www\.720yun\.com\/vr\/c66jOpeOOa3/)
  assert.match(pageSource, /https:\/\/news\.yeu\.edu\.cn\/2023\/0621\/c704a39166\/page\.htm/)
  assert.match(pageSource, /v-if="viewerLoaded"/)
  assert.match(pageSource, /allowfullscreen/)
  assert.match(pageSource, /并不是整个校园的户外全景/)
})

test('panorama has direct home, search, AI and sitemap entry points', () => {
  assert.equal(homeMoreEntries.find(item => item.title === '全景云游校园')?.to, '/panorama')
  assert.equal(searchSystemFeatures('我想在线看校园全景')[0]?.to, '/panorama')
  assert.match(sitemapSource, /\['\/panorama', '0\.7', 'monthly'\]/)
})
