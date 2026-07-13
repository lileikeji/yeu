# Local data

本目录用于本地 SQLite、种子与数据导入模板。数据库迁移统一位于 `server/database/migrations`。除说明和脱敏样例外，运行数据不提交到 Git。

```text
data/
  seeds/        最小开发数据与来源记录
  imports/      CSV/JSON 导入模板
  backups/      本地备份（Git 忽略）
```

地图导入文件必须为每个坐标声明 `WGS84`、`GCJ-02` 或 `BD-09`，并记录来源 URL 与核验日期。

`seeds/public-content.ts` 同时提供前台静态回退。需要在后台维护这些公开来源、指南和部门时，使用默认只读的 `pnpm db:seed:catalog` 预检，再以 `--apply` 明确入库；该步骤不属于数据库迁移，也不会自动覆盖人工记录。

`seeds/procedures.ts` 保存首批结构化流程。先完成公开目录入库，再使用默认只读的 `pnpm db:seed:procedures` 预检，以 `pnpm db:seed:procedures -- --apply` 明确应用。流程种子只更新带自身所有权标记的记录；同 slug 人工记录会使整次操作停止。当前报到流程只录入 2026 官方来源可确认的日期、校址和咨询边界，个人时段、材料、报到点及接站安排保持待通知。

`seeds/osm-campus-boundary.json` 是 OSM relation 17685756 的派生 `MultiPolygon`，遵循 ODbL 1.0 并保留来源、版本与许可链接；它只表示社区测绘的候选校界。`seeds/preview-places.ts` 保存学校官网平面图的 47 项纯文字编号索引，不包含坐标，也不打包官网图片。二者都不能作为楼栋入口或导航点证据。
