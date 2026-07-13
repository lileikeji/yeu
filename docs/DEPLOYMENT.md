# 宝塔 Linux 部署与运维

> 目标拓扑：Nginx -> PM2 单实例 -> Nuxt/Nitro -> SQLite
> 目标仓库：`https://gitee.com/lilei1529/yeu`
> 状态：部署基线。当前仓库已加入 Drizzle/SQLite 迁移与初始化脚本、单管理员认证和 PWA；PM2/Nginx 配置仍需在取得宝塔服务器信息后按实际域名和目录落地。

## 1. 生产原则

- 推荐 Node.js 22 LTS，并在部署前以 `package.json` 和 Nuxt 当前版本的 engines 要求复核；pnpm 使用仓库声明的 10.28.1 版本。
- 应用进程使用独立低权限 Linux 用户运行，不使用 root；Nginx 只读静态文件和公开上传目录。
- SQLite 只由一个 PM2 实例写入，禁止 PM2 cluster/多实例。扩展为多实例前先迁移到服务型数据库。
- 代码版本、持久化数据库、上传文件、环境变量和备份分离；新版本发布不得覆盖持久化数据。
- 生产只用高德 JS API 2.0；MapLibre/公共 OSM 瓦片仅用于开发或低流量预览。
- 所有结构变更通过已提交的 Drizzle migration，生产禁止直接 `push` schema。

## 2. 服务器准备

宝塔中安装 Nginx、Node.js 22 LTS、PM2、Git，并启用 HTTPS 证书自动续期。SQLite CLI 用于一致性备份和恢复检查。若采用原生 SQLite Node 驱动，还需按驱动安装说明准备编译工具或兼容的预编译二进制。

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
| `NUXT_FEEDBACK_IP_RETENTION_DAYS` | `30`，反馈限流网络摘要保留期 | 否 |
| `NUXT_FEEDBACK_CONTACT_RETENTION_DAYS` | `90`，已处理反馈联系方式保留期 | 否 |
| `NUXT_FEEDBACK_RECORD_RETENTION_DAYS` | `730`，反馈记录最长保留期 | 否 |
| `NUXT_ADMIN_USERNAME` | 首次初始化或轮换时使用，默认 `admin` | 否 |
| `NUXT_ADMIN_PASSWORD` | 仅初始化命令的临时输入，至少 12 个字符；生产不长期写入 `.env` | 否 |
| `NUXT_ADMIN_PASSWORD_HASH` | 推荐的初始化/轮换输入；由 `pnpm db:hash-password` 生成 | 否 |

高德 JS Key 和安全密钥不可当作真正秘密，因为浏览器必须接收它们；安全性依赖域名白名单、配额和告警。会话密钥、管理员初始化凭据不得使用 `NUXT_PUBLIC_` 前缀。`NUXT_UPLOAD_DIR`、`NUXT_AMAP_WEB_SERVICE_KEY`、`NUXT_LOG_LEVEL` 等尚未被当前代码消费的预留名不属于现行生产契约，相关能力实现后再加入 `.env.example` 和本表。

`.env` 不提交仓库、不放进前端构建产物、不打印到 CI/PM2 日志。通过宝塔 PM2 环境变量界面或受限部署会话注入变量；变更 public runtime config 后也执行完整构建和回归检查。

