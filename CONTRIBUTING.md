# 参与贡献指南

「仰恩新生指南」是面向仰恩大学本科与专升本新生的非官方校园信息服务。欢迎纠错线索、内容补全与代码贡献。

## 开始之前

- 通读 [README](README.md)（产品原则与技术基线）与 [内容治理政策](docs/CONTENT_POLICY.md)。内容贡献的核心门槛：**所有重要信息记录来源、核验状态与最后核验时间；未核验地点不公开；官方来源优先，非官方内容明确标识。**
- AI 辅助协作遵守 [AGENTS.md](AGENTS.md)（先思考再编码、简单优先、精准修改、目标驱动验证）。

## 本地开发

见 README「本地启动」：`pnpm install` → `cp .env.example .env` → `pnpm db:migrate` → `pnpm db:init` → `pnpm dev`。

常用检查（提交前至少跑前两项）：

- `pnpm lint && pnpm typecheck`
- `pnpm test`：`scripts/*.test.ts` 全量单元测试
- `pnpm e2e`：34 条桌面/移动核心路径检查（生产构建，较慢）
- `pnpm data:verify:local`：前台公开内容 vs 后台可维护数据分叉检查

## 分支与提交

- 从 `master` 切出功能分支；一个 PR 一件事，改动收敛。
- 提交信息用 `type(scope): 中文描述`（现有历史风格：`fix(competition): …`、`docs: …`、`copy(competition): …`）。
- 只提交本次任务相关文件；不要把 `tmp-*`、`*.bak-*`、本地探针脚本或媒体文件带进提交（`.gitignore` 已拦截常见形态）。

## 硬性红线（改动即拒收）

1. **安全层层设防不削弱**：Origin guard、miniapp 限流、visitor ban、anti-crawl、admin 登录限流不为绕过 403/429 而改。漏洞报告走 [SECURITY.md](SECURITY.md)，不开公开 Issue。
2. **凭证与隐私不入库**：不提交密码、Cookie、令牌、私钥、学生个人信息；学校官方原始文件（docx/xls/pdf/rar）不入库，脱敏后的结构化种子放 `data/seeds/`。
3. **改检索/算分必须 bump `ASSISTANT_CACHE_VERSION`**（`server/modules/assistant/service.ts`）：答案缓存有表 + 进程内存两层，同版本号会继续发旧答案。
4. **测试不过不发布**：改任何 `scripts/*.test.ts` 覆盖的模块后，全量 `pnpm test` 必须清零。
5. **文档同步**：架构行为变化同步 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，API/环境变量变化同步 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)；一次性调研、审计与验证记录放 `docs/verification/<主题>/`，验收后删除，docs/ 只留活文档。

## Issue 与 PR

- Issue 模板见 `.gitee/IssueTemplate.md`；纠错类请附来源链接或截图。
- PR 描述写清：改了什么、为什么、怎么验证的（命令与结果）。涉及内容数据的 PR 附核验来源。

## 部署

生产部署由维护者通过私有流水线执行，贡献者不需要（也无法）触达生产环境；部署脚本中的 `DEPLOY_SERVER` / `SSH_KEY` 等环境变量由维护者本地提供，不在仓库内。发布流程与闸门见 README「发布」与 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 许可

提交即表示同意代码与内容按仓库 [LICENSE](LICENSE)（MIT）与内容治理政策发布。
