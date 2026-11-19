# 发布规则与已发生事故

本文件记录发布链路上**必须遵守的动作**和**已经踩过的坑**。每条事故都对应一次真实发布失败或线上缺功能，改动发布流程时先读这里。

发布基线细节见 [DEPLOYMENT.md](../DEPLOYMENT.md)，每次发布的记录见 [DEPLOY_NOTES_2026-09-04-qa-cards.md](../DEPLOY_NOTES_2026-09-04-qa-cards.md)。

## 一、发布检查单

按顺序执行，每一步都有对应的核对动作。

1. **基线含 master**
   构建前确认：`git merge-base --is-ancestor github/master <构建commit>`（A 必须是 master，B 才是构建提交；写反会把老提交判成通过）。不成立就先 `git merge github/master` 再构建。
   核对：`git log --oneline <commit>..master` 输出为空。
2. **自带测试清零**
   `pnpm run test` 与 `npx nuxt typecheck` 都必须 exit 0。
   核对：测试输出里 `fail 0`，typecheck 无 `error TS`。
3. **在干净工作树构建**
   主工作区常有别的会话未提交的改动，构建放在独立工作树里做：

   ```bash
   git worktree add /e/yeu-build-<sha> <commit> --detach
   cmd /c mklink /J "E:\yeu-build-<sha>\node_modules" "E:\yeu\node_modules"
   cd /e/yeu-build-<sha>
   DEPLOY_SERVER=root@124.221.145.182 SSH_KEY=C:\Users\15294\.ssh\tencent_yeu.pem bash scripts/build-linux-artifact.sh
   ```

4. **发布前做数据库体检**
   `sqlite3 /data/yeu/shared/data/yeu.sqlite "PRAGMA foreign_key_check;"` 必须无输出。
5. **现打 tar、强制新快照**

   ```bash
   cd /root/yeu-deploy/build && tar -czf /root/yeu-deploy/bundle-<时间>.tar.gz .output
   BACKUP_FRESH=1 bash /data/yeu-build/deploy-incoming.sh /root/yeu-deploy/bundle-<时间>.tar.gz
   ```

6. **发布后三处核对**
   - `readlink -f /data/yeu/current` 指向新 release
   - `curl -s https://yx.huiliyill.cn/version.json` 的 `commit` 等于构建 commit
   - `node .output/deploy/release-tools.mjs db-check <db> .output/deploy/migrations` 返回 `{"applied":0,"pendingLedger":0}`
7. **清理工作树**（顺序不能反）

   ```bash
   cmd /c rmdir "E:\yeu-build-<sha>\node_modules"   # 只删目录联接，不要加 /s
   git worktree remove --force /e/yeu-build-<sha>
   git worktree prune
   ```

8. **静态资源真的进了 CDN，并且预热过**
   第一次请求 `curl -sI https://yx.huiliyill.cn/_nuxt/<最新 chunk>.js` 应当是 `Cache Miss`，第二次必须 `X-Cache-Lookup: Cache Hit` 且 `Age` 递增；`Cache-Control` 里不能再出现 `no-store`。
   出现 `no-store` 就先查权限：`sudo -u www test -r /www/wwwroot/yeu/current/.output/public/_nuxt/<file>` 必须可读。
   预热由发布链路自动完成：`/data/yeu/server-side-deploy.sh` 在放开静态资源权限后调用 `warmCdn`，把当前 release 的全部 `_nuxt` 资源从边缘拉一遍并打印 `200=… 非200=…`（约 16 秒）。源站 no-store 的 `robots.txt`、`site.webmanifest`、`sw-*.js` 不预热。
   手动补跑（本机，扫远端 current）：`DEPLOY_SERVER=root@<host> SSH_KEY=~/.ssh/key bash scripts/warm-cdn.sh`；命中率低于 95% 脚本退出码 1。

## 二、已发生事故

### 1. 部署基线旧于 master，线上像「PR 被回退」（2026-11-12）

- 现象：线上 commit 是分支上的 `d7731a1d`，master 已到 `4c5392bc`。顶栏搜索按钮居中、`ASSISTANT_CACHE_VERSION` v86、移动端滑动标点不再误开详情这三处线上都没有。
- 原因：分支父链是 `684fca98`，从没合过 master，用分支 HEAD 构建就等于用旧基线发版。
- 做法：构建前跑 `git merge-base --is-ancestor github/master <构建commit>`；不成立先 merge master，用 merge commit 构建。

### 2. 删除工作树时掏空主仓 node_modules（2026-11-12）

- 现象：`cmd /c rmdir /s /q E:\yeu-build` 之后，`E:\yeu\node_modules\.bin` 消失，`pnpm` 报 `ENOENT ... @babel/parser/package.json`。
- 原因：工作树的 `node_modules` 是指向主仓的目录联接，`/s` 会顺着联接删掉目标内容。
- 做法：清理只删联接点，不加 `/s`；恢复用 `pnpm install --force`（约 35 秒，`.bin` 回到 33 项）。

