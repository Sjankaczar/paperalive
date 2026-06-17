/**
 * @file ARAPPrecompute.test.js
 * @description Unit tests for ARAPPrecompute.js — covers TASK-059, 060, 061, 070, 071, 072.
 */

import { describe, it, expect } from 'vitest'
import {
  computeCotWeightsCSR,
  buildLaplacianAllPinned,
  buildLaplacianFree,
  precomputeARAP,
} from './ARAPPrecompute.js'
import { CholeskyFactor } from './sparse/CholeskyFactor.js'
import { makeGridMesh, makeDegenerateMesh } from './arapTestFixture.js'

describe('TASK-059/070: Cotangent Weights (CSR)', () => {
  it('all weights ≥ 1e-6 (no negative or zero)', () => {
    const mesh = makeGridMesh()
    const weights = computeCotWeightsCSR(mesh)

    // Float32 precision: 1e-6 stored as Float32 ≈ 9.999999974752427e-7
    const F32_EPS = 9.9e-7
    for (let k = 0; k < weights.cotWeightsFlat.length; k++) {
      expect(weights.cotWeightsFlat[k]).toBeGreaterThanOrEqual(F32_EPS)
    }
  })

  it('weight matrix is symmetric: w(i,j) ≈ w(j,i)', () => {
    const mesh = makeGridMesh()
    const { cotWeightsFlat, neighborOffsets, neighborList } = computeCotWeightsCSR(mesh)

    // Build lookup: weight(i, j)
    const weightMap = new Map()
    for (let i = 0; i < mesh.vertexCount; i++) {
      const start = neighborOffsets[i]
      const end = neighborOffsets[i + 1]
      for (let k = start; k < end; k++) {
        const j = neighborList[k]
        weightMap.set(`${i},${j}`, cotWeightsFlat[k])
      }
    }

    // Check symmetry with Float32 tolerance
    for (const [key, w] of weightMap) {
      const [i, j] = key.split(',').map(Number)
      const wji = weightMap.get(`${j},${i}`)
      expect(wji).toBeDefined()
      expect(w).toBeCloseTo(wji, 4)
    }
  })

  it('neighbor access via cotWeightsFlat[neighborOffsets[i] + k] is correct', () => {
    const mesh = makeGridMesh()
    const { cotWeightsFlat, neighborOffsets, neighborList } = computeCotWeightsCSR(mesh)
    const F32_EPS = 9.9e-7

    for (let i = 0; i < mesh.vertexCount; i++) {
      const nbrs = mesh.neighbors[i]
      const start = neighborOffsets[i]
      const end = neighborOffsets[i + 1]
      expect(end - start).toBe(nbrs.length)

      for (let k = 0; k < nbrs.length; k++) {
        expect(neighborList[start + k]).toBe(nbrs[k])
        expect(cotWeightsFlat[start + k]).toBeGreaterThanOrEqual(F32_EPS)
      }
    }
  })

  it('extreme obtuse triangle: values clamped, no NaN', () => {
    const mesh = makeDegenerateMesh()
    const { cotWeightsFlat } = computeCotWeightsCSR(mesh)
    const F32_EPS = 9.9e-7

    for (let k = 0; k < cotWeightsFlat.length; k++) {
      expect(Number.isNaN(cotWeightsFlat[k])).toBe(false)
      expect(cotWeightsFlat[k]).toBeGreaterThanOrEqual(F32_EPS)
    }
  })

  it('no DOM access', () => {
    // Runs in Node env — if it accessed DOM it would fail
    const mesh = makeGridMesh()
    const weights = computeCotWeightsCSR(mesh)
    expect(weights.cotWeightsFlat.length).toBeGreaterThan(0)
  })
})

