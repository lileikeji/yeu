# 工程与发布验证记录（2026-07-15）

> 验证时间：2026-07-16 06:42（Asia/Shanghai）  
> 用途：记录当前工作区的可重复验证证据；本记录不是发布批准，也不代表尚未提交的工作区已经形成稳定 Git 基线。

## 1. 代码与工具身份

| 项目 | 记录值 |
| --- | --- |
| 分支 | `master` |
| 当前基础 commit | `8f3d8b3f8b3b4fec02c3857bf70f8080e6622f42` |
| 工作区状态 | dirty；本轮改动尚未分批暂存或提交 |
| Node.js | `v24.11.1` |
| pnpm | `10.28.1` |
| pnpm lockfile | `9.0` |
| Playwright / Axe | `1.61.1` / `4.12.1`，Chromium 浏览器已安装 |

基础 commit 只用于说明本轮改动从哪里开始，不能作为发布 SHA。待按 `CHANGESET_PLAN_2026-07-15.md` 完成提交后，必须用最终 commit SHA 替换发布记录中的该值，再重新执行门禁。

## 2. 工程质量门禁

| 检查 | 结果 | 证据摘要 |
| --- | --- | --- |
| 冻结锁文件安装 | 通过 | `corepack pnpm install --frozen-lockfile` 成功 |
| ESLint | 通过 | `pnpm check` 第一阶段成功 |
| TypeScript | 通过 | `nuxt typecheck` 成功 |
| 脚本测试 | 通过 | 254/254，通过、0 失败、0 跳过 |
| 生产构建 | 通过 | Nuxt/Nitro node-server 构建完成 |
| 客户端体积预算 | 通过 | 全局入口与 4 个核心路由均在预算内；MapLibre 保持独立动态分包 |
| PWA 产物 | 通过 | 仅保留明确的离线导航回退，测试通过 |
| Playwright 浏览器检查 | 通过 | 19 个场景在桌面 Chromium 与 Pixel 5 移动视口共 38/38 通过 |
| GitHub Actions 语法 | 通过 | Actionlint v1.7.12 对当前工作流返回 0 |
| 依赖漏洞扫描 | 通过 | OSV-Scanner v2.3.8 扫描 1,386 个包后无未忽略问题；2 个限时构建链例外均有到期日 |
| 差异空白检查 | 通过 | `git diff --check` 无错误 |

构建仍有第三方 sourcemap、包 exports 弃用和大于 500 kB chunk 警告。大 chunk 已定位为 1,053,439 B 的 MapLibre SDK 独立动态入口；构建清单确认其不进入首页、搜索、地图页或流程详情的初始 JavaScript，体积门禁已通过。该结论只证明分包边界与未压缩构建体积，没有替代真机 Lighthouse 和交互性能验收。

本次体积基线：全局入口 JS 387,344 B、全局入口 CSS 214,257 B、首页初始 JS 519,070 B、搜索 633,048 B、地图 638,012 B、流程详情 411,867 B。后台资源编辑为 601,076 B、流程编辑 654,282 B、现场观测 573,966 B、研究说明 389,961 B。MapLibre SDK 为 1,053,439 B，MapLibre CSS 为 69,848 B，均保持独立动态资源。预算脚本按构建清单语义识别路由和 `maplibre-gl`，不依赖构建哈希文件名。

`pnpm e2e` 现在先生成最新生产 `.output`，再启动本地 Nitro，并从迁移和种子重建独立 `.data/e2e.sqlite`（98 条来源、58 条种子内容、5 条流程、23 个步骤），随后通过正式服务生成受控已发布地点、两个项目隔离的内容草稿和专用测试管理员。桌面 Chromium 与 Pixel 5 移动视口分别通过：首页地点查询、全站搜索、已发布地点详情及地图返回、共享地点详情组件中的自定义“到这里前先确认”清单、区域 URL 首次恢复/显式区域优先/关闭写回、地图显示设置开关与关闭、流程材料/来源/键盘进度、管理员登录与内容编辑/发布/公开检索/下线/审计、公开反馈提交与后台解决、PWA 清单/注册/更新提示、搜索 API 503 降级、MapLibre 动态分包失败降级、Service Worker 断网导航，并对首页、搜索、地图、流程、反馈和后台登录执行 WCAG 2 A/AA Axe 严重与阻断级扫描，共 38/38。测试阻断全部非本机 HTTP(S) 请求，地图故障场景会额外阻断实际 MapLibre 分包；因此可证明这些本地核心闭环和文字降级不依赖第三方网络，但不证明外部地图服务、真实设备或生产凭据可用。

`corepack pnpm install --frozen-lockfile` 返回 0；最新一次 `corepack pnpm check` 返回 0，耗时约 150.2 秒，完成 lint、类型检查、254 项脚本测试、生产构建、体积预算和 PWA 产物断言；随后在该最新生产构建上执行 `corepack pnpm e2e:run` 返回 0，命令总耗时 34.1 秒，Playwright 报告 38 条检查在 31.2 秒内完成。门禁过程中发现并修复依赖升级后 22 处事件处理器返回类型不正确、开场动画跳过按钮缺少稳定可访问名称、E2E 命令可能复用陈旧 `.output`、新增首屏校园图超过公开媒体体积预算、地图展示/搜索/地点详情/定位路线/高德原生搜索/URL 同步拆分后的回归覆盖缺口、地图错误层遮挡区域详情关闭按钮，以及 E2E 地点说明缺少 `【到这里前先确认】` 标记而错误回退默认清单的问题；CI 在已完成 `pnpm check` 后使用 `pnpm e2e:run`，避免重复构建。

本轮复核还发现仓库源码直接使用 H3 类型和 Nuxt/Nitro H3 自动导入，但 `package.json` 未声明直接依赖。pnpm 因而可能把 ESLint 配置检查器使用的 `h3@2.0.1-rc.22` 提升为默认解析，同时 Nitro 2.13.4 仍以 `h3@1.15.11` 创建事件对象，导致开发模式下设置响应头时返回 500。项目现已显式固定 `h3@1.15.11`，开发服务器重新生成后 API 自动导入与事件运行时保持一致；3010 端口的健康检查、首页和公开内容 API 均返回 200。限流测试也已升级为真实 H3 HTTP 请求，验证达到阈值后返回 429、`RATE_LIMITED` 和至少 1 秒的合法 `Retry-After` 响应头。修复后冻结安装、`pnpm typecheck`、当前 254 项脚本测试、完整构建、38 条浏览器检查与 OSV 扫描均通过。

官网来源发现工具随后完成 CLI 契约修复：无参数现在正确使用 10 个默认关键词，未知参数和缺失关键词值会失败。默认检索与 7 个窄关键词检索均返回 0 退出码；截至 2026-07-15 21:47，公开搜索索引仍未发现可支撑 2026 级录取通知书、报到须知、接站或社团招新的正文。

### 2.1 CI 与依赖安全补充（2026-07-16）

- `.github/workflows/ci.yml` 现在覆盖 push、pull request 和手动触发；冻结安装后执行 `pnpm check`，安装 Chromium，并使用 `pnpm e2e:run` 重建隔离 E2E 库和执行完整 Playwright 场景。Actionlint v1.7.12 已通过。
- `.github/workflows/dependency-security.yml` 使用固定 commit 的 OSV-Scanner v2.3.8 reusable workflow：PR 比较新增漏洞，`master`/`main` push、每周一 12:30 UTC 和手动触发执行全量 `pnpm-lock.yaml` 扫描。
- 首次本地 OSV 扫描发现 10 项漏洞，其中 1 Critical、1 High；升级锁文件后只剩 2 项 esbuild 的 Medium/Low，Critical/High 为 0。
- 两项剩余风险都位于开发/构建链，不进入 Nitro 生产运行时：`drizzle-kit -> @esbuild-kit -> esbuild@0.18.20`，以及 `@nuxt/ui -> @nuxt/fonts -> fontless -> esbuild@0.27.7`；主 Vite/tsx 已使用 `esbuild@0.28.1`。`osv-scanner.toml` 的限时例外在 2026-08-31 到期，不能视为永久接受。
- Tiptap 协作 peer 已显式固定为 `@tiptap/y-tiptap@3.0.7`，冻结安装不再报告 `@tiptap/extension-collaboration` 和 `extension-drag-handle` 的 peer 冲突。
- npm/pnpm 传统 audit 接口在当前镜像缺失、官方旧端点已返回 410，因此持续门禁使用仍受维护且支持 pnpm lockfile 的 OSV 数据库，不把 audit 命令失败误判为“无漏洞”。

### 2.2 生产监控命令补充（2026-07-16）

- 新增 `pnpm ops:monitor`，组合检查应用健康响应、SQLite/WAL 文件大小、磁盘余量、系统内存与负载、最新备份元数据及对应 SQLite 文件是否存在。
- 默认阈值为备份不超过 26 小时、磁盘至少 5 GiB 且 15%、WAL 不超过 256 MiB、可用内存至少 10%、单 CPU 一分钟负载不超过 2；均可通过 `NUXT_MONITOR_*` 覆盖。
- 可选请求日志输入按应用生成的 ISO 时间戳统计最近 15 分钟内的 HTTP 5xx、`/api/auth/login` 与 `/api/admin/auth/login` 登录 401、HTTP 429；默认阈值分别为 0、4、0，并可通过环境变量覆盖。扫描只读取文件尾部最多 4 MiB；若尾部最早时间仍晚于窗口起点，监控会报告 `request_log_window_incomplete`，不会用不完整样本误判正常。已配置日志缺失或不可读时同样失败关闭。
- 可选 webhook 只接受无内嵌凭据的 HTTPS URL；通知负载只有标签、状态转换、问题码、时间和聚合指标，不包含本机路径、请求 ID、数据库内容、请求参数或用户数据。状态文件保证首次故障、故障变化、提醒和恢复才发送。
- 请求结构化日志现包含应用生成的 ISO `timestamp`；监控报告和 webhook 仅输出 5xx、登录失败、限流等聚合计数，不携带日志路径、查询串、凭据、IP、联系方式或位置数据。
- `scripts/monitor-production.test.ts` 的 6 项测试通过，覆盖健康基线、六类同时故障、重复告警抑制、恢复通知、近期请求指标聚合与旧事件排除、日志缺失及 4 MiB 有界尾部窗口不完整时失败关闭；这只证明仓库能力，生产 PM2 `out_file`、日志轮转、计划任务、真实 webhook 和受控故障/恢复演练仍待服务器落地。

### 2.3 公开 API 缓存策略补充（2026-07-16）

- 公开只读 GET 接口在处理开始时先设置 `Cache-Control: no-store`，仅在参数校验、数据库读取和结果组装成功后切换为短缓存，因此 4xx/5xx 不会被中间缓存或浏览器按成功结果保存。
- 列表和地图草稿接口使用 `public, max-age=60, stale-while-revalidate=300`，详情接口使用 `max-age=120`，搜索接口使用 `public, max-age=30, stale-while-revalidate=150`；后台、认证、反馈、健康检查和所有写请求继续 `no-store`。
- 3010 开发服务器运行时复核：地点列表 200 返回 60 秒短缓存，搜索 200 返回 30 秒短缓存，缺少必填搜索词的 422 返回 `no-store`，认证状态和健康检查 200 均返回 `no-store`。
- `scripts/request-context.test.ts` 新增全公开 GET 路由策略门禁，要求每个路由先 `no-store`、成功后才调用 `setPublicCache`，并确认反馈写接口不启用公开缓存；当前完整脚本测试基线为 254/254。

### 2.4 运行时日志收敛（2026-07-16）

- `app/server/map` 运行时代码由 ESLint `no-console` 规则禁止直接写 `console.*`；脚本目录不在该限制内，维护命令仍通过显式 stdout/stderr 输出机器可读结果和错误。
- 开场动画初始化失败属于不影响主功能的可恢复装饰故障，现直接调用已有降级路径，不再向生产浏览器控制台输出原始异常对象。
- 服务端请求继续由全局中间件统一记录 ISO 时间戳、请求 ID、方法、无查询串路径、状态码、耗时和稳定 `HTTP_<status>` 错误码；监控按时间窗聚合 5xx，客户端原始异常、查询串和用户标识不会进入该通道。
- `scripts/intro-overlay.test.ts` 增加静默降级和禁止控制台输出断言；当前脚本测试基线为 254 项。生产 PM2 错误日志路径、轮转和告警仍需服务器部署，不能由此视为生产日志闭环已经完成。

### 2.5 公开图片尺寸与体积门禁（2026-07-16）

- 当前 `public` 目录有 6 个公开图片资源：3 个 PWA PNG 图标、站点 Logo PNG、一个 SVG 图标和首页校园背景 WebP；最大文件为校园背景的 200,012 B，低于 256 KiB 直接发布上限。
- 首页左上角 Logo 现在使用维护者指定的根目录 `logo.png`，公开副本 `/icons/site-logo.png` 与源文件 SHA-256 均为 `48D512F6D501C700C540D57EDDE8E09DB6B03632AB0503A3642DF1602470FE7D`。布局声明与 PNG IHDR 一致的 `width="325"`、`height="72"`，CSS 按 36 px 高度响应式展示；桌面 1280 px 与移动 390 px 实际渲染均未与导航操作重叠。该记录证明实现和字节来源，不证明 Logo 的公开授权范围。
- 新增校园背景原始 JPEG 为 331,864 B、`1579×889`，SHA-256 为 `84BB64E8136B5B7D1AFD9D8830FB83C37D87D0961E2841AB17CF42331186BE10`。原始字节已保留在 Git 忽略的 `.data/source-media/intro/`，公开目录只发布同尺寸、200,012 B 的 WebP，SHA-256 为 `AE8B51981375EE9E8EC55D98ADDEDAB0D9B2148CF378B1F8B0E3556BD8C5E1F5`，体积减少 39.7%；组件继续声明固有尺寸和 `fetchpriority="high"`。
- `scripts/public-media-policy.test.ts` 会确认公开 Logo 与工作区源文件字节一致、解析 PNG 尺寸、禁止界面声称官方背书，并枚举全部公开栅格图、确保首屏校园图只发布优化后的 WebP；单文件超过 256 KiB 即失败。当前脚本测试基线为 254 项；正式发布仍需人工确认 Logo 权利范围。

