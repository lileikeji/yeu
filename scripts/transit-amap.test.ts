import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  fetchAmapTransitPlan,
  isTransitPointId,
  parseAmapTransitResponse,
  transitPoints
} from '../server/modules/transit/amap'

test('AMap request uses fixed server-side points without exposing arbitrary coordinates', async () => {
  let requestedUrl = ''
  const response = await fetchAmapTransitPlan('secret-key', 'quanzhou-station', 'campus', {
    fetcher: async (input) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({
        status: '1',
        route: {
          transits: [{
            duration: '4555',
            cost: '2',
            walking_distance: '305',
            segments: [{
              bus: {
                buslines: [{
                  name: 'K6 路',
                  departure_stop: { name: '福厦铁路泉州站' },
                  arrival_stop: { name: '仰恩大学第三校区' },
                  start_time: '0720',
                  end_time: '1810',
                  via_num: '18'
                }]
              }
            }]
          }]
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })

  const url = new URL(requestedUrl)
  assert.equal(url.origin, 'https://restapi.amap.com')
  assert.equal(url.searchParams.get('key'), 'secret-key')
  assert.equal(url.searchParams.get('origin'), '118.567400,24.972310')
  assert.equal(url.searchParams.get('destination'), '118.602248,25.107339')
  assert.equal(response.plans[0]?.segments[0]?.name, 'K6 路')
})

test('AMap transit payload is reduced to safe public route data', () => {
  const response = parseAmapTransitResponse({
    status: '1',
    route: {
      transits: [{
        duration: '4555',
        cost: '2.0',
        walking_distance: '305',
        segments: [{
          bus: {
            buslines: [{
              name: 'K6路(福厦铁路泉州站--仰恩大学第三校区)',
              departure_stop: { name: '福厦铁路泉州站' },
              arrival_stop: { name: '仰恩大学第三校区' },
              start_time: '0720',
              end_time: '1810',
              via_num: '18'
            }]
          }
        }]
      }]
    }
  }, 'quanzhou-station', 'campus', '2026-07-26T10:00:00.000Z')

  assert.equal(response.provider, 'amap')
  assert.equal(response.vehiclePositionsAvailable, false)
  assert.equal(response.plans[0]?.durationMinutes, 76)
  assert.equal(response.plans[0]?.fareYuan, 2)
  assert.equal(response.plans[0]?.segments[0]?.startTime, '07:20')
  assert.equal(response.plans[0]?.segments[0]?.endTime, '18:10')
  assert.equal(response.plans[0]?.segments[0]?.viaStops, 18)
})

test('parallel bus lines for one leg are presented as alternatives, not fake transfers', () => {
  const response = parseAmapTransitResponse({
    status: '1',
    route: {
      transits: [{
        duration: '600',
        walking_distance: '80',
        segments: [{
          bus: {
            buslines: [
              {
                name: '55路',
                departure_stop: { name: '西湖小区' },
                arrival_stop: { name: '泉州一院城东分院' }
              },
              {
                name: '26路',
                departure_stop: { name: '西湖小区' },
                arrival_stop: { name: '泉州一院城东分院' }
              }
            ]
          }
        }]
      }]
    }
  }, 'campus', 'guide:old-city-walk:kaiyuan-temple')

  assert.deepEqual(response.plans[0]?.segments.map(segment => segment.name), ['55路'])
})

test('transit API accepts fixed campus and vetted guide points, not arbitrary coordinates', () => {
  assert.equal(isTransitPointId('campus'), true)
  assert.equal(isTransitPointId('quanzhou-east'), true)
  assert.equal(isTransitPointId('guide:old-city-walk:kaiyuan-temple'), true)
  assert.equal(isTransitPointId('118.1,25.1'), false)
  assert.equal(transitPoints.campus.location, '118.602248,25.107339')
  assert.equal(transitPoints['guide:old-city-walk:kaiyuan-temple']?.location, '118.585519,24.914168')

  const routeSource = readFileSync(resolve('server/api/public/transit/plan.get.ts'), 'utf8')
  assert.match(routeSource, /assertRateLimit/)
  assert.match(routeSource, /AMAP_WEB_SERVICE_KEY/)
  assert.match(routeSource, /s-maxage=0/)
  assert.match(routeSource, /CDN-Cache-Control.*no-store/)
  assert.doesNotMatch(routeSource, /query\.key/)
})

test('AMap service errors and empty routes fail closed', () => {
  assert.throws(
    () => parseAmapTransitResponse({ status: '0', info: 'INVALID_USER_KEY' }, 'campus', 'quanzhou-station'),
    /INVALID_USER_KEY/
  )
  assert.throws(
    () => parseAmapTransitResponse({ status: '1', route: { transits: [] } }, 'campus', 'quanzhou-station'),
    /no usable transit plan/
  )
})
