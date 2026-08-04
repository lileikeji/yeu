# 技术架构

> 状态：当前架构基线（2026-08-04）
> 适用范围：迎新指南的公开前台、管理后台、知识库/AI 检索、社团与部门、聊天和消息接入
> 事实原则：已实现、已验证、已部署和计划中的内容必须分开表述；实现行为以代码和迁移为准，线上状态以健康检查为准。
> 更新规则：涉及运行时、数据库、地图供应商、检索流程、缓存、权限或部署拓扑的变更，应同步更新本文并在 [任务复盘规则库](./rules/TASK_COMPLETION_REVIEW.md) 记录原因和验证结果。

## 1. 目标与约束

系统首版面向本科与专升本新生，核心是可核验的校园地图与入学办事信息。技术方案需要满足：

- 一个小团队可以低成本开发、维护和部署；
- 同一套代码提供公开前台、管理后台和 API；
- 支持手机浏览器、PWA 安装和微信内置浏览器；
- 地图供应商可替换，业务数据不依赖某一家地图 SDK；
- 内容有来源、核验时间、发布状态和纠错闭环；
- 学生账号、AI 检索、聊天和机器人接入均已具备独立边界；未开放或未验证的能力不得伪装成已上线功能；
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
| 进程 | Node.js 单实例 + `systemd yeu.service`，Nginx 反向代理 | SQLite 写入约束清楚，服务可随系统恢复；禁止用 PM2 与 systemd 同时守护同一端口 |
| 静态资源 | Nuxt 构建资源长缓存；上传文件放共享目录；可复用宣传成品放在 `public/images/posters` | 发布版本可回滚，用户上传不随代码发布丢失，生成中间稿不进入正式资源目录 |
| PWA | V1 仅预缓存断网说明页及必要 CSS/图标/字体，不预缓存 JS；页面导航和内容 API 使用 `NetworkOnly` | 避免缓存地图/后台代码或把强时效内容当作最新事实 |
| AI 与知识 | `server/modules/assistant` 统一编排系统 API、内置知识、回答缓存、网页缓存/搜索和可选 MCP；`server/modules/knowledge` 负责文档、实体、声明、来源和审核 | 先走低成本、可审计的站内路径，证据不足时再降级；不允许模型绕过发布和审核状态 |
| 集成服务 | QQ OneBot、WeChatPadPro 中转、微信公众平台回调作为独立 relay/service | 外部账号故障不应拖垮主站；每个接入有独立密钥、限流、日志和重启边界 |

当前仓库已实现 Nuxt/Nuxt UI 前台、MapLibre 开发预览、高德 JS API 2.0 生产 provider、微信/QQ 内嵌环境兼容 provider、Drizzle/SQLite 数据层、管理员与学生账号、内容/公告/社团/部门/聊天/访客/反馈 API、知识库和 AI 检索、地图/全景/路线、PWA 断网回退及独立机器人 relay。生产发布采用只读 release、`current` 软链接和 `shared` 持久化目录，由 `systemd yeu.service` 启动 `.output/server/index.mjs`；Nginx 反向代理公开页面和 API，CDN 只缓存允许缓存的公开页面/静态资源，管理接口、会话、聊天写入和 AI 流式响应明确绕过缓存，数据库、环境变量、上传和日志留在 shared。AI 运行时由 `assistantRuns` 记录检索路径、耗时、成功状态和请求标识；知识库文档、声明、实体和冲突通过审核状态控制是否可用于公开回答。任何候选坐标、未审核抓取结果、外部网页或未验证集成都不能当作正式事实。

生产唯一公开入口为 `https://yx.huiliyill.cn`。旧 `yeu`、`cn.yeu` 和 `global.yeu` 三线路不再参与客户端探测、跳转、微信分享签名、机器人尾链或允许来源校验；CDN 和源站必须把 `yx.huiliyill.cn` 作为唯一 Host。内置浏览器地图降级使用 CSS 底层与结构化地点坐标，不公开分发学校官网平面图。

`https://doc.sourl.cc/jkyxfu` 是独立维护的即链静态内容镜像，只承载人工同步后的新生清单、办事说明、图片和公开来源链接，不连接迎新指南数据库、动态 API、管理员权限或 AI 检索。即链图片使用其租户 COS/CDN；宿舍视频等暂不支持上传的媒体只保留明确标注的资源链接。正文弹层只承载文字与图片，不显示 Markdown 超链接、`访问地址` 或裸网址；主站待办、地图、交通、报到、专业、规则和 AI 问答由“迎新指南功能”模块使用即链原生 `link` 动作承载，外部资源由“直接打开”模块承载，两者均设置 `open_in_new_tab=false`，避免依赖正文文本选择或新窗口。顶部轮播只使用校园实景或真实校园活动图片，不使用宣传海报；每张轮播使用 `content` 动作，并在弹层底部展示同一份联系二维码。“专业与住宿片区”镜像当前按 `data/major-profiles.ts` 的 26 个专业、10 个学院、15 个新区专业和 11 个旧区专业人工同步，并单独保留舒适型楼栋参考与非官方分区提示。主站数据变更不会自动同步到该镜像，发布前必须人工复核时间、收费、住宿和政策内容；即链保存必须基于最新草稿修订号增量合并，发布后再次核对草稿与线上修订号一致。

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
        Nuxt 4 / Nitro 单实例（systemd yeu.service）
          |                    |
          v                    v
  SQLite + Drizzle       地图供应商前端 SDK
  共享 data 目录        开发 MapLibre / 生产高德
          |
          v
  共享 uploads、日志、监控与备份目录
