// @worker-safe
/**
 * @file SkeletonMapper.js
 * @description Map skeleton joints to mesh vertices using nearest-neighbor
 *              matching with BFS uniqueness enforcement.
 *
 * Pipeline:
 *   1. For each joint, find the nearest vertex (Euclidean distance)
 *   2. Enforce uniqueness: no two joints map to the same vertexIndex
 *   3. If collision: BFS from used vertex to find nearest unused vertex
 *   4. Add isTooFar flag: true if distance > 20px
 *
 * Worker-safe: no DOM access.
 *
 * @see architecture/module_design.md — SkeletonMapper.js
 */

const TOO_FAR_THRESHOLD = 20

/**
 * Map joint positions to mesh vertices with uniqueness enforcement.
 *
 * @param {Float32Array} vertices - Mesh vertices [x0,y0, x1,y1, ...]
 * @param {import('../types/characterData.js').JointPositionList} jointPositions
 * @returns {import('../types/characterData.js').PinMapping}
 */
export function mapJointsToVertices(vertices, jointPositions) {
  const vertexCount = vertices.length / 2

  // Build adjacency from vertex proximity for BFS
  // We use a simple approach: precompute neighbor lists based on mesh connectivity
  // Since we don't have explicit adjacency here, we use k-nearest neighbors
  const adjacency = buildAdjacency(vertices, vertexCount)

  const usedVertices = new Set()
  const result = []

  // Sort joints by distance to nearest vertex (closest first for better assignment)
  const sortedJoints = jointPositions.map((joint, idx) => {
    const nearestIdx = findNearestVertex(vertices, vertexCount, joint.x, joint.y)
    const dist = euclideanDist(
      joint.x, joint.y,
      vertices[nearestIdx * 2], vertices[nearestIdx * 2 + 1]
    )
    return { joint, idx, nearestIdx, dist }
  })
  sortedJoints.sort((a, b) => a.dist - b.dist)

  // Assign vertices greedily, then resolve collisions with BFS
  const assignments = new Array(jointPositions.length)

  for (const { idx, nearestIdx } of sortedJoints) {
    let assignedIdx

    if (!usedVertices.has(nearestIdx)) {
      assignedIdx = nearestIdx
    } else {
      // BFS from nearest vertex to find nearest unused vertex
      assignedIdx = bfsFindUnused(nearestIdx, adjacency, usedVertices, vertexCount)
    }

    usedVertices.add(assignedIdx)
    assignments[idx] = assignedIdx
  }

  // Build result in original order
  for (let i = 0; i < jointPositions.length; i++) {
    const joint = jointPositions[i]
    const vertexIdx = assignments[i]
    const vx = vertices[vertexIdx * 2]
    const vy = vertices[vertexIdx * 2 + 1]
    const distance = euclideanDist(joint.x, joint.y, vx, vy)

    result.push({
      jointId: joint.id,
      vertexIndex: vertexIdx,
      distance,
      isTooFar: distance > TOO_FAR_THRESHOLD,
    })
  }

  return result
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Find the nearest vertex to a point.
 *
 * @param {Float32Array} vertices
 * @param {number} vertexCount
 * @param {number} px
 * @param {number} py
 * @returns {number} vertex index
 */
function findNearestVertex(vertices, vertexCount, px, py) {
  let bestIdx = 0
  let bestDist = Infinity

  for (let i = 0; i < vertexCount; i++) {
    const vx = vertices[i * 2]
    const vy = vertices[i * 2 + 1]
    const d = (px - vx) * (px - vx) + (py - vy) * (py - vy)
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }

  return bestIdx
}

/**
 * BFS from a start vertex to find the nearest unused vertex.
 *
 * @param {number} startIdx - Starting vertex index
 * @param {number[][]} adjacency - Adjacency list
 * @param {Set<number>} usedVertices - Already assigned vertices
 * @param {number} vertexCount
 * @returns {number} Unused vertex index
 */
function bfsFindUnused(startIdx, adjacency, usedVertices, vertexCount) {
  const visited = new Set()
  const queue = [startIdx]
  visited.add(startIdx)

  let head = 0
  while (head < queue.length) {
    const current = queue[head++]

    if (!usedVertices.has(current)) {
      return current
    }

    const neighbors = adjacency[current]
    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i]
      if (!visited.has(n)) {
        visited.add(n)
        queue.push(n)
      }
    }
  }

  // Fallback: find any unused vertex (shouldn't happen if vertexCount >= jointCount)
  for (let i = 0; i < vertexCount; i++) {
    if (!usedVertices.has(i)) return i
  }

  // Absolute fallback: return startIdx (mesh is full)
  return startIdx
}

/**
 * Build adjacency list based on vertex proximity.
 * Uses k-nearest neighbors (k=8) to approximate mesh connectivity.
 *
 * @param {Float32Array} vertices
 * @param {number} vertexCount
 * @returns {number[][]}
 */
function buildAdjacency(vertices, vertexCount) {
  const K = 8
  const adj = new Array(vertexCount)

  for (let i = 0; i < vertexCount; i++) {
    const ix = vertices[i * 2]
    const iy = vertices[i * 2 + 1]

    // Find K nearest neighbors
    const dists = new Array(vertexCount)
    for (let j = 0; j < vertexCount; j++) {
      const dx = ix - vertices[j * 2]
      const dy = iy - vertices[j * 2 + 1]
      dists[j] = dx * dx + dy * dy
    }

    // Partial sort: find K smallest
    const indices = []
    const used = new Set()
    for (let k = 0; k < K && k < vertexCount - 1; k++) {
      let bestIdx = -1
      let bestDist = Infinity
      for (let j = 0; j < vertexCount; j++) {
        if (j === i || used.has(j)) continue
        if (dists[j] < bestDist) {
          bestDist = dists[j]
          bestIdx = j
        }
      }
      if (bestIdx >= 0) {
        indices.push(bestIdx)
        used.add(bestIdx)
      }
    }

    adj[i] = indices
  }

  return adj
}

/**
 * Euclidean distance between two points.
 */
function euclideanDist(x1, y1, x2, y2) {
  const dx = x1 - x2
  const dy = y1 - y2
  return Math.sqrt(dx * dx + dy * dy)
}
