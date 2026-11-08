# 校园热度（signal）

把学校各站点新发的通知和抓取到的公告聚成「一件事」，按「跟你有没有关系」和「最近有没有人在跟进」排序，输出热度榜、事件详情和日报/周报/月报。**整条链路全规则化，不调用模型**：跑一次只查 SQLite、算字符串相似度和固定公式，不需要网关配额，也不会因为模型抖动而忽高忽低。

代码位置：

| 位置 | 职责 |
| --- | --- |
| `server/modules/signal/time.ts` | 北京时间切日、周键（ISO）、月键，周期区间与文案 |
| `server/modules/signal/tiers.ts` | 信源分级 A/B/C 与各自门槛 |
| `server/modules/signal/scoring.ts` | 双评分（新生相关度 + 证据强度）、标题可用性、公告判定、分类 |
| `server/modules/signal/clustering.ts` | 标题相似度与事件聚簇 |
| `server/modules/signal/heat.ts` | 30 天窗口热度（7 天半衰）、涨跌趋势 |
| `server/modules/signal/report.ts` | 日报/周报/月报成品拼装、同标题去重、已报不再重复跟进 |
| `server/modules/signal/service.ts` | 取候选 → 打分 → 聚簇 → 落库；事件/报告读接口 |
| `scripts/signal-build.ts` | 命令行重建索引并出报告 |
| `scripts/signal.test.ts` | 10 个用例，覆盖口径与端到端建库 |

## 1. 数据从哪来

只读两类已有数据，不新增采集器：

- `contents` 里 `kind = 'notice'` 且 `status = 'published'` 的通知，按 `published_at` 进窗口，来源取 `content_sources.is_primary` 对应的 `sources`；
- `knowledge_documents` 里 `status = 'ready'`、有 `original_url`、`kind` 属于 `webpage/pdf/document/spreadsheet` 的文档，按 `captured_at` 进窗口。

抓取语料要过三道关才算「消息」，否则一堆学院简介、会议报道、文件名会污染榜单：

1. `looksLikeAnnouncement(title)`：标题出现 通知/公告/公示/名单/安排/须知/日程/报名/申请/办理/提醒/预告/调整/来袭 等词（抓取文档只看标题，正文里的「申请」会把表格页全放进来）；
2. `isUsableSignalTitle(title)`：标题短于 8 字、像哈希串、或纯文件名且没有中文（或文件名很短）一律不要。
3. 标题层面的三类硬拦（`isUsableSignalTitle` 内，与上面同一道）：
   - 表格材料：申请表、报名表、汇总表、模板、流程图——除非标题本身写着通知/公告/公示；
   - 制度与目录：办法、章程、指南、清单、学校简介、学院简介、课程表；
   - 科研与行政事务：科研、课题、基金、专利、申报、招标、采购、征文、教改、遴选、科技奖、产学研、科技特派员——这类是给老师和科研秘书的。标题里同时出现奖学金、奖助、助学金、报到、录取、宿舍、缴费、就业、实习、资助困难生等学生事务词时仍然放行，所以「关于做好2026年国家奖学金评审工作的通知」不受影响。

2026-11-05 实测：加上这条后事件从 143 条降到 98 条（候选 1850 → 1587），标题含科研/申报/基金/招标/征文/专利的从 28 条降到 1 条，剩下的那条是「科研诚信公益大讲堂——入学第一课」，确实发给学生。

卡片上的一句话摘要在写库时清洗，不直接截抓取正文：

- 先按行去掉导航行（网站首页/部门概况/下载专区…）和 Markdown 链接，再删「发布时间：…」「浏览次数：…」「学院地址：…」这类标签；
- 开头 80 字里堆两个以上日期的，判定为「最新公告列表」页，摘要留空；
- 其余按句切分，丢掉导航词句、面包屑、日期句，取前两句，去标点后不足 8 字的残片不要；
- 挑不出像正文的句子就留空。空摘要比贴一串栏目名好看。

## 2. 双评分：两科都过线才入选

参考的是 AIHOT 的两段式入选思路：一个分数容易被单一维度带跑，所以拆成两科，各自设线。