```

公开页面可以按内容特征选择 SSR、预渲染或客户端加载。地图页必须在客户端初始化 SDK；内容详情、公告详情和分享入口应保留可被搜索引擎和微信预览读取的 SSR 文本。管理接口、登录会话、聊天写入、访客追踪和 AI 流式响应始终动态执行，禁止被 CDN 或 Service Worker 缓存。发布时先构建新 release，再原子切换 `current`，最后重启 `yeu.service`；旧 release 保留到健康检查和回滚窗口结束。

公告由 `contents(kind='notice')` 统一维护，`metadata.pinned` 控制置顶、`metadata.sortOrder` 控制可选的手动顺序（未填写时按发布时间倒序）、`metadata.validFrom/validUntil` 控制可见时间、`metadata.autoPopup` 控制用户进入公开站点时是否自动打开第一条启用弹出的公告。打开详情会写入 `notice_confirm` 访客事件；公告被编辑后，旧版本的已读事件不会阻止新版本再次提示。前台公告中心据此显示未读数和阅读人数；从列表进入详情时关闭回到列表，自动弹出的公告关闭后结束弹窗；自动弹出只在客户端挂载并等待数据水合后执行，避免 SSR 阻塞页面。组织管理员进入 `/admin/organization` 时显示一次新域名提醒，可复制 `https://yx.huiliyill.cn/admin/organization`；旧域名的请求（包括 `/admin` 路径）只执行 301 跳转，不渲染旧后台。

## 4. 建议目录与职责

```text
app/
  assets/css/                 全局样式与移动端安全区变量
  components/                 跨业务域的基础 UI
    map/                      地图展示面板；只通过类型化 props/events 与页面编排层交互
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
  modules/                   按领域拆分的服务：content、places、procedures、knowledge、assistant、notices、visitors、users、chat、bots、wechat 等
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
  providers/                 MapLibre、高德和微信/QQ 离线兼容适配器
data/
  seeds/                    最小开发数据与来源记录
  imports/                  带坐标系声明的导入模板
  backups/                  本地数据库备份（Git 忽略）
public/
  icons/                     PWA 图标
  site.webmanifest           由 @vite-pwa/nuxt 在构建时生成
scripts/                     初始化、导入、校验和一次性维护脚本
ops/
  systemd/                   yeu 主服务、清理任务、QQ/微信 relay 和知识抓取服务
  nginx/                     反向代理、流式响应、可信客户端 IP 与上传边界
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
  setDisplayOptions(options: MapDisplayOptions): void
  setBaseStyle(style: 'standard' | 'satellite'): boolean
  fitToPois(): void
  planWalkingRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteSummary>
  clearRoute(): void
  enablePointPicker(handler: (point: GeoPoint) => void): void
  destroy(): void
}
```

业务代码只使用 `GeoPoint { lng, lat, crs }`。转换必须经过明确函数并记录源坐标系、目标坐标系和算法版本；禁止按“看起来像国内坐标”猜测坐标系。生产高德适配器只接收 GCJ-02，其他坐标由导入/服务层转换后再传入。

地点搜索和外部导航链接属于独立服务。网页内路线、标准/卫星底图和显示选项会直接操作供应商覆盖物，因此通过 provider 能力边界实现；高德适配器完整支持，MapLibre 预览适配器对不支持的卫星能力明确返回 `false`。区域只有取得真实路径顶点后才绘制，`sparseList` 的包围框仅作审核元数据，不得冒充原始多边形。高德区域使用闭合折线而非填充 Polygon，区域标签禁用点击，避免遮挡学生街等范围内的高德原生商铺热点。

地图页面是跨模块业务状态的编排层：页面持有搜索输入、选点、provider 引用以及路线、原生搜索和 URL 同步之间的协作状态，但不再直接创建或挂载 provider。搜索词规范化、教学楼别名、地点/区域文本匹配等无副作用规则放在 `app/utils/map-search.ts`。图层显示设置和地点详情等纯展示界面放在 `app/components/map/`，通过类型化 props 和事件请求页面变更状态，不直接创建 provider、读取路由、访问剪贴板或持有地图 SDK 对象。`MapDisplaySettingsPanel`、`PlaceDetailsPanel` 与 `map-search.ts` 已按该规则拆出；详情组件用 `desktop` / `mobile` 变体复用同一数据契约，页面继续负责详情/纠错链接、复制和关闭后的状态同步。

浏览器定位与网页内步行路线由 `useMapGeolocation` 编排：composable 接收当前 provider 引用、provider ID 和通知函数，持有定位/路线状态并处理用户可见错误；`app/utils/map-geolocation.ts` 负责无 Vue 依赖的定位 Promise、显式 WGS84 起点转换、超时参数、路线摘要格式和 provider 路线调用。页面不得直接访问 `navigator.geolocation`，纯工具不得读取 Vue 状态或路由。

高德当前视野原生搜索由 `useMapNativeSearch` 编排：composable 负责 320 ms 防抖、loading、失败归零和卸载取消，并使用纯工具提供的最新请求门禁；`app/utils/map-native-search.ts` 负责请求版本状态机、把供应商 `MapPoi` 转为仅会话可用、GCJ-02、非发布的 `PublicMapPlace`，以及按规范化名称、地址和目录搜索文本排除正式目录重复项。页面决定触发时机、自动选中和临时详情保留，但不得直接调用 `searchVisiblePois` 或持有搜索计时器/版本号。

