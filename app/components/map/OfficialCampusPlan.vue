<script setup lang="ts">
import { officialCampusPlanAnchors } from '~~/data/seeds/official-campus-plan-anchors'
import { officialCampusPlanReference } from '~~/data/seeds/official-campus-plan-reference'
import { campusMapReferencePlaces } from '~~/data/seeds/preview-places'

const props = defineProps<{
  selectedMapNumber?: string | null
  selectedReferenceLabel?: string | null
  selectedPlaceName?: string | null
}>()
const emit = defineEmits<{
  selectNumber: [mapNumber: string]
}>()

const OFFICIAL_PLAN_IMAGE_URL = officialCampusPlanReference.localAssetUrl
const OFFICIAL_PLAN_PAGE_URL = officialCampusPlanReference.pageUrl
const MIN_ZOOM = 1
const MAX_ZOOM = 6
const ZOOM_STEP = 0.35
const MOBILE_INITIAL_ZOOM = 2.2
const WHEEL_ZOOM_SPEED = 0.0018

const viewport = ref<HTMLElement | null>(null)
const imageElement = ref<HTMLImageElement | null>(null)
const zoom = ref(MIN_ZOOM)
const loading = ref(true)
const failed = ref(false)
const anchorElements = new Map<string, HTMLElement>()
const placeNameByNumber = new Map(campusMapReferencePlaces.map(place => [place.mapNumber, place.name]))

const selectedLabel = computed(() => {
  if (!props.selectedReferenceLabel) return null
  return props.selectedPlaceName
    ? `${props.selectedReferenceLabel} · ${props.selectedPlaceName}`
    : props.selectedReferenceLabel
})

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(3))))
}

function setZoom(value: number, origin?: { clientX: number, clientY: number }): void {
  const target = viewport.value
  const nextZoom = clampZoom(value)
  if (!target) {
    zoom.value = nextZoom
    return
  }
  if (Math.abs(nextZoom - zoom.value) < 0.001) return

  const rect = target.getBoundingClientRect()
  const focusX = origin ? origin.clientX - rect.left : target.clientWidth / 2
  const focusY = origin ? origin.clientY - rect.top : target.clientHeight / 2
  const contentX = (target.scrollLeft + focusX) / Math.max(1, zoom.value)
  const contentY = (target.scrollTop + focusY) / Math.max(1, zoom.value)

  zoom.value = nextZoom
  void nextTick(() => {
    target.scrollTo({
      left: contentX * nextZoom - focusX,
      top: contentY * nextZoom - focusY
    })
  })
}

function resetView(): void {
  setZoom(MIN_ZOOM)
  viewport.value?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
}

function handleWheel(event: WheelEvent): void {
  event.preventDefault()
  const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED)
  setZoom(zoom.value * factor, { clientX: event.clientX, clientY: event.clientY })
}

const pinchStartDistance = ref<number | null>(null)
const pinchStartZoom = ref(MIN_ZOOM)

function touchDistance(touches: TouchList): number {
  const a = touches.item(0)
  const b = touches.item(1)
  if (!a || !b) return 0
  const dx = a.clientX - b.clientX
  const dy = a.clientY - b.clientY
  return Math.hypot(dx, dy)
}

function handleTouchStart(event: TouchEvent): void {
  if (event.touches.length !== 2) {
    pinchStartDistance.value = null
    return
  }
  pinchStartDistance.value = touchDistance(event.touches)
  pinchStartZoom.value = zoom.value
}

function handleTouchMove(event: TouchEvent): void {
  if (event.touches.length !== 2 || !pinchStartDistance.value) return
  event.preventDefault()
  const distance = touchDistance(event.touches)
  if (distance <= 0) return
  const midX = ((event.touches[0]?.clientX ?? 0) + (event.touches[1]?.clientX ?? 0)) / 2
  const midY = ((event.touches[0]?.clientY ?? 0) + (event.touches[1]?.clientY ?? 0)) / 2
  setZoom(pinchStartZoom.value * (distance / pinchStartDistance.value), {
    clientX: midX,
    clientY: midY
  })
}

function handleTouchEnd(event: TouchEvent): void {
  if (event.touches.length < 2) pinchStartDistance.value = null
}

function handleLoaded(): void {
  loading.value = false
  failed.value = false
  void nextTick(scrollToSelectedAnchor)
}

function handleFailed(): void {
  loading.value = false
  failed.value = true
}

function reconcileImageState(): void {
  const image = imageElement.value
  if (!image?.complete) return
  if (image.naturalWidth > 0) handleLoaded()
  else handleFailed()
}

function anchorKey(mapNumber: string, index: number): string {
  return `${mapNumber}-${index}`
}

function setAnchorElement(key: string, element: unknown): void {
  if (element instanceof HTMLElement) anchorElements.set(key, element)
  else anchorElements.delete(key)
}

function scrollToSelectedAnchor(): void {
  const mapNumber = props.selectedMapNumber
  const target = viewport.value
  if (!mapNumber || !target) return
  const element = [...anchorElements.entries()]
    .find(([key]) => key.startsWith(`${mapNumber}-`))?.[1]
  if (!element) return
  if (zoom.value < 2) setZoom(2.4)
  void nextTick(() => {
    target.scrollTo({
      left: element.offsetLeft - target.clientWidth / 2 + element.offsetWidth / 2,
      top: element.offsetTop - target.clientHeight / 2 + element.offsetHeight / 2,
      behavior: 'smooth'
    })
  })
}

