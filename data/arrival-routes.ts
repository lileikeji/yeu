/**
 * 「到校动线」数据（F1）：从「我现在在 X」到仰恩大学的逐段说明。
 *
 * 数据纪律：
 * - 不写具体班次号、发车时刻、精确票价；票价只给区间，并在文案里写明「以现场为准」。
 * - 拿不到权威来源的数字一律不写：`costCny` 省略，`totalCostCny` 记 null，由页面显示「以现场为准」。
 * - 每条线至少一条可核验的来源；`verifiedAt` 是「链接可达性 + 所引事实」最近一次人工核对的月份（YYYY-MM）。
 *
 * 可核对事实的出处（详见各条 sources）：
 * - K6 泉州站 ↔ 仰恩大学第三校区直达、一票制 2 元：泉州公交 2024-10-25 线路调整公告。
 * - 泉州东站、晋江机场没有核对到稳定的直达公交：只写到「换乘，以当天实时公交为准」。
 * - 学校公开校址：福建省泉州市洛江区马甲镇仰恩大学。
 */

export interface ArrivalRouteStep {
  title: string
  detail: string
  /** 本步耗时区间（分钟），[最短, 最长]，两端都含。 */
  durationMin: [number, number]
  /** 本步费用区间（人民币元）。没有可引用票价时不写这个字段。 */
  costCny?: [number, number]
  /** 只放会影响决定的提醒：站台、方向、末班、行李。 */
  tip?: string
}

export interface ArrivalRouteSource {
  label: string
  url: string
  /** 核验月份，YYYY-MM。 */
  verifiedAt: string
}

export interface ArrivalRoute {
  id: string
  from: string
  fromDetail: string
  steps: ArrivalRouteStep[]
  totalDurationMin: [number, number]
  /**
   * 全程费用区间。只在确有可引用票价时给区间；
   * 没有核验到票价的线路记 null，页面显示「以现场为准」。
   */
  totalCostCny: [number, number] | null
  /** 雨天 / 夜间 / 行李三类会影响选择的情况。 */
  notes: string[]
  sources: ArrivalRouteSource[]
}

const quanzhouStation: ArrivalRoute = {
  id: 'quanzhou-station',
  from: '泉州站',
  fromDetail: '福厦铁路泉州站。出站后跟着「公交 / 出租」指示牌走到地面广场，不要下到地下停车场等公交。',
  steps: [
    {
      title: '出站到公交上客区',
      detail: '按站内指引到地面公交站，先在站牌上确认方向写着「仰恩大学第三校区」，再排队。',
      durationMin: [5, 10],
      tip: '大件行李走电梯，出站高峰楼梯会排队。'
    },
    {
      title: '等 K6 路',
      detail: 'K6 是这条线上核对到的直达公交，从泉州站发往仰恩大学第三校区；发车间隔以当天站牌和实时公交为准。',
      durationMin: [5, 20],
      tip: '上车前问一句「到仰恩大学吗」，避免坐反方向。'
    },
    {
      title: '乘 K6 直达学校',
      detail: '全程不换乘，穿过市区北部后进入洛江区马甲镇，沿途站点较多，行李靠边放。',
      durationMin: [55, 80],
      costCny: [2, 2],
      tip: '2024 年 10 月泉州公交公告为一票制 2 元；票价与支付方式以现场投币 / 扫码为准。'
    },
    {
      title: '在「仰恩大学第三校区」站下车',
      detail: '下车点在学校一侧，跟着迎新指示牌走。新区、旧区方向不同，先看清路牌再拖行李。',
      durationMin: [5, 10]
    },
    {
      title: '到报到点或宿舍',
      detail: '报到点、接站和校内路线每年由学校迎新公告确定；公告出来前不要按往年位置预设。校内坡多，可坐叮叮车代步。',
      durationMin: [10, 25],
      tip: '叮叮车的站点、票价和末班时间以现场标识为准。'
    }
  ],
  totalDurationMin: [90, 140],
  totalCostCny: [2, 2],
  notes: [
    '雨天：公交上客区有顶棚，但下车后到宿舍有一段露天路，雨具放随身包，不要压进行李箱底层。',
    '夜间：K6 末班较早，不同公开来源的时刻有差异；夜间到站优先正规出租车或平台网约车，车费按平台实时计价。',
    '行李：K6 是普通公交，没有行李舱；大件靠车门放，贵重物品随身。'
  ],
  sources: [
    {
      label: '仰恩大学官网（校址与迎新公告入口）',
      url: 'https://www.yeu.edu.cn/',
      verifiedAt: '2026-11'
    },
    {
      label: '泉州公交集团（线路与票价公告入口）',
      url: 'https://www.qzbus.cn/',
      verifiedAt: '2026-07'
    },
    {
      label: '泉州公交 K2、K6 线路调整公告（2024-10，福建日报）',
      url: 'https://www.fjdaily.com/app/content/2024-10/25/content_2875425.html',
      verifiedAt: '2026-07'
    }
  ]
}

