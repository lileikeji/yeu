import assert from 'node:assert/strict'
import test from 'node:test'
import type { MapPoi } from '../map/core/types'
import { AMAP_REQUIRED_PLUGINS, buildAMapScriptUrl } from '../map/providers/amap/loader'
import { AMapProvider } from '../map/providers/amap/provider'

type FakeListener = (event: { stopPropagation(): void }) => void

class FakeElement {
  type = ''
  title = ''
  textContent = ''
  href = ''
  target = ''
  rel = ''
  style: Record<string, string> = {}
  readonly attributes = new Map<string, string>()
  readonly children: FakeElement[] = []
  private readonly listeners = new Map<string, Set<FakeListener>>()

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children)
  }

  addEventListener(event: string, listener: FakeListener): void {
    const listeners = this.listeners.get(event) ?? new Set<FakeListener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }

  dispatch(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener({ stopPropagation() {} })
    }
  }
}

type AMapListener = (event: {
  clusterData?: FakeClusterData[]
  originEvent?: { stopPropagation(): void }
  name?: string
  lnglat?: { getLng(): number, getLat(): number }
}) => void

class FakeMarker {
  content: FakeElement | null
  offset: FakePixel | null = null
  readonly listeners = new Map<string, Set<AMapListener>>()

  constructor(readonly options: Record<string, unknown>) {
    this.content = (options.content as FakeElement | undefined) ?? null
  }

  on(event: string, listener: AMapListener): void {
    const listeners = this.listeners.get(event) ?? new Set<AMapListener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }

  off(event: string, listener: AMapListener): void {
    this.listeners.get(event)?.delete(listener)
  }

  setContent(content: FakeElement): void {
    this.content = content
  }

  setOffset(offset: FakePixel): void {
    this.offset = offset
  }
}

class FakePolygon extends FakeMarker {
  static instances: FakePolygon[] = []
  map: FakeAMapMap | null = null

  constructor(options: Record<string, unknown>) {
    super(options)
    FakePolygon.instances.push(this)
  }

  setMap(map: FakeAMapMap | null): void {
    this.map = map
  }
}

class FakePolyline extends FakeMarker {
  static instances: FakePolyline[] = []
  map: FakeAMapMap | null = null

  constructor(options: Record<string, unknown>) {
    super(options)
    FakePolyline.instances.push(this)
  }

  setMap(map: FakeAMapMap | null): void {
    this.map = map
  }
}

class FakePixel {
  constructor(readonly x: number, readonly y: number) {}
}

class FakeInfoWindow {
  static instances: FakeInfoWindow[] = []
  content: FakeElement | null = null
  openedAt: [number, number] | null = null
  closed = false

  constructor(readonly options: Record<string, unknown> = {}) {
    FakeInfoWindow.instances.push(this)
  }

  setContent(content: FakeElement): void {
    this.content = content
  }

  open(_map: FakeAMapMap, position: [number, number]): void {
    this.openedAt = position
  }

  close(): void {
    this.closed = true
  }
}

class FakeWalking {
  static instances: FakeWalking[] = []
  cleared = false

  constructor(readonly options: Record<string, unknown>) {
    FakeWalking.instances.push(this)
  }

  search(
    _origin: [number, number],
    _destination: [number, number],
    callback: (status: string, result: { routes: Array<{ distance: number, time: number }> }) => void
  ): void {
    callback('complete', { routes: [{ distance: 1260, time: 900 }] })
  }

  clear(): void {
    this.cleared = true
  }
}

interface FakeClusterData {
  lnglat: [number, number]
  weight?: number
  poiId: string
}

interface FakeClusterOptions {
  gridSize?: number
  maxZoom?: number
  averageCenter?: boolean
  clusterByZoomChange?: boolean
  renderMarker?: (context: { marker: FakeMarker, data: FakeClusterData[] }) => void
  renderClusterMarker?: (context: {
    marker: FakeMarker
    count: number
    clusterData: FakeClusterData[]
  }) => void
}

class FakeMarkerCluster {
  static instances: FakeMarkerCluster[] = []
  readonly listeners = new Map<string, Set<AMapListener>>()
  readonly renderedMarkers: FakeMarker[]
  readonly renderedClusterMarker: FakeMarker
  map: FakeAMapMap | null

  constructor(
    map: FakeAMapMap,
    readonly data: FakeClusterData[],
    readonly options: FakeClusterOptions = {}
  ) {
    this.map = map
    this.renderedMarkers = data.map((item) => {
      const marker = new FakeMarker({ position: item.lnglat })
      options.renderMarker?.({ marker, data: [item] })
      return marker
    })
    this.renderedClusterMarker = new FakeMarker({})
    options.renderClusterMarker?.({
      marker: this.renderedClusterMarker,
      count: data.length,
      clusterData: data
    })
    FakeMarkerCluster.instances.push(this)
  }

  on(event: string, listener: AMapListener): void {
    const listeners = this.listeners.get(event) ?? new Set<AMapListener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }

