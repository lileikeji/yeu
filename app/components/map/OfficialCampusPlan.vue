<script setup lang="ts">
import { officialCampusPlanAnchors } from '~~/data/seeds/official-campus-plan-anchors'
import { officialCampusPlanReference } from '~~/data/seeds/official-campus-plan-reference'
import { campusMapReferencePlaces } from '~~/data/seeds/preview-places'
import {
  OFFICIAL_PLAN_MAX_ZOOM,
  OFFICIAL_PLAN_MIN_ZOOM,
  buildOfficialPlanPlaceNameByNumber,
  clampOfficialPlanZoom,
  findOfficialPlanAnchorElementKey,
  isInteractiveOfficialPlanDragTarget,
  isOfficialPlanPointerDragPastThreshold,
  officialPlanAnchorKey,
  resolveOfficialPlanAnchorScrollFromRects,
  resolveOfficialPlanButtonZoom,
  resolveOfficialPlanDragScroll,
  resolveOfficialPlanImageLoadState,
  resolveOfficialPlanInitialZoom,
  resolveOfficialPlanPinchMidpoint,
  resolveOfficialPlanPinchZoom,
  resolveOfficialPlanSelectedLabel,
  resolveOfficialPlanWheelZoom,
  resolveOfficialPlanZoomFocusScroll,
  touchPointDistance
} from '~~/app/utils/official-campus-plan-presentation'
import { safeExternalHref } from '~/utils/safe-external-href'

const props = defineProps<{
  selectedMapNumber?: string | null
  selectedReferenceLabel?: string | null
  selectedPlaceName?: string | null
}>()
const emit = defineEmits<{
  selectNumber: [mapNumber: string]
}>()

const OFFICIAL_PLAN_IMAGE_URL = officialCampusPlanReference.localAssetUrl
const OFFICIAL_PLAN_PAGE_URL = safeExternalHref(officialCampusPlanReference.pageUrl)

const viewport = ref<HTMLElement | null>(null)
const imageElement = ref<HTMLImageElement | null>(null)
const zoom = ref(OFFICIAL_PLAN_MIN_ZOOM)
const loading = ref(true)
const failed = ref(false)
const anchorElements = new Map<string, HTMLElement>()
const placeNameByNumber = buildOfficialPlanPlaceNameByNumber(campusMapReferencePlaces)
const isPanning = ref(false)
const focusToken = ref(0)
let dragPointerId: number | null = null
let dragStartPoint: { clientX: number, clientY: number } | null = null
let dragLastPoint: { clientX: number, clientY: number } | null = null
let dragMoved = false
let settleFocusTimer: ReturnType<typeof setTimeout> | null = null

const selectedLabel = computed(() => resolveOfficialPlanSelectedLabel({
  selectedReferenceLabel: props.selectedReferenceLabel,
  selectedPlaceName: props.selectedPlaceName
}))

function setZoom(value: number, origin?: { clientX: number, clientY: number }): void {
  const target = viewport.value
  const nextZoom = clampOfficialPlanZoom(value)
  if (!target) {
    zoom.value = nextZoom
    return
  }

  const rect = target.getBoundingClientRect()
  const focusX = origin ? origin.clientX - rect.left : target.clientWidth / 2
  const focusY = origin ? origin.clientY - rect.top : target.clientHeight / 2
  const scroll = resolveOfficialPlanZoomFocusScroll({
    currentZoom: zoom.value,
    nextZoom,
    scrollLeft: target.scrollLeft,
    scrollTop: target.scrollTop,
    focusX,
    focusY
  })
  if (!scroll) return

  zoom.value = nextZoom
  void nextTick(() => {
    target.scrollTo({
      left: scroll.left,
      top: scroll.top
    })
  })
}

function resetView(): void {
  setZoom(OFFICIAL_PLAN_MIN_ZOOM)
  viewport.value?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
}

function handleWheel(event: WheelEvent): void {
  event.preventDefault()
  setZoom(
    resolveOfficialPlanWheelZoom({ currentZoom: zoom.value, deltaY: event.deltaY }),
    { clientX: event.clientX, clientY: event.clientY }
  )
}

const pinchStartDistance = ref<number | null>(null)
const pinchStartZoom = ref(OFFICIAL_PLAN_MIN_ZOOM)

function clearDragState(releasePointerId?: number | null): void {
  const target = viewport.value
  if (releasePointerId != null && target?.hasPointerCapture?.(releasePointerId)) {
    try {
      target.releasePointerCapture(releasePointerId)
    } catch {
      // ignore release failures after detach
    }
  }
  dragPointerId = null
  dragStartPoint = null
  dragLastPoint = null
  dragMoved = false
  isPanning.value = false
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  if (pinchStartDistance.value != null) return
  if (isInteractiveOfficialPlanDragTarget(event.target)) return
  const target = viewport.value
  if (!target) return

  dragPointerId = event.pointerId
  dragStartPoint = { clientX: event.clientX, clientY: event.clientY }
  dragLastPoint = { clientX: event.clientX, clientY: event.clientY }
  dragMoved = false
  isPanning.value = false
  try {
    target.setPointerCapture(event.pointerId)
  } catch {
    // pointer capture is best-effort
  }
}

