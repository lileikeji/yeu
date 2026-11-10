# 任务完成复盘与架构同步规则

> 文档用途：把每次任务的结果、问题和经验沉淀为可持续维护的规则库。
> 维护方式：按时间倒序追加复盘记录；每次完成代码、数据、内容、AI、地图、后台、机器人、部署或运维任务，都必须更新本文。
> 安全边界：不得写入密码、Cookie、访问令牌、私钥、学生个人信息或可直接用于登录的原始凭据。

## 1. 完成任务的强制动作

任务只有在以下信息都具备时才算完成：

1. 明确记录本次实际完成的范围，以及没有完成的范围。
2. 记录验证方式、环境、时间和结果；没有验证的内容必须写成“未验证”，不能写成“已完成”。
3. 记录做得好的地方、做得不好的地方、根因和下一次要避免的做法。
4. 判断是否改变了页面、API、数据模型、检索流程、地图 provider、缓存、权限或部署拓扑。
5. 有架构变化时更新 `docs/ARCHITECTURE.md`；即使没有架构变化，也在本记录中明确写“无架构变化”。
6. 代码或配置变更完成后执行与风险匹配的检查，并记录失败项和剩余风险。
7. 发布任务必须记录版本/提交标识、健康检查、回滚点和线上验证结果；只在本地验证时不得表述为已部署。

## 2. 复盘记录模板

复制下面的模板，在“历史记录”顶部追加一条。标题使用 `YYYY-MM-DD · 简短任务名`，时间统一使用 Asia/Shanghai。

```markdown
## YYYY-MM-DD · 简短任务名

- 本次目标：
- 实际完成：
- 未完成或待确认：
- 做得好的地方：
- 做得不好的地方：
- 根因：
- 后续避免：
- 验证环境与结果：
- 发布/回滚信息：无代码发布 / <填写 release、commit、回滚点>
- 架构变化：无架构变化 / <填写受影响的文档、模块和数据边界>
- 后续动作：
```

“做得不好”必须写具体事实，例如“只验证了桌面 Chromium，未验证微信 WebView”，不能用“仍需优化”代替。根因要区分代码缺陷、数据缺失、配置错误、第三方依赖、验证不足和需求变化。

## 3. 变更同步矩阵

| 变更类型 | 必须同步的文档 | 最低验证 |
| --- | --- | --- |
| 页面、路由、前台入口或后台模块 | `docs/INFORMATION_ARCHITECTURE.md`、`docs/README.md` | 目标桌面/移动入口和权限状态 |
| 数据表、迁移、发布状态或知识索引 | `docs/DATA_MODEL.md`、`docs/CONTENT_POLICY.md` | 迁移、读写、发布/下线和数据一致性 |
| AI 路由、检索、缓存、模型或 MCP | `docs/ARCHITECTURE.md`、`docs/ADMIN_RUNBOOK.md` | 命中、无命中、降级、超时、敏感信息和日志 |
| 地图 provider、坐标、路线或内嵌浏览器兼容 | `docs/ARCHITECTURE.md`、`docs/MAP_INTERACTION_SPEC.md` | 桌面、移动、微信/QQ、失败降级和真实坐标 |
| PWA、缓存、CDN、Nginx 或进程守护 | `docs/ARCHITECTURE.md`、`docs/DEPLOYMENT.md` | 健康端点、缓存头、重启恢复、回滚 |
| 内容抓取、PDF/图片导入或来源治理 | `docs/CONTENT_POLICY.md` | 去重、来源、审核状态、版权和可追溯性 |
| 账号、访客、聊天、机器人或微信接入 | `docs/ARCHITECTURE.md`、`docs/ADMIN_RUNBOOK.md` | 鉴权、限流、审计、隐私和断线重连 |

## 4. 持续改进规则

- 先确认当前代码、数据库、生产进程和文档事实，再决定修改位置；不要用旧记忆覆盖当前状态。
- 把业务事实、检索证据和推断分开。知识库中的草稿、未审核抓取结果和外部网页不能直接当作官方事实。
- 先做最小可回滚变更，验证通过后再扩大范围；不要为了修一个入口回滚无关功能。
- 兼容性问题至少按真实运行环境验证：桌面浏览器、移动浏览器、微信/QQ 内置 WebView 和 PWA 不可互相代替。
- 线上发布前保留旧 release、数据库备份和可执行的健康检查；构建新版本时不得先停止正在提供服务的旧版本。
- 日志只记录定位问题所需的最小信息。IP、设备和行为统计必须有用途、保留期限和脱敏边界。
- 每次复盘都要回看历史记录：若同类问题重复出现，必须把避免项提升为代码检查、发布门禁、数据约束或运行手册步骤，而不是只再次提醒。

## 5. 历史记录

## 2026-11-10 · 站点主题配色切换（5 套预设主色）

- 本次目标：在既有「明/暗/跟随系统」之外增加正交的「主题配色」维度，用户可自由切换预设主色，选择持久化，首帧不闪，不需要改动全站 1000+ 处硬编码 `green-*` / `orange-*` 类。
- 实际完成：`app/utils/theme-mode.ts` 新增 `ThemePalette` 类型、5 项 `THEME_PALETTES`、`resolveThemePalette`/`storedThemePalette`/`applyThemePalette`，`THEME_BOOT_SCRIPT` 追加 palette 首帧应用（白名单由 `THEME_PALETTE_IDS` 模板生成，避免双份真值）；`app/assets/css/main.css` 新增 4 个无层 `[data-palette]` 覆盖块（indigo/violet/rose/teal，各 11 条 green 变量），`::selection` 与 `.section-kicker` 改用 `var(--color-green-500)`；`useThemeMode` 增加 `palette`/`palettes`/`setPalette`；`ThemeModeToggle` 改为「外观」+「主题配色」两组菜单，色板项带彩色圆点；新增 `scripts/theme-palette.test.ts` 21 条断言（审核修正后 26 条）。用户验收后追加修正：teal 由 `#0f6b73`（H=185°）改为 `#0a7aa3`（H=196°、L=34%）并更名「青蓝」，解决与默认绿的辨识度问题；`ThemeModeToggle` 补 `justify-center` 修复图标不居中；`DisplaySettingsPanel`、地图页定位/跟随态、`MapTransitPanel` 选中态由 `blue-*` 改为 `green-*`，使其跟随主题。
- 未完成或待确认：`app/pages/singer/**`（121 处 hex）、`app/pages/admin/knowledge/graph.vue`（96 处）为硬编码颜色不参与换肤；PWA manifest 的 `theme_color` 是构建期静态值（已对齐默认品牌绿 `#176f46`，不会随运行时配色变化）；`AdminCoordinateObservationReviewDetails` 的 `possible-dual` 蓝与公交模块品牌蓝按语义色保留，未跟随主题。
- 做得好的地方：先做 Tailwind 4 编译探针验证 `@theme static` 确实输出 `:root` 变量、工具类确实编译为 `var()`，再据此确定「只改变量、不动 1200+ 处类名」的方案；用 CDP 读取 `getComputedStyle` 实测 5 套色板的 `--color-green-500`、`text-green-700` 计算值、`--ui-color-primary-500` 三级联动，以及明暗正交、刷新保持、非法值回落。
- 做得不好的地方：首版 teal 只按「与绿同明度曲线」生成（H=185°/L=25%），与默认绿 H=152°/L=26% 几乎无法区分，直到用户截图指出才发现；首版未检查 `UButton` 缺 `justify-center`，图标贴左；首版只覆盖 `--color-green-*` 与 `--color-orange-*`，漏掉了 17 个文件里作为交互选中态使用的 `blue-*`。
- 根因：配色方案设计时只对齐了「明度曲线一致」，没有校验「相邻方案之间的色相/明度差异下限」；按钮几何未在真实布局下测量（Moli 无头渲染 header 只有 100x20，未复现真实尺寸）；换肤覆盖面按「变量名」而非「语义用途」梳理，把 `blue-*` 一律当成 info 语义而漏掉其中的选中态。
- 后续避免：设计多套调色板时先算 HSL，相邻方案色相差 ≥40° 或明度差 ≥8%，并写成测试断言；改共享 UI 组件前先看其 base class 是否自带对齐类；换肤覆盖清单按「语义用途」逐文件过一遍，区分交互选中态与状态语义色。
- 验证环境与结果：`pnpm typecheck` 0 error；`tsx --test scripts/theme-palette.test.ts` 21/21；`tsx --test scripts/admin-accessibility-presentation.test.ts` 2/2；`pnpm test` 1432/1439（7 个 `deployment-recovery.test.ts` symlink 用例为 Windows 环境限制，CI 上通过，与基线一致）；`/`、`/map`、`/discover`、`/admin/login` 均 200；日志仅 `NUXT_YKT_*` 未配置导致的 503（本地开发预期）。CDP 实测：5 套 `--color-green-500` 依次 `#176f46`/`#5159bb`/`#7a49bd`/`#b23450`/`#0a7aa3`，`--ui-color-primary-500` 同步；violet 下地图面板选中态 `rgb(101,58,156)`、浅底 `rgb(247,240,253)`；刷新保持与非法值回落均正常。
- 发布/回滚信息：未发布。分支 `feature/theme-palette-clean`，commit `1dfe2f6`（主功能）+ `dc037ce`（三处修正）+ `35fcb8b`（复盘文档）；审核修正追加在本分支新提交里。回滚：还原 `app/utils/theme-mode.ts`、`app/assets/css/main.css`、`app/composables/useThemeMode.ts`、`app/components/ThemeModeToggle.vue`、`app/components/map/DisplaySettingsPanel.vue`、`app/components/MapTransitPanel.vue`、`app/pages/map/index.vue` 并删除 `scripts/theme-palette.test.ts`；`localStorage['yeu-palette']` 残留无害（旧代码不读）。
- 架构变化：新增前端主题配色层，不涉及数据库、迁移、依赖或服务端。机制依赖两个外部事实：Tailwind 4 `@theme static` 输出到 `@layer theme` 的 `:root`，以及 `@nuxt/ui` 运行时插件生成 `--ui-color-primary-*: var(--color-green-*)`。若 Nuxt UI 未来改为构建期内联颜色，整条链路会静默断掉，需要补 e2e 断言钉住。
- 审核修正（2026-11-10）：`app/app.config.ts` 的 `success` 由 `green` 改为独立色板 `success`（在 `@theme static` 里固定 11 级，与默认绿同值、不参与 `[data-palette]` 覆盖），`PlaceRatingSection` / 首页清单 / 微信指南的「已通过/已完成/已读」改用 `success-*`，避免玫瑰配色下状态标记变红，也保住白字压在 `#176f46` 上的对比度（此前改 emerald 触发过 E2E 无障碍 `color-contrast` 2.47:1 回归）；四套 palette 块删除 `--color-orange-*` 覆盖（warning 是语义色，不该随品牌漂移）；`theme-color` 由硬编码 `#0f5132` 改为随配色切换（`THEME_PALETTE_THEME_COLORS` + boot script 首帧写入），manifest `theme_color` 对齐 `#176f46`，地图焦点环改用 `var(--ui-color-primary-600)`；测试补到 27 条，钉住这三类回归。
- 过程教训：PR 的 base 是 `ai/glm-opensource-hardening`，其内容停在 2026-11-08 16:05 的 master 快照（落后 12 个提交），直接合并会把依赖升级、CI 放行开关、镜像工作流一起退回；本分支已改为 rebase 到 `master` 的三个提交，PR base 同步改为 `master`。另外 base 的 `ci.yml` 缺 `ALLOW_LOW_SPEC_BUILD`，低配 runner 会卡在 `postinstall` 的构建守卫上，红叉与主题代码无关。
- 后续动作：`success` 已拆成独立色板（本 PR），`warning` 仍走 orange（`--color-orange-*` 是固定值、未随品牌漂移，但语义变量未独立）；把 `singer/**` 与 `knowledge/graph.vue` 的硬编码 hex 迁移到变量；补一条 e2e 断言验证 `<html data-palette>` 切换后 `getComputedStyle` 真的变化。

## 2026-11-08 · 歌手大赛宣传页/现场登记/结果邮件 + 满分口径改 100

- 本次目标：按两张海报做公开宣传页；现场扫码登记（班级/姓名/学号/电话/邮箱/歌曲可待定）直进初赛名单；评委按顺序或任意切换评分（沿用已有能力）；轮次成绩确认后按后台模板一键发送结果邮件（支持 {{姓名}} 等合并字段）。
- 实际完成：满分口径改为每维 20 分、五维满分 100（与海报一致，评分维度仍在赛事设置可调）；迁移 0046 新增 registration_open、歌手学号/电话/邮箱/source 列与 competition_email_templates / competition_email_sends 两表；公开 /singer 宣传页与 /singer/register 登记页（按学号去重、IP 限流、后台开关控制）；后台 /admin/competition 新增邮件通知分区（模板编辑+占位符插入+测试发送+按范围一键发送+发送记录）；复用既有 QQ SMTP（server/utils/mailer.ts 新增通用 sendMailMessage）；评委端每维输入上限 20、歌曲待定兜底显示。
- 未完成或待确认：未部署生产；SMTP 需确认生产 shared/.env 的 QQ_EMAIL / QQ_EMAIL_AUTH_CODE 可用；发送记录表在真实邮件量下的表现未验证；宣传页视觉未做真机截图比对。
- 做得好的地方：邮件渲染/合并字段做成纯函数并进单测；登记直接复用 round_entries 结构，评委端零改动即可看到新登记选手；发布前用构建产物对本地库做真实 HTTP 冒烟。
- 做得不好的地方：drizzle 对「加列+加 CHECK」生成的表重建语句把新列写进 INSERT SELECT（旧表无此列，执行必失败），迁移需手工收敛为公共列拷贝；master 上 hot 页/amap/mailer 存在既有 lint/type 问题，排查花了额外时间。
- 根因：drizzle-kit 的表重建 diff 缺陷；master 在制功能（hot/signal、auth）自带 20 个类型错误与 mailer 未用参数，均为本次改动之前已存在（HEAD 基线 worktree 复验确认）。
- 后续避免：凡「新增列 + 新增约束」的 SQLite 迁移必须本地真实执行一遍再提交；接手别人在制的 master 时先用 HEAD 基线跑 typecheck/lint 区分新旧问题。
- 验证环境与结果：Windows 工作区 E:\yeu；competition 测试 6/6 全绿（含登记去重/开关、模板渲染、三轮全流程）；pnpm test 仅剩 4 个 deployment-recovery 失败（HEAD 基线同样失败，属他人未提交改动相关）；typecheck 错误集与 HEAD 基线完全一致（20 个既有）；lint 目标文件清零（顺手把 mailer 未用参数改名 _options）；pnpm build exit 0。
- 发布/回滚信息：2026-11-08 已发布 release `20261108-local-143539`（commit `76a06e2`，含 e0b9df1+76a06e2 两个功能提交与 866df01 部署脚本修复）；回滚点 `/data/yeu/releases/20261108-local-114417`；备份 `yeu-before-20261108-local-135530.sqlite`（2.02G，迁移前快照）。发布过程中发现并修复：sqlite3 .backup 在持续写入的线上库活锁 50 分钟（部署脚本今日已改 VACUUM INTO+24h 硬链接复用）；drizzle 两次生成含新列引用旧表的坏重建 SQL（均手工收敛）；第一次切换误用未补 ELF 的包（native 校验前即失败，线上无影响）。
- 架构变化：歌手大赛新增公开登记面与邮件通知子系统（DATA_MODEL 6.6、INFORMATION_ARCHITECTURE 8.1 已同步）。
- 发布/回滚信息（2026-11-08 补）：已发布 release `20261108-local-143539`（76a06e2）与 `20261108-local-163045`（6e7020f，报名物料生成+文案去 AI 味+现场入口下线）；回滚点 114417/143539。期间发现 sqlite3 .backup 在持续写入的线上库会活锁（50 分钟无进展），部署脚本已改 VACUUM INTO+24h 硬链接复用。
- 后续动作：部署后用真实扫码流程验证登记→评委可见→评分→关闭→发信全链路；确认 QQ 邮箱授权码与发件频率上限。

## 2026-10-21 · 音乐协会新生歌手大赛后台与独立评委端

- 本次目标：为音协新增三轮制新生歌手大赛：后台创建按轮独立的评委账号、导入歌手与歌曲、配置评分维度与占比、随机抽签和手动改序、汇总评分与排行；评委端只能评分和查看已公布结果，未评分按弃权处理。
- 实际完成：新增 `competition_events` / `rounds` / `judges` / `judge_sessions` / `singers` / `round_entries` / `scores` 与迁移 `0039_nosy_salo.sql`；固定初赛→复赛→决赛，初赛默认晋级 30、复赛名额可留空、决赛出最终排行；复赛/决赛按上一轮晋级结果随机抽签并支持上移/下移；每轮独立评委账号和会话 Cookie；轮次结束锁定成绩，未评分为弃权；后台新增 `/admin/competition`，评委端新增 `/judge/login`、`/judge`；服务端按 `music-association` 社团硬限定，总管理员和音协组织管理员可用。
- 未完成或待确认：已发布到生产，但未在生产创建真实比赛数据，也未用真实手机/微信 WebView 验收；页面视觉只做了构建与路由冒烟，未做浏览器截图比对。
- 做得好的地方：先用纳新后台的 content 权限模型复用组织范围，再把评分公式抽到 `shared/utils/competition.ts` 供服务端和评委端共用；临时库端到端跑通“初赛评分→关闭→晋级复赛→关闭→决赛→总结果”，并用单测覆盖加权、抽签、手动改序、弃权和锁定。
- 做得不好的地方：第一版按单轮模型实现，用户补充三轮规则后需要整体重构迁移和页面；端到端冒烟才发现“已评分选手在轮次结束后也被标成弃权”的布尔值赋值错误，单测最初只断言了未评分选手的弃权状态；直连发布时服务器本机构建因 3.6G 内存+swap 抖动耗时过长，最终改为本机 Node 22 构建并替换 Linux 原生模块。
- 根因：需求在实现中途从单轮扩展为三轮，且排名序列化把“轮次已结束”直接复用到 `forfeited`，没有区分“有分”和“无分”；前期测试缺少对已评分选手弃权标志的反向断言。
- 后续避免：比赛类功能先把轮次、参赛名单、评委归属和成绩唯一键画清楚再写表；凡是“结束状态 + 无成绩”的派生字段，必须有正向和反向两类断言；页面改完后至少跑一次真实 HTTP 登录/评分/关闭/晋级链路，而不是只跑 service 单测。
- 验证环境与结果：Windows 工作区 `E:\yeu`；`pnpm test` 1292 条全绿；`pnpm typecheck`、目标文件 ESLint、`pnpm build`（exit 0）通过；本地迁移与 `db:check` 通过；用临时 SQLite 启动构建产物，实际完成评委登录、CSRF 评分（总分 50/45/47.5）、非法分 422、管理员关闭初赛、晋级复赛、手动改序、生成决赛名单、关闭决赛、初赛评委查看决赛总结果；冒烟中发现的弃权误标已修复并补断言。
- 发布/回滚信息：2026-10-21 已直连发布到生产，release `20261021-competition-212416-f4f4c8d0`（commit `2159f9136cc77aa3c9bb89e90d7545ae9caf0726`）；回滚点 `releases/20261015-161734-26-499e7964eb3f-691a67b8`；迁移前备份 `shared/backups/yeu-before-20261021-competition-212416-f4f4c8d0.sqlite`。Gitee CI 配额不足，Linux 制品在本机 Node 22 干净 worktree 构建后替换生产同版本 Linux 原生模块；0039 纯新增迁移按 SQL+账本手工应用，`db-check` 40 条账本/0 待处理。
- 架构变化：新增仅音协可用的第四类评委会话域和三轮比赛数据边界；已同步 `docs/ARCHITECTURE.md`、`docs/INFORMATION_ARCHITECTURE.md`、`docs/DATA_MODEL.md`。
- 后续动作：用真实比赛数据验证导入、抽签公布、手机评分和弃权标记；如需长期复用，再评估多届比赛归档与成绩导出。

