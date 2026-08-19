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
import type { GeoPoint, MapArea, MapBoundingArea, MapMountOptions, MapPoi, MapPolygonArea } from '../../core/types'
import { YEU_CAMPUS_REFERENCE_BOUNDS } from '../../core/campus'
import { campusWalkGraph } from '../../../data/seeds/campus-walk-graph'
import { solveCampusWalkRoute, walkRoutePolyline } from '../../../app/utils/walk-route'
import { clusterForView } from '../../../app/utils/screen-cluster'
import { CampusClusterIndex } from '../../../app/utils/campus-cluster'

const MIN_SCALE = 1
const MAX_SCALE = 3

/** 聚合触发的最少可见点位数；少于该值直接逐个渲染。 */
const CLUSTER_MIN_POIS = 10
/** 放大超过该 scale 时展开全部独立点（与标签展开阈值一致）。 */
const CLUSTER_MAX_SCALE = 1.45

/** supercluster 聚合配置。 */
const CLUSTER_RADIUS_PX = 48
const CLUSTER_MIN_POINTS = 2
const CLUSTER_MAX_ZOOM = 24
const CLUSTER_EXTENT = 512

/** 示意地图合成 zoom 映射：scale∈[MIN,MAX] → zoom∈[BASE, BASE+SPAN]。 */
const CLUSTER_BASE_ZOOM = 14
const CLUSTER_ZOOM_SPAN = 10

/** supercluster 查询 bbox：在校区参照界外扩一个小缓冲，避免边缘簇被裁掉。 */
const CLUSTER_BBOX_PAD = 0.002

/** 屏幕空间网格聚合（零依赖回退）配置。 */
const CLUSTER_CELL_PX = 48
const CLUSTER_MIN_GROUP = 2

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

/** 聚合点按数量使用稳定尺寸（对齐交互规范 §4.5）。 */
function clusterDiameter(count: number): number {
  if (count >= 50) return 52
  if (count >= 10) return 44
  return 36
}

function clusterLabel(count: number): string {
  return count >= 50 ? '99+' : String(count)
}

/**
 * A WebView-safe fallback. It uses only DOM, CSS, structured coordinates and
 * pointer events, so it neither republishes a third-party plan nor depends on
 * WebGL, AMap, glyphs, or external tiles. Walking routes come from a small
 * local graph (or an honest straight-line schematic estimate), never from a
 * third-party online routing service.
 */
export class WechatOfflineMapProvider implements MapProvider {
  readonly id = 'offline' as const
  private element: HTMLElement | null = null
  private root: HTMLDivElement | null = null
  private scene: HTMLDivElement | null = null
  private markerLayer: HTMLDivElement | null = null
  private overlayLayer: SVGSVGElement | null = null
  private pois: MapPoi[] = []
  private areas: MapArea[] = []
  private selectedPoiId: string | null = null
  private routeLine: GeoPoint[] | null = null
  private displayOptions: MapDisplayOptions = {
    showPois: true,
    showAreas: true,
    showLabels: true,
    autoCluster: true,
    labelSize: 'medium'
  }

  private scale = 1
  /**
   * 当前已渲染的「合成 zoom」档位。标点位置固定、只随 scene 的 CSS transform
   * 移动，因此平移不重建 DOM；仅当合成 zoom（随 scale）变化时才重建聚合与标签。
   */
  private renderedSyntheticZoom = -1
  /** supercluster 聚合索引；null 表示未构建或回退到零依赖网格聚合。 */
  private campusClusterIndex: CampusClusterIndex | null = null
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