const quanzhouEast: ArrivalRoute = {
  id: 'quanzhou-east',
  from: '泉州东站',
  fromDetail: '福厦高铁泉州东站。出站后到站前广场公交站；这里不是泉州站，K6 不在这里始发，别照搬泉州站攻略。',
  steps: [
    {
      title: '出站到公交站',
      detail: '出闸后按「公交」指引到站前广场，先看站牌上的线路名，再决定排哪一队。',
      durationMin: [5, 10]
    },
    {
      title: '确认当天的换乘方案',
      detail: '泉州东站到学校没有核对到稳定的直达线路；公开地图常见方案是 K507 接 K2，但线路会调整，出发前用实时公交重新规划。',
      durationMin: [5, 15],
      tip: '先把终点设为「仰恩大学第三校区」，看清换乘站再上车。'
    },
    {
      title: '乘第一段公交',
      detail: '按当天规划坐第一段，方向和站点以站牌为准，不要因为「看起来顺路」提前下车。',
      durationMin: [25, 40]
    },
    {
      title: '换乘 K2 路',
      detail: '换乘站和步行距离以当天规划为准，留出找站台的时间；带行李时尽量选同站换乘。',
      durationMin: [10, 20]
    },
    {
      title: '乘 K2 到「仰恩大学第三校区」',
      detail: 'K2 连接市区与学校，末班通常晚于 K6，但仍以当天实时公交为准。',
      durationMin: [35, 50]
    },
    {
      title: '下车到报到点或宿舍',
      detail: '下车后按迎新指示牌走；报到点每年可能调整，以学校当年公告为准。',
      durationMin: [10, 20]
    }
  ],
  totalDurationMin: [110, 160],
  totalCostCny: null,
  notes: [
    '雨天：换乘多在露天站台，转乘时多留 10 分钟，雨具别放进行李箱。',
    '夜间：东站周边夜间班次少，不要在不熟悉的站点长时间等车；优先正规出租车或平台网约车。',
    '行李：两次乘车、一次换乘，行李多时换乘成本明显上升；打车费用按平台实时计价。'
  ],
  sources: [
    {
      label: '泉州公交集团（线路与票价公告入口）',
      url: 'https://www.qzbus.cn/',
      verifiedAt: '2026-07'
    },
    {
      label: '仰恩大学官网（校址与迎新公告入口）',
      url: 'https://www.yeu.edu.cn/',
      verifiedAt: '2026-11'
    },
    {
      label: '高德地图（当天换乘方案与实时公交）',
      url: 'https://ditu.amap.com/',
      verifiedAt: '2026-07'
    }
  ]
}

