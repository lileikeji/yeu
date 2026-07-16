# 仰恩新生指南

面向仰恩大学本科与专升本新生的非官方校园信息服务。项目由个人/学生团队维护，首版以校园地图为核心，逐步覆盖报到、宿舍与教学楼、校园卡与网络、快递外卖、周边生活及社团招新。

> 当前阶段：V0.3 地图、内容与办事流程 Alpha。公开地图已接入 OSM 三片候选校界、学校官网校园平面图及 47 项编号热点，以及用户授权高德工作地图响应中的 76 个原始标点和 8 个不规则区域。高德模式直接按原始 GCJ-02 坐标展示这些标点，仍标记为“入口细节需现场确认”的草稿层；后台正式发布继续要求 WGS84 入口坐标、入口角色与独立双重核验。首批结构化流程已覆盖 2026 级报到、校园网与统一认证、宿舍报修、图书馆借阅证/微信绑定和专升本档案邮寄；未取得当年来源的个人时段、材料、点位、接站和招新安排保持“待通知”。

## 产品原则

- 移动端优先，同时适配 PWA 和微信内置浏览器。
- 游客无需登录；学生账号与 AI 检索不进入首版。
- 所有重要信息记录来源、核验状态与最后核验时间。
- 官方来源优先，非官方内容明确标识，允许用户提交纠错。
- 商家认领、优惠与推广只预留数据边界，首版不开放。

## 技术基线

- Nuxt 4、Vue 3、TypeScript、Nuxt UI
- Nuxt Server Routes 作为同仓 API
- Drizzle ORM + SQLite，包含迁移、初始化、健康检查和单管理员会话
- MapLibre/OSM 作为无 Key 开发预览；生产可切换高德 JS API 2.0，已核验 WGS84 只在显示层通过官方接口转为 GCJ-02
- 原创分类定位牌、数字聚合、当前视野高德原生 POI 临时搜索、列表/地图/官网平面图 47 项热点联动与响应式详情面板
- Web App Manifest、应用图标、Service Worker 与断网说明页；只预缓存说明页所需 CSS/图标/字体，不预缓存 JS，公开导航和内容 API 在 V1 保持 `NetworkOnly`
- 宝塔 Linux、Node.js、PM2、Nginx

## 本地启动

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:init
pnpm dev
```

PowerShell 下可使用 `Copy-Item .env.example .env`。首次执行 `db:init` 前，应在 `.env` 中设置随机的 `NUXT_ADMIN_SESSION_SECRET` 和管理员密码；生产环境不要使用示例值。

`db:*`、`amap:drafts`、`amap:coordinates`、`map:owner:sync`、`map:sources:sync`、`feedback:cleanup` 等 TypeScript 维护脚本和 Drizzle 配置会读取项目根目录下可选的 `.env`；Shell 中已经设置的变量优先，不会被文件覆盖。需要为单次维护命令选择其他文件时，可先设置 `NUXT_ENV_FILE`（相对路径按当前工作目录解析）。该变量只供这些维护脚本使用，不会替 Nuxt 构建、Nitro 或 PM2 注入环境变量。

公开指南与部门目录默认仍可使用 `data/seeds/public-content.ts` 的静态回退。需要把首批公开目录纳入后台维护时，先只读预检，再明确应用：

```bash
pnpm db:seed:catalog
pnpm db:seed:catalog --apply
```

目录入库是可选步骤，不会由 `db:init` 自动执行。脚本只管理带自身标记的记录；来源 URL 或内容 `kind + slug` 与人工记录冲突时整批停止，不覆盖后台数据。

目录就绪后，可先只读预检再导入首批结构化流程：

```bash
pnpm db:seed:procedures
pnpm db:seed:procedures --apply
```

流程种子当前维护 5 条高频新生事项：2026 级报到、校园网与统一认证、宿舍维修报修、图书馆借阅证/微信绑定、专升本学生档案邮寄。脚本只维护带 `public-procedure-seed` 所有权标记的记录；人工维护的同名流程会使操作整批停止。

地点草稿和公开目录都已进入数据库后，可把逐项审查过的官网证据关联到匹配地点：

```bash
pnpm map:sources:sync --database .data/codex-map-content-20260713.sqlite
pnpm map:sources:sync --apply --database .data/codex-map-content-20260713.sqlite
```

当前映射生成 34 条关系、覆盖 26 个地点。它只证明映射文件写明的名称、教学区或当前使用事实，不会把地点坐标标为已核验，也不会发布地点。

完整检查：

```bash
pnpm check
```

生产构建的桌面/移动 Chromium 核心路径检查：

```bash
# 首次安装或 Playwright 升级后执行一次
pnpm e2e:install

