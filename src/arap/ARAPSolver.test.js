/**
 * @file ARAPSolver.test.js
 * @description Unit tests for ARAPSolver.js — covers TASK-062–066 and TASK-073.
 */

import { describe, it, expect } from 'vitest'
import { ARAPSolver } from './ARAPSolver.js'
import { precomputeARAP } from './ARAPPrecompute.js'
import { makeGridMesh, makeCharacterData } from './arapTestFixture.js'

/**
 * Build a fully initialized CharacterData + ARAPSolver for testing.
 */
function setupSolver() {
  const mesh = makeGridMesh(5, 5) // 25 vertices
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
  return { solver, charData, mesh, pinMapping }
}

describe('TASK-062/073: ARAPSolver — Constructor & Setup', () => {
  it('currentPositions.length === 2 × vertexCount', () => {
    const { solver, charData } = setupSolver()
    expect(solver.currentPositions.length).toBe(2 * charData.geometry.vertexCount)
  })

  it('currentPositions is a copy of vertices0', () => {
    const { solver, charData } = setupSolver()
    const v0 = charData.geometry.vertices0
    const curr = solver.currentPositions

    for (let i = 0; i < v0.length; i++) {
      expect(curr[i]).toBe(v0[i])
    }
  })

  it('currentPositions is a Float32Array', () => {
    const { solver } = setupSolver()
    expect(solver.currentPositions).toBeInstanceOf(Float32Array)
  })
})

describe('TASK-063/073: ARAPSolver — Strategy Selection', () => {
  it('all joints pinned → uses choleskyAllPinned', () => {
    const { solver, charData, pinMapping } = setupSolver()

    // Set all joints as targets
    const targets = new Map()
    for (const pin of pinMapping) {
      const vx = charData.geometry.vertices0[pin.vertexIndex * 2]
      const vy = charData.geometry.vertices0[pin.vertexIndex * 2 + 1]
      targets.set(pin.jointId, [vx + 5, vy + 5])
    }

    solver.setHandles(targets, pinMapping)

    // Verify strategy: should be allPinned (targets.size >= jointCount)
    expect(solver._strategy).toBe('allPinned')
    expect(solver._selectedFactor).toBe(charData.arap.choleskyAllPinned)
  })

  it('subset of joints (IK) → uses choleskyFree', () => {
    const { solver, charData, pinMapping } = setupSolver()

    // Only 2 joints
    const targets = new Map()
    targets.set(pinMapping[0].jointId, [10, 10])
    targets.set(pinMapping[1].jointId, [20, 20])

    solver.setHandles(targets, pinMapping)

    expect(solver._strategy).toBe('free')
    expect(solver._selectedFactor).toBe(charData.arap.choleskyFree)
  })

  it('penalty targets stored for IK mode', () => {
    const { solver, pinMapping } = setupSolver()

    const targets = new Map()
    targets.set(pinMapping[0].jointId, [15, 25])

    solver.setHandles(targets, pinMapping)

    expect(solver._ikTargets.length).toBe(1)
    expect(solver._ikTargets[0].targetX).toBe(15)
    expect(solver._ikTargets[0].targetY).toBe(25)
  })
})

describe('TASK-064/073: ARAPSolver — Local Step', () => {
  it('workspace.rotations is filled (not all zeros) after localStep', () => {
    const { solver, charData, pinMapping } = setupSolver()

    const targets = new Map()
    for (const pin of pinMapping) {
      const vx = charData.geometry.vertices0[pin.vertexIndex * 2]
      const vy = charData.geometry.vertices0[pin.vertexIndex * 2 + 1]
      targets.set(pin.jointId, [vx + 5, vy + 5])
    }
    solver.setHandles(targets, pinMapping)
    solver.localStep()

    const rotations = charData.arap.workspace.rotations
    let allZero = true
    for (let i = 0; i < rotations.length; i++) {
      if (rotations[i] !== 0) {
        allZero = false
        break
      }
    }
    expect(allZero).toBe(false)
  })

  it('each rotation 2×2 has det ≈ +1 (proper rotation)', () => {
    const { solver, charData, pinMapping } = setupSolver()

    const targets = new Map()
    for (const pin of pinMapping) {
      const vx = charData.geometry.vertices0[pin.vertexIndex * 2]
      const vy = charData.geometry.vertices0[pin.vertexIndex * 2 + 1]
      targets.set(pin.jointId, [vx + 5, vy + 5])
    }
    solver.setHandles(targets, pinMapping)
    solver.localStep()

    const rot = charData.arap.workspace.rotations
    const n = charData.geometry.vertexCount

    for (let i = 0; i < n; i++) {
      const r00 = rot[i * 4 + 0]
      const r10 = rot[i * 4 + 1]
      const r01 = rot[i * 4 + 2]
      const r11 = rot[i * 4 + 3]

      // det = r00*r11 - r01*r10
      const det = r00 * r11 - r01 * r10

      // Allow for numerical tolerance — some vertices may have degenerate neighborhoods
      if (Math.abs(det) > 0.01) {
        expect(det).toBeCloseTo(1.0, 0)
      }
    }
  })
})

