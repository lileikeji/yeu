/**
 * 地点展示层：Web 与小程序共用。
 * 只做「把后端字段翻成学生能读的中文」这一件事，不依赖 Nuxt / DOM。
 */

export const PLACE_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  'campus-building': '教学 / 学习',
  'building': '校园建筑',
  'teaching-building': '教学楼',
  'dorm': '宿舍',
  'dormitory': '宿舍',
  'food': '餐饮',
  'dining': '餐饮',
  'service': '校园服务',
  'health-service': '医务服务',
  'express-service': '快递服务',
  'express': '快递',
  'gate': '校门',
  'transit-stop': '公交 / 交通',
  'library': '图书馆',
  'sports-ground': '体育设施',
  'event-venue': '礼堂 / 报告厅',
  'shop': '周边商铺',
  'nearby': '周边服务',
  'place': '其他地点'
}

/** 地图筛选使用的 7 个规范分类，顺序即展示顺序。 */
export const MAP_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  'campus-building': '教学 / 学习',
  'dorm': '宿舍',
  'food': '餐饮',
  'service': '校园服务',
  'express': '快递',
  'gate': '校门',
  'nearby': '周边'
}

/** 与 miniapp/static/marker/pin-*.png 一致的分类配色。 */
export const MAP_CATEGORY_COLORS: Readonly<Record<string, string>> = {
  'campus-building': '#176f46',
  dorm: '#2d6f8e',
  food: '#b43c0b',
  service: '#5b6b7c',
  express: '#8a6d1f',
  gate: '#44403c',
  nearby: '#6b7280'
}

export const MAP_DEFAULT_COLOR = '#176f46'

export const PLACE_SCOPE_LABELS: Readonly<Record<string, string>> = {
  campus: '校内',
  nearby: '周边'
}

export const COORDINATE_VERIFICATION_LABELS: Readonly<Record<string, string>> = {
  verified: '已核验',
  unverified: '未核验',
  pending: '待核验',
  approximate: '大致位置'
}

export const COORDINATE_SYSTEM_LABELS: Readonly<Record<string, string>> = {
  WGS84: 'WGS84',
  'GCJ-02': 'GCJ-02',
  BD09: 'BD09'
}

const PLACE_SUMMARY_KINDS: Readonly<Record<string, string>> = {
  'campus-building': '校内楼栋',
  'building': '校内楼栋',
  'teaching-building': '教学楼',
  'dorm': '宿舍楼',
  'dormitory': '宿舍楼',
  'food': '餐饮地点',
  'dining': '餐饮地点',
  'service': '校园服务地点',
  'health-service': '医务服务地点',
  'express-service': '快递服务地点',
  'express': '快递服务地点',
  'gate': '校门或出入口',
  'transit-stop': '交通站点',
  'library': '图书馆地点',
  'sports-ground': '体育活动地点',
  'event-venue': '校园活动地点',
  'shop': '周边生活地点',
  'nearby': '周边生活地点'
}

const IMPORTED_PLACE_MAINTENANCE_COPY = /用户授权的高德(?:工作)?地图|高德地图坐标|后台草稿|地图定位和维护|正式发布|坐标导入/

export function resolvePlaceCategoryLabel(
  category: string | null | undefined,
  type: string | null | undefined
): string {
  const key = category ?? type ?? ''
  return PLACE_CATEGORY_LABELS[key] ?? '其他地点'
}

export function resolveMapCategoryLabel(category: string | null | undefined): string {
  return MAP_CATEGORY_LABELS[category ?? ''] ?? MAP_CATEGORY_LABELS.nearby!
}

export function resolvePlaceScopeLabel(scope: string | null | undefined): string {
  return PLACE_SCOPE_LABELS[scope ?? ''] ?? '周边'
}

export function resolveCoordinateVerificationLabel(value: string | null | undefined): string {
  return COORDINATE_VERIFICATION_LABELS[value ?? ''] ?? '状态未标注'
}

export function resolveCoordinateSystemLabel(value: string | null | undefined): string {
  return COORDINATE_SYSTEM_LABELS[value ?? ''] ?? (value ? String(value) : '未标注')
}

export interface PlaceCoordinateFields {
  navigationAvailable: boolean
  coordinateVerification: string | null
  coordinateSystem: string | null
  longitude: number | null
  latitude: number | null
}

export function isPlaceCoordinateVerified(place: PlaceCoordinateFields | null | undefined): boolean {
  return Boolean(
    place?.navigationAvailable
    && place.coordinateVerification === 'verified'
    && place.coordinateSystem === 'WGS84'
    && place.longitude !== null
    && place.latitude !== null
  )
}

