# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确


## 追加 5：`20260904-darkfix`（commit `f1ca5d3`）— 地图卡片暗色/搜索交互/警示块可读

用户反馈三项问题后修复（线上逐项复验通过）：

1. **地图卡片暗色未更新**：PlaceDetailsPanel/PlaceRatingSection 此前按"白卡豁免"处理；本轮改为双主题化，并补全站漏网的响应式变体（md:/sm:/lg: 颜色类 7 处，含桌面卡 md:bg-white）。暗色下详情/评价卡为 zinc-900 深卡、控件跟随主题；线上实测点选地点后无白色块残留。
2. **搜索输入即自动定位**：根因 watch(filteredPois) 每输入一次就 autoSelect 并 fly。改为：输入只更新列表（native 高德结果渲染为可点条目），点击条目或深链 URL ?q= 才定位弹卡；移动端收起状态输入自动弹半屏列表（弹起决策化进 resolveSearchQueryChangeReset，保持页面 purity 测试）。线上实测输入"图书"停留在列表等待点选。
3. **“先看提醒”警示块深色下不可读**：text-orange-950 等在 dark:bg-orange-950 深底无浅字变体；全站补 text-{orange|amber|emerald|sky}-950 的 dark 浅字（含 /75 透明度与 checklist/panorama/dorms/login/公告 等十余处）。线上实测深橙底 + 浅字可读。

回归：qa:sweep 181 runs 0 失败；pnpm test 1134 → 回到基线 7 个既有环境失败；map-presentation 14/14。部署 release `20260904-darkfix`（回滚点 site-theme），health 200。
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确


## 追加 5：`20260904-darkfix`（commit `f1ca5d3`）— 地图卡片暗色/搜索交互/警示块可读

用户反馈三项问题后修复（线上逐项复验通过）：

1. **地图卡片暗色未更新**：PlaceDetailsPanel/PlaceRatingSection 此前按"白卡豁免"处理；本轮改为双主题化，并补全站漏网的响应式变体（md:/sm:/lg: 颜色类 7 处，含桌面卡 md:bg-white）。暗色下详情/评价卡为 zinc-900 深卡、控件跟随主题；线上实测点选地点后无白色块残留。
2. **搜索输入即自动定位**：根因 watch(filteredPois) 每输入一次就 autoSelect 并 fly。改为：输入只更新列表（native 高德结果渲染为可点条目），点击条目或深链 URL ?q= 才定位弹卡；移动端收起状态输入自动弹半屏列表（弹起决策化进 resolveSearchQueryChangeReset，保持页面 purity 测试）。线上实测输入"图书"停留在列表等待点选。
3. **“先看提醒”警示块深色下不可读**：text-orange-950 等在 dark:bg-orange-950 深底无浅字变体；全站补 text-{orange|amber|emerald|sky}-950 的 dark 浅字（含 /75 透明度与 checklist/panorama/dorms/login/公告 等十余处）。线上实测深橙底 + 浅字可读。

回归：qa:sweep 181 runs 0 失败；pnpm test 1134 → 回到基线 7 个既有环境失败；map-presentation 14/14。部署 release `20260904-darkfix`（回滚点 site-theme），health 200。


## 追加 6：`20260904-aiqa` / `20260904-aiqa2`（commit `6bfa3ed`）— AI 质量优化一轮

从生产 assistant_runs 日志挖高频未命中/低质量回答后修复：

1. **英文开学问法**（when does school start? / when do classes start in 2026 / school start date，日志高频且此前崩坏到无关英文新闻 0.58/0.35）：新增 `englishOpeningDateLocalAnswer` 早路（早于检索/无检索 gap 分支），按已核实校历回答 0.98 并带《2026级新生报到》引用；`isQuestionLike` 支持英文疑问词开头，无问号英文句不再被 422 引导站内搜索。
2. **综测怎么算 citation=0**：公式问答补官方《综合测评实施办法（修订）》引用兜底。
3. **电子信息工程教学楼在哪个区** 等未确认教学区问法：结论前置（“暂未确认上课教学楼/教学区，只核实到报到安排…”），避免报到地点被误读为上课地点。
4. **回答缓存 rag-v45→v46**：v45 旧缓存（含崩坏答案）整体失效；线上已清理 33 条 v45 行。
5. 地图详情卡关闭按钮暗色对比度提升（P2）。

回归：qa:sweep 103 题 / 185 runs 0 失败（新增英文×2/综测/教学区引导 4 用例）；pnpm test 1134 → 基线 7。部署 aiqa → aiqa2（含英文疑问词 API 放行），线上复验：when does school start? / when does school start（无问号）/ school start date 均 0.98+引用；综测怎么算带官方引用。回滚点 darkfix。
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确


## 追加 5：`20260904-darkfix`（commit `f1ca5d3`）— 地图卡片暗色/搜索交互/警示块可读

用户反馈三项问题后修复（线上逐项复验通过）：

1. **地图卡片暗色未更新**：PlaceDetailsPanel/PlaceRatingSection 此前按"白卡豁免"处理；本轮改为双主题化，并补全站漏网的响应式变体（md:/sm:/lg: 颜色类 7 处，含桌面卡 md:bg-white）。暗色下详情/评价卡为 zinc-900 深卡、控件跟随主题；线上实测点选地点后无白色块残留。
2. **搜索输入即自动定位**：根因 watch(filteredPois) 每输入一次就 autoSelect 并 fly。改为：输入只更新列表（native 高德结果渲染为可点条目），点击条目或深链 URL ?q= 才定位弹卡；移动端收起状态输入自动弹半屏列表（弹起决策化进 resolveSearchQueryChangeReset，保持页面 purity 测试）。线上实测输入"图书"停留在列表等待点选。
3. **“先看提醒”警示块深色下不可读**：text-orange-950 等在 dark:bg-orange-950 深底无浅字变体；全站补 text-{orange|amber|emerald|sky}-950 的 dark 浅字（含 /75 透明度与 checklist/panorama/dorms/login/公告 等十余处）。线上实测深橙底 + 浅字可读。

回归：qa:sweep 181 runs 0 失败；pnpm test 1134 → 回到基线 7 个既有环境失败；map-presentation 14/14。部署 release `20260904-darkfix`（回滚点 site-theme），health 200。
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确


## 追加 5：`20260904-darkfix`（commit `f1ca5d3`）— 地图卡片暗色/搜索交互/警示块可读

用户反馈三项问题后修复（线上逐项复验通过）：

1. **地图卡片暗色未更新**：PlaceDetailsPanel/PlaceRatingSection 此前按"白卡豁免"处理；本轮改为双主题化，并补全站漏网的响应式变体（md:/sm:/lg: 颜色类 7 处，含桌面卡 md:bg-white）。暗色下详情/评价卡为 zinc-900 深卡、控件跟随主题；线上实测点选地点后无白色块残留。
2. **搜索输入即自动定位**：根因 watch(filteredPois) 每输入一次就 autoSelect 并 fly。改为：输入只更新列表（native 高德结果渲染为可点条目），点击条目或深链 URL ?q= 才定位弹卡；移动端收起状态输入自动弹半屏列表（弹起决策化进 resolveSearchQueryChangeReset，保持页面 purity 测试）。线上实测输入"图书"停留在列表等待点选。
3. **“先看提醒”警示块深色下不可读**：text-orange-950 等在 dark:bg-orange-950 深底无浅字变体；全站补 text-{orange|amber|emerald|sky}-950 的 dark 浅字（含 /75 透明度与 checklist/panorama/dorms/login/公告 等十余处）。线上实测深橙底 + 浅字可读。

