# 技术架构

> 状态：V0.1 已实现架构基线
> 适用范围：仰恩大学新生入学指南 v1 及其单人管理后台
> 更新规则：涉及运行时、数据库、地图供应商或部署拓扑的变更，应同步更新本文并记录原因。

## 1. 目标与约束

系统首版面向本科与专升本新生，核心是可核验的校园地图与入学办事信息。技术方案需要满足：

- 一个小团队可以低成本开发、维护和部署；
- 同一套代码提供公开前台、管理后台和 API；
- 支持手机浏览器、PWA 安装和微信内置浏览器；
- 地图供应商可替换，业务数据不依赖某一家地图 SDK；
- 内容有来源、核验时间、发布状态和纠错闭环；
- 首版不做学生账号、AI 问答、商户认领或推广投放，但为这些能力保留清晰边界；
- 可部署到宝塔 Linux 服务器，初期使用单机 SQLite，避免不必要的运维复杂度。

## 2. 架构决策

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| 应用形态 | Nuxt 4 全栈单体（SSR/混合渲染 + Nitro API） | 前后台共享类型和发布流程，部署单元少 |
| UI | Nuxt UI + TypeScript | 与现有脚手架一致，保证移动端组件可访问性和类型约束 |
| 数据访问 | Drizzle ORM + SQLite | 首版数据量和单人写入适合单机数据库，迁移可审计 |
| 地图 | `MapProvider` 适配层 | 页面和业务模型不直接依赖高德或 MapLibre SDK |
| 开发地图 | MapLibre GL JS + OSM 兼容底图，仅开发和低流量预览 | 无需生产密钥，便于本地联调；不得把公共 OSM 瓦片当作正式生产 CDN |
| 生产地图 | 高德地图 JavaScript API 2.0 | 国内访问和 GCJ-02 展示、地点及导航生态更合适 |
| 进程 | Node.js 单实例 + PM2，Nginx 反向代理 | SQLite 写入约束清楚，宝塔易管理 |
| 静态资源 | Nuxt 构建资源长缓存；上传文件放共享目录 | 发布版本可回滚，用户上传不随代码发布丢失 |
| PWA | V1 仅预缓存断网说明页及必要 CSS/图标/字体，不预缓存 JS；页面导航和内容 API 使用 `NetworkOnly` | 避免缓存地图/后台代码或把强时效内容当作最新事实 |

当前仓库已实现 Nuxt/Nuxt UI 前台、MapLibre 开发预览、高德 JS API 2.0 生产 provider、Drizzle/SQLite 数据层、单管理员认证、公开与后台 API、反馈入口及 PWA 断网回退。高德 provider 仍需使用正式域名 Key 完成多设备验收；真实坐标核验、批量内容发布和服务器部署仍属于后续工作，任何候选或未核验坐标都不能作为正式导航数据。

## 3. 运行拓扑

```text
手机浏览器 / 微信内浏览器 / 已安装 PWA
                  |
               HTTPS
                  v
          Nginx（TLS、压缩、静态缓存）
                  |
          127.0.0.1:3000
                  v
       Nuxt 4 / Nitro 单实例（PM2）
          |                    |
          v                    v
  SQLite + Drizzle       地图供应商前端 SDK
  共享 data 目录        开发 MapLibre / 生产高德
          |
          v
  共享 uploads 与备份目录
```

公开页面可以按内容特征选择 SSR、预渲染或客户端加载。地图页必须在客户端初始化 SDK；内容详情应保留可被搜索引擎和微信预览读取的 SSR 文本。管理接口始终动态执行且禁止被 CDN 或 Service Worker 缓存。

## 4. 建议目录与职责

```text
app/
  assets/css/                 全局样式与移动端安全区变量
  components/                 跨业务域的基础 UI
  composables/                API 调用、筛选、定位、PWA 状态
  features/                   map、guides、procedures、organizations 等业务域
  layouts/                    public 与 admin 布局
  middleware/                 页面级访问控制；非服务端安全边界
  pages/                      前台和 /admin 页面入口
  plugins/
    map.client.ts             按配置加载地图适配器
    pwa.client.ts             安装提示、更新状态与降级处理
server/
  api/
    public/                   仅返回 published 内容
    admin/                    受保护的增删改、发布、核验接口
    health.get.ts             进程与数据库健康检查
  middleware/                管理员会话、CSRF、请求追踪
  modules/                   content、places、verification 等服务端业务域
  database/
    client.ts                 SQLite 连接、WAL、外键与 busy_timeout
    schema.ts                 当前 Drizzle schema
    migrations/              已提交的版本化迁移
    migrate.ts               迁移执行器
  utils/                     鉴权、安全、校验、序列化与审计
shared/
  types.ts                   客户端和服务端共享的纯类型
  schemas/                   请求/响应运行时校验规则
  constants/                 状态、坐标系、来源等级等枚举
map/
  core/                      provider 契约与地图 DTO
  providers/                 MapLibre 开发适配器与高德生产适配器
data/
  seeds/                    最小开发数据与来源记录
  imports/                  带坐标系声明的导入模板
  backups/                  本地数据库备份（Git 忽略）
public/
  icons/                     PWA 图标
  site.webmanifest           由 @vite-pwa/nuxt 在构建时生成
scripts/                     初始化、导入、校验和一次性维护脚本
docs/                        产品、架构、数据、内容和部署文档
```

