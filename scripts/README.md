# Scripts

当前脚本按职责建立：

- `db-migrate.ts`：执行已提交的 Drizzle 迁移。
- `db-init.ts`：迁移数据库并幂等初始化单管理员。
- `admin-bootstrap.test.ts`：验证强制重置管理员密码时同步撤销全部旧会话。
- `db-check.ts`：执行 SQLite 完整性与外键检查。
- `backup-database.ts`：使用 SQLite 在线 backup API 写入同目录临时文件，通过完整性/外键校验并计算 SHA-256 后原子落盘，同时生成最小化 JSON 元数据；拒绝覆盖和公开目录目标。
- `backup-database.test.ts`：验证 WAL 可见数据的一致性备份、元数据、临时旁路清理及危险目标拒绝。
- `monitor-production.ts`：检查生产 `/api/health`、SQLite/WAL 大小、磁盘余量、系统内存/负载和最近一次已验证备份；首次故障、故障变化、定时提醒与恢复可发送脱敏 HTTPS webhook，并用持久状态文件去重。
- `monitor-production.test.ts`：验证健康状态、聚合故障、Webhook 去重、恢复通知和本机路径不外泄。
- `hash-password.ts`：生成生产环境可配置的 `scrypt` 管理员密码哈希。
- `e2e-fixtures.ts` / `prepare-e2e-database.ts`：重建 Git 忽略的隔离 E2E 库，使用正式服务准备受控已发布地点、桌面/移动各自的内容草稿和专用测试管理员，供公开、管理、反馈、PWA 和 Axe 无障碍闭环使用；不得导入或复用生产凭据。
- `admin-procedure-editor.test.ts` / `admin-procedure-form.test.ts` / `admin-procedure-form-model.test.ts` / `admin-procedure-presentation.test.ts` / `admin-procedure-operations.test.ts` / `admin-procedure-catalog.test.ts`：固定后台流程组件、表单模型、校验/payload、展示标签/选项、编辑发布竞态、列表分页、关联快照和鉴权错误边界。
- `admin-field-observation-queue-panel.test.ts`：固定现场采点页对离线队列组件的委托、类型化同步/重试/删除事件、样本详情、展开状态清理、日期/地点降级和无 API/IndexedDB 依赖边界。
- `admin-field-observation-review.test.ts`：固定现场采点距离计算、首条候选/可能双证据/已核验/替代提示、缺失候选、角色/距离阈值、审核状态与点位角色展示，并保证页面只消费解释结果。
- `admin-field-observation-queue-operations.test.ts`：固定现场观测提交/离线兜底、队列读取版本门禁、单条/批量互斥、部分失败与鉴权中止刷新、删除目标快照，以及 4xx 不进入离线队列的边界。
- `admin-field-observation-review-operations.test.ts`：固定现场观测审核的 pending/说明校验、全局操作互斥、批准首条与第二条证据/驳回提示、成功刷新清空、失败保留说明和鉴权委托边界。
- `admin-field-observation-catalog.test.ts`：固定地点/观测查询、缺坐标地点排序、初始选择、旧请求失效、越界分页、目录错误隔离，以及页面对防抖和请求版本的委托边界。
- `admin-field-observation-review-details.test.ts`：固定审核详情、地图、历史记录、说明模型、批准/驳回类型化事件、操作门禁、无请求副作用和页面按观测 ID 保留说明的组件边界。
- `admin-field-observation-review-list.test.ts`：固定审核筛选、列表行、分页、加载/空状态、详情插槽、五个类型化模型、搜索事件、无请求副作用、页面委托和浏览器可见性断言边界。
- `admin-field-observation-capture-entry.test.ts`：固定采点地点选择、会话锁、定位子组件、离线同步快捷入口、提交/同步事件、`markSubmitted` 转发、无定位/API/路由副作用、页面委托和浏览器可访问性边界。
- `admin-resource-presentation.test.ts`：固定通用资源数组/嵌套/无效响应、统计、嵌套路径与回退列、单元格/日期/记录元信息、字段布局/输入类型、统一请求错误和组件委托边界。
- `admin-resource-form.test.ts`：固定通用资源条件字段/分组、输入访问器、初始化/默认值、来源/JSON/日期/数字/选择规范化、嵌套 payload、必填顺序、地点坐标安全降级和组件委托边界。
- `admin-resource-catalog.test.ts`：固定通用资源搜索/筛选查询、筛选重置、旧资源请求失效、越界分页、普通/鉴权错误、初始化取消、页码夹取、composable 防抖/资源切换和组件委托边界。
- `admin-resource-operations.test.ts`：固定通用资源创建/编辑、必填阻断、重复保存、POST/PUT、发布/下架全局互斥、资源切换失效、普通/鉴权错误、删除目标快照/页码回退/失败保留和组件禁用/委托边界。
- `admin-resource-catalog-panel.test.ts`：固定通用资源目录面板统计/筛选/表格/分页展示、行操作事件、请求隔离和管理器组合边界，以及删除确认弹窗的最小权限边界。
- `admin-procedure-catalog-panel.test.ts`：固定办事流程目录面板筛选/表格/分页展示、行操作事件、请求隔离，以及删除确认弹窗与编辑弹窗壳的组合边界。
- `admin-resource-editor.test.ts`：固定通用资源编辑弹窗的动态字段、坐标选择、错误提示、类型化事件、请求/路由隔离和管理器委托边界。
- `seed-public-catalog.ts`：把首批官方来源、8 个新生指南、官方部门目录和社团目录幂等导入后台；默认只读预检，仅 `--apply` 写入。
- `seed-public-catalog.test.ts`：用临时 SQLite 验证目录导入的 dry-run、原子写入、幂等、人工冲突和发布证据约束。
- `verify-live-data-parity.ts`：只读验收当前 SQLite，核对 98 条来源、58 条公开内容、5 条流程、76 个高德草稿标点与管理员账号是否和前台种子/后台库一致。
- `import-amap-workmap.py`：审计高德工作地图 Excel，脱敏创建人字段，并生成全量空坐标模板；没有授权坐标和来源时拒绝生成地图 seed。
- `import-amap-drafts.ts`：严格校验已审计的 76 个高德文字标点，按原始行号与 WIA 码幂等导入 SQLite 待核验草稿；默认只预览，仅 `--apply` 写入。
- `import-amap-drafts.test.ts`：使用临时 SQLite 验证 dry-run、全量写入约束、幂等与冲突回滚。
- `import-amap-coordinates.ts`：把已人工审核的 WGS84 坐标子批次严格绑定到上述草稿；默认只读预检，仅 `--apply` 原子创建 `authorized-import` 待审核坐标观测，不直接改地点坐标或验证/发布状态，拒绝 GCJ-02/BD-09 和任何自动换算。
- `import-amap-coordinates.test.ts`：验证只读预检、待审观测写入、稳定 UUID 幂等、点位角色/精度/证据校验、`source_raw_ref` 审计快照、地点零修改与冲突整批回滚。
- `sync-osm-campus-boundary.ts`：从 OSM 公开 API 重建 relation 17685756 的三片候选校界，校验已审查范围并写入带 ODbL 元数据的 GeoJSON。
- `sync-osm-campus-boundary.test.ts` / `campus-map-reference.test.ts`：验证 GeoJSON 外环、许可元数据、官网平面图精确字节和 47 项图片相对热点不漂移、不混入地理坐标。
- `map-readiness.ts`：只读打开指定 SQLite，生成地点范围/发布/坐标状态、观测审核、正式来源覆盖、公开导航点、点位角色和双重核验证据覆盖的权威 JSON；只有显式严格模式会因发布阻断项返回非零。
- `map-readiness.test.ts`：验证完整就绪、报告模式、严格门禁、旧迁移能力降级、当前坐标证据绑定以及不存在数据库不被创建。
- `sync-place-source-links.ts`：按带事实边界的官方来源映射，只新增已审核的地点来源关联；默认只读，不修改地点事实、坐标、核验时间或发布状态。
- `sync-place-source-links.test.ts`：验证来源同步的只读预检、原子新增、幂等、来源降级与地点缺失冲突停止。
- `cleanup-feedback.ts`：按环境变量清理到期的反馈网络标识、可选联系方式与反馈记录。
- `check-source-links.ts`：以低并发、有限超时只读检查来源链接；不自动修改来源状态或下架内容。
- `discover-official-sources.ts`：通过学校首页公开搜索表单和 Webplus 搜索接口被动发现新生服务候选正文；匿名会话只保留在进程内，结果输出到标准输出，不自动入库或发布。
- `audit-amap-geocoding.ts`：使用本地 `AMAP_WEB_SERVICE_KEY` 调用高德官方地理编码，把 76 个 WIA 文字地点分成明确命名 POI、通用匹配、越界与无结果；报告写入 `.data`，不回写数据库，也不把地理编码候选当作原始 WIA 坐标。
- `extract-amap-sparse-list.ts`：从用户授权复制的 WIA `sparseList` 响应提取 76 个原始 GCJ-02 标点，按已审计 Excel 名称与行号严格绑定，拒绝缺失、重名、重复坐标和越界数据；响应原文与登录信息不进入仓库。

