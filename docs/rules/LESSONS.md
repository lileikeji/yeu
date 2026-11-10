# 技术教训库

> 记录**可复用的技术判断**：踩过的坑、验证过的机制、反直觉的行为。
>
> 与 [`TASK_COMPLETION_REVIEW.md`](./TASK_COMPLETION_REVIEW.md) 的分工：
> - **本文件**：一条教训 = 一个可以迁移到其他场景的结论。按主题组织，长期累积。
> - **复盘文件**：按时间倒序记录每个任务的完整过程。是流水，不重复提炼。
>
> **怎么用**：遇到相似场景先查本文件；得出新教训时追加一条，并在上方目录登记。
>
> **写法**：现象 → 根因 → 做法。**根因写机制，不写"疏忽""没注意"**——那不是教训，是自责。

## 目录

1. [多套调色板必须校验色相差与明度差](#1-多套调色板必须校验色相差与明度差)
2. [Nuxt UI 的 UButton 不自带 justify-center](#2-nuxt-ui-的-ubutton-不自带-justify-center)
3. [Tailwind 4 的 @theme static 变量可被无层规则覆盖](#3-tailwind-4-的-theme-static-变量可被无层规则覆盖)
4. [换肤覆盖清单要按语义用途梳理，不按变量名](#4-换肤覆盖清单要按语义用途梳理不按变量名)
5. [PR 的 base 不能指向另一个 PR 的分支](#5-pr-的-base-不能指向另一个-pr-的分支)
6. [基于旧基线的 PR 要预判 CI 会红](#6-基于旧基线的-pr-要预判-ci-会红)
7. [Windows 上 symlink 测试必失败](#7-windows-上-symlink-测试必失败)
8. [系统代理会拦截 localhost 请求](#8-系统代理会拦截-localhost-请求)
9. [改颜色前先算对比度](#9-改颜色前先算对比度)

---

## 1. 多套调色板必须校验色相差与明度差

**现象**：设计了两套配色，看起来"都是深绿"，用户截图指出后才被发现。

**数据**：`#0f6b73`（H185°/L25%）vs `#176f46`（H152°/L26%）。色相差仅 33°，明度差 1%。

**根因**：生成配色时只对齐了「明度曲线一致」（让每套色阶的 50→950 亮度递减节奏相同），没有校验**相邻方案之间**的差异下限。曲线一致反而让两套色在缩略图上更接近。

**做法**：
- 相邻方案色相差 ≥40°，或明度差 ≥8%（两者取其一）
- 把这个断言写进测试，防止后续加色时重犯
- 小尺寸色点（16-20px）比大色块更难分辨，验证时要用实际显示尺寸

---

## 2. Nuxt UI 的 UButton 不自带 justify-center

**现象**：图标按钮用 `min-w-10` 撑成方块后，图标贴在左边，悬停底色看起来没对齐。

**根因**：`@nuxt/ui` 的 Button base 类是 `inline-flex items-center`，**只有 `items-center`，没有 `justify-center`**。宽度自适应内容时缺陷不可见；一旦固定宽度就暴露。

**做法**：
- 图标按钮（方形、纯图标）显式加 `justify-center`
- 不要假设 UI 库的按钮组件默认居中
- 验证方式：`getComputedStyle(btn).justifyContent` 应为 `center`，且图标中心偏移 `dx=0`

---

## 3. Tailwind 4 的 @theme static 变量可被无层规则覆盖

**机制**（已用 Tailwind 4.3.5 的 `compile()` 实测）：

```css
/* 输入 */
@theme static { --color-green-700: #104830; }
.x { @apply text-green-700; }

/* 输出 */
@layer theme { :root, :host { --color-green-700: #104830; } }
@layer utilities { .text-green-700 { color: var(--color-green-700); } }
```

**关键推论**：
- `@theme static` 的 `static` 关键字保证变量必输出，不会因未使用被裁剪
- 工具类引用变量而非内联值，所以改 `--color-*` 就能全局换色
- **无层规则的优先级高于任何 `@layer`**。所以在顶层写 `[data-palette="x"] { --color-green-500: ... }` 能覆盖 `@layer theme` 里的 `:root`

**验证方式**：`compile()` 探针比查文档可靠。改动后一定重新验证，不要假设机制不变。

---

## 4. 换肤覆盖清单要按语义用途梳理，不按变量名

**现象**：只覆盖了 `--color-green-*` 和 `--color-orange-*`，漏掉了 17 个文件里的 `blue-*`。其中部分是交互选中态（应该跟着换），部分是 info 语义（应该保留）。

**根因**：按"变量名 = 语义"做映射（green=品牌、blue=信息），但实际代码里 `blue-*` 同时承担了两种角色。

**做法**：
- 换肤前用 `rg -o "<色系>-[0-9]{2,3}" --no-filename | sort | uniq -c` 统计各色系用量
- 再**逐文件**看上下文，区分三类：
  - **品牌强调** → 跟随主题
  - **交互选中态**（`aria-pressed="true"`、`checked`）→ 跟随主题
  - **语义状态**（成功/警告/待确认）→ 独立变量，不跟随
- 判据：这个颜色表达的是"品牌身份"还是"状态含义"？

---

## 5. PR 的 base 不能指向另一个 PR 的分支

**现象**：为了让两个 PR 按顺序合入，把 PR-B 的 base 设成 PR-A 的分支。结果仓库开了 `delete_branch_on_merge`，PR-A 合入后分支被自动删除，PR-B 的 base 消失，改动永远进不了主线。

**根因**：把「合入顺序」和「base 分支」两个概念绑定。base 是内容对比的基准，不是排队机制。

**做法**：
- **所有 PR 的 base 都指向默认分支**，不要互相挂
- 需要顺序时，在描述里写「建议先合 #X」，不靠 base 强制
- 已知 `delete_branch_on_merge: true` 的仓库，绝不能设 PR 分支为 base

---

## 6. 基于旧基线的 PR 要预判 CI 会红

**现象**：基于落后主线的分支提 PR，CI 19 秒就挂。日志显示 `nuxt prepare` 被构建守卫拒绝（4 核 < 8 核要求），与本次改动无关。

**根因**：只想到"typecheck 会因缺依赖升级报错"，没意识到 `ci.yml` 本身也缺关键开关（`ALLOW_LOW_SPEC_BUILD=1`）。CI 配置和依赖版本都是基线的一部分。

**做法**：基于旧基线提 PR 前，diff 这三样并预判后果：
```bash
git diff <旧基线> <新基线> -- .github/workflows/ .workflow/
git diff <旧基线> <新基线> -- package.json pnpm-lock.yaml
git diff --stat <旧基线> <新基线> -- scripts/check-client-bundle-budget.ts osv-scanner.toml
```
把结论写进 PR 描述：「当前 CI 会红，原因是 X，前置 PR 合入后自动修复」。

---

## 7. Windows 上 symlink 测试必失败

**现象**：`scripts/deployment-recovery.test.ts` 有 7 个用例在本地失败。

**根因**：Windows 创建真 symlink 需要管理员权限或开发者模式。`MSYS=winsymlinks:nativestrict` 报 `Operation not permitted`；Git Bash 的 `ln -s` 默认退化成复制目录。

**做法**：
- 这 7 个失败是环境限制，**不是代码问题**，CI（ubuntu）上是绿的
- 判断改动是否破坏测试：看**除这 7 个之外**有没有新增失败
- 不要试图"修复"它们

---

## 8. 系统代理会拦截 localhost 请求

**现象**：本地服务 `curl http://localhost:3010/` 返回 502，但 `netstat` 显示端口在监听；Moli 无头浏览器渲染出 "HTTP ERROR 502"。

**根因**：本机设置了 `http_proxy=http://127.0.0.1:7890` 等环境变量，代理不转发 localhost 之外的本地端口。

**做法**：
- `curl --noproxy '*' http://localhost:PORT/`
- Moli：`moli serve --http-no-proxy '*'`
- **判断依据**：502 + 端口在监听 + 服务日志无错误 → 先怀疑代理，不要怀疑代码

---

## 9. 改颜色前先算对比度

**机制**：WCAG 相对亮度公式（sRGB 线性化后加权）：

```
c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4
L = 0.2126*R + 0.7152*G + 0.0722*B
对比度 = (L1+0.05)/(L2+0.05)
```

**阈值**：正文 ≥4.5:1，大字号/粗体 ≥3:1，小字元数据建议 ≥7:1。

**做法**：
- 生成配色后立即验算，不要等视觉验收
- 把对比度断言写进测试，改色时自动拦截
- 注意**暗色背景**要单独验：`#101310` 这类深色底的对比度与白底完全不同
