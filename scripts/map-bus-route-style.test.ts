import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

// T-028 W1：校车线路描边从「5px / 0.75」收到「4px / 0.6」，双色改暖橙 + 深青，
// 并把 #ea580c / #0d9488 两枚旧静态色从 app/ 与 map/ 清干净。
// 手机走 amap、离线兜底走 svg，paint 收细必须三家都落到，否则真机看不到。
const maplibreSource = readFileSync(resolve('map/providers/maplibre/provider.ts'), 'utf8')
const amapSource = readFileSync(resolve('map/providers/amap/provider.ts'), 'utf8')
const offlineSource = readFileSync(resolve('map/providers/offline/provider.ts'), 'utf8')
const markerSource = readFileSync(resolve('map/providers/amap/marker-icons.ts'), 'utf8')
const positionsSource = readFileSync(resolve('app/composables/useMapBusPositions.ts'), 'utf8')

function paintWindow(source: string, layerId: string): string {
  const at = source.indexOf(`id: ${layerId},`)
  assert.ok(at >= 0, `找不到图层 ${layerId}`)
  return source.slice(at, at + 400)
}

function around(source: string, needle: string, span = 300): string {
  const at = source.indexOf(needle)
  assert.ok(at >= 0, `找不到 ${needle}`)
  return source.slice(Math.max(0, at - span), at + span)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else if (/\.(ts|vue|css)$/.test(entry.name)) out.push(path)
  }
  return out
}

test('校车线路描边收成 4px / 0.6，校外公交线保持 5px / 0.9 不动', () => {
  const busWindow = paintWindow(maplibreSource, 'BUS_ROUTE_LINES_LAYER_ID')
  assert.match(busWindow, /'line-width': 4,/)
  assert.match(busWindow, /'line-opacity': 0\.6/)
  const transitWindow = paintWindow(maplibreSource, 'TRANSIT_ROUTE_LINES_LAYER_ID')
  assert.match(transitWindow, /'line-width': 5,/)
  assert.match(transitWindow, /'line-opacity': 0\.9/)
})

test('手机端 amap 校车线同步收成 4px / 0.6', () => {
  const busWindow = around(amapSource, 'zIndex: 800')
  assert.match(busWindow, /strokeWeight: 4,/)
  assert.match(busWindow, /strokeOpacity: 0\.6,/)
})

test('离线兜底 svg 校车线也补 stroke-opacity 0.6', () => {
  const busLine = around(offlineSource, 'busLine.setAttribute(\'stroke-width\'', 200)
  assert.match(busLine, /busLine\.setAttribute\('stroke-opacity', '0\.6'\)/)
})

test('三个 provider 的双色常量都是暖橙 #c2410c + 深青 #0f766e', () => {
  for (const source of [maplibreSource, amapSource, offlineSource])
    assert.ok(source.includes('const BUS_ROUTE_COLORS = [\'#c2410c\', \'#0f766e\'] as const'))
  assert.ok(positionsSource.includes('export const BUS_ROUTE_COLORS = [\'#c2410c\', \'#0f766e\'] as const'))
})

test('零散落点同步新色：车标默认色与离线线路底色不再用旧橙', () => {
  assert.match(markerSource, /const color = options\.color \?\? '#c2410c'/)
  assert.ok(offlineSource.includes('\'background:#c2410c\','))
  assert.match(maplibreSource, /'circle-color': \['case', \['==', \['get', 'dir'\], 1\], BUS_ROUTE_COLORS\[1\], BUS_ROUTE_COLORS\[0\]\],/)
})

test('dev 预览的校车也画 amap 同款车模型：symbol 图层 + icon-rotate 跟随 angleDeg', () => {
  assert.match(maplibreSource, /import \{ vehicleSvg \} from '\.\.\/amap\/marker-icons'/)
  assert.match(maplibreSource, /BUSES_ICON_LAYER_ID = 'yeu-bus-vehicle-icons'/)
  assert.match(maplibreSource, /'icon-rotate': \['coalesce', \['get', 'angle'\], 0\]/)
  assert.match(maplibreSource, /'icon-rotation-alignment': 'map',/)
  assert.match(maplibreSource, /angle: bus\.angleDeg \?\? 0,/s)
})

test('去程/回程各注册一张车图标，配色取 BUS_ROUTE_COLORS[dir]', () => {
  const method = around(maplibreSource, 'private ensureBusVehicleImage', 700)
  assert.match(method, /BUS_ROUTE_COLORS\.forEach\(\(color, dir\)/)
  assert.match(method, /imageId = `yeu-bus-vehicle-icon-\$\{dir\}`/)
  assert.match(method, /vehicleSvg\(\{ color, size: 40 \}\)/)
  assert.match(method, /pixelRatio: 1/)
  assert.match(maplibreSource, /'icon-image': \['concat', 'yeu-bus-vehicle-icon-', \['to-string', \['get', 'dir'\]\]\],/)
  assert.match(maplibreSource, /dir: Number\(\(bus as MapBus & \{ isBack\?: boolean \}\)\.isBack === true\),/)
})

test('app/ 与 map/ 源码里旧静态色 #ea580c / #0d9488 命中 0', () => {
  const offenders = [...walk('app'), ...walk('map')]
    .filter(path => /#ea580c|#0d9488/i.test(readFileSync(path, 'utf8')))
  assert.deepEqual(offenders, [])
})
