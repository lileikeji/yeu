<script setup lang="ts">
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  StyleSpecification
} from 'maplibre-gl'
import { campusBoundary } from '~~/data/seeds/osm-campus-boundary-encoded'
import {
  YEU_CAMPUS_REFERENCE_CENTER
} from '~~/map/core/campus'
import type {
  ApiCoordinateObservation,
  ApiCoordinateSample,
  ApiPlace
} from '~~/shared/types/server'
import {
  buildCoordinateReviewAccuracyCircle,
  buildCoordinateReviewPointCollection,
  buildEmptyReviewFeatureCollection,
  collectReviewMapFitPoints,
  isCurrentCoordinateNotDisplayable,
  resolveCurrentPlacePoint,
  resolveCurrentPlacePointLabel,
  resolveReviewMapFitDecision,
  selectNeighboringReviewPlaces
} from '~~/app/utils/admin-coordinate-review-map-presentation'

const props = defineProps<{
  observation: ApiCoordinateObservation
  place: ApiPlace | null
  places: ApiPlace[]
}>()

const POINTS_SOURCE_ID = 'coordinate-review-points'
const ACCURACY_SOURCE_ID = 'coordinate-review-accuracy'
const BOUNDARY_SOURCE_ID = 'coordinate-review-campus-boundary'
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

type MapSourceData = Parameters<GeoJSONSource['setData']>[0]

const mapElement = ref<HTMLDivElement | null>(null)
const mapStatus = ref<'loading' | 'ready' | 'error'>('loading')
let map: MapLibreMap | null = null
let resizeObserver: ResizeObserver | null = null
let lifecycleVersion = 0

const currentPlacePoint = computed(() => resolveCurrentPlacePoint(props.place))
const currentPlacePointLabel = computed(() => resolveCurrentPlacePointLabel(props.place))
const currentCoordinateNotDisplayable = computed(() => isCurrentCoordinateNotDisplayable(props.place))
const neighboringPlaces = computed(() => selectNeighboringReviewPlaces({
  observation: props.observation,
  places: props.places
}))

function emptyFeatureCollection(): MapSourceData {
  return buildEmptyReviewFeatureCollection() as MapSourceData
}

function pointCollection() {
  return buildCoordinateReviewPointCollection({
    observation: props.observation,
    currentPlacePoint: currentPlacePoint.value,
    currentPlacePointLabel: currentPlacePointLabel.value,
    neighboringPlaces: neighboringPlaces.value
  })
}

function accuracyCircle(): MapSourceData {
  return buildCoordinateReviewAccuracyCircle({
    longitude: props.observation.longitude,
    latitude: props.observation.latitude,
    accuracyMeters: props.observation.accuracyMeters
  }) as MapSourceData
}

function addReviewLayers(target: MapLibreMap): void {
  target.addSource(POINTS_SOURCE_ID, {
    type: 'geojson',
    data: emptyFeatureCollection()
  })
  target.addSource(ACCURACY_SOURCE_ID, {
    type: 'geojson',
    data: emptyFeatureCollection()
  })
  target.addSource(BOUNDARY_SOURCE_ID, {
    type: 'geojson',
    data: campusBoundary as MapSourceData
  })
  target.addLayer({
    id: 'coordinate-review-campus-fill',
    type: 'fill',
    source: BOUNDARY_SOURCE_ID,
    paint: {
      'fill-color': '#15803d',
      'fill-opacity': 0.08
    }
  })
  target.addLayer({
    id: 'coordinate-review-campus-outline',
    type: 'line',
    source: BOUNDARY_SOURCE_ID,
    paint: {
      'line-color': '#15803d',
      'line-width': 2,
      'line-opacity': 0.75
    }
  })
  target.addLayer({
    id: 'coordinate-review-accuracy',
    type: 'fill',
    source: ACCURACY_SOURCE_ID,
    paint: {
      'fill-color': '#16a34a',
      'fill-opacity': 0.12
    }
  })
  target.addLayer({
    id: 'coordinate-review-neighbors',
    type: 'circle',
    source: POINTS_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'neighbor'],
    paint: {
      'circle-color': '#71717a',
      'circle-opacity': 0.85,
      'circle-radius': 5.5,
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
      'circle-color': '#c2410c',
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
  const points = collectReviewMapFitPoints({
    samples,
    observation: props.observation,
    currentPlacePoint: currentPlacePoint.value,
    neighboringPlaces: neighboringPlaces.value
  })
  const decision = resolveReviewMapFitDecision(points)

  if (decision.kind === 'none') return
  if (decision.kind === 'fly-to') {
    target.flyTo({ center: decision.center, zoom: decision.zoom, duration: 450 })
    return
  }

  target.fitBounds(decision.bounds, {
    padding: decision.padding,
    maxZoom: decision.maxZoom,
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
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
      <div>
        <p class="text-xs font-medium text-green-700 dark:text-green-400">
          共享审核地图
        </p>
        <h3 class="mt-1 text-sm font-bold text-zinc-950 dark:text-zinc-100 sm:text-base">
          {{ observation.placeName }}的定位记录
        </h3>
      </div>
      <div class="flex flex-wrap gap-2">
        <UBadge
          :label="`${observation.sampleCount} 条定位记录`"
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

    <div class="relative mt-3 h-80 min-h-80 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 sm:h-96">
      <div
        ref="mapElement"
        class="absolute inset-0"
        :aria-label="`${observation.placeName}定位记录审核地图`"
      />
      <div
        v-if="mapStatus === 'loading'"
        class="absolute inset-0 grid place-items-center bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
        role="status"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 animate-spin"
        />
      </div>
      <div
        v-else-if="mapStatus === 'error'"
        class="absolute inset-0 grid place-items-center bg-zinc-100 dark:bg-zinc-800 p-6 text-center"
        role="alert"
      >
        <div>
          <p class="text-sm text-zinc-600 dark:text-zinc-300">
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
      class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-600 dark:text-zinc-300"
      aria-label="地图图例"
    >
      <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-blue-600" />现场定位记录</span>
      <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-green-700" />计算结果</span>
      <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-amber-600" />{{ currentPlacePointLabel }}</span>
      <span class="inline-flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-zinc-600" />附近已确认地点</span>
    </div>
    <p class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
      已显示 {{ neighboringPlaces.length }} 个附近的已确认地点。误差圈表示定位可能存在的偏差范围，底图与校界只用于人工比对。
    </p>
    <p
      v-if="currentCoordinateNotDisplayable"
      class="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300"
    >
      地点当前使用另一种坐标类型，为避免位置偏移，本图暂不显示该点。
    </p>
  </section>
</template>

<style scoped>
:deep(.maplibregl-map) {
  width: 100%;
  height: 100%;
}
</style>
