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

`seeds/procedures.ts` 保存首批结构化流程。先完成公开目录入库，再使用默认只读的 `pnpm db:seed:procedures` 预检，以 `pnpm db:seed:procedures --apply` 明确应用。流程种子只更新带自身所有权标记的记录；同 slug 人工记录会使整次操作停止。当前首批流程覆盖 2026 级报到、校园网与统一认证、宿舍维修报修、图书馆借阅证/微信绑定和专升本学生档案邮寄；未取得当年来源的个人时段、材料、报到点、接站、缴费和招新安排保持待通知或不建流程。

`seeds/osm-campus-boundary.json` 是 OSM relation 17685756 的派生 `MultiPolygon`，遵循 ODbL 1.0 并保留来源、版本与许可链接；它只表示社区测绘的候选校界。`seeds/preview-places.ts` 保存学校官网平面图的 47 项编号索引，不包含坐标；`seeds/official-campus-plan-anchors.ts` 只保存原图百分比热点。`seeds/official-campus-plan-reference.ts` 登记官网原页、资源 URL、本地快照路径、8504×3898 尺寸、1,250,742 字节和 SHA-256。按维护者当前要求，已核验原图快照恢复到产品中；OSM 候选校界、图片热点和文字编号都不能作为楼栋入口或导航点证据，正式公开授权仍须发布前确认。
