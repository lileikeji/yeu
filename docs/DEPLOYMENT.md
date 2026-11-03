# 宝塔 Linux 部署与运维

> 目标拓扑：Nginx/CDN -> `systemd yeu.service` 单实例 -> Nuxt/Nitro -> SQLite

当前生产唯一公开域名为 `yx.huiliyill.cn`。部署环境中的 `NUXT_PUBLIC_SITE_URL`、`NUXT_BOT_SITE_URL`、`NUXT_ALLOWED_ORIGINS`、`NUXT_WECHAT_SHARE_ALLOWED_HOSTS`，以及 Nginx `server_name`、腾讯 CDN 加速域名、回源 Host、HTTPS 证书和高德域名白名单必须全部使用该域名。旧 `yeu.huiliyill.cn`、`cn.yeu.huiliyill.cn`、`global.yeu.huiliyill.cn` 不再作为可用线路。
> 目标仓库：`https://gitee.com/lilei1529/yeu`
> 状态：生产部署基线。当前仓库已加入 Drizzle/SQLite 迁移与初始化脚本、管理员/用户认证、AI/知识库和 PWA；生产应用由 `systemd yeu.service` 管理，QQ/微信 relay 使用独立 systemd 单元。

## 1. 生产原则

- **日常发布使用个人仓库 `lilei1529/yeu` 的 Gitee Go 流水线，push `master` 触发**。单次安装后，在 4 核 8G 任务中并行运行独立目录的类型检查和全量测试/构建，任一失败取消另一支；均通过后核验原生模块和 PWA。Linux 构建环境也可使用 `bash scripts/deploy.sh`，其完整门禁另含 lint、预算和 E2E；独立浏览器回归使用 `pnpm check:e2e`。两种发布复用制品内的服务端脚本，不覆盖服务器的独立脚本。部署前校验完整 SHA、缓存版本、原生模块与数据库结构，随后备份、冒烟、原子切换、核验健康、首页和运行版本。下文手工步骤仅用于首次建站与特殊运维。
- 推荐 Node.js 22 LTS，并在部署前以 `package.json` 和 Nuxt 当前版本的 engines 要求复核；pnpm 使用仓库声明的 10.28.1 版本。
- 应用进程使用独立低权限 Linux 用户运行，不使用 root；Nginx 只读静态文件和公开上传目录。
- SQLite 只由一个 `yeu.service` 实例写入，禁止 PM2、cluster 或多实例并发。扩展为多实例前先迁移到服务型数据库。
- 代码版本、持久化数据库、上传文件、环境变量和备份分离；新版本发布不得覆盖持久化数据。
- 生产只用高德 JS API 2.0；MapLibre/公共 OSM 瓦片仅用于开发或低流量预览。
- 所有结构变更通过已提交的 Drizzle migration，生产禁止直接 `push` schema。

## 2. 服务器准备

宝塔中安装 Nginx、Node.js 22 LTS、Git，并启用 HTTPS 证书自动续期；应用守护由仓库提供的 `systemd` 单元负责，不要再为同一应用安装或启用 PM2。SQLite CLI 用于一致性备份和恢复检查。若采用原生 SQLite Node 驱动，还需按驱动安装说明准备编译工具或兼容的预编译二进制。

建议目录：

```text
/www/wwwroot/yeu/
  current -> releases/20260713-180000
  releases/                 每次发布的只读代码和 .output
  shared/
    data/yeu.sqlite         SQLite 主库（及 -wal/-shm）
    uploads/                公开媒体及其派生图
    backups/                本机短期备份
    logs/                   应用维护脚本日志
    .env                    生产变量，权限 600，不进 Git
```

目录所有者应为应用用户；Nginx 仅获得读取 `.output/public` 和需要公开的 `shared/uploads` 的权限。数据库、备份和 `.env` 不得位于可直接下载的 URL 下。

## 3. 环境变量

变量名应在实现 `runtimeConfig` 时最终确认。以下是最低契约：

