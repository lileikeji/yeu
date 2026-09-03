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