| 信源 | 门槛 | 说明 |
| --- | --- | --- |
| A：官方站点且信源级 A/B | 55 | 官网、教务处这类一手来源，信任度高，靠内容说话 |
| B：官方站点或信源级 C | 65 | 官方但级别不明，或非官方的 C 级来源 |
| C：其余 | 75 | 二手来源要明显更像「给新生看的事」才进来 |

通过条件有两条路：

1. 常规：`总分 = (A 科 + B 科) / 2 ≥ 门槛`，且 `A 科 ≥ 门槛 - 12`、`B 科 ≥ 门槛 - 12`；
2. 旧通知豁免：标题本身是通知/公告/公示且有真实发布日期，且 `A 科 ≥ 门槛 - 12`，即可入选——旧通知同样是通知，热度只影响排序，不决定去留。

第一科留 12 分余量，避免某一科极高把另一科拖过线。

- **A 科（新生相关度）**：base 48 + 标题命中的关键词组权重 + 正文命中补分（组权重 / 4，最多 10）− 标题一个组都没中扣 8 − 标题噪音组权重（最多扣 40）。标题权重高于正文，因为「宿舍」出现在正文里往往只是顺带一提。
- **B 科（证据强度）**：base 18 + 时效（1 天内 38，逐档递减到 180 天前 4）+ 官方 14（B 级 6）+ 有日期 6 + 有截止 4 + 有金额 4 + 有电话 3 + 有附件 7 + 正文超过 400/1200 字各 5。

关键词组分两类：

- 相关：新生入学 10、缴费资助 8、奖助学金 8、住宿 7、教学教务 6、军训体检 6、校园卡生活 5、安全应急 5、档案证照 5、校历假期 4、办事流程 3、就业实习 2；
- 噪音（扣分）：教职工 16、科研申报 16、行政公文 12、招生录取 12、校友捐赠 12、会议活动 10、校园动态 10、升学考试 8、会议报道 8、研究生 6。

招生类（征求志愿、招生计划、投档线）是给考生看的，在校生不需要，单列成噪音组；`录取通知书` 仍走「报到」组，不受影响。

发布时间只认官网原文：先取 URL 里的 `/YYYY/MMDD/`，再取标题与正文前 1500 字的第一个完整日期，只写年份的退化为当年 1 月 1 日；三者都没有的文档直接不入库——拿抓取时间冒充发布时机会让「更新于今天」满屏都是。

## 3. 聚簇：同一件事只算一条

先把标题去掉套话（关于/通知/公告/公示/安排/开展/做好/年/月/日/的……）、去掉数字和标点，再算 1/2/3-gram Dice 加权相似度（0.2 / 0.5 / 0.3）。

- 相似度 ≥ 0.42 合并；
- 或 ≥ 0.30 且共享关键 token ≥ 2 合并；
- 只在 14 天窗口内比较，按时间升序扫，union 式归组，组内按分数降序。

去套话这步不能省：不去的话「新生报到通知」和「新生宿舍通知」相似度 0.482 会被误并成一件事，去掉套话后降到 0.268，而「新生报到通知」和「新生报到时间安排通知」仍有 0.792，该合的照合。

## 4. 热度与趋势

口径照 AIHOT 的 `heat-v1`：

- 30 天窗口，7 天半衰，权重 `2^(-age/168)`；只算最近 48 小时的话，整页热度都是 0，这个数就没人看了；
- **每个来源只算一次**，同一来源重复发布取最新那条时间，避免一个站点刷屏；
- `heatPrev` 用 `now - 6h` 作锚点，用于展示「相比 6 小时前」。

趋势按**来源数变化**判，不按热度比：

- 第一次进快照（`first_seen_at` 在 6 小时内，或还没被上报过）→ `new`；
- 来源数比上一份快照多 → `up`；
- 来源数比上一份快照少 → `down`（撤稿、合并后出现的正常情况）；
- 一样多 → `flat`。

热度比不能用来判涨跌：窗口加半衰，旧来源会自然掉出窗口，热度一定往下走，凡是存在超过两天的正常事件都会被判成「跌」。来源数只增不减，语义稳定。快照重建时会沿用上一份的 `first_seen_at`、`heat_prev`、`reported_at`，所以每天 07:00 重跑不会把每个事件都刷成「刚出现」。

