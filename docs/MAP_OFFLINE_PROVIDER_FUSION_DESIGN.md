# 地图离线/WebView Provider 融合设计（offline provider fusion）

> 文档版本：0.1（设计稿，未实现）
> 适用范围：`map/providers/offline/provider.ts`（`WechatOfflineMapProvider`）、`map/providers/factory.ts`、`app/pages/map/index.vue`
> 目标设备：桌面浏览器、手机浏览器、微信内置浏览器（WebView 无 WebGL / 无高德密钥时）
> 关联文档：[MAP_INTERACTION_SPEC.md](./MAP_INTERACTION_SPEC.md)、[ARCHITECTURE.md](./ARCHITECTURE.md)、[PRD.md](./PRD.md)、[README 地图 providers](./providers/README.md)
> 状态：**方案评审态 —— 只出设计，不落代码**；待方向确认后再进入实现。

---

## 1. 背景与现状（为什么要有这份设计）

读取自现网代码的事实：

1. **架构**：`map/core/provider.ts` 定义统一 `MapProvider` 接口；`map/providers/factory.ts` 只装配 `amap`（生产）或 `maplibre-dev`（免 Key 开发预览）。
2. **存在一个孤儿 provider**：`map/providers/offline/provider.ts`（`WechatOfflineMapProvider`）**全仓库无任何一处 import/装配**，当前是不可达的死代码。它自述用途是「WebView 安全回退：只用 DOM/CSS/结构化坐标/指针事件，不依赖 WebGL、AMap、字形或外部瓦片」。
3. **孤儿 provider 的能力缺口**：
   - `setPois` / `flyTo*` / 拾取 / 选中已实现；
   - `setAreas` 是**空实现**（不画区域）；
   - `planWalkingRoute` **恒 reject**（无路线）;
   - `setDisplayOptions.autoCluster` 是**摆设**（`renderMarkers` 逐点绘制，不聚合）；
   - 它的 `id` 误写为 `'maplibre-dev'`，与预览 provider 撞 id，一旦装配会产生歧义。
4. **关键区分（决定本设计边界）**：交互规范 [§10.2](./MAP_INTERACTION_SPEC.md) 明确「**PWA 离线时不承诺保留底图、不建立地图 SDK/瓦片缓存**，断网进入说明页」。因此本设计的 offline provider 定位是 **WebView / 无密钥 / 无 WebGL 的「能力降级」**（仍联网、提供本地自绘示意地图+标点+本地图论路线），**不是**「断网瓦片缓存」。本设计的所有融合点都不碰「第三方地图瓦片/SDK 缓存」这条红线。

### 1.1 已识别的三类融合候选（开源对照）

方案扫描结论（详见会话讨论记录）：

| 融合候选 | 开源对照 | 本设计落点 |
| --- | --- | --- |
| A. 离线屏幕空间聚合 | supercluster / leaflet.markercluster 的分层网格分桶思想 | **融合（本次设计核心）** |
| B. 本地图论步行路线 | daswick/Campus-Map、joebernal/Campus-Navigation-System、qiao/pathfinding.js 的 Dijkstra/A* | **融合（本次设计核心）** |
| C. 把 offline provider 接进装配 | —（本仓库自研） | **融合（让死代码可用）** |
| D. 用 Leaflet 收编手写平移缩放（无 WebGL、DOM 实现） | Leaflet + leaflet.markercluster | **列为后期可选，非默认**（见 §6） |
| E. WGS84↔GCJ-02 反向转换库 | eviltransform / wgs2gcj 等 | **明确不做（护栏）** |

---

## 2. 设计约束（不可妥协）