## 2026-08-01 · 公告已读访客仍需按开关自动弹出

- 本次目标：修复公告已开启“进入前台自动弹出”但当前访客已读后不再弹出的体验问题。
- 实际完成：前台自动弹出只判断 `metadata.autoPopup`，已读状态继续用于未读角标、列表颜色和阅读统计；保留公告版本化已读边界，编辑后仍会产生新的已读状态。
- 未完成或待确认：本地开发库没有公告数据，因此本地空库不会凭空弹窗；需要用生产公告或测试库公告验证视觉效果。
- 做得好的地方：先对比生产公告 API、浏览器实际 DOM 和本地端口，区分了“已读不再弹出”和“127.0.0.1:3000 旧离线页”两种现象，再修改单一判定条件。
- 做得不好的地方：上一轮把“自动弹出”错误地绑定到“未读”，导致后台开关对已读用户看起来失效；本地验收端口也没有与当前开发服务对应。
- 根因：自动弹出条件额外要求 `confirmed === false`，与后台“进入即弹”语义冲突；浏览器已有已读事件时该条件永远不成立。
- 后续避免：公告验收必须覆盖新访客、已读访客和编辑后新版本；同时检查当前页面端口、`/api/public/notices` 的 `autoPopup/confirmed/updatedAt` 和弹窗 DOM。
- 验证环境与结果：`pnpm exec eslint app/components/PublicNoticeCenter.vue`、`pnpm typecheck` 和 `pnpm build` 通过；生产接口返回 `autoPopup: true`；发布后 `yeu.service` 为 active，源站与 `https://yx.huiliyill.cn/api/health` 均返回 `status: ok`，已读访客刷新线上首页仍实际出现“公告详情”弹窗。
- 发布/回滚信息：提交 `4275261` 已推送 `origin/master` 并发布到 `/www/wwwroot/yeu/releases/20260801-223300-4275261`；旧 release `/www/wwwroot/yeu/releases/20260801-221833-33e0c11` 保留为直接回滚点。
- 架构变化：公告弹出策略由“自动弹出且未读”调整为“后台开启即弹出一次；已读只影响列表状态”，已同步 `docs/ARCHITECTURE.md`。
- 后续动作：新公告关闭 `autoPopup` 后再做一次负向验收，确认关闭开关时不会弹出；继续保留新访客、已读访客和编辑后新版本三个公告回归场景。

## 2026-08-01 · 公告实际不弹出复核与新版本已读修复

- 本次目标：调查线上公告开启自动弹出后，前台实际没有弹窗的问题，并补齐可重复验证的触发时机。
- 实际完成：确认公开接口返回 `autoPopup: true`；前台公告中心改为等待客户端水合和公告数据完成后再触发；公告编辑后按 `contents.updatedAt` 区分新版本，旧版本的 `notice_confirm` 不再压住新版本提示；同步更新架构说明。
- 未完成或待确认：当前浏览器已有该公告的已读事件，按设计不会重复弹出同一版本；尚未在一个完全没有站点 Cookie 的真实移动 WebView 中观察自动弹出动画。
- 做得好的地方：先对比源码、公开接口、生产页面和浏览器可见状态，确认不是 `autoPopup` 字段丢失；手动打开公告验证列表/详情组件仍可用；保留原有访客统计和数据库结构，无需迁移。
- 做得不好的地方：首次只看到了“没有弹窗”的表象，没有立即区分旧浏览器缓存、当前访客已读状态和代码触发时机；本地 `127.0.0.1:3000` 实际是旧离线页面，不能代表当前源码。
- 根因：当前访客已读状态会跳过同一版本的自动弹出；初次触发又依赖水合时序，编辑公告后的新版本没有单独的已读边界；本地旧服务/离线缓存进一步造成版本误判。
- 后续避免：验收公告必须分别使用新访客、已读访客和编辑后的新版本；先检查 `/api/public/notices` 的 `autoPopup`、`confirmed`、`updatedAt`，再判断 UI；本地验证必须确认端口对应当前构建，不能把旧离线页当作开发服务。
- 验证环境与结果：生产 `https://yx.huiliyill.cn/api/public/notices` 返回 `200`、`Cache-Control: no-store`、`autoPopup: true`；线上浏览器手动打开公告列表成功，确认已读状态可见；Windows 工作区 `E:\yeu` 的公告定向测试 3 项、ESLint、`nuxt typecheck`、生产构建和 `git diff --check` 通过；发布后服务器本机 `/api/health`、公网 `/api/health` 和公告接口均正常。
- 发布/回滚信息：提交 `33e0c11` 已推送个人仓库 `origin/master` 并发布到 `/www/wwwroot/yeu/releases/20260801-221833-33e0c11`；旧 release `/www/wwwroot/yeu/releases/20260801-215000-03e9020` 保留为直接回滚点，`yeu.service` 已恢复 `active`。
- 架构变化：公告读取增加“版本化已读”边界，前台自动弹出改为客户端数据水合后的可靠触发；仍使用现有 `contents` 和 `visitor_events`，无数据库迁移。
- 后续动作：用新访客、同版本已读访客、编辑后新版本、失效时间和移动端页面各验一次；当前浏览器要先清理站点数据或改动公告并保存，才能观察同一版本的再次弹出规则。

## 2026-08-01 · 公告自动弹出开关显性化与线上发布

- 本次目标：让后台公告编辑器提供清晰的“进入前台时自动弹出”开关，并确保保存、前台弹窗和已读统计使用同一状态。
- 实际完成：公告编辑器顶部新增醒目的 `metadata.autoPopup` 开关，字段分组不再重复显示；公开公告 API 返回 `autoPopup`；公告中心首次挂载时打开第一条未读自动公告并照常记录已读；增加定向回归断言。
- 未完成或待确认：尚未用真实管理员账号在浏览器里点击保存并观察弹窗；需要实际把某条公告设为自动弹出后，再用新访客和已读访客各验一次。
- 做得好的地方：复用了现有公告已读、置顶和有效期模型，没有新增数据库迁移；只提交公告相关 5 个文件，保留工作区其他未完成改动；发布前使用服务器现有 Linux ELF SQLite 模块替换 Windows 构建模块，并保留上一 release 回滚点。
- 做得不好的地方：第一次发布包解到了 release 根目录，服务器约定的入口是 `release/.output/server/index.mjs`，导致服务短暂循环重启；随后已回滚并按正确目录重新发布。
- 根因：后台原先只有分组字段，开关不够显眼，且本地改动尚未进入线上 release；发布包层级没有在切换前检查 systemd 的实际 `ExecStart` 路径。
- 后续避免：公告开关必须同时覆盖后台字段、服务端返回、前台状态和定向测试；每次发布切换前检查 `release/.output/server/index.mjs`、原生 `.node` 文件格式，并等待服务连续通过健康检查后再报告成功。
- 验证环境与结果：Windows 工作区 `E:\yeu`；定向测试 12 项通过，`nuxt typecheck` 通过，生产构建成功；线上 `yeu.service` active，源站和 `https://yx.huiliyill.cn` 的 `/api/health` 均返回 `status=ok`、`database=ready`，`/api/public/notices` 返回 `autoPopup` 字段。
- 发布/回滚信息：提交 `03e9020` 已推送 `origin/master`；生产 release 为 `/www/wwwroot/yeu/releases/20260801-215000-03e9020`；上一版本 `/www/wwwroot/yeu/releases/20260801-204018-baf5d98` 保留为直接回滚点。
- 架构变化：公告元数据增加 `autoPopup` 行为开关；前台公告中心根据公开 API 和访客已读事件执行一次性自动弹出，未改变数据库表结构。
- 后续动作：用真实管理员账号开启一条公告的自动弹出，再分别验证新访客、已读访客和公告失效时间场景。

## 2026-08-01 · 旧域名重定向、AI 缓存优先与公开账号入口隐藏

- 本次目标：将 `yeu.huiliyill.cn` 直接重定向到 `https://yx.huiliyill.cn`；把 AI 检索顺序改为“先缓存、轻量意图和关键词、少量候选、整理答案、写入缓存”；隐藏前台登录、聊天和个人中心入口。
- 实际完成：新增旧域名服务端 301 中间件和 Nginx 重定向 vhost；新增 `assistant_answer_cache` SQLite 持久化表，答案缓存读取提前到大库检索前，未过期命中直接返回；本地候选默认收窄为 4 条，并将直接回答、公交 API、本地答案、网页答案统一写入缓存；公开默认布局、服务导航移除账号/聊天/个人中心入口，受保护路由和后台登录能力保留。
- 做得好的地方：先用公网 HTTP/HTTPS 与服务器 Nginx 配置确认旧域名实际仍返回站点、HTTPS 边缘握手异常，再补应用层和源站层两道重定向；用迁移表而不是把进程内 Map 当作唯一缓存；先跑定向回归测试再继续部署。
- 做得不好的地方：第一次生成迁移时把已存在的 `0019` 字段重复带入 `0020`，导致测试迁移遇到空语句；已删除重复语句并重新验证。当前旧域名 HTTPS 的 CDN 证书状态仍需控制台侧确认，源站配置只能覆盖请求到达服务器的情况。
- 根因：答案缓存原先只在进程内、且在部分快速规则和大范围检索之后才检查；旧域名配置被整体禁用后没有留下专用重定向 vhost；账号入口在布局和服务页各自维护，隐藏时容易漏项。
- 后续避免：数据库迁移生成后必须检查是否重复包含上一迁移的手工字段；域名切换必须同时验证应用中间件、Nginx vhost、CDN HTTPS 证书和公网 HTTP/HTTPS；公开入口变更要做 `/login`、`/chat`、`/me` 字符串扫描和浏览器首屏检查。
- 验证环境与结果：`scripts/discover-presentation.test.ts`、`scripts/assistant-feature-search.test.ts`、`scripts/student-rules.test.ts` 共 28 项通过；迁移空语句问题修复后定向测试全部通过。尚未完成本轮生产构建、数据库迁移和线上切换。
- 发布/回滚信息：待构建和线上切换后补充 commit、release、旧 release 回滚点、迁移备份和旧域名 301/HTTPS 实测结果。
- 架构变化：AI 增加 `assistant_answer_cache` 持久化层，检索顺序变为缓存优先、轻量分析、少量候选、网页兜底、答案写回；域名拓扑增加旧域名只重定向、不渲染应用的边界。
- 后续动作：执行 `pnpm typecheck`、`pnpm build`，部署前备份并迁移 SQLite，原子切换 release 后验证 `yeu` 301、`yx` 页面/AI/健康接口，最后补齐本条发布信息。

## 2026-08-01 · 唯一域名切换、CDN 恢复与品牌风险收口

- 本次目标：将生产唯一入口切换为 `yx.huiliyill.cn`，停止旧迎新域名线路，恢复腾讯 CDN 访问，并复查可能让用户误认成学校官方或侵犯学校内容权利的风险。
- 实际完成：客户端路由、运行时地址、微信分享、机器人尾链、允许来源、robots、sitemap、Nginx 和生产环境均统一到新域名；腾讯 CDN 回源 Host 为新域名，回源协议改为 HTTP，HTTPS 托管证书部署成功；提交全站目录“刷新全部资源”清除旧首页和已撤媒体缓存；旧 `yeu.huiliyill.cn` CDN 域名已提交关闭；学校校徽、旧 Logo、官网平面图、完整手册 PDF 和手册拆图均从公开资源撤下；知识图谱和欢迎公告统一使用“迎新指南”品牌；完整代码同步至个人仓库 `lilei1529/yeu`。
- 未完成或待确认：`cn`、`global` 线路按本次要求不启用；本审计不是律师法律意见；吃喝玩乐配图、宿舍实拍、社团上传图片/二维码和联系人肖像仍需逐项保存可审计授权；旧 CDN 域名关闭为异步任务，需在控制台最终显示“已关闭”。
- 做得好的地方：先用源站直连和 `/api/health` 证明应用、数据库和新运行时配置正常，再定位 CDN；新版本构建、上传和校验期间保持旧版本运行，切换后保留上一 release 和数据库备份；同时验证 HTTP 跳转、HTTPS 证书、首页、地图、搜索、分享接口、robots、sitemap、备案号及高风险旧资源 404。
- 做得不好的地方：首次远程发布脚本由 Windows 管道传输时保留了 CRLF，导致最后一条 `curl` 带回车并误报失败，虽然新服务实际已经健康；工作区仍有历史发布压缩包和性能分析文件未纳入本次清理，不能把它们误提交；完整工程已有的包体和重复导入警告尚未在本轮解决。
- 根因：`514 Frequency Capped` 不是源站限流，而是腾讯 CDN 的 HTTPS 服务仍在部署，控制台明确说明 HTTPS 关闭或未生效时固定返回 514；HTTPS 恢复后首页继续返回 5 月旧 138 字节页面，是 CDN 根目录缓存未刷新；旧产品名分散在动态公告和知识图谱元数据中，单纯修改页头不能完全收口。
- 后续避免：域名切换必须执行“DNS/CNAME -> CDN 启动状态 -> HTTPS 证书和部署状态 -> 回源协议/Host -> 源站直连 -> 全站缓存刷新 -> 公网页面/API -> 旧域名关闭”的固定清单；远程 Bash 脚本从 Windows 发送前统一转换 LF；品牌扫描同时覆盖静态页面、服务端元数据、动态数据库、分享卡片和缓存；未经授权的完整文件或图片不得重新进入公开目录和 CDN。
- 验证环境与结果：Windows 工作区执行知识图谱、图谱交互和公开媒体 12 项测试全部通过，新增标题回归 5 项通过，`pnpm typecheck` 通过，`pnpm build` 成功；腾讯 CDN 公网实测 `/`、`/map`、`/discover`、`/search`、robots、sitemap 和健康接口均为 200，四个已撤资源均为 404；证书 CN/SAN 均为 `yx.huiliyill.cn`，有效期至 2026-10-30；真实浏览器首页标题为“首页 | 迎新指南”，地图检测到高德容器和 canvas，未出现加载、重试或失败状态。
- 发布/回滚信息：代码提交 `4cd1c43` 完成域名与公开资源切换，`4b8712e` 完成知识图谱品牌收口；两次提交均已推送个人仓库 `origin/master`，后者也保留在组织仓库副本；生产 release 为 `/www/wwwroot/yeu/releases/20260801-193431-4b8712e`，上一版本 `/www/wwwroot/yeu/releases/20260801-193000-4cd1c43` 为直接回滚点，数据库备份为 `/www/wwwroot/yeu/shared/data/backups/yeu-before-yx-20260801.sqlite`。
- 架构变化：生产唯一公开入口和 CDN 拓扑改为 `yx.huiliyill.cn -> 腾讯 CDN -> Nginx -> yeu.service`；`docs/ARCHITECTURE.md`、`docs/DEPLOYMENT.md` 与品牌风险审计已同步，业务数据库和 API 边界未变化。
- 后续动作：逐项补齐图片/肖像/上传内容授权记录与投诉下架流程；确认旧 CDN 域名最终关闭；观察新域名首日 4xx/5xx、回源量、流量封顶和证书告警。

## 2026-07-31 · Gitee 组织仓库结构与配置说明

- 本次目标：把当前组织仓库的目录结构、远程配置、环境变量、数据库边界、发布目录和成员权限检查写入 Git，方便新成员接手。
- 实际完成：更新 `docs/GIT_RESOURCES_AND_CONFIGURATION.md`；仓库地址统一为 `newcomers-guide/yeu`；补充 `organization`/`origin` 远程的职责、当前目录树、本地与生产配置、组织成员加入后的权限检查和常用 Git 命令；确认 `andylyj` 在组织成员页显示为管理员。
- 未完成或待确认：未改变 Gitee 的仓库可见性、分支保护或服务器配置；仓库成员页是否仍显示管理员权限，需要由该账号重新登录后在目标账号侧验证。
- 做得好的地方：先读取实际远程、目录和组织成员状态，再按当前组织仓库修正文档；明确区分代码、运行数据库、密钥、上传文件和临时发布包，避免把工作区杂物带入提交。
- 做得不好的地方：原文档沿用了个人仓库地址，容易让新成员误推到错误远程；本次只更新了协作说明，尚未把远程检查自动化为 CI 门禁。
- 根因：仓库从个人空间迁移到组织后，文档中的远程和权限边界没有同步更新。
- 后续避免：仓库迁移、成员授权或部署拓扑变化时，必须同时检查 README、Git 配置文档、部署手册和发布脚本；发布前执行 `git remote -v` 与目标仓库/分支核对。
- 验证环境与结果：Windows 工作区 `E:\yeu`；已检查 `git remote -v`、组织成员页、仓库设置页和目录；文档修改后执行 `git diff --check`，未运行完整代码测试（本次仅文档变更）。
- 发布/回滚信息：主文档提交 `e05bf2e` 已推送到 `organization/master`；本条复盘同步提交随后推送，回滚时可恢复这两次文档提交。
- 架构变化：无运行时架构变化；仅更新协作、权限和资源边界文档。
- 后续动作：提交并推送两份文档，随后在组织仓库页面检查最新 commit 和文件内容。

