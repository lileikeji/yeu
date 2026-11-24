# AGENTS.md

跨项目通用的编码行为约束（公有部分），按「底层确定性代码约束 > 中间层性质测试与运行时实证 > 顶层文字规则」的倒金字塔原则组织。本仓库的项目事实——技术栈、目录结构、启动命令、部署流程与踩坑——一律见 [README.md](README.md) 与 [docs/](docs/README.md)（架构、数据模型、部署运维、内容治理）；不在本文件重复。文档体系与工程重构路线见 [docs/RESTRUCTURE_PLAN_2026-10-05.md](docs/RESTRUCTURE_PLAN_2026-10-05.md)。

**权衡：** 这些指南偏向谨慎而非速度。对于简单任务，自行判断。

## 1. 先思考再编码（代码库即事实源）

**不要假设。不要隐藏困惑。暴露权衡。**

- **代码库即事实源**：凡是能通过读代码、查文档、看 `git log`、跑测试或查日志确认的仓库事实，自己动手求证，不向用户抛伸手党问题。
- 在实现之前：
  - 明确陈述你的假设；有多种理解时列出选项，不默默替用户拍板；
  - 存在更简单的方法时主动指出，必要时提出反对意见。
- **仅在以下情况停下询问**：遇到未定义的业务语义冲突、多方案架构取舍、高危破坏性操作（删持久化数据、改公开契约、强推分支），或缺少本地无法获取的密钥与外部输入。提问格式先列「已查明事实 + 备选方案及取舍 + 推荐项」。

## 2. 简单优先与倒金字塔硬约束

**用最少的代码解决问题，并用工具与类型把坏模式挡在编译期与测试期。**

- 不添加未要求的功能，不为一次性代码创建抽象，不为不可能发生的场景堆砌容错；能用 50 行写清绝不写 200 行。
- **严守模块分层与跨端边界**：由 `pnpm lint:arch`（配置见 [.dependency-cruiser.cjs](.dependency-cruiser.cjs)）在静态期拦截：
  - `app/` 与 `map/` 禁止直接导入 `server/` 模块；
  - `app/`、`map/`、`shared/` 禁止引入 Node 内置核心模块或 `better-sqlite3` / `drizzle-orm` / `sqlite-vec` 驱动；
  - `shared/` 保持纯契约与纯函数，禁止反向依赖 `app/`、`map/` 或 `server/`；
  - `server/modules|database|utils` 禁止反向导入 `server/api|routes`，严禁新增循环依赖。
- **Vue 3 / Nuxt 组件状态原则**：优先使用 `computed` 衍生状态与事件处理函数，克制滥用 `watch` / `watchEffect` 同步派生状态。
- **禁留死代码与逃生舱注释**：不留被注释掉的死代码，不写 `FIXME` / `HACK` / `WORKAROUND` 逃生舱注释或残留 `debugger`（由 `pnpm lint:ast`、[rules/agent-guardrails.yml](rules/agent-guardrails.yml) 与 [scripts/architecture-guardrails.test.ts](scripts/architecture-guardrails.test.ts) 硬拦截）。发现问题直接在代码结构层修干净，把反复踩坑的缺陷下沉为类型约束、AST 规则或单测断言。

## 3. 精准修改

**只触碰你必须改的。只清理你自己造成的混乱。**

在编辑现有代码时：
- 不要"改进"相邻的代码、注释或格式；
- 不要重构没有问题的东西，匹配现有代码风格；
- 注意到无关的废弃代码时提及即可，不要顺手删除。

当你的修改产生了孤儿代码：
- 移除因本次修改而变得无用的导入、变量或函数；
- 除非要求，不要移除预先存在的废弃代码。

检验标准：每一行被修改的代码都应直接追溯到用户的需求。

## 4. 缺陷修复标准与三级验收门禁

**「能编译、跑过一条 Happy Path」不等于修好了问题；不拿实证不交卷。**

将任务转化为可验证的目标，多步骤任务先陈述简要计划：
```
1. [步骤] → 验证：[检查项]
2. [步骤] → 验证：[检查项]
3. [步骤] → 验证：[检查项]
```

### 缺陷修复四项要求
1. **红灯先行**：修 Bug 或加校验前，先写能稳定复现该故障的测试或脚本，亲眼看到它因预期原因失败后再改生产代码。
2. **禁止 Mock 故障边界**：测试必须走真实 SQLite（含迁移与外键检查）、真实解析与状态流转，绝不把容易出 Bug 的边界 Mock 成永远为真的假象。
3. **修根因不打表层补丁**：追查数据流与调用链上下游，不在崩溃点套一层空 `if / try-catch` 吞掉异常。
4. **同源清扫**：修完目标位置后，主动用 `rg` 检索全库相同模式或同类调用点，一并修复或明确列出；核心纯函数优先用 `fast-check` 覆盖畸形与极端边界（参见 [scripts/property-invariants.test.ts](scripts/property-invariants.test.ts)），断言必须校验具体输出结构或状态变更。