地图 URL 状态由 `useMapRouteSync` 编排：composable 负责 180 ms 写回、首次和后续路由恢复、旧恢复失效、provider 选中/视野副作用与列表滚动；`app/utils/map-route-state.ts` 负责读取 `q/category/place/area/scope`、校验分类与作用域、按 slug/id 解析地点、保持地点优先于区域、清除默认字段并保留 `from` 等无关查询。自动搜索必须优先保留当前可见的显式地点/区域；provider 首次挂载必须应用已解析区域。地图故障遮罩不得阻挡区域详情，当前详情层级为 `z-30`。

地图 provider 生命周期由 `useMapProviderLifecycle` 编排：composable 负责创建、挂载、事件注册、初始配置、响应式数据更新、resize、重试和销毁；`app/utils/map-provider-lifecycle.ts` 以无 Vue 依赖的版本门禁隔离旧创建/挂载请求，确保过期或失败实例被销毁且旧事件不能改写当前状态。页面只把当前 refs 和业务回调交给 composable，不直接导入 provider 工厂。当前地图页为 40,597 B / 1,105 行，相对拆分前 64,939 B / 1,752 行按字节累计减少约 37.5%。

MapLibre/OSM 仅用于开发和低流量预览。使用 `tile.openstreetmap.org` 时必须保留署名、遵守 Tile Usage Policy，不做预抓取或离线打包；正式生产应使用高德或有明确服务协议的瓦片服务。

### 5.3 管理后台

系统同时存在三类身份边界：管理员、获得授权范围的组织管理员和普通学生用户。管理员负责全局内容、来源、发布、知识审核、访客安全和系统配置；组织管理员只能编辑授权的社团/部门范围；普通用户的登录用于个人资料、群聊等需要身份的能力，公开指南和地图仍可免登录访问。三类会话、权限和审计不能混用。

管理操作至少分为：保存草稿、预览、发布、下线、标记已核验、处理纠错。删除默认采用归档；真正清除媒体或记录应是单独且可审计的动作。

办事流程编辑页只负责页头、路由鉴权衔接、组合 computed 和启动编排；基础信息、状态/时间、关联内容、有序步骤与材料表单分别由 `AdminProcedureBasicsEditor`、`AdminProcedureTimingEditor`、`AdminProcedureRelationsEditor`、`AdminProcedureStepsEditor`、`AdminProcedureMaterialsEditor` 展示。`AdminProcedureCatalogPanel` 只负责搜索/状态筛选 model、列表表格/卡片、空态与分页，通过类型化事件请求刷新、翻页、编辑、发布/下架和删除；`AdminProcedureDeleteDialog` 只负责删除确认展示；`AdminProcedureEditor` 只负责编辑弹窗壳、错误提示与五个分区编辑器组合，不访问 API、路由或鉴权。`app/components/admin/procedure-editor-types.ts` 是完整表单契约；`useAdminProcedureFormModel` 与 `app/utils/admin-procedure-form-model.ts` 负责响应式表单、默认值、详情深拷贝、临时 key、受众和有序项操作；`app/utils/admin-procedure-form.ts` 负责校验、日期规范化和 payload；`app/utils/admin-procedure-presentation.ts` 统一静态选项、状态/受众/日期标签和关联选择项，受众判断必须基于去重后的值集合。`useAdminProcedureOperations` 与 `app/utils/admin-procedure-operations.ts` 负责编辑详情、写请求门禁和发布操作；`useAdminProcedureCatalog` 与 `app/utils/admin-procedure-catalog.ts` 负责搜索、筛选、读请求门禁、分页和关联数据；`app/utils/request-error.ts` 统一提取请求状态与消息。所有展示组件均不得直接调用后台 API、读取路由或绕过页面/服务端发布校验。当前流程页为 4,625 B / 192 行；目录面板为 11,510 B / 339 行，编辑弹窗壳为 5,868 B / 182 行，删除弹窗为 999 B / 46 行；客户端校验不能替代服务端 schema、权限与发布校验。

通用后台资源页由 `AdminResourceManager` 消费 `AdminResourceConfig`，统一内容、地点、来源、部门、社团、反馈和只读审计等维护界面。`useAdminResourceCatalog` 与 `app/utils/admin-resource-catalog.ts` 负责搜索防抖、筛选、请求版本、资源切换、分页和响应快照；`useAdminResourceOperations` 与 `app/utils/admin-resource-operations.ts` 负责编辑/删除状态、全局写互斥、资源版本、保存、发布/下架、删除、鉴权和刷新；`AdminResourceCatalogPanel` 只负责统计、搜索/筛选 model、列表表格/卡片、空态与分页，通过类型化事件请求刷新、翻页、编辑、发布/下架和删除；`AdminResourceDeleteDialog` 只负责删除确认展示；`AdminResourceEditor` 只负责编辑弹窗、错误提示、地点坐标选择和动态字段渲染；上述展示组件均不访问 API、路由或鉴权。`app/utils/admin-resource-presentation.ts` 负责响应兼容、统计、嵌套路径/回退列、单元格/日期/记录元信息和字段布局；`app/utils/admin-resource-form.ts` 负责条件字段、分组、初始化、来源/日期/JSON/数字规范化、嵌套 payload、必填校验和地点坐标变更降级。请求错误统一使用 `app/utils/request-error.ts`；纯控制器/工具均不依赖 Vue、请求实现或路由。当前管理器为 5,404 B / 209 行，只负责跨模块组合与表单桥接；目录面板为 12,683 B / 378 行，删除弹窗为 1,114 B / 45 行，编辑器为 5,397 B / 160 行。客户端动态字段、写互斥与坐标降级规则不得替代各服务端模块的 schema、权限、事务、发布、核验和审计约束。 后台坐标拾点 `AdminCoordinatePicker` 的 WGS84 当前点、草稿 POI、校界外判定与挂载选项纯决策在 `app/utils/admin-coordinate-picker-presentation.ts`，组件只保留 MapLibre 生命周期与拾点副作用。后台动态资源路由 `app/pages/admin/[section].vue` 只负责路由参数、未知分区 404、SEO 与 `AdminResourceManager` 接线；各分区的 `AdminResourceConfig`（places/content/sources/feedback/audit-logs）及发布状态/来源平台选项集中在 `app/utils/admin-section-config.ts`，由 `getAdminSectionConfig` / `listAdminSectionKeys` 供页面与脚本契约测试使用。