## 2026-07-31 · 站点品牌统一为迎新指南

- 本次目标：移除公开页面中的学校校标和旧品牌标题，统一使用“迎新指南”。
- 实际完成：前台导航、开场动画、展示页、地图/全景/知识图谱标题、后台登录与布局、PWA/分享元数据、错误页、测试断言和 AI 兜底自称已统一；不再引用 `/icons/yeu-seal.jpg` 或 `/icons/site-logo.png`。官方链接、公交站名、地图地点和资料来源中的学校名称继续保留，确保导航和证据可核验。
- 未完成或待确认：旧二进制图片文件仍留在仓库中但没有运行时引用；如要彻底从仓库历史移除，需要单独做资源清理和 CDN 缓存确认。
- 做得好的地方：先按“品牌文案”和“业务事实”分层清理，没有替换真实地点、来源链接或检索关键词；补齐了旧 E2E/单元测试中的过期标题。
- 做得不好的地方：此前只更新页面源码，测试和服务端兜底文案仍残留旧品牌，说明品牌词没有集中常量或发布前扫描门禁。
- 根因：旧品牌散落在布局、展示页、元数据、测试和回答兜底中，且校名同时承担事实名称和品牌名称，缺少边界清单。
- 后续避免：品牌变更必须同时扫描 `app/`、`server/`、E2E/脚本测试和 PWA 元数据；事实名称只在导航、来源和内容证据中保留；发布前执行旧品牌字符串扫描并人工检查分享卡片。
- 验证环境与结果：Windows 工作区 `E:\yeu`；已执行 `git diff --check` 和旧品牌扫描，未执行完整构建与线上验证。
- 发布/回滚信息：待本轮测试、构建和部署后填写 release、commit 与回滚点。
- 架构变化：无运行时架构变化；更新 `docs/ARCHITECTURE.md` 的适用范围和开场动画标识说明。
- 后续动作：运行定向测试和 `pnpm typecheck`，构建 Linux 兼容发布包，保留当前线上 release 后再原子切换并做健康检查。

## 2026-07-31 · 建立任务复盘规则库与当前架构基线

- 本次目标：建立每次任务都可追加的复盘规则，并把当前系统的真实架构补齐到初始文档。
- 实际完成：新增本规则文档；更新 `ARCHITECTURE.md` 的生产守护、发布形态、AI/知识库、地图兼容、公开与后台模块边界；同步 `DATA_MODEL.md` 的账号、群聊、访客、功能开关和知识实体；同步 `DEPLOYMENT.md` 的 systemd 发布方式；在文档索引中加入规则库入口和同步要求。
- 未完成或待确认：本次没有修改业务代码、数据库和线上配置；生产服务器的实时状态仍以部署检查和监控结果为准。
- 做得好的地方：先检查了现有架构、部署文档、代码目录和最近提交，发现并纠正了 PM2 与 `systemd yeu.service` 的文档偏差；保留现有大篇幅领域说明，避免无关重写。
- 做得不好的地方：历史文档较早形成，长期缺少统一的完成标准，导致“已实现、已验证、已部署、计划中”容易被混写；本次仅完成文档层治理，尚未把规则自动化为 CI 门禁。
- 根因：项目功能快速迭代，文档更新依赖人工记忆；部署拓扑和 AI/知识库能力后来扩展，但旧架构章节没有同步收口。
- 后续避免：每次任务结束前必须追加本模板记录；涉及架构的任务必须同时更新 `docs/ARCHITECTURE.md`；把重复出现的复盘问题转成测试、脚本或发布清单。
- 验证环境与结果：在 Windows 工作区 `E:\yeu` 检查文档、目录、脚本、服务端模块和 Git 历史；文档变更后执行 `git diff --check`。
- 发布/回滚信息：无代码发布；文档变更可通过 Git 回退。
- 架构变化：建立复盘规则库；`ARCHITECTURE.md`、`DATA_MODEL.md` 和 `DEPLOYMENT.md` 明确 Nuxt/Nitro 单体、SQLite/Drizzle、`systemd yeu.service`、release/current/shared 发布布局、AI 检索路径、知识库实体、账号/聊天/访客边界和地图 provider 边界。
- 后续动作：把规则库链接加入项目级贡献/发布检查；在下一次跨模块任务中验证复盘记录是否完整，并按实际变化继续更新架构文档。

## 2026-07-31 - AI 身份检索与线上发布复盘

- 本次目标：修复“吴庆星是谁”被官网文章开头和网页缓存误导的问题，修正答案阶段耗时显示，并把已验证的 AI/地图修复发布到线上。
- 实际完成：审核身份条目优先于叙事型官网文章；普通文章不再进入身份问题的快速摘要分支；身份检索缓存版本升级；新增文章元数据回归测试；发布 `2a58f03` 对应 release。
- 做得好的地方：先用源站和生产日志区分了 CDN/应用缓存、数据库命中和模型回答；新包切换失败时保留并自动回滚旧 release；发现 Windows 原生 `better_sqlite3.node` 后改用线上 Linux ELF 依赖再发布。
- 做得不好的地方：第一次发布包解压层级错误，第二次才发现构建包携带了 Windows 原生模块；线上冒烟一度只看域名响应，没有第一时间对比源站直连响应。
- 根因：身份检索的“审核条目”和“官方长文”共用排序；构建发布在 Windows 端打包了平台相关原生依赖；缓存命中显示未区分旧响应来源。
- 后续避免：发布包必须在切换前检查 `.output/server/index.mjs` 和所有 `.node` 文件格式；身份、政策、功能入口等高风险意图必须有独立优先级和回归问题；域名/CDN 验证同时执行源站直连、响应头和请求日志核对。
- 验证环境与结果：`pnpm exec tsx --test scripts/assistant-contact.test.ts scripts/assistant-knowledge.test.ts scripts/student-rules.test.ts`，45 项通过；线上 `yeu.service` active，`/api/health` 200，旧版回滚点保留；新 release 的 Linux `better_sqlite3.node` 为 ELF 64-bit。
- 发布/回滚信息：提交 `2a58f03` 已部署到 `/www/wwwroot/yeu/releases/20260731-171758-2a58f03`，旧 release `/www/wwwroot/yeu/releases/20260731-162100-dfb4676` 保留为回滚点；后续身份逻辑修复已由 `51b650a`、`3695b98` 完成并在本轮发布。
- 架构变化：AI 本地检索增加“审核身份条目 -> 官方文档 -> 已发布声明”的意图优先级；回答缓存版本随路由语义变更递增；发布检查增加平台原生依赖核验。
- 后续动作：提交本轮身份检索修复并重新构建 Linux 兼容发布包；源站直连验证“吴庆星是谁”“什么时候开学”“体育选修有哪些项目”，再验证 CDN 域名返回一致。

## 2026-07-31 · AI 检索计时与确定性回答发布复盘

- 本次目标：修复知识库接入后身份问题被普通官网长文覆盖、确定性问题冷启动扫描过慢，以及答案缓存命中后把前面真实耗时显示成 `<0.1 秒` 的问题。
- 实际完成：身份问题优先读取审核身份条目；开学日期、校规和校园概览先走轻量内存证据；答案缓存版本升级为 `rag-v14-identity-entry-priority`；确定性答案短路检索并保留真实 trace 累计耗时；保留来源权威级别，避免把文章导语直接当人物简介。
- 未完成或待确认：未在真实微信/QQ WebView 内重新跑 AI 问答；本轮只验证生产 HTTPS 域名和服务器源站健康，第三方网页搜索服务未作为成功路径依赖。
- 做得好的地方：先用回归测试锁定身份、开学日期和体育选修三个代表问题，再发布；新 release 切换前检查 `index.mjs`、替换并校验 Linux 原生 SQLite 模块；保留旧 release，服务重启失败时可立即回滚。
- 做得不好的地方：首次线上健康请求发出得太早，服务仍在监听窗口，造成一次误判；发布前的 Windows 打包物仍携带 Windows 原生模块，需要上线前额外替换。
- 根因：知识库扩容后普通全文结果与审核身份条目共用排序；缓存/阶段计时分别计算，命中缓存时没有使用已经发生的分析耗时；Windows 构建环境与 Linux 生产环境的原生依赖不同。
- 后续避免：发布脚本必须等待监听端口和 `/api/health` 连续通过后再判定成功；高风险身份、政策和入口问题必须有独立回归样例；每个答案的 `totalDurationMs` 必须不小于 trace 各阶段耗时之和，并在 CDN 域名和源站各验证一次。
- 验证环境与结果：本地 `pnpm exec tsx --test scripts/assistant-contact.test.ts scripts/assistant-knowledge.test.ts scripts/student-rules.test.ts` 45 项通过，`pnpm typecheck` 通过；生产 `yeu.service` 为 active，源站与 `https://yx.huiliyill.cn/api/health` 均返回 `status=ok`、`database=ready`；生产域名实测“吴庆星是谁”走审核身份缓存，“什么时候开学”走本地数据库（总计约 45ms），“体育选修有哪些项目”走本地数据库（总计约 1.8s），trace 时间与总耗时一致。
- 发布/回滚信息：提交 `51b650a`、`3695b98` 已部署到 `/www/wwwroot/yeu/releases/20260731-174600-3695b98`，`current` 已原子切换；上一版 `/www/wwwroot/yeu/releases/20260731-173706-51b650a` 保留为直接回滚点，服务由 `systemd yeu.service` 管理。
- 架构变化：AI 编排增加确定性答案的轻量短路层，缓存版本和 trace 计时成为同一回答契约；生产发布继续采用 `release/current/shared + systemd`，并把平台原生依赖检查列为切换前门禁。已同步 `docs/ARCHITECTURE.md` 的 AI 检索优先级说明。
- 后续动作：把“等待监听 -> 健康检查 -> 源站/公开域名双验 -> 原生模块格式检查”固化到发布脚本；下一轮在微信/QQ WebView 验证流式 AI 与地图兼容，不把桌面浏览器结果当作替代。

## 2026-08-02 · 公告详情弹窗布局复盘

- 本次目标：移除公告详情顶部的返回层，把已读状态放到“xx 人已读”右侧，并区分列表进入和强制弹出的关闭行为。
- 实际完成：详情内容从元信息行直接开始；阅读人数与已读/未读状态合并到右侧；列表进入详情后关闭回到列表，自动弹出公告关闭后直接结束；增加来源状态和回归断言。
- 做得好的地方：没有改动公告确认接口、阅读统计或自动弹出数据结构，只调整前台交互状态；关闭行为由组件统一处理，避免不同关闭入口出现分叉。
- 做得不好的地方：之前公告排序发布时遗漏了这项视觉与交互要求，导致顶部返回层仍然存在；后续应按截图逐项核对布局，而不是只验证接口和排序。
- 根因：上一轮只覆盖公告排序和后台字段，没有把详情弹窗的视觉验收项纳入任务清单。
- 后续避免：公告弹窗验收必须检查标题下方是否有多余层、阅读统计位置、列表详情切换、自动弹出关闭和移动端窄屏换行。
- 验证环境与结果：`pnpm exec tsx --test scripts/notice-presentation.test.ts` 3 项通过；定向 ESLint、`pnpm typecheck` 和 `pnpm build` 通过。
- 发布/回滚信息：提交 `f2a6627` 已推送个人仓库和组织仓库，并发布到 `/www/wwwroot/yeu/releases/20260802-074522-f2a6627`；上一版 `20260802-070655-883b42d` 保留为直接回滚点，`yeu.service` 已恢复 active。
- 架构变化：公告中心增加详情来源状态，关闭动作根据 `list/auto` 选择回列表或关闭弹窗；阅读状态仍由 `notice_confirm` 统计提供。
- 后续动作：发布后用桌面端和移动端各验证一次列表详情关闭、自动弹出关闭以及阅读人数/状态的同一行布局。

## 2026-08-02 · 公告排序规则复盘

- 本次目标：让公告可以在后台配置顺序，同时保证未配置时按发布时间倒序显示。
- 实际完成：新增公告排序工具；置顶公告仍优先；可在公告编辑器的“前台/公告排序”中填写数字，数字越小越靠前；公告中心和内容列表使用同一排序契约。
- 做得好的地方：保留原有置顶、有效期、自动弹出和阅读统计逻辑，只扩展公告元数据，没有新增数据库表或迁移；用单元测试覆盖手动顺序、置顶、时间倒序和不修改输入数组。
- 做得不好的地方：首次构建超出 120 秒命令窗口，延长超时后才完成；后续发布前应按项目实际构建耗时设置等待窗口。
- 根因：原公告中心只在内存中按置顶和时间排序，后台表单没有暴露公告顺序字段；通用内容查询也没有公告专用的置顶排序。
- 后续避免：任何公告排序改动都要同时检查公告中心、校园公告列表和后台编辑器；不要把部门/社团的顺序字段误套到公告上；发布后验证接口返回顺序并保留上一 release 回滚点。
- 验证环境与结果：`pnpm exec tsx --test scripts/notices.test.ts` 2 项通过；定向 ESLint 通过；`pnpm typecheck` 通过；`pnpm build` 通过。
- 发布/回滚信息：本轮代码尚未切换生产 release；部署前需先提交变更并按 `docs/DEPLOYMENT.md` 的 `release/current/shared + systemd yeu.service` 流程发布。
- 架构变化：公告排序从公告服务内的临时比较器扩展为共享排序契约，`metadata.sortOrder` 成为可选的公告排序字段，未设置时回退到发布时间倒序。
- 后续动作：发布后核对 `/api/public/notices` 和 `/api/public/content?kind=notice` 的顺序；分别创建有序、无序、置顶公告做线上回归。

## 2026-08-02 · 移动端地图与公告布局发布复盘

- 本次目标：修复移动端地图地点列表滚轮带动整页、地点列表与浏览量重叠、公告弹窗留白过大及构建被大图预缓存阻塞的问题，并发布到生产环境。
- 实际完成：地点列表改为独立滚动容器并拦截 wheel/touch 事件，增加 `overscroll-behavior`；浏览量与列表在底部独立停靠；公告标题/置顶标识补充图标并压缩详情滚动区域；校园宣传大图改为按需加载，避免 Workbox 超过预缓存大小限制；相关回归测试已更新。
- 做得好的地方：先通过移动端真实滚轮与页面 `scrollTop` 验证交互边界，再进行布局调整；发布包单独用生产环境变量启动并通过 `/api/health`，保留旧 release 以便原子回滚。
- 做得不好的地方：发布前误把另一套业务占用的 3011 端口当成 smoke test 进程，所幸在确认进程命令后未执行停止；当前发布脚本仍需明确区分测试端口与其他项目端口。
- 根因：地图列表和外层面板共享滚动上下文，底部信息没有形成稳定布局层；公告内容区使用了过大的固定留白；大尺寸静态资源被默认纳入 Workbox 预缓存。
- 后续避免：移动端验收必须同时检查列表 `scrollTop`、页面 `scrollTop`、底部元素边界和长标题换行；远程清理进程前必须核对 PID 的完整命令行和监听端口；发布前检查所有超过预缓存阈值的静态资源。
- 验证环境与结果：`pnpm typecheck`、定向测试 33 项和 `pnpm build` 通过；新 release 独立启动时 `/api/health` 返回 `status=ok`、`database=ready`；切换后生产服务 active，本机源站与 `https://yx.huiliyill.cn` 的首页、`/map`、`/api/health`、`/api/public/notices` 均返回 200；浏览器实测地点列表独立滚动且页面 `scrollY` 保持 0，底部浏览量不重叠。
- 发布/回滚信息：版本 `93c723e` 已部署并原子切换到 `/www/wwwroot/yeu/releases/20260802-063000-93c723e`；上一版 `/www/wwwroot/yeu/releases/20260802-014200-0602eea` 保留为直接回滚点，服务由 `systemd yeu.service` 管理。
- 架构变化：移动端地图交互明确为“外层页面 + 地点列表 + 底部统计”三层滚动/停靠边界；公告详情内容采用独立滚动区；大图从离线预缓存迁移到运行时按需加载。
- 后续动作：后续若 CDN 仍返回旧资源，只刷新对应页面缓存，不删除共享数据或旧 release；新一轮移动端改动继续同时检查列表滚动、底部统计和公告弹窗。

## 2026-08-02 · 移动端地图视口与滚动边界修复发布复盘

