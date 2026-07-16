# 小红书核验素材 Image 2 内部重构索引（2026-07-15）

本目录包含 18 张通过内置 Image 2 根据研究素材重新生成的高清 PNG。生成时统一要求去除平台水印、账号标记和压缩伪影，并按内容重新命名。

## 使用边界

- 这些文件是 **AI 视觉重构图**，不是原始照片、官方图片或精确地图，不能作为地点、设施、菜品或车型的独立事实证据。
- 宿舍图只用于理解原笔记展示的空间类型，不能推定所有楼栋、房型或当前设施完全一致。
- 快递图是 2025 年线索的清晰化示意，位置、品牌和营业状态必须现场复核；不得用于精确导航。
- 餐饮图中的店铺归属来自原笔记评论与高德同名 POI 交叉线索，不代表当前菜单、价格或营业状态。
- 叮叮车确实是校内通称，但本组车型、车库和候车点图片均是概念重构，不代表真实车辆或真实场景；票价、座位、乘车点和时刻仍待当学期核验。
- 原始研究素材尚未取得原作者或相关权利人的书面再利用许可；视觉重构不能替代授权。本目录及原始素材目录均为内部研究区，不得复制到 `public/`、前台页面、PWA 产物或其他公开媒体。
- PNG 母版与原始 WebP 仅保存在维护者本地，并由 `.gitignore` 排除；仓库只保留本索引和权利状态清单，避免通过 Git 再分发二进制素材。

## 调用约定

内部核验脚本和维护人员可用索引键检索本表；文件路径均相对于仓库根目录：

- 研究母版目录：`data/generated/xiaohongshu-recreations-2026-07-15/`
- 原始研究目录：`data/imports/xiaohongshu-assets/`
- 公开静态目录：无；未取得许可前不得创建浏览器 URL。

| 索引键 | 生成文件 | 原始素材 | 内容 | 建议用途 |
| --- | --- | --- | --- | --- |
| `dorm.standard_room.overview` | `dorm-standard-room-overview-hd.png` | `dorm-note-01.webp` | 普通型宿舍四组上床下桌、空调、风扇和窗户布局 | 宿舍文章内部配图候选；需注明“AI重构” |
| `dorm.standard_environment.cover` | `dorm-standard-environment-cover-hd.png` | `dorm-note-02.webp` | “仰恩大学普通型宿舍环境核验资料”封面 | 研究文档封面 |
| `dorm.public_shower.stalls` | `dorm-public-shower-stalls-hd.png` | `dorm-note-03.webp` | 公共浴室隔间走廊 | 公共卫浴说明候选；楼栋待核验 |
| `dorm.public_restroom.stalls` | `dorm-public-restroom-stalls-hd.png` | `dorm-note-04.webp` | 公共厕所隔间 | 公共卫浴说明候选；楼栋待核验 |
| `dorm.communal_washroom` | `dorm-communal-washroom-hd.png` | `dorm-note-05.webp` | 公共洗漱区、水龙头、镜面与排水区 | 公共卫浴说明候选；楼栋待核验 |
| `express.new_area.student_street` | `express-new-area-student-street-reference-hd.png` | `express-map-01.webp` | 新区学生街一至五街及六个快递线索 | 现场核验工作底图，不作导航 |
| `express.old_area.south_gate_route` | `express-old-area-south-gate-route-reference-hd.png` | `express-map-02.webp` | 南门、三颗球、普照大礼堂等旧区路线关系 | 旧区步行核验清单 |
| `express.old_area.south_gate_pickup` | `express-old-area-south-gate-pickup-reference-hd.png` | `express-map-03.webp` | 南门、海南楼、西侧楼梯、中通/快递联盟线索 | 快递点现场核验，不作导航 |
| `express.old_area.honglu_building` | `express-old-area-honglu-building-reference-hd.png` | `express-map-04.webp` | 红侣楼、永春楼、普照大礼堂和快递点关系 | 快递点现场核验，不作导航 |
| `food.xiyou.black_pepper_beef` | `food-xiyou-black-pepper-beef-hd.png` | `food-xiyou-01.webp` | 青椒、洋葱与牛肉类菜品视觉重构 | 喜又候选菜品配图；菜单待核验 |
| `food.xiyou.fried_chicken_noodles` | `food-xiyou-fried-chicken-noodles-hd.png` | `food-xiyou-02.webp` | 炸鸡、面条、蔬菜与沙拉酱菜品视觉重构 | 喜又候选菜品配图；菜单待核验 |
| `food.sinian.matcha_shaved_ice` | `food-sinian-matcha-shaved-ice-taro-balls-hd.png` | `food-sinian-01.webp` | 抹茶冰、奶油、果酱与彩色芋圆甜品 | 思念小馆候选菜品；菜单待核验 |
| `food.sinian.spicy_chicken_pot` | `food-sinian-spicy-chicken-pot-hd.png` | `food-sinian-02.webp` | 辣椒、蒜蓉、香菜与鸡肉锅类菜品 | 思念小馆候选菜品；菜单待核验 |
| `dingding.historical_operation_info` | `dingding-historical-operation-info-hd.png` | `dingding-note-01.webp` | 旧资料信息卡：1元、约13座、候车点等均标为待复核 | 内部交通资料摘要；车型插画不代表实车 |
| `dingding.shuttle_fleet_concept` | `dingding-shuttle-fleet-concept-hd.png` | `dingding-note-02.webp` | 无轨电动校园接驳车队概念图 | 只能标注“概念示意” |
| `dingding.shuttle_depot_concept` | `dingding-shuttle-depot-concept-hd.png` | `dingding-note-03.webp` | 老式红砖建筑与接驳车停放区概念图 | 只能标注“概念示意” |
| `dingding.new_area_stop_concept` | `dingding-new-area-stop-concept-hd.png` | `dingding-note-04.webp` | 新区教学建筑旁候车点概念图 | 只能标注“概念示意”，非和昌楼实景 |
| `dingding.old_area_stop_concept` | `dingding-old-area-stop-concept-hd.png` | `dingding-note-05.webp` | 旧区校园道路与候车亭概念图 | 只能标注“概念示意”，非创业园实景 |

