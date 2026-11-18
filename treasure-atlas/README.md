# 校园寻宝

活动入口为 `/activities/treasure`，可加 `?point=rainbow-bridge` 直达试点。修改地图后，在仓库根目录运行 `node treasure-atlas/build.mts`，更新 `server/assets/treasure/atlas.html` 与 `public/treasure-artwork/`。

彩虹桥采用服务端校验。运行迁移后，在服务端设置 `NUXT_TREASURE_PILOT_LONGITUDE`、`NUXT_TREASURE_PILOT_LATITUDE` 和 `NUXT_TREASURE_PILOT_ANSWER`。经纬度使用现场确认的 WGS84 坐标，暗号和测试账号由运行环境提供。浏览器需在 HTTPS 下授予精确定位，服务端按 20 米范围判断并记录印章。其他点位仍保存浏览器里的试玩进度。

公开版本使用自制徽章替代部分预览版角色素材，保留原有点位和线索。
