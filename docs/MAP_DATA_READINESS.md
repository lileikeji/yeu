# 地图数据就绪台账

> 数据快照：2026-07-15（Asia/Shanghai）
> 数据来源：本机验收库 `.data/codex-map-content-20260713.sqlite` 的只读查询
> 覆盖范围：高德工作地图导入的 76 个地点草稿
> 重要说明：本表不包含、推测或近似生成任何经纬度
> 权威性：本页仅为现场执行快照，不是实时发布依据；发布验收必须对目标 SQLite 运行 `pnpm map:readiness --database PATH --require-release-ready`，以该次 JSON 和退出码为准

## 1. 当前结论

| 指标 | 当前值 |
| --- | ---: |
| 地点总数 | 76 |
| `scope=campus` | 76 |
| `status=draft` | 76 |
| 工作地图 GCJ-02 草稿坐标完整 | 76 |
| `coordinate_verification=unverified` | 76 |
| 已分配 `coordinate_point_role` | 0 |
| `place_coordinate_observations` | 0 |
| `place_sources` 正式关联 | 34 |
| 有至少一个可发布正式来源的地点 | 26 |
| 仍无可发布正式来源的地点 | 50 |
| 可公开导航标点 | 0 |
| 发布门禁阻塞类型 | 7 |

工作地图导入证明这些名称和草稿坐标存在于用户自有资料中，但不等于校方确认、当前用途确认、主入口确认或现场坐标核验。76 个草稿点已同步为 `unverified` 工作坐标，仍不得作为公开导航点。地址文本存在就近地址和错配风险，不进入本台账，也不能用于自动地理编码后直接发布。

本次只读报告命令为 `pnpm map:readiness --database .data/codex-map-content-20260713.sqlite`。当前七类阻塞分别是：未发布、无可发布坐标、无可发布来源、无事实核验时间、无发布时间、无点位角色、无当前双重坐标证据。其中“无可发布来源”已由 76 个降至 50 个，其余六类仍影响 76 个地点，不能通过批量修改状态绕过。

## 2. 采集批次

批次只是现场执行顺序，不是来源可信等级：

| 批次 | 数量 | 规划依据 | 进入下一状态前的动作 |
| --- | ---: | --- | --- |
| A | 18 | 校门、主要教学楼、行政/网络/安保、医务、图书馆和交通点 | 先确认正式名称与主入口，再采 3-5 个 WGS84 样本并做第二次复核 |
| B | 45 | 名称为楼宇的记录、餐厅、快递和主要生活服务 | 先确认楼宇当前用途，不能因名称或旧地址直接断言为宿舍；再核验入口和运营规则 |
| C | 13 | 体育、活动、广场、桥梁和其他补充地点 | 先确认是否仍存在、正式名称及应采入口还是场地点 |

批次 A 的来源准备度为 12/18。仍缺可发布正式来源的 6 个 P0 点是：南门、新区医务所、旧区医务所、仰恩大学第三校区（公交站）、旧区公交车下车点、旧区公交车上车点。它们应先向保卫处、医务主管部门或当前公交运营方确认名称、用途和开放/运营状态；不得只用工作地图名称补来源。已有来源的 12 个点也仍需两次现场 WGS84 观测，不能把来源关联当作坐标证据。

每个地点至少经过以下状态链：

```text
导入草稿
  -> 正式名称/用途来源已关联
  -> 第一次坐标观测待审核
  -> 第一次观测批准为 unverified 候选
  -> 第二条独立观测通过双证据规则
  -> WGS84 主坐标 verified
  -> 地点事实与坐标均在有效期
  -> 发布并抽样验证外部导航
```

坐标批准不会自动完成事实核验，也不会自动发布地点。具体采点和批准规则见 [FIELD_COORDINATE_VERIFICATION.md](./FIELD_COORDINATE_VERIFICATION.md)。

## 3. 逐点台账

