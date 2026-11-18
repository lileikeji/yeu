export interface CampusMapReferencePlace {
  id: string
  mapNumber: string
  name: string
  category: 'campus-building' | 'dorm' | 'food' | 'service' | 'gate'
  aliases?: string[]
}

/**
 * Text-only index transcribed from the university's public campus diagram.
 * Source: https://www.yeu.edu.cn/xydt/list.htm (accessed 2026-07-13).
 *
 * The diagram has no verifiable publication date, scale, or geographic control
 * points. These entries intentionally contain no coordinates and are never sent
 * to the map provider as POIs.
 */
export const campusMapReferencePlaces: CampusMapReferencePlace[] = [
  { id: 'campus-map-01', mapNumber: '01', name: '新区男生宿舍区', category: 'dorm' },
  { id: 'campus-map-02', mapNumber: '02', name: '篮球场', category: 'service' },
  { id: 'campus-map-03', mapNumber: '03', name: '新区女生宿舍区', category: 'dorm' },
  { id: 'campus-map-04', mapNumber: '04', name: '治安保卫处', category: 'service', aliases: ['校保卫处', '保卫处'] },
  { id: 'campus-map-05', mapNumber: '05', name: '西苑餐厅', category: 'food' },
  { id: 'campus-map-06', mapNumber: '06', name: '新区和昌教学楼', category: 'campus-building', aliases: ['和昌教学楼'] },
  { id: 'campus-map-07', mapNumber: '07', name: '塑胶体育场', category: 'service' },
  { id: 'campus-map-08', mapNumber: '08', name: '仰恩楼', category: 'campus-building', aliases: ['仰恩教学楼'] },
  { id: 'campus-map-09', mapNumber: '09', name: '新区行政楼', category: 'service' },
  { id: 'campus-map-10', mapNumber: '10', name: '普照教学楼', category: 'campus-building' },
  { id: 'campus-map-11', mapNumber: '11', name: '教工宿舍', category: 'dorm' },
  { id: 'campus-map-12', mapNumber: '12', name: '仰恩文体中心', category: 'service' },
  { id: 'campus-map-13', mapNumber: '13', name: '广场', category: 'service' },
  { id: 'campus-map-14', mapNumber: '14', name: '图书馆', category: 'campus-building' },
  { id: 'campus-map-15', mapNumber: '15', name: '泽钏教学楼', category: 'campus-building' },
  { id: 'campus-map-16', mapNumber: '16', name: '网络中心', category: 'service', aliases: ['网络信息中心'] },
  { id: 'campus-map-17', mapNumber: '17', name: '湖边舞池', category: 'service' },
  { id: 'campus-map-18', mapNumber: '18', name: '共和教学楼', category: 'campus-building' },
  { id: 'campus-map-19', mapNumber: '19', name: '南洋楼', category: 'campus-building' },
  { id: 'campus-map-20', mapNumber: '20', name: '宏船楼', category: 'campus-building' },
  { id: 'campus-map-21', mapNumber: '21', name: '长安楼', category: 'campus-building' },
  { id: 'campus-map-22', mapNumber: '22', name: '长春楼', category: 'campus-building' },
  { id: 'campus-map-23', mapNumber: '23', name: '旧区行政楼', category: 'service' },
  { id: 'campus-map-24', mapNumber: '24', name: '吉龙教学楼', category: 'campus-building' },
  { id: 'campus-map-25', mapNumber: '25', name: '仰光楼', category: 'campus-building' },
  { id: 'campus-map-26', mapNumber: '26', name: '曼谷楼', category: 'campus-building' },
  { id: 'campus-map-27', mapNumber: '27', name: '永康球场', category: 'service' },
  { id: 'campus-map-28', mapNumber: '28', name: '普照大礼堂', category: 'campus-building' },
  { id: 'campus-map-29', mapNumber: '29', name: '永福楼', category: 'campus-building' },
  { id: 'campus-map-30', mapNumber: '30', name: '永安楼', category: 'campus-building' },
  { id: 'campus-map-31', mapNumber: '31', name: '顺安楼', category: 'campus-building' },
  { id: 'campus-map-32', mapNumber: '32', name: '共和楼', category: 'campus-building' },
  { id: 'campus-map-33', mapNumber: '33', name: '7人制足球场', category: 'service' },
  { id: 'campus-map-34', mapNumber: '34', name: '旧区女生宿舍区', category: 'dorm' },
  { id: 'campus-map-35', mapNumber: '35', name: '旧区图书馆', category: 'campus-building' },
  { id: 'campus-map-36', mapNumber: '36', name: '祥贤教学楼', category: 'campus-building', aliases: ['祥贤楼'] },
  { id: 'campus-map-37', mapNumber: '37', name: '旧区和昌教学楼', category: 'campus-building' },
  { id: 'campus-map-38', mapNumber: '38', name: '北苑餐厅', category: 'food' },
  { id: 'campus-map-39', mapNumber: '39', name: '东苑餐厅', category: 'food' },
  { id: 'campus-map-40', mapNumber: '40', name: '旧区男生宿舍区', category: 'dorm' },
  { id: 'campus-map-41', mapNumber: '41', name: '10号门', category: 'gate' },
  { id: 'campus-map-42', mapNumber: '42', name: '1号门', category: 'gate' },
  { id: 'campus-map-43', mapNumber: '43', name: '8号门', category: 'gate' },
  { id: 'campus-map-44', mapNumber: '44', name: '16号门', category: 'gate' },
  { id: 'campus-map-45', mapNumber: '45', name: '15号门', category: 'gate' },
  { id: 'campus-map-46', mapNumber: '46', name: '13号门', category: 'gate' },
  { id: 'campus-map-47', mapNumber: '47', name: '11号门', category: 'gate' }
]