function handlePointerMove(event: PointerEvent): void {
  if (dragPointerId !== event.pointerId || !dragStartPoint || !dragLastPoint) return
  if (pinchStartDistance.value != null) {
    clearDragState(event.pointerId)
    return
  }

  const target = viewport.value
  if (!target) return

  if (!dragMoved) {
    if (!isOfficialPlanPointerDragPastThreshold(dragStartPoint, {
      clientX: event.clientX,
      clientY: event.clientY
    })) {
      return
    }
    dragMoved = true
    isPanning.value = true
    focusToken.value += 1
  }

  const deltaX = event.clientX - dragLastPoint.clientX
  const deltaY = event.clientY - dragLastPoint.clientY
  const scroll = resolveOfficialPlanDragScroll({
    scrollLeft: target.scrollLeft,
    scrollTop: target.scrollTop,
    deltaX,
    deltaY
  })
  target.scrollLeft = scroll.left
  target.scrollTop = scroll.top
  dragLastPoint = { clientX: event.clientX, clientY: event.clientY }
  event.preventDefault()
}

function handlePointerUp(event: PointerEvent): void {
  if (dragPointerId !== event.pointerId) return
  clearDragState(event.pointerId)
}

function handleTouchStart(event: TouchEvent): void {
  if (event.touches.length >= 2) {
    clearDragState(dragPointerId)
    pinchStartDistance.value = touchPointDistance(event.touches.item(0), event.touches.item(1))
    pinchStartZoom.value = zoom.value
    return
  }
  if (event.touches.length !== 2) {
    pinchStartDistance.value = null
  }
}

function handleTouchMove(event: TouchEvent): void {
  if (event.touches.length !== 2 || !pinchStartDistance.value) return
  event.preventDefault()
  const a = event.touches.item(0)
  const b = event.touches.item(1)
  if (!a || !b) return
  const distance = touchPointDistance(a, b)
  if (distance <= 0) return
  const midpoint = resolveOfficialPlanPinchMidpoint(a, b)
  setZoom(
    resolveOfficialPlanPinchZoom({
      startZoom: pinchStartZoom.value,
      startDistance: pinchStartDistance.value,
      currentDistance: distance
    }),
    midpoint
  )
}

function handleTouchEnd(event: TouchEvent): void {
  if (event.touches.length < 2) pinchStartDistance.value = null
}

function handleAnchorPointerDown(event: PointerEvent): void {
  // Keep pan from starting on markers; focus without browser scrollIntoView thrash.
  event.stopPropagation()
  const button = event.currentTarget
  if (button instanceof HTMLElement) {
    button.focus({ preventScroll: true })
  }
}

function handleAnchorClick(mapNumber: string, event: MouseEvent): void {
  const button = event.currentTarget
  if (button instanceof HTMLElement) {
    button.focus({ preventScroll: true })
  }
  emit('selectNumber', mapNumber)
}

function handlePlanMarkerClickCapture(event: MouseEvent): void {
  const eventTarget = event.target
  if (!(eventTarget instanceof Element)) return
  const hitButton = eventTarget.closest<HTMLElement>('[data-plan-anchor-key]')
  if (!hitButton) return

  let nearest: { element: HTMLElement, mapNumber: string, distance: number } | null = null
  for (const element of anchorElements.values()) {
    const mapNumber = element.dataset.planMapNumber
    if (!mapNumber) continue
    const rect = element.getBoundingClientRect()
    const distance = Math.hypot(
      event.clientX - (rect.left + rect.width / 2),
      event.clientY - (rect.top + rect.height / 2)
    )
    if (!nearest || distance < nearest.distance) {
      nearest = { element, mapNumber, distance }
    }
  }

  if (!nearest || nearest.element === hitButton || nearest.distance > 24) return
  event.preventDefault()
  event.stopPropagation()
  nearest.element.focus({ preventScroll: true })
  emit('selectNumber', nearest.mapNumber)
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
  if (!image) return
  const state = resolveOfficialPlanImageLoadState({
    complete: image.complete,
    naturalWidth: image.naturalWidth
  })
  if (state === 'loaded') handleLoaded()
  else if (state === 'failed') handleFailed()
}

function setAnchorElement(key: string, element: unknown): void {
  if (element instanceof HTMLElement) anchorElements.set(key, element)
  else anchorElements.delete(key)
}

function applySelectedAnchorFocus(mapNumber: string, token: number): void {
  if (token !== focusToken.value) return
  if (props.selectedMapNumber !== mapNumber) return
  const target = viewport.value
  if (!target || loading.value || failed.value) return

  const key = findOfficialPlanAnchorElementKey([...anchorElements.keys()], mapNumber)
  const element = key ? anchorElements.get(key) : undefined
  if (!element) return

  const viewportRect = target.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const scroll = resolveOfficialPlanAnchorScrollFromRects({
    scrollLeft: target.scrollLeft,
    scrollTop: target.scrollTop,
    viewportRect: {
      left: viewportRect.left,
      top: viewportRect.top,
      width: viewportRect.width,
      height: viewportRect.height
    },
    elementRect: {
      left: elementRect.left,
      top: elementRect.top,
      width: elementRect.width,
      height: elementRect.height
    }
  })

  target.scrollTo({
    left: scroll.left,
    top: scroll.top,
    behavior: 'auto'
  })
  element.focus({ preventScroll: true })
}

