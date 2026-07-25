import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { searchSystemFeatures } from '../data/system-features'
import { homeMoreEntries } from '../app/utils/home-presentation'

const pageSource = readFileSync(resolve('app/pages/panorama.vue'), 'utf8')
const sitemapSource = readFileSync(resolve('server/routes/sitemap.xml.ts'), 'utf8')

test('panorama page separates campus scenes from the verified official history tour', () => {
  assert.match(pageSource, /map\.baidu\.com\/poi/)
  assert.match(pageSource, /26 个校内拍摄点/)
  assert.match(pageSource, /https:\/\/www\.720yun\.com\/vr\/c66jOpeOOa3/)
  assert.match(pageSource, /https:\/\/news\.yeu\.edu\.cn\/2023\/0621\/c704a39166\/page\.htm/)
  assert.match(pageSource, /v-if="viewerLoaded"/)
  assert.match(pageSource, /allowfullscreen/)
  assert.match(pageSource, /它不是学校官方拍摄/)
  assert.match(pageSource, /只拍了校史馆里面/)
  assert.match(pageSource, /现在开始逛校园/)
})

test('panorama has direct home, search, AI and sitemap entry points', () => {
  assert.equal(homeMoreEntries.find(item => item.title === '全景云游校园')?.to, '/panorama')
  assert.equal(searchSystemFeatures('我想在线看校园全景')[0]?.to, '/panorama')
  assert.match(sitemapSource, /\['\/panorama', '0\.7', 'monthly'\]/)
})
