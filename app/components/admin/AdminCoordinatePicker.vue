<script setup lang="ts">
import type { GeoPoint, MapPoi } from '~~/map/core/types'
import {
  isPointWithinBounds,
  YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS
} from '~~/map/core/campus'
import { MapLibrePreviewProvider } from '~~/map/providers/maplibre/provider'

// Admin picking intentionally stays on WGS84 MapLibre. AMap only offers the
// official WGS84 -> GCJ-02 display conversion, so it must not write picked GCJ-02 back as WGS84.

const props = defineProps<{
  name: string
  longitude: number | null
  latitude: number | null
  coordinateSystem: string | null
  scope: string
}>()

const emit = defineEmits<{
  pick: [point: GeoPoint]
  clear: []
}>()

const mapElement = ref<HTMLDivElement | null>(null)
const mapStatus = ref<'loading' | 'ready' | 'error'>('loading')
const picking = ref(false)
const provider = shallowRef<MapLibrePreviewProvider | null>(null)

const currentPoint = computed<GeoPoint | null>(() => {
  if (props.coordinateSystem !== 'WGS84'
    || props.longitude === null
    || props.latitude === null
    || !Number.isFinite(props.longitude)
    || !Number.isFinite(props.latitude)) {
    return null
  }

  return {
    lng: props.longitude,
    lat: props.latitude,
    crs: 'WGS84'
  }
})

const currentPoi = computed<MapPoi[]>(() => currentPoint.value
  ? [{
      id: 'admin-coordinate-draft',
      name: props.name || '待核验地点',
      category: 'service',
      point: currentPoint.value,
      status: 'draft'
    }]
  : [])

const outsideCampusBounds = computed(() => props.scope === 'campus'
  && currentPoint.value !== null
  && !isPointWithinBounds(currentPoint.value, YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS))

function syncPoint(): void {
  const mapProvider = provider.value
  if (!mapProvider) return

  mapProvider.setPois(currentPoi.value)
  mapProvider.setSelectedPoi(currentPoi.value.length ? 'admin-coordinate-draft' : null)
}

function togglePicker(): void {
  const mapProvider = provider.value
  if (!mapProvider) return

  picking.value = !picking.value
  if (picking.value) {
    mapProvider.enablePointPicker((point) => {
      picking.value = false
      mapProvider.disablePointPicker()
      emit('pick', point)
    })
  } else {
    mapProvider.disablePointPicker()
  }
}

function focusCurrentPoint(): void {
  if (currentPoint.value) provider.value?.flyToPoint(currentPoint.value, 18)
}

function clearPoint(): void {
  picking.value = false
  provider.value?.disablePointPicker()
  emit('clear')
}

watch(currentPoi, syncPoint, { deep: true })

onMounted(async () => {
  if (!mapElement.value) return

  const mapProvider = new MapLibrePreviewProvider()
  provider.value = mapProvider
  mapProvider.onError(() => {
    if (provider.value === mapProvider) mapStatus.value = 'error'
  })

  try {
    await mapProvider.mount(mapElement.value, {
      center: currentPoint.value ?? undefined,
      zoom: currentPoint.value ? 18 : 15
    })
    syncPoint()
    mapStatus.value = 'ready'
  } catch {
    if (provider.value === mapProvider) mapStatus.value = 'error'
  }
})

onBeforeUnmount(() => {
  provider.value?.destroy()
  provider.value = null
})
</script>

<template>
  <section class="mb-6">
    <div class="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-2">
      <h3 class="text-sm font-semibold text-zinc-900">
        地图拾点
      </h3>
      <UBadge
        :label="coordinateSystem || '未设置坐标系'"
        color="neutral"
        variant="soft"
        size="sm"
      />
      <UBadge
        v-if="picking"
        label="选点中"
        color="warning"
        variant="soft"
        size="sm"
      />
      <UBadge
        v-if="outsideCampusBounds"
        label="超出校界核验缓冲区"
        color="error"
        variant="soft"
        size="sm"
      />
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <UButton
          :icon="picking ? 'i-lucide-mouse-pointer-ban' : 'i-lucide-mouse-pointer-2'"
          :label="picking ? '取消选点' : '启用选点'"
          :color="picking ? 'warning' : 'primary'"
          variant="soft"
          size="sm"
          :disabled="mapStatus !== 'ready'"
          @click="togglePicker"
        />
        <UTooltip text="定位到当前坐标">
          <UButton
            icon="i-lucide-crosshair"
            color="neutral"
            variant="outline"
            size="sm"
            aria-label="定位到当前坐标"
            :disabled="!currentPoint || mapStatus !== 'ready'"
            @click="focusCurrentPoint"
          />
        </UTooltip>
        <UTooltip text="清空坐标">
          <UButton
            icon="i-lucide-circle-x"
            color="neutral"
            variant="outline"
            size="sm"
            aria-label="清空坐标"
            :disabled="longitude === null && latitude === null"
            @click="clearPoint"
          />
        </UTooltip>
      </div>
    </div>

    <div class="relative mt-3 h-72 min-h-72 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 sm:h-80">
      <div
        ref="mapElement"
        class="absolute inset-0"
        aria-label="地点坐标拾取地图"
      />
      <div
        v-if="mapStatus === 'loading'"
        class="absolute inset-0 grid place-items-center bg-zinc-100 text-sm text-zinc-500"
        role="status"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 animate-spin"
        />
      </div>
      <div
        v-else-if="mapStatus === 'error'"
        class="absolute inset-0 grid place-items-center bg-zinc-100 p-6 text-center text-sm text-zinc-600"
        role="alert"
      >
        地图暂时无法加载，可继续使用下方坐标字段。
      </div>
    </div>

    <p class="mt-2 text-xs leading-5 text-zinc-500">
      地图拾取写入 WGS84，并自动标记为“待核验”；校界提示来自 OSM 社区测绘，只用于异常值检查，完成独立核验后才能改为“已核验”。
    </p>
  </section>
</template>

<style scoped>
:deep(.maplibregl-map) {
  width: 100%;
  height: 100%;
}
</style>
