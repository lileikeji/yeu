# 仰恩新生指南

面向仰恩大学本科与专升本新生的非官方校园信息服务：校园地图、新生指南、办事流程、社团纳新与 AI 检索问答。线上运行于 <https://yx.huiliyill.cn>，管理后台 `/admin`，微信小程序走 `/api/miniapp/v1/*` 只读接口。

> 当前阶段（2026-10）：前台 + 管理后台 + AI 检索助手（缓存版本 `rag-v79-hijack-fix`，8 轮检索质量修复）+ 小程序只读 API + 社团纳新（docx 报名表导出）均已上线。历次发布与回滚点见 [docs/DEPLOY_NOTES_2026-09-04-qa-cards.md](docs/DEPLOY_NOTES_2026-09-04-qa-cards.md)。

## 产品原则

- 移动端优先，同时适配 PWA 和微信内置浏览器。
- 游客无需登录；管理员入口隐藏，单管理员会话。
- 所有重要信息记录来源、核验状态与最后核验时间；未核验地点不公开。
- 官方来源优先，非官方内容明确标识，允许用户提交纠错。
- 安全层层设防：Origin guard、miniapp 限流、visitor ban、anti-crawl 规则不可为绕过 403/429 而削弱。

## 技术基线

- Nuxt 4、Vue 3、TypeScript、Nuxt UI；Nuxt Server Routes 作为同仓 API
- Drizzle ORM + SQLite（生产 `/www/wwwroot/yeu/shared/data/yeu.sqlite`），迁移、初始化、健康检查齐备
- AI 检索：向量索引（sqlite-vec）+ 网关 LLM，答案缓存两层（表 + 进程内存），改检索/算分逻辑必须 bump `ASSISTANT_CACHE_VERSION`（`server/modules/assistant/service.ts`）
- 地图：MapLibre/OSM 开发预览，生产高德 JS API 2.0；provider 抽象在 `map/`
- 部署：宝塔 Linux + **systemd `yeu.service`**（端口 3000，`EnvironmentFile=shared/.env`）+ Nginx；不是 PM2
- CI/CD：个人仓库 `lilei1529/yeu` 的 Gitee Go 流水线（`.workflow/`），push `master` 云端构建并自动部署（见下文「发布」）

