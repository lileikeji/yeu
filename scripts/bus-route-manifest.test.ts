import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { resolve } from 'node:path'

// 线路几何是人工核过的：冻结形状 102/105 点、人工补点三段。
// 这个测试挡住"改了点却没重新生成 manifest"的静默漂移。
test('bus route geometry matches its manifest', () => {
  const script = resolve(import.meta.dirname, 'bus-route-manifest.mjs')
  const out = execFileSync(process.execPath, [script, 'verify'], { encoding: 'utf8' })
  assert.match(out, /bus route manifest ok/)
})
