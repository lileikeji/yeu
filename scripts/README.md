# Scripts

当前脚本按职责建立：

- `db-migrate.ts`：执行已提交的 Drizzle 迁移。
- `db-init.ts`：迁移数据库并幂等初始化单管理员。
- `admin-bootstrap.test.ts`：验证强制重置管理员密码时同步撤销全部旧会话。
- `db-check.ts`：执行 SQLite 完整性与外键检查。
- `hash-password.ts`：生成生产环境可配置的 `scrypt` 管理员密码哈希。
- `seed-public-catalog.ts`：把首批官方来源、6 个新生指南和官方部门目录幂等导入后台；默认只读预检，仅 `--apply` 写入。
- `seed-public-catalog.test.ts`：用临时 SQLite 验证目录导入的 dry-run、原子写入、幂等、人工冲突和发布证据约束。
- `import-amap-workmap.py`：审计高德工作地图 Excel，脱敏创建人字段，并生成全量空坐标模板；没有授权坐标和来源时拒绝生成地图 seed。
- `import-amap-drafts.ts`：严格校验已审计的 76 个高德文字标点，按原始行号与 WIA 码幂等导入 SQLite 待核验草稿；默认只预览，仅 `--apply` 写入。
- `import-amap-drafts.test.ts`：使用临时 SQLite 验证 dry-run、全量写入约束、幂等与冲突回滚。
- `import-amap-coordinates.ts`：把已人工审核的 WGS84 坐标子批次严格绑定到上述草稿；默认只读预检，仅 `--apply` 原子创建 `authorized-import` 待审核坐标观测，不直接改地点坐标或验证/发布状态，拒绝 GCJ-02/BD-09 和任何自动换算。
- `import-amap-coordinates.test.ts`：验证只读预检、待审观测写入、稳定 UUID 幂等、点位角色/精度/证据校验、`source_raw_ref` 审计快照、地点零修改与冲突整批回滚。
- `sync-osm-campus-boundary.ts`：从 OSM 公开 API 重建 relation 17685756 的三片候选校界，校验已审查范围并写入带 ODbL 元数据的 GeoJSON。
- `sync-osm-campus-boundary.test.ts` / `campus-map-reference.test.ts`：验证 GeoJSON 外环、许可元数据和官网平面图 47 项文字索引不漂移、不混入坐标。
- `map-readiness.ts`：只读打开指定 SQLite，生成地点范围/发布/坐标状态、观测审核、正式来源覆盖、公开导航点、点位角色和双重核验证据覆盖的权威 JSON；只有显式严格模式会因发布阻断项返回非零。
- `map-readiness.test.ts`：验证完整就绪、报告模式、严格门禁、旧迁移能力降级、当前坐标证据绑定以及不存在数据库不被创建。
- `cleanup-feedback.ts`：按环境变量清理到期的反馈网络标识、可选联系方式与反馈记录。
- `check-source-links.ts`：以低并发、有限超时只读检查来源链接；不自动修改来源状态或下架内容。

地图导入脚本支持 `--dry-run`，导入前输出错误行，不能静默覆盖已发布内容。数据库备份、恢复演练和来源链接检查仍需在取得生产服务器信息后补充。

公开目录导入用法：

```bash
# 默认只读，输出预计新增、跳过和冲突数量
pnpm db:seed:catalog

# 预检无冲突后才写入
pnpm db:seed:catalog -- --apply

# 指定已完成迁移的 SQLite
pnpm db:seed:catalog -- --database ./data/yeu.sqlite
```

脚本以来源规范化 URL、内容 `kind + slug` 识别记录，并把该 identity 写入导入标记，在单一事务中写入来源、内容及关联。重复运行保留标题、正文等后台人工校订；无来源的快递外卖、周边商铺指南保持草稿且不写最后核验时间。人工记录占用目标标识、导入记录被改 URL/kind/slug、发布证据关系漂移或标记异常时返回非零退出码，整批不写入。

已审核坐标入库用法：

```bash
# 必须先把 76 条文字草稿写入目标库
pnpm amap:drafts -- --apply --database ./data/yeu.sqlite

# 默认只读，输入可以是 76 点中的任意非空审核子批次
pnpm amap:coordinates -- --input ./data/imports/private/reviewed-wgs84.json --database ./data/yeu.sqlite

# 确认 wouldCreate / skipped / conflicts 后才显式创建待审核观测
pnpm amap:coordinates -- --apply --input ./data/imports/private/reviewed-wgs84.json --database ./data/yeu.sqlite
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
pnpm map:readiness -- --database ./.data/codex-map-content-20260713.sqlite

# 发布流水线使用严格门禁：JSON 中有任一 blocker 时返回 1
pnpm map:readiness -- --database ./data/yeu.sqlite --require-release-ready
```

命令始终以 SQLite `readonly + query_only` 打开已经存在的数据库，不执行迁移、不创建文件、不回写状态。`formalSourceCoverage` 同时报告任意正式关联、有效来源、有效官方来源和满足发布规则的来源；满足发布规则指有效的官方 A/B 级来源或有效的 C 级来源。严格门禁把所有未归档地点视为本次完整地图发布范围，并要求其已发布、事实与坐标核验时间有效、具备可发布来源、WGS84 坐标、点位角色，以及与当前坐标和角色一致的合格双重观测证据。旧库缺少 `coordinate_point_role` 或观测证据列时会显式报告 capability 不可用，严格模式不会把无法证明的记录当作就绪。

`docs/MAP_DATA_READINESS.md` 是便于现场执行的人工快照，不是实时发布依据。发布前必须对实际部署数据库重新运行本命令，并保存该次 JSON/退出码作为验收证据。
