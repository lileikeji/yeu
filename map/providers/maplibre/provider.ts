import type {
  ErrorEvent as MapLibreErrorEvent,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
  StyleSpecification
} from 'maplibre-gl'
import { campusBoundary } from '../../../data/seeds/osm-campus-boundary-encoded'
import type {
  AreaSelectHandler,
  MapErrorHandler,
  MapBaseStyle,
  MapDisplayOptions,
  MapProvider,
  MapUserLocation,
  PoiSelectHandler,
  PointPickedHandler,
  RouteSummary
} from '../../core/provider'
import {
  YEU_CAMPUS_REFERENCE_BOUNDS,
  YEU_CAMPUS_REFERENCE_CENTER
} from '../../core/campus'
import type { GeoPoint, MapArea, MapBus, MapBusRoute, MapBusStop, MapMountOptions, MapPoi, MapTransitVehicle } from '../../core/types'
import { gcj02ToWgs84 } from '~~/shared/utils/coordinate-convert'
import {
  createMarkerImage,
  getMarkerImageId,
  MAP_MARKER_COLORS,
  MAP_MARKER_PIXEL_RATIO,
  resolveMarkerCategory
} from './marker-image'

/**
 * 预览底图（OSM / MapLibre）只吃 WGS84。业务库里的 POI 多为 GCJ-02
 * （高德/微信来源），直接喂给 MapLibre 会偏移约 450m，因此统一转成 WGS84
 * 再渲染。转换沿用 shared/utils/coordinate-convert 的迭代逼近实现。
 * 未知或非法坐标返回 null，由调用方过滤。
 */
function toWgs84Point(point: GeoPoint): GeoPoint | null {
  if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return null
  if (point.crs === 'WGS84') return point
  if (point.crs === 'GCJ-02') {
    const converted = gcj02ToWgs84(point.lng, point.lat)
    return { lng: converted.longitude, lat: converted.latitude, crs: 'WGS84' }
  }
  // BD-09 等其它坐标系不在此处硬转，交给上层统一预处理。
  return null
}

const SOURCE_ID = 'yeu-preview-pois'
const CAMPUS_BOUNDARY_SOURCE_ID = 'yeu-campus-boundary'
const CAMPUS_BOUNDARY_FILL_LAYER_ID = 'yeu-campus-boundary-fill'
const CAMPUS_BOUNDARY_LINE_LAYER_ID = 'yeu-campus-boundary-line'
const CLUSTER_LAYER_ID = 'yeu-preview-clusters'
const CLUSTER_COUNT_LAYER_ID = 'yeu-preview-cluster-count'
const POI_LAYER_ID = 'yeu-preview-poi-pins'
const POI_LABEL_LAYER_ID = 'yeu-preview-poi-labels'
const SELECTED_POI_LABEL_LAYER_ID = 'yeu-preview-selected-poi-label'
const USER_LOCATION_SOURCE_ID = 'yeu-user-location'
const USER_LOCATION_ACCURACY_LAYER_ID = 'yeu-user-location-accuracy'
const USER_LOCATION_DOT_LAYER_ID = 'yeu-user-location-dot'
const BUS_ROUTES_SOURCE_ID = 'yeu-bus-routes'
const BUS_ROUTE_LINES_LAYER_ID = 'yeu-bus-route-lines'
const BUS_STOP_DOTS_LAYER_ID = 'yeu-bus-stop-dots'
const BUS_TERMINALS_LAYER_ID = 'yeu-bus-terminals'
const BUSES_SOURCE_ID = 'yeu-buses'
const BUSES_LAYER_ID = 'yeu-bus-vehicles'
const BUS_ROUTE_COLORS = ['#ea580c', '#0d9488'] as const
const TRANSIT_ROUTES_SOURCE_ID = 'yeu-transit-routes'
const TRANSIT_ROUTE_LINES_LAYER_ID = 'yeu-transit-route-lines'
const TRANSIT_TERMINALS_LAYER_ID = 'yeu-transit-terminals'
const TRANSIT_VEHICLES_SOURCE_ID = 'yeu-transit-vehicles'
const TRANSIT_VEHICLES_LAYER_ID = 'yeu-transit-vehicle-dots'
const TRANSIT_ROUTE_COLOR = '#1a6cf5'
const INTERACTIVE_LAYER_IDS = [
  CLUSTER_LAYER_ID,
  POI_LAYER_ID,
  POI_LABEL_LAYER_ID,
  SELECTED_POI_LABEL_LAYER_ID
]
const DEFAULT_CENTER: [number, number] = [
  YEU_CAMPUS_REFERENCE_CENTER.lng,
  YEU_CAMPUS_REFERENCE_CENTER.lat
]
const DEFAULT_ZOOM = 14
const SINGLE_POI_ZOOM = 17
const MAP_LOAD_TIMEOUT_MS = 5_000
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'

