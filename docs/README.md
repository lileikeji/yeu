# 项目文档索引

> 最近整理：2026-07-14（Asia/Shanghai）
> 适用阶段：V0.3 内容与办事流程 Alpha、地图真实数据核验
> 产品需求文档采用业界常用缩写 PRD；本仓库不另建内容重复的 `PRO.md`

## 1. 推荐阅读顺序

首次了解项目时按以下顺序阅读：

1. [PRD](./PRD.md)：用户、问题、MVP 范围、验收标准和明确非目标。
2. [信息架构](./INFORMATION_ARCHITECTURE.md)：公开页面、导航、路由和后台模块。
3. [地图交互规范](./MAP_INTERACTION_SPEC.md)：地图布局、标点、筛选、联动和失败降级。
4. [路线图](./ROADMAP.md)：当前进度、阶段门槛和未来商家/AI/官方协作边界。
5. [技术架构](./ARCHITECTURE.md) 与 [数据模型](./DATA_MODEL.md)：实现边界、领域关系和迁移约定。

内容维护与核验人员重点阅读：

1. [首批数据源与核验清单](./RESEARCH_SOURCES.md)。
2. [内容来源与治理政策](./CONTENT_POLICY.md)。
3. [地图数据就绪台账](./MAP_DATA_READINESS.md)。
4. [现场坐标采集与审核](./FIELD_COORDINATE_VERIFICATION.md)。
5. [单管理员运行手册](./ADMIN_RUNBOOK.md)。

准备上线或接管服务器时阅读 [宝塔 Linux 部署与运维](./DEPLOYMENT.md)。

## 2. 文档职责

| 文档 | 负责回答 | 当前属性 |
| --- | --- | --- |
| [PRD](./PRD.md) | 为谁做、首版做什么、怎样算完成 | 产品范围基线 |
| [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md) | 页面、路由、导航和用户路径如何组织 | 产品结构基线 |
| [MAP_INTERACTION_SPEC.md](./MAP_INTERACTION_SPEC.md) | 地图在桌面、手机、微信和 PWA 中如何表现 | 地图体验验收基线 |
| [ROADMAP.md](./ROADMAP.md) | 当前在哪一阶段、下一个发布门槛是什么 | 进度基线，需随验收更新 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 前后台、API、地图 provider、PWA 和安全怎样分层 | 技术决策基线 |
| [DATA_MODEL.md](./DATA_MODEL.md) | 数据实体、状态、关系和生命周期是什么 | 数据契约说明 |
| [RESEARCH_SOURCES.md](./RESEARCH_SOURCES.md) | 已查过哪些来源、确认了什么、还缺什么 | 资料核验台账 |
| [CONTENT_POLICY.md](./CONTENT_POLICY.md) | 什么资料可发布、何时过期、版权隐私如何处理 | 内容治理基线 |
| [FIELD_COORDINATE_VERIFICATION.md](./FIELD_COORDINATE_VERIFICATION.md) | 现场如何采点、什么观测可以批准 | 坐标审核规则 |
| [MAP_DATA_READINESS.md](./MAP_DATA_READINESS.md) | 76 个地点当前分别卡在哪里、先采哪些 | 地图数据执行台账 |
| [ADMIN_RUNBOOK.md](./ADMIN_RUNBOOK.md) | 单管理员每天如何维护、纠错、下架和轮换凭据 | 操作手册 |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | 宝塔 Linux 如何发布、备份、恢复和回滚 | 生产运维基线 |

## 3. 事实源优先级

- 产品范围冲突时以 PRD 的 MVP/非目标和最新明确决策为准，再同步到路线图和信息架构。
- 当前实现行为以代码、迁移和自动化检查为准；文档发现偏差时必须更新，不能把规划写成已实现。
- 内容事实以后台有效来源记录、当年正式通知和可审计核验为准；研究文档中的线索不能直接变成公开事实。
- 地点是否可导航以数据库中 `verified` 的 WGS84 主坐标为准；工作地图名称、地址文本和候选校界都不能替代坐标审核。
- 当前 PWA 只预缓存 `/offline.html` 及其必要 CSS、图标和字体，不预缓存 JavaScript。页面导航、公开内容 API 与地图资源在 V1 使用 `NetworkOnly`，不承诺离线正文。

## 4. 状态与维护规则

文档中的内容应区分三种状态：

- **已实现**：代码和验收环境已验证，可写入当前进度。
- **进行中**：已有结构或局部能力，但尚未通过发布门槛。
- **计划中**：未来版本方向，不得出现在前台作为可用功能。

发生以下变化时同步更新文档：

| 变化 | 至少更新 |
| --- | --- |
| MVP 范围或验收标准改变 | PRD、路线图、相关交互规范 |
| 页面/路由或后台模块改变 | 信息架构、README |
| PWA、缓存、地图 provider 或部署拓扑改变 | 架构、部署、相关验收规范 |
| 数据表、状态或发布门槛改变 | 数据模型、内容治理、运行手册 |
| 地点坐标或来源状态改变 | 地图就绪台账、资料核验清单 |
| 验收库统计改变 | 路线图“当前进度” |

更新当前统计时写明数据快照日期和所用环境，不把开发库、验收库与未来生产库混为一谈。文档不得记录 Cookie、明文密码、会话 token、私有 Key、学生个人信息或未经许可的原始平台资料。
