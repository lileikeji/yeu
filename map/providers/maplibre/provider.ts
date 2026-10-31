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
import type { GeoPoint, MapArea, MapBus, MapBusRoute, MapMountOptions, MapPoi } from '../../core/types'
import {
  createMarkerImage,
  getMarkerImageId,
  MAP_MARKER_COLORS,
  MAP_MARKER_PIXEL_RATIO,
  resolveMarkerCategory
} from './marker-image'

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
    map.addControl(new maplibre.NavigationControl(), 'bottom-right')
    map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-right')
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

    if (this.fitAfterMount) {
      this.fitAfterMount = false
      this.fitToPois()
    }
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

    this.map.flyTo({
      center: [point.lng, point.lat],
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
    if (!map) return
    if (!buses.length) {
      if (map.getSource(BUSES_SOURCE_ID)) {
        this.updateSource(BUSES_SOURCE_ID, { type: 'FeatureCollection', features: [] })
      }
      return
    }
    this.ensureBusLayers(map)
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
    if (!map) return
    if (!routes.length) {
      if (map.getSource(BUS_ROUTES_SOURCE_ID)) {
        this.updateSource(BUS_ROUTES_SOURCE_ID, { type: 'FeatureCollection', features: [] })
      }
      return
    }
    this.ensureBusLayers(map)

    const features: object[] = []
    for (const [index, route] of routes.entries()) {
      const color = BUS_ROUTE_COLORS[index % BUS_ROUTE_COLORS.length]!
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
        map.off('load', finish)
        if (timeoutRef.id !== undefined) window.clearTimeout(timeoutRef.id)
        this.cancelPendingLoad = null
        if (error) reject(error)
        else resolve()
      }

      this.cancelPendingLoad = finish
      map.on('load', finish)
      timeoutRef.id = window.setTimeout(() => {
        finish(new Error('地图底图加载超时，请检查网络后重试。'))
      }, MAP_LOAD_TIMEOUT_MS)
    })
  }

  private registerMarkerImages(map: MapLibreMap): void {
    for (const [category, color] of Object.entries(MAP_MARKER_COLORS)) {
      for (const selected of [false, true]) {
        const imageId = getMarkerImageId(category as keyof typeof MAP_MARKER_COLORS, selected)

        if (!map.hasImage(imageId)) {
          map.addImage(imageId, createMarkerImage(color, selected), {
            pixelRatio: MAP_MARKER_PIXEL_RATIO
          })
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
            markerImage: getMarkerImageId(category, selected),
            markerScale: selected ? 1.375 : 1,
            sortKey: selected ? 1 : 0,
            selected
          }
        }
      })
    }
  }

  private renderablePois(): MapPoi[] {
    return this.pois.filter(poi => this.isRenderablePoint(poi.point))
  }

  private isRenderablePoint(point: GeoPoint): boolean {
    return point.crs === 'WGS84'
      && Number.isFinite(point.lng)
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
  }
}