回归：qa:sweep 181 runs 0 失败；pnpm test 1134 → 回到基线 7 个既有环境失败；map-presentation 14/14。部署 release `20260904-darkfix`（回滚点 site-theme），health 200。


## 追加 6：`20260904-aiqa` / `20260904-aiqa2`（commit `6bfa3ed`）— AI 质量优化一轮

从生产 assistant_runs 日志挖高频未命中/低质量回答后修复：

1. **英文开学问法**（when does school start? / when do classes start in 2026 / school start date，日志高频且此前崩坏到无关英文新闻 0.58/0.35）：新增 `englishOpeningDateLocalAnswer` 早路（早于检索/无检索 gap 分支），按已核实校历回答 0.98 并带《2026级新生报到》引用；`isQuestionLike` 支持英文疑问词开头，无问号英文句不再被 422 引导站内搜索。
2. **综测怎么算 citation=0**：公式问答补官方《综合测评实施办法（修订）》引用兜底。
3. **电子信息工程教学楼在哪个区** 等未确认教学区问法：结论前置（“暂未确认上课教学楼/教学区，只核实到报到安排…”），避免报到地点被误读为上课地点。
4. **回答缓存 rag-v45→v46**：v45 旧缓存（含崩坏答案）整体失效；线上已清理 33 条 v45 行。
5. 地图详情卡关闭按钮暗色对比度提升（P2）。

回归：qa:sweep 103 题 / 185 runs 0 失败（新增英文×2/综测/教学区引导 4 用例）；pnpm test 1134 → 基线 7。部署 aiqa → aiqa2（含英文疑问词 API 放行），线上复验：when does school start? / when does school start（无问号）/ school start date 均 0.98+引用；综测怎么算带官方引用。回滚点 darkfix。


## 追加 7：`20260904-placeqa`（commit `77cfef4`）— 地图地点名词直达问答

生产日志发现用户连发"创业园/图书馆"等裸地点名词被 422 引导去站内搜索（对话外）。修复：

- shared `isPlaceNounQuery`：识别地点实体名词（楼/馆/园/操场/宿舍/食堂等后缀、2-8 字、剔除问号长句与长英文），assistant.post 与 stream.post 对该类放行
- service `mapPlaceNameLocalAnswer` 早路：裸名词精确命中地图已收录地点 → "X位于…/已收录在校园地图中"+ 地图入口引用直接作答（0.85），不再漂移到快递地址/宿舍等无关回答；占位草稿文案不读给用户
- sweep 增补 3 条（创业园/图书馆/新区操场，现 106 题 / 188 runs 全绿）；typecheck/单测无新增失败

线上复验：创业园/图书馆/新区操场均 0.85 定位+引用（health 200，回滚点 aiqa2）。
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确


## 追加 5：`20260904-darkfix`（commit `f1ca5d3`）— 地图卡片暗色/搜索交互/警示块可读

用户反馈三项问题后修复（线上逐项复验通过）：

1. **地图卡片暗色未更新**：PlaceDetailsPanel/PlaceRatingSection 此前按"白卡豁免"处理；本轮改为双主题化，并补全站漏网的响应式变体（md:/sm:/lg: 颜色类 7 处，含桌面卡 md:bg-white）。暗色下详情/评价卡为 zinc-900 深卡、控件跟随主题；线上实测点选地点后无白色块残留。
2. **搜索输入即自动定位**：根因 watch(filteredPois) 每输入一次就 autoSelect 并 fly。改为：输入只更新列表（native 高德结果渲染为可点条目），点击条目或深链 URL ?q= 才定位弹卡；移动端收起状态输入自动弹半屏列表（弹起决策化进 resolveSearchQueryChangeReset，保持页面 purity 测试）。线上实测输入"图书"停留在列表等待点选。
3. **“先看提醒”警示块深色下不可读**：text-orange-950 等在 dark:bg-orange-950 深底无浅字变体；全站补 text-{orange|amber|emerald|sky}-950 的 dark 浅字（含 /75 透明度与 checklist/panorama/dorms/login/公告 等十余处）。线上实测深橙底 + 浅字可读。

回归：qa:sweep 181 runs 0 失败；pnpm test 1134 → 回到基线 7 个既有环境失败；map-presentation 14/14。部署 release `20260904-darkfix`（回滚点 site-theme），health 200。
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确


## 追加 5：`20260904-darkfix`（commit `f1ca5d3`）— 地图卡片暗色/搜索交互/警示块可读

用户反馈三项问题后修复（线上逐项复验通过）：

1. **地图卡片暗色未更新**：PlaceDetailsPanel/PlaceRatingSection 此前按"白卡豁免"处理；本轮改为双主题化，并补全站漏网的响应式变体（md:/sm:/lg: 颜色类 7 处，含桌面卡 md:bg-white）。暗色下详情/评价卡为 zinc-900 深卡、控件跟随主题；线上实测点选地点后无白色块残留。
2. **搜索输入即自动定位**：根因 watch(filteredPois) 每输入一次就 autoSelect 并 fly。改为：输入只更新列表（native 高德结果渲染为可点条目），点击条目或深链 URL ?q= 才定位弹卡；移动端收起状态输入自动弹半屏列表（弹起决策化进 resolveSearchQueryChangeReset，保持页面 purity 测试）。线上实测输入"图书"停留在列表等待点选。
3. **“先看提醒”警示块深色下不可读**：text-orange-950 等在 dark:bg-orange-950 深底无浅字变体；全站补 text-{orange|amber|emerald|sky}-950 的 dark 浅字（含 /75 透明度与 checklist/panorama/dorms/login/公告 等十余处）。线上实测深橙底 + 浅字可读。

回归：qa:sweep 181 runs 0 失败；pnpm test 1134 → 回到基线 7 个既有环境失败；map-presentation 14/14。部署 release `20260904-darkfix`（回滚点 site-theme），health 200。


## 追加 6：`20260904-aiqa` / `20260904-aiqa2`（commit `6bfa3ed`）— AI 质量优化一轮

从生产 assistant_runs 日志挖高频未命中/低质量回答后修复：

1. **英文开学问法**（when does school start? / when do classes start in 2026 / school start date，日志高频且此前崩坏到无关英文新闻 0.58/0.35）：新增 `englishOpeningDateLocalAnswer` 早路（早于检索/无检索 gap 分支），按已核实校历回答 0.98 并带《2026级新生报到》引用；`isQuestionLike` 支持英文疑问词开头，无问号英文句不再被 422 引导站内搜索。
2. **综测怎么算 citation=0**：公式问答补官方《综合测评实施办法（修订）》引用兜底。
3. **电子信息工程教学楼在哪个区** 等未确认教学区问法：结论前置（“暂未确认上课教学楼/教学区，只核实到报到安排…”），避免报到地点被误读为上课地点。
4. **回答缓存 rag-v45→v46**：v45 旧缓存（含崩坏答案）整体失效；线上已清理 33 条 v45 行。
5. 地图详情卡关闭按钮暗色对比度提升（P2）。

