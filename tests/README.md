# Tests

```text
tests/
  unit/          坐标、导航链接、内容状态等纯逻辑
  integration/   API、数据库迁移与权限边界
  e2e/           手机端地图、搜索、指南与后台主流程
```

地图 SDK 在单元和集成测试中使用 provider fake；真实地图只在受控端到端环境验证。
