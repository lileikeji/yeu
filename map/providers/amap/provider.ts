import type {
  AreaSelectHandler,
  BusSelectHandler,
  MapErrorHandler,
  MapBaseStyle,
  MapDisplayOptions,
  MapProvider,
  MapUserLocation,
  PoiSelectHandler,
  PointPickedHandler,
  RouteSummary
} from '../../core/provider'
import { YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS, YEU_CAMPUS_REFERENCE_CENTER } from '../../core/campus'
import { buildingSvg, clusterGlyph, vehicleSvg } from './marker-icons'
import type { BuildingKind } from './marker-icons'
import type { GeoPoint, MapArea, MapBus, MapBusRoute, MapMountOptions, MapPoi, MapPolygonArea, MapSpeedBump, MapTransitVehicle } from '../../core/types'
import { wgs84ToGcj02 as convertWgs84ToGcj02 } from '~~/shared/utils/coordinate-convert'
import { ensureAMapPlugins, loadAMap } from './loader'
import type {
  AMapCircle,
  AMapClusterRenderContext,
  AMapHotspotEvent,
  AMapInfoWindow,
  AMapLngLat,
  AMapMap,
  AMapMarker,
  AMapMarkerCluster,
  AMapMarkerClusterData,
  AMapMarkerClusterEvent,
  AMapMarkerRenderContext,
  AMapMouseEvent,
  AMapNamespace,
  AMapPlacePoi,
  AMapPlaceSearchResult,
  AMapPosition,
  AMapTileLayer,
  AMapPolyline,
  AMapWalking
} from './types'

const DEFAULT_ZOOM = 14
const SINGLE_POI_ZOOM = 17
const CONVERSION_BATCH_SIZE = 40
// 聚合阈值：格子越小、拆分 zoom 越早，放大两级就能把学生街拆成带名字的单点。
// 原 56px/17 级在手机上要捏到很深才拆，观感"卡片不全"。
const CLUSTER_GRID_SIZE = 40
const CLUSTER_MAX_ZOOM = 16
// 标点最小显示级别：低于此级别只留底图，避免几十个房子挤在一起互相压字。
const POI_MIN_ZOOM = 16
const ROUTE_TIMEOUT_MS = 15_000
const PLACE_SEARCH_TIMEOUT_MS = 8_000
// A map click resolves to a base-map POI only when a merchant is within this
// distance of the click point. Larger radii surfaced distant POIs for clicks
// on empty map area (random cards); 40m keeps real marker clicks precise.
const PROXIMITY_ACCEPT_METRES = 40

