import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dormDisclaimers, dormTours, findDormTour, resolveDormAssetUrl } from '../shared/utils/dorm-presentation'

const dormsPage = readFileSync('miniapp/pages/dorms/index.vue', 'utf8')
const panoramaPage = readFileSync('miniapp/pages/panorama/index.vue', 'utf8')
const pagesJson = readFileSync('miniapp/pages.json', 'utf8')

test('dorm tours carry media, highlights and a fallback disclaimer', () => {
  assert.ok(dormTours.length >= 2)
  for (const tour of dormTours) {
    assert.ok(tour.id && tour.name && tour.badge && tour.duration, `${tour.id} identity`)
    assert.ok(tour.summary && tour.detail, `${tour.id} copy`)
    assert.match(tour.videoPath, /^\/media\/.+\.mp4$/, `${tour.id} video path`)
    assert.match(tour.posterPath, /^\/images\/.+\.(jpg|jpeg|png|webp)$/i, `${tour.id} poster path`)
    assert.ok(tour.highlights.length >= 2, `${tour.id} highlights`)
  }
  assert.equal(dormDisclaimers.length, 2)
  for (const item of dormDisclaimers) assert.ok(item.title && item.body)
})

test('dorm asset urls are absolute because miniapp media src cannot be a bare path', () => {
  assert.equal(
    resolveDormAssetUrl('https://yx.huiliyill.cn', '/media/a.mp4'),
    'https://yx.huiliyill.cn/media/a.mp4'
  )
  // 末尾斜杠不能拼成双斜杠
  assert.equal(
    resolveDormAssetUrl('https://yx.huiliyill.cn/', '/media/a.mp4'),
    'https://yx.huiliyill.cn/media/a.mp4'
  )
  assert.equal(findDormTour('comfort').id, 'comfort')
  assert.equal(findDormTour('does-not-exist').id, dormTours[0]!.id)
})

test('dorm page degrades gracefully when media cannot load', () => {
  // 域名白名单或网络失败时必须有出口，不能只留一个黑框。
  assert.match(dormsPage, /@error="videoFailed = true"/)
  assert.match(dormsPage, /@error="markPosterFailed\(tour\.id\)"/)
  assert.match(dormsPage, /复制视频链接/)
  assert.match(dormsPage, /note-pending/)
  assert.doesNotMatch(dormsPage, /feedback_open/)
})

test('dorm page reuses the shared tour data instead of duplicating it', () => {
  assert.match(dormsPage, /from '@shared\/utils\/dorm-presentation'/)
  assert.match(dormsPage, /dormTours/)
  assert.match(dormsPage, /dormDisclaimers/)
  // 宿舍楼入口要落到地图的 dorm 分类
  assert.match(dormsPage, /goMapCategory\('dorm'\)/)
})

test('panorama page hands off through the clipboard instead of faking an embed', () => {
  assert.match(panoramaPage, /openExternal\(tour\.url\)/)
  assert.match(panoramaPage, /业务域名/)
  // 不能偷偷用 web-view 绕开业务域名门禁
  assert.doesNotMatch(panoramaPage, /<web-view/)
})

test('both new pages are registered and reachable from 服务导航', () => {
  assert.match(pagesJson, /"path": "pages\/dorms\/index"/)
  assert.match(pagesJson, /"path": "pages\/panorama\/index"/)
  const services = readFileSync('miniapp/pages/services/index.vue', 'utf8')
  assert.match(services, /openDorms\(\)/)
  assert.match(services, /openPanorama\(\)/)
  assert.match(services, /\/pages\/dorms\/index/)
  assert.match(services, /\/pages\/panorama\/index/)
})
