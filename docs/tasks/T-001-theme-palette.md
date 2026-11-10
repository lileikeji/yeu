# T-001 · 站点主题配色切换

| 项 | 值 |
| --- | --- |
| 状态 | 等待审核（PR #2 前置、PR #4 主体） |
| 开始 | 2026-11-09 |
| 更新 | 2026-11-10 |
| 范围 | `app/assets/css/`、`app/utils/theme-mode.ts`、`app/composables/useThemeMode.ts`、`app/components/ThemeModeToggle.vue`、地图页选中态 |
| 迁移 | 无（纯前端） |

## 目标

在既有「明 / 暗 / 跟随系统」之外，增加**正交的「主题配色」维度**：用户可选 5 套预设主色并持久化，刷新保持，首帧不闪。

**关键约束**：全站已有 1063 处硬编码 `green-*` 和 185 处 `orange-*` 工具类，不能逐个改。

## 方案

### 核心机制（已实测验证）

Tailwind 4 的 `@theme static` 变量输出到 `@layer theme` 的 `:root`，工具类编译为 `color: var(--color-green-700)`。因此在**无层（unlayered）**规则上重定义变量即可覆盖：

```css
[data-palette="indigo"] {
  --color-green-500: #5159bb;
  /* ... 共 22 条 */
}
```

无层声明在层叠中优先于任何 `@layer`，所以能覆盖 `@theme static`。

Nuxt UI 的 `--ui-color-primary-*` 由运行时插件 `@nuxt/ui/dist/runtime/plugins/colors.js` 生成为 `var(--color-green-<shade>, fallback)`，因此 `UButton color="primary"` 等组件会同步换色。

### 5 套配色

| id | 名称 | 主色 | 色相 |
| --- | --- | --- | --- |
| `green` | 绿（默认） | `#176f46` | 152° |
| `indigo` | 靛蓝 | `#5159bb` | 235° |
| `violet` | 紫罗兰 | `#7a49bd` | 265° |
| `rose` | 玫瑰 | `#b23450` | 347° |
| `teal` | 青蓝 | `#0a7aa3` | 196° |

`green` 不写覆盖块，直接沿用 `@theme static`，避免双份真值漂移。

### 状态存储

- `localStorage['yeu-theme']` — 明暗模式（既有，未改动）
- `localStorage['yeu-palette']` — 配色（新增）
- `THEME_BOOT_SCRIPT` 在 hydration 前同步应用，白名单由 `THEME_PALETTE_IDS` 模板生成，避免与 TS 常量双份真值

## 决策记录

### 2026-11-09 · 为什么只改变量、不改类名

**背景**：1063 处 `green-*`、185 处 `orange-*`，逐个替换不现实。

**决策**：在无层 `[data-palette]` 上覆盖 `--color-green-*` / `--color-orange-*` 变量。

**验证方式**：用 Tailwind 4.3.5 的 `compile()` 做探针，确认 `@theme static` 输出到 `@layer theme` 的 `:root`，且 `.text-green-700 { color: var(--color-green-700) }`。

**代价**：颜色语义被压缩成两族（green 承担品牌 + 成功，orange 承担次要品牌 + 警告），见遗留缺口。

### 2026-11-09 · 为什么 teal 初版选错

**现象**：用户截图指出「青绿和默认绿看不出区别」。

**数据**：初版 teal `#0f6b73` = H185°/L25%，默认绿 `#176f46` = H152°/L26%。色相差 33°，明度差 1%。

**修正**：改为 `#0a7aa3` = H196°/L34%，色相差 44°、明度差 8%。同时验证 WCAG：500 对白 4.85、700 对白 8.26。

**教训**：见 [LESSONS.md 第 1 条](../rules/LESSONS.md#1-多套调色板必须校验色相差与明度差)。

### 2026-11-10 · 为什么图标按钮看起来没居中

**现象**：用户反馈主题按钮的图标没对到中心。

**根因**：Nuxt UI 的 `UButton` base 类只有 `inline-flex items-center`，**没有 `justify-center`**。按钮宽度自适应内容时看不出来，但用 `min-w-10` 撑成方块后内容贴左，悬停底色就偏了。

**修正**：补 `justify-center`。

### 2026-11-10 · 哪些 blue-* 该跟随主题

17 个文件用了 `blue-*`。区分两类：

| 类别 | 处理 | 例子 |
| --- | --- | --- |
| 交互选中态 | **改为 `green-*`**，跟随主题 | 地图设置面板选中块、定位/跟随开启态、公交方向选中 |
| 语义状态色 | **保留蓝色** | 审核的「可能重复」状态、公交模块品牌标识、info 提示框 |

## 当前进度

| 产物 | 位置 | 状态 |
| --- | --- | --- |
| 5 套配色变量 | `app/assets/css/main.css` | 已实现 |
| 状态层 | `app/utils/theme-mode.ts` | 已实现 |
| 组合式 | `app/composables/useThemeMode.ts` | 已实现 |
| 开关 UI | `app/components/ThemeModeToggle.vue` | 已实现 |
| 测试 | `scripts/theme-palette.test.ts`（21 条） | 通过 |
| 复盘 | `docs/rules/TASK_COMPLETION_REVIEW.md` | 已追加 |

**验证结果**：人工验收通过；CDP 实测 5 套色板的 `--color-green-500`、`text-green-700` 计算值、`--ui-color-primary-500` 三级联动全部同步；明暗正交、刷新保持、非法值回落均正常。

## 下一步（恢复任务时看这里）

### 若状态仍是「等待审核」

1. 查 PR [#2](https://github.com/lileikeji/yeu/pull/2)（基线同步，21 文件）是否已合入
2. 查 PR [#4](https://github.com/lileikeji/yeu/pull/4)（本任务，9 文件）是否已合入
3. **PR #4 的 CI 会红，这是预期内的**——它基于旧主线，缺 `ci.yml` 里的 `ALLOW_LOW_SPEC_BUILD=1` 与依赖升级。#2 合入后自动转绿。

### 若要继续做 L2（语义色解耦）

1. 先读 [LESSONS.md](../rules/LESSONS.md) 与「遗留缺口」
2. 在 `main.css` 新增 `--color-success-*` / `--color-warning-*`，**不随 palette 变**
3. 逐文件判断 `green-*` 的语义：品牌强调 → 保留；状态指示 → 换 `success-*`
4. 重点区域：`app/components/admin/**`（32 处）、`app/pages/admin/**`（90 处）

## 遗留缺口

| 项 | 影响 | 归属 |
| --- | --- | --- |
| success/warning 未解耦 | 非绿配色下「成功」提示跟随主色 | L2 |
| `singer/**` 121 处 hex | 该三页不跟随配色 | 单独任务 |
| `knowledge/graph.vue` 96 处 hex | 图表配色独立体系 | 单独任务 |
| PWA `theme_color` | manifest 仍为绿色 | 低优先级 |
| Nuxt UI 运行时依赖 | 上游若改构建期内联会静默失效，无测试覆盖 | 需 e2e 断言 |
