import type { ApiBusLineDirection, ApiBusLinesResponse } from '../../../shared/types/server'
import snapshot from '../../../data/bus-lines.json'

/**
 * K2 / K6 校外公交线路静态快照。
 *
 * 数据由高德 Web 服务 `v3/bus/linename?extensions=all` 抓取：站序、首末班、
 * 分段票价和沿真实道路的逐点折线一次拿全。高德这一族接口没有实时车辆位置，
 * 所以这里只做静态线路，实时到站需要另外的数据源。
 *
 * 刷新方式：`scripts/refresh-bus-lines.ts`（改天再说之前先看 `data/bus-lines.json`
 * 的 fetchedAt，别悄悄用旧数据）。
 */
const snapshotLines = snapshot.lines as ApiBusLineDirection[]

export const BUS_LINE_NAMES = ['K2', 'K6'] as const
export type BusLineName = typeof BUS_LINE_NAMES[number]

export const busLines: ApiBusLinesResponse = {
  provider: 'amap',
  city: snapshot.city,
  fetchedAt: snapshot.fetchedAt,
  lines: snapshotLines,
  vehiclePositionsAvailable: false
}

export function isBusLineName(value: unknown): value is BusLineName {
  return typeof value === 'string' && (BUS_LINE_NAMES as readonly string[]).includes(value.toUpperCase())
}

/** 按线路号筛选；不传线路号返回两个方向的全量。 */
export function busLinesFor(line?: string | null): ApiBusLineDirection[] {
  if (!line) return busLines.lines
  const normalized = line.trim().toUpperCase()
  return busLines.lines.filter(item => item.line === normalized)
}

export function busLineSummary(item: ApiBusLineDirection) {
  return {
    line: item.line,
    id: item.id,
    direction: item.direction,
    from: item.from,
    to: item.to,
    startTime: item.startTime,
    endTime: item.endTime,
    distanceKm: item.distanceKm,
    basicPrice: item.basicPrice,
    totalPrice: item.totalPrice,
    stopCount: item.stops.length,
    polylinePoints: item.polyline.length
  }
}
