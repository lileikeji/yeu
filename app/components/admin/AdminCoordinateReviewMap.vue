<script setup lang="ts">
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  StyleSpecification
} from 'maplibre-gl'
import campusBoundary from '~~/data/seeds/osm-campus-boundary.json'
import {
  YEU_CAMPUS_REFERENCE_CENTER
} from '~~/map/core/campus'
import type {
  ApiCoordinateObservation,
  ApiCoordinateSample,
  ApiPlace
} from '~~/shared/types/server'

const props = defineProps<{
  observation: ApiCoordinateObservation
  place: ApiPlace | null
  places: ApiPlace[]
}>()

const POINTS_SOURCE_ID = 'coordinate-review-points'
const ACCURACY_SOURCE_ID = 'coordinate-review-accuracy'
const BOUNDARY_SOURCE_ID = 'coordinate-review-campus-boundary'
const EARTH_RADIUS_METERS = 6_371_000
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'

const REVIEW_STYLE: StyleSpecification = {
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
  layers: [{ id: 'osm-raster', type: 'raster', source: 'osm' }]
}

interface ReviewPoint {
  longitude: number
  latitude: number
}

interface ReviewFeatureProperties {
  kind: 'sample' | 'result' | 'current' | 'neighbor'
  label: string
  sampleIndex: number
}

interface ReviewPointFeature {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: ReviewFeatureProperties
}

interface ReviewPointCollection {
  type: 'FeatureCollection'
  features: ReviewPointFeature[]
}

type MapSourceData = Parameters<GeoJSONSource['setData']>[0]

const mapElement = ref<HTMLDivElement | null>(null)
const mapStatus = ref<'loading' | 'ready' | 'error'>('loading')
let map: MapLibreMap | null = null
let resizeObserver: ResizeObserver | null = null
let lifecycleVersion = 0

function hasRenderableWgs84Coordinates(place: ApiPlace): place is ApiPlace & {
  longitude: number
  latitude: number
  coordinateSystem: 'WGS84'
} {
  return place.coordinateSystem === 'WGS84'
    && place.longitude !== null
    && place.latitude !== null
    && Number.isFinite(place.longitude)
    && Number.isFinite(place.latitude)
}

function isVerifiedRenderableWgs84Place(place: ApiPlace): place is ApiPlace & {
  longitude: number
  latitude: number
  coordinateSystem: 'WGS84'
} {
  return place.coordinateVerification === 'verified'
    && hasRenderableWgs84Coordinates(place)
}

function distanceMeters(left: ReviewPoint, right: ReviewPoint): number {
  const toRadians = (value: number) => value * Math.PI / 180
  const latitudeDelta = toRadians(right.latitude - left.latitude)
  const longitudeDelta = toRadians(right.longitude - left.longitude)
  const leftLatitude = toRadians(left.latitude)
  const rightLatitude = toRadians(right.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return EARTH_RADIUS_METERS * 2
    * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

const currentPlacePoint = computed(() => {
  const place = props.place
  if (!place || !hasRenderableWgs84Coordinates(place)) return null
  return {
    longitude: place.longitude,
    latitude: place.latitude
  }
})

const currentPlacePointLabel = computed(() => props.place?.coordinateVerification === 'verified'
  ? '当前双重核验坐标'
  : '首条已批准候选')

const currentCoordinateNotDisplayable = computed(() => {
  const place = props.place
  return place !== null
    && place.longitude !== null
    && place.latitude !== null
    && place.coordinateSystem !== 'WGS84'
})

const neighboringPlaces = computed(() => {
  const origin = {
    longitude: props.observation.longitude,
    latitude: props.observation.latitude
  }
  return props.places
    .filter(place => place.id !== props.observation.placeId
      && place.scope === props.observation.placeScope)
    .filter(isVerifiedRenderableWgs84Place)
    .map(place => ({
      place,
      distance: distanceMeters(origin, {
        longitude: place.longitude,
        latitude: place.latitude
      })
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 8)
})

function emptyFeatureCollection(): MapSourceData {
  return {
    type: 'FeatureCollection',
    features: []
  }
}

function pointCollection(): ReviewPointCollection {
  const features: ReviewPointFeature[] = props.observation.samples.map((sample, index) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [sample.longitude, sample.latitude]
    },
    properties: {
      kind: 'sample',
      label: `样本 ${index + 1}`,
      sampleIndex: index + 1
    }
  }))

  features.push({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [props.observation.longitude, props.observation.latitude]
    },
    properties: {
      kind: 'result',
      label: '计算结果',
      sampleIndex: 0
    }
  })

  if (currentPlacePoint.value) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          currentPlacePoint.value.longitude,
          currentPlacePoint.value.latitude
        ]
      },
      properties: {
        kind: 'current',
        label: currentPlacePointLabel.value,
        sampleIndex: 0
      }
    })
  }

  for (const { place } of neighboringPlaces.value) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [place.longitude, place.latitude]
      },
      properties: {
        kind: 'neighbor',
        label: place.name,
        sampleIndex: 0
      }
    })
  }

  return { type: 'FeatureCollection', features }
}

