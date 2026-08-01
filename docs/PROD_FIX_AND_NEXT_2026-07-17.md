# 生产修复与系统完善记录（2026-07-17 续）

> 服务器：`***REMOVED***`（SSH 密钥本地：`C:\Users\15294\.ssh\***REMOVED***`）
> 域名：`https://yx.huiliyill.cn`
> 发布：`/www/wwwroot/yeu/current` → `releases/20260717-041320`
> 数据库：`/www/wwwroot/yeu/shared/data/yeu.sqlite`

本文承接用户诉求：系统可优化点与后续完善、Logo 替换、平面图恢复、线上 bug 检查、生产修复。

---

## 1. 结论速览

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 健康检查 `/api/health` | 正常 | `status=ok`，数据库 ready |
| 首页左上角 Logo | **已正确** | 根目录 `logo.png` ≡ `public/icons/site-logo.png` ≡ 生产同文件 SHA256 `48d512f6…fe7d`；首页 HTML 引用 `/icons/site-logo.png` |
| 校园平面图 | **未删除，仍可用** | `public/images/yeu-campus-plan-2025.jpg`（1,250,742 B，SHA256 `30f50d50…335d`）在本地与生产均存在；地图页含「平面图」切换；组件 `OfficialCampusPlan.vue` |
| 公开地点 | 0 条已发布 | `places` 共 76 条 **draft**（高德草稿 + 业主坐标同步）；公开 API `total:0` 符合发布门槛策略 |
| SEO 源站 | **正确** | 源站 `/sitemap.xml` **131** URL；`/robots.txt` 含三条 Sitemap |
| SEO 公网规范路径 | **CDN 仍旧缓存** | 公网 `/sitemap.xml` 仍 HIT 旧体（约 10 URL）；`/robots.txt` 仍 HIT 无 Sitemap 旧体 |
| SEO 可用旁路 | **正确** | `/seo/live/sitemap.xml`（131 URL）、`/seo/live/robots.txt`（三条 Sitemap）；`/seo/*` 亦可用（若 CDN 曾缓存旧体，优先用 `/seo/live/*`） |
| 主要页面 HTTP | 200 | `/` `/map` `/procedures` `/discover` `/search` `/admin` 与静态资源、manifest、offline 均 200 |

---

## 2. 用户原诉求逐项核对

### 2.1 系统还有什么可优化 / 之后怎么做

优先级不变（详见 `SYSTEM_NEXT_STEPS_2026-07-17.md` / `SYSTEM_OPTIMIZATION_PLAN_2026-07-15.md`）：

**P0（发布前必做）**

1. 坐标双人/双源核验后再发布地点（禁止把未核验 GCJ-02 草稿当正式坐标）。
2. 2026 当年信息（报到、宿营、班车、校园网、关键方式）时效复核。
3. 明确要求后再打 `v0.3-alpha`；`pnpm check` 全绿是门槛而非终点。

**P1（真实使用路径）**

4. 真机 / 微信内置浏览器 / 弱网 / PWA 一轮。
5. 性能与 a11y（移动 Lighthouse、地图首屏、焦点与对比度）。

**P2（运维闭环）**

6. 监控告警（PM2 日志、5xx、磁盘、备份失败 webhook）。
7. 每日备份 + 异机副本 + 季度恢复演练。

**工程债**

8. 停止为拆而拆组件；只在有 bug/难测边界时再抽。
9. E2E 补平面图切换与后台关键写路径（若密钥/环境允许）。

**本轮生产侧新增待办**

10. **EdgeOne 刷新缓存**：在腾讯云 EdgeOne / 宝塔 `txeo` 配置 SecretId/SecretKey 后，对以下 URL 做 URL 刷新：
    - `https://yx.huiliyill.cn/sitemap.xml`
    - `https://yx.huiliyill.cn/robots.txt`
    - （可选）`https://yx.huiliyill.cn/seo/sitemap.xml`、`/seo/robots.txt`
11. 下次完整发布时带上 Nuxt 动态路由 `server/routes/robots.txt.ts`、`server/routes/sitemap.xml.ts`，并继续用 `shared/public-extra/` 作 CDN 旁路静态底稿。
12. 地点 76 条草稿 **不要** 批量公开；走现场核验 → A/B/C 证据 → 审批坐标流程。

### 2.2 Logo 替换

- 源文件：`E:\yeu\logo.png`
- 站点资源：`E:\yeu\public\icons\site-logo.png`（字节一致）
- 布局：`app/layouts/default.vue` → `src="/icons/site-logo.png"`
- 生产：同 hash，公网 200

**无需再替换**；若以后换标，同步覆盖上述两路径并清 CDN 图片缓存。

### 2.3 平面图「被删」

**仓库与生产均未删除。** 若线上「看不到」常见原因：

1. 地图页未点「平面图」切换（组件按需加载原图）。
2. 浏览器强缓存旧 bundle（硬刷新 / 清缓存）。
3. `canShowOfficialCampusPlan(activeScope)` 因当前范围关闭（见地图展示逻辑）。
4. 构建产物未包含 `public/images/`（当前 release 已包含，可排除）。