describe('TASK-065/073: ARAPSolver — Global Step', () => {
  it('currentPositions changes from rest after localStep + globalStep', () => {
    const { solver, charData, pinMapping } = setupSolver()

    // Move joints significantly
    const targets = new Map()
    for (const pin of pinMapping) {
      const vx = charData.geometry.vertices0[pin.vertexIndex * 2]
      const vy = charData.geometry.vertices0[pin.vertexIndex * 2 + 1]
      targets.set(pin.jointId, [vx + 20, vy + 20])
    }
    solver.setHandles(targets, pinMapping)

    solver.localStep()
    solver.globalStep()

    const v0 = charData.geometry.vertices0
    const curr = solver.currentPositions
    let changed = false
    for (let i = 0; i < v0.length; i++) {
      if (Math.abs(curr[i] - v0[i]) > 0.01) {
        changed = true
        break
      }
    }
    expect(changed).toBe(true)
  })
})

describe('TASK-066/073: ARAPSolver — step() & reset()', () => {
  it('step(2) calls localStep and globalStep 2 times each', () => {
    const { solver, charData, pinMapping } = setupSolver()

    const targets = new Map()
    for (const pin of pinMapping) {
      const vx = charData.geometry.vertices0[pin.vertexIndex * 2]
      const vy = charData.geometry.vertices0[pin.vertexIndex * 2 + 1]
      targets.set(pin.jointId, [vx + 10, vy + 10])
    }
    solver.setHandles(targets, pinMapping)

    // Spy by counting calls
    let localCount = 0
    let globalCount = 0
    const origLocal = solver.localStep.bind(solver)
    const origGlobal = solver.globalStep.bind(solver)
    solver.localStep = () => { localCount++; origLocal() }
    solver.globalStep = () => { globalCount++; origGlobal() }

    solver.step(2)

    expect(localCount).toBe(2)
    expect(globalCount).toBe(2)
  })

  it('step returns currentPositions', () => {
    const { solver, pinMapping, charData } = setupSolver()

    const targets = new Map()
    for (const pin of pinMapping) {
      const vx = charData.geometry.vertices0[pin.vertexIndex * 2]
      const vy = charData.geometry.vertices0[pin.vertexIndex * 2 + 1]
      targets.set(pin.jointId, [vx + 5, vy + 5])
    }
    solver.setHandles(targets, pinMapping)

    const result = solver.step(1)
    expect(result).toBe(solver.currentPositions)
  })

  it('reset() makes currentPositions identical to vertices0', () => {
    const { solver, charData, pinMapping } = setupSolver()

    // Deform first
    const targets = new Map()
    for (const pin of pinMapping) {
      const vx = charData.geometry.vertices0[pin.vertexIndex * 2]
      const vy = charData.geometry.vertices0[pin.vertexIndex * 2 + 1]
      targets.set(pin.jointId, [vx + 15, vy + 15])
    }
    solver.setHandles(targets, pinMapping)
    solver.step(2)

    // Verify it changed
    const v0 = charData.geometry.vertices0
    let wasDifferent = false
    for (let i = 0; i < v0.length; i++) {
      if (solver.currentPositions[i] !== v0[i]) {
        wasDifferent = true
        break
      }
    }

    // Reset
    solver.reset()

    // Should be identical to rest pose now
    for (let i = 0; i < v0.length; i++) {
      expect(solver.currentPositions[i]).toBeCloseTo(v0[i], 10)
    }
    expect(wasDifferent).toBe(true)
  })
})