export function resolvePlaceNavigationStatusLabel(coordinateIsVerified: boolean): string {
  return coordinateIsVerified ? '可直接导航' : '入口以现场为准'
}

export interface PlaceLocationFields {
  name: string
  campusArea: string | null
  address: string | null
  floor: string | null
  room: string | null
}

export function buildPlaceLocationCopyText(place: PlaceLocationFields): string {
  return [
    place.name,
    place.campusArea,
    place.address,
    place.floor,
    place.room
  ].filter((value): value is string => Boolean(value)).join(' · ')
}

export function resolvePlaceFloorRoomLabel(
  floor: string | null | undefined,
  room: string | null | undefined
): string {
  return [floor, room].filter(Boolean).join(' · ')
}

/** 去掉「到这里前先确认」清单段，返回正文。 */
export function studentFacingPlaceBody(body: string): string {
  return body
    .replace(/【到这里前先确认】[\s\S]*?(?=\n【|$)/g, '')
    .split('\n')
    .map(line => line.trim()
      .replace(/^(.+?)\s*已按用户授权的高德地图坐标导入后台草稿[；;]?\s*可用于地图定位和维护[。，,；;\s]*具体入口、楼层、开放时间仍需现场或官方资料(?:核验|确认)后再正式发布[。.]?$/g, '$1的位置来自高德地图，可以先用来找方向。具体入口、楼层和开放时间请以现场标识或学校通知为准。')
      .replace(/^(.+?)\s*已按用户授权的高德地图坐标导入后台草稿[；;]?\s*可用于地图定位和维护[。.]?$/g, '$1的位置来自高德地图，可以先用来找方向。')
      .replace(/后台草稿/g, '地图上的位置')
      .replace(/正式发布/g, '公开展示')
      .replace(/地图定位和维护/g, '找方向')
      .replace(/GCJ-02|WGS84|coordinate/gi, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((line) => {
      if (!line) return true
      return !/resourceId|坐标来源|发布提醒|sourceRawRef/i.test(line)
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractStudentUseChecklist(body: string): string[] {
  const lines = body.split('\n')
  const headingIndex = lines.findIndex(line => line.trim() === '【到这里前先确认】')
  if (headingIndex < 0) return []

  const items: string[] = []
  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('【')) break
    const match = trimmed.match(/^[-*•]\s*(.+)$/)
    if (!match) break
    items.push(match[1]!.trim())
    if (items.length >= 8) break
  }
  return items
}

export function resolvePlaceStudentSummary(
  summary: string | null | undefined,
  name: string,
  category: string | null | undefined,
  type: string | null | undefined
): string {
  const raw = summary?.trim() ?? ''
  if (raw && !IMPORTED_PLACE_MAINTENANCE_COPY.test(raw)) return studentFacingPlaceBody(raw)

  const key = category ?? type ?? ''
  const kind = PLACE_SUMMARY_KINDS[key] ?? '校园地点'
  return `${name}是${kind}，可以先用地图确认大致方向。具体入口、楼层、开放时间和当前用途请以现场标识或学校通知为准。`
}

export function resolvePlaceStudentBody(
  body: string | null | undefined,
  name = '',
  category?: string | null,
  type?: string | null
): string {
  const raw = body?.trim() ?? ''
  if (!raw) return ''
  if (IMPORTED_PLACE_MAINTENANCE_COPY.test(raw)) {
    return resolvePlaceStudentSummary(raw, name || '这里', category, type)
  }
  return studentFacingPlaceBody(raw)
}

export function resolvePlaceUseChecklist(body: string | null | undefined): string[] {
  return extractStudentUseChecklist(body ?? '')
}

export function buildPlaceFallbackUseChecklist(
  extractedChecklist: string[],
  category: string | null | undefined
): string[] {
  if (extractedChecklist.length) return extractedChecklist

  const items = ['出发前先确认开放时间、入口或办理窗口是否有临时调整。']
  if (category === 'dorm') {
    items.push('宿舍楼、楼层、门禁和访客要求以辅导员、宿管或迎新现场通知为准。')
  } else if (category === 'express') {
    items.push('取件前先看短信、取件码和现场货架提示，不同快递品牌可能不在同一个点。')
  } else if (category === 'food' || category === 'nearby') {
    items.push('价格、营业状态、电话和优惠活动变化较快，到店或下单前再确认一次。')
  } else if (category === 'campus-building') {
    items.push('上课或集合请同时核对课程表、通知里的楼层和教室号。')
  } else {
    items.push('如果是办事地点，先准备证件、截图或相关材料，减少来回跑。')
  }
  return items
}
