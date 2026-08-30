import type { CampusWalkGraph } from '../../map/core/walk-graph'

/**
 * 校内步行参考图（草稿骨架，数据待现场核验后转正）。
 *
 * 起草说明（scripts/draft-campus-walk-graph.ts 生成，verificationStatus: draft-schematic）：
 *  - 节点来自 amap-imported-places 的 76 个标点（owner-map-only，未独立核验）；
 *  - 边为 KNN(K=3) 连接 + 220m 阈值，kind='road'；
 *  - 当前状态：只证明「图论路由链路可用」，边可能穿楼/穿墙、缺少真实门节点；
 *  - 转正条件（用户/校方抽查后按 docs/FIELD_COORDINATE_VERIFICATION.md 流程）：
 *    1) 删除穿楼/穿墙的假边；2) 补充真实出入口（门）节点并连到宿舍区；
 *    3) 关键路径 distanceMeters 填实测值；4) 确认后把 verificationStatus 改为 verified。
 */
export const campusWalkGraph: CampusWalkGraph = {
  nodes: [
    {
      id: 'node-002',
      name: '泽钏教学楼',
      point: {
        lng: 118.60579821,
        lat: 25.11214213,
        crs: 'WGS84'
      },
      aliases: [
        '泽钏教学楼'
      ]
    },
    {
      id: 'node-003',
      name: '网络信息中心',
      point: {
        lng: 118.60737572,
        lat: 25.11231581,
        crs: 'WGS84'
      },
      aliases: [
        '网络信息中心'
      ]
    },
    {
      id: 'node-004',
      name: '南门',
      point: {
        lng: 118.61047233,
        lat: 25.11303997,
        crs: 'WGS84'
      },
      aliases: [
        '南门'
      ]
    },
    {
      id: 'node-005',
      name: '南洋楼',
      point: {
        lng: 118.61029066,
        lat: 25.1137333,
        crs: 'WGS84'
      },
      aliases: [
        '南洋楼'
      ]
    },
    {
      id: 'node-006',
      name: '长春楼',
      point: {
        lng: 118.6101353,
        lat: 25.11491474,
        crs: 'WGS84'
      },
      aliases: [
        '长春楼'
      ]
    },
    {
      id: 'node-007',
      name: '长安楼',
      point: {
        lng: 118.60979767,
        lat: 25.11495934,
        crs: 'WGS84'
      },
      aliases: [
        '长安楼'
      ]
    },
    {
      id: 'node-008',
      name: '宏船楼',
      point: {
        lng: 118.60928066,
        lat: 25.11524624,
        crs: 'WGS84'
      },
      aliases: [
        '宏船楼'
      ]
    },
    {
      id: 'node-009',
      name: '共和教学楼',
      point: {
        lng: 118.60886237,
        lat: 25.11415333,
        crs: 'WGS84'
      },
      aliases: [
        '共和教学楼'
      ]
    },
    {
      id: 'node-010',
      name: '吉龙教学楼',
      point: {
        lng: 118.6110027,
        lat: 25.11432659,
        crs: 'WGS84'
      },
      aliases: [
        '吉龙教学楼'
      ]
    },
    {
      id: 'node-011',
      name: '仰光楼',
      point: {
        lng: 118.61101211,
        lat: 25.1139045,
        crs: 'WGS84'
      },
      aliases: [
        '仰光楼'
      ]
    },
    {
      id: 'node-012',
      name: '黄海楼',
      point: {
        lng: 118.6148394,
        lat: 25.11784343,
        crs: 'WGS84'
      },
      aliases: [
        '黄海楼'
      ]
    },
    {
      id: 'node-013',
      name: '东海楼',
      point: {
        lng: 118.61507322,
        lat: 25.11754215,
        crs: 'WGS84'
      },
      aliases: [
        '东海楼'
      ]
    },
    {
      id: 'node-014',
      name: '新区医务所',
      point: {
        lng: 118.60130345,
        lat: 25.11056882,
        crs: 'WGS84'
      },
      aliases: [
        '新区医务所'
      ]
    },
    {
      id: 'node-015',
      name: '旧区医务所',
      point: {
        lng: 118.61224313,
        lat: 25.11721387,
        crs: 'WGS84'
      },
      aliases: [
        '旧区医务所'
      ]
    },
    {
      id: 'node-016',
      name: '新区行政楼',
      point: {
        lng: 118.60280388,
        lat: 25.10908936,
        crs: 'WGS84'
      },
      aliases: [
        '新区行政楼'
      ]
    },
    {
      id: 'node-017',
      name: '旧区行政楼',
      point: {
        lng: 118.61063506,
        lat: 25.11468708,
        crs: 'WGS84'
      },
      aliases: [
        '旧区行政楼'
      ]
    },
    {
      id: 'node-018',
      name: '曼谷楼',
      point: {
        lng: 118.61137202,
        lat: 25.11422507,
        crs: 'WGS84'
      },
      aliases: [
        '曼谷楼'
      ]
    },
    {
      id: 'node-019',
      name: '西苑餐厅',
      point: {
        lng: 118.59859999,
        lat: 25.10811138,
        crs: 'WGS84'
      },
      aliases: [
        '西苑餐厅'
      ]
    },
    {
      id: 'node-020',
      name: '校保卫处',
      point: {
        lng: 118.59852223,
        lat: 25.10778648,
        crs: 'WGS84'
      },
      aliases: [
        '校保卫处'
      ]
    },
    {
      id: 'node-021',
      name: '韵达快递',
      point: {
        lng: 118.61087054,
        lat: 25.11177602,
        crs: 'WGS84'
      },
      aliases: [
        '韵达快递'
      ]
    },
    {
      id: 'node-022',
      name: '普照大礼堂',
      point: {
        lng: 118.61131235,
        lat: 25.114932,
        crs: 'WGS84'
      },
      aliases: [
        '普照大礼堂'
      ]
    },
    {
      id: 'node-023',
      name: '创业园',
      point: {
        lng: 118.6114338,
        lat: 25.11613666,
        crs: 'WGS84'
      },
      aliases: [
        '创业园'
      ]
    },
    {
      id: 'node-024',
      name: '多功能报告厅',
      point: {
        lng: 118.61166237,
        lat: 25.11646738,
        crs: 'WGS84'
      },
      aliases: [
        '多功能报告厅'
      ]
    },
    {
      id: 'node-025',
      name: '祥贤楼',
      point: {
        lng: 118.61162358,
        lat: 25.11695591,
        crs: 'WGS84'
      },
      aliases: [
        '祥贤楼'
      ]
    },
    {
      id: 'node-026',
      name: '和昌教学楼',
      point: {
        lng: 118.61195938,
        lat: 25.11774153,
        crs: 'WGS84'
      },
      aliases: [
        '和昌教学楼'
      ]
    },
    {
      id: 'node-027',
      name: '北苑餐厅',
      point: {
        lng: 118.61219449,
        lat: 25.11631042,
        crs: 'WGS84'
      },
      aliases: [
        '北苑餐厅'
      ]
    },
    {
      id: 'node-028',
      name: '东苑餐厅',
      point: {
        lng: 118.61284164,
        lat: 25.11585061,
        crs: 'WGS84'
      },
      aliases: [
        '东苑餐厅'
      ]
    },
    {
      id: 'node-029',
      name: '衡山楼',
      point: {
        lng: 118.61296579,
        lat: 25.11661426,
        crs: 'WGS84'
      },
      aliases: [
        '衡山楼'
      ]
    },
    {
      id: 'node-030',
      name: '彩虹桥',
      point: {
        lng: 118.61350067,
        lat: 25.11556156,
        crs: 'WGS84'
      },
      aliases: [
        '彩虹桥'
      ]
    },
    {
      id: 'node-031',
      name: '威海楼',
      point: {
        lng: 118.61450296,
        lat: 25.11391563,
        crs: 'WGS84'
      },
      aliases: [
        '威海楼'
      ]
    },
    {
      id: 'node-032',
      name: '宝洁洗衣店（圆通、顺丰）',
      point: {
        lng: 118.61037014,
        lat: 25.1125618,
        crs: 'WGS84'
      },
      aliases: [
        '宝洁洗衣店（圆通、顺丰）'
      ]
    },
    {
      id: 'node-033',
      name: '快递联盟（中通）',
      point: {
        lng: 118.61046241,
        lat: 25.11283301,
        crs: 'WGS84'
      },
      aliases: [
        '快递联盟（中通）'
      ]
    },
    {
      id: 'node-034',
      name: '陕西楼',
      point: {
        lng: 118.59470465,
        lat: 25.1073124,
        crs: 'WGS84'
      },
      aliases: [
        '陕西楼'
      ]
    },
    {
      id: 'node-035',
      name: '吉林楼',
      point: {
        lng: 118.59631004,
        lat: 25.10637465,
        crs: 'WGS84'
      },
      aliases: [
        '吉林楼'
      ]
    },
    {
      id: 'node-036',
      name: '湖南楼',
      point: {
        lng: 118.59680408,
        lat: 25.10690262,
        crs: 'WGS84'
      },
      aliases: [
        '湖南楼'
      ]
    },
    {
      id: 'node-037',
      name: '黑龙江楼',
      point: {
        lng: 118.59734417,
        lat: 25.10645468,
        crs: 'WGS84'
      },
      aliases: [
        '黑龙江楼'
      ]
    },
    {
      id: 'node-038',
      name: '海南楼',
      point: {
        lng: 118.59927832,
        lat: 25.10619566,
        crs: 'WGS84'
      },
      aliases: [
        '海南楼'
      ]
    },
    {
      id: 'node-039',
      name: '重庆楼',
      point: {
        lng: 118.59886005,
        lat: 25.10536048,
        crs: 'WGS84'
      },
      aliases: [
        '重庆楼'
      ]
    },
    {
      id: 'node-040',
      name: '四川楼',
      point: {
        lng: 118.59938041,
        lat: 25.10485079,
        crs: 'WGS84'
      },
      aliases: [
        '四川楼'
      ]
    },
    {
      id: 'node-041',
      name: '贵州楼',
      point: {
        lng: 118.59995144,
        lat: 25.10446478,
        crs: 'WGS84'
      },
      aliases: [
        '贵州楼'
      ]
    },
    {
      id: 'node-042',
      name: '渤海楼',
      point: {
        lng: 118.61462715,
        lat: 25.11844147,
        crs: 'WGS84'
      },
      aliases: [
        '渤海楼'
      ]
    },
    {
      id: 'node-043',
      name: '南海楼',
      point: {
        lng: 118.61501197,
        lat: 25.11720731,
        crs: 'WGS84'
      },
      aliases: [
        '南海楼'
      ]
    },
    {
      id: 'node-044',
      name: '南京楼',
      point: {
        lng: 118.61218667,
        lat: 25.11880246,
        crs: 'WGS84'
      },
      aliases: [
        '南京楼'
      ]
    },
    {
      id: 'node-045',
      name: '天山楼',
      point: {
        lng: 118.61145399,
        lat: 25.11807874,
        crs: 'WGS84'
      },
      aliases: [
        '天山楼'
      ]
    },
    {
      id: 'node-046',
      name: '安徽楼',
      point: {
        lng: 118.60055615,
        lat: 25.10515364,
        crs: 'WGS84'
      },
      aliases: [
        '安徽楼'
      ]
    },
    {
      id: 'node-047',
      name: '云南楼',
      point: {
        lng: 118.59930801,
        lat: 25.10543824,
        crs: 'WGS84'
      },
      aliases: [
        '云南楼'
      ]
    },
    {
      id: 'node-048',
      name: '宁夏楼',
      point: {
        lng: 118.59925617,
        lat: 25.10673542,
        crs: 'WGS84'
      },
      aliases: [
        '宁夏楼'
      ]
    },
    {
      id: 'node-049',
      name: '辽宁楼',
      point: {
        lng: 118.59973890906161,
        lat: 25.103396572681646,
        crs: 'WGS84'
      },
      aliases: [
        '辽宁楼'
      ]
    },
    {
      id: 'node-050',
      name: '甘肃楼',
      point: {
        lng: 118.59782803,
        lat: 25.10699429,
        crs: 'WGS84'
      },
      aliases: [
        '甘肃楼'
      ]
    },
    {
      id: 'node-051',
      name: '湖北楼',
      point: {
        lng: 118.59577918,
        lat: 25.1068545,
        crs: 'WGS84'
      },
      aliases: [
        '湖北楼'
      ]
    },
    {
      id: 'node-052',
      name: '仰恩基金会体育场',
      point: {
        lng: 118.60957851,
        lat: 25.11406255,
        crs: 'WGS84'
      },
      aliases: [
        '仰恩基金会体育场'
      ]
    },
    {
      id: 'node-053',
      name: '永康球场',
      point: {
        lng: 118.61153768,
        lat: 25.11371469,
        crs: 'WGS84'
      },
      aliases: [
        '永康球场'
      ]
    },
    {
      id: 'node-054',
      name: '泰山楼',
      point: {
        lng: 118.61315444,
        lat: 25.11831816,
        crs: 'WGS84'
      },
      aliases: [
        '泰山楼'
      ]
    },
    {
      id: 'node-055',
      name: '嵩山楼',
      point: {
        lng: 118.61277267,
        lat: 25.11776705,
        crs: 'WGS84'
      },
      aliases: [
        '嵩山楼'
      ]
    },
    {
      id: 'node-056',
      name: '黄山楼',
      point: {
        lng: 118.61079825,
        lat: 25.11714945,
        crs: 'WGS84'
      },
      aliases: [
        '黄山楼'
      ]
    },
    {
      id: 'node-057',
      name: '华山楼',
      point: {
        lng: 118.61094188,
        lat: 25.11765401,
        crs: 'WGS84'
      },
      aliases: [
        '华山楼'
      ]
    },
    {
      id: 'node-058',
      name: '湖边舞池',
      point: {
        lng: 118.60742086,
        lat: 25.11156212,
        crs: 'WGS84'
      },
      aliases: [
        '湖边舞池'
      ]
    },
    {
      id: 'node-059',
      name: '湖边操场',
      point: {
        lng: 118.61484318,
        lat: 25.11501609,
        crs: 'WGS84'
      },
      aliases: [
        '湖边操场'
      ]
    },
    {
      id: 'node-060',
      name: '珠海楼',
      point: {
        lng: 118.61422158,
        lat: 25.11317008,
        crs: 'WGS84'
      },
      aliases: [
        '珠海楼'
      ]
    },
    {
      id: 'node-061',
      name: '北海楼',
      point: {
        lng: 118.6150965,
        lat: 25.11818793,
        crs: 'WGS84'
      },
      aliases: [
        '北海楼'
      ]
    },
    {
      id: 'node-062',
      name: '校主陵园',
      point: {
        lng: 118.6066808,
        lat: 25.11338477,
        crs: 'WGS84'
      },
      aliases: [
        '校主陵园'
      ]
    },
    {
      id: 'node-063',
      name: '新区操场',
      point: {
        lng: 118.60138807,
        lat: 25.10858225,
        crs: 'WGS84'
      },
      aliases: [
        '新区操场'
      ]
    },
    {
      id: 'node-064',
      name: '新区学生街',
      point: {
        lng: 118.59678129,
        lat: 25.10908803,
        crs: 'WGS84'
      },
      aliases: [
        '新区学生街'
      ]
    },
    {
      id: 'node-065',
      name: '新区和昌教学楼',
      point: {
        lng: 118.59899673,
        lat: 25.10902611,
        crs: 'WGS84'
      },
      aliases: [
        '新区和昌教学楼'
      ]
    },
    {
      id: 'node-066',
      name: '仰恩教学楼',
      point: {
        lng: 118.60282477,
        lat: 25.10807885,
        crs: 'WGS84'
      },
      aliases: [
        '仰恩教学楼'
      ]
    },
    {
      id: 'node-067',
      name: '普照教学楼',
      point: {
        lng: 118.60166487,
        lat: 25.10997978,
        crs: 'WGS84'
      },
      aliases: [
        '普照教学楼'
      ]
    },
    {
      id: 'node-068',
      name: '碑林广场',
      point: {
        lng: 118.60289887,
        lat: 25.11136317,
        crs: 'WGS84'
      },
      aliases: [
        '碑林广场'
      ]
    },
    {
      id: 'node-069',
      name: '文体中心',
      point: {
        lng: 118.60207706,
        lat: 25.11237186,
        crs: 'WGS84'
      },
      aliases: [
        '文体中心'
      ]
    },
    {
      id: 'node-070',
      name: '校史馆',
      point: {
        lng: 118.60468235,
        lat: 25.11242101,
        crs: 'WGS84'
      },
      aliases: [
        '校史馆'
      ]
    },
    {
      id: 'node-071',
      name: '图书馆',
      point: {
        lng: 118.60385795,
        lat: 25.11283209,
        crs: 'WGS84'
      },
      aliases: [
        '图书馆'
      ]
    },
    {
      id: 'node-072',
      name: '仰恩大学第三校区(公交站)',
      point: {
        lng: 118.59778895,
        lat: 25.1103153,
        crs: 'WGS84'
      },
      aliases: [
        '仰恩大学第三校区(公交站)'
      ]
    },
    {
      id: 'node-073',
      name: '北京楼',
      point: {
        lng: 118.61271537,
        lat: 25.11897669,
        crs: 'WGS84'
      },
      aliases: [
        '北京楼'
      ]
    },
    {
      id: 'node-074',
      name: '上海楼',
      point: {
        lng: 118.61193286,
        lat: 25.11854521,
        crs: 'WGS84'
      },
      aliases: [
        '上海楼'
      ]
    },
    {
      id: 'node-075',
      name: '旧区公交车下车点',
      point: {
        lng: 118.61171436,
        lat: 25.11314685,
        crs: 'WGS84'
      },
      aliases: [
        '旧区公交车下车点'
      ]
    },
    {
      id: 'node-076',
      name: '旧区公交车上车点',
      point: {
        lng: 118.61218112,
        lat: 25.11272361,
        crs: 'WGS84'
      },
      aliases: [
        '旧区公交车上车点'
      ]
    },
    {
      id: 'node-077',
      name: '旧区车来车往（京东）',
      point: {
        lng: 118.61044041,
        lat: 25.11214991,
        crs: 'WGS84'
      },
      aliases: [
        '旧区车来车往（京东）'
      ]
    }
  ],
  edges: [
    {
      from: 'node-002',
      to: 'node-070',
      kind: 'road'
    },
    {
      from: 'node-002',
      to: 'node-003',
      kind: 'road'
    },
    {
      from: 'node-002',
      to: 'node-062',
      kind: 'road'
    },
    {
      from: 'node-003',
      to: 'node-058',
      kind: 'road'
    },
    {
      from: 'node-003',
      to: 'node-062',
      kind: 'road'
    },
    {
      from: 'node-004',
      to: 'node-033',
      kind: 'road'
    },
    {
      from: 'node-004',
      to: 'node-032',
      kind: 'road'
    },
    {
      from: 'node-004',
      to: 'node-005',
      kind: 'road'
    },
    {
      from: 'node-005',
      to: 'node-011',
      kind: 'road'
    },
    {
      from: 'node-005',
      to: 'node-052',
      kind: 'road'
    },
    {
      from: 'node-006',
      to: 'node-007',
      kind: 'road'
    },
    {
      from: 'node-006',
      to: 'node-017',
      kind: 'road'
    },
    {
      from: 'node-006',
      to: 'node-008',
      kind: 'road'
    },
    {
      from: 'node-007',
      to: 'node-008',
      kind: 'road'
    },
    {
      from: 'node-007',
      to: 'node-017',
      kind: 'road'
    },
    {
      from: 'node-008',
      to: 'node-009',
      kind: 'road'
    },
    {
      from: 'node-009',
      to: 'node-052',
      kind: 'road'
    },
    {
      from: 'node-007',
      to: 'node-009',
      kind: 'road'
    },
    {
      from: 'node-010',
      to: 'node-018',
      kind: 'road'
    },
    {
      from: 'node-010',
      to: 'node-011',
      kind: 'road'
    },
    {
      from: 'node-010',
      to: 'node-017',
      kind: 'road'
    },
    {
      from: 'node-011',
      to: 'node-018',
      kind: 'road'
    },
    {
      from: 'node-011',
      to: 'node-053',
      kind: 'road'
    },
    {
      from: 'node-012',
      to: 'node-013',
      kind: 'road'
    },
    {
      from: 'node-012',
      to: 'node-061',
      kind: 'road'
    },
    {
      from: 'node-012',
      to: 'node-042',
      kind: 'road'
    },
    {
      from: 'node-013',
      to: 'node-043',
      kind: 'road'
    },
    {
      from: 'node-013',
      to: 'node-061',
      kind: 'road'
    },
    {
      from: 'node-014',
      to: 'node-067',
      kind: 'road'
    },
    {
      from: 'node-014',
      to: 'node-068',
      kind: 'road'
    },
    {
      from: 'node-014',
      to: 'node-069',
      kind: 'road'
    },
    {
      from: 'node-015',
      to: 'node-026',
      kind: 'road'
    },
    {
      from: 'node-015',
      to: 'node-025',
      kind: 'road'
    },
    {
      from: 'node-015',
      to: 'node-055',
      kind: 'road'
    },
    {
      from: 'node-016',
      to: 'node-066',
      kind: 'road'
    },
    {
      from: 'node-016',
      to: 'node-067',
      kind: 'road'
    },
    {
      from: 'node-016',
      to: 'node-063',
      kind: 'road'
    },
    {
      from: 'node-017',
      to: 'node-022',
      kind: 'road'
    },
    {
      from: 'node-018',
      to: 'node-053',
      kind: 'road'
    },
    {
      from: 'node-019',
      to: 'node-020',
      kind: 'road'
    },
    {
      from: 'node-019',
      to: 'node-065',
      kind: 'road'
    },
    {
      from: 'node-019',
      to: 'node-050',
      kind: 'road'
    },
    {
      from: 'node-020',
      to: 'node-050',
      kind: 'road'
    },
    {
      from: 'node-020',
      to: 'node-048',
      kind: 'road'
    },
    {
      from: 'node-021',
      to: 'node-077',
      kind: 'road'
    },
    {
      from: 'node-021',
      to: 'node-032',
      kind: 'road'
    },
    {
      from: 'node-021',
      to: 'node-033',
      kind: 'road'
    },
    {
      from: 'node-010',
      to: 'node-022',
      kind: 'road'
    },
    {
      from: 'node-018',
      to: 'node-022',
      kind: 'road'
    },
    {
      from: 'node-023',
      to: 'node-024',
      kind: 'road'
    },
    {
      from: 'node-023',
      to: 'node-027',
      kind: 'road'
    },
    {
      from: 'node-023',
      to: 'node-025',
      kind: 'road'
    },
    {
      from: 'node-024',
      to: 'node-025',
      kind: 'road'
    },
    {
      from: 'node-024',
      to: 'node-027',
      kind: 'road'
    },
    {
      from: 'node-025',
      to: 'node-056',
      kind: 'road'
    },
    {
      from: 'node-026',
      to: 'node-045',
      kind: 'road'
    },
    {
      from: 'node-026',
      to: 'node-055',
      kind: 'road'
    },
    {
      from: 'node-027',
      to: 'node-028',
      kind: 'road'
    },
    {
      from: 'node-028',
      to: 'node-030',
      kind: 'road'
    },
    {
      from: 'node-028',
      to: 'node-029',
      kind: 'road'
    },
    {
      from: 'node-027',
      to: 'node-029',
      kind: 'road'
    },
    {
      from: 'node-015',
      to: 'node-029',
      kind: 'road'
    },
    {
      from: 'node-029',
      to: 'node-030',
      kind: 'road'
    },
    {
      from: 'node-030',
      to: 'node-059',
      kind: 'road'
    },
    {
      from: 'node-031',
      to: 'node-060',
      kind: 'road'
    },
    {
      from: 'node-031',
      to: 'node-059',
      kind: 'road'
    },
    {
      from: 'node-030',
      to: 'node-031',
      kind: 'road'
    },
    {
      from: 'node-032',
      to: 'node-033',
      kind: 'road'
    },
    {
      from: 'node-032',
      to: 'node-077',
      kind: 'road'
    },
    {
      from: 'node-033',
      to: 'node-077',
      kind: 'road'
    },
    {
      from: 'node-034',
      to: 'node-051',
      kind: 'road'
    },
    {
      from: 'node-034',
      to: 'node-035',
      kind: 'road'
    },
    {
      from: 'node-034',
      to: 'node-036',
      kind: 'road'
    },
    {
      from: 'node-035',
      to: 'node-051',
      kind: 'road'
    },
    {
      from: 'node-035',
      to: 'node-036',
      kind: 'road'
    },
    {
      from: 'node-035',
      to: 'node-037',
      kind: 'road'
    },
    {
      from: 'node-036',
      to: 'node-037',
      kind: 'road'
    },
    {
      from: 'node-036',
      to: 'node-051',
      kind: 'road'
    },
    {
      from: 'node-037',
      to: 'node-050',
      kind: 'road'
    },
    {
      from: 'node-038',
      to: 'node-048',
      kind: 'road'
    },
    {
      from: 'node-038',
      to: 'node-047',
      kind: 'road'
    },
    {
      from: 'node-038',
      to: 'node-039',
      kind: 'road'
    },
    {
      from: 'node-039',
      to: 'node-047',
      kind: 'road'
    },
    {
      from: 'node-039',
      to: 'node-040',
      kind: 'road'
    },
    {
      from: 'node-040',
      to: 'node-047',
      kind: 'road'
    },
    {
      from: 'node-040',
      to: 'node-041',
      kind: 'road'
    },
    {
      from: 'node-041',
      to: 'node-046',
      kind: 'road'
    },
    {
      from: 'node-041',
      to: 'node-049',
      kind: 'road'
    },
    {
      from: 'node-042',
      to: 'node-061',
      kind: 'road'
    },
    {
      from: 'node-013',
      to: 'node-042',
      kind: 'road'
    },
    {
      from: 'node-012',
      to: 'node-043',
      kind: 'road'
    },
    {
      from: 'node-043',
      to: 'node-061',
      kind: 'road'
    },
    {
      from: 'node-044',
      to: 'node-074',
      kind: 'road'
    },
    {
      from: 'node-044',
      to: 'node-073',
      kind: 'road'
    },
    {
      from: 'node-044',
      to: 'node-045',
      kind: 'road'
    },
    {
      from: 'node-045',
      to: 'node-057',
      kind: 'road'
    },
    {
      from: 'node-045',
      to: 'node-074',
      kind: 'road'
    },
    {
      from: 'node-040',
      to: 'node-046',
      kind: 'road'
    },
    {
      from: 'node-046',
      to: 'node-047',
      kind: 'road'
    },
    {
      from: 'node-047',
      to: 'node-048',
      kind: 'road'
    },
    {
      from: 'node-040',
      to: 'node-049',
      kind: 'road'
    },
    {
      from: 'node-046',
      to: 'node-049',
      kind: 'road'
    },
    {
      from: 'node-036',
      to: 'node-050',
      kind: 'road'
    },
    {
      from: 'node-007',
      to: 'node-052',
      kind: 'road'
    },
    {
      from: 'node-053',
      to: 'node-075',
      kind: 'road'
    },
    {
      from: 'node-054',
      to: 'node-055',
      kind: 'road'
    },
    {
      from: 'node-054',
      to: 'node-073',
      kind: 'road'
    },
    {
      from: 'node-044',
      to: 'node-054',
      kind: 'road'
    },
    {
      from: 'node-056',
      to: 'node-057',
      kind: 'road'
    },
    {
      from: 'node-024',
      to: 'node-056',
      kind: 'road'
    },
    {
      from: 'node-026',
      to: 'node-057',
      kind: 'road'
    },
    {
      from: 'node-002',
      to: 'node-058',
      kind: 'road'
    },
    {
      from: 'node-058',
      to: 'node-062',
      kind: 'road'
    },
    {
      from: 'node-059',
      to: 'node-060',
      kind: 'road'
    },
    {
      from: 'node-060',
      to: 'node-076',
      kind: 'road'
    },
    {
      from: 'node-063',
      to: 'node-066',
      kind: 'road'
    },
    {
      from: 'node-063',
      to: 'node-067',
      kind: 'road'
    },
    {
      from: 'node-064',
      to: 'node-072',
      kind: 'road'
    },
    {
      from: 'node-019',
      to: 'node-064',
      kind: 'road'
    },
    {
      from: 'node-020',
      to: 'node-065',
      kind: 'road'
    },
    {
      from: 'node-065',
      to: 'node-072',
      kind: 'road'
    },
    {
      from: 'node-068',
      to: 'node-069',
      kind: 'road'
    },
    {
      from: 'node-068',
      to: 'node-071',
      kind: 'road'
    },
    {
      from: 'node-069',
      to: 'node-071',
      kind: 'road'
    },
    {
      from: 'node-070',
      to: 'node-071',
      kind: 'road'
    },
    {
      from: 'node-068',
      to: 'node-070',
      kind: 'road'
    },
    {
      from: 'node-073',
      to: 'node-074',
      kind: 'road'
    },
    {
      from: 'node-026',
      to: 'node-074',
      kind: 'road'
    },
    {
      from: 'node-075',
      to: 'node-076',
      kind: 'road'
    },
    {
      from: 'node-011',
      to: 'node-075',
      kind: 'road'
    },
    {
      from: 'node-053',
      to: 'node-076',
      kind: 'road'
    },
    {
      from: 'node-021',
      to: 'node-076',
      kind: 'road'
    },
    {
      from: 'node-042',
      to: 'node-054',
      kind: 'road'
    },
    {
      from: 'node-009',
      to: 'node-062',
      kind: 'road'
    },
    {
      from: 'node-063',
      to: 'node-065',
      kind: 'road'
    }
  ]
}