依赖方向固定为：

```text
pages/components -> composables -> HTTP API
HTTP API -> modules -> database queries -> database client
shared <- app 与 server（shared 不反向依赖 Nuxt、Node 或地图 SDK）
```

禁止事项：页面组件直接导入数据库；API handler 内堆积发布规则；业务实体暴露地图 SDK 对象；共享类型读取运行时环境变量。

## 5. 领域边界

### 5.1 内容目录

包括地点、指南、办事流程、部门、社团、分类、媒体和来源。所有公开查询默认追加 `status = published`；草稿、归档和内部备注不得出现在公开响应中。

### 5.2 地图

地点是内容实体，坐标是可核验的独立记录，地图图层/面/线是空间展示实体。地图模块只接收标准化 DTO，不读取编辑器表单或数据库行。

建议的前端适配器最小契约：

```ts
type CoordinateSystem = 'WGS84' | 'GCJ-02' | 'BD-09'

interface MapProvider {
  mount(element: HTMLElement, options?: MapMountOptions): Promise<void>
  setPois(pois: MapPoi[]): void
  setAreas(areas: MapArea[]): void
  fitToPois(): void
  planWalkingRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteSummary>
  clearRoute(): void
  enablePointPicker(handler: (point: GeoPoint) => void): void
  destroy(): void
}
```

业务代码只使用 `GeoPoint { lng, lat, crs }`。转换必须经过明确函数并记录源坐标系、目标坐标系和算法版本；禁止按“看起来像国内坐标”猜测坐标系。生产高德适配器只接收 GCJ-02，其他坐标由导入/服务层转换后再传入。

地点搜索和外部导航链接属于独立服务。网页内路线会直接操作供应商覆盖物，因此通过 provider 的可选能力边界实现；高德适配器接入步行路线，MapLibre 预览适配器明确返回“不支持”。区域只有取得真实路径顶点后才绘制，`sparseList` 的包围框仅作审核元数据，不得冒充原始多边形。高德区域使用闭合折线而非填充 Polygon，区域标签禁用点击，避免遮挡学生街等范围内的高德原生商铺热点。

MapLibre/OSM 仅用于开发和低流量预览。使用 `tile.openstreetmap.org` 时必须保留署名、遵守 Tile Usage Policy，不做预抓取或离线打包；正式生产应使用高德或有明确服务协议的瓦片服务。

### 5.3 管理后台

首版只有一名管理员，但仍须有独立的管理员认证、会话、审计日志和发布确认。这里的“首版不做账号”指不做学生/公众账号，不代表后台可以无认证。

管理操作至少分为：保存草稿、预览、发布、下线、标记已核验、处理纠错。删除默认采用归档；真正清除媒体或记录应是单独且可审计的动作。

### 5.4 未来能力的预留边界

- **AI 检索**：未来只通过 `SearchProvider`/`AnswerProvider` 读取已发布内容及来源，不允许模型直接访问管理表或绕过发布状态。回答必须携带内容 ID、来源和核验时间。首版不建向量索引。
- **学生账号**：首版收藏、清单和最近浏览只存浏览器本地。未来身份模块通过稳定的内容 ID 关联，不把用户字段提前塞入内容表。
- **商户能力**：商铺仍是普通地点；未来的商户主体、认领申请、优惠和推广订单放在独立商业域。自然内容和付费推广的排序及展示字段必须分离。

## 6. API 约定

- 公开 API 前缀：`/api/public`；后台 API 前缀：`/api/admin`。
- 使用 JSON，字段使用 `camelCase`，时间使用带时区的 ISO 8601 字符串，对外坐标始终同时返回 `coordinateSystem`。
- 列表统一返回 `{ items, total, page, pageSize }`；参数设置硬上限，避免一次加载全部地图详情。
- 变更接口执行运行时校验，不信任 TypeScript 类型；失败采用稳定错误码，不把数据库错误或堆栈返回客户端。
- 公开详情可使用 `ETag`/`Last-Modified`；发布、下线或核验后使对应缓存失效。
- 管理接口和带纠错内容的接口设置 `Cache-Control: no-store`。
- 批量导入采用“解析 -> 校验报告 -> 人工确认 -> 事务写入”，不得上传文件后直接发布。

## 7. 渲染、PWA 与微信适配

### 7.1 渲染策略

