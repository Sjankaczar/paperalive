// @worker-safe
/**
 * @file ARAPPrecompute.js
 * @description ARAP precomputation: cotangent weights (CSR), Laplacian, dual Cholesky.
 *
 * Pipeline:
 *   1. computeCotWeightsCSR — cotangent weights with mandatory clamping
 *   2. buildLaplacianAllPinned / buildLaplacianFree — sparse Laplacian
 *   3. precomputeARAP — dual Cholesky with uniform fallback
 *
 * Worker-safe: no DOM access.
 *
 * @see architecture/module_design.md — ARAPPrecompute.js
 */

import { SparseMatrix } from './sparse/SparseMatrix.js'
import { CholeskyFactor } from './sparse/CholeskyFactor.js'

const EPS = 1e-6
const MAX_COT = 100
const COT_EPS = 1e-10

// ─── TASK-059: Cotangent Weights (CSR) ───────────────────────────────────────

/**
 * Compute cotangent weights per edge in CSR format.
 *
 * For each edge (i,j) shared by triangles (i,j,k) and (i,j,l):
 *   w_ij = max(ε, ½(clamp(cot α, -MAX_COT, MAX_COT) + clamp(cot β, -MAX_COT, MAX_COT)))
 *
 * @param {import('../types/characterData.js').RawMesh} mesh
 * @returns {{ cotWeightsFlat: Float32Array, neighborOffsets: Int32Array, neighborList: Int32Array }}
 */
export function computeCotWeightsCSR(mesh) {
  const { vertices, triangles, vertexCount } = mesh

  // Collect unique edges and their opposite vertices from triangles
  // edgeKey = min(a,b)*vertexCount + max(a,b)
  // For each edge: store [oppositeVertex1, oppositeVertex2] (up to 2 from shared triangles)
  const edgeOpposite = new Map()

  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2]
    _addOpposite(edgeOpposite, a, b, c, vertexCount)
    _addOpposite(edgeOpposite, b, c, a, vertexCount)
    _addOpposite(edgeOpposite, a, c, b, vertexCount)
  }

  // Build CSR structure using mesh.neighbors for ordering
  const neighborOffsets = new Int32Array(vertexCount + 1)
  const neighborLists = []

  for (let i = 0; i < vertexCount; i++) {
    const nbrs = mesh.neighbors[i] || []
    neighborOffsets[i + 1] = neighborOffsets[i] + nbrs.length
    for (const j of nbrs) {
      neighborLists.push(j)
    }
  }

  const totalEntries = neighborOffsets[vertexCount]
  const neighborList = new Int32Array(neighborLists)
  const cotWeightsFlat = new Float32Array(totalEntries)

  // Compute weight for each (i, neighbor[i][k]) pair
  for (let i = 0; i < vertexCount; i++) {
    const nbrs = mesh.neighbors[i] || []
    const base = neighborOffsets[i]

    for (let k = 0; k < nbrs.length; k++) {
      const j = nbrs[k]
      const key = _edgeKey(i, j, vertexCount)
      const opp = edgeOpposite.get(key)

      if (!opp || opp.length === 0) {
        cotWeightsFlat[base + k] = EPS
        continue
      }

      // Get vertex positions
      const ix = vertices[i * 2], iy = vertices[i * 2 + 1]
      const jx = vertices[j * 2], jy = vertices[j * 2 + 1]

      let cotSum = 0

      // First opposite vertex
      const k0 = opp[0]
      const k0x = vertices[k0 * 2], k0y = vertices[k0 * 2 + 1]
      const cot0 = _cotAbs(k0x, k0y, ix, iy, jx, jy)
      cotSum += Math.max(-MAX_COT, Math.min(MAX_COT, cot0))

      // Second opposite vertex (if edge is shared by two triangles)
      if (opp.length > 1) {
        const k1 = opp[1]
        const k1x = vertices[k1 * 2], k1y = vertices[k1 * 2 + 1]
        const cot1 = _cotAbs(k1x, k1y, ix, iy, jx, jy)
        cotSum += Math.max(-MAX_COT, Math.min(MAX_COT, cot1))
      }

      // Mandatory clamping: w_ij = max(ε, ½(cot α + cot β))
      const w = Math.max(EPS, 0.5 * cotSum)
      cotWeightsFlat[base + k] = w
    }
  }

  return { cotWeightsFlat, neighborOffsets, neighborList }
}

// ─── TASK-060: Laplacian Construction ────────────────────────────────────────

