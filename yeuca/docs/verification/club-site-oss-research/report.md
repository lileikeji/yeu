# 仰恩大学计算机协会官网 · 开源选型调研

> 数据口径：star / 最近推送时间 / 许可均由 `https://api.github.com/repos/{owner}/{repo}` 实时读取，**查看时间 2026-11-16 23:30–2026-11-17 00:20 (UTC+8)**。star 一律写「约」。
> 真实站点取证：`https://jxauac.cn/`、`https://net9.org/` 本轮实抓 HTML，见第 4 节。
> 表单额度：Web3Forms / Formspree / Cloudflare D1 / Supabase 的额度数字来自各自定价页原文，见第 5 节；腾讯问卷、飞书的额度页本轮未取到明确数字，已标注。

---

## 一、推荐组合（先给结论）

**主站：Astro + AstroWind 骨架自建（MIT）**，或者团队里没人写前端时退化为 **Hugo + Blox(9797★, MIT)**。
**报名表：Web3Forms（250 次/月免费）做主，腾讯问卷/飞书多维表格做兜底**，理由是同机 50+ 站点、根盘 82%，任何自建后端（含 Cloudflare Workers 之外的自建 API）都不该落在这台机器上。

一句话架构：**构建在本机或 CI 出 `dist/`，服务器只解包 + nginx 指向，零 Node 常驻、零数据库、零服务器构建**。这条和 `~/.agents/AGENTS.md` 里「生产机禁止构建」的红线一致：在 124.221.145.182 上跑 `astro build` 会跟 yeu 一样被 OOM 杀掉。

为什么不选 Hexo 当主站：Hexo 生态（Butterfly 8.4k / Fluid 8.2k）中文资料最多，但它本质是「博客主题」，首页 hero+统计、活动、项目作品、成员四个栏目都要自己写 ejs 模板或装插件，改一个 md 能发文但改版式要动模板；而且 `hexo generate` 在 3.6G 内存机器上跑要几百 MB，等于把构建又搬回服务器。

---

## 二、总表

八个必备栏目简写：**首**(hero+统计) **闻**(动态/新闻) **活**(活动) **项**(项目作品) **资**(资源/学习) **员**(成员) **关**(关于) **加**(报名)。

