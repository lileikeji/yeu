# 技能（Skills）

本目录存放随仓库分发的 agent 技能，仓库为唯一来源（source of truth）。

## yeu-campus（仰恩大学校园知识库）

- 内容：用女娲（huashu-nuwa）从站内知识库（585 条入库知识）蒸馏出的仰恩校园知识技能。
- 三件套：`SKILL.md`（知识体系 + 使用纪律）、`FIDELITY.md`（来源与保真度）、`references/knowledge-points.md`（102 条知识点问答原文）。
- 安装到 DSH：`node scripts/install-ye-campus-skill.mjs`（默认装到 `~/.agents/skills/yeu-campus`，可传目标目录）。
- 更新流程：知识库种子（`data/assistant-knowledge.ts`）变化后重新蒸馏并覆盖本目录，再跑安装脚本。