/**
 * Build Laplacian with all pin vertices constrained.
 * L[i][i] = Σw_ij, L[i][j] = -w_ij.
 * Pin rows: L[pin][pin] = 1, off-diagonal = 0.
 *
 * @param {import('../types/characterData.js').RawMesh} mesh
 * @param {{ cotWeightsFlat: Float32Array, neighborOffsets: Int32Array, neighborList: Int32Array }} weights
 * @param {Set<number>} pins - Set of pinned vertex indices
 * @returns {SparseMatrix}
 */
export function buildLaplacianAllPinned(mesh, weights, pins) {
  const n = mesh.vertexCount
  const { cotWeightsFlat, neighborOffsets, neighborList } = weights
  const L = new SparseMatrix(n, n)

  for (let i = 0; i < n; i++) {
    if (pins.has(i)) {
      // Pin row: diagonal = 1, off-diagonal = 0
      L.set(i, i, 1)
      continue
    }

    const start = neighborOffsets[i]
    const end = neighborOffsets[i + 1]
    let diagSum = 0

    for (let k = start; k < end; k++) {
      const j = neighborList[k]
      const w = cotWeightsFlat[k]
      diagSum += w
      // Only set off-diagonal if neighbor is also non-pinned (preserves symmetry)
      if (!pins.has(j)) {
        L.set(i, j, -w)
      }
    }

    L.set(i, i, diagSum + EPS)
  }

  return L
}

/**
 * Build Laplacian without any pin constraints (free mode).
 * L[i][i] = Σw_ij, L[i][j] = -w_ij for all vertices.
 *
 * @param {import('../types/characterData.js').RawMesh} mesh
 * @param {{ cotWeightsFlat: Float32Array, neighborOffsets: Int32Array, neighborList: Int32Array }} weights
 * @returns {SparseMatrix}
 */
export function buildLaplacianFree(mesh, weights) {
  const n = mesh.vertexCount
  const { cotWeightsFlat, neighborOffsets, neighborList } = weights
  const L = new SparseMatrix(n, n)

  for (let i = 0; i < n; i++) {
    const start = neighborOffsets[i]
    const end = neighborOffsets[i + 1]
    let diagSum = 0

    for (let k = start; k < end; k++) {
      const j = neighborList[k]
      const w = cotWeightsFlat[k]
      L.set(i, j, -w)
      diagSum += w
    }

    L.set(i, i, diagSum)
  }

  // Add small regularization to diagonal for positive-definiteness
  // Free Laplacian has a null space (constant vector), so we add ε to each diagonal
  for (let i = 0; i < n; i++) {
    L.add(i, i, EPS)
  }

  return L
}

// ─── TASK-061: Dual Cholesky with Fallback ───────────────────────────────────

/**
 * Precompute ARAP data: cotangent weights, dual Laplacian, dual Cholesky.
 *
 * Fallback strategy:
 *   1. Try cotangent weights → Cholesky
 *   2. If fails: rebuild with uniform weights (w=1) → Cholesky
 *   3. If uniform also fails: return {success: false, errorCode: "CHOLESKY_FAILED"}
 *   4. After successful Cholesky: NaN check → "DEGENERATE_MESH" if NaN found
 *
 * @param {import('../types/characterData.js').RawMesh} mesh
 * @param {import('../types/characterData.js').PinMapping} pinMapping
 * @returns {{ success: true, data: import('../types/characterData.js').ARAPData }
 *          | { success: false, errorCode: string, message: string, affectedStep: string }}
 */
