import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { gcj02ToWgs84, toMapCoordinate, wgs84ToGcj02 } from '../shared/utils/coordinate-convert'
import { decodePlacePoint, encodePlacePoint } from '../shared/utils/geo-obfuscation'

function approximateMeters(
  a: { longitude: number, latitude: number },
  b: { longitude: number, latitude: number }
): number {
  const dLat = (a.latitude - b.latitude) * 111_320
  const dLng = (a.longitude - b.longitude) * 111_320 * Math.cos(a.latitude / 180 * Math.PI)
  return Math.hypot(dLat, dLng)
}

const VALID_CRS = ['WGS84', 'GCJ-02', 'BD-09'] as const

const hexKeyArb = fc
  .uint8Array({ minLength: 1, maxLength: 32 })
  .map(bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''))

test('性质 1：中国境内连续域坐标 WGS84↔GCJ-02 偏移有界且往返毫米级可逆，闽南业务域恒发生有效偏移', () => {
  fc.assert(
    fc.property(
      fc.double({ min: 73.5, max: 135.5, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 3.0, max: 53.5, noNaN: true, noDefaultInfinity: true }),
      (longitude, latitude) => {
        const wgs = { longitude, latitude }
        const gcj = wgs84ToGcj02(longitude, latitude)
        assert.ok(Number.isFinite(gcj.longitude) && Number.isFinite(gcj.latitude))
        const offsetMeters = approximateMeters(wgs, gcj)
        assert.ok(
          offsetMeters >= 0 && offsetMeters < 1000,
          `unexpected GCJ-02 offset ${offsetMeters}m at (${longitude}, ${latitude})`
        )
        const back = gcj02ToWgs84(gcj.longitude, gcj.latitude)
        const errorMeters = approximateMeters(wgs, back)
        assert.ok(
          errorMeters < 0.01,
          `round-trip drift ${errorMeters}m exceeded 0.01m at (${longitude}, ${latitude})`
        )
      }
    ),
    { numRuns: 500 }
  )

  fc.assert(
    fc.property(
      fc.double({ min: 117.0, max: 120.0, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: 24.0, max: 27.0, noNaN: true, noDefaultInfinity: true }),
      (longitude, latitude) => {
        const wgs = { longitude, latitude }
        const gcj = wgs84ToGcj02(longitude, latitude)
        const offsetMeters = approximateMeters(wgs, gcj)
        assert.ok(
          offsetMeters > 250 && offsetMeters < 650,
          `unexpected Fujian GCJ-02 offset ${offsetMeters}m at (${longitude}, ${latitude})`
        )
      }
    ),
    { numRuns: 200 }
  )
})

test('性质 2：中国境外有限坐标为 wgs84ToGcj02 与 gcj02ToWgs84 的精确不动点', () => {
  fc.assert(
    fc.property(
      fc.double({ min: -180, max: 71, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -89, max: 89, noNaN: true, noDefaultInfinity: true }),
      (longitude, latitude) => {
        assert.deepStrictEqual(wgs84ToGcj02(longitude, latitude), { longitude, latitude })
        assert.deepStrictEqual(gcj02ToWgs84(longitude, latitude), { longitude, latitude })
      }
    ),
    { numRuns: 200 }
  )
})

test('性质 3：toMapCoordinate 对任意非有限数值或空值经纬度恒返回 null', () => {
  const nonFiniteArb = fc.constantFrom<number | null | undefined>(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    null,
    undefined
  )
  const validCoordArb = fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true })
  const badPairArb = fc.oneof(
    fc.tuple(nonFiniteArb, fc.oneof(nonFiniteArb, validCoordArb)),
    fc.tuple(fc.oneof(nonFiniteArb, validCoordArb), nonFiniteArb)
  )

  fc.assert(
    fc.property(
      badPairArb,
      fc.option(fc.string(), { nil: undefined }),
      ([longitude, latitude], crs) => {
        assert.equal(toMapCoordinate(longitude, latitude, crs), null)
      }
    ),
    { numRuns: 200 }
  )
})

test('性质 4：encodePlacePoint / decodePlacePoint 满足 IEEE-754 位级无损双射', () => {
  fc.assert(
    fc.property(
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom(...VALID_CRS),
      hexKeyArb,
      (longitude, latitude, coordinateSystem, keyHex) => {
        const encoded = encodePlacePoint({ longitude, latitude, coordinateSystem }, keyHex)
        assert.equal(typeof encoded, 'string')
        assert.ok(encoded!.startsWith('v1:'))

        const decoded = decodePlacePoint(encoded, keyHex)
        assert.ok(decoded !== null)
        assert.ok(Object.is(decoded.longitude, longitude))
        assert.ok(Object.is(decoded.latitude, latitude))
        assert.equal(decoded.coordinateSystem, coordinateSystem)
      }
    ),
    { numRuns: 200 }
  )
})

test('性质 5：decodePlacePoint 对任意随机密文与密钥永不抛异常且输出 fail-closed', () => {
  fc.assert(
    fc.property(
      fc.option(fc.string(), { nil: undefined }),
      fc.option(fc.string(), { nil: undefined }),
      (encoded, keyHex) => {
        const decoded = decodePlacePoint(encoded, keyHex)
        if (decoded !== null) {
          assert.ok(Number.isFinite(decoded.longitude))
          assert.ok(Number.isFinite(decoded.latitude))
          assert.ok(VALID_CRS.includes(decoded.coordinateSystem))
        }
      }
    ),
    { numRuns: 200 }
  )
})
