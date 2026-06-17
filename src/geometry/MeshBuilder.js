// @worker-safe
/**
 * @file MeshBuilder.js
 * @description Build a triangulated mesh from boundary contour + interior points.
 *
 * Pipeline:
 *   1. Pre-filter: remove points < 1.5px apart (prioritize boundary)
 *   2. Delaunay triangulation via Delaunator
 *   3. Post-filter: remove triangles with area < 0.5 px² or centroid outside mask
 *   4. Compute UV coords, adjacency, boundary flags, centroid
 *   5. Guard: vertexCount < 15 → MESH_TOO_SPARSE
 *
 * Worker-safe: no DOM access.
 *
 * @see architecture/module_design.md — MeshBuilder.js
 */

import Delaunator from 'delaunator'

const MIN_EDGE_DIST = 1.5
const MIN_AREA = 0.5
const MIN_VERTEX_COUNT = 15

/**
 * Build a triangulated mesh from boundary and interior points.
 *
 * @param {Array<{x: number, y: number}>} boundary - Simplified contour points
 * @param {Array<{x: number, y: number}>} interior - Interior sample points
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {{ success: true, data: import('../types/characterData.js').RawMesh }
 *          | { success: false, errorCode: 'MESH_TOO_SPARSE', message: string, affectedStep: string }}
 */
export function buildMesh(boundary, interior, mask, width, height) {
  // 1. Pre-filter: remove close points
  const filtered = prefilter(boundary, interior)

  if (filtered.length < 3) {
    return {
      success: false,
      errorCode: 'MESH_TOO_SPARSE',
      message: `Only ${filtered.length} points after pre-filter (minimum 3 for triangulation)`,
      affectedStep: 'MeshBuilder',
    }
  }

  // 2. Delaunay triangulation
  const coords = new Float64Array(filtered.length * 2)
  for (let i = 0; i < filtered.length; i++) {
    coords[i * 2] = filtered[i].x
    coords[i * 2 + 1] = filtered[i].y
  }

  const delaunay = new Delaunator(coords)
  const rawTriangles = delaunay.triangles

  // 3. Post-filter: area and mask checks
  const validTriangles = postfilter(rawTriangles, coords, mask.data, width, height)

  // Collect vertices used by valid triangles
  const usedVertices = new Set()
  for (let i = 0; i < validTriangles.length; i++) {
    usedVertices.add(validTriangles[i])
  }

  const vertexCount = usedVertices.size

  // Guard: vertexCount < 15
  if (vertexCount < MIN_VERTEX_COUNT) {
    return {
      success: false,
      errorCode: 'MESH_TOO_SPARSE',
      message: `Only ${vertexCount} vertices after filtering (minimum ${MIN_VERTEX_COUNT})`,
      affectedStep: 'MeshBuilder',
    }
  }

  // Build compact vertex array (remap indices)
  const sortedVerts = Array.from(usedVertices).sort((a, b) => a - b)
  const remap = new Map()
  const vertices = new Float32Array(sortedVerts.length * 2)

  for (let i = 0; i < sortedVerts.length; i++) {
    const oldIdx = sortedVerts[i]
    remap.set(oldIdx, i)
    vertices[i * 2] = coords[oldIdx * 2]
    vertices[i * 2 + 1] = coords[oldIdx * 2 + 1]
  }

  // Remap triangle indices
  const triangles = new Uint16Array(validTriangles.length)
  for (let i = 0; i < validTriangles.length; i++) {
    triangles[i] = remap.get(validTriangles[i])
  }

  const triangleCount = triangles.length / 3

  // UV coordinates
  const uvCoords = new Float32Array(vertexCount * 2)
  for (let i = 0; i < vertexCount; i++) {
    uvCoords[i * 2] = vertices[i * 2] / width
    uvCoords[i * 2 + 1] = vertices[i * 2 + 1] / height
  }

  // Adjacency list
  const neighbors = buildAdjacency(triangles, vertexCount)

  // Boundary flags
  const isBoundary = buildBoundaryFlags(vertices, boundary, vertexCount)

  // Centroid
  let cx = 0
  let cy = 0
  for (let i = 0; i < vertexCount; i++) {
    cx += vertices[i * 2]
    cy += vertices[i * 2 + 1]
  }
  const centroid = [cx / vertexCount, cy / vertexCount]

  // Build RawMesh
  const rawMesh = {
    vertices,
    triangles,
    uvCoords,
    neighbors,
    isBoundary,
    vertexCount,
    triangleCount,
    width,
    height,
    centroid,
    vertexBudgetExceeded: vertexCount > 400,
  }

  return { success: true, data: rawMesh }
}