export function precomputeARAP(mesh, pinMapping) {
  const n = mesh.vertexCount

  // Build pin set
  const pinnedVertices = new Array(n).fill(false)
  const pinSet = new Set()
  for (const pin of pinMapping) {
    pinSet.add(pin.vertexIndex)
    pinnedVertices[pin.vertexIndex] = true
  }

  // 1. Try cotangent weights
  let weights = computeCotWeightsCSR(mesh)
  let weightMode = 'cotangent'

  let L_allPinned = buildLaplacianAllPinned(mesh, weights, pinSet)
  let L_free = buildLaplacianFree(mesh, weights)

  let cscAll = L_allPinned.toCSC()
  let resultAll = CholeskyFactor.factorize(cscAll, n)
  let cscFree = L_free.toCSC()
  let resultFree = CholeskyFactor.factorize(cscFree, n)

  // 2. Fallback to uniform weights if either Cholesky fails
  if (!resultAll.success || !resultFree.success) {
    weights = computeUniformWeightsCSR(mesh)
    weightMode = 'uniform'

    L_allPinned = buildLaplacianAllPinned(mesh, weights, pinSet)
    L_free = buildLaplacianFree(mesh, weights)

    cscAll = L_allPinned.toCSC()
    resultAll = CholeskyFactor.factorize(cscAll, n)
    cscFree = L_free.toCSC()
    resultFree = CholeskyFactor.factorize(cscFree, n)

    // If uniform also fails
    if (!resultAll.success || !resultFree.success) {
      return {
        success: false,
        errorCode: 'CHOLESKY_FAILED',
        message: `Cholesky factorization failed even with uniform weights: ${resultAll.reason || resultFree.reason}`,
        affectedStep: 'ARAPPrecompute',
      }
    }
  }

  // Set weight mode on factors
  const factorAll = resultAll.factor
  const factorFree = resultFree.factor
  factorAll.weightMode = weightMode
  factorFree.weightMode = weightMode

  // 4. NaN sentinel check
  if (CholeskyFactor.checkNaN(factorAll) || CholeskyFactor.checkNaN(factorFree)) {
    return {
      success: false,
      errorCode: 'DEGENERATE_MESH',
      message: 'NaN detected in Cholesky factor values after factorization',
      affectedStep: 'ARAPPrecompute',
    }
  }

  // Build workspace arrays
  const workspace = {
    rotations: new Float32Array(4 * n),
    rhs_x: new Float64Array(n),
    rhs_y: new Float64Array(n),
    outlineNormals: new Float32Array(2 * n),
    interleavedBuffer: new Float32Array(6 * n),
  }

  // Build ARAP data
  const arapData = {
    cotWeightsFlat: weights.cotWeightsFlat,
    neighborOffsets: weights.neighborOffsets,
    neighborList: weights.neighborList,
    laplacianSparse: {
      rows: cscAll.rowIdx,
      cols: cscAll.colPtr,
      vals: cscAll.vals,
      n,
    },
    pinnedVertices,
    choleskyAllPinned: factorAll,
    choleskyFree: factorFree,
    workspace,
  }

  return { success: true, data: arapData }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Compute uniform weights (w_ij = 1 for all edges) in CSR format.
 *
 * @param {import('../types/characterData.js').RawMesh} mesh
 * @returns {{ cotWeightsFlat: Float32Array, neighborOffsets: Int32Array, neighborList: Int32Array }}
 */
function computeUniformWeightsCSR(mesh) {
  const { vertexCount, neighbors } = mesh

  const neighborOffsets = new Int32Array(vertexCount + 1)
  const neighborLists = []

  for (let i = 0; i < vertexCount; i++) {
    const nbrs = neighbors[i] || []
    neighborOffsets[i + 1] = neighborOffsets[i] + nbrs.length
    for (const j of nbrs) {
      neighborLists.push(j)
    }
  }

  const totalEntries = neighborOffsets[vertexCount]
  const neighborList = new Int32Array(neighborLists)
  const cotWeightsFlat = new Float32Array(totalEntries)

  // All weights = 1
  cotWeightsFlat.fill(1.0)

  return { cotWeightsFlat, neighborOffsets, neighborList }
}

/**
 * Add opposite vertex for edge (a, b) with opposite vertex c.
 *
 * @param {Map<number, number[]>} edgeMap
 * @param {number} a
 * @param {number} b
 * @param {number} c - Opposite vertex
 * @param {number} n - Vertex count (for key hashing)
 */
function _addOpposite(edgeMap, a, b, c, n) {
  const key = _edgeKey(a, b, n)
  let arr = edgeMap.get(key)
  if (!arr) {
    arr = []
    edgeMap.set(key, arr)
  }
  if (arr.length < 2 && !arr.includes(c)) {
    arr.push(c)
  }
}

/**
 * Compute cotangent of angle at vertex a in triangle (a, b, c),
 * using absolute cross product for orientation independence.
 * cot(α) = (ab · ac) / |ab × ac|
 *
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} cx
 * @param {number} cy
 * @returns {number}
 */
function _cotAbs(ax, ay, bx, by, cx, cy) {
  const abx = bx - ax, aby = by - ay
  const acx = cx - ax, acy = cy - ay
  const dotProd = abx * acx + aby * acy
  const crossMag = Math.abs(abx * acy - aby * acx)
  if (crossMag < COT_EPS) {
    return dotProd >= 0 ? MAX_COT : -MAX_COT
  }
  return dotProd / crossMag
}

/**
 * Compute canonical edge key.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} n
 * @returns {number}
 */
function _edgeKey(a, b, n) {
  const lo = a < b ? a : b
  const hi = a < b ? b : a
  return lo * n + hi
}
