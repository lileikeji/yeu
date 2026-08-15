# AI 检索记忆开源项目调研与融入方案

> 日期：2026-08-05
> 范围：全网检索「AI 检索 / 智能体记忆 / RAG 记忆」相关开源项目，评估如何融入本仓库（yeu-freshman-guide，Nuxt 4 + better-sqlite3 + Drizzle，单核 768MB 预算）。
> 结论先行：**当前项目不依赖外部服务即可先做「会话级记忆」（P0）；若有 OpenAI 兼容 embedding 接口，用 sqlite-vec 做向量 + n-gram 混合检索（P1）；再按 Mem0 / Graphiti / LazyGraphRAG 的思想分阶段演进（P2/P3）。不建议在本机直接部署 Letta / Cognee / Graphiti / Mem0 的 Python 服务端（内存与形态都不匹配），而是吸收其设计。**

---

## 一、当前项目 AI 检索现状（融入的基线）

| 已有能力 | 位置 | 说明 |
| --- | --- | --- |
| 零依赖语义检索（字符 n-gram Dice 相似度） | `server/modules/assistant/retrieval-semantic.ts` | 因网关无 embedding、768MB 跑不起本地 transformer，用 n-gram 近似语义 |
| 多路排序融合（RRF） | 同上 `reciprocalRankFusion` | 与 RAGFlow/R2R 同款 1/(k+rank) 融合，可直接复用于"关键词+向量+图+记忆"多路 |
| 本地证据管道 | `server/modules/assistant/service.ts` | 意图分类 → 多数据源检索（places/contents/procedures/student-rules/seed/知识库）→ 本地可答则本地答，否则调网关 |
| 回答缓存 | 表 `assistant_answer_cache` | 同一查询命中缓存，降本提速 |
| 网络知识缓存 | 表 `assistant_web_knowledge` | Firecrawl MCP 结果持久化，二次检索 |
| 轻量知识图谱 | 表 `knowledge_entities` / `knowledge_claims` / `knowledge_claim_entities` / `knowledge_conflicts` | 已有实体-声明-来源结构 + 后台图谱可视化（`library.ts` 社区聚类） |
| 追问解析 | `resolveAssistantFollowUpQuery` | 只支持单轮 `previousQ`，无真正会话状态 |
| 运行分析 | 表 `assistant_runs` / `assistant/analytics.ts` | 每轮问答的成功/失败/耗时 |

**结论：项目已具备"记忆"所需的大部分地基（缓存、图谱、多路融合），缺的是「跨轮会话记忆」「向量通道」「记忆抽取/遗忘」三块。**

---

## 二、全网开源项目盘点

### 2.1 通用记忆层（Universal Memory Layer）

**Mem0（mem0ai/mem0，~60K ⭐，Apache-2.0）**
- 定位：LLM 应用的"记忆层"。核心是 **ADD-only 抽取**：单次 LLM 调用把对话提炼为事实性记忆条目，不 UPDATE/DELETE，靠"新增+检索"演化；支持向量 + 全文 + 图谱三路混合检索与"记住/遗忘"动作。
- 形态：Python 包 + `mem0-ts` TypeScript SDK；OSS 版默认 Qdrant 向量库 + 任意 LLM。
- 与本项目契合点：抽取思想（用现有网关即可）、记忆 TTL 与清理（issue #5624）、混合检索路由。
- 不契合点：默认强依赖 Qdrant/向量库，需另起服务；Oss 版仍要 LLM 参与抽取（本项目本来就有网关，可以接受）。

**Memobase（memodb-io/memobase，Apache-2.0）**
- 定位：面向"用户画像"的记忆 API，提供 OpenAI 客户端补丁（`openai_memory.py`），官方 TS SDK（`@memobase/memobase`）。
- 形态：自托管服务端 + SDK；数据模型按 user 组织。
- 契合点：用户画像式记忆的字段设计可参考；但本项目首版无登录（游客为主），**记忆必须匿名化**，不宜直接搬"按用户"模型。

### 2.2 状态化智能体 / 记忆管理（OS 式记忆）