1. **坐标纪律（硬约束）**：数据库/图只存 **WGS84**；对外显示时高德模式才经官方 `convertFrom('gps')` 转 GCJ-02，**绝不反向把 GCJ-02 冒充 GPS 回写**。离线与图论路线全部基于 WGS84 本地像素投影，**不引入任何反向转换库**（护栏 E）。
2. **不碰瓦片/SDK 缓存红线**（[§10.2](./MAP_INTERACTION_SPEC.md)）：离线 provider 不加载、不缓存任何第三方底图瓦片或 AMap SDK；只做本地自绘 + 本地数据 + 本地计算。
3. **符合交互规范聚合语义**（[§4.5](./MAP_INTERACTION_SPEC.md)）：聚合点三档 `36 / 44 / 52px`，`50+` 显示 `99+`，可访问名称读出真实数量；触控区 ≥44px；点击聚合放大到成员边界；`autoCluster` 是图层设置开关（[§7.6](./MAP_INTERACTION_SPEC.md)）。
4. **保持 provider 抽象纯净**：所有新逻辑收敛到 provider 内部 + 纯函数工具，页面不直接 import provider 工厂（沿用 `useMapProviderLifecycle` 编排）。
5. **可测试**：本仓库惯例是把决策/几何写成无 Vue 依赖的纯函数，放 `app/utils/*` 并在 `scripts/*.test.ts` 覆盖（见 `scripts/map-provider-lifecycle.test.ts` 等现状）。

---

## 3. 融合 B：本地图论步行路线（graph + Dijkstra/A*）

### 3.1 目标

让 `WechatOfflineMapProvider.planWalkingRoute` 从「恒 reject」升级为**本地确定性求解**，返回 `RouteSummary { distanceMeters, durationSeconds }` 并绘制折线。它不联网、不依赖高德在线服务，因此在微信 WebView / 无密钥场景下仍能给新生一条示意路线与距离/时间。**这是对 [§7.5](./MAP_INTERACTION_SPEC.md)（高德模式路线）的 WebView 兜底补充，不违反 §10.2**（本地数据+本地计算，非瓦片缓存）。

### 3.2 数据结构

新增 `map/core/walk-graph.ts`（类型）与 `data/seeds/campus-walk-graph.ts`（数据），参照现有 seeds 惯例（`amap-imported-places`、`preview-places` 同构）：

```ts
// map/core/walk-graph.ts
export interface WalkNode {
  id: string
  name?: string          // 可选，如「图书馆」「食堂西侧」
  point: GeoPoint        // WGS84
  aliases?: string[]     // 可选：利于与 POI 绑定的别名
}

export interface WalkEdge {
  from: string           // WalkNode.id
  to: string             // WalkNode.id（无向，双向可走）
  distanceMeters: number // 缺失时用 haversine + 路径系数估算
  kind?: 'path' | 'stairs' | 'road' | 'elevator'
}

export interface CampusWalkGraph {
  nodes: WalkNode[]
  edges: WalkEdge[]
}
```

- 图保存在**本地静态数据**（seed），不在运行时下载第三方瓦片。
- 边距离优先写实测值；缺省由 §3.4 的 haversine × 路径系数补。

### 3.3 纯函数（无 DOM/Vue 依赖，可单测）

`app/utils/walk-route.ts`：

```ts
export type WalkRouteResult =
  | { ok: true; distanceMeters: number; durationSeconds: number; nodeIds: string[] }
  | { ok: false; reason: 'no-nearest-node' | 'unreachable' | 'same-node' }

export function nearestWalkNode(graph: CampusWalkGraph, point: GeoPoint): WalkNode | null
export function solveCampusWalkRoute(
  graph: CampusWalkGraph,
  origin: GeoPoint,
  destination: GeoPoint
): WalkRouteResult
export function walkRoutePolyline(graph: CampusWalkGraph, nodeIds: string[]): GeoPoint[]
export function estimateDurationSeconds(distanceMeters: number): number
```

### 3.4 求解算法（借鉴开源 Dijkstra 思路，自研实现）