| 变量 | 示例/要求 | 可公开 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 是 |
| `NITRO_HOST` | `127.0.0.1` | 是 |
| `NITRO_PORT` | `3000` | 是 |
| `NUXT_PUBLIC_SITE_URL` | `https://guide.example.com`，必须与公开站点源一致 | 是 |
| `NUXT_PUBLIC_MAP_PROVIDER` | 生产固定为 `amap`；不得以开发预览代替正式地图 | 是 |
| `NUXT_PUBLIC_AMAP_KEY` | 高德 JS API Key，绑定生产域名 | 会下发浏览器 |
| `NUXT_PUBLIC_AMAP_SECURITY_CODE` | 高德 JS 安全密钥，按高德要求配置域名限制 | 会下发浏览器 |
| `NUXT_DATABASE_PATH` | `/www/wwwroot/yeu/shared/data/yeu.sqlite` | 否 |
| `NUXT_ADMIN_SESSION_SECRET` | 密码学随机值，至少 32 字节 | 否 |
| `NUXT_ADMIN_SESSION_TTL_HOURS` | `12`，允许范围 1-168 | 否 |
| `NUXT_ALLOWED_ORIGINS` | 可选的额外写接口来源，逗号分隔；站点自身来源自动允许 | 否 |
| `NUXT_TRUST_PROXY` | Nginx 真实 IP 拓扑核验后设为 `true`，否则保持未设置/`false` | 否 |
| `NUXT_FORCE_HTTPS` | 可选，设为 `true`/`1` 时在应用层将 HTTP 301 到 HTTPS（跳过 loopback；Host 须通过安全校验）。**优先在 Nginx 做 HTTP→HTTPS**；仅当边缘仍转发明文且需应用兜底时开启。须先保证 `NITRO_HOST=127.0.0.1` 与证书正确 | 否 |
| `NUXT_FEEDBACK_IP_RETENTION_DAYS` | `30`，反馈限流网络摘要保留期 | 否 |
| `NUXT_FEEDBACK_CONTACT_RETENTION_DAYS` | `90`，已处理反馈联系方式保留期 | 否 |
| `NUXT_FEEDBACK_RECORD_RETENTION_DAYS` | `730`，反馈记录最长保留期 | 否 |
| `NUXT_ADMIN_USERNAME` | 首次初始化或轮换时使用，默认 `admin` | 否 |
| `NUXT_ADMIN_PASSWORD` | 仅初始化命令的临时输入，至少 12 个字符；生产不长期写入 `.env` | 否 |
| `NUXT_ADMIN_PASSWORD_HASH` | 推荐的初始化/轮换输入；由 `pnpm db:hash-password` 生成 | 否 |

高德 JS Key 和安全密钥不可当作真正秘密，因为浏览器必须接收它们；安全性依赖域名白名单、配额和告警。会话密钥、管理员初始化凭据不得使用 `NUXT_PUBLIC_` 前缀。`NUXT_UPLOAD_DIR`、`NUXT_AMAP_WEB_SERVICE_KEY`、`NUXT_LOG_LEVEL` 等尚未被当前代码消费的预留名不属于现行生产契约，相关能力实现后再加入 `.env.example` 和本表。

`.env` 不提交仓库、不放进前端构建产物、不打印到 CI 或 systemd 日志。通过 shared 环境文件或受限部署会话注入变量；变更 public runtime config 后也执行完整构建和回归检查。

仓库内的 TypeScript 维护脚本支持用 `NUXT_ENV_FILE` 显式选择环境文件，且 Shell 已有变量优先；这个变量不作用于 Nuxt 构建、Nitro 或 systemd 服务环境，不能替代生产发布会话的环境注入。生产迁移、构建和 systemd 重启前，都应在同一个受限 Shell 会话中用 `set -a` + `source /www/wwwroot/yeu/shared/.env` 导出 shared 环境，并核对 `NUXT_DATABASE_PATH`，防止命令静默落到 release 内的 `./data/yeu.sqlite`。

## 4. 首次发布

以下命令是当前版本的标准流程。当前构建只预渲染稳定且不依赖数据库的 `/offline`，生成 `/offline.html` 供断网回退；Service Worker 只预缓存该说明页所需 CSS、图标和字体，不预缓存 JavaScript。首页、内容页和地图页不在构建时预渲染。构建本身不要求先迁移数据库，但首次启动前必须完成迁移、管理员初始化和数据库检查。

```bash
cd /www/wwwroot/yeu
git clone https://gitee.com/lilei1529/yeu.git releases/20260713-180000
cd releases/20260713-180000
corepack enable
corepack prepare pnpm@10.28.1 --activate
pnpm install --frozen-lockfile
set -a
source /www/wwwroot/yeu/shared/.env
set +a
test "$NUXT_DATABASE_PATH" = "/www/wwwroot/yeu/shared/data/yeu.sqlite"
pnpm check
pnpm db:migrate
pnpm db:init
pnpm db:check
pnpm data:verify --database "$NUXT_DATABASE_PATH"
ln -sfn /www/wwwroot/yeu/releases/20260713-180000 /www/wwwroot/yeu/current
```

`pnpm db:init` 是首次部署必需步骤：它创建唯一管理员，且没有初始化凭据时会直接失败。生产优先在受限部署会话中临时注入 `NUXT_ADMIN_PASSWORD_HASH`；若临时使用 `NUXT_ADMIN_PASSWORD`，长度必须至少为 12 个字符。初始化成功后立即从 shared `.env` 和当前 Shell 清除 `NUXT_ADMIN_PASSWORD`/`NUXT_ADMIN_PASSWORD_HASH`，日常发布只执行 `db:migrate`，不重复初始化管理员。不得把示例账号、明文密码或密码哈希提交到仓库、发布记录和日志。

首批公开目录入库是可选的首次建库步骤，静态回退不依赖它。需要让后台接管目录时，在 `db:migrate` 后、`build` 前单独执行：

```bash
pnpm db:seed:catalog
pnpm db:seed:catalog --apply
```

