// @worker-safe
/**
 * @file preprocessing.worker.js
 * @description Web Worker entry point for the full preprocessing pipeline.
 *
 * Pipeline:
 *   MorphologicalCleaner → ContourTracer → PolySimplifier →
 *   InteriorSampler → MeshBuilder → SkeletonMapper → ARAPPrecompute
 *
 * Communication protocol:
 *   Input:  { alphaMask: ArrayBuffer, jointPositions, imageWidth, imageHeight, characterType, options? }
 *   Output: { type: "progress", step, value } | { type: "result", charData, ...transferables }
 *           | { type: "error", errorCode, message, affectedStep }
 *
 * @see architecture/module_design.md — preprocessing.worker.js
 */

import { cleanMask } from '../../geometry/MorphologicalCleaner.js'
import { traceContour } from '../../geometry/ContourTracer.js'
import { simplifyContour } from '../../geometry/PolySimplifier.js'
import { sampleInterior } from '../../geometry/InteriorSampler.js'
import { buildMesh } from '../../geometry/MeshBuilder.js'
import { mapJointsToVertices } from '../../skeleton/SkeletonMapper.js'
import { precomputeARAP } from '../../arap/ARAPPrecompute.js'
import { getMaskBoundingBox } from '../../utils/bbox.js'
import { CHARACTER_DATA_VERSION } from '../../types/characterData.js'

const DEFAULT_VERTEX_BUDGET = 800
const DEFAULT_EPSILON_MIN = 1.0
const MAX_BUDGET_ITERATIONS = 20

// ─── Worker Message Handler (TASK-074) ───────────────────────────────────────

self.onmessage = function (e) {
  try {
    const { alphaMask, jointPositions, imageWidth, imageHeight, characterType, options } = e.data

    const mask = {
      data: new Uint8Array(alphaMask),
      width: imageWidth,
      height: imageHeight,
    }

    const vertexBudget = (options && options.vertexBudget) || DEFAULT_VERTEX_BUDGET
    const dpEpsilonMin = (options && options.dpEpsilonMin) || DEFAULT_EPSILON_MIN

    const result = runPreprocessingPipeline(
      mask,
      jointPositions,
      characterType,
      vertexBudget,
      dpEpsilonMin,
    )

    if (result.error) {
      self.postMessage(result.error, [])
      return
    }

    // Serialize and send result with Transferable TypedArrays (TASK-076/078)
    const { charData, transferables } = serializeForTransfer(result.charData)
    self.postMessage({ type: 'result', charData }, transferables)
  } catch (err) {
    self.postMessage({
      type: 'error',
      errorCode: 'WORKER_CRASHED',
      message: err.message || String(err),
      affectedStep: 'worker',
    })
  }
}

// ─── Pipeline Core (TASK-075/076/077) ────────────────────────────────────────

/**
 * Run the full preprocessing pipeline.
 * Exported for integration testing without Worker overhead.
 *
 * @param {import('../../types/characterData.js').BinaryMask} mask
 * @param {import('../../types/characterData.js').JointPositionList} jointPositions
 * @param {string} characterType
 * @param {number} vertexBudget
 * @param {number} dpEpsilonMin
 * @returns {{ charData: Object } | { error: Object }}
 */
