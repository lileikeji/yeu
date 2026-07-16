/**
 * Pure presentation helpers for the official campus plan image viewer.
 * Keep MapLibre-free, Vue-free DOM decisions here; the Vue shell owns events and scroll side effects.
 */

export const OFFICIAL_PLAN_MIN_ZOOM = 1
export const OFFICIAL_PLAN_MAX_ZOOM = 6
export const OFFICIAL_PLAN_ZOOM_STEP = 0.35
export const OFFICIAL_PLAN_MOBILE_INITIAL_ZOOM = 2.2
export const OFFICIAL_PLAN_WHEEL_ZOOM_SPEED = 0.0018
export const OFFICIAL_PLAN_SELECTED_ANCHOR_MIN_ZOOM = 2
export const OFFICIAL_PLAN_SELECTED_ANCHOR_ZOOM = 2.4
export const OFFICIAL_PLAN_ZOOM_EPSILON = 0.001
export const OFFICIAL_PLAN_DRAG_THRESHOLD_PX = 6

export interface OfficialPlanRectLike {
  left: number
  top: number
  width: number
  height: number
}

export interface ClientPoint {
  clientX: number
  clientY: number
}

export interface OfficialPlanZoomFocusScrollInput {
  currentZoom: number
  nextZoom: number
  scrollLeft: number
  scrollTop: number
  focusX: number
  focusY: number
}

export interface OfficialPlanScrollPosition {
  left: number
  top: number
}

export function clampOfficialPlanZoom(
  value: number,
  minZoom: number = OFFICIAL_PLAN_MIN_ZOOM,
  maxZoom: number = OFFICIAL_PLAN_MAX_ZOOM
): number {
  return Math.min(maxZoom, Math.max(minZoom, Number(value.toFixed(3))))
}

export function isOfficialPlanZoomChangeMeaningful(
  currentZoom: number,
  nextZoom: number,
  epsilon: number = OFFICIAL_PLAN_ZOOM_EPSILON
): boolean {
  return Math.abs(nextZoom - currentZoom) >= epsilon
}

export function resolveOfficialPlanSelectedLabel(input: {
  selectedReferenceLabel?: string | null
  selectedPlaceName?: string | null
}): string | null {
  if (!input.selectedReferenceLabel) return null
  if (!input.selectedPlaceName) return input.selectedReferenceLabel
  return `${input.selectedReferenceLabel} · ${input.selectedPlaceName}`
}

export function resolveOfficialPlanInitialZoom(isCoarsePointer: boolean): number {
  return isCoarsePointer ? OFFICIAL_PLAN_MOBILE_INITIAL_ZOOM : OFFICIAL_PLAN_MIN_ZOOM
}

export function resolveOfficialPlanWheelZoom(input: {
  currentZoom: number
  deltaY: number
  wheelZoomSpeed?: number
}): number {
  const speed = input.wheelZoomSpeed ?? OFFICIAL_PLAN_WHEEL_ZOOM_SPEED
  const factor = Math.exp(-input.deltaY * speed)
  return clampOfficialPlanZoom(input.currentZoom * factor)
}

export function resolveOfficialPlanButtonZoom(input: {
  currentZoom: number
  direction: 'in' | 'out'
  step?: number
}): number {
  const step = input.step ?? OFFICIAL_PLAN_ZOOM_STEP
  const delta = input.direction === 'in' ? step : -step
  return clampOfficialPlanZoom(input.currentZoom + delta)
}

export function touchPointDistance(
  a: ClientPoint | null | undefined,
  b: ClientPoint | null | undefined
): number {
  if (!a || !b) return 0
  const dx = a.clientX - b.clientX
  const dy = a.clientY - b.clientY
  return Math.hypot(dx, dy)
}

export function resolveOfficialPlanPinchMidpoint(
  a: ClientPoint,
  b: ClientPoint
): ClientPoint {
  return {
    clientX: (a.clientX + b.clientX) / 2,
    clientY: (a.clientY + b.clientY) / 2
  }
}

