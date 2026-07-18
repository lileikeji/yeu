import type { ApiCoordinateObservation, ApiPlace } from '~~/shared/types/server'

/** Keep in sync with shared/constants/server (avoid relative shared value imports in app SSR chunks). */
const MAX_DUAL_VERIFICATION_DISTANCE_METERS = 20
const MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS = 30 * 60 * 1000

export type CoordinateReviewStage
  = 'first-candidate'
    | 'possible-dual'
    | 'dual-verified'
    | 'replacement'

export interface CoordinateReviewHint {
  stage: CoordinateReviewStage
  title: string
  description: string
}

interface CoordinatePoint {
  longitude: number
  latitude: number
}

export function coordinateDistanceMeters(
  left: CoordinatePoint,
  right: CoordinatePoint
): number {
  const earthRadiusMeters = 6_371_000
  const toRadians = (value: number) => value * Math.PI / 180
  const latitudeDelta = toRadians(right.latitude - left.latitude)
  const longitudeDelta = toRadians(right.longitude - left.longitude)
  const leftLatitude = toRadians(left.latitude)
  const rightLatitude = toRadians(right.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function buildCoordinateReviewHint(
  observation: ApiCoordinateObservation | null,
  place: ApiPlace | null
): CoordinateReviewHint | null {
  if (!observation || !place) return null

  if (place.coordinateVerification === 'verified') {
    return {
      stage: 'dual-verified',
      title: '地点当前已完成两次独立核验',
      description: observation.reviewStatus === 'pending'
        ? '批准这条新观测时，系统只会保留与它最接近的一条有效旧记录；如果找不到相符记录，地点会退回仅完成一次核验的状态。'
        : '当前地点已有两条相互独立且位置相符的批准记录，前台可以使用该导航坐标。'
    }
  }

  if (observation.reviewStatus === 'approved') {
    return {
      stage: 'first-candidate',
      title: '已完成第一次核验',
      description: '当前只有一条有效记录，地点仍处于待核验状态；还需要另一条点位角色相同、位置接近且独立采集的记录。'
    }
  }
  if (observation.reviewStatus !== 'pending') {
    return {
      stage: 'replacement',
      title: '这条历史记录不参与当前核验',
      description: observation.reviewStatus === 'superseded'
        ? '该记录的审核历史已保留，但已由更新证据替代。'
        : '该记录已被驳回，不会计入地点坐标证据。'
    }
  }

  const hasCandidate = place.longitude !== null
    && place.latitude !== null
    && place.coordinateSystem === 'WGS84'
    && place.coordinatePointRole !== null
  if (!hasCandidate) {
    return {
      stage: 'first-candidate',
      title: '批准后将完成第一次核验',
      description: '地点会保存这次标准地理坐标，但仍显示为待核验；还需要另一条独立采集、点位角色相同且位置相符的记录。'
    }
  }

  const separation = coordinateDistanceMeters(
    { longitude: observation.longitude, latitude: observation.latitude },
    { longitude: place.longitude!, latitude: place.latitude! }
  )
  if (place.coordinatePointRole !== observation.pointRole) {
    return {
      stage: 'replacement',
      title: '点位角色与第一次核验不同',
      description: '这条记录的点位角色与现有记录不同，无法组成两次独立核验；批准后会替代旧记录，地点仍保持待核验。'
    }
  }
  if (separation > MAX_DUAL_VERIFICATION_DISTANCE_METERS) {
    return {
      stage: 'replacement',
      title: `与第一次核验位置相距 ${separation.toFixed(1)} 米`,
      description: `距离超过允许的 ${MAX_DUAL_VERIFICATION_DISTANCE_METERS} 米；批准后会替代旧记录，不会完成第二次独立核验。`
    }
  }

  return {
    stage: 'possible-dual',
    title: `与第一次核验位置相距 ${separation.toFixed(1)} 米`,
    description: `点位角色和距离均符合要求。系统还会确认两次采集是否独立：使用同一种采集方式时需至少间隔 ${MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS / 60_000} 分钟，并且至少一条来自浏览器定位或授权地图导入。`
  }
}
