import type {
  MapErrorHandler,
  MapProvider,
  PoiSelectHandler,
  PointPickedHandler
} from '../../core/provider'
import { YEU_CAMPUS_REFERENCE_CENTER } from '../../core/campus'
import type { GeoPoint, MapMountOptions, MapPoi } from '../../core/types'
import { loadAMap } from './loader'
import type {
  AMapConvertResult,
  AMapClusterRenderContext,
  AMapLngLat,
  AMapMap,
  AMapMarker,
  AMapMarkerCluster,
  AMapMarkerClusterData,
  AMapMarkerClusterEvent,
  AMapMarkerRenderContext,
  AMapMouseEvent,
  AMapNamespace,
  AMapPosition
} from './types'

const DEFAULT_ZOOM = 14
const SINGLE_POI_ZOOM = 17
const CONVERSION_BATCH_SIZE = 40
const CONVERSION_TIMEOUT_MS = 8_000
const CLUSTER_GRID_SIZE = 56
const CLUSTER_MAX_ZOOM = 17

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

export class AMapProvider implements MapProvider {
  readonly id = 'amap' as const
  private readonly options: AMapProviderOptions
  private amap: AMapNamespace | null = null
  private map: AMapMap | null = null
  private pois: MapPoi[] = []
  private markers = new Map<string, MarkerRecord>()
  private markerCluster: AMapMarkerCluster | null = null
  private selectedMarker: AMapMarker | null = null
  private selectedMarkerClickHandler: ((event: AMapMouseEvent) => void) | null = null
  private selectedPoiId: string | null = null
  private poiSelectHandler: PoiSelectHandler | null = null
  private mapErrorHandler: MapErrorHandler | null = null
  private fitAfterRender = false
  private lifecycleVersion = 0
  private renderVersion = 0

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
      resizeEnable: true
    })
    this.amap = amap
    this.map = map
    map.on('click', this.handleMapClick)
    await this.rebuildMarkers()
  }

  setPois(pois: MapPoi[]): void {
    this.pois = [...pois]
    if (this.selectedPoiId && !this.pois.some(poi => poi.id === this.selectedPoiId)) {
      this.selectedPoiId = null
    }
    void this.rebuildMarkers()
  }

  fitToPois(): void {
    const map = this.map
    if (!map || this.markers.size === 0) {
      this.fitAfterRender = true
      return
    }

    const markers = [...this.markers.values()].map(record => record.fitMarker)
    if (markers.length === 1) {
      const first = this.markers.values().next().value as MarkerRecord | undefined
      if (first) map.setZoomAndCenter(Math.max(map.getZoom(), SINGLE_POI_ZOOM), first.position)
      return
    }

    map.setFitView(markers, false, [72, 56, 72, 56], SINGLE_POI_ZOOM)
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

  destroy(): void {
    ++this.lifecycleVersion
    ++this.renderVersion
    this.disposeMap()
    this.pois = []
    this.selectedPoiId = null
    this.poiSelectHandler = null
    this.mapErrorHandler = null
    this.fitAfterRender = false
  }

  private async rebuildMarkers(): Promise<void> {
    const map = this.map
    const amap = this.amap
    if (!map || !amap) return

    const renderVersion = ++this.renderVersion
    this.clearMarkers()
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

    if (converted.length) {
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
    }

    this.renderSelectedMarker()
    if (this.fitAfterRender) {
      this.fitAfterRender = false
      this.fitToPois()
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
    label.style.cssText = `pointer-events:none;position:absolute;bottom:42px;left:50%;z-index:2;display:block;max-width:160px;overflow:hidden;padding:4px 7px;border:1px solid ${selected ? '#176f46' : 'rgb(212 212 216)'};border-radius:4px;background:rgb(255 255 255 / 96%);box-shadow:0 1px 4px rgb(0 0 0 / 16%);font-weight:${selected ? '700' : '500'};opacity:${selected ? '1' : '0'};text-overflow:ellipsis;transform:translateX(-50%);transition:opacity 100ms ease;visibility:${selected ? 'visible' : 'hidden'};white-space:nowrap;`
    label.style.opacity = selected ? '1' : '0'
    label.style.visibility = selected ? 'visible' : 'hidden'

    const pin = document.createElement('span')
    pin.setAttribute('aria-hidden', 'true')
    pin.style.cssText = `position:absolute;bottom:3px;left:1px;display:block;box-sizing:border-box;width:28px;height:34px;border:2px solid #fff;border-radius:50% 50% 50% 8px;background:#176f46;box-shadow:${selected ? '0 0 0 4px rgb(255 255 255 / 80%),0 3px 10px rgb(0 0 0 / 35%)' : '0 2px 7px rgb(0 0 0 / 28%)'};transform:rotate(-45deg)${selected ? ' scale(1.2)' : ''};transition:transform 120ms ease,box-shadow 120ms ease;`
    pin.style.background = CATEGORY_COLORS[poi.category] ?? '#176f46'

    if (!selected) {
      const showLabel = () => {
        label.style.opacity = '1'
        label.style.visibility = 'visible'
      }
      const hideLabel = () => {
        label.style.opacity = '0'
        label.style.visibility = 'hidden'
      }
      element.addEventListener('pointerenter', showLabel)
      element.addEventListener('pointerleave', hideLabel)
      element.addEventListener('focus', showLabel)
      element.addEventListener('blur', hideLabel)
    }
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
    if (!this.selectedPoiId || !this.amap || !this.map) return

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
  }

  private async convertPoint(point: GeoPoint, amap: AMapNamespace): Promise<AMapPosition | null> {
    return (await this.convertPoints([point], amap))[0] ?? null
  }

  private convertPoints(points: GeoPoint[], amap: AMapNamespace): Promise<Array<AMapPosition | null>> {
    if (!points.length) return Promise.resolve([])

    return new Promise((resolve) => {
      let settled = false
      const fail = (message: string) => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timeout)
        this.mapErrorHandler?.(new Error(message))
        resolve(points.map(() => null))
      }
      const timeout = globalThis.setTimeout(() => {
        fail('高德地图 WGS84 坐标转换超时。')
      }, CONVERSION_TIMEOUT_MS)

      try {
        amap.convertFrom(points.map<AMapPosition>(point => [point.lng, point.lat]), 'gps', (status, result) => {
          if (settled) return
          if (status !== 'complete') {
            fail('高德地图无法转换 WGS84 坐标。')
            return
          }

          const locations = this.readLocations(result)
          if (locations.length < points.length) {
            fail('高德地图返回的坐标转换结果不完整。')
            return
          }

          settled = true
          globalThis.clearTimeout(timeout)
          resolve(points.map((_, index) => locations[index] ?? null))
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
    this.markers.clear()
  }

  private disposeMap(): void {
    this.clearMarkers()
    if (this.map) {
      this.map.off('click', this.handleMapClick)
      this.map.destroy()
    }
    this.map = null
    this.amap = null
  }
}
