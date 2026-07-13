# Frontend feature boundaries

前台和后台按业务域放置组件、composable 与客户端状态：

- `map`：地图画布、筛选、点位卡片与后台选点。
- `guides`：文章型指南。
- `procedures`：结构化办事流程、材料与步骤。
- `organizations`：部门与社团。
- `search`：首版关键词搜索，后续 AI 检索从独立服务接入。
- `merchants`：商家资料；认领、优惠和推广在后续版本启用。
- `admin`：单管理员内容工作台。

跨域基础 UI 放在 `app/components`，前后端共享契约放在 `shared`。
