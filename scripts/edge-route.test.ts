import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEdgeUrl,
  chooseEdgeHost,
  shouldProbeEdgeRoute
} from '../app/utils/edge-route'

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
