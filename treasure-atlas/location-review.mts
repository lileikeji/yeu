import { adventureRegion, isInsideAdventureCampus } from './src/map-source/shared/utils/adventure-campus.ts'
import { pointAtDistance } from './src/map-source/shared/utils/treasure-pilot.ts'

type Point = [number, number]
type Region = 'new' | 'old'
type Review = { evidence: string, detail: string }
type Entry = { id: string, name: string, point: number[], kind: string, region: Region, plan?: string }

const west = (x: number, y: number): Point => [
  118.5967 + x / 1600 * 0.0115, 25.1138 - y / 981 * 0.00705
]
const east = (x: number, y: number): Point => [
  118.6078 + x / 1440 * 0.0089, 25.1204 - y / 1391 * 0.0086
]

// West landing from the existing server pilot's WGS84 settings.
export const pilot = { point: [118.61320270142181, 25.115561557384353] as Point, radius: 20 }
const bridgeImage = (x: number, y: number): Point => [118.6096 + x / 1050 * 0.007, 25.119 - y / 1200 * 0.008]
export const bridgeRoute = [[419, 556], [433, 553], [446, 544], [460, 535], [476, 527], [496, 522], [519, 518]]
  .map(([x, y]) => bridgeImage(x!, y!)).concat([pilot.point])

const changes: Record<string, { point: Point, detail: string }> = {
  'yangen': { point: west(797, 789), detail: '仰恩教学楼西侧人行通道，替换楼内院参考点。' },
  'track': { point: west(657, 624), detail: '新区操场北侧外沿人行道，替换场地中心。' },
  'finish': { point: west(794, 220), detail: '文体中心东南铺装区，替换屋顶参考点。' },
  'jilong': { point: east(549, 1000), detail: '吉龙教学楼东南侧铺装步道，和室内隐藏款区分。' },
  'stadium': { point: east(311, 885), detail: '仰恩基金会体育场北侧外沿铺装，替换场地中心。' },
  'beiyuan': { point: east(729, 657), detail: '北苑餐厅东侧通行带，替换建筑参考点。' },
  'xiangxian': { point: east(639, 563), detail: '祥贤楼东侧楼外空地，替换屋顶参考点。' },
  'naiwa-old-admin': { point: east(451, 939), detail: '旧区行政楼南侧通行区，替换屋顶参考点。' },
  'zodiac-gonghe': { point: east(176, 986), detail: '共和教学楼与体育场之间的室外参考点。具体通行位置待实地确认。' },
  'zodiac-history': { point: west(916, 134), detail: '第二教学区图书馆西侧步道，供室外奶兔立牌试玩。校史馆位于图书馆一楼，馆门待现场确认。' },
  'zodiac-bridge': { point: pilot.point, detail: '西桥头，采用正式试点的服务端 WGS84 坐标与 20 米半径，现场摆位待核。' },
  'zodiac-park': { point: east(617, 690), detail: '创业园向东连到主路的楼前铺装区。' },
  'zodiac-network': { point: west(1494, 195), detail: '网络信息中心北侧楼外步道，替换建筑参考点。' },
  'taffy-new-admin': { point: west(813, 662), detail: '新区行政楼西侧步道，替换屋顶参考点。' },
  'taffy-zequan': { point: west(1151, 205), detail: '泽钏教学楼西端与图书馆之间的步道，替换屋顶参考点。' },
  'taffy-nanyang': { point: east(431, 1123), detail: '南洋楼南侧弯曲步道，替换建筑参考点。' },
  'classroom-guga': { point: west(736, 528), detail: '标在普照教学楼东翼建筑内。一层门厅为原试玩剧情，实际室内位置待核。' },
  'amap-import-row-030': { point: east(978, 790), detail: '普通地标标在可见桥面中段。西桥头猎宝点单独沿用服务端坐标。' }
}

