/**
 * @file integration.test.js
 * @description Integration test: BinaryMask → CharacterData (TASK-081).
 *
 * Runs the full preprocessing pipeline directly (no Worker) from a BinaryMask
 * fixture to a complete CharacterData object.
 *
 * Acceptance criteria:
 *   - geometry.vertexCount ≤ 400
 *   - arap.choleskyAllPinned present, no NaN
 *   - arap.choleskyFree present, no NaN
 *   - pinMapping.length === 14 (humanoid)
 *   - total time < 5000ms
 */

import { describe, it, expect } from 'vitest'
import { runPreprocessingPipeline } from './workers/preprocessing.worker.js'
import { estimateSkeleton } from '../skeleton/SkeletonEstimator.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Create an oval binary mask for testing.
 * @param {number} width
 * @param {number} height
 * @returns {import('../types/characterData.js').BinaryMask}
 */
function makeOvalMask(width = 128, height = 192) {
  const data = new Uint8Array(width * height)
  const cx = width / 2
  const cy = height / 2
  const rx = width * 0.38
  const ry = height * 0.38

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1.0) {
        data[y * width + x] = 1
      }
    }
  }

  return { data, width, height }
}

/**
 * Create 14 humanoid joint positions for an oval mask.
 * @param {number} width
 * @param {number} height
 * @returns {import('../types/characterData.js').JointPositionList}
 */
function makeHumanoidJoints(width = 128, height = 192) {
  const bbox = { top: height * 0.12, left: width * 0.12, width: width * 0.76, height: height * 0.76 }
  const centerX = width / 2

  const proportions = [
    ['head', 0.05, 0.0],
    ['neck', 0.15, 0.0],
    ['l_shoulder', 0.20, -0.15],
    ['r_shoulder', 0.20, 0.15],
    ['l_elbow', 0.40, -0.22],
    ['r_elbow', 0.40, 0.22],
    ['l_wrist', 0.55, -0.18],
    ['r_wrist', 0.55, 0.18],
    ['l_hip', 0.58, -0.10],
    ['r_hip', 0.58, 0.10],
    ['l_knee', 0.78, -0.08],
    ['r_knee', 0.78, 0.08],
    ['l_ankle', 0.95, -0.08],
    ['r_ankle', 0.95, 0.08],
  ]

  return proportions.map(([id, yRatio, xOffsetRatio]) => ({
    id,
    x: Math.round(centerX + xOffsetRatio * bbox.width),
    y: Math.round(bbox.top + yRatio * bbox.height),
  }))
}

/**
 * Check that no NaN or Infinity exists in a CholeskyFactor.
 * @param {CholeskyFactor} factor
 * @returns {boolean} true if clean (no NaN/Infinity)
 */
