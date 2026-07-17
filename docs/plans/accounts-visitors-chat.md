# 账号 · 访客 · 群聊 实施方案

状态：已完成并持续加固（2026-07-18）。不登录不能聊天；迁移已部署；E2E 通过；已补页面路由中间件与 SSR 会话读取。
约束：不登录也能用指南；**不登录不能聊天**；暂不开放注册；管理员入口隐藏。

## 模块

1. 访客：IP / 地点 / 操作埋点；后台列表与封禁
2. 账号：后台开号；登录；个人中心（显示名、专业、宿舍楼联想）
3. 群聊：公共群 + 宿舍群；消息入库；后台可视化与禁言

## 技术

- SQLite + Drizzle 新表（visitors / events / bans / users / sessions / chat_*）
- 用户会话 cookie 与管理员分离
- 聊天：HTTP 发消息 + 短轮询拉新（适配 4C4G）
- 宿舍建议：places.category = dorm

## 页面

- 前台：`/login` `/me` `/chat`
- 后台：`/admin/visitors` `/admin/users` `/admin/chat`

## 硬规则

- 所有 `/api/chat/*` 与聊天页需用户登录
- 无 public register API
- 封禁命中后公共 API / 页面拒绝访问


## 上线验证

- 生产站点: https://yeu.huiliyill.cn
- 发布目录: /www/wwwroot/yeu/releases/20260718-045910
- guest /api/chat/* /api/me => 401
- admin 开号 / 用户登录 / 发消息 / 宿舍群 / 全员与个人禁言 / 访客埋点与 IP 封禁：已用服务器 curl E2E 验证
- 无 public register；前台无管理入口
- 中文 UI（login/me/chat/admin）正常


## 机制加固（2026-07-18 续）

- 前端：`app/middleware/auth.ts` 保护 `/chat`、`/me`（未登录跳转 `/login?redirect=...`）
- 会话：`useUserSession` 在 SSR 使用 `useRequestFetch` 转发 Cookie，避免已登录用户硬刷新误跳登录
- 登录页：根据 redirect 展示「群聊/个人中心需要登录」提示
- API 第二道闸：`requireUserSession` 仍强制 `/api/chat/*`、`/api/me/*` 401
- 群聊 UI：全员禁言时禁用输入与发送
- 访客埋点外网 curl 403 为 `assertTrustedOrigin` 预期行为；浏览器同源 POST 正常

## 机制加固（2026-07-18 再续 · 不登录不能聊天）

- Nitro：`server/middleware/require-user-pages.ts` 对访客访问 `/chat`、`/me` 直接 **302** → `/login?redirect=...`（SSR/硬刷新也生效）
- Nuxt：`app/middleware/auth.ts` 使用 `redirectCode: 302`，覆盖客户端路由跳转
- API：`/api/chat/*`、`/api/me` 仍 401
- 访客仍可正常使用指南、地图、办事等公开功能

## 机制加固（2026-07-18 终验 · 不登录不能聊天）

- 发布: /www/wwwroot/yeu/releases/20260718-061629 · git `9c5508d`
- Nitro 私有页增加 `Cache-Control: private, no-store` / `CDN-Cache-Control: no-store`，避免 CDN 缓存访客 302 或已登录 HTML
- 现网 E2E（origin + 公网 HTTPS）: 访客页 302、API 401、无注册、公开页 200；登录后 /chat /me 200；发消息 201；全员禁言 403；错误 CSRF 清会话；禁用账号后页 302 / API 401；首页无 /admin /chat 泄漏
- 前台布局：未登录只显示登录入口，群聊入口仅登录后可见
