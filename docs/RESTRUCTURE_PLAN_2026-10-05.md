# 工程重构规划：对标 electro-exam（dianzi）

> 起草：2026-10-05。本文件是分阶段执行计划：每阶段完成后在对应小节登记验收结论；全部阶段完成后本文件删除（同 dianzi `docs/PRD/PROGRESS-*.md` 验收后清理的惯例）。
> 对标项目：`F:\dianzi`（electro-exam，电子技术考试与组卷系统，Gitee 仓库 crazy4-thursday/electro-exam）。它是一套已上线运行的企业级单人项目：Spring Boot 3 + React 18 + PostgreSQL 16 + Docker + Gitee 流水线自动部署。

## 1. 为什么重构

yeu 当前是"能跑但脆弱"的状态，三类问题：

1. **文档屎山**：docs/ 里 2026-07 的调研、审计、验证、变更计划等一次性文档长期堆积（本次清理前 33+ 个 md，其中 17 个是带日期的过程文档），索引里"推荐阅读顺序"指向的多数文件早已过时。
2. **发布靠手工**：本地（可能不干净的）工作区 `pnpm build` → `tar -czhf` → scp → 服务器跑 `deploy-home-sheet.sh`。没有 CI，没有强制测试闸门，BUILD_EXIT 和 tar 大小要靠人肉核对（20260923-hijack-fix2 坏发布就是 OOM 后打了旧产物）。
3. **基线漂移**：多次从"工作区 + 叠加文件"发布，HEAD 长期落后于线上（2026-09-15 时线上是工作区独有的 courier/place-reviews 代码），"隔离发布"只能靠 git worktree 叠加补丁，每次都是一次性的手工操作。

dianzi 证明了一条单人可维护的企业级路线，逐项对照学习。

## 2. dianzi 的做法（学习摘要）

### 2.1 文档体系：单一事实源 + 索引 + 验收归档

- 根目录只有 4 个 md：`README.md`（**项目唯一事实源**：技术栈、目录结构、启动、部署、踩坑记录全在这）、`DESIGN.md`（前端设计规范）、`AGENTS.md`（只有跨项目通用约束，明确声明"项目事实一律见 README，不在本文件重复"）、`CLAUDE.md`（一行指向）。
- `docs/README.md` 是纯索引，每个子目录一行说明；`docs/system-reference.md` 承载需求对照/权限/接口/排查手册；`docs/PRD/` 按代码反推（00-总览、01-前台、02-后台）。
- 每次修复的验收材料放 `docs/verification/<主题>/`（REPORT/ACCEPTANCE/BLOCKED/COMMANDS + evidence），**验收完成后清理**，不长期堆积。
- 结论：文档数量的上限来自"活文档"，一次性内容要么进 verification 归档要么删。

### 2.2 仓库卫生

- git 跟踪的内容极干净：根目录 4 md + 3 配置 + 1 流水线；本地垃圾（hs_err、.smoke-*.log、tmp_*）全部被 `.gitignore` 挡住，工作目录乱但仓库干净。
- 脚本只有 5 个：`deploy.sh`（本地一键）、`server-side-deploy.sh`（服务端动作，**本地与 CI 复用同一份**）、`ci-backend-build.sh`（隔离构建+测试）、死链检查、启动脚本。

### 2.3 CI/CD：Gitee 流水线（`.workflow/流水线-*.yml`）

push 到 `main` 自动触发（`ll` 是开发分支，不触发）：

1. **构建阶段**：Maven 只打包**后端源码**（不把本地 target 混进制品）；Node 20 `npm ci && npm run build`，dist 里写入 `build-sha.txt`（当前提交号）。
2. **主机部署阶段**：
   - `flock` 发布锁，独立 `run.XXXXXX` 目录解包；
   - **三处提交号一致性校验**：后端源码 sha = 流水线 sha = 前端 dist 的 build-sha，前端制品顶层多一层 `dist/` 时自动摊平并验证到 `index.html` 才动现网；
   - `ci-backend-build.sh`：临时 PostgreSQL 16 + Redis 7 容器（端口只在测试容器内部，不映射宿主机、不碰生产库），**全部 518+ 测试通过、失败/错误/跳过均为 0** 才继续；
   - 复用 `server-side-deploy.sh`：先备份（DB dump + jar + 站点快照）→ 部署 → 健康检查全 UP 才写 `DEPLOYED-<sha>-<ts>.txt` 标记和公开 `/version.json`（commit 必须等于本次 main 完整提交号）；
   - 各次构建与部署日志保留在 `run.*` 目录，回滚材料（`.bak-<ts>`、`site-backup-<sha>-<ts>.tar.gz`）留存。

### 2.4 部署方式