## 5. 日报 / 周报 / 月报

- 日报取**截至生成时间的最近 24 小时**，不是日历日。抓回来的通知常常是昨天发的，按日历日切会把它们挡在门外，当天日报就是空的。
- 同一件事两天连着报没意义：先按标题指纹去重（保留热度高的），再判新鲜度——`last_seen_at` 必须晚于上次成报时间 1 小时以上才再次跟进。顺序不能反，先判新鲜度会让同标题的低分副本顶替已报的那条。
- 周报/月报按日拼日报，跨日按 `event_id` 去重，不再调模型。
- 头条按「通知公告优先、再校园动态」排，24 小时内不够 5 条时用最近发布的通知补足（最多补到 10 条）：官网常有「今天只发了活动稿」的情况，不补的话日报就成了活动清单。
- 重建索引时 `signal-build.ts` 会带 `refresh`，当天那份日报整份重算，已报集合清空——否则早上 07:00 那轮标记过的条目会被当成报过，重建后日报变成 0 条。
- `(kind, period_key)` 有唯一约束，同一天重复请求拿回同一份。

## 6. 命令与调度

```bash
# 重建索引并出日报（默认库 ./data/yeu.sqlite，或读 NUXT_DATABASE_PATH）
pnpm tsx scripts/signal-build.ts

# 指定库、窗口、时间点，只算不写
pnpm tsx scripts/signal-build.ts --database data/yeu.sqlite --days 45 --now 2026-07-28T15:00:00Z --dry-run

# 一次出日报 + 周报 + 月报
pnpm tsx scripts/signal-build.ts --report both
```

参数：`--database` / `--days` / `--limit` / `--report=daily|weekly|monthly|both|none` / `--now=<ISO>` / `--dry-run`，`=` 和空格两种写法都认。

索引是整表重写（先 `delete signal_events`，条目跟着级联），不积累历史；要改口径随时重跑。跑完 `/hot` 与 `/api/public/signal` 就是新的。

生产上由 `ops/systemd/yeu-signal.service` + `yeu-signal.timer` 每天 07:00（Asia/Shanghai）跑一次，排在 03:40 的官方站点抓取之后。

发布包（tar）只有 `deploy/`、`nitro.json`、`public/`、`release.json`、`server/`，没有脚本也没有 `tsx`；`/www/wwwroot/yeu/repo` 只是代码检出，不装 `node_modules`。所以脚本另有一个独立运行环境 `/opt/yeu-signal`（自带 `node_modules`，约 67 MB），抓取与索引重建都在这里跑：

```bash
# 本机改完 signal / 抓取相关代码后，把文件推到运行环境（顺带收紧 busy_timeout）
bash scripts/sync-signal-runtime.sh

# 服务器上首次安装与启用（单元文件从本仓库 ops/systemd/ 传上去）
scp -i ~/.ssh/<deploy-key>.pem ops/systemd/yeu-signal.service ops/systemd/yeu-signal.timer root@<host>:/tmp/
sudo install -m 644 /tmp/yeu-signal.service /etc/systemd/system/yeu-signal.service
sudo install -m 644 /tmp/yeu-signal.timer /etc/systemd/system/yeu-signal.timer
sudo systemctl daemon-reload
sudo systemctl enable --now yeu-signal.timer

sudo systemctl start yeu-signal.service
journalctl -u yeu-signal.service -n 40 --no-pager
systemctl list-timers yeu-signal.timer
```

`WorkingDirectory=/opt/yeu-signal`，数据库走 `Environment=NUXT_DATABASE_PATH=/www/wwwroot/yeu/shared/data/yeu.sqlite`。服务 `Type=oneshot`、`MemoryMax=512M`、`TimeoutStartSec=20min`，只对 `shared/data`、`shared/logs`、`/opt/yeu-signal` 有写权限。失败时 systemd 单元为 `failed`，`systemctl --failed` 与 `journalctl -u yeu-signal` 能看到；接宝塔计划任务或现有监控时，按 `systemctl is-failed yeu-signal.service` 判非零即可告警。

## 7. 接口与页面

