import { extractStudentUseChecklist, studentFacingPlaceBody } from './public-catalog'

export const placeCategoryLabels: Record<string, string> = {
  'campus-building': '教学 / 学习',
  'dorm': '宿舍',
  'food': '餐饮',
  'service': '校园服务',
  'express': '快递',
  'gate': '校门',
  'nearby': '周边服务'
}

export interface PlaceCoordinateFields {
  navigationAvailable: boolean
  coordinateVerification: string | null
  coordinateSystem: string | null
  longitude: number | null
  latitude: number | null
}

export interface PlaceLocationFields {
  name: string
  campusArea: string | null
  address: string | null
  floor: string | null
  room: string | null
}

export interface PlaceDetailSourceLike {
  id: string
  title: string
  url: string
}

export interface PlaceDetailSourceView {
  key: string
  title: string
  url: string
}

export function resolvePlaceCategoryLabel(category: string | null | undefined, type: string | null | undefined): string {
  const key = category ?? type ?? ''
  return placeCategoryLabels[key] ?? key
}

export function resolvePlaceScopeLabel(scope: string | null | undefined): string {
  return scope === 'campus' ? '校内' : '周边'
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

export function buildPlaceMapTarget(
  placeSlug: string,
  returnPath: string | null | undefined
): { path: string, query: Record<string, string> } {
  return {
    path: '/map',
    query: {
      place: placeSlug,
      ...(returnPath ? { from: returnPath } : {})
    }
  }
}

export function buildPlaceDetailSources(
  sources: PlaceDetailSourceLike[] | null | undefined
): PlaceDetailSourceView[] {
  return (sources ?? []).map(source => ({
    key: source.id,
    title: source.title,
    url: source.url
  }))
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

export function buildPlaceLocationCopyText(place: PlaceLocationFields): string {
  return [
    place.name,
    place.campusArea,
    place.address,
    place.floor,
    place.room
  ].filter((value): value is string => Boolean(value)).join(' · ')
}

export function resolvePlaceStudentBody(body: string | null | undefined): string {
  return studentFacingPlaceBody(body ?? '')
}

export function resolvePlaceUseChecklist(body: string | null | undefined): string[] {
  return extractStudentUseChecklist(body ?? '')
}

export function resolvePlaceFloorRoomLabel(
  floor: string | null | undefined,
  room: string | null | undefined
): string {
  return [floor, room].filter(Boolean).join(' · ')
}
