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
- `import-amap-coordinates.ts`：把已人工审核的 WGS84 坐标子批次严格绑定到上述草稿；默认只读预检，仅 `--apply` 原子更新，拒绝 GCJ-02/BD-09 和任何自动换算。
- `import-amap-coordinates.test.ts`：验证只读预检、子批次写入、幂等、紧范围校验、证据字段、身份漂移、人工改动与发布冲突的整批回滚。
- `sync-osm-campus-boundary.ts`：从 OSM 公开 API 重建 relation 17685756 的三片候选校界，校验已审查范围并写入带 ODbL 元数据的 GeoJSON。
- `sync-osm-campus-boundary.test.ts` / `campus-map-reference.test.ts`：验证 GeoJSON 外环、许可元数据和官网平面图 47 项文字索引不漂移、不混入坐标。
- `cleanup-feedback.ts`：按环境变量清理到期的反馈网络标识、可选联系方式与反馈记录。

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

# 确认 wouldUpdate / skipped / conflicts 后才显式写入
pnpm amap:coordinates -- --apply --input ./data/imports/private/reviewed-wgs84.json --database ./data/yeu.sqlite
```

坐标文件必须逐项保留 `sourceRow + name + locationCode`，并提供数值型 WGS84 经纬度、证据说明、可空的 HTTP(S) 证据 URL、带时区的核验时间和枚举化核验人类别。脚本不接受个人姓名，不创建 `sources` 或 `place_sources`，不把证据宣称为校方来源，也不会修改 `status`、`published_at` 或内容核验时间。目标草稿若已人工编辑、关联来源、改过坐标或发布，整批停止并返回冲突；不要用数据库手工改值绕过冲突。

OSM 候选校界同步：

```bash
pnpm map:boundary:sync
pnpm map:data:test
```

同步脚本只处理公开 relation 17685756，保留 relation/way 版本、源更新时间、抓取日期和 ODbL 许可链接，并把三个闭合外环分别输出为 `MultiPolygon`。它不会产生任何建筑或入口点位；relation 范围变化时会停止，必须人工审查后再更新基线。
