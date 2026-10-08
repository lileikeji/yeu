# Git 资源与配置说明

> 适用仓库：`https://gitee.com/newcomers-guide/yeu`
>
> 这份说明把 Git 中的代码、数据、环境配置、部署文件和生产持久化资源分开说明，避免把数据库、密钥或服务器运行文件误提交。

## 当前仓库与权限

- **规范远程**：`organization` → `https://gitee.com/newcomers-guide/yeu.git`，用于组织仓库的拉取和发布。
- **个人远程**：`origin` → `https://gitee.com/lilei1529/yeu.git`，仅作为个人备份或历史来源；发布前不要误推到这里。
- **默认分支**：`master`。日常改动建议从它创建 `codex/<topic>` 分支，通过合并请求进入默认分支。
- **仓库可见性**：组织下的私有仓库；代码可以协作，生产数据库、密钥和上传文件仍只留在服务器受限目录。
- **组织成员管理**：<https://gitee.com/organizations/newcomers-guide/members/list>
- **仓库成员管理**：进入仓库「管理 → 仓库成员管理 → 管理员」。组织管理员和仓库管理员是两层权限，遇到“访问受限”时两处都要检查。

当前已确认 `andylyj` 在 `newcomers-guide` 组织成员页显示为“管理员”。如果该账号仍无法打开私有仓库，应在仓库成员管理页确认它同时位于“管理员”列表，并让账号重新登录或重新接受邀请；不要通过公开仓库或复制密钥绕过权限。

## 仓库结构（当前）

```text
app/                         Nuxt 页面、布局、组件和前台/后台路由
server/                      Server API、数据库访问、AI/知识库和机器人服务
shared/                      前后端共享类型、校验规则和常量
map/                         地图 provider、坐标转换和离线/高德适配器
data/                        可复现种子、导入模板和数据说明（不放运行库）
server/database/migrations/  Drizzle/SQLite 结构迁移
scripts/                     初始化、导入、备份、校验和运维脚本
public/                      可公开的图片、图标、PWA 资源和静态文件
storage/                     运行时上传目录（生产映射到 shared/uploads）
ops/                         systemd、Nginx、定时任务和 relay 配置模板
docs/                        PRD、架构、部署、治理、规则和验收记录
tests/                       单元、集成、E2E 和无障碍检查
types/、vendor/              类型补充和已审查的兼容性依赖
.github/                     CI、依赖更新和仓库自动化
package.json                 pnpm 命令、运行脚本和依赖入口
pnpm-lock.yaml               锁定依赖版本，安装时使用 frozen-lockfile
nuxt.config.ts               Nuxt/Nitro、运行时公开配置和构建配置
ecosystem.config.cjs         兼容旧环境的进程配置模板，不与生产 systemd 重复启动
.env.example                 可提交的配置模板，不含真实密钥
```

## 1. 资源边界

### 应该提交到 Git

| 目录/文件 | 作用 | 备注 |
| --- | --- | --- |
| `app/` | Nuxt 前台、后台页面和组件 | 页面与交互源码 |
| `server/` | API、数据库访问、AI/知识库和服务端模块 | 不放运行时数据 |
| `shared/`、`map/` | 共享类型、校验规则和地图 provider | 前后端共同使用 |
| `data/*.ts`、`data/*.json` | 种子数据、导入模板、数据说明 | 只能放脱敏、可公开内容 |
| `server/database/migrations/` | Drizzle 数据库结构迁移 | 生产变更的唯一入口 |
| `scripts/` | 初始化、迁移、导入、备份、校验脚本 | 脚本行为应可复现 |
| `docs/`、`tests/` | 架构、运维、治理和自动化测试 | 发布前同步状态 |
| `public/`、`vendor/` | 公共静态资源和已允许发布的第三方资源 | 先确认授权和体积 |
| `ops/` | systemd、Nginx、定时任务和 relay 配置模板 | 不放实际 `.env` |
| `package.json`、`pnpm-lock.yaml`、`.github/` | 依赖、命令和 CI 门禁 | 使用 `pnpm install --frozen-lockfile` |

### 不应该提交到 Git

以下内容已经在 [`.gitignore`](../.gitignore) 中排除：

| 内容 | 当前约定 | 正确存放位置 |
| --- | --- | --- |
| `data/*.sqlite`、`data/backups/` | 生产/本地 SQLite 和备份 | 服务器 `shared/data`、受控备份存储 |
| `.env`、`.env.*` | 密钥、管理员配置和域名配置 | 本机受限文件或服务器 `shared/.env` |
| `.data/`、`.nuxt/`、`.output/` | 测试库和构建产物 | 本机或发布 release 目录 |
| `storage/uploads/` | 用户上传文件 | 服务器 `shared/uploads` |
| `data/imports/private/`、原始表格和登录响应 | 私有研究素材、Cookie、原始接口响应 | 受控本地/私有对象存储 |
| `.deploy-*`、`deploy-output*.tar*`、性能分析文件 | 临时发布包和调试产物 | 本机临时目录或发布制品库 |

