/**
 * 校车分段车速表 —— 由 2026-11-11 整天实测采样（`.tmp/busprobe`，见 `scripts/bus-segment-speeds.test.ts`）标定。
 *
 * 为什么不用单一巡航常数：实测同一趟里站间均速 2.46–4.58 m/s，车与车之间还差 15%，
 * 用一个 6.4 m/s 会让 ETA 系统性偏乐观 2 倍（面板结算 48s vs 实际 90s）。
 *
 * 表里 seconds 是「站点到站点」实测用时中位，已经包含减速带减速与中途上下客，
 * 因此用到 ETA 时**不再叠加** `bumpExtraSeconds()`，否则重复计入。
 * 没有实测覆盖的里程段退回 `CAMPUS_AVERAGE_MPS`（3.4 m/s）。
 *
 * 首段（`from: 0`）靠「离站锚定」得来：切段时若要求「先看到车在站之前」，起点站与终点站天然缺一帧，
 * 2026-11-12 的采样里去程首段 483m、回程首段 478m 曾一直走 3.4 m/s 兜底。
 * 现在首段用「最后一帧还在起点 20m 内」当离站时刻。回程末段（旧区行政楼斜对面→旧区发车点，483m）
 * 仍只有 4 个样本，未达 5 个下限，继续兜底。
 */

import { alongOnPolyline, type LineSpeedProfile } from './bus-route-progress'

interface Point {
  lng: number
  lat: number
}

export interface BusSegmentSpeed {
  routeId: string
  /** 起点站在该线路 stops 里的下标 */
  from: number
  /** 终点站在该线路 stops 里的下标 */
  to: number
  /** 站间沿线米数（实测中位） */
  meters: number
  /** 站间实测用时中位（秒，含减速带与上下客） */
  seconds: number
  /** 参与统计的样本数 */
  samples: number
}

/** 由 `.tmp/busprobe/emit-segments.ts` 从实测采样生成。 */
export const BUS_SEGMENT_SPEEDS: BusSegmentSpeed[] = [
  { routeId: '6ee6770bd81043b8939054e4c0a112c6', from: 0, to: 1, meters: 483, seconds: 132, samples: 36 }, // 旧区--新区 旧区发车点（邮政快递站旁）→旧区行政楼斜对面 3.66 m/s
  { routeId: '6ee6770bd81043b8939054e4c0a112c6', from: 1, to: 2, meters: 266, seconds: 102, samples: 8 }, // 旧区--新区 旧区行政楼斜对面→旧区南门天桥 2.61 m/s
  { routeId: '6ee6770bd81043b8939054e4c0a112c6', from: 2, to: 3, meters: 410, seconds: 78, samples: 9 }, // 旧区--新区 旧区南门天桥→网络信息中心 5.26 m/s
  { routeId: '6ee6770bd81043b8939054e4c0a112c6', from: 3, to: 4, meters: 357, seconds: 108, samples: 14 }, // 旧区--新区 网络信息中心→新区图书馆 3.31 m/s
  { routeId: '6ee6770bd81043b8939054e4c0a112c6', from: 4, to: 5, meters: 325, seconds: 76, samples: 14 }, // 旧区--新区 新区图书馆→普照楼2号门 4.28 m/s
  { routeId: '6ee6770bd81043b8939054e4c0a112c6', from: 5, to: 6, meters: 478, seconds: 127, samples: 7 }, // 旧区--新区 普照楼2号门→新区和昌楼2号门 3.76 m/s
  { routeId: '865cf7c5edcc45ffa3c373e2a3f117a9', from: 0, to: 1, meters: 478, seconds: 108, samples: 37 }, // 新区--旧区 新区和昌楼2号门→普照楼2号门 4.42 m/s
  { routeId: '865cf7c5edcc45ffa3c373e2a3f117a9', from: 1, to: 2, meters: 325, seconds: 80, samples: 11 }, // 新区--旧区 普照楼2号门→新区图书馆 4.06 m/s
  { routeId: '865cf7c5edcc45ffa3c373e2a3f117a9', from: 2, to: 3, meters: 357, seconds: 113, samples: 11 }, // 新区--旧区 新区图书馆→网络信息中心 3.16 m/s
  { routeId: '865cf7c5edcc45ffa3c373e2a3f117a9', from: 3, to: 4, meters: 411, seconds: 89, samples: 11 }, // 新区--旧区 网络信息中心→旧区南门天桥 4.62 m/s
  { routeId: '865cf7c5edcc45ffa3c373e2a3f117a9', from: 4, to: 5, meters: 266, seconds: 108, samples: 14 } // 新区--旧区 旧区南门天桥→旧区行政楼斜对面 2.46 m/s
]

/** 段长下限：太短的段（同站点重合）投影误差占比太大，不参与标定。 */
const MIN_SEGMENT_METERS = 30

/** 把某条线路的实测段速转成沿线车速切片，供 travelSecondsOnLine 积分。 */
export function buildSegmentProfile(
  routeId: string,
  stops: Point[],
  line: Point[]
): LineSpeedProfile | undefined {
  if (stops.length < 2 || line.length < 2) return undefined
  const rows = BUS_SEGMENT_SPEEDS.filter(row => row.routeId === routeId)
  if (rows.length === 0) return undefined
  const stopAlong = stops.map(stop => alongOnPolyline(stop, line))
  const slices: LineSpeedProfile = []
  for (const row of rows) {
    if (row.from < 0 || row.to >= stopAlong.length || row.seconds <= 0) continue
    const start = stopAlong[row.from]!
    const end = stopAlong[row.to]!
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_SEGMENT_METERS) continue
    slices.push({ fromAlong: start, toAlong: end, speedMps: row.meters / row.seconds })
  }
  if (slices.length === 0) return undefined
  return slices.sort((a, b) => a.fromAlong - b.fromAlong)
}
