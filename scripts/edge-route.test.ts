import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEdgeUrl,
  chooseEdgeHost,
  EDGE_PROBE_TIMEOUT_MS,
  EDGE_ROUTE_HOSTS,
  shouldProbeEdgeRoute
} from '../app/utils/edge-route'
import { EDGE_ROUTE_BOOTSTRAP_SCRIPT } from '../app/utils/edge-route-bootstrap'

test('edge routing treats all three public hosts as peers', () => {
  assert.deepEqual(EDGE_ROUTE_HOSTS, [
    'yeu.huiliyill.cn',
    'cn.yeu.huiliyill.cn',
    'global.yeu.huiliyill.cn'
  ])
  assert.ok(EDGE_PROBE_TIMEOUT_MS <= 700)
})

test('edge routing prefers the only reachable host', () => {
  assert.equal(chooseEdgeHost('yeu.huiliyill.cn', [
    { host: 'cn.yeu.huiliyill.cn', reachable: true, durationMs: 180 },
    { host: 'global.yeu.huiliyill.cn', reachable: false, durationMs: Number.POSITIVE_INFINITY }
  ]), 'cn.yeu.huiliyill.cn')
})

test('edge routing chooses the faster reachable target', () => {
  assert.equal(chooseEdgeHost('yeu.huiliyill.cn', [
    { host: 'cn.yeu.huiliyill.cn', reachable: true, durationMs: 300 },
    { host: 'global.yeu.huiliyill.cn', reachable: true, durationMs: 900 }
  ]), 'cn.yeu.huiliyill.cn')

  assert.equal(chooseEdgeHost('yeu.huiliyill.cn', [
    { host: 'cn.yeu.huiliyill.cn', reachable: true, durationMs: 500 },
    { host: 'global.yeu.huiliyill.cn', reachable: true, durationMs: 350 }
  ]), 'global.yeu.huiliyill.cn')
})

test('edge routing can move between any of the three hosts', () => {
  assert.equal(chooseEdgeHost('cn.yeu.huiliyill.cn', [
    { host: 'yeu.huiliyill.cn', reachable: true, durationMs: 90 },
    { host: 'cn.yeu.huiliyill.cn', reachable: true, durationMs: 240 },
    { host: 'global.yeu.huiliyill.cn', reachable: true, durationMs: 180 }
  ]), 'yeu.huiliyill.cn')
})

test('edge routing keeps the entry host when both targets fail', () => {
  assert.equal(chooseEdgeHost('yeu.huiliyill.cn', [
    { host: 'cn.yeu.huiliyill.cn', reachable: false, durationMs: Number.POSITIVE_INFINITY },
    { host: 'global.yeu.huiliyill.cn', reachable: false, durationMs: Number.POSITIVE_INFINITY }
  ]), 'yeu.huiliyill.cn')
})

test('edge routing preserves path, query and hash', () => {
  assert.equal(
    buildEdgeUrl('cn.yeu.huiliyill.cn', new URL('http://yeu.huiliyill.cn/map?q=library#place')),
    'https://cn.yeu.huiliyill.cn/map?q=library#place'
  )

  assert.equal(
    buildEdgeUrl('global.yeu.huiliyill.cn', new URL('https://yeu.huiliyill.cn/search?q=network#answer')),
    'https://global.yeu.huiliyill.cn/search?q=network#answer'
  )
})

test('edge routing avoids stateful pages', () => {
  assert.equal(shouldProbeEdgeRoute('/'), true)
  assert.equal(shouldProbeEdgeRoute('/map'), true)
  assert.equal(shouldProbeEdgeRoute('/chat'), false)
  assert.equal(shouldProbeEdgeRoute('/admin/users'), false)
  assert.equal(shouldProbeEdgeRoute('/feedback'), false)
})

test('edge bootstrap runs before hydration and guards redirect loops', () => {
  assert.match(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /window\.__YEU_EDGE_ROUTED__ = true/)
  assert.match(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /_yeu_edge_routed/)
  assert.match(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /Max-Age=180/)
  assert.match(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /Domain=\.huiliyill\.cn/)
  assert.match(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /Promise\.all\(hosts\.map\(probe\)\)/)
})
