import type { CampusWalkGraph } from '../../map/core/walk-graph'
import { decodePlacePoint } from '../../shared/utils/geo-obfuscation'

/** 步行图节点坐标以混淆串存储，防止 bundle 明文经纬度（同 amap-imported-places）。 */
const WALK_GEO_KEY = 'c137257a75409e2d5ec2c16efc59d4a80b880ce22b719100'

function walkPoint(encoded: string): CampusWalkGraph['nodes'][number]['point'] {
  const decoded = decodePlacePoint(encoded, WALK_GEO_KEY)
  if (!decoded) throw new Error('walk graph geo payload failed to decode')
  return { lng: decoded.longitude, lat: decoded.latitude, crs: decoded.coordinateSystem }
}

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
      point: walkPoint('v1:816a83bf109a65141efbdddba4e50e390b'),
      aliases: [
        '泽钏教学楼'
      ]
    },
    {
      id: 'node-003',
      name: '网络信息中心',
      point: walkPoint('v1:816a83a54b29ec191efbddae46c312bc0b'),
      aliases: [
        '网络信息中心'
      ]
    },
    {
      id: 'node-004',
      name: '南门',
      point: walkPoint('v1:816a826b8fc9838d1efbdd9ed3a79edb0b'),
      aliases: [
        '南门'
      ]
    },
    {
      id: 'node-005',
      name: '南洋楼',
      point: walkPoint('v1:816a827575ceee6b1efbdc735c7a23fe0b'),
      aliases: [
        '南洋楼'
      ]
    },
    {
      id: 'node-006',
      name: '长春楼',
      point: walkPoint('v1:816a827601ad768b1efbdc05f133f4730b'),
      aliases: [
        '长春楼'
      ]
    },
    {
      id: 'node-007',
      name: '长安楼',
      point: walkPoint('v1:816a827c998eeac31efbdc0305f47fdc0b'),
      aliases: [
        '长安楼'
      ]
    },
    {
      id: 'node-008',
      name: '宏船楼',
      point: walkPoint('v1:816a8384010fac6f1efbdcee3b561ddf0b'),
      aliases: [
        '宏船楼'
      ]
    },
    {
      id: 'node-009',
      name: '共和教学楼',
      point: walkPoint('v1:816a838dec9f24bd1efbdc57db4ac0f20b'),
      aliases: [
        '共和教学楼'
      ]
    },
    {
      id: 'node-010',
      name: '吉龙教学楼',
      point: walkPoint('v1:816a8260de510f0f1efbdc2a7dbcc8530b'),
      aliases: [
        '吉龙教学楼'
      ]
    },
    {
      id: 'node-011',
      name: '仰光楼',
      point: walkPoint('v1:816a8260a7c9e4101efbdc46243f8aab0b'),
      aliases: [
        '仰光楼'
      ]
    },
    {
      id: 'node-012',
      name: '黄海楼',
      point: walkPoint('v1:816a8223f21a4c991efbdf4400f432aa0b'),
      aliases: [
        '黄海楼'
      ]
    },
    {
      id: 'node-013',
      name: '东海楼',
      point: walkPoint('v1:816a82272951bcc51efbdf79c253f2620b'),
      aliases: [
        '东海楼'
      ]
    },
    {
      id: 'node-014',
      name: '新区医务所',
      point: walkPoint('v1:816a8301b437b0181efbdd20c0a00fd10b'),
      aliases: [
        '新区医务所'
      ]
    },
    {
      id: 'node-015',
      name: '旧区医务所',
      point: walkPoint('v1:816a8254888fbd131efbdf6f46339d080b'),
      aliases: [
        '旧区医务所'
      ]
    },
    {
      id: 'node-016',
      name: '新区行政楼',
      point: walkPoint('v1:816a83ee23f93e321efbda83bb985e0c0b'),
      aliases: [
        '新区行政楼'
      ]
    },
    {
      id: 'node-017',
      name: '旧区行政楼',
      point: walkPoint('v1:816a826ed05381401efbdc32ddb00b050b'),
      aliases: [
        '旧区行政楼'
      ]
    },
    {
      id: 'node-018',
      name: '曼谷楼',
      point: walkPoint('v1:816a825acd5b7b971efbdc5326f5dc2f0b'),
      aliases: [
        '曼谷楼'
      ]
    },
    {
      id: 'node-019',
      name: '西苑餐厅',
      point: walkPoint('v1:816a8335031585cb1efbdac3d3a0b8410b'),
      aliases: [
        '西苑餐厅'
      ]
    },
    {
      id: 'node-020',
      name: '校保卫处',
      point: walkPoint('v1:816a8334456e6ff61efbdaf9195759a40b'),
      aliases: [
        '校保卫处'
      ]
    },
    {
      id: 'node-021',
      name: '韵达快递',
      point: walkPoint('v1:816a8262f5ff46de1efbddf3a637b42e0b'),
      aliases: [
        '韵达快递'
      ]
    },
    {
      id: 'node-022',
      name: '普照大礼堂',
      point: walkPoint('v1:816a8265c89527281efbdc02d2a497250b'),
      aliases: [
        '普照大礼堂'
      ]
    },
    {
      id: 'node-023',
      name: '创业园',
      point: walkPoint('v1:816a825bce7b34fc1efbdcd5dd8d45b90b'),
      aliases: [
        '创业园'
      ]
    },
    {
      id: 'node-024',
      name: '多功能报告厅',
      point: walkPoint('v1:816a825f0cac482f1efbdcbe323df2330b'),
      aliases: [
        '多功能报告厅'
      ]
    },
    {
      id: 'node-025',
      name: '祥贤楼',
      point: walkPoint('v1:816a825ea27afdd21efbdc9e2ec952880b'),
      aliases: [
        '祥贤楼'
      ]
    },
    {
      id: 'node-026',
      name: '和昌教学楼',
      point: walkPoint('v1:816a825022ec7b0b1efbdf4ab34d6f8b0b'),
      aliases: [
        '和昌教学楼'
      ]
    },
    {
      id: 'node-027',
      name: '北苑餐厅',
      point: walkPoint('v1:816a8254448ccbf41efbdca87953c12b0b'),
      aliases: [
        '北苑餐厅'
      ]
    },
    {
      id: 'node-028',
      name: '东苑餐厅',
      point: walkPoint('v1:816a8242b964c5791efbdcc69eecff590b'),
      aliases: [
        '东苑餐厅'
      ]
    },
    {
      id: 'node-029',
      name: '衡山楼',
      point: walkPoint('v1:816a8240a19df9571efbdcb492f926d60b'),
      aliases: [
        '衡山楼'
      ]
    },
    {
      id: 'node-030',
      name: '彩虹桥',
      point: walkPoint('v1:816a8239ed10f07a1efbdcfb8d190b470b'),
      aliases: [
        '彩虹桥'
      ]
    },
    {
      id: 'node-031',
      name: '威海楼',
      point: walkPoint('v1:816a822e7179819c1efbdc476f788ec60b'),
      aliases: [
        '威海楼'
      ]
    },
    {
      id: 'node-032',
      name: '宝洁洗衣店（圆通、顺丰）',
      point: walkPoint('v1:816a826a38abee7c1efbddbe25f813ce0b'),
      aliases: [
        '宝洁洗衣店（圆通、顺丰）'
      ]
    },
    {
      id: 'node-033',
      name: '快递联盟（中通）',
      point: walkPoint('v1:816a826ba5ad06e71efbdd8c639e0f5f0b'),
      aliases: [
        '快递联盟（中通）'
      ]
    },
    {
      id: 'node-034',
      name: '陕西楼',
      point: walkPoint('v1:816a8375d1573ff01efbda162f09a0250b'),
      aliases: [
        '陕西楼'
      ]
    },
    {
      id: 'node-035',
      name: '吉林楼',
      point: walkPoint('v1:816a835384d69ac81efbda55a2230b320b'),
      aliases: [
        '吉林楼'
      ]
    },
    {
      id: 'node-036',
      name: '湖南楼',
      point: walkPoint('v1:816a83487cfdf0271efbda33040115100b'),
      aliases: [
        '湖南楼'
      ]
    },
    {
      id: 'node-037',
      name: '黑龙江楼',
      point: walkPoint('v1:816a8340964a38e01efbda2e6170cf840b'),
      aliases: [
        '黑龙江楼'
      ]
    },
    {
      id: 'node-038',
      name: '海南楼',
      point: walkPoint('v1:816a8320e634f8a91efbda415fdf79f10b'),
      aliases: [
        '海南楼'
      ]
    },
    {
      id: 'node-039',
      name: '重庆楼',
      point: walkPoint('v1:816a8329cc5af64c1efbdb961bde30b80b'),
      aliases: [
        '重庆楼'
      ]
    },
    {
      id: 'node-040',
      name: '四川楼',
      point: walkPoint('v1:816a83264ae62a241efbdbb97c03d6280b'),
      aliases: [
        '四川楼'
      ]
    },
    {
      id: 'node-041',
      name: '贵州楼',
      point: walkPoint('v1:816a831feff9e1101efbdbd0c8747bb80b'),
      aliases: [
        '贵州楼'
      ]
    },
    {
      id: 'node-042',
      name: '渤海楼',
      point: walkPoint('v1:816a822c785d80d81efbdf3cd279f74a0b'),
      aliases: [
        '渤海楼'
      ]
    },
    {
      id: 'node-043',
      name: '南海楼',
      point: walkPoint('v1:816a82262e6aed361efbdf6fb00299f10b'),
      aliases: [
        '南海楼'
      ]
    },
    {
      id: 'node-044',
      name: '南京楼',
      point: walkPoint('v1:816a825465bf32b31efbdf072ad1b6cd0b'),
      aliases: [
        '南京楼'
      ]
    },
    {
      id: 'node-045',
      name: '天山楼',
      point: walkPoint('v1:816a82587aaa1def1efbdf5494df738c0b'),
      aliases: [
        '天山楼'
      ]
    },
    {
      id: 'node-046',
      name: '安徽楼',
      point: walkPoint('v1:816a8315f64f74741efbdb85a50d0e510b'),
      aliases: [
        '安徽楼'
      ]
    },
    {
      id: 'node-047',
      name: '云南楼',
      point: walkPoint('v1:816a83217abb55be1efbdb90fc7958950b'),
      aliases: [
        '云南楼'
      ]
    },
    {
      id: 'node-048',
      name: '宁夏楼',
      point: walkPoint('v1:816a832043cd9acc1efbda3dff6bed260b'),
      aliases: [
        '宁夏楼'
      ]
    },
    {
      id: 'node-049',
      name: '辽宁楼',
      point: walkPoint('v1:816a83186a0ebd911efbdb16cefbfb000b'),
      aliases: [
        '辽宁楼'
      ]
    },
    {
      id: 'node-050',
      name: '甘肃楼',
      point: walkPoint('v1:816a8338a53fc0f61efbda0d0609bc0b0b'),
      aliases: [
        '甘肃楼'
      ]
    },
    {
      id: 'node-051',
      name: '湖北楼',
      point: walkPoint('v1:816a835b4bbff11b1efbda342d5f3a990b'),
      aliases: [
        '湖北楼'
      ]
    },
    {
      id: 'node-052',
      name: '仰恩基金会体育场',
      point: walkPoint('v1:816a827920d5acf51efbdc5dc85026600b'),
      aliases: [
        '仰恩基金会体育场'
      ]
    },
    {
      id: 'node-053',
      name: '永康球场',
      point: walkPoint('v1:816a82591baf69e71efbdc729bb34b590b'),
      aliases: [
        '永康球场'
      ]
    },
    {
      id: 'node-054',
      name: '泰山楼',
      point: walkPoint('v1:816a8247995e52b21efbdf24e50a6db80b'),
      aliases: [
        '泰山楼'
      ]
    },
    {
      id: 'node-055',
      name: '嵩山楼',
      point: walkPoint('v1:816a824ddf9cfc3b1efbdf4b07659f490b'),
      aliases: [
        '嵩山楼'
      ]
    },
    {
      id: 'node-056',
      name: '黄山楼',
      point: walkPoint('v1:816a826d24cb93221efbdc937df9aa380b'),
      aliases: [
        '黄山楼'
      ]
    },
    {
      id: 'node-057',
      name: '华山楼',
      point: walkPoint('v1:816a8263deb808f81efbdf706ee4e5d10b'),
      aliases: [
        '华山楼'
      ]
    },
    {
      id: 'node-058',
      name: '湖边舞池',
      point: walkPoint('v1:816a83a58efeb8c01efbdde1a9910bff0b'),
      aliases: [
        '湖边舞池'
      ]
    },
    {
      id: 'node-059',
      name: '湖边操场',
      point: walkPoint('v1:816a8223e2750f1c1efbdc1f4d90c4fd0b'),
      aliases: [
        '湖边操场'
      ]
    },
    {
      id: 'node-060',
      name: '珠海楼',
      point: walkPoint('v1:816a82351d4738101efbdd964ab9a8ff0b'),
      aliases: [
        '珠海楼'
      ]
    },
    {
      id: 'node-061',
      name: '北海楼',
      point: walkPoint('v1:816a8227c8f546b81efbdf2f6c37f56f0b'),
      aliases: [
        '北海楼'
      ]
    },
    {
      id: 'node-062',
      name: '校主陵园',
      point: walkPoint('v1:816a83a9aef459301efbdc68349ed71d0b'),
      aliases: [
        '校主陵园'
      ]
    },
    {
      id: 'node-063',
      name: '新区操场',
      point: walkPoint('v1:816a83075123a89c1efbdaa2f78579bd0b'),
      aliases: [
        '新区操场'
      ]
    },
    {
      id: 'node-064',
      name: '新区学生街',
      point: walkPoint('v1:816a834bdf6644a71efbda83cd28e8850b'),
      aliases: [
        '新区学生街'
      ]
    },
    {
      id: 'node-065',
      name: '新区和昌教学楼',
      point: walkPoint('v1:816a832f8321ee9e1efbda87dec108870b'),
      aliases: [
        '新区和昌教学楼'
      ]
    },
    {
      id: 'node-066',
      name: '仰恩教学楼',
      point: walkPoint('v1:816a83eedb1889b41efbdac5f26ff7000b'),
      aliases: [
        '仰恩教学楼'
      ]
    },
    {
      id: 'node-067',
      name: '普照教学楼',
      point: walkPoint('v1:816a83fbd81e6d781efbdd495edf86970b'),
      aliases: [
        '普照教学楼'
      ]
    },
    {
      id: 'node-068',
      name: '碑林广场',
      point: walkPoint('v1:816a83ef9064c2ac1efbddecb7acf4570b'),
      aliases: [
        '碑林广场'
      ]
    },
    {
      id: 'node-069',
      name: '文体中心',
      point: walkPoint('v1:816a83f21b7809e11efbddaa9aae64790b'),
      aliases: [
        '文体中心'
      ]
    },
    {
      id: 'node-070',
      name: '校史馆',
      point: walkPoint('v1:816a83c968d9f3d61efbdda963c881fa0b'),
      aliases: [
        '校史馆'
      ]
    },
    {
      id: 'node-071',
      name: '图书馆',
      point: walkPoint('v1:816a83dfee9035521efbdd8c6c01a9ed0b'),
      aliases: [
        '图书馆'
      ]
    },
    {
      id: 'node-072',
      name: '仰恩大学第三校区(公交站)',
      point: walkPoint('v1:816a833859d5146d1efbdd5363c46b310b'),
      aliases: [
        '仰恩大学第三校区(公交站)'
      ]
    },
    {
      id: 'node-073',
      name: '北京楼',
      point: walkPoint('v1:816a824ccfc664281efbdf1bbdf95de50b'),
      aliases: [
        '北京楼'
      ]
    },
    {
      id: 'node-074',
      name: '上海楼',
      point: walkPoint('v1:816a82539d31dd231efbdf3606c1d88e0b'),
      aliases: [
        '上海楼'
      ]
    },
    {
      id: 'node-075',
      name: '旧区公交车下车点',
      point: walkPoint('v1:816a825c26bc324e1efbdd99cd7db1920b'),
      aliases: [
        '旧区公交车下车点'
      ]
    },
    {
      id: 'node-076',
      name: '旧区公交车上车点',
      point: walkPoint('v1:816a82578cf8f6111efbddb58803bb4b0b'),
      aliases: [
        '旧区公交车上车点'
      ]
    },
    {
      id: 'node-077',
      name: '旧区车来车往（京东）',
      point: walkPoint('v1:816a826b01e7d8fb1efbdddb271a67a00b'),
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