第一条命令默认只读，只报告预计新增、跳过和冲突；确认无冲突后才执行第二条。已有人工内容的生产库不应把 `--apply` 作为无审查的日常发布步骤。脚本遇到来源 URL 或内容标识冲突会整批停止。

公开目录完成后，以同样的预检/应用顺序导入首批结构化流程：

```bash
pnpm db:seed:procedures
pnpm db:seed:procedures --apply
```

流程脚本要求关联部门、指南和来源已存在；人工同名流程会使整批操作停止。当前种子覆盖 2026 级报到、校园网与统一认证、宿舍维修报修、图书馆借阅证/微信绑定和专升本学生档案邮寄。生产更新前先备份数据库，并核对预检中的新增/更新数量。

校园问答的内置知识种子是运行时检索的基础数据，不是只存在于构建产物里的静态文件。每次发布在迁移完成后都要执行一次幂等同步；它会更新内置条目并保留动态内容，不能省略，否则身份问答和新生经验会退回网页搜索或显示资料不足：

```bash
pnpm db:seed:assistant --database "$NUXT_DATABASE_PATH"
pnpm db:seed:assistant --apply --database "$NUXT_DATABASE_PATH"
```

第一条只做预检，第二条才写入。发布记录必须记录预检总数与应用总数；当前种子规模以命令输出为准，不要把本地开发库的条数当成线上事实。完成后用“吴庆星是谁”“什么时候开学”“体育选修有哪些项目”做一次本地命中冒烟，确认 `retrievalPath=local_database` 且没有无关网页引用。

首次建立地图草稿库时，按以下顺序预检并应用；已有人工地点数据的生产库必须先备份并逐项审查预检结果：

```bash
pnpm amap:drafts --database "$NUXT_DATABASE_PATH"
pnpm amap:drafts --apply --database "$NUXT_DATABASE_PATH"
pnpm map:owner:sync --database "$NUXT_DATABASE_PATH"
pnpm map:owner:sync --apply --database "$NUXT_DATABASE_PATH"
pnpm map:sources:sync --database "$NUXT_DATABASE_PATH"
pnpm map:sources:sync --apply --database "$NUXT_DATABASE_PATH"
```

`map:owner:sync` 只写入用户授权工作地图的 `unverified` GCJ-02 草稿点；`map:sources:sync` 只新增经过审核的官方来源关系。两者都不会创建公开导航点。应用后必须运行 `pnpm map:readiness --database "$NUXT_DATABASE_PATH"`，确认剩余阻塞与现场核验台账一致。

`pnpm check` 统一执行 lint、类型检查、全部 `scripts/*.test.ts` 测试、生产构建、客户端构建体积预算和 Service Worker 产物断言。体积预算要求 MapLibre 保持独立动态分包，并限制首页、搜索、地图、流程详情及全局入口的初始未压缩 JS/CSS；它不代替生产真机性能测试。`pnpm data:verify --database "$NUXT_DATABASE_PATH"` 只读核对目标库中的来源、公开内容、流程和高德草稿标点是否与当前代码种子一致，防止前台显示内容和后台可维护数据分叉。若需要同时验收管理员账号，只在受限部署会话中临时执行 `pnpm data:verify --database "$NUXT_DATABASE_PATH" --admin-user "$NUXT_ADMIN_USERNAME" --admin-password "$NUXT_ADMIN_PASSWORD"`，不要把明文密码写入脚本、日志或发布记录。发布记录仍须明确列出浏览器验收范围。迁移前创建一致性备份；首次建库也要确认目录权限、外键和 WAL 设置。

独立浏览器回归任务或发布候选工作站应在 `pnpm install --frozen-lockfile` 后安装与仓库 Playwright 版本匹配的 Chromium，再执行包含完整工程门禁和浏览器测试的命令。日常 Gitee 发布不安装浏览器：

```bash
# 开发/发布候选工作站
pnpm e2e:install

# 裸 Linux CI 需要同时安装浏览器系统依赖时使用；需具备相应系统包权限
pnpm e2e:install:ci

pnpm check:e2e
```

`pnpm e2e` 会先运行生产构建，再重建 Git 忽略的 `.data/e2e.sqlite`，在其中初始化仅用于 E2E 的管理员、内容草稿和公开地点，不会读取或修改生产数据库，也不会复用生产凭据。已经通过 `pnpm check` 或 `pnpm build` 生成最新 `.output` 时，可使用 `pnpm e2e:run` 避免重复构建；`pnpm check:e2e` 使用这一底层命令。当前项目自动执行桌面 Chromium 与 Pixel 5 移动视口，外部地图瓦片和官网请求会被阻断；公开端、地图显示设置、后台发布/下线/审计、反馈处理、PWA 注册/更新提示、版本接口和六类页面 Axe 扫描共 48 条检查。生产服务器本身无需为运行应用安装浏览器；WebKit、微信内置浏览器、实际安装态 PWA、真机定位、高德正式 Key 与生产域名仍按发布清单人工验收。

首次启动（示意）：