### 2.6 地图样式与后台路由分包（2026-07-16）

- `nuxt.config.ts` 移除全局 `maplibre-gl/dist/maplibre-gl.css`；地图 provider 和后台坐标审核地图继续在初始化时动态导入 SDK 与 CSS。
- 生产构建将全局入口 CSS 从 284,104 B 降到 214,257 B，减少 69,847 B；生成独立的 69,848 B `maplibre-gl.*.css`，非地图页面不再为地图控件下载这部分样式。
- 构建门禁新增 MapLibre CSS 唯一性、80 KiB 预算、全局/路由泄漏检查和动态路由入口检查；后台资源编辑、流程编辑、现场观测和研究说明均加入路由 JavaScript 预算。
- `scripts/check-client-bundle-budget.test.ts` 新增全局地图样式泄漏和路由失去动态入口时的失败场景；当前脚本测试基线为 254 项。研究说明页当前不加载图片，后台和研究功能仍只在进入对应路由后加载。

### 2.7 地图显示设置组件拆分（2026-07-16）

- `app/pages/map/index.vue` 的图层显示设置面板已抽取为 `app/components/map/DisplaySettingsPanel.vue`。新组件只接收 `MapBaseStyle` 与 `MapDisplayOptions`，通过类型化事件请求关闭、底图切换、图层开关和名称大小变更；路由、provider 创建和错误处理仍由页面负责。
- 地图页从 64,939 B / 1,752 行降至 60,590 B / 1,650 行，减少 4,349 B（约 6.7%）；独立组件为 4,638 B。生产构建地图路由初始 JavaScript 为 635,283 B，较拆分前略增，因此本项证明可维护性边界改善，不作为客户端体积下降证据。
- `scripts/map-display-settings.test.ts` 固定页面与展示组件的职责边界；Playwright 新增桌面和 Pixel 5 场景，真实打开设置面板、关闭名称图层并关闭面板。当前脚本测试 254/254、浏览器检查 38/38。

### 2.8 地图搜索规则模块化（2026-07-16）

- `app/utils/map-search.ts` 现在集中处理地图搜索词规范化、教学楼/楼后缀互换、类别关键词、已审核地点常用词，以及区域名称、描述、面积和周长匹配。模块只依赖类型和传入数据，不访问 Vue 状态、路由或 provider。
- 地图页保留搜索输入状态、筛选组合、高德原生搜索调用与结果去重编排；源码由 60,590 B / 1,650 行进一步降至 58,427 B / 1,586 行。相对拆分前累计减少 6,512 B 和 166 行（约 10.0%）。
- `scripts/map-search.test.ts` 新增 4 项行为测试，覆盖中英文大小写与标点、教学楼别名、地点名称/类别/常用词和区域文字/尺寸匹配。当前完整工程门禁 254/254、浏览器检查 38/38；该阶段生产地图路由初始 JavaScript 为 635,291 B，未据此宣称运行时体积下降。

### 2.9 地图地点详情组件拆分（2026-07-16）

- 桌面和移动端原有的重复地点详情模板已统一到 `app/components/map/PlaceDetailsPanel.vue`。组件只接收类型化地点、学生使用清单、距离、路线和状态 props，并发出关闭、复制和路线规划事件；路由、剪贴板、详情/纠错链接、外部导航和 provider 生命周期仍由页面编排。
- `app/pages/map/index.vue` 现为 49,733 B / 1,345 行，新组件为 7,143 B / 248 行；相对最初 64,939 B / 1,752 行累计减少 15,206 B 和 407 行（约 23.4%）。生产地图路由初始 JavaScript 为 635,360 B，MapLibre SDK 1,053,439 B 与 CSS 69,848 B 继续保持独立动态资源。
- `scripts/map-place-details.test.ts`、`scripts/campus-map-reference.test.ts` 和 `scripts/public-route-integrity.test.ts` 固定共享组件及页面职责边界。Playwright 地点路径同时断言“到这里前先确认”和自定义条目“核对地点名称和入口标识。”；为此修复了 `scripts/prepare-e2e-database.ts` 中缺少中文方括号标记、导致解析器静默使用默认清单的测试数据契约问题。
- 当前累计证据：`pnpm test` 为 254/254；`pnpm check` 返回 0、耗时约 150.2 秒；`pnpm e2e:run` 返回 0、命令总耗时 34.1 秒，桌面 Chromium 与 Pixel 5 共 38/38 通过。

### 2.10 地图定位与步行路线编排拆分（2026-07-16）

- `app/composables/useMapGeolocation.ts` 统一持有定位中、路线规划中、路线摘要和目的地名称状态，并处理不支持定位、非高德 provider、无坐标、定位拒绝和 provider 失败提示。地图页只注入 provider 引用、provider ID 和通知函数，不再直接访问 `navigator.geolocation`。
- `app/utils/map-geolocation.ts` 提供无 Vue 运行时依赖的定位 Promise、浏览器坐标到显式 WGS84 `GeoPoint` 的转换、定位/路线超时参数、路线摘要格式和 provider 路线调用。新增 `scripts/map-geolocation.test.ts` 的 5 项行为测试，覆盖距离与分钟舍入、定位参数、WGS84 起点、权限失败、GCJ-02 终点透传，以及定位等待期间读取最新 provider 的竞态。
- 地图页由 49,733 B / 1,345 行降至 47,045 B / 1,267 行；composable 为 3,451 B / 112 行，纯工具为 1,637 B / 51 行。相对最初 64,939 B / 1,752 行累计减少 17,894 B 和 485 行（约 27.6%）。
- 生产地图路由初始 JavaScript 为 635,966 B，较上一阶段增加 606 B，但仍在预算内；MapLibre SDK 1,053,439 B 与 CSS 69,848 B 继续保持独立动态资源。本项只作为职责和可测试性改善，不作为运行时体积下降证据。
- 当前验证：脚本测试 254/254、`pnpm check` 返回 0（约 150.2 秒）、Playwright 38/38（命令总耗时 34.1 秒，测试执行 31.2 秒）。真实定位权限、真实高德路线插件、Android/iOS 和微信 WebView 仍需真机验收。

### 2.11 高德原生搜索编排拆分与去重修复（2026-07-16）

- `app/composables/useMapNativeSearch.ts` 统一持有临时地点结果、loading 和 320 ms 防抖计时器，并使用纯工具提供的最新请求门禁；仅在高德 provider、地理地图模式和非空查询下搜索。查询变化或组件卸载会使旧版本失效，失败时归零当前结果，旧请求不能覆盖新查询。
- `app/utils/map-native-search.ts` 将高德 `MapPoi` 转为 `native-map-session` 地点，固定 GCJ-02、非发布/非核验状态及 `uri.amap.com` 导航参数。正式目录去重改为分别规范化名称、地址和搜索文本，修复旧逻辑无法识别“图书馆”与“仰恩大学图书馆”为同一地点的问题。
- 地图页不再直接调用 `searchVisiblePois` 或持有原生搜索计时器/版本号，由 47,045 B / 1,267 行降至 44,530 B / 1,211 行。新 composable 为 2,466 B / 79 行，纯工具为 2,899 B / 92 行；相对最初累计减少 20,409 B 和 541 行（约 31.4%）。
- `scripts/map-native-search.test.ts` 新增 4 项纯规则测试，覆盖临时地点字段与导航参数、默认作用域、正式目录别名去重，以及新请求或取消使旧响应失效。生产地图路由初始 JavaScript 为 636,770 B，较上一阶段增加 804 B，但仍在预算内；本项不作为运行时体积下降证据。
- 当前验证：脚本测试 254/254、`pnpm check` 返回 0（约 150.2 秒）、Playwright 38/38（命令总耗时 34.1 秒，测试执行 31.2 秒）。真实高德 PlaceSearch 服务和网络条件仍需生产/真机验收。

### 2.12 地图 URL 状态同步与区域故障交互（2026-07-16）

- `app/composables/useMapRouteSync.ts` 统一处理 180 ms 查询写回、浏览器路由恢复、provider 选中/视野副作用和列表滚动；恢复 watcher 使用 immediate，首次页面加载与后续前进后退走同一逻辑。新路由恢复会清除未执行写回并递增恢复版本，旧 `nextTick` 后的副作用不能覆盖新状态。
- `app/utils/map-route-state.ts` 提供无 Vue 依赖的查询值读取、scope/category 校验、slug/id 地点解析、区域解析、地点优先于区域、默认字段删除、未知字段保留和筛选变化判断。`scripts/map-route-state.test.ts` 新增 5 项测试，覆盖字符串/数组查询、非法值、地点/区域优先级、`scope/from` 保留和筛选差异。
- 自动选中现在优先保留查询结果中已经明确选中的地点或区域；`?q=学生街&area=wia-area-2003534061878101222` 不会被同名的“新区学生街”覆盖。provider 挂载也会应用首次解析的区域 ID。
- 新增桌面/移动浏览器场景验证直达区域 URL、显示“旧区学生街”、关闭详情和移除 `area`。首次执行捕获地图错误遮罩 `z-20` 挡住区域详情 `z-10` 的真实交互问题；区域详情提升至 `z-30` 后，即使外部瓦片失败也可操作，最终 38/38 通过。
- 地图页由 44,530 B / 1,211 行降至 42,215 B / 1,152 行；composable 为 4,099 B / 125 行，纯工具为 2,691 B / 87 行。相对最初 64,939 B / 1,752 行累计减少 22,724 B 和 600 行（约 35.0%）。生产地图路由初始 JavaScript 为 638,012 B，较上一阶段增加 1,242 B，仍在预算内；本项不作为运行时体积下降证据。
- 最新验证：脚本测试 254/254、`pnpm check` 返回 0（约 150.2 秒）、Playwright 38/38（命令总耗时 34.1 秒，测试执行 31.2 秒）。真实浏览器返回栈、微信 WebView 和生产高德服务仍需真机/生产验收。

### 2.13 地图 provider 生命周期拆分（2026-07-16）

- `app/composables/useMapProviderLifecycle.ts` 统一负责 provider 创建、挂载、事件注册、初始显示配置、标点/区域/显示选项更新、侧栏变化后的 resize、错误重试和卸载销毁。页面继续持有 provider 引用、选中状态以及搜索、路线与 URL 同步所需的业务状态，但不再直接导入或调用 `createRuntimeMapProvider`。
- `app/utils/map-provider-lifecycle.ts` 提供无 Vue 依赖的挂载版本门禁和初始化函数。创建完成与挂载完成后都会核对当前请求；旧请求、挂载失败和卸载期间产生的半成品 provider 均会销毁，旧 provider 的选点、选区和错误事件不能覆盖新状态。挂载期间收到 provider 错误时，composable 不会用后续 `ready` 状态覆盖错误。
- `scripts/map-provider-lifecycle.test.ts` 新增 6 项 Fake Provider 测试，覆盖 zoom 15 与显示快照应用、地点选中及飞行、区域恢复、无选中时适配视野、创建前/挂载中请求失效、挂载失败销毁和过期事件隔离；旧页面内 resize 与区域初始化源码契约已迁到新生命周期边界。
- 地图页由 42,215 B / 1,152 行降至 40,597 B / 1,105 行；生命周期 composable 为 4,265 B / 125 行，纯工具为 2,448 B / 96 行。相对最初 64,939 B / 1,752 行累计减少 24,342 B 和 647 行（按字节约 37.5%）。生产地图路由初始 JavaScript 为 639,409 B，较上一阶段增加 1,397 B，仍在预算内；本项不作为运行时体积下降证据。
- 最新验证：脚本测试 260/260、`corepack pnpm check` 返回 0（152.3 秒）、Playwright 38/38（命令总耗时 35.4 秒，测试执行 33.3 秒）；本地首页、地图、Logo 和 `/api/health` 均返回 200。真实高德 SDK、微信 WebView、Android/iOS、真实屏幕阅读器和生产部署仍需外部环境验收。

### 2.14 后台流程步骤与材料编辑组件拆分（2026-07-16）

- `app/components/admin/AdminProcedureStepsEditor.vue` 负责步骤标题、说明、适用人群、信息状态、时间、地点、部门和办理链接，并通过类型化事件请求新增、移动、删除和受众切换；组件不访问路由、API 或保存 payload。
- `app/components/admin/AdminProcedureMaterialsEditor.vue` 负责材料名称、说明、适用人群、信息状态、三态必需性、提交地点和负责部门；`app/components/admin/procedure-editor-types.ts` 统一步骤、材料、受众和选择项表单契约，页面与两个组件不再复制结构定义。
- 页面继续负责唯一临时 key、受众切换、表单校验、payload 构建、请求、鉴权和发布状态。流程页由 58,978 B / 1,749 行降至 46,620 B / 1,433 行，减少 12,358 B 和 316 行（按字节约 21.0%）；步骤组件为 6,068 B / 192 行，材料组件为 6,227 B / 192 行，共享类型为 885 B / 43 行。
- `scripts/admin-procedure-editor.test.ts` 新增 4 项源码边界测试，覆盖页面委托、完整字段契约、类型化事件、三态材料要求和无路由/API 依赖。Playwright 既有管理员闭环在同一认证会话中增加桌面/移动步骤与材料新增、输入、下移和删除操作；首次独立场景暴露共享服务器登录限流，最终通过复用既有认证会话修复，未修改或放宽生产限流。
- 最新验证：脚本测试 264/264、`corepack pnpm check` 返回 0（150.9 秒）、Playwright 38/38（测试执行 49.3 秒）；本地 `/admin/procedures` 与 `/api/health` 均返回 200。后台流程路由初始 JavaScript 为 656,015 B，较前一基线增加 1,727 B 但无预算违规；本项不作为运行时体积下降证据。