现场采点页只负责请求注入、鉴权衔接、刷新和跨模块组合。`useFieldObservationCatalog` 与 `app/utils/field-observation-catalog.ts` 负责地点/观测目录、筛选防抖、请求版本、分页、选中项恢复和独立错误；`AdminCoordinateCaptureEntry` 负责地点选择、会话锁、定位子组件和同步快捷入口，浏览器采样仍封装在 `AdminFieldCoordinateCapture`；质量色调/标签/详情、提交门槛与样本接受门禁纯决策在 `app/utils/field-coordinate-capture-presentation.ts`，组件只保留 geolocation watch 与模板接线；`AdminCoordinateObservationReviewList` 只负责筛选控件、观测列表、分页和详情插槽；`AdminCoordinateOfflineQueuePanel` 只负责队列展示；`useFieldObservationQueue` 注入现有 IndexedDB 存储函数与提交请求，`app/utils/field-observation-queue-operations.ts` 负责幂等提交、读取版本门禁、单条/批量互斥、部分失败和删除目标快照，只有无状态码/5xx 才允许离线入队。`AdminCoordinateObservationReviewDetails` 只负责选中观测、核验提示、审核地图、说明模型和类型化审核事件；`useFieldObservationReview` 与 `app/utils/field-observation-review-operations.ts` 负责审核说明字典、全局操作互斥、批准/驳回请求、错误保留和鉴权委托；`field-observation-presentation.ts` 提供展示降级；`field-observation-review.ts` 只解释核验状态。坐标审阅地图 `AdminCoordinateReviewMap` 的 WGS84 可渲染判定、邻域筛选、GeoJSON 点集/精度圈与视野适配纯决策在 `app/utils/admin-coordinate-review-map-presentation.ts`，组件只保留 MapLibre 生命周期与图层副作用。 官网平面图 `OfficialCampusPlan` 的缩放钳制、滚轮/捏合/按钮缩放、焦点滚动与选中标签等纯决策在 `app/utils/official-campus-plan-presentation.ts`，组件只保留 viewport 事件与 DOM 滚动副作用。所有客户端审核代码均不得自行批准观测或升级地点，服务端仍是唯一权威。当前页面为 5,531 B / 194 行；现场采点页主要代码边界已完成拆分，真实定位、弱网、配额耗尽和双人/双时段证据必须保留真机/现场验收门禁。

### 5.4 AI 检索与知识库

AI 不是独立的数据源，而是站内检索和证据整理的编排层。公开入口为 `/api/public/assistant` 和 `/api/public/assistant/stream`，后台统计入口为 `/api/admin/assistant`。当前路径按成本和可信度从低到高排列：

1. 先查 `assistant_answer_cache`（进程内热缓存 + SQLite 持久化缓存）；命中未过期答案时直接返回，不扫描知识库、不调用模型或网页。
2. 未命中后只做轻量意图判断、敏感/提示注入检查和关键词提取；关键词优先走 `/api/public/search`，不强制调用模型。
3. 系统 API 路径（`feature_api`）和本地知识路径（`local_database`）只读取少量高相关候选，动态数据、启用的 `assistant_knowledge_entries`、已发布 `knowledge_claims` 和官方文档索引均可参与检索；知识文档支持网页、PDF、表格、聊天导出、手册和 API 等类型。
4. 仍无足够证据时才读取既有网页缓存或调用受限 MCP（`web_search`）。实时网页片段只在当前请求内供模型归纳，不再写入 `assistant_web_knowledge`；最终整理答案（外部引用仅保留标题、链接和核对提示）写入 `assistant_answer_cache`。外部网页不能覆盖已审核的官方声明。
5. 最后才调用 AI 网关整理答案。模型输入必须带证据来源、权威级别、核验/有效时间和禁止臆测约束；没有足够证据时应明确说明未找到，而不是补写学校事实。

每次运行由 `assistantRuns` 记录请求 ID、入口、检索路径、耗时、成功状态和错误码；流式接口发送 `stage_started`、`stage_completed` 和 `completed` 事件，并通过心跳、无缓存头和 JSON 回退避免 CDN/Nginx 长连接卡死。IP 只用于限流和安全审计，必须遵守隐私文档的最小化和保留期限。

