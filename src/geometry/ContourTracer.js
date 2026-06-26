// @worker-safe
/**
 * @file ContourTracer.js
 * @description Moore-Neighbor tracing for binary masks.
 *
 * - Finds the largest connected component (by pixel count, 4-connectivity)
 * - Traces its outer boundary using Moore-Neighbor (8-connectivity) tracing
 * - Returns a closed polygon of {x, y} points
 *
 * Worker-safe: no DOM access.
 *
 * @see architecture/module_design.md — ContourTracer.js
 */

/** @type {number[]} 8-neighbor dx offsets (clockwise from east) */
const DX8 = [1, 1, 0, -1, -1, -1, 0, 1]
/** @type {number[]} 8-neighbor dy offsets (clockwise from east) */
const DY8 = [0, -1, -1, -1, 0, 1, 1, 1]

/** 4-connectivity neighbor offsets */
const DX4 = [0, 0, -1, 1]
const DY4 = [-1, 1, 0, 0]

/**
 * Trace the outer contour of a BinaryMask.
 * If multiple components exist, traces only the largest (by pixel count).
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @returns {Array<{x: number, y: number}>} Closed polygon boundary points
 */
export function traceContour(mask) {
  const { data, width, height } = mask

  // Find the largest connected component
  const componentMask = getLargestComponent(data, width, height)

  // Find start pixel: top-leftmost foreground pixel in the component
  let startX = -1
  let startY = -1
  for (let y = 0; y < height && startX === -1; y++) {
    for (let x = 0; x < width; x++) {
      if (componentMask[y * width + x] === 1) {
        startX = x
        startY = y
        break
      }
    }
  }

  if (startX === -1) return []

  // Moore-Neighbor tracing
  return mooreNeighborTrace(componentMask, width, height, startX, startY)
}

// ─── Largest Component ───────────────────────────────────────────────────────

/**
 * Find the largest connected component (4-connectivity, by pixel count).
 * Returns a new Uint8Array mask containing only the largest component.
 *
 * @param {Uint8Array} data
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
function getLargestComponent(data, width, height) {
  const visited = new Uint8Array(width * height)

  let bestStart = -1
  let bestCount = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (data[idx] === 0 || visited[idx]) continue

      // Fresh queue per component — shared queue caused count inflation across components
      const queue = [idx]
      visited[idx] = 1
      let head = 0
      let count = 0

      while (head < queue.length) {
        const curr = queue[head++]
        count++
        const cx = curr % width
        const cy = (curr - cx) / width

        for (let d = 0; d < 4; d++) {
          const nx = cx + DX4[d]
          const ny = cy + DY4[d]
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const nIdx = ny * width + nx
          if (visited[nIdx] || data[nIdx] === 0) continue
          visited[nIdx] = 1
          queue.push(nIdx)
        }
      }

      if (count > bestCount) {
        bestCount = count
        bestStart = idx
      }
    }
  }

  // Build mask of the largest component by re-BFS from bestStart
  const result = new Uint8Array(width * height)
  if (bestStart === -1) return result

  result[bestStart] = 1
  const bq = [bestStart]
  const seen = new Uint8Array(width * height)
  seen[bestStart] = 1
  let bHead = 0

  while (bHead < bq.length) {
    const curr = bq[bHead++]
    const cx = curr % width
    const cy = (curr - cx) / width

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX4[d]
      const ny = cy + DY4[d]
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const nIdx = ny * width + nx
      if (seen[nIdx] || data[nIdx] === 0) continue
      seen[nIdx] = 1
      result[nIdx] = 1
      bq.push(nIdx)
    }
  }

  return result
}

// ─── Moore-Neighbor Tracing ──────────────────────────────────────────────────

/**
 * Moore-Neighbor boundary tracing (8-connectivity).
 *
 * @param {Uint8Array} compMask - Mask of the component to trace
 * @param {number} width
 * @param {number} height
 * @param {number} startX - Top-left foreground pixel x
 * @param {number} startY - Top-left foreground pixel y
 * @returns {Array<{x: number, y: number}>}
 */
function mooreNeighborTrace(compMask, width, height, startX, startY) {
  const contour = []

  // Start: enter from below (direction 5 = south → check from east = 0)
  let x = startX
  let y = startY
  let dir = 6 // came from south (entering from below), check starting from east+1

  let steps = 0
  const maxSteps = width * height * 4 // safety limit

  do {
    contour.push({ x, y })

    // Search for next foreground neighbor starting from (dir+5) % 8
    // (turn back the way we came, then scan clockwise)
    let found = false
    const startDir = (dir + 5) % 8

    for (let i = 0; i < 8; i++) {
      const checkDir = (startDir + i) % 8
      const nx = x + DX8[checkDir]
      const ny = y + DY8[checkDir]

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (compMask[ny * width + nx] === 1) {
          x = nx
          y = ny
          dir = checkDir
          found = true
          break
        }
      }
    }

    if (!found) break // isolated pixel

    steps++
    if (steps > maxSteps) break
  } while (x !== startX || y !== startY)

  // Ensure closed polygon: first === last
  if (contour.length > 0) {
    const first = contour[0]
    const last = contour[contour.length - 1]
    if (first.x !== last.x || first.y !== last.y) {
      contour.push({ x: first.x, y: first.y })
    }
  }

  // Remove consecutive duplicates
  const deduped = [contour[0]]
  for (let i = 1; i < contour.length; i++) {
    const prev = deduped[deduped.length - 1]
    if (contour[i].x !== prev.x || contour[i].y !== prev.y) {
      deduped.push(contour[i])
    }
  }

  return deduped
}