**Letta（letta-ai/letta，原 MemGPT，deductive-ai/MemGPT，~15K+ ⭐，Apache-2.0）**
- 定位：把 LLM 当"操作系统"，agent 自带自编辑记忆块（core memory + archival memory + recall memory），按需换页。
- 形态：Python 服务端（独立进程/平台），自带推理循环，几乎接管整个对话编排。
- 与本项目契合点：**思想**——记忆分层（核心/档案/回忆）、记忆"自编辑"。已有 `docs/plans/accounts-visitors-chat.md` 规划聊天，可借鉴分层设计。
- 不契合点：整包部署会重构现有 assistant 管道（`answerCampusQuestion` 是"检索→网关→引用"的精简形态），768MB 单核也不适合跑 Letta server。**只吸收分层记忆模型。**

**LangMem（langchain-ai/langmem）**
- 定位：LangChain 生态的记忆工具库：从对话抽取记忆、记忆管理（prompt 优化）、记忆检索工具。
- 形态：Python；依赖 LangChain。
- 契合点：记忆"抽取→存储→检索→更新"的 API 形态可参考。
- 不契合点：Python + LangChain 依赖，不直接进本仓库。

### 2.3 时序知识图谱记忆

**Zep / Graphiti（getzep/graphiti，~24K ⭐，Apache-2.0）**
- 定位：把对话/事实沉淀为**时态知识图谱**：实体为节点、事实为带 `valid_at/invalid_at` 双时间戳的边；检索 = 向量 + 全文 + 图遍历三路混合。
- 论文：*A Temporal Knowledge Graph Architecture for Agent Memory*（arXiv:2501.13956）。
- 形态：Python（FastAPI server）；Zep CE 已弃维护，Graphiti 是开放内核。
- 与本项目契合点：**现有 `knowledge_entities/claims/claim_entities` 已是图结构**，给边加时间戳即可复刻"信息过时/更正"记忆；三路 RRF 已有现成函数。
- 不契合点：Python 服务端不部署；图算法自行用 SQL 实现（点/边都在 SQLite）。

**Cognee（topoteretes/cognee，~6K ⭐）**
- 定位：ECL 管道（Extract-Cognify-Load）：抽取实体、增量建图、图谱 + 向量双存储、跨会话召回；与 LangGraph/CrewAI 集成。
- 形态：Python（另需 Neo4j/Postgres 或 SQLite 后端可选）。
- 契合点：增量建图 + 社区摘要（`library.ts` 已有社区聚类雏形）思路。
- 不契合点：Python + 重型依赖。

### 2.4 检索基础设施（可直接进本仓库的部分）

**sqlite-vec（asg017/sqlite-vec，~3K ⭐，MIT/Apache）**
- 定位：SQLite 向量搜索扩展（sqlite-vss 的继任者），零服务器，BLOB 存向量，支持 HNSW/暴力扫描、元数据过滤、逐块加载。
- Node 用法：npm 包直接 `loadExtension` 进 **better-sqlite3**（本项目正是 better-sqlite3 ^12.11.1），有 Linux x64 预编译产物，适配宝塔 Linux 部署。
- 契合点：**与现有 SQLite 同一库文件，不新增服务、不新增进程**；表即向量索引，Drizzle 可以普通列存 BLOB。
- 备选：SQLite-Vector（sqliteai/sqlite-vector，~1K ⭐，跨平台预编译，API 与 sqlite-vec 接近）。

**微软 GraphRAG / LazyGraphRAG（microsoft/graphrag）**
- 定位：图增强 RAG。经典版离线构建社区摘要（贵）；**LazyGraphRAG 改为"惰性构建"**：只在查询时沿图展开，成本/质量折中大幅优化。
- 形态：Python。
- 契合点：**"惰性"思想非常适配 768MB 预算**——不预建全局摘要，提问时才在 SQLite 里沿实体边展开（用现有 claims 表即可实现简化版）。
- 不契合点：Python 整包不部署。

### 2.5 中文生态与资料

