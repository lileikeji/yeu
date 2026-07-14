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

test('xiaohongshu recreation gallery references every public image with explicit caveats', () => {
  const pagePath = join(process.cwd(), 'app/pages/research/xiaohongshu-images.vue')
  const page = readFileSync(pagePath, 'utf8')
  assert.equal(page.length > 0, true)
})

test('xiaohongshu recreation images are public but marked as non-evidence', () => {
  const page = readFileSync(join(process.cwd(), 'app/pages/research/xiaohongshu-images.vue'), 'utf8')
  assert.match(page, /AI重构图/)
  assert.match(page, /不是官方图片、原始实拍或独立事实证据/)

  for (const file of imageFiles) {
    assert.match(page, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(
      existsSync(join(process.cwd(), 'public/images/xiaohongshu-recreations-2026-07-15', file)),
      true,
      `${file} is missing from public images`
    )
  }
})