export function runPreprocessingPipeline(mask, jointPositions, characterType, vertexBudget, dpEpsilonMin) {
  const startTime = performance.now()

  // Step 1: Morphological cleaning (TASK-075)
  sendProgress('cleaning', 0.1)
  const cleanResult = cleanMask(mask)
  if (!cleanResult.success) {
    return {
      error: {
        type: 'error',
        errorCode: cleanResult.errorCode,
        message: cleanResult.message,
        affectedStep: 'MorphologicalCleaner',
      },
    }
  }
  const cleanedMask = cleanResult.data

  // Step 2: Contour tracing (TASK-075)
  sendProgress('contouring', 0.2)
  const rawContour = traceContour(cleanedMask)

  if (rawContour.length < 3) {
    return {
      error: {
        type: 'error',
        errorCode: 'MESH_TOO_SPARSE',
        message: 'Contour has fewer than 3 points after tracing',
        affectedStep: 'ContourTracer',
      },
    }
  }

  // Step 3: PolySimplifier with vertex budget enforcement (TASK-077)
  const bbox = getMaskBoundingBox(cleanedMask)

  const budgetResult = enforceVertexBudget(
    rawContour,
    cleanedMask,
    bbox,
    vertexBudget,
    dpEpsilonMin,
  )
  const simplified = budgetResult.simplified
  const epsilonUsed = budgetResult.epsilonUsed

  // Step 4: Interior sampling + Mesh building (TASK-075)
  sendProgress('meshing', 0.5)
  const interior = sampleInterior(cleanedMask, simplified, bbox)
  const meshResult = buildMesh(
    simplified,
    interior,
    cleanedMask,
    mask.width,
    mask.height,
  )

  if (!meshResult.success) {
    return {
      error: {
        type: 'error',
        errorCode: meshResult.errorCode,
        message: meshResult.message,
        affectedStep: meshResult.affectedStep || 'MeshBuilder',
      },
    }
  }
  const mesh = meshResult.data

  // Step 5: Skeleton mapping (TASK-076)
  sendProgress('skeleton', 0.6)
  const pinMapping = mapJointsToVertices(mesh.vertices, jointPositions)

  // Step 6: ARAP precomputation (TASK-076)
  sendProgress('arap', 0.8)
  const arapResult = precomputeARAP(mesh, pinMapping)

  if (!arapResult.success) {
    return {
      error: {
        type: 'error',
        errorCode: arapResult.errorCode,
        message: arapResult.message,
        affectedStep: arapResult.affectedStep || 'ARAPPrecompute',
      },
    }
  }

  sendProgress('arap', 1.0)

  // Assemble CharacterData
  const preprocessMs = performance.now() - startTime
  const charData = assembleCharacterData(
    mesh,
    arapResult.data,
    pinMapping,
    jointPositions,
    characterType,
    mask.width,
    mask.height,
    epsilonUsed,
    rawContour.length,
    preprocessMs,
  )

  return { charData }
}

// ─── Vertex Budget Enforcement (TASK-077) ────────────────────────────────────

/**
 * Adaptively increase epsilon until total vertex count ≤ vertexBudget.
 * Maximum MAX_BUDGET_ITERATIONS iterations to prevent infinite loops.
 *
 * @param {Array<{x: number, y: number}>} rawContour
 * @param {import('../../types/characterData.js').BinaryMask} mask
 * @param {{top: number, left: number, width: number, height: number}} bbox
 * @param {number} vertexBudget
 * @param {number} dpEpsilonMin
 * @returns {{ simplified: Array<{x: number, y: number}>, epsilonUsed: number }}
 */
function enforceVertexBudget(rawContour, mask, bbox, vertexBudget, dpEpsilonMin) {
  let epsilon = dpEpsilonMin
  let simplified = simplifyContour(rawContour, epsilon)
  let iterations = 0

  while (iterations < MAX_BUDGET_ITERATIONS) {
    const interior = sampleInterior(mask, simplified, bbox)
    const totalPoints = simplified.length + interior.length

    if (totalPoints <= vertexBudget) break

    epsilon *= 1.3
    simplified = simplifyContour(rawContour, epsilon)
    iterations++
  }

  return { simplified, epsilonUsed: epsilon }
}

// ─── CharacterData Assembly ──────────────────────────────────────────────────

/**
 * Assemble the full CharacterData object from pipeline outputs.
 *
 * @param {import('../../types/characterData.js').RawMesh} mesh
 * @param {Object} arapData
 * @param {import('../../types/characterData.js').PinMapping} pinMapping
 * @param {import('../../types/characterData.js').JointPositionList} jointPositions
 * @param {string} characterType
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {number} dpEpsilon
 * @param {number} contourPoints
 * @param {number} preprocessMs
 * @returns {Object} CharacterData
 */