### 三级硬性验收门禁
- **L1 静态与安全门禁**：`pnpm lint:arch && pnpm lint:ast && pnpm lint:secrets && pnpm typecheck`（本机跑全仓 `typecheck` 需设 `NODE_OPTIONS=--max-old-space-size=6144`）。
- **L2 测试与评测门禁**：运行受影响模块的 `pnpm exec tsx --test <测试文件>`；成批改动收尾跑一键快速门禁 `pnpm verify:fast`，涉及构建、包体预算或发布前跑完整门禁 `pnpm verify`（检索与算分改动另跑 `pnpm eval:retrieval`）。
- **L3 运行时实证**：接口/数据库改动校验真实 HTTP 返回报文与 SQLite 落库状态；前端/交互改动通过 Playwright（`pnpm e2e:run`）或 Chrome DevTools 验证真实页面渲染、交互结果及控制台零报错。

### 交卷自审与验收证据
交付前先执行 `git diff` 自审边界条件、静默异常、上下游契约与文档同步情况。任务完成时在回复末尾简要附上**【验收证据】**：
- **改动摘要与同源排查**：改了哪里、根因是什么、是否清扫了同源位置；
- **验证命令与结果**：实际执行的 L1/L2/L3 验证命令、退出码与关键实测输出（未执行的明确标注未执行）；
- **残余风险（如有）**：本地环境未覆盖或需线上/外部进一步确认的事项。

---

## 5. 环境与协作约束

- **全程使用中文进行对话**，按 ASD-STE100 规范使用简体中文（不适用于代码）。
- **禁止主动操作 Git**：不允许主动执行 `git commit`、`git push`、`git push --force`、`git cherry-pick`、`git rebase`、`git reset --hard` 等不可逆操作。只有当用户明确要求时才可以执行。
- **AI 会话提交/推送必须用自己名字的分支**：需要 `git commit` / `git push` 时，先从 `master` 切出以自己名字命名的分支（形如 `ai/<模型名>-<主题>`，如 `ai/glm-opensource-hardening`），在分支上提交推送；不得直接在 `master` 上提交、推送或 force push。多个会话并行工作时各用各的分支互不干扰，`master` 的合并由人工或主会话执行（2026-11-08 双会话在 master 交错提交的事故教训）。
- **文档与文件引用禁止硬编码绝对路径**：引用仓库内文件一律用相对路径（相对于仓库根或所在文档）。
- **Windows 环境下执行命令默认使用 Git Bash**，而非 PowerShell，除非 Git Bash 不可用。
- **检索优先用 `rg`**：内容搜索用 `rg`，找文件用 `rg --files`；相互独立的读取和查询尽量批量执行。

## 6. 本仓库特有红线

项目背景见 README；这里只列**必须遵守的行为**，违反过的都有真实事故：