地图导入脚本支持 `--dry-run`，导入前输出错误行，不能静默覆盖已发布内容。SQLite 在线备份和本机隔离恢复校验已具备脚本与测试；异机加密副本、定时任务告警和生产恢复/回滚仍需在取得服务器信息后完成。

SQLite 一致性备份：

```bash
pnpm db:backup --database ./data/yeu.sqlite --output ./data/backups/yeu-20260715T212500.sqlite
```

命令不接受已有目标文件，也不允许输出到 `public/`、`.output/public/` 或 `storage/uploads/`。只有在线 backup 完成、`integrity_check` 与 `foreign_key_check` 通过并计算 SHA-256 后，临时文件才会原子改名为最终 `.sqlite`；同名 `.json` 记录字节数、哈希、迁移数和创建时间。备份包含管理员会话、反馈和其他生产数据，备份目录必须保持非公开、最小权限并进入异机加密复制流程。

生产监控命令：

```bash
pnpm ops:monitor \
  --health-url http://127.0.0.1:3000/api/health \
  --database /www/wwwroot/yeu/shared/data/yeu.sqlite \
  --backup-dir /www/wwwroot/yeu/shared/backups \
  --request-log /www/wwwroot/yeu/shared/logs/app-out.log \
  --state /www/wwwroot/yeu/shared/monitor/production-monitor-state.json
```