知识库由 `server/modules/knowledge` 管理：`knowledge_documents` 保存原始文档和抽取文本，`knowledge_entities` 保存人、专业、学院、地点、政策等实体，`knowledge_claims` 保存可审核的事实声明，`knowledge_claim_sources`/`knowledge_claim_entities` 保存关联，`knowledge_conflicts` 保存冲突。导入流程为“去重 -> 抽取（含 PDF 文本/图片元数据） -> 编译候选声明 -> `draft/review` -> 管理员审核 -> `published`”，只有带来源、未过期且满足置信度门槛的声明可进入回答。全文检索优先 SQLite FTS5，必要时使用受限 LIKE 回退；每次抓取或编译都必须可追溯、可撤回。

### 5.5 账号、聊天与外部消息

- `users`/`userSessions` 支持普通用户登录；不登录仍可访问公开页面，但未登录不能发送群聊消息。
- `chatRooms`、`chatMembers`、`chatMessages` 和 `chatMutes` 当前支持公共群与宿舍群；社团/部门页面提供群入口但不改变现有房间类型，新增专属房间类型必须先做迁移和权限设计。管理员可查看、禁言、删除和审计，消息展示使用用户名与时间。
- `organizationAdminScopes` 限制社团/部门管理员的编辑范围；可视化编辑、媒体上传和密码修改仍由服务端权限与审计约束。
- QQ OneBot 和 WeChatPadPro relay 只转发艾特触发的消息，调用与网页相同的 AI/站内检索流程；白名单、限流、违禁词拦截、官网尾注和失败降级在 relay 层与主 API 双重执行。微信公众平台回调使用独立签名/加解密配置，凭据只放 shared 环境变量。
- 外部 relay、WeChatPadPro 容器和知识抓取任务使用独立 systemd 单元，不能因为单个账号掉线而影响 `yeu.service`。

### 5.6 访客、统计与治理

请求追踪中间件为公开请求生成受限 `X-Request-Id`；`visitors`、`visitorEvents`、`visitorBans` 记录脱敏访客标识、最后活动、操作次数、封禁和必要安全事件。后台按中国标准时间提供最近活动、访问次数、当日汇总、24 小时分时和近 14 日频率视图。页面阅读量和公告已读状态属于独立业务统计，不得与安全日志混为一表。所有统计接口只返回聚合结果，导出和保留受隐私政策约束。

### 5.7 后续扩展边界

- **向量/语义检索**：只有当 SQLite FTS 和结构化检索无法满足数据规模时再单独引入；必须保留原文、来源、版本和撤回能力，不能以向量结果替代审核状态。
- **商户能力**：商铺仍是普通地点；未来的商户主体、认领申请、优惠和推广订单放在独立商业域，自然内容与付费推广排序字段分离。
- **多实例/服务型数据库**：当前 SQLite 单实例是明确约束。需要多实例前先迁移数据库、锁、队列和文件存储，并完成备份、回滚和一致性演练。

## 6. API 约定

- 公开 API 前缀：`/api/public`；后台 API 前缀：`/api/admin`。
- AI 公开接口：`POST /api/public/assistant`（JSON）与 `POST /api/public/assistant/stream`（SSE）；普通关键词使用 `GET /api/public/search`，后台 AI 统计使用 `GET /api/admin/assistant`。
- 内容域接口按 `content`、`places`、`procedures`、`clubs`、`departments`、`notices`、`panorama`、`transit`、`track` 等资源拆分；后台写入必须经过会话、CSRF/来源校验、运行时 schema、发布规则和审计。
- 使用 JSON，字段使用 `camelCase`，时间使用带时区的 ISO 8601 字符串，对外坐标始终同时返回 `coordinateSystem`。
- 列表统一返回 `{ items, total, page, pageSize }`；参数设置硬上限，避免一次加载全部地图详情。
- 变更接口执行运行时校验，不信任 TypeScript 类型；失败采用稳定错误码，不把数据库错误或堆栈返回客户端。
- 全局请求中间件生成或接受受限格式的 `X-Request-Id`，写入响应和后台审计记录；生产结构化请求日志只记录 ISO 时间戳、方法、路径、状态、耗时及 `HTTP_<status>` 错误码，不记录查询串或客户端标识。
- 公开详情可使用 `ETag`/`Last-Modified`；发布、下线或核验后使对应缓存失效。
- 所有写请求以及管理、认证、纠错接口设置 `Cache-Control: no-store`；所有 `/api/**` 响应同时使用 `CDN-Cache-Control: no-store`、`s-maxage=0` 和边缘禁用头，避免 CDN 直接返回数据绕过源站策略。除 `/api/health` 和 `/api/integrations/**` 回调外，API 必须带当前公开网页的 `Origin`、`Sec-Fetch-Site: same-origin` 或同源 `Referer`；这不是 CORS 替代品，伪造完整浏览器头的高级客户端仍需 CDN/WAF、限流和签名策略。全局响应带基础 CSP framing/object 限制、`nosniff`、Referrer Policy 和不禁用现场定位的 Permissions Policy。
- 批量导入采用“解析 -> 校验报告 -> 人工确认 -> 事务写入”，不得上传文件后直接发布。

## 7. 渲染、PWA 与微信适配

### 7.1 渲染策略

- 首页、指南、流程、部门和社团详情优先 SSR 或按发布事件再生成；
- 地图页 SSR 输出标题、筛选和地点摘要，地图画布在客户端挂载，避免服务端访问 `window`；
- 后台始终动态渲染并关闭索引；
- 只有稳定、不依赖数据库的页面才在构建时预渲染，避免“数据库更新但页面仍旧”的双重事实来源。