## 本地启动

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:init
pnpm dev
```

首次 `db:init` 前在 `.env` 设置随机 `NUXT_ADMIN_SESSION_SECRET` 和管理员密码；生产不要用示例值。`db:*` 等维护脚本读取可选 `.env`，可用 `NUXT_ENV_FILE` 换文件（只对维护脚本生效）。

公开指南与部门目录默认使用 `data/seeds/public-content.ts` 静态回退；入库为可选步骤（`pnpm db:seed:catalog --apply`、`pnpm db:seed:procedures --apply`），脚本只管理带自身所有权标记的记录，与人工记录冲突整批停止。流程种子当前维护 5 条高频新生事项：2026 级报到、校园网与统一认证、宿舍维修报修、图书馆借阅证/微信绑定和专升本学生档案邮寄。

常用检查：

```bash
pnpm test          # scripts/*.test.ts 全量单元测试（发布前必须全绿）
pnpm lint && pnpm typecheck
pnpm check         # lint + typecheck + test + build + bundle 预算 + PWA 构建
pnpm e2e           # 生产构建 + 34 条桌面/移动 Chromium 核心路径检查（不读生产库）
pnpm data:verify:local   # 前台公开内容 vs 后台可维护数据分叉检查
```

开发站点 <http://127.0.0.1:3000/>。公开路由：`/map`、`/procedures`、`/guides`、`/departments`、`/clubs`、`/nearby`、`/discover`、`/search`、`/sources`、`/feedback`、`/about`、`/privacy`；后台 `/admin`。

## 发布

生产优先使用个人仓库的 Gitee Go 云端流水线。以下命令仅供 Linux 构建环境使用；Windows 可以执行 dry-run，不能上传 Windows 原生模块到 Linux 生产服务器：

```bash
bash scripts/deploy.sh              # 全量闸门：测试 → 构建 → 制品核验 → 上传 → 服务器部署
bash scripts/deploy.sh --dry-run    # 只跑闸门与构建，不上传不部署
```

脚本强制执行以下检查（历史上每个都真实出过事故）：

1. **工作区必须干净**：存在未提交改动时拒绝发布；只提交本次任务相关文件，不能用参数绕过。
2. **改过检索/算分必须 bump 缓存版本**：服务端对比当前已部署制品与候选制品的检索源码摘要和缓存版本。首次从无摘要的旧 release 升级，必须 bump 缓存版本。
3. **质量检查全绿**：lint、类型检查、完整测试、构建预算、PWA 和 E2E 任一失败即停。
4. **构建 exit code 必须为 0**：OOM 时 pnpm 只打 `ELIFECYCLE` 不显式报错，必须显式核对。
5. **tar 包大小与时间戳必须与上一次不同**：完全相同 = 打的是旧产物（hijack-fix2 坏发布事故）。
6. 服务器端由 `scripts/server-side-deploy.sh` 接管：空间检查 → 制品提交、Node ABI 和原生模块校验 → 数据库结构只读检查 → DB 备份 → 隔离库冒烟 → 原子切换 → 健康和 `/version.json` 检查（失败恢复旧 symlink 并检查服务）→ 写部署标记。自动发布不迁移生产数据库；缺列时按 [部署文档](docs/DEPLOYMENT.md) 单独处理。

服务器布局：`releases/<id>` + `current` 软链 + `shared/.env` + `shared/data/yeu.sqlite`。发布脚本保留历史 release 和备份；维护时先核对清单、当前与回滚版本及异机备份。**不在 `current` 内 git pull；每次用新时间戳和随机后缀 release；不删同名 release 重部署；动生产库前先备份。**

CI/CD（Gitee Go 流水线）：push `master` 触发 `scripts/ci-build.sh`，固定 Node 22.20.0 / pnpm 10.28.1，显式缓存 pnpm store。单次安装后，在 4 核 8G 任务中并行执行类型检查和全量测试/构建；类型检查使用独立目录，任一失败终止另一支。两支均通过且原生模块、PWA 验证通过后，将 Linux 制品下发到按构建号隔离的目录，强制比较完整提交号，再执行备份、冒烟、切换和健康/首页/版本验收。release 名包含日期时间、构建号、提交号和随机后缀。相对当前生产提交只有文档变更时，发送跳过描述文件，不备份、不切换、不重启。无法确定基线时执行完整流程。全仓库 lint、包体预算和完整浏览器回归可通过 `pnpm check:e2e` 独立执行。配置见 `.workflow/流水线-20261009.yml`。

生产排障顺序与历史事故记录见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) 与部署纪要；AI 检索排查（网关限流、缓存两层、探针方法）见 [docs/ADMIN_RUNBOOK.md](docs/ADMIN_RUNBOOK.md)。

## 目录

```text
app/                 Nuxt 前台与管理后台页面（features/ 按业务域组织）
server/              API 路由、数据库访问与服务端业务模块（modules/ 为核心业务）
shared/              前后端共享类型、校验规则和常量
map/                 地图供应商无关接口与 provider 适配器
data/                本地数据库、导入模板与数据说明
docs/                活文档：架构、数据模型、部署运维、内容治理（索引见 docs/README.md）
scripts/             初始化、导入、校验、测试与部署脚本
miniapp/             微信小程序（uni-app，只读 API + 内置步行导航）
tests/               Playwright 端到端测试
public/              公共静态资源与 PWA 资源
```

## 文档导航

完整索引见 [docs/README.md](docs/README.md)。常用入口：

- [产品需求文档](docs/PRD.md)：用户、范围、验收标准和后续边界。
- [AGENTS.md](AGENTS.md)：AI 协作编码约束（行为红线、发布纪律），项目事实不在此重复。
- [地图交互规范](docs/MAP_INTERACTION_SPEC.md)：地图行为、标点联动和失败降级。
- [内容治理政策](docs/CONTENT_POLICY.md)：资料来源、时效、版权和发布门槛；地点审核状态以后台数据库为准。
- [单管理员运行手册](docs/ADMIN_RUNBOOK.md)：采点、审核、纠错、紧急下架和凭据轮换。
- [技术架构](docs/ARCHITECTURE.md) 与 [宝塔 Linux 部署](docs/DEPLOYMENT.md)：运行边界、环境变量、发布、备份和恢复。
- [Git 资源与配置说明](docs/GIT_RESOURCES_AND_CONFIGURATION.md)：Git 资源边界、环境配置、数据库私有存放、协作和发布流程。
- [工程重构规划](docs/RESTRUCTURE_PLAN_2026-10-05.md)：对标 electro-exam 的文档/CI/部署重构路线（P0~P4 执行状态）。

## 名称与声明

“仰恩新生指南”是当前工作名称。本项目现阶段不是仰恩大学官方网站，内容不能替代学校正式通知；涉及报到、缴费、学籍、安全等事项时，以学校最新通知为准。