- 本次目标：修复移动端地图被顶部导航覆盖、地点列表手势落到地图导致地图被拖动，以及内置浏览器视口变化造成地图重排的问题。
- 实际完成：默认地点面板提高到稳定高度；地点列表使用独立滚动区域并隔离 wheel/touch 事件；地图工作区固定在顶部导航与底部导航之间；使用 `svh`、安全区和 `overscroll-behavior` 约束滚动边界；补齐干净构建所需的浅色标志资源。
- 做得好的地方：先用移动端视口实测列表 `scrollTop`、页面 `scrollY` 和地图工作区顶部位置，再进行发布；构建失败时旧服务始终保持 active；暂存 release 在 3100 端口先通过健康、地图和静态资源检查后才原子切换。
- 做得不好的地方：服务器 4C4G 的 Nitro 构建受到 Node 堆上限和可用内存限制，先后两次在最后打包阶段 OOM；干净克隆还发现一个未跟踪的浅色标志资源，暴露出本地构建与仓库构建不一致。
- 根因：地图列表与外层面板共享滚动上下文；`100dvh` 随内置浏览器地址栏变化触发重排；发布流程未先核对生产构建资源和服务器可用堆空间。
- 后续避免：移动端地图验收必须同时检查导航遮挡、列表/页面/地图三者滚动边界、`svh` 视口稳定性和长列表触摸行为；发布前执行干净克隆构建检查静态资源；4C4G 服务器优先采用本地构建加 Linux 原生模块替换，并保留旧 release。
- 验证环境与结果：地图定向测试 16 项、受影响文件 ESLint、`pnpm typecheck` 和 `pnpm build` 已通过；暂存产物健康接口返回 `database=ready`；生产 `yeu.service` active，源站与 `https://yx.huiliyill.cn` 的 `/api/health`、`/map`、`/api/public/notices` 和浅色标志资源均返回 200。
- 发布/回滚信息：提交 `60ec23f` 与构建资源修复提交 `8feb6e4` 已推送个人和组织仓库；当前 release 为 `/www/wwwroot/yeu/releases/20260802-011500-8feb6e4`，上一版 `/www/wwwroot/yeu/releases/20260802-074522-f2a6627` 保留为直接回滚点。
- 架构变化：移动端地图明确为“固定地图工作区 + 独立地点列表 + 底部统计”的滚动边界；发布流程增加临时端口 smoke test、原生模块格式检查和原子 current 切换。
- 后续动作：在微信/QQ WebView 真实设备上再次核对地图手势；若 CDN 仍返回旧页面，只刷新页面资源缓存，不删除共享数据或旧 release。
## 2026-08-02 - Anti-crawl and honeypot review

- Evidence: the 2026-07-31 to 2026-08-02 origin logs contain repeated GPTBot, HeadlessChrome, Bytespider and Go-http-client requests across public pages and APIs. The Coze mirror is treated as a public-content copy; no secret, admin endpoint or database leak was found in its downloaded HTML.
- Completed: explicit automation-UA blocking at Nginx with path exemptions, application-layer fallback for direct-origin requests, an unlisted honeypot route that records `crawler_honeypot` and creates a 30-minute IP ban, and AI crawler disallow rules in `robots.txt`.
- Good: Nginx and Nitro protections are layered; ordinary Chrome, Android and WeChat UAs remain allowed; robots, sitemap, health, admin and verification paths are not blocked. The trap is rate-limited and returns no cacheable content.
- Avoid: UA matching cannot stop a forged browser header. Do not treat this as a guarantee against copying; sensitive material should move behind signed/session APIs, and Tencent CDN/WAF bot challenges, rate limits, content watermarking and platform/legal complaints remain the stronger controls.
- Verification: run `pnpm exec tsx --test scripts/anti-crawl.test.ts`, `pnpm typecheck`, `pnpm build`, `nginx -t`, then verify normal browser, blocked automation UA, robots, health and honeypot responses. Keep all timestamps in China Standard Time (UTC+8), including the July 31 evidence window.
- Deployment result: release `20260802-anti-crawl-1748` is active, the service health endpoint is ready, the public CDN checks returned normal 200 / WeChat 200 / known automation 403, and the honeypot returned 404 while recording the event.
- Deployment mistake caught: the first upload was unpacked without the `.output` directory level; the service failed fast, the cause was identified from `journalctl`, the release was repaired in place before final verification, and the old release remains available for rollback.

## 2026-08-02 - Same-origin API transport boundary

- Goal: allow browser requests from the public site to read application data while rejecting direct no-context API access and keeping health checks and server callbacks available.
- Completed: centralized the trusted-origin allowlist in `server/utils/security.ts`; added `server/utils/api-origin.ts` and the global `01-api-origin-guard` middleware; API responses now send no-store edge headers and `s-maxage=0`; transit responses keep an in-process cache but are private and never shared by CDN.
- Good: the guard runs before handlers, uses Origin plus Fetch Metadata/Referer evidence, keeps `/api/health` and `/api/integrations/**` as explicit exceptions, and has pure decision tests for same-origin, cross-site and missing-source cases.
- Avoid: do not rely on CORS alone, do not allow `same-site` as a substitute for the exact public origin, and do not add a broad no-header exception for convenience. Advanced clients can forge browser headers, so keep CDN/WAF, rate limits, logging and endpoint-level authentication in place.
- Verification: targeted TypeScript tests, ESLint and Nuxt typecheck passed; an isolated production build completed in `.output-api-origin`; local runtime returned 403 for a bare API request, 200 with same-origin headers, 503/200-class reachability for health depending on local readiness, and 200 for the SSR homepage.
- Deployment follow-up: publish with `release/current/shared + systemd yeu.service`; set `NUXT_PUBLIC_SITE_URL=https://yx.huiliyill.cn` and review `NUXT_ALLOWED_ORIGINS` in the shared environment; configure Tencent CDN `/api/*` as no-cache and purge existing API cache entries after switching.

## 2026-08-02 - Same-origin API transport boundary deployed

- 本次目标：让数据传输 API 只接受来自迎新指南网页的浏览器请求，拒绝无来源直连和跨站读取，同时保留健康检查、微信/QQ/公众号等服务端回调。
- 实际完成：提交 `f27fe8f` 已发布；全局 API 来源守卫已在 `server/middleware/01-api-origin-guard.ts` 启用，统一使用 `Origin`、`Sec-Fetch-Site` 和同源 `Referer` 判断；API 响应增加 `no-store` 边缘缓存头，Transit 的进程内缓存不再共享到 CDN；`/api/health` 与 `/api/integrations/**` 保持明确放行。
- 做得好的地方：先保留并验证旧版本，再原子切换 `current`；切换前确认 Linux `better_sqlite3.node` 为 ELF，避免 Windows 原生模块导致服务启动失败；同时做源站和公网 CDN 验证，确认普通网页请求不受影响。
- 做得不好的地方：来源头校验只能阻止普通无上下文直连，不能阻止攻击者伪造 `Origin` 或浏览器元数据；它不是身份认证，不能单独当作防复制的绝对保证。
- 根因：此前 API 只依赖前端调用约定，公开路径缺少统一的请求来源边界，外部客户端可以直接读取 JSON；CDN 也没有统一的 API 私有缓存策略。
- 后续避免：不要为了兼容脚本增加无来源放行；需要更高保护时叠加腾讯 CDN/WAF、限流、登录/签名令牌和接口级授权；新增服务端回调必须明确写入集成白名单并做回归测试。
- 验证环境与结果：`scripts/api-origin.test.ts` 4 项通过；源站 `/api/health` 返回 `200`、`database=ready`；源站和 `https://yx.huiliyill.cn` 上无来源 `/api/public/features` 均返回 `403`，带 `Origin: https://yx.huiliyill.cn` 和 `Sec-Fetch-Site: same-origin` 均返回 `200`，`cross-site` 返回 `403`；公网首页返回 `200`，API 响应为 `Cache-Control: private/no-store`、`CDN-Cache-Control: no-store`，CDN 检查为 Cache Miss；微信回调路径未被来源守卫拦截。
- 发布/回滚信息：生产 `current` 已切换到 `/www/wwwroot/yeu/releases/20260802-api-origin-f27fe8f`，`yeu.service` 当前 `active`；上一版 `/www/wwwroot/yeu/releases/20260802-anti-crawl-1748` 保留为直接回滚点。
- 架构变化：数据 API 增加“网页来源边界”层，边界位于所有 API handler 之前；集成回调和健康探针仍是服务端例外，CDN 不再缓存 API 数据。
- 后续动作：继续观察 4C4G 服务器的 403/5xx、CDN 缓存和正常浏览器请求；若接入新域名，先把域名加入生产来源配置并分别验证源站、CDN 和内嵌浏览器。

## 2026-08-02 - 腾讯云 CDN 防护配置

- 本次目标：在腾讯云 CDN 为 `yx.huiliyill.cn` 增加防护，同时保证普通浏览器、微信/QQ 内置浏览器和网站自身 API 正常访问。
- 实际完成：开启单 IP 单节点访问限频 `30 QPS`；新增 `/api` 目录节点缓存规则为“不缓存”；开启 UA 黑名单并加入 10 个明确的 AI/采集器标识：`GPTBot`、`OAI-SearchBot`、`ChatGPT-User`、`ClaudeBot`、`Bytespider`、`CCBot`、`Google-Extended`、`PerplexityBot`、`Amazonbot`、`Applebot-Extended`。
- 做得好的地方：没有启用高误伤风险的防盗链、区域封禁或全站鉴权；没有拦截 `HeadlessChrome`、`curl`、Chrome、微信和 QQ 标识，保留自动化测试与内嵌浏览器兼容性；API 缓存规则和应用层来源守卫形成双层边界。
- 做得不好的地方：第一次提交 18 个 UA 模式被腾讯云拒绝，错误为规则数量超过 10 条；控制台短暂显示“配置正在部署中”，需要刷新后确认最终状态，不能只依据提交动作判断已生效。
- 根因：腾讯云 CDN UA 黑名单按分隔模式计数且单域名上限为 10 条，超过上限会整批失败；CDN 控制台的配置下发是异步的。
- 后续避免：提交 CDN UA 规则前先按平台上限压缩并记录模式数量；每次配置变更都要刷新控制台确认持久化，再从公网分别验证普通 UA、微信 UA、同源 API、无来源 API 和已拦截 UA。
- 验证环境与结果：腾讯云控制台显示限频 `30QPS`、`/api` 不缓存和 UA 黑名单已保存；公网普通浏览器首页 `200`，微信 UA 首页 `200`，同源 API `200`，无来源 API `403`，`GPTBot/1.0` 首页 `403`；API 响应保持 `CDN-Cache-Control: no-store`，测试节点均为 Cache Miss。
- 发布/回滚信息：本次为腾讯云 CDN 配置变更，无代码 release；应用代码仍运行 `/www/wwwroot/yeu/releases/20260802-api-origin-f27fe8f`，旧 release `/www/wwwroot/yeu/releases/20260802-anti-crawl-1748` 保留。
- 架构变化：CDN 边缘层增加单 IP 限频、AI/采集器 UA 拦截和 API 私有缓存规则；应用层来源校验、Nginx 反爬和 CDN 防护保持叠加，不依赖单一 UA 规则。
- 后续动作：观察 24 小时 CDN 403、429、5xx 和正常访问指标；若误拦截，先停用对应 UA 规则，不关闭 API 来源守卫或限频整体配置。

## 2026-08-02 - 服务器磁盘清理复盘

- 本次目标：清理服务器硬盘占用，释放空间，同时保证 YEU 网站、数据库、QQ/微信 relay 和现有回滚能力不受影响。
- 实际完成：删除旧构建副本约 845M、过期/无效 release 约 500M、临时部署包和 Node 编译缓存约 800M、Docker 可回收构建缓存约 920M；清理旧 `shared/data/backups` 快照 35 个约 3.6G，仅保留最新 `yeu-before-yx-20260801.sqlite`，并在正式备份目录写入 SHA-256 清单。
- 做得好的地方：先核对 `current`、systemd/cron 引用和备份路径，再执行定向删除；主库、正式 `shared/backups`、上传文件、QQ 配置和当前/最近回滚 release 均未触碰；清理后做了站点、健康接口、relay 和容器复查。
- 做得不好的地方：用户说“内存”时先做了 RAM 侧处理，用户澄清后才转向磁盘；SSH 在高 I/O 期间出现过短暂 banner 超时，但没有影响服务或清理结果。
- 根因：历史发布包、部署临时包、Docker build cache 和旧备份目录长期累积；旧 `shared/data/backups` 已不再被当前配置引用。
- 后续避免：硬盘清理先区分运行数据、正式备份、回滚 release 和临时产物；删除备份前必须核对引用并保留至少一个最新快照和校验清单，不使用全盘 `docker system prune` 或直接删除主库目录。
- 验证环境与结果：磁盘从 `85%` 降至 `78%`，可用空间约 `9.1G`；`yeu.service` active，源站和 `/api/health` 均 `200`；QQ/微信 relay active，NapCat 容器运行正常且内存约 `147 MiB`。
- 发布/回滚信息：本次无代码 release 变更，当前 release 仍为 `/www/wwwroot/yeu/releases/20260802-220000-ai-a592821`；正式备份目录未删除。
- 架构变化：无应用架构变化；运行数据、备份、release 和临时构建物的存储边界得到实际清理和确认。
- 后续动作：补充自动化备份保留策略（例如保留最近 7 天及每日一份），并持续监控 `/www` 使用率，达到 85% 前提前清理临时发布物。

## 2026-08-02 - 微信/QQ 内嵌浏览器入口页 API 上下文修复

- 本次目标：修复 AI 返回功能入口后，微信/QQ 内置浏览器打开页面却显示“页面现在有点忙”的问题。
- 实际完成：页面请求生成 7 天有效的 HMAC 签名 `yeu_page_context` Cookie；API 来源守卫在缺少 `Origin`、`Referer` 和 `Sec-Fetch-Site` 时校验该上下文，兼容内嵌浏览器和 Nuxt 服务端首屏渲染；裸 API 直连、伪造/篡改/过期上下文仍拒绝。
- 做得好的地方：先用纯函数测试覆盖签名、篡改、过期和来源决策，再用真实微信 UA 请求链路验证；发布包使用已验证的 Linux `better_sqlite3.node`，切换前保留旧 release，健康检查失败会自动回滚。
- 做得不好的地方：首次上传归档缺少 `.output` 顶层目录，校验在切换前发现并停止；本地 HTTP smoke test 的 `Secure` Cookie 不会自动回传，后续必须用 HTTPS 或手动 Cookie 头验证，不能把 PowerShell 会话结果误判为线上失败。
- 根因：来源守卫原先只信任浏览器来源头，而微信/QQ X5 WebView 经常不发送这些头；入口页因此能打开，但页面随后调用的 API 被统一返回 `403 API_ORIGIN_REJECTED`。
- 后续避免：新增 API 来源限制时必须同时测试普通浏览器、微信/QQ UA、无来源头、跨站来源、服务端渲染和裸 API；发布归档必须检查 `.output/server/index.mjs`、`.output/public` 和 Linux 原生模块布局。
- 验证环境与结果：`scripts/api-origin.test.ts` 5 项通过；本地生产产物页面 `200`，带签名上下文的无来源 API `200`；线上 `https://yx.huiliyill.cn/` 与 `/map` 页面 `200`，微信 UA 下 `/api/auth/session`、`/api/public/content`、`/api/public/places` 均 `200`；`yeu.service` active，`/api/health` `200`。
- 发布/回滚信息：生产 `current` 已原子切换到 `/www/wwwroot/yeu/releases/20260802-214800-api-origin-context`；上一版 `/www/wwwroot/yeu/releases/20260802-api-origin-f27fe8f` 保留为直接回滚点。
- 架构变化：数据 API 来源边界增加“签名页面上下文”这一兼容层，仍位于所有 API handler 之前；集成回调和健康探针例外规则保持不变。
- 后续动作：继续观察微信/QQ 真机页面首屏和地图入口；若新增公开域名，先同步来源配置、Cookie 安全属性和 CDN API 不缓存规则，再做同样的内嵌浏览器回归。

## 2026-08-04 - 即链迎新指南静态内容镜像

- 本次目标：把迎新系统中的高频新生资料直接整理到即链页面，不把条目整体跳转到 `yx.huiliyill.cn`，并补充学校平面图、宿舍实拍、吃喝玩乐图片、VR 入口和整理者二维码。
- 实际完成：重构三个模块共 18 个条目；全部条目使用站内 Markdown 内容弹层；补齐 2026 级报到时间、新生待办、房型与费用、交通、校园网、办事、奖助、专业片区、社团、部门和信息核验说明；图片上传到即链租户 COS/CDN；百度校园全景、学校 VR 校史馆、地图、公交和规则原文使用明确标题的外部链接；发布版本为线上 v21。
- 做得好的地方：先从仓库现有结构化数据核对时间、费用、片区和规则，再写入镜像；学校平面图与用户提供二维码均在即链自己的图片 CDN 中渲染；使用后台手机实时预览验证大图、二维码、条目层级和弹窗滚动，而不是只检查编辑器文本。
- 做得不好的地方：第一次尝试通过编辑器文件选择器上传图片，但浏览器控制接口不支持 `setInputFiles`，产生了无效操作；宿舍 MP4 被即链上传接口以 400 拒绝，最终只能保留主站媒体直链；即链公开页在桌面 UA 下要求手机打开，无法直接完成桌面公开页交互验收。
- 根因：即链 Markdown 编辑器只开放图片上传，当前上传预签名策略不接受视频；公开页面按移动端使用场景限制桌面访问；第三方镜像没有主站 API 和数据库同步能力。
- 后续避免：先确认第三方编辑器支持的文件类型和自动化能力，再安排素材；视频上线前使用明确可长期维护的媒体存储，不把主站临时路径当成永久 CDN；每次镜像更新必须重新核对报到时间、收费、住宿、政策和链接状态，不能假设主站修改会自动同步。
- 验证环境与结果：即链后台显示草稿 v21 与线上 v21 已同步；手机实时预览中学校平面图和整理者二维码均成功渲染；18 个条目均已改为站内内容；即链图片 CDN、宿舍视频、720 云校史馆和主要外部资料入口在发布前完成可达性检查。
- 发布/回滚信息：本次只修改第三方即链内容和其租户对象存储，无迎新系统代码 release、数据库迁移或服务器切换；即链线上版本可由后台历史草稿继续编辑并重新发布。
- 架构变化：新增“即链静态内容镜像”发布边界；它不连接主站数据库、动态 API、管理员权限或 AI，内容由人工同步和复核。
- 后续动作：用真实手机打开 `https://doc.sourl.cc/jkyxfu` 再检查外部链接唤起、长图缩放和视频播放；若即链后续开放视频上传，把宿舍 MP4 迁入同一租户存储并移除主站媒体依赖。

## 2026-08-04 - 即链小程序封面与原生外链入口