export function resolveOfficialPlanPinchZoom(input: {
  startZoom: number
  startDistance: number
  currentDistance: number
}): number {
  if (input.startDistance <= 0 || input.currentDistance <= 0) {
    return clampOfficialPlanZoom(input.startZoom)
  }
  return clampOfficialPlanZoom(input.startZoom * (input.currentDistance / input.startDistance))
}

export function resolveOfficialPlanZoomFocusScroll(
  input: OfficialPlanZoomFocusScrollInput
): OfficialPlanScrollPosition | null {
  const nextZoom = clampOfficialPlanZoom(input.nextZoom)
  if (!isOfficialPlanZoomChangeMeaningful(input.currentZoom, nextZoom)) return null
  const contentX = (input.scrollLeft + input.focusX) / Math.max(1, input.currentZoom)
  const contentY = (input.scrollTop + input.focusY) / Math.max(1, input.currentZoom)
  return {
    left: contentX * nextZoom - input.focusX,
    top: contentY * nextZoom - input.focusY
  }
}

export function officialPlanAnchorKey(mapNumber: string, index: number): string {
  return `${mapNumber}-${index}`
}

export function shouldBoostZoomForSelectedAnchor(
  currentZoom: number,
  minZoom: number = OFFICIAL_PLAN_SELECTED_ANCHOR_MIN_ZOOM
): boolean {
  return currentZoom < minZoom
}

export function resolveSelectedAnchorBoostZoom(
  boostZoom: number = OFFICIAL_PLAN_SELECTED_ANCHOR_ZOOM
): number {
  return clampOfficialPlanZoom(boostZoom)
}

export function resolveOfficialPlanAnchorScroll(input: {
  offsetLeft: number
  offsetTop: number
  offsetWidth: number
  offsetHeight: number
  clientWidth: number
  clientHeight: number
}): OfficialPlanScrollPosition {
  return {
    left: input.offsetLeft - input.clientWidth / 2 + input.offsetWidth / 2,
    top: input.offsetTop - input.clientHeight / 2 + input.offsetHeight / 2
  }
}

export function resolveOfficialPlanImageLoadState(input: {
  complete: boolean
  naturalWidth: number
}): 'pending' | 'loaded' | 'failed' {
  if (!input.complete) return 'pending'
  return input.naturalWidth > 0 ? 'loaded' : 'failed'
}

export function buildOfficialPlanPlaceNameByNumber(
  places: readonly { mapNumber: string, name: string }[]
): Map<string, string> {
  return new Map(places.map(place => [place.mapNumber, place.name]))
}

export function findOfficialPlanAnchorElementKey(
  keys: readonly string[],
  mapNumber: string
): string | undefined {
  const prefix = `${mapNumber}-`
  return keys.find(key => key.startsWith(prefix))
}

export function resolveOfficialPlanDragScroll(input: {
  scrollLeft: number
  scrollTop: number
  deltaX: number
  deltaY: number
}): OfficialPlanScrollPosition {
  return {
    left: input.scrollLeft - input.deltaX,
    top: input.scrollTop - input.deltaY
  }
}

export function resolveOfficialPlanAnchorScrollFromRects(input: {
  scrollLeft: number
  scrollTop: number
  viewportRect: OfficialPlanRectLike
  elementRect: OfficialPlanRectLike
}): OfficialPlanScrollPosition {
  const viewportCenterX = input.viewportRect.left + input.viewportRect.width / 2
  const viewportCenterY = input.viewportRect.top + input.viewportRect.height / 2
  const elementCenterX = input.elementRect.left + input.elementRect.width / 2
  const elementCenterY = input.elementRect.top + input.elementRect.height / 2
  return {
    left: input.scrollLeft + (elementCenterX - viewportCenterX),
    top: input.scrollTop + (elementCenterY - viewportCenterY)
  }
}

export function isOfficialPlanPointerDragPastThreshold(
  start: ClientPoint,
  current: ClientPoint,
  threshold: number = OFFICIAL_PLAN_DRAG_THRESHOLD_PX
): boolean {
  return touchPointDistance(start, current) >= threshold
}

export function isInteractiveOfficialPlanDragTarget(target: EventTarget | null): boolean {
  if (target == null || typeof Element === 'undefined') return false
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('button, a, input, textarea, select, label, [data-no-plan-drag]'))
}
