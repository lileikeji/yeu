import type {
  AreaSelectHandler,
  MapErrorHandler,
  MapBaseStyle,
  MapDisplayOptions,
  MapProvider,
  PoiSelectHandler,
  PointPickedHandler,
  RouteSummary
} from '../../core/provider'
import { YEU_CAMPUS_REFERENCE_CENTER } from '../../core/campus'
import type { GeoPoint, MapArea, MapMountOptions, MapPoi, MapPolygonArea } from '../../core/types'
import { ensureAMapPlugins, loadAMap } from './loader'
import type {
  AMapConvertResult,
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
const CONVERSION_TIMEOUT_MS = 8_000
const CLUSTER_GRID_SIZE = 56
const CLUSTER_MAX_ZOOM = 17
const ROUTE_TIMEOUT_MS = 15_000
const PLACE_SEARCH_TIMEOUT_MS = 8_000

const DEFAULT_DISPLAY_OPTIONS: MapDisplayOptions = {
  showPois: true,
  showAreas: true,
  showLabels: true,
  autoCluster: true,
  labelSize: 'small'
}

const LABEL_FONT_SIZES = {
  'extra-small': 9,
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
  private markerCluster: AMapMarkerCluster | null = null
  private walking: AMapWalking | null = null
  private selectedMarker: AMapMarker | null = null
  private selectedMarkerClickHandler: ((event: AMapMouseEvent) => void) | null = null
  private selectedPoiId: string | null = null
  private poiSelectHandler: PoiSelectHandler | null = null
  private areaSelectHandler: AreaSelectHandler | null = null
  private selectedAreaId: string | null = null
  private mapErrorHandler: MapErrorHandler | null = null
  private displayOptions: MapDisplayOptions = { ...DEFAULT_DISPLAY_OPTIONS }
  private baseStyle: MapBaseStyle = 'standard'
  private fitAfterRender = false
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
    const lifecycleVersion = ++this.lifecycleVersion
    const amap = await loadAMap(this.options)
    const requestedCenter = options.center ?? YEU_CAMPUS_REFERENCE_CENTER
    const converted = await this.convertPoint(requestedCenter, amap)

    if (lifecycleVersion !== this.lifecycleVersion) return

    // Conversion goes through restapi.amap.com and can fail in embedded
    // WebViews. The WGS84/GCJ-02 offset across campus is a few tens of metres,
    // so falling back to the raw point keeps the basemap visible instead of
    // failing the whole mount and leaving only locally drawn markers.
    const center: AMapPosition = converted ?? [requestedCenter.lng, requestedCenter.lat]

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
    await Promise.all([this.rebuildMarkers(), this.rebuildAreas()])

    // Clustering is optional. If the embedded browser finishes loading it
    // later, upgrade the already-visible plain markers without remounting the
    // AMap instance or interrupting the user.
    void this.ensurePlugins(['AMap.MarkerCluster']).then((available) => {
      if (available && this.map === map && this.displayOptions.autoCluster) {
        this.startRenderTask(this.rebuildMarkers(), '高德地图标点刷新失败。')
      }
    })
  }

  setPois(pois: MapPoi[]): void {
    this.pois = [...pois]
    if (this.selectedPoiId && !this.pois.some(poi => poi.id === this.selectedPoiId)) {
      this.selectedPoiId = null
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
          finish(undefined, { distanceMeters, durationSeconds })
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
          placeSearch.searchNearBy(keyword, centerPosition, radius, (status, result) => {
            if (status !== 'complete' || typeof result === 'string') {
              finish([])
              return
            }
            const pois = this.readPlacePois(result)
              .filter((poi) => {
                const lng = poi.location?.getLng()
                const lat = poi.location?.getLat()
                return Number.isFinite(lng) && Number.isFinite(lat)
                  && lng! >= southWest.getLng() && lng! <= northEast.getLng()
                  && lat! >= southWest.getLat() && lat! <= northEast.getLat()
              })
              .map(poi => this.nativeMapPoi(poi))
              .filter((poi): poi is MapPoi => poi !== null)
            finish(pois)
          })
        } catch {
          finish([])
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
    if (this.fitAfterRender) {
      this.fitAfterRender = false
      this.fitToPois()
    }
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
        const outline = new amap.Polyline({
          path: closedPath,
          strokeColor: area.strokeColor,
          strokeWeight: 3,
          strokeOpacity: 0.95,
          strokeStyle: 'solid',
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
    label.style.cssText = `pointer-events:none;position:absolute;top:51px;left:50%;z-index:2;display:${this.displayOptions.showLabels ? 'block' : 'none'};max-width:172px;overflow:hidden;padding:4px 8px;border:1px solid ${selected ? '#176f46' : 'rgb(228 228 231)'};border-radius:999px;background:rgb(255 255 255 / 96%);box-shadow:0 2px 8px rgb(0 0 0 / 14%);font-size:${LABEL_FONT_SIZES[this.displayOptions.labelSize]}px;font-weight:${selected ? '700' : '600'};letter-spacing:.01em;opacity:1;text-overflow:ellipsis;transform:translateX(-50%);visibility:visible;white-space:nowrap;`
    label.style.opacity = '1'
    label.style.visibility = 'visible'

    const pin = document.createElement('span')
    pin.setAttribute('aria-hidden', 'true')
    pin.textContent = CATEGORY_GLYPHS[poi.category] ?? '点'
    pin.style.cssText = `position:absolute;bottom:6px;left:5px;display:grid;box-sizing:border-box;width:34px;height:34px;place-items:center;border:3px solid #fff;border-radius:13px 13px 13px 4px;background:#176f46;box-shadow:${selected ? '0 0 0 4px rgb(23 111 70 / 22%),0 4px 12px rgb(0 0 0 / 32%)' : '0 3px 9px rgb(0 0 0 / 24%)'};color:#fff;font:800 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;transform:rotate(-45deg)${selected ? ' scale(1.14)' : ''};transition:transform 140ms ease,box-shadow 140ms ease;`
    pin.style.background = CATEGORY_COLORS[poi.category] ?? '#176f46'
    const glyph = document.createElement('span')
    glyph.textContent = pin.textContent
    glyph.style.cssText = 'display:block;transform:rotate(45deg);text-shadow:0 1px 2px rgb(0 0 0 / 22%);'
    pin.textContent = ''
    pin.append(glyph)

    if (options.onClick) {
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        options.onClick?.()
      })
    }

    element.append(label, pin)
    return { content: element, label }
  }

  private createClusterContent(count: number): HTMLButtonElement {
    const size = count >= 50 ? 52 : count >= 10 ? 48 : 44
    const element = document.createElement('button')
    element.type = 'button'
    element.title = `${count} 个地点，点击放大`
    element.setAttribute('aria-label', element.title)
    element.textContent = String(count)
    element.style.cssText = `display:grid;box-sizing:border-box;width:${size}px;height:${size}px;place-items:center;padding:0;border:3px solid rgb(255 255 255 / 96%);border-radius:50%;background:linear-gradient(145deg,${count >= 50 ? '#b44456,#742536' : count >= 10 ? '#12a3ad,#08717c' : '#24915f,#12613f'});box-shadow:0 0 0 5px rgb(255 255 255 / 26%),0 4px 14px rgb(0 0 0 / 28%);color:#fff;font:800 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;`
    return element
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
    context.marker.setContent(this.createClusterContent(context.count))
    const size = context.count >= 50 ? 52 : context.count >= 10 ? 48 : 44
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
      if (data.length > 1) this.poiSelectHandler?.(null)
      return
    }

    const record = this.markers.get(data[0]!.poiId)
    if (record) this.poiSelectHandler?.(record.poi)
  }

  private readonly handleMapClick = (): void => {
    this.poiSelectHandler?.(null)
    this.selectArea(null)
  }

  private readonly handleHotspotClick = (event: AMapHotspotEvent): void => {
    if (!this.map || !this.amap || !event.lnglat || !event.name?.trim()) return
    const position: AMapPosition = [event.lnglat.getLng(), event.lnglat.getLat()]
    if (!position.every(Number.isFinite)) return
    const content = document.createElement('div')
    content.style.cssText = 'min-width:150px;max-width:240px;padding:3px 2px;color:#18181b;font:400 13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;'
    const title = document.createElement('strong')
    title.textContent = event.name.trim()
    title.style.cssText = 'display:block;margin-bottom:5px;font-size:14px;'
    const source = document.createElement('span')
    source.textContent = '高德地图收录地点'
    source.style.cssText = 'display:block;margin-bottom:7px;color:#71717a;font-size:12px;'
    const link = document.createElement('a')
    const url = new URL('https://uri.amap.com/search')
    url.searchParams.set('keyword', event.name.trim())
    url.searchParams.set('center', position.join(','))
    url.searchParams.set('src', 'yeu-freshman-guide')
    url.searchParams.set('coordinate', 'gaode')
    link.href = url.toString()
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = '在高德地图查看'
    link.style.cssText = 'color:#176f46;font-weight:600;text-decoration:none;'
    content.append(title, source, link)

    this.hotspotInfoWindow ??= new this.amap.InfoWindow({ offset: new this.amap.Pixel(0, -10) })
    this.hotspotInfoWindow.setContent(content)
    this.hotspotInfoWindow.open(this.map, position)
    this.selectArea(null)
    this.poiSelectHandler?.(null)
    // Native AMap hotspots use AMap's own info window only. They are base-map
    // POIs, not curated guide points, so they must not enter the app index or sidebar.
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

  private async convertPoint(point: GeoPoint, amap: AMapNamespace): Promise<AMapPosition | null> {
    return (await this.convertPoints([point], amap))[0] ?? null
  }

  private convertPoints(points: GeoPoint[], amap: AMapNamespace): Promise<Array<AMapPosition | null>> {
    if (!points.length) return Promise.resolve([])

    const results = points.map<AMapPosition | null>(point => (
      point.crs === 'GCJ-02' ? [point.lng, point.lat] : null
    ))
    const gpsPoints = points.flatMap((point, index) => (
      point.crs === 'WGS84' ? [{ point, index }] : []
    ))
    if (!gpsPoints.length) return Promise.resolve(results)

    return new Promise((resolve) => {
      let settled = false
      const fail = (message: string) => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timeout)
        this.mapErrorHandler?.(new Error(message))
        resolve(results)
      }
      const timeout = globalThis.setTimeout(() => {
        fail('高德地图 WGS84 坐标转换超时。')
      }, CONVERSION_TIMEOUT_MS)

      try {
        amap.convertFrom(gpsPoints.map<AMapPosition>(({ point }) => [point.lng, point.lat]), 'gps', (status, result) => {
          if (settled) return
          if (status !== 'complete') {
            fail('高德地图无法转换 WGS84 坐标。')
            return
          }

          const locations = this.readLocations(result)
          if (locations.length < gpsPoints.length) {
            fail('高德地图返回的坐标转换结果不完整。')
            return
          }

          settled = true
          globalThis.clearTimeout(timeout)
          gpsPoints.forEach(({ index }, locationIndex) => {
            results[index] = locations[locationIndex] ?? null
          })
          resolve(results)
        })
      } catch {
        fail('高德地图坐标转换调用失败。')
      }
    })
  }

  private readLocations(result: AMapConvertResult): Array<AMapPosition | null> {
    const locations = result.locations
    if (Array.isArray(locations)) {
      if (locations.length === 2 && locations.every(value => Number.isFinite(Number(value)))) {
        return [this.readLocation(locations)]
      }
      return locations.map(location => this.readLocation(location))
    }
    return locations ? [this.readLocation(locations)] : []
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

    const canvasIsSized = (): boolean => {
      if (typeof element.getBoundingClientRect !== 'function') return true
      const rect = element.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return false
      const canvas = typeof element.querySelector === 'function'
        ? element.querySelector('canvas')
        : null
      // AMap scales its backing store by devicePixelRatio, so compare against
      // the CSS width rather than expecting an exact match.
      return Boolean(canvas && canvas.width >= rect.width - 1 && canvas.height >= rect.height - 1)
    }

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
    // soon as the canvas matches the container.
    const delays = [0, 32, 100, 200, 350, 550, 800, 1200, 1800, 2500]
    let index = 0

    const step = (): void => {
      if (isStale()) return
      if (canvasIsSized()) return

      forceResize()

      if (index < delays.length) {
        const delay = delays[index] ?? 0
        index += 1
        this.initialResizeTimer = globalThis.setTimeout(step, delay)
      }
    }

    this.clearInitialResizeTimer()
    this.initialResizeTimer = globalThis.setTimeout(step, 0)

    // A late-arriving layout (font swap, sheet transition, keyboard dismissal)
    // can resize the container after polling gives up. ResizeObserver catches
    // that case without keeping a timer alive.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (isStale()) {
          observer.disconnect()
          return
        }
        if (!canvasIsSized()) forceResize()
      })
      observer.observe(element)
      this.initialResizeObserver = observer
    }
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
    this.hotspotInfoWindow = null
  }
}