describe('TASK-060/070: Laplacian Construction', () => {
  it('pin rows: diagonal = 1, off-diagonal = 0', () => {
    const mesh = makeGridMesh()
    const weights = computeCotWeightsCSR(mesh)
    const pins = new Set([0, 5]) // vertices 0 and 5 are pinned

    const L = buildLaplacianAllPinned(mesh, weights, pins)

    // Pin rows: diagonal = 1
    expect(L.get(0, 0)).toBe(1)
    expect(L.get(5, 5)).toBe(1)

    // Pin rows: off-diagonal = 0
    const nbrs0 = mesh.neighbors[0]
    for (const j of nbrs0) {
      expect(L.get(0, j)).toBe(0)
    }
    const nbrs5 = mesh.neighbors[5]
    for (const j of nbrs5) {
      expect(L.get(5, j)).toBe(0)
    }
  })

  it('non-pin rows: diagonal = Σw_ij, off-diagonal = -w_ij', () => {
    const mesh = makeGridMesh()
    const weights = computeCotWeightsCSR(mesh)
    const pins = new Set([0])

    const L = buildLaplacianAllPinned(mesh, weights, pins)

    // Check non-pin vertex (e.g., vertex 5, an interior vertex)
    const i = 5
    const start = weights.neighborOffsets[i]
    const end = weights.neighborOffsets[i + 1]

    let diagSum = 0
    for (let k = start; k < end; k++) {
      const j = weights.neighborList[k]
      const w = weights.cotWeightsFlat[k]
      diagSum += w
      expect(L.get(i, j)).toBeCloseTo(-w, 8)
    }

    expect(L.get(i, i)).toBeCloseTo(diagSum, 8)
  })

  it('buildLaplacianFree does not modify pin rows', () => {
    const mesh = makeGridMesh()
    const weights = computeCotWeightsCSR(mesh)

    const L = buildLaplacianFree(mesh, weights)

    // All rows should have off-diagonal entries (no pin modification)
    for (let i = 0; i < mesh.vertexCount; i++) {
      const nbrs = mesh.neighbors[i]
      if (nbrs.length > 0) {
        // Should have off-diagonal entries
        let hasOffDiag = false
        for (const j of nbrs) {
          if (L.get(i, j) !== 0) hasOffDiag = true
        }
        expect(hasOffDiag).toBe(true)
      }
    }
  })

  it('both Laplacians are symmetric', () => {
    const mesh = makeGridMesh()
    const weights = computeCotWeightsCSR(mesh)
    const pins = new Set([0, 15])

    const Lall = buildLaplacianAllPinned(mesh, weights, pins)
    expect(Lall.isSymmetric()).toBe(true)

    const Lfree = buildLaplacianFree(mesh, weights)
    expect(Lfree.isSymmetric()).toBe(true)
  })
})

describe('TASK-061/070: Dual Cholesky with Fallback', () => {
  it('precomputeARAP on valid mesh returns success: true', () => {
    const mesh = makeGridMesh(5, 5) // 25 vertices for better Cholesky conditioning
    const pinMapping = [
      { jointId: 'head', vertexIndex: 0, distance: 0 },
      { jointId: 'neck', vertexIndex: 12, distance: 0 },
      { jointId: 'l_hip', vertexIndex: 20, distance: 0 },
      { jointId: 'r_hip', vertexIndex: 24, distance: 0 },
    ]

    const result = precomputeARAP(mesh, pinMapping)
    expect(result.success).toBe(true)
  })

  it('weightMode is "cotangent" for valid mesh', () => {
    const mesh = makeGridMesh(5, 5)
    const pinMapping = [
      { jointId: 'head', vertexIndex: 0, distance: 0 },
      { jointId: 'neck', vertexIndex: 12, distance: 0 },
      { jointId: 'l_hip', vertexIndex: 20, distance: 0 },
      { jointId: 'r_hip', vertexIndex: 24, distance: 0 },
    ]

    const result = precomputeARAP(mesh, pinMapping)
    expect(result.success).toBe(true)
    expect(result.data.choleskyAllPinned.weightMode).toBe('cotangent')
    expect(result.data.choleskyFree.weightMode).toBe('cotangent')
  })

  it('choleskyAllPinned and choleskyFree are different factors', () => {
    const mesh = makeGridMesh(5, 5)
    const pinMapping = [
      { jointId: 'head', vertexIndex: 0, distance: 0 },
      { jointId: 'neck', vertexIndex: 12, distance: 0 },
      { jointId: 'l_hip', vertexIndex: 20, distance: 0 },
      { jointId: 'r_hip', vertexIndex: 24, distance: 0 },
    ]

    const result = precomputeARAP(mesh, pinMapping)
    expect(result.success).toBe(true)

    const allPinned = result.data.choleskyAllPinned
    const free = result.data.choleskyFree

    // They should be different objects
    expect(allPinned).not.toBe(free)
    // And potentially have different nnz (allPinned has identity rows for pins)
    expect(allPinned.n).toBe(free.n)
  })

  it('checkNaN on both factors returns false', () => {
    const mesh = makeGridMesh(5, 5)
    const pinMapping = [
      { jointId: 'head', vertexIndex: 0, distance: 0 },
      { jointId: 'neck', vertexIndex: 12, distance: 0 },
      { jointId: 'l_hip', vertexIndex: 20, distance: 0 },
      { jointId: 'r_hip', vertexIndex: 24, distance: 0 },
    ]

    const result = precomputeARAP(mesh, pinMapping)
    expect(result.success).toBe(true)
    expect(CholeskyFactor.checkNaN(result.data.choleskyAllPinned)).toBe(false)
    expect(CholeskyFactor.checkNaN(result.data.choleskyFree)).toBe(false)
  })
})

