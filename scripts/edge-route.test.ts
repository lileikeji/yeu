import assert from 'node:assert/strict'
import test from 'node:test'
import { EDGE_ROUTE_HOSTS } from '../app/utils/edge-route'
import { EDGE_ROUTE_BOOTSTRAP_SCRIPT } from '../app/utils/edge-route-bootstrap'

test('all three public CDN hosts are recognized as stable entry points', () => {
  assert.deepEqual(EDGE_ROUTE_HOSTS, [
    'yeu.huiliyill.cn',
    'cn.yeu.huiliyill.cn',
    'global.yeu.huiliyill.cn'
  ])
})

test('edge bootstrap keeps each CDN hostname as a stable entry point', () => {
  assert.match(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /window\.__YEU_EDGE_ROUTED__ = true/)
  assert.match(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /_yeu_edge_routed/)
  assert.match(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /yeu_fast_edge=; Max-Age=0/)
  assert.match(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /Domain=\.huiliyill\.cn/)
  assert.doesNotMatch(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /location\.replace/)
  assert.doesNotMatch(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /Promise\.all\(hosts\.map\(probe\)\)/)
  assert.doesNotMatch(EDGE_ROUTE_BOOTSTRAP_SCRIPT, /mode:\s*'no-cors'/)
})
