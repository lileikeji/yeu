import assert from 'node:assert/strict'
import { test } from 'node:test'
import { candidateImageUrls, hasContentImages, imageOcrConfigFromEnv } from '../server/modules/knowledge/image-ocr'

const PAGE = 'https://www.yeu.edu.cn/2026/0831/c1178a58277/page.htm'

test('候选图片：挑正文图、扔掉站标和二维码', () => {
  const html = `
    <div class="header"><img src="/_upload/logo.png" width="320" height="80"></div>
    <div class="wp_articlecontent">
      <img src="/_upload/article/images/aa/bb/notice1.jpg">
      <img src="_upload/article/images/cc/dd/notice2.png">
      <img src="/_upload/icon_share.gif">
      <img src="/_upload/article/images/ee/ff/qrcode.jpg">
      <img src="/_upload/article/images/gg/hh/sprite_arrow.png" width="24" height="24">
    </div>
  `
  const urls = candidateImageUrls(html, PAGE, 5)
  assert.deepEqual(urls, [
    'https://www.yeu.edu.cn/_upload/article/images/aa/bb/notice1.jpg',
    'https://www.yeu.edu.cn/2026/0831/c1178a58277/_upload/article/images/cc/dd/notice2.png'
  ])
})

test('候选图片：data-src 懒加载与 data URI 处理', () => {
  const html = `
    <img data-src="https://www.yeu.edu.cn/_upload/article/images/x1.jpg" src="data:image/gif;base64,R0lGOD">
    <img src="data:image/png;base64,iVBORw0KGgo=">
  `
  assert.deepEqual(candidateImageUrls(html, PAGE, 3), ['https://www.yeu.edu.cn/_upload/article/images/x1.jpg'])
  assert.equal(hasContentImages(html, PAGE), true)
  assert.equal(hasContentImages('<p>只有文字</p>', PAGE), false)
})

test('候选图片：按 limit 截断，避免一页几十张图把额度烧光', () => {
  const html = Array.from({ length: 6 }, (_, index) => `<img src="/_upload/a${index}.jpg">`).join('')
  assert.equal(candidateImageUrls(html, PAGE, 2).length, 2)
})

test('OCR 配置：三个变量缺一不可', () => {
  assert.equal(imageOcrConfigFromEnv({}), null)
  assert.equal(imageOcrConfigFromEnv({ OCR_BASE_URL: 'https://api.example.com/v1', OCR_API_KEY: 'k' }), null)
  const config = imageOcrConfigFromEnv({
    OCR_BASE_URL: 'https://api.example.com/v1/',
    OCR_API_KEY: 'k',
    OCR_MODEL: 'qwen-vl'
  })
  assert.deepEqual(config, {
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'k',
    model: 'qwen-vl',
    timeoutMs: 60_000
  })
})
