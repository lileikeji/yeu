# Database layer

业务阶段在此接入 Drizzle ORM 与 SQLite：

```text
server/database/
  client.ts          连接、WAL 与 foreign_keys 初始化
  schema.ts          当前 Drizzle 表定义
  migrate.ts         迁移执行器
  migrations/        只追加、进入版本控制的迁移文件
  admin-bootstrap.ts 单管理员初始化
```

种子数据放在 `data/seeds`，脱敏审计产物与导入模板放在 `data/imports`。生产数据库不得提交到 Git。
