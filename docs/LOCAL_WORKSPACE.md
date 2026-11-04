# 本地工作区：磁盘占用、构建耗时与清理规则

本文只记录**本机开发工作区**的事实与规则：仓库为什么占这么多盘、`pnpm build` 的时间花在哪、哪些目录可以删、哪些不能删。生产部署与发布流程见 [DEPLOYMENT.md](./DEPLOYMENT.md)，后台日常操作见 [ADMIN_RUNBOOK.md](./ADMIN_RUNBOOK.md)。

基线数据采集于 2026-11-03，Windows / NTFS E: 盘，Node v24.11.1、pnpm 10.28.1、16 核，pnpm store 在 `E:\.pnpm-store\v10`。

## 1. 磁盘占用构成（清理后实测）

| 目录 | 大小 | 说明 |
| --- | --- | --- |
| `.data/` | 1.3G | 本地数据库与快照，见第 3 节 |
| `node_modules/` | 1020M | 其中 onnxruntime-node 208M、onnxruntime-web 69M、@huggingface/transformers 47M、@napi-rs/canvas 37M |
| `miniapp/` | 397M | 独立 uni-app 子项目，自带 node_modules，与主站构建无关 |
| `.git/` | 343M | pack 258M + loose 76M，历史里含若干 mp4 与历史发布包 |
| `data/` | 46M | 受版本控制的应用数据（种子、知识库），**不要动** |
| `.output/` | 40M | 构建产物，可随时重建 |
| `.nuxt/` | 16M | 构建缓存与中间产物，可随时删除 |

仓库总量：清理前 5.9G（`.data` 3.9G），清理后 3.3G。一次清理腾出 2.65G。

`node_modules` 里那 361M 的推理依赖只服务本地 rerank（`server/modules/assistant/local-rerank.ts:49` 用变量名动态 import，装在生产上也不影响主流程）。只在需要离线 rerank 时才装，其余环境可以不装这组可选依赖。

## 2. 构建耗时：时间花在 Nitro

`pnpm build`（清空 `.nuxt`、`.output` 的冷构建）在 92–98s 之间，拆解如下：

| 阶段 | 耗时 | 占比 |
| --- | --- | --- |
| Nuxt 引擎启动（nuxt.config 编译、icon 274 图标、router.options、nitro:config） | 16.5s | 17% |
| Vite 客户端构建 | 9.1s | 9% |
| Vite SSR 构建 | 10.0s | 10% |
| **Nitro 服务端打包** | **60.0s** | **61%** |
| 收尾脚本（copy-sqlite-vec-binary、copy-client-manifest） | 3.0s | 3% |

结论：慢的不是"项目大"，是 Nitro 在 338 个 API 路由上做单进程 rollup 打包。不清 `.nuxt` 的热构建只快约 10s（87.7s），因为 Nuxt 生产构建对 Nitro 基本没有增量缓存。

### 已落地的配置

`nuxt.config.ts` 设了 `sourcemap: { server: false }`。Nuxt 4 默认 `@nuxt/schema` 的 `sourcemap.server` 为 `true`，服务端 sourcemap 让冷构建多约 7s，`.nuxt/dist/server` 从 6.2M 涨到 31M，`.output` 里多出数百个 `.map`。线上排错用堆栈行号 + release 对应 commit 已经够用，不需要产物里带源码映射。

### 实测过但不要采纳的"优化"

| 尝试 | 结果 |
| --- | --- |
| `nitro.sourceMap: false` | Nitro 60.4s→58.8s，只是去掉 `.output` 里的 `.map`；已被上面的 `sourcemap.server: false` 覆盖，不必重复配置 |
| `nitro.rollupConfig.treeshake: false` | 总时长 94.4s（约 -4%），产物 20.5M→26.8M，得不偿失 |
| 把 lint / typecheck 塞进构建 | 两者合计约 98s，与构建本身同量级，且当前是红的（见下）。构建只做构建 |

### 构建时间的常见假象

- **挂着的 dev server 会抢 CPU 并锁住 `.nuxt`**：曾观测到一个 `nuxt dev` 占 852s CPU、2.1G 内存，导致 `rm -rf .nuxt` 报 `Directory not empty`、构建时长波动 10s 以上。构建前先确认没有残留的 `nuxt dev` / `pnpm dev` 进程。
- **磁盘不是瓶颈**：`.output` 只有 40M，NTFS 上的写入时间在总时长里可以忽略。

### 构建后必须核验

`pnpm build` 后确认退出码为 0（OOM 时 pnpm 只打 `ELIFECYCLE`，不会显式报错），并确认产物大小与时间戳和上一次不同，否则打的是旧产物。这是发布红线，见仓库 [AGENTS.md](../AGENTS.md) 第 6 节。

## 3. `.data/` 的删留规则

`.data/` 是 Git 忽略的本地数据目录。判断标准只有一条：**有没有脚本把它当默认路径**。

必须保留（有代码或流程在用）：

| 路径 | 使用方 |
| --- | --- |
| `.data/sweep/yeu-sweep.sqlite` | `pnpm qa:sweep` 默认库（`scripts/assistant-qa-sweep.ts:261`），也是 QA 卡片的生产库快照 |
| `.data/codex-map-content-20260713.sqlite` | `data:verify:local`、`scripts/verify-live-data-parity.ts:48` |
| `.data/yeu-official-data/yeu-knowledge.json` | `scripts/yeu-knowledge-sync.ts:39` |
| `.data/e2e.sqlite`（含 `-wal`、`-shm`） | `scripts/e2e-fixtures.ts:3` 的 `E2E_DATABASE_PATH`，`pnpm e2e` 会重建 |
| `.data/yeu-eval-local.sqlite` | `scripts/yeu-eval-supplement-claims.ts:165` 默认写入 |
| `.data/MyMapTools/`、`.data/tools/`、`.data/tessdata/` | 外部工具与数据拷贝，删了要重新下载，不属于"产物" |

可以删（一次性产物，删掉不影响任何命令）：

- `*.tar.gz` —— 历史发布包、`.data/yeu-eval/` 下的评测打包、根目录的部署残留
- `*.log`、`*.jsonl`、`*.png` —— 构建与调试日志、截图
- 数据库快照与备份：`snap.sqlite`、`*.sqlite.gz`
- `lint-*.json`、`debug-ai*.sqlite`、`pipeline-review-*`、`withdrawn-lint-*` —— 一次性审计与排障中间件

2026-11-03 按上表清理：`.data` 从 3961MB 降到 1309MB，其中 `snap.sqlite` 845M、`yeu-sweep.sqlite.gz` 243M、`yeu-eval/*.tar.gz` 76 个约 1.29G、`yeu-2026*-output.tar.gz` 81M、`builds/*.tar.gz` 28M、`.data/sweep/*.tar.gz` 170M。

`.git` 的 343M 属于历史包袱（历史提交里的 mp4 与发布包），重写历史会改变所有 commit hash 并影响线上 release 对应关系，收益只是本地磁盘，不作为常规维护动作。

## 4. 质量闸门的现状

构建之外还有两道门，当前都不绿，不要塞进 `pnpm build`：

- `pnpm lint`：约 55s，存量 16120 条问题（118 个文件），主因是 eslint 10 + `@stylistic` 的 `quote-props`、`operator-linebreak` 规则打在旧代码上，与本次构建无关。
- `pnpm typecheck`：约 43s，`server/modules/signal/scoring.ts:214` 报 `TS18049`（`input.publishedAt` 可能为空），应单独修，不要靠构建掩盖。

两者单独跑、单独修，构建只负责产出可发布产物。
