export type TransitOriginId = 'quanzhou-station' | 'quanzhou-east' | 'jinjiang-airport' | 'city-center' | 'from-campus'

export interface CampusTransitOption {
  id: string
  originId: TransitOriginId
  title: string
  badge: string
  summary: string
  duration: string
  fare: string
  serviceHours: string
  steps: string[]
  notes: string[]
  keywords: string[]
  mapUrl: string
  sourceIds: string[]
  recommended?: boolean
}

export interface TransitSource {
  id: string
  title: string
  url: string
  note: string
}

export const campusTransitUpdatedAt = '2026-07-26'

export const campusTransitOrigins = [
  { id: 'quanzhou-station', label: '泉州站', icon: 'i-lucide-train-front' },
  { id: 'quanzhou-east', label: '泉州东站', icon: 'i-lucide-train-front-tunnel' },
  { id: 'jinjiang-airport', label: '晋江机场', icon: 'i-lucide-plane' },
  { id: 'city-center', label: '泉州市区', icon: 'i-lucide-building-2' },
  { id: 'from-campus', label: '从学校出发', icon: 'i-lucide-school' }
] as const satisfies ReadonlyArray<{ id: TransitOriginId, label: string, icon: string }>

export const campusTransitSources: TransitSource[] = [
  {
    id: 'qzbus',
    title: '泉州公交集团',
    url: 'https://www.qzbus.cn/',
    note: '公交线路调整和临时运营通知的官方核验入口。'
  },
  {
    id: 'k6-reference',
    title: '泉州公交 K6 路线路资料',
    url: 'https://baike.baidu.com/item/%E6%B3%89%E5%B7%9E%E5%85%AC%E4%BA%A4K6%E8%B7%AF',
    note: '用于交叉核对泉州站至仰恩大学第三校区的直达关系；班次仍以实时公交为准。'
  },
  {
    id: 'k2-reference',
    title: '泉州公交 K2 路线路资料',
    url: 'https://baike.baidu.com/item/%E6%B3%89%E5%B7%9E%E5%85%AC%E4%BA%A4K2%E8%B7%AF',
    note: '用于交叉核对文化宫至仰恩大学第三校区的线路关系；票价和时刻可能调整。'
  },
  {
    id: 'amap',
    title: '高德地图实时公交与路线规划',
    url: 'https://ditu.amap.com/',
    note: '东站、机场、临时绕行和当天发车情况应在出发前重新规划。'
  },
  {
    id: 'airport',
    title: '泉州晋江国际机场',
    url: 'https://www.qzair.com/',
    note: '核对航班、机场交通及现场乘车位置。'
  }
]