## 来源笔记

| 分类 | 笔记 | 作者页面显示名 | 稳定来源 |
| --- | --- | --- | --- |
| 宿舍 | 最关心的问题大揭秘 | 仰恩学姐 | <https://www.xiaohongshu.com/explore/6a45ba77000000000702a5ff> |
| 快递 | 仰恩大学新区快递驿站地图 | 湖里 | <https://www.xiaohongshu.com/explore/689c97e4000000001b023cb9> |
| 餐饮 | 仰恩大学吃什么 | 动感光啵啵啵啵啵 | <https://www.xiaohongshu.com/explore/6a4526e900000000200388d6> |
| 叮叮车 | 仰恩叮叮车保姆级攻略｜夏令+冬令时段 | 仰恩大学交流圈 | <https://www.xiaohongshu.com/explore/686f0ee4000000001202cb14> |

## 生成与命名规则

- 模型路径：Codex 内置 Image 2 图像生成。
- 通用要求：高清重构、清理水印、移除平台标记、不保留账号信息、不虚构官方标识。
- 宿舍与餐饮：尽量保留原图可见物体和构图，改善亮度、透视与细节。
- 快递：重绘为参考示意图，并显著保留“位置待复核”语义。
- 叮叮车：对争议原图改为概念图，不再把生成场景包装为真实校园实拍。
- 文件名格式：`<主题>-<对象>-<用途>-hd.png`，全小写英文与连字符，避免后续代码引用中文路径。

## 图片预览

### 宿舍

![普通型宿舍房间](./dorm-standard-room-overview-hd.png)

![普通型宿舍环境封面](./dorm-standard-environment-cover-hd.png)

![公共浴室隔间](./dorm-public-shower-stalls-hd.png)

![公共厕所隔间](./dorm-public-restroom-stalls-hd.png)

![公共洗漱区](./dorm-communal-washroom-hd.png)

### 快递参考图

![新区学生街快递点参考](./express-new-area-student-street-reference-hd.png)

![旧区南门路线参考](./express-old-area-south-gate-route-reference-hd.png)

![旧区南门快递点参考](./express-old-area-south-gate-pickup-reference-hd.png)

![红侣楼附近快递参考](./express-old-area-honglu-building-reference-hd.png)

### 餐饮

![喜又牛肉类菜品](./food-xiyou-black-pepper-beef-hd.png)

![喜又炸鸡面类菜品](./food-xiyou-fried-chicken-noodles-hd.png)

![思念小馆抹茶冰与芋圆](./food-sinian-matcha-shaved-ice-taro-balls-hd.png)

![思念小馆鸡肉锅类菜品](./food-sinian-spicy-chicken-pot-hd.png)

### 叮叮车资料与概念图

![叮叮车历史运营资料](./dingding-historical-operation-info-hd.png)

![叮叮车车队概念图](./dingding-shuttle-fleet-concept-hd.png)

![叮叮车停放区概念图](./dingding-shuttle-depot-concept-hd.png)

![叮叮车新区候车点概念图](./dingding-new-area-stop-concept-hd.png)

![叮叮车旧区候车点概念图](./dingding-old-area-stop-concept-hd.png)

## 发布前检查

1. 先取得原作者或相关权利人的可审计再利用许可，或改用项目独立拍摄、独立创作且权利清晰的素材。
2. 对宿舍楼栋、快递位置、菜品归属和叮叮车细节分别完成现场或主管方核验。
3. 检查图中中文、箭头和建筑关系；Image 2 生成的地图文字不能跳过人工校对。
4. 完成许可、事实状态、图片说明和发布范围审核后，才能另建经批准的公开副本。
5. 即使获准公开，也必须标注“AI 重构图”或“概念示意图”；前台精确导航继续使用已核验坐标。
