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
  AMapLngLat,
  AMapMap,
  AMapMarker,
  AMapMouseEvent,
  AMapNamespace,
  AMapPosition
} from './types'

const DEFAULT_ZOOM = 14
const SINGLE_POI_ZOOM = 17
const CONVERSION_BATCH_SIZE = 40
const CONVERSION_TIMEOUT_MS = 8_000

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
  marker: AMapMarker
  content: HTMLButtonElement
  pin: HTMLSpanElement
  label: HTMLSpanElement
  clickHandler: (event: AMapMouseEvent) => void
}

export class AMapProvider implements MapProvider {
  readonly id = 'amap' as const
  private readonly options: AMapProviderOptions
  private amap: AMapNamespace | null = null
  private map: AMapMap | null = null
  private pois: MapPoi[] = []
  private markers = new Map<string, MarkerRecord>()
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

    const markers = [...this.markers.values()].map(record => record.marker)
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
    for (const record of this.markers.values()) this.styleMarker(record)
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

    for (const item of converted) this.addMarker(item, amap, map)
    if (this.fitAfterRender) {
      this.fitAfterRender = false
      this.fitToPois()
    }
  }

  private addMarker(item: ConvertedPoi, amap: AMapNamespace, map: AMapMap): void {
    const { content, pin, label } = this.createMarkerContent(item.poi)
    const marker = new amap.Marker({
      position: item.position,
      anchor: 'bottom-center',
      title: item.poi.name,
      content
    })
    const clickHandler = (event: AMapMouseEvent) => {
      event.originEvent?.stopPropagation()
      this.poiSelectHandler?.(item.poi)
    }
    marker.on('click', clickHandler)
    const record = { ...item, marker, content, pin, label, clickHandler }
    this.markers.set(item.poi.id, record)
    this.styleMarker(record)
    map.add(marker)
  }

  private createMarkerContent(poi: MapPoi): Pick<MarkerRecord, 'content' | 'pin' | 'label'> {
    const element = document.createElement('button')
    element.type = 'button'
    element.title = poi.name
    element.setAttribute('aria-label', poi.name)
    element.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;max-width:144px;padding:0;border:0;background:transparent;color:#18181b;font:500 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;'

    const label = document.createElement('span')
    label.textContent = poi.name
    label.style.cssText = 'display:block;max-width:144px;overflow:hidden;padding:4px 7px;border:1px solid rgb(212 212 216);border-radius:4px;background:rgb(255 255 255 / 96%);box-shadow:0 1px 4px rgb(0 0 0 / 16%);text-overflow:ellipsis;white-space:nowrap;'

    const pin = document.createElement('span')
    pin.setAttribute('aria-hidden', 'true')
    pin.style.cssText = 'display:block;width:28px;height:34px;border:2px solid #fff;border-radius:50% 50% 50% 8px;background:#176f46;box-shadow:0 2px 7px rgb(0 0 0 / 28%);transform:rotate(-45deg);transition:transform 120ms ease,box-shadow 120ms ease;'
    pin.style.background = CATEGORY_COLORS[poi.category] ?? '#176f46'

    element.append(label, pin)
    return { content: element, pin, label }
  }

  private styleMarker(record: MarkerRecord): void {
    const selected = record.poi.id === this.selectedPoiId
    record.pin.style.transform = selected ? 'rotate(-45deg) scale(1.2)' : 'rotate(-45deg)'
    record.pin.style.boxShadow = selected
      ? '0 0 0 4px rgb(255 255 255 / 80%),0 3px 10px rgb(0 0 0 / 35%)'
      : '0 2px 7px rgb(0 0 0 / 28%)'
    record.label.style.borderColor = selected ? '#176f46' : 'rgb(212 212 216)'
    record.label.style.fontWeight = selected ? '700' : '500'
    record.marker.setContent(record.content)
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
    if (this.map && this.markers.size) {
      const records = [...this.markers.values()]
      for (const record of records) record.marker.off('click', record.clickHandler)
      this.map.remove(records.map(record => record.marker))
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