不要使用 `git add -f` 绕过这些规则。数据库、管理员密码、Cookie、API Key 和访客/聊天记录不能上传到公开仓库。

## 2. Git 协作配置

查看当前仓库状态：

```bash
git remote -v
git branch --show-current
git status --short --untracked-files=all
```

推荐协作流程：

```bash
git fetch origin
git switch -c codex/<topic>
# 修改并验证后，只暂存本次任务相关文件
git add app server shared map data docs scripts tests ops package.json pnpm-lock.yaml
git diff --cached --check
git commit -m "描述本次变更"
git push -u origin codex/<topic>
```

不要直接在 `master` 上强制推送；合并前至少通过相关测试和 `git diff --check`。仓库已有用户未提交的改动时，不要使用 `git reset --hard`、`git checkout --` 或 `git clean -fd` 清理现场。

## 3. 环境配置层级

配置按以下边界管理：

1. `.env.example` 是提交到 Git 的变量模板，不包含真实值。
2. 本地 `.env` 由开发者复制生成，已被 Git 忽略。
3. 生产使用 `/www/wwwroot/yeu/shared/.env`，由 `ops/systemd/yeu.service` 的 `EnvironmentFile` 加载。
4. `NUXT_ENV_FILE` 只供维护脚本选择额外环境文件，不会替代 Nuxt、Nitro 或 systemd 的运行环境。

本地初始化：

```bash
pnpm install
cp .env.example .env
# PowerShell: Copy-Item .env.example .env
# 编辑 .env，至少设置 NUXT_ADMIN_SESSION_SECRET 和管理员初始化密码
pnpm db:migrate
pnpm db:init
pnpm db:check
pnpm dev
```

生产最小变量见 [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md)，重点包括：

- `NUXT_PUBLIC_SITE_URL`、`NUXT_PUBLIC_MAP_PROVIDER=amap`
- `NUXT_DATABASE_PATH=/www/wwwroot/yeu/shared/data/yeu.sqlite`
- `NUXT_ADMIN_SESSION_SECRET`、`NUXT_ALLOWED_ORIGINS`
- 高德浏览器 Key/安全密钥和服务端 `AMAP_WEB_SERVICE_KEY`
- `NUXT_TRUST_PROXY` 只有在 Nginx 转发链已核验后才能开启

公开变量可以进入浏览器；`NUXT_DATABASE_PATH`、会话密钥、管理员配置、服务端 Key、机器人密钥必须保持服务端私有。

## 4. 数据库与知识库资源

Git 保存数据库的结构和可复现输入，不保存运行时库：

- 结构：`server/database/migrations/*.sql`
- 可公开种子：`data/*.ts`、`data/*.json`
- 本地运行库：`data/yeu.sqlite`（忽略）
- 生产运行库：`/www/wwwroot/yeu/shared/data/yeu.sqlite`
- 备份：`/www/wwwroot/yeu/shared/backups/` 或受控备份存储

迁移和初始化：

```bash
pnpm db:migrate
pnpm db:init
pnpm db:check
```

知识库/官方资料导入前先检查来源、版权和发布状态，再使用项目脚本：

```bash
pnpm knowledge:crawl:official
pnpm knowledge:compile
pnpm knowledge:import:handbook
pnpm db:seed:assistant
```

不要把原始 PDF、私有聊天记录、Cookie 或未经审核的抓取结果直接提交。需要共享结构化内容时，提交脱敏的种子/迁移；需要共享完整数据库时，使用私有备份存储，不要放进公开 Gitee 仓库。

### 备份与私有传输

项目备份脚本会执行 SQLite 在线备份、完整性检查、外键检查并生成 SHA-256 元数据：

```bash
pnpm db:backup -- --database ./data/yeu.sqlite --output ./data/backups/yeu-<timestamp>.sqlite
```

备份文件应只上传到私有对象存储、服务器受限目录或私有仓库附件。上传前检查：

```bash
git status --short --untracked-files=all
Get-Content ./data/backups/yeu-<timestamp>.sqlite.json
```

如果团队只需要测试数据，优先使用迁移 + 脱敏种子重建，不共享生产库。恢复到服务器前先停止写入、校验备份元数据和 `integrity_check`，再按 [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) 的回滚步骤切换。

## 5. 地图、媒体和上传资源

- `public/` 只放允许公开、体积可接受且已登记来源的静态资源。
- `storage/uploads/` 是运行时目录，生产使用 `/www/wwwroot/yeu/shared/uploads`，不进 Git。
- 高德工作地图的原始响应、Cookie、登录信息和原始表格不进 Git；只提交最小化、脱敏、可审计的结果。
- 地图来源和坐标状态以后台数据库审核状态（place_sources、地点核验字段）为准，治理规则见 `docs/CONTENT_POLICY.md`。

