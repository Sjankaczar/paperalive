/**
 * @file ARAPSolver.js
 * @description Per-frame ARAP deformation solver.
 *
 * Implements local step (SVD per-vertex) + global step (Cholesky back-substitution).
 * Strategy selection: allPinned (motion clip) or free + penalty (IK drag).
 *
 * Zero-allocation constraint: no new Array/Float32Array/Float64Array/Object in
 * localStep(), globalStep(), or step() after construction.
 *
 * @see architecture/module_design.md — ARAPSolver.js
 */

import { svd2x2InPlace } from '../utils/math2d.js'
import { CholeskyFactor } from './sparse/CholeskyFactor.js'

const CONSTRAINT_WEIGHT = 1000

/**
 * ARAP per-frame solver.
 */
export class ARAPSolver {
  /**
   * @param {import('../types/characterData.js').CharacterData} charData
   */
  constructor(charData) {
    /** @type {import('../types/characterData.js').CharacterData} */
    this._charData = charData

    const n = charData.geometry.vertexCount

    // Current positions: copy of rest pose (Float32Array, interleaved x,y)
    this._currentPositions = new Float32Array(charData.geometry.vertices0)

    // Selected Cholesky factor (set by setHandles)
    /** @type {import('../types/characterData.js').CholeskyFactor | null} */
    this._selectedFactor = null

    // Strategy: 'allPinned' or 'free'
    this._strategy = null

    // Pin info for global step
    /** @type {Array<{vertexIndex: number, targetX: number, targetY: number}>} */
    this._pins = []

    // IK targets for free mode penalty
    /** @type {Array<{vertexIndex: number, targetX: number, targetY: number}>} */
    this._ikTargets = []

    // Pre-allocated SVD workspace (avoid allocation in localStep)
    this._svdU = new Float32Array(4)
    this._svdS = new Float32Array(2)
    this._svdV = new Float32Array(4)
    this._svdM = new Float32Array(4)

    // Pre-allocated solve output buffer (avoid allocation in globalStep)
    this._solveX = new Float64Array(n)
    this._solveY = new Float64Array(n)
  }

  /**
   * Current deformed vertex positions. Read-only view.
   * Format: [x0, y0, x1, y1, ...]
   *
   * @type {Float32Array}
   */
  get currentPositions() {
    return this._currentPositions
  }

  // ─── TASK-063: Strategy Selection ─────────────────────────────────────────

  /**
   * Set handle targets and select strategy.
   *
   * - If all joints are set (count === meta.jointCount) → allPinned strategy
   * - If subset (IK mode) → free strategy + penalty constraint
   *
   * @param {Map<string, [number, number]>} targets - Map of jointId → [x, y]
   * @param {import('../types/characterData.js').PinMapping} pinMapping
   */
  setHandles(targets, pinMapping) {
    const jointCount = this._charData.meta.jointCount
    const arap = this._charData.arap

    if (targets.size >= jointCount) {
      // All joints pinned → use allPinned Cholesky factor
      this._strategy = 'allPinned'
      this._selectedFactor = arap.choleskyAllPinned

      // Build pin array: all joints mapped to their target positions
      this._pins.length = 0
      this._ikTargets.length = 0
      for (const pin of pinMapping) {
        const target = targets.get(pin.jointId)
        if (target) {
          this._pins.push({
            vertexIndex: pin.vertexIndex,
            targetX: target[0],
            targetY: target[1],
          })
        }
      }
    } else {
      // IK mode → use free Cholesky factor + penalty
      this._strategy = 'free'
      this._selectedFactor = arap.choleskyFree

      this._pins.length = 0
      this._ikTargets.length = 0
      for (const pin of pinMapping) {
        const target = targets.get(pin.jointId)
        if (target) {
          this._ikTargets.push({
            vertexIndex: pin.vertexIndex,
            targetX: target[0],
            targetY: target[1],
          })
        }
      }
    }
  }

  // ─── TASK-064: Local Step (SVD per-vertex) ───────────────────────────────

