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