  off(event: string, listener: AMapListener): void {
    this.listeners.get(event)?.delete(listener)
  }

  emitClick(clusterData: FakeClusterData[]): void {
    for (const listener of this.listeners.get('click') ?? []) listener({ clusterData })
  }

  setData(_data: FakeClusterData[]): void {}

  setMap(map: FakeAMapMap | null): void {
    this.map = map
  }
}

class FakeAMapMap {
  static instances: FakeAMapMap[] = []
  readonly listeners = new Map<string, Set<AMapListener>>()
  readonly added: FakeMarker[] = []
  readonly removed: FakeMarker[] = []
  readonly fitCalls: Array<{ overlays: FakeMarker[], maxZoom?: number }> = []
  readonly zoomCalls: Array<{ zoom: number, center: [number, number] }> = []
  zoom: number
  destroyed = false

  constructor(_element: FakeElement, readonly options: Record<string, unknown>) {
    this.zoom = Number(options.zoom ?? 14)
    FakeAMapMap.instances.push(this)
  }

  on(event: string, listener: AMapListener): void {
    const listeners = this.listeners.get(event) ?? new Set<AMapListener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }

  off(event: string, listener: AMapListener): void {
    this.listeners.get(event)?.delete(listener)
  }

  emitHotspot(name: string, position: [number, number]): void {
    for (const listener of this.listeners.get('hotspotclick') ?? []) {
      listener({ name, lnglat: { getLng: () => position[0], getLat: () => position[1] } })
    }
  }

  add(overlays: FakeMarker | FakeMarker[]): void {
    this.added.push(...(Array.isArray(overlays) ? overlays : [overlays]))
  }

  remove(overlays: FakeMarker | FakeMarker[]): void {
    this.removed.push(...(Array.isArray(overlays) ? overlays : [overlays]))
  }

  destroy(): void {
    this.destroyed = true
  }

  getZoom(): number {
    return this.zoom
  }

  setZoomAndCenter(zoom: number, center: [number, number]): void {
    this.zoom = zoom
    this.zoomCalls.push({ zoom, center })
  }

  setFitView(
    overlays: FakeMarker[],
    _immediately?: boolean,
    _avoid?: number[],
    maxZoom?: number
  ): void {
    this.fitCalls.push({ overlays, maxZoom })
  }
}

function createPois(count: number): MapPoi[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `poi-${index + 1}`,
    name: `地点 ${index + 1}`,
    category: index % 2 ? 'dorm' : 'campus-building',
    point: {
      lng: 118.6 + index * 0.00001,
      lat: 25.1 + index * 0.00001,
      crs: 'WGS84'
    },
    status: 'published'
  }))
}

