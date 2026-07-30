import { chromium } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputDir = resolve('docs/marketing/map-promo')
const campusImage = await readFile(resolve('public/images/intro/yeu-campus-hero.webp'))
const campusDataUrl = `data:image/webp;base64,${campusImage.toString('base64')}`

const variants = [
  {
    name: 'cover-vertical-v2.png',
    width: 1080,
    height: 1440,
    className: 'vertical',
  },
  {
    name: 'cover-horizontal-v2.png',
    width: 1440,
    height: 1080,
    className: 'horizontal',
  },
]

function posterHtml({ width, height, className }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    body {
      position: relative;
      color: #fff;
      background: #163c32;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
    }
    .campus {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: ${className === 'vertical' ? '48% center' : 'center 55%'};
      filter: saturate(.82) contrast(1.04) brightness(.88);
    }
    .shade {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(8, 39, 31, .92) 0%, rgba(8, 39, 31, .46) 38%, rgba(8, 39, 31, .08) 64%, rgba(8, 39, 31, .76) 100%),
        linear-gradient(90deg, rgba(8, 39, 31, .24), transparent 48%, rgba(8, 39, 31, .12));
    }
    .grain {
      position: absolute;
      inset: 0;
      opacity: .07;
      background-image: radial-gradient(rgba(255,255,255,.72) .7px, transparent .7px);
      background-size: 6px 6px;
    }
    .content {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      padding: ${className === 'vertical' ? '82px 76px 70px' : '70px 84px 60px'};
    }
    .eyebrow {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: ${className === 'vertical' ? '30px' : '28px'};
      font-weight: 700;
      color: #d9f4e5;
    }
    .mark {
      width: 17px;
      height: 17px;
      border-radius: 50%;
      background: #6ee7b7;
      box-shadow: 0 0 0 9px rgba(110, 231, 183, .18);
    }
    h1 {
      width: ${className === 'vertical' ? '900px' : '1080px'};
      margin: ${className === 'vertical' ? '36px 0 0' : '30px 0 0'};
      font-size: ${className === 'vertical' ? '108px' : '92px'};
      line-height: 1.08;
      letter-spacing: 0;
      text-shadow: 0 6px 28px rgba(0, 24, 17, .30);
    }
    h1 em {
      display: block;
      color: #a7f3d0;
      font-style: normal;
    }
    .route {
      position: absolute;
      ${className === 'vertical' ? 'left: 88px; top: 680px; width: 750px; height: 260px;' : 'right: 82px; top: 250px; width: 500px; height: 330px;'}
    }
    .route-line {
      position: absolute;
      left: 32px;
      right: 34px;
      top: 118px;
      height: 8px;
      border-radius: 8px;
      background: rgba(255, 255, 255, .84);
      transform: rotate(-9deg);
      box-shadow: 0 4px 20px rgba(0, 24, 17, .24);
    }
    .pin {
      position: absolute;
      width: 48px;
      height: 48px;
      border: 8px solid #fff;
      border-radius: 50% 50% 50% 8px;
      background: #0f8b69;
      transform: rotate(-45deg);
      box-shadow: 0 8px 22px rgba(0, 24, 17, .28);
    }
    .pin::after {
      content: '';
      position: absolute;
      inset: 8px;
      border-radius: 50%;
      background: #a7f3d0;
    }
    .pin.start { left: 14px; top: 146px; }
    .pin.end { right: 12px; top: 38px; background: #d97706; }
    .pin.end::after { background: #fef3c7; }
    .bottom {
      margin-top: auto;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 40px;
    }
    .features {
      display: flex;
      flex-wrap: wrap;
      gap: 18px 30px;
      max-width: ${className === 'vertical' ? '760px' : '900px'};
      font-size: ${className === 'vertical' ? '31px' : '29px'};
      font-weight: 700;
    }
    .feature { display: flex; align-items: center; gap: 12px; }
    .feature i {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #a7f3d0;
    }
    .note {
      margin-top: 26px;
      color: rgba(255,255,255,.74);
      font-size: ${className === 'vertical' ? '23px' : '21px'};
      font-weight: 600;
    }
    .index {
      flex: 0 0 auto;
      font-size: ${className === 'vertical' ? '54px' : '50px'};
      font-weight: 800;
      color: rgba(255,255,255,.34);
    }
  </style>
</head>
<body class="${className}">
  <img class="campus" src="${campusDataUrl}" alt="">
  <div class="shade"></div>
  <div class="grain"></div>
  <div class="content">
    <div class="eyebrow"><span class="mark"></span>仰恩新生地图</div>
    <h1>到校第一天<em>宿舍怎么找？</em></h1>
    <div class="route" aria-hidden="true">
      <span class="route-line"></span>
      <span class="pin start"></span>
      <span class="pin end"></span>
    </div>
    <div class="bottom">
      <div>
        <div class="features">
          <span class="feature"><i></i>搜楼名</span>
          <span class="feature"><i></i>看位置</span>
          <span class="feature"><i></i>规划步行路线</span>
        </div>
        <div class="note">非学校官方 · 学生维护 · 重要信息以学校通知为准</div>
      </div>
      <div class="index">01</div>
    </div>
  </div>
</body>
</html>`
}

await mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({ headless: true })

try {
  for (const variant of variants) {
    const page = await browser.newPage({
      viewport: { width: variant.width, height: variant.height },
      deviceScaleFactor: 1,
    })
    await page.setContent(posterHtml(variant), { waitUntil: 'load' })
    await page.screenshot({
      path: resolve(outputDir, variant.name),
      type: 'png',
      fullPage: false,
    })
    await page.close()
    console.log(`saved ${variant.name}`)
  }
} finally {
  await browser.close()
}
