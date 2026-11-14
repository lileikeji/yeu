# 发布规则与已发生事故

本文件记录发布链路上**必须遵守的动作**和**已经踩过的坑**。每条事故都对应一次真实发布失败或线上缺功能，改动发布流程时先读这里。

发布基线细节见 [DEPLOYMENT.md](../DEPLOYMENT.md)，每次发布的记录见 [DEPLOY_NOTES_2026-09-04-qa-cards.md](../DEPLOY_NOTES_2026-09-04-qa-cards.md)。

## 一、发布检查单

按顺序执行，每一步都有对应的核对动作。

1. **基线含 master**
   构建前确认：`git merge-base --is-ancestor <构建commit> master`。不成立就先 `git merge master` 再构建。
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

## 二、已发生事故

### 1. 部署基线旧于 master，线上像「PR 被回退」（2026-11-12）

- 现象：线上 commit 是分支上的 `d7731a1d`，master 已到 `4c5392bc`。顶栏搜索按钮居中、`ASSISTANT_CACHE_VERSION` v86、移动端滑动标点不再误开详情这三处线上都没有。
- 原因：分支父链是 `684fca98`，从没合过 master，用分支 HEAD 构建就等于用旧基线发版。
- 做法：构建前跑 `git merge-base --is-ancestor <commit> master`；不成立先 merge master，用 merge commit 构建。

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

## 三、固定约定

- 生产发布只用 `deploy-incoming.sh` 一条入口，`deploy-home-sheet.sh` 会绕过 `flock`。
- 构建一律在本机（Windows/macOS）做，不在生产机跑 `pnpm build`。
- 动生产库前先做表级 dump 到 `/data/yeu/shared/backups/<主题>-<时间>/`。
- ssh 传 SQL 用 `bash -s` 或先 `scp` 脚本，不用双引号包 SQL（双引号会把标识符当列名）。
- AI 改动走 `ai/<模型>-<主题>` 分支，推 `github` / `origin` / `organization` / `yuex` 四个远端；master 由人合并。