### 3. 外键孤儿行让部署卡在「数据库外键检查失败」（2026-11-12）

- 现象：`deploy-incoming.sh` 日志里 `数据库外键检查失败`，`EXIT=1`，current 没切换。
- 原因：跑 E2E 用的临时管理员 `e2e-temp-admin-0001` 删除后，它写的 8 条 `audit_logs` 变成孤儿行（`actor_admin_id` 指向不存在的管理员）。
- 做法：发布前跑 `PRAGMA foreign_key_check;`；删除后台账号时连带清掉它留下的审计行，或把 `actor_admin_id` 置空。

### 4. 同名 release 禁止重部署，前台只看到 `EXIT=1`（多次）

- 现象：发布命令只打印 `EXIT=1`，没有别的原因。
- 原因：失败重试复用了同一个 release 名，`server-side-deploy.sh` 判「release 已存在」直接退出；脚本输出重定向到日志，前台看不到。
- 做法：重试必须换标识——改 `/root/yeu-deploy/build/.output/release.json` 的 `release` 字段（commit、retrieval、native 保持不变），重新 `tar` 再发。真实失败原因看 `/data/yeu/shared/logs/deploy-incoming-*.log` 最后 30 行。

### 5. 复用旧快照导致冒烟 503（2026-11-09）

- 现象：冒烟端口 `/api/health` 返回 `{"status":"unavailable","database":"not_initialized_or_unreachable"}`。
- 原因：`deploy-home-sheet.sh` 复用了 24 小时内的旧备份快照，库里没有新加的 `current_entry_id` 列，新代码查询直接抛错。
- 做法：发布一律带 `BACKUP_FRESH=1`。

### 6. 种子清单在 Windows 上因行尾变红（2026-11-12）

- 现象：`seed manifest matches data/seeds contents` 失败，提示 `ding-route-chain.json`、`osm-campus-boundary.json` 不一致，字节数 3684 / 3912 来回跳。
- 原因：仓库 `core.autocrlf=true`，Windows 检出把种子 JSON 写成 CRLF，逐行多一个 `\r`，清单里的 `bytes` 与 `sha256` 全部对不上；master 里那份清单是 LF 下算的。
- 做法：`.gitattributes` 固定 `data/seeds/*.json text eol=lf`；改种子后跑 `node scripts/seed-manifest.mjs write` 并提交清单。

### 7. 手工补迁移必须补账本（多次）

- 现象：`db-check` 报 `pendingLedger` 非 0，或新列不存在导致运行期报错。
- 原因：迁移 SQL 用 sqlite3 手工执行了，但没往 `__drizzle_migrations` 写账本行。
- 做法：账本行的 `hash` = 迁移 SQL **原始字节**的 sha256，`created_at` = `server/database/migrations/meta/_journal.json` 里该条目的 `when`；写前用已知迁移（如 0047 的 `99caf6a4…`）对账。

### 8. 静态资源目录 750，CDN 一个 chunk 都缓存不了（2026-11-14）

- 现象：`/_nuxt/*.js` 每次请求都是 `X-Cache-Lookup: Cache Miss`、`Age: 0`，响应里同时有 `public, max-age=31536000, immutable` 和 `no-cache, no-store, must-revalidate`，首屏要把十几个 chunk 从 3Mbps 出口重新拉一遍。
- 原因：`releases/<rel>/.output/public` 与 `_nuxt` 是 `drwxr-x--- yeu yeu`，nginx worker 跑在 `www` 下读不到文件；`try_files` 落到 `@nuxt_compat` → `@nuxt` 反代给 Node。Nitro 发的 immutable 与 `@nuxt` 的 `no-store` 叠在一起，CDN 按最严格的来，等于完全不缓存。
- 做法：发布后放开读权限，`server-side-deploy.sh` 已内置这一步：

  ```bash
  chmod o+rx "$BASE/releases/$RELEASE_ID" "$BASE/releases/$RELEASE_ID/.output"
  chmod -R o+rX "$BASE/releases/$RELEASE_ID/.output/public"
  ```

  核对：`sudo -u www test -r .../_nuxt/<file>` 返回 0；线上第二次请求 `X-Cache-Lookup: Cache Hit`。

### 9. 线上跑的是功能分支，部署 master 等于回退功能（2026-11-10 / 2026-11-15）
线上 `current` 指向的 release 记录的 commit 不在 master 里时，用 master 构建并切换会把该分支上的功能整体顶回去：11-10 主题配色被隔壁会话的脏树产物覆盖（palette CSS 直接消失），11-15 线上跑着叫号台/十分制/去掉最高最低分那条线，若照旧部署 master 会一次性回退 10 个提交。
落地做法：部署前 `cat /www/wwwroot/yeu/current/.output/release.json` 取 commit，`git merge-base --is-ancestor <commit> master` 不成立就先把 master 合进该分支，用合并后的提交构建。