“源行”是原工作地图“标记位置”工作表行号；“来源数”只统计数据库 `place_sources` 正式关联，不把导入引用当成可发布来源。“现场证据”中的 `missing` 表示尚无可审核的正式坐标观测，不代表工作地图草稿坐标为空；“观测数”统计现场坐标观测。快照中所有点的下一动作都是：按批次确认名称/用途与点位角色，建立正式来源，再采集并审核坐标。

| # | 源行 | 稳定 slug | 地点名 | 当前类型 | 类别 | 批次 | 来源数 | 现场证据 | 观测数 | 发布状态 |
| ---: | ---: | --- | --- | --- | --- | :---: | ---: | --- | ---: | --- |
| 1 | 2 | `amap-workmap-20260713-r002` | 泽钏教学楼 | `teaching-building` | `campus-building` | A | 1 | `missing` | 0 | `draft` |
| 2 | 3 | `amap-workmap-20260713-r003` | 网络信息中心 | `place` | - | A | 1 | `missing` | 0 | `draft` |
| 3 | 4 | `amap-workmap-20260713-r004` | 南门 | `gate` | `gate` | A | 0 | `missing` | 0 | `draft` |
| 4 | 5 | `amap-workmap-20260713-r005` | 南洋楼 | `building` | - | B | 1 | `missing` | 0 | `draft` |
| 5 | 6 | `amap-workmap-20260713-r006` | 长春楼 | `building` | - | B | 1 | `missing` | 0 | `draft` |
| 6 | 7 | `amap-workmap-20260713-r007` | 长安楼 | `building` | - | B | 1 | `missing` | 0 | `draft` |
| 7 | 8 | `amap-workmap-20260713-r008` | 宏船楼 | `building` | - | B | 1 | `missing` | 0 | `draft` |
| 8 | 9 | `amap-workmap-20260713-r009` | 共和教学楼 | `teaching-building` | `campus-building` | A | 1 | `missing` | 0 | `draft` |
| 9 | 10 | `amap-workmap-20260713-r010` | 吉龙教学楼 | `teaching-building` | `campus-building` | A | 1 | `missing` | 0 | `draft` |
| 10 | 11 | `amap-workmap-20260713-r011` | 仰光楼 | `building` | - | B | 1 | `missing` | 0 | `draft` |
| 11 | 12 | `amap-workmap-20260713-r012` | 黄海楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 12 | 13 | `amap-workmap-20260713-r013` | 东海楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 13 | 14 | `amap-workmap-20260713-r014` | 新区医务所 | `health-service` | `service` | A | 0 | `missing` | 0 | `draft` |
| 14 | 15 | `amap-workmap-20260713-r015` | 旧区医务所 | `health-service` | `service` | A | 0 | `missing` | 0 | `draft` |
| 15 | 16 | `amap-workmap-20260713-r016` | 新区行政楼 | `building` | - | A | 1 | `missing` | 0 | `draft` |
| 16 | 17 | `amap-workmap-20260713-r017` | 旧区行政楼 | `building` | - | A | 1 | `missing` | 0 | `draft` |
| 17 | 18 | `amap-workmap-20260713-r018` | 曼谷楼 | `building` | - | B | 1 | `missing` | 0 | `draft` |
| 18 | 19 | `amap-workmap-20260713-r019` | 西苑餐厅 | `dining` | `food` | B | 4 | `missing` | 0 | `draft` |
| 19 | 20 | `amap-workmap-20260713-r020` | 校保卫处 | `place` | - | A | 1 | `missing` | 0 | `draft` |
| 20 | 21 | `amap-workmap-20260713-r021` | 韵达快递 | `express-service` | `express` | B | 0 | `missing` | 0 | `draft` |
| 21 | 22 | `amap-workmap-20260713-r022` | 普照大礼堂 | `event-venue` | `campus-building` | C | 1 | `missing` | 0 | `draft` |
| 22 | 23 | `amap-workmap-20260713-r023` | 创业园 | `place` | - | C | 2 | `missing` | 0 | `draft` |
| 23 | 24 | `amap-workmap-20260713-r024` | 多功能报告厅 | `event-venue` | `campus-building` | C | 0 | `missing` | 0 | `draft` |
| 24 | 25 | `amap-workmap-20260713-r025` | 祥贤楼 | `building` | - | B | 1 | `missing` | 0 | `draft` |
| 25 | 26 | `amap-workmap-20260713-r026` | 和昌教学楼 | `teaching-building` | `campus-building` | A | 1 | `missing` | 0 | `draft` |
| 26 | 27 | `amap-workmap-20260713-r027` | 北苑餐厅 | `dining` | `food` | B | 3 | `missing` | 0 | `draft` |
| 27 | 28 | `amap-workmap-20260713-r028` | 东苑餐厅 | `dining` | `food` | B | 3 | `missing` | 0 | `draft` |
| 28 | 29 | `amap-workmap-20260713-r029` | 衡山楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 29 | 30 | `amap-workmap-20260713-r030` | 彩虹桥 | `place` | - | C | 0 | `missing` | 0 | `draft` |
| 30 | 31 | `amap-workmap-20260713-r031` | 威海楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 31 | 32 | `amap-workmap-20260713-r032` | 宝洁洗衣店（圆通、顺丰） | `place` | - | B | 0 | `missing` | 0 | `draft` |
| 32 | 33 | `amap-workmap-20260713-r033` | 快递联盟（中通） | `express-service` | `express` | B | 0 | `missing` | 0 | `draft` |
| 33 | 34 | `amap-workmap-20260713-r034` | 陕西楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 34 | 35 | `amap-workmap-20260713-r035` | 吉林楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 35 | 36 | `amap-workmap-20260713-r036` | 湖南楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 36 | 37 | `amap-workmap-20260713-r037` | 黑龙江楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 37 | 38 | `amap-workmap-20260713-r038` | 海南楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 38 | 39 | `amap-workmap-20260713-r039` | 重庆楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 39 | 40 | `amap-workmap-20260713-r040` | 四川楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 40 | 41 | `amap-workmap-20260713-r041` | 贵州楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 41 | 42 | `amap-workmap-20260713-r042` | 渤海楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 42 | 43 | `amap-workmap-20260713-r043` | 南海楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 43 | 44 | `amap-workmap-20260713-r044` | 南京楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 44 | 45 | `amap-workmap-20260713-r045` | 天山楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 45 | 46 | `amap-workmap-20260713-r046` | 安徽楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 46 | 47 | `amap-workmap-20260713-r047` | 云南楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 47 | 48 | `amap-workmap-20260713-r048` | 宁夏楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 48 | 49 | `amap-workmap-20260713-r049` | 辽宁楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 49 | 50 | `amap-workmap-20260713-r050` | 甘肃楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 50 | 51 | `amap-workmap-20260713-r051` | 湖北楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 51 | 52 | `amap-workmap-20260713-r052` | 仰恩基金会体育场 | `sports-ground` | `service` | C | 0 | `missing` | 0 | `draft` |
| 52 | 53 | `amap-workmap-20260713-r053` | 永康球场 | `sports-ground` | `service` | C | 1 | `missing` | 0 | `draft` |
| 53 | 54 | `amap-workmap-20260713-r054` | 泰山楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 54 | 55 | `amap-workmap-20260713-r055` | 嵩山楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 55 | 56 | `amap-workmap-20260713-r056` | 黄山楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 56 | 57 | `amap-workmap-20260713-r057` | 华山楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 57 | 58 | `amap-workmap-20260713-r058` | 湖边舞池 | `place` | - | C | 1 | `missing` | 0 | `draft` |
| 58 | 59 | `amap-workmap-20260713-r059` | 湖边操场 | `sports-ground` | `service` | C | 0 | `missing` | 0 | `draft` |
| 59 | 60 | `amap-workmap-20260713-r060` | 珠海楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 60 | 61 | `amap-workmap-20260713-r061` | 北海楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 61 | 62 | `amap-workmap-20260713-r062` | 校主陵园 | `place` | - | C | 0 | `missing` | 0 | `draft` |
| 62 | 63 | `amap-workmap-20260713-r063` | 新区操场 | `sports-ground` | `service` | C | 0 | `missing` | 0 | `draft` |
| 63 | 64 | `amap-workmap-20260713-r064` | 新区学生街 | `place` | - | B | 0 | `missing` | 0 | `draft` |
| 64 | 65 | `amap-workmap-20260713-r065` | 新区和昌教学楼 | `teaching-building` | `campus-building` | A | 1 | `missing` | 0 | `draft` |
| 65 | 66 | `amap-workmap-20260713-r066` | 仰恩教学楼 | `teaching-building` | `campus-building` | A | 1 | `missing` | 0 | `draft` |
| 66 | 67 | `amap-workmap-20260713-r067` | 普照教学楼 | `teaching-building` | `campus-building` | A | 1 | `missing` | 0 | `draft` |
| 67 | 68 | `amap-workmap-20260713-r068` | 碑林广场 | `place` | - | C | 0 | `missing` | 0 | `draft` |
| 68 | 69 | `amap-workmap-20260713-r069` | 文体中心 | `place` | - | C | 0 | `missing` | 0 | `draft` |
| 69 | 70 | `amap-workmap-20260713-r070` | 校史馆 | `place` | - | C | 0 | `missing` | 0 | `draft` |
| 70 | 71 | `amap-workmap-20260713-r071` | 图书馆 | `library` | `campus-building` | A | 1 | `missing` | 0 | `draft` |
| 71 | 72 | `amap-workmap-20260713-r072` | 仰恩大学第三校区(公交站) | `transit-stop` | `service` | A | 0 | `missing` | 0 | `draft` |
| 72 | 73 | `amap-workmap-20260713-r073` | 北京楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 73 | 74 | `amap-workmap-20260713-r074` | 上海楼 | `building` | - | B | 0 | `missing` | 0 | `draft` |
| 74 | 75 | `amap-workmap-20260713-r075` | 旧区公交车下车点 | `transit-stop` | `service` | A | 0 | `missing` | 0 | `draft` |
| 75 | 76 | `amap-workmap-20260713-r076` | 旧区公交车上车点 | `transit-stop` | `service` | A | 0 | `missing` | 0 | `draft` |
| 76 | 77 | `amap-workmap-20260713-r077` | 旧区车来车往（京东） | `place` | - | B | 0 | `missing` | 0 | `draft` |