```bash
sudo systemctl enable --now yeu.service
sudo systemctl is-enabled yeu.service
sudo systemctl is-active yeu.service
```

生产服务器只使用 `yeu.service` 管理应用，不要再用 PM2 启动同一个 `yeu` 进程。两套守护会争抢
`127.0.0.1:3000`，旧进程可能继续提供旧版本，而新进程只留下 `EADDRINUSE` 日志。

如果在 Windows 构建 `.output` 后上传到 Linux，切换 `current` 前必须把
`.output/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
替换为版本匹配的 Linux 构建。使用 `file` 验证结果必须是 ELF 共享对象，不能是 Windows PE32 DLL。

确认 `yeu.service` 已启用且重启服务器后能自动恢复。不要再为同一个应用启用 PM2；应用只监听 `127.0.0.1`，不直接暴露 Node 端口。

### 4.1 管理员密码轮换与会话撤销

密码轮换在维护窗口执行，并先按第 8 节创建一致性备份。以下命令不会把明文密码写进命令行历史；新密码仍须至少 12 个字符：

```bash
cd /www/wwwroot/yeu/current
set -a
source /www/wwwroot/yeu/shared/.env
set +a
test "$NUXT_DATABASE_PATH" = "/www/wwwroot/yeu/shared/data/yeu.sqlite"

read -rsp "New admin password: " NUXT_ADMIN_PASSWORD
printf '\n'
export NUXT_ADMIN_PASSWORD
NEW_ADMIN_HASH="$(pnpm --silent db:hash-password)"
unset NUXT_ADMIN_PASSWORD

export NUXT_ADMIN_PASSWORD_HASH="$NEW_ADMIN_HASH"
pnpm db:init --reset-admin
unset NUXT_ADMIN_PASSWORD_HASH NEW_ADMIN_HASH

sudo systemctl restart yeu.service
```

`--reset-admin` 在一个数据库事务中更新密码哈希、重新启用管理员并撤销该管理员的全部旧会话，不需要再手工修改 `admin_sessions`。完成后用新密码登录一次，确认旧浏览器会话已失效，并在受限运维记录中写明轮换时间、执行人和备份位置，不记录密码或哈希。

若会话密钥疑似泄露，应生成新的至少 32 字节 `NUXT_ADMIN_SESSION_SECRET`、更新 shared `.env` 并重启应用；密钥变化会使所有现有会话 token 无法通过校验。随后检查 `/api/health` 并重新登录。不要把日常密码轮换和会话密钥轮换混为同一步骤。



### NUXT_TRUST_PROXY 安全约定

- 仅在 Nginx（或其它反向代理）已正确设置 `X-Forwarded-For` / `X-Real-IP`，且 Node 只监听本机回环（`NITRO_HOST=127.0.0.1`）时，将 `NUXT_TRUST_PROXY=true`。
- 应用在 `true` 时**仍会校验 TCP 对端**：默认只信任 loopback 对端的 `X-Forwarded-For`；直连 Node 并伪造 XFF 的请求会被忽略。
- Docker sidecar 等私网代理场景可设置 `NUXT_TRUST_PROXY_PEERS=private`（额外信任 RFC1918 对端）。默认 `loopback`。
- 切勿在 Node 对公网暴露且开启 `NUXT_TRUST_PROXY` 的情况下运行。

## 5. Nginx 配置要点

在宝塔站点中配置域名和证书，反向代理到 `127.0.0.1:3000`。以下片段需合并到宝塔生成的 server 块，不能覆盖证书续期配置：

```nginx
# 独立 HTTP server：禁止明文站点返回业务内容（CDN/边缘也应同样强制）。
server {
    listen 80;
    server_name yeu.example.com;
    return 301 https://$host$request_uri;
}

# 可选：拒绝裸 IP 直接访问业务（与域名证书不一致时关闭默认站点或 return 444）。
# server {
#     listen 80 default_server;
#     server_name _;
#     return 444;
# }

client_max_body_size 10m;