- Docker：数据库独立容器（127.0.0.1:55432 不暴露公网），后端容器 bind mount jar。
- jar **原地 `cp` 覆盖不 `mv`**（inode bind mount 的坑）；dist 先解包暂存、验证 index.html 再整目录更换（保留 `.well-known`）。
- Nginx 细节全部写进 README：SSE 关缓冲、XFF 用 `$remote_addr` 防伪造、`index.html` no-cache 防旧 shell、上传目录 nosniff+强制下载。
- 健康检查不过按脚本末尾输出的命令回滚。

### 2.5 质量闸门与分支模型

- `main` push 即自动部署 → 任何进 main 的代码都被隔离测试闸门保护；开发在 `ll` 分支进行。
- 前端有 `check-undefined.mjs` 白屏闸门（vite 对未定义引用静默通过，构建前用 @babel/parser 扫描）。
- 历史踩坑（流水线制品多一层目录、Flyway checksum 漂移）都变成脚本防呆并写回 README。

## 3. yeu 现状对照

| 维度 | dianzi | yeu 现状 |
| --- | --- | --- |
| 事实源 | README 单一事实源 + docs 索引 | README 阶段信息停在 7 月（还写着 PM2，实际是 systemd yeu.service:3000） |
| docs | 13 个活文档 + verification 随做随清 | 本次清理后 13 个活文档（清理前 33+） |
| CI | push main → 流水线 → 隔离库全量测试 → 自动部署 | 无。手工本地构建、手工 scp |
| 测试闸门 | 518+ 全过、0 失败 0 跳过才准部署 | scripts/*.test.ts 已有 1200+ 用例，但部署前不强制 |
| 制品校验 | 三处 sha 一致 + dist 摊平校验 | 只靠人肉核对 BUILD_EXIT 和 tar 大小 |
| 版本标记 | /version.json + DEPLOYED 标记 + run.* 日志 | 靠 release 目录名与对话记录 |
| 备份/回滚 | DB dump + jar bak + 站点快照 + 回滚命令 | 已有 DB 备份与 releases 回滚（deploy-home-sheet.sh 内置），但无版本标记文件 |
| 基线 | main 即线上 | HEAD 与线上漂移，靠 worktree 叠加发布 |

## 4. 分阶段计划（动作 → 验证）

### P0 文档治理（2026-10-05 已执行）

动作：删除 17 个带日期的一次性文档、整个 docs/marketing/、过时的 ROADMAP 与已完成 plans；未跟踪散件先归档到仓库外 `E:\tmp\yeu-docs-archive-20261005` 再删；重写 docs/README.md 索引；本规划文件落盘。
验证：`git status` 中 docs/ 只有预期删除与新增；docs/ 每个文件都能在索引里找到且索引无死链。

- [x] 完成（2026-10-05）

### P1 仓库卫生 + README 重写为事实源

> 2026-10-05 提前完成其中一项：根目录 `AGENTS.md` 已按 dianzi 模式建立（通用行为约束 + 本仓库发布纪律红线，项目事实指向 README/docs 不重复）。

动作：
1. 根 README 重写：当前阶段（助手检索 v79+、小程序已上线、纳新功能等）、真实技术栈（systemd 而非 PM2）、目录结构、本地启动、部署一节只写"运行 `bash scripts/deploy.sh`（P2 后）"。
2. `.gitignore` 补齐：`*.tar.gz`（发布包不进 git 根）、构建日志、调试脚本 `_*.ts/_*.py`、`.dsh-mineru/`、`.zcode/`、`_worktree-*-backup/`。
3. 发布包 tar.gz 移出仓库根（挪到仓库外目录或加 ignore 后清理），根目录只留源码与配置。
4. 把散落在 git log/对话里的部署坑（BUILD_EXIT、tar 大小、缓存版本 bump、deploy 脚本路径契约、`-h` 解引用）收进 README 的"部署"一节，作为常设检查单。

验证：`git status` 干净；新同事只看 README 能完成本地启动与一次发布；`rg "PM2" README.md` 无结果。

- [x] 完成（2026-10-09）。README 已重写为事实源；`.gitignore` 增补发布包/调试截图/探针脚本/AI 工具状态/`.deploy-state.json`；22 个发布 tar.gz 与 27 张调试截图归档到仓库外 `E:\tmp\yeu-root-clean-20261009`。注意：工作区约 147 个源码文件（83 改动 + 64 未跟踪，miniapp/recruit/migrations 0032-0036 等）是**线上正在运行的代码但从未提交**，属 P4 基线治理范畴，不是垃圾，已保留。

### P2 部署脚本收口（对标 server-side-deploy.sh）

动作：
1. 新增 `scripts/deploy.sh`（本地）：前置检查单强制化——测试全绿（`scripts/*.test.ts` 全量跑，失败即停）→ `pnpm build` → `grep BUILD_EXIT` 必须为 0 → tar（`-h`）大小与时间戳必须与上一次不同 → scp → 调服务器脚本；支持 `--no-test` 逃生口但输出必须显式提示。
2. 新增 `scripts/server-side-deploy.sh`（服务器）：DB 备份 → 解包暂存并验证 `.output/server/index.mjs` 存在才动 `current` → `deploy-home-sheet.sh` 原子切换 → 健康检查（`/api/public/health` + 关键探针）→ 写 `releases/DEPLOYED-<sha>-<ts>.txt` 与公开 `/api/public/version.json`（commit、release id、时间戳）。deploy-home-sheet.sh 保留，被本脚本调用，避免两套实现。
3. 发布前强制确认 `ASSISTANT_CACHE_VERSION` 是否需要 bump（改了检索/算分逻辑时）。
4. `version.json` 里的 commit 与本地 `git rev-parse HEAD` 一致性校验：**从此只允许从干净 commit 构建**（worktree 叠加发布的做法改为：先把叠加文件提交到快照分支，再构建发布，见 P4）。

验证：连续两次发布全部走脚本完成；故意注入一次 BUILD_EXIT 非 0 与旧产物 tar，脚本都能中止；version.json 的 commit 能对上 releases/DEPLOYED 标记。

- [x] 脚本已落地（2026-10-09）：`scripts/deploy.sh`（闸门：脏工作区拒绝 → 缓存版本确认 → `pnpm test` → BUILD_EXIT 核验 + ELIFECYCLE 扫描 → tar md5 与上次对比防旧产物 → 上传 → 服务器部署；`--dry-run/--no-test/--allow-dirty/--slug` 逃生口）+ `scripts/server-side-deploy.sh`（同步 deploy-home-sheet.sh → 执行核心部署 → 写 `DEPLOYED-<sha>-<ts>.txt` 与 `.output/public/version.json` → 清理旧 release 保留 4 个）。服务器原 `deploy-home-sheet.sh` 已拉进仓库作为事实源（`scripts/deploy-home-sheet.sh`），每次部署自动覆盖服务器副本。
- [x] 已验证（2026-10-09）：三脚本 `bash -n` 通过；脏工作区注入被拒；缺参数报错；非交互环境的缓存确认会明确拒绝并给出 `--cache-version-acked` 逃生口（修复过两个真缺陷：参数解析布尔分支漏 `shift` 导致死循环、后台 `read` 挂起）；dry-run 全链路走通基线检查 → 缓存检查 → 测试 → 构建闸门。
- [x] 测试闸门实测拦下发布：dry-run 中 `pnpm test` 失败即停。其中 1 个失败（`public-route-integrity` 断言 README 列出五条流程名）由本次 README 重写引入，已补回修复并单跑全绿；其余 4 个（assistant-contact 开学问答、Lucide 图标清单、target=_blank rel、交通问答）为工作区既有失败（相关文件均在未提交改动中，与本次改动零交集）——当前工作区本就不是可发布状态，闸门行为正确。
- [ ] 待真实验证：下次实际发布（先把工作区提交，见 P4）走 `deploy.sh` 完整流程，确认服务器端 version.json 可读性。若 Nitro 不服务后写入的静态文件（脚本会打警告），后续加 `server/api/public/version.get.ts` 路由读包内版本信息。

### P3 CI 流水线（Gitee Go）

动作：
1. 仓库「流水线」开通 + 主机部署组（服务器 ***REMOVED*** 已有 SSH 凭据基础）。
2. `.workflow/流水线-<ts>.yml`：push `main` 触发；构建阶段只打包**源码**制品（`pnpm install && pnpm build` 在云端跑，写 `build-sha.txt`），不把本地 .output 混入；主机阶段解包校验 sha 一致后跑全量测试再调 `scripts/server-side-deploy.sh`。
3. 测试环境：SQLite 场景用临时目录/内存库替代 dianzi 的临时 PG 容器；冒烟探针（`scripts/assistant-qa-sweep.ts`）跑在部署后阶段，失败即标记 DEPLOY_FAILED。
4. 流水线配额策略照抄 dianzi：注册常开机器为自有构建机不耗核分。

验证：向 main push 一个小改动，从 push 到线上 version.json 更新全程无人工步骤；故意 push 一个挂测试的提交，流水线中止且线上无变化。

- [x] 流水线定义已落地（2026-10-09）：`.workflow/流水线-20261009.yml`。按维护者决策，**构建放在 Gitee 云端**（花积分，不占服务器资源，同时规避本地构建 OOM）：云端 `pnpm install --frozen-lockfile → pnpm test → pnpm build`（NODE_OPTIONS 抬堆防 OOM）→ 制品（.output + 部署脚本 + build-sha.txt）→ 主机阶段 `flock` + 提交号一致性校验 → 复用 `scripts/server-side-deploy.sh`。push `main` 触发。
- [ ] 待用户在 Gitee 控制台一次性配置（约 10 分钟）：① 仓库「流水线」页开通；② 「主机管理」新建主机组加入生产服务器并配 SSH 凭据，把 yml 里两处 TODO 替换为主机组实际 ID；③ 首跑观察测试与构建在 2C4G 的时长与内存。

### P4 基线治理（消灭 HEAD 与线上漂移）

动作：
1. 建立规则：任何发布内容必须以 commit 形式存在于 main（或发布快照分支），`git status` 不干净时 `deploy.sh` 直接拒绝（P2 已埋）。
2. 把线上现网代码与 HEAD 做一次 diff 对账（`grep -rao "rag-v[0-9a-z-]*" current/.output/server` 确认缓存版本），把仍未入库的线上独有代码补提交。
3. 此后"隔离发布"简化为：worktree 基于上次成功发布的 commit → 叠加文件 → **先提交到快照分支** → 从该 commit 构建。

验证：`version.json` 的 commit 始终能 `git show` 到；连续两个 release 不再出现"线上有而仓库无"的文件。

- [x] 对账完成（2026-10-09）。结论：**基线漂移严重但边界清晰**——线上 `20261001-recruit-fix15` 运行的代码中，约 147 个源码文件不在 git 里（83 个已跟踪文件的未提交改动 + 64 个未跟踪源码：miniapp API 全套、recruit 模块、migrations 0032-0036、assistant 8 个测试、directions/place-reviews 增量等）；HEAD 最新提交停在 2026-09-23 的 docs。缓存版本恰好一致（线上 = HEAD = `rag-v79-hijack-fix`）。`scripts/deploy.sh` 的脏工作区守卫（P2）会强制下次发布前先提交——**下次发布的第一个动作就是把工作区提交**，此后"线上有而仓库无"即被制度性杜绝。
- 附注：公开版本端点依赖 version.json 能被 Nitro 服务；若实测 404，加 `server/api/public/version.get.ts`（读 `.output/version.json` 或构建注入常量），随下次发布上线。

## 5. 本次文档清理清单（P0 执行记录）

已删除（git 历史可找回，`git log --oneline -- docs/<文件名>`）：

- 2026-07 过程文档 6 个：CHANGESET_PLAN、SYSTEM_OPTIMIZATION_PLAN、VERIFICATION_RECORD、SYSTEM_NEXT_STEPS、PROD_FIX_AND_NEXT、ROADMAP（进度与阶段信息并入 P1 的新 README）
- 2026-07/08 调研审计 6 个：RESEARCH_AUDIT、RESEARCH_INCREMENT、XIAOHONGSHU_RESEARCH、PUBLIC_MEDIA_AUDIT、BRAND_AND_CONTENT_RISK_AUDIT、RESEARCH_SOURCES（数据源已入库为 content/place_sources 记录）
- 地图一次性审计 3 个：MAP_PRECISION_AUDIT、MAP_DATA_READINESS、FIELD_COORDINATE_VERIFICATION
- 研究记录 1 个：AI_MEMORY_INTEGRATION_RESEARCH
- docs/marketing/ 整目录（运营日志与推广计划，共 20+ 文件）
- docs/plans/ 整目录（账号访客群聊方案：已完成；小程序准备：已落地）

未跟踪散件（先归档到 `E:\tmp\yeu-docs-archive-20261005` 后删除，git 里没有）：

- docs/DEPLOY_NOTES_2026-09-10-miniapp-ui.md、docs/DEPLOY_NOTES_2026-09-13-miniapp-walking-route.md（小程序部署记录，主体状态已记录在部署纪要与小程序仓库）
- docs/marketing/daily/ 2026-07-31 至 08-04 的 10 篇、docs/plans/mini-program-prep.md

根目录日志垃圾：`.smoke-*.log`、`hs_err_pid*.log`、`replay_pid*.log`、`web-build-p2a.log`、`notepad`、`nul`。

## 6. 整体验收标准

1. docs/ 只剩活文档且索引无死链；一次性材料产生于 `docs/verification/<主题>/` 并在验收后删除。
2. 任何发布只经过 `scripts/deploy.sh` 或 CI 流水线，制品 sha 可追溯，version.json 与 DEPLOYED 标记齐备。
3. main 与线上零漂移；坏构建（OOM/旧产物/类型错误/测试失败）在脚本或流水线层被拦下，不再依赖人肉核对。
