// @worker-safe
/**
 * @file MorphologicalCleaner.js
 * @description Clean binary mask from noise before contour tracing.
 *
 * Operations (in order):
 *   1. Morphological Closing (dilate → erode, 3×3 kernel): fills small gaps
 *   2. Flood Fill from edges (4-connectivity): removes foreground connected to border
 *   3. Hole Filling from centroid (4-connectivity): fills interior holes
 *   4. Guard: foreground < 3% → MASK_TOO_SMALL
 *
 * Worker-safe: no DOM access.
 *
 * @see architecture/module_design.md — MorphologicalCleaner.js
 */

const MIN_FOREGROUND_RATIO = 0.03

/**
 * Clean a binary mask from noise.
 *
 * @param {import('../types/characterData.js').BinaryMask} mask
 * @returns {{ success: true, data: import('../types/characterData.js').BinaryMask }
 *          | { success: false, errorCode: 'MASK_TOO_SMALL', message: string }}
 */
export function cleanMask(mask) {
  const { width, height } = mask
  let data = new Uint8Array(mask.data)

  // Step 1: Morphological closing (dilate → erode)
  data = dilate(data, width, height)
  data = erode(data, width, height)

  // Step 2: Flood fill from edges — remove foreground touching borders
  data = floodFillFromEdges(data, width, height)

  // Step 3: Hole filling from foreground centroid
  data = fillHoles(data, width, height)

  // Step 4: Guard check — foreground < 3% → MASK_TOO_SMALL
  let fgCount = 0
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 1) fgCount++
  }

  if (fgCount / (width * height) < MIN_FOREGROUND_RATIO) {
    return {
      success: false,
      errorCode: 'MASK_TOO_SMALL',
      message: `Foreground is only ${((fgCount / (width * height)) * 100).toFixed(1)}% of image (minimum 3%)`,
    }
  }

  return { success: true, data: { data, width, height } }
}

// ─── Morphological Operations ────────────────────────────────────────────────

/**
 * Dilate with 3×3 kernel: pixel becomes 1 if ANY of its 8-neighbors (or self) is 1.
 */
function dilate(src, width, height) {
  const dst = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let found = false
      for (let dy = -1; dy <= 1 && !found; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1 && !found; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          if (src[ny * width + nx] === 1) found = true
        }
      }
      dst[y * width + x] = found ? 1 : 0
    }
  }
  return dst
}

/**
 * Erode with 3×3 kernel: pixel becomes 1 only if ALL of its 8-neighbors (and self) are 1.
 * Out-of-bounds pixels are treated as foreground (preserves edge pixels).
 */
function erode(src, width, height) {
  const dst = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let allSet = true
      for (let dy = -1; dy <= 1 && allSet; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue // treat out-of-bounds as set
        for (let dx = -1; dx <= 1 && allSet; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue // treat out-of-bounds as set
          if (src[ny * width + nx] === 0) allSet = false
        }
      }
      dst[y * width + x] = allSet ? 1 : 0
    }
  }
  return dst
}

// ─── Flood Fill Operations ───────────────────────────────────────────────────

/** 4-connectivity neighbor offsets: up, down, left, right */
const DX4 = [0, 0, -1, 1]
const DY4 = [-1, 1, 0, 0]

/**
 * Flood fill from all edge pixels through foreground pixels (4-connectivity).
 * All foreground pixels connected to the edge are set to 0 (background).
 */
function floodFillFromEdges(data, width, height) {
  const result = new Uint8Array(data)
  const visited = new Uint8Array(width * height)
  const queue = []

  // Seed from all 4 edges
  for (let x = 0; x < width; x++) {
    // Top edge
    if (result[x] === 1) { queue.push(x); visited[x] = 1 }
    // Bottom edge
    const bIdx = (height - 1) * width + x
    if (result[bIdx] === 1) { queue.push(bIdx); visited[bIdx] = 1 }
  }
  for (let y = 1; y < height - 1; y++) {
    // Left edge
    const lIdx = y * width
    if (result[lIdx] === 1) { queue.push(lIdx); visited[lIdx] = 1 }
    // Right edge
    const rIdx = y * width + width - 1
    if (result[rIdx] === 1) { queue.push(rIdx); visited[rIdx] = 1 }
  }

  // BFS through 4-connected foreground pixels
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    result[idx] = 0

    const cx = idx % width
    const cy = (idx - cx) / width

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX4[d]
      const ny = cy + DY4[d]
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const nIdx = ny * width + nx
      if (visited[nIdx]) continue
      if (result[nIdx] === 0) continue
      visited[nIdx] = 1
      queue.push(nIdx)
    }
  }

  return result
}

/**
 * Fill holes: flood fill from boundary background pixels (4-connectivity) to find
 * all exterior background. Then set any remaining interior background to foreground.
 */
function fillHoles(data, width, height) {
  const result = new Uint8Array(data)
  const isExterior = new Uint8Array(width * height)
  const queue = []

  // Seed from all edge pixels that are background (0)
  for (let x = 0; x < width; x++) {
    if (result[x] === 0) { queue.push(x); isExterior[x] = 1 }
    const bIdx = (height - 1) * width + x
    if (result[bIdx] === 0) { queue.push(bIdx); isExterior[bIdx] = 1 }
  }
  for (let y = 1; y < height - 1; y++) {
    const lIdx = y * width
    if (result[lIdx] === 0) { queue.push(lIdx); isExterior[lIdx] = 1 }
    const rIdx = y * width + width - 1
    if (result[rIdx] === 0) { queue.push(rIdx); isExterior[rIdx] = 1 }
  }

  // BFS through 4-connected background pixels
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]
    const cx = idx % width
    const cy = (idx - cx) / width

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX4[d]
      const ny = cy + DY4[d]
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const nIdx = ny * width + nx
      if (isExterior[nIdx]) continue
      if (result[nIdx] === 1) continue // foreground blocks
      isExterior[nIdx] = 1
      queue.push(nIdx)
    }
  }

  // All background pixels NOT marked exterior are interior holes → fill them
  for (let i = 0; i < result.length; i++) {
    if (result[i] === 0 && isExterior[i] === 0) {
      result[i] = 1
    }
  }

  return result
}