function nextTurn(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

test('AMap loader requests the public MarkerCluster plugin without security credentials in the URL', () => {
  const url = new URL(buildAMapScriptUrl('public-test-key'))
  assert.equal(url.origin, 'https://webapi.amap.com')
  assert.equal(url.searchParams.get('v'), '2.0')
  assert.equal(url.searchParams.get('key'), 'public-test-key')
  assert.deepEqual(url.searchParams.get('plugin')?.split(','), [...AMAP_REQUIRED_PLUGINS])
  assert.equal(url.searchParams.has('securityJsCode'), false)
})

test('AMap provider clusters 76 points, keeps names visible, plans walking routes, and hides area boxes', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const conversionSources: string[] = []
  FakeAMapMap.instances = []
  FakeMarkerCluster.instances = []
  FakePolygon.instances = []
  FakePolyline.instances = []
  FakeInfoWindow.instances = []
  FakeWalking.instances = []

  const fakeDocument = {
    createElement: () => new FakeElement()
  }
  const fakeAMap = {
    Map: FakeAMapMap,
    Marker: FakeMarker,
    Polygon: FakePolygon,
    Polyline: FakePolyline,
    InfoWindow: FakeInfoWindow,
    Pixel: FakePixel,
    MarkerCluster: FakeMarkerCluster,
    Walking: FakeWalking,
    plugin: (_plugins: string[], callback: () => void) => callback(),
    convertFrom: (
      points: [number, number][],
      source: string,
      callback: (status: string, result: { locations: [number, number][] }) => void
    ) => {
      conversionSources.push(source)
      callback('complete', { locations: points })
    }
  }
  const fakeWindow = {
    AMap: fakeAMap,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: fakeDocument
  })

  try {
    const provider = new AMapProvider({
      key: 'public-test-key',
      securityCode: 'not-exposed-in-a-url'
    })
    const selected: Array<string | null> = []
    provider.onPoiSelect(poi => selected.push(poi?.id ?? null))
    await provider.mount(new FakeElement() as unknown as HTMLElement, { zoom: 14 })

    const pois = createPois(76)
    provider.setPois(pois)
    provider.setAreas([{
      id: 'area-1',
      name: '操场',
      bounds: {
        southWest: { lng: 118.6005, lat: 25.1081, crs: 'WGS84' },
        northEast: { lng: 118.6021, lat: 25.1093, crs: 'WGS84' }
      },
      strokeColor: '#18AD78',
      fillColor: '#12E3AA',
      areaSquareMeters: 15423.04,
      perimeterMeters: 500.03,
      geometrySource: 'wia-bounding-box'
    }, {
      id: 'area-exact-1',
      name: '真实操场轮廓',
      paths: [[
        { lng: 118.6005, lat: 25.1081, crs: 'WGS84' },
        { lng: 118.6021, lat: 25.1083, crs: 'WGS84' },
        { lng: 118.6018, lat: 25.1093, crs: 'WGS84' },
        { lng: 118.6007, lat: 25.1090, crs: 'WGS84' }
      ]],
      strokeColor: '#18AD78',
      fillColor: '#12E3AA',
      areaSquareMeters: 15423.04,
      perimeterMeters: 500.03,
      geometrySource: 'wia-shape-batch'
    }])
    await nextTurn()

    const cluster = FakeMarkerCluster.instances.at(-1)
    const map = FakeAMapMap.instances.at(-1)
    assert.ok(cluster)
    assert.ok(map)
    assert.equal(map.options.isHotspot, true)
    assert.deepEqual(map.options.features, ['bg', 'road', 'building', 'point'])
    assert.equal(cluster.data.length, 76)
    assert.equal(cluster.options.gridSize, 56)
    assert.equal(cluster.options.maxZoom, 17)
    assert.equal(cluster.options.averageCenter, true)
    assert.equal(cluster.options.clusterByZoomChange, true)
    assert.ok(conversionSources.length >= 3)
    assert.ok(conversionSources.every(source => source === 'gps'))

    const regularContent = cluster.renderedMarkers[0]?.content
    const regularLabel = regularContent?.children[0]
    assert.ok(regularContent)
    assert.ok(regularLabel)
    assert.equal(regularLabel.style.visibility, 'visible')
    assert.ok(cluster.renderedMarkers.every(marker => marker.content?.children[0]?.style.visibility === 'visible'))
    assert.deepEqual(cluster.renderedMarkers[0]?.offset, new FakePixel(-15, -38))
    assert.deepEqual(cluster.renderedClusterMarker.offset, new FakePixel(-24, -24))

    regularContent.dispatch('pointerleave')
    assert.equal(regularLabel.style.visibility, 'visible')
    regularContent.dispatch('click')
    assert.equal(selected.at(-1), 'poi-1')

    cluster.emitClick([cluster.data[1]!])
    assert.equal(selected.at(-1), 'poi-2')
    cluster.emitClick(cluster.data.slice(0, 3))
    assert.equal(selected.at(-1), null)

    provider.setSelectedPoi('poi-1')
    const selectedMarker = map.added.at(-1)
    assert.ok(selectedMarker?.content)
    assert.equal(selectedMarker.content.children[0]?.style.visibility, 'visible')
    assert.equal(FakePolygon.instances.length, 0)
    assert.equal(FakePolyline.instances.length, 1)
    assert.deepEqual(FakePolyline.instances[0]?.options.path, [
      [118.6005, 25.1081],
      [118.6021, 25.1083],
      [118.6018, 25.1093],
      [118.6007, 25.109],
      [118.6005, 25.1081]
    ])
    assert.equal(FakePolyline.instances[0]?.options.fillOpacity, undefined)
    assert.equal(FakePolyline.instances[0]?.options.bubble, true)

    const walkingSummary = await provider.planWalkingRoute(
      { lng: 118.6, lat: 25.1, crs: 'WGS84' },
      { lng: 118.61, lat: 25.11, crs: 'WGS84' }
    )
    assert.deepEqual(walkingSummary, { distanceMeters: 1260, durationSeconds: 900 })
    assert.equal(FakeWalking.instances.at(-1)?.options.map, map)
    provider.clearRoute()
    assert.equal(FakeWalking.instances.at(-1)?.cleared, true)

    map.emitHotspot('学生街商家', [118.6, 25.1])
    const infoWindow = FakeInfoWindow.instances.at(-1)
    assert.deepEqual(infoWindow?.openedAt, [118.6, 25.1])
    assert.equal(infoWindow?.content?.children[0]?.textContent, '学生街商家')
    assert.match(infoWindow?.content?.children[2]?.href ?? '', /^https:\/\/uri\.amap\.com\/search\?/)

    provider.fitToPois()
    assert.equal(map.fitCalls.at(-1)?.overlays.length, 77)
    assert.equal(map.fitCalls.at(-1)?.maxZoom, 17)
    assert.equal(provider.flyToPoi('poi-2'), true)
    assert.deepEqual(map.zoomCalls.at(-1), {
      zoom: 17,
      center: cluster.data[1]!.lnglat
    })

    provider.destroy()
    assert.equal(cluster.map, null)
    assert.equal(map.destroyed, true)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