阈值和 HTTPS webhook 从 `NUXT_MONITOR_*` 环境变量读取。配置 `NUXT_MONITOR_REQUEST_LOG_PATH` 后，命令从结构化应用 stdout 日志的最后 4 MiB 统计时间窗内的 5xx、管理员登录 401 和 429；如果尾部不足以覆盖整个时间窗，会报告 `request_log_window_incomplete`，不能把不完整计数当成健康。输出只包含问题码、HTTP 状态和聚合容量/请求指标，不包含日志路径、数据库路径、站点查询串、请求 ID、Cookie、密码、联系方式或定位数据。没有 webhook 时仍以非零退出码向宝塔/cron 报告故障；配置 webhook 后，相同故障只在状态变化或提醒间隔到期时重发，恢复时发送一次 `recovery`。

公开目录导入用法：

```bash
# 默认只读，输出预计新增、跳过和冲突数量
pnpm db:seed:catalog

# 预检无冲突后才写入
pnpm db:seed:catalog --apply

# 指定已完成迁移的 SQLite
pnpm db:seed:catalog --database ./data/yeu.sqlite
```

脚本以来源规范化 URL、内容 `kind + slug` 识别记录，并把该 identity 写入导入标记，在单一事务中写入来源、内容及关联。重复运行保留标题、正文等后台人工校订；无来源的快递外卖、周边商铺指南保持草稿且不写最后核验时间。人工记录占用目标标识、导入记录被改 URL/kind/slug、发布证据关系漂移或标记异常时返回非零退出码，整批不写入。

真实库前后台一致性验收：

```bash
# 只读检查当前真实库，不写入、不迁移、不创建文件
pnpm data:verify:local

# 或显式指定数据库
pnpm data:verify --database .data/codex-map-content-20260713.sqlite

# 需要同时验收管理员账号时，显式传入账号和密码；输出只返回是否验证通过，不输出哈希
pnpm data:verify --database .data/codex-map-content-20260713.sqlite --admin-user lilei --admin-password <password>
```

该命令直接读取目标 SQLite：来源必须与 seed 当前标题、URL 和状态一致；公开指南/部门/社团必须与 seed 当前标题、摘要、正文和来源关系一致；流程必须与 `data/seeds/procedures.ts` 的标题、正文、状态、步骤数和材料数一致；76 个高德草稿地点必须保持 GCJ-02、draft、unverified，并与前台高德标点 seed 的行号、名称、WIA 码和经纬度一致。它用于交付前确认“前台看到的内容”和“后台能维护的数据”没有分叉。

已审核坐标入库用法：

```bash
# 必须先把 76 条文字草稿写入目标库
pnpm amap:drafts --apply --database ./data/yeu.sqlite

# 默认只读，输入可以是 76 点中的任意非空审核子批次
pnpm amap:coordinates --input ./data/imports/private/reviewed-wgs84.json --database ./data/yeu.sqlite

# 确认 wouldCreate / skipped / conflicts 后才显式创建待审核观测
pnpm amap:coordinates --apply --input ./data/imports/private/reviewed-wgs84.json --database ./data/yeu.sqlite
```