| 接口 | 说明 |
| --- | --- |
| `GET /api/public/signal?limit=20` | 热度榜，按 `heat` 降序、`last_seen_at` 次序，`limit` 上限 100 |
| `GET /api/public/signal/:slug` | 事件详情，含条目、来源名、是否官方；不存在返回 404 |
| `GET /api/public/signal/reports?kind=daily&limit=10` | 报告列表；`?live=1` 时顺手补一份当天日报 |
| `GET /api/miniapp/v1/signal?limit=10` | 小程序走同一份数据，公共缓存 30 秒 |

首页 `app/pages/index.vue` 在「常用查询」下面嵌了一段「最近在发」：5 条紧凑列表（趋势徽标、分类、来源数/条数、热度、相对时间）+ 右侧「全部热度」入口，数据走 `usePublicSignalList(5)`；列表为空时整段不渲染。

`app/pages/hot.vue` 是页面：顶部今日简报，分类横向筛选，每条显示标题、趋势、分级、来源数/条数、热度、更新时间，「看原文」按需拉详情，外链直达原始通知。导航入口在 `app/layouts/default.vue` 的「校园热度」。

## 7.2 接入站内搜索

`server/modules/search/service.ts` 在 `searchPublishedContent` 里多查一张表：命中 `signal_events.title/summary/category` 的事件以 `resultType: 'notice'` 出现在搜索结果里，按热度、再看发布时间排序。

- 定时重建的窗口是 400 天（`ops/systemd/yeu-signal.service` 的 `--days 400`）；窗口收窄会连带搜索和问答里能查到的事件一起变少。
- 结果项带 `to: /hot#<slug>`，搜索页 `apiSearchTarget` 优先用它，所以点开是热榜里那一条，不是 `/campus#notice-…`。
- `type=notice` 时也会带出信号事件；`type=place/procedure` 不带。
- 事件是派生数据，搜索直接读表，不需要额外索引；索引重建后 slug 会变，旧搜索结果链接可能失效，指向原文请用事件详情里的原始 URL。

## 7.1 接入站内问答

`server/modules/signal/assistant-evidence.ts` 把已发布事件当作检索证据，供 `retrieveCampusEvidence` 与其它来源一起做 RRF 融合：

- 匹配：问题词命中标题 +8（≥3 字）或 +5，命中摘要 +4/+2。
- 「最近有新消息吗」这类没有实词的问法，用 `FRESH_INTENT_RE`（`最近|最新|近期|新消息|热榜|热度|今天|本周` 等）兜底：加基础分，并按 `heat` 与距今时间加权，热度高的排前面。
- 证据 URL 是 `/hot#<slug>`，引用区直接可点；snippet 带「分类 · N 个来源 · N 条 · 发布日期」，回答里能说清「几号发的、几个站点都发了」。
- `/hot#` 在 `rankAssistantEvidence` 的主体覆盖闸门里放行（同 `/nearby#`、`/transport`），否则这类条目会被当作「没答到点上」清分。
- 改检索行为要同步 bump `ASSISTANT_CACHE_VERSION`（`server/modules/assistant/service.ts`），答案缓存有两层，版本号不变会继续发旧答案。

## 8. 已知边界

- 只用标题和正文前 6000 字判断，不解析附件内容；附件只作为「证据强度」加分项。
- 抓取语料不是「新消息」：快照里 1428 篇文档的时间戳集中在两天内，热度必然随时间归零。榜单看的是「最近谁在发」，不是「历史上发过什么」。
- 索引是整表重建的，事件 `id`（`sig_` + 代表条目的哈希）与 `slug` 每轮按当前代表条目重算，重建后旧链接可能指向新事件。要长期引用某条，引原始通知 URL，不引 `/hot/:slug`。
- 不做人工审核，口径即规则：要调质量就改 `scoring.ts` 的权重与门槛，然后重跑索引。

## 9. 抓取边界（2026-11 实测）