回归：qa:sweep 103 题 / 185 runs 0 失败（新增英文×2/综测/教学区引导 4 用例）；pnpm test 1134 → 基线 7。部署 aiqa → aiqa2（含英文疑问词 API 放行），线上复验：when does school start? / when does school start（无问号）/ school start date 均 0.98+引用；综测怎么算带官方引用。回滚点 darkfix。
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确


## 追加 5：`20260904-darkfix`（commit `f1ca5d3`）— 地图卡片暗色/搜索交互/警示块可读

用户反馈三项问题后修复（线上逐项复验通过）：

1. **地图卡片暗色未更新**：PlaceDetailsPanel/PlaceRatingSection 此前按"白卡豁免"处理；本轮改为双主题化，并补全站漏网的响应式变体（md:/sm:/lg: 颜色类 7 处，含桌面卡 md:bg-white）。暗色下详情/评价卡为 zinc-900 深卡、控件跟随主题；线上实测点选地点后无白色块残留。
2. **搜索输入即自动定位**：根因 watch(filteredPois) 每输入一次就 autoSelect 并 fly。改为：输入只更新列表（native 高德结果渲染为可点条目），点击条目或深链 URL ?q= 才定位弹卡；移动端收起状态输入自动弹半屏列表（弹起决策化进 resolveSearchQueryChangeReset，保持页面 purity 测试）。线上实测输入"图书"停留在列表等待点选。
3. **“先看提醒”警示块深色下不可读**：text-orange-950 等在 dark:bg-orange-950 深底无浅字变体；全站补 text-{orange|amber|emerald|sky}-950 的 dark 浅字（含 /75 透明度与 checklist/panorama/dorms/login/公告 等十余处）。线上实测深橙底 + 浅字可读。

回归：qa:sweep 181 runs 0 失败；pnpm test 1134 → 回到基线 7 个既有环境失败；map-presentation 14/14。部署 release `20260904-darkfix`（回滚点 site-theme），health 200。
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确
# 部署纪要 2026-09-04 — release `20260904-qa-cards`

接续 2026-09-03 两个未完成会话（77a2e5a3 部署中断 / c0951056 服务器清理截断）的收尾。

## 本次上线内容（commit `d16e437` = `1d4b7c8` + `15ba444`）

| 类别 | 改动 |
|---|---|
| fd2d7b9 部署 | mealQuery 回归修复终于进入 current（此前线上是带回归的 05254a3） |
| 答非所问治理 | 检索排序按"核心话题覆盖度"打分（`assistantQueryCoreTerms`）：报到/军训抢答、车停哪里→体检条目两类抢答修复 |
| 别名 | TERM_EXPANSIONS 新增 `车停→停车/家长车辆/报到车辆进校/车辆预约/车牌报备/停车位` |
| 美食意图 | 追问句式（那X呢/吃面呢/这火锅呢）、预算/人均/以内句式、喝的/饮料、大餐/搓一顿、食堂、包子铺 问法进入美食路径 |
| 单店路径 | 剥离追问前缀/语气词；品类词（火锅/奶茶等）不再被误当店名；DRINK_ONLY 扩充甜品冰品（喜又/壶见/绵绵冰等） |
| 品类降级 | 无该品类时点名提示（"校园周边暂时没有收录寿司类的商家"） |
| 移动端卡片 | search.vue 美食榜单渲染为商家卡（区域标签+评分+人均+口碑+地图定位）、单店详情渲染为评价卡；peer 的 `1d4b7c8` 同期打磨了地图商家卡片 |

## 验证

- 本地 `pnpm qa:sweep`（scripts/assistant-qa-sweep.ts，95 题 / 177 次，含随机化重跑）：**0 失败**（修复前 29 失败）
- assistant-feature-search 38/38、assistant-knowledge 8/8、eval-retrieval 指标与基线持平（R@5 0.909 / R@10 0.955 / MRR 0.835）
- assistant-contact 36/38：2 个失败为环境相关历史问题（基线 fd2d7b9 同样失败），非本次引入
- 线上实测：报到/车停/那蜜雪冰城呢/预算15/寿司推荐/管理员密码 全部命中预期；food LLM 流式 `content_delta` 正常（sub2api 网关已恢复）

## 部署流程坑（重要）

1. 服务器侧构建路线已不可行：`/tmp/yeu-src2` 被清 + 3.6G 内存 OOM（earlyoom）。**Windows 本地 `pnpm build` → tar.gz → `deploy-home-sheet.sh` 是唯一稳定路线**。
2. **tar 必须加 `-h`（解引用符号链接）**：nitro 在 Windows 产物里给部分嵌套依赖（如 `unhead/node_modules/hookable`）留的是指向 `.nitro/` 的 symlink，默认打包后 Linux 侧解出来是死链，SSR 冒烟 500（ERR_MODULE_NOT_FOUND）。症状是 health 200 但首页 500。
3. `deploy-home-sheet.sh <release_id> <archive>` 自带 Linux better-sqlite3/sqlite-vec 替换、DB 备份、3101 端口冒烟、原子切换与回滚（rollback=上一个 release）。

## 服务器状态

- 磁盘 63%（本次清理：删除 4 个 20260902-* 旧 release 共 ~160M、/tmp 下本机扫描残留 ~320M）
- 内存：可用 ~1.7G，swap 占用 3G 未清（swapoff 回迁会触发 OOM 风险，mitmdump(714M, 抓包用) 未动）
- 本地保留 `.data/sweep/yeu-sweep.sqlite`（生产快照，233MB，跑 `pnpm qa:sweep` 用；重建方式见 scripts/assistant-qa-sweep.ts 头注释）

## 追加：深入验证与 hotfix `20260904-qa-cards2`（commit `fb6ef27`）

上线后继续验证发现并修复了一个**本次 isQuestion 扩充引入的回归**：

- **"食堂几点开门"被 food LLM 劫持**——gateway 恢复后，营业时间问法落进美食路径，LLM 生成成街头小吃推荐（本地 sweep 因降级走知识条目而未暴露）。修复：food 路径对 `食堂/餐厅 + 几点/开门/关门/营业时间/开放时间` 直接返回 null，交给 食堂开放时间 条目；sweep 补 2 条营业时间用例（现 96 题/178 次全绿）。已重建部署为 `20260904-qa-cards2` 并线上复验：食堂几点开门/几点关门/营业时间 三种问法全部正确命中知识条目。

其余线上验证结论（24 题批量 + 浏览器实测）：

- 网关恢复后 部分美食题走 `mode=ai` LLM 生成（自然口语 + 正确引用 + content_delta 流式），与本地模板并存是预期行为；本地 sweep 断言只覆盖模板路径。
- "理发店推荐"诚实兜底——知识库确无理发类数据（数据缺口，非 bug，不可编造条目）。
- "去食堂吃"等无问句标记的词组由 API 422 引导走站内搜索，前端无感，属产品预期。
- **移动端卡片视觉已在生产实测**（375×812 视口截图）：美食榜单商家卡（区域 pill + 评分徽章 + 人均 + 口碑两行 + 地图定位按钮）与单店评价卡（高德评分头 + 标签评价卡）渲染正常。

