# docs 目录说明

本目录只放**活文档**：随代码持续维护的规格、手册与政策。一次性调研、审计、变更计划、部署纪要等过程材料不入库（产生于 `docs/verification/<主题>/`，验收后删除）；2026-10-05 清理的历史文档可从 git 历史找回，未跟踪散件归档在仓库外 `E:\tmp\yeu-docs-archive-20261005`。

## 当前文档

| 文档 | 内容 |
| --- | --- |
| [PRD.md](./PRD.md) | 产品需求：用户、问题、MVP 范围、验收标准与非目标 |
| [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md) | 信息架构：公开页面、导航、路由与后台模块 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 技术架构：运行拓扑、目录职责、领域边界、API 约定、安全与可靠性 |
| [DATA_MODEL.md](./DATA_MODEL.md) | 数据模型：表结构、领域关系与迁移约定 |
| [MAP_INTERACTION_SPEC.md](./MAP_INTERACTION_SPEC.md) | 地图交互规范：布局、标点、筛选、联动与失败降级 |
| [MAP_OFFLINE_PROVIDER_FUSION_DESIGN.md](./MAP_OFFLINE_PROVIDER_FUSION_DESIGN.md) | 地图离线/WebView Provider 融合设计 |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | 宝塔 Linux 部署与运维：环境、发布流程、回滚 |
| [DEPLOY_NOTES_2026-09-04-qa-cards.md](./DEPLOY_NOTES_2026-09-04-qa-cards.md) | 部署纪要（活文档，每次发布追加一节：release id、回滚点、DB 备份、变更内容、线上验证） |
| [ADMIN_RUNBOOK.md](./ADMIN_RUNBOOK.md) | 单管理员运行手册：后台日常操作与巡检 |
| [CONTENT_POLICY.md](./CONTENT_POLICY.md) | 内容来源与治理政策：来源记录、核验状态、非官方标识边界 |
| [GIT_RESOURCES_AND_CONFIGURATION.md](./GIT_RESOURCES_AND_CONFIGURATION.md) | Git 资源与配置：仓库边界、环境变量、数据库私有存放、发布配置 |
| [bot-integrations.md](./bot-integrations.md) | QQ / 微信机器人接入 |
| [rules/TASK_COMPLETION_REVIEW.md](./rules/TASK_COMPLETION_REVIEW.md) | 任务完成复盘与架构同步规则 |

## 进行中的规划

- [RESTRUCTURE_PLAN_2026-10-05.md](./RESTRUCTURE_PLAN_2026-10-05.md)：工程重构规划（对标 electro-exam 的文档体系 / CI / 部署），分 P0–P4 执行，全部完成后删除。

## 阅读顺序

首次了解项目：根 [README](../README.md) → PRD → INFORMATION_ARCHITECTURE → ARCHITECTURE → DATA_MODEL。改代码前：ARCHITECTURE 对应小节 + MAP_INTERACTION_SPEC（涉及地图时）+ CONTENT_POLICY（涉及内容时）。发布：DEPLOYMENT + DEPLOY_NOTES 纪要 + RESTRUCTURE_PLAN 中的部署检查单（P2 落地后收敛进 scripts/deploy.sh）。