const fieldReview: Record<string, string> = {
  'square': '碑林广场铺装，与航拍广场吻合。',
  'puzhao': '普照教学楼院内可见铺装，保留原试玩点。',
  'library': '第二教学区图书馆，书页神瞳保留楼栋参考；不定位具体房间。',
  'history': '新区湖边舞池圆形铺装。旧区湖边剧场为另一地点。',
  'hechang-new': '新区和昌教学楼，保留楼栋参考。',
  'yongkang': '永康球场可见球场铺装，保留区域点。',
  'dongyuan': '东苑餐厅半圆形主体，保留楼栋参考。',
  'auditorium': '普照大礼堂红褐色屋面，保留楼栋参考。',
  'naiwa-xiyuan': '西苑餐厅东侧外沿，保留原试玩点。',
  'amap-import-row-006': '校图 22，附近楼群和体育场相对关系吻合，楼栋分界待复测。',
  'amap-import-row-007': '校图 21，位于体育场北侧楼群，具体门口待复测。',
  'amap-import-row-008': '校图 20，标点靠近体育场北侧；航拍无法单独判定宏船楼的确切建筑。',
  'amap-import-row-070': '第二教学区图书馆一楼，学校公告确认；地图标楼栋，馆门待现场确认。'
}

const roadsideIds = new Set(['021', '032', '033', '064', '072', '075', '076', '077'].map(row => `amap-import-row-${row}`))
const namedAreaIds = new Set(['004', '052', '053', '058', '059', '062', '063', '068'].map(row => `amap-import-row-${row}`))

export function reviewLocations<T extends Entry>(items: T[]) {
  return items.map((entry) => {
    const change = changes[entry.id]
    const point = change?.point ?? entry.point
    const [lng, lat] = point
    const geo = { lng: lng!, lat: lat!, crs: 'WGS84' as const }
    const isActivity = !entry.id.startsWith('amap-')
    const inCampus = isInsideAdventureCampus(geo)
    const localRadius = isActivity && Array.from({ length: 72 }, (_, i) => i * 5)
      .every(bearing => isInsideAdventureCampus(pointAtDistance(geo, pilot.radius, bearing)))
    if (isActivity && (!inCampus || adventureRegion(geo) !== entry.region)) {
      throw new Error(`Reviewed activity point outside original campus area: ${entry.id}`)
    }
    const review = locationEvidence(entry, change)
    return { ...entry, point, inCampus, review, localRadius }
  })
}

function locationEvidence(entry: Entry, change?: { detail: string }): Review {
  if (entry.id === 'zodiac-bridge') return { evidence: '服务端试点', detail: change!.detail }
  if (entry.id === 'amap-import-row-070') return { evidence: '校方公告和航拍', detail: fieldReview[entry.id]! }
  if (entry.kind === 'classroom') return {
    evidence: '建筑落点已对照',
    detail: change?.detail ?? '高德楼栋与航拍对照。保留原室内玩法中的楼栋参考，实际大厅或走廊位置待现场确认。'
  }
  if (change) return {
    evidence: entry.kind === 'landmark' ? '航拍地物' : '航拍室外试玩点',
    detail: change.detail
  }
  if (roadsideIds.has(entry.id)) return {
    evidence: '沿用原导入点',
    detail: '已对照道路或街区。店铺、站点现址及营业或停靠信息待实地核实。'
  }
  if (entry.kind === 'dorm') return {
    evidence: entry.plan ? '校图宿舍区和航拍' : '航拍建筑和原楼名',
    detail: fieldReview[entry.id] ?? '落在对应宿舍建筑或楼群。楼名沿用原高德资料；地图仅供搜索，楼门待现场核实。'
  }
  if (fieldReview[entry.id]) return { evidence: '校图地标和航拍', detail: fieldReview[entry.id]! }
  if (namedAreaIds.has(entry.id)) return {
    evidence: '航拍地物',
    detail: '已对照运动场、广场或路口轮廓，保留原区域参考点。'
  }
  return {
    evidence: entry.plan ? '校图编号和航拍' : '航拍建筑和原名称',
    detail: '对照建筑主体、院落或紧邻步道。大门、楼内位置和开放情况待现场核实。'
  }
}

export const pendingPlanNames = ['永福楼', '永安楼', '顺安楼', '共和楼', '旧区图书馆']
