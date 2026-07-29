interface GraphScreenPoint {
  x: number
  y: number
}

interface GraphPointerEventLike {
  pointerId: number
  screenPoint: GraphScreenPoint
}

interface GraphGestureIntent {
  kind: string
  [key: string]: unknown
}

interface GraphGestureSnapshot {
  kind?: string
  pointerId?: number
  startScreenPoint?: GraphScreenPoint
  lastScreenPoint?: GraphScreenPoint
}

interface GraphGestureStateMachineLike {
  active?: Record<string, unknown> | null
  pointerMove: (event: GraphPointerEventLike) => GraphGestureIntent[]
  snapshot?: () => GraphGestureSnapshot | null
}

interface GraphGestureStateMachineConstructor {
  prototype: GraphGestureStateMachineLike & {
    __yeuCommunityPanPatched?: boolean
  }
}

export interface KnowledgeGraphEngineLibraryLike {
  GraphGestureStateMachine?: GraphGestureStateMachineConstructor
}

function finiteCoordinate(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * The graph engine treats a community wash as a click-only surface. With dense
 * communities, those washes cover most of the canvas, which makes blank-space
 * panning practically impossible. Promote a moved community click candidate
 * into the same pan gesture used by true blank canvas areas.
 */
export function enableCommunityDragPanning(library: KnowledgeGraphEngineLibraryLike): boolean {
  const prototype = library.GraphGestureStateMachine?.prototype
  if (!prototype || typeof prototype.pointerMove !== 'function') return false
  if (prototype.__yeuCommunityPanPatched) return true

  const originalPointerMove = prototype.pointerMove
  prototype.pointerMove = function patchedPointerMove(event): GraphGestureIntent[] {
    const before = typeof this.snapshot === 'function'
      ? this.snapshot()
      : this.active as GraphGestureSnapshot | null
    const intents = originalPointerMove.call(this, event)

    const cancelledCommunityClick = before?.kind === 'community-wash'
      && intents.some(intent => intent.kind === 'community-click-cancelled')
    if (!cancelledCommunityClick) return intents

    const previousPoint = before.lastScreenPoint ?? before.startScreenPoint ?? event.screenPoint
    const screenPoint = {
      x: finiteCoordinate(event.screenPoint?.x),
      y: finiteCoordinate(event.screenPoint?.y)
    }
    const delta = {
      x: screenPoint.x - finiteCoordinate(previousPoint.x, screenPoint.x),
      y: screenPoint.y - finiteCoordinate(previousPoint.y, screenPoint.y)
    }
    const pointerId = finiteCoordinate(before.pointerId, event.pointerId)
    const startScreenPoint = before.startScreenPoint ?? previousPoint

    this.active = {
      kind: 'blank-pan',
      pointerId,
      startScreenPoint: { ...startScreenPoint },
      lastScreenPoint: { ...screenPoint },
      locked: true
    }

    return [
      {
        kind: 'blank-pan-start',
        pointerId,
        screenPoint: { ...screenPoint }
      },
      {
        kind: 'blank-pan-move',
        pointerId,
        screenPoint: { ...screenPoint },
        delta
      }
    ]
  }
  prototype.__yeuCommunityPanPatched = true
  return true
}