## 追加 2：hotfix `20260904-qa-cards3`（commit `960cde1`）— 周边 POI 检索修复

线上验证 24 题时发现地图周边 POI（八洛克台球，全库唯一 scope=nearby 地点）的多类问法无法命中：

| 问法 | 修复前 | 修复后 |
|---|---|---|
| 8洛克台球在哪 | 内置资料没有找到（数字 8 ≠ 八，精确地点路由失配） | 0.92 直接作答（数字↔中文归一化，`compactPlaceText`/subject 归一化） |
| 附近台球 / 台球厅 / 附近有台球厅吗 | 0.35~0.58 弱兜底（场所名被句式噪声淹没，subjectCovered 清零） | 0.92 直接作答（新增 subject→nearby-venue 召回源 + `nearbyVenueLocalAnswer` 早路） |
| 新区有可以打台球的吗 | 答成舒适型宿舍（检索噪声），台球厅字眼丢失 | 0.92 直接作答 |

实现要点（server/modules/assistant/service.ts）：
- `chineseDigitNormalized`：地点名匹配数字↔中文归一化；`compactPlaceText` 接入。
- `querySubjectMapVenueEvidence`：retrieveCampusEvidence 内按"查询点名 nearby 地点"精确召回（RRF 第一源，杜绝正文/区域词噪声淹没）；含美食/推荐等问句守卫，不污染正文推荐通道。
- `subjectCovered` 兜底：地图地点标题含查询主题碎片时不再清零（+40 分）；`profileMeaningfulCompact` 剥离句式外壳。
- `nearbyVenueLocalAnswer` 早路：台球/网吧/台球厅类"附近场所"问句本地直答（0.92），位于 earlyShopDetail 之后、检索之前。
- qa:sweep 增补 4 条台球问法回归（现 99 题 / 181 runs 全绿，修复前这些问法全部失败）。

部署：本地 `pnpm build` → `tar -czhf`（-h 解引用 symlink）→ `deploy-home-sheet.sh 20260904-qa-cards3`，冒烟通过；当前 release 为 qa-cards3（同时包含 485ec41 地图暗色卡片适配，qa-cards2 未带该提交）。线上复验：新区有可以打台球的吗 / 8洛克台球在哪 / 附近有台球厅吗 均 0.92 命中八洛克台球；食堂几点开门走知识条目；附近有什么好吃的走 food LLM（mode=ai）；宿舍床尺寸 0.88 正常。

## 未完成（下个会话候选）

- **系统级亮/暗/跟随主题切换**：全站为硬编码浅色主题（26+ 组件 bg-white/text-zinc 等约 2700 处 + main.css CSS 变量），无 colorMode/暗色变量架构；直接加切换会产出大量局部违和（白卡、不可读文本），需要整站暗色 token 化设计与逐屏验收，本会话未实施。


## 追加 3：`20260904-map-ime`（commit `bf90fdd`）— 地图搜索中文输入法修复

- 地图搜索框在拼音组词阶段（composition）不再触发筛选/高德 POI 搜索/地图跳转；组词结束才提交搜索（UInput compositionstart/end 守卫，model 提交式更新）
- 原生 POI 搜索最小 2 字符：单字母/单字不再请求高德并自动定位（本地地点列表过滤不受限）
- 线上复验：搜索框可正常输入中文；health 200

## 追加 4：`20260904-site-theme`（commit `83c77d9`）— 全站亮/暗/跟随系统主题

用户确认做全站双主题（此前评估未实施项）。本轮交付：

- **架构**：`app/utils/theme-mode.ts`（类型/存储/解析/启动脚本）+ `app/composables/useThemeMode.ts`；启动脚本注入 `<head>`（防暗色用户首帧闪白）；`html.dark` 类驱动——Tailwind `@custom-variant dark` + main.css 暗色 CSS 变量 + Nuxt UI v3 自带 `.dark` token
- **切换 UI**：`ThemeModeToggle`（跟随系统/浅色/深色 三态 UDropdownMenu），接入 default/admin 布局头部；logo 随主题换用深色变体
- **双主题化**：约 3456 处浅色类追加 `dark:` 变体（zinc/white 表面、正文/次要文字、品牌色块 chip、边框/分割线/ring/outline、hover/focus 变体、半透明与任意渐变背景）；地图卡片组件（PlaceRatingSection/PlaceDetailsPanel）按既有设计保持"任何主题下白卡"豁免
- **验收**：本地 12 页×2 视口×2 主题截图（48 张）+ 像素白块检测 + 视觉助手逐页复核；修复首页"重要时间"公告条、campus/nearby 白渐变卡片、畸形 dark:hover 链（217 处）等；浅色零回归
- **回归**：qa:sweep 99题/181runs 0 失败；pnpm test 1134 回落到基线 7 个既有环境失败（主题改动引入的 8 个类名断言失败已同步放宽，断言语义不变）
- 部署：`deploy-home-sheet.sh 20260904-site-theme`，线上验证 health 200、SSR 含主题启动脚本、localStorage dark/light 切换后 html 类与页面底色正确


## 追加 5：`20260904-darkfix`（commit `f1ca5d3`）— 地图卡片暗色/搜索交互/警示块可读

用户反馈三项问题后修复（线上逐项复验通过）：

1. **地图卡片暗色未更新**：PlaceDetailsPanel/PlaceRatingSection 此前按"白卡豁免"处理；本轮改为双主题化，并补全站漏网的响应式变体（md:/sm:/lg: 颜色类 7 处，含桌面卡 md:bg-white）。暗色下详情/评价卡为 zinc-900 深卡、控件跟随主题；线上实测点选地点后无白色块残留。
2. **搜索输入即自动定位**：根因 watch(filteredPois) 每输入一次就 autoSelect 并 fly。改为：输入只更新列表（native 高德结果渲染为可点条目），点击条目或深链 URL ?q= 才定位弹卡；移动端收起状态输入自动弹半屏列表（弹起决策化进 resolveSearchQueryChangeReset，保持页面 purity 测试）。线上实测输入"图书"停留在列表等待点选。
3. **“先看提醒”警示块深色下不可读**：text-orange-950 等在 dark:bg-orange-950 深底无浅字变体；全站补 text-{orange|amber|emerald|sky}-950 的 dark 浅字（含 /75 透明度与 checklist/panorama/dorms/login/公告 等十余处）。线上实测深橙底 + 浅字可读。

回归：qa:sweep 181 runs 0 失败；pnpm test 1134 → 回到基线 7 个既有环境失败；map-presentation 14/14。部署 release `20260904-darkfix`（回滚点 site-theme），health 200。


## 追加 6：`20260904-aiqa` / `20260904-aiqa2`（commit `6bfa3ed`）— AI 质量优化一轮

从生产 assistant_runs 日志挖高频未命中/低质量回答后修复：

