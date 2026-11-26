# 第三方投票接入（金数据）

把金数据表单上的投票明细同步进本站，用本站的风控口径统一打分。**不借用第三方平台的微信身份**——原因见文末「边界」。

## 数据流

```
金数据表单（用户在外站投票）
        │
        ├─ 数据推送（有人提交时）→ POST /api/integrations/jinshuju/webhook
        └─ 主动拉取（cron / 手动）→ POST /api/integrations/jinshuju/sync
                                        │
                        归一化 → 窗口统计 → 评分 → 幂等落库
                                        │
                         third_party_vote_records（明细）
                         third_party_vote_sync_states（游标）
```

幂等键是金数据条目的 `token`（缺失时回退 `sn_<serial_number>`），重复拉同一页不会产生重复票。

## 配置

| 环境变量 | 说明 |
| --- | --- |
| `NUXT_JINSHUJU_API_TOKEN` | 金数据个人中心 → 开放平台 → Access Token |
| `NUXT_JINSHUJU_FORM_TOKEN` | 表单 token，即表单链接 `/f/<form_token>` 里那段 |
| `NUXT_JINSHUJU_OPTION_FIELD` | 存放投票选项的字段 api_code，例如 `field_3` |
| `NUXT_JINSHUJU_WEBHOOK_SECRET` | 回调鉴权，至少 16 位；支持 `Authorization: Bearer` 或 `X-Jinshuju-Token` |
| `NUXT_JINSHUJU_SYNC_SECRET` | 主动拉取接口的 Bearer，至少 16 位 |
| `NUXT_JINSHUJU_IP_HASH_SECRET` | IP 哈希盐；留空回退 `adminSessionSecret` |

前三项任一缺失时两个接口都返回 503，不发上游请求。两个 secret 缺失时分别返回 `webhook_secret_not_configured` / `sync_secret_not_configured`。

表单 token 与选项字段可以在后台直接改（见下节「后台表单管理」）：只配 `NUXT_JINSHUJU_API_TOKEN` 也能用，这两项留空时读 `third-party-form.json`。

### 建表单与自动发现配置

金数据开放平台支持直接创表，不必去网页点：

```
POST https://jinshuju.net/api/v1/forms
Authorization: Bearer <NUXT_JINSHUJU_API_TOKEN>
{ "name": "投票表单", "fields": [{ "type": "RadioButton", "label": "支持谁" }] }
```

返回里的 `token` 就是 `NUXT_JINSHUJU_FORM_TOKEN`；`fields` 回读形态是 `[{ "field_1": { "label": ..., "type": "single_choice", "choices": [...] } }]`，键名即 `NUXT_JINSHUJU_OPTION_FIELD`。

建好后跑一次自检，把两项自动填进 `.env`：

```bash
pnpm jinshuju:discover          # 只打印识别结果
pnpm jinshuju:discover --write  # 确认后写回 .env
```

选项增删走 `PATCH /api/v1/forms/<form_token>`，`fields.update_choices` 是数组，每项 `{ field_api_code, add, remove }`：

- `add` 传 `{ "name": "显示名" }`，`value`（也就是选项 api_code）由服务端生成；
- `remove` 传 `value` 数组；
- 同时传 `value` 和 `name` 时服务端以 `value` 为准回填 `name`，所以只写 `name` 最稳。

条目的写入与删除（联调与清场用）：

```
# 写一条：field_1 传选项的 value
POST /api/v1/forms/<form_token>/entries
{ "field_1": "Nj28" }

# 删一条：路径里是 serial_number，不是 entry token
DELETE /api/v1/forms/<form_token>/entries/<serial_number>
```

`creator_name` 传了也会被忽略，提交人固定成 token 所属账号；用这种方式造的条目也没有 IP 和填写时长（见「可用字段」）。


## 接口

### `POST /api/integrations/jinshuju/webhook`

金数据「数据推送」目标地址。请求体形态不固定，`entry`、`entries`、`data`、`record`、`list` 及裸条目都认。

```bash
curl -X POST https://<站点>/api/integrations/jinshuju/webhook \
  -H "Authorization: Bearer $NUXT_JINSHUJU_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"token":"tk_1","created_at":"2026-11-26T09:00:00.000Z","creator_name":"张三",
       "info_remote_ip":"203.0.113.10","info_filling_duration":42,"field_3":"singer_a"}'
```

返回 `{ ok, received, inserted, skipped, watch, voided }`。