- 本次目标：解决即链小程序正文中的蓝色 Markdown 链接不能点击、完整网址不能长按复制以及卡片缺少封面的问题。
- 实际完成：将 18 个普通 Markdown 外链改为“说明文字 + 独立完整网址”，保留 11 张正文图片；为顶部轮播和 7 个关键条目配置即链租户 CDN 封面；新增“直接打开”模块，使用 10 个即链原生 `link` 动作承载百度校园全景、720 云校史馆、学校地图、四条高德交通路线、两段宿舍实拍和泉州美食入口，全部设置 `open_in_new_tab=false`；线上版本发布到 v23。
- 做得好的地方：先确认后台实时预览确实生成了 `<a href>`，再检查即链“点击后内容”动作模型，区分正文渲染限制和原生跳转能力；没有为了外链跳转丢掉原有详细内容，而是增加独立的直接入口层；图片、网址、动作类型和发布版本均从保存 API 与后台界面交叉核对。
- 做得不好的地方：第一版只把 Markdown 链接改成了完整网址，虽然解决“看不到地址”，但没有解决小程序 WebView 禁止点击和文本选择的问题；诊断时临时切换动作类型触发了编辑器并发保护，需要重新打开后台标签页验收。
- 根因：即链把“打开内容”和“跳转链接”设计为互斥动作；正文 Markdown 链接受小程序 WebView 的外链和文本选择策略约束，而 `open_in_new_tab=true` 还可能触发被拦截的 `window.open`。
- 后续避免：第三方小程序内的外部资源不能只依赖 Markdown 链接或复制文本；发布前必须分别验证正文可读性、原生动作类型、同窗口跳转配置和真实手机唤起。若平台原生 `link` 在真机仍拦截某个域名，需要即链平台配置业务域名或提供复制按钮，内容后台无法绕过该平台级限制。
- 验证环境与结果：即链保存 API 显示草稿 v23 与线上 v23；普通 Markdown 链接剩余 0 个，正文完整网址 18 个，带封面条目 7 个，顶部轮播有封面，正文图片 11 张；后台重新打开后显示“直接打开”10 个条目，抽查“校内全景”为 `跳转链接`，链接地址完整且“新窗口打开”未勾选。
- 发布/回滚信息：本次只修改即链第三方页面数据与其租户图片存储，无迎新系统代码 release、数据库迁移或服务器切换；可在即链后台恢复并重新发布 v22 内容。
- 架构变化：即链镜像新增“正文内容层 + 原生外链动作层”双层结构；正文负责解释和图片，原生动作负责小程序内的可操作外链。
- 后续动作：用真实微信小程序分别点开百度、720 云、高德、主站 MP4 和政府网站入口；记录仍被拦截的域名，提交给即链平台加入业务域名或实现可选择/复制组件。

## 2026-08-04 - 即链正文去链接与主站功能入口

- 本次目标：移除正文中无法点击或复制的超链接文字，继续保留下方原生入口，并为正文补充图片和迎新指南主站功能。
- 实际完成：在用户已编辑到 v30 的页面上增量合并；删除 18 组“说明文字 + 访问地址 + 裸网址”，正文 Markdown 超链接、裸网址和“访问地址”均归零；为新生待办、到校与返校、校园问答、学生手册与奖助、专业与住宿片区补充 5 处图片和卡片封面；新增“迎新指南功能”模块，提供待办、互动地图、交通、报到、专业查询、学生规则和 AI 问答 7 个主站入口；原有 10 个外部直达入口保持不变；线上同步到 v32。
- 做得好的地方：先读取线上 v30 再修改，没有覆盖用户刚完成的公告、水印、版权等第三方后台设置；正文展示、主站功能和外部资源被拆成三个清楚的层级；所有入口继续使用原生 `link` 且关闭新窗口。
- 做得不好的地方：预览时按名称定位“新生待办”命中了“新生待办工具”，导致没有直接打开目标正文弹层；即链编辑器随后自动生成 v32 规范化草稿，需要额外核对并发布。
- 根因：同一页面同时存在“新生待办”和“新生待办工具”等近似名称，自动化按宽松文本匹配容易选错；第三方编辑器还会在读取旧字段后自动补齐规范化字段并增加草稿修订号。
- 后续避免：即链自动化优先使用稳定条目 ID 或完整动作字段，不使用模糊标题定位；预览后必须重新读取草稿/线上版本并同步发布；正文新增外部资料时只写摘要和图片，实际 URL 统一放入对应原生入口模块。
- 验证环境与结果：即链 API 显示草稿 v32 与线上 v32；五个模块顺序为“新生常用入口、校园服务、迎新指南功能、直接打开、了解与反馈”；正文 Markdown 链接、裸网址和“访问地址”均为 0，正文图片 16 张，带封面条目 25 个；主站功能入口 7 个、外部入口 10 个，均有完整 URL。
- 发布/回滚信息：本次仅修改即链第三方页面数据，无迎新系统代码 release、数据库迁移或服务器切换；可在即链后台恢复并重新发布 v30。
- 架构变化：即链镜像调整为“正文图文层 + 主站功能入口层 + 外部资源入口层”，正文不再承担链接操作。
- 后续动作：用真实小程序抽查一个 `yx.huiliyill.cn` 主站入口和一个第三方入口；若第三方域名仍被拦截，交由即链平台配置业务域名，正文不再回退为裸网址。

## 2026-08-04 - 即链校园轮播与联系二维码

- 本次目标：把即链页面顶部单张宣传海报替换为多张学校图片，并保证点击任意轮播都能看到联系二维码。
- 实际完成：从学校官网“印象仰恩”公开图片和迎新指南现有校园航拍中选择 4 张真实校园内容图，上传到即链租户 COS/CDN；以用户最新草稿 v33 为基线替换 `page.banners`，移除旧宣传海报轮播，配置“迎新指南、校园生活、课堂日常、校园活动”四张轮播；每张均使用 `content` 动作，并在弹层底部加入同一份联系二维码；草稿和线上同步到 v34。
- 做得好的地方：修改前重新读取最新草稿，保留用户刚调整的公告、水印、版权和模块内容；图片先落到即链自己的 CDN，避免轮播运行时依赖学校官网；发布后从保存 API、后台结构和手机实时预览三处核对数量、图片尺寸、旧海报移除情况与二维码渲染。
- 做得不好的地方：首次尝试通过浏览器文件输入控件上传时，当前控制接口不支持 `setInputFiles`；第一次图片 CDN 验证使用 `HEAD` 请求收到 403，虽然上传成功但该验证方式不适用于此 CDN。
- 根因：即链编辑器把文件输入封装在自定义上传组件中，浏览器控制层未暴露对应文件注入方法；租户 CDN 允许页面 `GET` 渲染，但不保证匿名 `HEAD` 请求可用。
- 后续避免：即链批量图片更新优先使用登录后的预签名上传接口，验收使用页面真实 `<img>` 的 `naturalWidth/naturalHeight`，不把 `HEAD` 状态当作图片可用性的唯一依据；任何保存操作都先获取最新 `base_revision`，并在发布后确认草稿与线上版本一致。
- 验证环境与结果：即链 API 显示草稿 v34、线上 v34，轮播 4 张，旧海报轮播命中 0，四个点击弹层均包含联系二维码；后台手机实时预览逐张切换后，四张轮播图片自然尺寸分别为 1579×889、3500×2332、3000×2000、3500×2332，二维码为 912×1354，均成功加载。
- 发布/回滚信息：本次仅修改即链第三方页面数据和其租户图片存储，无迎新系统代码 release、数据库迁移或服务器切换；可在即链后台恢复并重新发布 v33。
- 架构变化：即链镜像顶部增加“校园实景轮播 + 内容弹层 + 统一联系二维码”展示层，轮播图片不再承担宣传海报用途。
- 后续动作：用真实微信小程序确认自动轮播节奏、手势切换和二维码长按识别；后续新增轮播仍沿用真实校园图片、即链 CDN 和统一二维码弹层规则。

## 2026-08-04 - 仰恩大学迎新小程序海报

- 本次目标：参考用户提供的蓝色新生攻略海报，制作一张仰恩大学 2026 级迎新指南海报，并使用用户提供的小程序码。
- 实际完成：生成 1024×1536 竖版海报，包含报到时间、入学准备、校园地图、交通、流程和常见问题；底部明确标注“第三方个人公益整理”；最终改用用户原始小程序码直接覆盖生成码区域，正式成品保存为 `public/images/posters/yeu-freshman-miniapp-poster-v2.png`。
- 做得好的地方：海报只采用已确认的 2026 级报到时间和现有功能，不加入未核实材料要求；视觉上参考信息层级而非复制原海报；发现生成模型重绘小程序码后，没有继续把外观相似的码当作可用入口，而是改用用户原图确定性合成。
- 做得不好的地方：前两次生成提示虽然明确要求保持小程序码，但模型仍重新绘制了码点，第一次交付预览没有提前保证原码被真正嵌入。
- 根因：生成式图片模型会重新解释输入图像，无法保证二维码或小程序码的像素结构；这类机器可读标识不适合依赖生成模型直接复刻。
- 后续避免：生成带二维码或小程序码的宣传图时，先生成不含码的主体或预留纯白码区，最后使用原始码图进行等比例确定性合成；验收必须同时检查完整边界、安静区、方向和原始资源指纹，不以肉眼相似作为通过标准。
- 验证环境与结果：最终海报为 1024×1536 PNG，原小程序码 SHA-256 为 `5C7CB9336BCC88221AEF7EE043E8936116EB7184E637C93D6DA16C2FA1F17350`；原码等比例缩放为 340×340 后直接覆盖右下角，缩放图与成品对应裁剪区域的 RGBA 像素 SHA-256 均为 `acae84ba65df9ba0158c7fad76b2cf6a7d3826e703eb2a01e90a887234aa24c7`，逐像素一致。
- 发布/回滚信息：本次只新增本地宣传图片和文档记录，未部署服务器、未修改数据库或线上页面；删除新增成品即可回滚。
- 架构变化：正式宣传成品归入 `public/images/posters`，生成中间稿继续保留在生成工具目录，不作为项目静态资源引用。
- 后续动作：发布前用真实微信扫码验证小程序落地页；若需要印刷版，再基于同一原码生成更高分辨率版本并保留足够白边。

## 2026-08-04 - 即链专业与住宿片区数据补全

- 本次目标：修复即链小程序“专业与住宿片区”只显示计算机科学与技术、没有同步主站完整宿舍分区数据的问题。
- 实际完成：以主站 `data/major-profiles.ts` 为基准，把 26 个普通本科专业及所属 10 个学院写入即链正文；按新区 15 个专业、旧区 11 个专业分组展示；补充女生旧区衡山楼、男生新区辽宁楼或陕西楼的舒适型参考、跨区通勤提醒和最终确认步骤；即链草稿与线上均发布到 v35。
- 做得好的地方：先比较主站结构化数据与即链线上正文，确认缺口不是主站丢数据而是镜像只同步了一条；保存前读取最新 v34，按稳定条目 ID `notices-item` 增量修改，没有覆盖轮播、公告、水印和其他模块；发布后在手机实时预览中实际打开弹层，逐组核对全部学院、专业和舒适型楼栋。
- 做得不好的地方：首次打开后台发布页时短暂出现“页面配置加载失败”，需要刷新后才恢复；即链镜像仍依赖人工同步，主站分区后续变化不会自动写入第三方页面。
- 根因：此前镜像正文只摘录了“计算机科学与技术：新区”作为示例，没有把 `majorProfiles` 全量分组结果转成正文；第三方即链与主站数据库之间没有动态 API 或发布联动。
- 后续避免：每次修改 `data/major-profiles.ts` 后，同时核对即链“专业与住宿片区”的专业总数、新区数、旧区数和学院数；保存第三方页面时继续使用稳定条目 ID 与最新 `base_revision`，发布后必须在手机预览打开正文，而不是只看后台文本框。
- 验证环境与结果：`pnpm exec tsx --test scripts/major-profiles.test.ts` 3 项通过，确认主站为 26 个专业、10 个学院且无 `pending` 分区；即链 API 与后台均显示草稿 v35、线上 v35，手机预览显示新区 15 个专业、旧区 11 个专业及衡山楼、辽宁楼、陕西楼说明。
- 发布/回滚信息：本次只修改即链第三方页面数据，无主站代码 release、数据库迁移或服务器切换；可在即链后台恢复并重新发布 v34。
- 架构变化：即链静态镜像的住宿分区正文从单条示例升级为主站 `majorProfiles` 的人工全量快照，仍不具备自动同步能力。
- 后续动作：下一次主站新增专业或调整分区时，用同一组计数和手机弹层检查同步 v35 之后的版本；若即链开放数据接口，再把人工快照改成受审核的发布同步任务。

## 2026-08-04 - 首页简洁微信版 tab 切换

- 本次目标：不增加独立模块入口，在首页顶部加入兼容移动端的“完整模式 / 简洁模式”切换；简洁内容与已配置的小程序结构一致，并继续使用主站实时数据、图片、视频和功能入口。
- 实际完成：新增 `HomeCompactWechatGuide`，通过一年期 `yeu-home-mode` Cookie 保存选择；提供常用、校园服务、功能直达、了解更多四个 tab，接入公告、办事、指南、社团、部门、附近地点和 26 个专业/10 个学院住宿片区；保留地图、全景、交通、清单、校规、AI 搜索与联系方式入口；宿舍普通型/舒适型视频使用同源 MP4 和 `playsinline`；未加入账号、聊天、个人中心或隐藏平面图入口。精选指南为空时回退到全部指南，避免分区出现空白。
- 做得好的地方：复用了主站公开 API 和现有 `majorProfiles`，没有新增重复数据源；使用 tab 状态切换而不是新增路由，移动端 390×844 实测无横向溢出，四个 tab、入口链接、两段视频和页脚均可见；动态下载入口同时补入 icon bundle，避免生产空图标。
- 做得不好的地方：首次浏览本地页面时发现 `/api/public/features` 因开发数据库未完成 0019 迁移而报 `placement` 缺列，说明本地启动检查没有把迁移作为前置门禁；控制台还暴露了动态图标白名单遗漏。
- 根因：本地 `.env` 指向 `.data/codex-map-content-20260713.sqlite`，数据库迁移脚本虽已存在，但启动前未强制执行；首页动态入口使用 `i-lucide-download`，而 `shared/client-bundle-icons.ts` 没有对应 `lucide:download`。
- 后续避免：每次涉及 schema 的前台配置发布前，先对实际 `NUXT_DATABASE_PATH` 执行 `pnpm db:migrate`，再用 `/api/health` 与受影响公开 API 做 smoke check；新增动态 icon 必须同步 bundle 白名单并做一次真实浏览器控制台检查；移动端 tab、视频资源、横向溢出和微信/QQ 内嵌兼容纳入固定验收项。
- 验证环境与结果：`pnpm exec tsx --test scripts/home-compact-guide.test.ts scripts/frontend-features.test.ts` 8 项通过；受影响文件 ESLint 通过；`git diff --check` 通过；迁移后 `/api/public/features` 在同源请求下返回 200；390×844 浏览器实测四个 tab 可切换，视频资源分别为 `/media/ordinary-dorm-tour.mp4`、`/media/comfort-dorm-tour.mp4`，无新增错误日志。
- 发布/回滚信息：待完整类型检查、生产构建、Git 提交推送和线上 release 切换后补充 commit、release、旧 release 回滚点和公网验收结果；构建期间保留当前线上服务，不先停止旧实例。
- 架构变化：首页增加一个客户端模式层，未改变后端 API、数据库表或地图 provider；简洁模式只消费既有公开数据边界。
- 后续动作：完成 `pnpm typecheck`、`pnpm build`，发布前备份并迁移生产 SQLite，原子切换 `current` 后核验 `https://yx.huiliyill.cn/`、首页模式切换、公开功能接口、静态媒体和健康接口。

## 2026-08-05 - 首页简洁模式对齐小程序预览与主站数据