### 2.15 校园平面图恢复（2026-07-16）

- 按维护者明确要求，恢复 `public/images/yeu-campus-plan-2025.jpg`、`officialCampusPlanReference.localAssetUrl` 和原有缩放/重置/失败降级/编号热点组件；地图模式入口由“文字索引”改回“平面图”。
- 恢复文件为仓库原先审核过的同一官网快照：`8504×3898`、1,250,742 B、SHA-256 `30f50d50492335b0aa8859cb435b17f8b76c9bceebdb81d5b360139de4d7335d`。定向测试核对精确字节、哈希、47 项编号覆盖、热点点击、缩放控件、官网来源和“仅作相对方位参考、不作为导航坐标”说明。
- 媒体体积门禁只为该已登记、平面图视图按需使用的大图设置精确字节例外；其他公开栅格图仍受 256 KiB 上限约束，小红书研究衍生图和旧学校 Logo 仍禁止进入公开目录。
- 本地 `/images/yeu-campus-plan-2025.jpg` 返回 200、`image/jpeg` 和 1,250,742 B。维护者恢复要求与技术完整性记录不等同于学校或相应权利人的公开再分发授权；正式发布前仍需补齐授权，或退回官网外链模式。
- 最终验证：脚本测试 269/269、`corepack pnpm check` 返回 0（154.3 秒）、Playwright 40/40（命令总耗时 38.9 秒，测试执行 36.7 秒）；桌面和移动均验证 `8504×3898` 自然尺寸、08 号热点、官网来源和非导航说明。生产图片 SHA-256 与登记值一致，Service Worker 不引用该文件。地图路由初始 JavaScript 为 643,670 B，仍在预算内。

### 2.16 后台流程基础、时效与关联表单拆分（2026-07-16）

- `AdminProcedureBasicsEditor`、`AdminProcedureTimingEditor`、`AdminProcedureRelationsEditor` 分别接管公开标识/受众、确认状态/时效、部门/指南/地点/来源字段；完整 `ProcedureForm` 迁入 `procedure-editor-types.ts`，页面不再复制字段结构。
- 三个组件使用命名 `defineModel('form')`，页面通过 computed getter/setter 提供响应式表单模型；初次直接修改 `form` prop 被 ESLint 的 `vue/no-mutating-props` 阻断后，未关闭规则或增加例外，而是改为正式模型契约。
- 浏览器回归实际填写标题、slug、摘要、前台状态和办理时长，并验证关联来源控件。首次运行发现 USelectMenu 的外层字段文本没有成为控件可访问名称；四个关联选择器补充明确 `aria-label` 后，桌面和移动均可用稳定语义定位。
- 流程页由第八阶段 46,620 B / 1,433 行降至 38,357 B / 1,191 行；相对最初 58,978 B / 1,749 行累计减少 20,621 B 和 558 行（按字节约 35.0%）。基础、时间、关联组件分别为 3,015 B / 113 行、2,681 B / 103 行和 2,397 B / 84 行，共享类型为 1,533 B / 74 行。
- 最终验证与平面图恢复共用同一当前工作区门禁：脚本测试 269/269、`corepack pnpm check` 返回 0（154.3 秒）、Playwright 40/40（测试执行 36.7 秒）。后台流程路由初始 JavaScript 为 657,958 B，无预算违规；本项不作为运行时体积下降证据。

### 2.17 后台流程表单规则纯工具拆分（2026-07-16）

- `app/utils/admin-procedure-form.ts` 接管表单错误优先级、slug/受众/步骤/材料/URL/日期范围校验、日期本地值与 ISO 值转换，以及 payload 的文本修剪、空值规范化、数组复制和临时 key 清理；该工具不依赖 Vue、路由或请求层。
- `app/pages/admin/procedures.vue` 继续负责引用数据加载、请求、鉴权、保存和发布状态，只消费 `validateProcedureForm` 与 `buildProcedurePayload` 的结果。流程页由 38,357 B / 1,191 行降至 34,500 B / 1,086 行，减少 3,857 B 和 105 行；相对最初 58,978 B / 1,749 行累计减少 24,478 B 和 663 行（按字节约 41.5%）。纯工具为 4,161 B / 103 行。
- `scripts/admin-procedure-form.test.ts` 新增 5 项测试，覆盖 14 条用户可见错误的既定优先级、构造结果通过服务端 `createProcedureSchema`、文本与日期规范化、空字段/非法日期降级、数组独立复制和页面委托；相关编辑器与规则定向测试 13/13。
- 最终验证：脚本测试 274/274、`corepack pnpm check` 返回 0（153.8 秒）、Playwright 桌面/移动共 40/40（命令总耗时 35.4 秒）。客户端构建预算无违规；后台流程路由初始 JavaScript 为 657,965 B，较上一阶段增加 7 B，本项不作为客户端运行时体积下降证据。本地 `/admin/procedures`、`/map`、`/images/yeu-campus-plan-2025.jpg` 和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 仍未预缓存原图。

### 2.18 后台流程异步编辑与发布状态拆分（2026-07-16）

- `useAdminProcedureOperations` 统一提供编辑器开关/加载、当前编辑 ID、保存错误、行操作、删除确认及其 loading 状态；页面注入请求、引用加载、列表刷新、鉴权跳转和通知，不再本地实现编辑详情、保存、发布、下架或删除函数。
- `app/utils/admin-procedure-operations.ts` 提供运行时无 Vue 依赖的请求编排：编辑请求使用版本门禁，旧成功响应、旧错误以及已进入异步鉴权处理的旧错误都不能覆盖新会话；保存、行操作和删除均阻止重复提交，删除操作固定提交开始时的目标。`app/utils/request-error.ts` 统一解析顶层/响应状态码和服务端消息，不把非字符串值当作可信提示。
- 页面四个桌面/移动发布/下架按钮在其他行操作进行时明确禁用，避免点击后静默忽略。流程页由 34,500 B / 1,086 行降至 30,827 B / 971 行，减少 3,673 B 和 115 行；相对最初 58,978 B / 1,749 行累计减少 28,151 B 和 778 行（按字节约 47.7%）。composable 为 1,452 B / 40 行，请求编排工具为 6,310 B / 199 行，错误工具为 1,092 B / 28 行。
- `scripts/admin-procedure-operations.test.ts` 新增 9 项行为测试，覆盖错误解析、编辑成功/错误竞态、新建失效旧请求、重复保存、POST/PATCH、服务端错误、发布/下架互斥、删除目标快照和鉴权失败；后台编辑器、表单规则与异步操作定向测试共 22/22。
- 最终验证：脚本测试 283/283、`corepack pnpm check` 返回 0（155.4 秒）、Playwright 桌面/移动共 40/40（命令总耗时 35.8 秒）。客户端构建预算无违规；后台流程路由初始 JavaScript 为 659,691 B，较上一阶段增加 1,726 B，本项不作为客户端运行时体积下降证据。本地 `/admin/procedures`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。

### 2.19 后台流程列表与关联数据读取拆分（2026-07-16）

- `useAdminProcedureCatalog` 统一持有列表、总数、页码、搜索词、状态筛选、列表 loading/error、关联数据及其 loading/error/loaded 状态，并负责 300 ms 搜索防抖、筛选后回到第一页和卸载取消；页面仅调用加载方法并消费响应式结果。
- `app/utils/admin-procedure-catalog.ts` 提供运行时无 Vue 依赖的列表/关联数据控制器：查询会修剪空白并省略默认筛选；全量分页保留 kind 等稳定字段，并在总数未满足但空页不前进时抛错；越界页自动回退并只重载一次。列表和关联数据使用独立版本门禁，旧成功、旧错误、强制刷新前的旧快照及异步鉴权中的旧失败均不能覆盖当前状态。
- 关联快照继续并行读取部门、指南、地点和来源，并在客户端排除已归档的部门、指南与地点。流程页由 30,827 B / 971 行降至 27,504 B / 873 行，减少 3,323 B 和 98 行；相对最初 58,978 B / 1,749 行累计减少 31,474 B 和 876 行（按字节约 53.4%）。catalog composable 为 1,638 B / 58 行，纯控制器为 6,122 B / 191 行。
- `scripts/admin-procedure-catalog.test.ts` 新增 8 项行为测试，覆盖查询规范化、多页聚合、空页终止、旧搜索成功/错误失效、越界页回退、四类关联过滤、强制刷新覆盖在途快照，以及鉴权/普通错误状态区分；后台编辑器、表单、写操作和读取操作定向测试共 30/30。
- 最终验证：脚本测试 291/291、`corepack pnpm check` 返回 0（149.9 秒）、Playwright 桌面/移动共 40/40（命令总耗时 36.9 秒）。客户端构建预算无违规；后台流程路由初始 JavaScript 为 661,144 B，较上一阶段增加 1,453 B，本项不作为客户端运行时体积下降证据。本地 `/admin/procedures`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。

### 2.20 后台流程表单模型拆分（2026-07-16）

- `useAdminProcedureFormModel` 持有响应式 `ProcedureForm` 和命名 form model，并把重置、详情填充、受众切换、步骤/材料新增/删除/移动及三态材料要求适配为页面和子组件所需的回调；页面不再自行维护临时 key 或直接 splice 有序项。
- `app/utils/admin-procedure-form-model.ts` 提供运行时无 Vue 依赖的表单控制器：默认表单维持双受众、线下办理和“等待学校当年通知”；API 可空字段映射为空输入值，日期复用已测试的本地时间转换，关联对象只保留 ID；表单、步骤和材料受众数组均深拷贝，修改编辑表单不会改写详情响应对象。
- 临时 key 在控制器生命周期内单调递增，重置、详情映射和后续新增不会重复。受众添加幂等、取消会清除重复值；删除/移动拒绝负数、小数和越界索引，修复潜在的 `splice(-1, 1)` 误删末项风险。流程页由 27,504 B / 873 行降至 23,260 B / 728 行，减少 4,244 B 和 145 行；相对最初 58,978 B / 1,749 行累计减少 35,718 B 和 1,021 行（按字节约 60.6%）。composable 为 1,569 B / 39 行，纯控制器为 5,733 B / 188 行。
- `scripts/admin-procedure-form-model.test.ts` 新增 6 项测试，覆盖默认值与 key、详情空值/日期/关联映射、深拷贝、受众幂等、移动/删除边界、材料三态和页面委托；后台流程相关定向测试共 36/36。
- 最终验证：脚本测试 297/297、`corepack pnpm check` 返回 0（152.3 秒）、Playwright 桌面/移动共 40/40（命令总耗时 38.0 秒）。客户端构建预算无违规；后台流程路由初始 JavaScript 为 662,240 B，较上一阶段增加 1,096 B，本项不作为客户端运行时体积下降证据。本地 `/admin/procedures`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。

### 2.21 后台流程展示规则拆分（2026-07-16）

- `app/utils/admin-procedure-presentation.ts` 统一定义受众、办理方式、信息状态、发布状态和材料要求选项，并提供办理方式/信息状态标签、状态颜色、发布日期展示及部门/指南/地点/来源选项构造；工具运行时不依赖 Vue、路由或请求层。
- 受众标签先按值去重再判断：空数组、单本科、单专升本和双受众各有稳定输出；重复两次同一受众不会再因数组长度为 2 被误显示为“双受众”。空日期、无效日期和有效时间戳分别输出“未设置”“日期无效”和固定中文日期格式。
- 部门/指南选项包含显式“不关联”项和发布状态；地点选项按使用位置决定是否包含空项，并组合地址与发布状态；来源选项组合来源等级与有效/不可用/争议状态。流程页由 23,260 B / 728 行降至 20,493 B / 620 行，减少 2,767 B 和 108 行；相对最初 58,978 B / 1,749 行累计减少 38,485 B 和 1,129 行（按字节约 65.3%）。纯展示工具为 4,600 B / 149 行。
- `scripts/admin-procedure-presentation.test.ts` 新增 7 项测试，覆盖全部静态选项、重复受众、标签/颜色、缺失/无效/有效日期、内容/地点/来源选择项和页面委托；后台流程相关定向测试共 43/43。
- 最终验证：脚本测试 304/304、`corepack pnpm check` 返回 0（153.7 秒）、Playwright 桌面/移动共 40/40（命令总耗时 36.2 秒）。客户端构建预算无违规；后台流程路由初始 JavaScript 为 662,540 B，较上一阶段增加 300 B，本项不作为客户端运行时体积下降证据。本地 `/admin/procedures`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。

### 2.22 现场采点离线队列组件拆分（2026-07-16）