  /**
   * Compute optimal rotation for each vertex via weighted SVD.
   *
   * For each vertex i:
   *   S_i = Σ_j w_ij × e_ij × e'_ij^T
   *   SVD(S_i) = U × Σ × V^T
   *   R_i = V × U^T (ensuring det ≈ +1)
   *
   * Writes to workspace.rotations (pre-allocated, no new allocation).
   */
  localStep() {
    const { vertices0, vertexCount } = this._charData.geometry
    const { cotWeightsFlat, neighborOffsets, neighborList } = this._charData.arap
    const rotations = this._charData.arap.workspace.rotations
    const current = this._currentPositions

    const U = this._svdU
    const S = this._svdS
    const V = this._svdV
    const M = this._svdM

    for (let i = 0; i < vertexCount; i++) {
      const ix0 = vertices0[i * 2]
      const iy0 = vertices0[i * 2 + 1]
      const ix = current[i * 2]
      const iy = current[i * 2 + 1]

      // Accumulate covariance matrix S (2×2, column-major)
      let s00 = 0, s10 = 0, s01 = 0, s11 = 0

      const start = neighborOffsets[i]
      const end = neighborOffsets[i + 1]

      for (let k = start; k < end; k++) {
        const j = neighborList[k]
        const w = cotWeightsFlat[k]

        // Rest edge: e_ij = rest_j - rest_i
        const ejx0 = vertices0[j * 2] - ix0
        const ejy0 = vertices0[j * 2 + 1] - iy0

        // Current edge: e'_ij = current_j - current_i
        const ejx = current[j * 2] - ix
        const ejy = current[j * 2 + 1] - iy

        // S += w * e_ij * e'_ij^T
        // [s00 s01] += w * [ejx0] * [ejx, ejy]
        // [s10 s11]         [ejy0]
        s00 += w * ejx0 * ejx
        s01 += w * ejx0 * ejy
        s10 += w * ejy0 * ejx
        s11 += w * ejy0 * ejy
      }

      // Store covariance matrix in column-major for SVD
      // Column-major: [m00, m10, m01, m11]
      M[0] = s00; M[1] = s10; M[2] = s01; M[3] = s11

      // SVD: M = U * Σ * V^T
      svd2x2InPlace(U, S, V, M)

      // R_i = V * U^T
      // U^T (column-major transpose): [U[0], U[2], U[1], U[3]]
      const ut00 = U[0], ut01 = U[2], ut10 = U[1], ut11 = U[3]
      // V * U^T (column-major multiply)
      // R[0] = V[0]*UT[0] + V[2]*UT[1]
      // R[1] = V[1]*UT[0] + V[3]*UT[1]
      // R[2] = V[0]*UT[2] + V[2]*UT[3]
      // R[3] = V[1]*UT[2] + V[3]*UT[3]
      rotations[i * 4 + 0] = V[0] * ut00 + V[2] * ut01
      rotations[i * 4 + 1] = V[1] * ut00 + V[3] * ut01
      rotations[i * 4 + 2] = V[0] * ut10 + V[2] * ut11
      rotations[i * 4 + 3] = V[1] * ut10 + V[3] * ut11
    }
  }

  // ─── TASK-065: Global Step (Back Substitution) ──────────────────────────