- 本次目标：修复简洁模式内容不足、入口与主站后台配置不一致的问题，并按即链后台实时预览重做移动端页面结构。
- 实际完成：读取即链 v35 实时预览，确认其为顶部轮播和五个连续内容区，而不是内部 tab；重写 `HomeCompactWechatGuide`，按“新生常用入口、校园服务、迎新指南功能、直接打开、了解与反馈”展示 10/3/7/10 项核心入口；接入主站公告、前台功能配置、自定义首页入口、办事流程、指南、社团、部门、周边地点、专业住宿数据和两段宿舍实拍视频；新增四张同源内容轮播与实时目录数量。
- 做得好的地方：先从参考后台打开真实手机预览，记录栏目、数量、文案和布局，再改代码，没有根据统计页标题猜设计；18 个后台功能继续使用公开开关、位置和顺序，不复制后台数据；375px 实测无横向溢出，页面实际读取到 8 篇指南、5 项流程、23 个社团和 27 个部门，入口 URL 与主站路由一致。
- 做得不好的地方：最初沿用了上一版的内部 tab 方案，与参考小程序的连续信息流不一致；第一次用旧开发进程截图时，新增的动态图标白名单没有重新生成，导致新生待办和联系入口暂时显示空图标，需要全新生产构建复验。
- 根因：上一轮只根据第三方模块名称做了结构映射，没有打开编辑器的“实时预览”核对真实页面；Nuxt provider:none 图标包在进程启动时生成，修改白名单后旧开发进程不会完整重建资源包。
- 后续避免：涉及“照着某个页面预览做”时，先打开实际预览并记录区块、入口数和移动端视觉，再决定组件结构；新增任何动态 `UIcon :name` 必须同步 `clientBundleIcons`，并用全新构建而非仅 HMR 验收；后台功能映射测试要同时覆盖关闭、位置、排序和自定义入口。
- 验证环境与结果：定向测试 10 项通过，受影响文件 ESLint 通过，`pnpm typecheck` 通过，`git diff --check` 通过；本地 375px 浏览器显示常用入口 10 项、校园服务 3 项、迎新指南功能 7 项、直接打开 10 项，`documentElement.scrollWidth === clientWidth === 375`，两段视频均存在。
- 发布/回滚信息：提交 `f710b10` 已推送并部署到 `/www/wwwroot/yeu/releases/20260805-013324-f710b10`；切换前数据库备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260805-013324-f710b10.sqlite`，上一回滚版本为 `/www/wwwroot/yeu/releases/20260804-201043-recovery-4937ad8`。公网首页与 `/api/health` 验证正常。
- 架构变化：简洁模式从“首页内第二层 tab”调整为“同一首页内的连续移动信息流”；所有内容继续消费现有公开 API，未增加数据库表、写接口或独立内容源。
- 后续动作：继续检查简洁模式实际目录是否覆盖生产数据库全部发布内容，任何新增动态目录都必须用生产 API 数量和详情跳转抽查，不能只看静态入口数量。

## 2026-08-05 - 简洁模式实时目录与入口映射修正

- 本次目标：解决简洁模式后半段内容不全、实际后台数据只用于计数，以及校园地图与快递外卖共用错误功能开关的问题。
- 实际完成：把“已整理内容”升级为校园指南、办事流程、校园地点、学生社团和部门学院五类实时切换目录；每类直接读取主站公开 API，展示完整数量、最多 10 条当前内容和完整目录入口；吃喝玩乐精选改为读取 `data/nearby-guide.ts`，不再因为 `scope=nearby` 尚无发布地点而整块消失；校园地图和快递外卖恢复各自 feature key，专业住宿入口从地图开关中拆开；旧公告全景图标自动归一化。
- 做得好的地方：先同时读取即链实时预览、线上简洁页 DOM 和生产 API 数量，确认问题在“动态内容没有进入浏览动线”而不是继续重做前半段布局；新增目录保持参考页的紧凑卡片风格，没有把 100 多条数据一次铺成长页面；办事分类切换后逐条核对 5 个详情链接。
- 做得不好的地方：第一次并行执行 `pnpm exec` 时触发依赖状态检查，与正在运行的开发进程争用 `.nuxt/types`；第一次独立构建又因命令会话过早超时留下无输出的孤立进程，需要重启受控构建。
- 根因：本地 `pnpm` 在依赖链接异常时会自动执行 install/postinstall，而 Nuxt dev 正占用默认构建目录；长构建不能交给短超时 shell 会话，否则子进程可能继续运行但失去输出通道。
- 后续避免：已有 `node_modules` 时用本地 Node 直接调用 `tsx`、ESLint 和 Nuxt CLI；并发开发期间始终为生产构建指定独立 `NUXT_BUILD_DIR`，长构建从一开始使用可等待的执行会话；前端数据完整性验收至少覆盖生产数量、分类切换、详情链接、空接口降级和移动端无横向溢出。
- 验证环境与结果：定向测试 12 项通过，受影响文件 ESLint 通过，Nuxt typecheck 通过，隔离生产构建通过；本地 360px 宽度下 `scrollWidth === clientWidth`，无破图，办事流程分类显示 5 条且详情链接全部正确。云端隔离实例 `/api/health` 返回 `status=ok`、`database=ready`；公网 390px 移动端实测显示指南 9、流程 5、地点 76、社团 32、部门 27，分类可切换，地点详情入口正确，375px 内容区无横向溢出且无破图。
- 发布/回滚信息：提交 `caeab58` 已推送并部署到 `/www/wwwroot/yeu/releases/20260805-021257-caeab58`；切换前数据库备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260805-021257-caeab58.sqlite`，上一回滚版本为 `/www/wwwroot/yeu/releases/20260805-013324-f710b10`。本次无数据库迁移，`yeu.service` 已恢复 active。
- 架构变化：简洁模式从“动态数量 + 少量指南样例”升级为“五类 API 实时目录 + 现有吃喝玩乐资料精选”，仍不新增数据表或写接口。

## 2026-08-05 - 简洁首页生产数据对齐与紧凑模式切换

- 本次目标：让首页简洁模式完整匹配主站后台数据和即链手机预览，并把“完整 / 简洁”切换缩短后固定在页面顶部中间。
- 实际完成：保留五个连续功能区和五类实时目录；目录默认展示当前分类前 10 条，可展开该分类全部发布内容；顶部模式切换改为居中的短分段按钮；修正完整模式的校园地图、校园网络、快递外卖和报到安排四个入口映射。
- 做得好的地方：发布前先在 3100 隔离实例读取生产数据库并核对指南 9、流程 5、校内地点 76、社团 32、部门 27，再切换线上；旧服务在构建和隔离验证期间始终运行；公网手机宽度截图确认首屏紧凑、切换入口居中、图标与轮播正常。
- 做得不好的地方：发布准备脚本受服务器 `.env` 和 Windows 脚本 CRLF 影响出现警告，虽然 release、原生模块和备份均成功，但自动化返回码不够干净；公开 API 的来源保护使直接 curl 数量检查返回 403，最终改为只读生产数据库核对。
- 根因：部署辅助命令仍会把 Windows 换行带入 Linux shell；公开数据 API 需要有效页面上下文，裸 curl 不等同于真实浏览器请求。
- 后续避免：部署脚本上传前统一转换 LF，并把 release 准备、备份、隔离启动和切换拆成可重复执行的独立步骤；数据数量同时用数据库只读查询和真实浏览器页面核对，不通过放宽 API 来源保护来方便 smoke test。
- 验证环境与结果：19 项定向测试、ESLint、Nuxt typecheck 和两次隔离生产构建通过；3100 隔离实例与切换后的源站、`https://yx.huiliyill.cn/api/health` 均返回 `status=ok`；线上简洁页显示五个连续区块及 9/5/76/32/27 的实时目录计数，手机首屏无横向溢出或破图。
- 发布/回滚信息：提交 `5adf238` 已推送并部署到 `/www/wwwroot/yeu/releases/20260805-024603-5adf238`；切换前数据库备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260805-024603-5adf238.sqlite`，直接回滚版本为 `/www/wwwroot/yeu/releases/20260805-021257-caeab58`。
- 架构变化：首页完整模式与简洁模式继续共享同一公开数据和后台功能配置；简洁模式只增加展示编排与分类展开状态，没有新增数据库表、复制内容源或绕过前台功能开关。
- 后续动作：新增后台内容后继续抽查五类目录数量和详情链接；新增首页入口时同时检查完整模式、简洁模式、后台关闭/排序配置和移动端顶部切换，不再只验证单一视图。

## 2026-08-05 - 线上首页 SQLite 锁故障恢复

- 本次目标：恢复 `yx.huiliyill.cn` 首页访问，并查明首页超时、偶发 500 的原因。
- 实际完成：确认 `yeu.service` 本身持续 active，定位到 `yeu-knowledge-crawl.service` 与线上服务同时写入同一 SQLite；停止冲突爬取进程，禁用 `yeu-knowledge-crawl.timer`，重启应用并完成源站、CDN、健康接口复查。
- 做得好的地方：先分别检查公网、DNS、systemd、监听端口和数据库文件持有者，没有误把“服务 active”当作页面可用；通过日志确认 `SQLITE_BUSY`、`/api/public/notices` 500 及首页 30 秒以上响应，再处理实际锁源；QQ/微信 relay 进程未被停止。
- 做得不好的地方：发布后的线上 smoke test 没有覆盖“定时爬虫运行时的并发首页请求”，导致爬虫完成抓取但收尾写入时才暴露锁问题；裸 curl 检查公开 API 时没有带页面来源上下文，容易把预期 403 与服务故障混在一起。
- 根因：爬虫通过独立 Node 进程直接打开共享生产 SQLite，和 SSR 首页中的公告、功能配置访客写入竞争同一个 WAL 数据库；SQLite 的忙等待耗尽后返回 `SQLITE_BUSY`，首页等待多个公开请求完成而表现为打不开。
- 后续避免：生产爬虫不得直接写在线数据库；需要抓取时先写独立副本或 staging 数据库，经审核后在维护窗口导入。部署验收必须包含定时任务列表、数据库持有者、并发首页请求和 30 秒错误窗口；公开 API smoke test 使用真实页面上下文，不放宽来源限制。
- 验证环境与结果：`yeu.service` active；`yeu-knowledge-crawl.timer` disabled、service inactive；`https://yx.huiliyill.cn/` 返回 200（约 0.45 秒），`/api/health` 返回 200（约 0.1 秒）；没有新的锁错误，在线 SQLite 仅由应用进程持有。
- 发布/回滚信息：本次未修改应用代码、数据库内容或 release；服务器配置变更为停止并禁用 `yeu-knowledge-crawl.timer`。如需恢复自动爬取，必须先迁移到独立数据库方案，不能直接重新启用当前 timer。
- 架构变化：生产在线库与知识爬取任务之间增加“禁止共享写入”的运行规则；后续应采用 staging 知识库和审核导入边界。
- 后续动作：为爬取任务补充 staging 数据库和导入锁，再恢复定时更新；在此之前只允许人工维护窗口执行，不允许直接启动现有生产 timer。

## 2026-08-05 - 顶部模式切换与首页入口定义统一

- 本次目标：把首页“完整 / 简洁”切换移到顶部导航中央，并解决简洁模式入口文案、图标和路由与首页/后台配置逐渐分叉的问题。
- 实际完成：新增 `useHomeMode` 共享模式状态和一年期 Cookie；顶部导航在首页显示短分段切换，移除内容区独立横栏；简洁入口的标题、说明、图标和路由优先复用 `home-presentation.ts`，后台仍控制开关、位置、排序和自定义入口；同步更新首页模式回归测试。
- 做得好的地方：没有复制第二套状态，顶部导航点击后首页内容立即切换；保留五个参考预览区块和五类动态目录；部署前完成定向测试、ESLint、Nuxt typecheck、全新生产构建，并用 SSR HTML、源站和 CDN 健康接口复查。
- 做得不好的地方：第一次隔离 smoke 使用共享生产 SQLite，两个 Node 进程会造成不必要的数据库竞争；部署脚本通过 Windows 管道传入 Linux 时仍出现 CRLF 路径/环境变量警告，虽然服务已正常切换。
- 根因：模式切换原先只存在首页内容区；简洁组件维护了与 `home-presentation.ts` 重复的标题和路径；发布辅助脚本没有统一 LF 换行。
- 后续避免：入口定义只保留一个共享来源，新增后台入口必须同时验证完整/简洁两种模式；隔离 smoke 使用数据库副本，不与生产应用共享写库；部署脚本上传前转换为 LF，并把健康文件路径写成无换行的 shell 参数。
- 验证环境与结果：13 项首页/前台功能定向测试通过；ESLint、Nuxt typecheck、全新生产构建通过；线上 `yeu.service` active，`yeu-knowledge-crawl.timer` 仍 disabled；SSR 显示切换位于顶部导航中央；`https://yx.huiliyill.cn/` 与 `/api/health` 均返回 200，接口日志无新的锁错误。
- 发布/回滚信息：提交 `b703c9b` 已推送并部署到 `/www/wwwroot/yeu/releases/20260805-050600-b703c9b`；切换前备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260805-050600-b703c9b.sqlite`；上一版本 `/www/wwwroot/yeu/releases/20260805-024603-5adf238` 保留为直接回滚点。
- 架构变化：首页模式状态从页面局部 ref 提升为布局与页面共享的 composable；内容仍使用同一公开 API 和后台配置，不新增数据库表或写接口。
- 后续动作：下一次新增首页后台入口时，检查共享定义、简洁五区、顶部切换、移动端窄屏和 CDN 缓存；知识爬取继续禁止直接写生产 SQLite。

## 2026-08-05 - 简洁入口半屏详情、来源地址与全局返回

- 本次目标：让简洁模式入口像参考预览一样先打开底部半屏详情，支持后台配置来源地址，并为所有公开子页面补充统一的返回上一步动作。
- 实际完成：简洁模式的常用入口、校园服务、功能入口、动态目录和吃喝玩乐卡片统一先打开底部半屏；半屏展示标题、说明、来源地址、进入完整页面和独立来源按钮；首页入口后台新增 `homeEntrySourceUrl` 配置；公开 DTO、服务映射和安全校验同步支持来源地址；非首页路由由默认布局统一显示返回按钮；375px 下收紧顶部切换并隐藏非必要品牌文字，避免与公告按钮重叠。
- 做得好的地方：先在参考后台打开真实预览并核对栏目结构，再改交互；把来源地址放入现有 metadata 而非新建数据表；上线前完成定向测试、typecheck、生产构建和数据库副本隔离 smoke，切换后又在真实公网 375px 视口点击入口、检查半屏并进入子页面验证返回按钮。
- 做得不好的地方：第一版把居中的模式切换直接放进原导航，在 375px 下与公告触控区发生轻微重叠，直到测量真实窄屏布局才发现；Windows Node 24 无法直接运行本次 Nitro 产物的 `file:///_entry.js`，本地 smoke 不能替代 Linux 生产环境；本轮 ESLint 受 ESLint 10 与项目配置的 `Unexpected function` 兼容错误阻断，未进入源代码规则检查。
- 根因：简洁卡片过去只有直接路由，没有“先预览再进入”的展示层；公开入口数据没有来源地址字段；子页面依赖品牌链接返回首页，没有保留浏览历史语义；顶部绝对居中的切换宽度没有同时考虑 375px 的右侧公告和搜索入口。
- 后续避免：新增首页入口必须同时验收半屏、来源地址、完整页面路由和后台开关/排序；所有新公开子页面继续使用默认布局的返回动作，不单独复制按钮；前端导航改动至少检查 320/375/390px 的可点击区域；Nitro 发布以 Linux Node 22 隔离 smoke 为准，生产爬虫继续禁止直接写在线 SQLite；升级 ESLint 前先修复配置兼容性。
- 验证环境与结果：`home-compact-guide` 与 `frontend-features` 共 16 项测试全部通过；Nuxt typecheck 和全新生产构建通过；Linux Node 22 使用数据库备份在 3101 端口隔离启动成功；线上 `yeu.service` active、`yeu-knowledge-crawl.timer` disabled；源站首页、源站健康接口、CDN 首页和 CDN 健康接口均返回 200；公网手机实测半屏展示“来源地址”和“进入完整页面”，子页面出现“返回上一步”。
- 发布/回滚信息：提交 `5ce586e` 已推送并部署到 `/www/wwwroot/yeu/releases/20260805-052735-5ce586e`；切换前备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260805-052735-5ce586e.sqlite`；上一版本 `/www/wwwroot/yeu/releases/20260805-050600-b703c9b` 保留为直接回滚点。
- 架构变化：首页入口来源地址保存在现有功能 metadata，经安全 URL 校验进入公开 DTO；简洁模式增加统一详情 sheet 编排层；默认布局成为公开子页面返回动作的唯一入口，不新增数据库迁移。
- 后续动作：在后台为需要外部出处的入口逐项填写来源地址；补修 ESLint 10 配置兼容性；后续增加卡片时继续复用统一 `openEntry` 流程并在窄屏实测。

## 2026-08-05 - 参考即链预览完善简洁半屏正文

- 本次目标：按照即链后台 `edit=roommate` 的实时预览，把简洁入口从“一句摘要 + 链接”升级为可阅读的分段正文，并在页面顶部增加指定小程序入口、把来源链接放到正文最下方。
- 实际完成：通过参考后台真实“预览”按钮核对了内容型半屏与链接型半屏的区别；内置入口按清单、宿舍、交通、校园网、报到、地图、全景、校规等路由提供两至三段学生向正文；动态指南、部门和社团入口新增 `metadata.homeEntryContent` 半屏正文字段；正文以空行分段、每段首行作为小标题；来源地址移到所有正文之后；简洁页顶部增加 `https://doc.sourl.cc/jkyxfu` 的“打开小程序”入口。
- 做得好的地方：没有只根据后台路由名猜布局，而是先打开实时预览并点击“新生待办”“校园地图来源”分别确认内容型与链接型结构；正文、来源和详情页继续使用现有内容 metadata 与公开 API，没有新增数据表；发布前完成本地手机点击、Linux 数据库副本隔离 smoke 和公网手机复查。
- 做得不好的地方：第一次生产构建仍使用默认 `.nuxt`，与正在运行的本地开发服务争用后长时间无输出；发现后才结束本次构建进程并改用 `.nuxt-build-roommate` 独立目录。参考小程序链接在桌面浏览器会跳转到微信短链并提示手机打开，不能用桌面页面代替真机小程序内部验收。
- 根因：上一版只为入口 DTO 增加来源地址，没有正文契约；默认半屏把摘要和来源放在同一层，无法承载参考预览中的多个内容段；构建命令没有一开始就隔离 Nuxt buildDir。
- 后续避免：所有生产构建默认使用独立 `NUXT_BUILD_DIR`，不得与 dev 共用 `.nuxt`；新增动态入口时同时配置入口说明、半屏正文、来源地址和完整页面；小程序深链只验证跳转地址与手机唤起边界，真实小程序内容仍需手机微信验收。
- 验证环境与结果：16 项定向测试全部通过；Nuxt typecheck 与独立生产构建通过；本地 390px 实测顶部小程序入口和三段正文；Linux Node 22 使用数据库备份在 3101 端口隔离启动成功；线上 `yeu.service` active、`yeu-knowledge-crawl.timer` disabled；源站/CDN 首页和健康接口均返回 200；公网 390px 实测半屏正文、底部来源和完整页面按钮正常。
- 发布/回滚信息：提交 `3c4903f` 已推送并部署到 `/www/wwwroot/yeu/releases/20260805-054818-3c4903f`；切换前备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260805-054818-3c4903f.sqlite`；上一版本 `/www/wwwroot/yeu/releases/20260805-064500-adf98f9` 保留为直接回滚点。
- 架构变化：`ApiPublicHomeEntry` 新增受长度限制的 `detailContent`；简洁半屏形成“摘要 -> 分段正文 -> 来源 -> 完整页面”的稳定契约；后台仍通过内容 metadata 扩展，不需要迁移 SQLite。
- 后续动作：用手机微信点击顶部小程序入口确认实际唤起；后台为重点自定义入口补齐半屏正文和正式来源；将独立 buildDir 固化进发布脚本。

## 2026-08-05 - 简洁半屏逐项对齐参考预览

- 本次目标：不再用概括性文字代替 `edit=roommate` 预览正文；参考页里有什么就展示什么，同时固定半屏高度并隐藏滚动条。
- 实际完成：逐项读取参考预览中的清单、宿舍、交通、校园网、报到、问答、校规、专业住宿、全景、地图、办事、社团、部门、来源和反馈等正文，集中写入 `data/compact-preview-content.ts`；内容型卡片直接展示这些分段内容并在底部保留来源，链接型卡片只显示“将跳转至”和真实目标地址；弹层固定为 `72svh`，标题与底部动作固定，中间正文可触摸滚动但通过 `scrollbar-none` 隐藏滚动条。
- 做得好的地方：先在参考后台逐卡核对真实弹层，再区分内容型与链接型交互；没有继续给每张卡编写近似摘要；定向测试同时锁定宿舍价格、舒适型楼栋、分段公交价格、真实 VR/地图链接和半屏样式；发布时保留旧服务，先使用数据库备份在 3101 端口完成 Linux 冒烟测试，再原子切换。
- 做得不好的地方：上一版虽然已有分段正文，但仍是人工概括，与参考预览中的项目数量和具体措辞不一致；一次批量读取过多参考弹层导致浏览器控制超时，后续才改成小批次读取；首次定向 ESLint 暴露四处旧的单行模板格式问题，已在发布前修正。
- 根因：之前把“模仿结构”误当成“可以重写内容”，且用同一内容模型处理正文卡和直达链接卡；半屏只设置最大高度，没有形成固定的标题、滚动正文和底部动作三段式布局。
- 后续避免：对照外部预览时必须建立逐项内容清单，明确 `content` 与 `link` 两种卡片类型；正文新增或修改统一进入 `compact-preview-content.ts`，动态后台入口继续走 `metadata.homeEntryContent`；半屏高度、隐藏滚动条、来源位置和目标链接纳入固定回归测试；浏览器批量读取控制在少量卡片一组。
- 验证环境与结果：16 项首页/功能定向测试全部通过；受影响文件 ESLint、`git diff --check`、Nuxt typecheck 和独立生产构建通过；本地弹层实测高度 518/720 像素，等于视口 72%，公网真实页面已显示完整四段新生待办正文；线上 `yeu.service` active、`yeu-knowledge-crawl.timer` disabled，源站及 CDN 首页和健康接口均返回 200。
- 发布/回滚信息：功能提交 `07abc27` 已推送并部署到 `/www/wwwroot/yeu/releases/20260805-061221-07abc27`；切换前备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260805-061221-07abc27.sqlite`；上一版本 `/www/wwwroot/yeu/releases/20260805-054818-3c4903f` 保留为直接回滚点。
- 架构变化：内置简洁半屏正文从组件内零散摘要拆为独立内容映射；半屏增加明确的内容型/链接型分支和固定高度布局，不新增数据库表或 API。
- 后续动作：后续后台新增自定义首页入口时，同时填写完整半屏正文和来源地址；新增直达入口时显式标记为链接预览，避免再次出现正文与链接语义混用。