### 10. 本机构建一度不可用（2026-11-11 起，2026-11-16 已修复）
`npx nuxt build` 曾稳定失败 `[nitro] ERROR Error: remove D:\DevTemp\esbuild-<hex>: Access is denied.`，最小复现为 esbuild 用 stdin 传 2.5MB 源码时删不掉临时文件；换 Node 22/26、esbuild 0.18–0.28 都复现，当时判定为环境级限制，改为推 `deploy/theme-on-competition` 触发 `build-artifact.yml` + `gh run download -n output` 出制品。
2026-11-16 定位到根因是 esbuild `transform` 输入超 1 MiB 时落临时文件、收尾删除失败，`patches/esbuild@0.28.2.patch` 已修复（细节见文末「本机构建报 esbuild 临时目录删除失败」），本机 `pnpm install` 后 `ALLOW_LOW_SPEC_BUILD=1 pnpm build` 可正常产出 `.output/server/index.mjs`。制品仍统一走 CI：生产是 Linux + node 22 目标，本机 win32 产物不能直接上线，且 CI 顺带跑完测试与 e2e。

### 11. 检索哈希按行尾算，CRLF 工作树会假报「未 bump」（2026-11-11 / 2026-11-13）
`release-tools.mjs checkRetrieval` 用文件字节算 hash：`core.autocrlf=true` 的工作树算出 `d7978e91…`，LF 工作树算出 `8c3787f2…`，与线上一致的是后者。命令必须在 LF 工作树（或 Linux CI）里跑，否则会被「检索代码已变更但 ASSISTANT_CACHE_VERSION 未 bump」拦下，且改的是假问题。

### 12. 并发发版互相顶掉（2026-11-18 一夜四次）

- 现象：我 23:15 发了 `e4589ded`，23:05 别人发了 `9163e746`，两边都以为自己是最新；`current` 只指向一个 release，谁最后切换谁生效，先发的那份功能就等于被删。
- 根因：判断「线上是什么」和「切换」之间有时间窗，且部署脚本不校验「线上 commit 在不在我这份制品的祖先链里」。
- 落地做法（已进脚本）：`scripts/release-tools.mjs` 把 `git rev-list <commit>` 写进 `release.json` 的 `history`；`scripts/deploy-incoming.sh` 切换前比对线上 `commit` 是否在 `history` 里，不在就 `exit 1` 并打印「拒绝部署：线上正在跑 X，它不在本次制品的祖先链里」。确实要回退旧版时设 `ALLOW_REVERT=1`。旧制品没有 `history` 字段时只告警放行。
- 处置流程：被拦下就把线上 commit `git merge` 进主线、重出制品再发，别用 `ALLOW_REVERT` 绕过。

### 13. OSV 上游新收录公告导致 `dependency-security` 变红（2026-11-18）
`scan-full-lockfile` 报「4 packages affected by 7 known vulnerabilities (2 High)」，而 `git diff` 显示依赖文件没动 —— 是 OSV 数据库当天新收录（`glob ≤14.0.1`、`minimatch <11.0.1`、`picomatch ≤4.0.7`、`deepmerge 4.3.1`）。
落地做法：按 GHSA 补丁版本做定向 overrides（`glob@11.1.0/13.0.7 → 14.0.2`，去掉把 minimatch 钉在 `10.2.6` 的 `glob>minimatch`），`pnpm install --no-frozen-lockfile` 后必须实跑 `pnpm test` + `typecheck` + `nuxt build` + `pwa:build:test`（`glob` 的两个消费方 `@vercel/nft`、`workbox-build` 只在构建期暴露问题）。上游无修复的 `picomatch`/`deepmerge` 记录在案，不假装修掉。

### 14. 本机直发的包和主线互相顶（2026-11-18 夜间连锁）

- 现象：一晚四次「我发完、对方又发一版」，每次都得把对方提交并进主线重出制品；最紧时连续两次被新闸门拦下 —— 线上 commit 在我打包的十几分钟里又换了人。
- 根因两条：一是并发发版没有互斥，二是有人拿本机 `nuxt build` 出来的包直接 `scp` 上去。那份包是 win32 + node 26 出的，原生模块全靠部署脚本替换，而且完全绕开了 CI 的测试与 e2e。
- 落地做法：`release-tools.mjs` 只在 `GITHUB_ACTIONS=true` 时写 `ci: { runId, workflow, sha }`；`deploy-incoming.sh` 见到没有 `ci.runId` 的制品直接 `exit 1`（本机冒烟包要装才设 `ALLOW_LOCAL_BUILD=1`）。配合上面的祖先链闸门，两种事故形状都在切换之前被挡住。

