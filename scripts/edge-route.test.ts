import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEdgeUrl,
  chooseEdgeHost,
  shouldProbeEdgeRoute
} from '../app/utils/edge-route'

test('edge routing prefers the only reachable host', () => {
  assert.equal(chooseEdgeHost('yeu.huiliyill.cn', [
    { host: 'yeu.huiliyill.cn', reachable: false, durationMs: Number.POSITIVE_INFINITY },
    { host: 'cn.yeu.huiliyill.cn', reachable: true, durationMs: 180 }
  ]), 'cn.yeu.huiliyill.cn')
})

test('edge routing switches only for a meaningful speed advantage', () => {
  assert.equal(chooseEdgeHost('yeu.huiliyill.cn', [
    { host: 'yeu.huiliyill.cn', reachable: true, durationMs: 900 },
    { host: 'cn.yeu.huiliyill.cn', reachable: true, durationMs: 300 }
  ]), 'cn.yeu.huiliyill.cn')

  assert.equal(chooseEdgeHost('yeu.huiliyill.cn', [
    { host: 'yeu.huiliyill.cn', reachable: true, durationMs: 500 },
    { host: 'cn.yeu.huiliyill.cn', reachable: true, durationMs: 350 }
  ]), 'yeu.huiliyill.cn')
})

test('edge routing preserves path, query and hash', () => {
  assert.equal(
    buildEdgeUrl('cn.yeu.huiliyill.cn', new URL('http://yeu.huiliyill.cn/map?q=library#place')),
    'https://cn.yeu.huiliyill.cn/map?q=library#place'
  )
})

test('edge routing avoids stateful pages', () => {
  assert.equal(shouldProbeEdgeRoute('/'), true)
  assert.equal(shouldProbeEdgeRoute('/map'), true)
  assert.equal(shouldProbeEdgeRoute('/chat'), false)
  assert.equal(shouldProbeEdgeRoute('/admin/users'), false)
  assert.equal(shouldProbeEdgeRoute('/feedback'), false)
})
