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
      title: '地点当前已完成双重核验',
      description: observation.reviewStatus === 'pending'
        ? '批准这条新观测时，服务端只会保留与其最匹配的一条有效旧证据；若没有兼容证据，地点会退回首条候选状态。'
        : '当前地点由两条有效 approved 观测共同支持，前台才可使用该导航坐标。'
    }
  }

  if (observation.reviewStatus === 'approved') {
    return {
      stage: 'first-candidate',
      title: '已批准为首条候选',
      description: '当前只有一条有效 approved 证据，地点保持 unverified；仍需满足角色、距离、可信采集方式和时间独立性规则的第二条观测。'
    }
  }
  if (observation.reviewStatus !== 'pending') {
    return {
      stage: 'replacement',
      title: '历史观测不参与当前核验',
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
      title: '批准后仅形成首条候选',
      description: '地点会保存该 WGS84 点，但仍保持 unverified；还需要第二条独立、同点位角色且位置相符的观测。'
    }
  }

  const separation = coordinateDistanceMeters(
    { longitude: observation.longitude, latitude: observation.latitude },
    { longitude: place.longitude!, latitude: place.latitude! }
  )
  if (place.coordinatePointRole !== observation.pointRole) {
    return {
      stage: 'replacement',
      title: '点位角色与首条候选不同',
      description: '这条观测不能与现有候选组成双重证据；批准后会替代旧候选，地点仍保持 unverified。'
    }
  }
  if (separation > MAX_DUAL_VERIFICATION_DISTANCE_METERS) {
    return {
      stage: 'replacement',
      title: `与首条候选相距 ${separation.toFixed(1)} m`,
      description: `超过 ${MAX_DUAL_VERIFICATION_DISTANCE_METERS} m 阈值，批准后会替代旧候选，不会完成双重核验。`
    }
  }

  return {
    stage: 'possible-dual',
    title: `与首条候选相距 ${separation.toFixed(1)} m`,
    description: `角色和距离已匹配；服务端还会核对采集独立性。同方法须至少间隔 ${MIN_SAME_METHOD_OBSERVATION_INTERVAL_MS / 60_000} 分钟，且至少一条来自浏览器定位或授权导入，全部满足后才升级为 verified。`
  }
}