    const overlayLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    overlayLayer.setAttribute('class', 'yeu-wechat-offline-map-overlay')
    Object.assign(overlayLayer.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      overflow: 'visible'
    })

    const markerLayer = document.createElement('div')
    markerLayer.className = 'yeu-wechat-offline-map-markers'
    Object.assign(markerLayer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none'
    })

    scene.append(overlayLayer)
    scene.append(markerLayer)
    root.append(scene)
    element.append(root)
    this.root = root
    this.scene = scene
    this.overlayLayer = overlayLayer
    this.markerLayer = markerLayer
    this.resetView(options.zoom)
    this.attachEvents(root)
    this.renderOverlays()
    this.renderMarkers()
  }

  setPois(pois: MapPoi[]): void {
    this.pois = [...pois]
    this.campusClusterIndex = null // supercluster 索引随数据重建（惰性）
    if (this.selectedPoiId && !this.pois.some(poi => poi.id === this.selectedPoiId)) {
      this.selectedPoiId = null
    }
    this.renderMarkers()
  }

  setAreas(areas: MapArea[]): void {
    this.areas = [...areas]
    this.renderOverlays()
  }

  setDisplayOptions(options: MapDisplayOptions): void {
    this.displayOptions = { ...options }
    this.renderOverlays()
    this.renderMarkers()
  }

  setBaseStyle(_style: MapBaseStyle): boolean {
    return true
  }

  resize(): void {
    this.renderOverlays()
    this.renderMarkers()
  }

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
    return this.flyToPointZoom(point, zoom)
  }

  private flyToPointZoom(point: GeoPoint, zoom: number): boolean {
    if (!isRenderablePoint(point) || !this.root) return false
    this.scale = clamp(this.zoomToScale(zoom), MIN_SCALE, MAX_SCALE)
    const x = this.longitudePercent(point.lng) / 100
    const y = this.latitudePercent(point.lat) / 100
    this.offsetX = (0.5 - x) * this.root.clientWidth * (this.scale - 1)
    this.offsetY = (0.5 - y) * this.root.clientHeight * (this.scale - 1)
    this.applyTransform()
    return true
  }

  async planWalkingRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteSummary> {
    const result = solveCampusWalkRoute(campusWalkGraph, origin, destination)
    if (!result.ok) {
      throw new Error('Walking routes are unavailable offline.')
    }
    const polyline = result.nodeIds.length > 0
      ? walkRoutePolyline(campusWalkGraph, result.nodeIds)
      : [origin, destination]
    this.routeLine = polyline.length >= 2 ? polyline : [origin, destination]
    this.renderOverlays()
    return {
      distanceMeters: result.distanceMeters,
      durationSeconds: result.durationSeconds
    }
  }

  searchVisiblePois(query: string): Promise<MapPoi[]> {
    const keyword = query.trim().toLowerCase()
    return Promise.resolve(this.pois.filter(poi => !keyword || poi.name.toLowerCase().includes(keyword)))
  }

  clearRoute(): void {
    this.routeLine = null
    this.renderOverlays()
  }

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
    this.areas = []
    this.selectedPoiId = null
    this.routeLine = null
    this.campusClusterIndex = null
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
    if ((event.target as HTMLElement).closest('[data-poi-id], [data-cluster-id]')) return
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
    const clusterElement = target.closest<HTMLElement>('[data-cluster-id]')
    if (clusterElement) {
      const id = Number(clusterElement.dataset.clusterId)
      const lng = Number(clusterElement.dataset.clusterLng)
      const lat = Number(clusterElement.dataset.clusterLat)
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        // 点击聚合点：放大到 supercluster 计算的「簇展开」档位（§6.4 点击聚合放大至成员边界）。
        const zoom = this.campusClusterIndex?.expansionZoom(id) ?? 17
        this.flyToPointZoom({
          lng,
          lat,
          crs: 'WGS84'
        }, zoom)
      }
      return
    }
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

  private layerSize(): { width: number, height: number } {
    const root = this.root
    return {
      width: root?.clientWidth ?? 0,
      height: root?.clientHeight ?? 0
    }
  }

  /** WGS84 点 → 场景（标记层）像素坐标。 */
  private scenePoint(point: Pick<GeoPoint, 'lng' | 'lat'>): { x: number, y: number } {
    const { width, height } = this.layerSize()
    return {
      x: (this.longitudePercent(point.lng) / 100) * width,
      y: (this.latitudePercent(point.lat) / 100) * height
    }
  }

  private pxToLng(x: number): number {
    const { width } = this.layerSize()
    return width > 0
      ? YEU_CAMPUS_REFERENCE_BOUNDS.west + (x / width) * (YEU_CAMPUS_REFERENCE_BOUNDS.east - YEU_CAMPUS_REFERENCE_BOUNDS.west)
      : (YEU_CAMPUS_REFERENCE_BOUNDS.west + YEU_CAMPUS_REFERENCE_BOUNDS.east) / 2
  }

  private pxToLat(y: number): number {
    const { height } = this.layerSize()
    return height > 0
      ? YEU_CAMPUS_REFERENCE_BOUNDS.north - (y / height) * (YEU_CAMPUS_REFERENCE_BOUNDS.north - YEU_CAMPUS_REFERENCE_BOUNDS.south)
      : (YEU_CAMPUS_REFERENCE_BOUNDS.south + YEU_CAMPUS_REFERENCE_BOUNDS.north) / 2
  }

  private renderOverlays(): void {
    const layer = this.overlayLayer
    if (!layer) return
    const { width, height } = this.layerSize()
    layer.replaceChildren()
    if (width <= 0 || height <= 0) return

    const svgNamespace = 'http://www.w3.org/2000/svg'
    const doc = layer.ownerDocument

    if (this.displayOptions.showAreas) {
      for (const area of this.areas) {
        const points = this.areaRing(area)
        if (points.length < 2) continue
        const polygon = doc.createElementNS(svgNamespace, 'polygon')
        polygon.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '))
        polygon.setAttribute('fill', area.fillColor)
        polygon.setAttribute('fill-opacity', '0.18')
        polygon.setAttribute('stroke', area.strokeColor)
        polygon.setAttribute('stroke-width', String(clamp(this.scale, 1, 2) * 1.6))
        polygon.setAttribute('stroke-linejoin', 'round')
        layer.append(polygon)
      }
    }

    if (this.routeLine && this.routeLine.length >= 2) {
      const line = doc.createElementNS(svgNamespace, 'polyline')
      line.setAttribute('points', this.routeLine.map((p) => {
        const pt = this.scenePoint(p)
        return `${pt.x},${pt.y}`
      }).join(' '))
      line.setAttribute('fill', 'none')
      line.setAttribute('stroke', '#176f46')
      line.setAttribute('stroke-width', '4')
      line.setAttribute('stroke-linejoin', 'round')
      line.setAttribute('stroke-linecap', 'round')
      layer.append(line)
    }
  }

  private areaRing(area: MapArea): Array<{ x: number, y: number }> {
    const ring: Array<{ x: number, y: number }> = []
    if (area.geometrySource === 'wia-shape-batch') {
      const outer = (area as MapPolygonArea).paths[0]
      if (outer) for (const point of outer) ring.push(this.scenePoint(point))
      return ring
    }
    const bounds = (area as MapBoundingArea).bounds
    if (bounds) {
      const p = this.scenePoint(bounds.southWest)
      const q = this.scenePoint(bounds.northEast)
      ring.push(p, { x: q.x, y: p.y }, q, { x: p.x, y: q.y }, p)
    }
    return ring
  }

  private renderMarkers(): void {
    const layer = this.markerLayer
    if (!layer) return
    layer.replaceChildren()
    layer.style.display = this.displayOptions.showPois ? '' : 'none'
    if (!this.displayOptions.showPois) return

    const { width, height } = this.layerSize()
    const shouldCluster = this.displayOptions.autoCluster
      && this.pois.length >= CLUSTER_MIN_POIS
      && width > 0 && height > 0

    if (shouldCluster) {
      if (this.renderClustersFromSupercluster(layer)) {
        this.renderedSyntheticZoom = this.syntheticZoom(this.scale)
        return
      }
      // supercluster 不可用 → 零依赖屏幕网格聚合回退。
      this.renderClustersFromGrid(layer)
      this.renderedSyntheticZoom = this.syntheticZoom(this.scale)
      return
    }

    for (const poi of this.pois) {
      if (!isRenderablePoint(poi.point)) continue
      layer.append(this.buildMarker(poi))
    }
    this.renderedSyntheticZoom = this.syntheticZoom(this.scale)
  }

  /** supercluster 主聚合；返回 false 表示索引不可用、需回退。 */
  private renderClustersFromSupercluster(layer: HTMLDivElement): boolean {
    if (!this.campusClusterIndex) {
      try {
        const index = new CampusClusterIndex({
          radius: CLUSTER_RADIUS_PX,
          minPoints: CLUSTER_MIN_POINTS,
          maxZoom: CLUSTER_MAX_ZOOM,
          extent: CLUSTER_EXTENT
        })
        index.build(this.pois)
        this.campusClusterIndex = index
      } catch {
        this.campusClusterIndex = null
        return false
      }
    }
    const index = this.campusClusterIndex
    if (!index) return false

    const zoom = this.syntheticZoom(this.scale)
    const { clusters, singlePoiIds } = index.query(this.clusterBBox(), zoom)
    const singleIds = new Set(singlePoiIds)
    for (const cluster of clusters) {
      const p = this.scenePoint(cluster.centroid)
      layer.append(this.buildClusterMarker(cluster.clusterId, cluster.centroid, p.x, p.y, cluster.count))
    }
    for (const poi of this.pois) {
      if (!singleIds.has(poi.id)) continue
      if (!isRenderablePoint(poi.point)) continue
      layer.append(this.buildMarker(poi))
    }
    return true
  }

  /** 零依赖屏幕网格聚合回退（无 supercluster 展开缩放，点击固定放大到 zoom 17）。 */
  private renderClustersFromGrid(layer: HTMLDivElement): void {
    const { width, height } = this.layerSize()
    if (width <= 0 || height <= 0) {
      for (const poi of this.pois) {
        if (!isRenderablePoint(poi.point)) continue
        layer.append(this.buildMarker(poi))
      }
      return
    }
    const view = {
      lngToX: (lng: number) => (this.longitudePercent(lng) / 100) * width,
      latToY: (lat: number) => (this.latitudePercent(lat) / 100) * height
    }
    const clusters = clusterForView(this.pois, view, {
      cellPx: CLUSTER_CELL_PX,
      minGroup: CLUSTER_MIN_GROUP
    })
    const clusteredIds = new Set(clusters.flatMap(cluster => cluster.poiIds))
    for (const cluster of clusters) {
      layer.append(this.buildClusterMarker(-1, {
        lng: this.pxToLng(cluster.centroidX),
        lat: this.pxToLat(cluster.centroidY)
      }, cluster.centroidX, cluster.centroidY, cluster.count))
    }
    for (const poi of this.pois) {
      if (clusteredIds.has(poi.id)) continue
      if (!isRenderablePoint(poi.point)) continue
      layer.append(this.buildMarker(poi))
    }
  }

  private buildClusterMarker(
    clusterId: number,
    centroid: { lng: number, lat: number },
    pxX: number,
    pxY: number,
    count: number
  ): HTMLButtonElement {
    const marker = document.createElement('button')
    marker.type = 'button'
    marker.dataset.clusterId = String(clusterId)
    marker.dataset.clusterLng = String(centroid.lng)
    marker.dataset.clusterLat = String(centroid.lat)
    marker.title = `${count} 个地点`
    marker.setAttribute('aria-label', `${count} 个地点`)
    marker.className = 'yeu-wechat-offline-map-cluster'
    const size = clusterDiameter(count)
    Object.assign(marker.style, {
      position: 'absolute',
      left: `${pxX}px`,
      top: `${pxY}px`,
      width: `${size}px`,
      height: `${size}px`,
      minWidth: `${size}px`,
      minHeight: `${size}px`,
      transform: 'translate(-50%, -50%)',
      borderRadius: '999px',
      border: '2px solid #fff',
      background: '#52525b',
      color: '#fff',
      fontWeight: '700',
      fontSize: `${size >= 44 ? 14 : 12}px`,
      lineHeight: '1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 6px rgb(0 0 0 / 30%)',
      cursor: 'pointer',
      pointerEvents: 'auto'
    })
    marker.textContent = clusterLabel(count)
    return marker
  }

  private buildMarker(poi: MapPoi): HTMLButtonElement {
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
    if (this.displayOptions.showLabels && (selected || this.scale > CLUSTER_MAX_SCALE)) {
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
    return marker
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
    // 平移只改 transform，不重建标点 DOM；仅合成 zoom（随 scale）变化时才重建聚合与标签。
    const zoom = this.syntheticZoom(this.scale)
    if (zoom !== this.renderedSyntheticZoom) {
      this.renderedSyntheticZoom = zoom
      this.renderMarkers()
    }
  }

  /** 把示意地图的连续 scale 映射为整数「合成 zoom」，用于 supercluster 分档。 */
  private syntheticZoom(scale: number): number {
    const fraction = (clamp(scale, MIN_SCALE, MAX_SCALE) - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)
    return Math.round(CLUSTER_BASE_ZOOM + fraction * CLUSTER_ZOOM_SPAN)
  }

  /** 合成 zoom 的逆映射（用于聚合展开/飞行定位）。 */
  private zoomToScale(zoom: number): number {
    const fraction = (zoom - CLUSTER_BASE_ZOOM) / CLUSTER_ZOOM_SPAN
    return MIN_SCALE + fraction * (MAX_SCALE - MIN_SCALE)
  }

  /** 聚合查询 bbox：校区参照界外扩缓冲，避免边缘簇被裁切。 */
  private clusterBBox(): { west: number, south: number, east: number, north: number } {
    return {
      west: YEU_CAMPUS_REFERENCE_BOUNDS.west - CLUSTER_BBOX_PAD,
      south: YEU_CAMPUS_REFERENCE_BOUNDS.south - CLUSTER_BBOX_PAD,
      east: YEU_CAMPUS_REFERENCE_BOUNDS.east + CLUSTER_BBOX_PAD,
      north: YEU_CAMPUS_REFERENCE_BOUNDS.north + CLUSTER_BBOX_PAD
    }
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
    this.overlayLayer = null
    this.dragging = false
    this.pointerId = null
  }
}
