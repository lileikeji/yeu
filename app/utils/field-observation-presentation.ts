import type { CoordinateObservationStatus } from '~~/shared/constants/server'
import type { ApiCoordinateObservation, ApiPlace } from '~~/shared/types/server'

export function formatCoordinateObservationDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间无效'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function getCoordinateObservationPlaceName(
  places: Array<Pick<ApiPlace, 'id' | 'name'>>,
  placeId: string
): string {
  return places.find(place => place.id === placeId)?.name ?? '未知地点'
}

export function getCoordinateObservationStatusLabel(
  status: CoordinateObservationStatus
): string {
  return {
    pending: '待审核',
    approved: '已批准',
    rejected: '已驳回',
    superseded: '已被替代'
  }[status]
}

export function getCoordinateObservationStatusColor(
  status: CoordinateObservationStatus
): 'neutral' | 'success' | 'error' | 'warning' {
  if (status === 'pending') return 'warning'
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'error'
  return 'neutral'
}

export function getCoordinatePointRoleLabel(
  role: ApiCoordinateObservation['pointRole']
): string {
  return role === 'main-entrance' ? '主入口' : '场地点'
}

export function getCoordinateCaptureMethodLabel(method: string): string {
  if (method === 'browser-geolocation') return '浏览器定位'
  if (method === 'amap-workmap') return '授权地图导入'
  if (method === 'manual') return '人工录入'
  return '其他采集方式'
}
