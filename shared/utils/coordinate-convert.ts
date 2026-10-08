/**
 * 坐标系换算：Web（高德）与小程序（微信原生 map/openLocation）共用。
 * 数据库与核验坐标统一存 WGS84；高德与微信地图都要求 GCJ-02，
 * 直接传 WGS84 会产生约 450m 的系统性偏移。
 */

export interface LngLat {
  longitude: number
  latitude: number
}

const GCJ_A = 6_378_245
const GCJ_EE = 0.006693421622965943

function outOfChina(longitude: number, latitude: number): boolean {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271
}

function transformLatitude(x: number, y: number): number {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3
  ret += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3
  ret += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3
  return ret
}

function transformLongitude(x: number, y: number): number {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3
  ret += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3
  ret += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3
  return ret
}

function offset(longitude: number, latitude: number): { dLongitude: number, dLatitude: number } {
  let dLatitude = transformLatitude(longitude - 105, latitude - 35)
  let dLongitude = transformLongitude(longitude - 105, latitude - 35)
  const radLatitude = latitude / 180 * Math.PI
  let magic = Math.sin(radLatitude)
  magic = 1 - GCJ_EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLatitude = (dLatitude * 180) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI)
  dLongitude = (dLongitude * 180) / (GCJ_A / sqrtMagic * Math.cos(radLatitude) * Math.PI)
  return { dLongitude, dLatitude }
}

/** WGS84 → GCJ-02（高德 / 微信地图使用的火星坐标）。 */
export function wgs84ToGcj02(longitude: number, latitude: number): LngLat {
  if (outOfChina(longitude, latitude)) return { longitude, latitude }
  const { dLongitude, dLatitude } = offset(longitude, latitude)
  return { longitude: longitude + dLongitude, latitude: latitude + dLatitude }
}

/** GCJ-02 → WGS84（迭代逼近，用于把地图取点写回 WGS84 库）。 */
export function gcj02ToWgs84(longitude: number, latitude: number): LngLat {
  if (outOfChina(longitude, latitude)) return { longitude, latitude }
  let result: LngLat = { longitude, latitude }
  for (let i = 0; i < 6; i += 1) {
    const forward = wgs84ToGcj02(result.longitude, result.latitude)
    result = {
      longitude: result.longitude + (longitude - forward.longitude),
      latitude: result.latitude + (latitude - forward.latitude)
    }
  }
  return result
}

/**
 * 按来源坐标系归一化成地图需要的 GCJ-02。
 * 未标注或无坐标时按原值返回，避免把合法数据改坏。
 */
export function toMapCoordinate(
  longitude: number | null | undefined,
  latitude: number | null | undefined,
  coordinateSystem: string | null | undefined
): LngLat | null {
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  if (coordinateSystem === 'GCJ-02' || coordinateSystem === 'BD09') return { longitude, latitude }
  return wgs84ToGcj02(longitude, latitude)
}
