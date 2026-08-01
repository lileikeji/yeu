import type {
  AreaSelectHandler,
  MapErrorHandler,
  MapProvider,
  MapDisplayOptions,
  MapBaseStyle,
  PoiSelectHandler,
  PointPickedHandler,
  RouteSummary
} from '../../core/provider'
import type { GeoPoint, MapArea, MapMountOptions, MapPoi } from '../../core/types'
import { YEU_CAMPUS_REFERENCE_BOUNDS } from '../../core/campus'

const MIN_SCALE = 1
const MAX_SCALE = 3

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function categoryColor(category: string): string {
  const normalized = category.toLowerCase()
  if (normalized.includes('宿舍') || normalized.includes('dorm')) return '#7c3aed'
  if (normalized.includes('教学') || normalized.includes('teaching')) return '#176f46'
  if (normalized.includes('餐') || normalized.includes('dining')) return '#c2410c'
  if (normalized.includes('快递') || normalized.includes('delivery')) return '#b45309'
  if (normalized.includes('校门') || normalized.includes('gate')) return '#374151'
  if (normalized.includes('周边') || normalized.includes('nearby')) return '#be123c'
  return '#0369a1'
}

function isRenderablePoint(point: GeoPoint): boolean {
  // AMap catalog points can be WGS84 or reviewed GCJ-02. The offline layer
  // intentionally treats both as nearby campus pixels instead of dropping
  // every point when the provider is unavailable.
  return Number.isFinite(point.lng)
    && Number.isFinite(point.lat)
    && point.lng >= YEU_CAMPUS_REFERENCE_BOUNDS.west
    && point.lng <= YEU_CAMPUS_REFERENCE_BOUNDS.east
    && point.lat >= YEU_CAMPUS_REFERENCE_BOUNDS.south
    && point.lat <= YEU_CAMPUS_REFERENCE_BOUNDS.north
}

/**
 * A WebView-safe fallback. It uses only DOM, CSS, structured coordinates and
 * pointer events, so it neither republishes a third-party plan nor depends on
 * WebGL, AMap, glyphs, or external tiles.
 */
export class WechatOfflineMapProvider implements MapProvider {
  readonly id = 'maplibre-dev' as const
  private element: HTMLElement | null = null
  private root: HTMLDivElement | null = null
  private scene: HTMLDivElement | null = null
  private markerLayer: HTMLDivElement | null = null
  private pois: MapPoi[] = []
  private selectedPoiId: string | null = null
  private displayOptions: MapDisplayOptions = {
    showPois: true,
    showAreas: true,
    showLabels: true,
    autoCluster: true,
    labelSize: 'medium'
  }

  private scale = 1
  private offsetX = 0
  private offsetY = 0
  private dragging = false
  private dragged = false
  private pointerId: number | null = null
  private pointerStartX = 0
  private pointerStartY = 0
  private originOffsetX = 0
  private originOffsetY = 0
  private pointPickedHandler: PointPickedHandler | null = null
  private poiSelectHandler: PoiSelectHandler | null = null
  private areaSelectHandler: AreaSelectHandler | null = null
  private mapErrorHandler: MapErrorHandler | null = null

  async mount(element: HTMLElement, options: MapMountOptions = {}): Promise<void> {
    this.destroyDom()
    this.element = element
    element.replaceChildren()
    Object.assign(element.style, {
      position: 'relative',
      overflow: 'hidden',
      background: '#dfe9e2',
      touchAction: 'none'
    })

    const root = document.createElement('div')
    root.className = 'yeu-wechat-offline-map'
    Object.assign(root.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      cursor: 'grab',
      userSelect: 'none',
      touchAction: 'none',
      background: '#dfe9e2'
    })

    const scene = document.createElement('div')
    scene.className = 'yeu-wechat-offline-map-scene'
    Object.assign(scene.style, {
      position: 'absolute',
      inset: '0',
      transformOrigin: 'center center',
      willChange: 'transform',
      backgroundColor: '#e7efe9',
      backgroundImage: [
        'linear-gradient(rgb(23 111 70 / 8%) 1px, transparent 1px)',
        'linear-gradient(90deg, rgb(23 111 70 / 8%) 1px, transparent 1px)',
        'radial-gradient(circle at 47% 48%, rgb(255 255 255 / 78%), transparent 58%)'
      ].join(','),
      backgroundSize: '32px 32px, 32px 32px, 100% 100%'
    })

