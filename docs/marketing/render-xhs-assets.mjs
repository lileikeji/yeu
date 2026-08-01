import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const outDir = 'E:/yeu/docs/marketing/xhs-assets';
fs.mkdirSync(outDir, { recursive: true });

const posters = [
  {
    file: 'poster-cover.html',
    out: '01-cover.png',
    html: `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{width:1080px;height:1440px;font-family:"PingFang SC","Microsoft YaHei",sans-serif;
        background:linear-gradient(160deg,#ecfdf5 0%,#fff7ed 45%,#ffffff 100%);color:#0a0a0a;overflow:hidden}
      .badge{display:inline-flex;gap:8px;align-items:center;background:#dcfce7;color:#166534;padding:10px 18px;border-radius:999px;font-size:28px;font-weight:700}
      .wrap{padding:72px 64px}
      h1{margin-top:36px;font-size:96px;line-height:1.1;letter-spacing:-1px}
      .sub{margin-top:24px;font-size:42px;color:#3f3f46;line-height:1.45;font-weight:600}
      .phone{margin:56px auto 0;width:620px;height:760px;border-radius:48px;border:10px solid #111;background:#fff;box-shadow:0 30px 80px rgba(16,185,129,.18);padding:28px;position:relative}
      .bar{height:18px;width:140px;border-radius:999px;background:#e4e4e7;margin:0 auto 22px}
      .map{height:420px;border-radius:28px;background:linear-gradient(180deg,#4f84bb 0%,#6ea0d0 100%);position:relative;overflow:hidden}
      .pin{position:absolute;width:34px;height:34px;border-radius:50%;background:#166534;border:4px solid #fff;box-shadow:0 6px 16px rgba(0,0,0,.2)}
      .pin.o{background:#ea580c}
      .card{margin-top:18px;padding:18px 20px;border-radius:20px;background:#fff7ed;border:1px solid #fdba74}
      .card b{display:block;font-size:30px;color:#9a3412}
      .card span{display:block;margin-top:8px;font-size:24px;color:#c2410c}
      .cta{margin-top:48px;display:flex;justify-content:space-between;align-items:center}
      .btn{background:#15803d;color:#fff;padding:22px 34px;border-radius:999px;font-size:32px;font-weight:800}
      .url{font-size:28px;color:#52525b;font-weight:700}
      .note{margin-top:28px;font-size:24px;color:#71717a}
    </style></head><body><div class="wrap">
      <div class="badge">2026 新生 · 本科 / 专升本</div>
      <h1>仰恩新生指南</h1>
      <p class="sub">一张图搞定报到 · 宿舍 · 办事<br/>不用登录，打开就能用</p>
      <div class="phone">
        <div class="bar"></div>
        <div class="map">
          <div class="pin" style="left:22%;top:30%"></div>
          <div class="pin o" style="left:48%;top:42%"></div>
          <div class="pin" style="left:68%;top:28%"></div>
          <div class="pin" style="left:36%;top:62%"></div>
          <div class="pin o" style="left:58%;top:68%"></div>
          <div style="position:absolute;left:18px;bottom:18px;background:rgba(255,255,255,.92);padding:10px 14px;border-radius:14px;font-size:22px;font-weight:700;color:#14532d">校园地图 · 官方平面图</div>
        </div>
        <div class="card"><b>9月5–6日 报到</b><span>流程可点 · 地点可跳转地图</span></div>
      </div>
      <div class="cta"><div class="btn">免费打开</div><div class="url">yx.huiliyill.cn</div></div>
      <p class="note">非学校官方平台 · 学生团队维护 · 重要信息以学校通知为准</p>
    </div></body></html>`
  },
  {
    file: 'poster-compare.html',
    out: '02-compare.png',
    html: `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{width:1080px;height:1440px;font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#fafafa;padding:64px;color:#09090b}
      h1{font-size:64px;line-height:1.2;margin-bottom:18px}
      .lead{font-size:30px;color:#52525b;margin-bottom:40px;line-height:1.5}
      .cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}
      .col{border-radius:28px;padding:28px;min-height:780px}
      .bad{background:#fff1f2;border:2px solid #fecdd3}
      .good{background:#ecfdf5;border:2px solid #86efac}
      .col h2{font-size:36px;margin-bottom:22px}
      .item{display:flex;gap:12px;align-items:flex-start;padding:16px 0;border-bottom:1px dashed rgba(0,0,0,.08);font-size:28px;line-height:1.4;font-weight:600}
      .x{color:#e11d48;font-weight:900}.c{color:#15803d;font-weight:900}
      .bottom{margin-top:36px;background:#111;color:#fff;border-radius:24px;padding:28px 30px}
      .bottom b{display:block;font-size:34px}
      .bottom span{display:block;margin-top:10px;font-size:26px;color:#d4d4d8}
      .foot{margin-top:22px;font-size:24px;color:#71717a}
    </style></head><body>
      <h1>别再在群聊里翻截图了</h1>
      <p class="lead">普通攻略是“看完还得自己拼”；我们做成可点、可定位、可照做的工具。</p>
      <div class="cols">
        <div class="col bad"><h2>普通新生帖</h2>
          <div class="item"><span class="x">×</span><span>信息散、容易过期</span></div>
          <div class="item"><span class="x">×</span><span>只说名字，不知道怎么走</span></div>
          <div class="item"><span class="x">×</span><span>办事步骤不全</span></div>
          <div class="item"><span class="x">×</span><span>来源不清，难判断真假</span></div>
          <div class="item"><span class="x">×</span><span>看完还要再搜地图/群聊</span></div>
        </div>
        <div class="col good"><h2>仰恩新生指南</h2>
          <div class="item"><span class="c">√</span><span>地图可定位，地点可外跳导航</span></div>
          <div class="item"><span class="c">√</span><span>报到/校园卡/网络可照做</span></div>
          <div class="item"><span class="c">√</span><span>来源与核验可追溯</span></div>
          <div class="item"><span class="c">√</span><span>持续更新，不是一次性帖</span></div>
          <div class="item"><span class="c">√</span><span>免登录，手机/微信直接打开</span></div>
        </div>
      </div>
      <div class="bottom"><b>一个站覆盖入学高频场景</b><span>校园地图 · 官方平面图 · 办事流程 · 生活服务 · 后续 Agent 搜索</span></div>
      <p class="foot">yx.huiliyill.cn · 本科 / 专升本 · 非学校官方</p>
    </body></html>`
  },
  {
    file: 'poster-features.html',
    out: '03-features.png',
    html: `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{width:1080px;height:1440px;font-family:"PingFang SC","Microsoft YaHei",sans-serif;
        background:linear-gradient(180deg,#f0fdf4 0%,#ffffff 40%);padding:64px;color:#0a0a0a}
      h1{font-size:60px;line-height:1.15}
      .sub{margin-top:16px;font-size:30px;color:#3f3f46;line-height:1.5}
      .grid{margin-top:42px;display:grid;grid-template-columns:1fr 1fr;gap:22px}
      .card{background:#fff;border:1px solid #d1fae5;border-radius:26px;padding:28px;min-height:230px;box-shadow:0 10px 30px rgba(16,185,129,.08)}
      .icon{width:56px;height:56px;border-radius:16px;display:grid;place-items:center;font-size:28px;font-weight:900;color:#fff;margin-bottom:18px}
      .card h3{font-size:34px;margin-bottom:10px}
      .card p{font-size:26px;color:#52525b;line-height:1.45}
      .ribbon{margin-top:34px;background:linear-gradient(90deg,#ea580c,#f97316);color:#fff;border-radius:24px;padding:28px;font-size:32px;font-weight:800}
      .ribbon small{display:block;margin-top:10px;font-size:24px;font-weight:600;opacity:.95}
      .foot{margin-top:28px;font-size:24px;color:#71717a}
    </style></head><body>
      <h1>一个站覆盖入学高频场景</h1>
      <p class="sub">不是“一篇攻略”，而是持续更新的仰恩新生工具站。</p>
      <div class="grid">
        <div class="card"><div class="icon" style="background:#15803d">1</div><h3>校园地图</h3><p>宿舍、教学楼、快递、商铺等，列表与标点联动</p></div>
        <div class="card"><div class="icon" style="background:#0f766e">2</div><h3>官方平面图</h3><p>校网平面图 + 编号热点，拖动查看、点击定位</p></div>
        <div class="card"><div class="icon" style="background:#c2410c">3</div><h3>报到办事</h3><p>步骤、材料、地点串起来，能跳回地图</p></div>
        <div class="card"><div class="icon" style="background:#1d4ed8">4</div><h3>卡与网络</h3><p>校园卡 / 校园网等高频事项结构化说明</p></div>
        <div class="card"><div class="icon" style="background:#7c3aed">5</div><h3>周边生活</h3><p>快递外卖与周边服务入口，到校即用</p></div>
        <div class="card"><div class="icon" style="background:#be123c">6</div><h3>搜索与社团</h3><p>站内检索 + 社团招新信息聚合</p></div>
      </div>
      <div class="ribbon">后续接入 Agent 智能搜索<small>你问“宿舍怎么走 / 校园卡怎么办”，直接给答案和地点</small></div>
      <p class="foot">yx.huiliyill.cn · 本科 / 专升本 · 手机优先 · 可加到主屏幕</p>
    </body></html>`
  }
];