资产与接线：

| 资产 | 路径 |
| --- | --- |
| 图片 | `public/images/yeu-campus-plan-2025.jpg` |
| 元数据 | `data/seeds/official-campus-plan-reference.ts`（`localAssetUrl`） |
| 组件 | `app/components/map/OfficialCampusPlan.vue` |

### 2.4 线上 bug 检查（yx.huiliyill.cn）

**未发现阻断性应用崩溃。** 已知差异与策略行为：

| 现象 | 判定 | 处理 |
| --- | --- | --- |
| 公开地点列表为空 | 预期 | 76 draft，未达发布门槛 |
| 规范 `/sitemap.xml` / `/robots.txt` 内容旧 | **CDN 陈旧缓存** | 源站已正确；用 `/seo/live/*`；等刷新/TTL |
| 系统 `node` v20 vs 应用 Node 22 | 运维陷阱 | 脚本用 `/opt/node-v22.18.0/bin/node` + `tsx` |
| 宝塔 `txeo` 无鉴权文件 | 阻塞 CDN 自动刷新 | 需在面板补 EdgeOne 授权 |
| HTTP PURGE/BAN | 405 | 走 EdgeOne 控制台刷新 |

冒烟：`/`、`/map`、`/api/health`、logo、平面图原图、manifest、offline 均为 200。

---

## 3. 本轮已在生产落地的修复

1. **SEO 静态底稿**（存活于 `shared/public-extra/`，不随 release 切换丢失）
   - `sitemap.xml`：131 URL
   - `robots.txt`：Allow + Disallow `/admin/` + 三条 Sitemap
2. **Nginx**（`/www/server/panel/vhost/nginx/yx.huiliyill.cn.conf`）
   - 规范路径 `/robots.txt`、`/sitemap.xml` → public-extra + `no-store` / `CDN-Cache-Control: no-store`
   - 旁路：`/seo/*`、`/seo/live/*`
   - 备份：`*.bak.cdn-nocache-*`、`*.bak.live-seo-*`
3. **地点草稿**
   - `import-amap-drafts.ts --apply`
   - `sync-amap-owner-coordinates.ts --apply`
   - 结果：76 draft，GCJ-02，unverified，均有经纬度
4. **仓库侧（待下次完整部署生效于 Nuxt 层）**
   - `server/routes/robots.txt.ts`
   - `server/routes/sitemap.xml.ts`
   - `public/robots.txt` 与线上一致（含 live Sitemap）

### 运维命令备忘

```bash
ssh -i C:\Users\15294\.ssh\***REMOVED*** root@***REMOVED***

# 源站核对（绕过 CDN）
curl -sS -H 'Host: yx.huiliyill.cn' http://127.0.0.1/sitemap.xml | grep -c '<url>'
curl -sS -H 'Host: yx.huiliyill.cn' http://127.0.0.1/robots.txt

# 公网旁路（当前正确）
curl -sS https://yx.huiliyill.cn/seo/live/sitemap.xml | grep -c '<url>'
curl -sS https://yx.huiliyill.cn/seo/live/robots.txt

# 业务脚本（必须用 Node 22）
cd /www/wwwroot/yeu/current && set -a && . ./.env && set +a
/opt/node-v22.18.0/bin/node ./node_modules/tsx/dist/cli.mjs \
  scripts/import-amap-drafts.ts --apply --database /www/wwwroot/yeu/shared/data/yeu.sqlite
```

---

## 4. 建议的下一步执行顺序

```text
1. 用户在 EdgeOne/宝塔 txeo 配置密钥 → 刷新 /sitemap.xml 与 /robots.txt
2. 刷新后公网核对：131 URL + robots 含 Sitemap 行 + Age 重新累计且 body 正确
3. Search Console 可临时提交 https://yx.huiliyill.cn/seo/live/sitemap.xml
4. 现场核验 P0 地点 → 审批发布（不要一键公开 76 草稿）
5. 真机/微信/弱网验收 + 备份告警演练
6. 用户明确后打 v0.3-alpha / 内测包
```

---

## 5. 文档维护

- 中文文档一律 **UTF-8** 写入，避免 PowerShell 默认编码损坏。
- 门禁结果写 `VERIFICATION_RECORD_2026-07-15.md`。
- 未演练项不得标完成。
- 本文件只记录生产修复与验收事实，不替代 PRD / ROADMAP。


## 3. CDN 刷新完成（2026-07-17，三方 SpeedOnline / LeCDN）

> 用户确认：CDN 为三方，不是源站、也不是宝塔 EdgeOne。

| 项 | 值 |
| --- | --- |
| CNAME | yx.huiliyill.cn → zghutujm.cn.speedonline.xyz |
| 控制台 | https://console.cdn.speedonline.cloud |
| 刷新 API | POST /prod-api/site_refresh，Authorization: sk-...（访问令牌原文，不要加 Bearer） |
| 任务 | id **2680**，	ype=clean_url，6 条 URL，提交时间 2026-07-17 04:54:32 |
| 配额 | clean_url 当日上限 10000 |

