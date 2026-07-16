# 当前工作区拆分与提交计划（2026-07-15）

> 目的：把本轮跨前台、后台、数据、地图、研究与发布治理的大批改动拆成可审查、可回退、可独立验证的提交。
> 当前只形成拆分基线，不自动暂存或提交用户现有改动。

## 1. 当前基线

- 2026-07-15 审查时，`git status --short` 共 106 条状态记录：89 条已跟踪变更、17 条未跟踪路径记录。
- 完整 `pnpm check` 已通过，包含测试、类型检查、生产构建和 PWA 构建验证。
- 空数据库已完成迁移、管理员初始化、公开目录与办事流程播种、高德草稿导入、数据一致性检查。
- 18 张社交平台视觉重构图和旧学校 Logo 副本已从公开目录撤下；维护者后续指定的根目录 `logo.png` 已作为字节一致的站点 Logo 使用，并于 2026-07-16 要求恢复官网校园平面图的已核验原图与热点。两项正式发布授权仍需单独确认。
- 原始社交平台 WebP 与重构 PNG 仅本地保存并由 `.gitignore` 排除，不能进入公开仓库；仓库仅保留来源、权利状态和文件索引。

## 2. 建议提交顺序

每组都应在前一组通过相应检查后再继续。实际暂存时先用 `git diff -- <路径>` 逐文件复核，不使用一次性 `git add .`。

### A. 数据契约、公开内容与办事流程

建议提交说明：`feat(content): complete public catalog and procedure contracts`

主要范围：

- `shared/types.ts`、`shared/types/server.ts`
- `data/seeds/public-content.ts`、`data/seeds/procedures.ts`
- 公开目录播种、同步与一致性校验脚本
- `server/modules/places/service.ts`
- 后台目录/流程维护组件和页面
- 公开目录相关 composable、详情页及对应测试

边界：不包含地图 provider、研究媒体文件、PWA 配置和纯视觉首页改版。

验证：公开目录播种测试、流程播种测试、前后台数据一致性测试、管理员维护流程测试、实时数据一致性测试。

### B. 高德工作地图草稿与坐标核验工作流

建议提交说明：`feat(map): add owner-draft review and coordinate sync workflow`

主要范围：

- `map/core/`、`map/providers/amap/`、`map/providers/maplibre/`
- `app/pages/map/index.vue` 中的草稿预览和核验交互
- `server/api/public/amap-owner-drafts.get.ts`
- `data/seeds/amap-imported-places.ts`、`data/seeds/preview-places.ts`
- `scripts/import-amap-coordinates.ts`
- `scripts/sync-amap-owner-coordinates.ts` 及地图/同步测试
- `data/seeds/place-source-links.ts`、`scripts/sync-place-source-links.ts` 及测试
- 地图数据就绪与精度审计文档

边界：高德草稿只用于核验，不得在本组内把草稿批量提升为 `verified` 主坐标。

验证：高德 provider 测试、周边候选测试、坐标同步测试、地图就绪检查、数据库完整性检查。

### C. 前台信息架构、首屏与来源透明度

建议提交说明：`feat(web): refine public discovery and source transparency`

主要范围：

- `app/components/IntroOverlay.vue`、`app/components/public/`
- `app/assets/css/main.css`、`app/layouts/default.vue`
- 首页、搜索、附近、院系、社团、指南、地点、来源等公开页面
- `app/utils/public-catalog.ts`
- 首屏、公开路由完整性和公开目录展示测试

边界：若同一页面同时包含 A/B 组的必要数据契约调整，应把最小契约改动留在 A/B，本组只保留展示与交互部分；必要时使用交互式暂存拆分单文件 diff。

验证：首屏测试、公开路由完整性测试、公开目录测试、类型检查和手机宽度手工冒烟。

### D. 公开媒体授权与品牌边界

建议提交说明：`fix(media): remove unlicensed public assets and enforce policy`

主要范围：