1. **英文开学问法**（when does school start? / when do classes start in 2026 / school start date，日志高频且此前崩坏到无关英文新闻 0.58/0.35）：新增 `englishOpeningDateLocalAnswer` 早路（早于检索/无检索 gap 分支），按已核实校历回答 0.98 并带《2026级新生报到》引用；`isQuestionLike` 支持英文疑问词开头，无问号英文句不再被 422 引导站内搜索。
2. **综测怎么算 citation=0**：公式问答补官方《综合测评实施办法（修订）》引用兜底。
3. **电子信息工程教学楼在哪个区** 等未确认教学区问法：结论前置（“暂未确认上课教学楼/教学区，只核实到报到安排…”），避免报到地点被误读为上课地点。
4. **回答缓存 rag-v45→v46**：v45 旧缓存（含崩坏答案）整体失效；线上已清理 33 条 v45 行。
5. 地图详情卡关闭按钮暗色对比度提升（P2）。

回归：qa:sweep 103 题 / 185 runs 0 失败（新增英文×2/综测/教学区引导 4 用例）；pnpm test 1134 → 基线 7。部署 aiqa → aiqa2（含英文疑问词 API 放行），线上复验：when does school start? / when does school start（无问号）/ school start date 均 0.98+引用；综测怎么算带官方引用。回滚点 darkfix。


## 追加 7：`20260904-placeqa`（commit `77cfef4`）— 地图地点名词直达问答

生产日志发现用户连发"创业园/图书馆"等裸地点名词被 422 引导去站内搜索（对话外）。修复：

- shared `isPlaceNounQuery`：识别地点实体名词（楼/馆/园/操场/宿舍/食堂等后缀、2-8 字、剔除问号长句与长英文），assistant.post 与 stream.post 对该类放行
- service `mapPlaceNameLocalAnswer` 早路：裸名词精确命中地图已收录地点 → "X位于…/已收录在校园地图中"+ 地图入口引用直接作答（0.85），不再漂移到快递地址/宿舍等无关回答；占位草稿文案不读给用户
- sweep 增补 3 条（创业园/图书馆/新区操场，现 106 题 / 188 runs 全绿）；typecheck/单测无新增失败

线上复验：创业园/图书馆/新区操场均 0.85 定位+引用（health 200，回滚点 aiqa2）。


## 追加 8：`20260904-weather` / `weather2` / `weather3`（commit `debfe48` + `96da1d3`）— 天气/时间引导 + 身份问法引导

从生产日志继续挖高频问法，发现并修复两类答非所问：

1. **天气问法被美食榜单劫持**（"泉州最近一周天气怎么样"答成烧烤店推荐）：food 通道顶部拦截天气词；新增 `weatherAndClockLocalAnswer` 早路——诚实说明本站不接实时天气，给泉州气候常识 + 查天气指引（0.6）；排除"空调温度/预报名"等误伤。时间问法（现在几点）同样给引导（0.55）。
2. **无档案身份问法**（"宋富国是谁"多次 0.35"没有找到"甚至 AI 合成 conf=0"资料不足"）：新增 `identityUnlistedLocalAnswer`——带 evidence 判定，仅当站内确实无该人物档案时给引导（提供全名/单位，说明本站以校园信息为主）；有档案人物（吴庆星/林惠 0.96）绝不被抢答；覆盖全部 gap/web 合成/网关故障路径。
3. sweep 增补 5 条（天气×2/时间/无档案人物/空调温度不误伤，现 110 题 / 192 runs 全绿）；assistant 系列 51/51 + contact 36（基线 2 项既有）；全量测试回到基线 7。

部署链 weather→weather2→weather3（weather3 修正身份引导带证据判定），线上复验：宋富国是谁 0.6 引导、吴庆星是谁 0.96 档案、泉州明天会下雨吗 0.6 天气引导、现在几点 0.55 引导。回滚点 placeqa→weather→weather2。
## 追加 9：`20260905-venue-presence` — 商家卡片泛问覆盖（好七好七/爱眼眼镜推广后规则补齐）

背景：为八洛克台球同款商家卡片新增两家并启用推广（好七好七小吃店 B0M1JKQNKG 快餐/新区学生街后城47-6号；爱眼眼镜 B02530RLAK 眼镜/新区5街5号，places+place_amap_ratings+place_merchants enabled 20/20，坐标 WGS84 由高德 GCJ02 换算并与既有点互验）。店名问法（好七好七在哪/爱眼眼镜怎么样 0.92）直接可用，但泛问覆盖有洞：`哪里可以配眼镜` 0.1 答"未找到"、`想配一副眼镜去哪` 被 422、`附近有快餐店吗` 0.4 "无法确认"。

1. `shared/utils/assistant-query.ts`：QUESTION_MARKERS 增 `去哪/去哪儿`（无问号的目的地问法不再 422 引导站内搜索）。
2. `nearbyVenueLocalAnswer` 主题提取（venueSubjectCompact）：服务动词（配/买/修/换/做/取）、"想/要"与量词外壳（一副/一个/两家）一并剥除——"哪里可以配眼镜/想配一副眼镜去哪"核心归一为"眼镜"命中爱眼眼镜；`VENUE_SCOPE_WORD_RE` 增 去哪。
3. 在场问句（有没有/哪里有…吗/去哪）中餐饮类目词（快餐/小吃/简餐）允许用门店**简介**补命中（店招名"好七好七"不带类目，类目只在简介"快餐小吃店"里）；开放式推荐（有什么吃的/推荐）与奶茶/食堂等仍走原美食通道，防止劫持。缓存版本 rag-v46→`rag-v47-venue-presence`。

部署：`pnpm build` → tar -czhf → `deploy-home-sheet.sh 20260905-venue-presence`（DB 备份 + 3101 冒烟 + 原子切换），线上清 rag-v4x 缓存 15 条。线上复验 16 问：想配一副眼镜去哪/哪里可以配眼镜/配眼镜去哪 0.92 爱眼眼镜；附近有快餐店吗/有没有快餐店/学生街有小吃店吗 0.92 好七好七；8洛克台球在哪/附近有台球厅吗/想打个台球 0.92 八洛克（无回归）；附近有什么好吃的仍走 food AI、附近有奶茶店吗行为不变。回滚点 weather3。
## 追加 10：`20260905-foodpool-promo` 系列（promo→promo2→promo3→promo4→promo5→promo6）— 无评分推广店进美食推荐池

背景：好七好七（快餐小吃卡）只有 places 行+推广，没有高德评分 → 评分驱动的美食池(place_amap_ratings score>0)永远不带它；且**池子评分行 7 天 TTL 大面积过期**（8/28 批量种子 ~9/5 到期，valid 仅剩 3 条）→ 开放推荐整体哑火。

