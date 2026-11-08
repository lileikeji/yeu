# 数据模型

> 状态：当前逻辑模型（2026-07-31）；核心内容、账号、聊天、访客和 AI/知识库表已实现
> 数据库：SQLite（生产单机），由 Drizzle 管理 schema 与迁移
> 核心原则：发布内容、来源、核验时间和坐标系必须可追溯。

## 1. 建模约定

- 主键使用应用侧生成的 UUIDv7/ULID 字符串，避免把连续数据库 ID 暴露给前台。项目落地时二选一并全局统一。
- 数据库列使用 `snake_case`，TypeScript/JSON DTO 使用 `camelCase`，映射集中在 repository/mapper，不在页面临时转换。
- 时间列以 UTC 毫秒时间戳保存（Drizzle `integer` 的 `timestamp_ms` 模式），API 输出带时区的 ISO 8601。
- SQLite 布尔值使用 `INTEGER 0/1` 并加 `CHECK`；枚举使用文本并加 `CHECK`，枚举值同步定义在 `shared/constants`。
- 所有核心表包含 `created_at`、`updated_at`。内容表另含 `status`、`published_at`、`last_verified_at`。
- `status` 统一为 `draft | published | archived`。公开 API 必须在查询层过滤 `published`，不能依赖前端隐藏。
- slug 是稳定公开标识，使用小写 ASCII、数字和连字符；同一实体表内唯一。修改 slug 时应保留重定向记录。
- 核心关系使用外键，不把 ID 数组塞进 JSON。JSON 只用于样式、可扩展元数据和修订快照。
- 启用 `PRAGMA foreign_keys = ON`、WAL 和合理 `busy_timeout`；测试环境也必须启用外键。

## 2. 关系概览

```mermaid
erDiagram
  CATEGORIES ||--o{ PLACES : classifies
  CAMPUS_AREAS ||--o{ PLACES : contains
  PLACES ||--o{ PLACE_COORDINATES : has
  PLACES ||--o{ PLACE_RELATIONS : relates
  MAP_LAYERS ||--o{ MAP_FEATURES : contains
  PLACES o|--o{ MAP_FEATURES : describes
  CATEGORIES ||--o{ GUIDES : classifies
  CATEGORIES ||--o{ PROCEDURES : classifies
  PROCEDURES ||--o{ PROCEDURE_STEPS : orders
  PROCEDURES ||--o{ PROCEDURE_MATERIALS : requires
  DEPARTMENTS ||--o{ DEPARTMENT_PLACES : uses
  PLACES ||--o{ DEPARTMENT_PLACES : hosts
  CLUBS ||--o{ CLUB_PLACES : uses
  PLACES ||--o{ CLUB_PLACES : hosts
  SOURCES ||--o{ PLACE_SOURCES : supports
  PLACES ||--o{ PLACE_SOURCES : cites
  SOURCES ||--o{ GUIDE_SOURCES : supports
  GUIDES ||--o{ GUIDE_SOURCES : cites
  MEDIA_ASSETS ||--o{ PLACE_MEDIA : used_by
  PLACES ||--o{ PLACE_MEDIA : displays
  ADMIN_USERS ||--o{ ADMIN_SESSIONS : owns
  ADMIN_USERS ||--o{ AUDIT_LOGS : performs
```

## 3. 地图与地点

### 3.1 `campus_areas`

用于表达校区或相对稳定的校园片区，避免把“旧区/新区”等自由文本散落在地点记录。

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | TEXT PK | 稳定 ID |
| `slug` | TEXT UNIQUE NOT NULL | 公开路径标识 |
| `name` | TEXT NOT NULL | 片区名称 |
| `summary` | TEXT | 简介 |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | 展示顺序 |
| `status` | TEXT CHECK | 草稿/发布/归档 |
| `last_verified_at` | INTEGER | 最后核验时间 |

### 3.2 `places`