- 19 个 `public/images/` 已跟踪文件删除
- `app/components/map/OfficialCampusPlan.vue`
- `data/seeds/official-campus-plan-reference.ts`
- `app/pages/research/xiaohongshu-images.vue`、`app/pages/discover.vue`
- 布局中撤下旧 Logo、接入维护者指定站点 Logo 并保留非官方语义的修改
- `.gitignore`
- `scripts/public-media-policy.test.ts`、`scripts/xiaohongshu-images.test.ts`、校园平面图相关测试
- `docs/PUBLIC_MEDIA_AUDIT_2026-07-15.md` 及关联研究文档

禁止加入：

- `data/imports/xiaohongshu-assets/*.webp`
- `data/generated/xiaohongshu-recreations-2026-07-15/*.png`
- `data/imports/private/` 中的学校 Logo 或其他未授权文件

验证：媒体策略测试、研究页面测试、校园平面图精确字节/热点测试；构建后确认社交衍生图和旧学校 Logo 仍不进入 `.output/`，并确认平面图只在对应视图按需请求。

### E. 工程门禁、发布命令与文档基线

建议提交说明：`chore(release): harden validation and document the baseline`

主要范围：

- `package.json`
- `scripts/verify-live-data-parity.ts` 及测试
- `scripts/README.md`
- 根 `README.md`、部署、架构、路线图和系统优化计划
- 本拆分计划

边界：不把未经实际演练的监控、备份恢复或生产能力写成已完成。

验证：`pnpm install --frozen-lockfile`、`pnpm data:verify:local`、`pnpm check`，以及从空数据库重建的完整演练。

### F. 研究事实增量（可单独审查）

建议提交说明：`docs(research): record the 2026 source audit increment`

主要范围：

- `data/imports/web-research-increment-2026-07-15.json`
- `docs/RESEARCH_INCREMENT_2026-07-15.md`
- `docs/RESEARCH_AUDIT_2026-07-15.md`
- `docs/RESEARCH_SOURCES.md`

提交前要求：JSON 只能包含公开事实、URL、抓取时间和核验状态，不得包含 Cookie、token、个人信息、平台原始图片或未授权正文复制。

## 3. 单文件跨组处理

以下文件天然跨越多个职责，不能只凭路径整文件暂存：

| 文件 | 可能跨越 | 处理方式 |
| --- | --- | --- |
| `app/pages/map/index.vue` | B、C、D | 先拆草稿/坐标逻辑，再拆展示，最后拆平面图授权文案 |
| `app/layouts/default.vue` | C、D | 导航和首屏体验归 C；旧 Logo 撤下、维护者指定站点 Logo 接入与非官方语义归 D |
| `app/utils/public-catalog.ts` | A、C、D | 数据契约归 A；展示适配归 C；媒体说明归 D |
| `README.md`、`docs/README.md`、`docs/ROADMAP.md` | D、E、F | 各功能提交只更新直接相关状态，最终由 E 收口统计和命令 |
| `scripts/campus-map-reference.test.ts` | B、D | 坐标/目录契约归 B；禁止公开原图的断言归 D |

建议通过 IDE 分块暂存或 `git add -p` 处理；每完成一组立即查看 `git diff --cached --check` 和 `git diff --cached --stat`。

## 4. 合并前门禁

- 每一组提交都能说明用户价值、数据影响、回退方式和对应测试。
- 任何测试不得依赖 `.gitignore` 排除的本地文件。
- 数据播种和同步必须可重复执行，不产生重复记录或悄悄覆盖人工核验状态。
- 公开页面不得把高德草稿、研究线索或过期信息描述为已核验事实。
- 公开构建不得包含社交平台研究图片或已撤下的学校官方 Logo 副本；维护者指定站点 Logo 与恢复的官网校园平面图在形成发布基线前必须补齐授权记录，否则改回权利清晰的项目自有标识/官网外链。
- 最终完整运行 `pnpm check`，并记录 Node/pnpm 版本、数据库快照和 commit SHA。

## 5. 下一步

1. 按 A → B → C → D → E → F 的顺序逐组复核差异。
2. 对跨组文件使用分块暂存，避免一个提交同时混入数据契约、视觉改版和媒体治理。
3. 每组通过检查后再提交；全部提交完成后重新从空数据库演练。
4. 基线稳定后进入 P0 地点现场双重核验和 2026 时效信息补齐。
