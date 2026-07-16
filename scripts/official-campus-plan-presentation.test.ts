import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  OFFICIAL_PLAN_MAX_ZOOM,
  OFFICIAL_PLAN_MIN_ZOOM,
  OFFICIAL_PLAN_MOBILE_INITIAL_ZOOM,
  OFFICIAL_PLAN_SELECTED_ANCHOR_ZOOM,
  OFFICIAL_PLAN_ZOOM_STEP,
  buildOfficialPlanPlaceNameByNumber,
  clampOfficialPlanZoom,
  findOfficialPlanAnchorElementKey,
  isOfficialPlanZoomChangeMeaningful,
  officialPlanAnchorKey,
  resolveOfficialPlanAnchorScroll,
  resolveOfficialPlanButtonZoom,
  resolveOfficialPlanImageLoadState,
  resolveOfficialPlanInitialZoom,
  resolveOfficialPlanPinchMidpoint,
  resolveOfficialPlanPinchZoom,
  resolveOfficialPlanSelectedLabel,
  resolveOfficialPlanWheelZoom,
  resolveOfficialPlanZoomFocusScroll,
  resolveSelectedAnchorBoostZoom,
  shouldBoostZoomForSelectedAnchor,
  touchPointDistance,
  resolveOfficialPlanDragScroll,
  resolveOfficialPlanAnchorScrollFromRects,
  isOfficialPlanPointerDragPastThreshold,
  isInteractiveOfficialPlanDragTarget,
  OFFICIAL_PLAN_DRAG_THRESHOLD_PX
} from '../app/utils/official-campus-plan-presentation'