校园建筑、入口、服务点、宿舍、教学楼、快递点、外卖取餐点和周边商铺都使用同一地点实体。商铺的商业主体不是地点本身，未来单独建模。

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | TEXT PK | 地点 ID |
| `slug` | TEXT UNIQUE NOT NULL | 公开路径标识 |
| `name` | TEXT NOT NULL | 常用名称 |
| `aliases_json` | TEXT | 经校验的别名数组，仅用于搜索 |
| `summary` | TEXT NOT NULL | 地图抽屉短介绍 |
| `body` | TEXT | 结构化正文/Markdown 源 |
| `scope` | TEXT CHECK (`campus`,`nearby`) | 校内或周边 |
| `place_type` | TEXT NOT NULL | building/dorm/classroom/gate/service/express/food/shop 等受控值 |
| `category_id` | TEXT FK | 分类 |
| `campus_area_id` | TEXT FK NULL | 所属片区；周边地点可空 |
| `address` | TEXT | 文字地址 |
| `floor` / `room` | TEXT | 室内定位说明，不假装为精确室内地图 |
| `opening_hours` | TEXT | 面向用户的时间说明；复杂时段后续结构化 |
| `phone` | TEXT | 只保存已同意公开或机构公开电话 |
| `website` | TEXT | 官方/商家主页 |
| `external_map_url` | TEXT | 外部地图兜底链接 |
| `is_official` | INTEGER CHECK | 是否为校方机构/设施，不代表信息绝对正确 |
| `is_featured` | INTEGER CHECK | 编辑精选，不用于付费推广 |
| `status` | TEXT CHECK | 发布状态 |
| `last_verified_at` | INTEGER | 最近人工核验 |
| `published_at` | INTEGER | 最近一次发布 |

关键索引：`(status, scope, place_type)`、`category_id`、`campus_area_id`、`updated_at`。名称和别名进入可重建搜索索引，不用前导通配符扫描主表。

### 3.3 `place_coordinates`

坐标不能只保存两个无上下文数字。每个地点可保存 WGS84、GCJ-02、BD-09 的一个版本；至少有一条被人工确认的原始/权威坐标，其他版本可由明确算法生成。

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | TEXT PK | 坐标记录 ID |
| `place_id` | TEXT FK NOT NULL | 所属地点 |
| `coordinate_system` | TEXT CHECK (`WGS84`,`GCJ-02`,`BD-09`) | 显式坐标系 |
| `longitude` | REAL CHECK -180..180 | 经度 |
| `latitude` | REAL CHECK -90..90 | 纬度 |
| `is_source` | INTEGER CHECK | 是否为采集/人工标定的源坐标 |
| `source_coordinate_id` | TEXT FK NULL | 转换自哪条坐标 |
| `capture_method` | TEXT CHECK | map_pick/gps/official_data/manual_import/transformed |
| `transform_version` | TEXT NULL | 转换算法及版本；源坐标为空 |
| `accuracy_meters` | REAL NULL CHECK >= 0 | 已知时记录估计精度 |
| `verified_at` | INTEGER | 坐标本身的核验时间 |
| `verified_by` | TEXT FK NULL | 管理员 |

约束：`UNIQUE(place_id, coordinate_system)`；`is_source = 0` 时必须有 `source_coordinate_id` 与 `transform_version`；转换链不能跨地点。服务层在写入时防止循环引用。

高德展示取 GCJ-02，MapLibre/标准 GeoJSON 底图通常取 WGS84，百度链接取 BD-09。不得在 API 消费端静默转换。转换属于近似处理，人工标定结果优先于算法转换；重新运行新算法前保留修订记录。

当前 MVP 已先落地 `place_coordinate_observations` 作为现场坐标证据链。每条观测保存地点、WGS84 聚合点、设备有效精度、1 至 10 个原始样本、采集方式、点位角色、采集时间、现场说明、审核状态、审核人和审核记录。`places.coordinate_point_role` 保存当前候选/主导航点的点位角色。浏览器现场采点至少需要 3 个样本；第一条观测批准后地点最多为 `unverified`，只有同角色、20 米内、满足可信方法和时间独立性的第二条观测才可 `verified`；普通地点表单不能直接把坐标标成 `verified`。多坐标系派生链仍按上述 `place_coordinates` 目标模型后续实现。