function assembleCharacterData(
  mesh,
  arapData,
  pinMapping,
  jointPositions,
  characterType,
  imageWidth,
  imageHeight,
  dpEpsilon,
  contourPoints,
  preprocessMs,
) {
  const n = mesh.vertexCount

  return {
    meta: {
      version: CHARACTER_DATA_VERSION,
      createdAt: Date.now(),
      characterType,
      jointCount: jointPositions.length,
      stats: {
        vertexCount: n,
        triangleCount: mesh.triangleCount,
        contourPoints,
        dpEpsilon,
        preprocessMs,
      },
      name: '',
    },
    image: {
      idbKey: '',
      width: imageWidth,
      height: imageHeight,
    },
    geometry: {
      vertices0: mesh.vertices,
      verticesCurrent: new Float32Array(mesh.vertices),
      vertexCount: n,
      triangles: mesh.triangles,
      triangleCount: mesh.triangleCount,
      uvCoords: mesh.uvCoords,
      neighbors: mesh.neighbors,
      isBoundary: mesh.isBoundary,
    },
    pinMapping,
    arap: arapData,
  }
}

// ─── Serialization for Transferable (TASK-076) ──────────────────────────────

/**
 * Serialize CholeskyFactor to a plain object with TypedArrays.
 *
 * @param {import('../../arap/sparse/CholeskyFactor.js').CholeskyFactor} factor
 * @returns {Object}
 */
function serializeFactor(factor) {
  return {
    lowerL_colPtr: factor.lowerL_colPtr,
    lowerL_rowIdx: factor.lowerL_rowIdx,
    lowerL_vals: factor.lowerL_vals,
    nnz: factor.nnz,
    n: factor.n,
    weightMode: factor.weightMode,
  }
}

/**
 * Convert CharacterData into a form suitable for postMessage with Transferable.
 * Collects all TypedArray buffers for zero-copy transfer.
 *
 * @param {Object} charData
 * @returns {{ charData: Object, transferables: ArrayBuffer[] }}
 */
function serializeForTransfer(charData) {
  const transferables = []

  // Geometry TypedArrays
  transferables.push(charData.geometry.vertices0.buffer)
  transferables.push(charData.geometry.verticesCurrent.buffer)
  transferables.push(charData.geometry.triangles.buffer)
  transferables.push(charData.geometry.uvCoords.buffer)

  // ARAP CSR TypedArrays
  transferables.push(charData.arap.cotWeightsFlat.buffer)
  transferables.push(charData.arap.neighborOffsets.buffer)
  transferables.push(charData.arap.neighborList.buffer)

  // Laplacian sparse TypedArrays
  transferables.push(charData.arap.laplacianSparse.rows.buffer)
  transferables.push(charData.arap.laplacianSparse.cols.buffer)
  transferables.push(charData.arap.laplacianSparse.vals.buffer)

  // Workspace TypedArrays
  transferables.push(charData.arap.workspace.rotations.buffer)
  transferables.push(charData.arap.workspace.rhs_x.buffer)
  transferables.push(charData.arap.workspace.rhs_y.buffer)
  transferables.push(charData.arap.workspace.outlineNormals.buffer)
  transferables.push(charData.arap.workspace.interleavedBuffer.buffer)

  // Cholesky factors — serialize to plain objects
  charData.arap.choleskyAllPinned = serializeFactor(charData.arap.choleskyAllPinned)
  charData.arap.choleskyFree = serializeFactor(charData.arap.choleskyFree)

  // Add Cholesky TypedArrays to transferables
  transferables.push(charData.arap.choleskyAllPinned.lowerL_colPtr.buffer)
  transferables.push(charData.arap.choleskyAllPinned.lowerL_rowIdx.buffer)
  transferables.push(charData.arap.choleskyAllPinned.lowerL_vals.buffer)
  transferables.push(charData.arap.choleskyFree.lowerL_colPtr.buffer)
  transferables.push(charData.arap.choleskyFree.lowerL_rowIdx.buffer)
  transferables.push(charData.arap.choleskyFree.lowerL_vals.buffer)

  return { charData, transferables }
}

// ─── Progress Helper ─────────────────────────────────────────────────────────

/**
 * Send a progress event to the main thread.
 *
 * @param {string} step
 * @param {number} value - 0.0 to 1.0
 */
function sendProgress(step, value) {
  try {
    self.postMessage({ type: 'progress', step, value })
  } catch {
    // In non-Worker contexts (e.g. jsdom), postMessage may require different args
  }
}