- 首页、指南、流程、部门和社团详情优先 SSR 或按发布事件再生成；
- 地图页 SSR 输出标题、筛选和地点摘要，地图画布在客户端挂载，避免服务端访问 `window`；
- 后台始终动态渲染并关闭索引；
- 只有稳定、不依赖数据库的页面才在构建时预渲染，避免“数据库更新但页面仍旧”的双重事实来源。

### 7.2 PWA 缓存

- 当前首版只预缓存 `/offline.html` 及其必要 CSS、图标和字体；不预缓存 JavaScript，避免把 MapLibre SDK、后台 chunks 或其他在线功能代码带入离线缓存；
- 页面导航和公开内容 API 保持 `NetworkOnly`，避免把强时效内容静默当作最新数据；
- 后续如缓存已发布内容 API，必须使用有限时长的 `NetworkFirst`，并显示离线状态和缓存时间；
- 地图 SDK、地图瓦片、地理编码结果和导航链接不纳入自建离线包，除非供应商条款明确允许；
- `/admin` 导航、所有 `/api/**`、会话、纠错提交和任何写请求不生成离线响应；
- Service Worker 更新要显示可操作的刷新提示，不能静默长期运行旧数据结构。

### 7.3 微信内浏览器

- 以触屏和窄屏为第一布局，处理 `env(safe-area-inset-*)`；
- 不依赖弹窗、新标签页或浏览器原生安装提示完成核心流程；导航链接提供可复制地址和外部地图兜底；
- 分享卡片依赖 SSR 的标题、摘要和图片。未接入认证公众号前，不假设微信 JS-SDK 可用；
- 检查微信对定位权限、跨域、文件下载、返回栈和 Service Worker 的差异；PWA 安装只作为增强，不作为访问前提。

## 8. 安全与隐私

- 全站 HTTPS，生产 Cookie 使用 `Secure`、`HttpOnly`、`SameSite=Lax/Strict`；会话密钥只放服务器环境变量。
- 管理员密码使用 Node.js `crypto.scrypt` 慢哈希（独立随机盐、固定参数版本），绝不写入仓库或可公开的 Nuxt runtime config；后续如迁移算法，必须兼容旧哈希并完成受控重算。
- 管理变更接口校验会话与 CSRF；登录、纠错和搜索接口按 IP/会话限流。
- 管理后台采用最小权限；数据库与上传目录不放在 Nginx 可直接列目录的位置。
- 富文本使用受限结构化格式或服务端白名单净化，禁止直接渲染未经处理的 HTML。
- 上传校验 MIME、扩展名、尺寸和像素上限，生成随机文件名；SVG 默认不接受，避免脚本载荷。
- 日志不记录密码、Cookie、完整会话、精确个人定位或未公开联系方式；请求 ID 用于关联错误。
- 前台定位只在用户主动点击时请求，默认在设备内用于视野/距离计算，不持久化到服务器。
- 地图 Key 使用域名白名单和配额告警。高德 JS 安全密钥会下发到浏览器，不应被当作真正服务端秘密；服务端 Web Service Key 必须单独保存。

## 9. 性能与可靠性

- 地图初次只返回视野/筛选所需的轻量标点，详情按需加载；大量标点采用聚合和边界框查询。
- 图片生成多尺寸 WebP/AVIF 与合理占位，保留原图只供后台；首屏不加载不可见详情图。
- SQLite 启用 WAL、外键和 `busy_timeout`；PM2 固定单实例，不使用 cluster 模式并发写入。
- 所有写入用短事务，媒体文件先安全落盘再提交引用，失败时清理孤儿文件。
- 健康检查区分进程存活与数据库可读；外部地图不可用时内容列表和文字地址仍应可用。
- 结构化日志至少包含时间、级别、请求 ID、路由、状态码和耗时；错误日志设置轮转与磁盘告警。

## 10. 架构验收要点

- [ ] 前台、后台和 API 由一个 Nuxt/Nitro 部署单元运行，后台接口有真实服务端认证。
- [ ] 页面/组件不直接访问 Drizzle，服务层和仓储层边界可从导入关系验证。
- [ ] 同一组地点可在 MapLibre 开发适配器和高德生产适配器展示，无业务页面分支。
- [ ] 所有点、线、面数据显式携带 WGS84、GCJ-02 或 BD-09；转换可追溯。
- [ ] 公开 API 不返回草稿、内部备注、管理员信息或未审联系方式。
- [ ] PWA 离线导航进入 `/offline.html`，明确提示地图和最新内容不可用；不返回后台、API 或旧正文缓存。
- [ ] 微信内浏览器完成查地点、看详情、查看报到流程和打开导航的主路径。
- [ ] SQLite 以单实例运行，迁移、备份、恢复和回滚流程按 `DEPLOYMENT.md` 演练通过。
- [ ] 地图供应商失败不会阻断文字指南；健康检查和日志能定位故障。