function isFactorClean(factor) {
  for (let i = 0; i < factor.lowerL_vals.length; i++) {
    if (!Number.isFinite(factor.lowerL_vals[i])) return false
  }
  return true
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TASK-081: Integration — BinaryMask → CharacterData', () => {
  it('full pipeline: oval mask → valid CharacterData', () => {
    const width = 128
    const height = 192
    const mask = makeOvalMask(width, height)
    const joints = makeHumanoidJoints(width, height)

    const startTime = performance.now()

    const result = runPreprocessingPipeline(
      mask,
      joints,
      'humanoid',
      400,    // vertexBudget
      1.0,    // dpEpsilonMin
    )

    const elapsed = performance.now() - startTime

    // Pipeline should succeed
    expect(result.error).toBeUndefined()
    expect(result.charData).toBeDefined()

    const charData = result.charData

    // Acceptance criterion: vertexCount ≤ 400
    expect(charData.geometry.vertexCount).toBeLessThanOrEqual(400)
    expect(charData.geometry.vertexCount).toBeGreaterThanOrEqual(15)

    // Acceptance criterion: choleskyAllPinned present and no NaN
    expect(charData.arap.choleskyAllPinned).toBeDefined()
    expect(charData.arap.choleskyAllPinned.lowerL_vals).toBeDefined()
    expect(isFactorClean(charData.arap.choleskyAllPinned)).toBe(true)

    // Acceptance criterion: choleskyFree present and no NaN
    expect(charData.arap.choleskyFree).toBeDefined()
    expect(charData.arap.choleskyFree.lowerL_vals).toBeDefined()
    expect(isFactorClean(charData.arap.choleskyFree)).toBe(true)

    // Acceptance criterion: pinMapping.length === 14 (humanoid)
    expect(charData.pinMapping.length).toBe(14)

    // Acceptance criterion: time < 5000ms
    expect(elapsed).toBeLessThan(5000)

    // Additional checks: meta
    expect(charData.meta.characterType).toBe('humanoid')
    expect(charData.meta.jointCount).toBe(14)
    expect(charData.meta.version).toBe('2.0')
    expect(charData.meta.stats.vertexCount).toBe(charData.geometry.vertexCount)

    // Geometry integrity
    expect(charData.geometry.vertices0).toBeInstanceOf(Float32Array)
    expect(charData.geometry.verticesCurrent).toBeInstanceOf(Float32Array)
    expect(charData.geometry.triangles).toBeInstanceOf(Uint16Array)
    expect(charData.geometry.uvCoords).toBeInstanceOf(Float32Array)
    expect(charData.geometry.vertices0.length).toBe(charData.geometry.vertexCount * 2)
    expect(charData.geometry.triangles.length).toBe(charData.geometry.triangleCount * 3)

    // ARAP CSR data
    expect(charData.arap.cotWeightsFlat).toBeInstanceOf(Float32Array)
    expect(charData.arap.neighborOffsets).toBeInstanceOf(Int32Array)
    expect(charData.arap.neighborList).toBeInstanceOf(Int32Array)

    // Workspace pre-allocated
    expect(charData.arap.workspace.rotations).toBeInstanceOf(Float32Array)
    expect(charData.arap.workspace.rhs_x).toBeInstanceOf(Float64Array)
    expect(charData.arap.workspace.rhs_y).toBeInstanceOf(Float64Array)
  })

  it('pipeline with auto-estimated skeleton joints', () => {
    const width = 128
    const height = 192
    const mask = makeOvalMask(width, height)

    // Use SkeletonEstimator for automatic joint placement
    const joints = estimateSkeleton(mask)
    expect(joints.length).toBe(14)

    const result = runPreprocessingPipeline(mask, joints, 'humanoid', 400, 1.0)
    expect(result.error).toBeUndefined()
    expect(result.charData).toBeDefined()
    expect(result.charData.pinMapping.length).toBe(14)
    expect(result.charData.geometry.vertexCount).toBeLessThanOrEqual(400)
  })

  it('pipeline error: mask too small → MASK_TOO_SMALL', () => {
    // 4×4 mask with only 2 foreground pixels — too small after cleaning
    const data = new Uint8Array(16)
    data[5] = 1
    data[10] = 1
    const mask = { data, width: 4, height: 4 }

    const result = runPreprocessingPipeline(mask, [], 'freeform', 400, 1.0)
    expect(result.error).toBeDefined()
    expect(result.error.errorCode).toBe('MASK_TOO_SMALL')
  })

  it('vertex budget enforcement keeps vertexCount ≤ 400', () => {
    // Use a larger mask that might produce many vertices
    const width = 200
    const height = 300
    const mask = makeOvalMask(width, height)
    const joints = estimateSkeleton(mask)

    const result = runPreprocessingPipeline(mask, joints, 'humanoid', 400, 0.5)
    expect(result.error).toBeUndefined()
    expect(result.charData.geometry.vertexCount).toBeLessThanOrEqual(400)
    expect(result.charData.meta.stats.dpEpsilon).toBeGreaterThan(0)
  })
})
