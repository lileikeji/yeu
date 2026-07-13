# Server modules

服务端业务模块不直接依赖页面：

- `content`：发布状态、修订与关联内容。
- `places`：地点、坐标与地图筛选。
- `verification`：来源、核验和过期提醒。
- `search`：当前使用 SQLite `LIKE` 完成小规模普通关键词检索；数据量增长后可迁移到 FTS5，未来 AI 检索从独立接口接入。

`media` 与 `merchants` 仍是后续模块边界，当前目录没有实现媒体库、商家认领或推广能力，前台也不展示这些入口。

Server Route 只负责鉴权、输入校验和响应转换，业务规则放在对应模块。