### 开场动画（IntroOverlay）

首页开场粒子动画由 `app/components/IntroOverlay.vue` 负责 canvas/DOM 生命周期与绘制编排；粒子弹簧/指针阻尼物理在 `app/utils/intro-overlay-physics.ts`，迎新指南标记点与校园水域几何在 `app/utils/intro-overlay-geometry.ts`。组件不内嵌纯物理常数与多边形数据，便于脚本级单元测试与后续调参。

公开搜索页 `app/pages/search.vue` 负责 SEO、地图种子合并、`/api/public/search` 请求与 `router.replace` 导航副作用；关键词归一化/别名、API 与静态回退结果合并、分组与朗读公告、路由匹配/并发导航过期校正/输入同步决策在 `app/utils/public-search-presentation.ts`。

校园周边页 `app/pages/nearby.vue` 负责 SEO、候选目录导入、公开地点列表请求、研究资料种子导入与模板；分类标签/提示、核验清单与用法提示、来源文案学生向改写、过滤、高德 marker 链接与固定研究资料选择（`selectNearbyResearchSources`）在 `app/utils/nearby-presentation.ts`。

办事流程详情页 `app/pages/procedures/[slug].vue` 负责公开流程请求、SEO、受众筛选与路由同步、清单 localStorage 副作用与模板；标签文案、分类相关提示/材料说明、来源 claim 学生向改写、信息状态/材料数量/受众选项/步骤完成态徽章决策、受众路由 query、清单解析序列化与存储文本、步骤勾选与地图链接在 `app/utils/procedure-detail-presentation.ts`。

首页 `app/pages/index.vue` 负责 SEO、开场动画状态、公开内容/流程请求、卡片 DOM 倾斜副作用与模板；四件要事/时间线/更多入口、精选流程映射、失败提示、倾斜角度与地图搜索目标在 `app/utils/home-presentation.ts`。

反馈纠错页 `app/pages/feedback.vue` 负责 SEO、路由 query、toast、`$fetch` 提交与模板；目标解析、原因选项/默认值、提交门槛与 body 规范化在 `app/utils/feedback-presentation.ts`（查询字符串助手为 `feedbackRouteQueryString`）。

地点详情页 `app/pages/places/[slug].vue` 负责路由、公开地点请求、SEO、分享/复制副作用、反馈链接与模板；分类/范围标签、坐标核验、地图目标、来源映射、清单回退与位置复制文案在 `app/utils/place-detail-presentation.ts`。

校园总览页 `app/pages/campus.vue` 负责 SEO、公开内容请求、部门/社团/通知合并与模板；概览统计与内容回退提示在 `app/utils/campus-presentation.ts`。

地图页 `app/pages/map/index.vue` 负责地图 provider 生命周期、搜索/筛选/选点、路径规划、DOM 行滚动与模板（选点后移动端收起列表 sheet，仅挂载一块 `MapPlaceDetailsPanel` 浮动详情卡）；分类目录、数据来源标签、回退提示、地点状态/使用清单、位置复制与面积周长格式化、选点/选区/自动选点 apply、地图 POI 点击 apply、平面图编号选中，以及关闭详情/分类切换/视野适配/搜索重置等纯决策在 `app/utils/map-presentation.ts`。；路由同步镜头/选中决策见 `resolveMapRouteApplyDecision`，定位与步行路线文案守卫见 `map-geolocation` 纯函数

指南详情页 `app/pages/guides/[slug].vue` 负责路由、公开指南请求、unmanaged 目录回退、反馈链接、SEO 与模板；静态回退提示、相关动作跳转与详情来源展示映射在 `app/utils/guide-detail-presentation.ts`，错误码解析复用 `app/utils/public-errors.ts`。

指南列表页 `app/pages/guides/index.vue` 负责 SEO、公开指南请求、静态目录合并、搜索状态与模板；分类标签、分类图标色调、筛选与回退文案解析在 `app/utils/guide-list-presentation.ts`。

办事流程列表页 `app/pages/procedures/index.vue` 负责 SEO、公开流程请求、搜索/人群状态与模板；适用人群筛选标签、办理方式标签、列表筛选、详情链接 query 与服务/空态文案在 `app/utils/procedure-list-presentation.ts`。

关于页 `app/pages/about.vue` 负责 SEO 与模板；项目事实、服务边界与治理链接目录在 `app/utils/about-presentation.ts`。

发现页 `app/pages/discover.vue` 负责 SEO 与模板；新生任务、内容目录与说明共建链接在 `app/utils/discover-presentation.ts`。

离线状态页 `app/pages/offline.vue` 负责 SEO、网络状态监听、重试/返回与模板；状态文案矩阵、离线边界与静态说明链接在 `app/utils/offline-presentation.ts`。

隐私说明页 `app/pages/privacy.vue` 负责 SEO 与模板；公开访问、反馈纠错、保留与删除、第三方服务分节在 `app/utils/privacy-presentation.ts`。

管理登录页 `app/pages/admin/login.vue` 负责 SEO、表单状态、`$fetch` 会话/登录与模板；会话载荷判定、错误文案映射与安全 redirect 解析在 `app/utils/admin-login-presentation.ts`。
管理概览页 `app/pages/admin/index.vue` 负责鉴权拉取、加载状态与模板；模块目录、快捷操作、响应归一化与列表字段/日期展示在 `app/utils/admin-dashboard-presentation.ts`。

