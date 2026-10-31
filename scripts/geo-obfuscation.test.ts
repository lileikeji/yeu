import assert from 'node:assert/strict'
import test from 'node:test'
import { decodePlacePoint, encodePlacePoint } from '../shared/utils/geo-obfuscation'

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef'

test('encode/decode round-trips coordinates with full float precision', () => {
  const samples: Array<[number, number]> = [
    [118.605142, 25.106331],
    [118.59973890906161, 25.103396572681646],
    [116.3974567, 39.9091873],
    [-73.9857123456789, 40.74844012345678]
  ]
  for (const [longitude, latitude] of samples) {
    for (const coordinateSystem of ['WGS84', 'GCJ-02', 'BD-09'] as const) {
      const encoded = encodePlacePoint({ longitude, latitude, coordinateSystem }, KEY)
      assert.ok(encoded?.startsWith('v1:'))
      assert.equal(encoded!.length, 'v1:'.length + 34)
      assert.deepEqual(decodePlacePoint(encoded, KEY), { longitude, latitude, coordinateSystem })
    }
  }
})

test('encode output hides the plaintext values and varies with the key', () => {
  const a = encodePlacePoint({ longitude: 118.605142, latitude: 25.106331, coordinateSystem: 'WGS84' }, KEY)
  const b = encodePlacePoint({ longitude: 118.605142, latitude: 25.106331, coordinateSystem: 'WGS84' }, 'ff'.repeat(24))
  assert.ok(a && b && a !== b)
  const serialized = JSON.stringify({ longitude: 118.605142, latitude: 25.106331 })
  assert.equal(serialized.includes(a!), false)
  assert.doesNotMatch(a!.slice(3), /118|25\./)
})

test('nullish or invalid inputs fail closed to null', () => {
  assert.equal(encodePlacePoint({ longitude: 118.6, latitude: 25.1, coordinateSystem: 'WGS84' }, ''), null)
  assert.equal(encodePlacePoint({ longitude: 118.6, latitude: 25.1, coordinateSystem: 'WGS84' }, 'nothex'), null)
  assert.equal(encodePlacePoint({ longitude: Number.NaN, latitude: 25.1, coordinateSystem: 'WGS84' }, KEY), null)
  assert.equal(encodePlacePoint({ longitude: 118.6, latitude: 25.1, coordinateSystem: 'MARS' as never }, KEY), null)

  assert.equal(decodePlacePoint(null, KEY), null)
  assert.equal(decodePlacePoint('', KEY), null)
  assert.equal(decodePlacePoint('v2:deadbeef', KEY), null)
  assert.equal(decodePlacePoint('v1:short', KEY), null)
  assert.equal(decodePlacePoint('v1:zz'.padEnd(37, '0'), KEY), null)
})

test('decoding with a wrong key never throws and yields finite values at most', () => {
  const encoded = encodePlacePoint({ longitude: 118.605142, latitude: 25.106331, coordinateSystem: 'WGS84' }, KEY)
  for (const wrongKey of ['00'.repeat(24), 'ff'.repeat(24), 'deadbeef'.repeat(6)]) {
    const decoded = decodePlacePoint(encoded, wrongKey)
    if (decoded) {
      assert.ok(Number.isFinite(decoded.longitude) && Number.isFinite(decoded.latitude))
    }
  }
})