- `AdminCoordinateOfflineQueuePanel` 接管本机 IndexedDB 队列的完整展示面：总同步状态、逐条错误、展开/收起、现场说明、客户端幂等 ID、经纬度/精度/采集时间样本表、逐条重试、删除入口和确认弹窗。组件只接收记录/地点/操作状态并发出同步、重试、请求删除和确认删除事件，不导入 `$fetch` 或任何队列读写函数。
- 展开 ID 由组件本地持有；删除或同步后记录从 props 消失时自动清理旧展开状态。`app/utils/field-observation-presentation.ts` 统一日期与地点名称：无效时间不再让 `Intl.DateTimeFormat` 抛错，而是显示“时间无效”；不存在的 place ID 显示“未知地点”。页面继续负责 IndexedDB 读取、幂等提交、同步/重试/删除、服务端审核和定位会话。
- 现场采点页由 39,183 B / 1,068 行降至 32,034 B / 877 行，减少 7,149 B 和 191 行（按字节约 18.2%）。离线队列组件为 7,948 B / 227 行，纯展示工具为 596 B / 20 行。
- `scripts/admin-field-observation-queue-panel.test.ts` 新增 4 项测试，覆盖有效/无效日期、地点回退、页面委托、类型化事件、展开状态清理和组件无存储/API 依赖；连同既有队列幂等 ID 测试，定向测试共 6/6。
- Playwright 既有管理员闭环复用同一认证会话，在隔离浏览器 IndexedDB 写入一条受控离线记录；桌面和移动端均验证“未知地点”、展开现场说明/客户端 ID/七位小数坐标、删除确认，以及删除后队列从页面消失。初次定向运行只因测试期望的一级标题与实际可访问标题不一致而失败，按真实“现场坐标观测”名称修正，未改生产 UI 或放宽定位规则。
- 最终验证：脚本测试 308/308、`corepack pnpm check` 返回 0（156.0 秒）、Playwright 桌面/移动共 40/40（命令总耗时 36.0 秒）。客户端构建预算无违规；现场采点路由初始 JavaScript 为 575,087 B，较上一基线增加 1,112 B，本项不作为客户端运行时体积下降证据。本地 `/admin/field-observations`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实定位权限、弱网重试、Android/iOS 和微信 WebView 仍需真机验收。

### 2.23 现场采点双重核验提示规则拆分（2026-07-16）

- `app/utils/field-observation-review.ts` 统一 Haversine 米制距离和审核提示构造，保持原页面使用的 6,371,000 m 地球半径及服务端共享的距离/同方法时间阈值。无观测或无地点时返回空提示，避免模板自行推导不完整状态。
- 已 verified 地点区分待批准新观测与现有双证据说明；非 pending 的 approved、rejected、superseded 分别呈现首条候选或历史不参与状态；pending 观测依次检查候选 WGS84 坐标/角色、角色一致性和距离阈值。只有角色与距离相符时显示 `possible-dual`，并明确仍须由服务端核对采集方法与时间独立性，前端提示不直接升级地点状态。
- 审核状态标签/颜色和主入口/场地点标签迁入 `field-observation-presentation.ts`，页面不再重复状态映射。现场采点页由 32,034 B / 877 行降至 27,720 B / 768 行，减少 4,314 B 和 109 行；相对最初 39,183 B / 1,068 行累计减少 11,463 B 和 300 行（按字节约 29.3%）。审核提示工具为 4,167 B / 108 行，展示工具为 1,405 B / 47 行。
- `scripts/admin-field-observation-review.test.ts` 新增 8 项测试，覆盖距离单位/对称性、verified 新旧证据、approved/rejected/superseded、四种缺失/不兼容候选、角色不符、超距、可能双证据、状态标签/颜色、角色标签和页面委托；现场采点相关定向测试共 14/14。
- 最终验证：脚本测试 316/316、`corepack pnpm check` 返回 0（154.1 秒）、Playwright 桌面/移动共 40/40（命令总耗时 38.8 秒）。客户端构建预算无违规；现场采点路由初始 JavaScript 为 575,108 B，较上一阶段增加 21 B，本项不作为客户端运行时体积下降证据。本地 `/admin/field-observations`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实双人/双时段现场证据和定位硬件仍需现场验收。

### 2.24 现场采点离线队列操作控制器拆分（2026-07-16）

- `useFieldObservationQueue` 统一创建队列记录、提交中、批量同步、单条重试、逐条错误、删除弹窗/目标/删除中状态，并注入现有 `ensure/enqueue/list/remove` IndexedDB 函数。组件和页面继续使用同一响应式状态，未迁移或改变数据库名、版本、对象仓库、keyPath 或记录结构。
- `app/utils/field-observation-queue-operations.ts` 提供运行时无 Vue/路由/请求依赖的操作控制器。读取请求使用版本门禁；首次提交与单条重试阻止重复点击；批量同步与单条重试互斥；删除固定提交开始时的目标。服务端状态码为空或 5xx 才进入本地兜底，422 等业务错误显示服务端消息，401/403 交给登录跳转，均不会写入离线队列。
- 批量同步普通失败会继续后续记录、保留逐条错误并报告成功/失败准确数量。若前序记录已成功删除而后续记录发生鉴权失效，控制器停止剩余提交，但仍刷新 IndexedDB 与审核列表；修复旧实现直接 return 导致已同步记录暂时残留在页面的问题。
- 现场采点页由 27,720 B / 768 行降至 23,605 B / 650 行，减少 4,115 B 和 118 行；相对最初 39,183 B / 1,068 行累计减少 15,578 B 和 418 行（按字节约 39.8%）。composable 为 1,583 B / 45 行，纯控制器为 6,744 B / 202 行。
- `scripts/admin-field-observation-queue-operations.test.ts` 新增 9 项测试，覆盖旧读取失效、幂等 ID 与重复提交、5xx/网络离线入队、本地队列失败、4xx/鉴权不入队、单条重试互斥、普通部分失败汇总、鉴权中止刷新、删除目标快照和页面委托；现场采点相关定向测试共 23/23。
- 最终验证：脚本测试 325/325、`corepack pnpm check` 返回 0（154.5 秒）、Playwright 桌面/移动共 40/40（命令总耗时 36.7 秒）。客户端构建预算无违规；现场采点路由初始 JavaScript 为 577,225 B，较上一阶段增加 2,117 B，本项不作为客户端运行时体积下降证据。本地 `/admin/field-observations`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实断网/恢复、浏览器配额耗尽和移动端后台挂起仍需真机弱网验收。

### 2.25 现场采点审核操作控制器拆分（2026-07-16）

- `useFieldObservationReview` 统一审核说明、当前操作 ID、批准/驳回请求和对应提示，并注入现有请求、鉴权处理、地点/观测刷新与通知函数；页面继续持有加载数据、定位采集会话、地图选择和视图组合职责。
- `app/utils/field-observation-review-operations.ts` 提供运行时无 Vue/路由依赖的审核控制器。只允许 pending 观测提交；说明先修剪且至少 5 个字符；任一审核请求进行时全局阻止其他批准/驳回，页面按钮也明确反映该互斥状态。成功后刷新地点与观测并清空说明；普通请求错误保留说明并显示服务端消息，401/403 交给鉴权导航且不重复显示通用错误。
- 批准成功提示区分首条候选证据和由服务端确认的第二条核验证据，驳回使用独立提示。客户端仍不自行批准观测或把地点升级为 verified，服务端继续是审核结果和双重核验规则的唯一权威。
- 现场采点页由 23,605 B / 650 行降至 22,796 B / 631 行，减少 809 B 和 19 行；相对最初 39,183 B / 1,068 行累计减少 16,387 B 和 437 行（按字节约 41.8%）。composable 为 1,397 B / 39 行，纯控制器为 2,563 B / 75 行。
- `scripts/admin-field-observation-review-operations.test.ts` 新增 7 项测试，覆盖非 pending 拒绝、说明修剪/长度、全局互斥、批准首条/第二条证据与驳回提示、成功刷新清空、普通失败保留说明和鉴权委托；完整脚本测试为 332/332。
- 最终验证：`corepack pnpm check` 返回 0（154.2 秒），Playwright 桌面/移动共 40/40（命令总耗时 35.3 秒）。客户端构建预算无违规；现场采点路由初始 JavaScript 为 577,959 B，较上一阶段增加 734 B，本项不作为客户端运行时体积下降证据。本地 `/admin/field-observations`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实审核人员协作、真实定位、弱网、Android/iOS 和微信 WebView 仍需现场/真机验收。

### 2.26 现场采点地点与观测目录控制器拆分（2026-07-16）

- `useFieldObservationCatalog` 统一地点/观测列表、选中 ID、搜索输入/已应用搜索、状态、页码、每页条数、总数、加载和错误状态，并负责 350 ms 搜索防抖、筛选回到第一页、页码监听及卸载取消。页面继续组合定位采集、离线队列、审核操作、审核提示和地图详情。
- `app/utils/field-observation-catalog.ts` 提供运行时无 Vue/路由/请求实现依赖的目录控制器。查询构造会修剪搜索文本并省略“全部状态”；地点副本按缺坐标优先、中文名称排序，不修改响应数组。地点和观测各有独立请求版本，旧成功、旧失败和卸载后的响应均不能覆盖当前状态。
- 地点与观测错误改为独立状态，成功重试不会误清除另一目录的错误。观测响应使用服务端实际 `pageSize` 计算最大页；越界时先回退页码并保留原详情，等待新页响应后再恢复选中项，避免空的越界响应清除当前审核上下文。
- 现场采点页由 22,796 B / 631 行降至 18,291 B / 519 行，减少 4,505 B 和 112 行；相对最初 39,183 B / 1,068 行累计减少 20,892 B 和 549 行（按字节约 53.3%）。composable 为 2,808 B / 84 行，纯控制器为 5,234 B / 157 行。
- `scripts/admin-field-observation-catalog.test.ts` 新增 8 项测试，覆盖查询规范化、地点不可变排序与初选、旧地点响应失效、旧观测错误失效、服务端分页大小、选中项保留、鉴权/普通错误隔离和页面委托；完整脚本测试为 340/340。
- 最终验证：`corepack pnpm check` 返回 0（157.3 秒），Playwright 桌面/移动共 40/40（命令总耗时 39.1 秒）。客户端构建预算无违规；现场采点路由初始 JavaScript 为 579,241 B，较上一阶段增加 1,282 B，本项不作为客户端运行时体积下降证据。本地 `/admin/field-observations`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实并发管理员、定位硬件、断网恢复、Android/iOS 和微信 WebView 仍需现场/真机验收。

### 2.27 现场采点审核详情组件拆分（2026-07-16）

- `AdminCoordinateObservationReviewDetails` 接管选中观测状态、校界提示、精度、坐标、采集方式/时间、证据说明、双重核验提示、审核地图、审核说明输入、批准/驳回按钮及历史审核记录。组件只接收 `ApiCoordinateObservation`、当前地点、地点目录和操作 ID，不读取 API、路由或鉴权状态。
- 组件使用命名 `reviewNote` model 和类型化 `review(observation, approve|reject)` 事件。页面通过 getter/setter computed 把该单值模型映射到既有 `reviewNotes[observationId]`；切换观测后各自未提交说明仍被隔离保留，审核成功后的说明清理由现有审核控制器负责。
- 批准按钮继续同时检查全局审核互斥、最大可批准精度和校界缓冲区，驳回也阻止跨记录重叠；组件只显示 `buildCoordinateReviewHint` 的解释结果，不批准观测、不组合双证据、不升级地点。服务端仍是审核与 verified 状态的唯一权威。
- 现场采点页由 18,291 B / 519 行降至 12,451 B / 380 行，减少 5,840 B 和 139 行；相对最初 39,183 B / 1,068 行累计减少 26,732 B 和 688 行（按字节约 68.2%）。详情组件为 5,887 B / 180 行。
- `scripts/admin-field-observation-review-details.test.ts` 新增 3 项测试，覆盖详情/地图/历史展示所有权、说明模型、批准/驳回事件、互斥/精度门禁、无网络/路由副作用和页面按观测 ID 委托；既有审核提示与操作源码契约同步指向新组件，完整脚本测试为 343/343。
- 最终验证：`corepack pnpm check` 返回 0（155.8 秒），Playwright 桌面/移动共 40/40（命令总耗时 43.4 秒）。客户端构建预算无违规；现场采点路由初始 JavaScript 为 580,188 B，较上一阶段增加 947 B，本项不作为客户端运行时体积下降证据。本地 `/admin/field-observations`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实审核人员、定位硬件、弱网、Android/iOS 和微信 WebView 仍需现场/真机验收。

### 2.28 现场采点审核列表组件拆分（2026-07-16）

- `AdminCoordinateObservationReviewList` 接管审核队列标题与总数、搜索输入、状态/每页条数筛选、加载/空状态、观测行、状态/精度/样本/角色/时间展示、当前选中样式和上下页按钮；命名 `details` 插槽保持列表与审核详情的两栏布局。
- 组件暴露 `searchInput`、`status`、`pageSize`、`page`、`selectedObservationId` 五个类型化命名 model，并只发出 `applySearch` 事件。350 ms 防抖、筛选回到第一页、请求版本、服务端页大小回退和选中项恢复仍由 `useFieldObservationCatalog` 负责；组件不调用 API、路由、watch 或审核操作。
- 页面把现有目录 refs 直接绑定到模型，并把 `AdminCoordinateObservationReviewDetails` 放入详情插槽；列表选择、分页和筛选未复制第二份状态。E2E 管理员闭环新增搜索框、状态筛选与空列表提示的可见性断言，桌面和移动端均执行。
- 现场采点页由 12,451 B / 380 行降至 6,990 B / 239 行，减少 5,461 B 和 141 行；相对最初 39,183 B / 1,068 行累计减少 32,193 B 和 829 行（按字节约 82.2%）。列表组件为 6,463 B / 191 行。
- `scripts/admin-field-observation-review-list.test.ts` 新增 3 项测试，覆盖筛选/行/分页/加载/空状态/详情插槽所有权、五个模型、搜索事件、无副作用、页面委托和浏览器断言契约；完整脚本测试为 346/346。
- 最终验证：`corepack pnpm check` 返回 0（154.3 秒），Playwright 桌面/移动共 40/40（命令总耗时 39.5 秒）。客户端构建预算无违规；现场采点路由初始 JavaScript 为 581,664 B，较上一阶段增加 1,476 B，本项不作为客户端运行时体积下降证据。本地 `/admin/field-observations`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实审核数据量、并发管理员、定位硬件、弱网、Android/iOS 和微信 WebView 仍需现场/真机验收。

