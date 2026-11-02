import type { ApiBusLineDirection } from '../../../shared/types/server'
import { busLinesFor } from './bus-lines'
import { busGeometryFor, type ApiBusGeometryDirection } from './mygolbs'

/**
 * 线路几何以掌上公交为准，高德快照只留票价和兜底。
 *
 * 原因：两条数据源的走线在泉州这一段并不一致（K2 在双阳—万虹路侧相差约 2.4 km），
 * 实时车辆按掌上公交的 GPS 跑，画高德的线就会出现「车在路外」。站点和折线一起换，
 * 保证「线—站—车」三个东西永远来自同一套坐标。
 */

/** 起点距离（米），用来把高德快照的方向和掌上公交的方向对上。 */
function startDistance(a: [number, number], b: [number, number]): number {
  const kx = 111320 * Math.cos((25.05 * Math.PI) / 180)
  const ky = 110540
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky)
}

function merge(item: ApiBusLineDirection, geometry: ApiBusGeometryDirection | undefined): ApiBusLineDirection {
  if (!geometry || geometry.polyline.length < 2) return item
  return {
    ...item,
    from: geometry.from || item.from,
    to: geometry.to || item.to,
    startTime: item.startTime || geometry.beginTime,
    endTime: item.endTime || geometry.endTime,
    distanceKm: geometry.distanceKm || item.distanceKm,
    stops: geometry.stops.map(stop => ({
      seq: stop.seq,
      name: stop.name,
      lng: stop.lng,
      lat: stop.lat
    })),
    polyline: geometry.polyline
  }
}

/**
 * 高德快照 + 掌上公交几何。上游取不到几何时静默退回快照，
 * 页面最多是「线略有偏差」，不会整块变空。
 */
export async function busLinesWithGeometry(line?: string | null): Promise<ApiBusLineDirection[]> {
  const base = busLinesFor(line)
  let geometry: ApiBusGeometryDirection[] = []
  try {
    geometry = await busGeometryFor(line)
  } catch {
    // 上游抖动就退回快照：线与车之间会有偏差，但不至于整块变空。
    return base
  }

  return base.map((item) => {
    const anchor = item.polyline[0]
    if (!anchor) return item
    const hit = geometry.find((candidate) => {
      const head = candidate.polyline[0]
      if (candidate.line !== item.line || !head) return false
      return startDistance(head, anchor) < 300
    })
    return merge(item, hit)
  })
}