const OSM_PREVIEW_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION
    }
  },
  layers: [
    {
      id: 'osm-raster',
      type: 'raster',
      source: 'osm'
    }
  ]
}

// Keep the WebView fallback independent from third-party tile, glyph and
// copyrighted campus-plan assets.
const OFFLINE_PREVIEW_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: []
}

interface MapLibrePreviewProviderOptions {
  offline?: boolean
}

interface PoiFeatureProperties {
  poiId: string
  name: string
  category: string
  status: MapPoi['status']
  markerImage: string
  markerScale: number
  sortKey: number
  selected: boolean
}

interface PoiFeature {
  type: 'Feature'
  id: string
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: PoiFeatureProperties
}

interface PoiFeatureCollection {
  type: 'FeatureCollection'
  features: PoiFeature[]
}

interface UserLocationFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point', coordinates: [number, number] }
    properties: { kind: 'dot' | 'accuracy', accuracyMeters: number }
  }>
}

export class MapLibrePreviewProvider implements MapProvider {
  readonly id = 'maplibre-dev' as const
  private readonly offline: boolean
  private map: MapLibreMap | null = null
  private pois: MapPoi[] = []
  private selectedPoiId: string | null = null
  private pointPickedHandler: PointPickedHandler | null = null
  private poiSelectHandler: PoiSelectHandler | null = null
  private areaSelectHandler: AreaSelectHandler | null = null
  private mapErrorHandler: MapErrorHandler | null = null
  private labelOverlapAllowed = false
  private eventsAttached = false
  private errorEventAttached = false
  private fitAfterMount = false
  private lifecycleVersion = 0
  private cancelPendingLoad: (() => void) | null = null
  private userLocation: MapUserLocation | null = null
  private buses: MapBus[] = []
  private busRoutes: MapBusRoute[] = []
  private transitRoutes: MapBusRoute[] = []
  private layersReady = false

  constructor(options: MapLibrePreviewProviderOptions = {}) {
    this.offline = options.offline === true
  }