### 3.4 `map_layers` 与 `map_features`

点状 POI 使用 `places`；楼宇轮廓、道路、报到路线、校区边界等面/线数据放在地图要素表。

`map_layers`：`id`、`slug`、`name`、`description`、`feature_kind`、`style_key`、`min_zoom`、`max_zoom`、`sort_order`、`is_default_visible`、`status`、时间戳。

`map_features`：`id`、`layer_id`、可选 `place_id`、`name`、`geometry_type`（`Point|LineString|Polygon|MultiPolygon`）、`geometry_json`、`coordinate_system`、`bounds_json`、`style_variant`、`status`、`last_verified_at`、时间戳。

要求：

- `geometry_json` 写入前按 `geometry_type` 做结构和经纬度范围校验；
- 每条几何显式保存坐标系。只有 WGS84 数据可以对外称为标准 GeoJSON；其他坐标系返回时必须携带额外 CRS 元数据；
- 大型几何在导入时生成简化版本，不能每次请求实时简化；
- `map_features` 也应通过独立来源关联表记录采集依据；
- v1 不承诺 GIS 空间计算，边界框可冗余存储并由导入脚本生成，未来迁移到具备空间索引的数据库时再替换。

### 3.5 `place_relations`

表达“某入口通往某宿舍”“某快递点服务某片区”等有方向关系：`id`、`from_place_id`、`to_place_id`、`relation_type`、`label`、`sort_order`。约束 `from_place_id != to_place_id`，三元组唯一。

## 4. 内容实体

### 4.1 `categories`

字段：`id`、可选 `parent_id`、`entity_type`（place/guide/procedure/club）、`slug`、`name`、`icon`、`sort_order`、`status`。唯一约束 `(entity_type, slug)`；服务层防止分类树循环。不要用一个分类同时承载不同实体含义。

### 4.2 `guides`

字段：`id`、`slug`、`title`、`summary`、`body`、`category_id`、`audience`（all/undergraduate/top_up 或受控组合）、`read_minutes`、`is_featured`、`status`、`published_at`、`last_verified_at`、时间戳。

校园卡与网络、快递外卖规则、生活事项等解释型内容属于指南。正文中的地点应使用 `guide_places(guide_id, place_id, relation_label, sort_order)` 关联，不能只写一个将来会失效的名称。

### 4.3 `procedures`、`procedure_steps`、`procedure_materials`

`procedures`：`id`、`slug`、`title`、`summary`、`body`、`category`、`audience_json`（undergraduate/transfer 受控数组）、`method`（online/offline/mixed）、`information_state`（confirmed/partial/awaiting-notice）、`status_text`、`processing_time`、`deadline_text`、`starts_at`/`ends_at`、公开有效期 `valid_from`/`valid_until`、可选 `department_id` 和关联 `guide_id`、`status`、`published_at`、`last_verified_at`、时间戳。

`procedure_steps`：`id`、`procedure_id`、`step_order`、`title`、`description`、`audience_json`、`information_state`、可选 `time_text`、`place_id`、`department_id` 和 `action_url`。唯一约束 `(procedure_id, step_order)`，顺序从 1 开始；管理 API 按数组顺序重建序号，发布前再次检查连续性。

`procedure_materials`：`id`、`procedure_id`、`item_order`、`name`、`description`、`audience_json`、可空 `is_required`、`information_state`，以及可选 `place_id`/`department_id`。未知材料允许保持空清单；不得为填满页面创建虚假材料项。报到材料一经确认则必须进入此表，不能只嵌在正文里。

报名/报到流程可通过 `procedure_places` 关联多个地点；`procedure_sources` 为每条来源保存 `claim_scope`、主来源标记和顺序。deadline 首版保留面向人的文字，同时用 `starts_at`/`ends_at` 表达来源已确认的明确时段；不把“以通知为准”猜成具体日期。公开查询只返回处于发布状态且在 `valid_from`/`valid_until` 窗口内的流程。

### 4.4 `departments` 与 `clubs`