1. **评分池刷新（数据层）**：本地按 place_amap_ratings 全量 amap_poi_id 逐个 /v3/place/detail 重拉（200ms 限速，132 行 ≈1min），INSERT OR REPLACE 刷新 score/cost/fetched/expires(+7d)；detail 取不到的行仅顺延 expires。顺手清了历史占位行 amap-import-row-02x（用真实 POI id 重建）。备份 yeu.sqlite.bak-20260905-ratings-refresh。⚠️ **周更操作**：评分池过期前必须重跑一次，否则美食榜单/开放推荐全部静默失效（本地脚本套路见记忆）。
2. **无评分推广店入池**（v48 起，service.ts assistantFoodRecommendationAnswer）：scope=nearby + type dining/food + place_merchants.enabled 的已发布卡片并入候选池（去重 by name）；排序 bias 对 score null 用 4.0 底分（蒙特卡洛：3.7→进 top8-12 仅 13%，4.0→79%）；行/引用渲染 null 安全（"暂无评分"）。
3. **AI 通道候选语义**（v49/v50）：FoodAiCandidate.score 允许 null——候选 JSON score:null、提示词说明"新收录门店可推荐但别编评分"；无评分卡从简介提炼一句口碑（promoCardTips，"…是学校周边的快餐小吃店…"）进候选 tips 与本地列表，避免 score=0 让 LLM 永不选。
4. 缓存 rag-v47→v50；线上实测"附近有什么好吃的"15 连问 8/15 提到好七好七（"赶时间随便吃一口，好七好七也能当个简餐备选"），芭比Q/古茗/食堂开放时间等既有问答零回归。

部署链 foodpool-promo→…→promo6（promo4 曾因本地 build 崩溃误传旧产物，复验 current 未切换后以 promo5 重建、promo6 修正候选语义）。回滚点 venue-presence。
## 追加 11：`20260905-courier-cards` 数据 + `courier-fix` / `courier-list`（rag-v51/v52）— 新旧区驿站卡片与取件问答

**数据（无代码改动，直接入库，备份 yeu.sqlite.bak-20260905-courier-cards）**：新旧区学生街周边 7 家驿站按八洛克卡流程建卡（scope=nearby/type=express-service/category=express/WGS84 坐标+评分行）：新区 菜鸟驿站(仰恩大学店)3.8、兔喜生活(仰恩大学店)4.0、中通快递(仰恩大学店)3.5、圆通快递 2.7、顺丰速运(仰恩大学店)4.1；旧区 邮政快递站 2.6、韵达快递超市 3.1。与既有校内 3 卡（快递联盟（中通）/韵达快递/旧区车来车往（京东））及宝洁洗衣店（圆通、顺丰）并存。注：老手册提到的二街妈妈驿站/三街极兔高德已无 POI（变更以现场/短信为准）。

**courier-fix（v51，venue 匹配修复）**：① nearbyVenue 行匹配改"整名/包含级精确优先、片段模糊兜底"——原片段兜底按行序先扫到含"快递"的中通，导致"邮政快递站在哪"答成中通；② courierStation 驿站名单补"速运"字样（顺丰速运行此前被滤掉）；③ 品牌排序"专名自营站优先于代收代理点"（顺丰速运(仰恩大学店) 在 宝洁洗衣店 前）。

**courier-list（v52）**：① 不带品牌的泛取件问法（"取快递去哪/取件去哪里/拿快递去哪"）→ 列出全部已收录驿站/代收点（0.85，11 家）；② 调度顺序把 courierStation 提到 nearbyVenue 之前（否则泛取件被 venue 两字片段随机命中单店）；"快递在哪取/寄快递去哪"仍走官方指引/手册答案（无劫持）。缓存 v51→v52。回滚点 foodpool-promo6。

线上复验 15 问：泛取件 3 问列全量、邮政/顺丰/中通/圆通/菜鸟各品牌 0.9 专站优先、好七好七/爱眼/8洛克/快餐 0.92 零回归。
## 追加 12：驿站布局校正（数据层，备份 yeu.sqlite.bak-20260905-yunda-move）

用户现场反馈后校正：① 旧区实际 5 家（邮政快递站/韵达快递超市/宝洁洗衣店(圆通、顺丰)/快递联盟(中通)/旧区车来车往(京东)）——现有卡已齐，无需新增；② 原校区中部老卡"韵达快递"（坐标 118.61087,25.11178 马甲镇道）实为**新区二街韵达、坐标标偏**：已迁移至新区学生街（WGS84 118.597441,25.109276，近洋坑村委会），scope campus→nearby，坐标标 coordinate_verification='unverified'（现场待核，不编门牌）。此后旧区仅一家韵达（韵达快递超市），新区一家（韵达快递）。线上复验：韵达三问法 0.9 双店并列、泛取件列全量 11 家、其余驿站问法零回归。遗留：手册提及的二街妈妈驿站/三街极兔高德无 POI 未建卡；"新区快递站"泛问仍会落到邮政（词面精确匹配，待后续规则细化）。
## 追加 13：`20260905-home-merchants`（release）— 首页"校园周边商家"卡片区块

设计：首页 full 模式"常用查询"与"按入学阶段"之间新增区块，展示**后台开启推广（place_merchants.enabled=true）的已发布商家**——目前正好是 好七好七(快餐)/爱眼眼镜(眼镜)/八洛克台球(台球) 三家；无推广商家时整块自动隐藏（数据驱动，不加开关）。
- 新公共接口 `GET /api/public/promoted-merchants`（server/api/public/promoted-merchants.get.ts + shared/types ApiPublicPromotedMerchant）：places ⋈ place_merchants(enabled) LEFT JOIN place_amap_ratings(未过期)，返回 slug/name/type/score/cost/area/tagline（tagline 从简介提炼并去掉"高德评分"尾句去重）；按 promo_weight 降序。
- composable `usePublicPromotedMerchants`；卡片：图标(按 type dining/utensils、shop/store、sports-ground/dumbbell)+店名+区域 pill(新区/旧区)+评分徽章 ★x.x 或"新店收录"+简介两行+「查看地图定位」→ /map?place=slug；桌面 3 列、移动 1 列，暗色适配。
- 卡片链接复用地图定位页（与商家详情卡同源），可继续跳转查看评分/评价。
- 部署事故记录：本 release 第二次部署时先 rm 旧 release 再跑 deploy 导致脚本前置校验 current/.output 失败退出、current 悬空；恢复=先把 current 软链指回完好 release（courier-list）再正常 deploy。经验：**不要预删 releases/<id> 再用同名重部署——直接复用脚本的覆盖逻辑（脚本会因目录已存在而失败，应先换 release id）**。
- DOM 断言验证（桌面 1280/移动 390）：区块存在、3 卡 3 列/1 列、无横向溢出、徽章×3、标题无截断、暗色背景正常；SSR 含区块。截图像素级复核待视觉服务可用后补（_home_desktop.png/_home_mobile.png）。回滚点 courier-list。
## 追加 14：`20260905-merchant-badge`（release）— 首页"入驻商家"标识 + 好七好七美团链接

① 首页商家区块标题行新增绿色圆角徽章"入驻商家"（badge-check 图标，亮/暗色适配），副文案改为"入驻学生街的商家均已收录在校园地图…"。② 数据：好七好七 place_merchants.meituan_url='#小程序://美团拼好饭/Ohf6fSJgFJz3hiz'（备份 yeu.sqlite.bak-20260905-haoqi-meituan）；三家推广参数一致 enabled=1/20/20。schema 校验仅限长度≤500，微信 scheme 可存。线上验证：SSR 含标识；/api/public/place-reviews?placeId=B0M1JKQNKG promo.meituanUrl 已生效（地图卡将显示"美团下单+合作商家"条；小程序链接仅微信内可打开）。爱眼眼镜暂无外部链接/二维码，其地图推广条仍隐藏——等商家资产（美团/拼好饭链接或二维码图）到位后同法补齐。回滚点 home-merchants。
## 追加 15：`20260905-promo-panel`（release）— 地图推广条重构：无评分商家也能显示

