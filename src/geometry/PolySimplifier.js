// @worker-safe
/**
 * @file PolySimplifier.js
 * @description Douglas-Peucker contour simplification with adaptive epsilon.
 *
 * - simplifyContour(contour, epsilon) — standard Douglas-Peucker
 * - adaptiveSimplify(contour, maxPoints, minEps) — increase epsilon until ≤ maxPoints
 *
 * Worker-safe: no DOM access.
 *
 * @see architecture/module_design.md — PolySimplifier.js
 */

/**
 * Simplify a contour using Douglas-Peucker algorithm.
 *
 * @param {Array<{x: number, y: number}>} contour - Ordered array of points (closed polygon)
 * @param {number} epsilon - Maximum perpendicular distance threshold
 * @returns {Array<{x: number, y: number}>} Simplified contour
 */
export function simplifyContour(contour, epsilon) {
  if (contour.length <= 2) return contour.slice()
  if (epsilon <= 0) return contour.slice()

  return douglasPeucker(contour, 0, contour.length - 1, epsilon)
}

/**
 * Adaptive simplification: increase epsilon until point count ≤ maxPoints.
 * Maximum 20 iterations to prevent infinite loops.
 *
 * @param {Array<{x: number, y: number}>} contour
 * @param {number} maxPoints - Target maximum point count
 * @param {number} minEps - Starting epsilon value
 * @returns {{ simplified: Array<{x: number, y: number}>, epsilonUsed: number }}
 */
export function adaptiveSimplify(contour, maxPoints, minEps) {
  let epsilon = minEps
  let simplified = simplifyContour(contour, epsilon)
  let iterations = 0

  while (simplified.length > maxPoints && iterations < 20) {
    epsilon *= 1.5
    simplified = simplifyContour(contour, epsilon)
    iterations++
  }

  return { simplified, epsilonUsed: epsilon }
}

// ─── Internal: Douglas-Peucker Recursive ─────────────────────────────────────

/**
 * Recursive Douglas-Peucker on a segment of the contour.
 *
 * @param {Array<{x: number, y: number}>} points
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {number} epsilon
 * @returns {Array<{x: number, y: number}>}
 */
function douglasPeucker(points, startIdx, endIdx, epsilon) {
  if (endIdx - startIdx < 2) {
    return points.slice(startIdx, endIdx + 1)
  }

  // Find the point with maximum distance from the line (start → end)
  let maxDist = 0
  let maxIdx = startIdx

  const p0 = points[startIdx]
  const p1 = points[endIdx]

  for (let i = startIdx + 1; i < endIdx; i++) {
    const d = perpendicularDistance(points[i], p0, p1)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    // Recurse on both halves
    const left = douglasPeucker(points, startIdx, maxIdx, epsilon)
    const right = douglasPeucker(points, maxIdx, endIdx, epsilon)
    // Merge (avoid duplicating the split point)
    return left.concat(right.slice(1))
  }

  // All intermediate points are within epsilon — discard them
  return [p0, p1]
}

/**
 * Perpendicular distance from point p to the line segment (a, b).
 *
 * @param {{x: number, y: number}} p
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @returns {number}
 */
function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) {
    // a and b are the same point
    const ex = p.x - a.x
    const ey = p.y - a.y
    return Math.sqrt(ex * ex + ey * ey)
  }

  // Distance = |cross product| / |line length|
  const cross = Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x))
  return cross / Math.sqrt(lenSq)
}