- **awesome-ai-memory（XiaomingX/awesome-ai-memory）**、**Awesome-Agent-Memory（TeleAI-UAGI）**：中文精选清单，含 PowerMem（混合检索 + 艾宾浩斯遗忘 + Experience/Skill 蒸馏）、Memobase、Zep 等，适合持续跟踪。
- **中文 embedding 通道**（P1 用）：
  - 阿里云百炼 `text-embedding-v3/v4`：OpenAI 兼容接口，2048/1536/1024 维可选，中文强。
  - 硅基流动 SiliconFlow：`bge-m3` / `bge-large-zh-v1.5` 等，有免费额度，OpenAI 兼容。
  - 百度千帆 `bge-large-zh`。
  - 注意：现有生产网关**没有** embedding 端点（`retrieval-semantic.ts` 头注已说明），需在 .env 单独配一个 OpenAI 兼容 embedding base_url。

---

## 三、契合度评估（约束优先）

| 约束 | 影响 | 结论 |
| --- | --- | --- |
| 单核 768MB，跑不起本地 transformer | Letta/Cognee/Graphiti 服务端、本地 bge 模型都不现实 | 取设计思想，不取运行时 |
| 生产网关无 embedding/rerank 端点 | 纯向量方案不可行；n-gram 方案保留为兜底 | 若配 OpenAI 兼容 embedding API（阿里/硅基）→ P1 可行 |
| better-sqlite3 + Drizzle，宝塔 Linux | sqlite-vec 有 Linux x64 预编译，可 `loadExtension` | 新增依赖少且同进程 |
| 产品原则：游客免登录、AI 检索首版不进后台 | 记忆不能按"用户账号"存 | 一律 **session 级匿名记忆**（浏览器生成的 sessionId，服务端只存 hash） |
| 已有回答缓存 + 网络知识缓存 + 图谱表 | 记忆落点现成 | P0/P3 大量复用现有表 |

---

## 四、融入方案（分阶段，每阶段可独立交付）

### P0 —— 会话级记忆（零新依赖，建议先做）

> **实施状态：已完成（2026-08-05，含前端接入与维护脚本）**。新增表 `assistant_session_memory`（迁移 `0021_true_hellfire_club.sql`）、模块 `server/modules/assistant/memory.ts`、service 包装 `answerCampusQuestion`（无 sessionKey 时行为与原来完全一致）、API 层可选 `sessionId` 字段（服务端只存 sha256 哈希），多轮追问按 session 最近一问合成。测试 `scripts/assistant-memory.test.ts`（6 条）与 HTTP 冒烟验证通过。遗留：记忆上下文目前只注入模型提示词，未参与检索证据列表（避免污染引用）。
前端 `app/pages/search.vue` 已发送匿名 `sessionId`（localStorage `yeu-assistant-session-v1`，`app/utils/assistant-session.ts`）；维护脚本 `scripts/cleanup-session-memory.ts`（`pnpm memory:cleanup`，建议每日 cron）。

借鉴 Mem0 的 **ADD-only 抽取** 与 Letta 的 **分层记忆**，但只用现有网关与 SQLite：

1. **新表** `assistant_session_memory`（Drizzle 迁移）：
   - `id`（uuid）、`session_key`（服务端存 `sha256(sessionId)`，匿名化）、`kind`（`preference` / `fact` / `answered` / `open_question`）、`content`、`source_query_hash`、`created_at`、`last_hit_at`、`hit_count`。
2. **写入时机**：`answerCampusQuestion` 返回后，把「问题 + 答案 + 是否本地命中 + 是否引用官网」交给一次轻量 LLM 抽取（或纯规则抽取），产出 1~3 条记忆条目。规则抽取可先用现有 `assistantQueryProfile` / 意图分类结果，避免每轮都调网关。
3. **检索时机**：下一轮同 session 提问时，记忆条目作为一路证据参与现有 `reciprocalRankFusion`（记忆列表 = 第 N+1 路）。
4. **遗忘**：`last_hit_at` 超过 TTL（如 30 天）由维护任务清理；命中次数加权，模仿 PowerMem 的艾宾浩斯衰减。
5. **追问升级**：把 `resolveAssistantFollowUpQuery`（单轮 `previousQ`）改为服务端按 session 取最近 3~5 轮上下文解析（现有函数逻辑直接复用）。
6. **入口改动**：`assistant.post.ts` 与 `stream.post.ts` 的 schema 增加可选 `sessionId`；无 sessionId 则行为与现在完全一致（向后兼容）。