function accuracyCircle(): MapSourceData {
  const center = {
    longitude: props.observation.longitude,
    latitude: props.observation.latitude
  }
  const radius = Math.max(1, props.observation.accuracyMeters)
  const latitudeRadians = center.latitude * Math.PI / 180
  const points: [number, number][] = []

  for (let index = 0; index <= 64; index += 1) {
    const angle = index / 64 * Math.PI * 2
    const latitudeOffset = Math.sin(angle) * radius / EARTH_RADIUS_METERS * 180 / Math.PI
    const longitudeOffset = Math.cos(angle) * radius / (
      EARTH_RADIUS_METERS * Math.max(0.01, Math.cos(latitudeRadians))
    ) * 180 / Math.PI
    points.push([
      center.longitude + longitudeOffset,
      center.latitude + latitudeOffset
    ])
  }

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [points] },
      properties: {}
    }]
  }
}

function addReviewLayers(target: MapLibreMap): void {
  target.addSource(BOUNDARY_SOURCE_ID, {
    type: 'geojson',
    data: campusBoundary as MapSourceData
  })
  target.addLayer({
    id: 'coordinate-review-campus-fill',
    type: 'fill',
    source: BOUNDARY_SOURCE_ID,
    paint: { 'fill-color': '#1f6b4f', 'fill-opacity': 0.04 }
  })
  target.addLayer({
    id: 'coordinate-review-campus-line',
    type: 'line',
    source: BOUNDARY_SOURCE_ID,
    paint: {
      'line-color': '#1f6b4f',
      'line-opacity': 0.7,
      'line-width': 1.5,
      'line-dasharray': [2, 1.5]
    }
  })

  target.addSource(ACCURACY_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() })
  target.addLayer({
    id: 'coordinate-review-accuracy-fill',
    type: 'fill',
    source: ACCURACY_SOURCE_ID,
    paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.13 }
  })
  target.addLayer({
    id: 'coordinate-review-accuracy-line',
    type: 'line',
    source: ACCURACY_SOURCE_ID,
    paint: { 'line-color': '#0f766e', 'line-opacity': 0.9, 'line-width': 2 }
  })

  target.addSource(POINTS_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() })
  target.addLayer({
    id: 'coordinate-review-neighbors',
    type: 'circle',
    source: POINTS_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'neighbor'],
    paint: {
      'circle-color': '#52525b',
      'circle-radius': 5,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5
    }
  })
  target.addLayer({
    id: 'coordinate-review-current',
    type: 'circle',
    source: POINTS_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'current'],
    paint: {
      'circle-color': '#d97706',
      'circle-radius': 8,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2
    }
  })
  target.addLayer({
    id: 'coordinate-review-samples',
    type: 'circle',
    source: POINTS_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'sample'],
    paint: {
      'circle-color': '#2563eb',
      'circle-opacity': 0.78,
      'circle-radius': 6,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5
    }
  })
  target.addLayer({
    id: 'coordinate-review-result',
    type: 'circle',
    source: POINTS_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'result'],
    paint: {
      'circle-color': '#15803d',
      'circle-radius': 9,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2.5
    }
  })
  target.addLayer({
    id: 'coordinate-review-sample-labels',
    type: 'symbol',
    source: POINTS_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'sample'],
    layout: {
      'text-field': ['to-string', ['get', 'sampleIndex']],
      'text-font': ['Open Sans Semibold'],
      'text-size': 9,
      'text-allow-overlap': true
    },
    paint: { 'text-color': '#ffffff' }
  })
  target.addLayer({
    id: 'coordinate-review-point-labels',
    type: 'symbol',
    source: POINTS_SOURCE_ID,
    filter: ['!=', ['get', 'kind'], 'sample'],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Open Sans Regular'],
      'text-size': 11,
      'text-anchor': 'bottom',
      'text-offset': [0, -1.15],
      'text-max-width': 12,
      'text-optional': true
    },
    paint: {
      'text-color': '#18181b',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5
    }
  })
}

function fitReviewArea(target: MapLibreMap, samples: ApiCoordinateSample[]): void {
  const points: ReviewPoint[] = [
    ...samples,
    {
      longitude: props.observation.longitude,
      latitude: props.observation.latitude
    }
  ]
  if (currentPlacePoint.value) points.push(currentPlacePoint.value)
  for (const { place } of neighboringPlaces.value) {
    points.push({ longitude: place.longitude, latitude: place.latitude })
  }

  const first = points[0]
  if (!first) return
  const bounds = points.reduce((result, point) => ({
    west: Math.min(result.west, point.longitude),
    south: Math.min(result.south, point.latitude),
    east: Math.max(result.east, point.longitude),
    north: Math.max(result.north, point.latitude)
  }), {
    west: first.longitude,
    south: first.latitude,
    east: first.longitude,
    north: first.latitude
  })

  if (bounds.west === bounds.east && bounds.south === bounds.north) {
    target.flyTo({ center: [first.longitude, first.latitude], zoom: 18, duration: 450 })
    return
  }

  target.fitBounds([
    [bounds.west, bounds.south],
    [bounds.east, bounds.north]
  ], {
    padding: 52,
    maxZoom: 18,
    duration: 450
  })
}