    const markerLayer = document.createElement('div')
    markerLayer.className = 'yeu-wechat-offline-map-markers'
    Object.assign(markerLayer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none'
    })

    scene.append(markerLayer)
    root.append(scene)
    element.append(root)
    this.root = root
    this.scene = scene
    this.markerLayer = markerLayer
    this.resetView(options.zoom)
    this.attachEvents(root)
    this.renderMarkers()
  }

  setPois(pois: MapPoi[]): void {
    this.pois = [...pois]
    if (this.selectedPoiId && !this.pois.some(poi => poi.id === this.selectedPoiId)) {
      this.selectedPoiId = null
    }
    this.renderMarkers()
  }

  setAreas(_areas: MapArea[]): void {}

  setDisplayOptions(options: MapDisplayOptions): void {
    this.displayOptions = { ...options }
    this.renderMarkers()
  }

  setBaseStyle(_style: MapBaseStyle): boolean {
    return true
  }

  resize(): void {}

  fitToPois(): void {
    this.resetView(15)
  }

  enablePointPicker(handler: PointPickedHandler): void {
    this.pointPickedHandler = handler
    this.updateCursor()
  }

  disablePointPicker(): void {
    this.pointPickedHandler = null
    this.updateCursor()
  }

  setSelectedPoi(id: string | null): void {
    this.selectedPoiId = id && this.pois.some(poi => poi.id === id) ? id : null
    this.renderMarkers()
  }

  setSelectedArea(_id: string | null): void {}

  flyToPoi(id: string): boolean {
    const poi = this.pois.find(candidate => candidate.id === id)
    return poi ? this.flyToPoint(poi.point) : false
  }

  flyToPoint(point: GeoPoint, zoom = 17): boolean {
    if (!isRenderablePoint(point) || !this.root) return false
    this.scale = clamp(1 + Math.max(0, zoom - 14) * 0.2, MIN_SCALE, MAX_SCALE)
    const x = this.longitudePercent(point.lng) / 100
    const y = this.latitudePercent(point.lat) / 100
    this.offsetX = (0.5 - x) * this.root.clientWidth * (this.scale - 1)
    this.offsetY = (0.5 - y) * this.root.clientHeight * (this.scale - 1)
    this.applyTransform()
    return true
  }

  planWalkingRoute(_origin: GeoPoint, _destination: GeoPoint): Promise<RouteSummary> {
    return Promise.reject(new Error('Walking routes are available with the online map.'))
  }

  searchVisiblePois(query: string): Promise<MapPoi[]> {
    const keyword = query.trim().toLowerCase()
    return Promise.resolve(this.pois.filter(poi => !keyword || poi.name.toLowerCase().includes(keyword)))
  }

  clearRoute(): void {}

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

  destroy(): void {
    this.destroyDom()
    this.pois = []
    this.selectedPoiId = null
    this.pointPickedHandler = null
    this.poiSelectHandler = null
    this.areaSelectHandler = null
    this.mapErrorHandler = null
  }

  private resetView(zoom?: number): void {
    this.scale = clamp(zoom ? 1 + Math.max(0, zoom - 14) * 0.04 : 1.05, MIN_SCALE, MAX_SCALE)
    this.offsetX = 0
    this.offsetY = 0
    this.applyTransform()
  }

  private attachEvents(root: HTMLDivElement): void {
    root.addEventListener('pointerdown', this.handlePointerDown)
    root.addEventListener('pointermove', this.handlePointerMove)
    root.addEventListener('pointerup', this.handlePointerUp)
    root.addEventListener('pointercancel', this.handlePointerUp)
    root.addEventListener('wheel', this.handleWheel, { passive: false })
    root.addEventListener('click', this.handleClick)
  }

  private detachEvents(root: HTMLDivElement): void {
    root.removeEventListener('pointerdown', this.handlePointerDown)
    root.removeEventListener('pointermove', this.handlePointerMove)
    root.removeEventListener('pointerup', this.handlePointerUp)
    root.removeEventListener('pointercancel', this.handlePointerUp)
    root.removeEventListener('wheel', this.handleWheel)
    root.removeEventListener('click', this.handleClick)
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if ((event.target as HTMLElement).closest('[data-poi-id]')) return
    const root = this.root
    if (!root) return
    this.dragging = true
    this.dragged = false
    this.pointerId = event.pointerId
    this.pointerStartX = event.clientX
    this.pointerStartY = event.clientY
    this.originOffsetX = this.offsetX
    this.originOffsetY = this.offsetY
    root.setPointerCapture(event.pointerId)
    root.style.cursor = 'grabbing'
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.pointerId) return
    const deltaX = event.clientX - this.pointerStartX
    const deltaY = event.clientY - this.pointerStartY
    this.dragged = this.dragged || Math.abs(deltaX) + Math.abs(deltaY) > 4
    this.offsetX = this.originOffsetX + deltaX
    this.offsetY = this.originOffsetY + deltaY
    this.applyTransform()
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return
    this.dragging = false
    this.pointerId = null
    if (this.root?.hasPointerCapture(event.pointerId)) this.root.releasePointerCapture(event.pointerId)
    this.updateCursor()
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const root = this.root
    if (!root) return
    const rect = root.getBoundingClientRect()
    const anchorX = event.clientX - rect.left - rect.width / 2
    const anchorY = event.clientY - rect.top - rect.height / 2
    const nextScale = clamp(this.scale * (event.deltaY > 0 ? 0.9 : 1.1), MIN_SCALE, MAX_SCALE)
    const ratio = nextScale / this.scale
    this.offsetX = anchorX - (anchorX - this.offsetX) * ratio
    this.offsetY = anchorY - (anchorY - this.offsetY) * ratio
    this.scale = nextScale
    this.applyTransform()
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.dragged) {
      this.dragged = false
      return
    }
    const target = event.target as HTMLElement
    const poiId = target.closest<HTMLElement>('[data-poi-id]')?.dataset.poiId
    if (poiId) {
      this.poiSelectHandler?.(this.pois.find(poi => poi.id === poiId) ?? null)
      return
    }
    if (!this.pointPickedHandler || !this.root) return
    const rect = this.root.getBoundingClientRect()
    const x = (event.clientX - rect.left - rect.width / 2 - this.offsetX) / this.scale + rect.width / 2
    const y = (event.clientY - rect.top - rect.height / 2 - this.offsetY) / this.scale + rect.height / 2
    this.pointPickedHandler({
      lng: YEU_CAMPUS_REFERENCE_BOUNDS.west + (x / rect.width) * (YEU_CAMPUS_REFERENCE_BOUNDS.east - YEU_CAMPUS_REFERENCE_BOUNDS.west),
      lat: YEU_CAMPUS_REFERENCE_BOUNDS.north - (y / rect.height) * (YEU_CAMPUS_REFERENCE_BOUNDS.north - YEU_CAMPUS_REFERENCE_BOUNDS.south),
      crs: 'WGS84'
    })
  }

  private renderMarkers(): void {
    const layer = this.markerLayer
    if (!layer) return
    layer.replaceChildren()
    layer.style.display = this.displayOptions.showPois ? '' : 'none'
    for (const poi of this.pois) {
      if (!isRenderablePoint(poi.point)) continue
      const marker = document.createElement('button')
      const selected = poi.id === this.selectedPoiId
      marker.type = 'button'
      marker.dataset.poiId = poi.id
      marker.title = poi.name
      marker.setAttribute('aria-label', poi.name)
      marker.className = 'yeu-wechat-offline-map-marker'
      Object.assign(marker.style, {
        position: 'absolute',
        left: `${this.longitudePercent(poi.point.lng)}%`,
        top: `${this.latitudePercent(poi.point.lat)}%`,
        width: selected ? '22px' : '17px',
        height: selected ? '22px' : '17px',
        padding: '0',
        border: '2px solid #fff',
        borderRadius: '999px',
        background: categoryColor(poi.category),
        boxShadow: selected ? '0 0 0 5px rgb(255 255 255 / 70%), 0 2px 8px rgb(0 0 0 / 30%)' : '0 2px 6px rgb(0 0 0 / 32%)',
        transform: 'translate(-50%, -50%)',
        cursor: 'pointer',
        pointerEvents: 'auto',
        zIndex: selected ? '3' : '1'
      })
      if (this.displayOptions.showLabels && (selected || this.scale > 1.45)) {
        const label = document.createElement('span')
        label.textContent = poi.name
        Object.assign(label.style, {
          position: 'absolute',
          left: '50%',
          bottom: 'calc(100% + 5px)',
          transform: 'translateX(-50%)',
          maxWidth: '9rem',
          padding: '3px 6px',
          borderRadius: '4px',
          background: 'rgb(255 255 255 / 94%)',
          color: '#17211d',
          fontSize: '11px',
          lineHeight: '1.25',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: '0 1px 5px rgb(0 0 0 / 16%)',
          pointerEvents: 'none'
        })
        marker.append(label)
      }
      layer.append(marker)
    }
  }

  private longitudePercent(lng: number): number {
    return ((lng - YEU_CAMPUS_REFERENCE_BOUNDS.west) / (YEU_CAMPUS_REFERENCE_BOUNDS.east - YEU_CAMPUS_REFERENCE_BOUNDS.west)) * 100
  }

  private latitudePercent(lat: number): number {
    return ((YEU_CAMPUS_REFERENCE_BOUNDS.north - lat) / (YEU_CAMPUS_REFERENCE_BOUNDS.north - YEU_CAMPUS_REFERENCE_BOUNDS.south)) * 100
  }

  private applyTransform(): void {
    if (!this.scene) return
    this.scene.style.transform = `translate3d(${this.offsetX}px, ${this.offsetY}px, 0) scale(${this.scale})`
    this.renderMarkers()
  }

  private updateCursor(): void {
    if (this.root) this.root.style.cursor = this.pointPickedHandler ? 'crosshair' : 'grab'
  }

  private destroyDom(): void {
    if (this.root) this.detachEvents(this.root)
    this.root?.remove()
    this.element = null
    this.root = null
    this.scene = null
    this.markerLayer = null
    this.dragging = false
    this.pointerId = null
  }
}