### 2.29 现场采点定位采集入口组件拆分（2026-07-16）

- `AdminCoordinateCaptureEntry` 接管采点地点选项、缺坐标/核验状态标签、定位子组件、无地点状态和顶部离线队列数量/全部同步快捷入口。选择器增加显式“选择采点地点”可访问名称，桌面和移动端浏览器闭环均验证可见。
- 入口组件内部持有 `sessionLocked`，只消费 `AdminFieldCoordinateCapture` 的 `sessionLockChange`；定位跟踪或已有样本时地点选择保持禁用，子组件继续把样本绑定到采集开始时地点。入口不读取 `navigator.geolocation`，也不改变采样阈值、浏览器 payload 或客户端幂等 ID。
- 组件通过类型化 `submit(CreateCoordinateObservationPayload)` 与 `sync` 事件调用页面既有队列控制器，并公开单一 `markSubmitted(placeId)` 方法。页面把队列提交成功的地点 ID 转发给入口，入口再调用定位子组件同名方法，因此网络/离线成功边界和“只清理对应地点会话”语义保持不变。
- 现场采点页由 6,990 B / 239 行降至 5,531 B / 194 行，减少 1,459 B 和 45 行；相对最初 39,183 B / 1,068 行累计减少 33,652 B 和 874 行（按字节约 85.9%）。入口组件为 2,705 B / 95 行。
- `scripts/admin-field-observation-capture-entry.test.ts` 新增 4 项测试，覆盖地点选项/空状态/队列快捷入口、会话锁、提交/同步事件、`markSubmitted` 转发、无定位/API/路由副作用、页面委托和浏览器可访问性契约；完整脚本测试为 350/350。
- 最终验证：`corepack pnpm check` 返回 0（161.2 秒），Playwright 桌面/移动共 40/40（命令总耗时 37.8 秒）。客户端构建预算无违规；现场采点路由初始 JavaScript 为 582,785 B，较上一阶段增加 1,121 B，本项不作为客户端运行时体积下降证据。本地 `/admin/field-observations`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实定位权限/精度、断网恢复、浏览器配额、Android/iOS 和微信 WebView 仍需现场/真机验收。

### 2.30 后台通用资源响应与展示规则拆分（2026-07-16）

- `app/utils/admin-resource-presentation.ts` 统一数组、根级和嵌套 `data.items` 响应，过滤非对象行，规范化数值/字符串总数，并按配置的响应键从根级或嵌套数据读取统计；统计只保留可转换为有限数字的值，无效响应返回空快照。
- 纯工具同时负责嵌套路径与回退列、空值/布尔/数组/带 name/title/label 对象、有效/无效日期、值标签、记录 ID/标题/状态、字段跨度和原生输入类型。通用组件不再重复这些分支，模板仍使用原显示调用名，不改变配置契约。
- 组件删除本地请求状态码/消息解析，复用 `app/utils/request-error.ts` 的 `isAuthorizationError` 与 `getRequestMessage`；401/403 仍保留当前路由作为登录回跳目标，普通错误继续显示服务端消息或原回退文本。
- `AdminResourceManager.vue` 由 36,860 B / 1,137 行降至 32,355 B / 1,003 行，减少 4,505 B 和 134 行（按字节约 12.2%）；纯展示/响应工具为 5,227 B / 171 行。
- `scripts/admin-resource-presentation.test.ts` 新增 7 项测试，覆盖数组/嵌套/无效响应、统计、嵌套路径/回退列、标签/布尔/对象/数组/空值、日期、记录元信息、字段布局、输入类型、请求错误复用和页面委托；完整脚本测试为 357/357。
- 最终验证：`corepack pnpm check` 返回 0（150.6 秒），Playwright 桌面/移动共 40/40（命令总耗时 37.8 秒）。客户端构建预算无违规；后台通用资源路由初始 JavaScript 为 601,437 B，较上一基线增加 329 B，本项不作为客户端运行时体积下降证据。本地 `/admin/content`、`/admin/places`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实多管理员并发和生产数据规模仍需生产前验收。

### 2.31 后台通用资源动态表单模型拆分（2026-07-16）

- `app/utils/admin-resource-form.ts` 统一条件字段筛选和分组、文本/选择/复选框取值、创建默认值、编辑记录嵌套字段、来源关联降级、日期本地输入值、JSON 编辑文本和旧状态清理。组件只以 reactive `formState` 调用纯函数，不复制第二份表单状态。
- payload 构造统一来源 ID 按空白/逗号切分去重、有限数字、空选择、空日期、有效/无效日期、JSON 和嵌套路径；非法 JSON 保留字段标签并抛出明确错误。必填校验按当前可见字段顺序执行，隐藏的条件字段不会进入 payload 或阻止保存。
- 地点经纬度/坐标系变化采用规范化后的语义比较，字符串与数字的同值不会误清除核验；真实变化后必定清空 `coordinateVerifiedAt`，完整三元组标记 `unverified`，不完整标记 `missing`。坐标选择器继续固定 7 位小数并执行同一降级，清空操作同时清除经纬度和坐标系；非 `places` 资源不触发该副作用。客户端规则仍不能替代地点服务的发布、坐标范围和双重核验约束。
- `AdminResourceManager.vue` 由 32,355 B / 1,003 行降至 26,894 B / 834 行，减少 5,461 B 和 169 行；相对最初 36,860 B / 1,137 行累计减少 9,966 B 和 303 行（按字节约 27.0%）。纯表单工具为 8,868 B / 310 行。
- `scripts/admin-resource-form.test.ts` 新增 8 项测试，覆盖条件字段/分组、输入访问器、坐标同值/变化/缺失/非地点分支、选择/清空、初始化、默认值、来源回退、JSON、日期、嵌套 payload、必填顺序和组件委托；既有后台配置测试同步固定纯工具中的 JSON/来源/payload 契约，完整脚本测试为 365/365。
- 最终验证：`corepack pnpm check` 返回 0（154.1 秒），Playwright 桌面/移动共 40/40（命令总耗时 37.2 秒）。客户端构建预算无违规；后台通用资源路由初始 JavaScript 为 601,821 B，较上一阶段增加 384 B，本项不作为客户端运行时体积下降证据。本地 `/admin/content`、`/admin/places`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实多管理员并发、生产数据规模和地点现场核验仍需生产前/现场验收。

### 2.32 后台通用资源目录控制器拆分（2026-07-16）

- `useAdminResourceCatalog` 统一记录、总数、统计、页码、加载/错误、搜索和筛选 refs，负责 300 ms 搜索防抖、筛选回到第一页、资源 key 切换、初始化时序和卸载取消；组件继续直接消费同一响应式状态，没有复制目录快照。
- `app/utils/admin-resource-catalog.ts` 统一修剪搜索词、忽略空/全部筛选、按配置初始化筛选、请求当前 endpoint、响应规范化、页码切换和请求版本。资源切换先使旧请求失效；旧成功、旧普通错误和鉴权处理后才返回的旧请求均不能改写当前资源。
- 列表总数缩小导致当前页越界时，控制器按固定 20 条页大小回退到最后有效页并重新请求；统计与总数先更新，越界空响应不会写入记录。普通错误清空当前目录并显示服务端消息，401/403 交给登录跳转且保留当前快照。
- `AdminResourceManager.vue` 由 26,894 B / 834 行降至 24,422 B / 747 行，减少 2,472 B 和 87 行；相对最初 36,860 B / 1,137 行累计减少 12,438 B 和 390 行（按字节约 33.7%）。composable 为 2,319 B / 79 行，纯目录控制器为 4,262 B / 135 行。
- `scripts/admin-resource-catalog.test.ts` 新增 8 项测试，覆盖搜索/筛选查询、筛选重置、旧资源成功/错误失效、越界页重读、普通/鉴权错误差异、初始化取消、页码夹取、composable 防抖/资源切换和组件委托；展示测试同步把响应规范化契约指向目录控制器，完整脚本测试为 373/373。
- 最终验证：`corepack pnpm check` 返回 0（165.1 秒），Playwright 桌面/移动共 40/40（命令总耗时 38.8 秒）。客户端构建预算无违规；后台通用资源路由初始 JavaScript 为 603,129 B，较上一阶段增加 1,308 B，本项不作为客户端运行时体积下降证据。本地 `/admin/content`、`/admin/places`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实多管理员并发、生产数据规模和生产延迟仍需生产前验收。

### 2.33 后台通用资源写操作控制器拆分（2026-07-16）

- `useAdminResourceOperations` 统一编辑弹窗、当前记录、保存、表单错误、删除弹窗/目标/删除中、行操作 ID 等 refs，并从当前配置、目录、页码、表单回调、请求、鉴权和通知函数创建操作控制器；资源 key 变化和组件卸载均重置操作状态。
- `app/utils/admin-resource-operations.ts` 负责创建/编辑初始化、必填预检、POST/PUT 保存、发布/下架 PUT、DELETE、成功/失败提示、鉴权委托和目录刷新。保存、行操作和删除使用同一全局互斥门禁，组件所有桌面/移动写按钮也绑定 `writeBusy`，不再允许其他行或其他写类型并行触发。
- 每个写请求固定开始时的 endpoint、记录 ID 和操作版本；资源切换或卸载使旧成功、旧普通错误及鉴权处理后才返回的旧结果失效，不会关闭新弹窗、覆盖错误或显示旧提示。删除固定开始时目标，弹窗状态变化不能改写请求 ID；当前页仅一条且页码大于 1 时成功删除后先回退再刷新。
- `AdminResourceManager.vue` 由 24,422 B / 747 行降至 22,184 B / 671 行，减少 2,238 B 和 76 行；相对最初 36,860 B / 1,137 行累计减少 14,676 B 和 466 行（按字节约 39.8%）。composable 为 1,894 B / 53 行，纯操作控制器为 6,808 B / 222 行。
- `scripts/admin-resource-operations.test.ts` 新增 9 项测试，覆盖创建/编辑初始化、必填阻断、重复保存、POST/PUT、普通保存错误、资源重置失效、发布/下架全局互斥和消息、行操作普通/鉴权错误、删除目标快照/重复阻止/页码回退/失败保留，以及组件禁用和委托；既有展示/后台配置契约同步指向新控制器，完整脚本测试为 382/382。
- 最终验证：`corepack pnpm check` 返回 0（165.6 秒），Playwright 桌面/移动共 40/40（命令总耗时 42.9 秒）。客户端构建预算无违规；后台通用资源路由初始 JavaScript 为 605,509 B，较上一阶段增加 2,380 B，本项不作为客户端运行时体积下降证据。本地 `/admin/content`、`/admin/places`、`/map`、平面图原图和 `/api/health` 均返回 200；平面图 SHA-256 仍为登记值，Service Worker 未预缓存原图。真实多管理员同时写同一记录仍依赖服务端事务/约束，并需生产前并发验收。

### 2.34 后台通用资源编辑弹窗拆分（2026-07-16）

- `AdminResourceEditor.vue` 接管编辑 `UModal`、错误告警、地点坐标选择器、字段分组及 textarea/JSON/select/checkbox/input 渲染；标题、说明、必填标识、字段跨度、输入类型、占位符、范围和步长均继续来自 `AdminResourceConfig`，没有复制资源配置。
- 编辑器使用必填的命名 `open` model，通过 `updateField(key, value)`、`coordinatePicked(point)`、`clearCoordinates` 和 `save` 类型化事件把意图交还管理器。组件源文件不包含 `$fetch`、路由、导航、鉴权、目录或写操作控制器；表单规范化、坐标核验降级和最终写请求继续由既有表单工具及操作控制器负责。
- `AdminResourceManager.vue` 删除弹窗模板和输入访问器，保留资源配置组合、权限计算、目录/操作 composable、表单初始化/校验/payload 以及删除确认。组件由 22,184 B / 671 行降至 17,718 B / 549 行，减少 4,466 B 和 122 行；相对最初 36,860 B / 1,137 行累计减少 19,142 B 和 588 行（按字节约 51.9%）。编辑器为 5,397 B / 160 行。
- `scripts/admin-resource-editor.test.ts` 新增 4 项边界测试，覆盖弹窗/错误/坐标/动态字段所有渲染分支、命名 model、类型化事件、请求/路由隔离和管理器委托；后台配置测试同步把坐标选择器契约指向编辑器。完整脚本测试为 386/386。
- 最终验证：定向 ESLint、Nuxt typecheck 和 9 项相关测试均返回 0；`corepack pnpm check` 返回 0（165.4 秒），构建体积预算无违规；后台通用资源路由初始 JavaScript 为 606,596 B，较上一阶段增加 1,087 B，本项不作为客户端运行时体积下降证据。Playwright 桌面/移动共 40/40（命令总耗时 40.0 秒），管理员创建、编辑、发布、公开检索和下线闭环通过。本地 `/api/health`、`/admin/content`、`/admin/places`、`/map`、`/images/yeu-campus-plan-2025.jpg` 和 `/icons/site-logo.png` 均返回 200；Logo 公开文件为 8,075 B，平面图 SHA-256 仍为 `30f50d50492335b0aa8859cb435b17f8b76c9bceebdb81d5b360139de4d7335d`，Service Worker 未预缓存平面图。真实多管理员并发、生产数据规模、正式发布和生产监控仍需后续验收。

