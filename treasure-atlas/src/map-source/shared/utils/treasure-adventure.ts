import { amapImportedPlaces } from '../../data/seeds/amap-imported-places.ts'
import type { GeoPoint } from '../../map/core/types.ts'
import { adventureRegion, isInsideAdventureCampus } from './adventure-campus.ts'
import type { CampusRegion } from './adventure-campus.ts'
import { gcj02ToWgs84 } from './coordinate-convert.ts'
import { pointAtDistance, treasureRadius } from './treasure-pilot.ts'

export interface AdventurePoint {
  id: string
  name: string
  landmark: string
  kind: 'chest' | 'oculus' | 'finish'
  point: GeoPoint
  region: CampusRegion
  clue: string
  question?: string
}

function activity(id: string, kind: AdventurePoint['kind'], name: string, row: number, clue: string, question?: string): AdventurePoint {
  const place = amapImportedPlaces.find(item => item.sourceRow === row)
  if (!place) throw new Error(`Unknown campus reference row ${row}`)
  const coordinate = place.point
  const wgs = coordinate.crs === 'WGS84' ? null : gcj02ToWgs84(coordinate.lng, coordinate.lat)
  const point: GeoPoint = wgs ? { lng: wgs.longitude, lat: wgs.latitude, crs: 'WGS84' } : coordinate
  if (!isInsideAdventureCampus(point)) throw new Error(`Activity point outside campus: ${id}`)
  return { id, name, kind, landmark: place.name, point, region: adventureRegion(point), clue, question }
}

export const adventureGoal = 5
export const adventurePoints: AdventurePoint[] = [
  activity('yangen', 'chest', '启程宝箱', 66, '沿仰恩教学楼附近的步道找启程线索。', '仰恩教学楼楼名的前两个字是什么？'),
  activity('track', 'chest', '跑道补给箱', 63, '线索在新区操场外沿，沿人行道寻找。', '这个点位在新区还是旧区？'),
  activity('square', 'chest', '碑林宝箱', 68, '沿广场步道走到碑林一侧。', '广场名称开头的两个字是什么？'),
  activity('puzhao', 'chest', '普照宝箱', 67, '在普照教学楼附近找线索。', '楼名开头的两个字是什么？'),
  activity('jilong', 'chest', '吉龙宝箱', 10, '沿吉龙教学楼外的步道寻找。', '教学楼名称开头的两个字是什么？'),
  activity('stadium', 'chest', '看台宝箱', 52, '绕仰恩基金会体育场外侧步道寻找。', '体育场全名里的三个字是什么？提示：仰恩□□□体育场。'),
  activity('beiyuan', 'chest', '北苑补给箱', 27, '到北苑餐厅外侧寻找。', '餐厅名开头的两个字是什么？'),
  activity('xiangxian', 'chest', '祥贤宝箱', 25, '沿祥贤楼外的步道找线索。', '楼名开头的两个字是什么？'),
  activity('library', 'oculus', '书页神瞳', 71, '顺着湖边去找新区图书馆。', '试玩题目 · 按顺序读出 C、A、T。'),
  activity('history', 'oculus', '湖畔神瞳', 58, '沿新区湖边寻找露天舞池。', '这个湖畔地标在原校园地图上的名称是什么？'),
  activity('hechang-new', 'oculus', '和昌神瞳', 65, '新区有一栋与旧区同名的教学楼。', '两个校区的这栋教学楼共享哪个名字？'),
  activity('yongkang', 'oculus', '永康神瞳', 53, '旧区有一个以「永」字开头的球场。', '球场名称的前两个字是什么？'),
  activity('dongyuan', 'oculus', '东苑神瞳', 28, '沿旧区步道向东，找以方位命名的餐厅。', '餐厅名称开头的两个字是什么？'),
  activity('auditorium', 'oculus', '礼堂神瞳', 22, '旧区有一座以「普照」命名的大礼堂。', '楼名最后三个字是什么？'),
  activity('finish', 'finish', '协会终点宝箱', 69, `集齐任意 ${adventureGoal} 枚印章后，前往文体中心的协会终点。`, '终点地标叫什么？')
]

export const adventureCollectibles = adventurePoints.filter(point => point.kind !== 'finish')

export interface AdventureProgress {
  collected: string[]
  totalOpened: number
  totalOculi: number
}

/** Boundary integrity check for preview data. All claim circles should fit inside campus. */
export function adventureCircleFitsCampus(point: GeoPoint): boolean {
  for (let bearing = 0; bearing < 360; bearing += 5) {
    if (!isInsideAdventureCampus(pointAtDistance(point, treasureRadius + 1, bearing))) return false
  }
  return true
}