watch(() => props.selectedMapNumber, () => void nextTick(scrollToSelectedAnchor))

onMounted(() => {
  if (window.matchMedia('(max-width: 639px)').matches) {
    setZoom(MOBILE_INITIAL_ZOOM)
  }
  void nextTick(reconcileImageState)
})
</script>

<template>
  <div class="absolute inset-0 overflow-hidden bg-[#4f84bb]">
    <div
      ref="viewport"
      class="official-plan-scrollbar absolute inset-0 overflow-auto overscroll-contain touch-pan-x touch-pan-y"
      aria-label="仰恩大学官网平面示意图"
      @wheel="handleWheel"
      @touchstart.passive="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd"
    >
      <div class="grid min-h-full min-w-full content-center justify-items-start">
        <div
          class="relative will-change-transform"
          :style="{ width: `${zoom * 100}%` }"
        >
          <img
            ref="imageElement"
            :src="OFFICIAL_PLAN_IMAGE_URL"
            alt="仰恩大学官网平面示意图，含四十七项校内地点图例"
            class="block h-auto w-full max-w-none select-none"
            draggable="false"
            decoding="async"
            fetchpriority="high"
            referrerpolicy="no-referrer"
            @load="handleLoaded"
            @error="handleFailed"
          >
          <button
            v-for="(anchor, index) in officialCampusPlanAnchors"
            :key="anchorKey(anchor.mapNumber, index)"
            :ref="(element: unknown) => setAnchorElement(anchorKey(anchor.mapNumber, index), element)"
            type="button"
            class="absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-green-800 text-[8px] font-bold text-white shadow-md transition hover:z-10 hover:scale-125 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:size-7 sm:text-[10px]"
            :class="props.selectedMapNumber === anchor.mapNumber ? 'z-10 scale-125 bg-orange-600 ring-4 ring-white/80' : ''"
            :style="{ left: `${anchor.x}%`, top: `${anchor.y}%` }"
            :aria-label="`平面图 ${anchor.mapNumber}：${placeNameByNumber.get(anchor.mapNumber) ?? '校内地点'}`"
            :aria-pressed="props.selectedMapNumber === anchor.mapNumber"
            @click="emit('selectNumber', anchor.mapNumber)"
          >
            {{ anchor.mapNumber }}
          </button>
        </div>
      </div>
    </div>

    <div class="pointer-events-none absolute inset-x-3 top-16 z-10 flex items-start justify-between gap-3 md:inset-x-4">
      <UBadge
        v-if="selectedLabel"
        color="primary"
        variant="solid"
        class="max-w-[min(22rem,calc(100%-8rem))] truncate shadow-sm"
      >
        <UIcon
          name="i-lucide-map-pin"
          class="mr-1 size-3.5"
        />
        {{ selectedLabel }}
      </UBadge>

      <div class="pointer-events-auto ml-auto flex flex-col gap-2">
        <UTooltip text="放大平面图">
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            class="map-float-btn size-11"
            aria-label="放大平面图"
            :disabled="zoom >= MAX_ZOOM"
            @click="setZoom(zoom + ZOOM_STEP)"
          />
        </UTooltip>
        <UTooltip text="缩小平面图">
          <UButton
            icon="i-lucide-minus"
            color="neutral"
            variant="outline"
            class="map-float-btn size-11"
            aria-label="缩小平面图"
            :disabled="zoom <= MIN_ZOOM"
            @click="setZoom(zoom - ZOOM_STEP)"
          />
        </UTooltip>
        <UTooltip text="重置平面图视图">
          <UButton
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="outline"
            class="map-float-btn size-11"
            aria-label="重置平面图视图"
            @click="resetView"
          />
        </UTooltip>
      </div>
    </div>

    <div
      v-if="loading"
      class="absolute inset-0 z-20 grid place-items-center bg-[#4f84bb] text-white"
      role="status"
    >
      <div class="text-center">
        <UIcon
          name="i-lucide-loader-circle"
          class="mx-auto size-7 animate-spin"
        />
        <p class="mt-3 text-sm font-semibold">
          正在载入官网平面图
        </p>
      </div>
    </div>

    <div
      v-else-if="failed"
      class="absolute inset-0 z-20 grid place-items-center bg-zinc-100 p-6 text-center"
      role="alert"
    >
      <div>
        <UIcon
          name="i-lucide-image-off"
          class="mx-auto size-8 text-zinc-500"
        />
        <p class="mt-3 text-sm font-semibold text-zinc-900">
          官网平面图暂时无法载入
        </p>
        <UButton
          :to="OFFICIAL_PLAN_PAGE_URL"
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          label="打开官网原页"
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-4"
        />
      </div>
    </div>

    <div class="pointer-events-none absolute inset-x-3 bottom-3 z-10 md:inset-x-4">
      <p class="mx-auto max-w-2xl border border-white/30 bg-zinc-950/85 px-3 py-2 text-center text-xs leading-5 text-white shadow-sm backdrop-blur-sm">
        滚轮/双指可自由缩放，拖动可平移。官网平面图未标注比例尺和地理控制点，仅用于校内方位对照，不作为导航坐标。
        <a
          :href="OFFICIAL_PLAN_PAGE_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="pointer-events-auto ml-1 font-semibold underline underline-offset-2"
        >查看来源</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.official-plan-scrollbar {
  scrollbar-color: rgb(255 255 255 / 55%) transparent;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}
</style>