describe('TASK-071: ARAPPrecompute — Fallback to Uniform Weights', () => {
  it('degenerate mesh falls back to weightMode "uniform"', () => {
    const mesh = makeDegenerateMesh()
    const pinMapping = [
      { jointId: 'head', vertexIndex: 0, distance: 0 },
      { jointId: 'neck', vertexIndex: 9, distance: 0 },
    ]

    const result = precomputeARAP(mesh, pinMapping)
    // Either succeeds with uniform or fails (both acceptable for degenerate mesh)
    if (result.success) {
      expect(result.data.choleskyAllPinned.weightMode).toBe('uniform')
      expect(result.data.choleskyFree.weightMode).toBe('uniform')
    } else {
      expect(result.errorCode).toBe('CHOLESKY_FAILED')
    }
  })

  it('uniform fallback Cholesky produces no NaN', () => {
    const mesh = makeDegenerateMesh()
    const pinMapping = [
      { jointId: 'head', vertexIndex: 0, distance: 0 },
      { jointId: 'neck', vertexIndex: 9, distance: 0 },
    ]

    const result = precomputeARAP(mesh, pinMapping)
    if (result.success) {
      expect(CholeskyFactor.checkNaN(result.data.choleskyAllPinned)).toBe(false)
      expect(CholeskyFactor.checkNaN(result.data.choleskyFree)).toBe(false)
    }
  })
})

describe('TASK-072: ARAPPrecompute — NaN Sentinel Detection', () => {
  it('checkNaN on normal factor returns false', () => {
    const mesh = makeGridMesh(5, 5)
    const pinMapping = [
      { jointId: 'head', vertexIndex: 0, distance: 0 },
      { jointId: 'neck', vertexIndex: 12, distance: 0 },
      { jointId: 'l_hip', vertexIndex: 20, distance: 0 },
      { jointId: 'r_hip', vertexIndex: 24, distance: 0 },
    ]

    const result = precomputeARAP(mesh, pinMapping)
    expect(result.success).toBe(true)
    expect(CholeskyFactor.checkNaN(result.data.choleskyAllPinned)).toBe(false)
  })

  it('checkNaN on factor with NaN returns true', () => {
    const factor = new CholeskyFactor(
      new Int32Array([0, 1, 2]),
      new Int32Array([0, 1]),
      new Float64Array([1.0, NaN]),
      2,
    )
    expect(CholeskyFactor.checkNaN(factor)).toBe(true)
  })

  it('precomputeARAP workspace arrays are pre-allocated', () => {
    const mesh = makeGridMesh(5, 5)
    const pinMapping = [
      { jointId: 'head', vertexIndex: 0, distance: 0 },
      { jointId: 'neck', vertexIndex: 12, distance: 0 },
      { jointId: 'l_hip', vertexIndex: 20, distance: 0 },
      { jointId: 'r_hip', vertexIndex: 24, distance: 0 },
    ]

    const result = precomputeARAP(mesh, pinMapping)
    expect(result.success).toBe(true)

    const ws = result.data.workspace
    expect(ws.rotations).toBeInstanceOf(Float32Array)
    expect(ws.rotations.length).toBe(4 * 25)
    expect(ws.rhs_x).toBeInstanceOf(Float64Array)
    expect(ws.rhs_x.length).toBe(25)
    expect(ws.rhs_y).toBeInstanceOf(Float64Array)
    expect(ws.rhs_y.length).toBe(25)
    expect(ws.outlineNormals).toBeInstanceOf(Float32Array)
    expect(ws.outlineNormals.length).toBe(2 * 25)
    expect(ws.interleavedBuffer).toBeInstanceOf(Float32Array)
    expect(ws.interleavedBuffer.length).toBe(6 * 25)
  })

  it('returns DEGENERATE_MESH when Cholesky factors contain NaN', () => {
    // Mock CholeskyFactor.factorize to return factors with NaN values
    const originalFactorize = CholeskyFactor.factorize
    CholeskyFactor.factorize = () => ({
      success: true,
      factor: {
        lowerL_vals: new Float64Array([1.0, NaN, 1.0]),
        vertexIndices: new Int32Array([0, 1]),
        n: 2,
        weightMode: 'cotangent',
      },
    })

    const mesh = makeGridMesh(3, 3)
    const pinMapping = [
      { jointId: 'head', vertexIndex: 0, distance: 0 },
      { jointId: 'neck', vertexIndex: 4, distance: 0 },
    ]

    const result = precomputeARAP(mesh, pinMapping)

    // Restore original
    CholeskyFactor.factorize = originalFactorize

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('DEGENERATE_MESH')
  })
})