## 三、固定约定
- 上传制品：`scp -O -i "C:/Users/15294/.ssh/tencent_yeu.pem" release.tar.gz root@124.221.145.182:/data/yeu-build/incoming/<release>.tar.gz`。密钥路径要 `C:/…`（MSYS 的 `/c/…` 会被 Windows OpenSSH 当成不存在），`-O` 不能省（默认 sftp 常被服务端断开，只落下 0 字节文件，`deploy-incoming.sh` 会报包损坏）。
- 生产发布只用 `deploy-incoming.sh` 一条入口，`deploy-home-sheet.sh` 会绕过 `flock`。
- 构建一律在本机（Windows/macOS）做，不在生产机跑 `pnpm build`。
- 动生产库前先做表级 dump 到 `/data/yeu/shared/backups/<主题>-<时间>/`。
- ssh 传 SQL 用 `bash -s` 或先 `scp` 脚本，不用双引号包 SQL（双引号会把标识符当列名）。
- AI 改动走 `ai/<模型>-<主题>` 分支，推 `github` / `origin` / `organization` / `yuex` 四个远端；master 由人合并。

## 本机构建报 esbuild 临时目录删除失败

2026-11-16 本机所有 `pnpm build` / `npx nuxt build` 都在 `Bundling Nitro server` 之后报
`[nitro] ERROR Error: remove <TMP>\esbuild-<hash>: Access is denied.`，`.output/server/index.mjs` 不生成。
已排除：TEMP 换盘（D:/E:/用户目录）、node 24/26、esbuild 0.28.1/0.28.2、`nitro.minify=false`、
换工作树、DSH 之外的计划任务；独立调用 esbuild（含 1.2MB 输出）正常，同尺寸文件创建后立即删除也正常。
表现为每次构建在临时目录留下一个 ~1.1MB 的 Nitro 包文件，删除被系统拒绝，构建即中止。

**根因（2026-11-16 定位）**：esbuild 的 `transform` 在**输入超过 1 MiB（1,048,576 字节）**时，会先把输入
落成 `<TEMP>/esbuild-<hash>` 临时文件，收尾删除在 Windows 上失败并回传成 transform 错误。
实测 980KB/1020KB 正常、1024KB 起必失败；同样体积改用 `build({ stdin, write: false })` 正常。
Nitro 打服务端包时正好有一次 1.1MB 的 `transform`，所以每次构建都卡在同一处。

**修法**：`patches/esbuild@0.28.2.patch`（`pnpm-workspace.yaml` 的 `patchedDependencies` 已登记）把
`transform` 包一层：原生调用失败且输入 >1 MiB 时，退回 `build({ stdin, bundle: false, write: false })`。
`pnpm install` 后确认 `node_modules/.pnpm/nitropack@*/node_modules/esbuild` 指向带 `patch_hash` 的目录
（个别 peer 变体可能仍指旧的 `esbuild@0.28.2`，用 `pnpm install --force` 重链即可）。
验证方式：`ALLOW_LOW_SPEC_BUILD=1 pnpm build` 应输出 `Build complete` 且生成 `.output/server/index.mjs`。

参考绕行（2026-11-16 早上的应急做法）：临时分支 + GitHub Actions 出制品。

```
git worktree add /e/yeu-ci-art <要发的提交> --detach
# 写入 .github/workflows/build-artifact.yml：
#   workflow_dispatch；ubuntu-latest；env ALLOW_LOW_SPEC_BUILD: "1"
#   pnpm install --frozen-lockfile → ALLOW_LOW_SPEC_BUILD=1 pnpm build
#   actions/upload-artifact 上传 .output
git push github ci/build-artifact
gh workflow run build-artifact.yml --ref ci/build-artifact
gh run download <run-id> -n yeu-output -D .output   # 产物根就是 .output
node scripts/release-tools.mjs create .output <release> <commit>   # 在 ci 工作树里跑，否则 retrieval 版本取错
tar -czhf release.tar.gz --exclude='*.node' --exclude='sqlite-vec-windows-x64' .output
scp release.tar.gz root@…:/root/yeu-deploy/ && BACKUP_FRESH=1 bash /data/yeu-build/deploy-incoming.sh /root/yeu-deploy/release.tar.gz
```

两个必踩的坑：① CI 的 `pnpm install` 会跑 `nuxt prepare`，4 核 runner 被 Nuxt 的低配守卫拦下，
`ALLOW_LOW_SPEC_BUILD=1` 要挂在 job 级 `env`（只挂 build 步骤不够）；② 线上 `current` 的 retrieval 版本
可能已被别的会话推进，`checkRetrieval` 会拦「检索代码已变更但 ASSISTANT_CACHE_VERSION 未 bump」，
必须在要发的提交里把版本改成一个新的字符串再构建。