涉及文件：`server/database/schema.ts`、`server/database/migrations/`、`server/modules/assistant/memory.ts`（新）、`server/modules/assistant/service.ts`（挂两个 hook）、`shared/schemas/server.ts`、`.env.example`（可选 TTL 配置）。

### P1 —— sqlite-vec 向量通道（1 个 npm 依赖）

> **实施状态：已完成（2026-08-05）**。
> 部署注意：sqlite-vec 的平台二进制（optionalDependency）不会随 Nitro 自动进 `.output`，`pnpm build` 已改为 `nuxt build && tsx scripts/copy-sqlite-vec-binary.ts` 构建后拷贝；服务端运行时环境变量是 `NUXT_AI_EMBEDDING_*`（PM2 env 或 dev 前 export），维护脚本用 `AI_EMBEDDING_*`。新增 `assistant_embeddings` 表（迁移 `0022_talented_stellaris.sql`）、模块 `server/modules/assistant/embedding.ts`（OpenAI 兼容 embedding 客户端 + BLOB/余弦工具）与 `vector-search.ts`（索引收集/写入/检索/降级）；`server/database/client.ts` 尽力加载 sqlite-vec 扩展（失败自动降级 n-gram）；查询时向量 Top-K 并入现有证据列表（URL 去重）；维护脚本 `scripts/rebuild-embeddings.ts`（`pnpm embeddings:rebuild [--apply]`）。配置 `AI_EMBEDDING_BASE_URL/API_KEY/MODEL` 后启用，未配置时零行为变化。测试 `scripts/vector-search.test.ts`（4 条，确定性 fake embedder 无网络依赖）。

1. `pnpm add sqlite-vec`，在 `server/database/client.ts` 里 `db.loadExtension(sqliteVec.getLoadablePath())`（对 Linux x64 宝塔环境有预编译；失败时 catch 降级，不阻塞现有功能）。
2. 新表 `assistant_embeddings`：`chunk_id`、`source_type`（`entry/web/document/claim/place/procedure/content`）、`source_id`、`text_hash`、`embedding`（BLOB，float32）、`created_at`。用 `vec0` 虚拟表或普通表 + 自定义 SQL 余弦，按规模选。
3. **embedding 来源**：`.env` 新增 `AI_EMBEDDING_BASE_URL` / `AI_EMBEDDING_API_KEY` / `AI_EMBEDDING_MODEL`（默认 `text-embedding-v3` 或 `bge-m3`）；无配置时 P1 自动关闭、回退现有 n-gram 路径。
4. **混合检索**：查询同时跑「关键词（现有 LIKE/FTS）+ n-gram Dice（现有）+ 向量 TopK」，三路结果进现有 `reciprocalRankFusion`——**RRF 已存在，改造成本极低**。
5. 增量维护：新知识入库/发布时同步算向量（复用 `knowledge/service.ts` 的发布钩子与 `storeWebEvidence` 的缓存路径）；后台提供"重建向量"维护脚本（参考现有 `sync-*` 脚本模式）。
6. 若 embedding API 不可用/成本敏感：**可只对高频条目与长期记忆做向量化**，其余走 n-gram。

涉及文件：`package.json`、`server/database/client.ts`、`server/database/schema.ts`、`server/modules/assistant/vector.ts`（新）、`server/modules/assistant/service.ts`、`scripts/rebuild-embeddings.ts`（新）、`.env.example`。

### P2 —— 记忆抽取与遗忘（借鉴 Mem0 / PowerMem）

> **实施状态：已完成（2026-08-05）**。`answerCampusQuestion` 回答后调用网关做 LLM 抽取（`extractSessionMemoryFacts`，复用 `postGatewayChat` 传输层与共享熔断，失败不计入熔断计数），结果经 `rememberExtractedFacts` ADD-only 写入（按 content_hash 去重，新增 `content_hash` 列，迁移 `0023_thin_sunset_bain.sql`）；TTL 支持 `NUXT_ASSISTANT_MEMORY_TTL_DAYS` 环境变量。测试 `scripts/memory-extraction.test.ts`（3 条，注入 fake 网关）。