部门详情页 `app/pages/departments/[slug].vue` 负责路由、公开部门请求、目录合并、反馈链接、SEO 与模板；正文前缀解析、用例提取、详情来源 API/种子回退与核验日期解析在 `app/utils/department-detail-presentation.ts`。

来源说明页 `app/pages/sources.vue` 负责 SEO、公开内容/地点列表请求、加载错误状态与模板；来源等级标签、学生向可信度说明、访问日期截取与关联来源去重聚合在 `app/utils/sources-presentation.ts`。

社团详情页 `app/pages/clubs/[slug].vue` 负责路由、公开社团请求、种子目录回退、反馈链接、SEO 与模板；来源状态文案、入群/报名问题清单、分区标签与详情来源映射在 `app/utils/club-detail-presentation.ts`。

社团列表页 `app/pages/clubs/index.vue` 负责公开列表请求、搜索状态与模板；近期活跃统计、线索计数、名称拼接、搜索过滤与列表文案在 `app/utils/club-list-presentation.ts`。

部门列表页 `app/pages/departments/index.vue` 负责公开列表请求、搜索状态与模板；搜索过滤、联系方式预览与列表文案在 `app/utils/department-list-presentation.ts`。

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
- SQLite 启用 WAL、外键和 `busy_timeout`；`yeu.service` 固定单实例，不使用 cluster 或第二个进程并发写入。
- 所有写入用短事务，媒体文件先安全落盘再提交引用，失败时清理孤儿文件。
- 健康检查区分进程存活与数据库可读；外部地图不可用时内容列表和文字地址仍应可用。
- 当前结构化请求日志由应用生成 ISO 时间戳，并包含请求 ID、方法、无查询串路径、状态码、耗时和稳定 HTTP 错误码。`pnpm ops:monitor` 从 shared 的受限应用日志尾部按时间窗聚合 5xx、管理员登录 401 和 429；日志路径和逐请求字段不会进入监控报告或 webhook。运行时代码的 `app/server/map` 目录由 ESLint 禁止 `console.*`，避免临时调试输出进入浏览器或 systemd 日志；可恢复的纯装饰前端失败直接走既定降级，服务端请求错误统一通过结构化请求日志上报。维护 CLI 仍可使用显式 stdout/stderr 返回机器可读结果。错误日志轮转、生产日志路径和磁盘告警仍由生产运维配置。
- `scripts/monitor-production.ts` 将 `/api/health`、SQLite/WAL、磁盘、内存、系统负载和备份新鲜度组合成一个可由 cron/宝塔调用的非零门禁，并可向通用 HTTPS webhook 发送脱敏、去重的故障与恢复通知；生产是否真正获得通知仍取决于服务器计划任务和 webhook 配置。
- `pnpm bundle:budget` 从 Nuxt 生产构建清单读取实际未压缩产物，限制全局入口、首页、搜索、地图、流程详情、后台资源编辑、流程编辑、现场观测和研究说明的初始 JavaScript/CSS；MapLibre SDK 与 CSS 必须分别保持独立动态资源，不得进入受保护路由初始依赖。地图样式不再由 Nuxt 全局 CSS 加载，而是在 provider 或后台坐标审核地图初始化时与 SDK 一起动态导入。该门禁用于防止构建体积回退，不替代真机 Lighthouse、LCP、CLS、INP 和地图可交互时间测试。
- `pnpm e2e` 为最新生产构建重建隔离 SQLite，并通过正式服务生成受控已发布地点、两个项目隔离的内容草稿和专用测试管理员，随后在桌面 Chromium 与 Pixel 5 移动视口执行 19 个公开/管理/PWA/故障/无障碍场景，共 38 条检查；覆盖搜索到共享地点详情、解析并显示自定义学生使用清单、返回地图、区域 URL 首次恢复与关闭写回、地图显示设置交互、流程材料/来源/键盘进度、管理员编辑/发布/下线和审计、反馈提交与解决、PWA 注册与更新提示、六类核心页面 Axe 扫描、搜索 API 降级、MapLibre 动态分包失败和 Service Worker 断网导航。E2E 地点说明必须使用 `【到这里前先确认】` 标记，避免夹具静默回退默认清单。外部瓦片和官网请求在浏览器测试中被阻断，保证页面文字与交互测试不依赖第三方网络。当前自动化浏览器覆盖不代表真实 Android/iOS Safari、微信 WebView、实际安装态 PWA 或生产高德域名验收。

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

### AI 检索优先级补充（2026-07-31）

- 身份类问题先读取已审核的 `assistant_knowledge_entries` 身份条目，再读取官方文档和已发布声明；叙事型官网文章不能因为标题包含人名就覆盖审核条目。
- 身份答案的快速摘要只允许使用 `reviewed_site` 条目，普通文章必须经过身份事实提取，不能把作者、导语或目录元数据直接输出。
- 检索路由语义变化必须递增答案缓存版本，并在发布后用源站直连和公开域名分别验证，避免旧缓存掩盖路由回归。
- 已核验的开学日期、校规和校园概览先使用内存种子证据，只有需要全文检索的问题才打开大知识表，避免冷启动扫描拖慢确定性回答。
- 确定性本地答案可以短路全文扫描和模型调用，但必须仍记录 `query_analysis`、实际检索路径和 `totalDurationMs`；缓存命中不得把先前已发生的分析耗时重置为零。

### 首页双模式与简洁微信版（2026-08-04）