  /**
   * Solve for new positions via Cholesky back-substitution.
   *
   * Build RHS: b[i] = Σ_j ½ w_ij × (R_i + R_j) × (rest_j - rest_i)
   * Inject pin constraints, then solve L * L^T * x = b.
   *
   * Updates currentPositions in-place.
   */
  globalStep() {
    const { vertices0, vertexCount } = this._charData.geometry
    const { cotWeightsFlat, neighborOffsets, neighborList, workspace } = this._charData.arap
    const rotations = workspace.rotations
    const rhsX = workspace.rhs_x
    const rhsY = workspace.rhs_y
    const current = this._currentPositions
    const factor = this._selectedFactor

    if (!factor) return

    // Zero RHS
    for (let i = 0; i < vertexCount; i++) {
      rhsX[i] = 0
      rhsY[i] = 0
    }

    // Build RHS from rotations
    for (let i = 0; i < vertexCount; i++) {
      const ri00 = rotations[i * 4 + 0]
      const ri10 = rotations[i * 4 + 1]
      const ri01 = rotations[i * 4 + 2]
      const ri11 = rotations[i * 4 + 3]

      const start = neighborOffsets[i]
      const end = neighborOffsets[i + 1]

      for (let k = start; k < end; k++) {
        const j = neighborList[k]
        const w = cotWeightsFlat[k]
        const halfW = 0.5 * w

        // Rest edge (p_i^0 - p_j^0 to match the LHS L matrix definition)
        const ejx0 = vertices0[i * 2] - vertices0[j * 2]
        const ejy0 = vertices0[i * 2 + 1] - vertices0[j * 2 + 1]

        // R_j
        const rj00 = rotations[j * 4 + 0]
        const rj10 = rotations[j * 4 + 1]
        const rj01 = rotations[j * 4 + 2]
        const rj11 = rotations[j * 4 + 3]

        // (R_i + R_j) * e_rest / 2 * w
        // x: halfW * ((ri00 + rj00)*ejx0 + (ri01 + rj01)*ejy0)
        // y: halfW * ((ri10 + rj10)*ejx0 + (ri11 + rj11)*ejy0)
        rhsX[i] += halfW * ((ri00 + rj00) * ejx0 + (ri01 + rj01) * ejy0)
        rhsY[i] += halfW * ((ri10 + rj10) * ejx0 + (ri11 + rj11) * ejy0)
      }
    }

    // Inject constraints
    if (this._strategy === 'allPinned') {
      // Pin vertices: update current array AND set RHS = target position
      for (let p = 0; p < this._pins.length; p++) {
        const pin = this._pins[p]
        current[pin.vertexIndex * 2] = pin.targetX
        current[pin.vertexIndex * 2 + 1] = pin.targetY
        rhsX[pin.vertexIndex] = pin.targetX
        rhsY[pin.vertexIndex] = pin.targetY
      }

      // Add pinned neighbor contributions to unpinned vertices' RHS
      const pinnedVertices = this._charData.arap.pinnedVertices
      for (let i = 0; i < vertexCount; i++) {
        if (pinnedVertices[i]) continue

        const start = neighborOffsets[i]
        const end = neighborOffsets[i + 1]
        for (let k = start; k < end; k++) {
          const j = neighborList[k]
          if (pinnedVertices[j]) {
            const w = cotWeightsFlat[k]
            rhsX[i] += w * current[j * 2]
            rhsY[i] += w * current[j * 2 + 1]
          }
        }
      }
    } else {
      // IK mode: penalty constraint
      // b[pin] += CONSTRAINT_WEIGHT * target
      // (diagonal already has +ε from buildLaplacianFree; we add penalty to it)
      for (let p = 0; p < this._ikTargets.length; p++) {
        const pin = this._ikTargets[p]
        rhsX[pin.vertexIndex] += CONSTRAINT_WEIGHT * pin.targetX
        rhsY[pin.vertexIndex] += CONSTRAINT_WEIGHT * pin.targetY
      }
    }

    // Solve via Cholesky back-substitution
    CholeskyFactor.solve(factor, rhsX, this._solveX)
    CholeskyFactor.solve(factor, rhsY, this._solveY)

    // Update currentPositions from solution
    for (let i = 0; i < vertexCount; i++) {
      current[i * 2] = this._solveX[i]
      current[i * 2 + 1] = this._solveY[i]
    }
  }

  // ─── TASK-066: step() & reset() ─────────────────────────────────────────

  /**
   * Run ARAP iterations: localStep + globalStep, repeated `iterations` times.
   *
   * @param {number} [iterations=2] - Number of ARAP iterations
   * @returns {Float32Array} Current deformed positions
   */
  step(iterations = 2) {
    for (let i = 0; i < iterations; i++) {
      this.localStep()
      this.globalStep()
    }
    return this._currentPositions
  }

  /**
   * Reset current positions to rest pose.
   */
  reset() {
    const rest = this._charData.geometry.vertices0
    for (let i = 0; i < rest.length; i++) {
      this._currentPositions[i] = rest[i]
    }
  }
}