location /_nuxt/ {
    root /www/wwwroot/yeu/current/.output/public;
    try_files $uri @nuxt;
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location ~ ^/(?:sw-[a-z0-9-]+\.js|registerSW\.js)$ {
    root /www/wwwroot/yeu/current/.output/public;
    try_files $uri =404;
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header CDN-Cache-Control "no-store" always;
    add_header Edge-Control "no-store" always;
    add_header Pragma "no-cache" always;
}

location = /site.webmanifest {
    root /www/wwwroot/yeu/current/.output/public;
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header CDN-Cache-Control "no-store" always;
    add_header Edge-Control "no-store" always;
    add_header Pragma "no-cache" always;
}

location /uploads/ {
    alias /www/wwwroot/yeu/shared/uploads/;
    autoindex off;
    add_header X-Content-Type-Options nosniff;
}

location / {
    try_files $uri @nuxt;
}

location @nuxt {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
}
```

补充要求：

- HTTP 强制跳转 HTTPS（见上方独立 listen 80 示例）；证书链、自动续期和 TLS 1.2/1.3 通过检查。**当前若 HTTP 仍 200 返回完整业务页，说明边缘/CDN 或 Nginx 未强制跳转，必须修复。**
- 应用层会尽量移除 x-powered-by；Nginx 静态 location 也不要额外添加框架指纹头。
- Nitro 动态响应已统一返回 `X-Content-Type-Options: nosniff`、`Referrer-Policy`、framing/object 限制、Permissions Policy 和 `X-Request-Id`；Nginx 直接提供的 `/_nuxt/`、图标、manifest、Service Worker 和上传文件仍须在对应静态 location 添加等价安全头。
- 基线 CSP 已包含 `frame-ancestors 'none'`、`base-uri 'self'`、`object-src 'none'`、`form-action 'self'`（限制表单只提交到同源）。更完整的 `script-src`/`img-src` 等请先以 `Content-Security-Policy-Report-Only` 观察实际高德与 Nuxt 域名，再收紧并启用；不要为省事永久允许任意脚本域或 `unsafe-eval`。
- `/api/admin/**`、登录和纠错接口不得被代理缓存；对登录/纠错/搜索配置应用层和 Nginx 双层限流。
- 上传文件由应用生成安全文件名并校验类型；Nginx 不执行 uploads 中的脚本。
- HSTS 只在 HTTPS 和所有子域准备完成后开启，避免误锁域名。
  当 `NODE_ENV=production` 且 `NUXT_PUBLIC_SITE_URL`（或 `public.siteUrl`）为 `https://` 时，应用会自动下发 `Strict-Transport-Security: max-age=31536000; includeSubDomains`；仍建议在 Nginx 同步配置。
- **HSTS 去重（重要）**：应用（`server/utils/request-context.ts`，prod+HTTPS 时）会自动给所有动态/Nitro 响应下发 `Strict-Transport-Security`。因此反向代理动态请求的 `location @nuxt`（`proxy_pass http://127.0.0.1:3000`）**不要**再重复添加同一 HSTS 头，否则动态路由会返回两条重复 HSTS（值相同，浏览器取第一条、无害，但会触发安全扫描告警）。经应用代理的静态 location（如 `/_nuxt/`、`/icons/`、`/uploads/`、robots/sitemap 等，不经过应用）仍须自行添加该头，否则这些路径会缺失 HSTS。**验收要点：所有路由（`/`、`/map`、`/api/*`、`/robots.txt`、`/sitemap.xml`…）合并后应恰好返回 1 条 `Strict-Transport-Security`。** 现场已按此去重：删除 `@nuxt` 块内 HSTS 后动态路由由应用那份承担、静态路由由 Nginx 承担，全路由=1。
- **多 Nginx 实例注意**：本机部署了宝塔 Nginx（master 由 `/www/server/nginx/conf/nginx.conf` 启动，宿主 80/443 由它及其 worker 监听）与若干 `nginx -g daemon off` 的容器 Nginx 并存。修改宝塔站点 vhost 后，应通过**宝塔面板「重载配置」**可靠指向该 master；不要依赖 `/usr/bin/nginx -s reload`（默认配置路径可能重载到错误的实例）或直接看 `nginx -T`（读默认配置树，与生效配置不一定一致）。判定真正生效配置请用：`/www/server/nginx/sbin/nginx -T -c /www/server/nginx/conf/nginx.conf`。
- 生产环境必须配置 `NUXT_PUBLIC_SITE_URL` 和/或 `NUXT_ALLOWED_ORIGINS`；若写接口来源白名单为空，会返回 500 `ORIGIN_ALLOWLIST_EMPTY`（部署误配），而不是一律 403。
- 反向代理应强制 HTTP→HTTPS；可选设置 `NUXT_FORCE_HTTPS=true` 作为应用层兜底（不要替代 Nginx 证书终止）。`NITRO_HOST` 必须为 `127.0.0.1` 再考虑 `NUXT_TRUST_PROXY=true`。
- 部署后确认响应无 `X-Powered-By`（由全局中间件和响应钩子共同移除）；CSP 至少含 `form-action 'self'`。

上线后至少执行以下响应头冒烟检查；请求 ID 必须为受限格式，认证接口必须保持 `no-store`，页面不能允许第三方 framing：

```bash
curl -sSI https://example.edu.cn/ | grep -Ei 'x-request-id|x-content-type-options|referrer-policy|permissions-policy|content-security-policy|x-frame-options'
curl -sSI https://example.edu.cn/api/admin/auth/session | grep -Ei 'cache-control|pragma|x-request-id'
```

生产默认输出一行一个 JSON 的请求日志。`NUXT_REQUEST_LOGGING=false` 只允许在已经由受监控的上游访问日志完整替代时使用；无论是否关闭应用请求日志，数据库后台审计仍保留同一个请求 ID。运行时 `app/server/map` 源码禁止直接使用 `console.*`，服务端请求错误由统一结构化日志记录；维护脚本的 stdout/stderr 是命令行契约，不应与 systemd 应用日志混写。

## 6. 日常发布与回滚

每次发布使用新的时间戳 release，不在 `current` 内 `git pull`。建议顺序：

Gitee 制品插件的 `target` 不展开系统变量。流水线先下发到固定传输入口，再在文件锁内原子移入包含构建号的独占目录。解包后必须同时匹配完整提交号和 release 中的构建号；其他运行的制品即使提交号相同，也不能通过本次验收。

云端依赖缓存统一位于 `~/.cache/yeu-ci`，包含固定版本的 Node、pnpm、`pnpm-store` 和 `npm/_prebuilds`。`npm_config_cache` 指向该目录内的 `npm`，避免 SQLite 原生预编译包落入未恢复的默认缓存。依赖安装失败最多重试一次，复用已下载内容；安装后必须实际加载 SQLite，失败即停止发布。

源码认证仅在 Gitee 克隆阶段可用；YAML 的 `strategy.cloneDepth: 50` 保留近期提交，避免在构建容器依赖克隆凭证或下载完整历史。文档门禁比较公网 `/version.json` 的生产提交与本次完整提交，关闭重命名检测后，只有全部变更位于 `docs/`、`README.md` 或 `AGENTS.md` 才跳过依赖安装和应用构建。主机只验证文档制品身份，不备份数据库、不切换 release、不重启服务。生产基线读取失败、超出近期历史或无法获取时，仍执行完整检查；运行文件移入文档目录也必须发布。

1. 拉取固定 commit，记录 commit SHA；
2. `pnpm install --frozen-lockfile`，执行 lint、typecheck、test、build；
3. 创建 SQLite 在线一致性备份并验证；
4. 用候选制品执行数据库结构只读检查；缺列或约束不兼容时停止发布，单独演练迁移；
5. 仅在明确批准的维护窗口执行经过演练的迁移；自动发布不改结构或迁移账本；
6. 原子切换 `current` 软链接，`sudo systemctl restart yeu.service`；
7. 核验健康、核心路径和 `/version.json` 的完整提交号与 release；
8. 保留至少四个近期 release、当前与回滚版本及关联备份；脚本只生成保留计划，历史清理由明确批准的维护操作执行。

备份和迁移演练完成后，实际迁移、构建、切换和重启应显式复用 shared 环境。例如（时间戳按本次 release 调整）：

```bash
RELEASE=20260714-120000
cd "/www/wwwroot/yeu/releases/${RELEASE}"
export NUXT_ENV_FILE=/www/wwwroot/yeu/shared/.env
pnpm db:migrate
pnpm db:check
pnpm build
ln -sfn "/www/wwwroot/yeu/releases/${RELEASE}" /www/wwwroot/yeu/current
sudo systemctl restart yeu.service
```

SQLite 单实例采用短暂停机重启，不用 PM2 cluster 或重叠写入追求“零停机”；应用重启只通过 `systemctl restart yeu.service`。

代码回滚可以把 `current` 指向上一 release 并重启；数据库不能假设可随代码自动降级。每个迁移必须说明旧代码是否仍兼容：

- 兼容的新增字段/表：可先回滚代码，保留数据库结构；
- 破坏性迁移：使用扩展-收缩分两次发布；
- 已发生错误写入：停止写入，从迁移前备份恢复到新文件，验证后再切换路径。恢复会丢失备份后的变更，必须先导出并人工评估。

## 7. SQLite 迁移与运行参数

连接初始化至少设置：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

要求：

- migration 文件进入 Git 且只追加，生产只运行版本化 migration；
- 大表变更拆分为短步骤，避免长事务阻塞公开读取；
- 迁移前后执行 `PRAGMA foreign_key_check;`，备份上执行 `PRAGMA integrity_check;`；
- 不通过复制正在运行的 `.sqlite`、`-wal`、`-shm` 文件制作备份；使用 SQLite `.backup` API/CLI；
- 不把数据库放在网络文件系统或同步盘；监控数据库、WAL 和磁盘空间。

## 8. 备份与恢复

最低备份范围：SQLite、`shared/uploads`、生产环境变量/密钥的独立加密备份，以及能定位代码的 commit SHA。构建产物可从 Git 重建，无需作为唯一备份。

优先使用仓库自带、经过测试的在线一致性备份命令：

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
pnpm db:backup \
  --database /www/wwwroot/yeu/shared/data/yeu.sqlite \
  --output /www/wwwroot/yeu/shared/backups/yeu-${STAMP}.sqlite
```

该命令使用 SQLite online backup API，先写同目录临时文件，验证 `integrity_check`、`foreign_key_check`、文件大小和 SHA-256 后再原子改名，并生成同名 `.json` 元数据。它拒绝覆盖已有文件以及写入 `public/`、`.output/public/`、`storage/uploads/`。备份与元数据随后可作为同一归档加密压缩；压缩后还应记录归档自身哈希。

制品附带 `deploy/release-tools.mjs`，无需生产安装 pnpm。设置 `YEU_NODE` 为目标 Node 路径，`YEU_BASE` 为应用根目录，`YEU_CANDIDATE` 为候选 release 目录，再使用以下检查：

```bash
TOOLS="$YEU_CANDIDATE/.output/deploy/release-tools.mjs"
MIGRATIONS="$YEU_CANDIDATE/.output/deploy/migrations"
"$YEU_NODE" "$TOOLS" db-check "$YEU_BASE/shared/data/yeu.sqlite" "$MIGRATIONS"
"$YEU_NODE" "$TOOLS" backup-verify "$BACKUP_FILE"
"$YEU_NODE" "$TOOLS" retention-plan "$YEU_BASE" 4
```

`db-check` 只读核对业务表、列、默认值、唯一约束、外键、FTS 分词器与已有迁移哈希。`pendingLedger` 大于零且结构检查通过，表示结构与制品一致，但账本仍缺记录；不能直接重放历史 SQL。`db-baseline` 只补齐已验证的手工迁移记录，`db-migrate` 只执行向前且保留旧结构兼容性的迁移；两者均是生产写操作，必须先备份、在副本上演练并取得明确批准。它们不由自动发布调用。

`backup-verify` 恢复到独立私有临时目录，核对源与恢复文件 SHA-256、完整性和外键，完成后删除本次临时副本。返回的耗时只代表数据库副本恢复验证，不能代替应用恢复的 RTO。`retention-plan` 保护近期、当前、回滚和关联备份，只列候选文件；必须先完成异机副本校验和恢复验证，再确认具体清理清单。不得清理其他项目共用的部署根目录。

已有异机 SSH 备份目录时，可将已完成的加密归档同步过去，例如 `rsync --checksum --partial --protect-args "$ENCRYPTED_ARCHIVE" "$BACKUP_DESTINATION/"`。同步后在目标机器核对归档 SHA-256，并从异机归档执行隔离恢复。没有真实目的地、远端哈希和恢复结果时，异机备份仍是待完成项。

保留建议：最近 7 个每日、4 个每周、6 个每月版本；本机备份之外至少有一份异机/对象存储加密副本。备份任务失败必须通知，不能只依赖宝塔显示“计划任务已执行”。

恢复演练至少每季度一次：

1. 停止写入并保留当前数据库副本；
2. 解压到新文件，不覆盖原库；
3. 核对备份 JSON 哈希，运行完整性、外键检查和 `pnpm data:verify --database <恢复文件>`；
4. 用临时 `NUXT_DATABASE_PATH` 启动隔离实例；
5. 验证地图地点、指南、管理员登录、发布/下线和媒体引用；
6. 确认无误后原子切换数据库路径并记录恢复点、耗时与数据损失窗口。

## 9. 监控与日志

- `/api/health` 返回数据库与生产配置就绪状态，不返回路径、Key、密钥或表数据。生产模式要求：`NUXT_PUBLIC_SITE_URL` 是 HTTPS、地图 provider 为 `amap` 且 Key/安全密钥非空、`NUXT_ADMIN_SESSION_SECRET` 至少 32 字节；任一条件不满足或数据库不可读时返回 HTTP `503`。
- 配置问题通过稳定问题码报告：`site_url_invalid`、`site_url_https_required`、`admin_session_secret_missing`、`amap_key_missing`、`amap_security_code_missing`、`development_map_provider_in_production` 或 `map_provider_invalid`。健康时应为 `status: ok`、`database: ready`、`configuration: ready` 且 `issues` 为空。
- 外部监控每分钟检查首页、健康端点和 HTTPS；高德地图以前端错误率/配额告警监控，不让外部 SDK 故障拖垮健康端点。
- 仓库提供 `pnpm ops:monitor`，用于组合检查健康端点、SQLite/WAL、磁盘、内存、系统负载和最近一次备份。生产 `.env` 必须使用 shared 目录的绝对路径，例如：

```bash
NUXT_MONITOR_HEALTH_URL=http://127.0.0.1:3000/api/health
NUXT_MONITOR_BACKUP_DIR=/www/wwwroot/yeu/shared/backups
NUXT_MONITOR_REQUEST_LOG_PATH=/www/wwwroot/yeu/shared/logs/app-out.log
NUXT_MONITOR_STATE_PATH=/www/wwwroot/yeu/shared/monitor/production-monitor-state.json
NUXT_MONITOR_WEBHOOK_URL=https://alerts.example.invalid/yeu
NUXT_MONITOR_LABEL=yeu-production
NUXT_MONITOR_LOG_WINDOW_MINUTES=15
NUXT_MONITOR_MAX_SERVER_ERRORS=0
NUXT_MONITOR_MAX_LOGIN_FAILURES=4
NUXT_MONITOR_MAX_RATE_LIMITED=0
```

  `NUXT_MONITOR_REQUEST_LOG_PATH` 必须指向 shared 非公开绝对路径，不能指向包含环境变量、数据库输出或用户内容的混合调试日志。Webhook 地址必须是无内嵌账号密码的 HTTPS URL；发送前会再解析 DNS 并拒绝落到私网/元数据地址（防 DNS rebinding）。通知只包含故障码与聚合指标；首次故障、故障集合变化、超过提醒间隔和恢复会发送，相同状态在间隔内不会重复发送。若不配置 webhook，命令仍在异常时返回非零，必须让宝塔计划任务或 cron 对非零状态告警。
- 每分钟运行监控命令，日志写入 shared 非公开目录。实际 `pnpm` 绝对路径以 `command -v pnpm` 为准，不依赖交互式 shell 的 PATH：

```cron
* * * * * cd /www/wwwroot/yeu/current && set -a && . /www/wwwroot/yeu/shared/.env && set +a && /usr/local/bin/pnpm --silent ops:monitor >> /www/wwwroot/yeu/shared/logs/monitor.log 2>&1
```

  首次启用时应临时将健康 URL 指向不可达端口验证 `unhealthy` 通知，再恢复正确地址验证 `recovery`；同时确认 webhook 接收端和 monitor 日志均未出现路径、密钥或用户数据。默认阈值为备份 26 小时、磁盘至少 5 GiB 且 15%、WAL 最大 256 MiB、可用内存至少 10%、单 CPU 一分钟负载不高于 2；请求指标默认检查最近 15 分钟，任一 5xx、任一 429 或超过 4 次管理员登录 401 即告警，可按机器容量通过 `NUXT_MONITOR_*` 调整。
- `yeu.service` 的应用日志指向 `NUXT_MONITOR_REQUEST_LOG_PATH`，错误日志单独存放；两者启用轮转并限制磁盘。结构化请求日志包含时间戳、请求 ID、路由、状态和耗时，不记录 Cookie、密码、查询串、完整纠错联系方式或精确用户定位。监控最多读取日志尾部 4 MiB；若该尾部不能覆盖完整时间窗，会返回 `request_log_window_incomplete`，此时必须缩短轮转周期、增加轮转频率或缩短监控时间窗，不能忽略。
- 在宝塔计划任务中每日运行一次 `pnpm feedback:cleanup`，清除到期的反馈网络标识、联系方式和记录；执行失败应进入运维告警。
- 校园热度索引每天 07:00 由 `yeu-signal.timer` 重建（`ops/systemd/yeu-signal.service`，排在 03:40 的 `yeu-knowledge-crawl.timer` 抓取之后），一次跑完索引、日报与周报/月报。两个单元都跑在 `/opt/yeu-signal`（独立 `node_modules`），代码用 `bash scripts/sync-signal-runtime.sh` 从本仓库同步；发布包不含脚本，别指望 `/www/wwwroot/yeu/repo` 里能跑。启用方法与排错见 [SIGNAL.md](SIGNAL.md#6-命令与调度)；单元失败时 `systemctl is-failed yeu-signal.service` 返回非零，接入现有告警。
- 监控 CPU、内存、磁盘、inode、数据库/WAL 大小、备份最近成功时间、5xx、登录失败和纠错滥用。
- 管理员发布、下线、坐标修改和来源变更写入数据库审计日志，不能只依赖 systemd 文本日志。

## 10. 发布验收

- [ ] `pnpm install --frozen-lockfile`、lint、typecheck、test、build 和 migration 全部成功。
- [ ] 服务器 Node/pnpm 与仓库要求一致，`yeu.service` 只有一个非 root 实例且已启用；没有同端口 PM2 进程。
- [ ] 数据库、uploads、备份和 `.env` 位于 shared 目录，权限最小化且不可经 URL 下载。
- [ ] HTTPS、证书续期、反向代理真实 IP、上传上限和安全响应头正确。
- [ ] 生产 `/api/health` 返回 HTTP 200、`status=ok`、`database=ready`、`configuration=ready` 且 `issues=[]`；不能忽略带问题码的 503。
- [ ] `pnpm ops:monitor` 已由生产计划任务每分钟执行，故障与恢复通知均完成受控演练，状态文件和日志位于 shared 非公开目录。
- [ ] 生产地图为高德，Key 已绑定域名；GCJ-02 标点抽样核对，地图失败时文字内容仍可访问。
- [ ] 首页、地图、地点详情、报到流程、校园卡/网络、快递外卖、社团页面在手机和微信内浏览器通过。
- [ ] PWA manifest、图标、Service Worker 更新和离线降级可用；`sw.js` 未被长缓存，后台/API 写请求不缓存。
- [ ] `/admin/field-observations` 仅在 HTTPS 或 localhost 使用；真机完成定位授权、3 个以上样本、IndexedDB 弱网暂存、恢复同步和独立审核，精度差于 25 米的观测不能批准。
- [ ] 后台未登录不可访问，Cookie 安全属性、CSRF、限流和上传校验有效。
- [ ] 数据库迁移前备份已完成并通过完整性检查，回滚条件和负责人明确。
- [ ] 从异机备份恢复的演练成功，恢复结果有日期、耗时和验证记录。