## 2026-08-05 - 移动地图半屏、地点标题与首页导航避让

- 本次目标：地图页不再显示默认 Logo，选中地点后在顶部显示地点名；压缩移动端搜索、筛选和地点列表；修复看得见但拖不动的半屏；整理右上角地图操作按钮；同时让电脑端“完整/简洁”切换器避开五个主导航，并把简洁模式“直接打开”限制在本站页面。
- 实际完成：地图页顶部品牌入口隐藏，通过共享 `map-header-title` 状态同步当前地点或区域名称；移动端地点面板改为三档可拖动 sheet，搜索框、八类筛选、数量行和地点卡片统一收紧；右上角显示设置、全览和定位按钮合并为同一圆角分组；首页模式切换器在手机端保持居中，在电脑端进入导航后的正常 flex 布局；全景、交通、宿舍、附近等直达卡片改走本站路由，并支持查询参数预选相应内容。
- 做得好的地方：没有只调动画外观，而是找到拖动失效的事件根因；新增回归断言覆盖拖动柄、地图顶部标题、紧凑布局、控制按钮分组、内部直达路由和桌面导航避让；发布后在真实 390×844 视口拖动面板，从半屏成功收至 0 高度，再点击地图地点确认顶部显示“北海楼”且 Logo 不存在；1440 像素桌面实测主导航与模式切换器没有相交。
- 做得不好的地方：第一次生产压缩包使用 `tar -C .output .`，剥掉了部署脚本要求的 `.output` 目录层级，导致服务器在结构预检处无输出退出；构建工具调用被中断后遗留两个本地 Node 构建进程，短时占用数 GB 内存，清理后才重新构建。
- 根因：旧拖动逻辑把所有 `button` 都视为不可拖动交互元素，而可见拖动柄本身正是按钮，所以指针按下立即被拒绝；顶部切换器在所有断点都使用绝对居中，与宽桌面主导航共享同一空间；首次打包命令与部署脚本的解包目录契约不一致。
- 后续避免：触摸拖动柄必须使用稳定的 `data-sheet-drag-handle` 合约并单独允许 Pointer Capture，其他交互控件继续阻止误拖；任何顶部导航改动都验证 390px 与 1440px 的实际边界；发布包必须包含顶层 `.output`，部署脚本在解包后检查 `.output/server/index.mjs`，失败不得切换 `current`；构建中断后立即核对并清理仅属于本任务的遗留进程。
- 验证环境与结果：43 项前端、地图、首页和微信分享相关回归测试通过；受影响文件 ESLint 无错误，`git diff --check`、Nuxt typecheck、独立生产构建通过；线上 `yeu.service` active、`yeu-knowledge-crawl.timer` disabled，源站首页、源站健康接口、CDN 首页和 CDN 健康接口均返回 200；真实移动视口验证半屏拖动、地点标题和地图按钮，真实桌面视口验证导航无重叠。
- 发布/回滚信息：功能提交 `4ede0a6` 已推送并部署到 `/www/wwwroot/yeu/releases/20260805-072021-4ede0a6`；切换前数据库备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260805-072021-4ede0a6.sqlite`；上一版本 `/www/wwwroot/yeu/releases/20260805-065300-6920ca9` 保留为直接回滚点。
- 架构变化：地图页与默认布局通过共享状态传递选中地点标题；移动端地图面板形成“地图画布 + 三档可拖动 sheet + 独立内部滚动”的稳定边界；首页直达卡片以本站路由作为第一入口，外部来源只保留在明确的来源动作中；未新增数据库表或迁移。
- 后续动作：继续在微信/QQ WebView 真机回归高德地图和拖动手势；将发布包顶层目录检查加入本地打包脚本，避免再次生成结构错误但内容完整的压缩包。

## 2026-08-05 - 生产服务器磁盘清理与备份保留

- 本次目标：解决服务器根分区只剩约 2GB、使用率达到 96% 的问题，在不影响在线服务和业务数据的前提下释放硬盘空间。
- 实际完成：逐层核对 `/www/wwwroot/yeu`、`shared/backups`、`shared/data/backups`、`releases`、`/tmp`、系统日志和其他站点占用；保留当前 release、直接回滚 release、最近 3 份发布前数据库备份、1 份 7 月 31 日里程碑备份及 2 份人工数据快照；删除其余重复自动备份、失败/过期 release、根目录部署压缩包、`/tmp/yeu-*` 构建副本和过期 journal。
- 做得好的地方：先列出文件时间、大小和目录归属，再验证 `current` 软链接、当前/回滚目录和最新备份存在后执行删除；没有触碰在线 SQLite/WAL、上传资料、环境变量、其他站点和同机上未知的其他站点目录；清理后立即复查服务与源站/CDN。
- 做得不好的地方：第一次只读预演命令混用了 PowerShell 与远端 Bash 的引号和 `$`，导致预演本身因引号未闭合退出；虽然没有发生删除，但增加了一次无效操作。
- 根因：发布流程每次都生成约 550MB 的全量 SQLite 备份，却没有自动保留上限；部署包还同时残留在项目根目录与 `/tmp`，旧 releases 也只增不减。
- 后续避免：自动发布完成并通过健康检查后执行受保护的保留策略；只按明确目录和文件前缀清理，始终先验证 `current` 与回滚目标；监控在磁盘 85% 告警，90% 前强制处理；远端复杂命令统一使用单一 shell 引号规则或受版本控制的维护脚本。
- 验证环境与结果：根分区使用量从 39GB 降至 31GB，使用率从 96% 降至 76%，可用空间从 2.0GB 增至 9.9GB，释放约 7.9GB；项目目录从 14GB 降至 5.0GB；`yeu.service` active、知识爬虫 timer disabled，源站与 CDN `/api/health` 均返回 200。
- 发布/回滚信息：本次没有切换应用 release；当前仍为 `/www/wwwroot/yeu/releases/20260805-072021-4ede0a6`，直接回滚点为 `/www/wwwroot/yeu/releases/20260805-065300-6920ca9`。
- 架构变化：生产运维边界增加明确的 release、自动数据库备份、人工业务快照、部署临时包四类保留策略；未修改运行时代码、数据库 schema 或公开 API。
- 后续动作：把保留逻辑整理为可审计维护脚本并接入磁盘告警；后续每次发布确认新备份成功后，只滚动保留最近 3 份自动备份和 1 份历史里程碑。

## 2026-08-05 - 根盘二次盘点与数据分层建议

- 本次目标：在首轮清理后继续确认还有哪些内容可删，以及哪些内容适合迁移到另一块磁盘。
- 实际完成：只读核对块设备、挂载、`/data`、Docker、宝塔组件、各站点、迎新项目 repo/shared、Node/PHP、VS Code Server、NapCat、Sub2API 和运行进程；确认服务器有 40GB `/data` 独立盘（约 27GB 可用）及 COS 挂载，根盘仍约 9.9GB 可用。
- 做得好的地方：通过 systemd、进程、监听端口和 Nginx vhost 反查真实引用，没有把体积大的目录直接等同于垃圾；明确区分可重建缓存、可迁移冷备份和必须维护窗口处理的在线数据。
- 做得不好的地方：一次组合 SSH 只读命令中的管道引号被 PowerShell/远端 Bash 错误拆分，造成部分进程与站点检查输出报错；后续拆成小命令后才得到可靠结果。
- 根因：服务器同时承载宝塔多站点、Docker、QQ/NapCat、开发工具和迎新服务，根盘与数据盘的分层历史上没有统一约束；部分旧版本、依赖和编辑器服务因此长期留在根盘。
- 后续避免：复杂远端盘点拆成单一主题命令；删除前必须用 systemd、容器、端口、vhost 和打开文件五类信号确认无引用；迁盘必须使用 bind mount/fstab、校验和及回滚步骤，不用临时软链接替代正式迁移。
- 验证环境与结果：`/dev/vda1` 根盘 40GB、约 76% 使用；`/dev/vdb` 挂载 `/data`，40GB、约 27GB 可用；`/data` 当前约 12GB，主要是 Docker overlay/volume。低风险可重建内容约 3.2GB，适合迁移的迎新历史备份约 3.3GB；本次未删除、未迁移、未重启任何服务。
- 发布/回滚信息：无代码或生产 release 变更；当前 release 与回滚点保持不变。
- 架构变化：文档增加根盘、`/data` 数据盘和 COS 冷备份的三层存储边界；该边界是后续迁移约束，不表示本轮已完成迁移。
- 后续动作：如获确认，先执行低风险缓存清理，再把迎新自动备份与人工快照迁到 `/data/yeu-backups`；COS 仅接收加密冷备份，并在上传前完成恢复演练。

## 2026-08-05 - 备份迁盘与可重建内容清理

- 本次目标：执行二次盘点中确认的低风险清理与备份迁盘，在不停止迎新站点、不移动在线数据库的前提下继续释放根盘空间。
- 实际完成：使用 `rsync` 和逐文件 SHA-256 校验，把 4 份自动备份迁至 `/data/yeu-backups/automatic`、2 份人工快照迁至 `/data/yeu-backups/manual`；为原有两个备份目录建立持久 bind mount 并写入 `/etc/fstab`。停止了一个工作目录已经被删除、仅占用 3101 测试端口的孤儿 Node 进程，删除无运行进程引用的 VS Code Server、npm/cache、仓库 `node_modules`、历史构建目录、NapCat 构建临时目录和未使用的 Node 22.17 副本，并清理 Docker 无引用镜像。
- 做得好的地方：迁移前核对独立块设备、挂载点、进程、端口和目录归属；复制后同时校验源目录、目标目录和挂载后的可见内容，确认一致才删除根盘旧副本；提前备份 `/etc/fstab`，保留现有业务路径；没有触碰在线 SQLite/WAL、上传资料、当前与回滚 release、运行中的容器、QQ/NapCat、其他站点或 Docker volume。
- 做得不好的地方：第一次组合式远程验证命令仍因 PowerShell 与 Bash 引号嵌套失败；本地尝试用 `bash -n` 检查脚本时误触发不可用的 WSL 环境。两次均未修改生产数据，但说明复杂远程操作不应继续依赖长内联命令。
- 根因：历史备份一直占用根盘且没有形成数据盘分层；开发工具缓存、构建依赖和中断后的 smoke 进程缺少退出清理；Docker 无引用镜像长期未执行受限 prune。
- 后续避免：复杂服务器维护统一使用先审阅、再上传、带锁和前置断言的版本化脚本；部署与 smoke 测试退出时回收自身进程和临时目录；每次发布执行有限备份保留并监控 85% 磁盘阈值；仅允许 `docker image prune` 清理无引用镜像，禁止自动删除容器、volume 或在线数据目录。
- 验证环境与结果：根盘从 76% 降至 63%，可用约 15GB；`/data` 使用率 39%，可用约 24GB。两个 bind mount 与 `/etc/fstab` 条目生效，6 份备份数量和哈希一致，最新 SQLite 备份 `quick_check` 正常；3101 测试端口已释放；`yeu.service` 为 active、知识爬虫 timer 为 disabled，源站和 CDN 首页及 `/api/health` 均返回 200。`findmnt --verify` 只报告原有 COS 与 swapfile 配置警告，本次未擅自调整。
- 发布/回滚信息：本次没有切换应用 release；当前仍为 `/www/wwwroot/yeu/releases/20260805-072021-4ede0a6`，直接回滚点仍为 `/www/wwwroot/yeu/releases/20260805-065300-6920ca9`。
- 架构变化：自动备份和人工快照从根盘迁到 `/data`，通过持久 bind mount 继续向应用暴露原路径；在线数据库与运行时共享数据仍保留在根盘，未改变数据库 schema、公开 API 或服务启动方式。
- 后续动作：单独审计并修复服务器原有 COS/fstab 警告；为发布脚本加入自动备份保留、临时包清理和孤儿 smoke 进程回收，但必须先在隔离环境验证失败回滚路径。

## 2026-08-05 - 全局导航与详情返回入口分层

- 本次目标：按“外层已有导航不重复显示返回，内置功能详情保留上下文返回”的规则修正公开页面顶部交互，并提交、部署、验证线上版本。
- 实际完成：移除 `app/layouts/default.vue` 对所有非首页页面统一注入的“返回上一步”和历史栈逻辑；办事、指南、社团、部门详情继续通过面包屑返回各自分类，地点详情继续返回地图，离线、错误和地图面板保留自身恢复动作；新增回归断言锁定五类详情的父级入口和默认布局无重复返回。
- 做得好的地方：先核对真实详情页已经存在的父级入口，再删除全局动作，没有把“不要重复”误解为“全部删除”；定向测试覆盖列表与五类详情；发布时保持旧服务运行，新 release 先使用数据库副本在 3101 独立验收，失败两次均未切换 `current`；最终用公网桌面和 390×844 移动视口验证导航可见性。
- 做得不好的地方：第一次修改多留一个空行，直到 ESLint 才发现；第一次 smoke 直接在只读备份目录打开数据库，迁盘后的目录不允许创建 WAL；第二次尝试用 Bash `source` 读取 systemd 环境文件，密钥中的 `$` 被当作变量展开；一次远程失败候选清理仍用了内联 PowerShell/Bash 命令并因引号展开失败。虽然门禁阻止了上线错误，但发布链路多走了两轮。
- 根因：此前把用户提出的“子页面要能返回”实现成默认布局全局按钮，没有区分外层导航和业务详情；部署脚本则默认备份目录可写且把 systemd `EnvironmentFile` 错当成 shell 脚本，未随着备份迁盘结构同步更新 smoke 契约。
- 后续避免：返回入口必须按“全局导航、分类面包屑、业务态返回、异常恢复”四层验收，默认布局不得代替详情上下文；smoke 数据库始终复制到专用可写临时目录；生产环境变量必须由 systemd 原生 `EnvironmentFile` 解析，禁止 `source`；复杂远程清理只使用带固定前缀与 `readlink` 断言的审阅脚本；样式或模板删改后先跑 ESLint 再开始长构建。
- 验证环境与结果：39 项首页/指南/地图定向测试全部通过，受影响文件 ESLint、Nuxt typecheck、独立生产构建和 `git diff --check` 通过。线上 `/procedures` 的全局返回计数为 0，`/procedures/arrival` 仍有 `/procedures` 父级入口；390×844 下移动主导航和详情父级入口都可见。`yeu.service` active、知识爬虫 timer disabled、3101 无监听，源站健康正常，CDN 首页、列表、详情与 `/api/health` 均返回 200。
- 发布/回滚信息：功能提交 `af012da` 已部署到 `/www/wwwroot/yeu/releases/20260805-085231-af012da`；切换前备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260805-085231-af012da.sqlite`；上一版本 `/www/wwwroot/yeu/releases/20260805-072021-4ede0a6` 保留为直接回滚点。
- 架构变化：公开默认布局只负责主导航、全局搜索、公告、分享和页脚；详情页自己声明父级返回语义。生产 smoke 改为 systemd 临时单元读取与正式服务相同的共享环境文件，并用第二个临时环境文件覆盖测试端口和数据库副本，不改变正式服务环境与在线库。
- 后续动作：把本次验证过的“可写 smoke 数据库 + systemd 临时单元 + 环境覆盖 + 原子切换”整理进正式部署脚本，并加入列表页无全局返回、详情页父级入口存在的发布门禁。

## 2026-08-05 - 迎新系统首页二维码

