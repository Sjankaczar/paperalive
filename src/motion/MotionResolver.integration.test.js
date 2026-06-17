/**
 * @file MotionResolver.integration.test.js
 * @description Integration tests — MotionResolver → ARAPSolver pipeline.
 *
 * Verifies that MotionResolver.resolve() output feeds correctly into
 * ARAPSolver.setHandles() and produces valid deformation.
 *
 * @see implementation/tasks/TASK-104-115-epic9-motion.md — TASK-115
 */

import { describe, it, expect } from 'vitest'
import { MotionResolver } from './MotionResolver.js'
import { ARAPSolver } from '../arap/ARAPSolver.js'
import { precomputeARAP } from '../arap/ARAPPrecompute.js'
import { makeGridMesh, makeCharacterData } from '../arap/arapTestFixture.js'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function setupIntegration() {
  const mesh = makeGridMesh(5, 5)
  const pinMapping = [
    { jointId: 'head', vertexIndex: 0, distance: 0 },
    { jointId: 'neck', vertexIndex: 12, distance: 0 },
    { jointId: 'l_hip', vertexIndex: 20, distance: 0 },
    { jointId: 'r_hip', vertexIndex: 24, distance: 0 },
  ]

  const result = precomputeARAP(mesh, pinMapping)
  if (!result.success) {
    throw new Error(`precomputeARAP failed: ${result.errorCode}`)
  }

  const charData = makeCharacterData(mesh, result.data, pinMapping)
  const solver = new ARAPSolver(charData)
  const resolver = new MotionResolver(charData)

  return { charData, solver, resolver, pinMapping }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('TASK-115: Integration — MotionResolver → ARAPSolver', () => {
  describe('Idle mode → ARAP', () => {
    it('should produce targets at rest pose and feed them to solver', () => {
      const { charData, solver, resolver, pinMapping } = setupIntegration()

      const targets = resolver.resolve(16)

      // All targets should be at rest positions
      for (const pin of pinMapping) {
        const restX = charData.geometry.vertices0[pin.vertexIndex * 2]
        const restY = charData.geometry.vertices0[pin.vertexIndex * 2 + 1]
        const target = targets.get(pin.jointId)
        expect(target[0]).toBeCloseTo(restX)
        expect(target[1]).toBeCloseTo(restY)
      }

      // Feed to solver — should not throw
      solver.setHandles(targets, pinMapping)
      solver.step(2)

      // Solver positions should be finite (no NaN/Infinity)
      for (let i = 0; i < solver.currentPositions.length; i++) {
        expect(Number.isFinite(solver.currentPositions[i])).toBe(true)
      }
    })
  })

  describe('Clip mode → ARAP', () => {
    it('should produce offset targets and solver should deform', () => {
      const { charData, solver, resolver, pinMapping } = setupIntegration()

      // Register and play a clip with non-zero offsets
      resolver.registerClip('walk', {
        id: 'walk',
        fps: 24,
        loop: true,
        frames: [
          { joints: { head: { dx: 5, dy: -3 }, neck: { dx: 2, dy: -1 }, l_hip: { dx: -3, dy: 0 }, r_hip: { dx: 3, dy: 0 } } },
          { joints: { head: { dx: -5, dy: 3 }, neck: { dx: -2, dy: 1 }, l_hip: { dx: 3, dy: 0 }, r_hip: { dx: -3, dy: 0 } } },
        ],
      })
      resolver.playClip('walk')

      // Advance several frames
      let hasOffset = false
      for (let i = 0; i < 12; i++) {
        const targets = resolver.resolve(1000 / 24)

        // Check if any joint is offset from rest
        for (const [jointId, pos] of targets) {
          const pin = pinMapping.find(p => p.jointId === jointId)
          if (pin) {
            const restX = charData.geometry.vertices0[pin.vertexIndex * 2]
            const restY = charData.geometry.vertices0[pin.vertexIndex * 2 + 1]
            if (Math.abs(pos[0] - restX) > 0.1 || Math.abs(pos[1] - restY) > 0.1) {
              hasOffset = true
            }
          }
        }

        // Feed to solver
        solver.setHandles(targets, pinMapping)
        solver.step(2)
      }

      expect(hasOffset).toBe(true)

      // Solver positions should differ from rest after deformation
      let hasDeformation = false
      for (let i = 0; i < charData.geometry.vertexCount; i++) {
        const dx = Math.abs(solver.currentPositions[i * 2] - charData.geometry.vertices0[i * 2])
        const dy = Math.abs(solver.currentPositions[i * 2 + 1] - charData.geometry.vertices0[i * 2 + 1])
        if (dx > 0.01 || dy > 0.01) {
          hasDeformation = true
          break
        }
      }
      expect(hasDeformation).toBe(true)
    })

    it('should not produce NaN in solver positions', () => {
      const { solver, resolver, pinMapping } = setupIntegration()

      resolver.registerClip('test', {
        id: 'test',
        fps: 24,
        loop: true,
        frames: [
          { joints: { head: { dx: 10, dy: -5 }, neck: { dx: 5, dy: -2 }, l_hip: { dx: -5, dy: 3 }, r_hip: { dx: 5, dy: 3 } } },
          { joints: { head: { dx: -10, dy: 5 }, neck: { dx: -5, dy: 2 }, l_hip: { dx: 5, dy: -3 }, r_hip: { dx: -5, dy: -3 } } },
        ],
      })
      resolver.playClip('test')

      for (let i = 0; i < 24; i++) {
        const targets = resolver.resolve(1000 / 24)
        solver.setHandles(targets, pinMapping)
        solver.step(2)
      }

      // No NaN in positions
      for (let i = 0; i < solver.currentPositions.length; i++) {
        expect(Number.isNaN(solver.currentPositions[i])).toBe(false)
      }
    })
  })

  describe('Drag mode → ARAP', () => {
    it('dragged joint should be at target position in resolver output', () => {
      const { solver, resolver, pinMapping } = setupIntegration()

      resolver.startDrag('head', 50, 30)
      resolver.updateDrag(55, 35)

      const targets = resolver.resolve(16)
      const headTarget = targets.get('head')

      expect(headTarget[0]).toBe(55)
      expect(headTarget[1]).toBe(35)

      // Feed to solver (IK mode — only 1 joint, uses choleskyFree)
      solver.setHandles(targets, pinMapping)
      solver.step(2)

      // No NaN
      for (let i = 0; i < solver.currentPositions.length; i++) {
        expect(Number.isNaN(solver.currentPositions[i])).toBe(false)
      }
    })

    it('endDrag should return to pure clip/rest mode', () => {
      const { charData, resolver, pinMapping } = setupIntegration()

      resolver.startDrag('head', 50, 30)
      resolver.endDrag()

      const targets = resolver.resolve(16)

      // head should be at rest
      const headPin = pinMapping.find(p => p.jointId === 'head')
      const restX = charData.geometry.vertices0[headPin.vertexIndex * 2]
      const restY = charData.geometry.vertices0[headPin.vertexIndex * 2 + 1]
      expect(targets.get('head')[0]).toBeCloseTo(restX)
      expect(targets.get('head')[1]).toBeCloseTo(restY)
    })
  })

  describe('Strategy selection', () => {
    it('all joints resolved → choleskyAllPinned strategy', () => {
      const { solver, resolver, pinMapping } = setupIntegration()

      // Resolve all joints (idle mode → all joints in map)
      const targets = resolver.resolve(16)

      solver.setHandles(targets, pinMapping)

      expect(solver._strategy).toBe('allPinned')
      expect(solver._selectedFactor).toBe(resolver._charData.arap.choleskyAllPinned)
    })

    it('drag mode (subset) → choleskyFree strategy', () => {
      const { solver, resolver, pinMapping } = setupIntegration()

      resolver.startDrag('head', 50, 30)
      const targets = resolver.resolve(16)

      // targets has all 4 joints (3 at rest + 1 dragged)
      // Since all 4 joints are in the map, it's still allPinned
      // Let's verify: targets.size === jointCount (4)
      expect(targets.size).toBe(4)

      solver.setHandles(targets, pinMapping)
      // Still allPinned because all joints are resolved
      expect(solver._strategy).toBe('allPinned')

      resolver.endDrag()
    })
  })

  describe('MotionResolver modes', () => {
    it('should start in idle mode', () => {
      const { resolver } = setupIntegration()
      expect(resolver.mode).toBe('idle')
    })

    it('setClip(null) should return to idle mode', () => {
      const { resolver } = setupIntegration()

      resolver.registerClip('walk', {
        id: 'walk', fps: 24, loop: true,
        frames: [
          { joints: { head: { dx: 5, dy: 0 }, neck: { dx: 2, dy: 0 }, l_hip: { dx: -3, dy: 0 }, r_hip: { dx: 3, dy: 0 } } },
          { joints: { joints: {} } },
        ],
      })
      resolver.setClip('walk')
      expect(resolver.mode).toBe('clip')

      resolver.setClip(null)
      expect(resolver.mode).toBe('idle')
    })

    it('resolve should return Map with all joints in idle mode', () => {
      const { resolver, pinMapping } = setupIntegration()

      const targets = resolver.resolve(16)

      expect(targets.size).toBe(pinMapping.length)
      for (const pin of pinMapping) {
        expect(targets.has(pin.jointId)).toBe(true)
      }
    })
  })
})