`departments`：`id`、`slug`、`name`、`short_name`、`summary`、`body`、`phone`、`email`、`website`、`office_hours`、`status`、`published_at`、`last_verified_at`、时间戳。

`clubs`：`id`、`slug`、`name`、`summary`、`body`、`category_id`、`recruitment_period`、`activity_schedule`、`contact_method`、`logo_media_id`、`status`、`published_at`、`last_verified_at`、时间戳。

地点分别通过 `department_places` 和 `club_places` 多对多关联，包含 `relation_type`（office/activity/recruitment 等）及 `sort_order`。社团个人联系方式只有取得公开同意后才能入库，建议优先使用公开账号或组织邮箱。

## 5. 来源、媒体与版本

### 5.1 `sources`

来源记录是多个内容可复用的证据，不等于正文快照。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `title` / `url` | 来源标题与规范化 URL |
| `platform` | 官网、微信公众号、微博、小红书、抖音、地图平台、线下材料等受控值 |
| `publisher_name` | 发布主体/账号名 |
| `source_level` | A/B/C/D/E，定义见 `CONTENT_POLICY.md` |
| `is_official` | 是否为经核实的官方主体 |
| `published_at` | 来源发布时间（可空，不得用抓取时间冒充） |
| `accessed_at` | 最近访问时间 |
| `archive_reference` | 合规保存的存档编号/内部证据引用；不公开本地路径 |
| `notes` | 仅管理员可见的核验说明 |
| `status` | active/unavailable/disputed |

对 `url` 建唯一索引前先做 URL 规范化；同 URL 的不同版本通过修订记录保留，不重复制造来源。

### 5.2 来源关联表

使用 `place_sources`、`guide_sources`、`procedure_sources`、`department_sources`、`club_sources`、`map_feature_sources`。每张表包含目标 ID、`source_id`、`claim_scope`（该来源支持什么事实）、`is_primary`、`sort_order`，联合主键为目标 ID + 来源 ID。

采用显式关联表是为了让 SQLite 外键真正生效，避免 `target_type + target_id` 多态关联产生孤儿记录。

### 5.3 `media_assets` 与媒体关联

`media_assets`：`id`、`storage_key`、`original_filename`、`mime_type`、`byte_size`、`width`、`height`、`sha256`、`alt_text`、`credit`、`license_type`、`license_reference`、`captured_at`、`status`、时间戳。`storage_key` 和 `sha256` 唯一。

`place_media`、`guide_media`、`department_media`、`club_media` 包含目标 ID、媒体 ID、`role`（cover/gallery/logo）、`sort_order`。公开前必须有替代文本、来源/授权和审核状态。

### 5.4 `content_revisions` 与 slug 重定向

`content_revisions` 保存发布前后的可审计快照：`id`、`entity_type`、`entity_id`、`revision_no`、`snapshot_json`、`change_summary`、`created_by`、`created_at`。这是管理审计数据，应用层必须确认目标存在；定期清理策略需保留已发布版本和近期草稿版本。

`slug_redirects`：`entity_type`、`old_slug`、`new_slug`、时间戳，联合唯一。服务层禁止重定向环。

## 6. 后台、纠错与审计

### 6.1 `admin_users` 与 `admin_sessions`

即使首版只有一名维护者也必须建管理员身份边界。

- `admin_users`：`id`、`username`、`password_hash`、`display_name`、`is_active`、`last_login_at`、时间戳；用户名唯一，绝不保存明文密码。
- `admin_sessions`：`id`、`admin_user_id`、`token_hash`、`expires_at`、`last_seen_at`、`ip_hash`、`user_agent_summary`、`revoked_at`。数据库只保存会话 token 的哈希。

`users`/`user_sessions` 保存普通用户账号和哈希会话；用户状态为 `active | disabled | banned`，专业和宿舍楼属于可修改资料。公开指南和地图不要求登录，但聊天写入必须有有效用户会话。`organization_admin_scopes` 将组织管理员限制到被授权的社团/部门内容，不能把组织管理员权限当作全局管理员权限。