问题：地图"美团下单/合作商家"推广条原先挂在评分评价组件(PlaceRatingSection)内，组件整体被 hasAnyContent(需有评分/评价)门控——好七好七这种**无评分新店整个推广条被隐藏**（爱眼眼镜因无链接/二维码同样不显示任何标识）。
重构：① 推广条从评分组件**迁移到地点详情面板(PlaceDetailsPanel)自取数据独立渲染**（GET place-reviews 的 promo 字段 + 点击埋点 merchant-promo/click），不再受评分内容门控；显示条件=启用推广(权重>0 或有链接/二维码)；有 meituanUrl 显示"美团下单"按钮、有 qrCodeUrl 显示可放大二维码、两者皆无显示"合作商家+已入驻校园地图"说明。② PlaceRatingSection 清理回原状（不重复渲染）。
线上验证(playwright)：好七好七=美团下单+合作商家×1、八洛克=美团下单+合作商家×1、爱眼眼镜=合作商家×1("已入驻…"说明)，无重复无报错。回滚点 merchant-badge。
## 追加 16：`20260905-map-cluster` / `map-cluster2` — 移动端地图标点观感优化

用户反馈：首屏/放大后"卡片（标点）显示不全"、移动端标点外没有名称。定位：聚合阈值过深（gridSize 56px、zoom 17 才拆），手机捏合很少到 17 级→学生街一直是大聚合球；另微信 WebView 下 MarkerCluster 可能按创建时错误画布布局导致部分标点缺失。
改动（map/providers/amap/provider.ts）：① CLUSTER_GRID_SIZE 56→40、CLUSTER_MAX_ZOOM 17→16（放大更早拆出带名字的单点；聚合功能保留，遵循用户偏好）；② 聚合球点击=向点击处放大两级（手机免捏合逐层钻取，lnglat 缺失时安全跳过）；③ rebuildMarkers 成功后 1.6s 一次性 overlay 兜底重排（幂等），缓解微信首屏"只出一部分"；测试同步更新（amap-provider 7/7 绿）。
验证：桌面首屏名称标签 0→10 直接可见、聚合粒度更细（5 球→11 个更小球，总量不变）；移动端行为需真机/微信复核（聚合球点击钻取 + 一次捏合到 16 级即出名称）。回滚点 promo-panel。
## 追加 17：`20260905-map-labels`（release）— 移动端图钉名称标签与桌面一致

根因：app/pages/map/index.vue 的 `@media (max-width: 639px)` 曾**故意隐藏**所有非选中 poi/area 名称标签（防小屏拥挤），导致手机上图钉下方无名字、电脑端有。移除该媒体查询（选中高亮样式保留）；配合聚合调优（labels 仅在非聚合的街道层级出现），移动端放大后名称与桌面一致。
验证：移动端街道层级可见名称标签 0→14（含周边商家与楼宇），桌面 10 个不受影响。回滚点 map-cluster2。
## 追加 18：`20260905-mobile-perf`（release）— 移动端地图性能与操作感

① **WGS84→GCJ02 转换缓存**（provider 内 Map，按 6 位坐标 key）：分类/搜索切换触发的重建不再重复打 convertFrom 接口，只转换新点；② **转换失败兜底**：超时/不完整不再整批丢点，退回 WGS84 直接绘制（校区偏差数十米），下次成功转换自动纠偏——治弱网"标点缺一半"；③ **setPois 集合不变跳过整套重建**（同 id 序列 + 数量一致时直接 return），减少移动端反复 teardown 的闪烁卡顿；④ 图钉名称标签窄屏(<640px) max-width 172→126px，减少街道层级名字互压。provider 测试 7/7 绿。回滚点 map-labels。
## 追加 19：`20260905-nav-ux`（release）— 步行导航体验修正

① 规划成功后**不再自动进入相机跟随**：此前 startTracking 会立刻飞到用户位置（17 级），高德 autoFitView 刚取景好的整条路线被甩出屏幕。现在保留实时跟踪蓝点与"距目的地"剩余距离，默认停在路线全景；需要贴身跟随时点既有「跟随」按钮。② 「规划步行路线」按钮在规划进行中禁用（desktop/mobile 两处），防止连点重复起路线实例。geolocation 测试 6/6 绿。回滚点 mobile-perf。
后续候选（未做，需产品决策）：定位被拒/失败的"手动选起点"降级流程；路口级转向指引。
## 追加 20：`20260905-nav-manual-steps`（release）— 手动选起点降级 + 路口级步行指引

**① 手动选起点**：定位被拒/不支持的浏览器也能规划——详情面板新增「选起点规划」按钮；规划时定位失败（MAP_GEOLOCATION_FAILED）自动弹起"选择出发地点"弹窗，锚点=已收录的校门+公交/交通站（startAnchors，data 驱动不编坐标）；选定后走 planWalkingMapRouteFrom（跳过 geolocation），定位可用仍开启跟踪显示剩余距离。composable 新增 onWalkingRouteLocationFailed 回调 + startWalkingRouteFrom。
**② 路口级指引**：RouteSummary 扩展 steps?（MapRouteStep{instruction,distanceMeters}）；高德 Walking 的 steps 摘要解析（≤40 条，空安全）；路线条中部变为可点按钮，展开"步行指引分段"列表（指引文案+分段距离，滚动容器）；clearWalkingRoute 同步清空。
验证：geolocation/amap-provider 测试 14/14 绿（新增显式起点与 steps 解析断言）；playwright 全链路——手动起点弹窗 8 锚点可选并完成规划；授权定位自动规划后路线条出现、展开可见 2 条真实分段指引。顺带把 map-place-details.test.ts 三条基线旧红断言修绿（面板 56dvh 高度/0.5rem 底距/按按钮 label 计数替代 brittle class 计数）。回滚点 nav-ux。
## 追加 21：驿站现场校正二（数据层，备份 yeu.sqlite.bak-20260905-post-yunda-move）

用户现场反馈：① 邮政快递站已搬至**旧区北苑餐厅二楼**——按用户在自己地图上圈的位置（医务所/北苑餐厅两锚点线性内插）更新坐标 WGS84 118.612255,25.116774，verified，地址/简介同步（"原第一教学区西北侧点位已搬迁"）；② 旧区吉龙旁的**韵达快递超市**实已搬至**新区学生街江户寿司对面**——高德无江户寿司 POI，按公开线索（后城48-7号）落街面点 WGS84 118.598001,25.109046，unverified 待现场核验。清 rag 缓存后 QA：北苑二楼快递/旧区快递站/韵达各问法均命中新位置。注：新区现有两张韵达卡（"韵达快递"二街近洋坑村委会 + "韵达快递超市"江户寿司对面），若实际仅一家需合并再反馈。
## 追加 22：韵达布局终校正（数据层，备份 yeu.sqlite.bak-20260905-yunda-restore）