function syncMap(): void {
  const target = map
  if (!target || mapStatus.value !== 'ready') return
  const pointSource = target.getSource(POINTS_SOURCE_ID) as GeoJSONSource | undefined
  const accuracySource = target.getSource(ACCURACY_SOURCE_ID) as GeoJSONSource | undefined
  pointSource?.setData(pointCollection() as MapSourceData)
  accuracySource?.setData(accuracyCircle())
  fitReviewArea(target, props.observation.samples)
}

function disposeMap(): void {
  lifecycleVersion += 1
  resizeObserver?.disconnect()
  resizeObserver = null
  map?.remove()
  map = null
}

async function mountMap(): Promise<void> {
  const element = mapElement.value
  if (!element) return
  disposeMap()
  mapStatus.value = 'loading'
  const version = lifecycleVersion

  try {
    const [maplibre] = await Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl.css')
    ])
    if (version !== lifecycleVersion || !mapElement.value) return

    const target = new maplibre.Map({
      container: mapElement.value,
      style: REVIEW_STYLE,
      center: [YEU_CAMPUS_REFERENCE_CENTER.lng, YEU_CAMPUS_REFERENCE_CENTER.lat],
      zoom: 15,
      maxZoom: 20,
      attributionControl: false,
      localIdeographFontFamily: 'sans-serif'
    })
    map = target
    target.addControl(new maplibre.NavigationControl(), 'bottom-right')
    target.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-right')
    target.addControl(new maplibre.ScaleControl({ unit: 'metric' }), 'bottom-left')
    target.once('load', () => {
      if (map !== target || version !== lifecycleVersion) return
      addReviewLayers(target)
      mapStatus.value = 'ready'
      syncMap()
    })
    target.on('error', () => {
      if (map === target && mapStatus.value === 'loading' && !target.isStyleLoaded()) {
        mapStatus.value = 'error'
      }
    })
    resizeObserver = new ResizeObserver(() => target.resize())
    resizeObserver.observe(mapElement.value)
  } catch {
    if (version === lifecycleVersion) mapStatus.value = 'error'
  }
}

watch(() => [props.observation, props.place, props.places], syncMap, { deep: true })
onMounted(() => void mountMap())
onBeforeUnmount(disposeMap)
</script>

<template>
  <section>
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-3">
      <div>
        <p class="text-xs font-medium text-green-700">
          共享审核地图
        </p>
        <h3 class="mt-1 text-sm font-bold text-zinc-950 sm:text-base">
          {{ observation.placeName }}的坐标证据
        </h3>
      </div>
      <div class="flex flex-wrap gap-2">
        <UBadge
          :label="`${observation.sampleCount} 个样本`"
          color="neutral"
          variant="soft"
        />
        <UBadge
          :label="`误差圈 ${observation.accuracyMeters.toFixed(1)} m`"
          color="success"
          variant="soft"
        />
      </div>
    </div>

    <div class="relative mt-3 h-80 min-h-80 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 sm:h-96">
      <div
        ref="mapElement"
        class="absolute inset-0"
        :aria-label="`${observation.placeName}坐标观测审核地图`"
      />
      <div
        v-if="mapStatus === 'loading'"
        class="absolute inset-0 grid place-items-center bg-zinc-100 text-zinc-500"
        role="status"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 animate-spin"
        />
      </div>
      <div
        v-else-if="mapStatus === 'error'"
        class="absolute inset-0 grid place-items-center bg-zinc-100 p-6 text-center"
        role="alert"
      >
        <div>
          <p class="text-sm text-zinc-600">
            审核地图暂时无法加载。
          </p>
          <UButton
            class="mt-3"
            icon="i-lucide-refresh-cw"
            label="重试地图"
            color="neutral"
            variant="outline"
            size="sm"
            @click="mountMap"
          />
        </div>
      </div>
    </div>

    <div
      class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-600"
      aria-label="地图图例"
    >
      <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-blue-600" />现场样本</span>
      <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-green-700" />计算结果</span>
      <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-amber-600" />{{ currentPlacePointLabel }}</span>
      <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-zinc-600" />邻近已核验地点</span>
    </div>
    <p class="mt-2 text-xs leading-5 text-zinc-500">
      已显示 {{ neighboringPlaces.length }} 个同范围内最近的已核验地点。误差圈以服务端计算精度为半径，底图与校界只用于人工比对。
    </p>
    <p
      v-if="currentCoordinateNotDisplayable"
      class="mt-1 text-xs leading-5 text-amber-700"
    >
      地点当前坐标不是 WGS84，为避免坐标系混用，本地图未叠加该点。
    </p>
  </section>
</template>

<style scoped>
:deep(.maplibregl-map) {
  width: 100%;
  height: 100%;
}
</style>
