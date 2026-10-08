import assert from 'node:assert/strict'
import test from 'node:test'
import { gcj02ToWgs84, toMapCoordinate, wgs84ToGcj02 } from '../shared/utils/coordinate-convert'

/** 1 度纬度 ≈ 111320m；经度按纬度收缩。用来判断偏移量级是否合理。 */
function approximateMeters(a: { longitude: number, latitude: number }, b: { longitude: number, latitude: number }): number {
  const dLat = (a.latitude - b.latitude) * 111_320
  const dLng = (a.longitude - b.longitude) * 111_320 * Math.cos(a.latitude / 180 * Math.PI)
  return Math.hypot(dLat, dLng)
}

test('wgs84 to gcj02 shifts campus coordinates by roughly 400-600m', () => {
  const wgs = { longitude: 118.60513135, latitude: 25.11207855 }
  const gcj = wgs84ToGcj02(wgs.longitude, wgs.latitude)
  // 中国境内 WGS84→GCJ-02 的典型偏移量级；明显偏小说明没转换，明显偏大说明算错。
  const distance = approximateMeters(wgs, gcj)
  assert.ok(distance > 300 && distance < 800, `unexpected offset ${Math.round(distance)}m`)
  assert.notDeepEqual(gcj, wgs)
})

test('gcj02 round trip returns to the original wgs84 within a meter', () => {
  const wgs = { longitude: 118.60513135, latitude: 25.11207855 }
  const gcj = wgs84ToGcj02(wgs.longitude, wgs.latitude)
  const back = gcj02ToWgs84(gcj.longitude, gcj.latitude)
  assert.ok(approximateMeters(wgs, back) < 1, 'round trip should be sub-meter')
})

test('coordinates outside china are returned untouched', () => {
  const tokyo = { longitude: 139.7671, latitude: 35.6812 }
  const converted = wgs84ToGcj02(tokyo.longitude, tokyo.latitude)
  assert.deepEqual(converted, tokyo)
})

test('toMapCoordinate converts wgs84 but leaves gcj02 and missing values alone', () => {
  const converted = toMapCoordinate(118.60513135, 25.11207855, 'WGS84')
  assert.ok(converted)
  assert.notEqual(converted.longitude, 118.60513135)

  const alreadyGcj = toMapCoordinate(118.6101, 25.1163, 'GCJ-02')
  assert.deepEqual(alreadyGcj, { longitude: 118.6101, latitude: 25.1163 })

  assert.equal(toMapCoordinate(null, 25.1, 'WGS84'), null)
  assert.equal(toMapCoordinate(Number.NaN, 25.1, 'WGS84'), null)
})
