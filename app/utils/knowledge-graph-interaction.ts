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
  nodeId?: string
  additive?: boolean
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
 * Dense graph regions are almost entirely covered by community washes and node
 * hit targets, leaving no practical blank surface for viewport panning.
 * Promote ordinary drags on either surface into the same pan gesture used by
 * true blank areas. Shift-drag remains the explicit way to reposition a node,
 * while a short ordinary press still selects it.
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

    const promoteCommunityDrag = before?.kind === 'community-wash'
      && intents.some(intent => intent.kind === 'community-click-cancelled')
    const promoteOrdinaryNodeDrag = before?.kind === 'node'
      && before.additive !== true
      && intents.some(intent => intent.kind === 'node-drag-start')
    if (!promoteCommunityDrag && !promoteOrdinaryNodeDrag) return intents

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