用户澄清：① 旧区"韵达快递超市"（第一教学区西侧150米）**原本就对**——上一轮误搬已恢复原坐标（verified）；② 新区江户寿司对面**另有一家**韵达未标注——新增卡「韵达快递(江户寿司对面)」（slug yunda-jianghuo，id 手动 uuid，scope nearby/type express-service，坐标按后城街面近似落点 WGS84 118.598001,25.109046，unverified；无高德POI/评分故无 ratings 行）。现全库韵达三卡：旧区超市 + 新区二街(近洋坑村委会,unverified) + 新区江户对面(unverified)。⚠️ 两张新区卡坐标相距约60米（都是街面近似点）——若实为同一家需合并；若两家，请给各自更准参照（门牌/隔壁店）以核verified。品牌/泛取件问答已验证三卡齐列。
## 追加 23：韵达最终布局（数据层，备份 yeu.sqlite.bak-20260905-yunda-final）

用户最终确认的地面真相：① 老卡「韵达快递」的**原始坐标（WGS84 118.61087,25.11178）就在旧区学生街，本来就是对的**——此前两轮误挪（先到新区二街）已归位，verified；② 「韵达快递超市」不在旧区第一教学区西侧（吉龙旁，高德旧点位已失效），实际在**新区学生街江户寿司对面**——搬至 WGS84 118.598001,25.109046（街面近似，unverified 待核）；③ 删除上一轮多建的「韵达快递(江户寿司对面)」卡（与搬迁后的超市重复）。全库现两张韵达卡：旧区学生街(韵达快递) + 新区江户对面(韵达快递超市)。教训：**用户对"哪张卡对应哪家店"的指认可能基于缓存旧图，坐标变更后应让用户刷新再确认一轮**。
## 追加 24：`20260905-courier-jitu`（release）— 极兔速递(三街)新卡 + 韵达快递超市迁二街

用户再次指正街道归属：① 「韵达快递超市」在**新区学生街二街**（好七好七—爱眼连成的横街）**尾段、我的堡对面**——从上一轮"江户对面"再迁至二街东尾（WGS84 118.598491,25.108826，unverified）；② **三街·江户寿司对面是极兔**——新增卡「极兔速递(三街)」（slug jitu-express，WGS84 118.596341,25.109026，即已标注点以西约85m，unverified）；③ courierStation 驿站名匹配补「速递」字样（否则极兔速递无法被品牌问法命中）。QA：极兔在哪取 0.9 命中新卡；韵达双卡正常；泛取件列表 12 家。备份 yeu.sqlite.bak-20260905-jitu-erjie。遗留：二街/三街两卡均为街面近似点，待用户现场核。
## 追加 25：`20260905-local-gcj`（release）— 坐标偏移根治：本地 WGS84→GCJ02 换算

用户线上反馈"地图上一半坐标偏移"。根因链：标点原依赖高德 convertFrom 网络接口做 WGS84→GCJ02；接口弱网/超时/限流时（此前也因此表现为"初次少卡片"），20260905-mobile-perf 引入的兜底会把失败批直接按 WGS84 画——GCJ02 底图上即约 +0.0045°/-0.003°（≈450m）的系统偏移，正好"一半点偏"。
修复（map/providers/amap/provider.ts）：改用**本地确定性换算算法**（标准公开算法，此前已与高德八洛克点对拍 6 位一致），彻底移除 convertFrom 网络依赖、转换缓存/超时/失败兜底一并删除——标点位置恒定、首帧更快、不再受接口可用性影响。amap-provider 测试改为断言本地换算偏移量（7/7 绿）。验证：playwright 拦截坐标转换接口全部请求后，地图标点仍正常渲染 37 个标签、0 报错。回滚点 courier-jitu。

## 追加 26：`20260909-miniapp-api`（release）— 小程序 v1 只读 API 上线，线上 403 消除

小程序模拟器/真机的 `GET /api/miniapp/v1/home` 与 `POST /api/miniapp/v1/track` 此前一律 403 `API_ORIGIN_REJECTED`——根因是**旧 release 未含 miniapp 接入代码**（20260905-local-gcj 的 origin guard 无豁免、路由不存在），不是小程序 header bug。本轮以隔离快照上线：

- **范围**（git 快照提交 `979c8af`，分支 `codex/deploy-artifact-miniapp-20260909`，自 HEAD 948cb5a 只叠加 19 个文件，不含工作树其他无关改动）：`server/api/miniapp/v1/*` 11 个 GET/POST 路由（home/places/guides/procedures/notices/search ± slug、track）；`01-api-origin-guard` 对 miniapp 读路由与精确 track POST 窄放行；`visitor-ban` 覆盖 `/api/miniapp/v1`；新增 `miniapp-api-rate-limit`（GET 600/min/IP）；`notices/service` 增 `getPublicNotice`；`features/service` home entry 透传 featureKey；shared schemas/types 增补 telemetry 校验等。**刻意排除**：`server/api/admin/miniapp/analytics.get.ts` 与后台 miniapp 管理 UI（其依赖 visitors/service 增量 + auth capability 层，留待与后台 UI 同批发布）。
- **验证**：本地冒烟 7 类 endpoint 无 Origin 全 200、`/api/public/home`（不存在路由）仍 403 证明豁免未扩大；线上（服务器侧 curl，无 Origin）：home/places/guides/procedures/notices/search 全 200（UTF-8 中文完好，如"上海楼"），track POST 200 返回 eventId/visitorId，`/api/public/home` 无 Origin 仍 403、health 200、首页 SSR 200。
- **生产状态**：`current` → `releases/20260909-miniapp-api`；回滚点 `20260905-local-gcj`；DB 备份 `shared/backups/yeu-before-20260909-miniapp-api.sqlite`。
- **说明**：miniapp `/home` 与 web `/api/public/home-entries` 当前都返回 `entries=[]`——生产库 70 条已发布内容中 0 条带 `homeEntryEnabled=true` 元数据，属既有数据状态（两接口同源同一函数），非发布回归；小程序值班台首页另有静态功能宫格（地图/流程/指南/通知）+ features 开关兜底。若要内容化入口，需在后台为内容行启用 home entry 元数据（数据/内容运营项）。

## 追加 27：小程序 pages.json 导航栏 schema 修复（编译报错消除）

微信开发者工具反复报 `无效的 app.json window["navigationBar"]` + 各 `page.json ["navigationBar"]`（共 11 条）：根因是 `miniapp/pages.json` 误用了非规范嵌套结构 `"navigationBar": { titleText/titleColor/backgroundColor }`，uni-app 原样拷入 mp-weixin 产物。已改为规范扁平键：页级 `navigationBarTitleText` + globalStyle `navigationBarBackgroundColor:#f4efe5`/`navigationBarTextStyle:black`（微信仅允许 black/white，原深墨 #1f2924 意图以 black 表达）。`pnpm --dir miniapp build` 重建后产物 grep 不到 `"navigationBar"`。**开发者工具操作**：重新导入/编译 `miniapp/unpackage/dist/build/mp-weixin` 即可消错；此后模拟器 API 应 200（release 20260909-miniapp-api 已生效）。**真机/上线剩余项**：小程序后台配置 request 合法域名 `yx.huiliyill.cn`（及 uploadFile/downloadFile 如后续需要）、体验版上传与真机验收；后台 miniapp analytics 未随本 release 上线。
