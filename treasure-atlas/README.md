# 校园寻宝

活动入口为 `/activities/treasure`，可加 `?point=rainbow-bridge` 直达试点。

## 改地图的流程

1. 改了 `src/atlas/**`、`src/map-source/**` 或 `artwork/**` 之后，在仓库根目录运行 `node treasure-atlas/build.mts`；
2. 它会重写 `server/assets/treasure/atlas.html`、刷新 `atlas.lock.json`，并把 `artwork/*.webp` 拷到 `public/treasure-artwork/`；
3. 产物与 lock 一起提交。`scripts/treasure-atlas.test.ts` 会比对 `atlas.html` 与 lock，不一致就红。

构建会在 `treasure-atlas/outputs/` 留下点位校验表，该目录已在 `.gitignore` 里。

## 快照与依赖

- `src/map-source/` 里 11 个文件是主仓代码的快照（`SNAPSHOT.json` 登记了每个文件的 sha256）。主仓改了这些文件后运行 `node treasure-atlas/sync-snapshot.mts`：它按主仓当前内容重新拷贝、给相对导入补 `.ts`（Node 跑类型擦除要求带扩展名），并刷新清单。守卫会比对两侧，忘了同步就红。
- `vendor/maplibre-gl/` 只留 `maplibre-gl.iife.js` 与 `VENDOR.json`。npm 包的 `dist` 只提供 ESM，atlas 需要一段可内联的经典脚本，所以 IIFE 入库；`worker`、`css`、`LICENSE` 与 npm dist 逐字节相同，构建时直接从 `node_modules/maplibre-gl` 读。升级地图库后按 `VENDOR.json` 的 `rebuild` 命令重打并更新 `sha256`。

## 试点集章

彩虹桥采用服务端校验。运行迁移后，在服务端设置 `NUXT_TREASURE_PILOT_LONGITUDE`、`NUXT_TREASURE_PILOT_LATITUDE` 和 `NUXT_TREASURE_PILOT_ANSWER`。经纬度使用现场确认的 WGS84 坐标，暗号和测试账号由运行环境提供。浏览器需在 HTTPS 下授予精确定位，服务端按 20 米范围判断并记录印章。其他点位仍保存浏览器里的试玩进度。

公开版本使用自制徽章替代部分预览版角色素材，保留原有点位和线索。

## 外部依赖

页面运行时还会请求两处校外的公开服务：`wttr.in`（天气角标）与 `server.arcgisonline.com`（Esri World Imagery 卫星底图）。无 key、无 SLA，被墙或挂掉时天气角标不显示、影像底图空着，手绘图层与交互不受影响。