坐标文件必须逐项保留 `sourceRow + name + locationCode`，并提供数值型 WGS84 经纬度、`pointRole`、实测 `accuracyMeters`、证据说明、可空的 HTTP(S) 证据 URL、带时区的核验时间和枚举化核验人类别。脚本不接受个人姓名，不创建 `sources` 或 `place_sources`，不把证据宣称为校方来源。它不修改 `places` 的任何字段：地点经纬度、`coordinate_verification`、`coordinate_point_role`、`status`、`published_at`、`source_raw_ref` 都保持不变。原始 `source_raw_ref` 会连同输入指纹写入观测证据；只有后台正常审核与双证据流程能最终更新地点坐标。同一来源身份重跑不重复创建；如果坐标、角色、精度或证据发生变化，整批停止并返回冲突。

OSM 候选校界同步：

```bash
pnpm map:boundary:sync
pnpm map:data:test
```

同步脚本只处理公开 relation 17685756，保留 relation/way 版本、源更新时间、抓取日期和 ODbL 许可链接，并把三个闭合外环分别输出为 `MultiPolygon`。它不会产生任何建筑或入口点位；relation 范围变化时会停止，必须人工审查后再更新基线。

地图数据就绪审计：

```bash
# 默认只报告：即使存在阻断项也返回 0，便于获取完整 JSON
pnpm map:readiness --database ./.data/codex-map-content-20260713.sqlite

# 发布流水线使用严格门禁：JSON 中有任一 blocker 时返回 1
pnpm map:readiness --database ./data/yeu.sqlite --require-release-ready
```

命令始终以 SQLite `readonly + query_only` 打开已经存在的数据库，不执行迁移、不创建文件、不回写状态。`formalSourceCoverage` 同时报告任意正式关联、有效来源、有效官方来源和满足发布规则的来源；满足发布规则指有效的官方 A/B 级来源或有效的 C 级来源。严格门禁把所有未归档地点视为本次完整地图发布范围，并要求其已发布、事实与坐标核验时间有效、具备可发布来源、WGS84 坐标、点位角色，以及与当前坐标和角色一致的合格双重观测证据。旧库缺少 `coordinate_point_role` 或观测证据列时会显式报告 capability 不可用，严格模式不会把无法证明的记录当作就绪。

`docs/MAP_DATA_READINESS.md` 是便于现场执行的人工快照，不是实时发布依据。发布前必须对实际部署数据库重新运行本命令，并保存该次 JSON/退出码作为验收证据。

已核验地点来源关联：

```bash
# 默认只读，检查官网来源和地点名称是否仍能唯一匹配
pnpm map:sources:sync --database .data/codex-map-content-20260713.sqlite

# 复核 wouldInsert / coveredPlaces / conflicts 后才新增关联
pnpm map:sources:sync --apply --database .data/codex-map-content-20260713.sqlite
```

映射及每条证据的事实边界保存在 `data/seeds/place-source-links.ts`。脚本只接受有效的官方 A/B 级来源，只新增缺失的 `place_sources` 关系，不删除人工关系，也不修改地点正文、坐标、核验时间或发布状态。官网校园图文字索引只证明名称/别名，餐厅和创业园公告只证明各自明确写出的当前事实；这些关联不能替代现场入口采点或事实复核。

高德地理编码候选审计：

```bash
# .env 中配置服务器端 AMAP_WEB_SERVICE_KEY 后运行
pnpm map:geocode:audit
```

默认读取已审计 WIA 导出并写入 `.data/amap-geocode-audit.json`。脚本带请求节流和高德 `10021` 限流重试，不输出 Key。报告坐标系是 GCJ-02，明确名称命中也只是候选；通用匹配常把多栋楼合并到学校或道路中心点，禁止直接导入或发布。

官网候选来源发现：

```bash
# 默认复核校园卡、快递外卖、接站、社团招新、公交、录取通知书和迎新等关键词
pnpm sources:discover

# 可重复传入关键词，缩小某次复核范围
pnpm sources:discover --keyword 校园卡 --keyword "2026 新生 报到"
```

命令先从学校首页读取当前公开搜索表单，再按页面声明的 AJAX 接口查询；模板或接口变化时会返回非零，而不是静默生成空结果。输出包含检索时间、关键词总命中数、当前返回候选的标题、URL、发布时间、栏目和出处。它只解决“发现候选页面”，维护者仍须打开主管部门正文核对适用人群、年份和事实范围；搜索摘要、旧页面和零结果都不能直接改变公开内容状态。