const jinjiangAirport: ArrivalRoute = {
  id: 'jinjiang-airport',
  from: '晋江机场',
  fromDetail: '泉州晋江国际机场到达层。取完行李出闸后按「机场巴士 / 公交 / 出租车」指示走，不要在到达层门口上揽客的车。',
  steps: [
    {
      title: '取行李、确认出口',
      detail: '先看航班信息屏确认行李转盘，出闸后认准机场官方指示牌，别跟着喊客的人走。',
      durationMin: [10, 20]
    },
    {
      title: '到地面交通区',
      detail: '按指示到机场巴士 / 公交 / 出租车乘车点；机场巴士班次以机场当天公告为准。',
      durationMin: [5, 15],
      tip: '夜间落地优先正规出租车或平台网约车，上车前确认车牌。'
    },
    {
      title: '乘第一段公交进城方向',
      detail: '机场到学校没有核对到稳定的直达公交；公开地图方案通常要换乘 1-2 次，具体线路以当天实时公交为准。',
      durationMin: [40, 60]
    },
    {
      title: '换乘',
      detail: '换乘站、步行距离和候车时间以当天规划为准；行李多时先看清站台再挪动。',
      durationMin: [10, 20]
    },
    {
      title: '乘第二段公交到「仰恩大学第三校区」',
      detail: '上车前再确认一次方向，避免坐过马甲镇后折返。',
      durationMin: [40, 70]
    },
    {
      title: '下车到报到点或宿舍',
      detail: '下车后按迎新指示牌走，校内可坐叮叮车；站点和票价以现场标识为准。',
      durationMin: [10, 25]
    }
  ],
  totalDurationMin: [150, 210],
  totalCostCny: null,
  notes: [
    '雨天：机场到公交站有一段露天路，落地前把雨具放在随身包外层。',
    '夜间：末班车受航班落地时间影响，落地晚就不要赌末班；夜间优先正规出租车或平台网约车。',
    '行李：两次换乘对行李不友好，多人同行时可直接比较网约车；车费按平台实时计价。'
  ],
  sources: [
    {
      label: '泉州晋江国际机场（航班与机场交通）',
      url: 'https://www.qzair.com/',
      verifiedAt: '2026-07'
    },
    {
      label: '泉州公交集团（线路与票价公告入口）',
      url: 'https://www.qzbus.cn/',
      verifiedAt: '2026-07'
    },
    {
      label: '高德地图（当天换乘方案与实时公交）',
      url: 'https://ditu.amap.com/',
      verifiedAt: '2026-07'
    }
  ]
}

const selfDrive: ArrivalRoute = {
  id: 'self-drive',
  from: '自驾',
  fromDetail: '导航目的地直接设「仰恩大学」（福建省泉州市洛江区马甲镇）。常见路线走沈海高速、从泉州北出口下；出口和连接线以出发当天导航为准。',
  steps: [
    {
      title: '下高速',
      detail: '按导航从泉州北出口驶出，进入地方道路；节假日出口可能排队，留出余量。',
      durationMin: [5, 10]
    },
    {
      title: '走地方道路进马甲镇',
      detail: '沿导航经洛江方向进入马甲镇，最后一段是乡镇道路，注意电动车、行人和路口摊点。',
      durationMin: [20, 35],
      tip: '夜间这段路灯稀疏，会车减速，不要跟大车抢道。'
    },
    {
      title: '到校门 / 落客点',
      detail: '报到日的车辆进校、落客点和停车区由学校当年交通管制公告决定；公告出来前按现场指引走，不要自行把车开进宿舍区。',
      durationMin: [5, 15],
      tip: '家长车辆能否开到宿舍楼下，以当年迎新交通公告为准。'
    },
    {
      title: '卸行李、步行到报到点',
      detail: '车停稳后先卸行李再找人，行李不要留在无人看管的车边；报到点按迎新指示牌走。',
      durationMin: [10, 20]
    }
  ],
  totalDurationMin: [45, 90],
  totalCostCny: null,
  notes: [
    '雨天：乡镇道路可能积水，进校前先看学校发布的停车与落客调整。',
    '夜间：马甲镇路段照明一般，尽量两人轮换驾驶，别在路边长时间停车整理行李。',
    '行李：后备箱先放雨具和第一晚要用的东西，避免到校后翻箱。'
  ],
  sources: [
    {
      label: '仰恩大学官网（校址与迎新公告入口）',
      url: 'https://www.yeu.edu.cn/',
      verifiedAt: '2026-11'
    },
    {
      label: '高德地图（高速出口与到校路线规划）',
      url: 'https://ditu.amap.com/',
      verifiedAt: '2026-07'
    }
  ]
}

/** 页面默认展示的第一条线（也是无 JS 时服务端直出的那条）。 */
export const defaultArrivalRoute: ArrivalRoute = quanzhouStation

export const arrivalRoutes: ArrivalRoute[] = [
  quanzhouStation,
  quanzhouEast,
  jinjiangAirport,
  selfDrive
]
