# 系统完善路线（2026-07-17 续）

> 本文承接 `SYSTEM_OPTIMIZATION_PLAN_2026-07-15.md`，记录 Stage 66–69 薄壳拆分收口后的**可优化点、下一步动作与验收标准**。  
> 不替代 PRD / ROADMAP / 部署手册；任何“已完成”必须以实测记录为准。

## 1. 当前状态快照

| 维度 | 状态 | 说明 |
| --- | --- | --- |
| 工程门禁 | Stage 66–69 全绿（§2.76 `FINAL_EXIT=0`，见 `.data/stage69_check.log`） | 等价 `pnpm check`：eslint + typecheck + scripts-test + build + bundle-budget + pwa |
| 管理后台薄壳拆分 | 边际收益已显著下降 | 目录/表单/现场采点/坐标拾点等纯决策已下沉到 `app/utils/*-presentation.ts` |
| 首页左上角 Logo | 已接好 | 根目录 `logo.png` 与 `public/icons/site-logo.png` 一致；`app/layouts/default.vue` 使用 `/icons/site-logo.png` |
| 官网校园平面图 | **未删除，仍可用** | 资源 `public/images/yeu-campus-plan-2025.jpg`；组件 `OfficialCampusPlan.vue`；地图页「平面图」切换仍在 |
| 产品核心短板 | 仍是数据可信与真实设备验收，不是再拆组件 | P0 坐标双核验、2026 时效信息、真机/微信/弱网、运维闭环 |

## 2. 还剩哪些可优化（按 ROI）

### P0 — 发布前必须

1. **地点坐标可信度**
   - 对核心报到点、宿舍、食堂、校门、班车点执行双人/双源核验（现场 + 独立证据）。
   - 禁止把平面图文字编号或未核验 GCJ-02 草图当正式发布坐标。
   - 验收：`FIELD_COORDINATE_VERIFICATION.md` / `MAP_DATA_READINESS.md` 中 P0 清单全部有证据与日期。

2. **2026 当年信息**
   - 报到流程、宿舍安排、班车、校园网、关键联系方式的时效复核。
   - 验收：公开流程页与后台发布记录一致，过期条目已下架或标注年份。

3. **版本收口**
   - 工作区改动按职责拆分审查后打 `v0.3-alpha`（用户明确要求后再打标签）。
   - 验收：`pnpm check` 全绿、迁移演练记录、验收库统计写回路线图。

### P1 — 真实使用路径

4. **真机 / 微信 / 弱网 / PWA**
   - 首页、搜索、地图、平面图切换、地点详情、办事流程、安装提示在真机与微信内置浏览器验证。
   - 验收：无阻断级白屏、定位权限文案正确、离线/弱网有可理解降级。

5. **性能与可访问性**
   - Lighthouse（移动）、主要路由 TTI、地图首屏、PWA 可安装性、基础 a11y（焦点、对比度、`aria-label`）。
   - 验收：关键路径分数与已知问题清单入库，不设虚假满分目标。

6. **安全响应头与 CSP**
   - 在不破坏地图/字体/图标的前提下收紧 CSP、Cookie、Referrer、Permissions-Policy。
   - 验收：浏览器/自动化检查通过，开发与生产差异写明。

### P2 — 运维闭环

7. **监控告警**
   - 生产 PM2 日志路径、轮转、健康检查、磁盘、5xx、备份失败 webhook。
   - 验收：受控故障注入能通知维护者，并可用请求 ID 串到日志。

8. **备份 / 恢复 / 回滚**
   - 每日备份 + 异机加密副本 + 季度恢复演练 + 旧 release 回滚一次。
   - 验收：`DEPLOYMENT.md` 留下日期、耗时、恢复点、数据损失窗口。

### 工程侧 — 低优先级（除非有明确体积/缺陷）

9. **停止继续“为拆而拆”**
   - `IntroOverlay.vue` 等剩余大块多为 canvas/rAF 副作用，纯函数 ROI 很低。
   - 仅在出现具体 bug、难测分支或体积违规时再抽。

