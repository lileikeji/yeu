import { createError, getQuery } from 'h3'
import type { BusProfileSegment, BusEtaStop } from '../../../modules/transport/eta'
import {
  BUS_ETA_SAMPLE_CAVEAT,
  ETA_BAND_RATIO,
  buildBusSegmentProfile,
  estimateBusEta
} from '../../../modules/transport/eta'
import { setPublicCache } from '../../../utils/http'

/**
 * 校车站间到站区间。
 *
 * 没有班次时刻表：`minutes` 表示「已经从首站发车多少分钟」，返回的是各站
 * 相对当前时刻的到站区间，不是实时车辆位置，也不做实时到站预测。
 */

/** 页面滑杆的上限；超过这个范围请求一律 400，避免无意义的估算。 */
const MINUTES_MIN = 0
const MINUTES_MAX = 90

interface BusEtaResponse {
  available: boolean
  measuredAt: string
  minutesSinceDeparture: number
  stops: BusEtaStop[]
  segments: BusProfileSegment[]
  warning: string
}

function warningFor(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60)
  return `${BUS_ETA_SAMPLE_CAVEAT}；全程约 ${minutes} 分钟，区间按实测 ±${Math.round(ETA_BAND_RATIO * 100)}% 生成。`
}

export default defineEventHandler((event): BusEtaResponse => {
  const query = getQuery(event)
  const raw = query.minutes
  const minutes = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isInteger(minutes) || minutes < MINUTES_MIN || minutes > MINUTES_MAX) {
    throw createError({
      statusCode: 400,
      statusMessage: `minutes must be an integer between ${MINUTES_MIN} and ${MINUTES_MAX}`
    })
  }

  const profile = buildBusSegmentProfile()
  if (!profile.available) {
    return {
      available: false,
      measuredAt: profile.measuredAt,
      minutesSinceDeparture: minutes,
      stops: [],
      segments: [],
      warning: `${BUS_ETA_SAMPLE_CAVEAT}；当前不可用：${profile.reason}`
    }
  }

  const estimate = estimateBusEta({ minutesSinceDeparture: minutes, profile })
  if (!estimate.available) {
    return {
      available: false,
      measuredAt: profile.measuredAt,
      minutesSinceDeparture: minutes,
      stops: [],
      segments: [],
      warning: `${BUS_ETA_SAMPLE_CAVEAT}；当前不可用：${estimate.reason}`
    }
  }

  // 只有算出来的成功响应才挂缓存头：400 与估算不可用都走不到这里。
  setPublicCache(event, 60)

  return {
    available: true,
    measuredAt: profile.measuredAt,
    minutesSinceDeparture: estimate.minutesSinceDeparture,
    stops: estimate.stops,
    segments: profile.segments,
    warning: warningFor(profile.totalSeconds)
  }
})