function haversineMetres(from: AMapPosition, to: AMapPosition): number {
  const rad = Math.PI / 180
  const dLat = (to[1] - from[1]) * rad
  const dLng = (to[0] - from[0]) * rad
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(from[1] * rad) * Math.cos(to[1] * rad) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const DEFAULT_DISPLAY_OPTIONS: MapDisplayOptions = {
  showPois: true,
  showAreas: true,
  showLabels: true,
  autoCluster: false,
  labelSize: 'small'
}

/**
 * WGS84→GCJ02 本地换算（标准公开算法）。此前依赖高德 convertFrom 网络接口，
 * 弱网/超时会导致整批标点丢失或退回 WGS84 直接绘制（≈450m 系统偏移）；该算法
 * 在本区域已与高德返回对拍验证（八洛克台球 6 位小数一致），改为本地计算后标点
 * 位置确定、首帧更快、不再受转换接口可用性影响。
 */
function wgs84ToGcj02(lng: number, lat: number): AMapPosition {
  const converted = convertWgs84ToGcj02(lng, lat)
  return [converted.longitude, converted.latitude]
}

const LABEL_FONT_SIZES = {
  'extra-small': 10,
  'small': 10,
  'medium': 12,
  'large': 14
} as const

const CATEGORY_COLORS: Record<string, string> = {
  'campus-building': '#176f46',
  'dorm': '#2d6f8e',
  'food': '#d95708',
  'service': '#52525b',
  'express': '#7c3aed',
  'gate': '#b43c0b',
  'nearby': '#087f8c'
}

const CATEGORY_GLYPHS: Record<string, string> = {
  'campus-building': '教',
  'dorm': '住',
  'food': '食',
  'service': '服',
  'express': '递',
  'gate': '门',
  'nearby': '店'
}

interface AMapProviderOptions {
  key: string
  securityCode: string
}

/** 校车线路强调色（橙/青循环），与设计规范的线状强调色一致。 */
const BUS_ROUTE_COLORS = ['#ea580c', '#0d9488'] as const

interface ConvertedPoi {
  poi: MapPoi
  position: AMapPosition
}

interface MarkerRecord extends ConvertedPoi {
  fitMarker: AMapMarker
}

interface PlainMarkerRecord {
  marker: AMapMarker
  clickHandler: (event: AMapMouseEvent) => void
}

interface AreaOutlineRecord {
  areaId: string
  outline: AMapPolyline
  clickHandler: (event: AMapMouseEvent) => void
  strokeColor: string
}

interface AreaLabelRecord {
  areaId: string
  marker: AMapMarker
  element: HTMLElement
  clickHandler: (event: AMapMouseEvent) => void
  strokeColor: string
}

export class AMapProvider implements MapProvider {
  readonly id = 'amap' as const
  private readonly options: AMapProviderOptions
  private amap: AMapNamespace | null = null
  private map: AMapMap | null = null
  private pois: MapPoi[] = []
  private areas: MapArea[] = []
  private markers = new Map<string, MarkerRecord>()
  private plainMarkers: PlainMarkerRecord[] = []
  private areaOutlines: AreaOutlineRecord[] = []
  private areaLabels: AreaLabelRecord[] = []
  private baseLayers: AMapTileLayer[] = []
  private hotspotInfoWindow: AMapInfoWindow | null = null
  private lastHotspotSelectedAt = 0
  private markerCluster: AMapMarkerCluster | null = null
  private walking: AMapWalking | null = null
  private selectedMarker: AMapMarker | null = null
  private selectedMarkerClickHandler: ((event: AMapMouseEvent) => void) | null = null
  private selectedPoiId: string | null = null
  private buses: MapBus[] = []
  private busMarkers = new Map<string, { marker: AMapMarker, token: object, icon: HTMLElement | null }>()
  /** 上次位置与车头朝向（度，正北 0° 顺时针），用于按位移方向推朝向、过弯时平滑。 */
  private busHeadings = new Map<string, { lng: number, lat: number, heading: number }>()
  private busSelectHandler: BusSelectHandler | null = null
  private transitVehicleHeadings = new Map<string, { lng: number, lat: number, heading: number }>()
  /** 公交 GPS 跳点闸门：记录上次认账的位置与连续跳点次数。 */
  private transitVehicleAnchors = new Map<string, { lng: number, lat: number, rejects: number, at: number }>()
  private busRoutes: MapBusRoute[] = []
  private busRoutePolylines: AMapPolyline[] = []
  private busStopMarkers: AMapMarker[] = []
  private busRouteToken: object = {}
  private transitRoutes: MapBusRoute[] = []
  private transitRoutePolylines: AMapPolyline[] = []
  private transitStopMarkers: AMapMarker[] = []
  private transitRouteToken: object = {}
  private transitVehicles: MapTransitVehicle[] = []
  private transitVehicleMarkers: AMapMarker[] = []
  private speedBumps: MapSpeedBump[] = []
  /** 底图 POI 注记是否显示（关闭后高德不再画「XX 楼」「XX 店」这类自带文字）。 */
  private basemapLabels = false
  /** 上一次重建标点时的缩放级别，用于判断是否跨过 POI_MIN_ZOOM。 */
  private lastPoiZoom = 0
  private speedBumpMarkers: AMapMarker[] = []
  private speedBumpToken: object = {}
  private transitVehicleToken: object = {}
  private poiSelectHandler: PoiSelectHandler | null = null
  private areaSelectHandler: AreaSelectHandler | null = null
  private selectedAreaId: string | null = null
  private mapErrorHandler: MapErrorHandler | null = null
  private userLocationMarker: AMapMarker | null = null
  private userLocationAccuracyCircle: AMapCircle | null = null
  private userLocation: MapUserLocation | null = null
  private displayOptions: MapDisplayOptions = { ...DEFAULT_DISPLAY_OPTIONS }
  private baseStyle: MapBaseStyle = 'standard'
  private fitAfterRender = false
  /** 最近一次确认就绪的 canvas 尺寸 key（如 "750x1334"）；尺寸变化时允许再次重建 overlay。 */
  private settledCanvasKey = ''
  private mapElement: HTMLElement | null = null
  /** 标点全量重建（含坐标转换）是否仍在进行；canvas 就绪恢复需等它完成再重建 overlay。 */
  private markersRebuildInFlight = false
  /** canvas 就绪恢复在重建进行中被挂起时置位，重建结束后补跑。 */
  private pendingOverlayRebuild = false
  /** 首帧后的一次性 overlay 重排兜底（见 scheduleOverlaySettleRetry）。 */
  private overlaySettleRetryTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private overlaySettleRetried = false
  /** 上一次成功渲染的标点 id 序列；集合未变化时跳过整套重建。 */
  private lastRenderedPoiKey = ''
  private lifecycleVersion = 0
  private renderVersion = 0
  private areaRenderVersion = 0
  private mapAccessibilityObserver: MutationObserver | null = null
  private initialResizeTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private initialResizeObserver: ResizeObserver | null = null
  private readonly pluginPromises = new Map<string, Promise<boolean>>()

  constructor(options: AMapProviderOptions) {
    this.options = options
  }

  async mount(element: HTMLElement, options: MapMountOptions = {}): Promise<void> {
    this.disposeMap()
    this.mapElement = element
    const lifecycleVersion = ++this.lifecycleVersion
    const amap = await loadAMap(this.options)

    if (lifecycleVersion !== this.lifecycleVersion) return

    // Create the map against the raw WGS84 point instead of awaiting
    // convertFrom. That call goes to restapi.amap.com and can stall for the
    // full conversion timeout when the key is rejected, which delays
    // construction until after the container has been re-laid out and leaves
    // AMap with a 0x0 canvas. The campus-wide WGS84/GCJ-02 offset is a few
    // tens of metres, and the precise centre is applied below once available.
    const requestedCenter = options.center ?? YEU_CAMPUS_REFERENCE_CENTER
    const center: AMapPosition = [requestedCenter.lng, requestedCenter.lat]

    const map = new amap.Map(element, {
      center,
      zoom: options.zoom ?? DEFAULT_ZOOM,
      viewMode: '2D',
      resizeEnable: true,
      showLabel: true,
      isHotspot: true,
      features: ['bg', 'road', 'building', 'point']
    })
    this.amap = amap
    this.map = map
    this.installMapAccessibility(element)
    this.applyBaseStyle()
    this.scheduleInitialResize(map, element, lifecycleVersion)
    map.on('click', this.handleMapClick)
    map.on('hotspotclick', this.handleHotspotClick)

    // Refine the centre in the background. A rejected key simply leaves the
    // raw WGS84 centre in place rather than blocking the basemap.
    void this.convertPoint(requestedCenter, amap).then((precise) => {
      if (!precise || this.map !== map || lifecycleVersion !== this.lifecycleVersion) return
      try {
        map.setZoomAndCenter(map.getZoom(), precise)
      } catch {
        // Recentring is cosmetic; the basemap is already visible.
      }
    })
    this.applyBasemapLabels()
    ;(map as unknown as { on(event: string, handler: () => void): void }).on('zoomchange', this.handleZoomChange)
    ;(map as unknown as { on(event: string, handler: () => void): void }).on('moveend', this.handleViewChange)
    this.lastPoiZoom = map.getZoom()
    await Promise.all([this.rebuildMarkers(), this.rebuildAreas()])

    // 地图就绪后补画「我的位置」：定位 fix 可能早于 SDK 加载完成到达，
    // setUserLocation 在 map 未就绪时只存不画，这里恢复绘制。
    if (this.userLocation) this.setUserLocation(this.userLocation)
    // 校外公交同理：默认打开时页面可能早于 SDK 就绪就调了，这里补画。
    if (this.transitRoutes.length) this.setTransitRoutes(this.transitRoutes)
    if (this.transitVehicles.length) this.setTransitVehicles(this.transitVehicles)
    if (this.speedBumps.length) this.setSpeedBumps(this.speedBumps)

    // Clustering is optional. If the embedded browser finishes loading it
    // later, upgrade the already-visible plain markers without remounting the
    // AMap instance or interrupting the user.
    void this.ensurePlugins(['AMap.MarkerCluster']).then((available) => {
      if (available && this.map === map && this.displayOptions.autoCluster) {
        this.startRenderTask(this.rebuildMarkers(), '高德地图标点刷新失败。')
      }
    })
  }

  /** 底图注记开关：关掉高德自带的 POI 文字，地图只留项目自己的标点。 */
  /**
   * 底图注记：默认「只看校园外」——视线在校园里时把高德 POI 文字收掉（我们自己的
   * 建筑图标已经占位，两套文字会糊成一片），视线离开校园再放回来。
   * 传 true 是强制全开（用户点了按钮）。
   */
  setBasemapLabels(visible: boolean): void {
    this.basemapLabels = visible
    this.applyBasemapLabels()
  }

  /** 当前视野中心是否落在校园范围内（校园里才收注记）。 */
  private viewportInsideCampus(): boolean {
    const map = this.map as unknown as { getCenter(): { getLng(): number, getLat(): number } } | null
    if (!map) return false
    const center = map.getCenter()
    const lng = center.getLng()
    const lat = center.getLat()
    return lng >= YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS.west
      && lng <= YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS.east
      && lat >= YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS.south
      && lat <= YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS.north
  }

  private applyBasemapLabels(): void {
    const map = this.map
    if (!map) return
    const hideInside = !this.basemapLabels && this.viewportInsideCampus()
    const features = hideInside
      ? ['bg', 'road', 'building']
      : ['bg', 'road', 'building', 'point']
    try {
      ;(map as unknown as { setFeatures(features: string[]): void }).setFeatures(features)
    } catch {
      // 老版本 SDK 不支持 setFeatures 时保持默认底图，不影响标点。
    }
  }

  /** 缩放跨过 POI_MIN_ZOOM 时重建标点，避免在挤成一团的级别画一堆房子。 */
  private handleZoomChange = (): void => {
    this.applyBasemapLabels()
    const zoom = this.map?.getZoom() ?? 0
    const crossed = (zoom >= POI_MIN_ZOOM) !== (this.lastPoiZoom >= POI_MIN_ZOOM)
    this.lastPoiZoom = zoom
    if (crossed) this.startRenderTask(this.rebuildMarkers(), '高德地图标点刷新失败。')
  }

  private handleViewChange = (): void => {
    this.applyBasemapLabels()
  }

  setPois(pois: MapPoi[]): void {
    const nextKey = pois.map(poi => poi.id).join('|')
    const unchanged = nextKey === this.lastRenderedPoiKey && this.pois.length === pois.length
    this.pois = [...pois]
    if (this.selectedPoiId && !this.pois.some(poi => poi.id === this.selectedPoiId)) {
      this.selectedPoiId = null
    }
    if (unchanged && this.markers.size === pois.length && !this.markersRebuildInFlight) {
      // 列表内容没变（同一批 id）：跳过整套清空/重建，避免移动端反复 teardown 造成闪烁与卡顿。
      return
    }
    this.startRenderTask(this.rebuildMarkers(), '高德地图标点刷新失败。')
  }

  setAreas(areas: MapArea[]): void {
    this.areas = [...areas]
    this.startRenderTask(this.rebuildAreas(), '高德地图区域刷新失败。')
  }

  setDisplayOptions(options: MapDisplayOptions): void {
    const markerRenderingChanged = options.showPois !== this.displayOptions.showPois
      || options.showLabels !== this.displayOptions.showLabels
      || options.autoCluster !== this.displayOptions.autoCluster
      || options.labelSize !== this.displayOptions.labelSize
    const areaRenderingChanged = options.showAreas !== this.displayOptions.showAreas
      || options.showLabels !== this.displayOptions.showLabels
      || options.labelSize !== this.displayOptions.labelSize
    this.displayOptions = { ...options }
    if (markerRenderingChanged) {
      this.startRenderTask(this.rebuildMarkers(), '高德地图标点刷新失败。')
    }
    if (areaRenderingChanged) {
      this.startRenderTask(this.rebuildAreas(), '高德地图区域刷新失败。')
    }
  }

  setBaseStyle(style: MapBaseStyle): boolean {
    this.baseStyle = style
    this.applyBaseStyle()
    return true
  }

  resize(): void {
    this.map?.resize()
  }

  fitToPois(): void {
    const map = this.map
    if (!map || (this.markers.size === 0 && this.areaOutlines.length === 0)) {
      this.fitAfterRender = true
      return
    }

    const markers = [...this.markers.values()].map(record => record.fitMarker)
    const overlays = [...this.areaOutlines.map(record => record.outline), ...markers]
    if (markers.length === 1 && this.areaOutlines.length === 0) {
      const first = this.markers.values().next().value as MarkerRecord | undefined
      if (first) map.setZoomAndCenter(Math.max(map.getZoom(), SINGLE_POI_ZOOM), first.position)
      return
    }

    map.setFitView(overlays, false, [72, 56, 72, 56], SINGLE_POI_ZOOM)
  }

  enablePointPicker(_handler: PointPickedHandler): void {
    this.mapErrorHandler?.(new Error('高德显示层不支持反向写入 WGS84；后台采点固定使用 MapLibre。'))
  }

  disablePointPicker(): void {}

  onPoiSelect(handler: PoiSelectHandler): () => void {
    this.poiSelectHandler = handler
    return () => {
      if (this.poiSelectHandler === handler) this.poiSelectHandler = null
    }
  }

  onBusSelect(handler: BusSelectHandler): () => void {
    this.busSelectHandler = handler
    return () => {
      if (this.busSelectHandler === handler) this.busSelectHandler = null
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
      if (this.mapErrorHandler === handler) this.mapErrorHandler = null
    }
  }

  setSelectedPoi(id: string | null): void {
    this.selectedPoiId = id && this.pois.some(poi => poi.id === id) ? id : null
    this.renderSelectedMarker()
  }

  setSelectedArea(id: string | null): void {
    this.selectedAreaId = id && this.areas.some(area => area.id === id) ? id : null
    this.refreshAreaSelection()
  }

  flyToPoi(id: string): boolean {
    const record = this.markers.get(id)
    if (record && this.map) {
      this.map.setZoomAndCenter(Math.max(this.map.getZoom(), SINGLE_POI_ZOOM), record.position)
      return true
    }

    const poi = this.pois.find(candidate => candidate.id === id)
    return poi ? this.flyToPoint(poi.point) : false
  }

  flyToPoint(point: GeoPoint, zoom = SINGLE_POI_ZOOM): boolean {
    if (!this.isRenderablePoint(point) || !this.amap || !this.map) return false
    const amap = this.amap
    const map = this.map
    const lifecycleVersion = this.lifecycleVersion

    void this.convertPoint(point, amap).then((converted) => {
      if (converted && lifecycleVersion === this.lifecycleVersion && this.map === map) {
        map.setZoomAndCenter(zoom, converted)
      }
    })
    return true
  }

  /**
   * Renders the user's live location as a blue dot plus an accuracy circle.
   * The browser geolocation API reports WGS84, so the point goes through the
   * usual convertFrom('gps') path before being drawn on the GCJ-02 basemap.
   * Passing null removes both overlays.
   */
  setUserLocation(location: MapUserLocation | null): void {
    this.userLocation = location
    const map = this.map
    const amap = this.amap
    if (!map || !amap) return

    if (!location || !this.isRenderablePoint(location.point)) {
      this.clearUserLocation()
      return
    }

    const point = location.point
    const draw = (position: AMapPosition): void => {
      if (this.userLocation !== location) return // A newer update superseded this one.
      this.clearUserLocation()
      this.userLocationAccuracyCircle = new amap.Circle({
        center: position,
        radius: this.clampedAccuracy(location.accuracyMeters),
        strokeColor: 'rgba(37, 99, 235, 0.55)',
        strokeOpacity: 0.8,
        strokeWeight: 1,
        fillColor: 'rgba(37, 99, 235, 0.12)',
        fillOpacity: 0.28,
        zIndex: 900
      })
      this.userLocationMarker = new amap.Marker({
        position,
        anchor: 'center',
        content: this.createUserLocationDot(),
        zIndex: 950
      })
      map.add([this.userLocationAccuracyCircle, this.userLocationMarker])
    }

    if (point.crs === 'GCJ-02') {
      draw([point.lng, point.lat])
      return
    }
    void this.convertPoint(point, amap).then((converted) => {
      if (converted && this.userLocation === location) draw(converted)
    })
  }

  private createUserLocationDot(): HTMLElement {
    const element = document.createElement('button')
    element.type = 'button'
    element.title = '我的位置'
    element.setAttribute('aria-label', '我的位置')
    element.style.cssText = 'display:block;box-sizing:border-box;width:20px;height:20px;padding:0;border:3px solid #fff;border-radius:50%;background:#2563eb;box-shadow:0 0 0 2px rgb(37 99 235 / 35%),0 2px 6px rgb(0 0 0 / 25%);cursor:default;'
    return element
  }

  private clampedAccuracy(accuracyMeters: number | undefined): number {
    if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters)) return 30
    return Math.min(500, Math.max(8, accuracyMeters))
  }

  private clearUserLocation(): void {
    if (this.map) {
      const overlays: Array<AMapMarker | AMapCircle> = []
      if (this.userLocationMarker) overlays.push(this.userLocationMarker)
      if (this.userLocationAccuracyCircle) overlays.push(this.userLocationAccuracyCircle)
      if (overlays.length) this.map.remove(overlays)
    }
    this.userLocationMarker = null
    this.userLocationAccuracyCircle = null
  }

  /**
   * Renders live campus buses as chip markers on a dedicated dynamic layer.
   * Markers are diffed by id: existing ones move to the new position without a
   * teardown, missing ones are removed. Points follow the usual convertFrom
   * path for non-GCJ-02 coordinates.
   */
  setBuses(buses: MapBus[]): void {
    this.buses = [...buses]
    const map = this.map
    const amap = this.amap
    if (!map || !amap) return

    const seen = new Set<string>()
    for (const bus of buses) {
      seen.add(bus.id)
      if (!this.isRenderablePoint(bus.point)) {
        this.removeBusMarker(bus.id)
        continue
      }
      const record = this.busMarkers.get(bus.id)
      const token = record?.token ?? {}
      const heading = this.resolveHeading(this.busHeadings, bus.id, bus.point, bus.angleDeg)
      const draw = (position: AMapPosition): void => {
        const current = this.busMarkers.get(bus.id)
        if (current && current.token !== token) return // A newer update superseded this one.
        if (current) {
          current.marker.setPosition(position)
          if (current.icon) current.icon.innerHTML = vehicleSvg({ color: '#c2410c', angleDeg: heading, size: 40 })
          return
        }
        const chip = this.createBusChip(bus, heading)
        const marker = new amap.Marker({
          position,
          anchor: 'center',
          content: chip,
          zIndex: 920
        })
        const icon = chip.querySelector<HTMLElement>('[data-bus-icon]')
        this.busMarkers.set(bus.id, { marker, token, icon })
        map.add(marker)
      }
      if (bus.point.crs === 'GCJ-02') {
        draw([bus.point.lng, bus.point.lat])
      } else {
        void this.convertPoint(bus.point, amap).then((converted) => {
          if (converted) draw(converted)
        })
      }
    }
    for (const id of [...this.busMarkers.keys()]) {
      if (!seen.has(id)) this.removeBusMarker(id)
    }
  }

  /**
   * 车头朝向：优先用相邻两次位置的位移方向（真实行进方向），
   * 位置没动（在站里停着 / GPS 抖动 < 6 m）就沿用上次朝向；
   * 都没有时才退回接口给的 angle。跨 0°/360° 时取与上次最接近的等价角，避免瞬间翻转。
   */
  private resolveHeading(
    store: Map<string, { lng: number, lat: number, heading: number }>,
    key: string,
    point: { lng: number, lat: number },
    fallback?: number
  ): number {
    const last = store.get(key)
    let heading: number | null = null
    if (last) {
      const meters = haversineMeters(last, point)
      if (meters >= 6) heading = bearingDegrees(last, point)
      else heading = last.heading
    }
    if (heading === null) {
      heading = typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : 0
    }
    let normalized = ((heading % 360) + 360) % 360
    if (last) {
      while (normalized - last.heading > 180) normalized -= 360
      while (normalized - last.heading < -180) normalized += 360
    }
    store.set(key, { lng: point.lng, lat: point.lat, heading: normalized })
    return normalized
  }

  private removeBusMarker(id: string): void {
    const record = this.busMarkers.get(id)
    if (!record) return
    this.map?.remove(record.marker)
    this.busMarkers.delete(id)
  }

  private createBusChip(bus: MapBus, headingDeg: number): HTMLElement {
    const element = document.createElement('div')
    element.title = bus.siteName ? `${bus.name}（${bus.isAtSite ? '已到站' : '行驶中'}·${bus.siteName}）` : bus.name
    element.setAttribute('aria-label', element.title)
    // 车形图标 + 下方车名：整块随车头朝向旋转的是图标本身，文字保持水平可读。
    element.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;filter:drop-shadow(0 2px 4px rgb(0 0 0 / 35%));'
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      this.busSelectHandler?.(bus.id)
    })
    const icon = document.createElement('span')
    icon.dataset.busIcon = ''
    icon.style.cssText = 'display:grid;place-items:center;width:40px;height:40px;'
    icon.innerHTML = vehicleSvg({ color: '#c2410c', angleDeg: headingDeg, size: 40 })
    const label = document.createElement('span')
    label.textContent = bus.name
    label.style.cssText = 'padding:0 4px;border-radius:4px;background:rgb(255 255 255 / 92%);color:#9a3412;font:700 11px/1.5 system-ui,sans-serif;white-space:nowrap;'
    element.append(icon, label)
    return element
  }

  /**
   * Renders campus bus routes as colored polylines through their stops, with
   * labeled origin/destination chips and small dots for intermediate stops.
   */
  setBusRoutes(routes: MapBusRoute[]): void {
    this.busRoutes = [...routes]
    this.clearBusRoutes()
    const map = this.map
    const amap = this.amap
    if (!map || !amap || routes.length === 0) return

    const token = this.busRouteToken = {}
    for (const [index, route] of routes.entries()) {
      const color = route.color ?? BUS_ROUTE_COLORS[index % BUS_ROUTE_COLORS.length]!
      // 沿路形状优先（服务端高德算路），缺失回退站点直连。
      const linePoints = (route.polyline && route.polyline.length >= 2)
        ? route.polyline
        : route.stops.map(stop => stop.point)
      const stopPoints = route.stops.map(stop => stop.point)
      void this.convertPoints([...linePoints, ...stopPoints], amap).then((allPositions) => {
        if (this.busRouteToken !== token) return // A newer update superseded this one.
        const mapNow = this.map
        const amapNow = this.amap
        if (!mapNow || !amapNow) return
        const path = allPositions.slice(0, linePoints.length)
          .filter((position): position is AMapPosition => position !== null)
        const positions = allPositions.slice(linePoints.length)
        if (path.length >= 2) {
          const line = new amapNow.Polyline({
            path,
            strokeColor: color,
            strokeWeight: 5,
            strokeOpacity: 0.75,
            zIndex: 800
          })
          this.busRoutePolylines.push(line)
          mapNow.add(line)
        }
        route.stops.forEach((stop, stopIndex) => {
          const position = positions[stopIndex]
          if (!position) return
          const isTerminal = stop.isOrigin || stop.isDestination
          const marker = new amapNow.Marker({
            position,
            anchor: 'center',
            content: isTerminal ? this.createBusTerminalChip(stop, color) : this.createBusStopDot(color),
            zIndex: isTerminal ? 910 : 850
          })
          this.busStopMarkers.push(marker)
          mapNow.add(marker)
        })
      })
    }
  }

  private clearBusRoutes(): void {
    this.busRouteToken = {}
    const overlays: Array<AMapMarker | AMapPolyline> = [...this.busRoutePolylines, ...this.busStopMarkers]
    if (overlays.length) this.map?.remove(overlays)
    this.busRoutePolylines = []
    this.busStopMarkers = []
  }

  /**
   * 校外公交（K2/K6）独立图层：只在开关/线路变化时画一次。
   * 不复用 busRoutes 通道，否则会被校车的 5 s 轮询整层重绘。
   */
  setTransitRoutes(routes: MapBusRoute[]): void {
    // 先存下来：默认打开时页面会在 SDK 就绪前调用，就绪后由 init 补画
    this.transitRoutes = [...routes]
    this.clearTransitRoutes()
    const map = this.map
    const amap = this.amap
    if (!map || !amap || routes.length === 0) return

    const token = this.transitRouteToken = {}
    // 同一站点会在多方向/多线路重复出现，只画一次，避免叠成一坨
    const drawnStops = new Set<string>()
    for (const route of routes) {
      const color = route.color ?? '#1a6cf5'
      const linePoints = (route.polyline && route.polyline.length >= 2)
        ? route.polyline
        : route.stops.map(stop => stop.point)
      if (linePoints.length < 2) continue
      const terminals = route.stops.filter((stop) => {
        if (!stop.isOrigin && !stop.isDestination) return false
        const key = stop.name
        if (drawnStops.has(key)) return false
        drawnStops.add(key)
        return true
      })
      void this.convertPoints([...linePoints, ...terminals.map(stop => stop.point)], amap).then((allPositions) => {
        if (this.transitRouteToken !== token) return
        const mapNow = this.map
        const amapNow = this.amap
        if (!mapNow || !amapNow) return
        const path = allPositions.slice(0, linePoints.length)
          .filter((position): position is AMapPosition => position !== null)
        if (path.length >= 2) {
          const line = new amapNow.Polyline({
            path,
            strokeColor: color,
            strokeWeight: 6,
            strokeOpacity: 0.9,
            zIndex: 780,
            lineJoin: 'round'
          })
          this.transitRoutePolylines.push(line)
          mapNow.add(line)
        }
        terminals.forEach((stop, index) => {
          const position = allPositions[linePoints.length + index]
          if (!position) return
          const marker = new amapNow.Marker({
            position,
            anchor: 'center',
            content: this.createBusTerminalChip(stop, color),
            zIndex: 905
          })
          this.transitStopMarkers.push(marker)
          mapNow.add(marker)
        })
      })
    }
  }

  /**
   * 校园减速带图标层。数据是 WGS-84，交给 convertPoints 转 GCJ-02 再落图。
   */
  setSpeedBumps(bumps: MapSpeedBump[]): void {
    this.speedBumps = [...bumps]
    this.clearSpeedBumps()
    const map = this.map
    const amap = this.amap
    if (!map || !amap) return
    const token = this.speedBumpToken = {}
    void this.convertPoints(bumps.map(bump => bump.point), amap).then((positions) => {
      if (this.speedBumpToken !== token) return
      const mapNow = this.map
      const amapNow = this.amap
      if (!mapNow || !amapNow) return
      bumps.forEach((bump, index) => {
        const position = positions[index]
        if (!position) return
        const marker = new amapNow.Marker({
          position,
          anchor: 'center',
          content: this.createSpeedBumpIcon(bump),
          zIndex: 860
        })
        this.speedBumpMarkers.push(marker)
        mapNow.add(marker)
      })
    })
  }

  private clearSpeedBumps(): void {
    this.speedBumpToken = {}
    if (this.speedBumpMarkers.length) this.map?.remove(this.speedBumpMarkers)
    this.speedBumpMarkers = []
  }

  /** 减速带图标：黄黑斜纹小块 + 深色描边，远看仍能分辨，不抢 POI 的视觉。 */
  private createSpeedBumpIcon(bump: MapSpeedBump): HTMLElement {
    const element = document.createElement('div')
    element.title = `减速带 #${bump.label}（叮叮车到此踩到近 0）`
    element.setAttribute('aria-label', element.title)
    element.style.cssText = [
      'box-sizing:border-box',
      'width:20px',
      'height:13px',
      'border:1.5px solid #3f3f46',
      'outline:1.5px solid rgb(255 255 255 / 85%)',
      'border-radius:3px',
      'background:repeating-linear-gradient(135deg,#facc15 0 3px,#18181b 3px 6px)',
      'box-shadow:0 1px 3px rgb(0 0 0 / 35%)'
    ].join(';')
    return element
  }

  /**
   * 校外公交在途车辆。每 20 s 更新一次，与线路图层互不清除。
   * 坐标同样是 GCJ-02，直接落图。
   */
  setTransitVehicles(vehicles: MapTransitVehicle[]): void {
    this.transitVehicles = [...vehicles]
    this.clearTransitVehicles()
    const map = this.map
    const amap = this.amap
    if (!map || !amap) return

    const token = this.transitVehicleToken = {}
    const settled = vehicles.map(vehicle => this.settleTransitVehicle(vehicle))
    const points = settled.map(vehicle => vehicle.point)
    void this.convertPoints(points, amap).then((positions) => {
      if (this.transitVehicleToken !== token) return
      const mapNow = this.map
      const amapNow = this.amap
      if (!mapNow || !amapNow) return
      settled.forEach((vehicle, index) => {
        const position = positions[index]
        if (!position) return
        const marker = new amapNow.Marker({
          position,
          anchor: 'center',
          content: this.createTransitVehicleChip(vehicle),
          zIndex: 940
        })
        this.transitVehicleMarkers.push(marker)
        mapNow.add(marker)
      })
    })
  }

  private clearTransitVehicles(): void {
    this.transitVehicleToken = {}
    if (this.transitVehicleMarkers.length) this.map?.remove(this.transitVehicleMarkers)
    this.transitVehicleMarkers = []
  }

  /**
   * 公交 GPS 跳点闸门：20 秒一轮，隐含速度超过 20 m/s（72 km/h）就当跳点，
   * 继续用上次认账的位置（车不往回瞬移）；连续两轮都这样才认账。
   */
  private settleTransitVehicle(vehicle: MapTransitVehicle): MapTransitVehicle {
    const now = Date.now()
    const last = this.transitVehicleAnchors.get(vehicle.id)
    if (!last) {
      this.transitVehicleAnchors.set(vehicle.id, { lng: vehicle.point.lng, lat: vehicle.point.lat, rejects: 0, at: now })
      return vehicle
    }
    const seconds = Math.max(1, (now - last.at) / 1000)
    const meters = haversineMeters(last, vehicle.point)
    if (meters / seconds > 20) {
      last.rejects += 1
      last.at = now
      if (last.rejects < 2) {
        return { ...vehicle, point: { ...vehicle.point, lng: last.lng, lat: last.lat } }
      }
    }
    last.rejects = 0
    last.lng = vehicle.point.lng
    last.lat = vehicle.point.lat
    last.at = now
    return vehicle
  }

  private createTransitVehicleChip(vehicle: MapTransitVehicle): HTMLElement {
    const element = document.createElement('div')
    element.title = `${vehicle.plate} · 下一站 ${vehicle.nextStation}`
    element.setAttribute('aria-label', element.title)
    element.style.cursor = 'pointer'
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      this.busSelectHandler?.(`transit:${vehicle.plate}`)
    })
    element.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:3px',
      'box-sizing:border-box',
      'padding:2px 8px 2px 2px',
      'border:2px solid #fff',
      'border-radius:999px',
      'background:rgb(255 255 255 / 96%)',
      'color:' + (vehicle.color ?? '#1a6cf5'),
      'font:700 11px/1.5 system-ui,sans-serif',
      'white-space:nowrap',
      'box-shadow:0 1px 6px rgb(0 0 0 / 32%)'
    ].join(';')
    const plate = vehicle.plate.replace('闽C', '')
    const icon = document.createElement('span')
    icon.style.cssText = 'display:grid;place-items:center;flex:none;width:20px;height:20px;'
    const heading = this.resolveHeading(this.transitVehicleHeadings, vehicle.id, vehicle.point, vehicle.angleDeg)
    icon.innerHTML = vehicleSvg({ color: vehicle.color ?? '#1a6cf5', angleDeg: heading, size: 22 })
    const label = document.createElement('span')
    label.textContent = plate || '在途'
    element.append(icon, label)
    return element
  }

  private clearTransitRoutes(): void {
    this.transitRouteToken = {}
    const overlays: Array<AMapMarker | AMapPolyline> = [...this.transitRoutePolylines, ...this.transitStopMarkers]
    if (overlays.length) this.map?.remove(overlays)
    this.transitRoutePolylines = []
    this.transitStopMarkers = []
  }

  private createBusTerminalChip(stop: { name: string, isOrigin: boolean }, routeColor: string): HTMLElement {
    const element = document.createElement('div')
    element.title = `${stop.isOrigin ? '起点站' : '终点站'}：${stop.name}`
    element.setAttribute('aria-label', element.title)
    element.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:3px',
      'box-sizing:border-box',
      'padding:2px 8px 2px 5px',
      'border:2px solid #fff',
      'border-radius:999px',
      'background:#fff',
      'color:#18181b',
      'font:600 12px/1.4 system-ui,sans-serif',
      'white-space:nowrap',
      'box-shadow:0 1px 4px rgb(0 0 0 / 25%)',
      'cursor:default'
    ].join(';')
    const badge = document.createElement('span')
    badge.textContent = stop.isOrigin ? '起' : '终'
    badge.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:${routeColor};color:#fff;font-size:11px;line-height:1;`
    const label = document.createElement('span')
    label.textContent = stop.name
    element.append(badge, label)
    return element
  }

  private createBusStopDot(routeColor: string): HTMLElement {
    const element = document.createElement('div')
    element.title = '校车站点'
    element.style.cssText = [
      'box-sizing:border-box',
      'width:10px',
      'height:10px',
      'border:2px solid #fff',
      'border-radius:50%',
      `background:${routeColor}`,
      'box-shadow:0 1px 3px rgb(0 0 0 / 30%)',
      'cursor:default'
    ].join(';')
    return element
  }

  async planWalkingRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteSummary> {
    const amap = this.amap
    const map = this.map
    if (!amap || !map) throw new Error('高德地图尚未加载完成。')
    if (!await this.ensurePlugins(['AMap.Walking'])) {
      throw new Error('高德步行路线插件暂时不可用，请稍后重试。')
    }
    if (!this.isRenderablePoint(origin) || !this.isRenderablePoint(destination)) {
      throw new Error('起点或终点坐标无法用于路线规划。')
    }

    const [convertedOrigin, convertedDestination] = await this.convertPoints([origin, destination], amap)
    if (!convertedOrigin || !convertedDestination) throw new Error('路线坐标转换失败。')

    this.clearRoute()
    const walking = new amap.Walking({ map, hideMarkers: false, autoFitView: true })
    this.walking = walking

    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (error?: Error, summary?: RouteSummary) => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timeout)
        if (error) reject(error)
        else if (summary) resolve(summary)
      }
      const timeout = globalThis.setTimeout(() => {
        finish(new Error('步行路线规划超时，请稍后重试。'))
      }, ROUTE_TIMEOUT_MS)

      try {
        walking.search(convertedOrigin, convertedDestination, (status, result) => {
          if (status !== 'complete' || typeof result === 'string') {
            finish(new Error('暂时未找到可用的步行路线。'))
            return
          }
          const route = result.routes?.[0]
          const distanceMeters = Number(route?.distance)
          const durationSeconds = Number(route?.time)
          if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
            finish(new Error('高德地图返回的路线信息不完整。'))
            return
          }
          // 路口级指引：把高德返回的 steps 摘要成「指引文案 + 分段距离」。
          const rawSteps = Array.isArray(route?.steps) ? route.steps : []
          const steps = rawSteps
            .map(step => ({
              instruction: String((step as { instruction?: unknown })?.instruction ?? '').trim(),
              distanceMeters: Number((step as { distance?: unknown })?.distance)
            }))
            .filter(step => step.instruction.length > 0 && Number.isFinite(step.distanceMeters))
            .slice(0, 40)
          finish(undefined, steps.length
            ? { distanceMeters, durationSeconds, steps }
            : { distanceMeters, durationSeconds })
        })
      } catch {
        finish(new Error('步行路线规划调用失败。'))
      }
    })
  }

  searchVisiblePois(query: string): Promise<MapPoi[]> {
    const keyword = query.trim()
    const amap = this.amap
    const map = this.map
    if (!keyword || !amap || !map) return Promise.resolve([])

    return this.ensurePlugins(['AMap.PlaceSearch']).then((available) => {
      if (!available || this.amap !== amap || this.map !== map) return []

      const center = map.getCenter()
      const bounds = map.getBounds()
      const southWest = bounds.getSouthWest()
      const northEast = bounds.getNorthEast()
      const centerPosition: AMapPosition = [center.getLng(), center.getLat()]
      const radius = this.visibleSearchRadius(centerPosition, [northEast.getLng(), northEast.getLat()])

      const runSearch = (searchRadius: number | null, viewportFilter: boolean): Promise<MapPoi[]> => {
        const placeSearch = new amap.PlaceSearch({ pageSize: 50, pageIndex: 1, extensions: 'base' })
        return new Promise<MapPoi[]>((resolve) => {
          let settled = false
          const finish = (results: MapPoi[]) => {
            if (settled) return
            settled = true
            globalThis.clearTimeout(timeout)
            resolve(results)
          }
          const timeout = globalThis.setTimeout(() => finish([]), PLACE_SEARCH_TIMEOUT_MS)

          try {
            const callback = (status: string, result: AMapPlaceSearchResult | string) => {
              if (status !== 'complete' || typeof result === 'string') {
                finish([])
                return
              }
              const pois = this.readPlacePois(result)
                .filter((poi) => {
                  if (!viewportFilter) return true
                  const lng = poi.location?.getLng()
                  const lat = poi.location?.getLat()
                  return Number.isFinite(lng) && Number.isFinite(lat)
                    && lng! >= southWest.getLng() && lng! <= northEast.getLng()
                    && lat! >= southWest.getLat() && lat! <= northEast.getLat()
                })
                .map(poi => this.nativeMapPoi(poi))
                .filter((poi): poi is MapPoi => poi !== null)
              finish(pois)
            }
            if (searchRadius === null) {
              placeSearch.searchNearBy(keyword, centerPosition, radius, callback)
            } else {
              placeSearch.searchNearBy(keyword, centerPosition, searchRadius, callback)
            }
          } catch {
            finish([])
          }
        })
      }

      // Stage 1: viewport-scoped search (fast, precise). When the keyword is
      // not visible in the current view (e.g. the AMap app finds it but the
      // map is centred elsewhere), fall through to a wider school-region
      // search (30 km, no viewport filter) so merchants like "八洛克" that
      // sit outside the current camera still surface — same data the AMap
      // app shows. The auto-select flow then flies the camera to the hit.
      return runSearch(radius, true).then((visible) => {
        if (visible.length > 0) return visible
        return runSearch(30_000, false)
      })
    })
  }

  /**
   * Resolve the nearest POI at a given map position via PlaceSearch's
   * blank-keyword nearby search. Returns the closest candidate within
   * PROXIMITY_ACCEPT_METRES of the click point, or null when nothing is that
   * close. Used by map clicks so clicking a base-map merchant opens a yeu
   * card, while clicking empty map area still clears the selection instead of
   * randomly surfacing a distant POI.
   */
  private poiAtPosition(position: AMapPosition, radius: number): Promise<MapPoi | null> {
    const amap = this.amap
    const map = this.map
    if (!amap || !map) return Promise.resolve(null)
    return this.ensurePlugins(['AMap.PlaceSearch']).then((available) => {
      if (!available || this.amap !== amap || this.map !== map) return null
      const placeSearch = new amap.PlaceSearch({ pageSize: 10, pageIndex: 1, extensions: 'base' })
      return new Promise<MapPoi | null>((resolve) => {
        let settled = false
        const finish = (poi: MapPoi | null) => {
          if (settled) return
          settled = true
          globalThis.clearTimeout(timeout)
          resolve(poi)
        }
        const timeout = globalThis.setTimeout(() => finish(null), PLACE_SEARCH_TIMEOUT_MS)
        try {
          placeSearch.searchNearBy('', position, radius, (status, result) => {
            if (status !== 'complete' || typeof result === 'string') {
              finish(null)
              return
            }
            const pois = this.readPlacePois(result)
              .map((poi) => {
                const lng = poi.location?.getLng()
                const lat = poi.location?.getLat()
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
                return { poi, metres: haversineMetres(position, [lng!, lat!]) }
              })
              .filter((item): item is { poi: AMapPlacePoi, metres: number } => item !== null)
              .sort((left, right) => left.metres - right.metres)
            const nearest = pois[0]
            if (!nearest || nearest.metres > PROXIMITY_ACCEPT_METRES) {
              finish(null)
              return
            }
            finish(this.nativeMapPoi(nearest.poi))
          })
        } catch {
          finish(null)
        }
      })
    })
  }

  clearRoute(): void {
    this.walking?.clear()
    this.walking = null
  }

  destroy(): void {
    ++this.lifecycleVersion
    ++this.renderVersion
    if (this.overlaySettleRetryTimer !== null) {
      globalThis.clearTimeout(this.overlaySettleRetryTimer)
      this.overlaySettleRetryTimer = null
    }
    this.lastRenderedPoiKey = ''
    this.disposeMap()
    this.pois = []
    this.areas = []
    this.selectedPoiId = null
    this.poiSelectHandler = null
    this.areaSelectHandler = null
    this.mapErrorHandler = null
    this.fitAfterRender = false
  }

  private async rebuildMarkers(): Promise<void> {
    this.markersRebuildInFlight = true
    this.overlaySettleRetried = false
    try {
      const map = this.map
      const amap = this.amap
      if (!map || !amap) return

      const renderVersion = ++this.renderVersion
      this.clearMarkers()
      if (!this.displayOptions.showPois) return
      const renderable = this.pois.filter(poi => this.isRenderablePoint(poi.point))
      const converted: ConvertedPoi[] = []

      for (let index = 0; index < renderable.length; index += CONVERSION_BATCH_SIZE) {
        const batch = renderable.slice(index, index + CONVERSION_BATCH_SIZE)
        const positions = await this.convertPoints(batch.map(poi => poi.point), amap)
        if (renderVersion !== this.renderVersion || this.map !== map) return
        batch.forEach((poi, positionIndex) => {
          const position = positions[positionIndex]
          if (position) converted.push({ poi, position })
        })
      }

      for (const item of converted) {
        this.markers.set(item.poi.id, {
          ...item,
          fitMarker: new amap.Marker({
            position: item.position,
            anchor: 'bottom-center',
            title: item.poi.name
          })
        })
      }

      this.renderMarkerOverlay(converted, amap, map)
      this.lastRenderedPoiKey = this.pois.map(poi => poi.id).join('|')
      if (this.fitAfterRender) {
        this.fitAfterRender = false
        this.fitToPois()
      }
      // 成功渲染后再排一次兜底重排（见 scheduleOverlaySettleRetry 注释）。
      this.scheduleOverlaySettleRetry(map, renderVersion)
    } finally {
      this.markersRebuildInFlight = false
      // Canvas 就绪恢复在本次重建进行中被挂起时，重建完成后用完整缓存补跑，
      // 避免只按「已转换的部分标点」重建 overlay。重建被 renderVersion 中止
      // （缓存仍为空）时保留挂起，等下一次完整重建完成后补跑。
      if (this.pendingOverlayRebuild && this.markers.size > 0) {
        this.pendingOverlayRebuild = false
        this.rebuildMarkerOverlay()
      }
    }
  }

  /**
   * 微信内嵌 WebView 里 MarkerCluster 可能按「创建时的画布尺寸」布局标点，画布
   * 尺寸 key 不变时现有就绪检测不会触发重建，导致首屏只出现部分标点。布局稳定后
   * 从缓存强制重建 overlay 一次作为兜底（幂等、仅一次）。
   */
  private scheduleOverlaySettleRetry(map: AMapMap, _renderVersion: number): void {
    if (this.overlaySettleRetryTimer !== null) {
      globalThis.clearTimeout(this.overlaySettleRetryTimer)
      this.overlaySettleRetryTimer = null
    }
    this.overlaySettleRetryTimer = globalThis.setTimeout(() => {
      this.overlaySettleRetryTimer = null
      if (this.map !== map || this.overlaySettleRetried || this.markersRebuildInFlight || this.markers.size === 0) return
      if (!this.readCanvasSizeKey()) return
      this.overlaySettleRetried = true
      this.rebuildMarkerOverlay()
    }, 1600)
  }

  /**
   * Builds the visible marker overlay (cluster or plain pins) for a set of
   * already-converted positions. Shared by the initial render and the cached
   * re-render that runs once the AMap canvas has settled at its real size.
   */
  private renderMarkerOverlay(converted: ConvertedPoi[], amap: AMapNamespace, map: AMapMap): void {
    const zoom = this.map?.getZoom() ?? 0
    if (converted.length && zoom < POI_MIN_ZOOM) {
      // 缩小到挤成一团的级别：一个房子都不画（也不画聚合气泡），只留底图与选中项。
      this.renderSelectedMarker()
      return
    }
    if (converted.length && this.displayOptions.autoCluster && typeof amap.MarkerCluster === 'function') {
      try {
        const cluster = new amap.MarkerCluster(
          map,
          converted.map(item => ({
            lnglat: item.position,
            weight: 1,
            poiId: item.poi.id
          })),
          {
            gridSize: CLUSTER_GRID_SIZE,
            maxZoom: CLUSTER_MAX_ZOOM,
            averageCenter: true,
            clusterByZoomChange: true,
            renderMarker: this.renderMarker,
            renderClusterMarker: this.renderClusterMarker
          }
        )
        cluster.on('click', this.handleClusterClick)
        this.markerCluster = cluster
      } catch {
        this.renderPlainMarkers(converted, amap, map)
      }
    } else if (converted.length) {
      this.renderPlainMarkers(converted, amap, map)
    }

    this.renderSelectedMarker()
  }

  /**
   * Re-renders the marker overlay from the already-converted positions cached
   * in this.markers without calling the AMap coordinate-conversion API again.
   *
   * AMap.MarkerCluster lays markers out lazily against the canvas size present
   * at creation time. In embedded WebViews the canvas can still be 0x0 (or
   * otherwise wrong) when the cluster is first built, so pins end up missing
   * until a camera move forces AMap to re-layout them. Once the canvas settles
   * at its real size we rebuild the overlay from the cache so every marker is
   * visible immediately on load.
   */
  private rebuildMarkerOverlay(): void {
    const map = this.map
    const amap = this.amap
    if (!map || !amap) return

    // 全量重建（含坐标转换）仍在进行时挂起：等它在 finally 里用完整缓存补跑，
    // 否则会把进行中的转换循环作废，只渲染到已转换的部分标点。
    if (this.markersRebuildInFlight) {
      this.pendingOverlayRebuild = true
      return
    }

    const records = [...this.markers.values()]
    if (!records.length) return

    const converted: ConvertedPoi[] = records.map(record => ({
      poi: record.poi,
      position: record.position
    }))
    this.clearMarkers()
    for (const record of records) {
      this.markers.set(record.poi.id, record)
    }
    if (this.displayOptions.showPois) {
      this.renderMarkerOverlay(converted, amap, map)
    }
  }

  private onCanvasSettled(map: AMapMap, lifecycleVersion: number): void {
    if (this.map !== map || lifecycleVersion !== this.lifecycleVersion) return
    const key = this.readCanvasSizeKey()
    if (!key || key === this.settledCanvasKey) return
    this.settledCanvasKey = key
    this.rebuildMarkerOverlay()
  }

  private async rebuildAreas(): Promise<void> {
    const map = this.map
    const amap = this.amap
    if (!map || !amap) return

    this.clearAreas()
    if (!this.displayOptions.showAreas) return
    const renderVersion = ++this.areaRenderVersion
    const exactAreas = this.areas.filter((area): area is MapPolygonArea => (
      area.geometrySource === 'wia-shape-batch'
      && area.paths.length > 0
      && area.paths.every(path => path.length >= 3)
    ))

    for (const area of exactAreas) {
      const convertedPaths: AMapPosition[][] = []
      for (const path of area.paths) {
        const converted = await this.convertPoints(path, amap)
        if (renderVersion !== this.areaRenderVersion || this.map !== map) return
        if (converted.every((point): point is AMapPosition => point !== null)) {
          convertedPaths.push(converted)
        }
      }
      if (!convertedPaths.length) continue

      for (const path of convertedPaths) {
        const firstPoint = path[0]
        if (!firstPoint) continue
        const lastPoint = path[path.length - 1]
        const closedPath = lastPoint?.[0] === firstPoint[0] && lastPoint[1] === firstPoint[1]
          ? path
          : [...path, firstPoint]
        // 区域描边别用暖色实线——它和校车线路撞色，看起来像「画错的路线」。
        // 平时统一成灰色虚线，选中才恢复本色。
        const areaSelected = this.selectedAreaId === area.id
        const outline = new amap.Polyline({
          path: closedPath,
          strokeColor: areaSelected ? area.strokeColor : '#94a3b8',
          strokeWeight: areaSelected ? 2 : 1.4,
          strokeOpacity: areaSelected ? 0.9 : 0.45,
          strokeStyle: 'dashed',
          strokeDasharray: [5, 5],
          bubble: true,
          zIndex: 30
        })
        const clickHandler = (event: AMapMouseEvent) => {
          event.originEvent?.stopPropagation()
          this.selectArea(area)
        }
        outline.on('click', clickHandler)
        this.areaOutlines.push({ areaId: area.id, outline, clickHandler, strokeColor: area.strokeColor })
      }
      const allPoints = convertedPaths.flat()
      const center: AMapPosition = [
        allPoints.reduce((sum, point) => sum + point[0], 0) / allPoints.length,
        allPoints.reduce((sum, point) => sum + point[1], 0) / allPoints.length
      ]
      if (this.displayOptions.showLabels) {
        const label = document.createElement('span')
        label.textContent = area.name
        label.title = area.name
        label.className = this.selectedAreaId === area.id
          ? 'yeu-amap-area-label yeu-amap-area-label-selected'
          : 'yeu-amap-area-label'
        label.style.cssText = this.areaLabelStyle(area.strokeColor, this.selectedAreaId === area.id)
        const marker = new amap.Marker({
          position: center,
          anchor: 'center',
          content: label,
          clickable: true,
          bubble: true,
          offset: new amap.Pixel(-label.textContent.length * 6 - 7, -10),
          zIndex: 31
        })
        const labelClickHandler = (event: AMapMouseEvent) => {
          event.originEvent?.stopPropagation()
          this.selectArea(area)
        }
        marker.on('click', labelClickHandler)
        this.areaLabels.push({ areaId: area.id, marker, element: label, clickHandler: labelClickHandler, strokeColor: area.strokeColor })
      }
    }

    if (this.areaOutlines.length) {
      map.add([...this.areaOutlines.map(record => record.outline), ...this.areaLabels.map(record => record.marker)])
      this.refreshAreaSelection()
    }
  }

  /**
   * Marker/area updates are intentionally fire-and-forget because they can be
   * triggered by reactive state changes. Contain provider SDK exceptions here
   * so a rejected AMap promise cannot become an unhandled rejection and take
   * down the mobile page.
   */
  private startRenderTask(task: Promise<void>, fallbackMessage: string): void {
    void task.catch((error: unknown) => {
      const normalized = error instanceof Error ? error : new Error(fallbackMessage)
      this.mapErrorHandler?.(normalized)
    })
  }

  private ensurePlugins(plugins: readonly string[]): Promise<boolean> {
    const amap = this.amap
    if (!amap) return Promise.resolve(false)
    const key = plugins.join(',')
    const existing = this.pluginPromises.get(key)
    if (existing) return existing

    const promise = ensureAMapPlugins(amap, plugins, 8_000).then((available) => {
      if (!available) this.pluginPromises.delete(key)
      return available
    })
    this.pluginPromises.set(key, promise)
    return promise
  }

  private renderPlainMarkers(converted: ConvertedPoi[], amap: AMapNamespace, map: AMapMap): void {
    for (const item of converted) {
      const { content } = this.createMarkerContent(item.poi)
      const marker = new amap.Marker({
        position: item.position,
        anchor: 'bottom-center',
        title: item.poi.name,
        content,
        zIndex: 100
      })
      const clickHandler = (event: AMapMouseEvent) => {
        event.originEvent?.stopPropagation()
        this.poiSelectHandler?.(item.poi)
      }
      marker.on('click', clickHandler)
      this.plainMarkers.push({ marker, clickHandler })
    }
    map.add(this.plainMarkers.map(record => record.marker))
  }

  private createMarkerContent(
    poi: MapPoi,
    options: { selected?: boolean, onClick?: () => void } = {}
  ): { content: HTMLButtonElement, label: HTMLSpanElement } {
    const selected = options.selected === true
    const element = document.createElement('button')
    element.type = 'button'
    element.title = poi.name
    element.setAttribute('aria-label', poi.name)
    element.style.cssText = 'position:relative;display:block;box-sizing:border-box;width:44px;height:50px;padding:0;border:0;background:transparent;color:#18181b;font:500 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;filter:drop-shadow(0 3px 5px rgb(0 0 0 / 22%));'

    const label = document.createElement('span')
    label.className = selected ? 'yeu-amap-poi-label yeu-amap-poi-label-selected' : 'yeu-amap-poi-label'
    label.textContent = poi.name
    // 小屏（<640px）收窄标签，减少街道层级名字互相压盖。
    const labelMaxWidth = typeof window !== 'undefined' && window.innerWidth < 640 ? 126 : 172
    // 名字直接压在房子下面，不要白底胶囊：只留一圈白色描边保证可读，字比图标小一号。
    label.style.cssText = `pointer-events:none;position:absolute;top:44px;left:50%;z-index:2;display:${this.displayOptions.showLabels ? 'block' : 'none'};max-width:${labelMaxWidth}px;overflow:hidden;padding:0 2px;border:0;border-radius:0;background:transparent;box-shadow:none;color:${selected ? '#176f46' : '#3f3f46'};text-shadow:0 0 2px #fff,0 0 2px #fff,0 1px 3px rgb(255 255 255 / 95%);font-size:${LABEL_FONT_SIZES[this.displayOptions.labelSize]}px;font-weight:${selected ? '700' : '600'};letter-spacing:0;opacity:1;text-overflow:ellipsis;transform:translateX(-50%);visibility:visible;white-space:nowrap;`
    label.style.opacity = '1'
    label.style.visibility = 'visible'

    const pin = document.createElement('span')
    pin.setAttribute('aria-hidden', 'true')
    const categoryColor = CATEGORY_COLORS[poi.category] ?? '#176f46'
    // 楼栋按类别画不同屋顶/立面（教学楼/宿舍/食堂/服务/快递/校门/周边），
    // 缩到 30px 仍能凭轮廓区分，比统一的圆角胶囊好认。
    pin.style.cssText = `position:absolute;bottom:4px;left:5px;display:grid;box-sizing:border-box;width:34px;height:34px;place-items:center;filter:drop-shadow(0 3px 6px rgb(0 0 0 / 30%))${selected ? ' saturate(1.2)' : ''};`
    pin.innerHTML = buildingSvg((poi.category as BuildingKind) ?? 'campus-building', { size: 24, color: categoryColor })

    if (options.onClick) {
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        options.onClick?.()
      })
    }

    element.append(label, pin)
    return { content: element, label }
  }

  /**
   * 聚合气泡：外圈是数量，内嵌一个小剪影（宿舍/校车/通用），
   * 这样缩小到街区级别也能看出「这坨是宿舍」而不是一堆数字。
   */
  private createClusterContent(count: number, glyph: 'dorm' | 'bus' | 'plain' = 'plain'): HTMLButtonElement {
    const size = count >= 50 ? 56 : count >= 10 ? 50 : 44
    const element = document.createElement('button')
    element.type = 'button'
    element.title = `${count} 个地点，点击放大`
    element.setAttribute('aria-label', element.title)
    const palette = count >= 50
      ? 'linear-gradient(145deg,#b44456,#742536)'
      : count >= 10
        ? 'linear-gradient(145deg,#12a3ad,#08717c)'
        : 'linear-gradient(145deg,#24915f,#12613f)'
    element.style.cssText = `position:relative;display:grid;box-sizing:border-box;width:${size}px;height:${size}px;place-items:center;padding:0;border:3px solid rgb(255 255 255 / 96%);border-radius:50%;background:${palette};box-shadow:0 0 0 5px rgb(255 255 255 / 26%),0 4px 14px rgb(0 0 0 / 28%);color:#fff;font:800 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;`

    const stack = document.createElement('span')
    stack.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:1px;line-height:1;'
    if (glyph !== 'plain') {
      const icon = document.createElement('span')
      icon.style.cssText = 'display:block;opacity:.95;'
      icon.innerHTML = clusterGlyph(glyph)
      stack.append(icon)
    }
    const text = document.createElement('span')
    text.textContent = String(count)
    text.style.cssText = `font:800 ${size >= 50 ? 13 : 12}px/1 system-ui,sans-serif;`
    stack.append(text)
    element.append(stack)
    return element
  }

  /** 聚合里宿舍占一半以上就画房子，否则保持数字。 */
  private clusterGlyphFor(context: AMapClusterRenderContext): 'dorm' | 'bus' | 'plain' {
    const data = context.clusterData ?? []
    if (!data.length) return 'plain'
    let dorm = 0
    for (const item of data) {
      const poiId = (item as { poiId?: string }).poiId
      const poi = poiId ? this.markers.get(poiId)?.poi : null
      if (poi?.category === 'dorm') dorm += 1
    }
    return dorm * 2 >= data.length ? 'dorm' : 'plain'
  }

  private readonly renderMarker = (context: AMapMarkerRenderContext): void => {
    const data = this.readMarkerData(context.data)
    const record = data ? this.markers.get(data.poiId) : null
    if (!record) return

    const { content } = this.createMarkerContent(record.poi, {
      onClick: () => this.poiSelectHandler?.(record.poi)
    })
    context.marker.setContent(content)
    if (this.amap) context.marker.setOffset(new this.amap.Pixel(-22, -50))
  }

  private readonly renderClusterMarker = (context: AMapClusterRenderContext): void => {
    context.marker.setContent(this.createClusterContent(context.count, this.clusterGlyphFor(context)))
    const size = context.count >= 50 ? 56 : context.count >= 10 ? 50 : 44
    if (this.amap) context.marker.setOffset(new this.amap.Pixel(-size / 2, -size / 2))
  }

  private renderSelectedMarker(): void {
    this.clearSelectedMarker()
    if (!this.displayOptions.showPois || !this.selectedPoiId || !this.amap || !this.map) return

    const record = this.markers.get(this.selectedPoiId)
    if (!record) return

    const { content } = this.createMarkerContent(record.poi, { selected: true })
    const marker = new this.amap.Marker({
      position: record.position,
      anchor: 'bottom-center',
      title: record.poi.name,
      content,
      zIndex: 1200
    })
    const clickHandler = (event: AMapMouseEvent) => {
      event.originEvent?.stopPropagation()
      this.poiSelectHandler?.(record.poi)
    }
    marker.on('click', clickHandler)
    this.selectedMarker = marker
    this.selectedMarkerClickHandler = clickHandler
    this.map.add(marker)
  }

  private clearSelectedMarker(): void {
    if (!this.selectedMarker) return
    if (this.selectedMarkerClickHandler) {
      this.selectedMarker.off('click', this.selectedMarkerClickHandler)
    }
    this.map?.remove(this.selectedMarker)
    this.selectedMarker = null
    this.selectedMarkerClickHandler = null
  }

  private readMarkerData(
    value: AMapMarkerClusterData | AMapMarkerClusterData[] | undefined
  ): AMapMarkerClusterData | null {
    const candidates = Array.isArray(value) ? value : value ? [value] : []
    return candidates.find(candidate => typeof candidate.poiId === 'string') ?? null
  }

  private readonly handleClusterClick = (event: AMapMarkerClusterEvent): void => {
    const data = event.clusterData ?? []
    if (data.length !== 1) {
      if (data.length > 1) {
        // 多点聚合：点击即向该处放大两级，手机上不用捏合也能逐层钻到单点。
        const map = this.map
        const lnglat = (event as { lnglat?: { getLng?: () => number, getLat?: () => number } }).lnglat
        const getLng = lnglat?.getLng
        const getLat = lnglat?.getLat
        if (map && typeof getLng === 'function' && typeof getLat === 'function') {
          const next = Math.min(18, Math.max(15, map.getZoom() + 2))
          map.setZoomAndCenter(next, [getLng(), getLat()])
        }
      }
      return
    }

    const record = this.markers.get(data[0]!.poiId)
    if (record) this.poiSelectHandler?.(record.poi)
  }

  private readonly handleMapClick = (event: AMapMouseEvent): void => {
    // Map clicks on the base map may be a merchant the user wants to see.
    // Instead of blindly clearing the selection (which wiped an open card and
    // made base-map POIs feel unclickable), try to resolve a POI at the click
    // point; only clear when nothing is there. When the same click already
    // triggered a hotspot selection, do not let this generic handler override
    // it with a fuzzier nearby-search result.
    if (Date.now() - this.lastHotspotSelectedAt < 600) return
    if (!this.map || !this.amap || !event.lnglat) {
      this.poiSelectHandler?.(null)
      this.selectArea(null)
      return
    }
    const position: AMapPosition = [event.lnglat.getLng(), event.lnglat.getLat()]
    if (!position.every(Number.isFinite)) {
      this.poiSelectHandler?.(null)
      this.selectArea(null)
      return
    }
    const capturedMap = this.map
    void this.poiAtPosition(position, 150).then((poi) => {
      if (this.map !== capturedMap) return
      if (poi) {
        this.selectArea(null)
        this.poiSelectHandler?.(poi)
      } else {
        this.poiSelectHandler?.(null)
        this.selectArea(null)
      }
    })
  }

  private readonly handleHotspotClick = (event: AMapHotspotEvent): void => {
    if (!this.map || !this.amap || !event.lnglat) return
    const position: AMapPosition = [event.lnglat.getLng(), event.lnglat.getLat()]
    if (!position.every(Number.isFinite)) return
    // Mark this click as hotspot-handled so the generic map click handler
    // does not override the more precise POI with a fuzzy nearby search.
    this.lastHotspotSelectedAt = Date.now()

    const poiId = event.id?.trim()
    const name = event.name?.trim()
    // Every hotspot click routes through the same selection flow so a yeu
    // place card ALWAYS opens. Never clear the current selection or fall back
    // to AMap's own info window on a miss — that made base-map merchants look
    // unclickable and wiped an already-open card.
    if (poiId && name) {
      // Native base-map merchant with a stable POI id: the id also matches
      // seeded AMap ratings (place_amap_ratings).
      this.selectArea(null)
      this.poiSelectHandler?.({
        id: poiId,
        name,
        category: 'nearby',
        point: { lng: position[0], lat: position[1], crs: 'GCJ-02' },
        status: 'draft',
        source: 'amap-native'
      })
      return
    }

    // Without a POI id, try to resolve one via PlaceSearch so the seeded
    // rating (keyed by the AMap POI id) can show. On miss, still open a
    // synthetic card so the click is never swallowed.
    const capturedMap = this.map
    const openSynthetic = (): void => {
      if (this.map !== capturedMap) return
      this.selectArea(null)
      this.poiSelectHandler?.({
        id: `amap-hotspot:${position[0].toFixed(6)},${position[1].toFixed(6)}`,
        name: name ?? '地图地点',
        category: 'nearby',
        point: { lng: position[0], lat: position[1], crs: 'GCJ-02' },
        status: 'draft',
        source: 'amap-native'
      })
    }
    if (name) {
      void this.searchVisiblePois(name).then((pois) => {
        // Lifecycle guard: ignore the result if the map was remounted while
        // the async PlaceSearch was in flight.
        if (this.map !== capturedMap) return
        const target = name.toLocaleLowerCase('zh-CN').replace(/\s+/g, '')
        const matched = pois
          .map((poi, index) => ({ poi, index }))
          .sort((left, right) => {
            const leftName = left.poi.name.toLocaleLowerCase('zh-CN').replace(/\s+/g, '')
            const rightName = right.poi.name.toLocaleLowerCase('zh-CN').replace(/\s+/g, '')
            const leftExact = leftName === target ? 1 : 0
            const rightExact = rightName === target ? 1 : 0
            if (leftExact !== rightExact) return rightExact - leftExact
            return left.index - right.index
          })[0]?.poi
        if (!matched) {
          openSynthetic()
          return
        }
        this.selectArea(null)
        this.poiSelectHandler?.(matched)
      })
      return
    }

    openSynthetic()
  }

  private selectArea(area: MapArea | null): void {
    this.selectedAreaId = area?.id ?? null
    this.refreshAreaSelection()
    this.areaSelectHandler?.(area)
  }

  private refreshAreaSelection(): void {
    for (const record of this.areaOutlines) {
      const selected = record.areaId === this.selectedAreaId
      record.outline.setOptions?.({
        strokeColor: selected ? '#2563eb' : record.strokeColor,
        strokeWeight: selected ? 6 : 3,
        strokeOpacity: selected ? 1 : 0.95,
        zIndex: selected ? 42 : 30
      })
    }
    for (const record of this.areaLabels) {
      const selected = record.areaId === this.selectedAreaId
      record.element.classList.toggle('yeu-amap-area-label-selected', selected)
      record.element.style.cssText = this.areaLabelStyle(record.strokeColor, selected)
    }
  }

  private areaLabelStyle(strokeColor: string, selected: boolean): string {
    const borderColor = selected ? '#2563eb' : strokeColor
    const background = selected ? '#2563eb' : 'rgb(255 255 255 / 90%)'
    const color = selected ? '#ffffff' : '#18181b'
    const shadow = selected ? '0 4px 12px rgb(37 99 235 / 28%)' : '0 1px 4px rgb(0 0 0 / 15%)'
    return `pointer-events:auto;cursor:pointer;display:block;padding:3px 6px;border:1px solid ${borderColor};border-radius:4px;background:${background};box-shadow:${shadow};color:${color};font:600 ${LABEL_FONT_SIZES[this.displayOptions.labelSize]}px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap;`
  }

  private readPlacePois(result: AMapPlaceSearchResult): AMapPlacePoi[] {
    return Array.isArray(result.poiList?.pois) ? result.poiList.pois : []
  }

  private nativeMapPoi(poi: AMapPlacePoi): MapPoi | null {
    const name = poi.name?.trim()
    const lng = poi.location?.getLng()
    const lat = poi.location?.getLat()
    if (!name || !Number.isFinite(lng) || !Number.isFinite(lat)) return null
    const position: AMapPosition = [lng!, lat!]
    return {
      id: this.nativePoiId(poi.id, name, position),
      name,
      category: this.nativePoiCategory(poi.type),
      point: { lng: position[0], lat: position[1], crs: 'GCJ-02' },
      status: 'draft',
      address: poi.address?.trim() || undefined,
      source: 'amap-native'
    }
  }

  private nativePoiId(id: string | undefined, name: string, position: AMapPosition): string {
    const identity = id?.trim() || `${name}-${position[0].toFixed(6)}-${position[1].toFixed(6)}`
    return `amap-native-${encodeURIComponent(identity)}`
  }

  private nativePoiCategory(type: string | undefined): string {
    const value = type ?? ''
    if (/餐饮|美食|咖啡|茶/.test(value)) return 'food'
    if (/快递|物流|邮政/.test(value)) return 'express'
    if (/住宿|酒店|宾馆/.test(value)) return 'dorm'
    if (/学校|科教|教学/.test(value)) return 'campus-building'
    if (/生活服务|医疗|银行|通信|维修/.test(value)) return 'service'
    return 'nearby'
  }

  private visibleSearchRadius(center: AMapPosition, edge: AMapPosition): number {
    const latMeters = (edge[1] - center[1]) * 111_320
    const lngMeters = (edge[0] - center[0]) * 111_320 * Math.cos(center[1] * Math.PI / 180)
    return Math.min(50_000, Math.max(300, Math.ceil(Math.hypot(latMeters, lngMeters))))
  }

  private convertSinglePoint(point: GeoPoint): AMapPosition | null {
    if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return null
    if (point.crs === 'GCJ-02') return [point.lng, point.lat]
    if (point.crs === 'WGS84') return wgs84ToGcj02(point.lng, point.lat)
    return null
  }

  private convertPoints(points: GeoPoint[], _amap: AMapNamespace): Promise<Array<AMapPosition | null>> {
    return Promise.resolve(points.map(point => this.convertSinglePoint(point)))
  }

  private convertPoint(point: GeoPoint, _amap: AMapNamespace): Promise<AMapPosition | null> {
    return Promise.resolve(this.convertSinglePoint(point))
  }

  private readLocation(location: unknown): AMapPosition | null {
    if (Array.isArray(location)) {
      const lng = Number(location[0])
      const lat = Number(location[1])
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
    }
    if (location && typeof location === 'object'
      && 'getLng' in location && typeof location.getLng === 'function'
      && 'getLat' in location && typeof location.getLat === 'function') {
      const lngLat = location as AMapLngLat
      const lng = lngLat.getLng()
      const lat = lngLat.getLat()
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
    }
    return null
  }

  private isRenderablePoint(point: GeoPoint): boolean {
    return (point.crs === 'WGS84' || point.crs === 'GCJ-02')
      && Number.isFinite(point.lng)
      && Number.isFinite(point.lat)
      && point.lng >= -180 && point.lng <= 180
      && point.lat >= -90 && point.lat <= 90
  }

  private clearMarkers(): void {
    this.clearSelectedMarker()
    if (this.markerCluster) {
      this.markerCluster.off('click', this.handleClusterClick)
      this.markerCluster.setMap(null)
      this.markerCluster = null
    }
    if (this.map && this.plainMarkers.length) {
      for (const record of this.plainMarkers) {
        record.marker.off('click', record.clickHandler)
      }
      this.map.remove(this.plainMarkers.map(record => record.marker))
    }
    this.plainMarkers = []
    this.markers.clear()
  }

  private clearAreas(): void {
    ++this.areaRenderVersion
    if (this.map && (this.areaOutlines.length || this.areaLabels.length)) {
      for (const record of this.areaOutlines) {
        record.outline.off('click', record.clickHandler)
      }
      for (const record of this.areaLabels) {
        record.marker.off('click', record.clickHandler)
      }
      this.map.remove([...this.areaOutlines.map(record => record.outline), ...this.areaLabels.map(record => record.marker)])
    }
    this.areaOutlines = []
    this.areaLabels = []
  }

  private applyBaseStyle(): void {
    if (!this.map || !this.amap) return
    if (this.baseLayers.length) {
      this.map.remove(this.baseLayers)
      this.baseLayers = []
    }
    if (this.baseStyle === 'satellite') {
      this.baseLayers = [
        new this.amap.TileLayer.Satellite(),
        new this.amap.TileLayer.RoadNet()
      ]
      this.map.add(this.baseLayers)
    }
  }

  /**
   * AMap measures its container when the Map is constructed. On the first
   * client-side navigation the loader awaits the network, so construction can
   * happen before the container has been laid out. AMap then keeps a 0x0
   * drawing surface and never re-measures, which leaves the basemap blank
   * while DOM markers still position correctly. Re-measure once the layout has
   * settled, and only act when the size is genuinely wrong.
   *
   * The same wrong-size surface also breaks MarkerCluster: it lays markers out
   * against the canvas size present at creation time, so pins stay missing
   * until the canvas settles and the overlay is rebuilt from the cache.
   */
  private scheduleInitialResize(
    map: AMapMap,
    element: HTMLElement,
    lifecycleVersion: number
  ): void {
    if (typeof globalThis.setTimeout !== 'function') return

    const isStale = (): boolean => (
      this.map !== map || lifecycleVersion !== this.lifecycleVersion
    )

    const forceResize = (): void => {
      try {
        map.resize()
      } catch {
        // A failed resize is not fatal; a later attempt or a user-driven
        // resize can still recover the basemap.
      }
    }

    // Embedded WebViews throttle requestAnimationFrame and settle layout well
    // after mount resolves, so poll on timers with a backoff instead. Stop as
    // soon as the canvas matches the container. After the backoff list is
    // exhausted keep trying at low frequency: late layout (fonts, sheets,
    // keyboard dismissal) can arrive well past the initial window.
    const delays = [0, 32, 100, 200, 350, 550, 800, 1200, 1800, 2500, 3500, 5000, 8000]
    let index = 0
    let trailingRetries = 0

    const step = (): void => {
      if (isStale()) return
      if (this.isCanvasSettled(element)) {
        this.onCanvasSettled(map, lifecycleVersion)
        return
      }

      forceResize()

      if (index < delays.length) {
        const delay = delays[index] ?? 0
        index += 1
        this.initialResizeTimer = globalThis.setTimeout(step, delay)
      } else if (trailingRetries < 6) {
        trailingRetries += 1
        this.initialResizeTimer = globalThis.setTimeout(step, 3000)
      }
    }

    this.clearInitialResizeTimer()
    this.initialResizeTimer = globalThis.setTimeout(step, 0)

    // A late-arriving layout (font swap, sheet transition, keyboard dismissal)
    // can resize the container after polling gives up. ResizeObserver catches
    // that case without keeping a timer alive. Watch both the container and
    // every canvas inside it: AMap may swap its drawing surface (2D/WebGL,
    // dpr change) while the container stays the same size.
    if (typeof ResizeObserver !== 'undefined') {
      const observeSizes = (): void => {
        const targets = [element, ...this.canvasesIn(element)]
        for (const target of targets) observer.observe(target)
      }
      const observer = new ResizeObserver(() => {
        if (isStale()) {
          observer.disconnect()
          return
        }
        if (this.isCanvasSettled(element)) {
          this.onCanvasSettled(map, lifecycleVersion)
          return
        }
        forceResize()
      })
      observeSizes()
      this.initialResizeObserver = observer
    }
  }

  private canvasesIn(element: HTMLElement): HTMLCanvasElement[] {
    if (typeof element.querySelectorAll !== 'function') return []
    const found: HTMLCanvasElement[] = []
    element.querySelectorAll<HTMLCanvasElement>('canvas').forEach(canvas => found.push(canvas))
    return found
  }

  /**
   * Largest canvas inside the AMap container. AMap renders into one main
   * canvas but may keep extra zero-sized or tiny canvases around; scanning for
   * the largest avoids mistaking a hidden surface for the settled one.
   */
  private largestCanvas(element: HTMLElement): HTMLCanvasElement | null {
    let largest: HTMLCanvasElement | null = null
    for (const canvas of this.canvasesIn(element)) {
      if (!largest || canvas.width * canvas.height > largest.width * largest.height) {
        largest = canvas
      }
    }
    return largest
  }

  /**
   * True when the AMap drawing surface has settled at the container size.
   * AMap scales its backing store by devicePixelRatio, so the physical canvas
   * pixels are compared against the CSS size rather than an exact match.
   */
  private isCanvasSettled(element: HTMLElement): boolean {
    if (typeof element.getBoundingClientRect !== 'function') return true
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return false
    const canvas = this.largestCanvas(element)
    if (!canvas) return false
    return canvas.width >= rect.width - 1 && canvas.height >= rect.height - 1
  }

  /** Stable key of the current settled canvas size, e.g. "750x1334". */
  private readCanvasSizeKey(): string {
    const element = this.mapElement
    const canvas = element ? this.largestCanvas(element) : null
    return canvas && canvas.width > 0 && canvas.height > 0
      ? `${canvas.width}x${canvas.height}`
      : ''
  }

  private clearInitialResizeTimer(): void {
    if (this.initialResizeTimer !== null) {
      globalThis.clearTimeout(this.initialResizeTimer)
      this.initialResizeTimer = null
    }
  }

  private installMapAccessibility(element: HTMLElement): void {
    if (typeof element.querySelectorAll !== 'function') return

    const applyLabels = () => {
      element.querySelectorAll<HTMLIFrameElement>('iframe').forEach((frame) => {
        if (!frame.title) frame.title = '地图交互区域'
      })
      element.querySelectorAll<HTMLImageElement>('.amap-logo img').forEach((image) => {
        if (!image.alt) image.alt = '高德地图'
      })
    }

    applyLabels()
    if (typeof MutationObserver === 'undefined') return

    const observer = new MutationObserver(applyLabels)
    observer.observe(element, { childList: true, subtree: true })
    this.mapAccessibilityObserver = observer
  }

  private disposeMap(): void {
    this.mapAccessibilityObserver?.disconnect()
    this.mapAccessibilityObserver = null
    this.clearInitialResizeTimer()
    this.initialResizeObserver?.disconnect()
    this.initialResizeObserver = null
    this.clearRoute()
    this.clearMarkers()
    this.clearAreas()
    this.clearUserLocation()
    if (this.map) {
      this.map.off('click', this.handleMapClick)
      this.map.off('hotspotclick', this.handleHotspotClick)
      this.hotspotInfoWindow?.close()
      try {
        this.map.destroy()
      } catch {
        // AMap may throw while its WebView is already being torn down.
      }
    }
    this.map = null
    this.amap = null
    this.baseLayers = []
    this.mapElement = null
    this.settledCanvasKey = ''
    this.userLocation = null
    this.hotspotInfoWindow = null
  }
}

/** 两点间水平距离（米）。校园尺度下等距投影足够。 */
function haversineMeters(a: { lng: number, lat: number }, b: { lng: number, lat: number }): number {
  const scale = Math.cos(a.lat * Math.PI / 180) * 111_320
  return Math.hypot((b.lng - a.lng) * scale, (b.lat - a.lat) * 110_540)
}

/** 方位角（度，正北 0°，顺时针）。 */
function bearingDegrees(a: { lng: number, lat: number }, b: { lng: number, lat: number }): number {
  const scale = Math.cos(a.lat * Math.PI / 180) * 111_320
  const dx = (b.lng - a.lng) * scale
  const dy = (b.lat - a.lat) * 110_540
  return Math.atan2(dx, dy) * 180 / Math.PI
}