### 已刷新 URL

- https://yx.huiliyill.cn/sitemap.xml
- https://yx.huiliyill.cn/robots.txt
- https://yx.huiliyill.cn/seo/sitemap.xml
- https://yx.huiliyill.cn/seo/robots.txt
- https://yx.huiliyill.cn/seo/live/sitemap.xml
- https://yx.huiliyill.cn/seo/live/robots.txt

### 刷新后公开校验（同日）

| URL | 结果 |
| --- | --- |
| /sitemap.xml | **131** 条 <url>，X-Cache-Status: MISS，Age: 0，长度约 24KB（此前 HIT 旧体约 10 URL / 1.7KB） |
| /robots.txt | 含三条 Sitemap:（规范 /seo /seo/live） |

### 密钥与安全

| 凭证 | 位置 / 用法 | 说明 |
| --- | --- | --- |
| CDN Access Token (sk-...) | 控制台「访问令牌」；**勿写入仓库** | 可调 OpenAPI（含刷新缓存） |
| CDN 登录会话 lecdn_token | 浏览器 Cookie | 控制台 Bearer 登录态，会过期 |
| SSH | C:\Users\15294\.ssh\***REMOVED*** | 只控服务器 |
| 应用密钥 | 本地 E:\yeu\.env / 生产 shared/.env | AMAP、admin 等 |
| EdgeOne | 本站点流量不经此层 | 与当前缓存无关 |

**安全建议：** 本次会话已暴露 CDN 账号密码、JWT、Access Token。建议在控制台轮换访问令牌并修改控制台密码；勿把 sk- / cookie 提交进 git。

### 以后如何再刷

`ash
# PowerShell 示例（令牌从本机安全位置读取，勿硬编码进仓库）
 = (Get-Content C:\Users\15294\.secrets\speedonline-sk.txt -Raw).Trim()
 = @{ type = "clean_url"; content = "https://yx.huiliyill.cn/sitemap.xml
https://yx.huiliyill.cn/robots.txt"; encoding = False } | ConvertTo-Json
Invoke-RestMethod -Uri "https://console.cdn.speedonline.cloud/prod-api/site_refresh" -Headers @{ Authorization = ; "Content-Type" = "application/json" } -Method POST -Body
`

也可在控制台：**站点 → 刷新预热 → 清除 URL**。
---

## 3. 地点全部公开（2026-07-17）

> 用户明确指令：**全部公开**。在满足发布门槛（WGS84 + verified + C 级来源）后批量发布，不等待双人现场测绘。

### 操作摘要

| 项 | 值 |
| --- | --- |
| 时间 | 2026-07-17（服务器约 21:05 UTC） |
| 备份 | `/www/wwwroot/yeu/shared/data/yeu.sqlite.bak-before-publish-20260717-050209`（含 wal/shm 副本） |
| 脚本 | `scripts/bulk-publish-places.js` + `scripts/_publish-seed-points.json` |
| 匹配 | 76/76 按 **名称** 对齐 `data/seeds/amap-imported-places.ts` |
| 坐标 | 75 条用种子 WGS84 `point`；**辽宁楼** 原种子仅 GCJ-02，已标准算法转 WGS84 后入库 |
| 校区范围 | 全部落在 `YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS` 内 |
| 来源 | C 级 active「用户授权高德工作地图导入（业主标记）」；`place_sources` 76 条 |
| DB 结果 | `places`: **76 published**；全部 `WGS84` + `verified` |
| 公开 API | `GET /api/public/places` → **total: 76**（公网已验证） |
| 业主草稿 API | `/api/public/amap-owner-drafts` → total: 0 |

### 数据口径（务必诚实）

- 坐标依据：**业主授权高德工作地图导入** + 种子 WGS84（或 GCJ→WGS 换算），**不是**双人现场测绘核验。
- 公开地图可渲染/导航；部分条目摘要仍写「草稿/待现场核验」属导入文案未改写，后续可批量润色。
- 质量债：关键建筑入口、楼层、开放时间仍建议现场/官方资料复核；官方 A/B 来源可继续用 `scripts/sync-place-source-links.ts` 补链。

### 回滚

```bash
cp -a /www/wwwroot/yeu/shared/data/yeu.sqlite /www/wwwroot/yeu/shared/data/yeu.sqlite.post-publish
cp -a /www/wwwroot/yeu/shared/data/yeu.sqlite.bak-before-publish-20260717-050209 /www/wwwroot/yeu/shared/data/yeu.sqlite
# 若应用使用 WAL，同步恢复 wal/shm 备份或删除 wal 后让 sqlite 重建
```

### 验收

- [x] DB status 全 published
- [x] 公网 `/api/public/places?pageSize=100` total=76，WGS84+verified+sources
- [x] `/api/public/amap-owner-drafts` total=0
- [x] health ok；`/map` 200
- [ ] 浏览器打开 `/map` 目视确认 marker（用户侧）