  async mount(element: HTMLElement, options: MapMountOptions = {}): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('MapLibrePreviewProvider can only be mounted in a browser')
    }

    this.disposeMap()
    const lifecycleVersion = ++this.lifecycleVersion
    const [maplibre] = await Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl.css')
    ])

    if (lifecycleVersion !== this.lifecycleVersion) {
      return
    }

    // Vite 预打包 maplibre-gl 成单个 deps 文件后，库内部的
    // `new URL('./maplibre-gl-worker.mjs', import.meta.url)` 会指向
    // node_modules/.cache/vite/client/deps/ 下不存在的路径，浏览器报
    // 「Worker failed to load」，所有依赖 worker 的图层（POI marker、
    // 校车线路）都不渲染。
    // 用 `?url` 后缀让 Vite 解析出真实可访问的 worker 资源地址，
    // 再交给 maplibre 官方的 setWorkerUrl()。
    if (typeof window !== 'undefined') {
      const { default: workerUrl } = await import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')
      maplibre.setWorkerUrl(workerUrl)
    }

    const map = new maplibre.Map({
      container: element,
      style: this.offline ? OFFLINE_PREVIEW_STYLE : OSM_PREVIEW_STYLE,
      center: options.center ? [options.center.lng, options.center.lat] : DEFAULT_CENTER,
      zoom: options.zoom ?? DEFAULT_ZOOM,
      maxZoom: 20,
      attributionControl: false,
      localIdeographFontFamily: 'sans-serif'
    })

    this.map = map
    map.on('error', this.handleMapError)
    this.errorEventAttached = true
    // 控件锚点：
    // - NavigationControl 挂 top-right，由 index.vue 的 CSS 分三档定位：
    //   ① 常规视口：下移到右侧工具栏正下方、右边缘对齐（桌面 21rem / 窄屏 18.875rem）；
    //   ② 宽 ≥768 且视口 ≤550px 高：下移量会把 dock 推出地图，退回「贴右上、靠工具栏左侧」；
    //   ③ 宽 <768 且视口 ≤559px 高：同上，退回「贴右上、靠工具栏左侧」。
    // - AttributionControl 挂 bottom-left（与比例尺同角、上下错开）；
    //   留在右下角会与「N 人看过」统计重叠（实测 168×20）。
    map.addControl(new maplibre.NavigationControl(), 'top-right')
    // 语义 class：addControl 之后容器才挂进 DOM。
    map.getContainer()
      .querySelector('.maplibregl-ctrl-top-right .maplibregl-ctrl-group')
      ?.classList.add('map-zoom-dock')
    map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-left')
    map.addControl(new maplibre.ScaleControl({ unit: 'metric' }), 'bottom-left')

    await this.waitForLoad(map)

    if (lifecycleVersion !== this.lifecycleVersion || this.map !== map) {
      return
    }

    if (this.offline) {
      this.prepareOfflineCanvas(element)
    }
    this.registerMarkerImages(map)
    this.addCampusBoundaryLayers(map)
    this.addPoiLayers(map)
    this.attachEvents(map)

    // 样式就绪后补画校外公交（默认打开时页面可能早于 style load 调用）
    this.layersReady = true
    if (this.transitRoutes.length) this.setTransitRoutes(this.transitRoutes)
    // 同理补画校车：轮询/示例数据可能早于 style load 到达，
    // 那时 addSource 会抛错并中断后续图层构建。
    if (this.busRoutes.length) this.setBusRoutes(this.busRoutes)
    if (this.buses.length) this.setBuses(this.buses)

    if (this.fitAfterMount) {
      this.fitAfterMount = false
      this.fitToPois()
    }

    // 地图就绪后补画「我的位置」：定位 fix 可能早于地图加载完成到达。
    if (this.userLocation) this.setUserLocation(this.userLocation)
  }

  setPois(pois: MapPoi[]): void {
    this.pois = [...pois]

    if (this.selectedPoiId && !this.pois.some(poi => poi.id === this.selectedPoiId)) {
      this.selectedPoiId = null
    }

    this.updateSourceData()
  }

  // WIA areas are currently rendered by the production AMap provider. Keep the
  // preview provider compatible so callers do not need provider-specific code.
  setAreas(_areas: MapArea[]): void {}

  setDisplayOptions(options: MapDisplayOptions): void {
    this.labelOverlapAllowed = options.showLabels
    if (this.map?.getLayer(POI_LABEL_LAYER_ID)) {
      this.map.setLayoutProperty(POI_LABEL_LAYER_ID, 'visibility', options.showLabels ? 'visible' : 'none')
    }
  }

  setBaseStyle(style: MapBaseStyle): boolean {
    return style === 'standard'
  }

  resize(): void {
    this.map?.resize()
  }

  fitToPois(): void {
    const map = this.map
    const points = this.renderablePois().map(poi => [poi.point.lng, poi.point.lat] as [number, number])

    if (!map) {
      this.fitAfterMount = true
      return
    }

    const firstPoint = points[0]

    if (!firstPoint) {
      map.fitBounds([
        [YEU_CAMPUS_REFERENCE_BOUNDS.west, YEU_CAMPUS_REFERENCE_BOUNDS.south],
        [YEU_CAMPUS_REFERENCE_BOUNDS.east, YEU_CAMPUS_REFERENCE_BOUNDS.north]
      ], {
        padding: { top: 72, right: 56, bottom: 72, left: 56 },
        maxZoom: 15,
        duration: 650
      })
      return
    }

    if (points.length === 1) {
      map.flyTo({
        center: firstPoint,
        zoom: Math.max(map.getZoom(), SINGLE_POI_ZOOM),
        essential: true
      })
      return
    }

    const bounds = points.reduce<[[number, number], [number, number]]>((result, point) => {
      result[0][0] = Math.min(result[0][0], point[0])
      result[0][1] = Math.min(result[0][1], point[1])
      result[1][0] = Math.max(result[1][0], point[0])
      result[1][1] = Math.max(result[1][1], point[1])
      return result
    }, [[firstPoint[0], firstPoint[1]], [firstPoint[0], firstPoint[1]]])

    map.fitBounds(bounds, {
      padding: { top: 72, right: 56, bottom: 72, left: 56 },
      maxZoom: SINGLE_POI_ZOOM,
      duration: 650
    })
  }

  enablePointPicker(handler: PointPickedHandler): void {
    this.pointPickedHandler = handler
    this.updateCursor()
  }

  disablePointPicker(): void {
    this.pointPickedHandler = null
    this.updateCursor()
  }

  onPoiSelect(handler: PoiSelectHandler): () => void {
    this.poiSelectHandler = handler

    return () => {
      if (this.poiSelectHandler === handler) {
        this.poiSelectHandler = null
      }
    }
  }

  onAreaSelect(handler: AreaSelectHandler): () => void {
    this.areaSelectHandler = handler
    return () => {
      if (this.areaSelectHandler === handler) this.areaSelectHandler = null
    }
  }

  onError(handler: MapErrorHandler): () => void {
    this.mapErrorHandler = handler

    return () => {
      if (this.mapErrorHandler === handler) {
        this.mapErrorHandler = null
      }
    }
  }

  setSelectedPoi(id: string | null): void {
    this.selectedPoiId = id && this.pois.some(poi => poi.id === id) ? id : null
    this.updateSourceData()
  }

  setSelectedArea(_id: string | null): void {}

  getZoom(): number {
    return this.map?.getZoom() ?? SINGLE_POI_ZOOM
  }

  flyToPoi(id: string): boolean {
    const poi = this.pois.find(candidate => candidate.id === id)

    if (!poi) {
      return false
    }

    return this.flyToPoint(poi.point)
  }

  flyToPoint(point: GeoPoint, zoom = SINGLE_POI_ZOOM): boolean {
    if (!this.map || !this.isRenderablePoint(point)) {
      return false
    }

    // 预览底图是 WGS84，必须先把 GCJ-02 归一化，否则飞到的位置会偏移约 558m。
    // toWgs84Point 对 BD-09 返回 null（留给上层统一预处理）：此时不飞、返回
    // false；所有现有调用方都忽略返回值，行为上就是「BD-09 点不再飞」。
    const target = toWgs84Point(point)
    if (!target) {
      return false
    }

    this.map.flyTo({
      center: [target.lng, target.lat],
      zoom,
      essential: true
    })
    return true
  }

  /**
   * Renders the user's live location as a blue dot (with a translucent
   * accuracy circle) via a dedicated GeoJSON source. WGS84 is used directly
   * since the preview basemap is WGS84-native. Passing null removes both.
   */
  setUserLocation(location: MapUserLocation | null): void {
    this.userLocation = location
    const map = this.map
    if (!map) return

    if (!location || !this.isRenderablePoint(location.point)) {
      if (map.getSource(USER_LOCATION_SOURCE_ID)) {
        this.updateUserLocationSource({
          type: 'FeatureCollection',
          features: []
        })
      }
      return
    }

    const dot: [number, number] = [location.point.lng, location.point.lat]
    this.ensureUserLocationLayers(map)
    this.updateUserLocationSource({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: dot }, properties: { kind: 'dot', accuracyMeters: location.accuracyMeters ?? 30 } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: dot }, properties: { kind: 'accuracy', accuracyMeters: location.accuracyMeters ?? 30 } }
      ]
    })
  }

  private ensureUserLocationLayers(map: MapLibreMap): void {
    if (map.getSource(USER_LOCATION_SOURCE_ID)) return

    map.addSource(USER_LOCATION_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    })
    map.addLayer({
      id: USER_LOCATION_ACCURACY_LAYER_ID,
      type: 'circle',
      source: USER_LOCATION_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'accuracy'],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13,
          ['/', ['get', 'accuracyMeters'], 2],
          19,
          ['/', ['get', 'accuracyMeters'], 1.5]
        ],
        'circle-color': 'rgba(37, 99, 235, 0.12)',
        'circle-stroke-color': 'rgba(37, 99, 235, 0.5)',
        'circle-stroke-width': 1
      }
    })
    map.addLayer({
      id: USER_LOCATION_DOT_LAYER_ID,
      type: 'circle',
      source: USER_LOCATION_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'dot'],
      paint: {
        'circle-radius': 7,
        'circle-color': '#2563eb',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3
      }
    })
  }

  private updateUserLocationSource(data: UserLocationFeatureCollection): void {
    const source = this.map?.getSource(USER_LOCATION_SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(data)
  }

  /**
   * Live campus-bus vehicles from the YKTGetBusCarInfo poll, rendered as an
   * orange circle layer updated in place (WGS84, preview basemap is
   * WGS84-native). Empty array clears the layer.
   */
  setBuses(buses: MapBus[]): void {
    this.buses = buses
    const map = this.map
    // style 未就绪时只缓存数据；mount() 里 layersReady=true 之后会补画。
    // 否则 addSource 抛错会中断后续图层构建（POI 图层整片消失）。
    if (!map || !this.layersReady) return
    if (!buses.length) {
      if (map.getSource(BUSES_SOURCE_ID)) {
        this.updateSource(BUSES_SOURCE_ID, { type: 'FeatureCollection', features: [] })
      }
      return
    }
    this.ensureBusLayers(map)
    // 车头朝向角（angleDeg）在 circle 渲染层退化不生效（dev-only provider；
    // 生产 amap 与 offline 走 DOM chip 旋转）。
    this.updateSource(BUSES_SOURCE_ID, {
      type: 'FeatureCollection',
      features: buses
        .filter(bus => this.isRenderablePoint(bus.point))
        .map(bus => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [bus.point.lng, bus.point.lat] },
          properties: {
            id: bus.id,
            name: bus.name,
            isAtSite: bus.isAtSite,
            siteName: bus.siteName ?? ''
          }
        }))
    })
  }

  /**
   * Campus-bus routes: stop polylines plus origin/terminal dots. Drawn from
   * YKTGetBusSiteInfo stops (WGS84). Empty array clears the layer.
   */
  setBusRoutes(routes: MapBusRoute[]): void {
    this.busRoutes = routes
    const map = this.map
    // style 未就绪时只缓存数据；mount() 里 layersReady=true 之后会补画。
    // 否则 addSource 抛错会中断后续图层构建（POI 图层整片消失）。
    if (!map || !this.layersReady) return
    if (!routes.length) {
      if (map.getSource(BUS_ROUTES_SOURCE_ID)) {
        this.updateSource(BUS_ROUTES_SOURCE_ID, { type: 'FeatureCollection', features: [] })
      }
      return
    }
    this.ensureBusLayers(map)

    const features: object[] = []
    for (const [index, route] of routes.entries()) {
      const color = route.color ?? BUS_ROUTE_COLORS[index % BUS_ROUTE_COLORS.length]!
      const stops = route.stops.filter(stop => this.isRenderablePoint(stop.point))
      // 沿路形状优先（服务端高德算路），缺失回退站点直连。
      const linePoints = (route.polyline && route.polyline.length >= 2)
        ? route.polyline
        : stops.map(stop => stop.point)
      if (linePoints.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: linePoints.map(point => [point.lng, point.lat])
          },
          properties: { kind: 'route', id: route.id, name: route.name, color }
        })
      }
      for (const stop of stops) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [stop.point.lng, stop.point.lat] },
          properties: {
            kind: stop.isOrigin || stop.isDestination ? 'terminal' : 'stop',
            id: stop.id,
            name: stop.name,
            color
          }
        })
      }
    }
    this.updateSource(BUS_ROUTES_SOURCE_ID, { type: 'FeatureCollection', features })
  }

  /** 校外公交（K2/K6）：独立 source，避免被校车 5 s 轮询覆盖。 */
  /** 校外公交在途车辆（dev 预览用 circle 层，生产走 amap 的 DOM chip）。 */
  setTransitVehicles(vehicles: MapTransitVehicle[]): void {
    const map = this.map
    if (!map) return
    if (!vehicles.length) {
      if (map.getSource(TRANSIT_VEHICLES_SOURCE_ID)) {
        this.updateSource(TRANSIT_VEHICLES_SOURCE_ID, { type: 'FeatureCollection', features: [] })
      }
      return
    }
    if (!map.getSource(TRANSIT_VEHICLES_SOURCE_ID)) {
      map.addSource(TRANSIT_VEHICLES_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })
      map.addLayer({
        id: TRANSIT_VEHICLES_LAYER_ID,
        type: 'circle',
        source: TRANSIT_VEHICLES_SOURCE_ID,
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      })
    }
    // 校外公交数据是 GCJ-02（useMapTransit 里 crs 标注属实），预览底图是
    // WGS84，必须在渲染层转换，否则车辆圆点整体偏移约 558m。
    this.updateSource(TRANSIT_VEHICLES_SOURCE_ID, {
      type: 'FeatureCollection',
      features: vehicles
        .filter(vehicle => this.isRenderablePoint(vehicle.point))
        .map(vehicle => ({ vehicle, point: toWgs84Point(vehicle.point) }))
        .filter((entry): entry is { vehicle: MapTransitVehicle, point: GeoPoint } => entry.point !== null)
        .map(({ vehicle, point }) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
          properties: {
            id: vehicle.id,
            plate: vehicle.plate,
            nextStation: vehicle.nextStation,
            color: vehicle.color ?? '#1a6cf5'
          }
        }))
    })
  }

  setTransitRoutes(routes: MapBusRoute[]): void {
    this.transitRoutes = [...routes]
    const map = this.map
    if (!map || !this.layersReady) return
    if (!routes.length) {
      if (map.getSource(TRANSIT_ROUTES_SOURCE_ID)) {
        this.updateSource(TRANSIT_ROUTES_SOURCE_ID, { type: 'FeatureCollection', features: [] })
      }
      return
    }
    this.ensureTransitLayers(map)

    const features: object[] = []
    // 多方向共用的站点只保留一个，避免重复圆点叠加
    const drawnStops = new Set<string>()
    for (const route of routes) {
      const color = route.color ?? TRANSIT_ROUTE_COLOR
      // 校外公交折线与站点都是 GCJ-02，预览底图是 WGS84：先逐点转换，
      // 再判断折线是否仍够 2 点（顺序反了会把有效线路误判为空）。
      const polylinePoints = (route.polyline ?? [])
        .filter(point => this.isRenderablePoint(point))
        .map(point => toWgs84Point(point))
        .filter((point): point is GeoPoint => point !== null)
      const routeStops = route.stops
        .filter(stop => this.isRenderablePoint(stop.point))
        .map(stop => ({ stop, point: toWgs84Point(stop.point) }))
        .filter((entry): entry is { stop: MapBusStop, point: GeoPoint } => entry.point !== null)
      // 沿路形状优先（高德线路快照），缺失回退站点直连。
      const linePoints = polylinePoints.length >= 2
        ? polylinePoints
        : routeStops.map(entry => entry.point)
      if (linePoints.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: linePoints.map(point => [point.lng, point.lat]) },
          properties: { kind: 'route', id: route.id, name: route.name, color }
        })
      }
      for (const { stop, point } of routeStops) {
        if (!stop.isOrigin && !stop.isDestination) continue
        const stopKey = stop.name
        if (drawnStops.has(stopKey)) continue
        drawnStops.add(stopKey)
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
          properties: { kind: 'terminal', id: stop.id, name: stop.name, color }
        })
      }
    }
    this.updateSource(TRANSIT_ROUTES_SOURCE_ID, { type: 'FeatureCollection', features })
  }

  private ensureTransitLayers(map: MapLibreMap): void {
    if (map.getSource(TRANSIT_ROUTES_SOURCE_ID)) return
    map.addSource(TRANSIT_ROUTES_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    })
    map.addLayer({
      id: TRANSIT_ROUTE_LINES_LAYER_ID,
      type: 'line',
      source: TRANSIT_ROUTES_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'route'],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 5,
        'line-opacity': 0.9
      }
    })
    map.addLayer({
      id: TRANSIT_TERMINALS_LAYER_ID,
      type: 'circle',
      source: TRANSIT_ROUTES_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'terminal'],
      paint: {
        'circle-radius': 7,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    })
  }

  private ensureBusLayers(map: MapLibreMap): void {
    if (!map.getSource(BUS_ROUTES_SOURCE_ID)) {
      map.addSource(BUS_ROUTES_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })
      map.addLayer({
        id: BUS_ROUTE_LINES_LAYER_ID,
        type: 'line',
        source: BUS_ROUTES_SOURCE_ID,
        filter: ['==', ['get', 'kind'], 'route'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 5,
          'line-opacity': 0.75
        }
      })
      map.addLayer({
        id: BUS_STOP_DOTS_LAYER_ID,
        type: 'circle',
        source: BUS_ROUTES_SOURCE_ID,
        filter: ['==', ['get', 'kind'], 'stop'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffffff',
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': 2
        }
      })
      map.addLayer({
        id: BUS_TERMINALS_LAYER_ID,
        type: 'circle',
        source: BUS_ROUTES_SOURCE_ID,
        filter: ['==', ['get', 'kind'], 'terminal'],
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      })
    }
    if (!map.getSource(BUSES_SOURCE_ID)) {
      map.addSource(BUSES_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      })
      map.addLayer({
        id: BUSES_LAYER_ID,
        type: 'circle',
        source: BUSES_SOURCE_ID,
        paint: {
          'circle-radius': 9,
          'circle-color': '#ea580c',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3
        }
      })
    }
  }

  private updateSource(id: string, data: object): void {
    const source = this.map?.getSource(id) as GeoJSONSource | undefined
    source?.setData(data as Parameters<GeoJSONSource['setData']>[0])
  }

  planWalkingRoute(_origin: GeoPoint, _destination: GeoPoint): Promise<RouteSummary> {
    return Promise.reject(new Error('网页内步行路线仅在高德地图模式下可用。'))
  }

  searchVisiblePois(_query: string): Promise<MapPoi[]> {
    return Promise.resolve([])
  }

  clearRoute(): void {}

  setLabelOverlapAllowed(allowed: boolean): void {
    this.labelOverlapAllowed = allowed

    if (this.map?.getLayer(POI_LABEL_LAYER_ID)) {
      this.map.setLayoutProperty(POI_LABEL_LAYER_ID, 'text-allow-overlap', allowed)
    }
  }

  destroy(): void {
    ++this.lifecycleVersion
    this.disposeMap()
    this.pois = []
    this.selectedPoiId = null
    this.pointPickedHandler = null
    this.poiSelectHandler = null
    this.areaSelectHandler = null
    this.mapErrorHandler = null
    this.fitAfterMount = false
    this.userLocation = null
  }

  private waitForLoad(map: MapLibreMap): Promise<void> {
    if (map.loaded()) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      let settled = false
      const timeoutRef: { id?: number } = {}
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        map.off('load', onLoad)
        if (timeoutRef.id !== undefined) window.clearTimeout(timeoutRef.id)
        this.cancelPendingLoad = null
        if (error) reject(error)
        else resolve()
      }
      // maplibre 6 的 load 监听器带事件参数；直接传 finish 会把事件对象当 error。
      const onLoad = () => finish()

      this.cancelPendingLoad = finish
      map.on('load', onLoad)
      timeoutRef.id = window.setTimeout(() => {
        finish(new Error('地图底图加载超时，请检查网络后重试。'))
      }, MAP_LOAD_TIMEOUT_MS)
    })
  }

  private registerMarkerImages(map: MapLibreMap): void {
    for (const [category, color] of Object.entries(MAP_MARKER_COLORS)) {
      for (const selected of [false, true]) {
        for (const hasActivities of [false, true]) {
          const imageId = getMarkerImageId(
            category as keyof typeof MAP_MARKER_COLORS,
            selected,
            hasActivities
          )

          if (!map.hasImage(imageId)) {
            map.addImage(imageId, createMarkerImage(color, selected, hasActivities), {
              pixelRatio: MAP_MARKER_PIXEL_RATIO
            })
          }
        }
      }
    }
  }

  private addCampusBoundaryLayers(map: MapLibreMap): void {
    map.addSource(CAMPUS_BOUNDARY_SOURCE_ID, {
      type: 'geojson',
      data: campusBoundary as unknown as GeoJSONSourceSpecification['data'],
      attribution: OSM_ATTRIBUTION
    })
    map.addLayer({
      id: CAMPUS_BOUNDARY_FILL_LAYER_ID,
      type: 'fill',
      source: CAMPUS_BOUNDARY_SOURCE_ID,
      paint: {
        'fill-color': '#2f6f55',
        'fill-opacity': 0.07
      }
    })
    map.addLayer({
      id: CAMPUS_BOUNDARY_LINE_LAYER_ID,
      type: 'line',
      source: CAMPUS_BOUNDARY_SOURCE_ID,
      paint: {
        'line-color': '#1f6b4f',
        'line-opacity': 0.82,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12,
          1,
          17,
          2.5
        ],
        'line-dasharray': [2, 1.5]
      }
    })
  }

  private prepareOfflineCanvas(element: HTMLElement): void {
    element.style.backgroundColor = '#e7efe9'
    element.style.backgroundImage = 'linear-gradient(rgb(23 111 70 / 8%) 1px, transparent 1px), linear-gradient(90deg, rgb(23 111 70 / 8%) 1px, transparent 1px)'
    element.style.backgroundPosition = 'center'
    element.style.backgroundRepeat = 'no-repeat'
    element.style.backgroundSize = '32px 32px, 32px 32px'
  }

  private addPoiLayers(map: MapLibreMap): void {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: this.toFeatureCollection(),
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 15
    })

    map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#2f6f55',
          10,
          '#087f8c',
          30,
          '#c45d2c',
          100,
          '#8f3040'
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          18,
          10,
          22,
          50,
          26
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    })

    map.addLayer({
      id: CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Open Sans Semibold'],
        'text-size': 12,
        'text-allow-overlap': true
      },
      paint: {
        'text-color': '#ffffff'
      }
    })

    map.addLayer({
      id: POI_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', 'markerImage'],
        'icon-anchor': 'bottom',
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          ['*', 0.68, ['get', 'markerScale']],
          14,
          ['*', 0.84, ['get', 'markerScale']],
          18,
          ['*', 0.94, ['get', 'markerScale']]
        ],
        'symbol-sort-key': ['get', 'sortKey'],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    })

    map.addLayer({
      id: POI_LABEL_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      minzoom: 14,
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['!=', ['get', 'selected'], true]
      ],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Regular'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14,
          11,
          18,
          13
        ],
        'text-anchor': 'bottom',
        'text-offset': [0, -4.2],
        'text-max-width': 10,
        'text-optional': true,
        'text-allow-overlap': this.labelOverlapAllowed
      },
      paint: {
        'text-color': '#1f2924',
        'text-halo-color': 'rgba(255, 255, 255, 0.94)',
        'text-halo-width': 1.5,
        'text-halo-blur': 0.5
      }
    })

    map.addLayer({
      id: SELECTED_POI_LABEL_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['==', ['get', 'selected'], true]
      ],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Semibold'],
        'text-size': 13,
        'text-anchor': 'bottom',
        'text-offset': [0, -4.2],
        'text-max-width': 10,
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': '#17211d',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
        'text-halo-blur': 0.5
      }
    })
  }

  private attachEvents(map: MapLibreMap): void {
    map.on('click', this.handleMapClick)
    map.on('mousemove', this.handleMouseMove)
    map.on('mouseout', this.handleMouseOut)
    this.eventsAttached = true
    this.updateCursor()
  }

  private detachEvents(map: MapLibreMap): void {
    if (!this.eventsAttached) {
      return
    }

    map.off('click', this.handleMapClick)
    map.off('mousemove', this.handleMouseMove)
    map.off('mouseout', this.handleMouseOut)
    this.eventsAttached = false
  }

  private readonly handleMapClick = (event: MapMouseEvent): void => {
    const map = this.map

    if (!map) {
      return
    }

    if (this.pointPickedHandler) {
      this.pointPickedHandler({
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
        crs: 'WGS84'
      })
      return
    }

    const feature = this.firstInteractiveFeature(event)

    if (!feature) {
      this.poiSelectHandler?.(null)
      return
    }

    if (feature.layer.id === CLUSTER_LAYER_ID) {
      this.poiSelectHandler?.(null)
      void this.expandCluster(feature)
      return
    }

    const poiId = feature.properties?.poiId
    const poi = typeof poiId === 'string'
      ? this.pois.find(candidate => candidate.id === poiId) ?? null
      : null

    this.poiSelectHandler?.(poi)
  }

  private readonly handleMouseMove = (event: MapMouseEvent): void => {
    const map = this.map

    if (!map) {
      return
    }

    if (this.pointPickedHandler) {
      map.getCanvas().style.cursor = 'crosshair'
      return
    }

    map.getCanvas().style.cursor = this.firstInteractiveFeature(event) ? 'pointer' : ''
  }

  private readonly handleMouseOut = (): void => {
    this.updateCursor()
  }

  private readonly handleMapError = (event: MapLibreErrorEvent): void => {
    this.mapErrorHandler?.(new Error(event.error?.message || 'MapLibre failed to load a required resource'))
  }

  private firstInteractiveFeature(event: MapMouseEvent): MapGeoJSONFeature | null {
    const map = this.map

    if (!map) {
      return null
    }

    const layers = INTERACTIVE_LAYER_IDS.filter(layerId => Boolean(map.getLayer(layerId)))
    return map.queryRenderedFeatures(event.point, { layers })[0] ?? null
  }

  private async expandCluster(feature: MapGeoJSONFeature): Promise<void> {
    const map = this.map
    const clusterId = Number(feature.properties?.cluster_id)

    if (!map || !Number.isFinite(clusterId) || feature.geometry.type !== 'Point') {
      return
    }

    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined

    if (!source) {
      return
    }

    try {
      const zoom = await source.getClusterExpansionZoom(clusterId)

      if (this.map !== map) {
        return
      }

      map.easeTo({
        center: feature.geometry.coordinates as [number, number],
        zoom,
        duration: 500
      })
    } catch {
      return
    }
  }

  private updateSourceData(): void {
    const source = this.map?.getSource(SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(this.toFeatureCollection())
  }

  private toFeatureCollection(): PoiFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: this.renderablePois().map((poi) => {
        const category = resolveMarkerCategory(poi.category)
        const selected = poi.id === this.selectedPoiId
        const hasActivities = poi.hasActivities === true

        return {
          type: 'Feature',
          id: poi.id,
          geometry: {
            type: 'Point',
            coordinates: [poi.point.lng, poi.point.lat]
          },
          properties: {
            poiId: poi.id,
            name: poi.name,
            category: poi.category,
            status: poi.status,
            markerImage: getMarkerImageId(category, selected, hasActivities),
            markerScale: selected ? 1.375 : 1,
            sortKey: selected ? 1 : 0,
            selected
          }
        }
      })
    }
  }

  private renderablePois(): MapPoi[] {
    return this.pois
      .map(poi => ({ poi, point: toWgs84Point(poi.point) }))
      .filter(entry => entry.point !== null)
      .map(({ poi, point }) => ({ ...poi, point: point! }))
  }

  private isRenderablePoint(point: GeoPoint): boolean {
    return Number.isFinite(point.lng)
      && Number.isFinite(point.lat)
      && point.lng >= -180
      && point.lng <= 180
      && point.lat >= -90
      && point.lat <= 90
  }

  private updateCursor(): void {
    if (!this.map) {
      return
    }

    this.map.getCanvas().style.cursor = this.pointPickedHandler ? 'crosshair' : ''
  }

  private disposeMap(): void {
    this.cancelPendingLoad?.()
    this.cancelPendingLoad = null

    if (!this.map) {
      return
    }

    this.detachEvents(this.map)
    if (this.errorEventAttached) {
      this.map.off('error', this.handleMapError)
      this.errorEventAttached = false
    }
    this.map.getCanvas().style.cursor = ''
    this.map.remove()
    this.map = null
    this.layersReady = false
  }
}