1. **点吸附**：把 `origin / destination` 吸附到最近图节点（`nearestWalkNode`，按 haversine 距离，加「最大吸附半径」守卫，如 ≤ 80m，超限返回 `no-nearest-node`）。（对齐 daswick/Campus-Map 的「起终点→图上节点」粗粒度方案。）
2. **最短路径**：图规模为 campus 级（预计 ≤ 数百节点），用**朴素 Dijkstra（二叉最小堆）**即可；节点多时再切换 A*（欧氏启发可采纳）。返回 `ok` 与 `nodeIds`；不可达返回 `unreachable`。（思路对照 [qiao/pathfinding.js](https://github.com/qiao/pathfinding.js) / [joebernal/Campus-Navigation-System](https://github.com/joebernal/Campus-Navigation-System)。）
3. **距离/时长**：
   - `distanceMeters` = 路径边距离求和（缺省边用 haversine，半径 R≈6_371_000m）；
   - `durationSeconds = distanceMeters / WALK_SPEED`，`WALK_SPEED ≈ 1.3 m/s`；楼梯/电梯 `kind` 可加系数（如 1.6 / 0.8）——先做常数，标注为可调配置。
4. **折线**：`walkRoutePolyline` 把 `nodeIds` 还原为 WGS84 坐标序列，供 provider `setPolyline` 在本地像素投影上绘制。

### 3.5 Provider 侧接线

`WechatOfflineMapProvider.planWalkingRoute(origin, destination)` 改为：

```ts
async planWalkingRoute(origin, destination): Promise<RouteSummary> {
  const r = solveCampusWalkRoute(campusWalkGraph, origin, destination)
  if (!r.ok) throw new MapRouteUnavailableError(...) // 语义错误，供 onError/UI 降级
  this.routeLine = walkRoutePolyline(campusWalkGraph, r.nodeIds)
  this.renderRoute() // 本地像素投影画折线
  return { distanceMeters: r.distanceMeters, durationSeconds: r.durationSeconds }
}
async clearRoute(): void { this.routeLine = null; this.renderRoute() }
```

> 失败语义要与 amap 的「高德在线失败」区分：这是「图不可达/无最近节点」的业务降级，UI 文案需说明「示意路线不可达」，不冒充高德真实导航。

---

## 4. 融合 A：离线屏幕空间聚合（对齐规范 §4.5 / §5.2 / §7.6）

### 4.1 目标

让离线 provider 支持 `autoCluster`（[§7.6](./MAP_INTERACTION_SPEC.md) 图层开关），低缩放下用**可解释的数字聚合**表达数量（[§5.2 明确禁止靠随机覆盖/隐藏](./MAP_INTERACTION_SPEC.md)），替代当前的逐点全画。

### 4.2 纯函数（可单测）

`app/utils/screen-cluster.ts`：

```ts
export interface ViewTransform {
  // 由 provider 当前 scale/offset/尺寸推导的 lng/lat → 屏幕 px 映射
  lngToX(lng: number): number
  latToY(lat: number): number
}
export interface ScreenspaceCluster {
  centroidX: number
  centroidY: number
  count: number
  poiIds: string[]
}
/** 屏幕空间网格分桶聚合：cellPx 内同格合并为聚合点 */
export function clusterForView(
  pois: MapPoi[],
  view: ViewTransform,
  opts: { cellPx: number; minGroup: number }
): ScreenspaceCluster[]
```

- 复用 §3.5 的**同一套本地像素投影**（消除「等距线性」在校区偏中心/高缩放的变形，见 §6 可选 D 的投影强化铺垫）。
- 阈值经验起点：`cellPx ≈ 48`、`minGroup = 2`（≥56 个点开始显著收益），用首批真实点位调校（[§12 建议 300 点位压测](./MAP_INTERACTION_SPEC.md)）。

### 4.3 绘制与交互（对齐规范）

- 聚合点三档尺寸：`count 2-9 → 36px`；`10-49 → 44px`；`≥50 → 52px`，`50+` 文本 `99+`，`aria-label` 读真实数量（[§4.5](./MAP_INTERACTION_SPEC.md)）。
- 触控区 ≥44px；点击聚合点不选中任何成员（[§6.4](./MAP_INTERACTION_SPEC.md)），而是 `flyToPoint` 放大到成员边界；已达最大 zoom 仍重叠 → 弹出成员选择列表。
- `setDisplayOptions` 真正生效：`autoCluster=false` 时逐点绘制（保留现状路径）。

### 4.4 待定参数（写入常量，集中配置）

cell 尺寸、minGroup、聚合触发点位数阈值、WALK_SPEED、最大吸附半径——统一收敛到 provider 顶部常量区或独立 config，随真实数据调校，不散落。

---

## 5. 融合 C：把 offline provider 接进装配（让死代码可用）

### 5.1 修 id 冲突

`MapProviderId` 联合类型目前是 `'maplibre-dev' | 'amap'`（`map/core/provider.ts`）。给离线 provider 独立 id **`'offline'`**（> 修正当前误写的 `'maplibre-dev'`），并加入联合类型与 `factory.resolveMapProviderConfig` 分支。

### 5.2 降级选择策略

目标：**微信内置 WebView / 嵌入式浏览器且未配置高德密钥或 WebGL 受限时，落到离线 provider**；正常桌面/手机浏览器仍走 amap。

- 在 `useMapProviderLifecycle` 创建前做一次决策（新增纯函数 `resolveProviderFallback()`，可单测）：
  - 命中判定：`isWechatUserAgent(navigator.userAgent)`（已有工具 `app/utils/browser-environment.ts`）**或** 配置为空/`amap` 密钥缺失（现状抛 `MapProviderConfigurationError`）。
  - 结果为 `'amap' | 'offline'`。
- 工厂：`resolveMapProviderConfig` 增加 `'offline'` 分支（不需要密钥），`createMapProvider` 动态 import `./offline/provider`。
- **能力门禁联动**（页面/组合式已有以 `activeMapProviderId !== 'amap'` 判断的地方，需扩展覆盖 `'offline'`）：
  - 高德原生搜索（`useMapNativeSearch` 现判 `provider?.id !== 'amap'`）→ offline 保持禁用；
  - 定位（`map-geolocation.ts` 现判 `activeMapProviderId !== 'amap'`）→ offline 降级可控（可不提供或仅在 WebView 安全上下文可用时提供）；
  - **路线**→ offline 走 §3 本地图论路线（不再是「无能力」，而是「有本地路线」）。
- 确保 `activeMapProviderId` 反映真实实际（页面里 map-status / fallback 文案不再写死 `=== 'amap'`）。

### 5.3 回归影响面

- `app/pages/map/index.vue` 中若干 `activeMapProviderId === 'amap'` / `!== 'amap'` 分支（导航、原生搜索、底图切换、map-status）需核对是否把 `'offline'` 正确归类。
- Playwright 冒烟：新增微信 UA 仿真 / 无密钥场景下渲染离线 provider 不崩溃。

---

## 6. 可选 D：用 Leaflet 收编手写 provider（明确**不默认**）

- Leaflet 是 **DOM/CSS 实现、无需 WebGL**（符合当初「无 WebGL / 无外部瓦片」取舍），自带平移/缩放/触摸，`leaflet.markercluster` 提供成熟聚合。
- **收益**：免维护手写几何变换、投影、聚合、触摸；**成本/风险**：整体替换一个现已通过测试&逻辑自洽的 provider，引入新依赖，需大回归。
- **本设计建议**：先做 A/B/C（零/低依赖、低风险），让离线 provider 先「活且可用」；待有真实 WebView 回归底气后再评估是否把 §3-4 的数学换用 Leaflet 内部实现（届时投影/聚合免费获得，§3.4/§4.2 的纯函数可保留为可测试的薄封装）。

---

## 7. 明确不做的护栏（Do-not list）

1. **不引入 WGS84↔GCJ-02 反向转换库**（eviltransform / wgs2gcj 等）——直接违背坐标纪律（§2.1 硬约束），GCJ-02 不得回写数据库或冒充 GPS。
2. **不做第三方底图瓦片 / AMap SDK 缓存**——触碰 [§10.2](./MAP_INTERACTION_SPEC.md) 红线；断网仍进说明页。
3. **不把离线 provider 当「断网离线地图」**——它的语义是「WebView 能力降级」，文档里要写清楚，避免被误用为离线导航承诺。
4. **本地图论路线不宣称是高德真实导航**——UI 文案区分「示意图路线」与「高德导航」。

---

## 8. 涉及文件清单（实现阶段预期，本次不落）

| 文件 | 动作 |
| --- | --- |
| `map/core/provider.ts` | `MapProviderId` 加 `'offline'`；接口可不加新方法（用 polyline/route 内部字段） |
| `map/core/walk-graph.ts` | 新增：`WalkNode`/`WalkEdge`/`CampusWalkGraph` 类型 |
| `data/seeds/campus-walk-graph.ts` | 新增：campus 步行图种子数据 |
| `app/utils/walk-route.ts` | 新增：吸附 + Dijkstra/A* + haversine + 时长纯函数 |
| `app/utils/screen-cluster.ts` | 新增：屏幕空间网格聚合纯函数 |
| `map/providers/offline/provider.ts` | 实现路线/聚合/区域；id 改 `'offline'` |
| `map/providers/factory.ts` | 加 `'offline'` 分支 + `resolveProviderFallback` 决策 |
| `app/utils/map-provider-fallback.ts` | 新增：降级决策纯函数（可单测） |
| `app/composables/useMapProviderLifecycle.ts` | 接入降级决策；创建 offline 分支 |
| `app/pages/map/index.vue` | `activeMapProviderId` 分支归类（路线/搜索/定位/文案） |
| `scripts/walk-route.test.ts` | 新增：吸附/Dijkstra/时长/折线单测 |
| `scripts/screen-cluster.test.ts` | 新增：聚合网格/阈值/边界单测 |
| `docs/MAP_INTERACTION_SPEC.md` | 起草：WebView 本地路线/聚合的降级语义补充 |

---

## 9. 测试清单（实现阶段验收）

**纯函数单测**（`scripts/*.test.ts` 惯例）：
- `nearestWalkNode`：最近节点、超最大半径返回 null、相同点。
- `solveCampusWalkRoute`：可达最短路径距离正确；不可达返回 `unreachable`；起终点同节点返回 `same-node`；图含楼梯系数时长合理。
- `clusterForView`：同格合并、minGroup 边界、count 聚合为 99+、不同 cell 尺寸。
- `resolveProviderFallback`：微信 UA 命中 offline；amap 有密钥走 amap；空配置走 offline。

**Playwright 冒烟**：
- 微信 UA 仿真下 `/map` 渲染离线 provider 不崩溃、标点/聚合可见。
- 离线 provider 下 `planWalkingRoute` 返回本地 RouteSummary 并绘制折线。
- 无密钥（MapProviderConfigurationError 被取代/降级）场景不回崩溃。

**行为回归**：桌面 amap 模式全部现有用例不回归（`corepack pnpm check` 全绿、桌面/移动 Playwright 保持全绿）。

---

## 10. 实施阶段划分（评审通过后）

- **P0（先做，零/低依赖、低风险）**：融合 B（本地图论路线）+ 融合 A（屏幕聚合）——纯函数先行，附单测。
- **P1（让死代码可用）**：融合 C（修 id、factory 装配、降级决策、页面能力门禁联动）。
- **P2（可选评估）**：融合 D（Leaflet 收编）——等在真实 WebView 跑通 P0/P1 有回归底气后再决策。

---

## 11. 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| 图数据不完整导致路线不可达 | 粗粒度图先做「点→最近节点→点」；`unreachable` 语义降级文案 |
| 聚合/路线几何偏差（等距线性投影） | 统一 §3.5/§4.2 投影；P2 换 Leaflet 免费修正 |
| 新 provider 装配引入回归 | 全部纯函数先行+单测；降级决策默认保守（仅微信 UA/缺密钥才触发） |
| id 冲突/页面写死 `=== 'amap'` 分支遗漏 | 全局 grep `activeMapProviderId` 逐一归类，纳入验收清单 |
| 离线路线被误读为高德真实导航 | 文案持续区分「示意图路线 / 高德导航」（护栏 4） |

---

*非实现文档：本文件仅为评审用设计稿，未修改任何源码。*