describe('official-campus-plan-presentation', () => {
  it('clamps zoom and ignores near-zero changes', () => {
    assert.equal(clampOfficialPlanZoom(0.2), OFFICIAL_PLAN_MIN_ZOOM)
    assert.equal(clampOfficialPlanZoom(9), OFFICIAL_PLAN_MAX_ZOOM)
    assert.equal(clampOfficialPlanZoom(2.34567), 2.346)
    assert.equal(isOfficialPlanZoomChangeMeaningful(2, 2.0004), false)
    assert.equal(isOfficialPlanZoomChangeMeaningful(2, 2.01), true)
  })

  it('builds selected labels and place-name lookup', () => {
    assert.equal(resolveOfficialPlanSelectedLabel({ selectedReferenceLabel: null }), null)
    assert.equal(
      resolveOfficialPlanSelectedLabel({ selectedReferenceLabel: 'A12' }),
      'A12'
    )
    assert.equal(
      resolveOfficialPlanSelectedLabel({
        selectedReferenceLabel: 'A12',
        selectedPlaceName: '图书馆'
      }),
      'A12 · 图书馆'
    )
    const names = buildOfficialPlanPlaceNameByNumber([
      { mapNumber: '1', name: '南门' },
      { mapNumber: '2', name: '食堂' }
    ])
    assert.equal(names.get('2'), '食堂')
  })

  it('resolves wheel, button, pinch zoom and focus scroll', () => {
    const wheelIn = resolveOfficialPlanWheelZoom({ currentZoom: 2, deltaY: -100 })
    const wheelOut = resolveOfficialPlanWheelZoom({ currentZoom: 2, deltaY: 100 })
    assert.ok(wheelIn > 2)
    assert.ok(wheelOut < 2)
    assert.equal(
      resolveOfficialPlanButtonZoom({ currentZoom: 1, direction: 'in' }),
      clampOfficialPlanZoom(1 + OFFICIAL_PLAN_ZOOM_STEP)
    )
    assert.equal(
      resolveOfficialPlanButtonZoom({ currentZoom: 2, direction: 'out' }),
      clampOfficialPlanZoom(2 - OFFICIAL_PLAN_ZOOM_STEP)
    )
    assert.equal(
      resolveOfficialPlanPinchZoom({ startZoom: 2, startDistance: 100, currentDistance: 150 }),
      3
    )
    assert.equal(
      resolveOfficialPlanPinchZoom({ startZoom: 2, startDistance: 0, currentDistance: 150 }),
      2
    )
    const scroll = resolveOfficialPlanZoomFocusScroll({
      currentZoom: 2,
      nextZoom: 4,
      scrollLeft: 100,
      scrollTop: 50,
      focusX: 20,
      focusY: 10
    })
    assert.deepEqual(scroll, { left: 220, top: 110 })
    assert.equal(
      resolveOfficialPlanZoomFocusScroll({
        currentZoom: 2,
        nextZoom: 2.0001,
        scrollLeft: 0,
        scrollTop: 0,
        focusX: 10,
        focusY: 10
      }),
      null
    )
  })

  it('handles touch geometry, anchors, image state, and initial zoom', () => {
    assert.equal(touchPointDistance(null, { clientX: 1, clientY: 1 }), 0)
    assert.equal(
      touchPointDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 }),
      5
    )
    assert.deepEqual(
      resolveOfficialPlanPinchMidpoint({ clientX: 0, clientY: 0 }, { clientX: 10, clientY: 20 }),
      { clientX: 5, clientY: 10 }
    )
    assert.equal(officialPlanAnchorKey('7', 2), '7-2')
    assert.equal(
      findOfficialPlanAnchorElementKey(['6-0', '7-1', '8-0'], '7'),
      '7-1'
    )
    // Clicking a marker must never auto-boost zoom; keep the current scale.
    assert.equal(shouldBoostZoomForSelectedAnchor(1.5), false)
    assert.equal(shouldBoostZoomForSelectedAnchor(1), false)
    assert.equal(shouldBoostZoomForSelectedAnchor(2), false)
    assert.equal(resolveSelectedAnchorBoostZoom(), OFFICIAL_PLAN_SELECTED_ANCHOR_ZOOM)
    assert.deepEqual(
      resolveOfficialPlanAnchorScroll({
        offsetLeft: 400,
        offsetTop: 300,
        offsetWidth: 20,
        offsetHeight: 20,
        clientWidth: 200,
        clientHeight: 100
      }),
      { left: 310, top: 260 }
    )
    assert.equal(resolveOfficialPlanImageLoadState({ complete: false, naturalWidth: 0 }), 'pending')
    assert.equal(resolveOfficialPlanImageLoadState({ complete: true, naturalWidth: 1200 }), 'loaded')
    assert.equal(resolveOfficialPlanImageLoadState({ complete: true, naturalWidth: 0 }), 'failed')
    assert.equal(resolveOfficialPlanInitialZoom(true), OFFICIAL_PLAN_MOBILE_INITIAL_ZOOM)
    assert.equal(resolveOfficialPlanInitialZoom(false), OFFICIAL_PLAN_MIN_ZOOM)
  })

  it('resolves drag pan scroll and pointer drag threshold', () => {
    assert.deepEqual(
      resolveOfficialPlanDragScroll({
        scrollLeft: 100,
        scrollTop: 50,
        deltaX: 20,
        deltaY: -10
      }),
      { left: 80, top: 60 }
    )
    assert.equal(
      isOfficialPlanPointerDragPastThreshold(
        { clientX: 0, clientY: 0 },
        { clientX: 3, clientY: 4 },
        6
      ),
      false
    )
    assert.equal(
      isOfficialPlanPointerDragPastThreshold(
        { clientX: 0, clientY: 0 },
        { clientX: 6, clientY: 0 },
        OFFICIAL_PLAN_DRAG_THRESHOLD_PX
      ),
      true
    )
  })

  it('centers anchors from viewport and element rects', () => {
    assert.deepEqual(
      resolveOfficialPlanAnchorScrollFromRects({
        scrollLeft: 10,
        scrollTop: 20,
        viewportRect: { left: 0, top: 0, width: 200, height: 100 },
        elementRect: { left: 150, top: 80, width: 20, height: 20 }
      }),
      { left: 70, top: 60 }
    )
  })

  it('detects interactive drag targets without DOM when possible', () => {
    assert.equal(isInteractiveOfficialPlanDragTarget(null), false)
  })

})