### 6.2 `chat_rooms`、`chat_members`、`chat_messages` 与 `chat_mutes`

群聊使用独立实体：当前房间类型为公共群或宿舍群，成员通过联合主键关联用户；消息保存发送者快照、正文、创建时间和软删除时间；禁言支持房间级/个人级、原因、执行管理员和到期时间。未登录用户可以浏览公开内容，但不能创建聊天消息。社团/部门专属房间若要从入口升级为独立房间，必须新增受控类型和成员授权迁移。

### 6.3 `frontend_feature_settings`、`visitors` 与 `visitor_events`

`frontend_feature_settings` 控制前台功能卡片的开关、位置和排序，后台修改后由公开配置接口读取；它不应直接删除业务数据。`visitors` 保存首访/末访、最近路径、地域摘要、操作次数和可选用户关联；`visitor_events` 保存必要的路径、动作、设备/地域摘要和时间。后台统计按北京时间聚合最近活动、当日汇总、24 小时和近 14 日频率；IP、地域和 user-agent 必须按隐私政策限期保留并清理。

### 6.4 `correction_reports`

字段：`id`、`entity_type`、`entity_id`、`reason_type`、`message`、可选 `contact`、`evidence_url`、`status`（new/reviewing/resolved/rejected/spam）、`resolution_note`、`resolved_by`、`resolved_at`、`submitter_ip_hash`、时间戳。

纠错可以匿名提交。联系方式加密或严格限制后台展示，解决后按保留期删除；IP 仅保存带轮换盐的哈希用于限流，不能当作用户身份。由于目标使用多态引用，服务层写入时必须确认实体存在，删除实体前检查未处理纠错。

### 6.5 `audit_logs`

字段：`id`、`actor_admin_id`、`action`、`entity_type`、`entity_id`、`request_id`、`before_revision_id`、`after_revision_id`、`metadata_json`、`created_at`。审计日志只追加，不提供普通编辑/删除接口，不记录密码、会话 token 或完整联系方式。

### 6.6 新生歌手大赛（仅音乐协会）

比赛数据只属于 `contents.kind = 'club'` 且 slug 为 `music-association` 的音乐协会，服务端按内容 ID 校验组织管理员范围，不接受其他社团复用。迁移 `0039_nosy_salo.sql` + `0046_steep_dorian_gray.sql` 新增以下表：

- `competition_events`：赛事主表，`content_id` 唯一，保存名称、`registration_open`（现场扫码登记开关）和 `dimensions_json`（维度 key、名称、相对权重）。默认五维等权：音准、节奏、情感、音色、舞台表现，每维满分 20，单评委满分 100。
- `competition_rounds`：固定三轮 `prelim` / `semi` / `final`，保存标题、顺序、状态（`draft`/`open`/`closed`）、本轮计划评委数和晋级人数。初赛默认晋级 30 人；复赛晋级人数允许为 `null`（名额待定）；决赛为 `null`。
- `competition_judges`：按轮次创建的评委账号，`username` 全局唯一，保存 scrypt 密码哈希、展示名、启用状态和最近登录。评委与轮次绑定，跨轮执评必须使用不同账号。
- `competition_judge_sessions`：评委独立会话，只保存 token/CSRF 哈希、绝对过期时间和最后活跃时间；Cookie 使用 `yeu_judge_*` / `__Host-yeu_judge_*` 命名空间，与管理员、普通用户会话互不影响。
- `competition_singers`：赛事总名单（姓名、歌曲——可留空表示待定、班级、备注、学号、电话、邮箱、`source`（`admin` 后台录入 / `form` 现场扫码登记）、初始序号）。学号是公开登记的去重键。
- `competition_round_entries`：某轮参赛名单与出场顺序。初赛在新增/导入/登记时自动写入；复赛/决赛由上一轮晋级结果生成并随机抽签，`advanced_from_rank` 记录晋级名次，管理员可手动调整 `sort_order`。
- `competition_scores`：按 `(round_id, singer_id, judge_id)` 唯一，保存提交时的维度快照与加权总分；轮次关闭后 API 拒绝写入。
- `competition_email_templates`：每轮结果邮件模板（`(event_id, round_key)` 唯一），未落库时返回内置默认模板。
- `competition_email_sends`：邮件发送流水（每次尝试一条；`singer_id` 可空表示测试发送），用于已发送去重、失败重发与后台状态展示。