| 项目 (owner/repo) | star | 最近推送 | 技术栈 | 产物 | 许可 | 栏目匹配 | 成本(人日) | 结论 |
|---|---|---|---|---|---|---|---|---|
| [satnaing/astro-paper](https://github.com/satnaing/astro-paper) | 约5.2k | 2026-11-15 | Astro 5 + TS | 纯静态 | MIT | 闻 ✓，其余全靠写（2/8） | 8–10 | 只适合当「动态」栏目的参考，不做主站 |
| [withastro/starlight](https://github.com/withastro/starlight) | 约9.6k | 2026-11-15 | Astro + TS | 纯静态 | MIT | 资 ✓ 关 ~（2/8） | 3–5 | 值得当**资源/学习资料子站**，不做首页 |
| [markhorn-dev/astro-nano](https://github.com/markhorn-dev/astro-nano) | 约956 | **2025-06-16** | Astro + Tailwind | 纯静态 | MIT | 项 ✓ 闻 ✓（3/8） | 6–8 | 已停更 17 个月，只借它的单页排版 |
| [arthelokyo/astrowind](https://github.com/arthelokyo/astrowind)（原 onwidget/astrowind） | 约6.1k | 2026-09-12 | Astro v7 + Tailwind v4 | 纯静态 | MIT | 首 ✓ 闻 ✓ 关 ✓ 加 ~（4/8） | 5–7 | **主站首选骨架**，落地页组件最全 |
| [chrismwilliams/astro-theme-cactus](https://github.com/chrismwilliams/astro-theme-cactus) | 约1.8k | 2026-11-01 | Astro + TS | 纯静态 | MIT | 闻 ✓（2/8） | 8–10 | 纯博客，不选 |
| [adityatelange/hugo-PaperMod](https://github.com/adityatelange/hugo-PaperMod) | 约14.0k | 2026-10-25 | Hugo | 纯静态 | MIT | 闻 ✓ 关 ✓ 资 ~（3/8） | 6–8 | Hugo 系最稳的博客底，栏目还是缺一半 |
| [HugoBlox/kit](https://github.com/HugoBlox/kit)（原 wowchemy/hugo-blox-builder） | 约9.8k | 2026-08-04 | Hugo + Tailwind | 纯静态 | MIT | 首 ✓ 闻 ✓ 员 ✓ 项 ✓ 资 ~（6/8） | 4–6 | **不改前端时的最优解**，blocks 拼装 |
| [luizdepra/hugo-coder](https://github.com/luizdepra/hugo-coder) | 约3.1k | 2026-11-15 | Hugo | 纯静态 | MIT | 闻 ✓（2/8） | 8–10 | 极简到只剩博客，不选 |
| [CaiJimmy/hugo-theme-stack](https://github.com/CaiJimmy/hugo-theme-stack) | 约6.5k | 活跃（762 commits） | Hugo | 纯静态 | **GPL-3.0** | 闻 ✓ 资 ~（3/8） | 6–8 | 中文口碑好，但 GPL，且栏目仍缺 |
| [hugo-fixit/FixIt](https://github.com/hugo-fixit/FixIt) | 约1.1k | 2026-11-16 | Hugo | 纯静态 | MIT | 闻 ✓ 资 ~ 关 ✓（3/8） | 5–7 | 中文化最到位的 Hugo 博客主题 |
| [HEIGE-PCloud/DoIt](https://github.com/HEIGE-PCloud/DoIt) | 约941 | 2026-11-03 | Hugo | 纯静态 | MIT | 闻 ✓ 资 ~（3/8） | 5–7 | FixIt 的上游同源，二选一即可 |
| [jerryc127/hexo-theme-butterfly](https://github.com/jerryc127/hexo-theme-butterfly) | 约8.4k | 2026-11-12 | Hexo + JS | 纯静态（需 Node 构建） | Apache-2.0 | 闻 ✓ 关 ✓ 资 ~（3/8） | 4–6 | 国内学生社团事实标准，但改版式要写 ejs |
| [fluid-dev/hexo-theme-fluid](https://github.com/fluid-dev/hexo-theme-fluid) | 约8.2k | 2026-06-24 | Hexo + JS | 纯静态 | **GPL-3.0** | 闻 ✓（3/8） | 5–7 | 好看，GPL + 半年未推，不优先 |
| [next-theme/hexo-theme-next](https://github.com/next-theme/hexo-theme-next) | 约2.8k | 2026-11-13 | Hexo + JS | 纯静态 | 自定义（LICENSE.md，GitHub 归类 Other） | 闻 ✓（2/8） | 7–9 | 老牌，许可要人工核，不选 |
| [volantis-x/hexo-theme-volantis](https://github.com/volantis-x/hexo-theme-volantis) | 约2.2k | 2026-09-08 | Hexo + JS | 纯静态 | MIT | 闻 ✓（2/8） | 6–8 | 二次元氛围强（net9 那类），栏目依旧缺 |
| [nuxt/content](https://github.com/nuxt/content) | 约3.7k | 2026-11-16 | Nuxt + Vue | **需 Node 运行时或 SSG** | MIT | 全可做（8/8） | 10–14 | 能做全，但代价是 Node/SSR，与本机约束冲突 |
| [shuding/nextra](https://github.com/shuding/nextra) | 约14.0k | 2026-07-31 | Next.js | SSG/SSR | MIT | 资 ✓ 闻 ✓（3/8） | 6–8 | 文档站型，做社团首页别扭 |
| [payloadcms/payload](https://github.com/payloadcms/payload) | 约45.8k | 2026-11-16 | Next.js + DB | **SSR + Postgres/Mongo** | MIT | 8/8 但要运维 | 15+ | 架构不符，直接排除 |
| [strapi/strapi](https://github.com/strapi/strapi) | 约73.5k | 2026-11-16 | Node + DB | **常驻服务 + DB** | 自定义（GitHub 归类 Other） | 8/8 但要运维 | 15+ | 同机 50 站点，别加常驻 Node |
| [directus/directus](https://github.com/directus/directus) | 约38.7k | 2026-11-16 | Node + DB | 常驻服务 + DB | 自定义（BSL 类，GitHub 归类 Other） | 8/8 | 15+ | 排除 |
| [JinkunTian/CAGarden](https://github.com/JinkunTian/CAGarden) | 约14 | 2026-10-23 | PHP + MySQL | 动态站 | 无 LICENSE | 宣传/纳新/义诊/OA/物资（功能参考） | — | 功能最贴「计算机协会」，但 PHP+DB，不能复用代码 |
| [DL-Association-for-Computing-Machinery/association-website](https://github.com/DL-Association-for-Computing-Machinery/association-website) | 约3 | 2026-10-14 | 静态 HTML | 纯静态 | 无 LICENSE | 首 闻 活 项 资 关 加（7/8，静态手写） | 2–3（抄结构） | 东华理工计协，纯 HTML，结构可抄不可维护 |
| [3yearsZhuang/CS-Web-Project](https://github.com/3yearsZhuang/CS-Web-Project) | 约4 | 2026-10-05 | 静态 HTML | 纯静态 | 无 LICENSE | 官网 6 栏 | 2–3 | 同上看结构 |
| [Rebuild-failed/NWUCA](https://github.com/Rebuild-failed/NWUCA) | 约2 | 2017-09-12 | HTML/CSS | 纯静态 | 无 LICENSE | — | — | 2017 年死仓，只看版式 |
| [ifancy803/CSTNU-CS-Association-Open-Knowledge-Base](https://github.com/ifancy803/CSTNU-CS-Association-Open-Knowledge-Base) | 约3 | 2025-09-30 | Markdown 知识库 | 纯文档 | MIT | 资 ✓ | 1–2（借鉴分类） | 资源栏目分类法可直接借 |
| [amfoss/club-website-2019](https://github.com/amfoss/club-website-2019) | 约470 | 2023-11-02 | JAMStack | 纯静态 | MIT | 首 闻 活 员（4/8） | 5–8 | 已弃维护，但 MIT 且结构完整，可 fork 改造 |

---

## 三、关键项目展开

### 3.1 AstroWind（约6.1k ★ / MIT / 2026-09-12）
- 仓库：`arthelokyo/astrowind`（**注意：原 `onwidget/astrowind` 已 301 迁到这里**，老链接会跳转，fork 时按新 owner 取）。
- 技术栈：Astro v7 + Tailwind v4，纯静态 `dist/`，无运行时、无 DB；构建需 Node ≥ 20，本机 30–60 秒级。
- 栏目：自带 Hero / Features / Stats / Steps / Content / Testimonials / FAQs / Pricing / Blog / Contact 这些可复用块 → 首页 hero+统计、关于、加入（Contact 改造）直接有；**活动、项目作品、成员、资源四个栏目要新建 Content Collections**（每个 20 行 schema + 一个列表页 + 一个详情页，约 0.5 人日/栏目）。
- 中文：`src/i18n` 有 en/es 等，加 `zh` 字典即可，文本量约 200 条。
- 结论：**值得用**。它是这批里唯一「落地页组件齐全 + MIT + Tailwind（移动端好看不用自己搭）」的骨架。

### 3.2 Hugo Blox kit（约9.8k ★ / MIT / 2026-08-04）
- 仓库：`HugoBlox/kit`（旧名 `HugoBlox/hugo-blox-builder` / `wowchemy`，老路径已重定向）。
- 技术栈：Hugo 单二进制 + Tailwind，`hugo` 一条命令出 `public/`，内存占用 ~100MB、构建 1–3 秒，**是所有候选里最省资源的**。
- 栏目：blocks 里已有 hero、stats、team（成员）、portfolio（项目作品）、blog（动态）、docs（资源）；活动栏目可用「collection + 时间轴」拼，报名用 contact/form block 指向第三方 endpoint。**这是唯一默认覆盖 6/8 栏目的模板**。
- 代价：默认英文文案 + AI 建站引导较新，中文 i18n 要自己补；版式偏「学术个人主页」，改配色比 Astro 麻烦（Tailwind class 藏在 block 参数里）。
- 结论：**团队没人碰前端时的最优解**，改 md + 改 `params` 就能发。

### 3.3 Astro Starlight（约9.6k ★ / MIT）+ 资源栏目
- 它解决的是「资源/学习资料」这个唯一需要多级目录 + 搜索 + 侧边栏的栏目。装在 `src/pages/resources` 下当子站，主站仍是 Astro，产物同一份 `dist/`，不增加任何运行时。
- 结论：**值得**，但只当子站；不要拿它当首页（它没有 hero 营销区）。

### 3.4 Hexo Butterfly（约8.4k ★ / Apache-2.0 / 2026-11-12）
- 为什么单列：国内高校社团/学生博客的事实标准，主题配置项上千条，中文文档和插件生态（访客统计、Live2D、说说）最全，net9.org 这类「氛围感」站点就是这条路。
- 但它解决不了本需求：八个栏目里它只天然给你「动态」和「关于」，活动/项目/成员要靠 `hexo-generator-*` 插件或手写 ejs 布局；Apache-2.0 许可没问题，构建却是 Node，`hexo g` 在 3.6G 机器上要几百 MB，等于把构建搬回服务器。
- 结论：**当审美参考，不当底座**。

### 3.5 社团专用真实仓库（第 5 类候选的答案）
- `JinkunTian/CAGarden`（约14★，PHP+MySQL，2026-10-23 仍更新）：功能最贴「计算机协会」——社团宣传、纳新、义诊、项目、OA、物资、密码管理，**但它要 PHP + MySQL + 常驻进程，架构和本机约束正面冲突**，只能当需求清单抄。
- `DL-Association-for-Computing-Machinery/association-website`（约3★，纯 HTML，东华理工计协）、`3yearsZhuang/CS-Web-Project`（约4★，希望之峰学院计协）：都是**手写静态 HTML**，2–3 人日能抄出结构，但没有内容模型，第二年新生接手就会烂。
- 结论：这一类**没有能直接 fork 的高质量现代栈仓库**（star 全在个位数，且无 LICENSE = 默认版权保留，不能合法复用代码，只能看结构）。真正可复用的「协会级」参考是下面的 jxauac.cn。

---

## 四、真实站点取证（本轮实抓，不是记忆）

**jxauac.cn（江西农大计算机协会）** — `curl` 抓首页原文：
```
<meta name="generator" content="Astro v7.2.9">
<title>首页 · 计算机协会</title>
```
导航路径（同页 href 提取）：`/news/ /activities/ /projects/ /resources/ /members/ /about/ /join/`，另有 `/search/`、`/archives/`。
→ **它就是我们这八个栏目的现成信息架构**：新闻、活动、项目、资源、成员、关于、加入，一个不多一个不少。这是本次调研最有价值的一条：栏目划分不用再讨论，照抄。

**报名表怎么落的** — 抓 `/join/` 原文：
```
<form method="post" action="/api/signups" data-signup-form ...>
fetch(`${BASE}api/signups`, { ... })
```
→ 它的报名表**不是纯静态**，打到自己域名下的 `/api/signups`，说明「纯静态站 + 报名表」这一步它用了一个小后端。这正好印证第 5 节：报名表必须外挂一个 endpoint，不能指望纯静态。

**net9.org（清华大学计算机系学生科协）** — 实抓：
```
<meta name="generator" content="Hexo 6.3.0">
<title> | 清华大学计算机系学生科协 </title>
```
→ 用户提到的 Hexo 6.3.0 属实。这类「氛围感 + 吉祥物」路线可作视觉参考，但同上，Hexo 不适合当底座。

---

## 五、报名表后端（免费额度均为本轮实抓定价页原文）

| 方案 | 免费额度（实访） | 静态站接入方式 | 国内可达性 | 备案 | 判断 |
|---|---|---|---|---|---|
| **Web3Forms** | **250 次提交/月，永久免费**（首页原文 “250 submissions/month free, forever”） | `<form action="https://api.web3forms.com/submit" method="POST">` + 隐藏 `access_key` | 走 Cloudflare，大陆一般可开，偶发慢 | 不需要（提交目标是它的域名） | **首选**：零代码、够一个社团纳新用一整年 |
| **Formspree** | **Free 档 50 次/月**（pricing 页表格原文 `Monthly Submissions` = `50`）；只在面板保留最近 30 天 | POST 到 formspree endpoint | 一般 | 不需要 | 50 次太少，纳新季一天就爆，除非上付费档 |
| **Cloudflare Workers + D1** | D1 Free：**行读 500 万/日、行写 10 万/日、存储 5GB**（官方 pricing 原文） | 写 30 行 Worker 收 POST → `INSERT`；前端 `fetch` | `*.workers.dev` 大陆不稳；绑自有域名走 CF 代理好些 | 境外托管不需要 ICP | 想要「数据自己的」且不占本机资源时的正解，但要会写 Worker |
| **Supabase** | Free：**500MB DB、无限 API 请求、5 万 MAU**，**闲置 1 周自动暂停**（pricing 原文） | PostgREST 直插或 edge function | `*.supabase.co` 大陆经常被干扰 | 不需要 | 暂停机制对「一年只纳新两次」的社团是硬伤，不推荐 |
| **腾讯问卷** | 免费版可用（额度页为脚本渲染，本轮未取到明确数字，**待核**） | 后台建问卷 → 拿链接，iframe 或按钮外链 | 好 | 不需要（表单在 wj.qq.com） | **兜底方案**：微信里直接能填，最贴大一新生 |
| **飞书多维表格** | 免费版存在（`feishu.cn/service` 有免费版条目，具体表格行数限制**待核**） | 建表 → 开「表单」视图 → 分享链接/嵌入 | 好 | 不需要 | 好处是数据直接进表格、能多人协作审；坏处是要飞书账号 |
| 自建 `/api/signups`（jxauac 做法） | — | 需要一台常驻服务 | 取决于部署 | 境内要备案 | 本机不允许，排除 |

**备案这件事说清楚**：站点如果落在 124.221.145.182（境内），域名必须已备案并在该主体下接入，否则 80/443 会被拦；报名表提交到 Web3Forms/腾讯问卷这类第三方域名，不增加备案负担。

---

## 六、为什么不选 Nextra / Nuxt Content / Payload / Strapi / Directus

不是能力问题，是**本机约束**问题：这四类都要「Node 进程 + 数据库」或「每次改内容重建 SSR 产物」。同机 50+ 站点、3.6G 内存、根盘 82%，再加一个 Node 常驻（Strapi 起步 300–500MB）会直接把邻近站点拖慢；而且学生维护者一旦升级失败，整站 502。它们真正适合的是「有独立机器 + 有人值班」的场景。

Nuxt Content 的静态模式（`nuxt generate`）技术上成立，但产物是 hydration 后的 Vue 页面，首屏 JS 比 Astro 的零 JS 重，且构建内存 1.5G 起——在本机不 build、只在本机出制品这条线上，它比 Astro/Hugo 多花 3–5 倍构建时间和内存。为八个静态栏目付这个代价不值。

---

## 七、落地建议（3 条硬建议）

1. **栏目直接照 jxauac.cn 的七个路径建**：`/news /activities /projects /resources /members /about /join`，Astro Content Collections 一个栏目一个 collection，发一篇 = 在 `src/content/news/` 丢一个 md（frontmatter 只有 title/date/summary/cover 四个字段），大一新生 5 分钟能学会。
2. **构建只在本机/CI**：`pnpm build` 出 `dist/` → `rsync` 到服务器 → nginx `root` 指过去。服务器上永远不装 Node 依赖、不跑构建。
3. **报名表先上 Web3Forms**（250/月够用），纳新季如果怕被墙/被刷，同时挂一个腾讯问卷按钮做 A/B 兜底；不要为了一张报名表在本机起服务。

**成本合计（AstroWind 路线）**：骨架裁剪 1 人日 + 四个新栏目 2 人日 + 中文 i18n 0.5 人日 + 视觉调色/移动端 1.5 人日 + 报名表 0.5 人日 + 部署脚本 0.5 人日 ≈ **6 人日**（不含内容录入）。
**Hugo Blox 路线**：blocks 拼装 1.5 人日 + 中文 1 人日 + 视觉 1 人日 + 报名表 0.5 人日 ≈ **4 人日**，代价是版式自由度低。
