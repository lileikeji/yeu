# 仰恩新生指南

面向仰恩大学本科与专升本新生的非官方校园信息服务。项目由个人/学生团队维护，首版以校园地图为核心，逐步覆盖报到、宿舍与教学楼、校园卡与网络、快递外卖、周边生活及社团招新。

> 当前阶段：V0.3 地图、内容与办事流程 Alpha。公开地图已接入 OSM 三片候选校界和学校官网平面图 47 项文字索引；代码中不再使用人工分布的近似楼栋坐标。高德工作地图的 76 个标记点和 8 个区域已完成字段审计并作为后台草稿导入，但导出文件不含经纬度，完成独立人工核验前不会生成导航标点。2026 级报到已按步骤建模，个人时段、材料、点位与接站安排在取得当年来源前保持“待通知”。

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
- 原创分类图钉、数字聚合、搜索筛选、列表/地图联动与响应式详情面板
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

`db:*`、`amap:drafts`、`amap:coordinates`、`feedback:cleanup` 等 TypeScript 维护脚本和 Drizzle 配置会读取项目根目录下可选的 `.env`；Shell 中已经设置的变量优先，不会被文件覆盖。需要为单次维护命令选择其他文件时，可先设置 `NUXT_ENV_FILE`（相对路径按当前工作目录解析）。该变量只供这些维护脚本使用，不会替 Nuxt 构建、Nitro 或 PM2 注入环境变量。

公开指南与部门目录默认仍可使用 `data/seeds/public-content.ts` 的静态回退。需要把首批公开目录纳入后台维护时，先只读预检，再明确应用：

```bash
pnpm db:seed:catalog
pnpm db:seed:catalog -- --apply
```

目录入库是可选步骤，不会由 `db:init` 自动执行。脚本只管理带自身标记的记录；来源 URL 或内容 `kind + slug` 与人工记录冲突时整批停止，不覆盖后台数据。

目录就绪后，可先只读预检再导入结构化报到流程：

```bash
pnpm db:seed:procedures
pnpm db:seed:procedures -- --apply
```

流程种子只维护带 `public-procedure-seed` 所有权标记的记录；人工维护的同名流程会使操作整批停止。

完整检查：

```bash
pnpm check
```

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

高德工作地图的可复现导入脚本位于 `scripts/import-amap-workmap.py`，字段审计产物位于 `data/imports/`；人工审核后的 WGS84 子批次通过默认只读的 `pnpm amap:coordinates` 生成待审核观测，不直接修改地点坐标。OSM 校界派生数据可用 `pnpm map:boundary:sync` 复核更新。仓库仅缓存学校官网校园平面图 `public/images/yeu-campus-plan-2025.jpg`：它由官网来源 URL、8504×3898 尺寸、1,250,742 字节和 SHA-256 `30f50d50492335b0aa8859cb435b17f8b76c9bceebdb81d5b360139de4d7335d` 锁定，只作非导航的相对位置参考；缓存不代表已取得再利用授权，也不能作为经纬度、楼栋入口或通行状态证据。原始 Excel、第三方地图瓦片、第三方截图和登录信息仍不提交到仓库。

## 文档导航

完整阅读顺序与文档状态见 [文档索引](docs/README.md)。常用入口：

- [产品需求文档](docs/PRD.md)：用户、范围、验收标准和后续边界。
- [地图交互规范](docs/MAP_INTERACTION_SPEC.md) 与 [地图数据就绪台账](docs/MAP_DATA_READINESS.md)：地图行为、76 个地点的采集批次和发布阻断状态。
- [首批数据源与核验清单](docs/RESEARCH_SOURCES.md) 与 [内容治理政策](docs/CONTENT_POLICY.md)：资料来源、时效、版权和发布门槛。
- [现场坐标采集与审核](docs/FIELD_COORDINATE_VERIFICATION.md) 与 [单管理员运行手册](docs/ADMIN_RUNBOOK.md)：采点、审核、纠错、紧急下架和凭据轮换。
- [技术架构](docs/ARCHITECTURE.md) 与 [宝塔 Linux 部署](docs/DEPLOYMENT.md)：运行边界、环境变量、发布、备份和恢复。

## 名称与声明

“仰恩新生指南”是当前工作名称。本项目现阶段不是仰恩大学官方网站，内容不能替代学校正式通知；涉及报到、缴费、学籍、安全等事项时，以学校最新通知为准。