相关命令：

```bash
pnpm map:readiness
pnpm map:sources:sync --database "$NUXT_DATABASE_PATH"
pnpm map:owner:sync --database "$NUXT_DATABASE_PATH"
pnpm data:verify --database "$NUXT_DATABASE_PATH"
```

## 6. 发布配置

生产目录与职责固定为：

```text
/www/wwwroot/yeu/
  current -> releases/<commit-or-timestamp>
  releases/<version>/       # 只读代码和 .output
  shared/.env               # 生产配置，不进 Git
  shared/data/yeu.sqlite    # 生产数据库
  shared/uploads/           # 上传文件
  shared/backups/           # 数据库备份
  shared/logs/              # 运行日志
```

发布顺序：

1. 从 Git 拉取固定 commit，记录 SHA。
2. `pnpm install --frozen-lockfile`，执行 `pnpm check` 或发布候选门禁。
3. 备份并校验生产 SQLite。
4. 在兼容环境演练迁移，生产只运行已提交 migration。
5. 原子切换 `current`，重启 `yeu.service`。
6. 检查 `/api/health`、首页、地图、搜索、登录和核心 API。
7. 保留至少两个可回滚 release。

生产只运行 `yeu.service`，不要同时用 PM2 启动同一个应用。Nginx/CDN 负责 HTTPS、缓存静态资源和反向代理；Node 只监听 `127.0.0.1:3000`。

可复用的服务和 Nginx 模板位于：

- `ops/systemd/yeu.service`
- `ops/systemd/yeu-retention.*`
- `ops/yeu-knowledge-crawl.*`
- `ops/configure-nginx.sh`
- `ops/nginx/`
- `ops/wechatpadpro/`（仅在明确启用微信 relay 时使用）

## 7. 验证门禁

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm bundle:budget
pnpm pwa:build:test
```

完整门禁使用：

```bash
pnpm check
pnpm e2e:install       # 首次安装 Chromium
pnpm check:e2e
```

测试数据库使用 Git 忽略的 `.data/`，不会读取生产库。真实高德 Key、CDN、微信/QQ WebView、移动设备和生产域名仍需单独验收，不能把本地 E2E 结果写成生产可用性证明。

## 8. Gitee 组织协作

组织成员管理入口：

<https://gitee.com/organizations/newcomers-guide/members/list>

登录后可邀请成员或添加成员。Gitee 通常不提供可公开转发的通用邀请链接；数据库仓库应创建为组织下的私有仓库，并单独授予需要访问的成员。当前代码仓库是 `newcomers-guide/yeu`，不要把生产数据库复制到个人仓库或公开仓库。

### 成员加入后的检查顺序

1. 成员先接受组织邀请，并确认能打开组织首页。
2. 在仓库「管理 → 仓库成员管理 → 所有」中确认账号存在。
3. 需要管理仓库时，将账号放入「管理员」列表；只读协作使用「观察者」，提交代码使用「开发者」。
4. 让成员重新登录后访问 <https://gitee.com/newcomers-guide/yeu>，再测试代码、Issues 和 Pull Request 权限。
5. 任何权限变更都记录账号、范围和时间，不记录密码、Token 或 Cookie。

### 常用配置命令

```bash
# 第一次拉取组织仓库
git clone https://gitee.com/newcomers-guide/yeu.git
cd yeu
pnpm install --frozen-lockfile

# 已有本地工作区时补充组织远程
git remote add organization https://gitee.com/newcomers-guide/yeu.git
git fetch organization
git switch master
git pull --ff-only organization master

# 提交前检查并推送任务分支
git switch -c codex/<topic>
git diff --check
pnpm check
git push -u organization codex/<topic>
```

如果组织仓库采用受保护的 `master`，不要直接强推；通过 Pull Request 合并。生产发布只允许从已经审核的 commit 构建，并在发布记录中保存 commit SHA。

## 9. 变更完成检查

- [ ] 代码、迁移、种子和文档已进入正确目录。
- [ ] `.env`、数据库、备份、上传文件、Cookie、Token 和私有原始资料未进入 Git。
- [ ] `git diff --cached --check` 通过，提交内容只包含本次任务。
- [ ] 相关 lint/typecheck/test/build 已通过。
- [ ] 数据库变更有 migration，生产迁移前已备份。
- [ ] 生产配置、systemd、Nginx 和 CDN 变更已记录在运维文档。
- [ ] 任务完成后追加 [`docs/rules/TASK_COMPLETION_REVIEW.md`](./rules/TASK_COMPLETION_REVIEW.md)，并同步受影响的架构/部署文档。
