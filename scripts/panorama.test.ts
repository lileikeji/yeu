import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { searchSystemFeatures } from '../data/system-features'
import { homeMoreEntries } from '../app/utils/home-presentation'

const pageSource = readFileSync(resolve('app/pages/panorama.vue'), 'utf8')
const officialViewerSource = readFileSync(resolve('app/components/panorama/BaiduCampusViewer.vue'), 'utf8')
const mobileProxySource = readFileSync(resolve('server/api/public/panorama/campus.get.ts'), 'utf8')
const sitemapSource = readFileSync(resolve('server/routes/sitemap.xml.ts'), 'utf8')

test('panorama page separates campus scenes from the verified official history tour', () => {
  assert.match(pageSource, /map\.baidu\.com\/poi/)
  assert.match(pageSource, /26 个校内拍摄点/)
  assert.match(pageSource, /https:\/\/www\.720yun\.com\/vr\/c66jOpeOOa3/)
  assert.match(pageSource, /https:\/\/news\.yeu\.edu\.cn\/2023\/0621\/c704a39166\/page\.htm/)
  assert.match(pageSource, /v-if="viewerLoaded"/)
  assert.match(pageSource, /allowfullscreen/)
  assert.match(pageSource, /activeViewerUrl/)
  assert.doesNotMatch(pageSource, /\/api\/public\/panorama\/campus/)
  assert.match(pageSource, /sandbox="allow-scripts allow-same-origin allow-forms/)
  assert.match(pageSource, /allow-popups-to-escape-sandbox/)
  assert.doesNotMatch(pageSource, /credentialless/)
  assert.match(pageSource, /它不是学校官方拍摄/)
  assert.match(pageSource, /只拍了校史馆里面/)
  assert.match(pageSource, /现在开始逛校园/)
})

test('legacy campus panorama endpoint only redirects to the external provider', () => {
  assert.match(mobileProxySource, /sendRedirect\(event, BAIDU_CAMPUS_PAGE_URL, 302\)/)
  assert.doesNotMatch(mobileProxySource, /response\.text\(\)/)
  assert.doesNotMatch(mobileProxySource, /Content-Type.*text\/html/)
  assert.match(mobileProxySource, /assertRateLimit/)
})

test('official Baidu panorama viewer exposes all 26 campus scenes with a safe fallback', () => {
  assert.equal((officialViewerSource.match(/\{ label: '.+?', panoId:/g) ?? []).length, 26)
  assert.match(officialViewerSource, /BMapGL/)
  assert.match(officialViewerSource, /setId/)
  assert.match(officialViewerSource, /想看哪里，点名字就行/)
  assert.match(pageSource, /officialPanoramaFailed/)
  assert.match(pageSource, /PanoramaBaiduCampusViewer/)
  assert.match(pageSource, /v-else/)
})

test('panorama has direct home, search, AI and sitemap entry points', () => {
  assert.equal(homeMoreEntries.find(item => item.title === '全景云游校园')?.to, '/panorama')
  assert.equal(searchSystemFeatures('我想在线看校园全景')[0]?.to, '/panorama')
  assert.match(sitemapSource, /\['\/panorama', '0\.7', 'monthly'\]/)
})
