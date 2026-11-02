import assert from 'node:assert/strict'
import test from 'node:test'
import type { MapPoi } from '../map/core/types'
import { AMAP_REQUIRED_PLUGINS, buildAMapScriptUrl, loadAMap } from '../map/providers/amap/loader'
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
  readonly classNames = new Set<string>()
  readonly classList = {
    toggle: (name: string, force?: boolean) => {
      const enabled = force ?? !this.classNames.has(name)
      if (enabled) this.classNames.add(name)
      else this.classNames.delete(name)
      return enabled
    },
    contains: (name: string) => this.classNames.has(name)
  }

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

  setOptions(options: Record<string, unknown>): void {
    Object.assign(this.options, options)
  }

  setOffset(offset: FakePixel): void {
    this.offset = offset
  }

  emitClick(): void {
    for (const listener of this.listeners.get('click') ?? []) listener({})
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

class FakeTileLayer extends FakeMarker {
  static instances: FakeTileLayer[] = []
  map: FakeAMapMap | null = null

  constructor(options: Record<string, unknown> = {}) {
    super(options)
    FakeTileLayer.instances.push(this)
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

  setOptions(options: Record<string, unknown>): void {
    Object.assign(this.options, options)
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
    callback: (status: string, result: { routes: Array<{ distance: number, time: number, steps?: Array<{ instruction: string, distance: number }> }> }) => void
  ): void {
    callback('complete', {
      routes: [{
        distance: 1260,
        time: 900,
        steps: [
          { instruction: '沿学生街向东步行', distance: 300 },
          { instruction: '过马路后继续直行', distance: 960 }
        ]
      }]
    })
  }

  clear(): void {
    this.cleared = true
  }
}

class FakePlaceSearch {
  static instances: FakePlaceSearch[] = []

  constructor(readonly options: Record<string, unknown>) {
    FakePlaceSearch.instances.push(this)
  }

  searchNearBy(
    _keyword: string,
    _center: [number, number],
    _radius: number,
    callback: (status: string, result: unknown) => void
  ): void {
    callback('complete', {
      poiList: {
        pois: [{
          id: 'native-shop-1',
          name: '学生街咖啡店',
          address: '新区学生街',
          type: '餐饮服务;咖啡厅',
          location: { getLng: () => 118.6015, getLat: () => 25.1062 }
        }]
      }
    })
  }
}

class FakeCircle {
  static instances: FakeCircle[] = []
  map: FakeAMapMap | null

  constructor(readonly options: Record<string, unknown>) {
    this.map = null
    FakeCircle.instances.push(this)
  }

  setMap(map: FakeAMapMap | null): void {
    this.map = map
  }
}

interface FakeClusterData {
  lnglat: [number, number]
  weight?: number
  poiId: string
}interface FakeClusterOptions {
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
    for (const listener of this.listeners.get('click') ?? []) {
      listener({ clusterData, lnglat: { getLng: () => 118.61, getLat: () => 25.1 } })
    }
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
  resized = false

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

  emitClick(): void {
    for (const listener of this.listeners.get('click') ?? []) {
      listener({})
    }
  }

  add(overlays: FakeMarker | FakeMarker[]): void {
    this.added.push(...(Array.isArray(overlays) ? overlays : [overlays]))
  }

  remove(overlays: FakeMarker | FakeMarker[]): void {
    this.removed.push(...(Array.isArray(overlays) ? overlays : [overlays]))
  }

  resize(): void {
    this.resized = true
  }

  destroy(): void {
    this.destroyed = true
  }

  getZoom(): number {
    return this.zoom
  }

  getCenter() {
    return { getLng: () => 118.601, getLat: () => 25.106 }
  }

  getBounds() {
    return {
      getSouthWest: () => ({ getLng: () => 118.59, getLat: () => 25.09 }),
      getNorthEast: () => ({ getLng: () => 118.63, getLat: () => 25.13 })
    }
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

test('AMap loader sets the security code even when window.AMap already exists', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')

  // A remount reuses the already-loaded namespace. The security code must
  // still be written, otherwise restapi.amap.com rejects coordinate
  // conversion and the basemap never receives a center.
  const existingAMap = { Map: function FakeMap() {} }
  const fakeWindow: Record<string, unknown> = { AMap: existingAMap }

  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true })
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => ({ dataset: {}, remove() {} }) },
    configurable: true
  })

  try {
    const resolved = await loadAMap({ key: 'k', securityCode: 'sec-123' })
    assert.equal(resolved, existingAMap)
    assert.deepEqual(fakeWindow._AMapSecurityConfig, { securityJsCode: 'sec-123' })
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('AMap provider creates the map without waiting for coordinate conversion', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  FakeAMapMap.instances = []

  const fakeWindow: Record<string, unknown> = {
    AMap: {
      Map: FakeAMapMap,
      Marker: FakeMarker,
      Polygon: FakePolygon,
      Polyline: FakePolyline,
      TileLayer: { Satellite: FakeTileLayer, RoadNet: FakeTileLayer },
      InfoWindow: FakeInfoWindow,
      Pixel: FakePixel,
      MarkerCluster: FakeMarkerCluster,
      plugin: (_plugins: string[], callback: () => void) => callback(),
      // A rejected key leaves this callback pending, as observed in WeChat.
      convertFrom: () => {}
    }
  }

  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true })
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => new FakeElement() },
    configurable: true
  })

  try {
    const provider = new AMapProvider({ key: 'k', securityCode: 'sec' })
    await provider.mount(new FakeElement() as unknown as HTMLElement, { zoom: 15 })

    // The map must exist even though conversion never resolved.
    assert.equal(FakeAMapMap.instances.length, 1)
    provider.destroy()
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('AMap provider resizes a zero-sized canvas after mount', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  FakeAMapMap.instances = []

  // Mirrors the embedded-WebView failure: the container has a real size but
  // AMap built its canvas before layout settled, so it stays 0x0.
  const zeroCanvas = { width: 0, height: 0 }
  const element = {
    getBoundingClientRect: () => ({ width: 375, height: 748 }),
    querySelector: () => zeroCanvas,
    querySelectorAll: () => [zeroCanvas] as unknown[]
  }

  const fakeWindow: Record<string, unknown> = {
    AMap: {
      Map: FakeAMapMap,
      Marker: FakeMarker,
      Polygon: FakePolygon,
      Polyline: FakePolyline,
      TileLayer: { Satellite: FakeTileLayer, RoadNet: FakeTileLayer },
      InfoWindow: FakeInfoWindow,
      Pixel: FakePixel,
      MarkerCluster: FakeMarkerCluster,
      plugin: (_plugins: string[], callback: () => void) => callback(),
      convertFrom: (
        points: [number, number][],
        _source: string,
        callback: (status: string, result: { locations: [number, number][] }) => void
      ) => callback('complete', { locations: points })
    }
  }

  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true })
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => new FakeElement() },
    configurable: true
  })

  try {
    const provider = new AMapProvider({ key: 'k', securityCode: 'sec' })
    await provider.mount(element as unknown as HTMLElement, { zoom: 15 })

    const map = FakeAMapMap.instances.at(-1)
    assert.ok(map, 'expected a map instance')

    // Polling is timer-driven so the basemap recovers even where rAF is throttled.
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(map!.resized, true, 'expected resize() for the 0x0 canvas')

    provider.destroy()
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
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
  FakePlaceSearch.instances = []
  FakeTileLayer.instances = []

  const fakeDocument = {
    createElement: () => new FakeElement()
  }
  const fakeAMap = {
    Map: FakeAMapMap,
    Marker: FakeMarker,
    Polygon: FakePolygon,
    Polyline: FakePolyline,
    TileLayer: {
      Satellite: FakeTileLayer,
      RoadNet: FakeTileLayer
    },
    InfoWindow: FakeInfoWindow,
    Pixel: FakePixel,
    MarkerCluster: FakeMarkerCluster,
    Walking: FakeWalking,
    PlaceSearch: FakePlaceSearch,
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
    const selectedAreas: Array<string | null> = []
    provider.onPoiSelect(poi => selected.push(poi?.id ?? null))
    provider.onAreaSelect(area => selectedAreas.push(area?.id ?? null))
    await provider.mount(new FakeElement() as unknown as HTMLElement, { zoom: 14 })

    const pois = createPois(76)
    pois[0]!.point = { ...pois[0]!.point, crs: 'GCJ-02' }
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
        { lng: 118.6005, lat: 25.1081, crs: 'GCJ-02' },
        { lng: 118.6021, lat: 25.1083, crs: 'GCJ-02' },
        { lng: 118.6018, lat: 25.1093, crs: 'GCJ-02' },
        { lng: 118.6007, lat: 25.1090, crs: 'GCJ-02' }
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
    assert.equal(cluster.options.gridSize, 40)
    assert.equal(cluster.options.maxZoom, 16)
    assert.equal(cluster.options.averageCenter, true)
    assert.equal(cluster.options.clusterByZoomChange, true)
    // 本地换算：所有标点均带有效 GCJ 坐标，且相对 WGS84 存在约 0.004°/0.003° 的系统偏移。
    assert.ok(cluster.data.every(item => Number.isFinite(item.lnglat[0]) && Number.isFinite(item.lnglat[1])))
    const wgsSample = createPois(76)[1]!.point
    const gcjSample = cluster.data[1]!.lnglat
    assert.ok(gcjSample[0] - wgsSample.lng > 0.0035 && gcjSample[0] - wgsSample.lng < 0.006, 'GCJ lng shifted east')
    assert.ok(wgsSample.lat - gcjSample[1] > 0.002 && wgsSample.lat - gcjSample[1] < 0.0045, 'GCJ lat shifted south')
    assert.equal(provider.setBaseStyle('satellite'), true)
    assert.equal(FakeTileLayer.instances.length, 2)
    assert.equal(map.added.includes(FakeTileLayer.instances[0]!), true)
    assert.equal(provider.setBaseStyle('standard'), true)
    assert.equal(map.removed.includes(FakeTileLayer.instances[0]!), true)

    const regularContent = cluster.renderedMarkers[0]?.content
    const regularLabel = regularContent?.children[0]
    assert.ok(regularContent)
    assert.ok(regularLabel)
    assert.equal(regularLabel.style.visibility, 'visible')
    assert.ok(cluster.renderedMarkers.every(marker => marker.content?.children[0]?.style.visibility === 'visible'))
    assert.match(regularContent.style.cssText, /width:44px;height:50px/)
    assert.deepEqual(cluster.renderedMarkers[0]?.offset, new FakePixel(-22, -50))
    assert.deepEqual(cluster.renderedClusterMarker.offset, new FakePixel(-28, -28))
    assert.match(cluster.renderedClusterMarker.content?.style.cssText ?? '', /width:56px;height:56px/)

    regularContent.dispatch('pointerleave')
    assert.equal(regularLabel.style.visibility, 'visible')
    regularContent.dispatch('click')
    assert.equal(selected.at(-1), 'poi-1')

    cluster.emitClick([cluster.data[1]!])
    assert.equal(selected.at(-1), 'poi-2')
    const selectionBeforeMulti = selected.length
    cluster.emitClick(cluster.data.slice(0, 3))
    // 多点聚合点击不再清空选择，改为朝点击处放大两级便于逐层展开。
    assert.equal(selected.length, selectionBeforeMulti)
    assert.deepEqual(map.zoomCalls.at(-1), { zoom: 16, center: [118.61, 25.1] })

    const nativeResults = await provider.searchVisiblePois('咖啡')
    assert.equal(nativeResults.length, 1)
    assert.equal(nativeResults[0]?.name, '学生街咖啡店')
    assert.equal(nativeResults[0]?.category, 'food')
    assert.equal(nativeResults[0]?.source, 'amap-native')

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
    FakePolyline.instances[0]?.emitClick()
    assert.equal(selectedAreas.at(-1), 'area-exact-1')
    assert.equal(FakePolyline.instances[0]?.options.strokeColor, '#2563eb')
    assert.equal(FakePolyline.instances[0]?.options.strokeWeight, 6)
    const areaLabel = map.added.find(marker => marker.content?.textContent === '真实操场轮廓')
    assert.ok(areaLabel)
    areaLabel.emitClick()
    assert.equal(selectedAreas.at(-1), 'area-exact-1')
    assert.equal(areaLabel.content?.classList.contains('yeu-amap-area-label-selected'), true)
    assert.match(areaLabel.content?.style.cssText ?? '', /background:#2563eb/)
    provider.setSelectedArea(null)
    assert.equal(FakePolyline.instances[0]?.options.strokeColor, '#18AD78')
    assert.equal(FakePolyline.instances[0]?.options.strokeWeight, 3)
    assert.equal(areaLabel.content?.classList.contains('yeu-amap-area-label-selected'), false)
    assert.match(areaLabel.content?.style.cssText ?? '', /background:rgb\(255 255 255 \/ 90%\)/)
    map.emitClick()
    assert.equal(selectedAreas.at(-1), null)

    const walkingSummary = await provider.planWalkingRoute(
      { lng: 118.6, lat: 25.1, crs: 'WGS84' },
      { lng: 118.61, lat: 25.11, crs: 'WGS84' }
    )
    assert.deepEqual(walkingSummary, {
      distanceMeters: 1260,
      durationSeconds: 900,
      steps: [
        { instruction: '沿学生街向东步行', distanceMeters: 300 },
        { instruction: '过马路后继续直行', distanceMeters: 960 }
      ]
    })
    assert.equal(FakeWalking.instances.at(-1)?.options.map, map)
    provider.clearRoute()
    assert.equal(FakeWalking.instances.at(-1)?.cleared, true)

    map.emitHotspot('学生街商家', [118.6, 25.1])
    // 当前行为：hotspot 点击经 PlaceSearch 反查，命中原生商家后直接开 yeu 卡片，
    // 不再弹 AMap 原生 InfoWindow（避免空白点击弹出远处商家卡片）。
    await nextTurn()
    assert.equal(selected.at(-1), 'amap-native-native-shop-1')
    assert.equal(selectedAreas.at(-1), null)
    provider.resize()
    assert.equal(map.resized, true)

    provider.fitToPois()
    assert.equal(map.fitCalls.at(-1)?.overlays.length, 77)
    assert.equal(map.fitCalls.at(-1)?.maxZoom, 17)
    assert.equal(provider.flyToPoi('poi-2'), true)
    assert.deepEqual(map.zoomCalls.at(-1), {
      zoom: 17,
      center: cluster.data[1]!.lnglat
    })

    provider.setDisplayOptions({
      showPois: true,
      showAreas: false,
      showLabels: false,
      autoCluster: false,
      labelSize: 'large'
    })
    await nextTurn()
    assert.equal(cluster.map, null)
    assert.equal(map.removed.includes(FakePolyline.instances[0]!), true)
    const plainMarkers = map.added.filter(marker => String(marker.options.title ?? '').startsWith('地点 '))
    assert.ok(plainMarkers.length >= 76)
    assert.match(plainMarkers.at(-1)?.content?.children[0]?.style.cssText ?? '', /display:none/)

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

test('AMap provider re-renders every marker once the canvas settles at its real size', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  FakeAMapMap.instances = []
  FakeMarkerCluster.instances = []

  // Mirrors the embedded-WebView case: the container has a real size but the
  // AMap canvas stays 0x0 for a while, so the cluster is first built against a
  // broken layout and pins only appear after a camera move. Once the canvas
  // settles at the real size, the provider must rebuild the overlay from its
  // cached conversions so every pin is visible immediately on load.
  const zeroCanvas = { width: 0, height: 0 }
  const element = {
    getBoundingClientRect: () => ({ width: 375, height: 748 }),
    querySelector: () => zeroCanvas,
    querySelectorAll: () => [zeroCanvas] as unknown[]
  }

  let conversionCalls = 0
  const fakeWindow: Record<string, unknown> = {
    AMap: {
      Map: FakeAMapMap,
      Marker: FakeMarker,
      Polygon: FakePolygon,
      Polyline: FakePolyline,
      TileLayer: { Satellite: FakeTileLayer, RoadNet: FakeTileLayer },
      InfoWindow: FakeInfoWindow,
      Pixel: FakePixel,
      MarkerCluster: FakeMarkerCluster,
      plugin: (_plugins: string[], callback: () => void) => callback(),
      convertFrom: (
        points: [number, number][],
        _source: string,
        callback: (status: string, result: { locations: [number, number][] }) => void
      ) => {
        conversionCalls += 1
        callback('complete', { locations: points })
      }
    }
  }

  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true })
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => new FakeElement() },
    configurable: true
  })

  try {
    const provider = new AMapProvider({ key: 'k', securityCode: 'sec' })
    await provider.mount(element as unknown as HTMLElement, { zoom: 15 })
    provider.setPois(createPois(12))
    await nextTurn()

    const firstCluster = FakeMarkerCluster.instances.at(-1)
    assert.ok(firstCluster, 'expected the initial cluster')
    assert.equal(firstCluster.data.length, 12)
    const callsBeforeSettle = conversionCalls

    // The canvas finally settles at the container's real size.
    zeroCanvas.width = 375
    zeroCanvas.height = 748

    // Wait past the resize-polling tick so onCanvasSettled can fire.
    await new Promise(resolve => setTimeout(resolve, 450))

    const settledCluster = FakeMarkerCluster.instances.at(-1)
    assert.ok(settledCluster)
    assert.notEqual(settledCluster, firstCluster, 'expected the overlay to be rebuilt after the canvas settles')
    assert.equal(settledCluster.data.length, 12)
    assert.equal(settledCluster.renderedMarkers.length, 12)
    // The rebuild reuses cached conversions; it must not hit the conversion API again.
    assert.equal(conversionCalls, callsBeforeSettle)
    // The stale cluster is removed from the map.
    assert.equal(firstCluster.map, null)

    provider.destroy()
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('AMap provider renders and clears the user location blue dot', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  FakeAMapMap.instances = []
  FakeCircle.instances = []

  const element = {
    getBoundingClientRect: () => ({ width: 375, height: 748 }),
    querySelector: () => ({ width: 375, height: 748 }),
    querySelectorAll: () => [{ width: 375, height: 748 }] as unknown[]
  }

  const fakeWindow: Record<string, unknown> = {
    AMap: {
      Map: FakeAMapMap,
      Marker: FakeMarker,
      Circle: FakeCircle,
      Polygon: FakePolygon,
      Polyline: FakePolyline,
      TileLayer: { Satellite: FakeTileLayer, RoadNet: FakeTileLayer },
      InfoWindow: FakeInfoWindow,
      Pixel: FakePixel,
      MarkerCluster: FakeMarkerCluster,
      plugin: (_plugins: string[], callback: () => void) => callback(),
      convertFrom: (
        points: [number, number][],
        _source: string,
        callback: (status: string, result: { locations: [number, number][] }) => void
      ) => callback('complete', { locations: points })
    }
  }

  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true })
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => new FakeElement() },
    configurable: true
  })

  try {
    const provider = new AMapProvider({ key: 'k', securityCode: 'sec' })
    await provider.mount(element as unknown as HTMLElement, { zoom: 15 })
    const map = FakeAMapMap.instances[0]!

    // WGS84 location converts through convertFrom and lands as a dot + circle.
    provider.setUserLocation({
      point: { lng: 118.6, lat: 25.1, crs: 'WGS84' },
      accuracyMeters: 40
    })
    await nextTurn()

    const circle = FakeCircle.instances.at(-1)
    assert.ok(circle, 'expected an accuracy circle')
    assert.equal(circle.options.radius, 40)
    const dot = map.added.find(marker => marker.content?.title === '我的位置')
    assert.ok(dot, 'expected the blue dot marker')
    assert.match(dot?.content?.style.cssText ?? '', /background:#2563eb/)

    // Clearing removes both overlays.
    provider.setUserLocation(null)
    assert.equal(map.removed.includes(circle), true)
    assert.equal(map.removed.includes(dot), true)

    provider.destroy()
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
