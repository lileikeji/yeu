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
import { loadAMap } from './loader'
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

const DEFAULT_DISPLAY_OPTIONS: MapDisplayOptions = {
  showPois: true,
  showAreas: true,
  showLabels: true,
  autoCluster: true,
  labelSize: 'medium'
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
  outline: AMapPolyline
  clickHandler: (event: AMapMouseEvent) => void
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
  private areaLabels: AMapMarker[] = []
  private baseLayers: AMapTileLayer[] = []
  private hotspotInfoWindow: AMapInfoWindow | null = null
  private markerCluster: AMapMarkerCluster | null = null
  private walking: AMapWalking | null = null
  private selectedMarker: AMapMarker | null = null
  private selectedMarkerClickHandler: ((event: AMapMouseEvent) => void) | null = null
  private selectedPoiId: string | null = null
  private poiSelectHandler: PoiSelectHandler | null = null
  private areaSelectHandler: AreaSelectHandler | null = null
  private mapErrorHandler: MapErrorHandler | null = null
  private displayOptions: MapDisplayOptions = { ...DEFAULT_DISPLAY_OPTIONS }
  private baseStyle: MapBaseStyle = 'standard'
  private fitAfterRender = false
  private lifecycleVersion = 0
  private renderVersion = 0
  private areaRenderVersion = 0

  constructor(options: AMapProviderOptions) {
    this.options = options
  }

  async mount(element: HTMLElement, options: MapMountOptions = {}): Promise<void> {
    this.disposeMap()
    const lifecycleVersion = ++this.lifecycleVersion
    const amap = await loadAMap(this.options)
    const center = await this.convertPoint(options.center ?? YEU_CAMPUS_REFERENCE_CENTER, amap)

    if (lifecycleVersion !== this.lifecycleVersion) return
    if (!center) throw new Error('高德地图无法转换初始 WGS84 中心点。')

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
    this.applyBaseStyle()
    map.on('click', this.handleMapClick)
    map.on('hotspotclick', this.handleHotspotClick)
    await Promise.all([this.rebuildMarkers(), this.rebuildAreas()])
  }

  setPois(pois: MapPoi[]): void {
    this.pois = [...pois]
    if (this.selectedPoiId && !this.pois.some(poi => poi.id === this.selectedPoiId)) {
      this.selectedPoiId = null
    }
    void this.rebuildMarkers()
  }

  setAreas(areas: MapArea[]): void {
    this.areas = [...areas]
    void this.rebuildAreas()
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
    if (markerRenderingChanged) void this.rebuildMarkers()
    if (areaRenderingChanged) void this.rebuildAreas()
  }

  setBaseStyle(style: MapBaseStyle): boolean {
    this.baseStyle = style
    this.applyBaseStyle()
    return true
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

    if (converted.length && this.displayOptions.autoCluster) {
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
        this.mapErrorHandler?.(new Error('高德地图点聚合初始化失败。'))
      }
    } else if (converted.length) {
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
          this.areaSelectHandler?.(area)
        }
        outline.on('click', clickHandler)
        this.areaOutlines.push({ outline, clickHandler })
      }
      const allPoints = convertedPaths.flat()
      const center: AMapPosition = [
        allPoints.reduce((sum, point) => sum + point[0], 0) / allPoints.length,
        allPoints.reduce((sum, point) => sum + point[1], 0) / allPoints.length
      ]
      if (this.displayOptions.showLabels) {
        const label = document.createElement('span')
        label.textContent = area.name
        label.title = `${area.name}（WIA 原始区域）`
        label.style.cssText = `pointer-events:none;display:block;padding:3px 6px;border:1px solid ${area.strokeColor};border-radius:4px;background:rgb(255 255 255 / 90%);box-shadow:0 1px 4px rgb(0 0 0 / 15%);color:#18181b;font:600 ${LABEL_FONT_SIZES[this.displayOptions.labelSize]}px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap;`
        const marker = new amap.Marker({
          position: center,
          anchor: 'center',
          content: label,
          clickable: false,
          bubble: true,
          offset: new amap.Pixel(-label.textContent.length * 6 - 7, -10),
          zIndex: 31
        })
        this.areaLabels.push(marker)
      }
    }

    if (this.areaOutlines.length) {
      map.add([...this.areaOutlines.map(record => record.outline), ...this.areaLabels])
    }
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
    element.style.cssText = 'position:relative;display:block;box-sizing:border-box;width:30px;height:38px;padding:0;border:0;background:transparent;color:#18181b;font:500 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;'

    const label = document.createElement('span')
    label.textContent = poi.name
    label.style.cssText = `pointer-events:none;position:absolute;top:40px;left:50%;z-index:2;display:${this.displayOptions.showLabels ? 'block' : 'none'};max-width:160px;overflow:hidden;padding:3px 6px;border:1px solid ${selected ? '#176f46' : 'rgb(212 212 216)'};border-radius:4px;background:rgb(255 255 255 / 94%);box-shadow:0 1px 4px rgb(0 0 0 / 14%);font-size:${LABEL_FONT_SIZES[this.displayOptions.labelSize]}px;font-weight:${selected ? '700' : '500'};opacity:1;text-overflow:ellipsis;transform:translateX(-50%);visibility:visible;white-space:nowrap;`
    label.style.opacity = '1'
    label.style.visibility = 'visible'

    const pin = document.createElement('span')
    pin.setAttribute('aria-hidden', 'true')
    pin.style.cssText = `position:absolute;bottom:3px;left:1px;display:block;box-sizing:border-box;width:28px;height:34px;border:2px solid #fff;border-radius:50% 50% 50% 8px;background:#176f46;box-shadow:${selected ? '0 0 0 4px rgb(255 255 255 / 80%),0 3px 10px rgb(0 0 0 / 35%)' : '0 2px 7px rgb(0 0 0 / 28%)'};transform:rotate(-45deg)${selected ? ' scale(1.2)' : ''};transition:transform 120ms ease,box-shadow 120ms ease;`
    pin.style.background = CATEGORY_COLORS[poi.category] ?? '#176f46'

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
    const size = count >= 50 ? 48 : count >= 10 ? 42 : 36
    const element = document.createElement('button')
    element.type = 'button'
    element.title = `${count} 个地点，点击放大`
    element.setAttribute('aria-label', element.title)
    element.textContent = String(count)
    element.style.cssText = `display:grid;box-sizing:border-box;width:${size}px;height:${size}px;place-items:center;padding:0;border:2px solid #fff;border-radius:50%;background:${count >= 50 ? '#8f3040' : count >= 10 ? '#087f8c' : '#176f46'};box-shadow:0 2px 9px rgb(0 0 0 / 28%);color:#fff;font:700 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;`
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
    if (this.amap) context.marker.setOffset(new this.amap.Pixel(-15, -38))
  }

  private readonly renderClusterMarker = (context: AMapClusterRenderContext): void => {
    context.marker.setContent(this.createClusterContent(context.count))
    const size = context.count >= 50 ? 48 : context.count >= 10 ? 42 : 36
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
    this.areaSelectHandler?.(null)
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
    return point.crs === 'WGS84'
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
      this.map.remove([...this.areaOutlines.map(record => record.outline), ...this.areaLabels])
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

  private disposeMap(): void {
    this.clearRoute()
    this.clearMarkers()
    this.clearAreas()
    if (this.map) {
      this.map.off('click', this.handleMapClick)
      this.map.off('hotspotclick', this.handleHotspotClick)
      this.hotspotInfoWindow?.close()
      this.map.destroy()
    }
    this.map = null
    this.amap = null
    this.baseLayers = []
    this.hotspotInfoWindow = null
  }
}