计分规则：单评委总分 = `Σ(维度分 × 权重) / Σ权重 × 维度数`，等权五维时即五项累加（满分 100），四舍五入保留两位。轮次得分 = 该轮所有已提交评委总分的平均分。排名按平均分降序，同分按该轮出场顺序靠前者优先；轮次结束后没有任何评分的选手标记弃权，排在最后且不参与晋级。晋级取有分选手排序后的前 `advance_count` 名，因此同分卡在边界时由出场顺序决定。赛事一旦产生任意评分，维度、权重和数量即锁定，避免不同快照的总分不可比；标题与登记开关仍可修改。

公开登记：`POST /api/public/competition/register`（班级/姓名/学号/电话/邮箱必填，歌曲可待定）按学号去重、受 IP 限流和 `registration_open` 开关控制，登记顺序即初赛出场顺序；`GET /api/public/competition/register` 返回开关状态（30 秒短缓存）。结果邮件：`PUT /api/admin/competition/email/[roundKey]` 保存模板，`.../test` 发测试邮件（示例数据、不落流水），`.../send` 仅在轮次 `closed` 后可发送——按 scope（全部/仅晋级/仅未晋级）渲染合并字段（`{{姓名}}` 等）并逐条记录发送结果，已成功发送的选手自动跳过，显式 `singerIds` 视为重发。

## 7. 搜索与知识库

### 7.1 公开结构化搜索

`GET /api/public/search` 当前直接查询已发布地点、内容和流程，并把标题、摘要、正文、流程步骤、材料和受控元数据归一化排序；系统功能入口作为独立结果返回。公开搜索是结构化事实入口，不直接调用模型。

知识文档/声明使用可重建的 SQLite FTS5 投影，索引名称、关键词和正文纯文本。FTS 只是投影，不是真实数据源：发布、下线、修改或来源撤回后由服务层同步失效，部署后可脚本全量重建。不支持 FTS5 的运行环境应降级为受限名称/分类筛选，并在健康检查中报告能力状态，不能静默返回不完整结果。

### 7.2 AI 检索与知识库（当前实现）

当前知识链由 `assistant_web_knowledge`、`assistant_knowledge_entries`、`knowledge_documents`、`knowledge_crawl_queue`、`knowledge_entities`、`knowledge_claims`、`knowledge_claim_sources`、`knowledge_claim_entities`、`knowledge_conflicts` 和 `assistant_runs` 组成。文档保存来源/URL、内容哈希、抽取文本、媒体/页面元数据和处理状态；声明保存关键词、置信度、审核状态、有效期、来源证据和实体关系；冲突保留两条声明的关系与处理结果；运行记录保存检索路径、各阶段耗时、引用数、成功状态和错误码。

导入必须经历“去重 -> 抽取 -> 编译候选声明 -> `draft/review` -> 管理员审核 -> `published`”。只有 `published`、未过期、有来源且通过置信度门槛的声明进入公开 AI 上下文。全文检索优先使用可重建的 SQLite FTS5 投影，不支持 FTS5 时降级到受限 LIKE；任何索引都是投影，不是真实数据源。内容下线、修订或来源撤回时要让相关声明/索引失效，并保留可追溯的历史记录。AI 不应把聊天内容、学生身份或模型自由发挥写入事实表。

### 7.3 商户认领、优惠与推广（非 v1）

预留独立实体：`merchant_organizations`、`merchant_place_links`、`merchant_claims`、`offers`、`promotion_campaigns`。其中：

- 一个商户主体可关联多个地点，一个地点的认领必须审核；
- 优惠有开始/结束时间、适用条件、核验状态和商家责任主体；
- 推广活动包含投放位置、起止时间、审核记录和“广告/推广”展示文案；
- `places.is_featured` 只表示编辑精选，绝不复用为付费位；
- v1 不创建虚假的默认商户账号或空推广记录。