两个接口的鉴权同时认 `Authorization: Bearer <secret>`、`X-Jinshuju-Token: <secret>`（仅 webhook）和 `?token=<secret>`。金数据的数据推送只给一个 URL，没有自定义头的入口，所以配置时直接把 token 拼在 URL 上：`https://<站点>/api/integrations/jinshuju/webhook?token=<NUXT_JINSHUJU_WEBHOOK_SECRET>`。

### `POST /api/integrations/jinshuju/sync`

```bash
# 增量（默认，从水位前 1 天重叠拉）
curl -X POST "https://<站点>/api/integrations/jinshuju/sync" \
  -H "Authorization: Bearer $NUXT_JINSHUJU_SYNC_SECRET"

# 全量重拉，最多 50 页
curl -X POST ".../sync?full=1&maxPages=50" -H "Authorization: Bearer $NUXT_JINSHUJU_SYNC_SECRET"
```

每页 100 条（金数据上限 1000），`next` 游标原样回传。返回 `{ ok, pages, received, inserted, skipped, watch, voided, incrementalFrom, nextCursor }`。

### 站内定时拉取

`server/plugins/third-party-vote-sync.ts` 在启动 1 分钟后开始，每 5 分钟自动跑一次增量拉取（最多 3 页 × 500 条，走同一套入库与风控逻辑）。三项配置齐全时才会注册定时器，没配就不发任何上游请求。

所以即使套餐开不了数据推送，站内也能自己把票捞回来；数据推送只是把延迟从分钟级压到秒级。

## 后台表单管理

建表、切换生效表单、改名改描述、改填写规则、删表全部收进后台，换一场比赛不用改环境变量也不用重启。

- 页面：`/admin/competition` → 人气投票分区 → 「表单管理」
- `GET /api/admin/competition/popularity/third-party-form`：账号下表单清单、当前生效表单结构、决赛候选、有效票统计、同步水位、配置来源
- `POST` 同一路径：`{ name, description?, fieldLabel?, options?, activate? }` 新建表单，`activate` 为真时顺手设为生效
- `PATCH` 同一路径：`{ add?, remove?, name?, description?, weixinLimited?, oncePerWeixin? }`，任意组合一次提交
- `DELETE` 同一路径：`{ token, confirm: true }`；删的是生效表单时同时清掉本地配置，回退到环境变量
- `POST /api/admin/competition/popularity/third-party-form/switch`：`{ token, optionField? }` 切换生效表单；写盘前先读一次远端结构，token 不存在或字段对不上直接 400

生效表单落在数据库同级的 `third-party-form.json`（`{ formToken, optionField, updatedAt }`），不占迁移、不改 schema、不用重启。读取顺序是 **文件 → 环境变量**，文件不存在时行为与只用 `.env` 完全一致。API 令牌始终只从环境变量读，不落文件。

两条限制要记住：

1. 删表是破坏性操作，表单里的提交记录一起消失，但本地 `third_party_vote_records` 已入库的票不会自动清理；发现删错了只能换 token 重来。
2. 免费版套餐的「自定义填写频次」按官方套餐表属企业版能力，`oncePerWeixin` 在免费版可能 402。失败时后台会提示，不影响已有规则。

## 后台手动补录

金数据表单开启「仅微信内填写」后，桌面浏览器与部分手机进不去；现场投不了的人由后台代录。

- 页面：`/admin/competition` → 人气投票分区下方的「第三方投票补录」，组件 `app/components/admin/ThirdPartyVoteEditor.vue`
- `GET /api/admin/competition/popularity/third-party-votes`：统计、决赛候选名单、最近 50 条记录
- `POST` 同一路径：`{ optionId, count?, votedAt?, voterRef?, status? }`，`count` 上限 50，`votedAt` 毫秒时间戳（缺省取当前时间）
- `DELETE` 同一路径加 `?id=`：只删本条

补录票与平台同步票同表存放，`provider` 记为 `manual`，一起进榜单与 `totals`。人工录入视为人工判定，**不跑风险评分**（`score` 恒 0、`flags` 为空），需要待审或作废由录入人直接选 `status`。

未配置 `NUXT_JINSHUJU_FORM_TOKEN` 时，手动补录与榜单统一回退到固定 `form_token = manual`（`MANUAL_FORM_TOKEN`），后台照常可用。

## 榜单展示

