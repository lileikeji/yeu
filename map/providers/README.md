# Map providers

本目录承载地图渲染适配器，不承载地点搜索、坐标转换或导航链接。

- `maplibre-dev`：无 Key 的本地开发预览；不能默认用于生产。
- `amap`：生产 provider，使用高德 JS API 2.0。数据库仍保存核验后的 WGS84；公开显示时仅通过高德官方 `convertFrom('gps')` 转为 GCJ-02，不回写源坐标，转换失败的地点不绘制。

MapLibre 预览会绘制 OSM relation 17685756 派生的三片候选校界，界面保留 `© OpenStreetMap contributors` 署名；派生 GeoJSON 的来源和 ODbL 许可写在 `data/seeds/osm-campus-boundary.json`。该图层只用于校园范围和异常值检查，不表示任何建筑、校门或入口坐标已核验。

每个 provider 实现 `map/core/provider.ts` 的统一生命周期、地点联动和视野控制接口。后台坐标拾取有意固定使用 MapLibre/WGS84，避免把高德 GCJ-02 点击结果反向冒充为 GPS 坐标；高德 provider 只承担公开显示。数据来源与核验逻辑属于独立服务，避免供应商切换污染业务模块。
