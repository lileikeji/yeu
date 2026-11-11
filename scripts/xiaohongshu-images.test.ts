import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const imageFiles = [
  'dorm-standard-room-overview-hd.png',
  'dorm-standard-environment-cover-hd.png',
  'dorm-public-shower-stalls-hd.png',
  'dorm-public-restroom-stalls-hd.png',
  'dorm-communal-washroom-hd.png',
  'express-new-area-student-street-reference-hd.png',
  'express-old-area-south-gate-route-reference-hd.png',
  'express-old-area-south-gate-pickup-reference-hd.png',
  'express-old-area-honglu-building-reference-hd.png',
  'food-xiyou-black-pepper-beef-hd.png',
  'food-xiyou-fried-chicken-noodles-hd.png',
  'food-sinian-matcha-shaved-ice-taro-balls-hd.png',
  'food-sinian-spicy-chicken-pot-hd.png',
  'dingding-historical-operation-info-hd.png',
  'dingding-shuttle-fleet-concept-hd.png',
  'dingding-shuttle-depot-concept-hd.png',
  'dingding-new-area-stop-concept-hd.png',
  'dingding-old-area-stop-concept-hd.png'
]

test('the social image research page is retired and cannot come back as a public route', () => {
  // 2026-11-10 下线：这个内部研究页混在公开路由里，没有任何前台入口，
  // 也没有用户价值。保留这条断言，防止它被重新加回 app/pages。
  const pagePath = join(process.cwd(), 'app/pages/research/xiaohongshu-images.vue')
  assert.equal(existsSync(pagePath), false, '研究页已下线，不要加回公开路由')
  assert.equal(existsSync(join(process.cwd(), 'app/pages/research')), false, 'research 目录不再存在')
})

test('xiaohongshu derivatives are absent from public images and indexed without shipping binaries', () => {
  const index = readFileSync(
    join(process.cwd(), 'data/generated/xiaohongshu-recreations-2026-07-15/INDEX.md'),
    'utf8'
  )

  for (const file of imageFiles) {
    assert.equal(
      existsSync(join(process.cwd(), 'public/images/xiaohongshu-recreations-2026-07-15', file)),
      false,
      `${file} must not be exposed from public images without permission`
    )
    assert.match(index, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('xiaohongshu source assets retain an explicit research-only policy', () => {
  const manifest = readFileSync(join(process.cwd(), 'data/imports/xiaohongshu-assets/manifest.json'), 'utf8')
  assert.match(manifest, /"publicationStatus": "research-only"/)
  assert.match(manifest, /"rightsStatus": "permission-not-obtained"/)
  assert.match(manifest, /"publicDirectoryAllowed": false/)
})