`GET /api/public/competition/popularity/third-party-ranking` 公开只读，按选项聚合票数，返回 `totals`（`received` / `valid` / `watch` / `voided`）与 `entries`（名次、占比、选手信息）。响应里没有 IP、昵称、条目 token，任何投票人数据都不出这个接口。

前端页面 `app/pages/singer/third-party-ranking.vue`（路由 `/singer/third-party-ranking`，`noindex`，不挂导航）每 30 秒拉一次，标签页不可见时不发请求。

排名三条规则：

1. 只有 `valid` 计名次，`watch` 单列提示，`void` 只进 `totals`；
2. 同票并列，下一名跳号（1、1、3）；
3. 选项名回连 `competition_singers.name`，取决赛第一轮的出场号、班级、照片与曲目；改过名或往届的选项沉到榜尾、名次留空，票数仍计入总数。

## 评分

单票得分是各命中项之和，封顶 100：0–59 有效、60–84 待审（`watch`）、85 以上作废（`void`）。

| 标记 | 分值 | 触发条件 |
| --- | --- | --- |
| `ip_cluster` | 25 | 同 IP `/24` 段 10 分钟内已投 > 3 票 |
| `ip_heavy` | 15 | 同上 > 8 票时叠加 |
| `voter_repeat` | 40 | 同一投票人标识 10 分钟内已投 > 1 票 |
| `idc_ip` | 30 | IP 落在内置云厂商/机房段 |
| `burst` | 20 | 60 秒内总票数 > 每分钟基线 × 10 |
| `no_identity` | 10 | 条目没有投票人标识 |
| `fast_interval` | 15 | 与同一投票人上一票间隔 < 3 秒 |
| `fast_fill` | 20 | 表单填写时长 < 5 秒 |

窗口外的票不继承簇统计：1 小时后的新票会重新按干净上下文打分。

## 可用字段

金数据条目里对风控有用的字段：`info_remote_ip`（真实 IP）、`info_platform` / `info_os` / `info_browser`、`info_filling_duration`（秒）、`info_region`、`token`、`created_at`（UTC ISO）。

**这四项只有在浏览器里真实填表时才会被采集**。用 `POST /api/v1/forms/<token>/entries` 或后台手工补录写入的条目，`info_remote_ip` 是空串、`info_filling_duration` 是 `null`、`info_platform` / `info_os` / `info_browser` 都是空串，此时只剩 `voter_repeat`、`fast_interval`、`burst`、`no_identity` 四个标记可用。所以上线前要用真实手机投一票，再拉 `entries` 确认这些字段有没有值——决定风控能做到多细。

`optionId` 存的是选项**显示名**（金数据 entries 不回 api_code），改选项名会让同一选手的历史分成两段统计，投票开始后不要改选项文案。

落库时 IP 只留 `/24` 段（`ip_cidr`）与 16 位加盐哈希（`ip_hash`），不存明文。

## 边界

- **第三方平台的微信身份用不了。** openid 是 appid 维度的，跨小程序不通用；unionid 只在同一微信开放平台账号下有效。微信官方文档明确「服务商无法实现将所有商家的公众号和小程序的用户身份打通」。所以这里只同步投票明细，身份维度靠 `creator_name` 与 IP/设备，不追求与本站 `voter_openid_hash` 打通。
- **平台侧的风控判定字段不开放。** 所有平台都只给原始明细，不给「是否刷票」的结论，判定必须自建。
- 金数据本身是「单账号认证 + 免费版可用」的开放度，适合个人主体接入；问卷星要客服开、人人秀要企业会员。

## 相关代码

- `server/modules/vote-sync/risk.ts`：评分纯函数与阈值
- `server/modules/vote-sync/window.ts`：10 分钟 / 60 秒窗口统计
- `server/modules/vote-sync/jinshuju-map.ts`：条目归一化
- `server/modules/vote-sync/ingest.ts`：幂等入库与游标
- `server/modules/vote-sync/form-config.ts`：生效表单配置文件读写（`third-party-form.json`）
- `server/utils/jinshuju.ts`：API 客户端（条目、表单结构、建表 / 删表 / 改填写规则）
- `server/database/migrations/0088_third_party_vote_sync.sql`：两表与索引
- `scripts/third-party-vote.test.ts`：25 个用例（评分、归一化、窗口、榜单）
- `scripts/third-party-vote-manual.test.ts`：7 个用例（补录、改状态、删除、汇总）