### 2.35 后台通用资源目录面板与删除确认拆分（2026-07-16）

- `AdminResourceCatalogPanel.vue` 接管统计区、搜索与筛选 model、加载错误/重试、骨架屏、桌面表格、移动卡片、空态和分页；通过 `refresh`、`changePage`、`edit`、`setPublicationStatus`、`requestDelete` 类型化事件把意图交还管理器。搜索使用命名 `searchQuery` model，筛选使用命名 `filterValues` model，不在子组件中直接改 props。组件源文件不包含 `$fetch`、路由、导航、鉴权、目录或写操作控制器。
- `AdminResourceDeleteDialog.vue` 只负责删除确认 `UModal`、目标标题说明、取消/确认按钮与 `confirm` 事件；删除请求、目标快照和页码回退仍由 `useAdminResourceOperations` 负责。
- `AdminResourceManager.vue` 删除列表与删除确认模板，保留页头、只读说明、权限计算、目录/操作 composable、表单初始化/校验/payload、编辑器组合与鉴权跳转。组件由 17,718 B / 549 行降至 5,404 B / 209 行，减少 12,314 B 和 340 行；相对最初 36,860 B / 1,137 行累计减少 31,456 B 和 928 行（按字节约 85.3%）。目录面板为 12,683 B / 378 行，删除弹窗为 1,114 B / 45 行，编辑器仍为 5,397 B / 160 行。
- `scripts/admin-resource-catalog-panel.test.ts` 新增 5 项边界测试，覆盖统计/筛选/表格/分页展示、筛选 model、行操作事件、请求/路由隔离、删除确认最小权限和管理器组合；完整脚本测试为 391/391。
- 最终验证：定向 ESLint、Nuxt typecheck 和相关脚本测试均返回 0；`corepack pnpm check` 返回 0（191.2 秒），构建体积预算无违规；后台通用资源路由初始 JavaScript 为 608,826 B，较上一阶段增加 2,230 B，本项不作为客户端运行时体积下降证据。Playwright 桌面/移动共 40/40（命令总耗时 55.3 秒，用例 51.2 秒），管理员创建、编辑、发布、公开检索和下线闭环通过。本地 `/api/health`、`/admin/content`、`/admin/places`、`/map`、`/images/yeu-campus-plan-2025.jpg` 和 `/icons/site-logo.png` 均返回 200；Logo 公开文件为 8,075 B，SHA-256 为 `48d512f6d501c700c540d57edde8e09db6b03632ab0503a3642df1602470fe7d`，平面图 SHA-256 仍为 `30f50d50492335b0aa8859cb435b17f8b76c9bceebdb81d5b360139de4d7335d`，Service Worker 未预缓存平面图。真实多管理员并发、生产数据规模、正式发布和生产监控仍需后续验收。

### 2.36 后台办事流程目录面板、编辑弹窗壳与删除确认拆分（2026-07-16）

- `AdminProcedureCatalogPanel.vue` 接管搜索与发布状态筛选 model、加载错误/重试、骨架屏、桌面表格、移动卡片、空态和分页；通过 `refresh`、`changePage`、`edit`、`rowAction`、`requestDelete` 类型化事件把意图交还页面。搜索使用命名 `searchQuery` model，状态筛选使用命名 `statusFilter` model，不在子组件中直接改 props。组件源文件不包含 `$fetch`、路由、导航、鉴权、catalog 或 operations 控制器。
- `AdminProcedureDeleteDialog.vue` 只负责删除确认 `UModal`、目标标题说明、取消/确认按钮与 `confirm` 事件；删除请求与目标快照仍由 `useAdminProcedureOperations` 负责。
- `AdminProcedureEditor.vue` 接管编辑 `UModal`、详情骨架、表单/关联错误、五个分区编辑器组合、发布前说明与页脚取消/保存；通过命名 `open`/`form` model 接收开关与表单，并以类型化 `save`、`loadReferences`、`toggleAudience`、步骤/材料增删移和 `setRequired` 事件请求页面。组件不访问 API、路由、鉴权或三个 composable。
- `app/pages/admin/procedures.vue` 删除列表与弹窗模板，保留页头、鉴权跳转、目录/操作/表单 composable、关联选项 computed 与启动编排。页面由 20,493 B / 620 行降至 4,625 B / 192 行，减少 15,868 B 和 428 行（按字节约 77.4%）。目录面板为 11,510 B / 339 行，编辑弹窗壳为 5,868 B / 182 行，删除弹窗为 999 B / 46 行。
- `scripts/admin-procedure-catalog-panel.test.ts` 新增 7 项边界测试，覆盖筛选/表格/分页展示、行操作事件、请求/路由隔离、删除确认最小权限、编辑器壳组合与页面组合；`admin-procedure-editor.test.ts` 同步改为断言页面不再内嵌分区编辑器。相关脚本测试 54/54。
- 最终验证：定向 ESLint、完整仓库 ESLint、Nuxt typecheck、全量脚本测试 399/399、Nuxt build、客户端体积预算和 PWA 构建测试均返回 0；等价 `pnpm check` 流水线总耗时约 160.2 秒（eslint 22.9 + typecheck 22.2 + test 8.5 + build 105.5 + budget 0.4 + pwa 0.5）。构建体积预算无违规；后台流程路由初始 JavaScript 为 666,544 B，较上一记录 662,540 B 增加 4,004 B，本项不作为客户端运行时体积下降证据。未跑 Playwright e2e（`pnpm check` 不含 e2e）；Logo/平面图授权、AMap 现场核验、微信内路径与生产监控/备份/发布仍保持未完成。

### 2.37 开场动画纯物理与几何逻辑拆分（2026-07-16）

- `app/utils/intro-overlay-physics.ts` 导出粒子/水波类型、弹簧阻尼指针常数，以及 `stepIntroParticle`、`stepIntroParticleLeaving`、`applyIntroParticleExplode`、`stepMapMotion`、`dampPointerVelocity` 纯步进函数；不访问 DOM 或 canvas。
- `app/utils/intro-overlay-geometry.ts` 导出 `buildYEU` 字母采样、`waterPolygons`/`interactiveWaterPolygons`、`insetWaterPolygon`、`pointInPolygon`、`getCampusMapLayout`、`imagePointToViewport`、`isWaterPoint`；布局函数以视口宽高入参，避免直接读 `window`。
- `app/components/IntroOverlay.vue` 删除本地物理常数、字母构建与水域几何实现，改为组合上述 utils；保留 canvas/水波折射绘制、rAF 渲染、指针事件、reduced-motion 与进入/跳过生命周期。组件由约 40,243 B / 1,151 行降至 30,335 B / 931 行（按字节约 24.6%）。物理模块 5,765 B / 174 行，几何模块 6,172 B / 162 行。
- `scripts/intro-overlay.test.ts` 将源码契约拆到组件壳 + physics/geometry 模块，并新增 `buildYEU`、水域命中/inset、粒子弹簧步进与爆炸/视差步进等纯函数行为测试；相关脚本测试由 13 项增至 17 项。
- 最终验证：定向 ESLint、Nuxt typecheck、全量脚本测试 403/403、Nuxt build、客户端体积预算和 PWA 构建测试均返回 0；等价 `pnpm check` 流水线总耗时约 159.3 秒（eslint 22.8 + typecheck 21.1 + test 8.6 + build 105.8 + budget 0.4 + pwa 0.5）。构建体积预算无违规。本项只记为开场动画可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）；Logo/平面图授权、AMap 现场核验、微信内路径与生产监控/备份/发布仍保持未完成。

### 2.38 公开搜索展示逻辑拆分（第三十一个边界，2026-07-16）

- 将 `app/pages/search.vue` 中的关键词归一化/别名、API 目标与展示、地图摘要标签、静态指南/部门回退合并、分组与朗读公告等纯逻辑迁入 `app/utils/public-search-presentation.ts`。
- 页面保留 SEO、地图种子合并、`/api/public/search` 请求、路由导航序列与模板；源码由约 23,369 B / 648 行降至 14,262 B / 437 行（按字节约 39.0%）。展示模块约 11,453 B / 311 行。
- 新增 `scripts/public-search-presentation.test.ts`（11 项：壳契约 + 纯函数行为 + 与 shared 类型镜像同步）；`scripts/public-route-integrity.test.ts` 同步改为页面接线 + util 源码契约。
- 修复 SSR/Nitro 相对路径价值导入坑：展示 util 对 `~~/shared/constants/server` 仅 type-only，运行时使用本地镜像的 `PUBLIC_SEARCH_RESULT_TYPES`；同步修复 `app/utils/field-observation-review.ts` 中同类相对 value import，避免 admin 现场观测 chunk 在 Nitro 解析失败。
- 最终验证：ESLint 0（25.3s）、Nuxt typecheck 0（23.3s）、全量脚本测试 414/414（9.1s）、Nuxt build 0（107.0s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 165.6 秒。本项只记为搜索可测试性与职责边界改善，不宣称客户端运行时体积下降（搜索页构建归因仍约 633 KiB，主要为共享依赖）。未跑 Playwright e2e（`pnpm check` 不含 e2e）；Logo/平面图授权、AMap 现场核验、微信内路径与生产监控/备份/发布仍保持未完成。

## 3. 从空数据库重建

临时数据库 `E:\yeu\.data\clean-rebuild-security-20260715.sqlite` 按以下顺序执行，所有步骤返回 0：

1. 数据库迁移。
2. 单管理员初始化。
3. 公开来源与目录种子应用。
4. 结构化办事流程种子应用。
5. 76 个高德文字草稿导入。
6. 76 个用户授权工作地图坐标同步为 `unverified`。
7. 已审核地点来源关系同步。
8. SQLite 完整性与外键检查。
9. 前后台数据一致性检查。

最终统计：

| 数据 | 数量 |
| --- | ---: |
| 来源 | 98 |
| 已发布公开内容 | 58 |
| 办事流程 / 步骤 | 5 / 23 |
| 高德草稿地点 | 76 |
| 地点来源关系 | 34 |
| 有正式来源的地点 | 26 |
| 坐标观测 | 0 |

演练结束后已核对临时库绝对路径，并删除数据库、`-shm` 和 `-wal` 文件。当前验收库另通过 `pnpm data:verify:local`。

## 4. 生产产物 HTTP 冒烟

对最新 `.output/server/index.mjs` 在本机临时端口启动并检查真实响应：