for (const p of posters) {
  fs.writeFileSync(path.join(outDir, p.file), p.html, 'utf8');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 2 });
for (const p of posters) {
  const filePath = path.join(outDir, p.file).replace(/\\/g, '/');
  await page.goto('file:///' + filePath);
  await page.screenshot({ path: path.join(outDir, p.out), type: 'png', fullPage: false });
  console.log('saved', p.out);
}

const live = [
  { url: 'https://yx.huiliyill.cn/', out: 'page-home.png', w: 390, h: 844 },
  { url: 'https://yx.huiliyill.cn/map', out: 'page-map.png', w: 390, h: 844 },
  { url: 'https://yx.huiliyill.cn/procedures', out: 'page-procedures.png', w: 390, h: 844 }
];
for (const s of live) {
  try {
    const p2 = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
    await p2.goto(s.url, { waitUntil: 'networkidle', timeout: 45000 });
    await p2.waitForTimeout(1800);
    const skip = p2.locator('button:has-text("跳过"), button:has-text("开始使用"), button:has-text("知道了"), button:has-text("进入"), button:has-text("我知道了")');
    if (await skip.count()) {
      try { await skip.first().click({ timeout: 2000 }); } catch {}
    }
    await p2.screenshot({ path: path.join(outDir, s.out), type: 'png', fullPage: false });
    console.log('saved', s.out);
    await p2.close();
  } catch (e) {
    console.log('skip live', s.out, String(e).slice(0, 200));
  }
}
await browser.close();
console.log('done');