### 7.4 校园热度（`signal_events`、`signal_event_items`、`signal_reports`）

三张表只存**可重建的派生结果**，真数据源仍是 `contents`（通知）与 `knowledge_documents`（抓取的网页/PDF）。索引重建时整表重写，删掉就能从源数据重算，不需要备份。

- `signal_events`：一件事。`slug` 唯一（可读标题 → ASCII，否则 `hot-<hash>`），`heat`/`heat_prev` 是 48 小时半衰热度，`trend` 取 `new/up/down/flat`，`source_count` 是跟进这件事的来源数（同源多次发布只算一次），`score`/`tier` 是双评分与信源分级，`first_seen_at`/`last_seen_at` 决定它算不算「新」。
- `signal_event_items`：事件下的原始条目，`(item_kind, item_id)` 唯一，`item_kind` 取 `notice`/`document`。`is_primary` 标记代表条目，`score_a`/`score_b` 保留双评分，便于解释为什么入选。
- `signal_reports`：日报/周报/月报，`(kind, period_key)` 唯一，`payload_json` 是完整成品（头条、分栏、统计），重复生成只返回已有那份。

## 8. 完整性与生命周期

发布服务必须在同一事务或可恢复工作流中检查：

1. 必填标题、摘要、分类和 slug 合法；
2. 至少有一条满足内容政策的有效来源，或明确标记为现场核验；
3. 地点至少有一条已标明坐标系的坐标，生产地图所需 GCJ-02 已就绪；
4. 流程步骤顺序连续，内部关联的地点/部门均未归档；
5. 公开媒体具备替代文本和授权/来源信息；
6. `last_verified_at` 不晚于当前时间，且未超过该内容类型的有效期；
7. 创建修订快照和审计日志后才切换为 `published`。

默认采用归档而非硬删除。可以硬删除的对象仅限未发布草稿、已确认孤立的媒体、过期会话及达到隐私保留期的纠错联系方式。外键删除策略默认 `RESTRICT`；纯关联表可 `CASCADE`，来源和媒体不随单个内容删除。

## 9. 迁移、导入与种子数据

- Drizzle schema 是结构定义，已提交迁移文件是生产变更记录；生产环境禁止使用会绕过审核的直接 schema push。
- 迁移只追加且进入 Git。已在任何环境执行的迁移不得修改，修正必须新建迁移。
- 破坏性变化采用“新增字段/回填/切换读取/后续删除”的扩展-收缩流程；迁移前按 `DEPLOYMENT.md` 创建 SQLite 一致性备份。
- 基础分类、校园片区和单管理员初始化使用幂等 seed；管理员初始密码从交互输入或环境变量读取，不进入代码或日志。
- 地图/内容批量导入文件须包含来源、原坐标系和核验时间。先生成校验报告，人工确认后再写入草稿，默认绝不自动发布。
- 导入完成后检查外键、重复 slug、坐标范围、缺失来源、孤儿媒体和搜索索引数量。

## 10. 数据验收要点

- [ ] 所有公开地点至少有一条坐标，且每条坐标明确为 WGS84、GCJ-02 或 BD-09。
- [ ] 同一地点每种坐标系最多一条；派生坐标能追溯到源坐标和算法版本。
- [ ] 地图点、面、线都能关联来源和最近核验时间。
- [ ] 公开查询在 repository 层统一过滤 `published`，草稿不能通过猜 URL 访问。
- [ ] 指南、流程、地点、部门和社团均能关联多个来源，且不存在孤儿关联。
- [ ] 流程步骤排序连续，地点和部门关联受外键保护。
- [ ] 管理变更生成内容修订与审计记录；密码和会话 token 不以明文落库。
- [ ] 纠错联系方式、IP 哈希有明确保留期和清理任务。
- [ ] FTS 索引可从主表完整重建；关闭搜索索引不影响内容真实数据。
- [ ] 备份恢复后执行 `foreign_key_check`、关键数量核对和一条完整发布流程。