function scrollToSelectedAnchor(): void {
  const mapNumber = props.selectedMapNumber
  if (!mapNumber || !viewport.value) return

  const token = ++focusToken.value
  if (settleFocusTimer != null) {
    clearTimeout(settleFocusTimer)
    settleFocusTimer = null
  }

  // Keep the user's current zoom; only pan the marker into view.
  void nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applySelectedAnchorFocus(mapNumber, token)
        // Parent place panel / sidebar can resize the viewport shortly after select.
        settleFocusTimer = setTimeout(() => {
          applySelectedAnchorFocus(mapNumber, token)
          settleFocusTimer = null
        }, 140)
      })
    })
  })
}

watch(() => props.selectedMapNumber, (next, prev) => {
  if (!next || next === prev) return
  scrollToSelectedAnchor()
})

onMounted(() => {
  const coarse = typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches
  zoom.value = resolveOfficialPlanInitialZoom(coarse)
  reconcileImageState()
})

onBeforeUnmount(() => {
  if (settleFocusTimer != null) clearTimeout(settleFocusTimer)
  clearDragState(dragPointerId)
})
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-hidden bg-[#4f84bb]">
    <div
      ref="viewport"
      class="official-plan-scrollbar absolute inset-0 overflow-auto overscroll-contain touch-none select-none"
      :class="isPanning ? 'cursor-grabbing' : 'cursor-grab'"
      @wheel="handleWheel"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @click.capture="handlePlanMarkerClickCapture"
      @touchstart.passive="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd"
    >
      <div
        class="relative origin-top-left"
        :style="{ width: `${zoom * 100}%`, minHeight: '100%' }"
      >
        <div class="relative w-full">
          <img
            ref="imageElement"
            :src="OFFICIAL_PLAN_IMAGE_URL"
            alt="官网校园平面图，含四十七项校内地点图例"
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
            :key="officialPlanAnchorKey(anchor.mapNumber, index)"
            :ref="(element: unknown) => setAnchorElement(officialPlanAnchorKey(anchor.mapNumber, index), element)"
            type="button"
            :data-plan-anchor-key="officialPlanAnchorKey(anchor.mapNumber, index)"
            :data-plan-map-number="anchor.mapNumber"
            class="group absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            :class="props.selectedMapNumber === anchor.mapNumber ? 'z-10' : 'hover:z-10'"
            :style="{ left: `${anchor.x}%`, top: `${anchor.y}%` }"
            :aria-label="`平面图 ${anchor.mapNumber}：${placeNameByNumber.get(anchor.mapNumber) ?? '校内地点'}`"
            :aria-pressed="props.selectedMapNumber === anchor.mapNumber"
            @pointerdown="handleAnchorPointerDown"
            @click="handleAnchorClick(anchor.mapNumber, $event)"
          >
            <span
              class="grid size-5 place-items-center rounded-full border-2 border-white bg-green-800 text-[8px] font-bold text-white shadow-md transition group-hover:scale-125 sm:size-7 sm:text-[10px]"
              :class="props.selectedMapNumber === anchor.mapNumber ? 'scale-125 bg-orange-600 ring-4 ring-white/80' : ''"
              aria-hidden="true"
            >
              {{ anchor.mapNumber }}
            </span>
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
            :disabled="zoom >= OFFICIAL_PLAN_MAX_ZOOM"
            @click="setZoom(resolveOfficialPlanButtonZoom({ currentZoom: zoom, direction: 'in' }))"
          />
        </UTooltip>
        <UTooltip text="缩小平面图">
          <UButton
            icon="i-lucide-minus"
            color="neutral"
            variant="outline"
            class="map-float-btn size-11"
            aria-label="缩小平面图"
            :disabled="zoom <= OFFICIAL_PLAN_MIN_ZOOM"
            @click="setZoom(resolveOfficialPlanButtonZoom({ currentZoom: zoom, direction: 'out' }))"
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
      class="absolute inset-0 z-20 grid place-items-center bg-[#2f6598] text-white"
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
          :to="OFFICIAL_PLAN_PAGE_URL || undefined"
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

    <div
      class="pointer-events-none absolute inset-x-3 bottom-3 z-10 md:inset-x-4"
      :class="selectedLabel ? 'hidden md:block' : ''"
    >
      <p class="mx-auto max-w-2xl border border-white/30 bg-zinc-950/85 px-3 py-2 text-center text-xs leading-5 text-white shadow-sm backdrop-blur-sm">
        滚轮/双指可自由缩放，拖动可平移。这张平面图只用来对照校园方向，不能用来精确导航。
        <a
          :href="OFFICIAL_PLAN_PAGE_URL || undefined"
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
  overflow-anchor: none;
}
</style>