10. **E2E 覆盖扩展**
    - 现有 Playwright 冒烟保留；补平面图切换、后台登录后写操作关键路径（若密钥/环境允许）。

## 3. 建议执行顺序（接下来怎么做）

```text
1. ~~确认 Stage 69 FINAL_EXIT=0，填齐 VERIFICATION_RECORD §2.76~~（已完成）
2. 冻结范围：不再扩功能面；只修阻断与数据可信
3. P0 坐标与 2026 信息核验（人肉 + 文档证据）
4. 真机/微信/弱网一轮，修阻断
5. 备份告警与恢复演练
6. 用户明确要求后再打 v0.3-alpha / 内测包
7. 内测反馈收敛后才考虑 V1.0 公开
```

## 4. 暂缓（再次强调）

- 学生账号 / 跨设备同步  
- AI 问答与自动结论  
- 商家认领与推广  
- 复杂多角色审批  

这些不能替代“信息是否准确、到现场能否找到、出错后能否恢复”。

## 5. 资产确认（Logo / 平面图）

| 资产 | 路径 | 接线 |
| --- | --- | --- |
| Logo 源文件 | `E:/yeu/logo.png` | 同步到 `public/icons/site-logo.png` |
| 布局引用 | `app/layouts/default.vue` | `src="/icons/site-logo.png"` |
| 平面图图片 | `public/images/yeu-campus-plan-2025.jpg` | `officialCampusPlanReference.localAssetUrl` |
| 平面图组件 | `app/components/map/OfficialCampusPlan.vue` | 地图页 `MapOfficialCampusPlan` +「平面图」切换 |

若线上仍看不到平面图，优先排查：构建产物是否包含 `public/images/`、浏览器缓存、以及 `canShowOfficialCampusPlan(activeScope)` 是否因当前范围关闭。

## 6. 文档维护规则

- 门禁结果写入 `VERIFICATION_RECORD_2026-07-15.md`，附 log 路径与耗时。  
- 任务勾选与 `ROADMAP.md` / `MAP_DATA_READINESS.md` / `DEPLOYMENT.md` 同步。  
- 未演练项不得标完成。  
- 中文文档一律 UTF-8 写入，避免 PowerShell 默认编码破坏。

## 7. 本轮结论

系统工程骨架与后台可测试边界已足够支撑 Alpha；**下一步主战场从“继续拆 Vue 组件”转为“数据核验 + 真机验收 + 运维闭环”**。  
Logo 与平面图在仓库内均已就绪；平面图并非被删除。

---

## 8. 生产修复续记（2026-07-17 晚）

详见 **[PROD_FIX_AND_NEXT_2026-07-17.md](./PROD_FIX_AND_NEXT_2026-07-17.md)**。

摘要：Logo 与平面图生产均在；76 地点草稿未发布属策略；SEO 源站 131 URL 正确，公网规范路径仍被 EdgeOne 旧缓存；请用 `/seo/live/sitemap.xml` 与 `/seo/live/robots.txt`，并在控制台刷新 `/sitemap.xml`、`/robots.txt`。


## CDN 刷新（2026-07-17 续）

三方 SpeedOnline 已用 Access Token 提交 clean_url 任务 **2680**。公开 /sitemap.xml 已为 **131** URL，/robots.txt 已含 Sitemap 行。详见 PROD_FIX_AND_NEXT_2026-07-17.md 第 3 节。
## 地点公开状态（2026-07-17）

- **76 个地点已全部 published**（用户指令「全部公开」）。
- 依据：业主高德工作地图导入 WGS84 + C 级来源；**非**现场双人核验。
- 详见 `PROD_FIX_AND_NEXT_2026-07-17.md` §3。
- 后续质量：入口/楼层/开放时间现场复核；摘要文案去「草稿」措辞；补官方 A/B 来源链接。