仓库内的 TypeScript 维护脚本支持用 `NUXT_ENV_FILE` 显式选择环境文件，且 Shell 已有变量优先；这个变量不作用于 Nuxt 构建、Nitro 或 PM2，不能替代生产发布会话的环境注入。生产迁移、构建和 PM2 启动/重启前，都应在同一个受限 Shell 会话中用 `set -a` + `source /www/wwwroot/yeu/shared/.env` 导出 shared 环境，并核对 `NUXT_DATABASE_PATH`，防止命令静默落到 release 内的 `./data/yeu.sqlite`。

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
ln -sfn /www/wwwroot/yeu/releases/20260713-180000 /www/wwwroot/yeu/current
```

`pnpm db:init` 是首次部署必需步骤：它创建唯一管理员，且没有初始化凭据时会直接失败。生产优先在受限部署会话中临时注入 `NUXT_ADMIN_PASSWORD_HASH`；若临时使用 `NUXT_ADMIN_PASSWORD`，长度必须至少为 12 个字符。初始化成功后立即从 shared `.env` 和当前 Shell 清除 `NUXT_ADMIN_PASSWORD`/`NUXT_ADMIN_PASSWORD_HASH`，日常发布只执行 `db:migrate`，不重复初始化管理员。不得把示例账号、明文密码或密码哈希提交到仓库、发布记录和日志。

首批公开目录入库是可选的首次建库步骤，静态回退不依赖它。需要让后台接管目录时，在 `db:migrate` 后、`build` 前单独执行：

```bash
pnpm db:seed:catalog
pnpm db:seed:catalog -- --apply
```

第一条命令默认只读，只报告预计新增、跳过和冲突；确认无冲突后才执行第二条。已有人工内容的生产库不应把 `--apply` 作为无审查的日常发布步骤。脚本遇到来源 URL 或内容标识冲突会整批停止。

公开目录完成后，以同样的预检/应用顺序导入结构化报到流程：

```bash
pnpm db:seed:procedures
pnpm db:seed:procedures -- --apply
```

流程脚本要求关联部门、指南和来源已存在；人工同名流程会使整批操作停止。生产更新前先备份数据库，并核对预检中的新增/更新数量。

`pnpm check` 统一执行 lint、类型检查、全部 `scripts/*.test.ts` 测试、生产构建和 Service Worker 产物断言。发布记录仍须明确列出浏览器验收范围。迁移前创建一致性备份；首次建库也要确认目录权限、外键和 WAL 设置。

首次启动（示意）：

```bash
set -a
source /www/wwwroot/yeu/shared/.env
set +a
test "$NUXT_DATABASE_PATH" = "/www/wwwroot/yeu/shared/data/yeu.sqlite"
pm2 start /www/wwwroot/yeu/current/.output/server/index.mjs \
  --name yeu \
  --cwd /www/wwwroot/yeu/current \
  --interpreter node \
  --time
pm2 save
pm2 startup
```

执行 `pm2 startup` 后按其输出、以有权限的管理员完成一次系统级命令。确认重启服务器后 PM2 能恢复，但不要把数据库路径或密钥写入公开的 ecosystem 文件。应用只监听 `127.0.0.1`，不直接暴露 Node 端口。

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
pnpm db:init -- --reset-admin
unset NUXT_ADMIN_PASSWORD_HASH NEW_ADMIN_HASH

pm2 restart yeu --update-env
```

`--reset-admin` 在一个数据库事务中更新密码哈希、重新启用管理员并撤销该管理员的全部旧会话，不需要再手工修改 `admin_sessions`。完成后用新密码登录一次，确认旧浏览器会话已失效，并在受限运维记录中写明轮换时间、执行人和备份位置，不记录密码或哈希。

若会话密钥疑似泄露，应生成新的至少 32 字节 `NUXT_ADMIN_SESSION_SECRET`、更新 shared `.env` 并重启应用；密钥变化会使所有现有会话 token 无法通过校验。随后检查 `/api/health` 并重新登录。不要把日常密码轮换和会话密钥轮换混为同一步骤。

## 5. Nginx 配置要点

在宝塔站点中配置域名和证书，反向代理到 `127.0.0.1:3000`。以下片段需合并到宝塔生成的 server 块，不能覆盖证书续期配置：

```nginx
client_max_body_size 10m;

location /_nuxt/ {
    root /www/wwwroot/yeu/current/.output/public;
    try_files $uri @nuxt;
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location = /sw.js {
    root /www/wwwroot/yeu/current/.output/public;
    add_header Cache-Control "no-cache";
}

location = /site.webmanifest {
    root /www/wwwroot/yeu/current/.output/public;
    add_header Cache-Control "no-cache";
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
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
}
```

补充要求：

- HTTP 强制跳转 HTTPS；证书链、自动续期和 TLS 1.2/1.3 通过检查。
- 增加 `X-Content-Type-Options: nosniff`、合理的 `Referrer-Policy` 和页面 framing 限制。
- CSP 先以 `Content-Security-Policy-Report-Only` 观察实际高德域名，再收紧并启用；不要为省事永久允许任意脚本域或 `unsafe-eval`。
- `/api/admin/**`、登录和纠错接口不得被代理缓存；对登录/纠错/搜索配置应用层和 Nginx 双层限流。
- 上传文件由应用生成安全文件名并校验类型；Nginx 不执行 uploads 中的脚本。
- HSTS 只在 HTTPS 和所有子域准备完成后开启，避免误锁域名。

## 6. 日常发布与回滚

每次发布使用新的时间戳 release，不在 `current` 内 `git pull`。建议顺序：

1. 拉取固定 commit，记录 commit SHA；
2. `pnpm install --frozen-lockfile`，执行 lint、typecheck、test、build；
3. 创建 SQLite 在线一致性备份并验证；
4. 在与生产数据结构兼容的环境演练迁移；
5. 运行只向前的生产迁移；
6. 原子切换 `current` 软链接，`pm2 restart yeu --update-env`；
7. 执行健康检查和核心路径冒烟测试；
8. 保留至少前两个可运行 release，再按策略清理旧版本。

备份和迁移演练完成后，实际迁移、构建、切换和重启应显式复用 shared 环境。例如（时间戳按本次 release 调整）：

```bash
RELEASE=20260714-120000
cd "/www/wwwroot/yeu/releases/${RELEASE}"
set -a
source /www/wwwroot/yeu/shared/.env
set +a
test "$NUXT_DATABASE_PATH" = "/www/wwwroot/yeu/shared/data/yeu.sqlite"
pnpm db:migrate
pnpm db:check
pnpm build
ln -sfn "/www/wwwroot/yeu/releases/${RELEASE}" /www/wwwroot/yeu/current
pm2 restart yeu --update-env
```

SQLite 单实例采用短暂停机重启，不用 PM2 cluster 或重叠写入追求“零停机”。

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

运行中 SQLite 的一致性备份示例：

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
sqlite3 /www/wwwroot/yeu/shared/data/yeu.sqlite \
  ".backup '/www/wwwroot/yeu/shared/backups/yeu-${STAMP}.sqlite'"
sqlite3 /www/wwwroot/yeu/shared/backups/yeu-${STAMP}.sqlite \
  "PRAGMA integrity_check; PRAGMA foreign_key_check;"
gzip /www/wwwroot/yeu/shared/backups/yeu-${STAMP}.sqlite
```

保留建议：最近 7 个每日、4 个每周、6 个每月版本；本机备份之外至少有一份异机/对象存储加密副本。备份任务失败必须通知，不能只依赖宝塔显示“计划任务已执行”。

恢复演练至少每季度一次：

1. 停止写入并保留当前数据库副本；
2. 解压到新文件，不覆盖原库；
3. 运行完整性、外键检查和关键表数量核对；
4. 用临时 `NUXT_DATABASE_PATH` 启动隔离实例；
5. 验证地图地点、指南、管理员登录、发布/下线和媒体引用；
6. 确认无误后原子切换数据库路径并记录恢复点、耗时与数据损失窗口。

## 9. 监控与日志

- `/api/health` 返回数据库与生产配置就绪状态，不返回路径、Key、密钥或表数据。生产模式要求：`NUXT_PUBLIC_SITE_URL` 是 HTTPS、地图 provider 为 `amap` 且 Key/安全密钥非空、`NUXT_ADMIN_SESSION_SECRET` 至少 32 字节；任一条件不满足或数据库不可读时返回 HTTP `503`。
- 配置问题通过稳定问题码报告：`site_url_invalid`、`site_url_https_required`、`admin_session_secret_missing`、`amap_key_missing`、`amap_security_code_missing`、`development_map_provider_in_production` 或 `map_provider_invalid`。健康时应为 `status: ok`、`database: ready`、`configuration: ready` 且 `issues` 为空。
- 外部监控每分钟检查首页、健康端点和 HTTPS；高德地图以前端错误率/配额告警监控，不让外部 SDK 故障拖垮健康端点。
- PM2 日志启用轮转并限制磁盘；日志包含请求 ID、路由、状态和耗时，不记录 Cookie、密码、完整纠错联系方式或精确用户定位。
- 在宝塔计划任务中每日运行一次 `pnpm feedback:cleanup`，清除到期的反馈网络标识、联系方式和记录；执行失败应进入运维告警。
- 监控 CPU、内存、磁盘、inode、数据库/WAL 大小、备份最近成功时间、5xx、登录失败和纠错滥用。
- 管理员发布、下线、坐标修改和来源变更写入数据库审计日志，不能只依赖 PM2 文本日志。

## 10. 发布验收

- [ ] `pnpm install --frozen-lockfile`、lint、typecheck、test、build 和 migration 全部成功。
- [ ] 服务器 Node/pnpm 与仓库要求一致，PM2 只有一个 `yeu` 实例且非 root 运行。
- [ ] 数据库、uploads、备份和 `.env` 位于 shared 目录，权限最小化且不可经 URL 下载。
- [ ] HTTPS、证书续期、反向代理真实 IP、上传上限和安全响应头正确。
- [ ] 生产 `/api/health` 返回 HTTP 200、`status=ok`、`database=ready`、`configuration=ready` 且 `issues=[]`；不能忽略带问题码的 503。
- [ ] 生产地图为高德，Key 已绑定域名；GCJ-02 标点抽样核对，地图失败时文字内容仍可访问。
- [ ] 首页、地图、地点详情、报到流程、校园卡/网络、快递外卖、社团页面在手机和微信内浏览器通过。
- [ ] PWA manifest、图标、Service Worker 更新和离线降级可用；`sw.js` 未被长缓存，后台/API 写请求不缓存。
- [ ] `/admin/field-observations` 仅在 HTTPS 或 localhost 使用；真机完成定位授权、3 个以上样本、IndexedDB 弱网暂存、恢复同步和独立审核，精度差于 25 米的观测不能批准。
- [ ] 后台未登录不可访问，Cookie 安全属性、CSRF、限流和上传校验有效。
- [ ] 数据库迁移前备份已完成并通过完整性检查，回滚条件和负责人明确。
- [ ] 从异机备份恢复的演练成功，恢复结果有日期、耗时和验证记录。