- 首页不新增独立模块入口；`app/pages/index.vue` 通过顶部居中的“完整 / 简洁”紧凑分段按钮切换同一首页内容，选择保存在 `yeu-home-mode` Cookie，移动端与桌面端共用状态。
- 简洁模式由 `app/components/home/HomeCompactWechatGuide.vue` 渲染，数据只读取主站现有公开 API 与 `data/major-profiles.ts`，不复制一套静态数据库。公告、办事、指南、社团、部门、附近地点和阅读统计因此沿用主站实时发布结果。
- 简洁模式按移动端小程序式信息流连续展示“新生常用入口、校园服务、迎新指南功能、直接打开、了解与反馈”五个核心区块；顶部使用四张同源图片轮播，常用入口为五列图标宫格，服务区使用带图横向卡片，工具、直达和反馈区使用双列紧凑卡片。账号、聊天、个人中心和隐藏平面图入口不在该模式中。
- 18 个后台可控功能由 `managedEntryDefinitions` 建立唯一主入口映射：公开功能开关决定是否显示，`placement` 决定进入常用、入学阶段或校园服务区，`sortOrder` 决定区内顺序；管理员为指南、部门或社团发布的 `homeEntry` 继续按公开 API 的 `quick/services/more` 位置合入，避免简洁模式维护第二套后台数据。
- 地图、全景、交通、清单、校规、AI 搜索和联系方式使用同源页面入口；宿舍普通型与舒适型实拍使用站内 `/media` 资源并设置 `playsinline`。简洁模式同时显示实时公告、内容数量、精选指南、专业住宿片区和周边地点，目录详情仍进入主站对应页面。
- 公开首页依赖的前台功能配置接口必须在发布前完成数据库迁移。`frontend_feature_settings.placement` 与 `sort_order` 属于 0019 迁移，开发、预发布和生产均应先执行 `pnpm db:migrate`，再启动新 release；接口异常不得静默当作“全部关闭”。
- 动态首页入口的图标必须同时出现在 `shared/client-bundle-icons.ts`，否则 provider:none 的生产构建会在浏览器显示空图标并产生控制台警告。
- 简洁模式的入口卡片先打开预览，不直接离开首页。内容型入口使用固定 `72svh` 的底部半屏，标题和底部动作固定，中间正文允许触摸滚动但隐藏浏览器滚动条，并按“分段正文 -> 底部来源地址 -> 进入完整页面”展示；内置正文集中维护在 `data/compact-preview-content.ts` 并与即链 `edit=roommate` 预览逐项对齐。单链接入口使用独立的居中小弹窗，只显示“将跳转至”及可点击真实地址，不继承半屏高度、正文或底部动作。指向 `/contact` 的内容预览复用 `/images/contact-wechat.png` 展示整理者二维码。指南、部门、社团的后台首页入口仍可通过 `metadata.homeEntryContent` 配置分段正文、通过 `metadata.homeEntrySourceUrl` 配置独立来源地址；公开 API 对正文限制长度，对来源只返回安全的站内路径或公开 HTTP(S) URL，未配置来源时以当前详情页地址回退。简洁页顶部提供 `https://doc.sourl.cc/jkyxfu` 小程序入口，网页完整内容仍以主站公开 API 为唯一数据源。
- 简洁模式“校园服务”横向卡片必须全部使用真实图片封面。内置全景、地图、快递外卖和全部办事流程分别使用校园图、校园地图图、餐饮图和迎新指南图；后台动态插入该区域的入口按目标路径选择封面，无法识别时回退校园图，不显示空白图标占位。
- 公开子页面统一由 `app/layouts/default.vue` 提供“返回上一步”动作：存在站内历史栈时调用路由返回，直接打开页面时回到首页。各内容页面不再重复维护自己的通用返回按钮；地图等需要业务态返回的页面仍可保留自身面板动作。

### 简洁模式实时目录（2026-08-05）

- `HomeCompactWechatGuide` 的前半段继续对齐即链移动预览的连续信息流；后半段使用一个紧凑分类切换区承载主站实时目录，避免为了“内容完整”把数十条社团、部门和地点纵向铺满首页。
- 实时目录默认展示当前分类前 10 条；当分类总数超过 10 条时提供明确的展开/收起动作，展开后必须使用同一次公开 API 返回的完整分类数据，不另建静态副本。切换分类会恢复紧凑状态，避免上一分类的长列表污染下一分类的阅读位置。
- `buildHomeEssentialActions` 必须与后台 `home.essential.*` 语义严格一致：`arrival` 指向报到流程，`map` 指向校园地图，`network` 指向校园网办理，`delivery` 指向快递外卖指南。不得再用这些开关承载专业、宿舍或交通等其他入口。
- 实时目录同时读取指南、办事流程、校园地点、学生社团和部门学院五类公开 API。分类按钮显示完整数量，当前分类展示前 10 条并提供对应完整目录入口；条目标题、摘要和详情地址均来自同一 API 响应，不维护静态副本。
- 校园地点必须读取 `usePublicPlaceList('campus')`。吃喝玩乐正文目前来自 `data/nearby-guide.ts`，不能依赖尚无已发布记录的 `scope=nearby` 地点接口；首页精选按有图内容优先，链接回 `/nearby#guide-*` 的现有阅读位置。
- `home.essential.map` 只控制校园地图相关入口，`home.essential.delivery` 只控制快递与外卖入口；专业住宿查询没有独立后台 feature key，不得再借用地图开关。旧公告动作中的 `i-lucide-panorama` 在公开输出时归一化为有效的 `i-lucide-orbit`。
