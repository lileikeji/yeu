/**
 * 校内核定的宿舍楼名单。
 *
 * 数据来源：`data/seeds/amap-imported-places.ts` 里 `category: 'dorm'` 的 29 条
 * 高德工作地图标点（省份/城市命名的那批楼）。线上 places 表里这批楼被录成了
 * `teaching-building`，所以地图上一直显示成「教」字胶囊、宿舍筛选也筛不到。
 * 这里只做展示层的分类归一化，不改数据库。
 */
export const CAMPUS_DORM_BUILDINGS: ReadonlySet<string> = new Set([
  '长春楼',
  '长安楼',
  '宏船楼',
  '仰光楼',
  '黄海楼',
  '东海楼',
  '曼谷楼',
  '衡山楼',
  '威海楼',
  '陕西楼',
  '吉林楼',
  '湖南楼',
  '黑龙江楼',
  '海南楼',
  '重庆楼',
  '四川楼',
  '贵州楼',
  '渤海楼',
  '南海楼',
  '南京楼',
  '天山楼',
  '安徽楼',
  '云南楼',
  '宁夏楼',
  '辽宁楼',
  '甘肃楼',
  '湖北楼',
  '北京楼',
  '上海楼'
])

/** 楼名是否属于宿舍楼（去掉首尾空白后精确匹配）。 */
export function isCampusDormBuilding(name: string | null | undefined): boolean {
  return typeof name === 'string' && CAMPUS_DORM_BUILDINGS.has(name.trim())
}

/**
 * 把「楼」类条目的分类归一化：核定宿舍楼一律算 dorm。
 *
 * 只影响展示层分类，不动 places 表里的 type；非楼类条目原样返回。
 */
export function normalizeCampusCategory(name: string | null | undefined, category: string): string {
  if (!isCampusDormBuilding(name)) return category
  return 'dorm'
}