# Linux CI 需要同时安装浏览器系统依赖时改用
pnpm e2e:install:ci

# 完整工程门禁、生产构建和 34 条浏览器检查
pnpm check:e2e
```

`pnpm e2e` 会先生成最新生产构建，再重建 Git 忽略的独立 `.data/e2e.sqlite`，通过正式服务生成受控已发布地点、两个并发隔离的内容草稿和专用测试管理员，不会读取生产库。`pnpm e2e:run` 仅用于已经由 `pnpm check` 或 `pnpm build` 生成最新 `.output` 的场景。当前 17 个场景在桌面 Chromium 与 Pixel 5 移动视口各执行一次，共 34 条检查：除公开搜索、地点详情、地图返回、流程材料/来源/键盘进度与三类故障降级外，还覆盖管理员发布闭环、反馈处理、PWA 注册/更新提示，以及首页、搜索、地图、流程、反馈和后台登录的 Axe 严重级无障碍扫描；不替代 iOS Safari、微信内置浏览器、真机定位、实际 PWA 安装和生产高德 Key 验收。

验收当前本机 SQLite 中“前台公开内容”和“后台可维护数据”是否分叉：

```bash
pnpm data:verify:local
```

该命令只读检查 `.data/codex-map-content-20260713.sqlite`，核对 98 条来源、58 条公开内容、5 条流程、23 个流程步骤和 76 个高德草稿标点。需要同时验收管理员账号时，使用 `pnpm data:verify --database .data/codex-map-content-20260713.sqlite --admin-user <username> --admin-password <password>`；输出只显示密码是否验证通过，不输出哈希。

开发站点默认地址为 <http://127.0.0.1:3000/>。公开端核心路由包括 `/map`、`/procedures`、`/guides`、`/departments`、`/clubs`、`/nearby`、`/discover`、`/search`、`/sources`、`/feedback`、`/about` 和 `/privacy`；管理后台为 `/admin`，结构化流程编辑入口为 `/admin/procedures`。

## 目录

```text
app/                 Nuxt 前台与管理后台页面
  features/          按地图、指南、办事、组织等业务域组织
server/              API、数据库访问与服务端业务模块
shared/              前后端共享类型、校验规则和常量
map/                 地图供应商无关接口与 provider 适配器
data/                本地数据库、导入模板与数据说明
docs/                PRD、架构、数据模型、治理和部署文档
scripts/             初始化、导入、校验和运维脚本
tests/               单元、集成与端到端测试
public/              公共静态资源与 PWA 资源
```

高德工作地图的可复现导入脚本位于 `scripts/import-amap-workmap.py`，字段审计产物位于 `data/imports/`；`pnpm map:wia:extract` 可从用户授权的高德 `sparseList` 响应生成最小化 GCJ-02 坐标证据，响应原文、Cookie 和登录信息不进入仓库。人工审核后的 WGS84 子批次仍通过默认只读的 `pnpm amap:coordinates` 生成待审核观测，不直接修改地点坐标。OSM 校界派生数据可用 `pnpm map:boundary:sync` 复核更新。按维护者当前要求，学校官网校园平面图的已核验原图快照与 47 项图片相对热点恢复到地图页；页面保留官网来源，并明确它没有地理控制点、不能作为楼栋入口或导航坐标证据。正式公开授权仍须在发布前单独确认。原始 Excel、高德响应原文、第三方地图瓦片、第三方截图和登录信息仍不提交到仓库。

## 文档导航

完整阅读顺序与文档状态见 [文档索引](docs/README.md)。常用入口：

- [产品需求文档](docs/PRD.md)：用户、范围、验收标准和后续边界。
- [地图交互规范](docs/MAP_INTERACTION_SPEC.md) 与 [地图数据就绪台账](docs/MAP_DATA_READINESS.md)：地图行为、76 个地点的采集批次和发布阻断状态。
- [首批数据源与核验清单](docs/RESEARCH_SOURCES.md) 与 [内容治理政策](docs/CONTENT_POLICY.md)：资料来源、时效、版权和发布门槛。
- [现场坐标采集与审核](docs/FIELD_COORDINATE_VERIFICATION.md) 与 [单管理员运行手册](docs/ADMIN_RUNBOOK.md)：采点、审核、纠错、紧急下架和凭据轮换。
- [技术架构](docs/ARCHITECTURE.md) 与 [宝塔 Linux 部署](docs/DEPLOYMENT.md)：运行边界、环境变量、发布、备份和恢复。

## 名称与声明

“仰恩新生指南”是当前工作名称。本项目现阶段不是仰恩大学官方网站，内容不能替代学校正式通知；涉及报到、缴费、学籍、安全等事项时，以学校最新通知为准。