export const campusTransitOptions: CampusTransitOption[] = [
  {
    id: 'station-k6',
    originId: 'quanzhou-station',
    title: 'K6 路直达学校',
    badge: '首选直达',
    summary: '福厦铁路泉州站上车，仰恩大学第三校区站下车，不需要换乘。',
    duration: '通常约 60-90 分钟',
    fare: '2 元起，按上下车站点分段计价',
    serviceHours: '常见资料：泉州站约 07:20-18:10；学校约 06:30-18:10',
    steps: [
      '抵达泉州站后，按公交指引前往公交上客区。',
      '乘坐开往仰恩大学第三校区方向的 K6 路。',
      '在“仰恩大学第三校区”站下车，再按宿舍片区进入新区或换校内交通。'
    ],
    notes: ['不同公开来源对泉州站首班时间存在约 20 分钟差异。', '返程在仰恩大学第三校区站乘 K6 路前往泉州站，赶动车务必预留候车和堵车时间。'],
    keywords: ['泉州站', '动车站', '高铁站', 'K6', '到校', '离校', '直达公交'],
    mapUrl: 'https://ditu.amap.com/dir?from%5Bname%5D=%E6%B3%89%E5%B7%9E%E7%AB%99&to%5Bname%5D=%E4%BB%B0%E6%81%A9%E5%A4%A7%E5%AD%A6&type=bus',
    sourceIds: ['qzbus', 'k6-reference', 'amap'],
    recommended: true
  },
  {
    id: 'east-transfer',
    originId: 'quanzhou-east',
    title: '公交换乘到校',
    badge: '需要换乘',
    summary: '没有核对到稳定的直达线路；地图检索常见方案为 K507 路与 K2 路换乘。',
    duration: '动态方案通常约 1 小时 50 分',
    fare: '按当天换乘线路计费',
    serviceHours: '受 K507、K2 当天班次共同限制',
    steps: [
      '在泉州东站打开实时公交规划，目的地选“仰恩大学第三校区”。',
      '当前检索常见为 K507 与 K2 换乘，具体换乘站以当天地图结果为准。',
      '携带大件行李或晚间到站时，优先比较网约车时间与费用。'
    ],
    notes: ['不要把泉州东站和泉州站混淆，K6 的铁路直达起点是泉州站。', '线路调整后组合可能变化，本站不把某一换乘站写死。'],
    keywords: ['泉州东站', 'K507', 'K2', '换乘', '到校', '离校'],
    mapUrl: 'https://ditu.amap.com/dir?from%5Bname%5D=%E6%B3%89%E5%B7%9E%E4%B8%9C%E7%AB%99&to%5Bname%5D=%E4%BB%B0%E6%81%A9%E5%A4%A7%E5%AD%A6&type=bus',
    sourceIds: ['amap'],
    recommended: true
  },
  {
    id: 'airport-transit',
    originId: 'jinjiang-airport',
    title: '实时公交换乘',
    badge: '耗时较长',
    summary: '机场到学校没有核对到稳定直达公交，公开地图方案通常需要 1-2 次换乘。',
    duration: '公交常接近 3 小时',
    fare: '按当天换乘线路计费',
    serviceHours: '取决于航班落地时间和各段末班车',
    steps: [
      '在机场到达层确认公交乘车位置。',
      '打开实时地图，以“泉州晋江国际机场”为起点、“仰恩大学”为终点重新规划。',
      '若落地较晚、行李较多或多人同行，比较网约车直达方案。'
    ],
    notes: ['历史检索可见 K604 转 11 路等组合，但线路会调整，不建议提前照搬。', '夜间不要在不熟悉的站点长时间等待，优先选择正规出租车或平台网约车。'],
    keywords: ['晋江机场', '泉州晋江国际机场', '飞机', '公交换乘', '到校', '离校'],
    mapUrl: 'https://ditu.amap.com/dir?from%5Bname%5D=%E6%B3%89%E5%B7%9E%E6%99%8B%E6%B1%9F%E5%9B%BD%E9%99%85%E6%9C%BA%E5%9C%BA&to%5Bname%5D=%E4%BB%B0%E6%81%A9%E5%A4%A7%E5%AD%A6&type=bus',
    sourceIds: ['airport', 'amap'],
    recommended: true
  },
  {
    id: 'city-k2',
    originId: 'city-center',
    title: 'K2 路往返文化宫与学校',
    badge: '市区主线路',
    summary: 'K2 路连接泉州文化宫与仰恩大学第三校区，适合从中心城区进出学校。',
    duration: '通常需预留约 70-100 分钟',
    fare: '2 元起，按上下车站点分段计价；全程公开资料约 5 元',
    serviceHours: '常见资料：文化宫约 06:30-22:00；学校约 06:30-21:40',
    steps: [
      '前往文化宫公交站，确认车辆方向为仰恩大学第三校区。',
      '乘 K2 路至仰恩大学第三校区站。',
      '从学校去市区时反向乘坐 K2，末班前提前到站。'
    ],
    notes: ['K2 运营时间通常晚于 K6，但节假日和临时调整仍以实时公交为准。', '前往开元寺、西街等地点，可到市区后再换乘或步行。'],
    keywords: ['泉州市区', '文化宫', 'K2', '西街', '开元寺', '进城', '离校'],
    mapUrl: 'https://ditu.amap.com/dir?from%5Bname%5D=%E6%B3%89%E5%B7%9E%E6%96%87%E5%8C%96%E5%AE%AB&to%5Bname%5D=%E4%BB%B0%E6%81%A9%E5%A4%A7%E5%AD%A6&type=bus',
    sourceIds: ['qzbus', 'k2-reference', 'amap'],
    recommended: true
  },
  {
    id: 'campus-departure',
    originId: 'from-campus',
    title: '先选目的地，再反向乘车',
    badge: '离校速查',
    summary: '去泉州站优先看 K6；去文化宫和中心城区优先看 K2；去东站或机场需换乘或打车。',
    duration: '按目的地和当天路况变化',
    fare: 'K6、K2 均为 2 元起，按上下车站点分段计价；K2 全程公开资料约 5 元',
    serviceHours: 'K6 末班较早，K2 通常运营到夜间',
    steps: [
      '动车从泉州站出发：优先 K6，并为堵车、进站安检预留至少 60 分钟缓冲。',
      '去泉州市中心：乘 K2 前往文化宫方向。',
      '去泉州东站或晋江机场：当天重新规划换乘；携带大件行李时比较正规网约车。'
    ],
    notes: ['节假日前后客流大，尽量提前购票、提前出发。', '错过末班车时不要乘坐无平台记录的揽客车辆。'],
    keywords: ['离校', '学校怎么出去', '去泉州站', '去市区', '去机场', '末班车', 'K6', 'K2'],
    mapUrl: 'https://ditu.amap.com/dir?from%5Bname%5D=%E4%BB%B0%E6%81%A9%E5%A4%A7%E5%AD%A6&type=bus',
    sourceIds: ['qzbus', 'k6-reference', 'k2-reference', 'amap'],
    recommended: true
  }
]

export function transitOptionsForOrigin(originId: TransitOriginId): CampusTransitOption[] {
  return campusTransitOptions.filter(option => option.originId === originId)
}

export function campusTransitSearchText(option: CampusTransitOption): string {
  return [
    option.title,
    option.summary,
    option.duration,
    option.fare,
    option.serviceHours,
    ...option.steps,
    ...option.notes,
    ...option.keywords
  ].join(' ')
}