- 首页返回 200，可信 `X-Request-Id` 原样透传。
- 返回 `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`X-Frame-Options: DENY`。
- CSP 包含 `frame-ancestors 'none'`、`base-uri 'self'`、`object-src 'none'`。
- Permissions Policy 禁止 camera/microphone，允许同源现场定位。
- `/api/auth/status` 返回 `Cache-Control: no-store` 和 `Pragma: no-cache`。
- 非法请求 ID 被替换为服务器 UUID。
- 结构化日志包含请求 ID、方法、无查询串路径、状态、耗时和 HTTP 错误码；检查结果未出现测试查询串、Cookie、Authorization、IP、经纬度等字段。

临时 Nitro 进程已停止；两次冒烟的 stdout/stderr 仅保存在被 Git 忽略的 `.data/`，不作为需要提交的发布产物。

## 5. 尚未通过的发布门槛

本机备份/恢复补充验证：当前验收库已通过 online backup API 生成 729,088 字节的一致性备份，SHA-256 为 `187d8a618bfde2bf4a7683da315b46d0ba75fdf5bed234431eaf0de12530ca72`。备份副本恢复到隔离文件后，`integrity_check=ok`、外键违规 0、98 条来源、76 个地点、34 条地点来源关系且 `data:verify` 通过；隔离恢复文件已删除。备份与元数据保留在 Git 忽略的 `.data/backups/`，其中包含敏感生产形态数据，不得公开。

- 当前工作区尚未按职责提交，不能建立 `v0.3-alpha` 标签。
- 76 个地点均无正式现场坐标观测；P0 批次仍需双重核验。
- 50 个地点仍无可发布正式来源，P0 批次 A 仍有 6 个来源缺口。
- Chromium 桌面/Pixel 5 视口已完成 API、地图 SDK、PWA 更新提示、断网导航降级和六类页面自动无障碍扫描；真实 Android、iOS Safari、微信、安装态 PWA、屏幕阅读器和网络限速验收仍未完成。
- 尚未在实际生产 Nginx/PM2 上核对静态资源安全头、日志轮转、告警、异机加密备份、完整业务恢复和回滚。
- 2026 个人报到安排、接站、校园卡完整流程和社团招新仍待当年正式通知。
- 维护者指定的当前站点 Logo 已完成来源字节、尺寸、响应式显示和非官方语义验证，但尚未提供学校或相应权利人的公开使用授权记录；正式发布前必须补齐，或替换为权利清晰的项目自有标识。
- 按维护者要求恢复的官网校园平面图已完成字节、尺寸、热点与非导航语义验证，但尚未提供学校对公开再分发和热点衍生使用的授权记录；正式发布前必须补齐，或恢复为仅链接官网原页。

任何一项阻断未解决前，本记录不得被用来宣称 V0.9/V1.0 已达到公开发布条件。

### 2.39 校园周边展示逻辑拆分（第三十二个边界，2026-07-16）

- 将 `app/pages/nearby.vue` 中的分类标签/提示、核验清单、新生用法提示、来源文案改写、候选高德链接与中心标签、地点/候选过滤与分类选项等纯逻辑迁入 `app/utils/nearby-presentation.ts`。
- 页面保留 SEO、候选 JSON 与公开资料种子、`usePublicPlaceList('nearby')` 与模板；源码由约 17,047 B / 427 行降至 13,376 B / 354 行（按字节约 21.5%）。展示模块约 6,430 B / 146 行。
- 扩展 `scripts/nearby-candidates.test.ts`（5 项：平台候选目录契约、页面接线与审核边界文案、util 导出契约、来源改写/地图链接/中心标签、过滤与分类选项行为）。
- 最终验证：ESLint 0（23.3s）、Nuxt typecheck 0（23.0s）、全量脚本测试 417/417（8.7s）、Nuxt build 0（106.8s）、客户端体积预算 0（0.5s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 162.8 秒。本项只记为周边页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.40 后台动态资源分区配置拆分（第三十三个边界，2026-07-16）

- 将 `app/pages/admin/[section].vue` 中的 `publicationStatusOptions`、`sourcePlatformOptions`、`adminSectionConfigs`（places/content/sources/feedback/audit-logs）及查找辅助函数迁入 `app/utils/admin-section-config.ts`。
- 页面保留 `definePageMeta`、路由 `section` 解析、未知分区 404、SEO 与 `AdminResourceManager` 接线；源码由约 26,518 B / 875 行降至约 711 B / 26 行（按字节约 97%）。配置模块约 27,105 B / 858 行。
- 扩展 `scripts/admin-ui-config.test.ts`（7 项：section 配置改由 util 读取、薄壳页面接线契约、`getAdminSectionConfig` / `listAdminSectionKeys` 运行时行为）。
- 最终验证：ESLint 0（24s）、Nuxt typecheck 0（22.5s）、全量脚本测试 419/419（8.8s）、Nuxt build 0（105.3s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 161.5 秒。本项只记为后台路由页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.41 办事流程详情展示逻辑拆分（第三十四个边界，2026-07-16）

- 将 `app/pages/procedures/[slug].vue` 中的受众/方式/状态标签、受众选项、分类相关 notice/材料文案、来源 claim 改写与详情来源映射、清单解析/序列化、步骤勾选与地图链接等纯逻辑迁入 `app/utils/procedure-detail-presentation.ts`。
- 页面保留 `usePublicProcedure`、SEO、受众筛选与 query 同步、localStorage 读写副作用与模板；源码由约 18,606 B / 510 行降至约 16,645 B / 470 行（按字节约 10.5%）。展示模块约 4,900 B / 148 行。
- 新增 `scripts/procedure-detail-presentation.test.ts`（5 项：薄壳接线、标签选项、notice/材料文案、来源改写与映射、清单/勾选/地图链接行为）；同步更新 `public-route-integrity` 中流程详情契约到 util。
- 最终验证：ESLint 0（23.1s）、Nuxt typecheck 0（22s）、全量脚本测试 424/424（8.8s）、Nuxt build 0（106.9s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 161.7 秒。本项只记为流程详情页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.42 首页展示逻辑拆分（第三十五个边界，2026-07-16）

- 将 `app/pages/index.vue` 中的四件要事入口、三步时间线、更多入口、流程方式标签、指南摘要回退、精选流程映射、加载失败提示、卡片倾斜角度与地图搜索目标等纯逻辑迁入 `app/utils/home-presentation.ts`。
- 页面保留 SEO、开场动画状态、公开内容/流程请求、DOM 倾斜副作用与模板；源码由约 19,154 B / 537 行降至约 15,373 B / 427 行（按字节约 19.7%）。展示模块约 5,630 B / 203 行。
- 新增 `scripts/home-presentation.test.ts`（4 项：薄壳接线、入口/时间线文案、精选流程与失败提示、倾斜/地图跳转）；同步更新 `public-route-integrity` 首页目录与学生向文案扫描范围。
- 最终验证：ESLint 0（23.5s）、Nuxt typecheck 0（22.1s）、全量脚本测试 428/428（8.1s）、Nuxt build 0（104.5s）、客户端体积预算 0（0.5s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 159.2 秒。本项只记为首页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.43 反馈纠错页展示逻辑拆分（第三十六个边界，2026-07-16）

- 将 `app/pages/feedback.vue` 中的 UUID 模式、原因选项、目标类型/ID/名称/标签/图标/展示名解析、原因默认值、提交门槛、提交 body 规范化与空表单状态等纯逻辑迁入 `app/utils/feedback-presentation.ts`。
- 页面保留 SEO、路由 query、toast、`$fetch` 提交副作用与模板；查询字符串助手命名为 `feedbackRouteQueryString`，避免与搜索页展示模块同名自动导入冲突。源码由约 11,624 B / ~335 行降至约 10,814 B / 315 行（按字节约 7.0%）。展示模块约 4,178 B / 144 行。
- 新增 `scripts/feedback-presentation.test.ts`（3 项：薄壳接线、目标解析需类型+UUID、原因默认与提交 body 规范化）。
- 最终验证：ESLint 0（24.1s）、Nuxt typecheck 0（21.7s）、全量脚本测试 431/431（8.7s）、Nuxt build 0（106.4s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 161.8 秒。本项只记为反馈页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.44 地点详情页展示逻辑拆分（第三十七个边界，2026-07-16）

- 将 `app/pages/places/[slug].vue` 中的分类标签、校内/周边标签、坐标核验判定、地图跳转目标、详情来源映射、学生向清单回退、位置复制文案、楼层房间标签与学生向正文/清单解析等纯逻辑迁入 `app/utils/place-detail-presentation.ts`。
- 页面保留路由参数、公开地点请求、SEO、分享/复制副作用、反馈链接与模板；源码由约 10,724 B / 311 行降至约 9,562 B / 294 行（按字节约 10.8%）。展示模块约 3,779 B / 128 行。
- 新增 `scripts/place-detail-presentation.test.ts`（3 项：薄壳接线、坐标核验与地图目标、分类清单与复制文案）；同步更新 `public-route-integrity` 地点页 util 契约与学生向文案扫描范围。
- 最终验证：ESLint 0（21.7s）、Nuxt typecheck 0（20.8s）、全量脚本测试 434/434（8.1s）、Nuxt build 0（104s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 155.5 秒。本项只记为地点详情页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.45 校园总览页展示逻辑拆分（第三十八个边界，2026-07-16）

- 将 `app/pages/campus.vue` 中的概览统计常量、失败/静态回退/空目录提示文案与解析逻辑迁入 `app/utils/campus-presentation.ts`。
- 页面保留 SEO、公开内容请求、部门/社团/通知合并与模板；源码由约 15,547 B / 421 行降至约 15,112 B / 414 行（按字节约 2.8%）。展示模块约 1,325 B。
- 新增 `scripts/campus-presentation.test.ts`（3 项：薄壳接线、概览统计标签、回退提示状态机）；同步更新 `public-route-integrity` 学生向文案扫描范围，纳入 `campus-presentation.ts`。
- 最终验证：ESLint 0（23.7s）、Nuxt typecheck 0（22.4s）、全量脚本测试 437/437（8.7s）、Nuxt build 0（108.2s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 163.9 秒。本项只记为校园页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.46 地图页展示逻辑拆分（第三十九个边界，2026-07-16）

- 将 `app/pages/map/index.vue` 中的分类目录、数据来源标签、回退提示、地点状态文案、使用清单、位置复制文案、面积/周长格式化迁入 `app/utils/map-presentation.ts`。
- 页面保留地图 provider 生命周期、搜索/筛选/选点、路径规划、DOM 行滚动与模板；源码由约 40,594 B / 1105 行降至约 35,779 B / 1039 行（按字节约 11.9%）。展示模块约 6,487 B / 152 行。
- 新增 `scripts/map-presentation.test.ts`（3 项：薄壳接线、数据标签/回退、清单状态与格式化）；同步更新 `public-route-integrity` 地图清单契约与学生向文案扫描范围。
- 最终验证：ESLint 0（23.6s）、Nuxt typecheck 0（22.4s）、全量脚本测试 440/440（8.5s）、Nuxt build 0（111.2s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 166.6 秒。本项只记为地图页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.47 指南详情页展示逻辑拆分（第四十个边界，2026-07-16）

- 将 `app/pages/guides/[slug].vue` 中的静态指南回退提示、相关动作映射、详情来源去重与展示映射迁入 `app/utils/guide-detail-presentation.ts`；本地错误码/状态码解析改为复用 `app/utils/public-errors.ts`。
- 页面保留路由参数、公开指南请求、unmanaged 目录回退、反馈链接、SEO 与模板；源码由约 10,107 B / 296 行降至约 7,820 B / 244 行（按字节约 22.6%）。展示模块约 2,161 B / 71 行。
- 新增 `scripts/guide-detail-presentation.test.ts`（3 项：薄壳接线、相关动作、回退与来源映射）；同步更新 `public-route-integrity` 学生向文案扫描范围，纳入 `guide-detail-presentation.ts`。
- 最终验证：ESLint 0（26.6s）、Nuxt typecheck 0（25.8s）、全量脚本测试 443/443（9.7s）、Nuxt build 0（116s）、客户端体积预算 0（0.5s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 179.1 秒。本项只记为指南详情页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.48 部门详情页展示逻辑拆分（第四十一个边界，2026-07-16）

- 将 `app/pages/departments/[slug].vue` 中的正文前缀解析、用例提取、来源 API/种子回退映射与核验日期解析迁入 `app/utils/department-detail-presentation.ts`。
- 页面保留路由参数、公开部门请求、目录合并、反馈链接、SEO 与模板；源码由约 8,838 B / 266 行降至约 8,190 B / 233 行（按字节约 7.3%）。展示模块约 3,394 B / 114 行。
- 新增 `scripts/department-detail-presentation.test.ts`（3 项：薄壳接线、正文前缀/用例提取、来源与核验日期回退）；同步更新 `public-route-integrity` 部门详情断言，学生向文案扫描纳入 `department-detail-presentation.ts`。
- 最终验证：ESLint 0（24.7s）、Nuxt typecheck 0（23.7s）、全量脚本测试 446/446（9.2s）、Nuxt build 0（108.2s）、客户端体积预算 0（0.5s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 166.8 秒。本项只记为部门详情页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.49 来源说明页展示逻辑拆分（第四十二个边界，2026-07-16）

- 将 `app/pages/sources.vue` 中的来源等级标签、学生向可信度说明、访问日期截取、内容/地点关联来源去重聚合与排序迁入 `app/utils/sources-presentation.ts`。
- 页面保留 SEO、公开内容与地点列表请求、加载错误状态与模板；源码由约 7,756 B / 202 行降至约 6265 B / 174 行（按字节约 19.2%）。展示模块约 2212 B / 70 行。
- 新增 `scripts/sources-presentation.test.ts`（3 项：薄壳接线、等级说明文案、去重/更新/排序）；同步更新 `public-route-integrity` 来源页断言，学生向文案扫描纳入 `sources-presentation.ts`。
- 最终验证：ESLint 0（24.2s）、Nuxt typecheck 0（22.5s）、全量脚本测试 449/449（9.1s）、Nuxt build 0（106.7s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 163.4 秒。本项只记为来源说明页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.50 社团详情页展示逻辑拆分（第四十三个边界，2026-07-16）

- 将 `app/pages/clubs/[slug].vue` 中的来源状态文案、入群/报名问题清单、分区标签与详情来源映射迁入 `app/utils/club-detail-presentation.ts`。
- 页面保留路由参数、公开社团请求、种子目录回退、反馈链接、SEO 与模板；源码由约 7,280 B / 214 行降至约 6718 B / 203 行（按字节约 7.7%）。展示模块约 2243 B / 65 行。
- 新增 `scripts/club-detail-presentation.test.ts`（3 项：薄壳接线、决策辅助文案、来源状态与映射）；同步更新 `public-route-integrity` 社团详情断言，学生向文案扫描纳入 `club-detail-presentation.ts`。
- 最终验证：ESLint 0（24.4s）、Nuxt typecheck 0（22.4s）、全量脚本测试 452/452（9.0s）、Nuxt build 0（106.4s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 163.1 秒。本项只记为社团详情页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.51 指南列表页展示逻辑拆分（第四十四个边界，2026-07-16）

- 将 `app/pages/guides/index.vue` 中的分类标签、分类图标色调、列表筛选与回退文案解析迁入 `app/utils/guide-list-presentation.ts`。
- 页面保留 SEO、公开指南请求、静态目录合并、搜索状态与模板；源码由约 7,924 B / 229 行降至约 6953 B / 208 行（按字节约 12.3%）。展示模块约 2290 B / 59 行。
- 新增 `scripts/guide-list-presentation.test.ts`（3 项：薄壳接线、学生向分类/回退文案、筛选与回退解析）；同步更新 `public-route-integrity` 指南列表薄壳断言、学生向文案扫描纳入 `guide-list-presentation.ts`。
- 最终验证：ESLint 0（24.3s）、Nuxt typecheck 0（22.4s）、全量脚本测试 456/456（9.5s）、Nuxt build 0（109.8s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 166.9 秒。本项只记为指南列表页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.52 办事流程列表页展示逻辑拆分（第四十五个边界，2026-07-16）

- 将 `app/pages/procedures/index.vue` 中的适用人群筛选标签、办理方式标签、列表筛选、详情链接 query 与服务/空态文案迁入 `app/utils/procedure-list-presentation.ts`。
- 办理方式标签复用 `procedure-detail-presentation.ts` 的 `procedureMethodLabels`，避免 Nuxt 自动导入重名；同步修正 `admin-request.ts`（去除 BOM 与过宽 index signature）以解除 typecheck 阻塞。
- 页面保留 SEO、公开流程请求、搜索/人群状态与模板；源码由约 6,479 B / 188 行降至约 6081 B / 180 行（按字节约 6.1%）。展示模块约 1710 B / 47 行。
- 新增 `scripts/procedure-list-presentation.test.ts`（3 项：薄壳接线、学生向人群/办理方式文案、筛选与详情 query）；同步更新 `public-route-integrity` 办事流程列表薄壳断言、学生向文案扫描纳入 `procedure-list-presentation.ts`。
- 最终验证：ESLint 0（24.2s）、Nuxt typecheck 0（22s）、全量脚本测试 460/460（9.3s）、Nuxt build 0（108.3s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 164.7 秒。本项只记为办事流程列表页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.53 关于页展示目录拆分（第四十六个边界，2026-07-16）

- 将 `app/pages/about.vue` 中的项目事实、服务边界与治理链接静态目录迁入 `app/utils/about-presentation.ts`。
- 页面保留 SEO 与模板接线；源码由约 7,418 B / 186 行降至约 5,794 B / 156 行（按字节约 21.9%）。展示模块约 2,163 B / 69 行。
- 新增 `scripts/about-presentation.test.ts`（3 项：薄壳接线、学生向目录文案、导出面稳定）；同步更新 `public-route-integrity` 关于页薄壳断言、学生向文案扫描纳入 `about-presentation.ts`。
- 最终验证：ESLint 0（23.6s）、Nuxt typecheck 0（23s）、全量脚本测试 464/464（9.4s）、Nuxt build 0（106.4s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 163.3 秒。本项只记为关于页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.54 发现页展示目录拆分（第四十七个边界，2026-07-16）

- 将 `app/pages/discover.vue` 中的新生任务、内容目录与说明共建静态链接目录迁入 `app/utils/discover-presentation.ts`。
- 页面保留 SEO 与模板接线；源码由约 8,580 B / 226 行降至约 5,382 B / 156 行（按字节约 37.3%）。展示模块约 3,644 B / 87 行。
- 新增 `scripts/discover-presentation.test.ts`（3 项：薄壳接线、学生向目录文案、导出面稳定）；同步更新 `public-route-integrity` 发现页薄壳断言、学生向文案扫描纳入 `discover-presentation.ts`。
- 最终验证：ESLint 0（24.8s）、Nuxt typecheck 0（22.2s）、全量脚本测试 468/468（9.4s）、Nuxt build 0（106.5s）、客户端体积预算 0（0.5s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 163.9 秒。本项只记为发现页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.55 离线状态页展示拆分（第四十八个边界，2026-07-16）

- 将 `app/pages/offline.vue` 中的网络状态文案矩阵、离线边界说明与静态说明链接迁入 `app/utils/offline-presentation.ts`。
- 页面保留 SEO、`navigator` 在线状态监听、重试/返回与模板接线；源码由约 5,948 B / 204 行降至约 4,644 B / 163 行（按字节约 21.9%）。展示模块约 1,854 B / 66 行。
- 新增 `scripts/offline-presentation.test.ts`（3 项：薄壳接线、学生向目录文案、状态矩阵与导出面稳定）；同步更新 `public-route-integrity` 离线页薄壳断言、学生向文案扫描纳入 `offline-presentation.ts`。
- 最终验证：ESLint 0（24.6s）、Nuxt typecheck 0（22.5s）、全量脚本测试 472/472（8.9s）、Nuxt build 0（104.8s）、客户端体积预算 0（0.5s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 161.8 秒。本项只记为离线页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.56 隐私说明页展示拆分（第四十九个边界，2026-07-16）

- 将 `app/pages/privacy.vue` 中的隐私分节静态目录迁入 `app/utils/privacy-presentation.ts`。
- 页面保留 SEO 与模板接线；源码由约 3,941 B / 112 行降至约 2,289 B / 75 行（按字节约 41.9%）。展示模块约 1,845 B / 45 行。
- 新增 `scripts/privacy-presentation.test.ts`（3 项：薄壳接线、学生向分节文案、导出面稳定）；同步更新 `public-route-integrity` 隐私页薄壳断言、学生向文案扫描纳入 `privacy-presentation.ts`。
- 最终验证：ESLint 0（24.1s）、Nuxt typecheck 0（21.7s）、全量脚本测试 476/476（9.4s）、Nuxt build 0（105.8s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.6s）均返回 0；等价 `pnpm check` 流水线总耗时约 162.0 秒。本项只记为隐私页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.57 管理概览展示拆分（第五十个边界，2026-07-16）

- 将 `app/pages/admin/index.vue` 中的模块目录、快捷操作、响应归一化、状态码解析与列表字段/日期展示迁入 `app/utils/admin-dashboard-presentation.ts`。
- 页面保留鉴权拉取、加载状态与模板接线；源码由约 11,940 B / 389 行降至约 8,646 B / 280 行（按字节约 27.6%）。展示模块约 4,233 B / 130 行。
- 新增 `scripts/admin-dashboard-presentation.test.ts`（3 项：薄壳接线、模块/快捷操作目录、纯函数响应矩阵）。
- 最终验证：ESLint 0（23.9s）、Nuxt typecheck 0（22.5s）、全量脚本测试 479/479（9.1s）、Nuxt build 0（107.0s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 163.4 秒。本项只记为管理概览可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。门禁前修复：`scripts/admin-ui-config.test.ts` 缩进与中文正则（编码损坏）恢复，并改为从 `admin-dashboard-presentation.ts` 断言模块/快捷操作入口。


### 2.58 社团列表展示拆分（第五十一个边界，2026-07-16）

- 将 `app/pages/clubs/index.vue` 中的近期活跃统计、线索计数、名称拼接、搜索过滤与列表提示文案迁入 `app/utils/club-list-presentation.ts`。
- 页面保留公开社团列表请求、搜索状态与模板接线；源码由约 5,418 B / 144 行降至约 5,286 B / 146 行（按字节约 2.4%）。展示模块约 1,418 B / 49 行。
- 新增 `scripts/club-list-presentation.test.ts`（3 项：薄壳接线、学生向文案、过滤/统计矩阵）。
- 最终验证：ESLint 0（25.4s）、Nuxt typecheck 0（22.6s）、全量脚本测试 482/482（9.3s）、Nuxt build 0（105.1s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.6s）均返回 0；等价 `pnpm check` 流水线总耗时约 163.4 秒。本项只记为社团列表可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。


### 2.59 部门列表展示拆分（第五十二个边界，2026-07-16）

- 将 `app/pages/departments/index.vue` 中的搜索过滤、联系方式预览与列表提示文案迁入 `app/utils/department-list-presentation.ts`。
- 页面保留公开部门列表请求、搜索状态与模板接线；源码由约 4,008 B / 121 行降至约 3,772 B / 117 行（按字节约 5.9%）。展示模块约 977 B / 34 行。
- 新增 `scripts/department-list-presentation.test.ts`（3 项：薄壳接线、学生向文案、过滤/联系方式预览矩阵）。
- 最终验证：ESLint 0（24.4s）、Nuxt typecheck 0（22.5s）、全量脚本测试 485/485（10.3s）、Nuxt build 0（106.6s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 164.7 秒。本项只记为部门列表可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.60 校园周边固定研究资料选择拆分（第五十三个边界，2026-07-16）

- 将 `app/pages/nearby.vue` 中固定研究资料数组选择迁入 `app/utils/nearby-presentation.ts` 的纯函数 `selectNearbyResearchSources`；页面保留 `researchSources` 种子导入与选择器调用。
- 展示模块不导入 `~~/data/seeds/public-content`（避免 Node/tsx 测试无法解析 Nuxt 别名）；源码：`nearby.vue` 约 13,376 B / 349 行 → 约 13,354 B / 351 行（按字节约 -0.2%），展示模块约 6,430 B / 155 行 → 约 7,142 B / 173 行。
- 更新 `scripts/nearby-candidates.test.ts`（薄壳接线、选择器纯函数固定三源断言；本文件现 6 项）。
- 最终验证：ESLint 0（25.3s）、Nuxt typecheck 0（22.4s）、全量脚本测试 486/486（9.2s）、Nuxt build 0（106.6s）、客户端体积预算 0（0.5s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 164.5 秒。本项只记为周边页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.61 管理登录展示拆分（第五十四个边界，2026-07-17）

- 将 `app/pages/admin/login.vue` 中的会话载荷判定、登录错误文案映射、安全 redirect 解析与缺省提示迁入 `app/utils/admin-login-presentation.ts`。
- 页面保留 SEO、表单状态、`$fetch` 会话/登录请求与模板接线；源码由约 7,138 B / 228 行降至约 6,376 B / 215 行（按字节约 10.7%）。展示模块约 1,914 B / 49 行。
- 新增 `scripts/admin-login-presentation.test.ts`（3 项：薄壳接线、中文提示文案、会话/错误/跳转纯函数矩阵）。
- 最终验证：ESLint 0（25.2s）、Nuxt typecheck 0（23.2s）、全量脚本测试 489/489（10.3s）、Nuxt build 0（123.6s）、客户端体积预算 0（0.4s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 183.2 秒。本项只记为管理登录可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.62 地图地点链接与平面图编号拆分（第五十五个边界，2026-07-17）

- 将 `app/pages/map/index.vue` 中已发布地点详情路由构建、反馈纠错链接构建与官网平面图编号解析迁入 `app/utils/map-presentation.ts`。
- 页面保留 SEO、地图生命周期、route/from 取值、复制副作用与模板接线；源码由约 35,779 B 降至约 35,562 B（按字节约 0.6%）。展示模块约 7,380 B / 185 行。
- 更新 `scripts/map-presentation.test.ts`（现 5 项：薄壳接线、数据标签/降级文案、清单与格式化、详情路由纯函数、反馈链接/平面图编号纯函数）。
- 最终验证：ESLint 0（27.0s）、Nuxt typecheck 0（23.3s）、全量脚本测试 493/493（10.4s）、Nuxt build 0（122.0s）、客户端体积预算 0（0.5s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 183.7 秒。同步修正 Stage 54 遗留的 admin-login 无用转义、security clearAuthCookies 无用赋值，以及反馈接线测试对地图页薄壳的期望（现断言页面经 buildMapPlaceFeedbackTarget 与 util 内 buildDetailFeedbackLink）。本项只记为地图页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.63 地图列表筛选与平面图视图纯函数拆分（第五十六个边界，2026-07-17）

- 将 `app/pages/map/index.vue` 中的公开地点列表筛选、区域搜索筛选、范围/业主地图过滤、移动端 sheet 高度与初始视图模式解析迁入 `app/utils/map-presentation.ts` 纯函数：`filterPublicMapPlacesForMapList`、`filterMapAreasForMapSearch`、`filterPublicMapPlacesByScope`、`filterOwnerMapPlacesInScope`、`resolveMobileSheetHeightClass`、`resolveInitialMapViewMode`。
- 页面保留 SEO、地图 provider 生命周期、route/from、选点副作用与模板接线；不再直接从 `~/utils/map-search` 导入匹配逻辑（匹配仍由展示模块内部复用 `areaMatchesQuery` / `placeMatchesQuery`）。源码由约 35,562 B 降至约 35,175 B（按字节约 1.1%）。展示模块由约 7,380 B / 185 行增至约 9,611 B / 256 行。
- 更新 `scripts/map-presentation.test.ts`（现 6 项：薄壳接线、数据标签、清单/格式化、详情路由、反馈/平面图编号、列表筛选与 sheet 高度）；同步更新 `scripts/campus-map-reference.test.ts` 与 `scripts/public-route-integrity.test.ts` 的薄壳期望。
- 最终验证：ESLint 0（25.1s）、Nuxt typecheck 0（24.7s）、全量脚本测试 510/510（11.2s）、Nuxt build 0（118.5s）、客户端体积预算 0（0.5s，无违规）、PWA 构建测试 1/1（0.5s）均返回 0；等价 `pnpm check` 流水线总耗时约 180.5 秒。本项只记为地图页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。

### 2.64 地图选中态/显示选项与自动选点纯函数拆分（第五十七个边界，2026-07-17）

- 将 `app/pages/map/index.vue` 中的显示选项切换、底图不支持提示文案、区域 provider 范围过滤、选中 POI/地点解析、官网平面图编号查找与搜索自动选点决策迁入 `app/utils/map-presentation.ts` 纯函数：`toggleMapDisplayOption`、`withMapLabelSize`、`resolveMapUnsupportedBaseStyleMessage`、`filterMapAreasForProviderScope`、`resolveSelectedMapPoiId`、`resolveSelectedPublicMapPlace`、`findPublicMapPlaceByOfficialPlanNumber`、`resolveAutoSelectSearchDecision`。
- 页面保留 SEO、地图 provider 生命周期、route/from、选点/选区副作用、Toast 与模板接线；不再内联 `place.officialPlanNumber === mapNumber` 与 `currentArea/currentPoi/target` 自动选点分支。源码由约 35,175 B 降至约 34,944 B（按字节约 0.7%）。展示模块由约 9,611 B / 256 行增至约 13,157 B / 363 行。
- 更新 `scripts/map-presentation.test.ts`（现 7 项：在原 6 项基础上新增选中态/显示选项/自动选点纯函数用例）；同步更新 `scripts/campus-map-reference.test.ts` 与 `scripts/public-route-integrity.test.ts` 的薄壳期望（`findPublicMapPlaceByOfficialPlanNumber`、`selectArea(decision.targetArea)`）。
- 最终验证：ESLint 0（31.2s）、Nuxt typecheck 0（30.5s）、全量脚本测试 519/519（12.7s）、Nuxt build 0（146.9s）、客户端体积预算 0（0.6s，无违规）、PWA 构建测试 1/1（0.7s）均返回 0；等价 `pnpm check` 流水线 `FINAL_EXIT=0`（约 222.6 秒）。本项只记为地图页可测试性与职责边界改善，不宣称客户端运行时体积下降。未跑 Playwright e2e（`pnpm check` 不含 e2e）。
