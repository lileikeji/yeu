# 账号 · 访客 · 群聊 实施方案

状态：已完成（不登录不能聊天；待服务器迁移部署）  
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