- 在 P0 之上：把「规则抽取」升级为「LLM 单次调用抽取」（ADD-only：新增记忆条目，不修改旧条目；同义冲突时以新条目覆盖检索优先级）。
- 记忆支持 `remember` / `forget` 动作（Mem0 API 形态）：前台只暴露 `forget`（删除某条记忆），防止误记；管理后台可查看 session 记忆统计（匿名聚合，不展示原文里的敏感信息）。
- 记忆 TTL + 清理脚本（对应 mem0 issue #5624 的 `memory_ttl` / `cleanup_expired()`）：并入现有 cron 维护任务。

### P3 —— 时态图谱记忆（借鉴 Graphiti / Zep / LazyGraphRAG）

> **实施状态：已完成（2026-08-05）**。新模块 `server/modules/assistant/graph-search.ts`：查询时按规范化名称/别名匹配 `knowledge_entities` → 沿 `knowledge_claim_entities` 走 1-2 跳展开声明 → 只保留 published、在 `valid_from/valid_until` 时效窗口内、且未被 `supersedes_claim_id` 替代的声明。分析阶段与向量一起并入 `localEvidence`（新增 `hasHybridEvidence` 标记，允许混合证据驱动模型合成路径）。测试 `scripts/graph-search.test.ts`（4 条）。实测：图谱声明（含时效排除）进入模型证据并影响答案。

- **时态边**：给 `knowledge_claims` 与实体关系增加 `valid_at` / `invalid_at`（Zep 论文的 bi-temporal 简化版），支持"今年政策已更新/去年规则已废止"这类记忆更新（本项目已有 `knowledge_conflicts` 表可承接冲突检测）。
- **惰性图扩展**（LazyGraphRAG 思想）：不预建全局社区摘要；提问命中实体后，只在 SQLite 里沿 `knowledge_claim_entities` 做 1~2 跳扩展，产出图证据一路参与 RRF。
- **混合三路**：向量 + 关键词 + 图遍历 → RRF（Zep 论文检索路线在本地的最小实现）。
- 后台图谱可视化（`library.ts`）已按社区聚类，可直接展示新增的时态/记忆边。

---

## 五、参考链接

- Mem0：https://github.com/mem0ai/mem0
- Letta / MemGPT：https://github.com/letta-ai/letta 、 https://github.com/deductive-ai/MemGPT
- Zep 论文（时态知识图谱）：https://arxiv.org/html/2501.13956
- Graphiti：https://github.com/getzep/graphiti
- Cognee：https://github.com/topoteretes/cognee
- LangMem：https://github.com/langchain-ai/langmem
- Memobase：https://github.com/memodb-io/memobase
- sqlite-vec：https://github.com/asg017/sqlite-vec （Node 用法：https://alexgarcia.xyz/sqlite-vec/js.html ）
- SQLite-Vector：https://github.com/sqliteai/sqlite-vector
- 微软 GraphRAG / LazyGraphRAG：https://github.com/microsoft/graphrag
- 中文清单：https://github.com/XiaomingX/awesome-ai-memory 、 https://github.com/TeleAI-UAGI/Awesome-Agent-Memory
- 阿里百炼 OpenAI 兼容 embedding：https://help.aliyun.com/zh/model-studio/embedding-interfaces-compatible-with-openai
- 综合对比文章：https://dev.to/izgorodin/mem0-vs-zep-vs-letta-vs-cognee-vs-langmem-vs-mnemoverse-an-honest-map-of-agent-memory-in-2026-3l7b

---

## 六、风险与注意事项

1. **隐私**：首版游客匿名，sessionId 服务端只存哈希；记忆内容禁止落 PII（学号/电话等），抽取 prompt 里明确过滤。
2. **sqlite-vec 二进制**：宝塔 Linux 需确认预编译产物与 glibc 兼容；加载失败必须降级而非报错（现有检索完全不受影响）。
3. **embedding 成本**：P1 默认只对增量知识向量化 + 限量批处理，避免全库重算。
4. **网关 embedding 可用性未验证**：实施前先做一次探测脚本（curl OpenAI 兼容 /embeddings），失败则 P1 整体跳过。
5. **遗忘策略**：TTL 清理只作用于记忆表，不触碰 `assistant_answer_cache`（缓存仍按原策略）。
6. **P3 图遍历性能**：SQLite 递归 CTE 深度限制为 1~2 跳，超出回退关键词检索，防止单请求慢查询。
