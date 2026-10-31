import type { CoordinateReferenceSystem } from '../types'

/**
 * 公共出口坐标混淆（方案：构建期随机 key + 可轮换 scheme）。
 *
 * 目标是抬高批量抓取门槛：SSR payload 与公共 API JSON 里不再出现明文
 * longitude/latitude，前端在画点/导航前用同一 key 解码。key 随构建嵌入
 * server/client 两端 bundle，防的是"正则抓 HTML/API"，不防逆向 JS 的执行者。
 *
 * 编码格式 v1：经纬度按 IEEE-754 Float64 大端各 8 字节（保留原始精度，无舍入）
 * + 坐标系 1 字节，与 key 循环 XOR 后输出 hex（34 字符）。
 */

const VERSION_PREFIX = 'v1:'

const CRS_TO_CODE: Record<CoordinateReferenceSystem, number> = {
  'WGS84': 0,
  'GCJ-02': 1,
  'BD-09': 2
}

const CRS_BY_CODE: CoordinateReferenceSystem[] = ['WGS84', 'GCJ-02', 'BD-09']

const BYTE_LENGTH = 17

function keyBytes(keyHex: string): number[] | null {
  if (typeof keyHex !== 'string') return null
  const normalized = keyHex.trim().toLowerCase().replace(/[^0-9a-f]/g, '')
  if (normalized.length < 2) return null
  const bytes: number[] = []
  for (let i = 0; i + 1 < normalized.length; i += 2) {
    bytes.push(Number.parseInt(normalized.slice(i, i + 2), 16))
  }
  return bytes.length ? bytes : null
}

function float64ToBytes(value: number): number[] {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, value)
  return Array.from(new Uint8Array(view.buffer))
}

function bytesToFloat64(bytes: number[]): number {
  const view = new DataView(new ArrayBuffer(8))
  for (let i = 0; i < 8; i += 1) view.setUint8(i, bytes[i]!)
  return view.getFloat64(0)
}

function xorToHex(bytes: number[], key: number[]): string {
  const out: string[] = []
  for (let i = 0; i < bytes.length; i += 1) {
    out.push(((bytes[i]! ^ key[i % key.length]!) & 0xff).toString(16).padStart(2, '0'))
  }
  return out.join('')
}

export interface PlacePointValue {
  longitude: number
  latitude: number
  coordinateSystem: CoordinateReferenceSystem
}

/**
 * 解析坐标混淆 key：显式传入优先（测试/脚本注入），否则回落到构建期注入的
 * __GEO_CIPHER_KEY__ 常量。node:test 等无 vite define 的环境下 typeof 探测
 * 安全返回 null（fail-closed，不影响纯文本断言类测试）。
 */
export function resolveGeoCipherKey(explicit?: string | null): string | null {
  if (typeof explicit === 'string' && explicit) return explicit
  return typeof __GEO_CIPHER_KEY__ === 'string' && __GEO_CIPHER_KEY__ ? __GEO_CIPHER_KEY__ : null
}

export function encodePlacePoint(
  input: PlacePointValue,
  keyHex: string | null | undefined
): string | null {
  const key = keyBytes(keyHex ?? '')
  if (!key) return null
  if (!Number.isFinite(input.longitude) || !Number.isFinite(input.latitude)) return null
  const crsCode = CRS_TO_CODE[input.coordinateSystem]
  if (crsCode === undefined) return null

  const bytes = [
    ...float64ToBytes(input.longitude),
    ...float64ToBytes(input.latitude),
    crsCode
  ]
  return VERSION_PREFIX + xorToHex(bytes, key)
}

export function decodePlacePoint(
  encoded: string | null | undefined,
  keyHex: string | null | undefined
): PlacePointValue | null {
  const key = keyBytes(keyHex ?? '')
  if (!key || typeof encoded !== 'string') return null
  if (!encoded.startsWith(VERSION_PREFIX)) return null
  const hex = encoded.slice(VERSION_PREFIX.length)
  if (hex.length !== BYTE_LENGTH * 2) return null

  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16)
    if (Number.isNaN(byte)) return null
    bytes.push(byte ^ key[(i / 2) % key.length]!)
  }

  const crs = CRS_BY_CODE[bytes[16]!]
  if (!crs) return null
  const longitude = bytesToFloat64(bytes.slice(0, 8))
  const latitude = bytesToFloat64(bytes.slice(8, 16))
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return { longitude, latitude, coordinateSystem: crs }
}
