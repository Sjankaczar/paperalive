/**
 * @file IKDragHandler.test.js
 * @description Unit tests for IKDragHandler — hit-test and drag tracking.
 * @see implementation/tasks/TASK-104-115-epic9-motion.md — TASK-113
 */

import { describe, it, expect } from 'vitest'
import { IKDragHandler } from './IKDragHandler.js'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Create a pinMapping with 3 joints at known positions.
 * Positions stored in Float32Array at vertexIndex * 2 stride.
 */
function makeFixture() {
  // 5 vertices, 10 floats: [x0,y0, x1,y1, ...]
  const positions = new Float32Array([
    100, 80,   // vertex 0 → "head"
    80, 120,   // vertex 1 → "l_shoulder"
    120, 120,  // vertex 2 → "r_shoulder"
    60, 200,   // vertex 3 → "l_wrist"
    140, 200,  // vertex 4 → "r_wrist"
  ])

  const pinMapping = [
    { jointId: 'head', vertexIndex: 0, distance: 0 },
    { jointId: 'l_shoulder', vertexIndex: 1, distance: 0 },
    { jointId: 'r_shoulder', vertexIndex: 2, distance: 0 },
    { jointId: 'l_wrist', vertexIndex: 3, distance: 0 },
    { jointId: 'r_wrist', vertexIndex: 4, distance: 0 },
  ]

  return { positions, pinMapping }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('IKDragHandler', () => {
  describe('hitTest', () => {
    it('should return jointId when pointer is within 20px radius', () => {
      const handler = new IKDragHandler()
      const { positions, pinMapping } = makeFixture()
      handler.setCurrentPositions(positions)

      // head at (100, 80), pointer at (105, 82) → distance ≈ 5.4 < 20
      const result = handler.hitTest(105, 82, pinMapping)
      expect(result).toBe('head')
    })

    it('should return null when pointer is outside all joint radii', () => {
      const handler = new IKDragHandler()
      const { positions, pinMapping } = makeFixture()
      handler.setCurrentPositions(positions)

      // pointer at (150, 80) → distance to head (100,80) = 50 > 20
      const result = handler.hitTest(150, 80, pinMapping)
      expect(result).toBeNull()
    })

    it('should return the closest joint when two are within range', () => {
      const handler = new IKDragHandler()
      const { positions, pinMapping } = makeFixture()
      handler.setCurrentPositions(positions)

      // l_shoulder at (80,120), r_shoulder at (120,120)
      // pointer at (100, 120) → equidistant at 20px each (exactly at boundary)
      // Move slightly closer to l_shoulder
      const result = handler.hitTest(95, 120, pinMapping)
      // l_shoulder dist = sqrt((95-80)^2 + 0) = 15 < 20
      // r_shoulder dist = sqrt((95-120)^2 + 0) = 25 > 20
      expect(result).toBe('l_shoulder')
    })

    it('should return closest of two joints both within range', () => {
      const handler = new IKDragHandler()
      const { positions, pinMapping } = makeFixture()
      handler.setCurrentPositions(positions)

      // pointer at (90, 120) → l_shoulder dist=10, r_shoulder dist=30
      const result = handler.hitTest(90, 120, pinMapping)
      expect(result).toBe('l_shoulder')
    })

    it('should return null if no positions set', () => {
      const handler = new IKDragHandler()
      const { pinMapping } = makeFixture()
      const result = handler.hitTest(100, 80, pinMapping)
      expect(result).toBeNull()
    })

    it('should hit joint at exact position (distance = 0)', () => {
      const handler = new IKDragHandler()
      const { positions, pinMapping } = makeFixture()
      handler.setCurrentPositions(positions)

      // pointer exactly at head position
      const result = handler.hitTest(100, 80, pinMapping)
      expect(result).toBe('head')
    })

    it('should return joint at exactly 20px distance (boundary)', () => {
      const handler = new IKDragHandler()
      const { positions, pinMapping } = makeFixture()
      handler.setCurrentPositions(positions)

      // head at (100, 80), pointer at (120, 80) → distance = 20 = HIT_RADIUS
      const result = handler.hitTest(120, 80, pinMapping)
      expect(result).toBe('head')
    })
  })

  describe('drag tracking', () => {
    it('should return null before startDrag', () => {
      const handler = new IKDragHandler()
      expect(handler.getActiveTarget()).toBeNull()
    })

    it('should return target after startDrag', () => {
      const handler = new IKDragHandler()
      handler.startDrag('l_wrist', 100, 200)

      const target = handler.getActiveTarget()
      expect(target).toEqual({ jointId: 'l_wrist', x: 100, y: 200 })
    })

    it('should update position after updateDrag', () => {
      const handler = new IKDragHandler()
      handler.startDrag('l_wrist', 100, 200)
      handler.updateDrag(110, 210)

      const target = handler.getActiveTarget()
      expect(target).toEqual({ jointId: 'l_wrist', x: 110, y: 210 })
    })

    it('should return null after endDrag', () => {
      const handler = new IKDragHandler()
      handler.startDrag('l_wrist', 100, 200)
      handler.endDrag()

      expect(handler.getActiveTarget()).toBeNull()
    })

    it('should handle multiple drag cycles', () => {
      const handler = new IKDragHandler()

      handler.startDrag('head', 100, 80)
      handler.updateDrag(105, 85)
      expect(handler.getActiveTarget().jointId).toBe('head')

      handler.endDrag()
      expect(handler.getActiveTarget()).toBeNull()

      handler.startDrag('r_wrist', 140, 200)
      expect(handler.getActiveTarget().jointId).toBe('r_wrist')
      expect(handler.getActiveTarget().x).toBe(140)
    })

    it('updateDrag should not change target if no drag active', () => {
      const handler = new IKDragHandler()
      handler.updateDrag(50, 50)
      expect(handler.getActiveTarget()).toBeNull()
    })
  })

  describe('setCurrentPositions', () => {
    it('should update positions used by hitTest', () => {
      const handler = new IKDragHandler()
      const { pinMapping } = makeFixture()

      // Initially no positions
      expect(handler.hitTest(200, 300, pinMapping)).toBeNull()

      // Set new positions with a joint at (200, 300)
      const newPositions = new Float32Array([200, 300, 0, 0, 0, 0, 0, 0, 0, 0])
      handler.setCurrentPositions(newPositions)

      expect(handler.hitTest(200, 300, pinMapping)).toBe('head')
    })
  })
})
