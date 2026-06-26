// @worker-safe
/**
 * @file ThresholdEngine.js
 * @description Smart background segmentation for paper characters.
 *
 * Adaptive border-sampling + two-pass BFS flood fill.
 * No DOM access — worker-safe.
 */

import { morphologicalClose } from '../geometry/MorphologicalCleaner.js'

const DX4 = [0, 0, -1, 1]
const DY4 = [-1, 1, 0, 0]

/**
 * Automatically detect and mark background pixels in a paper character image.
 *
 * Algorithm:
 *   1. Background color from corner patches (avoids eating limbs at image edges)
 *   2. Adaptive tolerance from corner variance, clamped [20, 60]
 *   3. BFS flood fill from all border pixels — seeded only where color matches bg
 *      (character limbs touching the border are protected by color distance check)
 *   4. Double morphological close to smooth edges and fill small gaps
 *
 * Caller should follow with keepSignificantComponents() to preserve all body parts.
 *
 * @param {ImageData} imageData
 * @returns {import('../types/characterData.js').BinaryMask}
 */
export function autoEraseBackground(imageData) {
  const { width, height, data } = imageData
  const size = width * height

  // 1. Background color from corner patches
  const bg = cornerBgColor(data, width, height)

  // 2. Adaptive tolerance from corner variance, range [30, 65]
  // Floor 30: catches JPEG-noisy off-white paper; ceiling 65: won't eat colored character pixels
  const variance = cornerVariance(data, width, height, bg)
  const tolerance = Math.min(65, Math.max(30, Math.sqrt(variance) * 1.1))
  const tolSq = tolerance * tolerance

  // 3. BFS from all border pixels
  const isBg = new Uint8Array(size)
  const queue = []

  const tryAdd = (idx) => {
    if (!isBg[idx] && colorDistSq(data, idx, bg) <= tolSq) {
      isBg[idx] = 1
      queue.push(idx)
    }
  }
  for (let x = 0; x < width; x++) {
    tryAdd(x)
    tryAdd((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y++) {
    tryAdd(y * width)
    tryAdd(y * width + width - 1)
  }

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
      if (isBg[nIdx]) continue
      if (colorDistSq(data, nIdx, bg) <= tolSq) {
        isBg[nIdx] = 1
        queue.push(nIdx)
      }
    }
  }

  // 4. Build foreground mask + double morphological close
  const mask = new Uint8Array(size)
  for (let i = 0; i < size; i++) mask[i] = isBg[i] ? 0 : 1

  let result = morphologicalClose({ data: mask, width, height })
  result = morphologicalClose(result)
  return result
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Median background color sampled from the four corner patches.
 * Characters rarely occupy all four corners, so corners give reliable bg samples.
 */
function cornerBgColor(data, width, height) {
  const patch = Math.max(8, Math.floor(Math.min(width, height) * 0.08))
  const rs = [], gs = [], bs = []
  const push = (x, y) => {
    const p = (y * width + x) * 4
    rs.push(data[p]); gs.push(data[p + 1]); bs.push(data[p + 2])
  }
  for (let y = 0; y < patch; y++) {
    for (let x = 0; x < patch; x++) {
      push(x, y);                          push(width - 1 - x, y)
      push(x, height - 1 - y);            push(width - 1 - x, height - 1 - y)
    }
  }
  rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b)
  const mid = rs.length >> 1
  return [rs[mid], gs[mid], bs[mid]]
}

/** Average squared distance from corner pixels to bg — measures background uniformity. */
function cornerVariance(data, width, height, bg) {
  const patch = Math.max(8, Math.floor(Math.min(width, height) * 0.08))
  let sum = 0, n = 0
  const add = (x, y) => { sum += colorDistSq(data, y * width + x, bg); n++ }
  for (let y = 0; y < patch; y++) {
    for (let x = 0; x < patch; x++) {
      add(x, y);                       add(width - 1 - x, y)
      add(x, height - 1 - y);         add(width - 1 - x, height - 1 - y)
    }
  }
  return sum / n
}

/** Squared Euclidean RGB distance (avoids sqrt per pixel). */
function colorDistSq(data, idx, bg) {
  const p = idx * 4
  const dr = data[p] - bg[0]
  const dg = data[p + 1] - bg[1]
  const db = data[p + 2] - bg[2]
  return dr * dr + dg * dg + db * db
}