// ─── Pre-filter ──────────────────────────────────────────────────────────────

/**
 * Remove points that are too close together (< MIN_EDGE_DIST).
 * Boundary points are always kept. Interior points too close to existing points are removed.
 *
 * @param {Array<{x: number, y: number}>} boundary
 * @param {Array<{x: number, y: number}>} interior
 * @returns {Array<{x: number, y: number}>}
 */
function prefilter(boundary, interior) {
  // Keep all boundary points
  const result = boundary.slice()

  // Check each interior point against existing points
  for (let i = 0; i < interior.length; i++) {
    const ip = interior[i]
    let tooClose = false

    for (let j = 0; j < result.length; j++) {
      const dx = ip.x - result[j].x
      const dy = ip.y - result[j].y
      if (dx * dx + dy * dy < MIN_EDGE_DIST * MIN_EDGE_DIST) {
        tooClose = true
        break
      }
    }

    if (!tooClose) {
      result.push(ip)
    }
  }

  return result
}

// ─── Post-filter ─────────────────────────────────────────────────────────────

/**
 * Filter triangles: remove those with area < MIN_AREA or centroid outside mask.
 *
 * @param {Uint32Array} triangles - Delaunay triangle indices (3 per triangle)
 * @param {Float64Array} coords - Vertex coordinates
 * @param {Uint8Array} maskData - Binary mask data
 * @param {number} width
 * @param {number} height
 * @returns {number[]} Filtered triangle indices
 */
function postfilter(triangles, coords, maskData, width, height) {
  const result = []

  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i]
    const b = triangles[i + 1]
    const c = triangles[i + 2]

    const ax = coords[a * 2], ay = coords[a * 2 + 1]
    const bx = coords[b * 2], by = coords[b * 2 + 1]
    const cx = coords[c * 2], cy = coords[c * 2 + 1]

    // Area check
    const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2
    if (area < MIN_AREA) continue

    // Centroid mask check
    const centX = Math.round((ax + bx + cx) / 3)
    const centY = Math.round((ay + by + cy) / 3)
    if (centX < 0 || centX >= width || centY < 0 || centY >= height) continue
    if (maskData[centY * width + centX] !== 1) continue

    result.push(a, b, c)
  }

  return result
}

// ─── Adjacency ───────────────────────────────────────────────────────────────

/**
 * Build adjacency list from triangle indices.
 * neighbors[i] = array of vertex indices sharing an edge with vertex i.
 *
 * @param {Uint16Array} triangles
 * @param {number} vertexCount
 * @returns {number[][]}
 */
function buildAdjacency(triangles, vertexCount) {
  const adj = new Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) {
    adj[i] = []
  }

  const addEdge = (a, b) => {
    if (!adj[a].includes(b)) adj[a].push(b)
    if (!adj[b].includes(a)) adj[b].push(a)
  }

  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i]
    const b = triangles[i + 1]
    const c = triangles[i + 2]
    addEdge(a, b)
    addEdge(b, c)
    addEdge(c, a)
  }

  return adj
}

// ─── Boundary Flags ──────────────────────────────────────────────────────────

/**
 * Determine which vertices are on the mesh boundary.
 * A vertex is a boundary vertex if it appears in the simplified contour.
 *
 * @param {Float32Array} vertices - [x0,y0, x1,y1, ...]
 * @param {Array<{x: number, y: number}>} boundary - Simplified contour
 * @param {number} vertexCount
 * @returns {boolean[]}
 */
function buildBoundaryFlags(vertices, boundary, vertexCount) {
  // Build a set of boundary point keys for fast lookup
  const boundarySet = new Set()
  for (const p of boundary) {
    boundarySet.add(`${p.x},${p.y}`)
  }

  const flags = new Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) {
    const key = `${vertices[i * 2]},${vertices[i * 2 + 1]}`
    flags[i] = boundarySet.has(key)
  }

  return flags
}
