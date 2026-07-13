# Server API

Nuxt Server Routes 的接口目录。业务阶段按 `public`、`admin`、`auth` 分组：

```text
server/api/
  public/       匿名可读接口
  admin/        内容管理接口，需要管理员会话
  auth/         管理员登录与退出
```

公开接口只返回 `published` 内容；草稿、来源备注与审计信息只允许后台读取。

结构化流程公开入口为 `GET /api/public/procedures` 和 `GET /api/public/procedures/:slug`。后台提供同名 `admin/procedures` 草稿 CRUD 及 `publish`/`unpublish` 操作；发布服务会校验连续步骤、有效来源、有效期和地点/部门关联，不能通过直接写 `status` 绕过。