- 通知栏目对外不可达：`https://www.yeu.edu.cn/index/tzgg.htm` → 403，`/tzgg/list.htm` → 301 到 `/tzgg/list.psp` 且返回「No Permission」；`jwb.yeu.edu.cn/tzgg/list.htm`、`xgb.yeu.edu.cn` 同样被挡。栏目列表页只有校内网络能取。
- 外网能抓的是首页可达的内容页与附件（制度、办法、流程图、申请表）。所以 `--max-pages 300 --max-depth 3` 跑一轮只选出制度类事件，不是打分错了，是抓不到当期通知。
- 想覆盖主站通知栏目，只能换出口。软件侧已经留好开关：把 `CRAWL_FETCH_PROXY` 写成中继地址（`https://relay.example/fetch?url={url}`，或不带 `{url}` 的纯前缀形式），`crawl-official-knowledge.ts`、`collect-column-articles.ts`、`discover-open-columns.ts` 的所有请求都会先过中继，解析与打分逻辑不动。中继本身要放在能出校园网的地方（校内反代、内网代理转发）。校验方式：`CRAWL_FETCH_PROXY=… npx tsx scripts/discover-open-columns.ts --host jwb`，能列出 `tzgg` 栏目即生效。
- 抓取与索引都在 `/opt/yeu-signal` 里跑：`yeu-knowledge-crawl.timer`（03:45，`--max-pages 300 --max-depth 6`）负责攒语料，`yeu-signal.timer`（07:00）负责重建索引。两边共用生产库，`/opt/yeu-signal/server/database/client.ts` 的 `busy_timeout` 放宽到 120000，否则 compile 阶段与线上写请求会撞 `database is locked`。
- `/opt/yeu-signal` 的运行时依赖：`tsx`、`drizzle-orm`、`better-sqlite3`、`sqlite-vec`、`@e965/xlsx`、`cheerio`、`fflate`、`word-extractor`、`pdfjs-dist`。少 `pdfjs-dist` 时 PDF 通知会整批失败并报 `Cannot find package 'pdfjs-dist'`，日志里能看到 url 与 message，补包后重跑即可。
- 要让「最近在发」真显示当期通知，两条路：①抓取任务放在能访问校内栏目的机器上（生产服务器若在校园网内，直接换 seed 为栏目 URL）；②换公开源（招生网首页新闻、团委公众号等），并相应调整 `NOISE_GROUPS` 与公告闸门。

## 10. 图片正文的通知（OCR）

官网有一部分通知把正文做成图片：抓下来只剩一句「详见附件」或几十个字的引导语，标题再像通知也进不了榜。这类靠视觉模型转写补回来，代码在 `server/modules/knowledge/image-ocr.ts`。

- 图片筛选：只取 `<img>` 里 `src` / `data-src` / `data-original` 的相对或绝对地址，跳过站标、二维码、按钮这类装饰图（`DECORATION_PATTERN`），跳过模板资源与统计像素（`TRACKING_PATTERN`：`_visitcount`、`/_upload/site/`、`/tpl/`、`_ueditor`），`width`/`height` 显式小于 200 的也跳过。一页最多取 2 张。
- 转写：`POST {OCR_BASE_URL}/chat/completions`，`image_url` 直接给图片外链（站群图片可公网访问，不用下载再 base64），提示词要求原样转写、不要解释。转写结果拼在正文后面，前缀 `【图片文字】`。
- 抓取时自动补：`crawl-official-knowledge.ts` 里正文短于 300 字且页面有正文图时触发；`--no-ocr` 关闭。
- 存量补录：`scripts/ocr-short-documents.ts`，两段式——先并发扫页面挑出真有正文图的，再串行 OCR。只处理 `status=ready`、正文短于 `--min-text`、标题像通知、URL 是 `page.htm` 的文档；`--only-notice` 开启这层过滤。
- 环境变量（写在 `/www/wwwroot/yeu/shared/.env`，`yeu-signal.service` 通过 `EnvironmentFile` 读取）：`OCR_BASE_URL`、`OCR_API_KEY`、`OCR_MODEL`、`OCR_TIMEOUT_MS`。三个必填项缺一个就不启用，抓取与补录都会自动跳过。
- 实测：正文全是图片的「人文学院25-26学年奖助学金评审结果公示」补出 55 字名单；单张图约 24 秒（`Qwen/Qwen3.6-27B`），35B 要 35 秒，所以默认用 27B。
