import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { enableCommunityDragPanning } from '../app/utils/knowledge-graph-interaction'

class FakeGestureStateMachine {
  active: Record<string, unknown> | null = null

  snapshot(): Record<string, unknown> | null {
    return this.active ? structuredClone(this.active) : null
  }

  pointerMove(event: { pointerId: number, screenPoint: { x: number, y: number } }): Array<Record<string, unknown>> {
    if (this.active?.kind === 'community-wash') {
      this.active = {
        ...this.active,
        lastScreenPoint: { ...event.screenPoint },
        locked: true,
        cancelled: true
      }
      return [{
        kind: 'community-click-cancelled',
        communityId: this.active.communityId,
        pointerId: event.pointerId,
        reason: 'moved'
      }]
    }
    if (this.active?.kind === 'node') {
      const previous = this.active.lastScreenPoint as { x: number, y: number }
      this.active = {
        ...this.active,
        lastScreenPoint: { ...event.screenPoint },
        locked: true
      }
      return [{
        kind: 'node-drag-start',
        nodeId: this.active.nodeId,
        pointerId: event.pointerId,
        screenPoint: { ...event.screenPoint }
      }, {
        kind: 'node-drag-move',
        nodeId: this.active.nodeId,
        pointerId: event.pointerId,
        screenPoint: { ...event.screenPoint },
        delta: {
          x: event.screenPoint.x - previous.x,
          y: event.screenPoint.y - previous.y
        }
      }]
    }
    if (this.active?.kind === 'blank-pan') {
      const previous = this.active.lastScreenPoint as { x: number, y: number }
      this.active = { ...this.active, lastScreenPoint: { ...event.screenPoint } }
      return [{
        kind: 'blank-pan-move',
        pointerId: event.pointerId,
        screenPoint: { ...event.screenPoint },
        delta: {
          x: event.screenPoint.x - previous.x,
          y: event.screenPoint.y - previous.y
        }
      }]
    }
    return []
  }
}

describe('knowledge graph community drag panning', () => {
  it('promotes a moved community wash into a viewport pan', () => {
    const library = { GraphGestureStateMachine: FakeGestureStateMachine }
    assert.equal(enableCommunityDragPanning(library), true)

    const machine = new FakeGestureStateMachine()
    machine.active = {
      kind: 'community-wash',
      pointerId: 7,
      communityId: 'community-1',
      startScreenPoint: { x: 100, y: 80 },
      lastScreenPoint: { x: 100, y: 80 },
      locked: false,
      cancelled: false
    }

    assert.deepEqual(machine.pointerMove({
      pointerId: 7,
      screenPoint: { x: 118, y: 91 }
    }), [
      {
        kind: 'blank-pan-start',
        pointerId: 7,
        screenPoint: { x: 118, y: 91 }
      },
      {
        kind: 'blank-pan-move',
        pointerId: 7,
        screenPoint: { x: 118, y: 91 },
        delta: { x: 18, y: 11 }
      }
    ])
    assert.equal(machine.active?.kind, 'blank-pan')

    assert.deepEqual(machine.pointerMove({
      pointerId: 7,
      screenPoint: { x: 126, y: 95 }
    }), [{
      kind: 'blank-pan-move',
      pointerId: 7,
      screenPoint: { x: 126, y: 95 },
      delta: { x: 8, y: 4 }
    }])
  })

  it('is idempotent and leaves ordinary gestures unchanged', () => {
    const library = { GraphGestureStateMachine: FakeGestureStateMachine }
    assert.equal(enableCommunityDragPanning(library), true)
    assert.equal(enableCommunityDragPanning(library), true)

    const machine = new FakeGestureStateMachine()
    machine.active = {
      kind: 'blank-pan',
      pointerId: 2,
      startScreenPoint: { x: 0, y: 0 },
      lastScreenPoint: { x: 4, y: 6 },
      locked: true
    }
    assert.deepEqual(machine.pointerMove({
      pointerId: 2,
      screenPoint: { x: 9, y: 12 }
    }), [{
      kind: 'blank-pan-move',
      pointerId: 2,
      screenPoint: { x: 9, y: 12 },
      delta: { x: 5, y: 6 }
    }])
  })

  it('pans from a dense node hit target while preserving shift-drag node movement', () => {
    const library = { GraphGestureStateMachine: FakeGestureStateMachine }
    assert.equal(enableCommunityDragPanning(library), true)

    const machine = new FakeGestureStateMachine()
    machine.active = {
      kind: 'node',
      pointerId: 9,
      nodeId: 'node-1',
      additive: false,
      startScreenPoint: { x: 210, y: 160 },
      lastScreenPoint: { x: 210, y: 160 },
      locked: false
    }
    assert.deepEqual(machine.pointerMove({
      pointerId: 9,
      screenPoint: { x: 230, y: 172 }
    }), [{
      kind: 'blank-pan-start',
      pointerId: 9,
      screenPoint: { x: 230, y: 172 }
    }, {
      kind: 'blank-pan-move',
      pointerId: 9,
      screenPoint: { x: 230, y: 172 },
      delta: { x: 20, y: 12 }
    }])
    assert.equal(machine.active?.kind, 'blank-pan')

    const shifted = new FakeGestureStateMachine()
    shifted.active = {
      kind: 'node',
      pointerId: 10,
      nodeId: 'node-2',
      additive: true,
      startScreenPoint: { x: 50, y: 50 },
      lastScreenPoint: { x: 50, y: 50 },
      locked: false
    }
    assert.equal(shifted.pointerMove({
      pointerId: 10,
      screenPoint: { x: 62, y: 58 }
    })[0]?.kind, 'node-drag-start')
    assert.equal(shifted.active?.kind, 'node')
  })
})