1. **测试不过不发布**：改任何 `scripts/*.test.ts` 覆盖的模块后，发布前全量跑一遍测试，失败、类型错误必须清零。
2. **构建产物必须核验**：`pnpm build` 后确认 exit code 为 0（OOM 时 pnpm 只打 `ELIFECYCLE`，不会显式报错）；tar 包的大小与时间戳必须与上一次不同，否则打的是旧产物。
3. **改检索/算分逻辑必须 bump `ASSISTANT_CACHE_VERSION`**：答案缓存有表 + 进程内存两层，同版本号会让线上继续发旧答案。
4. **生产发布走 release 流程**：每次用新时间戳 release，不在 `current` 内 git pull，不删除同名 release 后重部署；动生产数据库前先备份。
5. **不削弱安全层**：Origin guard、miniapp 限流、visitor ban、anti-crawl 规则是层层设防，不为"绕过某个 403/429"改代码；排障按 README/部署纪要里的排查顺序定位是哪一层。
6. **一次性调研、审计、验证记录不入 docs/**：放 `docs/verification/<主题>/`，验收后删除；docs/ 只留活文档（索引见 [docs/README.md](docs/README.md)）。
7. **构建不在生产机做**：生产服务器 4 核 / 3.6G，`pnpm build` 单次 40 分钟起且会 OOM（`exit code 137`），构建期间线上接口跟着变慢。Windows/macOS 用 `bash scripts/build-linux-artifact.sh` 本机构建后上传；同一时刻只跑一个部署，直接调 `deploy-home-sheet.sh` 会绕过 `flock`。
8. **构建基线必须含 master**：先 `git fetch github`，再 `git merge-base --is-ancestor github/master <构建commit>`（方向别写反：要问的是「master 是不是这个提交的祖先」，写反了老提交也判通过）。不成立就先 `git merge github/master`。用落后分支的 HEAD 构建，线上会缺 master 上的修复，表现为"功能被回退"（2026-11-12 事故）。
9. **构建在干净工作树里做，清理工作树先删联接点**：`git worktree add <dir> <commit> --detach` + 目录联接 `node_modules`；清理时先 `cmd /c rmdir "<dir>\node_modules"`（**不加 `/s`**）再 `git worktree remove`。加 `/s` 会顺联接掏空主仓 `node_modules`（2026-11-12 事故，需 `pnpm install --force` 恢复）。
10. **发布前跑 `PRAGMA foreign_key_check;`，失败重试必须换 release 标识**：孤儿行会让部署卡在"数据库外键检查失败"；同名 release 重部署被判"release 已存在"直接 `EXIT=1`，真实原因只在 `/data/yeu/shared/logs/deploy-incoming-*.log`。
11. **部署前先核对「线上 commit 在不在 master 里」**：`ssh root@124.221.145.182 cat /www/wwwroot/yeu/current/.output/release.json` 拿到 commit，再 `git merge-base --is-ancestor <commit> master || git merge <线上分支>`。线上经常跑着没合进 master 的功能分支，直接拿 master 构建会把线上功能顶回去（2026-11-10 主题配色、2026-11-15 叫号台/十分制，两次）。
12. **制品统一走 GitHub Actions，本机构建只作验证**：生产目标是 Linux + node 22，本机 win32 出的 `.output` 不能直接上线，所以推 `deploy/theme-on-competition` 触发 `build-artifact`，再 `gh run download -n output`。本机 `nuxt build` 自 2026-11-16 起可用（`patches/esbuild@0.28.2.patch` 修掉 transform 超 1 MiB 时删不掉临时文件的问题，见 `docs/rules/RELEASE_RULES.md` 事故 10），可用来复现问题与跑冒烟，但不要拿它当发布制品。生成 `release.json` 后必须把 `platform/arch/node/abi` 改成 `linux/x64/v22.x/127`；检索哈希要用 **LF** 工作树算，CRLF 会算出另一个 hash 触发假「未 bump」拦截。上传制品固定用 `scp -O -i "C:/Users/15294/.ssh/tencent_yeu.pem" <包> root@124.221.145.182:/data/yeu-build/incoming/`：密钥路径必须写成 `C:/…` 形式（`/c/…` 会被 Windows 版 OpenSSH 判成「文件不存在」），且要加 `-O` 走传统协议（不加会走 sftp，服务端常回 `Connection closed` 并留 0 字节残包）。
13. **不要用脚本整文件重写源码**：会把 CRLF 文件改成 LF，产生整文件 diff（2026-11-15 `scripts/check-client-bundle-budget.ts` 出现 480 行换行噪音）。多行改动用精确替换，改完看 `git diff --stat` 只该动目标行。
14. **时间/导航/文案类测试要防漂移**：按「今年」推导日期的用例必须钉死届次（`ensureCompetitionEventPinned`），否则每年 11-14 初赛日必红；改导航或页面文案要同步 `tests/e2e/*.spec.ts` 断言，否则 master CI 长期红（2026-11-13 起连续两次）。
15. **Gitee 侧不要在网页上合并 PR**：`mirror-to-gitee.yml` 是 master → gitee `yeu-yx/yeu` 的单向 push 且不带 `--force`，在 Gitee 上合并会让下一次镜像 non-fast-forward 失败；`organization`（gitee newcomers-guide）是旧分叉线，不要动。
16. **并发发版有闸门，别绕过**：`deploy-incoming.sh` 会比对线上 `commit` 是否在本次制品 `release.json` 的 `history`（`release-tools.mjs` 写入 `git rev-list`）里，不在就 `exit 1`。被拦下说明别人刚发过版，正确做法是 `git merge <线上commit>` 后重出制品；`ALLOW_REVERT=1` 只用于真的回退。
17. **`dependency-security` 红先查是不是上游新公告**：`git diff` 里依赖文件没动却报漏洞，就用 `gh api advisories/<id>` 查补丁版本、在 `pnpm-workspace.yaml` 的 `overrides` 做定向升级，并实跑 `pnpm test` / `typecheck` / `nuxt build` / `pwa:build:test`（`glob` 只在构建期炸）。
18. **只有 CI 出的制品能上线**：`release-tools.mjs` 只有在 GitHub Actions 里（`GITHUB_ACTIONS=true`）才写 `ci.runId`；`deploy-incoming.sh` 见到没有 `ci.runId` 的制品直接 `exit 1`（本机冒烟包要装就设 `ALLOW_LOCAL_BUILD=1`）。要上线就推 `deploy/theme-on-competition` 走 `build-artifact` 再 `gh run download`，别在本机 `nuxt build` 完直接 `scp`（2026-11-18 隔壁会话就是这么和主线互相顶的）。
19. **恢复被删除的子系统要按删除提交逐文件对账**：不要只搬 `server/modules/<子系统>`；登录页宿主判断、后台路由守卫、站点互链、systemd 单元与安装脚本都可能在同一个删除提交里被一起改掉。用 `git show --stat <删除提交>` 拿文件清单，逐项 `git diff <删除提交>^ HEAD -- <文件>`，差异再判断是主线演进还是漏搬（2026-11-21 计协登录页“被回退”事故，详见 [docs/rules/RELEASE_RULES.md](docs/rules/RELEASE_RULES.md) 事故 15）。

发布检查单与全部已发生事故见 [docs/rules/RELEASE_RULES.md](docs/rules/RELEASE_RULES.md)。

**这些指南生效的标志是：** diff 中不必要的更改更少、坏产物到不了线上、docs/ 不再堆积过程文档。