- 本次目标：为迎新系统生成可直接扫码进入首页的二维码，并提供可长期引用的站内图片地址。
- 实际完成：生成 `public/images/yx-home-qr.png`，二维码只包含规范首页 `https://yx.huiliyill.cn/`；采用高容错级别、1024 像素尺寸和完整静区，便于后台、海报和移动端复用。
- 做得好的地方：没有使用生成式图片绘制二维码，也没有加入短链或统计参数；生成后使用独立 QR 解码器读取最终 PNG，确认结果逐字等于目标首页。
- 做得不好的地方：最初尝试使用浏览器原生二维码识别进行本地验证，但 `data:` 页面被浏览器安全策略拒绝；一次短超时构建留下了阻塞输出管道的孤儿进程；首次二维码发布冒烟脚本还把“冒烟结束清理”误当成“候选 release 清理”，导致错误版本链接短暂指向不存在目录。发现后立即恢复原稳定 release，未把空目录版本作为最终状态。
- 根因：项目原先有多个海报和小程序码，但没有一份明确命名、可复用且经过解码复核的主站首页二维码资产。
- 后续避免：二维码新增或替换必须保留足够静区和高对比度，禁止在二维码模块上叠放 Logo；每次发布前解码复核目标域名，域名变化时同步更新所有引用，避免旧域名继续传播。发布脚本必须把停止 smoke 单元、清理临时目录和删除失败候选分成独立阶段，切换 `current` 前后都要验证目标目录存在；构建命令不得使用过短超时窗口。
- 验证环境与结果：`qrcode` 生成器成功输出 1024 像素 PNG；`qr-scanner-cli public/images/yx-home-qr.png --clear` 返回 `https://yx.huiliyill.cn/`；生产冒烟健康、首页和图片均通过，CDN 图片返回 200，公网下载 SHA-256 与本地资产一致（`3d2bccefd989aafa5cf915e3bedba8a13cbdd3dce9742597c25b116d312569f2`）。
- 发布/回滚信息：静态资源已部署到 `/www/wwwroot/yeu/releases/20260805-200358-3dcacf9`；发布前备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260805-200358-3dcacf9.sqlite`；上一稳定版本 `/www/wwwroot/yeu/releases/20260805-085231-af012da` 已保留，当前 `yeu.service` active。
- 架构变化：公开静态资源新增规范首页二维码，不涉及数据库、API、路由或运行时逻辑。
- 后续动作：站内需要二维码时统一引用 `/images/yx-home-qr.png`，不要重复生成内容不同的首页二维码；将本次已验证的 smoke 清理顺序固化进正式部署脚本。

## 2026-08-09 - Client recovery and public assistant stability

- Good: production logs showed successful 200 responses and no recent Nginx
  429s, so the fix targeted the observed client recovery loop and duplicate
  assistant requests instead of disabling protection globally.
- Good: repeated recovery now produces a clean stable URL and skips repeated
  service-worker/cache deletion; explicit actions still navigate to the
  selected route. The search page uses one immediate watcher, and assistant and
  WeChat diagnostic budgets were raised only to the documented normal-user
  envelope.
- Bad: running multiple `pnpm` test commands concurrently caused a Windows
  `.nuxt` file-lock (`EPERM`). Future validation must run Nuxt generation and
  type checks serially, or use direct existing binaries for read-only tests.
- Avoid: do not append another `_recover` token, clear every cache on every
  retry, or remove rate limits to solve shared-CDN-IP pressure. Keep the two
  layers and verify trusted proxy edges whenever the CDN changes.
- Verification: client-recovery and WeChat-share tests pass; assistant route
  assertions pass. One pre-existing assistant term-normalization assertion
  remains red because the current implementation keeps the original long
  phrase alongside its focused term; it is unrelated to this stability patch.

## 2026-08-08 - 2026级官方新生问答与迎新系统入口

- 本次目标：吃透学校 2026-08-07 发布的新生问答，把可核验内容写入知识库，并让用户询问迎新系统、分班入群和转专业时间时得到直接、可点击、低延迟的答案。
- 实际完成：新增 11 条官方知识，覆盖迎新系统、缴费住宿费、银行卡、分班与班群、转专业月份、助学贷款、第二学位、床上用品、校区交通、快递地址和行李清单；迎新系统入口统一为 `https://yedx_yx.leyunykt.com/student/index.html#/Login?entCode=yedx`。相关答案只要提到进入迎新系统，就自动补齐“学校官方迎新系统”引用；班级/班群自然问法进入确定性本地意图；已核验确定性答案先于模型综合返回。
- 做得好的地方：先核验公众号发布主体、标题、日期和迎新系统 HTTPS 可用性，再拆成独立知识点；没有写入容易变化的群号、贷款汇款账户，也没有固化与用户已核验“计算机科学与技术按新区记录”冲突的专业片区表。发布全程保持旧服务运行，新产物在可写数据库副本和独立端口通过后才原子切换，线上每一步都保留回滚点。
- 做得不好的地方：首次并行运行多个 `pnpm` 命令触发 Windows 依赖目录 EPERM 锁冲突；服务器直接构建受约 1.8GB Node 堆限制发生 OOM，改为上传本地 `.output`；一次 `runuser` 冒烟因工作目录处理失败，一次 systemd 冒烟环境文件把换行写成字面量，另一次长 SSH 命令被 PowerShell 吃掉 SQLite 引号。更重要的是，最初的服务函数测试没有配置真实网关，未暴露“确定性答案已生成但仍先调用模型综合”的优先级错误，直到公网计时才发现。
- 根因：知识入库、确定性意图、文档综合和答案缓存属于同一检索编排链，单测只验证最终答案正确不足以证明没有多余模型调用；发布命令跨 PowerShell、SSH、Bash 和 systemd 多层解释，内联长命令容易破坏引号与换行。
- 后续避免：确定性处理器必须在任何模型综合之前短路，并测试 `mode=local`、`usedWebSearch=false`、检索路径及耗时；新增入口型知识必须覆盖用户真实自然问法。依赖检查串行执行；服务器不再承担完整前端构建；复杂发布使用版本化脚本，环境覆盖用独立 `EnvironmentFile`，数据库冒烟只读可写副本；公网验证必须同时检查答案、引用、路径、步骤耗时和是否联网。
- 验证环境与结果：38 项 AI/知识定向测试通过，受影响文件 ESLint、Nuxt typecheck、`git diff --check` 和三次迭代后的最终生产构建通过。公网 `https://yx.huiliyill.cn/api/public/assistant` 实测：迎新系统入口 102ms、班级与班群 81ms、2026级转专业月份 72ms，均为 `mode=local`、`retrievalPath=local_database`、`usedWebSearch=false`，引用可点击；`yeu.service` active，知识爬虫 timer disabled。
- 发布/回滚信息：知识提交 `0ede995`、入口补强 `25b2ffd`、班群意图 `8ee8efc` 和确定性优先级修复 `62abaf0` 已推送个人仓库。最终生产 release 为 `/www/wwwroot/yeu/releases/20260808-225220-62abaf0`，切换前备份为 `/www/wwwroot/yeu/shared/backups/yeu-before-20260808-225220-62abaf0.sqlite`，直接回滚版本为 `/www/wwwroot/yeu/releases/20260808-224522-8ee8efc`。
- 架构变化：知识层新增当届官方新生问答；检索编排层增加迎新入口、转专业月份、分班与入群三个确定性意图，并在缓存前统一补齐迎新系统引用；回答阶段的优先级调整为“确定性本地答案、必要的官方文档综合、其他本地或网页路径”。
- 后续动作：为带真实 AI 网关配置的 API 路径加入“模型不得被调用”的可观测回归桩；继续从学校官方渠道补齐当届易变信息，发生来源冲突时保留证据等级和人工确认边界。
## 2026-08-09 - Public welcome-system knowledge import

- Goal: import useful common freshman materials from the authenticated welcome system while excluding personal information and personal assignment data.
- Completed: allowlisted `GetAllGuide` and `GetAllFile` only; imported 8 guides and 3 unique public DOC/DOCX attachments; compiled 169 extracted claims with review status; added text transcriptions for the image-only registration-flow and comfort-dorm guides; added parser, host/path allowlist, HTML sanitization, dedupe, personal-field rejection, official-source retrieval, semantic-arrival retrieval, and local-route tests.
- Good: inspected the frontend bundle first to identify the endpoint boundary; excluded user, pre-registration, dorm-selection, payment, face, upload, and identity endpoints; kept the bearer token in process memory only; retained source metadata internally while disabling public citation for authenticated guide records; verified local retrieval for comfort-dorm area, occupancy, price, and application timing.
- Bad: the upstream guide metadata contains stale update timestamps and some old generic configuration endpoints; these were excluded from ingestion instead of being treated as current facts. The upstream HTML embeds large base64 images, so image-only pages required a checked text transcription. Initial release smoke attempts also inherited `NITRO_PORT=3000` from the production environment, and a direct request with the public Host header received the expected HTTP-to-HTTPS 301 instead of reaching the isolated app. Both failed before switching `current`.
- Root cause: the welcome system mixes public common content with authenticated personal workflows under the same API namespace; endpoint-level allowlisting is required before parsing.
- Additional root cause found in verification: the document retriever previously allowed only `yeu.edu.cn` source URLs, so newly imported welcome documents were stored but invisible to AI search. The source filter now explicitly allows the exact official welcome-system platform, with a regression fixture.
- Additional retrieval root cause: a strict raw-question core filter rejected documents that matched several strong semantic expansions, and an old answer-cache entry still returned the pre-import “cannot confirm” response. The relevance guard now accepts two strong expanded matches, arrival wording expands to official material phrases, and cache version `rag-v42-welcome-local-routing` invalidates the old route and answer.
- Avoid next time: never crawl the whole authenticated API, never persist bearer tokens or response IDs, never import `GetMe`/`GetPreRegister`/`GetDorms`/payment/face/upload data, and do not publish auto-compiled claims without review. Keep importer tests fail-closed for schema drift and attachment-host changes.
- Verification: 46 combined AI/knowledge/importer tests passed in the broad run, followed by focused 42- and 35-test routing runs; targeted ESLint, Nuxt typecheck, production builds, SQLite `quick_check`, foreign-key check, source and CDN health checks passed. Production contains 11 ready welcome documents, 169 review claims, and zero auto-published claims. Production answers for comfort-room locations and arrival materials use `retrievalPath=local_database` with no web search; the arrival answer distinguishes ordinary undergraduate and top-up undergraduate materials.
- Good: kept the previous service running through every build and failed smoke attempt; used a writable database copy and Linux native SQLite module; strengthened the smoke gate to assert content, local route, and no web search rather than accepting any plausible answer. No personal endpoint or personal field was imported.
- Avoid next time: isolated Nitro startup must override both `PORT` and `NITRO_PORT` after the shared environment is loaded; direct smoke requests must not send the public Host over plain HTTP; retrieval-policy changes must bump the answer-cache version before public verification.
- Release: production `current` is `/www/wwwroot/yeu/releases/20260809-170815-welcome-v42`; direct rollback is `/www/wwwroot/yeu/releases/20260809-170415-welcome-local`; the release backup is `/www/wwwroot/yeu/shared/backups/yeu-before-20260809-170815-welcome-v42.sqlite`.
- Follow-up: invalidate the short-lived welcome-system session by logging out or signing in again; future refresh imports require a new process-only token and the same privacy, review-status, and release gates.
## 2026-08-11 - Official dormitory knowledge and retrieval priority

- Goal: import the supplied official 2026 dormitory article, make dorm questions retrieve the right campus/gender/aspect globally, and deploy without interrupting the current service.
- Done well: facts were split into bounded knowledge entries; official dorm data outranks experience notes; aliases cover old/new campus, comfort rooms, facilities, schedules, and building lookups; no personal assignment data or WeChat credentials were imported; cache policy was bumped to `rag-v43-dorm-guide-priority`.
- What went poorly: the previous seed contained conflicting dorm wording and a malformed time value, so the new entries needed an explicit conflict update and regression coverage. This shows that every new official article must be checked against existing entries before release.
- Avoid next time: do not add a one-question special case, do not treat promotional prose as policy, do not depend on external image hotlinks, and do not switch production before a writable-database smoke test checks `retrievalPath=local_database` and `usedWebSearch=false`.
- Verification: `scripts/assistant-knowledge.test.ts` passed 8/8 in the targeted run; full assistant tests, lint, typecheck, build, deployment, and online smoke checks remain required before declaring release complete.
- Architecture impact: official dorm content is now a first-party, time-scoped source; the assistant has a shared dorm semantic-priority layer; production remains `release/current/shared` with idempotent SQLite seeding and rollback retention.

## 2026-08-11 - QQ recovery and searched-web/no-answer diagnosis

- Goal: restore the QQ bot after the server restart and fix searches that visibly found web pages but returned the built-in-data gap message.
- Done well: health checks separated the running container from the actual QQ/OneBot login state; a fresh QR cache restored `online=true` and `good=true`. Production assistant runs were checked together with answer timing and cache contents, which exposed successful-looking zero-millisecond gap answers rather than a gateway outage.
- What went poorly: all identity-shaped web searches were previously restricted to the university domain, so a general company question could find six pages and then discard all six. The low-confidence gap was still stored in the in-memory answer cache, making the incorrect result look permanent on retry.
- A pre-switch production smoke also found that stale web evidence for bed dimensions could outrank the newly reviewed 2026 dorm guide. Empty-database tests had missed this production-data interaction; the planner now proves a verified local dimension answer before deciding that live or cached web evidence is required.
- Avoid next time: do not use “search completed” as a proxy for “answerable evidence”; test the transition from raw web results through intent filtering into synthesis. Never cache low-confidence evidence gaps, and do not solve name-collision risk by excluding an entire source class when explicit biography-role checks can enforce the boundary.
- Architecture impact: external identity evidence is accepted only when it explicitly describes the normalized subject; incidental mentions remain blocked. Cache policy is now `rag-v44-web-evidence-answer`, and responses below `0.6` confidence bypass both memory and persistent answer caches.
- Verification: 76 combined assistant, knowledge, feature-entry, web-evidence, cache, and bot-facing tests passed after the final dorm-priority change. Targeted ESLint, Nuxt typecheck, production build, Linux isolated smoke, and public production smoke passed. The public API rejects calls without the website origin as intended; website-origin requests answer a company-role lookup with external evidence and answer dorm bed dimensions from reviewed local knowledge without web search. Public health reports the database and configuration ready.
- Release: production `current` is `/www/wwwroot/yeu/releases/20260811-202602-web-evidence-v44`; direct rollback is `/www/wwwroot/yeu/releases/20260809-170815-welcome-v42`; the release backup is `/www/wwwroot/yeu/shared/backups/yeu-before-20260811-202602-web-evidence-v44.sqlite`. QQ OneBot and the relay are healthy after login restoration; a real group mention remains the final operator-visible delivery check and must not be sent unsolicited.

## 2026-08-12 - Admin visitor performance and ban detail correctness

- Goal: reduce the delay when opening administration screens, make ban details reliably show their underlying record, and explain the active ban entries accurately.
- Done well: the default visitor list and active-ban view now use database count, limit, and offset instead of loading all visitors before slicing a page. The dashboard only requests the small recent-visitor sample and skips the visitor-page analytics payload. Visitor details load the activity timeline first, then load the heavier security profile in the background.
- Root cause: the database kept expired temporary honeypot rows with `is_active=1`; actual request enforcement checked expiry, but the list and dashboard counted the stored flag alone. A ban opened from an audit link could also be absent from the current list page, causing the UI to construct an empty placeholder instead of loading the actual record. IP linkage only checked a visitor's latest address, so a visitor who changed network could appear unrelated to the IP that triggered the ban.
- Fix: active status now requires both `is_active` and a future (or absent) expiry. Expired honeypot rows are retained as history, shown as automatic temporary restrictions, excluded from current enforcement counts, and archived when the same IP next triggers the trap. Ban detail retrieves its exact ID when needed; IP visitor filtering includes historical event IPs.
- Verification: 26 focused visitor, security, dashboard, and anti-crawl tests passed; Nuxt typecheck, production build, and `git diff --check` passed. Production inspection found the four visible rows were all `crawler_honeypot` temporary IP restrictions and already expired, including one shared-network IP with a large normal visitor footprint. The isolated Linux process loaded the production SQLite native module and opened the copied database; after the atomic switch, `yeu.service`, `/api/health`, the public home page, and `/admin/bans` all returned healthy results. Actual active bans after deployment: 0.
- Avoid next time: any time-limited record must have one shared "effectively active" definition for enforcement, lists, dashboard counts, and detail actions. Dashboard metrics must use aggregate queries or capped samples, never scan the full visitor table merely to show a count. Detail routes must fetch a direct record rather than relying on whichever paginated page happened to load first.
- Release: commit `bd0d84e` is deployed at `/www/wwwroot/yeu/releases/20260812-200500-bd0d84e`; the database backup before the switch is `/www/wwwroot/yeu/shared/backups/yeu-before-20260812-200500-bd0d84e.sqlite`. The prior production release remains available at `/www/wwwroot/yeu/releases/20260811-202602-web-evidence-v44` for rollback.

## 2026-08-12 - Honeypot ban detail wording and navigation

- Goal: make automatic crawler-trap records understandable and actionable from the ban list.
- Fix: automatic records now use Chinese reason text throughout the list and detail. Their action opens the matching IP's historical visitor trail instead of the administrator audit page, because system-created trap rows have no administrator audit event. Ban detail is now a modal so it is visible immediately instead of expanding below a long paginated list.
- Verification: targeted security and visitor tests passed (19/19); Nuxt typecheck and diff whitespace checks passed.
- Avoid next time: buttons must name the data they can actually show. Do not label a visitor-originated system event as an administrator operation record.

## 2026-08-12 - Chinese labels for all visitor-ban reasons

- Goal: prevent internal English identifiers and historical test labels from appearing anywhere in administrator-facing ban views.
- Fix: a shared reason presentation rule keeps administrator-written Chinese text unchanged, translates crawler-trap reasons, and converts all legacy smoke, audit, debug, and automated-test reasons into clear Chinese historical-record labels. The same rule is used by the ban list, visitor/IP/account dossiers, recent-ban timeline, and dashboard reason statistics.
- Verification: focused visitor/security tests passed (20/20), Nuxt typecheck and diff whitespace checks passed.
- Avoid next time: persist stable machine identifiers only when necessary, but always use a shared presentation mapper at every administrator-facing boundary rather than exposing raw database text.
