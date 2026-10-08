import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fetchAmapWalkingRoute,
  parseAmapPolyline,
  parseAmapWalkingResponse
} from '../server/modules/directions/amap'
import { formatDistanceLabel, formatDurationLabel, formatRouteSummary } from '../shared/utils/route-presentation'

const ORIGIN = { label: '我的位置', longitude: 118.6051, latitude: 25.1121 }
const DESTINATION = { label: '仰恩大学图书馆', slug: 'library', longitude: 118.6062, latitude: 25.1134 }

function walkingPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    status: '1',
    info: 'OK',
    route: {
      origin: '118.6051,25.1121',
      destination: '118.6062,25.1134',
      paths: [{
        distance: '480',
        duration: '390',
        steps: [
          { instruction: '向东步行 200 米', distance: '200', duration: '160', polyline: '118.6051,25.1121;118.6058,25.1122' },
          { instruction: '右转进入图书馆路', distance: '280', duration: '230', polyline: '118.6058,25.1122;118.6062,25.1134' }
        ]
      }]
    },
    ...overrides
  }
}

test('walking route request reaches the AMap walking endpoint with GCJ-02 order preserved', async () => {
  let requestedUrl = ''
  const route = await fetchAmapWalkingRoute('secret-key', ORIGIN, DESTINATION, {
    fetcher: async (input) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify(walkingPayload()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  })

  const url = new URL(requestedUrl)
  assert.equal(url.origin, 'https://restapi.amap.com')
  assert.equal(url.pathname, '/v3/direction/walking')
  assert.equal(url.searchParams.get('key'), 'secret-key')
  assert.equal(url.searchParams.get('origin'), '118.6051,25.1121')
  assert.equal(url.searchParams.get('destination'), '118.6062,25.1134')
  assert.equal(route.distanceMeters, 480)
  assert.equal(route.durationSeconds, 390)
})

test('walking route steps are summarised and the polyline is stitched in travel order', () => {
  const route = parseAmapWalkingResponse(walkingPayload(), ORIGIN, DESTINATION)

  assert.equal(route.provider, 'amap')
  assert.equal(route.coordinateSystem, 'GCJ-02')
  assert.equal(route.destination.slug, 'library')
  assert.deepEqual(route.steps, [
    { instruction: '向东步行 200 米', distanceMeters: 200, durationSeconds: 160 },
    { instruction: '右转进入图书馆路', distanceMeters: 280, durationSeconds: 230 }
  ])
  // 两段折线拼接后共享的中间点要去重，否则会出现零长度线段。
  assert.deepEqual(route.polyline, [
    { longitude: 118.6051, latitude: 25.1121 },
    { longitude: 118.6058, latitude: 25.1122 },
    { longitude: 118.6062, latitude: 25.1134 }
  ])
})

test('walking route falls back to an estimated duration when AMap omits it', () => {
  const payload = walkingPayload() as { route: { paths: Array<Record<string, unknown>> } }
  delete payload.route.paths[0]!.duration
  const route = parseAmapWalkingResponse(payload, ORIGIN, DESTINATION)
  // 480m / 1.2m·s⁻¹ = 400s，走查兜底而不是把时长显示成 0。
  assert.equal(route.durationSeconds, 400)
})

test('walking route rejects provider errors and empty paths', () => {
  assert.throws(
    () => parseAmapWalkingResponse({ status: '0', info: 'INVALID_USER_KEY' }, ORIGIN, DESTINATION),
    /INVALID_USER_KEY/
  )
  assert.throws(
    () => parseAmapWalkingResponse({ status: '1', route: { paths: [] } }, ORIGIN, DESTINATION),
    /no usable route/
  )
  assert.throws(
    () => parseAmapWalkingResponse({ status: '1', route: { paths: [{ distance: '0', steps: [] }] } }, ORIGIN, DESTINATION),
    /no usable route/
  )
})

test('polyline parsing drops malformed and out-of-range points', () => {
  assert.deepEqual(parseAmapPolyline('118.6,25.1;;oops;118.7,25.2'), [
    { longitude: 118.6, latitude: 25.1 },
    { longitude: 118.7, latitude: 25.2 }
  ])
  assert.deepEqual(parseAmapPolyline('999,25.1;118.6,188'), [])
  assert.deepEqual(parseAmapPolyline(''), [])
})

test('polyline parsing collapses consecutive duplicates', () => {
  assert.deepEqual(parseAmapPolyline('118.6,25.1;118.6,25.1;118.7,25.2'), [
    { longitude: 118.6, latitude: 25.1 },
    { longitude: 118.7, latitude: 25.2 }
  ])
})

test('route presentation formats distance and duration for students', () => {
  assert.equal(formatDistanceLabel(480), '480 米')
  assert.equal(formatDistanceLabel(1_240), '1.2 公里')
  assert.equal(formatDistanceLabel(12_500), '13 公里')
  assert.equal(formatDurationLabel(390), '7 分钟')
  assert.equal(formatDurationLabel(3_900), '1 小时 5 分钟')
  assert.equal(formatRouteSummary(480, 390), '约 480 米 · 步行 7 分钟')
  assert.equal(formatDistanceLabel(null), '')
  assert.equal(formatRouteSummary(undefined, undefined), '')
})