## 4. 已知核验重点

- “南门”不能按朝向猜测为官网平面图中的某个编号门；现场必须记录门牌、通行对象、开放时段和入口点。
- “和昌教学楼”与“新区和昌教学楼”必须分别核对正式名称和范围，不能因名称相近自动合并。
- 工作地图中“海南楼”的地址提及“四川楼”，“四川楼”和“贵州楼”的地址提及“云南楼”；这些地址不能用于自动改名或赋坐标。
- OSM 的“湖边剧场”不能自动绑定“湖边操场”或“湖边舞池”。
- 新区/旧区医务所的入口、服务范围和电话必须由主管部门当学期确认。
- 快递、洗衣、公交上下车点、学生街和京东点均需要经营方/运营方与现场规则复核，旧平台页面不能证明当前营业或可入校范围。
- 泛化为 `building` 的地点必须先确认是宿舍、教学、行政还是其他用途；不得只凭名称补分类。

## 5. 更新规则

本表是执行快照，不替代数据库，也不得作为发布门禁的机器输入。发生以下任一变化时可更新对应行和顶部统计，实时权威统计始终由 `map:readiness` 从目标数据库重新生成：

- 正式来源关联新增、失效或争议；
- 新观测提交、批准、驳回或被新观测取代；
- 地点类型、正式名称、别名或点位角色经核验改变；
- 地点发布、归档或重新进入待复核；
- 验收环境切换为生产环境。

更新时注明快照日期和数据库环境。不得在本表粘贴经纬度、Cookie、私有工作地图编码之外的登录信息、个人行程或未经许可的原始平台内容；经纬度和原始样本只进入受控数据库审核链。
